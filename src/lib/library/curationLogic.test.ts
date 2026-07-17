import { describe, it, expect } from 'vitest';
import { toggleDecision, badgeLabel, clampIndex, progressText } from './curationLogic';

describe('toggleDecision', () => {
	it('clicking a new decision selects it', () => {
		expect(toggleDecision(null, 'keep')).toBe('keep');
		expect(toggleDecision('hide', 'keep')).toBe('keep');
	});
	it('clicking the active decision clears to undecided', () => {
		expect(toggleDecision('keep', 'keep')).toBe('undecided');
	});
});

describe('badgeLabel', () => {
	it('maps decisions and null', () => {
		expect(badgeLabel('keep')).toBe('keep');
		expect(badgeLabel('delete')).toBe('delete');
		expect(badgeLabel(null)).toBe('');
	});
});

describe('clampIndex', () => {
	it('returns null when total is null or non-positive', () => {
		expect(clampIndex(3, null)).toBeNull();
		expect(clampIndex(3, 0)).toBeNull();
	});
	it('clamps into range', () => {
		expect(clampIndex(-1, 10)).toBe(0);
		expect(clampIndex(99, 10)).toBe(9);
		expect(clampIndex(4, 10)).toBe(4);
	});
});

describe('progressText', () => {
	it('empty when no stats', () => {
		expect(progressText(null)).toBe('');
	});
	it('formats decided / total', () => {
		expect(progressText({ keep: 2, hide: 1, delete: 0, decided: 3, total: 100417, undecided: 100414 }))
			.toBe('3 / 100,417 decided');
	});
});
