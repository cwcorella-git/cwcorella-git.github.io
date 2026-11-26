export type Decision = 'keep' | 'hide' | 'delete';
export type DecisionInput = Decision | 'undecided';

/** library-api's computed VG tier of a document (backend/tiers.py tier_of). */
export type VgTier = 'public' | 'reference';
/** The `tier=` filter values library-api accepts (query.tier_sql). */
export type TierFilter = 'public' | 'reference' | 'curated' | 'none';

export interface DocListItem {
	id: number;
	source: string;
	slug: string;
	title: string;
	author: string | null;
	publication_date: string | null;
	language: string;
	document_type: string;
	word_count: number;
	char_count: number;
	visibility: string;
	needs_formatting: boolean;
	updated_at: string;
	decision: Decision | null; // null = undecided
	tags: string[];
	edited?: boolean;
	// Only `sort=relevance` rows carry this, and an un-upgraded API omits it
	// entirely; `splitSnippet` then returns [] and no snippet line renders. The
	// matched words are delimited by ASCII STX/ETX, never markup — see
	// `snippetLogic.ts` for why, and never interpolate it as HTML.
	snippet?: string;
	// VG tier (R3 badge). Optional: an un-upgraded API omits it; null = not on VG.
	tier?: VgTier | null;
	// Operator only; absent when the doc is not on the reading list.
	reading?: ReadingState;
}

/** The reading-list state of a library document. Optional everywhere: an
 *  un-upgraded API omits it, and a non-operator never receives it. */
export interface ReadingState {
	item_id: number;
	to_read: boolean;
	read: boolean;
	links: ReadingLink[];
}
export interface ReadingLink { name: string; url: string }
/** `reading` filter: on the list and unread, or marked read. Absent = no filter. */
export type ReadingFilter = 'to_read' | 'read';

/** One reading-list row from GET /reading. doc_id null = a stub (links, no text). */
export interface ReadingItem {
	item_id: number;
	doc_id: number | null;
	legacy_id: string | null;
	title: string | null;
	author: string | null;
	year_hint: number | null;
	category: string | null;
	type_hint: string | null;
	tags: string | null; // JSON array, as stored
	to_read: number;
	read_at: string | null;
	read: boolean;
	stub: boolean;
	links: ReadingLink[];
}
export interface ReadingListResponse {
	total: number;
	items: ReadingItem[];
	counts: { to_read: number; read: number };
}
export interface ReadingPatch {
	to_read?: boolean;
	read?: boolean;
	title?: string;
	author?: string;
	year_hint?: number;
	category?: string;
	links?: ReadingLink[];
}
/** PUT /documents/{id}/meta. Unsent fields are left alone; `clear` resets named ones. */
export interface MetaPayload {
	title?: string;
	author?: string;
	publication_date?: string;
	date_precision?: 'day' | 'month' | 'year';
	document_type?: string;
	source_url?: string;
	clear?: string[];
}

export interface DocVersion {
	version_id: number;
	created_at: string;
	title: string | null;
}

export interface EditPayload {
	body: string;
	title?: string | null;
	needs_formatting?: number | null;
	tags: string[];
}

export interface LibraryDoc extends DocListItem {
	collections: string[];
	body: string;
	// Detail-only; optional because an un-upgraded API omits them.
	date_precision?: string | null;
	source_url?: string | null;
}

export interface FacetBucket {
	name: string;
	count: number;
	// Only collection buckets carry this: they are keyed (source, name) so a corpus
	// control can nest categories under their source. Optional — an un-upgraded API
	// omits it, and no other facet dimension has it.
	source?: string;
}

export interface Facets {
	languages: FacetBucket[];
	sources: FacetBucket[];
	collections: FacetBucket[];
	tags: FacetBucket[];
	// Optional: an un-upgraded API omits them, and the State dropdown then renders
	// without counts rather than crashing. needs_formatting names are the STRINGS
	// '0' and '1' — every bucket name is a string.
	visibility?: FacetBucket[];
	needs_formatting?: FacetBucket[];
	// Operator only (an older API omits it): counts for the reading filter.
	reading?: { to_read: number; read: number };
	// Optional: an older backend won't send it. Drives the date rail's decade buckets.
	date_range?: {
		min_year: number | null;
		max_year: number | null;
		undated: number;
	};
}

/** The corpus axis: a collection is a category WITHIN a source, not a sibling of it. */
export interface CorpusFilter {
	source?: string;
	collection?: string;
}

export interface LibraryQuery {
	sort?: string;
	dir?: 'asc' | 'desc';
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string[];
	visibility?: string;
	needs_formatting?: 0 | 1;
	decision?: DecisionInput; // 'undecided' | 'keep' | 'hide' | 'delete'
	to_read?: 1;
	read?: 1;
	offset?: number;
	limit?: number;
}

export interface AnchorOffsetParams {
	sort: string;
	dir: 'asc' | 'desc';
	value: string;
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string[];
	visibility?: string;
	needs_formatting?: 0 | 1;
	decision?: DecisionInput;
	to_read?: 1;
	read?: 1;
}

export interface AnchorOffsetResponse {
	offset: number;
}

export interface ListResponse {
	items: DocListItem[];
	next_cursor: string | null;
	total: number;
}

export interface CurationStats {
	keep: number;
	hide: number;
	delete: number;
	decided: number;
	total: number;
	undecided: number;
}
