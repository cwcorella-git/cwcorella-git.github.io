import { describe, it, expect } from 'vitest';
import {
	readingButtons, readingTone, applyReadingAction, actionToPatch, stubsFor
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
