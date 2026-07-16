# Editing the nav bar manually

The site's top navigation is driven by one committed file:

```
src/lib/content/nav.json
```

The layout reads this file at build time, so **any change goes live only after a
redeploy** (push to `main` → GitHub Actions rebuilds Cloudflare Pages, ~1–2 min).

There are two ways to change it:

1. **In-browser** — admin `☰ nav` panel → toggle → **save & publish**. This is the
   intended path, but it commits `nav.json` through the GitHub API and therefore
   needs a **valid, repo-scoped GitHub PAT** loaded in `⊙ settings`. See
   "Why we're editing manually right now" below.
2. **Manually** — edit `nav.json` in a local clone and push. This is what this doc
   covers, and it needs no PAT in the browser.

---

## The file format

`nav.json` is a JSON array, one object per nav item, **in display order**:

```json
[
  { "id": "home",     "label": "cwcorella", "href": "/",         "shown": true,  "audience": "public", "pinned": true },
  { "id": "reading",  "label": "reading",   "href": "/reading",  "shown": true,  "audience": "public" },
  { "id": "library",  "label": "library",   "href": "/library",  "shown": true,  "audience": "admin", "adminLocked": true },
  { "id": "journals", "label": "journals",  "href": "/journals", "shown": true,  "audience": "admin", "adminLocked": true },
  { "id": "links",    "label": "links",     "href": "/links",    "shown": false, "audience": "admin", "adminLocked": true }
]
```

| field         | meaning |
|---------------|---------|
| `id`          | stable internal key — don't change it once set |
| `label`       | the text shown in the nav bar |
| `href`        | the route it links to |
| `shown`       | `true` = in the nav, `false` = hidden from everyone (this is the show/hide toggle) |
| `audience`    | `"public"` = every visitor sees it · `"admin"` = only when logged in / archive mode |
| `adminLocked` | *(optional)* the page itself is admin-gated, so `audience` must stay `"admin"` — a public link would just bounce visitors home |
| `pinned`      | *(optional)* fixed item (the site brand): always shown + public, and stays first |

**Order = the order in the array.** To reorder tabs, move the objects up/down.

**Reminder — this controls the *link*, not the page.** Hiding a tab or setting it
`admin` does **not** protect the page; the route still exists at its URL. Real
access control for `/library`, `/journals`, `/links` is the route guards, which
redirect non-admins regardless of the nav. That's why those three are
`adminLocked`.

---

## How to make a change manually

From the laptop clone (`~/Projects/cwcorella-git.github.io`):

```bash
cd ~/Projects/cwcorella-git.github.io
# 1. edit src/lib/content/nav.json (see examples below)
npm run build            # optional sanity check — fails if the JSON is malformed
git add src/lib/content/nav.json
git commit -m "nav: <what you changed>"
git push origin main     # GitHub Actions redeploys; live in ~1–2 min
```

### Common edits

- **Hide a tab:** set its `"shown"` to `false`.
- **Show a tab:** set its `"shown"` to `true`.
- **Make a public page admin-only:** set its `"audience"` to `"admin"` (only for
  the genuinely-public pages — `home`/`reading`; the others are already locked).
- **Make a page public:** set `"audience"` to `"public"` — **only** for a page that
  is actually reachable without login. Never make an `adminLocked` route public.
- **Reorder:** move the object earlier/later in the array. Keep `home` first.
- **Add a tab:** add an object with a new `id`, a `label`, an `href` that matches a
  real route, and `shown`/`audience`. If the route is admin-gated, add
  `"adminLocked": true`.

---

## Why we're editing manually right now

**`2026-07-16` — the in-browser "save & publish" is blocked on a working PAT.**
The `☰ nav` panel's publish button (and every other admin save on this site)
commits through the GitHub API using a personal access token entered in
`⊙ settings`. As of this date that token comes back **"Invalid PAT"**, so the
in-app publish can't run and nav changes are being made by editing `nav.json`
and pushing directly.

**This still needs doing:** to restore the one-click in-browser workflow, load a
valid GitHub PAT with **write access** to `cwcorella-git/cwcorella-git.github.io`:

- **classic token** with the **`repo`** scope, or
- **fine-grained token** scoped to that repo with **Contents: Read and write**.

Enter it in `⊙ settings → github pat`. Once it validates, `☰ nav → save & publish`
(and books/journals/home editing) work without touching files. Until then, use the
manual push flow above.

---

## Change log (manual edits)

- **2026-07-16** — hid the `links` tab (`shown: true → false`).
