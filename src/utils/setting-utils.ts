import {
	AUTO_MODE,
	DARK_MODE,
	DEFAULT_THEME,
	LIGHT_MODE,
} from "@constants/constants.ts";
import { expressiveCodeConfig } from "@/config";
import type { LIGHT_DARK_MODE } from "@/types/config";

function resolveExpressiveCodeTheme(theme: LIGHT_DARK_MODE): string {
	const configured = expressiveCodeConfig.theme;
	if (Array.isArray(configured)) {
		const [lightTheme, darkTheme] = configured;
		if (theme === DARK_MODE) return darkTheme;
		if (theme === LIGHT_MODE) return lightTheme;
		return window.matchMedia("(prefers-color-scheme: dark)").matches
			? darkTheme
			: lightTheme;
	}
	return configured;
}

function canUseStorage(): boolean {
	return (
		typeof window !== "undefined" && typeof window.localStorage !== "undefined"
	);
}

export function getDefaultHue(): number {
	const fallback = "250";
	if (typeof document === "undefined") {
		return Number.parseInt(fallback, 10);
	}
	const configCarrier = document.getElementById("config-carrier");
	return Number.parseInt(configCarrier?.dataset.hue || fallback, 10);
}

export function getHue(): number {
	if (!canUseStorage()) {
		return getDefaultHue();
	}
	const stored = localStorage.getItem("hue");
	return stored ? Number.parseInt(stored, 10) : getDefaultHue();
}

export function setHue(hue: number): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.setItem("hue", String(hue));
	const r = document.querySelector(":root") as HTMLElement;
	if (!r) {
		return;
	}
	r.style.setProperty("--hue", String(hue));
}

export function applyThemeToDocument(theme: LIGHT_DARK_MODE) {
	switch (theme) {
		case LIGHT_MODE:
			document.documentElement.classList.remove("dark");
			break;
		case DARK_MODE:
			document.documentElement.classList.add("dark");
			break;
		case AUTO_MODE:
			if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
				document.documentElement.classList.add("dark");
			} else {
				document.documentElement.classList.remove("dark");
			}
			break;
	}

	// Set to theme for Expressive Code
	document.documentElement.setAttribute(
		"data-theme",
		resolveExpressiveCodeTheme(theme),
	);
}

function applyThemeWithTransitions(theme: LIGHT_DARK_MODE): void {
	const root = document.documentElement;
	const prefersReducedMotion = window.matchMedia(
		"(prefers-reduced-motion: reduce)",
	).matches;
	const doc = document as Document & {
		startViewTransition?: (callback: () => void) => { finished?: Promise<void> };
	};

	if (!prefersReducedMotion && typeof doc.startViewTransition === "function") {
		try {
			const transition = doc.startViewTransition(() => {
				applyThemeToDocument(theme);
			});
			transition.finished?.catch(() => {
				// View transitions can be aborted by rapid toggles or navigation.
			});
		} catch {
			applyThemeToDocument(theme);
		}
		return;
	}

	root.classList.add("theme-switching-soft");
	applyThemeToDocument(theme);
	window.setTimeout(() => {
		root.classList.remove("theme-switching-soft");
	}, 320);
}

export function setTheme(theme: LIGHT_DARK_MODE): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.setItem("theme", theme);
	applyThemeWithTransitions(theme);
}

export function getStoredTheme(): LIGHT_DARK_MODE {
	if (!canUseStorage()) {
		return DEFAULT_THEME;
	}
	return (localStorage.getItem("theme") as LIGHT_DARK_MODE) || DEFAULT_THEME;
}

// Rainbow mode settings
let rainbowInterval: number | null = null;
let currentHue = 0;
const UPDATE_INTERVAL = 45; // Reduce repaint pressure when rainbow mode is on.

export function getRainbowMode(): boolean {
	if (!canUseStorage()) {
		return false;
	}
	return localStorage.getItem("rainbowMode") === "true";
}

function updateRainbowHue(root: HTMLElement): void {
	currentHue = (currentHue + 1) % 360;
	root.style.setProperty("--hue", String(currentHue));
}

