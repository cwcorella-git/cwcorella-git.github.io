# Library rail scrub + live highlight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (or subagent-driven-development) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the jump rail carry your position — a live "you are here" highlight plus drag-to-scrub — with no backend changes.

**Architecture:** A pure `anchorLabelForRow(sort, row)` maps the top-visible row to its anchor label (free, from cached row data); a pure `fractionToIndex(fraction, total)` maps a drag position to a row index. `DocList` derives `activeLabel` from the top row and passes it + `total` + an `onScrubTo` scroller to `JumpRail`, which renders the highlight, handles pointer-drag scrubbing, and shows a floating label bubble while keeping tap-to-jump.

**Tech Stack:** SvelteKit 2 / Svelte 5 runes + virtua/svelte; vitest for the pure module.

## Global Constraints

- Frontend only — NO backend changes.
- Node 20. Before npm: `export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20` (verify `node -v` = v20.x). Gates: `npm test`, `npm run check`.
- `anchorLabelForRow` labels MUST equal `buildRail`'s exactly (reuse `ALPHA`/`OLD_TAIL_LABEL`/`DECADE_FLOOR`/`floorDecade` in `railLogic.ts`).
- Preserve keyboard/click access to rail buttons; scrub is a pointer enhancement.
- Do not regress the shipped offset-windowing behavior (tap-to-jump via `onSeek`, window loading on scroll).

---

## Task 1: Pure rail helpers (`anchorLabelForRow`, `fractionToIndex`)

**Files:**
- Modify: `src/lib/library/railLogic.ts`
- Test: `src/lib/library/railLogic.test.ts`

**Interfaces:**
- Produces: `anchorLabelForRow(sort: string, row: {title?; author?; publication_date?}): string | null`; `fractionToIndex(fraction: number, total: number): number`.

- [ ] **Step 1: Write failing tests** — append to `src/lib/library/railLogic.test.ts`:

```ts
import { anchorLabelForRow, fractionToIndex } from './railLogic';

describe('anchorLabelForRow', () => {
	const row = (o: Partial<{ title: string | null; author: string | null; publication_date: string | null }>) =>
		({ title: null, author: null, publication_date: null, ...o }) as any;

	it('title initial → uppercase letter', () => {
		expect(anchorLabelForRow('title', row({ title: 'Macbeth' }))).toBe('M');
		expect(anchorLabelForRow('title', row({ title: 'macbeth' }))).toBe('M');
	});
	it('non-alpha / empty / null title → #', () => {
		expect(anchorLabelForRow('title', row({ title: '"Quoted"' }))).toBe('#');
		expect(anchorLabelForRow('title', row({ title: '123' }))).toBe('#');
		expect(anchorLabelForRow('title', row({ title: '' }))).toBe('#');
	});
	it('author sort uses the author field; null author → #', () => {
		expect(anchorLabelForRow('author', row({ author: 'Kropotkin', title: 'Zzz' }))).toBe('K');
		expect(anchorLabelForRow('author', row({ author: null, title: 'Zzz' }))).toBe('#');
	});
	it('publication_date → decade / ‹1800 / undated', () => {
		expect(anchorLabelForRow('publication_date', row({ publication_date: '1902' }))).toBe('1900s');
		expect(anchorLabelForRow('publication_date', row({ publication_date: '2025-03-01' }))).toBe('2020s');
		expect(anchorLabelForRow('publication_date', row({ publication_date: '1776' }))).toBe('‹1800');
		expect(anchorLabelForRow('publication_date', row({ publication_date: null }))).toBe('undated');
		expect(anchorLabelForRow('publication_date', row({ publication_date: '' }))).toBe('undated');
		expect(anchorLabelForRow('publication_date', row({ publication_date: 'abcd' }))).toBe('undated');
	});
	it('non-rail sort → null', () => {
		expect(anchorLabelForRow('updated_at', row({ title: 'X' }))).toBeNull();
	});
});

describe('fractionToIndex', () => {
	it('maps 0 and 1 to ends', () => {
		expect(fractionToIndex(0, 1000)).toBe(0);
		expect(fractionToIndex(1, 1000)).toBe(999);
	});
	it('maps the middle', () => {
		expect(fractionToIndex(0.5, 1001)).toBe(500);
	});
	it('clamps out-of-range fractions', () => {
		expect(fractionToIndex(-0.2, 1000)).toBe(0);
		expect(fractionToIndex(1.5, 1000)).toBe(999);
	});
	it('total <= 0 → 0', () => {
		expect(fractionToIndex(0.5, 0)).toBe(0);
	});
});
```

