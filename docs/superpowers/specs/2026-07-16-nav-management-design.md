# Config-driven nav bar with an admin management panel

**Date:** 2026-07-16 · **Status:** Built + visually verified (local preview)

## Goal

Add a `library` tab to the nav, and give the admin a panel to show/hide nav
items and mark each **public** (every visitor) or **admin** (only when logged
in / archive mode) — persisted so it affects real visitors.

## Key decisions

- **Audience affects real visitors** → config lives in a committed JSON file
  (`src/lib/content/nav.json`), imported statically and baked into the build,
  the same pattern as `home.json`. Changes go live on the next redeploy.
- **Nav audience controls the *link*, not page access.** On a static site,
  hiding a link doesn't protect the page (the URL still works), and the
  admin-gated routes already redirect non-admins. So the three admin routes
  (`library`, `journals`, `links`) are **`adminLocked`**: shown/hidden freely
  but audience pinned to `admin` (a public link would just bounce visitors).
- **`home` is `pinned`**: always shown + public, not editable (site brand).
- **private→public needs a yes/no confirm** — the one direction that exposes a
  tab to the world.
- **Explicit "publish nav"** (commit via GitHub API, PAT-gated) rather than
  silent auto-sync, because it's public-facing and infrequent.

## Data model — `src/lib/content/nav.json`

`{ id, label, href, shown, audience: 'public'|'admin', adminLocked?, pinned? }`

Seeded: `home`(pinned) · `reading`(public) · `library`/`journals`/`links`
(admin, adminLocked). `library` is the newly added tab.

## Components

- **`src/lib/nav/navLogic.ts`** — pure, unit-tested: `visibleItems(items, isAdmin)`,
  `isGoingPublic(prev, next)`, `audienceEditable(item)`, `shownEditable(item)`.
- **`src/lib/nav/navState.svelte.ts`** — rune store: working copy of the config,
  `toggleShown` / `setAudience` / `reset` / `publish()` (commits `nav.json`).
  In-memory only (no localStorage draft — infrequent, explicit publish).
- **`+layout.svelte`** — renders `visibleItems(navState.items, adminState.active
  || archiveState.mode)` instead of the old hardcoded links.
- **`NavPanel.svelte`** — the management panel; opened by a new admin-only
  `☰ nav` toolbar button (`AdminToolbar.svelte`), styled like `SettingsPanel`.
  Rows show a show/hide `●/○` toggle and an `admin | public` toggle (disabled +
  🔒 for adminLocked, 📌 for pinned); private→public pops the confirm; footer has
  `reset` + `publish nav` (disabled unless dirty and a PAT is loaded).

## Testing

`navLogic.test.ts` (7 tests) covers audience filtering, the going-public
predicate, and the edit guards. `.svelte` covered by `npm run check` + local
Playwright visual pass (public nav, admin nav with `library`, the panel, the
confirm dialog). Full suite: 90 tests pass.
