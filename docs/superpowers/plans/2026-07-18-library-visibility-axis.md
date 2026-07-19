# Library Visibility Axis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `visibility` an editable axis independent of the curation decision, so a document can be kept without being published — and publish to VG only when a document is **both** `keep` and `public`.

**Architecture:** A new `edit_flags` table inside the existing `edits.db` overlay holds `visibility` and `needs_formatting` overrides, merged over `library.db` alongside the existing `edits` overlay. A new `PUT /documents/{id}/flags` endpoint writes it without cutting a version or touching FTS. The frontend gains reader-header toggles and `P`/`F` keys, and loses the `needs_formatting` checkbox from the editor. `publish.py` changes from `keep`→public to the conjunctive rule.

**Tech Stack:** Backend — Python, FastAPI, SQLite, pytest. Frontend — SvelteKit 2, Svelte 5 runes, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-library-visibility-axis-design.md` (read the "Amendment made during planning" note in *Where the edit lives* — the flags table is not a column on `edits`).

**Two repos.** Phase A is `~/Projects/library-api` (branch `visibility-axis`). Phase B is `~/Projects/cwcorella-git.github.io` (branch `visibility-axis-ui`). Phase B does not depend on Phase A being deployed — it must degrade gracefully against an un-upgraded API — but it does depend on Phase A's wire contract, which Task 2 fixes.

## Global Constraints

- **The publication rule is `is_public = (decision == 'keep') AND (visibility == 'public')`.** A document with no curation row is never published, whatever its visibility. This is a safety property: publishing uncurated material exposes private documents, while failing to publish a curated one is a missing click.
- `visibility` accepts exactly `"public"` or `"private"`. Anything else is a 422.
- **NULL means "no override"** in `edit_flags`, matching the convention `edits.needs_formatting` already uses.
- **`edit_flags` wins over `edits.needs_formatting`** where both are set.
- The flags endpoint must cut **no** version row and perform **no** `documents_fts` write. The single deliberate `library.db` write stays confined to body saves.
- A flags write must **not** mark a document `edited: true` — that flag means the text was edited.
- Frontend: Svelte 5 runes only. All user feedback via `toast` from `$lib/admin/toast.svelte`; no `window.alert`/`window.prompt`.
- Frontend failures on per-document writes **toast and roll back**; they must never call `_mapError`, which sets page-level `_status` and unmounts the controls (gated behind `status === 'ready'`).
- No UI hints, legends, or keyboard affordances anywhere in `/library` — there is one curator.
- The migration and the VG flip are **manual, user-run steps**. No task in this plan runs them.

## File Structure

### Phase A — `~/Projects/library-api`

| File | Status | Responsibility |
|---|---|---|
| `backend/api/edits.py` | Modify | `edit_flags` schema, `set_flags`, `get_flags`, `flags_for_ids`, merge precedence |
| `backend/api/app.py` | Modify | `PUT /documents/{id}/flags`; apply flags in detail + list merge |
| `backend/sources.py` | Modify | Stop fabricating `visibility` for 3 sources |
| `backend/vg_visibility.py` | Modify | Conjunctive publish rule |
| `scripts/migrate_visibility_private.py` | Create | One-shot: force all `library.db` docs private |
| `tests/test_edit_flags.py` | Create | Store + endpoint behavior |
| `tests/test_publish_conjunctive.py` | Create | The publication rule, incl. the safety case |

### Phase B — `~/Projects/cwcorella-git.github.io`

| File | Status | Responsibility |
|---|---|---|
| `src/lib/library/api.ts` | Modify | `setFlags` client method |
| `src/lib/library/libraryState.svelte.ts` | Modify | `setFlag` optimistic action |
| `src/lib/library/keyLogic.ts` | Modify | `P` / `F` → non-advancing flag actions |
| `src/lib/components/library/DocReader.svelte` | Modify | Header toggles + dispatch |
| `src/lib/components/library/DocEditor.svelte` | Modify | Remove the `needs_formatting` checkbox |
| `src/lib/library/editLogic.ts` | Modify | Drop `needs_formatting` from `EditDraft` |

---

# Phase A — library-api

Work in `~/Projects/library-api` on branch `visibility-axis`.

```bash
cd ~/Projects/library-api && git checkout -b visibility-axis
```

Run tests with `python -m pytest`. Read `backend/api/edits.py` before Task 1 — the existing overlay conventions are the pattern to follow.

---

### Task 1: `edit_flags` store

**Files:**
- Modify: `backend/api/edits.py` (schema block at `~16-45`, helpers near `get_overlay` at `~132`)
- Test: `tests/test_edit_flags.py` (create)

**Interfaces:**
- Consumes: `init_edits_db(path)`, `write_conn(path)`, `_doc_srcid(lib_conn, doc_id)`, `EditNotFound` — all existing in `edits.py`.
- Produces, for Task 2 and the merge paths:
  - `set_flags(edits_conn, lib_conn, doc_id: int, *, visibility: str | None, needs_formatting: int | None, now: str) -> None` — raises `EditNotFound` if `doc_id` has no `library.db` row. Only non-`None` arguments are written; a `None` argument leaves any existing override untouched.
  - `get_flags(conn, doc_id, *, table="edit_flags") -> dict | None`
  - `flags_for_ids(conn, ids) -> dict[int, dict]`
  - `apply_flag_fields(target: dict, fl: dict) -> None` — mutates `target` with flag overrides. Does **not** set `edited`.

**Why a separate table:** `edits.edits` declares `body TEXT NOT NULL`, so writing a flag through `save_edit` would force the document body into the overlay. Across the corpus that duplicates a large fraction of 2.7GB to store two booleans.

- [ ] **Step 1: Write the failing test**

Create `tests/test_edit_flags.py`.

**The shared fixtures in `tests/conftest.py` hand back PATHS, not connections** — `edits_db` and `curation_db` are `str` paths, and the library path is `seeded_db.db_path`. Tests open their own connections, as `tests/test_api_edits.py` does. So this file defines two local connection fixtures on top of the shared path fixtures:

```python
import pytest
from backend.api import edits
from backend.api.db import read_conn


@pytest.fixture
def edits_conn(edits_db):
    c = edits.write_conn(edits_db)
    yield c
    c.close()


@pytest.fixture
def lib_conn(seeded_db):
    c = read_conn(seeded_db.db_path)
    yield c
    c.close()


def test_set_flags_writes_visibility_only(edits_conn, lib_conn):
    edits.set_flags(edits_conn, lib_conn, 1, visibility="public",
                    needs_formatting=None, now="2026-07-18T00:00:00Z")
    fl = edits.get_flags(edits_conn, 1)
    assert fl["visibility"] == "public"
    assert fl["needs_formatting"] is None


