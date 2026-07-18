import { describe, it, expect } from 'vitest';
import { computeCounts, docToDraft, draftChanged, draftToPayload } from './editLogic';
import type { LibraryDoc } from './types';

const doc = (over: Partial<LibraryDoc> = {}): LibraryDoc => ({
	id: 1, source: 'user', slug: 's', title: 'T', author: null, publication_date: null,
	language: 'en', document_type: 'book', word_count: 2, char_count: 5, visibility: 'private',
	needs_formatting: false, updated_at: 't', decision: null, tags: ['a', 'b'],
	collections: [], body: 'hi there', ...over
});

describe('computeCounts', () => {
	it('counts words and chars', () => {
		expect(computeCounts('one two three')).toEqual({ word_count: 3, char_count: 13 });
		expect(computeCounts('   ')).toEqual({ word_count: 0, char_count: 3 });
	});
});

describe('draftChanged', () => {
	it('false when nothing changed', () => {
		expect(draftChanged(doc(), docToDraft(doc()))).toBe(false);
	});
	it('true when body changes', () => {
		const d = docToDraft(doc()); d.body = 'new';
		expect(draftChanged(doc(), d)).toBe(true);
	});
	it('true when tags reorder-insensitive differ', () => {
		const d = docToDraft(doc()); d.tags = ['b', 'a'];
		expect(draftChanged(doc(), d)).toBe(false);   // same set
		d.tags = ['a', 'c'];
		expect(draftChanged(doc(), d)).toBe(true);
	});
});

describe('draftToPayload', () => {
	it('maps needs_formatting bool->int and passes tags/body/title', () => {
		const d = docToDraft(doc({ needs_formatting: true }));
		expect(draftToPayload(d)).toEqual({ body: 'hi there', title: 'T', needs_formatting: 1, tags: ['a', 'b'] });
	});
});
