import type { APIRoute } from "astro";
import { readSession, setSession } from "@utils/auth-server";
import type { OAuthUser } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

type ServiceUser = OAuthUser;

/**
 * POST /api/account/email —— 换绑邮箱。
 * 两种凭证二选一：
 *  - { newEmail, code }        弹窗内提交验证码（认证服务 /account/email/verify）
 *  - { newEmail, token }       点击邮件链接后携带 token（认证服务 /email/set-password）
 * 成功后重签会话。
 */
export const POST: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });

	if (!/^\d+$/.test(session.user.id)) {
		return json(400, { ok: false, message: "第三方登录账号的邮箱由对应平台管理，无法在此修改" });
	}

	const body = await parseBody<{ newEmail?: unknown; code?: unknown; token?: unknown }>(request);
	const newEmail = typeof body?.newEmail === "string" ? body.newEmail.trim().toLowerCase() : "";
	const code = typeof body?.code === "string" ? body.code.trim() : "";
	const token = typeof body?.token === "string" ? body.token.trim() : "";
	if (!newEmail) return json(400, { ok: false, message: "请填写新邮箱" });
	if (!code && !token) return json(400, { ok: false, message: "缺少验证码或邮件链接凭证" });

	try {
		let user: ServiceUser;
		if (token) {
			// token 换绑路径：服务端按 purpose=change-email 处理，忽略密码/用户名参数
			const data = await callAuthService<{ user: ServiceUser | null }>("/email/set-password", {
				method: "POST",
				body: { token, password: "-", username: "-" },
			});
			user = data.user as ServiceUser;
		} else {
			const data = await callAuthService<{ user: ServiceUser }>("/account/email/verify", {
				method: "POST",
				body: { userId: session.user.id, newEmail, code },
			});
			user = data.user;
		}
		if (!user) return json(500, { ok: false, message: "换绑失败，请重试" });

		const response = json(200, { ok: true, user });
		setSession(response, {
			user,
			accessToken: session.accessToken,
			expiresAt: session.expiresAt,
		}, request);
		return response;
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "换绑失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
