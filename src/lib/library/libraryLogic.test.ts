import { describe, it, expect } from 'vitest';
import {
	defaultControls,
	emptyState,
	computeQueryKey,
	controlsChanged,
	toQuery,
	canLoadMore,
	appendPage,
	isStaleCursor
} from './libraryLogic';
import type { LibraryControls, LibraryState } from './libraryLogic';
import { ApiError, AuthError, OfflineError } from './api';
import type { DocListItem, ListResponse } from './types';

function makeItem(id: number, overrides: Partial<DocListItem> = {}): DocListItem {
	return {
		id,
		source: 'test-source',
		slug: `doc-${id}`,
		title: `Doc ${id}`,
		author: null,
		publication_date: null,
		language: 'en',
		document_type: 'book',
		word_count: 100,
		char_count: 500,
		visibility: 'public',
		needs_formatting: false,
		updated_at: '2026-01-01T00:00:00Z',
		...overrides
	};
}

describe('defaultControls', () => {
	it('returns the expected defaults', () => {
		expect(defaultControls()).toEqual({
			sort: 'title',
			dir: 'asc',
			q: '',
			filters: {},
			view: 'list'
		});
	});
});

describe('emptyState', () => {
	it('returns the expected empty state', () => {
		expect(emptyState()).toEqual({
			items: [],
			cursor: null,
			hasNext: true,
			total: null,
			isFetching: false
		});
	});
});

describe('computeQueryKey', () => {
	it('is identical for identical controls', () => {
		const c = defaultControls();
		expect(computeQueryKey(c)).toBe(computeQueryKey({ ...c }));
	});

	it('changes when sort changes', () => {
		const c = defaultControls();
		const c2: LibraryControls = { ...c, sort: 'author' };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c2));
	});

	it('changes when dir changes', () => {
		const c = defaultControls();
		const c2: LibraryControls = { ...c, dir: 'desc' };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c2));
	});

	it('changes when q changes', () => {
		const c = defaultControls();
		const c2: LibraryControls = { ...c, q: 'hello' };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c2));
	});

	it('changes when any single filter changes', () => {
		const c = defaultControls();
		const c2: LibraryControls = { ...c, filters: { language: 'en' } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c2));

		const c3: LibraryControls = { ...c, filters: { source: 'gutenberg' } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c3));

		const c4: LibraryControls = { ...c, filters: { collection: 'x' } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c4));

		const c5: LibraryControls = { ...c, filters: { tag: 'y' } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c5));

		const c6: LibraryControls = { ...c, filters: { visibility: 'private' } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c6));

		const c7: LibraryControls = { ...c, filters: { needs_formatting: 1 } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c7));
	});

	it('does NOT change when view changes (list <-> grid)', () => {
		const c = defaultControls();
		const grid: LibraryControls = { ...c, view: 'grid' };
		expect(computeQueryKey(c)).toBe(computeQueryKey(grid));
	});

	it('is independent of filter key insertion order', () => {
		const c1: LibraryControls = {
			...defaultControls(),
			filters: { language: 'en', source: 'gutenberg', tag: 'fiction' }
		};
		const c2: LibraryControls = {
			...defaultControls(),
			filters: { tag: 'fiction', language: 'en', source: 'gutenberg' }
		};
		expect(computeQueryKey(c1)).toBe(computeQueryKey(c2));
	});

	it('treats needs_formatting: 0 as a real applied value distinct from unset', () => {
		const unset = defaultControls();
		const zero: LibraryControls = { ...unset, filters: { needs_formatting: 0 } };
		const one: LibraryControls = { ...unset, filters: { needs_formatting: 1 } };

		expect(computeQueryKey(unset)).not.toBe(computeQueryKey(zero));
		expect(computeQueryKey(zero)).not.toBe(computeQueryKey(one));
	});
});

describe('controlsChanged', () => {
	it('is true iff the queryKey differs', () => {
		const c = defaultControls();
		const same: LibraryControls = { ...c };
		const diff: LibraryControls = { ...c, q: 'x' };
		expect(controlsChanged(c, same)).toBe(false);
		expect(controlsChanged(c, diff)).toBe(true);
	});

	it('is false for a view-only change', () => {
		const c = defaultControls();
		const gridOnly: LibraryControls = { ...c, view: 'grid' };
		expect(controlsChanged(c, gridOnly)).toBe(false);
	});
});

