import express from "express";
import "dotenv/config";
import { env } from "./env.ts";
import { asyncHandler, corsMiddleware, requireApiKey } from "./middleware.ts";
import accountRoutes from "./routes/account.ts";
import loginRoutes from "./routes/login.ts";
import registerRoutes from "./routes/register.ts";
import setPasswordRoutes from "./routes/set-password.ts";
import verifyRoutes from "./routes/verify.ts";
import { pool } from "./db.ts";
import sessionRoutes from "./routes/sessions.ts";
import { passkeyAccountRoutes, passkeyLoginRoutes } from "./routes/passkey.ts";

const app = express();

// 保留原始 body 字符串，readJsonBody 统一解析
// 上限放宽到 4MB：头像上传走 base64 JSON（512 WebP 通常只有几十 KB，留足余量）
app.use(express.text({ type: () => true, limit: "4mb" }));
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(corsMiddleware);

// 头像静态资源（无需 API Key，供 <img> 直接访问）。
// 注意：若认证服务挂在 Nginx 反代后，需把 /avatars 路径也代理出去。
app.use("/avatars", express.static(env.avatarDir, { maxAge: "30d", index: false }));

// 健康检查（无需鉴权）
app.get("/health", asyncHandler(async (_req, res) => {
	try {
		await pool.query("SELECT 1");
		res.json({ ok: true, db: true });
	} catch {
		res.status(500).json({ ok: false, db: false });
	}
}));

// 以下全部接口要求服务间 API Key
// 挂载后实际路径：
//   POST /email/send-code            发送验证码邮件
//   POST /email/verify-code          弹窗内校验验证码，换取设密码 token
//   GET  /email/check-token          落地页校验 token
//   POST /email/set-password         凭 token 设密码（注册建号 / 换绑邮箱）
//   POST /email/login                邮箱密码登录
//   PATCH /account/username          改用户名
//   POST  /account/avatar            上传头像并落库（base64 WebP）
//   GET   /avatars/*                 头像静态资源（公开）
//   POST  /account/email/verify      凭验证码换绑邮箱
//   POST  /account/password          改密码
//   DELETE /account                  注销账号（需邮箱验证码）
//   GET   /account/me                读取邮箱账号信息
app.use("/email", requireApiKey, registerRoutes);
app.use("/email", requireApiKey, verifyRoutes);
app.use("/email", requireApiKey, setPasswordRoutes);
app.use("/email", requireApiKey, loginRoutes);
app.use("/account", requireApiKey, accountRoutes);
app.use("/account", requireApiKey, sessionRoutes);
app.use("/account", requireApiKey, passkeyAccountRoutes);
app.use("/passkey", requireApiKey, passkeyLoginRoutes);

app.use((_req, res) => {
	res.status(404).json({ ok: false, message: "Not Found" });
});

// 错误兜底
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error("[auth-service] 未捕获错误:", error);
	res.status(500).json({ ok: false, message: "服务器错误" });
});

app.listen(env.port, env.host, () => {
	console.log(`[auth-service] listening on http://${env.host}:${env.port}`);
});
