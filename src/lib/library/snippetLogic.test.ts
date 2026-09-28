import { describe, it, expect } from 'vitest';
import { splitSnippet, MARK_OPEN, MARK_CLOSE } from './snippetLogic';

const m = (s: string) => MARK_OPEN + s + MARK_CLOSE;

describe('splitSnippet', () => {
	it('splits a marked snippet into plain and highlighted runs', () => {
		expect(splitSnippet(`Mutual aid is a factor in ${m('evolution')} among animals`)).toEqual([
			{ text: 'Mutual aid is a factor in ', hit: false },
			{ text: 'evolution', hit: true },
			{ text: ' among animals', hit: false }
		]);
	});

	it('keeps several highlights in one snippet', () => {
		expect(splitSnippet(`${m('workers')} of the ${m('world')}`)).toEqual([
			{ text: 'workers', hit: true },
			{ text: ' of the ', hit: false },
			{ text: 'world', hit: true }
		]);
	});

	it('renders nothing when the snippet carries no highlight', () => {
		// The title-only match: fts5 returns the opening words of the body with no
		// marks. A preview, not a reason -- so no line.
		expect(splitSnippet('Chapter one. The state of nature, and why…')).toEqual([]);
	});

	it('renders nothing for a missing, empty or non-string field', () => {
		expect(splitSnippet(undefined)).toEqual([]);
		expect(splitSnippet(null)).toEqual([]);
		expect(splitSnippet('')).toEqual([]);
		expect(splitSnippet(42 as unknown as string)).toEqual([]);
		expect(splitSnippet({} as unknown as string)).toEqual([]);
	});

	it('runs an unpaired open to the end rather than losing the highlight', () => {
		expect(splitSnippet(`the ${MARK_OPEN}commune`)).toEqual([
			{ text: 'the ', hit: false },
			{ text: 'commune', hit: true }
		]);
	});

	it('discards a stray close and does not throw', () => {
		expect(splitSnippet(`a${MARK_CLOSE}b${m('c')}`)).toEqual([
			{ text: 'ab', hit: false },
			{ text: 'c', hit: true }
		]);
	});

	it('ignores a nested open instead of breaking the run', () => {
		expect(splitSnippet(`${MARK_OPEN}fede${MARK_OPEN}ration${MARK_CLOSE}`)).toEqual([
			{ text: 'federation', hit: true }
		]);
	});

	it('produces no empty parts when marks sit at either end', () => {
		expect(splitSnippet(m('anarchism'))).toEqual([{ text: 'anarchism', hit: true }]);
		expect(splitSnippet(`${m('a')}${m('b')}`)).toEqual([
			{ text: 'a', hit: true },
			{ text: 'b', hit: true }
		]);
	});

	it('treats markup in the body as literal text', () => {
		// The parser is not HTML-aware and must not be: the components emit real
		// <mark> elements, so Svelte escapes every part on the way out.
		expect(splitSnippet(`see ${m('<script>')} & "quotes"`)).toEqual([
			{ text: 'see ', hit: false },
			{ text: '<script>', hit: true },
			{ text: ' & "quotes"', hit: false }
		]);
	});

	it('keeps the ellipsis fts5 puts at a cut edge', () => {
		expect(splitSnippet(`…the ${m('union')} hall…`)).toEqual([
			{ text: '…the ', hit: false },
			{ text: 'union', hit: true },
			{ text: ' hall…', hit: false }
		]);
	});
});
