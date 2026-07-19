import { env } from '$env/dynamic/public';
import { adminState } from '$lib/admin/state.svelte';
import { toast } from '$lib/admin/toast.svelte';
import { createLibraryClient, AuthError, OfflineError, ApiError } from './api';
import {
	defaultControls,
	toQuery,
	computeQueryKey,
	controlsChanged,
	filtersToParams
} from './libraryLogic';
import type { LibraryControls } from './libraryLogic';
import {
	LRU_CAP,
	LOOKAHEAD,
	windowBounds,
	windowsForRange,
	evictWindows,
	resolveAnchorIndex
} from './windowLogic';
import { toggleDecision, clampIndex } from './curationLogic';
import { draftToPayload, computeCounts } from './editLogic';
import type { EditDraft } from './editLogic';
import type {
	DocListItem,
	LibraryDoc,
	Facets,
	AnchorOffsetParams,
	Decision,
	CurationStats,
	DocVersion
} from './types';

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
let _openIndex = $state<number | null>(null);
let _curationStats = $state<CurationStats | null>(null);
let _editMode = $state(false);
let _versions = $state<DocVersion[]>([]);

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
let _facetsEpoch = 0;

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
	if (_debounceTimer) {
		clearTimeout(_debounceTimer);
		_debounceTimer = null;
	}
	_pendingRange = null;
}

function _appliedFilters(): Partial<AnchorOffsetParams> {
	// Same mapping as the list query — see filtersToParams. The rail MUST filter
	// identically to /documents or its offsets point at the wrong rows.
	return filtersToParams(_controls.filters) as Partial<AnchorOffsetParams>;
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
		if (epoch === _queryEpoch) _inflightWindows.delete(key);
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
	get hasPrev() { return _openIndex !== null && _openIndex > 0; },
	get hasNext() { return _openIndex !== null && _total !== null && _openIndex < _total - 1; },
	get curationStats() { return _curationStats; },
	get editMode() { return _editMode; },
	get versions() { return _versions; },

	rowAt(index: number): DocListItem | undefined {
		void _version; // subscribe: re-reads when the cache changes
		return _rowCache.get(index);
	},

	async init() {
		if (_status !== 'idle') return;
		_status = 'loading';
		await Promise.all([_newQuery(), this.loadFacets({ fatal: true }), this.loadCurationStats()]);
	},

	async loadFacets(opts: { fatal?: boolean } = {}) {
		const { fatal = false } = opts;
		const epoch = ++_facetsEpoch;
		try {
			const facets = await client.getFacets(_controls.filters.corpus?.source);
			if (epoch !== _facetsEpoch) return; // superseded — discard
			_facets = facets;
		} catch (e) {
			if (epoch !== _facetsEpoch) return;
			if (fatal) {
				_mapError(e);
			}
			// else: non-fatal refetch (e.g. mid-session source change) — swallow the
			// error and keep the previous _facets; stale categories beat a destroyed
			// page. Mirrors loadCurationStats' best-effort handling.
		}
	},

	searchTags(q: string) {
		return client.searchTags(q);
	},

	applyControls(patch: Partial<LibraryControls>) {
		const prev = _controls;
		const next = { ...prev, ...patch };
		_controls = next;
		if (controlsChanged(prev, next)) {
			_queryKey = computeQueryKey(next);
			void _newQuery();
		}
		if (patch.filters && patch.filters.corpus?.source !== prev.filters.corpus?.source) {
			void this.loadFacets();
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
			return Math.max(0, Math.min(offset, Math.max(0, total - 1)));
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

	async openDocByIndex(index: number) {
		const clamped = clampIndex(index, _total);
		if (clamped === null) return;
		_openIndex = clamped;
		let id = _rowCache.get(clamped)?.id;
		if (id === undefined) {
			// Row not cached (e.g. prev/next stepped past a window edge): fetch just
			// this row in the current order to learn its id.
			try {
				const resp = await client.listDocuments(toQuery(_controls, clamped, 1));
				if (_openIndex !== clamped) return; // a newer open superseded this one
				id = resp.items[0]?.id;
			} catch (e) {
				_openDocStatus = 'error';
				_mapError(e);
				return;
			}
		}
		if (id === undefined) return;
		await this.openDocById(id);
	},

	openPrevDoc() {
		if (_openIndex !== null && _openIndex > 0) return this.openDocByIndex(_openIndex - 1);
	},
	openNextDoc() {
		if (_openIndex !== null && _total !== null && _openIndex < _total - 1) {
			return this.openDocByIndex(_openIndex + 1);
		}
	},

	async loadCurationStats() {
		try {
			_curationStats = await client.getCurationStats();
		} catch {
			/* stats are best-effort; a failure shouldn't break the reader */
		}
	},

	async setDecision(clicked: Decision) {
		const doc = _openDoc;
		if (!doc) return;
		const target = toggleDecision(doc.decision, clicked); // keep|hide|delete|undecided
		const nextVal: Decision | null = target === 'undecided' ? null : target;
		const prevVal = doc.decision;
		const idx = _openIndex;

		// Optimistic: update the open doc + its cached row (no requery -> no yank).
		_openDoc = { ...doc, decision: nextVal };
		if (idx !== null) {
			const cached = _rowCache.get(idx);
			if (cached) _rowCache.set(idx, { ...cached, decision: nextVal });
			_version++;
		}

		try {
			await client.setCuration(doc.id, target);
			await this.loadCurationStats();
		} catch (e) {
			// Roll back only if the same doc is still open (user may have navigated).
			if (_openDoc && _openDoc.id === doc.id) _openDoc = { ..._openDoc, decision: prevVal };
			if (idx !== null) {
				const c2 = _rowCache.get(idx);
				if (c2 && c2.id === doc.id) _rowCache.set(idx, { ...c2, decision: prevVal });
				_version++;
			}
			// Deliberately NOT _mapError: that sets the page-level _status, and the
			// controls are gated behind status === 'ready', so one failed write would
			// unmount the entire UI mid-triage. Same failure class as saveEdit (2889d58).
			toast.error('could not save decision');
		}
	},

	startEdit() { _editMode = true; },
	cancelEdit() { _editMode = false; },

	async saveEdit(draft: EditDraft): Promise<boolean> {
		const doc = _openDoc;
		if (!doc) return false;
		const counts = computeCounts(draft.body);
		const prev = doc;
		_openDoc = { ...doc, body: draft.body, title: draft.title, tags: [...draft.tags],
			needs_formatting: draft.needs_formatting, ...counts, edited: true };
		try {
			const merged = await client.saveBody(doc.id, draftToPayload(draft));
			if (_openDoc && _openDoc.id === doc.id) {
				_openDoc = merged;
				_editMode = false;
			}
			return true;
		} catch (e) {
			if (_openDoc && _openDoc.id === doc.id) _openDoc = prev;   // roll back; stay in edit mode
			throw e;   // let the component toast
		}
	},

	async loadVersions() {
		const doc = _openDoc;
		if (!doc) return;
		try { _versions = await client.getVersions(doc.id); }
		catch { _versions = []; }
	},

	async revert(target: { version_id: number } | { original: true }): Promise<void> {
		const doc = _openDoc;
		if (!doc) return;
		const merged = await client.revertDoc(doc.id, target);   // throws -> component toasts
		if (_openDoc && _openDoc.id === doc.id) _openDoc = merged;
	},

	closeDoc() {
		_docEpoch++;
		_openDoc = null;
		_openDocStatus = 'idle';
		_openIndex = null;
		_editMode = false;
		_versions = [];
	}
};

export const libraryClient = client;
