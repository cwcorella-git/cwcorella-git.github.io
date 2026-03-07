import type { Book, JournalMeta } from '$lib/types';
import allBooksStatic from '$lib/books.json';
import { commitFiles } from '$lib/admin/github';
import { draftStore } from '$lib/admin/draft';

export const ADMIN_SEQUENCE = '```';

// ── Write queue ───────────────────────────────────────────────────────────────

type DomainPayload =
	| { domain: 'books'; books: Book[]; extraUpdates?: { path: string; content: string }[]; deletions?: string[] }
	| { domain: 'home'; content: string }
	| { domain: 'journals-index'; encIndexJson: string; extraUpdates: { path: string; content: string }[]; deletions: string[]; message: string };

type SyncStatus = 'idle' | 'dirty' | 'saving' | 'error';

let _pending = $state<Map<string, DomainPayload>>(new Map());
let _syncStatus = $state<SyncStatus>('idle');
let _syncError = $state('');
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;

async function _commitDomain(payload: DomainPayload, pat: string): Promise<void> {
	if (payload.domain === 'books') {
		await commitFiles(
			pat,
			[{ path: 'src/lib/books.json', content: JSON.stringify(payload.books) }, ...(payload.extraUpdates ?? [])],
			'update books.json',
			payload.deletions ?? []
		);
	} else if (payload.domain === 'home') {
		await commitFiles(
			pat,
			[{ path: 'src/lib/content/home.json', content: JSON.stringify({ content: payload.content }, null, '\t') }],
			'update home content'
		);
	} else {
		await commitFiles(
			pat,
			[{ path: 'static/docs/private/journals-index.enc', content: payload.encIndexJson }, ...payload.extraUpdates],
			payload.message,
			payload.deletions
		);
	}
}

export const writeQueue = {
	get status(): SyncStatus { return _syncStatus; },
	get error(): string { return _syncError; },
	get isDirty(): boolean { return _pending.size > 0; },

	push(payload: DomainPayload): void {
		// Journals: merge extraUpdates/deletions so rapid saves don't drop earlier .enc files
		if (payload.domain === 'journals-index') {
			const existing = _pending.get('journals-index') as Extract<DomainPayload, { domain: 'journals-index' }> | undefined;
			if (existing) {
				const mergedUpdates = new Map(existing.extraUpdates.map(u => [u.path, u]));
				for (const u of payload.extraUpdates) mergedUpdates.set(u.path, u);
				const mergedDeletions = [...new Set([...existing.deletions, ...payload.deletions])];
				payload = { ...payload, extraUpdates: [...mergedUpdates.values()], deletions: mergedDeletions };
			}
		}
		_pending = new Map(_pending).set(payload.domain, payload);
		_syncStatus = 'dirty';
		draftStore.save(payload.domain, payload);
		if (_debounceTimer !== null) clearTimeout(_debounceTimer);
		_debounceTimer = setTimeout(() => { writeQueue.flush(); }, 10_000);
	},

	async flush(): Promise<void> {
		if (_flushing || _pending.size === 0) return;
		_flushing = true;
		_syncStatus = 'saving';
		if (_debounceTimer !== null) { clearTimeout(_debounceTimer); _debounceTimer = null; }

		const snapshot = new Map(_pending);
		_pending = new Map();

		const pat = _pat;
		try {
			for (const payload of snapshot.values()) {
				await _commitDomain(payload, pat);
			}
			for (const domain of snapshot.keys()) {
				draftStore.clear(domain);
			}
			_syncStatus = _pending.size > 0 ? 'dirty' : 'idle';
			_syncError = '';
		} catch (e: unknown) {
			// restore snapshot entries that weren't yet pushed during this flush
			const restored = new Map(_pending);
			for (const [k, v] of snapshot) {
				if (!restored.has(k)) restored.set(k, v);
			}
			_pending = restored;
			_syncStatus = 'error';
			_syncError = e instanceof Error ? e.message : 'Sync failed.';
		} finally {
			_flushing = false;
		}
	},

	// Called on page load (after restoreFromSession). If admin is active and
	// localStorage has unsaved drafts, restores them into memory and marks
	// the queue dirty so the user can sync. Returns the number of domains restored.
	restoreFromDraft(): number {
		if (!_active) return 0;
		let count = 0;

		const booksDraft = draftStore.load<{ domain: 'books'; books: Book[] }>('books');
		if (booksDraft) {
			booksState.set(booksDraft.books);
			_pending = new Map(_pending).set('books', booksDraft);
			_syncStatus = 'dirty';
			count++;
		}

		const homeDraft = draftStore.load<{ domain: 'home'; content: string }>('home');
		if (homeDraft) {
			homeState.set(homeDraft.content);
			_pending = new Map(_pending).set('home', homeDraft);
			_syncStatus = 'dirty';
			count++;
		}

		const journalsDraft = draftStore.load<Extract<DomainPayload, { domain: 'journals-index' }>>('journals-index');
		if (journalsDraft) {
			_pending = new Map(_pending).set('journals-index', journalsDraft);
			_syncStatus = 'dirty';
			count++;
		}

		if (count > 0 && _debounceTimer === null) {
			_debounceTimer = setTimeout(() => { writeQueue.flush(); }, 10_000);
		}

		return count;
	}
};

