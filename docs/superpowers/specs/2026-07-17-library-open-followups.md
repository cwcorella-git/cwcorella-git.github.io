# Library — open follow-ups

**Date:** 2026-07-17
**Status:** open; none blocking
**Why this file exists:** these surfaced during the toolbar work but were out of its
scope. They were recorded in `.superpowers/sdd/progress.md`, which is **gitignored
scratch** — `git clean -fdx` destroys it. Anything that must outlive the session lives
here instead.

---

## 1. `JumpRail` overflows the viewport at 400px

**Severity:** minor — cosmetic, admin-only page.
**Pre-existing.** Not introduced by the toolbar work; found while verifying narrow mode.

At 400px the page scrolls horizontally by ~28px. `JumpRail.svelte`'s narrow-mode `.rail`
switches to `flex-direction: row; overflow-x: auto`, but the base rule keeps
`flex-shrink: 0` and its container row in `DocList.svelte` has no `min-width: 0`. A
`flex-shrink: 0` item sized by its (wide) content forces its flex container — and so the
page — wider than the viewport, even though the item's own `overflow-x: auto` would
otherwise contain it.

**Fix shape:** `min-width: 0` on the containing flex row in `DocList.svelte`, so the rail
is allowed to shrink and scroll within itself. Verify at 400px that
`document.documentElement.scrollWidth === clientWidth`.

---

## 2. `en` / `en-US` / `en-GB` are three separate language buckets

**Severity:** minor — a data-quality issue surfacing as UI noise.

The language dropdown lists 33 languages, three of which are English: `en` (88,506),
`en-US` (1,218), `en-GB` (854). They are distinct facet buckets, so they filter to
disjoint sets.

**Deliberately not fixed in the UI.** Merging them at display time would make the count
lie about what clicking actually filters to. If this is worth fixing, normalise
**upstream** — either at ingest in `library-api`'s `sources.py`, or as a one-off migration
folding `en-*` into `en`. That is a corpus decision, not a toolbar one.

---

## 3. The corpus cascade earns less than its design assumed

**Severity:** informational — a design-value note, not a defect.

Recorded here because it is easy to forget and would otherwise justify further investment
in the cascade. Measured 2026-07-17:

| source | docs | categories |
|---|---:|---:|
| youtube | 60,726 (60%) | 1 — named `transcript` |
| anarchist | 24,594 | 26 |
| marxist | 12,576 | 8 |
| user | 2,521 | 0 |

Nesting only pays off for anarchist + marxist — **37% of the corpus**. For the rest it is a
source list where one entry does not expand and another expands to a single meaningless
bucket (`transcript` is a document type, not a category). The cascade still earns its place:
it makes the zero-result source×collection pairs unreachable and beats a flat 35-item list
mixing three sources. But it is not the centrepiece the original design claimed.

**If youtube ever gets real categories, revisit.** Until then, do not invest further in
cascade affordances.

---

## 4. `visibility` is nearly a restatement of `source`

**Severity:** informational.

`public` = 2,521, which is **exactly** the `user` source count — because `sources.py` marks
only user-library rows public. So the State dropdown's Visibility group is close to asking
"is this the user corpus?", which Corpus already answers. `needs_formatting` isolates 317
documents (0.3%).

Of the three State groups, **`decision` is the one that earns its place** — it is the axis
being actively worked. If State ever needs trimming, cut Visibility first.

---

## Closed during this work — recorded so it is not re-reported

- **`/anchor-offset` did not accept `decision`** while `/documents` did, so filtering by
  curation decision silently desynced the jump rail from the list. Found by the backend's
  whole-branch review, **fixed in `library-api` `91efad7`** (SP2 backend).
- **`mergeCollectionBuckets`** (frontend `e11af06`) guarded the flat collections dropdown
  against duplicate `{#each}` keys when facet buckets became `(source, name)`-keyed. That
  dropdown no longer exists and the cascade keys within a source, so the collision is
  structurally unreachable. **Deleted.** It was always interim; its own comment said so.
