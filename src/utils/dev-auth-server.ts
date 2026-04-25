import { createHash } from "node:crypto";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function hashDevCodeServer(code: string): string {
	return createHash("sha256").update(code, "utf8").digest("hex");
}

export function isSha256Hex(value: string): boolean {
	return SHA256_HEX_PATTERN.test(value.trim());
}

function safeEqualHex(left: string, right: string): boolean {
	if (!isSha256Hex(left) || !isSha256Hex(right)) {
		return false;
	}
	const normalizedLeft = left.trim().toLowerCase();
	const normalizedRight = right.trim().toLowerCase();
	if (normalizedLeft.length !== normalizedRight.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < normalizedLeft.length; i += 1) {
		diff |= normalizedLeft.charCodeAt(i) ^ normalizedRight.charCodeAt(i);
	}
	return diff === 0;
}

export function matchDevCredential(input: {
	devCode?: string;
	devCodeHash?: string;
	expectedCode: string;
}): boolean {
	const expectedHash = hashDevCodeServer(input.expectedCode);
	const providedHash = (input.devCodeHash || "").trim().toLowerCase();
	if (providedHash && safeEqualHex(providedHash, expectedHash)) {
		return true;
	}
	const providedCode = (input.devCode || "").trim();
	if (!providedCode) {
		return false;
	}
	return providedCode === input.expectedCode;
}
