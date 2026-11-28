import { describe, it, expect } from 'vitest';
import { coverFromPercent, parseReply } from './localSky';

describe('localSky', () => {
	it('maps percent to a cover that is never fully clear or shut', () => {
		expect(coverFromPercent(0)).toBeCloseTo(0.05); expect(coverFromPercent(100)).toBeCloseTo(0.95);
		expect(coverFromPercent(50)!).toBeGreaterThan(coverFromPercent(20)!);
	});
	it('rejects bad values', () => {
		for (const v of [-1, 101, NaN, '50', null, undefined]) expect(coverFromPercent(v)).toBeNull();
	});
	it('reads the reply and survives junk', () => {
		expect(parseReply({ current: { cloud_cover: 40 } })).toBeCloseTo(0.41);
		for (const j of [null, {}, { current: {} }, { current: { cloud_cover: 'x' } }, 'oops']) expect(parseReply(j)).toBeNull();
	});
});
