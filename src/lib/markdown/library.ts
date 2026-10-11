// Library bodies render through VG's pipeline (library rulings R2), so a
// formatting fix judged here looks the same on veritablegames.com.
//
// Plugin order and pre-processing mirror VG's
// frontend/src/components/ui/HybridMarkdownRenderer.tsx @ b51c85973. VG's
// react-markdown `components` overrides become `rehypeVgPresentation` below:
// they only add classes and restructure a few elements; colour lives in CSS on
// `.lib-prose`, driven by the active palette (R7; `ink` is VG's own colours).
//
// One cwcorella extra: `<ann note="…">` hover annotations, converted BEFORE the
// sanitizer and allowed through it as `span.ann[data-note]`.
//
// Journals and the home page still use `$lib/admin/markdown` (marked); they are
// not library bodies.

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';
import type { Root, Element, ElementContent, Parent } from 'hast';
import { remarkWikiLinks } from './vg/wikilink-plugin';
import { remarkColumns } from './vg/columns-plugin';
import { remarkLiteralTextDirectives } from './vg/literal-text-directives-plugin';
import { rehypeHeadingIds } from './vg/heading-ids-plugin';
import { sanitizeSchema, rehypeFilterStyle } from './vg/sanitize-schema';

/** VG origin: relative links in a body (wiki links, @mentions) resolve there. */
export const VG_ORIGIN = 'https://www.veritablegames.com';

export interface LibraryTocEntry {
	level: 1 | 2 | 3;
	text: string;
	anchor: string;
}

export interface LibraryRenderOptions {
	/** Typeset `$…$` with KaTeX. VG gates this to the `papers` source. */
	math?: boolean;
}

/** VG's gate, until library-api ships `render.math` per document. */
export function shouldUseMath(source: string | undefined | null): boolean {
	return source === 'papers';
}

// ── VG pre-processing (HybridMarkdownRenderer, verbatim regexes) ────────────
export function vgPreprocess(content: string): string {
	let s = content.replace(/(?<![`\[])@([a-zA-Z0-9_-]+)(?![`\]])/g, '[@$1](/profile/$1)');
	s = s.replace(/^:::[ ]*center\s*\n([\s\S]*?)\n:::[ ]*$/gm, '<div class="text-center">$1</div>');
	s = s.replace(/^->[ ]*(.*?)[ ]*<-$/gm, '<div class="text-center">$1</div>');
	return s;
}

// ── cwcorella extra: <ann note> → span.ann (before sanitize) ────────────────
function rehypeAnn() {
	return (tree: Root) => {
		const walk = (node: Parent) => {
			for (const child of node.children) {
				if (child.type !== 'element') continue;
				if (child.tagName === 'ann') {
					const note = child.properties?.note;
					child.tagName = 'span';
					child.properties = { className: ['ann'], dataNote: typeof note === 'string' ? note : '' };
				}
				walk(child);
			}
		};
		walk(tree);
	};
}

const SCHEMA = {
	...sanitizeSchema,
	attributes: {
		...sanitizeSchema.attributes,
		span: [
			...((sanitizeSchema.attributes?.span ?? []).map((a) =>
				Array.isArray(a) && a[0] === 'className' ? [...a, 'ann'] : a
			) as NonNullable<typeof sanitizeSchema.attributes>[string]),
			'dataNote',
		],
	},
};

// ── VG's react-markdown component overrides, as a tree pass ─────────────────
// No language label on code blocks: VG's `pre` override tests `child.type ===
// 'code'`, which never matches under react-markdown 10, so VG renders a plain
// <pre>. Matching what VG actually renders, not what its code intends.
const BLOCK_IN_P = new Set(['pre', 'div', 'blockquote', 'table']);

function el(tagName: string, className: string[], children: ElementContent[]): Element {
	return { type: 'element', tagName, properties: { className }, children };
}

