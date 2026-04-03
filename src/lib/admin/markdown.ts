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
	let html = marked(markdown, { renderer }) as string;
	// Convert <ann note="...">text</ann> to interactive hover-annotation spans.
	// The note attribute may contain HTML entities but not unescaped quotes.
	html = html.replace(/<ann\s+note="([^"]*)">([\s\S]*?)<\/ann>/g, (_, note, text) => {
		const escaped = note.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
		return `<span class="ann" data-note="${escaped}">${text}</span>`;
	});
	return html;
}
