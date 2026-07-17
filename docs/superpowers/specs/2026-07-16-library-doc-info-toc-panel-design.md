# Library reader: info + "On this page" panel — design

**Date:** 2026-07-16
**Status:** approved (design), pending plan
**Repo:** `cwcorella-git.github.io` (frontend only — no backend changes)

## Problem

The document reader (`DocReader.svelte`, a full-screen modal) stacks all eight
metadata rows (author, source, published, language, type, words/chars,
visibility, updated) plus badges, tag chips, and collection chips at the **top
of the prose body**, pushing the actual text down and mixing chrome with
reading. There is also no table of contents / sense of position within a long
document.

veritablegames.com's wiki + library already solve the second half: an
`ArticleTOC` ("On this page") with active-section highlight, plus a
`DocumentInfoSidecard` for metadata. We want to steal that *idea* — but in
cwcorella's glass visuals, and with a **better** narrow/mobile treatment than
their bottom-sheet, which the user flagged as taking too much space.

## Goal

Move the per-document metadata out of the prose body into a dedicated
**info + "On this page" panel**:

1. **Desktop (wide):** the reader becomes two columns — prose on the left, a
   sticky panel on the right holding (a) a **Document info** card and (b) an
   **On this page** TOC whose current heading highlights as you scroll and jumps
   on click.
