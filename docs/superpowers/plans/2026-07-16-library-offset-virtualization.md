# Library offset-windowed virtualization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/library` a full-corpus draggable scrollbar by loading rows in offset windows instead of keyset pages, with the jump rail collapsing into `scrollToIndex`.

**Architecture:** Backend gains an `offset` param on `/documents` and a new `/anchor-offset` count endpoint (both additive; keyset stays). Frontend fully replaces the keyset path with a windowed row cache: `VList` renders a `total`-length index array, visible windows fetch on demand via `LIMIT/OFFSET`, and rail clicks resolve to a row index (`0`/`total-1` shortcut or a per-jump count) then `scrollToIndex`.

**Tech Stack:** FastAPI + SQLite (backend, pytest); SvelteKit 2 / Svelte 5 runes + virtua/svelte (frontend, vitest).

## Global Constraints

- Backend changes are **additive** — do not remove `cursor`/`seek` or their tests.
- **Deploy backend first**, verify live, then frontend (frontend has no keyset fallback).
- Backend repo: `/home/user/Projects/library-api`. Run tests with `python3 -m pytest` (there is no `python`). Live deploy tree: `/data/library-api` on the workstation (reachable via `ssh -A ssh.veritablegames.com`); restart `library-api.service`; passwordless sudo available. The token lives in root-only `/data/library-api/library-api.env` — read via `sudo grep -oP "LIBRARY_API_TOKEN=\K.*"` for curl checks.
- Frontend repo: `/home/user/Projects/cwcorella-git.github.io`. Node 20 (`nvm use 20`). Gates: `npm test`, `npm run check`, `npm run build`. Push to `main` → Cloudflare Pages auto-deploy.
- Sort column is whitelisted (`cursor_mod.SORTS`) before interpolation; all values stay bound with `?`.
- Ordering is `ORDER BY (col IS NULL) <dir>, col <dir>, id <dir>` for nullable sorts (`author`, `publication_date`) and `ORDER BY col <dir>, id <dir>` for NOT NULL sorts (`title`, `updated_at`). Undated rows sort **last in asc, first in desc**.

---

## Task 1: Backend `offset` param on `/documents`

**Files:**
- Modify: `library-api/backend/api/query.py` (`list_documents`)
- Modify: `library-api/backend/api/app.py` (`/documents` route)
- Test: `library-api/tests/test_api_query.py`, `library-api/tests/test_api_smoke.py`

**Interfaces:**
- Produces: `query.list_documents(..., offset: int | None = None)` — when `offset` is set and `cursor` is None, the page query appends `OFFSET ?`. Route gains `offset` query param.

- [ ] **Step 1: Write the failing test** — append to `test_api_query.py`:

```python
class TestOffset:
    def _all_titles(self, conn):
        rows = conn.execute(
            "SELECT title FROM documents ORDER BY title ASC, id ASC"
        ).fetchall()
        return [r["title"] for r in rows]

    def test_offset_zero_matches_first_page(self, conn):
        res = query.list_documents(conn, sort="title", dir="asc", offset=0, limit=3)
        assert [i["title"] for i in res["items"]] == self._all_titles(conn)[:3]

    def test_offset_mid_skips_rows(self, conn):
        res = query.list_documents(conn, sort="title", dir="asc", offset=3, limit=3)
        assert [i["title"] for i in res["items"]] == self._all_titles(conn)[3:6]

    def test_offset_past_end_is_empty(self, conn):
        res = query.list_documents(conn, sort="title", dir="asc", offset=9999, limit=5)
        assert res["items"] == []

    def test_offset_total_unchanged(self, conn):
        a = query.list_documents(conn, sort="title", dir="asc", offset=0, limit=2)
        b = query.list_documents(conn, sort="title", dir="asc", offset=5, limit=2)
        assert a["total"] == b["total"]

    def test_cursor_wins_over_offset(self, conn):
        # cursor present => offset ignored (keyset path unchanged)
        first = query.list_documents(conn, sort="title", dir="asc", limit=2)
        nxt = query.list_documents(
            conn, sort="title", dir="asc", cursor=first["next_cursor"], offset=50, limit=2
        )
        assert len(nxt["items"]) == 2
```

Note: `conn` fixture — confirm `test_api_query.py` already opens a read connection to `seeded_db`; if the file uses a different fixture name, match it.

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/user/Projects/library-api && python3 -m pytest tests/test_api_query.py::TestOffset -q`
Expected: FAIL (`list_documents() got an unexpected keyword argument 'offset'`).

- [ ] **Step 3: Implement** — in `query.py`, add `offset` to the signature and apply it:

```python
def list_documents(
    conn: sqlite3.Connection,
    *,
    sort: str = "title",
    dir: str = "asc",
    cursor: str | None = None,
    q: str | None = None,
    filters: dict | None = None,
    limit: int = 50,
    seek: str | None = None,
    offset: int | None = None,
) -> dict:
```

Then, where `page_sql`/`page_params` are built (replace those two statements):

```python
    page_sql = (
        f"SELECT {_LIST_COLUMNS} FROM documents {where_sql} "
        f"{order_by} "
        f"LIMIT ?"
    )
    page_params = where_params + [limit + 1]

    use_offset = cur is None and offset is not None
    if use_offset:
        page_sql += " OFFSET ?"
        page_params.append(max(0, offset))
```

- [ ] **Step 4: Wire the route** — in `app.py`, add `offset` to the `/documents` params (after `seek`, before `limit`):

```python
        seek: str | None = None,
        offset: int | None = Query(None, ge=0),
        limit: int = Query(50, ge=1),
