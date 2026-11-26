import type { LibraryDoc, MetaPayload, ReadingLink } from './types';

/** Document metadata the editor can change (PUT /documents/{id}/meta). */
export interface MetaDraft {
	author: string;
	publication_date: string;
	date_precision: '' | 'day' | 'month' | 'year';
	document_type: string;
	source_url: string;
}

export const DOC_TYPES = [
	'unknown', 'book', 'article', 'paper', 'reference', 'transcript'
] as const;

export function docToMetaDraft(doc: LibraryDoc): MetaDraft {
	return {
		author: doc.author ?? '',
		publication_date: doc.publication_date ?? '',
		date_precision: (doc.date_precision as MetaDraft['date_precision']) ?? '',
		document_type: doc.document_type ?? '',
		source_url: doc.source_url ?? ''
	};
}

/**
 * The PUT body for a draft: only fields that changed. A field emptied by the
 * operator goes in `clear` (the API leaves unsent fields alone and cannot
 * otherwise clear one). Returns null when nothing changed.
 */
export function metaPayload(before: MetaDraft, after: MetaDraft): MetaPayload | null {
	const out: MetaPayload = {};
	const clear: string[] = [];
	for (const k of Object.keys(before) as (keyof MetaDraft)[]) {
		const a = after[k].trim();
		if (a === before[k].trim()) continue;
		if (a === '') clear.push(k);
		else (out as Record<string, string>)[k] = a;
	}
	if (clear.length) out.clear = clear;
	return Object.keys(out).length ? out : null;
}

/** Reasons a draft cannot be saved; empty when fine. Mirrors the API's checks. */
export function metaProblems(d: MetaDraft): string[] {
	const p: string[] = [];
	if (d.publication_date && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(d.publication_date.trim()))
		p.push('date must be YYYY, YYYY-MM or YYYY-MM-DD');
	if (d.source_url && !/^https?:\/\//i.test(d.source_url.trim())) p.push('source URL must be http(s)');
	return p;
}

/** Links with blanks dropped; each must be http(s). Order is kept. */
export function cleanLinks(links: ReadingLink[]): { links: ReadingLink[]; problems: string[] } {
	const out: ReadingLink[] = [];
	const problems: string[] = [];
	for (const l of links) {
		const url = l.url.trim();
		if (!url && !l.name.trim()) continue;
		if (!/^https?:\/\//i.test(url)) { problems.push(`not an http(s) link: ${url || '(empty)'}`); continue; }
		out.push({ name: l.name.trim() || url, url });
	}
	return { links: out, problems };
}
