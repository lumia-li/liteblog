import type { APIRoute } from "astro";
import {
	clearState,
	exchangeGitHubCodeForToken,
	fetchGitHubUserInfo,
	getGitHubOAuthConfig,
	readState,
	setSession,
} from "@utils/auth-server";
import { recordLogin } from "@utils/login-history";

export const prerender = false;

const STATE_COOKIE_PATH = "/oauth2/github";

function getClientIp(request: Request): string {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) return forwarded.split(",")[0].trim();
	return request.headers.get("x-real-ip")?.trim() || "";
}

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
		const config = getGitHubOAuthConfig();
		const tokenResult = await exchangeGitHubCodeForToken(code, config);
		if (!tokenResult.success) {
			console.error("[GitHub OAuth] Token exchange failed:", tokenResult.error);
			return redirectResponse(`/?auth_error=token_exchange_failed:${encodeURIComponent(tokenResult.error)}`);
		}

		const user = await fetchGitHubUserInfo(tokenResult.data.access_token);
		if (!user?.id) {
			return redirectResponse("/?auth_error=userinfo_failed");
		}

		let response = redirectResponse("/profile");
		response = clearState(response, request, STATE_COOKIE_PATH);
		response = setSession(
			response,
			{
				user,
				accessToken: tokenResult.data.access_token,
				expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 天
			},
			request,
		);
		recordLogin(user, "github", {
			ip: getClientIp(request),
			ua: request.headers.get("user-agent") || "",
		});
		return response;
	} catch (error) {
		const message = error instanceof Error ? error.message : "登录失败";
		console.error("[GitHub OAuth] Callback error:", error);
		return redirectResponse(`/?auth_error=${encodeURIComponent(message)}`);
	}
};