export function setRainbowMode(enabled: boolean): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.setItem("rainbowMode", String(enabled));
	const root = document.querySelector(":root") as HTMLElement;
	if (!root) return;

	root.classList.toggle("rainbow-mode", enabled);

	// Clear any existing rainbow timer.
	if (rainbowInterval !== null) {
		clearInterval(rainbowInterval);
		rainbowInterval = null;
	}

	if (enabled) {
		// Start rainbow effect using a fixed interval to avoid per-frame callbacks.
		currentHue =
			Number.parseInt(root.style.getPropertyValue("--hue"), 10) || getHue();
		updateRainbowHue(root);
		rainbowInterval = window.setInterval(
			() => updateRainbowHue(root),
			UPDATE_INTERVAL,
		);
	} else {
		// Restore the original hue from localStorage
		const hue = getHue();
		root.style.setProperty("--hue", String(hue));
	}

	// Dispatch event for rainbow mode change
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("rainbow-mode-change", { detail: enabled }),
		);
	}
}

// Rain effect settings
export type RainConfig = {
	count: number;
	width: number;
	length: number;
	speed: number;
	angle: number;
};

const DEFAULT_RAIN_CONFIG: RainConfig = {
	count: 165,
	width: 2.9,
	length: 70,
	speed: 11,
	angle: -0.1,
};

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function sanitizeRainConfig(input?: Partial<RainConfig>): RainConfig {
	const merged = { ...DEFAULT_RAIN_CONFIG, ...(input || {}) };
	return {
		count: Math.round(clamp(Number(merged.count), 10, 1000)),
		width: clamp(Number(merged.width), 0.5, 5),
		length: Math.round(clamp(Number(merged.length), 5, 120)),
		speed: Math.round(clamp(Number(merged.speed), 5, 60)),
		angle: clamp(Number(merged.angle), -0.8, 0.8),
	};
}

export function getDefaultRainConfig(): RainConfig {
	return { ...DEFAULT_RAIN_CONFIG };
}

export function getRainConfig(): RainConfig {
	if (!canUseStorage()) {
		return getDefaultRainConfig();
	}
	const stored = localStorage.getItem("rainConfig");
	if (!stored) {
		return getDefaultRainConfig();
	}
	try {
		return sanitizeRainConfig(JSON.parse(stored));
	} catch {
		return getDefaultRainConfig();
	}
}

export function setRainConfig(config: RainConfig): void {
	if (!canUseStorage()) {
		return;
	}
	const next = sanitizeRainConfig(config);
	localStorage.setItem("rainConfig", JSON.stringify(next));
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("rain-config-change", { detail: next }),
		);
	}
}

export function getRainMode(): boolean {
	if (!canUseStorage()) {
		return false;
	}
	return localStorage.getItem("rainMode") === "true";
}

export function setRainMode(enabled: boolean): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.setItem("rainMode", String(enabled));
	const root = document.querySelector(":root") as HTMLElement | null;
	if (root) {
		root.classList.toggle("rain-effect", enabled);
	}
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("rain-mode-change", { detail: enabled }),
		);
	}
}

// Developer mode settings
const DEV_EDITOR_ENABLED_KEY = "devEditorEnabled";
const DEV_EDITOR_CREDENTIAL_STORAGE_KEY = "devEditorCredential";
const DEV_EDITOR_LEGACY_CODE_STORAGE_KEY = "devEditorCode";
const DEV_EDITOR_AUTO_LOCK_AT_KEY = "devEditorAutoLockAt";
const DEV_EDITOR_SESSION_KEY = "devEditorSessionActive";
const DEV_EDITOR_SESSION_GRACE_UNTIL_KEY = "devEditorSessionGraceUntil";
const DEV_EDITOR_AUTO_LOCK_DELAY_MS = 10 * 60 * 1000;
const DEV_EDITOR_SESSION_RECOVERY_GRACE_MS = 30 * 1000;

function emitDeveloperModeChange(enabled: boolean): void {
	if (typeof window !== "undefined") {
		window.dispatchEvent(
			new CustomEvent("developer-mode-change", { detail: enabled }),
		);
	}
}

function getDeveloperModeAutoLockAt(): number | null {
	const raw = localStorage.getItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
	if (!raw) {
		return null;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		localStorage.removeItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
		return null;
	}
	return parsed;
}

function hasDeveloperModeSession(): boolean {
	if (
		typeof window === "undefined" ||
		typeof window.sessionStorage === "undefined"
	) {
		return false;
	}
	try {
		return sessionStorage.getItem(DEV_EDITOR_SESSION_KEY) === "true";
	} catch {
		return false;
	}
}

