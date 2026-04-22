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
 * Modes:
 *   (default)  — full overwrite from ~/Downloads source files
 *   --merge    — load existing links-index.enc, dedup, append new from ~/Desktop/bookmarks.html
 *
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
const mergeMode = args.includes('--merge');
const retagAll = args.includes('--retag-all');
const fetchTitles = args.includes('--fetch-titles');
const dryRun = args.includes('--dry-run');

if (!passphrase) {
  console.error('Usage: node scripts/import-bookmarks.mjs <passphrase> [--merge] [--fetch-titles] [--dry-run]');
  process.exit(1);
}

// ── paths ─────────────────────────────────────────────────────────────────

const __dir = new URL('..', import.meta.url).pathname;
const OUTPUT_PATH = join(__dir, 'static/docs/private/links-index.enc');
const DOWNLOADS = join(homedir(), 'Downloads');

const MERGE_SOURCE = join(homedir(), 'Desktop', 'bookmarks.html');

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

function fromB64(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

async function decryptData(obj) {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const keyMaterial = await subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(obj.salt), iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.ct));
  return dec.decode(pt);
}

// ── URL normalization (for dedup) ────────────────────────────────────────

// Domains where query params are noise (product ID is in the path)
const STRIP_QUERY_DOMAINS = new Set([
  'newegg.com', 'amazon.com', 'etsy.com', 'bhphotovideo.com',
  'adorama.com', 'pcpartpicker.com', 'homedepot.com', 'store.steampowered.com',
]);

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    const bare = u.hostname.replace(/^www\./, '');
    let path = u.pathname.replace(/\/+$/, '') || '/';
    // Strip query params for shopping/product domains
    const search = STRIP_QUERY_DOMAINS.has(bare) ? '' : u.search;
    return `${u.protocol}//${u.host}${path}${search}`;
  } catch {
    return url.toLowerCase().replace(/\/+$/, '');
  }
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
  'gamedev': 'Game Dev',
  'e-reader': 'Hardware',
  'server hardware': 'Hardware',
  'technology': 'Technology',
  'tools': 'Technology',
  'hugging face': 'Technology',
  'github': 'Technology',
  'reading': 'Books',
  'authors': 'Books',
  'organizations': 'Organizations',
  'website': 'Technology',
  'marketing (examples)': 'Technology',
  'rstu contribution': 'Organizations',
  'sourced': 'Research',
  'references': 'Research',
  'research': 'Research',
  'work': 'Personal',
  'to source': 'Personal',
  'to scrape': 'Personal',
  'reddit': 'Personal',
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
  'itsgoingdown.org': 'Politics',
  'youngcommunists.org': 'Politics',
  'workerorganizing.org': 'Politics',
  'weareultraviolet.org': 'Politics',
  'nonviolent-conflict.org': 'Politics',
  'unicornriot.ninja': 'Politics',
  'workingclasshistory.com': 'Politics',
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
  'webtoons.com': 'Media',
  'allmanga.to': 'Media',
  'emuparadise.me': 'Media',
  'readcomiconline.to': 'Media',
  // More game dev
  'shadertoy.com': 'Game Dev',
  'moddb.com': 'Game Dev',
  // More hardware
  'printables.com': 'Hardware',
  'bambulab.com': 'Hardware',
  'us.store.bambulab.com': 'Hardware',
  'newegg.com': 'Hardware',
  'bhphotovideo.com': 'Hardware',
  'mcmaster.com': 'Hardware',
  'rdotdisplays.com': 'Hardware',
  'bluettipower.com': 'Hardware',
  'homedepot.com': 'Hardware',
  'adorama.com': 'Hardware',
  'pcpartpicker.com': 'Hardware',
  // More politics
  'sproutdistro.com': 'Politics',
  'rebelsteps.com': 'Politics',
  'opencollective.com': 'Organizations',
  'legiscan.com': 'Politics',
  'nvchwa.org': 'Organizations',
  'nevadacertboard.org': 'Organizations',
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
  'duolingo.com': 'Personal',
  'kickstarter.com': 'Personal',
};

// ── Reddit subreddit categorization ──────────────────────────────────────

