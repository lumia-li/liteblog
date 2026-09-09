<script lang="ts">
import { fade, scale } from "svelte/transition";
import { onDestroy, onMount } from "svelte";

type Tab = "login" | "register";

/* ── 全局事件：任何组件 dispatch `open-auth-modal` 即可打开弹窗 ── */
declare global {
	interface WindowEventMap {
		"open-auth-modal": CustomEvent<{ tab?: Tab }>;
		"auth-login-success": CustomEvent;
	}
}

let open = false;
let tab: Tab = "login";
let modalElement: HTMLDivElement | null = null;

/* ── 登录表单状态 ── */
let loginEmail = "";
let loginPassword = "";
let loginLoading = false;
let loginError = "";
let loginSuccess = "";

/* ── 注册表单状态 ── */
let regStep: "email" | "code" = "email";
let regEmail = "";
let regCode = "";
let sendLoading = false;
let verifyLoading = false;
let regError = "";
let regSuccess = "";
let countdown = 0;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function startCountdown(seconds: number) {
	countdown = seconds;
	if (countdownTimer) clearInterval(countdownTimer);
	countdownTimer = setInterval(() => {
		countdown -= 1;
		if (countdown <= 0) {
			countdown = 0;
			if (countdownTimer) clearInterval(countdownTimer);
			countdownTimer = null;
		}
	}, 1000);
}

function openModal(detail?: { tab?: Tab }) {
	tab = detail?.tab === "register" ? "register" : "login";
	open = true;
	resetForms();
}

function closeModal() {
	open = false;
}

function resetForms() {
	loginEmail = "";
	loginPassword = "";
	loginLoading = false;
	loginError = "";
	loginSuccess = "";
	regStep = "email";
	regEmail = "";
	regCode = "";
	sendLoading = false;
	verifyLoading = false;
	regError = "";
	regSuccess = "";
	countdown = 0;
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape" && open) closeModal();
}

onMount(() => {
	const onOpen = (event: Event) => {
		const detail = (event as CustomEvent<{ tab?: Tab }>).detail;
		openModal(detail);
	};
	window.addEventListener("open-auth-modal", onOpen);
	window.addEventListener("keydown", handleKeydown);

	// 设密码完成页跳转回来时自动打开登录弹窗
	try {
		if (sessionStorage.getItem("auth-modal-open")) {
			const tab = sessionStorage.getItem("auth-modal-open") as Tab | null;
			sessionStorage.removeItem("auth-modal-open");
			openModal({ tab: tab === "register" ? "register" : "login" });
		}
	} catch {
		/* sessionStorage 不可用时忽略 */
	}

	return () => {
		window.removeEventListener("open-auth-modal", onOpen);
		window.removeEventListener("keydown", handleKeydown);
		if (countdownTimer) clearInterval(countdownTimer);
	};
});

onDestroy(() => {
	if (countdownTimer) clearInterval(countdownTimer);
});

/* ── 登录提交 ── */
async function handleLogin(event: SubmitEvent) {
	event.preventDefault();
	if (loginLoading) return;
	loginError = "";
	loginSuccess = "";
	loginLoading = true;
	try {
		const response = await fetch("/api/auth/email/login", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: loginEmail, password: loginPassword }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			loginError = data.message || "登录失败，请稍后重试";
			return;
		}
		loginSuccess = "登录成功，正在刷新…";
		window.dispatchEvent(new CustomEvent("auth-login-success"));
		setTimeout(() => window.location.reload(), 600);
	} catch {
		loginError = "网络异常，请稍后重试";
	} finally {
		loginLoading = false;
	}
}

/* ── 注册：发送验证码 ── */
async function handleSendCode(event: SubmitEvent) {
	event.preventDefault();
	if (sendLoading || countdown > 0) return;
	regError = "";
	regSuccess = "";
	sendLoading = true;
	try {
		const response = await fetch("/api/auth/email/send-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: regEmail, purpose: "register" }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok) {
			regError = data.message || "发送失败，请稍后重试";
			return;
		}
		regStep = "code";
		regSuccess = "验证码已发送，请查收邮件（也可直接点击邮件中的链接设置密码）";
		startCountdown(60);
	} catch {
		regError = "网络异常，请稍后重试";
	} finally {
		sendLoading = false;
	}
}