def test_set_flags_writes_needs_formatting_only(edits_conn, lib_conn):
    edits.set_flags(edits_conn, lib_conn, 1, visibility=None,
                    needs_formatting=1, now="2026-07-18T00:00:00Z")
    fl = edits.get_flags(edits_conn, 1)
    assert fl["needs_formatting"] == 1
    assert fl["visibility"] is None


def test_set_flags_leaves_untouched_field_alone(edits_conn, lib_conn):
    edits.set_flags(edits_conn, lib_conn, 1, visibility="public",
                    needs_formatting=None, now="2026-07-18T00:00:00Z")
    edits.set_flags(edits_conn, lib_conn, 1, visibility=None,
                    needs_formatting=1, now="2026-07-18T00:00:01Z")
    fl = edits.get_flags(edits_conn, 1)
    assert fl["visibility"] == "public"   # survived the second write
    assert fl["needs_formatting"] == 1


def test_set_flags_unknown_doc_raises(edits_conn, lib_conn):
    with pytest.raises(edits.EditNotFound):
        edits.set_flags(edits_conn, lib_conn, 999999, visibility="public",
                        needs_formatting=None, now="2026-07-18T00:00:00Z")


def test_apply_flag_fields_overrides_and_does_not_mark_edited():
    target = {"visibility": "private", "needs_formatting": 0}
    edits.apply_flag_fields(target, {"visibility": "public", "needs_formatting": None})
    assert target["visibility"] == "public"
    assert target["needs_formatting"] == 0      # NULL = no override
    assert "edited" not in target                # flags are not a text edit


def test_flags_for_ids_returns_only_present(edits_conn, lib_conn):
    edits.set_flags(edits_conn, lib_conn, 1, visibility="public",
                    needs_formatting=None, now="2026-07-18T00:00:00Z")
    got = edits.flags_for_ids(edits_conn, [1, 2])
    assert set(got) == {1}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_edit_flags.py -v
```

Expected: FAIL — `AttributeError: module 'backend.api.edits' has no attribute 'set_flags'`.

- [ ] **Step 3: Add the schema**

In `backend/api/edits.py`, append to the `CREATE TABLE` block that already defines `edits`, `edit_tags`, and `edit_versions`:

```sql
CREATE TABLE IF NOT EXISTS edit_flags (
    doc_id           INTEGER PRIMARY KEY,
    visibility       TEXT,
    needs_formatting INTEGER,
    updated_at       TEXT NOT NULL
);
```

`init_edits_db` executes that block with `executescript`, so no other change is needed for existing databases — `IF NOT EXISTS` makes it additive.

- [ ] **Step 4: Add the helpers**

In `backend/api/edits.py`, beside `get_overlay`:

```python
def set_flags(edits_conn, lib_conn, doc_id: int, *, visibility, needs_formatting, now) -> None:
    """Upsert a flag override. A None argument means 'leave alone', NOT 'clear' —
    so a visibility-only write cannot silently drop a needs_formatting override.
    Writes no version row and touches no FTS: flags are not content."""
    _doc_srcid(lib_conn, doc_id)   # raises EditNotFound for an unknown doc
    edits_conn.execute(
        """INSERT INTO edit_flags (doc_id, visibility, needs_formatting, updated_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(doc_id) DO UPDATE SET
             visibility       = COALESCE(excluded.visibility, edit_flags.visibility),
             needs_formatting = COALESCE(excluded.needs_formatting, edit_flags.needs_formatting),
             updated_at       = excluded.updated_at""",
        (doc_id, visibility, needs_formatting, now))
    edits_conn.commit()


def get_flags(conn, doc_id, *, table="edit_flags"):
    row = conn.execute(f"SELECT * FROM {table} WHERE doc_id = ?", (doc_id,)).fetchone()
    return dict(row) if row else None


def flags_for_ids(conn, ids, *, table="edit_flags"):
    if not ids:
        return {}
    ph = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT * FROM {table} WHERE doc_id IN ({ph})", list(ids)).fetchall()
    return {r["doc_id"]: dict(r) for r in rows}


def apply_flag_fields(target: dict, fl: dict) -> None:
    """Mutate `target` with flag overrides. NULL means no override. Deliberately
    does NOT set `edited` — that flag means the text was edited, and a flag flip
    is not a text edit. Applied AFTER apply_overlay_fields so edit_flags wins."""
    if fl.get("visibility") is not None:
        target["visibility"] = fl["visibility"]
    if fl.get("needs_formatting") is not None:
        target["needs_formatting"] = fl["needs_formatting"]
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_edit_flags.py -v
```

Expected: PASS, all six tests.

- [ ] **Step 6: Run the full suite**

```bash
cd ~/Projects/library-api && python -m pytest
```

Expected: all previously-passing tests still pass (304 before this branch).

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/library-api
git add backend/api/edits.py tests/test_edit_flags.py
git commit -m "feat(edits): edit_flags overlay table for visibility + needs_formatting"
```

---

### Task 2: `PUT /documents/{id}/flags` and the merge paths

**Files:**
- Modify: `backend/api/app.py` (model block near `~29`, routes near `~269`, detail merge `~248-258`, list merge `~118-125`)
- Test: `tests/test_edit_flags.py` (extend)

**Interfaces:**
- Consumes: `edits.set_flags`, `edits.get_flags`, `edits.flags_for_ids`, `edits.apply_flag_fields` from Task 1; existing `require_token`, `_merged_doc`, `read_conn`, `edits.write_conn`, `settings.edits_db`.
- Produces, for Phase B's wire contract:
  - `PUT /documents/{id}/flags`, body `{"visibility"?: "public"|"private", "needs_formatting"?: 0|1}`
  - Returns the merged document, same shape as `PUT /documents/{id}/body`.
  - 404 when the document does not exist; 422 on an invalid `visibility` or an empty body.

**Two merge sites, not one.** The detail path (`_merged_doc` → `edits.apply_overlay`) and the list path (`app.py:118-125`) are separate. The list loop currently applies overlay fields **only when an `edits` row exists** — a document with flags but no text edit would be missed. Both sites must apply flags independently of the `edits` overlay.

- [ ] **Step 1: Write the failing test**

Append to `tests/test_edit_flags.py`. Use the same FastAPI `TestClient` fixture and auth header that `tests/test_api_edits.py` uses — read it first.

