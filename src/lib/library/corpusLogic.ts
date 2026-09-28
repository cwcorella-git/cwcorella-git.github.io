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

// The API's source keys are slugs; these are what they are called. Only the four
// sources in sources.py exist, so an unknown key falls back to the raw slug rather
// than being hidden.
const SOURCE_LABELS: Record<string, string> = {
	anarchist: 'Anarchist Library',
	marxist: 'Marxists.org',
	user: 'User Library',
	youtube: 'YouTube'
};

export function sourceLabel(source: string): string {
	return SOURCE_LABELS[source] ?? source;
}

/** The corpus trigger's label. Empty when unset — the trigger shows its glyph alone. */
export function corpusLabel(corpus: CorpusFilter | undefined): string {
	if (!corpus?.source) return '';
	const source = sourceLabel(corpus.source);
	return corpus.collection ? `${source} ▸ ${corpus.collection}` : source;
}

/**
 * The corpus total for the "all sources" row, as display text.
 *
 * Empty string while `facets` is null, NOT "0". The panel can be opened before
 * `getFacets` resolves -- roughly a second and a half over the tunnel -- and a
 * confident `0` beside an empty source list reads as "the library is empty"
 * rather than "still loading". It was reported as exactly that.
 *
 * This is the convention the other three panels already follow: LanguageControl
 * gives the "all" row no count, StateControl returns '' for a missing bucket
 * ("show no count rather than a wrong one"), DecisionControl uses `?? ''`.
 * CorpusControl was the one that used `?? 0`.
 *
 * A LOADED but empty `sources` is a real zero and prints as one -- the distinction
 * is absent-versus-empty, not falsy.
 */
export function corpusTotal(facets: Facets | null): string {
	if (!facets) return '';
	return facets.sources.reduce((n, s) => n + s.count, 0).toLocaleString();
}
