import type { Decision } from './types';

/**
 * What a keypress means in the reader. Decisions always auto-advance — that is
 * the point of the feature, so it is not a separate flag the caller can forget.
 */
export type TriageAction =
	| { kind: 'nav'; dir: 'prev' | 'next' }
	| { kind: 'decide'; decision: Decision }
	| { kind: 'mark'; flag: 'visibility' | 'needs_formatting' }
	| { kind: 'close' };

/** Structural subset of KeyboardEvent, so the mapping is testable without a DOM. */
/** Mirrors the reader's load state. Declared here so the mapping stays DOM-free. */
export type OpenDocStatus = 'idle' | 'loading' | 'error';

export interface KeyEventLike {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	/** Auto-repeat from a held key. Ignored for decisions, allowed for navigation. */
	repeat?: boolean;
}

export interface KeyContext {
	/** A document is mounted. False both when nothing is open and mid-first-load. */
	hasDoc: boolean;
	/** The reader's load state. Only 'idle' means the mounted doc is the current one. */
	status: OpenDocStatus;
	editMode: boolean;
	isTextTarget: boolean;
}

const DECISION_KEYS: Record<string, Decision> = {
	delete: 'delete',
	k: 'keep',
	h: 'hide'
};

const MARK_KEYS: Record<string, 'visibility' | 'needs_formatting'> = {
	p: 'visibility',
	f: 'needs_formatting'
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

	// The window listener is live for the whole library page, not just the
	// overlay. With no overlay open, nothing resolves — otherwise Delete/K/H
	// would curate documents while merely browsing the list. The overlay does
	// render during a first load (no doc yet), so that still counts as open.
	if (!ctx.hasDoc && ctx.status !== 'loading') return null;

	// Escape resolves BEFORE the guards: it must still cancel an edit and must
	// still work when focus sits in the tag input. Everything else resolves after.
	if (e.key === 'Escape') return { kind: 'close' };

	if (ctx.editMode || ctx.isTextTarget) return null;

	// Nav and decisions need a SETTLED document. openDocByIndex sets the new
	// index synchronously but leaves the previous doc mounted until the fetch
	// resolves (stale-while-revalidate), and the error state leaves it mounted
	// too. Acting in either window writes the OLD doc's id against the NEW
	// index — stamping a decision onto a row it doesn't belong to, silently.
	if (!ctx.hasDoc || ctx.status !== 'idle') return null;

	if (e.key === 'ArrowLeft') return { kind: 'nav', dir: 'prev' };
	if (e.key === 'ArrowRight') return { kind: 'nav', dir: 'next' };

	// Vertical keys are deliberately absent — they scroll the document body,
	// which is how documents get judged in the first place.

	// Auto-repeat (~30/s while held) would fire a decision AND a fetch per tick:
	// dozens of unintended curations, and at the last row advance no-ops so the
	// same doc gets toggled over and over. Navigation may repeat — holding an
	// arrow to scan is legitimate, which is why this sits below the arrows.
	if (e.repeat) return null;

	const decision = DECISION_KEYS[e.key.toLowerCase()];
	if (decision) return { kind: 'decide', decision };

	const flag = MARK_KEYS[e.key.toLowerCase()];
	if (flag) return { kind: 'mark', flag };

	return null;
}
