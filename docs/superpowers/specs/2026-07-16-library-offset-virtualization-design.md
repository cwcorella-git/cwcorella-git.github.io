# Library offset-windowed virtualization — design

**Date:** 2026-07-16
**Status:** approved (design), pending implementation plan
**Repos:** `library-api` (backend), `cwcorella-git.github.io` (frontend)

## Problem

`/library` renders 100,417 documents through virtua's `VList`, so the **DOM**
is virtualized — only ~30 rows exist at once. But **data loading** is keyset
(cursor) paginated: the client only holds the rows it has walked to (50 at a
time, appended). Consequences:

- The scrollbar thumb is sized to `items.length` (the loaded rows), not to
  `total`. It grows as you load and never represents the whole corpus.
- Dragging the thumb to an arbitrary position is impossible — rows between the
  loaded tail and the target don't exist client-side, and a keyset cursor can
  only answer "next N from here," never "give me row 80,000."
- Result: scroll → wait for a page → scroll → wait. The jump rail (shipped
  earlier today) hides this at anchor boundaries by re-seeding page 1, but
  *between* anchors it's back to scroll-wait-scroll.

## Goal

A scrollbar that spans all 100k documents from first paint, draggable to any
position, with the window under the cursor filling in on demand — and the jump
rail collapsing into the same mechanism (`scrollToIndex`).

## Approach — offset-windowed random access (chosen)

Move from keyset to **offset** loading. The client feeds `VList` a
`total`-length array of index slots; each visible slot is either a cached row
or a skeleton placeholder whose window is fetched on demand via
`LIMIT ? OFFSET ?`. Because the DB is **read-only and rebuilt atomically**,
offset's classic hazard (rows shifting mid-scroll → skips/dupes) does not apply.

Decisions locked during brainstorming:

- **Rail → index:** per-jump `COUNT(*)` (one indexed count per rail click) — no
  precompute, naturally honors active filters + search.
- **Migration scope:** full replace — the frontend keyset path
  (cursor / `hasNext` / `loadMore` / near-end detection / frontend `seek`) is
  removed. One offset-window loading path.
- **Backend is additive:** `/documents` keeps `cursor` + `seek` (still-valid,
  still-tested endpoints); it *gains* `offset` and a new `/anchor-offset`
  endpoint. Only the frontend does the big rewrite. This keeps backend risk low
  and lets the backend deploy first without breaking the currently-live frontend.

### Rejected alternatives

- **Keep keyset, add a fatter jump rail** — can't produce a full-corpus
  draggable scrollbar; structurally limited to "next from here."
- **Precompute all anchor offsets per query** — extra up-front work and a new
  endpoint coupled to sort+filters, for a rail that's a handful of clicks.
- **Keep keyset alongside offset** — two loading systems to test and reason
  about, for no user-visible benefit here.

---

## Backend (`library-api`)

### 1. `offset` on `GET /documents`

Add `offset: int | None = None` to the route and to `query.list_documents`.
When `offset is not None` (and `cursor is None`), append `OFFSET ?` after the
existing `LIMIT ?`:

```
SELECT <cols> FROM documents <where> <order_by> LIMIT ? OFFSET ?
```

- `offset` is clamped to `>= 0`. `cursor` and `offset` are mutually exclusive;
  if both arrive, `cursor` wins (documented; frontend never sends both).
- `total` is returned exactly as today (filter-only `COUNT(*)`), so the client
  learns the corpus size from the first window.
- `next_cursor` is still computed but is meaningless in offset mode; the
  frontend ignores it. (Left intact to avoid disturbing the keyset path.)
- The existing `limit + 1` peek is harmless under offset (it just reads one
  extra row); keep it rather than fork the query builder.

**Performance note (nullable sorts).** For `title`/`updated_at` (NOT NULL) the
`ORDER BY col, id` walks the covering index, so `OFFSET N` is an index-walk
(~ms even at N=99k). For `author`/`publication_date` (nullable) the ordering is
`ORDER BY (col IS NULL) <dir>, col <dir>, id <dir>`; the leading `(col IS NULL)`
expression prevents a pure index walk, so SQLite sorts the filtered set per
request (~hundreds of ms at 100k). This is acceptable for an admin-only page and
windows are cached, so a region is paid for ~once. **Optional** follow-up task
below removes it.

### 2. `GET /anchor-offset` — rail click → row index

New route + a pure `query.count_before(conn, *, sort, dir, value, q, filters)`
returning `{ "offset": int }`: the count of rows that sort **strictly before**
the anchor in the current ordering. Whitelist `sort`/`dir` (reuse
`cursor_mod.SORTS`/`DIRS`); reuse `_filter_sql` for filters + `q` so counts
match the list query. `sort` is interpolated (whitelisted); `value` is bound.

