import type { APIRoute } from "astro";
import { setSession } from "@utils/auth-server";
import type { OAuthUser } from "@utils/auth-server";
import { json } from "@utils/auth-service";

export const prerender = false;

/**
 * POST /api/auth/mock-login —— 模拟账号登录（仅供测试）。
 * 特点：
 *  - 完全绕过认证服务与数据库：不创建用户、不占用任何 id；
 *  - 不写登录历史（不调用 recordLogin）；
 *  - 仅签发一个本地签名的 airliny_session Cookie，会话信息不含真实数据。
 * 开关：开发环境（DEV）默认可用；生产环境需显式设置 MOCK_LOGIN=true 才开放。
 */
const MOCK_USER: OAuthUser = {
	id: "mock-guest",
	username: "guest",
	email: "",
	display_name: "测试账号",
	avatar_url: "",
	role: "user",
};

const MOCK_SESSION_DAYS = 1;

export const POST: APIRoute = async ({ request }) => {
	const enabled =
		import.meta.env.DEV ||
		String(import.meta.env.MOCK_LOGIN || "").trim().toLowerCase() === "true";
	if (!enabled) {
		return json(404, { ok: false, message: "测试登录未开放" });
	}

	const response = json(200, { ok: true, user: MOCK_USER });
	setSession(
		response,
		{
			user: MOCK_USER,
			accessToken: "mock-guest",
			expiresAt: Date.now() + MOCK_SESSION_DAYS * 24 * 60 * 60 * 1000,
		},
		request,
	);
	return response;
};
