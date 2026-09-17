#!/usr/bin/env node
// Report-only. Matches src/lib/books.json against the library-api corpus and
// prints what a full-text export WOULD cover. Writes nothing but the optional
// --tsv report. The matching itself lives in lib/match-books.mjs, shared with
// export-library-docs.mjs so the two cannot disagree about what matched.
//
// Must run on the workstation — reads /data/library-api/library.db directly.
//
//   node scripts/match-library.mjs [--tsv out.tsv] [--min 0.88]
//
// Clearance comes from each document's `license` column (populated by
// library-api's scripts/backfill_license.py), not from its source.
import { writeFileSync } from 'node:fs';
import { loadBooks, loadDocs, matchBooks, exportable, contested } from './lib/match-books.mjs';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const MIN = Number(arg('--min', '0.88'));
const TSV = arg('--tsv', null);

const books = loadBooks();
const docs = loadDocs();
const rows = matchBooks(books, docs, { min: MIN });

const tally = (f) => rows.reduce((m, r) => (m[f(r)] = (m[f(r)] ?? 0) + 1, m), {});
const pct = (n) => ((n / books.length) * 100).toFixed(1);

console.log(`books: ${books.length}   corpus: ${docs.length}   threshold: ${MIN}`);
console.log(`matched: ${rows.length} (${pct(rows.length)}% of the reading list)\n`);
console.log('by tier:      ', tally((r) => r.tier));
console.log('by source:    ', tally((r) => r.source));
console.log('by licence:   ', tally((r) => r.license ?? '(none)'));
console.log('by clearance: ', tally((r) => r.clearance));

const ok = exportable(rows);
const dupes = contested(rows);
console.log(`\nexportable now: ${ok.length}  (${pct(ok.length)}% of the list)`);
console.log(`held for review: ${rows.filter((r) => r.clearance === 'needs-review').length}`);
if (dupes.length) {
	console.log(`\n${dupes.length} rows share a document with another book — excluded from export:`);
	for (const r of dupes) console.log(`  doc ${r.docId}  ${r.bookTitle.slice(0, 64)}`);
}

console.log('\ntop 25 matches:');
for (const r of rows.slice(0, 25)) {
	console.log(
		`  ${r.score.toFixed(3)} ${r.tier.padEnd(6)} ${r.clearance.padEnd(12)} ` +
		`${r.source.padEnd(9)} ${String(r.words).padStart(6)}w  ${r.bookTitle.slice(0, 58)}`
	);
}

if (TSV) {
	const cols = Object.keys(rows[0] ?? { bookId: 0 });
	writeFileSync(TSV, [cols.join('\t'), ...rows.map((r) => cols.map((c) => r[c]).join('\t'))].join('\n'));
	console.log(`\nwrote ${rows.length} rows → ${TSV}`);
}
