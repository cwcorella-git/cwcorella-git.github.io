export interface RailAnchor {
	label: string;
	seek: string | null; // null = jump to the top of the current ordering
}

export type RailKind = 'alpha' | 'date' | 'none';

export interface DateRange {
	min_year: number | null;
	max_year: number | null;
	undated: number;
}

export const UNDATED_SEEK = '__undated__';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const OLD_TAIL_LABEL = '‹1800';
const DECADE_FLOOR = 1800;

export function railKind(sort: string): RailKind {
	if (sort === 'title' || sort === 'author') return 'alpha';
	if (sort === 'publication_date') return 'date';
	return 'none';
}

export function alphaAnchors(dir: 'asc' | 'desc'): RailAnchor[] {
	// '#' = non-alpha leading chars, which sort before 'A' → the top of an asc list.
	const anchors: RailAnchor[] = [
		{ label: '#', seek: null },
		...ALPHA.map((c) => ({ label: c, seek: c }))
	];
	return dir === 'asc' ? anchors : anchors.slice().reverse();
}

function floorDecade(year: number): number {
	return Math.floor(year / 10) * 10;
}

export function dateAnchors(range: DateRange, dir: 'asc' | 'desc'): RailAnchor[] {
	const anchors: RailAnchor[] = [];

	// ‹1800 collapses the sparse (and partly junk) pre-1800 tail.
	// asc: it's the top → seek null. desc: it's the bottom → seek <= '1799'.
	anchors.push({ label: OLD_TAIL_LABEL, seek: dir === 'asc' ? null : '1799' });

	if (range.max_year !== null) {
		const firstDecade = DECADE_FLOOR; // always start decade anchors at 1800
		const lastDecade = Math.max(firstDecade, floorDecade(range.max_year));
		for (let d = firstDecade; d <= lastDecade; d += 10) {
			// asc: seek the decade start (>= d). desc: seek the decade end (<= d+9).
			anchors.push({ label: `${d}s`, seek: dir === 'asc' ? String(d) : String(d + 9) });
		}
	}

	if (range.undated > 0) {
		anchors.push({ label: 'undated', seek: UNDATED_SEEK });
	}

	return dir === 'asc' ? anchors : anchors.slice().reverse();
}

export function buildRail(
	sort: string,
	dir: 'asc' | 'desc',
	range: DateRange | null
): RailAnchor[] {
	const kind = railKind(sort);
	if (kind === 'alpha') return alphaAnchors(dir);
	if (kind === 'date') return range ? dateAnchors(range, dir) : [];
	return [];
}