// ── Journal content cache ─────────────────────────────────────────────────────
// Plaintext content of entries saved this session but not yet on GitHub Pages.
// Lets the reader/editor open entries before the write queue commits.
// Not persisted — cleared on page reload (content key required to decrypt anyway).
const _journalCache = new Map<string, string>();
export const journalCache = {
	set(slug: string, content: string) { _journalCache.set(slug, content); },
	get(slug: string): string | undefined { return _journalCache.get(slug); },
};

// ── Journal index state ───────────────────────────────────────────────────────
// Module-level so it survives SPA navigation. Prevents loadIndex() from
// re-fetching GitHub Pages CDN (which may be stale) after a local save/delete.
let _journalIndex = $state<JournalMeta[]>([]);
let _journalIndexLoaded = $state(false);
export const journalIndexState = {
	get entries() { return _journalIndex; },
	get loaded() { return _journalIndexLoaded; },
	set(entries: JournalMeta[]) { _journalIndex = [...entries]; _journalIndexLoaded = true; },
	clear() { _journalIndex = []; _journalIndexLoaded = false; },
};

// ── Shared books state ────────────────────────────────────────────────────────
// Reading page derives from this; BookForm writes to it on save.
let _books = $state<Book[]>([...(allBooksStatic as Book[])]);

export const booksState = {
	get books() { return _books; },
	set(updated: Book[]) { _books = updated; }
};

// ── Shared home content state ─────────────────────────────────────────────────
// null = no draft; +page.svelte falls back to the static build value.
let _homeContent = $state<string | null>(null);

export const homeState = {
	get content(): string | null { return _homeContent; },
	set(content: string) { _homeContent = content; }
};


// ── Admin state ───────────────────────────────────────────────────────────────
let _active = $state(false);
let _pat = $state('');
let _contentKey = $state('');

export const adminState = {
	get active() { return _active; },
	get pat() { return _pat; },
	get contentKey() { return _contentKey; },

	activate(pat: string, key: string) {
		_pat = pat;
		_contentKey = key;
		_active = true;
		sessionStorage.setItem('cwc-admin-pat', pat);
		sessionStorage.setItem('cwc-admin-key', key);
	},

	async logout() {
await writeQueue.flush();
		_active = false;
		_pat = '';
		_contentKey = '';
		sessionStorage.removeItem('cwc-admin-pat');
		sessionStorage.removeItem('cwc-admin-key');
		journalIndexState.clear();
	},

	restoreFromSession() {
		const pat = sessionStorage.getItem('cwc-admin-pat');
		const key = sessionStorage.getItem('cwc-admin-key');
		if (pat && key) {
			_pat = pat;
			_contentKey = key;
			_active = true;
		}
	}
};

// ── BookForm state ────────────────────────────────────────────────────────────
let _bookFormOpen = $state(false);
let _bookFormBook = $state<Book | null>(null);

export const bookFormState = {
	get open() { return _bookFormOpen; },
	get book() { return _bookFormBook; },

	openAdd() {
		_bookFormBook = null;
		_bookFormOpen = true;
	},

	openEdit(book: Book) {
		_bookFormBook = book;
		_bookFormOpen = true;
	},

	close() {
		_bookFormOpen = false;
		_bookFormBook = null;
	}
};
