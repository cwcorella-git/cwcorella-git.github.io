# Sub-project C1 — cwcorella `/library` (read / browse / scroll)

**Date:** 2026-07-14
**Repo:** `cwcorella-git.github.io` (SvelteKit 2 + Svelte 5 runes, `adapter-static`)
**Umbrella spec:** `docs/superpowers/specs/2026-07-14-library-platform-architecture.md`
**Depends on:** B2 (read API — `library-api`, deployed at `library-api.cwcorella.com`). **Status:** Approved design — ready for plan.

## Purpose

The admin-only browsing surface for the migrated library, living at `/library` on
`cwcorella.com`. Renders B2's keyset-cursor pages with **reliable infinite scroll** (virtua
virtualization + a guarded IntersectionObserver sentinel over B's cursor), plus the
filter/sort/search controls. This is the payoff of the whole migration: the scroll that the main
site could never make reliable.

**Scope split:** C is decomposed to match B. **C1 (this spec) = the read surface** — browse,
search, filter, sort, single-doc read — against the read-only B2. **C2 (deferred, after B3) =
editing** — the reader/editor writes, tag/collection management, and the "needs formatting"
triage *mutations*. C1 builds everything B2 can back today; C2 waits for the write API.

## Locked decisions (user, 2026-07-14)

- **`/library` is the sanctioned server-backed exception** to cwcorella's "no server, ever" rule,
  and it is **fully isolated** from the static site:
  - **Not in the archive mirror.** `scripts/build-archive.mjs` never references it; C1 adds nothing
    there. The GitHub-Pages/decentralized archive stays 100% static and library-free.
  - **No data prerendered.** The route prerenders to an empty admin-gated shell (adapter-static
    builds the HTML frame); every B2 call happens client-side after hydration. Nothing about the
    library is baked into the build output.
  - **Admin-gated + graceful offline.** Non-admins are redirected to `/`. When B2/the workstation
    is unreachable, the page shows a clear "library offline" state — it never breaks the rest of the
    site and never blocks the build.
  - Rationale: 100k docs / 2.7 GB cannot be a static encrypted blob; the library is the one thing
    that genuinely needs a backend. Every OTHER surface keeps its no-server guarantee untouched.
- **B2 bearer token lives in `localStorage`** (`cwc-library-token`), a third admin secret beside the
  GitHub PAT (`cwc-admin-pat`) and the content key — set once via the admin SettingsPanel, persists
  across sessions like the PAT.
- **Search filters, does not re-rank** (inherited from B2): the search box adds B2's `q` param.
- **Sort options = B2's four indexed columns:** `title`, `author`, `publication_date`,
  `updated_at`, each with an asc/desc toggle.

## Integration with the existing admin system

Follows the `/links` pattern exactly (`src/routes/links/+page.svelte`):
- Svelte 5 runes (`$state`/`$derived`/`$effect`); `adminState` from `$lib/admin/state.svelte`.
- **Admin gate:** `$effect(() => { if (!adminState.active) goto('/'); })`. (Unlike `/links`, there is
  **no** `archiveState.mode` read — the library is never in the 2095 archive.)
- **`adminState` gains a third secret:** `_libraryToken` (`$state('')`), getter `libraryToken`,
  `updateLibraryToken(t)` persisting to `localStorage['cwc-library-token']`, restored in
  `restoreFromSession()`, cleared in `deactivate()`. SettingsPanel gets a "Library API token" field
  next to the PAT field.
