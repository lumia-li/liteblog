<script lang="ts">
import { onMount } from "svelte";
import { cubicOut } from "svelte/easing";
import { fade, scale } from "svelte/transition";

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
				class="user-dropdown"
				role="menu"
				transition:fade={{ duration: 120 }}
			>
				<div class="user-dropdown-header" transition:scale={{ duration: 160, easing: cubicOut, start: 0.96 }}>
					<p class="user-dropdown-name">{user.display_name || user.username}</p>
				</div>
				<div class="user-dropdown-divider"></div>
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
		<a href="/api/auth/login" class="user-login-button">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
			</svg>
			登录
		</a>
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
	gap 0.5rem
	height 40px
	padding 0 0.6rem 0 0.35rem
	border-radius 999px
	border 1px solid var(--capsule-border, rgba(205, 213, 224, 0.95))
	background var(--capsule-bg, rgba(255, 255, 255, 0.76))
	color var(--capsule-text, #1d2838)
	font-size 0.9rem
	font-weight 600
	cursor pointer
	transition background-color 0.2s ease, transform 0.15s ease
	backdrop-filter blur(12px)

.user-menu-button:hover,
.user-login-button:hover
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.08))

.user-menu-button:active
	transform scale(0.96)

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
	width min(86vw, 240px)
	padding 10px
	border-radius 14px
	border 1px solid var(--capsule-menu-border, rgba(214, 222, 233, 0.95))
	background var(--capsule-menu-bg, rgba(255, 255, 255, 0.96))
	box-shadow 0 14px 28px rgba(2, 6, 23, 0.28)
	display flex
	flex-direction column
	gap 6px
	z-index 100

.user-dropdown-header
	padding 8px 10px

.user-dropdown-name
	margin 0
	font-size 0.96rem
	font-weight 700
	color var(--capsule-text, #1d2838)

.user-dropdown-divider
	height 1px
	background unquote("color-mix(in oklab, var(--capsule-text, #1d2838) 12%, transparent)")

.user-dropdown-item
	display inline-flex
	align-items center
	gap 10px
	padding 9px 10px
	border-radius 10px
	color var(--capsule-text, #1d2838)
	font-size 0.88rem
	font-weight 600
	text-decoration none
	transition background-color 0.15s ease

.user-dropdown-item:hover
	background var(--capsule-btn-hover, rgba(28, 39, 56, 0.08))

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
