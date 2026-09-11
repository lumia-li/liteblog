/**
 * 用户身份徽章读取。
 *
 * 身份数据由 dbviewer 后台写入（/www/liteblog-data/user-badges.json），
 * auth-service 与 dbviewer 同机部署，直接读该文件，避免多一层网络调用。
 *
 * 文件结构：{ "provider|userId": { preset, text, updatedAt } }
 */
import { readFileSync } from "node:fs";
import { env } from "./env.ts";

/** 预设身份 → 前端 tone（决定徽章皮肤） */
const PRESET_TONE: Record<string, string> = {
	admin: "admin",
	vip: "vip",
	mod: "mod",
	friend: "friend",
	normal: "normal",
	test: "test",
	ban: "ban",
};

export type Badge = { preset: string; text: string; tone: string };

/** 读取全部身份映射；文件缺失或损坏时返回空对象 */
function readBadgeFile(): Record<string, { preset?: string; text?: string }> {
	try {
		const parsed = JSON.parse(readFileSync(env.badgeFile, "utf8"));
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * 查询某个用户的身份徽章。
 * provider 为空时按 email 兜底（邮箱用户），便于调用方简化参数。
 */
export function readBadge(provider: string, userId: string): Badge {
	const map = readBadgeFile();
	const key = `${provider || "email"}|${String(userId)}`;
	const rec = map[key];
	if (!rec || !rec.preset || rec.preset === "none") return { preset: "", text: "", tone: "" };
	const tone = PRESET_TONE[rec.preset];
	if (!tone) return { preset: "", text: "", tone: "" };
	const DEFAULT_TEXT: Record<string, string> = {
		admin: "管理员",
		vip: "VIP",
		mod: "版主",
		friend: "友链",
		normal: "普通用户",
		test: "测试",
		ban: "已封禁",
	};
	return {
		preset: rec.preset,
		text: String(rec.text || DEFAULT_TEXT[rec.preset] || "").slice(0, 16),
		tone,
	};
}
