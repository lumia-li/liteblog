<script lang="ts">
import { onMount } from "svelte";
import { fade } from "svelte/transition";

type User = {
	id: number;
	username: string;
	email: string;
	display_name: string;
	avatar_url: string;
	role: "admin" | "user";
};

let user: User | null = null;
let loading = true;
let open = false;
let menuElement: HTMLDivElement | null = null;
let buttonElement: HTMLButtonElement | null = null;

async function fetchUser() {
	try {
		const response = await fetch("/api/auth/me", { cache: "no-store" });
		if (!response.ok) {
			user = null;
			return;
		}
		const data = await response.json();
		user = data.user as User;
	} catch {
		user = null;
	} finally {
		loading = false;
	}
}

function toggleMenu() {
	open = !open;
}

function closeMenu() {
	open = false;
}

function handleWindowClick(event: MouseEvent) {
	const target = event.target as Node;
	if (
		open &&
		menuElement &&
		buttonElement &&
		!menuElement.contains(target) &&
		!buttonElement.contains(target)
	) {
		closeMenu();
	}
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") closeMenu();
}

onMount(() => {
	void fetchUser();

	const host = window as unknown as {
		__userMenuSwupHooked?: boolean;
	};

	const hook = () => {
		void fetchUser();
		closeMenu();
	};

	if (window.swup?.hooks && !host.__userMenuSwupHooked) {
		host.__userMenuSwupHooked = true;
		window.swup.hooks.on("page:view", hook);
	}

	return () => {
		if (window.swup?.hooks && host.__userMenuSwupHooked) {
			window.swup.hooks.off("page:view", hook);
			host.__userMenuSwupHooked = false;
		}
	};
});
</script>

<svelte:window on:click={handleWindowClick} on:keydown={handleKeydown} />

