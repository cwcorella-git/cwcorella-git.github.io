# Library toolbar refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align every toolbar control to one declared height, replace the ambiguous view toggle with VG's segmented pair, rename Corpus → Source, and split Decision out of State.

**Architecture:** Five small tasks on the shipped two-zone toolbar. No backend changes, no new pure logic, no new dependencies. The height fix is a single inherited CSS custom property; the rest is component surface. Verification is by **measuring rendered geometry**, not unit tests — these are visual invariants.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vitest, Playwright (for measurement).

**Design doc:** `docs/superpowers/specs/2026-07-17-library-toolbar-refinements-design.md`

## Global Constraints

- **Svelte 5 runes only** — `$state`/`$derived`/`$effect`/`$props`, `{#snippet}`/`{@render}`. No Svelte 4 (`export let`, `$:`, `<slot />`).
- **No new dependencies.**
- **ONE colour per context.** Hierarchy via **opacity** (0.45–0.65 dim, 1.0 active), **never** a second shade. Chrome `rgba(var(--ui-rgb), X)`; text `var(--clr-text)`. **No hex values, no new colour vars.** Specifically: do NOT copy VG's `bg-blue-600/20 text-blue-400` — a second hue is forbidden here.
- **No resting trigger may render "All …".** `Source` / `Decision` / `State` are control *names*, not values — permitted and required.
- **Dropdown ARIA is `menu`/`menuitem`.** `FacetPanel` supplies `role="menu"` + `aria-haspopup="menu"`; every panel row button carries `role="menuitem"`.
- **The explicit-`undefined` contract:** a patch member set to `undefined` is what clears a filter group when `+page.svelte` spreads `{ ...filters, ...patch }`. `onChange({})` clears nothing. Never "tidy" undefined members away.
- Node 20: `source ~/.nvm/nvm.sh && nvm use 20` before any npm/npx command.
- Typecheck `npm run check` must stay **0 errors, 0 warnings**. Tests `npx vitest run` must stay **182 passing** (this plan adds none).
- `.inner` is `max-width: 760px`.
- **Live API CORS-blocks localhost.** Any browser verification must mock `/facets`, `/documents`, `/curation/stats`, `/tags`. `.superpowers/sdd/task-9-report.md` describes an approach that worked — read it and reuse it. Mocks resolve instantly; that is fine here because every claim in this plan is about **layout**, not latency.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/routes/library/+page.svelte` | declares `--ctl-h`; header cluster | Modify |
| `src/lib/components/library/FacetPanel.svelte` | trigger height + label cap | Modify |
| `src/lib/components/library/LibraryControls.svelte` | sort capsule + view segment | Modify |
| `src/lib/components/library/CorpusControl.svelte` | rest label | Modify |
| `src/lib/components/library/StateControl.svelte` | drops decision group + `stats` prop | Modify |
| `src/lib/components/library/DecisionControl.svelte` | the decision axis | **Create** |

---

### Task 1: One declared control height

Heights are currently derived from content, so any font/padding/element-type difference becomes a height difference. `.view-toggle` sets `font-size: 0.7rem` while everything else is `0.6rem`; the sort control is a `<select>` and the rest are `<button>`s, which browsers size differently.

**Files:**
- Modify: `src/routes/library/+page.svelte` (`.page` rule, ~line 115)
- Modify: `src/lib/components/library/FacetPanel.svelte` (`.trigger`, ~line 64)
- Modify: `src/lib/components/library/LibraryControls.svelte` (`.capsule`, `.cap-sel`, `.cap-btn`, `.view-toggle`, ~lines 81-94)

**Interfaces:**
- Produces: `--ctl-h: 1.75rem`, declared on `.page`. Every control reads `var(--ctl-h, 1.75rem)`. Tasks 2 and 4 rely on this — a new control only needs `height: var(--ctl-h, 1.75rem)` to line up.

> **Why this works across component boundaries:** CSS custom properties **inherit through the DOM**, and Svelte's style scoping only rewrites selectors — it does not stop inheritance. `FacetPanel` and `LibraryControls` render inside `.page`, so both see the value without either hardcoding it. The `, 1.75rem` fallback keeps each component standalone-safe.

- [ ] **Step 1: Declare the variable**

In `src/routes/library/+page.svelte`, add to the existing `.page` rule:

```css
	.page {
		min-height: 100vh;
		padding-top: 4rem;
		/* One height for every toolbar control. Declared here, not in each component:
		   custom properties inherit through the DOM, and Svelte's style scoping does
		   not block that. Heights were previously derived from font + padding, so they
		   disagreed. 1.75rem, not VG's 2rem: their capsule wraps ~14px type, ours 9.6px. */
		--ctl-h: 1.75rem;
	}
