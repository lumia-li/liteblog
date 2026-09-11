import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";
import { callAuthService, isAuthServiceConfigured } from "@utils/auth-service";

export const prerender = false;

export type Badge = { preset: string; text: string; tone: string };
const EMPTY_BADGE: Badge = { preset: "", text: "", tone: "" };

export const GET: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) {
		return new Response(JSON.stringify({ user: null, badge: EMPTY_BADGE }), {
			status: 401,
			headers: { "Content-Type": "application/json; charset=utf-8" },
		});
	}

	// 查询后台授予的身份徽章；失败不影响登录态，仅返回空徽章
	let badge: Badge = EMPTY_BADGE;
	if (isAuthServiceConfigured()) {
		try {
			const result = await callAuthService<{ badge?: Badge }>("/badge", {
				query: {
					provider: session.provider || (session.accessToken.startsWith("email-") ? "email" : ""),
					userId: String(session.user.id),
				},
			});
			if (result.badge && result.badge.tone) badge = result.badge;
		} catch (error) {
			console.error("[api/auth/me] 读取身份徽章失败:", error);
		}
	}

	return new Response(JSON.stringify({ user: session.user, badge }), {
		status: 200,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
};
