<script lang="ts">
import { onMount } from "svelte";
import { fade } from "svelte/transition";
import {
	hashDevCodeClient,
	readStoredDevCredential,
} from "@utils/dev-auth-client";

type LoginRecord = {
	id: string;
	provider: "airliny" | "qq" | "google" | "github" | "microsoft";
	loginAt: number;
	ip?: string;
	ua?: string;
	user: {
		id: string;
		username: string;
		email: string;
		display_name: string;
		avatar_url: string;
		role: "admin" | "user";
	};
};

const PROVIDER_LABEL: Record<LoginRecord["provider"], string> = {
	airliny: "Airliny",
	qq: "QQ",
	google: "Google",
	github: "GitHub",
	microsoft: "Microsoft",
};

let locked = true;
let verifying = false;
let password = "";
let message = "";
let messageState: "idle" | "loading" | "success" | "error" = "idle";
let records: LoginRecord[] = [];
let loadingRecords = false;
let deletingId = "";
let clearing = false;
let searchText = "";

function providerLabel(provider: LoginRecord["provider"]): string {
	return PROVIDER_LABEL[provider] || provider;
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function setMessage(text: string, state: "loading" | "success" | "error" = "idle") {
	message = text;
	messageState = state;
}

function getStoredHash(): string {
	return readStoredDevCredential();
}

async function fetchRecords(hash: string): Promise<boolean> {
	loadingRecords = true;
	try {
		const response = await fetch(`/api/admin/login-history?devCodeHash=${encodeURIComponent(hash)}`, {
			cache: "no-store",
		});
		if (!response.ok) {
			if (response.status === 403) {
				setMessage("开发者口令已失效，请重新解锁", "error");
				locked = true;
				return false;
			}
			setMessage("读取登录历史失败，请稍后重试", "error");
			return false;
		}
		const data = await response.json();
		records = Array.isArray(data.records) ? data.records : [];
		locked = false;
		setMessage(`共 ${records.length} 条登录记录`, "success");
		return true;
	} catch {
		setMessage("网络异常，暂时无法读取登录历史", "error");
		return false;
	} finally {
		loadingRecords = false;
	}
}

async function tryUnlock(rawCode: string): Promise<void> {
	const source = String(rawCode || "").trim();
	if (!source) {
		setMessage("请输入开发者口令", "error");
		return;
	}
	verifying = true;
	setMessage("正在验证口令...", "loading");
	try {
		const devCodeHash = await hashDevCodeClient(source);
		const verifyResponse = await fetch("/api/dev/verify", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ devCodeHash }),
			cache: "no-store",
		});
		if (!verifyResponse.ok) {
			setMessage(
				verifyResponse.status === 403 ? "口令错误，解锁失败" : "校验失败，请稍后重试",
				"error",
			);
			return;
		}
		localStorage.setItem("devEditorCredential", devCodeHash);
		localStorage.setItem("devEditorEnabled", "true");
		setMessage("口令验证通过，正在读取登录历史...", "loading");
		await fetchRecords(devCodeHash);
	} catch {
		setMessage("网络异常，暂时无法验证口令", "error");
	} finally {
		verifying = false;
	}
}

async function unlock(): Promise<void> {
	await tryUnlock(password);
}

async function handlePasswordKeydown(event: KeyboardEvent): Promise<void> {
	if (event.key === "Enter") {
		event.preventDefault();
		await tryUnlock(password);
	}
}

async function handleDelete(id: string): Promise<void> {
	if (deletingId) return;
	const confirmed = window.confirm("确定删除这条登录记录吗？此操作不可恢复。");
	if (!confirmed) return;
	deletingId = id;
	try {
		const hash = getStoredHash();
		const response = await fetch(`/api/admin/login-history?id=${encodeURIComponent(id)}&devCodeHash=${encodeURIComponent(hash)}`, {
			method: "DELETE",
			cache: "no-store",
		});
		if (response.ok) {
			records = records.filter((item) => item.id !== id);
			setMessage("已删除该条记录", "success");
		} else {
			setMessage(response.status === 403 ? "口令已失效，请重新解锁" : "删除失败，请稍后重试", "error");
		}
	} catch {
		setMessage("网络异常，删除失败", "error");
	} finally {
		deletingId = "";
	}
}

