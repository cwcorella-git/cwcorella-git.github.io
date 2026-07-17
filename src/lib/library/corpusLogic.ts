import type { Facets, CorpusFilter } from './types';

export interface CorpusCategory {
	name: string;
	count: number;
}

export interface CorpusSource {
	name: string;
	count: number;
	categories: CorpusCategory[];
}

/**
 * Nest collection facet buckets under the source they belong to.
 *
 * A collection is a category WITHIN a source, not a sibling of it, but the API
 * returns the two dimensions flat. Buckets are keyed (source, name); a bucket with
 * no `source` comes from an un-upgraded API and cannot be nested, so it is dropped
 * and the tree degrades to sources-only rather than nesting it under a wrong parent.
 *
 * Sources with zero categories (`user` has 2,521 documents and no collections) are
 * kept with an empty list — they exist, they just do not expand.
 */
export function buildCorpusTree(facets: Facets | null): CorpusSource[] {
	if (!facets) return [];

	const bySource = new Map<string, CorpusCategory[]>();
	for (const s of facets.sources) bySource.set(s.name, []);

	for (const b of facets.collections) {
		const list = b.source ? bySource.get(b.source) : undefined;
		if (!list) continue; // no source, or a source the facet does not list
		list.push({ name: b.name, count: b.count });
	}

	for (const list of bySource.values()) {
		list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	}

	return facets.sources
		.map((s) => ({ name: s.name, count: s.count, categories: bySource.get(s.name) ?? [] }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The corpus trigger's label. Empty when unset — the trigger shows its glyph alone. */
export function corpusLabel(corpus: CorpusFilter | undefined): string {
	if (!corpus?.source) return '';
	return corpus.collection ? `${corpus.source} ▸ ${corpus.collection}` : corpus.source;
}
