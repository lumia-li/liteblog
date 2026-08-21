import type { APIRoute } from "astro";
import { getQQLoginConfig } from "../../../utils/auth-server";

export const prerender = false;

export const GET: APIRoute = async () => {
	try {
		const { token } = getQQLoginConfig();

		// 构建心月互联 QQ 登录 URL
		// 文档：https://qq.wch666.com/api/qq.php?token=[token]&msg=[信息]&display['pc'|'mobile']
		// 回调地址需要在心月互联后台预先配置
		// msg 参数会在登录成功后传回，用于标识登录来源
		const url = `https://qq.wch666.com/api/qq.php?token=${token}&msg=qq_login&display=pc`;

		return new Response(null, {
			status: 302,
			headers: {
				Location: url,
			},
		});
	} catch (error) {
		console.error("QQ 登录发起失败:", error);
		return new Response(JSON.stringify({ error: "QQ 登录配置错误" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
