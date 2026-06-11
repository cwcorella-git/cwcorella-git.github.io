# CLAUDE.md — cwcorella-git.github.io

Personal site: reading list, journals, home page. Fully static. Live site at cwcorella.com (Cloudflare Pages); cwcorella-git.github.io is a minimal HTML archive mirror. All writes go through the GitHub REST API from the browser using a session-scoped PAT. No server, ever.

## Hard constraints

- No server, no home server
- No free-tier service dependencies (no Netlify Functions, no Supabase, etc.)
- Open source tools only
- Decentralized hosting required (IPFS, nsite)
- Repo stored on GitHub

## Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (runes) |
| Adapter | `adapter-static` — fully prerendered, no SSR |
| Hosting | Cloudflare Pages (`cwcorella.com`) + GitHub Pages archive (`cwcorella-git.github.io`) via GitHub Actions on push to `main` |
| Build | Vite / `npm run build` → `/build` |
| Node | 20 (`nvm use 20`) |
| Tests | Vitest — `npm test` |
| Type-check | `npm run check` |

## Key commands

```bash
npm run dev       # local dev server
npm run build     # production build → /build
npm run check     # svelte-check + tsc
npm test          # vitest
```

## Architecture

**Writes**: GitHub Git Data API — blobs → tree → commit → ref PATCH with `force: true`. This avoids SHA conflicts. See `src/lib/admin/github.ts`.

