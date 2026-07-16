// Pure nav-config logic — no Svelte, no DOM, no network. Unit-testable in node.
// The nav bar is driven by a committed list of items (src/lib/content/nav.json);
// this module decides which render and enforces the edit guards.

export type NavAudience = 'public' | 'admin';

export interface NavItem {
	id: string;
	label: string;
	href: string;
	/** Whether the item appears in the nav at all. */
	shown: boolean;
	/** 'public' = every visitor sees it; 'admin' = only when logged in / archive mode. */
	audience: NavAudience;
	/** The route itself is admin-gated (redirects non-admins), so its audience is
	 *  pinned to 'admin' — a public link would just bounce visitors home. */
	adminLocked?: boolean;
	/** Fully fixed (the site brand): always shown + public, not user-editable. */
	pinned?: boolean;
}

/** Items to render in the nav, given whether the viewer has admin visibility.
 *  `isAdmin` folds in archive mode at the call site (adminState.active || archiveState.mode). */
export function visibleItems(items: NavItem[], isAdmin: boolean): NavItem[] {
	return items.filter((i) => i.shown && (i.audience === 'public' || isAdmin));
}

/** A private→public transition — the one direction that needs a confirmation,
 *  because it exposes a tab to every visitor. */
export function isGoingPublic(prev: NavAudience, next: NavAudience): boolean {
	return prev === 'admin' && next === 'public';
}

/** Whether the audience toggle may be changed for this item. */
export function audienceEditable(item: NavItem): boolean {
	return !item.pinned && !item.adminLocked;
}

/** Whether the show/hide toggle may be changed for this item. */
export function shownEditable(item: NavItem): boolean {
	return !item.pinned;
}

/** Whether `id` can move one slot in `dir` — false at the list edge, and false if
 *  the item itself or its neighbour is pinned (pinned items stay put, so home
 *  stays anchored at the top). */
export function canMove(items: NavItem[], id: string, dir: 'up' | 'down'): boolean {
	const idx = items.findIndex((i) => i.id === id);
	if (idx < 0) return false;
	const swap = dir === 'up' ? idx - 1 : idx + 1;
	if (swap < 0 || swap >= items.length) return false;
	return !items[idx].pinned && !items[swap].pinned;
}

/** Return a new list with `id` moved one slot in `dir`. Returns the SAME array
 *  reference (a no-op) when the move isn't allowed — callers use identity to
 *  detect whether anything changed. */
export function moveItem(items: NavItem[], id: string, dir: 'up' | 'down'): NavItem[] {
	if (!canMove(items, id, dir)) return items;
	const idx = items.findIndex((i) => i.id === id);
	const swap = dir === 'up' ? idx - 1 : idx + 1;
	const next = items.slice();
	[next[idx], next[swap]] = [next[swap], next[idx]];
	return next;
}
