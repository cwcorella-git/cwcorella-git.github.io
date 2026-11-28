// Thoughts: short private notes, thrown somewhere to be forgotten.
// Stored as ONE encrypted file (static/docs/private/thoughts.enc), written
// through the write queue like the links index. Admin only: without the content
// key there is nothing to read, and nothing shown.

import { adminState, writeQueue } from '$lib/admin/state.svelte';
import { draftStore } from '$lib/admin/draft';
import { toast } from '$lib/admin/toast.svelte';

export interface Thought { t: number; text: string }

let _items = $state<Thought[]>([]);
let _loaded = $state(false);
let _loading: Promise<void> | null = null;
let _composing = $state(false);

async function readFile(): Promise<Thought[]> {
	const res = await fetch('/docs/private/thoughts.enc');
	if (res.status === 404) return []; // none written yet
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const parsed = JSON.parse(await adminState.decryptContent(await res.json()));
	return Array.isArray(parsed) ? parsed : [];
}

// A draft is a write that never reached GitHub (reload before the sync). The
// deployed file does not have it yet, so it must be merged in, or the next add
// would overwrite it with a list that lacks it.
async function readDraft(): Promise<Thought[]> {
	const d = draftStore.load<{ encJson: string }>('thoughts');
	if (!d?.encJson) return [];
	try {
		const parsed = JSON.parse(await adminState.decryptContent(JSON.parse(d.encJson)));
		return Array.isArray(parsed) ? parsed : [];
	} catch { return []; }
}

async function load(): Promise<void> {
	try {
		const [file, draft] = await Promise.all([readFile(), readDraft()]);
		const byT = new Map<number, Thought>();
		for (const x of [...file, ...draft, ..._items]) byT.set(x.t, x);
		_items = [...byT.values()].sort((a, b) => a.t - b.t);
		_loaded = true;
	} catch (e) {
		// Not loaded: adding stays blocked, so a failed read can never be
		// written back over the real file as an empty list.
		console.warn('[thoughts] load failed', e);
	}
}

export const thoughtsState = {
	get items() { return _items; },
	get loaded() { return _loaded; },
	get composing() { return _composing; },

	open() { if (adminState.active) _composing = true; },
	close() { _composing = false; },

	ensureLoaded(): Promise<void> {
		if (_loaded) return Promise.resolve();
		return (_loading ??= load().finally(() => { _loading = null; }));
	},

	async add(text: string): Promise<boolean> {
		const clean = text.trim();
		if (!clean) return false;
		await thoughtsState.ensureLoaded();
		if (!_loaded) { toast.error('could not read your thoughts file; nothing saved'); return false; }
		const next = [..._items, { t: Date.now(), text: clean }];
		const enc = await adminState.encryptContent(JSON.stringify(next));
		writeQueue.push({ domain: 'thoughts', encJson: JSON.stringify(enc), message: 'update thoughts' });
		_items = next;
		return true;
	},

	clear() { _items = []; _loaded = false; _loading = null; _composing = false; },
};
