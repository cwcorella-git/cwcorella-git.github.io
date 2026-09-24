# §1f — the twelve still unruled

The 23 rows in [`books-library-match-review.md`](books-library-match-review.md)
§1f were never covered by a batch, because no batch fits them. Eleven have since
been ruled on:

- **Nine are restricted** and go to `/docs/private/*.enc` — readable in the
  reader once you authenticate, never public plaintext. Book ids
  22, 64, 212, 548, 684, 708, 778, 842, 891. Run
  [`bin/publish-restricted.sh`](../bin/publish-restricted.sh).
- **Two are Gandhi** and were cleared to `free-distribution` under the named
  group ruling (Key to Health, Third Class in Indian Railways).

Twelve are left. Every one of them has **NULL `source_url`, NULL date and NULL
`license`** in the corpus — the row itself answers nothing, which is why these
could not be batched. What is below was measured from the bodies, not inferred
from the metadata.

The `author` column is unreliable here and should not be read as a finding:
`_ Researchc` is a truncated domain, `Gnu Pro` is a truncated *project* name,
`Tim Whyte` wrote the foreword rather than the essay, and `Melissa Morrone` is a
real person's name attached to Jessica Moran's essay — the dangerous case,
because it is the right shape and simply wrong.

## Held, not to be ruled on yet

| doc | title | words | why |
|---|---|--:|---|
| 1658 | We Need People Power to Address a World in Peril | 8,147 | **OCR-broken.** Every `a` is dropped across the whole text — "Hrdy Merrimn", "publiction", "essy hs been slightly modied". Not a licence question; the text is damaged. Re-convert before ruling. |
| 1862 | To Spread the Revolution: Anarchist Archives and Libraries | 5,118 | Mis-attributed, and already in the peer's re-sourcing lane. Rule after it is re-sourced. |

## The scrapes — one question each, and it is answerable

These four carry their source in the body's first line, which is the only
provenance any of them has. The chrome-stripper now moves that line to a
`Source:` footer rather than deleting it, so the question stays askable after
export. Each needs one look at the named page's licence terms.

| doc | title | words | source | the question |
|---|---|--:|---|---|
| 160 | The Coal Strike of 1902: Turning Point in U.S. Policy | 6,250 | `dol.gov` | Jonathan Grossman wrote this for the **US Department of Labor**. A work of the federal government is not copyrightable (17 USC §105). This is the strongest clear on the page — confirm it is the DOL's own publication and not a reprint. |
| 811 | Pavia Doctoral Address | 2,132 | `gnu.org` | Stallman, on gnu.org/philosophy. Those pages carry an explicit licence footer, and the scrape dropped it. Read the live page's footer: if it is verbatim-redistribution or CC BY-ND, publishing it unmodified is in bounds. |
| 55 | "Just Get to Know Your Neighbors" | 3,118 | `southsideweekly.com` | A nonprofit local paper; Emeline Posner is credited. Check the site's republication terms — many such outlets grant them explicitly, and some require a form of attribution the footer already satisfies. |
| 1896 | Should College Be Free | 5,540 | `research.com` | A commercial content-marketing site. Absent an explicit grant this is **deny** — it is the one scrape where the default should be no. |

## The six with no provenance at all

No domain line, no frontmatter, no source URL, no date. The body is all there
is. These are the rows where a ruling is a judgement rather than a lookup, and
where "reference-only" is a real answer rather than a failure.

| doc | title | words | what the body shows |
|---|---|--:|---|
| 654 | The Gender Accelerationist Manifesto | 7,435 | Anonymous, self-published movement text. Circulated freely by intent; no rights holder to ask. |
| 2431 | The Weakness of a Politics of Protest | 6,027 | No author, no imprint. |
| 1494 | The Postmodern Left and the Success of Neoliberalism | 4,509 | No author, no imprint; essay-shaped. |
| 317 | On the Commons | 2,979 | No author. Title is generic enough that it is not identifiable from metadata. |
| 1842 | Drugs are fucking everywhere | 2,302 | Rob Wicks — the one plausible author name in this group. Blog-shaped. |
| 2112 | The Leftwing Deadbeat | 2,002 | No author, no imprint. |

## What I would do

1. **Clear 160** (federal, public domain) after confirming it is DOL-published.
2. **Look up 811 and 55**; both are likely clears and both are one page-load.
3. **Deny 1896** unless research.com grants republication in writing.
4. **Route the six unprovenanced to `.enc`**, the same lane as the restricted
   nine. Not because they are known restricted — because they are *unknown*, and
   NULL means deny until cleared. They stay fully readable to you; they simply
   do not get republished on a claim nobody can support.
5. **Re-convert 1658** and re-source 1862 before either is ruled on.

Step 4 is the one worth arguing with. The alternative is reference-only — no
body on the site at all — which is a worse outcome for you and no better for
anyone else, since `.enc` is not a republication.
