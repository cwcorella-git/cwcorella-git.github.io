# Library toolbar: two zones Implementation Plan (frontend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace seven near-identical "ALL —" selects across two rows with three scope controls in the page header and three query controls in the toolbar, governed by "the active value is the label".

**Architecture:** Two phases. **Phase A (Tasks 1-4)** is plumbing — repeated-param serialization, the two new API calls, the filter-shape change, and the pure corpus-tree builder. It ends with the page working *identically* to today; nothing visible changes. **Phase B (Tasks 5-10)** swaps the controls one at a time, then does layout and narrow mode. Each task leaves `/library` working.

**Tech Stack:** SvelteKit 2, Svelte 5 runes (`$state`/`$derived`/`$props`), TypeScript, Vitest.

**Design doc:** `docs/superpowers/specs/2026-07-16-library-toolbar-design.md` — **read its "Revision note (2026-07-17)" first.** The backend is already shipped and deployed; this plan is the frontend half.

## Global Constraints

- **Svelte 5 runes only** — `$state`, `$derived`, `$effect`, `$props`. No Svelte 4 reactivity (`export let`, `$:`).
- **No `window.prompt()` / `window.alert()`** anywhere. User feedback goes through `toast` (`$lib/admin/toast.svelte`).
- **Colour rule:** ONE colour per context — `var(--clr-text)` in light context, `var(--clr-dark-text)` in dark panels. Hierarchy comes from **opacity** (0.45–0.65 dim, 1.0 active), **never** a different shade. Chrome is `rgba(var(--ui-rgb), X)`.
- **Governing UI rule: the active value is the label.** An unset control shows only its glyph; a set control shows what it is set to. **No control's resting trigger may render "All …"** — that is the entire point of the redesign, and a trigger reading "ALL LANGUAGES"/"ALL TAGS" must be rejected. This constrains **triggers only**. An "all languages" / "all corpora" row *inside an opened panel* is required — it is how you clear the filter — and is not a violation.
- The page is **admin-gated in full** (`src/routes/library/+page.svelte:13` bounces non-admins). There is exactly one user. Do not build role-based affordances.
- `.inner` is `max-width: 760px` — the header row has ~700px for the title plus three controls.
- Node 20: `source ~/.nvm/nvm.sh && nvm use 20`. Tests: `npx vitest run`. Typecheck: `npm run check` (must stay **0 errors, 0 warnings**).
- Baseline on `main`: **146 tests passing, 285 files typechecked clean.**
- **Backend is live and already supports everything here** (`library-api` `ca51905`): `/facets?source=`, collection buckets with `source`, `visibility`/`needs_formatting` buckets, repeated `tag=` ANDed, `GET /tags?q=`. Do not change the backend.

## Real corpus facts (measured 2026-07-17 — do not guess these)

| source | docs | categories |
|---|---:|---:|
| youtube | 60,726 | 1 (named `transcript`) |
| anarchist | 24,594 | 26 |
| marxist | 12,576 | 8 |
| user | 2,521 | **0 — never expands** |

`visibility`: private 97,896 / public 2,521. `needs_formatting`: 317 of 100,417. 33 languages (`en`, `en-US`, `en-GB` are separate buckets). 65,780 undated. Total 100,417. **No duplicate collection names exist in production.**

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/library/api.ts` | `serializeQuery` + client calls | Modify |
| `src/lib/library/types.ts` | `Facets`, `LibraryQuery`, `CorpusFilter` | Modify |
| `src/lib/library/libraryLogic.ts` | filter shape, `toQuery`, `computeQueryKey` | Modify |
| `src/lib/library/corpusLogic.ts` | pure corpus-tree builder | **Create** |
| `src/lib/library/libraryState.svelte.ts` | passes `source` to `getFacets` | Modify |
| `src/lib/components/library/CorpusControl.svelte` | `◈` cascade dropdown | **Create** |
| `src/lib/components/library/LanguageControl.svelte` | `文` dropdown | **Create** |
| `src/lib/components/library/StateControl.svelte` | `⚙` 3-group dropdown | **Create** |
| `src/lib/components/library/TagChipInput.svelte` | chip input + tag panel | **Create** |
| `src/lib/components/library/FacetPanel.svelte` | shared dropdown shell (trigger + panel + outside-click) | **Create** |
| `src/lib/components/library/LibraryControls.svelte` | composes the two zones | Modify |
| `src/routes/library/+page.svelte` | header cluster | Modify |
| `src/lib/components/library/DocList.svelte` | count line + progress | Modify |

Four controls share one dropdown shell (`FacetPanel`) so the trigger styling, outside-click, and Escape handling exist once. `corpusLogic.ts` is separate from `libraryLogic.ts` because the tree builder is a distinct responsibility and `libraryLogic.ts` is already the busiest module.

---

# PHASE A — plumbing (nothing visible changes)

### Task 1: Repeated query params + the two new API calls

`serializeQuery` uses `params.set(key, String(value))`, so an array becomes `tag=a,b` — one tag literally named "a,b". The backend expects `tag=a&tag=b`.

**Files:**
- Modify: `src/lib/library/api.ts:38-45` (`serializeQuery`), and the client's `getFacets`
- Modify: `src/lib/library/types.ts` (`Facets`)
- Test: `src/lib/library/api.test.ts`

**Interfaces:**
- Produces: `serializeQuery` emits one `key=` per array element and skips empty arrays. `getFacets(source?: string): Promise<Facets>`. `searchTags(q: string, limit?: number): Promise<FacetBucket[]>`. `Facets.visibility?: FacetBucket[]`, `Facets.needs_formatting?: FacetBucket[]` — **both optional**, so an un-upgraded API renders without counts instead of crashing.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/library/api.test.ts` (it already imports `serializeQuery`; check the existing import line and extend it rather than adding a duplicate import):

```ts
describe('serializeQuery arrays', () => {
	it('emits one param per array element', () => {
		expect(serializeQuery({ tag: ['a', 'b'] })).toBe('tag=a&tag=b');
	});

	it('emits a single param for a one-element array', () => {
		expect(serializeQuery({ tag: ['a'] })).toBe('tag=a');
	});

	it('omits an empty array entirely', () => {
		expect(serializeQuery({ tag: [], sort: 'title' })).toBe('sort=title');
	});

	it('skips empty strings inside an array', () => {
		expect(serializeQuery({ tag: ['a', '', 'b'] })).toBe('tag=a&tag=b');
	});

	it('still serializes scalars unchanged', () => {
		expect(serializeQuery({ sort: 'title', dir: 'asc' })).toBe('sort=title&dir=asc');
	});

	it('keeps 0 — it is a real value, not empty', () => {
		expect(serializeQuery({ needs_formatting: 0 })).toBe('needs_formatting=0');
	});
});
```

> The last case guards a live trap: the existing `value === ''` check is fine for `0`, but a careless rewrite to a falsy check would silently drop `needs_formatting=0` ("clean"). Keep the explicit comparisons.

- [ ] **Step 2: Run to verify failure**

```bash
source ~/.nvm/nvm.sh && nvm use 20
npx vitest run src/lib/library/api.test.ts
```
Expected: FAIL — `expected 'tag=a%2Cb' to be 'tag=a&tag=b'`.

- [ ] **Step 3: Implement**

Replace `serializeQuery` in `src/lib/library/api.ts`:

```ts
export function serializeQuery(q: object): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(q)) {
		if (value === undefined || value === null || value === '') continue;
		// Arrays become repeated params (tag=a&tag=b), which is how the API ANDs
		// multiple tags. URLSearchParams.set() would stringify to "a,b" — one tag
		// with a comma in its name.
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item === undefined || item === null || item === '') continue;
				params.append(key, String(item));
			}
			continue;
		}
		params.set(key, String(value));
	}
	return params.toString();
}
```

- [ ] **Step 4: Add the two client calls**

