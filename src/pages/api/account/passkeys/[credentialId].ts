import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json } from "@utils/auth-service";

export const prerender = false;

/** DELETE /api/account/passkeys/:credentialId —— 删除通行密钥 */
export const DELETE: APIRoute = async ({ request, params }) => {
	const session = await readSession(request);
	if (!session || !/^\d+$/.test(session.user.id)) {
		return json(401, { ok: false, message: "请先登录邮箱账号" });
	}
	const credentialId = params.credentialId || "";
	if (!credentialId || credentialId.length > 512) {
		return json(400, { ok: false, message: "参数无效" });
	}
	try {
		await callAuthService(
			`/account/passkeys/${encodeURIComponent(credentialId)}`,
			{ method: "DELETE", query: { userId: session.user.id } },
		);
		return json(200, { ok: true });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "删除失败" });
	}
};