```python
def test_put_flags_sets_visibility(client, auth):
    r = client.put("/documents/1/flags", json={"visibility": "public"}, headers=auth)
    assert r.status_code == 200
    assert r.json()["visibility"] == "public"


def test_put_flags_rejects_bad_visibility(client, auth):
    r = client.put("/documents/1/flags", json={"visibility": "sort-of"}, headers=auth)
    assert r.status_code == 422


def test_put_flags_rejects_empty_body(client, auth):
    r = client.put("/documents/1/flags", json={}, headers=auth)
    assert r.status_code == 422


def test_put_flags_unknown_doc_404s(client, auth):
    r = client.put("/documents/999999/flags", json={"visibility": "public"}, headers=auth)
    assert r.status_code == 404


def test_put_flags_cuts_no_version(client, auth, edits_conn):
    before = len(edits.list_versions(edits_conn, 1))
    client.put("/documents/1/flags", json={"needs_formatting": 1}, headers=auth)
    assert len(edits.list_versions(edits_conn, 1)) == before


def test_put_flags_does_not_mark_edited(client, auth):
    r = client.put("/documents/1/flags", json={"visibility": "public"}, headers=auth)
    assert r.json()["edited"] is False


def test_flags_show_in_list_without_an_edits_row(client, auth):
    client.put("/documents/1/flags", json={"visibility": "public"}, headers=auth)
    items = client.get("/documents?limit=200", headers=auth).json()["items"]
    row = next(i for i in items if i["id"] == 1)
    assert row["visibility"] == "public"


def test_edit_flags_wins_over_edits_needs_formatting(client, auth):
    client.put("/documents/1/body",
               json={"body": "text", "needs_formatting": 1, "tags": []}, headers=auth)
    client.put("/documents/1/flags", json={"needs_formatting": 0}, headers=auth)
    assert client.get("/documents/1", headers=auth).json()["needs_formatting"] == 0
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_edit_flags.py -v
```

Expected: FAIL — the new endpoint returns 405 (route does not exist).

- [ ] **Step 3: Add the request model**

In `backend/api/app.py`, beside `class EditBody`:

```python
class FlagsBody(BaseModel):
    visibility: Literal["public", "private"] | None = None
    needs_formatting: Literal[0, 1] | None = None

    @model_validator(mode="after")
    def _at_least_one(self):
        if self.visibility is None and self.needs_formatting is None:
            raise ValueError("at least one of visibility, needs_formatting is required")
        return self
```

Add `Literal` to the `typing` import and `model_validator` to the `pydantic` import at the top of the file.

- [ ] **Step 4: Add the route**

In `backend/api/app.py`, immediately after the `put_body` route:

```python
    @app.put("/documents/{id}/flags", dependencies=[Depends(require_token)])
    def put_flags(id: int, payload: FlagsBody):
        lib = read_conn(settings.db)
        try:
            ed = edits.write_conn(settings.edits_db)
            try:
                edits.set_flags(ed, lib, id,
                                visibility=payload.visibility,
                                needs_formatting=payload.needs_formatting,
                                now=_now())
            except edits.EditNotFound:
                raise HTTPException(status_code=404, detail="document not found")
            finally:
                ed.close()
        finally:
            lib.close()
        # Deliberately no _reindex(id): flags are not content, so no documents_fts
        # write and no version row. The one library.db write stays on body saves.
        return _merged_doc(id)
```

- [ ] **Step 5: Apply flags in the detail merge**

In `backend/api/edits.py`, `apply_overlay` currently returns early when there is no `edits` row. A document can have flags without ever being edited, so restructure it to apply flags either way:

```python
def apply_overlay(conn, doc: dict) -> None:
    """Mutate a detail doc dict in place with `ed`-attached overlay values."""
    ov = get_overlay(conn, doc["id"], table="ed.edits")
    if ov is None:
        doc["edited"] = False
    else:
        doc["body"] = ov["body"]
        apply_overlay_fields(doc, ov, overlay_tags(conn, doc["id"], table="ed.edit_tags"))
    # Flags apply whether or not the text was edited, and win over edits.needs_formatting.
    fl = get_flags(conn, doc["id"], table="ed.edit_flags")
    if fl is not None:
        apply_flag_fields(doc, fl)
```

- [ ] **Step 6: Apply flags in the list merge**

In `backend/api/app.py`, replace the list-merge loop at `~118-125`:

```python
            overlays = edits.overlays_for_ids(conn, ids)
            otags = edits.overlay_tags_for_ids(conn, ids)
            flags = edits.flags_for_ids(conn, ids, table="ed.edit_flags")
            for it in result["items"]:
                ov = overlays.get(it["id"])
                if ov:
                    edits.apply_overlay_fields(it, ov, otags.get(it["id"], []))
                else:
                    it["edited"] = False
                fl = flags.get(it["id"])
                if fl:
                    edits.apply_flag_fields(it, fl)
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_edit_flags.py -v
```

Expected: PASS, all fourteen tests.

- [ ] **Step 8: Run the full suite**

```bash
cd ~/Projects/library-api && python -m pytest
```

Expected: all green.

- [ ] **Step 9: Commit**

```bash
cd ~/Projects/library-api
git add backend/api/app.py backend/api/edits.py tests/test_edit_flags.py
git commit -m "feat(api): PUT /documents/{id}/flags, merged in detail and list paths"
```

---

### Task 3: Stop fabricating `visibility` at ingest

**Files:**
- Modify: `backend/sources.py:34`, `:45`, `:55`
- Test: `tests/test_sources_visibility.py` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing later tasks depend on.

**Context:** `sources.py:23` derives `visibility` from the real `is_public` for the `user` source, but lines 34, 45, and 55 hard-code `visibility="private"` for anarchist, marxist, and youtube regardless of their actual VG state. The column therefore lies for 97% of the corpus. This does not change today's values — those rows are `is_public=false` in VG anyway — but it stops the lie on the next ingest.

- [ ] **Step 1: Write the failing test**

Create `tests/test_sources_visibility.py`. The shaping functions are pure: each takes a row dict and returns `{"source_id", "meta", "raw_body"}`, with `visibility` inside `meta`. Note `shape_anarchist_row` takes two extra arguments (`volume_root`, `read_file`) — `read_file` is injected precisely so it is testable.

