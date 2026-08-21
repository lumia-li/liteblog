import type { APIRoute } from "astro";
import { readSession } from "@utils/auth-server";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
	const session = readSession(request);
	if (!session) {
		return new Response(JSON.stringify({ user: null }), {
			status: 401,
			headers: { "Content-Type": "application/json; charset=utf-8" },
		});
	}
	return new Response(JSON.stringify({ user: session.user }), {
		status: 200,
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
};
