<script lang="ts">
	import { onMount } from "svelte";
	import { startRegistration } from "@simplewebauthn/browser";
	import QRCode from "qrcode";

	export let loginIp = "未知 IP";
	export let loginAt = Date.now();
	export let isEmailAccount = false;

	type DeviceSession = {
		sessionId: string;
		provider?: string;
		ip?: string;
		ipLocation?: string;
		userAgent?: string;
		issuedAt?: string | number;
	};

	type PasskeyItem = {
		id: number;
		deviceLabel: string;
		createdAt?: string | number;
		lastUsedAt?: string | number | null;
	};

	let notice = "";
	let noticeTimer: ReturnType<typeof setTimeout> | undefined;
	let deviceName = "当前设备";
	let loginTime = "未知时间";
	let sessions: DeviceSession[] = [];
	let currentSessionId = "";
	let sessionsLoading = true;
	let sessionMessage = "";
	let totpEnabled = false;
	let totpSetup = false;
	let totpSecret = "";
	let totpUri = "";
	let totpQr = "";
	let totpCode = "";
	let totpLoading = false;
	let totpMessage = "";

	let passkeys: PasskeyItem[] = [];
	let passkeysLoading = true;
	let passkeyLoading = false;
	let passkeyMessage = "";

	async function loadPasskeys() {
		if (!isEmailAccount) {
			passkeysLoading = false;
			return;
		}
		passkeysLoading = true;
		try {
			const response = await fetch("/api/account/passkeys");
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "通行密钥读取失败");
			passkeys = Array.isArray(data.passkeys) ? data.passkeys : [];
		} catch (error) {
			passkeyMessage = error instanceof Error ? error.message : "通行密钥读取失败";
		} finally {
			passkeysLoading = false;
		}
	}

	function passkeyErrorText(error: unknown): string {
		const name = (error as { name?: string })?.name;
		if (name === "NotAllowedError") return "已取消操作或验证超时，请重试";
		if (name === "InvalidStateError") return "此设备上已存在该账号的通行密钥";
		if (name === "SecurityError") return "站点与通行密钥的域名不匹配";
		if (name === "NotSupportedError" || name === "TypeError") return "当前环境不支持通行密钥（需 HTTPS 与现代浏览器）";
		return error instanceof Error && error.message ? error.message : "操作失败，请重试";
	}

	async function addPasskey() {
		if (passkeyLoading) return;
		passkeyLoading = true;
		passkeyMessage = "";
		try {
			const optionsRes = await fetch("/api/account/passkeys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "register-options" }),
			});
			const optionsData = await optionsRes.json();
			if (!optionsRes.ok || !optionsData.ok) throw new Error(optionsData.message || "无法开始添加");
			const attestation = await startRegistration({ optionsJSON: optionsData.options });
			const verifyRes = await fetch("/api/account/passkeys", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "register-verify", credential: attestation, deviceLabel: deviceName }),
			});
			const verifyData = await verifyRes.json();
			if (!verifyRes.ok || !verifyData.ok) throw new Error(verifyData.message || "通行密钥验证失败");
			passkeyMessage = "通行密钥添加成功";
			await loadPasskeys();
		} catch (error) {
			passkeyMessage = passkeyErrorText(error);
		} finally {
			passkeyLoading = false;
		}
	}

	async function deletePasskey(id: number) {
		try {
			const response = await fetch(`/api/account/passkeys/${encodeURIComponent(String(id))}`, { method: "DELETE" });
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "删除失败");
			passkeys = passkeys.filter((item) => item.id !== id);
		} catch (error) {
			passkeyMessage = error instanceof Error ? error.message : "删除失败";
		}
	}

	function formatDate(value: string | number | undefined) {
		if (!value) return "未知时间";
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? "未知时间"
			: new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "medium" }).format(date);
	}

	function browserLabel(userAgent = "") {
		const browser = /Edg\//.test(userAgent)
			? "Edge"
			: /Chrome\//.test(userAgent)
				? "Chrome"
				: /Firefox\//.test(userAgent)
					? "Firefox"
					: /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
						? "Safari"
						: "浏览器";
		const platform = /Windows/.test(userAgent)
			? "Windows"
			: /Mac OS X/.test(userAgent)
				? "macOS"
				: /Android/.test(userAgent)
					? "Android"
					: /iPhone|iPad/.test(userAgent)
						? "iOS"
						: /Linux/.test(userAgent)
							? "Linux"
							: "未知系统";
		return `${browser} · ${platform}`;
	}

	async function loadSessions() {
		sessionsLoading = true;
		try {
			const response = await fetch("/api/account/sessions");
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "设备读取失败");
			currentSessionId = data.currentSessionId || "";
			sessions = Array.isArray(data.sessions) ? data.sessions : [];
		} catch (error) {
			sessionMessage = error instanceof Error ? error.message : "设备读取失败";
		} finally {
			sessionsLoading = false;
		}
	}

	async function revokeSession(sessionId: string) {
		try {
			const response = await fetch(`/api/account/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "退出设备失败");
			sessions = sessions.filter((item) => item.sessionId !== sessionId);
		} catch (error) {
			sessionMessage = error instanceof Error ? error.message : "退出设备失败";
		}
	}

	async function revokeOtherSessions() {
		try {
			const response = await fetch("/api/account/sessions", { method: "DELETE" });
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "退出其他设备失败");
			sessions = sessions.filter((item) => item.sessionId === currentSessionId);
			sessionMessage = `已退出 ${data.revoked ?? 0} 台其他设备`;
		} catch (error) {
			sessionMessage = error instanceof Error ? error.message : "退出其他设备失败";
		}
	}

	async function loadTotp() {
		if (!isEmailAccount) return;
		try {
			const response = await fetch("/api/account/totp");
			const data = await response.json();
			if (response.ok && data.ok) totpEnabled = Boolean(data.enabled);
		} catch {
			/* 状态读取失败时保留默认未启用状态 */
		}
	}

	async function startTotpSetup() {
		totpLoading = true;
		totpMessage = "";
		try {
			const response = await fetch("/api/account/totp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "setup" }),
			});
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "无法开始设置");
			totpSecret = data.secret;
			totpUri = data.otpauthUri;
			totpQr = await QRCode.toDataURL(data.otpauthUri, { margin: 1, width: 180 });
			totpSetup = true;
		} catch (error) {
			totpMessage = error instanceof Error ? error.message : "无法开始设置";
		} finally {
			totpLoading = false;
		}
	}

	async function verifyTotp() {
		if (!/^\d{6}$/.test(totpCode)) {
			totpMessage = "请输入 6 位验证码";
			return;
		}
		totpLoading = true;
		totpMessage = "";
		try {
			const response = await fetch("/api/account/totp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "verify", code: totpCode }),
			});
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "验证码不正确");
			totpEnabled = true;
			totpSetup = false;
			totpCode = "";
		} catch (error) {
			totpMessage = error instanceof Error ? error.message : "验证码不正确";
		} finally {
			totpLoading = false;
		}
	}

	async function disableTotp() {
		if (!/^\d{6}$/.test(totpCode)) {
			totpMessage = "请输入当前 6 位验证码";
			return;
		}
		totpLoading = true;
		try {
			const response = await fetch("/api/account/totp", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "disable", code: totpCode }),
			});
			const data = await response.json();
			if (!response.ok || !data.ok) throw new Error(data.message || "停用失败");
			totpEnabled = false;
			totpSetup = false;
			totpCode = "";
		} catch (error) {
			totpMessage = error instanceof Error ? error.message : "停用失败";
		} finally {
			totpLoading = false;
		}
	}

	onMount(() => {
		const ua = navigator.userAgent;
		const browser = /Edg\//.test(ua)
			? "Edge"
			: /Chrome\//.test(ua)
				? "Chrome"
				: /Firefox\//.test(ua)
					? "Firefox"
					: /Safari\//.test(ua) && !/Chrome\//.test(ua)
						? "Safari"
						: "浏览器";
		const platform = /Windows/.test(ua)
			? "Windows"
			: /Mac OS X/.test(ua)
				? "macOS"
				: /Android/.test(ua)
					? "Android"
					: /iPhone|iPad/.test(ua)
						? "iOS"
						: /Linux/.test(ua)
							? "Linux"
							: "未知系统";
		deviceName = `${browser} · ${platform}`;
		loginTime = formatDate(loginAt);
		void Promise.all([loadSessions(), loadTotp(), loadPasskeys()]);
	});

	function showNotice(feature: string) {
		notice = `${feature}功能即将上线，当前暂未开放。`;
		if (noticeTimer) clearTimeout(noticeTimer);
		noticeTimer = setTimeout(() => {
			notice = "";
		}, 3200);
	}
</script>

<div class="security-settings">
	<header class="security-head">
		<h2 class="security-title">安全设置</h2>
		<p class="security-sub">管理登录凭据和额外的账号保护</p>
	</header>

	<div class="security-list">
		<section class="security-item">
			<div class="security-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24"><path d="M17 8V6a5 5 0 0 0-10 0v2H5.5A2.5 2.5 0 0 0 3 10.5v8A2.5 2.5 0 0 0 5.5 21h13a2.5 2.5 0 0 0 2.5-2.5v-8A2.5 2.5 0 0 0 18.5 8H17zm-8-2a3 3 0 0 1 6 0v2H9V6zm3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" fill="currentColor" /></svg>
			</div>
			<div class="security-copy">
				<h3>Passkey 通行密钥</h3>
				<p>使用设备的指纹、人脸识别或 PIN 安全登录，无需记忆密码。</p>
			</div>
			<div class="security-meta">
				{#if isEmailAccount}
					<span class="security-status">{passkeysLoading ? "读取中…" : passkeys.length ? `已设置 ${passkeys.length} 个` : "未设置"}</span>
					<button type="button" class="security-action" disabled={passkeyLoading} on:click={addPasskey}>
						{passkeyLoading ? "等待验证…" : "添加"}
					</button>
				{:else}
					<span class="security-status">邮箱账号可用</span>
				{/if}
			</div>
			{#if isEmailAccount && passkeys.length}
				<ul class="passkey-list">
					{#each passkeys as item (item.id)}
						<li class="passkey-item">
							<span class="passkey-name">🔐 {item.deviceLabel}</span>
							<span class="passkey-date">添加于 {formatDate(item.createdAt)}</span>
							<button type="button" class="passkey-delete" on:click={() => deletePasskey(item.id)}>删除</button>
						</li>
					{/each}
				</ul>
			{/if}
			{#if passkeyMessage}<p class="totp-message">{passkeyMessage}</p>{/if}
		</section>

		<section class="security-item">
			<div class="security-icon" aria-hidden="true">
				<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5.25 3.4 9.98 8 11 4.6-1.02 8-5.75 8-11V5l-8-3zm0 4.18 5 1.88V11c0 3.82-2.28 7.45-5 8.45C9.28 18.45 7 14.82 7 11V8.06l5-1.88zM11 9v4h2V9h-2zm0 5v2h2v-2h-2z" fill="currentColor" /></svg>
			</div>
			<div class="security-copy">
				<h3>双因素登录验证</h3>
				<p>登录时增加一次性验证码，进一步保护你的账号安全。</p>
			</div>
			<div class="security-meta">
				<span class="security-status">{totpEnabled ? "已启用" : "未启用"}</span>
				{#if isEmailAccount}
					<button type="button" class="security-action" disabled={totpLoading} on:click={totpEnabled ? () => (totpSetup = !totpSetup) : startTotpSetup}>
						{totpEnabled ? "停用" : totpLoading ? "准备中…" : "设置"}
					</button>
				{:else}
					<span class="security-status">邮箱账号可用</span>
				{/if}
			</div>
			{#if isEmailAccount && totpSetup}
				<div class="totp-setup">
					{#if !totpEnabled}
						<p class="totp-instruction">用验证器扫描二维码，或手动输入密钥，然后输入验证器中的 6 位验证码。</p>
						{#if totpQr}<img class="totp-qr" src={totpQr} alt="双因素验证二维码" />{/if}
						<code class="totp-secret">{totpSecret}</code>
					{:else}
						<p class="totp-instruction">输入验证器中的当前 6 位验证码以停用双因素验证。</p>
					{/if}
					<div class="totp-actions">
						<input class="totp-input" bind:value={totpCode} inputmode="numeric" maxlength="6" placeholder="6 位验证码" aria-label="6 位验证码" />
						<button type="button" class="security-action" disabled={totpLoading} on:click={totpEnabled ? disableTotp : verifyTotp}>{totpEnabled ? "确认停用" : "确认启用"}</button>
					</div>
				</div>
			{/if}
			{#if isEmailAccount && totpMessage}
				<p class="totp-message">{totpMessage}</p>
			{/if}
		</section>
	</div>

	{#if notice}
		<p class="security-notice" role="status" aria-live="polite">{notice}</p>
	{/if}

	<section class="device-section">
		<header class="device-head">
			<h3>登录设备管理</h3>
			<p>查看并管理已登录此账号的设备</p>
		</header>
		<div class="device-list">
			{#if sessionsLoading}
				<p class="device-empty">正在读取设备…</p>
			{:else if sessions.length === 0}
				<div class="device-item">
					<div class="device-icon" aria-hidden="true">◌</div>
					<div class="device-copy">
						<h4>{deviceName}</h4>
						<p>登录时间：{loginTime}</p>
						<p class="device-ip">IP：{loginIp}</p>
					</div>
					<span class="device-current">当前设备</span>
					<a class="security-action security-action-logout" href="/api/auth/logout">退出登录</a>
				</div>
			{:else}
				{#each sessions as item}
				<div class="device-item">
				<div class="device-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H14v2h2.5a1 1 0 1 1 0 2h-9a1 1 0 1 1 0-2H10v-2H6.5A2.5 2.5 0 0 1 4 13.5v-8zM6 5v8.5c0 .28.22.5.5.5h11c.28 0 .5-.22.5-.5V5H6z" fill="currentColor" /></svg>
				</div>
				<div class="device-copy">
					<h4>{browserLabel(item.userAgent)}{item.sessionId === currentSessionId ? " · 当前设备" : ""}</h4>
					<p>登录时间：{formatDate(item.issuedAt)}</p>
					<p class="device-ip">IP：{item.ip || "未知 IP"}{item.ipLocation ? ` · ${item.ipLocation}` : ""}</p>
				</div>
				{#if item.sessionId === currentSessionId}<span class="device-current">当前设备</span>{/if}
				{#if item.sessionId === currentSessionId}
					<a class="security-action security-action-logout" href="/api/auth/logout">退出登录</a>
				{:else}
					<button type="button" class="security-action security-action-logout" on:click={() => revokeSession(item.sessionId)}>退出</button>
				{/if}
			</div>
				{/each}
			{/if}
		</div>
		{#if sessionMessage}<p class="device-note">{sessionMessage}</p>{/if}
		<button type="button" class="device-revoke-all" disabled={sessionsLoading || sessions.length < 2} on:click={revokeOtherSessions}>退出全部其他设备</button>
	</section>
</div>

<style lang="stylus">
.security-settings
	width 100%

.security-head
	margin-bottom 1.4rem

.security-title
	margin 0
	font-size 1.18rem
	font-weight 800
	color var(--text-color, #111111)

.security-sub
	margin 0.3rem 0 0
	font-size 0.82rem
	color rgba(17, 17, 17, 0.62)

.security-list
	display flex
	flex-direction column
	gap 0.8rem

.security-item
	display grid
	grid-template-columns auto minmax(0, 1fr) auto
	align-items center
	gap 0.9rem
	padding 1rem 1.1rem
	border 1px solid var(--surface-border, #dddddd)
	border-radius 14px
	background var(--card-bg, #f5f5f5)
	transition border-color 0.15s ease, transform 0.15s ease

	&:hover
		border-color rgba(249, 115, 22, 0.65)

.security-icon
	display inline-flex
	align-items center
	justify-content center
	width 38px
	height 38px
	border-radius 11px
	background rgba(249, 115, 22, 0.12)
	color #f97316

	& svg
		width 21px
		height 21px

.security-copy
	min-width 0

	& h3
		margin 0
		font-size 0.92rem
		font-weight 750
		color var(--text-color, #111111)

	& p
		margin 0.25rem 0 0
		font-size 0.78rem
		line-height 1.55
		color rgba(17, 17, 17, 0.62)

.security-meta
	display flex
	align-items center
	gap 0.65rem
	flex-shrink 0

.security-status
	font-size 0.75rem
	color rgba(17, 17, 17, 0.55)
	white-space nowrap

.security-action
	padding 0.45rem 0.8rem
	border 1.5px solid rgba(249, 115, 22, 0.48)
	border-radius 9px
	background transparent
	color #ea6c0a
	font-size 0.78rem
	font-weight 700
	cursor pointer
	transition background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease
	white-space nowrap

	&:hover
		border-color #f97316
		background rgba(249, 115, 22, 0.1)
		color #c2410c

.security-notice
	margin 0.9rem 0 0
	padding 0.7rem 0.85rem
	border 1px solid rgba(249, 115, 22, 0.28)
	border-radius 10px
	background rgba(249, 115, 22, 0.08)
	color #c2410c
	font-size 0.8rem

.totp-setup
	grid-column 1 / -1
	margin-top 0.2rem
	padding 0.85rem
	border-top 1px solid var(--surface-border, #dddddd)
	font-size 0.78rem

.totp-instruction
	margin 0 0 0.65rem
	line-height 1.55
	color rgba(17, 17, 17, 0.62)

.totp-qr
	display block
	width 180px
	height 180px
	margin 0 auto 0.65rem
	border-radius 8px
	background #ffffff

.totp-secret
	display block
	margin-bottom 0.65rem
	padding 0.5rem
	border-radius 7px
	background rgba(120, 128, 145, 0.1)
	font-size 0.78rem
	letter-spacing 0.08em
	text-align center
	word-break break-all
	color var(--text-color, #111111)

.totp-actions
	display flex
	gap 0.55rem
	align-items center

.totp-input
	min-width 0
	width 150px
	padding 0.48rem 0.65rem
	border 1.5px solid var(--surface-border, #dddddd)
	border-radius 9px
	background var(--page-bg, #ffffff)
	color var(--text-color, #111111)
	font-size 0.8rem
	letter-spacing 0.12em
	text-align center

.totp-message
	grid-column 1 / -1
	margin 0.55rem 0 0
	color #dc2626

.passkey-list
	grid-column 1 / -1
	list-style none
	margin 0.4rem 0 0
	padding 0
	display flex
	flex-direction column
	gap 0.4rem

.passkey-item
	display flex
	align-items center
	gap 0.6rem
	padding 0.5rem 0.7rem
	border 1px solid var(--surface-border, #dddddd)
	border-radius 10px
	background var(--page-bg, #ffffff)
	font-size 0.78rem

.passkey-name
	flex 1
	min-width 0
	font-weight 650
	color var(--text-color, #111111)
	overflow hidden
	text-overflow ellipsis
	white-space nowrap

.passkey-date
	color rgba(17, 17, 17, 0.5)
	white-space nowrap
	font-size 0.72rem

.passkey-delete
	padding 0.3rem 0.6rem
	border 1px solid rgba(220, 38, 38, 0.35)
	border-radius 8px
	background transparent
	color #dc2626
	font-size 0.72rem
	font-weight 700
	cursor pointer
	white-space nowrap
	transition background-color 0.15s ease, border-color 0.15s ease

	&:hover
		border-color #dc2626
		background rgba(220, 38, 38, 0.08)

.device-empty
	margin 0
	padding 0.9rem
	border 1px dashed var(--surface-border, #dddddd)
	border-radius 12px
	color rgba(17, 17, 17, 0.58)
	font-size 0.78rem
	text-align center

.device-section
	margin-top 2rem

.device-head
	margin-bottom 0.8rem

	& h3
		margin 0
		font-size 0.98rem
		font-weight 800
		color var(--text-color, #111111)

	& p
		margin 0.25rem 0 0
		font-size 0.8rem
		color rgba(17, 17, 17, 0.62)

.device-list
	display flex
	flex-direction column
	gap 0.65rem

.device-item
	display grid
	grid-template-columns auto minmax(0, 1fr) auto auto
	align-items center
	gap 0.75rem
	padding 0.9rem 1rem
	border 1px solid var(--surface-border, #dddddd)
	border-radius 13px
	background var(--card-bg, #f5f5f5)

.device-icon
	display inline-flex
	align-items center
	justify-content center
	width 34px
	height 34px
	border-radius 10px
	background rgba(99, 102, 241, 0.12)
	color #6366f1

	& svg
		width 19px
		height 19px

.device-copy
	min-width 0

	& h4
		margin 0
		font-size 0.86rem
		font-weight 750
		color var(--text-color, #111111)
		word-break break-word

	& p
		margin 0.2rem 0 0
		font-size 0.74rem
		color rgba(17, 17, 17, 0.55)

.device-current
	padding 0.25rem 0.55rem
	border-radius 999px
	background rgba(22, 163, 74, 0.11)
	color #15803d
	font-size 0.7rem
	font-weight 700
	white-space nowrap

.security-action-logout
	text-decoration none

.device-revoke-all
	margin-top 0.8rem
	padding 0.5rem 0.8rem
	border 1px solid rgba(220, 38, 38, 0.35)
	border-radius 9px
	background transparent
	color #dc2626
	font-size 0.78rem
	font-weight 700
	cursor pointer
	transition background-color 0.15s ease, border-color 0.15s ease

	&:hover
		border-color #dc2626
		background rgba(220, 38, 38, 0.08)

.device-note
	margin 0.65rem 0 0
	font-size 0.74rem
	line-height 1.5
	color rgba(17, 17, 17, 0.55)

:global(:root.dark) .security-item
	background var(--card-bg, #212733)

:global(:root.dark) .security-sub,
:global(:root.dark) .security-copy p,
:global(:root.dark) .security-status,
:global(:root.dark) .device-head p,
:global(:root.dark) .device-copy p,
:global(:root.dark) .device-note
	color rgba(232, 235, 241, 0.62)

:global(:root.dark) .device-item
	background var(--card-bg, #212733)

:global(:root.dark) .device-copy h4,
:global(:root.dark) .device-head h3
	color var(--text-color, #e8ebf1)

:global(:root.dark) .device-current
	color #86efac

:global(:root.dark) .totp-instruction,
:global(:root.dark) .device-empty
	color rgba(232, 235, 241, 0.62)

:global(:root.dark) .totp-input
	background var(--page-bg, #191e26)
	color var(--text-color, #e8ebf1)

:global(:root.dark) .security-action
	color #fb923c

	&:hover
		color #fdba74

:global(:root.dark) .security-notice
	color #fdba74

@media (max-width: 620px)
	.security-item
		grid-template-columns auto minmax(0, 1fr)

	.device-item
		grid-template-columns auto minmax(0, 1fr) auto

	.device-current
		grid-column 2
		justify-self start

	.security-action-logout
		grid-column 3
		grid-row 1 / span 2

	.security-meta
		grid-column 2
		justify-content space-between
		width 100%

	.security-status
		order 0

	.security-action
		order 1
</style>
