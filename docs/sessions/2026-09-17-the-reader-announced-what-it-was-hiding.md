# Session — The reader announced what it was hiding (2026-09-17)

Connecting `/library` full text to `/reading`. Two repos: this one and
`library-api` (workstation tree `/data/library-api`).

| # | item | state |
|---|---|---|
| 1 | Report-only matcher, books.json against the corpus | **done** — `c5d1b46` |
| 2 | Stop the reader revealing that a withheld body exists | **done** — `a4aa0ee` |
| 3 | Per-source licence policy + backfill (`documents.license`) | **done** — `d908fc2` (library-api) |
| 4 | Mark the 79 user-source published books private | **done** — `58aa851` (library-api) |
| 5 | Bake 125 freely-licensed texts into the reading list | **done** — `3fe2cc6` |
| 6 | Record invariants + funnel in CLAUDE.md / STATE.md | **done** — `a01c484`, `d337259` |
| 7 | Per-title licence calls for the 49 gated book-length works | **proposed** — needs author death dates + publisher, not word counts |
| 8 | Merge the duplicate `books.json` rows | **done** — `329049a`; **one** pair, not two |
| 9 | Push the site (production deploy) | **done** — `329049a` pushed, both deploy jobs green, live checked |

## 1. The reader announced what it was hiding

The brief was "connect Library to Reading". The thing worth fixing was already
on the page: `reading/+page.svelte` refused to open an admin-only book and
toasted **'no source available'**.

The corpus is private, and *whether a text is in it* is also private. A refusal
that only happens for books with a body is a membership oracle: click through
the list, note which ones bounce, and you have enumerated part of a private
100k-document collection without being admin.

Fixed by removing the refusal entirely. Every book opens; a withheld body and an
absent body both render the same link-out. The gate is `resolveBookDoc` in
`src/lib/bookDocLogic.ts`, pure and tested for the same reason `keyLogic.ts` is
— in the component it had no harness and the suite could not catch a
regression. The `links` result deliberately carries **no field** naming the
withheld document, so the two cases cannot drift into branches that render
differently. A test asserts the two results are `toEqual` and that the withheld
filename appears nowhere in the serialized output.

## 2. A column wired end-to-end that had never held a value

`documents.license` was NULL for all **100,417** rows. Not unused — wired
schema → `_DOC_COLS` → `loader.py:47` → `upsert_document`, and *exposed*:
`query.get_document` does `SELECT *` and returns the dict unfiltered, so
`GET /documents/{id}` has been shipping `license: null` since cutover.

The cause was not the one the docs implied. Every shaper but `shape_user_row`
hard-coded `license=None`, and `shape_user_row` read `row.get("license")` from a
query (`_QUERIES["user"]`) that never selects a `license` column. So the one
path that looked like it supplied a value also always produced `None`.

Backfilled 24,594 anarchist → `anti-copyright`, 12,576 marxist →
`free-distribution`. `user` and `youtube` stay NULL, which means *deny until
cleared*, not "no licence needed". `sources.py` now carries the policy too, so a
re-ingest does not re-NULL it.

**Ship-order did not bind here**, contrary to the repo's standing rule. That rule
exists because a new API can break the deployed page; `LibraryDoc` does not
declare `license` and nothing parses or validates the detail response, so
null→string is structurally harmless. Checked rather than assumed.

## 3. The blanket licence named real books

The operator chose a per-source blanket assertion (anarchist → anti-copyright)
over a per-text check, with the risk stated in advance. That was a reasonable
call on an abstract risk. The export dry-run turned it concrete: of 174 cleared
documents, **49 were book-length**, and the list included Zoe Baker's *Means and
Ends* (AK Press, 2023), Marshall's *Demanding the Impossible*, Bookchin's *The
Spanish Anarchists* and *The Third Revolution*, and *Anarchist Pedagogies*.

theanarchistlibrary hosts those. Hosting is not standing to relicense.

Stopped before `--confirm` and went back with the titles. Outcome: a
40,000-word gate, the same rule already chosen for the `user` source. Length is
a weak proxy for licence, but it is the one that correlates here — short-form
material on that site is overwhelmingly written for free circulation — and it
fails in the safe direction: a free book is withheld, never a restricted one
published.

The general caveat had already been recorded and was not enough. What changed
the decision was named titles.

## 4. Two guards that were not hypothetical

**A tie-break doing load-bearing work.** The matcher gave author agreement a
`+0.06` bonus. Clamping the score to 1.0 — which looked like tidying a cosmetic
`1.060` in the report — moved 96 matches from `anarchist` to `user`, routing the
same texts into the review queue for no reason. The bonus had been silently
breaking ties. Now it ranks unclamped, displays clamped, and breaks genuine ties
toward the freely-licensed copy. **The first figure I reported (165 publishable)
was wrong**; the corrected one is 178.

