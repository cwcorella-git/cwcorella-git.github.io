# Library toolbar: disambiguating six filters into four axes — design

**Date:** 2026-07-16 (revised 2026-07-17 against the real corpus)
**Status:** backend SHIPPED. Frontend design revised — **deferred until `sp2-triage-ui` merges**.
**Repos:** `cwcorella-git.github.io` (frontend) **and** `library-api` (backend) — two surfaces, one design

## Revision note (2026-07-17) — read this before the frontend plan

The backend half shipped (`library-api` `b1b87f4`, deployed). Doing so let us query the
**real corpus for the first time**. Three things the original design got wrong:

**1. The corpus cascade is worth much less than this document assumes.** Real distribution:

| source | docs | categories |
|---|---:|---:|
| youtube | 60,726 (60%) | **1** — literally named `transcript` |
| anarchist | 24,594 (24%) | 26 |
| marxist | 12,576 (13%) | 8 |
| user | 2,521 (2.5%) | **0** |

The nesting only pays off for anarchist + marxist — **37% of the corpus**. For the other
63% the cascade is a source list where two entries don't expand and a third expands to a
single meaningless bucket (`transcript` is a document type, not a category). The cascade is
still worth building — it kills the empty source×collection pairs and beats a flat 35-item
list mixing three sources — but it is **not** the centerpiece win this document sold.

**2. No duplicate collection names exist in the real data.** The `(source, name)` keying is
schema-correct (`collections.name` is UNIQUE, one row reachable from many sources) and the
test seed exercises it, but production has zero collisions today. The frontend guard
(`mergeCollectionBuckets`, `e11af06`) was therefore **defensive, not curative** — the
predicted `each_key_duplicate` break would not actually have fired. Keep the guard; the
reasoning holds for future data. But the "ship the frontend first" ordering it forced was
insurance, not a rescue.

**3. Facts that change other parts of the UI:**
- `visibility`: private 97,896 / public 2,521 — `public` is **exactly** the `user` count.
  Visibility is a near-perfect proxy for "is it mine", not an independent axis.
- `needs_formatting`: only **317 docs** (0.3%) need formatting. A filter for 0.3% of the
  corpus may not deserve equal billing with the rest of the State dropdown.
- `date_range`: **65,780 undated (65%)** — and 60,726 of those are youtube, which is
  *entirely* undated (`min_year: null`). Under `?source=youtube` the date rail collapses to
  a single "undated" anchor.
- `languages`: 33 languages, but `en` (88,506), `en-US` (1,218) and `en-GB` (854) are
  **separate buckets**. The language dropdown will show three Englishes. Worth normalizing
  upstream rather than papering over in the UI.

**4. Scope changed underneath this design.** `sp2-triage-ui` (unmerged, 8 commits) adds a
**7th** filter — `decision` (undecided/keep/hide/delete) — plus a curation `progress`
readout, both to `LibraryControls.svelte`. Absorbed below: `decision` becomes a third group
in the State dropdown rather than a seventh select. **Sequencing decision: SP2 merges
first, then the toolbar rewrite starts from that base.**

## Problem

`LibraryControls.svelte` renders **six `<select>` elements across two rows**,
five of which read "ALL —" at rest:

```
[search library…]              [TITLE ⌄] [↑] [VIEW: LIST]
[ALL LANGUAGES ⌄] [ALL COLLECTIONS ⌄] [ALL SOURCES ⌄]
[ALL TAGS ⌄]      [ALL VISIBILITY ⌄]  [ALL ⌄]
```

They are visually indistinguishable — same border, same uppercase 0.6rem type —
so the row reads as noise rather than as six distinct axes. `ALL TAGS` spans
~11rem; the trailing `ALL` (which is `needs_formatting`) has no label at all
explaining what it filters.

But the redundancy is **not only visual**. Three findings from the data model:

1. **`collection` is a child of `source`, not a sibling.** `library-api/backend/sources.py`
   shapes every non-user source as `collections=[row["category"]]` — a collection
   *is* that source's category column. The `user` source always sets `collections=[]`.
   Two dropdowns render one axis.
