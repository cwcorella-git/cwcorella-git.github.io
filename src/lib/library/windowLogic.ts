/** Pure window math + LRU for offset-windowed list loading. No Svelte, no I/O. */

export const WINDOW_SIZE = 200;
export const LOOKAHEAD = 1;
export const LRU_CAP = 15; // ~3000 cached rows

export function windowKeyFor(index: number): number {
	return Math.floor(Math.max(0, index) / WINDOW_SIZE);
}

export function windowBounds(key: number): { offset: number; limit: number } {
	return { offset: key * WINDOW_SIZE, limit: WINDOW_SIZE };
}

/** Aligned window keys covering [start, end], plus `lookahead` windows ahead. */
export function windowsForRange(start: number, end: number, lookahead: number): number[] {
	const first = windowKeyFor(start);
	const last = windowKeyFor(end);
	const keys: number[] = [];
	for (let k = first; k <= last + lookahead; k++) keys.push(k);
	return keys;
}

/** Keys to evict when `loaded` exceeds `cap`: farthest (by key distance) from
 *  any `active` window first. Active windows sort last, so they survive. */
export function evictWindows(loaded: Set<number>, active: number[], cap: number): number[] {
	if (loaded.size <= cap) return [];
	const dist = (k: number) =>
		active.length ? Math.min(...active.map((a) => Math.abs(k - a))) : k;
	const sorted = [...loaded].sort((a, b) => dist(b) - dist(a)); // farthest first
	return sorted.slice(0, loaded.size - cap);
}

/** The null-anchor shortcut: leading bucket in asc (0), trailing in desc
 *  (total-1). A real value returns null — the caller must fetch a count. */
export function resolveAnchorIndex(
	seek: string | null,
	dir: 'asc' | 'desc',
	total: number
): number | null {
	if (seek === null) return dir === 'asc' ? 0 : Math.max(0, total - 1);
	return null;
}
