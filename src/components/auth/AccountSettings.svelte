<script lang="ts">
import { fade, scale } from "svelte/transition";
import { onMount } from "svelte";
import AvatarCropper from "./AvatarCropper.svelte";

export let isEmailAccount = true; // 是否为邮箱注册账号（id 为纯数字）
export let avatarUrl = ""; // 当前头像（服务端传入，用于预览）
export let email = ""; // 当前账号邮箱（服务端传入，用于注销确认展示）

/* ── 改用户名 ── */
let username = "";
let usernameLoading = false;
let usernameMessage = "";
let usernameState: "idle" | "success" | "error" = "idle";

/* ── 换绑邮箱 ── */
let newEmail = "";
let emailCode = "";
let emailStep: "input" | "code" = "input";
let emailSendLoading = false;
let emailVerifyLoading = false;
let emailCountdown = 0;
let emailTimer: ReturnType<typeof setInterval> | null = null;
let emailMessage = "";
let emailState: "idle" | "success" | "error" = "idle";

/* ── 改密码 ── */
let currentPassword = "";
let newPassword = "";
let confirmPassword = "";
let showCurrent = false;
let showNew = false;
let showConfirm = false;
let passwordLoading = false;
let passwordMessage = "";
let passwordState: "idle" | "success" | "error" = "idle";

/* ── 注销账号 ── */
let showDeleteModal = false;
let deleteStep: "confirm" | "code" = "confirm";
let deleteCode = "";
let deleteSendLoading = false;
let deleteVerifyLoading = false;
let deleteCountdown = 0;
let deleteTimer: ReturnType<typeof setInterval> | null = null;
let deleteMessage = "";
let deleteState: "idle" | "success" | "error" = "idle";

function maskEmail(value: string): string {
	const at = value.indexOf("@");
	if (at <= 0) return value;
	const name = value.slice(0, at);
	const shown = name.slice(0, 2);
	return `${shown}${"*".repeat(Math.max(1, name.length - 2))}${value.slice(at)}`;
}

function openDeleteModal() {
	deleteStep = "confirm";
	deleteCode = "";
	deleteMessage = "";
	deleteState = "idle";
	showDeleteModal = true;
}

function closeDeleteModal() {
	if (deleteSendLoading || deleteVerifyLoading) return;
	showDeleteModal = false;
}

function handleDeleteKeydown(event: KeyboardEvent) {
	if (showDeleteModal && event.key === "Escape") closeDeleteModal();
}

/**
 * Portal：移到 body 下，避免祖先的 backdrop-filter / overflow 影响 fixed 定位。
 * （与 AvatarCropper.svelte 同一实现）
 */
function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		},
	};
}

function startDeleteCountdown() {
	deleteCountdown = 60;
	if (deleteTimer) clearInterval(deleteTimer);
	deleteTimer = setInterval(() => {
		deleteCountdown -= 1;
		if (deleteCountdown <= 0) {
			deleteCountdown = 0;
			if (deleteTimer) clearInterval(deleteTimer);
			deleteTimer = null;
		}
	}, 1000);
}

/** 向账号邮箱发送注销验证码（进入第二步时自动触发，也可手动重发） */
async function sendDeleteCode() {
	if (deleteSendLoading || deleteCountdown > 0) return;
	deleteMessage = "";
	deleteState = "idle";
	deleteSendLoading = true;
	try {
		const response = await fetch("/api/auth/email/send-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ purpose: "delete-account" }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			deleteState = "error";
			deleteMessage = data.message || "验证码发送失败";
			return;
		}
		deleteState = "success";
		deleteMessage = "验证码已发送至账号邮箱，请查收";
		startDeleteCountdown();
	} catch {
		deleteState = "error";
		deleteMessage = "网络异常，请稍后重试";
	} finally {
		deleteSendLoading = false;
	}
}

