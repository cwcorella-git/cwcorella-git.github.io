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

## Resume here (superseded by the one at the end, 2026-10-23)
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

## 20. Realism pass (2026-10-23): the operator couldn't tell the renders apart

On /blockout the operator said they couldn't tell which Media render showed which tree, and asked for a realism pass on all the trees. They picked "Do all of these, enter plan mode" for bushes, grass and ground.

**Correction:** I offered "Bushes", but the scene has no bush. The only small plant is the juniper (tree 6), so that row went into row 44.

| # | item | state |
|---|---|---|
| 43 | a labelled key of which tree is which | **done**: Media `cwc-trees-key`. 1 front cottonwood, 2 old cottonwood, 3 pine, 4 young pine, 5 far cottonwood, 6 juniper |
| 44 | trees look more real | **done**: `1c16e62`. Each clump is lit by where it sits in the whole crown: sun side, between, or shade/underside, with the shaded clumps drawn first. Clump edges are more broken up and have more holes. Pines grow flat needle pads that run back to the trunk, have a shorter clear trunk and cinnamon-coloured bark. The juniper is now h 110 (it was 70) |
| 45 | trees at depth | **done**: `796a142`. Each midground tree has a `yf` (how far down the meadow it stands) and is scaled by `1.233/(1.233-yf)`. The front cottonwood is moved to `FG_YF = 0.3` and scaled about its base at bake time (`fgSegs()`), so the cached segments are unchanged. The lean pivot, cast shadow, contact shadow and hit tests all use `fgBaseY()` |
| 46 | grass | **done**: `7589fe6`. Each tuft is 6–14 tapered blades of 3 pieces, drawn as filled quads with a darker base and lighter tip. There are 150 tufts (90 on a phone). The 18 seed heads use darker straw colours and grow in 4 patches |
| 47 | ground | **done**: `f58cd5b`. Bare-soil patches in the near field and 4 rocks, baked into the meadow's multiply layer |

**Phone bake time** (390 px, 4× throttle, `treetime.cjs`): the biggest single job is the foreground stand-in at 41 ms, which meets the 45 ms target.

**Not done, and never verified:**
- Wildflowers from the plan were skipped. The meadow is a multiply layer, so it can't add bright colour; flowers would need a separate pass that draws on top.
- Haze on the far trees was skipped; they still use the shared 0.92 alpha.
- The seed heads are still hard to see in the render.
- The rocks only darken the ground (multiply), so their lit tops are just "less dark".
- **Phone layout:** at 390 px the front tree now overlaps the midground ones. I saw this in the phone render and did not rearrange anything.

**Media awaiting a verdict:** `cwc-real-44` (before and after), `cwc-real-45`, `cwc-real-47`. Read each once, only when the operator taps /blockout.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–47 are done and pushed (last commit `f58cd5b`).
- The next step depends on the operator's Media verdicts. The proposed follow-ups are wildflowers as a separate pass, haze on the far trees, and the phone overlap.
- Pull before pushing (`static/glass.json` is committed from the browser).

## 21. Phone overlap, wildflowers, bolder seed heads (rows 48–50)

