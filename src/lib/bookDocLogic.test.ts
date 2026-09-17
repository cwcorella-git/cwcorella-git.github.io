import { describe, it, expect } from 'vitest';
import { resolveBookDoc, linksFor, goodreadsUrl } from './bookDocLogic';
import type { Book } from './types';

const base: Book = { id: 1, title: 'Mutual Aid', author: 'Kropotkin', year: 1902, category: 'Politics' };
const withLinks: Book = { ...base, links: [{ name: 'Anarchist Library', url: 'https://example.org/a' }] };

describe('resolveBookDoc', () => {
	it('reads a public body whether or not you are admin', () => {
		const book: Book = { ...base, doc: { file: '1-mutual-aid', visibility: 'public' } };
		for (const isAdmin of [true, false]) {
			const v = resolveBookDoc(book, isAdmin);
			expect(v.kind).toBe('body');
			expect(v.kind === 'body' && v.doc.file).toBe('1-mutual-aid');
		}
	});

	it('reads an admin body only as admin', () => {
		const book: Book = { ...base, doc: { file: '1-mutual-aid', visibility: 'admin' } };
		expect(resolveBookDoc(book, true).kind).toBe('body');
		expect(resolveBookDoc(book, false).kind).toBe('links');
	});

	it('falls back to links when there is no doc', () => {
		expect(resolveBookDoc(base, true).kind).toBe('links');
	});

	// The reason this module exists. A visitor must not be able to tell a
	// withheld body from an absent one — that difference leaks corpus contents.
	it('is byte-identical for a withheld body and no body at all', () => {
		const withheld: Book = { ...withLinks, doc: { file: 'secret-thing', visibility: 'admin' } };
		const absent: Book = { ...withLinks };

		const a = resolveBookDoc(withheld, false);
		const b = resolveBookDoc(absent, false);

		expect(a).toEqual(b);
		// Nothing anywhere in the serialized result mentions the withheld file.
		expect(JSON.stringify(a)).not.toContain('secret-thing');
	});

	it('does not leak via the fallback either, when the book has no links', () => {
		const withheld: Book = { ...base, doc: { file: 'secret-thing', visibility: 'admin' } };
		expect(resolveBookDoc(withheld, false)).toEqual(resolveBookDoc(base, false));
	});
});

describe('linksFor', () => {
	it('prefers the book’s own links', () => {
		expect(linksFor(withLinks)).toEqual([{ name: 'Anarchist Library', url: 'https://example.org/a' }]);
	});

	it('never returns empty — falls back to a Goodreads search', () => {
		const out = linksFor(base);
		expect(out).toHaveLength(1);
		expect(out[0].url).toBe(goodreadsUrl(base));
	});

	it('treats an empty links array as absent', () => {
		expect(linksFor({ ...base, links: [] })).toHaveLength(1);
	});
});

describe('goodreadsUrl', () => {
	it('encodes title and author', () => {
		expect(goodreadsUrl({ title: 'A & B', author: 'C D' })).toBe(
			'https://www.goodreads.com/search?q=A%20%26%20B%20C%20D'
		);
	});

	it('does not leave a trailing space when the author is empty', () => {
		expect(goodreadsUrl({ title: 'Solo', author: '' })).toBe(
			'https://www.goodreads.com/search?q=Solo'
		);
	});
});
