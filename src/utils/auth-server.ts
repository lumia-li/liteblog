import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthUser = {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar_url: string;
	role: "admin" | "user";
};

export type SessionPayload = {
	user: OAuthUser;
	accessToken: string;
	expiresAt: number;
};

const SESSION_COOKIE = "airliny_session";
const STATE_COOKIE = "airliny_oauth_state";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7; // 7 天

function getSessionSecret(): string {
	const secret = String(import.meta.env.SESSION_SECRET || "").trim();
	if (!secret) {
		throw new Error("缺少 SESSION_SECRET 环境变量");
	}
	return secret;
}

function base64UrlEncode(input: Buffer | string): string {
	const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
	return buffer.toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
	return Buffer.from(input, "base64url");
}

function sign(payload: string, secret: string): string {
	return createHmac("sha256", secret)
		.update(payload, "utf8")
		.digest("base64url");
}

function verify(payload: string, signature: string, secret: string): boolean {
	try {
		const expected = sign(payload, secret);
		const expectedBuf = new Uint8Array(Buffer.from(expected, "base64url"));
		const actualBuf = new Uint8Array(Buffer.from(signature, "base64url"));
		if (expectedBuf.length !== actualBuf.length) return false;
		return timingSafeEqual(expectedBuf, actualBuf);
	} catch {
		return false;
	}
}

function encodeToken<T>(payload: T): string {
	const secret = getSessionSecret();
	const body = base64UrlEncode(JSON.stringify(payload));
	const signature = sign(body, secret);
	return `${body}.${signature}`;
}

function decodeToken<T>(token: string): T | null {
	const secret = getSessionSecret();
	const [body, signature] = token.split(".");
	if (!body || !signature) return null;
	if (!verify(body, signature, secret)) return null;
	try {
		return JSON.parse(base64UrlDecode(body).toString("utf8")) as T;
	} catch {
		return null;
	}
}

function serializeCookie(
	name: string,
	value: string,
	options: {
		maxAge?: number;
		httpOnly?: boolean;
		secure?: boolean;
		sameSite?: "strict" | "lax" | "none";
		path?: string;
	},
): string {
	const parts = [`${name}=${value}`];
	if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
	if (options.httpOnly) parts.push("HttpOnly");
	if (options.secure) parts.push("Secure");
	if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
	if (options.path) parts.push(`Path=${options.path}`);
	return parts.join("; ");
}

export function getOAuthConfig(): {
	clientId: string;
	clientSecret: string;
	callback: string;
	base: string;
} {
	const clientId = String(import.meta.env.OAUTH_CLIENT_ID || "").trim();
	const clientSecret = String(import.meta.env.OAUTH_CLIENT_SECRET || "").trim();
	const callback = String(import.meta.env.OAUTH_CALLBACK || "").trim();
	const base = String(
		import.meta.env.OAUTH_BASE || "https://account.airliny.com",
	).trim();

	if (!clientId || !clientSecret || !callback) {
		throw new Error(
			"缺少 OAuth 配置：OAUTH_CLIENT_ID、OAUTH_CLIENT_SECRET、OAUTH_CALLBACK",
		);
	}

	return { clientId, clientSecret, callback, base };
}

export function getQQLoginConfig(): {
	token: string;
	callback: string;
} {
	const token = String(import.meta.env.QQ_XYHULIAN_TOKEN || "").trim();
	const callback = String(import.meta.env.QQ_XYHULIAN_CALLBACK || "").trim();

	if (!token || !callback) {
		throw new Error(
			"缺少 QQ 登录配置：QQ_XYHULIAN_TOKEN、QQ_XYHULIAN_CALLBACK",
		);
	}

	return { token, callback };
}

export function getGoogleOAuthConfig(): {
	clientId: string;
	clientSecret: string;
	callback: string;
} {
	const clientId = String(import.meta.env.GOOGLE_CLIENT_ID || "").trim();
	const clientSecret = String(import.meta.env.GOOGLE_CLIENT_SECRET || "").trim();
	const callback = String(import.meta.env.GOOGLE_CALLBACK || "").trim();

	if (!clientId || !clientSecret || !callback) {
		throw new Error(
			"缺少 Google 登录配置：GOOGLE_CLIENT_ID、GOOGLE_CLIENT_SECRET、GOOGLE_CALLBACK",
		);
	}

	return { clientId, clientSecret, callback };
}

export function readSession(request: Request): SessionPayload | null {
	const cookieHeader = request.headers.get("cookie") || "";
	const match = cookieHeader.match(
		new RegExp(`(?:^|\\s)${SESSION_COOKIE}=([^;]+)`),
	);
	if (!match) return null;
	const session = decodeToken<SessionPayload>(decodeURIComponent(match[1]));
	if (!session || session.expiresAt < Date.now()) return null;
	return session;
}

function isSecureContext(request?: Request): boolean {
	if (import.meta.env.DEV) return false;
	if (!request) return true;
	try {
		return new URL(request.url).protocol === "https:";
	} catch {
		return true;
	}
}

