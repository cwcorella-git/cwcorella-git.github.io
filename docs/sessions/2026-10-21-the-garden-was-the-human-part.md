# Session — The garden was the human part (2026-10-21)

Visual refresh of cwcorella. The operator asked for skills to make the site feel less like
every other Claude Code site. It went through three flat directions, which were rejected
("my first website"), then a middle ground on the real site, then a traced Reno skyline,
and ended by restoring the original nature garden from March. Continues open item O2 from
`2026-10-11-the-test-bed-previewed-in-a-renderer-vg-does-not-use.md`.

| # | item | state |
|---|---|---|
| 1 | Find agent skills for web design in `/data/checkouts` | **done**: none there; `frontend-design` was installed but not enabled. Operator enabled it |
| 2 | Visual refresh brief (three directions) | **done**: `1edf5e1`, decisions `587b5f1` |
| 3 | Render A card catalogue / B infoshop pamphlet / C sky without glass | **done**: ops Media `cwc-direction`; none picked |
| 4 | Frame options for C (sheet / window / ridgeline) | **done**: Media `cwc-sky-frame`; rejected as "soooo basic" |
| 5 | Middle ground rendered on the real site (4 steps) | **done**: Media `cwc-middle`; operator picked step 4 |
| 6 | Ship step 4: palettes down to sky + ink, Libre Franklin, "Author, year", letter guides, sort fix, glass edge, traced ridge | **done**: `ee7cd4a`, deployed |
| 7 | Find the original nature background | **done**: `garden-archive` (local ref only, deleted on GitHub), removed in `04176ba` |
| 8 | Restore the garden "as it was", replacing the ridge | **done**: `06b798a`, deployed |
| 9 | Dusk contrast broke under the garden | **done**: `06b798a` (lightFrame backdrops + test) |
| 10 | Remove ALL-CAPS tracked labels (~25 components: library, links, admin) | **proposed** |
| 11 | Re-push `garden-archive` to GitHub so it is findable | **proposed**: operator has not ruled |

Brief: `docs/superpowers/specs/2026-10-21-visual-refresh-brief.md` (decisions and Not done).

## 1. The skill the old spec recommended was already on disk

The 2026-10-11 rulings (O2) said no visual-design skill existed in the collected repos and
named Anthropic's `frontend-design` as the option. That was half right. `/data/checkouts`
holds only engineering packs (claude-skills, claude-code-plugins, deepseek-harness UI
discipline, architecture-skills for buildings). But `frontend-design` was already
installed under `~/.claude/plugins/.../frontend-design/` and simply not enabled. The
operator enabled it with `/plugin`. `humanizer` covers prose only; it is not a layout tool,
and on this site it must not rewrite the operator's own words.

## 2. Distinct and principled was not what the operator wanted

The brief grounded three directions in the subject: a card catalogue, a riso pamphlet, and
a flat sky. They were rendered as static mockups with real books and the real home text.
The operator rejected all three, and then rejected the framed sky too: *"it's definitely
human (laughably so) like, 'my first website' vibes. but i miss the old look."* The
lesson: removing the generated-look tells by stripping everything out reads as amateur,
not human. The middle ground that worked kept the old look and changed only the tells.
Those renders were made by injecting CSS and JS into the real dev site
(`scratchpad/renders/live.cjs`, mods `m-base`, `m-ridge`, `m-tabs`), not as fresh mockups.

## 3. Rendering traps worth keeping

- Playwright's bundled browser was missing; use `executablePath: '/usr/bin/google-chrome'`.
- `clock.setFixedTime` without `timezoneId: 'America/Los_Angeles'` showed night at 2:40pm,
  because Sky.svelte reads local hours.
- Google Fonts with `display=block` timed out `goto` at `load`; use `domcontentloaded`.
- A worktree with a symlinked `node_modules` fails under `vite dev` (403 on `/@fs/`
  outside the root). Build it, then use `vite preview`.
- The theme default was `neutral`, not `sky`; set `localStorage['cwc-theme']` to render a
  palette.

## 4. The ridge was real data, briefly

