<script lang="ts">
import { onMount } from "svelte";
import { cubicOut } from "svelte/easing";
import { fade } from "svelte/transition";

let isEnabled = false;
let offsetX = 0;
let offsetY = 0;
let currentDeviceKey = "";
let controlHidden = false;
let dodgeAttempts = 0;
let controlPositionReady = false;
let lanternToastVisible = false;
let lanternToastMessage = "";
let lanternToastTimeout: ReturnType<typeof setTimeout> | null = null;
let lanternToastX = 14;
let lanternToastY = 64;

const MIN_VISIBLE_PIXELS = 32;
const CONTROL_MARGIN_PX = 2;
const LEGACY_CONTROL_MARGIN_PX = 10;
const POSITION_DEFAULT_EPSILON_PX = 2;
const LANTERN_ENABLED_KEY = "lanternEnabled";
const LANTERN_CONTROL_HIDDEN_KEY = "lanternControlHidden";
const LANTERN_DODGE_ATTEMPTS_KEY = "lanternDodgeAttempts";
const LANTERN_POSITION_KEY_PREFIX = "lanternPositionV2";
const MAX_DODGE_ATTEMPTS = 5;
const TOAST_MIN_MARGIN_PX = 8;
const TOAST_GAP_PX = 10;
const TOAST_ESTIMATED_WIDTH = 220;
const TOAST_ESTIMATED_HEIGHT = 42;
const DODGE_TOAST_MESSAGES = [
	"不要点啦",
	"再戳我就躲远一点啦",
	"你再点我就彻底消失啦",
];

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function isLocalStorageAvailable() {
	try {
		return (
			typeof window !== "undefined" &&
			typeof window.localStorage !== "undefined"
		);
	} catch {
		return false;
	}
}

function isMobileDevice() {
	return typeof window !== "undefined" && window.innerWidth <= 768;
}

function getDeviceStorageKey() {
	const deviceKey = isMobileDevice() ? "mobile" : "desktop";
	currentDeviceKey = deviceKey;
	return deviceKey;
}

function getToggleElements() {
	const control = document.querySelector(
		".lantern-control",
	) as HTMLElement | null;
	const toggle = document.querySelector(
		".lantern-toggle-container",
	) as HTMLElement | null;
	return { control, toggle };
}

function getToggleSize() {
	const { toggle } = getToggleElements();
	const rect = toggle?.getBoundingClientRect();
	return {
		width: rect?.width || 140,
		height: rect?.height || 44,
	};
}

function getMovementBounds() {
	if (typeof window === "undefined") {
		return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
	}
	const { width, height } = getToggleSize();
	return {
		minX: -(width - MIN_VISIBLE_PIXELS),
		maxX: window.innerWidth - MIN_VISIBLE_PIXELS,
		minY: -(height - MIN_VISIBLE_PIXELS),
		maxY: window.innerHeight - MIN_VISIBLE_PIXELS,
	};
}

function getDefaultTogglePosition(marginPx = CONTROL_MARGIN_PX) {
	if (typeof window === "undefined") return { x: 0, y: 0 };
	const { width, height } = getToggleSize();
	return {
		x: window.innerWidth - marginPx - width,
		y: window.innerHeight - marginPx - height,
	};
}

