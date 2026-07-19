import type { Decision } from './types';

/**
 * What a keypress means in the reader. Decisions always auto-advance — that is
 * the point of the feature, so it is not a separate flag the caller can forget.
 */
export type TriageAction =
	| { kind: 'nav'; dir: 'prev' | 'next' }
	| { kind: 'decide'; decision: Decision }
	| { kind: 'close' };

/** Structural subset of KeyboardEvent, so the mapping is testable without a DOM. */
export interface KeyEventLike {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
}

export interface KeyContext {
	editMode: boolean;
	isTextTarget: boolean;
}

const DECISION_KEYS: Record<string, Decision> = {
	delete: 'delete',
	k: 'keep',
	h: 'hide'
};

/**
 * True when focus is somewhere text is being typed. Without this, typing "keep"
 * into the tag editor would curate three documents.
 */
export function isTextTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false;
	const el = target as { tagName?: unknown; isContentEditable?: unknown };
	if (el.isContentEditable === true) return true;
	const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function resolveKey(e: KeyEventLike, ctx: KeyContext): TriageAction | null {
	// Modifier combinations belong to the browser and the OS.
	if (e.ctrlKey || e.metaKey || e.altKey) return null;

	// Escape resolves BEFORE the guards: it must still cancel an edit and must
	// still work when focus sits in the tag input. Everything else resolves after.
	if (e.key === 'Escape') return { kind: 'close' };

	if (ctx.editMode || ctx.isTextTarget) return null;

	if (e.key === 'ArrowLeft') return { kind: 'nav', dir: 'prev' };
	if (e.key === 'ArrowRight') return { kind: 'nav', dir: 'next' };

	// Vertical keys are deliberately absent — they scroll the document body,
	// which is how documents get judged in the first place.

	const decision = DECISION_KEYS[e.key.toLowerCase()];
	if (decision) return { kind: 'decide', decision };

	return null;
}
