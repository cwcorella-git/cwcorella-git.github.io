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
| 15 | Step 2: bake the top 3 sites, render them through the page, send to Media as group `cwc-range`, operator picks one, commit only that atlas | **superseded** by 17: sent to Media; operator liked Rigi and Niederhorn both, but "they both have detail issues. mountains are smooth in some areas." |
| 16 | Step 5: time the re-light and atlas decode on a throttled phone; try lossless WebP | **proposed** |
| 17 | Re-bake Rigi and Niederhorn with sub-tile detail (z12 near, ridged noise on steep ground, 1600×440 atlas) | **rendered, awaiting pick**: both baked (Rigi 221 s, Niederhorn 146 s, ~1.25 GB, atlas 1.8/1.6 MB); sent to Media `cwc-range-2`; uncommitted |
| 18 | Operator: "how can we convert the plains? now the foreground is clearly 2d"; picked "Bake into the terrain". The camera stands on a baked meadow sloping away at 6°, drawn into the ground band | **rendered, weak**: in the renders the meadow still reads as a near-flat green plane under the painted blades. Rendered, but it does NOT yet answer "clearly 2d" |

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

## Resume here (superseded by the one at the end)

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

## 7. Both Alpine views had layers; both were smooth (round two)

The three bakes (Rigi, Niederhorn, Sierra from the White Mountains) were
rendered through the page at 15:30 and sent to Media as `cwc-range`. Rigi and
Niederhorn finally showed stacked ridges across the width; Sierra was a hazy
wall. Niederhorn also had dark vertical streaks on its left ridge. The
operator: "i like how both feel on their own but maybe im trying to say they
both have detail issues. mountains are smooth in some areas." And: "now the
foreground is clearly 2d and it needs an upgrade."

Diagnosis, not measured: z11 tiles are ~50 m/px there, normals from 40 m
differences, and a 1200-column atlas upscaled on desktop. So mid-distance
faces come out as smooth plastic.

Changes in the working tree (all uncommitted, none rendered):

- `scripts/bake-terrain.py`:
  - **Tiles:** a `Land` class with z12 tiles within 28 km and z11 beyond.
  - **Meadow:** the camera stands on a meadow cone sloping down at 6° (`site['slope']`), out to 1.4–2.4 km and blended into the real terrain. The ridges below the summit still show above its vanishing line.
  - **Detail:** ridged-noise detail on the normals, scaled by steepness and faded per octave by the pixel footprint.
  - **Atlas layout:** 280 rows above the meadow's vanishing line (linear in angle) and 160 meadow rows (linear in tangent, a true perspective plane down to 6 m). Atlas 1600×(440×5).
  - **Format markers:** B channel 192 marks the meadow; the JSON gains `nrowTop`, `tan0` and `tan1`.
  - The ray march now starts at 3 m.
- `terrain.ts`: a `meadow` flag; meadow albedo is grass, with no forest, rock or snow.
- `Garden.svelte`:
  - The top rows are drawn above `horizonY` and the meadow rows fill `horizonY..H`.
  - `fillHillRange` is skipped when the bake carries `nrowTop`.
  - The painted meadow, blades and trees still draw on top.

## Open (rows 17–18)

- **Never rendered:**
  - the meadow cone could read as a bald dome;
  - 6° may hide or show too much of the valley;
  - the vertical exaggeration is unchanged at ≤ 4×.
- **Not measured:** the bake's run time and memory, and the atlas size (likely several MB, which feeds row 16).
- The `--score` path was changed to the new `march` signature and has not been run.
- `static/garden/terrain.png` and `terrain.json` currently hold the round-one White Mountains bake, copied in for rendering. **Do not commit them.**
- `reno-ridge.json` must be deleted in the same commit as the code.
- `npm run check` is clean; vitest last passed (325) before these edits.


## 8. The detail landed on the rock; the meadow barely shows (rows 17–18 rendered)

