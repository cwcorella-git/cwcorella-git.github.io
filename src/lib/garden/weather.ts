// One weather per day (2026-10-22). Seeded by the visitor's local date, like
// the sun, so everyone on the same day sees the same sky and the next day
// brings a new one. Pure: Garden.svelte turns this into clouds and light.

export type WeatherKind = 'clear' | 'fair' | 'busy' | 'overcast';

export interface Weather {
	kind: WeatherKind;
	seed: number;      // for this day's cloud positions and shapes
	cumulus: number;   // how many
	cumulusSize: number;   // × the usual size
	sheets: number;    // thin high layers; on overcast days, wide grey ones
	cirrus: number;
	cover: number;     // 0–1, how much the sun is dimmed
}

function prng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

/** Overcast is 10% of days, 25% in Dec–Feb; the rest keep their 3:4:2 ratio. */
export function weatherShares(month: number): Record<WeatherKind, number> {
	const over = month === 11 || month <= 1 ? 0.25 : 0.10;
	const k = (1 - over) / 0.9;
	return { clear: 0.30 * k, fair: 0.40 * k, busy: 0.20 * k, overcast: over };
}

export function weatherFor(d: Date): Weather {
	const seed = (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 2654435761;
	const r = prng(seed);
	r(); r();   // neighbouring dates start close together; let the stream separate them
	const shares = weatherShares(d.getMonth());
	let u = r(), kind: WeatherKind = 'fair';
	for (const k of ['clear', 'fair', 'busy', 'overcast'] as WeatherKind[]) {
		if ((u -= shares[k]) < 0) { kind = k; break; }
	}
	const s = Math.floor(r() * 0x7FFFFFFF);
	switch (kind) {
		case 'clear':    return { kind, seed: s, cumulus: r() < 0.5 ? 0 : 1, cumulusSize: 1,    sheets: 0, cirrus: 6, cover: 0 };
		case 'fair':     return { kind, seed: s, cumulus: 6,                  cumulusSize: 1,    sheets: 3, cirrus: 6, cover: 0 };
		case 'busy':     return { kind, seed: s, cumulus: 9 + Math.floor(r() * 3), cumulusSize: 1.25, sheets: 2, cirrus: 3, cover: 0.15 };
		case 'overcast': return { kind, seed: s, cumulus: 2,                  cumulusSize: 1.1,  sheets: 5, cirrus: 0, cover: 0.6 };
	}
}
