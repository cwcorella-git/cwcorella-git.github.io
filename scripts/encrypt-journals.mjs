/**
 * encrypt-journals.mjs
 *
 * Reads .md and .txt files from a source directory, encrypts each with
 * AES-256-GCM (same scheme as admin docs), and writes:
 *   static/docs/private/journals-index.enc  — encrypted index (titles + slugs)
 *   static/docs/private/journals/<slug>.enc  — encrypted content per file
 *
 * Slugs are word-based (top nouns from content via compromise NLP).
 * By default, existing entries preserve their slugs (matched by title)
 * so re-running updates content without orphaning files.
 * Pass --reslug to regenerate word slugs for ALL entries (including
 * browser-created entries stored only as .enc files) and delete old files.
 *
 * Usage:
 *   node scripts/encrypt-journals.mjs <passphrase> [--reslug] [source-dir ...]
 *
 * source-dir defaults to ~/Documents/Writing/MD Files
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, statSync, existsSync, unlinkSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { homedir } from 'os';
import { webcrypto } from 'node:crypto';
import nlp from 'compromise';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

const args = process.argv.slice(2);
const passphrase = args.find(a => !a.startsWith('--') && !a.startsWith('/') && !a.startsWith('~') && !a.startsWith('.'));
const reslug = args.includes('--reslug');
const sourceDirArgs = args.filter(a => !a.startsWith('--') && a !== passphrase);
const sourceDirs = sourceDirArgs.length
  ? sourceDirArgs.map(d => resolve(d))
  : [join(homedir(), 'Documents/Writing/MD Files')];

if (!passphrase) {
  console.error('Usage: node scripts/encrypt-journals.mjs <passphrase> [--reslug] [source-dir ...]');
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

const STOPWORDS = new Set([
  // Pronouns
  'the', 'this', 'that', 'these', 'those',
  'they', 'them', 'their', 'theirs',
  'you', 'your', 'yours',
  'our', 'ours', 'we', 'us',
  'its', 'his', 'her', 'hers',
  'she', 'him', 'who', 'whom',
  // Conjunctions / prepositions
  'and', 'but', 'for', 'not', 'nor', 'yet', 'with', 'also', 'into', 'onto',
  'about', 'above', 'after', 'before', 'between', 'during', 'from', 'over',
  'under', 'upon', 'without',
  // Auxiliaries / modals
  'has', 'have', 'had', 'having',
  'can', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
  'are', 'was', 'were', 'been', 'being',
  // Determiners / quantifiers
  'all', 'any', 'each', 'both', 'few', 'more', 'most', 'other', 'some',
  'than', 'too', 'very', 'just', 'one', 'two', 'new', 'own',
  // Contractions with apostrophe stripped
  'weve', 'ive', 'youre', 'theyre', 'shes', 'hes', 'dont', 'wont',
  'cant', 'ill', 'didnt', 'isnt', 'wouldnt', 'couldnt', 'shouldnt',
  'havent', 'hasnt', 'wasnt', 'werent', 'thats', 'whats', 'theres',
  // Vague / generic nouns
  'thing', 'things', 'something', 'anything', 'everything', 'nothing',
  'someone', 'anyone', 'everyone',
  'way', 'ways', 'kind', 'sort', 'part', 'parts', 'bit', 'bits',
  'lot', 'lots', 'bunch', 'piece', 'pieces',
  // Vague location / directional
  'here', 'there', 'where', 'place', 'point',
  // Question words
  'how', 'what', 'when', 'why', 'which',
  // Common weak verbs that slip through NLP
  'said', 'says', 'say', 'got', 'get', 'gets', 'make', 'makes', 'made',
  'take', 'takes', 'took', 'come', 'comes', 'came', 'look', 'looks',
  'know', 'knew', 'think', 'thought', 'want', 'wants', 'need', 'needs',
  'going', 'goes', 'went', 'see', 'seen', 'saw', 'felt', 'feel', 'feels',
  // Informal / junk tokens
  'unk', 'amp', 'wut', 'rando', 'lol', 'lmao', 'etc', 'aka',
  // Known usernames in chat logs (Discord handles)
  'amglitch', 'pmglitch', 'pmchris', 'daveshap', 'guillaume',
  // Zim wiki / metadata terms
  'content', 'type', 'wiki', 'format', 'creation', 'modified', 'notebook', 'zim',
]);

// Valid English two-consonant word onsets — words starting with other
// two-consonant combos (e.g. "pm", "gm") are likely usernames or junk
const VALID_2_ONSET = new Set([
  'bl','br','cl','cr','dr','dw','fl','fr','gl','gr','kl','kr','kn',
  'pl','pr','sc','sf','sk','sl','sm','sn','sp','sq','st','sw','tr',
  'tw','wr','ch','sh','th','wh','ph','gn','mn',
]);
const VOWEL_SET = new Set('aeiou');

function hasValidOnset(word) {
  if (VOWEL_SET.has(word[0])) return true;
  if (!word[1] || VOWEL_SET.has(word[1])) return true;
  return VALID_2_ONSET.has(word[0] + word[1]);
}

function preprocess(text) {
  return text
    // Strip Zim wiki metadata headers
    .replace(/^[\w-]+:\s*\S[^\n]*/gm, (line) =>
      /^(content-type|wiki-format|creation-date|modified|tags|notebook)/i.test(line) ? '' : line
    )
    // Strip bare URLs and domains
    .replace(/https?:\S+/g, '')
    .replace(/\bwww\.\S+/g, '')
    .replace(/\b\w+\.(com|org|net|io|gov|edu|tv|co)\b/gi, '')
    // Strip filename-with-extension tokens
    .replace(/\b\w+\.(docx?|txt|text|pdf|md|png|jpe?g|gif)\b/gi, '')
    .replace(/^#{1,6}\s+/gm, '')
    // Replace word-splitting punctuation with spaces
    .replace(/[/\-_:]/g, ' ')
    .replace(/[*`~[\]()>]/g, '');
}

function generateSlugSync(text, usedSlugs) {
  const doc = nlp(preprocess(text));
  const nouns = doc.nouns().out('array');

  const freq = {};
  for (const phrase of nouns) {
    for (const word of phrase.split(/\s+/)) {
      const key = word.toLowerCase().replace(/[^a-z]/g, '');
      if (
        key.length >= 3 &&
        key.length <= 14 &&
        !STOPWORDS.has(key) &&
        /[aeiou]/.test(key) &&
        hasValidOnset(key)
      ) {
        freq[key] = (freq[key] ?? 0) + 1;
      }
    }
  }

  const ranked = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);

  const pool = ranked.slice(0, 6);
  while (pool.length < 2) pool.push(Math.random().toString(16).slice(2, 6));

  const top = pool.slice(0, Math.min(3, pool.length));
  const base = top.join('-');

  if (!usedSlugs.includes(base)) return base;

  for (let i = top.length; i < pool.length; i++) {
    const alt = [...top.slice(0, -1), pool[i]].join('-');
    if (!usedSlugs.includes(alt)) return alt;
  }

  let n = 2;
  while (usedSlugs.includes(`${base}-${n}`)) n++;
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

// ── load existing index ───────────────────────────────────────────────────

let existingIndex = [];
if (existsSync(INDEX_PATH)) {
  try {
    const enc = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
    const json = await decryptData(enc);
    existingIndex = JSON.parse(json);
    console.log(`Loaded existing index: ${existingIndex.length} entries\n`);
  } catch {
    console.warn('Could not decrypt existing index — check your passphrase.\n');
    process.exit(1);
  }
}

// title → existing entry map (used when NOT reslugging)
const titleToEntry = new Map(existingIndex.map(e => [e.title, e]));

// ── main ──────────────────────────────────────────────────────────────────

mkdirSync(JOURNALS_DIR, { recursive: true });

const EXTS = new Set(['.md', '.txt']);
const index = [];
const usedSlugs = [];

// Track which existing entries were covered by a source file
const coveredSlugs = new Set();

// ── pass 1: process source files ──────────────────────────────────────────

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

    let slug;
    if (!reslug && titleToEntry.has(title)) {
      slug = titleToEntry.get(title).slug;
    } else {
      slug = generateSlugSync(content, usedSlugs);
    }
    usedSlugs.push(slug);
    coveredSlugs.add(slug);

    const encrypted = await encryptData(content);
    writeFileSync(join(JOURNALS_DIR, `${slug}.enc`), JSON.stringify(encrypted));

    index.push({ slug, title, date });
    const changed = reslug || !titleToEntry.has(title);
    console.log(`${changed ? '+' : '✓'} ${file}`);
    console.log(`    slug: ${slug}   date: ${date}`);
  }
  console.log('');
}

// ── pass 2: reslug existing .enc-only entries (not from source files) ──────

if (reslug && existingIndex.length > 0) {
  const encOnlyEntries = existingIndex.filter(e => !coveredSlugs.has(e.slug));
  if (encOnlyEntries.length > 0) {
    console.log(`Reslugging ${encOnlyEntries.length} browser-created entries...\n`);
    for (const entry of encOnlyEntries) {
      const encPath = join(JOURNALS_DIR, `${entry.slug}.enc`);
      if (!existsSync(encPath)) {
        console.warn(`  ! missing file for "${entry.title}" (${entry.slug}) — skipping`);
        continue;
      }
      let content;
      try {
        const raw = JSON.parse(readFileSync(encPath, 'utf8'));
        content = await decryptData(raw);
      } catch {
        console.warn(`  ! could not decrypt "${entry.title}" (${entry.slug}) — skipping`);
        continue;
      }

      const newSlug = generateSlugSync(content, usedSlugs);
      usedSlugs.push(newSlug);

      const reencrypted = await encryptData(content);
      writeFileSync(join(JOURNALS_DIR, `${newSlug}.enc`), JSON.stringify(reencrypted));

      // Delete old file if slug changed
      if (newSlug !== entry.slug) {
        unlinkSync(encPath);
      }

      index.push({ slug: newSlug, title: entry.title, date: entry.date });
      console.log(`+ ${entry.title}`);
      console.log(`    ${entry.slug} → ${newSlug}`);
    }
    console.log('');
  }
} else if (!reslug) {
  // Preserve existing entries not covered by source files
  const encOnlyEntries = existingIndex.filter(e => !coveredSlugs.has(e.slug));
  for (const entry of encOnlyEntries) {
    usedSlugs.push(entry.slug);
    index.push(entry);
  }
}

// Encrypt the entire index so titles are not visible in the repo
const indexEnc = await encryptData(JSON.stringify(index));
writeFileSync(INDEX_PATH, JSON.stringify(indexEnc));

console.log(`\n✓ journals-index.enc written (${index.length} entries)`);
console.log('\nNext: git add static/docs/private/ && git commit && git push');