The renders are `$S/renders/live-{rigi,niederhorn}-v2{,-am,-phone}.png`, at 15:30, 10:00 and 390 px.
- **Ridges:** faces now carry gullies and rib detail, and the layers separate in haze. The smooth patches from round one are mostly gone. No seams or streaks seen.
- **Meadow:** the baked meadow is there, but its lit colour is a uniform green, and the perspective plane shows almost no structure under the painted blades and patches. The 6° slope does let ridge layers show above it.
- **Verdict:** a likely next pass for "clearly 2d" is stronger meadow-wave amplitude, or albedo variation by distance (dry or gold patches baked in). This is **not done**; it is listed as row 19.
- **Never verified:** the sunset and January lighting, phone timing (row 16), and anything after the pick.

| 19 | Meadow still reads flat after the bake: raise MEADOW_WAVES amplitude and/or add baked albedo patches, then re-render | **proposed** |

## Resume here (superseded by the one at the end)

Row 17/18. Steps 1–3 below are DONE (renders and Media sent, 2026-10-22 08:45). **Resume at step 4**: read the pick with `ops_pick` group `cwc-range-2`, then commit. Then row 19.

1. The background bake `bjh07kiwl` writes to
   `$S/bakes2/<site>/`. Its output log is
   `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/6a42ab56-838f-4546-83a4-f05667814a49/tasks/bjh07kiwl.output`.
   If it failed or never finished, rerun:
   `python3 scripts/bake-terrain.py --site rigi --cache $S/tiles --out $S/bakes2/rigi`, then the same for niederhorn.
2. For each site:
   - copy `$S/bakes2/<site>/terrain.{png,json}` into `static/garden/`;
   - render with `node $S/renders/live.cjs <site>-v2 / 1440 2026-10-22T15:30:00-07:00 sky`, plus a 10:00 render and a 390 px render (dev server on :5191);
   - look at it, and fix the meadow slope or detail amplitude if it is obviously wrong.
3. Send both to Media group `cwc-range-2`, labelled by place.
4. After the pick: copy that bake in, `git rm src/lib/garden/reno-ridge.json`, run check and vitest, commit by explicit paths, and push with the gh credential helper.

`$S` = `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad`.


## 9. After compaction: pick, clouds, timing, meadow

- Media pick for `cwc-range-2`: **Niederhorn**. Committed `0d01737`. `reno-ridge.json` removed.
- Clouds, full pass `b8e22fe`:
  - each cloud is a cluster of puffs instead of one dome;
  - billows at the edges, a bright rim toward the sun;
  - drawn at full size (they used to be drawn at 0.75 and stretched).
- Clouds, pass two `c9d00f9`:
  - far clouds fade into the haze;
  - a thin high layer of flatter cloud;
  - cloud tops kept 70 px below the top of the screen, clear of the nav bar.
- Phone timing (row 16) `897564a`, measured at 390 px wide, pixel ratio 2, CPU throttled 4×:
  - **Cloud bakes:** 3655 ms → 630 ms in total. Density is now computed on a half-resolution grid, and only one cloud is baked per frame (about 70 ms each).
  - **Mountain re-light:** 229 ms for all columns. It now only re-lights the columns on screen, but on a phone that is most of them. Not fixed further, because it only runs about every 2 minutes.
  - **Loading the mountain image:** about 730 ms.
  - **WebP:** lossless WebP is only 19% smaller than the PNG, so the mountain image stays PNG.
- Meadow (row 19) `33e4ce7`:
  - bigger swells in the ground (`MEADOW_WAVES` 14 m / 4 m);
  - dry and green patches baked into the ground (block 1 B values 128–223), which `terrain.ts` reads;
  - the painted patches over the ground turned down.
- Renders sent to Media (15:30, 10:00, 17:55, phone). This is a show-only set: no pick is needed.
- Not verified:
  - The "17:55" render does not look like sunset. The render's clock is set to Pacific time while the site follows the sun at the garden, so that time may be the wrong hour for sunset. Not checked.
  - The foreground near the bottom of the screen is still fairly even.
  - Not checked on a real phone.

| # | item | state |
|---|---|---|
| 16 | phone timing | **done**: `897564a` (re-light is still ~230 ms when throttled, left as is) |
| 19 | meadow relief | **done**: `33e4ce7` |
| 20 | clouds full pass + pass two | **done**: `b8e22fe`, `c9d00f9` |