function getDeveloperModeSessionGraceUntil(): number | null {
	if (!canUseStorage()) {
		return null;
	}
	const raw = localStorage.getItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
	if (!raw) {
		return null;
	}
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
		return null;
	}
	return parsed;
}

function recoverDeveloperModeSessionIfAllowed(): boolean {
	if (!canUseStorage()) {
		return false;
	}
	const graceUntil = getDeveloperModeSessionGraceUntil();
	if (!graceUntil || Date.now() > graceUntil) {
		localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
		return false;
	}
	const credential =
		localStorage.getItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY) ||
		localStorage.getItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY) ||
		"";
	if (!credential.trim()) {
		localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
		return false;
	}
	try {
		sessionStorage.setItem(DEV_EDITOR_SESSION_KEY, "true");
	} catch {
		return false;
	}
	return true;
}

function expireDeveloperModeIfNeeded(): boolean {
	if (!canUseStorage()) {
		return false;
	}
	if (localStorage.getItem(DEV_EDITOR_ENABLED_KEY) !== "true") {
		return false;
	}
	if (!hasDeveloperModeSession()) {
		if (recoverDeveloperModeSessionIfAllowed()) {
			return false;
		}
		localStorage.setItem(DEV_EDITOR_ENABLED_KEY, "false");
		localStorage.removeItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
		localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
		localStorage.removeItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY);
		localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
		emitDeveloperModeChange(false);
		return true;
	}
	localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
	const autoLockAt = getDeveloperModeAutoLockAt();
	if (!autoLockAt || Date.now() < autoLockAt) {
		return false;
	}
	localStorage.setItem(DEV_EDITOR_ENABLED_KEY, "false");
	localStorage.removeItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
	localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
	localStorage.removeItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY);
	localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
	emitDeveloperModeChange(false);
	return true;
}

export function getDeveloperModeEnabled(): boolean {
	if (!canUseStorage()) {
		return false;
	}
	if (expireDeveloperModeIfNeeded()) {
		return false;
	}
	return localStorage.getItem(DEV_EDITOR_ENABLED_KEY) === "true";
}

export function setDeveloperModeEnabled(
	enabled: boolean,
	options: { emitEvent?: boolean } = {},
): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.setItem(DEV_EDITOR_ENABLED_KEY, String(enabled));
	localStorage.removeItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
	if (enabled) {
		localStorage.setItem(
			DEV_EDITOR_SESSION_GRACE_UNTIL_KEY,
			String(Date.now() + DEV_EDITOR_SESSION_RECOVERY_GRACE_MS),
		);
	} else {
		localStorage.removeItem(DEV_EDITOR_SESSION_GRACE_UNTIL_KEY);
	}
	try {
		if (enabled) {
			sessionStorage.setItem(DEV_EDITOR_SESSION_KEY, "true");
		} else {
			sessionStorage.removeItem(DEV_EDITOR_SESSION_KEY);
		}
	} catch (_error) {
		// Ignore storage exceptions; developer mode will fail closed.
	}
	if (!enabled) {
		localStorage.removeItem(DEV_EDITOR_CREDENTIAL_STORAGE_KEY);
		localStorage.removeItem(DEV_EDITOR_LEGACY_CODE_STORAGE_KEY);
	}
	if (options.emitEvent !== false) {
		emitDeveloperModeChange(enabled);
	}
}

export function clearDeveloperModeAutoLock(): void {
	if (!canUseStorage()) {
		return;
	}
	localStorage.removeItem(DEV_EDITOR_AUTO_LOCK_AT_KEY);
}

export function scheduleDeveloperModeAutoLock(
	delayMs = DEV_EDITOR_AUTO_LOCK_DELAY_MS,
): void {
	if (!canUseStorage()) {
		return;
	}
	if (localStorage.getItem(DEV_EDITOR_ENABLED_KEY) !== "true") {
		return;
	}
	const safeDelay = Math.max(0, Math.floor(delayMs));
	const autoLockAt = Date.now() + safeDelay;
	localStorage.setItem(DEV_EDITOR_AUTO_LOCK_AT_KEY, String(autoLockAt));
}
