# Library — open follow-ups

**Date:** 2026-07-17
**Status:** open; none blocking
**Why this file exists:** these surfaced during the toolbar work but were out of its
scope. They were recorded in `.superpowers/sdd/progress.md`, which is **gitignored
scratch** — `git clean -fdx` destroys it. Anything that must outlive the session lives
here instead.

---

## 1. `JumpRail` overflows the viewport at 400px

**Severity:** minor — cosmetic, admin-only page.
**Pre-existing.** Not introduced by the toolbar work; found while verifying narrow mode.

At 400px the page scrolls horizontally by ~28px. `JumpRail.svelte`'s narrow-mode `.rail`
switches to `flex-direction: row; overflow-x: auto`, but the base rule keeps
`flex-shrink: 0` and its container row in `DocList.svelte` has no `min-width: 0`. A
`flex-shrink: 0` item sized by its (wide) content forces its flex container — and so the
page — wider than the viewport, even though the item's own `overflow-x: auto` would
otherwise contain it.

**Fix shape:** `min-width: 0` on the containing flex row in `DocList.svelte`, so the rail
is allowed to shrink and scroll within itself. Verify at 400px that
`document.documentElement.scrollWidth === clientWidth`.

---

## 2. `en` / `en-US` / `en-GB` are three separate language buckets

**Severity:** minor — a data-quality issue surfacing as UI noise.

The language dropdown lists 33 languages, three of which are English: `en` (88,506),
`en-US` (1,218), `en-GB` (854). They are distinct facet buckets, so they filter to
disjoint sets.

**Deliberately not fixed in the UI.** Merging them at display time would make the count
lie about what clicking actually filters to. If this is worth fixing, normalise
**upstream** — either at ingest in `library-api`'s `sources.py`, or as a one-off migration
folding `en-*` into `en`. That is a corpus decision, not a toolbar one.

---

## 3. The corpus cascade earns less than its design assumed

**Severity:** informational — a design-value note, not a defect.

Recorded here because it is easy to forget and would otherwise justify further investment
in the cascade. Measured 2026-07-17:

| source | docs | categories |
|---|---:|---:|
| youtube | 60,726 (60%) | 1 — named `transcript` |
| anarchist | 24,594 | 26 |
| marxist | 12,576 | 8 |
| user | 2,521 | 0 |

Nesting only pays off for anarchist + marxist — **37% of the corpus**. For the rest it is a
source list where one entry does not expand and another expands to a single meaningless
bucket (`transcript` is a document type, not a category). The cascade still earns its place:
it makes the zero-result source×collection pairs unreachable and beats a flat 35-item list
mixing three sources. But it is not the centrepiece the original design claimed.

**If youtube ever gets real categories, revisit.** Until then, do not invest further in
cascade affordances.

---

## 4. `visibility` is nearly a restatement of `source`

**Severity:** informational.

`public` = 2,521, which is **exactly** the `user` source count — because `sources.py` marks
only user-library rows public. So the State dropdown's Visibility group is close to asking
"is this the user corpus?", which Corpus already answers. `needs_formatting` isolates 317
documents (0.3%).

Of the three State groups, **`decision` is the one that earns its place** — it is the axis
being actively worked. If State ever needs trimming, cut Visibility first.

---

## Closed during this work — recorded so it is not re-reported

- **`/anchor-offset` did not accept `decision`** while `/documents` did, so filtering by
  curation decision silently desynced the jump rail from the list. Found by the backend's
  whole-branch review, **fixed in `library-api` `91efad7`** (SP2 backend).
- **`mergeCollectionBuckets`** (frontend `e11af06`) guarded the flat collections dropdown
  against duplicate `{#each}` keys when facet buckets became `(source, name)`-keyed. That
  dropdown no longer exists and the cascade keys within a source, so the collision is
  structurally unreachable. **Deleted.** It was always interim; its own comment said so.

---

## Document-editing follow-ups (2026-07-17, non-blocking)

Surfaced by task/whole-branch reviews during the document-editing feature
(`edits.db` overlay). All Minor; recorded here because `.superpowers/sdd` is
gitignored scratch.

1. **Edit-endpoint tests leak FTS writes into the session-scoped `library.db`.**
   `tests/test_api_edits.py` / `test_edits_fts.py` reindex `documents_fts` on the
   shared seeded DB; only each file's LAST test restores original text via a
   trailing revert. Safe under deterministic, non-parallel pytest ordering, but a
   future `pytest-randomly` or `-p xdist` would silently corrupt `test_api_query.py`.
   Fix shape: a function-scoped fixture that snapshots/restores `documents_fts`
   (or a per-test DB copy) for the edit-endpoint tests. (library-api repo.)

