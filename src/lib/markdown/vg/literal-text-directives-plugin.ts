// Ported verbatim from veritable-games-site frontend/src/lib/markdown/literal-text-directives-plugin.ts @ b51c85973 (2026-10-11).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
import type { Root, Parent, PhrasingContent } from 'mdast';

/**
 * Text directives are not a syntax this site uses, but `remark-directive` parses
 * any `:name` it can read as one. In prose, `tC8Myy4wo6U:15` (a transcript id and
 * timestamp) became a directive named `15`, which renders as an empty element. The
 * `:15` vanished and the closing `)` wrapped onto its own line.
 *
 * So a text directive goes back to the characters it was written as. Its label, if
 * any, stays as ordinary text. Container directives (`:::columns`) are untouched:
 * `remarkColumns` depends on them.
 *
 * A plain recursive walk, not `unist-util-visit`: this module has no runtime
 * imports, so the jest suite can load it without transforming the ESM packages.
 */
export function remarkLiteralTextDirectives() {
  return (tree: Root) => {
    unwrapTextDirectives(tree);
  };
}

function unwrapTextDirectives(parent: Parent) {
  const next: PhrasingContent[] = [];
  for (const child of parent.children as Array<{ type: string; children?: unknown[] }>) {
    if (child.type === 'textDirective') {
      const name = (child as unknown as { name: string }).name;
      next.push({ type: 'text', value: `:${name}` });
      for (const inner of (child.children ?? []) as PhrasingContent[]) next.push(inner);
      continue;
    }
    if (Array.isArray(child.children)) unwrapTextDirectives(child as unknown as Parent);
    next.push(child as PhrasingContent);
  }
  parent.children = next as Parent['children'];
}
