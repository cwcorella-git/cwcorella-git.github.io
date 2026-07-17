# SP2 — Triage UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn cwcorella's `/library` into a reader-first curation interface — assign keep/hide/delete per doc (writing SP1's `curation.db`), with list decision badges, a work-queue filter, and progress — while library-api surfaces each doc's decision in its read payloads.

**Architecture:** Two repos. **library-api** (backend): endpoint-layer enrichment — the `/documents` and `/documents/{id}` endpoints add a `decision` field by looking up `cur.curation`; `/anchor-offset` gains `decision` so the jump rail composes with the filter. The pure query layer (`query.list_documents`/`count_before`) is **untouched** (it only *filters* by decision, as SP1 built). **cwcorella** (frontend): `api.ts` gains write methods; `libraryState` gains index-aware open + prev/next + optimistic `setDecision` (no requery — preserves no-yank) + stats; the reader header gets decision controls + arrows; rows get badges; controls get a decision filter + progress.

**Tech Stack:** library-api (FastAPI, stdlib sqlite3, pytest). cwcorella (SvelteKit 2, Svelte 5 runes, vitest, `npm run check` = svelte-check + tsc).

## Global Constraints

- **SP2 writes ONLY cwcorella's own `curation.db` (via SP1's endpoints) and reads library-api. It never touches VG's Postgres.** Zero production risk.
- **`library.db` stays read-only** (`mode=ro` + `query_only=ON`). The backend changes are read-only additions.
- **Do NOT modify `query.list_documents`, `query.get_document`, or `query.count_before` SELECT bodies** — ~40 direct callers in `tests/test_api_query.py` use a plain `read_conn`. Decision enrichment happens at the endpoint layer, which holds a `cur`-attached connection.
- **Reader-first, stay-on-doc, no-yank:** assigning a decision updates the badge in place, does NOT auto-advance, and does NOT requery. The filtered set only re-evaluates on an explicit control change (the decision filter, sort, search, etc.).
- **Delete only marks** (reversible; SP3 purges). No in-reader confirmation dialog.
- **Undecided = no decision:** backend `decision` is `"keep" | "hide" | "delete" | null` (null = undecided). Clicking an already-active decision in the reader sends `undecided` (clears the row).
- **cwcorella test culture:** node-vitest only (no @testing-library). Pure logic is unit-tested; `.svelte` + the rune store are gated by `npm run check` (0 errors) + `npm run build` + existing vitest staying green.

## Repos & branches

- **library-api** — branch `sp2-decision-field` (Task B1 only).
- **cwcorella-git.github.io** — branch `sp2-triage-ui` (already created; Tasks F1–F6). The SP2 spec is committed here.

---

## File Structure

**library-api:**
- Modify: `backend/api/query.py` — add `decisions_for_ids(conn, ids)` (reads `cur.curation`; used only by cur-attached endpoints).
- Modify: `backend/api/app.py` — enrich `/documents` rows + `/documents/{id}`; switch `/documents/{id}` and `/anchor-offset` to `read_conn_cur`; add `decision` param to `/anchor-offset`.
- Test: `tests/test_api_decision_field.py` (new) + a `decisions_for_ids` unit case in `tests/test_query_decision.py`.

**cwcorella:**
- Modify: `src/lib/library/types.ts` — `Decision`, `DocListItem.decision`, `LibraryQuery.decision`, `CurationStats`.
- Modify: `src/lib/library/api.ts` — generalize `request`; add `setCuration`, `getCurationStats`.
- Modify: `src/lib/library/libraryLogic.ts` — add `decision` to `LibraryControls['filters']`.
- Create: `src/lib/library/curationLogic.ts` — pure helpers (`toggleDecision`, `badgeLabel`, `clampIndex`, `progressText`).
- Modify: `src/lib/library/libraryState.svelte.ts` — index-aware open, prev/next, `setDecision`, stats.
- Modify: `src/lib/components/library/{DocList,DocRow,DocCard}.svelte` + `src/routes/library/+page.svelte` — open-by-index + badges.
- Modify: `src/lib/components/library/LibraryControls.svelte` — decision filter + progress.
- Modify: `src/lib/components/library/DocReader.svelte` — header decision controls + prev/next.
- Test: `src/lib/library/api.test.ts`, `src/lib/library/curationLogic.test.ts` (new), `src/lib/library/libraryLogic.test.ts`.

