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

export function getLoginHistoryFilePath(): string {
	return HISTORY_FILE;
}

function readRecords(): LoginRecord[] {
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

function writeRecords(records: LoginRecord[]): boolean {
	try {
		mkdirSync(DATA_DIR, { recursive: true });
		writeFileSync(HISTORY_FILE, JSON.stringify(records, null, 2), "utf8");
		return true;
	} catch (error) {
		// Vercel serverless 只读文件系统等场景下写入失败，这里静默降级
		console.error("[login-history] 写入登录历史失败:", error);
		return false;
	}
}

/**
 * 记录一次登录。写入失败（如 Vercel 只读文件系统）时静默降级，不影响登录流程。
 */
export function recordLogin(
	user: OAuthUser,
	provider: LoginProvider,
	meta?: { ip?: string; ua?: string },
): void {
	const records = readRecords();
	const record: LoginRecord = {
		id: randomUUID(),
		user,
		provider,
		loginAt: Date.now(),
		ip: meta?.ip || undefined,
		ua: meta?.ua ? meta.ua.slice(0, 120) : undefined,
	};
	records.unshift(record);
	writeRecords(records.slice(0, MAX_RECORDS));
}

/** 按登录时间倒序返回全部记录 */
export function listLoginHistory(): LoginRecord[] {
	return readRecords().sort((a, b) => b.loginAt - a.loginAt);
}

/** 删除指定 id 的记录 */
export function removeLoginHistory(id: string): boolean {
	const records = readRecords().filter((item) => item.id !== id);
	return writeRecords(records);
}

/** 清空全部登录历史 */
export function clearLoginHistory(): boolean {
	return writeRecords([]);
}
