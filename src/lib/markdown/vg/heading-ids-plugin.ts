// Ported verbatim from veritable-games-site frontend/src/lib/markdown/heading-ids-plugin.ts @ b51c85973 (2026-10-11).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
/*
 * Gives every heading its id once per parse, in document order, numbering
 * repeats (notes, notes-2). This has to happen on the tree, not in the heading
 * components: those can render more than once (React Strict Mode renders every
 * component twice in dev), and a counter held in render would number a heading
 * against itself — every id came out `-2` in dev when it was tried (2026-10-05).
 *
 * Text is the heading's text content at any depth, the same text the contents
 * lists derive from source with markdownHeadingText.
 */
import { slugifyHeading, uniqueSlug } from './heading-text';

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const HEADING = /^h[1-6]$/;

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

export function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const seen = new Set<string>();
    const walk = (node: HastNode) => {
      if (node.type === 'element' && node.tagName && HEADING.test(node.tagName)) {
        const slug = slugifyHeading(textOf(node).trim());
        if (slug) node.properties = { ...node.properties, id: uniqueSlug(seen, slug) };
        return;
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}
