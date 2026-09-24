// Matching src/lib/books.json against the library-api corpus. Shared by the
// report (match-library.mjs) and the exporter (export-library-docs.mjs) so the
// two cannot disagree about what matched — a second copy of this mapping is
// exactly how the library rail once scrolled to the wrong row.
//
// Must run on the workstation: reads library.db directly, because the HTTP API
// is CORS- and token-locked and irrelevant for a local batch job.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

export const DEFAULT_DB = process.env.LIBRARY_DB ?? '/data/library-api/library.db';

// Mirrors backend/sources.py FREE_LICENSES. Clearance comes from the document's
// own `license` column, NOT from its source — the source only decided what the
// backfill wrote there, and a per-document licence is allowed to override it.
export const FREE_LICENSES = new Set(['anti-copyright', 'free-distribution']);

const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'on', 'in', 'to', 'for']);

export function norm(s) {
	return (s ?? '')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[^a-z0-9']+/g, ' ')
		.replace(/'/g, '')
		.trim();
}

export const tokens = (s) => norm(s).split(' ').filter((t) => t && !STOP.has(t));

// Dice coefficient over character bigrams — tolerant of subtitle drift, unlike
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

// Titles that differ ONLY by a volume/part/book number are different works. Dice
// scores them ~0.98, so without this the matcher hands two volumes the same body.
// Seen for real: "The Third Revolution ... Volume 1" and "Volume 2" both claimed
// document 286.
const ORDINAL = /\b(?:vol|volume|part|book|no|number)\s*([0-9]+|[ivxlc]+)\b/i;
function ordinalOf(title) {
	const m = ORDINAL.exec(title ?? '');
	return m ? m[1].toLowerCase() : null;
}
function ordinalsConflict(a, b) {
	const x = ordinalOf(a), y = ordinalOf(b);
	return x !== null && y !== null && x !== y;
}

export function loadBooks(url = new URL('../../src/lib/books.json', import.meta.url)) {
	return JSON.parse(readFileSync(url, 'utf8'));
}

export function loadDocs(dbPath = DEFAULT_DB) {
	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		return db.prepare(
			'SELECT id, source, title, author, license, visibility, word_count, file_path ' +
			'FROM documents'
		).all();
	} finally {
		db.close();
	}
}

/**
 * @returns rows sorted by descending score. `clearance` is 'auto-allow' only when
 * the document's own licence permits republication.
 */
export function matchBooks(books, docs, { min = 0.88 } = {}) {
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
				if (ordinalsConflict(b.title, d.title)) continue;
				// A named author on BOTH sides that disagrees is disqualifying, not
				// merely uncorroborated. Title alone cannot separate two different
				// books with the same name, and the matcher was handing them the
				// same body: Madison 1945 and Creagh/Kuhn/Cohn 2009 both claimed
				// "Anarchism in the United States"; Prichard 2022 and Ward 1981 both
				// claimed "Anarchism: A Very Short Introduction"; and one
				// Philosophize This! episode was claimed by BOTH "The Revolt of the
				// Masses" and "The Road to Serfdom", at tier `exact`, because a
				// podcast about a book shares no author with it.
				//
				// Still not a gate when either side is silent -- that was the
				// original reasoning and it holds: many corpus rows have no author
				// at all, and books.json carries translators inline. Absence stays
				// permissive; contradiction does not.
				if (bln && d._ln && bln !== d._ln) continue;
				let score = d._k === bk ? 1 : dice(bt, d._t);
				if (score < min - 0.12) continue;
				if (bln && d._ln && bln === d._ln) score += 0.06;
				const better = !best || score > best.score ||
					// Ties are common (many exact title matches). Prefer a freely
					// licensed copy of the same text: no clearance queue.
					(score === best.score &&
						FREE_LICENSES.has(d.license) && !FREE_LICENSES.has(best.d.license));
				if (better) best = { d, score };
			}
		}
		if (!best || best.score < min) continue;

		const { d } = best;
		const score = Math.min(1, best.score);
		rows.push({
			bookId: b.id,
			bookTitle: b.title,
			docId: d.id,
			docTitle: d.title,
			source: d.source,
			license: d.license,
			words: d.word_count,
			visibility: d.visibility,
			tier: score >= 0.999 ? 'exact' : score >= 0.94 ? 'strong' : 'weak',
			clearance: FREE_LICENSES.has(d.license) ? 'auto-allow' : 'needs-review',
			score: Number(score.toFixed(3)),
			file: d.file_path
		});
	}

	rows.sort((a, b) => b.score - a.score);
	return rows;
}

/**
 * Rows safe to export. Drops any document claimed by more than one book: if the
 * matcher cannot say which book a body belongs to, publishing it under either
 * is a coin flip, and attaching the wrong text to a title is worse than
 * attaching none.
 */
export function exportable(rows) {
	const byDoc = new Map();
	for (const r of rows) byDoc.set(r.docId, (byDoc.get(r.docId) ?? 0) + 1);
	return rows.filter((r) => r.clearance === 'auto-allow' && byDoc.get(r.docId) === 1);
}

export function contested(rows) {
	const byDoc = new Map();
	for (const r of rows) byDoc.set(r.docId, (byDoc.get(r.docId) ?? 0) + 1);
	return rows.filter((r) => byDoc.get(r.docId) > 1);
}
