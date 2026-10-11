# Library unification: one renderer, one visual language — design

**Status:** SPEC ONLY. The operator has not decided; build nothing from this.
**Date:** 2026-10-11. **Requested by:** the operator, relayed by the library-api session
(session doc `/data/library-api/docs/sessions/2026-10-11-library-hardening.md`).

## Problem

Two sites read the same library-api bodies and render them with two different pipelines:

| | cwcorella `/library` | VG library + wiki |
|---|---|---|
| Stack | SvelteKit static, admin-only page, bearer token, CORS = cwcorella.com | Next.js on Coolify, Postgres + library-api (host bridge `10.0.1.1:8088`, public fallback) |
| Markdown | `marked` ^17, `src/lib/admin/markdown.ts` | react-markdown 10 + remark-gfm + rehype-raw, `HybridMarkdownRenderer.tsx` |
| Into the DOM | `{@html}` in `components/library/DocReader.svelte`, `DocEditor.svelte` preview, `components/DocReader.svelte` | React tree |
| Sanitizer | isomorphic-dompurify, run LAST after the `<ann>` pass (`20d6729`; three Hack This Zine docs carry live `<script>`) | none at render (save-time DOMPurify for wiki edits only); rehype-sanitize in progress |
| Math | none | remark-math + rehype-katex in progress, gated to `papers` source + wiki opt-in |
| Extras | `<ann note>` → hover span (regex post-pass); heading ids must match `extractToc` | directives, columns, text colours, wiki links |

Every renderer gap (today: math, figures, sanitizing) has to be closed twice, and the two
sites look nothing alike. The operator wants: easier rendering, one visual language, and
less overhead per gap.

## Constraints that shape the answer

1. **cwcorella's public site must stay static and decentralizable.** `/library` is the one
   server-backed page and is admin-gated in full. Nothing here may give a public page a
   runtime dependency on library-api (see `CLAUDE.md`, "The one acknowledged exception").
2. **The reading-list bake** (`scripts/export-library-docs.mjs`) renders library bodies at
   build time for public pages. Whatever renderer wins must run in Node at build time.
3. **VG's wiki shares the renderer** and has features (wiki links, directives, columns,
   colours) that only make sense on VG and resolve against VG's Postgres.
4. **`$` math misfires on currency in ~19% of docs.** Math stays opt-in per source / per page,
   whichever pipeline wins. The gate is data, not renderer code.
5. **`<img>` cannot send an `Authorization` header.** Any asset scheme for cwcorella needs
   URLs that authorize themselves.

## Question 1 — the rendering pipeline

### Option A: library-api renders sanitized HTML once (Python markdown-it + KaTeX)

library-api returns `body_html` beside `body`; both sites inject it.

- **For:** one implementation; clients get thinner; cache-friendly; a gap is closed once,
  server-side, and both sites pick it up with no deploy.
- **Against:**
  - KaTeX is JavaScript. Server-side KaTeX from Python means shelling to Node, a QuickJS/
    `py_mini_racer` embed, or switching to a Python TeX→MathML path whose output differs from
    VG's rehype-katex. Each is a new runtime dependency in a service whose outage we just
    hardened against.
  - VG's wiki can't use it: wiki bodies live in Postgres and need VG-only directives/links.
    VG ends up with **two** renderers (Python for library, React for wiki) — the
    divergence moves inside VG instead of disappearing.
  - cwcorella's build-time bake would call library-api for HTML, which is fine at build time,
    but the in-browser editor preview (`DocEditor.svelte`) needs a round-trip per preview or
    a second JS renderer anyway.
  - HTML in, `{@html}`/`dangerouslySetInnerHTML` out: React loses component overrides
    (lazy figures, wiki-link `<Link>`s).

### Option B: a shared JS package (recommended)

A small package — working name `@vg/library-markdown` — built on unified, which
react-markdown already is:

```
remark-parse → remark-gfm → [remark-math if opts.math] → remark-rehype
  → [rehype-raw] → rehype-sanitize(SCHEMA) → [rehype-katex if opts.math]
  → rehype-slug(slugify compatible with extractToc) → annotations plugin (<ann note>)
```

