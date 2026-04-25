<script lang="ts">
import DevConfirmDialog from "@components/editor/DevConfirmDialog.svelte";
import { onMount } from "svelte";

export let containerSelector = ".markdown-content";

let open = false;
let pendingUrl = "";
let pendingText = "";

function closeDialog(): void {
	open = false;
	pendingUrl = "";
	pendingText = "";
}

function formatLinkPreviewText(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";
	if (trimmed.length <= 96) return trimmed;
	return `${trimmed.slice(0, 93)}...`;
}

function resolveLinkUrl(rawHref: string): string | null {
	const href = rawHref.trim();
	if (!href) return null;
	if (/^(?:javascript|data|vbscript|file):/i.test(href)) {
		return null;
	}
	try {
		const resolved = new URL(href, window.location.href);
		const protocol = resolved.protocol.toLowerCase();
		if (
			protocol !== "http:" &&
			protocol !== "https:" &&
			protocol !== "mailto:" &&
			protocol !== "tel:"
		) {
			return null;
		}
		return resolved.href;
	} catch {
		return null;
	}
}

function askOpenLink(
	linkElement: HTMLAnchorElement,
): "allow" | "confirm" | "blocked" {
	const href = linkElement.getAttribute("href") || linkElement.href || "";
	const resolvedUrl = resolveLinkUrl(href);
	if (!resolvedUrl) return "blocked";
	const parsedUrl = new URL(resolvedUrl);
	if (
		(parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
		parsedUrl.origin === window.location.origin
	) {
		return "allow";
	}
	pendingUrl = resolvedUrl;
	pendingText = formatLinkPreviewText(linkElement.textContent || "");
	open = true;
	return "confirm";
}

function confirmOpenLink(): void {
	if (!pendingUrl) {
		closeDialog();
		return;
	}
	const nextUrl = pendingUrl;
	closeDialog();
	window.open(nextUrl, "_blank", "noopener,noreferrer");
}

onMount(() => {
	const handleDocumentClickCapture = (event: MouseEvent) => {
		if (open) return;
		const target = event.target;
		if (!(target instanceof Element)) return;
		const link = target.closest("a[href]");
		if (!(link instanceof HTMLAnchorElement)) return;
		const container = document.querySelector(containerSelector);
		if (!(container instanceof Element)) return;
		if (!container.contains(link)) return;
		const action = askOpenLink(link);
		if (action === "allow") return;
		event.preventDefault();
		event.stopPropagation();
	};

	const handleWindowKeydown = (event: KeyboardEvent) => {
		if (!open) return;
		if (event.key !== "Escape") return;
		event.preventDefault();
		closeDialog();
	};

	document.addEventListener("click", handleDocumentClickCapture, true);
	window.addEventListener("keydown", handleWindowKeydown);

	return () => {
		document.removeEventListener("click", handleDocumentClickCapture, true);
		window.removeEventListener("keydown", handleWindowKeydown);
	};
});
</script>

<DevConfirmDialog
	open={open}
	label="打开链接"
	title="检测到链接，是否继续打开？"
	description={pendingText ? `链接文本：${pendingText}` : "请确认是否打开该链接。"}
	note={pendingUrl ? `链接地址：${pendingUrl}` : ""}
	confirmLabel="打开链接"
	cancelLabel="取消"
	tone="primary"
	on:cancel={closeDialog}
	on:confirm={confirmOpenLink}
/>
