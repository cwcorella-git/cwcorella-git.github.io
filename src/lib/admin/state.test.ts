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

	it('stops auto-flushing on a rejected PAT and resumes when it is updated', async () => {
		vi.useFakeTimers();
		try {
			commitFiles.mockRejectedValueOnce(new Error('GITHUB_AUTH', { cause: 401 }));
			writeQueue.push({ domain: 'books', books: [{ name: 'Blocked Book', url: '' } as any] });
			await writeQueue.flush();

			expect(writeQueue.status).toBe('error');
			expect(writeQueue.authBlocked).toBe(true);
			expect(writeQueue.error).toMatch(/PAT/);
			expect(draftStore.load('books')).not.toBeNull();

			commitFiles.mockReset();
			writeQueue.push({ domain: 'books', books: [{ name: 'Another', url: '' } as any] });
			await vi.advanceTimersByTimeAsync(20_000);
			expect(commitFiles).not.toHaveBeenCalled();

			commitFiles.mockResolvedValueOnce(undefined);
			adminState.updatePAT('new-pat');
			await vi.runAllTimersAsync();
			expect(commitFiles).toHaveBeenCalledTimes(1);
			expect(writeQueue.authBlocked).toBe(false);
			expect(writeQueue.status).toBe('idle');
		} finally {
			vi.useRealTimers();
		}
	});
});
