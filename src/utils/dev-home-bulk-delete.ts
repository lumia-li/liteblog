export const DEV_HOME_BULK_DELETE_STATE_EVENT = "dev-home-bulk-delete-state";

export type DevHomeBulkDeleteState = {
	selectionMode: boolean;
	selectedIds: string[];
};

declare global {
	interface Window {
		__devHomeBulkDeleteState?: DevHomeBulkDeleteState;
	}
}

function canUseWindow(): boolean {
	return typeof window !== "undefined";
}

function getDefaultState(): DevHomeBulkDeleteState {
	return {
		selectionMode: false,
		selectedIds: [],
	};
}

function dedupeIds(ids: string[]): string[] {
	return Array.from(new Set(ids.filter(Boolean)));
}

function getInternalState(): DevHomeBulkDeleteState {
	if (!canUseWindow()) {
		return getDefaultState();
	}
	if (!window.__devHomeBulkDeleteState) {
		window.__devHomeBulkDeleteState = getDefaultState();
	}
	return window.__devHomeBulkDeleteState;
}

function setInternalState(next: DevHomeBulkDeleteState): void {
	if (!canUseWindow()) return;
	window.__devHomeBulkDeleteState = {
		selectionMode: next.selectionMode,
		selectedIds: dedupeIds(next.selectedIds),
	};
	window.dispatchEvent(
		new CustomEvent(DEV_HOME_BULK_DELETE_STATE_EVENT, {
			detail: window.__devHomeBulkDeleteState,
		}),
	);
}

export function getDevHomeBulkDeleteState(): DevHomeBulkDeleteState {
	const state = getInternalState();
	return {
		selectionMode: state.selectionMode,
		selectedIds: [...state.selectedIds],
	};
}

export function setDevHomeBulkDeleteSelectionMode(enabled: boolean): void {
	const current = getInternalState();
	setInternalState({
		selectionMode: enabled,
		selectedIds: enabled ? current.selectedIds : [],
	});
}

export function replaceDevHomeBulkDeleteSelectedIds(ids: string[]): void {
	const current = getInternalState();
	setInternalState({
		selectionMode: current.selectionMode,
		selectedIds: ids,
	});
}

export function clearDevHomeBulkDeleteSelection(): void {
	const current = getInternalState();
	setInternalState({
		selectionMode: current.selectionMode,
		selectedIds: [],
	});
}

export function toggleDevHomeBulkDeleteId(id: string): void {
	const current = getInternalState();
	const selectedIds = current.selectedIds.includes(id)
		? current.selectedIds.filter((item) => item !== id)
		: [...current.selectedIds, id];
	setInternalState({
		selectionMode: current.selectionMode,
		selectedIds,
	});
}

export function filterDevHomeBulkDeleteSelectedIds(validIds: string[]): void {
	const validSet = new Set(validIds);
	const current = getInternalState();
	setInternalState({
		selectionMode: current.selectionMode,
		selectedIds: current.selectedIds.filter((id) => validSet.has(id)),
	});
}

export function subscribeDevHomeBulkDeleteState(
	callback: (state: DevHomeBulkDeleteState) => void,
): () => void {
	if (!canUseWindow()) {
		callback(getDefaultState());
		return () => {};
	}

	const handler = (event: Event) => {
		const customEvent = event as CustomEvent<DevHomeBulkDeleteState>;
		callback(
			customEvent.detail || {
				selectionMode: false,
				selectedIds: [],
			},
		);
	};

	callback(getDevHomeBulkDeleteState());
	window.addEventListener(
		DEV_HOME_BULK_DELETE_STATE_EVENT,
		handler as EventListener,
	);

	return () => {
		window.removeEventListener(
			DEV_HOME_BULK_DELETE_STATE_EVENT,
			handler as EventListener,
		);
	};
}