## 10. Every render today was seven hours early, and the sun was an hour fast

- **Screenshot tool bug (correction to §9 and everything before it).**
  - `$S/renders/live.cjs` built its time with `new Date(iso)` in Node, on this server, which runs on UTC. The browser runs on Pacific time.
  - So "15:30" was really 08:30 and "10:00" was 03:00. That is why "17:55" never looked like sunset.
  - Fixed in the scratchpad script: the time is now read as Reno wall time.
  - Every lighting judgement made from earlier renders was made at the wrong hour.
- **Site bug** `de8bcf1`:
  - Garden, Sky and terrain each turned the clock hour straight into the sun's position. In daylight saving that put the sun an hour ahead, so sunset came about an hour early.
  - New shared `src/lib/garden/sun.ts`. It still uses the visitor's own clock, deliberately, because the site shows each visitor their own time of day. It now removes daylight saving (worked out from the visitor's time zone) and the equation of time.
  - `sun.test.ts` checks against NOAA times for Reno and passes within 10 minutes: Oct 22 sunset 18:05, Jan 15 sunset 16:50, Jun 21 sunrise 05:33. 329 tests pass in total.
  - This departs from the approved plan, which said UTC plus Reno's longitude. That would have shown every visitor Reno's sky.
  - Rendered at the correct times, sunset now has orange peaks and pink cloud undersides.
- **Faster mountain lighting on phones** `cac9b91`:
  - When the screen is narrower than 800 CSS px, lighting is done at half resolution: one pixel in four is lit and copied to its neighbours. Pixels whose source would be sky are lit individually, so the skyline stays exact.
  - With the CPU slowed 4×, lighting the full width went from 229 ms to 95 ms. The target was 70 ms, but a phone only lights the columns on screen.
  - The phone render shows no visible blockiness, though the mountains there sit mostly behind the text panel.
- **Foreground: in progress, not committed.**
  - `scripts/bake-terrain.py`: close shadow-sample distances (6, 12, 24, 40 m), so a swell in the meadow shades the ground behind it.
  - `detail.ts` `renderMeadow`: 50% more grass blades in the bottom quarter, larger blades up close, and darkening toward the bottom edge.
  - `terrain.ts`: the meadow gets +0.22 ambient light, because at dusk it was going nearly black.
  - These pass the type check. Not yet rendered and not committed.

| # | item | state |
|---|---|---|
| 21 | sun on solar time + render clock fix | **done**: `de8bcf1` |
| 22 | half-res terrain relight on phones | **done**: `cac9b91` |
| 23 | foreground depth (near shadows, near blades, edge darkening, dusk meadow) | **in progress**: uncommitted, rebake running |

## Open

- Row 23 has not been seen rendered at all.
- The 10:00 and Jan 15 renders after the fix were not looked at closely.
- Nothing has been checked on a real phone.
- The earlier Media sets (`cwc-range-2` and the clouds and meadow sets) were all taken at the wrong time of day. The operator's Niederhorn pick was made from 08:30 light.

## Resume here (superseded by the one at the end)

- **Row 23.** A rebake is running in the background: task `b349kp5h1`.
  - Output: `$S/bakes4/niederhorn/terrain.{png,json}`.
  - Log: `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/6a42ab56-838f-4546-83a4-f05667814a49/tasks/b349kp5h1.output`, which prints `wrote …` when done.
  - If it died, rerun: `python3 scripts/bake-terrain.py --site niederhorn --cache $S/tiles --out $S/bakes4/niederhorn` (about 150 s).
- Then:
  1. Copy both files into `static/garden/`.
  2. Render with `node $S/renders/live.cjs <name> / 1440 2026-10-22T15:30:00 sky` (time is now Reno wall time), plus `…T17:55:00`, `2026-01-15T16:40:00` and width 390.
  3. Look at each render, then send them to Media with `ops_send_file`.
  4. Run `npm run check` and `npx vitest run`.
  5. Commit by explicit path: `scripts/bake-terrain.py`, `src/lib/garden/detail.ts`, `src/lib/garden/terrain.ts`, `static/garden/terrain.png`, `static/garden/terrain.json`.
  6. Push with `git -c credential.helper='!gh auth git-credential' push -q https://github.com/cwcorella-git/cwcorella-git.github.io.git main`. If it fails with HTTP 408, retry with `-c http.postBuffer=524288000`.
