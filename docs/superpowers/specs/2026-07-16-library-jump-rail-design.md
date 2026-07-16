# Library jump rail — design

**Date:** 2026-07-16
**Status:** approved (design), pending implementation plan
**Repos touched:** `cwcorella-git.github.io` (frontend) + `library-api` (backend, needs deploy)

## Problem

`/library` lists ~100k documents. The DOM is already virtualized (`virtua`
`VList`), but data is fetched with **keyset (cursor) pagination** — 50 at a time,
each page anchored on the previous page's cursor. Consequences the user hit:

- The scrollbar thumb reflects only rows **loaded so far** (`items.length`), not
  the full corpus, so it keeps growing and can't be dragged to the middle.
- Reaching document #50,000 means walking all ~1,000 pages in between. There is no
  "give me the N-th document" — cursors only go "next from here." Hence
  "scroll, wait, scroll, wait."

True random-access (offset windowing) was considered and rejected by the user in
favor of a lighter **jump rail**: a set of seek-anchors matched to the active sort
column, letting one click land near any point in the ordering.

## What we're building

A **jump rail** beside the document list. Clicking an anchor issues a fresh query
seeked to that point, resets the list there, and scrolls to top; normal cursor
scroll-down continues from the new position.

The rail adapts to the active sort:

| Sort column | Rail |
|---|---|
| `title`, `author` (text) | `#` · A · B · … · Z |
| `publication_date` (date) | `‹1800` · 1800s · 1810s · … · 2020s · `undated` |
| `updated_at` | *no rail* — every doc shares the migration timestamp (`2026-07-15`), so a rail would be a single dead bucket. |

The rail is **direction-aware**: ascending seeks `>= anchor`, descending seeks
`<= anchor`, so the rail always reads top-to-bottom the way the list is ordered.

Search does **not** disable the rail: in this API, FTS is a *filter* and results
stay ordered by the sort column, so `seek` composes with an active search
(`WHERE <ftsmatch> AND title >= 'M'`) and the rail keeps working within the
filtered set.

### Data grounding (why these buckets)

Measured on the live DB (100,417 docs):

- `publication_date` is TEXT, nullable. **65,780 (65%) undated**; 34,637 dated.
- Dated values are always year-first (`YYYY` = 21,855 rows, `YYYY-MM-DD` = 12,782).
  `substr(date,1,4)` is a reliable year.
- Distribution: pre-1700 ~27 (mostly metadata junk — `0720` on a modern title;
  1388/1397/1404 are Farsi Solar-Hijri years ≈2009–2025), 1700s 40, **1800s 4,453,
  1900s 16,002, 2000s 14,115**. 99%+ of dated docs are 1800–2025.
- The user's "ancient religious texts" (Buddhist/Hindu/Stoic) are in the **undated
  65%**, not stored as BCE. So the rail never needs BCE or millennia.

Therefore: **decades across the dense modern span**, a single **`‹1800`** bucket
collapsing the sparse (and partly junk) old tail, and an **`undated`** anchor for
the 65% no-date block. Year granularity is rejected (200+ anchors, longer than the
scrollbar it replaces). The decade range is derived from the corpus min/max year,
so it grows on its own as older/newer docs are added.

## Architecture

Four units, each independently testable.

### 1. Backend — `seek` param (`library-api/backend/api/query.py`)

`list_documents` gains `seek: str | None = None`.

- Applies **only when `cursor is None`** (a seek starts a fresh page; continuation
  pages use the returned `next_cursor` as today). If both are passed, cursor wins.
- The seek column is the already-whitelisted `sort` column — safe to interpolate;
  the value stays a `?` parameter.
- **Normal value:** `asc → AND {sort} >= ?`, `desc → AND {sort} <= ?`.
- **Undated sentinel** `seek == "__undated__"` (valid only for nullable sort
  columns `author`, `publication_date`): `AND ({sort} IS NULL OR {sort} = '')`.
  Sentinel on a NOT NULL sort (`title`, `updated_at`) → `QueryError` (400).
- **`#` / top:** represented client-side as `seek == null` (no param) — a plain
  first page already starts at the top of the ordering. No backend special case.

The seek clause is appended to `where_clauses` before `order_by`; ordering,
`next_cursor` minting, and the `total` count are unchanged. `total` still reflects
the full filtered set (the seek narrows the *page start*, not the count — the count
stays honest so "showing X of TOTAL" is unaffected).

### 2. Backend — date range in `/facets` (`get_facets`)

Add a `date_range` field to the facets response:

```json
"date_range": { "min_year": 1800, "max_year": 2025, "undated": 65780 }
```

- `min_year` / `max_year` from `MIN/MAX(CAST(substr(publication_date,1,4) AS INT))`
  over non-empty dates. Junk like `0720` lands harmlessly in the `‹1800` bucket, so
  no junk-filtering is needed — but the frontend clamps the first real decade to
  1800 regardless.
- `undated` = count of null/empty dates (drives whether the `undated` anchor shows).

`app.py` already returns `get_facets(...)` verbatim, so only the query function and
the frontend `Facets` type change.

