import type { APIRoute } from "astro";
import { setSession } from "@utils/auth-server";
import type { OAuthUser } from "@utils/auth-server";
import { callAuthService, getClientIp, json, parseBody } from "@utils/auth-service";
import { recordLogin } from "@utils/login-history";

export const prerender = false;

type ServiceUser = {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar_url: string;
	role: "admin" | "user";
};

type Body = { email?: unknown; password?: unknown };

/**
 * POST /api/auth/email/login —— 代理：邮箱密码登录。
 * 认证服务校验通过后，复用现有 setSession 机制签发 airliny_session Cookie，
 * 并写入登录历史（provider: "email"），与 OAuth 回调完全同构。
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await parseBody<Body>(request);
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	const password = typeof body?.password === "string" ? body.password : "";
	if (!email || !password) return json(400, { ok: false, message: "请填写邮箱和密码" });

	try {
		const data = await callAuthService<{ user: ServiceUser; accessTokenMaxAgeDays?: number }>(
			"/email/login",
			{ method: "POST", body: { email, password } },
		);

		const u = data.user;
		const user: OAuthUser = {
			id: u.id,
			username: u.username,
			email: u.email,
			display_name: u.display_name || u.username,
			avatar_url: u.avatar_url || "",
			role: u.role === "admin" ? "admin" : "user",
		};

		const sessionDays = data.accessTokenMaxAgeDays ?? 7;
		const response = json(200, { ok: true, user });
		setSession(response, {
			user,
			accessToken: `email-${user.id}`,
			expiresAt: Date.now() + sessionDays * 24 * 60 * 60 * 1000,
		}, request);

		await recordLogin(user, "email", {
			ip: getClientIp(request),
			ua: request.headers.get("user-agent") || "",
		});

		return response;
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "登录失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
