/**
 * sort-links.mjs
 *
 * CLI tool for batch inspect / modify / re-encrypt links-index.enc.
 *
 * Usage:
 *   node scripts/sort-links.mjs <passphrase> --stats
 *   node scripts/sort-links.mjs <passphrase> --dump <category>
 *   node scripts/sort-links.mjs <passphrase> --fetch <category>
 *   node scripts/sort-links.mjs <passphrase> --titles <category>
 *   node scripts/sort-links.mjs <passphrase> --apply <file.tsv>
 *   node scripts/sort-links.mjs <passphrase> --move-domain <domain> <category>
 *   node scripts/sort-links.mjs <passphrase> --retag <file.tsv>
 *   node scripts/sort-links.mjs <passphrase> --delete <id1,id2,...>
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

// ── args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const passphrase = args.find(a => !a.startsWith('--'));
if (!passphrase) {
  console.error('Usage: node scripts/sort-links.mjs <passphrase> --<mode> [args...]');
  process.exit(1);
}

const __dir = new URL('..', import.meta.url).pathname;
const INDEX_PATH = join(__dir, 'static/docs/private/links-index.enc');

// ── crypto (same as src/lib/admin/crypto.ts) ──────────────────────────────

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
    { name: 'PBKDF2', salt, iterations: 200_000, hash: 'SHA-256' },
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
    { name: 'PBKDF2', salt: fromB64(obj.salt), iterations: 200_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false, ['decrypt']
  );
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64(obj.iv) }, key, fromB64(obj.ct));
  return dec.decode(pt);
}

// ── load / save ───────────────────────────────────────────────────────────

async function loadLinks() {
  const enc = JSON.parse(readFileSync(INDEX_PATH, 'utf8'));
  const json = await decryptData(enc);
  return JSON.parse(json);
}

async function saveLinks(links) {
  const encrypted = await encryptData(JSON.stringify(links));
  writeFileSync(INDEX_PATH, JSON.stringify(encrypted));
  console.log(`\n✓ links-index.enc written (${links.length} entries)`);
}

// ── helpers ───────────────────────────────────────────────────────────────

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '(invalid)';
  }
}

function isDomainOnlyTitle(title, url) {
  if (!title || title.length === 0) return true;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const cleaned = title.toLowerCase().replace(/^www\./, '').trim();
    if (cleaned === hostname) return true;
    if (hostname.includes(cleaned) || cleaned.includes(hostname.split('.')[0])) {
      if (cleaned.length < 40 && !cleaned.includes(' ')) return true;
    }
  } catch { /* ignore */ }
  return false;
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

// ── modes ─────────────────────────────────────────────────────────────────

async function modeStats(links) {
  // Category counts
  const cats = {};
  for (const l of links) cats[l.category] = (cats[l.category] || 0) + 1;
  console.log('Categories:');
  Object.entries(cats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, n]) => {
      const pct = ((n / links.length) * 100).toFixed(1);
      console.log(`  ${cat}: ${n} (${pct}%)`);
    });

  // Tag counts (top 30)
  const tags = {};
  for (const l of links) for (const t of l.tags) tags[t] = (tags[t] || 0) + 1;
  console.log('\nTop tags:');
  Object.entries(tags)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .forEach(([tag, n]) => console.log(`  ${tag}: ${n}`));

  // Domain-only title count
  const domainOnly = links.filter(l => isDomainOnlyTitle(l.title, l.url));
  console.log(`\nDomain-only titles: ${domainOnly.length}`);

  // Source counts
  const sources = {};
  for (const l of links) {
    const s = l.source || '(none)';
    sources[s] = (sources[s] || 0) + 1;
  }
  console.log('\nSources:');
  Object.entries(sources).forEach(([s, n]) => console.log(`  ${s}: ${n}`));

  console.log(`\nTotal: ${links.length}`);
}

