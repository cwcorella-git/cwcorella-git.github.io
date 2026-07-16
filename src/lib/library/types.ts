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
}

export interface LibraryDoc extends DocListItem {
	tags: string[];
	collections: string[];
	body: string;
}

export interface FacetBucket {
	name: string;
	count: number;
}

export interface Facets {
	languages: FacetBucket[];
	sources: FacetBucket[];
	collections: FacetBucket[];
	tags: FacetBucket[];
	// Optional: an older backend won't send it. Drives the date rail's decade buckets.
	date_range?: {
		min_year: number | null;
		max_year: number | null;
		undated: number;
	};
}

export interface LibraryQuery {
	sort?: string;
	dir?: 'asc' | 'desc';
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string;
	visibility?: string;
	needs_formatting?: 0 | 1;
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
	tag?: string;
	visibility?: string;
	needs_formatting?: 0 | 1;
}

export interface AnchorOffsetResponse {
	offset: number;
}

export interface ListResponse {
	items: DocListItem[];
	next_cursor: string | null;
	total: number;
}
