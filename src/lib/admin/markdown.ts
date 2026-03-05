import { marked, Renderer } from 'marked';

export interface TocEntry {
	level: 1 | 2 | 3;
	text: string;
	anchor: string;
}

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/[\s_]+/g, '-');
}

export function extractToc(markdown: string): TocEntry[] {
	const entries: TocEntry[] = [];
	const headingRe = /^(#{1,3})\s+(.+)$/gm;
	let match: RegExpExecArray | null;
	while ((match = headingRe.exec(markdown)) !== null) {
		const level = match[1].length as 1 | 2 | 3;
		const text = match[2].trim();
		entries.push({ level, text, anchor: slugify(text) });
	}
	return entries;
}

export function renderMarkdown(markdown: string): string {
	const renderer = new Renderer();
	renderer.heading = ({ text, depth }: { text: string; depth: number }) => {
		const anchor = slugify(text);
		return `<h${depth} id="${anchor}">${text}</h${depth}>\n`;
	};
	return marked(markdown, { renderer }) as string;
}