export function setSession(
	response: Response,
	session: SessionPayload,
	request?: Request,
): Response {
	const token = encodeToken(session);
	const secure = isSecureContext(request);
	const cookie = serializeCookie(SESSION_COOKIE, encodeURIComponent(token), {
		maxAge: Math.floor(MAX_AGE_MS / 1000),
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/",
	});
	response.headers.append("Set-Cookie", cookie);
	return response;
}

export function clearSession(response: Response, request?: Request): Response {
	const secure = isSecureContext(request);
	const cookie = serializeCookie(SESSION_COOKIE, "", {
		maxAge: 0,
		httpOnly: true,
		secure,
		sameSite: "lax",
		path: "/",
	});
	response.headers.append("Set-Cookie", cookie);
	return response;
}

export function readState(request: Request): string | null {
	const cookieHeader = request.headers.get("cookie") || "";
	const match = cookieHeader.match(
		new RegExp(`(?:^|\\s)${STATE_COOKIE}=([^;]+)`),
	);
	if (!match) return null;
	return (
		decodeToken<{ state: string }>(decodeURIComponent(match[1]))?.state ?? null
	);
}

export function setState(
	response: Response,
	request?: Request,
	path = "/api/auth/callback",
): { response: Response; state: string } {
	const state = randomBytes(16).toString("hex");
	const secure = isSecureContext(request);
	const token = encodeToken({ state, issuedAt: Date.now() });
	const cookie = serializeCookie(STATE_COOKIE, encodeURIComponent(token), {
		maxAge: 60 * 5, // 5 分钟
		httpOnly: true,
		secure,
		sameSite: "lax",
		path,
	});
	response.headers.append("Set-Cookie", cookie);
	return { response, state };
}

export function clearState(
	response: Response,
	request?: Request,
	path = "/api/auth/callback",
): Response {
	const secure = isSecureContext(request);
	const cookie = serializeCookie(STATE_COOKIE, "", {
		maxAge: 0,
		httpOnly: true,
		secure,
		sameSite: "lax",
		path,
	});
	response.headers.append("Set-Cookie", cookie);
	return response;
}

export async function exchangeCodeForToken(
	code: string,
	config: ReturnType<typeof getOAuthConfig>,
): Promise<
	| {
			success: true;
			data: {
				access_token: string;
				expires_in: number;
				scope: string;
				token_type: string;
			};
	  }
	| { success: false; error: string }
> {
	const url = `${config.base}/oauth/token`;
	console.log("[OAuth] Token exchange request:", {
		url,
		client_id: config.clientId,
		redirect_uri: config.callback,
	});

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code,
				grant_type: "authorization_code",
				redirect_uri: config.callback,
			}).toString(),
		});

		console.log("[OAuth] Token exchange response status:", response.status);
		const text = await response.text();
		console.log("[OAuth] Token exchange response body:", text);

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}: ${text}` };
		}

		try {
			const data = JSON.parse(text) as {
				access_token: string;
				expires_in: number;
				scope: string;
				token_type: string;
			};
			return { success: true, data };
		} catch (parseError) {
			return { success: false, error: `JSON parse failed: ${parseError}` };
		}
	} catch (error) {
		console.error("[OAuth] Token exchange fetch failed:", error);
		return { success: false, error: `Fetch failed: ${error}` };
	}
}

function decodeJwtPayload(accessToken: string): Record<string, unknown> | null {
	try {
		const payloadSegment = accessToken.split(".")[1];
		if (!payloadSegment) return null;
		return JSON.parse(
			base64UrlDecode(payloadSegment).toString("utf8"),
		) as Record<string, unknown>;
	} catch {
		return null;
	}
}

export async function fetchUserInfo(
	accessToken: string,
	config: ReturnType<typeof getOAuthConfig>,
): Promise<OAuthUser | null> {
	const response = await fetch(`${config.base}/oauth/userinfo`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			Accept: "application/json",
		},
	});

	console.log("[OAuth] UserInfo response status:", response.status);
	const text = await response.text();
	console.log("[OAuth] UserInfo response body:", text);

	if (!response.ok) return null;
	try {
		const data = JSON.parse(text) as {
			sub: string;
			username: string;
			email?: string;
			display_name?: string;
			avatar_url?: string;
			role?: string;
		};

		// 如果 userinfo 没有返回邮箱，尝试从 JWT payload 里取 email claim 做兜底
		let email = data.email || "";
		if (!email) {
			const jwtPayload = decodeJwtPayload(accessToken);
			const jwtEmail = jwtPayload?.email;
			if (typeof jwtEmail === "string") {
				email = jwtEmail;
			}
		}

		return {
			id: data.sub,
			username: data.username,
			email,
			display_name: data.display_name || data.username,
			avatar_url: data.avatar_url || "",
			role: data.role === "admin" ? "admin" : "user",
		};
	} catch {
		return null;
	}
}

export async function exchangeGoogleCodeForToken(
	code: string,
	config: ReturnType<typeof getGoogleOAuthConfig>,
): Promise<
	| {
			success: true;
			data: {
				access_token: string;
				expires_in: number;
				scope: string;
				token_type: string;
			};
	  }
	| { success: false; error: string }
> {
	try {
		const response = await fetch("https://oauth2.googleapis.com/token", {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code,
				grant_type: "authorization_code",
				redirect_uri: config.callback,
			}).toString(),
		});

		console.log("[Google OAuth] Token exchange status:", response.status);
		const text = await response.text();
		console.log("[Google OAuth] Token exchange body:", text);

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}: ${text}` };
		}

		const data = JSON.parse(text) as {
			access_token: string;
			expires_in: number;
			scope: string;
			token_type: string;
		};
		return { success: true, data };
	} catch (error) {
		console.error("[Google OAuth] Token exchange failed:", error);
		return { success: false, error: `Fetch failed: ${error}` };
	}
}

