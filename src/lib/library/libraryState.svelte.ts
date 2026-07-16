import { env } from '$env/dynamic/public';
import { adminState } from '$lib/admin/state.svelte';
import { createLibraryClient, AuthError, OfflineError, ApiError } from './api';
import { defaultControls, toQuery, computeQueryKey, controlsChanged } from './libraryLogic';
import type { LibraryControls } from './libraryLogic';
import {
	LRU_CAP,
	LOOKAHEAD,
	windowBounds,
	windowsForRange,
	evictWindows,
	resolveAnchorIndex
} from './windowLogic';
import type { DocListItem, LibraryDoc, Facets, AnchorOffsetParams } from './types';

const baseUrl = env.PUBLIC_LIBRARY_API_URL || 'https://library-api.cwcorella.com';
const client = createLibraryClient({ baseUrl, getToken: () => adminState.libraryToken });

type Status = 'idle' | 'loading' | 'ready' | 'offline' | 'auth' | 'error';
type OpenDocStatus = 'idle' | 'loading' | 'error';

let _controls = $state<LibraryControls>(defaultControls());
let _facets = $state<Facets | null>(null);
let _status = $state<Status>('idle');
let _errorDetail = $state('');
let _openDoc = $state<LibraryDoc | null>(null);
let _openDocStatus = $state<OpenDocStatus>('idle');

let _total = $state<number | null>(null);
let _version = $state(0); // bumped whenever the row cache changes
let _queryKey = $state(computeQueryKey(defaultControls()));

// Non-reactive stores; reactivity is carried by _version + _total.
const _rowCache = new Map<number, DocListItem>();
const _loadedWindows = new Set<number>();
const _inflightWindows = new Set<number>();
let _activeWindows: number[] = [];

// Request-epoch guard: a window response from a superseded query is discarded,
// so two orderings never mix (the reliability contract).
let _queryEpoch = 0;
let _docEpoch = 0;

// Debounced range coalescing for scroll.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingRange: { start: number; end: number } | null = null;

function _mapError(e: unknown) {
	if (e instanceof OfflineError) {
		_status = 'offline';
	} else if (e instanceof AuthError) {
		_status = 'auth';
	} else {
		_status = 'error';
		_errorDetail = e instanceof ApiError ? (e.detail ?? e.message) : String(e);
	}
}

function _resetData() {
	_rowCache.clear();
	_loadedWindows.clear();
	_inflightWindows.clear();
	_activeWindows = [];
	_total = null;
	_version++;
}

function _appliedFilters(): Partial<AnchorOffsetParams> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(_controls.filters)) {
		if (v !== undefined && v !== '') out[k] = v;
	}
	return out as Partial<AnchorOffsetParams>;
}

function _evict() {
	for (const k of evictWindows(_loadedWindows, _activeWindows, LRU_CAP)) {
		_loadedWindows.delete(k);
		const { offset, limit } = windowBounds(k);
		for (let i = 0; i < limit; i++) _rowCache.delete(offset + i);
	}
}

async function _fetchWindow(key: number, epoch: number) {
	if (_loadedWindows.has(key) || _inflightWindows.has(key)) return;
	_inflightWindows.add(key);
	const { offset, limit } = windowBounds(key);
	try {
		const resp = await client.listDocuments(toQuery(_controls, offset, limit));
		if (epoch !== _queryEpoch) return; // superseded — discard
		_total = resp.total;
		for (let i = 0; i < resp.items.length; i++) {
			_rowCache.set(offset + i, resp.items[i]);
		}
		_loadedWindows.add(key);
		_status = 'ready';
		_evict();
		_version++;
	} catch (e) {
		if (epoch !== _queryEpoch) return;
		_mapError(e);
	} finally {
		_inflightWindows.delete(key);
	}
}

function _runEnsure(start: number, end: number) {
	const keys = windowsForRange(start, end, LOOKAHEAD);
	_activeWindows = keys;
	const epoch = _queryEpoch;
	for (const k of keys) void _fetchWindow(k, epoch);
}

async function _newQuery() {
	_queryEpoch++;
	_resetData();
	_activeWindows = [0];
	await _fetchWindow(0, _queryEpoch);
}

export const libraryState = {
	get controls() { return _controls; },
	get facets() { return _facets; },
	get status() { return _status; },
	get errorDetail() { return _errorDetail; },
	get total() { return _total; },
	get queryKey() { return _queryKey; },
	get openDoc() { return _openDoc; },
	get openDocStatus() { return _openDocStatus; },

	rowAt(index: number): DocListItem | undefined {
		void _version; // subscribe: re-reads when the cache changes
		return _rowCache.get(index);
	},

	async init() {
		if (_status !== 'idle') return;
		_status = 'loading';
		await Promise.all([_newQuery(), this.loadFacets()]);
	},

	async loadFacets() {
		try {
			_facets = await client.getFacets();
		} catch (e) {
			_mapError(e);
		}
	},

	applyControls(patch: Partial<LibraryControls>) {
		const prev = _controls;
		const next = { ...prev, ...patch };
		_controls = next;
		if (controlsChanged(prev, next)) {
			_queryKey = computeQueryKey(next);
			void _newQuery();
		}
	},

	ensureWindowsForRange(start: number, end: number) {
		_pendingRange = { start, end };
		if (_debounceTimer) return;
		_debounceTimer = setTimeout(() => {
			_debounceTimer = null;
			const r = _pendingRange;
			_pendingRange = null;
			if (r) _runEnsure(r.start, r.end);
		}, 80);
	},

	async jumpToAnchor(seek: string | null): Promise<number> {
		const total = _total ?? 0;
		const shortcut = resolveAnchorIndex(seek, _controls.dir, total);
		if (shortcut !== null) return shortcut;
		try {
			const params: AnchorOffsetParams = {
				sort: _controls.sort,
				dir: _controls.dir,
				value: seek as string,
				..._appliedFilters()
			};
			if (_controls.q !== '') params.q = _controls.q;
			const { offset } = await client.getAnchorOffset(params);
			return Math.min(offset, Math.max(0, total - 1));
		} catch (e) {
			_mapError(e);
			return 0;
		}
	},

	async openDocById(id: number | string) {
		const epoch = ++_docEpoch;
		_openDocStatus = 'loading';
		try {
			const doc = await client.getDocument(id);
			if (epoch !== _docEpoch) return;
			_openDoc = doc;
			_openDocStatus = 'idle';
		} catch {
			if (epoch !== _docEpoch) return;
			_openDocStatus = 'error';
		}
	},

	closeDoc() {
		_docEpoch++;
		_openDoc = null;
		_openDocStatus = 'idle';
	}
};
