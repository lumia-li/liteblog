import type { RowDataPacket } from "mysql2";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { findUserByEmail, pool, toPublicUser } from "../db.ts";
import { env } from "../env.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";
import { hit } from "../rate-limit.ts";
import { getClientIp } from "../util.ts";
import { decryptSecret, verifyCode } from "../totp.ts";

const router = Router();

type Body = { email?: unknown; password?: unknown; totpCode?: unknown };
type AttemptRow = RowDataPacket & { fail_count: number; lock_seconds: number | null };

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

/**
 * POST /email/login
 * 邮箱 + 密码登录；连续失败 5 次锁定 15 分钟。
 */
router.post("/login", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");

	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body.password === "string" ? body.password : "";
	const totpCode = typeof body.totpCode === "string" ? body.totpCode.trim() : "";

	if (!email || !password) return fail(res, 400, "请填写邮箱和密码");

	// IP 维度粗限流：60 次/小时
	if (!hit(`login:${getClientIp(req)}`, 60, 60 * 60 * 1000)) {
		return fail(res, 429, "尝试次数过多，请一小时后再试");
	}

	try {
		// 锁定检查：剩余秒数交给数据库用 NOW() 计算。
		// locked_until 是 TIMESTAMP，由 NOW() 写入（数据库本地时区），
		// 若取回 Node 再比较，mysql2 会按 UTC 解析，导致差一个时区（锁定时间被放大 8 小时）。
		const [attempts] = await pool.execute<AttemptRow[]>(
			`SELECT fail_count,
			        IF(locked_until IS NOT NULL AND locked_until > NOW(),
			           TIMESTAMPDIFF(SECOND, NOW(), locked_until), 0) AS lock_seconds
			 FROM login_attempts WHERE email = ? LIMIT 1`,
			[email],
		);
		const lockSeconds = Number(attempts[0]?.lock_seconds ?? 0);
		if (lockSeconds > 0) {
			const minutes = Math.max(1, Math.ceil(lockSeconds / 60));
			return fail(res, 429, `失败次数过多，账号已锁定，请 ${minutes} 分钟后再试`);
		}

		const user = await findUserByEmail(email);
		const valid = user && user.status === "active"
			? await bcrypt.compare(password, user.password_hash)
			: false;

		if (!user || !valid) {
			await recordFail(email);
			return fail(res, 401, "邮箱或密码不正确");
		}

		// 密码正确后再检查 TOTP，避免泄露账号是否启用二次验证。
		const [totpRows] = await pool.execute<RowDataPacket[]>(
			"SELECT secret_ciphertext, enabled FROM user_totp WHERE user_id = ? LIMIT 1",
			[user.id],
		);
		const totp = totpRows[0];
		if (totp && Number(totp.enabled) === 1) {
			if (!/^\d{6}$/.test(totpCode)) return fail(res, 401, "请输入双因素验证码", { code: "TOTP_REQUIRED" });
			if (!verifyCode(decryptSecret(String(totp.secret_ciphertext)), totpCode)) {
				return fail(res, 401, "双因素验证码不正确", { code: "TOTP_INVALID" });
			}
		}

		// 登录成功：清空失败计数，并记录最近一次登录时间
		await pool.execute("DELETE FROM login_attempts WHERE email = ?", [email]);
		await pool.execute("UPDATE users SET last_login_at = NOW() WHERE id = ?", [user.id]);

		return ok(res, {
			user: toPublicUser(user),
			accessTokenMaxAgeDays: env.sessionDays,
		});
	} catch (error) {
		console.error("[login] 登录失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

async function recordFail(email: string): Promise<void> {
	try {
		await pool.execute(
			`INSERT INTO login_attempts (email, fail_count)
			 VALUES (?, 1)
			 ON DUPLICATE KEY UPDATE
			   fail_count = IF(locked_until IS NOT NULL AND locked_until > NOW(), fail_count, fail_count + 1),
			   locked_until = IF(
			     IF(locked_until IS NOT NULL AND locked_until > NOW(), fail_count, fail_count + 1) >= ${MAX_FAILS},
			     DATE_ADD(NOW(), INTERVAL ${LOCK_MINUTES} MINUTE),
			     NULL
			   )`,
			[email],
		);
	} catch (error) {
		console.error("[login] 记录失败计数出错:", error);
	}
}

export default router;
