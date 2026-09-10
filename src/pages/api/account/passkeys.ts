import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, json, parseBody } from "@utils/auth-service";

export const prerender = false;

/** 仅邮箱注册账号可管理通行密钥 */
async function getUserId(request: Request): Promise<string | null> {
	const session = await readSession(request);
	if (!session || !/^\d+$/.test(session.user.id)) return null;
	return session.user.id;
}

/** GET /api/account/passkeys —— 通行密钥列表 */
export const GET: APIRoute = async ({ request }) => {
	const userId = await getUserId(request);
	if (!userId) return json(401, { ok: false, message: "请先登录邮箱账号" });
	try {
		const data = await callAuthService<{ passkeys?: unknown[] }>("/account/passkeys", {
			query: { userId },
		});
		return json(200, { ok: true, passkeys: data.passkeys ?? [] });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "读取失败" });
	}
};

type Body = { action?: unknown; credential?: unknown; deviceLabel?: unknown };

/**
 * POST /api/account/passkeys
 * action=register-options —— 生成 WebAuthn 注册挑战
 * action=register-verify  —— 校验浏览器注册结果并保存凭据
 */
export const POST: APIRoute = async ({ request }) => {
	const userId = await getUserId(request);
	if (!userId) return json(401, { ok: false, message: "请先登录邮箱账号" });
	const body = await parseBody<Body>(request);
	const action = typeof body?.action === "string" ? body.action : "";
	const path =
		action === "register-options"
			? "/account/passkeys/register/options"
			: action === "register-verify"
				? "/account/passkeys/register/verify"
				: "";
	if (!path) return json(400, { ok: false, message: "无效的操作" });
	try {
		const data = await callAuthService<Record<string, unknown>>(path, {
			method: "POST",
			body: {
				userId,
				...(action === "register-verify" ? { credential: body?.credential } : {}),
				...(typeof body?.deviceLabel === "string" ? { deviceLabel: body.deviceLabel } : {}),
			},
		});
		return json(200, { ok: true, ...data });
	} catch (error) {
		const status = (error as { status?: number }).status ?? 500;
		return json(status, { ok: false, message: error instanceof Error ? error.message : "操作失败" });
	}
};
