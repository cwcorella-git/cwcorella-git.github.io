# Session — The test-bed previewed in a renderer VG does not use (2026-10-11)

Spec-only work on unifying cwcorella `/library` with VG's library. It started as a
peer request (the library-api session, relaying the operator) and continued as an
operator deep-dive. **Nothing was built**; the outputs are docs. Repos read: this one,
`veritable-games/site/frontend` (read-only), and `/data/library-api` (read-only).

| # | item | state |
|---|---|---|
| 1 | Unification spec (renderer options A/B/C, tokens, backend, migration) | **done**: `11101e8`, corrected `2c8c776` |
| 2 | Architecture findings: how the sites link, feature gaps both ways | **done**: `2be937e` |
| 3 | Operator rulings R1–R4 (fidelity, not chrome) | **done**: `2be937e` |
| 4 | Port VG's markdown pipeline into cwcorella's library reader (R2) | **proposed**: not started; spec only |
| 5 | Tier badge and VG public/staff preview toggle (R3) | **proposed**: needs `tier_of` per row from library-api |
| 6 | O1: VG prose colour and type inside the reader body? | **done**: ruled yes, body only (R5) |
| 7 | O2: render "sky, refined" (day list, dusk library + VG body, night list) | **done**: canvas https://claude.ai/artifact/9zamj3pU4c1HpbewbhokZe + ops Media tab; awaiting verdict |

Docs: `docs/superpowers/specs/2026-10-11-library-{unification-design,architecture-findings,visual-rulings}.md`.

## 1. The test-bed previewed in a renderer VG does not use

cwcorella is where `needs_formatting` fixes get judged, and it judges them in `marked`.
VG renders the same body with react-markdown plus remark-breaks, directives, columns,
text colours, numbered heading ids, a sanitize schema and gated KaTeX. A body that looks
fixed here can render differently on VG. That is the real reason to converge renderers,
more than code reuse. The operator's R2 ruling ("library ports read faithfully in
cwcorella as they would render in VG") follows from it.

Port feasibility, as measured: VG's `lib/markdown/*` plugins are framework-neutral except
`heading-text.ts`, which imports React. The react-markdown `components` overrides only
add classes, plus one block-in-`<p>` unwrap, so they become CSS and one rehype step.
The trap: cwcorella's regex `extractToc` and VG's `uniqueSlug` disagree on repeated
headings, so the TOC must come from the rendered tree.

## 2. The sites are not linked; they are two clients with different powers

Both sites talk to library-api. cwcorella holds the operator token in the browser and
does all curation (13 endpoints). VG holds a scoped token server-side, must pass
`viewer=public|staff`, and has read live since 2026-09-28. Its tags, annotations,
favorites and revisions still sit in VG Postgres, and its edit UI still writes there
(single-store phase 4 is not done). Publication is computed (`keep AND public AND free
licence`) and pushed to VG by `reconcile.py`. One document is VG-public today. **VG does
not call `/facets` or `/tags`**, so none of cwcorella's navigation is visible there.

## 3. The operator reversed "whole site, permanently" within the session

The first AskUserQuestion round came back as: VG language on the whole cwcorella site,
retire palettes and sky. While I was asking about the UI font and background, the
operator withdrew it: *"let's not bring the chrome over."* R1 records the reversal. R4
(amber curation accent) is moot under R1. VG's own `SITE_STYLE.md` reserves amber for
governance actions, so the choice would still stand if VG tokens ever return.

## 4. The brief was wrong about cwcorella having no sanitizer

The peer brief said cwcorella used `marked` "with no sanitizer". `20d6729`, by another
session, had already added isomorphic-dompurify, run *after* the `<ann>` pass, because
three Hack This Zine docs carry live `<script>`. It surfaced only because my first push
was rejected non-fast-forward. The spec was corrected in `2c8c776`, and the peer was told.

## Open

- O1 and O2 are the operator's calls (rows 6–7). The recommendation recorded for O1 is
  yes, scoped to the reader body only.
- Design-skill search: the collected repos (`/data/checkouts/claude-skills`,
  `claude-code-plugins`) have no visual-design skill. The most-used public option is
  `anthropics/skills` `frontend-design`. Not installed or tried.
- **Never verified:** that cwcorella's `'Kalinga'` is the same face as VG's TTFs. Also
  unverified: the contents of VG's universe-absorption plan, and VG's annotation storage
  schema. All VG facts come from a read-only survey of a tree with 27 uncommitted files
  (HEAD `d28139167`), so the renderer details may still move.
- The `/library` layout of cwcorella was not changed and nothing was rendered. Every
  visual claim in the rulings is unseen.

## Resume here

- Next: the operator answers O1 and the O2 directions. Then render 2–3 refresh directions
  (reading list + library, each with a VG-faithful reader body). Load the
  `artifact-design` skill and quickstart first.
- If R2 goes ahead without waiting on O2: start from VG
  `frontend/src/lib/markdown/` and `components/ui/HybridMarkdownRenderer.tsx` (record the
  VG sha at port time). The target is `src/lib/admin/markdown.ts`, which keeps
  `renderMarkdown`/`extractToc` exports. Add a parity fixture suite. Push to `main` is
  ask-free here (static site).
- Nothing is running in the background.

## 5. Post-compaction: O1 ruled, the first refresh rendered

The operator answered by `/blockout`: O1 yes, reader body only (R5). Render only "sky,
refined", and send it to the ops Media tab as well. Renders come before the R2 port. Three
1280×800 boards are on the canvas above. PNGs are in `/data/ops-media/20261011-173002-sky-refined-*`,
pruned after 30 days. They are mockups with hand-set colours, not the live palette code.
Kalinga was loaded from `static/fonts`. Only the library board was viewed after rendering;
the day and night boards were not looked at.

Resume: wait for the operator's verdict on the look, then do the R2 port (see above).
