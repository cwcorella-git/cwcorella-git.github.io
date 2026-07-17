import { describe, it, expect } from 'vitest';
import { filterTagBuckets } from './tagPanelLogic';

const buckets = [
	{ name: 'theory', count: 5 },
	{ name: 'economics', count: 2 },
	{ name: 'anarcho-syndicalism', count: 1990 }
];

describe('filterTagBuckets', () => {
	it('returns everything unchosen for an empty query', () => {
		expect(filterTagBuckets(buckets, '', []).map((b) => b.name)).toEqual([
			'theory',
			'economics',
			'anarcho-syndicalism'
		]);
	});

	it('matches a substring, case-insensitively', () => {
		expect(filterTagBuckets(buckets, 'ECON', []).map((b) => b.name)).toEqual(['economics']);
	});

	it('excludes tags already committed as chips', () => {
		expect(filterTagBuckets(buckets, '', ['theory']).map((b) => b.name)).toEqual([
			'economics',
			'anarcho-syndicalism'
		]);
	});

	it('returns [] when nothing matches', () => {
		expect(filterTagBuckets(buckets, 'zzz', [])).toEqual([]);
	});
});
