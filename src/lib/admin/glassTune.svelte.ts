// Admin-adjustable glass (2026-10-22). Multipliers over what Sky.svelte computes
// per frame, so the contrast floor from lightFrame stays the starting point.
// Per-browser, in localStorage; the defaults are the shipped look.

export interface GlassTune {
	card: number;        // × page card (and nav) opacity
	cardBlur: number;    // px
	border: number;      // × border opacity
	menu: number;        // × admin menu / dropdown opacity
	menuBlur: number;    // px
}

export const GLASS_DEFAULTS: GlassTune = { card: 1, cardBlur: 22, border: 1, menu: 1, menuBlur: 28 };
const KEY = 'cwc-glass-tune';

function load(): GlassTune {
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (s && typeof s === 'object') return { ...GLASS_DEFAULTS, ...s };
	} catch { /* private window or bad JSON: defaults */ }
	return { ...GLASS_DEFAULTS };
}

export const glassTune = $state<GlassTune & { version: number }>({
	...(typeof localStorage === 'undefined' ? GLASS_DEFAULTS : load()),
	version: 0,
});

export function setGlass(patch: Partial<GlassTune>): void {
	Object.assign(glassTune, patch);
	glassTune.version++;
	const { version: _, ...t } = glassTune;
	try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

export function resetGlass(): void { setGlass({ ...GLASS_DEFAULTS }); }

/** Alpha scaled and kept inside 0–1. */
export const tuneAlpha = (a: number, k: number) => Math.max(0, Math.min(1, a * k)).toFixed(2);
