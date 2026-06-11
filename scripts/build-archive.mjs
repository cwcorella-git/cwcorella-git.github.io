import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { marked } from 'marked';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'archive-build');
const PRIVATE_DOCS = join(ROOT, 'static/docs/private');

mkdirSync(OUT, { recursive: true });

const homeContent = JSON.parse(readFileSync(join(ROOT, 'src/lib/content/home.json'), 'utf8')).content;
const books = JSON.parse(readFileSync(join(ROOT, 'src/lib/books.json'), 'utf8'));

const homeHtml = await marked(homeContent);

const booksHtml = books
	.map(b => b.url ? `<li><a href="${b.url}">${b.name}</a></li>` : `<li>${b.name}</li>`)
	.join('\n    ');

function countEnc(dir) {
	let count = 0;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) count += countEnc(join(dir, entry.name));
		else if (entry.name.endsWith('.enc')) count++;
	}
	return count;
}
const encCount = countEnc(PRIVATE_DOCS);
const tlockExists = existsSync(join(ROOT, 'static/docs/private/content-key.tlock'));

const CHAIN_HASH = '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971';
const UNLOCK_ROUND = '751,863,412';
const UNLOCK_DATE = '2095-02-13';
const TODAY = new Date().toISOString().slice(0, 10);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>cwcorella — archive</title>
  <style>
    body {
      font-family: Georgia, 'Times New Roman', serif;
      max-width: 640px;
      margin: 4rem auto;
      padding: 0 2rem 6rem;
      color: #111;
      line-height: 1.7;
      font-size: 1rem;
    }
    h1, h2, h3 { font-weight: normal; margin-top: 2.5rem; }
    a { color: #111; }
    a:hover { text-decoration: none; }
    ul { padding-left: 1.5rem; }
    li { margin: 0.2rem 0; }
    blockquote {
      margin-left: 0;
      padding-left: 1rem;
      border-left: 2px solid #ccc;
      color: #444;
    }
    .byline {
      font-size: 0.85rem;
      color: #666;
      margin-bottom: 3rem;
    }
    .byline a { color: #666; }
    .archive-note {
      font-size: 0.85rem;
      color: #555;
      border: 1px solid #ddd;
      padding: 1rem 1.2rem;
      margin: 1.5rem 0;
      line-height: 1.6;
    }
    .archive-note p { margin: 0.4rem 0; }
    .download {
      display: inline-block;
      margin-top: 1rem;
      font-family: monospace;
      font-size: 0.9rem;
      color: #111;
    }
    footer {
      margin-top: 4rem;
      padding-top: 1rem;
      border-top: 1px solid #ddd;
      font-size: 0.75rem;
      color: #999;
      font-family: monospace;
    }
    code { font-size: 0.85em; }
  </style>
</head>
<body>

  <p class="byline">archive mirror &mdash; <a href="https://cwcorella.com">cwcorella.com</a></p>

  ${homeHtml}

  <h2>reading</h2>
  <ul>
    ${booksHtml}
  </ul>

  <h2>encrypted archive</h2>
  <div class="archive-note">
    <p>${encCount} encrypted documents. Sealed with AES-256-GCM.</p>
    <p>Content key time-locked via drand Quicknet until <strong>${UNLOCK_DATE}</strong><br>
    (round ${UNLOCK_ROUND} &middot; chain <code>${CHAIN_HASH.slice(0, 16)}&hellip;</code>)</p>
    ${tlockExists
      ? `<p>Includes <code>content-key.tlock</code> &mdash; recoverable from the drand beacon on unlock day.</p>`
      : `<p><em>Note: <code>content-key.tlock</code> not yet generated. See README.txt for details.</em></p>`
    }
  </div>
  <a class="download" href="archive.zip">&darr; download archive.zip</a>

  <footer>
    cwcorella.com &middot; generated ${TODAY}
  </footer>

</body>
</html>`;

writeFileSync(join(OUT, 'index.html'), html);

const readme = `cwcorella encrypted archive
===========================

Generated : ${TODAY}
Archive   : https://cwcorella-git.github.io
Live site : https://cwcorella.com


CONTENTS
--------
docs/private/journals-index.enc     encrypted journals index
docs/private/journals/*.enc         individual journal entries (273 files)
docs/private/links-index.enc        encrypted bookmarks (~2,000+ links)
content-key.tlock                   time-locked content key (if present — see below)
README.txt                          this file


ENCRYPTION
----------
All .enc files use AES-256-GCM (256-bit key, random 12-byte IV, 16-byte auth tag).

Two key modes:

  passphrase  key derived via PBKDF2-SHA-256, 200,000 iterations, 16-byte random salt.
              Salt stored inside the .enc file. Requires the original passphrase.

  rawkey      key supplied directly as 256-bit hex or base64.
              No salt (empty salt field in .enc file).

.enc files are JSON with the shape:
  { "iv": "<base64>", "data": "<base64>", "salt": "<base64 or empty>" }


TIME LOCK (content-key.tlock)
------------------------------
${tlockExists
  ? `The file content-key.tlock seals the AES content key against the drand Quicknet
beacon. On or after ${UNLOCK_DATE}, any holder of this zip can recover the key:

  1. Fetch the beacon value for round ${UNLOCK_ROUND.replace(/,/g, '_')}:
     https://api.drand.sh/${CHAIN_HASH}/public/${UNLOCK_ROUND.replace(/,/g, '')}

  2. Use the tlock library (https://github.com/drand/tlock) to unseal
     content-key.tlock with that beacon value. This reveals the AES-256-GCM
     content key.

  3. Use the recovered key to decrypt any .enc file via AES-256-GCM.`
  : `content-key.tlock has not been generated yet. This means the time-lock
unlock path (drand beacon → key recovery → decrypt) is not yet complete.

The .enc files are still fully encrypted and intact. The owner can decrypt
them at any time using their passphrase or raw key. The tlock file will be
added to future versions of this archive once generated.

Target unlock: ${UNLOCK_DATE} (drand Quicknet round ${UNLOCK_ROUND})
Chain hash   : ${CHAIN_HASH}`
}


DRAND REFERENCES
----------------
Network   : https://drand.love
tlock spec: https://github.com/drand/tlock
Chain     : ${CHAIN_HASH}
Round     : ${UNLOCK_ROUND.replace(/,/g, '')}
Unlock    : ${UNLOCK_DATE}
`;

writeFileSync(join(OUT, 'README.txt'), readme);

console.log(`archive-build/ written — ${encCount} enc files, tlock: ${tlockExists}`);
