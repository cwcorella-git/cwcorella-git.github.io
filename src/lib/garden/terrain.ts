// Real terrain behind the garden (2026-10-22).
//
// static/garden/terrain.png is baked by scripts/bake-terrain.py: the western
// skyline from downtown Reno (Carson Range, Truckee gap, Peavine), ray-marched
// over SRTM-derived elevation in true perspective. Each panorama pixel carries
// its surface normal, distance, elevation and the horizon angle in eight
// compass directions. Here it is only re-lit: sun direction from the real
// solar azimuth and altitude, terrain shadows from the horizon angles, haze
// from the real distance, and vegetation and snow bands from elevation.
//
// The noise ranges in detail.ts still draw until the atlas has loaded, and if
// it never does.

type RGB = [number, number, number];

export const NCOL = 1200;
export const NROW = 180;
export const ANG0 = -0.35;    // degrees at the panorama's bottom row
export const ANG1 = 6.2;      // and at its top
const D0 = 4, D1 = 70;        // km, the distance code's range

export interface Terrain {
	mask: Uint8Array;
	nx: Float32Array; ny: Float32Array; nz: Float32Array;   // east, north, up
	km: Float32Array;
	elev: Float32Array;                                      // metres
	hz: Float32Array;                                        // NROW·NCOL·8, degrees
	grain: Float32Array;                                     // per-pixel material noise
}

export function loadTerrain(url: string): Promise<Terrain> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			const c = document.createElement('canvas');
			c.width = img.width; c.height = img.height;
			const ctx = c.getContext('2d', { willReadFrequently: true })!;
			ctx.drawImage(img, 0, 0);
			const px = ctx.getImageData(0, 0, img.width, img.height).data;
			const N = NCOL * NROW;
			const t: Terrain = {
				mask: new Uint8Array(N),
				nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N),
				km: new Float32Array(N), elev: new Float32Array(N),
				hz: new Float32Array(N * 8), grain: new Float32Array(N),
			};
			const at = (block: number, i: number) => (block * N + i) * 4;
			for (let i = 0; i < N; i++) {
				const b1 = at(1, i);
				if (px[b1 + 2] < 128) continue;
				t.mask[i] = 1;
				const b0 = at(0, i);
				t.nx[i] = px[b0] / 127.5 - 1; t.ny[i] = px[b0 + 1] / 127.5 - 1; t.nz[i] = px[b0 + 2] / 127.5 - 1;
				t.km[i] = D0 * Math.exp(((px[b1] - 1) / 254) * Math.log(D1 / D0));
				t.elev[i] = 1100 + (px[b1 + 1] / 255) * 2400;
				for (let k = 0; k < 8; k++) {
					const o = at(2 + Math.floor(k / 3), i) + (k % 3);
					t.hz[i * 8 + k] = (px[o] / 255) * 32;
				}
				const x = i % NCOL, y = (i / NCOL) | 0;
				const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
				t.grain[i] = h - Math.floor(h);
			}
			resolve(t);
		};
		img.onerror = () => reject(new Error('terrain atlas failed to load'));
		img.src = url;
	});
}

/** Solar azimuth, degrees clockwise from north, for Reno. */
export function sunAzimuthDeg(date: Date): number {
	const rad = Math.PI / 180;
	const doy = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
	const decl = 23.45 * Math.sin(rad * (360 / 365) * (doy - 81)) * rad;
	const hour = date.getHours() + date.getMinutes() / 60;
	const ha = 15 * (hour - 12) * rad;
	const lat = 39.53 * rad;
	const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
	return (az / rad + 180 + 360) % 360;
}

export interface TerrainLight {
	az: number; alt: number;   // sun, degrees
	sunCol: RGB; sky: RGB; night: RGB;
	dl: number;                // daylight 0–1
	fog: RGB; beta: number;    // haze colour and density per 10 km
	snowLine: number | null;   // metres; null when there is no snow
}

const SAGE: RGB = [158, 146, 110];
const PINE: RGB = [52, 66, 48];
const ROCK: RGB = [136, 128, 118];
const SNOW: RGB = [238, 240, 246];

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function relightTerrain(t: Terrain, L: TerrainLight, out?: HTMLCanvasElement): HTMLCanvasElement {
	const c = out ?? document.createElement('canvas');
	c.width = NCOL; c.height = NROW;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(NCOL, NROW);
	const d = img.data;
	const rad = Math.PI / 180;
	const alt = Math.max(0.5, L.alt);
	const lx = Math.sin(L.az * rad) * Math.cos(alt * rad);
	const ly = Math.cos(L.az * rad) * Math.cos(alt * rad);
	const lz = Math.sin(alt * rad);
	const kf = (((L.az / 45) % 8) + 8) % 8, k0 = Math.floor(kf), k1 = (k0 + 1) % 8, kt = kf - k0;
	const sunUp = sm(-1, 3, L.alt);

	for (let i = 0; i < NROW * NCOL; i++) {
		if (!t.mask[i]) continue;
		const nz = t.nz[i];
		let diff = Math.max(0, t.nx[i] * lx + t.ny[i] * ly + nz * lz) * sunUp;
		// Terrain shadow: is the sun below the horizon this point sees toward it?
		const hor = t.hz[i * 8 + k0] * (1 - kt) + t.hz[i * 8 + k1] * kt;
		diff *= 0.12 + 0.88 * sm(hor - 0.8, hor + 0.8, L.alt);

		const e = t.elev[i], g = t.grain[i];
		const slope = 1 - nz;                           // 0 flat … ~1 cliff
		let alb = SAGE;
		const forest = sm(1750, 1950, e) * (1 - sm(2650, 2850, e)) * (0.55 + 0.45 * g) * (1 - sm(0.35, 0.6, slope));
		alb = mix(alb, PINE, forest);
		alb = mix(alb, ROCK, Math.max(sm(2700, 2950, e + g * 120), sm(0.3, 0.55, slope) * 0.85));
		if (L.snowLine !== null) alb = mix(alb, SNOW, sm(L.snowLine, L.snowLine + 250, e + g * 150) * (1 - sm(0.35, 0.6, slope)));

		const amb = 0.18 + 0.32 * nz * nz;
		let col: RGB = [
			(alb[0] / 255) * (L.sunCol[0] * diff * 1.05 + L.sky[0] * amb),
			(alb[1] / 255) * (L.sunCol[1] * diff * 1.05 + L.sky[1] * amb),
			(alb[2] / 255) * (L.sunCol[2] * diff * 1.05 + L.sky[2] * amb),
		];
		col = mix(L.night, col, L.dl);
		col = mix(col, L.fog, 1 - Math.exp(-L.beta * t.km[i] / 10));
		const o = i * 4;
		d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
	}
	ctx.putImageData(img, 0, 0);
	return c;
}
