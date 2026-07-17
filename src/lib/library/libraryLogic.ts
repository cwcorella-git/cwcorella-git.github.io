import type { LibraryQuery } from './types';

export interface LibraryControls {
	sort: string; // one of B2's 4: title|author|publication_date|updated_at
	dir: 'asc' | 'desc';
	q: string; // search text ('' = none)
	filters: {
		// '' / undefined = not applied
		language?: string;
		source?: string;
		collection?: string;
		tag?: string;
		visibility?: string;
		needs_formatting?: 0 | 1;
		decision?: import('./types').DecisionInput;
	};
	view: 'list' | 'grid';
}

/** Whether a filter value counts as "applied". 0 is a real value, not empty. */
function isAppliedFilterValue(value: unknown): boolean {
	return value !== undefined && value !== '';
}

export function defaultControls(): LibraryControls {
	return { sort: 'title', dir: 'asc', q: '', filters: {}, view: 'list' };
}

export function computeQueryKey(c: LibraryControls): string {
	const filterEntries = Object.entries(c.filters)
		.filter(([, value]) => isAppliedFilterValue(value))
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
		if (isAppliedFilterValue(value)) {
			(query as Record<string, unknown>)[key] = value;
		}
	}

	return query;
}