const SUBREDDIT_CATEGORY = {
  'vibecoding': 'Technology',
  'VibeCodersNest': 'Technology',
  'ClaudeCode': 'Technology',
  'GeminiAI': 'Technology',
  'TopologyAI': 'Technology',
  'LocalLLaMA': 'Technology',
  'MachineLearning': 'Technology',
  'programming': 'Technology',
  'linux': 'Technology',
  'linux_gaming': 'Technology',
  'selfhosted': 'Technology',
  'Blender': 'Game Dev',
  'godot': 'Game Dev',
  'gamedev': 'Game Dev',
  'IndieDev': 'Game Dev',
  'askphilosophy': 'Research',
  'philosophy': 'Research',
  'neuroscience': 'Research',
  'psychology': 'Research',
  'AskHistorians': 'History',
  'Anarchism': 'Politics',
  'socialism': 'Politics',
  'antiwork': 'Politics',
  'SteamDeck': 'Hardware',
  'MechanicalKeyboards': 'Hardware',
  '3Dprinting': 'Hardware',
  'Meshtastic': 'Hardware',
  'solopreneur': 'Personal',
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
  // 1. Reddit subreddit-specific categorization
  try {
    const u = new URL(bookmark.url);
    const hostname = u.hostname.replace(/^www\./, '');
    if (hostname === 'reddit.com' || hostname === 'old.reddit.com') {
      const subMatch = u.pathname.match(/^\/r\/([^/]+)/);
      if (subMatch && SUBREDDIT_CATEGORY[subMatch[1]]) return SUBREDDIT_CATEGORY[subMatch[1]];
    }
  } catch { /* ignore */ }

  // 2. Domain match (most reliable — handles the unsorted/godot catch-all bulk)
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
  { pattern: /imdb\.com/i, tag: 'imdb' },
  { pattern: /github\.com/i, tag: 'github' },
  { pattern: /huggingface\.co/i, tag: 'huggingface' },
  { pattern: /wikipedia\.org/i, tag: 'wikipedia' },
  { pattern: /store\.steampowered\.com|\bsteam\b/i, tag: 'steam' },
  { pattern: /sciencedirect|pmc\.ncbi|pubmed|journals\.sagepub|arxiv\.org|jstor\.org|researchgate|link\.springer|dl\.acm\.org|philpapers|plato\.stanford|academic\.oup/i, tag: 'academic-paper' },
  { pattern: /poetryfoundation|\bpoetry\b|\bpoem\b/i, tag: 'poetry' },
  { pattern: /genius\.com|\blyrics\b/i, tag: 'lyrics' },
  { pattern: /artstation|deviantart|concept\s+art/i, tag: 'art' },
  { pattern: /designboom|\barchitect\b|architecture/i, tag: 'architecture' },
  { pattern: /\bipfs\b|\bipns\b|dnslink/i, tag: 'ipfs' },
  { pattern: /legiscan|\bbill\b\s+(?:no|number)|\bstatute\b|legislature|assembly\s+bill|senate\s+bill/i, tag: 'legislation' },
  { pattern: /deleteme|\bprivacy\b|surveillance|\btracking\b/i, tag: 'privacy' },
  { pattern: /cloudflare/i, tag: 'cloudflare' },
  { pattern: /\bnlp\b|natural\s+language|text-to-speech|\btts\b|speech\s+synthesis|voice\s+clon|whisper/i, tag: 'nlp' },
  { pattern: /unitree|\brobot\b|servo|actuator|robotics/i, tag: 'robotics' },
  { pattern: /civil\s+war|confedera|battle\s+cry\s+of\s+freedom|marching\s+through\s+georgia|uncle\s+sam/i, tag: 'civil-war' },
  { pattern: /\bamd\b|radeon|\bryzen\b|\bgpu\b|graphics\s+card|nvidia|geforce/i, tag: 'gpu' },
  { pattern: /motion\s+capture|character\s+animation|3d\s+human|rigging/i, tag: '3d-animation' },
  { pattern: /reinforcement\s+learn|\brlhf\b|reward\s+model/i, tag: 'reinforcement-learning' },
  { pattern: /philosophy|sociocracy|self-decept|\bempathy\b|epistemol|ontolog/i, tag: 'philosophy' },
  { pattern: /\blying\b|\bliar\b|decept|\bdeception\b/i, tag: 'deception' },
  { pattern: /reddit\.com/i, tag: 'reddit' },
  { pattern: /claude\.ai|anthropic\.com|claude\s+code/i, tag: 'anthropic' },
  { pattern: /self-host|homelab|pi-?hole|nextcloud|yunohost/i, tag: 'self-hosting' },
  { pattern: /\bai\b.*(?:platform|tool|assistant|model|generator|workspace|studio|api|workspace)|\b(?:platform|tool|assistant|workspace|studio)\b.*\bai\b|generative.*ai|ai.*generative/i, tag: 'generative-ai' },
  { pattern: /\bapi\b|api\s+(?:reference|documentation|platform)/i, tag: 'api' },
  { pattern: /\baudio\b|daw|digital\s+audio|sound\s+design|music\s+production/i, tag: 'audio' },
  { pattern: /video\s+(?:generation|synthesis|edit)|generate.*video|text-to-video/i, tag: 'video-generation' },
  { pattern: /no-?code|low-?code|visual\s+programming|drag.*drop/i, tag: 'no-code' },
  { pattern: /\bdocs?\b|documentation|reference\s+manual|api\s+docs|guide/i, tag: 'docs' },
  { pattern: /\btutorial\b|learn|course|lesson|guide|how-?to/i, tag: 'learning' },
  { pattern: /\bsaas\b|software\s+as\s+a\s+service|web\s+app(?!.*framework)/i, tag: 'saas' },
  { pattern: /devops|ci\/cd|deployment|container|docker|kubernetes/i, tag: 'devops' },
  { pattern: /file\s+(?:convert|format)|conversion\s+tool/i, tag: 'file-conversion' },
  { pattern: /database|sql|nosql|postgres|mongodb|redis/i, tag: 'database' },
  { pattern: /framework|library|sdk|package|module/i, tag: 'framework' },
  { pattern: /chatgpt|gpt-\d|stable\s+diffusion|midjourney|claude|gemini/i, tag: 'generative-ai' },
  { pattern: /\bmedium\.com|substack|blog|newsletter/i, tag: 'blog' },
  { pattern: /discord|slack|telegram|irc|chat\s+server|community\s+forum/i, tag: 'community' },
  { pattern: /kickstarter|indiegogo|crowdfund/i, tag: 'crowdfunding' },
  { pattern: /mental\s+health|anxiety|depression|therapy|wellbeing/i, tag: 'mental-health' },
  { pattern: /human\s+right|digital\s+right|freedom|civil\s+liberties|eff\.org/i, tag: 'human-rights' },
  { pattern: /\bcrypto\b|bitcoin|ethereum|blockchain|web3|defi/i, tag: 'crypto' },
  { pattern: /\bnews\b|journalism|magazine|publication|times|guardian|reuters|bbc/i, tag: 'news' },
  { pattern: /university\s+press|academic\s+book|scholarly/i, tag: 'academic-book' },
  { pattern: /instagram|twitter|facebook|tiktok|snapchat|mastodon|bluesky/i, tag: 'social-media' },
  { pattern: /security|encryption|vpn|privacy\s+tool|tor|anonymous/i, tag: 'security' },
  { pattern: /vr|virtual\s+reality|metaverse|xr|spatial/i, tag: 'vr' },
  { pattern: /newsletter|email\s+list|subscription|substack/i, tag: 'newsletter' },
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

console.log(`import-bookmarks.mjs${mergeMode ? ' (merge mode)' : ''}\n`);

// ── Load existing index (merge mode) ─────────────────────────────────────

let existingLinks = [];
let existingUrls = new Set();

if (mergeMode) {
  try {
    const enc = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
    const json = await decryptData(enc);
    existingLinks = JSON.parse(json);
    for (const l of existingLinks) existingUrls.add(normalizeUrl(l.url));
    console.log(`Existing index: ${existingLinks.length} links`);
  } catch (e) {
    console.error('Failed to decrypt links-index.enc — check passphrase');
    console.error(e.message);
    process.exit(1);
  }
}

// ── Parse source files ───────────────────────────────────────────────────

const allBookmarks = [];

if (mergeMode) {
  // Merge: single file from Desktop
  let html;
  try {
    html = readFileSync(MERGE_SOURCE, 'utf8');
  } catch {
    console.error(`Cannot read: ${MERGE_SOURCE}`);
    process.exit(1);
  }
  const parsed = parseBookmarkHtml(html);
  allBookmarks.push(...parsed);
  console.log(`${MERGE_SOURCE.split('/').pop()}: ${parsed.length} bookmarks`);
} else {
  // Full overwrite: multiple source files from Downloads
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
}

console.log(`\nTotal raw: ${allBookmarks.length}`);

// Strip junk
const cleaned = allBookmarks.filter(b => !isJunk(b.url));
const junkCount = allBookmarks.length - cleaned.length;
console.log(`Junk removed: ${junkCount}`);

// Deduplicate within the import batch by URL
const urlMap = new Map();
for (const b of cleaned) {
  const normUrl = normalizeUrl(b.url);
  const existing = urlMap.get(normUrl);
  if (!existing) {
    urlMap.set(normUrl, b);
  } else if (!mergeMode) {
    // Full-overwrite mode: diamond (◇) always wins, then newest addDate
    if (b.source === '◇' && existing.source !== '◇') {
      b.folders = [...new Set([...b.folders, ...existing.folders])];
      urlMap.set(normUrl, b);
    } else if (existing.source !== '◇' && b.addDate > existing.addDate) {
      b.folders = [...new Set([...b.folders, ...existing.folders])];
      urlMap.set(normUrl, b);
    }
  } else {
    // Merge mode: keep newest addDate, merge folders
    if (b.addDate > existing.addDate) {
      b.folders = [...new Set([...b.folders, ...existing.folders])];
      urlMap.set(normUrl, b);
    } else {
      existing.folders = [...new Set([...existing.folders, ...b.folders])];
    }
  }
}

let unique = [...urlMap.values()];
console.log(`After internal dedup: ${unique.length} unique links`);

// Merge mode: remove entries whose URL is already in the existing index
let skippedDupes = 0;
if (mergeMode) {
  const before = unique.length;
  unique = unique.filter(b => !existingUrls.has(normalizeUrl(b.url)));
  skippedDupes = before - unique.length;
  console.log(`Already in index (skipped): ${skippedDupes}`);
  console.log(`New entries to add: ${unique.length}`);
}

// Build LinkMeta objects
const newLinks = unique.map(b => {
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
    ...(b.source ? { source: b.source } : {}),
    _needsTitle: needsTitle, // internal flag, stripped before output
  };
});