async function handleClearAll(): Promise<void> {
	if (clearing) return;
	const confirmed = window.confirm(
		`确定清空全部 ${records.length} 条登录记录吗？此操作不可恢复。`,
	);
	if (!confirmed) return;
	clearing = true;
	try {
		const hash = getStoredHash();
		const response = await fetch(`/api/admin/login-history?devCodeHash=${encodeURIComponent(hash)}`, {
			method: "DELETE",
			cache: "no-store",
		});
		if (response.ok) {
			records = [];
			setMessage("已清空全部登录记录", "success");
		} else {
			setMessage(response.status === 403 ? "口令已失效，请重新解锁" : "清空失败，请稍后重试", "error");
		}
	} catch {
		setMessage("网络异常，清空失败", "error");
	} finally {
		clearing = false;
	}
}

function filteredRecords(): LoginRecord[] {
	const query = searchText.trim().toLowerCase();
	if (!query) return records;
	return records.filter((item) => {
		const u = item.user;
		return (
			u.display_name.toLowerCase().includes(query) ||
			u.username.toLowerCase().includes(query) ||
			u.email.toLowerCase().includes(query) ||
			item.provider.toLowerCase().includes(query)
		);
	});
}

onMount(() => {
	const storedHash = getStoredHash();
	if (storedHash) {
		void fetchRecords(storedHash);
	}
});
</script>

