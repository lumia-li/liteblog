import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json } from "@utils/auth-service";
import { getClientIp } from "@utils/client-ip";
import { lookupIpLocation } from "@utils/ip-location";

export const prerender = false;

type SessionItem = Record<string, unknown> & { ip?: unknown };

/** 读取会话列表并补充 IP 属地（查询失败时为空字符串，不影响列表） */
async function loadSessions(userId: string) {
	const data = await callAuthService<{ sessions?: unknown[] }>("/account/sessions", {
		query: { userId },
	});
	return Promise.all(
		(data.sessions ?? []).map(async (item) => {
			const record = item as SessionItem;
			const ip = typeof record.ip === "string" ? record.ip : "";
			const ipLocation = ip ? await lookupIpLocation(ip) : "";
			return ipLocation ? { ...record, ipLocation } : record;
		}),
	);
}

export const GET: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });
	try {
		const sessions = await loadSessions(session.user.id);
		return json(200, { ok: true, currentSessionId: session.sessionId ?? null, sessions });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "会话读取失败" });
	}
};

/**
 * 用当前请求的 IP / UA 校正当前会话记录。
 * 站点位于 Cloudflare → Vercel 之后，历史记录可能存的是代理 IP，
 * 打开「安全设置」时顺手刷新一次，不必重新登录。
 */
export const POST: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session?.sessionId) return json(401, { ok: false, message: "请先登录" });
	try {
		await callAuthService("/account/sessions", {
			method: "POST",
			body: {
				sessionId: session.sessionId,
				userId: session.user.id,
				provider: session.provider || (session.accessToken.startsWith("email-") ? "email" : "oauth"),
				ip: getClientIp(request),
				userAgent: request.headers.get("user-agent") || "",
				issuedAt: session.issuedAt ?? Date.now(),
				expiresAt: session.expiresAt,
			},
		});
		return json(200, { ok: true });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "会话刷新失败" });
	}
};

export const DELETE: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session?.sessionId) return json(401, { ok: false, message: "请先登录" });
	try {
		const data = await callAuthService<{ revoked?: number }>("/account/sessions", {
			method: "DELETE",
			query: { userId: session.user.id, except: session.sessionId },
		});
		return json(200, { ok: true, revoked: data.revoked ?? 0 });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "会话撤销失败" });
	}
};
