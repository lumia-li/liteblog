<script lang="ts">
import DevConfirmDialog from "@components/editor/DevConfirmDialog.svelte";
import {
	DEV_DRAFTS_UPDATED_EVENT,
	type DevDraft,
	listDrafts,
	migrateLegacyDraft,
	moveDraftToTrash,
	removeDraft,
} from "@utils/dev-draft-utils";
import { getDeveloperModeEnabled } from "@utils/setting-utils";
import { onMount } from "svelte";

type ConfirmEventDetail = {
	rememberChoice: boolean;
};

const DEV_EDITOR_SKIP_DRAFT_DELETE_CONFIRM_KEY =
	"devEditorSkipDraftDeleteConfirm";
const DEV_EDITOR_SKIP_DRAFT_TRASH_CONFIRM_KEY =
	"devEditorSkipDraftTrashConfirm";

export let publishedSlugs: string[] = [];

const deleteDraftButtonStyle = [
	"border-color: color-mix(in oklab, rgb(244, 63, 94) 88%, var(--primary))",
	"background-color: color-mix(in oklab, rgb(244, 63, 94) 72%, var(--primary))",
	"color: rgb(255, 255, 255)",
].join("; ");

let drafts: DevDraft[] = [];
let isLocked = true;
let slugConflictCounts: Record<string, number> = {};
let pendingDeleteDraft: DevDraft | null = null;
let normalizedPublishedSlugs = new Set<string>();
let rememberMoveToTrash = false;
let deferredRefreshWhileDialogOpen = false;

function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

function getEffectiveSlug(draft: Pick<DevDraft, "slug" | "title">): string {
	return slugify((draft.slug || "").trim() || (draft.title || "").trim());
}

function getOriginalSlug(draft: Pick<DevDraft, "originalSlug">): string {
	return slugify((draft.originalSlug || "").trim());
}

function buildSlugConflictCounts(items: DevDraft[]): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const effectiveSlug = getEffectiveSlug(item);
		if (!effectiveSlug) continue;
		counts[effectiveSlug] = (counts[effectiveSlug] || 0) + 1;
	}
	return counts;
}

function refreshAccess() {
	isLocked = !getDeveloperModeEnabled();
	if (isLocked) {
		drafts = [];
		slugConflictCounts = {};
		pendingDeleteDraft = null;
		rememberMoveToTrash = false;
	}
}

function loadDrafts() {
	refreshAccess();
	if (isLocked) return;
	drafts = listDrafts();
	slugConflictCounts = buildSlugConflictCounts(drafts);
}

function clearLegacySkipDraftDeleteConfirmPreference() {
	try {
		localStorage.removeItem(DEV_EDITOR_SKIP_DRAFT_DELETE_CONFIRM_KEY);
	} catch (_error) {
		// Ignore localStorage write failures.
	}
}

function readSkipDraftTrashConfirmPreference(): boolean {
	try {
		return (
			localStorage.getItem(DEV_EDITOR_SKIP_DRAFT_TRASH_CONFIRM_KEY) === "1"
		);
	} catch (_error) {
		return false;
	}
}

function writeSkipDraftTrashConfirmPreference(remember: boolean) {
	try {
		if (remember) {
			localStorage.setItem(DEV_EDITOR_SKIP_DRAFT_TRASH_CONFIRM_KEY, "1");
		} else {
			localStorage.removeItem(DEV_EDITOR_SKIP_DRAFT_TRASH_CONFIRM_KEY);
		}
	} catch (_error) {
		// Ignore localStorage write failures.
	}
}

function formatTime(timestamp: number): string {
	return new Date(timestamp).toLocaleString();
}

function excerpt(content: string): string {
	return content.replace(/\s+/g, " ").trim().slice(0, 120) || "(绌哄唴瀹?";
}

function getSlugConflictCount(draft: DevDraft): number {
	const effectiveSlug = getEffectiveSlug(draft);
	if (!effectiveSlug) return 0;
	return slugConflictCounts[effectiveSlug] || 0;
}

function hasPublishedSlugConflict(
	draft: Pick<DevDraft, "slug" | "title" | "originalSlug">,
): boolean {
	const effectiveSlug = getEffectiveSlug(draft);
	if (!effectiveSlug) return false;
	return (
		normalizedPublishedSlugs.has(effectiveSlug) &&
		getOriginalSlug(draft) !== effectiveSlug
	);
}

function hasSlugConflict(draft: DevDraft): boolean {
	return getSlugConflictCount(draft) > 1 || hasPublishedSlugConflict(draft);
}

function getSlugConflictMessage(draft: DevDraft): string {
	const details: string[] = [];
	if (hasPublishedSlugConflict(draft)) {
		details.push("与已发布文章 slug 冲突");
	}
	const duplicateCount = getSlugConflictCount(draft);
	if (duplicateCount > 1) {
		details.push(`共 ${duplicateCount} 篇草稿使用该 slug`);
	}
	return details.length ? `(slug 冲突：${details.join("；")})` : "";
}

