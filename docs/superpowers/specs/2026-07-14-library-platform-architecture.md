# Library Curation Platform — Architecture

**Date:** 2026-07-14
**Status:** Approved (umbrella spec). Sub-projects get their own spec → plan → build.
**Author:** Christopher + Claude

## Problem

The library/document system on `veritable-games-site` (Next.js 15 + PostgreSQL) has
become too heavy to keep curating on the main site. It spans **~100,700 documents /
~2.7 GB** across four PostgreSQL schemas, browsed through two competing frontends —
`/library` (react-virtuoso infinite scroll) and `/docs` (pagination) — plus a
duplicate manager. The infinite scroll is unreliable, pagination is tedious, and the
curation backlog is a drag on the main site.

Goal: move browsing + curation + repair of these documents onto a **private,
admin-only `/library` surface on `cwcorella.com`**, backed by a **new standalone
service that owns the data**, fixing the scroll problem structurally and keeping the
door open to a future *curated public pool*.

## Why the main site's infinite scroll is unreliable (root cause)

Not a tuning bug — an architectural one. The four collections live in separate
Postgres schemas with **no cross-schema JOIN allowed**, so `UnifiedDocumentService`
fakes a merged list in JS on every fetch: it queries each schema at the same offset,
keeps a *proportional sample* (~3 of every 100 rows), blends them, and re-sorts only
that small window. Consequences (all present in the code):

