import { describe, it, expect } from 'vitest';
import { metaPayload, metaProblems, cleanLinks, type MetaDraft } from './metaLogic';

const d = (o: Partial<MetaDraft> = {}): MetaDraft =>
	({ author: 'A', publication_date: '1999', date_precision: 'year', document_type: 'book', source_url: '', ...o });

describe('metaPayload', () => {
	it('is null when nothing changed', () => expect(metaPayload(d(), d())).toBeNull());
	it('sends only changed fields', () =>
		expect(metaPayload(d(), d({ author: 'B' }))).toEqual({ author: 'B' }));
	it('an emptied field goes in clear, not as ""', () =>
		expect(metaPayload(d(), d({ author: ' ' }))).toEqual({ clear: ['author'] }));
	it('ignores whitespace-only edits', () =>
		expect(metaPayload(d(), d({ author: 'A ' }))).toBeNull());
});

describe('metaProblems', () => {
	it('accepts year, month, day', () => {
		for (const v of ['1999', '1999-04', '1999-04-02', '']) expect(metaProblems(d({ publication_date: v }))).toEqual([]);
	});
	it('rejects free text and non-http urls', () => {
		expect(metaProblems(d({ publication_date: 'spring 1999' }))).toHaveLength(1);
		expect(metaProblems(d({ source_url: 'javascript:1' }))).toHaveLength(1);
	});
});

describe('cleanLinks', () => {
	it('drops blanks, keeps order, names default to the url', () => {
		const r = cleanLinks([{ name: '', url: '' }, { name: 'b', url: 'https://b.example' }, { name: '', url: 'https://a.example' }]);
		expect(r.links.map((l) => l.name)).toEqual(['b', 'https://a.example']);
		expect(r.problems).toEqual([]);
	});
	it('refuses non-http links', () => {
		const r = cleanLinks([{ name: 'x', url: 'javascript:alert(1)' }]);
		expect(r.links).toEqual([]);
		expect(r.problems).toHaveLength(1);
	});
});