async function confirmDeleteAccount() {
	if (deleteVerifyLoading) return;
	if (!/^\d{6}$/.test(deleteCode.trim())) {
		deleteState = "error";
		deleteMessage = "请输入 6 位邮箱验证码";
		return;
	}
	deleteMessage = "";
	deleteVerifyLoading = true;
	try {
		const response = await fetch("/api/account/delete", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ code: deleteCode.trim() }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			deleteState = "error";
			deleteMessage = data.message || "注销失败";
			return;
		}
		deleteState = "success";
		deleteMessage = "账号已注销，正在返回首页…";
		setTimeout(() => {
			window.location.href = "/";
		}, 900);
	} catch {
		deleteState = "error";
		deleteMessage = "网络异常，请稍后重试";
	} finally {
		deleteVerifyLoading = false;
	}
}

/* ── 更换头像 ── */
const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4MB（Vercel 请求体上限 4.5MB，留余量）

let fileInput: HTMLInputElement | null = null;
let pendingFile: File | null = null;
let cropSrc = "";
let uploading = false;
let avatarMessage = "";
let avatarState: "idle" | "success" | "error" = "idle";

function openFilePicker() {
	fileInput?.click();
}

/**
 * 头像流程提示：面板可能处于隐藏状态（如从 profile 侧栏头像触发），
 * 除面板内消息外，同步弹出全局 toast 保证用户可见。
 */
function notifyAvatar(message: string, state: "success" | "error") {
	avatarState = state;
	avatarMessage = message;
	if (typeof document === "undefined") return;
	document.querySelectorAll(".avatar-toast").forEach((el) => el.remove());
	const toast = document.createElement("div");
	toast.className = `avatar-toast avatar-toast--${state}`;
	toast.textContent = message;
	document.body.appendChild(toast);
	setTimeout(() => toast.remove(), 3000);
}

// profile 页点击左侧头像时，通过全局事件直接打开头像选择（仅邮箱账号挂载了本组件）
onMount(() => {
	const onRequest = () => openFilePicker();
	window.addEventListener("avatar-change-request", onRequest);
	return () => window.removeEventListener("avatar-change-request", onRequest);
});

function handleFileChange(event: Event) {
	const input = event.currentTarget as HTMLInputElement;
	const file = input.files?.[0] ?? null;
	input.value = ""; // 允许再次选择同一文件
	if (!file) return;
	if (!file.type.startsWith("image/")) {
		notifyAvatar("请选择图片文件", "error");
		return;
	}
	if (file.size > MAX_AVATAR_BYTES) {
		notifyAvatar("图片不能超过 4MB，请压缩后重试", "error");
		return;
	}
	avatarState = "idle";
	avatarMessage = "";
	pendingFile = file;
	const reader = new FileReader();
	reader.onload = () => {
		cropSrc = String(reader.result); // 打开裁剪弹窗
	};
	reader.readAsDataURL(file);
}

function handleCropCancel() {
	cropSrc = "";
	pendingFile = null;
}

async function handleCropConfirm(rect: { left: number; top: number; size: number }) {
	if (!pendingFile || uploading) return;
	const file = pendingFile;
	cropSrc = "";
	pendingFile = null;
	uploading = true;
	avatarMessage = "";
	try {
		const form = new FormData();
		form.append("file", file);
		form.append("crop", JSON.stringify(rect));
		const response = await fetch("/api/account/avatar", {
			method: "POST",
			body: form,
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			notifyAvatar(data.message || "上传失败，请稍后重试", "error");
			return;
		}
		notifyAvatar("头像已更新，正在刷新…", "success");
		setTimeout(() => window.location.reload(), 800);
	} catch {
		notifyAvatar("网络异常，请稍后重试", "error");
	} finally {
		uploading = false;
	}
}

function startEmailCountdown() {
	emailCountdown = 60;
	if (emailTimer) clearInterval(emailTimer);
	emailTimer = setInterval(() => {
		emailCountdown -= 1;
		if (emailCountdown <= 0) {
			emailCountdown = 0;
			if (emailTimer) clearInterval(emailTimer);
			emailTimer = null;
		}
	}, 1000);
}

async function handleUsername(event: SubmitEvent) {
	event.preventDefault();
	if (usernameLoading) return;
	usernameMessage = "";
	usernameLoading = true;
	try {
		const response = await fetch("/api/account/username", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ username: username.trim() }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			usernameState = "error";
			usernameMessage = data.message || "修改失败";
			return;
		}
		usernameState = "success";
		usernameMessage = "用户名已更新，即将刷新…";
		setTimeout(() => window.location.reload(), 800);
	} catch {
		usernameState = "error";
		usernameMessage = "网络异常，请稍后重试";
	} finally {
		usernameLoading = false;
	}
}

