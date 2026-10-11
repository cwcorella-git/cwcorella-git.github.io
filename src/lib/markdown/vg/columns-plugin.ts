// Ported verbatim from veritable-games-site frontend/src/lib/markdown/columns-plugin.ts @ b51c85973 (2026-10-11).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
// @ts-nocheck — VG's tsconfig is looser (no verbatimModuleSyntax / strict hast types); code kept verbatim.
import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';
import type { ContainerDirective } from 'mdast-util-directive';

export function remarkColumns() {
  return (tree: Root) => {
    visit(tree, 'containerDirective', (node: ContainerDirective) => {
      if (node.name !== 'columns') return;

      // Split children on paragraph nodes whose sole text content is "|||"
      const chunks: (typeof node.children)[] = [[]];
      for (const child of node.children) {
        const firstChild = child.type === 'paragraph' ? child.children[0] : undefined;
        if (
          child.type === 'paragraph' &&
          child.children.length === 1 &&
          firstChild?.type === 'text' &&
          firstChild.value.trim() === '|||'
        ) {
          chunks.push([]);
        } else {
          chunks.at(-1)!.push(child as never);
        }
      }

      // Map the containerDirective node to a div.md-columns in hast
      node.data = {
        hName: 'div',
        hProperties: { className: 'md-columns' },
      };

      // Each chunk becomes a div.md-column child
      node.children = chunks.map(chunk => ({
        type: 'containerDirective' as const,
        name: 'column',
        children: chunk,
        attributes: {},
        data: {
          hName: 'div',
          hProperties: { className: 'md-column' },
        },
      })) as never[];
    });
  };
}