It exports: `SCHEMA` (the allowlist), `remarkPlugins(opts)` / `rehypePlugins(opts)`
presets, `renderToHtml(md, opts): string`, `extractToc(md)`, and `shouldUseMath(source,
meta)`. One CSS file ships with it (see Q2).

- **VG** passes the presets to react-markdown, then appends its own VG-only plugins
  (directives, columns, colours, wiki links) *before* sanitize, with the schema extended
  for exactly what those emit. Component overrides keep working.
- **cwcorella** replaces `marked` with `renderToHtml` in the three call sites and in the
  build-time bake. Same output as VG for any library body.
- **For:** one pipeline for library bodies on both sites; math lands in cwcorella for free, and
  one allowlist replaces DOMPurify-here / rehype-sanitize-there; VG's wiki keeps its extensions as a layer on top; runs in the
  browser (editor preview) and in Node (bake, SSR).
- **Against:** a gap still needs a package bump + two deploys (VG push, cwcorella push) —
  less overhead than writing it twice, more than Option A's zero. unified + KaTeX adds
  bundle weight to cwcorella's admin page (acceptable: admin-only; lazy-load KaTeX when
  `opts.math`).
- **Distribution:** no private registry. Put it in its **own public repo** (the site repo is
  the wrong home: cwcorella's Cloudflare build must fetch it without credentials) and consume
  it as a pinned git dependency (`github:…#<tag>`). Open source, no free-tier service.

### Option C: two renderers on a written contract

Keep `marked` and react-markdown; write a contract (allowed tags, heading-id rule, math
gate, asset URL form) and a shared fixture corpus both test suites must pass.

- **For:** zero migration; each site keeps its idiom.
- **Against:** does not reduce per-gap overhead — it adds a third artifact (the contract) to
  update. `marked` has no sanitizer or math story that matches remark's AST, so fixtures will
  disagree on edge cases forever.

### Recommendation

**B, with A's cache as an optional later layer (Q3).** Whatever wins, adopt C's
**fixture corpus** too: `fixtures/*.md` + expected HTML inside the package, including the
known hard cases (currency `$`, punctuation-only and Cyrillic headings, `<ann>`, raw HTML
that must be stripped, figures). That corpus is what makes "renderer gap" a failing test
instead of an outage.

## Question 2 — shared design tokens / typography

Ship from the same package (`@vg/library-markdown/prose.css`) — not a separate package;
the tokens exist to style exactly this HTML.

- **Scope it to one class:** `.lib-prose`. Both sites already wrap bodies (`.doc-body` here).
  Nothing global, so it cannot fight cwcorella's palette system or VG's Tailwind.
- **Tokens as CSS custom properties with defaults**, overridable by the host:
  `--lib-font-body`, `--lib-font-mono`, `--lib-measure` (≈68ch), `--lib-leading`,
  `--lib-scale-ratio`, `--lib-text`, `--lib-text-dim`, `--lib-rule`, `--lib-link`,
  `--lib-code-bg`, `--lib-quote-bar`.
- **Colour comes from the host.** cwcorella maps them to its existing vars
  (`--lib-text: var(--clr-dark-text)`; dim via opacity, per the site's one-colour-per-context
  rule); VG maps them to its theme. The package owns rhythm, scale, measure, tables, code,
  footnotes, figures, KaTeX sizing — the "one visual language" — and the hosts own hue.
- Fonts: self-hosted, open licence, declared by the package but loaded by the host (cwcorella
  must not depend on Google Fonts at runtime for the decentralized mirror).

## Question 3 — backend changes

Ordered by necessity.

1. **Body metadata the renderer needs** (needed by B): `/documents/{id}` returns
   `render: { math: bool, format: 'md' }`. The math gate moves from VG code into data
   (source in `LOCAL_SOURCES` = `papers` → true; per-document override via `edit_flags`).
   Both clients call `shouldUseMath(render)`; neither hard-codes source names.
2. **Assets** (in progress: `GET /assets/{source}/{slug}/{name}` with a tier check).
   - VG: token-proxied through its own route, as planned.
   - cwcorella: the page holds a bearer token, but `<img src>` can't send it. Add
     **`POST /assets/sign` → short-lived HMAC URL** (`?exp=…&sig=…`, ~10 min, scoped to one
     document), or have the client fetch with the header and use `blob:` URLs. Signed URLs
     are simpler and cache better; blob URLs need no API change. Recommend signed URLs.
   - CORS for `/assets` must allow cwcorella.com; the bake never embeds asset URLs into
     public pages unless the document is public (same rule as bodies: withheld and absent
     must look identical).
   - Storage: files beside bodies, `/data/library-api/assets/<source>/<slug>/`, content-hashed
     names; covered by the existing `/data` backup paths (verify, don't assume).
3. **Render cache (optional, after B is live):** a Node sidecar or build step in library-api
   that runs the *same package* and stores `body_html` keyed by
   `(sha256(body), package_version, math)`. Serves Option A's benefits without a second
   implementation. Only worth it if measured render time on long documents hurts — measure
   first; skip if not.
4. **Auth for the static site: no change.** `/library` stays admin-only with the bearer
   token; public pages keep reading baked files. Do not add a public endpoint.

## Question 4 — migration, rollback, wiki impact

**Order (frontend-first, per this repo's ship rule):**

1. Create the package from VG's in-progress sanitize/math work; land the fixture corpus.
   No site changes yet.
2. **VG library reader** switches to the presets. Diff rendered HTML for a sample (≥500
   docs across every source) old vs new; review the diff, not a screenshot.
3. **VG wiki** switches: presets + VG layer. This is the riskiest step (see below).
4. **cwcorella** swaps `marked` in `markdown.ts` for `renderToHtml` behind the same exported
   functions (`renderMarkdown`, `extractToc`) so call sites don't change. Run
   `scripts/e2e/library-links.sh` and the bake; diff the baked reading-list output.
5. API: `render` metadata, then assets/signing. Clients already treat the fields as
   optional (math defaults off, so an old API means "no math", never misfired currency).
6. `prose.css` adoption on both sites, last — purely visual, independently revertible.

**Rollback:** each step is one commit per repo. The package is pinned by tag, so rolling
back = repinning the previous tag; cwcorella can additionally keep `marked` as a dead
fallback for one release. API fields are additive; removing them degrades to today.

**What breaks in VG's wiki:**
- **Sanitize strips things editors use.** Inline `style=` (text colours), arbitrary
  `<div class>` (columns), `<iframe>`/embeds, `id` collisions. Before step 3: query every
  `wiki_revisions` current body for raw HTML tags/attributes, build the allowlist from what
  is actually there, and list pages that would change. Directives that emit styles must
  emit classes instead.
- **Math opt-in:** existing wiki pages containing `$` must not change. Off by default;
  opt-in is per page.
- **Heading ids** change if VG uses a different slugger today → broken in-page anchors and
  external links. Keep VG's slugger in VG's layer if they differ, or ship a redirect map.
- **rehype-raw ordering:** VG plugins that rely on raw HTML nodes must run before sanitize;
  the schema is extended there, deliberately, per feature.

**What breaks on cwcorella:**
- `marked` → remark differ on edge cases (loose lists, HTML blocks, smart punctuation);
  the bake diff in step 4 is the check.
- `<ann note>` must survive sanitize: the package handles it as a plugin, not a regex pass.
  Today's ordering bug (sanitize-first strips `<ann>`) is pinned by a test in `20d6729`;
  port that test into the fixture corpus. Hack This Zine 02/03/04 are the `<script>` fixtures.
- Heading ids must keep matching `extractToc`, including the skip-empty-slug rule
  (punctuation-only / Cyrillic headings) — a fixture case.

## Open decisions for the operator

1. B (recommended), A, or C?
2. Package home: new public repo (recommended) vs. inside the VG site repo.
3. Assets for cwcorella: signed URLs (recommended) vs. blob fetch.
4. Build the render cache at all, or only if long-document render time is measured as slow?
5. How far "one visual language" goes: shared prose rhythm only (recommended), or also
   shared reader chrome (toolbar, TOC panel) — which would mean a framework-neutral
   component layer and is a much larger project.
