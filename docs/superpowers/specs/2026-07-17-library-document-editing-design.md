# Library document editing — design

**Date:** 2026-07-17
**Status:** approved (design), pending plan
**Repos:** `library-api` (backend, source of truth for edits) **and** `cwcorella-git.github.io` (frontend, admin-only reader)
**Follows:** the `/library` subsystem — see this repo's `CLAUDE.md` "Library subsystem" and `library-api`'s `curation.py` precedent.

## Problem

The `/library` reader (`DocReader.svelte`) is read-only. The only mutation the
whole page can perform is a curation decision (keep/hide/delete). There is no way
to edit a document's body or metadata, and the backend is built to prevent it:
`library.db` is opened `PRAGMA query_only=ON`, bodies are files on disk, `documents_fts`
has zero triggers and is only ever written by the offline loader, and the sole writable
store is a separate `curation.db` holding decisions.

We want to edit documents — body markdown, title, tags, and the `needs_formatting`
flag — with edits that are **permanent and real**: reflected in the reader, in search,
and in a downloaded `.md`, and **not reverted by a corpus re-sync**.

### The re-sync stomp (why in-place editing is impossible)

Traced in `library-api`: `scripts/migrate` runs manually (no cron/timer). For every
document in a source it **unconditionally overwrites** `bodies/<source>/<slug>.md` with
freshly-normalized source text and upserts the row (`ON CONFLICT DO UPDATE`), replacing
`word_count`/`char_count`/`updated_at`/etc. There is no checksum, no `updated_at`
comparison, no "locally edited" flag. An edit written into the body file or the
`documents` row is silently lost the next time that source is re-synced. Rare (manual),
per-source — but a silent wipe nonetheless.

**Document identity across re-sync:** `id` is stable (table is never dropped; upsert is
update-in-place on the `UNIQUE(source, source_id)` key, which preserves `id`). The one
exception is purge-then-reingest via `vg_purge.py`, which can reassign an `id`.
`(source, source_id)` is immutable by construction and is the durable key.

## Design

### 1. `edits.db` — a migration-exempt overlay (the core)

A new SQLite store on the workstation, alongside `curation.db`, **which the loader never
opens** — exactly the pattern that lets `curation.db` survive re-sync ("so a re-sync can
never stomp decisions"). It is the **source of truth** for every edit. `library.db` stays
the read-only mirror.

Keyed by `doc_id`, with `(source, source_id)` stored alongside for durable re-attachment.

```sql
-- edits.db
CREATE TABLE edits (
  doc_id INTEGER PRIMARY KEY,      -- documents.id
  source TEXT NOT NULL,            -- durable identity, half 1
  source_id TEXT NOT NULL,         -- durable identity, half 2
  body TEXT NOT NULL,              -- edited markdown (overrides the file on disk)
  title TEXT,                      -- NULL = keep base title
  needs_formatting INTEGER,        -- NULL = keep base flag; else 0/1
  word_count INTEGER,              -- recomputed on save (kept off library.db)
  char_count INTEGER,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX edits_srcid ON edits(source, source_id);

CREATE TABLE edit_tags (          -- full tag set when a doc is overridden
  doc_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (doc_id, tag)
);

CREATE TABLE edit_versions (      -- append-only history; NEVER overwritten
  version_id INTEGER PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  title TEXT,
  tags TEXT NOT NULL,             -- JSON array snapshot
  needs_formatting INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX edit_versions_doc ON edit_versions(doc_id, created_at);
```

Presence of an `edits` row = "this doc is overridden." Deleting the row (+ its
`edit_tags`) = revert to original. `edit_versions` is retained regardless.

### 2. Read-merge

`GET /documents/{id}` and the list query `LEFT JOIN edits` (via the attached `edits.db`,
same mechanism as the `curation.db` attach) and serve overlay values when a row exists:

- `body`: overlay `body` if a row exists, else the file on disk (existing path).
- `title`, `needs_formatting`, `word_count`, `char_count`: `COALESCE(overlay, base)`.
- `tags`: overlay `edit_tags` set **replaces** base tags when the doc is overridden;
  else base tags (existing join).

**The response shape is unchanged** — same field names, different values. A not-yet-upgraded
frontend keeps working (no repeat of the source-attributed-facet duplicate-key break). This
is why the reader, search results, and the `.md` download all reflect the edit: they read
through this one merge.

### 3. Search kept in sync — single-index, loader re-apply (DECISION)

**Chosen** over the alternative (a second FTS index merged into the seek-paginated search),
because that alternative rewrites the most bug-prone code in the system (cursor/seek
pagination, the `filtersToParams` invariant). We accept a narrow, deliberate exception to
"`library.db` is never written by the API":

- The save endpoint upserts the edited text into the **existing** `documents_fts`
  (rowid = `documents.id`, delete-then-insert like `store.upsert_fts`) through **one
  dedicated writable connection** used only for this. Search stays a **single index** — the
  fragile pagination code is never touched.
- A re-sync reverts an edited doc's FTS row to original text, so the loader gains a
  post-pass **`reapply_overlays_to_fts()`**: after a load, walk `edits.db` and re-index each
  edited doc from its overlay body. One added step in a manual, ad-hoc process.

**Tradeoff, stated plainly:** the only thing the API writes into `library.db` is the
**derived, rebuildable** FTS index for edited docs — never source data, which lives in
`edits.db`. Source-of-truth permanence is unaffected; only search freshness depends on the
re-apply pass, and search is rebuildable by definition.

Word/char counts are stored in the `edits` overlay (not `library.db`), so the only
`library.db` write is the FTS upsert.

### 4. Endpoints (all behind the existing bearer token, `require_token`)

| Method | Path | Does |
|---|---|---|
| PUT | `/documents/{id}/body` | Save edit: body + title + needs_formatting + tags. Writes `edits` + `edit_tags`, appends `edit_versions`, upserts `documents_fts`. Returns the merged document. |
| GET | `/documents/{id}/versions` | List `edit_versions` for the doc (newest first): `version_id`, `created_at`, title. |
| POST | `/documents/{id}/revert` | Body `{version_id}` restores that version (writes overlay + appends a new version); body `{original: true}` deletes the overlay (+ `edit_tags`) and re-indexes FTS from the on-disk file. |
| GET | `/documents/{id}/download` | `text/markdown` of the current (edited-or-original) body, `Content-Disposition: attachment`. |

Tag autocomplete reuses the existing `GET /tags?q=`. No new tag endpoint.

**Auth:** writes carry the same bearer token as reads — no new secret. The `/library` page
is already fully admin-gated, so no new exposure. (Noted: no privilege separation exists;
this feature does not introduce it.)

### 5. Frontend — Layout C (approved mockup)

Within `DocReader.svelte`, an **Edit** button in the header enters edit mode:

- **Prose column becomes the editor.** A markdown format toolbar (bold, italic,
  strikethrough, heading, bullet list, numbered list, link) built on the same selection-wrap
  helpers as `HomeEditor.svelte`, plus a **Write ⇄ Preview** toggle. Preview reuses
  `renderMarkdown` (already imported).
- **Sidebar switches Info ⇄ Versions.** Versions is a timestamped list (from
  `/documents/{id}/versions`) with **restore** per row and a **restore original** action.
- **Tags at the column bottom** — chips with `×`; an input autocompletes against `/tags` and
  accepts free text to coin a new tag (both existing and new allowed).
- **`needs_formatting`** — a manual checkbox; saving a body edit never changes it on its own.
- **Explicit Save** in the header (Save + Cancel replace nothing permanent — decision group
  stays reachable). `↓ .md` download button in the sidebar.

New frontend pieces (kept small and focused, per house style):
- `api.ts`: `saveBody`, `getVersions`, `revert`, and a `downloadUrl(id)` helper (the generic
  `request()` already supports method/body).
- `libraryState.svelte.ts`: edit-mode state, optimistic save with rollback (mirrors
  `setDecision`), version list, dirty tracking.
- `DocEditor.svelte` (the editing prose column), `VersionsPanel.svelte` (sidebar mode),
  `TagEditor.svelte` (chips + autocomplete). `DocReader` gains the mode switch and header
  buttons; `DocInfoPanel` gains the Info/Versions toggle host.

### 6. Ship order & degradation

**API first**, then frontend — the opposite of the usual "frontend first" rule, and
deliberately so: these endpoints are **net-new additive**, not a breaking change, and the
read-merge is shape-compatible. The frontend's edit affordance **feature-detects** (edit
button hidden/disabled if the endpoints 404), so a half-deployed state degrades to today's
read-only reader with no error. Backend deploy is the documented `ssh -A ssh.veritablegames.com`
path (workstation has no GitHub key of its own; LAN alias times out off-network).

