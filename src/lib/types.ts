export interface BookDoc { file: string; visibility: 'public' | 'admin'; }
export interface BookLinks { openlibrary?: string; anna?: string; goodreads?: string; }
export interface Book {
	id: number;
	title: string;
	author: string;
	year: number | null;
	category: string;
	links?: BookLinks;
	notes?: string;
	doc?: BookDoc;
}
