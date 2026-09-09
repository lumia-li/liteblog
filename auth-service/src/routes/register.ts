import { Router } from "express";
import { pool, findUserByEmail, purgeExpiredVerifications } from "../db.ts";
import { env } from "../env.ts";
import { sendVerificationMail } from "../mailer.ts";
import { fail, getClientIp, ok, readJsonBody } from "../middleware.ts";
import { hit, inCooldown, remainingCooldown } from "../rate-limit.ts";
import { generateCode, generateToken, isValidEmail } from "../util.ts";

const router = Router();

type Body = { email?: unknown; purpose?: unknown };

/**
 * POST /email/send-code
 * 发送验证码邮件（注册 或 换绑邮箱）
 * body: { email, purpose: "register" | "change-email" }
 * change-email 时额外要求 { userId }（目标用户），由博客端从会话中取
 */
router.post("/send-code", async (req, res) => {
	const body = readJsonBody<Body>(req);
	if (!body) return fail(res, 400, "请求体不是合法 JSON");

	const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
	const purpose = body.purpose === "change-email" ? "change-email" : "register";
	const userId = typeof (body as { userId?: unknown }).userId === "string"
		? String((body as { userId: string }).userId)
		: "";

	if (!isValidEmail(email)) return fail(res, 400, "邮箱格式不正确");
	if (purpose === "change-email" && !/^\d{1,10}$/.test(userId)) {
		return fail(res, 400, "缺少用户标识");
	}

	const ip = getClientIp(req);

	// ── 限流 ──
	if (inCooldown(`code:${email}`, 60_000)) {
		return fail(res, 429, "发送太频繁，请稍后再试", {
			retryAfter: Math.ceil(remainingCooldown(`code:${email}`) / 1000),
		});
	}
	if (!hit(`ip:${ip}`, 10, 60 * 60 * 1000)) {
		return fail(res, 429, "当前 IP 发送次数已达上限，请一小时后再试");
	}

	try {
		// 注册场景：邮箱不能已被占用
		const existing = await findUserByEmail(email);
		if (purpose === "register" && existing) {
			return fail(res, 409, "该邮箱已注册，请直接登录");
		}
		if (purpose === "change-email" && existing) {
			return fail(res, 409, "该邮箱已被其他账号使用");
		}

		await purgeExpiredVerifications();

		// 生成验证码 + 一次性设密码/确认令牌（均只存哈希）
		const { code, codeHash } = generateCode();
		const { token, tokenHash } = generateToken();
		const expiresAt = new Date(Date.now() + env.verifyExpireMinutes * 60 * 1000);

		await pool.execute(
			`INSERT INTO email_verifications (email, purpose, code_hash, token_hash, user_id, ip, expires_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[email, purpose, codeHash, tokenHash, purpose === "change-email" ? Number(userId) : null, ip, expiresAt],
		);

		await sendVerificationMail({ to: email, code, purpose, token });
		return ok(res, { expiresInSeconds: env.verifyExpireMinutes * 60 });
	} catch (error) {
		console.error("[send-code] 发送验证码失败:", error);
		return fail(res, 500, "邮件发送失败，请稍后重试");
	}
});

export default router;
