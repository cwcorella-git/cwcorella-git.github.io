import { describe, it, expect } from 'vitest';
import { splitFrontMatter, stripFrontMatter } from './front-matter';

const HEADER = [
  '---',
  'title: "Faith: A Study"',
  'source_md5: 8fcb969f516a6293c1be5c2fa93b4913',
  'pages: 152',
  '---',
].join('\n');

describe('splitFrontMatter', () => {
  it('strips a header and returns its fields', () => {
    const r = splitFrontMatter(`${HEADER}\n\n# Body\n\ntext`);
    expect(r.body).toBe('# Body\n\ntext');
    expect(r.data.title).toBe('Faith: A Study');
    expect(r.data.pages).toBe('152');
  });

  it('leaves a document without a header alone', () => {
    expect(stripFrontMatter('# Title\n\ntext')).toBe('# Title\n\ntext');
  });

  it('leaves a leading horizontal rule that is not a header alone', () => {
    const md = '---\n\nA line of prose.\n\n---\n\nmore';
    expect(stripFrontMatter(md)).toBe(md);
  });

  it('does not treat prose between two rules as a header', () => {
    const md = '---\nThis is not yaml at all\n---\nbody';
    expect(stripFrontMatter(md)).toBe(md);
  });

  it('handles CRLF and a BOM', () => {
    const md = '﻿' + HEADER.replace(/\n/g, '\r\n') + '\r\n\r\nbody';
    expect(stripFrontMatter(md)).toBe('body');
  });

  it('accepts ... as the closer', () => {
    expect(stripFrontMatter('---\ntitle: x\n...\nbody')).toBe('body');
  });

  it('keeps an unterminated header as body', () => {
    const md = '---\ntitle: x\nbody';
    expect(stripFrontMatter(md)).toBe(md);
  });

  it('allows list values and comments inside the header', () => {
    expect(stripFrontMatter('---\n# note\ntags:\n  - a\n  - b\ntitle: x\n---\nbody')).toBe('body');
  });

  it('does not strip a header that is not at the very start', () => {
    const md = 'intro\n---\ntitle: x\n---\nbody';
    expect(stripFrontMatter(md)).toBe(md);
  });
});
