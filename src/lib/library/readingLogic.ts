import type { DocListItem, ReadingItem, ReadingLink, ReadingPatch, ReadingState } from './types';
import { cleanLinks } from './metaLogic';

/**
 * Pure rules for the reading-list buttons on a card (kept out of components for
 * the same reason as keyLogic.ts: components have no test harness here).
 *
 * `x` removes a document from the list. It is NEVER curation `delete`, and no
 * function here touches decision, visibility or tier.
 */

export type ReadingAction = 'add' | 'mark-read' | 'mark-unread' | 'edit' | 'remove';

export interface ReadingButton {
	action: ReadingAction;
	label: string;
}

/** Which buttons a card shows. A document that is not on the list gets only
 *  `+ to read`, and only where `canAdd` (the operator, against an API that has
 *  the reading list); otherwise none. */
export function readingButtons(state: ReadingState | undefined, canAdd = false): ReadingButton[] {
	if (!state || !state.to_read) return canAdd ? [{ action: 'add', label: '+ to read' }] : [];
	return [
		state.read
			? { action: 'mark-unread', label: 'unread' }
			: { action: 'mark-read', label: 'mark read' },
		{ action: 'edit', label: 'edit' },
		{ action: 'remove', label: 'x' }
	];
}

/** A card is highlighted while it is on the list and still unread. Read items dim. */
export function readingTone(state: ReadingState | undefined): 'to-read' | 'read' | null {
	if (!state || !state.to_read) return null;
	return state.read ? 'read' : 'to-read';
}

/** The state after an action, applied optimistically; the API call follows. */
export function applyReadingAction(state: ReadingState, action: ReadingAction): ReadingState {
	switch (action) {
		case 'add':
			return { ...state, to_read: true };
		case 'mark-read':
			return { ...state, read: true };
		case 'mark-unread':
			return { ...state, read: false };
		case 'remove':
			return { ...state, to_read: false };
		default:
			return state;
	}
}

/** The PUT /reading body for an action, or null when the action is not a write. */
export function actionToPatch(action: ReadingAction): { read?: boolean; to_read?: boolean } | null {
	if (action === 'add') return { to_read: true };
	if (action === 'mark-read') return { read: true };
	if (action === 'mark-unread') return { read: false };
	if (action === 'remove') return { to_read: false, read: false };
	return null;
}

/** Stub rows still on the list for a filter; stubs have no text and no address. */
export function stubsFor(items: ReadingItem[], filter: 'to_read' | 'read'): ReadingItem[] {
	return items.filter((i) => i.stub && (filter === 'read' ? i.read : i.to_read && !i.read));
}

export function isOnList(item: DocListItem): boolean {
	return Boolean(item.reading?.to_read);
}

/** The card state for a reading row the API returned (POST/PUT /reading). */
export function itemToState(item: ReadingItem): ReadingState {
	return { item_id: item.item_id, to_read: Boolean(item.to_read), read: item.read, links: item.links };
}

/** Editable fields of a stub, as text so inputs bind to them directly. */
export interface StubDraft {
	title: string;
	author: string;
	year: string;
	category: string;
	links: ReadingLink[];
}

export function stubDraft(item: ReadingItem): StubDraft {
	return {
		title: item.title ?? '',
		author: item.author ?? '',
		year: item.year_hint == null ? '' : String(item.year_hint),
		category: item.category ?? '',
		links: item.links.map((l) => ({ ...l }))
	};
}

/** The PUT /reading body for a stub edit: only what changed, plus the problems that
 *  block saving. A stub must keep a title, a year is a whole number, and links are
 *  http(s) only. Emptying author or category sends '' (the API reads null as "leave
 *  alone"). Emptying the year is not offered: the API cannot clear a number. */
export function stubPatch(
	item: ReadingItem,
	d: StubDraft
): { patch: ReadingPatch; problems: string[] } {
	const patch: ReadingPatch = {};
	const problems: string[] = [];
	const title = d.title.trim();
	if (!title) problems.push('a title is required');
	else if (title !== (item.title ?? '')) patch.title = title;
	const author = d.author.trim();
	if (author !== (item.author ?? '')) patch.author = author;
	const category = d.category.trim();
	if (category !== (item.category ?? '')) patch.category = category;
	const y = d.year.trim();
	if (y === '') {
		if (item.year_hint != null) problems.push('a year cannot be cleared');
	} else if (!/^-?\d{1,4}$/.test(y)) problems.push('year must be a whole number');
	else if (Number(y) !== item.year_hint) patch.year_hint = Number(y);
	const { links, problems: lp } = cleanLinks(d.links);
	problems.push(...lp);
	if (JSON.stringify(links) !== JSON.stringify(item.links)) patch.links = links;
	return { patch, problems };
}

/** A stub row after a saved edit, from the API's answer. */
export function applyStubItem(items: ReadingItem[], saved: ReadingItem): ReadingItem[] {
	return items.map((i) => (i.item_id === saved.item_id ? saved : i));
}
