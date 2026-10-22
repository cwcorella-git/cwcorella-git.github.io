// Admin-adjustable glass (2026-10-22). Multipliers over what Sky.svelte computes
// per frame, so the contrast floor from lightFrame stays the starting point.
// Three layers: GLASS_DEFAULTS, then static/glass.json (the admin's "save for
// everyone", committed through the GitHub API), then this browser's own
// slider settings in localStorage.

export interface GlassTune {
	card: number;        // × page card (and nav) opacity
	cardBlur: number;    // px
	border: number;      // × border opacity
	menu: number;        // × admin menu / dropdown opacity
	menuBlur: number;    // px
}

export const GLASS_DEFAULTS: GlassTune = { card: 1, cardBlur: 22, border: 1, menu: 1, menuBlur: 28 };
const KEY = 'cwc-glass-tune';

let site: GlassTune = { ...GLASS_DEFAULTS };

function loadLocal(): Partial<GlassTune> | null {
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (s && typeof s === 'object') return s;
	} catch { /* private window or bad JSON */ }
	return null;
}
const load = (): GlassTune => ({ ...site, ...(loadLocal() ?? {}) });

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

/** Back to the site's values, forgetting this browser's own. */
export function resetGlass(): void {
	try { localStorage.removeItem(KEY); } catch { /* ignore */ }
	Object.assign(glassTune, site);
	glassTune.version++;
}

/** Fetch the site-wide values; this browser's own settings still win. */
export async function loadSiteGlass(base = ''): Promise<void> {
	try {
		const res = await fetch(`${base}/glass.json`, { cache: 'no-cache' });
		if (!res.ok) return;
		site = { ...GLASS_DEFAULTS, ...(await res.json()) };
		Object.assign(glassTune, load());
		glassTune.version++;
	} catch { /* none published: GLASS_DEFAULTS */ }
}

/** The current values, as static/glass.json. */
export function glassJson(): string {
	const { version: _, ...t } = glassTune;
	return JSON.stringify(t, null, '\t') + '\n';
}

/** Alpha scaled and kept inside 0–1. */
export const tuneAlpha = (a: number, k: number) => Math.max(0, Math.min(1, a * k)).toFixed(2);
