# Library toolbar refinements — design

**Date:** 2026-07-17
**Status:** approved (design), pending plan
**Repo:** `cwcorella-git.github.io` (frontend only — **no backend changes**)
**Follows:** `2026-07-16-library-toolbar-design.md` (shipped; read its revision note first)

## Problem

The two-zone toolbar shipped and works. Five refinements, from using it:

1. **Control heights don't line up.** `.view-toggle` sets `font-size: 0.7rem` while every
   other control is `0.6rem` (`LibraryControls.svelte:91`), so it renders taller. The sort
   control is a `<select>` and the rest are `<button>`s — browsers size those differently
   from UA styles. **Nothing declares a height**, so every font, padding or element-type
   difference becomes a height difference.
2. **The view toggle is ambiguous.** It renders `▤` when the view IS list, while its
   `aria-label` reads "switch to grid view" — the glyph is the *current* state but the
   control is a *destination*. Nothing on screen says which. `▤`/`▦` are also font-dependent
   glyphs that render inconsistently.
3. **"Corpus" is jargon** the user never reached for.
4. **`⚙ State` buries the axis actually being worked.** It holds visibility, formatting and
   decision. Decision is the live task (`0 / 100,417 decided`); the other two are near-dead
   weight (see below). The header has ~350px of unused space beside the title.
5. Language belongs in the site header — **out of scope, see Non-goals.**

## Design

### 1. One declared height

`--ctl-h: 1.75rem` is set on `.page` in `src/routes/library/+page.svelte`. **CSS custom
properties inherit through the DOM regardless of Svelte's style scoping**, so `FacetPanel`,
the sort capsule and the view segment all read it without each hardcoding the value and
drifting apart. Consumers use `var(--ctl-h, 1.75rem)` — the fallback keeps a component
standalone-safe.

Every control: `height: var(--ctl-h, 1.75rem)`, `align-items: center`, padding
**horizontal-only** (vertical padding is what made height content-derived). The `0.7rem`
font disappears with the toggle that carried it.

**Why 1.75rem and not VG's `h-8` (2rem):** VG's capsule wraps ~14px type; ours is 9.6px.
Scaled to VG's proportions ours would be ~22px, so 28px is already *more* generous relative
to its type. At 32px the glyph floats in an empty box.

### 2. View becomes a segmented pair

A bordered capsule holding two buttons, list then grid, replacing the single toggle. Both
icons are inline SVG at 12px on a `0 0 24 24` viewBox, `fill="none" stroke="currentColor"`,
`stroke-width="2"`, round caps/joins — copied verbatim from VG
(`veritable-games-main/frontend/src/components/library/LibraryTagSearchBar.tsx:147-186`):

- **list:** `M4 6h16M4 12h16M4 18h16`
- **grid:** `M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z`

Active: `opacity: 1` + `background: rgba(var(--ui-rgb), 0.14)`. Inactive: `opacity: 0.5`.
**Not VG's `bg-blue-600/20 text-blue-400`** — the one-colour rule forbids a second hue, and
opacity already carries hierarchy.

Each button carries `aria-pressed={view === 'list'}` / `'grid'`. Both options visible with
one lit removes the current-vs-destination ambiguity entirely.

### 3. `Corpus` → `Source`

`restLabel="Corpus"` becomes `restLabel="Source"`. Glyph `◈` unchanged.

**Not "Collection"** (the first instinct): `collection` is what the API calls the *category*
— the child of a source. Naming the parent control after its child conflates the two levels,
and `collection=` would then mean something narrower than the control named for it.
**Not "Library"**: `◈ Library` would sit inches from the `LIBRARY` page title.
`Source` is what the top level actually is and what the API param is called.

### 4. Decision splits out of State

New `DecisionControl.svelte` — glyph `◉`, `restLabel="Decision"`, consuming `FacetPanel` and
`CurationStats`. `StateControl` keeps visibility + formatting and drops its decision group.

