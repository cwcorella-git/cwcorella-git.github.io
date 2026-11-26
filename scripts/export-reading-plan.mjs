#!/usr/bin/env node
// Writes the reading-list import plan for library-api's scripts/import_reading.py.
// Read-only over books.json and library.db; writes only the plan file.
// Policy (docs/superpowers/specs/2026-11-25-reading-into-library.md section 3):
//   exact/strong and the doc is claimed by ONE book  -> attach (docId set)
//   weak, or the doc is shared by several books       -> stub, match only proposed
//   no match                                          -> stub
// Everything about a book is carried (title, author, year, category, type,
// tags, links, read) so nothing is lost either way.
//
//   node scripts/export-reading-plan.mjs [out.json] [--min 0.88]
import { writeFileSync } from 'node:fs';
import { loadBooks, loadDocs, matchBooks, contested } from './lib/match-books.mjs';

const argv = process.argv.slice(2);
const out = argv.find((a) => a.endsWith('.json')) ?? 'reading-plan.json';
const mi = argv.indexOf('--min');
const MIN = mi === -1 ? 0.88 : Number(argv[mi + 1]);

const books = loadBooks();
const rows = matchBooks(books, loadDocs(), { min: MIN });
const shared = new Set(contested(rows).map((r) => r.docId));
const byBook = new Map(rows.map((r) => [r.bookId, r]));

const items = books.map((b) => {
	const m = byBook.get(b.id);
	let match = 'none', docId = null, proposed = null;
	if (m) {
		if (m.tier !== 'weak' && !shared.has(m.docId)) { match = m.tier; docId = m.docId; }
		else { match = shared.has(m.docId) ? 'shared' : 'weak'; proposed = m.docId; }
	}
	return {
		legacy_id: String(b.id), title: b.title, author: b.author ?? null,
		year: b.year ?? null, category: b.category ?? null, type: b.type ?? null,
		tags: b.tags ?? null, links: b.links ?? [], read: Boolean(b.read),
		match, doc_id: docId, proposed_doc_id: proposed, score: m?.score ?? null,
		doc_title: m?.docTitle ?? null
	};
});
writeFileSync(out, JSON.stringify({ min: MIN, count: items.length, items }));
const tally = items.reduce((t, i) => (t[i.match] = (t[i.match] ?? 0) + 1, t), {});
console.log(out, items.length, tally);
