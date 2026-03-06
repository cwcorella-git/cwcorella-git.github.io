import { describe, it, expect } from 'vitest';
import { extractToc, renderMarkdown, type TocEntry } from './markdown.js';

describe('extractToc', () => {
	it('extracts h1, h2, h3 headings with correct levels', () => {
		const md = '# Title\n\n## Section\n\n### Subsection\n';
		const toc = extractToc(md);
		expect(toc).toHaveLength(3);
		expect(toc[0].level).toBe(1);
		expect(toc[1].level).toBe(2);
		expect(toc[2].level).toBe(3);
	});

	it('captures heading text correctly', () => {
		const md = '# My Great Title\n\n## Another Section\n';
		const toc = extractToc(md);
		expect(toc[0].text).toBe('My Great Title');
		expect(toc[1].text).toBe('Another Section');
	});

	it('slugifies anchors: lowercase and spaces to hyphens', () => {
		const md = '# Hello World\n';
		const toc = extractToc(md);
		expect(toc[0].anchor).toBe('hello-world');
	});

	it('slugifies anchors: strips special characters', () => {
		const md = '## TypeScript & You! (A Guide)\n';
		const toc = extractToc(md);
		// Non-word chars (except spaces and -) are removed
		expect(toc[0].anchor).toBe('typescript-you-a-guide');
	});

	it('returns empty array for markdown with no headings', () => {
		const md = 'Just a paragraph.\n\nAnother paragraph.\n';
		expect(extractToc(md)).toHaveLength(0);
	});

	it('ignores h4 and deeper headings', () => {
		const md = '#### Deep heading\n\n##### Even deeper\n';
		const toc = extractToc(md);
		expect(toc).toHaveLength(0);
	});

	it('handles mixed heading levels in order', () => {
		const md = '## First\n\n# Second\n\n### Third\n';
		const toc = extractToc(md);
		expect(toc).toHaveLength(3);
		expect(toc[0].level).toBe(2);
		expect(toc[1].level).toBe(1);
		expect(toc[2].level).toBe(3);
	});

	it('anchor for single-word heading is just the lowercased word', () => {
		const md = '# Introduction\n';
		const toc = extractToc(md);
		expect(toc[0].anchor).toBe('introduction');
	});
});

describe('renderMarkdown', () => {
	it('renders a paragraph as <p> tag', () => {
		const html = renderMarkdown('Hello world.');
		expect(html).toContain('<p>');
		expect(html).toContain('Hello world.');
		expect(html).toContain('</p>');
	});

	it('renders headings with id attributes based on slugified text', () => {
		const html = renderMarkdown('# My Heading\n');
		expect(html).toContain('id="my-heading"');
		expect(html).toContain('<h1');
		expect(html).toContain('My Heading');
	});

	it('renders h2 with correct id', () => {
		const html = renderMarkdown('## Section Title\n');
		expect(html).toContain('<h2');
		expect(html).toContain('id="section-title"');
	});

	it('renders h3 with correct id', () => {
		const html = renderMarkdown('### Sub Section\n');
		expect(html).toContain('<h3');
		expect(html).toContain('id="sub-section"');
	});

	it('renders bold text', () => {
		const html = renderMarkdown('Some **bold** text.');
		expect(html).toContain('<strong>bold</strong>');
	});

	it('renders multiple elements correctly', () => {
		const md = '# Title\n\nA paragraph.\n\n## Section\n\nAnother paragraph.\n';
		const html = renderMarkdown(md);
		expect(html).toContain('id="title"');
		expect(html).toContain('id="section"');
		expect(html).toContain('<p>');
	});
});
