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

// ── Vercel KV 存储（生产推荐，Vercel 部署时自动注入环境变量） ──
// 使用 Upstash REST API 协议，零依赖，避免引入额外包导致的打包兼容问题。
const KV_KEY = "login_history";
const KV_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 天

function getKvConfig(): { url: string; token: string } | null {
	const env = (import.meta.env ?? {}) as Record<string, string | undefined>;
	const url = String(env.KV_REST_API_URL || "").trim();
	const token = String(env.KV_REST_API_TOKEN || "").trim();
	if (!url || !token) return null;
	return { url: url.replace(/\/$/, ""), token };
}

/** 发送一条 Upstash Redis 命令（数组格式），返回 result。 */
async function kvCommand(
	command: unknown[],
): Promise<unknown> {
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
		return parsed.filter(
			(item): item is LoginRecord =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as LoginRecord).id === "string" &&
				typeof (item as LoginRecord).loginAt === "number",
		);
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
	// KV 优先（Vercel 生产）
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
	return readRecordsFromFile();
}

async function writeRecords(records: LoginRecord[]): Promise<boolean> {
	// KV 优先
	if (getKvConfig()) {
		try {
			await kvSet(KV_KEY, JSON.stringify(records));
			return true;
		} catch (error) {
			console.error("[login-history] 写入 KV 异常，尝试本地文件:", error);
		}
	}
	return writeRecordsToFile(records);
}

/**
 * 记录一次登录。支持 Vercel KV（生产）与本地文件（开发/自托管）双后端。
 * 写入失败时静默降级，不影响登录流程。
 */
export async function recordLogin(
	user: OAuthUser,
	provider: LoginProvider,
	meta?: { ip?: string; ua?: string },
): Promise<void> {
	const records = await readRecords();
	const record: LoginRecord = {
		id: randomUUID(),
		user,
		provider,
		loginAt: Date.now(),
		ip: meta?.ip || undefined,
		ua: meta?.ua ? meta.ua.slice(0, 120) : undefined,
	};
	records.unshift(record);
	await writeRecords(records.slice(0, MAX_RECORDS));
}

/** 按登录时间倒序返回全部记录 */
export async function listLoginHistory(): Promise<LoginRecord[]> {
	const records = await readRecords();
	return records.sort((a, b) => b.loginAt - a.loginAt);
}

/** 删除指定 id 的记录 */
export async function removeLoginHistory(id: string): Promise<boolean> {
	const records = (await readRecords()).filter((item) => item.id !== id);
	return writeRecords(records);
}

/** 清空全部登录历史 */
export async function clearLoginHistory(): Promise<boolean> {
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
