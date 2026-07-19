# CLAUDE.md — cwcorella-git.github.io

Personal site: reading list, journals, home page. Fully static. Live site at cwcorella.com (Cloudflare Pages); cwcorella-git.github.io is a minimal HTML archive mirror. All writes go through the GitHub REST API from the browser using a session-scoped PAT. No server — with one acknowledged exception, `/library` (see below).

## Hard constraints

- No server, no home server
- No free-tier service dependencies (no Netlify Functions, no Supabase, etc.)
- Open source tools only
- Decentralized hosting required (IPFS, nsite)
- Repo stored on GitHub

### The one acknowledged exception: `/library`

**`/library` breaks "no server", knowingly.** It is backed by `library-api`, a FastAPI
service on the workstation holding ~100k documents in SQLite+FTS5. Nothing else on the
site does this, and nothing else should.

Why it was accepted: 100k documents (~2.7GB of bodies, plus a similar amount again in the
FTS index) cannot be prerendered, and the corpus is private. Every other page stays static
and decentralizable; the constraint above still governs **everything a visitor can reach**.

What keeps the exception contained:
- `/library` is **admin-gated in full** — `src/routes/library/+page.svelte` bounces
  non-admins. It is never public, and it is not in the archive mirror.
- If `library-api` is down, `/library` degrades to an error state. **The public site is
  unaffected** — it has no runtime dependency on the service.

Do not extend this exception to any public-facing page without deciding to break the
constraint again, deliberately.

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

**Library** (`/library`) — the one server-backed page; see "The one acknowledged exception" above. Admin-gated in full. Detail below under "Library subsystem".

**Theme**: 6 palettes (amber, sky, dusk, neutral, rust, sage). amber/dusk/rust are dark-glass with fixed colors; sky/neutral/sage adapt all panels to time of day via Sky.svelte per-frame CSS var updates.

**tlock time-capsule**: Content key sealed 2026-06-11 to drand Quicknet round 751,863,412 (unlocks 2095-02-13). Stored at `static/docs/private/content-key.tlock`. `archiveState.tryUnlock()` called on page load when `isUnlockDay()`. SettingsPanel has a time capsule section showing seal status; auto-reseals when content key is updated.

## Library subsystem

The largest thing on the site and the only one with a backend. **It spans two repos** — nothing here works without knowing that.

### The two surfaces

| | Where | What |
|---|---|---|
| Frontend | this repo — `src/routes/library/`, `src/lib/library/`, `src/lib/components/library/` | The admin-only page |
| Backend | **`~/Projects/library-api`** (own repo: `cwcorella-git/library-api`) | FastAPI + SQLite/FTS5 over ~100k docs |

**Deploying the backend is not `git push`.** The service runs from `/data/library-api/` on the
workstation, not from the laptop tree. Two gotchas, both hit in practice:

- The LAN alias times out when off the home network. Go through the Cloudflare tunnel:
  `ssh ssh.veritablegames.com`.
- **The workstation has no GitHub key of its own** — `git pull` there fails with
  "Could not read from remote repository" unless you forward your agent: `ssh -A`.

```bash
ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull origin main && sudo systemctl restart library-api'
```

The token lives in `/data/library-api/library-api.env` (root-readable only — `sudo` to read it),
and the service listens on `127.0.0.1:8087` behind nginx.

**Its CORS origin is the production domain, so `localhost:5173` cannot reach it.** Local dev and
Playwright verification must mock `/facets`, `/documents`, `/curation/stats`, `/tags`. Mocks
resolve instantly, which is exactly why they miss latency and failure bugs — see the caution below.

### Ship order: frontend first

The frontend must be able to survive an un-upgraded API (every new field is optional with a
defined fallback), but the reverse is not automatic: a **new API can break an old frontend**.
It happened — source-attributed facet buckets introduced duplicate collection names, and the
deployed page keyed a Svelte 5 `{#each}` on name, which is a hard runtime error.
**Deploy the frontend guard first, then the API.**

### The corpus, as measured (2026-07-17 — not guesses)

| source | docs | categories |
|---|---:|---:|
| youtube | 60,726 | 1 (named `transcript`) |
| anarchist | 24,594 | 26 |
| marxist | 12,576 | 8 |
| user | 2,521 | **0** |

100,417 total. `needs_formatting`: 317 (0.3%).