function updateLanternToastPosition() {
	if (typeof window === "undefined") return;
	const toastEl = document.querySelector(
		".lantern-toast",
	) as HTMLElement | null;
	const toastWidth = toastEl?.offsetWidth || TOAST_ESTIMATED_WIDTH;
	const toastHeight = toastEl?.offsetHeight || TOAST_ESTIMATED_HEIGHT;
	const minX = TOAST_MIN_MARGIN_PX;
	const maxX = window.innerWidth - toastWidth - TOAST_MIN_MARGIN_PX;
	const minY = TOAST_MIN_MARGIN_PX;
	const maxY = window.innerHeight - toastHeight - TOAST_MIN_MARGIN_PX;

	const setToastPosition = (x: number, y: number) => {
		lanternToastX = Math.round(clamp(x, minX, maxX));
		lanternToastY = Math.round(clamp(y, minY, maxY));
	};

	const { width, height } = getToggleSize();
	const rightTopX = offsetX + width + TOAST_GAP_PX;
	const leftTopX = offsetX - toastWidth - TOAST_GAP_PX;
	const canPlaceRight =
		rightTopX + toastWidth <= window.innerWidth - TOAST_MIN_MARGIN_PX;
	const canPlaceLeft = leftTopX >= TOAST_MIN_MARGIN_PX;
	let x = rightTopX;
	if (!canPlaceRight && canPlaceLeft) {
		x = leftTopX;
	} else if (!canPlaceRight && !canPlaceLeft) {
		x = offsetX + width / 2 - toastWidth / 2;
	}
	const y = offsetY - toastHeight - TOAST_GAP_PX;
	setToastPosition(x, y);
}

function showLanternToast(message: string) {
	lanternToastMessage = message;
	lanternToastVisible = true;
	updateLanternToastPosition();
	requestAnimationFrame(() => {
		updateLanternToastPosition();
	});
	if (lanternToastTimeout) {
		clearTimeout(lanternToastTimeout);
	}
	lanternToastTimeout = setTimeout(() => {
		lanternToastVisible = false;
		lanternToastTimeout = null;
	}, 1300);
}

function saveLanternState() {
	if (!isLocalStorageAvailable()) return;
	localStorage.setItem(LANTERN_ENABLED_KEY, isEnabled.toString());
}

function loadLanternState() {
	if (!isLocalStorageAvailable()) return;
	const savedState = localStorage.getItem(LANTERN_ENABLED_KEY);
	if (savedState !== null) {
		isEnabled = savedState === "true";
		return;
	}
	// 默认关闭
	isEnabled = false;
}

function saveControlState() {
	if (!isLocalStorageAvailable()) return;
	localStorage.setItem(
		LANTERN_CONTROL_HIDDEN_KEY,
		controlHidden ? "true" : "false",
	);
	localStorage.setItem(LANTERN_DODGE_ATTEMPTS_KEY, String(dodgeAttempts));
}

