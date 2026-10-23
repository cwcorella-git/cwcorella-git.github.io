import { describe, it, expect } from 'vitest';
import { extremes } from './seen.svelte';

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
