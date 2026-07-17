import { describe, it, expect } from 'vitest';
import { defaultControls, toQuery, computeQueryKey, controlsChanged } from './libraryLogic';
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
	it('sets sort/dir/limit/offset', () => {
		const q = toQuery(defaultControls(), 400, 200);
		expect(q).toMatchObject({ sort: 'title', dir: 'asc', limit: 200, offset: 400 });
	});
	it('offset 0 is included', () => {
		expect(toQuery(defaultControls(), 0, 200).offset).toBe(0);
	});
	it('carries q and applied filters, omits empty ones', () => {
		const c = { ...defaultControls(), q: 'bread', filters: { language: 'en', source: '' } };
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
