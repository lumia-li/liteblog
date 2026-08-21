import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { OAuthUser } from "./auth-server";

export type LoginProvider = "airliny" | "qq" | "google" | "github" | "microsoft";

export type LoginRecord = {
	/** 唯一记录 id */
	id: string;
	user: OAuthUser;
	provider: LoginProvider;
	/** 登录时间戳（毫秒） */
	loginAt: number;
	/** 登录时的来源 IP（可能为空） */
	ip?: string;
	/** 登录时的 User-Agent 前 120 字符 */
	ua?: string;
};

// ── 本地文件存储（fallback，用于本地开发 / 自托管） ──
// 存储在项目根目录 data/ 下（不在 public/，不会被静态托管）
const DATA_DIR = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"data",
);
const HISTORY_FILE = join(DATA_DIR, "login-history.json");
/** 最多保留的记录条数，防止无限增长 */
const MAX_RECORDS = 200;

// ── 远程服务器存储（推荐生产方案：网站跑 Vercel，记录存自己的服务器） ──
// 通过 LOG_HISTORY_SERVER_URL / LOG_HISTORY_SERVER_TOKEN 配置。
// 登录记录由服务器端轻量 API 持久化，避免 Vercel 只读文件系统问题。
/** 兼容 import.meta.env（Vite 构建期内联）与 process.env（Node 运行时） */
function getEnvValue(key: string): string {
	const metaEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;
	return String(metaEnv[key] || (process.env as Record<string, string | undefined>)[key] || "").trim();
}

function getRemoteConfig(): { url: string; token: string } | null {
	const url = getEnvValue("LOG_HISTORY_SERVER_URL");
	const token = getEnvValue("LOG_HISTORY_SERVER_TOKEN");
	if (!url || !token) return null;
	return { url: url.replace(/\/$/, ""), token };
}

async function remoteFetch(
	path: string,
	init?: RequestInit,
): Promise<Response | null> {
	const config = getRemoteConfig();
	if (!config) return null;
	try {
		return await fetch(`${config.url}${path}`, {
			...init,
			headers: {
				Authorization: `Bearer ${config.token}`,
				"Content-Type": "application/json",
				...(init?.headers || {}),
			},
		});
	} catch (error) {
		console.error("[login-history] 远程存储请求失败:", error);
		return null;
	}
}

async function remoteGetRecords(): Promise<LoginRecord[] | null> {
	const res = await remoteFetch("/api/login-history");
	if (!res || !res.ok) return null;
	const data = (await res.json()) as { ok?: boolean; records?: unknown };
	if (!data.ok) return null;
	return sanitizeRecords(data.records);
}

async function remotePushRecord(record: LoginRecord): Promise<boolean> {
	const res = await remoteFetch("/api/login-history", {
		method: "POST",
		body: JSON.stringify(record),
	});
	return Boolean(res && res.ok);
}

async function remoteRemoveRecord(id: string): Promise<boolean> {
	const res = await remoteFetch(`/api/login-history?id=${encodeURIComponent(id)}`, {
		method: "DELETE",
	});
	return Boolean(res && res.ok);
}

async function remoteClearRecords(): Promise<boolean> {
	const res = await remoteFetch("/api/login-history", { method: "DELETE" });
	return Boolean(res && res.ok);
}

// ── Vercel KV 存储（可选，配置 KV_REST_API_URL/KV_REST_API_TOKEN 时启用） ──
// 使用 Upstash REST API 协议，零依赖。
const KV_KEY = "login_history";
const KV_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

function getKvConfig(): { url: string; token: string } | null {
	const url = getEnvValue("KV_REST_API_URL");
	const token = getEnvValue("KV_REST_API_TOKEN");
	if (!url || !token) return null;
	return { url: url.replace(/\/$/, ""), token };
}

/** 发送一条 Upstash Redis 命令（数组格式），返回 result。 */
async function kvCommand(command: unknown[]): Promise<unknown> {
	const config = getKvConfig();
	if (!config) return null;
	const res = await fetch(config.url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${config.token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(command),
	});
	if (!res.ok) {
		throw new Error(`KV command failed with status ${res.status}`);
	}
	const data = (await res.json()) as { result?: unknown };
	return data.result;
}

async function kvGet(key: string): Promise<unknown> {
	return kvCommand(["GET", key]);
}

