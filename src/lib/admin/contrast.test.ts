import { describe, it, expect } from 'vitest';
import { contrast, composite, lightFrame, metaFor, parseColor } from './contrast';
import { PALETTES, fixedAccent, fixedMeta } from './theme.svelte';
import { SKY_KF, skyColorsAt } from '$lib/garden/backdrop';

describe('every palette is legible (text, --clr-meta and accent >= 4.5:1 on its panel)', () => {
	for (const [name, p] of Object.entries(PALETTES)) {
		if (p.darkGlass) {
			it(`${name} (fixed)`, () => {
				const g = parseColor(p.glassFixed!);
				const panel = composite(g.rgb, g.alpha, parseColor(p.bodyBg).rgb);
				expect(contrast(p.textDay, panel)).toBeGreaterThanOrEqual(4.5);
				expect(contrast(fixedMeta(p), panel)).toBeGreaterThanOrEqual(4.5);
				expect(contrast(fixedAccent(p), panel)).toBeGreaterThanOrEqual(4.5);
			});
		} else {
			// Every 5% of the day↔night swing, so a dip through twilight is caught —
			// that dip (1.3:1 at dl≈0.05) is the bug lightFrame was written for.
			it(`${name} through the whole day`, () => {
				for (let i = 0; i <= 20; i++) {
					const dl = i / 20;
					const f = lightFrame(p, dl);
					expect(contrast(f.text, f.panel), `${name} text at dl=${dl}`).toBeGreaterThanOrEqual(4.5);
					expect(contrast(f.meta, f.panel), `${name} meta at dl=${dl}`).toBeGreaterThanOrEqual(4.5);
					expect(contrast(f.accent, f.panel), `${name} accent at dl=${dl}`).toBeGreaterThanOrEqual(4.5);
				}
			});
		}
	}
});

describe('metaFor', () => {
	it('softens toward the panel but never under 4.5:1', () => {
		const m = metaFor([237, 237, 237], [18, 18, 18]);
		expect(m[0]).toBeLessThan(237);
		expect(contrast(m, [18, 18, 18])).toBeGreaterThanOrEqual(4.5);
	});
});

describe('sky over the garden is legible at every sun altitude', () => {
	// Sky.svelte: dl from altitude, backdrop = the garden's mid and lower sky bands.
	const p = PALETTES.sky;
	it('text, meta and accent >= 4.5:1 on every band, -20° to 60°', () => {
		for (let a = -20; a <= 60; a += 0.25) {
			const dl = Math.max(0, Math.min(1, (a + 12) / 18));
			const { mid, lower } = skyColorsAt(a);
			const f = lightFrame(p, dl, [mid, lower]);
			for (const band of [mid, lower]) {
				const panel = composite(f.glass, f.glassAlpha, band);
				expect(contrast(f.text, panel), `text at ${a}°`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(f.meta, panel), `meta at ${a}°`).toBeGreaterThanOrEqual(4.5);
				expect(contrast(f.accent, panel), `accent at ${a}°`).toBeGreaterThanOrEqual(4.5);
			}
		}
	});
	it('the backdrop keyframes match the ones Garden.svelte draws', async () => {
		const src = (await import('node:fs')).readFileSync('src/lib/components/Garden.svelte', 'utf8');
		for (const k of SKY_KF) {
			const row = `{ alt: ${k.alt}, zenith: [${k.zenith}] as RGB, mid: [${k.mid}] as RGB, lower: [${k.lower}] as RGB, horizon: [${k.horizon}] as RGB }`;
			const nums = (s: string) => s.replace(/\s+/g, '');
			expect(nums(src), `keyframe ${k.alt}`).toContain(nums(row));
		}
	});
});
