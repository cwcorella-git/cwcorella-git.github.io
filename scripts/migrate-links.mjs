import { readFileSync, writeFileSync } from 'fs';

const books = JSON.parse(readFileSync('src/lib/books.json', 'utf8'));
const nameMap = { openlibrary: 'Open Library', anna: "Anna's Archive", goodreads: 'Goodreads' };

const migrated = books.map(b => {
	if (!b.links) return b;
	const arr = Object.entries(b.links)
		.filter(([, v]) => v)
		.map(([k, v]) => ({ name: nameMap[k] || k, url: v }));
	const { links: _, ...rest } = b;
	return arr.length ? { ...rest, links: arr } : rest;
});

writeFileSync('src/lib/books.json', JSON.stringify(migrated));
console.log('migrated', migrated.filter(b => b.links).length, 'books with links');
