/** 环境变量读取与校验（启动时一次性完成） */

function required(name: string): string {
	const value = String(process.env[name] || "").trim();
	if (!value) {
		throw new Error(`[auth-service] 缺少必需的环境变量: ${name}`);
	}
	return value;
}

function optional(name: string, fallback = ""): string {
	return String(process.env[name] || "").trim() || fallback;
}

function num(name: string, fallback: number): number {
	const value = Number(process.env[name]);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return "";
	}
}

export const env = {
	port: num("PORT", 4100),
	/** 监听地址：默认仅本机（Nginx 反代场景），需要公网直连时显式设为 0.0.0.0 */
	host: optional("HOST", "127.0.0.1"),
	corsOrigin: optional("CORS_ORIGIN"),
	apiKey: required("AUTH_SERVICE_API_KEY"),

	db: {
		host: optional("DB_HOST", "127.0.0.1"),
		port: num("DB_PORT", 3306),
		user: required("DB_USER"),
		password: required("DB_PASSWORD"),
		database: required("DB_NAME"),
		poolLimit: num("DB_POOL_LIMIT", 10),
	},

	smtp: {
		host: required("SMTP_HOST"),
		port: num("SMTP_PORT", 465),
		secure: optional("SMTP_SECURE", "true") === "true",
		user: required("SMTP_USER"),
		pass: required("SMTP_PASS"),
		fromName: optional("SMTP_FROM_NAME"),
	},

	verifyExpireMinutes: num("VERIFY_EXPIRE_MINUTES", 15),
	siteUrl: optional("SITE_URL", "https://li.liyueovo.top"),
	sessionDays: num("SESSION_DAYS", 7),
	/** TOTP seeds are encrypted at rest with this key. Defaults to the API key. */
	totpEncryptionKey: optional("TOTP_ENCRYPTION_KEY", optional("AUTH_SERVICE_API_KEY")),
	totpIssuer: optional("TOTP_ISSUER", "Liyue Blog"),

	/**
	 * WebAuthn / Passkey 配置。
	 * rpId 默认取 SITE_URL 的主机名；origins 默认取 SITE_URL（浏览器在此域名上完成验证仪式）。
	 * 若博客域名与 SITE_URL 不同，请显式设置 RP_ID 与 PASSKEY_ORIGINS（逗号分隔）。
	 */
	rpId: optional("RP_ID") || hostnameOf(optional("SITE_URL", "https://li.liyueovo.top")),
	rpName: optional("RP_NAME", "liyue blog"),
	passkeyOrigins: (() => {
		const raw = optional("PASSKEY_ORIGINS");
		const list = raw ? raw.split(",").map((item) => item.trim()).filter(Boolean) : [];
		if (list.length) return list;
		const site = optional("SITE_URL", "https://li.liyueovo.top");
		return [site.replace(/\/+$/, "")];
	})(),

	/** 头像图片磁盘存储目录（相对启动目录或绝对路径） */
	avatarDir: optional("AVATAR_DIR", "data/avatars"),
	/** 头像对外访问地址前缀，如 https://api.liyueovo.top/avatars（留空则用请求 Host 推导） */
	avatarPublicBase: optional("AVATAR_PUBLIC_BASE"),
} as const;