Note: `railLogic.test.ts` already has a top-of-file `import { describe, it, expect } from 'vitest'` and imports from `./railLogic` — add the two new names to the existing import (or a second import line) rather than duplicating the vitest import.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/library/railLogic.test.ts`
Expected: FAIL (`anchorLabelForRow`/`fractionToIndex` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/library/railLogic.ts` (after `buildRail`; reuses the file's existing `ALPHA`, `OLD_TAIL_LABEL`, `DECADE_FLOOR`, `floorDecade`, `railKind`):

```ts
/** The anchor label a given row falls under — the inverse of buildRail, used for
 *  the live "you are here" highlight. `dir`-independent (a row's bucket is the
 *  same in both directions). Labels match buildRail's exactly. */
export function anchorLabelForRow(
	sort: string,
	row: { title?: string | null; author?: string | null; publication_date?: string | null }
): string | null {
	const kind = railKind(sort);
	if (kind === 'alpha') {
		const field = sort === 'author' ? row.author : row.title;
		const ch = (field ?? '').trim().charAt(0).toUpperCase();
		return ch >= 'A' && ch <= 'Z' ? ch : '#';
	}
	if (kind === 'date') {
		const raw = row.publication_date;
		if (raw == null || raw === '') return 'undated';
		const year = parseInt(raw.slice(0, 4), 10);
		if (Number.isNaN(year)) return 'undated';
		if (year < DECADE_FLOOR) return OLD_TAIL_LABEL;
		return `${floorDecade(year)}s`;
	}
	return null;
}

/** Map a drag fraction [0,1] along the rail to a row index [0, total-1]. */
export function fractionToIndex(fraction: number, total: number): number {
	if (total <= 0) return 0;
	const clamped = Math.min(Math.max(fraction, 0), 1);
	return Math.min(Math.max(Math.round(clamped * (total - 1)), 0), total - 1);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- src/lib/library/railLogic.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/railLogic.ts src/lib/library/railLogic.test.ts
git commit -m "feat(library): anchorLabelForRow + fractionToIndex for rail scrub"
```

---

## Task 2: `JumpRail` — highlight, scrub, bubble, restyle

**Files:**
- Modify: `src/lib/components/library/JumpRail.svelte`

**Interfaces:**
- Consumes: `fractionToIndex` (Task 1).
- Produces: props `anchors`, `onSeek`, `total: number | null`, `activeLabel: string | null`, `onScrubTo: (index: number) => void`.

- [ ] **Step 1: Replace the component** with:

```svelte
<script lang="ts">
	import type { RailAnchor } from '$lib/library/railLogic';
	import { fractionToIndex } from '$lib/library/railLogic';

	interface Props {
		anchors: RailAnchor[];
		onSeek: (seek: string | null) => void;
		total: number | null;
		activeLabel: string | null;
		onScrubTo: (index: number) => void;
	}

	const { anchors, onSeek, total, activeLabel, onScrubTo }: Props = $props();

	const DRAG_THRESHOLD = 6; // px of travel before a press becomes a scrub

	let railEl: HTMLElement | undefined = $state();
	let dragging = $state(false);
	let bubbleY = $state(0);
	let justDragged = false;
	let startY = 0;
	let activePointer: number | null = null;

	function scrubToClientY(clientY: number) {
		if (!railEl || !total) return;
		const rect = railEl.getBoundingClientRect();
		const y = Math.min(Math.max(clientY - rect.top, 0), rect.height);
		bubbleY = y;
		onScrubTo(fractionToIndex(y / rect.height, total));
	}

	function onPointerDown(e: PointerEvent) {
		if (e.button !== 0 && e.button !== -1) return; // primary/pen only
		if (!railEl) return;
		const rect = railEl.getBoundingClientRect();
		if (rect.height < rect.width) return; // horizontal (mobile strip) → tap only
		startY = e.clientY;
		activePointer = e.pointerId;
		// no capture yet — a tap must still fire the button's click
	}

	function onPointerMove(e: PointerEvent) {
		if (activePointer === null || e.pointerId !== activePointer) return;
		if (!dragging) {
			if (Math.abs(e.clientY - startY) < DRAG_THRESHOLD) return;
			dragging = true;
			railEl?.setPointerCapture(activePointer);
		}
		scrubToClientY(e.clientY);
	}

	function endPointer(e: PointerEvent) {
		if (activePointer === null || e.pointerId !== activePointer) return;
		if (dragging) {
			justDragged = true; // suppress the trailing synthetic click on a button
			setTimeout(() => {
				justDragged = false;
			}, 0);
			try {
				railEl?.releasePointerCapture(activePointer);
			} catch {
				/* pointer already released */
			}
		}
		dragging = false;
		activePointer = null;
	}

	function onButtonClick(seek: string | null) {
		if (justDragged) {
			justDragged = false;
			return;
		}
		onSeek(seek);
	}
</script>

{#if anchors.length > 0}
	<nav
		class="rail"
		class:dragging
		aria-label="jump to"
		bind:this={railEl}
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={endPointer}
		onpointercancel={endPointer}
	>
		{#each anchors as a (a.label)}
			<button
				class="rail-btn"
				class:active={a.label === activeLabel}
				aria-current={a.label === activeLabel ? 'true' : undefined}
				onclick={() => onButtonClick(a.seek)}
				title={'jump to ' + a.label}
			>
				{a.label}
			</button>
		{/each}
		{#if dragging && activeLabel}
			<span class="scrub-bubble" style="top: {bubbleY}px" aria-hidden="true">{activeLabel}</span>
		{/if}
	</nav>
{/if}

<style>
	.rail {
		position: relative;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		height: 70vh;
		flex-shrink: 0;
		padding-left: 0.4rem;
		touch-action: none; /* dragging the rail must not scroll the page */
		user-select: none;
	}
	.rail-btn {
		background: none;
		border: none;
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.05em;
		line-height: 1.35;
		padding: 0 0.25rem;
		cursor: pointer;
		opacity: 0.4;
		transition: opacity 0.1s;
		text-align: center;
	}
	.rail-btn:hover {
		opacity: 1;
	}
	.rail-btn.active {
		opacity: 1;
		font-weight: 700;
	}
	.rail-btn.active::before {
		content: '▸';
		position: absolute;
		margin-left: -0.7rem;
	}
	.scrub-bubble {
		position: absolute;
		right: 100%;
		margin-right: 0.4rem;
		transform: translateY(-50%);
		padding: 0.15rem 0.4rem;
		background: var(--clr-text);
		color: var(--clr-bg, #000);
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		white-space: nowrap;
		pointer-events: none;
	}

	/* Below the mobile breakpoint the rail is a horizontal scroll strip: no scrub
	   (pointerdown bails on a wider-than-tall rect), taps + highlight still work. */
	@media (max-width: 480px) {
		.rail {
			flex-direction: row;
			justify-content: flex-start;
			height: auto;
			gap: 0.05rem;
			overflow-x: auto;
			padding-left: 0;
			margin-bottom: 0.5rem;
			touch-action: pan-x;
		}
	}
</style>
```

Note: `--clr-bg` may not exist as a CSS var; the `#000` fallback keeps the bubble text readable. If the theme defines a background var, swapping it in is a fine follow-up but not required.

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: errors ONLY in `DocList.svelte` (it still passes the old `<JumpRail>` prop set — `total`/`activeLabel`/`onScrubTo` missing). Fixed in Task 3. `JumpRail.svelte` itself clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/library/JumpRail.svelte
git commit -m "feat(library): scrub + live highlight + bubble on the jump rail"
```

---

## Task 3: `DocList` + `+page` wiring (closes green)

**Files:**
- Modify: `src/lib/components/library/DocList.svelte`
- Modify: `src/routes/library/+page.svelte`

**Interfaces:**
- Consumes: `anchorLabelForRow` (Task 1); the new `JumpRail` props (Task 2).

- [ ] **Step 1: Update `DocList.svelte`.** Add the `sort` prop, track `topIndex`, derive `activeLabel`, and pass the new props to `JumpRail`. Replace the `<script>` block with:

```svelte
<script lang="ts">
	import { VList, type VListHandle } from 'virtua/svelte';
	import DocRow from './DocRow.svelte';
	import DocCard from './DocCard.svelte';
	import JumpRail from './JumpRail.svelte';
	import type { DocListItem } from '$lib/library/types';
	import { anchorLabelForRow, type RailAnchor } from '$lib/library/railLogic';

	interface Props {
		total: number | null;
		rowAt: (index: number) => DocListItem | undefined;
		view: 'list' | 'grid';
		sort: string;
		queryKey: string;
		onOpen: (id: number | string) => void;
		onVisibleRange: (start: number, end: number) => void;
		resolveJumpIndex: (seek: string | null) => Promise<number>;
		anchors: RailAnchor[];
	}

	const {
		total,
		rowAt,
		view,
		sort,
		queryKey,
		onOpen,
		onVisibleRange,
		resolveJumpIndex,
		anchors
	}: Props = $props();

	let vlistRef: VListHandle | undefined = $state();
	let topIndex = $state<number | null>(null);

	// Index array of length `total`; VList renders only the visible slice.
	const slots = $derived(total ? Array.from({ length: total }, (_, i) => i) : []);

	// Live "you are here": the top visible row's own field decides its anchor
	// bucket. `rowAt` reads _version internally, so this re-runs when a window
	// lands; only overwrite when the row is loaded, so the label holds over gaps.
	let activeLabel = $state<string | null>(null);
	$effect(() => {
		if (topIndex === null) return;
		const row = rowAt(topIndex);
		if (row) activeLabel = anchorLabelForRow(sort, row);
	});

	function reportVisible(offset: number) {
		if (!vlistRef) return;
		const vp = vlistRef.getViewportSize();
		const start = vlistRef.findItemIndex(offset);
		const end = vlistRef.findItemIndex(offset + vp);
		topIndex = start;
		onVisibleRange(start, end);
	}

	function handleScroll(offset: number) {
		reportVisible(offset);
	}

	async function handleJump(seek: string | null) {
		const index = await resolveJumpIndex(seek);
		vlistRef?.scrollToIndex(index);
		onVisibleRange(index, index);
	}

	function handleScrubTo(index: number) {
		vlistRef?.scrollToIndex(index);
	}

	// New query = fresh list: scroll to top. (libraryState already reset the cache.)
	let prevQueryKey: string | undefined;
	$effect(() => {
		const previous = prevQueryKey;
		prevQueryKey = queryKey;
		if (previous !== undefined && queryKey !== previous) {
			vlistRef?.scrollTo(0);
		}
	});

	// Once total is known (or grows into view), ensure the visible window loads —
	// also covers a viewport taller than the first fetched window.
	$effect(() => {
		void total;
		if (!vlistRef || !total) return;
		reportVisible(vlistRef.getScrollOffset());
	});
</script>
```

- [ ] **Step 2: Update the `<JumpRail>` usage** in `DocList.svelte`'s template — replace the existing `<JumpRail {anchors} onSeek={handleJump} />` line with:

```svelte
			<JumpRail
				{anchors}
				onSeek={handleJump}
				{total}
				{activeLabel}
				onScrubTo={handleScrubTo}
			/>
```

(Leave the rest of the template and `<style>` unchanged.)

- [ ] **Step 3: Pass `sort` from `+page.svelte`** — in the `<DocList>` block, add the `sort` prop (after `view`):

```svelte
					<DocList
						total={libraryState.total}
						rowAt={(i) => libraryState.rowAt(i)}
						view={libraryState.controls.view}
						sort={libraryState.controls.sort}
						queryKey={libraryState.queryKey}
						onOpen={(id) => libraryState.openDocById(id)}
						onVisibleRange={(s, e) => libraryState.ensureWindowsForRange(s, e)}
						resolveJumpIndex={(seek) => libraryState.jumpToAnchor(seek)}
						{anchors}
					/>
```

- [ ] **Step 4: Type-check + tests**

Run: `npm run check` — expected: **0 errors**.
Run: `npm test` — expected: all green (railLogic tests included).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/library/DocList.svelte src/routes/library/+page.svelte
git commit -m "feat(library): wire live rail highlight + scrub through DocList/+page"
```

---

## Task 4: Build, deploy, verify

**Files:** none.

- [ ] **Step 1: Production build**

Run: `npm run build`
Expected: clean.

- [ ] **Step 2: Push (Cloudflare Pages auto-deploys)**

```bash
git push origin main
```

- [ ] **Step 3: Confirm the deploy**

```bash
gh run list --repo cwcorella-git/cwcorella-git.github.io --limit 1
```
Expected: latest run completed/success (~1–2 min).

- [ ] **Step 4: Hand off for admin-session verification** — the live path can't be exercised locally (CORS + admin gate). Ask the user to confirm:
  1. Title sort: as you scroll, the current letter highlights on the rail; drag the rail up/down → the list flies through, a bubble shows the letter, releasing lands there.
  2. Tap a letter → still jumps exactly (no accidental scrub).
  3. Date sort: decades / `‹1800` / `undated` highlight and scrub correctly.
  4. Mobile: tap + highlight work on the horizontal strip (no drag expected).

---

## Self-review notes

- **Spec coverage:** pure helpers (T1), rail interaction + restyle (T2), wiring (T3), ship (T4). All spec sections mapped.
- **Type/name consistency:** `anchorLabelForRow(sort, row)` and `fractionToIndex(fraction, total)` defined in T1, consumed in T2 (`fractionToIndex`) and T3 (`anchorLabelForRow`); `JumpRail` props `total`/`activeLabel`/`onScrubTo` defined in T2, supplied in T3; `sort` prop added to `DocList` (T3) and passed from `+page` (T3).
- **Reactivity:** `activeLabel` effect reads `topIndex` + `sort` + `rowAt(topIndex)` (which reads `_version`), so it updates on scroll and on window load; only overwrites when the row is loaded (no blank flicker over unloaded gaps). `slots`/`queryKey` behavior unchanged from the shipped version.
- **No backend changes**; tap-to-jump (`onSeek` → `resolveJumpIndex`) and window-on-scroll preserved.
```
