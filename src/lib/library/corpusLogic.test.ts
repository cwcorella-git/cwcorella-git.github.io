import { describe, it, expect } from 'vitest';
import { buildCorpusTree, corpusLabel, sourceLabel } from './corpusLogic';
import type { Facets } from './types';

const facets = (over: Partial<Facets> = {}): Facets => ({
	languages: [],
	sources: [
		{ name: 'youtube', count: 60726 },
		{ name: 'anarchist', count: 24594 },
		{ name: 'user', count: 2521 }
	],
	collections: [
		{ name: 'transcript', source: 'youtube', count: 60726 },
		{ name: 'Egoism', source: 'anarchist', count: 1204 },
		{ name: 'Anarcho-syndicalism', source: 'anarchist', count: 3881 }
	],
	tags: [],
	...over
});

describe('buildCorpusTree', () => {
	it('nests categories under their source, sources ordered by count desc', () => {
		const tree = buildCorpusTree(facets());
		expect(tree.map((s) => s.name)).toEqual(['youtube', 'anarchist', 'user']);
		expect(tree[1].categories.map((c) => c.name)).toEqual(['Anarcho-syndicalism', 'Egoism']);
	});

	it('orders categories by count desc, then name', () => {
		const tree = buildCorpusTree(facets());
		expect(tree[1].categories.map((c) => c.count)).toEqual([3881, 1204]);
	});

	it('gives a source with no categories an empty list, not a missing one', () => {
		// `user` is 2,521 real documents with zero collections. It must appear in the
		// tree and simply not expand — dropping it would hide a whole source.
		const tree = buildCorpusTree(facets());
		const user = tree.find((s) => s.name === 'user');
		expect(user).toBeDefined();
		expect(user!.categories).toEqual([]);
		expect(user!.count).toBe(2521);
	});

	it('ignores collection buckets whose source is not in the sources facet', () => {
		const tree = buildCorpusTree(
			facets({ collections: [{ name: 'orphan', source: 'gone', count: 5 }] })
		);
		expect(tree.every((s) => s.categories.length === 0)).toBe(true);
		expect(tree.map((s) => s.name)).toEqual(['youtube', 'anarchist', 'user']);
	});

	it('drops buckets with no source — an un-upgraded API omits the key', () => {
		// Degradation: FacetBucket.source is optional. Un-attributed buckets cannot be
		// nested, so the tree is sources-only rather than wrong.
		const tree = buildCorpusTree(facets({ collections: [{ name: 'classics', count: 5 }] }));
		expect(tree.every((s) => s.categories.length === 0)).toBe(true);
	});

	it('returns [] for null facets', () => {
		expect(buildCorpusTree(null)).toEqual([]);
	});
});

describe('corpusLabel', () => {
	it('is empty when unset — the trigger shows its glyph alone', () => {
		expect(corpusLabel(undefined)).toBe('');
		expect(corpusLabel({})).toBe('');
	});

	it('shows the source alone, as its display label', () => {
		expect(corpusLabel({ source: 'anarchist' })).toBe('Anarchist Library');
	});

	it('shows source ▸ category, with the source as its display label', () => {
		expect(corpusLabel({ source: 'anarchist', collection: 'Egoism' })).toBe(
			'Anarchist Library ▸ Egoism'
		);
	});

	it('ignores a category with no source', () => {
		expect(corpusLabel({ collection: 'Egoism' })).toBe('');
	});
});

describe('sourceLabel', () => {
	it('maps known source slugs to their display names', () => {
		expect(sourceLabel('anarchist')).toBe('Anarchist Library');
		expect(sourceLabel('marxist')).toBe('Marxists.org');
		expect(sourceLabel('user')).toBe('User Library');
		expect(sourceLabel('youtube')).toBe('YouTube');
	});

	it('falls back to the raw slug for an unknown source', () => {
		expect(sourceLabel('unknown-src')).toBe('unknown-src');
	});
});
