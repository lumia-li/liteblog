import type { RowDataPacket } from "mysql2";
import { Router } from "express";
import bcrypt from "bcryptjs";
import {
	findUserByEmail,
	findUserById,
	findUserByUsername,
	pool,
	toPublicUser,
} from "../db.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";
import { isValidPassword, isValidUsername, sha256Hex, safeEqualHex } from "../util.ts";

const router = Router();

type Body = Record<string, unknown>;

function parseUserId(value: unknown): string | null {
	const id = typeof value === "string" ? value.trim() : "";
	return /^\d{1,10}$/.test(id) ? id : null;
}

/**
 * PATCH /account/username
 * 修改用户名。body: { userId, username }
 */
router.patch("/username", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");
	const userId = parseUserId(body.userId);
	const username = typeof body.username === "string" ? body.username.trim() : "";
	if (!userId) return fail(res, 400, "缺少用户标识");
	if (!isValidUsername(username)) {
		return fail(res, 400, "用户名限 1-24 位，支持中文、字母、数字、下划线和连字符");
	}
	try {
		const user = await findUserById(userId);
		if (!user) return fail(res, 404, "用户不存在");
		if (user.username !== username && (await findUserByUsername(username))) {
			return fail(res, 409, "该用户名已被占用");
		}
		await pool.execute("UPDATE users SET username = ?, display_name = ? WHERE id = ?", [
			username,
			username,
			userId,
		]);
		return ok(res, { user: toPublicUser({ ...user, username, display_name: username }) });
	} catch (error) {
		console.error("[account/username] 修改用户名失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/**
 * POST /account/email/verify
 * 换绑邮箱第二步：凭新邮箱的验证码完成换绑。
 * body: { userId, newEmail, code }
 */
router.post("/email/verify", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");
	const userId = parseUserId(body.userId);
	const newEmail = typeof body.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
	const code = typeof body.code === "string" ? body.code.trim() : "";
	if (!userId) return fail(res, 400, "缺少用户标识");
	if (!/^\d{6}$/.test(code)) return fail(res, 400, "验证码格式不正确");

	try {
		const user = await findUserById(userId);
		if (!user) return fail(res, 404, "用户不存在");

		// 找到该用户最近一条 change-email 验证记录
		const [rows] = await pool.execute<RowDataPacket[]>(
			`SELECT * FROM email_verifications
			 WHERE email = ? AND purpose = 'change-email' AND user_id = ? AND consumed = 0
			 ORDER BY id DESC LIMIT 1`,
			[newEmail, Number(userId)],
		);
		const row = rows[0] as
			| { id: number; code_hash: string; verified: number; consumed: number; expires_at: Date }
			| undefined;
		if (!row) return fail(res, 400, "请先获取验证码");
		if (new Date(row.expires_at).getTime() < Date.now()) {
			return fail(res, 400, "验证码已过期，请重新获取");
		}
		if (row.verified === 0 && !safeEqualHex(sha256Hex(code), row.code_hash)) {
			return fail(res, 400, "验证码不正确");
		}

		// 原子消费 + 改邮箱
		const [update] = await pool.execute(
			"UPDATE email_verifications SET consumed = 1, verified = 1 WHERE id = ? AND consumed = 0",
			[row.id],
		);
		if ((update as { affectedRows?: number }).affectedRows !== 1) {
			return fail(res, 400, "验证码已被使用，请重新获取");
		}
		const dup = await findUserByEmail(newEmail);
		if (dup) return fail(res, 409, "该邮箱已被其他账号使用");

		await pool.execute("UPDATE users SET email = ? WHERE id = ?", [newEmail, userId]);
		return ok(res, { user: toPublicUser({ ...user, email: newEmail }) });
	} catch (error) {
		console.error("[account/email] 换绑邮箱失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/**
 * POST /account/password
 * 修改密码（需验证旧密码）。body: { userId, currentPassword, newPassword }
 */
router.post("/password", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");
	const userId = parseUserId(body.userId);
	const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
	const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
	if (!userId) return fail(res, 400, "缺少用户标识");
	if (!isValidPassword(newPassword)) {
		return fail(res, 400, "新密码长度需在 8-64 位之间");
	}
	if (currentPassword === newPassword) {
		return fail(res, 400, "新密码不能与旧密码相同");
	}
	try {
		const user = await findUserById(userId);
		if (!user) return fail(res, 404, "用户不存在");
		if (!user.password_hash) return fail(res, 400, "该账号未设置密码");

		const valid = await bcrypt.compare(currentPassword, user.password_hash);
		if (!valid) return fail(res, 401, "当前密码不正确");

		const passwordHash = await bcrypt.hash(newPassword, 12);
		await pool.execute("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, userId]);
		return ok(res, {});
	} catch (error) {
		console.error("[account/password] 修改密码失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/**
 * GET /account/me?userId=xxx
 * 读取邮箱账号信息（供博客代理接口刷新用户数据）
 */
router.get("/me", async (req, res) => {
	const userId = parseUserId(req.query.userId);
	if (!userId) return fail(res, 400, "缺少用户标识");
	try {
		const user = await findUserById(userId);
		if (!user) return fail(res, 404, "用户不存在");
		return ok(res, { user: toPublicUser(user) });
	} catch (error) {
		console.error("[account/me] 读取失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

export default router;
