# Library keyboard triage — design

**Date:** 2026-07-18
**Status:** approved, not yet implemented
**Scope:** `/library` reader overlay only

## Problem

Curating ~100k documents requires a mouse click per decision, on buttons in the
reader's decision bar. At corpus scale the reach for the mouse is the dominant
cost of triage, not the reading.

The navigation and decision machinery already exists — `libraryState.openPrevDoc()`,
`openNextDoc()`, and `setDecision()` are implemented and correct. They are simply
unreachable from the keyboard. This is a keybinding layer, not new capability.

## Keymap

Active only while the reader overlay is open, and only when not editing.
Letter keys are case-insensitive (`k` and `K` both mark keep). `Backspace` is
deliberately **not** bound — only `Delete`.

| Key | Action |
|---|---|
| `→` | next doc |
| `←` | previous doc |
| `Delete` | mark `delete`, then advance |
| `K` | mark `keep`, then advance |
| `H` | mark `hide`, then advance |
| `Esc` | close reader (existing behavior, unchanged) |

### Decisions auto-advance

Marking a decision immediately advances to the next document. This is the point of
the feature: one keystroke per document rather than two. The second keystroke is
the entire cost at this corpus size.

### Undo is `←` plus the same key

`setDecision` already has toggle semantics — applying the current decision again
clears it to undecided. Combined with `←`, that is the undo path, and it needs no
new code. Navigate back, press the same key, the decision clears.

### Left/right only, never up/down

`↑`/`↓`/`PgUp`/`PgDn` must remain bound to scrolling the document body. Documents
are judged by reading them, so vertical scrolling is load-bearing; binding those
keys to navigation would make long documents unreadable.

### No UI hints

No legend, tooltip, or shortcut hint anywhere. There is exactly one curator and
the surface is admin-gated in full.

## Guards

The handler must produce no action when:

- `libraryState.editMode` is true, or
- the event target is an `input`, `textarea`, or `contenteditable` element.

Without this, typing the word "keep" into `TagEditor` curates three documents.

The handler must also ignore events carrying `ctrl`/`meta`/`alt` modifiers, so
browser and OS shortcuts pass through untouched.

## Structure

**New file:** `src/lib/library/keyLogic.ts` — a pure function mapping a keyboard
event (plus `{ editMode }`) to an action descriptor or `null`. This follows the
`*Logic.ts` + colocated `*.test.ts` convention used throughout the subsystem, and
keeps the mapping unit-testable without a DOM.

**Modified:** `src/lib/components/library/DocReader.svelte` — its existing
`handleKeydown` (currently `Escape`-only) dispatches whatever `keyLogic` returns.

**Unchanged:** `libraryState`'s navigation and decision methods. They already do
exactly what is needed.

### Advance does not await the write

Auto-advance calls `openNextDoc()` without awaiting `setDecision()`. The decision
write is already optimistic — the open doc and the row cache update synchronously —
so advancing immediately is what makes the interaction feel instantaneous.

Held-down keys are safe: `openDocById` is guarded by `_docEpoch`, so a slow
in-flight load whose epoch has been superseded discards its result rather than
landing a stale document on screen.

## Required fix: decision failures must not tear down the page

`setDecision`'s catch block calls `_mapError(e)`, which sets the **page-level**
`_status`. The library controls are gated behind `status === 'ready'`, so a single
failed curation write unmounts the entire UI mid-triage. This is the same failure
class fixed for `saveEdit` in commit `2889d58`.

Today it is rare, because writes happen at mouse speed. Under keyboard triage,
writes are an order of magnitude more frequent and every one is a tunnel
round-trip, so the failure becomes likely rather than theoretical.

**Change:** a failed `setCuration` surfaces as a toast. It must not touch
`_status`. The existing optimistic rollback of the open doc and row cache is
correct and stays as-is.

## Testing

Vitest, against `keyLogic` and `libraryState`:

- each bound key maps to its action; decision keys are marked as advancing
- `editMode: true` yields `null` for every key
- events targeting `input` / `textarea` / `contenteditable` yield `null`
- modifier-bearing events yield `null`
- unbound keys yield `null`
- `Escape` continues to resolve to close/cancel-edit as it does today
- regression: a rejected `setCuration` leaves `status === 'ready'`

### Why no end-to-end verification

The live API CORS-blocks `localhost`, so browser verification would run against
mocks — and mocks resolve instantly. The rapid-fire path is precisely where
mocked timing is meaningless: it cannot falsify a claim about a slow or failing
write. The epoch-guard and failure paths are covered by reasoning and unit tests
instead. See `memory/library-design-lessons.md`.

## Out of scope

- **List-level triage.** Deciding from `DocList` without opening a document would
  need a new row-focus concept, scroll-into-view handling, and coexistence with
  `JumpRail`'s offset math. It is a separate feature, and the corpus mostly
  requires reading the body to judge a document.
- **Any change to filtering, the rail, or `filtersToParams()`.**
