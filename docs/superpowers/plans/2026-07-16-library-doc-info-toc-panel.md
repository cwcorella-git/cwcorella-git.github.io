# Library reader info + "On this page" panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the document reader's metadata out of the prose body into a sticky right-hand **Document info + "On this page"** panel with live active-section highlight, and a slim expand-on-tap bar on narrow/half-screen widths.

**Architecture:** `DocReader.svelte` (full-screen modal) becomes two columns inside its single scroll container `.doc-scroll`: a prose column and a sticky `DocInfoPanel`. An IntersectionObserver rooted at `.doc-scroll` tracks the topmost visible heading into `activeAnchor`. `DocInfoPanel` renders a desktop sidebar and a narrow slim-bar from shared snippets; pure string/number logic lives in `tocLogic.ts`.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Vitest, `npm run check`, adapter-static → Cloudflare Pages. No backend.

## Global Constraints

- **No backend changes.** Frontend only.
- **Reuse existing anchors:** `extractToc(md)` (`src/lib/admin/markdown.ts`) returns `TocEntry { level: 1|2|3; text: string; anchor: string }`, and `renderMarkdown` stamps `id="<anchor>"` on headings via the **same** `slugify`. Do not add a second slugifier; `TocEntry.anchor` already equals the rendered heading `id`.
- **The scroll container is `.doc-scroll`** — the IntersectionObserver `root` and every `scrollTo` target address that element, never `window`.
- **`openDoc` is a `LibraryDoc`** = `DocListItem` (`id, source, slug, title, author, publication_date, language, document_type, word_count, char_count, visibility, needs_formatting, updated_at`) **plus** `tags: string[]`, `collections: string[]`, `body: string`.
- **Breakpoint:** `@media (max-width: 899px)` → slim bar; ≥ 900px → sidebar.
- **Svelte 5 runes only** (`$state`, `$derived`, `$effect`, `$props`, snippets). Match existing component style in `src/lib/components/library/`.
- Commit after each task.

---

### Task 1: Pure TOC logic (`tocLogic.ts`)

**Files:**
- Create: `src/lib/library/tocLogic.ts`
- Test: `src/lib/library/tocLogic.test.ts`

**Interfaces:**
- Consumes: `TocEntry` from `$lib/admin/markdown`.
- Produces:
  - `tocNumber(entries: TocEntry[]): string[]` — one display ordinal per entry, same length/order as input. Running counter starting at 1: `["1","2","3", ...]`. Pure.
  - `condenseMeta(doc: { author: string | null; publication_date: string | null; language: string | null }): string` — joins present fields with `" · "`. Include `author` if it is a non-empty, non-`"—"` string (trimmed); include the 4-char year `publication_date.slice(0,4)` if `publication_date` is a non-empty string; include `language` lowercased if it is a non-empty string. Returns `""` when nothing qualifies.
  - `activeLabel(entries: TocEntry[], numbers: string[], activeAnchor: string | null): string | null` — finds the entry whose `anchor === activeAnchor`; returns `` `${numbers[i]}. ${entry.text}` ``; returns `null` if `activeAnchor` is null or matches no entry.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { tocNumber, condenseMeta, activeLabel } from './tocLogic';
import type { TocEntry } from '$lib/admin/markdown';

const e = (text: string, level: 1 | 2 | 3 = 2): TocEntry => ({
	level,
	text,
	anchor: text.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-')
});

describe('tocNumber', () => {
	it('returns running ordinals', () => {
		expect(tocNumber([e('Intro'), e('Method'), e('Results')])).toEqual(['1', '2', '3']);
	});
	it('handles nested levels with a flat running counter', () => {
		expect(tocNumber([e('A', 1), e('B', 2), e('C', 3)])).toEqual(['1', '2', '3']);
	});
	it('returns [] for no entries', () => {
		expect(tocNumber([])).toEqual([]);
	});
});

