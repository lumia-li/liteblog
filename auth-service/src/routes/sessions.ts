import { Router } from "express";
import { pool } from "../db.ts";
import { fail, ok, readJsonBody } from "../middleware.ts";

const router = Router();

type SessionBody = {
	sessionId?: unknown;
	userId?: unknown;
	provider?: unknown;
	ip?: unknown;
	userAgent?: unknown;
	issuedAt?: unknown;
	expiresAt?: unknown;
};

function text(value: unknown, max: number): string {
	return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function dateValue(value: unknown): Date | null {
	if (typeof value === "number" && Number.isFinite(value)) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	if (typeof value === "string" && value) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
}

function requiredIds(body: SessionBody): { sessionId: string; userId: string } | null {
	const sessionId = text(body.sessionId, 64);
	const userId = text(body.userId, 128);
	if (!sessionId || !userId || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) return null;
	return { sessionId, userId };
}

/** Register or refresh one blog session. */
router.post("/sessions", async (req, res) => {
	const body = readJsonBody<SessionBody>(req);
	const ids = body && requiredIds(body);
	if (!body || !ids) return fail(res, 400, "sessionId 和 userId 无效");
	const issuedAt = dateValue(body.issuedAt) ?? new Date();
	const expiresAt = dateValue(body.expiresAt);
	if (!expiresAt || expiresAt.getTime() <= Date.now()) return fail(res, 400, "expiresAt 无效");
	try {
		await pool.execute(
			`INSERT INTO auth_sessions
			 (session_id, user_id, provider, ip, user_agent, issued_at, expires_at, revoked_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
			 ON DUPLICATE KEY UPDATE
			 user_id = VALUES(user_id), provider = VALUES(provider), ip = VALUES(ip),
			 user_agent = VALUES(user_agent), issued_at = VALUES(issued_at),
			 expires_at = VALUES(expires_at), revoked_at = NULL`,
			[ids.sessionId, ids.userId, text(body.provider, 32) || "unknown", text(body.ip, 64),
				text(body.userAgent, 512), issuedAt, expiresAt],
		);
		return ok(res, { sessionId: ids.sessionId });
	} catch (error) {
		console.error("[sessions] register failed:", error);
		return fail(res, 500, "会话登记失败");
	}
});

/** List active sessions for one user. */
router.get("/sessions", async (req, res) => {
	const userId = text(req.query.userId, 128);
	if (!userId) return fail(res, 400, "userId 无效");
	try {
		// 连接池以 timezone:"Z" 写入，issued_at/expires_at 存的是 UTC 墙上时间，
		// 因此必须与 UTC_TIMESTAMP() 比较（用 NOW() 会差一个时区，约 8 小时）
		await pool.execute("DELETE FROM auth_sessions WHERE expires_at <= UTC_TIMESTAMP()");
		const [rows] = await pool.execute(
			`SELECT session_id AS sessionId, user_id AS userId, provider, ip,
			 user_agent AS userAgent, issued_at AS issuedAt, expires_at AS expiresAt
			 FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL
			 ORDER BY issued_at DESC`,
			[userId],
		);
		return ok(res, { sessions: rows });
	} catch (error) {
		console.error("[sessions] list failed:", error);
		return fail(res, 500, "会话读取失败");
	}
});

/** Check whether one session is still active. */
router.get("/sessions/:sessionId/validate", async (req, res) => {
	const userId = text(req.query.userId, 128);
	const sessionId = text(req.params.sessionId, 64);
	if (!userId || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) return fail(res, 400, "会话参数无效");
	try {
		const [rows] = await pool.execute(
			"SELECT session_id FROM auth_sessions WHERE session_id = ? AND user_id = ? AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP() LIMIT 1",
			[sessionId, userId],
		);
		return ok(res, { active: Array.isArray(rows) && rows.length > 0 });
	} catch (error) {
		console.error("[sessions] validate failed:", error);
		return fail(res, 500, "会话校验失败");
	}
});

/** Revoke one session, scoped by userId. */
router.delete("/sessions/:sessionId", async (req, res) => {
	const userId = text(req.query.userId, 128);
	const sessionId = text(req.params.sessionId, 64);
	if (!userId || !/^[A-Za-z0-9_-]{16,128}$/.test(sessionId)) return fail(res, 400, "会话参数无效");
	try {
		await pool.execute(
			"UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()) WHERE session_id = ? AND user_id = ?",
			[sessionId, userId],
		);
		return ok(res);
	} catch (error) {
		console.error("[sessions] revoke failed:", error);
		return fail(res, 500, "会话撤销失败");
	}
});

/** Revoke every other session, retaining the caller's session. */
router.delete("/sessions", async (req, res) => {
	const userId = text(req.query.userId, 128);
	const except = text(req.query.except, 64);
	if (!userId || !/^[A-Za-z0-9_-]{16,128}$/.test(except)) return fail(res, 400, "会话参数无效");
	try {
		const [result] = await pool.execute(
			"UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, UTC_TIMESTAMP()) WHERE user_id = ? AND session_id <> ? AND revoked_at IS NULL",
			[userId, except],
		);
		return ok(res, { revoked: (result as { affectedRows?: number }).affectedRows ?? 0 });
	} catch (error) {
		console.error("[sessions] revoke-all failed:", error);
		return fail(res, 500, "其他会话撤销失败");
	}
});

export default router;
