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

	/** 头像图片磁盘存储目录（相对启动目录或绝对路径） */
	avatarDir: optional("AVATAR_DIR", "data/avatars"),
	/** 头像对外访问地址前缀，如 https://api.liyueovo.top/avatars（留空则用请求 Host 推导） */
	avatarPublicBase: optional("AVATAR_PUBLIC_BASE"),
} as const;
