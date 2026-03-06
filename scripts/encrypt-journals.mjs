/**
 * encrypt-journals.mjs
 *
 * Reads .md and .txt files from a source directory, encrypts each with
 * AES-256-GCM (same scheme as admin docs), and writes:
 *   static/docs/private/journals-index.enc  — encrypted index (titles + slugs)
 *   static/docs/private/journals/<slug>.enc  — encrypted content per file
 *
 * Slugs are word-based (top nouns from content via compromise NLP) for new
 * entries. Existing entries preserve their slugs — matched by title — so
 * re-running updates content without orphaning files.
 * Titles are encrypted in the index, so no plaintext metadata is in the repo.
 *
 * Usage:
 *   node scripts/encrypt-journals.mjs <passphrase> [source-dir]
 *
 * source-dir defaults to ~/Documents/Writing/MD Files
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { homedir } from 'os';
import { webcrypto } from 'node:crypto';
import nlp from 'compromise';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

const passphrase = process.argv[2];
const sourceDirs = process.argv.slice(3).length
  ? process.argv.slice(3).map(d => resolve(d))
  : [join(homedir(), 'Documents/Writing/MD Files')];

if (!passphrase) {
  console.error('Usage: node scripts/encrypt-journals.mjs <passphrase> [source-dir ...]');
  process.exit(1);
}

const __dir = new URL('..', import.meta.url).pathname;
const JOURNALS_DIR = join(__dir, 'static/docs/private/journals');
const INDEX_PATH   = join(__dir, 'static/docs/private/journals-index.enc');

// ── crypto (same parameters as src/lib/admin/crypto.ts) ──────────────────

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}

function fromB64(str) {
  return Uint8Array.from(Buffer.from(str, 'base64'));
}

async function encryptData(text) {
  const enc = new TextEncoder();
  const salt = getRandomValues(new Uint8Array(16));
  const iv   = getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt']
  );
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(ct), salt: toB64(salt) };
}

async function decryptData(obj) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(obj.salt), iterations: 200000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.ct));
  return dec.decode(pt);
}

// ── helpers ───────────────────────────────────────────────────────────────

function generateSlugSync(text, existingSlugs) {
  const plain = text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~\[\]()>]/g, '')
    .replace(/https?:\S+/g, '');
  const doc = nlp(plain);
  const nouns = doc.nouns().out('array');
  const freq = {};
  for (const w of nouns) {
    const key = w.toLowerCase().replace(/[^a-z]/g, '');
    if (key.length >= 3) freq[key] = (freq[key] ?? 0) + 1;
  }
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);
  while (top.length < 2) top.push(Math.random().toString(16).slice(2, 6));
  let base = top.join('-');
  if (!existingSlugs.includes(base)) return base;
  let n = 2;
  while (existingSlugs.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function extractTitle(content, filename) {
  const headingMatch = content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  return basename(filename)
    .replace(/\.(md|txt)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
}

function extractDate(filename, statObj) {
  const match = basename(filename).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  return statObj.mtime.toISOString().slice(0, 10);
}

// ── load existing index to preserve slugs ─────────────────────────────────

let existingIndex = [];
if (existsSync(INDEX_PATH)) {
  try {
    const enc = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    const json = await decryptData(enc);
    existingIndex = JSON.parse(json);
    console.log(`Loaded existing index: ${existingIndex.length} entries\n`);
  } catch {
    console.warn('Could not decrypt existing index — will generate fresh slugs for all entries.\n');
  }
}

// title → existing slug map
const titleToSlug = new Map(existingIndex.map(e => [e.title, e.slug]));

// ── main ──────────────────────────────────────────────────────────────────

mkdirSync(JOURNALS_DIR, { recursive: true });

const EXTS = new Set(['.md', '.txt']);
const index = [];
const usedSlugs = [...existingIndex.map(e => e.slug)];

for (const sourceDir of sourceDirs) {
  let sourceFiles;
  try {
    sourceFiles = readdirSync(sourceDir)
      .filter(f => EXTS.has(extname(f).toLowerCase()))
      .sort();
  } catch {
    console.error(`Cannot read source directory: ${sourceDir}`);
    process.exit(1);
  }

  console.log(`Source : ${sourceDir}`);
  console.log(`Found  : ${sourceFiles.length} files\n`);

  for (const file of sourceFiles) {
    const filePath = join(sourceDir, file);
    const content  = readFileSync(filePath, 'utf8');
    const stat     = statSync(filePath);
    const title    = extractTitle(content, file);
    const date     = extractDate(file, stat);

    // Reuse existing slug if title matches, otherwise generate a new word slug
    let slug = titleToSlug.get(title);
    if (!slug) {
      slug = generateSlugSync(content, usedSlugs);
      usedSlugs.push(slug);
    }

    const encrypted = await encryptData(content);
    writeFileSync(join(JOURNALS_DIR, `${slug}.enc`), JSON.stringify(encrypted));

    index.push({ slug, title, date });
    const isNew = !titleToSlug.has(title);
    console.log(`${isNew ? '+' : '✓'} ${file}`);
    console.log(`    slug: ${slug}   date: ${date}${isNew ? '  [new]' : ''}`);
  }
  console.log('');
}

// Encrypt the entire index so titles are not visible in the repo
const indexEnc = await encryptData(JSON.stringify(index));
writeFileSync(INDEX_PATH, JSON.stringify(indexEnc));

console.log(`\n✓ journals-index.enc written (${index.length} entries)`);
console.log('\nNext: git add static/docs/private/ && git commit && git push');