async function kvSet(key: string, value: string): Promise<void> {
	await kvCommand(["SET", key, value, "EX", KV_TTL_SECONDS]);
}

async function kvDel(key: string): Promise<void> {
	await kvCommand(["DEL", key]);
}

export function getLoginHistoryFilePath(): string {
	return HISTORY_FILE;
}

function readRecordsFromFile(): LoginRecord[] {
	try {
		const raw = readFileSync(HISTORY_FILE, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return sanitizeRecords(parsed);
	} catch {
		// 文件不存在或解析失败时视为空历史
		return [];
	}
}

function writeRecordsToFile(records: LoginRecord[]): boolean {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
		writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), "utf8");
		return true;
	} catch (error) {
		console.error("[login-history] 写入本地文件失败:", error);
		return false;
	}
}

function sanitizeRecords(value: unknown): LoginRecord[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is LoginRecord =>
			typeof item === "object" &&
			item !== null &&
			typeof (item as LoginRecord).id === "string" &&
			typeof (item as LoginRecord).loginAt === "number",
	);
}

async function readRecords(): Promise<LoginRecord[]> {
	// 1. 远程服务器优先（推荐生产）
	const remote = await remoteGetRecords();
	if (remote) return remote;
	// 2. KV（可选）
	if (getKvConfig()) {
		try {
			const raw = await kvGet(KV_KEY);
			if (typeof raw === "string" && raw.length > 0) {
				return sanitizeRecords(JSON.parse(raw) as unknown);
			}
		} catch (error) {
			console.error("[login-history] 读取 KV 失败，回退本地文件:", error);
		}
	}
	// 3. 本地文件
	return readRecordsFromFile();
}

/**
 * 记录一次登录。支持三种后端，按优先级：远程服务器 > Vercel KV > 本地文件。
 * 写入失败时静默降级，不影响登录流程。
 */
export async function recordLogin(
	user: OAuthUser,
	provider: LoginProvider,
	meta?: { ip?: string; ua?: string },
): Promise<void> {
	const record: LoginRecord = {
		id: randomUUID(),
		user,
		provider,
		loginAt: Date.now(),
		ip: meta?.ip || undefined,
		ua: meta?.ua ? meta.ua.slice(0, 120) : undefined,
	};

	// 远程服务器优先：整条记录 POST 到自己的服务器保存
	if (getRemoteConfig()) {
		const ok = await remotePushRecord(record);
		if (ok) return;
		console.error("[login-history] 远程存储写入失败，回退其他后端");
	}

	// KV
	if (getKvConfig()) {
		try {
			const records = await readRecords();
			records.unshift(record);
			await kvSet(KV_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
			return;
		} catch (error) {
			console.error("[login-history] 写入 KV 异常，尝试本地文件:", error);
		}
	}

	// 本地文件
	const records = readRecordsFromFile();
	records.unshift(record);
	writeRecordsToFile(records.slice(0, MAX_RECORDS));
}

/** 按登录时间倒序返回全部记录 */
export async function listLoginHistory(): Promise<LoginRecord[]> {
	const records = await readRecords();
	return records.sort((a, b) => b.loginAt - a.loginAt);
}

/** 删除指定 id 的记录 */
export async function removeLoginHistory(id: string): Promise<boolean> {
	if (getRemoteConfig()) {
		const ok = await remoteRemoveRecord(id);
		if (ok) return true;
		// 远程删除失败时回退 KV 或本地文件
	}
	if (getKvConfig()) {
		try {
			const records = (await readRecords()).filter((item) => item.id !== id);
			await kvSet(KV_KEY, JSON.stringify(records));
			return true;
		} catch (error) {
			console.error("[login-history] 删除 KV 记录失败，尝试本地文件:", error);
		}
	}
	const records = readRecordsFromFile().filter((item) => item.id !== id);
	return writeRecordsToFile(records);
}

/** 清空全部登录历史 */
export async function clearLoginHistory(): Promise<boolean> {
	if (getRemoteConfig()) {
		const ok = await remoteClearRecords();
		if (ok) return true;
	}
	if (getKvConfig()) {
		try {
			await kvDel(KV_KEY);
			return true;
		} catch (error) {
			console.error("[login-history] 清空 KV 失败，尝试本地文件:", error);
		}
	}
	return writeRecordsToFile([]);
}
