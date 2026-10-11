// Ported from veritable-games-site frontend/src/lib/wiki/utils/wikilink-target.ts @ b51c85973 (2026-10-11).
/**
 * How a `[[wikilink]]` names a page, in ONE place.
 *
 * The renderer (`lib/markdown/wikilink-plugin.ts`) turns a link into a slug with
 * `createSlugFromTitle`, and links to `/wiki/<slug>`. A rename must rewrite exactly
 * the links that render to the old slug, so the rewrite and the link index both
 * resolve through this module, never through a second copy of the rule.
 *
 * Pure: no runtime imports, so the jest suite can load it without transforming
 * the ESM packages the renderer depends on.
 */

const LINK = /\[\[([^\]]+)\]\]/g;
const SPECIAL_NAMESPACES = ['library', 'projects', 'forums', 'news', 'users', 'transcript', 'book'];

/** Title (or slug-form target) to slug. The renderer's rule, moved here verbatim. */
export function createSlugFromTitle(title: string): string {
  // Handle namespace syntax (namespace:page)
  const colonIndex = title.indexOf(':');
  if (colonIndex !== -1) {
    const namespace = title.slice(0, colonIndex).trim();
    const pageName = title.slice(colonIndex + 1).trim();

    const namespaceSlug = namespace
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    const pageSlug = pageName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    return `${namespaceSlug}/${pageSlug}`;
  }

  // Regular page name
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Split a link body (the text between `[[` and `]]`) into its parts.
 *
 * Note the renderer does NOT split `#anchor` off the target: `[[Foo#bar]]` slugs
 * to `foobar`, a broken link already. Splitting here lets a rewrite keep the
 * anchor, and the index records the page the author meant.
 */
export function splitWikiLinkBody(body: string): {
  target: string;
  anchor: string;
  display: string | undefined;
} {
  const pipe = body.indexOf('|');
  const head = pipe === -1 ? body : body.slice(0, pipe);
  const display = pipe === -1 ? undefined : body.slice(pipe + 1);
  const hash = head.indexOf('#');
  return {
    target: (hash === -1 ? head : head.slice(0, hash)).trim(),
    anchor: hash === -1 ? '' : head.slice(hash),
    display,
  };
}

/** A link that points outside the wiki's own pages: absolute paths and namespace routes. */
function isExternalTarget(target: string): boolean {
  if (!target || target.startsWith('/')) return true;
  const colon = target.indexOf(':');
  return colon > 0 && SPECIAL_NAMESPACES.includes(target.slice(0, colon).trim().toLowerCase());
}

/**
 * Blank out code so a `[[...]]` inside it is never matched. Length is preserved,
 * so match indices in the masked text are valid in the original.
 */
function maskCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));
}

/** Every wiki page a body links to, outside code, as the renderer resolves it. */
export function extractWikiLinks(content: string): Array<{ slug: string; text: string }> {
  const masked = maskCode(content);
  const links: Array<{ slug: string; text: string }> = [];
  for (const match of masked.matchAll(LINK)) {
    const start = match.index ?? 0;
    const body = content.slice(start + 2, start + match[0].length - 2);
    const { target, display } = splitWikiLinkBody(body);
    if (isExternalTarget(target)) continue;
    links.push({ slug: createSlugFromTitle(target), text: display?.trim() || target });
  }
  return links;
}

export interface RenamedPage {
  oldSlug: string;
  newSlug: string;
  newTitle: string;
}

/**
 * Rewrite the links in `content` that point at the renamed page.
 *
 * - A slug-form target (`[[enact-dialogue-system]]`) becomes the new slug.
 * - A title-form target (`[[The Shape of the Universe]]`) becomes the new title,
 *   unless that title would not slug back to the new slug (a `/` or a `:` in it).
 *   Then it becomes the slug, and the display text the reader saw is kept.
 * - Anchors and display text are kept. Absolute and namespace-route links are not
 *   touched. Code is never rewritten.
 *
 * Returns the content unchanged when no link points at the old slug.
 */
export function rewriteWikiLinks(content: string, page: RenamedPage): string {
  const masked = maskCode(content);
  let out = '';
  let last = 0;
  for (const match of masked.matchAll(LINK)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const body = content.slice(start + 2, end - 2);
    const replaced = rewriteBody(body, page);
    if (replaced === null) continue;
    out += content.slice(last, start) + `[[${replaced}]]`;
    last = end;
  }
  return out + content.slice(last);
}

function rewriteBody(body: string, page: RenamedPage): string | null {
  const { target, anchor, display } = splitWikiLinkBody(body);
  if (isExternalTarget(target)) return null;

  const suffix = `${anchor}${display === undefined ? '' : `|${display}`}`;

  if (target === page.oldSlug) {
    return `${page.newSlug}${suffix}`;
  }
  if (createSlugFromTitle(target) === page.oldSlug) {
    if (createSlugFromTitle(page.newTitle) === page.newSlug) {
      return `${page.newTitle}${anchor}${display === undefined ? '' : `|${display}`}`;
    }
    // The new title would not link to the new page. Link by slug, and keep the
    // text the reader saw before the rename.
    const keptText = display ?? target;
    return `${page.newSlug}${anchor}|${keptText}`;
  }
  return null;
}
