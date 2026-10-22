# 2026-10-22 — The ridge came back as the farthest mountain

A realism pass over the restored garden. It continues
`2026-10-21-the-garden-was-the-human-part.md`, which ended with the garden restored "as it
was". The operator asked for research on making the background feel more realistic, then for
all six findings built in one pass. Next they asked about the fidelity of the mountains and
trees and picked every option: four for the mountains and four for the trees.

| # | item | state |
|---|---|---|
| 1 | Research: what reads as fake in the garden | **done**: answered in chat (ground, mountains, clouds, shadows, trees, banding) |
| 2 | Realism pass: meadow, hazed ranges, lit clouds and cirrus, cloud and tree shadows, shaded leaves, grey bark, night dimming, grain | **done**: `ea4b5f1` |
| 3 | Mountains: real Reno ridge, eroded slopes, height bands, lit 3D heightfield | **done**: `379096c` |
| 4 | Trees: clumped leaf masses, tapered trunks, local species, seasons and sway | **done**: `0d2af5b` |
| 5 | Re-cast the tree shadow from the new clumped crown | **proposed**: it still uses the old `drawTree`/`drawLeaves` outline |
| 6 | Time the range re-render on a phone (heightfield re-lit on each 1° sun step) | **proposed** |
| 7 | Rows 10 and 11 of the 2026-10-21 doc (ALL-CAPS labels, re-push `garden-archive`) | **proposed**: still the operator's call |

Renders went to the ops Media tab without a group. There was nothing to pick, only to look at.

## 1. Most of the "flat" look was one hill polygon

The ground gradient in `drawGround` never showed. `fillHillRange` closes its polygon at `H`,
so the hill colour (an olive `[70,82,46]`) covered the whole ground band. The fix
(`src/lib/garden/detail.ts` `renderMeadow`) is a multiply layer over that fill. It has noise
patches of dry gold and green and about W·bandH/34 small perspective-sized blades. Because it
multiplies, the ground still follows the time of day, and at night it simply goes dark. The
hill fill colour was raised to compensate, so **the daytime ground is lighter than before**.

## 2. Shading by 1-D slope makes stripes

The first mountain pass shaded each pixel column by the crest's slope over ±2px. On a phone
(dpr 2) that showed as vertical curtains. Widening the slope window to about 1% of the width
helped. The real fix was replacing the method (§3). Not every vertical bar was mine: the
existing crepuscular rays (`drawCrepuscularRays`) also look like columns at 390px.

## 3. The ridge traced on 2026-10-21 is now the farthest range

`ee7cd4a`'s `ridge.json` (SRTM 90m, downtown Reno, azimuth 180–340°) is restored as
`src/lib/garden/reno-ridge.json`. It is resampled across the width as the crest of the
farthest range, exaggerated, with a little ridged noise for sub-degree detail.

Every range is now a heightfield of W × 64 rows, from foot to crest (`buildRangeField`). It
is marched front to back with a y-buffer (`renderRangeField`), and each sample is lit by n·L
from the sun direction. Sun x comes from `sxn`, sun y from altitude, and there is a small
z-component from beyond the range. Gullies are ridged noise stretched downslope.

The first render had a sawtooth skyline: gully modulation at the crest put a spike on every
spur. Gullies now fade with √(1−z) toward the crest, so the skyline stays the crest line.
Materials band by height plus noise: sage, a patchy pine belt, rock (also on steep ground),
and snow on flatter high ground from November to May.

Distance haze is 1 − e^(−βd) toward the horizon sky colour, with β = 0.3 + 0.75·daylight.
The first β (up to 1.8) washed the ranges out to white.

## 4. Trees: from lollipops to clumps

`src/lib/garden/treeArt.ts` bakes each tree into a tapered trunk with a sunlit edge, plus one
sprite per leaf clump. Tips are grouped on a grid. Each clump has a dark underside, mid tones,
a lit cap toward the sun, a few sky gaps, and its own slight hue drift. The first clumps used
about 15 big circles and read as popcorn; many small blobs fixed it.

- **Species:**
  - The foreground and far-right trees are cottonwoods that follow `cottonwoodFoliage(doy)`:
    bare before day 95 and after 332, pale green in April, gold from day 272. They render
    gold today.
  - The midground oak and maple set is now a cottonwood, two Jeffrey pines and a juniper.
- **Bark colour:** it is computed from thickness at draw time (`barkColor`). Cached trees in
  visitors' localStorage carry the old orange `seg.color`, so `seg.color` is now ignored.
- **Sway:** crowns sway by `(noise1D(t/6) − 0.5)·6·dpr` px at the top. The trunks do not move.

## 5. Small things that were wrong before this session

These were pre-existing; I fixed them while touching the code.

- The foreground tree kept its daylight bark all night, and the grass and ferns stayed bright
  green at night. Plants now dim through `drawPlants(…, dim)` with memoised colours, and the
  trees fade toward a night silhouette.
- Clouds now come from noise density. Each cloud is lit by four samples toward the sun, which
  gives flat dark bases and lit tops. They are re-baked only when the colour key or the sun
  side changes. Cirrus are warped, stretched noise.

## Open

- **SHIPPED, partly seen.** `ea4b5f1`, `379096c` and `0d2af5b` are pushed to main.
  - I never confirmed the deploys with Actions, and **the live site was never opened**.
  - Renders were seen from `vite dev` at 14:40, 16:55, 17:45 and 22:30 (desktop), and at
    390px for 14:40 and 16:55. **Dawn, a winter date (bare cottonwoods, snow) and spring were
    never rendered.**
- **Performance not measured.** The meadow is baked on resize at roughly 37k strokes at
  dpr 2. Ranges are re-lit on each 1° sun step (four heightfields with per-pixel ImageData).
  Trees and clouds are re-baked on key changes. None of it was timed on a phone. Mount cost
  also rose, because heightfields are built in `buildScene`.
- **Contrast over the ground is still unmeasured.** The sky keyframes are unchanged, so
  `contrast.test.ts` holds. The lighter daytime ground under the panels is judged by eye only.
- **The tree's cast shadow does not match the new crown** (row 5).
- **Two midground trees (0.49, 0.61) sit behind the home panel**, and on phones the panel hides
  the foreground tree too. Positions were left as they were.
- **The sunset rays read as bars at phone width.** This is pre-existing.
- **The dev server on port 5191 may still be running.** `pkill` returned exit 144 both times,
  and nobody checked whether it stopped.

## Resume here

- `main` = `0d2af5b`, pushed. Nothing is unlanded.
- First, check the deploy: `gh run list -R cwcorella-git/cwcorella-git.github.io -L 3`, then
  open cwcorella.com.
- Then check for a leftover dev server: `ss -ltnp | grep 5191`, and kill it if found.
- To render: `npx vite dev --port 5191`, then
  `node /tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad/renders/live.cjs <name> / <width> <iso-time-07:00> sky`.
  For winter, use a January date such as `2027-01-15T14:00:00-08:00`.
- Code map:
  - `src/lib/garden/detail.ts`: meadow, heightfield ranges, clouds, cirrus, grain.
  - `src/lib/garden/treeArt.ts`: species, clumps, seasons.
  - `src/lib/components/Garden.svelte`: `RANGES`, `MIDGROUND`, `treeArts()` and the draw
    order in `draw()`.
- The next row, if continuing, is **5** (re-cast the shadow from the `TreeArt` sprites) or
  **6** (time it on a phone). Both are proposed, not started.