The ordering is `(col IS NULL) <dir>, col <dir>, id <dir>` (nullable) — so
**undated sorts last in asc, first in desc.** The before-count clauses:

| case | dir | WHERE added to filters | rationale |
|---|---|---|---|
| normal value | asc | `col < ?` | nulls have `NULL < ?` = false → correctly excluded (they sort last). `''` rows sort with dated and `'' < value` counts them — matches ORDER BY. |
| normal value | desc, nullable | `( col IS NULL OR col > ? )` | nulls sort first (before every dated row), plus dated rows greater than the anchor. |
| normal value | desc, NOT NULL | `col > ?` | no nulls exist; keeps the index. |
| `__undated__` | asc | `col IS NOT NULL` | offset of the null block = count of everything non-null (dated + any `''`). |
| `__undated__` | desc | *(return 0)* | null block is at the very top. |
| `__undated__` on NOT NULL sort | — | raise `QueryError` → 400 | mirrors the existing `seek=__undated__` guard. |

`value` uses the same `_UNDATED_SENTINEL = "__undated__"` constant already in
`query.py`.

**Undated `''` caveat (documented, not fixed).** `date_range.undated` counts
`publication_date IS NULL OR = ''`, but the ORDER BY only groups `IS NULL`; any
`''` rows sort among dated (at the empty-string position), not in the null
block. So `__undated__` lands `scrollToIndex` at the first **NULL** row; `''`
rows (if any exist — likely zero from the migration) are not at that anchor.
This only affects the semantic label of a rare edge, never scroll correctness.
Verify the `''` count once during implementation; if non-zero and material,
revisit.

### 3. (Optional) expression index for fast nullable offset

`CREATE INDEX idx_docs_pubdate_null_ord ON documents((publication_date IS NULL), publication_date, id);`
(and the analogous `author` index) lets the nullable ORDER BY walk an index,
making date/author-sort `OFFSET` fast. Add to the DB builder (`store.py`) so it
survives rebuilds, plus a one-time `CREATE INDEX` on the live DB. Marked
optional to keep the core change focused; default is to accept the sort cost.

### Backend tests (pytest)

- `offset`: window at 0 / mid / past-`total` (empty), `total` unchanged across
  offsets, `offset` + filter honored, `cursor` wins when both sent.
- `count_before`: asc/desc normal value against a hand-ordered seed; `__undated__`
  asc = dated count, desc = 0; `__undated__` on `title` raises; filter/`q`
  narrow the count. Reuse the existing conftest seed (has null-date rows).
- Smoke: `/anchor-offset` forwards params, `__undated__` on `title` → 400.

---

## Frontend (`cwcorella-git.github.io`)

### Data model — windowing replaces keyset

Constants (in a new pure module): `WINDOW_SIZE = 200`, `LOOKAHEAD = 1`,
`LRU_CAP = 15` (≈ 3,000 cached rows — flat memory on a 100k list).

State in `libraryState`:

- `_total: number | null`
- `_rowCache: Map<number, DocListItem>` — **non-reactive** (plain Map).
- `_version = $state(0)` — bumped after each window load/clear. The row snippet
  reads `_version` (to subscribe) then `_rowCache.get(index)`; since virtua
  renders ~30 rows, a global version bump re-rendering them is cheap and
  avoids a 100k-entry reactive proxy.
- `_loadedWindows: Set<number>`, `_inflightWindows: Set<number>` — window keys.
- `_queryEpoch` guard stays: a window response from a superseded query is
  discarded (the reliability contract — orderings never mix).

### Pure module — `src/lib/library/windowLogic.ts` (new, unit-tested)

- `windowKeyFor(index): number` = `Math.floor(index / WINDOW_SIZE)`
- `windowBounds(key): { offset, limit }` = `{ key*WINDOW_SIZE, WINDOW_SIZE }`
- `windowsForRange(start, end, lookahead): number[]` — aligned window keys
  covering `[start, end]` plus `lookahead` windows ahead.
- `evictWindows(loaded: Set<number>, active: number[], cap): number[]` — keys to
  drop when `loaded.size > cap`, farthest (by window-key distance) from the
  `active` set first. Pure.
- `resolveAnchorIndex(seek: string | null, dir, total): number | null` — the
  null-anchor shortcut: `seek === null` → `dir === 'asc' ? 0 : total - 1`;
  otherwise `null` (caller must fetch a count). Pure.

### `libraryLogic.ts`

- `toQuery(c, offset, limit)` — replaces the cursor/seek variant; sets
  `query.offset`. Remove `canLoadMore`, `appendPage`, `isStaleCursor`, and the
  `seek` branch. `computeQueryKey` unchanged.
- `LibraryState` shape drops `cursor`/`hasNext`; the windowing fields above live
  in `libraryState` directly.

