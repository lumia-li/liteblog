import type { APIRoute } from "astro";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

type Body = { email?: unknown; code?: unknown; purpose?: unknown };

/** POST /api/auth/email/verify-code —— 代理：校验验证码，换取一次性设密码 token */
export const POST: APIRoute = async ({ request }) => {
	const body = await parseBody<Body>(request);
	const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
	const code = typeof body?.code === "string" ? body.code.trim() : "";
	const purpose = body?.purpose === "change-email" ? "change-email" : "register";
	if (!email || !code) return json(400, { ok: false, message: "请填写邮箱和验证码" });

	try {
		const data = await callAuthService<{ token: string }>("/email/verify-code", {
			method: "POST",
			body: { email, code, purpose },
		});
		return json(200, { ok: true, token: data.token });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "验证码校验失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
