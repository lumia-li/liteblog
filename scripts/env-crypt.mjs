#!/usr/bin/env node
/**
 * env-crypt.mjs — 加密/解密 .env 配置文件
 *
 * 用法：
 *   ENV_CRYPT_PASSPHRASE=<口令> node scripts/env-crypt.mjs encrypt   # .env -> .env.enc（可提交入库）
 *   ENV_CRYPT_PASSPHRASE=<口令> node scripts/env-crypt.mjs decrypt   # .env.enc -> .env（本地还原）
 *
 * 安全约定：
 *   1. .env.enc 是加密产物，可以提交到仓库
 *   2. 口令 ENV_CRYPT_PASSPHRASE 必须离线保管（密码管理器），
 *      不要提交、不要放进 .env.enc、不要发到聊天/群聊里
 *   3. 部署到 Vercel 时：本地 decrypt 后把实际值填到项目环境变量，
 *      或直接在工作流里 decrypt 使用
 *   4. 一旦口令疑似泄露，用新口令重新 encrypt 并更新 .env.enc
 */
import {
	createCipheriv,
	createDecipheriv,
	randomBytes,
	scryptSync,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, ".env");
const DST = join(root, ".env.enc");
const KEY_LEN = 32;

function getPassphrase() {
	const pass = process.env.ENV_CRYPT_PASSPHRASE;
	if (!pass || pass.length < 16) {
		console.error(
			"缺少 ENV_CRYPT_PASSPHRASE 环境变量（至少 16 个字符）。",
		);
		process.exit(1);
	}
	return pass;
}

function encrypt() {
	if (!existsSync(SRC)) {
		console.error(`找不到 ${SRC}，请先创建 .env`);
		process.exit(1);
	}
	const plaintext = readFileSync(SRC);
	const passphrase = getPassphrase();
	const salt = randomBytes(16);
	const iv = randomBytes(12);
	const key = scryptSync(passphrase, salt, KEY_LEN);
	const cipher = createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([
		cipher.update(plaintext),
		cipher.final(),
	]);
	const tag = cipher.getAuthTag();
	const payload = {
		version: 1,
		algorithm: "aes-256-gcm",
		kdf: "scrypt",
		salt: salt.toString("base64"),
		iv: iv.toString("base64"),
		tag: tag.toString("base64"),
		data: ciphertext.toString("base64"),
	};
	writeFileSync(DST, `${JSON.stringify(payload, null, 2)}\n`);
	console.log(`已加密 ${SRC} -> ${DST}`);
}

function decrypt() {
	if (!existsSync(DST)) {
		console.error(`找不到 ${DST}`);
		process.exit(1);
	}
	const passphrase = getPassphrase();
	const payload = JSON.parse(readFileSync(DST, "utf8"));
	if (payload.version !== 1 || payload.algorithm !== "aes-256-gcm") {
		console.error("不支持的加密格式，请检查 .env.enc");
		process.exit(1);
	}
	try {
		const key = scryptSync(
			passphrase,
			Buffer.from(payload.salt, "base64"),
			KEY_LEN,
		);
		const decipher = createDecipheriv(
			"aes-256-gcm",
			key,
			Buffer.from(payload.iv, "base64"),
		);
		decipher.setAuthTag(Buffer.from(payload.tag, "base64"));
		const plaintext = Buffer.concat([
			decipher.update(Buffer.from(payload.data, "base64")),
			decipher.final(),
		]);
		writeFileSync(SRC, plaintext);
		console.log(`已解密 ${DST} -> ${SRC}`);
	} catch (error) {
		console.error("解密失败：口令错误或文件损坏");
		process.exit(1);
	}
}

const mode = process.argv[2];
if (mode === "encrypt") {
	encrypt();
} else if (mode === "decrypt") {
	decrypt();
} else {
	console.error("用法: node scripts/env-crypt.mjs <encrypt|decrypt>");
	process.exit(1);
}