2. **The collections facet is computed globally.** `get_facets()`
   (`backend/api/query.py:352`) groups collections by name with no join to
   `documents`, so selecting **source: youtube** still lists every Anarchist
   Library and Marxists.org category. The current UI lets you construct
   source×collection pairs that **cannot match any document**.
3. **`visibility` and `needs_formatting` are not facets.** They are binary state
   flags (`visibility` is `private` for every row except user-library rows that
   were `is_public`; `needs_formatting` is 0/1). They occupy two full "ALL X"
   selects while being curation modes, not browse dimensions.

`source` is additionally a **fixed 4-value enum** (`user, anarchist, marxist,
youtube`) wearing the same chrome as a 200-item tag list.

## Goal

Collapse six controls into **four axes**, split across two zones by *purpose*:

- **Header zone = scope** ("what am I looking at"): corpus, language, state.
- **Toolbar zone = query** ("what am I asking of it"): search + tags, sort, view.

Governing rule, borrowed from veritablegames.com's library dropdowns:
**the active value is the label.** An unset control shows only its glyph; a set
control shows what it is set to. Nothing on screen ever reads "ALL —".

Result: **three scope controls + three query controls, one row each.**

## Prior art

veritablegames.com's library (`frontend/src/app/library/`) was the reference the
user cited as "doing a better job at minimizing this interface". What we take:

- Filters exiled to the **page header** beside the title, not in the toolbar.
- **Active value as trigger label** (`LibrarySourceDropdown` shows `Collections`
  at rest, `Anarchist Library` when set — no "All Collections" filler).
- **Search and tags share one chip-input field** (`LibraryTagSearchBar`).
- **Label collapses to icon at narrow widths** (`hidden sm:inline`).

What we explicitly **do not** take:

- Their sort-by *cycling icon button* — our sort has 4 options; cycling is slow.
- Their mobile bottom-sheet (the user already rejected this pattern in
  `2026-07-16-library-doc-info-toc-panel-design.md`).
- Their tri-state / hidden-affordance controls generally (see "Rejected" below).

## Design

### Zone 1 — header (scope)

`LIBRARY` stays left. A right-aligned cluster holds three controls:

| Control | At rest | When set |
|---|---|---|
| Corpus | `◈ Corpus` | `◈ Anarchist ▸ Egoism` |
| Language | `文` | `文 English` |
| State | `⚙ State` | `⚙ undecided · needs fmt` |

**Corpus** replaces both `source` and `collection`. Its panel groups categories
under their source, indented, with counts from the source-narrowed facet:

```
  ALL CORPORA              100,417
  ─────────────────────────────────
  ▾ Anarchist Library       62,104
      Egoism                 1,204
      Anarcho-syndicalism    3,881
  ▸ Marxists.org            31,880
  ▸ User Library             4,201     ← no categories; does not expand
  ▸ YouTube                  2,232
```

Selecting a source narrows the facet, so **the empty source×collection pairs
today's UI permits become unreachable**. `User Library` has `collections=[]` and
therefore never expands.

**Language** is a `文` glyph; the name appears only when the filter is doing work.

**State** merges `visibility`, `needs_formatting` **and `decision`** into one dropdown with
three independent groups, each an honest list of its states with counts. Real counts:

```
  VISIBILITY
    all                    100,417
    private                 97,896
    public                   2,521
  ─────────────────────────────────
  FORMATTING
    all                    100,417
    needs formatting           317
    clean                  100,100
  ─────────────────────────────────
  DECISION                          ← from SP2; supersedes its 7th "ALL DECISIONS" select
    all
    undecided
    keep
    hide
    delete
```

Visibility/formatting counts come from backend change 5 (shipped). Decision counts come from
SP1's existing `GET /curation/stats`, which SP2 already wires up — no new endpoint.

Note what the real numbers say about this control: `public` (2,521) is exactly the `user`
source count, so Visibility is nearly a restatement of Corpus; and Formatting isolates 317
documents out of 100k. **Decision is the group that actually earns its place** — it is the
axis being actively worked. If the State dropdown needs trimming, cut Visibility first.

### Zone 2 — toolbar (query)

```
[search library… + tag chips        (flex:1)]  [TITLE ⌄|↑]  [▤]
```

