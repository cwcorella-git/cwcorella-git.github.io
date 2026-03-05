import type { Book } from '$lib/types';
import allBooksStatic from '$lib/books.json';

export const ADMIN_SEQUENCE = '```';

// ── Shared books state ────────────────────────────────────────────────────────
// Reading page derives from this; BookForm writes to it on save.
let _books = $state<Book[]>([...(allBooksStatic as Book[])]);

export const booksState = {
	get books() { return _books; },
	set(updated: Book[]) { _books = updated; }
};

// ── Admin state ───────────────────────────────────────────────────────────────
let _active = $state(false);
let _editMode = $state(false);
let _pat = $state('');
let _contentKey = $state('');

export const adminState = {
	get active() { return _active; },
	get editMode() { return _editMode; },
	get pat() { return _pat; },
	get contentKey() { return _contentKey; },

	activate(pat: string, key: string) {
		_pat = pat;
		_contentKey = key;
		_active = true;
		sessionStorage.setItem('cwc-admin-pat', pat);
		sessionStorage.setItem('cwc-admin-key', key);
	},

	logout() {
		_active = false;
		_editMode = false;
		_pat = '';
		_contentKey = '';
		sessionStorage.removeItem('cwc-admin-pat');
		sessionStorage.removeItem('cwc-admin-key');
	},

	toggleEditMode() {
		_editMode = !_editMode;
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