```

and pass it through:

```python
                result = query.list_documents(
                    conn, sort=sort, dir=dir, cursor=cursor, q=q,
                    filters=filters, limit=limit, seek=seek, offset=offset,
                )
```

- [ ] **Step 5: Smoke test the param** — append to `test_api_smoke.py`:

```python
class TestOffsetParam:
    def test_offset_forwarded(self, client, auth):
        r = client.get("/documents?sort=title&dir=asc&offset=2&limit=2", headers=auth)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 2

    def test_negative_offset_rejected(self, client, auth):
        r = client.get("/documents?offset=-1", headers=auth)
        assert r.status_code == 422  # FastAPI ge=0 validation
```

- [ ] **Step 6: Run backend suite**

Run: `cd /home/user/Projects/library-api && python3 -m pytest -q`
Expected: all pass (existing + new).

- [ ] **Step 7: Commit**

```bash
cd /home/user/Projects/library-api
git add backend/api/query.py backend/api/app.py tests/test_api_query.py tests/test_api_smoke.py
git commit -m "feat(api): offset param on /documents for windowed reads"
```

---

## Task 2: Backend `count_before` (anchor → offset)

**Files:**
- Modify: `library-api/backend/api/query.py` (new `count_before`)
- Test: `library-api/tests/test_api_query.py`

**Interfaces:**
- Produces: `query.count_before(conn, *, sort, dir, value, q=None, filters=None) -> int` — count of rows sorting strictly before `value` in the current ordering. `value == "__undated__"` targets the null block. Raises `QueryError` on bad sort/dir or `__undated__` on a NOT NULL sort.

- [ ] **Step 1: Write the failing test** — append to `test_api_query.py`:

```python
class TestCountBefore:
    def _titles_asc(self, conn):
        return [r["title"] for r in conn.execute(
            "SELECT title FROM documents ORDER BY title ASC, id ASC").fetchall()]

    def test_asc_value_counts_rows_before(self, conn):
        titles = self._titles_asc(conn)
        # pick a real title; everything strictly less than it is "before"
        target = titles[4]
        expected = sum(1 for t in titles if t < target)
        assert query.count_before(conn, sort="title", dir="asc", value=target) == expected

    def test_desc_value_counts_rows_before(self, conn):
        titles = [r["title"] for r in conn.execute(
            "SELECT title FROM documents ORDER BY title DESC, id DESC").fetchall()]
        target = titles[4]
        expected = sum(1 for t in titles if t > target)
        assert query.count_before(conn, sort="title", dir="desc", value=target) == expected

    def test_undated_asc_equals_dated_count(self, conn):
        dated = conn.execute(
            "SELECT COUNT(*) c FROM documents WHERE publication_date IS NOT NULL"
        ).fetchone()["c"]
        assert query.count_before(
            conn, sort="publication_date", dir="asc", value="__undated__") == dated

    def test_undated_desc_is_zero(self, conn):
        assert query.count_before(
            conn, sort="publication_date", dir="desc", value="__undated__") == 0

    def test_undated_on_not_null_sort_raises(self, conn):
        with pytest.raises(query.QueryError):
            query.count_before(conn, sort="title", dir="asc", value="__undated__")

    def test_filter_narrows_count(self, conn):
        # a language filter reduces the before-count vs unfiltered
        target = self._titles_asc(conn)[6]
        wide = query.count_before(conn, sort="title", dir="asc", value=target)
        narrow = query.count_before(
            conn, sort="title", dir="asc", value=target, filters={"language": "en"})
        assert narrow <= wide

    def test_bad_sort_raises(self, conn):
        with pytest.raises(query.QueryError):
            query.count_before(conn, sort="evil; DROP", dir="asc", value="x")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/user/Projects/library-api && python3 -m pytest tests/test_api_query.py::TestCountBefore -q`
Expected: FAIL (`module 'query' has no attribute 'count_before'`).

- [ ] **Step 3: Implement** — add to `query.py` (after `list_documents`):

```python
def count_before(
    conn: sqlite3.Connection,
    *,
    sort: str = "title",
    dir: str = "asc",
    value: str = "",
    q: str | None = None,
    filters: dict | None = None,
) -> int:
    """Count rows that sort strictly before `value` in the current ordering.

    The offset a rail anchor should scroll to. `value == _UNDATED_SENTINEL`
    targets the null block. `sort` is whitelisted before interpolation; `value`
    is bound. The before-clauses mirror ORDER BY (col IS NULL) <dir>, col <dir>:
    nulls sort last in asc (excluded by "col < ?"), first in desc (added back).
    """
    if sort not in cursor_mod.SORTS:
        raise QueryError(f"invalid sort: {sort!r}")
    if dir not in cursor_mod.DIRS:
        raise QueryError(f"invalid dir: {dir!r}")

    nullable = sort not in _NOT_NULL_SORTS
    filter_clauses, filter_params = _filter_sql(q, filters)
    where = list(filter_clauses)
    params = list(filter_params)

    if value == _UNDATED_SENTINEL:
        if not nullable:
            raise QueryError(f"anchor=undated invalid for NOT NULL sort {sort!r}")
        if dir == "desc":
            return 0  # null block sorts first in desc
        where.append(f"{sort} IS NOT NULL")  # asc: everything non-null precedes nulls
    elif dir == "asc":
        where.append(f"{sort} < ?")  # NULL < ? is false -> nulls excluded (they sort last)
        params.append(value)
    elif nullable:
        where.append(f"( {sort} IS NULL OR {sort} > ? )")  # desc: nulls first, then col>value
        params.append(value)
    else:
        where.append(f"{sort} > ?")
        params.append(value)

    sql = f"SELECT COUNT(*) AS c FROM documents {_where_sql(where)}"
    try:
        return conn.execute(sql, params).fetchone()["c"]
    except sqlite3.OperationalError as exc:
        raise QueryError("bad search query") from exc
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/user/Projects/library-api && python3 -m pytest tests/test_api_query.py::TestCountBefore -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Projects/library-api
git add backend/api/query.py tests/test_api_query.py
git commit -m "feat(api): count_before for rail anchor -> row offset"
```

---

## Task 3: Backend `/anchor-offset` route

**Files:**
- Modify: `library-api/backend/api/app.py`
- Test: `library-api/tests/test_api_smoke.py`

**Interfaces:**
- Consumes: `query.count_before` (Task 2).
- Produces: `GET /anchor-offset?sort=&dir=&value=&<filters>&q=` → `{ "offset": int }`.

- [ ] **Step 1: Write the failing test** — append to `test_api_smoke.py`:

```python
class TestAnchorOffset:
    def test_returns_offset(self, client, auth):
        r = client.get("/anchor-offset?sort=title&dir=asc&value=M", headers=auth)
        assert r.status_code == 200
        assert isinstance(r.json()["offset"], int)

    def test_undated_desc_zero(self, client, auth):
        r = client.get(
            "/anchor-offset?sort=publication_date&dir=desc&value=__undated__", headers=auth)
        assert r.status_code == 200
        assert r.json()["offset"] == 0

    def test_undated_on_title_is_400(self, client, auth):
        r = client.get(
            "/anchor-offset?sort=title&dir=asc&value=__undated__", headers=auth)
        assert r.status_code == 400

    def test_requires_auth(self, client):
        r = client.get("/anchor-offset?sort=title&dir=asc&value=M")
        assert r.status_code == 401
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/user/Projects/library-api && python3 -m pytest tests/test_api_smoke.py::TestAnchorOffset -q`
Expected: FAIL (404 — route not defined).

- [ ] **Step 3: Implement** — in `app.py`, add after the `/facets` route (before `return app`):

```python
    @app.get("/anchor-offset", dependencies=[Depends(require_token)])
    def anchor_offset(
        sort: str = "title",
        dir: str = "asc",
        value: str = "",
        q: str | None = None,
        language: str | None = None,
        source: str | None = None,
        collection: str | None = None,
        tag: str | None = None,
        visibility: str | None = None,
        needs_formatting: int | None = None,
    ):
        filters = {
            "language": language, "source": source, "collection": collection,
            "tag": tag, "visibility": visibility, "needs_formatting": needs_formatting,
        }
        filters = {k: v for k, v in filters.items() if v is not None}

        conn = read_conn(settings.db)
        try:
            try:
                offset = query.count_before(
                    conn, sort=sort, dir=dir, value=value, q=q, filters=filters)
            except query.QueryError as e:
                raise HTTPException(status_code=400, detail=str(e))
        finally:
            conn.close()

        return {"offset": offset}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/user/Projects/library-api && python3 -m pytest tests/test_api_smoke.py::TestAnchorOffset -q`
Expected: PASS.

- [ ] **Step 5: Full backend suite + commit**

```bash
cd /home/user/Projects/library-api && python3 -m pytest -q
git add backend/api/app.py tests/test_api_smoke.py
git commit -m "feat(api): GET /anchor-offset endpoint"
```

Expected: all green.

---

## Task 4: Deploy backend + live verification

**Files:** none (deploy only).

- [ ] **Step 1: Push**

```bash
cd /home/user/Projects/library-api && git push origin main
```

- [ ] **Step 2: Deploy on workstation**

```bash
ssh -A ssh.veritablegames.com '
  cd /data/library-api &&
  git pull --ff-only &&
  sudo systemctl restart library-api.service &&
  sleep 1 && systemctl is-active library-api.service'
