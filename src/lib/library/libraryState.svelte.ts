import { env } from '$env/dynamic/public';
import { adminState } from '$lib/admin/state.svelte';
import { createLibraryClient, AuthError, OfflineError, ApiError } from './api';
import {
	defaultControls,
	emptyState,
	controlsChanged,
	toQuery,
	canLoadMore,
	appendPage,
	isStaleCursor,
	computeQueryKey
} from './libraryLogic';
import type { LibraryControls, LibraryState } from './libraryLogic';
import type { LibraryDoc, Facets } from './types';

const LIMIT = 50;

// A jump (seekTo) doesn't change sort/filters, so computeQueryKey alone won't
// change — the seek generation is folded in so DocList's queryKey effect still
// fires (scroll-to-top + load-more latch reset) on every jump.
export function composeQueryKey(base: string, seekGen: number): string {
	return base + '|s' + seekGen;
}

const baseUrl = env.PUBLIC_LIBRARY_API_URL || 'https://library-api.cwcorella.com';

const client = createLibraryClient({ baseUrl, getToken: () => adminState.libraryToken });

type Status = 'idle' | 'loading' | 'ready' | 'offline' | 'auth' | 'error';
type OpenDocStatus = 'idle' | 'loading' | 'error';

let _controls = $state<LibraryControls>(defaultControls());
let _state = $state<LibraryState>(emptyState());
let _facets = $state<Facets | null>(null);
let _status = $state<Status>('idle');
let _errorDetail = $state('');
let _openDoc = $state<LibraryDoc | null>(null);
let _openDocStatus = $state<OpenDocStatus>('idle');

// Request-epoch guards (plain counters, not reactive). Every new query generation
// bumps _queryEpoch; an in-flight first-page/load-more that resolves after the
// query changed is DISCARDED rather than spliced onto the new query's list —
// this is what keeps two orderings from ever mixing (the reliability contract).
// _docEpoch does the same for the single-doc reader (out-of-order opens / close).
let _queryEpoch = 0;
let _docEpoch = 0;

// Consumed (and cleared) by the next _fetchFirstPage; null = a plain top page.
let _pendingSeek: string | null = null;
// Bumped on every seekTo so the queryKey changes even when controls don't.
let _seekGen = $state(0);

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

async function _fetchFirstPage() {
	const epoch = ++_queryEpoch; // start a new query generation
	const seek = _pendingSeek; // consume the pending jump (null = plain top page)
	_pendingSeek = null;
	_state = { ...emptyState(), isFetching: true };
	try {
		const resp = await client.listDocuments(toQuery(_controls, null, LIMIT, seek));
		if (epoch !== _queryEpoch) return; // superseded by a newer query — discard
		_state = appendPage(emptyState(), resp);
		_status = 'ready';
	} catch (e) {
		if (epoch !== _queryEpoch) return; // superseded — don't clobber the new query
		_state = { ..._state, isFetching: false };
		_mapError(e);
	}
}

export const libraryState = {
	get controls() { return _controls; },
	get state() { return _state; },
	get facets() { return _facets; },
	get status() { return _status; },
	get errorDetail() { return _errorDetail; },
	get openDoc() { return _openDoc; },
	get openDocStatus() { return _openDocStatus; },
	get canLoadMore() { return canLoadMore(_state); },
	get queryKey() { return composeQueryKey(computeQueryKey(_controls), _seekGen); },

	async init() {
		if (_status !== 'idle') return;
		_status = 'loading';
		await Promise.all([_fetchFirstPage(), this.loadFacets()]);
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
			_state = emptyState();
			void _fetchFirstPage();
		}
	},

	seekTo(seek: string | null) {
		_pendingSeek = seek; // null = jump to the top of the current ordering
		_seekGen++; // force queryKey to change so DocList scrolls to top
		_state = emptyState();
		void _fetchFirstPage();
	},

	async loadMore() {
		if (!canLoadMore(_state)) return;
		const epoch = _queryEpoch; // this page belongs to the current query generation
		_state = { ..._state, isFetching: true };
		try {
			const resp = await client.listDocuments(toQuery(_controls, _state.cursor, LIMIT));
			if (epoch !== _queryEpoch) return; // query changed mid-flight — drop this page
			_state = appendPage({ ..._state, isFetching: false }, resp);
			_status = 'ready';
		} catch (e) {
			if (epoch !== _queryEpoch) return; // superseded — leave the new query alone
			if (isStaleCursor(e)) {
				_state = emptyState();
				await _fetchFirstPage();
			} else {
				_state = { ..._state, isFetching: false };
				_mapError(e);
			}
		}
	},

	async openDocById(id: number | string) {
		const epoch = ++_docEpoch;
		_openDocStatus = 'loading';
		try {
			const doc = await client.getDocument(id);
			if (epoch !== _docEpoch) return; // a newer open/close superseded this one
			_openDoc = doc;
			_openDocStatus = 'idle';
		} catch {
			if (epoch !== _docEpoch) return;
			_openDocStatus = 'error';
		}
	},

	closeDoc() {
		_docEpoch++; // invalidate any in-flight open so it can't re-populate the modal
		_openDoc = null;
		_openDocStatus = 'idle'; // reset so the modal actually dismisses (not stuck loading/error)
	}
};
