import { describe, it, expect, vi, beforeEach } from 'vitest';

const setCuration = vi.fn();
const getDocument = vi.fn();
const getCurationStats = vi.fn();
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
			getDocument,
			getCurationStats,
			listDocuments: vi.fn(),
			getFacets: vi.fn(),
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