`visibility` read private 97,896 / public 2,521 at that measurement — **`public` was
exactly the `user` count.** Do NOT conclude from this that visibility restates source
(CLAUDE.md said so until 2026-07-18; it was wrong). That reading was an artifact of two
separate defects: VG shipped all-public so `bootstrap.py` had never run, and `sources.py`
hard-coded `visibility="private"` for anarchist/marxist/youtube regardless of their real
`is_public`. Both are fixed. Visibility is now an independent, editable axis.
33 languages, but `en` / `en-US` / `en-GB` are **separate buckets**. 65,780 undated (65%);
youtube is entirely undated. Tags: ~12k distinct, and `/facets` caps its list at **200** by
design (a full list is a ~400KB response through the tunnel) — `GET /tags?q=` serves the tail.

### Invariants — break these and it fails silently

- **`filtersToParams()` in `src/lib/library/libraryLogic.ts` is the ONE filter→param mapping.**
  `/documents` and `/anchor-offset` must send identical filters: the rail computes row offsets,
  so if it filters differently from the list it scrolls to the wrong row with no error. A second
  copy of this mapping is exactly how that happened.
- **A collection is a category WITHIN a source**, not a sibling. `library-api`'s `sources.py`
  sets `collections=[row["category"]]`. Facet buckets are keyed `(source, name)`.
- **`buildCorpusTree` keeps raw `name` keys** — those are what `source=` sends. Only the
  *display* is mapped, via `sourceLabel()`. A mapped value reaching a filter sends
  `source=Anarchist Library` and silently returns nothing.
- **`/facets` is six aggregates over 100k docs** (~250ms unnarrowed, ~700ms narrowed). Refetch
  **only** when the corpus source changes. It is guarded by `_facetsEpoch` (newest wins) and is
  **non-fatal on the refetch path** — a mid-session failure must not set `_status`, because the
  controls are gated behind `status === 'ready'` and would all unmount, leaving no way to recover.
  The same rule binds **every per-document write**: `setDecision` and `saveEdit` toast instead of
  calling `_mapError`. `_mapError` is for whole-page load failures only.
- **Publication requires BOTH marks: `is_public = (decision == 'keep') AND (visibility == 'public')`.**
  `keep` puts a document on VG; `visibility` decides public vs admin-only there. A document with
  no curation row is never published, whatever its visibility — publishing uncurated material
  exposes private documents, while failing to publish a curated one is a missing click. Never
  weaken this to visibility alone; `test_undecided_and_public_is_NOT_published` exists to stop it.
- **Effective visibility is overlay-merged** (`edit_flags.visibility` over `library.db`), and it is
  resolved in three places — the detail read, the list read, and `plan_publish`. They must agree.
  Note filters and facets do **not** see it yet, so marks are not filterable; verify a marking
  session with `publish.py --dry-run`. See followups doc item 1.
- **The reader is stale-while-revalidate: `_openIndex` advances synchronously while the PREVIOUS
  `_openDoc` stays mounted.** Anything acting on "the current document" must require the reader to
  be loaded *and* `openDocStatus === 'idle'`, or it acts on the old document while stamping the new
  row — silent curation corruption, no error. This is why keyboard gating lives in the pure
  `src/lib/library/keyLogic.ts` and not in `DocReader.svelte`: in the component it had no test
  harness, and the suite could not catch a regression. **Keep it pure.**

### Caution when verifying

The live API can't be reached from localhost, so visual checks run against mocks — and mocks
**resolve instantly**. Two real bugs (a stale-response clobber and a facet-refetch race) survived
mocked verification precisely because of this. A mocked backend cannot falsify a claim about slow
or failing requests. Reason about those paths directly, or measure.

### Specs and plans

`docs/superpowers/specs/` and `docs/superpowers/plans/` — 9 specs, 8 plans, all `*library*` or
`*sp[12]*`. Start with `2026-07-14-library-platform-architecture.md`. **Read a spec's revision
notes before trusting its body**; several were written before anything had queried the real corpus.

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

**Done**: Admin system + settings panel (PAT/key show-hide, time capsule seal), reading list (902 books, 898 sourced), journal CRUD, homepage inline editor, doc reader, local-first write queue (10s debounce + manual sync), AES-256-GCM encryption (passphrase + raw key modes), 41 Vitest tests, 6-palette theme switcher (sky/neutral/sage time-of-day adaptive), tlock time-capsule (sealed 2026-06-11, unlocks 2095-02-13), encrypted links page (2,094 bookmarks, 10 categories), dual-deploy (Cloudflare Pages live + GitHub Pages archive mirror with encrypted zip), library visibility axis (editable public/private independent of keep/hide/delete; P/F mark keys), library keyboard triage (reader-only: `←`/`→` navigate, `Delete`/`K`/`H` decide-and-advance, no UI hints — one curator).

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
