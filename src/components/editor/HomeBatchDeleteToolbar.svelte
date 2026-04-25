<script lang="ts">
import DevConfirmDialog from "@components/editor/DevConfirmDialog.svelte";
import { readStoredDevCredential } from "@utils/dev-auth-client";
import {
	type DevHomeBulkDeleteState,
	filterDevHomeBulkDeleteSelectedIds,
	replaceDevHomeBulkDeleteSelectedIds,
	setDevHomeBulkDeleteSelectionMode,
	subscribeDevHomeBulkDeleteState,
} from "@utils/dev-home-bulk-delete";
import { waitForPostsToDisappear } from "@utils/dev-refresh-wait-client";
import { getDeveloperModeEnabled } from "@utils/setting-utils";
import { onMount } from "svelte";

type PostSummary = {
	id: string;
	title: string;
};

const DEV_EDITOR_SKIP_TRASH_CONFIRM_KEY = "devEditorSkipTrashConfirm";

export let posts: PostSummary[] = [];

let developerModeEnabled = false;
let selectionMode = false;
let selectedIds: string[] = [];
let isSubmitting = false;
let dialogOpen = false;
let notice = "";
let noticeType: "info" | "success" | "error" = "info";
let rememberSkipDeleteConfirm = false;
let availableIdsKey = "";

function showNotice(message: string, type: "info" | "success" | "error") {
	notice = message;
	noticeType = type;
	if (type === "error") {
		return;
	}
	window.setTimeout(() => {
		if (notice === message) {
			notice = "";
		}
	}, 2800);
}

function refreshDeveloperMode() {
	developerModeEnabled = getDeveloperModeEnabled();
	if (!developerModeEnabled) {
		dialogOpen = false;
		setDevHomeBulkDeleteSelectionMode(false);
	}
}

function shouldSkipTrashConfirm(): boolean {
	try {
		return localStorage.getItem(DEV_EDITOR_SKIP_TRASH_CONFIRM_KEY) === "true";
	} catch {
		return false;
	}
}

function setSkipTrashConfirm(skip: boolean) {
	try {
		if (skip) {
			localStorage.setItem(DEV_EDITOR_SKIP_TRASH_CONFIRM_KEY, "true");
			return;
		}
		localStorage.removeItem(DEV_EDITOR_SKIP_TRASH_CONFIRM_KEY);
	} catch {
		// Ignore localStorage write failures.
	}
}

function getAvailableIds(): string[] {
	return posts.map((post) => post.id);
}

function syncAvailableIds() {
	const nextKey = getAvailableIds().join("|");
	if (nextKey === availableIdsKey) return;
	availableIdsKey = nextKey;
	filterDevHomeBulkDeleteSelectedIds(getAvailableIds());
}

function handleStateChange(state: DevHomeBulkDeleteState) {
	selectionMode = state.selectionMode;
	selectedIds = state.selectedIds;
}

function startSelectionMode() {
	if (isSubmitting) return;
	setDevHomeBulkDeleteSelectionMode(true);
}

function exitSelectionMode() {
	if (isSubmitting) return;
	setDevHomeBulkDeleteSelectionMode(false);
}

function toggleSelectAll() {
	if (isSubmitting) return;
	const availableIds = getAvailableIds();
	if (availableIds.length < 1) return;
	if (selectedIds.length === availableIds.length) {
		replaceDevHomeBulkDeleteSelectedIds([]);
		return;
	}
	replaceDevHomeBulkDeleteSelectedIds(availableIds);
}

function beginBatchDelete() {
	if (isSubmitting || selectedIds.length < 1) return;
	if (shouldSkipTrashConfirm()) {
		void moveSelectedPostsToTrash();
		return;
	}
	rememberSkipDeleteConfirm = false;
	dialogOpen = true;
}

function resetConfirm() {
	if (isSubmitting) return;
	dialogOpen = false;
	rememberSkipDeleteConfirm = false;
}

function handleDeleteConfirm(event: CustomEvent<{ rememberChoice: boolean }>) {
	if (isSubmitting) return;
	dialogOpen = false;
	void moveSelectedPostsToTrash(event.detail.rememberChoice);
}

async function moveSelectedPostsToTrash(rememberChoice = false) {
	if (isSubmitting || selectedIds.length < 1) return;
	const devCodeHash = readStoredDevCredential();
	if (!devCodeHash) {
		showNotice("缺少开发者口令，请重新解锁开发者模式", "error");
		return;
	}

	const targetIds = [...selectedIds];
	isSubmitting = true;
	try {
		const response = await fetch("/api/dev/trash", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				action: "move",
				postIds: targetIds,
				devCodeHash,
			}),
		});
		const payload = (await response.json().catch(() => ({}))) as {
			ok?: boolean;
			message?: string;
			count?: number;
		};
		if (!response.ok || !payload.ok) {
			throw new Error(payload.message || "移入垃圾桶失败");
		}
		setSkipTrashConfirm(rememberChoice);
		setDevHomeBulkDeleteSelectionMode(false);
		window.dispatchEvent(new CustomEvent("trash-posts-updated"));
		showNotice(
			`已移入垃圾桶：${payload.count || targetIds.length} 篇文章`,
			"success",
		);
		showNotice("正在等待页面更新...", "info");
		await waitForPostsToDisappear({
			pageUrl: window.location.href,
			postIds: targetIds,
			titles: posts
				.filter((post) => targetIds.includes(post.id))
				.map((post) => post.title),
		});
		window.location.reload();
	} catch (error) {
		const message = error instanceof Error ? error.message : "移入垃圾桶失败";
		showNotice(message, "error");
	} finally {
		isSubmitting = false;
	}
}

