# cwcorella.bio

Personal site — reading list, journals, and home page. Fully static, prerendered, and deployed to GitHub Pages. All dynamic content is managed client-side via the GitHub REST API with a session-scoped personal access token; there is no server.

## Stack

| Layer | Choice |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 (runes) |
| Adapter | `adapter-static` — fully prerendered, no SSR |
| Hosting | GitHub Pages, deployed via GitHub Actions on push to `main` |
| Build tool | Vite |
| Markdown | `marked` with a custom renderer (heading `id` injection for TOC anchors) |

## Content management

Content is owned by the repository and mutated through the GitHub Git Data API (blobs → tree → commit → ref PATCH), which allows atomic multi-file commits without blob-SHA conflicts. A session-scoped PAT is entered once per browser session and stored in `sessionStorage`; it is never persisted to disk or sent anywhere other than `api.github.com`.

**Home content** (`src/lib/content/home.json`) — page text, inline-editable when admin mode is active.

**Books** (`src/lib/books.json`) — metadata for the reading list. Updated in-browser via the admin interface.

**Documents** (`static/docs/`) — attached long-form markdown per book entry. Public documents are stored as plain `.md`; admin-only documents are AES-256-GCM encrypted.

**Journals** (`static/docs/private/journals/`) — personal writing, encrypted at rest. The index and all entry contents are encrypted; no plaintext titles or content appear in the repository.

## Encryption

All encrypted content uses AES-256-GCM with a key derived via PBKDF2 (SHA-256, 200,000 iterations, 16-byte random salt). Encryption and decryption run entirely in the browser using the Web Crypto API. The ciphertext, IV, and salt are stored as base64-encoded JSON in `.enc` files.

The encryption script for journals (`scripts/encrypt-journals.mjs`) runs locally and commits the output. Slugs are deterministic SHA-256 hashes of the source filename (12 hex characters) so re-runs update existing files rather than creating duplicates.

## Admin interface

Admin mode is activated by a key sequence entered anywhere outside a text field. It unlocks:

- Inline editing of home page text
- Book entry creation, editing, and deletion
- Mark-as-read toggle (persisted to `books.json` via GitHub API; visible to all visitors)
- Journal CRUD — create, rename, edit content, delete with confirmation
- Document attachment per book (public or encrypted)

## Project structure

```
src/
  lib/
    admin/         — GitHub API client, Web Crypto wrapper, markdown renderer, reactive state
    components/    — AdminDrawer, AdminToolbar, BookForm, DocReader, InlineEditor, etc.
    content/       — home.json (home page text)
    books.json     — reading list data
    types.ts       — shared TypeScript interfaces
  routes/
    +layout.svelte — nav, admin drawer, key sequence handler
    +page.svelte   — home page
    reading/       — book list with search, filter, and document reader
    journals/      — admin-only journal browser and editor
static/
  docs/
    public/        — plain markdown documents
    private/       — AES-256-GCM encrypted documents and journal entries
scripts/
  encrypt-journals.mjs — local tool: encrypt writing directory → static/docs/private/journals/
```

## Local development

```bash
npm install
npm run dev
```

Build and type-check:

```bash
npm run build
npm run check
```

Tests (Vitest):

```bash
npm test
```

## Planned

- IPFS deployment with DNSLink for content-addressed hosting
- nsite (Nostr/Blossom) as an alternative host
- Photo gallery with in-repo storage; Arweave/ArDrive for larger sets
- Time-locked content via drand/tlock-js
