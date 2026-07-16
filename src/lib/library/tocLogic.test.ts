import { describe, it, expect } from 'vitest';
import { tocNumber, condenseMeta, activeLabel } from './tocLogic';
import type { TocEntry } from '$lib/admin/markdown';

const e = (text: string, level: 1 | 2 | 3 = 2): TocEntry => ({
	level,
	text,
	anchor: text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-')
});

describe('tocNumber', () => {
	it('returns running ordinals', () => {
		expect(tocNumber([e('Intro'), e('Method'), e('Results')])).toEqual(['1', '2', '3']);
	});
	it('handles nested levels with a flat running counter', () => {
		expect(tocNumber([e('A', 1), e('B', 2), e('C', 3)])).toEqual(['1', '2', '3']);
	});
	it('returns [] for no entries', () => {
		expect(tocNumber([])).toEqual([]);
	});
});

describe('condenseMeta', () => {
	it('joins all present fields', () => {
		expect(condenseMeta({ author: 'Kropotkin', publication_date: '1892-01-01', language: 'EN' }))
			.toBe('Kropotkin · 1892 · en');
	});
	it('skips a missing author', () => {
		expect(condenseMeta({ author: null, publication_date: '2019', language: 'en' }))
			.toBe('2019 · en');
	});
	it('skips a missing date', () => {
		expect(condenseMeta({ author: 'X', publication_date: null, language: 'en' }))
			.toBe('X · en');
	});
	it('skips an em-dash author and empty language', () => {
		expect(condenseMeta({ author: '—', publication_date: '2001', language: '' }))
			.toBe('2001');
	});
	it('returns empty string when nothing qualifies', () => {
		expect(condenseMeta({ author: null, publication_date: null, language: '' })).toBe('');
	});
});

describe('activeLabel', () => {
	it('labels the active entry with its ordinal', () => {
		const entries = [e('Intro'), e('Method')];
		expect(activeLabel(entries, tocNumber(entries), 'method')).toBe('2. Method');
	});
	it('returns null when activeAnchor is null', () => {
		const entries = [e('Intro')];
		expect(activeLabel(entries, tocNumber(entries), null)).toBeNull();
	});
	it('returns null when activeAnchor matches no entry', () => {
		const entries = [e('Intro')];
		expect(activeLabel(entries, tocNumber(entries), 'nope')).toBeNull();
	});
});
