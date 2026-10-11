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
| 4 | Port VG's markdown pipeline into cwcorella's library reader (R2) | **done**: `0343f5b` |
| 5 | Tier badge and VG public/staff preview toggle (R3) | **done**: see §8; the API already sent `tier` |
| 6 | O1: VG prose colour and type inside the reader body? | **done**: ruled yes, body only (R5) |
| 7a | Ten palettes, solid mode, boxed search (R7–R9) | **done**: `a812535` |
| 7 | O2: render "sky, refined" (day list, dusk library + VG body, night list) | **done**: canvas https://claude.ai/artifact/9zamj3pU4c1HpbewbhokZe + ops Media tab; awaiting verdict |

| 8 | library-api: accept `tier` on `/anchor-offset`, then re-enable the jump rail under a preview | **done**: library-api `13d4346` (deployed), cwcorella `a5809d9` |
| 9 | `--clr-meta`: explicit metadata colour per palette instead of opacity | **done**: `dacddf2` (and night legibility, §9) |
| 10 | BookView (baked reading-list docs) through the VG renderer | **done**: `9982955` (origin tag + backfill, 138/144) |

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

## 6. Operator notes on the renders; all three directions now drawn

The operator's Media-tab notes asked two things. Why the search bar differs: it was an
underline-only input, copied from the live site, among boxed pills. It is now a boxed field on
both sky boards. Why the reader body differs: it is VG's own dark prose, per R5. A "blended"
variant was added for comparison (VG type on the page glass). Static dark and flat calm were
drawn with explicit metadata colours at about 7:1 instead of opacity. Two ops picks are
pending: `library-body` and `direction`. Under flat calm the faithful dark body clashes most;
under static dark it is indistinguishable from the page.
Of the new boards, only `flatlibrary`, `dark` and `libraryblended` were viewed.

## 7. No mixed themes; ten palettes drawn

The operator struck the dark-body-on-a-light-page option (R7). VG fidelity becomes its own
palette, `ink` (R8). All six palettes are to be refined, and the set grows to 10 (R9). The sheet
is on the canvas and in Media (`20261011-174104-ten-palettes-*`). Pending: the operator's
verdict on the 10 and any cull. The colours are proposals, not `theme.svelte.ts` values; the
time-of-day palettes are shown in their day state only.

## 8. The plan, executed: palettes, VG renderer, tier preview

The operator approved the plan (`~/.claude/plans/polymorphic-bouncing-curry.md`). Three
commits:
- **`a812535` — ten palettes.** Adds dawn, paper, forest and ink, plus a `solid` mode with no
  blur. The dark-glass text was lifted for contrast. The reading and links search fields are
  now boxed. **The sky canvas paints nothing**: Sky.svelte only sets CSS vars, so the page
  ground is `--body-bg`. The gradient skies in the renders were invented. Seen on the built
  site, all ten palettes on the reading list (Media).
- **`0343f5b` — VG renderer (R2).** Plugins ported verbatim @ VG `b51c85973`. The overrides
  became a tree pass. A one-off parity run against VG's own `HybridMarkdownRenderer` over 184
  real bodies came out **184/184 identical** after normalization. Getting there exposed three
  VG behaviours, now matched:
  - VG's span component drops every attribute except class and style, so marker's
    `id="page-N-0"` is gone on VG.
  - VG strips the trailing newline in code.
  - **VG never renders its code-language label**: the `child.type === 'code'` check is dead
    under react-markdown 10.

  VG also leaks `node="[object Object]"` onto `<pre>` and `<code>`. That is a VG bug, which
  the parity normalizer ignores. The fixtures carry VG-generated expected HTML
  (`scripts/vg-parity/README.md`).
- **The e2e was already failing at HEAD.** Relevance snippets put the body text in the list
  row, so unscoped `getByText` matched two elements. 8099 was also taken by a 12-day-old
  `python3 -m http.server`, which I did not kill. Fixed by scoping to `.doc-body` and making
  the port configurable with `E2E_API_PORT`. 9/9 pass.
