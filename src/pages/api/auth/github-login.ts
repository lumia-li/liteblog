import { getGitHubOAuthConfig, setState } from "@utils/auth-server";
import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const config = getGitHubOAuthConfig();
		const response = new Response(null, { status: 302 });
		const { response: withState, state } = setState(response, request, "/oauth2/github");

		const params = new URLSearchParams({
			client_id: config.clientId,
			redirect_uri: config.callback,
			state,
			scope: "read:user user:email",
		});

		withState.headers.set(
			"Location",
			`https://github.com/login/oauth/authorize?${params.toString()}`,
		);
		return withState;
	} catch (error) {
		const message = error instanceof Error ? error.message : "GitHub OAuth 配置错误";
		return new Response(message, { status: 500 });
	}
};
