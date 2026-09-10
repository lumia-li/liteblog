import nodemailer from "nodemailer";
import { env } from "./env.ts";

const transporter = nodemailer.createTransport({
	host: env.smtp.host,
	port: env.smtp.port,
	secure: env.smtp.secure,
	auth: {
		user: env.smtp.user,
		pass: env.smtp.pass,
	},
});

function fromAddress(): string {
	return env.smtp.fromName
		? `"${env.smtp.fromName}" <${env.smtp.user}>`
		: env.smtp.user;
}

/** 简单 HTML 邮件模板（内联样式，兼容各邮箱客户端） */
function buildHtml(title: string, body: string, link?: { href: string; label: string }): string {
	return `<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#f5f6f8;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e8ee;">
    <div style="padding:24px 28px;border-bottom:1px solid #eef1f5;">
      <span style="font-size:18px;font-weight:700;color:#1d2838;">${env.smtp.fromName || "博客"}</span>
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 12px;font-size:18px;color:#1d2838;">${title}</h2>
      ${body}
      ${
				link
					? `<div style="margin-top:20px;">
             <a href="${link.href}" style="display:inline-block;padding:10px 22px;background:#1d2838;color:#ffffff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:600;">${link.label}</a>
             <p style="margin:14px 0 0;font-size:12px;color:#9ca3af;word-break:break-all;">若按钮无法点击，请复制此链接到浏览器打开：<br>${link.href}</p>
           </div>`
					: ""
			}
      <p style="margin:22px 0 0;font-size:12px;color:#9ca3af;">若非本人操作，请忽略此邮件。</p>
    </div>
  </div>
</body></html>`;
}

export async function sendVerificationMail(params: {
	to: string;
	code: string;
	purpose: "register" | "change-email" | "delete-account";
	token: string;
}): Promise<void> {
	const isRegister = params.purpose === "register";
	const isDelete = params.purpose === "delete-account";
	const setUrl = `${env.siteUrl}/auth/set-password?token=${params.token}`;
	const minutes = env.verifyExpireMinutes;

	// 临时 A/B 验证：注销邮件避免"注销/删除"等被邮箱商风控的关键词
	const title = isRegister
		? `注册验证码：${params.code}`
		: isDelete
			? `安全验证码：${params.code}`
			: `换绑邮箱验证码：${params.code}`;

	const intro = isRegister
		? "你正在注册博客账号。"
		: isDelete
			? "你正在执行一项账号设置变更。"
			: "你正在为博客账号换绑邮箱。";

	const body = `
      <p style="margin:0 0 8px;font-size:14px;color:#374151;">你好！</p>
      <p style="margin:0 0 12px;font-size:14px;color:#374151;">${intro}本次验证码 <strong style="font-size:22px;letter-spacing:4px;color:#1d2838;">${params.code}</strong>（${minutes} 分钟内有效）。</p>
      ${
				isDelete
					? `<p style="margin:0;font-size:14px;color:#dc2626;font-weight:600;">请勿将验证码透露给任何人。若非本人操作，请立即修改密码以确保账号安全。</p>`
					: isRegister
						? `<p style="margin:0;font-size:14px;color:#374151;">点击下方链接即可直接设置密码，完成注册：</p>`
						: `<p style="margin:0;font-size:14px;color:#374151;">点击下方链接确认换绑：</p>`
			}`;

	await transporter.sendMail({
		from: fromAddress(),
		to: params.to,
		subject: title,
		html: buildHtml(
			title,
			body,
			isDelete ? undefined : { href: setUrl, label: isRegister ? "设置密码，完成注册" : "确认换绑邮箱" },
		),
		text: isDelete
			? `${title}\n\n验证码：${params.code}（${minutes} 分钟内有效）\n\n若非本人操作，请立即修改密码以确保账号安全。`
			: `${title}\n\n验证码：${params.code}（${minutes} 分钟内有效）\n链接：${setUrl}\n\n若非本人操作，请忽略此邮件。`,
	});
}
