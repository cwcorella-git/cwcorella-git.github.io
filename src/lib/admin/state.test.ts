import { describe, it, expect, vi, beforeEach } from 'vitest';

const { commitFiles } = vi.hoisted(() => ({ commitFiles: vi.fn() }));

vi.mock('$lib/books.json', () => ({ default: [] }));
vi.mock('$lib/admin/github', () => ({ commitFiles }));

class MemoryStorage {
	private store = new Map<string, string>();
	getItem(key: string) { return this.store.has(key) ? this.store.get(key)! : null; }
	setItem(key: string, value: string) { this.store.set(key, value); }
	removeItem(key: string) { this.store.delete(key); }
	clear() { this.store.clear(); }
}
(globalThis as any).localStorage = new MemoryStorage();

import { writeQueue, adminState } from './state.svelte';
import { draftStore } from './draft';

describe('writeQueue.flush', () => {
	beforeEach(() => {
		localStorage.clear();
		commitFiles.mockReset();
		adminState.updatePAT('test-pat');
	});

	it('keeps the draft in localStorage when the commit fails', async () => {
		commitFiles.mockRejectedValueOnce(new TypeError('NetworkError when attempting to fetch resource.'));

		writeQueue.push({ domain: 'books', books: [{ name: 'New Book', url: '' } as any] });
		await writeQueue.flush();

		expect(writeQueue.status).toBe('error');
		// Root cause of the reported bug: draftStore.clear() ran optimistically
		// before the commit was attempted, so a failed flush left localStorage
		// empty even though the write was still queued in memory. A reload at
		// that point silently lost the pending book entry.
		expect(draftStore.load('books')).not.toBeNull();
	});
});