- `$S` = `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad`. The dev server is on :5191.

## 11. The near shadows barely registered; winter left the meadow green

Row 23 is landed as `eeaf700`. I compared before and after at 15:30 with the same code; only the atlas differed. The near horizon samples (6–40 m) change about 4.7k pixels, so the close swells were already almost flat as baked. Most of the foreground change comes from the blade size and density and from the darkening at the bottom edge, which are not in the atlas. At 17:55 the meadow is still dark brown (average RGB 46,39,28), even with the +0.22 ambient lift.

I re-checked the renders with the corrected clock (Media `cwc-recheck`):
- 10:00 Oct: the sun is in the east and the light is right.
- Jan 15 12:00: there is snow on the peaks and the trees are bare, **but the meadow is summer green**.
- Jan 15 16:40: the alpenglow is right, **but the near blades stay bright green over a dark ground**. Their colour doesn't follow daylight.

| # | item | state |
|---|---|---|
| 23 | foreground depth | **done**: `eeaf700` |
| 24 | meadow follows the season (winter straw or snow, by `snowLineFor`) | **proposed** |
| 25 | painted grass blades dim and warm with daylight / sun colour | **proposed** |

## Open
- Media `cwc-foreground` and `cwc-recheck` are both waiting on the operator.
- Not yet tried on a real phone.

## Resume here (superseded by the one at the end)
Rows 24 and 25 are proposed and not started; the operator chooses. Nothing is running in the background.

## 12. The bright tufts came from plants.ts, lit by a different model

The green blades that glowed at dusk were not in the meadow layer, which is a multiply layer and can't be brighter than the ground under it. They were the animated tufts in `plants.ts`, dimmed by `1 - (alt+6)/12`. That formula gives only about 0.3 at 2° altitude, while the terrain's sun-plus-ambient light is already much darker there.

The fix:
- `terrain.ts` now exports `meadowLight(L)`, built from the same `lightOn` helper that `shade()` uses.
- Tuft colours are multiplied by it.
- `meadowSeason(doy)` turns the meadow albedo and the tuft palette to straw from December to February.

I tuned STRAW once, to [192,160,102]; the first value read as olive.

Both rows landed in a single commit, `7894f78`, because they share `terrain.ts`. That is a change from the plan, which had them as two commits. 331 tests pass. The renders are in Media `cwc-season`.

| # | item | state |
|---|---|---|
| 24 | meadow follows the season | **done**: `7894f78` |
| 25 | grass tufts take the ground's light | **done**: `7894f78` |

## Open
- Media `cwc-foreground`, `cwc-recheck` and `cwc-season` are all waiting on the operator.
- Spring (Mar–Apr) and autumn (Oct–Nov) transitions have not been rendered.
- Not yet tried on a real phone.

## Resume here (superseded by the one at the end)
No rows open. Nothing is running in the background.

## 13. Clouds round three: the shape landed, the rest is planned

The operator chose "Back to the clouds" and then all four directions: shape, weather, sunset light, and movement. The approved plan is in `~/.claude/plans/crystalline-whistling-music.md`, and it starts with what was found:
- every day has the same sky, because `buildScene` uses fixed seeds;
- `renderNoiseCloud` always lights clouds from above (`ly = 1/len`), so a low sun can never light the bases;
- the clouds drift at 6–22 px/min, too slow to see.

Step 1 (shape) is `fae3df1`. It adds two tiers of turrets, a 0.35 grey band at the base and 1.3× erosion on the lit side. At 15:30 the change is visible but modest (`$S/renders/live-c3-shape.png`). It has not been sent to Media, and `timing.cjs` has not been run since the change.

