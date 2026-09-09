import type { APIRoute } from "astro";
import { callAuthService, json } from "@utils/auth-service";

export const prerender = false;

type CheckResult = {
	email: string;
	purpose: "register" | "change-email";
	verified: boolean;
};

/** GET /api/auth/email/check-token?token=xxx —— 代理：设密码落地页校验 token */
export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const token = (url.searchParams.get("token") || "").trim();
	if (!token) return json(400, { ok: false, message: "链接无效" });

	try {
		const data = await callAuthService<CheckResult>("/email/check-token", {
			query: { token },
		});
		return json(200, { ok: true, ...data });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "链接无效或已过期";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
