// Admin-adjustable scene (2026-10-23): every element of the garden can be
// switched off or scaled, and the adaptive text tuned. Same three layers as
// glassTune: SCENE_DEFAULTS, then static/scene.json (the admin's "save for
// everyone", committed through the GitHub API), then this browser's own.
// Defaults reproduce the scene as it was drawn before the tuner existed.

export const SCENE_DEFAULTS = {
	// on / off
	sun: true, glow: true, rays: true, venus: true,
	moon: true, stars: true, milkyWay: true,
	cumulus: true, sheets: true, cirrus: true, cloudShadows: true,
	mountains: true, contours: true, meadow: true, flowers: true, rocks: true, snow: true,
	trees: true, sage: true, treeShadows: true, grass: true,
	grain: true, vignette: true,
	// clouds
	cloudAmount: 1,    // × the day's cumulus count
	cloudSize: 1,      // × size
	cloudOpacity: 1,   // × drawn alpha
	cloudDetail: 1,    // × bake resolution (cost grows with the square)
	cloudEdge: 1,      // fine lumps along the edges
	cloudGrow: true,   // cumulus grow from their cores and dissolve from the edges; off: the old whole-cloud fade
	// night
	starBright: 1,
	milkyWayAmt: 1,
	moonSize: 1,
	moonLight: 1,      // × how much the moon lights the land
	// land and effects
	windAmt: 1,
	grainAmt: 1,
	vignetteAmt: 1,
	dayFps: 4,         // redraws per second by day
	nightFps: 15,      // and by night, for the twinkle
	// text
	contrast: 4.5,     // the floor every frame's text must reach; never below 4.5
	glassDay: 0.22,    // glass alpha before contrast thickens it
	glassNight: 0.42,
	textScale: 1,      // × root font size
	textWeight: 400,   // body weight
	textHalo: 0,       // soft shadow behind text, 0–1
};

export type SceneTune = typeof SCENE_DEFAULTS;
export type SceneKey = keyof SceneTune;
const KEY = 'cwc-scene-tune';

let site: SceneTune = { ...SCENE_DEFAULTS };

/** Known keys only, with the default's type, and the contrast floor kept. */
export function cleanScene(s: unknown): Partial<SceneTune> {
	const out: Record<string, unknown> = {};
	if (!s || typeof s !== 'object') return out;
	for (const [k, v] of Object.entries(s)) {
		if (k in SCENE_DEFAULTS && typeof v === typeof SCENE_DEFAULTS[k as SceneKey]) out[k] = v;
	}
	if (typeof out.contrast === 'number') out.contrast = Math.max(4.5, out.contrast);
	return out as Partial<SceneTune>;
}

function loadLocal(): Partial<SceneTune> {
	try { return cleanScene(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
	catch { return {}; }   // private window or bad JSON
}
const load = (): SceneTune => ({ ...site, ...loadLocal() });

export const sceneTune = $state<SceneTune & { version: number }>({
	...(typeof localStorage === 'undefined' ? SCENE_DEFAULTS : load()),
	version: 0,
});

export function setScene(patch: Partial<SceneTune>): void {
	Object.assign(sceneTune, cleanScene(patch));
	sceneTune.version++;
	const { version: _, ...t } = sceneTune;
	try { localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

/** Back to the site's values, forgetting this browser's own. */
export function resetScene(): void {
	try { localStorage.removeItem(KEY); } catch { /* ignore */ }
	Object.assign(sceneTune, site);
	sceneTune.version++;
}

/** Fetch the site-wide values; this browser's own settings still win. */
export async function loadSiteScene(base = ''): Promise<void> {
	try {
		const res = await fetch(`${base}/scene.json`, { cache: 'no-cache' });
		if (!res.ok) return;
		site = { ...SCENE_DEFAULTS, ...cleanScene(await res.json()) };
		Object.assign(sceneTune, load());
		sceneTune.version++;
	} catch { /* none published: SCENE_DEFAULTS */ }
}

/** The values that differ from the defaults, as static/scene.json. */
export function sceneJson(): string {
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(SCENE_DEFAULTS) as SceneKey[]) {
		if (sceneTune[k] !== SCENE_DEFAULTS[k]) out[k] = sceneTune[k];
	}
	return JSON.stringify(out, null, '\t') + '\n';
}

/** Whether the scene panel is open, and whether the page is hidden to see the garden whole. */
export const scenePanel = $state({ open: false, peek: false });
