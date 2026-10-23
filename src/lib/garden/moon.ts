// The moon where it really is (2026-10-23). A low-precision lunar position
// (Meeus ch. 47, the largest terms only: good to about a degree), turned into
// altitude at the garden and placed on screen the way the sun is: rising on the
// right, setting on the left, along its own arc. Pure, so it can be tested.

import { siderealDeg } from './stars';

const rad = Math.PI / 180;
const norm = (a: number) => ((a % 360) + 360) % 360;

export interface MoonPos {
	alt: number;      // degrees above the horizon
	xNorm: number;    // 1 = rising (right), 0 = setting (left), like sunXNorm
	phase: number;    // 0 new, 0.5 full, 1 new again
	waxing: boolean;
}

/** Ecliptic longitude of the sun and the moon, degrees, and the moon's latitude. */
function longitudes(d: Date): { sun: number; moon: number; beta: number } {
	const n = d.getTime() / 86400000 + 2440587.5 - 2451545;
	const g = (357.528 + 0.9856003 * n) * rad;
	const sun = norm(280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
	const L = 218.316 + 13.176396 * n, M = (134.963 + 13.064993 * n) * rad, F = (93.272 + 13.22935 * n) * rad;
	const D = (297.85 + 12.190749 * n) * rad;
	const moon = norm(L + 6.289 * Math.sin(M) + 1.274 * Math.sin(2 * D - M) + 0.658 * Math.sin(2 * D) - 0.186 * Math.sin(g));
	return { sun, moon, beta: 5.128 * Math.sin(F) };
}

export function moonPosition(d: Date, latDeg = 39.53): MoonPos {
	const { sun, moon, beta } = longitudes(d);
	const eps = 23.44 * rad, l = moon * rad, b = beta * rad;
	const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
	const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
	let h = norm(siderealDeg(d) - ra / rad);
	if (h > 180) h -= 360;                                 // hour angle, −180…180
	const lat = latDeg * rad;
	const alt = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h * rad)) / rad;
	const h0 = Math.acos(Math.max(-1, Math.min(1, -Math.tan(lat) * Math.tan(dec)))) / rad;   // half its arc above the horizon
	const elong = norm(moon - sun);
	return { alt, xNorm: Math.max(0, Math.min(1, 1 - (h + h0) / (2 * h0))), phase: elong / 360, waxing: elong < 180 };
}
