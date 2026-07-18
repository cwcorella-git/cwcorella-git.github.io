import type { LibraryDoc, EditPayload } from './types';

export interface EditDraft {
	body: string;
	title: string;
	tags: string[];
	needs_formatting: boolean;
}

export function computeCounts(body: string): { word_count: number; char_count: number } {
	const words = body.split(/\s+/).filter(Boolean);
	return { word_count: words.length, char_count: body.length };
}

export function docToDraft(doc: LibraryDoc): EditDraft {
	return {
		body: doc.body,
		title: doc.title,
		tags: [...doc.tags],
		needs_formatting: !!doc.needs_formatting
	};
}

function sameSet(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const s = new Set(a);
	return b.every((x) => s.has(x));
}

export function draftChanged(doc: LibraryDoc, draft: EditDraft): boolean {
	return (
		draft.body !== doc.body ||
		draft.title !== doc.title ||
		!!draft.needs_formatting !== !!doc.needs_formatting ||
		!sameSet(draft.tags, doc.tags)
	);
}

export function draftToPayload(draft: EditDraft): EditPayload {
	return {
		body: draft.body,
		title: draft.title,
		needs_formatting: draft.needs_formatting ? 1 : 0,
		tags: draft.tags
	};
}
