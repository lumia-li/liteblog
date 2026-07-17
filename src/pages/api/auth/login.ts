import type { APIRoute } from "astro";
import { getOAuthConfig, setState } from "@utils/auth-server";

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
			scope: "verify userinfo email profile",
		});

		withState.headers.set("Location", `${config.base}/oauth/authorize?${params.toString()}`);
		return withState;
	} catch (error) {
		const message = error instanceof Error ? error.message : "OAuth 配置错误";
		return new Response(message, { status: 500 });
	}
};
