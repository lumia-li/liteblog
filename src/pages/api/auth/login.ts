import { getOAuthConfig, setState } from "@utils/auth-server";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const config = getOAuthConfig();
		const response = new Response(null, { status: 302 });
		const { response: withState, state } = setState(response, request);

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.callback,
			response_type: "code",
			state,
		});
		// 使用 encodeURIComponent 把 scope 里的空格编码成 %20，避免部分 OAuth 服务端把 + 解析成空格失败
		const scope = "verify userinfo email profile";
		const query = `${params.toString()}&scope=${encodeURIComponent(scope)}`;

		withState.headers.set(
			"Location",
			`${config.base}/oauth/authorize?${query}`,
		);
		return withState;
	} catch (error) {
		const message = error instanceof Error ? error.message : "OAuth 配置错误";
		return new Response(message, { status: 500 });
	}
};
