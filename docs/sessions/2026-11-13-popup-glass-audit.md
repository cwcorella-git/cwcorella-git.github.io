# Session — Popup and glass styling audit (2026-11-13)

User asked to unify dropdown/popup styling, investigate inconsistent background blur, and document findings while investigating.

## Findings so far

### Initial findings from the stale pre-sync checkout

- The local theme dropdown (`ThemePanel.svelte`) and nav/admin panels applied blur, but the local `AdminToolbar.svelte` did not contain the scene control described by the user.
- That checkout had an older palette system and older blur-variable values; those observations should not be used to change the current site. The source was fast-forwarded to the live GitHub `main` before any implementation work.
- Each popup component repeated its own background, border, blur, positioning, and padding rather than using a shared compact-popup treatment.

### Popup/panel inventory from source search

Compact or anchored popup surfaces:

- `src/lib/components/ThemePanel.svelte` — palette menu; blur present; dark glass variables.
- `src/lib/components/NavPanel.svelte` — admin navigation settings; blur present; dark glass variables.
- `src/lib/components/SettingsPanel.svelte` — admin settings; blur present; dark glass variables. The synced source also includes glass tuning sliders.
- `src/lib/components/YearPicker.svelte` — year picker dropdown; uses `--glass-bg-dark`, **no backdrop filter**.
- `src/lib/components/library/FacetPanel.svelte` — library facet menus; blur present, but uses light `--glass-bg` / `--glass-border` rather than dark panel variables.
- `src/lib/components/library/TagChipInput.svelte` — tag suggestion menu; same light glass variables and blur.
- `src/routes/reading/+page.svelte` — contextual menu; has fixed-position menu styling and should be included in a follow-up visual review.
- `src/lib/components/BookView.svelte` — annotation popup plus other anchored panels; mixed styles, further classification needed before unifying.

Follow-up source inspection confirms:

- The reading context menu uses `--glass-bg-dark` / `--glass-border-dark` but has **no blur**.
- BookView's hover annotation tooltip has heavy blur; its annotation editor popup and notes popup use dark glass without blur.
- The YearPicker dropdown also has no blur. It is the only component explicitly named a dropdown among these missing-blur surfaces, but “scene” remains unlocated.

Larger overlays/sheets (not automatically the same component class as small dropdowns): `AdminDrawer.svelte`, `BookForm.svelte`, `BookView.svelte`, `DocReader.svelte`, `DocInfoPanel.svelte`, journal reader/editor/confirmation overlays, links editor/confirmation overlays, and the logout confirmation in `routes/+layout.svelte`. Several use heavy blur; some panels/modal backgrounds need per-surface review.

### Search terminology / unresolved “scene” item

- Searches across `src` found no `scene` or `Scene` identifier and no `type="range"`/slider in the Svelte source. The palette selector itself is definitely `ThemePanel.svelte`.
- User clarified “scene” is a button/dropdown in the live admin header beside sync, theme, nav, and admin. The checked-out `AdminToolbar.svelte` has no scene button, so it is not the live implementation currently represented by this local source.
- Local clone is significantly stale: checked-out `main` is `20d6729` dated 2026-09-30; read-only `git ls-remote` reports GitHub `main` at `34fc293be5b46269b40b6282ce9632d7b5e0a8c3`. Do not implement based on the stale toolbar; first inspect the newer source without overwriting local work.
- The local clone has no slider markup in source; this, plus the absent scene button, points to the live header implementation existing in newer commits (or a separate route/project), rather than the slider being an oddly styled control in this snapshot.
- Library search-related popups found are the facet menu and tag suggestion menu; ordinary sort `<select>` is in `library/LibraryControls.svelte`.

### Re-check after syncing the stale laptop clone

The laptop clone was fast-forwarded from `20d6729` to GitHub `main` (`34fc293`) with `git fetch` + `git merge --ff-only`. No local tracked edits were overwritten; the only local work was this untracked audit note. The workstation clone was already at `34fc293` (its `origin/main` tracking ref was stale, hence its misleading `[ahead 156]` status). The actual scene menu is now located:

