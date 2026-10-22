import { describe, expect, it } from 'vitest';
import { meadowLight, meadowSeason, type TerrainLight } from './terrain';

const light = (alt: number, dl: number): TerrainLight => ({
	az: 200, alt, sunCol: [255, 246, 228], sky: [150, 190, 230], night: [14, 18, 35],
	dl, fog: [200, 210, 220], beta: 0.3, snowLine: null,
});

describe('meadow season', () => {
	it('is green in July and straw in January', () => {
		expect(meadowSeason(196)).toBe(1);
		expect(meadowSeason(15)).toBe(0);
		expect(meadowSeason(300)).toBeGreaterThan(0);
		expect(meadowSeason(300)).toBeLessThan(1);
	});
});

describe('meadow light', () => {
	it('is about full at midday and far darker at dusk', () => {
		const noon = meadowLight(light(40, 1));
		const dusk = meadowLight(light(2, (2 + 6) / 12));
		expect(noon[1]).toBeGreaterThan(0.85);
		expect(dusk[1]).toBeLessThanOrEqual(noon[1] * 0.45);
	});
});
