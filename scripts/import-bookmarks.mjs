/**
 * import-bookmarks.mjs
 *
 * Parses Firefox/Netscape bookmark HTML exports, deduplicates, strips junk,
 * auto-categorizes, auto-tags, and optionally fetches real titles for
 * domain-only entries. Encrypts the result as links-index.enc.
 *
 * Usage:
 *   node scripts/import-bookmarks.mjs <passphrase> [--fetch-titles] [--dry-run]
 *
 * Reads three hardcoded bookmark files from ~/Downloads.
 * Output: static/docs/private/links-index.enc
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { webcrypto } from 'node:crypto';
import { randomBytes } from 'node:crypto';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

// ── args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const passphrase = args.find(a => !a.startsWith('--'));
const fetchTitles = args.includes('--fetch-titles');
const dryRun = args.includes('--dry-run');

if (!passphrase) {
  console.error('Usage: node scripts/import-bookmarks.mjs <passphrase> [--fetch-titles] [--dry-run]');
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────

const __dir = new URL('..', import.meta.url).pathname;
const OUTPUT_PATH = join(__dir, 'static/docs/private/links-index.enc');
const DOWNLOADS = join(homedir(), 'Downloads');

const SOURCE_FILES = [
  { path: join(DOWNLOADS, 'bookmarks.html'),                        source: '◇' },
  { path: join(DOWNLOADS, 'bookmarks_2_17_26.html'),                source: '○' },
  { path: join(DOWNLOADS, 'TEMP-bookmarks-to-delete-on-confirmation.html'), source: '□' },
];

// ── crypto (same as src/lib/admin/crypto.ts) ──────────────────────────────

function toB64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function encryptData(text) {
  const enc = new TextEncoder();
  const salt = getRandomValues(new Uint8Array(16));
  const iv   = getRandomValues(new Uint8Array(12));
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt']
  );
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  return { iv: toB64(iv), ct: toB64(ct), salt: toB64(salt) };
}

// ── ID generation ─────────────────────────────────────────────────────────

function nanoid(size = 12) {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(size);
  let id = '';
  for (let i = 0; i < size; i++) id += alphabet[bytes[i] % alphabet.length];
  return id;
}

// ── HTML parser ───────────────────────────────────────────────────────────

/**
 * Parse Netscape Bookmark HTML. Returns array of:
 *   { url, title, addDate, folders: string[] }
 */
function parseBookmarkHtml(html) {
  const bookmarks = [];
  const folderStack = [];

  const lines = html.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // Folder open: <DT><H3 ...>Name</H3>
    const folderMatch = trimmed.match(/<DT><H3[^>]*>(.+?)<\/H3>/i);
    if (folderMatch) {
      folderStack.push(folderMatch[1].replace(/&#\d+;/g, '').trim());
      continue;
    }

    // Folder close: </DL>
    if (trimmed.startsWith('</DL>')) {
      folderStack.pop();
      continue;
    }

    // Bookmark: <DT><A HREF="..." ADD_DATE="...">Title</A>
    const bookmarkMatch = trimmed.match(
      /<DT><A\s+HREF="([^"]+)"[^>]*?(?:ADD_DATE="(\d+)")?[^>]*>([^<]*)<\/A>/i
    );
    if (bookmarkMatch) {
      const [, rawUrl, addDateStr, title] = bookmarkMatch;
      bookmarks.push({
        url: unwrapUrl(rawUrl.trim()),
        title: decodeHtmlEntities(title.trim()),
        addDate: addDateStr ? parseInt(addDateStr, 10) : 0,
        folders: [...folderStack],
      });
    }
  }

  return bookmarks;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, '');
}

// ── junk detection ────────────────────────────────────────────────────────

const JUNK_PATTERNS = [
  /^file:\/\//i,
  /^chrome:/i,
  /^moz-extension:/i,
  /localhost/i,
  /127\.0\.0\.1/,
  /192\.168\.\d+\.\d+/,
  /\/login\b/i,
  /\/signin\b/i,
  /\/sign-in\b/i,
  /\/account\/login/i,
  /selectAccount=true/i,
  /ip-blocked/i,
];