function rehypeVgPresentation() {
	return (tree: Root) => {
		const walk = (node: Parent) => {
			const out: (typeof node.children)[number][] = [];
			for (const child of node.children) {
				if (child.type !== 'element') {
					out.push(child);
					continue;
				}
				walk(child);
				const t = child.tagName;
				// <p> holding a block element renders as a fragment.
				if (t === 'p' && child.children.some((c) => c.type === 'element' && BLOCK_IN_P.has(c.tagName))) {
					out.push(...child.children);
					continue;
				}
				if (t === 'a') {
					const href = String(child.properties?.href ?? '');
					const isMention = href.startsWith('/profile/');
					const isWiki = href.startsWith('/wiki/');
					const isExternal = href.startsWith('http');
					child.properties.className = [isMention ? 'vg-mention' : isWiki ? 'vg-wikilink' : isExternal ? 'vg-external' : 'vg-link'];
					// Relative links point at VG, never at cwcorella (R2).
					if (href.startsWith('/')) child.properties.href = VG_ORIGIN + href;
					if (isExternal || href.startsWith('/')) {
						child.properties.target = '_blank';
						child.properties.rel = ['noopener', 'noreferrer'];
					}
				} else if (t === 'code') {
					// VG renders code as String(children).replace(/\n$/, '').
					const last = child.children[child.children.length - 1];
					if (last?.type === 'text') last.value = last.value.replace(/\n$/, '');
				} else if (t === 'span') {
					// VG's span component re-creates the span from className + style
					// only, so any other attribute (e.g. marker's `id="page-1-0"`) is
					// gone on VG. Match it. KaTeX runs after this pass, untouched.
					const { className, style, dataNote } = child.properties ?? {};
					child.properties = {};
					if (className !== undefined) child.properties.className = className;
					if (style !== undefined) child.properties.style = style;
					if (dataNote !== undefined) child.properties.dataNote = dataNote;
				} else if (t === 'img') {
					child.properties.loading = 'lazy';
					child.properties.decoding = 'async';
					if (child.properties.alt == null) child.properties.alt = '';
				} else if (t === 'input' && child.properties?.type === 'checkbox') {
					child.properties.disabled = true;
				} else if (t === 'table') {
					out.push(el('div', ['vg-table'], [child]));
					continue;
				}
				out.push(child);
			}
			node.children = out as typeof node.children;
		};
		walk(tree);
	};
}

// ── TOC from the same tree the HTML comes from ──────────────────────────────
function textOf(node: ElementContent | Root): string {
	if (node.type === 'text') return node.value;
	if ('children' in node) return (node.children as ElementContent[]).map(textOf).join('');
	return '';
}

function collectToc(tree: Root): LibraryTocEntry[] {
	const toc: LibraryTocEntry[] = [];
	const walk = (node: Parent) => {
		for (const child of node.children) {
			if (child.type !== 'element') continue;
			const m = /^h([1-3])$/.exec(child.tagName);
			const id = child.properties?.id;
			if (m && typeof id === 'string' && id) {
				toc.push({ level: Number(m[1]) as 1 | 2 | 3, text: textOf(child).trim(), anchor: id });
				continue;
			}
			walk(child);
		}
	};
	walk(tree);
	return toc;
}

function processor(math: boolean) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const p: any = unified().use(remarkParse).use(remarkGfm);
	if (math) p.use(remarkMath, { singleDollarTextMath: true });
	p.use(remarkBreaks)
		.use(remarkWikiLinks)
		.use(remarkDirective)
		.use(remarkLiteralTextDirectives)
		.use(remarkColumns)
		.use(remarkRehype, { allowDangerousHtml: true })
		.use(rehypeRaw)
		.use(rehypeAnn)
		.use(rehypeSanitize, SCHEMA)
		.use(rehypeFilterStyle)
		.use(rehypeHeadingIds);
	// Presentation before KaTeX: VG's components pass KaTeX output through untouched.
	p.use(rehypeVgPresentation);
	if (math) p.use(rehypeKatex);
	p.use(rehypeStringify);
	return p;
}

let _memo: { key: string; html: string; toc: LibraryTocEntry[] } | null = null;

/** Render once; `renderLibraryMarkdown` and `libraryToc` share the result. */
export function renderLibrary(md: string, opts: LibraryRenderOptions = {}): { html: string; toc: LibraryTocEntry[] } {
	const math = !!opts.math;
	const key = (math ? '1' : '0') + md;
	if (_memo && _memo.key === key) return _memo;
	const p = processor(math);
	const tree = p.runSync(p.parse(vgPreprocess(md))) as Root;
	const toc = collectToc(tree);
	const html = String(p.stringify(tree));
	_memo = { key, html, toc };
	return _memo;
}

export function renderLibraryMarkdown(md: string, opts?: LibraryRenderOptions): string {
	return renderLibrary(md, opts).html;
}

export function libraryToc(md: string, opts?: LibraryRenderOptions): LibraryTocEntry[] {
	return renderLibrary(md, opts).toc;
}
