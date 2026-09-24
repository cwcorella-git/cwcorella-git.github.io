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
import { stripChrome } from './lib/strip-chrome.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BOOKS_JSON = join(HERE, '..', 'src', 'lib', 'books.json');
const OUT_DIR = join(HERE, '..', 'static', 'docs', 'public');
const BODIES = process.env.LIBRARY_BODIES ?? '/data/library-api/bodies';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const confirm = argv.includes('--confirm');
const dryRun = argv.includes('--dry-run');
// Admin lane. A text can be restricted and still be yours to read: every
// library-api endpoint is bearer-auth'd, so a licence denial is a statement
// about REPUBLISHING, not about access. --admin stages such a body as
// plaintext in .admin-stage/ (gitignored, never served) for encrypt-doc.mjs to
// turn into static/docs/private/<name>.enc. Nothing on this path can reach
// static/docs/public/, which is why it may bypass the licence and provenance
// gates that govern the public lane.
const forceLarge = argv.includes('--force-large');
const adminIds = new Set((arg('--admin', '') || '').split(',').map((x) => Number(x.trim())).filter(Boolean));
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

// Provenance gate. The length gate is a proxy; this is the real question, and
// the answer is usually printed in the body's own frontmatter. theanarchistlibrary
// asserts anti-copyright site-wide, but it hosts material it has no standing to
// relicense — measured 2026-09-24, 244 of its 24,594 bodies name a commercial
// publisher or a piracy host in their OWN source_url/notes, not in a
// bibliography. Five had already been republished as plaintext on the public
// site: a Wiley-Blackwell encyclopedia entry (3,585w), three Palgrave Handbook
// chapters, and a Bataille translation whose source_url is a Sci-Hub link
// wrapping JSTOR. Every one sat far under the 40k gate, because an encyclopedia
// chapter is short and commercial — exactly the hole a length proxy leaves.
// This fails in the safe direction too: a genuinely free text that merely cites
// Routledge in its provenance line is withheld for a human call, not published.
const PROVENANCE_DENY = /palgrave|wiley|routledge|springer|university press|univ\. press|encyclopedia of|sci-?hub|libgen|jstor|macmillan|verso books|duke university/i;

/** The frontmatter fields that claim where the text CAME FROM. A publisher named
 *  anywhere else in the file is a citation, which is not a provenance claim. */
function provenanceClaim(body) {
	if (!body.startsWith('---')) return null;
	const end = body.indexOf('\n---', 3);
	const fm = body.slice(3, end === -1 ? 4000 : end);
	const lines = fm.split('\n');
	const out = [];
	let inField = false;
	for (const line of lines) {
		if (/^\s*(source_url|notes|publisher)\s*:/.test(line)) { inField = true; out.push(line); continue; }
		if (inField && /^(\s{2,}|\t)/.test(line)) { out.push(line); continue; }
		inField = false;
	}
	const joined = out.join(' ');
	const m = joined.match(PROVENANCE_DENY);
	return m ? m[0] : null;
}

/** Matches the existing convention in static/docs/public: `<bookId>-<slug>`. */
function docName(book) {
	const slug = norm(book.title).split(' ').filter(Boolean).slice(0, 8).join('-');
	return `${book.id}-${slug || 'untitled'}`;
}