```

Keep the rest of the rule as it is.

- [ ] **Step 2: Apply it to the facet trigger**

In `src/lib/components/library/FacetPanel.svelte`, in `.trigger`, replace
`padding: 0.3rem 0.5rem; cursor: pointer; transition: all 0.15s;` with:

```css
		height: var(--ctl-h, 1.75rem);
		padding: 0 0.5rem; /* horizontal only — vertical padding is what derived the height */
		cursor: pointer; transition: all 0.15s;
```

`.trigger` already has `display: flex; align-items: center`, so the content centres itself.

- [ ] **Step 3: Apply it to the sort capsule and view toggle**

In `src/lib/components/library/LibraryControls.svelte`, replace the `.capsule`, `.cap-sel`, `.cap-btn` and `.view-toggle` rules with:

```css
	.capsule {
		display: inline-flex; align-items: center;
		height: var(--ctl-h, 1.75rem);
		border: 1px solid rgba(var(--ui-rgb), 0.28); flex-shrink: 0;
	}
	.cap-sel, .cap-btn {
		height: 100%;
		background: none; border: none; color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0 0.5rem; cursor: pointer;
	}
	.cap-btn { border-left: 1px solid rgba(var(--ui-rgb), 0.28); padding: 0 0.4rem; }
	.view-toggle {
		height: var(--ctl-h, 1.75rem);
		background: none; border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-size: 0.6rem; /* was 0.7rem — the sole reason this control rendered taller */
		padding: 0 0.5rem; cursor: pointer; flex-shrink: 0;
	}
	.capsule:hover, .view-toggle:hover { border-color: rgba(var(--ui-rgb), 0.45); }
```

Task 2 replaces `.view-toggle` entirely; it is corrected here so this task lands complete on its own.

- [ ] **Step 4: Typecheck and test**

```bash
source ~/.nvm/nvm.sh && nvm use 20
npm run check
npx vitest run
```
Expected: 0 errors / 0 warnings; **182 passing**.

- [ ] **Step 5: Measure — every control is the same height**

This is the deliverable; do not skip it. Serve the app (`npm run dev`), drive `/library` at 760px with mocked routes (see Global Constraints), open no panels, and evaluate:

```js
[...document.querySelectorAll('.trigger, .capsule, .view-toggle')].map(el => el.offsetHeight)
```

Expected: **every value identical, and equal to 28** (1.75rem at the default 16px root). Report the actual array. If they differ, something still derives its height — find it, do not paper over it with a magic number.

- [ ] **Step 6: Commit**

```bash
git add src/routes/library/+page.svelte src/lib/components/library/FacetPanel.svelte src/lib/components/library/LibraryControls.svelte
git commit -m "fix(library): declare one control height instead of deriving four

