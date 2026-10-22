import { describe, it, expect } from 'vitest';
import { sunAltitudeDeg, solarHour } from './sun';

process.env.TZ = 'America/Los_Angeles';   // Reno's clock; Node re-reads TZ on assignment

/** First minute after `from` when the sun's centre crosses -0.83° (refraction + radius). */
function crossing(from: Date, rising: boolean): Date {
	const d = new Date(from);
	for (let i = 0; i < 24 * 60; i++) {
		const a = sunAltitudeDeg(d), b = sunAltitudeDeg(new Date(d.getTime() + 60000));
		if (rising ? a < -0.83 && b >= -0.83 : a > -0.83 && b <= -0.83) return d;
		d.setTime(d.getTime() + 60000);
	}
	throw new Error('no crossing');
}

const hhmm = (d: Date) => d.getHours() * 60 + d.getMinutes();

describe('sun on the visitor clock, at Reno', () => {
	// Reference times: NOAA solar calculator, Reno NV.
	it('sets near 18:05 PDT on 2026-10-22', () => {
		const s = crossing(new Date(2026, 9, 22, 12), false);
		expect(Math.abs(hhmm(s) - (18 * 60 + 5))).toBeLessThanOrEqual(10);
	});
	it('sets near 16:50 PST on 2026-01-15', () => {
		const s = crossing(new Date(2026, 0, 15, 12), false);
		expect(Math.abs(hhmm(s) - (16 * 60 + 50))).toBeLessThanOrEqual(10);
	});
	it('rises near 05:33 PDT on 2026-06-21', () => {
		const s = crossing(new Date(2026, 5, 21, 0), true);
		expect(Math.abs(hhmm(s) - (5 * 60 + 33))).toBeLessThanOrEqual(10);
	});
	it('puts solar noon after 12:00 in daylight saving', () => {
		expect(solarHour(new Date(2026, 6, 1, 13, 0))).toBeCloseTo(12, 0);
	});
});