2. **`test_edits_readmerge_unit` list tests duplicate `app.py`'s merge loop** rather
   than importing `list_documents`. The shared `apply_overlay_fields`/`overlays_for_ids`
   helpers are imported (the real invariant carriers), but the loop shape is hand-synced.
   Optional: extract the list-merge loop into a testable function in `edits.py`.

3. **`downloadMarkdown` bypasses `request()`** (`src/lib/library/api.ts`), so a network
   failure throws a raw error instead of `OfflineError` like every other client method.
   The UI catches broadly and toasts "download failed", so no unhandled rejection —
   cosmetic error-type inconsistency. Also: the `getVersions` client test asserts the
   return value only, not URL/method.

4. **`EditDraft.title` is typed `string`** (`src/lib/library/editLogic.ts`) but a base
   doc can have `title === null`; `docToDraft` passes it through. No wire break
   (`EditBody.title` is `str | None`, and the backend only overrides title when truthy),
   only a type inaccuracy. Consider typing it `string | null` (not `?? ''`, which would
   make an untouched null title read as "changed").

5. **Narrow-sheet `DocInfoPanel` can strand on the Versions view.** The narrow content
   switch renders `VersionsPanel` whenever `activeTab === 'versions'`, independent of
   `showVersions` (which gates the tab *button*). After a restore-original round-trip
   `showVersions` flips false but `activeTab` stays `'versions'`, leaving a stale/empty
   Versions view with no tab selected. Narrow-viewport only, no crash. Fix: reset
   `activeTab` to `'info'` when `showVersions` becomes false.

---

## Keyboard-triage follow-ups (2026-07-18, non-blocking)

Surfaced by task/whole-branch reviews during the reader keyboard-triage feature
(merged `78b5b4b`). All Minor; recorded here because `.superpowers/sdd` is
gitignored scratch.

1. **`isTextTarget`'s `SELECT` branch is untested**, as is the fall-through to `null`
   for digit/function keys (`src/lib/library/keyLogic.ts`). Both are obviously correct
   by inspection; noted only so the gap is known.

2. **The auto-repeat gate depends on statement ordering.** In `resolveKey`, "navigation
   may repeat, decisions may not" falls out of the `e.repeat` check sitting *below* the
   arrow-key checks rather than from an explicit `action.kind === 'decide'` condition.
   Tests pin it in both directions, so a reordering breaks a test rather than silently
   changing behavior — but the ordering is load-bearing and commented as such.

3. **An `AuthError` during curation no longer flips the page to the `auth` state.** It
   surfaces as a generic "could not save decision" toast, so an expired token gives no
   direct signal to re-authenticate. This is the deliberate trade for not unmounting the
   UI mid-triage, and it matches what `saveEdit` has done since `2889d58`. The next
   document-window fetch still calls `_mapError` and reaches `auth`, so it is a delay,
   not a dead end. If it bites in practice, special-case `AuthError` in `setDecision` —
   do **not** restore the blanket `_mapError` call.

### Closed during this work — recorded so it is not re-reported

- **A decision could be applied to the previous document while stamping the new row.**
  `openDocByIndex` sets `_openIndex` synchronously, but `_openDoc` is not replaced until
  `getDocument` resolves — the old document stays mounted for the whole load window
  (stale-while-revalidate). A keypress in that window wrote the *old* doc's id against the
  *new* index, and the optimistic `_rowCache.set` had no id guard (unlike the rollback).
  Silent curation corruption, invisible in the UI. Fixed in two independent places
  (`0f8b1ea`): `resolveKey` gates nav/decide on a loaded **and** idle reader, and the
  optimistic cache write now checks `cached.id === doc.id`.
- **The same hole on the uncached-row path.** `openDocByIndex` awaited `listDocuments`
  while `_openDocStatus` was still `'idle'`, so the gate did not engage when stepping past
  a window edge and an arrow press could silently skip a document. Fixed in `2589af4` by
  entering `'loading'` before that fetch. Pre-dated the keyboard path (prev/next buttons
  hit it too), but arrow-key triage at window edges is how it gets reached.
- **Held decision keys fired ~30 curations/sec** and, at the last document or when
  `_openIndex` was null, repeatedly *toggled* the same document with out-of-order tunnel
  responses. Fixed in `0f8b1ea`.
