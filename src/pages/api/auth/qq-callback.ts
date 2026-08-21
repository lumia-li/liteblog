import type { APIRoute } from "astro";
import {
	clearState,
	exchangeQQCodeForToken,
	fetchQQOpenId,
	fetchQQUserInfo,
	getQQLoginConfig,
	readState,
	setSession,
} from "../../../utils/auth-server";
import { recordLogin } from "@utils/login-history";

export const prerender = false;

const STATE_COOKIE_PATH = "/api/auth/qq-callback";

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

	// 校验 state，防 CSRF
	const savedState = readState(request);
	if (!savedState || !state || savedState !== state) {
		return redirectResponse("/?auth_error=invalid_state");
	}

	if (!code) {
		return redirectResponse("/?auth_error=missing_code");
	}

	try {
		const config = getQQLoginConfig();

		// 1. 用 code 换 access_token
		const tokenResult = await exchangeQQCodeForToken(code, config);
		if (!tokenResult.success) {
			console.error("[QQ OAuth] Token exchange failed:", tokenResult.error);
			return redirectResponse(`/?auth_error=token_exchange_failed:${encodeURIComponent(tokenResult.error)}`);
		}

		// 2. 用 access_token 取 openid
		const openIdResult = await fetchQQOpenId(tokenResult.accessToken);
		if (!openIdResult) {
			return redirectResponse("/?auth_error=openid_failed");
		}

		// 3. 用 openid 取用户信息
		const info = await fetchQQUserInfo(
			tokenResult.accessToken,
			config.appId,
			openIdResult.openid,
		);
		const nickname = info?.nickname || "";
		const displayName = nickname || `QQ用户${openIdResult.openid.slice(0, 6)}`;

		const user = {
			id: openIdResult.openid,
			username: displayName,
			email: "",
			display_name: displayName,
			avatar_url: info?.avatar || "",
			role: "user" as const,
		};

		// 创建会话
		const session = {
			user,
			accessToken: tokenResult.accessToken,
			expiresAt: Date.now() + tokenResult.expiresIn * 1000,
		};

		// 重定向到首页，设置会话 cookie，清除 state
		let redirect = redirectResponse("/");
		redirect = clearState(redirect, request, STATE_COOKIE_PATH);
		redirect = setSession(redirect, session, request);

		await recordLogin(user, "qq", {
			ip: getClientIp(request),
			ua: request.headers.get("user-agent") || "",
		});

		return redirect;
	} catch (error) {
		console.error("QQ 登录回调处理失败:", error);
		return redirectResponse("/?auth_error=qq_callback_failed");
	}
};