| # | item | state |
|---|---|---|
| 48 | on a phone, tree 1 covered trees 2 and 3 | **done**: `06d5b7b`. Below 700 CSS px the tree stands at 0.18W (it was 0.28W) and at `yf` 0.22 (it was 0.3). Every use goes through `fgBaseX()` / `fgYf()`; `fgSegs` shifts the tree.ts geometry from its 0.28W origin |
| 49 | wildflowers | **done**: `c3ff3d0`. `makeFlowers` in `detail.ts` places 160 specks in 6 drifts (mule's ears, lupine, yarrow, globemallow). Each is 0.45–0.95 × depth × dpr, capped at 2.6·dpr, and lit by `tuftLight`. `drawFlowers` draws them over the meadow. `flowerBloom(doy)` ramps them in from day 110 to 140 and out from day 200 to 258, so none show in October. Checked by eye in a 2026-06-01 render; the first try drew the near ones up to about 12 px, which looked like balloons |
| 50 | seed heads hard to see | **done**: `297e4a6`. Stem 3.2 (it was 2.4), with a darker base `#6e6a3c`. Spikelets 2.4 / 1.8, with 7–10 per piece. 24 seed heads in 4 patches, ×(60–110) tall |

**Not checked:** a phone at dusk, and how the flowers look at night (they are dimmed through `tuftLight`).

**Media awaiting a verdict:** `cwc-real-48`, `cwc-real-49`, `cwc-real-50`, plus the three from §20.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–50 are done and pushed.
- Next steps come from the operator's Media verdicts. The far-tree haze from §20 is still unbuilt.
- Pull before pushing.

## 22. Haze on the far trees (row 51)

| # | item | state |
|---|---|---|
| 51 | far trees fade toward the horizon | **done**: `02f3c1c`. `ArtLight` gained `haze` (from `getSkyColors(altDeg).horizon`) and `hazeK`. Every foliage and bark colour is mixed toward the haze. Midground trees use `hazeK = 0.3·(1 − yf/0.15)`; the far cottonwood uses 0.35. Checked by eye at 12:30 and 17:30. The old cottonwood (tree 2, yf 0.03) fades noticeably too |

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–51 are done and pushed.
- Seven Media groups have no verdict: `cwc-trees-key`, and `cwc-real-44`, `-45`, `-47`, `-48`, `-49`, `-50`. Read each once, only when the operator taps /blockout.
- Pull before pushing.

## 23. The operator: pine and juniper foliage didn't convince (row 52)

| # | item | state |
|---|---|---|
| 52 | pine and juniper leaf layout | **done**: `ef449b6`. **Pine:** each clump is now 6–9 brushy needle clusters fanning up and out, lower ones drawn first, with a drooping dark underside; the lit colour is only a sprinkle on the upper sun side. The pale-lidded saucers are gone. **Juniper:** one dense mass of small overlapping scale specks inside a ragged noise edge, dark olive `[60,78,52]` (it was blue-green), with clumps ×1.35 so they run together. Conifers get a smaller shade/sun split and only a little of the evening purple |

**What was really wrong:** the juniper and the young pine looked washed out at 17:30, and the tree colours weren't the cause. `drawHorizonBlend` ran after the trees and painted sky colour over the band they stand in. It now runs before them, since the trees carry their own haze (row 51).

**Still not done:**
- Pine 4 still fades strongly toward the bright horizon at dusk (hazeK 0.3).
- The tall pine (3) has bare limbs on one side.
- Not looked at at night.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–52 are done and pushed.
- Media verdicts are open for `cwc-trees-key` and `cwc-real-44`…`-52`.
- Pull before pushing.

## 24. Rebuilt from real photos: "the leaves are just ellipses" (rows 53–56)

The operator said the pine and juniper leaf layouts weren't convincing, the leaves looked like "just ellipses", and asked for real-world references. Reference photos from Wikimedia Commons:
- **Jeffrey pine:** *Mature Jeffrey Pine*, *Pinus jeffreyi LassenCA2*, *Mono Lake 02*.
- **Juniper:** *J. occidentalis australis old tree*, *J. occidentalis on Lassen*.
- **Sagebrush:** *Mountain Big Sagebrush and Western Juniper Zone*.
- **Cottonwood:** *Frémont's cottonwoods at Cottonwood Springs*, *Populus fremontii 50D 4686*.

They are saved in the session scratchpad, `refs/`, and the side-by-side sheets went to Media (`cwc-ref-53`, `-53b`, `-54`, `-55`).

**What was really wrong:** every crown was many similar small clumps, each drawn as nested dark, mid and light blobs. That gave each clump an outline and a bright core, which reads as an ellipse. Two later attempts failed the same way:
- **Needle tufts in nested layers** turned each tuft into a broad "leaf".
- **Drawing every leaf separately** (thousands per lobe) looked right, but cost about 1.9 s for the front tree on a 4×-throttled phone.

**What works:** each crown is a few big lobes with a noisy outline. Each lobe is filled with a baked texture tile (leaf, scale or needle marks), shaded across itself and by where it sits in the crown, with single marks only along its edge. The tile is coloured at the middle tone and the crown-level tone goes on as a wash, so a tree needs about two tiles.

| # | item | state |
|---|---|---|
| 53 | Jeffrey pine | **done**: `a971fb5`, then the needle tile in `a647e03`. Narrow crown (half-width at most about 0.19h), 18–24 short limbs with 2–4 twigs each, tufts 0.06–0.09h, clear trunk 28–34%, plated cinnamon bark, foliage `[56,80,42]` |
| 54 | western juniper | **done**: `a647e03`. A thick kinked trunk with fibrous red-brown strips; 2–3 upright twisting leaders; foliage only on the upper leaders, on an h·0.12 grid; gold-green lit tops (`Foliage.tip`); h 140 |
| 55 | Fremont cottonwood | **done**: `a647e03`. Lobes on grids of h·0.16 (midground) and 22/26·dpr (front and far); leaf-tile texture; gentler taper (0.86) to soften steps in the trunk. I tried rounded joints, but they made the trunk look like a string of beads |
| 56 | big sagebrush | **done**: `459c2f1`. `sageShape` and `SAGE_FOLIAGE` (`[106,116,90]`, tip `[170,178,158]`); 13 shrubs (8 on a phone), seeded; baked as 2 jobs (behind and in front of tree 1), with contact shadows in the trunk layer. They are lit by the meadow's light (`tuftLight`), because with the tree light they glowed white at dusk |

**Phone bake** (`treetime.cjs 390`, 4× throttle): front stand-in 49 ms, midground cottonwood 41, pine 41, juniper 26. The largest is still a little over the 45 ms target. `treetime.cjs` does not include the two sagebrush jobs; they are **unmeasured**.

**Not checked:**
- Night.
- Spring and summer foliage colours under the new tiles.
- Bare winter cottonwoods: `amount` scales the tile density, but I didn't render them.
- Sagebrush at dusk reads a little blue-grey.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–56 are done and pushed.
- Media verdicts are open: `cwc-ref-53b`, `-54`, `-55`, `-56` and the earlier `cwc-real-*` groups. Read each once, only on /blockout.
- Pull before pushing.

## 25. Seasons under the new textures (row 57)

| # | item | state |
|---|---|---|
| 57 | spring, summer, leaf fall, winter | **done**: `c7fc80a`. Renders for 04-20, 07-01, 11-15 and 01-15 at 12:30. Spring and summer read well as they were. **Winter:** the bare cottonwoods were a few skeletal limbs; each lobe now draws a grey twig network (4 levels of branching), fading in as the leaves fall (`bare = (1 − amount)·1.3`). **Leaf fall:** at amount ≈ 0.5 (mid-November) the crown still looked full. The tile density now follows amount², and the number of sky holes rises with 1 − amount; renders for 11-08, 11-15 and 11-22 show the crown thinning |

**Not checked:** night, and the juniper and sagebrush under snow (no snow is drawn on plants).

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–57 are done and pushed.
- Media verdicts are open (`cwc-ref-*`, `cwc-real-*`). Read each once, only on /blockout.
- Pull before pushing.

## 26. "The taller grass doesn't blend" (row 58)

| # | item | state |
|---|---|---|
| 58 | tall grass stands out from the meadow | **done**: `c36920a`. **Cause:** the spring-physics tufts and seed heads used their own palette (`GRASS_PALETTE`, seasoned by `litColor`), while the meadow under them is the relit terrain multiplied by the meadow layer, a warmer olive-straw. Each tuft read as a pasted-on green fan. **Fix:** `sampleGround()` in `Garden.svelte` copies the drawn ground (after `drawMeadow`, before flowers and cloud shadows) into a 64×32 canvas once per half-degree of sun, and `setPlantGround()` stores the colour at each plant's foot. `drawSeg` colours each piece as ground × (palette / REF)^0.8, so the palette only sets darker base / lighter tip. Checked at 12:30, 17:30, July and on a phone |

**Seen while checking, not fixed:** on a phone the rocks read as mushroom caps, because of the pale top ellipse in `renderMeadow`.

**Cost:** one `getImageData` of 64×32 per half-degree. That forces a GPU read-back, which I haven't measured on a phone.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–58 are done and pushed.
- Open, proposed: the rock tops; night; snow on plants.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 27. Rocks were mushroom caps (row 59)

| # | item | state |
|---|---|---|
| 59 | rocks | **done**: `905b445`. **Cause:** the rocks were drawn in the meadow's multiply layer as a dome with a wide dark ellipse under it and a pale oval on top. Multiply can only darken, so the "lit top" was never lighter than the grass, and the shape read as a mushroom. **Fix:** `renderRocks()` in `detail.ts` gets its own normal-blended layer. Each rock is a 7-point angular outline, flat where it meets the ground, with a lit facet toward the sun, a darker body, lichen flecks, a thin contact shadow, and grass blades in the meadow's colour over its foot. It is re-baked with the grass colour sample (once per half-degree) and lit by `tuftLight`. Checked on a phone, at 2× and at 17:30 |

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–59 are done and pushed.
- Open, proposed: night; snow on plants.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 28. Night and twilight (row 60)

| # | item | state |
|---|---|---|
| 60 | the garden after dark | **done**: `7c737cd`. Renders at 17:30, 17:50, 18:05, 18:20, 19:30 and 23:00. Full night (19:30, 23:00) already read correctly: silhouettes under stars. **Twilight was wrong:** at 18:20 (sun about −3°) the cottonwoods glowed gold over near-black ground, because the tree light `dl = (alt+6)/12` was still 0.25. `tuftLight` couldn't fix it, since it reads about 0.5 there (sky ambient). Measured ground luma against midday was 0.35 at 17:50, 0.20 at 18:05 and 0.14 at 18:20. `sampleGround` now also records `groundLum` (mean luma ÷ 140). Tree `dl` is capped at `groundLum·1.2`, with the cap fading in from +2° to −2°, so golden hour (17:30) keeps its sunlit crowns and a dull midday ground never dims the trees. Sagebrush uses `groundLum·1.1` below 8° |

**Seen, not fixed:** at 18:05 the sagebrush shows as pale patches, probably the 0.08 haze toward a bright twilight horizon.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–60 are done and pushed.
- Open, proposed: sagebrush at twilight; snow on plants.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 29. Sagebrush at dusk (row 61)

| # | item | state |
|---|---|---|
| 61 | sagebrush as pale patches at dusk | **done**: `5353f26`. Sagebrush is now coloured from the meadow sample, the same way the grass is. `sageFoliage(groundMid)` gives a mid tone of about ground × [0.95, 0.98, 1.2], pulled 45% toward grey, with silvery tips. It is baked under `NEUTRAL_LIGHT` with its "sun" set to the ground ×1.3. Rocks now scale `tuftLight` to `groundLum` as the sun sets, fading in from +2° to −2°, like the trees. Checked at 12:30, 17:30 and 18:05 |

**Three attempts that failed first:**
1. **Tree light with a cap to `groundLum`:** black blobs at 17:30.
2. **A multiply layer (colours as ratios of the ground):** consistent at every hour, but see-through, with the stems showing as dark sticks, and multiply can never be as light as the photo's sagebrush.
3. **Neutral light with a white "sun":** the renderer's lit mix toward sunCol swamped a dark dusk ground and made pale ghosts.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–61 are done and pushed.
- Open, proposed: snow on plants.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 30. Snow days (row 62)

The operator was offered "snow on plants" and chose **"Add snow days"**. Snow on plants alone didn't make sense: the meadow never had snow, because the snow line is a height in metres that only the mountains reach.

| # | item | state |
|---|---|---|
| 62 | snow days | **done**: `5f943d1`. **Weather (`weather.ts`):** `snowChance(month)` (Jan 0.10, Feb 0.08, Mar 0.05, Apr 0.015, Nov 0.02, Dec 0.07), `snowFell(d)` seeded by date, and `snowCover(d)` = 1, 0.6, 0.2 over the day it falls and the two after. A snowfall day is overcast. Tests: snow only in the cold months, 4–16 days a winter, the melt curve. **Meadow:** `renderSnow` in `detail.ts` is patchy fbm drifts that open up as it melts, with fine gaps and a little sky blue far off. It is drawn after `sampleGround`, so the tall grass keeps its straw colour and pokes through. **Distant rise:** `TerrainLight.valleySnow` adds snow only to terrain rows above `nrowTop` (meadow pixels, plus lightly on low slopes). **Rocks:** a snow cap. **Conifers, juniper and sagebrush:** snow lumps on the upper part of each lobe, reaching lower the deeper the snow. **Limbs** that lie closer to level than upright get snow along their top edge. **Snow colour:** the rock light, two-thirds desaturated, because the full sky tint read cyan. Checked 2026-12-13, -14 and -15 at 12:30 |

**Not checked:** snow at dusk and at night, and on a phone. The speckle on the distant rise when partly melted comes from the terrain's grain noise.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–62 are done and pushed.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 31. Snow at dusk, at night and on a phone (row 63)

| # | item | state |
|---|---|---|
| 63 | snow at dusk, at night and on a phone | **done**: `b07efb0`. The phone at 12:30 already read correctly. After sunset the snowy meadow went as dark as bare ground, because its light was scaled to the measured ground brightness. Real snow keeps a pale blue-grey from sky and moon light, so the snow light now has a cool floor of `[0.2, 0.23, 0.32]`, fading in from +1° to −5°. Checked 2026-12-14 at 16:30, 16:55, 17:15 and 19:30 |

**Seen, not fixed:** the snow on the distant rise (terrain, row 62) still darkens with the terrain light after sunset, so it is darker than the near snow.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–63 are done and pushed.
- Open, proposed: snow on the distant rise at night.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 32. Distant snow at night (row 64)

| # | item | state |
|---|---|---|
| 64 | the distant rise's snow went dark after sunset | **done**: `58966d3`. `relightTerrain` gives valley-snow pixels the same cool night floor as the near snow (`[0.2, 0.23, 0.32]·238`, scaled by how much snow lies there and fading in from +1° to −5°). **First attempt:** the floor speckled the whole mountain range at night, because the valley-snow pass covered every row above the horizon. It is now limited to below the forest line (`1 − sm(f0−150, f0+100, e)`). Checked at 12:30, 16:55 and 19:30 on 2026-12-14 |

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–64 are done and pushed.
- Media verdicts are open. Read each once, only on /blockout.
- Pull before pushing.

## 33. Media picks read, and mountain snow at night (row 65)

**Media picks**, read once at the operator's request: of the garden groups, only `cwc-real-44` has a pick, "after" (crown light and pine pads), which was already shipped and later superseded by the rebuild from photos. None of the other `cwc-real-*` or `cwc-ref-*` groups have a pick. Most are single images, which may not register as a choice.

| # | item | state |
|---|---|---|
| 65 | peak snow went dark after sunset | **done**: `3101b1c`. The snow-line snow (`peakSnow`) gets the same night floor as the valley snow, ×0.8. **First attempt:** the range flattened into one pale slab. The floor is now scaled by `0.35 + 0.65·nz²`, so snow facing the sky is brightest and the relief stays. Checked on 2026-12-20 at 16:55 and 19:30, and on 2026-10-23 at 19:30 |

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–65 are done and pushed.
- Pull before pushing.

## 34. The night sky, from the real sky (rows 66–72, 2026-10-23)

**What was wrong:** 700 stars with a uniform spread of magnitudes, 67% of them gold or orange (the `SPECTRAL` weights followed star counts, not what the eye sees), and the Milky Way was 200 circles at 10% alpha that read as grey rings. Clouds faded to nothing below −14°, so the night sky never had any. The moon was always drawn opposite the sun with a phase from a fixed epoch, so a new moon showed as a crescent at midnight.

**"The slow night" was frame pacing, not a regression.** On a phone slowed 4×, night frames took 139 ms against 16 ms by day before any of this work. The CPU profile was mostly idle, and hiding the canvas or the glass blur changed nothing. `draw()` redraws every 2nd frame at night against every 15th by day, so the same full-screen draw was paid 7.5× as often.

| # | item | state |
|---|---|---|
| 66 | realistic starfield | **done**: `d455970`. New `src/lib/garden/stars.ts`. Magnitudes follow the sky's counts (2.8× more per fainter magnitude). Tints are mostly white, and colour shows only on bright stars. The Milky Way is a noisy band with a dark rift. Stars fade with extinction near the horizon and twinkle more the lower they are |
| 67 | the sky turns | **done**: `021cea4`. The garden faces north (sunrise is on the right), so the stars circle a pole at 39.5° altitude, counter-clockwise, at local sidereal time (`siderealDeg`). The Milky Way glow is the real galactic plane (galactic north pole RA 192.86°, dec 27.13°), baked once as a square around the pole and rotated. The faint stars are repainted when the edge has moved 0.5 px. `stars.test.ts` has 5 tests |
| 68 | clouds hide stars | **done**: `649201b`. Clouds stay at night (`cloudAlpha = 1`) in their deep-night colours. Stars go to `starLayer`, and each cloud's bake is cut out of it (`destination-out`). Cloud placement is shared through `cloudRect` |
| 69 | moonlight | **done**: `649201b`. `moonState().light` dims the band and faint layer by 0.8·light and the bright stars by 0.35·light, plus a radial glare around the moon |
| 70 | pace the night | **done**: `4c24029`. Night skip 2 → 4. On a phone slowed 4×, the median frame interval went from 152 ms to 16 ms. Per draw it is still about 180 ms in headless Chrome, whose canvas runs in software, so that number says nothing about a real phone's GPU |
| 71 | the real moon | **done**: `4dcc5b0`. New `src/lib/garden/moon.ts` gives the real position, a few terms from Meeus ch. 47, good to about a degree. x follows the moon's own rise→set arc (like `sunXNorm`), it is hidden below the horizon, and the phase comes from elongation. The lit limb is to the west while waxing and the terminator is an ellipse. The dark side is drawn and hides stars. `moon.test.ts` has 4 tests. Checked: full moon 2026-10-26 22:30; new moon 2026-11-10 22:30 (down, band full); crescent 2026-11-13 17:40 (just above the ridge, low left) |
| 72 | star cost | **done**: `8fe4204`. When there is no cloud and no glare, the stars go straight to the canvas without the layer. The renders match (mean difference 0.01, from twinkle) |

**Never verified:** the per-draw cost on a real phone. The 180 ms is headless software canvas. A 2.5-day crescent on 2026-11-12 at 18:00 sits 8.8° up, which maps behind the ridge, so young crescents are often hidden. The moon is R = 11 physical px, so on a phone (dpr 2) it is small. The moon's screen position and the starfield's north-facing rotation use different projections: the stars circle a pole, while the moon moves along a panorama arc like the sun.

**Seen, not fixed:** now that clouds stay at night, some cloud bakes show flat, boxy edges (a small one on 2026-10-26 at 22:30, at the top centre), which day light used to hide.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–72 are done and pushed.
- Media groups `cwc-stars-66` and `cwc-stars-69` have no verdict yet; read them once with `ops_pick`, do not poll.
- **Proposed:** fix the boxy night cloud edges (see §34).
- Pull before pushing.

## 35. Night clouds: boxy bases, then moonlight (rows 73–74)

**Boxy clouds weren't a clipped bake.** Of 320 test bakes (four aspects, day and night light), none reached the edge of its canvas. The shape caused it: puff centres sat 0.45–0.8 r above the flat base, so a puff's widest point met the base and its side fell straight down. Daylight shading hid that; the flat night colour shows it.

| # | item | state |
|---|---|---|
| 73 | boxy cloud bases | **done**: `970138d`. Puff centres are now 0.68–0.98 r above the base, so the base is narrower than the body and the sides curve in under it. Checked the night of 2026-10-26, dusk on 10-22 and noon; noon clouds look about the same |
| 74 | shade night clouds | **done**: `038751c`. At night (sun below −8°, blending in to −14°) the cloud colours come from the moon. Lit (`moonState().light`·1.6): tops `[132,140,162]`, shadow `[40,46,68]`, lit from the moon's side at its altitude. Moonless: `[54,56,68]` / `[24,26,38]`, with the bake's under-lighting (bases lit from below by the town). `moonState` now also returns `alt`. Checked: full moon 2026-10-25 at 22:30, and no moon 2026-11-04 at 22:30 |

**Seen, not fixed:** faint far clouds (low alpha) only partly cut the stars, so on moonless nights the Milky Way shows through them faintly. The moon is still 11 physical px, about 5 css px on a phone.

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–74 are done and pushed (last code commit `038751c`).
- **Proposed:** far clouds hiding the stars fully; a bigger moon on phones (§35).
- Media groups `cwc-stars-66` and `cwc-stars-69` have no verdict yet; read them once with `ops_pick`, do not poll.
- Pull before pushing.

## 36. A tuner, a clock, and clouds that were stretched (rows 75–78, 2026-10-23)

The operator reviewed the scene: clouds see-through and plain, light good. They asked for saved toggles and sliders on every element, settings for the adaptive text, and simulated time of day and season, to tune the feel themselves.

**The clouds were plain because they were small.** Every bake was capped at 200 px and stretched to size, because a whole bake in one frame cost ~70 ms on a slow phone. Cumulus were drawn at alpha `0.3 + alpha`, which left far ones see-through, and every cloud was the same heap. The fix that unlocks the rest: bakes now run in slices, 6 ms per animation frame (drawn or skipped), and the old bake stays on screen until the new one is done. Day frames on a 4×-throttled phone: median 16 ms, p90 19 ms.

| # | item | state |
|---|---|---|
| 75 | scene tuner and simulated clock | **done**: `c9e7355`. `src/lib/admin/sceneTune.svelte.ts` follows glassTune's pattern: defaults, then `static/scene.json` (save for everyone), then localStorage. It has ~23 on/off switches and sliders for clouds, night sky, wind, grain, vignette and fps. The text settings are: contrast floor (never below 4.5, enforced in `cleanScene`), the glass alphas before thickening, size, weight and halo. `lightFrame` takes them as an optional `FrameTune`, so the defaults are unchanged and `contrast.test.ts` stays green. `src/lib/garden/clock.svelte.ts` gives `sceneNow()`, which replaces every scene-time `Date` in Garden and Sky. It lives in sessionStorage only, so visitors see real time. The paint-replay caches skip simulated moments. Presets come from stepping the real sun and moon: dawn … night, full moon (high), new moon, snow day. There are also speeds (pause to 1 h/s) and a forced weather (`weatherForced`). `ScenePanel.svelte` sits at the layout level, opened by "✦ scene" in the admin toolbar. It stays open while you look, has "hide page", and double-click resets a slider. `clock.test.ts` has 8 tests |
| 76 | cloud overhaul | **done**: `0e29db6`. `bakeNoiseCloud` is a generator, pumped by `pumpBakes()` each frame. The bake cap is 320 px × detail. Each cloud has a seeded form (`cloudForm`): heap, tower, flat or broken. There are flank puffs, a fine edge-noise layer (× `cloudEdge`, acting only near the outline) and a darker band along the base. The canvas is sized from the puffs, because towers clipped at the top in 5% of bakes at a fixed height; now 0 of 600. Cumulus cores are drawn solid (`0.45 + 1.1·alpha`). Cirrus curve and have fall-streak tails. A re-formed cumulus restarts its bake (the key includes `prngseed`), so a stale bake can't install the old shape |
| 77 | weaker elements | **done (part)**: `1d96c10`. Moonlight on the land: the range is lit from the moon's position and altitude (cool, `dl` ≥ 0.3·m) and keeps its relief, and night silhouettes lift toward cool tones by `landMoon()`, which you can tune with the "moonlight" slider. **The ground texture was not changed:** the noon renders already show grass strokes in the near band, so the plan's claim that "the near band reads flat" did not hold |
| 78 | session doc | **done**: this section |

**A box in the sky that wasn't a bug.** At golden hour on 10-23 a faint rectangle showed at upper left. Turning layers off one at a time pinned it to one cumulus (cloud 12): a large heap frozen partway through its fade-in, because the sim clock was paused, with its flat base reading as a box at low alpha. The bake itself is fine. Cumulus fade in and out as a whole; real cumulus grow from wisps. That is listed below, not fixed.

## Open
- **Never seen by the operator:** the tuner, the clock and the new clouds were checked only in headless Chromium renders (Media `row-76-*`, `row-77-*`). "Save for everyone" was never run; it uses the same `commitFiles` path as the glass.
- **Proposed:** cumulus form by growing from wisps instead of fading as a whole; towers still read a little blocky; midground trees blend into the range on moonlit nights; far clouds hiding the stars fully; a bigger moon on phones (§35); vertical seams between puffs show as faint stripes inside clouds at high sun.
- The moon (panorama arc) and the stars (polar rotation) still use different projections (§34).

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–78 are done and pushed (last code commit `1d96c10`).
- **Proposed:** see §36 Open.
- Dev-only hook: `window.__clouds` (Garden.svelte, `import.meta.env.DEV`) lets render probes reach the cloud list. Render scripts: `$S/renders/sim.cjs <name> <width> <local ISO> <weather> [tune JSON]` uses the sim clock; `forms.cjs` draws a sheet of cloud forms.
- Media groups `cwc-stars-66` and `cwc-stars-69` have no verdict yet; read them once with `ops_pick`, do not poll.
- Pull before pushing (`glass.json` and `scene.json` are committed from the browser).

## 37. Distance had been drawn as transparency (rows 79–82)

After row 76 the operator wrote: "clouds are still semi-transparent. you can see clouds behind clouds. we need a type of transparency but not like that. clouds already interact with light somehow, why can't we improve the look?" Three causes:
- **Distance drawn as transparency.** `cloud.alpha` falls with distance and was a draw-alpha factor (`0.45 + 1.1·alpha`, ~65% opaque far away). The bake also took `1 − 0.3·haze` off its alpha. Real far clouds are opaque; distance only moves their colour toward the sky.
- **Whole-cloud fade.** A cumulus's life faded the whole thing, so a forming cloud was a ghost of a full one.
- **Random draw order.**

| # | item | state |
|---|---|---|
| 79 | opaque bodies, depth by colour | **done**: `7437bae`. The bake's alpha is the density alone, and haze is a colour blend toward the sky at the cloud's height (`CloudEnv.sky`, from `getSkyColors` mid→horizon by `yFrac`). Cumulus draw at alpha 1 (× the tuner's opacity); sheets stay translucent. Cumulus are sorted far to near in `buildClouds`. Star cut-outs use the same alpha, so clouds now hide the stars fully (closes that §35 proposal) |
| 80 | better light | **done**: `7437bae`. Each sample carries the soft-blended normal of the puffs it lies in (weights `exp(9q)`) plus noise, so every lobe is lit as a sphere (`lz` 0.45 toward the viewer). Creases where two puffs meet are softly shaded. The march is longer (8 steps to 0.45·size, `exp(−4·acc)`) with a multi-scatter floor. Tops face-up take sky light (`zenith`) and bases take ground bounce (`groundMid`). The silver lining is scaled by `backlit`, strong only with the sun low. A first try with hard per-puff normals looked like bubbles, which led to the soft blend |
| 81 | clouds that grow | **done**: `7437bae`. The bake's alpha channel holds density/0.6, made ragged with noise inside the body only. `cloudAlphaLUT(g)` thresholds it, so a forming cloud starts as torn tufts from its densest cores and dissolves from the edges in. `grownImage()` caches one canvas per 1/24 of growth. The tuner's "clouds grow" turns it off (the old fade). `renderNoiseCloud` applies the full-growth LUT for callers that want a finished cloud |
| 82 | night leftovers | **done**: `7437bae`. The moon is 9 css px in radius on narrow screens (was 11 physical px, ~5 css). By moonlight the midground trees' haze is ×(1 − 0.6·m), so they no longer melt into the range |

**Cost:** day and night median frame intervals are both 16 ms on a 4×-throttled phone. The night p90 of 153 ms is a full redraw in headless software canvas (§34), not the bake.

## Open
- **Never seen by the operator on a real screen.** All of this was checked in headless renders (Media: one cloud close up, growth strip, sunset, phone moon).
- Towers still lean blocky. The growth's first tufts can look like scattered dots for a moment.
- Sheets (overcast decks) did not get the lobe shading's attention; they use the same bake but are squashed and translucent.
- The moon and stars still use different projections (§34).

## Resume here (superseded by the one at the end)
- Nothing is queued. Rows 43–82 are done and pushed (last code commit `7437bae`).
- The operator said they will tune with the scene panel first; wait for their notes.
- Render tools in `$S/renders/`: `sim.cjs` (scene at a sim moment, weather, tune), `big.cjs` (one cloud close up, noon and sunset), `grow.cjs` (growth strip), `forms.cjs`, `clip.cjs` (bake edge clipping), `frametime.cjs`.
- Pull before pushing (`glass.json` and `scene.json` are committed from the browser).

## 38. The rough spots from §37 (row 83)

| # | item | state |
|---|---|---|
| 83 | rough spots | **done**: `88b7257`. **Towers:** each tier is pulled in toward the axis (×0.72 − 0.08·tier), with a bulge on each flank a little below it, so they taper like a building cumulus instead of standing as blocks. **Early growth:** `cloudAlphaLUT` has a ramp width of 0.12 + 0.3·(1−g) and alpha × (0.35 + 0.65·smooth(0, 0.35, g)), so young clouds condense out of faint, soft wisps rather than appearing as dots. **Overcast:** cumulus tops are pulled toward their shadow colour by cover (no direct sun under a deck), and the deck has ~1.8× the sheets, so it spans the drift loop and covers the sky instead of a few blobs |

Checked in headless renders only: the forms sheet, a growth strip at 8/15/25/40/65/100%, and an overcast noon on 2026-10-23. A young cloud is translucent while it forms. That is deliberate, and the only transparency left on cumulus bodies.

## Resume here
- Nothing is queued. Rows 43–83 are done and pushed.
- The operator will tune with the scene panel; wait for their notes.
- Render tools in `$S/renders/`: `sim.cjs`, `big.cjs`, `grow.cjs`, `forms.cjs`, `clip.cjs`, `frametime.cjs`.
- Pull before pushing (`glass.json` and `scene.json` are committed from the browser).
