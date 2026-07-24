import type { APIRoute } from "astro";
import { getQQLoginConfig, setSession } from "../../../utils/auth-server";

// 心月互联 QQ 登录用户信息接口
interface QQUserInfo {
	code: number;
	msg: string;
	data?: {
		openid: string;
		nickname: string;
		avatar: string;
		sex?: string;
		year?: string;
	};
}

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	try {
		const url = new URL(request.url);
		const code = url.searchParams.get("code");
		const msg = url.searchParams.get("msg");

		if (!code) {
			return new Response(JSON.stringify({ error: "缺少 code 参数" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		console.log("QQ 登录回调:", { code, msg });

		// 使用 code 获取用户信息
		// 文档：https://qq.wch666.com/api/get_user_info.php?code=[code]
		const userInfoUrl = `https://qq.wch666.com/api/get_user_info.php?code=${encodeURIComponent(code)}`;
		const response = await fetch(userInfoUrl);
		const result: QQUserInfo = await response.json();

		console.log("QQ 用户信息响应:", result);

		if (result.code !== 200 || !result.data) {
			return new Response(JSON.stringify({ error: "获取用户信息失败", detail: result.msg }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const { openid, nickname, avatar } = result.data;

		// 创建用户对象，使用现有的 OAuthUser 格式
		const user = {
			id: openid,
			username: nickname || `QQ用户${openid.slice(0, 6)}`,
			email: "",
			display_name: nickname || `QQ用户${openid.slice(0, 6)}`,
			avatar_url: avatar || "",
			role: "user" as const,
		};

		// 创建会话
		const session = {
			user,
			accessToken: "", // QQ 登录不需要 access_token
			expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 天
		};

		// 重定向到首页，并设置会话 cookie
		let redirectResponse = new Response(null, {
			status: 302,
			headers: {
				Location: "/",
			},
		});

		// 设置会话 cookie
		redirectResponse = setSession(redirectResponse, session, request);

		return redirectResponse;
	} catch (error) {
		console.error("QQ 登录回调处理失败:", error);
		return new Response(JSON.stringify({ error: "QQ 登录处理失败" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};
