// Ported verbatim from veritable-games-site frontend/src/lib/markdown/text-colors.ts @ b51c85973 (2026-10-11).
// Library rulings R2: do not edit locally — re-port from VG so the two renderers cannot drift.
/*
 * The colours a document may use: `<span class="text-blue-400">…</span>`.
 *
 * Inline `style` is stripped by the sanitizer, so colour has to be a class, and
 * a class only has CSS if Tailwind saw it written out somewhere in src/ — which
 * is why every one is spelled in full below rather than built from the name.
 * Any other class on a span is passed through untouched (existing content), but
 * only these are guaranteed to render.
 */
export const DOCUMENT_TEXT_COLORS: Record<string, string> = {
  'text-red-400': 'text-red-400',
  'text-orange-400': 'text-orange-400',
  'text-amber-400': 'text-amber-400',
  'text-yellow-400': 'text-yellow-400',
  'text-green-400': 'text-green-400',
  'text-emerald-400': 'text-emerald-400',
  'text-teal-400': 'text-teal-400',
  'text-cyan-400': 'text-cyan-400',
  'text-sky-400': 'text-sky-400',
  'text-blue-400': 'text-blue-400',
  'text-indigo-400': 'text-indigo-400',
  'text-violet-400': 'text-violet-400',
  'text-purple-400': 'text-purple-400',
  'text-fuchsia-400': 'text-fuchsia-400',
  'text-pink-400': 'text-pink-400',
  'text-rose-400': 'text-rose-400',
  'text-gray-400': 'text-gray-400',
  'text-gray-500': 'text-gray-500',
};

/**
 * Inside a coloured span, `em`/`strong`/`a` carry their own text colour from
 * the renderer and would repaint the span's text grey. This makes them inherit.
 */
export const COLORED_SPAN_INHERIT =
  '[&_em]:text-inherit [&_strong]:text-inherit [&_a]:text-inherit';

export function hasDocumentTextColor(className: string | undefined): boolean {
  return !!className && className.split(/\s+/).some(c => c in DOCUMENT_TEXT_COLORS);
}
