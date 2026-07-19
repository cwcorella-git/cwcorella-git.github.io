import type { LibraryDoc, EditPayload } from './types';

export interface EditDraft {
	body: string;
	title: string;
	tags: string[];
}

export function computeCounts(body: string): { word_count: number; char_count: number } {
	const words = body.split(/\s+/).filter(Boolean);
	return { word_count: words.length, char_count: body.length };
}

export function docToDraft(doc: LibraryDoc): EditDraft {
	return {
		body: doc.body,
		title: doc.title,
		tags: [...doc.tags]
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
		!sameSet(draft.tags, doc.tags)
	);
}

export function draftToPayload(draft: EditDraft): EditPayload {
	return {
		body: draft.body,
		title: draft.title,
		tags: draft.tags
	};
}