---

## Task B1: Backend — surface `decision` in read payloads (library-api)

**Repo:** `library-api`, branch `sp2-decision-field` (create from `main`). Runner: `python3 -m pytest`.

**Files:**
- Modify: `backend/api/query.py` (add `decisions_for_ids`)
- Modify: `backend/api/app.py` (enrich `/documents`, `/documents/{id}`; switch `/documents/{id}` + `/anchor-offset` to `read_conn_cur`; add `decision` to `/anchor-offset`)
- Test: `tests/test_api_decision_field.py` (new), `tests/test_query_decision.py` (add unit case)

**Interfaces:**
- Produces: `query.decisions_for_ids(conn, ids: list[int]) -> dict[int, str]` — maps doc_id→decision for ids that have a curation row (requires `cur` attached; empty `ids` → `{}`). `/documents` items and `/documents/{id}` gain `decision: "keep"|"hide"|"delete"|null`. `/anchor-offset` accepts `decision`.

- [ ] **Step 1: Write the failing tests** — `tests/test_api_decision_field.py`

```python
"""SP2: /documents rows + /documents/{id} carry each doc's curation decision;
/anchor-offset composes with the decision filter. Endpoint-layer enrichment —
query.list_documents/get_document SELECTs are untouched."""
def _first_id(seeded_db):
    return seeded_db.records[0]["id"]


class TestDecisionInList:
    def test_rows_have_decision_null_by_default(self, client, auth):
        body = client.get("/documents", headers=auth, params={"limit": 5}).json()
        assert all("decision" in it and it["decision"] is None for it in body["items"])

    def test_row_reflects_assigned_decision(self, client, auth, seeded_db):
        doc_id = _first_id(seeded_db)
        client.put(f"/curation/{doc_id}", headers=auth, json={"decision": "keep"})
        body = client.get("/documents", headers=auth, params={"limit": 200}).json()
        got = {it["id"]: it["decision"] for it in body["items"]}
        assert got[doc_id] == "keep"


class TestDecisionInDetail:
    def test_detail_has_decision(self, client, auth, seeded_db):
        doc_id = _first_id(seeded_db)
        assert client.get(f"/documents/{doc_id}", headers=auth).json()["decision"] is None
        client.put(f"/curation/{doc_id}", headers=auth, json={"decision": "hide"})
        assert client.get(f"/documents/{doc_id}", headers=auth).json()["decision"] == "hide"


class TestAnchorOffsetComposesWithDecision:
    def test_anchor_offset_with_decision_filter_does_not_500(self, client, auth, seeded_db):
        # mark one doc keep, then ask for the anchor offset within the "keep" set
        client.put(f"/curation/{_first_id(seeded_db)}", headers=auth, json={"decision": "keep"})
        r = client.get("/anchor-offset", headers=auth,
                       params={"sort": "title", "dir": "asc", "value": "M", "decision": "keep"})
        assert r.status_code == 200, r.text
        assert isinstance(r.json()["offset"], int)
```

Add one unit case to `tests/test_query_decision.py`:

```python
def test_decisions_for_ids(seeded_db, cur_db):
    ids = [r["id"] for r in seeded_db.records]
    _seed_decisions(seeded_db, cur_db, {ids[0]: "keep", ids[2]: "delete"})
    conn = read_conn_cur(seeded_db.db_path, cur_db)
    try:
        m = query.decisions_for_ids(conn, [ids[0], ids[1], ids[2]])
    finally:
        conn.close()
    assert m == {ids[0]: "keep", ids[2]: "delete"}
    # empty ids -> {} (no SQL executed)
    conn2 = read_conn_cur(seeded_db.db_path, cur_db)
    try:
        assert query.decisions_for_ids(conn2, []) == {}
    finally:
        conn2.close()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest tests/test_api_decision_field.py tests/test_query_decision.py::test_decisions_for_ids -v`
Expected: FAIL — `/documents` items have no `decision` key; `decisions_for_ids` doesn't exist; `/anchor-offset` ignores `decision`.

- [ ] **Step 3: Add `decisions_for_ids` to `backend/api/query.py`**

Place it near the top-level functions (e.g. after `count_before`):

