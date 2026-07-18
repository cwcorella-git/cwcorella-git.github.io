# Library Document Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin edit a library document's body, title, tags, and needs_formatting flag, with edits that are permanent (survive a corpus re-sync), reflected in the reader/search/`.md` download, and versioned.

**Architecture:** A migration-exempt `edits.db` overlay on the workstation (mirroring `curation.db`) is the source of truth for edits; `library.db` stays the read-only mirror. The read path injects overlay values over base values. Search stays a single index: the save endpoint reindexes `documents_fts` (the one deliberate `library.db` write), and the loader gains a `reapply_overlays_to_fts()` post-pass so a re-sync re-freshes the index. The frontend adds an edit mode to the existing `DocReader` modal (Layout C: format toolbar + Write⇄Preview, sidebar Info⇄Versions, tags at column bottom).

**Tech Stack:** Backend `library-api` — Python, FastAPI, stdlib `sqlite3`, pytest (run bare `pytest` from repo root). Frontend `cwcorella-git.github.io` — SvelteKit 2, Svelte 5 runes, Vitest (`npm test`, node env — pure `.ts` only), Playwright e2e against a real local backend.

**Two repos, ship order API-first:** Tasks 1–5 are in `~/Projects/library-api`; Tasks 6–9 are in `~/Projects/cwcorella-git.github.io`. Deploy the backend first (`ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull origin main && sudo systemctl restart library-api'`), then the frontend. These are net-new additive endpoints, so an un-upgraded frontend is unaffected; the read-merge keeps `/documents` response shape identical (only adds an optional `edited` boolean).

## Global Constraints

- `edits.db` is migration-exempt: the migrator/loader must never open or write it **except** the `reapply_overlays_to_fts()` FTS post-pass, which reads `edits.db` read-only and writes only `documents_fts`.
- The ONLY `library.db` write introduced is the derived `documents_fts` upsert for edited docs. No source column of `documents` is ever written by the API.
- Durable edit identity is `(source, source_id)`; `doc_id` is the working key (stable across ordinary re-syncs).
- Read-merge must keep `/documents` and `/documents/{id}` response field names identical; only an optional `edited: bool` key is added.
- `filtersToParams()` and the seek/cursor pagination path are NOT modified.
- Overlay values do NOT participate in `/facets` counts or in list filters (`needs_formatting=`, `tag=` filter on base values). Known v1 limitation.
- Frontend: Svelte 5 runes only, no new dependencies. Library edits go to the API, never the GitHub write queue. Errors surface via `toast` at the component layer (`libraryState` uses status-based `_mapError`; do not add toast imports there).
- Env var convention: `LIBRARY_EDITS_DB` (default `/data/library-api/edits.db`), Settings field `edits_db`.
- Auth: all new endpoints carry `Depends(require_token)` — same bearer token as reads.

---

## Task 1: `edits.py` overlay store + Settings wiring

**Repo:** `~/Projects/library-api`

**Files:**
- Create: `backend/api/edits.py`
- Modify: `backend/api/db.py:35-61` (add `edits_db` field + `from_env`)
- Modify: `tests/conftest.py` (add `edits_db` fixture; add `edits_db` to `settings` fixture)
- Modify: `deploy/library-api.env.example` (document `LIBRARY_EDITS_DB`)
- Test: `tests/test_edits_store.py`

**Interfaces:**
- Produces: `init_edits_db(path)`, `write_conn(path)`, `class EditNotFound(Exception)`, `save_edit(edits_conn, lib_conn, doc_id, *, body, title, needs_formatting, tags, now) -> dict`, `list_versions(edits_conn, doc_id) -> list[dict]`, `revert_to_version(edits_conn, lib_conn, doc_id, version_id, *, now) -> dict`, `revert_to_original(edits_conn, lib_conn, doc_id) -> None`, `get_overlay(conn, doc_id, *, table='edits') -> dict | None`, `overlay_tags(conn, doc_id, *, table='edit_tags') -> list[str]`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_edits_store.py
import json
import sqlite3
from backend.api import edits
from backend.api.db import read_conn


def _edits_db(tmp_path):
    path = str(tmp_path / "edits.db")
    edits.init_edits_db(path)
    return path


def _open(seeded_db, edits_path):
    ed = edits.write_conn(edits_path)
    lib = read_conn(seeded_db.db_path)
    return ed, lib