`scripts/trace-ridge.mjs` traced the western skyline from downtown Reno (SRTM 90m via
OpenTopoData; 161 azimuths × 64 samples; earth curvature and refraction). The result was
plausible: Slide Mountain and Mt Rose at about 4.8°, the Truckee gap at 2°, Peavine at
5.3° close to the northwest. It shipped in `ee7cd4a` with about 6× vertical exaggeration,
then was replaced the same day. The script, `ridge.json` and `Ridge.svelte` live only in
`ee7cd4a`.

## 5. The nature background was a deleted branch kept alive by one clone

`garden-archive` and `feat/sky-v2` no longer exist on GitHub. Only `main` does. They
survive as stale `origin/*` refs in the workstation clone, and the code is safe because
`garden-archive` is an ancestor of `main`. The garden was removed in `04176ba`
(2026-03-06, "remove nature visuals, rename Garden → Sky"). Later commits stripped Sky's
canvas until it drew nothing (`1a82ce2`). That is why "the old look" had become a flat
colour field.

## 6. Restoring "as it was" broke dusk, and only a screenshot showed it

The garden was restored verbatim except for its own per-frame colour writer, which was
dropped so the contrast-tested `lightFrame` keeps the colours. The first dusk render had
dark text on a dark panel. The cause: `lightFrame` picks text against the flat ground,
which stays light until dl < 0.3, while the garden's sky turns navy from −6° altitude. The
glass is only 22–42% opaque, so the garden *is* the panel colour. The measured worst case
was 1.46:1. At 0–1° (sunset), neither text colour reached 4.5:1 (best 4.14).

Fix: `lightFrame(p, dl, backdrops?)` takes the bands the glass actually sits on
(`src/lib/garden/backdrop.ts`: `skyColorsAt` gives mid and lower). It picks the text that
reads on all of them, and raises glass alpha in 0.02 steps until 4.5:1 is met (cap 0.9).
`contrast.test.ts` sweeps −20° to 60° in quarter degrees and also asserts that
backdrop.ts's keyframes equal the ones Garden.svelte draws. Tests and type-check passed
before this was found. Only looking found it.

## Open

- **SHIPPED, partly seen.** `06b798a` was screenshotted from a local `vite preview` build at
  14:40 (day), 17:50 (dusk), 18:10 (sunset), 22:30 on a phone (taken before the contrast
  fix; night was unaffected) and in ink. The live site at cwcorella.com was confirmed
  deployed (Actions success, new asset hash) but **never looked at in a browser**.
- **Contrast is checked against sky bands only, not grass.** Panels that hang over the
  grass (the lower home panel, long reading lists) composite over dark green, which the
  test does not sample. By day the dark text there has not been measured.
- **Library, links, journals and admin panels were never screenshotted** after the font
  change from Courier to Libre Franklin. `CHAR_W` in `reading/+page.svelte` was re-estimated
  to 6, not measured.
- **The garden's "seed the tree" admin click is dead code.** It listens on the canvas,
  which has `pointer-events: none`. It was like this before the removal; it was restored
  as-is.
- **Garden performance** (redraws at about 4fps by day and 30fps at night, every frame while
  the mouse moves) has not been profiled on a phone.
- Operator's call: rows 10 and 11.
- Media sets `cwc-direction` and `cwc-sky-frame` never got a pick, and are superseded.

## Resume here

- Nothing is running. Dev and preview servers were killed; the garden worktree was removed.
- `main` = `06b798a`, pushed and deployed. Nothing is unlanded.
- Next row if the operator wants to continue: **10**, the ALL-CAPS labels. Find them with
  `grep -rn "text-transform: uppercase" src --include=*.svelte` (about 50 rules in 25
  files). Screenshot library, links and journals first: `node <scratchpad>/renders/live.cjs
  <name> <path> <width> <iso-time> sky` against `npx vite dev --port 5191`. The library
  needs API mocks (CORS), as described in CLAUDE.md.
- Row 11 is a one-liner, if asked: `git push https://github.com/cwcorella-git/cwcorella-git.github.io.git origin/garden-archive:refs/heads/garden-archive` with the gh credential helper.