```python
from backend import sources

BASE = {"id": 1, "slug": "s", "title": "T", "category": None}


def test_marxist_row_honours_is_public():
    rec = sources.shape_marxist_row({**BASE, "content": "x", "is_public": True})
    assert rec["meta"]["visibility"] == "public"


def test_marxist_row_defaults_private_without_the_flag():
    rec = sources.shape_marxist_row({**BASE, "content": "x"})
    assert rec["meta"]["visibility"] == "private"


def test_youtube_row_honours_is_public():
    rec = sources.shape_youtube_row(
        {**BASE, "content": "x", "channel_name": "c", "upload_date": None, "is_public": True})
    assert rec["meta"]["visibility"] == "public"


def test_youtube_row_defaults_private_without_the_flag():
    rec = sources.shape_youtube_row(
        {**BASE, "content": "x", "channel_name": "c", "upload_date": None})
    assert rec["meta"]["visibility"] == "private"


def test_anarchist_row_honours_is_public():
    rec = sources.shape_anarchist_row(
        {**BASE, "file_path": "f.txt", "is_public": True}, "/root", lambda p: b"x")
    assert rec["meta"]["visibility"] == "public"


def test_anarchist_row_defaults_private_without_the_flag():
    rec = sources.shape_anarchist_row(
        {**BASE, "file_path": "f.txt"}, "/root", lambda p: b"x")
    assert rec["meta"]["visibility"] == "private"
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_sources_visibility.py -v
```

Expected: FAIL — `assert 'private' == 'public'`.

- [ ] **Step 3: Replace the three hard-coded values**

In `backend/sources.py`, inside `shape_anarchist_row`, `shape_marxist_row`, and `shape_youtube_row`, replace the literal `visibility="private"` with the same expression `shape_user_row` already uses:

```python
visibility=("public" if row.get("is_public") else "private"),
```

`row.get` (not `row[...]`) keeps the default at `private` when the column is absent, which is what the two "without the flag" tests pin.

**Then add `is_public` to the three `_QUERIES` SELECT lists.** Only the `user` query currently selects it — without this the shaping change is inert against the live source, because `row.get("is_public")` would always be `None`. `vg_targets.py` confirms all four target tables carry `is_public`; it is the column bootstrap/publish flip. The three queries to amend are keyed `"anarchist"`, `"marxist"`, and `"youtube"` in `_QUERIES`.

If running the suite shows a source whose table genuinely lacks the column, leave that one hard-coded and comment the absence as the reason. Do not invent a column.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_sources_visibility.py -v
```

Expected: PASS.

- [ ] **Step 5: Run the full suite**

```bash
cd ~/Projects/library-api && python -m pytest
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/library-api
git add backend/sources.py tests/test_sources_visibility.py
git commit -m "fix(sources): derive visibility from is_public for all four sources"
```

---

### Task 4: The conjunctive publish rule

**Files:**
- Modify: `backend/vg_visibility.py` (`publish_decisions`, `~44-51`)
- Test: `tests/test_publish_conjunctive.py` (create)

**Interfaces:**
- Consumes: `edits.get_flags` / `edits.flags_for_ids` from Task 1; existing `curation_join.grouped_source_ids`, `set_is_public`, `vg_targets`.
- Produces: nothing later tasks depend on.

**This is the safety-critical task.** `publish_decisions` currently sets `keep`→public and `hide`→private, ignoring visibility. It must become:

```
is_public = (decision == 'keep') AND (effective visibility == 'public')
```

Effective visibility means overlay-merged — `edit_flags.visibility` if set, else `library.db.documents.visibility`. Reading `library.db` directly would ignore every mark the user has made.

The property that must hold: **a document with no curation row is never published.** Publishing uncurated material exposes private documents; the reverse is a missing click.

- [ ] **Step 1: Write the failing test**

Create `tests/test_publish_conjunctive.py`.

`FakePg` from `tests/_fakepg_sp3.py` is the established injection point — it **records writes, it does not model state**, so assert on `pg.writes` rather than querying it. Each write is `(sql, params)` with `params["v"]` the boolean and `params["ids"]` the int list.

Copy the seeded library to `tmp_path` before writing to it: `seeded_db` is **session-scoped**, and mutating it leaks into every other test.

```python
import shutil
import pytest
from backend import store, vg_visibility
from backend.api import edits, curation
from tests._fakepg_sp3 import FakePg


@pytest.fixture
def lib_conn(seeded_db, tmp_path):
    path = str(tmp_path / "library.db")
    shutil.copy(seeded_db.db_path, path)      # session-scoped fixture: never mutate in place
    c = store.connect(path)
    yield c
    c.close()


@pytest.fixture
def cur_conn(curation_db):
    c = curation.write_conn(curation_db)
    yield c
    c.close()


@pytest.fixture
def edits_conn(edits_db):
    c = edits.write_conn(edits_db)
    yield c
    c.close()


def set_decision(cur_conn, doc_id, decision):
    cur_conn.execute(
        "INSERT OR REPLACE INTO curation (doc_id, decision, updated_at) "
        "VALUES (?, ?, '2026-07-18T00:00:00Z')", (doc_id, decision))
    cur_conn.commit()


def set_visibility(edits_conn, doc_id, visibility):
    edits_conn.execute(
        "INSERT OR REPLACE INTO edit_flags (doc_id, visibility, needs_formatting, updated_at) "
        "VALUES (?, ?, NULL, '2026-07-18T00:00:00Z')", (doc_id, visibility))
    edits_conn.commit()


def set_library_visibility(lib_conn, doc_id, visibility):
    lib_conn.execute("UPDATE documents SET visibility = ? WHERE id = ?", (visibility, doc_id))
    lib_conn.commit()


def published_ids(pg):
    """ids the run set is_public=true on."""
    out = set()
    for _sql, params in pg.writes:
        if params.get("v") is True:
            out.update(params["ids"])
    return out


def hidden_ids(pg):
    out = set()
    for _sql, params in pg.writes:
        if params.get("v") is False:
            out.update(params["ids"])
    return out


def test_keep_and_public_publishes(cur_conn, lib_conn, edits_conn):
    pg = FakePg()
    set_decision(cur_conn, 1, "keep")
    set_visibility(edits_conn, 1, "public")
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 in published_ids(pg)


def test_keep_and_private_stays_hidden(cur_conn, lib_conn, edits_conn):
    pg = FakePg()
    set_decision(cur_conn, 1, "keep")
    set_visibility(edits_conn, 1, "private")
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 not in published_ids(pg)
    assert 1 in hidden_ids(pg)


def test_undecided_and_public_is_NOT_published(cur_conn, lib_conn, edits_conn):
    """The safety case. Weakening the rule to visibility alone exposes
    uncurated documents; this test is what stops that."""
    pg = FakePg()
    set_visibility(edits_conn, 1, "public")       # no curation row at all
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 not in published_ids(pg)


def test_hide_and_public_is_not_published(cur_conn, lib_conn, edits_conn):
    pg = FakePg()
    set_decision(cur_conn, 1, "hide")
    set_visibility(edits_conn, 1, "public")
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 not in published_ids(pg)