<div class="user-menu">
	{#if loading}
		<div class="user-menu-loading" aria-hidden="true">
			<div class="user-avatar-placeholder"></div>
		</div>
	{:else if user}
		<button
			bind:this={buttonElement}
			type="button"
			class="user-menu-button"
			aria-haspopup="true"
			aria-expanded={open}
			on:click={toggleMenu}
		>
			{#if user.avatar_url}
				<img src={user.avatar_url} alt={user.display_name || user.username} class="user-avatar" />
			{:else}
				<div class="user-avatar user-avatar-fallback">
					{(user.display_name || user.username).charAt(0).toUpperCase()}
				</div>
			{/if}
			<span class="user-name">{user.display_name || user.username}</span>
			<svg class="user-menu-chevron" class:open viewBox="0 0 24 24" aria-hidden="true">
				<path d="M7 10l5 5 5-5H7z" fill="currentColor" />
			</svg>
		</button>
		{#if open}
			<div
				bind:this={menuElement}
				class="user-dropdown user-dropdown-loggedin"
				role="menu"
				transition:fade={{ duration: 120 }}
			>
				<a href="/profile" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/></svg>
					个人资料
				</a>
				<a href="/api/auth/logout" class="user-dropdown-item user-dropdown-danger" role="menuitem" on:click={closeMenu}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="currentColor"/></svg>
					退出登录
				</a>
			</div>
		{/if}
	{:else}
		<button
			bind:this={buttonElement}
			type="button"
			class="user-menu-button user-menu-button-login"
			aria-haspopup="true"
			aria-expanded={open}
			on:click={toggleMenu}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
			</svg>
			<span class="user-name">登录</span>
			<svg class="user-menu-chevron" class:open viewBox="0 0 24 24" aria-hidden="true">
				<path d="M7 10l5 5 5-5H7z" fill="currentColor" />
			</svg>
		</button>
		{#if open}
			<div
				bind:this={menuElement}
				class="user-dropdown user-dropdown-login"
				role="menu"
				transition:fade={{ duration: 120 }}
			>
				<a href="/api/auth/login" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z" fill="currentColor"/></svg>
					使用 Airliny 登录
				</a>
				<a href="/api/auth/qq-login" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512" aria-hidden="true" width="18" height="18">
						<path fill="#12B7F5" d="M433.754 420.445c-11.526 1.393-44.86-52.741-44.86-52.741 0 31.345-16.136 72.247-51.051 101.786 16.842 5.192 54.843 19.167 45.803 34.421-7.316 12.343-125.51 7.881-159.632 4.037-34.122 3.844-152.316 8.306-159.632-4.037-9.045-15.25 28.918-29.214 45.783-34.415-34.92-29.539-51.059-70.445-51.059-101.792 0 0-33.334 54.134-44.859 52.741-5.37-.65-12.424-29.644 9.347-99.704 10.261-33.024 21.995-60.478 40.144-105.779C60.683 98.063 108.982.006 224 0c113.737.006 163.156 96.133 160.264 214.963 18.118 45.223 29.912 72.85 40.144 105.778 21.768 70.06 14.716 99.053 9.346 99.704z"/>
					</svg>
					使用 QQ 登录
				</a>
			<a href="/api/auth/google-login" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
				使用 Google 登录
			</a>
			<a href="/api/auth/github-login" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" fill="currentColor"/></svg>
				使用 GitHub 登录
			</a>
			<a href="/api/auth/microsoft-login" class="user-dropdown-item" role="menuitem" on:click={closeMenu}>
				<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 2h9v9H2z" fill="#F25022"/><path d="M13 2h9v9h-9z" fill="#7FBA00"/><path d="M2 13h9v9H2z" fill="#00A4EF"/><path d="M13 13h9v9h-9z" fill="#FFB900"/></svg>
				使用 Microsoft 登录
			</a>
		</div>
		{/if}
	{/if}
</div>

<style lang="stylus">
.user-menu
	position relative
	display inline-flex
	align-items center

.user-menu-button,
.user-login-button
	display inline-flex
	align-items center
	gap 0.35rem
	height 36px
	padding 0 0.45rem 0 0.3rem
	border-radius 999px
	border none
	background var(--capsule-bg, rgba(255, 255, 255, 0.76))
	color var(--capsule-text, #1d2838)
	font-size 0.82rem
	font-weight 600
	cursor pointer
	transition background-color 0.2s ease, transform 0.15s ease
	backdrop-filter blur(12px)

.user-menu-button:hover,
.user-login-button:hover
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.08))

.user-menu-button:active
	transform scale(0.96)

.user-menu-button-login
	min-width max-content
	padding 0 0.75rem 0 0.45rem

.user-menu-button-login .user-name
	flex-shrink 0

.user-menu-button-login svg:not(.user-menu-chevron)
	width 18px
	height 18px
	flex-shrink 0

.user-login-button
	text-decoration none

.user-login-button svg
	width 18px
	height 18px

.user-avatar,
.user-avatar-placeholder
	width 28px
	height 28px
	border-radius 999px
	object-fit cover
	background var(--btn-regular-bg, #f7f7f7)
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))

.user-avatar-fallback
	display inline-flex
	align-items center
	justify-content center
	font-size 0.85rem
	font-weight 700

.user-name
	max-width 96px
	overflow hidden
	text-overflow ellipsis
	white-space nowrap

.user-menu-chevron
	width 16px
	height 16px
	transition transform 0.2s ease

.user-menu-chevron.open
	transform rotate(180deg)

.user-dropdown
	position absolute
	top calc(100% + 8px)
	right 0
	width min(86vw, 160px)
	padding 6px
	border-radius 14px
	border 1px solid var(--capsule-menu-border, rgba(214, 222, 233, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.96))
	box-shadow 0 14px 28px rgba(2, 6, 23, 0.28)
	display flex
	flex-direction column
	gap 2px
	z-index 100

.user-dropdown-login,
.user-dropdown-loggedin
	width max-content
	min-width 120px

.user-dropdown-item
	display inline-flex
	align-items center
	gap 10px
	padding 7px 10px
	border-radius 10px
	color var(--capsule-text, #1d2838)
	font-size 0.84rem
	font-weight 600
	text-decoration none
	cursor pointer
	transition background-color 0.15s ease, transform 0.15s ease

.user-dropdown-item:hover
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.08))

.user-dropdown-item:active
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.14))
	transform scale(0.97)

.user-dropdown-item svg
	width 18px
	height 18px
	flex-shrink 0

.user-dropdown-danger
	color #dc2626

.user-dropdown-danger:hover
	background rgba(220, 38, 38, 0.08)

.user-menu-loading
	width 40px
	height 40px
	display flex
	align-items center
	justify-content center

@media (max-width: 768px)
	.user-name
		max-width 72px
		font-size 0.84rem

	.user-menu-button,
	.user-login-button
		height 36px
		padding 0 0.5rem 0 0.3rem
		font-size 0.84rem

	.user-avatar,
	.user-avatar-placeholder
		width 24px
		height 24px

	.user-menu-chevron
		width 14px
		height 14px
</style>
