# Narrow-mode pill + tabbed sheet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the library reader's narrow-mode (`< 900px`) slim bar with a floating pill that opens a compact tabbed sheet surfacing both the TOC and the document info.

**Architecture:** Amend the already-shipped `DocInfoPanel.svelte`. The desktop `.sidebar` and all shared snippets (`infoRows()`, `tocList()`) are unchanged. Only the `.slim` block is swapped for a `.narrow` pill+sheet. A new pure helper `pillLabel()` in `tocLogic.ts` derives the pill's glyph+text. `DocReader.svelte`, the IntersectionObserver, `activeAnchor`, jump logic, and markdown anchoring are untouched.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes only), Vitest.

## Global Constraints

- Svelte 5 runes only — `$state`/`$derived`/`$effect`/`$props`/snippets. No stores, no legacy `export let`.
- Breakpoint stays **900px**: `@media (min-width: 900px)` shows `.sidebar` and hides `.narrow`; below shows `.narrow` and hides `.sidebar`.
- Reuse the existing `{#snippet infoRows()}` and `{#snippet tocList()}` verbatim — metadata/TOC markup must exist once, rendered into both the sidebar and the sheet.
- Glass visuals: use the existing CSS custom properties (`--glass-bg-heavy`, `--glass-blur-heavy`, `--ui-rgb`, `--clr-text`, `--font-ui`) — no new hard-coded colors.
- `npm run check` must report 0 errors **and** 0 warnings (a11y included). `npm test` and `npm run build` must pass.
- Commit directly on `main` (project convention; both repos auto-deploy from main).

---

### Task 1: `pillLabel` pure helper

**Files:**
- Modify: `src/lib/library/tocLogic.ts`
- Test: `src/lib/library/tocLogic.test.ts`

