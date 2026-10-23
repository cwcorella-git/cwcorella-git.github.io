// Real terrain behind the garden (2026-10-22).
//
// static/garden/terrain.png + terrain.json are baked by scripts/bake-terrain.py:
// a mountain panorama ray-marched over real elevation in true perspective. The
// place is whatever the bake chose (the operator: "it could be fiction. idc."),
// so everything regional (angle frame, elevation range, treeline, snow line)
// comes from terrain.json. Each panorama pixel carries its surface normal,
// distance, elevation and the horizon angle in eight compass directions. Here
// it is only re-lit: sun direction from the solar azimuth and altitude,
// terrain shadows from the horizon angles, haze from the real distance, and
// valley haze pooled at the foot of each ridge layer so the layers separate.

type RGB = [number, number, number];

export interface TerrainMeta {
	site: string; label: string;
	az0: number; az1: number;
	ncol: number; nrow: number;
	nrowTop?: number;                // rows above the meadow's vanishing line; the rest is the meadow
	tan0?: number; tan1?: number;    // the meadow rows' tangent range, top and bottom
	ang0: number; ang1: number;      // degrees at the bottom and top rows
	d0: number; d1: number;          // km, the distance code's range
	emin: number; emax: number;      // metres, the elevation code's range
	forest: [number, number];        // forest from … to, metres
	snow: [number, number];          // snow line in deep winter, and in spring/late autumn
}

export interface Terrain {
	meta: TerrainMeta;
	mask: Uint8Array;
	meadow: Uint8Array;                                      // the camera's own ground
	dry: Float32Array;                                       // 0–1, the meadow's baked dry-grass patches
	nx: Float32Array; ny: Float32Array; nz: Float32Array;   // east, north, up
	km: Float32Array;
	elev: Float32Array;                                      // metres
	hz: Float32Array;                                        // N·8, degrees
	grain: Float32Array;                                     // per-pixel material noise
	pool: Float32Array;                                      // 0–1, valley haze at a layer's foot
}

export async function loadTerrain(baseUrl: string): Promise<Terrain> {
	const meta: TerrainMeta = await (await fetch(`${baseUrl}/terrain.json`)).json();
	const img = new Image();
	img.src = `${baseUrl}/terrain.png`;
	await img.decode();
	const c = document.createElement('canvas');
	c.width = img.width; c.height = img.height;
	const ctx = c.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(img, 0, 0);
	const px = ctx.getImageData(0, 0, img.width, img.height).data;
	const { ncol, nrow } = meta;
	const N = ncol * nrow;
	const t: Terrain = {
		meta,
		mask: new Uint8Array(N), meadow: new Uint8Array(N), dry: new Float32Array(N),
		nx: new Float32Array(N), ny: new Float32Array(N), nz: new Float32Array(N),
		km: new Float32Array(N), elev: new Float32Array(N),
		hz: new Float32Array(N * 8), grain: new Float32Array(N), pool: new Float32Array(N),
	};
	const at = (block: number, i: number) => (block * N + i) * 4;
	for (let i = 0; i < N; i++) {
		const b1 = at(1, i);
		if (px[b1 + 2] < 128) continue;
		t.mask[i] = 1;
		t.meadow[i] = px[b1 + 2] < 224 ? 1 : 0;
		if (t.meadow[i]) t.dry[i] = (px[b1 + 2] - 128) / 95;   // older bakes wrote 192: a mid patch
		const b0 = at(0, i);
		t.nx[i] = px[b0] / 127.5 - 1; t.ny[i] = px[b0 + 1] / 127.5 - 1; t.nz[i] = px[b0 + 2] / 127.5 - 1;
		t.km[i] = meta.d0 * Math.exp(((px[b1] - 1) / 254) * Math.log(meta.d1 / meta.d0));
		t.elev[i] = meta.emin + (px[b1 + 1] / 255) * (meta.emax - meta.emin);
		for (let k = 0; k < 8; k++) t.hz[i * 8 + k] = (px[at(2 + Math.floor(k / 3), i) + (k % 3)] / 255) * 32;
		const x = i % ncol, y = (i / ncol) | 0;
		const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
		t.grain[i] = h - Math.floor(h);
	}
	// Valley haze: walking up each column, a ridge layer begins where the
	// distance jumps outward. Haze is thickest at that foot and thins upward,
	// so each layer reads as a crisp crest over a hazy base.
	const foot = Math.max(3, nrow * 0.05);
	for (let x = 0; x < ncol; x++) {
		let since = 1e9;
		for (let y = nrow - 1; y >= 0; y--) {
			const i = y * ncol + x;
			if (!t.mask[i]) continue;
			const below = y + 1 < nrow ? (y + 1) * ncol + x : -1;
			if (below >= 0 && t.mask[below] && t.km[i] > t.km[below] * 1.35 + 1) since = 0;
			else since++;
			t.pool[i] = Math.exp(-since / foot);
		}
	}
	return t;
}