| # | item | state |
|---|---|---|
| 26 | cloud shape: turrets, grey base, crisp lit edge | **done**: `fae3df1` |
| 27 | sunset light from below (`sunAlt` → light direction, swap `lift`, grey-blue sunset `shadow` in `CLOUD_KF`) | **in progress**: only the signature has changed |
| 28 | weather per day (`src/lib/garden/weather.ts`, clear/fair/busy/overcast, `cover` dims the sun) + tests | **proposed** (approved in plan) |
| 29 | movement: 25–60 px/min, a 10–20 min lifecycle for each cloud (grow, fade, reseed), shadows follow | **proposed** (approved in plan) |

## Open
- Media `cwc-foreground`, `cwc-recheck` and `cwc-season` are waiting on the operator.
- The new cloud shape has not been checked for timing and has not been seen on a phone.

## Resume here (superseded by the one at the end)
**Row 27, stopped mid-edit.** In `src/lib/garden/detail.ts`, `renderNoiseCloud` has gained the parameter `sunAlt = 30`; nothing else has changed, and the edit is uncommitted.

Next:
1. Replace `const len = Math.hypot(sunSide * 0.7, 1); const lx…, ly = 1 / len;` with a light angle `e = sunAlt >= 0 ? min(80, sunAlt*3.2) : max(-18, sunAlt*3)` degrees, giving `lx = sunSide*cos e` and `ly = sin e`.
2. Set `under = 1 - smooth(-1, 4, sunAlt)`, swap `lift` by `under`, and scale the grey-base band by `(1 - under)`.
3. In `Garden.svelte`, set the `CLOUD_KF` `alt: 0` shadow to about [120,118,150]. `drawClouds` passes `altDeg` and adds `Math.round(altDeg)` to `colorKey`.
4. Render 17:55 Oct 22 and 16:40 Jan 15, send them to Media `cwc-clouds3`, then commit and push.

After that, rows 28 and 29 in the plan's order. Nothing is running in the background. Main is pushed through `fae3df1`.

## 14. The text was unreadable because its colour came from the sky, not from what was behind it

The operator asked how else the UI could be drawn instead of glass. I mocked four styles on /reading as injected CSS: text on the sky, paper cards, the ground holding the list, and the sky clearing behind it (Media `cwc-ui-styles`). The verdict was "none of these". The operator picked *text on sky · dusk · desktop* as "maybe a baseline", said "the text is unreadable", and asked how to keep the contrast adaptive.

The cause: `--clr-text` is chosen against the garden's **sky bands** (`backdrop.ts`), and before this it always sat on glass. Without the glass, the list lies over the mountains and the meadow, so at dusk dark text lands on dark rock.

The experiment, `$S/renders/adapt.cjs`, uses the same arguments as `live.cjs` plus a variant name: `line|halo|glass|tonal|ribbon`.
- It strips the glass, screenshots the scene with `.inner` and `nav` hidden, and then, for each `.title`, `.meta`, guide letter and nav link, samples the pixels under that text's own box.
- It chooses dark `#141416` or light `#f7f0e2` by the **worst case**: dark text is tested against the 95th-percentile luminance and light text against the 5th.

Five variants went to Media `cwc-ui-contrast` (20 images: noon 12:30 and dusk 18:05, at 1280 and 390):
- **line** on its own fixes dusk. At noon on the phone, the lines that cross the yellow tree are still busy.
- **halo** adds a soft glow in the opposite tone.
- **glass** blurs a row only when that row still fails 4.5:1.
- **tonal** uses the scene's own hue behind the text, pushed to 6:1.
- **ribbon** puts a faint pill behind every line.

What I recommended to the operator: line + halo, with glass as the safety net.

| # | item | state |
|---|---|---|
| 30 | UI without glass: text coloured per line from the pixels behind it (+ halo, glass as a fallback) | **proposed**: waiting on the operator's pick in `cwc-ui-contrast` |

## Open
- Media `cwc-ui-contrast` is waiting on the operator; `cwc-ui-styles` was answered ("none of these").
- Everything in §14 is a **mock**. Nothing is in the repo. A real build has to re-sample when the light changes and when the page scrolls (the list moves over the scene), and it has to read the garden canvases directly, not a screenshot. Its cost is unmeasured, and so is its effect on `contrast.test.ts`, which today checks sky bands only.
- Row 27 is still mid-edit (below). The open items from §13 still stand.

