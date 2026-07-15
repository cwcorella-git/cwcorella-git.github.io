# C1 Library Read Surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the admin-only `/library` read surface on `cwcorella.com` — reliable virtua-based infinite scroll over B2's keyset cursor, plus filter/sort/search controls and a single-doc reader — as a fully-isolated server-backed exception on an otherwise static site.

**Architecture:** All reliability-critical logic lives in **pure, injectable `.ts` modules** (`api.ts` client, `libraryLogic.ts` policy) unit-tested in node with mocked `fetch`; the Svelte 5 rune store (`libraryState.svelte.ts`) is a **thin reactive wrapper** delegating to `libraryLogic`; the `.svelte` components are thin and verified by `npm run check` + a local Playwright e2e. This mirrors the repo's existing test culture (pure-module vitest tests only — no component-rendering harness).

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, `adapter-static`, TypeScript, Vitest (node env), Playwright (local e2e), `virtua` (new dep).

**Spec:** `docs/superpowers/specs/2026-07-14-c1-library-read-design.md`

## Global Constraints

- **Testing reality (house style):** vitest runs in `environment: 'node'`, `include: ['src/**/*.test.ts']`, with **no** `@testing-library`/jsdom. Therefore: (a) put testable logic in plain `.ts` modules with dependency injection (inject `fetch`, token getter, base URL) so tests need no browser and no runes; (b) `.svelte` components + the `.svelte.ts` rune store are NOT unit-tested by vitest — they are gated by `npm run check` (svelte-check + tsc) and exercised by the optional local Playwright e2e. Do **not** add a component-testing framework.
- **Fully-isolated server exception:** `/library` must not be added to `scripts/build-archive.mjs`; must prerender to a shell with **no** data fetch at build; must redirect non-admins; must degrade to an "offline" state when B2 is unreachable. Never let a library failure break the build or the rest of the site.
- **No new server, no free-tier dep:** the only new runtime dependency is `virtua` (client-side lib). The library base URL is a build-time `PUBLIC_LIBRARY_API_URL`. No cookies (`credentials:'omit'`; bearer token only — matches B2's CORS).
- **Reliability contract (no main-site regressions):** virtualizer keyed by stable `item.id` (never index); IntersectionObserver sentinel guarded by `isFetching`/`hasNext` and re-keyed per `queryKey`; ANY change to (sort, dir, q, filters) resets cursor + items + scroll + refetches total; no client-side re-sort/sampling; `total` from B2's COUNT.
- **Svelte 5 runes** everywhere (`$state`/`$derived`/`$effect`); match `/links` conventions. Admin secrets pattern per `src/lib/admin/state.svelte.ts`.
- Work on branch `c1-library-read`. Commit locally; **do not push** until reviewed. `npm run check` + `npm test` before each commit. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

## File Structure

- `src/lib/library/api.ts` — `createLibraryClient({ baseUrl, getToken, fetchImpl })` → `{ listDocuments, getDocument, getFacets }`; error taxonomy `AuthError`/`OfflineError`/`ApiError`.
- `src/lib/library/types.ts` — `LibraryDoc`, `DocListItem`, `Facets`, `LibraryQuery`, `ListResponse`.
- `src/lib/library/libraryLogic.ts` — PURE policy: `computeQueryKey(q)`, `serializeQuery(q)`, `nextStateOnQueryChange(...)`, `canLoadMore(state)`, `appendPage(state, resp)`, `isStaleCursor(err)`. No runes, no fetch.
- `src/lib/library/libraryState.svelte.ts` — thin rune store wrapping `libraryLogic` + a `createLibraryClient` instance.
- `src/routes/library/+page.svelte` — the page (gate, controls, list, reader, offline/empty/error).
- `src/routes/library/+page.ts` — `export const prerender = true;` (shell only; no load()).
- `src/lib/components/library/*` — `LibraryControls.svelte`, `DocList.svelte` (virtua), `DocRow.svelte`, `DocCard.svelte`, `DocReader.svelte`.
- `src/lib/admin/state.svelte.ts` — extend with `libraryToken`.
- `tests/library.e2e.ts` (or under `tests/`) — Playwright, local-B2, optional.
- Unit tests: `src/lib/library/api.test.ts`, `src/lib/library/libraryLogic.test.ts`.

---

## Task 1: `libraryToken` admin secret + B2 API client

**Files:** Create `src/lib/library/types.ts`, `src/lib/library/api.ts`, `src/lib/library/api.test.ts`. Modify `src/lib/admin/state.svelte.ts` (+ the SettingsPanel component that edits the PAT — find it and add a matching field). 

**Interfaces:**
- `adminState`: add `_libraryToken = $state('')`, getter `libraryToken`, `updateLibraryToken(t)` → persist to `localStorage['cwc-library-token']`; restore it in `restoreFromSession()`; clear in `deactivate()`. (Mirror the existing PAT handling exactly.)
- `createLibraryClient({ baseUrl, getToken, fetchImpl = fetch })` returns `{ listDocuments(query), getDocument(id), getFacets() }`. Each: builds the URL (+ query params via `serializeQuery` in Task 2 — for Task 1 inline a minimal serializer or depend on logic if built first; keep it simple), sets `Authorization: Bearer ${getToken()}`, `credentials:'omit'`. Maps: network throw → `OfflineError`; `401` → `AuthError`; other non-2xx → `ApiError(status, detail)` reading B2's `{detail}`; 2xx → parsed JSON.

**Tests first (`api.test.ts`, mocked `fetchImpl`):**
- `Authorization: Bearer <token>` header present and uses the injected `getToken()`.
- 200 → returns parsed body for each of the three calls; query params serialized (assert the URL).
- 401 → `AuthError`; a thrown fetch (network) → `OfflineError`; 400 with `{detail}` → `ApiError` carrying the detail; 500 → `ApiError`.
- `credentials:'omit'` set.

**Done:** `npm test` green; `npm run check` clean. Commit: `feat(library): B2 api client + libraryToken admin secret`.

---

## Task 2: Pure browse policy (`libraryLogic.ts`)

**Files:** Create `src/lib/library/libraryLogic.ts`, `src/lib/library/libraryLogic.test.ts`.

**Interfaces (all pure, no runes/fetch):**
- `computeQueryKey(q: LibraryQuery): string` — stable string of `(sort, dir, q, filters)` (exclude `cursor`).
- `serializeQuery(q): string` — URLSearchParams of the non-empty fields incl. `cursor`/`limit`; omit empties.
- `nextStateOnQueryChange(prev, newControls)`: returns a fresh state `{ items:[], cursor:null, hasNext:true, total:null, isFetching:false, ... }` when `computeQueryKey` changes (the reset), else prev unchanged.
- `canLoadMore(state): boolean` — `!isFetching && hasNext`.
- `appendPage(state, resp)`: append `resp.items` (dedup by id as a belt-and-suspenders guard), set `cursor=resp.next_cursor`, `hasNext = resp.next_cursor != null`, `total=resp.total`.
- `isStaleCursor(err): boolean` — true for an `ApiError` with status 400 (→ store resets to page 1).

**Tests first:** queryKey identical for same controls / differs when any of sort/dir/q/any-filter changes and is independent of cursor; a query change yields a reset state (empty items, null cursor); `canLoadMore` false while fetching or when `hasNext` false; `appendPage` appends in order, updates cursor/hasNext/total, and drops a duplicate id if B2 ever repeats one; `isStaleCursor` true only for 400.

**Done:** `npm test` green; module is pure (no `.svelte`/fetch import). Commit: `feat(library): pure browse policy — queryKey/reset/loadMore guards`.

---

## Task 3: `/library` route shell — gate, prerender-shell, offline/empty/error, facets

**Files:** Create `src/routes/library/+page.ts` (`prerender = true`), `src/routes/library/+page.svelte` (initial shell), `src/lib/library/libraryState.svelte.ts` (thin rune store). 

**Interfaces:**
- `libraryState.svelte.ts`: a rune store holding the reactive `state` + `controls`, instantiating `createLibraryClient({ baseUrl: PUBLIC_LIBRARY_API_URL, getToken: () => adminState.libraryToken })`, and exposing `applyControls(patch)` (→ `nextStateOnQueryChange` + fetch page 1 + total), `loadMore()` (guarded; on `isStaleCursor` reset + reload), `loadFacets()`, `openDoc(id)`/`closeDoc()`. Delegates ALL policy to `libraryLogic`.
- `+page.svelte`: `$effect` admin-gate redirect to `/`; on mount (admin) load facets + page 1; render states: **loading**, **offline** (`OfflineError`), **auth** ("set your library token", link to settings), **empty** (0 results), **list** (Task 4 fills this in). No data at build (`+page.ts` only sets prerender).

**Verification:** `npm run check` clean; manual/e2e later. (No vitest component test — per Global Constraints.) A unit test MAY cover any pure helper extracted here. Commit: `feat(library): /library route shell — gate, offline/empty/error states, facets`.

---

## Task 4: Virtualized list + guarded sentinel + total phantom + list/grid

**Files:** Create `src/lib/components/library/DocList.svelte`, `DocRow.svelte`, `DocCard.svelte`. Modify `+page.svelte`. Add `virtua` to `package.json` (`npm i virtua`).

**Interfaces:**
- `DocList` renders `virtua/svelte` `VList` over `state.items`, **keyed by `item.id`**, row via `DocRow` (list) or `DocCard` (grid) per `controls.view`. A **guarded IntersectionObserver sentinel** at the end calls `libraryState.loadMore()`, guarded by `canLoadMore` and re-keyed per `queryKey` (recreate the observer when queryKey changes). Uses `state.total` to size the scrollbar/phantom.
- list/grid toggle in `controls` (wired fully in Task 5; here just honor `controls.view`).

**Verification:** `npm run check` clean; the local Playwright e2e in Task 6 proves multi-page scroll without dup/skip. Commit: `feat(library): virtua list + guarded sentinel + list/grid`.

---

## Task 5: Controls bar — search debounce, sort+dir, filters

**Files:** Create `src/lib/components/library/LibraryControls.svelte`. Modify `+page.svelte`.

**Interfaces:** search input (debounced ~250 ms → `applyControls({q})`), sort dropdown (the 4 columns) + asc/desc toggle, **language** dropdown, **collections** dropdown (from facets: sources + collections), **tag** filter, `visibility` + `needs_formatting` filters, list/grid toggle. Every change calls `applyControls(patch)` → which resets via `libraryLogic`. Facet option lists come from `state.facets`.

**Verification:** `npm run check` clean; e2e asserts a filter change resets the list. Commit: `feat(library): controls bar — search/sort/dir/filters wired to queryKey reset`.

---

## Task 6: Single-doc reader + local Playwright e2e

**Files:** Create `src/lib/components/library/DocReader.svelte`, `tests/library.e2e.ts`. Modify `+page.svelte`.

**Interfaces:**
- `DocReader`: opened from a row/card; fetches `getDocument(id)`; shows metadata + tags + collections + body (markdown via the existing `marked`/`markdown.ts`). List stays mounted behind it (modal/overlay) so scroll + filters survive close; prefer native history/`snapshot` over `goto()` for restoration. Read-only (no edit — that's C2).
- **Playwright e2e (`tests/library.e2e.ts`, local-only):** documented to run against a locally-started B2 (uvicorn + seeded `library.db`, `LIBRARY_API_TOKEN=dev`, `PUBLIC_LIBRARY_API_URL=http://127.0.0.1:8080`). Flow: activate admin + set token, open `/library`, scroll to trigger ≥2 pages, assert no duplicate/skipped ids across the seam, open a doc (body loads), apply a filter → list resets. Gate it so it SKIPS cleanly when B2 isn't running (not part of static CI).

**Verification:** `npm run check` + `npm test` green; e2e passes locally against a seeded B2. Commit: `feat(library): single-doc reader + local e2e (multi-page scroll, filter reset)`.

---

## Rollout / ordering

Sequential (2 depends on nothing but is used by 3–6; 1 provides the client; 3 stands up the store/page; 4–5 fill the UI; 6 adds the reader + e2e). After Task 6, a whole-branch review, then push `c1-library-read` and merge. The **real cutover** (pointing `PUBLIC_LIBRARY_API_URL` at the live tunnel after B1 migration + B2 deploy) is a separate step.

## Out of scope (C1)

- All editing/writes (C2 + B3): reader/editor mutations, tag/collection editing, triage-queue writes.
- Relevance ranking, multi-tag AND, filter-aware facet counts (B2 deferred).
- Any change to the archive mirror or the static site's no-server guarantees.
