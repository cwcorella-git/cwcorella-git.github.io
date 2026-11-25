# VG auth bridge + public links/resources (design only)

2026-11-25. Nothing here is built. Decisions taken with the operator: public links are a
**curated subset** (explicit `public` flag, default false); auth is **design only** this session.

## Part 1. Signing in to cwcorella.com with a Veritable Games account

### Today (measured)

Admin on cwcorella.com is three independent secrets in `localStorage`:

| Secret | Key | Purpose | If lost |
|---|---|---|---|
| Content key | `cwc-admin-key` (+`-keymode`) | decrypts `.enc` docs, journals, links index | **unrecoverable** (tlock seal only opens 2095) |
| GitHub PAT | `cwc-admin-pat` | writes via Git Data API | regenerate on GitHub |
| Library token | `cwc-library-token` | bearer for library-api | read `LIBRARY_API_TOKEN` in `/data/library-api/library-api.env` |

library-api is **not** an auth bridge: `require_token` compares one static bearer
(`LIBRARY_API_TOKEN`) with `hmac.compare_digest`. It also has a second static token,
`LIBRARY_API_VG_TOKEN`, which is VG-the-server calling library-api (read scope, project labels).
That is server-to-server trust, not user identity.

### What VG already has (read, not yet exercised)

- `frontend/src/lib/auth/device-flow.ts`: RFC 8628 device-code flow built for the VATRA launcher
  (`/api/auth/device/{start,poll,approve,verify,refresh}`), 10-minute flows, HMAC-signed device codes.
- `device-token.ts` + `bearer.ts`: opaque 256-bit tokens, only `sha256` stored in
  `auth.device_tokens`; 90-day TTL when approved with TOTP, 7 days with a session cookie only.
  `requireBearerUser(request)` returns `{userId, tokenId}`.
- `/api/auth/me`, TOTP (`2fa`), `middleware.ts` already sets `Access-Control-Allow-Origin: *` for some GET/HEAD routes.

### Proposal: reuse the device flow, do not invent a new one

cwcorella.com is a static SPA on a different origin from veritablegames.com, which is the same
constraint as the Tauri launcher (cookie is host-only and `SameSite=Strict`). So treat the site
as a device client:

1. Site → `POST vg/api/auth/device/start` → shows user code, opens the VG verify page.
2. You approve on VG while signed in (TOTP gives the 90-day token).
3. Site polls, stores the device token in `localStorage` (replaces typing the library token).
4. library-api accepts it by **asking VG** (`GET vg/api/auth/me` with that bearer, cache ~60 s),
   and maps `role=admin` → OPERATOR scope. Keep the static operator token as a break-glass path.

### Hard limits (do not let this design drift past them)

- **The content key stays separate.** Encryption cannot be derived from a login without either
  weakening it or making VG a custodian of the key. VG login may gate *access to services*
  (library-api, later possibly publishing); it never unlocks `.enc` files.
- **PAT stays separate** unless writes move behind a server, which the hard constraints forbid.
- **CORS:** library-api allows only `https://cwcorella.com`; VG's device endpoints need that
  origin allowed (currently they serve a Tauri origin). Needs a test proving the refusal for other origins.
- **Ship order** (frontend guard first, per CLAUDE.md): site accepts both token kinds → VG CORS →
  library-api verifier behind a flag → flip default.
- **"No server" stance:** this adds a runtime dependency on VG for `/library` only, which is already
  admin-gated and already depends on library-api. Public pages stay dependency-free.

### Open questions for the operator

1. Should any non-admin VG role ever see something here, or is this admin-only for good?
2. Is a 7-day cookie-approved token acceptable, or require TOTP (90 days) every time?
3. Does the break-glass static token remain, given it is the thing you forgot?

## Part 2. Public links / resources / reading

### Source

`~/Projects/apps/saved-links/` (project name **what-is-it**; `catalog.json` = 909 entries, no git remote
by decision). Clusters: ai-tooling 430, dev-misc 194, 3d-mocap 85, hardware-field 37,
selfhost-collab 34, personal 30, civic-reno 26, p2p-transport 23, dns-naming 15, and a few small ones.

### Design

- Add `public: bool` to catalog entries, **default false**; `verify.py` rejects a non-bool, `taxonomy.json`
  unchanged. Marking is the operator's job (a small marking mode in `index.html` or a list file).
- A build step in **this** repo (`scripts/export-public-links.mjs`, modelled on `export-library-docs.mjs`)
  reads `catalog.json` and writes `static/docs/public/links.json` with only: name, url, cluster, kind,
  one_liner, license category, and the `self-hostable` signals. Never `what_it_is` notes that
  carry private commentary, never `held` (local paths), never `source_line`.
- A public page (`/resources`) renders it statically, prerendered, same glass UI as `/reading`.
  Reading list stays as is; `/resources` is the catalogue. They may share a nav group.
- Keep `/links` (encrypted private bookmarks, 2,094) untouched. Different data, different trust.
- **Leak gate:** the exporter fails the build if an entry is public and appears in
  `CREDENTIALS-REVIEW.md`, is in cluster `personal`, or any URL has a query string with a
  token-shaped key. Test it by breaking it (a public entry with `?token=`).

### Open questions

1. Where does marking happen: an admin toggle on the public page itself (committed via the Git Data
   API like books) or in the saved-links tool on the workstation?
2. Does the published copy sync back to the workstation catalogue, or is `catalog.json` the only source?
3. Do the 25 or so already-obvious public candidates (selfhost-collab, p2p-transport, dns-naming, supply-chain) get marked first as a seed set?