const JUNK_EXACT_DOMAINS = new Set([
  'mail.google.com',
  'calendar.google.com',
]);

/**
 * Extract real URL from about:reader wrapper.
 * about:reader?url=https%3A%2F%2F... → decoded URL
 */
function unwrapUrl(url) {
  if (url.startsWith('about:reader?url=')) {
    try {
      return decodeURIComponent(url.slice('about:reader?url='.length));
    } catch { /* fall through */ }
  }
  return url;
}

function isJunk(url) {
  if (JUNK_PATTERNS.some(p => p.test(url))) return true;
  try {
    const u = new URL(url);
    if (JUNK_EXACT_DOMAINS.has(u.hostname)) return true;
    // Private IP in hostname (not in query params like DOIs)
    if (/^10\.\d+\.\d+\.\d+/.test(u.hostname)) return true;
  } catch {
    return true; // unparseable URL → junk
  }
  return false;
}

// ── domain-only title detection ───────────────────────────────────────────

function isDomainOnlyTitle(title, url) {
  if (!title || title.length === 0) return true;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    // Title is just the domain or a close match
    const cleaned = title.toLowerCase().replace(/^www\./, '').trim();
    if (cleaned === hostname) return true;
    // e.g. "sciencedirect.com" or "pmc.ncbi.nlm.nih.gov"
    if (hostname.includes(cleaned) || cleaned.includes(hostname.split('.')[0])) {
      // Only if title is very short (domain-like)
      if (cleaned.length < 40 && !cleaned.includes(' ')) return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ── auto-categorize ───────────────────────────────────────────────────────

/**
 * Category rules: domain heuristics first (most reliable for the unsorted bulk),
 * then folder path, then title keywords, then default.
 * The "Godot" and "Unsorted" folders are catch-alls so folder rules are de-prioritized.
 */

// Folders that are known catch-alls — skip folder categorization for these
const CATCHALL_FOLDERS = new Set(['unsorted', 'godot', 'bookmarks toolbar', 'bookmarks bar']);

const FOLDER_TO_CATEGORY = {
  'comics': 'Media',
  'media': 'Media',
  'watch': 'Media',
  'music': 'Media',
  'artists': 'Media',
  'godot shaders': 'Game Dev',
  'e-reader': 'Hardware',
  'server hardware': 'Hardware',
  'technology': 'Technology',
  'tools': 'Technology',
  'reading': 'Books',
  'authors': 'Books',
  'organizations': 'Organizations',
  'website': 'Technology',
  'marketing (examples)': 'Technology',
  'rstu contribution': 'Organizations',
};

const DOMAIN_TO_CATEGORY = {
  // Books
  'goodreads.com': 'Books',
  'bookseriesinorder.com': 'Books',
  // Media — comics, film, music, video, streaming
  'readcomiconline.li': 'Media',
  'readcomiconline.to': 'Media',
  'youtube.com': 'Media',
  'youtu.be': 'Media',
  'imdb.com': 'Media',
  '9anime.to': 'Media',
  'vimeo.com': 'Media',
  'instagram.com': 'Media',
  'popcornmovies.org': 'Media',
  '1movies.bz': 'Media',
  'genius.com': 'Media',
  'spotify.com': 'Media',
  'bandcamp.com': 'Media',
  'soundcloud.com': 'Media',
  'letterboxd.com': 'Media',
  // Game dev
  'godotengine.org': 'Game Dev',
  'godotshaders.com': 'Game Dev',
  // Technology
  'github.com': 'Technology',
  'gitlab.com': 'Technology',
  'stackoverflow.com': 'Technology',
  'npmjs.com': 'Technology',
  'huggingface.co': 'Technology',
  'research.nvidia.com': 'Technology',
  'dl.acm.org': 'Research',
  'claude.ai': 'Technology',
  'render.com': 'Technology',
  'cloudflare.com': 'Technology',
  'supabase.com': 'Technology',
  'vercel.com': 'Technology',
  'netlify.com': 'Technology',
  'heroku.com': 'Technology',
  'digitalocean.com': 'Technology',
  'n8n.io': 'Technology',
  'deepinfra.com': 'Technology',
  'cohere.com': 'Technology',
  'cerebrium.ai': 'Technology',
  'banana.dev': 'Technology',
  'pinecone.io': 'Technology',
  'milvus.io': 'Technology',
  'weaviate.io': 'Technology',
  'mongodb.com': 'Technology',
  'postgresql.org': 'Technology',
  // Research — academic, psychology, science
  'arxiv.org': 'Research',
  'sciencedirect.com': 'Research',
  'frontiersin.org': 'Research',
  'researchgate.net': 'Research',
  'pubmed.ncbi.nlm.nih.gov': 'Research',
  'pmc.ncbi.nlm.nih.gov': 'Research',
  'springer.com': 'Research',
  'link.springer.com': 'Research',
  'jstor.org': 'Research',
  'semanticscholar.org': 'Research',
  'philpapers.org': 'Research',
  'tandfonline.com': 'Research',
  'cambridge.org': 'Research',
  'academic.oup.com': 'Research',
  'journals.sagepub.com': 'Research',
  'psycnet.apa.org': 'Research',
  'apa.org': 'Research',
  'neurolaunch.com': 'Research',
  'neurosciencenews.com': 'Research',
  'wiley.com': 'Research',
  'nature.com': 'Research',
  'psychologytoday.com': 'Research',
  'positivepsychology.com': 'Research',
  'simplypsychology.org': 'Research',
  'paulekman.com': 'Research',
  'morphcast.com': 'Research',
  'verywellmind.com': 'Research',
  'healthline.com': 'Research',
  'psychcentral.com': 'Research',
  'plato.stanford.edu': 'Research',
  'sciencedaily.com': 'Research',
  'wikipedia.org': 'Research',
  // Hardware
  'digikey.com': 'Hardware',
  'pcbway.com': 'Hardware',
  'adafruit.com': 'Hardware',
  'mouser.com': 'Hardware',
  // Politics
  'theanarchistlibrary.org': 'Politics',
  'marxists.org': 'Politics',
  'libcom.org': 'Politics',
  'eff.org': 'Politics',
  'gnu.org': 'Politics',
  'fsf.org': 'Politics',
  'reddit.com': 'Personal',
  // History
  'archives.gov': 'History',
  'hathitrust.org': 'History',
  'archive.org': 'History',
  'lib.umich.edu': 'History',
  // More research / academic
  'courses.lumenlearning.com': 'Research',
  'taylorfrancis.com': 'Research',
  'britannica.com': 'Research',
  'medium.com': 'Research',
  'marktechpost.com': 'Technology',
  'anthropic.com': 'Technology',
  'docs.anthropic.com': 'Technology',
  // More media
  '9animes.org': 'Media',
  'soundtrack.net': 'Media',
  'mangadex.org': 'Media',
  'artstation.com': 'Media',
  'poetryfoundation.org': 'Media',
  'ranker.com': 'Media',
  'store.steampowered.com': 'Media',
  // More game dev
  'shadertoy.com': 'Game Dev',
  // More hardware
  'printables.com': 'Hardware',
  'bambulab.com': 'Hardware',
  'newegg.com': 'Hardware',
  'bhphotovideo.com': 'Hardware',
  'mcmaster.com': 'Hardware',
  'rdotdisplays.com': 'Hardware',
  'bluettipower.com': 'Hardware',
  // More politics
  'sproutdistro.com': 'Politics',
  'rebelsteps.com': 'Politics',
  'opencollective.com': 'Organizations',
  'legiscan.com': 'Politics',
  // More technology
  'nvidia.com': 'Technology',
  'docs.ipfs.tech': 'Technology',
  // Personal / shopping
  'etsy.com': 'Personal',
  'amazon.com': 'Personal',
  'indeed.com': 'Personal',
  'linkedin.com': 'Personal',
  'duckduckgo.com': 'Personal',
  'google.com': 'Personal',
  'reno.gov': 'Personal',
  'discord.com': 'Personal',
};

const TITLE_KEYWORD_CATEGORY = [
  { keywords: ['shader', 'godot', 'gdscript', 'game dev', 'game jam'], category: 'Game Dev' },
  { keywords: ['comic', 'manga', 'anime', 'film', 'movie', 'lofi', 'soundtrack', 'playlist'], category: 'Media' },
  { keywords: ['arduino', 'raspberry', 'e-ink', 'pcb', 'solder', 'meshtastic', 'lora', '3d print', 'filament', 'solar', 'battery', 'energy storage', 'fpga', 'microcontroller', 'esp32', 'rp2040'], category: 'Hardware' },
  { keywords: ['anarchi', 'marxis', 'mutual aid', 'tenant', 'abolition', 'union', 'workers', 'commune', 'praxis', 'neoliberal', 'socialist', 'capitalism', 'immigration', 'protest', 'ice chief', 'copyleft', 'free software', 'haymarket', 'rent abolish'], category: 'Politics' },
  { keywords: ['food not bombs', 'mutual aid monday', 'housing justice', 'tenant union', 'critical resistance', 'co-op', 'cooperative'], category: 'Organizations' },
  { keywords: ['archive', 'manuscript', 'labadie', 'reconstruction', 'civil war', 'primary source', 'ottoman', 'wwi', 'wwii', 'encyclopedia.*online'], category: 'History' },
  { keywords: ['emotion', 'psychology', 'schadenfreude', 'nostalgia', 'cognitive', 'neuroscience', 'ekman', 'ambivalent', 'substack'], category: 'Research' },
  { keywords: ['vector database', 'llm', 'machine learning', 'neural', 'hugging face', 'transformer', 'api', 'serverless', 'deploy', 'ethereum', 'blockchain', 'ipfs', 'devops', 'docker', 'kubernetes', 'geeksforgeeks', 'stackexchange', 'stack exchange'], category: 'Technology' },
  { keywords: ['notion', 'formextractor', 'wordtune', 'figma', 'excalidraw'], category: 'Technology' },
  { keywords: ['pentiment', 'game dev', 'emuparadise', 'tvtropes', 'itch.io'], category: 'Game Dev' },
  { keywords: ['substack', 'monthly review', 'essay', 'critique', 'theory'], category: 'Research' },
];

function categorize(bookmark) {
  // 1. Domain match (most reliable — handles the unsorted/godot catch-all bulk)
  try {
    const hostname = new URL(bookmark.url).hostname.replace(/^www\./, '');
    if (DOMAIN_TO_CATEGORY[hostname]) return DOMAIN_TO_CATEGORY[hostname];
    // Partial match: check if hostname ends with a known domain
    for (const [domain, cat] of Object.entries(DOMAIN_TO_CATEGORY)) {
      if (hostname.endsWith('.' + domain)) return cat;
    }
  } catch { /* ignore */ }

  // 2. Folder path match (skip catch-all folders)
  for (const folder of [...bookmark.folders].reverse()) {
    const key = folder.toLowerCase().replace(/[^\w\s]/g, '').trim();
    if (CATCHALL_FOLDERS.has(key)) continue;
    if (FOLDER_TO_CATEGORY[key]) return FOLDER_TO_CATEGORY[key];
  }

  // 3. Title keyword match
  const titleLower = bookmark.title.toLowerCase();
  const urlLower = bookmark.url.toLowerCase();
  for (const rule of TITLE_KEYWORD_CATEGORY) {
    if (rule.keywords.some(kw => titleLower.includes(kw) || urlLower.includes(kw))) {
      return rule.category;
    }
  }

  // 4. Default
  return 'Personal';
}

// ── auto-tag ──────────────────────────────────────────────────────────────

const TAG_RULES = [
  { pattern: /anarchi|libertarian\s+social|mutualis|kropotkin|bakunin/i, tag: 'anarchism' },
  { pattern: /marx|communist|socialist|capitalism|bourgeois/i, tag: 'socialism' },
  { pattern: /tenant|housing|rent|eviction|landlord/i, tag: 'housing' },
  { pattern: /prison|abolition|incarcerat|police|carceral/i, tag: 'abolition' },
  { pattern: /mutual\s+aid|food\s+not\s+bombs|solidarity/i, tag: 'mutual-aid' },
  { pattern: /emotion|affect|feeling|mood|sentiment/i, tag: 'emotion' },
  { pattern: /psychology|psych|cognitive|behavio/i, tag: 'psychology' },
  { pattern: /neurosci|brain|neural|cortex/i, tag: 'neuroscience' },
  { pattern: /schadenfreude/i, tag: 'schadenfreude' },
  { pattern: /nostalgia/i, tag: 'nostalgia' },
  { pattern: /ambival/i, tag: 'ambivalence' },
  { pattern: /shader|glsl|hlsl|visual\s+effect/i, tag: 'shaders' },
  { pattern: /godot/i, tag: 'godot' },
  { pattern: /blender|3d\s+model/i, tag: 'blender' },
  { pattern: /comic|graphic\s+novel|manga/i, tag: 'comics' },
  { pattern: /anime/i, tag: 'anime' },
  { pattern: /lofi|lo-fi|ambient|soundtrack|ost\b/i, tag: 'music' },
  { pattern: /youtube\.com|youtu\.be/i, tag: 'youtube' },
  { pattern: /meshtastic|lora\b|mesh\s+network/i, tag: 'mesh' },
  { pattern: /3d\s*print|filament|pla\b|petg/i, tag: '3d-printing' },
  { pattern: /solar|wind\s+energy|battery|energy\s+storage/i, tag: 'energy' },
  { pattern: /e-?ink|e-?reader|e-?paper/i, tag: 'e-reader' },
  { pattern: /vector\s+database|embedding|llm|language\s+model/i, tag: 'ai' },
  { pattern: /machine\s+learning|deep\s+learn|neural\s+net/i, tag: 'ml' },
  { pattern: /free\s+software|open\s+source|foss|gnu|copyleft/i, tag: 'foss' },
  { pattern: /archive|manuscript|primary\s+source|collection/i, tag: 'archives' },
  { pattern: /reno|nevada|washoe/i, tag: 'reno' },
  { pattern: /recipe|cook|food|bake/i, tag: 'food' },
  { pattern: /film|movie|cinema/i, tag: 'film' },
  { pattern: /book|novel|author|reading\s+list|goodreads/i, tag: 'books' },
];

function autoTag(bookmark) {
  const tags = [];
  const text = `${bookmark.title} ${bookmark.url}`;
  for (const rule of TAG_RULES) {
    if (rule.pattern.test(text)) tags.push(rule.tag);
  }
  return [...new Set(tags)];
}

// ── title fetching ────────────────────────────────────────────────────────

async function fetchTitle(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; bookmark-import/1.0)' },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;
    // Read only first 16KB to find <title>
    const reader = res.body.getReader();
    let text = '';
    while (text.length < 16384) {
      const { done, value } = await reader.read();
      if (done) break;
      text += new TextDecoder().decode(value, { stream: true });
      const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (match) {
        reader.cancel();
        return decodeHtmlEntities(match[1].trim()).slice(0, 200);
      }
    }
    reader.cancel();
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchTitlesInBatches(links, concurrency = 5) {
  const domainOnly = links.filter(l => l._needsTitle);
  if (domainOnly.length === 0) return;

  console.log(`\nFetching titles for ${domainOnly.length} domain-only entries (concurrency=${concurrency})...\n`);

  let fetched = 0;
  let failed = 0;

  for (let i = 0; i < domainOnly.length; i += concurrency) {
    const batch = domainOnly.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (link) => {
        const title = await fetchTitle(link.url);
        if (title && title !== link.title) {
          link.title = title;
          fetched++;
          return true;
        }
        failed++;
        return false;
      })
    );

    const done = i + batch.length;
    process.stdout.write(`  ${done}/${domainOnly.length} (${fetched} fetched, ${failed} failed)\r`);
  }

  console.log(`\n  Done: ${fetched} titles fetched, ${failed} unchanged\n`);
}