def test_visibility_override_beats_library_db(cur_conn, lib_conn, edits_conn):
    """library.db says private; the user marked it public. The mark wins."""
    pg = FakePg()
    set_decision(cur_conn, 1, "keep")
    set_library_visibility(lib_conn, 1, "private")
    set_visibility(edits_conn, 1, "public")
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 in published_ids(pg)


def test_library_db_visibility_used_when_no_override(cur_conn, lib_conn, edits_conn):
    pg = FakePg()
    set_decision(cur_conn, 1, "keep")
    set_library_visibility(lib_conn, 1, "public")   # no edit_flags row at all
    vg_visibility.publish_decisions(pg, cur_conn, lib_conn, edits_conn)
    assert 1 in published_ids(pg)
```

Verified against the tree: `curation.write_conn(path)` (`backend/api/curation.py:38`), `edits.write_conn(path)`, `store.connect(path)`, and `db.read_conn(path)` all exist with these signatures.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_publish_conjunctive.py -v
```

Expected: FAIL — `publish_decisions()` takes 3 positional arguments but 4 were given, and the undecided+public case publishes.

- [ ] **Step 3: Rewrite `publish_decisions`**

In `backend/vg_visibility.py`:

```python
def publish_decisions(pg, cur_conn, lib_conn, edits_conn) -> dict:
    """is_public = (decision == 'keep') AND (effective visibility == 'public').

    Both conditions are required. A doc with no curation row is NEVER published,
    whatever its visibility — publishing uncurated material exposes private
    documents, while failing to publish a curated one is a missing click.

    Effective visibility is overlay-merged: edit_flags.visibility wins over
    library.db. Reading library.db alone would ignore every mark the user made.
    """
    from backend.api import edits

    published, hidden = {}, {}
    for source, ids in curation_join.grouped_source_ids(cur_conn, lib_conn, "keep").items():
        ids = list(ids)
        flags = edits.flags_for_ids(edits_conn, ids)
        pub, priv = [], []
        for doc_id in ids:
            ov = (flags.get(doc_id) or {}).get("visibility")
            base = lib_conn.execute(
                "SELECT visibility FROM documents WHERE id = ?", (doc_id,)).fetchone()
            effective = ov or (base["visibility"] if base else "private")
            (pub if effective == "public" else priv).append(doc_id)
        published[source] = set_is_public(pg, source, pub, True)
        hidden[source] = set_is_public(pg, source, priv, False)
    return {"published": published, "hidden": hidden}
```

Note this no longer touches `hide` separately: a `hide` document is simply not in the `keep` group, so it is never published. `bootstrap_hide` is what puts everything at `is_public=false` first, and it is unchanged.

- [ ] **Step 4: Update the CLI caller**

`scripts/publish.py` calls `publish_decisions(pg, cur_conn, lib_conn)`. Add the edits connection — open it the same way the other CLIs open their SQLite connections, and close it in the same `finally` block. Read `scripts/publish.py` and follow its existing connection handling exactly; do not introduce a new pattern.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_publish_conjunctive.py -v
```

Expected: PASS, all five tests.

- [ ] **Step 6: Run the full suite**

```bash
cd ~/Projects/library-api && python -m pytest
```

Expected: all green. Pre-existing publish tests that assert the old `keep`→public rule will fail — those assertions are now wrong and must be updated to the conjunctive rule, not deleted.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/library-api
git add backend/vg_visibility.py scripts/publish.py tests/
git commit -m "feat(publish): is_public requires keep AND public, overlay-merged"
```

---

### Task 5: The migration script

**Files:**
- Create: `scripts/migrate_visibility_private.py`
- Test: `tests/test_migrate_visibility.py` (create)

**Interfaces:**
- Consumes: `backend.store.connect`.
- Produces: nothing later tasks depend on.

**What it does:** forces every `library.db` document to `visibility='private'` and clears any `edit_flags.visibility` override, so the corpus starts from a known state. Only the 2,521 `user` docs actually change — the other three sources are already `private`.

**Dry-run by default**, matching the three existing CLIs in `scripts/`. It must print what it would change and require `--confirm` to write. Read `scripts/bootstrap.py` and follow its argument and confirmation conventions exactly.

- [ ] **Step 1: Write the failing test**

Create `tests/test_migrate_visibility.py`.

Two things to get right, both of which have bitten this suite before:

- The shared fixtures give **paths**, so open connections here — and `lib_conn` uses `store.connect` (writable), not `read_conn`, because the migration writes.
- **`seeded_db` is session-scoped.** This migration rewrites every row's visibility, so it MUST run against a copy in `tmp_path`. Mutating the shared corpus in place would corrupt every test that runs after it.

`seeded_db` seeds every row with `visibility="public"`, so the copied corpus already exercises the interesting case without extra setup.

```python
import shutil
import pytest
from backend import store
from backend.api import edits
from scripts import migrate_visibility_private as mig


@pytest.fixture
def lib_conn(seeded_db, tmp_path):
    path = str(tmp_path / "library.db")
    shutil.copy(seeded_db.db_path, path)      # session-scoped fixture: never mutate in place
    c = store.connect(path)
    yield c
    c.close()


@pytest.fixture
def edits_conn(edits_db):
    c = edits.write_conn(edits_db)
    yield c
    c.close()


def test_dry_run_changes_nothing(lib_conn, edits_conn):
    lib_conn.execute("UPDATE documents SET visibility='public' WHERE id=1")
    lib_conn.commit()
    mig.run(lib_conn, edits_conn, confirm=False)
    row = lib_conn.execute("SELECT visibility FROM documents WHERE id=1").fetchone()
    assert row["visibility"] == "public"


def test_confirm_forces_private(lib_conn, edits_conn):
    lib_conn.execute("UPDATE documents SET visibility='public' WHERE id=1")
    lib_conn.commit()
    mig.run(lib_conn, edits_conn, confirm=True)
    row = lib_conn.execute("SELECT visibility FROM documents WHERE id=1").fetchone()
    assert row["visibility"] == "private"


def test_confirm_clears_visibility_overrides(lib_conn, edits_conn):
    edits_conn.execute(
        "INSERT INTO edit_flags (doc_id, visibility, needs_formatting, updated_at) "
        "VALUES (1, 'public', NULL, '2026-07-18T00:00:00Z')")
    edits_conn.commit()
    mig.run(lib_conn, edits_conn, confirm=True)
    row = edits_conn.execute(
        "SELECT visibility FROM edit_flags WHERE doc_id=1").fetchone()
    assert row["visibility"] is None


def test_confirm_preserves_needs_formatting_overrides(lib_conn, edits_conn):
    """The migration is about visibility only. A needs_formatting mark is
    unrelated curation work and must survive."""
    edits_conn.execute(
        "INSERT INTO edit_flags (doc_id, visibility, needs_formatting, updated_at) "
        "VALUES (1, 'public', 1, '2026-07-18T00:00:00Z')")
    edits_conn.commit()
    mig.run(lib_conn, edits_conn, confirm=True)
    row = edits_conn.execute(
        "SELECT needs_formatting FROM edit_flags WHERE doc_id=1").fetchone()
    assert row["needs_formatting"] == 1
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_migrate_visibility.py -v
```