In `createLibraryClient`'s returned object, replace `getFacets` and add `searchTags` after it:

```ts
		getFacets(source?: string): Promise<Facets> {
			// `source` narrows collections/tags/visibility/needs_formatting/date_range.
			// languages/sources stay global — they are how the UI navigates back out.
			return request<Facets>('/facets', { query: source ? { source } : {} });
		},
		async searchTags(q: string, limit = 50): Promise<FacetBucket[]> {
			// The /facets tags list is capped at 200 while the corpus has ~12k distinct
			// tags. This reaches the tail.
			const res = await request<{ tags: FacetBucket[] }>('/tags', { query: { q, limit } });
			return res.tags;
		},
```

`FacetBucket` must be in `api.ts`'s type imports — add it to the existing `import type { ... } from './types'` line if absent.

- [ ] **Step 5: Extend the Facets type**

In `src/lib/library/types.ts`, add to `interface Facets`, after `tags`:

```ts
	// Optional: an un-upgraded API omits them, and the State dropdown then renders
	// without counts rather than crashing. needs_formatting names are the STRINGS
	// '0' and '1' — every bucket name is a string.
	visibility?: FacetBucket[];
	needs_formatting?: FacetBucket[];
```

- [ ] **Step 6: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: all pass (146 + 6 new = **152**); check reports **0 errors, 0 warnings**.

- [ ] **Step 7: Commit**

```bash
git add src/lib/library/api.ts src/lib/library/api.test.ts src/lib/library/types.ts
git commit -m "feat(library): repeated query params, getFacets(source), searchTags

serializeQuery emitted tag=a,b for an array — one tag named 'a,b'. Arrays now
become repeated params, which is how the API ANDs multiple tags.

Adds getFacets(source?) and searchTags(q, limit) for the corpus cascade and the
tag chip input. Facets.visibility/needs_formatting are optional so an un-upgraded
API degrades to no counts."
```

---

### Task 2: Multi-tag filter shape

**Files:**
- Modify: `src/lib/library/libraryLogic.ts` (`LibraryControls.filters`, `toQuery`), `src/lib/library/types.ts` (`LibraryQuery`)
- Modify: `src/lib/components/library/LibraryControls.svelte` (the tag `<select>` — keep it a select for now; Task 8 replaces it)
- Test: `src/lib/library/libraryLogic.test.ts`

**Interfaces:**
- Consumes: Task 1's array serialization.
- Produces: `filters.tags?: string[]` **replaces** `filters.tag?: string`. `toQuery` maps `filters.tags` → `query.tag` (the HTTP param stays `tag`; it repeats). `LibraryQuery.tag?: string[]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/library/libraryLogic.test.ts`:

```ts
describe('toQuery tags', () => {
	it('maps filters.tags to the repeated `tag` param', () => {
		const c = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		expect(toQuery(c, 0, 50).tag).toEqual(['theory', 'economics']);
	});

	it('omits tag entirely when the chip set is empty', () => {
		const c = { ...defaultControls(), filters: { tags: [] } };
		expect('tag' in toQuery(c, 0, 50)).toBe(false);
	});

	it('omits tag when tags is absent', () => {
		expect('tag' in toQuery(defaultControls(), 0, 50)).toBe(false);
	});
});

describe('computeQueryKey tags', () => {
	it('treats different chip sets as different queries', () => {
		const a = { ...defaultControls(), filters: { tags: ['theory'] } };
		const b = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});

	it('treats an empty chip set as no filter', () => {
		const empty = { ...defaultControls(), filters: { tags: [] } };
		expect(computeQueryKey(empty)).toBe(computeQueryKey(defaultControls()));
	});

	it('is order-independent — same chips in any order is the same query', () => {
		const a = { ...defaultControls(), filters: { tags: ['theory', 'economics'] } };
		const b = { ...defaultControls(), filters: { tags: ['economics', 'theory'] } };
		expect(computeQueryKey(a)).toBe(computeQueryKey(b));
	});
});
```

> The order-independence case matters: `computeQueryKey` drives window-cache invalidation. Tags are ANDed, so `[a,b]` and `[b,a]` are the *same* query — if the key differs, adding chips in a different order silently refetches every window and discards a valid cache.

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/library/libraryLogic.test.ts
```
Expected: FAIL — `toQuery` copies `tags` through verbatim, so `query.tag` is `undefined`.

- [ ] **Step 3: Implement**

In `src/lib/library/libraryLogic.ts`, change the `filters` block of `LibraryControls`: replace `tag?: string;` with `tags?: string[];`.

Replace `isAppliedFilterValue`:

```ts
/** Whether a filter value counts as "applied". 0 is a real value; [] is not. */
function isAppliedFilterValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	return value !== undefined && value !== '';
}
```

In `computeQueryKey`, normalise tag order so `[a,b]` and `[b,a]` are one query:

```ts
export function computeQueryKey(c: LibraryControls): string {
	const filterEntries = Object.entries(c.filters)
		.filter(([, value]) => isAppliedFilterValue(value))
		// Tags are ANDed, so chip order is not part of the query's identity. Without
		// this, reordering chips invalidates every cached window for no reason.
		.map(([key, value]) => [key, Array.isArray(value) ? [...value].sort() : value])
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

	return JSON.stringify({ sort: c.sort, dir: c.dir, q: c.q, filters: filterEntries });
}
```

In `toQuery`, map `tags` onto the `tag` param:

```ts
	for (const [key, value] of Object.entries(c.filters)) {
		if (!isAppliedFilterValue(value)) continue;
		// filters.tags is the chip set; the HTTP param is `tag`, repeated once per
		// chip (serializeQuery expands the array). The API ANDs them.
		const param = key === 'tags' ? 'tag' : key;
		(query as Record<string, unknown>)[param] = value;
	}
```

In `src/lib/library/types.ts`, change `LibraryQuery`'s `tag?: string;` to `tag?: string[];`.

- [ ] **Step 4: Update the existing tag select to the list shape**

In `src/lib/components/library/LibraryControls.svelte`, the tag `<select>` currently binds `controls.filters.tag`. Change its `value` to `controls.filters.tags?.[0] ?? ''` and its `onchange` to write a list:

```svelte
			onchange={(e) => {
				const v = (e.target as HTMLSelectElement).value;
				onChange({ filters: { ...controls.filters, tags: v === '' ? [] : [v] } });
			}}
```

This is a temporary shim so the page keeps working; Task 8 deletes this select.

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: **158 passing**, 0 errors, 0 warnings. If `check` reports errors about `filters.tag` elsewhere, fix those call sites — nothing should reference `filters.tag` any more.

- [ ] **Step 6: Commit**

```bash
git add src/lib/library/libraryLogic.ts src/lib/library/libraryLogic.test.ts src/lib/library/types.ts src/lib/components/library/LibraryControls.svelte
git commit -m "feat(library): filters.tags is a list, mapped to repeated tag=

