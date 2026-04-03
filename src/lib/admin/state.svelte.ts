import type { Book, JournalMeta, LinkMeta } from '$lib/types';
import allBooksStatic from '$lib/books.json';
import { commitFiles } from '$lib/admin/github';
import { draftStore } from '$lib/admin/draft';
import {
	encryptDoc, decryptDoc,
	importRawKey, encryptDocWithKey, decryptDocWithKey,
	type EncryptedDoc
} from '$lib/admin/crypto';

export type KeyMode = 'passphrase' | 'rawkey';

export const ADMIN_SEQUENCE = '```';

// ── Write queue ───────────────────────────────────────────────────────────────

type DomainPayload =
	| { domain: 'books'; books: Book[]; extraUpdates?: { path: string; content: string }[]; deletions?: string[] }
	| { domain: 'home'; content: string }
	| { domain: 'journals-index'; encIndexJson: string; extraUpdates: { path: string; content: string }[]; deletions: string[]; message: string }
	| { domain: 'links'; encIndexJson: string; message: string };

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
	} else if (payload.domain === 'journals-index') {
		await commitFiles(
			pat,
			[{ path: 'static/docs/private/journals-index.enc', content: payload.encIndexJson }, ...payload.extraUpdates],
			payload.message,
			payload.deletions
		);
	} else if (payload.domain === 'links') {
		await commitFiles(
			pat,
			[{ path: 'static/docs/private/links-index.enc', content: payload.encIndexJson }],
			payload.message
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
		// Books: merge extraUpdates/deletions — prevents mark-read or other rapid pushes
		// from discarding a pending doc-file write that was queued by save().
		if (payload.domain === 'books') {
			const existing = _pending.get('books') as Extract<DomainPayload, { domain: 'books' }> | undefined;
			if (existing) {
				const mergedUpdates = new Map((existing.extraUpdates ?? []).map(u => [u.path, u]));
				for (const u of (payload.extraUpdates ?? [])) mergedUpdates.set(u.path, u);
				const mergedDeletions = [...new Set([...(existing.deletions ?? []), ...(payload.deletions ?? [])])];
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
		if (!_pat) {
			_syncStatus = 'error';
			_syncError = 'GitHub PAT not set — add it in admin settings (⊙).';
			console.warn('[writeQueue] flush blocked: no PAT');
			return;
		}
		_flushing = true;
		_syncStatus = 'saving';
		if (_debounceTimer !== null) { clearTimeout(_debounceTimer); _debounceTimer = null; }

		const snapshot = new Map(_pending);
		_pending = new Map();
		// Clear drafts immediately to prevent stale restore on error/reload
		for (const domain of snapshot.keys()) {
			draftStore.clear(domain);
		}

		const pat = _pat;
		try {
			for (const payload of snapshot.values()) {
				await _commitDomain(payload, pat);
			}
			_syncStatus = _pending.size > 0 ? 'dirty' : 'idle';
			_syncError = '';
		} catch (e: unknown) {
			console.error('[writeQueue] flush failed:', e);
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

		const linksDraft = draftStore.load<Extract<DomainPayload, { domain: 'links' }>>('links');
		if (linksDraft) {
			_pending = new Map(_pending).set('links', linksDraft);
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

// ── Links index state ─────────────────────────────────────────────────────────
let _linksIndex = $state<LinkMeta[]>([]);
let _linksIndexLoaded = $state(false);
export const linksState = {
	get entries() { return _linksIndex; },
	get loaded() { return _linksIndexLoaded; },
	set(entries: LinkMeta[]) { _linksIndex = [...entries]; _linksIndexLoaded = true; },
	clear() { _linksIndex = []; _linksIndexLoaded = false; },
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
let _keyMode = $state<KeyMode>('passphrase');
let _cryptoKey = $state<CryptoKey | null>(null);

export const adminState = {
	get active()     { return _active; },
	get pat()        { return _pat; },
	get contentKey() { return _contentKey; },
	get keyMode()    { return _keyMode; },

	/** Activate admin mode with a content key. PAT is set separately via updatePAT(). */
	async activate(key: string, mode: KeyMode = 'passphrase') {
		_contentKey = key;
		_keyMode = mode;
		_active = true;
		_cryptoKey = mode === 'rawkey' ? await importRawKey(key) : null;
		localStorage.setItem('cwc-admin-key', key);
		localStorage.setItem('cwc-admin-keymode', mode);
	},

	async logout() {
		await writeQueue.flush();
		_active = false;
		_pat = '';
		_contentKey = '';
		_keyMode = 'passphrase';
		_cryptoKey = null;
		localStorage.removeItem('cwc-admin-pat');
		localStorage.removeItem('cwc-admin-key');
		localStorage.removeItem('cwc-admin-keymode');
		journalIndexState.clear();
		linksState.clear();
	},

	async restoreFromSession() {
		const pat = localStorage.getItem('cwc-admin-pat');
		const key = localStorage.getItem('cwc-admin-key');
		const mode = (localStorage.getItem('cwc-admin-keymode') ?? 'passphrase') as KeyMode;
		if (key) {
			_contentKey = key;
			_keyMode = mode;
			_active = true;
			_cryptoKey = mode === 'rawkey' ? await importRawKey(key) : null;
		}
		if (pat) {
			_pat = pat;
		}
	},

	/** Update PAT mid-session (no re-auth needed). */
	updatePAT(newPat: string) {
		_pat = newPat.trim();
		localStorage.setItem('cwc-admin-pat', _pat);
	},

	/** Update content key mid-session. */
	async updateContentKey(newKey: string, mode: KeyMode) {
		_contentKey = newKey.trim();
		_keyMode = mode;
		_cryptoKey = mode === 'rawkey' ? await importRawKey(_contentKey) : null;
		localStorage.setItem('cwc-admin-key', _contentKey);
		localStorage.setItem('cwc-admin-keymode', mode);
	},

	/** Encrypt content using the current key/mode. */
	async encryptContent(markdown: string): Promise<EncryptedDoc> {
		if (_keyMode === 'rawkey' && _cryptoKey) {
			return encryptDocWithKey(markdown, _cryptoKey);
		}
		return encryptDoc(markdown, _contentKey);
	},

	/** Decrypt content — auto-detects mode from salt field. */
	async decryptContent(enc: EncryptedDoc): Promise<string> {
		if (enc.salt === '' && _cryptoKey) {
			return decryptDocWithKey(enc, _cryptoKey);
		}
		return decryptDoc(enc, _contentKey);
	},
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
