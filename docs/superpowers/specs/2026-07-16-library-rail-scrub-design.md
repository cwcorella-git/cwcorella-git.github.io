# Library rail: scrub + live position highlight — design

**Date:** 2026-07-16
**Status:** approved (design), pending plan
**Repo:** `cwcorella-git.github.io` (frontend only — no backend changes)

## Problem

The jump rail is a teleport menu sitting beside a native scrollbar that means
something unrelated. The two aren't linked, so there's no sense of *where you
are* in the 100k-doc ordering, and the rail reads as "off to the side, not
useful." Feedback: make it adaptive and directly linked to areas.

## Goal

The rail carries your position and doubles as a scroll track:

1. **Live "you are here"** — the anchor for the region you're currently viewing
   highlights as you scroll.
2. **Drag-to-scrub** — dragging along the rail flies through the corpus, with a
   floating label; tapping a letter still jumps.

No backend changes: because real rows are rendered, the **top visible row's own
sort field** tells us its bucket (its title/author initial, or its year), so the
highlight and the scrub label are free.

## Approach

### The free signal: a row → its anchor label

A new pure `anchorLabelForRow(sort, row)` in `railLogic.ts` maps a document to
the exact anchor label `buildRail` would place it under, reusing the same
constants (`ALPHA`, `OLD_TAIL_LABEL='‹1800'`, `DECADE_FLOOR=1800`, `floorDecade`):

- **alpha** (`title`/`author`): first char of the field, uppercased; `A`–`Z` →
  that letter, else (non-alpha, null, or empty) → `'#'`.
- **date** (`publication_date`): null/empty/NaN-year → `'undated'`; year `< 1800`
  → `'‹1800'`; else `` `${floorDecade(year)}s` ``.
- **none** (`updated_at`): `null` (no rail, no highlight).

`dir` doesn't affect a row's bucket, so it's not a parameter. Labels are
identical to `buildRail`'s, so `label === anchor.label` matches exactly. A junk
future year (e.g. `9999` → `'9990s'`) simply matches no anchor → no highlight;
harmless.

### Linear scrub mapping

A pure `fractionToIndex(fraction, total)`:
`clamp(round(clamp(fraction,0,1) × (total−1)), 0, total−1)`, `0` when `total ≤ 0`.
Drag position along the rail → fraction → target row index → `scrollToIndex`.
Direction needs no special-casing: the VList data array already reflects
`sort`/`dir`, so fraction 0 = top of the current ordering.

### Component wiring

- **`DocList.svelte`** gains a `sort` prop. `reportVisible` records the top
  index in `topIndex` (`$state`). An `$effect` derives `activeLabel`
  (`$state<string|null>`): it reads `topIndex`, `sort`, and `rowAt(topIndex)` —
  and because `rowAt` internally reads `_version`, the effect re-runs when a
  window lands. It overwrites `activeLabel` **only when the row is loaded**, so
  the label holds its last value over unloaded gaps (no flicker to blank). Passes
  `total`, `activeLabel`, and `onScrubTo={(i) => vlistRef?.scrollToIndex(i)}` to
  the rail.
- **`JumpRail.svelte`** owns the rail DOM and the pointer interaction:
  - **Highlight**: the button whose `label === activeLabel` gets `.active`
    styling (opacity 1, a `▸` caret) and `aria-current="true"`.
  - **Scrub**: `pointerdown` records `startY` and the pointer id but does **not**
    capture (a tap must still fire the button's click). On `pointermove`, once
    the pointer travels past `DRAG_THRESHOLD` (6px), it enters `dragging`,
    captures the pointer, and on each move computes the fraction from the rail's
    `getBoundingClientRect()` and calls `onScrubTo(fractionToIndex(...))`. A
    floating `.scrub-bubble` at the pointer Y shows `activeLabel`.
  - **Tap vs drag**: on `pointerup`/`pointercancel`, if `dragging` it sets
    `justDragged=true` (cleared by the next button click, plus a `setTimeout(…,0)`
    safety reset) so the trailing synthetic click is suppressed; a pure tap never
    captured, so the button's `onclick` → `onSeek` fires normally. Keyboard/click
    access to the buttons is preserved.
  - **Scrub feeds the highlight**: `scrollToIndex` emits scroll → `DocList`'s
    `handleScroll` → `reportVisible` → `topIndex`/`activeLabel` update → bubble
    label follows. Always truthful; lags ~100ms over not-yet-loaded regions,
    never wrong.
- **`+page.svelte`** passes `sort={libraryState.controls.sort}` to `DocList`.

### Rail restyle (parallels the list)

`.rail` becomes `height: 70vh`, `justify-content: space-between`,
`position: relative` (for the bubble), so anchors span the full list height like
a scrollbar track. `touch-action: none` on the vertical rail (prevents the page
scrolling while dragging); the mobile strip keeps `touch-action: pan-x`.

### Scope

- **Desktop/vertical rail gets drag-scrub.** On the mobile horizontal strip,
  `pointerdown` checks the rail's rect — if it's wider than tall (`height <
  width`), scrub is skipped, leaving tap + highlight. (Highlight and tap work in
  both orientations.)
- **The bubble shows the real bucket** (from loaded rows), not a fraction-guessed
  one, so it never lies — at the cost of slight lag over unloaded gaps. (The
  instant-and-exact alternative was the proportional rail, declined for its
  per-bucket-count cost.)

## Files

- `src/lib/library/railLogic.ts` — add `anchorLabelForRow`, `fractionToIndex`.
- `src/lib/library/railLogic.test.ts` — unit tests for both.
- `src/lib/components/library/DocList.svelte` — `sort` prop, `topIndex`,
  `activeLabel`, rail pass-through.
- `src/lib/components/library/JumpRail.svelte` — highlight, scrub, bubble, restyle.
- `src/routes/library/+page.svelte` — pass `sort`.

## Testing

- **Pure** (`railLogic.test.ts`): `anchorLabelForRow` across alpha letters, `'#'`
  (non-alpha / null / empty), author-field selection, decade / `‹1800` /
  `undated` / NaN-year, and `none`-sort → null; `fractionToIndex` at 0 / 1 / mid /
  out-of-range / `total=0`.
- **`.svelte`** (pointer scrub, highlight wiring): `npm run check` +
  the user's admin-session pass (production API CORS + the admin gate block
  automated e2e, as before).

## Edge cases

- **Unloaded scrub region**: `activeLabel` holds its last value until the target
  window lands, then updates. No flicker.
- **`total` null / 0**: `fractionToIndex` returns 0; rail renders (or not, via the
  existing `anchors.length` guard); no crash.
- **Tap after a drag**: suppressed by `justDragged`; safety `setTimeout` prevents
  a stuck flag if no click follows.
- **Junk sort value**: a row whose derived label matches no anchor → no
  highlight (not an error).

## Out of scope

- Proportional (distribution-weighted) anchor spacing — declined.
- Horizontal drag-scrub on the mobile strip — tap + highlight only there for now.
