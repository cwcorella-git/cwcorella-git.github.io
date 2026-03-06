export interface BookDoc { file: string; visibility: 'public' | 'admin'; }
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
}
