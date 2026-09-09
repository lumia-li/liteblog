import type { RowDataPacket } from "mysql2";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { createUser, findUserByEmail, findUserByUsername, pool } from "../db.ts";
import { env } from "../env.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";
import { hit } from "../rate-limit.ts";
import { getClientIp, isValidPassword, isValidUsername, safeEqualHex, sha256Hex } from "../util.ts";

const router = Router();

type VerificationRow = RowDataPacket & {
	id: number;
	email: string;
	purpose: string;
	token_hash: string;
	user_id: number | null;
	consumed: number;
	expires_at: Date;
};

type Body = { token?: unknown; password?: unknown; username?: unknown };

/**
 * POST /email/set-password
 * 凭一次性 token 完成注册（创建用户）。
 * body: { token, password, username? }
 */
router.post("/set-password", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");

	const token = typeof body.token === "string" ? body.token.trim() : "";
	const password = typeof body.password === "string" ? body.password : "";
	const rawUsername = typeof body.username === "string" ? body.username.trim() : "";

	if (!/^[0-9a-f]{64}$/.test(token)) return fail(res, 400, "链接无效或已失效");

	// 防爆破：同 IP 20 次/小时
	if (!hit(`setpw:${getClientIp(req)}`, 20, 60 * 60 * 1000)) {
		return fail(res, 429, "尝试次数过多，请稍后再试");
	}

	try {
		const [rows] = await pool.execute<VerificationRow[]>(
			"SELECT * FROM email_verifications WHERE token_hash = ? LIMIT 1",
			[sha256Hex(token)],
		);
		const row = rows[0];
		if (!row || row.consumed === 1) return fail(res, 400, "链接无效或已被使用");
		if (new Date(row.expires_at).getTime() < Date.now()) {
			return fail(res, 400, "链接已过期，请重新发送验证码");
		}

		// 原子置为已消费，防并发重复建号
		const [update] = await pool.execute(
			"UPDATE email_verifications SET consumed = 1 WHERE id = ? AND consumed = 0",
			[row.id],
		);
		if ((update as { affectedRows?: number }).affectedRows !== 1) {
			return fail(res, 400, "链接无效或已被使用");
		}

		if (row.purpose === "change-email") {
			// 换绑邮箱：更新目标用户邮箱
			const targetId = row.user_id;
			if (!targetId) return fail(res, 400, "链接缺少用户信息");
			const dup = await findUserByEmail(row.email);
			if (dup) return fail(res, 409, "该邮箱已被其他账号使用");
			await pool.execute("UPDATE users SET email = ? WHERE id = ?", [row.email, targetId]);
			const [updated] = await pool.execute<RowDataPacket[]>(
				"SELECT * FROM users WHERE id = ? LIMIT 1",
				[targetId],
			);
			const user = updated[0];
			return ok(res, {
				purpose: "change-email",
				user: user
					? {
							id: String(user.id),
							username: user.username,
							email: user.email,
							display_name: user.display_name || user.username,
							avatar_url: user.avatar_url,
							role: user.role,
						}
					: null,
			});
		}

		// 注册：创建用户（密码/用户名校验仅注册场景需要）
		if (!isValidPassword(password)) {
			return fail(res, 400, "密码长度需在 8-64 位之间");
		}
		if (rawUsername && !isValidUsername(rawUsername)) {
			return fail(res, 400, "用户名限 1-24 位，支持中文、字母、数字、下划线和连字符");
		}
		const email = row.email;
		const existing = await findUserByEmail(email);
		if (existing) return fail(res, 409, "该邮箱已注册，请直接登录");

		let username = rawUsername || email.split("@")[0].slice(0, 24) || "user";
		if (await findUserByUsername(username)) username = ""; // 冲突则交给 createUser 自动加后缀
		const passwordHash = await bcrypt.hash(password, 12);
		const user = await createUser({ email, username: username || `user_${Date.now() % 10000}`, passwordHash });

		return ok(res, {
			purpose: "register",
			accessTokenMaxAgeDays: env.sessionDays,
			user: {
				id: user.id,
				username: user.username,
				email: user.email,
				display_name: user.display_name || user.username,
				avatar_url: user.avatar_url,
				role: user.role,
			},
		});
	} catch (error) {
		console.error("[set-password] 设置密码失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

export default router;
