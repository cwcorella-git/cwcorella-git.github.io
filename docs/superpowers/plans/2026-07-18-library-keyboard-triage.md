# Library Keyboard Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the single curator triage the ~100k-document library from the keyboard alone — arrows navigate, `Delete`/`K`/`H` decide and auto-advance — without ever reaching for the mouse.

**Architecture:** A pure key→action mapping in `src/lib/library/keyLogic.ts` (no DOM, fully unit-testable), dispatched by the existing `handleKeydown` in `DocReader.svelte`. No changes to `libraryState`'s navigation or decision methods — `openPrevDoc()`, `openNextDoc()`, and `setDecision()` already do exactly what is needed. One separate correctness fix: `setDecision` failures must stop tripping page-level error state.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-18-library-keyboard-triage-design.md`

## Global Constraints

- Svelte 5 runes only (`$state`, `$derived`, `$effect`) — no Svelte 4 reactivity.
- **No UI hints, legends, tooltips, or shortcut affordances anywhere.** There is one curator and `/library` is admin-gated in full.
- Never bind `↑`/`↓`/`PgUp`/`PgDn` — they must remain document-body scrolling.
- `Backspace` is deliberately not bound. Only `Delete`.
- Letter keys are case-insensitive.
- Events carrying `ctrlKey`/`metaKey`/`altKey` pass through untouched.
- User-facing feedback goes through `toast` from `$lib/admin/toast.svelte`. No `window.alert`/`window.prompt`.
- Existing test convention: pure logic in `src/lib/library/*Logic.ts`, colocated `*.test.ts`, `import { describe, it, expect } from 'vitest'`.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/lib/library/keyLogic.ts` | Create | Pure key→action mapping + text-target detection |
| `src/lib/library/keyLogic.test.ts` | Create | Unit tests for the mapping |
| `src/lib/components/library/DocReader.svelte` | Modify (`~17`, `~157`) | Dispatch resolved actions |
| `src/lib/library/libraryState.svelte.ts` | Modify (`~311`) | `setDecision` failure → toast, not `_status` |
| `src/lib/library/libraryState.test.ts` | Create | Regression: failed write leaves status intact |

---

### Task 1: Pure key→action mapping

**Files:**
- Create: `src/lib/library/keyLogic.ts`
- Test: `src/lib/library/keyLogic.test.ts`

**Interfaces:**
- Consumes: `Decision` from `./types` (`'keep' | 'hide' | 'delete'`).
- Produces:
  - `type TriageAction = { kind: 'nav'; dir: 'prev' | 'next' } | { kind: 'decide'; decision: Decision } | { kind: 'close' }`
  - `interface KeyEventLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }`
  - `interface KeyContext { editMode: boolean; isTextTarget: boolean }`
  - `resolveKey(e: KeyEventLike, ctx: KeyContext): TriageAction | null`
  - `isTextTarget(target: unknown): boolean`

**Ordering rule that matters:** `Escape` resolves *before* the `editMode`/`isTextTarget` guards, because `Escape` must keep working while editing (it cancels the edit) and while focused in the tag input. Every other key resolves *after* the guards.

- [ ] **Step 1: Write the failing test**

Create `src/lib/library/keyLogic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveKey, isTextTarget } from './keyLogic';

const ctx = (over: Partial<{ editMode: boolean; isTextTarget: boolean }> = {}) => ({
	editMode: false,
	isTextTarget: false,
	...over
});

describe('resolveKey — navigation', () => {
	it('maps ArrowRight to next', () => {
		expect(resolveKey({ key: 'ArrowRight' }, ctx())).toEqual({ kind: 'nav', dir: 'next' });
	});
	it('maps ArrowLeft to prev', () => {
		expect(resolveKey({ key: 'ArrowLeft' }, ctx())).toEqual({ kind: 'nav', dir: 'prev' });
	});
	it('leaves vertical scrolling keys unbound', () => {
		for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
			expect(resolveKey({ key }, ctx())).toBeNull();
		}
	});
});

describe('resolveKey — decisions', () => {
	it('maps Delete to the delete decision', () => {
		expect(resolveKey({ key: 'Delete' }, ctx())).toEqual({ kind: 'decide', decision: 'delete' });
	});
	it('maps k and K to keep', () => {
		expect(resolveKey({ key: 'k' }, ctx())).toEqual({ kind: 'decide', decision: 'keep' });
		expect(resolveKey({ key: 'K' }, ctx())).toEqual({ kind: 'decide', decision: 'keep' });
	});
	it('maps h and H to hide', () => {
		expect(resolveKey({ key: 'h' }, ctx())).toEqual({ kind: 'decide', decision: 'hide' });
		expect(resolveKey({ key: 'H' }, ctx())).toEqual({ kind: 'decide', decision: 'hide' });
	});
	it('does not bind Backspace', () => {
		expect(resolveKey({ key: 'Backspace' }, ctx())).toBeNull();
	});
});