**Admin activation**: Triple-backtick (` ``` `) typed outside any input field. PAT + content key stored in `sessionStorage` only. SettingsPanel allows mid-session PAT/key updates.

**Encryption**: Two modes — `passphrase` (PBKDF2 SHA-256 200k iterations → AES-256-GCM, 16-byte random salt) or `rawkey` (AES-256-GCM direct, 64-char hex or 44-char base64). Mode stored in sessionStorage. Auto-detected on decrypt from `EncryptedDoc.salt` (empty = rawkey). All call sites use `adminState.encryptContent()` / `adminState.decryptContent()`.

**Books data**: `src/lib/books.json` — 902 books, `BookLink[]` schema: `[{ name, url }]`.

**Docs**: `static/docs/public/*.md` (plaintext), `static/docs/private/*.enc` (AES-256-GCM JSON).

**Journals**: `static/docs/private/journals/` — index + entries all encrypted. Slugs are word-based (top-3 nouns via `compromise` NLP, e.g. `bread-morning-quiet`). `journalCache` (in-memory) lets reader/editor open newly created entries before the write queue commits. `draftStore` persists the pending journals-index payload to localStorage across hard refreshes. Rapid creates are safe — `writeQueue.push()` merges `extraUpdates` keyed by file path.

**Links**: `static/docs/private/links-index.enc` — 2,094 encrypted bookmarks, 10 categories. Single encrypted JSON index; no per-entry files.

**Theme**: 6 palettes (amber, sky, dusk, neutral, rust, sage). amber/dusk/rust are dark-glass with fixed colors; sky/neutral/sage adapt all panels to time of day via Sky.svelte per-frame CSS var updates.

**tlock time-capsule**: Content key sealed 2026-06-11 to drand Quicknet round 751,863,412 (unlocks 2095-02-13). Stored at `static/docs/private/content-key.tlock`. `archiveState.tryUnlock()` called on page load when `isUnlockDay()`. SettingsPanel has a time capsule section showing seal status; auto-reseals when content key is updated.

**Archive mirror**: `scripts/build-archive.mjs` generates `archive-build/` — minimal HTML (no SvelteKit, no JS) with home content, reading list, and a download link for `archive.zip`. The zip bundles all `.enc` files from `static/docs/private/` plus `content-key.tlock` and a `README.txt` explaining the decryption chain. GitHub Actions deploys this to GitHub Pages on every push.

## Key files

```
src/lib/types.ts                     — Book, BookDoc, BookLink, JournalMeta, LinkMeta interfaces
src/lib/books.json                   — 902 books, BookLink[] schema
src/lib/content/home.json            — { "content": "..." } single markdown field
src/lib/admin/github.ts              — getFile, putFile, commitFiles (force:true PATCH)
src/lib/admin/state.svelte.ts        — adminState, bookFormState, booksState, writeQueue, journalCache, linksState
src/lib/admin/crypto.ts              — AES-256-GCM encrypt/decrypt, importRawKey, passphrase + rawkey paths
src/lib/admin/slug.ts                — word-based slug generation via compromise NLP (browser, dynamic import)
src/lib/admin/markdown.ts            — marked renderer + extractToc
src/lib/admin/tlock.ts               — drand tlock encrypt/decrypt, sealContent, sealContentKey
src/lib/admin/archive.svelte.ts      — archiveState (2095 unlock flow)
src/lib/admin/toast.svelte.ts        — toast queue (error/success)
src/lib/admin/theme.svelte.ts        — PALETTE definitions + themeState (6 palettes)
src/lib/admin/draft.ts               — draftStore (localStorage draft persistence)
src/lib/components/Sky.svelte        — CSS var time-of-day lighting (no canvas)
src/lib/components/AdminDrawer.svelte
src/lib/components/AdminToolbar.svelte
src/lib/components/SettingsPanel.svelte — mid-session PAT/key/mode update + logout
src/lib/components/ThemePanel.svelte    — 6-palette picker dropdown
src/lib/components/BookForm.svelte
src/lib/components/DocReader.svelte
src/lib/components/HomeEditor.svelte
src/lib/components/Toasts.svelte
src/lib/components/YearPicker.svelte
scripts/enrich-links.mjs             — Open Library enrichment script
scripts/sort-links.mjs               — CLI for batch link sort/inspect/move/delete/retag
scripts/encrypt-journals.mjs         — local tool: encrypt writing dir → static/docs/private/journals/
scripts/build-archive.mjs            — generates archive-build/ (minimal HTML + README.txt for GitHub Pages)
static/docs/private/content-key.tlock — tlock-sealed AES content key (unlocks 2095-02-13)
static/.nojekyll                     — prevents GitHub Pages from running Jekyll
.github/workflows/deploy.yml         — two parallel jobs: deploy-live (Cloudflare Pages) + deploy-archive (GitHub Pages)
```

## Current status

**Done**: Admin system + settings panel (PAT/key show-hide, time capsule seal), reading list (902 books, 898 sourced), journal CRUD, homepage inline editor, doc reader, local-first write queue (10s debounce + manual sync), AES-256-GCM encryption (passphrase + raw key modes), 41 Vitest tests, 6-palette theme switcher (sky/neutral/sage time-of-day adaptive), tlock time-capsule (sealed 2026-06-11, unlocks 2095-02-13), encrypted links page (2,094 bookmarks, 10 categories), dual-deploy (Cloudflare Pages live + GitHub Pages archive mirror with encrypted zip).

**Not done**:
- Homepage actual content (currently placeholder)
- Photo gallery system
- IPFS + DNSLink deployment
- nsite/Nostr deployment
- StaticCrypt password-protected sections
- Links: ~100 domain-only titles to fetch, dead link check

## Patterns and conventions

- Svelte 5 runes throughout (`$state`, `$derived`, `$effect`) — no legacy Svelte 4 reactivity
- Module-level `$state` in `.svelte.ts` files for shared reactive state
- GitHub API writes always use the Git Data API (blobs → tree → commit → ref PATCH), never the Contents API PUT for multi-file commits
- Toasts for all user-facing feedback — `import { toast } from '$lib/admin/toast.svelte'`
- No `window.prompt()` or `window.alert()` anywhere
- Encryption always via `adminState.encryptContent()` / `adminState.decryptContent()` — never roll ad-hoc crypto or call `encryptDoc`/`decryptDoc` directly from components

## Memory files

Extended notes in `~/.claude/projects/-home-user-Projects-cwcorella-git.github.io/memory/`:
- `theme.md` — current 6-palette values, darkGlass architecture, per-frame var formulas
- `css-vars.md` — all :root CSS vars, text hierarchy rule, rgba() convention
- `admin.md` — admin flow, KeyMode, write queue, journals, tlock
- `link-sorting.md` — links sorting progress, remaining tasks, sort-links.mjs CLI docs
