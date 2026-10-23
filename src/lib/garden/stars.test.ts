import { describe, it, expect } from 'vitest';
import { siderealDeg, magnitude, extinction, galactic } from './stars';

describe('stars', () => {
	it('turns 360.99° in a solar day', () => {
		const a = siderealDeg(new Date('2026-10-22T05:00:00Z')), b = siderealDeg(new Date('2026-10-23T05:00:00Z'));
		expect(((b - a + 360) % 360)).toBeCloseTo(0.9856, 2);
	});

	it('puts the vernal point on the meridian near midnight in late September', () => {
		// Reno's local midnight is about 08:00 UTC; at the equinox LST is then about 0h.
		expect(siderealDeg(new Date('2026-09-22T08:00:00Z')) / 15).toBeLessThan(1);
	});

	it('holds about 2.8× as many stars per fainter magnitude', () => {
		const n = [0, 0];
		for (let i = 0; i < 200000; i++) {
			const m = magnitude((i + 0.5) / 200000);
			if (m >= 4 && m < 5) n[0]++; else if (m >= 5 && m < 6) n[1]++;
		}
		expect(n[1] / n[0]).toBeCloseTo(10 ** 0.45, 1);
	});

	it('loses stars at the horizon', () => {
		expect(extinction(1)).toBe(0);
		expect(extinction(0.5)).toBe(1);
	});

	it('knows where the galactic plane is', () => {
		expect(Math.abs(galactic(266.4 * Math.PI / 180, -28.94 * Math.PI / 180).b)).toBeLessThan(0.1);   // the centre
		expect(galactic(192.86 * Math.PI / 180, 27.13 * Math.PI / 180).b).toBeCloseTo(90, 1);           // the pole
	});
});