- `src/lib/components/AdminToolbar.svelte` renders the admin-only scene button and imports `scenePanel`; `src/lib/components/ScenePanel.svelte` is the fixed scene tuner.
- ScenePanel has range controls and does apply `backdrop-filter: var(--glass-blur-heavy)`.
- `SettingsPanel.svelte` has the “glass” controls and range sliders, including `menuBlur` (0–48 px). It also uses `--glass-blur-heavy` for its own panel.
- `glassTune.svelte.ts` defines `menuBlur: 28px` default. `Sky.svelte` maps that to `--glass-blur-heavy`, and separately maps `cardBlur` to `--glass-blur` (default 22px).
- Therefore ThemePanel and NavPanel do have blur, but use the weaker `--glass-blur` (cardBlur); ScenePanel and SettingsPanel use the stronger menu blur. This likely explains why scene looks blurred while theme/nav look less blurred. It is not a missing declaration in those two panels.
- Other remaining inconsistencies are confirmed: YearPicker, reading context menu, BookView annotation editor, and BookView notes panel have glass backgrounds without any backdrop-filter. FacetPanel and TagChipInput use the regular adaptive glass variables; both currently use the stronger menu blur in the synced source.
- SettingsPanel's range styling is mostly native (`accent-color`) while ScenePanel uses the same native approach. Their sizes/layout differ because the panels serve different control sets; control unification can be considered after the surface/blur decision.

## Sync status

- Laptop `main` was fast-forwarded to `34fc293` from GitHub; no force operation or conflict resolution was needed.
- Workstation `/home/user/Projects/cwcorella-git.github.io` was already at `34fc293`, clean; its stale remote-tracking ref caused the apparent ahead count. Verify this again before pulling after the audit note is pushed.
- At the audit stage, edits were limited to this note. The UI changes made afterward are recorded below.

## Implementation (laptop, after the audit)

- Added `src/lib/styles/popups.css`, imported by `src/routes/+layout.svelte`. `.popup-glass` centralizes dark glass background/border and uses `--glass-blur-heavy` (the admin-tunable `menuBlur`). `.popup-glass--adaptive` preserves the library's adaptive heavy-glass background/border.
- Applied the shared surface to ThemePanel, NavPanel, SettingsPanel, ScenePanel, YearPicker, library FacetPanel and TagChipInput, the Reading context menu, and BookView's annotation editor and notes popover. Existing placement, sizing, content and modal/drawer surfaces remain component-owned/unchanged.
- Theme and nav now use the same strong menu blur as scene/admin settings. Previously they used `--glass-blur` (`cardBlur`), while scene/settings used `--glass-blur-heavy` (`menuBlur`); both groups already had blur declarations, but at different strengths.
- Added shared `.popup-range` sizing/accent-color and focus-visible treatment for controls inside glass popovers; applied to ScenePanel and SettingsPanel sliders. No interaction/slider behavior changed.
- Validation: `git diff --check` passes. `npm run check` reports 18 errors in markdown modules because installed `node_modules` lacks `unified`, `rehype-sanitize`, `mdast`, and `hast`; no reported errors point to changed Svelte components. `npm test`: 27 files / 345 tests pass, one existing test times out, and two suites cannot load due missing `unified`. No visual browser pass was possible with those dependencies absent.
- Commit/push/pull status: to be recorded after syncing this implementation.

## Preliminary diagnosis and direction

The blur declarations are already present on Theme/Nav/Admin and the library menus; the obvious missing blur declaration is the YearPicker. The larger issue is inconsistent panel variables and opacity: light-glass library menus use adaptive light glass while theme/admin menus use dark glass, and the latter background opacity is often high enough to make blur subtle. This is not yet proof that CSS filter application is broken; stacking context, ancestor transforms/opacity, browser support, and the actual live theme must be checked in a browser before changing the shared treatment.

Likely safe unification: introduce a small shared popup-glass class or component for anchored popovers (positioning remains caller-owned), with a theme-aware translucent surface, border, blur, fallback background, and consistent focus/control tokens. Keep modal/drawer/sheet surfaces separate and allow variants for light-context vs dark-context content. Do not blindly replace all `--glass-bg-dark` uses: those also cover larger overlays and may need stronger opacity for legibility.

## Scope/status

- Laptop clone only: `/home/user/Projects/cwcorella-git.github.io`.
- No source or styling changes made during this audit yet; repository was clean at start, on branch `main`.
- No tests/build run; investigation is source-only so far.
