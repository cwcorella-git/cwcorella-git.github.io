import { describe, it, expect } from 'vitest';
import { railKind, alphaAnchors, dateAnchors, buildRail, UNDATED_SEEK } from './railLogic.js';

describe('railKind', () => {
	it('maps sorts to rail kinds', () => {
		expect(railKind('title')).toBe('alpha');
		expect(railKind('author')).toBe('alpha');
		expect(railKind('publication_date')).toBe('date');
		expect(railKind('updated_at')).toBe('none');
	});
});

describe('alphaAnchors', () => {
	it('asc: # then A..Z, # seeks to top (null)', () => {
		const a = alphaAnchors('asc');
		expect(a).toHaveLength(27);
		expect(a[0]).toEqual({ label: '#', seek: null });
		expect(a[1]).toEqual({ label: 'A', seek: 'A' });
		expect(a[26]).toEqual({ label: 'Z', seek: 'Z' });
	});
	it('desc: reversed, # still maps to the top of the ordering (null)', () => {
		const a = alphaAnchors('desc');
		expect(a[0]).toEqual({ label: 'Z', seek: 'Z' });
		expect(a[26]).toEqual({ label: '#', seek: null });
	});
});

describe('dateAnchors', () => {
	const range = { min_year: 1848, max_year: 2025, undated: 65780 };
	it('asc: ‹1800 (top), decades from 1800, then undated', () => {
		const a = dateAnchors(range, 'asc');
		expect(a[0]).toEqual({ label: '‹1800', seek: null });
		expect(a[1]).toEqual({ label: '1800s', seek: '1800' });
		expect(a.find((x) => x.label === '2020s')).toEqual({ label: '2020s', seek: '2020' });
		expect(a[a.length - 1]).toEqual({ label: 'undated', seek: UNDATED_SEEK });
	});
	it('collapses the sub-1800 tail into a single ‹1800 bucket', () => {
		const a = dateAnchors({ min_year: 720, max_year: 2025, undated: 0 }, 'asc');
		const decades = a.filter((x) => x.label.endsWith('s') && x.label !== '‹1800');
		expect(decades[0].label).toBe('1800s');
	});
	it('omits undated anchor when undated count is 0', () => {
		const a = dateAnchors({ min_year: 1900, max_year: 2025, undated: 0 }, 'asc');
		expect(a.some((x) => x.seek === UNDATED_SEEK)).toBe(false);
	});
	it('desc: order reversed, decade seek is the top-of-decade boundary (<=)', () => {
		const a = dateAnchors(range, 'desc');
		expect(a[0]).toEqual({ label: 'undated', seek: UNDATED_SEEK });
		const twenties = a.find((x) => x.label === '2020s');
		expect(twenties).toEqual({ label: '2020s', seek: '2029' });
		expect(a[a.length - 1]).toEqual({ label: '‹1800', seek: '1799' });
	});
});

describe('buildRail', () => {
	it('returns [] for updated_at (no rail)', () => {
		expect(buildRail('updated_at', 'asc', { min_year: 1900, max_year: 2025, undated: 0 })).toEqual(
			[]
		);
	});
	it('returns [] for date sort when range is null (old backend)', () => {
		expect(buildRail('publication_date', 'asc', null)).toEqual([]);
	});
	it('dispatches to alpha for text sorts', () => {
		expect(buildRail('title', 'asc', null)[0]).toEqual({ label: '#', seek: null });
	});
});