The chip input commits multiple tags, ANDed by the API. computeQueryKey sorts
chip order out of the query identity — tags are ANDed, so [a,b] and [b,a] are
the same query and must not invalidate cached windows."
```

---

### Task 3: Corpus filter shape

`source` and `collection` are one axis (a collection IS a source's category — see the spec's Problem section). Collapse them into one nested filter.

**Files:**
- Modify: `src/lib/library/libraryLogic.ts`, `src/lib/library/types.ts`
- Modify: `src/lib/components/library/LibraryControls.svelte` (the two selects — kept for now; Task 6 replaces them)
- Test: `src/lib/library/libraryLogic.test.ts`

**Interfaces:**
- Consumes: `filtersToParams(filters)` from `libraryLogic.ts` — the single source of truth for the filter→param mapping, shared by `/documents` and `/anchor-offset`.
- Produces: `filters.corpus?: { source?: string; collection?: string }` **replaces** `filters.source` and `filters.collection`. `filtersToParams` flattens it back to the flat `source=` / `collection=` params the API takes. `CorpusFilter` is exported from `types.ts`.

> **Add a parity test.** Task 2 added `filtersToParams` precisely because a second copy of this mapping made the jump rail filter differently from the list. Corpus is a *nested object* — the exact shape a raw spread would mangle into `corpus=[object Object]` — so prove the rail gets it too:
>
> ```ts
> 	it('flattens corpus for the rail too — it must not diverge from the list', () => {
> 		expect(filtersToParams({ corpus: { source: 'marxist', collection: 'classics' } })).toEqual({
> 			source: 'marxist',
> 			collection: 'classics'
> 		});
> 	});
> ```

- [ ] **Step 1: Write the failing tests**

```ts
describe('toQuery corpus', () => {
	it('flattens corpus to the flat source/collection params', () => {
		const c = { ...defaultControls(), filters: { corpus: { source: 'marxist', collection: 'classics' } } };
		const q = toQuery(c, 0, 50);
		expect(q.source).toBe('marxist');
		expect(q.collection).toBe('classics');
		expect('corpus' in q).toBe(false);
	});

	it('sends source alone when no category is chosen', () => {
		const c = { ...defaultControls(), filters: { corpus: { source: 'youtube' } } };
		const q = toQuery(c, 0, 50);
		expect(q.source).toBe('youtube');
		expect('collection' in q).toBe(false);
	});

	it('omits both when corpus is empty', () => {
		const c = { ...defaultControls(), filters: { corpus: {} } };
		const q = toQuery(c, 0, 50);
		expect('source' in q).toBe(false);
		expect('collection' in q).toBe(false);
	});

	it('omits both when corpus is absent', () => {
		const q = toQuery(defaultControls(), 0, 50);
		expect('source' in q).toBe(false);
	});
});

describe('computeQueryKey corpus', () => {
	it('distinguishes different corpus selections', () => {
		const a = { ...defaultControls(), filters: { corpus: { source: 'marxist' } } };
		const b = { ...defaultControls(), filters: { corpus: { source: 'youtube' } } };
		expect(computeQueryKey(a)).not.toBe(computeQueryKey(b));
	});

	it('treats an empty corpus object as no filter', () => {
		const empty = { ...defaultControls(), filters: { corpus: {} } };
		expect(computeQueryKey(empty)).toBe(computeQueryKey(defaultControls()));
	});
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/library/libraryLogic.test.ts
```
Expected: FAIL — `q.source` is `undefined`; `corpus` is copied through as an object.

- [ ] **Step 3: Implement**

In `src/lib/library/types.ts`, add above `LibraryQuery`:

```ts
/** The corpus axis: a collection is a category WITHIN a source, not a sibling of it. */
export interface CorpusFilter {
	source?: string;
	collection?: string;
}
```

In `src/lib/library/libraryLogic.ts`, in `LibraryControls.filters`, remove `source?: string;` and `collection?: string;` and add:

```ts
		corpus?: import('./types').CorpusFilter;
```

Teach `isAppliedFilterValue` that an object with no set members is not applied:

```ts
/** Whether a filter value counts as "applied". 0 is a real value; [] and {} are not. */
function isAppliedFilterValue(value: unknown): boolean {
	if (Array.isArray(value)) return value.length > 0;
	if (value !== null && typeof value === 'object') {
		return Object.values(value).some((v) => v !== undefined && v !== '');
	}
	return value !== undefined && value !== '';
}
```

Flatten corpus inside **`filtersToParams`** — NOT inside `toQuery`. Task 2 extracted the
filter→param mapping into `filtersToParams(filters)`, which is now the single source of
truth used by **both** `/documents` (via `toQuery`) and `/anchor-offset` (via
`_appliedFilters` in `libraryState.svelte.ts`). Putting the corpus mapping anywhere else
re-creates the divergence that made the jump rail scroll to the wrong row:

```ts
export function filtersToParams(filters: LibraryControls['filters']): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(filters)) {
		if (!isAppliedFilterValue(value)) continue;
		// corpus is one UI control over two API params: a collection is a category
		// WITHIN a source. The API still takes them flat.
		if (key === 'corpus') {
			const { source, collection } = value as import('./types').CorpusFilter;
			if (source) out.source = source;
			if (collection) out.collection = collection;
			continue;
		}
		// filters.tags is the chip set; the HTTP param is `tag`, repeated once per
		// chip (serializeQuery expands the array). The API ANDs them.
		const param = key === 'tags' ? 'tag' : key;
		out[param] = value;
	}
	return out;
}
```

`toQuery` needs no change — it already returns `Object.assign(query, filtersToParams(c.filters))`.

Add to `AnchorOffsetParams` in `types.ts`: nothing. It already declares flat `source?: string`
and `collection?: string`, which is exactly what `filtersToParams` now emits — so the rail
gets the corpus filter for free, and the `filtersToParams`-parity test from Task 2 covers it.

- [ ] **Step 4: Point the existing two selects at corpus**

In `LibraryControls.svelte`, the source and collection selects read `controls.filters.source` / `.collection`. Change each to read from `controls.filters.corpus` and write a merged object. Source select:

```svelte
			value={controls.filters.corpus?.source ?? ''}
			onchange={(e) => {
				const v = (e.target as HTMLSelectElement).value;
				// Changing source drops the category — categories belong to one source.
				onChange({ filters: { ...controls.filters, corpus: v === '' ? {} : { source: v } } });
			}}
```

Collection select:

```svelte
			value={controls.filters.corpus?.collection ?? ''}
			onchange={(e) => {
				const v = (e.target as HTMLSelectElement).value;
				onChange({
					filters: {
						...controls.filters,
						corpus: { ...controls.filters.corpus, collection: v === '' ? undefined : v }
					}
				});
			}}
```

Both are temporary; Task 6 deletes them.

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: **164 passing**, 0 errors, 0 warnings. Fix any remaining `filters.source` / `filters.collection` references `check` finds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/library/libraryLogic.ts src/lib/library/libraryLogic.test.ts src/lib/library/types.ts src/lib/components/library/LibraryControls.svelte
git commit -m "feat(library): source+collection collapse into one corpus filter

A collection is a category WITHIN a source (sources.py sets collections=[category]),
not a sibling of it. One control, one filter; toQuery flattens back to the flat
source=/collection= params the API takes."
```

---

### Task 4: Corpus tree builder (pure)

**Files:**
- Create: `src/lib/library/corpusLogic.ts`
- Test: `src/lib/library/corpusLogic.test.ts` (create)

**Interfaces:**
- Consumes: `Facets` from Task 1.
- Produces:
```ts
export interface CorpusCategory { name: string; count: number }
export interface CorpusSource { name: string; count: number; categories: CorpusCategory[] }
export function buildCorpusTree(facets: Facets | null): CorpusSource[]
export function corpusLabel(corpus: CorpusFilter | undefined): string  // '' when unset
```
`corpusLabel` returns `''` for unset (the trigger then shows its glyph alone), `'Anarchist Library'` for a source, `'Anarchist Library ▸ Egoism'` for source+category. Task 6 renders it.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/library/corpusLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildCorpusTree, corpusLabel } from './corpusLogic';
import type { Facets } from './types';

const facets = (over: Partial<Facets> = {}): Facets => ({
	languages: [],
	sources: [
		{ name: 'youtube', count: 60726 },
		{ name: 'anarchist', count: 24594 },
		{ name: 'user', count: 2521 }
	],
	collections: [
		{ name: 'transcript', source: 'youtube', count: 60726 },
		{ name: 'Egoism', source: 'anarchist', count: 1204 },
		{ name: 'Anarcho-syndicalism', source: 'anarchist', count: 3881 }
	],
	tags: [],
	...over
});

