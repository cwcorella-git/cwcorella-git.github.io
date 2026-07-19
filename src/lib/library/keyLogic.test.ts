import { describe, it, expect } from 'vitest';
import { resolveKey, isTextTarget } from './keyLogic';
import type { KeyContext } from './keyLogic';

const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({
	hasDoc: true,
	status: 'idle',
	editMode: false,
	isTextTarget: false,
	...over
});

describe('resolveKey — navigation', () => {
	it('maps ArrowRight to next', () => {
		expect(resolveKey({ key: 'ArrowRight' }, ctx())).toEqual({ kind: 'nav', dir: 'next' });
	});
	it('maps ArrowLeft to prev', () => {
		expect(resolveKey({ key: 'ArrowLeft' }, ctx())).toEqual({ kind: 'nav', dir: 'prev' });
	});
	it('leaves vertical scrolling keys unbound', () => {
		for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
			expect(resolveKey({ key }, ctx())).toBeNull();
		}
	});
});

describe('resolveKey — decisions', () => {
	it('maps Delete to the delete decision', () => {
		expect(resolveKey({ key: 'Delete' }, ctx())).toEqual({ kind: 'decide', decision: 'delete' });
	});
	it('maps k and K to keep', () => {
		expect(resolveKey({ key: 'k' }, ctx())).toEqual({ kind: 'decide', decision: 'keep' });
		expect(resolveKey({ key: 'K' }, ctx())).toEqual({ kind: 'decide', decision: 'keep' });
	});
	it('maps h and H to hide', () => {
		expect(resolveKey({ key: 'h' }, ctx())).toEqual({ kind: 'decide', decision: 'hide' });
		expect(resolveKey({ key: 'H' }, ctx())).toEqual({ kind: 'decide', decision: 'hide' });
	});
	it('does not bind Backspace', () => {
		expect(resolveKey({ key: 'Backspace' }, ctx())).toBeNull();
	});
});

describe('resolveKey — guards', () => {
	it('returns null for every bound key while editing', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Delete', 'k', 'h']) {
			expect(resolveKey({ key }, ctx({ editMode: true }))).toBeNull();
		}
	});
	it('returns null for every bound key while focused in a text field', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Delete', 'k', 'h']) {
			expect(resolveKey({ key }, ctx({ isTextTarget: true }))).toBeNull();
		}
	});
	it('passes modifier-bearing events through', () => {
		expect(resolveKey({ key: 'k', ctrlKey: true }, ctx())).toBeNull();
		expect(resolveKey({ key: 'ArrowRight', metaKey: true }, ctx())).toBeNull();
		expect(resolveKey({ key: 'Delete', altKey: true }, ctx())).toBeNull();
	});
	it('returns null for unbound keys', () => {
		expect(resolveKey({ key: 'q' }, ctx())).toBeNull();
		expect(resolveKey({ key: 'Enter' }, ctx())).toBeNull();
	});
});

describe('resolveKey — Escape survives the guards', () => {
	it('closes from the plain reader', () => {
		expect(resolveKey({ key: 'Escape' }, ctx())).toEqual({ kind: 'close' });
	});
	it('still resolves while editing', () => {
		expect(resolveKey({ key: 'Escape' }, ctx({ editMode: true }))).toEqual({ kind: 'close' });
	});
	it('still resolves from inside a text field', () => {
		expect(resolveKey({ key: 'Escape' }, ctx({ isTextTarget: true }))).toEqual({ kind: 'close' });
	});
	it('is inert with a modifier', () => {
		expect(resolveKey({ key: 'Escape', ctrlKey: true }, ctx())).toBeNull();
	});
});

const NAV_KEYS = ['ArrowLeft', 'ArrowRight'];
const DECISION_KEYS = ['Delete', 'k', 'h'];