### 3. Frontend logic — `src/lib/library/railLogic.ts` (pure, unit-tested)

```ts
type RailAnchor = { label: string; seek: string | null };
railKind(sort): 'alpha' | 'date' | 'none'   // title/author→alpha, publication_date→date, else none
alphaAnchors(dir): RailAnchor[]           // '#' (seek:null) + A..Z, reversed for desc
dateAnchors(range, dir): RailAnchor[]     // ‹1800 + decades + undated, dir-ordered
buildRail(sort, dir, facets): RailAnchor[]  // [] when kind==='none' or facets missing
```

- `alphaAnchors`: `#` (seek `null` → top), then A–Z each with `seek` = the letter.
  Reversed for `desc`; `#` still maps to the top of the ordering.
- `dateAnchors`: decades from `max(1800, floorDecade(min_year))` to
  `floorDecade(max_year)`. Prepend `‹1800` (asc seek `null`/top; desc seek the
  boundary that lands just below 1800). Append `undated` (seek `"__undated__"`) when
  `facets.date_range.undated > 0`. Whole list reversed for `desc`.
- Decade anchor `seek` = the boundary that lands at the **top** of that decade for
  the current direction: `asc` sends the decade's start year (`"1990"` → `>= '1990'`
  lands at 1990); `desc` sends the year just past the decade's end (`"1999"` or the
  next-decade start, → `<= '1999'` lands at the newest 1990s row). `dateAnchors`
  emits the dir-correct value; the server applies the plain `>=`/`<=`.

### 4. Frontend state + query plumbing

- `LibraryQuery` gains `seek?: string`. `toQuery(controls, cursor, limit, seek?)`
  includes `seek` **only for a first page** (when `cursor === null`).
- `libraryState.seekTo(seek: string | null)`: stores `_pendingSeek`, resets
  `_state = emptyState()`, runs `_fetchFirstPage()` (which reads and then clears
  `_pendingSeek`). Existing epoch guard (`_queryEpoch`) already discards races.
- **Scroll reset:** a seek doesn't change sort/filter, so `computeQueryKey` won't
  change on its own. Add a monotonic **seek generation** to the key
  (`computeQueryKey` includes a seek counter) so the existing `DocList` queryKey
  effect fires `scrollTo(0)` and re-arms the load-more latch — reusing the proven
  reset path instead of adding a parallel one.

### 5. Frontend component — `src/lib/components/library/JumpRail.svelte`

- Props: `anchors: RailAnchor[]`, `onSeek: (seek: string | null) => void`.
- Renders a compact vertical rail on the right edge of the list wrap; each anchor a
  button. Reuses existing CSS-var styling (`--font-ui`, glass tokens).
- Wiring: `+page.svelte` (or `DocList`) computes `buildRail(controls.sort,
  controls.dir, facets)` and passes it down; `onSeek → libraryState.seekTo`.
- **Responsive:** below the mobile breakpoint the rail collapses to a horizontal
  scroll strip above the list (or hides for the alpha rail) — final call in the
  plan; it must never force the page body to scroll horizontally.

## Data flow

```
click anchor "1990s"
  → JumpRail onSeek("1990")
  → libraryState.seekTo("1990")        // _pendingSeek set, list reset, seekGen++
  → _fetchFirstPage() → GET /documents?sort=publication_date&dir=asc&seek=1990&limit=50
  → server: WHERE (filters) AND publication_date >= '1990' ORDER BY … LIMIT 51
  → appendPage → list now starts at 1990; next_cursor drives further scroll-down
  → computeQueryKey changed (seekGen) → DocList effect → VList.scrollTo(0)
```

## Testing

- **Backend** (`tests/test_api_query.py`): seek asc (`>=`), seek desc (`<=`), seek
  on text vs date column, `__undated__` sentinel returns only null/empty dates,
  sentinel on NOT NULL sort → 400, seek + cursor together (cursor wins), seek + FTS
  filter composes. Facets `date_range` shape + `undated` count.
- **Frontend logic** (`railLogic.test.ts`): `railKind` per sort; `alphaAnchors`
  content + desc reversal + `#`→null; `dateAnchors` decade span from range, `‹1800`
  collapse, `undated` present only when count > 0, desc ordering; `buildRail`
  dispatch.
- **State**: `seekTo` sets query `seek`, resets list, bumps seek generation; a
  seek race is discarded by the epoch guard; `loadMore` after a seek uses cursor
  (no `seek`).
- **`.svelte`**: `npm run check` + a Playwright pass (rail renders per sort, click
  jumps + scrolls to top, rail adapts when sort changes).

## Out of scope

- Offset/random-access windowing (explicitly deferred in favor of the rail).
- Year-level date anchors.
- Restoring in-browser publish (separate open PAT issue).

## Deploy note

Backend change ships to `/data/library-api` via `ssh -A ssh.veritablegames.com`
pull + `sudo systemctl restart library-api` (the deploy-key can't fetch; agent
forwarding is the path). Frontend ships by push to `main` → Cloudflare Pages.
The frontend tolerates the old backend (absent `seek` param is ignored; absent
`date_range` → date rail simply doesn't render), so **deploy backend first**.
