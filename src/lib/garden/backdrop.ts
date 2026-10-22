// The garden's sky colours by sun altitude, and the colour the glass panels
// actually sit on. Pure, so Sky.svelte can pick text against it and
// contrast.test.ts can check it through the whole day.
//
// Garden.svelte keeps its own copy of these keyframes for drawing; the two
// must stay equal (contrast.test.ts asserts it against the component source).

import type { RGB } from '$lib/admin/contrast';

export const SKY_KF: ReadonlyArray<{ alt: number; zenith: RGB; mid: RGB; lower: RGB; horizon: RGB }> = [
	{ alt: -20, zenith: [2, 4, 16], mid: [3, 5, 22], lower: [4, 7, 34], horizon: [5, 8, 42] },
	{ alt: -12, zenith: [5, 8, 32], mid: [7, 12, 42], lower: [11, 18, 56], horizon: [13, 21, 64] },
	{ alt: -6, zenith: [13, 21, 64], mid: [17, 27, 76], lower: [22, 37, 98], horizon: [26, 42, 108] },
	{ alt: -1, zenith: [26, 42, 108], mid: [32, 48, 114], lower: [42, 58, 124], horizon: [47, 64, 128] },
	{ alt: 0, zenith: [74, 144, 196], mid: [90, 100, 148], lower: [190, 115, 80], horizon: [255, 107, 53] },
	{ alt: 6, zenith: [100, 160, 210], mid: [115, 165, 200], lower: [200, 205, 170], horizon: [255, 200, 140] },
	{ alt: 15, zenith: [100, 165, 220], mid: [128, 188, 228], lower: [172, 218, 238], horizon: [200, 230, 245] },
	{ alt: 45, zenith: [30, 107, 158], mid: [62, 152, 198], lower: [108, 186, 222], horizon: [135, 206, 235] },
];

function smoothstep(t: number): number {
	const c = Math.max(0, Math.min(1, t));
	return c * c * (3 - 2 * c);
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
	const s = smoothstep(t);
	return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * s)) as unknown as RGB;
}

/** The garden's sky bands at a sun altitude, interpolated as Garden.svelte draws them. */
export function skyColorsAt(altDeg: number): { mid: RGB; lower: RGB } {
	const k = SKY_KF;
	if (altDeg <= k[0].alt) return k[0];
	for (let i = 0; i < k.length - 1; i++) {
		if (altDeg <= k[i + 1].alt) {
			const t = (altDeg - k[i].alt) / (k[i + 1].alt - k[i].alt);
			return { mid: lerpRGB(k[i].mid, k[i + 1].mid, t), lower: lerpRGB(k[i].lower, k[i + 1].lower, t) };
		}
	}
	return k[k.length - 1];
}
