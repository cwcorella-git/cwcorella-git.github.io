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
}
export interface LinkMeta {
	id: string;
	url: string;
	title: string;
	category: string;
	tags: string[];
	added: string;
	notes?: string;
	source?: '◇' | '○' | '□';
}
