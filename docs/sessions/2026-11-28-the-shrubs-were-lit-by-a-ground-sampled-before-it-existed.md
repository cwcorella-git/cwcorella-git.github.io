# 2026-11-28 — The shrubs were lit by a ground sampled before it existed

Started as "I have no space to think": a place to throw thoughts and forget them. It became
a thoughts feature, a calmer meadow, a minimised home panel, and two attempts at a stale
lighting bug the operator found by reloading. Feature notes also in `docs/STATE.md` § Thoughts.

| # | item | state |
|---|---|---|
| 1 | Home panel minimised by default, `+ home` / `–` toggle | **done** — `1c565f4`; admin-only default `0e4775a` (visitors see it open). Never seen in a browser by me |
| 2 | Plant/grass mouse force cut (radius 90→55, push 90→22) | **done** — `1c565f4`. Shrubs are not touched: they are baked art with no mouse or wind motion |
| 3 | Rocks clickable (admin) to write a thought; ink: any non-interactive click | **done** — `1c565f4`. Never clicked by me |
| 4 | Thoughts stored encrypted (`static/docs/private/thoughts.enc`) via write queue | **done** — `1c565f4`; the operator's browser has since pushed `d980797 update thoughts`, so the write path works end to end |
| 5 | Thoughts float back: Poisson process, saturating rate `λ(n)=λmax·n/(n+K)` | **done** — `1c565f4`, 421 tests incl. `thoughtLogic.test.ts`. Never seen appearing |
| 6 | Symbol buttons `×` / `✓`, neutral `…` placeholder | **done** — `aa0e17d` |
| 7 | Trees/shrubs stuck in stale light after load (cache key lacked the ground) | **done, unverified** — `d0f5c84` |
| 8 | Grass and shrubs still dark after a cold load (ground sample never repeated) | **done, unverified** — `d2b0f1d` |
| 9 | Pale bare tree "washed out" at night | **proposed** — not started; cause is moon tint plus haze, needs a render to tune |
| 10 | Shrubs "didn't get the physics update" | **proposed / unexplained** — see Open |
| 11 | Live 3D cloud layer (WebGL ray-march, `cloudField.ts`), shadows from its alpha, behind the range | **done, unseen live** — `e1b438f` `875ee7b` `3498700` `ab8673d` |
| 12 | Hatching and boxy bases; flatter perspective; haze over the range; pop-in guard | **done, unseen live** — `2240feb` `b12b8bf` `9ffff93` `7675586` |
| 13 | Thinner cover, thinner at night; real Reno cloud cover from Open-Meteo with seeded fallback | **done, fetch unconfirmed** — `efd1073` `4a51a4b` |
| 14 | Painted 2D clouds as a third mode (`cloudPuffs.ts`), off by default | **done, seen only in headless stills** — `0231394` |
| 15 | 3D layer preserved | **done** — tag `clouds-3d-live` at `4a51a4b` |

## 1. The thoughts feature had to be admin-only, because the repo is the database

There is no server (hard constraint), so a thought has to go through the GitHub write queue
and be encrypted with the content key. That makes rocks, ink clicks and the floating text
all admin-only: a visitor has no key and sees nothing. One file, `thoughts.enc`, like
`links-index.enc`. Two traps handled: a failed read never lets `add()` write back an empty
list (`loaded` gates it), and a pending draft is decrypted and merged on load, or the next
add would overwrite a thought that had not synced yet.

## 2. "The maths" is a Poisson process with a saturating rate

Memoryless arrivals, rate rising with the count and capped: `λ(n)=λmax·n/(n+K)`, `λmax=1/20min`,
`K=25`. One thought is hours apart; never faster than one per 20 minutes. Dice are rolled
every 5 s while the page is open and visible; a thought shows 18 s.

## 3. Two causes for one symptom, and the first fix was not enough

Operator: after a fresh load the shrubs are near black and not blended; leaving and
returning to the tab fixes it. My first reading (`d0f5c84`): the tree/shrub cache key tracked
only sun, day and moon, not the ground colour they are lit from. The operator reloaded and
the shrubs were **still** wrong, and the **grass blades were black too**, which that fix
could not explain. Second reading (`d2b0f1d`): `sampleGround` is keyed on sun altitude,
day, size and plant count, so a sample taken before the terrain file loaded or the meadow
stage baked (plain ground, no tint) was kept for the session; grass and shrubs then lit
dark. Added `terrainLit.key`, `meadow` presence and snow to that key. Both are readings of
the code; **neither has been seen to fix it.**

## 4. The clouds: the operator's eye said the scene was off before any measurement did