```
Expected: `active`.

- [ ] **Step 3: Live verify** (offset window, anchor count, undated). Read the token first:

```bash
ssh -A ssh.veritablegames.com '
  T=$(sudo grep -oP "LIBRARY_API_TOKEN=\K.*" /data/library-api/library-api.env)
  echo "offset window:"; curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/documents?sort=title&dir=asc&offset=50000&limit=2" | head -c 300; echo
  echo "anchor M:"; curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/anchor-offset?sort=title&dir=asc&value=M"; echo
  echo "undated asc:"; curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/anchor-offset?sort=publication_date&dir=asc&value=__undated__"; echo
  echo "undated desc:"; curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/anchor-offset?sort=publication_date&dir=desc&value=__undated__"; echo'
```
Expected: offset window returns 2 items with a stable `total` (100417); anchor M returns a plausible offset (tens of thousands); undated asc ≈ dated count (100417 − 65780 ≈ 34637); undated desc = 0.

- [ ] **Step 4: Check the `''`-vs-NULL caveat once**

```bash
ssh -A ssh.veritablegames.com '
  T=$(sudo grep -oP "LIBRARY_API_TOKEN=\K.*" /data/library-api/library-api.env)
  sqlite3 /data/library-api/library.db "SELECT COUNT(*) FROM documents WHERE publication_date = \"\";" 2>/dev/null || echo "(adjust db path)"'
