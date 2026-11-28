// Painted 2D clouds (2026-11-28), the third cloud mode beside the baked sprites
// and the 3D layer (cloudField.ts). Pure Canvas2D, no bake and no warm-up:
//  1. per layer (far / mid / near) every cloud is ~40 soft puff sprites drawn
//     source-over into a low-res buffer. A sprite's alpha is its density, its
//     red channel a pre-shaded ball lit from one of 16 directions.
//  2. a drifting two-octave noise tile goes into a second low-res buffer.
//  3. one per-pixel pass warps the lookup by the noise, erodes thin density,
//     thresholds to alpha, bands the shade into soft flat tones and ramps it
//     shadow → top, hazed toward the sky by layer.
// Turret puffs rise, swell, drift and shed on their own cycles; clouds form
// core-out and dissolve edge-in. Everything is a pure function of scene time,
// so the admin clock can scrub. Prototyped in the session scratchpad.

import type { RGB3 } from './cloudField';

export interface PuffEnv {
	top: RGB3; shadow: RGB3; hazeTo: RGB3;   // 0–255
	cover: number;                            // 0..1
	lightX: number; lightY: number;           // in cloud-band canvas px
	up: number;                               // 0..1, how much the light comes from above
	contrast: number;
	under: number;                            // -1 base in shade .. +1 base lit from below
	tSec: number;                             // scene seconds × pace
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix3 = (a: RGB3, b: RGB3, t: number): RGB3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function prng(seed: number): () => number {
	let s = seed >>> 0;
	return () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash2 = (a: number, b: number) => (Math.imul(a + 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(b + 0x7F4A7C15, 0xC2B2AE35)) >>> 0;

/** How the sun, moon and weather light the painted clouds. Pure; Garden supplies the colours. */
export function puffEnv(i: {
	top: RGB3; shadow: RGB3; hazeTo: RGB3; cover: number; altDeg: number; night: number; moonLit: number;
	sxn: number; moonXn: number; bandW: number; bandH: number; tSec: number;
}): PuffEnv {
	const { altDeg: alt, night } = i;
	let { top, shadow } = i;
	let lightX = i.sxn * i.bandW, lightY = i.bandH * (1.5 - clamp01(alt / 60) * 1.4);
	let up = clamp01((alt - 1) / 18), contrast = alt < 12 ? 1.05 : 1.15, cover = i.cover;
	let under = alt > 6 ? -1 : alt > -6 ? 1 - 2 * ss(1.5, 6, alt) : 0.8;   // the low sun lights the bases
	under *= 1 - 0.6 * ss(-4, -12, alt);
	if (i.cover > 0.3) top = mix3(top, mix3(top, shadow, 0.55), Math.min(1, (i.cover - 0.3) / 0.6));   // no direct sun under a deck
	if (night > 0) {
		const lit = clamp01(i.moonLit * 1.6);
		top = mix3(top, mix3([54, 56, 68], [132, 140, 162], lit), night);
		shadow = mix3(shadow, mix3([24, 26, 38], [40, 46, 68], lit), night);
		if (lit > 0.08) { lightX = i.moonXn * i.bandW; lightY = i.bandH * 0.4; up = 0.35; under = -0.6 * night + under * (1 - night); }
		else { lightY = i.bandH * 3; up = 0; contrast = 0.6; under = 0.5; }
		cover *= 1 - 0.5 * night;
	}
	return { top, shadow, hazeTo: i.hazeTo, cover, lightX, lightY, up, contrast, under, tSec: i.tSec };
}

// ── built once ──────────────────────────────────────────────────────────
function makeNoiseTile(): HTMLCanvasElement {
	const N = 256, r = prng(77), out = new Float32Array(N * N);
	for (const [per, amp] of [[4, 0.5], [8, 0.26], [16, 0.14], [32, 0.07], [64, 0.03]]) {
		const g = new Float32Array(per * per).map(() => r());
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
			const fx = x / N * per, fy = y / N * per, xi = fx | 0, yi = fy | 0;
			let u = fx - xi, v = fy - yi; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
			const a = g[yi * per + xi], b = g[yi * per + (xi + 1) % per], c = g[((yi + 1) % per) * per + xi], d = g[((yi + 1) % per) * per + (xi + 1) % per];
			out[y * N + x] += amp * (a + (b - a) * u + (c - a + (a - b - c + d) * u) * v);
		}
	}
	const cv = document.createElement('canvas'); cv.width = cv.height = N;
	const cx = cv.getContext('2d')!, im = cx.createImageData(N, N);
	for (let i = 0; i < N * N; i++) { const v = 255 * clamp01((out[i] - 0.5) * 1.9 + 0.5); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
	cx.putImageData(im, 0, 0);
	return cv;
}
const NDIR = 16, SPR = 48;
function makeSprites(): HTMLCanvasElement[] {
	const out: HTMLCanvasElement[] = [];
	for (let k = 0; k < NDIR; k++) {
		const ang = k / NDIR * Math.PI * 2, lx = Math.cos(ang), ly = Math.sin(ang);
		const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
		const cx = cv.getContext('2d')!, im = cx.createImageData(SPR, SPR);
		for (let y = 0; y < SPR; y++) for (let x = 0; x < SPR; x++) {
			const u = (x + 0.5) / SPR * 2 - 1, v = (y + 0.5) / SPR * 2 - 1, r2 = u * u + v * v, o = (y * SPR + x) * 4;
			if (r2 >= 1) continue;
			const a = Math.pow(1 - r2, 1.6);
			const sh = clamp01(0.5 + 0.8 * (u * lx + v * ly) + 0.12 * (1 - r2));
			im.data[o] = 255 * sh; im.data[o + 1] = 0; im.data[o + 2] = 0; im.data[o + 3] = 255 * a;
		}
		cx.putImageData(im, 0, 0); out.push(cv);
	}
	return out;
}

interface Layer { y0: number; y1: number; scale: number; speed: number; haze: number; slots: number; flat: number }
const LAYERS: Layer[] = [
	{ y0: 0.80, y1: 0.98, scale: 0.36, speed: 2.2, haze: 0.5, slots: 14, flat: 0.7 },
	{ y0: 0.58, y1: 0.78, scale: 0.62, speed: 3.6, haze: 0.22, slots: 9, flat: 0.9 },
	{ y0: 0.40, y1: 0.56, scale: 0.95, speed: 5.5, haze: 0, slots: 6, flat: 1 },
];

interface Puff { x: number; h: number; rad: number; base: boolean; turret: boolean; per: number; ph: number; ph2: number; rank: number }
interface Shape { aspect: number; puffs: Puff[]; width: number }
const shapeCache = new Map<number, Shape>();
/** A cloud's fixed anatomy for one life: puffs in cloud units (x in −1..1 of half-width, h 0..1 of height). */
export function shapeFor(seed: number): Shape {
	let s = shapeCache.get(seed); if (s) return s;
	const r = prng(seed), form = r();
	const tower = form < 0.22, flat = form > 0.72;
	const aspect = tower ? 0.8 + r() * 0.25 : flat ? 0.3 + r() * 0.1 : 0.5 + r() * 0.2;
	const lumps: { x: number; w: number; h: number }[] = [];
	const nl = tower ? 1 + (r() < 0.5 ? 1 : 0) : 2 + ((r() * 2) | 0);
	for (let i = 0; i < nl; i++) lumps.push({ x: i === 0 ? (r() - 0.5) * 0.6 : (r() - 0.5) * 1.3, w: (tower ? 0.3 : 0.42) + r() * 0.3, h: i === 0 ? 1 : 0.4 + r() * 0.45 });
	const prof = (x: number) => { let m = 0; for (const l of lumps) { const d = (x - l.x) / l.w; m = Math.max(m, l.h * Math.exp(-d * d * 1.4)); } return m * (1 - Math.pow(Math.abs(x), 3)); };
	const puffs: Puff[] = [], n = 36 + ((r() * 10) | 0);
	for (let i = 0; i < n; i++) {
		const base = i < 7;
		const l = lumps[(r() * r() * nl) | 0];
		const x = base ? (i / 6 * 2 - 1) * 0.8 + (r() - 0.5) * 0.12 : Math.max(-0.95, Math.min(0.95, l.x + (r() + r() + r() - 1.5) * l.w * 0.9));
		const top = prof(x);
		const h = base ? 0.08 + 0.1 * r() : top * (0.12 + 0.88 * Math.pow(r(), 0.85));
		const rad = base ? 0.2 + r() * 0.07 : (0.15 + r() * 0.11) * (1 - 0.45 * h);
		puffs.push({ x, h, rad, base, turret: !base && r() < 0.6, per: 45 + r() * 70, ph: r(), ph2: r(), rank: clamp01(0.75 * Math.hypot(x, h * 1.2) + 0.25 * r()) });
	}
	puffs.sort((a, b) => b.h - a.h);
	s = { aspect, puffs, width: 0.6 + r() * 0.5 };
	if (shapeCache.size > 200) shapeCache.clear();
	shapeCache.set(seed, s); return s;
}

interface Buf {
	L: Layer; y: number; h: number; s: number;
	den: HTMLCanvasElement; dctx: CanvasRenderingContext2D; noi: HTMLCanvasElement; nctx: CanvasRenderingContext2D;
	out: HTMLCanvasElement; octx: CanvasRenderingContext2D; img: ImageData; pat: CanvasPattern | null;
}

export interface CloudPuffs {
	readonly canvas: HTMLCanvasElement;
	readonly ok: boolean;
	readonly pending: boolean;
	pump(): void;
	/** Band size in canvas px; `res` is buffer px per CSS px. */
	resize(wPx: number, bandPx: number, dpr: number, res: number): void;
	render(env: PuffEnv): void;
}

export function createCloudPuffs(): CloudPuffs | null {
	const canvas = document.createElement('canvas');
	const octx = canvas.getContext('2d');
	if (!octx) return null;
	const TILE = makeNoiseTile(), SPRITES = makeSprites();
	let bufs: Buf[] = [], W = 0, CB = 0, bw = 0, dpr = 1, res = 0.5, sizeKey = '';

	function resize(wPx: number, bandPx: number, d: number, r: number): void {
		const key = `${wPx}|${bandPx}|${d}|${r}`;
		if (key === sizeKey) return;
		sizeKey = key; W = wPx; CB = bandPx; dpr = d; res = r;
		const s = res / dpr;
		bw = Math.max(2, Math.ceil(W * s));
		canvas.width = bw; canvas.height = Math.max(2, Math.ceil(CB * s));
		bufs = LAYERS.map((L) => {
			const top = Math.max(0, L.y0 - 1.0 * L.scale), bot = Math.min(1.02, L.y1 + 0.03);
			const y = Math.floor(top * CB * s), h = Math.max(2, Math.ceil((bot - top) * CB * s));
			const mk = (o?: CanvasRenderingContext2DSettings): [HTMLCanvasElement, CanvasRenderingContext2D] => { const c = document.createElement('canvas'); c.width = bw; c.height = h; return [c, c.getContext('2d', o)!]; };
			const [den, dctx] = mk({ willReadFrequently: true }), [noi, nctx] = mk({ willReadFrequently: true }), [out, bo] = mk();
			return { L, y, h, s, den, dctx, noi, nctx, out, octx: bo, img: bo.createImageData(bw, h), pat: nctx.createPattern(TILE, 'repeat') };
		});
	}

	function render(env: PuffEnv): void {
		if (!bufs.length) return;
		const t = env.tSec;
		octx!.clearRect(0, 0, canvas.width, canvas.height);
		for (const B of bufs) {
			const { L, dctx, nctx, s } = B, bh = B.h;
			dctx.setTransform(1, 0, 0, 1, 0, 0); dctx.clearRect(0, 0, bw, bh);
			const unit = Math.min(W, CB * 4.5) * 0.2 * L.scale * (1 + 0.5 * env.cover);
			const active = L.slots * clamp01(0.12 + env.cover * 1.25);
			for (let i = 0; i < L.slots; i++) {
				const pres = ss(0, 1, active - i);
				if (pres <= 0) continue;
				const sr = prng(hash2(i, L.slots * 31)), lifeLen = 520 + sr() * 520, off = sr();
				const lt = t / lifeLen + off, cyc = Math.floor(lt), u = lt - cyc;
				const seed = hash2(hash2(i, cyc), (L.scale * 1000) | 0), cr = prng(seed);
				const shape = shapeFor(seed);
				const grow = ss(0, 0.28, u), dis = ss(0.66, 1, u);
				const hw = unit * shape.width * (0.55 + 0.45 * grow) * (1 + 0.12 * dis);
				let hgt = hw * 2 * shape.aspect * L.flat * (1 - 0.45 * env.cover) * (0.35 + 0.65 * grow) * (1 - 0.35 * dis);
				const span = W + unit * 5;
				const baseY0 = (L.y0 + (L.y1 - L.y0) * prng(seed ^ 5)()) * CB; hgt = Math.min(hgt, baseY0 - CB * 0.1);
				const cx = (((cr() * span + t * L.speed * dpr) % span) + span) % span - unit * 2.5;
				const baseY = (L.y0 + (L.y1 - L.y0) * cr()) * CB;
				if (cx + hw * 1.4 < 0 || cx - hw * 1.4 > W) continue;
				let dx = env.lightX - cx, dy = env.lightY - (baseY - hgt * 0.5); const dl = Math.hypot(dx, dy) || 1;
				dx = dx / dl; dy = dy / dl - 1.3 * env.up;
				const dir = ((Math.round(Math.atan2(dy, dx) / (Math.PI * 2) * NDIR) % NDIR) + NDIR) % NDIR, spr = SPRITES[dir];
				dctx.save();
				dctx.beginPath(); dctx.rect(0, 0, bw, (baseY + hgt * 0.04) * s - B.y); dctx.clip();
				const shear = 0.16 * hw;
				for (const p of shape.puffs) {
					let w = pres * ss(0, 0.3, grow * 1.3 - p.rank) * (1 - ss(0, 0.35, dis * 1.35 - (1 - p.rank)));
					if (w <= 0.01) continue;
					let x = p.x, h = p.h, rad = p.rad;
					if (p.turret) {
						const v = (t / p.per + p.ph) % 1, rise = ss(0, 0.55, v);
						w *= ss(0, 0.14, v) * (1 - ss(0.7, 1, v));
						h *= 0.35 + 0.65 * rise + 0.12 * v; rad *= 0.6 + 0.4 * rise + 0.3 * ss(0.65, 1, v);
						x += (v - 0.4) * 0.14;
					} else {
						const a = t / p.per * Math.PI * 2;
						x += 0.035 * Math.sin(a + p.ph * 6.28); h *= 1 + 0.1 * Math.sin(a * 0.7 + p.ph2 * 6.28); rad *= 1 + 0.07 * Math.sin(a * 1.3 + p.ph2 * 9);
					}
					const rx = rad * hw * (p.base ? 1.7 : 1.25), ry = p.base ? Math.max(rad * hw * 0.55, hgt * 0.3) : rad * hw * 1.25;
					const X = cx + x * hw + shear * h, Y = baseY - h * hgt - (p.base ? 0 : ry * 0.25);
					dctx.globalAlpha = Math.min(1, w * (p.base ? 0.95 : 0.85));
					dctx.drawImage(spr, (X - rx) * s, (Y - ry) * s - B.y, 2 * rx * s, 2 * ry * s);
				}
				dctx.globalCompositeOperation = 'source-atop'; dctx.globalAlpha = pres;
				const gy0 = (baseY - hgt * 1.15) * s - B.y, gy1 = baseY * s - B.y, gr = dctx.createLinearGradient(0, gy0, 0, gy1);
				const under = env.under;
				const cTop = under > 0 ? '0,0,0' : '255,0,0', cBase = under > 0 ? '255,0,0' : '0,0,0', k = Math.abs(under);
				gr.addColorStop(0, `rgba(${cTop},${0.3 * k})`); gr.addColorStop(0.5, `rgba(${cTop},0)`);
				gr.addColorStop(0.62, `rgba(${cBase},0)`); gr.addColorStop(1, `rgba(${cBase},${0.5 * k})`);
				dctx.fillStyle = gr; dctx.fillRect((cx - hw * 1.5) * s, gy0, hw * 3 * s, gy1 - gy0 + 2);
				dctx.restore();
			}
			const ox = t * L.speed * dpr * s;
			nctx.setTransform(1, 0, 0, 1, 0, 0); nctx.globalAlpha = 1;
			const k1 = 0.8 * (0.5 + L.scale * 0.5) * (res / 0.5);
			B.pat?.setTransform(new DOMMatrix().translate(ox, B.y * 0.5).scale(k1));
			nctx.fillStyle = B.pat!; nctx.fillRect(0, 0, bw, bh);
			nctx.globalAlpha = 0.5;
			B.pat?.setTransform(new DOMMatrix().translate(ox * 0.8 + 37 - t * 0.06 * s * 3, 91 - t * 0.09 * s * 3).scale(k1 * 0.45));
			nctx.fillRect(0, 0, bw, bh);

			const D = dctx.getImageData(0, 0, bw, bh).data, Nn = nctx.getImageData(0, 0, bw, bh).data, O = B.img.data;
			const top = mix3(env.top, env.hazeTo, L.haze * 0.75), sh = mix3(env.shadow, env.hazeTo, L.haze), aMax = 255 * (1 - L.haze * 0.25);
			const bands = 3, warp = 3.2 * (res / 0.5) * (0.6 + 0.4 * L.scale), con = env.contrast;
			const R = new Uint8Array(256), G = new Uint8Array(256), Bc = new Uint8Array(256);
			for (let i = 0; i < 256; i++) {
				let v = clamp01(0.5 + (i / 255 - 0.5) * con);
				const f = v * bands, fi = Math.min(bands - 1, Math.floor(f)); v = (fi + ss(0.3, 0.7, f - fi)) / bands; v = v * 0.85 + 0.15 * (i / 255);
				R[i] = sh[0] + (top[0] - sh[0]) * v; G[i] = sh[1] + (top[1] - sh[1]) * v; Bc[i] = sh[2] + (top[2] - sh[2]) * v;
			}
			const AL = new Uint8Array(512);
			for (let i = 0; i < 512; i++) AL[i] = aMax * ss(112, 168, i - 128);
			for (let y = 0, o = 0; y < bh; y++) for (let x = 0; x < bw; x++, o += 4) {
				const n = Nn[o], n2 = Nn[((y * bw + ((x + 23) % bw)) << 2)];
				let xx = x + (((n - 128) * warp) >> 7), yy = y + (((n2 - 128) * warp) >> 7);
				if (xx < 0) xx = 0; else if (xx >= bw) xx = bw - 1; if (yy < 0) yy = 0; else if (yy >= bh) yy = bh - 1;
				const q = (yy * bw + xx) << 2, a = D[q + 3];
				if (a < 40) { O[o + 3] = 0; continue; }
				const d = a + (((n - 128) * (1.25 - a * 0.0032)) | 0) + 128;
				const al = AL[d < 0 ? 0 : d > 511 ? 511 : d];
				if (al === 0) { O[o + 3] = 0; continue; }
				let s8 = D[q] + (((n2 - 128) * 0.45) | 0);
				s8 = s8 < 0 ? 0 : s8 > 255 ? 255 : s8;
				O[o] = R[s8]; O[o + 1] = G[s8]; O[o + 2] = Bc[s8]; O[o + 3] = al;
			}
			B.octx.putImageData(B.img, 0, 0);
			octx!.drawImage(B.out, 0, B.y);
		}
	}

	return { canvas, get ok() { return true; }, get pending() { return false; }, pump() { /* nothing to build */ }, resize, render };
}
