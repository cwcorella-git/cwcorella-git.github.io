/**
 * Match previews for relevance results.
 *
 * `GET /documents?sort=relevance` returns a `snippet` per row: the passage of the
 * body that matched, with the matched words delimited by ASCII **STX and ETX**
 * (`\u0002` / `\u0003`) rather than `<mark>`. That choice is deliberate on the API
 * side -- a snippet is corpus body text, which is not trustworthy input, and the
 * reader renders through `{@html}`. (`renderMarkdown` now sanitises with
 * DOMPurify, but that covers the body, not this path.) Control characters cannot
 * occur in HTML and cannot be typed, so there is nothing to escape and nothing to
 * inject. This module turns them into data; the components turn the data into real
 * `<mark>` elements through Svelte's normal escaping.
 */

export const MARK_OPEN = '\u0002';
export const MARK_CLOSE = '\u0003';

export interface SnippetPart {
	text: string;
	hit: boolean;
}

/**
 * Split a server snippet into alternating plain and highlighted runs.
 *
 * Returns `[]` for "render nothing at all", which covers an absent field and --
 * the ruling that matters -- a snippet carrying no highlight. A relevance search
 * also returns title-only matches, and fts5's `snippet()` over the body column
 * hands those back the opening words of the body with no marks in them: a preview,
 * not a reason, and a line on every row that says nothing.
 *
 * The input is corpus text, so it is parsed defensively rather than trusted to be
 * balanced. An unpaired open runs to the end of the string (the words after it did
 * match, and dropping them would lose the only highlight on the row); a stray close
 * and a nested open are discarded. Nothing here throws.
 */
export function splitSnippet(snippet: string | null | undefined): SnippetPart[] {
	if (typeof snippet !== 'string' || snippet === '') return [];
	// No highlight means nothing worth a line. Checked before the walk so the
	// common title-only case costs one scan and no allocation.
	if (!snippet.includes(MARK_OPEN)) return [];

	const parts: SnippetPart[] = [];
	let run = '';
	let inside = false;
	const flush = (hit: boolean) => {
		if (run !== '') parts.push({ text: run, hit });
		run = '';
	};

	for (const ch of snippet) {
		if (ch === MARK_OPEN) {
			if (inside) continue; // already highlighting; a nested open adds nothing
			flush(false);
			inside = true;
		} else if (ch === MARK_CLOSE) {
			if (!inside) continue; // stray close, no run to end
			flush(true);
			inside = false;
		} else {
			run += ch;
		}
	}
	flush(inside);
	return parts;
}
