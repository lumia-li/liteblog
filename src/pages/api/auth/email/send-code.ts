import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

type Body = { email?: unknown; purpose?: unknown };

/**
 * POST /api/auth/email/send-code —— 代理：发送邮箱验证码。
 * purpose=register         注册发码（无需登录）
 * purpose=change-email     换绑邮箱发码（必须登录，userId 强制取自会话，防越权）
 */
export const POST: APIRoute = async ({ request }) => {
	const body = await parseBody<Body>(request);
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	const purpose = body?.purpose === "change-email" ? "change-email" : "register";
	if (!email) return json(400, { ok: false, message: "请填写邮箱" });

	if (purpose === "change-email") {
		const session = readSession(request);
		if (!session) return json(401, { ok: false, message: "请先登录" });
		if (!/^\d+$/.test(session.user.id)) {
			return json(400, { ok: false, message: "第三方登录账号的邮箱由对应平台管理" });
		}
		try {
			const data = await callAuthService<{ expiresInSeconds?: number }>("/email/send-code", {
				method: "POST",
				body: { email, purpose, userId: session.user.id },
			});
			return json(200, { ok: true, expiresInSeconds: data.expiresInSeconds ?? 900 });
		} catch (error) {
			const status = (error as { status?: number }).status ?? 500;
			const message = error instanceof Error ? error.message : "邮件发送失败";
			return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
		}
	}

	try {
		const data = await callAuthService<{ expiresInSeconds?: number }>("/email/send-code", {
			method: "POST",
			body: { email, purpose },
		});
		return json(200, { ok: true, expiresInSeconds: data.expiresInSeconds ?? 900 });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "邮件发送失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