// ── main ──────────────────────────────────────────────────────────────────

console.log('import-bookmarks.mjs\n');

// Parse all source files
const allBookmarks = [];
for (const { path, source } of SOURCE_FILES) {
  let html;
  try {
    html = readFileSync(path, 'utf8');
  } catch {
    console.error(`Cannot read: ${path}`);
    process.exit(1);
  }
  const parsed = parseBookmarkHtml(html);
  for (const b of parsed) b.source = source;
  allBookmarks.push(...parsed);
  console.log(`${source} ${path.split('/').pop()}: ${parsed.length} bookmarks`);
}

console.log(`\nTotal raw: ${allBookmarks.length}`);

// Strip junk
const cleaned = allBookmarks.filter(b => !isJunk(b.url));
const junkCount = allBookmarks.length - cleaned.length;
console.log(`Junk removed: ${junkCount}`);

// Deduplicate by URL — diamond wins, then newest addDate
const urlMap = new Map();
for (const b of cleaned) {
  const existing = urlMap.get(b.url);
  if (!existing) {
    urlMap.set(b.url, b);
  } else {
    // Diamond (◇) always wins
    if (b.source === '◇' && existing.source !== '◇') {
      // Keep diamond's data but merge folder context
      b.folders = [...new Set([...b.folders, ...existing.folders])];
      urlMap.set(b.url, b);
    } else if (existing.source !== '◇' && b.addDate > existing.addDate) {
      // Neither is diamond — keep newest
      b.folders = [...new Set([...b.folders, ...existing.folders])];
      urlMap.set(b.url, b);
    }
    // Otherwise keep existing (it's diamond, or older but diamond)
  }
}

