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
	// Faint now: the terrain bake carries the real patches (2026-10-22).
	const green: RGB = [226, 236, 212];
	const gold:  RGB = [252, 244, 222];
	for (let y = 0; y < ph; y++) {
		const t = y / ph;                                  // 0 horizon → 1 foreground
		// Patches are stretched sideways and shrink toward the horizon.
		const sy = 1 / (0.12 + t);
		for (let x = 0; x < pw; x++) {
			const n = fbm2((x / pw) * 7 * sy * 0.35 + 3.1, t * 9 + 7.7);
			const col = mixRGB(green, gold, smooth(0.42, 0.62, n));
			const dark = 1 - 0.14 * t - 0.06 * smooth(0.55, 0.8, fbm2(x / pw * 18, t * 30));
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
	const near = Math.round(count * 0.5);                // extra blades in the bottom quarter
	ctx.lineCap = 'round';
	const BLADE: RGB[] = [[120, 140, 82], [150, 160, 96], [96, 116, 70], [214, 196, 140], [176, 168, 110]];
	for (let i = 0; i < count + near; i++) {
		const t = i < count ? Math.pow(rng(), 0.85) : 0.75 + 0.25 * rng();
		const x = rng() * W;
		const y = t * bandH;
		const size = (0.12 + 1.7 * Math.pow(t, 1.1)) * scale;
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

	// Bare ground where the grass thins, only in the near field: soft
	// dun-coloured patches, broken up by noise, with blades over their edges.
	const soil = makeCanvas(pw, ph);
	const sctx = soil.getContext('2d')!;
	const simg = sctx.createImageData(pw, ph);
	for (let y = 0; y < ph; y++) {
		const t = y / ph;
		if (t < 0.55) continue;
		for (let x = 0; x < pw; x++) {
			const n = fbm2(x / pw * 5 + 11.3, t * 6 + 2.9) + 0.25 * fbm2(x / pw * 40, t * 40);
			const a = smooth(0.68, 0.82, n) * smooth(0.55, 0.8, t) * 0.7;
			const i = (y * pw + x) * 4;
			simg.data[i] = 214; simg.data[i + 1] = 188; simg.data[i + 2] = 150; simg.data[i + 3] = a * 255;
		}
	}
	sctx.putImageData(simg, 0, 0);
	ctx.drawImage(soil, 0, 0, W, bandH);

	// A few rocks in the near field: grey, flat-bottomed, the top lighter
	// than the shaded base, each with a short contact shadow.
	for (let i = 0; i < 4; i++) {
		const t = 0.62 + rng() * 0.33;
		const x = rng() * W, y = t * bandH;
		const rw = (12 + rng() * 20) * (0.4 + t) * scale, rh = rw * (0.45 + rng() * 0.2);
		ctx.fillStyle = 'rgb(150,148,140)';
		ctx.beginPath(); ctx.ellipse(x + rw * 0.25, y + rh * 0.15, rw * 1.2, rh * 0.35, 0, 0, Math.PI * 2); ctx.fill();
		ctx.fillStyle = 'rgb(168,166,160)';
		ctx.beginPath();
		ctx.moveTo(x - rw, y);
		for (let k = 0; k <= 8; k++) {
			const a = Math.PI + (k / 8) * Math.PI;
			const j = 0.8 + rng() * 0.3;
			ctx.lineTo(x + Math.cos(a) * rw * j, y + Math.sin(a) * rh * j);
		}
		ctx.closePath(); ctx.fill();
		ctx.fillStyle = 'rgb(222,220,212)';
		ctx.beginPath(); ctx.ellipse(x - rw * 0.15, y - rh * 0.55, rw * 0.55, rh * 0.3, -0.1, 0, Math.PI * 2); ctx.fill();
	}

	// The nearest ground falls off a little, as a lens's lower edge does.
	const fall = ctx.createLinearGradient(0, bandH * 0.7, 0, bandH);
	fall.addColorStop(0, 'rgba(255,255,255,0)');
	fall.addColorStop(1, 'rgba(150,150,140,0.55)');
	ctx.fillStyle = fall;
	ctx.fillRect(0, bandH * 0.7, W, bandH * 0.3);
	return c;
}

// ── wildflowers ───────────────────────────────────────────────────────────
// Specks of colour over the meadow, in loose drifts: mule's ears, lupine,
// yarrow, globemallow. Drawn on top (the meadow layer only darkens).
export interface Flower { x: number; y: number; r: number; col: RGB; on: number }

const FLOWER_COLS: RGB[] = [[232, 197, 71], [139, 111, 184], [236, 232, 220], [217, 119, 58]];

/** Bloom, 0–1: from late April, full through June, gone by mid-September. */
export function flowerBloom(doy: number): number {
	const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (doy - a) / (b - a)));
	return ramp(110, 140) * (1 - ramp(200, 258));
}

