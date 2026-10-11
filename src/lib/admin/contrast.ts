// Metadata colour (--clr-meta), computed so it is always legible.
//
// Metadata used to be the text colour at opacity 0.45–0.65, which on glass over
// a mid-tone ground fell well under 4.5:1 (the 2026-10-11 renders). Instead,
// meta is the text colour mixed toward the panel it sits on, by the LARGEST
// amount (up to MAX_MIX) that still keeps WCAG 4.5:1 against that panel. Pure,
// so the palette refresh can be checked numerically (contrast.test.ts).

export type RGB = [number, number, number];

const MAX_MIX = 0.4;
/** Daylight below which a light-glass palette's ground turns dark. */
const TWILIGHT = 0.3;
const MIN_RATIO = 4.5;

function channel(c: number): number {
	const s = c / 255;
	return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: RGB): number {
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: RGB, b: RGB): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

export function mix(a: RGB, b: RGB, t: number): RGB {
	return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}

/** `#rgb`, `#rrggbb`, `rgb(…)` or `rgba(…)` — alpha returned separately (1 if absent). */
export function parseColor(css: string): { rgb: RGB; alpha: number } {
	const s = css.trim();
	if (s.startsWith('#')) {
		const h = s.length === 4 ? [...s.slice(1)].map((c) => c + c).join('') : s.slice(1, 7);
		return { rgb: [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB, alpha: 1 };
	}
	const n = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
	return { rgb: [n[0], n[1], n[2]] as RGB, alpha: n[3] ?? 1 };
}

/** The colour a translucent panel actually shows over the page ground. */
export function composite(panel: RGB, alpha: number, ground: RGB): RGB {
	return mix(ground, panel, alpha);
}

/** Metadata colour for `text` on `panel`: as soft as MAX_MIX, never under 4.5:1. */
export function metaFor(text: RGB, panel: RGB): RGB {
	for (let t = MAX_MIX; t > 0; t -= 0.02) {
		const m = mix(text, panel, t);
		if (contrast(m, panel) >= MIN_RATIO) return m;
	}
	return text;
}

export const rgbCss = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;

export interface LightPaletteSeeds {
	bodyBg: string;
	glassDay: RGB;
	glassNight: RGB;
	textDay: RGB;
	textNight: RGB;
}

export interface LightFrame {
	ground: RGB;      // --body-bg
	glass: RGB;       // --glass-* base colour
	glassAlpha: number; // --glass-bg alpha
	panel: RGB;       // what a panel actually shows: glass over ground
	text: RGB;        // --clr-text / --clr-dark-text
	meta: RGB;        // --clr-meta
}

/**
 * One frame of a light-glass palette at daylight `dl` (1 = noon, 0 = night).
 * The single source for Sky.svelte and contrast.test.ts.
 *
 * Until 2026-10-11 the ground (--body-bg) stayed at its daytime colour all
 * night, so the darkening glass composited to mid-grey under pale night text:
 * sky measured 2.9:1 at midnight, 1.3:1 at dusk. Now the ground turns dark at
 * twilight, and the text is whichever of day/night reads better on the
 * panel actually shown — so there is no cross-fade through illegible.
 */
export function lightFrame(p: LightPaletteSeeds, dl: number): LightFrame {
	const night = 1 - dl;
	const glass = mix(p.glassDay, p.glassNight, night);
	const glassAlpha = 0.22 * dl + 0.42 * night;
	// The ground switches at twilight instead of fading: any continuous fade from a
	// light to a dark ground passes a mid-grey on which neither the day nor the
	// night text reaches 4.5:1 (~3.7:1 at worst for these seeds). The 1.5s
	// --t-theme CSS transition smooths the switch on screen.
	const ground = dl < TWILIGHT ? mix(p.glassNight, [0, 0, 0], 0.25) : parseColor(p.bodyBg).rgb;
	const panel = composite(glass, glassAlpha, ground);
	const text = contrast(p.textDay, panel) >= contrast(p.textNight, panel) ? p.textDay : p.textNight;
	return { ground, glass, glassAlpha, panel, text, meta: metaFor(text, panel) };
}