const unique = [...urlMap.values()];
console.log(`After dedup: ${unique.length} unique links`);

// Build LinkMeta objects
const links = unique.map(b => {
  const category = categorize(b);
  const tags = autoTag(b);
  const added = b.addDate
    ? new Date(b.addDate * 1000).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const needsTitle = isDomainOnlyTitle(b.title, b.url);

  return {
    id: nanoid(),
    url: b.url,
    title: b.title || new URL(b.url).hostname,
    category,
    tags,
    added,
    source: b.source,
    _needsTitle: needsTitle, // internal flag, stripped before output
  };
});

// Stats
const categoryStats = {};
for (const l of links) categoryStats[l.category] = (categoryStats[l.category] || 0) + 1;
console.log('\nCategories:');
Object.entries(categoryStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, n]) => console.log(`  ${cat}: ${n}`));

const sourceStats = {};
for (const l of links) sourceStats[l.source] = (sourceStats[l.source] || 0) + 1;
console.log('\nSources:');
Object.entries(sourceStats).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

const needsTitleCount = links.filter(l => l._needsTitle).length;
console.log(`\nDomain-only titles needing fetch: ${needsTitleCount}`);

// Fetch titles if requested
if (fetchTitles) {
  await fetchTitlesInBatches(links);
}

// Strip internal flags before output
const output = links.map(({ _needsTitle, ...rest }) => rest);

if (dryRun) {
  console.log('\n--- DRY RUN — no files written ---');
  console.log(`Would write ${output.length} links to ${OUTPUT_PATH}`);
  // Write a JSON preview to stdout for inspection
  const preview = output.slice(0, 5);
  console.log('\nSample (first 5):');
  console.log(JSON.stringify(preview, null, 2));
} else {
  // Encrypt and write
  mkdirSync(join(__dir, 'static/docs/private'), { recursive: true });
  const encrypted = await encryptData(JSON.stringify(output));
  writeFileSync(OUTPUT_PATH, JSON.stringify(encrypted));
  console.log(`\n✓ links-index.enc written (${output.length} entries)`);
  console.log('Next: git add static/docs/private/links-index.enc && git commit && git push');
}