```
Expected: `0` (confirms the caveat is moot). If non-zero, note it — the undated anchor lands at the NULL block only; revisit if material. (Adjust the db filename if it differs; find it in `library-api.env` as the DB path.)

---

## Task 5: Frontend pure window logic

**Files:**
- Create: `cwcorella-git.github.io/src/lib/library/windowLogic.ts`
- Test: `cwcorella-git.github.io/src/lib/library/windowLogic.test.ts`

**Interfaces:**
- Produces: `WINDOW_SIZE`, `LRU_CAP`, `LOOKAHEAD`, `windowKeyFor`, `windowBounds`, `windowsForRange`, `evictWindows`, `resolveAnchorIndex`.

- [ ] **Step 1: Write the failing test** — create `windowLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
	WINDOW_SIZE, LRU_CAP,
	windowKeyFor, windowBounds, windowsForRange, evictWindows, resolveAnchorIndex
} from './windowLogic';

describe('windowKeyFor / windowBounds', () => {
	it('maps index to aligned window', () => {
		expect(windowKeyFor(0)).toBe(0);
		expect(windowKeyFor(WINDOW_SIZE - 1)).toBe(0);
		expect(windowKeyFor(WINDOW_SIZE)).toBe(1);
	});
	it('bounds are offset+limit', () => {
		expect(windowBounds(0)).toEqual({ offset: 0, limit: WINDOW_SIZE });
		expect(windowBounds(3)).toEqual({ offset: 3 * WINDOW_SIZE, limit: WINDOW_SIZE });
	});
});

describe('windowsForRange', () => {
	it('single window, no lookahead', () => {
		expect(windowsForRange(0, 10, 0)).toEqual([0]);
	});
	it('spans two windows', () => {
		expect(windowsForRange(WINDOW_SIZE - 1, WINDOW_SIZE + 1, 0)).toEqual([0, 1]);
	});
	it('adds lookahead windows', () => {
		expect(windowsForRange(0, 10, 1)).toEqual([0, 1]);
	});
	it('clamps negative start', () => {
		expect(windowsForRange(-5, 10, 0)).toEqual([0]);
	});
});

describe('evictWindows', () => {
	it('under cap evicts nothing', () => {
		const loaded = new Set([0, 1, 2]);
		expect(evictWindows(loaded, [1], 15)).toEqual([]);
	});
	it('over cap drops farthest from active first', () => {
		const loaded = new Set([0, 1, 2, 3, 100]);
		const dropped = evictWindows(loaded, [2], 4);
		expect(dropped).toEqual([100]);
	});
	it('never lists an active window before others when over cap', () => {
		const loaded = new Set([0, 50, 51]);
		const dropped = evictWindows(loaded, [50], 2);
		expect(dropped).toEqual([0]);
	});
});