```python
def decisions_for_ids(conn: sqlite3.Connection, ids: list[int]) -> dict[int, str]:
    """Map doc_id -> decision for the given ids that have a curation row.

    Requires curation.db ATTACHed as `cur` (use db.read_conn_cur). Only cur-
    attached endpoints call this — the pure list/detail queries stay decision-
    free so their ~40 direct read_conn callers are unaffected.
    """
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT doc_id, decision FROM cur.curation WHERE doc_id IN ({placeholders})",
        ids,
    ).fetchall()
    return {row["doc_id"]: row["decision"] for row in rows}
```

- [ ] **Step 4: Enrich the endpoints in `backend/api/app.py`**

`/documents` — after `result = query.list_documents(...)` and before `return result` (the `conn` here is already `read_conn_cur`):

```python
            ids = [it["id"] for it in result["items"]]
            decisions = query.decisions_for_ids(conn, ids)
            for it in result["items"]:
                it["decision"] = decisions.get(it["id"])
```

`/documents/{id}` — change its connection from `read_conn(settings.db)` to `read_conn_cur(settings.db, settings.curation_db)`, and after the `if doc is None:` 404 guard, enrich:

```python
        doc["decision"] = query.decisions_for_ids(conn, [doc["id"]]).get(doc["id"])
        return doc
```

`/anchor-offset` — change its connection to `read_conn_cur(settings.db, settings.curation_db)`, add a `decision: str | None = None` parameter to the handler signature, and add it to the `filters` dict (mirroring `/documents`):

```python
        filters = {
            "language": language, "source": source, "collection": collection,
            "tag": tag, "visibility": visibility, "needs_formatting": needs_formatting,
            "decision": decision,
        }
        filters = {k: v for k, v in filters.items() if v is not None}
```

(`count_before` already routes filters through `_filter_sql`, which emits the `cur.curation` clause only when `decision` is present — now safe because the connection is `read_conn_cur`.)

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `python3 -m pytest tests/test_api_decision_field.py tests/test_query_decision.py -v`
Expected: PASS.

- [ ] **Step 6: Run the full suite (guard the untouched query layer)**

Run: `python3 -m pytest -q`
Expected: PASS — the ~40 `test_api_query.py` direct `list_documents`/`count_before` callers still pass (their SELECTs are unchanged; they never attach `cur` and never request `decision`). 230 + new.

- [ ] **Step 7: Commit**

```bash
git add backend/api/query.py backend/api/app.py tests/test_api_decision_field.py tests/test_query_decision.py
git commit -m "feat(sp2): surface decision in /documents + detail; anchor-offset composes with decision filter"
```

---

## Task F1: Types + API write client + decision filter type (cwcorella)

**Repo:** `cwcorella-git.github.io`, branch `sp2-triage-ui`. Runner: `npm test`, `npm run check`.

**Files:**
- Modify: `src/lib/library/types.ts`
- Modify: `src/lib/library/api.ts`
- Modify: `src/lib/library/libraryLogic.ts`
- Test: `src/lib/library/api.test.ts`, `src/lib/library/libraryLogic.test.ts`

**Interfaces:**
- Produces: `Decision`, `DecisionInput` types; `DocListItem.decision`; `LibraryQuery.decision`; `CurationStats`; `client.setCuration(id, decision)`, `client.getCurationStats()`; `LibraryControls['filters'].decision`.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/library/api.test.ts`

```ts
describe('curation writes', () => {
	it('setCuration PUTs /curation/{id} with a JSON body and bearer header', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { doc_id: 7, decision: 'keep' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		const res = await client.setCuration(7, 'keep');
		expect(res).toEqual({ doc_id: 7, decision: 'keep' });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/curation/7');
		expect(options.method).toBe('PUT');
		expect(options.headers['Content-Type']).toBe('application/json');
		expect(JSON.parse(options.body)).toEqual({ decision: 'keep' });
		expect(options.headers.Authorization).toBe('Bearer ' + TOKEN);
	});

	it('getCurationStats GETs /curation/stats', async () => {
		const stats = { keep: 1, hide: 0, delete: 0, decided: 1, total: 10, undecided: 9 };
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, stats));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.getCurationStats()).toEqual(stats);
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/curation/stats');
		expect(options.method ?? 'GET').toBe('GET');
		expect(options.body).toBeUndefined();
	});

	it('setCuration maps 404 to ApiError', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'document not found' }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await expect(client.setCuration(999, 'keep')).rejects.toBeInstanceOf(ApiError);
	});
});
```

Append to `src/lib/library/libraryLogic.test.ts` (verify the decision filter composes through the existing generic machinery):

```ts
import { toQuery, computeQueryKey, defaultControls } from './libraryLogic';