**One document, two books.** `The Third Revolution ... Volume 1` and `Volume 2`
both claimed document 286. An ordinal check (`vol|volume|part|book|no`) does not
catch it, because the *corpus* title carries no volume number — there is nothing
to conflict with. The dedupe-by-document guard catches it instead: any document
claimed by more than one book is dropped from the export. Attaching the wrong
text to a title is worse than attaching none. It also surfaced a genuine
duplicate row in `books.json` (item 8).

## 5. What I was told, and what I repeated, that was wrong

- **The explore agent flagged `sources.py` hard-coding `visibility="private"` as
  possibly-stale documentation, and I carried that into the plan as a doc fix
  owed.** It is not stale: `docs/STATE.md:21` already describes it as a past
  defect and says "Both are fixed." No edit was needed. A subagent's "may
  describe an earlier version" is a lead, not a finding, and I promoted it to a
  plan item without checking.
- **I told the operator the `license` column was "entirely unused".** It is
  exposed through the detail endpoint. Wrong in a way that would have mattered
  if the frontend had validated responses.
- **I wrote "2 pairs of duplicate `books.json` rows" into this document.** There
  was one — David Holmgren's *Permaculture* entered twice as 470 and 472. The
  other three contested groups are distinct books that share a title: *Anarchism
  in the United States* (Madison 1945 vs Creagh/Kuhn/Cohn 2009), *Anarchism: A
  Very Short Introduction* (Prichard vs Ward), and the two Bookchin volumes. I
  counted collisions and called them duplicates without opening the rows.

## The funnel, as measured

263 of 903 books have a body (225 exact title matches).

**263 matched → 178 licence-cleared → 174 unambiguous → 125 written.**

Held: 85 on licence (user/youtube — scraped third-party material), 49 over the
40k gate, 8 rows where one document was claimed by two books.

Corpus visibility moved 97,896/2,521 → **97,975/2,442** private/public: exactly
the 79 rows, no collateral.

## Open

**Status: DEPLOYED. Verified over HTTP, never seen on a screen.**

Pushed `2e13cc6..329049a` on operator instruction. Both Actions jobs green
(Cloudflare Pages + GitHub Pages). Checked against the live site, not the
runner's exit code:

- `/docs/public/2-a-brief-critique-of-anarcho-syndicalism.md` → 200, correct
  front matter. The baked texts are being served.
- The string `no source available` appears nowhere in the built bundle, and
  `no document attached` is gone from the served page. The leak is off production.
- One Holmgren row on the live reading list, not two.

**The database changes were already live** — the licence backfill and the 79-row
visibility flip went straight to production `library.db` before any of this. The
two halves are now in step.

- **Still never verified by eye.** I did not open the site in a browser at any point.
  The link-out empty state, the 125 baked documents rendering in `BookView`, and
  the admin-vs-visitor difference have been verified **only** by unit test, type
  check, and a clean production build. 248 frontend + 429 backend tests green,
  299 files 0 errors, `build/docs/public` has 129 files. None of that is a
  screen. Per this repo's standing caution, a passing suite over a path nobody
  has looked at is exactly the shape of the two bugs that survived mocked
  verification before.
- `library-api` was **not restarted**. It did not need to be — `sources.py` is
  ingest-only and the API reads `library.db` at query time — but the running
  process holds the pre-change module.
- Item 7 is unstarted by decision: the operator chose to leave the 49
  book-length works held. The 40k gate stands and 125 texts is the answer.

## Artifacts

- Frontend: `c5d1b46` `a4aa0ee` `3fe2cc6` `a01c484` `55be72a` `329049a` — **pushed**
- library-api: `d908fc2` `58aa851` `d337259` (3 ahead — **not pushed**)
- Reversal snapshot: `/data/backups/user-books-visibility-2026-09-17.jsonl.gz`
- Provenance: `library-api/scripts/data/reading-list-user-books.ids` (79 ids)
- Plan: `~/.claude/plans/spicy-twirling-wave.md`
- Canonical: invariants folded into `CLAUDE.md`; numbers into `docs/STATE.md`

## To verify (admin session, in a browser)

1. Logged out, open a book with a baked doc → full text renders.
2. Logged out, open a book whose body is withheld → link-out, and it must be
   **indistinguishable** from a book that has no body at all.
3. As admin, same withheld book → the body renders.
4. Confirm no book refuses to open.