describe('resolveKey — guards', () => {
	it('returns null for every bound key while editing', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Delete', 'k', 'h']) {
			expect(resolveKey({ key }, ctx({ editMode: true }))).toBeNull();
		}
	});
	it('returns null for every bound key while focused in a text field', () => {
		for (const key of ['ArrowLeft', 'ArrowRight', 'Delete', 'k', 'h']) {
			expect(resolveKey({ key }, ctx({ isTextTarget: true }))).toBeNull();
		}
	});
	it('passes modifier-bearing events through', () => {
		expect(resolveKey({ key: 'k', ctrlKey: true }, ctx())).toBeNull();
		expect(resolveKey({ key: 'ArrowRight', metaKey: true }, ctx())).toBeNull();
		expect(resolveKey({ key: 'Delete', altKey: true }, ctx())).toBeNull();
	});
	it('returns null for unbound keys', () => {
		expect(resolveKey({ key: 'q' }, ctx())).toBeNull();
		expect(resolveKey({ key: 'Enter' }, ctx())).toBeNull();
	});
});

describe('resolveKey — Escape survives the guards', () => {
	it('closes from the plain reader', () => {
		expect(resolveKey({ key: 'Escape' }, ctx())).toEqual({ kind: 'close' });
	});
	it('still resolves while editing', () => {
		expect(resolveKey({ key: 'Escape' }, ctx({ editMode: true }))).toEqual({ kind: 'close' });
	});
	it('still resolves from inside a text field', () => {
		expect(resolveKey({ key: 'Escape' }, ctx({ isTextTarget: true }))).toEqual({ kind: 'close' });
	});
	it('is inert with a modifier', () => {
		expect(resolveKey({ key: 'Escape', ctrlKey: true }, ctx())).toBeNull();
	});
});

