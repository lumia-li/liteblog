import type { RowDataPacket } from "mysql2";
import { Router } from "express";
import {
	generateAuthenticationOptions,
	generateRegistrationOptions,
	verifyAuthenticationResponse,
	verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type {
	AuthenticationResponseJSON,
	AuthenticationResponseJSON as AuthResponseJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { findUserById, findUserByEmail, pool, toPublicUser } from "../db.ts";
import { env } from "../env.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";
import { getClientIp } from "../util.ts";
import { hit } from "../rate-limit.ts";

/**
 * Passkey 通行密钥（WebAuthn）。
 * 挑战值存内存（单实例服务，TTL 5 分钟）；凭据公钥持久化在 user_passkeys 表。
 */

type PasskeyRow = RowDataPacket & {
	id: number;
	user_id: number;
	credential_id: string;
	public_key: string;
	counter: number;
	transports: string;
	device_label: string;
	last_used_at: Date | null;
	created_at: Date;
};

type ChallengeRow = { challenge: string; userId?: string; expiresAt: number };

const CHALLENGE_TTL = 5 * 60 * 1000;
const challenges = new Map<string, ChallengeRow>();

function saveChallenge(key: string, row: ChallengeRow): void {
	challenges.set(key, row);
	// 顺带清理过期挑战，防止 Map 无限增长
	for (const [k, v] of challenges) {
		if (v.expiresAt < Date.now()) challenges.delete(k);
	}
}

function takeChallenge(key: string): string | null {
	const row = challenges.get(key);
	if (!row) return null;
	challenges.delete(key);
	if (row.expiresAt < Date.now()) return null;
	return row.challenge;
}

/** 从 clientDataJSON 提取 challenge 并取出对应挑战记录（含绑定 userId，一次性） */
function takeChallengeByClientData(
	clientDataJSON: string | undefined,
): { challenge: string; userId?: string } | null {
	if (!clientDataJSON || typeof clientDataJSON !== "string") return null;
	try {
		const parsed = JSON.parse(
			Buffer.from(clientDataJSON, "base64url").toString("utf8"),
		) as { challenge?: unknown };
		const challenge = typeof parsed.challenge === "string" ? parsed.challenge : "";
		if (!challenge) return null;
		const row = challenges.get(`auth:${challenge}`);
		if (!row) return null;
		challenges.delete(`auth:${challenge}`);
		if (row.expiresAt < Date.now()) return null;
		return { challenge, userId: row.userId };
	} catch {
		return null;
	}
}

function base64UrlToBuffer(value: string): Uint8Array<ArrayBuffer> {
	const source = Buffer.from(value, "base64url");
	const output = new Uint8Array(new ArrayBuffer(source.length));
	output.set(source);
	return output;
}

function parseTransports(value: string): string[] {
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
	} catch {
		return [];
	}
}

function parseUserId(value: unknown): string | null {
	const id = typeof value === "string" ? value.trim() : "";
	return /^\d{1,10}$/.test(id) ? id : null;
}

/* ──────────────────────────── 账号管理（已登录，挂载于 /account） ──────────────────────────── */

export const passkeyAccountRoutes = Router();

/** GET /account/passkeys?userId=xxx —— 通行密钥列表 */
passkeyAccountRoutes.get("/passkeys", async (req, res) => {
	const userId = parseUserId(req.query.userId);
	if (!userId) return fail(res, 400, "缺少用户标识");
	try {
		const [rows] = await pool.execute<PasskeyRow[]>(
			`SELECT id, credential_id, device_label, created_at, last_used_at
			 FROM user_passkeys WHERE user_id = ? ORDER BY id DESC`,
			[userId],
		);
		return ok(res, {
			passkeys: rows.map((row) => ({
				id: row.id,
				deviceLabel: row.device_label || "通行密钥",
				createdAt: row.created_at,
				lastUsedAt: row.last_used_at,
			})),
		});
	} catch (error) {
		console.error("[passkeys/list] 读取失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/** POST /account/passkeys/register/options —— 生成注册挑战 */
passkeyAccountRoutes.post("/passkeys/register/options", async (req, res) => {
	const body = readJsonBody<{ userId?: unknown }>(req);
	const userId = parseUserId(body?.userId);
	if (!userId) return fail(res, 400, "缺少用户标识");
	try {
		const user = await findUserById(userId);
		if (!user) return fail(res, 404, "用户不存在");
		const [existing] = await pool.execute<PasskeyRow[]>(
			"SELECT credential_id FROM user_passkeys WHERE user_id = ?",
			[userId],
		);
		const options = await generateRegistrationOptions({
			rpName: env.rpName,
			rpID: env.rpId,
			userName: user.email || user.username,
			userDisplayName: user.display_name || user.username,
			userID: new TextEncoder().encode(String(user.id)),
			attestationType: "none",
			excludeCredentials: existing.map((row) => ({ id: row.credential_id })),
			authenticatorSelection: {
				residentKey: "preferred",
				userVerification: "preferred",
			},
		});
		saveChallenge(`reg:${userId}`, {
			challenge: options.challenge,
			expiresAt: Date.now() + CHALLENGE_TTL,
		});
		return ok(res, { options });
	} catch (error) {
		console.error("[passkeys/register/options] 生成失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/** POST /account/passkeys/register/verify —— 校验注册结果并保存凭据 */
passkeyAccountRoutes.post("/passkeys/register/verify", async (req, res) => {
	const body = readJsonBody<{ userId?: unknown; credential?: unknown; deviceLabel?: unknown }>(req);
	const userId = parseUserId(body?.userId);
	if (!userId) return fail(res, 400, "缺少用户标识");
	const credential = body?.credential as RegistrationResponseJSON | undefined;
	if (!credential || typeof credential !== "object" || !("response" in credential)) {
		return fail(res, 400, "注册凭据无效");
	}
	const deviceLabel = typeof body?.deviceLabel === "string" && body.deviceLabel.trim()
		? body.deviceLabel.trim().slice(0, 64)
		: "通行密钥";
	try {
		const expectedChallenge = takeChallenge(`reg:${userId}`);
		if (!expectedChallenge) return fail(res, 400, "注册会话已过期，请重新添加");
		const verification = await verifyRegistrationResponse({
			response: credential,
			expectedChallenge,
			expectedOrigin: env.passkeyOrigins,
			expectedRPID: env.rpId,
			requireUserVerification: false,
		});
		if (!verification.verified || !verification.registrationInfo) {
			return fail(res, 400, "通行密钥验证失败");
		}
		const { credential: newCredential } = verification.registrationInfo;
		const publicKey = Buffer.from(newCredential.publicKey).toString("base64url");
		const transports = JSON.stringify(newCredential.transports ?? []);
		await pool.execute(
			`INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, transports, device_label)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE
			   public_key = VALUES(public_key), counter = VALUES(counter),
			   transports = VALUES(transports), device_label = VALUES(device_label)`,
			[userId, newCredential.id, publicKey, newCredential.counter, transports, deviceLabel],
		);
		return ok(res, { verified: true });
	} catch (error) {
		console.error("[passkeys/register/verify] 验证失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/** DELETE /account/passkeys/:id?userId=xxx —— 删除通行密钥（id 为 user_passkeys 主键） */
passkeyAccountRoutes.delete("/passkeys/:id", async (req, res) => {
	const userId = parseUserId(req.query.userId);
	const id = typeof req.params.id === "string" ? req.params.id.trim() : "";
	if (!userId || !/^\d{1,20}$/.test(id)) return fail(res, 400, "参数无效");
	try {
		const [result] = await pool.execute(
			"DELETE FROM user_passkeys WHERE user_id = ? AND id = ?",
			[userId, id],
		);
		const affected = (result as { affectedRows?: number }).affectedRows ?? 0;
		if (!affected) return fail(res, 404, "通行密钥不存在");
		return ok(res);
	} catch (error) {
		console.error("[passkeys/delete] 删除失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/* ──────────────────────────── 登录（未认证，挂载于 /passkey） ──────────────────────────── */

export const passkeyLoginRoutes = Router();

/**
 * POST /passkey/login/options
 * body: { email? } —— 传邮箱则只允许该账号的密钥（非可发现凭据），不传则允许任何已注册密钥。
 */
passkeyLoginRoutes.post("/login/options", async (req, res) => {
	const body = readJsonBody<{ email?: unknown }>(req);
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	if (email && !hit(`passkey:${getClientIp(req)}`, 30, 60 * 60 * 1000)) {
		return fail(res, 429, "尝试次数过多，请一小时后再试");
	}
	try {
		let allowCredentials: { id: string }[] = [];
		let userId: string | undefined;
		if (email) {
			const user = await findUserByEmail(email);
			if (!user) return fail(res, 404, "该邮箱没有可用的通行密钥");
			const [rows] = await pool.execute<PasskeyRow[]>(
				"SELECT credential_id FROM user_passkeys WHERE user_id = ?",
				[user.id],
			);
			if (!rows.length) return fail(res, 404, "该邮箱没有可用的通行密钥");
			allowCredentials = rows.map((row) => ({ id: row.credential_id }));
			userId = String(user.id);
		}
		const options = await generateAuthenticationOptions({
			rpID: env.rpId,
			userVerification: "preferred",
			allowCredentials,
		});
		saveChallenge(`auth:${options.challenge}`, {
			challenge: options.challenge,
			userId,
			expiresAt: Date.now() + CHALLENGE_TTL,
		});
		return ok(res, { options });
	} catch (error) {
		console.error("[passkeys/login/options] 生成失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});

/**
 * POST /passkey/login/verify
 * body: { credential } —— 校验通过返回用户信息，与 /email/login 响应结构一致。
 */
passkeyLoginRoutes.post("/login/verify", async (req, res) => {
	const body = readJsonBody<{ credential?: unknown }>(req);
	const credential = body?.credential as AuthResponseJSON | AuthenticationResponseJSON | undefined;
	if (!credential || typeof credential !== "object" || !("response" in credential)) {
		return fail(res, 400, "登录凭据无效");
	}
	try {
		// AuthenticationResponseJSON 的 challenge 藏在 clientDataJSON（base64url JSON）里
		const stored = takeChallengeByClientData(credential.response?.clientDataJSON);
		if (!stored) return fail(res, 400, "登录会话已过期，请重试");

		const credentialId = String(credential.id ?? "").slice(0, 512);
		const [rows] = await pool.execute<PasskeyRow[]>(
			"SELECT * FROM user_passkeys WHERE credential_id = ? LIMIT 1",
			[credentialId],
		);
		const passkey = rows[0];
		if (!passkey) return fail(res, 401, "通行密钥未注册");

		// 挑战绑定了邮箱时，密钥必须属于该账号
		if (stored.userId && String(passkey.user_id) !== stored.userId) {
			return fail(res, 401, "通行密钥与账号不匹配");
		}

		const verification = await verifyAuthenticationResponse({
			response: credential as AuthenticationResponseJSON,
			expectedChallenge: stored.challenge,
			expectedOrigin: env.passkeyOrigins,
			expectedRPID: env.rpId,
			credential: {
				id: passkey.credential_id,
				publicKey: base64UrlToBuffer(passkey.public_key),
				counter: Number(passkey.counter) || 0,
				transports: parseTransports(passkey.transports) as never,
			},
			requireUserVerification: false,
		});
		if (!verification.verified) return fail(res, 401, "通行密钥验证失败");

		const user = await findUserById(passkey.user_id);
		if (!user || user.status !== "active") return fail(res, 401, "账号不可用");

		// 更新签名计数与最近使用时间
		await pool.execute(
			"UPDATE user_passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?",
			[verification.authenticationInfo.newCounter, passkey.id],
		);

		return ok(res, {
			user: toPublicUser(user),
			accessTokenMaxAgeDays: env.sessionDays,
		});
	} catch (error) {
		console.error("[passkeys/login/verify] 验证失败:", error);
		return fail(res, 500, "服务器错误，请稍后重试");
	}
});