- **Most documents are unreachable** — proportional sampling discards the bulk of
  every offset window, so scroll can never reach the bottom ("stuck at N / infinite
  skeletons").
- **Offset is silently quantized** (`offset → page → offset′`) — off-boundary fetches
  return the wrong rows and cache them at the wrong slots → duplicates and jumps.
- **`itemContent(i)` is not a stable function of `i`** — the document at a given row
  changes between fetches, so cards remount and flicker.
- The "fixed March 15 2026" commit only patched a re-render storm; it never touched
  any of the above. Tests only assert HTTP 200, so a 90%-unreachable list still passes.

**The structural fix:** because the new service *owns the library in one database*,
there is a single global order. Once that exists, **keyset (cursor) pagination** makes
every one of those failure modes impossible.

## Architecture (three runtime pieces + one dormant)

### B — Library API (new)
- FastAPI container on the **workstation** (next to `veritable-games-postgres` and the
  Cloudflare tunnel). Its **own Postgres + own files volume**: document bodies stored
  as markdown/text files on B's volume, DB holds metadata + `file_path`. Keeps the DB
  lean for the 100k-row metadata queries that drive browse/search/sort.
- Exposed at a new CF-tunnel hostname (≈ `library-api.cwcorella.com`).
- **Auth:** Bearer token, validated by FastAPI. Token carried in cwcorella's existing
  admin-key mechanism (localStorage), sent as `Authorization: Bearer`.
- **Serves:** keyset-cursor pages over a single global order; metadata **and body
  full-text search** (Postgres `tsvector` GIN + `pg_trgm`); writes (metadata + body
  edits) with **revision history**; `word_count` + `character_count` recomputed on every
  save.

### C — cwcorella `/library` (new)
- Admin-gated SvelteKit route modeled on the existing private `/links` page
  (non-admin redirect + `{#if adminState.active}` wrapper + gated nav link).
- **Rendering:** `virtua` (`virtua/svelte` `VList`) virtualization + a **guarded
  IntersectionObserver sentinel** over B's cursor. One mechanism handles browse *and*
  body-FTS (FTS is just another ordered query).
- **Controls:** list/grid toggle, search bar, sort-by + ascending/descending toggle,
  **language** dropdown, **collections** dropdown (source *and* user-defined
  collections), `tags: string[]` management.
- **Editor:** per-doc reader/editor for metadata **and** body (markdown), with saved
  revisions, plus a **"needs formatting" triage queue**.
- Replaces the `reading` concept's role for this content; lives at `/library`, not
  `/reading`.

### A — main-site teardown (in `veritable-games-site`)
- Fix the **Page Kill Switches** (`system.page_flags`) so they actually enforce:
  gate the nav (currently a hardcoded static array), add a **route-level guard**
  backstop, and stop the **fail-open / maintenance-bypass** gaps.
- Add a `docs` flag + remove the Docs nav link; **remove the duplicate-manager
  routes**.
- Add a **shell-only** path so `/library` renders its frame without loading documents.
- **Data is copied, not moved** — the main-site library stays dormant and revivable.

### VATRA launcher (`launcher/`) — NOT affected
- **Correction (2026-07-14):** an earlier draft of this spec called for "cauterizing" a
  launcher library dependency. That was a mis-scoping. The launcher's
  `/api/launcher/library` endpoint serves **game entitlements** (`entitlements.title_grants`
  joined with itch/butler "caves" — the user's owned games), **not** the document library.
  It shares only the word "library." The launcher has **no dependency on the document
  library** and requires **no changes** for this migration. Left untouched.

## Data model (B owns)

Per document: `title, author, publication_date, source` (provenance: user / anarchist /
marxist / youtube), `collections` (many-to-many, user-defined), `language`,
`document_type`, `tags` (many-to-many), `notes`, `source_url`, `file_path`,
`word_count`, `character_count`, `visibility` (default **private**), `license`/`rights`
(for future public curation), `needs_formatting` flag, `view_count`, `created_at`,
`updated_at`, plus **revisions**.

Fingerprint/cluster tables are **preserved** (data kept) but the duplicate-review UI is
**deferred**.

### Visibility & the future public pool
Everything is private-behind-auth to start. Some documents (personal reference texts)
must **never** be publicly releasable. A future public pool would be a **heavily
curated subset limited to public-domain / open-source** material — opt-in per document
via `visibility` + `license`. The schema carries these fields now; the public surface is
**not built** in the first pass. Read/write auth stay separable so a public read path can
be added without a retrofit.

## Scroll / sort contract (the reliability core)

- **Cursor:** opaque base64 JSON `{ k: [sort_value, id], sort, dir }`. `k` is the last
  row's sort tuple; `sort`/`dir` bind the cursor to its ordering (a cursor from a
  different sort/filter is rejected).
- **Query:** same-direction sort uses a row-value tuple comparison
  `WHERE (sort_col, id) >/< (:v, :i)`; **mixed asc/desc** expands to the explicit
  `col < :v OR (col = :v AND id > :i)` OR-chain (single tuple comparison is only valid
  when all columns sort the same way). Always `ORDER BY sort_col <dir>, id <dir> LIMIT
  n+1` (the +1 gives `hasNextPage` with no count). **PK tie-breaker always.**
- **Indexes:** one composite index per selectable sort, matching column order *and*
  direction. FTS GIN (`tsvector`) for body/title; `pg_trgm` GIN for fuzzy title/author;
  b-tree on facets (language / collection / date / tags).
- **Scrollbar total:** use an **estimated** filtered count (EXPLAIN / `reltuples`) to
  size the phantom; exact count only when the filtered set is already small
  (filter-first keeps it small).
- **Sentinel:** guarded by `isFetching` + `hasNextPage`, re-keyed per page to avoid
  double-fetch / re-entrancy.
- **Reset semantics:** any change to (filters, sort column, sort dir, search text) is a
  new query key → drop cursor + cached pages, reset virtualizer scroll to 0, refetch the
  estimate, re-arm the sentinel.
- **Scroll restoration:** keep the list mounted behind a modal/nested route on doc open,
  or use SvelteKit `snapshot` (store scroll + filters/sort/search + restored cursor).
  Prefer native history over `goto()` for back-button restoration.

Top pitfalls to avoid (from the autopsy + research): offset for the streaming path;
missing PK tie-breaker; single tuple comparison for mixed asc/desc; array-index keys in
the virtualizer; unguarded IntersectionObserver; not resetting cursor/cache on
filter/sort/search change; exact `COUNT(*)` per request; cursor without sort/filter
binding; index not matching ORDER BY direction; relying on `goto()` for restoration.

## Migration

**Copy + verify + flip:**
1. Copy all 100k docs into B (including anarchist bodies off the Docker volume;
   youtube/marxist bodies out of their `content` columns into files; user-library
   markdown files). Backfill `word_count` + `character_count`.
2. Verify counts / integrity; run C against B.
3. **Only then** flip the main-site `/library` to its empty shell.

Original `veritable-games-postgres` data stays untouched as a fallback until confident.

## Build order

Each sub-project gets its own spec → plan → implementation cycle.

1. **A — main-site teardown + kill-switch fix.** Smallest, independent, fixes a live
   bug. Spec first. *(Target repo: `veritable-games-main`.)*
2. **B — Library API container + data migration + FTS + counts backfill.**
   *(New repo, TBD.)*
3. **C — cwcorella `/library` surface** (browse / scroll / edit / triage). Largest.
   *(Target repo: `cwcorella-git.github.io`.)*

**Explicitly deferred to later phases:** duplicate review UI, assisted/batch formatting
fixes, the curated public pool, full reconsideration of the main-site library interface
revival.

## Open items carried into sub-project specs

- **A:** fail-open vs fail-closed for intentionally-killed pages; what `/library` shows
  in shell mode; delete vs redirect for the duplicate-manager and `/docs` routes.
- **B:** exact schema DDL; how bodies are extracted per source; FTS config
  (language dictionaries); token issuance/rotation; deployment/compose + tunnel ingress.
- **C:** editor UX detail; triage-queue detection heuristics; grid vs list layout;
  theme integration (must match cwcorella's palette/FOUC contract).