- **A false claim about `loadCurationStats`.** A review asserted that its position inside
  `setDecision`'s `try` causes a successful write to roll back with a misleading toast.
  It cannot: `loadCurationStats` swallows all its errors internally and never rejects.
  Recorded here because the claim is plausible enough to be re-derived.

### Note for whoever touches this next

The gating logic lives in `src/lib/library/keyLogic.ts`, **not** in `DocReader.svelte`.
That is deliberate: the load-window guard above is the difference between correct triage
and silent data corruption, and in the component it had no test harness. Keep it pure.

---

## Visibility-axis follow-ups (2026-07-18, non-blocking)

From task and whole-branch reviews of the visibility-axis work (backend
`visibility-axis`, frontend `visibility-axis-ui`). Recorded here because
`.superpowers/sdd` is gitignored scratch.

### 1. Filters and facets ignore the overlay — the marks are not reviewable

**The most consequential item here.** `query.py` filters and facets against
`library.db.documents` directly; the overlay is applied only to already-selected rows.
So a document marked public shows "public" in its row but is excluded by
`visibility=public`, and the facet count never moves.

After the migration forces everything private, the visibility facet reads 100% private
permanently, and there is no in-UI way to review what you have marked before running
bootstrap→publish. The marks themselves are correct — `publish.py` resolves them through
the overlay — they are just invisible to the review tools.

**Workaround until fixed:** `publish.py --dry-run` reports exactly what would be
published. **Fix shape:** join the attached overlay into the filter and count queries, or
maintain a derived index. Not trivial: `/facets` is six aggregates over 100k docs.

### 2. Smaller items

- `_effective_visibility` (`vg_visibility.py`) tests the override for truthiness while
  `apply_flag_fields` (`edits.py`) uses `is not None`. They differ only for `""`, which
  the `Literal` makes unreachable — but these are two halves of one rule and should read
  identically.
- `edit_flags`-wins precedence for `needs_formatting` is tested on the detail path only;
  the list path applies it untested.
- `.mark-group` renders when no document is open, showing a stale "private"/"clean".
  Matches the existing `.decide-group` pattern, so pre-existing rather than new.
- Mark buttons derive their accessible name from state *and* carry `aria-pressed`
  ("public, pressed"), where the decide buttons use static names. Slightly ambiguous.
- No negative test for `needs_formatting` outside `{0,1}` (relies on `Literal[0,1]`);
  no test for a combined `visibility`+`needs_formatting` write in one call.
- `shape_user_row`'s own `is_public` handling remains untested (pre-existing).
- `_version++` in `_setFlags` bumps only inside the cache-hit branch, where `setDecision`
  bumps whenever `idx !== null`. Arguably more correct; just inconsistent.
- The SQLite variable limit is **not reproducible on this machine** — Ubuntu's build
  raises `SQLITE_MAX_VARIABLE_NUMBER` to 250,000. The chunking guard is therefore
  asserted at the source via a recording proxy rather than by a red-to-green scale test.
  On a stock SQLite build the scale tests would carry real value.

### Closed during this work — recorded so it is not re-reported

- **The plan fed `source_id`s into `doc_id`-keyed lookups.** `curation_join.grouped_source_ids()`
  returns `source_id`s, but the plan's publish code passed them to `flags_for_ids()` and
  `documents.id`. Where the two differ — the normal case — that reads a *different
  document's* visibility, so a `public` mark on one document could publish another,
  private one. Caught by the implementer, replaced with a per-document join, pinned by
  `test_flags_are_keyed_by_doc_id_not_source_id`. Verified not to spread: no other task
  uses `grouped_source_ids`, and `vg_purge.py`'s use of it is correct.
- **`hide` stopped retracting.** The conjunctive rule's candidate set was `keep` only, so
  `keep`→`hide` produced no write and left a document public until bootstrap ran — while
  `keep`→`private` *was* driven false. Retraction worked on one axis and silently failed
  on the other. `hide` now actively drives `is_public=false`.
- **`plan_publish` would have raised above ~32k kept documents** (one SQL variable per
  id), at exactly the scale the feature exists for. Chunked at 900, along with
  `overlays_for_ids` and `overlay_tags_for_ids`, which had the same latent limit.
- **A `delete`-marked document stays public until `purge.py` runs** — structurally the
  same gap as a cleared decision. Now stated in `publish_decisions`'s docstring.
- **The migration CLI diverged from its siblings** (`--confirm` alone vs
  `--dry-run`/`--confirm`). Aligned, since the documented procedure runs all of them
  back-to-back and muscle memory is a real hazard there.