async function modeDump(links, category) {
  const filtered = links.filter(l => l.category === category);
  if (filtered.length === 0) {
    console.log(`No links in category "${category}"`);
    return;
  }

  // Group by domain
  const byDomain = {};
  for (const l of filtered) {
    const d = getDomain(l.url);
    if (!byDomain[d]) byDomain[d] = [];
    byDomain[d].push(l);
  }

  // Sort domains by count descending
  const sorted = Object.entries(byDomain).sort((a, b) => b[1].length - a[1].length);

  console.log(`${category}: ${filtered.length} links across ${sorted.length} domains\n`);

  let n = 0;
  for (const [domain, domainLinks] of sorted) {
    console.log(`── ${domain} (${domainLinks.length}) ──`);
    for (const l of domainLinks) {
      n++;
      const tags = l.tags.length ? ` [${l.tags.join(', ')}]` : '';
      const src = l.source ? ` ${l.source}` : '';
      console.log(`  ${n}. ${l.title}${tags}${src}`);
      console.log(`     ${l.url}`);
      console.log(`     id: ${l.id}`);
    }
    console.log('');
  }
}

async function modeFetch(links, category) {
  const filtered = links.filter(l => l.category === category);
  console.log(`Checking ${filtered.length} URLs in "${category}"...\n`);

  let alive = 0, dead = 0, errored = 0;
  const deadLinks = [];

  for (let i = 0; i < filtered.length; i += 10) {
    const batch = filtered.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (link) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(link.url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; link-check/1.0)' },
            redirect: 'follow',
          });
          clearTimeout(timer);
          if (res.ok || (res.status >= 300 && res.status < 400)) {
            alive++;
          } else {
            dead++;
            deadLinks.push({ ...link, status: res.status });
          }
        } catch (err) {
          clearTimeout(timer);
          errored++;
          deadLinks.push({ ...link, status: err.name === 'AbortError' ? 'timeout' : 'error' });
        }
      })
    );
    process.stdout.write(`  ${i + batch.length}/${filtered.length}\r`);
  }

  console.log(`\nAlive: ${alive}  Dead: ${dead}  Errored: ${errored}\n`);

  if (deadLinks.length > 0) {
    console.log('Dead/errored links:');
    for (const l of deadLinks) {
      console.log(`  [${l.status}] ${l.title}`);
      console.log(`    ${l.url}`);
      console.log(`    id: ${l.id}`);
    }
  }
}

async function modeTitles(links, category) {
  const filtered = links.filter(
    l => l.category === category && isDomainOnlyTitle(l.title, l.url)
  );
  if (filtered.length === 0) {
    console.log(`No domain-only titles in "${category}"`);
    return;
  }

  console.log(`Fetching titles for ${filtered.length} domain-only entries in "${category}"...\n`);

  let fetched = 0, failed = 0;

  for (let i = 0; i < filtered.length; i += 5) {
    const batch = filtered.slice(i, i + 5);
    await Promise.allSettled(
      batch.map(async (link) => {
        const title = await fetchTitle(link.url);
        if (title && title !== link.title) {
          console.log(`  ✓ ${link.title} → ${title}`);
          link.title = title;
          fetched++;
        } else {
          console.log(`  ✗ ${link.url} (no title found)`);
          failed++;
        }
      })
    );
  }

  console.log(`\nFetched: ${fetched}  Failed: ${failed}`);

  if (fetched > 0) {
    await saveLinks(links);
  }
}

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

async function modeApply(links, filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(l => l && !l.startsWith('#'));

  const idMap = new Map(links.map(l => [l.id, l]));
  let changed = 0, notFound = 0;

  for (const line of lines) {
    const [id, newCategory] = line.split('\t').map(s => s.trim());
    if (!id || !newCategory) continue;
    const link = idMap.get(id);
    if (!link) {
      console.log(`  ! not found: ${id}`);
      notFound++;
      continue;
    }
    if (link.category !== newCategory) {
      console.log(`  ${link.category} → ${newCategory}: ${link.title}`);
      link.category = newCategory;
      changed++;
    }
  }

  console.log(`\nChanged: ${changed}  Not found: ${notFound}`);

  if (changed > 0) {
    await saveLinks(links);
  }
}

async function modeMoveDomain(links, domain, newCategory) {
  const matches = links.filter(l => getDomain(l.url) === domain);
  if (matches.length === 0) {
    console.log(`No links found for domain "${domain}"`);
    return;
  }

  let changed = 0;
  for (const l of matches) {
    if (l.category !== newCategory) {
      console.log(`  ${l.category} → ${newCategory}: ${l.title}`);
      l.category = newCategory;
      changed++;
    }
  }

  console.log(`\nMatched: ${matches.length}  Changed: ${changed}`);

  if (changed > 0) {
    await saveLinks(links);
  }
}

