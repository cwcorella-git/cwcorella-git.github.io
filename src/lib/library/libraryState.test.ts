import { describe, it, expect } from 'vitest';
import { composeQueryKey } from './libraryState.svelte.js';

describe('composeQueryKey', () => {
	it('changes when the seek generation changes, even with the same base', () => {
		expect(composeQueryKey('base', 1)).not.toBe(composeQueryKey('base', 2));
	});
	it('is stable for the same base + generation', () => {
		expect(composeQueryKey('base', 3)).toBe(composeQueryKey('base', 3));
	});
});