- **Search + tags share one field.** Typed text is full-text; committed chips are
  tag facets, **ANDed**. Backspace on an empty input removes the last chip; each
  chip has an `×`.
- **Tag panel** opens on focus. Empty query → top tags by count from the facet
  (zero network). Typing → filters those 200; past the cap it queries
  `GET /tags?q=` so the **~11,800-tag tail** (`query.py:332` documents ~12k
  distinct tags against a 200 facet limit) stays reachable.
- **Sort keeps its select**, joined with the `↑`/`↓` into one bordered capsule so
  it reads as one control. Deliberately minimal change — the sort control was not
  the problem.
- **View** becomes an icon toggle (`▤`/`▦`), reclaiming the width of `VIEW: LIST`.

**The curation progress readout** (SP2 puts it in `controls-row`) does not belong in the
toolbar: it is not a query control, it reports scope. Move it onto the `100,417 documents`
count line, which is already the place the page states what you are looking at.

### Narrow mode (< 480px)

Header keeps all three controls but drops to **glyphs only** (`◈`, `文`, `⚙`) —
the `hidden sm:inline` trick. A set control keeps its lit border, so you can tell
*something* is filtered even though you cannot read what. This is the correct
thing to sacrifice: the alternative at that width is wrapping the title onto its
own line.

The search field is already `flex: 1` and collapses; the sort capsule and view
icon hold their size.

## Backend changes (`library-api`)

Three changes, all backward-compatible.

### 1. Source attribution on the collections facet

`get_facets()` joins `document_collections → documents` so each bucket carries
its source:

```json
{"name": "Egoism", "source": "anarchist", "count": 1204}
```

Buckets are keyed on **`(source, name)`**, not `name` — a category name may in
principle appear under two sources. `name`/`count` are unchanged, so existing
readers do not break.

### 2. Facets narrow to the active source

`get_facets()` takes an optional `source` param that narrows the **collections**
and **tags** buckets. **Languages and sources stay global** — those are needed to
navigate back out of a narrowed view.

### 3. Multi-tag

`app.py:47`'s `tag: str | None` becomes `tags: list[str]` (repeated query param),
ANDed as one `IN` subquery per tag. **The param name stays `tag`** and accepts
repeats, so existing single-tag URLs keep working.

### 4. New: `GET /tags?q=`

Returns tags matching a prefix/substring, ordered by document count, limited.
Cheap against the `tags` table. Exists so the chip-input can reach the ~11.8k
tags the facet will never advertise.

### 5. Visibility + formatting facet buckets

`get_facets()` today returns only `languages`, `sources`, `collections`, `tags`,
`date_range` — there are **no counts for `visibility` or `needs_formatting`**.
The State dropdown shows per-state counts, so add two buckets:

```json
"visibility":       [{"name": "private", "count": 96216}, {"name": "public", "count": 4201}],
"needs_formatting": [{"name": "1", "count": 18904}, {"name": "0", "count": 81513}]
```

Two `GROUP BY`s over columns that are **already indexed** (`idx_docs_visibility`,
`idx_docs_needs_fmt`). Additive; the frontend types them as optional so an
un-upgraded API renders the dropdown without counts rather than breaking.

**Unchanged:** the 200-tag facet cap (`_TAGS_FACET_LIMIT`) stays — it keeps the
facets payload small, and `/tags?q=` covers the tail.

### Degradation against an un-upgraded API

`library-api` deploys separately, so the frontend can ship first. Every new field
is optional and has a defined fallback — the page must never blank out:

| Missing | Fallback |
|---|---|
| `source` on collection buckets | Corpus panel renders **flat** — sources listed, categories listed below under one "Categories" group, unnested. Functional, just not hierarchical. |
| `visibility` / `needs_formatting` buckets | State dropdown renders **without counts**. |
| `GET /tags?q=` returns 404 | Tag panel filters the top-200 facet client-side only; typing an off-list tag still commits as a chip (the `tag=` filter already accepts off-facet values — `query.py:335`). |
| Repeated `tag=` unsupported | Only the **first** chip filters server-side. Detected by feature-probing the facets payload shape, not by version string. |