## Resume here (superseded by the one at the end)
**Row 30 waits on `ops_pick cwc-ui-contrast`.** Read it once; do not poll. When the pick arrives, plan the real version: a sampler over the garden canvases in `Garden.svelte`, per-element colour via CSS vars, re-run on relight and scroll; then ask before building.

**Row 27 is unchanged and still stopped mid-edit.** In `src/lib/garden/detail.ts`, `renderNoiseCloud` has gained the parameter `sunAlt = 30`. That is uncommitted.

Next steps for row 27:
1. Replace `const len = Math.hypot(sunSide * 0.7, 1); const lx…, ly = 1 / len;` with a light angle `e = sunAlt >= 0 ? min(80, sunAlt*3.2) : max(-18, sunAlt*3)` degrees, giving `lx = sunSide*cos e` and `ly = sin e`.
2. Set `under = 1 - smooth(-1, 4, sunAlt)`, swap `lift` by `under`, and scale the grey-base band by `(1 - under)`.
3. In `Garden.svelte`, set the `CLOUD_KF` `alt: 0` shadow to about [120,118,150]. `drawClouds` passes `altDeg` and adds `Math.round(altDeg)` to `colorKey`.
4. Render 17:55 Oct 22 and 16:40 Jan 15, send them to Media `cwc-clouds3`, then commit and push.

After that, rows 28 and 29 per `~/.claude/plans/crystalline-whistling-music.md`.

`$S` = `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad`. The mock CSS is in `$S/renders/ui-{sky,paper,ground,clear}.css`. Nothing is running in the background. Main is pushed through `9de37d7`.

## 15. Glass stayed; the light flash was a retired theme's boot script; clouds rows 27–29 landed

| # | item | state |
|---|---|---|
| 27 | sunset light from below | **done**: `e5fd241` |
| 28 | weather per day | **done**: `a65ce91` |
| 29 | movement: drift and form/fade | **done**: `9856965` |
| 30 | UI without glass, text coloured per line | **dropped**: the operator, on the mocks: "i dont like the rounded rows for items. i feel like i'd prefer to go back to the glass background" |
| 31 | glass sliders in admin settings; first paint from the garden's average colour | **done**: `8aaafe5` |
| 32 | site-wide glass: admin 'save for everyone' commits `static/glass.json`, fetched on load; the browser's own settings win | **done**: `792a3f1`. The operator sets the values himself, on the live site |

- **The flash on load did not come from the garden.** `src/app.html` still held the boot script for the six retired palettes, and it fell back to `neutral`, whose `--body-bg` is #d8d8d8. Now `Garden.svelte` saves its average colour (a 16×16 downsample, every 20 s, to `cwc-paint-bg`) and `Sky.svelte` saves its text and glass vars (every 30 s, to `cwc-paint-vars`). `app.html` paints these before anything mounts. When they are more than 2 h old, or missing, it guesses from the hour. Checked on dev with page scripts blocked: the first paint was the saved rgb(109,149,152).
- **The sliders (`src/lib/admin/glassTune.svelte.ts`) multiply Sky.svelte's per-frame alphas**, so the lightFrame contrast floor is still the starting point. Pushing card opacity below 1× can drop the text under 4.5:1, and `contrast.test.ts` does not cover that.
- **Row 28:** the first overcast render looked like bright cumulus banks low in the sky. The deck had to be higher, flatter (squash 0.45), baked in a colour mixed toward `shadow`, and drawn over a grey wash on the sky at 0.9 × `cover`.
- **Row 29:** the cumulus lifecycle (`cloudLife`) reseeds a cloud when its cycle number changes. The drawn x and the shadow jump at that moment, but alpha is 0 then, so nothing visible moves.

## Open

- Media `cwc-clouds3` holds rows 27–29: two sunsets, three weather kinds and the 5-min drift pair. No pick has been read.
- Never measured: `timing.cjs` cloud-bake cost on a throttled phone, now that busy days have up to 11 cumulus and each reseeds every 10–20 min. Only a desktop dev render has been looked at. The phone width has not been looked at.
- Never checked: the drift as actual motion. The only evidence is two still frames.
- **'save for everyone' has never been clicked.** The commit through `commitFiles` is untested. Verified on dev only: a hand-placed `static/glass.json` reached a fresh visitor (blur 9px, card 1.8×), and a browser's own setting overrode it. Not seen on the live site.