describe('resolveAnchorIndex', () => {
	it('null seek asc -> 0', () => {
		expect(resolveAnchorIndex(null, 'asc', 1000)).toBe(0);
	});
	it('null seek desc -> total-1', () => {
		expect(resolveAnchorIndex(null, 'desc', 1000)).toBe(999);
	});
	it('null seek desc with 0 total -> 0', () => {
		expect(resolveAnchorIndex(null, 'desc', 0)).toBe(0);
	});
	it('value seek -> null (needs a count)', () => {
		expect(resolveAnchorIndex('M', 'asc', 1000)).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm test -- src/lib/library/windowLogic.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — create `windowLogic.ts`:

```ts
/** Pure window math + LRU for offset-windowed list loading. No Svelte, no I/O. */

export const WINDOW_SIZE = 200;
export const LOOKAHEAD = 1;
export const LRU_CAP = 15; // ~3000 cached rows

export function windowKeyFor(index: number): number {
	return Math.floor(Math.max(0, index) / WINDOW_SIZE);
}

export function windowBounds(key: number): { offset: number; limit: number } {
	return { offset: key * WINDOW_SIZE, limit: WINDOW_SIZE };
}

/** Aligned window keys covering [start, end], plus `lookahead` windows ahead. */
export function windowsForRange(start: number, end: number, lookahead: number): number[] {
	const first = windowKeyFor(start);
	const last = windowKeyFor(end);
	const keys: number[] = [];
	for (let k = first; k <= last + lookahead; k++) keys.push(k);
	return keys;
}

/** Keys to evict when `loaded` exceeds `cap`: farthest (by key distance) from
 *  any `active` window first. Active windows sort last, so they survive. */
export function evictWindows(loaded: Set<number>, active: number[], cap: number): number[] {
	if (loaded.size <= cap) return [];
	const dist = (k: number) =>
		active.length ? Math.min(...active.map((a) => Math.abs(k - a))) : k;
	const sorted = [...loaded].sort((a, b) => dist(b) - dist(a)); // farthest first
	return sorted.slice(0, loaded.size - cap);
}

/** The null-anchor shortcut: leading bucket in asc (0), trailing in desc
 *  (total-1). A real value returns null — the caller must fetch a count. */
export function resolveAnchorIndex(
	seek: string | null,
	dir: 'asc' | 'desc',
	total: number
): number | null {
	if (seek === null) return dir === 'asc' ? 0 : Math.max(0, total - 1);
	return null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm test -- src/lib/library/windowLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/user/Projects/cwcorella-git.github.io
git add src/lib/library/windowLogic.ts src/lib/library/windowLogic.test.ts
git commit -m "feat(library): pure window math + LRU for offset loading"
```

---

## Task 6: Frontend query/types/client for offset

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/library/types.ts`
- Modify: `cwcorella-git.github.io/src/lib/library/libraryLogic.ts`
- Modify: `cwcorella-git.github.io/src/lib/library/api.ts`
- Test: `cwcorella-git.github.io/src/lib/library/libraryLogic.test.ts`

**Interfaces:**
- Produces: `toQuery(c, offset, limit)` sets `query.offset`; `AnchorOffsetParams`/`AnchorOffsetResponse`; `client.getAnchorOffset(params)`.
- Removed: `canLoadMore`, `appendPage`, `isStaleCursor`, `LibraryState`, the `seek`/`cursor` params of `toQuery`.

- [ ] **Step 1: Update `types.ts`** — add `offset` to `LibraryQuery` and the anchor types:

```ts
export interface LibraryQuery {
	sort?: string;
	dir?: 'asc' | 'desc';
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string;
	visibility?: string;
	needs_formatting?: 0 | 1;
	offset?: number;
	limit?: number;
}

export interface AnchorOffsetParams {
	sort: string;
	dir: 'asc' | 'desc';
	value: string;
	q?: string;
	language?: string;
	source?: string;
	collection?: string;
	tag?: string;
	visibility?: string;
	needs_formatting?: 0 | 1;
}

export interface AnchorOffsetResponse {
	offset: number;
}
```

(Keep `ListResponse` as-is; `next_cursor` is ignored by the client now.)

- [ ] **Step 2: Rewrite the `libraryLogic.test.ts` toQuery block** — replace the cursor/seek tests with:

```ts
import { describe, it, expect } from 'vitest';
import { defaultControls, toQuery, computeQueryKey, controlsChanged } from './libraryLogic';

describe('toQuery', () => {
	it('sets sort/dir/limit/offset', () => {
		const q = toQuery(defaultControls(), 400, 200);
		expect(q).toMatchObject({ sort: 'title', dir: 'asc', limit: 200, offset: 400 });
	});
	it('offset 0 is included', () => {
		expect(toQuery(defaultControls(), 0, 200).offset).toBe(0);
	});
	it('carries q and applied filters, omits empty ones', () => {
		const c = { ...defaultControls(), q: 'bread', filters: { language: 'en', source: '' } };
		const q = toQuery(c, 0, 50);
		expect(q.q).toBe('bread');
		expect(q.language).toBe('en');
		expect('source' in q).toBe(false);
	});
});

describe('computeQueryKey / controlsChanged', () => {
	it('reflects sort + filters, ignores view', () => {
		const a = defaultControls();
		const b = { ...a, view: 'grid' as const };
		expect(controlsChanged(a, b)).toBe(false);
		const c = { ...a, sort: 'author' };
		expect(controlsChanged(a, c)).toBe(true);
	});
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm test -- src/lib/library/libraryLogic.test.ts`
Expected: FAIL (old `toQuery` signature / removed exports).

- [ ] **Step 4: Rewrite `libraryLogic.ts`** — replace `toQuery` and drop the keyset helpers. Keep `LibraryControls`, `defaultControls`, `isAppliedFilterValue`, `computeQueryKey`, `controlsChanged`. Delete `LibraryState`, `emptyState`, `canLoadMore`, `appendPage`, `isStaleCursor`. New `toQuery`:

```ts
export function toQuery(c: LibraryControls, offset: number, limit: number): LibraryQuery {
	const query: LibraryQuery = { sort: c.sort, dir: c.dir, limit, offset };

	if (c.q !== '') {
		query.q = c.q;
	}

	for (const [key, value] of Object.entries(c.filters)) {
		if (isAppliedFilterValue(value)) {
			(query as Record<string, unknown>)[key] = value;
		}
	}

	return query;
}
```

Update the `import type` line to drop `ListResponse`/`ApiError` if now unused (check — `ApiError`/`isStaleCursor` removal means the `import { ApiError }` at the top can go).

- [ ] **Step 5: Add `getAnchorOffset` to `api.ts`** — broaden `request`/`serializeQuery` to a generic record and add the method:

Change `serializeQuery` signature to `export function serializeQuery(q: Record<string, unknown>): string` (body unchanged). Change `request`'s option type to `{ query?: Record<string, unknown> }`. Import the anchor types and add to the returned client object:

```ts
		getAnchorOffset(params: AnchorOffsetParams): Promise<AnchorOffsetResponse> {
			return request<AnchorOffsetResponse>('/anchor-offset', { query: params });
		}
```

Update the top import: `import type { LibraryDoc, LibraryQuery, ListResponse, Facets, AnchorOffsetParams, AnchorOffsetResponse } from './types';`

- [ ] **Step 6: Run to verify it passes**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm test -- src/lib/library/libraryLogic.test.ts`
Expected: PASS. (Full `npm test` will still fail until Task 7 updates `libraryState`; that's expected — proceed.)

- [ ] **Step 7: Commit**

```bash
cd /home/user/Projects/cwcorella-git.github.io
git add src/lib/library/types.ts src/lib/library/libraryLogic.ts src/lib/library/libraryLogic.test.ts src/lib/library/api.ts
git commit -m "feat(library): offset toQuery + getAnchorOffset client, drop keyset helpers"
```

---

## Task 7: Frontend `libraryState` windowing rewrite

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/library/libraryState.svelte.ts`

**Interfaces:**
- Consumes: `windowLogic` (Task 5), `toQuery`/`computeQueryKey`/`controlsChanged`/`defaultControls` (Task 6), `client.getAnchorOffset`/`listDocuments`.
- Produces public surface: getters `controls`, `facets`, `status`, `errorDetail`, `total`, `queryKey`, `openDoc`, `openDocStatus`; methods `init()`, `loadFacets()`, `applyControls(patch)`, `ensureWindowsForRange(start, end)`, `jumpToAnchor(seek): Promise<number>`, `rowAt(index)`, `openDocById(id)`, `closeDoc()`.

- [ ] **Step 1: Rewrite the module** — replace the whole file:

```ts
import { env } from '$env/dynamic/public';
import { adminState } from '$lib/admin/state.svelte';
import { createLibraryClient, AuthError, OfflineError, ApiError } from './api';
import { defaultControls, toQuery, computeQueryKey, controlsChanged } from './libraryLogic';
import type { LibraryControls } from './libraryLogic';
import {
	LRU_CAP,
	LOOKAHEAD,
	windowBounds,
	windowsForRange,
	evictWindows,
	resolveAnchorIndex
} from './windowLogic';
import type { DocListItem, LibraryDoc, Facets, AnchorOffsetParams } from './types';

const baseUrl = env.PUBLIC_LIBRARY_API_URL || 'https://library-api.cwcorella.com';
const client = createLibraryClient({ baseUrl, getToken: () => adminState.libraryToken });

type Status = 'idle' | 'loading' | 'ready' | 'offline' | 'auth' | 'error';
type OpenDocStatus = 'idle' | 'loading' | 'error';

let _controls = $state<LibraryControls>(defaultControls());
let _facets = $state<Facets | null>(null);
let _status = $state<Status>('idle');
let _errorDetail = $state('');
let _openDoc = $state<LibraryDoc | null>(null);
let _openDocStatus = $state<OpenDocStatus>('idle');

let _total = $state<number | null>(null);
let _version = $state(0); // bumped whenever the row cache changes
let _queryKey = $state(computeQueryKey(defaultControls()));

// Non-reactive stores; reactivity is carried by _version + _total.
const _rowCache = new Map<number, DocListItem>();
const _loadedWindows = new Set<number>();
const _inflightWindows = new Set<number>();
let _activeWindows: number[] = [];

// Request-epoch guard: a window response from a superseded query is discarded,
// so two orderings never mix (the reliability contract).
let _queryEpoch = 0;
let _docEpoch = 0;

// Debounced range coalescing for scroll.
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingRange: { start: number; end: number } | null = null;

function _mapError(e: unknown) {
	if (e instanceof OfflineError) {
		_status = 'offline';
	} else if (e instanceof AuthError) {
		_status = 'auth';
	} else {
		_status = 'error';
		_errorDetail = e instanceof ApiError ? (e.detail ?? e.message) : String(e);
	}
}

function _resetData() {
	_rowCache.clear();
	_loadedWindows.clear();
	_inflightWindows.clear();
	_activeWindows = [];
	_total = null;
	_version++;
}

function _appliedFilters(): Partial<AnchorOffsetParams> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(_controls.filters)) {
		if (v !== undefined && v !== '') out[k] = v;
	}
	return out as Partial<AnchorOffsetParams>;
}

function _evict() {
	for (const k of evictWindows(_loadedWindows, _activeWindows, LRU_CAP)) {
		_loadedWindows.delete(k);
		const { offset, limit } = windowBounds(k);
		for (let i = 0; i < limit; i++) _rowCache.delete(offset + i);
	}
}

async function _fetchWindow(key: number, epoch: number) {
	if (_loadedWindows.has(key) || _inflightWindows.has(key)) return;
	_inflightWindows.add(key);
	const { offset, limit } = windowBounds(key);
	try {
		const resp = await client.listDocuments(toQuery(_controls, offset, limit));
		if (epoch !== _queryEpoch) return; // superseded — discard
		_total = resp.total;
		for (let i = 0; i < resp.items.length; i++) {
			_rowCache.set(offset + i, resp.items[i]);
		}
		_loadedWindows.add(key);
		_status = 'ready';
		_evict();
		_version++;
	} catch (e) {
		if (epoch !== _queryEpoch) return;
		_mapError(e);
	} finally {
		_inflightWindows.delete(key);
	}
}

function _runEnsure(start: number, end: number) {
	const keys = windowsForRange(start, end, LOOKAHEAD);
	_activeWindows = keys;
	const epoch = _queryEpoch;
	for (const k of keys) void _fetchWindow(k, epoch);
}

async function _newQuery() {
	_queryEpoch++;
	_resetData();
	_activeWindows = [0];
	await _fetchWindow(0, _queryEpoch);
}

export const libraryState = {
	get controls() { return _controls; },
	get facets() { return _facets; },
	get status() { return _status; },
	get errorDetail() { return _errorDetail; },
	get total() { return _total; },
	get queryKey() { return _queryKey; },
	get openDoc() { return _openDoc; },
	get openDocStatus() { return _openDocStatus; },

	rowAt(index: number): DocListItem | undefined {
		void _version; // subscribe: re-reads when the cache changes
		return _rowCache.get(index);
	},

	async init() {
		if (_status !== 'idle') return;
		_status = 'loading';
		await Promise.all([_newQuery(), this.loadFacets()]);
	},

	async loadFacets() {
		try {
			_facets = await client.getFacets();
		} catch (e) {
			_mapError(e);
		}
	},

	applyControls(patch: Partial<LibraryControls>) {
		const prev = _controls;
		const next = { ...prev, ...patch };
		_controls = next;
		if (controlsChanged(prev, next)) {
			_queryKey = computeQueryKey(next);
			void _newQuery();
		}
	},

	ensureWindowsForRange(start: number, end: number) {
		_pendingRange = { start, end };
		if (_debounceTimer) return;
		_debounceTimer = setTimeout(() => {
			_debounceTimer = null;
			const r = _pendingRange;
			_pendingRange = null;
			if (r) _runEnsure(r.start, r.end);
		}, 80);
	},

	async jumpToAnchor(seek: string | null): Promise<number> {
		const total = _total ?? 0;
		const shortcut = resolveAnchorIndex(seek, _controls.dir, total);
		if (shortcut !== null) return shortcut;
		try {
			const params: AnchorOffsetParams = {
				sort: _controls.sort,
				dir: _controls.dir,
				value: seek as string,
				..._appliedFilters()
			};
			if (_controls.q !== '') params.q = _controls.q;
			const { offset } = await client.getAnchorOffset(params);
			return Math.min(offset, Math.max(0, total - 1));
		} catch (e) {
			_mapError(e);
			return 0;
		}
	},

	async openDocById(id: number | string) {
		const epoch = ++_docEpoch;
		_openDocStatus = 'loading';
		try {
			const doc = await client.getDocument(id);
			if (epoch !== _docEpoch) return;
			_openDoc = doc;
			_openDocStatus = 'idle';
		} catch {
			if (epoch !== _docEpoch) return;
			_openDocStatus = 'error';
		}
	},

	closeDoc() {
		_docEpoch++;
		_openDoc = null;
		_openDocStatus = 'idle';
	}
};
```

- [ ] **Step 2: Type-check**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm run check`
Expected: errors only in `DocList.svelte` / `+page.svelte` (they still use the old props — fixed in Tasks 8–9). `libraryState.svelte.ts` itself clean.

- [ ] **Step 3: Commit**

```bash
cd /home/user/Projects/cwcorella-git.github.io
git add src/lib/library/libraryState.svelte.ts
git commit -m "feat(library): windowed row cache in libraryState (replaces keyset)"
```

---

## Task 8: Frontend `DocList` — total slots, skeletons, scroll → windows

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/components/library/DocList.svelte`

**Interfaces:**
- Consumes: `libraryState.rowAt` via the `rowAt` prop; `total`, `queryKey`, `anchors`, `view`, `onOpen`, `onVisibleRange`, `resolveJumpIndex`.
- Produces: renders a `total`-length `VList`; drives `onVisibleRange` on scroll; `scrollToIndex` on rail jumps.

- [ ] **Step 1: Rewrite the component**:

```svelte
<script lang="ts">
	import { VList, type VListHandle } from 'virtua/svelte';
	import DocRow from './DocRow.svelte';
	import DocCard from './DocCard.svelte';
	import JumpRail from './JumpRail.svelte';
	import type { DocListItem } from '$lib/library/types';
	import type { RailAnchor } from '$lib/library/railLogic';

	interface Props {
		total: number | null;
		rowAt: (index: number) => DocListItem | undefined;
		view: 'list' | 'grid';
		queryKey: string;
		onOpen: (id: number | string) => void;
		onVisibleRange: (start: number, end: number) => void;
		resolveJumpIndex: (seek: string | null) => Promise<number>;
		anchors: RailAnchor[];
	}

	const { total, rowAt, view, queryKey, onOpen, onVisibleRange, resolveJumpIndex, anchors }: Props =
		$props();

	let vlistRef: VListHandle | undefined = $state();

	// Index array of length `total`; VList renders only the visible slice.
	const slots = $derived(total ? Array.from({ length: total }, (_, i) => i) : []);

	function reportVisible(offset: number) {
		if (!vlistRef) return;
		const vp = vlistRef.getViewportSize();
		const start = vlistRef.findItemIndex(offset);
		const end = vlistRef.findItemIndex(offset + vp);
		onVisibleRange(start, end);
	}

	function handleScroll(offset: number) {
		reportVisible(offset);
	}

	async function handleJump(seek: string | null) {
		const index = await resolveJumpIndex(seek);
		vlistRef?.scrollToIndex(index);
	}

	// New query = fresh list: scroll to top. (libraryState already reset the cache.)
	let prevQueryKey: string | undefined;
	$effect(() => {
		const previous = prevQueryKey;
		prevQueryKey = queryKey;
		if (previous !== undefined && queryKey !== previous) {
			vlistRef?.scrollTo(0);
		}
	});

	// Once total is known (or grows into view), ensure the visible window loads —
	// also covers a viewport taller than the first fetched window.
	$effect(() => {
		void total;
		if (!vlistRef || !total) return;
		reportVisible(vlistRef.getScrollOffset());
	});
</script>

<div class="doc-list-wrap">
	{#if total !== null}
		<p class="count">{total} documents</p>
	{/if}
	<div class="list-and-rail">
		<VList
			data={slots}
			getKey={(i) => i}
			bind:this={vlistRef}
			onscroll={handleScroll}
			style="height: 70vh; flex: 1; min-width: 0;"
		>
			{#snippet children(index)}
				{@const row = rowAt(index)}
				{#if row}
					{#if view === 'grid'}
						<div class="grid-cell"><DocCard item={row} {onOpen} /></div>
					{:else}
						<DocRow item={row} {onOpen} />
					{/if}
				{:else}
					<div class="skeleton" aria-hidden="true"></div>
				{/if}
			{/snippet}
		</VList>
		<JumpRail {anchors} onSeek={handleJump} />
	</div>
</div>

<style>
	.doc-list-wrap {
		display: flex;
		flex-direction: column;
	}
	.list-and-rail {
		display: flex;
		align-items: flex-start;
		gap: 0.25rem;
	}
	@media (max-width: 480px) {
		.list-and-rail {
			flex-direction: column-reverse;
		}
	}
	.count {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		color: var(--clr-text);
		opacity: 0.7;
		margin: 0 0 1rem;
	}
	.grid-cell {
		padding: 0.3rem 0;
	}
	.skeleton {
		height: 2.4rem;
		margin: 0.15rem 0;
		border-radius: 3px;
		background: var(--clr-text);
		opacity: 0.06;
	}
</style>
```

Notes: `JumpRail`'s `onSeek` prop is typed `(seek: string | null) => void`; passing the async `handleJump` is fine (its promise is ignored). `rowAt(index)` reads `_version` internally, so the snippet re-renders when a window lands.

- [ ] **Step 2: Type-check**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm run check`
Expected: remaining errors only in `+page.svelte` (old `<DocList>` props) — fixed next.

- [ ] **Step 3: Commit**

```bash
cd /home/user/Projects/cwcorella-git.github.io
git add src/lib/components/library/DocList.svelte
git commit -m "feat(library): DocList renders total slots with on-demand windows"
```

---

## Task 9: Frontend `+page.svelte` wiring

**Files:**
- Modify: `cwcorella-git.github.io/src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: the new `libraryState` surface + `DocList` props.

- [ ] **Step 1: Update the `<DocList>` block and the empty-state check** — replace the `{:else if libraryState.status === 'ready'}` branch body:

```svelte
			{:else if libraryState.status === 'ready'}
				<LibraryControls
					controls={libraryState.controls}
					facets={libraryState.facets}
					onChange={(p) => libraryState.applyControls(p)}
				/>
				{#if libraryState.total === 0}
					<p class="status">no documents match.</p>
				{:else}
					<DocList
						total={libraryState.total}
						rowAt={(i) => libraryState.rowAt(i)}
						view={libraryState.controls.view}
						queryKey={libraryState.queryKey}
						onOpen={(id) => libraryState.openDocById(id)}
						onVisibleRange={(s, e) => libraryState.ensureWindowsForRange(s, e)}
						resolveJumpIndex={(seek) => libraryState.jumpToAnchor(seek)}
						{anchors}
					/>
				{/if}
			{/if}
```

The `anchors` `$derived(buildRail(...))` block and the two `$effect`s (admin redirect, `init()`) stay unchanged.

- [ ] **Step 2: Type-check**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm run check`
Expected: 0 errors.

- [ ] **Step 3: Full unit suite**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm test`
Expected: all pass (windowLogic + libraryLogic + railLogic + the rest).

- [ ] **Step 4: Commit**

```bash
cd /home/user/Projects/cwcorella-git.github.io
git add src/routes/library/+page.svelte
git commit -m "feat(library): wire offset windowing + rail scrollToIndex on /library"
```

---

## Task 10: Build, deploy, verify

**Files:** none.

- [ ] **Step 1: Production build**

Run: `cd /home/user/Projects/cwcorella-git.github.io && npm run build`
Expected: clean build → `/build`.

- [ ] **Step 2: Push (Cloudflare Pages auto-deploys)**

```bash
cd /home/user/Projects/cwcorella-git.github.io && git push origin main
```

- [ ] **Step 3: Confirm the deploy**

```bash
gh run list --repo cwcorella-git/cwcorella-git.github.io --limit 1
```
Expected: latest run completed/success (wait ~1–2 min).

- [ ] **Step 4: Hand off for admin-session verification** — the live path can't be exercised locally (production API CORS allows only `https://cwcorella.com`; admin gate needs the user's passphrase). Ask the user to confirm in their admin session:
  1. Title sort: the scrollbar thumb spans the whole corpus on first paint; drag it to the middle/bottom — rows fill in within a moment; no scroll-wait-scroll.
  2. Rail: click **M** → jumps to titles around M; click **#** → top; desc sort → thumb/rail still land correctly.
  3. Date sort: click a decade and **undated** → lands in the right region (undated at the very bottom in asc, top in desc).
  4. Change sort/filter mid-scroll → list resets to top, no mixed ordering.

---

## Self-review notes

- **Spec coverage:** offset param (T1), anchor count (T2), endpoint (T3), deploy+caveat check (T4), window logic (T5), query/types/client (T6), state (T7), DocList (T8), page (T9), ship (T10). All spec sections mapped.
- **Type consistency:** `toQuery(c, offset, limit)` used identically in `libraryState._fetchWindow`; `AnchorOffsetParams`/`AnchorOffsetResponse` defined in T6, consumed in T7 (`getAnchorOffset`); `rowAt`/`total`/`queryKey`/`onVisibleRange`/`resolveJumpIndex` names match across T7→T8→T9; `count_before` signature identical in T2 def and T3 call.
- **Reactivity:** `rowAt` reads `_version` so snippet re-renders on window load; `total` (a `$state`) drives `slots` rebuild; `queryKey` (a `$state`) drives scroll-to-top. No 100k-entry reactive proxy.
- **Removed-symbol sweep:** `canLoadMore`/`appendPage`/`isStaleCursor`/`emptyState`/`LibraryState`/`seekTo`/`composeQueryKey` are only referenced by `libraryState`/`DocList`/`+page`, all rewritten here. `railLogic`/`JumpRail` untouched.
```
