#!/usr/bin/env node
// Adds `type` to each row of src/lib/books.json: book | article | pamphlet |
// unknown. Idempotent — rerun it after books.json changes.
//
//   node scripts/classify-book-types.mjs [--apply]
//
// Type is derived from where the entry was catalogued. Goodreads, Open Library
// and Anna's Archive index books; the anarchist and marxist libraries mostly
// host essays and pamphlets; a magazine or journal domain is an article.
//
// Where the entry already carries a `doc`, the held text's length corroborates
// or overrules the catalogue: a 40,000-word text is a book whoever listed it,
// and something catalogued as a book that runs to 2,000 words is an article —
// usually an excerpt or a review catalogued under the work it discusses.
//
// `unknown` is a real answer and is left alone. Guessing a bucket for the ~30
// entries whose host says nothing would make the field look more reliable than
// it is, and this field exists to be filtered on.
//
// It does NOT touch `category`. Those ~90 values are muddled upstream and
// re-deriving them here would launder that muddle into something authoritative.
import { readFileSync, writeFileSync } from 'node:fs';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const BOOKS = new URL('../src/lib/books.json', import.meta.url);
const DOCS = new URL('../static/docs/public/', import.meta.url);

const BOOK_CATALOGS = new Set(['goodreads.com', 'openlibrary.org',
	'annas-archive.org', 'dl.booksee.org', 'api.pageplace.de',
	'files.addictbooks.com', 'library.uniteddiversity.coop']);
const PAMPHLET_HOSTS = new Set(['theanarchistlibrary.org', 'en.theanarchistlibrary.org',
	'usa.anarchistlibraries.net', 'libcom.org', 'files.libcom.org', 'marxists.org',
	'files.sproutdistro.com', 'solidaritylibrary.com', 'anarchozoe.com',
	'seditionist.uk', 'monoskop.org']);
const ARTICLE_HOSTS = new Set(['southsideweekly.com', 'dissentmagazine.org', 'nas.org',
	'politicaleconomyproject.org', 'threadings.io', 'nonviolent-conflict.org',
	'invisiblehistory.org', 'journals.sagepub.com', 'gnu.org']);
// Internet Archive item pages and their per-item CDN nodes.
const ARCHIVE_ORG = /(^|\.)archive\.org$/;

const BOOK_WORDS = 40_000;
const ARTICLE_WORDS = 7_500;

const hostsOf = (b) => new Set((b.links ?? []).flatMap((l) => {
	try { return [new URL(l.url).hostname.replace(/^www\./, '')]; } catch { return []; }
}));

// Word count of the baked text, when there is one. Cheap and approximate: this
// only has to separate a pamphlet from a book, not report a statistic.
function wordsOf(book) {
	if (!book.doc?.file) return 0;
	// Private docs are encrypted at rest, so only public bodies can be measured;
	// a private one falls back to the catalogue, which is the honest answer.
	try {
		const p = join(DOCS.pathname, book.doc.file + '.md');
		if (!statSync(p).isFile()) return 0;
		return readFileSync(p, 'utf8').split(/\s+/).length;
	} catch {
		return 0;
	}
}

function typeOf(book) {
	const h = hostsOf(book);
	const has = (set) => [...h].some((x) => set.has(x));
	let guess = 'unknown';
	if (has(BOOK_CATALOGS) || [...h].some((x) => ARCHIVE_ORG.test(x))) guess = 'book';
	else if (has(ARTICLE_HOSTS)) guess = 'article';
	else if (has(PAMPHLET_HOSTS)) guess = 'pamphlet';

	const words = wordsOf(book);
	if (!words) return guess;
	if (words >= BOOK_WORDS) return 'book';
	if (guess === 'book' && words < ARTICLE_WORDS) return 'article';
	if (guess === 'unknown') {
		return words >= BOOK_WORDS ? 'book' : words < ARTICLE_WORDS ? 'article' : 'pamphlet';
	}
	return guess;
}

const apply = process.argv.includes('--apply');
const books = JSON.parse(readFileSync(BOOKS, 'utf8'));
const tally = {};
for (const b of books) {
	b.type = typeOf(b);
	tally[b.type] = (tally[b.type] ?? 0) + 1;
}
console.log(`${books.length} books:`, tally);
if (!apply) { console.log('\n[dry-run] nothing written. Pass --apply.'); process.exit(0); }
writeFileSync(BOOKS, JSON.stringify(books));
console.log('wrote src/lib/books.json');