// Stats for new entries
const categoryStats = {};
for (const l of newLinks) categoryStats[l.category] = (categoryStats[l.category] || 0) + 1;
console.log(`\nNew entries by category:`);
Object.entries(categoryStats)
  .sort((a, b) => b[1] - a[1])
  .forEach(([cat, n]) => console.log(`  ${cat}: ${n}`));

if (!mergeMode) {
  const sourceStats = {};
  for (const l of newLinks) sourceStats[l.source] = (sourceStats[l.source] || 0) + 1;
  console.log('\nSources:');
  Object.entries(sourceStats).forEach(([s, n]) => console.log(`  ${s}: ${n}`));
}

const needsTitleCount = newLinks.filter(l => l._needsTitle).length;
console.log(`\nDomain-only titles needing fetch: ${needsTitleCount}`);

// Fetch titles if requested
if (fetchTitles) {
  await fetchTitlesInBatches(newLinks);
}

// Strip internal flags before output
const cleanedNew = newLinks.map(({ _needsTitle, ...rest }) => rest);

// Merge or overwrite
let output = mergeMode ? [...existingLinks, ...cleanedNew] : cleanedNew;

// Retag all entries (backfill tags on existing links that predate the tag rules)
if (retagAll) {
  let gained = 0;
  for (const link of output) {
    const fresh = autoTag({ title: link.title, url: link.url });
    const before = link.tags ? link.tags.length : 0;
    link.tags = [...new Set([...(link.tags || []), ...fresh])];
    if (link.tags.length > before) gained++;
  }
  console.log(`\nRetag pass: ${gained} links gained new tags`);
}

if (dryRun) {
  console.log('\n--- DRY RUN — no files written ---');
  console.log(`Would write ${output.length} links to ${OUTPUT_PATH}`);
  if (mergeMode) {
    console.log(`  (${existingLinks.length} existing + ${cleanedNew.length} new)`);
  }
  const preview = cleanedNew.slice(0, 10);
  console.log(`\nSample new entries (first ${preview.length}):`);
  console.log(JSON.stringify(preview, null, 2));
} else {
  // Encrypt and write
  mkdirSync(join(__dir, 'static/docs/private'), { recursive: true });
  const encrypted = await encryptData(JSON.stringify(output));
  writeFileSync(OUTPUT_PATH, JSON.stringify(encrypted));
  console.log(`\n✓ links-index.enc written (${output.length} entries)`);
  if (mergeMode) {
    console.log(`  (${existingLinks.length} existing + ${cleanedNew.length} new)`);
  }
  console.log('Next: git add static/docs/private/links-index.enc && git commit && git push');
}