async function handleSendChangeEmailCode(event: SubmitEvent) {
	event.preventDefault();
	if (emailSendLoading || emailCountdown > 0) return;
	emailMessage = "";
	emailState = "idle";
	emailSendLoading = true;
	try {
		const response = await fetch("/api/auth/email/send-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: newEmail.trim(), purpose: "change-email" }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			emailState = "error";
			emailMessage = data.message || "发送失败";
			return;
		}
		emailStep = "code";
		emailState = "success";
		emailMessage = "验证码已发送至新邮箱，请查收";
		startEmailCountdown();
	} catch {
		emailState = "error";
		emailMessage = "网络异常，请稍后重试";
	} finally {
		emailSendLoading = false;
	}
}

async function handleVerifyChangeEmail(event: SubmitEvent) {
	event.preventDefault();
	if (emailVerifyLoading) return;
	emailMessage = "";
	emailVerifyLoading = true;
	try {
		const response = await fetch("/api/account/email", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ newEmail: newEmail.trim(), code: emailCode.trim() }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			emailState = "error";
			emailMessage = data.message || "换绑失败";
			return;
		}
		emailState = "success";
		emailMessage = "邮箱换绑成功，正在刷新…";
		setTimeout(() => window.location.reload(), 900);
	} catch {
		emailState = "error";
		emailMessage = "网络异常，请稍后重试";
	} finally {
		emailVerifyLoading = false;
	}
}

async function handlePassword(event: SubmitEvent) {
	event.preventDefault();
	if (passwordLoading) return;
	passwordMessage = "";
	if (newPassword !== confirmPassword) {
		passwordState = "error";
		passwordMessage = "两次输入的新密码不一致";
		return;
	}
	passwordLoading = true;
	try {
		const response = await fetch("/api/account/password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ currentPassword, newPassword }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			passwordState = "error";
			passwordMessage = data.message || "修改失败";
			return;
		}
		passwordState = "success";
		passwordMessage = "密码已更新";
		currentPassword = "";
		newPassword = "";
		confirmPassword = "";
	} catch {
		passwordState = "error";
		passwordMessage = "网络异常，请稍后重试";
	} finally {
		passwordLoading = false;
	}
}
</script>

