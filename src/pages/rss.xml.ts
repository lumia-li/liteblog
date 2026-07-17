import rss from "@astrojs/rss";
import { getSortedPosts } from "@utils/content-utils";
import { getPostUrlBySlug } from "@utils/url-utils";
import type { APIRoute } from "astro";
import { siteConfig } from "@/config";

export const GET: APIRoute = async (context) => {
	const posts = await getSortedPosts();

	return rss({
		title: siteConfig.title,
		description: siteConfig.subtitle,
		site: context.site ?? new URL("https://li.liyueovo.top/"),
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description || post.data.title,
			pubDate: post.data.published,
			link: getPostUrlBySlug(post.slug),
			categories: post.data.tags,
		})),
		customData: `<language>${siteConfig.lang.replace("_", "-")}</language>`,
	});
};
