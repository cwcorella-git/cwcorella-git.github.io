# Session — Library jump rail (2026-07-16)

## What shipped

A sort-aware **jump rail** on `/library`, replacing scroll-wait-scroll keyset paging
with one-click seeking to any point in the ordering.

- **title / author** sort → `# A B … Z` rail
- **publication_date** sort → `‹1800 · 1800s · … · 2020s · undated`
- **updated_at** sort → no rail (every doc shares the migration timestamp)

Live on `cwcorella.com/library` (admin-only surface; public pages unchanged).

## How it works

- **Backend** (`library-api`): `GET /documents?seek=<val>` adds one
  `WHERE <sortcol> >= ?` (asc) / `<= ?` (desc), applied **only on a first page**
  (continuation stays cursor-driven). Sentinel `seek=__undated__` jumps to the
  null-date block. `/facets` now returns `date_range {min_year, max_year, undated}`.
- **Frontend** (`cwcorella`): pure `railLogic.ts` builds the anchors per sort;
  `libraryState.seekTo()` resets the list to the seeked page and folds a seek
  counter into `queryKey` so the list scrolls to top on each jump; `JumpRail.svelte`
  renders the rail (vertical, → horizontal strip on mobile).

## Key decisions

- **Jump rail over offset windowing** — the user chose the lighter seek-anchor rail
  instead of a full random-access (offset) rewrite. Seek is column-agnostic
  (`WHERE col >= ?`), so the same mechanism serves alpha and date rails.
- **Buckets grounded in real data** — decades across 1800–2025 (99%+ of dated docs),
  a single `‹1800` for the sparse old tail, an `undated` anchor for the no-date block.
- **DB is read-only + rebuilt atomically**, so seek/offset row-shift concerns don't apply.

## Notable finding — parked

**65% of documents (65,780) have no `publication_date`.** The "ancient" religious /
Stoic texts are *undated*, not stored as BCE; the oldest values are metadata junk
(`0720` on a modern title; Farsi Solar-Hijri years mislabeled as ~1400). This is a
metadata-extraction gap in the migration — the dates likely exist *in* the texts but
weren't pulled. Deferred by the user ("get fundamentals down first"); its own future
task.

## Still open (unrelated)

- **In-browser admin publish is PAT-blocked** ("Invalid PAT") — this feature shipped
  via manual push rather than the admin UI. Needs a valid `repo`-scoped (or
  fine-grained Contents:RW) GitHub PAT in ⊙ settings to restore one-click saves.

## Artifacts

- Spec: `docs/superpowers/specs/2026-07-16-library-jump-rail-design.md`
- Plan: `docs/superpowers/plans/2026-07-16-library-jump-rail.md`
- Commits: backend `f3fe61f` `a1f6992` `b955093` · frontend `4e90865`→`37cebb0`
- Tests: 190 backend + 109 frontend green; production build clean

## To verify (admin session)

1. Title sort → click **M** → list jumps to titles ≥ M, scrolled to top.
2. Date sort → click a decade / **undated** → jumps there.
3. Updated sort → no rail.