/** Snow line for a month (0–11) from the region's two lines, or null in summer. */
export function snowLineFor(meta: TerrainMeta, month: number): number | null {
	if (month >= 5 && month <= 8) return null;                   // Jun–Sep
	return month === 11 || month <= 2 ? meta.snow[0] : meta.snow[1];
}

export interface TerrainLight {
	az: number; alt: number;   // sun, degrees
	sunCol: RGB; sky: RGB; night: RGB;
	dl: number;                // daylight 0–1
	fog: RGB; beta: number;    // haze colour and density per 10 km
	snowLine: number | null;   // metres; null when there is no snow
	valleySnow?: number;       // 0–1 snow lying on the valley floor (weather.ts snowCover)
	doy?: number;              // day of year, for the meadow's season
}

const MEADOW: RGB = [150, 146, 104];
const FOREST: RGB = [48, 64, 46];
const GRASS: RGB = [118, 134, 72];
const DRY: RGB = [190, 164, 100];
const STRAW: RGB = [192, 160, 102];
const ROCK: RGB = [136, 128, 118];
const SNOW: RGB = [238, 240, 246];

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** How green the meadow is: 1 May–Sep, 0 (straw) Dec–Feb, ramps between. */
export function meadowSeason(doy: number): number {
	const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (doy - a) / (b - a)));
	return doy < 182 ? ramp(60, 121) : 1 - ramp(274, 335);
}

const MEADOW_AMB = 0.22;   // the meadow is open to the whole sky; at dusk it still reads as grass
// Sun plus sky light on a surface, per channel, before the albedo.
const lightOn = (L: TerrainLight, diff: number, amb: number): RGB => [
	L.sunCol[0] * diff * 1.05 + L.sky[0] * amb,
	L.sunCol[1] * diff * 1.05 + L.sky[1] * amb,
	L.sunCol[2] * diff * 1.05 + L.sky[2] * amb,
];

/** The light on open, flat meadow as a multiplier for plant colours (≈1 at
 *  midday), so the painted grass agrees with the ground it stands on. */
export function meadowLight(L: TerrainLight): RGB {
	const rad = Math.PI / 180;
	const diff = Math.max(0, Math.sin(Math.max(0.5, L.alt) * rad)) * sm(-1, 3, L.alt);
	const li = lightOn(L, diff, 0.18 + 0.32 + MEADOW_AMB);
	return [0, 1, 2].map((k) => {
		const lit = (GRASS[k] / 255) * li[k];
		const col = L.night[k] + (lit - L.night[k]) * L.dl;
		return Math.min(1.1, col / GRASS[k] / 1.1);
	}) as RGB;
}

