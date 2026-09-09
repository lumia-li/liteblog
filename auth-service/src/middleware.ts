import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "./env.ts";
import { getClientIp, safeEqualHex, sha256Hex } from "./util.ts";

/** 统一 JSON 响应 helper（对齐博客端 { ok, message } 约定） */
export function json(res: Response, status: number, payload: Record<string, unknown>): Response {
	return res.status(status).json(payload);
}

export function ok(res: Response, payload: Record<string, unknown> = {}): Response {
	return json(res, 200, { ok: true, ...payload });
}

export function fail(res: Response, status: number, message: string, extra: Record<string, unknown> = {}): Response {
	return json(res, status, { ok: false, message, ...extra });
}

/** 服务间鉴权：x-api-key 头（常量时间比较） */
export const requireApiKey: RequestHandler = (req, res, next) => {
	const provided = String(req.headers["x-api-key"] || "").trim();
	if (!provided) {
		fail(res, 401, "缺少 x-api-key");
		return;
	}
	if (!safeEqualHex(sha256Hex(provided), sha256Hex(env.apiKey))) {
		fail(res, 403, "API Key 无效");
		return;
	}
	next();
};

/** CORS（默认关闭，除非配置 CORS_ORIGIN） */
export const corsMiddleware: RequestHandler = (req, res, next) => {
	if (!env.corsOrigin) {
		next();
		return;
	}
	const origin = String(req.headers.origin || "");
	if (origin === env.corsOrigin) {
		res.setHeader("Access-Control-Allow-Origin", origin);
		res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key");
		res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
	}
	if (req.method === "OPTIONS") {
		res.sendStatus(204);
		return;
	}
	next();
};

export type BodyParserOptions = { max?: number };

/** 安全 JSON body 解析：request.text() + JSON.parse，类型逐字段校验前的统一入口 */
export function readJsonBody<T>(req: Request): T | null {
	try {
		const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
		if (raw.length > 8192) return null;
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

/** 异步路由错误兜底 */
export function asyncHandler(
	handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
	return (req, res, next) => {
		handler(req, res, next).catch(next);
	};
}

export { getClientIp };