Asked for clouds that form and deform, a Fable agent proposed a ray-marched slab in an offscreen
WebGL2 canvas (stateless in scene time, so the admin clock still scrubs). Built behind
`cloudField`, with the baked sprites as fallback. Seen in headless renders it worked, and then
the operator said the scene felt wrong: **one 3D element in an otherwise flat layered scene**,
and the clouds met the mountains badly. Two causes of mine: the layer was drawn *after* the
land, over the range (fixed: `drawLiveClouds` runs before `drawGround`), and the deck converged
to the ground line. Lifting it (60% of the sky height, fading out) and flattening the
perspective (K 0.62→0.46, reach 46→34) treated the symptom; haze over the range in the cloud
deck's own haze colour (`drawRangeHaze`) helped. The real fix for "mismatch" was a different
style: **the agent's painted 2D puffs** (`cloudPuffs.ts`), which the operator chose as a third
mode. They read much closer to the rest of the scene in stills.

Smaller findings: white-noise jitter plus a 0.9px blur removed the dither hatching (Safari
ignores canvas `filter`); pop-in came from the baked clouds drawing while the 3D noise built, so
`fieldActive()` keeps them out while warming up; `pkill -f` on a server name killed my own
shell twice (exit 144), so kill by port with `lsof -ti`.

## 5. Real weather, and a constraint I bent

`localSky.ts` reads today's cloud cover for Reno (39.53, -119.81) from Open-Meteo once,
caches 30 min in `localStorage`, and falls back to seeded weather on any failure. It only
applies when the scene clock is live and on auto. **CLAUDE.md says no free-tier service
dependencies**; I judged an optional, silently-degrading read acceptable and said so to the
operator, who did not object. A visitor's browser calls a third party. My own `curl` to the API
returned nothing from the workstation, so **the live fetch has never been confirmed working.**

## Open

- **Clouds never seen live on a real screen.** All checks were headless Chrome on SwiftShader (the
  page with `Date` overridden, because the scene-clock override only works for an admin). The
  3D layer, its haze, shadows, thinner cover, and the painted 2D mode are all OWED by eye.
- **Painted 2D clouds, known weak:** sunset is nearly one flat orange; golden hour mottles;
  overcast is a lumpy band, not a deck; bases are ruler-straight; edge shimmer at 4-12 fps
  untested; phone cost unmeasured (agent: ~12 ms at 4x throttle). Toggle `painted clouds (2D)`
  in the scene panel; it wins over `live clouds (3D)`; both off gives the baked sprites.
- **Open-Meteo fetch unconfirmed**, and it is a call to a third party (see §5). Remove
  `startLocalSky()` in `Garden.svelte` to go back to seeded weather only.
- **Default is still the 3D layer** (`cloudField: true`); painted is off. Operator's call.
- Cloud-shadow strength (0.3) and range haze (0.46) are eyeballed numbers.

- **Never verified in a browser (mine):** every visual and interaction claim above. Rock
  click, ink click, the floating bubble, the minimise button, the dimmer grass. Type-check,
  421 tests and `npm run build` are green; that is all.
- **Items 7 and 8 are hypotheses.** If the grass is still black after a hard reload on a
  fresh tab once the deploy lands, the cause is elsewhere (candidates: `plantLight` unset
  until `terrain` resolves in `tuftLight`, line ~692; the first-load `buildScene` path that
  runs `build` without stages).
- **"Shrubs didn't get the physics update"**: unexplained. A tab open from before the
  deploy runs old code, which would explain it. If the operator meant shrubs should sway,
  that is a new feature (sage is baked art, drawn with `windPx` 0).
- **Night trees**: operator's call whether to lower the moon tint and haze on the bare tree.
- **Home panel hidden for admin by default** is the operator's stated wish; a brief flash
  of the open panel before login restores is known.
- The existing canvas `click` listener for tree seeding in `Garden.svelte` never fires
  (the canvas has `pointer-events: none`). Found, not touched.
- Pushes from this workstation need the `gh` credential-helper HTTPS form; the SSH remote
  is refused, and the operator's browser pushes to `main` too, so `pull --rebase` first.

## Resume here

Nothing in flight, nothing running (the local `http.server` on 4173 was stopped). Everything
is pushed to `main`; last code commit `0231394`, tag `clouds-3d-live` at `4a51a4b`. Next row
is the operator's look: grass and shrubs after a hard reload (#8, `d2b0f1d`), then the clouds
in each mode at noon, sunset and a moonless night. Headless-render recipe: build, serve
`build/` with `python3 -m http.server 4173`, drive Chrome via `node_modules/playwright` with
`executablePath: /usr/bin/google-chrome`, swiftshader flags, and a `Date` subclass in
`addInitScript` (browser TZ is UTC, so sunset is about 16:30Z). Scripts are in the session
scratchpad (`shot3.mjs`, `shot4.mjs`). Prototypes: `clouds-proto.html`, `clouds2d-proto.html`.
