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
| 8 | Mountains still read 2D (operator): spur ridges scaled per range, relief-exaggerated side light, cast shadows, haze thicker at the base | **done**: `65c6aa2`. Seen at 10:00, 15:30, sunset, Jan 15, and on a phone. Not checked on the live site |
| 9 | Winter snowfields read as pale vertical walls; they should follow the gullies | **proposed** |
| 10 | Range bases sat flat on the field (operator). Three reshapes of the range profile (concave apron, knolls, skylight by up-facing) still read as a wall, because with the sun behind the range the face is a shadowed wall either way. Fixed with a separate 3-row foothill layer (`renderFoothills`), which the operator picked | **reverted**: `c63e581`, reverted in `e6f805e`. Operator: "foothills are terrible" |
| 11 | Row 5: tree cast shadow drawn from the TreeArt crown | **done**: `c498400` |
| 12 | Operator: "we need an alternative rendering method for the mountains altogether". Real terrain chosen: `scripts/bake-terrain.py` ray-marches AWS Terrarium elevation (z11) from downtown Reno over azimuths 180–340 and bakes normals, distance, elevation and 8-direction horizon angles into `static/garden/terrain.png` (526 KB). `src/lib/garden/terrain.ts` re-lights it from the real sun, with terrain shadows, distance haze and a monthly snow line. The noise ranges remain only as the load fallback | **done**: `c94a1ac`. Seen at 10:00, 15:30, sunset, Jan 15 and on a phone (dev). Not seen live. Re-light cost on a phone not measured (216k px per half-degree of sun) |
| 13 | Remove the noise-range code (`buildRangeField`/`renderRangeField`, `RANGES`, `reno-ridge.json`) if the fallback is not wanted | **in progress**: removed in the working tree, uncommitted (see 14) |
| 14 | Operator on `c94a1ac`: "we lost the full range (horizontal fill) and it's just one mountain. nothing in the background. no layers." Then: "i dont even want it to be reno. can we pick another range? it could be fiction. idc." Approved plan: `~/.claude/plans/crystalline-whistling-music.md` | **in progress**: steps 1, 3 and 4 written and uncommitted; step 2 baking; step 5 not started |
| 15 | Step 2: bake the top 3 sites, render them through the page, send to Media as group `cwc-range`, operator picks one, commit only that atlas | **in progress**: background bake running |
| 16 | Step 5: time the re-light and atlas decode on a throttled phone; try lossless WebP | **proposed** |

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

## 6. From Reno there was nothing behind the first ridge

The real-terrain bake (`c94a1ac`) gave true 3D, but the operator saw "just one mountain". A read
of the atlas confirmed it: from 30 m over downtown, every visible pixel was within about 14 km.
The Carson Range front and Peavine hide everything behind them, so no amount of lighting could
add layers. The view, not the renderer, was the limit. The operator released the scene from
Reno, so `bake-terrain.py --score` now ranks candidate viewpoints at low resolution by layers
(depth jumps of more than 3 km per column), fill, relief and mean distance:

| site | layers | relief° |
|---|---|---|
| mitchell (Blue Ridge) | 4.30 | 0.94 |
| rigi (Alps) | 2.68 | 2.69 |
| sierra-east (White Mtns) | 2.24 | 2.50 |
| niederhorn (Bernese Alps) | 2.00 | 4.39 |
| pinedale | 1.77 | 3.58 |
| sauk | 1.56 | 2.26 |
| reno-raised (800 m) | 0.90 | 3.01 |
| shadow (Tetons) | 0.61 | 6.52 |
| seceda | 0.43 | 6.94 |

`fill` scored 1.00 almost everywhere, so it does not discriminate; treat it as unvalidated.
Mitchell was skipped despite having the most layers, because its relief is under 1°. Rigi,
Niederhorn and Sierra-east were baked.

Lessons from the earlier, discarded tries: three reshapes of the noise heightfield and a
separate painted foothill layer all failed ("foothills are terrible", reverted `e6f805e`).
With the sun behind a range, its face reads as a wall whatever the profile. The terrain
loader was first wired into `resize()` instead of `onMount`, because a text replace matched
the first `buildScene` call. The terrain then never loaded, and nothing in the console said so.

## Open (rows 13–16)

- **UNCOMMITTED, would break the live site if committed as-is.** The working tree holds:
  - `scripts/bake-terrain.py`, rewritten with sites, `--score` and `--site`, and writing
    `terrain.json`;
  - `src/lib/garden/terrain.ts`, which reads `terrain.json` and adds valley haze (`pool`) and
    `snowLineFor`;
  - `Garden.svelte`, which lights from where the sun is drawn, uses a centred slice and
    `loadTerrain(base + '/garden')`, with the noise ranges removed;
  - `detail.ts` with the range code removed, and `reno-ridge.json` `git rm`'d.

  **The committed `static/garden/terrain.png` is the old Reno-format atlas with no
  `terrain.json`.** The new loader would fail, and the garden would show no mountains. Commit
  the code only together with a picked bake's `terrain.png` and `terrain.json`.
- Type-check was clean after these edits (0 errors). The tests were not re-run. Nothing new
  has been rendered.
- The valley-haze `pool` and the sun-follows-drawn-sun lighting have never been seen rendered.
- `c94a1ac` (Reno terrain) is what's live, and has never been checked on cwcorella.com.

## Resume here

- `main` = the last pushed doc commit; code `c94a1ac` live. The working tree is dirty with
  rows 13–14 (see Open). **Do not `git add` the code without a new atlas.**
- **Background bake**: task `bbq7sa7dd` runs `bake-terrain.py --site {rigi,niederhorn,sierra-east}`
  in sequence, writing `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad/bakes/<site>/terrain.{png,json}`.
  Tiles are cached in `.../scratchpad/tiles`. If a folder is missing, re-run
  `python3 scripts/bake-terrain.py --site <site> --cache <scratchpad>/tiles --out <scratchpad>/bakes/<site>`.
- **Next row: 15.** For each site:
  1. Copy its `terrain.png` and `terrain.json` into `static/garden/`.
  2. Render with `node <scratchpad>/renders/live.cjs <name> / 1280 2026-10-22T15:30:00-07:00 sky`
     (and 10:00). The dev server is `npx vite dev --port 5191`, which may still be up. The
     script now waits 4 s and logs page errors.
  3. Send to Media with `mcp__ops__ops_send_file`, `group: "cwc-range"` and `label: <place>`.
  4. Read the pick with `ops_pick`.
- Then copy the picked atlas and JSON into `static/garden/`, run `npm run check` and
  `npx vitest run` (325), render 10:00, 15:30, sunset, Jan 15 and 390 px, and commit the code,
  atlas, JSON and the `reno-ridge.json` removal together. Push with
  `git -c credential.helper='!gh auth git-credential' push -q https://github.com/cwcorella-git/cwcorella-git.github.io.git main`.
- Then row 16 (phone timing, WebP), per the plan file.