## Resume here (superseded by the one at the end)

- **Before any local push, `git pull` first.** 'save for everyone' commits `static/glass.json` to main from the browser, so origin can move ahead of this tree.
- Read `ops_pick cwc-clouds3` once, and act on any notes.
- Nothing is unlanded. Main is pushed through `eefea8f` and the commit after it. The dev server on :5191 runs as a background task of the previous context; if it is gone, restart it with `npx vite dev --port 5191 --strictPort`.
- Next item: none is queued. Wait for the operator's `cwc-clouds3` notes or his glass save.

## 16. The clouds weren't fast; the wrap was moving

The operator wrote: "the clouds are flying by a million miles an hour on the live site." Row 29's speeds are 25–60 px/min. The cause was the wrap: x was taken modulo `W + cache.w·k`, and `k` (form-and-fade growth) changes every frame. The distance travelled since 1970 is about 1e9 px, so a 0.03 px change in the modulus moves the result by hundreds of px. A worked example in node: before the fix, x moved 50 px every 0.25 s, about 200 px/s; after it, about 40 px/min. `driftX()` now wraps over a fixed `W + 2.6·size` span (`d7a9a1f`). A screenshot-diff probe could not show this, because the garden redraws at about 4 fps and the probe read 0 both before and after. It was confirmed only by the arithmetic.

The operator then said the trees "need work". From the render: the pines were a pole with a few lumps ("the small green tree doesn't really seem to fit"), the cottonwoods were rings of yellow balls, and the meadow had bare green fern stalks. The plan was approved as rows 33–35.

| # | item | state |
|---|---|---|
| 32b | clouds wrap over a fixed span | **done**: `d7a9a1f` |
| 33 | Jeffrey pines: clear trunk, spiral limbs, needle tufts (`Foliage.needle`) | **done**: `0798dab` |
| 34 | cottonwood crowns fill in: clumps along the inner limbs, cell 0.09h / fg 12 / bg 15 dpr | **done**: `4f69dc3` |
| 35 | `makeSeedHead` replaces `makeFern`; 24 seed heads, weighted toward the near field | **done**: `ca2bb9e` |
| 36 | tree crowns don't warm at sunset (acid yellow-green at 17:30) | **proposed**: this was true before rows 33–34 too |

The first try at the seed heads was invisible: 1.3 px olive stems on olive grass. They needed width 2.4 and tan panicles.

## Open
- Media `cwc-trees` (before / after at noon / after at 17:30 / phone) has been sent but not read.
- Never measured: tree bake time after rows 33 and 34. The cottonwoods now have many more clump sprites. Throttled-phone timing is still owed from row 29 as well.
- Rows 33–35 are blockout quality. The pine tufts still read a little like cauliflower up close.
- The cloud fix has not been watched as motion on the live site.

## Resume here (superseded by the one at the end)
Read `ops_pick cwc-trees` once and act on the notes. Otherwise take row 36 (crown colour at sunset: `renderClump` mixes `own` toward `sunCol` at only 0.08/0.45; warm it with `golden`). Pull before pushing (`static/glass.json` is committed from the browser).

## 17. A bake was taking most of a second on overcast days

Row 29 recorded the cloud bake as "about 70 ms". The first real measurement (`$S/renders/treetime.cjs`, 4× CPU throttle, 390 px at dpr 2) found 139 ms per cumulus and **869 ms per overcast sheet**. The colour key re-bakes each cloud every whole degree of sun altitude, so an overcast day froze the frame for nearly a second every few minutes. The clouds are soft, so they now bake at `min(0.55, 200/size)` of full size and are scaled up when drawn. That gives cumulus 79 ms and sheets 58–76 ms, and a side-by-side render shows only slightly softer edges. The trees cost about 134 ms in total, mostly from unique clump sprites (75 on the large cottonwood). Clumps now share up to 4 variants per 3 px size bucket, bringing the total to about 100 ms. The measurement rig is noisy (±15 ms between runs on a busy workstation).

