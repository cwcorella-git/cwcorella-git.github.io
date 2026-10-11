import { composite, legibleAccent, metaFor, parseColor, rgbCss, type RGB } from './contrast';

// ── Palette system ─────────────────────────────────────────────────────────
// Ten named palettes. Each defines the CSS seed vars that cascade into all
// borders, glass tints, body background, and dark-panel colours. Sky.svelte
// reads glassDay/glassNight/textDay/textNight to interpolate --clr-text and
// the three --glass-* vars per-frame as the sun moves.

export type PaletteName =
	| 'sky' | 'neutral' | 'sage' | 'dawn' | 'paper'
	| 'amber' | 'rust' | 'dusk' | 'forest' | 'ink';

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
	// Solid mode (paper, ink): fixed colours like darkGlass, but opaque panels and
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
	amber: {
		label: 'amber',
		uiRgb:        '160, 120, 60',
		darkPanelRgb: '200, 152, 64',    // amber-gold tint on all dark-panel chrome
		bodyBg:       '#0c0902',          // dark amber body — near-black
		clrDarkText:  '#e2d2a8',          // warm amber text — readable on near-black
		glassBgDark:     'rgba(20, 13, 3, 0.88)',    // dark amber modals — glass feel, not a wall
		glassBorderDark: 'rgba(200, 150, 60, 0.28)', // amber accent border
		// Dark-glass: solid opaque panels — no sky transparency
		darkGlass:        true,
		glassFixed:       'rgba(22, 14, 3, 0.88)',    // main content panels
		glassBorderFixed: 'rgba(200, 150, 60, 0.15)', // amber panel border
		glassNavBgFixed:  'rgba(14, 10, 2, 0.88)',    // nav — lighter touch
		glassHeavyFixed:  'rgba(18, 12, 2, 0.92)',    // fullscreen overlays
		glassDay:   [22,  14,  3  ],  // kept for compat; not used for glass in dark mode
		glassNight: [12,  8,   2  ],
		textDay:    [226, 210, 168],  // #e2d2a8 — refined 2026-10-11 for contrast
		textNight:  [226, 210, 168],
		accent: '#e0a040',
		swatchBg:     '#0c0902',
		swatchBorder: '#c8a060',
	},
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
	dusk: {
		label: 'dusk',
		uiRgb:        '148, 110, 178',     // muted violet light-context chrome
		darkPanelRgb: '175, 130, 205',     // mauve tint for panel chrome
		bodyBg:       '#0e0a16',            // deep purple-black
		clrDarkText:  '#d8cce8',           // muted mauve — warm-cool on deep purple glass
		glassBgDark:     'rgba(24, 14, 36, 0.88)',    // deep purple modals
		glassBorderDark: 'rgba(165, 110, 210, 0.25)', // violet accent border
		// Dark-glass: permanent twilight — panels never shift with sky
		darkGlass:        true,
		glassFixed:       'rgba(30, 18, 44, 0.88)',    // deep purple content panels
		glassBorderFixed: 'rgba(165, 110, 180, 0.16)', // muted violet border
		glassNavBgFixed:  'rgba(18, 11, 28, 0.88)',    // dark purple nav
		glassHeavyFixed:  'rgba(26, 16, 40, 0.92)',    // fullscreen overlays
		glassDay:   [30, 18, 44],  // kept for compat; not used in dark-glass mode
		glassNight: [14,  9, 20],
		textDay:    [216, 204, 232],  // #d8cce8 — refined 2026-10-11
		textNight:  [216, 204, 232],
		accent: '#b48ae0',
		swatchBg:     '#0e0a16',
		swatchBorder: '#a068c0',
	},
	neutral: {
		label: 'neutral',
		uiRgb:        '128, 128, 128',
		darkPanelRgb: '40, 40, 50',      // dark gray — chrome on light neutral panel
		bodyBg:       '#d8d8d8',
		clrDarkText:  '#0a0a0c',          // near-black — matches light neutral panel context
		glassBgDark:     'rgba(150, 150, 158, 0.82)', // initial fallback; Sky.svelte overrides per-frame
		glassBorderDark: 'rgba(80, 80, 90, 0.30)',    // initial fallback; Sky.svelte overrides per-frame
		darkGlass: false,
		glassDay:   [255, 255, 255],
		glassNight: [8,   6,   2  ],
		textDay:    [8,   8,   8  ],
		textNight:  [248, 246, 242],
		// Chrome inside panels: dark at day (on white panels), pale at night (on dark panels)
		darkPanelDay:   [40,  40,  50 ],
		darkPanelNight: [220, 220, 228],
		accent: '#3a3a44',
		swatchBg:     '#d8d8d8',
		swatchBorder: '#a0a8b0',
	},
	sage: {
		label: 'sage',
		uiRgb:        '100, 130, 110',     // muted green-gray light-context chrome
		darkPanelRgb: '60, 110, 90',       // sage tint for overlay chrome
		bodyBg:       '#c4cfc4',            // soft muted gray-green canvas fallback (like sky/neutral, but darker)
		clrDarkText:  '#2a3a2a',            // dark muted green-gray on light panels
		glassBgDark:     'rgba(100, 140, 120, 0.82)', // initial fallback; Sky.svelte overrides per-frame
		glassBorderDark: 'rgba(80, 120, 100, 0.35)',  // initial fallback; Sky.svelte overrides per-frame
		// Light-glass: adapts with time of day — muted cool greens
		darkGlass: false,
		glassDay:   [210, 230, 220],   // pale muted green at noon
		glassNight: [40,  70,  60],    // deeper muted green at night
		textDay:    [24,  48,  36],    // cool dark green on pale panels
		textNight:  [210, 230, 220],   // pale muted green on dark panels
		// Chrome inside panels: sage green at day, pale green at night
		darkPanelDay:   [60,  110, 90],
		darkPanelNight: [170, 210, 190],
		accent: '#2f6b48',
		swatchBg:     '#c4cfc4',
		swatchBorder: '#6a9a7a',
	},
	rust: {
		label: 'rust',
		uiRgb:        '170, 100, 70',      // warm orange-red accent for light-context chrome
		darkPanelRgb: '150, 80, 50',       // warm rust tint for overlay chrome
		bodyBg:       '#1a0e0a',            // very dark warm brown-red (rust-like)
		clrDarkText:  '#ecc0a0',            // warm rust-orange text
		glassBgDark:     'rgba(36, 16, 10, 0.88)',    // deep warm rust glass
		glassBorderDark: 'rgba(180, 110, 70, 0.30)', // warm rust-orange border
		// Dark-glass: permanent bold rust/oxide mood
		darkGlass:        true,
		glassFixed:       'rgba(40, 18, 12, 0.88)',    // deep rust-brown panels
		glassBorderFixed: 'rgba(180, 110, 70, 0.18)', // warm rust border
		glassNavBgFixed:  'rgba(32, 14, 10, 0.88)',    // darker nav
		glassHeavyFixed:  'rgba(36, 16, 12, 0.92)',    // fullscreen overlays
		glassDay:   [40, 18, 12],  // kept for compat; not used in dark-glass mode
		glassNight: [24, 10, 6],
		textDay:    [236, 192, 160],  // #ecc0a0 — refined 2026-10-11
		textNight:  [236, 192, 160],
		accent: '#e07850',
		swatchBg:     '#1a0e0a',
		swatchBorder: '#c87050',
	},
	dawn: {
		label: 'dawn',
		uiRgb:        '190, 120, 90',
		darkPanelRgb: '150, 70, 40',
		bodyBg:       '#e8c8b0',
		clrDarkText:  '#3a2014',
		glassBgDark:     'rgba(240, 210, 190, 0.82)', // initial fallback; Sky.svelte overrides per-frame
		glassBorderDark: 'rgba(150, 90, 60, 0.30)',
		// Light-glass: warm peach panels that follow the day
		darkGlass: false,
		glassDay:   [255, 244, 234],
		glassNight: [30,  16,  10 ],
		textDay:    [58,  32,  20 ],
		textNight:  [246, 226, 210],
		darkPanelDay:   [150, 70,  40 ],
		darkPanelNight: [240, 190, 160],
		accent: '#b04a2a',
		swatchBg:     '#e8c8b0',
		swatchBorder: '#b04a2a',
	},
	paper: {
		label: 'paper',
		uiRgb:        '90, 86, 80',
		darkPanelRgb: '27, 26, 24',
		bodyBg:       '#f3f1ec',
		clrDarkText:  '#1b1a18',
		glassBgDark:     '#fbfaf7',
		glassBorderDark: '#e1dcd2',
		darkGlass:        true,
		solid:            true,
		glassFixed:       '#fbfaf7',
		glassBorderFixed: '#e1dcd2',
		glassNavBgFixed:  '#f3f1ec',
		glassHeavyFixed:  '#fbfaf7',
		glassDay:   [251, 250, 247],
		glassNight: [251, 250, 247],
		textDay:    [27,  26,  24 ],
		textNight:  [27,  26,  24 ],
		accent: '#1d4ed8',
		swatchBg:     '#f3f1ec',
		swatchBorder: '#5a5650',
	},
	forest: {
		label: 'forest',
		uiRgb:        '90, 150, 110',
		darkPanelRgb: '108, 192, 138',
		bodyBg:       '#08110c',
		clrDarkText:  '#cfe2d4',
		glassBgDark:     'rgba(14, 28, 20, 0.88)',
		glassBorderDark: 'rgba(108, 192, 138, 0.28)',
		darkGlass:        true,
		glassFixed:       'rgba(16, 32, 22, 0.88)',
		glassBorderFixed: 'rgba(108, 192, 138, 0.16)',
		glassNavBgFixed:  'rgba(10, 20, 14, 0.88)',
		glassHeavyFixed:  'rgba(14, 28, 20, 0.92)',
		glassDay:   [16, 32, 22],
		glassNight: [10, 20, 14],
		textDay:    [207, 226, 212],
		textNight:  [207, 226, 212],
		accent: '#6cc08a',
		swatchBg:     '#08110c',
		swatchBorder: '#6cc08a',
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
let _active  = $state<PaletteName>('neutral');
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
