# Sub-project SP2 — Triage UI (curation initiative, part 2 of 3)

**Date:** 2026-07-16
**Repos:** `library-api` (small read-only backend addition) + `cwcorella-git.github.io` (the UI).
**Umbrella spec:** `docs/superpowers/specs/2026-07-14-library-platform-architecture.md`
**SP1 spec (the store + write API this consumes):** `library-api/docs/superpowers/specs/2026-07-16-sp1-curation-store-design.md`
**Depends on:** SP1 (curation.db + `PUT /curation/{id}`, `POST /curation/bulk`, `GET /curation/stats`, `GET /documents?decision=`), C1 (the cwcorella `/library` reader + offset-windowed list).
**Status:** Approved design — ready for plan.

## Curation initiative context

Three sub-projects; only SP3 ever writes VG's production Postgres. **SP1 (done, merged to library-api main):** the curation store + write API. **SP2 (this spec):** the triage UI — turn cwcorella's `/library` into the one interface where you assign `keep` / `hide` / `delete` per doc. **SP3 (future):** the guarded VG-writing batch layer (Bootstrap / Publish / Purge). SP2 carries **zero production risk** — it writes only cwcorella's own `curation.db` (via SP1's endpoints) and reads library-api; it never touches VG.

## Locked decisions (user, 2026-07-16)

- **Reader-first triage.** The primary surface is the full-screen `DocReader`. You open a doc, read/skim, and assign a decision from controls in the reader header. The list is secondary — it shows each doc's decision as a badge and hosts the work-queue filter, but decisions are assigned in the reader.
- **Stay on the doc after deciding.** Assigning a decision updates the badge in place; it does **not** auto-advance and does **not** yank the doc from the current view. You move through the stack yourself with **‹ prev / next ›** arrows in the reader header, or by closing to the list.
- **No-yank under the Undecided filter.** When the list is filtered to `Undecided` and you mark a visible doc keep/hide/delete, the doc stays visible (now badged) rather than vanishing mid-read. The filtered set is only re-evaluated on an **explicit requery** — changing the decision filter, a manual refresh, or re-navigating. The list never shifts under you as a side effect of a decision.
- **Delete only marks.** In SP2 "delete" is a reversible decision like keep/hide — nothing is destroyed. The real, confirmed, export-before-purge destruction happens in SP3. So the reader's Delete control is a plain toggle (styled distinctly as the consequential one), with **no** in-reader confirmation dialog.
- **Decisions come from the backend, not a client-only cache.** So badges are correct across sessions and on first load, each doc's current decision is surfaced by library-api in its read payloads (see Backend below) rather than tracked only in the browser.

## Backend addition (library-api — read-only, zero prod risk)

SP1's `GET /documents` *filters* by decision but does not *return* it; the UI needs each doc's decision to badge rows and to highlight the active reader control on open. Add a `decision` field (`"keep" | "hide" | "delete" | null`, null = undecided) to both read payloads:

- **`GET /documents` rows** — add a correlated subquery to the page SELECT in `query.list_documents`:
  `(SELECT decision FROM cur.curation WHERE doc_id = documents.id) AS decision`.
  The endpoint already uses `read_conn_cur` (curation attached as `cur`), so no connection change; the subquery is an indexed PK lookup per row on a ≤200-row page. The keyset ordering, `total` count, and all filters are untouched.
- **`GET /documents/{id}`** — switch this endpoint from `read_conn` to `read_conn_cur`, and have `query.get_document` select `documents.*, (SELECT decision FROM cur.curation WHERE doc_id = documents.id) AS decision`.

No new endpoint, no write path, no CORS change. `library.db` stays read-only. This ships as SP2's first task (backend-first) so the frontend can rely on the field.

## Frontend (cwcorella)

