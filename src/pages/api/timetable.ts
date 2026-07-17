import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getExpectedDevCode, matchDevCredential } from "@utils/dev-auth-server";
import type { APIRoute } from "astro";

export const prerender = false;

type TimetableRequest = {
	state?: unknown;
	devCode?: string;
	devCodeHash?: string;
};

type GitHubFile = {
	sha: string;
	content: string;
};

type RemoteLoginResponse = {
	code?: number;
	msg?: string;
	data?: {
		accessToken?: string;
		refreshToken?: string;
		expiresTime?: number;
		expires_in?: number;
	};
};

type RemoteTimetableResponse = {
	ok?: boolean;
	message?: string;
	msg?: string;
	state?: unknown;
	data?: unknown;
};

type TimetableCourseLike = {
	course?: unknown;
	color?: unknown;
	weeks?: unknown;
	location?: unknown;
	teacher?: unknown;
};

type TimetablePeriodLike = {
	id?: unknown;
	label?: unknown;
	time?: unknown;
};

const DEFAULT_TIMETABLE_REPO_PATH = "src/content/spec/timetable.json";
const REMOTE_TOKEN_EXPIRY_SKEW_MS = 60_000;
const remoteTokenCache = new Map<
	string,
	{ accessToken: string; expiresAtMs: number }
>();
const remoteLoginInFlight = new Map<
	string,
	Promise<{ accessToken: string; expiresAtMs: number }>
>();
const REMOTE_COURSE_COLOR_PALETTE = [
	"#68dfcd",
	"#8f9eff",
	"#ddb8ea",
	"#e9da77",
	"#95dc5d",
	"#82cbff",
	"#9ddfcd",
	"#f5a97f",
	"#f2cdcd",
	"#b7e4c7",
];

function stripUtf8Bom(input: string): string {
	return input.replace(/^\uFEFF/, "");
}

function parseJsonSafely(input: string): unknown {
	return JSON.parse(stripUtf8Bom(input));
}

function json(status: number, payload: Record<string, unknown>) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

function resolveTimetableRepoPath(): string {
	const raw = String(import.meta.env.TIMETABLE_REPO_PATH || "")
		.trim()
		.replace(/\\/g, "/");
	if (!raw) return DEFAULT_TIMETABLE_REPO_PATH;
	if (raw.includes("..") || raw.startsWith("/"))
		return DEFAULT_TIMETABLE_REPO_PATH;
	if (!raw.endsWith(".json")) return DEFAULT_TIMETABLE_REPO_PATH;
	return raw;
}

function toAbsolutePath(repoPath: string): string {
	return resolve(process.cwd(), repoPath);
}

async function readLocalJson(repoPath: string): Promise<unknown | null> {
	try {
		const text = await readFile(toAbsolutePath(repoPath), "utf8");
		if (!text.trim()) return null;
		return parseJsonSafely(text);
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}
		throw error;
	}
}

async function writeLocalJson(repoPath: string, state: unknown): Promise<void> {
	const absolutePath = toAbsolutePath(repoPath);
	await mkdir(dirname(absolutePath), { recursive: true });
	await writeFile(
		absolutePath,
		`${JSON.stringify(state, null, "\t")}\n`,
		"utf8",
	);
}

function encodeGitHubPath(path: string): string {
	return path
		.split("/")
		.map((part) => encodeURIComponent(part))
		.join("/");
}

function decodeGithubBase64(content: string): string {
	return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
}

function encodeGithubBase64(content: string): string {
	return Buffer.from(content, "utf8").toString("base64");
}

function getGitHubConfig(): {
	token: string;
	owner: string;
	repo: string;
	branch: string;
} | null {
	const token = String(import.meta.env.GITHUB_TOKEN || "").trim();
	const owner = String(import.meta.env.GITHUB_OWNER || "").trim();
	const repo = String(import.meta.env.GITHUB_REPO || "").trim();
	const branch =
		String(import.meta.env.GITHUB_BRANCH || "main").trim() || "main";
	if (!token || !owner || !repo) return null;
	return { token, owner, repo, branch };
}

