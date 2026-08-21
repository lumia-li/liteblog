import type { APIRoute } from "astro";
import {
	getExpectedDevCode,
	matchDevCredential,
} from "@utils/dev-auth-server";
import {
	clearLoginHistory,
	listLoginHistory,
	removeLoginHistory,
} from "@utils/login-history";

export const prerender = false;

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
		},
	});
}

/**
 * 通过开发者口令鉴权。
 * 支持 devCode（明文）或 devCodeHash（SHA-256 十六进制）。
 */
function isAuthorized(request: Request): boolean {
	const expectedCode = getExpectedDevCode();
	if (!expectedCode) return false;
	const url = new URL(request.url);
	return matchDevCredential({
		devCode: url.searchParams.get("devCode") || undefined,
		devCodeHash: url.searchParams.get("devCodeHash") || undefined,
		expectedCode,
	});
}

export const GET: APIRoute = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json(403, { ok: false, message: "未授权：缺少或错误的开发者口令" });
	}
	const records = await listLoginHistory();
	return json(200, { ok: true, records });
};

export const DELETE: APIRoute = async ({ request }) => {
	if (!isAuthorized(request)) {
		return json(403, { ok: false, message: "未授权：缺少或错误的开发者口令" });
	}
	const url = new URL(request.url);
	const id = url.searchParams.get("id");
	if (id) {
		const removed = await removeLoginHistory(id);
		return json(removed ? 200 : 404, {
			ok: removed,
			message: removed ? "已删除该条登录记录" : "未找到该条记录",
		});
	}
	const cleared = await clearLoginHistory();
	return json(cleared ? 200 : 500, {
		ok: cleared,
		message: cleared ? "已清空全部登录历史" : "清空失败（存储不可写）",
	});
};
