import { describe, it, expect } from 'vitest';
import {
	WINDOW_SIZE, LRU_CAP,
	windowKeyFor, windowBounds, windowsForRange, evictWindows, resolveAnchorIndex
} from './windowLogic';

describe('windowKeyFor / windowBounds', () => {
	it('maps index to aligned window', () => {
		expect(windowKeyFor(0)).toBe(0);
		expect(windowKeyFor(WINDOW_SIZE - 1)).toBe(0);
		expect(windowKeyFor(WINDOW_SIZE)).toBe(1);
	});
	it('bounds are offset+limit', () => {
		expect(windowBounds(0)).toEqual({ offset: 0, limit: WINDOW_SIZE });
		expect(windowBounds(3)).toEqual({ offset: 3 * WINDOW_SIZE, limit: WINDOW_SIZE });
	});
});

describe('windowsForRange', () => {
	it('single window, no lookahead', () => {
		expect(windowsForRange(0, 10, 0)).toEqual([0]);
	});
	it('spans two windows', () => {
		expect(windowsForRange(WINDOW_SIZE - 1, WINDOW_SIZE + 1, 0)).toEqual([0, 1]);
	});
	it('adds lookahead windows', () => {
		expect(windowsForRange(0, 10, 1)).toEqual([0, 1]);
	});
	it('clamps negative start', () => {
		expect(windowsForRange(-5, 10, 0)).toEqual([0]);
	});
});

describe('evictWindows', () => {
	it('under cap evicts nothing', () => {
		const loaded = new Set([0, 1, 2]);
		expect(evictWindows(loaded, [1], 15)).toEqual([]);
	});
	it('over cap drops farthest from active first', () => {
		const loaded = new Set([0, 1, 2, 3, 100]);
		const dropped = evictWindows(loaded, [2], 4);
		expect(dropped).toEqual([100]);
	});
	it('never lists an active window before others when over cap', () => {
		const loaded = new Set([0, 50, 51]);
		const dropped = evictWindows(loaded, [50], 2);
		expect(dropped).toEqual([0]);
	});
});

describe('resolveAnchorIndex', () => {
	it('null seek asc -> 0', () => {
		expect(resolveAnchorIndex(null, 'asc', 1000)).toBe(0);
	});
	it('null seek desc -> total-1', () => {
		expect(resolveAnchorIndex(null, 'desc', 1000)).toBe(999);
	});
	it('null seek desc with 0 total -> 0', () => {
		expect(resolveAnchorIndex(null, 'desc', 0)).toBe(0);
	});
	it('value seek -> null (needs a count)', () => {
		expect(resolveAnchorIndex('M', 'asc', 1000)).toBeNull();
	});
});