### API client (`src/lib/library/api.ts`)
`request<T>` is GET-only today. Generalize it to accept `{ method, body }` (defaulting to GET, no body — existing calls unchanged), sending `Content-Type: application/json` + JSON body when present, and keeping the existing 401→AuthError / !ok→ApiError / network→OfflineError mapping. Add three client methods:
- `setCuration(id, decision)` → `PUT /curation/{id}` with `{decision}` (decision ∈ keep|hide|delete|undecided).
- `bulkCuration(ids, decision)` → `POST /curation/bulk` (present in the client for SP3/bulk use; SP2 UI may not surface it yet — include only if a bulk affordance is built, else defer to keep YAGNI).
- `getCurationStats()` → `GET /curation/stats`.

### State (`src/lib/library/libraryState.svelte.ts`)
- **Index-aware open.** Add `openDocByIndex(index)`: ensure the window for `index`, read the row's id from `_rowCache`, `getDocument(id)`, and record `_openIndex = index`. `DocList` opens rows by index (it already renders by index). Keep `openDocById` for any id-based entry, but reader nav uses the index.
- **Prev/next.** `openPrevDoc()` / `openNextDoc()` call `openDocByIndex(_openIndex ∓ 1)` clamped to `[0, total-1]`; expose `hasPrev` / `hasNext` getters for arrow disabling.
- **Decision write (optimistic, no requery).** `setDecision(decision)` for the open doc:
  1. capture the prior decision (for rollback),
  2. optimistically set `_openDoc.decision` and, if `_openIndex` is cached, `_rowCache.get(_openIndex).decision`; bump `_version`,
  3. `client.setCuration(id, decision)`; on success, refresh stats; on failure, roll back both and surface the error.
  Clicking the already-active decision sends `undecided` (clears the row). This path **must not** call `_newQuery` — that's what preserves no-yank.
- **Stats.** `_curationStats` state + `loadCurationStats()` (called on init and after each successful decision). Exposed via a getter.
- **Decision filter.** Lives in `_controls.filters.decision` (values: unset=All | undecided | keep | hide | delete). Changing it flows through the existing `applyControls` → `controlsChanged` → `_newQuery` machinery (an explicit requery — the one place the Undecided set re-evaluates). `toQuery` passes it as SP1's `decision=` param.

### Components
- **`DocReader.svelte` header** — add a decision control group (Keep / Hide / Delete; active highlighted via `_openDoc.decision`; clicking active → undecided) and **‹ prev / next ›** arrows (disabled at ends via `hasPrev`/`hasNext`). Reader body, TOC/info panel, observer, and jump are unchanged from the doc-info-panel work.
- **`DocRow.svelte` / `DocCard.svelte`** — render a compact decision badge from `item.decision` (· / keep / hide / delete), visually distinct from the existing `needs formatting` badge.
- **`LibraryControls.svelte`** — add a decision-filter selector (All / Undecided / Keep / Hide / Delete) alongside the existing filters, and a compact progress readout from stats (e.g. `312 / 100,417 decided`). Progress is display-only.
- **Types (`types.ts`)** — `DocListItem` gains `decision: 'keep' | 'hide' | 'delete' | null` (LibraryDoc inherits it); `LibraryQuery` gains optional `decision`; a `CurationStats` interface (`keep/hide/delete/decided/total/undecided`).

### Test culture
cwcorella is node-vitest only (no @testing-library); `.svelte` components are gated by `npm run check` + local Playwright e2e (skips when the API is down). So: pure logic is unit-tested (badge label mapping, prev/next clamping, decision-filter query composition, optimistic-rollback reducer if extracted), components verified via `npm run check`, and the write path exercised against a live local library-api where feasible. library-api's backend addition follows its own pytest house style.

## Out of scope for SP2 (explicit)

- Any write to VG's Postgres; Bootstrap / Publish / Purge; the export archive (all SP3).
- The stronger publish/purge credential and confirmation gates (SP3).
- Keyboard-driven rapid triage / list-row decision buttons (user chose reader-first, click-driven).
- Auto-advance after a decision (user chose stay-on-doc).
- Bulk multi-select triage UI (the `bulkCuration` client method may be included for SP3 but no SP2 UI drives it unless trivially free).