**`StateControl` loses its `stats` prop entirely** — `stats` was only ever the source of the
decision counts, so it moves to `DecisionControl` rather than being left dangling. Their
props become:

```ts
// DecisionControl
{ stats: CurationStats | null; decision: DecisionInput | undefined;
  onChange: (patch: { decision?: DecisionInput }) => void }

// StateControl — facets only; no stats
{ facets: Facets | null; visibility: string | undefined;
  needs_formatting: 0 | 1 | undefined;
  onChange: (patch: { visibility?: string; needs_formatting?: 0 | 1 }) => void }
```

Both keep the **explicit-`undefined`** contract: a patch member set to `undefined` is what
clears that group when `+page.svelte` spreads `{ ...filters, ...patch }`. `onChange({})`
clears nothing. `DecisionControl` needs no `facets` — its counts come from `stats`.

Header becomes: `◈ Source · 文 · ◉ Decision · ⚙ State`.

**Why only decision splits.** Measured 2026-07-17: `public` = 2,521, **exactly** the `user`
source count — so Visibility nearly restates Source. `needs_formatting` = 317 of 100,417
(0.3%). Neither earns a permanent header slot. Decision is the axis being actively worked.

Its own file, not a prop on `StateControl`: distinct axis, distinct data source
(`/curation/stats`, which never narrows by source), and `StateControl` is already the
busiest control.

### 5. Label cap

Four *set* controls overflow 760px and the cluster wraps — which would reintroduce the
height variance this spec exists to remove, as a wrapped row.

`.label` in `FacetPanel.svelte` gets `max-width: 11rem; overflow: hidden; text-overflow:
ellipsis; white-space: nowrap`, and the trigger gets a `title` carrying the full value.

Arithmetic behind 11rem: at 760px the cluster has ~614px after the title; four triggers cost
~211px in chrome and gaps; `文 en-GB` + `◉ undecided` + `⚙ private · needs fmt` ≈ 225px;
leaving ~178px for Source, whose worst real label
(`ANARCHIST LIBRARY ▸ ANARCHO-SYNDICALISM`) wants ~215px. 11rem = 176px.

**This arithmetic is a prediction, not a measurement.** The plan verifies it by measuring
rendered rects at 760px. If it is wrong, the measurement wins.

Only Source realistically hits the cap; the others are capped for safety.

### 6. Narrow mode — unaffected

Four glyphs at 400px ≈ 140px plus the title. `FacetPanel`'s existing
`@media (max-width: 480px) { .label { display: none; } }` already hides all four labels.

## Testing

These are **visual invariants**; unit tests cannot see them.

- **Height:** measure `offsetHeight` across every control in both zones — all equal.
- **Wrap:** with all four controls set to their worst-case values at 760px, assert the
  cluster's `offsetHeight` equals one control's (i.e. it did not wrap), and that no label's
  `scrollWidth` exceeds its `clientWidth` without an ellipsis rendering.
- **Narrow:** at 400px, four glyph-only triggers on the title's line, no page scroll.

Verification runs against **mocked API routes** (the live API CORS-blocks localhost). Mocks
resolve instantly — fine here, since every claim in this spec is about layout, not latency.

No new pure logic, so no new unit tests. `corpusLogic`/`libraryLogic` are untouched.

## Non-goals

- **Language in the main site header.** Wiring a global language preference to this page's
  filter touches the public static site's header and an admin-only page's state. Different
  blast radius, own spec.
- Re-litigating the merged `⚙ State` groups, the `menu`/`menuitem` ARIA, or the Enter
  exact-match rule — all settled in the previous spec.

## Constraints

- Svelte 5 runes only. No new dependencies.
- ONE colour per context; hierarchy via **opacity** (0.45–0.65 dim, 1.0 active), never a
  second shade. Chrome `rgba(var(--ui-rgb), X)`; text `var(--clr-text)`.
- No resting trigger may render "All …". `Source`/`Decision`/`State` are control *names*,
  not values — permitted, and required by the previous spec's Zone-1 table.
- `.inner` is `max-width: 760px`.
