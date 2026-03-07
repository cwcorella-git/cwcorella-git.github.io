// ── Palette system ─────────────────────────────────────────────────────────
// Four named palettes. Each defines the CSS seed vars that cascade into all
// borders, glass tints, body background, and dark-panel colours. Garden.svelte
// reads glassDay/glassNight/textDay/textNight to interpolate --clr-text and
// the three --glass-* vars per-frame as the sun moves.

export type PaletteName = 'amber' | 'sky' | 'dusk' | 'neutral';

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
	// Garden.svelte does NOT override them per-frame.
	darkGlass: boolean;
	glassFixed?: string;        // --glass-bg  (main content panels)
	glassBorderFixed?: string;  // --glass-border
	glassNavBgFixed?: string;   // --glass-nav-bg
	glassHeavyFixed?: string;   // --glass-bg-heavy (fullscreen overlays)
	// Garden.svelte seeds for per-frame day↔night interpolation (light-glass only)
	glassDay: [number, number, number];   // RGB at full day
	glassNight: [number, number, number]; // RGB at full night
	textDay: [number, number, number];    // --clr-text at full day
	textNight: [number, number, number];  // --clr-text at full night
	// Optional: if set, Garden.svelte also interpolates --dark-panel-rgb per-frame
	darkPanelDay?:   [number, number, number];
	darkPanelNight?: [number, number, number];
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
		clrDarkText:  '#c8b890',          // warm amber text — readable on near-black
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
		textDay:    [200, 184, 144],  // #c8b890 — same day and night (always dark site)
		textNight:  [200, 184, 144],
		swatchBg:     '#0c0902',
		swatchBorder: '#c8a060',
	},
	sky: {
		label: 'sky',
		uiRgb:        '140, 168, 210',     // cool sky-blue light-context chrome
		darkPanelRgb: '108, 152, 228',     // brighter sky-blue chrome
		bodyBg:       '#c0cede',            // soft grey-blue canvas fallback
		clrDarkText:  '#ccddf8',           // bright cool blue-white — high contrast on deep navy
		glassBgDark:     'rgba(8, 14, 40, 0.92)',     // deep saturated navy dark panels
		glassBorderDark: 'rgba(120, 170, 255, 0.26)', // bright sky-blue accent border
		// Light-glass: adapts with time of day — both light panels AND dark-panel chrome
		darkGlass: false,
		glassDay:   [210, 228, 250],   // pale sky-blue at noon
		glassNight: [8,   12,  28 ],   // deep midnight
		textDay:    [12,  16,  28 ],   // near-black on pale panels
		textNight:  [205, 218, 240],   // cool blue-white on dark panels
		// Adaptive dark-panel RGB: blue inputs at day, indigo at night
		darkPanelDay:   [108, 152, 228],
		darkPanelNight: [22,  28,  62 ],
		swatchBg:     '#b0c4dc',
		swatchBorder: '#5890d0',
	},
	dusk: {
		label: 'dusk',
		uiRgb:        '148, 110, 178',     // muted violet light-context chrome
		darkPanelRgb: '175, 130, 205',     // mauve tint for panel chrome
		bodyBg:       '#0e0a16',            // deep purple-black
		clrDarkText:  '#c0b4d0',           // muted mauve — warm-cool on deep purple glass
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
		textDay:    [192, 180, 210],  // #c0b4d2
		textNight:  [192, 180, 210],
		swatchBg:     '#0e0a16',
		swatchBorder: '#a068c0',
	},
	neutral: {
		label: 'neutral',
		uiRgb:        '128, 128, 128',
		darkPanelRgb: '232, 232, 238',   // near-white — high contrast chrome
		bodyBg:       '#d8d8d8',
		clrDarkText:  '#eaeaee',          // near-white — maximum contrast on pure black
		glassBgDark:     'rgba(6, 6, 8, 0.92)',       // pure near-black panels
		glassBorderDark: 'rgba(232, 232, 238, 0.24)', // bright near-white border
		darkGlass: false,
		glassDay:   [255, 255, 255],
		glassNight: [8,   6,   2  ],
		textDay:    [8,   8,   8  ],
		textNight:  [248, 246, 242],
		swatchBg:     '#d8d8d8',
		swatchBorder: '#a0a8b0',
	},
};

const STORAGE_KEY = 'cwc-theme';

// version increments on every palette switch so Garden.svelte can detect
// the change and force a full re-render of glass + text vars immediately.
let _active  = $state<PaletteName>('neutral');
let _version = $state(0);

function applyPalette(name: PaletteName): void {
	const p = PALETTES[name];
	const r = document.documentElement;

	r.style.setProperty('--ui-rgb',            p.uiRgb);
	r.style.setProperty('--dark-panel-rgb',    p.darkPanelRgb);
	r.style.setProperty('--body-bg',           p.bodyBg);
	r.style.setProperty('--clr-dark-text',     p.clrDarkText);
	r.style.setProperty('--glass-bg-dark',     p.glassBgDark);
	r.style.setProperty('--glass-border-dark', p.glassBorderDark);

	if (p.darkGlass) {
		// Dark-glass palettes: set all glass/text vars directly.
		// Garden.svelte detects darkGlass=true and skips per-frame overrides.
		r.style.setProperty('--glass-bg',       p.glassFixed!);
		r.style.setProperty('--glass-border',   p.glassBorderFixed!);
		r.style.setProperty('--glass-nav-bg',   p.glassNavBgFixed!);
		r.style.setProperty('--glass-bg-heavy', p.glassHeavyFixed!);
		r.style.setProperty('--clr-text',
			`rgb(${p.textDay[0]},${p.textDay[1]},${p.textDay[2]})`);
	} else {
		// Light-glass palettes: derive --glass-bg-heavy from glassDay;
		// Garden.svelte handles --glass-bg, --glass-border, --glass-nav-bg, --clr-text per-frame.
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
