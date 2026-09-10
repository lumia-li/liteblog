import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json } from "@utils/auth-service";

export const prerender = false;

export const DELETE: APIRoute = async ({ request, params }) => {
	const session = await readSession(request);
	const sessionId = params.sessionId || "";
	if (!session || !sessionId) return json(401, { ok: false, message: "请先登录" });
	if (session.sessionId === sessionId) return json(400, { ok: false, message: "当前会话请使用退出登录" });
	try {
		await callAuthService(`/account/sessions/${encodeURIComponent(sessionId)}`, {
			method: "DELETE",
			query: { userId: session.user.id },
		});
		return json(200, { ok: true });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "会话撤销失败" });
	}
};
