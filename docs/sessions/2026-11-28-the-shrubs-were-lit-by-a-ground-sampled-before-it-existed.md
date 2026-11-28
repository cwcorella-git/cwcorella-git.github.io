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

## Open

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

Nothing in flight, nothing running in the background. Next row: **#8 verification**. Ask
the operator for a screenshot after a hard reload (deploy of `d2b0f1d` takes a few
minutes). If still dark, read `tuftLight` and `buildScene` first-load order in
`src/lib/components/Garden.svelte`. All work is pushed to `main` (`d2b0f1d`); this doc is
the only unpushed change.
