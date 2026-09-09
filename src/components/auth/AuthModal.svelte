<script lang="ts">
import { fade, scale } from "svelte/transition";
import { onDestroy, onMount } from "svelte";

type View = "login" | "reg-email" | "reg-code";

let open = false;
let view: View = "login";
let modalElement: HTMLDivElement | null = null;

/* ── 登录表单状态 ── */
let loginEmail = "";
let loginPassword = "";
let showPassword = false;
let loginLoading = false;
let loginError = "";
let loginSuccess = "";
let forgotMsg = false;

/* ── 注册表单状态 ── */
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

$: overlayTitle = view === "login" ? "登录LiyueAccount账号" : "注册LiyueAccount账号";

function openModal(detail?: { view?: "login" | "reg-email" }) {
	view = detail?.view === "reg-email" ? "reg-email" : "login";
	open = true;
	resetForms();
}

function closeModal() {
	open = false;
}

function switchView(next: View) {
	view = next;
	loginError = "";
	loginSuccess = "";
	regError = "";
	regSuccess = "";
	forgotMsg = false;
}

function resetForms() {
	loginEmail = "";
	loginPassword = "";
	loginLoading = false;
	loginError = "";
	loginSuccess = "";
	forgotMsg = false;
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

/**
 * Portal：把弹窗 DOM 移到 document.body 下。
 * 导航胶囊带 backdrop-filter，会让祖先内 position:fixed 失效，
 * portal 到 body 后 fixed 才真正相对视口居中。
 */
function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		},
	};
}

