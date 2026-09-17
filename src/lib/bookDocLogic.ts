// What a book's reader should show. Pure so the suite can catch regressions —
// in the component this gating had no test harness, the same reason library
// keyboard gating lives in `library/keyLogic.ts`.
//
// The security property: "a body exists but you may not read it" and "no body
// exists" MUST resolve to the same value. A visitor who can tell those apart
// learns what is in the private corpus. That is why `links` carries no field
// distinguishing them — it is not a convention to remember, it is unrepresentable.
import type { Book, BookDoc, BookLink } from '$lib/types';

export type BookDocView =
	| { kind: 'body'; doc: BookDoc }
	| { kind: 'links'; links: BookLink[] };

export function goodreadsUrl(book: Pick<Book, 'title' | 'author'>): string {
	const q = encodeURIComponent(`${book.title} ${book.author}`.trim());
	return `https://www.goodreads.com/search?q=${q}`;
}

/** Links to offer when there is no readable body. Never empty — falls back to a search. */
export function linksFor(book: Book): BookLink[] {
	return book.links?.length ? book.links : [{ name: 'Goodreads', url: goodreadsUrl(book) }];
}

export function resolveBookDoc(book: Book, isAdmin: boolean): BookDocView {
	const doc = book.doc;
	const readable = doc !== undefined && (doc.visibility === 'public' || isAdmin);
	// Single construction site for the non-readable case: withheld and absent
	// cannot drift apart into two branches that render differently.
	return readable ? { kind: 'body', doc: doc! } : { kind: 'links', links: linksFor(book) };
}
