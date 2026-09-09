import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string): string {
	return createHash("sha256").update(input, "utf8").digest("hex");
}

/** 一次性令牌（邮件链接 / 设密码凭证），只把哈希入库 */
export function generateToken(): { token: string; tokenHash: string } {
	const token = randomBytes(32).toString("hex");
	return { token, tokenHash: sha256Hex(token) };
}

/** 6 位数字验证码 */
export function generateCode(): { code: string; codeHash: string } {
	const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
	return { code, codeHash: sha256Hex(code) };
}

/** 常量时间比较，防止时序侧信道 */
export function safeEqualHex(a: string, b: string): boolean {
	const bufA = Buffer.from(a, "hex");
	const bufB = Buffer.from(b, "hex");
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function isValidEmail(email: string): boolean {
	return email.length <= 254 && EMAIL_RE.test(email);
}

/** 用户名规则：3-24 位，字母/数字/下划线/中文/连字符 */
const USERNAME_RE = /^[a-zA-Z0-9_\-\u4e00-\u9fa5]{1,24}$/;
export function isValidUsername(username: string): boolean {
	return USERNAME_RE.test(username);
}

/** 密码规则：8-64 位 */
export function isValidPassword(password: string): boolean {
	return password.length >= 8 && password.length <= 64;
}

/** 客户端 IP（Nginx 反代场景取 X-Forwarded-For 首段） */
export function getClientIp(req: { headers: Record<string, unknown>; ip?: string }): string {
	const forwarded = String(req.headers["x-forwarded-for"] || "").trim();
	if (forwarded) return forwarded.split(",")[0].trim();
	return String(req.headers["x-real-ip"] || "").trim() || (req.ip || "");
}
