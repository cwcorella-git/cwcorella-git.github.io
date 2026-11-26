import { describe, it, expect } from 'vitest';
import {
	readingButtons, readingTone, applyReadingAction, actionToPatch, stubsFor,
	stubDraft, stubPatch, itemToState, applyStubItem
} from './readingLogic';
import type { ReadingItem, ReadingState } from './types';

const st = (o: Partial<ReadingState> = {}): ReadingState =>
	({ item_id: 1, to_read: true, read: false, links: [], ...o });

describe('readingButtons', () => {
	it('shows nothing off the list', () => {
		expect(readingButtons(undefined)).toEqual([]);
		expect(readingButtons(st({ to_read: false }))).toEqual([]);
	});
	it('offers mark read, edit, x', () => {
		expect(readingButtons(st()).map((b) => b.action)).toEqual(['mark-read', 'edit', 'remove']);
	});
	it('offers unread once read', () => {
		expect(readingButtons(st({ read: true }))[0].action).toBe('mark-unread');
	});
});

describe('readingTone', () => {
	it('highlights unread, dims read, ignores the rest', () => {
		expect(readingTone(st())).toBe('to-read');
		expect(readingTone(st({ read: true }))).toBe('read');
		expect(readingTone(undefined)).toBeNull();
		expect(readingTone(st({ to_read: false }))).toBeNull();
	});
});

describe('actions', () => {
	it('x only clears to_read; it never produces a curation field', () => {
		expect(applyReadingAction(st(), 'remove').to_read).toBe(false);
		expect(actionToPatch('remove')).toEqual({ to_read: false, read: false });
		expect(Object.keys(actionToPatch('remove')!)).not.toContain('decision');
	});
	it('edit is not a write', () => {
		expect(actionToPatch('edit')).toBeNull();
		expect(applyReadingAction(st(), 'edit')).toEqual(st());
	});
	it('mark read / unread', () => {
		expect(applyReadingAction(st(), 'mark-read').read).toBe(true);
		expect(actionToPatch('mark-unread')).toEqual({ read: false });
	});
});

describe('stubsFor', () => {
	const mk = (o: Partial<ReadingItem>): ReadingItem => ({
		item_id: 1, doc_id: null, legacy_id: null, title: 't', author: null, year_hint: null,
		category: null, type_hint: null, tags: null, to_read: 1, read_at: null, read: false,
		stub: true, links: [], ...o
	});
	it('filters stubs by state and drops matched items', () => {
		const items = [mk({ item_id: 1 }), mk({ item_id: 2, read: true }), mk({ item_id: 3, stub: false, doc_id: 9 }),
			mk({ item_id: 4, to_read: 0 })];
		expect(stubsFor(items, 'to_read').map((i) => i.item_id)).toEqual([1]);
		expect(stubsFor(items, 'read').map((i) => i.item_id)).toEqual([2]);
	});
});

describe('add to to-read', () => {
	it('offers only + to read off the list, and only when allowed', () => {
		expect(readingButtons(undefined)).toEqual([]);
		expect(readingButtons(undefined, true)).toEqual([{ action: 'add', label: '+ to read' }]);
		expect(readingButtons(st({ to_read: false }), true).map((b) => b.action)).toEqual(['add']);
		expect(readingButtons(st(), true).map((b) => b.action)).toEqual(['mark-read', 'edit', 'remove']);
	});
	it('add is a to_read write and never a curation field', () => {
		expect(actionToPatch('add')).toEqual({ to_read: true });
		expect(applyReadingAction(st({ to_read: false }), 'add').to_read).toBe(true);
	});
	it('itemToState maps the API row', () => {
		const s = itemToState({ item_id: 4, to_read: 1, read: false, links: [{ name: 'a', url: 'https://a' }] } as ReadingItem);
		expect(s).toEqual({ item_id: 4, to_read: true, read: false, links: [{ name: 'a', url: 'https://a' }] });
	});
});

describe('stub editing', () => {
	const it0 = {
		item_id: 9, doc_id: null, legacy_id: 'x', title: 'Book', author: 'A B', year_hint: 1990,
		category: 'cat', type_hint: null, tags: null, to_read: 1, read_at: null, read: false, stub: true,
		links: [{ name: 'src', url: 'https://x.org/b' }]
	} as ReadingItem;
	it('an untouched draft produces an empty patch', () => {
		expect(stubPatch(it0, stubDraft(it0))).toEqual({ patch: {}, problems: [] });
	});
	it('sends only what changed', () => {
		const d = { ...stubDraft(it0), title: ' New ', year: '1991' };
		expect(stubPatch(it0, d).patch).toEqual({ title: 'New', year_hint: 1991 });
	});
	it('blocks an empty title, a bad year, a cleared year and a non-http link', () => {
		const d = { ...stubDraft(it0), title: ' ', year: '19x', links: [{ name: 'n', url: 'javascript:alert(1)' }] };
		expect(stubPatch(it0, d).problems.length).toBe(3);
		expect(stubPatch(it0, { ...stubDraft(it0), year: '' }).problems).toEqual(['a year cannot be cleared']);
	});
	it('emptying author sends an empty string, not null', () => {
		expect(stubPatch(it0, { ...stubDraft(it0), author: '' }).patch).toEqual({ author: '' });
	});
	it('replaces the saved row in place', () => {
		expect(applyStubItem([it0], { ...it0, title: 'Z' })[0].title).toBe('Z');
	});
});
