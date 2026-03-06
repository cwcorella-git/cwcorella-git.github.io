// ── Palette system ─────────────────────────────────────────────────────────
// Four named palettes. Each defines the CSS seed vars that cascade into all
// borders, glass tints, body background, and dark-panel colours. Garden.svelte
// reads glassDay/glassNight/textDay/textNight to interpolate --clr-text and
// the three --glass-* vars per-frame as the sun moves.

export type PaletteName = 'amber' | 'beige' | 'gray' | 'neutral';

export interface Palette {
	label: string;
	// CSS vars written once on palette switch
	uiRgb: string;           // seed for rgba(var(--ui-rgb), x) — light-context borders/fills
	darkPanelRgb: string;    // seed for rgba(var(--dark-panel-rgb), x) — dark-panel chrome
	                         //   amber: amber-gold tint · neutral/gray: white · beige: warm tan
	bodyBg: string;          // canvas fallback background
	clrDarkText: string;     // text on dark glass panels
	glassBgDark: string;     // dark panel background
	glassBorderDark: string; // dark panel outer border
	// Garden.svelte seeds for per-frame day↔night interpolation
	glassDay: [number, number, number];   // RGB at full day
	glassNight: [number, number, number]; // RGB at full night
	textDay: [number, number, number];    // --clr-text at full day
	textNight: [number, number, number];  // --clr-text at full night
	// Swatch preview colours shown in ThemePanel
	swatchBg: string;
	swatchBorder: string;
}

export const PALETTES: Record<PaletteName, Palette> = {
	amber: {
		label: 'amber',
		uiRgb:        '160, 120, 60',
		darkPanelRgb: '200, 150, 60',    // amber-gold tint on all dark-panel chrome
		bodyBg:       '#e8d5b0',
		clrDarkText:  '#c8b890',
		glassBgDark:     'rgba(45, 30, 6, 0.90)',    // dark amber-brown panel bg
		glassBorderDark: 'rgba(200, 150, 60, 0.35)', // clearly visible amber border
		glassDay:   [255, 220, 160],  // warm amber-golden → tints all glass panels visibly
		glassNight: [12,  8,   2  ],
		textDay:    [61,  46,  26 ],
		textNight:  [248, 235, 210],
		swatchBg:     '#e8d5b0',
		swatchBorder: '#c8a060',
	},
	beige: {
		label: 'beige',
		uiRgb:        '140, 120, 90',
		darkPanelRgb: '155, 130, 95',    // same hue as uiRgb for cross-context consistency
		bodyBg:       '#e8e0d0',
		clrDarkText:  '#c4bcb0',
		glassBgDark:     'rgba(32, 26, 12, 0.87)',   // warm dark beige-brown
		glassBorderDark: 'rgba(155, 130, 95, 0.30)', // warm beige border
		glassDay:   [255, 244, 224],  // warm cream → clearly warmer than neutral
		glassNight: [10,  9,   6  ],
		textDay:    [42,  34,  24 ],
		textNight:  [240, 235, 225],
		swatchBg:     '#e8e0d0',
		swatchBorder: '#b0a080',
	},
	gray: {
		label: 'gray',
		uiRgb:        '128, 128, 128',
		darkPanelRgb: '190, 195, 210',   // cool blue-white tint
		bodyBg:       '#d0d0d0',
		clrDarkText:  '#bcc0c4',
		glassBgDark:     'rgba(12, 14, 22, 0.86)',   // cool blue-gray dark
		glassBorderDark: 'rgba(180, 190, 210, 0.22)',
		glassDay:   [244, 246, 255],  // slight cool blue-white → distinguishable from neutral
		glassNight: [8,   10,  14 ],
		textDay:    [8,   8,   8  ],
		textNight:  [232, 235, 238],
		swatchBg:     '#d0d0d0',
		swatchBorder: '#999999',
	},
	neutral: {
		label: 'neutral',
		uiRgb:        '128, 128, 128',
		darkPanelRgb: '255, 255, 255',   // pure white — baseline appearance
		bodyBg:       '#d8d8d8',
		clrDarkText:  '#c0c4c8',
		glassBgDark:     'rgba(10, 12, 16, 0.78)',
		glassBorderDark: 'rgba(200, 210, 220, 0.15)',
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

	// Derive --glass-bg-heavy from glassDay so fullscreen overlays stay on-palette
	const [dr, dg, db] = p.glassDay;
	r.style.setProperty('--glass-bg-heavy', `rgba(${dr}, ${dg}, ${db}, 0.78)`);

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
