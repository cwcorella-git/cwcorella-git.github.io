# Library rulings: fidelity, not chrome (2026-10-11)

Operator rulings from the 2026-10-11 session. Facts are in
`2026-10-11-library-architecture-findings.md`. The renderer options are in
`2026-10-11-library-unification-design.md`.

## Standing role of cwcorella

cwcorella stays the **test-bed for formatting work** and the **first-level curation space**.
VG shows what cwcorella curates. Nothing in this pass changes that split.

## Rulings

**R1. Do not bring VG's chrome to cwcorella.** This supersedes an earlier answer in the same
session ("VG language, whole site, permanently"). The operator withdrew it: *"let's not
bring the chrome over. we should just make sure library ports read faithfully in cwcorella
as they would render in VG."* cwcorella keeps its own toolbar, controls, palettes and
layout. Any visual refresh of cwcorella is a separate question (see Open).

**R2. Library bodies render through VG's exact pipeline.** This means remark-gfm,
remark-breaks, wikilinks, remark-directive plus literal-text directives, columns, text
colours, VG's heading-id assignment, rehype-raw, VG's sanitize schema and style filter,
and remark-math with rehype-katex behind the same gate VG uses. Reason: a
`needs_formatting` fix judged in cwcorella has to look the same on VG, otherwise the
test-bed misleads.
- Port VG's `frontend/src/lib/markdown/*` plugins. They are framework-neutral except
  `heading-text.ts`, which imports React and must be split. Run them through unified
  directly (`remark-parse → … → rehype-stringify`); react-markdown is not needed.
- VG's react-markdown `components` overrides only add classes (h1–h6, p, strong, em, del,
  lists, task checkbox, img) and filter KaTeX spans. They become CSS rules on the reader
  body plus one rehype step that un-nests block elements from `<p>`.
- **The TOC must come from the same parse.** cwcorella's regex `extractToc` and VG's
  `slugifyHeading`/`uniqueSlug` give different ids (VG numbers repeated headings). The
  TOC reads ids out of the rendered tree, so anchors cannot drift.
- `<ann note>` hover annotations are a cwcorella extension. Keep them as a plugin that
  runs before sanitize, with the schema extended for them. Note that this is the one
  place cwcorella deliberately renders *more* than VG.
- Each ported file records its VG source path and commit. A fixture suite asserts that
  both repos produce the same HTML for the same body, so drift fails a test. When the
  shared package from the unification spec exists, these files become that package.
- Wikilinks on cwcorella point at VG's wiki URL. They never resolve against local data.

**R3. Tier badge and preview toggle.** Each document shows its computed VG tier: public,
reference (staff), or not on VG. The list can be viewed as VG public or VG staff would see
it. The operator token already accepts `viewer=` for this. No API change is needed for
the preview; the badge needs the tier exposed per row (`backend/tiers.py tier_of`).

**R4. Curation accent: moot under R1.** It was answered as "VG look, amber curation
accent". With no VG chrome, nothing needs changing. If a refresh ever adopts VG tokens,
amber is still the right choice, because VG's `SITE_STYLE.md` reserves amber for
governance actions.

**R5 (was O1). VG prose inside the reader body only.** The operator chose "Yes, reader body
only". The library reader body uses VG's prose: `#0a0a0a` ground, `text-gray-300`, white
headings, blue links, Kalinga. The panel around it stays cwcorella's.

**R6 (O2, partial). Render "sky, refined" first; renders before the renderer port.** The other
directions (static dark, flat calm) were not picked for rendering.

**R7. No mixed themes.** The operator, on the flat-calm library mockup: *"this shouldn't be an
option. no mixed themes. if you want a faithful version it should be its own thing."* This
supersedes R5's dark body inside another theme: the reader body follows the page's palette.

**R8. VG fidelity is a palette, named `ink`.** The operator: *"vg theme but dont name it that."*
`ink` is near-black, neutral greys, blue accent. Choose it to judge formatting as VG shows it.

**R9. Refine all six existing palettes, and grow to 10 (cull to 8 allowed).** The operator: *"each of
the 10 should be distinct. if we need to cull to 8 that's fine."* Proposed set, drawn on the canvas
board "Ten palettes":
- Light: sky, neutral, sage, dawn (new), paper (new, was flat calm).
- Dark: amber, rust, dusk, forest (new), ink (new).
- Static dark was folded into ink as a near-twin.
- Closest pairs if culling: neutral/paper, amber/rust.

## Open (operator undecided)

- ~~O1~~ ruled as R5. **O1 (historical). Does "reads faithfully" include colour and type inside the reader body?** For
  example, VG's dark prose (`text-gray-300`, white headings, Kalinga, blue links) shown
  inside cwcorella's reader panel, while the panel itself stays cwcorella's. The
  recommendation is **yes, scoped to the body only**: a fix to spacing, headings or
  colour spans is only judged correctly against VG's own prose styling. Kalinga is
  already cwcorella's `--font-prose`. Confirm that it is the same face as VG's TTFs.
- **O2. Visual refresh of cwcorella** (independent of VG). The operator is conflicted
  about the sky/palette background. No visual-design skill exists in the collected
  repos: `/data/checkouts/claude-skills` and `claude-code-plugins` are engineering packs,
  and the nearest match is a landing-page agent. The most-used public option is
  Anthropic's `frontend-design` skill in `anthropics/skills`. Next step: renders of
  candidate directions before any decision.