/* ── 注册：提交验证码 → 跳设置密码页 ── */
async function handleVerifyCode(event: SubmitEvent) {
	event.preventDefault();
	if (verifyLoading) return;
	regError = "";
	verifyLoading = true;
	try {
		const response = await fetch("/api/auth/email/verify-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: regEmail, code: regCode, purpose: "register" }),
		});
		const data = await response.json();
		if (!response.ok || !data.ok || !data.token) {
			regError = data.message || "验证码不正确";
			return;
		}
		window.location.href = `/auth/set-password?token=${encodeURIComponent(data.token)}`;
	} catch {
		regError = "网络异常，请稍后重试";
	} finally {
		verifyLoading = false;
	}
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if open}
	<div
		class="auth-modal-overlay"
		transition:fade={{ duration: 160 }}
		on:click={(event) => {
			if (event.target === event.currentTarget) closeModal();
		}}
		role="presentation"
	>
		<div
			bind:this={modalElement}
			class="auth-modal"
			role="dialog"
			aria-modal="true"
			aria-label="账号登录 / 注册"
			transition:scale={{ duration: 200, start: 0.94 }}
		>
			<button type="button" class="auth-modal-close" on:click={closeModal} aria-label="关闭">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
			</button>

			<div class="auth-tabs" class:register={tab === "register"}>
				<button type="button" class="auth-tab" class:active={tab === "login"} on:click={() => (tab = "login")}>登录</button>
				<button type="button" class="auth-tab" class:active={tab === "register"} on:click={() => (tab = "register")}>注册</button>
				<span class="auth-tab-slider" aria-hidden="true"></span>
			</div>

			{#if tab === "login"}
				<form class="auth-form" on:submit={handleLogin}>
					<label class="auth-field">
						<span class="auth-label">邮箱</span>
						<input
							type="email"
							class="auth-input"
							placeholder="you@example.com"
							bind:value={loginEmail}
							required
							autocomplete="email"
						/>
					</label>
					<label class="auth-field">
						<span class="auth-label">密码</span>
						<input
							type="password"
							class="auth-input"
							placeholder="••••••••"
							bind:value={loginPassword}
							required
							autocomplete="current-password"
						/>
					</label>
					{#if loginError}<p class="auth-message error">{loginError}</p>{/if}
					{#if loginSuccess}<p class="auth-message success">{loginSuccess}</p>{/if}
					<button type="submit" class="auth-submit" disabled={loginLoading}>
						{loginLoading ? "登录中…" : "登录"}
					</button>
				</form>
			{:else if regStep === "email"}
				<form class="auth-form" on:submit={handleSendCode}>
					<label class="auth-field">
						<span class="auth-label">邮箱</span>
						<input
							type="email"
							class="auth-input"
							placeholder="you@example.com"
							bind:value={regEmail}
							required
							autocomplete="email"
						/>
					</label>
					{#if regError}<p class="auth-message error">{regError}</p>{/if}
					{#if regSuccess}<p class="auth-message success">{regSuccess}</p>{/if}
					<button type="submit" class="auth-submit" disabled={sendLoading}>
						{sendLoading ? "发送中…" : "发送验证码"}
					</button>
					<p class="auth-hint">邮件内含验证码与「设置密码」链接，两种方式任选其一完成注册</p>
				</form>
			{:else}
				<form class="auth-form" on:submit={handleVerifyCode}>
					<p class="auth-sent-to">
						验证码已发送至 <strong>{regEmail}</strong>
						<button type="button" class="auth-link" on:click={() => (regStep = "email")}>更换邮箱</button>
					</p>
					<label class="auth-field">
						<span class="auth-label">验证码</span>
						<input
							type="text"
							class="auth-input auth-input-code"
							placeholder="6 位数字"
							bind:value={regCode}
							required
							inputmode="numeric"
							maxlength="6"
							autocomplete="one-time-code"
						/>
					</label>
					{#if regError}<p class="auth-message error">{regError}</p>{/if}
					{#if regSuccess}<p class="auth-message success">{regSuccess}</p>{/if}
					<button type="submit" class="auth-submit" disabled={verifyLoading}>
						{verifyLoading ? "验证中…" : "下一步：设置密码"}
					</button>
					<button
						type="button"
						class="auth-resend"
						disabled={sendLoading || countdown > 0}
						on:click={handleSendCode}
					>
						{countdown > 0 ? `${countdown}s 后可重发` : "重新发送验证码"}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style lang="stylus">
.auth-modal-overlay
	position fixed
	inset 0
	z-index 1000
	display flex
	align-items center
	justify-content center
	padding 1rem
	background rgba(15, 23, 42, 0.45)
	backdrop-filter blur(6px)

.auth-modal
	position relative
	width min(92vw, 380px)
	padding 1.75rem 1.75rem 1.5rem
	border-radius 18px
	border 1px solid var(--capsule-menu-border, rgba(214, 222, 233, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.96))
	backdrop-filter blur(14px)
	box-shadow 0 24px 64px rgba(2, 6, 23, 0.32)

.auth-modal-close
	position absolute
	top 0.75rem
	right 0.75rem
	display inline-flex
	align-items center
	justify-content center
	width 32px
	height 32px
	border none
	border-radius 999px
	background transparent
	color var(--capsule-text, #1d2838)
	cursor pointer
	opacity 0.6
	transition opacity 0.15s ease, background-color 0.15s ease

	&:hover
		opacity 1
		background var(--capsule-btn-hover, rgba(28, 39, 56, 0.08))

	& svg
		width 18px
		height 18px

.auth-tabs
	position relative
	display grid
	grid-template-columns 1fr 1fr
	margin-bottom 1.4rem
	border-radius 12px
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.06))
	padding 3px

.auth-tab
	position relative
	z-index 1
	padding 0.5rem 0
	border none
	border-radius 10px
	background transparent
	font-size 0.9rem
	font-weight 600
	color var(--capsule-text, #1d2838)
	opacity 0.62
	cursor pointer
	transition opacity 0.2s ease, color 0.2s ease

	&.active
		opacity 1

.auth-tab-slider
	position absolute
	top 3px
	left 3px
	width calc(50% - 3px)
	height calc(100% - 6px)
	border-radius 10px
	background var(--capsule-bg, rgba(255, 255, 255, 0.9))
	box-shadow 0 2px 8px rgba(2, 6, 23, 0.12)
	transition transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)

.register .auth-tab-slider
	transform translateX(100%)

.auth-form
	display flex
	flex-direction column
	gap 0.9rem

.auth-field
	display flex
	flex-direction column
	gap 0.35rem

.auth-label
	font-size 0.78rem
	font-weight 600
	color var(--capsule-text, #1d2838)
	opacity 0.75

.auth-input
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

.auth-input-code
	letter-spacing 0.4em
	text-align center
	font-weight 600

.auth-submit
	margin-top 0.25rem
	padding 0.65rem 0
	border none
	border-radius 12px
	background var(--primary, #1d2838)
	color #fff
	font-size 0.92rem
	font-weight 600
	cursor pointer
	transition transform 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease
	box-shadow 0 6px 18px rgba(29, 40, 56, 0.22)

	&:hover:not(:disabled)
		transform translateY(-1px)
		box-shadow 0 10px 24px rgba(29, 40, 56, 0.28)

	&:active:not(:disabled)
		transform scale(0.98)

	&:disabled
		opacity 0.6
		cursor not-allowed

.auth-resend
	padding 0
	border none
	background transparent
	color var(--primary, #4f8ef7)
	font-size 0.8rem
	font-weight 600
	cursor pointer

	&:disabled
		opacity 0.55
		cursor not-allowed

.auth-link
	margin-left 0.5rem
	padding 0
	border none
	background transparent
	color var(--primary, #4f8ef7)
	font-size 0.8rem
	font-weight 600
	cursor pointer

.auth-message
	margin 0
	font-size 0.8rem
	line-height 1.5

	&.error
		color #dc2626

	&.success
		color #16a34a

.auth-sent-to
	margin 0
	font-size 0.84rem
	color var(--capsule-text, #1d2838)

.auth-hint
	margin 0
	font-size 0.76rem
	line-height 1.6
	color #9ca3af

@media (max-width: 480px)
	.auth-modal
		padding 1.4rem 1.2rem 1.2rem
</style>
