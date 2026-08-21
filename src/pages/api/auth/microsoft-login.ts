import { getMicrosoftOAuthConfig, setState } from "@utils/auth-server";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const config = getMicrosoftOAuthConfig();
		const response = new Response(null, { status: 302 });
		const { response: withState, state } = setState(
			response,
			request,
			"/oauth2/microsoft",
		);

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.callback,
			response_type: "code",
			response_mode: "query",
			state,
			scope: "openid email profile User.Read",
		});

		withState.headers.set(
			"Location",
			`https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/authorize?${params.toString()}`,
		);
		return withState;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Microsoft OAuth 配置错误";
		return new Response(message, { status: 500 });
	}
};
