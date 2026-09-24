export interface BookDoc { file: string; visibility: 'public' | 'admin'; }
export interface JournalMeta { slug: string; title: string; date: string | null; sealed?: boolean; }
export interface BookLink { name: string; url: string; }
export interface Book {
	id: number;
	title: string;
	author: string;
	year: number | null;
	category: string;
	links?: BookLink[];
	notes?: string;
	doc?: BookDoc;
	read?: boolean;
	/** What kind of text this is, from where it was catalogued and corroborated
	 *  by the baked body's length. Regenerate with scripts/classify-book-types.mjs.
	 *  'unknown' is a real answer, not a gap to be filled in. */
	type?: BookType;
}
export type BookType = 'book' | 'article' | 'pamphlet' | 'unknown';
export interface LinkMeta {
	id: string;
	url: string;
	title: string;
	category: string;
	subcategory?: string;
	tags: string[];
	added: string;
	notes?: string;
	source?: '◇' | '○' | '□';
}
