/**
 * IP 属地查询（服务端专用）。
 * 使用 ip-api.com 免费接口（支持中文，限 45 次/分钟），结果按 IP 缓存 7 天。
 * 查询失败时返回空字符串，不影响设备列表展示。
 */

const TTL = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, { value: string; expiresAt: number }>();

/** 内网/环回地址不做属地查询 */
export function isPrivateIp(ip: string): boolean {
	if (!ip) return false;
	if (ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) return true;
	if (/^127\./.test(ip) || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^169\.254\./.test(ip)) return true;
	const match = ip.match(/^172\.(\d+)\./);
	if (match) {
		const second = Number(match[1]);
		if (second >= 16 && second <= 31) return true;
	}
	return false;
}

export async function lookupIpLocation(ip: string): Promise<string> {
	const clean = (ip || "").trim();
	if (!clean) return "";
	if (isPrivateIp(clean)) return "内网";
	const cached = cache.get(clean);
	if (cached && cached.expiresAt > Date.now()) return cached.value;
	try {
		const response = await fetch(
			`http://ip-api.com/json/${encodeURIComponent(clean)}?lang=zh-CN&fields=status,country,regionName,city`,
			{ signal: AbortSignal.timeout(3000) },
		);
		if (!response.ok) return "";
		const data = (await response.json()) as {
			status?: string;
			country?: string;
			regionName?: string;
			city?: string;
		};
		if (data.status !== "success") return "";
		// 国内显示「省 市」，国外显示「国家 城市」
		const parts = data.country === "中国"
			? [data.regionName, data.city]
			: [data.country, data.city];
		const value = parts.filter(Boolean).join(" ").trim();
		if (value) {
			if (cache.size > 2000) cache.clear();
			cache.set(clean, { value, expiresAt: Date.now() + TTL });
		}
		return value;
	} catch {
		return "";
	}
}