describe('resolveKey — no overlay open', () => {
	// The svelte:window listener is live for the whole library page, so when the
	// reader is closed NOTHING may resolve — not even Escape, which would
	// otherwise be a stray close against no overlay.
	const closed = ctx({ hasDoc: false, status: 'idle' });
	it('resolves nothing at all, including Escape', () => {
		for (const key of [...NAV_KEYS, ...DECISION_KEYS, 'Escape']) {
			expect(resolveKey({ key }, closed)).toBeNull();
		}
	});
});

describe('resolveKey — the loading window', () => {
	// openDocByIndex stamps the new index synchronously but leaves the PREVIOUS
	// document mounted until the fetch resolves. Acting here writes the old doc's
	// id against the new index — the Critical bug this gating exists to prevent.
	const loadingStale = ctx({ hasDoc: true, status: 'loading' });
	const loadingEmpty = ctx({ hasDoc: false, status: 'loading' });

	it('blocks navigation while a document is loading', () => {
		for (const key of NAV_KEYS) {
			expect(resolveKey({ key }, loadingStale)).toBeNull();
			expect(resolveKey({ key }, loadingEmpty)).toBeNull();
		}
	});
	it('blocks decisions while a document is loading', () => {
		for (const key of DECISION_KEYS) {
			expect(resolveKey({ key }, loadingStale)).toBeNull();
			expect(resolveKey({ key }, loadingEmpty)).toBeNull();
		}
	});
	it('still closes on Escape — the overlay is visible during loading', () => {
		expect(resolveKey({ key: 'Escape' }, loadingStale)).toEqual({ kind: 'close' });
		expect(resolveKey({ key: 'Escape' }, loadingEmpty)).toEqual({ kind: 'close' });
	});
});

describe('resolveKey — the error state', () => {
	// The error state also leaves the previous document mounted, so it is exactly
	// as unsafe to act in as the loading window.
	const errored = ctx({ hasDoc: true, status: 'error' });

	it('blocks navigation', () => {
		for (const key of NAV_KEYS) expect(resolveKey({ key }, errored)).toBeNull();
	});
	it('blocks decisions', () => {
		for (const key of DECISION_KEYS) expect(resolveKey({ key }, errored)).toBeNull();
	});
	it('still closes on Escape', () => {
		expect(resolveKey({ key: 'Escape' }, errored)).toEqual({ kind: 'close' });
	});
});

describe('resolveKey — auto-repeat', () => {
	// Held keys fire ~30/s. A repeated decision would curate dozens of documents;
	// a repeated arrow is just scanning, which is idempotent and intended.
	it('ignores repeated decision keys', () => {
		for (const key of DECISION_KEYS) {
			expect(resolveKey({ key, repeat: true }, ctx())).toBeNull();
		}
	});
	it('allows repeated navigation keys', () => {
		expect(resolveKey({ key: 'ArrowRight', repeat: true }, ctx())).toEqual({
			kind: 'nav',
			dir: 'next'
		});
		expect(resolveKey({ key: 'ArrowLeft', repeat: true }, ctx())).toEqual({
			kind: 'nav',
			dir: 'prev'
		});
	});
	it('allows a repeated Escape', () => {
		expect(resolveKey({ key: 'Escape', repeat: true }, ctx())).toEqual({ kind: 'close' });
	});
	it('still resolves decision keys on the first, non-repeat press', () => {
		expect(resolveKey({ key: 'k', repeat: false }, ctx())).toEqual({
			kind: 'decide',
			decision: 'keep'
		});
	});
});

describe('isTextTarget', () => {
	it('detects inputs and textareas', () => {
		expect(isTextTarget({ tagName: 'INPUT' })).toBe(true);
		expect(isTextTarget({ tagName: 'TEXTAREA' })).toBe(true);
	});
	it('detects contenteditable', () => {
		expect(isTextTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
	});
	it('is false for ordinary elements and null', () => {
		expect(isTextTarget({ tagName: 'DIV' })).toBe(false);
		expect(isTextTarget({ tagName: 'BUTTON' })).toBe(false);
		expect(isTextTarget(null)).toBe(false);
		expect(isTextTarget(undefined)).toBe(false);
	});
});