$: syncAvailableIds();

onMount(() => {
	refreshDeveloperMode();
	setDevHomeBulkDeleteSelectionMode(false);
	const unsubscribe = subscribeDevHomeBulkDeleteState(handleStateChange);
	const handleDeveloperModeChange = () => {
		refreshDeveloperMode();
	};
	const handleFocus = () => {
		refreshDeveloperMode();
	};
	const handleVisibility = () => {
		if (!document.hidden) {
			refreshDeveloperMode();
		}
	};

	window.addEventListener("developer-mode-change", handleDeveloperModeChange);
	window.addEventListener("focus", handleFocus);
	document.addEventListener("visibilitychange", handleVisibility);

	return () => {
		unsubscribe();
		window.removeEventListener(
			"developer-mode-change",
			handleDeveloperModeChange,
		);
		window.removeEventListener("focus", handleFocus);
		document.removeEventListener("visibilitychange", handleVisibility);
	};
});
</script>

{#if developerModeEnabled && posts.length > 0}
	<div class="home-bulk-toolbar">
		{#if !selectionMode}
			<button
				type="button"
				class="toolbar-btn danger"
				disabled={isSubmitting}
				on:click={startSelectionMode}
			>
				批量删除
			</button>
		{:else}
			<div class="toolbar-panel">
				<div class="toolbar-count">
					{selectedIds.length > 0
						? `已选 ${selectedIds.length} 篇`
						: `当前页共 ${posts.length} 篇`}
				</div>
				<div class="toolbar-actions">
					<button
						type="button"
						class="toolbar-btn"
						disabled={isSubmitting}
						on:click={toggleSelectAll}
					>
						{selectedIds.length === posts.length ? "取消全选" : "全选本页"}
					</button>
					<button
						type="button"
						class="toolbar-btn danger"
						disabled={!selectedIds.length || isSubmitting}
						on:click={beginBatchDelete}
					>
						{isSubmitting ? "删除中..." : "移入垃圾桶"}
					</button>
					<button
						type="button"
						class="toolbar-btn ghost"
						disabled={isSubmitting}
						on:click={exitSelectionMode}
					>
						退出批量
					</button>
				</div>
			</div>
		{/if}

		{#if notice}
			<div class={`toolbar-notice ${noticeType}`}>{notice}</div>
		{/if}
	</div>

	<DevConfirmDialog
		open={dialogOpen}
		label="批量删除文章"
		title={`确认将选中的 ${selectedIds.length} 篇文章移入垃圾桶吗？`}
		description="文章会先进入垃圾桶，不会立刻彻底删除。"
		note="如果只是普通删除，后续仍可以在垃圾桶中恢复。"
		confirmLabel="移入垃圾桶"
		cancelLabel="再想想"
		allowRememberChoice={true}
		bind:rememberChoice={rememberSkipDeleteConfirm}
		rememberChoiceLabel="以后批量删除文章时不再提醒（不建议）"
		rememberChoiceHint="该选项只会保存在当前浏览器中，后续会直接把当前所选文章移入垃圾桶。"
		tone="danger"
		busy={isSubmitting}
		on:cancel={resetConfirm}
		on:confirm={handleDeleteConfirm}
	/>
{/if}

<style lang="stylus">
.home-bulk-toolbar
  display grid
  gap 0.55rem
  margin-bottom 0.9rem
  overflow visible
  padding-top 0.2rem

.home-bulk-toolbar > .toolbar-btn
  width 100%
  justify-content center

.toolbar-panel
  display flex
  align-items center
  justify-content space-between
  gap 0.75rem
  flex-wrap wrap
  border 1px solid unquote('color-mix(in oklab, var(--primary) 18%, var(--btn-regular-bg-hover))')
  border-radius 1rem
  padding 0.8rem 0.95rem
  background unquote('color-mix(in oklab, var(--card-bg) 92%, var(--btn-plain-bg-hover))')

.toolbar-count
  font-size 0.9rem
  font-weight 700
  color var(--btn-content)

.toolbar-actions
  display flex
  align-items center
  gap 0.6rem
  flex-wrap wrap

.toolbar-btn
  display inline-flex
  align-items center
  justify-content center
  min-width 5.8rem
  height 2.4rem
  padding 0 0.9rem
  border 1px solid var(--primary)
  border-radius 0.72rem
  color var(--btn-content)
  background rgba(255, 255, 255, 0.02)
  font-size 0.85rem
  font-weight 700
  transition background 0.2s ease, opacity 0.2s ease

  &:disabled
    opacity 0.58
    cursor not-allowed

.toolbar-btn.danger
  border-color rgba(239, 68, 68, 0.8)
  color rgba(239, 68, 68, 0.96)
  background rgba(239, 68, 68, 0.08)

.home-bulk-toolbar > .toolbar-btn.danger
  background transparent

.toolbar-btn.ghost
  border-color rgba(148, 163, 184, 0.45)
  color rgba(148, 163, 184, 0.98)

.toolbar-notice
  font-size 0.82rem
  line-height 1.4

.toolbar-notice.info
  color var(--btn-content)

.toolbar-notice.success
  color rgba(34, 197, 94, 0.96)

.toolbar-notice.error
  color rgba(239, 68, 68, 0.96)

@media (max-width: 760px)
  .toolbar-panel
    align-items stretch

  .toolbar-actions
    width 100%

  .toolbar-btn
    flex 1

@media (min-width: 1024px)
  .home-bulk-toolbar
    margin-top 0

</style>
