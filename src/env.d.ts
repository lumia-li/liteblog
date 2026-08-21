/// <reference types="astro/client" />
/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
	readonly PUBLIC_TIMETABLE_API_URL?: string;
	readonly KV_REST_API_URL?: string;
	readonly KV_REST_API_TOKEN?: string;
	readonly LOG_HISTORY_SERVER_URL?: string;
	readonly LOG_HISTORY_SERVER_TOKEN?: string;
}
