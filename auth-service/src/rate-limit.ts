/**
 * 简单内存限流器（单实例部署够用；重启即清零，可接受）
 * 固定窗口计数：key -> { count, resetAt }
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number) {
	if (now - lastSweep < 60_000) return;
	lastSweep = now;
	for (const [key, bucket] of buckets) {
		if (bucket.resetAt <= now) buckets.delete(key);
	}
}

/**
 * 消耗一次配额。
 * @returns true = 允许；false = 已超限
 */
export function hit(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	sweep(now);
	const bucket = buckets.get(key);
	if (!bucket || bucket.resetAt <= now) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (bucket.count >= limit) return false;
	bucket.count += 1;
	return true;
}

/** 冷却检查：同邮箱发码 60s 一次（独立于窗口限流） */
const cooldowns = new Map<string, number>();
export function inCooldown(key: string, cooldownMs: number): boolean {
	const now = Date.now();
	sweep(now);
	const until = cooldowns.get(key) ?? 0;
	if (until > now) return true;
	cooldowns.set(key, now + cooldownMs);
	return false;
}

export function remainingCooldown(key: string): number {
	const until = cooldowns.get(key) ?? 0;
	return Math.max(0, until - Date.now());
}