describe('toQuery', () => {
	it('omits q when empty', () => {
		const q = toQuery(defaultControls(), null, 50);
		expect(q).not.toHaveProperty('q');
	});

	it('omits empty filters and cursor:null', () => {
		const q = toQuery(defaultControls(), null, 50);
		expect(q).not.toHaveProperty('language');
		expect(q).not.toHaveProperty('source');
		expect(q).not.toHaveProperty('collection');
		expect(q).not.toHaveProperty('tag');
		expect(q).not.toHaveProperty('visibility');
		expect(q).not.toHaveProperty('needs_formatting');
		expect(q).not.toHaveProperty('cursor');
	});

	it('includes set fields plus limit', () => {
		const c: LibraryControls = {
			sort: 'author',
			dir: 'desc',
			q: 'moby',
			filters: { language: 'en', visibility: 'public' },
			view: 'grid'
		};
		const q = toQuery(c, 'cursor123', 25);
		expect(q).toEqual({
			sort: 'author',
			dir: 'desc',
			q: 'moby',
			language: 'en',
			visibility: 'public',
			cursor: 'cursor123',
			limit: 25
		});
	});

	it('includes needs_formatting: 0 (must not be dropped as falsy)', () => {
		const c: LibraryControls = {
			...defaultControls(),
			filters: { needs_formatting: 0 }
		};
		const q = toQuery(c, null, 50);
		expect(q).toHaveProperty('needs_formatting', 0);
	});

	it('includes needs_formatting: 1', () => {
		const c: LibraryControls = {
			...defaultControls(),
			filters: { needs_formatting: 1 }
		};
		const q = toQuery(c, null, 50);
		expect(q).toHaveProperty('needs_formatting', 1);
	});
});

describe('canLoadMore', () => {
	it('is false while isFetching', () => {
		const s: LibraryState = { ...emptyState(), isFetching: true, hasNext: true };
		expect(canLoadMore(s)).toBe(false);
	});

	it('is false when hasNext is false', () => {
		const s: LibraryState = { ...emptyState(), isFetching: false, hasNext: false };
		expect(canLoadMore(s)).toBe(false);
	});

	it('is true otherwise', () => {
		const s: LibraryState = { ...emptyState(), isFetching: false, hasNext: true };
		expect(canLoadMore(s)).toBe(true);
	});
});

describe('appendPage', () => {
	it('appends items in order and updates cursor/hasNext/total/isFetching', () => {
		const s: LibraryState = { ...emptyState(), isFetching: true };
		const resp: ListResponse = {
			items: [makeItem(1), makeItem(2)],
			next_cursor: 'abc',
			total: 10
		};
		const next = appendPage(s, resp);
		expect(next.items.map((i) => i.id)).toEqual([1, 2]);
		expect(next.cursor).toBe('abc');
		expect(next.hasNext).toBe(true);
		expect(next.total).toBe(10);
		expect(next.isFetching).toBe(false);
	});

	it('sets hasNext false when next_cursor is null', () => {
		const s: LibraryState = { ...emptyState(), isFetching: true };
		const resp: ListResponse = { items: [makeItem(1)], next_cursor: null, total: 1 };
		const next = appendPage(s, resp);
		expect(next.cursor).toBeNull();
		expect(next.hasNext).toBe(false);
	});

	it('does not duplicate an id that already exists', () => {
		const s: LibraryState = {
			...emptyState(),
			items: [makeItem(1), makeItem(2)],
			isFetching: true
		};
		const resp: ListResponse = {
			items: [makeItem(2), makeItem(3)],
			next_cursor: null,
			total: 3
		};
		const next = appendPage(s, resp);
		expect(next.items.map((i) => i.id)).toEqual([1, 2, 3]);
	});

	it('does not mutate the original state', () => {
		const s: LibraryState = { ...emptyState(), items: [makeItem(1)] };
		const resp: ListResponse = { items: [makeItem(2)], next_cursor: null, total: 2 };
		appendPage(s, resp);
		expect(s.items.map((i) => i.id)).toEqual([1]);
	});
});

describe('isStaleCursor', () => {
	it('is true for ApiError(400)', () => {
		expect(isStaleCursor(new ApiError(400))).toBe(true);
	});

	it('is false for ApiError(500)', () => {
		expect(isStaleCursor(new ApiError(500))).toBe(false);
	});

	it('is false for AuthError', () => {
		expect(isStaleCursor(new AuthError())).toBe(false);
	});

	it('is false for OfflineError', () => {
		expect(isStaleCursor(new OfflineError())).toBe(false);
	});

	it('is false for a plain Error', () => {
		expect(isStaleCursor(new Error('boom'))).toBe(false);
	});
});
