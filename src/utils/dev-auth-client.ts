const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export const DEV_EDITOR_CREDENTIAL_STORAGE_KEY = "devEditorCredential";
export const DEV_EDITOR_LEGACY_CODE_STORAGE_KEY = "devEditorCode";

export function isSha256Hex(value: string): boolean {
	return SHA256_HEX_PATTERN.test(value.trim());
}

export async function hashDevCodeClient(code: string): Promise<string> {
	if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
		throw new Error("当前环境不支持口令加密");
	}
	const input = new TextEncoder().encode(code);
	const digest = await crypto.subtle.digest("SHA-256", input);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

function canUseStorage(): boolean {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

export function readStoredDevCredential(): string {
	if (!canUseStorage()) return "";

	const credential =
		localStorage.getItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY) || "";
	if (isSha256Hex(credential)) {
		return credential.trim().toLowerCase();
	}

	const legacy = localStorage.getItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY) || "";
	if (isSha256Hex(legacy)) {
		const normalized = legacy.trim().toLowerCase();
		localStorage.setItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY, normalized);
		localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
		return normalized;
	}

	return "";
}

export function storeDevCredential(hash: string): void {
	if (!canUseStorage()) return;
	if (!isSha256Hex(hash)) return;
	localStorage.setItem(
		DEV_EDITOR_CREDENTIAL_STORAGE_KEY,
		hash.trim().toLowerCase(),
	);
	localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
}

export function clearStoredDevCredential(): void {
	if (!canUseStorage()) return;
	localStorage.removeItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY);
	localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
}

export async function migrateLegacyDevCodeToCredential(): Promise<void> {
	if (!canUseStorage()) return;
	if (readStoredDevCredential()) return;

	const legacyRaw =
		localStorage.getItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY) || "";
	const legacy = legacyRaw.trim();
	if (!legacy) return;

	if (isSha256Hex(legacy)) {
		storeDevCredential(legacy);
		return;
	}

	try {
		const hashed = await hashDevCodeClient(legacy);
		storeDevCredential(hashed);
	} finally {
		localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
	}
}