Heights came from font + padding + element type, so they disagreed —
.view-toggle set 0.7rem while everything else was 0.6rem, and a <select>
does not size like a <button>. --ctl-h is declared once on .page and
inherits through Svelte's style scoping; controls read it and pad
horizontally only."
```

---

### Task 2: View becomes a segmented pair

The toggle renders `▤` when the view IS list while its `aria-label` says "switch to grid view" — the glyph is the current state, the control is a destination, and nothing says which. `▤`/`▦` are also font-dependent glyphs.

**Files:**
- Modify: `src/lib/components/library/LibraryControls.svelte`

**Interfaces:**
- Consumes: `--ctl-h` (Task 1).
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Replace the toggle markup**

In `src/lib/components/library/LibraryControls.svelte`, replace the whole `<button class="view-toggle" …>…</button>` element with:

```svelte
		<div class="seg">
			<button
				class="seg-btn"
				class:on={controls.view === 'list'}
				aria-label="List view"
				aria-pressed={controls.view === 'list'}
				title="List view"
				onclick={() => onChange({ view: 'list' })}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
				</svg>
			</button>
			<button
				class="seg-btn"
				class:on={controls.view === 'grid'}
				aria-label="Grid view"
				aria-pressed={controls.view === 'grid'}
				title="Grid view"
				onclick={() => onChange({ view: 'grid' })}
				>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
				</svg>
			</button>
		</div>
```

Both paths are verbatim from VG (`veritable-games-main/frontend/src/components/library/LibraryTagSearchBar.tsx:147-186`). Note each button now **sets a view directly** rather than toggling — that is what removes the ambiguity.

- [ ] **Step 2: Delete `toggleView`**

The `toggleView` function in the same file is now unreachable — the buttons set the view directly. Remove it. (`npm run check` does not flag unused functions, so this will not be caught for you.)

- [ ] **Step 3: Replace the styles**

Replace the `.view-toggle` rule (and its entry in the `:hover` rule) with:

```css
	.seg {
		display: inline-flex; align-items: center;
		height: var(--ctl-h, 1.75rem);
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		overflow: hidden; flex-shrink: 0;
	}
	.seg:hover { border-color: rgba(var(--ui-rgb), 0.45); }
	.seg-btn {
		display: inline-flex; align-items: center; justify-content: center;
		height: 100%; padding: 0 0.45rem;
		background: none; border: none; color: var(--clr-text);
		opacity: 0.5; cursor: pointer; transition: opacity 0.15s, background 0.15s;
	}
	.seg-btn:hover { opacity: 1; }
	/* Active = lit, via opacity + a wash of the SAME colour. Not a second hue —
	   VG uses blue here; the one-colour rule forbids it. */
	.seg-btn.on { opacity: 1; background: rgba(var(--ui-rgb), 0.14); }
	.seg-btn svg { width: 12px; height: 12px; }
```

Keep `.capsule:hover` in place; only `.view-toggle` leaves it.

- [ ] **Step 4: Typecheck and test**

```bash
npm run check
npx vitest run
```
Expected: 0 errors / 0 warnings; **182 passing**.

- [ ] **Step 5: Measure — the segment matches every other control**

At 760px with mocked routes:

```js
[...document.querySelectorAll('.trigger, .capsule, .seg')].map(el => el.offsetHeight)
```

Expected: all identical (28). Also confirm by eye that exactly one of the two buttons is lit, and that clicking the unlit one swaps which is lit.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/library/LibraryControls.svelte
git commit -m "feat(library): view is a segmented pair, not an ambiguous toggle

The old control rendered the CURRENT view's glyph while its label named a
DESTINATION, so nothing said which it meant. Both options are now visible
with the active one lit, and each button sets a view directly. Icons are
VG's inline SVGs; active state uses opacity + a same-colour wash, not VG's
blue — the one-colour rule forbids a second hue."
```

---

### Task 3: `Corpus` → `Source`, and cap the label

`Corpus` is jargon. Separately: Task 4 adds a fourth header control, and four *set* controls overflow 760px — `.scope` has `flex-wrap: wrap`, so the cluster would wrap, reintroducing height variance as a wrapped row.

**Files:**
- Modify: `src/lib/components/library/CorpusControl.svelte`
- Modify: `src/lib/components/library/FacetPanel.svelte`

**Interfaces:**
- Produces: `.label` is capped at `11rem` with an ellipsis; the trigger carries a `title` with the full value. Task 4's fourth control depends on this cap to avoid wrapping.

> **Not "Collection":** `collection` is what the API calls the *category* — the child of a source. Naming the parent control after its child conflates the levels. **Not "Library":** it would sit inches from the `LIBRARY` page title.

- [ ] **Step 1: Rename**

