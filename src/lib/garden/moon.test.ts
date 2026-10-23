import { describe, it, expect } from 'vitest';
import { moonPosition } from './moon';

// Reno is UTC−7 in late October, UTC−8 from November 1.
describe('moonPosition', () => {
	it('is full on 2026-10-26', () => {
		expect(Math.abs(moonPosition(new Date('2026-10-26T12:00:00Z')).phase - 0.5)).toBeLessThan(0.03);
	});

	it('is down at midnight around the new moon of 2026-11-09', () => {
		const m = moonPosition(new Date('2026-11-09T08:00:00Z'));
		expect(Math.min(m.phase, 1 - m.phase)).toBeLessThan(0.03);
		expect(m.alt).toBeLessThan(0);
	});

	it('rises about 50 minutes later each day', () => {
		const rise = (day: number) => {
			let prev = moonPosition(new Date(Date.UTC(2026, 9, day, 0))).alt;
			for (let m = 1; m < 1500; m++) {
				const a = moonPosition(new Date(Date.UTC(2026, 9, day, 0, m))).alt;
				if (prev < 0 && a >= 0) return m;
				prev = a;
			}
			return NaN;
		};
		const d = rise(10);
		let e = rise(11);
		if (e < d) e += 1440;
		expect(e - d).toBeGreaterThan(30);
		expect(e - d).toBeLessThan(75);
	});

	it('is waxing in the week after new moon, west of the sun', () => {
		expect(moonPosition(new Date('2026-11-13T03:00:00Z')).waxing).toBe(true);
	});
});