{#if isEmailAccount}
	<div class="account-settings">
		<div class="profile-section">
			<h2 class="profile-section-title">账户设置</h2>
			<div class="profile-body account-body">
				<!-- 更换头像 -->
				<div class="account-form">
					<span class="account-form-title">头像</span>
					<div class="account-avatar-row">
						{#if avatarUrl}
							<img src={avatarUrl} alt="当前头像" class="account-avatar-preview" />
						{:else}
							<div class="account-avatar-preview account-avatar-fallback">?</div>
						{/if}
						<button type="button" class="account-btn" disabled={uploading} on:click={openFilePicker}>
							{uploading ? "上传中…" : "更换头像"}
						</button>
					</div>
					<p class="account-avatar-hint">支持 JPG / PNG / WebP / GIF / AVIF，最大 4MB；选择图片后可拖动调整裁剪位置和大小</p>
					{#if avatarMessage}
						<p class="account-message {avatarState === 'error' ? 'error' : 'success'}" transition:fade={{ duration: 120 }}>
							{avatarMessage}
						</p>
					{/if}
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
						hidden
						bind:this={fileInput}
						on:change={handleFileChange}
					/>
				</div>

				<!-- 修改用户名 -->
				<form class="account-form" on:submit={handleUsername}>
					<span class="account-form-title">修改用户名</span>
					<div class="account-row">
						<input
							type="text"
							class="account-input"
							placeholder="新用户名"
							bind:value={username}
							maxlength="24"
							required
						/>
						<button type="submit" class="account-btn" disabled={usernameLoading}>
							{usernameLoading ? "提交中…" : "保存"}
						</button>
					</div>
					{#if usernameMessage}
						<p class="account-message {usernameState === 'error' ? 'error' : 'success'}" transition:fade={{ duration: 120 }}>
							{usernameMessage}
						</p>
					{/if}
				</form>

				<!-- 换绑邮箱 -->
				<form class="account-form" on:submit={emailStep === "input" ? handleSendChangeEmailCode : handleVerifyChangeEmail}>
					<span class="account-form-title">换绑邮箱</span>
					{#if emailStep === "input"}
						<div class="account-row">
							<input
								type="email"
								class="account-input"
								placeholder="新邮箱地址"
								bind:value={newEmail}
								required
							/>
							<button type="submit" class="account-btn" disabled={emailSendLoading || emailCountdown > 0}>
								{emailSendLoading ? "发送中…" : emailCountdown > 0 ? `${emailCountdown}s` : "发送验证码"}
							</button>
						</div>
					{:else}
						<div class="account-row">
							<input
								type="text"
								class="account-input account-input-code"
								placeholder="6 位验证码"
								bind:value={emailCode}
								inputmode="numeric"
								maxlength="6"
								required
							/>
							<button type="submit" class="account-btn" disabled={emailVerifyLoading}>
								{emailVerifyLoading ? "验证中…" : "确认换绑"}
							</button>
						</div>
						<button type="button" class="account-link" on:click={() => (emailStep = "input")}>
							更换邮箱地址
						</button>
					{/if}
					{#if emailMessage}
						<p class="account-message {emailState === 'error' ? 'error' : 'success'}" transition:fade={{ duration: 120 }}>
							{emailMessage}
						</p>
					{/if}
				</form>

				<!-- 修改密码 -->
				<form class="account-form" on:submit={handlePassword}>
					<span class="account-form-title">修改密码</span>
					<div class="account-row">
						<div class="account-input-wrap">
							<input
								type={showCurrent ? "text" : "password"}
								class="account-input"
								placeholder="当前密码"
								bind:value={currentPassword}
								required
								autocomplete="current-password"
							/>
							<button
								type="button"
								class="account-eye"
								on:click={() => (showCurrent = !showCurrent)}
								aria-label={showCurrent ? "隐藏密码" : "显示密码"}
								tabindex="-1"
							>
								{#if showCurrent}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
								{/if}
							</button>
						</div>
					</div>
					<div class="account-row">
						<div class="account-input-wrap account-input-grow">
							<input
								type={showNew ? "text" : "password"}
								class="account-input"
								placeholder="新密码（8-64 位）"
								bind:value={newPassword}
								required
								minlength="8"
								maxlength="64"
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="account-eye"
								on:click={() => (showNew = !showNew)}
								aria-label={showNew ? "隐藏密码" : "显示密码"}
								tabindex="-1"
							>
								{#if showNew}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
								{/if}
							</button>
						</div>
						<div class="account-input-wrap account-input-grow">
							<input
								type={showConfirm ? "text" : "password"}
								class="account-input"
								placeholder="确认新密码"
								bind:value={confirmPassword}
								required
								autocomplete="new-password"
							/>
							<button
								type="button"
								class="account-eye"
								on:click={() => (showConfirm = !showConfirm)}
								aria-label={showConfirm ? "隐藏密码" : "显示密码"}
								tabindex="-1"
							>
								{#if showConfirm}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/></svg>
								{:else}
									<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
								{/if}
							</button>
						</div>
						<button type="submit" class="account-btn" disabled={passwordLoading}>
							{passwordLoading ? "提交中…" : "保存"}
						</button>
					</div>
					{#if passwordMessage}
						<p class="account-message {passwordState === 'error' ? 'error' : 'success'}" transition:fade={{ duration: 120 }}>
							{passwordMessage}
						</p>
					{/if}
				</form>

				<!-- 危险操作：注销账号 -->
				<div class="account-danger">
					<span class="account-form-title">危险操作</span>
					<p class="account-danger-text">
						注销后账号将被<strong>永久删除</strong>，用户名、邮箱、头像等所有数据均无法恢复，此操作不可撤销。
					</p>
					<button type="button" class="account-danger-btn" on:click={openDeleteModal}>注销账号</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<svelte:window on:keydown={handleDeleteKeydown} />

{#if cropSrc}
	<AvatarCropper src={cropSrc} onConfirm={handleCropConfirm} onCancel={handleCropCancel} />
{/if}

{#if showDeleteModal}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="danger-overlay"
		use:portal
		transition:fade={{ duration: 150 }}
		role="presentation"
		on:click={closeDeleteModal}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div
			class="danger-card"
			role="dialog"
			aria-modal="true"
			aria-label="注销账号"
			transition:scale={{ duration: 180, start: 0.95 }}
			on:click|stopPropagation
		>
			<header class="danger-header">
				<h3 class="danger-title">确认注销账号</h3>
				<button type="button" class="danger-close" on:click={closeDeleteModal} aria-label="关闭">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
				</button>
			</header>

			{#if deleteStep === "confirm"}
				<p class="danger-text">
					即将永久删除账号 <strong>{maskEmail(email)}</strong>。注销后将无法再使用该账号登录，
					所有数据将被清除且<strong>无法恢复</strong>。
				</p>
				<footer class="danger-actions">
					<button type="button" class="danger-btn danger-btn-ghost" on:click={closeDeleteModal}>取消</button>
					<button
						type="button"
						class="danger-btn danger-btn-red"
						disabled={deleteSendLoading}
						on:click={() => {
							deleteStep = "code";
							sendDeleteCode();
						}}
					>
						继续注销
					</button>
				</footer>
			{:else}
				<p class="danger-text">
					为确认是本人操作，我们已向账号邮箱 <strong>{maskEmail(email)}</strong> 发送 6 位验证码，输入后完成注销：
				</p>
				<div class="account-row">
					<input
						type="text"
						class="account-input account-input-code"
						placeholder="6 位验证码"
						bind:value={deleteCode}
						inputmode="numeric"
						maxlength="6"
					/>
					<button type="button" class="account-btn" disabled={deleteSendLoading || deleteCountdown > 0} on:click={sendDeleteCode}>
						{deleteSendLoading ? "发送中…" : deleteCountdown > 0 ? `${deleteCountdown}s` : "重新发送"}
					</button>
				</div>
				{#if deleteMessage}
					<p class="account-message {deleteState === 'error' ? 'error' : 'success'}" transition:fade={{ duration: 120 }}>
						{deleteMessage}
					</p>
				{/if}
				<footer class="danger-actions">
					<button type="button" class="danger-btn danger-btn-ghost" disabled={deleteVerifyLoading} on:click={closeDeleteModal}>取消</button>
					<button type="button" class="danger-btn danger-btn-red" disabled={deleteVerifyLoading} on:click={confirmDeleteAccount}>
						{deleteVerifyLoading ? "注销中…" : "确认注销"}
					</button>
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style lang="stylus">
.account-body
	display flex
	flex-direction column
	gap 1.6rem

.account-form
	display flex
	flex-direction column
	gap 0.5rem

.account-form-title
	font-size 0.82rem
	font-weight 700
	color #1d2838

.account-row
	display flex
	gap 0.5rem
	flex-wrap wrap

	& .account-input
		flex 1
		min-width 180px

.account-input
	padding 0.55rem 0.75rem
	border-radius 12px
	border 1.5px solid #e2e5ea
	background #fafbfc
	color #1d2838
	font-size 0.88rem
	outline none
	transition border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease

	/* 隐藏浏览器原生密码显隐按钮 */
	&::-ms-reveal
	&::-ms-clear
		display none

	&::placeholder
		color #b3b9c4

	&:hover
		border-color #d3d7de

	&:focus
		border-color #f97316
		background #ffffff
		box-shadow 0 0 0 4px rgba(249, 115, 22, 0.16), 0 1px 6px rgba(249, 115, 22, 0.12)

.account-input-code
	letter-spacing 0.35em
	text-align center

/* 密码可见性切换 */
.account-input-wrap
	position relative
	display flex
	align-items center
	flex 1
	min-width 180px

	& .account-input
		width 100%
		padding-right 2.7rem

.account-eye
	position absolute
	right 6px
	display inline-flex
	align-items center
	justify-content center
	width 30px
	height 30px
	border none
	border-radius 8px
	background transparent
	color #9ca3af
	cursor pointer
	transition color 0.15s ease, background-color 0.15s ease

	&:hover
		color #6b7280
		background rgba(120, 128, 145, 0.1)

	& svg
		width 19px
		height 19px

.account-btn
	padding 0.68rem 1.6rem
	border 1.5px solid #e2e5ea
	border-radius 12px
	background transparent
	color #4b5563
	font-size 0.94rem
	font-weight 600
	letter-spacing 0.02em
	cursor pointer
	box-shadow none
	transition transform 0.16s ease, opacity 0.16s ease, border-color 0.16s ease, color 0.16s ease
	white-space nowrap

	&:hover:not(:disabled)
		border-color #f97316
		color #f97316
		transform none

	&:active:not(:disabled)
		transform scale(0.985)

	&:disabled
		opacity 0.62
		cursor not-allowed

:global(.dark) .account-btn
	border-color #4b5563
	color #e2e5ea

	&:hover:not(:disabled)
		border-color #fb923c
		color #fb923c

.account-link
	align-self flex-start
	padding 0
	border none
	background transparent
	color #f97316
	font-size 0.78rem
	font-weight 600
	cursor pointer
	transition color 0.15s ease

	&:hover
		color #ea6c0a

.account-message
	margin 0
	font-size 0.8rem

	&.error
		color #dc2626

	&.success
		color #16a34a

/* ── 头像区块 ── */
.account-avatar-row
	display flex
	align-items center
	gap 1rem

.account-avatar-preview
	width 72px
	height 72px
	border-radius 20px
	object-fit cover
	background #f4f5f7
	border 1px solid #e2e5ea
	user-select none
	-webkit-user-drag none

.account-avatar-fallback
	display inline-flex
	align-items center
	justify-content center
	font-size 1.7rem
	font-weight 700
	color #9ca3af

.account-avatar-hint
	margin 0
	font-size 0.76rem
	line-height 1.6
	color #9ca3af

/* ── 危险操作区 ── */
.account-danger
	display flex
	flex-direction column
	gap 0.5rem
	padding 1rem 1.1rem
	border 1px solid rgba(220, 38, 38, 0.28)
	border-radius 14px
	background rgba(220, 38, 38, 0.04)

.account-danger-text
	margin 0
	font-size 0.8rem
	line-height 1.6
	color #6b7280

	& strong
		color #dc2626

.account-danger-btn
	align-self flex-start
	padding 0.55rem 1.3rem
	border 1.5px solid #dc2626
	border-radius 12px
	background #dc2626
	color #ffffff
	font-size 0.88rem
	font-weight 700
	letter-spacing 0.02em
	cursor pointer
	transition background-color 0.16s ease, border-color 0.16s ease, transform 0.16s ease, box-shadow 0.16s ease
	white-space nowrap

	&:hover:not(:disabled)
		background #b91c1c
		border-color #b91c1c
		box-shadow 0 4px 14px rgba(220, 38, 38, 0.32)

	&:active:not(:disabled)
		transform scale(0.985)

	&:disabled
		opacity 0.62
		cursor not-allowed

/* ── 注销确认弹窗（结构 / 配色对齐 AvatarCropper 弹窗） ── */
.danger-overlay
	position fixed
	inset 0
	z-index 1100
	display flex
	align-items center
	justify-content center
	padding 1rem
	background rgba(10, 14, 22, 0.5)
	backdrop-filter blur(8px)
	-webkit-backdrop-filter blur(8px)

.danger-card
	display flex
	flex-direction column
	gap 0.9rem
	width 400px
	max-width 94vw
	max-height 92vh
	overflow auto
	padding 1.4rem 1.4rem 1.2rem
	border-radius 20px
	border 1px solid rgba(228, 232, 240, 0.9)
	background #ffffff
	box-shadow 0 28px 72px rgba(2, 6, 23, 0.35)

.danger-header
	display flex
	align-items center
	justify-content space-between

.danger-title
	margin 0
	font-size 1.05rem
	font-weight 700
	color #1d2838

.danger-close
	display inline-flex
	align-items center
	justify-content center
	width 30px
	height 30px
	border none
	border-radius 999px
	background rgba(120, 128, 145, 0.1)
	color #6b7280
	cursor pointer
	transition background-color 0.15s ease, color 0.15s ease

	&:hover
		background rgba(120, 128, 145, 0.18)
		color #374151

	& svg
		width 16px
		height 16px

.danger-text
	margin 0
	font-size 0.86rem
	line-height 1.7
	color #4b5563
	word-break break-all

	& strong
		color #dc2626

.danger-actions
	display flex
	justify-content flex-end
	gap 0.6rem
	margin-top 0.2rem

.danger-btn
	padding 0.55rem 1.2rem
	border-radius 12px
	border none
	font-size 0.88rem
	font-weight 700
	cursor pointer
	transition transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, color 0.15s ease

	&:active
		transform scale(0.97)

	&:disabled
		opacity 0.62
		cursor not-allowed

.danger-btn-ghost
	border 1.5px solid #e2e5ea
	background transparent
	color #4b5563

	&:hover:not(:disabled)
		border-color #dc2626
		color #dc2626

.danger-btn-red
	background #dc2626
	color #ffffff
	box-shadow 0 8px 20px rgba(220, 38, 38, 0.28)

	&:hover:not(:disabled)
		background #b91c1c
		box-shadow 0 12px 26px rgba(220, 38, 38, 0.36)

/* ── 深色模式 ── */
:global(.dark) .account-form-title
	color #e8ebf1

:global(.dark) .account-input
	border-color #333b49
	background #212733
	color #e8ebf1

	&::placeholder
		color #5b6472

	&:hover
		border-color #414b5c

	&:focus
		border-color #fb923c
		background #232a37
		box-shadow 0 0 0 4px rgba(249, 115, 22, 0.2), 0 1px 6px rgba(249, 115, 22, 0.14)

:global(.dark) .account-eye
	color #6b7280

	&:hover
		color #d6dae2
		background rgba(255, 255, 255, 0.08)

:global(.dark) .account-link
	color #fb923c

	&:hover
		color #ea6c0a

:global(.dark) .account-avatar-preview
	background #212733
	border-color #333b49

:global(.dark) .account-avatar-hint
	color #6b7280

:global(.dark) .account-danger
	border-color rgba(248, 113, 113, 0.35)
	background rgba(220, 38, 38, 0.1)

:global(.dark) .account-danger-text
	color #9aa2b1

:global(.dark) .danger-card
	border-color rgba(63, 70, 84, 0.85)
	background #191e26

:global(.dark) .danger-title
	color #e8ebf1

:global(.dark) .danger-close
	background rgba(255, 255, 255, 0.07)
	color #9aa2b1

	&:hover
		background rgba(255, 255, 255, 0.13)
		color #d6dae2

:global(.dark) .danger-text
	color #9aa2b1

:global(.dark) .danger-btn-ghost
	border-color #4b5563
	color #e2e5ea

	&:hover:not(:disabled)
		border-color #fb923c
		color #fb923c
</style>