2. **Narrow / half-screen (< ~900px):** the sidebar is replaced by a **floating
   pill** (bottom-right, glass-styled) that opens a **compact tabbed sheet**.
   The reading area stays full-width; nothing overlays the prose until tapped.
   (This supersedes the original *slim bar* treatment — see "Narrow-mode revision"
   below. The slim bar took too much vertical space; the pill+sheet is the
   improvement over both it and veritablegames.com's info-dropping wiki layout.)

No backend changes. The TOC data and scroll anchors already exist.

## What already exists (do not rebuild)

- `src/lib/admin/markdown.ts`:
  - `renderMarkdown(md)` stamps `id="<slug>"` on every `<h1..h3>`.
  - `extractToc(md)` returns `TocEntry[] = { level: 1|2|3, text, anchor }`.
  - **Both use the same `slugify()`**, so `TocEntry.anchor` matches the rendered
    heading `id` exactly. Jump-to-anchor and active-section matching line up
    with no extra work. (h4–h6 are intentionally excluded, as today.)

## Approach

### Layout restructure (`DocReader.svelte`)

The modal keeps its `overlay` → `overlay-header` (title + ×) → `overlay-body`
shell. Inside:

- **`.doc-scroll`** remains the single scroll container: `overflow-y: auto`,
  full height. It is the IntersectionObserver **root** and the `scrollTo`
  target. This is critical — the observer and jump logic both address this one
  element, not `window`.
- Inside `.doc-scroll`, a centered **`.reader-grid`** (`max-width: ~1040px`):
  - **`.prose-col`** — `max-width: 720px`; contains the `doc-heading` (title)
    and the `.doc-body` (`{@html bodyHtml}`) **only**. The `meta-grid`, badge,
    and chip rows are **removed** from here.
  - **`.info-panel` slot** — `position: sticky; top: 0`; renders `DocInfoPanel`
    in sidebar mode. Hidden below the breakpoint via CSS.

### Active-section tracking (ported from `useTocActiveSection`)

An `$effect` in `DocReader` owns an `IntersectionObserver`:

- Guards: no TOC entries, or body element not yet bound → no-op.
- Resolves anchors by `bodyEl.querySelector('#' + CSS.escape(anchor))` for each
  `TocEntry`; observes each found heading. `root: docScrollEl`,
  `rootMargin: '0px 0px -65% 0px'`, `threshold: [0, 1]` (upper-third active
  band, matching veritablegames.com's tuning adapted to a scroll container).
- On each callback it maintains a `Map<anchor, isIntersecting>` and picks the
  **topmost** intersecting heading (smallest `getBoundingClientRect().top`),
  writing it to `activeAnchor = $state<string | null>`.
- Re-runs (tears down + rebuilds the observer) when `bodyHtml` or the TOC array
  identity changes — i.e. when a different document opens. Cleanup on
  destroy/re-run via the `$effect` return.

`activeAnchor` is passed to `DocInfoPanel` for both the sidebar highlight and the
slim bar's live label.

### Jump-to-heading

`DocReader.handleJump(anchor)`:

- `const el = bodyEl?.querySelector('#' + CSS.escape(anchor))`; if missing, no-op.
- Scroll the **container**, not the window: compute
  `docScrollEl.scrollTop + (el.getBoundingClientRect().top -
  docScrollEl.getBoundingClientRect().top) - OFFSET` (OFFSET ~16px), then
  `docScrollEl.scrollTo({ top, behavior: 'smooth' })`.
- Passed to `DocInfoPanel` as `onJump`. The panel additionally collapses its
  narrow expand state on jump.

### `DocInfoPanel.svelte` (new)

Props:

- `toc: TocEntry[]`
- `activeAnchor: string | null`
- `doc: DocListItem`-shaped object carrying the metadata fields
  (author, source, publication_date, language, document_type, word_count,
  char_count, visibility, updated_at, needs_formatting, tags[], collections[])
- `onJump: (anchor: string) => void`

Internal `expanded = $state(false)` (only meaningful in slim-bar mode).

Renders **both** presentations from **shared Svelte snippets** so metadata/TOC
markup exists once:

- `{#snippet infoRows()}` — the `dl` of metadata rows + needs-formatting badge +
  tag chips + collection chips (moved verbatim in content from `DocReader`,
  restyled to fit the panel width).
- `{#snippet tocList()}` — the `extractToc` list. Each item: indent by
  `(level - minLevel)`, a running ordinal from `tocNumber(toc)`, the text; the
  item whose `anchor === activeAnchor` gets `.active` (accent + `▸`) and
  `aria-current="true"`; click → `onJump(anchor)` (+ collapse in bar mode).
  Hidden entirely when `toc.length === 0`.

Two containers, CSS-toggled by breakpoint:

- **`.sidebar`** (shown ≥ breakpoint): a heading "On this page" + `{@render
  tocList()}`, then a divider + "Document info" + `{@render infoRows()}`.
- **`.narrow`** (shown < breakpoint): a **floating pill** + **tabbed sheet** —
  see "Narrow-mode revision" below.

## Narrow-mode revision (2026-07-16)

The original `.slim` sticky bar is replaced. It consumed a fixed strip of
vertical reading space and, expanded, pushed the prose down — the same
space complaint the user raised about veritablegames.com's mobile
bottom-sheet. The replacement is a **floating pill → compact tabbed sheet**
(user-selected). It surfaces **both** the TOC and the info panel in narrow
mode — improving on the wiki, whose info sidecard is desktop-only.

### Floating pill

- Fixed, bottom-right of the reader (`position: fixed`, inside the modal
  z-context), glass-styled to match the reader chrome.
- Label is derived by a new pure helper `pillLabel(entries, numbers,
  activeAnchor)` returning `{ glyph, text }`:
  - **No headings** (`entries.length === 0`): `{ glyph: 'ⓘ', text: 'Info' }`.
  - **Active section present**: `{ glyph: '§', text: '<ordinal>. <heading>' }`
    (the live "where am I" cue; e.g. `§ 2. Method`).
  - **Headings but none active yet**: `{ glyph: '§', text: 'On this page' }`.
- The text is single-line, ellipsised, so the pill can't grow unbounded.
- `aria-expanded` reflects sheet state; `aria-label` is stable
  ("Table of contents and document info").

### Tabbed sheet

- Opens anchored **above** the pill (bottom-right), NOT a full-width
  bottom-sheet. `max-width: ~320px`, `max-height: ~60vh`, internal
  `overflow-y: auto`. This is the deliberate space win over the slim bar.
- **Two tabs** when the doc has headings: **On this page** (default,
  `{@render tocList()}`) and **Info** (`{@render infoRows()}`). `activeTab
  = $state<'toc' | 'info'>('toc')`. Tabs use `role="tab"`/`role="tabpanel"`
  with `aria-selected`; the visible panel is the selected tab only.
- **No headings**: the tab strip is omitted; the sheet renders `infoRows()`
  directly (and the pill already reads `ⓘ Info`).
- Tapping a TOC heading calls `onJump` **and** closes the sheet (`expanded =
  false`). Tapping the pill toggles; tapping the backdrop/outside closes.

### Escape handling (supersedes the prior dead-code bug)

The earlier build's slim-bar `onkeydown` was dead code: `DocReader`'s global
`<svelte:window onkeydown>` closes the whole reader on Escape and shadowed it.
Here, when the sheet is **open**, `DocInfoPanel` registers a **capture-phase**
`window` keydown listener that, on Escape, closes the sheet and calls
`stopPropagation()` — running before `DocReader`'s bubble-phase handler, so
Escape closes the *sheet* first. With the sheet closed, no capture listener is
registered and Escape closes the reader as before. The listener is added/removed
via an `$effect` keyed on `expanded`; cleanup on close/destroy. No shared state
between the two components is required.

### `tocLogic.ts` (new, pure — unit-tested)

- `tocNumber(entries: TocEntry[]): string[]` — returns a display ordinal per
  entry (running counter; the mock shows `1. / 2. / 3.`). Deterministic, pure.
- `condenseMeta(doc): string` — joins the present, meaningful metadata into a
  one-line summary for the collapsed bar, e.g. `author · 2019 · en`. Skips
  missing/`—`/empty fields; joins with ` · `; returns `''` if nothing.
- `activeLabel(entries, numbers, activeAnchor): string | null` — the active
  entry's `"<ordinal>. <text>"`, or `null` if no active entry. (Retained; used
  by the desktop sidebar highlight logic and composed by `pillLabel`.)
- `pillLabel(entries, numbers, activeAnchor): { glyph: string; text: string }`
  — the floating-pill label (see "Narrow-mode revision"): `ⓘ Info` when no
  headings, `§ <ordinal>. <text>` when a section is active, `§ On this page`
  otherwise. Pure; unit-tested across all three branches.

Keeping the observer/DOM logic in the component and the string/number logic pure
means the tricky parts (numbering, condensing, active-label selection) are
tested without a DOM.

### Breakpoint

`~900px` viewport width: at/above → sidebar; below → slim bar. Chosen so a
half-screen desktop window (and all phones) get the slim bar. Tunable; a single
`@media (max-width: 899px)` boundary drives the CSS toggle. Highlight, TOC, and
metadata content are identical across both — only the container/affordance
differs.

## Files

- `src/lib/library/tocLogic.ts` — new pure helpers.
- `src/lib/library/tocLogic.test.ts` — unit tests.
- `src/lib/components/library/DocInfoPanel.svelte` — new panel (sidebar + slim bar).
- `src/lib/components/library/DocReader.svelte` — two-column restructure, observer,
  `activeAnchor`, jump, drop in-body metadata, mount `DocInfoPanel`.
- `src/lib/admin/markdown.ts` — unchanged (anchors already align).

## Testing

- **Pure** (`tocLogic.test.ts`): `tocNumber` (flat + nested levels, empty),
  `condenseMeta` (all fields, missing author, missing date, missing language,
  all missing → `''`), `activeLabel` (active present, active absent → null,
  empty entries).
- **`.svelte`**: `npm run check` (0 errors) + the user's admin-session pass
  (production API CORS + the admin gate block automated e2e, as with the rail
  work). Manual checklist: desktop sidebar highlight-while-scrolling +
  click-to-jump; narrow slim-bar live label, expand/collapse, jump-collapses;
  a heading-less doc shows metadata only.

## Edge cases

- **No headings**: `tocList` hidden; sidebar shows only Document info; slim bar's
  collapsed label falls back to `condenseMeta(doc)`; `ⓘ`/expand still reveal
  metadata. No observer anchors → observer no-ops.
- **Duplicate headings**: duplicate `id`s (same as veritablegames.com);
  `querySelector` resolves the first, topmost-visible still picks sanely. Noted,
  not fixed.
- **Empty body**: info panel still renders metadata; `.doc-body` shows the
  existing `(no body)` note.
- **Rapid document switches**: the `$effect` tears down the prior observer before
  building the next; `activeAnchor` resets to `null` on rebuild so a stale
  highlight can't carry across documents.
- **`activeAnchor` for an anchor not in the current TOC**: no `.active` match →
  no highlight (not an error).

## Out of scope

- h4–h6 in the TOC (kept at h1–h3, as `extractToc` is today).
- Deduplicating repeated heading slugs.
- Any change to the list/grid view, jump rail, or backend.
