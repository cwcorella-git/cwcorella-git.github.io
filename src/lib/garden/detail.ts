// Detail layers for Garden.svelte (2026-10-22): the meadow, shaded mountain
// ranges, noise-lit clouds and cirrus, and film grain. Each is drawn once to an
// offscreen canvas and cached by the caller, so the per-frame cost is a blit.

export type RGB = [number, number, number];

// ── 2D value noise ────────────────────────────────────────────────────────
function hash2(x: number, y: number): number {
	let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function noise2D(x: number, y: number): number {
	const ix = Math.floor(x), iy = Math.floor(y);
	const fx = x - ix, fy = y - iy;
	const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
	const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
	return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Roughly 0–1, centred near 0.5. */
export function fbm2(x: number, y: number, octaves = 4): number {
	let s = 0, a = 0.5, f = 1, norm = 0;
	for (let i = 0; i < octaves; i++) { s += a * noise2D(x * f, y * f); norm += a; a *= 0.5; f *= 2.03; }
	return s / norm;
}

function smooth(e0: number, e1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

function mixRGB(a: RGB, b: RGB, t: number): RGB {
	return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.ceil(w));
	c.height = Math.max(1, Math.ceil(h));
	return c;
}

function makePRNG(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

// ── meadow ────────────────────────────────────────────────────────────────
// A multiply layer for the ground band: large dry-gold and green patches,
// value falling toward the viewer, and thousands of small blades whose size
// follows perspective. White means "leave the ground colour as it is", so the
// ground still follows the time of day underneath.
export function renderMeadow(W: number, bandH: number, scale: number): HTMLCanvasElement {
	const c = makeCanvas(W, bandH);
	const ctx = c.getContext('2d')!;

	// Patches, at quarter resolution and scaled up smooth.
	const pw = Math.ceil(W / 4), ph = Math.ceil(bandH / 4);
	const p = makeCanvas(pw, ph);
	const pctx = p.getContext('2d')!;
	const img = pctx.createImageData(pw, ph);
	const green: RGB = [196, 214, 168];
	const gold:  RGB = [250, 232, 186];
	for (let y = 0; y < ph; y++) {
		const t = y / ph;                                  // 0 horizon → 1 foreground
		// Patches are stretched sideways and shrink toward the horizon.
		const sy = 1 / (0.12 + t);
		for (let x = 0; x < pw; x++) {
			const n = fbm2((x / pw) * 7 * sy * 0.35 + 3.1, t * 9 + 7.7);
			const col = mixRGB(green, gold, smooth(0.42, 0.62, n));
			const dark = 1 - 0.22 * t - 0.10 * smooth(0.55, 0.8, fbm2(x / pw * 18, t * 30));
			const i = (y * pw + x) * 4;
			img.data[i] = col[0] * dark; img.data[i + 1] = col[1] * dark; img.data[i + 2] = col[2] * dark; img.data[i + 3] = 255;
		}
	}
	pctx.putImageData(img, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage(p, 0, 0, W, bandH);

	// Blades: uniform on screen, so they crowd and shrink toward the horizon.
	const rng = makePRNG(0x6EAD0);
	const count = Math.round((W * bandH) / (34 * scale * scale));
	ctx.lineCap = 'round';
	const BLADE: RGB[] = [[120, 140, 82], [150, 160, 96], [96, 116, 70], [214, 196, 140], [176, 168, 110]];
	for (let i = 0; i < count; i++) {
		const t = Math.pow(rng(), 0.85);
		const x = rng() * W;
		const y = t * bandH;
		const size = (0.12 + 1.5 * Math.pow(t, 1.4)) * scale;
		const h = (3 + rng() * 6) * size;
		const lean = (rng() - 0.35) * h * 0.6;
		ctx.globalAlpha = 0.35 + rng() * 0.35;
		ctx.strokeStyle = rgb(BLADE[Math.floor(rng() * BLADE.length)]);
		ctx.lineWidth = Math.max(0.5, size * 0.9);
		ctx.beginPath();
		ctx.moveTo(x, y);
		ctx.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	return c;
}

// ── mountain ranges ───────────────────────────────────────────────────────
// Each range is a small heightfield (2026-10-22): columns across the screen,
// rows running from the range's foot (z = 0) back to its crest (z = 1). Gullies
// are ridged noise stretched downslope, so they run from the crest to the foot.
// Rendering marches each column front to back like a voxel landscape, keeping a
// y-buffer, and lights every sample from the real sun direction. Materials
// band by height: sage at the foot, a patchy pine belt, bare rock, then snow
// on flatter ground near the top in winter.

export interface RangeField {
	W: number;
	Z: number;
	h: Float32Array;      // W × Z heights, px above the base line
	fx: Float32Array;     // W × Z material noise (forest patches, rock streaks)
	maxH: number;
	depthPx: number;      // world depth the Z rows span, for the slope normal
}

const Z_ROWS = 96;

export function buildRangeField(W: number, crest: Float32Array, seed: number, gullyPx: number): RangeField {
	const Z = Z_ROWS;
	const h = new Float32Array(W * Z), fx = new Float32Array(W * Z);
	let maxH = 0, mean = 0;
	for (const c of crest) mean += c;
	mean /= W;
	// Spurs scale with the range: a tall range has broad ridges, not pinstripes.
	const spacing = Math.max(gullyPx, mean * 0.9);
	for (let x = 0; x < W; x++) {
		const c = crest[x];
		const u = x / spacing;
		for (let zi = 0; zi < Z; zi++) {
			const z = zi / (Z - 1);
			// Spurs and gullies: two octaves of ridged noise, stretched downslope and
			// warped so they branch. They cut deep at the foot and fade toward the
			// crest, so the skyline stays the crest line while the face below breaks
			// into ridges that come toward the viewer.
			const warp = (noise2D(u * 0.25 + seed, z * 1.5) - 0.5) * 2.2;
			const r1 = 1 - Math.abs(noise2D(u + warp + seed * 3.1, z * 1.2 + seed) * 2 - 1);
			const r2 = 1 - Math.abs(noise2D(u * 2.3 + warp * 1.7 + seed * 5.3, z * 2.4) * 2 - 1);
			const spur = 0.65 * smooth(0.15, 0.95, r1) + 0.35 * smooth(0.2, 1, r2);   // rounded shoulders, not knife edges
			const fine = fbm2(u * 4 + seed, z * 8, 3) - 0.5;
			const cut = 0.55 * Math.pow(1 - z, 0.7);
			const v = c * Math.pow(z, 1.1) * (1 - cut * (1 - spur)) + c * 0.05 * fine * z * (1 - z);
			h[x * Z + zi] = v;
			fx[x * Z + zi] = fbm2(u * 1.7 + seed * 7, z * 5 + seed, 3);
			if (v > maxH) maxH = v;
		}
	}
	return { W, Z, h, fx, maxH, depthPx: mean * 1.2 };
}

export interface RangeLight {
	sun: [number, number, number];  // unit vector: x right, y up, z away from the viewer
	sunCol: RGB;
	sky: RGB;      // ambient skylight
	night: RGB;    // what the range fades to after dark
	dl: number;    // daylight 0–1
	fog: RGB;
	fogAmt: number;
	snow: boolean;
}

const SAGE: RGB = [150, 138, 104];
const PINE: RGB = [50, 64, 46];
const ROCK: RGB = [128, 120, 110];
const SNOW: RGB = [236, 238, 244];

export function renderRangeField(f: RangeField, baseY: number, L: RangeLight): { canvas: HTMLCanvasElement; top: number } {
	const { W, Z, h, fx, maxH } = f;
	const tilt = maxH * 0.3;                     // a little of the slope seen from above
	const top = Math.max(0, Math.floor(baseY - maxH - tilt - 2));
	const CH = Math.ceil(baseY - top + 2);
	const c = makeCanvas(W, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(W, CH);
	const d = img.data;
	const dz = f.depthPx / (Z - 1);
	const [lx, ly, lz] = L.sun;

	// Cast shadows: sweep each depth row away from the sun, carrying the
	// shadow line down at the sun's slope. A peak darkens the slope behind it.
	const lit = new Uint8Array(W * Z).fill(1);
	const run = Math.hypot(lx, lz);
	if (run > 1e-3 && Math.abs(lx) > 0.05) {
		const drop = ly / Math.abs(lx);           // height lost per px of x travelled
		const dir = lx > 0 ? -1 : 1;              // walk from the sun's side
		for (let zi = 0; zi < Z; zi++) {
			let sh = -Infinity;
			for (let k = 0; k < W; k++) {
				const x = dir > 0 ? k : W - 1 - k;
				const hv = h[x * Z + zi];
				sh -= drop;
				if (hv < sh - 0.5) lit[x * Z + zi] = 0;
				else sh = hv;
			}
		}
	}

	const RELIEF = 2.2;                          // exaggerate slopes for lighting only
	for (let x = 0; x < W; x++) {
		let ybuf = CH;
		const xl = Math.max(0, x - 1) * Z, xr = Math.min(W - 1, x + 1) * Z, xo = x * Z;
		for (let zi = 0; zi < Z; zi++) {
			const hv = h[xo + zi];
			const yt = Math.round(baseY - top - hv - (zi / (Z - 1)) * tilt);
			if (yt >= ybuf) continue;
			const dhdx = (h[xr + zi] - h[xl + zi]) / 2;
			const dhdz = (h[xo + Math.min(Z - 1, zi + 1)] - h[xo + Math.max(0, zi - 1)]) / (2 * dz);
			let nx = -dhdx * RELIEF, ny = 1, nz = -dhdz * RELIEF * 0.35;
			const nl = Math.hypot(nx, ny, nz);
			nx /= nl; ny /= nl; nz /= nl;

			const m = fx[xo + zi];
			const hf = hv / maxH + (m - 0.5) * 0.18;
			let alb = SAGE;
			const forest = smooth(0.22, 0.32, hf) * (1 - smooth(0.6, 0.7, hf)) * smooth(0.42, 0.58, m);
			alb = mixRGB(alb, PINE, forest);
			alb = mixRGB(alb, ROCK, Math.max(smooth(0.62, 0.78, hf), smooth(0.75, 0.5, ny) * 0.8));
			if (L.snow) alb = mixRGB(alb, SNOW, smooth(0.66, 0.78, hf) * smooth(0.45, 0.7, ny));

			let diff = Math.max(0, nx * lx + ny * ly + nz * lz);
			if (!lit[xo + zi]) diff *= 0.2;
			const amb = 0.3 + 0.2 * ny;
			let col: RGB = [
				(alb[0] / 255) * (L.sunCol[0] * diff * 1.15 + L.sky[0] * amb),
				(alb[1] / 255) * (L.sunCol[1] * diff * 1.15 + L.sky[1] * amb),
				(alb[2] / 255) * (L.sunCol[2] * diff * 1.15 + L.sky[2] * amb),
			];
			col = mixRGB(L.night, col, L.dl);
			// Haze sits low: valleys and the foot fog more than the peaks.
			const zf = 1 - hv / maxH;
			col = mixRGB(col, L.fog, Math.min(1, L.fogAmt * (0.7 + 0.6 * zf * zf)));

			for (let y = Math.max(0, yt); y < ybuf; y++) {
				const i = (y * W + x) * 4;
				d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
			}
			ybuf = Math.max(0, yt);
		}
	}
	ctx.putImageData(img, 0, 0);
	return { canvas: c, top };
}

// ── clouds ────────────────────────────────────────────────────────────────
// Density is a noisy dome with a flat base. Light is a few density samples
// toward the sun (up, and to the sun's side): thick cloud between a point and
// the sun leaves it in shadow, so bases come out dark and turrets lit.
export function renderNoiseCloud(
	size: number, aspect: number, seed: number,
	top: RGB, shadow: RGB, sunSide: number, alpha: number,
): { canvas: HTMLCanvasElement; baseY: number; w: number; h: number } {
	const S = 0.75;                                    // render scale; drawn back up
	const CW = Math.ceil(size * 1.3 * S), CH = Math.ceil(size * (aspect * 1.25 + 0.3) * S);
	const baseY = CH - Math.ceil(size * 0.12 * S);
	const c = makeCanvas(CW, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(CW, CH);
	const ox = (seed % 997) * 1.37, oy = (seed % 541) * 0.91;
	const lobes = 0.55 + (seed % 7) * 0.05;

	const density = (x: number, y: number): number => {
		const prof = aspect * Math.sqrt(Math.max(0, 1 - (x / lobes) ** 2)) * (0.65 + 0.5 * fbm2(x * 3 + ox, oy, 3));
		let d = prof - y + (fbm2(x * 7 + ox, y * 7 + oy, 4) - 0.5) * 0.22;
		if (y < 0) d += y * 6;                           // flat base
		return d;
	};
	const len = Math.hypot(sunSide * 0.6, 1);
	const lx = (sunSide * 0.6) / len, ly = 1 / len;

	for (let py = 0; py < CH; py++) {
		const y = (baseY - py) / (size * S);
		for (let px = 0; px < CW; px++) {
			const x = (px - CW / 2) / (size * S);
			const d = density(x, y);
			if (d <= 0) continue;
			let acc = 0;
			for (const s of [0.03, 0.07, 0.13, 0.22]) acc += Math.max(0, density(x + lx * s, y + ly * s));
			const T = Math.exp(-acc * 7);
			const lift = Math.max(0, Math.min(1, y / Math.max(0.05, aspect)));
			const col = mixRGB(shadow, top, Math.min(1, T * 0.85 + lift * 0.25));
			const a = smooth(0, 0.07, d) * alpha;
			const i = (py * CW + px) * 4;
			img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = a * 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return { canvas: c, baseY: baseY / S, w: CW / S, h: CH / S };
}

/** Cirrus: noise stretched along the wind and thresholded into fibres. */
export function renderNoiseCirrus(width: number, seed: number, colour: RGB, alpha: number): HTMLCanvasElement {
	const CW = Math.ceil(width), CH = Math.ceil(Math.max(24, width * 0.16));
	const c = makeCanvas(CW, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(CW, CH);
	const ox = (seed % 991) * 1.13;
	for (let py = 0; py < CH; py++) {
		const v = py / CH;
		for (let px = 0; px < CW; px++) {
			const u = px / CW;
			// Fibres bend a little: the stretched coordinate is warped by slow noise.
			const warp = (noise2D(u * 3 + ox, 1.7) - 0.5) * 0.35;
			const n = fbm2(u * 2.2 + ox, (v + warp) * 14, 4);
			const env = Math.pow(Math.sin(Math.PI * u), 0.8) * Math.exp(-(((v - 0.5 - warp * 0.4) / 0.24) ** 2));
			const a = smooth(0.5, 0.72, n) * env * alpha;
			if (a <= 0.003) continue;
			const i = (py * CW + px) * 4;
			img.data[i] = colour[0]; img.data[i + 1] = colour[1]; img.data[i + 2] = colour[2]; img.data[i + 3] = a * 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return c;
}

// ── grain ─────────────────────────────────────────────────────────────────
// A static tile of faint light and dark specks. It breaks up the 8-bit banding
// in long canvas gradients, which is a large part of why they look generated.
export function makeGrainTile(): HTMLCanvasElement {
	const N = 128;
	const c = makeCanvas(N, N);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(N, N);
	const rng = makePRNG(0x9A11);
	for (let i = 0; i < N * N; i++) {
		const v = rng() < 0.5 ? 0 : 255;
		img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
		img.data[i * 4 + 3] = 3 + rng() * 6;
	}
	ctx.putImageData(img, 0, 0);
	return c;
}

// ── foothills ─────────────────────────────────────────────────────────────
// Rolling foothills between the field and the ranges (2026-10-22). The ranges
// alone met the field along one straight line and read as cut-outs. Rows of
// rounded hills, far to near, each overlapping the foot of the one behind it,
// carry the ground up into the mountains. Each column is shaded from its crest
// down: the top catches skylight, the side facing the sun is lit, and the
// hollow where the next row overlaps falls dark and hazy.
export function renderFoothills(W: number, baseY: number, rise: number, seed: number, L: RangeLight): { canvas: HTMLCanvasElement; top: number } {
	const ROWS = 3;
	const top = Math.max(0, Math.floor(baseY - rise * 1.1));
	const CH = Math.ceil(baseY - top + 2);
	const c = makeCanvas(W, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(W, CH);
	const d = img.data;
	const [lx, ly] = L.sun;
	const GRASS: RGB = [176, 160, 118];           // dry valley grass, matching the field

	for (let r = 0; r < ROWS; r++) {
		const k = r / (ROWS - 1);                    // 0 far → 1 near
		const height = rise * (1 - 0.32 * k);        // nearer rows are lower: they stand in front
		const lift = rise * 0.42 * (1 - k);          // and their bases sit lower on screen
		const span = W / (3 + r * 1.5);
		const fog = Math.min(1, L.fogAmt * (2.6 - 1.9 * k));        // the far row melts into the range behind it
		const crestAt = (x: number) => {
			const n = fbm2(x / span + seed + r * 7.3, r * 3.1, 3);
			return lift + height * (0.25 + 0.75 * smooth(0.25, 0.75, n));
		};
		for (let x = 0; x < W; x++) {
			const cy = crestAt(x);
			const slope = (crestAt(x + 2) - crestAt(x - 2)) / 4;   // + = rising to the right
			// Side light: a slope rising away from the sun faces it.
			const side = Math.max(0, Math.min(1, 0.5 - slope * Math.sign(lx || 1) * 2.2 * Math.abs(lx) / Math.max(0.2, ly + 0.2)));
			const yTop = Math.round(baseY - top - cy);
			const yBot = Math.round(baseY - top);
			for (let y = Math.max(0, yTop); y < Math.min(CH, yBot + 2); y++) {
				const t = (y - yTop) / Math.max(1, yBot - yTop);   // 0 crest → 1 base
				const m = fbm2(x / 26 + r * 5, y / 7 + seed, 3);              // sage and dry grass, soft patches
				const sky = 0.55 * (1 - t) * (1 - t) + 0.12;
				const sun = (0.35 + 0.65 * side) * (1 - 0.6 * t) * Math.max(0, ly + 0.15);
				const alb = mixRGB(GRASS, [120, 118, 88], smooth(0.45, 0.7, m) * 0.5);
				let col: RGB = [
					(alb[0] / 255) * (L.sunCol[0] * sun + L.sky[0] * sky),
					(alb[1] / 255) * (L.sunCol[1] * sun + L.sky[1] * sky),
					(alb[2] / 255) * (L.sunCol[2] * sun + L.sky[2] * sky),
				];
				col = mixRGB(L.night, col, L.dl);
				col = mixRGB(col, L.fog, Math.min(1, fog * (0.6 + 0.6 * t)));
				const i = (y * W + x) * 4;
				d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
			}
		}
	}
	ctx.putImageData(img, 0, 0);
	return { canvas: c, top };
}