describe('condenseMeta', () => {
	it('joins all present fields', () => {
		expect(condenseMeta({ author: 'Kropotkin', publication_date: '1892-01-01', language: 'EN' }))
			.toBe('Kropotkin · 1892 · en');
	});
	it('skips a missing author', () => {
		expect(condenseMeta({ author: null, publication_date: '2019', language: 'en' }))
			.toBe('2019 · en');
	});
	it('skips a missing date', () => {
		expect(condenseMeta({ author: 'X', publication_date: null, language: 'en' }))
			.toBe('X · en');
	});
	it('skips an em-dash author and empty language', () => {
		expect(condenseMeta({ author: '—', publication_date: '2001', language: '' }))
			.toBe('2001');
	});
	it('returns empty string when nothing qualifies', () => {
		expect(condenseMeta({ author: null, publication_date: null, language: '' })).toBe('');
	});
});

describe('activeLabel', () => {
	it('labels the active entry with its ordinal', () => {
		const entries = [e('Intro'), e('Method')];
		expect(activeLabel(entries, tocNumber(entries), 'method')).toBe('2. Method');
	});
	it('returns null when activeAnchor is null', () => {
		const entries = [e('Intro')];
		expect(activeLabel(entries, tocNumber(entries), null)).toBeNull();
	});
	it('returns null when activeAnchor matches no entry', () => {
		const entries = [e('Intro')];
		expect(activeLabel(entries, tocNumber(entries), 'nope')).toBeNull();
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/library/tocLogic.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
import type { TocEntry } from '$lib/admin/markdown';

export function tocNumber(entries: TocEntry[]): string[] {
	return entries.map((_, i) => String(i + 1));
}

export function condenseMeta(doc: {
	author: string | null;
	publication_date: string | null;
	language: string | null;
}): string {
	const parts: string[] = [];
	const author = doc.author?.trim();
	if (author && author !== '—') parts.push(author);
	if (doc.publication_date && doc.publication_date.length > 0) {
		parts.push(doc.publication_date.slice(0, 4));
	}
	const lang = doc.language?.trim();
	if (lang) parts.push(lang.toLowerCase());
	return parts.join(' · ');
}

export function activeLabel(
	entries: TocEntry[],
	numbers: string[],
	activeAnchor: string | null
): string | null {
	if (!activeAnchor) return null;
	const i = entries.findIndex((e) => e.anchor === activeAnchor);
	if (i === -1) return null;
	return `${numbers[i]}. ${entries[i].text}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/library/tocLogic.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/tocLogic.ts src/lib/library/tocLogic.test.ts
git commit -m "feat(library): pure TOC numbering + metadata-condense helpers"
```

---

### Task 2: `DocInfoPanel.svelte` — sidebar + slim bar

**Files:**
- Create: `src/lib/components/library/DocInfoPanel.svelte`

**Interfaces:**
- Consumes: `tocNumber`, `condenseMeta`, `activeLabel` from `$lib/library/tocLogic`; `TocEntry` from `$lib/admin/markdown`; `LibraryDoc` from `$lib/library/types`.
- Produces: a component with props
  ```ts
  interface Props {
  	toc: TocEntry[];
  	activeAnchor: string | null;
  	doc: LibraryDoc;
  	onJump: (anchor: string) => void;
  }
  ```
  Consumed by `DocReader` in Task 3.

**Context:** This replaces the metadata block currently inline in `DocReader.svelte` (the `dl.meta-grid`, the `needs_formatting` badge, and the `.chip-row` tag/collection lists). Copy that markup's *content* into the `infoRows` snippet here (restyled for a ~240px panel — labels stacked or two-column is fine; keep it compact and glass-styled with the existing CSS vars `--font-ui`, `--font-prose`, `--clr-text`, `--ui-rgb`). Author may be long: let it wrap.

- [ ] **Step 1: Create the component**

```svelte
<script lang="ts">
	import type { TocEntry } from '$lib/admin/markdown';
	import type { LibraryDoc } from '$lib/library/types';
	import { tocNumber, condenseMeta, activeLabel } from '$lib/library/tocLogic';

	interface Props {
		toc: TocEntry[];
		activeAnchor: string | null;
		doc: LibraryDoc;
		onJump: (anchor: string) => void;
	}

	const { toc, activeAnchor, doc, onJump }: Props = $props();

	let expanded = $state(false);

	const numbers = $derived(tocNumber(toc));
	const barLabel = $derived(
		activeLabel(toc, numbers, activeAnchor) ?? condenseMeta(doc) ?? ''
	);
	const minLevel = $derived(toc.length ? Math.min(...toc.map((t) => t.level)) : 1);

	function jump(anchor: string) {
		onJump(anchor);
		expanded = false;
	}

	function toggle() {
		expanded = !expanded;
	}

	function onBarKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') expanded = false;
	}
</script>

{#snippet infoRows()}
	<dl class="meta-grid">
		<dt>author</dt><dd>{doc.author ?? '—'}</dd>
		<dt>source</dt><dd>{doc.source}</dd>
		<dt>published</dt><dd>{doc.publication_date ?? '—'}</dd>
		<dt>language</dt><dd>{doc.language}</dd>
		<dt>type</dt><dd>{doc.document_type}</dd>
		<dt>words / chars</dt><dd>{doc.word_count.toLocaleString()} / {doc.char_count.toLocaleString()}</dd>
		<dt>visibility</dt><dd>{doc.visibility}</dd>
		<dt>updated</dt><dd>{doc.updated_at}</dd>
	</dl>

	{#if doc.needs_formatting}
		<span class="badge">needs formatting</span>
	{/if}

	{#if doc.tags.length > 0}
		<div class="chip-row">
			{#each doc.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
		</div>
	{/if}

	{#if doc.collections.length > 0}
		<div class="chip-row">
			{#each doc.collections as collection (collection)}<span class="chip chip-collection">{collection}</span>{/each}
		</div>
	{/if}
{/snippet}

{#snippet tocList()}
	{#if toc.length > 0}
		<ul class="toc">
			{#each toc as entry, i (entry.anchor + '-' + i)}
				<li style="padding-left: {(entry.level - minLevel) * 0.75}rem">
					<button
						class="toc-item"
						class:active={entry.anchor === activeAnchor}
						aria-current={entry.anchor === activeAnchor ? 'true' : undefined}
						onclick={() => jump(entry.anchor)}
					>
						<span class="num">{numbers[i]}.</span>
						<span class="txt">{entry.text}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<!-- Desktop sidebar (>= 900px) -->
<aside class="sidebar" aria-label="Document info and contents">
	{#if toc.length > 0}
		<h3 class="panel-title">On this page</h3>
		{@render tocList()}
		<hr class="divider" />
	{/if}
	<h3 class="panel-title">Document info</h3>
	{@render infoRows()}
</aside>

<!-- Narrow slim bar (< 900px) -->
<div class="slim" onkeydown={onBarKeydown}>
	<button class="slim-bar" onclick={toggle} aria-expanded={expanded}>
		<span class="caret">{expanded ? '▾' : '▸'}</span>
		<span class="slim-label">{expanded ? 'On this page' : barLabel}</span>
		<span class="info-glyph" aria-hidden="true">ⓘ</span>
	</button>
	{#if expanded}
		<div class="slim-panel">
			{@render tocList()}
			{#if toc.length > 0}<hr class="divider" />{/if}
			{@render infoRows()}
		</div>
	{/if}
</div>

<style>
	.sidebar {
		display: none;
		font-family: var(--font-ui);
	}
	@media (min-width: 900px) {
		.sidebar { display: block; }
		.slim { display: none; }
	}

	.panel-title {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		opacity: 0.55;
		color: var(--clr-text);
		margin: 0 0 0.6rem;
	}

	.toc { list-style: none; margin: 0 0 0.4rem; padding: 0; }
	.toc-item {
		display: flex;
		gap: 0.4rem;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		border-left: 2px solid transparent;
		padding: 0.15rem 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		line-height: 1.5;
		color: var(--clr-text);
		opacity: 0.6;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.toc-item:hover { opacity: 0.9; }
	.toc-item.active {
		opacity: 1;
		border-left-color: var(--clr-text);
	}
	.toc-item.active::before { content: '▸'; margin-right: 0.15rem; }
	.toc-item .num { opacity: 0.5; }
	.toc-item .txt { min-width: 0; }

	.divider {
		border: none;
		border-top: 1px solid rgba(var(--ui-rgb), 0.15);
		margin: 0.9rem 0;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.25rem 0.8rem;
		font-family: var(--font-ui);
		font-size: 0.58rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		margin: 0 0 0.8rem;
	}
	.meta-grid dt { opacity: 0.5; text-transform: uppercase; }
	.meta-grid dd { margin: 0; opacity: 0.85; overflow-wrap: anywhere; }

	.badge {
		display: inline-block;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		padding: 0.05rem 0.3rem;
		text-transform: uppercase;
		font-family: var(--font-ui);
		font-size: 0.5rem;
		opacity: 0.85;
		margin-bottom: 0.6rem;
	}
	.chip-row { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.6rem; }
	.chip {
		font-family: var(--font-ui);
		font-size: 0.52rem;
		letter-spacing: 0.04em;
		border: 1px solid rgba(var(--ui-rgb), 0.22);
		padding: 0.12rem 0.4rem;
		color: var(--clr-text);
		opacity: 0.75;
	}
	.chip-collection { opacity: 0.9; }

	/* Slim bar */
	.slim {
		position: sticky;
		top: 0;
		z-index: 2;
		background: var(--glass-bg-heavy);
		backdrop-filter: var(--glass-blur-heavy);
		-webkit-backdrop-filter: var(--glass-blur-heavy);
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.18);
	}
	.slim-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		background: none;
		border: none;
		padding: 0.5rem 0.9rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		letter-spacing: 0.04em;
		color: var(--clr-text);
		cursor: pointer;
	}
	.slim-bar .caret { opacity: 0.7; }
	.slim-label { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; opacity: 0.85; }
	.info-glyph { opacity: 0.55; }
	.slim-panel {
		padding: 0.3rem 0.9rem 0.9rem;
		max-height: 55vh;
		overflow-y: auto;
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors (component compiles; unused-until-Task-3 is fine).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/library/DocInfoPanel.svelte
git commit -m "feat(library): DocInfoPanel — sticky sidebar + narrow slim bar"
```

---

### Task 3: Wire `DocReader.svelte` — two columns, observer, jump

**Files:**
- Modify: `src/lib/components/library/DocReader.svelte`

**Interfaces:**
- Consumes: `DocInfoPanel` (Task 2); `extractToc` from `$lib/admin/markdown`.
- Produces: no exports; internal `activeAnchor` state + observer + `handleJump`.

**Context:** Currently `DocReader` renders (inside `.doc-scroll`): `h2.doc-heading`, the `dl.meta-grid`, the `needs_formatting` badge, both `.chip-row`s, then `.doc-body`. **Remove** the `meta-grid`, badge, and chip rows from the body (they now live in `DocInfoPanel`). Keep `.doc-heading` and `.doc-body`. The existing per-heading CSS (`.doc-body h1/h2/...`) stays.

- [ ] **Step 1: Add TOC + observer state to the `<script>`**

After the existing `bodyHtml` derived, add:

```ts
import DocInfoPanel from './DocInfoPanel.svelte';
import { extractToc } from '$lib/admin/markdown';

const toc = $derived(libraryState.openDoc?.body ? extractToc(libraryState.openDoc.body) : []);

let activeAnchor = $state<string | null>(null);
let bodyEl: HTMLElement | undefined = $state();
let scrollEl: HTMLElement | undefined = $state();

// Active-section highlight: observe rendered heading anchors within the
// scroll container; pick the topmost intersecting one. Rebuilds when the
// body HTML or TOC changes (i.e. a new document opens).
$effect(() => {
	void bodyHtml; // rebuild when body changes
	const body = bodyEl;
	const root = scrollEl;
	activeAnchor = null;
	if (!body || !root || toc.length === 0) return;

	const anchors: HTMLElement[] = [];
	for (const entry of toc) {
		const el = body.querySelector<HTMLElement>(`#${CSS.escape(entry.anchor)}`);
		if (el) anchors.push(el);
	}
	if (anchors.length === 0) return;

	const visible = new Map<string, boolean>();
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).id;
				if (!id) continue;
				if (entry.isIntersecting) visible.set(id, true);
				else visible.delete(id);
			}
			if (visible.size === 0) return;
			let bestId: string | null = null;
			let bestTop = Number.POSITIVE_INFINITY;
			for (const id of visible.keys()) {
				const el = anchors.find((a) => a.id === id);
				if (!el) continue;
				const top = el.getBoundingClientRect().top;
				if (top < bestTop) { bestTop = top; bestId = id; }
			}
			if (bestId) activeAnchor = bestId;
		},
		{ root, rootMargin: '0px 0px -65% 0px', threshold: [0, 1] }
	);
	anchors.forEach((a) => observer.observe(a));
	return () => observer.disconnect();
});

