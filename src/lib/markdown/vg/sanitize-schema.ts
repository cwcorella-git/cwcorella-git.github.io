// Ported verbatim from veritable-games-site frontend/src/lib/markdown/sanitize-schema.ts @ b51c85973 (2026-10-11).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
import { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';
import type { Root, Element, Parent } from 'hast';
import { DOCUMENT_TEXT_COLORS } from './text-colors';

/**
 * Render-time sanitizer schema for HybridMarkdownRenderer (wiki + library).
 *
 * GitHub's default schema, widened by exactly what this site's markdown
 * pipeline and existing content emit:
 * - `span` colour classes (lib/markdown/text-colors.ts) — the only span classes
 *   with CSS behind them.
 * - `div` `text-center` (the `::: center` / `-> <-` preprocess) and
 *   `md-columns`/`md-column` (columns-plugin).
 * - `code` `language-*` plus remark-math's `math-inline`/`math-display`
 *   (rehype-katex runs AFTER the sanitizer, so its output is trusted).
 * - `u`, `mark`, `figure`, `figcaption`.
 * - `style` on span/div/img, then narrowed by `rehypeFilterStyle` below.
 *
 * `clobberPrefix: ''` keeps ids (footnotes, user anchors) as authored; heading
 * ids are assigned after sanitizing by rehypeHeadingIds.
 *
 * Relative `src`/`href` values carry no protocol, so the protocol allowlist
 * leaves them alone (library figures rely on that).
 */
const COLOR_CLASSES = Object.keys(DOCUMENT_TEXT_COLORS);

export const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  tagNames: [...(defaultSchema.tagNames ?? []), 'span', 'div', 'u', 'mark', 'figure', 'figcaption'],
  // `<style>`/`<title>` bodies would otherwise survive as visible text once the
  // tag is dropped (pasted HTML documents in old wiki pages).
  strip: [...(defaultSchema.strip ?? []), 'style', 'title'],
  // The default *forces* type=checkbox onto every <input>, which turned a raw
  // `<input type="text">` into a checkbox. Without it a non-checkbox type is
  // dropped and the renderer's `input` component renders nothing, as before.
  required: {},
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span ?? []), ['className', ...COLOR_CLASSES], 'style'],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      ['className', 'text-center', 'md-columns', 'md-column'],
      'style',
    ],
    code: [['className', /^language-./, 'math-inline', 'math-display']],
    img: [
      ...(defaultSchema.attributes?.img ?? []),
      'src',
      'alt',
      'title',
      'width',
      'height',
      'style',
    ],
    a: [...(defaultSchema.attributes?.a ?? []), 'href', 'title'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

const COLOR_VALUE =
  /^(#[0-9a-f]{3,8}|[a-z]{3,20}|rgba?\(\s*[\d.%\s,/]+\)|hsla?\(\s*[\d.%\s,/]+(deg)?[\d.%\s,/]*\))$/i;
const LENGTH_VALUE = /^\d{1,4}(\.\d{1,3})?(px|%|em|rem)?$/i;

const ALLOWED_STYLE: Record<string, Record<string, RegExp>> = {
  span: { color: COLOR_VALUE, 'text-align': /^(left|right|center|justify)$/i },
  div: { color: COLOR_VALUE, 'text-align': /^(left|right|center|justify)$/i },
  // The wiki's image tutorial sizes images with `style="width: 50%"`.
  img: { width: LENGTH_VALUE, height: LENGTH_VALUE, 'max-width': LENGTH_VALUE },
};

/** Keep only simple, allowlisted declarations; drop the attribute if none survive. */
export function filterStyle(tagName: string, style: string): string | undefined {
  const allowed = ALLOWED_STYLE[tagName];
  if (!allowed) return undefined;
  const kept: string[] = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    const re = allowed[prop];
    if (re && re.test(value)) kept.push(`${prop}: ${value}`);
  }
  return kept.length ? kept.join('; ') : undefined;
}

/** Rehype plugin: runs after rehype-sanitize and narrows any surviving `style`. */
export function rehypeFilterStyle() {
  return (tree: Root) => {
    const walk = (node: Parent) => {
      for (const child of node.children) {
        if (child.type !== 'element') continue;
        const el = child as Element;
        const style = el.properties?.style;
        if (style !== undefined) {
          const filtered = typeof style === 'string' ? filterStyle(el.tagName, style) : undefined;
          if (filtered) el.properties.style = filtered;
          else delete el.properties.style;
        }
        walk(el);
      }
    };
    walk(tree);
  };
}