def test_save_edit_writes_overlay_tags_and_one_version(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ed, lib = _open(seeded_db, _edits_db(tmp_path))
    try:
        res = edits.save_edit(
            ed, lib, doc_id,
            body="# New body\n\nedited text",
            title="New Title",
            needs_formatting=0,
            tags=["reformatted", "keep-me"],
            now="2026-07-17T00:00:00Z",
        )
        assert res["doc_id"] == doc_id
        row = ed.execute("SELECT * FROM edits WHERE doc_id=?", (doc_id,)).fetchone()
        assert row["body"] == "# New body\n\nedited text"
        assert row["title"] == "New Title"
        assert row["word_count"] == 4 and row["char_count"] == len("# New body\n\nedited text")
        tags = [r["tag"] for r in ed.execute(
            "SELECT tag FROM edit_tags WHERE doc_id=? ORDER BY tag", (doc_id,))]
        assert tags == ["keep-me", "reformatted"]
        versions = ed.execute("SELECT * FROM edit_versions WHERE doc_id=?", (doc_id,)).fetchall()
        assert len(versions) == 1
        assert json.loads(versions[0]["tags"]) == ["reformatted", "keep-me"]
    finally:
        ed.close(); lib.close()


def test_save_edit_unknown_doc_raises(seeded_db, tmp_path):
    ed, lib = _open(seeded_db, _edits_db(tmp_path))
    try:
        import pytest
        with pytest.raises(edits.EditNotFound):
            edits.save_edit(ed, lib, 999999, body="x", title=None,
                            needs_formatting=None, tags=[], now="2026-07-17T00:00:00Z")
    finally:
        ed.close(); lib.close()


def test_second_save_appends_version_and_replaces_overlay(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ed, lib = _open(seeded_db, _edits_db(tmp_path))
    try:
        edits.save_edit(ed, lib, doc_id, body="v1", title=None,
                        needs_formatting=None, tags=["a"], now="2026-07-17T00:00:01Z")
        edits.save_edit(ed, lib, doc_id, body="v2", title=None,
                        needs_formatting=None, tags=["b"], now="2026-07-17T00:00:02Z")
        assert ed.execute("SELECT body FROM edits WHERE doc_id=?", (doc_id,)).fetchone()["body"] == "v2"
        assert ed.execute("SELECT COUNT(*) c FROM edit_versions WHERE doc_id=?", (doc_id,)).fetchone()["c"] == 2
        tags = [r["tag"] for r in ed.execute("SELECT tag FROM edit_tags WHERE doc_id=?", (doc_id,))]
        assert tags == ["b"]
    finally:
        ed.close(); lib.close()


def test_revert_to_version_restores_and_appends(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ed, lib = _open(seeded_db, _edits_db(tmp_path))
    try:
        edits.save_edit(ed, lib, doc_id, body="first", title="T1",
                        needs_formatting=None, tags=["x"], now="2026-07-17T00:00:01Z")
        v1 = edits.list_versions(ed, doc_id)[0]["version_id"]
        edits.save_edit(ed, lib, doc_id, body="second", title="T2",
                        needs_formatting=None, tags=["y"], now="2026-07-17T00:00:02Z")
        edits.revert_to_version(ed, lib, doc_id, v1, now="2026-07-17T00:00:03Z")
        assert ed.execute("SELECT body FROM edits WHERE doc_id=?", (doc_id,)).fetchone()["body"] == "first"
        assert ed.execute("SELECT COUNT(*) c FROM edit_versions WHERE doc_id=?", (doc_id,)).fetchone()["c"] == 3
    finally:
        ed.close(); lib.close()


def test_revert_to_original_clears_overlay_keeps_versions(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ed, lib = _open(seeded_db, _edits_db(tmp_path))
    try:
        edits.save_edit(ed, lib, doc_id, body="edited", title=None,
                        needs_formatting=None, tags=["x"], now="2026-07-17T00:00:01Z")
        edits.revert_to_original(ed, lib, doc_id)
        assert ed.execute("SELECT * FROM edits WHERE doc_id=?", (doc_id,)).fetchone() is None
        assert ed.execute("SELECT COUNT(*) c FROM edit_tags WHERE doc_id=?", (doc_id,)).fetchone()["c"] == 0
        assert ed.execute("SELECT COUNT(*) c FROM edit_versions WHERE doc_id=?", (doc_id,)).fetchone()["c"] >= 1
    finally:
        ed.close(); lib.close()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Projects/library-api && pytest tests/test_edits_store.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'backend.api.edits'`.

- [ ] **Step 3: Create `backend/api/edits.py`**

```python
"""Edits overlay store — a migration-exempt sibling of library.db (like curation.db).

Source of truth for document edits (body, title, tags, needs_formatting). The
migrator never opens this file EXCEPT the FTS reapply post-pass (Task 3), which
reads it read-only and writes only documents_fts. library.db is never written
here; doc existence is checked through a caller-supplied read-only lib connection.
Keyed on doc_id, with (source, source_id) stored for durable re-attachment.
"""
import json
import sqlite3

_SCHEMA = """
CREATE TABLE IF NOT EXISTS edits (
    doc_id           INTEGER PRIMARY KEY,
    source           TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    body             TEXT NOT NULL,
    title            TEXT,
    needs_formatting INTEGER,
    word_count       INTEGER NOT NULL DEFAULT 0,
    char_count       INTEGER NOT NULL DEFAULT 0,
    updated_at       TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_edits_srcid ON edits(source, source_id);
CREATE TABLE IF NOT EXISTS edit_tags (
    doc_id INTEGER NOT NULL,
    tag    TEXT NOT NULL,
    PRIMARY KEY (doc_id, tag)
);
CREATE TABLE IF NOT EXISTS edit_versions (
    version_id       INTEGER PRIMARY KEY,
    doc_id           INTEGER NOT NULL,
    body             TEXT NOT NULL,
    title            TEXT,
    tags             TEXT NOT NULL,
    needs_formatting INTEGER,
    created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_edit_versions_doc ON edit_versions(doc_id, created_at);
"""


class EditNotFound(Exception):
    """A doc_id has no row in library.db. The app maps this to 404."""


def init_edits_db(path: str) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()


def write_conn(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _doc_srcid(lib_conn, doc_id: int):
    return lib_conn.execute(
        "SELECT source, source_id FROM documents WHERE id = ?", (doc_id,)
    ).fetchone()


def _counts(body: str):
    return len(body.split()), len(body)


def save_edit(edits_conn, lib_conn, doc_id: int, *, body, title,
              needs_formatting, tags, now) -> dict:
    base = _doc_srcid(lib_conn, doc_id)
    if base is None:
        raise EditNotFound(doc_id)
    wc, cc = _counts(body)
    edits_conn.execute(
        "INSERT INTO edits (doc_id, source, source_id, body, title, needs_formatting, "
        "word_count, char_count, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) "
        "ON CONFLICT(doc_id) DO UPDATE SET body=excluded.body, title=excluded.title, "
        "needs_formatting=excluded.needs_formatting, word_count=excluded.word_count, "
        "char_count=excluded.char_count, updated_at=excluded.updated_at",
        (doc_id, base["source"], base["source_id"], body, title, needs_formatting, wc, cc, now),
    )
    edits_conn.execute("DELETE FROM edit_tags WHERE doc_id = ?", (doc_id,))
    edits_conn.executemany(
        "INSERT INTO edit_tags (doc_id, tag) VALUES (?, ?)",
        [(doc_id, t) for t in tags],
    )
    edits_conn.execute(
        "INSERT INTO edit_versions (doc_id, body, title, tags, needs_formatting, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (doc_id, body, title, json.dumps(tags), needs_formatting, now),
    )
    edits_conn.commit()
    return {"doc_id": doc_id, "updated_at": now, "word_count": wc, "char_count": cc}


def list_versions(edits_conn, doc_id: int) -> list:
    rows = edits_conn.execute(
        "SELECT version_id, title, created_at FROM edit_versions "
        "WHERE doc_id = ? ORDER BY created_at DESC, version_id DESC",
        (doc_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def revert_to_version(edits_conn, lib_conn, doc_id, version_id, *, now) -> dict:
    v = edits_conn.execute(
        "SELECT body, title, tags, needs_formatting FROM edit_versions "
        "WHERE version_id = ? AND doc_id = ?", (version_id, doc_id)).fetchone()
    if v is None:
        raise EditNotFound(f"version {version_id} for doc {doc_id}")
    return save_edit(edits_conn, lib_conn, doc_id, body=v["body"], title=v["title"],
                     needs_formatting=v["needs_formatting"],
                     tags=json.loads(v["tags"]), now=now)


def revert_to_original(edits_conn, lib_conn, doc_id) -> None:
    edits_conn.execute("DELETE FROM edits WHERE doc_id = ?", (doc_id,))
    edits_conn.execute("DELETE FROM edit_tags WHERE doc_id = ?", (doc_id,))
    edits_conn.commit()


def get_overlay(conn, doc_id, *, table="edits"):
    row = conn.execute(f"SELECT * FROM {table} WHERE doc_id = ?", (doc_id,)).fetchone()
    return dict(row) if row else None


def overlay_tags(conn, doc_id, *, table="edit_tags"):
    rows = conn.execute(
        f"SELECT tag FROM {table} WHERE doc_id = ? ORDER BY tag", (doc_id,)).fetchall()
    return [r["tag"] for r in rows]
```

- [ ] **Step 4: Wire Settings + fixtures**

In `backend/api/db.py`, add to the `Settings` dataclass (after `curation_db: str`, line 38): `edits_db: str`. In `from_env` (after the `curation_db=` entry, line 56): `edits_db=os.environ.get("LIBRARY_EDITS_DB", "/data/library-api/edits.db"),`.

In `tests/conftest.py`, add an `edits_db` fixture and thread it into `settings`:

```python
@pytest.fixture
def edits_db(tmp_path):
    from backend.api import edits as _edits
    path = str(tmp_path / "edits.db")
    _edits.init_edits_db(path)
    return path
```
Change the `settings` fixture signature to `def settings(seeded_db, curation_db, edits_db):` and add `edits_db=edits_db,` to the `Settings(...)` call.

In `deploy/library-api.env.example`, add: `LIBRARY_EDITS_DB=/data/library-api/edits.db`.

- [ ] **Step 5: Run to verify pass**

Run: `pytest tests/test_edits_store.py -v`
Expected: PASS (5 tests). Then `pytest -q` — expected: all prior tests still pass (the `settings` fixture change is additive).

- [ ] **Step 6: Commit**

```bash
git add backend/api/edits.py backend/api/db.py tests/conftest.py tests/test_edits_store.py deploy/library-api.env.example
git commit -m "feat(edits): edits.db overlay store — save, versions, revert"
```

---

## Task 2: Read-merge — attach `edits.db`, inject overlay into detail + list

**Repo:** `~/Projects/library-api`

**Files:**
- Modify: `backend/api/db.py` (add `read_conn_overlays`)
- Modify: `backend/api/edits.py` (add `apply_overlay`, `overlays_for_ids`, `overlay_tags_for_ids`)
- Modify: `backend/api/app.py:108-124` (get_document injection) and `:85-104` (list injection)
- Test: `tests/test_edits_readmerge_unit.py`

**Interfaces:**
- Consumes: Task 1 `get_overlay`, `overlay_tags`.
- Produces: `read_conn_overlays(db_path, curation_path, edits_path) -> Connection` (attaches `cur` + `ed`), `edits.apply_overlay(conn, doc)`, `edits.overlays_for_ids(conn, ids)`, `edits.overlay_tags_for_ids(conn, ids)`.

**Note on testing:** the read-merge is exercised end-to-end (over HTTP) by Task 4's `test_put_body_saves_and_returns_merged_doc` and its list assertions, since those need the save endpoint to create an overlay first. This task is unit-tested directly against the attached connection (no endpoint needed), which keeps it independently green.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_edits_readmerge_unit.py
from backend.api import edits
from backend.api.db import read_conn_overlays
from backend.api import query


def test_apply_overlay_overrides_doc(seeded_db, curation_db, edits_db):
    from backend.api.edits import write_conn
    doc_id = seeded_db.records[0]["id"]
    ed = write_conn(edits_db)
    lib = read_conn_overlays(seeded_db.db_path, curation_db, edits_db)
    try:
        from backend.api.db import read_conn
        libw = read_conn(seeded_db.db_path)
        edits.save_edit(ed, libw, doc_id, body="OV", title="OVT",
                        needs_formatting=1, tags=["z"], now="2026-07-17T00:00:00Z")
        libw.close()
        doc = query.get_document(lib, seeded_db.bodies_dir, doc_id)
        edits.apply_overlay(lib, doc)
        assert doc["body"] == "OV" and doc["title"] == "OVT"
        assert doc["needs_formatting"] == 1 and doc["tags"] == ["z"]
        assert doc["edited"] is True
    finally:
        ed.close(); lib.close()
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_edits_readmerge_unit.py -v` → FAIL (`read_conn_overlays` / `apply_overlay` missing).

- [ ] **Step 3: Add `read_conn_overlays` to `backend/api/db.py`**

```python
def read_conn_overlays(db_path: str, curation_path: str, edits_path: str) -> sqlite3.Connection:
    """library.db read-only with BOTH overlays ATTACHed read-only: curation as
    `cur`, edits as `ed`. Used by document detail/list endpoints. Never writes."""
    conn = read_conn_cur(db_path, curation_path)
    conn.execute("ATTACH DATABASE ? AS ed", (f"file:{edits_path}?mode=ro",))
    return conn
```

- [ ] **Step 4: Add overlay-injection helpers to `backend/api/edits.py`**

```python
def apply_overlay(conn, doc: dict) -> None:
    """Mutate a detail doc dict in place with `ed`-attached overlay values."""
    ov = get_overlay(conn, doc["id"], table="ed.edits")
    if ov is None:
        doc["edited"] = False
        return
    doc["body"] = ov["body"]
    if ov["title"]:
        doc["title"] = ov["title"]
    if ov["needs_formatting"] is not None:
        doc["needs_formatting"] = ov["needs_formatting"]
    doc["word_count"] = ov["word_count"]
    doc["char_count"] = ov["char_count"]
    doc["tags"] = overlay_tags(conn, doc["id"], table="ed.edit_tags")
    doc["edited"] = True


def overlays_for_ids(conn, ids):
    if not ids:
        return {}
    ph = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT doc_id, title, needs_formatting, word_count, char_count "
        f"FROM ed.edits WHERE doc_id IN ({ph})", ids).fetchall()
    return {r["doc_id"]: dict(r) for r in rows}


def overlay_tags_for_ids(conn, ids):
    if not ids:
        return {}
    ph = ",".join("?" for _ in ids)
    rows = conn.execute(
        f"SELECT doc_id, tag FROM ed.edit_tags WHERE doc_id IN ({ph}) ORDER BY tag", ids).fetchall()
    out = {}
    for r in rows:
        out.setdefault(r["doc_id"], []).append(r["tag"])
    return out
```

- [ ] **Step 5: Inject in `backend/api/app.py`**

Add `from backend.api import edits` to the imports. Change `get_document` (line 110) to use overlays and apply after the decision injection (line 120):

```python
        conn = read_conn_overlays(settings.db, settings.curation_db, settings.edits_db)
        ...
            doc["decision"] = query.decisions_for_ids(conn, [doc["id"]]).get(doc["id"])
            edits.apply_overlay(conn, doc)
```
(Also update the import at the top of app.py from `from backend.api.db import ... read_conn_cur` to include `read_conn_overlays`.)

In `list_documents` (line 85) change `read_conn_cur(...)` to `read_conn_overlays(settings.db, settings.curation_db, settings.edits_db)`, and after the tags injection loop (line 102), add:

```python
            overlays = edits.overlays_for_ids(conn, ids)
            otags = edits.overlay_tags_for_ids(conn, ids)
            for it in result["items"]:
                ov = overlays.get(it["id"])
                if ov:
                    if ov["title"]:
                        it["title"] = ov["title"]
                    if ov["needs_formatting"] is not None:
                        it["needs_formatting"] = ov["needs_formatting"]
                    it["word_count"] = ov["word_count"]
                    it["char_count"] = ov["char_count"]
                    it["tags"] = otags.get(it["id"], it["tags"])
                    it["edited"] = True
                else:
                    it["edited"] = False
```

- [ ] **Step 6: Run to verify pass**

Run: `pytest tests/test_edits_readmerge_unit.py -v` → PASS. `pytest -q` → whole suite still green (the app.py injection is additive; the over-HTTP read-merge is verified in Task 4).

- [ ] **Step 7: Commit**

```bash
git add backend/api/db.py backend/api/edits.py backend/api/app.py tests/test_edits_readmerge_unit.py
git commit -m "feat(edits): read-merge overlay into document detail + list"
```

---

## Task 3: FTS reindex on edit + `reapply_overlays_to_fts`

**Repo:** `~/Projects/library-api`

**Files:**
- Modify: `backend/api/edits.py` (add `reindex_doc_fts`, `reapply_overlays_to_fts`, `_read_body_file`)
- Test: `tests/test_edits_fts.py`

**Interfaces:**
- Consumes: `store.upsert_fts` (`backend/store.py:131`), Task 1 `get_overlay`.
- Produces: `reindex_doc_fts(lib_write_conn, lib_ro_conn, edits_conn, doc_id, bodies_dir)`, `reapply_overlays_to_fts(lib_write_conn, lib_ro_conn, edits_conn, bodies_dir) -> int`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_edits_fts.py
from backend import store
from backend.api import edits
from backend.api.db import read_conn


def _fts_ids(conn, term):
    return {r["rowid"] for r in conn.execute(
        "SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?", (term,))}


def test_reindex_makes_search_find_edited_text(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ep = str(tmp_path / "edits.db"); edits.init_edits_db(ep)
    ed = edits.write_conn(ep)
    libw = store.connect(seeded_db.db_path)
    libr = read_conn(seeded_db.db_path)
    try:
        edits.save_edit(ed, libr, doc_id, body="zqxwv unique token",
                        title=None, needs_formatting=None, tags=[], now="2026-07-17T00:00:00Z")
        assert doc_id not in _fts_ids(libw, "zqxwv")   # not yet indexed
        edits.reindex_doc_fts(libw, libr, ed, doc_id, seeded_db.bodies_dir)
        assert doc_id in _fts_ids(libw, "zqxwv")       # now searchable
    finally:
        ed.close(); libw.close(); libr.close()


def test_reapply_restores_edited_text_after_simulated_resync(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ep = str(tmp_path / "edits.db"); edits.init_edits_db(ep)
    ed = edits.write_conn(ep)
    libw = store.connect(seeded_db.db_path)
    libr = read_conn(seeded_db.db_path)
    try:
        edits.save_edit(ed, libr, doc_id, body="zqxwv unique token",
                        title=None, needs_formatting=None, tags=[], now="2026-07-17T00:00:00Z")
        edits.reindex_doc_fts(libw, libr, ed, doc_id, seeded_db.bodies_dir)
        # Simulate a re-sync overwriting FTS back to base text:
        base = libr.execute("SELECT title, author FROM documents WHERE id=?", (doc_id,)).fetchone()
        store.upsert_fts(libw, doc_id, base["title"], base["author"], "original base body")
        assert doc_id not in _fts_ids(libw, "zqxwv")
        n = edits.reapply_overlays_to_fts(libw, libr, ed, seeded_db.bodies_dir)
        assert n == 1
        assert doc_id in _fts_ids(libw, "zqxwv")
    finally:
        ed.close(); libw.close(); libr.close()


def test_reindex_after_revert_uses_original_file_body(seeded_db, tmp_path):
    doc_id = seeded_db.records[0]["id"]
    ep = str(tmp_path / "edits.db"); edits.init_edits_db(ep)
    ed = edits.write_conn(ep)
    libw = store.connect(seeded_db.db_path)
    libr = read_conn(seeded_db.db_path)
    try:
        edits.save_edit(ed, libr, doc_id, body="zqxwv unique token",
                        title=None, needs_formatting=None, tags=[], now="2026-07-17T00:00:00Z")
        edits.reindex_doc_fts(libw, libr, ed, doc_id, seeded_db.bodies_dir)
        edits.revert_to_original(ed, libr, doc_id)
        edits.reindex_doc_fts(libw, libr, ed, doc_id, seeded_db.bodies_dir)
        assert doc_id not in _fts_ids(libw, "zqxwv")   # edited token gone from index
    finally:
        ed.close(); libw.close(); libr.close()
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_edits_fts.py -v`
Expected: FAIL — `reindex_doc_fts` not defined.

- [ ] **Step 3: Implement in `backend/api/edits.py`**

```python
import os
from backend import store


def _read_body_file(bodies_dir, file_path):
    root = os.path.realpath(bodies_dir)
    p = os.path.realpath(os.path.join(root, file_path))
    if not (p == root or p.startswith(root + os.sep)):
        return ""
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        return ""


def reindex_doc_fts(lib_write_conn, lib_ro_conn, edits_conn, doc_id, bodies_dir) -> None:
    base = lib_ro_conn.execute(
        "SELECT title, author, file_path FROM documents WHERE id=?", (doc_id,)).fetchone()
    if base is None:
        return
    ov = get_overlay(edits_conn, doc_id)  # direct edits.db conn -> table "edits"
    if ov is not None:
        title = ov["title"] or base["title"]
        body = ov["body"]
    else:
        title = base["title"]
        body = _read_body_file(bodies_dir, base["file_path"])
    store.upsert_fts(lib_write_conn, doc_id, title, base["author"], body)


def reapply_overlays_to_fts(lib_write_conn, lib_ro_conn, edits_conn, bodies_dir) -> int:
    ids = [r["doc_id"] for r in edits_conn.execute("SELECT doc_id FROM edits")]
    for doc_id in ids:
        reindex_doc_fts(lib_write_conn, lib_ro_conn, edits_conn, doc_id, bodies_dir)
    return len(ids)
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_edits_fts.py -v` → PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/api/edits.py tests/test_edits_fts.py
git commit -m "feat(edits): FTS reindex on edit + reapply-overlays post-pass"
```

---

## Task 4: Edit endpoints — save, versions, revert, download

**Repo:** `~/Projects/library-api`

**Files:**
- Modify: `backend/api/app.py` (models + 4 routes + `create_app` init)
- Test: `tests/test_api_edits.py` (+ the deferred `tests/test_api_edits_readmerge.py` from Task 2 now goes green)

**Interfaces:**
- Consumes: Task 1 `edits.save_edit/list_versions/revert_to_version/revert_to_original/EditNotFound`, Task 3 `edits.reindex_doc_fts`, `read_conn_overlays`, `query.get_document`.
- Produces: `PUT /documents/{id}/body`, `GET /documents/{id}/versions`, `POST /documents/{id}/revert`, `GET /documents/{id}/download`.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api_edits.py
import os


def test_put_body_requires_auth(client, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    r = client.put(f"/documents/{doc_id}/body", json={"body": "x", "tags": []})
    assert r.status_code == 401


def test_put_body_saves_and_returns_merged_doc(client, auth, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    r = client.put(f"/documents/{doc_id}/body", headers=auth,
                   json={"body": "# H\n\nzqxwv token", "title": "New", "tags": ["t1"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["body"] == "# H\n\nzqxwv token" and d["title"] == "New" and d["edited"] is True
    # searchable via the merged FTS
    hit = client.get("/documents", headers=auth, params={"q": "zqxwv", "limit": 50}).json()
    assert doc_id in {it["id"] for it in hit["items"]}


def test_put_body_unknown_doc_404(client, auth):
    r = client.put("/documents/999999/body", headers=auth, json={"body": "x", "tags": []})
    assert r.status_code == 404


def test_versions_then_revert_to_original(client, auth, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    client.put(f"/documents/{doc_id}/body", headers=auth, json={"body": "v1", "tags": []})
    client.put(f"/documents/{doc_id}/body", headers=auth, json={"body": "v2", "tags": []})
    vs = client.get(f"/documents/{doc_id}/versions", headers=auth).json()["versions"]
    assert len(vs) == 2
    r = client.post(f"/documents/{doc_id}/revert", headers=auth, json={"original": True})
    assert r.status_code == 200 and r.json()["edited"] is False


def test_revert_to_version(client, auth, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    client.put(f"/documents/{doc_id}/body", headers=auth, json={"body": "first", "tags": []})
    vid = client.get(f"/documents/{doc_id}/versions", headers=auth).json()["versions"][0]["version_id"]
    client.put(f"/documents/{doc_id}/body", headers=auth, json={"body": "second", "tags": []})
    r = client.post(f"/documents/{doc_id}/revert", headers=auth, json={"version_id": vid})
    assert r.status_code == 200 and r.json()["body"] == "first"


def test_download_returns_edited_markdown(client, auth, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    client.put(f"/documents/{doc_id}/body", headers=auth, json={"body": "# Downloaded\n\nbody", "tags": []})
    r = client.get(f"/documents/{doc_id}/download", headers=auth)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/markdown")
    assert "# Downloaded" in r.text


def test_documents_source_row_untouched_after_edit(client, auth, seeded_db):
    doc_id = seeded_db.records[0]["id"]
    base_title = seeded_db.records[0]["title"]
    client.put(f"/documents/{doc_id}/body", headers=auth,
               json={"body": "edited", "title": "Overlaid X", "tags": []})
    # The merged GET shows the overlaid title...
    assert client.get(f"/documents/{doc_id}", headers=auth).json()["title"] == "Overlaid X"
    # ...but the base documents row is unchanged (no source column written to library.db).
    from backend.api.db import read_conn
    c = read_conn(seeded_db.db_path)
    try:
        row = c.execute("SELECT title FROM documents WHERE id=?", (doc_id,)).fetchone()
    finally:
        c.close()
    assert row["title"] == base_title
```

- [ ] **Step 2: Run to verify it fails**

Run: `pytest tests/test_api_edits.py -v`
Expected: FAIL — routes 404/405.

- [ ] **Step 3: Add models + routes in `backend/api/app.py`**

Add imports at top: `from fastapi import Response`; ensure `from backend import store` and `from backend.api import edits` are present; `from backend.api.db import ... read_conn_overlays`.

Add models near `DecisionBody` (line 19):

```python
class EditBody(BaseModel):
    body: str
    title: str | None = None
    needs_formatting: int | None = None
    tags: list[str] = Field(default_factory=list)


class RevertBody(BaseModel):
    version_id: int | None = None
    original: bool = False
```

In `create_app`, after `curation.init_curation_db(settings.curation_db)` (line 39): `edits.init_edits_db(settings.edits_db)`.

Add a helper inside `create_app` (near `_now`) that returns a fully merged doc, and the routes:

```python
    def _merged_doc(id: int) -> dict:
        conn = read_conn_overlays(settings.db, settings.curation_db, settings.edits_db)
        try:
            doc = query.get_document(conn, settings.bodies, id)
            if doc is None:
                raise HTTPException(status_code=404, detail="document not found")
            doc["decision"] = query.decisions_for_ids(conn, [id]).get(id)
            edits.apply_overlay(conn, doc)
            return doc
        finally:
            conn.close()

    def _reindex(id: int) -> None:
        libw = store.connect(settings.db)
        libr = read_conn(settings.db)
        ed = edits.write_conn(settings.edits_db)
        try:
            edits.reindex_doc_fts(libw, libr, ed, id, settings.bodies)
        finally:
            libw.close(); libr.close(); ed.close()

    @app.put("/documents/{id}/body", dependencies=[Depends(require_token)])
    def put_body(id: int, payload: EditBody):
        lib = read_conn(settings.db)
        try:
            ed = edits.write_conn(settings.edits_db)
            try:
                edits.save_edit(ed, lib, id, body=payload.body, title=payload.title,
                                needs_formatting=payload.needs_formatting,
                                tags=payload.tags, now=_now())
            except edits.EditNotFound:
                raise HTTPException(status_code=404, detail="document not found")
            finally:
                ed.close()
        finally:
            lib.close()
        _reindex(id)
        return _merged_doc(id)

    @app.get("/documents/{id}/versions", dependencies=[Depends(require_token)])
    def get_versions(id: int):
        ed = edits.write_conn(settings.edits_db)
        try:
            return {"versions": edits.list_versions(ed, id)}
        finally:
            ed.close()

    @app.post("/documents/{id}/revert", dependencies=[Depends(require_token)])
    def post_revert(id: int, payload: RevertBody):
        lib = read_conn(settings.db)
        try:
            ed = edits.write_conn(settings.edits_db)
            try:
                if payload.original:
                    edits.revert_to_original(ed, lib, id)
                elif payload.version_id is not None:
                    edits.revert_to_version(ed, lib, id, payload.version_id, now=_now())
                else:
                    raise HTTPException(status_code=400, detail="revert needs version_id or original")
            except edits.EditNotFound:
                raise HTTPException(status_code=404, detail="document or version not found")
            finally:
                ed.close()
        finally:
            lib.close()
        _reindex(id)
        return _merged_doc(id)

    @app.get("/documents/{id}/download", dependencies=[Depends(require_token)])
    def download(id: int):
        doc = _merged_doc(id)
        filename = (doc.get("slug") or f"document-{id}") + ".md"
        return Response(
            content=doc["body"],
            media_type="text/markdown",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
```

- [ ] **Step 4: Run to verify pass**

Run: `pytest tests/test_api_edits.py tests/test_api_edits_readmerge.py -v` → PASS.
Then `pytest -q` (whole suite, nothing ignored now) → all green.

- [ ] **Step 5: Commit**

```bash
git add backend/api/app.py tests/test_api_edits.py
git commit -m "feat(edits): PUT body, versions, revert, download endpoints"
```

---

## Task 5: Wire `reapply_overlays_to_fts` into the migrator

**Repo:** `~/Projects/library-api`

**Files:**
- Modify: `scripts/migrate.py:56-72` (read `LIBRARY_EDITS_DB`, call reapply after the load loop)

**Interfaces:**
- Consumes: Task 3 `edits.reapply_overlays_to_fts`.

This wiring calls a function already unit-tested in Task 3. It cannot be unit-tested in isolation (running `migrate` needs the workstation's Postgres + Docker volume), so it is verified by inspection + the Task 3 test that covers the function itself. **Documented limitation:** the migrate.py glue is exercised only on the workstation.

- [ ] **Step 1: Edit `scripts/migrate.py`**

Add near the top imports: `import sqlite3` (if absent) and `from backend.api import edits as edits_mod`. In `main`, after the `with psycopg.connect(...)` block closes (after line 71, before `print(f"TOTAL: {total}")`):

```python
    edits_db = os.environ.get("LIBRARY_EDITS_DB", "/data/library-api/edits.db")
    if os.path.exists(edits_db):
        ec = sqlite3.connect(edits_db)
        ec.row_factory = sqlite3.Row
        try:
            n = edits_mod.reapply_overlays_to_fts(conn, conn, ec, bodies)
            print(f"reapplied {n} edit overlays to FTS")
        finally:
            ec.close()
```

- [ ] **Step 2: Verify import + syntax**

Run: `python -c "import ast; ast.parse(open('scripts/migrate.py').read()); print('ok')"`
Expected: `ok`. Then `pytest -q` (whole suite still green — no test touches migrate directly).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate.py
git commit -m "feat(edits): re-apply overlays to FTS after a re-sync"
```

**End of backend phase. Deploy before starting the frontend:**
`ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull origin main && sudo systemctl restart library-api'`
(and add `LIBRARY_EDITS_DB=/data/library-api/edits.db` to `/data/library-api/library-api.env` if not defaulted).

---

## Task 6: Frontend API client methods

**Repo:** `~/Projects/cwcorella-git.github.io`

**Files:**
- Modify: `src/lib/library/types.ts` (add `DocVersion`, `edited?` on `DocListItem`)
- Modify: `src/lib/library/api.ts` (add `saveBody`, `getVersions`, `revertDoc`, `downloadMarkdown`)
- Test: `src/lib/library/api.test.ts` (add cases)

**Interfaces:**
- Produces on the client object: `saveBody(id, payload) -> Promise<LibraryDoc>`, `getVersions(id) -> Promise<DocVersion[]>`, `revertDoc(id, target) -> Promise<LibraryDoc>`, `downloadMarkdown(id) -> Promise<string>`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/library/api.test.ts`, matching its `jsonResponse`/`vi.fn()` style)

```ts
describe('edit methods', () => {
	it('saveBody PUTs body to /documents/{id}/body', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7, body: 'b', edited: true }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await client.saveBody(7, { body: 'b', title: 'T', needs_formatting: null, tags: ['x'] });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/body');
		expect(options.method).toBe('PUT');
		expect(JSON.parse(options.body)).toEqual({ body: 'b', title: 'T', needs_formatting: null, tags: ['x'] });
	});

	it('getVersions unwraps {versions}', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { versions: [{ version_id: 3, title: null, created_at: 't' }] }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.getVersions(7)).toEqual([{ version_id: 3, title: null, created_at: 't' }]);
	});

	it('revertDoc POSTs the target', async () => {
		const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { id: 7, edited: false }));
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		await client.revertDoc(7, { original: true });
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/revert');
		expect(options.method).toBe('POST');
		expect(JSON.parse(options.body)).toEqual({ original: true });
	});

	it('downloadMarkdown returns raw text with auth header', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('# md') });
		const client = createLibraryClient({ baseUrl: BASE_URL, getToken: () => TOKEN, fetchImpl });
		expect(await client.downloadMarkdown(7)).toBe('# md');
		const [url, options] = fetchImpl.mock.calls[0];
		expect(url).toBe(BASE_URL + '/documents/7/download');
		expect(options.headers.Authorization).toBe('Bearer ' + TOKEN);
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Projects/cwcorella-git.github.io && npm test -- src/lib/library/api.test.ts`
Expected: FAIL — methods undefined.

- [ ] **Step 3: Add the type + methods**

In `src/lib/library/types.ts`, add `edited?: boolean;` to `DocListItem` (after `tags: string[];`), and:
```ts
export interface DocVersion {
	version_id: number;
	created_at: string;
	title: string | null;
}
export interface EditPayload {
	body: string;
	title?: string | null;
	needs_formatting?: number | null;
	tags: string[];
}
```

In `src/lib/library/api.ts`, import `DocVersion`, `EditPayload` in the type import block, and add to the returned client object (after `setCuration`, line 132):
```ts
		saveBody(id: number | string, payload: EditPayload): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id + '/body', { method: 'PUT', body: payload });
		},
		async getVersions(id: number | string): Promise<DocVersion[]> {
			const res = await request<{ versions: DocVersion[] }>('/documents/' + id + '/versions');
			return res.versions;
		},
		revertDoc(id: number | string, target: { version_id: number } | { original: true }): Promise<LibraryDoc> {
			return request<LibraryDoc>('/documents/' + id + '/revert', { method: 'POST', body: target });
		},
		async downloadMarkdown(id: number | string): Promise<string> {
			const url = baseUrl.replace(/\/$/, '') + '/documents/' + id + '/download';
			const res = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + getToken() }, credentials: 'omit' });
			if (res.status === 401) throw new AuthError();
			if (!res.ok) throw new ApiError(res.status);
			return res.text();
		},
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/library/api.test.ts` → PASS. Then `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/types.ts src/lib/library/api.ts src/lib/library/api.test.ts
git commit -m "feat(library): edit/version/download client methods"
```

---

## Task 7: Edit logic module + `libraryState` edit actions

**Repo:** `~/Projects/cwcorella-git.github.io`

**Files:**
- Create: `src/lib/library/editLogic.ts`
- Test: `src/lib/library/editLogic.test.ts`
- Modify: `src/lib/library/libraryState.svelte.ts` (edit-mode state + actions)

**Interfaces:**
- Consumes: Task 6 client methods, `LibraryDoc`, `EditPayload`, `DocVersion`.
- Produces (pure): `computeCounts(body) -> { word_count, char_count }`, `docToDraft(doc) -> EditDraft`, `draftChanged(doc, draft) -> boolean`, `draftToPayload(draft) -> EditPayload`. On `libraryState`: `editMode` getter, `startEdit()`, `cancelEdit()`, `saveEdit(draft)`, `loadVersions()`, `versions` getter, `revert(target)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/library/editLogic.test.ts
import { describe, it, expect } from 'vitest';
import { computeCounts, docToDraft, draftChanged, draftToPayload } from './editLogic';
import type { LibraryDoc } from './types';

const doc = (over: Partial<LibraryDoc> = {}): LibraryDoc => ({
	id: 1, source: 'user', slug: 's', title: 'T', author: null, publication_date: null,
	language: 'en', document_type: 'book', word_count: 2, char_count: 5, visibility: 'private',
	needs_formatting: false, updated_at: 't', decision: null, tags: ['a', 'b'],
	collections: [], body: 'hi there', ...over
});

describe('computeCounts', () => {
	it('counts words and chars', () => {
		expect(computeCounts('one two three')).toEqual({ word_count: 3, char_count: 13 });
		expect(computeCounts('   ')).toEqual({ word_count: 0, char_count: 3 });
	});
});

describe('draftChanged', () => {
	it('false when nothing changed', () => {
		expect(draftChanged(doc(), docToDraft(doc()))).toBe(false);
	});
	it('true when body changes', () => {
		const d = docToDraft(doc()); d.body = 'new';
		expect(draftChanged(doc(), d)).toBe(true);
	});
	it('true when tags reorder-insensitive differ', () => {
		const d = docToDraft(doc()); d.tags = ['b', 'a'];
		expect(draftChanged(doc(), d)).toBe(false);   // same set
		d.tags = ['a', 'c'];
		expect(draftChanged(doc(), d)).toBe(true);
	});
});

describe('draftToPayload', () => {
	it('maps needs_formatting bool->int and passes tags/body/title', () => {
		const d = docToDraft(doc({ needs_formatting: true }));
		expect(draftToPayload(d)).toEqual({ body: 'hi there', title: 'T', needs_formatting: 1, tags: ['a', 'b'] });
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/library/editLogic.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Create `src/lib/library/editLogic.ts`**

```ts
import type { LibraryDoc, EditPayload } from './types';

export interface EditDraft {
	body: string;
	title: string;
	tags: string[];
	needs_formatting: boolean;
}

export function computeCounts(body: string): { word_count: number; char_count: number } {
	const words = body.split(/\s+/).filter(Boolean);
	return { word_count: words.length, char_count: body.length };
}

export function docToDraft(doc: LibraryDoc): EditDraft {
	return {
		body: doc.body,
		title: doc.title,
		tags: [...doc.tags],
		needs_formatting: !!doc.needs_formatting
	};
}

function sameSet(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	const s = new Set(a);
	return b.every((x) => s.has(x));
}

export function draftChanged(doc: LibraryDoc, draft: EditDraft): boolean {
	return (
		draft.body !== doc.body ||
		draft.title !== doc.title ||
		!!draft.needs_formatting !== !!doc.needs_formatting ||
		!sameSet(draft.tags, doc.tags)
	);
}

export function draftToPayload(draft: EditDraft): EditPayload {
	return {
		body: draft.body,
		title: draft.title,
		needs_formatting: draft.needs_formatting ? 1 : 0,
		tags: draft.tags
	};
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/lib/library/editLogic.test.ts` → PASS.

- [ ] **Step 5: Add edit actions to `libraryState.svelte.ts`**

Add state near line 43: `let _editMode = $state(false); let _versions = $state<DocVersion[]>([]);` (import `DocVersion`, `EditDraft`, `draftToPayload`, `computeCounts` at top; import `{ toast }` is NOT added here — toasts stay in components).

Add to the exposed object (near line 152): `get editMode() { return _editMode; }, get versions() { return _versions; },` and these methods (mirror `setDecision`'s optimistic/rollback shape, lines 284-313):

```ts
	startEdit() { _editMode = true; },
	cancelEdit() { _editMode = false; },

	async saveEdit(draft: EditDraft): Promise<boolean> {
		const doc = _openDoc;
		if (!doc) return false;
		const counts = computeCounts(draft.body);
		const prev = doc;
		_openDoc = { ...doc, body: draft.body, title: draft.title, tags: [...draft.tags],
			needs_formatting: draft.needs_formatting, ...counts, edited: true };
		try {
			const merged = await client.saveBody(doc.id, draftToPayload(draft));
			if (_openDoc && _openDoc.id === doc.id) _openDoc = merged;
			_editMode = false;
			return true;
		} catch (e) {
			if (_openDoc && _openDoc.id === doc.id) _openDoc = prev;   // roll back; stay in edit mode
			_mapError(e);
			throw e;   // let the component toast
		}
	},

	async loadVersions() {
		const doc = _openDoc;
		if (!doc) return;
		try { _versions = await client.getVersions(doc.id); }
		catch { _versions = []; }
	},

	async revert(target: { version_id: number } | { original: true }): Promise<void> {
		const doc = _openDoc;
		if (!doc) return;
		const merged = await client.revertDoc(doc.id, target);   // throws -> component toasts
		if (_openDoc && _openDoc.id === doc.id) _openDoc = merged;
	}
```
Add `_editMode = false; _versions = [];` to `closeDoc()` (line 315) so mode resets between docs. Add `edited?: boolean` handling is already in the type (Task 6).

Note: `LibraryDoc` needs the `edited` field — it extends `DocListItem`, which got `edited?` in Task 6, so no further type change.

- [ ] **Step 6: Verify types**

Run: `npm run check` → 0 errors. `npm test` → full suite green (new logic tested; state wiring compiles).

- [ ] **Step 7: Commit**

```bash
git add src/lib/library/editLogic.ts src/lib/library/editLogic.test.ts src/lib/library/libraryState.svelte.ts
git commit -m "feat(library): edit-mode state, optimistic save, versions, revert"
```

---

## Task 8: `DocEditor` + `TagEditor` components

**Repo:** `~/Projects/cwcorella-git.github.io`

**Files:**
- Create: `src/lib/components/library/DocEditor.svelte`
- Create: `src/lib/components/library/TagEditor.svelte`

**Interfaces:**
- `DocEditor` props: `{ doc: LibraryDoc; onSave: (draft: EditDraft) => Promise<void>; onCancel: () => void }`. Owns a `draft` (`$state`, seeded via `untrack` from `docToDraft(doc)`), a `mode: 'write' | 'preview'` toggle, the format toolbar (reuse `wrap`/`insertBlockquote` from `HomeEditor.svelte:21-48` verbatim, extended with heading/list/link/strikethrough buttons), a `<TagEditor>` at the bottom, and a needs_formatting checkbox. Preview renders `renderMarkdown(draft.body)` via `{@html}`.
- `TagEditor` props: `{ tags: string[]; onChange: (tags: string[]) => void }`. Chips with `×`; an input that autocompletes against `client.searchTags(q)` (debounced ~200ms, `generation`-guarded like `TagChipInput.svelte`) and accepts free text on Enter to coin a new tag.

Svelte components run in the browser; this repo's Vitest is node-env and does not render components (see `vite.config.js:9`). Verification is `npm run check` + `npm run build` + the Playwright e2e in Task 9. Keep both components **presentational** (callbacks up), matching `HomeEditor`.

- [ ] **Step 1: Create `TagEditor.svelte`**

Reuse the debounce + `generation`-guard pattern from `src/lib/components/library/TagChipInput.svelte` (already in the repo). Structure:

```svelte
<script lang="ts">
	import { libraryClient } from '$lib/library/libraryState.svelte';   // export the client (see note)
	let { tags, onChange }: { tags: string[]; onChange: (t: string[]) => void } = $props();
	let q = $state('');
	let suggestions = $state<string[]>([]);
	let generation = 0;

	async function search(term: string) {
		const gen = ++generation;
		if (!term.trim()) { suggestions = []; return; }
		try {
			const res = await libraryClient.searchTags(term, 8);
			if (gen !== generation) return;
			suggestions = res.map((b) => b.name).filter((n) => !tags.includes(n));
		} catch { if (gen === generation) suggestions = []; }
	}
	let timer: ReturnType<typeof setTimeout>;
	$effect(() => { const t = q; clearTimeout(timer); timer = setTimeout(() => search(t), 200); });

	function add(name: string) {
		const n = name.trim();
		if (n && !tags.includes(n)) onChange([...tags, n]);
		q = ''; suggestions = [];
	}
	function remove(t: string) { onChange(tags.filter((x) => x !== t)); }
	function onKey(e: KeyboardEvent) { if (e.key === 'Enter') { e.preventDefault(); add(q); } }
</script>

<div class="tag-editor">
	<div class="chips">
		{#each tags as t (t)}
			<span class="chip">{t}<button class="x" onclick={() => remove(t)} aria-label={`remove ${t}`}>×</button></span>
		{/each}
	</div>
	<input class="tag-input" bind:value={q} onkeydown={onKey} placeholder="add tag…" />
	{#if suggestions.length}
		<ul class="suggest">
			{#each suggestions as s (s)}<li><button onclick={() => add(s)}>{s}</button></li>{/each}
		</ul>
	{/if}
</div>

<style>
	/* Reuse the chip + input styling conventions: var(--ui-rgb), var(--clr-text), var(--font-ui).
	   Mirror .chip from DocInfoPanel and the input styling from HomeEditor. */
	.tag-editor { margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid rgba(var(--ui-rgb), 0.15); }
	.chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.5rem; }
	.chip { display: inline-flex; align-items: center; gap: 0.25rem; border: 1px solid rgba(var(--ui-rgb), 0.28);
		border-radius: 10px; padding: 0.05rem 0.5rem; font-family: var(--font-ui); font-size: 0.7rem; color: var(--clr-text); }
	.chip .x { background: none; border: none; color: var(--clr-text); cursor: pointer; font-size: 0.9rem; line-height: 1; opacity: 0.6; }
	.tag-input { background: rgba(var(--ui-rgb), 0.06); border: 1px solid rgba(var(--ui-rgb), 0.22);
		color: var(--clr-text); font-family: var(--font-ui); font-size: 0.72rem; padding: 0.3rem 0.5rem; width: 100%; }
	.suggest { list-style: none; margin: 0.25rem 0 0; padding: 0; border: 1px solid rgba(var(--ui-rgb), 0.22); }
	.suggest button { display: block; width: 100%; text-align: left; background: none; border: none;
		color: var(--clr-text); font-family: var(--font-ui); font-size: 0.72rem; padding: 0.3rem 0.5rem; cursor: pointer; }
	.suggest button:hover { background: rgba(var(--ui-rgb), 0.1); }
</style>
```

**Note:** export the client from `libraryState.svelte.ts` so `TagEditor` can search tags — add `export const libraryClient = client;` at the bottom of that module (the instance already exists at line 31). Commit that one-line export with this task.

- [ ] **Step 2: Create `DocEditor.svelte`**

```svelte
<script lang="ts">
	import { untrack } from 'svelte';
	import { renderMarkdown } from '$lib/admin/markdown';
	import { docToDraft, type EditDraft } from '$lib/library/editLogic';
	import type { LibraryDoc } from '$lib/library/types';
	import TagEditor from './TagEditor.svelte';

	let { doc, onSave, onCancel }: {
		doc: LibraryDoc;
		onSave: (draft: EditDraft) => Promise<void>;
		onCancel: () => void;
	} = $props();

	let draft = $state<EditDraft>(untrack(() => docToDraft(doc)));
	let mode = $state<'write' | 'preview'>('write');
	let saving = $state(false);
	let textareaEl = $state<HTMLTextAreaElement>();

	const previewHtml = $derived(mode === 'preview' ? renderMarkdown(draft.body) : '');

	function wrap(before: string, after: string) {
		const el = textareaEl as HTMLTextAreaElement;
		const start = el.selectionStart, end = el.selectionEnd;
		const selected = draft.body.slice(start, end);
		const replacement = before + (selected || 'text') + after;
		draft.body = draft.body.slice(0, start) + replacement + draft.body.slice(end);
		requestAnimationFrame(() => {
			el.focus();
			el.setSelectionRange(start + before.length, start + before.length + (selected || 'text').length);
		});
	}
	function prefixLine(prefix: string) {
		const el = textareaEl as HTMLTextAreaElement;
		const start = el.selectionStart;
		const lineStart = draft.body.slice(0, start).lastIndexOf('\n') + 1;
		draft.body = draft.body.slice(0, lineStart) + prefix + draft.body.slice(lineStart);
		requestAnimationFrame(() => el.focus());
	}
	async function save() {
		saving = true;
		try { await onSave(draft); } finally { saving = false; }
	}
</script>

<div class="doc-editor">
	<div class="toolbar">
		<button type="button" onclick={() => wrap('**', '**')} title="Bold">B</button>
		<button type="button" class="italic" onclick={() => wrap('*', '*')} title="Italic">I</button>
		<button type="button" onclick={() => wrap('~~', '~~')} title="Strikethrough">S</button>
		<div class="sep"></div>
		<button type="button" onclick={() => prefixLine('## ')} title="Heading">H</button>
		<button type="button" onclick={() => prefixLine('- ')} title="Bullet list">•</button>
		<button type="button" onclick={() => prefixLine('1. ')} title="Numbered list">1.</button>
		<button type="button" onclick={() => wrap('[', '](url)')} title="Link">🔗</button>
		<div class="spacer"></div>
		<button type="button" class:active={mode === 'write'} onclick={() => (mode = 'write')}>Write</button>
		<button type="button" class:active={mode === 'preview'} onclick={() => (mode = 'preview')}>Preview</button>
	</div>

	{#if mode === 'write'}
		<textarea bind:value={draft.body} bind:this={textareaEl} spellcheck="true"></textarea>
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<div class="preview doc-body">{@html previewHtml}</div>
	{/if}

	<label class="fmt-flag"><input type="checkbox" bind:checked={draft.needs_formatting} /> needs formatting</label>

	<TagEditor tags={draft.tags} onChange={(t) => (draft.tags = t)} />

	<div class="actions">
		<button class="cancel" onclick={onCancel} disabled={saving}>cancel</button>
		<button class="save" onclick={save} disabled={saving}>{saving ? 'saving…' : 'save'}</button>
	</div>
</div>

<style>
	/* Match HomeEditor.svelte toolbar/textarea styling (var(--ui-rgb), var(--clr-text), var(--font-ui)). */
	.doc-editor { display: flex; flex-direction: column; }
	.toolbar { display: flex; align-items: center; gap: 0.25rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
	.toolbar button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.22); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.7rem; padding: 0.15rem 0.45rem; cursor: pointer; }
	.toolbar button.active { background: rgba(var(--ui-rgb), 0.14); border-color: var(--clr-text); }
	.toolbar .italic { font-style: italic; }
	.toolbar .sep { width: 1px; height: 1rem; background: rgba(var(--ui-rgb), 0.25); margin: 0 0.25rem; }
	.toolbar .spacer { flex: 1; }
	textarea { min-height: 50vh; resize: vertical; background: rgba(var(--ui-rgb), 0.05);
		border: 1px solid rgba(var(--ui-rgb), 0.22); color: var(--clr-text);
		font-family: var(--font-prose); font-size: 0.95rem; line-height: 1.8; padding: 1rem; }
	.preview { min-height: 50vh; }
	.fmt-flag { margin-top: 0.75rem; font-family: var(--font-ui); font-size: 0.72rem; color: var(--clr-text); display: flex; gap: 0.4rem; align-items: center; }
	.actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
	.actions button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.3); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; padding: 0.3rem 0.8rem; cursor: pointer; }
	.actions .save { border-color: var(--clr-text); }
</style>
```

- [ ] **Step 3: Verify**

Run: `npm run check` → 0 errors. `npm run build` → succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/library/DocEditor.svelte src/lib/components/library/TagEditor.svelte src/lib/library/libraryState.svelte.ts
git commit -m "feat(library): DocEditor (toolbar + write/preview) and TagEditor"
```

---

## Task 9: `VersionsPanel`, Info⇄Versions tab, and `DocReader` integration

**Repo:** `~/Projects/cwcorella-git.github.io`

**Files:**
- Create: `src/lib/components/library/VersionsPanel.svelte`
- Modify: `src/lib/components/library/DocInfoPanel.svelte` (add `versions` tab + a `mode`/callbacks; render `VersionsPanel` when active)
- Modify: `src/lib/components/library/DocReader.svelte` (Edit button, mode switch to `DocEditor`, download button, toast on save/revert failure)
- Test: `tests/library.e2e.ts` (add an edit-flow spec, runs only against a local backend)

**Interfaces:**
- `VersionsPanel` props: `{ versions: DocVersion[]; onRestore: (version_id: number) => void; onRestoreOriginal: () => void; edited: boolean }`.
- `DocReader` uses `libraryState.editMode`, `startEdit/cancelEdit/saveEdit/loadVersions/versions/revert`, and `client.downloadMarkdown` (via `libraryClient`).

- [ ] **Step 1: Create `VersionsPanel.svelte`**

```svelte
<script lang="ts">
	import type { DocVersion } from '$lib/library/types';
	let { versions, onRestore, onRestoreOriginal, edited }: {
		versions: DocVersion[]; onRestore: (id: number) => void;
		onRestoreOriginal: () => void; edited: boolean;
	} = $props();
</script>

<div class="versions">
	{#if edited}
		<button class="restore-original" onclick={onRestoreOriginal}>restore original</button>
	{/if}
	{#if versions.length === 0}
		<p class="empty">no saved versions</p>
	{:else}
		<ul>
			{#each versions as v (v.version_id)}
				<li>
					<span class="when">{v.created_at}</span>
					<span class="vtitle">{v.title ?? '—'}</span>
					<button onclick={() => onRestore(v.version_id)}>restore</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.versions { font-family: var(--font-ui); font-size: 0.72rem; color: var(--clr-text); }
	.restore-original { background: none; border: 1px solid rgba(var(--ui-rgb), 0.3); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.68rem; padding: 0.25rem 0.6rem; cursor: pointer; margin-bottom: 0.75rem; }
	.versions ul { list-style: none; margin: 0; padding: 0; }
	.versions li { display: flex; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid rgba(var(--ui-rgb), 0.12); }
	.versions .when { opacity: 0.6; white-space: nowrap; }
	.versions .vtitle { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.versions button { background: none; border: 1px solid rgba(var(--ui-rgb), 0.25); color: var(--clr-text);
		font-family: var(--font-ui); font-size: 0.66rem; padding: 0.1rem 0.4rem; cursor: pointer; }
	.empty { opacity: 0.5; }
</style>
```

- [ ] **Step 2: Extend `DocInfoPanel.svelte` with a Versions tab**

Widen `activeTab` (line 16) to `let activeTab = $state<'toc' | 'info' | 'versions'>('toc');`. Add optional props: `versionsSlot?` — simplest is to pass render data through. Add to `Props` (line 6): `versions?: DocVersion[]; onRestore?: (id: number) => void; onRestoreOriginal?: () => void;` and import `VersionsPanel` + `DocVersion`. In the narrow `.tabs` bar (lines 122-139) and the desktop sidebar, add a third tab button "Versions" (only when `doc.edited || (versions && versions.length)`), and render `<VersionsPanel versions={versions ?? []} onRestore={onRestore} onRestoreOriginal={onRestoreOriginal} edited={!!doc.edited} />` when `activeTab === 'versions'`. Preserve the existing 900px desktop/narrow split — introduce a small tab bar in the desktop `.sidebar` mirroring the narrow `.tabs`/`.tab.selected` CSS (lines 304-323).

- [ ] **Step 3: Integrate into `DocReader.svelte`**

Add imports: `import DocEditor from './DocEditor.svelte';`, `import { libraryState, libraryClient } from '$lib/library/libraryState.svelte';`, `import { toast } from '$lib/admin/toast.svelte';`, `import type { EditDraft } from '$lib/library/editLogic';`.

In the header (`overlay-header`, lines 105-122), add an **Edit** button (visible when a doc is open and not already editing) beside the decide-group:
```svelte
{#if libraryState.openDoc && !libraryState.editMode}
	<button class="edit-btn" onclick={() => { libraryState.startEdit(); libraryState.loadVersions(); }}>edit</button>
{/if}
```
In the prose column (lines 139-149), branch on edit mode:
```svelte
{#if libraryState.editMode}
	<DocEditor doc={doc} onCancel={() => libraryState.cancelEdit()} onSave={async (draft: EditDraft) => {
		try { await libraryState.saveEdit(draft); toast.success('saved'); libraryState.loadVersions(); }
		catch (e) { toast.error('save failed — your text is kept'); }
	}} />
{:else}
	<h2 class="doc-heading">{doc.title}</h2>
	<div class="doc-body" bind:this={bodyEl}>…existing render…</div>
{/if}
```
Pass versions + restore callbacks into `DocInfoPanel`:
```svelte
<DocInfoPanel {toc} {activeAnchor} {doc} onJump={handleJump}
	versions={libraryState.versions}
	onRestore={async (id) => { try { await libraryState.revert({ version_id: id }); toast.success('restored'); libraryState.loadVersions(); } catch { toast.error('restore failed'); } }}
	onRestoreOriginal={async () => { try { await libraryState.revert({ original: true }); toast.success('restored original'); libraryState.loadVersions(); } catch { toast.error('restore failed'); } }} />
```
Add a `↓ .md` download button (sidebar or header):
```svelte
<button class="dl-btn" onclick={async () => {
	try {
		const md = await libraryClient.downloadMarkdown(doc.id);
		const blob = new Blob([md], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href = url; a.download = doc.slug + '.md'; a.click();
		URL.revokeObjectURL(url);
	} catch { toast.error('download failed'); }
}}>↓ .md</button>
```
Style `.edit-btn`/`.dl-btn` to match `.decide-btn` (lines 200-207). Guard the Escape handler (line 15): when `libraryState.editMode`, Escape should cancel edit rather than close the modal (prevents losing an in-progress edit).

**Feature-detect / graceful degradation:** because backend ships first, the endpoints exist by the time this deploys. If a save/version call still hits a 404/405 (old API), the catch branch toasts and keeps the edit buffer — no crash, reader still usable. This satisfies the spec's degradation requirement without a separate capability probe.

- [ ] **Step 4: Verify build + type**

Run: `npm run check` → 0 errors. `npm run build` → succeeds.

- [ ] **Step 5: e2e (local backend) — add to `tests/library.e2e.ts`**

Following the file's existing skip-if-`/health`-down pattern, add a spec that: opens a doc, clicks **edit**, types in the textarea, clicks **Preview** (asserts rendered HTML), clicks **save**, asserts the reader shows the edited body and an `edited` affordance, opens **Versions** and asserts one row, clicks **restore original**, asserts the body reverts. This runs only when a seeded local `library-api` is seeded per the file header (lines 10-21); it is skipped in CI without the backend. Document in the PR that this spec was run locally against a seeded backend.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/library/VersionsPanel.svelte src/lib/components/library/DocInfoPanel.svelte src/lib/components/library/DocReader.svelte tests/library.e2e.ts
git commit -m "feat(library): edit mode, versions panel, download in DocReader"
```

---

## Final verification (whole branch)

- Backend: `cd ~/Projects/library-api && pytest -q` → all green, including `test_edits_*`.
- Frontend: `cd ~/Projects/cwcorella-git.github.io && npm test && npm run check && npm run build` → all green.
- Deploy order: backend first (`ssh -A ssh.veritablegames.com 'cd /data/library-api && git pull origin main && sudo systemctl restart library-api'`), then push frontend (Cloudflare Pages + GitHub Pages via Actions).
- Manual smoke on `https://cwcorella.com/library` (admin): edit a `user` doc, save, confirm search finds the new text, download the `.md`, restore original.

## Known v1 limitations (recorded, not defects)

- Coined tags on edited docs do not appear in `/facets` counts; overlay `needs_formatting`/tags do not drive list filters (filters read base values).
- The `migrate.py` reapply glue (Task 5) is exercised only on the workstation.
- Bulk/collection/whole-corpus `.md` export is a separate follow-up spec.
