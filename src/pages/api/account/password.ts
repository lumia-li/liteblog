import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

/** POST /api/account/password —— 修改密码（需验证旧密码，仅邮箱注册账号） */
export const POST: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });

	if (!/^\d+$/.test(session.user.id)) {
		return json(400, { ok: false, message: "第三方登录账号无独立密码，无法在此修改" });
	}

	const body = await parseBody<{ currentPassword?: unknown; newPassword?: unknown }>(request);
	const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
	const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
	if (!currentPassword || !newPassword) {
		return json(400, { ok: false, message: "请填写当前密码和新密码" });
	}

	try {
		await callAuthService("/account/password", {
			method: "POST",
			body: { userId: session.user.id, currentPassword, newPassword },
		});
		return json(200, { ok: true });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		const message = error instanceof Error ? error.message : "修改失败";
		return json(status >= 400 && status < 600 ? status : 500, { ok: false, message });
	}
};
