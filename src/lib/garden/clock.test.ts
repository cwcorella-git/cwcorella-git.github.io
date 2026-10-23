import { describe, it, expect } from 'vitest';
import { sceneMsAt, presetMs, sunCrossings, atDayOfYear, type ClockState } from './clock.svelte';
import { sunAltitudeDeg, dayOfYear } from './sun';
import { moonPosition } from './moon';
import { cleanScene } from '$lib/admin/sceneTune.svelte';

const base: ClockState = { sim: false, at: 0, anchor: 0, speed: 1, weather: 'auto' };

describe('scene clock', () => {
	it('is real time when live', () => {
		expect(sceneMsAt(base, 123456)).toBe(123456);
	});

	it('runs from the chosen moment at its speed', () => {
		const c = { ...base, sim: true, at: 1e12, anchor: 5000, speed: 60 };
		expect(sceneMsAt(c, 5000)).toBe(1e12);
		expect(sceneMsAt(c, 6000)).toBe(1e12 + 60000);   // a real second is a scene minute
		expect(sceneMsAt({ ...c, speed: 0 }, 99999)).toBe(1e12);
	});

	it('moves the day of year and keeps the time', () => {
		const d = new Date(2026, 9, 23, 17, 40);
		const m = new Date(atDayOfYear(d, 15));
		expect(dayOfYear(m)).toBe(15);
		expect([m.getHours(), m.getMinutes()]).toEqual([17, 40]);
	});
});

describe('presets', () => {
	const days = [new Date(2026, 0, 10), new Date(2026, 5, 21), new Date(2026, 9, 23)];

	it('finds sunrise before noon before sunset, every season', () => {
		for (const d of days) {
			const s = sunCrossings(d);
			expect(s.up).toBeGreaterThan(0);
			expect(s.up).toBeLessThan(s.noon);
			expect(s.noon).toBeLessThan(s.down);
		}
	});

	it('puts each moment where its name says', () => {
		for (const d of days) {
			const alt = (p: Parameters<typeof presetMs>[0]) => sunAltitudeDeg(new Date(presetMs(p, d)));
			expect(alt('noon')).toBeGreaterThan(25);
			expect(Math.abs(alt('sunset'))).toBeLessThan(0.5);
			expect(alt('golden')).toBeGreaterThan(2);
			expect(alt('golden')).toBeLessThan(12);
			expect(alt('dawn')).toBeLessThan(0);
			expect(alt('dawn')).toBeGreaterThan(-8);
			expect(alt('night')).toBeLessThan(-18);
		}
	});

	it('finds a full moon up in a dark sky, and a dark new-moon night', () => {
		const d = new Date(2026, 9, 23);
		const full = new Date(presetMs('fullMoon', d));
		expect(moonPosition(full).alt).toBeGreaterThan(30);
		expect(Math.abs(moonPosition(full).phase - 0.5)).toBeLessThan(0.04);
		expect(sunAltitudeDeg(full)).toBeLessThan(-12);
		const fresh = new Date(presetMs('newMoon', d));
		expect(Math.min(moonPosition(fresh).phase, 1 - moonPosition(fresh).phase)).toBeLessThan(0.04);
		expect(sunAltitudeDeg(fresh)).toBeLessThan(-18);
	});
});

describe('cleanScene', () => {
	it('keeps known keys of the right type only', () => {
		expect(cleanScene({ stars: false, starBright: 2, bogus: 1, moon: 'yes' })).toEqual({ stars: false, starBright: 2 });
		expect(cleanScene(null)).toEqual({});
	});

	it('never lets the contrast floor fall below 4.5', () => {
		expect(cleanScene({ contrast: 3 })).toEqual({ contrast: 4.5 });
	});
});
