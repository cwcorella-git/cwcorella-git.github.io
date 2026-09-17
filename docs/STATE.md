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

**Amended 2026-09-17:** visibility now reads private 97,975 / public 2,442. 79 `user`
documents moved to private — complete in-copyright books, identified by matching the
reading list against the corpus. Nothing had been published (that needs
`decision == 'keep'` AND `visibility == 'public'`, and every curation row is `delete`), so
it was a latent trap, not an exposure. Reversal snapshot:
`/data/backups/user-books-visibility-2026-09-17.jsonl.gz`.

## Licence policy (2026-09-17)

`documents.license` was NULL for all 100,417 rows since cutover — wired end to end
(schema → loader → upsert) and never supplied a value. Now backfilled per source by
library-api's `scripts/backfill_license.py`, from `SOURCE_LICENSE` in `backend/sources.py`:

| source | licence | republishable |
|---|---|---|
| anarchist | `anti-copyright` | yes |
| marxist | `free-distribution` | yes |
| user | NULL | no — scraped third-party material |
| youtube | NULL | no — other people's transcripts |

This is a **corpus-policy assertion, not a per-text verification**, and it is least
reliable for book-length works: theanarchistlibrary hosts books by living authors on
commercial presses that it cannot relicense. NULL means "deny until cleared", never
"no licence needed". A licence says a text MAY be republished — publication still
requires both curation marks.

## Reading list ↔ library (2026-09-17)

`scripts/match-library.mjs` reports; `scripts/export-library-docs.mjs` writes; matching
is shared in `scripts/lib/match-books.mjs` so the two cannot disagree. Baked at build
time — no public page may depend on library-api at runtime.

263 of 903 books have a body (225 exact title matches). Funnel:
**263 matched → 178 licence-cleared → 174 unambiguous → 125 written.**
Held: 85 on licence, 49 over the 40,000-word gate, 8 where one document was claimed by
more than one book (two volumes of one work, plus duplicate list entries) — an ambiguous
body is dropped, since the wrong text under a title is worse than none.

The 40k gate is a weak proxy for licence that fails safe. It is not a solved problem:
the held 49 include both plainly public-domain classics and recent commercial titles, and
separating them needs author death dates, not word counts.

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

**Done**: Admin system + settings panel (PAT/key show-hide, time capsule seal), reading list (902 books, 898 sourced), journal CRUD, homepage inline editor, doc reader, local-first write queue (10s debounce + manual sync), AES-256-GCM encryption (passphrase + raw key modes), 41 Vitest tests, 6-palette theme switcher (sky/neutral/sage time-of-day adaptive), tlock time-capsule (sealed 2026-06-11, unlocks 2095-02-13), encrypted links page (2,094 bookmarks, 10 categories), dual-deploy (Cloudflare Pages live + GitHub Pages archive mirror with encrypted zip), library visibility axis (editable public/private independent of keep/hide/delete; P/F mark keys), library keyboard triage (reader-only: `←`/`→` navigate, `Delete`/`K`/`H` decide-and-advance, no UI hints — one curator), reading list ↔ library full text (125 baked docs; licence policy + backfill; the reader no longer reveals that a withheld body exists).

**Not done**:
- Homepage actual content (currently placeholder)
- Photo gallery system
- IPFS + DNSLink deployment
- nsite/Nostr deployment
- StaticCrypt password-protected sections
- Links: ~100 domain-only titles to fetch, dead link check
- Library ↔ reading list: 49 book-length works held by the word gate need per-title
  licence calls (author death dates, publisher — not word counts); 85 held on licence,
  almost all complete in-copyright books that should stay held; 4 documents each claimed
  by two list entries (two are genuine duplicate books.json rows worth merging)
