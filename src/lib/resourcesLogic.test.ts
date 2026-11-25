import { describe, it, expect } from 'vitest';
import { matches, groupByCluster, host, type Resource, type Cluster } from './resourcesLogic';

const r = (o: Partial<Resource>): Resource => ({ id: 'a', name: 'Alpha', url: 'https://www.a.org/x', cluster: 'c1', kind: 'project',
	oneLiner: 'mesh radio', license: null, cost: null, selfHostable: 'yes', decentralized: null, tags: ['lora'], verified: true, ...o });
const clusters: Cluster[] = [{ id: 'c1', name: 'One', description: '' }, { id: 'c2', name: 'Two', description: '' }];
const none = { query: '', cluster: '', selfHostableOnly: false };

describe('matches', () => {
	it('empty filter matches everything', () => expect(matches(r({}), none)).toBe(true));
	it('searches name, blurb, kind and tags, case-insensitively', () => {
		for (const q of ['alpha', 'MESH', 'project', 'lora']) expect(matches(r({}), { ...none, query: q })).toBe(true);
		expect(matches(r({}), { ...none, query: 'zzz' })).toBe(false);
	});
	it('cluster and self-host filters narrow', () => {
		expect(matches(r({}), { ...none, cluster: 'c2' })).toBe(false);
		expect(matches(r({ selfHostable: 'partial' }), { ...none, selfHostableOnly: true })).toBe(false);
	});
});
describe('groupByCluster', () => {
	it('orders by cluster list and drops empty groups', () => {
		const g = groupByCluster([r({ id: 'b', cluster: 'c2' }), r({ id: 'a' })], clusters, none);
		expect(g.map((x) => x.cluster.id)).toEqual(['c1', 'c2']);
		expect(groupByCluster([r({})], clusters, { ...none, cluster: 'c2' })).toEqual([]);
	});
});
describe('host', () => {
	it('strips www and survives junk', () => { expect(host('https://www.a.org/x')).toBe('a.org'); expect(host('nope')).toBe('nope'); });
});
import { suggestTags, sortByName, shortLabel } from './resourcesLogic';
describe('suggestTags', () => {
	it('nothing until typing, then matches topics and the self-hostable tag', () => {
		expect(suggestTags('', clusters, none)).toEqual([]);
		expect(suggestTags('self', clusters, none).map((t) => t.id)).toEqual(['self-hostable']);
		expect(suggestTags('tw', clusters, none).map((t) => t.id)).toEqual(['c2']);
	});
	it('drops tags already applied', () => {
		expect(suggestTags('self', clusters, { cluster: '', selfHostableOnly: true })).toEqual([]);
		expect(suggestTags('one', clusters, { cluster: 'c1', selfHostableOnly: false })).toEqual([]);
	});
});
describe('sortByName / shortLabel', () => {
	it('sorts ignoring leading punctuation', () => {
		expect(sortByName([r({ id: 'b', name: 'Beta' }), r({ id: 'a', name: '"Alpha' })]).map((x) => x.id)).toEqual(['a', 'b']);
	});
	it('falls back for unknown topics', () => expect(shortLabel({ id: 'zz', name: 'Zebra', description: '' })).toBe('ZEBR'));
});