**Ordering — this document originally said "ship `library-api` first". That was wrong**, and
the table above is why it looked right: it only covers *new frontend, old API*. The reverse
case — *old frontend, new API* — was missed. The deployed flat collections dropdown keys its
`{#each}` on `bucket.name`, and `(source, name)` buckets can repeat a name; duplicate keys
are a hard runtime error in Svelte 5. So the guard shipped first (`e11af06`), then the API
(`b1b87f4`). As it turned out the real corpus has no duplicate names, so the break would not
have fired — but the ordering was only knowable by checking, not by assuming.

The fallbacks exist for the window between deploys and for local dev against a stale API,
not as a permanent mode.

## Frontend state

`LibraryControls.filters` (`libraryLogic.ts`) changes shape:

```ts
filters: {
  corpus?: { source?: string; collection?: string };  // was: source + collection
  language?: string;
  tags?: string[];                                     // was: tag?: string
  visibility?: string;
  needs_formatting?: 0 | 1;
  decision?: Decision;                                 // from SP2 — see revision note
}
```

`computeQueryKey()` and `toQuery()` already iterate `Object.entries(c.filters)`
generically, so the churn is contained to those two functions plus serialization
of the two now-structured values.

`defaultControls()` stays all-empty — which is what makes the at-rest quiet fall
out for free rather than needing to be special-cased.

## Testing

Follows the existing pattern (`libraryLogic.test.ts`, `api.test.ts`,
`test_api_detail_facets.py`).

**Frontend (pure logic):**
- Facet buckets → nested source/category tree (including a source with zero
  categories, i.e. `user`).
- Multi-tag query serialization (0, 1, n tags).
- `computeQueryKey()` identity across the new `corpus`/`tags` shapes — this drives
  cache invalidation, so a key collision would serve stale windows.

**Backend:**
- `(source, name)` bucket keying, including the same category name under two sources.
- Source-narrowed facets: collections/tags narrow, languages/sources do not.
- `tag=` repeated → AND semantics; single `tag=` still works.
- `/tags?q=` ordering and limit.

**Component surface** (chip input, corpus panel, state panel): verified by
driving the real page, not brittle DOM tests.

## Non-goals

- **Controls in the URL.** Genuinely useful for sharing a filtered view, but
  nothing else on this site does it and it would roughly double the diff.
  Follow-up, not smuggled in.
- **`document_type` as a filter.** It exists in the schema and in `DocListItem`
  but has no filter today (every youtube row is `transcript`). Out of scope;
  the State dropdown is where it would land if wanted later.
- **Redesigning sort.** It works.

## Rejected alternatives

**Four-axis single row** (everything in one toolbar row, no header zone).
Rejected in favour of the two-zone split: separating *scope* from *query* is what
makes each zone legible, and cramming three more controls into the toolbar row
recreates the density problem at 760px.

**Search bar + one "Filters ③" button.** Most horizontal room and it would scale
if `document_type` were ever surfaced — but every filter costs a click and the
badge tells you *how many* filters are active, not *which*. Rejected: at-a-glance
scope is the whole point.

**Cycling glyph for the state flags** (click cycles all → private → public).
~60px narrower, but nothing on screen indicates a third state exists or that
clicking again escapes it, and it would make the header cluster behave two
different ways. Rejected in favour of the dropdown, which is consistent with
corpus and language and has room to show per-state counts (at the cost of backend
change 5 — not free, but cheap and worth it).

**Tags as chips-only, or as a browsable list only.** Chips alone lose discovery
(you must know the tag name); a list alone cannot reach the 12k tail past the
200-cap. The combined type-with-browsable-panel does both.

## Constraints

- `.inner` is `max-width: 760px` — the header row has ~700px for title + three
  controls. Three fully-set controls is the worst case and fits; this is why the
  State merge matters rather than being cosmetic.
- The library page is **admin-gated in full** (`+page.svelte:13` bounces
  non-admins). Unlike veritablegames.com, we cannot disambiguate by hiding
  controls behind a role — every user of this page is the admin. The cut must
  come from grouping and representation.
- `library-api` is a separate repo deployed independently on the workstation.
  The frontend must not hard-break against an un-upgraded API — every new field is
  optional with a defined fallback (see "Degradation against an un-upgraded API").
