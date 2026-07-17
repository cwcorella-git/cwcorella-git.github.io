# Library card + sort gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four follow-ups to the merged two-zone toolbar: sort by word count (drop the "Updated" sort), move the decided-count below the list, put tags on cards, and mark public docs with a ◉ glyph — dropping the redundant `updated_at` from cards/rows.

**Architecture:** Two repos. **library-api** (backend): add `word_count` to the sort allow-list (+ index; it's `NOT NULL` so it rides the fast sort path) and surface each doc's `tags` in `/documents` list rows (endpoint-layer enrichment, exactly like SP2's `decision`). **cwcorella** (frontend): swap the sort options, relocate the progress line, and re-lay-out the card/row (tag chips, ◉ on public, no `updated_at`).

**Tech Stack:** library-api (FastAPI, stdlib sqlite3, pytest). cwcorella (SvelteKit 2, Svelte 5 runes, vitest, `npm run check`).

## Global Constraints

- **Do NOT change the pure `query.list_documents`/`get_document` SELECTs** — tags enrichment is endpoint-layer (the `/documents` handler already holds the `read_conn_cur` connection and enriches `decision` there). ~40 direct `read_conn` callers in `test_api_query.py` must stay green.
- **`word_count` is `NOT NULL DEFAULT 0`** → it belongs in `query._NOT_NULL_SORTS` (fast index path, no NULL-ordering term), and needs a covering `(word_count, id)` index.
- **`◉` marks `visibility === 'public'` only** (≈2,521 user docs); private cards carry no glyph.
- **Drop `updated_at`** from `DocCard`/`DocRow` display AND remove the `{value:'updated_at'}` sort option — but keep the `updated_at` field in the data/type (the reader/info panel still shows it).
- cwcorella test culture: node-vitest for pure logic; `.svelte` gated by `npm run check` + build. library-api: pytest with the existing fake pg / temp SQLite.

## Repos & branches

- **library-api** — branch `library-rows-wordcount` (Tasks B1, B2).
- **cwcorella** — branch `library-card-sort-gaps` (Tasks F1–F3).

---

## Task B1: Sort by word count (library-api)

**Repo:** `library-api`, branch `library-rows-wordcount` (from `main`). Runner: `python3 -m pytest`.

**Files:**
- Modify: `backend/api/cursor.py` (add `word_count` to `SORTS`)
- Modify: `backend/api/query.py` (add `word_count` to `_NOT_NULL_SORTS`)
- Modify: `backend/store.py` (add the covering index to the schema)
- Test: `tests/test_api_query.py` (add a word_count reach-every-row case)

**Interfaces:**
- Produces: `sort=word_count` accepted by `/documents` (and the keyset cursor), ordered by `(word_count, id)` via `idx_docs_wordcount`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_api_query.py`

```python
def test_word_count_sort_reaches_every_row(seeded_db):
    from backend.api.db import read_conn
    conn = read_conn(seeded_db.db_path)
    try:
        seen = []
        cursor = None
        while True:
            res = list_documents(conn, sort="word_count", dir="asc", cursor=cursor, limit=3)
            seen.extend(it["id"] for it in res["items"])
            cursor = res["next_cursor"]
            if cursor is None:
                break
        assert set(seen) == {r["id"] for r in seeded_db.records}
        assert len(seen) == len(set(seen))  # no dupes
    finally:
        conn.close()
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest tests/test_api_query.py::test_word_count_sort_reaches_every_row -v`
Expected: FAIL — `QueryError: invalid sort: 'word_count'` (not in `SORTS`).

- [ ] **Step 3: Add `word_count` to the allow-list + fast path + index**

`backend/api/cursor.py`:
```python
SORTS = ("title", "author", "publication_date", "updated_at", "word_count")
```

`backend/api/query.py` — add `word_count` to the NOT-NULL sort set:
```python
_NOT_NULL_SORTS = frozenset({"title", "updated_at", "word_count"})
```

`backend/store.py` — add to the `_SCHEMA` string, alongside the other `CREATE INDEX` lines:
```sql
CREATE INDEX IF NOT EXISTS idx_docs_wordcount ON documents(word_count, id);
```

- [ ] **Step 4: Run to verify pass**

Run: `python3 -m pytest tests/test_api_query.py::test_word_count_sort_reaches_every_row -v`
Expected: PASS.

- [ ] **Step 5: Full suite**

Run: `python3 -m pytest -q`
Expected: PASS (word_count is additive; existing sorts unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/api/cursor.py backend/api/query.py backend/store.py tests/test_api_query.py
git commit -m "feat(library): sort by word_count (indexed, NOT-NULL fast path)"
```

> **Deploy note (not a code step):** the live `/data/library-api/library.db` needs the new index created once — `sqlite3 /data/library-api/library.db "CREATE INDEX IF NOT EXISTS idx_docs_wordcount ON documents(word_count, id);"` on the workstation before the word_count sort is used at scale. Captured in the finish/deploy step, not here.

---

## Task B2: Tags in `/documents` list rows (library-api)

**Files:**
- Modify: `backend/api/query.py` (add `tags_for_ids`)
- Modify: `backend/api/app.py` (enrich `/documents` items with `tags`)
- Test: `tests/test_api_decision_field.py` (add a tags-in-rows case — same file that tests the decision enrichment)

**Interfaces:**
- Produces: `query.tags_for_ids(conn, ids) -> dict[int, list[str]]` (tags per doc via the junction, name-sorted, `{}` for empty ids); `/documents` rows gain `tags: list[str]`.

- [ ] **Step 1: Write the failing test** — append to `tests/test_api_decision_field.py`

```python
class TestTagsInList:
    def test_rows_carry_tags(self, client, auth, seeded_db):
        body = client.get("/documents", headers=auth, params={"limit": 200}).json()
        by_id = {it["id"]: it for it in body["items"]}
        # find a seeded doc known to have tags (Mutual Aid -> ["theory"])
        target = next(r for r in seeded_db.records if r["title"] == "Mutual Aid" and r["source"] == "user")
        assert "tags" in by_id[target["id"]]
        assert "theory" in by_id[target["id"]]["tags"]

    def test_untagged_row_has_empty_list(self, client, auth, seeded_db):
        body = client.get("/documents", headers=auth, params={"limit": 200}).json()
        # every row has a tags list (possibly empty), never missing
        assert all(isinstance(it.get("tags"), list) for it in body["items"])
```

- [ ] **Step 2: Run to verify failure**

Run: `python3 -m pytest tests/test_api_decision_field.py::TestTagsInList -v`
Expected: FAIL — rows have no `tags` key.

- [ ] **Step 3: Add `tags_for_ids` to `backend/api/query.py`**

Place it next to `decisions_for_ids`:

```python
def tags_for_ids(conn: sqlite3.Connection, ids: list[int]) -> dict[int, list[str]]:
    """Map doc_id -> [tag_name, ...] (name-sorted) for the given ids. Endpoint-
    layer enrichment for list rows; {} for empty ids. Mirrors decisions_for_ids
    so the pure list SELECT stays unchanged."""
    if not ids:
        return {}
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT dt.document_id AS doc_id, t.name AS name FROM document_tags dt "
        f"JOIN tags t ON t.id = dt.tag_id WHERE dt.document_id IN ({placeholders}) "
        f"ORDER BY t.name",
        ids,
    ).fetchall()
    out: dict[int, list[str]] = {}
    for row in rows:
        out.setdefault(row["doc_id"], []).append(row["name"])
    return out
```

- [ ] **Step 4: Enrich `/documents` rows in `backend/api/app.py`**

In the `/documents` handler, right after the existing decision enrichment loop (`for it in result["items"]: it["decision"] = decisions.get(it["id"])`):

```python
            tags = query.tags_for_ids(conn, ids)
            for it in result["items"]:
                it["tags"] = tags.get(it["id"], [])
```

- [ ] **Step 5: Run the new tests + full suite**

Run: `python3 -m pytest tests/test_api_decision_field.py -v && python3 -m pytest -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/api/query.py backend/api/app.py tests/test_api_decision_field.py
git commit -m "feat(library): surface tags in /documents list rows (endpoint-layer)"
```

---

## Task F1: Types + sort options (cwcorella)

**Repo:** `cwcorella-git.github.io`, branch `library-card-sort-gaps`. Runner: `npm test`, `npm run check`.

**Files:**
- Modify: `src/lib/library/types.ts` (`DocListItem.tags`)
- Modify: `src/lib/components/library/LibraryControls.svelte` (`SORT_OPTIONS`)

**Interfaces:**
- Produces: `DocListItem.tags: string[]`; the sort control offers "Word count" and no longer offers "Updated".

- [ ] **Step 1: Add `tags` to `DocListItem`** — `src/lib/library/types.ts`

```ts
	updated_at: string;
	decision: Decision | null; // null = undecided
	tags: string[];
}
```

- [ ] **Step 2: Swap the sort options** — `src/lib/components/library/LibraryControls.svelte`

Replace the `SORT_OPTIONS` array:
```ts
	const SORT_OPTIONS: { value: string; label: string }[] = [
		{ value: 'title', label: 'Title' },
		{ value: 'author', label: 'Author' },
		{ value: 'publication_date', label: 'Date published' },
		{ value: 'word_count', label: 'Word count' }
	];
```

- [ ] **Step 3: Guard the default sort** — if `defaultControls()` or any test pins `sort: 'updated_at'`, it still works (the backend keeps `updated_at` valid); we only removed it from the *dropdown*. No further change unless `npm run check`/tests flag a reference. Verify:

Run: `npm run check && npm test`
Expected: 0 check errors; existing tests green (the `tags` field is additive; no fixture constructs a `DocListItem` literal that check would now reject — if one does, add `tags: []`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/library/types.ts src/lib/components/library/LibraryControls.svelte
git commit -m "feat(library): word-count sort option, drop updated-at sort; DocListItem.tags"
```

---

## Task F2: Decided count below the list (cwcorella)

**Files:**
- Modify: `src/lib/components/library/DocList.svelte` (strip the `· decided` from the top count line)
- Modify: `src/routes/library/+page.svelte` (render the decided line below `<DocList>`)

**Interfaces:**
- Consumes: `libraryState.curationStats`, `progressText` (existing).

- [ ] **Step 1: Strip decided from DocList's count line** — `src/lib/components/library/DocList.svelte`

The count line currently reads `{total} documents{#if progressText(stats)}{' · '}{progressText(stats)}{/if}`. Change it to just:
```svelte
		{total} documents
```
Remove the now-unused `progressText` import and the `stats` prop **only if** nothing else in DocList uses them — check first; if `stats` is still passed but unused, drop it from `Props` and from the `+page.svelte` `<DocList … stats=…>` call. (If removing the prop cascades, it's fine — F2 owns both files.)

- [ ] **Step 2: Render the decided line below the list** — `src/routes/library/+page.svelte`

Import `progressText`, and after the `<DocList … />` block (still inside the `{:else}` where `total !== 0`), add:
```svelte
				{#if progressText(libraryState.curationStats)}
					<p class="decided" aria-live="polite">{progressText(libraryState.curationStats)}</p>
				{/if}
```
with:
```ts
	import { progressText } from '$lib/library/curationLogic';
```
and a style in `+page.svelte`:
```css
	.decided {
		font-family: var(--font-ui);
		font-size: 0.62rem; letter-spacing: 0.08em;
		color: var(--clr-text); opacity: 0.6;
		margin: 0.75rem 0 0;
	}
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors; vitest green; build clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/library/DocList.svelte src/routes/library/+page.svelte
git commit -m "feat(library): move decided-count below the document list"
```

---

## Task F3: Cards — tag chips, ◉ public glyph, drop updated_at (cwcorella)

**Files:**
- Modify: `src/lib/components/library/DocCard.svelte`
- Modify: `src/lib/components/library/DocRow.svelte`

**Interfaces:**
- Consumes: `DocListItem.tags` (F1), `item.visibility`.

- [ ] **Step 1: DocCard** — add the ◉ public glyph next to the title, tag chips, and remove the `updated` line.

Replace the title span and drop the `.updated` line:
```svelte
	<span class="title">
		{#if item.visibility === 'public'}<span class="mine" aria-label="mine (public)" title="public">◉</span>{/if}
		{item.title}
	</span>
```
Delete the entire `<span class="updated">updated {item.updated_at}</span>` line. Add a tag-chip row before the closing `</button>` (only when tags exist):
```svelte
	{#if item.tags.length > 0}
		<span class="chips">
			{#each item.tags.slice(0, 6) as tag (tag)}<span class="chip">{tag}</span>{/each}
			{#if item.tags.length > 6}<span class="chip-more">+{item.tags.length - 6}</span>{/if}
		</span>
	{/if}
```
Add styles:
```css
	.mine { color: var(--clr-text); opacity: 0.85; margin-right: 0.3rem; font-size: 0.7rem; }
	.chips { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.15rem; }
	.chip {
		font-size: 0.5rem; letter-spacing: 0.04em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.05rem 0.3rem; color: var(--clr-text); opacity: 0.7;
	}
	.chip-more { font-size: 0.5rem; opacity: 0.5; align-self: center; }
```

- [ ] **Step 2: DocRow** — same three changes in the row layout.

Add the glyph inside the title span:
```svelte
		<span class="title">
			{#if item.visibility === 'public'}<span class="mine" aria-label="mine (public)" title="public">◉</span>{/if}
			{item.title}
		</span>
```
Delete the `<span class="updated">{item.updated_at}</span>` line from `.meta`. Add a compact tag chip run into `.meta` (after `words`, before/after `needs_formatting`), capped shorter for the dense row:
```svelte
			{#if item.tags.length > 0}
				{#each item.tags.slice(0, 3) as tag (tag)}<span class="chip">{tag}</span>{/each}
				{#if item.tags.length > 3}<span class="chip-more">+{item.tags.length - 3}</span>{/if}
			{/if}
```
Add the `.mine`, `.chip`, `.chip-more` styles (same as DocCard, sized for the row).

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run build`
Expected: 0 check errors; vitest green; build clean. (`item.tags` is now on the type from F1; if the local dev API hasn't shipped B2 yet, `tags` is `undefined` at runtime — guard with `item.tags?.length` if `check` or a defensive pass warrants, but the type says non-optional, matching the deployed backend.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/library/DocCard.svelte src/lib/components/library/DocRow.svelte
git commit -m "feat(library): tag chips + ◉ public glyph on cards/rows; drop updated_at"
```

---

## Self-Review Notes

- **Spec coverage:** word_count sort + drop Updated (B1, F1); tags in rows + chips (B2, F3); decided below list (F2); ◉ public glyph + drop updated_at (F3). All four user asks map to tasks.
- **Endpoint-layer tags** keeps the pure query SELECTs (and their ~40 direct callers) untouched — same discipline as SP2's decision field.
- **Cross-repo runtime dependency:** F3's tag chips need B2's runtime `tags` field. B2 merges + deploys first (or with) F-side; until then `tags` is `[]`/undefined and the `{#if item.tags.length}` guard renders nothing.
- **Type consistency:** `DocListItem.tags: string[]` (F1) is consumed by F3; `tags_for_ids` signature matches its call site; `word_count` added to both `SORTS` (cursor) and `_NOT_NULL_SORTS` (query) so the ordering uses the index.
- **`updated_at` kept in data/type** — only removed from the two card displays and the sort dropdown; the reader/info panel still shows it.
