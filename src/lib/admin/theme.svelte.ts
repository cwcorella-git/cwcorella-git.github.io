import { composite, legibleAccent, metaFor, parseColor, rgbCss, type RGB } from './contrast';

// ── Palette system ─────────────────────────────────────────────────────────
// Two palettes: `sky`, the site's look, and `ink`, VG's colours for judging
// library formatting (rulings R8). The other eight were retired 2026-10-21 for
// one committed look. Each defines the CSS seed vars that cascade into all
// borders, glass tints, body background, and dark-panel colours. Sky.svelte
// reads glassDay/glassNight/textDay/textNight to interpolate --clr-text and
// the three --glass-* vars per-frame as the sun moves.

export type PaletteName = 'sky' | 'ink';

export interface Palette {
	label: string;
	// CSS vars written once on palette switch
	uiRgb: string;           // seed for rgba(var(--ui-rgb), x) — light-context borders/fills
	darkPanelRgb: string;    // seed for rgba(var(--dark-panel-rgb), x) — dark-panel chrome
	bodyBg: string;          // canvas fallback background
	clrDarkText: string;     // text on dark glass panels
	glassBgDark: string;     // dark panel background
	glassBorderDark: string; // dark panel outer border
	// Dark-glass mode: applyPalette sets all glass/text vars directly;
	// Sky.svelte does NOT override them per-frame.
	darkGlass: boolean;
	// Solid mode (ink): fixed colours like darkGlass, but opaque panels and
	// no backdrop blur. Requires darkGlass=true so Sky.svelte leaves it alone.
	// `ink` is the VG-fidelity palette (rulings R8): its values are VG's dark prose.
	solid?: boolean;
	glassFixed?: string;        // --glass-bg  (main content panels)
	glassBorderFixed?: string;  // --glass-border
	glassNavBgFixed?: string;   // --glass-nav-bg
	glassHeavyFixed?: string;   // --glass-bg-heavy (fullscreen overlays)
	// Sky.svelte seeds for per-frame day↔night interpolation (light-glass only)
	glassDay: [number, number, number];   // RGB at full day
	glassNight: [number, number, number]; // RGB at full night
	textDay: [number, number, number];    // --clr-text at full day
	textNight: [number, number, number];  // --clr-text at full night
	// Optional: if set, Sky.svelte also interpolates --dark-panel-rgb per-frame
	darkPanelDay?:   [number, number, number];
	darkPanelNight?: [number, number, number];
	// Link/accent colour inside library bodies (--pal-lib-link).
	accent: string;
	// Full library-body colour set, overriding the derived defaults in
	// lib-prose.css. Only `ink` has one: VG's exact neutrals (rulings R8).
	libProse?: Partial<Record<'text' | 'strong' | 'soft' | 'dim' | 'rule' | 'code-bg' | 'pre-bg' | 'ext' | 'mention', string>>;
	// Swatch preview colours shown in ThemePanel
	swatchBg: string;
	swatchBorder: string;
}

export const PALETTES: Record<PaletteName, Palette> = {
	sky: {
		label: 'sky',
		uiRgb:        '140, 168, 210',     // cool sky-blue light-context chrome
		darkPanelRgb: '20, 55, 130',       // dark navy — chrome on light sky panel
		bodyBg:       '#c0cede',            // soft grey-blue canvas fallback
		clrDarkText:  '#0c1420',            // dark text — matches light sky panel context
		glassBgDark:     'rgba(130, 168, 220, 0.82)', // initial fallback; Sky.svelte overrides per-frame
		glassBorderDark: 'rgba(130, 168, 220, 0.35)', // initial fallback; Sky.svelte overrides per-frame
		// Light-glass: adapts with time of day — both light panels AND dark-panel chrome
		darkGlass: false,
		glassDay:   [210, 228, 250],   // pale sky-blue at noon
		glassNight: [8,   12,  28 ],   // deep midnight
		textDay:    [12,  16,  28 ],   // near-black on pale panels
		textNight:  [205, 218, 240],   // cool blue-white on dark panels
		// Chrome inside panels: dark navy at day, pale blue-white at night (visible on dark panels)
		darkPanelDay:   [20,  55,  130],
		darkPanelNight: [120, 170, 240],
		accent: '#2456a8',
		swatchBg:     '#b0c4dc',
		swatchBorder: '#5890d0',
	},
	ink: {
		label: 'ink',
		uiRgb:        '163, 163, 163',
		darkPanelRgb: '237, 237, 237',
		bodyBg:       '#0a0a0a',            // VG --background
		clrDarkText:  '#ededed',            // VG --foreground
		glassBgDark:     '#121212',
		glassBorderDark: '#262626',
		darkGlass:        true,
		solid:            true,
		glassFixed:       '#121212',
		glassBorderFixed: '#262626',
		glassNavBgFixed:  '#0a0a0a',
		glassHeavyFixed:  '#121212',
		glassDay:   [18, 18, 18],
		glassNight: [18, 18, 18],
		textDay:    [237, 237, 237],
		textNight:  [237, 237, 237],
		accent: '#60a5fa',
		// VG: gray-300/white/gray-200/gray-400/gray-600/gray-800/gray-900, with
		// gray remapped to neutral (SITE_STYLE.md); green-400 external, pink-400 mention.
		libProse: {
			text: '#d4d4d4', strong: '#ffffff', soft: '#e5e5e5', dim: '#a3a3a3',
			rule: '#525252', 'code-bg': '#262626', 'pre-bg': '#171717',
			ext: '#4ade80', mention: '#f472b6',
		},
		swatchBg:     '#0a0a0a',
		swatchBorder: '#60a5fa',
	},
};

