# Fold the reading list into the library (design only)

2026-11-25. Nothing here is built. Request: make the reading list the library's primary
"to read" set, with a strong highlight and a filter for it, `mark read` / `edit` / `x` on
the library cards, the reading entries' sourced links kept, and authors and publication
dates kept. "Be careful not to override any content."

## 1. What is there today (measured)

| | reading (`src/lib/books.json`) | library (library-api) |
|---|---|---|
| Size | 917 entries | 107,029 documents |
| Who sees it | **public** page (`audience: public`), prerendered, in the archive mirror | **admin only**, runtime API, not in the mirror |
| Store | one JSON file, committed from the browser via the PAT | `library.db` (rebuilt by migrate) + `edits.db` / `curation.db` (migration-proof overlays) |
| Fields | `title, author, year (int, 19 null), category, type, tags, links[{name,url}] (502 have 2+, 20 have none), read (3 set), doc{file,visibility,source}` | `title, author, publication_date, language, document_type, source_url, tags, decision, visibility, license, body` |
| Edit | add/edit form (BookForm), mark read, delete | body + title + tags only (`PUT /documents/{id}/body`), decision, flags |

Other facts that shape the design:

- **Only 327 of 917 reading entries match a library document** (35.7%, `scripts/match-library.mjs`
  at 0.88; 277 exact, 15 strong, 35 weak; 9 rows share one document with another book).
  **590 entries have no library row.** They are links to books, not ingested texts.
- The reading list is **public and library is not**. Folding one into the other as-is would
  take the public reading list off the site.
- Metadata edits already have a home: `edit_meta` in `edits.db` holds `title, author,
  publication_date, date_precision, document_type, source_url`, merged over `library.db`
  on every read (`apply_meta_fields`). **There is no HTTP endpoint to write it.** Only
  scripts (`set_meta`, `repair_titles.py`, `recover_marxist_metadata.py`) do. That is why
  the library editor has no author or date field: the field was never exposed.
- `edit_meta` can be **promoted upstream into VG's Postgres** (`backend/vg_metadata.py`,
  `title, author, publication_date`). A hand edit made for reading-list reasons must not
  silently ride that path (see 5).

## 2. Proposal

### 2.1 The library owns the list; `/reading` retires (operator ruling, 2026-11-25)

Operator: "we don't have the 'reading list' anymore. I'll make 'library' public once we've
curated. Nothing should be lost with the data migration; if anything we gain features and get a
fuller list." So:

- **library-api owns the to-read set** (new tables in `edits.db`, which survives migrate).
- **`/reading` is retired**, not preserved as a baked page. Until the library goes public the
  list is admin-only, which is a deliberate loss of the public list. The nav entry and the
  archive-mirror "reading" section go when the migration is verified, not before.
- **`src/lib/books.json` stays in the repo, untouched, as the frozen backstop** until the
  parity check (section 3) passes. It is no longer written to once the cutover happens.
- **Making the library public is out of scope here and is a separate, deliberate decision**
  that breaks the "no server" exception in `CLAUDE.md`. It needs its own spec. This design must
  not make it harder: see the invariants in section 4, which become the public surface.

Rejected: keeping `books.json` primary with the library joining on a fuzzy title match (the
match is only 36%, and a second copy of "what matched" is how the rail once scrolled to the
wrong row).

### 2.2 Data model (library-api, `edits.db`)

```
reading_item   (item_id PK,
                doc_id NULL,            -- library doc, if one exists
                legacy_id,              -- books.json id, for the import and rollback
                category, type_hint, year_hint,   -- reading-only facts, never merged over doc fields
                to_read INT DEFAULT 1,
                read_at TEXT NULL,
                added_at, updated_at)
reading_link   (item_id, ord, name, url)   -- the sourced links, ordered, 0..n
```

- A **matched** entry has `doc_id` set and appears as the library document itself, with the
  to-read flag on. An **unmatched** entry (590 now) is a *stub*: a row with `doc_id NULL`
  that the list endpoint returns alongside documents, with title/author/date taken from
  `edit_meta`-style fields on a **stub's own row**, no body, `word_count` 0, links shown
  where the body would be.
- A stub that later gets ingested is attached by setting its `doc_id` (a human-confirmed
  action, never an automatic overwrite).
- Stubs live in `edits.db`, not `library.db`, because anything in `library.db` is destroyed by
  the next migrate. **Not verified:** whether the `user` source (2,513 rows) could carry stubs
  instead. Checking how `user` rows are created is step 0 of the build.
- `x` on a card removes the to-read flag (reversible, shows an undo toast). It is **never**
  curation `delete`; that stays in the existing decision control.

### 2.3 Library UI

- **Highlight.** A to-read card gets a clear mark that cannot be mistaken for `keep` or the
  public `◉`: a left accent bar plus a "to read" label. Read items dim, not vanish.
- **Filter.** A "to read" control next to State: `to read / read / all`. It goes through
  `filtersToParams()` and the anchor-offset calls like every other filter. A second copy of
  that mapping is the known way to break the rail, so it is added in that one function.
  Facet counts for `to_read` and `read` come from the same call.