/** `cols` limits the work to the columns on screen; `step` 2 lights at half resolution. */
export function relightTerrain(t: Terrain, L: TerrainLight, out?: HTMLCanvasElement, cols?: [number, number], step = 1): HTMLCanvasElement {
	const { ncol, nrow, forest } = t.meta;
	const c = out ?? document.createElement('canvas');
	c.width = ncol; c.height = nrow;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(ncol, nrow);
	const d = img.data;
	const rad = Math.PI / 180;
	const alt = Math.max(0.5, L.alt);
	const lx = Math.sin(L.az * rad) * Math.cos(alt * rad);
	const ly = Math.cos(L.az * rad) * Math.cos(alt * rad);
	const lz = Math.sin(alt * rad);
	const kf = (((L.az / 45) % 8) + 8) % 8, k0 = Math.floor(kf), k1 = (k0 + 1) % 8, kt = kf - k0;
	const sunUp = sm(-1, 3, L.alt);
	const [f0, f1] = forest;
	const green = meadowSeason(L.doy ?? 172);

	const x0 = Math.max(0, cols?.[0] ?? 0), x1 = Math.min(ncol, cols?.[1] ?? ncol);
	const shade = (i: number) => {
		const nz = t.nz[i];
		let diff = Math.max(0, t.nx[i] * lx + t.ny[i] * ly + nz * lz) * sunUp;
		// Terrain shadow: is the sun below the horizon this point sees toward it?
		const hor = t.hz[i * 8 + k0] * (1 - kt) + t.hz[i * 8 + k1] * kt;
		diff *= 0.12 + 0.88 * sm(hor - 0.8, hor + 0.8, L.alt);

		const e = t.elev[i], g = t.grain[i];
		const slope = 1 - nz;                           // 0 flat … ~1 cliff
		let alb = MEADOW;
		let peakSnow = 0;
		if (t.meadow[i]) alb = mix(STRAW, mix(mix(GRASS, MEADOW, g * 0.35), DRY, Math.min(1, t.dry[i] * 1.3)), green);
		else {
			const woods = sm(f0, f0 + 150, e) * (1 - sm(f1 - 100, f1 + 100, e + g * 80)) * (0.6 + 0.4 * g) * (1 - sm(0.35, 0.6, slope));
			alb = mix(alb, FOREST, woods);
			alb = mix(alb, ROCK, Math.max(sm(f1, f1 + 250, e + g * 120), sm(0.3, 0.55, slope) * 0.85));
			if (L.snowLine !== null) {
				peakSnow = sm(L.snowLine, L.snowLine + 250, e + g * 150) * (1 - sm(0.4, 0.65, slope));
				alb = mix(alb, SNOW, peakSnow);
			}
		}
		// A snow day: snow on the valley floor in the distance (the meadow
		// below the horizon is covered by Garden's own snow layer, so only the
		// rows above it), patchy as it melts, sparse on the steeper ground.
		const vs = L.valleySnow ?? 0;
		let lie = 0;
		if (vs > 0 && i < (t.meta.nrowTop ?? 0) * ncol) {
			lie = sm(1 - vs - 0.1, 1 - vs + 0.15, g) * (t.meadow[i] ? 0.95 : 0.7 * (1 - sm(0.3, 0.55, slope)) * (1 - sm(f0 - 150, f0 + 100, e)));   // the valley and foothills, not the range
			alb = mix(alb, SNOW, lie);
		}

		const li = lightOn(L, diff, 0.18 + 0.32 * nz * nz + (t.meadow[i] ? MEADOW_AMB : 0));
		let col: RGB = [(alb[0] / 255) * li[0], (alb[1] / 255) * li[1], (alb[2] / 255) * li[2]];
		col = mix(L.night, col, L.dl);
		// Snow keeps a pale blue-grey after sunset, as Garden's near snow
		// layer does (the same floor), where bare ground and rock go dark.
		const snowy = Math.max(lie, peakSnow * 0.8);        // the peaks a little less: far, and in the haze
		if (snowy > 0) {
			const nf = sm(-5, 1, -L.alt) * snowy * (0.35 + 0.65 * nz * nz) * (0.85 + 0.3 * g);   // sky-facing snow brightest: keep the relief
			col = col.map((v, k) => Math.max(v, [0.2, 0.23, 0.32][k] * 238 * nf)) as RGB;
		}
		const haze = 1 - Math.exp(-L.beta * t.km[i] / 10);
		col = mix(col, L.fog, Math.min(1, haze + (1 - haze) * t.pool[i] * 0.45 * Math.min(1, t.km[i] / 8)));
		const o = i * 4;
		d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
	};
	// step 2 (phones): light one pixel in four and copy it to its neighbours,
	// except where the neighbour's anchor is sky, so the skyline stays exact.
	for (let y = 0; y < nrow; y++) for (let x = x0; x < x1; x++) {
		const i = y * ncol + x;
		if (!t.mask[i]) continue;
		const ax = x - (x % step), a = (y - (y % step)) * ncol + ax;
		if (a !== i && ax >= x0 && t.mask[a]) { const o = i * 4, q = a * 4; d[o] = d[q]; d[o + 1] = d[q + 1]; d[o + 2] = d[q + 2]; d[o + 3] = 255; }
		else shade(i);
	}
	ctx.putImageData(img, 0, 0);
	return c;
}
