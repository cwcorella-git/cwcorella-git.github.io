# CLAUDE.md — cwcorella-git.github.io

Personal site: reading list, journals, home page. Fully static, deployed to GitHub Pages. All writes go through the GitHub REST API from the browser using a session-scoped PAT. No server, ever.

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
| Hosting | GitHub Pages via GitHub Actions on push to `main` |
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

**Admin activation**: Triple-backtick (` ``` `) typed outside any input field. PAT + content key stored in `sessionStorage` only.

**Books data**: `src/lib/books.json` — 902 books, `BookLink[]` schema: `[{ name, url }]`.

**Docs**: `static/docs/public/*.md` (plaintext), `static/docs/private/*.enc` (AES-256-GCM JSON).

**Journals**: `static/docs/private/journals/` — index + entries all encrypted. Slugs are word-based (top-3 nouns via `compromise` NLP, e.g. `bread-morning-quiet`). `journalCache` (in-memory) lets reader/editor open newly created entries before the write queue commits. `draftStore` persists the pending journals-index payload to localStorage across hard refreshes. Rapid creates are safe — `writeQueue.push()` merges `extraUpdates` keyed by file path.

**Encryption**: AES-256-GCM, PBKDF2 SHA-256 200k iterations, 16-byte random salt, Web Crypto API only (no Node crypto).

## Key files

```
src/lib/types.ts                    — Book, BookDoc, BookLink interfaces
src/lib/books.json                  — 902 books, BookLink[] schema
src/lib/content/home.json           — { "content": "..." } single markdown field
src/lib/admin/github.ts             — getFile, putFile, commitFiles (force:true PATCH)
src/lib/admin/state.svelte.ts       — adminState, bookFormState, booksState, writeQueue, journalCache
src/lib/admin/slug.ts               — word-based slug generation via compromise NLP (browser, dynamic import)
src/lib/admin/crypto.ts             — AES-256-GCM encrypt/decrypt (Web Crypto only)
src/lib/admin/markdown.ts           — marked renderer + extractToc
src/lib/admin/toast.svelte.ts       — toast queue (error/success)
src/lib/components/AdminDrawer.svelte
src/lib/components/AdminToolbar.svelte
src/lib/components/BookForm.svelte
src/lib/components/DocReader.svelte
src/lib/components/HomeEditor.svelte
src/lib/components/Toasts.svelte
src/lib/components/YearPicker.svelte
scripts/enrich-links.mjs            — Open Library enrichment script
scripts/encrypt-journals.mjs        — local tool: encrypt writing dir → static/docs/private/journals/
static/.nojekyll                    — prevents GitHub Pages from running Jekyll
.github/workflows/deploy.yml        — CI/CD: build + deploy to GH Pages
```

## Current status

**Done**: Admin system, reading list (898/902 books sourced, 4 missing links), journal CRUD, homepage inline editor, doc reader, local-first write queue (10s debounce + manual sync), AES-256-GCM encryption, 41 Vitest tests.

**Not done**:
- Homepage actual content (currently placeholder)
- Photo gallery system
- IPFS + DNSLink deployment
- nsite/Nostr deployment
- StaticCrypt password-protected sections
- drand/tlock 69-year time-locked content

## Patterns and conventions

- Svelte 5 runes throughout (`$state`, `$derived`, `$effect`) — no legacy Svelte 4 reactivity
- Module-level `$state` in `.svelte.ts` files for shared reactive state (see `state.svelte.ts`)
- GitHub API writes always use the Git Data API (blobs → tree → commit → ref PATCH), never the Contents API PUT for multi-file commits
- Toasts for all user-facing feedback — `import { addToast } from '$lib/admin/toast.svelte'`
- No `window.prompt()` or `window.alert()` anywhere
- Encryption always via `crypto.ts` — never roll ad-hoc crypto

## Memory files

Extended notes in `~/.claude/projects/-home-user-Projects-cwcorella-git.github.io/memory/`:
- `progress.md` — full done/todo list
- `tools.md` — research notes on tlock, IPFS, nsite, Arweave, etc.
- `site-architecture.md` — deployment and framework notes
