import { describe, it, expect } from 'vitest';
import { cloudUniforms, coverFor, wrap64 } from './cloudField';

const base = { top: [252, 250, 246], shadow: [148, 160, 184], zenith: [30, 107, 158], horizon: [135, 206, 235], ground: [96, 104, 64] } as const;
const inp = (o = {}) => ({ ...base, top: [...base.top], shadow: [...base.shadow], zenith: [...base.zenith], horizon: [...base.horizon], ground: [...base.ground], cover: 0.4, altDeg: 30, lightAlt: 30, lightX: 0.3, tSec: 1.7e9, pace: 8, night: 0, ...o }) as Parameters<typeof cloudUniforms>[0];

describe('cloudField', () => {
	it('keeps time offsets small enough for a float', () => {
		const u = cloudUniforms(inp());
		for (const v of [...u.wind, ...u.wind2, u.rise]) expect(Math.abs(v)).toBeLessThan(64);
		expect(u.evo).toBeGreaterThanOrEqual(0); expect(u.evo).toBeLessThan(1);
	});
	it('wrap64 handles negatives', () => { expect(wrap64(-1)).toBe(63); expect(wrap64(65)).toBe(1); });
	it('light direction is a unit vector', () => {
		const u = cloudUniforms(inp({ lightAlt: -5, lightX: 0.8 }));
		expect(Math.hypot(...u.L)).toBeCloseTo(1, 6);
	});
	it('more cover lowers the threshold; overcast greys and drops the rim', () => {
		expect(cloudUniforms(inp({ cover: 0.9 })).th).toBeLessThan(cloudUniforms(inp({ cover: 0.2 })).th);
		const o = cloudUniforms(inp({ cover: 0.95 }));
		expect(o.grey).toBeGreaterThan(0.5); expect(o.backlit).toBeLessThan(0.1);
	});
	it('weather kinds map in order', () => {
		expect(coverFor('clear')).toBeLessThan(coverFor('fair'));
		expect(coverFor('fair')).toBeLessThan(coverFor('busy'));
		expect(coverFor('busy')).toBeLessThan(coverFor('overcast'));
	});
	it('same time, same sky', () => { expect(cloudUniforms(inp())).toEqual(cloudUniforms(inp())); });
});
