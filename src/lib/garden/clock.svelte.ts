// The scene's clock (2026-10-23). Live by default; an admin can stop it on a
// chosen moment or run it fast, to see a sunset or a winter night without
// waiting for one. Kept in sessionStorage only: it is never saved for
// everyone, so visitors always see the real time.

import type { WeatherKind } from './weather';
import { sunAltitudeDeg } from './sun';
import { moonPosition } from './moon';

export type WeatherPick = 'auto' | WeatherKind | 'snow';

export interface ClockState {
	sim: boolean;
	at: number;        // scene ms at `anchor`
	anchor: number;    // real ms when `at` was set
	speed: number;     // scene seconds per real second
	weather: WeatherPick;
}

const KEY = 'cwc-scene-clock';
const LIVE: ClockState = { sim: false, at: 0, anchor: 0, speed: 1, weather: 'auto' };

function load(): ClockState {
	try {
		const s = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
		if (s && typeof s === 'object') return { ...LIVE, ...s };
	} catch { /* private window or bad JSON */ }
	return { ...LIVE };
}

export const clock = $state<ClockState & { version: number }>({
	...(typeof sessionStorage === 'undefined' ? LIVE : load()),
	version: 0,
});

/** Scene time in ms for a clock state, at real time `real`. Pure. */
export function sceneMsAt(c: ClockState, real: number): number {
	return c.sim ? c.at + (real - c.anchor) * c.speed : real;
}

export const sceneMs = (): number => sceneMsAt(clock, Date.now());
export const sceneNow = (): Date => new Date(sceneMs());

function save(): void {
	clock.version++;
	const { version: _, ...c } = clock;
	try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

/** Jump to a moment; the clock keeps running from there at the current speed. */
export function setSceneTime(ms: number): void {
	Object.assign(clock, { sim: true, at: ms, anchor: Date.now() });
	save();
}

export function setSceneSpeed(speed: number): void {
	const at = sceneMs();
	Object.assign(clock, { sim: true, at, anchor: Date.now(), speed });
	save();
}

export function setSceneWeather(weather: WeatherPick): void {
	clock.weather = weather;
	save();
}

export function goLive(): void {
	Object.assign(clock, LIVE);
	save();
}

/** `d` with its local time of day replaced by `minutes` after midnight. */
export function atMinutes(d: Date, minutes: number): number {
	const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	return t.getTime() + minutes * 60000;
}

/** `d` moved to day-of-year `doy` (1-based) of its own year, keeping the time of day. */
export function atDayOfYear(d: Date, doy: number): number {
	const t = new Date(d.getFullYear(), 0, doy, d.getHours(), d.getMinutes(), d.getSeconds());
	return t.getTime();
}

// ── presets ───────────────────────────────────────────────────────────────
// Found by stepping through the day, so they follow the same sun and moon the
// garden draws, in every season.

/** Minute of the local day (0–1439) when the sun crosses `alt` going up, and going down. */
export function sunCrossings(day: Date, alt = 0): { up: number; down: number; noon: number } {
	let up = -1, down = -1, noon = 720, best = -99;
	let prev = sunAltitudeDeg(new Date(atMinutes(day, 0)));
	for (let m = 1; m < 1440; m++) {
		const a = sunAltitudeDeg(new Date(atMinutes(day, m)));
		if (prev < alt && a >= alt && up < 0) up = m;
		if (prev >= alt && a < alt) down = m;
		if (a > best) { best = a; noon = m; }
		prev = a;
	}
	return { up, down, noon };
}

/** The first local date on or after `from` whose evening moon is nearest `phase` (0 new, 0.5 full). */
export function nextMoonDay(from: Date, phase: number): Date {
	let bestD = from, bestE = 9;
	for (let k = 0; k < 30; k++) {
		const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + k, 22);
		const p = moonPosition(d).phase, e = Math.min(Math.abs(p - phase), 1 - Math.abs(p - phase));
		if (e < bestE) { bestE = e; bestD = d; }
	}
	return bestD;
}

/** The night minute (sunset to the next sunrise) at which the moon stands highest on that date. */
export function moonHighMinute(day: Date): number {
	const { down } = sunCrossings(day, -12);
	let best = 23 * 60, bestAlt = -99;
	for (let m = down; m < down + 600; m += 10) {
		const a = moonPosition(new Date(atMinutes(day, m))).alt;
		if (a > bestAlt) { bestAlt = a; best = m; }
	}
	return best;
}

export type Preset = 'dawn' | 'morning' | 'noon' | 'golden' | 'sunset' | 'blue' | 'night' | 'fullMoon' | 'newMoon' | 'snow';

/** Scene ms for a preset, on the day of `d` (or the nearest fitting day). */
export function presetMs(p: Preset, d: Date): number {
	const s = sunCrossings(d);
	switch (p) {
		case 'dawn':    return atMinutes(d, s.up - 25);
		case 'morning': return atMinutes(d, s.up + 120);
		case 'noon':    return atMinutes(d, s.noon);
		case 'golden':  return atMinutes(d, s.down - 45);
		case 'sunset':  return atMinutes(d, s.down);
		case 'blue':    return atMinutes(d, s.down + 30);
		case 'night':   return atMinutes(d, s.down + 180);
		case 'fullMoon': { const m = nextMoonDay(d, 0.5); return atMinutes(m, moonHighMinute(m)); }
		case 'newMoon':  { const m = nextMoonDay(d, 0); return atMinutes(m, sunCrossings(m).down + 240); }
		case 'snow':     { const m = new Date(d.getFullYear(), 0, 15); return atMinutes(m, sunCrossings(m).noon - 90); }
	}
}
