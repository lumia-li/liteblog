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
let showCurrent = false;
let showNew = false;
let showConfirm = false;
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

::global(.dark) .account-btn
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
</style>