Expected: FAIL — `ModuleNotFoundError: No module named 'scripts.migrate_visibility_private'`.

- [ ] **Step 3: Write the script**

Create `scripts/migrate_visibility_private.py`:

```python
"""One-shot: force every library.db document to visibility='private' and clear
any edit_flags visibility override, so the corpus starts from a known state.

Dry-run by default, like bootstrap/publish/purge. Only the `user` docs actually
change — the other three sources are already private.

This does NOT touch VG. bootstrap.py does that, and it is a separate manual step.
"""
import argparse

from backend import store


def run(lib_conn, edits_conn, *, confirm: bool) -> dict:
    n_docs = lib_conn.execute(
        "SELECT COUNT(*) AS c FROM documents WHERE visibility != 'private'").fetchone()["c"]
    n_flags = edits_conn.execute(
        "SELECT COUNT(*) AS c FROM edit_flags WHERE visibility IS NOT NULL").fetchone()["c"]

    if confirm:
        lib_conn.execute("UPDATE documents SET visibility='private' "
                         "WHERE visibility != 'private'")
        lib_conn.commit()
        # Clear ONLY visibility. needs_formatting marks are unrelated curation work.
        edits_conn.execute("UPDATE edit_flags SET visibility = NULL "
                           "WHERE visibility IS NOT NULL")
        edits_conn.commit()

    return {"documents": n_docs, "flag_overrides": n_flags, "applied": confirm}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", required=True, help="path to library.db")
    ap.add_argument("--edits-db", required=True, help="path to edits.db")
    ap.add_argument("--confirm", action="store_true",
                    help="actually write; without this it is a dry run")
    args = ap.parse_args()

    lib = store.connect(args.db)
    ed = store.connect(args.edits_db)
    try:
        result = run(lib, ed, confirm=args.confirm)
    finally:
        lib.close(); ed.close()

    verb = "set" if args.confirm else "would set"
    print(f"{verb} {result['documents']} documents to private")
    print(f"{verb} {result['flag_overrides']} visibility overrides to NULL")
    if not args.confirm:
        print("\nDRY RUN — re-run with --confirm to apply.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ~/Projects/library-api && python -m pytest tests/test_migrate_visibility.py -v
```

Expected: PASS, all four tests.

- [ ] **Step 5: Verify the dry run against a real copy**

```bash
cd ~/Projects/library-api && python -m pytest && echo "--- suite green ---"
```

Expected: all green. Do **not** run the script against `/data/library-api/library.db` — that is the user's manual step.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/library-api
git add scripts/migrate_visibility_private.py tests/test_migrate_visibility.py
git commit -m "feat(scripts): dry-run-by-default migration forcing all docs private"
```

---

# Phase B — frontend

Work in `~/Projects/cwcorella-git.github.io` on branch `visibility-axis-ui`.

```bash
cd ~/Projects/cwcorella-git.github.io && git checkout -b visibility-axis-ui
```

Run tests with `npx vitest run` and the type-check with `npm run check`. Use `source ~/.nvm/nvm.sh && nvm use 20` first if node is not v20.

**The frontend must tolerate an un-upgraded API.** It ships first, so `PUT /documents/{id}/flags` may 404 in production for a window. A 404 must toast and roll back, never tear down the page.

---

### Task 6: Client method and optimistic state action

**Files:**
- Modify: `src/lib/library/api.ts` (beside `setCuration`, `~143`)
- Modify: `src/lib/library/libraryState.svelte.ts` (beside `setDecision`, `~291`)
- Test: `src/lib/library/libraryState.test.ts` (extend)

**Interfaces:**
- Consumes: existing `request()` in `api.ts`; `_openDoc`, `_openIndex`, `_rowCache`, `_version` in `libraryState`.
- Produces, for Tasks 7 and 8:
  - `client.setFlags(id: number | string, flags: { visibility?: string; needs_formatting?: 0 | 1 }): Promise<LibraryDoc>`
  - `libraryState.toggleVisibility(): Promise<void>` — flips the open doc between `public` and `private`.
  - `libraryState.toggleNeedsFormatting(): Promise<void>` — flips the open doc's `needs_formatting`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/library/libraryState.test.ts`. That file already mocks the API client — add `setFlags` to the existing client stub rather than creating a second mock.

```ts
describe('flag toggles', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDocument.mockResolvedValue({ ...doc, visibility: 'private', needs_formatting: false });
		getCurationStats.mockResolvedValue(null);
	});

	it('optimistically flips visibility', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockResolvedValue({ ...doc, visibility: 'public' });
		await libraryState.toggleVisibility();
		expect(setFlags).toHaveBeenCalledWith(1, { visibility: 'public' });
		expect(libraryState.openDoc?.visibility).toBe('public');
	});

	it('rolls back and toasts when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockRejectedValue(new Error('nope'));
		await libraryState.toggleVisibility();
		expect(libraryState.openDoc?.visibility).toBe('private');
		expect(toastError).toHaveBeenCalled();
	});

	it('does not put the page into an error state when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		const statusBefore = libraryState.status;
		setFlags.mockRejectedValue(new Error('nope'));
		await libraryState.toggleVisibility();
		expect(libraryState.status).toBe(statusBefore);
		expect(libraryState.status).not.toBe('error');
	});

	it('flips needs_formatting', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		setFlags.mockResolvedValue({ ...doc, needs_formatting: true });
		await libraryState.toggleNeedsFormatting();
		expect(setFlags).toHaveBeenCalledWith(1, { needs_formatting: 1 });
	});
});
```

Declare `const setFlags = vi.fn();` beside the other client mocks at the top of the file and add `setFlags` to the object `createLibraryClient` returns.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/library/libraryState.test.ts
```

Expected: FAIL — `libraryState.toggleVisibility is not a function`.

- [ ] **Step 3: Add the client method**

In `src/lib/library/api.ts`, beside `setCuration`:

```ts
		setFlags(id: number | string, flags: { visibility?: string; needs_formatting?: 0 | 1 }): Promise<LibraryDoc> {
			return request('/documents/' + id + '/flags', { method: 'PUT', body: flags });
		},
