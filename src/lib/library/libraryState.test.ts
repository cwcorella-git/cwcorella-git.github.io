import { describe, it, expect, vi, beforeEach } from 'vitest';

const setCuration = vi.fn();
const setFlags = vi.fn();
const getDocument = vi.fn();
const getCurationStats = vi.fn();
const listDocuments = vi.fn();
const getFacets = vi.fn();
const toastError = vi.fn();

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/admin/state.svelte', () => ({
	adminState: { libraryToken: 'test-token' }
}));
vi.mock('$lib/admin/toast.svelte', () => ({
	toast: { error: toastError, success: vi.fn() }
}));
vi.mock('./api', async () => {
	const actual = await vi.importActual<typeof import('./api')>('./api');
	return {
		...actual,
		// Full client surface as of 2026-07-18 — a missing method would surface as an
		// unrelated TypeError rather than the assertion the test is actually making.
		createLibraryClient: () => ({
			setCuration,
			setFlags,
			getDocument,
			getCurationStats,
			listDocuments,
			getFacets,
			getAnchorOffset: vi.fn(),
			saveBody: vi.fn(),
			getVersions: vi.fn(),
			revertDoc: vi.fn()
		})
	};
});

const doc = {
	id: 1,
	title: 'A document',
	body: 'body text',
	tags: [],
	decision: null,
	source: 'user',
	visibility: 'public'
};

describe('setDecision failure handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDocument.mockResolvedValue(doc);
		getCurationStats.mockResolvedValue(null);
	});

	it('does not put the page into an error state when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		const statusBefore = libraryState.status;

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(libraryState.status).toBe(statusBefore);
		expect(libraryState.status).not.toBe('error');
	});

	it('reports the failure as a toast', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(toastError).toHaveBeenCalled();
	});

	it('rolls the open doc back to its previous decision', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(libraryState.openDoc?.decision).toBe(null);
	});
});

// The three tests above all run with _openIndex === null (openDocById never sets
// it), so the row-cache half of setDecision is entirely unexercised there — which
// is exactly how the wrong-row stamp survived review. These open by INDEX.
describe('setDecision row-cache writes (open index known)', () => {
	const rowA = { id: 1, title: 'A', decision: null, source: 'user' };
	const rowB = { id: 2, title: 'B', decision: null, source: 'user' };
	const docA = { ...doc, id: 1 };
	const docB = { ...doc, id: 2 };

	let state: typeof import('./libraryState.svelte').libraryState;

	beforeEach(async () => {
		vi.resetModules();
		vi.clearAllMocks();
		getCurationStats.mockResolvedValue(null);
		getFacets.mockResolvedValue({ sources: [], categories: [], tags: [] });
		listDocuments.mockResolvedValue({ items: [rowA, rowB], total: 2 });
		setCuration.mockResolvedValue(undefined);
		getDocument.mockResolvedValue(docA);
		({ libraryState: state } = await import('./libraryState.svelte'));
		await state.init();
	});

	it('writes the decision onto the cached row when the ids match', async () => {
		getDocument.mockResolvedValue(docB);
		await state.openDocByIndex(1);

		await state.setDecision('delete');

		expect(state.rowAt(1)?.decision).toBe('delete');
	});

	it('rolls the cached row back when the write fails', async () => {
		getDocument.mockResolvedValue(docB);
		await state.openDocByIndex(1);
		setCuration.mockRejectedValue(new Error('tunnel hiccup'));

		await state.setDecision('delete');

		expect(state.rowAt(1)?.decision).toBe(null);
		expect(state.openDoc?.decision).toBe(null);
	});

	it('does not stamp a row belonging to a different document', async () => {
		// Open index 0 (doc id 1), then start opening index 1. openDocByIndex sets
		// _openIndex = 1 synchronously, but getDocument has not resolved, so the
		// PREVIOUS doc (id 1) is still mounted. A decision landing in that window
		// must not write id 1's decision onto row 1, which belongs to id 2.
		await state.openDocByIndex(0);
		let release: ((d: unknown) => void) | undefined;
		getDocument.mockReturnValue(new Promise((res) => { release = res; }));
		void state.openDocByIndex(1);

		await state.setDecision('delete');

		expect(state.rowAt(1)?.decision).toBe(null);
		expect(state.rowAt(0)?.decision).toBe(null);
		release?.(docB);
	});
});

describe('flag toggles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDocument.mockResolvedValue({ ...doc, visibility: 'private', needs_formatting: false });
		getCurationStats.mockResolvedValue(null);
	});

	it('optimistically flips visibility', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockResolvedValue({ ...doc, visibility: 'public' });
		await libraryState.toggleVisibility();
		expect(setFlags).toHaveBeenCalledWith(1, { visibility: 'public' });
		expect(libraryState.openDoc?.visibility).toBe('public');
	});

	it('rolls back and toasts when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockRejectedValue(new Error('nope'));
		await libraryState.toggleVisibility();
		expect(libraryState.openDoc?.visibility).toBe('private');
		expect(toastError).toHaveBeenCalled();
	});

	it('does not put the page into an error state when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		const statusBefore = libraryState.status;
		setFlags.mockRejectedValue(new Error('nope'));
		await libraryState.toggleVisibility();
		expect(libraryState.status).toBe(statusBefore);
		expect(libraryState.status).not.toBe('error');
	});

	it('flips needs_formatting', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockResolvedValue({ ...doc, needs_formatting: true });
		await libraryState.toggleNeedsFormatting();
		expect(setFlags).toHaveBeenCalledWith(1, { needs_formatting: 1 });
	});
});
