import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

async function getUserId(request: Request): Promise<string | null> {
	const session = await readSession(request);
	if (!session || !/^\d+$/.test(session.user.id)) return null;
	return session.user.id;
}

export const GET: APIRoute = async ({ request }) => {
	const userId = await getUserId(request);
	if (!userId) return json(401, { ok: false, message: "请先登录邮箱账号" });
	try {
		const data = await callAuthService<{ enabled: boolean }>("/account/totp/status", {
			query: { userId },
		});
		return json(200, { ok: true, enabled: Boolean(data.enabled) });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "读取失败" });
	}
};

type Body = { action?: unknown; code?: unknown };

export const POST: APIRoute = async ({ request }) => {
	const userId = await getUserId(request);
	if (!userId) return json(401, { ok: false, message: "请先登录邮箱账号" });
	const body = await parseBody<Body>(request);
	const action = typeof body?.action === "string" ? body.action : "";
	const code = typeof body?.code === "string" ? body.code : undefined;
	const path = action === "setup" ? "/account/totp/setup" : action === "verify" ? "/account/totp/verify" : action === "disable" ? "/account/totp/disable" : "";
	if (!path) return json(400, { ok: false, message: "无效的操作" });
	try {
		const data = await callAuthService<Record<string, unknown>>(path, {
			method: "POST",
			body: { userId, ...(code ? { code } : {}) },
		});
		return json(200, { ok: true, ...data });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "操作失败" });
	}
};
