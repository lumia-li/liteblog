import { Router } from "express";
import { readBadge } from "../badges.ts";
import { ok } from "../middleware.ts";

const router = Router();

/**
 * GET /badge?provider=email&userId=1
 * 读取单个用户身份徽章（供博客前端展示）。
 * provider 省略时默认按 email（邮箱注册用户）。
 * 响应：{ ok, badge: { preset, text, tone } }
 */
router.get("/", (req, res) => {
	const provider = String(req.query.provider || "email").trim().slice(0, 32);
	const userId = String(req.query.userId || "").trim().slice(0, 128);
	if (!userId) return ok(res, { badge: { preset: "", text: "", tone: "" } });
	return ok(res, { badge: readBadge(provider, userId) });
});

/**
 * GET /batch?keys=email|1,qq|EAA173...
 * 批量读取（列表/评论区用）。
 * 响应：{ ok, badges: { "provider|userId": { preset, text, tone } } }
 */
router.get("/batch", (req, res) => {
	const raw = String(req.query.keys || "").trim();
	if (!raw) return ok(res, { badges: {} });
	const badges: Record<string, { preset: string; text: string; tone: string }> = {};
	for (const item of raw.split(",").slice(0, 200)) {
		const idx = item.indexOf("|");
		if (idx <= 0) continue;
		const provider = item.slice(0, idx).trim();
		const userId = item.slice(idx + 1).trim();
		if (!provider || !userId) continue;
		badges[`${provider}|${userId}`] = readBadge(provider, userId);
	}
	return ok(res, { badges });
});

export default router;
