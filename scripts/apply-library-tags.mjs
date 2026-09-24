#!/usr/bin/env node
// Copy each matched book's tags down from the library corpus into books.json.
//
// Must run on the workstation -- reads /data/library-api/library.db directly,
// same as match-library.mjs, and reuses that matcher rather than introducing a
// second opinion about what matches what.
//
//   node scripts/apply-library-tags.mjs            # report only
//   node scripts/apply-library-tags.mjs --apply    # write src/lib/books.json
//
// Tags are taken verbatim from `document_tags`. Nothing is inferred from the
// text and nothing is invented: a book with no matched document, or a matched
// document with no tags, simply gets no `tags` field. An absent field means
// "not catalogued", which is the honest answer -- an empty array would claim
// the corpus was consulted and found nothing to say.
//
// Unlike the doc bodies, a tag is metadata about a text, not the text itself,
// so this runs on every match regardless of licence clearance or the length
// gate. Tagging a book you may not republish is not republishing it.
import { readFileSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { loadBooks, loadDocs, matchBooks, DEFAULT_DB } from './lib/match-books.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const MIN = Number((argv.indexOf('--min') > -1 ? argv[argv.indexOf('--min') + 1] : null) ?? '0.88');

const BOOKS_URL = new URL('../src/lib/books.json', import.meta.url);

function tagsByDoc(docIds) {
	if (!docIds.length) return new Map();
	const db = new DatabaseSync(DEFAULT_DB, { readOnly: true });
	try {
		const rows = db.prepare(
			`SELECT dt.document_id AS id, t.name AS name
			   FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
			  WHERE dt.document_id IN (${docIds.map(() => '?').join(',')})`
		).all(...docIds);
		const m = new Map();
		for (const { id, name } of rows) {
			if (!m.has(id)) m.set(id, []);
			m.get(id).push(name);
		}
		// Sorted so a re-run produces an identical file and the diff stays readable.
		for (const v of m.values()) v.sort();
		return m;
	} finally {
		db.close();
	}
}

const books = loadBooks(BOOKS_URL);
const rows = matchBooks(books, loadDocs(), { min: MIN });

// One document can match two books (the reading list has duplicate entries).
// That is fine for tags -- both copies describe the same text -- so unlike the
// body export there is nothing to exclude here.
const byBook = new Map();
for (const r of rows) if (!byBook.has(String(r.bookId))) byBook.set(String(r.bookId), r);

const tags = tagsByDoc([...new Set(rows.map((r) => Number(r.docId)))]);

let added = 0, changed = 0, unchanged = 0, noTags = 0;
const out = books.map((b) => {
	const r = byBook.get(String(b.id));
	if (!r) return b;
	const t = tags.get(Number(r.docId));
	if (!t?.length) { noTags++; return b; }
	const before = JSON.stringify(b.tags ?? null);
	if (before === JSON.stringify(t)) { unchanged++; return b; }
	if (b.tags) changed++; else added++;
	return { ...b, tags: t };
});

const covered = added + changed + unchanged;
console.log(`books: ${books.length}   matched: ${byBook.size}   threshold: ${MIN}`);
console.log(`tagged: ${covered}  (new ${added}, updated ${changed}, already correct ${unchanged})`);
console.log(`matched but the corpus has no tags for them: ${noTags}`);
console.log(`untouched (no match): ${books.length - byBook.size}`);

const freq = new Map();
for (const b of out) for (const t of b.tags ?? []) freq.set(t, (freq.get(t) ?? 0) + 1);
console.log(`\ndistinct tags landing in books.json: ${freq.size}`);
console.log('top 20:', [...freq].sort((a, b) => b[1] - a[1]).slice(0, 20)
	.map(([t, n]) => `${t}(${n})`).join(' '));

if (!APPLY) {
	console.log('\nreport only -- pass --apply to write src/lib/books.json');
} else {
	// Minified, matching the file's existing shape; the repo has never stored it pretty.
	writeFileSync(BOOKS_URL, JSON.stringify(out));
	console.log(`\nwrote ${BOOKS_URL.pathname}`);
}