In `src/lib/components/library/CorpusControl.svelte`, change `restLabel="Corpus"` to `restLabel="Source"` on the `<FacetPanel>`. Change nothing else — `◈`, `ariaLabel`, and the filter values are all unaffected.

- [ ] **Step 2: Cap the label and add the title**

In `src/lib/components/library/FacetPanel.svelte`, the trigger currently renders:

```svelte
		{#if label}<span class="label">{label}</span>{:else if restLabel}<span class="label">{restLabel}</span>{/if}
```

Add a `title` to the **button** so the full value is recoverable when the label is clipped. Change the opening `<button class="trigger"` element's attributes to include:

```svelte
		title={label || restLabel || ariaLabel}
```

Then **create** a base `.label` rule — the file currently has none. Its only `.label` reference is inside `@media (max-width: 480px)` at line 94 (`display: none`). Add the new rule to the main style block, next to `.chev`:

```css
	/* A SET label is a value and can be long — the worst real one is
	   "Anarchist Library ▸ Anarcho-syndicalism". Four set controls otherwise
	   overflow 760px and .scope wraps, which puts the height variance back.
	   Full value stays in the trigger's title. */
	.label {
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
```

Do **not** touch the existing `@media (max-width: 480px) { .label { display: none; } }` rule.

- [ ] **Step 3: Typecheck and test**

```bash
npm run check
npx vitest run
```
Expected: 0 errors / 0 warnings; **182 passing**.

- [ ] **Step 4: Verify the rename and the cap**

At 760px with mocked routes: the resting header reads `◈ SOURCE`, not `◈ CORPUS`. Then set the corpus filter to a long value and confirm the label clips with an ellipsis rather than growing, and that hovering the trigger shows the full value.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/library/CorpusControl.svelte src/lib/components/library/FacetPanel.svelte
git commit -m "feat(library): rename Corpus to Source; cap set labels

Corpus was jargon. Not 'Collection' — that is what the API calls the CHILD
(a category within a source), so it would conflate the two levels.

A set label is a value and can be long; four set controls overflow 760px and
.scope wraps, which would reintroduce the height variance. Capped at 11rem
with an ellipsis, full value in the title."
```

---

### Task 4: Split Decision out of State

`⚙ State` holds visibility, formatting and decision. Decision is the axis actively being worked (`0 / 100,417 decided`); the other two are near-dead weight — `public` is **exactly** the `user` source count (2,521), so Visibility nearly restates Source, and `needs_formatting` covers 317 of 100,417 docs (0.3%).

**Files:**
- Create: `src/lib/components/library/DecisionControl.svelte`
- Modify: `src/lib/components/library/StateControl.svelte`
- Modify: `src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: `--ctl-h` (Task 1); the `.label` cap (Task 3).
- Produces:
```ts
// DecisionControl
{ stats: CurationStats | null; decision: DecisionInput | undefined;
  onChange: (patch: { decision?: DecisionInput }) => void }

// StateControl — facets only; stats MOVES OUT
{ facets: Facets | null; visibility: string | undefined;
  needs_formatting: 0 | 1 | undefined;
  onChange: (patch: { visibility?: string; needs_formatting?: 0 | 1 }) => void }
```
Header order: `◈ Source · 文 · ◉ Decision · ⚙ State`.

- [ ] **Step 1: Create `DecisionControl.svelte`**

