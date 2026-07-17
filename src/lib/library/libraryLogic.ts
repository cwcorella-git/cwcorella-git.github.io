import type { LibraryQuery } from './types';

export interface LibraryControls {
	sort: string; // title|author|publication_date|word_count offered in the dropdown; updated_at is a valid backend value but not offered
	dir: 'asc' | 'desc';
	q: string; // search text ('' = none)
	filters: {
		// '' / undefined = not applied
		language?: string;
		corpus?: import('./types').CorpusFilter;
		tags?: string[];
		visibility?: string;
		needs_formatting?: 0 | 1;
		decision?: import('./types').DecisionInput;
	};
	view: 'list' | 'grid';
}

/** Whether a filter value counts as "applied". 0 is a real value; [] and {} are not. */
function isAppliedFilterValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value !== null && typeof value === 'object') {
		return Object.values(value).some((v) => v !== undefined && v !== '');
	}
	return value !== undefined && value !== '';
}

export function defaultControls(): LibraryControls {
	return { sort: 'title', dir: 'asc', q: '', filters: {}, view: 'list' };
}

export function computeQueryKey(c: LibraryControls): string {
	const filterEntries = Object.entries(c.filters)
		.filter(([, value]) => isAppliedFilterValue(value))
		// Tags are ANDed, so chip order is not part of the query's identity. Without
		// this, reordering chips invalidates every cached window for no reason.
		.map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

	return JSON.stringify({
		sort: c.sort,
		dir: c.dir,
		q: c.q,
		filters: filterEntries
	});
}

export function controlsChanged(prev: LibraryControls, next: LibraryControls): boolean {
	return computeQueryKey(prev) !== computeQueryKey(next);
}

/**
 * Map controls.filters onto API query params.
 *
 * The single source of truth for this mapping. /documents and /anchor-offset MUST
 * send identical filters — the rail computes row offsets, so if it filters
 * differently from the list it silently scrolls to the wrong row. Two copies of
 * this logic is how that happens, so there is exactly one.
 */
export function filtersToParams(filters: LibraryControls['filters']): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(filters)) {
		if (!isAppliedFilterValue(value)) continue;
		// corpus is one UI control over two API params: a collection is a category
		// WITHIN a source. The API still takes them flat.
		if (key === 'corpus') {
			const { source, collection } = value as import('./types').CorpusFilter;
			if (source) out.source = source;
			if (collection) out.collection = collection;
			continue;
		}
		// filters.tags is the chip set; the HTTP param is `tag`, repeated once per
		// chip (serializeQuery expands the array). The API ANDs them.
		const param = key === 'tags' ? 'tag' : key;
		out[param] = value;
	}
	return out;
}

export function toQuery(c: LibraryControls, offset: number, limit: number): LibraryQuery {
	const query: LibraryQuery = { sort: c.sort, dir: c.dir, limit, offset };
	if (c.q !== '') query.q = c.q;
	return Object.assign(query, filtersToParams(c.filters));
}
