import type { APIRoute } from "astro";
import { getQQLoginConfig, setState } from "../../../utils/auth-server";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const config = getQQLoginConfig();

		// 生成 state（存入 cookie，防止 CSRF）
		const response = new Response(null, { status: 302 });
		const { response: withState, state } = setState(
			response,
			request,
			"/api/auth/qq-callback",
		);

		// 腾讯 QQ 互联授权 URL
		const params = new URLSearchParams({
			response_type: "code",
			client_id: config.appId,
			redirect_uri: config.callback,
			state,
			scope: "get_user_info",
		});

		withState.headers.set(
			"Location",
			`https://graph.qq.com/oauth2.0/authorize?${params.toString()}`,
		);
		return withState;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "QQ 登录配置错误";
		console.error("QQ 登录发起失败:", error);
		return new Response(message, { status: 500 });
	}
};
