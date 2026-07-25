import { getGoogleOAuthConfig, setState } from "@utils/auth-server";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const config = getGoogleOAuthConfig();
		const response = new Response(null, { status: 302 });
		const { response: withState, state } = setState(response, request, "/oauth2/google");

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.callback,
			response_type: "code",
			state,
			scope: "openid email profile",
			access_type: "online",
		});

		withState.headers.set(
			"Location",
			`https://accounts.google.com/o/oauth2/auth?${params.toString()}`,
		);
		return withState;
	} catch (error) {
		const message = error instanceof Error ? error.message : "Google OAuth 配置错误";
		return new Response(message, { status: 500 });
	}
};
