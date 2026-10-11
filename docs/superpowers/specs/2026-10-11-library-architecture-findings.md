# cwcorella /library vs VG /library — architecture findings

**Date:** 2026-10-11. Companion to `2026-10-11-library-unification-design.md`.
Findings only; rulings live in `2026-10-11-library-visual-rulings.md`.
Sources: read-only survey of `veritable-games/site/frontend` (HEAD `d28139167`, 27 files
uncommitted from the library-hardening session), this repo, and `/data/library-api`.

## 1. How the two sites are linked

There is **no direct link between the sites.** Both are clients of library-api, with
different tokens and different powers:

```
                 library-api (FastAPI, SQLite+FTS5, /data/library-api)
                 library.db + edits.db overlay + bodies/<source>/<slug>.md
                   ▲  operator token                       ▲  VG token (viewer=public|staff)
                   │  CORS: cwcorella.com                  │  server-side only, bridge 10.0.1.1:8088
                   │  reads + ALL curation writes          │  reads + delete-mark + view count
   cwcorella /library (browser, admin-only)          VG Next.js server  ──► Postgres (tags,
   + build-time bake reads library.db directly            annotations, favorites, revisions,
     (never the HTTP API)                                  VG-only fields)
                                         scripts/reconcile.py ─► writes VG curated / is_public
```

- **cwcorella** holds the operator token (`localStorage cwc-library-token`), calls the API
  from the browser, and is the **only** place curation happens: decisions, visibility,
  `needs_formatting`, body edits, versions/revert, download. 13 endpoints
  (`src/lib/library/api.ts`).
- **VG** holds `LIBRARY_API_VG_TOKEN`, calls only from its server, must pass
  `viewer=public|staff`, and library-api filters tiers in SQL (out-of-tier → 404). VG reads
  live through the API since 2026-09-28 (`LIBRARY_BACKEND=library-api`; unset = Postgres
  rollback). Its writes: delete-mark and view count. Its tag/edit UI still writes **VG
  Postgres** (single-store phase 4 not done) — so "edit on cwcorella only".
- **Publication** is computed, not toggled: `keep AND visibility=='public' AND license ∈
  {anti-copyright, free-distribution}` → VG public; any other `keep` → VG staff ("reference");
  everything else never reaches VG. `reconcile.py` pushes this into VG's Postgres flags and
  overwrites VG's admin toggle. Live public tier today: **1 document**.
- **Bake:** the public reading list renders library bodies at build time from `library.db`
  and `bodies/` on disk, licence- and 40k-word-gated.

## 2. Architectural differences that matter

| | cwcorella | VG |
|---|---|---|
| Role (`library-api/docs/STATUS.md`) | curates — full ~100k corpus, admin-only forever | shows — target ~1,000 docs |
| Runtime | static SvelteKit, client-side fetch | Next.js SSR, force-dynamic, `no-store`, no ISR |
| Data | 100% library-api | library-api + Postgres side tables |
| Auth | one operator bearer in the browser | server-held token + VG session → viewer tier |
| State | URL is the state (`urlLogic.ts`, shallow pushState) | Zustand stores + hooks, URL params on the list |
| List | offset windows of 200, LRU 15, `VList`, jump rail via `/anchor-offset` | virtualized grid/list, offset paging |
| Facets | `/facets` with counts, source → collection tree | **does not call `/facets` or `/tags`**; dropdowns |
| Renderer | `marked` + `<ann>` pass + DOMPurify last | react-markdown + gfm/math/breaks/wikilinks/directives/columns + rehype-sanitize schema + KaTeX (papers) |
| Theme | 6 palettes, glass, sky time-of-day | dark only, neutral greys, `#0a0a0a`/`#ededed`, Kalinga body font |
| Tests | pure-logic vitest per module + real-API Playwright e2e | renderer tests; library pages largely untested |

## 3. What VG has that cwcorella lacks

Reader: **KaTeX math**, **figures/assets**, YouTube embed, infobox sidecard, annotation
overlay, favorites, translations list, scroll-position indicator, scroll restoration,
SEO metadata. Renderer: allowlist sanitize schema, wikilinks, `::: center`, columns, text
colours, numbered heading ids, task/nested lists. Site: tier model per viewer, mobile filter
sheet, font panel, a coherent dark visual language. Library ops: create document, per-doc
revision history UI, auto-tag/import tags, batch visibility.

## 4. What cwcorella has that VG lacks

Curation: keep/hide/delete with keyboard triage and auto-advance, visibility and
`needs_formatting` flags, progress stats, body edit with versions and revert-to-original,
markdown download. Navigation: counted facets with source→collection tree, tag AND-filter
with long-tail search, jump rail (alpha/date) seeking by real row offset, relevance
snippets with highlights, search syntax (`"phrase"`, `-x`, `OR`), document TOC panel,
addressable list+document URLs with real links, stale-while-revalidate reader. Scale: the
whole corpus including undecided. Engineering: invariants pinned in pure tested modules
(`keyLogic`, `urlLogic`, `libraryLogic`) and an e2e against a seeded real API.

## 5. Consequences for "cwcorella as test-bed"

1. **The renderer is the test-bed's whole point, and today it lies.** `needs_formatting`
   fixes are previewed in `marked`, but VG renders with a different pipeline (breaks,
   directives, math, columns). A body that looks fixed on cwcorella can render differently
   on VG. Until the renderers agree, cwcorella cannot be trusted as VG's formatting preview.
2. **Figures and math cannot be curated on cwcorella** — the `papers` source's whole value.
3. **cwcorella curates; VG shows.** Visual convergence must not remove curation density
   (rows, keys, facets) to imitate VG's card grid.
4. VG gains nothing from cwcorella's navigation until it calls `/facets` and
   `/anchor-offset` — separate, VG-side work.
