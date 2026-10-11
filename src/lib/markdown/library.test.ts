import { describe, it, expect } from 'vitest';
import { renderLibraryMarkdown, libraryToc, shouldUseMath, VG_ORIGIN } from './library';

describe('library renderer (VG pipeline, R2)', () => {
	it('strips live <script> from a body (Hack This Zine case)', () => {
		const html = renderLibraryMarkdown('Hello\n\n<script>alert(1)</script>\n\nafter');
		expect(html).not.toContain('<script');
		expect(html).toContain('after');
	});

	it('keeps <ann note> hover annotations through the sanitizer', () => {
		const html = renderLibraryMarkdown('A <ann note="a gloss">word</ann> here.');
		expect(html).toContain('class="ann"');
		expect(html).toContain('data-note="a gloss"');
		expect(html).toContain('>word</span>');
	});

	it('numbers repeated headings like VG and the TOC uses the same ids', () => {
		const md = '# Notes\n\ntext\n\n## Notes\n\n### Other\n';
		const html = renderLibraryMarkdown(md);
		expect(html).toContain('<h1 id="notes">');
		expect(html).toContain('<h2 id="notes-2">');
		expect(libraryToc(md).map((e) => e.anchor)).toEqual(['notes', 'notes-2', 'other']);
	});

	it('skips punctuation-only and Cyrillic headings in the TOC (no id to jump to)', () => {
		const md = '# ***\n\n# Глава\n\n# Real\n';
		expect(libraryToc(md).map((e) => e.anchor)).toEqual(['real']);
	});

	it('leaves currency dollars literal unless math is on', () => {
		const md = 'It cost $5 and $10.';
		expect(renderLibraryMarkdown(md)).toContain('$5 and $10');
		expect(renderLibraryMarkdown('$x^2$', { math: true })).toContain('katex');
	});

	it('gates math to the papers source', () => {
		expect(shouldUseMath('papers')).toBe(true);
		expect(shouldUseMath('anarchist')).toBe(false);
	});

	it('points wiki links and mentions at VG, never at cwcorella', () => {
		const html = renderLibraryMarkdown('See [[Mutual Aid]] and @someone.');
		expect(html).toContain(`href="${VG_ORIGIN}/wiki/mutual-aid"`);
		expect(html).toContain(`href="${VG_ORIGIN}/profile/someone"`);
	});

	it('applies remark-breaks: a single newline is a <br>', () => {
		expect(renderLibraryMarkdown('one\ntwo')).toContain('<br>');
	});

	it('renders VG columns and centre blocks', () => {
		const html = renderLibraryMarkdown('::: center\nmid\n:::\n\n:::columns\n::column\nA\n::column\nB\n:::');
		expect(html).toContain('text-center');
	});
});
