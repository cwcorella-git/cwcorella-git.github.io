// Renders every fixture through VG's own HybridMarkdownRenderer. Run from the VG
// frontend dir; see scripts/vg-parity/README.md.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HybridMarkdownRenderer } from '@/components/ui/HybridMarkdownRenderer';
const dir = process.argv[2], out = process.argv[3];
const res: Record<string, string> = {};
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
  const md = fs.readFileSync(path.join(dir, f), 'utf8');
  const math = f.includes('papers--');
  try { res[f] = renderToStaticMarkup(React.createElement(HybridMarkdownRenderer, { content: md, math })); }
  catch (e) { res[f] = 'ERROR ' + String(e); }
}
fs.writeFileSync(out, JSON.stringify(res, null, 1) + '\n');
