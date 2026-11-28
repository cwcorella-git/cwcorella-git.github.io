// The real sky over Reno (2026-11-28): today's cloud cover from Open-Meteo, a
// keyless, CORS-open forecast API, read once in the browser and cached for half
// an hour. Anything wrong (offline, blocked, odd reply, timeout) gives null and
// the garden falls back to its seeded weather, so the site never depends on it.
// Only the fixed coordinates of the town go out; nothing about the visitor.

const URL = 'https://api.open-meteo.com/v1/forecast?latitude=39.53&longitude=-119.81&current=cloud_cover';
const KEY = 'cwc-local-sky';
const TTL = 30 * 60 * 1000;

/** Open-Meteo's 0–100 percent as the cloud layer's 0..1 cover, never fully clear or fully shut. */
export function coverFromPercent(pct: unknown): number | null {
	if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) return null;
	return 0.05 + 0.9 * (pct / 100);
}

/** Pulls the percent out of the API's reply, or null. */
export function parseReply(j: unknown): number | null {
	const c = (j as { current?: { cloud_cover?: unknown } } | null)?.current?.cloud_cover;
	return coverFromPercent(c);
}

let cover: number | null = null;
let started = false;

/** Latest known cover (0..1), or null: use the seeded weather. */
export const localCover = (): number | null => cover;

export function startLocalSky(): void {
	if (started || typeof window === 'undefined') return;
	started = true;
	try {
		const c = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { at: number; cover: number } | null;
		if (c && typeof c.cover === 'number' && Date.now() - c.at < 6 * 3600 * 1000) cover = c.cover;   // stale beats nothing
		if (c && Date.now() - c.at < TTL) return;
	} catch { /* ignore */ }
	const ac = new AbortController();
	const to = setTimeout(() => ac.abort(), 6000);
	fetch(URL, { signal: ac.signal })
		.then((r) => (r.ok ? r.json() : null))
		.then((j) => {
			const v = parseReply(j);
			if (v == null) return;
			cover = v;
			try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), cover: v })); } catch { /* ignore */ }
		})
		.catch(() => { /* offline or blocked: seeded weather stands */ })
		.finally(() => clearTimeout(to));
}
