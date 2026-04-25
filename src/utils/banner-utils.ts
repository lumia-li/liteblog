import {
	BANNER_HEIGHT,
	BANNER_HEIGHT_EXTEND,
	BANNER_HEIGHT_HOME,
} from "@constants/constants";

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function parsePercent(token: string): number | null {
	const match = token.match(/^(\d+(?:\.\d+)?)%$/);
	if (!match) return null;
	const value = Number.parseFloat(match[1] ?? "");
	return Number.isFinite(value) ? clamp(value, 0, 100) : null;
}

function parseKeywordPercent(token: string): number | null {
	switch (token) {
		case "top":
			return 0;
		case "bottom":
			return 100;
		case "center":
			return 50;
		default:
			return null;
	}
}

export function normalizeBannerObjectPosition(position?: string): string {
	if (!position) return "center";
	const trimmed = position.trim();
	if (!trimmed) return "center";

	// If user provides only a percentage, treat it as vertical focus (y) for convenience.
	if (/^\d+(?:\.\d+)?%$/.test(trimmed)) {
		return `center ${trimmed}`;
	}
	return trimmed;
}

export function extractBannerVerticalPercent(position?: string): number | null {
	if (!position) return null;
	const raw = position.trim().toLowerCase();
	if (!raw) return null;

	// Common single-token keywords.
	const keyword = parseKeywordPercent(raw);
	if (keyword !== null) return keyword;

	// Convenience: single percentage token means vertical percent.
	const singlePercent = parsePercent(raw);
	if (singlePercent !== null) return singlePercent;

	const tokens = raw.split(/\s+/).filter(Boolean);
	if (tokens.length === 0) return null;

	// object-position usually provides `x y`; take the 2nd token as y when possible.
	if (tokens.length >= 2) {
		const yToken = tokens[1] ?? "";
		const yKeyword = parseKeywordPercent(yToken);
		if (yKeyword !== null) return yKeyword;
		const yPercent = parsePercent(yToken);
		if (yPercent !== null) return yPercent;
	}

	// Handle swapped order like `top left`.
	for (const token of tokens) {
		const tokenKeyword = parseKeywordPercent(token);
		if (tokenKeyword === 0 || tokenKeyword === 100) return tokenKeyword;
	}

	// If we see a `center` token and can't determine y, assume y is centered.
	if (tokens.includes("center")) return 50;

	return null;
}

/**
 * Calculate banner translateY (in `vh`) for the extended banner cropping setup.
 * - `0vh` shows the bottom part
 * - `BANNER_HEIGHT_EXTEND vh` shows the top part
 */
export function getBannerOffset(position?: string): string {
	const vertical = extractBannerVerticalPercent(position) ?? 50;

	const focus = (vertical / 100) * BANNER_HEIGHT_HOME;
	const windowHalf = BANNER_HEIGHT / 2;
	const start = clamp(focus - windowHalf, 0, BANNER_HEIGHT_EXTEND);
	const translate = BANNER_HEIGHT_EXTEND - start;
	const rounded = Math.round(translate * 1000) / 1000;

	return `${rounded}vh`;
}