async function modeRetag(links, filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l.trim() && !l.startsWith('#'));

  const idMap = new Map(links.map(l => [l.id, l]));
  let changed = 0, notFound = 0;

  for (const line of lines) {
    const parts = line.split('\t');
    const id = parts[0]?.trim();
    const tagsStr = parts.length > 1 ? parts[1]?.trim() : undefined;
    if (!id || tagsStr === undefined) continue;
    const link = idMap.get(id);
    if (!link) {
      console.log(`  ! not found: ${id}`);
      notFound++;
      continue;
    }
    const newTags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    console.log(`  [${link.tags.join(',')}] → [${newTags.join(',')}]: ${link.title}`);
    link.tags = newTags;
    changed++;
  }

  console.log(`\nChanged: ${changed}  Not found: ${notFound}`);

  if (changed > 0) {
    await saveLinks(links);
  }
}

async function modeDelete(links, idsArg) {
  const ids = new Set(idsArg.split(',').map(s => s.trim()).filter(Boolean));
  const before = links.length;
  const removed = links.filter(l => ids.has(l.id));
  const remaining = links.filter(l => !ids.has(l.id));

  for (const l of removed) {
    console.log(`  ✗ ${l.title} (${l.category})`);
  }

  console.log(`\nRemoved: ${removed.length}  Remaining: ${remaining.length}`);

  if (removed.length > 0) {
    await saveLinks(remaining);
  }

  return remaining;
}

// ── main ──────────────────────────────────────────────────────────────────

console.log('sort-links.mjs\n');

let links;
try {
  links = await loadLinks();
  console.log(`Loaded ${links.length} links\n`);
} catch (e) {
  console.error('Failed to decrypt links-index.enc — check passphrase');
  console.error(e.message);
  process.exit(1);
}

if (args.includes('--stats')) {
  await modeStats(links);
} else if (args.includes('--dump')) {
  const idx = args.indexOf('--dump');
  const category = args[idx + 1];
  if (!category || category.startsWith('--')) {
    console.error('Usage: --dump <category>');
    process.exit(1);
  }
  await modeDump(links, category);
} else if (args.includes('--fetch')) {
  const idx = args.indexOf('--fetch');
  const category = args[idx + 1];
  if (!category || category.startsWith('--')) {
    console.error('Usage: --fetch <category>');
    process.exit(1);
  }
  await modeFetch(links, category);
} else if (args.includes('--titles')) {
  const idx = args.indexOf('--titles');
  const category = args[idx + 1];
  if (!category || category.startsWith('--')) {
    console.error('Usage: --titles <category>');
    process.exit(1);
  }
  await modeTitles(links, category);
} else if (args.includes('--apply')) {
  const idx = args.indexOf('--apply');
  const filePath = args[idx + 1];
  if (!filePath || filePath.startsWith('--')) {
    console.error('Usage: --apply <file.tsv>');
    process.exit(1);
  }
  await modeApply(links, filePath);
} else if (args.includes('--move-domain')) {
  const idx = args.indexOf('--move-domain');
  const domain = args[idx + 1];
  const category = args[idx + 2];
  if (!domain || !category || domain.startsWith('--') || category.startsWith('--')) {
    console.error('Usage: --move-domain <domain> <category>');
    process.exit(1);
  }
  await modeMoveDomain(links, domain, category);
} else if (args.includes('--retag')) {
  const idx = args.indexOf('--retag');
  const filePath = args[idx + 1];
  if (!filePath || filePath.startsWith('--')) {
    console.error('Usage: --retag <file.tsv>');
    process.exit(1);
  }
  await modeRetag(links, filePath);
} else if (args.includes('--delete')) {
  const idx = args.indexOf('--delete');
  const ids = args[idx + 1];
  if (!ids || ids.startsWith('--')) {
    console.error('Usage: --delete <id1,id2,...>');
    process.exit(1);
  }
  links = await modeDelete(links, ids);
} else {
  console.error('No mode specified. Use --stats, --dump, --fetch, --titles, --apply, --move-domain, --retag, or --delete');
  process.exit(1);
}
