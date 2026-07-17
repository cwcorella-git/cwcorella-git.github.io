import { describe, it, expect } from 'vitest';
import { defaultControls, toQuery, computeQueryKey, controlsChanged, filtersToParams } from './libraryLogic';
import type { LibraryControls } from './libraryLogic';

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

		const c3: LibraryControls = { ...c, filters: { corpus: { source: 'gutenberg' } } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c3));

		const c4: LibraryControls = { ...c, filters: { corpus: { collection: 'x' } } };
		expect(computeQueryKey(c)).not.toBe(computeQueryKey(c4));

		const c5: LibraryControls = { ...c, filters: { tags: ['y'] } };
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
			filters: { language: 'en', corpus: { source: 'gutenberg' }, tags: ['fiction'] }
		};
		const c2: LibraryControls = {
			...defaultControls(),
			filters: { tags: ['fiction'], language: 'en', corpus: { source: 'gutenberg' } }
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
	it('sets sort/dir/limit/offset', () => {
		const q = toQuery(defaultControls(), 400, 200);
		expect(q).toMatchObject({ sort: 'title', dir: 'asc', limit: 200, offset: 400 });
	});
	it('offset 0 is included', () => {
		expect(toQuery(defaultControls(), 0, 200).offset).toBe(0);
	});
	it('carries q and applied filters, omits empty ones', () => {
		const c = { ...defaultControls(), q: 'bread', filters: { language: 'en', corpus: {} } };
		const q = toQuery(c, 0, 50);
		expect(q.q).toBe('bread');
		expect(q.language).toBe('en');
		expect('source' in q).toBe(false);
	});

	it('includes needs_formatting: 0 (must not be dropped as falsy)', () => {
		const c: LibraryControls = {
			...defaultControls(),
			filters: { needs_formatting: 0 }
		};
		const q = toQuery(c, 0, 50);
		expect(q).toHaveProperty('needs_formatting', 0);
	});

	it('includes needs_formatting: 1', () => {
		const c: LibraryControls = {
			...defaultControls(),
			filters: { needs_formatting: 1 }
		};
		const q = toQuery(c, 0, 50);
		expect(q).toHaveProperty('needs_formatting', 1);
	});
});

describe('toQuery tags', () => {
	it('maps filters.tags to the repeated `tag` param', () => {
		const c = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		expect(toQuery(c, 0, 50).tag).toEqual(['theory', 'economics']);
	});

	it('omits tag entirely when the chip set is empty', () => {
		const c = { ...defaultControls(), filters: { tags: [] } };
		expect('tag' in toQuery(c, 0, 50)).toBe(false);
	});

	it('omits tag when tags is absent', () => {
		expect('tag' in toQuery(defaultControls(), 0, 50)).toBe(false);
	});
});

describe('computeQueryKey tags', () => {
	it('treats different chip sets as different queries', () => {
		const a = { ...defaultControls(), filters: { tags: ['theory'] } };
		const b = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});

	it('treats an empty chip set as no filter', () => {
		const empty = { ...defaultControls(), filters: { tags: [] } };
		expect(computeQueryKey(empty)).toBe(computeQueryKey(defaultControls()));
	});

	it('is order-independent — same chips in any order is the same query', () => {
		const a = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		const b = { ...defaultControls(), filters: { tags: ['economics', 'theory'] } };
		expect(computeQueryKey(a)).toBe(computeQueryKey(b));
	});
});

describe('filtersToParams', () => {
	it('maps tags onto the repeated tag param', () => {
		expect(filtersToParams({ tags: ['theory', 'economics'] })).toEqual({
			tag: ['theory', 'economics']
		});
	});

	it('omits an empty chip set', () => {
		expect(filtersToParams({ tags: [] })).toEqual({});
	});

	it('keeps needs_formatting: 0 — clean is a real filter', () => {
		expect(filtersToParams({ needs_formatting: 0 })).toEqual({ needs_formatting: 0 });
	});

	it('passes scalar filters through unchanged', () => {
		expect(filtersToParams({ language: 'en', visibility: 'private' })).toEqual({
			language: 'en',
			visibility: 'private'
		});
	});

	it('returns {} for no filters', () => {
		expect(filtersToParams({})).toEqual({});
	});

	it('produces the same params the list query sends — the rail cannot diverge', () => {
		// If this ever fails, /anchor-offset and /documents are filtering differently
		// and the jump rail is scrolling to the wrong row.
		const filters = { tags: ['theory'], language: 'en', needs_formatting: 0 as const };
		const q = toQuery({ ...defaultControls(), filters }, 0, 50);
		const params = filtersToParams(filters);
		for (const [k, v] of Object.entries(params)) {
			expect((q as Record<string, unknown>)[k]).toEqual(v);
		}
	});

	it('flattens corpus for the rail too — it must not diverge from the list', () => {
		expect(filtersToParams({ corpus: { source: 'marxist', collection: 'classics' } })).toEqual({
			source: 'marxist',
			collection: 'classics'
		});
	});
});

describe('toQuery corpus', () => {
	it('flattens corpus to the flat source/collection params', () => {
		const c = { ...defaultControls(), filters: { corpus: { source: 'marxist', collection: 'classics' } } };
		const q = toQuery(c, 0, 50);
		expect(q.source).toBe('marxist');
		expect(q.collection).toBe('classics');
		expect('corpus' in q).toBe(false);
	});

	it('sends source alone when no category is chosen', () => {
		const c = { ...defaultControls(), filters: { corpus: { source: 'youtube' } } };
		const q = toQuery(c, 0, 50);
		expect(q.source).toBe('youtube');
		expect('collection' in q).toBe(false);
	});

	it('omits both when corpus is empty', () => {
		const c = { ...defaultControls(), filters: { corpus: {} } };
		const q = toQuery(c, 0, 50);
		expect('source' in q).toBe(false);
		expect('collection' in q).toBe(false);
	});

	it('omits both when corpus is absent', () => {
		const q = toQuery(defaultControls(), 0, 50);
		expect('source' in q).toBe(false);
	});
});

describe('computeQueryKey corpus', () => {
	it('distinguishes different corpus selections', () => {
		const a = { ...defaultControls(), filters: { corpus: { source: 'marxist' } } };
		const b = { ...defaultControls(), filters: { corpus: { source: 'youtube' } } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});

	it('treats an empty corpus object as no filter', () => {
		const empty = { ...defaultControls(), filters: { corpus: {} } };
		expect(computeQueryKey(empty)).toBe(computeQueryKey(defaultControls()));
	});
});

describe('decision filter composition', () => {
	it('toQuery passes an applied decision filter through', () => {
		const c = { ...defaultControls(), filters: { decision: 'undecided' as const } };
		expect(toQuery(c, 0, 50).decision).toBe('undecided');
	});
	it('an unset decision filter is omitted from the query', () => {
		expect(toQuery(defaultControls(), 0, 50).decision).toBeUndefined();
	});
	it('changing decision changes the query key', () => {
		const a = defaultControls();
		const b = { ...a, filters: { decision: 'keep' as const } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});
});
