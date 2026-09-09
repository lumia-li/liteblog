import type { RowDataPacket } from "mysql2";
import { Router } from "express";
import { pool } from "../db.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";
import { generateToken, safeEqualHex, sha256Hex } from "../util.ts";

const router = Router();

type Body = { email?: unknown; code?: unknown; purpose?: unknown };
type VerificationRow = RowDataPacket & {
	id: number;
	email: string;
	purpose: string;
	code_hash: string;
	token_hash: string;
	user_id: number | null;
	verified: number;
	consumed: number;
	expires_at: Date;
};

/**
 * POST /email/verify-code
 * 弹窗内提交 6 位验证码；通过后将该记录的 token 更新为新签发的令牌并返回，
 * 前端凭 token 跳转 /auth/set-password 设置密码（与邮件链接中的 token 等价）。
 * body: { email, code, purpose: "register" | "change-email" }
 */
router.post("/verify-code", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");

	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const code = typeof body.code === "string" ? body.code.trim() : "";
	const purpose = body.purpose === "change-email" ? "change-email" : "register";

	if (!/^\d{6}$/.test(code)) return fail(res, 400, "验证码格式不正确");

	// 校验失败限流：同邮箱 10 次 / 10 分钟
	if (!hitVerify(email)) {
		return fail(res, 429, "尝试次数过多，请 10 分钟后再试");
	}

	try {
		const [rows] = await pool.execute<VerificationRow[]>(
			`SELECT * FROM email_verifications
			 WHERE email = ? AND purpose = ? AND consumed = 0
			 ORDER BY id DESC LIMIT 1`,
			[email, purpose],
		);
		const row = rows[0];
		if (!row) return fail(res, 400, "请先获取验证码");

		if (new Date(row.expires_at).getTime() < Date.now()) {
			return fail(res, 400, "验证码已过期，请重新获取");
		}

		if (row.verified === 0) {
			if (!safeEqualHex(sha256Hex(code), row.code_hash)) {
				return fail(res, 400, "验证码不正确");
			}
		}

		// 验证通过：签发新的设密码令牌并绑定到该记录
		const { token, tokenHash } = generateToken();
		await pool.execute(
			"UPDATE email_verifications SET verified = 1, token_hash = ?, expires_at = GREATEST(expires_at, NOW()) WHERE id = ?",
			[tokenHash, row.id],
		);
		return ok(res, {
			token,
			expiresInSeconds: Math.max(
				0,
				Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000),
			),
		});
	} catch (error) {
		console.error("[verify-code] 校验失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/**
 * GET /email/check-token?token=xxx
 * 邮件链接落地页（/auth/set-password）加载时校验 token 是否有效
 */
router.get("/check-token", async (req, res) => {
	const token = String(req.query.token || "").trim();
	if (!/^[0-9a-f]{64}$/.test(token)) return fail(res, 400, "链接无效或已失效");
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
		return ok(res, {
			email: row.email,
			purpose: row.purpose,
			verified: row.verified === 1,
		});
	} catch (error) {
		console.error("[check-token] 校验失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

export default router;

/* ── 校验失败限流（内存） ── */
const verifyBuckets = new Map<string, { count: number; resetAt: number }>();
function hitVerify(email: string): boolean {
	const now = Date.now();
	const key = `verify:${email}`;
	const bucket = verifyBuckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		verifyBuckets.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
		return true;
	}
	if (bucket.count >= 10) return false;
	bucket.count += 1;
	return true;
}
