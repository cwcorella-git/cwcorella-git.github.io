# 2026-11-25 — The mountains were squeezed by a cap and the mirror lost a race

Started as "find the saved-links app and make it public". It became a public `/resources`
page, a design for signing in with Veritable Games, a garden resize fix (two causes), and a
repaired archive-mirror deploy. Spec for the unbuilt part:
`docs/superpowers/specs/2026-11-25-vg-auth-bridge-and-public-links.md`.

| # | item | state |
|---|---|---|
| 1 | Locate saved-links; explain the login | **done**: `~/Projects/apps/saved-links` (project name what-is-it); login is three separate secrets in `localStorage` (content key, PAT, library token) |
| 2 | VG auth bridge | **proposed, design only**: `10e7e97`. Not built. Operator chose "design only" |
| 3 | `public` flag + verify gates + `mark_public.py` (saved-links) | **done**: saved-links `afc7c2b` (local repo, no remote) |
| 4 | Exporter with leak gates, 11 unit tests | **done**: `92c9993` |
| 5 | Public `/resources` page, nav entry | **done**: `1e99df9` |
| 6 | Mark clusters public: seed set (76), edge-security + privacy-opsec, then ai-tooling, 3d-mocap, governance-funding, dev-misc, hardware-field | **done**: saved-links `49e3f22`, `f58a011`, `08ee9f0`; site `835f5a3`, `b46bcdc` |
| 7 | Data-broker entries kept private (operator: "you keep asking") | **done**: saved-links `a0af973`; site `2524d32` |
| 8 | Personal gear and dead-link entries pulled from the public set | **done**: saved-links `ecaca8d` |
| 9 | Mountains squashed at half screen | **done**: `bc6f8eb`. Live-checked at 1920x1080 vs 960x1080 |
| 10 | Resize blank sky and vanishing clouds | **done**: `bc6f8eb` |
| 11 | Rebuild the garden over several frames after a resize | **done**: `042dcb5`. Timed only in software-rendered Chromium |
| 12 | GitHub Pages mirror deploy failing | **done**: `0046a6f`. Three green runs since; cause is a best fit, not proven |
| 13 | Jump-to list on `/resources` | **done**: `d3cd723` |
| 14 | civic-reno cluster (26) | **left private** on judgement; operator has not ruled |
| 15 | Archive mirror (`scripts/build-archive.mjs`) does not list `/resources` | **proposed** |
| 16 | Sign in with VG | **blocked** on the open questions in the spec (see Open) |

## 1. The mountains were squeezed by a cap, not by the stretch the operator described

The operator saw the background "stretch and squash" between full screen, half screen and
mobile. The first guess was the canvas being CSS-stretched. It is not: the canvas is sized to
`innerWidth*dpr` and CSS size matches. The squash was in `drawRealTerrain`
(`src/lib/components/Garden.svelte`): the panorama slice was `min(total, 4·W·frame/ph)`, a
cap of 4x vertical exaggeration. The panorama is 140° wide and 11° tall, so a 16:9 window
needs only 1.74x to show it all. A half-width window therefore drew it at 3.49x and a phone at
the 4x cap. Peaks twice as steep, and the meadow below the horizon (same column span)
half as wide, while the trees scaled with height only and never changed. Now
`TERRAIN_EXAGGERATION = 1.75`: narrower windows show a narrower slice. Ultrawide windows
still stretch horizontally because the panorama cannot cover more than its 140°.

## 2. "Takes a moment to adapt" was three separate things

- **The sky went blank.** By day `draw()` runs one frame in 15. A resize assigns
  `canvas.width`, which clears the canvas, so nothing repainted for up to ~250 ms. Measured by
  probing a pixel each frame: alpha 0 from 0 to ~300 ms after the resize. `forceDraw` fixes it.
- **Every resize threw away the clouds.** `buildScene` called `buildClouds()`, which sets
  every cache to null. Clouds are sized in px and placed by fraction of W, so they need no
  rebuild. Cumulus vanished until re-baked and cirrus re-baked all at once (~250 ms).
- **One frame paid for everything.** meadow, plants, tree shapes, terrain relight and tree
  art (~400 ms across 3 frames). Stars (~60 ms) were rebuilt although only visible at night
  (now lazy). The rest is a stage queue run one stage a frame (`stages`, `frameSpent`):
  stages, then terrain relight, then tree bakes, at most one heavy job a frame. What is not
  ready is left out rather than drawn at the old size, and the contrast and average
  sampling wait until the scene is whole.