```svelte
<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { DecisionInput, CurationStats } from '$lib/library/types';

	interface Props {
		stats: CurationStats | null;
		decision: DecisionInput | undefined;
		onChange: (patch: { decision?: DecisionInput }) => void;
	}

	const { stats, decision, onChange }: Props = $props();

	let open = $state(false);

	const DECISIONS: DecisionInput[] = ['undecided', 'keep', 'hide', 'delete'];

	// Counts come from /curation/stats, NOT the facets payload — curation lives in a
	// separate table and its stats never narrow by source. A null stats (best-effort
	// fetch) degrades to no counts rather than crashing.
	const counts = $derived<Record<string, string>>(
		stats
			? {
					undecided: stats.undecided.toLocaleString(),
					keep: stats.keep.toLocaleString(),
					hide: stats.hide.toLocaleString(),
					delete: stats.delete.toLocaleString()
				}
			: {}
	);

	function pick(v: DecisionInput | undefined) {
		// Explicit undefined clears the group when the parent spreads the patch.
		onChange({ decision: v });
		open = false;
	}
</script>

<FacetPanel
	glyph="◉"
	label={decision ?? ''}
	restLabel="Decision"
	ariaLabel="Filter by curation decision"
	{open}
	onToggle={(v) => (open = v)}
>
	{#snippet children()}
		<button class="row" role="menuitem" class:sel={!decision} onclick={() => pick(undefined)}>
			<span>all</span>
		</button>
		<div class="divider"></div>
		{#each DECISIONS as d (d)}
			<button class="row" role="menuitem" class:sel={decision === d} onclick={() => pick(d)}>
				<span>{d}</span>
				<span class="c">{counts[d] ?? ''}</span>
			</button>
		{/each}
	{/snippet}
</FacetPanel>

<style>
	.row {
		display: flex; justify-content: space-between; align-items: center; gap: 1rem;
		width: 100%; background: none; border: none; cursor: pointer;
		color: var(--clr-text); opacity: 0.7;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.04em;
		padding: 0.25rem 0.7rem; text-align: left; transition: opacity 0.12s;
	}
	.row:hover { opacity: 1; }
	.row.sel { opacity: 1; background: rgba(var(--ui-rgb), 0.12); }
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.3rem 0; }
</style>
```

- [ ] **Step 2: Strip decision out of `StateControl.svelte`**

Remove from `src/lib/components/library/StateControl.svelte`:
- the `stats` prop — from `Props` (line 7), from the `$props()` destructure (line 18), and from the type import on line 3: `CurationStats` becomes unused, so the import must become `import type { Facets, DecisionInput } from '$lib/library/types';` — and then `DecisionInput` goes too, since the decision group leaves with it, leaving `import type { Facets } from '$lib/library/types';`,
- the `decision` prop,
- `decisionCounts`,
- the whole `DECISION` group markup (its `<p class="hd">decision</p>`, its `all` row, its `{#each}`, and the `<div class="divider">` that precedes the heading),
- `decision` from the `onChange` patch type and from the `label` derivation.

The `label` derivation must end up:

```ts
	const label = $derived(
		[
			visibility,
			needs_formatting === undefined ? undefined : needs_formatting === 1 ? 'needs fmt' : 'clean'
		]
			.filter(Boolean)
			.join(' · ')
	);
```

> **Keep the `needs_formatting === 0` handling exactly as written.** `0` is falsy — the ternary must map it to the string `'clean'` *before* `.filter(Boolean)` runs, or "clean" silently vanishes from the trigger. This is a live trap; do not "simplify" it.

- [ ] **Step 3: Wire it into the header**

In `src/routes/library/+page.svelte`: import `DecisionControl`, insert it **between** `LanguageControl` and `StateControl`, and remove `stats` + `decision` from `<StateControl>`.

```svelte
					<DecisionControl
						stats={libraryState.curationStats}
						decision={libraryState.controls.filters.decision}
						onChange={(patch) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, ...patch }
							})}
					/>
					<StateControl
						facets={libraryState.facets}
						visibility={libraryState.controls.filters.visibility}
						needs_formatting={libraryState.controls.filters.needs_formatting}
						onChange={(patch) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, ...patch }
							})}
					/>
```

- [ ] **Step 4: Typecheck and test**

```bash
npm run check
npx vitest run
```
Expected: 0 errors / 0 warnings; **182 passing**. `check` will flag a leftover `stats`/`CurationStats` in `StateControl` — fix rather than suppress.

- [ ] **Step 5: Measure — four controls, one row, no wrap**

This is the deliverable and it tests the spec's **unverified arithmetic**. At 760px with mocked routes, set **all four** controls to their worst-case values:
`corpus = { source: 'anarchist', collection: 'Anarcho-syndicalism' }`, `language = 'en-GB'`, `decision = 'undecided'`, `visibility = 'private'`, `needs_formatting = 1`.