describe('decision filter composition', () => {
	it('toQuery passes an applied decision filter through', () => {
		const c = { ...defaultControls(), filters: { decision: 'undecided' as const } };
		expect(toQuery(c, 0, 50).decision).toBe('undecided');
	});
	it('an unset decision filter is omitted from the query', () => {
		expect(toQuery(defaultControls(), 0, 50).decision).toBeUndefined();
	});
	it('changing decision changes the query key', () => {
		const a = defaultControls();
		const b = { ...a, filters: { decision: 'keep' as const } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/library/api.test.ts src/lib/library/libraryLogic.test.ts`
Expected: FAIL — `setCuration`/`getCurationStats` undefined; `decision` not a valid filter key (tsc/type error in the logic test).

- [ ] **Step 3: Extend `src/lib/library/types.ts`**

```ts
export type Decision = 'keep' | 'hide' | 'delete';
export type DecisionInput = Decision | 'undecided';
```

Add `decision` to `DocListItem` (LibraryDoc inherits it):

```ts
	updated_at: string;
	decision: Decision | null; // null = undecided
}
```

Add to `LibraryQuery`:

```ts
	needs_formatting?: 0 | 1;
	decision?: DecisionInput; // 'undecided' | 'keep' | 'hide' | 'delete'
	offset?: number;
```

Add the stats interface:

```ts
export interface CurationStats {
	keep: number;
	hide: number;
	delete: number;
	decided: number;
	total: number;
	undecided: number;
}
```

- [ ] **Step 4: Generalize `request` + add methods in `src/lib/library/api.ts`**

Change the `request` options type and fetch init:

```ts
	async function request<T>(
		path: string,
		options: { query?: object; method?: string; body?: unknown } = {}
	): Promise<T> {
		const qs = options.query ? serializeQuery(options.query) : '';
		const url = baseUrl.replace(/\/$/, '') + path + (qs ? '?' + qs : '');

		const headers: Record<string, string> = { Authorization: 'Bearer ' + getToken() };
		const init: RequestInit = {
			method: options.method ?? 'GET',
			headers,
			credentials: 'omit'
		};
		if (options.body !== undefined) {
			headers['Content-Type'] = 'application/json';
			init.body = JSON.stringify(options.body);
		}

		let res: Response;
		try {
			res = await fetchImpl(url, init);
		} catch {
			throw new OfflineError();
		}
		// ...unchanged 401 / !ok / json handling...
```

Add to the returned client object (import `Decision`, `CurationStats` at top):

```ts
		setCuration(id: number | string, decision: DecisionInput): Promise<{ doc_id: number; decision: string }> {
			return request('/curation/' + id, { method: 'PUT', body: { decision } });
		},
		getCurationStats(): Promise<CurationStats> {
			return request<CurationStats>('/curation/stats');
		}
```

(Import update: `import type { ..., DecisionInput, CurationStats } from './types';`.)

- [ ] **Step 5: Add `decision` to the filters type in `src/lib/library/libraryLogic.ts`**

```ts
	filters: {
		// '' / undefined = not applied
		language?: string;
		source?: string;
		collection?: string;
		tag?: string;
		visibility?: string;
		needs_formatting?: 0 | 1;
		decision?: import('./types').DecisionInput;
	};
```

(No change to `toQuery`/`computeQueryKey`/`controlsChanged` — they already iterate `filters` generically.)

- [ ] **Step 6: Run tests + check**

Run: `npm test -- src/lib/library/api.test.ts src/lib/library/libraryLogic.test.ts && npm run check`
Expected: PASS, 0 check errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/library/types.ts src/lib/library/api.ts src/lib/library/libraryLogic.ts \
  src/lib/library/api.test.ts src/lib/library/libraryLogic.test.ts
git commit -m "feat(sp2): decision types, curation write client, decision filter type"
```

---

## Task F2: Pure curation logic helpers (cwcorella)

**Files:**
- Create: `src/lib/library/curationLogic.ts`
- Test: `src/lib/library/curationLogic.test.ts`

**Interfaces:**
- Produces:
  - `toggleDecision(current: Decision | null, clicked: Decision): DecisionInput` — `clicked === current ? 'undecided' : clicked`.
  - `badgeLabel(decision: Decision | null): string` — `'keep'|'hide'|'delete'` or `''` for null.
  - `clampIndex(index: number, total: number | null): number | null` — null if total null/≤0, else clamped to `[0, total-1]`.
  - `progressText(stats: CurationStats | null): string` — `''` if null, else `"<decided> / <total> decided"` (locale-formatted).

- [ ] **Step 1: Write the failing tests** — `src/lib/library/curationLogic.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { toggleDecision, badgeLabel, clampIndex, progressText } from './curationLogic';

describe('toggleDecision', () => {
	it('clicking a new decision selects it', () => {
		expect(toggleDecision(null, 'keep')).toBe('keep');
		expect(toggleDecision('hide', 'keep')).toBe('keep');
	});
	it('clicking the active decision clears to undecided', () => {
		expect(toggleDecision('keep', 'keep')).toBe('undecided');
	});
});

describe('badgeLabel', () => {
	it('maps decisions and null', () => {
		expect(badgeLabel('keep')).toBe('keep');
		expect(badgeLabel('delete')).toBe('delete');
		expect(badgeLabel(null)).toBe('');
	});
});

describe('clampIndex', () => {
	it('returns null when total is null or non-positive', () => {
		expect(clampIndex(3, null)).toBeNull();
		expect(clampIndex(3, 0)).toBeNull();
	});
	it('clamps into range', () => {
		expect(clampIndex(-1, 10)).toBe(0);
		expect(clampIndex(99, 10)).toBe(9);
		expect(clampIndex(4, 10)).toBe(4);
	});
});

describe('progressText', () => {
	it('empty when no stats', () => {
		expect(progressText(null)).toBe('');
	});
	it('formats decided / total', () => {
		expect(progressText({ keep: 2, hide: 1, delete: 0, decided: 3, total: 100417, undecided: 100414 }))
			.toBe('3 / 100,417 decided');
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- src/lib/library/curationLogic.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/library/curationLogic.ts`**

```ts
import type { Decision, DecisionInput, CurationStats } from './types';

/** Reader toggle: clicking the active decision clears it (undecided). */
export function toggleDecision(current: Decision | null, clicked: Decision): DecisionInput {
	return current === clicked ? 'undecided' : clicked;
}

/** Row badge text; '' when undecided (caller renders nothing). */
export function badgeLabel(decision: Decision | null): string {
	return decision ?? '';
}

/** Clamp an index into a known list; null when the list size is unknown/empty. */
export function clampIndex(index: number, total: number | null): number | null {
	if (total === null || total <= 0) return null;
	return Math.max(0, Math.min(index, total - 1));
}

/** Progress readout for the controls bar. */
export function progressText(stats: CurationStats | null): string {
	if (!stats) return '';
	return `${stats.decided.toLocaleString()} / ${stats.total.toLocaleString()} decided`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/library/curationLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/curationLogic.ts src/lib/library/curationLogic.test.ts
git commit -m "feat(sp2): pure curation logic (toggle, badge, clamp, progress)"
```

---

## Task F3: libraryState — index-aware open, prev/next, setDecision, stats (cwcorella)

**Files:**
- Modify: `src/lib/library/libraryState.svelte.ts`

**Interfaces:**
- Consumes: `client.setCuration`/`getCurationStats` (F1), `toggleDecision`/`clampIndex` (F2), `toQuery` (existing).
- Produces (on the exported `libraryState`): `openDocByIndex(index)`, `openPrevDoc()`, `openNextDoc()`, getters `hasPrev`/`hasNext`, `setDecision(clicked: Decision)`, `curationStats` getter, `loadCurationStats()`. `closeDoc()` resets the tracked index.

**Verification:** rune store — no vitest (matches existing untested `libraryState`). Verified by `npm run check` (0 errors) + `npm run build` + existing vitest green. The testable logic lives in F2.

- [ ] **Step 1: Add imports + state**

Add to the imports:

```ts
import { toggleDecision, clampIndex } from './curationLogic';
import type { DocListItem, LibraryDoc, Facets, AnchorOffsetParams, Decision, CurationStats } from './types';
```

Add state near the other `$state` declarations:

```ts
let _openIndex = $state<number | null>(null);
let _curationStats = $state<CurationStats | null>(null);
```

- [ ] **Step 2: Add index-aware open + prev/next (inside the `libraryState` object)**

```ts
	get hasPrev() { return _openIndex !== null && _openIndex > 0; },
	get hasNext() { return _openIndex !== null && _total !== null && _openIndex < _total - 1; },
	get curationStats() { return _curationStats; },

	async openDocByIndex(index: number) {
		const clamped = clampIndex(index, _total);
		if (clamped === null) return;
		_openIndex = clamped;
		let id = _rowCache.get(clamped)?.id;
		if (id === undefined) {
			// Row not cached (e.g. prev/next stepped past a window edge): fetch just
			// this row in the current order to learn its id.
			try {
				const resp = await client.listDocuments(toQuery(_controls, clamped, 1));
				id = resp.items[0]?.id;
			} catch (e) {
				_openDocStatus = 'error';
				_mapError(e);
				return;
			}
		}
		if (id === undefined) return;
		await this.openDocById(id);
	},

	openPrevDoc() {
		if (_openIndex !== null && _openIndex > 0) return this.openDocByIndex(_openIndex - 1);
	},
	openNextDoc() {
		if (_openIndex !== null && _total !== null && _openIndex < _total - 1) {
			return this.openDocByIndex(_openIndex + 1);
		}
	},

	async loadCurationStats() {
		try {
			_curationStats = await client.getCurationStats();
		} catch {
			/* stats are best-effort; a failure shouldn't break the reader */
		}
	},
```

- [ ] **Step 3: Add optimistic `setDecision` (no requery, id-guarded rollback)**

```ts
	async setDecision(clicked: Decision) {
		const doc = _openDoc;
		if (!doc) return;
		const target = toggleDecision(doc.decision, clicked); // keep|hide|delete|undecided
		const nextVal: Decision | null = target === 'undecided' ? null : target;
		const prevVal = doc.decision;
		const idx = _openIndex;

		// Optimistic: update the open doc + its cached row (no requery -> no yank).
		_openDoc = { ...doc, decision: nextVal };
		if (idx !== null) {
			const cached = _rowCache.get(idx);
			if (cached) _rowCache.set(idx, { ...cached, decision: nextVal });
			_version++;
		}

		try {
			await client.setCuration(doc.id, target);
			await this.loadCurationStats();
		} catch (e) {
			// Roll back only if the same doc is still open (user may have navigated).
			if (_openDoc && _openDoc.id === doc.id) _openDoc = { ..._openDoc, decision: prevVal };
			if (idx !== null) {
				const c2 = _rowCache.get(idx);
				if (c2 && c2.id === doc.id) _rowCache.set(idx, { ...c2, decision: prevVal });
				_version++;
			}
			_mapError(e);
		}
	},
```

- [ ] **Step 4: Wire stats into `init` and reset `_openIndex` on close**

In `init`, add stats to the parallel load:

```ts
		await Promise.all([_newQuery(), this.loadFacets(), this.loadCurationStats()]);
```

In `closeDoc`, reset the index:

```ts
	closeDoc() {
		_docEpoch++;
		_openDoc = null;
		_openDocStatus = 'idle';
		_openIndex = null;
	}
```

- [ ] **Step 5: Verify types + build + existing tests**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors; all existing vitest pass; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/library/libraryState.svelte.ts
git commit -m "feat(sp2): index-aware open + prev/next, optimistic setDecision, curation stats"
```

---

## Task F4: List open-by-index + decision badges (cwcorella)

**Files:**
- Modify: `src/lib/components/library/DocList.svelte` (onOpen becomes index-based)
- Modify: `src/lib/components/library/DocRow.svelte` (onOpen no-arg; add badge)
- Modify: `src/lib/components/library/DocCard.svelte` (onOpen no-arg; add badge)
- Modify: `src/routes/library/+page.svelte` (point onOpen at `openDocByIndex`)

**Interfaces:**
- Consumes: `libraryState.openDocByIndex` (F3), `DocListItem.decision` (F1), `badgeLabel` (F2).

- [ ] **Step 1: DocList — pass the index up**

Change the prop type and the two render sites:

```ts
		onOpen: (index: number) => void;
```

In the `children(index)` snippet:

```svelte
				{#if view === 'grid'}
					<div class="grid-cell"><DocCard item={row} onOpen={() => onOpen(index)} /></div>
				{:else}
					<DocRow item={row} onOpen={() => onOpen(index)} />
				{/if}
```

- [ ] **Step 2: DocRow — no-arg onOpen + decision badge**

Change the prop + click, and render a badge from `badgeLabel(item.decision)`:

```svelte
<script lang="ts">
	import type { DocListItem } from '$lib/library/types';
	import { badgeLabel } from '$lib/library/curationLogic';

	interface Props {
		item: DocListItem;
		onOpen: () => void;
	}
	const { item, onOpen }: Props = $props();
</script>

<button class="doc-row" data-doc-id={item.id} onclick={() => onOpen()}>
	<span class="title">{item.title}</span>
	<span class="meta">
		{#if item.decision}
			<span class="decision decision-{item.decision}">{badgeLabel(item.decision)}</span>
		{/if}
		<span class="author">{item.author ?? '—'}</span>
		<!-- ...unchanged source/date/words/needs-formatting/updated... -->
	</span>
</button>
```

Add badge styles alongside the existing `.badge`:

```css
	.decision {
		border: 1px solid transparent;
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-size: 0.5rem;
		letter-spacing: 0.06em;
	}
	.decision-keep { color: var(--clr-text); border-color: rgba(var(--ui-rgb), 0.5); opacity: 1; }
	.decision-hide { opacity: 0.5; border-color: rgba(var(--ui-rgb), 0.25); }
	.decision-delete { color: var(--clr-danger); border-color: var(--clr-danger); }
```

- [ ] **Step 3: DocCard — no-arg onOpen + decision badge**

Mirror Step 2 in `DocCard.svelte`: import `badgeLabel`, change `onOpen` to `() => void` and `onclick={() => onOpen()}`, render the same `{#if item.decision}` badge in the card, and add the same `.decision*` styles.

- [ ] **Step 4: +page.svelte — open by index**

```svelte
					onOpen={(index) => libraryState.openDocByIndex(index)}
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors (the `onOpen` signature change is consistent across DocList/DocRow/DocCard/page); vitest green; build clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/library/DocList.svelte src/lib/components/library/DocRow.svelte \
  src/lib/components/library/DocCard.svelte src/routes/library/+page.svelte
git commit -m "feat(sp2): open docs by list index; decision badges on rows and cards"
```

---

## Task F5: Decision filter + progress in LibraryControls (cwcorella)

**Files:**
- Modify: `src/lib/components/library/LibraryControls.svelte`
- Modify: `src/routes/library/+page.svelte` (pass `stats` prop)

**Interfaces:**
- Consumes: `libraryState.curationStats` (F3), `progressText` (F2), `setFilter` (existing — maps '' → undefined, which is "All").

- [ ] **Step 1: Add a `stats` prop + progress + decision filter to LibraryControls**

Add to the script:

```ts
	import type { CurationStats } from '$lib/library/types';
	import { progressText } from '$lib/library/curationLogic';
```

Extend `Props` with `stats: CurationStats | null;` and destructure it. Add the decision filter as another `<select>` in `.filters-row` (uses the existing `setFilter`, so All = `''` → undefined):

```svelte
		<select
			class="ctrl-select"
			value={controls.filters.decision ?? ''}
			onchange={(e) => setFilter('decision', (e.target as HTMLSelectElement).value)}
			aria-label="Filter by curation decision"
		>
			<option value="">All decisions</option>
			<option value="undecided">Undecided</option>
			<option value="keep">Keep</option>
			<option value="hide">Hide</option>
			<option value="delete">Delete</option>
		</select>
```

Add a progress readout at the end of `.controls-row` (display-only):

```svelte
		{#if progressText(stats)}
			<span class="progress" aria-live="polite">{progressText(stats)}</span>
		{/if}
```

with a style:

```css
	.progress {
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--clr-text);
		opacity: 0.6;
		white-space: nowrap;
	}
```

- [ ] **Step 2: Pass `stats` from +page.svelte**

```svelte
			<LibraryControls
				controls={libraryState.controls}
				facets={libraryState.facets}
				stats={libraryState.curationStats}
				onChange={(p) => libraryState.applyControls(p)}
			/>
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors (the `decision` filter key is valid per F1's type); vitest green; build clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/library/LibraryControls.svelte src/routes/library/+page.svelte
git commit -m "feat(sp2): work-queue decision filter + progress readout in controls"
```

---

## Task F6: Reader header — decision controls + prev/next (cwcorella)

**Files:**
- Modify: `src/lib/components/library/DocReader.svelte`

**Interfaces:**
- Consumes: `libraryState.setDecision`/`openPrevDoc`/`openNextDoc`/`hasPrev`/`hasNext` (F3), the open doc's `decision` (F1), `Decision` type.

- [ ] **Step 1: Add handlers to the DocReader script**

```ts
	import type { Decision } from '$lib/library/types';

	const DECISIONS: Decision[] = ['keep', 'hide', 'delete'];
	function decide(d: Decision) { libraryState.setDecision(d); }
```

- [ ] **Step 2: Restructure the `.overlay-header`**

Replace the header block with prev/next + title + decision controls + close:

```svelte
		<div class="overlay-header">
			<div class="nav-group">
				<button class="nav-btn" onclick={() => libraryState.openPrevDoc()} disabled={!libraryState.hasPrev} aria-label="Previous document">‹</button>
				<button class="nav-btn" onclick={() => libraryState.openNextDoc()} disabled={!libraryState.hasNext} aria-label="Next document">›</button>
			</div>
			<span class="doc-title">{libraryState.openDoc?.title ?? ''}</span>
			<div class="decide-group" role="group" aria-label="Curation decision">
				{#each DECISIONS as d (d)}
					<button
						class="decide-btn decide-{d}"
						class:active={libraryState.openDoc?.decision === d}
						aria-pressed={libraryState.openDoc?.decision === d}
						onclick={() => decide(d)}
					>{d}</button>
				{/each}
			</div>
			<button class="close-btn" onclick={close} aria-label="Close">×</button>
		</div>
```

- [ ] **Step 3: Add header control styles**

```css
	.nav-group, .decide-group { display: flex; gap: 0.3rem; }
	.nav-btn, .decide-btn {
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.2rem 0.5rem; cursor: pointer; transition: all 0.15s;
	}
	.nav-btn:disabled { opacity: 0.3; cursor: default; }
	.decide-btn:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.decide-btn.active { border-color: var(--clr-text); opacity: 1; }
	.decide-delete.active { color: var(--clr-danger); border-color: var(--clr-danger); }
```

(If `.overlay-header` is not already `display:flex` with the title flexing to fill, make the title `flex: 1; min-width: 0;` so the groups sit at the ends. Check the existing header CSS and adjust only what's needed.)

- [ ] **Step 4: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors; vitest green; build clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/library/DocReader.svelte
git commit -m "feat(sp2): reader-header keep/hide/delete controls + prev/next navigation"
```

---

## Self-Review Notes

- **Spec coverage:** backend decision field + anchor-offset composition (B1); write client + types + filter type (F1); pure helpers (F2); index-aware open/prev-next + optimistic no-requery setDecision + stats (F3); open-by-index + badges (F4); work-queue filter + progress (F5); reader controls + nav (F6). Every SP2 spec section maps to a task.
- **The 40-caller trap is avoided:** decision enrichment is endpoint-layer; `query.list_documents`/`get_document`/`count_before` SELECTs are untouched, so `test_api_query.py`'s direct `read_conn` callers are unaffected (verified in the pre-plan investigation).
- **No-yank is structural:** `setDecision` never calls `_newQuery`; only `applyControls` (the decision filter, sort, search) requeries.
- **Type consistency:** `openDocByIndex`/`setDecision`/`hasPrev`/`hasNext`/`curationStats` signatures match between F3's Produces block and their F4–F6 call sites; `Decision`/`DecisionInput`/`CurationStats` are defined once in F1 and consumed everywhere; `onOpen` is uniformly `(index:number)=>void` at DocList/page and `()=>void` at DocRow/DocCard after F4.
- **Cross-repo runtime dependency:** F4 badges and F6 active-state need B1's runtime `decision` field. B1 merges first; both branches merge before the feature is exercised end-to-end.
