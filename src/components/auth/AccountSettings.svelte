<script lang="ts">
import { fade } from "svelte/transition";

export let isEmailAccount = true; // 是否为邮箱注册账号（id 为纯数字）

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
let passwordLoading = false;
let passwordMessage = "";
let passwordState: "idle" | "success" | "error" = "idle";

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
		emailMessage = "验证码已发送至新邮箱，请查收（也可点击邮件内链接直接确认换绑）";
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
						<input
							type="password"
							class="account-input"
							placeholder="当前密码"
							bind:value={currentPassword}
							required
							autocomplete="current-password"
						/>
					</div>
					<div class="account-row">
						<input
							type="password"
							class="account-input"
							placeholder="新密码（8-64 位）"
							bind:value={newPassword}
							required
							minlength="8"
							maxlength="64"
							autocomplete="new-password"
						/>
						<input
							type="password"
							class="account-input"
							placeholder="确认新密码"
							bind:value={confirmPassword}
							required
							autocomplete="new-password"
						/>
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
			</div>
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
	color var(--capsule-text, #1d2838)
	opacity 0.85

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
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-bg, rgba(255, 255, 255, 0.8))
	color var(--capsule-text, #1d2838)
	font-size 0.88rem
	outline none
	transition border-color 0.15s ease, box-shadow 0.15s ease

	&:focus
		border-color var(--primary, #4f8ef7)
		box-shadow 0 0 0 3px rgba(79, 142, 247, 0.16)

	&::placeholder
		opacity 0.45

.account-input-code
	letter-spacing 0.35em
	text-align center

.account-btn
	padding 0.55rem 1.1rem
	border none
	border-radius 12px
	background var(--primary, #1d2838)
	color #fff
	font-size 0.85rem
	font-weight 600
	cursor pointer
	transition transform 0.15s ease, opacity 0.15s ease
	white-space nowrap

	&:hover:not(:disabled)
		transform translateY(-1px)

	&:disabled
		opacity 0.6
		cursor not-allowed

.account-link
	align-self flex-start
	padding 0
	border none
	background transparent
	color var(--primary, #4f8ef7)
	font-size 0.78rem
	font-weight 600
	cursor pointer

.account-message
	margin 0
	font-size 0.8rem

	&.error
		color #dc2626

	&.success
		color #16a34a
</style>
