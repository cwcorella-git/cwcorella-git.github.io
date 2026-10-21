# Visual refresh brief (2026-10-21)

Answers open item O2 in `2026-10-11-library-visual-rulings.md`. Written with the
`frontend-design` skill. This is a brief for renders. Nothing here is decided until the
operator picks a direction.

## Subject, audience, job

- **Subject.** One person's radical reading room: 902 books, pamphlets and articles,
  mostly anarchist, communist and ecological texts, many of them sourced from the
  Anarchist Library, marxists.org and infoshop distros. There are also encrypted journals,
  bookmarks, and a time capsule sealed until 2095-02-13.
- **Audience.** Visitors who follow a link to the reading list, and the owner, who uses
  every page daily as admin.
- **Primary job.** Let people browse and open the reading list. Everything else is
  secondary.

## What reads as generated today

- Glass panels with blur over a full-page gradient (Sky.svelte). This is the main tell.
- One rounded radius on the pills, the boxed search fields and the panels, whatever their
  rank.
- Monospace (`CWC-UI`, a Courier fallback) for all UI labels.
- Eight palettes. Because a visitor can pick any of them, no single one is the site's look.

## Constraints carried forward

- R1: no VG chrome. R7: no mixed themes; the reader body follows the page.
- R8: `ink` stays, as a separate mode for checking formatting the way VG shows it. It is
  not counted as part of the identity.
- Kalinga stays the prose face (VG parity, R2/R5).
- Static, decentralizable, no new runtime dependencies. Fonts are self-hosted.

## Directions to render

Each direction is rendered on the home page, on the reading list, and at 390px phone
width.

### A. Card catalogue

The reading list is shown as a library card catalogue. Each entry is a catalogue card:
title, author, year, a category in the call-number position, and source links as the
holdings line. A stamp marks the time capsule: `DUE 13 FEB 2095`.

| Token | Hex | Role |
|---|---|---|
| card | `#EDE4C8` | Card stock, the card surface only |
| drawer | `#5B3A24` | Oak, the page ground |
| ribbon | `#1E2B45` | Typewriter ribbon, the text |
| stamp | `#B3261E` | Rubber stamp, used only for dates and the capsule |
| rule | `#9DB4C0` | The blue ruled line on the cards |

- **Type.** Kalinga for prose. Card fields are set in a typewriter face (Courier Prime,
  self-hosted). That is a deliberate exception to the "no monospace labels" rule, because
  typewriting is what this object really was. All other UI uses Libre Franklin.
- **Layout.**

  ```
  ┌ drawer (oak) ────────────────────────────┐
  │  Reading                    [search____] │
  │  ┌ card ────────────────────────────┐    │
  │  │ 320.57  Herod, James        2010 │    │
  │  │ ─────────────────────────────────│    │
  │  │ A Brief Critique of              │    │
  │  │ Anarcho-Syndicalism              │    │
  │  │ Anarchist Library                │    │
  │  └──────────────────────────────────┘    │
  └──────────────────────────────────────────┘
  ```

  Everything is left-aligned. Cards only exist on the reading list; other pages sit on
  plain card stock.
- **Risk.** The card colour sits close to the "warm cream" generated default. It stays
  credible only because it appears on cards, inside an oak drawer, and never as the page
  ground.

### B. Infoshop pamphlet

The site is treated as a riso-printed pamphlet. Two inks overprint each other on cool
uncoated paper. Headings use Franklin Gothic, the face of a century of union and protest
posters.

| Token | Hex | Role |
|---|---|---|
| paper | `#F1F2EF` | Cool uncoated stock, not cream |
| blue | `#0078BF` | Riso Blue, used for text and rules |
| pink | `#FF48B0` | Riso Fluorescent Pink, used only for the second-ink overprint |
| overprint | `#3D3F8F` | Where the two inks overlap |
| black | `#000000` | True black for long text |

- **Type.** Libre Franklin at heavy weights for display, Kalinga for prose. No monospace.
- **The one bold move.** Each page title is printed twice, in blue and in pink, with a
  2–3px misregistration, as if it came off a drum. Nothing else on the page is
  decorated.
- **Layout.** A single column of about 66 characters, left-aligned. The reading list is a
  plain table of contents with dot leaders running out to the year.
- **Risk.** "Zine aesthetic" is a known trend of its own. It earns its place here because
  much of the corpus really was distributed as riso and photocopied zines.

### C. Sky, without glass

Keeps what the owner is attached to (the page follows the time of day) and removes the
tell. The sky becomes a single flat colour field that shifts over the day. Text sits
directly on it, with no panels and no blur. Contrast is held at 4.5:1 or better by
switching between dark and light text as the sky crosses its midpoint.

- **Type.** Kalinga for everything except form controls, which use Libre Franklin.
- **Layout.** No containers. Navigation is a line of text. The reading list is a ragged
  list, grouped by category with plain headings.
- **Risk.** It may look unfinished in daylight hours. The night render decides it.

## Review against the generated-look defaults

- A: changed the page ground from card colour to oak, so cream never fills the viewport.
- B: changed cream paper to cool grey-white; dropped a vermilion accent in favour of the
  real riso ink names.
- C: dropped the gradient. A flat field per moment of the day is a choice; a gradient wash
  is decoration.
- All three avoid ALL-CAPS eyebrows, middle-dot meta strings, `→` on links, and any
  single border radius used everywhere.

## Open for the operator

1. Do the eight palettes go? Each direction above is a single committed look, plus `ink`.
2. Which two or three directions should be rendered?
