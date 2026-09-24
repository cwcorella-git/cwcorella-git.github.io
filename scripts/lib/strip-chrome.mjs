/**
 * Chrome-stripping for scraped bodies.
 *
 * Five of the 23 individually-open texts are web scrapes, and they carry the
 * reader-mode furniture of the page they came off: a bare domain link above the
 * title, an estimated reading time, and `[Image: _page_N_Picture_M.jpeg]`
 * placeholders left by the PDF/HTML converter where a picture used to be. None
 * of that is the text. All of it renders as body content in the reader.
 *
 * What this deliberately does NOT delete is the source link. A scrape's only
 * record of its own provenance is that first line — the corpus row has a NULL
 * source_url for every one of these — so deleting it would destroy the one
 * thing that makes the licence question answerable later. It is moved to the
 * foot of the document as an attribution line instead. Chrome is furniture;
 * where a text came from is not furniture.
 *
 * Idempotent: running it on an already-stripped body is a no-op.
 */

const READING_TIME = /^\s*\d+\s*[–—-]\s*\d+\s+minutes\s*$/;
const IMAGE_PLACEHOLDER = /^\s*#{0,6}\s*\[Image:\s*_page_\d+_(?:Picture|Figure|Table)_\d+\.[a-z]+\]\s*$/i;
const LEADING_DOMAIN = /^\s*#{0,6}\s*\[([a-z0-9.-]+\.[a-z]{2,})\]\((https?:\/\/[^)]+)\)\s*$/i;
const ATTRIBUTION = /^Source: \[/;

export function stripChrome(body) {
	const lines = body.split('\n');
	const removed = [];
	let source = null;

	// The domain line is only chrome when it is the FIRST non-empty line. The
	// same shape further down is a citation inside the prose.
	for (let i = 0; i < lines.length; i++) {
		if (!lines[i].trim()) continue;
		const m = lines[i].match(LEADING_DOMAIN);
		if (m) { source = { domain: m[1], url: m[2] }; lines[i] = null; removed.push(`source line (${m[1]}) → moved to footer`); }
		break;
	}

	for (let i = 0; i < lines.length; i++) {
		if (lines[i] === null) continue;
		if (READING_TIME.test(lines[i])) { removed.push(`reading time: ${lines[i].trim()}`); lines[i] = null; continue; }
		if (IMAGE_PLACEHOLDER.test(lines[i])) { removed.push(`image placeholder: ${lines[i].trim()}`); lines[i] = null; }
	}

	let out = lines.filter((l) => l !== null).join('\n');
	// Collapse the runs of blank lines the deletions leave behind, but never
	// join two paragraphs that were already adjacent.
	out = out.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');

	if (source && !out.split('\n').some((l) => ATTRIBUTION.test(l))) {
		out = `${out.replace(/\s+$/, '')}\n\n---\n\nSource: [${source.domain}](${source.url})\n`;
	}
	return { text: out, removed };
}
