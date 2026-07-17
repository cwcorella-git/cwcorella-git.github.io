import type { LibraryQuery, FacetBucket } from './types';

// The facets API keys collection buckets on (source, name) so a corpus control can
// nest categories under the source they belong to — `classics` arrives once for
// `user` and once for `marxist`. This dropdown is flat and keys its {#each} on
// `bucket.name`, and duplicate keys are a hard error in Svelte 5. Merging same-named
// buckets reproduces exactly what the API returned before source attribution.
// Delete this once the corpus cascade replaces the flat collections dropdown.
export function mergeCollectionBuckets(buckets: FacetBucket[]): FacetBucket[] {
	const byName = new Map<string, number>();
	for (const b of buckets) byName.set(b.name, (byName.get(b.name) ?? 0) + b.count);
	return [...byName]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export interface LibraryControls {
	sort: string; // one of B2's 4: title|author|publication_date|updated_at
	dir: 'asc' | 'desc';
	q: string; // search text ('' = none)
	filters: {
		// '' / undefined = not applied
		language?: string;
		source?: string;
		collection?: string;
		tags?: string[];
		visibility?: string;
		needs_formatting?: 0 | 1;
		decision?: import('./types').DecisionInput;
	};
	view: 'list' | 'grid';
}

/** Whether a filter value counts as "applied". 0 is a real value; [] is not. */
function isAppliedFilterValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
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

export function toQuery(c: LibraryControls, offset: number, limit: number): LibraryQuery {
	const query: LibraryQuery = { sort: c.sort, dir: c.dir, limit, offset };

	if (c.q !== '') {
		query.q = c.q;
	}

	for (const [key, value] of Object.entries(c.filters)) {
		if (!isAppliedFilterValue(value)) continue;
		// filters.tags is the chip set; the HTTP param is `tag`, repeated once per
		// chip (serializeQuery expands the array). The API ANDs them.
		const param = key === 'tags' ? 'tag' : key;
		(query as Record<string, unknown>)[param] = value;
	}

	return query;
}
