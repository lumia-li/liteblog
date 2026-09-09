<script lang="ts">
import { fade, scale } from "svelte/transition";

export let src = ""; // 待裁剪图片（data URL）
export let onConfirm:
	| ((rect: { left: number; top: number; size: number }) => void)
	| null = null;
export let onCancel: (() => void) | null = null;

/* ── 视口 / 裁剪框几何 ── */
const MASK_RATIO = 0.86; // 裁剪框占视口比例
const MAX_ZOOM = 4;

let viewSize = 320; // 预览视口实际渲染边长（bind:clientWidth 测量）
let naturalW = 0;
let naturalH = 0;
let fitW = 0; // 图片按 contain 缩放后的基准尺寸（zoom=1）
let fitH = 0;
let maskSide = 275;
let maskOffset = 22;
let minZoom = 1;
let zoom = 1;
let tx = 0;
let ty = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

/** 保证图片始终完全覆盖裁剪框 */
function clampPan() {
	if (!fitW || !fitH) return;
	const dispW = fitW * zoom;
	const dispH = fitH * zoom;
	// dispLeft = viewSize/2 + tx - dispW/2（transform-origin 为中心）
	tx = clamp(
		tx,
		maskOffset + maskSide - (viewSize / 2 - dispW / 2 + dispW),
		maskOffset - (viewSize / 2 - dispW / 2),
	);
	ty = clamp(
		ty,
		maskOffset + maskSide - (viewSize / 2 - dispH / 2 + dispH),
		maskOffset - (viewSize / 2 - dispH / 2),
	);
}

// 图片加载完成或视口尺寸变化时重算布局（Svelte 5 响应式代码块）
$: if (naturalW && naturalH && viewSize) {
	const s = Math.min(viewSize / naturalW, viewSize / naturalH);
	fitW = naturalW * s;
	fitH = naturalH * s;
	maskSide = Math.round(viewSize * MASK_RATIO);
	maskOffset = Math.round((viewSize - maskSide) / 2);
	// 至少放大到图片完全覆盖裁剪框
	minZoom = clamp(maskSide / Math.min(fitW, fitH), 1, MAX_ZOOM);
	zoom = clamp(zoom, minZoom, MAX_ZOOM);
	clampPan();
}

/* ── 拖动定位（Pointer Events，兼容鼠标 / 触屏） ── */
function handlePointerDown(event: PointerEvent) {
	dragging = true;
	lastX = event.clientX;
	lastY = event.clientY;
	(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
	if (!dragging) return;
	tx += event.clientX - lastX;
	ty += event.clientY - lastY;
	lastX = event.clientX;
	lastY = event.clientY;
	clampPan();
}

function handlePointerEnd() {
	dragging = false;
}

function handleWheel(event: WheelEvent) {
	zoom = clamp(zoom * (1 - event.deltaY * 0.0012), minZoom, MAX_ZOOM);
	clampPan();
}

function handleZoomInput(event: Event) {
	zoom = Number((event.currentTarget as HTMLInputElement).value);
	clampPan();
}

/* ── 确认：换算为原图自然坐标 ── */
function confirm() {
	if (!naturalW || !naturalH) return;
	const dispW = fitW * zoom;
	const dispLeft = viewSize / 2 + tx - dispW / 2;
	const dispTop = viewSize / 2 + ty - (fitH * zoom) / 2;
	const ratio = naturalW / dispW;
	const size = Math.min(maskSide * ratio, naturalW, naturalH);
	const rect = {
		left: Math.round(clamp((maskOffset - dispLeft) * ratio, 0, naturalW - size)),
		top: Math.round(clamp((maskOffset - dispTop) * ratio, 0, naturalH - size)),
		size: Math.round(size),
	};
	onConfirm?.(rect);
}

function cancel() {
	onCancel?.();
}

function handleKeydown(event: KeyboardEvent) {
	if (event.key === "Escape") cancel();
}

/**
 * Portal：移到 body 下，避免祖先的 backdrop-filter / overflow 影响 fixed 定位。
 */
function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		},
	};
}
</script>

<svelte:window on:keydown={handleKeydown} />