export async function fetchGoogleUserInfo(
	accessToken: string,
): Promise<OAuthUser | null> {
	try {
		const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		});

		console.log("[Google OAuth] UserInfo status:", response.status);
		const text = await response.text();
		console.log("[Google OAuth] UserInfo body:", text);

		if (!response.ok) return null;

		const data = JSON.parse(text) as {
			id: string;
			email?: string;
			verified_email?: boolean;
			name?: string;
			given_name?: string;
			family_name?: string;
			picture?: string;
			locale?: string;
		};

		const email = data.email || "";
		const displayName = data.name || data.given_name || email.split("@")[0] || "Google用户";
		const username = email.split("@")[0] || displayName;

		return {
			id: data.id,
			username,
			email,
			display_name: displayName,
			avatar_url: data.picture || "",
			role: "user",
		};
	} catch (error) {
		console.error("[Google OAuth] Fetch userinfo failed:", error);
		return null;
	}
}

/* ─── GitHub OAuth ─── */

export function getGitHubOAuthConfig(): {
	clientId: string;
	clientSecret: string;
	callback: string;
} {
	const clientId = String(import.meta.env.GITHUB_CLIENT_ID || "").trim();
	const clientSecret = String(import.meta.env.GITHUB_CLIENT_SECRET || "").trim();
	const callback = String(import.meta.env.GITHUB_CALLBACK || "").trim();

	if (!clientId || !clientSecret || !callback) {
		throw new Error(
			"缺少 GitHub 登录配置：GITHUB_CLIENT_ID、GITHUB_CLIENT_SECRET、GITHUB_CALLBACK",
		);
	}

	return { clientId, clientSecret, callback };
}

export async function exchangeGitHubCodeForToken(
	code: string,
	config: ReturnType<typeof getGitHubOAuthConfig>,
): Promise<
	| {
			success: true;
			data: {
				access_token: string;
				token_type: string;
				scope: string;
			};
	  }
	| { success: false; error: string }
> {
	try {
		const response = await fetch("https://github.com/login/oauth/access_token", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code,
			}),
		});

		console.log("[GitHub OAuth] Token exchange status:", response.status);
		const text = await response.text();
		console.log("[GitHub OAuth] Token exchange body:", text);

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}: ${text}` };
		}

		const data = JSON.parse(text) as {
			access_token?: string;
			token_type?: string;
			scope?: string;
			error?: string;
			error_description?: string;
		};

		if (data.error) {
			return { success: false, error: data.error_description || data.error };
		}

		if (!data.access_token) {
			return { success: false, error: "No access_token in response" };
		}

		return {
			success: true,
			data: {
				access_token: data.access_token,
				token_type: data.token_type || "bearer",
				scope: data.scope || "",
			},
		};
	} catch (error) {
		console.error("[GitHub OAuth] Token exchange failed:", error);
		return { success: false, error: `Fetch failed: ${error}` };
	}
}

export async function fetchGitHubUserInfo(
	accessToken: string,
): Promise<OAuthUser | null> {
	try {
		const response = await fetch("https://api.github.com/user", {
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/vnd.github+json",
				"User-Agent": "LiteBlog-OAuth",
			},
		});

		console.log("[GitHub OAuth] UserInfo status:", response.status);
		const text = await response.text();
		console.log("[GitHub OAuth] UserInfo body:", text);

		if (!response.ok) return null;

		const data = JSON.parse(text) as {
			id: number;
			login: string;
			email?: string;
			name?: string;
			avatar_url?: string;
		};

		// GitHub 用户可能未公开邮箱，需要单独请求
		let email = data.email || "";
		if (!email) {
			const emailsResponse = await fetch("https://api.github.com/user/emails", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/vnd.github+json",
					"User-Agent": "LiteBlog-OAuth",
				},
			});
			if (emailsResponse.ok) {
				const emails = (await emailsResponse.json()) as Array<{
					email: string;
					primary: boolean;
					verified: boolean;
				}>;
				const primary = emails.find((e) => e.primary && e.verified);
				if (primary) {
					email = primary.email;
				} else {
					const verified = emails.find((e) => e.verified);
					if (verified) email = verified.email;
				}
			}
		}

		const displayName = data.name || data.login;
		const username = data.login;

		return {
			id: String(data.id),
			username,
			email,
			display_name: displayName,
			avatar_url: data.avatar_url || "",
			role: "user",
		};
	} catch (error) {
		console.error("[GitHub OAuth] Fetch userinfo failed:", error);
		return null;
	}
}
