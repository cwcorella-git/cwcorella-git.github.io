import { ApiError } from './api';
import type { DocListItem, LibraryQuery, ListResponse } from './types';

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
	};
	view: 'list' | 'grid';
}

export interface LibraryState {
	items: DocListItem[];
	cursor: string | null; // B2 next_cursor; null = at start or exhausted
	hasNext: boolean;
	total: number | null; // from B2 COUNT; null until first page loads
	isFetching: boolean;
}

/** Whether a filter value counts as "applied". 0 is a real value, not empty. */
function isAppliedFilterValue(value: unknown): boolean {
	return value !== undefined && value !== '';
}

export function defaultControls(): LibraryControls {
	return { sort: 'title', dir: 'asc', q: '', filters: {}, view: 'list' };
}

export function emptyState(): LibraryState {
	return { items: [], cursor: null, hasNext: true, total: null, isFetching: false };
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

export function toQuery(c: LibraryControls, cursor: string | null, limit: number): LibraryQuery {
	const query: LibraryQuery = {
		sort: c.sort,
		dir: c.dir,
		limit
	};

	if (c.q !== '') {
		query.q = c.q;
	}

	for (const [key, value] of Object.entries(c.filters)) {
		if (isAppliedFilterValue(value)) {
			(query as Record<string, unknown>)[key] = value;
		}
	}

	if (cursor !== null) {
		query.cursor = cursor;
	}

	return query;
}

export function canLoadMore(s: LibraryState): boolean {
	return !s.isFetching && s.hasNext;
}

export function appendPage(s: LibraryState, resp: ListResponse): LibraryState {
	const existingIds = new Set(s.items.map((item) => item.id));
	const newItems = resp.items.filter((item) => !existingIds.has(item.id));

	return {
		items: [...s.items, ...newItems],
		cursor: resp.next_cursor,
		hasNext: resp.next_cursor != null,
		total: resp.total,
		isFetching: false
	};
}

export function isStaleCursor(err: unknown): boolean {
	return err instanceof ApiError && err.status === 400;
}
