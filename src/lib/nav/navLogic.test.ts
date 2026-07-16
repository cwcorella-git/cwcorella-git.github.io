import { describe, it, expect } from 'vitest';
import {
	visibleItems,
	isGoingPublic,
	audienceEditable,
	shownEditable,
	type NavItem
} from './navLogic.js';

const items: NavItem[] = [
	{ id: 'home', label: 'cwcorella', href: '/', shown: true, audience: 'public', pinned: true },
	{ id: 'reading', label: 'reading', href: '/reading', shown: true, audience: 'public' },
	{ id: 'library', label: 'library', href: '/library', shown: true, audience: 'admin', adminLocked: true },
	{ id: 'hidden-pub', label: 'draft', href: '/draft', shown: false, audience: 'public' }
];

describe('visibleItems', () => {
	it('public visitor sees only shown public items', () => {
		const got = visibleItems(items, false).map((i) => i.id);
		expect(got).toEqual(['home', 'reading']); // library is admin, draft is hidden
	});

	it('admin sees shown public + shown admin items', () => {
		const got = visibleItems(items, true).map((i) => i.id);
		expect(got).toEqual(['home', 'reading', 'library']); // draft still hidden for everyone
	});

	it('a hidden item never renders, regardless of audience or admin', () => {
		expect(visibleItems(items, true).some((i) => i.id === 'hidden-pub')).toBe(false);
		expect(visibleItems(items, false).some((i) => i.id === 'hidden-pub')).toBe(false);
	});
});

describe('isGoingPublic', () => {
	it('true only on admin→public', () => {
		expect(isGoingPublic('admin', 'public')).toBe(true);
	});
	it('false on public→admin, and on no-op transitions', () => {
		expect(isGoingPublic('public', 'admin')).toBe(false);
		expect(isGoingPublic('public', 'public')).toBe(false);
		expect(isGoingPublic('admin', 'admin')).toBe(false);
	});
});

describe('edit guards', () => {
	it('pinned and adminLocked items cannot change audience', () => {
		expect(audienceEditable(items[0])).toBe(false); // home pinned
		expect(audienceEditable(items[2])).toBe(false); // library adminLocked
		expect(audienceEditable(items[1])).toBe(true); // reading editable
	});

	it('pinned items cannot change shown; others can', () => {
		expect(shownEditable(items[0])).toBe(false); // home pinned
		expect(shownEditable(items[2])).toBe(true); // library (adminLocked) can still be hidden
		expect(shownEditable(items[1])).toBe(true);
	});
});