<div class="admin-login-history">
	<div class="admin-header">
		<h1 class="admin-title">登录历史后台</h1>
		<p class="admin-subtitle">查看账号登录记录、来源与时间，管理登录历史</p>
	</div>

	{#if locked}
		<div class="unlock-panel" transition:fade={{ duration: 150 }}>
			<div class="unlock-lock-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
			</div>
			<p class="unlock-tip">此页面包含账号登录信息，请输入开发者口令解锁</p>
			<input
				type="password"
				class="unlock-input"
				placeholder="输入开发者口令，按回车解锁"
				bind:value={password}
				autocomplete="off"
				spellcheck="false"
				on:keydown={handlePasswordKeydown}
				disabled={verifying}
			/>
			<button type="button" class="unlock-btn" on:click={unlock} disabled={verifying}>
				{verifying ? "验证中..." : "解锁"}
			</button>
			{#if message}
				<p class="unlock-message" data-state={messageState}>{message}</p>
			{/if}
		</div>
	{:else}
		<div class="admin-toolbar">
			<input
				type="text"
				class="search-input"
				placeholder="搜索昵称 / 邮箱 / 登录方式..."
				bind:value={searchText}
			/>
			<div class="toolbar-actions">
				<button type="button" class="refresh-btn" on:click={() => fetchRecords(getStoredHash())} disabled={loadingRecords}>
					{loadingRecords ? "刷新中..." : "刷新"}
				</button>
				<button type="button" class="clear-btn" on:click={handleClearAll} disabled={clearing || records.length === 0}>
					{clearing ? "清空中..." : `清空记录 (${records.length})`}
				</button>
			</div>
		</div>

		{#if message}
			<p class="status-message" data-state={messageState}>{message}</p>
		{/if}

		{#if loadingRecords}
			<div class="records-loading">正在加载登录历史...</div>
		{:else if filteredRecords().length === 0}
			<div class="records-empty">
				{#if records.length === 0}
					<p>暂无登录记录。用户通过 Airliny / QQ / Google / GitHub / Microsoft 登录后会自动记录在此。</p>
				{:else}
					<p>没有匹配的搜索结果。</p>
				{/if}
			</div>
		{:else}
			<div class="records-table-wrap">
				<table class="records-table">
					<thead>
						<tr>
							<th>账号</th>
							<th>邮箱</th>
							<th>登录方式</th>
							<th>角色</th>
							<th>登录时间</th>
							<th>来源 IP</th>
							<th>操作</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredRecords() as record (record.id)}
							<tr>
								<td>
									<div class="user-cell">
										{#if record.user.avatar_url}
											<img class="user-avatar" src={record.user.avatar_url} alt="" />
										{:else}
											<div class="user-avatar user-avatar-fallback">
												{(record.user.display_name || record.user.username).charAt(0).toUpperCase()}
											</div>
										{/if}
										<div class="user-meta">
											<span class="user-name">{record.user.display_name || record.user.username}</span>
											{#if record.user.display_name && record.user.username !== record.user.display_name}
												<span class="user-username">@{record.user.username}</span>
											{/if}
										</div>
									</div>
								</td>
								<td class="cell-muted">{record.user.email || "—"}</td>
								<td>
									<span class="provider-badge" data-provider={record.provider}>
										{providerLabel(record.provider)}
									</span>
								</td>
								<td>
									<span class="role-badge" data-role={record.user.role}>
										{record.user.role === "admin" ? "管理员" : "用户"}
									</span>
								</td>
								<td class="cell-muted cell-time">{formatTime(record.loginAt)}</td>
								<td class="cell-muted">{record.ip || "—"}</td>
								<td>
									<button
										type="button"
										class="delete-btn"
										on:click={() => handleDelete(record.id)}
										disabled={deletingId === record.id}
									>
										{deletingId === record.id ? "删除中..." : "删除"}
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<p class="admin-footnote">
			说明：登录历史保存在服务端私有文件 <code>data/login-history.json</code>（不在 public 目录），仅能通过此后台查看。
			删除记录仅移除历史，不影响该账号已登录的会话。
		</p>
	{/if}
</div>

<style lang="stylus">
.admin-login-history
	max-width 1080px
	margin 0 auto
	padding 2rem 1.25rem 4rem
	display flex
	flex-direction column
	gap 1.25rem

.admin-header
	display flex
	flex-direction column
	gap 0.35rem

.admin-title
	margin 0
	font-size 1.6rem
	font-weight 800
	line-height 1.2
	color var(--capsule-text, #1d2838)

.admin-subtitle
	margin 0
	font-size 0.9rem
	color var(--capsule-muted, #6b7686)

.unlock-panel
	max-width 440px
	width 100%
	margin 2.5rem auto 0
	padding 2rem 1.75rem
	display flex
	flex-direction column
	align-items center
	gap 0.9rem
	border-radius 18px
	border 1px solid var(--capsule-menu-border, rgba(214, 222, 233, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.96))
	box-shadow 0 14px 28px rgba(2, 6, 23, 0.18)

.unlock-lock-icon
	width 44px
	height 44px
	display flex
	align-items center
	justify-content center
	border-radius 50%
	background var(--btn-regular-bg, #f2f4f8)
	color var(--capsule-muted, #6b7686)

.unlock-lock-icon svg
	width 22px
	height 22px

.unlock-tip
	margin 0
	text-align center
	font-size 0.88rem
	color var(--capsule-muted, #6b7686)
	line-height 1.5

.unlock-input
	width 100%
	height 42px
	padding 0 0.9rem
	border-radius 10px
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-bg, rgba(255, 255, 255, 0.9))
	color var(--capsule-text, #1d2838)
	font-size 0.9rem
	outline none
	transition border-color 0.15s ease, box-shadow 0.15s ease

.unlock-input:focus
	border-color var(--primary, #6366f1)
	box-shadow 0 0 0 3px rgba(99, 102, 241, 0.18)

.unlock-btn
	width 100%
	height 42px
	border none
	border-radius 10px
	background var(--primary, #6366f1)
	color #fff
	font-size 0.9rem
	font-weight 600
	cursor pointer
	transition opacity 0.15s ease, transform 0.12s ease

.unlock-btn:hover:not(:disabled)
	opacity 0.88

.unlock-btn:active:not(:disabled)
	transform scale(0.97)

.unlock-btn:disabled
	opacity 0.6
	cursor not-allowed

.unlock-message
	margin 0
	font-size 0.82rem
	min-height 1.1rem

.unlock-message[data-state="error"]
	color #dc2626

.unlock-message[data-state="success"]
	color #16a34a

.unlock-message[data-state="loading"]
	color var(--capsule-muted, #6b7686)

.admin-toolbar
	display flex
	align-items center
	justify-content space-between
	gap 0.75rem
	flex-wrap wrap

.search-input
	flex 1
	min-width 200px
	height 38px
	padding 0 0.8rem
	border-radius 9px
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-bg, rgba(255, 255, 255, 0.9))
	color var(--capsule-text, #1d2838)
	font-size 0.86rem
	outline none
	transition border-color 0.15s ease

.search-input:focus
	border-color var(--primary, #6366f1)

.toolbar-actions
	display flex
	gap 0.5rem

.refresh-btn,
.clear-btn,
.delete-btn
	height 34px
	padding 0 0.85rem
	border-radius 8px
	font-size 0.82rem
	font-weight 600
	cursor pointer
	transition background-color 0.15s ease, opacity 0.15s ease, transform 0.12s ease
	border 1px solid transparent

.refresh-btn
	background var(--btn-regular-bg, #f2f4f8)
	color var(--capsule-text, #1d2838)
	border-color var(--capsule-border, rgba(205, 213, 224, 0.95))

.refresh-btn:hover:not(:disabled)
	background var(--btn-regular-bg, #e6e9f0)

.clear-btn
	background rgba(220, 38, 38, 0.09)
	color #dc2626
	border-color rgba(220, 38, 38, 0.28)

.clear-btn:hover:not(:disabled)
	background rgba(220, 38, 38, 0.16)

.refresh-btn:disabled,
.clear-btn:disabled,
.delete-btn:disabled
	opacity 0.55
	cursor not-allowed

.status-message
	margin 0
	font-size 0.84rem
	min-height 1.05rem

.status-message[data-state="error"]
	color #dc2626

.status-message[data-state="success"]
	color #16a34a

.status-message[data-state="loading"]
	color var(--capsule-muted, #6b7686)

.records-loading,
.records-empty
	padding 2.5rem 1.25rem
	text-align center
	font-size 0.9rem
	color var(--capsule-muted, #6b7686)
	border-radius 14px
	border 1px dashed var(--capsule-border, rgba(205, 213, 224, 0.8))
	background var(--capsule-bg, rgba(255, 255, 255, 0.55))

.records-table-wrap
	overflow-x auto
	border-radius 14px
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.96))
	box-shadow 0 10px 22px rgba(2, 6, 23, 0.08)

.records-table
	width 100%
	border-collapse collapse
	font-size 0.85rem
	color var(--capsule-text, #1d2838)

.records-table th,
.records-table td
	padding 0.7rem 0.85rem
	text-align left
	white-space nowrap

.records-table th
	font-size 0.78rem
	font-weight 700
	text-transform uppercase
	letter-spacing 0.03em
	color var(--capsule-muted, #6b7686)
	border-bottom 1px solid var(--capsule-border, rgba(205, 213, 224, 0.8))
	background var(--btn-regular-bg, #f6f7fa)

.records-table tbody tr
	border-bottom 1px solid var(--capsule-border, rgba(205, 213, 224, 0.5))
	transition background-color 0.12s ease

.records-table tbody tr:last-child
	border-bottom none

.records-table tbody tr:hover
	background var(--btn-regular-bg, rgba(28, 39, 56, 0.04))

.cell-muted
	color var(--capsule-muted, #6b7686)

.cell-time
	font-variant-numeric tabular-nums

.user-cell
	display flex
	align-items center
	gap 0.6rem

.user-avatar
	width 30px
	height 30px
	border-radius 50%
	object-fit cover
	background var(--btn-regular-bg, #f2f4f8)
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	flex-shrink 0

.user-avatar-fallback
	display inline-flex
	align-items center
	justify-content center
	font-size 0.8rem
	font-weight 700
	color var(--capsule-muted, #6b7686)

.user-meta
	display flex
	flex-direction column
	gap 0.05rem
	min-width 0

.user-name
	font-weight 600
	line-height 1.25

.user-username
	font-size 0.76rem
	color var(--capsule-muted, #6b7686)

.provider-badge,
.role-badge
	display inline-flex
	align-items center
	padding 0.18rem 0.55rem
	border-radius 999px
	font-size 0.76rem
	font-weight 600
	white-space nowrap

.provider-badge
	background rgba(99, 102, 241, 0.1)
	color #6366f1

.provider-badge[data-provider="qq"]
	background rgba(18, 183, 106, 0.1)
	color #12b76a

.provider-badge[data-provider="google"]
	background rgba(234, 67, 53, 0.1)
	color #ea4335

.provider-badge[data-provider="github"]
	background rgba(24, 23, 23, 0.1)
	color #181717

.provider-badge[data-provider="microsoft"]
	background rgba(0, 120, 212, 0.1)
	color #0078d4

.role-badge[data-role="admin"]
	background rgba(245, 158, 11, 0.12)
	color #d97706

.role-badge[data-role="user"]
	background rgba(100, 116, 139, 0.12)
	color #64748b

.delete-btn
	background rgba(220, 38, 38, 0.09)
	color #dc2626
	border-color rgba(220, 38, 38, 0.28)

.delete-btn:hover:not(:disabled)
	background rgba(220, 38, 38, 0.16)

.admin-footnote
	margin 0
	font-size 0.78rem
	line-height 1.6
	color var(--capsule-muted, #6b7686)

.admin-footnote code
	padding 0.1rem 0.3rem
	border-radius 5px
	background var(--btn-regular-bg, #f2f4f8)
	font-size 0.75em

@media (max-width: 640px)
	.admin-login-history
		padding 1.5rem 0.9rem 3rem

	.admin-toolbar
		flex-direction column
		align-items stretch

	.toolbar-actions
		justify-content flex-end
</style>