Then evaluate:

```js
const scope = document.querySelector('.scope');
const trig = document.querySelector('.trigger');
({ scopeH: scope.offsetHeight, ctlH: trig.offsetHeight,
   wrapped: scope.offsetHeight > trig.offsetHeight + 2,
   pageScrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth })
```

Expected: `wrapped: false` and `pageScrolls: false`. Report the actual numbers.

**If it wraps, the 11rem cap is wrong — the measurement wins, not the spec.** Lower the cap in `FacetPanel.svelte`'s `.label` until it does not wrap, and report the value you landed on and why.

- [ ] **Step 6: Verify narrow mode still holds**

At 400px: four glyph-only triggers on the title's line, no wrap. (`FacetPanel`'s existing `@media` hides all four labels.) Note a **pre-existing** ~28px horizontal page overflow at 400px from `JumpRail` — that is documented in `docs/superpowers/specs/2026-07-17-library-open-followups.md` and is NOT yours to fix; report it if you see it, do not chase it.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/library/DecisionControl.svelte src/lib/components/library/StateControl.svelte src/routes/library/+page.svelte
git commit -m "feat(library): split Decision out of State

Decision is the axis actively being worked (0 / 100,417 decided) and now has
its own header control. Visibility and formatting stay merged behind State:
public is EXACTLY the user source count so visibility nearly restates Source,
and needs_formatting covers 317 of 100,417 docs.

stats moves to DecisionControl rather than being left dangling on StateControl."
```

---

### Task 5: Ship

**Files:** none (git + deploy).

- [ ] **Step 1: Verify from a clean state**

```bash
source ~/.nvm/nvm.sh && nvm use 20
npx vitest run   # 182 passing
npm run check    # 0 errors, 0 warnings
npm run build    # must succeed — adapter-static
git status --short  # clean; no stray .playwright-mcp/ or build artifacts
```

- [ ] **Step 2: Merge to main**

```bash
git checkout main
git merge --no-ff library-toolbar-refinements
npx vitest run   # re-verify ON the merged result
```

- [ ] **Step 3: Push — this deploys**

```bash
git push origin main
```

Pushing `main` triggers the Deploy workflow (Cloudflare Pages + the GitHub Pages archive). Confirm it went green:

```bash
gh run list --limit 1 --branch main --json status,conclusion -q '.[0].status+"/"+.[0].conclusion'
```
Expected: `completed/success`.

- [ ] **Step 4: Confirm live**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://cwcorella.com/library
```
Expected: `200`.

**No backend deploy.** This plan changes no API contract; `library-api` is untouched.

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| One declared height (`--ctl-h` on `.page`, inherited) | 1 |
| `.view-toggle`'s 0.7rem removed | 1 (Step 3) |
| View → segmented pair, VG's inline SVGs, no blue | 2 |
| `Corpus` → `Source` | 3 |
| Label cap 11rem + ellipsis + `title` | 3 |
| Decision splits out; `stats` moves; State keeps visibility+formatting | 4 |
| Narrow mode unaffected | 4 (Step 6) |
| Verify by measuring, not unit tests | 1/2/4 (Step 5s) |
| Language in site header | **Non-goal — no task, by design** |

**Type consistency:** `--ctl-h` is declared in Task 1 and consumed by Tasks 2 and 4 with the same `var(--ctl-h, 1.75rem)` fallback. `DecisionControl`'s props (Task 4) match the spec's interface block exactly. `StateControl`'s `onChange` patch type drops `decision` in the same task that adds `DecisionControl`, so no window exists where both or neither owns it.

**Ordering:** 1 → 2 (Task 2's `.seg` needs `--ctl-h`). 3 → 4 (Task 4's fourth control needs the label cap, or it wraps). Task 5 last.

**Known risk, flagged not hidden:** the 11rem cap is derived from arithmetic in the spec that nothing has measured. Task 4 Step 5 is written to falsify it, and says plainly that the measurement wins.
