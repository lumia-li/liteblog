import type { APIRoute } from "astro";
import { clearSession } from "@utils/auth-server";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const response = new Response(null, {
		status: 302,
		headers: { Location: "/" },
	});
	return clearSession(response, request);
};