onMount(() => {
	const onOpen = (event: Event) => {
		const detail = (event as CustomEvent<{ view?: "login" | "reg-email" }>).detail;
		openModal(detail);
	};
	window.addEventListener("open-auth-modal", onOpen);
	window.addEventListener("keydown", handleKeydown);

	// 设密码完成页跳转回来时自动打开登录视图
	try {
		const flag = sessionStorage.getItem("auth-modal-open");
		if (flag) {
			sessionStorage.removeItem("auth-modal-open");
			openModal({ view: flag === "register" ? "reg-email" : "login" });
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

/* ── 注册：发送验证码（兼容 form submit 与按钮 click 两种触发） ── */
async function handleSendCode(event?: { preventDefault(): void }) {
	event?.preventDefault();
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
		view = "reg-code";
		regSuccess = "验证码已发送至你的邮箱，请查收";
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
		bind:this={modalElement}
		use:portal
		class="auth-overlay"
		transition:fade={{ duration: 160 }}
		on:click={(event) => {
			if (event.target === event.currentTarget) closeModal();
		}}
		role="presentation"
	>
		<p class="overlay-title" transition:fade={{ duration: 160 }}>{overlayTitle}</p>
		<div
			class="auth-card"
			role="dialog"
			aria-modal="true"
			aria-label="账号登录 / 注册"
			transition:scale={{ duration: 200, start: 0.95 }}
		>
			<button type="button" class="auth-close" on:click={closeModal} aria-label="关闭">
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
			</button>

			<!-- 左侧品牌面板 -->
			<aside class="brand-panel">
				<div class="brand-glow brand-glow-1" aria-hidden="true"></div>
				<div class="brand-glow brand-glow-2" aria-hidden="true"></div>
				<span class="brand-badge" aria-hidden="true">
					<svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" fill="currentColor"/></svg>
				</span>
				<h1 class="brand-title">liyue blog</h1>
				<p class="brand-subtitle">分享技术与生活的博客</p>
				<div class="brand-footer" aria-hidden="true">
					<span class="brand-dot"></span>
					<span class="brand-dot"></span>
					<span class="brand-dot"></span>
				</div>
			</aside>

			<!-- 右侧表单面板 -->
			<section class="form-panel">
				{#if view === "login"}
					<header class="panel-header">
						<h2 class="panel-title">登录</h2>
						<p class="panel-subtitle">欢迎回来，请输入账号信息</p>
					</header>
					<form class="form" on:submit={handleLogin}>
						<label class="field">
							<span class="field-label">邮箱</span>
							<input
								type="email"
								class="input"
								placeholder="you@example.com"
								bind:value={loginEmail}
								required
								autocomplete="email"
							/>
						</label>
						<label class="field">
							<span class="field-label">密码</span>
							<div class="input-wrap">
								<input
									type={showPassword ? "text" : "password"}
									class="input"
									placeholder="••••••••"
									bind:value={loginPassword}
									required
									autocomplete="current-password"
								/>
								<button
									type="button"
									class="eye-btn"
									on:click={() => (showPassword = !showPassword)}
									aria-label={showPassword ? "隐藏密码" : "显示密码"}
									tabindex="-1"
								>
									{#if showPassword}
										<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" fill="currentColor"/></svg>
									{:else}
										<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
									{/if}
								</button>
							</div>
						</label>
						{#if loginError}<p class="msg msg-error">{loginError}</p>{/if}
						{#if loginSuccess}<p class="msg msg-success">{loginSuccess}</p>{/if}
						<button type="submit" class="submit-btn" disabled={loginLoading}>
							{loginLoading ? "登录中…" : "登录"}
						</button>
					</form>
					<footer class="panel-footer">
						<button type="button" class="link-btn" on:click={() => switchView("reg-email")}>
							创建账号
						</button>
						<span class="footer-divider" aria-hidden="true"></span>
						<button type="button" class="link-btn" on:click={() => (forgotMsg = !forgotMsg)}>
							忘记密码
						</button>
						</footer>
					{#if forgotMsg}
						<p class="msg msg-hint" transition:fade={{ duration: 120 }}>
							暂未开放自助找回，请发邮件至 me@liyueovo.top，验证后帮你重置。
						</p>
					{/if}
				{:else if view === "reg-email"}
					<header class="panel-header">
						<h2 class="panel-title">创建账号</h2>
						<p class="panel-subtitle">输入邮箱，我们将发送验证码</p>
					</header>
					<form class="form" on:submit={handleSendCode}>
						<label class="field">
							<span class="field-label">邮箱</span>
							<input
								type="email"
								class="input"
								placeholder="you@example.com"
								bind:value={regEmail}
								required
								autocomplete="email"
							/>
						</label>
						{#if regError}<p class="msg msg-error">{regError}</p>{/if}
						{#if regSuccess}<p class="msg msg-success">{regSuccess}</p>{/if}
						<button type="submit" class="submit-btn" disabled={sendLoading}>
							{sendLoading ? "发送中…" : "发送验证码"}
						</button>
					</form>
					<footer class="panel-footer">
						<button type="button" class="link-btn" on:click={() => switchView("login")}>
							← 返回登录
						</button>
					</footer>
					<p class="panel-note">发送后 15 分钟内有效，请留意垃圾箱</p>
				{:else}
					<header class="panel-header">
						<h2 class="panel-title">输入验证码</h2>
						<p class="panel-subtitle">
							已发送至 <strong class="sent-mail">{regEmail}</strong>
						</p>
					</header>
					<form class="form" on:submit={handleVerifyCode}>
						<label class="field">
							<span class="field-label">验证码</span>
							<input
								type="text"
								class="input input-code"
								placeholder="6 位数字"
								bind:value={regCode}
								required
								inputmode="numeric"
								maxlength="6"
								autocomplete="one-time-code"
							/>
						</label>
						{#if regError}<p class="msg msg-error">{regError}</p>{/if}
						{#if regSuccess}<p class="msg msg-success">{regSuccess}</p>{/if}
						<button type="submit" class="submit-btn" disabled={verifyLoading}>
							{verifyLoading ? "验证中…" : "下一步：设置密码"}
						</button>
					</form>
					<footer class="panel-footer">
						<button
							type="button"
							class="link-btn"
							disabled={sendLoading || countdown > 0}
							on:click={handleSendCode}
						>
							{countdown > 0 ? `重新发送（${countdown}s）` : "重新发送验证码"}
						</button>
						<span class="footer-divider" aria-hidden="true"></span>
						<button type="button" class="link-btn" on:click={() => switchView("reg-email")}>
							更换邮箱
						</button>
					</footer>
				{/if}
			</section>
		</div>
	</div>
{/if}

<style lang="stylus">
/* ── 遮罩 ── */
.auth-overlay
	position fixed
	inset 0
	z-index 1000
	display flex
	flex-direction column
	align-items center
	justify-content center
	gap 0.9rem
	padding 1rem
	background rgba(10, 14, 22, 0.5)
	backdrop-filter blur(8px)
	-webkit-backdrop-filter blur(8px)

.overlay-title
	margin 0
	font-size 1.05rem
	font-weight 700
	letter-spacing 0.02em
	color rgba(255, 255, 255, 0.92)
	text-shadow 0 2px 12px rgba(0, 0, 0, 0.35)
	text-align center

/* ── 双面板卡片 ── */
.auth-card
	position relative
	display grid
	grid-template-columns 1fr 1fr
	width 720px
	max-width 94vw
	max-height 92vh
	border-radius 20px
	overflow hidden
	border 1px solid rgba(228, 232, 240, 0.9)
	background #ffffff
	box-shadow 0 28px 72px rgba(2, 6, 23, 0.35)

/* 关闭按钮 */
.auth-close
	position absolute
	top 12px
	right 12px
	z-index 5
	display inline-flex
	align-items center
	justify-content center
	width 32px
	height 32px
	border none
	border-radius 999px
	background rgba(120, 128, 145, 0.1)
	color #6b7280
	cursor pointer
	transition background-color 0.15s ease, color 0.15s ease, transform 0.15s ease

	&:hover
		background rgba(120, 128, 145, 0.18)
		color #374151
		transform rotate(90deg)

	& svg
		width 17px
		height 17px

/* ── 左侧品牌面板（浅色灰，深色模式自动加深） ── */
.brand-panel
	position relative
	display flex
	flex-direction column
	justify-content center
	align-items flex-start
	gap 0.65rem
	padding 2.5rem 1.5rem
	background linear-gradient(160deg, #f4f5f7 0%, #e9ebef 100%)
	overflow hidden

.brand-glow
	position absolute
	border-radius 999px
	filter blur(56px)
	opacity 0.5
	pointer-events none

.brand-glow-1
	width 220px
	height 220px
	top -60px
	right -60px
	background rgba(249, 115, 22, 0.22)

.brand-glow-2
	width 180px
	height 180px
	bottom -50px
	left -50px
	background rgba(99, 102, 241, 0.16)

.brand-badge
	display inline-flex
	align-items center
	justify-content center
	width 42px
	height 42px
	border-radius 13px
	background linear-gradient(135deg, #f97316, #fb923c)
	color #ffffff
	box-shadow 0 8px 20px rgba(249, 115, 22, 0.35)
	margin-bottom 0.4rem

	& svg
		width 21px
		height 21px

.brand-title
	margin 0
	font-size 1.5rem
	font-weight 800
	letter-spacing -0.02em
	color #1d2838

.brand-subtitle
	margin 0
	font-size 0.9rem
	line-height 1.7
	color #6b7280

.brand-footer
	display flex
	gap 7px
	margin-top 1.6rem

.brand-dot
	width 8px
	height 8px
	border-radius 999px
	background #f97316
	opacity 0.85

	&:nth-child(2)
		opacity 0.45

	&:nth-child(3)
		opacity 0.2

/* ── 右侧表单面板（固定最小高度，登录/注册视图切换时窗口大小不变） ── */
.form-panel
	display flex
	flex-direction column
	justify-content center
	gap 1.1rem
	min-height 420px
	padding 2.5rem 2.4rem
	background #ffffff

.panel-header
	display flex
	flex-direction column
	gap 0.3rem

.panel-title
	margin 0
	font-size 1.35rem
	font-weight 700
	color #1d2838

.panel-subtitle
	margin 0
	font-size 0.85rem
	color #6b7280

.sent-mail
	color #f97316
	word-break break-all

.form
	display flex
	flex-direction column
	gap 0.95rem

.field
	display flex
	flex-direction column
	gap 0.4rem

.field-label
	font-size 0.78rem
	font-weight 600
	color #4b5563

/* 输入框：聚焦橙色光效 */
.input
	padding 0.62rem 0.85rem
	border-radius 12px
	border 1.5px solid #e2e5ea
	background #fafbfc
	color #1d2838
	font-size 0.92rem
	outline none
	transition border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease

	/* 隐藏浏览器原生密码显隐按钮，统一用自定义眼睛图标 */
	&::-ms-reveal
	&::-ms-clear
	&::-webkit-credentials-auto-fill-button
		display none

	&::placeholder
		color #b3b9c4

	&:hover
		border-color #d3d7de

	&:focus
		border-color #f97316
		background #ffffff
		box-shadow 0 0 0 4px rgba(249, 115, 22, 0.16), 0 1px 6px rgba(249, 115, 22, 0.12)

.input-code
	letter-spacing 0.4em
	text-align center
	font-weight 600

/* 密码可见性切换 */
.input-wrap
	position relative
	display flex
	align-items center

	& .input
		width 100%
		padding-right 2.7rem

.eye-btn
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

/* 主按钮 */
.submit-btn
	margin-top 0.2rem
	padding 0.68rem 0
	border none
	border-radius 12px
	background linear-gradient(135deg, #ea6c0a, #f97316)
	color #ffffff
	font-size 0.94rem
	font-weight 700
	letter-spacing 0.02em
	cursor pointer
	box-shadow 0 8px 20px rgba(249, 115, 22, 0.32)
	transition transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease

	&:hover:not(:disabled)
		transform translateY(-1px)
		box-shadow 0 12px 26px rgba(249, 115, 22, 0.4)

	&:active:not(:disabled)
		transform scale(0.985)

	&:disabled
		opacity 0.62
		cursor not-allowed

/* 底部链接区 */
.panel-footer
	display flex
	align-items center
	gap 0.7rem

.footer-divider
	width 1px
	height 12px
	background #d8dce3

.link-btn
	padding 0
	border none
	background transparent
	color #6b7280
	font-size 0.83rem
	font-weight 600
	cursor pointer
	transition color 0.15s ease

	&:hover:not(:disabled)
		color #f97316

	&:disabled
		opacity 0.55
		cursor not-allowed

.panel-note
	margin 0
	font-size 0.76rem
	line-height 1.65
	color #9ca3af

/* 消息 */
.msg
	margin 0
	font-size 0.82rem
	line-height 1.55

	&.msg-error
		color #dc2626

	&.msg-success
		color #16a34a

	&.msg-hint
		color #9a6700
		background rgba(245, 158, 11, 0.1)
		padding 0.55rem 0.75rem
		border-radius 10px

/* ── 深色模式 ── */
:global(.dark) .auth-card
	border-color rgba(63, 70, 84, 0.85)
	background #191e26

:global(.dark) .auth-close
	background rgba(255, 255, 255, 0.07)
	color #9aa2b1

	&:hover
		background rgba(255, 255, 255, 0.13)
		color #d6dae2

:global(.dark) .brand-panel
	background linear-gradient(160deg, #232936 0%, #1b202b 100%)

:global(.dark) .brand-title
	color #e8ebf1

:global(.dark) .brand-subtitle
	color #9aa2b1

:global(.dark) .form-panel
	background #191e26

:global(.dark) .panel-title
	color #e8ebf1

:global(.dark) .panel-subtitle
	color #9aa2b1

:global(.dark) .field-label
	color #b9c0cc

:global(.dark) .input
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

:global(.dark) .footer-divider
	background #333b49

:global(.dark) .eye-btn
	color #6b7280

	&:hover
		color #d6dae2
		background rgba(255, 255, 255, 0.08)

:global(.dark) .link-btn
	color #9aa2b1

	&:hover:not(:disabled)
		color #fb923c

:global(.dark) .panel-note
	color #6b7280

:global(.dark) .msg.msg-hint
	color #fbbf24
	background rgba(245, 158, 11, 0.12)

/* ── 移动端：隐藏品牌面板，仅保留表单 ── */
@media (max-width: 760px)
	.auth-card
		grid-template-columns 1fr
		width 420px
		max-width 92vw
		border-radius 18px

	.brand-panel
		display none

	.form-panel
		min-height 360px
		padding 2rem 1.6rem 1.8rem

@media (max-width: 420px)
	.auth-card
		max-width 96vw

	.form-panel
		padding 1.7rem 1.25rem 1.5rem
</style>
