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
	isStaleCursor
} from './libraryLogic';
import type { LibraryControls, LibraryState } from './libraryLogic';
import type { LibraryDoc, Facets } from './types';

const LIMIT = 50;

const baseUrl = env.PUBLIC_LIBRARY_API_URL || 'https://library-api.veritablegames.com';

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
	_state = { ...emptyState(), isFetching: true };
	try {
		const resp = await client.listDocuments(toQuery(_controls, null, LIMIT));
		_state = appendPage(emptyState(), resp);
		_status = 'ready';
	} catch (e) {
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

	async loadMore() {
		if (!canLoadMore(_state)) return;
		_state = { ..._state, isFetching: true };
		try {
			const resp = await client.listDocuments(toQuery(_controls, _state.cursor, LIMIT));
			_state = appendPage({ ..._state, isFetching: false }, resp);
			_status = 'ready';
		} catch (e) {
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
		_openDocStatus = 'loading';
		try {
			_openDoc = await client.getDocument(id);
			_openDocStatus = 'idle';
		} catch {
			_openDocStatus = 'error';
		}
	},

	closeDoc() {
		_openDoc = null;
	}
};
