# STATE — measured numbers, file map, done/not-done

Offloaded from CLAUDE.md 2026-09-06. Point-in-time facts live here; invariants and
imperatives stay in CLAUDE.md.

## The corpus, as measured (2026-07-17 — not guesses)

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
