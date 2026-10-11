// Normalises VG's React output and our unified output to the same shape, so the
// parity test compares structure, text, ids and hrefs — not presentation.
// Dropped: class/style and other attributes VG's components add or remove for
// looks, the external-link <svg> icon, VG's outer `prose` div, entity spelling,
// and VG's leaked `node="[object Object]"` attribute (a VG bug, not copied).
import { VG_ORIGIN } from '../library';

export function normaliseForParity(h: string): string {
	return h
		.replace(/^<div class="prose [^"]*">([\s\S]*)<\/div>$/, '$1')
		.replace(/<svg[\s\S]*?<\/svg>/g, '')
		.replace(/\s(class|style|target|rel|loading|decoding|disabled|title|aria-hidden|checked|readonly|readOnly)(="[^"]*")?(?=[\s>/])/g, '')
		.split(VG_ORIGIN).join('')
		.replace(/&#x27;|&#39;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&#x3C;/g, '&lt;')
		.replace(/&#x26;/g, '&amp;')
		.replace(/&gt;|&#x3E;/g, '>')
		.replace(/&#xA0;|&nbsp;/g, ' ')
		.replace(/<br\s*\/?>/g, '<br>')
		.replace(/<(img|input|hr)([^>]*?)\s*\/?>/g, '<$1$2>')
		.replace(/>\s+</g, '><')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/ node="\[object Object\]"/g, '')
		.trim();
}
