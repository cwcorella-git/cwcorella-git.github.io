import type { TocEntry } from '$lib/admin/markdown';

export function tocNumber(entries: TocEntry[]): string[] {
	return entries.map((_, i) => String(i + 1));
}

export function condenseMeta(doc: {
	author: string | null;
	publication_date: string | null;
	language: string | null;
}): string {
	const parts: string[] = [];
	const author = doc.author?.trim();
	if (author && author !== '—') parts.push(author);
	if (doc.publication_date && doc.publication_date.length > 0) {
		parts.push(doc.publication_date.slice(0, 4));
	}
	const lang = doc.language?.trim();
	if (lang) parts.push(lang.toLowerCase());
	return parts.join(' · ');
}

export function activeLabel(
	entries: TocEntry[],
	numbers: string[],
	activeAnchor: string | null
): string | null {
	if (!activeAnchor) return null;
	const i = entries.findIndex((e) => e.anchor === activeAnchor);
	if (i === -1) return null;
	return `${numbers[i]}. ${entries[i].text}`;
}