Software-rendered Chromium, 1600/800/390 switches: worst frame 150-250 ms → 50-170 ms;
15-step drag: ~14 hitches of ~200 ms → ~70-100 ms. 382 tests pass.

## 3. The mirror failed on a race, and a re-run could not fix it

Five of six deploys today failed `deploy-pages` with `Found 0 artifact(s)` ~0.4 s after the
upload step reported success (artifact ID assigned, 6.6 MB). The one that passed saw 1 at
0.37 s. Re-running the failed job made it worse: attempt 2 found two artifacts named
`github-pages` and refused. Fix: upload in one job, deploy from a second with `needs:`.
Older logs had expired, so "race" is the best fit, not a proof.

## 4. Things the session was told, or told itself, that were wrong

- **"It deploys with the push."** Said twice without checking. For cwcorella.com (Cloudflare)
  it was true; for the GitHub Pages mirror it was false for most of the day. Checked by reading
  `check-runs` for the commit, which is the only thing that says.
- **A made-up run ID** was passed to `gh run rerun` early on. It 404'd and changed nothing.
- **"Is the fix live?"** The operator asked because they still saw squash. The live JS had
  `n=1.75` and `Math.min(pe,n*k*Tt/ht)`, and a headless screenshot of the live site at
  960x1080 matched 1920x1080. So the fix was live and visually correct; whatever they saw
  was a stale tab or something not reproduced here (see Open).
- **A first profile that showed nothing:** `vite preview` kept serving the old build's HTML
  after a rebuild, so every script 404'd and the canvas stayed 300x150. The frame times
  from that run (max 17 ms) were of a page that never drew. Restart the preview after a build.

## 5. The public set is a judgement, and it is recorded here

`public: true` is opt-in. 421 entries public, all verified+deep. Held back: marketplace
listings, login/account/order/billing/help pages, hardware-field product pages, personal
gear (Pacsafe, MLD, paracord, Bose, GoSun, Backbone), dead links, data brokers (operator's
call), civic-reno and personal. The exporter refuses private, credential, personal-cluster,
duplicate, non-http, local-address, userinfo and secret-query entries, and exits non-zero.
The `privacy-opsec` section has a neutral public heading (`PUBLIC_LABELS` in
`scripts/export-public-links.mjs`), because its private name mentions data brokers.

## Open

- **Never verified on a real screen:** the resize timings are from software-rendered headless
  Chromium; a GPU browser should be faster but was not tried. The staged rebuild has not been
  seen fill in on a phone. The operator's "still squashed in half-screen" was not reproduced.
  Ask for the window size and zoom, and a hard reload, before touching the terrain again.
- **Mirror fix:** three green runs. If `Found 0` returns, add a retry or delay before deploy.
- **VG auth** is a design only. Questions in the spec: any non-admin role? accept the 7-day
  cookie-approved token? keep the static break-glass token? The content key must stay
  separate. The operator said they had forgotten how to log in; the content key cannot be
  recovered if lost, the library token is `LIBRARY_API_TOKEN` in `/data/library-api/library-api.env`
  (read it via `~/bin/vg-safe-read`). Not done: nobody has retrieved or re-entered anything.
- **civic-reno (26)** left private on judgement; the operator's call.
- **Mirror content:** `scripts/build-archive.mjs` does not list `/resources`.
- `static/glass.json` can be committed from the browser; always `pull --rebase` before
  pushing (it rejected the first push today).
- Rows 4-8 of the table live in the saved-links repo, which has no remote. Its only other
  copy is the `scratch-saved-links` backup row.

## Resume here

Nothing is in flight and nothing is running in the background. Next work, if any, is the
operator's: the VG-auth questions, the civic-reno ruling, or a report of what they see in
half-screen after a hard reload.

- **Branch:** `main`, head `d3cd723` (session doc + STATE.md land on top of it). Pushed.
- **Push route:** the workstation cannot push over SSH. `git -c credential.helper= -c
  'credential.helper=!gh auth git-credential' push https://github.com/cwcorella-git/cwcorella-git.github.io.git main`
  (pull `--rebase` the same way first).
- **Publish more or fewer:** `python3 mark_public.py [--unmark] ID...` in
  `~/Projects/apps/saved-links`, `python3 verify.py`, then
  `node scripts/export-public-links.mjs --confirm` here, build, tests, commit
  `src/lib/resources.json`, push, then read the commit's `check-runs` (all three should be green).
- **Test servers:** none left running (ports 4173 and 5199 were killed).