### `types.ts`

- `LibraryQuery`: add `offset?: number`; drop `seek?`/`cursor?` from the paths
  the frontend now uses (leave the type fields if convenient — additive is fine).
- New `AnchorOffsetResponse { offset: number }`.

### `api.ts`

- `listDocuments` already forwards a `LibraryQuery` → `offset` rides along.
- Add `getAnchorOffset({ sort, dir, value, q, filters }): Promise<AnchorOffsetResponse>`.

### `libraryState.svelte.ts` — public surface

- `init()` → fetch window 0 + facets.
- `applyControls(patch)` → on change: clear cache, reset windows, bump epoch +
  `_version`, fetch window 0, scroll to top.
- `ensureWindowsForRange(start, end)` → compute needed windows, fetch missing
  (deduped, epoch-guarded, debounced ~80ms), populate cache, evict per LRU.
- `jumpToAnchor(seek)` → `resolveAnchorIndex`; if `null`, `getAnchorOffset` →
  `offset`. Then `DocList.scrollToIndex(offset)` (the ensuing scroll fetches the
  window). Exposed so `+page.svelte`'s `onSeek` calls it.
- `rowAt(index): DocListItem | undefined` (reads `_version` + cache).
- Getters: `total`, `version`, `status`, `facets`, plus doc-reader surface
  (`openDoc*`) unchanged.
- Removed: `loadMore`, `canLoadMore`, `queryKey`/`composeQueryKey` seek-gen
  plumbing, `seekTo`.

### `DocList.svelte`

- `VList data` = `Array.from({ length: total }, (_, i) => i)` (an index array),
  `getKey = i => i`. Rebuild only when `total`/`queryKey` changes.
- Row snippet: `const row = libraryState.rowAt(index)` → render `DocRow`/`DocCard`
  if present, else a `.skeleton` placeholder (fixed-ish height matching a row).
- `onscroll` → derive visible index range from `getScrollOffset()` +
  `getViewportSize()` + `findItemIndex(...)` → `libraryState.ensureWindowsForRange`.
  Also run once on mount and on `queryKey` change (scroll to 0 first).
- Expose `scrollToIndex(i)` from the `VListHandle` up to `+page.svelte` (bindable
  prop or callback ref) so the rail can drive it.
- Remove the `pendingRequest` near-end latch and `onLoadMore`.

### `+page.svelte`

- `anchors` derivation unchanged (`buildRail`).
- `onSeek={(seek) => libraryState.jumpToAnchor(seek)}`; `jumpToAnchor` calls the
  `DocList` scroll handle after resolving the index.

### `railLogic.ts` / `JumpRail.svelte`

Unchanged — anchors are still built and rendered identically. Only the click's
effect (scroll-to-index vs re-seed) changes, and that lives in `libraryState` /
`+page.svelte`.

### Frontend tests

- `windowLogic.test.ts`: `windowKeyFor`, `windowBounds`, `windowsForRange`
  (single window, spanning two, lookahead), `evictWindows` (under cap = none;
  over cap drops farthest), `resolveAnchorIndex` (null asc→0, null desc→total-1,
  value→null).
- `libraryLogic.test.ts`: `toQuery` sets `offset`, omits it when unset, carries
  filters/`q`.
- `.svelte` wiring (skeleton render, scroll→ensureWindows, rail→scrollToIndex)
  verified by `npm run check` + the user's admin-session pass (production API
  CORS blocks localhost; no automated e2e for the live path).

---

## Edge cases

- **Query change mid-flight:** epoch guard discards stale windows; cache cleared
  so no ordering ever mixes.
- **Offset past `total`** (over-filtered): empty window; slot stays skeleton.
  Not reachable via rail (counts respect filters).
- **Variable row heights + far jump:** virtua estimates unmeasured rows, lands
  approximately at index 80k, self-corrects on measure. Expected.
- **`total === 0`:** render "no documents match" (as today); no VList.
- **Deploy order:** backend first — the frontend hard-requires `offset` +
  `/anchor-offset` and has no keyset fallback after the full replace.

## Rollout

1. Backend: `offset`, `count_before`, `/anchor-offset`, tests → deploy to
   `/data/library-api`, restart unit, verify live (offset window, anchor counts,
   `__undated__`).
2. Frontend: windowing rewrite, tests, `npm run check`, production build → push
   `main` → Cloudflare Pages auto-deploy.
3. User admin-session verification: drag scrollbar to arbitrary positions
   (window fills in); rail jumps land at the right region; date-sort undated
   anchor lands in the null block.

## Out of scope (parked)

- Recovering the 65% missing `publication_date` values (metadata extraction) —
  deferred earlier; unrelated to virtualization.
- The optional nullable-sort expression index (§3) — include only if date-sort
  window latency proves annoying in practice.
