import { describe, it, expect } from 'vitest';
import { rate, chanceWithin, pickIndex, LAMBDA_MAX, K } from './thoughtLogic';

describe('rate', () => {
	it('is zero with nothing stored', () => {
		expect(rate(0)).toBe(0);
		expect(chanceWithin(0, 1e6)).toBe(0);
	});
	it('grows with n and never passes the ceiling', () => {
		expect(rate(1)).toBeLessThan(rate(10));
		expect(rate(10)).toBeLessThan(rate(1000));
		expect(rate(1e9)).toBeLessThanOrEqual(LAMBDA_MAX);
	});
	it('is half the ceiling at K', () => {
		expect(rate(K)).toBeCloseTo(LAMBDA_MAX / 2, 12);
	});
	it('is rare for one thought: hours apart', () => {
		expect(1 / rate(1) / 3600).toBeGreaterThan(5);
	});
});

describe('chanceWithin', () => {
	it('is a probability that rises with time', () => {
		const a = chanceWithin(10, 5), b = chanceWithin(10, 500);
		expect(a).toBeGreaterThan(0);
		expect(b).toBeGreaterThan(a);
		expect(b).toBeLessThan(1);
	});
});

describe('pickIndex', () => {
	it('handles empty and single', () => {
		expect(pickIndex(0, Math.random)).toBe(-1);
		expect(pickIndex(1, Math.random, 0)).toBe(0);
	});
	it('never repeats the last when it can avoid it, and covers the rest', () => {
		const seen = new Set<number>();
		for (let k = 0; k < 200; k++) {
			const i = pickIndex(4, Math.random, 2);
			expect(i).not.toBe(2);
			expect(i).toBeGreaterThanOrEqual(0);
			expect(i).toBeLessThan(4);
			seen.add(i);
		}
		expect([...seen].sort()).toEqual([0, 1, 3]);
	});
});
