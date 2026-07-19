# Library visibility axis — design

**Date:** 2026-07-18
**Status:** approved, not yet implemented
**Scope:** `library-api` (backend + publish CLI) and this repo's `/library` frontend.
**Explicitly out of scope:** creating new documents, and the VG-side tab function. Both
depend on this spec and get their own.

## Problem

`/library` conflates two independent questions. The curation decision (`keep`/`hide`/
`delete`) currently drives VG production visibility through `publish.py`
(`keep`→public, `hide`→private). That is wrong: **keep is about retention, not
publication.** A document can be worth keeping and still not be for the public.

Three defects follow from the conflation:

1. **`visibility` is write-once at ingest.** `library.db.documents` has a
   `visibility TEXT NOT NULL DEFAULT 'private'` column, indexed, populated by
   `loader.py` — but no API can change it. It is filterable and unmaintainable.
2. **`sources.py` fabricates it.** Line 23 derives `visibility` from the real
   `is_public` for the `user` source, but lines 34/45/55 hard-code
   `visibility="private"` for anarchist, marxist, and youtube regardless of their
   actual VG state. The column lies for 97% of the corpus.
3. **`needs_formatting` is only settable from inside edit mode.** Marking a document
   clean requires opening the editor and saving a body revision, which also cuts a
   version snapshot and reindexes FTS — for a boolean that has nothing to do with text.

A prior measurement recorded in CLAUDE.md — "`public` is exactly the `user` count, so
visibility is nearly a restatement of source" — is an **artifact of defects 1 and 2
plus VG having shipped all-public**, not a property of the data. It should not be cited
as a reason to trim the axis.

## The model

Two axes, each answering a different question:

| Axis | Values | Question it answers | Home |
|---|---|---|---|
| `decision` | keep / hide / delete / undecided | Does this go on the site at all? | `curation.db` |
| `visibility` | public / private | Once there, can the world see it? | `library.db` + `edits.db` overlay |

**They are conjunctive, not independent. The publication rule is:**

```
is_public = (decision == 'keep') AND (visibility == 'public')
```

`keep` is what puts a document on the site; `visibility` then decides whether it is
publicly visible there or admin-only. Full behavior:

| decision | visibility | VG result |
|---|---|---|
| keep | public | publicly visible |
| keep | private | present, `is_public=false` — admin-only via the tab function |
| undecided | either | not published (`is_public=false`) |
| hide | either | not published (`is_public=false`) |
| delete | — | `purge.py` removes it entirely. Unchanged. |

**Why `keep` is required and not merely advisory:** the failure directions are asymmetric.
Publishing a document that was never curated exposes private material; failing to publish
a curated one is a missing click. So publication demands an affirmative `keep` — an
untouched document is never public, whatever its visibility flag says.

`hide` therefore does not need to "force" private as an override. It simply is not
`keep`, so it is not published. The two axes stay conceptually clean while the
conjunction provides the safety.

### Where the edit lives

**`visibility` becomes an overlay field in `edits.db`,** exactly as `needs_formatting`
already is. Effective value is `overlay.visibility ?? library.visibility`, resolved by
the existing `apply_overlay_fields` helper.

This preserves the standing discipline: `library.db` is read-mostly (ingest, plus the
one deliberate `documents_fts` reindex on body save), and every user-originated change
lives in the overlay. No new store, and the migration-exempt status of `edits.db` still
holds.

**Flags get their own table inside `edits.db`, not a column on `edits`.**
Amendment made during planning, from a constraint the design missed: `edits.edits`
declares `body TEXT NOT NULL`, so writing a flag through `save_edit` would require
materializing the document body into the overlay. Marking flags across the corpus would
then duplicate a large fraction of 2.7GB of bodies to store two booleans.

```sql
CREATE TABLE IF NOT EXISTS edit_flags (
    doc_id           INTEGER PRIMARY KEY,
    visibility       TEXT,      -- 'public' | 'private' | NULL = no override
    needs_formatting INTEGER,   -- 0 | 1 | NULL = no override
    updated_at       TEXT NOT NULL
);
```

