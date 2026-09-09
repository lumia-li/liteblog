import type { APIRoute } from "astro";
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

type Body = {
	token?: unknown;
	password?: unknown;
	username?: unknown;
	/** 换绑邮箱场景：当前会话用户 id（可选校验） */
	userId?: unknown;
};

/**
 * POST /api/auth/email/set-password —— 代理：凭一次性 token 完成注册设密码。
 * 注册场景成功后，如果当前请求没有会话，直接为该用户签发会话（可选自动登录），
 * 前端默认跳转到登录页，符合产品流程。
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await parseBody<Body>(request);
	const token = typeof body?.token === "string" ? body.token.trim() : "";
	const password = typeof body?.password === "string" ? body.password : "";
	const username = typeof body?.username === "string" ? body.username.trim() : "";
	if (!token || !password) return json(400, { ok: false, message: "参数不完整" });

	try {
		const data = await callAuthService<{ purpose: "register" | "change-email"; user: ServiceUser | null }>(
			"/email/set-password",
			{ method: "POST", body: { token, password, username } },
		);
		return json(200, { ok: true, purpose: data.purpose, user: data.user });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "设置密码失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
