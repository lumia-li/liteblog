<script lang="ts">
	/**
	 * 用户身份徽章。
	 * 数据由后端授予（dbviewer 后台），通过 /api/auth/me 返回。
	 * tone 决定皮肤：admin / vip / mod / friend / normal / test / ban
	 */
	export let tone = "";
	export let text = "";
	export let size: "sm" | "md" = "md";
</script>

{#if tone && text}
	<span class="ubadge" data-tone={tone} data-size={size} title={text}>{text}</span>
{/if}

<style lang="stylus">
.ubadge
	display inline-flex
	align-items center
	padding 1px 9px
	border-radius 999px
	font-size 0.72rem
	font-weight 600
	line-height 1.7
	white-space nowrap
	vertical-align middle
	border 1.5px solid transparent
	background rgba(127, 127, 127, 0.12)
	color var(--capsule-text, #1d2838)
	flex-shrink 0

.ubadge[data-size="sm"]
	font-size 0.68rem
	padding 0 7px

/* 管理员：紫青渐变描边 + 双层发光（与后台一致） */
.ubadge[data-tone="admin"]
	color #a78bfa
	border-color transparent
	background linear-gradient(var(--capsule-menu-bg, rgba(255,255,255,0.96)), var(--capsule-menu-bg, rgba(255,255,255,0.96))) padding-box, linear-gradient(120deg, #a855f7, #7c3aed 35%, #22d3ee 75%, #34d399) border-box
	box-shadow 0 0 0 1px rgba(168, 85, 247, 0.28), 0 0 14px rgba(139, 92, 246, 0.35), 0 0 22px rgba(34, 211, 238, 0.18)

.ubadge[data-tone="vip"]
	color #d97706
	border-color rgba(217, 119, 6, 0.55)
	background rgba(245, 158, 11, 0.14)
	box-shadow 0 0 10px rgba(245, 158, 11, 0.26)

.ubadge[data-tone="mod"]
	color #0891b2
	border-color rgba(8, 145, 178, 0.5)
	background rgba(8, 145, 178, 0.13)

.ubadge[data-tone="friend"]
	color #db2777
	border-color rgba(219, 39, 119, 0.5)
	background rgba(219, 39, 119, 0.13)

.ubadge[data-tone="normal"]
	color var(--capsule-muted, #6b7686)
	border-color var(--capsule-border, rgba(205, 213, 224, 0.95))
	background transparent

.ubadge[data-tone="test"]
	color #ca8a04
	border-color rgba(202, 138, 4, 0.5)
	background rgba(234, 179, 8, 0.16)

.ubadge[data-tone="ban"]
	color #dc2626
	border-color rgba(220, 38, 38, 0.5)
	background rgba(220, 38, 38, 0.13)

/* 站点保留身份（liyue / Airliny）：彩虹渐变描边 + 流动光，与个人资料页一致 */
.ubadge[data-tone="reserved"]
	color #7c3aed
	border-color transparent
	background linear-gradient(var(--capsule-menu-bg, rgba(255,255,255,0.96)), var(--capsule-menu-bg, rgba(255,255,255,0.96))) padding-box, linear-gradient(90deg, #00ff87, #60efff, #0061ff, #ea00ff, #ff1b6b, #00ff87) border-box
	background-size auto, 200% 100%
	animation ub-rainbow 4s linear infinite
	box-shadow 0 0 0 1px rgba(168, 85, 247, 0.18), 0 0 12px rgba(139, 92, 246, 0.3)

@keyframes ub-rainbow
	0%
		background-position 0 0, 0% 0%
	100%
		background-position 0 0, 200% 0%

/* 暗色主题微调：提高文字亮度保证可读 */
:global([data-theme="dark"]) .ubadge[data-tone="reserved"]
	color #c4b5fd

:global([data-theme="dark"]) .ubadge[data-tone="vip"]
	color #fbbf24

:global([data-theme="dark"]) .ubadge[data-tone="mod"]
	color #22d3ee

:global([data-theme="dark"]) .ubadge[data-tone="friend"]
	color #f472b6

:global([data-theme="dark"]) .ubadge[data-tone="test"]
	color #facc15

:global([data-theme="dark"]) .ubadge[data-tone="ban"]
	color #f87171

:global([data-theme="dark"]) .ubadge[data-tone="admin"]
	color #c4b5fd
</style>