describe('buildCorpusTree', () => {
	it('nests categories under their source, sources ordered by count desc', () => {
		const tree = buildCorpusTree(facets());
		expect(tree.map((s) => s.name)).toEqual(['youtube', 'anarchist', 'user']);
		expect(tree[1].categories.map((c) => c.name)).toEqual(['Anarcho-syndicalism', 'Egoism']);
	});

	it('orders categories by count desc, then name', () => {
		const tree = buildCorpusTree(facets());
		expect(tree[1].categories.map((c) => c.count)).toEqual([3881, 1204]);
	});

	it('gives a source with no categories an empty list, not a missing one', () => {
		// `user` is 2,521 real documents with zero collections. It must appear in the
		// tree and simply not expand — dropping it would hide a whole source.
		const tree = buildCorpusTree(facets());
		const user = tree.find((s) => s.name === 'user');
		expect(user).toBeDefined();
		expect(user!.categories).toEqual([]);
		expect(user!.count).toBe(2521);
	});

	it('ignores collection buckets whose source is not in the sources facet', () => {
		const tree = buildCorpusTree(
			facets({ collections: [{ name: 'orphan', source: 'gone', count: 5 }] })
		);
		expect(tree.every((s) => s.categories.length === 0)).toBe(true);
		expect(tree.map((s) => s.name)).toEqual(['youtube', 'anarchist', 'user']);
	});

	it('drops buckets with no source — an un-upgraded API omits the key', () => {
		// Degradation: FacetBucket.source is optional. Un-attributed buckets cannot be
		// nested, so the tree is sources-only rather than wrong.
		const tree = buildCorpusTree(facets({ collections: [{ name: 'classics', count: 5 }] }));
		expect(tree.every((s) => s.categories.length === 0)).toBe(true);
	});

	it('returns [] for null facets', () => {
		expect(buildCorpusTree(null)).toEqual([]);
	});
});