```

- [ ] **Step 4: Add the state actions**

In `src/lib/library/libraryState.svelte.ts`, after `setDecision`:

```ts
	async _setFlags(patch: { visibility?: string; needs_formatting?: 0 | 1 }, revert: Partial<LibraryDoc>) {
		const doc = _openDoc;
		if (!doc) return;
		const idx = _openIndex;

		// Optimistic, mirroring setDecision: update the open doc + its cached row.
		_openDoc = { ...doc, ...revertKeysToValues(patch) };
		if (idx !== null) {
			const cached = _rowCache.get(idx);
			if (cached && cached.id === doc.id) {
				_rowCache.set(idx, { ...cached, ...revertKeysToValues(patch) });
				_version++;
			}
		}

		try {
			await client.setFlags(doc.id, patch);
		} catch {
			// Toast, never _mapError: page-level status unmounts the controls.
			if (_openDoc && _openDoc.id === doc.id) _openDoc = { ..._openDoc, ...revert };
			if (idx !== null) {
				const c2 = _rowCache.get(idx);
				if (c2 && c2.id === doc.id) { _rowCache.set(idx, { ...c2, ...revert }); _version++; }
			}
			toast.error('could not save mark');
		}
	},

	toggleVisibility() {
		const doc = _openDoc;
		if (!doc) return Promise.resolve();
		const next = doc.visibility === 'public' ? 'private' : 'public';
		return this._setFlags({ visibility: next }, { visibility: doc.visibility });
	},

	toggleNeedsFormatting() {
		const doc = _openDoc;
		if (!doc) return Promise.resolve();
		const next = doc.needs_formatting ? 0 : 1;
		return this._setFlags({ needs_formatting: next }, { needs_formatting: doc.needs_formatting });
	},