function loadControlState() {
	if (!isLocalStorageAvailable()) return;
	controlHidden = localStorage.getItem(LANTERN_CONTROL_HIDDEN_KEY) === "true";
	const raw = localStorage.getItem(LANTERN_DODGE_ATTEMPTS_KEY);
	const parsed = raw ? Number.parseInt(raw, 10) : 0;
	dodgeAttempts = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function loadLanternPosition() {
	const defaults = getDefaultTogglePosition();
	if (!isLocalStorageAvailable()) {
		offsetX = defaults.x;
		offsetY = defaults.y;
		return;
	}
	const deviceKey = getDeviceStorageKey();
	const savedPosition = localStorage.getItem(
		`${LANTERN_POSITION_KEY_PREFIX}_${deviceKey}`,
	);
	if (savedPosition === null) {
		offsetX = defaults.x;
		offsetY = defaults.y;
		return;
	}
	try {
		const position = JSON.parse(savedPosition);
		const x = Number(position?.x);
		const y = Number(position?.y);
		if (!Number.isFinite(x) || !Number.isFinite(y)) {
			offsetX = defaults.x;
			offsetY = defaults.y;
			return;
		}
		const legacyDefaults = getDefaultTogglePosition(LEGACY_CONTROL_MARGIN_PX);
		const wasLegacyDefault =
			Math.abs(x - legacyDefaults.x) <= POSITION_DEFAULT_EPSILON_PX &&
			Math.abs(y - legacyDefaults.y) <= POSITION_DEFAULT_EPSILON_PX;
		if (wasLegacyDefault) {
			offsetX = defaults.x;
			offsetY = defaults.y;
			return;
		}
		offsetX = x;
		offsetY = y;
	} catch {
		offsetX = defaults.x;
		offsetY = defaults.y;
	}
}

function saveLanternPosition() {
	if (!isLocalStorageAvailable()) return;
	const deviceKey = getDeviceStorageKey();
	localStorage.setItem(
		`${LANTERN_POSITION_KEY_PREFIX}_${deviceKey}`,
		JSON.stringify({ x: offsetX, y: offsetY }),
	);
}

function clampOffsetToViewport() {
	if (typeof window === "undefined") return;
	const { minX, maxX, minY, maxY } = getMovementBounds();
	offsetX = clamp(offsetX, minX, maxX);
	offsetY = clamp(offsetY, minY, maxY);
}

function dodgeToggleFromPoint() {
	if (typeof window === "undefined") return;
	const { minX, maxX, minY, maxY } = getMovementBounds();
	const minJumpDistance = isMobileDevice() ? 180 : 240;
	let targetX = offsetX;
	let targetY = offsetY;

	for (let i = 0; i < 8; i += 1) {
		const candidateX = randomBetween(minX, maxX);
		const candidateY = randomBetween(minY, maxY);
		const jumpDistance = Math.hypot(candidateX - offsetX, candidateY - offsetY);
		targetX = candidateX;
		targetY = candidateY;
		if (jumpDistance >= minJumpDistance) {
			break;
		}
	}

	offsetX = targetX;
	offsetY = targetY;
	clampOffsetToViewport();
	saveLanternPosition();
}

function hideControlPermanently() {
	controlHidden = true;
	isEnabled = false;
	saveLanternState();
	saveControlState();
}

function handleToggleAttempt() {
	if (controlHidden) return;
	dodgeAttempts += 1;
	const message =
		DODGE_TOAST_MESSAGES[(dodgeAttempts - 1) % DODGE_TOAST_MESSAGES.length];

	if (dodgeAttempts >= MAX_DODGE_ATTEMPTS) {
		hideControlPermanently();
		showLanternToast("不陪你玩啦 我先藏好啦");
		return;
	}

	dodgeToggleFromPoint();
	saveControlState();
	showLanternToast(message);
}

function handleToggleMouseDown() {
	handleToggleAttempt();
}

function handleToggleTouchStart() {
	handleToggleAttempt();
}

function handleResize() {
	const newDeviceKey = isMobileDevice() ? "mobile" : "desktop";
	if (newDeviceKey !== currentDeviceKey) {
		currentDeviceKey = newDeviceKey;
		loadLanternPosition();
	}
	clampOffsetToViewport();
	saveLanternPosition();
	if (lanternToastVisible) {
		updateLanternToastPosition();
	}
}

onMount(() => {
	loadLanternState();
	loadControlState();

	if (controlHidden) {
		// 按需求：消失后不恢复，同时灯笼保持关闭
		isEnabled = false;
		saveLanternState();
	}

	currentDeviceKey = getDeviceStorageKey();
	loadLanternPosition();
	clampOffsetToViewport();
	controlPositionReady = true;

	requestAnimationFrame(() => {
		clampOffsetToViewport();
		saveLanternPosition();
	});

	window.addEventListener("resize", handleResize);

	return () => {
		window.removeEventListener("resize", handleResize);
		if (lanternToastTimeout) {
			clearTimeout(lanternToastTimeout);
			lanternToastTimeout = null;
		}
	};
});
</script>

{#if isEnabled}
	<div
		class="lantern-container"
		transition:fade={{ duration: 350, easing: cubicOut }}
	>
		<div class="lantern-item pos-1">
			<div class="lantern-line"></div>
			<div class="lantern-body">
				<div class="lantern-cap cap-top"></div>
				<div class="lantern-body-inner"></div>
				<span class="lantern-text">新</span>
				<div class="lantern-cap cap-bottom"></div>
			</div>
			<div class="lantern-tassel"></div>
		</div>

		<div class="lantern-item pos-2">
			<div class="lantern-line"></div>
			<div class="lantern-body">
				<div class="lantern-cap cap-top"></div>
				<div class="lantern-body-inner"></div>
				<span class="lantern-text">年</span>
				<div class="lantern-cap cap-bottom"></div>
			</div>
			<div class="lantern-tassel"></div>
		</div>

		<div class="lantern-item pos-3">
			<div class="lantern-line"></div>
			<div class="lantern-body">
				<div class="lantern-cap cap-top"></div>
				<div class="lantern-body-inner"></div>
				<span class="lantern-text">快</span>
				<div class="lantern-cap cap-bottom"></div>
			</div>
			<div class="lantern-tassel"></div>
		</div>

		<div class="lantern-item pos-4">
			<div class="lantern-line"></div>
			<div class="lantern-body">
				<div class="lantern-cap cap-top"></div>
				<div class="lantern-body-inner"></div>
				<span class="lantern-text">乐</span>
				<div class="lantern-cap cap-bottom"></div>
			</div>
			<div class="lantern-tassel"></div>
		</div>
	</div>
{/if}

{#if !controlHidden && controlPositionReady}
	<!-- 控制开关 -->
	<div class="lantern-control">
		<div
			class="lantern-toggle-container"
			style={`transform: translate(${offsetX}px, ${offsetY}px);`}
			tabindex="0"
			role="button"
			aria-label="灯笼控制按钮 会躲开点击"
		>
			<button
				type="button"
				class="lantern-toggle"
				on:mousedown|preventDefault|stopPropagation={handleToggleMouseDown}
				on:touchstart|preventDefault|stopPropagation={handleToggleTouchStart}
				aria-label="别点我 我会躲开"
			>
				🏮 灯笼已关
			</button>
		</div>
	</div>
{/if}

{#if lanternToastVisible}
	<div
		class="lantern-toast"
		style={`left: ${lanternToastX}px; top: ${lanternToastY}px;`}
		transition:fade={{ duration: 180, easing: cubicOut }}
	>
		{lanternToastMessage}
	</div>
{/if}

<style lang="css">
	/* 容器定位 */
	.lantern-container {
		position: fixed;
		top: -20px; /* 向上微调，露出挂绳 */
		width: 100%;
		display: flex;
		justify-content: space-between;
		padding: 0 50px;
		box-sizing: border-box;
		z-index: 9999;
		pointer-events: none;
	}

	.lantern-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		animation: swing 3.5s infinite ease-in-out;
		transform-origin: top center;
	}

	/* 顶部吊绳 */
	.lantern-line {
		width: 3px;
		height: 50px;
		background-color: #dc8f03;
	}

	/* 灯笼主体：调整为更圆润的扁椭圆 */
	.lantern-body {
		width: 120px;
		height: 95px;
		background: #d32f2f; /* 更深一点的红 */
		border-radius: 50% / 45%;
		position: relative;
		/* 核心修改：多重阴影实现图片中的红色外发光效果 */
		box-shadow: 0 0 50px 15px rgba(255, 69, 0, 0.4);
		display: flex;
		justify-content: center;
		align-items: center;
		border: 2px solid #ffca28;
	}

	/* 灯笼纵向纹理：改为弧形 */
	.lantern-body::before {
		content: "";
		position: absolute;
		width: 70px;
		height: 100%;
		border-left: 2px solid #ffca28;
		border-right: 2px solid #ffca28;
		border-radius: 50%;
		opacity: 0.5;
	}

	/* 灯笼中间纵向纹理 */
	.lantern-body-inner {
		position: absolute;
		width: 30px;
		height: 100%;
		border-left: 2px solid #ffca28;
		border-right: 2px solid #ffca28;
		border-radius: 50%;
		opacity: 0.5;
	}

	/* 灯笼上下盖子 */
	.lantern-cap {
		width: 50px;
		height: 8px;
		background: #ffca28;
		border-radius: 4px;
		position: absolute;
		z-index: 10;
	}
	.cap-top { top: -4px; }
	.cap-bottom { bottom: -4px; }

	/* 文字样式：优化了字体族和光效 */
	.lantern-text {
		color: #ffca28;
		/* 优先使用华文行楷，其次是楷体，最后是通用的 serif 衬线体 */
		font-family: "STXingkai", "华文行楷", "KaiTi", "楷体", "STKaiti", "华文楷体", serif;
		font-size: 42px; /* 略微调大一点，更有视觉冲击力 */
		font-weight: bold;
		line-height: 1;
		text-align: center;
		/* 金色文字的微弱外发光，模拟灯火照亮文字的效果 */
		text-shadow:
			0 0 10px rgba(255, 202, 40, 0.8),
			1px 1px 3px rgba(0, 0, 0, 0.5);
		z-index: 20;
		user-select: none;
	}

	/* 底部流苏：加长并优化细节 */
	.lantern-tassel {
		width: 6px;
		height: 40px;
		background: #ffca28;
		position: relative;
		margin-top: 5px;
		border-radius: 0 0 3px 3px;
	}

	/* 摇摆动画 */
	@keyframes swing {
		0% { transform: rotate(-5deg); }
		50% { transform: rotate(5deg); }
		100% { transform: rotate(-5deg); }
	}

	/* 个别位置微调 */
	.pos-1 { margin-top: 10px; }
	.pos-2 { margin-top: 40px; }
	.pos-3 { margin-top: 40px; }
	.pos-4 { margin-top: 10px; }
	
	/* 控制开关样式 */
	.lantern-control {
		position: fixed;
		top: 0;
		left: 0;
		z-index: 10000;
		pointer-events: none;
		display: none; /* 隐藏 */
	}
	
	.lantern-toggle-container {
		position: relative;
		pointer-events: auto;
		transition: transform 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
	}

	.lantern-toast {
		position: fixed;
		left: 14px;
		top: 64px;
		z-index: 10001;
		max-width: min(70vw, 18rem);
		padding: 0.55rem 0.75rem;
		border-radius: 0.65rem;
		border: 1px solid rgba(255, 202, 40, 0.85);
		background: rgba(34, 24, 16, 0.92);
		color: #ffe4ad;
		font-size: 0.84rem;
		font-weight: 700;
		line-height: 1.2;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
		pointer-events: none;
		display: none;
	}
	
	.lantern-toggle {
		background-color: rgba(255, 202, 40, 0.9);
		color: #d32f2f;
		border: 2px solid #d32f2f;
		border-radius: 20px;
		padding: 8px 16px;
		font-size: 14px;
		font-weight: bold;
		cursor: pointer;
		transition: all 0.3s ease;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		user-select: none;
	}
	
	.lantern-toggle:hover {
		background-color: rgba(255, 202, 40, 1);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}
	
	.lantern-toggle:active {
		transform: translateY(0);
	}
	
	/* 拖动动画效果 */
	.lantern-toggle-container {
		transition: transform 0.1s ease-out;
	}

	/* Mobile only adjustments */
	@media (max-width: 768px) {
		.lantern-container {
			top: -10px;
			padding: 0 12px;
		}

		.lantern-item {
			animation-duration: 4.5s;
		}

		.lantern-line {
			width: 2px;
			height: 30px;
		}

		.lantern-body {
			width: 72px;
			height: 58px;
			box-shadow: 0 0 24px 8px rgba(255, 69, 0, 0.35);
			border-width: 1px;
		}

		.lantern-body::before {
			width: 40px;
			border-left-width: 1px;
			border-right-width: 1px;
		}

		.lantern-body-inner {
			width: 18px;
			border-left-width: 1px;
			border-right-width: 1px;
		}

		.lantern-cap {
			width: 34px;
			height: 6px;
			border-radius: 3px;
		}

		.lantern-text {
			font-size: 24px;
			text-shadow:
				0 0 6px rgba(255, 202, 40, 0.7),
				1px 1px 2px rgba(0, 0, 0, 0.45);
		}

		.lantern-tassel {
			width: 4px;
			height: 24px;
			margin-top: 4px;
		}

		.pos-2,
		.pos-3 {
			display: none;
		}

		.lantern-control {
			top: 0;
			left: 0;
		}

		.lantern-toggle {
			padding: 10px 18px;
			font-size: 14px;
			border-radius: 20px;
		}

		.lantern-toast {
			max-width: min(80vw, 16rem);
			font-size: 0.8rem;
		}
	}
</style>
