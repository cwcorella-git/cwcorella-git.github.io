// Ported verbatim from veritable-games-site frontend/src/lib/markdown/front-matter.ts @ eeca71c9ef (2026-11-24).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
// @ts-nocheck — code kept verbatim.
/**
 * Split a leading YAML front-matter block off a markdown body.
 *
 * Converted library documents start with a header (title, source_path,
 * source_md5, converter, ...). Without this step the renderer draws it as a
 * horizontal rule plus a stray heading, and the contents list and previews read
 * its lines as prose.
 *
 * Deliberately narrow: a block counts only when it opens on the first line
 * (after an optional BOM) with `---`, closes with `---` or `...`, and every line
 * inside is a `key: value`, a list item, an indented continuation, a comment or
 * blank. Anything else is body, so a document that opens with an ordinary
 * horizontal rule is left alone. LF and CRLF both work.
 *
 */
export interface FrontMatterSplit {
  data: Record<string, string>;
  body: string;
}

const KEY_LINE = /^[A-Za-z_][A-Za-z0-9_-]*:(\s|$)/;
const OTHER_OK = /^(\s*$|\s*#|\s+\S|-\s)/;

export function splitFrontMatter(md: string): FrontMatterSplit {
  const text = md.charCodeAt(0) === 0xfeff ? md.slice(1) : md;
  const lines = text.split(/\r\n|\n|\r/);
  if (lines[0]?.trimEnd() !== '---') return { data: {}, body: md };

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    const t = lines[i]!.trimEnd();
    if (t === '---' || t === '...') {
      close = i;
      break;
    }
  }
  if (close < 2) return { data: {}, body: md };

  const data: Record<string, string> = {};
  for (let i = 1; i < close; i++) {
    const line = lines[i]!;
    if (KEY_LINE.test(line)) {
      const at = line.indexOf(':');
      data[line.slice(0, at).trim()] = line
        .slice(at + 1)
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2');
    } else if (!OTHER_OK.test(line)) {
      return { data: {}, body: md };
    }
  }
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return { data, body: lines.slice(close + 1).join(eol).replace(/^(\r?\n)+/, '') };
}

export function stripFrontMatter(md: string): string {
  return splitFrontMatter(md).body;
}