describe('isTextTarget', () => {
	it('detects inputs and textareas', () => {
		expect(isTextTarget({ tagName: 'INPUT' })).toBe(true);
		expect(isTextTarget({ tagName: 'TEXTAREA' })).toBe(true);
	});
	it('detects contenteditable', () => {
		expect(isTextTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
	});
	it('is false for ordinary elements and null', () => {
		expect(isTextTarget({ tagName: 'DIV' })).toBe(false);
		expect(isTextTarget({ tagName: 'BUTTON' })).toBe(false);
		expect(isTextTarget(null)).toBe(false);
		expect(isTextTarget(undefined)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/library/keyLogic.test.ts
```

Expected: FAIL — `Failed to resolve import "./keyLogic"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/library/keyLogic.ts`:

```ts
import type { Decision } from './types';

/**
 * What a keypress means in the reader. Decisions always auto-advance — that is
 * the point of the feature, so it is not a separate flag the caller can forget.
 */
export type TriageAction =
	| { kind: 'nav'; dir: 'prev' | 'next' }
	| { kind: 'decide'; decision: Decision }
	| { kind: 'close' };

/** Structural subset of KeyboardEvent, so the mapping is testable without a DOM. */
export interface KeyEventLike {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
}

export interface KeyContext {
	editMode: boolean;
	isTextTarget: boolean;
}

const DECISION_KEYS: Record<string, Decision> = {
	delete: 'delete',
	k: 'keep',
	h: 'hide'
};

/**
 * True when focus is somewhere text is being typed. Without this, typing "keep"
 * into the tag editor would curate three documents.
 */
export function isTextTarget(target: unknown): boolean {
	if (!target || typeof target !== 'object') return false;
	const el = target as { tagName?: unknown; isContentEditable?: unknown };
	if (el.isContentEditable === true) return true;
	const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function resolveKey(e: KeyEventLike, ctx: KeyContext): TriageAction | null {
	// Modifier combinations belong to the browser and the OS.
	if (e.ctrlKey || e.metaKey || e.altKey) return null;

	// Escape resolves BEFORE the guards: it must still cancel an edit and must
	// still work when focus sits in the tag input. Everything else resolves after.
	if (e.key === 'Escape') return { kind: 'close' };

	if (ctx.editMode || ctx.isTextTarget) return null;

	if (e.key === 'ArrowLeft') return { kind: 'nav', dir: 'prev' };
	if (e.key === 'ArrowRight') return { kind: 'nav', dir: 'next' };

	// Vertical keys are deliberately absent — they scroll the document body,
	// which is how documents get judged in the first place.

	const decision = DECISION_KEYS[e.key.toLowerCase()];
	if (decision) return { kind: 'decide', decision };

	return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/library/keyLogic.test.ts
```

Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/library/keyLogic.ts src/lib/library/keyLogic.test.ts
git commit -m "feat(library): pure key->action mapping for reader triage"
```

---

### Task 2: Dispatch the actions in DocReader

**Files:**
- Modify: `src/lib/components/library/DocReader.svelte` (imports at `~1-9`, `handleKeydown` at `~17-24`)

**Interfaces:**
- Consumes: `resolveKey`, `isTextTarget`, `TriageAction` from Task 1's `$lib/library/keyLogic`.
- Consumes (already present in `libraryState`): `openDoc`, `editMode`, `cancelEdit()`, `openPrevDoc()`, `openNextDoc()`, `setDecision(d: Decision)`.
- Produces: nothing consumed by later tasks.

**Two hazards this task must handle:**

1. **`<svelte:window onkeydown>` is outside the `{#if}` block** (line ~157), so it listens whenever the library page is mounted, not just when the reader is open. Today that is harmless because only `Escape` is bound and `closeDoc()` on nothing is a no-op. Once `Delete`/`K`/`H` are bound, an unguarded handler would curate documents while the user is browsing the list. The handler must return early unless a document is actually open.
2. **Advance must not await the write.** `setDecision` is optimistic — the open doc and row cache update synchronously — so calling `openNextDoc()` immediately is what makes triage feel instant. `openDocById` is guarded by `_docEpoch`, so a held-down key cannot land a stale document on screen.

- [ ] **Step 1: Add the import**

In `src/lib/components/library/DocReader.svelte`, alongside the existing imports at the top of the `<script lang="ts">` block, add:

```ts
	import { resolveKey, isTextTarget } from '$lib/library/keyLogic';
```

- [ ] **Step 2: Replace `handleKeydown`**

Replace this existing function:

```ts
	function handleKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape') return;
		if (libraryState.editMode) {
			libraryState.cancelEdit();
		} else {
			close();
		}
	}
```

with:

```ts
	function handleKeydown(e: KeyboardEvent) {
		// svelte:window listens for the whole page, not just the overlay — without
		// this guard, Delete/K/H would curate documents while browsing the list.
		if (libraryState.openDoc === null) return;

		const action = resolveKey(e, {
			editMode: libraryState.editMode,
			isTextTarget: isTextTarget(e.target)
		});
		if (!action) return;

		if (action.kind === 'close') {
			if (libraryState.editMode) {
				libraryState.cancelEdit();
			} else {
				close();
			}
			return;
		}

		e.preventDefault();

		if (action.kind === 'nav') {
			if (action.dir === 'prev') void libraryState.openPrevDoc();
			else void libraryState.openNextDoc();
			return;
		}

		// Decide and advance. Deliberately NOT awaited: the write is optimistic, so
		// advancing immediately is what makes one-keystroke triage feel instant.
		void libraryState.setDecision(action.decision);
		void libraryState.openNextDoc();
	}
```

- [ ] **Step 3: Verify the whole suite and the type-check still pass**

```bash
npx vitest run && npm run check
```

Expected: all tests PASS; `npm run check` reports 0 errors.

- [ ] **Step 4: Confirm nothing was added to the UI**

```bash
git diff src/lib/components/library/DocReader.svelte | grep -c '^+.*<'
```

Expected: `0` — this task changes only the `<script>` block. Any added markup means a shortcut hint crept in, which the Global Constraints forbid.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/library/DocReader.svelte
git commit -m "feat(library): keyboard triage in the reader (arrows, Delete/K/H)"
```

---

### Task 3: A failed curation write must not tear down the page

**Files:**
- Modify: `src/lib/library/libraryState.svelte.ts` (import block `~1-30`, `setDecision` catch at `~307-319`)
- Test: `src/lib/library/libraryState.test.ts` (create)

**Interfaces:**
- Consumes: `toast` from `$lib/admin/toast.svelte`.
- Produces: nothing consumed by later tasks.

**Why:** `setDecision`'s catch calls `_mapError(e)`, which sets the page-level `_status`. The library controls are gated behind `status === 'ready'`, so one failed write unmounts the whole UI mid-triage — the same failure fixed for `saveEdit` in commit `2889d58`. At mouse speed this is rare; at keyboard speed, with every write crossing the Cloudflare tunnel, it becomes likely.

**Note on the test:** no existing test imports `libraryState`, and there is no `vi.mock` usage anywhere in the subsystem — every library test to date is pure-logic. This task therefore stands up the first mocking harness for it. That is the intended cost; the regression is worth a real test.

- [ ] **Step 1: Write the failing test**

Create `src/lib/library/libraryState.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setCuration = vi.fn();
const getDocument = vi.fn();
const getCurationStats = vi.fn();
const toastError = vi.fn();

vi.mock('$env/dynamic/public', () => ({ env: {} }));
vi.mock('$lib/admin/state.svelte', () => ({
	adminState: { libraryToken: 'test-token' }
}));
vi.mock('$lib/admin/toast.svelte', () => ({
	toast: { error: toastError, success: vi.fn() }
}));
vi.mock('./api', async () => {
	const actual = await vi.importActual<typeof import('./api')>('./api');
	return {
		...actual,
		// Full client surface as of 2026-07-18 — a missing method would surface as an
		// unrelated TypeError rather than the assertion the test is actually making.
		createLibraryClient: () => ({
			setCuration,
			getDocument,
			getCurationStats,
			listDocuments: vi.fn(),
			getFacets: vi.fn(),
			getAnchorOffset: vi.fn(),
			saveBody: vi.fn(),
			getVersions: vi.fn(),
			revertDoc: vi.fn()
		})
	};
});

const doc = {
	id: 1,
	title: 'A document',
	body: 'body text',
	tags: [],
	decision: null,
	source: 'user',
	visibility: 'public'
};

describe('setDecision failure handling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getDocument.mockResolvedValue(doc);
		getCurationStats.mockResolvedValue(null);
	});

	it('does not put the page into an error state when the write fails', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);
		const statusBefore = libraryState.status;

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(libraryState.status).toBe(statusBefore);
		expect(libraryState.status).not.toBe('error');
	});

	it('reports the failure as a toast', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(toastError).toHaveBeenCalled();
	});

	it('rolls the open doc back to its previous decision', async () => {
		const { libraryState } = await import('./libraryState.svelte');
		await libraryState.openDocById(1);

		setCuration.mockRejectedValue(new Error('tunnel hiccup'));
		await libraryState.setDecision('delete');

		expect(libraryState.openDoc?.decision).toBe(null);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/library/libraryState.test.ts
```

Expected: FAIL — the first test reports `expected 'error' to be 'idle'`, and the second reports `toastError` was never called. (The third should already pass; the rollback is existing correct behavior and this test pins it.)

- [ ] **Step 3: Add the toast import**

In `src/lib/library/libraryState.svelte.ts`, alongside the existing imports at the top:

```ts
import { toast } from '$lib/admin/toast.svelte';
```

- [ ] **Step 4: Change the `setDecision` catch block**

In `setDecision`, replace the final line of the catch block:

```ts
			_mapError(e);
```

with:

```ts
			// Deliberately NOT _mapError: that sets the page-level _status, and the
			// controls are gated behind status === 'ready', so one failed write would
			// unmount the entire UI mid-triage. Same failure class as saveEdit (2889d58).
			toast.error('could not save decision');
```

Leave the optimistic rollback of `_openDoc` and `_rowCache` above it untouched — that behavior is correct.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run src/lib/library/libraryState.test.ts
```

Expected: PASS, all three tests green.

- [ ] **Step 6: Confirm `_mapError` is still used elsewhere**

```bash
grep -c '_mapError(e)' src/lib/library/libraryState.svelte.ts
```

Expected: a non-zero count. Only `setDecision`'s call site changes — the window-fetch and facet paths keep their page-level error handling.

- [ ] **Step 7: Run the full suite and type-check**

```bash
npx vitest run && npm run check
```

Expected: all tests PASS; `npm run check` reports 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/library/libraryState.svelte.ts src/lib/library/libraryState.test.ts
git commit -m "fix(library): failed curation write toasts instead of tripping page error state"
```

---

## Verification

There is no end-to-end check for this feature, deliberately. The live API CORS-blocks `localhost`, so a browser run would exercise mocks — and mocks resolve instantly, which makes them worthless for the rapid-fire path this feature creates. Coverage is the unit tests above plus the epoch-guard reasoning recorded in the spec.

Manual confirmation happens after deploy, in the real reader against the real corpus.

## Deploy note

This is frontend-only — no `library-api` change is required, so the usual
"ship the frontend first" ordering constraint does not come into play here.