| # | item | state |
|---|---|---|
| 36 | crowns and bark take golden-hour light (`ArtLight.warm`) | **done**: `b902e62`; strip in Media `cwc-crowns` |
| 37 | read `cwc-trees` once | **done**: no verdict, read once while planning and once after row 36, not polled further |
| 38 | bake cost: reduced-size cloud bakes, shared clump sprites | **done**: `c810943` |
| 39 | trees still bake all at once (~100 ms, six trees in one frame) | **proposed**: spread the bake over frames as the clouds do, if it shows up as a hitch |

## Open
- The timings are emulated throttling on the workstation, not a real phone.
- The fg/bg trees were timed by proxy (a 380 px `broadleafShape`), not the real `tree.ts` segments.
- `cwc-trees` and `cwc-crowns` have no verdict.

## Resume here (superseded by the one at the end)
Nothing is queued. If the operator leaves notes, read `ops_pick cwc-crowns` / `cwc-trees` once. Pull before pushing.

## 18. Incremental tree bake, the juniper, one crown on the foreground tree

| # | item | state |
|---|---|---|
| 39 | a light-only change re-bakes one tree per frame, then swaps in all at once; geometry changes bake all at once | **done**: `1dda136` |
| 40 | juniper: short trunk, 2–4 twisted stems, scale-leaf stipple (`Foliage.scale`), moved to x 0.93, clear of the far cottonwood | **done**: `bc5925f` |
| 41 | foreground cottonwood forks at 45–55% into 2–3 leaders (a vase shape); the stacked scaffolds are gone; cache key `cwc:fg-tree-v2` | **done**: `0dfced8` |
| 42 | on a phone, midground trees scale by dpr but `generateFgTree`/`generateBgTree` didn't | **done**: `186e04b`. Both trees are generated in CSS px with limbs ×dpr; cache keys are `cwc:fg-tree-v3` and `cwc:tree-v4`. A first-visit foreground tree is still smaller than the 150-yr midground cottonwood, by the growth design |

**Row 39 is unmeasured end to end.** A long-task probe across a 5-minute clock jump (`$S/renders/hitch.cjs`, 4× throttle, phone) swung between 130 and 620 ms with or without the change. The large tasks look like an artefact of `clock.fastForward` firing many timers at once. The claim rests only on the per-job cost: the largest single tree is 43 ms, against about 100 ms for all of them in one frame.

## Open
- Media `cwc-trees`, `cwc-crowns` and `cwc-trees2` have no verdict (`cwc-trees` and `cwc-crowns` each read twice).
- The end-to-end hitch measurement needs a better rig: a real phone, or a trace without `fastForward`.

## Resume here (superseded by the one at the end)
Nothing queued; read the Media groups once if the operator leaves notes. Pull before pushing.

## 19. The operator kept the growth design

When asked whether a first visitor's foreground cottonwood should start out smaller than the 150-year-old midground one, the operator answered "Keep growth as is". The tree starts young and grows with visits. That is a decision, not a bug, so row 42 is not to be reopened on that account.

## Resume here
- **Queue:** nothing is queued. Every row up to 42 is done and pushed; the last code commit is `186e04b`.
- **Media groups:** `cwc-trees`, `cwc-crowns` and `cwc-trees2` have had no verdict.
  - `cwc-trees` and `cwc-crowns` have each been read twice.
  - `cwc-trees2` has never been read.
  - Read each one once, on the operator's /blockout, and never poll.
- **Harnesses** in `/tmp/claude-1000/-home-user-Projects-cwcorella-git-github-io/a292417d-d3e3-4aba-ad17-fa902c0e6aba/scratchpad/renders/`:
  - `live.cjs`: render a page;
  - `treetime.cjs`: time the bakes under throttle;
  - `hitch.cjs`: long tasks. It is noisy and not trusted.
- **Background:** the dev server (`npx vite dev --port 5191`) may still be running from this session. Restart it if it isn't.
- **Before pushing:** pull first, because `static/glass.json` is committed from the browser.