```

Add a module-level helper above the state object, which converts the wire patch into document-shaped values (`needs_formatting` is `0|1` on the wire and `boolean` on the doc):

```ts
function revertKeysToValues(patch: { visibility?: string; needs_formatting?: 0 | 1 }): Partial<LibraryDoc> {
	const out: Partial<LibraryDoc> = {};
	if (patch.visibility !== undefined) out.visibility = patch.visibility;
	if (patch.needs_formatting !== undefined) out.needs_formatting = patch.needs_formatting === 1;
	return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/lib/library/libraryState.test.ts
```

Expected: PASS, all four new tests plus the three existing ones.

- [ ] **Step 6: Run the full suite and type-check**

```bash
npx vitest run && npm run check
```

Expected: all green, 0 type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/library/api.ts src/lib/library/libraryState.svelte.ts src/lib/library/libraryState.test.ts
git commit -m "feat(library): setFlags client + optimistic visibility/needs-formatting toggles"
```

---

### Task 7: Reader toggles, and remove the editor checkbox

**Files:**
- Modify: `src/lib/components/library/DocReader.svelte` (header `~188-215`)
- Modify: `src/lib/components/library/DocEditor.svelte` (remove the `.fmt-flag` label at `~71`)
- Modify: `src/lib/library/editLogic.ts` (`EditDraft`, `docToDraft`, `draftChanged`, `draftToPayload`)
- Test: `src/lib/library/editLogic.test.ts` (update)

**Interfaces:**
- Consumes: `libraryState.toggleVisibility()`, `libraryState.toggleNeedsFormatting()` from Task 6.
- Produces: nothing later tasks depend on.

**Why the checkbox goes:** `needs_formatting` is a state flag, not content. Routing it through a body save meant entering an editor and cutting a version snapshot to flip a boolean. After Task 6 it is a one-click mark.

- [ ] **Step 1: Write the failing test**

In `src/lib/library/editLogic.test.ts`, update the `draftChanged` tests so that a `needs_formatting` difference no longer counts as a change, and remove the field from any `EditDraft` fixtures. Add:

```ts
it('ignores needs_formatting — it is no longer part of the draft', () => {
	const doc = { ...baseDoc, needs_formatting: false };
	const draft = docToDraft(doc);
	expect('needs_formatting' in draft).toBe(false);
	expect(draftChanged(doc, draft)).toBe(false);
});
```

Match `baseDoc` to the fixture shape already used in that file.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/library/editLogic.test.ts
```

Expected: FAIL — `expect('needs_formatting' in draft).toBe(false)` receives `true`.

- [ ] **Step 3: Drop the field from `editLogic.ts`**

Remove `needs_formatting` from the `EditDraft` interface, from `docToDraft`'s return, and from `draftChanged`'s comparison. In `draftToPayload`, stop sending it — the payload field stays optional on the wire, so the backend is unaffected.

- [ ] **Step 4: Remove the editor checkbox**

In `src/lib/components/library/DocEditor.svelte`, delete the `.fmt-flag` label (the `<label class="fmt-flag"><input type="checkbox" bind:checked={draft.needs_formatting} /> needs formatting</label>` line) and its now-unused CSS rule.

- [ ] **Step 5: Add the reader toggles**

In `src/lib/components/library/DocReader.svelte`, after the existing `.decide-group`, add a second group. Match the existing `.decide-btn` markup and styling conventions — no tooltips, no `title` attributes, no keyboard hints:

```svelte
			<div class="mark-group" role="group" aria-label="Document marks">
				<button
					class="mark-btn"
					class:active={libraryState.openDoc?.visibility === 'public'}
					aria-pressed={libraryState.openDoc?.visibility === 'public'}
					onclick={() => libraryState.toggleVisibility()}
				>{libraryState.openDoc?.visibility === 'public' ? 'public' : 'private'}</button>
				<button
					class="mark-btn"
					class:active={!!libraryState.openDoc?.needs_formatting}
					aria-pressed={!!libraryState.openDoc?.needs_formatting}
					onclick={() => libraryState.toggleNeedsFormatting()}
				>{libraryState.openDoc?.needs_formatting ? 'needs fmt' : 'clean'}</button>
			</div>
```

Add `.mark-group` and `.mark-btn` styles mirroring `.decide-group` / `.decide-btn`.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx vitest run && npm run check
```

Expected: all green, 0 type errors. If `npm run check` reports an unused `needs_formatting` on `EditPayload`, leave the wire type alone — the field remains valid on the API.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/library/DocReader.svelte src/lib/components/library/DocEditor.svelte src/lib/library/editLogic.ts src/lib/library/editLogic.test.ts
git commit -m "feat(library): reader mark toggles; needs_formatting leaves the editor"
```

---

### Task 8: `P` and `F` keys

**Files:**
- Modify: `src/lib/library/keyLogic.ts`
- Modify: `src/lib/components/library/DocReader.svelte` (`handleKeydown` dispatch)
- Test: `src/lib/library/keyLogic.test.ts` (extend)

**Interfaces:**
- Consumes: `libraryState.toggleVisibility()`, `libraryState.toggleNeedsFormatting()` from Task 6; the existing `resolveKey` / `TriageAction` from `keyLogic.ts`.
- Produces: an extended `TriageAction` union — `{ kind: 'mark'; flag: 'visibility' | 'needs_formatting' }`.

**Critical difference from the decision keys: marks do NOT auto-advance.** Marking a document clean or public happens *while reading it*, often alongside a decision, so advancing would fight the user.

They keep every other guard: the modifier check, the `Escape`-before-guards ordering, the `editMode`/`isTextTarget` guards, the load-window gate (`hasDoc && status === 'idle'`), and the auto-repeat guard. Read `keyLogic.ts` before editing — the repeat gate's position relative to the arrow keys is load-bearing and commented as such.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/library/keyLogic.test.ts`:

```ts
describe('resolveKey — marks', () => {
	it('maps p and P to the visibility mark', () => {
		expect(resolveKey({ key: 'p' }, ctx())).toEqual({ kind: 'mark', flag: 'visibility' });
		expect(resolveKey({ key: 'P' }, ctx())).toEqual({ kind: 'mark', flag: 'visibility' });
	});
	it('maps f and F to the needs-formatting mark', () => {
		expect(resolveKey({ key: 'f' }, ctx())).toEqual({ kind: 'mark', flag: 'needs_formatting' });
		expect(resolveKey({ key: 'F' }, ctx())).toEqual({ kind: 'mark', flag: 'needs_formatting' });
	});
	it('ignores auto-repeat for marks', () => {
		expect(resolveKey({ key: 'p', repeat: true }, ctx())).toBeNull();
		expect(resolveKey({ key: 'f', repeat: true }, ctx())).toBeNull();
	});
	it('is inert while editing or in a text field', () => {
		expect(resolveKey({ key: 'p' }, ctx({ editMode: true }))).toBeNull();
		expect(resolveKey({ key: 'f' }, ctx({ isTextTarget: true }))).toBeNull();
	});
	it('is inert during the load window and the error state', () => {
		expect(resolveKey({ key: 'p' }, ctx({ status: 'loading' }))).toBeNull();
		expect(resolveKey({ key: 'f' }, ctx({ status: 'error' }))).toBeNull();
	});
	it('passes modifier-bearing marks through', () => {
		expect(resolveKey({ key: 'p', ctrlKey: true }, ctx())).toBeNull();
	});
});
```

Match `ctx()`'s existing signature in that file — it already carries `hasDoc`, `status`, `editMode`, and `isTextTarget`.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/library/keyLogic.test.ts
```

Expected: FAIL — `expected null to equal { kind: 'mark', flag: 'visibility' }`.

- [ ] **Step 3: Extend the action type and the mapping**

In `src/lib/library/keyLogic.ts`, add to the `TriageAction` union:

```ts
	| { kind: 'mark'; flag: 'visibility' | 'needs_formatting' }
```

and add a lookup beside `DECISION_KEYS`:

```ts
const MARK_KEYS: Record<string, 'visibility' | 'needs_formatting'> = {
	p: 'visibility',
	f: 'needs_formatting'
};
```

Resolve marks in the same block as decisions — **below** the `e.repeat` guard, so marks inherit it:

```ts
	const flag = MARK_KEYS[e.key.toLowerCase()];
	if (flag) return { kind: 'mark', flag };
```

- [ ] **Step 4: Dispatch in the component**

In `src/lib/components/library/DocReader.svelte`'s `handleKeydown`, before the decision dispatch:

```ts
		if (action.kind === 'mark') {
			// Deliberately no advance: marking happens while reading, often alongside
			// a decision, so advancing here would fight the user.
			if (action.flag === 'visibility') void libraryState.toggleVisibility();
			else void libraryState.toggleNeedsFormatting();
			return;
		}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/lib/library/keyLogic.test.ts
```

Expected: PASS.

- [ ] **Step 6: Confirm no markup crept into the component**

```bash
git diff src/lib/components/library/DocReader.svelte | grep -c '^+.*<'
```

Expected: `0` — this task changes only the `<script>` block. Any added markup means a shortcut hint crept in, which the Global Constraints forbid.

- [ ] **Step 7: Run the full suite and type-check**

```bash
npx vitest run && npm run check
```

Expected: all green, 0 type errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/library/keyLogic.ts src/lib/library/keyLogic.test.ts src/lib/components/library/DocReader.svelte
git commit -m "feat(library): P and F mark keys, non-advancing"
```

---

## Deploy and migration — user-run, not part of this plan

In order, after both phases merge:

1. **Deploy the frontend first.** It degrades to a toast if `/documents/{id}/flags` 404s.
2. **Deploy the API:** — **DONE 2026-07-19.** Service active, `PUT /documents/{id}/flags`
   registered, flags round-trip verified against the live service (write → overlay
   resolution → `library.db` untouched → no version snapshot → 422 on a bad value →
   clean fallback on revert).
   ```bash
   ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull origin main && sudo systemctl restart library-api'
   ```
3. **Create `publish.env`** — **BLOCKER, added 2026-07-19.** `/data/library-api/publish.env`
   does not exist, so `publish.py --dry-run` exits rather than connecting. That is the only
   tool that can review marks, because filters and facets do not see the overlay. **Do this
   before step 5, not after** — otherwise the blackout runs with no way to verify recovery.
   Template: `deploy/publish.env.example`. The DSN must be hand-supplied via `sudo`.
4. **Dry-run the migration**, then apply:
   ```bash
   python scripts/migrate_visibility_private.py --db /data/library-api/library.db --edits-db /data/library-api/edits.db
   # review the counts, then re-run with --confirm
   ```
5. **Curate.** Every document needs **both** marks to be published: `keep` *and* `public`. Curation measured 2026-07-19 is 114 delete / 0 keep / 0 hide, so at this moment **zero documents qualify**.
6. **Only then** run `bootstrap.py` and `publish.py` back-to-back. Running them before step 5 takes VG's public library to zero and leaves it there until the marking is done.

**Note:** the API is token-gated on reads as well as writes. Any manual verification needs
the token from `/data/library-api/library-api.env` (root-readable).

`bootstrap.py --restore --confirm` reverses step 5 from its snapshot.
