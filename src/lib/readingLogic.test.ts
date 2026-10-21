import { describe, it, expect } from 'vitest';
import { bookMeta, guideLetter, sortByTitle, titleSortKey } from './readingLogic';

describe('titleSortKey', () => {
	it('ignores a leading quote mark', () => {
		expect(titleSortKey('"Just Get to Know Your Neighbors"')).toBe('just get to know your neighbors"');
	});
	it('ignores curly quotes and brackets', () => {
		expect(titleSortKey('“Oh No, Not the A-Word”')).toMatch(/^oh no/);
		expect(titleSortKey('(Re)Reading')).toMatch(/^re\)reading/);
	});
});

describe('guideLetter', () => {
	it('files a quoted title under its first letter', () => {
		expect(guideLetter('"Just Get to Know Your Neighbors"')).toBe('J');
	});
	it('files digits under #', () => {
		expect(guideLetter('1984')).toBe('#');
	});
});

describe('sortByTitle', () => {
	it('sorts a quoted title among the Js, not above A', () => {
		const sorted = sortByTitle([
			{ title: '"Just Get to Know Your Neighbors"' },
			{ title: 'A Black Autonomy Reader' },
			{ title: 'Kill the Couple in Your Head' },
		]);
		expect(sorted.map((b) => b.title)).toEqual([
			'A Black Autonomy Reader',
			'"Just Get to Know Your Neighbors"',
			'Kill the Couple in Your Head',
		]);
	});
	it('does not mutate its input', () => {
		const input = [{ title: 'b' }, { title: 'a' }];
		sortByTitle(input);
		expect(input[0].title).toBe('b');
	});
});

describe('bookMeta', () => {
	it('joins author and year with a comma', () => {
		expect(bookMeta('James Herod', 2010)).toBe('James Herod, 2010');
	});
	it('omits a missing year', () => {
		expect(bookMeta('Anonymous', undefined)).toBe('Anonymous');
	});
});
