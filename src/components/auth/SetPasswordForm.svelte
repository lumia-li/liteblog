<script lang="ts">
import { onMount } from "svelte";

export let token = "";
export let mode: "register" | "change-email" | "checking" | "invalid" = "checking";
export let email = "";
export let errorMessage = "";

let password = "";
let confirmPassword = "";
let username = "";
let showUsername = false;
let loading = false;
let error = "";
let success = "";

async function checkToken() {
	if (!token) {
		mode = "invalid";
		errorMessage = "链接缺少凭证，请回到邮件重新点击";
		return;
	}
	try {
		const response = await fetch(`/api/auth/email/check-token?token=${encodeURIComponent(token)}`);
		const data = await response.json();
		if (!response.ok || !data.ok) {
			mode = "invalid";
			errorMessage = data.message || "链接无效或已过期";
			return;
		}
		email = data.email || "";
		if (data.purpose === "change-email") {
			mode = "change-email";
		} else {
			mode = "register";
			// 邮件链接直达视为邮箱已验证；验证码路径会带 username 提示
			showUsername = !data.verified;
		}
	} catch {
		mode = "invalid";
		errorMessage = "网络异常，请稍后重试";
	}
}

async function handleSubmit(event: SubmitEvent) {
	event.preventDefault();
	if (loading) return;
	error = "";
	if (password !== confirmPassword) {
		error = "两次输入的密码不一致";
		return;
	}
	loading = true;
	try {
		const response = await fetch("/api/auth/email/set-password", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token, password, username: username.trim() }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			error = data.message || "设置密码失败";
			return;
		}
		if (data.purpose === "change-email") {
			success = "邮箱换绑成功，正在返回…";
			sessionStorage.removeItem("auth-modal-open");
			setTimeout(() => {
				window.location.href = "/profile";
			}, 900);
		} else {
			success = "注册完成！即将前往登录…";
			// 回到首页并自动打开登录弹窗
			sessionStorage.setItem("auth-modal-open", "login");
			setTimeout(() => {
				window.location.href = "/";
			}, 1000);
		}
	} catch {
		error = "网络异常，请稍后重试";
	} finally {
		loading = false;
	}
}

onMount(() => {
	void checkToken();
});
</script>

<div class="setpw-card">
	{#if mode === "checking"}
		<p class="setpw-status">正在校验链接…</p>
	{:else if mode === "invalid"}
		<div class="setpw-icon setpw-icon-error" aria-hidden="true">
			<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>
		</div>
		<h2 class="setpw-title">链接无效</h2>
		<p class="setpw-message error">{errorMessage}</p>
		<a href="/" class="setpw-btn setpw-btn-primary">返回首页</a>
	{:else if success}
		<div class="setpw-icon setpw-icon-success" aria-hidden="true">
			<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor"/></svg>
		</div>
		<h2 class="setpw-title">{mode === "change-email" ? "换绑成功" : "注册完成"}</h2>
		<p class="setpw-message success">{success}</p>
	{:else}
		<h2 class="setpw-title">{mode === "change-email" ? "确认换绑邮箱" : "设置密码"}</h2>
		<p class="setpw-subtitle">
			{mode === "change-email"
				? `验证通过，即将把账号邮箱换绑为 ${email}`
				: `为 ${email} 设置登录密码，完成注册`}
		</p>
		<form class="setpw-form" on:submit={handleSubmit}>
			{#if mode === "register" && showUsername}
				<label class="setpw-field">
					<span class="setpw-label">用户名（可选，不填自动生成）</span>
					<input
						type="text"
						class="setpw-input"
						placeholder="1-24 位，中文/字母/数字/下划线"
						bind:value={username}
						maxlength="24"
					/>
				</label>
			{/if}
			<label class="setpw-field">
				<span class="setpw-label">设置密码</span>
				<input
					type="password"
					class="setpw-input"
					placeholder="8-64 位"
					bind:value={password}
					required
					minlength="8"
					maxlength="64"
					autocomplete={mode === "register" ? "new-password" : "current-password"}
				/>
			</label>
			<label class="setpw-field">
				<span class="setpw-label">确认密码</span>
				<input
					type="password"
					class="setpw-input"
					placeholder="再次输入密码"
					bind:value={confirmPassword}
					required
					autocomplete="new-password"
				/>
			</label>
			{#if error}<p class="setpw-message error">{error}</p>{/if}
			<button type="submit" class="setpw-btn setpw-btn-primary" disabled={loading}>
				{loading ? "提交中…" : mode === "change-email" ? "确认换绑" : "完成注册"}
			</button>
		</form>
	{/if}
</div>

<style lang="stylus">
.setpw-card
	max-width 420px
	margin 2rem auto
	padding 2rem
	border-radius 18px
	border 1px solid var(--capsule-menu-border, rgba(214, 222, 233, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.9))
	backdrop-filter blur(12px)
	box-shadow 0 16px 40px rgba(2, 6, 23, 0.1)

.setpw-title
	margin 0 0 0.4rem
	font-size 1.25rem
	font-weight 700
	color var(--capsule-text, #1d2838)

.setpw-subtitle
	margin 0 0 1.4rem
	font-size 0.86rem
	line-height 1.6
	color #6b7280
	word-break break-all

.setpw-status
	margin 0
	font-size 0.9rem
	color #6b7280

.setpw-icon
	display inline-flex
	align-items center
	justify-content center
	width 48px
	height 48px
	border-radius 999px
	margin-bottom 0.8rem

	& svg
		width 26px
		height 26px

.setpw-icon-success
	background rgba(22, 163, 74, 0.12)
	color #16a34a

.setpw-icon-error
	background rgba(220, 38, 38, 0.1)
	color #dc2626

.setpw-form
	display flex
	flex-direction column
	gap 0.9rem

.setpw-field
	display flex
	flex-direction column
	gap 0.35rem

.setpw-label
	font-size 0.78rem
	font-weight 600
	color var(--capsule-text, #1d2838)
	opacity 0.75

.setpw-input
	padding 0.6rem 0.8rem
	border-radius 12px
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-bg, rgba(255, 255, 255, 0.8))
	color var(--capsule-text, #1d2838)
	font-size 0.92rem
	outline none
	transition border-color 0.15s ease, box-shadow 0.15s ease

	&:focus
		border-color var(--primary, #4f8ef7)
		box-shadow 0 0 0 3px rgba(79, 142, 247, 0.16)

	&::placeholder
		opacity 0.45

.setpw-message
	margin 0
	font-size 0.82rem
	line-height 1.55

	&.error
		color #dc2626

	&.success
		color #16a34a

.setpw-btn
	display inline-flex
	align-items center
	justify-content center
	padding 0.65rem 1.2rem
	border-radius 12px
	font-size 0.9rem
	font-weight 600
	text-decoration none
	cursor pointer
	transition transform 0.15s ease, box-shadow 0.15s ease

.setpw-btn-primary
	margin-top 0.25rem
	border none
	background var(--primary, #1d2838)
	color #fff
	box-shadow 0 6px 18px rgba(29, 40, 56, 0.22)

	&:hover:not(:disabled)
		transform translateY(-1px)
		box-shadow 0 10px 24px rgba(29, 40, 56, 0.28)

	&:disabled
		opacity 0.6
		cursor not-allowed
</style>