Both columns are nullable, and NULL means "no override" — the same convention
`edits.needs_formatting` already uses. A flag write touches only this table, so it is
O(1) regardless of body size and independent of whether the document has ever been
edited.

`needs_formatting` now has two possible overrides (`edits` and `edit_flags`). Precedence
is **`edit_flags` wins**, because it is the newer and more specific write path, and
because after this change the editor no longer writes the field at all. Existing
`edits.needs_formatting` values remain readable as a lower-precedence fallback rather
than being migrated.

## API

**One new endpoint:** `PUT /documents/{id}/flags`, body `{ visibility?, needs_formatting? }`.
Both fields optional; at least one required. Writes to the `edits.db` overlay.

It sits beside `PUT /documents/{id}/body` and reuses the overlay-write path, with two
deliberate differences:

- **No version snapshot.** Flags are not content; a flag flip is not a revision.
- **No `documents_fts` write.** Neither flag affects text. The single deliberate
  `library.db` write stays confined to body saves, where it already is.

`visibility` accepts exactly `"public"` or `"private"`; anything else is a 422.

## Frontend

**Reader header** gains two toggles beside the existing keep/hide/delete group: a
public/private toggle and a needs-formatting/clean mark. Both use the optimistic-write
pattern established by `setDecision`, including its failure behavior: a failed write
**toasts and rolls back**, and must not call `_mapError` — page-level error state
unmounts the controls.

**Keyboard**, consistent with the triage keys shipped 2026-07-18:

- `P` — toggle public/private
- `F` — toggle needs-formatting/clean

Both route through `resolveKey` in `src/lib/library/keyLogic.ts`, inheriting the
auto-repeat guard and the load-window gating (`hasDoc && status === 'idle'`) that
prevent a mark from landing on a stale document.

**Neither auto-advances.** Decisions advance because triage is one-pass; marking a
document clean or public is something done *while reading it*, often alongside a
decision, so advancing would fight the user.

This brings the reader to five marking keys (`Delete`/`K`/`H`/`P`/`F`). That is the
practical ceiling for unmodified single keys; a sixth would need a modifier scheme.

**`DocEditor` loses the `needs_formatting` checkbox.** `EditDraft` drops the field and
`draftChanged` stops considering it. A state flag does not belong inside a text editor,
and routing it through a body save was cutting spurious version snapshots.

**Filtering does NOT see the marks. Corrected 2026-07-18 after the whole-branch review
found the original claim here was false.**

`StateControl` filters on `visibility` and `needs_formatting`, and those controls keep
working — but `query.py` filters and facets against `library.db.documents` directly. The
overlay is applied only to rows that have *already been selected*. So a document marked
public displays "public" in its row while being excluded by `visibility=public`, and the
facet count never moves.

The practical consequence, which matters for the migration: after every document is
forced private, the visibility facet reads 100% private permanently, and **there is no
way to review the set of documents you have marked public before running the flip.** The
marks are correct — `publish.py` resolves them through the overlay — but they are
invisible to the tools you would use to check your work.

Making filters and facets overlay-aware is a real piece of work: it means either joining
the attached overlay into the filter and count queries, or maintaining a derived index.
It is **out of scope here and tracked as a follow-up.** Until it lands, verify a marking
session with `publish.py --dry-run`, which reports exactly what would be published.

## Migration

**`library.db`:** `UPDATE documents SET visibility='private' WHERE visibility='public'`,
plus clearing any overlay `visibility` rows. Only the 2,521 `user` docs are affected —
the other three sources are already `private` (dishonestly, but with the right value).

**`sources.py`:** read the real `is_public` for all four sources instead of hard-coding
`"private"` for three. This does not change current values; it stops the column lying on
the next ingest.

**VG:** `bootstrap.py` already does the mass `is_public=false` flip with a reversible
snapshot to `/data/library-purged/bootstrap-snapshot.jsonl.gz`. No new code.

**`publish.py`:** `publish_decisions()` currently groups by `keep`/`hide` via
`curation_join.grouped_source_ids`, setting `keep`→public and `hide`→private. It changes
to apply the conjunctive rule: `is_public=true` for documents that are **both** `keep`
**and** effective-visibility `public`; `is_public=false` for everything else it touches.
It must resolve visibility through the overlay, not read `library.db` directly.