function handleJump(anchor: string) {
	const body = bodyEl;
	const root = scrollEl;
	if (!body || !root) return;
	const el = body.querySelector<HTMLElement>(`#${CSS.escape(anchor)}`);
	if (!el) return;
	const top = root.scrollTop + (el.getBoundingClientRect().top - root.getBoundingClientRect().top) - 16;
	root.scrollTo({ top, behavior: 'smooth' });
}
```

- [ ] **Step 2: Restructure the markup**

Replace the `{:else if libraryState.openDoc}` block's inner markup so that:
- `.doc-scroll` gets `bind:this={scrollEl}`.
- Inside `.doc-scroll`, wrap content in `.reader-grid` with a `.prose-col` (heading + body) and the `DocInfoPanel`.
- The narrow slim bar (rendered by `DocInfoPanel`) must sit at the top of `.doc-scroll` so its `position: sticky` works — render `DocInfoPanel` as the first child of `.reader-grid`; its `.sidebar` is `display:none` on narrow and its `.slim` is `display:none` on wide, so ordering is safe.
- `.doc-body` gets `bind:this={bodyEl}`.

```svelte
{:else if libraryState.openDoc}
	{@const doc = libraryState.openDoc}
	<div class="doc-scroll" bind:this={scrollEl}>
		<div class="reader-grid">
			<DocInfoPanel {toc} {activeAnchor} {doc} onJump={handleJump} />
			<div class="prose-col">
				<h2 class="doc-heading">{doc.title}</h2>
				<div class="doc-body" bind:this={bodyEl}>
					{#if doc.body && doc.body.trim().length > 0}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html bodyHtml}
					{:else}
						<p class="empty-note">(no body)</p>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}
