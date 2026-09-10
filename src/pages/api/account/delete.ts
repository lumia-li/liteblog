import type { APIRoute } from "astro";
import { clearSession, readSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

/**
 * POST /api/account/delete —— 注销账号（需邮箱验证码，仅邮箱注册账号）。
 * 验证码通过 /api/auth/email/send-code（purpose=delete-account）发送至账号邮箱。
 * 成功后账号从认证服务数据库中删除，并清除本站会话 Cookie。
 */
export const POST: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });

	if (!/^\d+$/.test(session.user.id)) {
		return json(400, { ok: false, message: "第三方登录账号请在对应平台注销" });
	}

	const body = await parseBody<{ code?: unknown }>(request);
	const code = typeof body?.code === "string" ? body.code.trim() : "";
	if (!/^\d{6}$/.test(code)) {
		return json(400, { ok: false, message: "请输入 6 位邮箱验证码" });
	}

	try {
		await callAuthService("/account", {
			method: "DELETE",
			body: { userId: session.user.id, code },
		});
		return clearSession(json(200, { ok: true }), request);
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "注销失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
