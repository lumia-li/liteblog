/**
 * 客户端真实 IP 提取（仅服务端使用）。
 *
 * 本站访问链路是：访客 → Cloudflare（橙云代理）→ Vercel（Astro SSR / API）。
 * 直连 Vercel 的是 Cloudflare 边缘节点，所以：
 *   - x-real-ip / x-vercel-forwarded-for 拿到的是 Cloudflare 边缘 IP（属地常年在
 *     美国），这正解释了「换什么设备、开不开代理，登录设备里都显示美国」；
 *   - x-forwarded-for 末位同样是 Cloudflare 边缘 IP，真实访客在它左边；
 *   - cf-connecting-ip 由 Cloudflare 在边缘覆写，客户端无法伪造，是最可信的取值。
 *
 * 取值优先级：cf-connecting-ip → true-client-ip → x-forwarded-for（从右往左，
 * 跳过内网与 Cloudflare 网段）→ x-real-ip。
 *
 * 注意：cf-connecting-ip 只有在「请求确实经过 Cloudflare」时才可信，
 * 直接访问 *.vercel.app 是可以自己伪造它的，因此先校验 CF-RAY 与
 * X-Forwarded-For 的直连跳（Vercel 会把直连它的一跳追加到末尾）。
 */

/** Cloudflare 对外公布的 IPv4 网段（用于剔除代理自身地址） */
const CLOUDFLARE_IPV4: Array<[network: string, bits: number]> = [
	["173.245.48.0", 20],
	["103.21.244.0", 22],
	["103.22.200.0", 22],
	["103.31.4.0", 22],
	["141.101.64.0", 18],
	["108.162.192.0", 18],
	["190.93.240.0", 20],
	["188.114.96.0", 20],
	["197.234.240.0", 22],
	["198.41.128.0", 17],
	["162.158.0.0", 15],
	["104.16.0.0", 13],
	["104.24.0.0", 14],
	["172.64.0.0", 13],
	["131.0.72.0", 22],
];

/** Cloudflare 覆写、客户端无法伪造的请求头，按可信度排序 */
const AUTHORITATIVE_HEADERS = ["cf-connecting-ip", "true-client-ip"];

/** 兜底请求头 */
const FALLBACK_HEADERS = ["x-real-ip", "x-client-ip"];

function parseIpv4(ip: string): number | null {
	const parts = ip.split(".");
	if (parts.length !== 4) return null;
	let value = 0;
	for (const part of parts) {
		if (!/^\d{1,3}$/.test(part)) return null;
		const octet = Number(part);
		if (octet > 255) return null;
		value = value * 256 + octet;
	}
	return value;
}

function isIpv6(value: string): boolean {
	return value.includes(":") && /^[0-9a-f:]+$/i.test(value);
}

function isIpLike(value: string): boolean {
	return parseIpv4(value) !== null || isIpv6(value);
}

/** 去掉 IPv6 映射前缀、方括号与端口，得到纯 IP */
export function normalizeIp(raw: string): string {
	let value = (raw || "").trim();
	if (!value) return "";
	if (value.startsWith("[")) {
		const end = value.indexOf("]");
		if (end > 0) value = value.slice(1, end);
	} else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(value)) {
		value = value.slice(0, value.lastIndexOf(":"));
	}
	return value.replace(/^::ffff:/i, "").trim();
}

/** 内网 / 环回 / 链路本地 / CGNAT 地址 */
export function isPrivateIp(ip: string): boolean {
	const value = normalizeIp(ip);
	if (!value) return false;
	if (value === "::" || value === "::1") return true;
	if (isIpv6(value) && /^(fc|fd|fe80)/i.test(value)) return true;
	const octets = value.split(".");
	if (octets.length !== 4) return false;
	const first = Number(octets[0]);
	const second = Number(octets[1]);
	if (!Number.isFinite(first) || !Number.isFinite(second)) return false;
	if (first === 0 || first === 10 || first === 127) return true;
	if (first === 192 && second === 168) return true;
	if (first === 169 && second === 254) return true;
	if (first === 172 && second >= 16 && second <= 31) return true;
	if (first === 100 && second >= 64 && second <= 127) return true;
	return false;
}

/** 是否为 Cloudflare 边缘地址（取访客 IP 时需要跳过） */
export function isCloudflareIp(ip: string): boolean {
	const target = parseIpv4(normalizeIp(ip));
	if (target === null) return false;
	return CLOUDFLARE_IPV4.some(([network, bits]) => {
		const base = parseIpv4(network);
		if (base === null) return false;
		const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
		return (target & mask) === (base & mask);
	});
}

/** 合法且非内网地址 */
export function isPublicIp(ip: string): boolean {
	const value = normalizeIp(ip);
	return isIpLike(value) && !isPrivateIp(value);
}

/** 从请求头里解析客户端真实 IP（解析失败返回空字符串） */
export function getClientIp(request: Request): string {
	const forwardedHops = (request.headers.get("x-forwarded-for") || "")
		.split(",")
		.map(normalizeIp)
		.filter(isIpLike);

	const lastHop = forwardedHops.at(-1) || "";
	// 请求确实经过 Cloudflare：CF-RAY 存在 且 直连 Vercel 的那一跳是 CF 边缘
	const viaCloudflare = Boolean(request.headers.get("cf-ray")) && isCloudflareIp(lastHop);

	// 1) Cloudflare 在边缘覆写、访客无法伪造的头，最可信
	if (viaCloudflare) {
		for (const header of AUTHORITATIVE_HEADERS) {
			const value = normalizeIp(request.headers.get(header) || "");
			if (isIpLike(value)) return value;
		}
	}

	// 2) x-forwarded-for 从右往左：越靠右越接近直连的一跳，
	//    取第一个「公网且不是 Cloudflare 边缘」的地址
	const forwarded = [...forwardedHops].reverse().find((ip) => isPublicIp(ip) && !isCloudflareIp(ip));
	if (forwarded) return forwarded;

	// 3) 兜底：此时多半只能拿到代理自身的 IP
	if (lastHop) return lastHop;
	for (const header of FALLBACK_HEADERS) {
		const value = normalizeIp(request.headers.get(header) || "");
		if (isIpLike(value)) return value;
	}
	return "";
}
