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