const STORAGE_KEY = 'cwc-theme';

// version increments on every palette switch so Sky.svelte can detect
// the change and force a full re-render of glass + text vars immediately.
let _active  = $state<PaletteName>('sky');
let _version = $state(0);

/** --clr-meta for a fixed (darkGlass/solid) palette. Exported for contrast.test.ts. */
export function fixedMeta(p: Palette): RGB {
	const glass = parseColor(p.glassFixed!);
	const panel = composite(glass.rgb, glass.alpha, parseColor(p.bodyBg).rgb);
	return metaFor(p.textDay, panel);
}

/** --pal-lib-link for a fixed palette, at >= 4.5:1 on its panel. */
export function fixedAccent(p: Palette): RGB {
	const glass = parseColor(p.glassFixed!);
	const panel = composite(glass.rgb, glass.alpha, parseColor(p.bodyBg).rgb);
	return legibleAccent(parseColor(p.accent).rgb, p.textDay, panel);
}

function applyPalette(name: PaletteName): void {
	const p = PALETTES[name];
	const r = document.documentElement;

	r.style.setProperty('--ui-rgb',            p.uiRgb);
	r.style.setProperty('--dark-panel-rgb',    p.darkPanelRgb);
	r.style.setProperty('--body-bg',           p.bodyBg);
	r.style.setProperty('--clr-dark-text',     p.clrDarkText);
	r.style.setProperty('--glass-bg-dark',     p.glassBgDark);
	r.style.setProperty('--glass-border-dark', p.glassBorderDark);

	// Library-body colours (lib-prose.css reads --pal-lib-*, with fallbacks).
	// Fixed palettes: accent made legible once; light-glass: Sky.svelte per frame.
	r.style.setProperty('--pal-lib-link', p.darkGlass ? rgbCss(fixedAccent(p)) : p.accent);
	for (const k of ['text', 'strong', 'soft', 'dim', 'rule', 'code-bg', 'pre-bg', 'ext', 'mention'] as const) {
		const v = p.libProse?.[k];
		if (v) r.style.setProperty(`--pal-lib-${k}`, v);
		else r.style.removeProperty(`--pal-lib-${k}`);
	}

	// Solid palettes drop the frosted blur; every other palette restores it.
	r.style.setProperty('--glass-blur',       p.solid ? 'none' : 'blur(22px)');
	r.style.setProperty('--glass-blur-heavy', p.solid ? 'none' : 'blur(28px)');
	r.style.setProperty('--glass-blur-nav',   p.solid ? 'none' : 'blur(20px)');
	// One edge of light along the top of a glass panel; solid panels have none.
	r.style.setProperty('--glass-edge',       p.solid ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.35)');

	if (p.darkGlass) {
		// Fixed palettes: metadata colour against the panel as actually shown
		// (panel glass over the page ground). Light-glass: Sky.svelte, per frame.
		r.style.setProperty('--clr-meta', rgbCss(fixedMeta(p)));
		// Dark-glass palettes: set all glass/text vars directly.
		// Sky.svelte detects darkGlass=true and skips per-frame overrides.
		r.style.setProperty('--glass-bg',       p.glassFixed!);
		r.style.setProperty('--glass-border',   p.glassBorderFixed!);
		r.style.setProperty('--glass-nav-bg',   p.glassNavBgFixed!);
		r.style.setProperty('--glass-bg-heavy', p.glassHeavyFixed!);
		r.style.setProperty('--clr-text',
			`rgb(${p.textDay[0]},${p.textDay[1]},${p.textDay[2]})`);
	} else {
		// Light-glass palettes: derive --glass-bg-heavy from glassDay;
		// Sky.svelte handles --glass-bg, --glass-border, --glass-nav-bg, --clr-text per-frame.
		const [dr, dg, db] = p.glassDay;
		r.style.setProperty('--glass-bg-heavy', `rgba(${dr}, ${dg}, ${db}, 0.78)`);
	}

	_active = name;
	_version++;
	try { localStorage.setItem(STORAGE_KEY, name); } catch { /* ignore */ }
}

export const themeState = {
	get active()   { return _active; },
	get version()  { return _version; },
	get palette()  { return PALETTES[_active]; },
	applyPalette,
	restoreFromStorage(): void {
		if (typeof localStorage === 'undefined') return;
		const saved = localStorage.getItem(STORAGE_KEY) as PaletteName | null;
		// Always apply palette on init so all CSS vars (incl. --dark-panel-rgb) are set
		applyPalette(saved && PALETTES[saved] ? saved : _active);
	},
};
