import { describe, it, expect } from 'vitest';
import { resolveKey, isTextTarget } from './keyLogic';

const ctx = (over: Partial<{ editMode: boolean; isTextTarget: boolean }> = {}) => ({
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
