/**
 * 独立认证服务 HTTP 客户端（仅服务端使用）
 * 博客 Astro API routes 通过本模块以 API Key 调用部署在自有服务器上的认证服务。
 */

const BASE = String(import.meta.env.AUTH_SERVICE_URL || "").trim().replace(/\/+$/, "");
const API_KEY = String(import.meta.env.AUTH_SERVICE_API_KEY || "").trim();

export class AuthServiceError extends Error {
	status: number;
	code?: string;
	constructor(status: number, message: string, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

export function isAuthServiceConfigured(): boolean {
	return Boolean(BASE && API_KEY);
}

/** 调用认证服务；非 2xx 时抛出 AuthServiceError（message 取服务端 message） */
export async function callAuthService<T = Record<string, unknown>>(
	path: string,
	init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
	if (!isAuthServiceConfigured()) {
		throw new AuthServiceError(500, "认证服务未配置（AUTH_SERVICE_URL / AUTH_SERVICE_API_KEY）");
	}
	const url = new URL(`${BASE}${path}`);
	for (const [key, value] of Object.entries(init.query ?? {})) {
		url.searchParams.set(key, value);
	}

	let response: Response;
	try {
		response = await fetch(url.toString(), {
			method: init.method ?? "GET",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": API_KEY,
			},
			body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
		});
	} catch (error) {
		throw new AuthServiceError(502, `认证服务连接失败: ${error}`);
	}

	let data: Record<string, unknown> = {};
	try {
		data = (await response.json()) as Record<string, unknown>;
	} catch {
		/* 非 JSON 响应按空对象处理 */
	}

	if (!response.ok || data.ok !== true) {
		const message = typeof data.message === "string" ? data.message : `认证服务错误（HTTP ${response.status}）`;
		throw new AuthServiceError(response.status, message, typeof data.code === "string" ? data.code : undefined);
	}
	return data as T;
}

/** 从请求中提取客户端 IP（与 OAuth 回调口径一致） */
export function getClientIp(request: Request): string {
	const forwarded = (request.headers.get("x-forwarded-for") || "").trim();
	if (forwarded) return forwarded.split(",")[0].trim();
	return (request.headers.get("x-real-ip") || "").trim();
}

/** 统一 JSON 响应 helper（对齐现有 API 约定） */
export function json(status: number, payload: Record<string, unknown>): Response {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}

/** 统一解析 JSON body（兼容 form-urlencoded） */
export async function parseBody<T extends Record<string, unknown>>(request: Request): Promise<T | null> {
	try {
		const text = await request.text();
		if (!text) return null;
		if (text.trimStart().startsWith("{")) {
			return JSON.parse(text) as T;
		}
		const params = new URLSearchParams(text);
		return Object.fromEntries(params) as T;
	} catch {
		return null;
	}
}
