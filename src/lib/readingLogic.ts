// Display order and letter guides for the reading list. Pure, so it is tested.
//
// books.json keeps its own order (it is written byte-identical by the in-browser
// sync, see CLAUDE.md), so sorting happens here, at display time, and never
// touches the data.

/** The text a title sorts by: leading quotes, brackets and punctuation removed. */
export function titleSortKey(title: string): string {
	return title.replace(/^[^\p{L}\p{N}]+/u, '').toLocaleLowerCase();
}

/** The guide a title files under: its first letter, '#' for a digit or anything else. */
export function guideLetter(title: string): string {
	const c = titleSortKey(title).charAt(0).toLocaleUpperCase();
	return /\p{Lu}/u.test(c) ? c : '#';
}

export function sortByTitle<T extends { title: string }>(items: readonly T[]): T[] {
	return [...items].sort((a, b) => titleSortKey(a.title).localeCompare(titleSortKey(b.title)));
}

/** "Author, year", or the author alone when the year is unknown. */
export function bookMeta(author: string, year?: number | null): string {
	return year ? `${author}, ${year}` : author;
}
