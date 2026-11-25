import { describe, it, expect } from 'vitest';
import { selectPublic, leakReason, project } from '../../scripts/lib/public-links.mjs';

const base = { id: 'a', name: 'A', url: 'https://example.com/', cluster: 'dev-misc', kind: 'project',
	one_liner: 'x', what_it_is: 'SECRET NOTES', held: ['/data/x'], source_line: 5, confidence: 'verified', tags: ['t'] };

describe('selectPublic', () => {
	it('exports nothing unless public === true', () => {
		expect(selectPublic([base, { ...base, public: 'yes' }, { ...base, public: false }]).items).toEqual([]);
	});
	it('exports a public entry without private fields', () => {
		const { items } = selectPublic([{ ...base, public: true }]);
		expect(items).toHaveLength(1);
		const s = JSON.stringify(items);
		expect(s).not.toContain('SECRET NOTES');
		expect(s).not.toContain('/data/x');
		expect(Object.keys(items[0])).not.toContain('what_it_is');
	});
	it.each([
		['private', { private: true }],
		['credentials', { url_had_credentials: true }],
		['personal', { cluster: 'personal' }],
		['duplicate', { duplicate_of: 'b' }],
		['token key', { url: 'https://x.com/?access_token=abc' }],
		['userinfo', { url: 'https://u:p@x.com/' }],
		['local', { url: 'http://127.0.0.1:7000/' }],
		['non-http', { url: 'file:///etc/passwd' }]
	])('refuses a public entry that is %s', (_n, patch) => {
		const r = selectPublic([{ ...base, public: true, ...patch }]);
		expect(r.items).toEqual([]);
		expect(r.refused).toHaveLength(1);
	});
	it('lets harmless query params through', () => {
		expect(leakReason({ ...base, url: 'https://x.com/watch?v=abc&t=5' })).toBeNull();
	});
});
