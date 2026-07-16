// Reactive working copy of the nav config. Loads the committed defaults, lets the
// admin stage show/hide + audience edits, and publishes them back to nav.json via
// the GitHub API (→ commit → GitHub Actions redeploy → every visitor's build).
//
// No localStorage draft (unlike books/journals): nav edits are infrequent and the
// publish is explicit, so staged-but-unpublished changes live in memory only.
import navStatic from '$lib/content/nav.json';
import { commitFiles } from '$lib/admin/github';
import { adminState } from '$lib/admin/state.svelte';
import { audienceEditable, shownEditable, moveItem, type NavAudience, type NavItem } from '$lib/nav/navLogic';

const DEFAULTS = navStatic as NavItem[];

const clone = (items: NavItem[]): NavItem[] => items.map((i) => ({ ...i }));

let _items = $state<NavItem[]>(clone(DEFAULTS));
let _dirty = $state(false);
let _publishing = $state(false);

export const navState = {
	get items() {
		return _items;
	},
	get dirty() {
		return _dirty;
	},
	get publishing() {
		return _publishing;
	},

	toggleShown(id: string) {
		const item = _items.find((i) => i.id === id);
		if (!item || !shownEditable(item)) return;
		item.shown = !item.shown;
		_dirty = true;
	},

	/** Set an item's audience. Returns false (a no-op) when the item can't be edited.
	 *  Caller is responsible for the private→public confirmation before invoking. */
	setAudience(id: string, audience: NavAudience): boolean {
		const item = _items.find((i) => i.id === id);
		if (!item || !audienceEditable(item)) return false;
		item.audience = audience;
		_dirty = true;
		return true;
	},

	move(id: string, dir: 'up' | 'down') {
		const next = moveItem(_items, id, dir);
		if (next !== _items) {
			_items = next;
			_dirty = true;
		}
	},

	reset() {
		_items = clone(DEFAULTS);
		_dirty = false;
	},

	/** Commit nav.json. Requires a PAT (throws if absent). Clears dirty on success. */
	async publish(): Promise<void> {
		if (!adminState.pat) throw new Error('No PAT loaded — cannot publish nav.');
		_publishing = true;
		try {
			await commitFiles(
				adminState.pat,
				[{ path: 'src/lib/content/nav.json', content: JSON.stringify(_items, null, '\t') + '\n' }],
				'update nav config'
			);
			_dirty = false;
		} finally {
			_publishing = false;
		}
	}
};
