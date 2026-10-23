// What the glass actually sits on (2026-10-23). The sky bands in backdrop.ts
// know nothing of clouds, moonlit cloud tops, mountains or trees, all of which
// are drawn behind the panels, so text picked against the bands alone could
// land pale on a bright cloud. Garden.svelte samples its own canvas a few
// times a second and publishes the darkest and brightest of it here; Sky.svelte
// adds them to the backdrops text must read on.

import type { RGB } from '$lib/admin/contrast';
import { luminance } from '$lib/admin/contrast';

export const seen = $state<{ colors: RGB[]; version: number }>({ colors: [], version: 0 });

/** The mean of the darkest and of the brightest `share` of the pixels in RGBA `data`. Pure. */
export function extremes(data: ArrayLike<number>, share = 0.1): RGB[] {
	const px: { c: RGB; l: number }[] = [];
	for (let i = 0; i + 2 < data.length; i += 4) {
		const c: RGB = [data[i], data[i + 1], data[i + 2]];
		px.push({ c, l: luminance(c) });
	}
	if (!px.length) return [];
	px.sort((a, b) => a.l - b.l);
	const n = Math.max(1, Math.round(px.length * share));
	const mean = (s: typeof px): RGB => [0, 1, 2].map((k) => Math.round(s.reduce((t, p) => t + p.c[k], 0) / s.length)) as RGB;
	return [mean(px.slice(0, n)), mean(px.slice(-n))];
}

/** Publish `colors` if they moved enough to matter (each channel by 6+). */
export function publishSeen(colors: RGB[]): void {
	const same = colors.length === seen.colors.length
		&& colors.every((c, i) => c.every((v, k) => Math.abs(v - seen.colors[i][k]) < 6));
	if (same) return;
	seen.colors = colors;
	seen.version++;
}