- **No `writeQueue` use in C1** — C1 is read-only; the write path (GitHub-API `writeQueue` is for the
  static site's own data anyway) is irrelevant here. C2's library writes go to **B3**, not GitHub.

## New pieces

### `src/lib/library/api.ts` — the B2 client
- Base URL from a build-time public env var `PUBLIC_LIBRARY_API_URL` (default
  `https://library-api.cwcorella.com`); dev points it at a local B2 (`http://127.0.0.1:8080`).
- `Authorization: Bearer ${adminState.libraryToken}` on every call; `credentials: 'omit'` (bearer, not
  cookies — matches B2's CORS `allow_credentials=false`).
- Functions: `listDocuments(query) -> {items, next_cursor, total}`, `getDocument(id) -> doc`,
  `getFacets() -> {languages, sources, collections, tags}`. `query` carries `sort, dir, cursor, q,
  language, source, collection, tag, visibility, needs_formatting, limit`.
- **Error taxonomy** (drives the UI states): `AuthError` (401 → "check your library token"),
  `OfflineError` (network failure/timeout → "library offline"), `ApiError` (4xx/5xx with B2's
  `detail`). A 400 from a stale cursor is handled by the store (reset), not surfaced as a hard error.

### `src/lib/library/libraryState.svelte.ts` — the browse store (runes)
Holds `items[]`, `cursor`, `hasNext`, `total`, `isFetching`, `error`, and the query controls
`{ sort, dir, q, filters:{language,source,collection,tag,visibility,needs_formatting}, view:'list'|'grid' }`.
- **`queryKey`** = a `$derived` string of `(sort, dir, q, filters)`. Any change to it is a **new
  query**: drop `cursor` + `items`, reset `total`, reset the virtualizer scroll to 0, re-arm the
  sentinel, and fetch page 1 + `total`. This is the umbrella's "reset semantics" and it is what keeps
  `itemContent(i)` stable.
- **`loadMore()`**: guarded by `isFetching && hasNext`; sends the current `cursor`; appends `items`;
  updates `cursor`/`hasNext` from `next_cursor`. A **400 (stale cursor)** → treat as "reset and
  reload page 1" rather than an error (defends against a cursor invalidated by an out-of-band change).
- Debounce `q` input (~250 ms) before it becomes a new `queryKey`.

### `src/routes/library/+page.svelte` — the page
- Admin gate + `libraryState` wiring + the offline/empty/error states.
- **Virtualization:** `virtua/svelte` `VList` over `items`, keyed by **`item.id`** (never array index —
  index keys are one of the autopsy's root causes). A **guarded IntersectionObserver sentinel** near
  the list end calls `loadMore()`; guarded by `isFetching`/`hasNext` and re-keyed per `queryKey` to
  avoid double-fetch/re-entrancy.
- **Controls bar:** list/grid toggle, search input, sort dropdown + asc/desc toggle, **language**
  dropdown, **collections** dropdown (source + user collections from `/facets`), **tag** filter,
  and `needs_formatting`/`visibility` filters. Facets loaded once via `getFacets()`; re-fetched on
  demand.
- **Scrollbar total:** `total` from B2 sizes the virtualizer's phantom (accurate scrollbar even
  though only a window is materialized).
- **Single-doc read:** clicking an item opens a reader (metadata + tags + collections + body via
  `getDocument(id)`). Keep the list mounted behind the reader (modal or nested route) so scroll
  position + filters survive a back action — prefer native history over `goto()` for restoration
  (SvelteKit `snapshot` for filters/sort/search/cursor if a nested route is used).
- **Theme/FOUC:** uses the site's existing layout + 6-palette theme system unchanged; **no custom
  colors, no separate FOUC path** — it inherits `+layout.svelte` and `Sky.svelte` like every page.

### `virtua` dependency
Add `virtua` to `package.json` (client-side virtualization lib; compatible with `adapter-static`
since it runs only in the browser). No server implication.

## Reliability contract (mirrors B2 / the umbrella autopsy)

C1 must not reintroduce any main-site failure mode:
- Virtualizer keyed by **stable `item.id`**, never array index.
- Sentinel **guarded** (`isFetching`/`hasNext`) and **re-keyed per queryKey** — no unguarded
  IntersectionObserver, no double-fetch.
- **Reset cursor + cached items on any filter/sort/search change** — a stale cursor is never applied
  to a new ordering (B2 also rejects a mismatched cursor with 400; the store resets on it).
- No client-side re-sorting or proportional sampling — the order is entirely B2's single global
  order; C1 only appends pages in the order B2 returns them.
- `total` comes from B2's COUNT, not guessed.

## Testing

- **Unit (Vitest):** `api.ts` with a mocked `fetch` — auth header present; 401→`AuthError`,
  network fail→`OfflineError`, B2 `detail` surfaced; query params serialized correctly.
  `libraryState` — a `queryKey` change resets cursor/items/scroll and refetches; `loadMore` guards
  against concurrent/absent-next calls and appends in order; a 400 on `loadMore` triggers a page-1
  reset, not an error state.
- **Component:** the page redirects a non-admin to `/`; renders the offline state on `OfflineError`;
  renders items and fires `loadMore` when the sentinel intersects (mock the observer).
- **E2E (Playwright, optional/local):** against a **locally-run B2** (uvicorn + a seeded
  `library.db`) — admin-activate, load `/library`, scroll to trigger ≥2 pages, confirm no
  duplicate/skipped rows across the seam, open a doc, apply a filter and confirm the list resets.
  (Runs locally where B2 can be started; not part of the static CI build.)

## Local dev / test story

Because the workstation isn't always reachable, C1 develops against a **local B2**: run
`python -m backend.api` in `library-api` with `LIBRARY_DB` pointed at a seeded test db and
`LIBRARY_API_TOKEN=dev`, set `PUBLIC_LIBRARY_API_URL=http://127.0.0.1:8080` in `.env.local`, and
paste `dev` as the library token in the admin panel. Unit tests mock `fetch` and need no B2.

## Build order (plan will expand into TDD tasks)

1. `adminState` third-secret (`libraryToken` + localStorage + SettingsPanel field) + `api.ts` client
   with the error taxonomy (unit-tested with mocked fetch).
2. `libraryState` store: queryKey/reset semantics + guarded `loadMore` + stale-cursor reset
   (unit-tested).
3. `/library` route shell: admin gate, prerender-to-shell, offline/empty/error states, facets load.
4. Virtualized list (`virtua` + id-keyed) + guarded sentinel + `total` phantom + list/grid.
5. Controls bar (search debounce, sort+dir, language/collection/tag/visibility/needs_formatting
   filters) wired to `queryKey`.
6. Single-doc reader (metadata + tags + collections + body) with scroll/filters restoration; local
   Playwright e2e against a seeded B2.

## Out of scope (C1)

- **All editing** — reader/editor writes, tag/collection editing, the triage-queue *mutation* — is
  **C2**, and needs **B3** (the write API) first.
- Relevance ranking, multi-tag AND, filter-aware facet counts (B2 deferred items).
- Any change to the static site's other surfaces, the archive mirror, or the no-server guarantees.