- **Card buttons** (admin only): `mark read`, `edit`, `x`. The card is a real `<a href>` (the
  library's URL invariant), so the buttons must `preventDefault` and `stopPropagation`; new-tab
  and copy-link must keep working. Each write toasts on failure and **never sets `_status`**
  (the rule that keeps the controls mounted).
- **Links.** The reader and info panel list `reading_link` entries as a "sources" block, in
  stored order. Editable: add, remove, reorder.
- **Edit.** The editor gains **author, publication date, date precision, type, source URL**,
  plus category and links for reading items. This needs the new endpoint in 2.4. Stubs have
  no body, so for them edit means metadata and links only.

### 2.4 library-api changes

- `PUT /documents/{id}/meta` (token-gated) wrapping `edits.set_meta`. Today `None` means
  "leave alone", so a field cannot be cleared; the endpoint takes an explicit `clear: [fields]`.
  Validates `document_type` and `date_precision` against the existing vocabularies.
- `PUT /reading/{item_id}` (flag, read, category, links) and `POST /reading` (add a stub).
- `GET /documents` gains `to_read=0|1`, `read=0|1`, returns `to_read`, `read`, `links` on
  items, and UNIONs stubs. `/facets`, `/anchor-offset(s)` accept the same params so the rail
  stays honest.
- **Ship order, frontend first** (the standing rule): the frontend treats every new field as
  optional; then library-api is pulled and restarted on the workstation (not `git push`).

## 3. Not overriding anything (the migration rules)

The import is additive, dry-run first, and reversible.

1. **Back up first:** copy `edits.db` and `src/lib/books.json` (already in git) and record
   the shas. `books.json` is **not deleted** until the exporter reproduces it from the new
   tables with zero diff for untouched entries.
2. **Matched entries:** only set `doc_id` and the to-read flag. **Never write over a
   non-null library field.** Reading's author/year go to the stub-style hint columns, and a
   report lists every disagreement (author, year, type) for a human to accept per row.
3. **Unmatched entries:** become stubs carrying *all* of `title, author, year, category,
   type, tags, links, read`. Year stays an int plus `date_precision = year` (never
   `YYYY-01-01`, which asserts a day).
4. **Shared documents:** the 9 rows that map to one doc are listed and left unattached until
   a human picks one. No automatic merge.
5. **Weak matches (35)** stay stubs until confirmed. An exact/strong match is applied;
   `weak` is only proposed.
6. **Parity check before the cutover:** a script that re-exports and diffs against the
   committed `books.json`; the count, every id, title, author, year, links list and `read`
   flag must match, with differences printed and the run exiting non-zero.
7. **Reading's `doc` blocks** (144 with baked full text) are left alone: the full-text export
   (`export-library-docs.mjs`) keeps its own rules, including 40k-word and licence gates.

## 4. Invariants this must not break

- **Withheld and absent bodies look the same to a visitor.** The public export keeps
  `resolveBookDoc`'s single construction site and carries no field naming a withheld doc.
  `to_read` must not become a signal for "this is in the private corpus".
- **Publication is unchanged:** `is_public = keep AND visibility == public AND free licence`.
  A to-read flag grants nothing and never changes tier, decision or visibility.
- **`books.json` stays minified with no trailing newline**, byte-identical to what the
  browser would write, or the next browser sync rewrites all rows.
- **No `pushState` before the router mounts; `page.url` is stale while a doc is open.** New
  URL params for the filter follow `urlLogic.ts`.
- **Keep new gating logic pure and tested** (as `keyLogic.ts`), not inside components.

## 5. Risks

- **Metadata promotion to VG.** Editing author/date on a library doc writes `edit_meta`, which
  `vg_metadata.py` can promote to VG. Stub rows are not in VG, so they cannot leak. For
  **matched** docs the edit form should write to a reading-side hint unless the operator
  deliberately edits the document's own metadata, and the UI must say which it is doing. Unverified:
  whether promotion runs on a schedule or only by hand (read its CLI and cron before building).
- **Two write surfaces.** Reading writes through the PAT, library through the bearer token.
  After the move, to-read edits need the library token. This also makes the lost-token problem
  bite harder; the VG sign-in design (`2026-11-25-vg-auth-bridge-and-public-links.md`)
  would cover it.
- **Cost.** Stubs in the list query add a UNION to a 107k-row paginated, rail-indexed list.
  Measure `/documents` and `/anchor-offset` before and after on the real DB.
- **Public later.** When the library goes public, every to-read, link and metadata field becomes
  visitor-visible unless gated. Fields added here need a public/private decision at the time
  (a stub's `category`, hand-written links and notes are the likely ones).

## 6. Build order

0. Read how `user`-source rows are created; read the `vg_metadata` promotion trigger. Both
   are unverified and shape 2.2 and 5.
1. library-api: `PUT /documents/{id}/meta` with tests (clear, vocabularies, FTS reindex).
2. library-api: reading tables, endpoints, list/facet/anchor params, UNION; tests, including
   the filter mapping.
3. Importer in dry-run, with the report from section 3. Review it; apply.
4. Frontend: types, `filtersToParams`, filter control, card buttons, highlight, links block,
   metadata fields in the editor. Ship before the API restart.
5. Exporter + parity check; switch `/reading` to read-only; remove its admin controls.
6. Update `CLAUDE.md` (Reading list ↔ library) and `docs/STATE.md`.

## Open (the operator's calls)

Settled 2026-11-25: stubs for all 590 unmatched entries; `/reading` retires; the library goes
public later, after curation; nothing may be lost in the migration.

1. **`x` means "remove from to-read"**, not curation delete (recommended). Confirm.
2. **Matched-doc author/date edits**: reading-side hint by default (recommended), or edit the
   document's own metadata directly.
3. **When `/reading` is removed**: only after the parity check, plus a redirect to
   `/library?to_read=1` for old links (recommended).
