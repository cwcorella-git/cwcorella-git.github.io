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

const Z_ROWS = 64;

export function buildRangeField(W: number, crest: Float32Array, seed: number, gullyPx: number): RangeField {
	const Z = Z_ROWS;
	const h = new Float32Array(W * Z), fx = new Float32Array(W * Z);
	let maxH = 0;
	for (let x = 0; x < W; x++) {
		const c = crest[x];
		const u = x / gullyPx;
		for (let zi = 0; zi < Z; zi++) {
			const z = zi / (Z - 1);
			// Gullies: ridged noise, high frequency across, low frequency downslope.
			const warp = (noise2D(u * 0.3 + seed, z * 2) - 0.5) * 1.5;
			const r = 1 - Math.abs(noise2D(u + warp + seed * 3.1, z * 1.6 + seed) * 2 - 1);
			const fine = fbm2(u * 3 + seed, z * 6, 3) - 0.5;
			// Gullies fade out toward the crest, so the skyline stays the crest line
			// instead of growing a spike on every spur.
			const v = c * Math.pow(z, 1.25) * (1 - 0.22 * (1 - r * r) * Math.sqrt(1 - z)) + c * 0.04 * fine * z * (1 - z);
			h[x * Z + zi] = v;
			fx[x * Z + zi] = fbm2(u * 1.7 + seed * 7, z * 5 + seed, 3);
			if (v > maxH) maxH = v;
		}
	}
	let mean = 0;
	for (const c of crest) mean += c;
	return { W, Z, h, fx, maxH, depthPx: (mean / W) * 1.6 };
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
	const tilt = maxH * 0.12;                    // a little of the slope seen from above
	const top = Math.max(0, Math.floor(baseY - maxH - tilt - 2));
	const CH = Math.ceil(baseY - top + 2);
	const c = makeCanvas(W, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(W, CH);
	const d = img.data;
	const dz = f.depthPx / (Z - 1);
	const [lx, ly, lz] = L.sun;

	for (let x = 0; x < W; x++) {
		let ybuf = CH;
		const xl = Math.max(0, x - 1) * Z, xr = Math.min(W - 1, x + 1) * Z, xo = x * Z;
		for (let zi = 0; zi < Z; zi++) {
			const hv = h[xo + zi];
			const yt = Math.round(baseY - top - hv - (zi / (Z - 1)) * tilt);
			if (yt >= ybuf) continue;
			// Normal from the heightfield gradient.
			const dhdx = (h[xr + zi] - h[xl + zi]) / 2;
			const dhdz = (h[xo + Math.min(Z - 1, zi + 1)] - h[xo + Math.max(0, zi - 1)]) / (2 * dz);
			let nx = -dhdx, ny = 1, nz = -dhdz;
			const nl = Math.hypot(nx, ny, nz);
			nx /= nl; ny /= nl; nz /= nl;

			// Material by height, broken up by noise.
			const m = fx[xo + zi];
			const hf = hv / maxH + (m - 0.5) * 0.18;
			let alb = SAGE;
			const forest = smooth(0.22, 0.32, hf) * (1 - smooth(0.6, 0.7, hf)) * smooth(0.42, 0.58, m);
			alb = mixRGB(alb, PINE, forest);
			alb = mixRGB(alb, ROCK, Math.max(smooth(0.62, 0.78, hf), smooth(0.75, 0.55, ny) * 0.8));
			if (L.snow) alb = mixRGB(alb, SNOW, smooth(0.7, 0.8, hf) * smooth(0.5, 0.7, ny));

			const diff = Math.max(0, nx * lx + ny * ly + nz * lz);
			const amb = 0.35 + 0.25 * ny;
			let col: RGB = [
				(alb[0] / 255) * (L.sunCol[0] * diff * 0.85 + L.sky[0] * amb),
				(alb[1] / 255) * (L.sunCol[1] * diff * 0.85 + L.sky[1] * amb),
				(alb[2] / 255) * (L.sunCol[2] * diff * 0.85 + L.sky[2] * amb),
			];
			col = mixRGB(L.night, col, L.dl);
			col = mixRGB(col, L.fog, L.fogAmt);

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
