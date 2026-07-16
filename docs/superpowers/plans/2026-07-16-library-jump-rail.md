# Library Jump Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sort-aware "jump rail" beside `/library` so one click seeks the list near any point in the ordering (A–Z for text sorts, decade buckets + `undated` for date sort), replacing scroll-wait-scroll paging.

**Architecture:** A tiny `seek` param on the read API (`WHERE <sortcol> >=/<= ?`, or a null-block sentinel) lets the server mint a fresh page anchored anywhere. The existing keyset cursor still drives scroll-down *after* a jump. The frontend builds anchors from the active sort + a new `date_range` in `/facets`, and a `seekTo()` state action resets the list to the seeked page and scrolls to top via the existing queryKey mechanism.

**Tech Stack:** Backend — Python 3, FastAPI, SQLite (repo `library-api`, pytest). Frontend — SvelteKit 2 + Svelte 5 runes, TypeScript, Vitest, Playwright (repo `cwcorella-git.github.io`).

## Global Constraints

- Backend sort column is whitelisted against `cursor.SORTS = ("title","author","publication_date","updated_at")` before any SQL string interpolation; **all seek values stay `?`-parameterized**. Never interpolate a seek value.
- Undated sentinel value is exactly `"__undated__"`. Valid only for nullable sort columns (`author`, `publication_date`); on a NOT NULL sort (`title`, `updated_at`) it must raise `QueryError` → HTTP 400.
- `seek` applies **only when `cursor is None`**. If both are present, cursor wins (continuation pages ignore seek).
- Frontend must tolerate an old backend: an absent `seek` param is ignored server-side; an absent `facets.date_range` makes the date rail render nothing (never throw). **Deploy backend before frontend.**
- Rail sort mapping: `title`/`author` → alpha rail; `publication_date` → date rail; `updated_at` → **no rail** (all timestamps equal the migration date `2026-07-15`).
- Backend deploy path: `/data/library-api` on the workstation, pulled via `ssh -A ssh.veritablegames.com` (agent forwarding — the deploy key can't fetch), then `sudo systemctl restart library-api`. Frontend deploys by pushing `main` (Cloudflare Pages auto-build).
- Node 20 (`nvm use 20`) for the frontend repo.

---

## Task 1: Backend — `seek` param in the query builder

**Files:**
- Modify: `library-api/backend/api/query.py` (`list_documents`, ~lines 144–216)
- Test: `library-api/tests/test_api_query.py`

**Interfaces:**
- Consumes: existing `list_documents(conn, *, sort, dir, cursor, q, filters, limit)`, `QueryError`, `_where_sql`, `cursor_mod.SORTS`.
- Produces: `list_documents(..., seek: str | None = None)` — same return dict `{items, next_cursor, total}`. Semantics: when `cursor is None and seek is not None`, restrict the page start; `total` unchanged (counts the full filtered set).

- [ ] **Step 1: Write the failing tests**

Add to `library-api/tests/test_api_query.py`:

```python
UNDATED_SENTINEL = "__undated__"

def test_seek_asc_starts_at_value(conn):
    # ascending title seek: first item's title >= seek, none below it
    res = list_documents(conn, sort="title", dir="asc", seek="M", limit=50)
    assert res["items"], "expected some rows at/after 'M'"
    assert all(row["title"] >= "M" for row in res["items"])

def test_seek_desc_starts_at_value(conn):
    res = list_documents(conn, sort="title", dir="desc", seek="M", limit=50)
    assert res["items"]
    assert all(row["title"] <= "M" for row in res["items"])

def test_seek_ignored_when_cursor_present(conn):
    # a continuation page must ignore seek and follow the cursor instead
    first = list_documents(conn, sort="title", dir="asc", limit=3)
    assert first["next_cursor"]
    nxt = list_documents(conn, sort="title", dir="asc", cursor=first["next_cursor"],
                         seek="ZZZZ", limit=3)
    # seek would have jumped to the end; cursor wins, so we continue from page 1
    first_ids = {r["id"] for r in first["items"]}
    assert not (first_ids & {r["id"] for r in nxt["items"]})  # no overlap, normal paging

def test_seek_undated_returns_only_null_or_empty(conn):
    res = list_documents(conn, sort="publication_date", dir="asc",
                         seek=UNDATED_SENTINEL, limit=50)
    assert all((r["publication_date"] is None or r["publication_date"] == "")
               for r in res["items"])

def test_seek_undated_on_not_null_sort_raises(conn):
    with pytest.raises(QueryError):
        list_documents(conn, sort="title", dir="asc", seek=UNDATED_SENTINEL, limit=50)

def test_seek_total_is_unchanged_by_seek(conn):
    base = list_documents(conn, sort="title", dir="asc", limit=1)
    seeked = list_documents(conn, sort="title", dir="asc", seek="M", limit=1)
    assert seeked["total"] == base["total"]  # seek narrows the page, not the count
```

Note on the seeded test DB: if the fixture's `documents` have no null/empty `publication_date` rows, add at least one seeded row with `publication_date=None` in `tests/conftest.py`'s seed so `test_seek_undated_returns_only_null_or_empty` is meaningful. Check the fixture first; if it already seeds a null-date row, skip this.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_query.py -k seek -v`
Expected: FAIL — `list_documents() got an unexpected keyword argument 'seek'`.

- [ ] **Step 3: Implement the `seek` param**

In `library-api/backend/api/query.py`, add a module constant near `_NOT_NULL_SORTS`:

```python
_UNDATED_SENTINEL = "__undated__"
```

Change the `list_documents` signature to add `seek`:

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
) -> dict:
```

After the existing cursor block that appends the keyset clause (right after the
`if cur is not None:` block, before `where_sql = _where_sql(where_clauses)`), insert:

```python
    # A seek anchors a FRESH page (cursor is None). Continuation pages ignore it.
    if cur is None and seek is not None and seek != "":
        if seek == _UNDATED_SENTINEL:
            if sort in _NOT_NULL_SORTS:
                raise QueryError(f"seek=undated invalid for NOT NULL sort {sort!r}")
            where_clauses.append(f"( {sort} IS NULL OR {sort} = '' )")
        else:
            op = ">=" if dir == "asc" else "<="
            where_clauses.append(f"( {sort} {op} ? )")
            where_params.append(seek)
```

(`sort` is already validated against `cursor_mod.SORTS` at the top of the function, so interpolating it here is safe; the value is parameterized.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_query.py -v`
Expected: PASS — the new seek tests plus all existing reach-every-row property tests (seek must not disturb them; they never pass `seek`).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/library-api
git add backend/api/query.py tests/test_api_query.py tests/conftest.py
git commit -m "feat(query): add seek param for jump-rail page anchoring"
```

---

## Task 2: Backend — expose `seek` on the `/documents` route

**Files:**
- Modify: `library-api/backend/api/app.py` (`list_documents` route, ~lines 38–74)
- Test: `library-api/tests/test_api_smoke.py`

**Interfaces:**
- Consumes: `query.list_documents(..., seek=...)` from Task 1.
- Produces: `GET /documents?seek=<value>` forwards `seek` to the query builder; a bad seek (undated on NOT NULL sort) surfaces as HTTP 400.

- [ ] **Step 1: Write the failing test**

Add to `library-api/tests/test_api_smoke.py` (match the existing client/auth fixture pattern in that file — use the same `client` and auth header helpers already defined there):

```python
def test_documents_seek_param_forwarded(client, auth_headers):
    r = client.get("/documents?sort=title&dir=asc&seek=M&limit=20", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert all(item["title"] >= "M" for item in body["items"])

def test_documents_seek_undated_on_title_is_400(client, auth_headers):
    r = client.get("/documents?sort=title&seek=__undated__", headers=auth_headers)
    assert r.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_smoke.py -k seek -v`
Expected: FAIL — `seek` is not a recognized query param, so `title >= "M"` is not applied (first test fails on the assertion; the 400 test gets a 200).

- [ ] **Step 3: Add the `seek` query param to the route**

In `library-api/backend/api/app.py`, add `seek: str | None = None` to the
`list_documents` route signature (after `needs_formatting`, before `limit`):

```python
        needs_formatting: int | None = None,
        seek: str | None = None,
        limit: int = Query(50, ge=1),
```

And pass it through in the `query.list_documents(...)` call:

```python
                result = query.list_documents(
                    conn, sort=sort, dir=dir, cursor=cursor, q=q,
                    filters=filters, limit=limit, seek=seek,
                )
```

(The existing `except (query.QueryError, CursorError)` already maps `QueryError` to a 400, so the undated-on-NOT-NULL case is handled with no extra code.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_smoke.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/library-api
git add backend/api/app.py tests/test_api_smoke.py
git commit -m "feat(api): forward seek query param on /documents"
```

---

## Task 3: Backend — `date_range` in `/facets`

**Files:**
- Modify: `library-api/backend/api/query.py` (`get_facets`, ~lines 267–296)
- Test: `library-api/tests/test_api_query.py`

**Interfaces:**
- Produces: `get_facets(...)` return dict gains
  `"date_range": {"min_year": int|None, "max_year": int|None, "undated": int}`.
  `min_year`/`max_year` are `None` when no dated rows exist.

- [ ] **Step 1: Write the failing test**

Add to `library-api/tests/test_api_query.py`:

```python
def test_facets_include_date_range(conn):
    facets = query_mod.get_facets(conn)
    assert "date_range" in facets
    dr = facets["date_range"]
    assert set(dr) == {"min_year", "max_year", "undated"}
    assert isinstance(dr["undated"], int)
    if dr["min_year"] is not None:
        assert dr["min_year"] <= dr["max_year"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_query.py -k date_range -v`
Expected: FAIL — `KeyError: 'date_range'` / assertion on missing key.

- [ ] **Step 3: Implement `date_range` in `get_facets`**

In `library-api/backend/api/query.py`, inside `get_facets`, after the `tags`
query and before the `return`, add:

```python
    dr = conn.execute(
        "SELECT "
        "MIN(CAST(substr(publication_date,1,4) AS INTEGER)) AS min_year, "
        "MAX(CAST(substr(publication_date,1,4) AS INTEGER)) AS max_year "
        "FROM documents WHERE publication_date IS NOT NULL AND publication_date <> ''"
    ).fetchone()
    undated = conn.execute(
        "SELECT COUNT(*) AS c FROM documents "
        "WHERE publication_date IS NULL OR publication_date = ''"
    ).fetchone()["c"]
```

Then add to the returned dict:

```python
        "date_range": {
            "min_year": dr["min_year"],
            "max_year": dr["max_year"],
            "undated": undated,
        },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/library-api && python -m pytest tests/test_api_query.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/library-api
git add backend/api/query.py tests/test_api_query.py
git commit -m "feat(facets): expose publication_date range + undated count"
```

---

## Task 4: Deploy backend + live verification

**Files:** none (deploy only).

**Interfaces:** Produces a live API at `https://library-api.cwcorella.com` that
accepts `seek` and returns `facets.date_range`. Frontend Task 9 depends on this
being live.

- [ ] **Step 1: Push backend commits to GitHub**

```bash
cd ~/Projects/library-api && git push origin HEAD
```
Expected: push succeeds (laptop clone has push rights).

- [ ] **Step 2: Pull + restart on the workstation (agent-forwarded)**

```bash
ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull --ff-only && sudo systemctl restart library-api && sleep 2 && systemctl is-active library-api'
```
Expected: `Already up to date.` → `active`. If the pull reports the branch isn't
tracked, `git pull --ff-only origin main` (the workstation tree tracks `main`).

- [ ] **Step 3: Verify seek + date_range live**

Run (token from `/data/library-api/library-api.env`, or reuse the known token):

```bash
ssh -A ssh.veritablegames.com 'T=$(grep -oP "LIBRARY_API_TOKEN=\K.*" /data/library-api/library-api.env); curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/documents?sort=title&seek=M&limit=3" | head -c 300; echo; curl -s -H "Authorization: Bearer $T" "http://127.0.0.1:8087/facets" | python3 -c "import sys,json;print(json.load(sys.stdin)[\"date_range\"])"'
```
Expected: first items have titles ≥ "M"; date_range prints e.g.
`{'min_year': 720, 'max_year': 2025, 'undated': 65780}`.

- [ ] **Step 4: No commit** (deploy step). Note the verified `date_range` values in the task checkbox comment for reference.

---

## Task 5: Frontend — `railLogic.ts` pure module

**Files:**
- Create: `cwcorella-git.github.io/src/lib/library/railLogic.ts`
- Test: `cwcorella-git.github.io/src/lib/library/railLogic.test.ts`

**Interfaces:**
- Consumes: `Facets` type (extended in Task 6 with `date_range`, but define a
  local minimal shape here so this task is self-contained — see below).
- Produces:
  - `interface RailAnchor { label: string; seek: string | null }`
  - `type RailKind = 'alpha' | 'date' | 'none'`
  - `interface DateRange { min_year: number | null; max_year: number | null; undated: number }`
  - `railKind(sort: string): RailKind`
  - `alphaAnchors(dir: 'asc' | 'desc'): RailAnchor[]`
  - `dateAnchors(range: DateRange, dir: 'asc' | 'desc'): RailAnchor[]`
  - `buildRail(sort: string, dir: 'asc' | 'desc', range: DateRange | null): RailAnchor[]`
  - Exported constant `UNDATED_SEEK = '__undated__'`

- [ ] **Step 1: Write the failing tests**

Create `cwcorella-git.github.io/src/lib/library/railLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { railKind, alphaAnchors, dateAnchors, buildRail, UNDATED_SEEK } from './railLogic.js';

describe('railKind', () => {
	it('maps sorts to rail kinds', () => {
		expect(railKind('title')).toBe('alpha');
		expect(railKind('author')).toBe('alpha');
		expect(railKind('publication_date')).toBe('date');
		expect(railKind('updated_at')).toBe('none');
	});
});

describe('alphaAnchors', () => {
	it('asc: # then A..Z, # seeks to top (null)', () => {
		const a = alphaAnchors('asc');
		expect(a).toHaveLength(27);
		expect(a[0]).toEqual({ label: '#', seek: null });
		expect(a[1]).toEqual({ label: 'A', seek: 'A' });
		expect(a[26]).toEqual({ label: 'Z', seek: 'Z' });
	});
	it('desc: reversed, # still maps to the top of the ordering (null)', () => {
		const a = alphaAnchors('desc');
		expect(a[0]).toEqual({ label: 'Z', seek: 'Z' });
		expect(a[26]).toEqual({ label: '#', seek: null });
	});
});

describe('dateAnchors', () => {
	const range = { min_year: 1848, max_year: 2025, undated: 65780 };
	it('asc: ‹1800 (top), decades from 1800, then undated', () => {
		const a = dateAnchors(range, 'asc');
		expect(a[0]).toEqual({ label: '‹1800', seek: null });
		expect(a[1]).toEqual({ label: '1800s', seek: '1800' });
		expect(a.find((x) => x.label === '2020s')).toEqual({ label: '2020s', seek: '2020' });
		expect(a[a.length - 1]).toEqual({ label: 'undated', seek: UNDATED_SEEK });
	});
	it('collapses the sub-1800 tail into a single ‹1800 bucket', () => {
		const a = dateAnchors({ min_year: 720, max_year: 2025, undated: 0 }, 'asc');
		// no 700s/1300s/etc decade anchors — first decade anchor is 1800s
		const decades = a.filter((x) => x.label.endsWith('s') && x.label !== '‹1800');
		expect(decades[0].label).toBe('1800s');
	});
	it('omits undated anchor when undated count is 0', () => {
		const a = dateAnchors({ min_year: 1900, max_year: 2025, undated: 0 }, 'asc');
		expect(a.some((x) => x.seek === UNDATED_SEEK)).toBe(false);
	});
	it('desc: order reversed, decade seek is the top-of-decade boundary (<=)', () => {
		const a = dateAnchors(range, 'desc');
		// newest first: undated first, then 2020s ... 1800s, then ‹1800 last
		expect(a[0]).toEqual({ label: 'undated', seek: UNDATED_SEEK });
		const twenties = a.find((x) => x.label === '2020s');
		expect(twenties).toEqual({ label: '2020s', seek: '2029' }); // <= '2029' lands at newest 2020s
		expect(a[a.length - 1]).toEqual({ label: '‹1800', seek: '1799' }); // <= '1799'
	});
});

describe('buildRail', () => {
	it('returns [] for updated_at (no rail)', () => {
		expect(buildRail('updated_at', 'asc', { min_year: 1900, max_year: 2025, undated: 0 })).toEqual([]);
	});
	it('returns [] for date sort when range is null (old backend)', () => {
		expect(buildRail('publication_date', 'asc', null)).toEqual([]);
	});
	it('dispatches to alpha for text sorts', () => {
		expect(buildRail('title', 'asc', null)[0]).toEqual({ label: '#', seek: null });
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/railLogic.test.ts`
Expected: FAIL — cannot resolve `./railLogic.js`.

- [ ] **Step 3: Implement `railLogic.ts`**

Create `cwcorella-git.github.io/src/lib/library/railLogic.ts`:

```ts
export interface RailAnchor {
	label: string;
	seek: string | null; // null = jump to the top of the current ordering
}

export type RailKind = 'alpha' | 'date' | 'none';

export interface DateRange {
	min_year: number | null;
	max_year: number | null;
	undated: number;
}

export const UNDATED_SEEK = '__undated__';

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const OLD_TAIL_LABEL = '‹1800';
const DECADE_FLOOR = 1800;

export function railKind(sort: string): RailKind {
	if (sort === 'title' || sort === 'author') return 'alpha';
	if (sort === 'publication_date') return 'date';
	return 'none';
}

export function alphaAnchors(dir: 'asc' | 'desc'): RailAnchor[] {
	// '#' = non-alpha leading chars, which sort before 'A' → the top of an asc list.
	const anchors: RailAnchor[] = [
		{ label: '#', seek: null },
		...ALPHA.map((c) => ({ label: c, seek: c }))
	];
	return dir === 'asc' ? anchors : anchors.slice().reverse();
}

function floorDecade(year: number): number {
	return Math.floor(year / 10) * 10;
}

export function dateAnchors(range: DateRange, dir: 'asc' | 'desc'): RailAnchor[] {
	const anchors: RailAnchor[] = [];

	// ‹1800 collapses the sparse (and partly junk) pre-1800 tail.
	// asc: it's the top → seek null. desc: it's the bottom → seek <= '1799'.
	anchors.push({ label: OLD_TAIL_LABEL, seek: dir === 'asc' ? null : '1799' });

	if (range.max_year !== null) {
		const firstDecade = DECADE_FLOOR; // always start decade anchors at 1800
		const lastDecade = Math.max(firstDecade, floorDecade(range.max_year));
		for (let d = firstDecade; d <= lastDecade; d += 10) {
			// asc: seek the decade start (>= d). desc: seek the decade end (<= d+9).
			anchors.push({ label: `${d}s`, seek: dir === 'asc' ? String(d) : String(d + 9) });
		}
	}

	if (range.undated > 0) {
		anchors.push({ label: 'undated', seek: UNDATED_SEEK });
	}

	return dir === 'asc' ? anchors : anchors.slice().reverse();
}

export function buildRail(
	sort: string,
	dir: 'asc' | 'desc',
	range: DateRange | null
): RailAnchor[] {
	const kind = railKind(sort);
	if (kind === 'alpha') return alphaAnchors(dir);
	if (kind === 'date') return range ? dateAnchors(range, dir) : [];
	return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/railLogic.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/cwcorella-git.github.io
git add src/lib/library/railLogic.ts src/lib/library/railLogic.test.ts
git commit -m "feat(library): rail anchor logic (alpha + date buckets)"
```

---

## Task 6: Frontend — query + facets types plumbing

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/library/types.ts` (`Facets`, `LibraryQuery`)
- Modify: `cwcorella-git.github.io/src/lib/library/libraryLogic.ts` (`toQuery`)
- Test: `cwcorella-git.github.io/src/lib/library/libraryLogic.test.ts`

**Interfaces:**
- Consumes: `DateRange` shape from Task 5 (re-declared on `Facets`).
- Produces:
  - `Facets.date_range?: { min_year: number | null; max_year: number | null; undated: number }`
  - `LibraryQuery.seek?: string`
  - `toQuery(c, cursor, limit, seek?: string | null)` — adds `seek` **only when
    `cursor === null` and `seek` is a non-empty string**.

- [ ] **Step 1: Write the failing tests**

Add to `cwcorella-git.github.io/src/lib/library/libraryLogic.test.ts`:

```ts
import { toQuery, defaultControls } from './libraryLogic.js';

describe('toQuery seek', () => {
	it('adds seek on a first page (cursor null)', () => {
		const q = toQuery(defaultControls(), null, 50, 'M');
		expect(q.seek).toBe('M');
	});
	it('omits seek on a continuation page (cursor present)', () => {
		const q = toQuery(defaultControls(), 'somecursor', 50, 'M');
		expect(q.seek).toBeUndefined();
		expect(q.cursor).toBe('somecursor');
	});
	it('omits seek when null (top jump)', () => {
		const q = toQuery(defaultControls(), null, 50, null);
		expect(q.seek).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/libraryLogic.test.ts`
Expected: FAIL — `toQuery` takes 3 args; `q.seek` is undefined for the first case.

- [ ] **Step 3: Extend the types**

In `cwcorella-git.github.io/src/lib/library/types.ts`, add to `Facets`:

```ts
	tags: FacetBucket[];
	date_range?: {
		min_year: number | null;
		max_year: number | null;
		undated: number;
	};
```

and add to `LibraryQuery` (after `needs_formatting`):

```ts
	seek?: string;
```

- [ ] **Step 4: Extend `toQuery`**

In `cwcorella-git.github.io/src/lib/library/libraryLogic.ts`, change the signature
and add the seek branch:

```ts
export function toQuery(
	c: LibraryControls,
	cursor: string | null,
	limit: number,
	seek: string | null = null
): LibraryQuery {
```

and just before `return query;`:

```ts
	if (cursor !== null) {
		query.cursor = cursor;
	} else if (seek !== null && seek !== '') {
		query.seek = seek;
	}

	return query;
```

(Replace the existing `if (cursor !== null) { query.cursor = cursor; }` block with
the combined form above — seek only ever applies to a first page.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/libraryLogic.test.ts`
Expected: PASS (new seek tests + existing toQuery tests unchanged).

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/cwcorella-git.github.io
git add src/lib/library/types.ts src/lib/library/libraryLogic.ts src/lib/library/libraryLogic.test.ts
git commit -m "feat(library): seek in toQuery + date_range on Facets type"
```

---

## Task 7: Frontend — `seekTo` state action + scroll-reset key

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/library/libraryState.svelte.ts`
- Test: `cwcorella-git.github.io/src/lib/library/libraryState.test.ts` (create if absent)

**Interfaces:**
- Consumes: `toQuery(..., seek)` from Task 6; existing `_fetchFirstPage`, `_queryEpoch`,
  `computeQueryKey`, `client.listDocuments`.
- Produces:
  - `libraryState.seekTo(seek: string | null): void` — resets the list and fetches a
    first page anchored at `seek` (null = top).
  - `libraryState.queryKey` now includes a seek generation counter so a jump changes
    the key even when sort/filters are unchanged (drives `DocList`'s scroll-to-top).

- [ ] **Step 1: Write the failing test**

`libraryState.svelte.ts` is a runes module with a live `fetch`. Test the observable
contract with an injected client is not trivial here (the module constructs its own
client). Instead assert the two pure-ish guarantees via a thin seam: export a testable
helper for the queryKey composition. Add to `libraryState.svelte.ts` a pure export:

```ts
export function composeQueryKey(base: string, seekGen: number): string {
	return base + '|s' + seekGen;
}
```

Create `cwcorella-git.github.io/src/lib/library/libraryState.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { composeQueryKey } from './libraryState.svelte.js';

describe('composeQueryKey', () => {
	it('changes when the seek generation changes, even with the same base', () => {
		expect(composeQueryKey('base', 1)).not.toBe(composeQueryKey('base', 2));
	});
	it('is stable for the same base + generation', () => {
		expect(composeQueryKey('base', 3)).toBe(composeQueryKey('base', 3));
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/libraryState.test.ts`
Expected: FAIL — `composeQueryKey` is not exported.

- [ ] **Step 3: Implement `seekTo`, seek generation, and `composeQueryKey`**

In `cwcorella-git.github.io/src/lib/library/libraryState.svelte.ts`:

Add near the other `$state` declarations:

```ts
let _pendingSeek: string | null = null; // consumed by the next _fetchFirstPage
let _seekGen = $state(0); // bumped per jump so queryKey changes on a seek
```

Add the exported helper (module scope, after imports):

```ts
export function composeQueryKey(base: string, seekGen: number): string {
	return base + '|s' + seekGen;
}
```

Change `_fetchFirstPage` to consume `_pendingSeek`:

```ts
async function _fetchFirstPage() {
	const epoch = ++_queryEpoch;
	const seek = _pendingSeek;
	_pendingSeek = null;
	_state = { ...emptyState(), isFetching: true };
	try {
		const resp = await client.listDocuments(toQuery(_controls, null, LIMIT, seek));
		if (epoch !== _queryEpoch) return;
		_state = appendPage(emptyState(), resp);
		_status = 'ready';
	} catch (e) {
		if (epoch !== _queryEpoch) return;
		_state = { ..._state, isFetching: false };
		_mapError(e);
	}
}
```

Change the `queryKey` getter and add `seekTo` to the exported object:

```ts
	get queryKey() { return composeQueryKey(computeQueryKey(_controls), _seekGen); },

	seekTo(seek: string | null) {
		_pendingSeek = seek;
		_seekGen++;
		_state = emptyState();
		void _fetchFirstPage();
	},
```

(Leave `applyControls` as-is — a sort/filter change already changes the base
`computeQueryKey`, so it still resets scroll without touching `_seekGen`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd ~/Projects/cwcorella-git.github.io && npx vitest run src/lib/library/libraryState.test.ts && npm run check`
Expected: PASS + `svelte-check` clean (0 errors).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/cwcorella-git.github.io
git add src/lib/library/libraryState.svelte.ts src/lib/library/libraryState.test.ts
git commit -m "feat(library): seekTo action + seek-aware queryKey for scroll reset"
```

---

## Task 8: Frontend — `JumpRail.svelte` component

**Files:**
- Create: `cwcorella-git.github.io/src/lib/components/library/JumpRail.svelte`

**Interfaces:**
- Consumes: `RailAnchor` from Task 5.
- Produces: `<JumpRail anchors={RailAnchor[]} onSeek={(seek: string | null) => void} />`.
  Renders nothing when `anchors` is empty.

- [ ] **Step 1: Create the component**

Create `cwcorella-git.github.io/src/lib/components/library/JumpRail.svelte`:

```svelte
<script lang="ts">
	import type { RailAnchor } from '$lib/library/railLogic';

	interface Props {
		anchors: RailAnchor[];
		onSeek: (seek: string | null) => void;
	}

	const { anchors, onSeek }: Props = $props();
</script>

{#if anchors.length > 0}
	<nav class="rail" aria-label="jump to">
		{#each anchors as a (a.label)}
			<button class="rail-btn" onclick={() => onSeek(a.seek)} title={'jump to ' + a.label}>
				{a.label}
			</button>
		{/each}
	</nav>
{/if}

<style>
	.rail {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		flex-shrink: 0;
		max-height: 70vh;
		overflow-y: auto;
		padding-left: 0.4rem;
	}
	.rail-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		line-height: 1.35;
		padding: 0 0.25rem;
		cursor: pointer;
		opacity: 0.5;
		transition: opacity 0.1s;
		text-align: center;
	}
	.rail-btn:hover { opacity: 1; }

	/* Below the mobile breakpoint the rail becomes a horizontal scroll strip so it
	   never forces the page body to scroll sideways. */
	@media (max-width: 480px) {
		.rail {
			flex-direction: row;
			max-height: none;
			overflow-x: auto;
			overflow-y: hidden;
			padding-left: 0;
			margin-bottom: 0.5rem;
		}
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `cd ~/Projects/cwcorella-git.github.io && npm run check`
Expected: PASS (0 errors) — component compiles, props typed.

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/cwcorella-git.github.io
git add src/lib/components/library/JumpRail.svelte
git commit -m "feat(library): JumpRail component"
```

---

## Task 9: Frontend — wire the rail into the library page

**Files:**
- Modify: `cwcorella-git.github.io/src/lib/components/library/DocList.svelte`
- Modify: `cwcorella-git.github.io/src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: `buildRail` (Task 5), `libraryState.seekTo` (Task 7), `JumpRail` (Task 8),
  `libraryState.facets`, `libraryState.controls`.
- Produces: the rail rendered beside the list; clicking an anchor seeks + scrolls to top.

- [ ] **Step 1: Add rail props to `DocList` and render it beside the list**

In `cwcorella-git.github.io/src/lib/components/library/DocList.svelte`:

Add to the `Props` interface and destructuring:

```ts
		onOpen: (id: number | string) => void;
		anchors: import('$lib/library/railLogic').RailAnchor[];
		onSeek: (seek: string | null) => void;
	}

	const {
		items, view, total, canLoadMore, isFetching, onLoadMore, queryKey, onOpen, anchors, onSeek
	}: Props = $props();
```

Import the component at the top of the script:

```ts
	import JumpRail from './JumpRail.svelte';
```

Wrap the `VList` and the rail in a flex row. Replace the `<VList ...>...</VList>`
block's surrounding markup so the list and rail sit side by side:

```svelte
	<div class="list-and-rail">
		<VList
			data={items}
			getKey={(item) => item.id}
			bind:this={vlistRef}
			onscroll={handleScroll}
			style="height: 70vh; flex: 1; min-width: 0;"
		>
			{#snippet children(item)}
				{#if view === 'grid'}
					<div class="grid-cell"><DocCard {item} {onOpen} /></div>
				{:else}
					<DocRow {item} {onOpen} />
				{/if}
			{/snippet}
		</VList>
		<JumpRail {anchors} {onSeek} />
	</div>
```

Add to the `<style>` block:

```css
	.list-and-rail { display: flex; align-items: flex-start; gap: 0.25rem; }
	@media (max-width: 480px) { .list-and-rail { flex-direction: column-reverse; } }
```

- [ ] **Step 2: Pass rail data from the page**

In `cwcorella-git.github.io/src/routes/library/+page.svelte`, add to the `<script>`:

```ts
	import { buildRail } from '$lib/library/railLogic';
```

Add a derived rail (after the existing effects):

```ts
	const anchors = $derived(
		buildRail(
			libraryState.controls.sort,
			libraryState.controls.dir,
			libraryState.facets?.date_range ?? null
		)
	);
```

Pass the two new props into `<DocList ... />`:

```svelte
					onOpen={(id) => libraryState.openDocById(id)}
					{anchors}
					onSeek={(seek) => libraryState.seekTo(seek)}
```

- [ ] **Step 3: Type-check + full unit suite**

Run: `cd ~/Projects/cwcorella-git.github.io && npm run check && npx vitest run`
Expected: PASS — 0 svelte-check errors; all vitest tests green.

- [ ] **Step 4: Playwright visual verification (local preview)**

Build + preview, then drive it with the admin flow (triple-backtick activation +
passphrase in the REAL UI — do NOT inject fabricated admin creds):

```bash
cd ~/Projects/cwcorella-git.github.io && npm run build && npm run preview -- --port 4173 &
```
Using Playwright MCP: navigate to `http://localhost:4173/library`, activate admin
via the real passphrase, set the library token in ⊙ settings, confirm:
1. Title sort → A–Z rail visible; click "M" → list jumps to titles ≥ M, scrolled to top.
2. Switch sort to "Date published" → rail becomes `‹1800 … 2020s undated`; click a
   decade → list jumps there; click `undated` → list shows no-date docs.
3. Switch sort to "Updated" → no rail.
Take a screenshot of each. Stop the preview server when done (`pkill -f "vite preview"`).

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/cwcorella-git.github.io
git add src/lib/components/library/DocList.svelte src/routes/library/+page.svelte
git commit -m "feat(library): wire jump rail into DocList + library page"
```

---

## Task 10: Deploy frontend

**Files:** none (deploy only).

- [ ] **Step 1: Push to `main`**

```bash
cd ~/Projects/cwcorella-git.github.io && git push origin main
```
Expected: GitHub Actions builds + deploys to Cloudflare Pages (~1–2 min).

- [ ] **Step 2: Verify live**

Navigate to `https://cwcorella.com/library` (admin activated, token set) and repeat
the three rail checks from Task 9 Step 4 against production. Confirm the rail seeks
correctly and updated_at shows no rail.

- [ ] **Step 3: Update the change log**

Append to `cwcorella-git.github.io/docs/nav-config.md` change log is NOT needed
(that's the nav doc). Instead note completion in project memory
`project_library-migration-platform.md` (jump rail shipped, backend `seek` +
`/facets` date_range live).

---

## Self-Review Notes

- **Spec coverage:** seek param (T1/T2), date_range facet (T3), backend deploy (T4),
  railLogic alpha+date+none+direction (T5), query/type plumbing (T6), seekTo +
  scroll-reset key (T7), component (T8), wiring + responsive + Playwright (T9),
  frontend deploy (T10). Search-composes-with-seek is covered implicitly (seek is a
  plain extra WHERE added alongside the FTS filter — no special code, exercised by
  the live checks).
- **Deploy order:** backend (T4) before frontend (T10) per the Global Constraint;
  frontend tolerates an old backend (empty rail) so no hard coupling.
- **Undated sentinel** is the single string `__undated__` in both repos (backend
  `_UNDATED_SENTINEL`, frontend `UNDATED_SEEK`) — kept identical by the tests in
  T1 and T5.