describe('corpusLabel', () => {
	it('is empty when unset — the trigger shows its glyph alone', () => {
		expect(corpusLabel(undefined)).toBe('');
		expect(corpusLabel({})).toBe('');
	});

	it('shows the source alone', () => {
		expect(corpusLabel({ source: 'anarchist' })).toBe('anarchist');
	});

	it('shows source ▸ category', () => {
		expect(corpusLabel({ source: 'anarchist', collection: 'Egoism' })).toBe('anarchist ▸ Egoism');
	});

	it('ignores a category with no source', () => {
		expect(corpusLabel({ collection: 'Egoism' })).toBe('');
	});
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/library/corpusLogic.test.ts
```
Expected: FAIL — `Failed to resolve import "./corpusLogic"`.

- [ ] **Step 3: Implement**

Create `src/lib/library/corpusLogic.ts`:

```ts
import type { Facets, CorpusFilter } from './types';

export interface CorpusCategory {
	name: string;
	count: number;
}

export interface CorpusSource {
	name: string;
	count: number;
	categories: CorpusCategory[];
}

/**
 * Nest collection facet buckets under the source they belong to.
 *
 * A collection is a category WITHIN a source, not a sibling of it, but the API
 * returns the two dimensions flat. Buckets are keyed (source, name); a bucket with
 * no `source` comes from an un-upgraded API and cannot be nested, so it is dropped
 * and the tree degrades to sources-only rather than nesting it under a wrong parent.
 *
 * Sources with zero categories (`user` has 2,521 documents and no collections) are
 * kept with an empty list — they exist, they just do not expand.
 */
export function buildCorpusTree(facets: Facets | null): CorpusSource[] {
	if (!facets) return [];

	const bySource = new Map<string, CorpusCategory[]>();
	for (const s of facets.sources) bySource.set(s.name, []);

	for (const b of facets.collections) {
		const list = b.source ? bySource.get(b.source) : undefined;
		if (!list) continue; // no source, or a source the facet does not list
		list.push({ name: b.name, count: b.count });
	}

	for (const list of bySource.values()) {
		list.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
	}

	return facets.sources
		.map((s) => ({ name: s.name, count: s.count, categories: bySource.get(s.name) ?? [] }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** The corpus trigger's label. Empty when unset — the trigger shows its glyph alone. */
export function corpusLabel(corpus: CorpusFilter | undefined): string {
	if (!corpus?.source) return '';
	return corpus.collection ? `${corpus.source} ▸ ${corpus.collection}` : corpus.source;
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: **174 passing**, 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/corpusLogic.ts src/lib/library/corpusLogic.test.ts
git commit -m "feat(library): pure corpus tree builder

Nests collection buckets under their source. Sources with no categories (user
has 2,521 docs and zero collections) stay in the tree and simply do not expand.
Un-attributed buckets are dropped rather than nested under a wrong parent."
```

---

# PHASE B — the controls

### Task 5: Shared dropdown shell

Four controls need the same trigger + panel + outside-click + Escape. Build it once.

**Files:**
- Create: `src/lib/components/library/FacetPanel.svelte`
- Modify: `src/lib/components/library/LibraryControls.svelte` (styles only — see Step 3)

**Interfaces:**
- Produces a component with props:
```ts
{ glyph: string; label: string; ariaLabel: string; open: boolean;
  onToggle: (open: boolean) => void; children: Snippet; wide?: boolean }
```
Renders `<button class="trigger">{glyph}{#if label} {label}{/if}</button>` plus, when `open`, a `<div class="panel">` containing `children`. **`label === ''` means unset**: the trigger shows the glyph alone and drops the `.set` class. Tasks 6-8 pass their own panel bodies as children.

- [ ] **Step 1: Write the component**

Create `src/lib/components/library/FacetPanel.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		glyph: string;
		label: string; // '' = unset → glyph only, no .set styling
		ariaLabel: string;
		open: boolean;
		onToggle: (open: boolean) => void;
		children: Snippet;
		wide?: boolean;
	}

	const { glyph, label, ariaLabel, open, onToggle, children, wide = false }: Props = $props();

	let root: HTMLDivElement | undefined = $state();

	// Close on outside click / Escape. Only bound while open, so a closed panel costs
	// no listeners — there are four of these on the page.
	$effect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) onToggle(false);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onToggle(false);
		};
		document.addEventListener('mousedown', onDocClick);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('mousedown', onDocClick);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<div class="facet" bind:this={root}>
	<button
		class="trigger"
		class:set={label !== ''}
		aria-label={ariaLabel}
		aria-expanded={open}
		aria-haspopup="listbox"
		onclick={() => onToggle(!open)}
	>
		<span class="glyph">{glyph}</span>
		{#if label}<span class="label">{label}</span>{/if}
		<span class="chev" aria-hidden="true">⌄</span>
	</button>

	{#if open}
		<div class="panel" class:wide role="listbox" tabindex="-1">
			{@render children()}
		</div>
	{/if}
</div>

<style>
	.facet { position: relative; flex-shrink: 0; }

	.trigger {
		display: flex; align-items: center; gap: 0.3rem;
		background: none;
		border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.3rem 0.5rem; cursor: pointer; transition: all 0.15s;
		white-space: nowrap; opacity: 0.72;
	}
	.trigger:hover { border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	.trigger:focus-visible { outline: none; border-color: rgba(var(--ui-rgb), 0.45); opacity: 1; }
	/* Set = the filter is doing work. Hierarchy via opacity, never a second colour. */
	.trigger.set { opacity: 1; border-color: rgba(var(--ui-rgb), 0.55); }
	.chev { opacity: 0.6; }

	.panel {
		position: absolute; top: calc(100% + 0.3rem); right: 0; z-index: 20;
		min-width: 11rem; max-height: 60vh; overflow-y: auto;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 0.4rem 0;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.05em;
	}
	.panel.wide { min-width: 17rem; }

	/* Narrow: the label drops, the glyph carries the control. A set filter keeps its
	   border so you can still tell something is filtered, just not what. */
	@media (max-width: 480px) {
		.label { display: none; }
	}
</style>
```

- [ ] **Step 2: Verify it compiles**

```bash
source ~/.nvm/nvm.sh && nvm use 20
npm run check
```
Expected: **0 errors, 0 warnings**. (An unused-component warning is not expected — `check` does not flag unused files.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/library/FacetPanel.svelte
git commit -m "feat(library): shared facet dropdown shell

Trigger + panel + outside-click + Escape, once. label==='' means unset: the
trigger shows its glyph alone and drops .set, so an inactive filter is quiet
and nothing renders 'All ...'. Narrow mode drops the label to glyph-only."
```

---

### Task 6: Corpus control

**Files:**
- Create: `src/lib/components/library/CorpusControl.svelte`
- Test: none (component; the logic is tested in Task 4)

**Interfaces:**
- Consumes: `buildCorpusTree`, `corpusLabel` (Task 4); `FacetPanel` (Task 5); `CorpusFilter` (Task 3).
- Produces: `<CorpusControl {facets} {corpus} onChange={(next: CorpusFilter) => void} />`.

- [ ] **Step 1: Write the component**

Create `src/lib/components/library/CorpusControl.svelte`:

```svelte
<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import { buildCorpusTree, corpusLabel } from '$lib/library/corpusLogic';
	import type { Facets, CorpusFilter } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		corpus: CorpusFilter | undefined;
		onChange: (next: CorpusFilter) => void;
	}

	const { facets, corpus, onChange }: Props = $props();

	let open = $state(false);
	// Which source is expanded in the panel. Defaults to the selected one so opening
	// the panel shows you where you are.
	let expanded = $state<string | null>(null);

	const tree = $derived(buildCorpusTree(facets));
	const label = $derived(corpusLabel(corpus));

	function toggleOpen(next: boolean) {
		open = next;
		if (next) expanded = corpus?.source ?? null;
	}

	function pickAll() {
		onChange({});
		open = false;
	}

	function pickSource(name: string) {
		// Selecting a source clears any category — categories belong to one source.
		onChange({ source: name });
		expanded = expanded === name ? null : name;
	}

	function pickCategory(source: string, collection: string) {
		onChange({ source, collection });
		open = false;
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<FacetPanel glyph="◈" {label} ariaLabel="Filter by corpus" {open} onToggle={toggleOpen} wide>
	{#snippet children()}
		<button class="row" class:sel={!corpus?.source} onclick={pickAll}>
			<span>all corpora</span>
			<span class="c">{fmt(facets?.sources.reduce((n, s) => n + s.count, 0) ?? 0)}</span>
		</button>
		<div class="divider"></div>

		{#each tree as src (src.name)}
			<button
				class="row"
				class:sel={corpus?.source === src.name && !corpus?.collection}
				aria-expanded={expanded === src.name}
				onclick={() => pickSource(src.name)}
			>
				<span>
					<!-- A source with no categories never expands; user has 2,521 docs
					     and zero collections. Show no caret rather than a dead one. -->
					{#if src.categories.length}{expanded === src.name ? '▾' : '▸'}{:else}&nbsp;&nbsp;{/if}
					{src.name}
				</span>
				<span class="c">{fmt(src.count)}</span>
			</button>

			{#if expanded === src.name}
				{#each src.categories as cat (cat.name)}
					<button
						class="row nest"
						class:sel={corpus?.source === src.name && corpus?.collection === cat.name}
						onclick={() => pickCategory(src.name, cat.name)}
					>
						<span>{cat.name}</span>
						<span class="c">{fmt(cat.count)}</span>
					</button>
				{/each}
			{/if}
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
	.row.nest { padding-left: 1.6rem; }
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.3rem 0; }
</style>
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run check
```
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/library/CorpusControl.svelte
git commit -m "feat(library): corpus cascade control

One control for source+collection: categories nest under their source, so the
empty source x collection pairs the two-dropdown UI allowed are unreachable.
Sources with no categories show no caret rather than a dead one."
```

---

### Task 7: Language and State controls

**Files:**
- Create: `src/lib/components/library/LanguageControl.svelte`, `src/lib/components/library/StateControl.svelte`

**Interfaces:**
- Consumes: `FacetPanel` (Task 5).
- Produces:
  - `<LanguageControl {facets} language={string | undefined} onChange={(v: string | undefined) => void} />` — glyph `文`.
  - `<StateControl {facets} {stats} visibility needs_formatting decision onChange={(patch) => void} />` — glyph `⚙`; `onChange` takes `{ visibility?: string; needs_formatting?: 0 | 1; decision?: DecisionInput }` where an explicitly-`undefined` member clears that group.

- [ ] **Step 1: Write LanguageControl**

Create `src/lib/components/library/LanguageControl.svelte`:

```svelte
<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { Facets } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		language: string | undefined;
		onChange: (v: string | undefined) => void;
	}

	const { facets, language, onChange }: Props = $props();

	let open = $state(false);

	// The corpus has 33 languages, and en / en-US / en-GB are separate buckets. They
	// are listed as the API returns them (count desc) rather than normalised here —
	// merging display names would make the counts lie about what a click filters to.
	const buckets = $derived(facets?.languages ?? []);

	function pick(v: string | undefined) {
		onChange(v);
		open = false;
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<FacetPanel glyph="文" label={language ?? ''} ariaLabel="Filter by language" {open} onToggle={(v) => (open = v)}>
	{#snippet children()}
		<button class="row" class:sel={!language} onclick={() => pick(undefined)}>
			<span>all languages</span>
		</button>
		<div class="divider"></div>
		{#each buckets as b (b.name)}
			<button class="row" class:sel={language === b.name} onclick={() => pick(b.name)}>
				<span>{b.name}</span>
				<span class="c">{fmt(b.count)}</span>
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

> The "all languages" row inside the panel is fine — it is a *choice within an open menu*, not a resting label. The rule the design forbids is a **trigger** that reads "All languages". The trigger here shows `文` alone when unset.

- [ ] **Step 2: Write StateControl**

Create `src/lib/components/library/StateControl.svelte`:

```svelte
<script lang="ts">
	import FacetPanel from './FacetPanel.svelte';
	import type { Facets, DecisionInput, CurationStats } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		stats: CurationStats | null;
		visibility: string | undefined;
		needs_formatting: 0 | 1 | undefined;
		decision: DecisionInput | undefined;
		onChange: (patch: {
			visibility?: string;
			needs_formatting?: 0 | 1;
			decision?: DecisionInput;
		}) => void;
	}

	const { facets, stats, visibility, needs_formatting, decision, onChange }: Props = $props();

	let open = $state(false);

	// Trigger shows every active group, so the whole state reads at a glance.
	const label = $derived(
		[
			visibility,
			needs_formatting === undefined ? undefined : needs_formatting === 1 ? 'needs fmt' : 'clean',
			decision
		]
			.filter(Boolean)
			.join(' · ')
	);

	function count(buckets: { name: string; count: number }[] | undefined, name: string): string {
		const b = buckets?.find((x) => x.name === name);
		// Optional facet: an un-upgraded API omits the bucket, so show no count
		// rather than a wrong one.
		return b ? b.count.toLocaleString() : '';
	}

	const decisionCounts = $derived<Record<string, string>>(
		stats
			? {
					undecided: stats.undecided.toLocaleString(),
					keep: stats.keep.toLocaleString(),
					hide: stats.hide.toLocaleString(),
					delete: stats.delete.toLocaleString()
				}
			: {}
	);
</script>

<FacetPanel glyph="⚙" {label} ariaLabel="Filter by state" {open} onToggle={(v) => (open = v)} wide>
	{#snippet children()}
		<p class="hd">visibility</p>
		<button class="row" class:sel={!visibility} onclick={() => onChange({ visibility: undefined })}>
			<span>all</span>
		</button>
		{#each ['private', 'public'] as v (v)}
			<button class="row" class:sel={visibility === v} onclick={() => onChange({ visibility: v })}>
				<span>{v}</span>
				<span class="c">{count(facets?.visibility, v)}</span>
			</button>
		{/each}

		<div class="divider"></div>
		<p class="hd">formatting</p>
		<button
			class="row"
			class:sel={needs_formatting === undefined}
			onclick={() => onChange({ needs_formatting: undefined })}
		>
			<span>all</span>
		</button>
		<button
			class="row"
			class:sel={needs_formatting === 1}
			onclick={() => onChange({ needs_formatting: 1 })}
		>
			<span>needs formatting</span>
			<span class="c">{count(facets?.needs_formatting, '1')}</span>
		</button>
		<button
			class="row"
			class:sel={needs_formatting === 0}
			onclick={() => onChange({ needs_formatting: 0 })}
		>
			<span>clean</span>
			<span class="c">{count(facets?.needs_formatting, '0')}</span>
		</button>

		<div class="divider"></div>
		<p class="hd">decision</p>
		<button class="row" class:sel={!decision} onclick={() => onChange({ decision: undefined })}>
			<span>all</span>
		</button>
		{#each ['undecided', 'keep', 'hide', 'delete'] as d (d)}
			<button
				class="row"
				class:sel={decision === d}
				onclick={() => onChange({ decision: d as DecisionInput })}
			>
				<span>{d}</span>
				<span class="c">{decisionCounts[d] ?? ''}</span>
			</button>
		{/each}
	{/snippet}
</FacetPanel>

<style>
	.hd {
		font-size: 0.5rem; letter-spacing: 0.14em; text-transform: uppercase;
		color: var(--clr-text); opacity: 0.5;
		margin: 0; padding: 0.2rem 0.7rem 0.35rem;
	}
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
	.divider { height: 1px; background: rgba(var(--ui-rgb), 0.16); margin: 0.35rem 0; }
</style>
```

> `needs_formatting: undefined` must be sent **explicitly** in the patch to clear the group — `onChange({ needs_formatting: undefined })` differs from `onChange({})`. Task 9's merge handler relies on this; do not "tidy" the undefined members away.

- [ ] **Step 3: Verify both compile**

```bash
npm run check
```
Expected: 0 errors, 0 warnings. `CurationStats` is exported from `src/lib/library/types.ts:87` (SP2 added it) with members `keep`, `hide`, `delete`, `decided`, `total`, `undecided` — all numbers.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/library/LanguageControl.svelte src/lib/components/library/StateControl.svelte
git commit -m "feat(library): language + state controls

Language is a 文 glyph until set. State merges visibility, formatting and SP2's
decision into three groups in one dropdown — the trigger lists every active
group, so state reads at a glance without opening it. Counts come from the
facet buckets and SP2's curation stats; missing buckets show no count."
```

---

### Task 8: Tag chip input

**Files:**
- Create: `src/lib/components/library/TagChipInput.svelte`
- Test: `src/lib/library/tagPanelLogic.test.ts` + create `src/lib/library/tagPanelLogic.ts`

**Interfaces:**
- Consumes: `searchTags` (Task 1), `filters.tags` (Task 2).
- Produces:
  - `filterTagBuckets(buckets: FacetBucket[], q: string, chosen: string[]): FacetBucket[]` in `tagPanelLogic.ts` — case-insensitive substring match, already-chosen tags excluded.
  - `<TagChipInput {facets} tags={string[]} q={string} onTagsChange={(t: string[]) => void} onQChange={(q: string) => void} {searchTags} />` where `searchTags: (q: string) => Promise<FacetBucket[]>` is injected so the component is testable and the client stays in one place.

- [ ] **Step 1: Write the failing logic tests**

Create `src/lib/library/tagPanelLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { filterTagBuckets } from './tagPanelLogic';

const buckets = [
	{ name: 'theory', count: 5 },
	{ name: 'economics', count: 2 },
	{ name: 'anarcho-syndicalism', count: 1990 }
];

describe('filterTagBuckets', () => {
	it('returns everything unchosen for an empty query', () => {
		expect(filterTagBuckets(buckets, '', []).map((b) => b.name)).toEqual([
			'theory',
			'economics',
			'anarcho-syndicalism'
		]);
	});

	it('matches a substring, case-insensitively', () => {
		expect(filterTagBuckets(buckets, 'ECON', []).map((b) => b.name)).toEqual(['economics']);
	});

	it('excludes tags already committed as chips', () => {
		expect(filterTagBuckets(buckets, '', ['theory']).map((b) => b.name)).toEqual([
			'economics',
			'anarcho-syndicalism'
		]);
	});

	it('returns [] when nothing matches', () => {
		expect(filterTagBuckets(buckets, 'zzz', [])).toEqual([]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npx vitest run src/lib/library/tagPanelLogic.test.ts
```
Expected: FAIL — `Failed to resolve import "./tagPanelLogic"`.

- [ ] **Step 3: Implement the logic**

Create `src/lib/library/tagPanelLogic.ts`:

```ts
import type { FacetBucket } from './types';

/**
 * Filter the top-200 tag facet client-side. The corpus has ~12k distinct tags and
 * the facet is capped at 200, so this covers the common case with no network; the
 * component falls back to GET /tags?q= for the tail.
 */
export function filterTagBuckets(
	buckets: FacetBucket[],
	q: string,
	chosen: string[]
): FacetBucket[] {
	const needle = q.trim().toLowerCase();
	const taken = new Set(chosen);
	return buckets.filter(
		(b) => !taken.has(b.name) && (needle === '' || b.name.toLowerCase().includes(needle))
	);
}
```

- [ ] **Step 4: Write the component**

Create `src/lib/components/library/TagChipInput.svelte`:

```svelte
<script lang="ts">
	import { filterTagBuckets } from '$lib/library/tagPanelLogic';
	import type { Facets, FacetBucket } from '$lib/library/types';

	interface Props {
		facets: Facets | null;
		tags: string[];
		q: string;
		onTagsChange: (tags: string[]) => void;
		onQChange: (q: string) => void;
		searchTags: (q: string) => Promise<FacetBucket[]>;
	}

	const { facets, tags, q, onTagsChange, onQChange, searchTags }: Props = $props();

	let text = $state('');
	let open = $state(false);
	let remote = $state<FacetBucket[] | null>(null);
	let root: HTMLDivElement | undefined = $state();
	let debounce: ReturnType<typeof setTimeout> | undefined;

	// Local matches over the top-200 facet — no network for the common case.
	const local = $derived(filterTagBuckets(facets?.tags ?? [], text, tags));
	// Past the 200-cap the facet cannot answer, so fall back to the server. Prefer
	// local results when there are any; remote only fills the tail.
	const suggestions = $derived(local.length > 0 ? local : (remote ?? []));

	$effect(() => {
		const needle = text.trim();
		if (debounce) clearTimeout(debounce);
		if (needle === '' || local.length > 0) {
			remote = null;
			return;
		}
		debounce = setTimeout(async () => {
			try {
				remote = await searchTags(needle);
			} catch {
				remote = []; // an un-upgraded API has no /tags; degrade to local-only
			}
		}, 200);
		return () => clearTimeout(debounce);
	});

	$effect(() => {
		if (!open) return;
		const onDocClick = (e: MouseEvent) => {
			if (root && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	});

	function addTag(name: string) {
		if (!tags.includes(name)) onTagsChange([...tags, name]);
		text = '';
		remote = null;
	}

	function removeTag(name: string) {
		onTagsChange(tags.filter((t) => t !== name));
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			return;
		}
		// Backspace on an empty input removes the last chip.
		if (e.key === 'Backspace' && text === '' && tags.length > 0) {
			e.preventDefault();
			removeTag(tags[tags.length - 1]);
			return;
		}
		if (e.key === 'Enter') {
			e.preventDefault();
			// Enter commits the top suggestion if there is one; otherwise the typed
			// text becomes the search query. Off-facet tags are reachable by picking
			// them from the panel, which /tags?q= populates.
			if (suggestions.length > 0) addTag(suggestions[0].name);
			else onQChange(text.trim());
		}
	}

	function fmt(n: number): string {
		return n.toLocaleString();
	}
</script>

<div class="wrap" bind:this={root}>
	<div class="bar">
		{#each tags as tag (tag)}
			<span class="chip">
				{tag}
				<button class="x" aria-label={`remove tag ${tag}`} onclick={() => removeTag(tag)}>×</button>
			</span>
		{/each}
		<input
			class="input"
			placeholder={tags.length ? 'add tag…' : 'search library…'}
			bind:value={text}
			onfocus={() => (open = true)}
			onkeydown={onKeydown}
			aria-label="Search library or filter by tag"
			autocomplete="off"
			spellcheck="false"
		/>
		{#if q}
			<button class="x clear" aria-label="clear search" onclick={() => onQChange('')}>×</button>
		{/if}
	</div>

	{#if open && suggestions.length > 0}
		<div class="panel" role="listbox">
			{#each suggestions.slice(0, 12) as b (b.name)}
				<button class="row" onclick={() => addTag(b.name)}>
					<span>{b.name}</span>
					<span class="c">{fmt(b.count)}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.wrap { position: relative; flex: 1; min-width: 10rem; }
	.bar {
		display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap;
		border-bottom: 1px solid rgba(var(--ui-rgb), 0.22);
		padding-bottom: 0.4rem;
	}
	.input {
		background: none; border: none; outline: none; flex: 1; min-width: 6rem;
		font-family: var(--font-ui); font-size: 0.78rem; letter-spacing: 0.06em;
		color: var(--clr-text); padding: 0.3rem 0; caret-color: currentColor;
	}
	.input::placeholder { color: var(--clr-text); opacity: 0.45; }
	.chip {
		display: inline-flex; align-items: center; gap: 0.3rem;
		border: 1px solid rgba(var(--ui-rgb), 0.4);
		background: rgba(var(--ui-rgb), 0.09);
		padding: 0.1rem 0.38rem;
		font-family: var(--font-ui); font-size: 0.55rem; letter-spacing: 0.05em;
		color: var(--clr-text);
	}
	.x {
		background: none; border: none; cursor: pointer; padding: 0; line-height: 1;
		color: var(--clr-text); opacity: 0.55; font-size: 0.75rem;
	}
	.x:hover { opacity: 1; }
	.panel {
		position: absolute; top: calc(100% + 0.3rem); left: 0; z-index: 20;
		min-width: 15rem; max-height: 50vh; overflow-y: auto;
		background: var(--glass-bg);
		backdrop-filter: var(--glass-blur);
		-webkit-backdrop-filter: var(--glass-blur);
		border: 1px solid var(--glass-border);
		padding: 0.4rem 0;
	}
	.row {
		display: flex; justify-content: space-between; gap: 1rem; width: 100%;
		background: none; border: none; cursor: pointer; text-align: left;
		color: var(--clr-text); opacity: 0.7;
		font-family: var(--font-ui); font-size: 0.6rem; letter-spacing: 0.04em;
		padding: 0.25rem 0.7rem; transition: opacity 0.12s;
	}
	.row:hover { opacity: 1; background: rgba(var(--ui-rgb), 0.12); }
	.c { opacity: 0.5; font-variant-numeric: tabular-nums; }
</style>
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: **178 passing**, 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
git add src/lib/library/tagPanelLogic.ts src/lib/library/tagPanelLogic.test.ts src/lib/components/library/TagChipInput.svelte
git commit -m "feat(library): tag chip input with browsable panel

Search and tags share one field: typed text is full-text, committed chips are
tag facets ANDed by the API. The panel lists the top-200 facet with no network
and falls back to GET /tags?q= for the ~11.8k tag tail past the cap. Backspace
on an empty input removes the last chip."
```

---

### Task 9: Compose the two zones

**Files:**
- Modify: `src/lib/components/library/LibraryControls.svelte` (substantially rewritten)
- Modify: `src/routes/library/+page.svelte` (header cluster)
- Modify: `src/lib/components/library/DocList.svelte:93` (progress on the count line)
- Modify: `src/lib/library/libraryState.svelte.ts` (pass `source` to `getFacets`)

**Interfaces:**
- Consumes: all four controls (Tasks 6-8).
- Produces: `LibraryControls` renders **only** the toolbar zone — chip input, sort capsule, view icon. The three scope controls move to `+page.svelte`'s header, which gains a `.heading-row`.

- [ ] **Step 1: Rewrite LibraryControls to the toolbar zone**

Replace the markup in `src/lib/components/library/LibraryControls.svelte` with the chip input, sort capsule and view toggle. Delete all six remaining `<select>` elements and the `progress` span (it moves to `DocList`). Keep the existing debounce plumbing for `q`, `SORT_OPTIONS`, `onSortChange`, `toggleDir`, `toggleView`, and delete `setFilter`, `onNeedsFormattingChange`, `mergeCollectionBuckets`, and the `collectionBuckets` derived — none survive.

```svelte
<div class="controls">
	<div class="controls-row">
		<TagChipInput
			{facets}
			tags={controls.filters.tags ?? []}
			q={controls.q}
			onTagsChange={(tags) => onChange({ filters: { ...controls.filters, tags } })}
			onQChange={(q) => onChange({ q })}
			searchTags={(q) => libraryState.searchTags(q)}
		/>

		<div class="capsule">
			<select class="cap-sel" value={controls.sort} onchange={onSortChange} aria-label="Sort by">
				{#each SORT_OPTIONS as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
			<button
				class="cap-btn"
				onclick={toggleDir}
				aria-label={controls.dir === 'asc' ? 'ascending' : 'descending'}
			>{controls.dir === 'asc' ? '↑' : '↓'}</button>
		</div>

		<button
			class="view-toggle"
			onclick={toggleView}
			aria-label={`switch to ${controls.view === 'list' ? 'grid' : 'list'} view`}
		>{controls.view === 'list' ? '▤' : '▦'}</button>
	</div>
</div>
```

Import `TagChipInput` and `libraryState`. Drop the `stats` prop from `Props` — `StateControl` owns it now, in the header. Delete `.filters-row`, `.ctrl-select`, `.search-bar`, `.search-input`, `.chip-clear`, `.sort-group` and `.progress` styles; add:

```css
	.capsule { display: inline-flex; border: 1px solid rgba(var(--ui-rgb), 0.28); flex-shrink: 0; }
	.cap-sel, .cap-btn {
		background: none; border: none; color: var(--clr-text);
		font-family: var(--font-ui);
		font-size: 0.6rem; letter-spacing: 0.06em; text-transform: uppercase;
		padding: 0.3rem 0.5rem; cursor: pointer;
	}
	.cap-btn { border-left: 1px solid rgba(var(--ui-rgb), 0.28); padding: 0.3rem 0.4rem; }
	.view-toggle {
		background: none; border: 1px solid rgba(var(--ui-rgb), 0.28);
		color: var(--clr-text); font-size: 0.7rem;
		padding: 0.3rem 0.5rem; cursor: pointer; flex-shrink: 0;
	}
	.capsule:hover, .view-toggle:hover { border-color: rgba(var(--ui-rgb), 0.45); }
```

- [ ] **Step 2: Add `searchTags` to libraryState and narrow the facets fetch**

In `src/lib/library/libraryState.svelte.ts`, add to the `libraryState` object:

```ts
	searchTags(q: string) {
		return client.searchTags(q);
	},
```

`client.getFacets()` is called at `src/lib/library/libraryState.svelte.ts:162`. Pass the active source, so the panel's categories and tags reflect the current corpus:

```ts
	_facets = await client.getFacets(_controls.filters.corpus?.source);
```

If `applyControls` does not already refetch facets when the corpus source changes, add that: compare `patch.filters?.corpus?.source` against the previous source and re-fetch only when it differs. **Do not refetch facets on every control change** — it is six aggregate queries against 100k documents.

- [ ] **Step 3: Move the scope controls into the page header**

In `src/routes/library/+page.svelte`, replace `<h1 class="heading">library</h1>` with:

```svelte
		<div class="heading-row">
			<h1 class="heading">library</h1>
			{#if libraryState.status === 'ready'}
				<div class="scope">
					<CorpusControl
						facets={libraryState.facets}
						corpus={libraryState.controls.filters.corpus}
						onChange={(corpus) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, corpus }
							})}
					/>
					<LanguageControl
						facets={libraryState.facets}
						language={libraryState.controls.filters.language}
						onChange={(language) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, language }
							})}
					/>
					<StateControl
						facets={libraryState.facets}
						stats={libraryState.curationStats}
						visibility={libraryState.controls.filters.visibility}
						needs_formatting={libraryState.controls.filters.needs_formatting}
						decision={libraryState.controls.filters.decision}
						onChange={(patch) =>
							libraryState.applyControls({
								filters: { ...libraryState.controls.filters, ...patch }
							})}
					/>
				</div>
			{/if}
		</div>
```

Import the three controls. Remove `stats={libraryState.curationStats}` from `<LibraryControls>`. Add styles:

```css
	.heading-row {
		display: flex; align-items: center; justify-content: space-between;
		gap: 1rem; margin-bottom: 2rem;
	}
	.heading { margin: 0; }
	.scope { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end; }
```

The `.heading` rule currently carries `margin: 0 0 2rem` — move that margin to `.heading-row` as above so the spacing is unchanged.

> **The spread in `StateControl`'s `onChange` is load-bearing.** `{...filters, ...patch}` with `patch = { needs_formatting: undefined }` sets the key to `undefined`, which `isAppliedFilterValue` treats as cleared. That is why Task 7 sends undefined members explicitly.

- [ ] **Step 4: Move the progress readout onto the count line**

In `src/lib/components/library/DocList.svelte:93`, the count line reads `<p class="count">{total} documents</p>`. The progress readout is scope, not a query control, so it belongs here. Add a `stats` prop to `DocList`'s `Props` (`stats: CurationStats | null`), pass `stats={libraryState.curationStats}` from `+page.svelte`, import `progressText` from `$lib/library/curationLogic`, and render:

```svelte
		<p class="count">
			{total} documents{#if progressText(stats)} · {progressText(stats)}{/if}
		</p>
```

- [ ] **Step 5: Run tests + typecheck**

```bash
npx vitest run
npm run check
```
Expected: **178 passing**, 0 errors, 0 warnings. Fix any dangling references `check` reports from the deleted selects.

- [ ] **Step 6: Verify in the real app**

```bash
npm run dev
```
Open `/library`, activate admin (type ``` outside an input), and confirm by eye:
1. **At rest, nothing reads "All …"** — the header shows `◈`, `文`, `⚙` alone.
2. Picking a source narrows the corpus panel's categories; `user` shows no caret and does not expand.
3. Two tag chips narrow the result count; Backspace on an empty input removes the last chip.
4. The State trigger shows every active group.
5. The count line reads `100417 documents · <progress>`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/library/LibraryControls.svelte src/routes/library/+page.svelte src/lib/components/library/DocList.svelte src/lib/library/libraryState.svelte.ts
git commit -m "feat(library): two-zone toolbar — scope in the header, query in the bar

Seven selects across two rows become three scope controls beside the title and
three query controls in one bar. Nothing renders 'All ...': an unset control is
its glyph alone. The curation progress readout moves to the count line, where
the page already states what you are looking at."
```

---

### Task 10: Narrow mode

**Files:**
- Modify: `src/routes/library/+page.svelte`, `src/lib/components/library/FacetPanel.svelte`
- Test: manual (viewport)

- [ ] **Step 1: Verify the label already drops**

`FacetPanel`'s `@media (max-width: 480px) { .label { display: none; } }` (Task 5) already collapses each control to its glyph. Confirm at a 400px viewport that the three triggers are glyph-only and a set control keeps its `.set` border.

- [ ] **Step 2: Keep the header on one line**

At 400px the title plus three glyph triggers must not wrap. Add to `+page.svelte`:

```css
	@media (max-width: 480px) {
		.heading-row { gap: 0.5rem; margin-bottom: 1.25rem; }
		.scope { gap: 0.3rem; flex-wrap: nowrap; }
	}
```

- [ ] **Step 3: Keep panels on-screen**

`FacetPanel`'s panel is `right: 0`, so a `wide` panel (17rem = 272px) can overflow a 400px viewport when its trigger sits at the right edge. Add to `FacetPanel.svelte`:

```css
	@media (max-width: 480px) {
		.panel, .panel.wide {
			position: fixed;
			left: 0.75rem; right: 0.75rem;
			top: auto;
			min-width: 0; width: auto;
			max-height: 50vh;
		}
	}
```

- [ ] **Step 4: Verify at 400px**

```bash
npm run dev
```
In devtools at 400px wide:
1. Title + `◈` `文` `⚙` on one line, no wrap, no horizontal page scroll.
2. Each panel opens fully on-screen — no clipping at either edge.
3. A set control is still visibly distinct from an unset one.
4. The chip input still takes the remaining width and chips wrap without pushing the sort capsule off-screen.

- [ ] **Step 5: Commit**

```bash
git add src/routes/library/+page.svelte src/lib/components/library/FacetPanel.svelte
git commit -m "fix(library): narrow-mode scope cluster + on-screen panels

Below 480px the three scope controls collapse to glyphs and stay on the title's
line; a set control keeps its border so you can tell something is filtered even
though you cannot read what. Panels go fixed-width-inset so a wide panel anchored
right cannot overflow the viewport."
```

---

## Self-Review

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Header zone: corpus, language, state; active value is the label | 6, 7, 9 |
| Corpus merges source+collection; categories nest; narrowed facet | 3, 4, 6, 9 (Step 2) |
| Language as `文` glyph | 7 |
| State = visibility + formatting + **decision** (revision note) | 7 |
| Toolbar zone: chip input, sort capsule, view icon | 8, 9 |
| Tags: type + browsable panel; 200-cap then `/tags?q=` | 1, 8 |
| Multi-tag ANDed, repeated `tag=` | 1, 2 |
| Progress readout moves to the count line (revision note) | 9 (Step 4) |
| Narrow mode: glyph-only, set border retained | 5, 10 |
| Degradation vs un-upgraded API | 1 (optional buckets), 4 (source-less buckets), 8 (`/tags` 404 → local-only) |
| Non-goal: controls in the URL | not implemented, by design |

**Type consistency:** `CorpusFilter` is defined in `types.ts` (Task 3) and consumed by `corpusLogic.ts` (Task 4) and `CorpusControl` (Task 6). `filters.tags` (Task 2) is consumed by `TagChipInput` (Task 8) and `LibraryControls` (Task 9). `FacetPanel`'s `label: string` contract (`''` = unset) is honoured by `corpusLabel` returning `''` (Task 4) and by `language ?? ''` (Task 7). `searchTags` is `(q: string) => Promise<FacetBucket[]>` in api.ts (Task 1), libraryState (Task 9 Step 2) and TagChipInput's prop (Task 8) — same signature throughout.

**Ordering:** Phase A (1→2→3→4) is strictly sequential — 2 and 3 both edit `isAppliedFilterValue` and `toQuery`. Task 5 must precede 6-8 (they import `FacetPanel`). Task 9 requires 6, 7, 8. Task 10 is last.

**Known risk, flagged not hidden:** Task 9 Step 2 changes when facets are fetched. `/facets` is six aggregate queries over 100k documents (~250ms unnarrowed after the backend fix; the narrowed path is ~700ms because the tags join is genuinely required there). Refetching on every control change would be a visible stall — refetch **only** when the corpus source changes.
