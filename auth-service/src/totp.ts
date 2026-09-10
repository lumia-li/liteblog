import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "./env.ts";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30;

function keyMaterial(): Buffer {
	return createHash("sha256").update(env.totpEncryptionKey, "utf8").digest();
}

// AES-GCM keeps the TOTP seed out of plaintext database dumps.
export function encryptSecret(secret: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
	const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSecret(value: string): string {
	const raw = Buffer.from(value, "base64url");
	if (raw.length < 29) throw new Error("Invalid TOTP secret");
	const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), raw.subarray(0, 12));
	decipher.setAuthTag(raw.subarray(12, 28));
	return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}

export function generateSecret(): string {
	const bytes = randomBytes(20);
	let output = "";
	let buffer = 0;
	let bits = 0;
	for (const byte of bytes) {
		buffer = (buffer << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			output += ALPHABET[(buffer >>> bits) & 31];
		}
	}
	if (bits > 0) output += ALPHABET[(buffer << (5 - bits)) & 31];
	return output;
}

function decodeBase32(value: string): Buffer {
	let buffer = 0;
	let bits = 0;
	const bytes: number[] = [];
	for (const char of value.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "")) {
		const index = ALPHABET.indexOf(char);
		if (index < 0) throw new Error("Invalid TOTP secret");
		buffer = (buffer << 5) | index;
		bits += 5;
		if (bits >= 8) {
			bits -= 8;
			bytes.push((buffer >>> bits) & 255);
		}
	}
	return Buffer.from(bytes);
}

export function verifyCode(secret: string, code: string, now = Date.now()): boolean {
	if (!/^\d{6}$/.test(code)) return false;
	const key = decodeBase32(secret);
	const counter = Math.floor(now / 1000 / PERIOD);
	for (let offset = -1; offset <= 1; offset += 1) {
		const payload = Buffer.alloc(8);
		payload.writeBigInt64BE(BigInt(counter + offset));
		const digest = createHmac("sha1", key).update(payload).digest();
		const index = digest[digest.length - 1] & 15;
		const number = ((digest[index] & 127) << 24) | (digest[index + 1] << 16) | (digest[index + 2] << 8) | digest[index + 3];
		if (String(number % 1_000_000).padStart(6, "0") === code) return true;
	}
	return false;
}

export function otpauthUri(secret: string, account: string): string {
	const issuer = encodeURIComponent(env.totpIssuer);
	return `otpauth://totp/${issuer}:${encodeURIComponent(account)}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${PERIOD}`;
}