function getGitHubHeaders(token: string): Record<string, string> {
	return {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

async function readGitHubFile(params: {
	githubBase: string;
	path: string;
	branch: string;
	headers: Record<string, string>;
}): Promise<GitHubFile | null> {
	const response = await fetch(
		`${params.githubBase}/contents/${encodeGitHubPath(params.path)}?ref=${encodeURIComponent(params.branch)}`,
		{
			headers: params.headers,
		},
	);

	if (response.status === 404) {
		return null;
	}

	if (!response.ok) {
		const errText = await response.text();
		throw new Error(`读取 GitHub 课程表失败: ${response.status} ${errText}`);
	}

	const result = (await response.json()) as {
		sha?: string;
		content?: string;
	};

	if (!result.sha || !result.content) {
		throw new Error("GitHub 课程表响应不完整");
	}

	return {
		sha: result.sha,
		content: decodeGithubBase64(result.content),
	};
}

async function writeGitHubFile(params: {
	githubBase: string;
	path: string;
	branch: string;
	headers: Record<string, string>;
	content: string;
	sha?: string;
}): Promise<string> {
	const response = await fetch(
		`${params.githubBase}/contents/${encodeGitHubPath(params.path)}`,
		{
			method: "PUT",
			headers: {
				...params.headers,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				message: "chore(timetable): update shared timetable",
				content: encodeGithubBase64(params.content),
				branch: params.branch,
				...(params.sha ? { sha: params.sha } : {}),
			}),
		},
	);

	if (!response.ok) {
		const errText = await response.text();
		throw new Error(`写入 GitHub 课程表失败: ${response.status} ${errText}`);
	}

	const result = (await response.json()) as {
		commit?: {
			html_url?: string;
		};
	};
	return result.commit?.html_url || "";
}

async function parseTimetableRequest(
	request: Request,
): Promise<TimetableRequest> {
	const raw = await request.text();
	if (!raw) return {};
	try {
		return parseJsonSafely(raw) as TimetableRequest;
	} catch {
		const params = new URLSearchParams(raw);
		const stateRaw = params.get("state") || "";
		let state: unknown;
		if (stateRaw) {
			try {
				state = parseJsonSafely(stateRaw);
			} catch {
				state = undefined;
			}
		}
		return {
			state,
			devCode: params.get("devCode") || "",
			devCodeHash: params.get("devCodeHash") || "",
		};
	}
}

async function readSharedTimetableState(
	repoPath: string,
): Promise<unknown | null> {
	const github = getGitHubConfig();
	if (github) {
		const githubBase = `https://api.github.com/repos/${github.owner}/${github.repo}`;
		const githubFile = await readGitHubFile({
			githubBase,
			path: repoPath,
			branch: github.branch,
			headers: getGitHubHeaders(github.token),
		});
		if (!githubFile?.content.trim()) return null;
		return parseJsonSafely(githubFile.content);
	}
	return readLocalJson(repoPath);
}

function getRemoteTimetableConfig(): {
	loginUrl: string;
	scheduleUrl: string;
	tenantName: string;
	username: string;
	password: string;
	systemLogin: string;
	rememberMe: boolean;
	origin?: string;
	referer?: string;
} | null {
	const loginUrl = String(
		import.meta.env.TIMETABLE_REMOTE_LOGIN_URL || "",
	).trim();
	const scheduleUrl = String(
		import.meta.env.TIMETABLE_REMOTE_SCHEDULE_URL || "",
	).trim();
	const tenantName = String(
		import.meta.env.TIMETABLE_REMOTE_TENANT_NAME || "",
	).trim();
	const username = String(
		import.meta.env.TIMETABLE_REMOTE_USERNAME || "",
	).trim();
	const password = String(
		import.meta.env.TIMETABLE_REMOTE_PASSWORD || "",
	).trim();
	if (!loginUrl || !scheduleUrl || !tenantName || !username || !password)
		return null;
	return {
		loginUrl,
		scheduleUrl,
		tenantName,
		username,
		password,
		systemLogin:
			String(import.meta.env.TIMETABLE_REMOTE_SYSTEM_LOGIN || "1").trim() ||
			"1",
		rememberMe:
			String(import.meta.env.TIMETABLE_REMOTE_REMEMBER_ME || "true")
				.trim()
				.toLowerCase() !== "false",
		origin:
			String(import.meta.env.TIMETABLE_REMOTE_ORIGIN || "").trim() || undefined,
		referer:
			String(import.meta.env.TIMETABLE_REMOTE_REFERER || "").trim() ||
			undefined,
	};
}

function buildRemoteCommonHeaders(config: {
	origin?: string;
	referer?: string;
}): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/json, text/plain, */*",
	};
	if (config.origin) headers.Origin = config.origin;
	if (config.referer) headers.Referer = config.referer;
	return headers;
}

function getRemoteTokenCacheKey(config: {
	loginUrl: string;
	tenantName: string;
	username: string;
	systemLogin: string;
}): string {
	return [
		config.loginUrl,
		config.tenantName,
		config.username,
		config.systemLogin,
	].join("::");
}

function resolveRemoteTokenExpiresAtMs(payload: RemoteLoginResponse): number {
	const now = Date.now();
	const fromExpiresTime = Number(payload.data?.expiresTime || 0);
	if (Number.isFinite(fromExpiresTime) && fromExpiresTime > now)
		return fromExpiresTime;
	const fromExpiresInSec = Number(payload.data?.expires_in || 0);
	if (Number.isFinite(fromExpiresInSec) && fromExpiresInSec > 0)
		return now + fromExpiresInSec * 1000;
	return now + 30 * 60 * 1000;
}

async function loginRemoteAccessToken(config: {
	loginUrl: string;
	tenantName: string;
	username: string;
	password: string;
	systemLogin: string;
	rememberMe: boolean;
	origin?: string;
	referer?: string;
}): Promise<{ accessToken: string; expiresAtMs: number }> {
	const response = await fetch(config.loginUrl, {
		method: "POST",
		headers: {
			...buildRemoteCommonHeaders(config),
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({
			tenantName: config.tenantName,
			username: config.username,
			password: config.password,
			systemLogin: config.systemLogin,
			rememberMe: config.rememberMe,
		}),
	});
	const rawText = await response.text();
	let payload: RemoteLoginResponse = {};
	try {
		payload = rawText ? (parseJsonSafely(rawText) as RemoteLoginResponse) : {};
	} catch {
		payload = {};
	}
	if (!response.ok) {
		throw new Error(payload.msg?.trim() || `课表登录失败: ${response.status}`);
	}
	const token = payload.data?.accessToken?.trim() || "";
	if (payload.code !== 0 || !token) {
		throw new Error(
			payload.msg?.trim() || "课表登录失败：未获取到 accessToken",
		);
	}
	return {
		accessToken: token,
		expiresAtMs: resolveRemoteTokenExpiresAtMs(payload),
	};
}

async function getRemoteAccessToken(config: {
	loginUrl: string;
	tenantName: string;
	username: string;
	password: string;
	systemLogin: string;
	rememberMe: boolean;
	origin?: string;
	referer?: string;
}): Promise<string> {
	const cacheKey = getRemoteTokenCacheKey(config);
	const cached = remoteTokenCache.get(cacheKey);
	const now = Date.now();
	if (cached && cached.expiresAtMs - REMOTE_TOKEN_EXPIRY_SKEW_MS > now) {
		return cached.accessToken;
	}

	const inFlight = remoteLoginInFlight.get(cacheKey);
	if (inFlight) {
		const result = await inFlight;
		return result.accessToken;
	}

	const loginPromise = loginRemoteAccessToken(config)
		.then((result) => {
			remoteTokenCache.set(cacheKey, result);
			return result;
		})
		.finally(() => {
			remoteLoginInFlight.delete(cacheKey);
		});
	remoteLoginInFlight.set(cacheKey, loginPromise);
	const result = await loginPromise;
	return result.accessToken;
}

function clearRemoteAccessToken(config: {
	loginUrl: string;
	tenantName: string;
	username: string;
	systemLogin: string;
}) {
	const cacheKey = getRemoteTokenCacheKey(config);
	remoteTokenCache.delete(cacheKey);
	remoteLoginInFlight.delete(cacheKey);
}

function coerceRemoteTimetableState(
	payload: RemoteTimetableResponse,
): unknown | null {
	if (payload.state && typeof payload.state === "object") return payload.state;
	if (payload.data && typeof payload.data === "object") return payload.data;
	const anyPayload = payload as unknown;
	if (anyPayload && typeof anyPayload === "object") {
		const asRecord = anyPayload as Record<string, unknown>;
		const looksLikeState =
			"periods" in asRecord ||
			"courses" in asRecord ||
			"weeklySheets" in asRecord;
		if (looksLikeState) return anyPayload;
	}
	return null;
}

function isValidHexColor(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const text = value.trim();
	return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(text);
}

function hashText(input: string): number {
	let hash = 0;
	for (let i = 0; i < input.length; i += 1) {
		hash = (hash << 5) - hash + input.charCodeAt(i);
		hash |= 0;
	}
	return Math.abs(hash);
}

function pickStableColorByCourseName(courseName: string): string {
	const normalized = courseName.trim().toLowerCase() || "unknown";
	const idx = hashText(normalized) % REMOTE_COURSE_COLOR_PALETTE.length;
	return REMOTE_COURSE_COLOR_PALETTE[idx] || REMOTE_COURSE_COLOR_PALETTE[0];
}

function normalizeCourseSignatureValue(value: unknown): string {
	return typeof value === "string"
		? value.trim().replace(/\s+/g, "").toLowerCase()
		: "";
}

function getCellDayKey(cellKey: string): string {
	return cellKey.split("__").pop() || "";
}

function buildPeriodLookup(
	state: Record<string, unknown>,
): Map<string, string> {
	const lookup = new Map<string, string>();
	const periods = state.periods;
	if (!Array.isArray(periods)) return lookup;
	for (let idx = 0; idx < periods.length; idx += 1) {
		const rawPeriod = periods[idx] as TimetablePeriodLike | undefined;
		if (!rawPeriod || typeof rawPeriod !== "object") continue;
		const id = typeof rawPeriod.id === "string" ? rawPeriod.id : `p${idx + 1}`;
		const label = typeof rawPeriod.label === "string" ? rawPeriod.label : "";
		const time = typeof rawPeriod.time === "string" ? rawPeriod.time : "";
		const signature = `${idx + 1}|${normalizeCourseSignatureValue(label)}|${normalizeCourseSignatureValue(time)}`;
		lookup.set(id, signature);
	}
	return lookup;
}

function getCellPeriodSignature(
	cellKey: string,
	periodLookup: Map<string, string>,
): string {
	const periodId = cellKey.split("__")[0] || "";
	if (periodLookup.has(periodId)) return periodLookup.get(periodId) || "";
	const numeric = periodId.match(/\d+/)?.[0] || "";
	return numeric ? `${Number(numeric)}||` : periodId;
}

function buildCourseColorKey(params: {
	cellKey: string;
	item: TimetableCourseLike;
	periodLookup: Map<string, string>;
}): string {
	return [
		getCellPeriodSignature(params.cellKey, params.periodLookup),
		getCellDayKey(params.cellKey),
		normalizeCourseSignatureValue(params.item.course),
		normalizeCourseSignatureValue(params.item.location),
		normalizeCourseSignatureValue(params.item.teacher),
	].join("\n");
}

function buildSavedCourseColorMap(state: unknown): Map<string, string> {
	const colors = new Map<string, string>();
	if (!state || typeof state !== "object") return colors;
	const root = state as Record<string, unknown>;
	const periodLookup = buildPeriodLookup(root);
	const addCourses = (coursesRaw: unknown) => {
		if (!coursesRaw || typeof coursesRaw !== "object") return;
		for (const [cellKey, value] of Object.entries(
			coursesRaw as Record<string, unknown>,
		)) {
			const items = Array.isArray(value) ? value : [value];
			for (const item of items) {
				if (!item || typeof item !== "object") continue;
				const rawItem = item as TimetableCourseLike;
				if (!isValidHexColor(rawItem.color)) continue;
				colors.set(
					buildCourseColorKey({
						cellKey,
						item: rawItem,
						periodLookup,
					}),
					rawItem.color.trim(),
				);
			}
		}
	};

	addCourses(root.courses);
	const weeklySheets = root.weeklySheets;
	if (weeklySheets && typeof weeklySheets === "object") {
		for (const sheet of Object.values(
			weeklySheets as Record<string, unknown>,
		)) {
			if (!sheet || typeof sheet !== "object") continue;
			addCourses((sheet as Record<string, unknown>).courses);
		}
	}
	return colors;
}

function normalizeRemoteCoursesColor(
	state: unknown,
	savedState?: unknown,
): unknown {
	if (!state || typeof state !== "object") return state;
	const root = state as Record<string, unknown>;
	const coursesRaw = root.courses;
	if (!coursesRaw || typeof coursesRaw !== "object") return state;
	const remotePeriodLookup = buildPeriodLookup(root);
	const savedColorMap = buildSavedCourseColorMap(savedState);

	const normalizedCourses: Record<string, unknown> = {};
	for (const [cellKey, value] of Object.entries(
		coursesRaw as Record<string, unknown>,
	)) {
		if (Array.isArray(value)) {
			normalizedCourses[cellKey] = value.map((item) => {
				if (!item || typeof item !== "object") return item;
				const rawItem = item as TimetableCourseLike & Record<string, unknown>;
				const courseName =
					typeof rawItem.course === "string" ? rawItem.course : "";
				const rawColor = rawItem.color;
				const savedColor = savedColorMap.get(
					buildCourseColorKey({
						cellKey,
						item: rawItem,
						periodLookup: remotePeriodLookup,
					}),
				);
				if (savedColor) {
					return {
						...rawItem,
						color: savedColor,
					};
				}
				const shouldReplaceColor =
					!isValidHexColor(rawColor) ||
					String(rawColor).trim().toLowerCase() === "#68dfcd";
				if (!shouldReplaceColor) return item;
				return {
					...rawItem,
					color: pickStableColorByCourseName(courseName),
				};
			});
			continue;
		}
		normalizedCourses[cellKey] = value;
	}

	return {
		...root,
		courses: normalizedCourses,
	};
}

async function readRemoteTimetableState(
	config: {
		loginUrl: string;
		scheduleUrl: string;
		tenantName: string;
		username: string;
		password: string;
		systemLogin: string;
		rememberMe: boolean;
		origin?: string;
		referer?: string;
	},
	options?: { week?: number; semesterId?: number; savedState?: unknown },
): Promise<unknown | null> {
	const accessToken = await getRemoteAccessToken(config);
	const scheduleUrl = new URL(config.scheduleUrl);
	if (
		typeof options?.week === "number" &&
		Number.isFinite(options.week) &&
		options.week > 0
	) {
		scheduleUrl.searchParams.set("week", String(Math.floor(options.week)));
	}
	if (
		typeof options?.semesterId === "number" &&
		Number.isFinite(options.semesterId) &&
		options.semesterId > 0
	) {
		scheduleUrl.searchParams.set(
			"semesterId",
			String(Math.floor(options.semesterId)),
		);
	}
	let response = await fetch(scheduleUrl.toString(), {
		method: "GET",
		headers: {
			...buildRemoteCommonHeaders(config),
			Authorization: `Bearer ${accessToken}`,
		},
	});
	if (response.status === 401 || response.status === 403) {
		clearRemoteAccessToken(config);
		const refreshedToken = await getRemoteAccessToken(config);
		response = await fetch(scheduleUrl.toString(), {
			method: "GET",
			headers: {
				...buildRemoteCommonHeaders(config),
				Authorization: `Bearer ${refreshedToken}`,
			},
		});
	}
	const rawText = await response.text();
	let payload: RemoteTimetableResponse = {};
	try {
		payload = rawText
			? (parseJsonSafely(rawText) as RemoteTimetableResponse)
			: {};
	} catch {
		payload = {};
	}
	if (!response.ok) {
		throw new Error(
			payload.message?.trim() ||
				payload.msg?.trim() ||
				`读取远程课程表失败: ${response.status}`,
		);
	}
	if (payload.ok === false) {
		throw new Error(payload.message || payload.msg || "读取远程课程表失败");
	}
	return normalizeRemoteCoursesColor(
		coerceRemoteTimetableState(payload),
		options?.savedState,
	);
}

export const GET: APIRoute = async ({ url }) => {
	const repoPath = resolveTimetableRepoPath();
	try {
		const remoteConfig = getRemoteTimetableConfig();
		const rawWeek = Number(url.searchParams.get("week") || "");
		const requestedWeek =
			Number.isFinite(rawWeek) && rawWeek > 0 ? Math.floor(rawWeek) : undefined;
		const rawSemesterId = Number(url.searchParams.get("semesterId") || "");
		const requestedSemesterId =
			Number.isFinite(rawSemesterId) && rawSemesterId > 0
				? Math.floor(rawSemesterId)
				: undefined;
		const savedState = await readSharedTimetableState(repoPath);
		const state = remoteConfig
			? await readRemoteTimetableState(remoteConfig, {
					week: requestedWeek,
					semesterId: requestedSemesterId,
					savedState,
				})
			: savedState;
		return json(200, {
			ok: true,
			state,
		});
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "读取共享课程表失败";
		return json(502, { ok: false, message });
	}
};

export const POST: APIRoute = async ({ request }) => {
	const expectedCode = getExpectedDevCode();
	const repoPath = resolveTimetableRepoPath();
	if (!expectedCode) {
		return json(500, {
			ok: false,
			message: "服务器缺少 DEV_EDITOR_CODE 环境变量",
		});
	}

	let body: TimetableRequest;
	try {
		body = await parseTimetableRequest(request);
	} catch {
		return json(400, { ok: false, message: "请求体格式无效" });
	}

	if (
		!matchDevCredential({
			devCode: body.devCode,
			devCodeHash: body.devCodeHash,
			expectedCode,
		})
	) {
		return json(403, {
			ok: false,
			message: "开发者口令校验失败",
		});
	}

	if (!body.state || typeof body.state !== "object") {
		return json(400, { ok: false, message: "课程表数据无效" });
	}

	const github = getGitHubConfig();
	let commitUrl = "";

	if (!github && !import.meta.env.DEV) {
		return json(500, {
			ok: false,
			message:
				"服务器缺少 GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO，无法在生产环境写入共享课程表",
		});
	}

	try {
		if (github) {
			const githubBase = `https://api.github.com/repos/${github.owner}/${github.repo}`;
			const headers = getGitHubHeaders(github.token);
			const existing = await readGitHubFile({
				githubBase,
				path: repoPath,
				branch: github.branch,
				headers,
			});
			commitUrl = await writeGitHubFile({
				githubBase,
				path: repoPath,
				branch: github.branch,
				headers,
				content: `${JSON.stringify(body.state, null, "\t")}\n`,
				sha: existing?.sha,
			});
		}

		if (import.meta.env.DEV) {
			await writeLocalJson(repoPath, body.state);
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "保存共享课程表失败";
		return json(502, { ok: false, message });
	}

	return json(200, {
		ok: true,
		repoPath,
		commitUrl,
	});
};
