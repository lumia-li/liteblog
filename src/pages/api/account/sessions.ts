import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json } from "@utils/auth-service";
import { lookupIpLocation } from "@utils/ip-location";

export const prerender = false;

type SessionItem = Record<string, unknown> & { ip?: unknown };

export const GET: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });
	try {
		const data = await callAuthService<{ sessions?: unknown[] }>("/account/sessions", {
			query: { userId: session.user.id },
		});
		// 补充 IP 属地（查询失败时为空字符串，不影响列表）
		const sessions = await Promise.all(
			(data.sessions ?? []).map(async (item) => {
				const record = item as SessionItem;
				const ip = typeof record.ip === "string" ? record.ip : "";
				const ipLocation = ip ? await lookupIpLocation(ip) : "";
				return ipLocation ? { ...record, ipLocation } : record;
			}),
		);
		return json(200, { ok: true, currentSessionId: session.sessionId ?? null, sessions });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "会话读取失败" });
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
