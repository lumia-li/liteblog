import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type OAuthUser = {
	id: number;
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
	return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
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
	options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "strict" | "lax" | "none"; path?: string },
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
	const base = String(import.meta.env.OAUTH_BASE || "https://account.airliny.com").trim();

	if (!clientId || !clientSecret || !callback) {
		throw new Error("缺少 OAuth 配置：OAUTH_CLIENT_ID、OAUTH_CLIENT_SECRET、OAUTH_CALLBACK");
	}

	return { clientId, clientSecret, callback, base };
}

export function readSession(request: Request): SessionPayload | null {
	const cookieHeader = request.headers.get("cookie") || "";
	const match = cookieHeader.match(new RegExp(`(?:^|\\s)${SESSION_COOKIE}=([^;]+)`));
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

export function setSession(response: Response, session: SessionPayload, request?: Request): Response {
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
	const match = cookieHeader.match(new RegExp(`(?:^|\\s)${STATE_COOKIE}=([^;]+)`));
	if (!match) return null;
	return decodeToken<{ state: string }>(decodeURIComponent(match[1]))?.state ?? null;
}

export function setState(response: Response): { response: Response; state: string } {
	const state = randomBytes(16).toString("hex");
	const token = encodeToken({ state, issuedAt: Date.now() });
	const cookie = serializeCookie(STATE_COOKIE, encodeURIComponent(token), {
		maxAge: 60 * 5, // 5 分钟
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/api/auth/callback",
	});
	response.headers.append("Set-Cookie", cookie);
	return { response, state };
}

export function clearState(response: Response): Response {
	const cookie = serializeCookie(STATE_COOKIE, "", {
		maxAge: 0,
		httpOnly: true,
		secure: true,
		sameSite: "lax",
		path: "/api/auth/callback",
	});
	response.headers.append("Set-Cookie", cookie);
	return response;
}

export async function exchangeCodeForToken(
	code: string,
	config: ReturnType<typeof getOAuthConfig>,
): Promise<{ access_token: string; expires_in: number; scope: string; token_type: string } | null> {
	const url = `${config.base}/oauth/token`;
	console.log("[OAuth] Token exchange request:", { url, client_id: config.clientId, redirect_uri: config.callback });
	
	try {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: config.clientId,
				client_secret: config.clientSecret,
				code,
				grant_type: "authorization_code",
				redirect_uri: config.callback,
			}),
		});

		console.log("[OAuth] Token exchange response status:", response.status);
		if (!response.ok) {
			const text = await response.text();
			console.log("[OAuth] Token exchange error body:", text);
			return null;
		}
		return (await response.json()) as {
			access_token: string;
			expires_in: number;
			scope: string;
			token_type: string;
		};
	} catch (error) {
		console.error("[OAuth] Token exchange fetch failed:", error);
		return null;
	}
}

export async function fetchUserInfo(
	accessToken: string,
	config: ReturnType<typeof getOAuthConfig>,
): Promise<OAuthUser | null> {
	const response = await fetch(`${config.base}/oauth/userinfo`, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) return null;
	try {
		return (await response.json()) as OAuthUser;
	} catch {
		return null;
	}
}
