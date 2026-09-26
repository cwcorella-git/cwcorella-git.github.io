import { describe, it, expect } from 'vitest';
import {
	docPath,
	parseDocPath,
	controlsToSearch,
	searchToControls,
	isBrowserClick
} from './urlLogic';
import { defaultControls, computeQueryKey, RELEVANCE } from './libraryLogic';
import type { LibraryControls } from './libraryLogic';

const controls = (patch: Partial<LibraryControls>): LibraryControls => ({
	...defaultControls(),
	...patch
});

describe('document paths', () => {
	it('round-trips a plain slug', () => {
		const doc = { source: 'anarchist', slug: 'p-m-bolo-bolo' };
		expect(docPath(doc)).toBe('/library/anarchist/p-m-bolo-bolo');
		expect(parseDocPath(docPath(doc))).toEqual(doc);
	});

	it('round-trips characters a slug should not have but might', () => {
		for (const slug of ['a/b', 'bolo’bolo', 'a b', '100%', 'x?y#z', 'боло-боло']) {
			const doc = { source: 'user', slug };
			expect(parseDocPath(docPath(doc))).toEqual(doc);
		}
	});

	it('the list and anything else is not a document', () => {
		for (const p of ['/library', '/library/', '/library/anarchist', '/library/a/b/c', '/', '/reading/a/b']) {
			expect(parseDocPath(p)).toBeNull();
		}
	});

	it('tolerates a trailing slash and a malformed escape', () => {
		expect(parseDocPath('/library/user/x/')).toEqual({ source: 'user', slug: 'x' });
		expect(parseDocPath('/library/user/%E0%A4%A')).toBeNull();
	});
});

describe('list query string', () => {
	it('the default list is plain /library', () => {
		expect(controlsToSearch(defaultControls())).toBe('');
	});

	it('round-trips every control', () => {
		const c = controls({
			q: "bolo'bolo",
			sort: RELEVANCE,
			dir: 'desc',
			view: 'grid',
			filters: {
				corpus: { source: 'anarchist', collection: 'Books' },
				language: 'en',
				tags: ['utopia', 'anarchism'],
				visibility: 'private',
				needs_formatting: 0,
				decision: 'keep'
			}
		});
		const back = searchToControls(new URLSearchParams(controlsToSearch(c)));
		// Tags are ANDed, so their order is not identity: computeQueryKey agrees.
		expect(computeQueryKey(back)).toBe(computeQueryKey(c));
		expect(back.view).toBe('grid');
	});

	it('is stable for the same query whatever the tag order', () => {
		const a = controls({ filters: { tags: ['b', 'a'] } });
		const b = controls({ filters: { tags: ['a', 'b'] } });
		expect(controlsToSearch(a)).toBe(controlsToSearch(b));
	});

	it('an edited or stale URL falls back to defaults instead of reaching the API', () => {
		const c = searchToControls(
			new URLSearchParams('sort=drop+table&dir=sideways&view=3d&visibility=x&needs_formatting=7&decision=maybe&tag=')
		);
		expect(computeQueryKey(c)).toBe(computeQueryKey(defaultControls()));
	});

	it('a search URL is best match unless it names a sort, and writes no sort for it', () => {
		expect(searchToControls(new URLSearchParams('q=bolo')).sort).toBe(RELEVANCE);
		expect(searchToControls(new URLSearchParams('q=bolo&sort=title')).sort).toBe('title');
		expect(controlsToSearch(controls({ q: 'bolo', sort: RELEVANCE }))).toBe('?q=bolo');
		expect(controlsToSearch(controls({ q: 'bolo', sort: 'title' }))).toBe('?q=bolo&sort=title');
	});

	it('never yields relevance without a search', () => {
		expect(searchToControls(new URLSearchParams('sort=relevance')).sort).toBe('title');
		expect(searchToControls(new URLSearchParams('sort=relevance&q=+')).sort).toBe('title');
		expect(searchToControls(new URLSearchParams('sort=relevance&q=x')).sort).toBe(RELEVANCE);
	});

	it('a collection without its source is dropped (a collection lives within a source)', () => {
		expect(searchToControls(new URLSearchParams('collection=Books')).filters.corpus).toBeUndefined();
	});
});

describe('isBrowserClick', () => {
	const plain = { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false };

	it('a plain left click is ours', () => {
		expect(isBrowserClick(plain)).toBe(false);
	});

	it('middle click and modified clicks belong to the browser', () => {
		expect(isBrowserClick({ ...plain, button: 1 })).toBe(true);
		for (const k of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey'] as const) {
			expect(isBrowserClick({ ...plain, [k]: true })).toBe(true);
		}
		expect(isBrowserClick({ ...plain, defaultPrevented: true })).toBe(true);
	});
});
