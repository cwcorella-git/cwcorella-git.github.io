#!/usr/bin/env node
// Bakes cleared library bodies into static/docs/public/ and points books.json
// at them, so the reading list can show full text without any public page
// gaining a runtime dependency on library-api (which is token- and CORS-locked
// to the production domain — see CLAUDE.md, "the one acknowledged exception").
//
// Must run on the workstation: reads library.db and bodies/ directly.
//
//   node scripts/export-library-docs.mjs --dry-run
//   node scripts/export-library-docs.mjs --confirm
//
// Only exports documents whose own `license` permits republication. A licence
// says a text MAY be republished, never that it must be; nothing here decides
// visibility for anything already carrying a doc.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks, loadDocs, matchBooks, exportable, contested, norm } from './lib/match-books.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOKS_JSON = join(HERE, '..', 'src', 'lib', 'books.json');
const OUT_DIR = join(HERE, '..', 'static', 'docs', 'public');
const BODIES = process.env.LIBRARY_BODIES ?? '/data/library-api/bodies';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const confirm = argv.includes('--confirm');
const dryRun = argv.includes('--dry-run');
if (confirm === dryRun) {
	console.error('pass exactly one of --dry-run / --confirm');
	process.exit(2);
}

// Length gate. The per-source licence is a corpus-policy assertion, and it is
// least reliable exactly where the stakes are highest: theanarchistlibrary hosts
// book-length works by living authors on commercial presses, which it has no
// standing to relicense. Short-form material there — essays, pamphlets, talks —
// is overwhelmingly written for free circulation, so the assertion holds.
// Length is a weak proxy for licence, but it is the one that correlates, and it
// fails in the safe direction: a free book is withheld, not a restricted one
// published. The same 40k rule governs the user source. Raise it only per-title.
const MAX_WORDS = Number(arg('--max-words', '40000'));

/** Matches the existing convention in static/docs/public: `<bookId>-<slug>`. */
function docName(book) {
	const slug = norm(book.title).split(' ').filter(Boolean).slice(0, 8).join('-');
	return `${book.id}-${slug || 'untitled'}`;
}

const books = loadBooks();
const rows = matchBooks(books, loadDocs());
const ok = exportable(rows);
const byId = new Map(books.map((b) => [b.id, b]));

const planned = [];
const skipped = [];
const gated = [];   // cleared by licence, withheld by the length gate
for (const r of ok) {
	const book = byId.get(r.bookId);
	if (!book) continue;
	// Never clobber a doc that is already attached — those were placed by hand
	// and may have been edited since.
	if (book.doc) { skipped.push({ ...r, why: 'already has a doc' }); continue; }
	if (r.words > MAX_WORDS) { gated.push(r); continue; }
	const src = join(BODIES, r.file);
	if (!existsSync(src)) { skipped.push({ ...r, why: 'body file missing' }); continue; }
	planned.push({ ...r, book, src, name: docName(book) });
}

// Two books cannot share an output filename; ids are unique, so this only fires
// if docName ever stops including the id.
const names = new Set();
for (const p of planned) {
	if (names.has(p.name)) throw new Error(`duplicate output name: ${p.name}`);
	names.add(p.name);
}

console.log(`matched ${rows.length}, exportable ${ok.length}, to write ${planned.length}`);
console.log(`held (licence not cleared): ${rows.filter((r) => r.clearance === 'needs-review').length}`);
console.log(`held (over the ${MAX_WORDS}w gate): ${gated.length}`);
const dupes = contested(rows);
if (dupes.length) console.log(`excluded (document claimed by >1 book): ${dupes.length}`);
for (const s of skipped) console.log(`  skip ${s.bookId} — ${s.why}: ${s.bookTitle.slice(0, 56)}`);

if (!confirm) {
	for (const p of planned.slice(0, 15)) {
		console.log(`  would write ${p.name}.md  (${p.words}w, ${p.license})`);
	}
	if (planned.length > 15) console.log(`  … and ${planned.length - 15} more`);
	console.log('\nDRY RUN — re-run with --confirm to apply.');
	process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });
let written = 0;
const attached = [];
for (const p of planned) {
	const body = readFileSync(p.src, 'utf8');
	const out = join(OUT_DIR, `${p.name}.md`);
	try {
		writeFileSync(out, body);
	} catch (e) {
		// Leave books.json untouched for this entry rather than pointing it at a
		// file that is not there — a dangling doc renders as a load error, which
		// is strictly worse than the link-out.
		console.error(`  FAILED ${p.name}: ${e.message}`);
		if (existsSync(out)) rmSync(out);
		continue;
	}
	p.book.doc = { file: p.name, visibility: 'public' };
	attached.push(p);
	written++;
}

// Byte-identical to how the admin write queue serializes it
// (state.svelte.ts: JSON.stringify(payload.books)) — minified, no trailing
// newline. Anything else churns the whole file on the next in-browser sync.
writeFileSync(BOOKS_JSON, JSON.stringify(books));
console.log(`wrote ${written} documents → static/docs/public/`);
console.log(`attached doc to ${attached.length} books in books.json`);