function getDraftTitle(draft: DevDraft): string {
	return draft.title || "未命名草稿";
}

function editDraft(id: string) {
	window.location.href = `/editor?id=${encodeURIComponent(id)}`;
}

function moveDraftAndRefresh(id: string) {
	moveDraftToTrash(id);
	loadDrafts();
}

function requestPassiveRefresh() {
	if (pendingDeleteDraft) {
		deferredRefreshWhileDialogOpen = true;
		return;
	}
	loadDrafts();
}

function flushDeferredRefresh() {
	if (!deferredRefreshWhileDialogOpen) return;
	deferredRefreshWhileDialogOpen = false;
	loadDrafts();
}

function closeDeleteDialog() {
	pendingDeleteDraft = null;
	rememberMoveToTrash = false;
	flushDeferredRefresh();
}

function beginDeleteDraft(draft: DevDraft) {
	if (readSkipDraftTrashConfirmPreference()) {
		moveDraftAndRefresh(draft.id);
		return;
	}
	rememberMoveToTrash = false;
	pendingDeleteDraft = draft;
}

function confirmMoveDraftToTrash(event: CustomEvent<ConfirmEventDetail>) {
	if (!pendingDeleteDraft) return;
	const nextDraft = pendingDeleteDraft;
	writeSkipDraftTrashConfirmPreference(event.detail.rememberChoice);
	pendingDeleteDraft = null;
	rememberMoveToTrash = false;
	deferredRefreshWhileDialogOpen = false;
	moveDraftAndRefresh(nextDraft.id);
}

function confirmDeleteDraft() {
	if (!pendingDeleteDraft) return;
	const nextDraft = pendingDeleteDraft;
	pendingDeleteDraft = null;
	rememberMoveToTrash = false;
	deferredRefreshWhileDialogOpen = false;
	removeDraft(nextDraft.id);
	loadDrafts();
}

$: normalizedPublishedSlugs = new Set(
	publishedSlugs.map((item) => slugify(item)).filter(Boolean),
);

onMount(() => {
	clearLegacySkipDraftDeleteConfirmPreference();
	migrateLegacyDraft();
	loadDrafts();

	const handleModeChange = () => {
		loadDrafts();
	};
	const handleStorage = (event: StorageEvent) => {
		if (
			!event.key ||
			event.key.includes("dev-editor-draft") ||
			event.key === "devEditorEnabled" ||
			event.key === "devEditorCredential" ||
			event.key === "devEditorCode" ||
			event.key === "devEditorAutoLockAt"
		) {
			requestPassiveRefresh();
		}
	};
	const handleDraftsUpdated = () => {
		requestPassiveRefresh();
	};

	window.addEventListener("developer-mode-change", handleModeChange);
	window.addEventListener(DEV_DRAFTS_UPDATED_EVENT, handleDraftsUpdated);
	window.addEventListener("storage", handleStorage);
	return () => {
		window.removeEventListener("developer-mode-change", handleModeChange);
		window.removeEventListener(DEV_DRAFTS_UPDATED_EVENT, handleDraftsUpdated);
		window.removeEventListener("storage", handleStorage);
	};
});
</script>

