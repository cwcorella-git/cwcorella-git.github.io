export type Decision = 'keep' | 'hide' | 'delete';
export type DecisionInput = Decision | 'undecided';

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
}

export interface LibraryDoc extends DocListItem {
	collections: string[];
	body: string;
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