```

- [ ] **Step 3: Update styles**

- Keep `.doc-scroll` as the scroll container but remove its `max-width`/`margin:auto`/`padding` centering (the grid now centers). Set: `flex: 1; overflow-y: auto; width: 100%;`.
- Add:

```css
.reader-grid {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	max-width: 760px;
	margin: 0 auto;
	padding: 0 1.25rem 2rem;
}
@media (min-width: 900px) {
	.reader-grid {
		grid-template-columns: minmax(0, 720px) 240px;
		gap: 2rem;
		max-width: 1040px;
		padding: 2rem 1.5rem;
	}
	.reader-grid :global(.sidebar) {
		position: sticky;
		top: 2rem;
		align-self: start;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
	}
}
.prose-col { min-width: 0; padding-top: 2rem; }
@media (min-width: 900px) { .prose-col { padding-top: 0; } }
```

- On desktop the panel must sit in the **right** column. Since `DocInfoPanel` is rendered first in DOM order (for the slim bar's sticky), place it explicitly: give `.reader-grid :global(.sidebar) { grid-column: 2; grid-row: 1; }` and `.prose-col { grid-column: 1; grid-row: 1; }` inside the `min-width: 900px` block. On narrow, `.slim` is in normal flow at the top (correct) and `.sidebar` is hidden.
- Delete the now-unused `.meta-grid`, `.badge`, `.chip-row`, `.chip`, `.chip-collection` style rules from `DocReader` (they moved to `DocInfoPanel`). Keep `.doc-heading`, `.doc-body`, `.empty-note`, `.doc-scroll`, and all `:global(.doc-body ...)` rules.

- [ ] **Step 4: Type-check + full test suite**

Run: `npm run check`
Expected: 0 errors.

Run: `npm test`
Expected: all suites pass (tocLogic + existing railLogic/windowLogic/api/libraryLogic).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: succeeds (adapter-static).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/library/DocReader.svelte
git commit -m "feat(library): reader two-column info+TOC panel with active-section highlight"
```

---

### Task 4: Deploy

**Files:** none (push existing commits).

**Context:** `main` auto-deploys to Cloudflare Pages on push. Established preference: push and deploy.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Confirm the Cloudflare Pages deploy run starts and succeeds**

Report the run id + status to the user for their admin-session visual verification.