<div class="card-base rounded-[var(--radius-large)] p-4 md:p-6">
	{#if isLocked}
		<div class="empty-tip">
			开发者模式未开启，无法访问草稿箱。请先在背景设置中解锁开发者模式。
		</div>
	{:else}
		<div class="drafts-head">
			<div>
				<h1 class="text-xl font-bold text-[var(--btn-content)]">草稿箱</h1>
				<p class="mt-1 text-sm text-neutral-400">
					这里显示“立即保存 / 自动保存”的本地草稿
				</p>
			</div>
			<a class="new-btn" href="/editor" data-no-swup>去写新文章</a>
		</div>

		{#if drafts.length === 0}
			<div class="empty-tip">还没有草稿，先去编辑器写点内容再保存。</div>
		{:else}
			<div class="draft-list">
				{#each drafts as item}
					<div class="draft-item" class:has-slug-conflict={hasSlugConflict(item)}>
						<div class="draft-main">
							<div class="draft-title">{getDraftTitle(item)}</div>
							<div class="draft-meta">
								<span>{formatTime(item.updatedAt)}</span>
								{#if hasSlugConflict(item)}
									<span class="draft-meta-conflict">{getSlugConflictMessage(item)}</span>
								{/if}
							</div>
							<div class="draft-slug">Slug: {getEffectiveSlug(item) || "(待生成)"}</div>
							<div class="draft-excerpt">{excerpt(item.content)}</div>
						</div>
						<div class="draft-actions">
							<button class="action-btn" on:click={() => editDraft(item.id)}>继续编辑</button>
							<button
								class="action-btn danger"
								style={deleteDraftButtonStyle}
								on:click={() => beginDeleteDraft(item)}
							>
								删除
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<DevConfirmDialog
	open={Boolean(pendingDeleteDraft)}
	label="移入垃圾桶"
	title={pendingDeleteDraft ? `确认将「${getDraftTitle(pendingDeleteDraft)}」移入垃圾桶吗？` : ""}
	description="草稿会先进入垃圾桶，后续仍可在垃圾桶中恢复。"
	note="如果只是想先清理草稿箱，移入垃圾桶更稳妥；只有在垃圾桶里彻底删除后才无法找回。"
	noteTone="danger"
	confirmLabel="移入垃圾桶"
	cancelLabel="再想想"
	alternateLabel="直接删除"
	alternateTone="danger"
	allowRememberChoice={true}
	bind:rememberChoice={rememberMoveToTrash}
	rememberChoiceLabel="以后将草稿移入垃圾桶时不再提醒（不建议）"
	rememberChoiceHint="该选项只保存在当前浏览器中，后续会直接将本地草稿移入垃圾桶。"
	tone="warning"
	on:cancel={closeDeleteDialog}
	on:alternate={confirmDeleteDraft}
	on:confirm={confirmMoveDraftToTrash}
/>

<style lang="stylus">
.drafts-head
  display flex
  align-items flex-start
  justify-content space-between
  gap 1rem
  margin-bottom 1rem

.new-btn
  display inline-flex
  align-items center
  justify-content center
  height 2.65rem
  padding 0 1.05rem
  line-height 1
  font-size 1.05rem
  border 1px solid unquote('color-mix(in oklab, var(--primary) 84%, white 12%)')
  background var(--primary)
  color white
  border-radius 12px
  font-weight 700
  box-shadow unquote('0 10px 26px color-mix(in oklab, var(--primary) 34%, transparent), 0 1px 0 color-mix(in oklab, white 28%, transparent) inset')
  transition transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, background 0.2s ease

  &:hover
    transform translateY(-1px)
    filter brightness(1.04) saturate(1.05)
    background unquote('color-mix(in oklab, var(--primary) 88%, white 12%)')
    box-shadow unquote('0 14px 30px color-mix(in oklab, var(--primary) 46%, transparent), 0 1px 0 color-mix(in oklab, white 34%, transparent) inset')

.empty-tip
  border 1px dashed var(--btn-regular-bg-hover)
  border-radius 0.9rem
  padding 1rem
  color var(--btn-content)

.draft-list
  display grid
  gap 0.75rem

.draft-item
  border 1px solid var(--btn-regular-bg-hover)
  border-radius 0.8rem
  padding 0.75rem
  display flex
  justify-content space-between
  align-items flex-start
  gap 0.75rem

.draft-item.has-slug-conflict
  border-color unquote('color-mix(in oklab, var(--primary) 48%, var(--btn-regular-bg-hover))')
  box-shadow unquote('0 0 0 1px color-mix(in oklab, var(--primary) 18%, transparent) inset')

.draft-title
  font-size 1rem
  font-weight 700
  color var(--btn-content)

.draft-meta
  margin-top 0.2rem
  display flex
  flex-wrap wrap
  gap 0.35rem
  font-size 0.78rem
  color rgba(148, 163, 184, 0.9)

.draft-meta-conflict
  color unquote('color-mix(in oklab, var(--primary) 78%, var(--btn-content))')
  font-weight 600

.draft-slug
  margin-top 0.28rem
  font-size 0.8rem
  color rgba(148, 163, 184, 0.9)

.draft-excerpt
  margin-top 0.4rem
  font-size 0.88rem
  color var(--btn-content)

.draft-actions
  display inline-flex
  gap 0.45rem

.action-btn
  border 1px solid var(--primary)
  border-radius 0.6rem
  padding 0.35rem 0.65rem
  color var(--btn-content)
  position relative
  overflow visible
  isolation isolate
  white-space nowrap
  transition transform 0.18s ease, background 0.18s ease, border-color 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease

  &:hover
    transform translateY(-1px)
    filter brightness(1.03)

.action-btn.danger
  border-color unquote('color-mix(in oklab, rgb(244, 63, 94) 88%, var(--primary))')
  background unquote('color-mix(in oklab, rgb(244, 63, 94) 72%, var(--primary))')
  color rgb(255, 255, 255)

  &::after
    content ""
    position absolute
    left 14%
    right 14%
    bottom -0.38rem
    height 0.68rem
    border-radius 999px
    background rgba(244, 63, 94, 0.78)
    filter blur(0.52rem)
    opacity 0.86
    pointer-events none
    z-index -1
    transition opacity 0.18s ease, transform 0.18s ease, filter 0.18s ease

  &:hover
    background unquote('color-mix(in oklab, rgb(225, 29, 72) 76%, var(--primary))')

    &::after
      opacity 1
      transform translateY(0.05rem) scaleX(1.05)
      filter blur(0.66rem)

@media (max-width: 740px)
  .draft-item
    flex-direction column

  .draft-actions
    width 100%

  .action-btn
    flex 1
    text-align center
</style>