/** `on` is the bloom level a flower needs to show, so a thin season shows a few. */
export function makeFlowers(W: number, bandH: number, scale: number, seed = 0xF10E5): Flower[] {
	const rng = makePRNG(seed);
	const out: Flower[] = [];
	const drifts = Array.from({ length: 6 }, () => ({ x: rng() * W, t: 0.08 + Math.pow(rng(), 0.8) * 0.85, col: Math.floor(rng() * 4) }));
	for (let i = 0; i < 160; i++) {
		const d = drifts[i % drifts.length];
		const t = Math.max(0.03, Math.min(0.98, d.t + (rng() - 0.5) * 0.14));
		const k = 1.233 / (1.233 - t);
		out.push({
			x: d.x + (rng() - 0.5) * W * 0.12 * k,
			y: t * bandH,
			r: Math.min(2.6, (0.45 + rng() * 0.5) * k) * scale,
			col: FLOWER_COLS[rng() < 0.75 ? d.col : Math.floor(rng() * 4)],
			on: rng(),
		});
	}
	return out;
}

// ── clouds ────────────────────────────────────────────────────────────────
// A cumulus is a cluster of puffs on a flat base: the middle puffs largest,
// each one's edge eroded by fine noise so the outline billows instead of
// reading as one dome. Light is a short march toward the sun (up, and to the
// sun's side): thick cloud between a point and the sun leaves it in shadow,
// so bases come out dark and turrets lit. Two terms on top of that: "powder"
// darkens the thin outer skin on the shadow side, and thin cloud facing the
// sun glows (the silver lining). Rendered at full size, so it stays crisp.
// `haze` (0 near, 1 at the horizon) flattens and fades the far ones.
export function renderNoiseCloud(
	size: number, aspect: number, seed: number,
	top: RGB, shadow: RGB, sunSide: number, alpha: number, haze = 0, sunAlt = 30,
): { canvas: HTMLCanvasElement; baseY: number; w: number; h: number } {
	const CW = Math.ceil(size * 2.4), CH = Math.ceil(size * (aspect * 2.2 + 0.35));
	const baseY = CH - Math.ceil(size * 0.12);
	const c = makeCanvas(CW, CH);
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(CW, CH);
	const ox = (seed % 997) * 1.37, oy = (seed % 541) * 0.91;
	const rng = makePRNG(seed);

	// Puffs across the base, tallest near the middle.
	const span = 0.5 + rng() * 0.12;
	const n = 5 + Math.floor(rng() * 4);
	const puffs: [number, number, number][] = [];
	for (let i = 0; i < n; i++) {
		const x = -span + (2 * span * (i + 0.2 + rng() * 0.6)) / n;
		const mid = Math.sqrt(Math.max(0, 1 - (x / (span * 1.1)) ** 2));
		const r = (0.08 + aspect * 0.6) * (0.4 + 0.6 * mid) * (0.75 + rng() * 0.45);
		const rr = Math.max(r, (1.5 * span) / n);           // neighbours always overlap
		puffs.push([x, rr * (0.45 + rng() * 0.35), rr]);
	}
	// Turrets in two tiers: some riding on the big puffs, a few more on those.
	const t1 = 3 + Math.floor(rng() * 3);
	for (let i = 0; i < t1; i++) {
		const [px, py, pr] = puffs[1 + Math.floor(rng() * (n - 2))];
		puffs.push([px + (rng() - 0.5) * pr, py + pr * 0.6, pr * (0.4 + rng() * 0.25)]);
	}
	const t2 = 2 + Math.floor(rng() * 2);
	for (let i = 0; i < t2; i++) {
		const [px, py, pr] = puffs[n + Math.floor(rng() * t1)];
		puffs.push([px + (rng() - 0.5) * pr * 0.8, py + pr * 0.55, pr * (0.45 + rng() * 0.2)]);
	}

	const density = (x: number, y: number): number => {
		let d = -1;
		for (const [px, py, pr] of puffs) {
			const q = 1 - Math.hypot(x - px, (y - py) * 1.1) / pr;
			if (q > d) d = q;
		}
		if (d < -0.35) return d;
		// Erosion: coarse lumps, then fine billows at the edge only.
		d += (fbm2(x * 6 + ox, y * 6 + oy, 3) - 0.5) * 0.45;
		d += (fbm2(x * 22 + oy, y * 22 + ox, 3) - 0.5) * 0.22 * (1 - smooth(0, 0.4, d)) * (x * sunSide > 0 ? 1.3 : 1);
		if (y < 0) d += y * 14;                          // flat base
		return d;
	};

	// Light angle above the horizontal: near-overhead at midday, from the side
	// at sunset, and from below once the sun is down, when only the bases are lit.
	const e = (sunAlt >= 0 ? Math.min(80, sunAlt * 3.2) : Math.max(-18, sunAlt * 3)) * Math.PI / 180;
	const lx = sunSide * Math.cos(e), ly = Math.sin(e);
	const under = 1 - smooth(-1, 4, sunAlt);
	const STEPS = [0.02, 0.045, 0.08, 0.13, 0.2, 0.3];
	const rim = mixRGB(top, [255, 255, 255], 0.6);
	// Far clouds sit in the air between: flatter light, toward the haze.
	const far = mixRGB(top, shadow, 0.3);

	// Density on a half-resolution grid, read back smoothly. The light march
	// reads the grid too instead of re-evaluating the noise; phones need both.
	const GW = Math.ceil(CW / 2) + 1, GH = Math.ceil(CH / 2) + 1;
	const G = new Float32Array(GW * GH);
	for (let gy = 0; gy < GH; gy++) {
		const y = (baseY - gy * 2) / size;
		for (let gx = 0; gx < GW; gx++) G[gy * GW + gx] = density((gx * 2 - CW / 2) / size, y);
	}
	const at = (px: number, py: number): number => {
		const fx = px / 2, fy = py / 2;
		if (fx < 0 || fy < 0 || fx >= GW - 1 || fy >= GH - 1) return -1;
		const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, k = iy * GW + ix;
		const top = G[k] + (G[k + 1] - G[k]) * tx, bot = G[k + GW] + (G[k + GW + 1] - G[k + GW]) * tx;
		return top + (bot - top) * ty;
	};

	for (let py = 0; py < CH; py++) {
		const y = (baseY - py) / size;
		for (let px = 0; px < CW; px++) {
			const d = at(px, py);
			if (d <= 0) continue;
			let acc = 0;
			for (const s of STEPS) acc += Math.max(0, at(px + lx * s * size, py - ly * s * size)) * s;
			const T = Math.exp(-acc * 6);
			const powder = 1 - Math.exp(-d * 6);
			const up = smooth(0, Math.max(0.05, aspect * 1.2), y);
			const lift = up + (1 - 2 * up) * under;   // a low sun lifts the base instead of the top
			let col = mixRGB(shadow, top, Math.min(1, 0.15 + T * (0.6 + 0.4 * powder) + lift * 0.35));
			// The flat underside stays grey even where light gets through.
			col = mixRGB(col, shadow, 0.35 * (1 - under) * (1 - smooth(0, 0.18 * aspect, y)));
			// Silver lining: thin edge, lit side.
			const thin = 1 - smooth(0, 0.12, d);
			col = mixRGB(col, rim, thin * T * 0.6);
			col = mixRGB(col, far, haze * 0.55);
			const a = smooth(0, 0.1, d) * alpha * (1 - 0.4 * haze);
			const i = (py * CW + px) * 4;
			img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = a * 255;
		}
	}
	ctx.putImageData(img, 0, 0);
	return { canvas: c, baseY, w: CW, h: CH };
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
