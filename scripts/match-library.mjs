#!/usr/bin/env node
// Report-only. Matches src/lib/books.json against the library-api corpus and
// prints what a build-time full-text export WOULD cover. Writes nothing.
//
// Must run on the workstation — reads /data/library-api/library.db directly
// (the HTTP API is CORS/token-locked and irrelevant here).
//
//   node scripts/match-library.mjs [--tsv out.tsv] [--min 0.88]
//
// Licence policy (set 2026-09-17): sources whose corpora are free by policy are
// auto-allow; everything else is deny-until-cleared. See CLAUDE.md.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync } from 'node:fs';

const FREE_SOURCES = new Set(['anarchist', 'marxist']);
const DB = process.env.LIBRARY_DB ?? '/data/library-api/library.db';

const argv = process.argv.slice(2);
const arg = (f, d) => { const i = argv.indexOf(f); return i === -1 ? d : argv[i + 1]; };
const MIN = Number(arg('--min', '0.88'));
const TSV = arg('--tsv', null);

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'on', 'in', 'to', 'for']);

function norm(s) {
	return (s ?? '')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[^a-z0-9']+/g, ' ')
		.replace(/'/g, '')
		.trim();
}
const tokens = (s) => norm(s).split(' ').filter((t) => t && !STOP.has(t));
const key = (s) => tokens(s).join(' ');

// Dice coefficient over token bigrams — tolerant of subtitle drift, unlike
// plain edit distance on long titles.
function dice(a, b) {
	const bg = (t) => {
		const s = new Set();
		const j = t.join(' ');
		for (let i = 0; i < j.length - 1; i++) s.add(j.slice(i, i + 2));
		return s;
	};
	const A = bg(a), B = bg(b);
	if (!A.size || !B.size) return 0;
	let hit = 0;
	for (const g of A) if (B.has(g)) hit++;
	return (2 * hit) / (A.size + B.size);
}

function lastName(author) {
	const first = (author ?? '').split(/[,(]/)[0].trim();
	const parts = norm(first).split(' ').filter(Boolean);
	return parts.length ? parts[parts.length - 1] : '';
}

const books = JSON.parse(readFileSync(new URL('../src/lib/books.json', import.meta.url), 'utf8'));

const db = new DatabaseSync(DB, { readOnly: true });
const docs = db.prepare(
	'SELECT id, source, title, author, visibility, word_count, file_path FROM documents'
).all();
db.close();

// Bucket docs by first significant token so we compare ~hundreds, not 100k, per book.
const buckets = new Map();
for (const d of docs) {
	d._t = tokens(d.title);
	d._k = d._t.join(' ');
	d._ln = lastName(d.author);
	for (const t of new Set(d._t)) {
		if (!buckets.has(t)) buckets.set(t, []);
		buckets.get(t).push(d);
	}
}

const rows = [];
for (const b of books) {
	const bt = tokens(b.title);
	if (!bt.length) continue;
	const bk = bt.join(' ');
	const bln = lastName(b.author);

	const seen = new Set();
	let best = null;
	for (const t of new Set(bt)) {
		for (const d of buckets.get(t) ?? []) {
			if (seen.has(d.id)) continue;
			seen.add(d.id);
			let score = d._k === bk ? 1 : dice(bt, d._t);
			if (score < MIN - 0.12) continue;
			// Author agreement is corroboration, not a gate: the corpus has many
			// untitled-author rows and books.json carries translators inline.
			if (bln && d._ln && bln === d._ln) score += 0.06;
			// Ties are common (many exact title matches). Break them toward a
			// free-licence source: same text, no clearance queue.
			const better = !best || score > best.score ||
				(score === best.score && FREE_SOURCES.has(d.source) && !FREE_SOURCES.has(best.d.source));
			if (better) best = { d, score };
		}
	}
	if (!best || best.score < MIN) continue;

	const { d } = best;
	const score = Math.min(1, best.score);
	rows.push({
		bookId: b.id,
		bookTitle: b.title,
		docId: d.id,
		docTitle: d.title,
		source: d.source,
		words: d.word_count,
		visibility: d.visibility,
		tier: score >= 0.999 ? 'exact' : score >= 0.94 ? 'strong' : 'weak',
		clearance: FREE_SOURCES.has(d.source) ? 'auto-allow' : 'needs-review',
		score: Number(score.toFixed(3)),
		file: d.file_path
	});
}

rows.sort((a, b) => b.score - a.score);

const tally = (f) => rows.reduce((m, r) => (m[f(r)] = (m[f(r)] ?? 0) + 1, m), {});
const pct = (n) => ((n / books.length) * 100).toFixed(1);

console.log(`books: ${books.length}   corpus: ${docs.length}   threshold: ${MIN}`);
console.log(`matched: ${rows.length} (${pct(rows.length)}% of the reading list)\n`);
console.log('by tier:      ', tally((r) => r.tier));
console.log('by source:    ', tally((r) => r.source));
console.log('by clearance: ', tally((r) => r.clearance));

const allow = rows.filter((r) => r.clearance === 'auto-allow');
console.log(`\nfull text publishable today: ${allow.length}  (${pct(allow.length)}% of the list)`);
console.log(`held for review:             ${rows.length - allow.length}`);

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
