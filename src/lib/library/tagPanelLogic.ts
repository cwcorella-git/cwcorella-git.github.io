import type { FacetBucket } from './types';

/**
 * Filter the top-200 tag facet client-side. The corpus has ~12k distinct tags and
 * the facet is capped at 200, so this covers the common case with no network; the
 * component falls back to GET /tags?q= for the tail.
 */
export function filterTagBuckets(
	buckets: FacetBucket[],
	q: string,
	chosen: string[]
): FacetBucket[] {
	const needle = q.trim().toLowerCase();
	const taken = new Set(chosen);
	return buckets.filter(
		(b) => !taken.has(b.name) && (needle === '' || b.name.toLowerCase().includes(needle))
	);
}
