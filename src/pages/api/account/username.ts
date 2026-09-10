import type { APIRoute } from "astro";
import { readSession, setSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

type ServiceUser = {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar_url: string;
	role: "admin" | "user";
};

/** PATCH /api/account/username —— 修改用户名（登录态），成功后重签会话 */
export const PATCH: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });

	const body = await parseBody<{ username?: unknown }>(request);
	const username = typeof body?.username === "string" ? body.username.trim() : "";
	if (!username) return json(400, { ok: false, message: "请填写用户名" });

	// 仅邮箱注册账号（本服务管理）支持改名；OAuth 用户资料由 Provider 托管
	if (!/^\d+$/.test(session.user.id)) {
		return json(400, { ok: false, message: "第三方登录账号的资料由对应平台管理，无法在此修改" });
	}

	try {
		const data = await callAuthService<{ user: ServiceUser }>("/account/username", {
			method: "PATCH",
			body: { userId: session.user.id, username },
		});
		const response = json(200, { ok: true, user: data.user });
		setSession(response, {
			user: data.user,
			accessToken: session.accessToken,
			expiresAt: session.expiresAt,
		}, request);
		return response;
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "修改失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};

export const POST: APIRoute = PATCH;