- **R3, the tier badge and preview.** library-api already returns `tier` per row and per
  document. The preview uses the `tier` filter, not `viewer=`: **`/anchor-offset` accepts
  neither**, so the jump rail is disabled while a preview is set (row 8). Seen on the seeded
  API: the badges, `tier=curated` in the URL, rail button count 27 → 0.

Not verified:
- **KaTeX:** rendering was never looked at in the browser, only in unit tests.
- **Palettes in the reader:** only ink and paper were viewed, under a seeded body, never real
  documents.
- **Night palettes:** the time-of-day palettes were only seen at about 18:00.
- **Live service:** nothing was checked against the real library-api; the CORS pin rules
  localhost out.

## Resume here (updated)

- Rows 8–10 are proposed. Row 8 is a library-api change plus a service restart on the
  workstation; see `../library-api/CLAUDE.md`.
- Re-port VG's renderer when VG changes it: `scripts/vg-parity/README.md`.
- Nothing is running in the background.

## 9. Follow-ups: rail, reading list, and a night nobody could read

Second plan, approved by the operator. Three steps:
- **The rail under a preview.** library-api `13d4346` adds `tier` to `/anchor-offset`. A
  parametrized test checks every tier value; it fails without the fix (5/6) and passes with it.
  `tests/`: 987 pass. `tools/scrape` has a collection error, already present: `requests` is
  missing.
  - The deploy is a restart on the workstation. The service process started 18:59:07, after
    the commit, and `/livez` returns 200 on both the public URL and the bridge. My follow-up
    `journalctl` and `systemctl show` calls were denied by the auto-mode classifier.
  - **No authenticated call was made against production.** I didn't go looking for the token.
  - cwcorella `a5809d9` puts the rail back. A new e2e checks that a jump under `?tier=none`
    sends `tier=none` and lands on the right row (10/10).
- **The reading list (`9982955`).** `BookDoc` gains `origin` and `source`. The backfill
  matched 138 of 144 docs on text evidence. The 6 left unmatched are hand-placed, e.g. An
  Anarchist FAQ, Aesop, The Oresteia, and stay on `marked`.
  - A side effect is also a fix: **`marked`'s heading override emitted raw text**, so
    `### **…**` headings showed literal asterisks on the public reading list.
  - Two slips of my own came close to shipping. A replace hit my own new function and made
    it recurse forever, which would have crashed every own doc. Separately, `loadDoc` still
    used `marked`. Both were caught by checking the built page's class list, not by the tests.
  - BookView saves now keep `origin`.
- **`--clr-meta` (`dacddf2`).** Measuring it exposed a worse problem, already present: **the
  four time-of-day palettes were illegible at night.** `--body-bg` never left its daytime
  colour, so the darkening glass composited to mid-grey under pale text. Sky measured 2.9:1
  at midnight and 1.3:1 at dusk, and that was confirmed on screen with a faked clock.
  - The fix is the pure `lightFrame`. The ground switches at twilight, because no continuous
    fade clears 4.5:1 for both text colours (the floor is about 3.7:1). The text is whichever
    reads better on the panel actually shown.
  - The test requires text and meta at 4.5:1 or better for every palette at every 5% of the
    day. Seen: sky at noon, sky and dawn at 23:00, ink.

Not verified:
- The twilight switch was never watched in motion; the 1.5s transition is assumed.
- Nested opacity on facet rows (row 0.7 × meta) still dims the counts.
- The real reading-list deploy on Cloudflare was not checked.

## 10. Facet rows, and two more found by looking (`afe795d`)

The faded facet rows and triggers now use explicit colours: `--clr-meta` at rest, text on
hover or when set. That supersedes the old house rule "hierarchy via opacity, never a second
colour", whose comment in FacetPanel now says why. The screenshot exposed two more problems,
both fixed:
- **Menus let the controls behind them read through.** In sky at night, "TITLE" showed over
  the counts. The menus now use the heavy glass.
- **Sky's accent was dark blue on the night ground.** The tier badge and body links nearly
  vanished. The accent is now made legible per palette, and per frame on light palettes;
  contrast.test.ts covers it. 322 unit tests and 10/10 e2e pass.

Still faint: about 8% of the page shows through heavy glass at night. Not fixed.
