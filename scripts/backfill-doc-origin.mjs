#!/usr/bin/env node
// One-off (2026-10-11): mark books.json docs that are baked library-api bodies
// with `origin: 'library'` and their `source`, so BookView renders them through
// VG's pipeline (rulings R2) and leaves the operator's own docs on marked.
// export-library-docs.mjs sets both for every doc it bakes from now on.
//
// A doc counts as a library body only on evidence:
//   public (.md) — its text is found in the matched library body (a window from
//                  the middle of the baked file, whitespace-normalised; the bake
//                  strips chrome lines, so whole-file equality would miss).
//   admin (.enc) — unreadable without the key, so: its file name is exactly the
//                  name the bake would have given it (`<bookId>-<slug>`).
//
// Must run on the workstation: reads library.db and the bodies.
//   node scripts/backfill-doc-origin.mjs --dry-run
//   node scripts/backfill-doc-origin.mjs --confirm

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBooks, loadDocs, matchBooks, norm } from './lib/match-books.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOKS_JSON = join(HERE, '..', 'src', 'lib', 'books.json');
const PUBLIC_DIR = join(HERE, '..', 'static', 'docs', 'public');
const BODIES = process.env.LIBRARY_BODIES ?? '/data/library-api/bodies';
const confirm = process.argv.includes('--confirm');

// Same rule as export-library-docs.mjs docName().
function docName(book) {
	const slug = norm(book.title).split(' ').filter(Boolean).slice(0, 8).join('-');
	return `${book.id}-${slug || 'untitled'}`;
}

const squash = (s) => s.replace(/\s+/g, ' ').trim();

function textMatches(bakedPath, bodyPath) {
	if (!existsSync(bakedPath) || !existsSync(bodyPath)) return false;
	const baked = squash(readFileSync(bakedPath, 'utf8'));
	const body = squash(readFileSync(bodyPath, 'utf8'));
	if (baked.length < 200) return body.includes(baked);
	const mid = Math.floor(baked.length / 2);
	return body.includes(baked.slice(mid - 100, mid + 100));
}

const books = loadBooks();
const withDoc = books.filter((b) => b.doc && !b.doc.origin);
process.stderr.write(`${withDoc.length} docs without origin; reading library.db… `);
const rows = matchBooks(withDoc, loadDocs());
process.stderr.write('done\n');

const rowsByBook = new Map();
for (const r of rows) {
	if (!rowsByBook.has(r.bookId)) rowsByBook.set(r.bookId, []);
	rowsByBook.get(r.bookId).push(r);
}

const marked = [];
const unmatched = [];
for (const book of withDoc) {
	const candidates = rowsByBook.get(book.id) ?? [];
	let hit = null;
	for (const r of candidates) {
		const ok =
			book.doc.visibility === 'public'
				? textMatches(join(PUBLIC_DIR, `${book.doc.file}.md`), join(BODIES, r.file))
				: book.doc.file === docName(book);
		if (ok) { hit = r; break; }
	}
	if (hit) {
		marked.push({ book, r: hit });
	} else {
		unmatched.push(book);
	}
}

console.log(`library bodies: ${marked.length}`);
for (const { book, r } of marked.slice(0, 10)) console.log(`  ${book.doc.file}  ← ${r.source}/${r.file}`);
if (marked.length > 10) console.log(`  … and ${marked.length - 10} more`);
console.log(`left as the operator's own (no evidence of a library body): ${unmatched.length}`);
for (const b of unmatched) console.log(`  ${b.doc.file} (${b.doc.visibility})`);

if (!confirm) {
	console.log('\nDRY RUN — re-run with --confirm to write books.json.');
	process.exit(0);
}
for (const { book, r } of marked) {
	book.doc = { ...book.doc, origin: 'library', source: r.source };
}
// Byte-identical to state.svelte.ts's JSON.stringify(payload.books): minified,
// no trailing newline (CLAUDE.md invariant).
writeFileSync(BOOKS_JSON, JSON.stringify(books));
console.log(`wrote books.json (${marked.length} docs marked).`);
