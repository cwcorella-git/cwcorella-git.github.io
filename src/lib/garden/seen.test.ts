import { describe, it, expect } from 'vitest';
import { extremes, cellsIn } from './seen.svelte';

describe('extremes', () => {
	it('finds the darkest and brightest of a sample', () => {
		const px = [[200, 210, 230], [20, 30, 20], [120, 130, 140], [250, 250, 250]];
		const data = px.flatMap((c) => [...c, 255]);
		expect(extremes(data, 0.25)).toEqual([[20, 30, 20], [250, 250, 250]]);
	});
	it('is empty for no pixels', () => {
		expect(extremes([])).toEqual([]);
	});
});

describe('cellsIn', () => {
	it('covers the cells under a box, clipped to the viewport', () => {
		expect(cellsIn([{ left: -50, top: 0, right: 50, bottom: 50 }], 100, 100, 4, 4)).toEqual([0, 1, 4, 5]);
	});
	it('is the whole frame when no box is on screen', () => {
		expect(cellsIn([{ left: 0, top: 200, right: 10, bottom: 300 }], 100, 100, 2, 2)).toEqual([0, 1, 2, 3]);
	});
});