**Interfaces:**
- Consumes: `TocEntry` from `$lib/admin/markdown`; the existing `activeLabel(entries, numbers, activeAnchor)` in the same file.
- Produces: `pillLabel(entries: TocEntry[], numbers: string[], activeAnchor: string | null): { glyph: string; text: string }`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/library/tocLogic.test.ts` (inside the existing top-level `describe`, or a new `describe('pillLabel', ...)`). Import `pillLabel` alongside the existing imports.

```ts
describe('pillLabel', () => {
	const entries = [
		{ level: 1 as const, text: 'Introduction', anchor: 'introduction' },
		{ level: 2 as const, text: 'Method', anchor: 'method' },
		{ level: 2 as const, text: 'Results', anchor: 'results' }
	];
	const numbers = ['1', '2', '3'];

	it('returns the Info glyph and label when there are no headings', () => {
		expect(pillLabel([], [], null)).toEqual({ glyph: 'ⓘ', text: 'Info' });
	});

	it('returns the live section label when a section is active', () => {
		expect(pillLabel(entries, numbers, 'method')).toEqual({ glyph: '§', text: '2. Method' });
	});

	it('falls back to "On this page" when headings exist but none is active', () => {
		expect(pillLabel(entries, numbers, null)).toEqual({ glyph: '§', text: 'On this page' });
	});

	it('falls back to "On this page" when the active anchor is not in the entries', () => {
		expect(pillLabel(entries, numbers, 'nonexistent')).toEqual({ glyph: '§', text: 'On this page' });
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/library/tocLogic.test.ts`
Expected: FAIL — `pillLabel is not a function` / not exported.

- [ ] **Step 3: Implement `pillLabel`**

Append to `src/lib/library/tocLogic.ts`:

```ts
export function pillLabel(
	entries: TocEntry[],
	numbers: string[],
	activeAnchor: string | null
): { glyph: string; text: string } {
	if (entries.length === 0) return { glyph: 'ⓘ', text: 'Info' };
	const label = activeLabel(entries, numbers, activeAnchor);
	return { glyph: '§', text: label ?? 'On this page' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- src/lib/library/tocLogic.test.ts`
Expected: PASS (existing tests + 4 new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/tocLogic.ts src/lib/library/tocLogic.test.ts
git commit -m "feat(library): pillLabel helper for floating TOC/info pill"
```

---

### Task 2: `DocInfoPanel` narrow-mode pill + tabbed sheet

**Files:**
- Modify: `src/lib/components/library/DocInfoPanel.svelte`

**Interfaces:**
- Consumes: `pillLabel` from `$lib/library/tocLogic` (Task 1); the component's existing props `{ toc, activeAnchor, doc, onJump }`; the existing snippets `infoRows()` and `tocList()`; existing `numbers`/`minLevel`/`jump()` derivations.
- Produces: no new exported interface — internal markup/state change only.

**Context:** The current file (read it in full before editing) renders `.sidebar` (desktop, keep as-is) and `.slim` (a sticky bar — replace entirely). Keep the `<script>`'s existing `numbers`, `minLevel`, `jump()`, and both snippets. The desktop `.sidebar` block and its CSS are unchanged.

- [ ] **Step 1: Update the `<script>`**

- Add `pillLabel` to the `tocLogic` import: `import { tocNumber, condenseMeta, activeLabel, pillLabel } from '$lib/library/tocLogic';`
- Keep `let expanded = $state(false);`.
- Add `let activeTab = $state<'toc' | 'info'>('toc');`.
- Replace the `barLabel` derivation with: `const pill = $derived(pillLabel(toc, numbers, activeAnchor));`
  (If `condenseMeta` / `activeLabel` become unused after this, remove them from the import to keep `check` clean — verify with `npm run check`.)
- Keep `jump()` as-is (it already sets `expanded = false`).
- Replace `toggle()` — keep it flipping `expanded`; on open, if there are no headings force `activeTab = 'info'` so the sheet shows metadata:

```ts
function toggle() {
	expanded = !expanded;
	if (expanded && toc.length === 0) activeTab = 'info';
}

function close() {
	expanded = false;
}

// Escape closes the sheet before DocReader's global Escape closes the reader.
// Capture phase runs before DocReader's bubble-phase svelte:window handler.
$effect(() => {
	if (!expanded) return;
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	};
	window.addEventListener('keydown', onKey, true);
	return () => window.removeEventListener('keydown', onKey, true);
});
```

- [ ] **Step 2: Replace the `.slim` markup block**

Delete the entire `<!-- Narrow slim bar (< 900px) -->` block (the `<div class="slim">…</div>`) and replace with:

```svelte
<!-- Narrow floating pill + tabbed sheet (< 900px) -->
<div class="narrow">
	{#if expanded}
		<button
			type="button"
			class="sheet-scrim"
			aria-label="Close"
			onclick={close}
		></button>
		<div class="sheet" role="dialog" aria-modal="false" aria-label="Contents and document info">
			{#if toc.length > 0}
				<div class="tabs" role="tablist" aria-label="Panel">
					<button
						type="button"
						role="tab"
						class="tab"
						class:selected={activeTab === 'toc'}
						aria-selected={activeTab === 'toc'}
						onclick={() => (activeTab = 'toc')}
					>On this page</button>
					<button
						type="button"
						role="tab"
						class="tab"
						class:selected={activeTab === 'info'}
						aria-selected={activeTab === 'info'}
						onclick={() => (activeTab = 'info')}
					>Info</button>
				</div>
				<div class="sheet-body" role="tabpanel">
					{#if activeTab === 'toc'}
						{@render tocList()}
					{:else}
						{@render infoRows()}
					{/if}
				</div>
			{:else}
				<div class="sheet-body">
					{@render infoRows()}
				</div>
			{/if}
		</div>
	{/if}
	<button class="pill" onclick={toggle} aria-expanded={expanded} aria-label="Table of contents and document info">
		<span class="pill-glyph" aria-hidden="true">{pill.glyph}</span>
		<span class="pill-text">{pill.text}</span>
	</button>
</div>
```

- [ ] **Step 3: Replace the `.slim*` CSS**

In the `<style>` block, delete the `/* Slim bar */` rules (`.slim`, `.slim-bar`, `.slim-bar .caret`, `.slim-label`, `.info-glyph`, `.slim-panel`) and add:

```css
/* Narrow floating pill + tabbed sheet */
.narrow { display: contents; }
@media (min-width: 900px) {
	.narrow { display: none; }
}

.pill {
	position: fixed;
	bottom: 1.25rem;
	right: 1.25rem;
	z-index: 310;
	display: inline-flex;
	align-items: center;
	gap: 0.4rem;
	max-width: min(70vw, 320px);
	background: var(--glass-bg-heavy);
	backdrop-filter: var(--glass-blur-heavy);
	-webkit-backdrop-filter: var(--glass-blur-heavy);
	border: 1px solid rgba(var(--ui-rgb), 0.28);
	border-radius: 999px;
	padding: 0.5rem 0.9rem;
	font-family: var(--font-ui);
	font-size: 0.66rem;
	letter-spacing: 0.04em;
	color: var(--clr-text);
	cursor: pointer;
}
.pill-glyph { opacity: 0.6; }
.pill-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.9; }

.sheet-scrim {
	position: fixed;
	inset: 0;
	z-index: 309;
	background: transparent;
	border: none;
	padding: 0;
	cursor: default;
}

.sheet {
	position: fixed;
	right: 1.25rem;
	bottom: 4rem;
	z-index: 311;
	width: min(86vw, 320px);
	max-height: 60vh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	background: var(--glass-bg-heavy);
	backdrop-filter: var(--glass-blur-heavy);
	-webkit-backdrop-filter: var(--glass-blur-heavy);
	border: 1px solid rgba(var(--ui-rgb), 0.28);
	border-radius: 0.5rem;
}
.tabs {
	display: flex;
	flex-shrink: 0;
	border-bottom: 1px solid rgba(var(--ui-rgb), 0.18);
}
.tab {
	flex: 1;
	background: none;
	border: none;
	padding: 0.55rem 0.6rem;
	font-family: var(--font-ui);
	font-size: 0.58rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--clr-text);
	opacity: 0.5;
	cursor: pointer;
	transition: opacity 0.15s;
}
.tab.selected { opacity: 1; box-shadow: inset 0 -2px 0 var(--clr-text); }
.sheet-body {
	padding: 0.7rem 0.9rem 0.9rem;
	overflow-y: auto;
}
```

- [ ] **Step 4: Run `check`**

Run: `npm run check`
Expected: 0 errors, 0 warnings. (If `a11y_no_static_element_interactions` or an unused-import error appears, fix it — the scrim is a `<button>` precisely to avoid the static-element warning; remove any now-unused `tocLogic` imports.)

- [ ] **Step 5: Run tests and build**

Run: `npm test`
Expected: PASS (same count as before Task 2 + the 4 new from Task 1).

Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/library/DocInfoPanel.svelte
git commit -m "feat(library): narrow-mode floating pill + tabbed TOC/info sheet"
```

---

## Self-Review

- **Spec coverage:** pill label (3 states) → Task 1 + Task 2 Step 2. Tabbed sheet (two tabs, no-headings fallback) → Task 2 Step 2. Escape capture-phase → Task 2 Step 1. Desktop sidebar unchanged → not touched. All covered.
- **Type consistency:** `pillLabel` return `{ glyph, text }` consumed as `pill.glyph`/`pill.text`. `activeTab` union `'toc' | 'info'`. Consistent.
- **No placeholders:** all code shown verbatim.
