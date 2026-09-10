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

type Body = { action?: unknown; email?: unknown; credential?: unknown };

/**
 * POST /api/auth/passkey/login —— 通行密钥登录（WebAuthn）。
 * action=options —— 生成认证挑战（email 可选，用于限定该账号的密钥）
 * action=verify  —— 校验浏览器断言，通过后复用 setSession 签发 airliny_session Cookie。
 * 通行密钥本身已含持有性验证，视为强因子，不再要求 TOTP 二次验证码。
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await parseBody<Body>(request);
	const action = typeof body?.action === "string" ? body.action : "";
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

	try {
		if (action === "options") {
			const data = await callAuthService<{ options: Record<string, unknown> }>(
				"/passkey/login/options",
				{ method: "POST", body: email ? { email } : {} },
			);
			return json(200, { ok: true, options: data.options });
		}

		if (action === "verify") {
			const data = await callAuthService<{ user: ServiceUser; accessTokenMaxAgeDays?: number }>(
				"/passkey/login/verify",
				{ method: "POST", body: { credential: body?.credential } },
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
			await setSession(response, {
				user,
				accessToken: `email-${user.id}`,
				expiresAt: Date.now() + sessionDays * 24 * 60 * 60 * 1000,
				provider: "passkey",
			}, request);
			await recordLogin(user, "passkey", {
				ip: getClientIp(request),
				ua: request.headers.get("user-agent") || "",
			});
			return response;
		}

		return json(400, { ok: false, message: "无效的操作" });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "登录失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