The safety property to preserve: a document with no curation row is never published,
regardless of its visibility. Publication requires an affirmative `keep`.

This is small precisely because the pipeline was built but never initialized.

### Order of operations — corrected

The previously recorded order was *curate keeps first, then bootstrap→publish
back-to-back*, so VG never visibly empties. That ordering still holds, but its
**reason changes and it is no longer sufficient**: `keep` is now necessary but not
sufficient for publication, so curating keeps alone leaves the public library empty.

The order is: **curate keeps AND mark public docs first — both — then
bootstrap→publish back-to-back.** A document needs both marks to survive the flip.

### Consequence, stated plainly

**Full blackout, chosen deliberately** (2026-07-18): no seeding. Every document starts
private and comes back one mark at a time. All 2,521 currently-public user docs go dark.

And under the conjunctive rule the recovery is **two marks per document**, not one — a
doc must be both `keep` and `public`. Curation state measured 2026-07-19 is 114 delete /
0 keep / 0 hide, so at the moment of the flip **zero documents qualify for publication**.
(This spec originally recorded 15 delete, measured 2026-07-18; deletes have accumulated
since. The count that matters is `keep`, which is still zero.) Running
bootstrap→publish today takes VG's public library to zero and leaves it there until that
work is done.

This is intended. `bootstrap.py --restore --confirm` makes it reversible from the
snapshot. But it is a deliberate blackout with real manual work to recover from, not a
background change — and it is the reason the migration and the VG flip are manual,
user-run steps rather than part of any deploy.

## Testing

**Backend** (`library-api`, pytest):
- `PUT /documents/{id}/flags` writes each field independently; omitted fields untouched.
- Rejects a `visibility` value outside `{public, private}` with 422.
- Cuts **no** version row and performs **no** `documents_fts` write — assert both
  directly, since these are the invariants the endpoint exists to preserve.
- Effective visibility resolves overlay-over-library, and a cleared overlay falls back.
- `publish_decisions` applies the conjunctive rule. Assert every cell of the table in
  "The model", and assert the safety property explicitly: **an undecided+public document
  must end with `is_public=false`.** That is the case that exposes uncurated material if
  the rule is ever weakened to visibility alone.

**Frontend** (Vitest):
- `resolveKey` maps `P` and `F` to their toggles, marks them non-advancing, and applies
  the existing repeat and load-window guards to them.
- A failed flags write leaves `status === 'ready'` and toasts (the `setDecision`
  regression, re-asserted for the new path).
- `draftChanged` ignores `needs_formatting` once the field is removed.

**Not covered, deliberately:** the live API CORS-blocks localhost, so the flags round-trip
cannot be verified end-to-end locally. Mocks resolve instantly and cannot falsify claims
about latency or failure. Manual confirmation happens after deploy.

## Ship order

`library-api` and this repo both change, so the standing rule applies: **the frontend
must tolerate an un-upgraded API.** The reader's flag toggles must degrade to a toast on
404 rather than assuming `/documents/{id}/flags` exists.

The migration and the VG flip are **manual, user-run steps** after both are deployed —
not part of either deploy.

## Out of scope, and why

- **Creating new documents.** No `POST /documents` exists; a new document has no base
  row and so does not fit the overlay model at all. It needs its own design and depends
  on this one.
- **The VG tab function.** Lives in `veritable-games-main`. This spec makes
  `keep + private` expressible; surfacing it is that repo's concern.
- **Editing other metadata** (source, category, date, language). Those are ingest facts,
  not curation state.
- **The missing title input.** `EditDraft.title`, `draftChanged`, `draftToPayload`, and
  the backend's `EditBody.title` all handle title end-to-end, but `DocEditor` renders no
  input for it — so title is unreachable from the UI. That is an oversight in the
  document-editing feature, not part of this axis, and it is a ~10-line frontend-only
  fix. Ship it separately rather than bundling it into a change that needs an API deploy
  and a manual migration.
