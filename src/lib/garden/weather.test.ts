import { describe, it, expect } from 'vitest';
import { weatherFor, weatherShares, snowFell, snowCover, snowChance, type WeatherKind } from './weather';

describe('weatherFor', () => {
	it('gives the same weather for the same day', () => {
		const a = weatherFor(new Date(2026, 9, 22, 8)), b = weatherFor(new Date(2026, 9, 22, 21));
		expect(a).toEqual(b);
	});

	it('changes from day to day', () => {
		const seeds = new Set(Array.from({ length: 30 }, (_, i) => weatherFor(new Date(2026, 0, 1 + i)).seed));
		expect(seeds.size).toBe(30);
	});

	it('matches the target shares over ten years', () => {
		const n: Record<WeatherKind, number> = { clear: 0, fair: 0, busy: 0, overcast: 0 };
		const want: Record<WeatherKind, number> = { clear: 0, fair: 0, busy: 0, overcast: 0 };
		for (let i = 0; i < 3650; i++) {
			const d = new Date(2026, 0, 1 + i);
			n[weatherFor(d).kind]++;
			const s = weatherShares(d.getMonth());
			for (const k of Object.keys(s) as WeatherKind[]) want[k] += s[k];
		}
		for (const k of Object.keys(n) as WeatherKind[]) expect(Math.abs(n[k] - want[k]) / 3650).toBeLessThan(0.05);
	});

	it('is overcast more often in winter', () => {
		let win = 0, sum = 0, wn = 0, sn = 0;
		for (let i = 0; i < 3650; i++) {
			const d = new Date(2026, 0, 1 + i), m = d.getMonth(), o = weatherFor(d).kind === 'overcast' ? 1 : 0;
			if (m === 11 || m <= 1) { win += o; wn++; } else if (m >= 5 && m <= 7) { sum += o; sn++; }
		}
		expect(win / wn).toBeGreaterThan(sum / sn + 0.08);
	});
});

describe('snow', () => {
	it('falls only in the cold months', () => {
		for (let i = 0; i < 3650; i++) {
			const d = new Date(2026, 0, 1 + i);
			if (snowChance(d.getMonth()) === 0) expect(snowFell(d)).toBe(false);
		}
	});

	it('falls a few days a winter', () => {
		let n = 0;
		for (let i = 0; i < 3650; i++) if (snowFell(new Date(2026, 0, 1 + i))) n++;
		expect(n / 10).toBeGreaterThan(4);
		expect(n / 10).toBeLessThan(16);
	});

	it('lies on the day it falls and melts over the next two', () => {
		const fell = Array.from({ length: 3650 }, (_, i) => new Date(2026, 0, 1 + i)).find((d) => snowFell(d) && !snowFell(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) && !snowFell(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 2)))!;
		const day = (k: number) => new Date(fell.getFullYear(), fell.getMonth(), fell.getDate() + k);
		expect(snowCover(day(0))).toBe(1);
		expect(snowCover(day(1))).toBeCloseTo(0.6);
		expect(snowCover(day(2))).toBeCloseTo(0.2);
		expect(weatherFor(day(0)).kind).toBe('overcast');
	});
});
