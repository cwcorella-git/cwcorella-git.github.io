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
}

export interface LibraryQuery {
	sort?: string;
	dir?: 'asc' | 'desc';
	cursor?: string | null;
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string;
	visibility?: string;
	needs_formatting?: 0 | 1;
	limit?: number;
}

export interface ListResponse {
	items: DocListItem[];
	next_cursor: string | null;
	total: number;
}
