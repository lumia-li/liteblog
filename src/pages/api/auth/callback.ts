import type { APIRoute } from "astro";
import {
	clearState,
	exchangeCodeForToken,
	fetchUserInfo,
	getOAuthConfig,
	readState,
	setSession,
} from "@utils/auth-server";

export const prerender = false;

function redirectResponse(url: string, status = 302): Response {
	return new Response(null, { status, headers: { Location: url } });
}

export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	const error = url.searchParams.get("error");

	if (error) {
		return redirectResponse(`/?auth_error=${encodeURIComponent(error)}`);
	}

	const savedState = readState(request);
	if (!savedState || !state || savedState !== state) {
		return redirectResponse("/?auth_error=invalid_state");
	}

	if (!code) {
		return redirectResponse("/?auth_error=missing_code");
	}

	try {
		const config = getOAuthConfig();
		const tokenResult = await exchangeCodeForToken(code, config);
		if (!tokenResult.success) {
			console.error("[OAuth] Token exchange failed:", tokenResult.error);
			return redirectResponse(`/?auth_error=token_exchange_failed:${encodeURIComponent(tokenResult.error)}`);
		}

		const user = await fetchUserInfo(tokenResult.data.access_token, config);
		if (!user?.id) {
			return redirectResponse("/?auth_error=userinfo_failed");
		}

		let response = redirectResponse("/profile");
		response = clearState(response, request);
		response = setSession(response, {
			user,
			accessToken: tokenResult.data.access_token,
			expiresAt: Date.now() + tokenResult.data.expires_in * 1000,
		}, request);
		return response;
	} catch (error) {
		const message = error instanceof Error ? error.message : "登录失败";
		console.error("[OAuth] Callback error:", error);
		return redirectResponse(`/?auth_error=${encodeURIComponent(message)}`);
	}
};
