import type { DocListItem, ReadingItem, ReadingState } from './types';

/**
 * Pure rules for the reading-list buttons on a card (kept out of components for
 * the same reason as keyLogic.ts: components have no test harness here).
 *
 * `x` removes a document from the list. It is NEVER curation `delete`, and no
 * function here touches decision, visibility or tier.
 */

export type ReadingAction = 'mark-read' | 'mark-unread' | 'edit' | 'remove';

export interface ReadingButton {
	action: ReadingAction;
	label: string;
}

/** Which buttons a card shows. None for a document that is not on the list. */
export function readingButtons(state: ReadingState | undefined): ReadingButton[] {
	if (!state || !state.to_read) return [];
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