## Error handling

- Save failure → toast, keep edit-mode buffer (no data loss), roll back optimistic state.
- Missing doc / bad version_id → 404, surfaced as a toast.
- Download of an unedited doc → serves the on-disk original (still valid).
- FTS write failure during save → the overlay write still commits (source of truth is
  safe); log and surface a non-fatal "saved; search index may lag" — search is rebuildable.
- Re-sync while an edit exists → overlay wins on read immediately; FTS re-freshes on the
  loader post-pass. No user-visible error.

## Testing

Backend (pytest against a temp `edits.db` + temp `library.db`, existing `conn` fixture style):
- Read-merge: overlay body/title/tags/needs_formatting override base; absent overlay = base.
- Save: writes `edits` + `edit_tags`, appends exactly one `edit_versions` row, upserts FTS
  (search finds new text, not old).
- Revert to version and to original (overlay row + `edit_tags` gone; FTS re-indexed from file).
- `reapply_overlays_to_fts()`: after simulating a re-sync (rewrite FTS to original), the
  pass restores edited text to the index.
- Tag replace-on-override semantics; download returns edited body.

Frontend (Vitest for pure logic; Playwright against **mocked** routes — mocks resolve
instantly, so the save/failure/latency paths are reasoned about directly, not just mocked):
- Edit-mode toggle, Write⇄Preview render, dirty-state guard on close.
- Tag add (existing + new) / remove; optimistic save + rollback on failure.
- Feature-detect hides edit when endpoints absent.

## Non-goals

- **Bulk / collection / whole-corpus `.md` export.** Per-doc download ships now; bulk export
  (streaming zip over up to 100k files) is its own follow-up spec.
- **Editing metadata beyond title / tags / needs_formatting** (author, date, visibility,
  language) — out of scope for v1.
- **Facet participation for coined tags.** Tags added to edited docs won't appear in
  `/facets` counts (facets aggregate `library.db`). Known v1 limitation, recorded.
- **Privilege separation on writes.** The single shared bearer token is unchanged.
- **Concurrent multi-editor conflict resolution.** Single admin; last-write-wins per save,
  with full version history as the safety net.

## Constraints

- Svelte 5 runes only; no new frontend dependencies. Encrypt/crypto conventions untouched
  (library is not GitHub-backed — edits go to the API, not the write queue).
- `edits.db` is migration-exempt: the loader/migrator must never open or write it.
- The only `library.db` write introduced is the derived `documents_fts` upsert for edited
  docs. No source column of `documents` is ever written by the API.
- Read-merge must keep `/documents` response shape identical (field names unchanged).
- `filtersToParams()` and the seek-pagination path are **not** modified by this work.