const books = loadBooks();
// Reading 100k rows out of a 3.9 GB library.db takes ~30s, almost all of it
// disk I/O rather than CPU. Say so: silence here is indistinguishable from a
// hang, and the step before this one prints instantly, which makes the contrast
// look like a crash. stderr, so piping stdout stays clean.
process.stderr.write('  reading library.db (100k rows, ~30s)… ');
const t0 = Date.now();
const docs = loadDocs();
process.stderr.write(`${docs.length.toLocaleString()} docs in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
const rows = matchBooks(books, docs);
const STAGE_DIR = join(HERE, '..', '.admin-stage');
const ok = exportable(rows);
const byId = new Map(books.map((b) => [b.id, b]));

if (adminIds.size) {
	const staged = [];
	for (const r of rows) {
		if (!adminIds.has(r.bookId)) continue;
		const book = byId.get(r.bookId);
		if (!book) { console.log(`  no book ${r.bookId}`); continue; }
		if (book.doc) { console.log(`  skip ${r.bookId} — already has a doc (${book.doc.visibility})`); continue; }
		const src = join(BODIES, r.file);
		if (!existsSync(src)) { console.log(`  skip ${r.bookId} — body file missing`); continue; }
		staged.push({ r, book, src, name: docName(book) });
	}
	// Size cap. The admin lane bypasses the licence and provenance gates because
	// nothing on it reaches a public surface — but it must not bypass the length
	// gate, which is about the REPO, not about licence. An .enc body is committed
	// plaintext-sized-plus-overhead into a static site served from git, and the
	// first test run staged a 108,034-word body without complaint. Same 40k rule
	// as the public lane, overridable per-run because a deliberate big text is a
	// real case and an accidental one is not.
	const oversize = staged.filter((p) => p.r.words > MAX_WORDS);
	if (oversize.length && !forceLarge) {
		for (const p of oversize) {
			console.error(`  refusing ${p.name}: ${p.r.words.toLocaleString()} words > ${MAX_WORDS.toLocaleString()}`);
		}
		console.error(`\n  ${oversize.length} body/ies over the cap. Re-run with --force-large to stage them anyway,`);
		console.error('  or with a higher --max-words. Nothing was staged.');
		process.exit(1);
	}
	for (const p of oversize) console.log(`  FORCED ${p.name}: ${p.r.words.toLocaleString()} words > ${MAX_WORDS.toLocaleString()}`);
	const missing = [...adminIds].filter((id) => !staged.some((s2) => s2.r.bookId === id));
	for (const p of staged) console.log(`  ${p.name}  (${p.r.words}w, ${p.r.license ?? 'no licence'}) → .admin-stage/`);
	if (missing.length) console.log(`  unmatched book ids: ${missing.join(', ')}`);
	if (!confirm) { console.log('\nDRY RUN — re-run with --confirm, then encrypt with scripts/encrypt-doc.mjs.'); process.exit(0); }
	mkdirSync(STAGE_DIR, { recursive: true });
	for (const p of staged) {
		const { text, removed } = stripChrome(readFileSync(p.src, 'utf8'));
		if (removed.length) console.log(`  stripped ${removed.length} chrome line(s) from ${p.name}`);
		writeFileSync(join(STAGE_DIR, `${p.name}.md`), text);
	}
	console.log(`\nstaged ${staged.length} body/ies → .admin-stage/ (gitignored).`);
	console.log('Encrypt them, which deletes the plaintext and attaches them as admin-only:');
	console.log(`  printf '%s' "$KEY" | node scripts/encrypt-doc.mjs --confirm ${staged.map((p) => p.name).join(' ')}`);
	process.exit(0);
}

const planned = [];
const skipped = [];
const gated = [];   // cleared by licence, withheld by the length gate
const held = [];    // cleared by licence, withheld because the body names its publisher
const liveClaims = []; // ALREADY published, and the body names a publisher — an audit, not a gate
for (const r of ok) {
	const book = byId.get(r.bookId);
	if (!book) continue;
	// Never clobber a doc that is already attached — those were placed by hand
	// and may have been edited since.
	// An attached doc is not re-examined for export, but it IS audited: the five
	// commercially-published bodies that prompted this gate were all already
	// attached, so a gate that only inspects new candidates would never have
	// found them.
	if (book.doc) {
		const src0 = join(BODIES, r.file);
		const claim0 = existsSync(src0) ? provenanceClaim(readFileSync(src0, 'utf8')) : null;
		if (claim0) liveClaims.push({ ...r, claim: claim0, doc: book.doc });
		skipped.push({ ...r, why: 'already has a doc' });
		continue;
	}
	if (r.words > MAX_WORDS) { gated.push(r); continue; }
	const src = join(BODIES, r.file);
	if (!existsSync(src)) { skipped.push({ ...r, why: 'body file missing' }); continue; }
	const claim = provenanceClaim(readFileSync(src, 'utf8'));
	if (claim) { held.push({ ...r, claim }); continue; }
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
console.log(`held (provenance — body names a publisher or piracy host): ${held.length}`);
for (const h of held) console.log(`  provenance ${h.bookId} — "${h.claim}": ${h.bookTitle.slice(0, 56)}`);
if (liveClaims.length) {
	console.log(`\nALREADY PUBLISHED, and the body names a publisher or piracy host: ${liveClaims.length}`);
	for (const h of liveClaims) {
		console.log(`  ${h.doc.visibility.padEnd(6)} ${String(h.bookId).padStart(4)} "${h.claim}" ${String(h.words).padStart(6)}w  ${h.bookTitle.slice(0, 52)}`);
	}
}
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
	const { text: body, removed } = stripChrome(readFileSync(p.src, 'utf8'));
	if (removed.length) console.log(`  stripped ${removed.length} chrome line(s) from ${p.name}`);
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
