import { describe, it, expect } from 'vitest';
import { contrast, composite, lightFrame, metaFor, parseColor } from './contrast';
import { PALETTES, fixedAccent, fixedMeta } from './theme.svelte';

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
