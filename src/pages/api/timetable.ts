import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { matchDevCredential } from "@utils/dev-auth-server";
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

const DEFAULT_TIMETABLE_REPO_PATH = "src/content/spec/timetable.json";

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
	const raw = String(import.meta.env.TIMETABLE_REPO_PATH || "").trim().replace(/\\/g, "/");
	if (!raw) return DEFAULT_TIMETABLE_REPO_PATH;
	if (raw.includes("..") || raw.startsWith("/")) return DEFAULT_TIMETABLE_REPO_PATH;
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
		return JSON.parse(text);
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
	await writeFile(absolutePath, `${JSON.stringify(state, null, "\t")}\n`, "utf8");
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
	const branch = String(import.meta.env.GITHUB_BRANCH || "main").trim() || "main";
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

async function parseTimetableRequest(request: Request): Promise<TimetableRequest> {
	const raw = await request.text();
	if (!raw) return {};
	try {
		return JSON.parse(raw) as TimetableRequest;
	} catch {
		const params = new URLSearchParams(raw);
		const stateRaw = params.get("state") || "";
		let state: unknown = undefined;
		if (stateRaw) {
			try {
				state = JSON.parse(stateRaw);
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

async function readSharedTimetableState(repoPath: string): Promise<unknown | null> {
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
		return JSON.parse(githubFile.content);
	}
	return readLocalJson(repoPath);
}

export const GET: APIRoute = async () => {
	const repoPath = resolveTimetableRepoPath();
	try {
		const state = await readSharedTimetableState(repoPath);
		return json(200, {
			ok: true,
			state,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : "读取共享课程表失败";
		return json(502, { ok: false, message });
	}
};

export const POST: APIRoute = async ({ request }) => {
	const expectedCode = import.meta.env.DEV_EDITOR_CODE || "liyue233";
	const repoPath = resolveTimetableRepoPath();

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
			message: "服务器缺少 GITHUB_TOKEN/GITHUB_OWNER/GITHUB_REPO，无法在生产环境写入共享课程表",
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
		const message = error instanceof Error ? error.message : "保存共享课程表失败";
		return json(502, { ok: false, message });
	}

	return json(200, {
		ok: true,
		repoPath,
		commitUrl,
	});
};
