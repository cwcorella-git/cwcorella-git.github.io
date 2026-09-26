import { defaultControls, RELEVANCE } from './libraryLogic';
import type { LibraryControls } from './libraryLogic';
import type { DecisionInput } from './types';

/**
 * The library's URLs. The page used to keep everything in memory: a document had
 * no address, so it could not be opened in a new tab, bookmarked or linked, and a
 * search was lost on reload.
 *
 *   /library?q=bolo&source=anarchist        the list, with its search and filters
 *   /library/anarchist/bolo-bolo?q=bolo     a document, over the list it came from
 *
 * A document is addressed by (source, slug): library.db has UNIQUE(source, slug)
 * and nothing edits a slug, so the address is stable across title edits. The
 * source is needed because a slug alone is not unique across sources.
 *
 * Pure: no DOM, no SvelteKit, so every mapping here is unit-tested.
 */

export const LIBRARY_PATH = '/library';

export interface DocAddress {
	source: string;
	slug: string;
}

export function docPath(doc: DocAddress): string {
	return `${LIBRARY_PATH}/${encodeURIComponent(doc.source)}/${encodeURIComponent(doc.slug)}`;
}

/** The document a path names, or null for the list (or anything else). */
export function parseDocPath(pathname: string): DocAddress | null {
	const m = /^\/library\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
	if (!m) return null;
	try {
		const source = decodeURIComponent(m[1]);
		const slug = decodeURIComponent(m[2]);
		return source && slug ? { source, slug } : null;
	} catch {
		return null; // malformed %-escape
	}
}

const SORTS = new Set(['title', 'author', 'publication_date', 'word_count', 'updated_at', RELEVANCE]);
const DECISIONS = new Set<DecisionInput>(['keep', 'hide', 'delete', 'undecided']);

/** A search is read best match first unless the URL says otherwise, as typing
 *  one in the box does (withSearchSort). So `/library?q=bolo` is best match. */
function defaultSort(q: string): string {
	return q === '' ? defaultControls().sort : RELEVANCE;
}

/** Controls -> query string ('' or '?…'). Defaults are left out, so the plain list is plain `/library`. */
export function controlsToSearch(c: LibraryControls): string {
	const d = defaultControls();
	const p = new URLSearchParams();
	if (c.q !== '') p.set('q', c.q);
	if (c.sort !== defaultSort(c.q)) p.set('sort', c.sort);
	if (c.dir !== d.dir) p.set('dir', c.dir);
	const f = c.filters;
	if (f.corpus?.source) p.set('source', f.corpus.source);
	if (f.corpus?.collection) p.set('collection', f.corpus.collection);
	if (f.language) p.set('language', f.language);
	for (const t of [...(f.tags ?? [])].sort()) p.append('tag', t);
	if (f.visibility) p.set('visibility', f.visibility);
	if (f.needs_formatting !== undefined) p.set('needs_formatting', String(f.needs_formatting));
	if (f.decision) p.set('decision', f.decision);
	if (c.view !== d.view) p.set('view', c.view);
	const s = p.toString();
	return s ? '?' + s : '';
}

/**
 * Query string -> controls. A URL is user input (typed, edited, stale), so every
 * value is checked, and anything unknown falls back to the default rather than
 * reaching the API as a 400 that would take the whole page down.
 */
export function searchToControls(params: URLSearchParams): LibraryControls {
	const c = defaultControls();
	c.q = (params.get('q') ?? '').trim();
	const sort = params.get('sort');
	c.sort = sort && SORTS.has(sort) ? sort : defaultSort(c.q);
	if (c.sort === RELEVANCE && c.q === '') c.sort = 'title'; // the API refuses relevance without q
	if (params.get('dir') === 'desc') c.dir = 'desc';
	if (params.get('view') === 'grid') c.view = 'grid';

	const source = params.get('source');
	const collection = params.get('collection');
	if (source) c.filters.corpus = collection ? { source, collection } : { source };
	const language = params.get('language');
	if (language) c.filters.language = language;
	const tags = params.getAll('tag').filter((t) => t !== '');
	if (tags.length) c.filters.tags = [...new Set(tags)];
	const visibility = params.get('visibility');
	if (visibility === 'public' || visibility === 'private') c.filters.visibility = visibility;
	const nf = params.get('needs_formatting');
	if (nf === '0' || nf === '1') c.filters.needs_formatting = Number(nf) as 0 | 1;
	const decision = params.get('decision') as DecisionInput | null;
	if (decision && DECISIONS.has(decision)) c.filters.decision = decision;
	return c;
}

/**
 * Whether a click should be left to the browser. A plain left click opens the
 * reader in place; anything else (middle click, Ctrl/Cmd/Shift/Alt + click) is
 * the browser's: new tab, new window, download. That is what makes a row a link.
 */
export function isBrowserClick(e: {
	button: number;
	ctrlKey: boolean;
	metaKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	defaultPrevented?: boolean;
}): boolean {
	return (
		e.defaultPrevented === true || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
	);
}
