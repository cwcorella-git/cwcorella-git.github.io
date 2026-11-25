#!/usr/bin/env node
// Writes static/docs/public/resources.json from the saved-links catalogue.
// Workstation only (reads ~/Projects/apps/saved-links/catalog.json).
//
//   node scripts/export-public-links.mjs --dry-run
//   node scripts/export-public-links.mjs --confirm
//
// Exits non-zero if any entry marked public trips a leak gate: fix or unmark it
// (python3 mark_public.py --unmark ID in saved-links), never bypass the gate.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { selectPublic } from './lib/public-links.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = process.env.SAVED_LINKS_CATALOG ?? join(homedir(), 'Projects/apps/saved-links/catalog.json');
const OUT = join(HERE, '..', 'static', 'docs', 'public', 'resources.json');

const argv = process.argv.slice(2);
const confirm = argv.includes('--confirm');
if (confirm === argv.includes('--dry-run')) {
	console.error('pass exactly one of --dry-run / --confirm');
	process.exit(2);
}

const { entries } = JSON.parse(readFileSync(CATALOG, 'utf8'));
const { items, refused } = selectPublic(entries);
console.log(`catalogue: ${entries.length} entries; public: ${items.length}; refused: ${refused.length}`);
for (const r of refused) console.error(`REFUSED ${r.id}: ${r.why}`);
if (refused.length) process.exit(1);

if (confirm) {
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, JSON.stringify(items)); // minified, no trailing newline, like books.json
	console.log(`wrote ${OUT}`);
}
