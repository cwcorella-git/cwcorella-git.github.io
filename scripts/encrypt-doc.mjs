#!/usr/bin/env node
/**
 * encrypt-doc.mjs
 *
 * Moves an already-exported public body to the admin-only surface: encrypts
 * static/docs/public/<name>.md to static/docs/private/<name>.enc with the same
 * AES-256-GCM / PBKDF2 scheme the browser admin uses (src/lib/admin/crypto.ts),
 * deletes the plaintext, and flips that book's doc.visibility to 'admin' in
 * books.json.
 *
 * THE PASSPHRASE IS READ FROM STDIN, NEVER FROM ARGV. A key passed as an
 * argument lands in shell history, in `ps` output, and in any transcript of the
 * session that ran it. encrypt-journals.mjs takes one on the command line and
 * should not.
 *
 *   node scripts/encrypt-doc.mjs --dry-run <name> [<name> ...]
 *   printf '%s' "$KEY" | node scripts/encrypt-doc.mjs --confirm <name> [...]
 *
 * <name> is the doc name as it appears in books.json (`65-anarchism-in-the-…`),
 * with or without the .md suffix.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const HERE = dirname(fileURLToPath(import.meta.url));
const BOOKS_JSON = join(HERE, '..', 'src', 'lib', 'books.json');
const PUBLIC_DIR = join(HERE, '..', 'static', 'docs', 'public');
const PRIVATE_DIR = join(HERE, '..', 'static', 'docs', 'private');

const argv = process.argv.slice(2);
const confirm = argv.includes('--confirm');
const dryRun = argv.includes('--dry-run');
const names = argv.filter((a) => !a.startsWith('--')).map((n) => basename(n, '.md'));
if (confirm === dryRun) { console.error('pass exactly one of --dry-run / --confirm'); process.exit(2); }
if (!names.length) { console.error('name at least one doc'); process.exit(2); }

const books = JSON.parse(readFileSync(BOOKS_JSON, 'utf8'));
const targets = [];
for (const name of names) {
	const book = books.find((b) => b.doc && b.doc.file === name);
	const src = join(PUBLIC_DIR, `${name}.md`);
	if (!book) { console.error(`  no book in books.json carries doc.file "${name}"`); process.exit(1); }
	if (!existsSync(src)) { console.error(`  no plaintext at ${src}`); process.exit(1); }
	if (book.doc.visibility === 'admin') { console.error(`  ${name} is already admin — refusing`); process.exit(1); }
	targets.push({ name, book, src });
}

for (const t of targets) {
	const words = readFileSync(t.src, 'utf8').split(/\s+/).filter(Boolean).length;
	console.log(`  ${t.name}  (${words}w, book ${t.book.id}) → docs/private/${t.name}.enc`);
}
if (dryRun) { console.log('\nDRY RUN — re-run with --confirm, piping the content key on stdin.'); process.exit(0); }

/** Byte-for-byte the scheme in src/lib/admin/crypto.ts — if these drift, the
 *  browser silently fails to decrypt and the doc reads as 'Incorrect content key'. */
async function encryptDoc(markdown, passphrase) {
	const enc = new TextEncoder();
	const salt = webcrypto.getRandomValues(new Uint8Array(16));
	const iv = webcrypto.getRandomValues(new Uint8Array(12));
	const material = await subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
	const key = await subtle.deriveKey(
		{ name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
		material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
	const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(markdown));
	const b64 = (b) => Buffer.from(b).toString('base64');
	return { iv: b64(iv), ct: b64(ct), salt: b64(salt) };
}

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const passphrase = Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
if (!passphrase) { console.error('no passphrase on stdin'); process.exit(2); }

mkdirSync(PRIVATE_DIR, { recursive: true });
let moved = 0;
for (const t of targets) {
	const md = readFileSync(t.src, 'utf8');
	const out = join(PRIVATE_DIR, `${t.name}.enc`);
	writeFileSync(out, JSON.stringify(await encryptDoc(md, passphrase)));
	// Verify before destroying the only plaintext copy.
	const back = JSON.parse(readFileSync(out, 'utf8'));
	if (!back.ct || !back.iv || !back.salt) { console.error(`  FAILED ${t.name}: malformed output`); rmSync(out); continue; }
	rmSync(t.src);
	t.book.doc = { file: t.name, visibility: 'admin' };
	moved++;
	console.log(`  moved ${t.name}`);
}
// Minified, no trailing newline — matches the admin write queue's serialization
// (state.svelte.ts), so the next in-browser sync does not churn the whole file.
writeFileSync(BOOKS_JSON, JSON.stringify(books));
console.log(`\n${moved} document(s) moved to the admin surface.`);
