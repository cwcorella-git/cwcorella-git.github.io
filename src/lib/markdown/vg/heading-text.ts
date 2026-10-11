// Ported from veritable-games-site frontend/src/lib/markdown/heading-text.ts @ b51c85973 (2026-10-11).
// reactNodeText (React-only) removed; everything else verbatim.
/*
 * The plain text of a heading, computed two ways that must agree:
 *
 * - `markdownHeadingText` reads the raw `# ...` source line, for the contents
 *   lists that scan content without rendering it (projects, wiki, library).
 * - the renderer reads the heading's text content in the tree, at any depth,
 *   and assigns the id once per parse (heading-ids-plugin.ts). `reactNodeText`
 *   is the same rule over React children.
 *
 * Both feed `slugifyHeading`. Until 2026-10-04 the renderer only read one level
 * of children, so `<span class="text-blue-400">*[Part 1]*</span>` gave an empty
 * id, and the projects contents list printed the source line markup and all.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Visible text of a Markdown heading's source (without the leading `#`s). */
export function markdownHeadingText(source: string): string {
  // Pull escaped punctuation out first so `\*` is not read as emphasis.
  const escapes: string[] = [];
  let s = source.replace(/\\([!-/:-@[-`{-~])/g, (_m, ch: string) => {
    escapes.push(ch);
    return `\u0000${escapes.length - 1}\u0000`;
  });
  s = s
    .replace(/\s+#+\s*$/, '') // closing ATX hashes
    .replace(/<[^>]+>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[target|label]]
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1');
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => escapes[Number(i)] ?? '');
  return decodeEntities(s).replace(/\s+/g, ' ').trim();
}


/** URL-safe id; the one slug rule for rendered headings and every contents list. */
export function slugifyHeading(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Number a repeated id (`notes`, `notes-2`, `notes-3`). The renderer and every
 * contents list call this over ALL heading levels in document order, so the
 * numbering agrees even when a list shows only some levels.
 */
export function uniqueSlug(seen: Set<string>, id: string): string {
  let unique = id;
  let n = 1;
  while (seen.has(unique)) {
    n += 1;
    unique = `${id}-${n}`;
  }
  seen.add(unique);
  return unique;
}