{#if src}
	<div
		class="crop-overlay"
		use:portal
		transition:fade={{ duration: 150 }}
		role="presentation"
	>
		<div
			class="crop-card"
			role="dialog"
			aria-modal="true"
			aria-label="调整头像裁剪位置"
			transition:scale={{ duration: 180, start: 0.95 }}
		>
			<header class="crop-header">
				<h3 class="crop-title">调整头像位置</h3>
				<button type="button" class="crop-close" on:click={cancel} aria-label="关闭">
					<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
				</button>
			</header>

			<div
				class="crop-viewport"
				bind:clientWidth={viewSize}
				style="height:{viewSize}px;"
				on:pointerdown={handlePointerDown}
				on:pointermove={handlePointerMove}
				on:pointerup={handlePointerEnd}
				on:pointercancel={handlePointerEnd}
				on:wheel|preventDefault={handleWheel}
				role="application"
				aria-label="拖动图片调整位置，滚轮缩放"
			>
				<img
					{src}
					alt=""
					class="crop-image"
					draggable="false"
					bind:naturalWidth={naturalW}
					bind:naturalHeight={naturalH}
					style="left:{(viewSize - fitW) / 2}px; top:{(viewSize - fitH) / 2}px; width:{fitW}px; height:{fitH}px; transform: translate({tx}px, {ty}px) scale({zoom});"
				/>
				<!-- 圆形参考线 + 暗角遮罩（box-shadow 撑满视口） -->
				<div
					class="crop-mask"
					style="left:{maskOffset}px; top:{maskOffset}px; width:{maskSide}px; height:{maskSide}px;"
					aria-hidden="true"
				></div>
			</div>

			<div class="crop-zoom-row">
				<span class="crop-zoom-label">缩小</span>
				<input
					type="range"
					class="crop-zoom-slider"
					min={minZoom}
					max={MAX_ZOOM}
					step="0.01"
					value={zoom}
					on:input={handleZoomInput}
					aria-label="缩放"
				/>
				<span class="crop-zoom-label">放大</span>
			</div>

			<p class="crop-hint">拖动图片调整位置，滚轮或滑块调整大小；方框内即最终头像（展示为圆形）</p>

			<footer class="crop-actions">
				<button type="button" class="crop-btn crop-btn-ghost" on:click={cancel}>取消</button>
				<button type="button" class="crop-btn crop-btn-primary" on:click={confirm}>
					确认上传
				</button>
			</footer>
		</div>
	</div>
{/if}

<style lang="stylus">
.crop-overlay
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

.crop-card
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

.crop-header
	display flex
	align-items center
	justify-content space-between

.crop-title
	margin 0
	font-size 1.05rem
	font-weight 700
	color #1d2838

.crop-close
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

/* 预览视口：图片在其下拖动 / 缩放，裁剪框固定居中 */
.crop-viewport
	position relative
	width 100%
	overflow hidden
	border-radius 14px
	background #eceef2
	cursor grab
	touch-action none
	user-select none
	-webkit-user-select none

	&:active
		cursor grabbing

.crop-image
	position absolute
	max-width none
	transform-origin center
	-webkit-user-drag none
	pointer-events none

.crop-mask
	position absolute
	border-radius 50%
	border 2px solid rgba(255, 255, 255, 0.95)
	box-shadow 0 0 0 9999px rgba(15, 20, 30, 0.55)
	pointer-events none

.crop-zoom-row
	display flex
	align-items center
	gap 0.6rem

.crop-zoom-label
	flex-shrink 0
	font-size 0.72rem
	font-weight 600
	color #9ca3af

.crop-zoom-slider
	flex 1
	accent-color #f97316
	cursor pointer

.crop-hint
	margin 0
	font-size 0.76rem
	line-height 1.6
	color #9ca3af

.crop-actions
	display flex
	justify-content flex-end
	gap 0.6rem

.crop-btn
	padding 0.55rem 1.2rem
	border-radius 12px
	border none
	font-size 0.88rem
	font-weight 700
	cursor pointer
	transition transform 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease, color 0.15s ease

	&:active
		transform scale(0.97)

.crop-btn-ghost
	border 1.5px solid #e2e5ea
	background transparent
	color #4b5563

	&:hover
		border-color #f97316
		color #f97316

.crop-btn-primary
	background linear-gradient(135deg, #ea6c0a, #f97316)
	color #ffffff
	box-shadow 0 8px 20px rgba(249, 115, 22, 0.32)

	&:hover
		box-shadow 0 12px 26px rgba(249, 115, 22, 0.4)

/* ── 深色模式 ── */
:global(.dark) .crop-card
	border-color rgba(63, 70, 84, 0.85)
	background #191e26

:global(.dark) .crop-title
	color #e8ebf1

:global(.dark) .crop-close
	background rgba(255, 255, 255, 0.07)
	color #9aa2b1

	&:hover
		background rgba(255, 255, 255, 0.13)
		color #d6dae2

:global(.dark) .crop-viewport
	background #1d2330

:global(.dark) .crop-btn-ghost
	border-color #4b5563
	color #e2e5ea

	&:hover
		border-color #fb923c
		color #fb923c
</style>
