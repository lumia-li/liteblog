import type { APIRoute } from "astro";
import sharp from "sharp";
import { readSession, setSession } from "@utils/auth-server";
import { callAuthService, isAuthServiceConfigured, json } from "@utils/auth-service";

export const prerender = false;

type ServiceUser = {
	id: string;
	username: string;
	email: string;
	display_name: string;
	avatar_url: string;
	role: "admin" | "user";
};

/**
 * POST /api/account/avatar —— 邮箱注册账号自行更换头像。
 * 流程：
 *  1. 校验登录态与账号类型（仅邮箱账号，id 为纯数字；OAuth 账号资料由平台托管）；
 *  2. 校验图片大小（≤4MB，Vercel 请求体上限 4.5MB 留余量）与格式；
 *  3. 前端裁剪弹窗传回裁剪矩形（原图自然坐标），sharp 按 EXIF 自动转向后裁剪，
 *     统一输出 512x512 WebP（quality=100，视觉无损且体积小）；
 *  4. 以 base64 推给认证服务，落盘到服务器本地并更新 users.avatar_url；
 *  5. 重签会话。
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB
const OUTPUT_SIZE = 512;
const MIN_CROP_SIZE = 16;
const ALLOWED_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/avif",
]);

type CropRect = { left: number; top: number; size: number };

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** 解析并校验前端传回的裁剪参数（自然坐标下的正方形），稍后按图片实际尺寸再收缩 */
function parseCropRect(raw: FormDataEntryValue | null): CropRect | null {
	if (typeof raw !== "string" || !raw) return null;
	try {
		const data = JSON.parse(raw) as Record<string, unknown>;
		const left = Number(data.left);
		const top = Number(data.top);
		const size = Number(data.size);
		if (![left, top, size].every((n) => Number.isFinite(n))) return null;
		if (size < 1) return null;
		return { left, top, size };
	} catch {
		return null;
	}
}

export const POST: APIRoute = async ({ request }) => {
	const session = await readSession(request);
	if (!session) return json(401, { ok: false, message: "请先登录" });

	// 仅邮箱注册账号支持自传头像；OAuth 用户头像由对应平台管理
	if (!/^\d+$/.test(session.user.id)) {
		return json(400, { ok: false, message: "第三方登录账号的头像由对应平台管理，无法在此修改" });
	}

	if (!isAuthServiceConfigured()) {
		return json(500, { ok: false, message: "头像存储服务未配置（AUTH_SERVICE_URL / AUTH_SERVICE_API_KEY）" });
	}

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return json(400, { ok: false, message: "请求格式不正确" });
	}

	const file = form.get("file");
	if (!(file instanceof File)) return json(400, { ok: false, message: "请选择图片文件" });
	if (file.size > MAX_UPLOAD_BYTES) {
		return json(413, { ok: false, message: "图片太大，请选择 4MB 以内的图片" });
	}
	if (file.type && !ALLOWED_TYPES.has(file.type)) {
		return json(400, { ok: false, message: "仅支持 JPG / PNG / WebP / GIF / AVIF 格式" });
	}

	try {
		const input = Buffer.from(await file.arrayBuffer());
		// rotate()：按 EXIF 自动摆正（旋转发生在裁剪之前，坐标空间一致）
		const image = sharp(input, { failOn: "error" }).rotate();
		const meta = await image.metadata();
		const rawW = meta.width ?? 0;
		const rawH = meta.height ?? 0;
		if (!rawW || !rawH) return json(400, { ok: false, message: "图片解析失败，请更换图片" });

		// EXIF orientation 5-8 表示旋转 90°，宽高互换；浏览器展示的已是转向后的尺寸
		const orientation = meta.orientation ?? 1;
		const naturalW = orientation >= 5 ? rawH : rawW;
		const naturalH = orientation >= 5 ? rawW : rawH;

		const crop = parseCropRect(form.get("crop"));
		const cropSize = clamp(
			Math.round(crop?.size ?? Math.min(naturalW, naturalH)),
			MIN_CROP_SIZE,
			Math.min(naturalW, naturalH),
		);
		const cropLeft = clamp(
			Math.round(crop?.left ?? 0),
			0,
			Math.max(0, naturalW - cropSize),
		);
		const cropTop = clamp(
			Math.round(crop?.top ?? 0),
			0,
			Math.max(0, naturalH - cropSize),
		);

		// 裁剪 → 等比缩放到 512x512 → WebP quality=100（视觉无损、体积小）
		const webpBuffer = await image
			.extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
			.resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "cover", kernel: "lanczos3" })
			.webp({ quality: 100, smartSubsample: false })
			.toBuffer();

		// 推给认证服务：base64 落盘到服务器本地，并更新 users.avatar_url
		const data = await callAuthService<{ user: ServiceUser }>("/account/avatar", {
			method: "POST",
			body: {
				userId: session.user.id,
				imageBase64: webpBuffer.toString("base64"),
			},
		});

		const response = json(200, { ok: true, user: data.user });
		setSession(response, {
			user: data.user,
			accessToken: session.accessToken,
			expiresAt: session.expiresAt,
		}, request);
		return response;
	} catch (error) {
		console.error("[account/avatar] 更换头像失败:", error);
		return json(500, { ok: false, message: "头像处理失败，请稍后重试" });
	}
};
