// Tree rendering for the garden (2026-10-22): tapered bark with a sunlit edge,
// foliage as clumped masses rather than dots, three local species, and the
// seasons. A tree is built once into an offscreen trunk plus one sprite per
// leaf clump; each frame only blits them, nudging the clumps with the wind.

export type RGB = [number, number, number];

export interface Seg { x1: number; y1: number; x2: number; y2: number; thick: number }
export interface Clump { x: number; y: number; r: number }
export interface Foliage { mid: RGB; amount: number; needle?: boolean }   // amount: 0 bare → 1 full leaf; needle: tufts, not leaf masses

export interface ArtLight {
	sunDx: number;   // -1 sun to the left, +1 to the right
	sunCol: RGB;
	dl: number;      // daylight 0–1
	night: RGB;      // silhouette colour after dark
}

export interface TreeArt {
	trunk: HTMLCanvasElement;
	ox: number;
	oy: number;
	sprites: { x: number; y: number; img: HTMLCanvasElement; sway: number }[];
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

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// ── seasons ───────────────────────────────────────────────────────────────
// Cottonwoods along the Truckee: bare through winter, pale green in April,
// dark green all summer, gold from early October, bare again by late November.
export function cottonwoodFoliage(doy: number): Foliage {
	const SPRING: RGB = [140, 168, 78], SUMMER: RGB = [74, 100, 46], GOLD: RGB = [206, 168, 54];
	const ramp = (a: number, b: number) => Math.max(0, Math.min(1, (doy - a) / (b - a)));
	if (doy < 95 || doy > 332) return { mid: GOLD, amount: 0 };
	if (doy < 135) return { mid: mix(SPRING, SUMMER, ramp(115, 135)), amount: ramp(95, 125) };
	if (doy < 272) return { mid: SUMMER, amount: 1 };
	return { mid: mix(SUMMER, GOLD, ramp(272, 292)), amount: 1 - ramp(305, 332) };
}
export const PINE_FOLIAGE: Foliage    = { mid: [52, 74, 50], amount: 1, needle: true };
export const JUNIPER_FOLIAGE: Foliage = { mid: [84, 104, 86], amount: 1 };

// ── shapes ────────────────────────────────────────────────────────────────
/** Group branch tips into clumps on a grid of `cell` px. */
export function clumpsFromTips(segs: Seg[], cell: number, maxThick = 1.8, minTips = 2): Clump[] {
	const cells = new Map<string, { sx: number; sy: number; n: number }>();
	const add = (x: number, y: number) => {
		const k = `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
		const c = cells.get(k) ?? { sx: 0, sy: 0, n: 0 };
		c.sx += x; c.sy += y; c.n++;
		cells.set(k, c);
	};
	for (const s of segs) {
		if (s.thick <= maxThick) add(s.x2, s.y2);
		// Leaves along the inner limbs too (minTips 1, broadleaf), so the crown
		// fills in rather than ringing its tips like an umbrella.
		else if (minTips === 1 && s.thick <= maxThick * 4) add((s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2);
	}
	const out: Clump[] = [];
	for (const c of cells.values()) {
		if (c.n < minTips) continue;
		out.push({ x: c.sx / c.n, y: c.sy / c.n, r: cell * (0.95 + Math.min(0.35, c.n * 0.03)) });
	}
	return out;
}

/** A broadleaf (cottonwood) crown by recursive branching, base at (x, y). */
export function broadleafShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const lean = (rng() - 0.5) * 0.16;
	function branch(x1: number, y1: number, ang: number, len: number, thick: number, depth: number): void {
		if (depth <= 0 || len < 1) return;
		const x2 = x1 + Math.cos(ang) * len, y2 = y1 - Math.sin(ang) * len;
		segs.push({ x1, y1, x2, y2, thick });
		const r = 0.68 + rng() * 0.08, sp = 0.42 + rng() * 0.26, b = (rng() - 0.5) * 0.24;
		branch(x2, y2, ang + sp + b, len * r, thick * 0.64, depth - 1);
		branch(x2, y2, ang - sp + b, len * r * 0.92, thick * 0.6, depth - 1);
	}
	const trunkH = h * 0.42;
	const tx = x + Math.sin(lean) * trunkH, ty = y - trunkH;
	segs.push({ x1: x, y1: y, x2: tx, y2: ty, thick: h * 0.06 });
	branch(tx, ty, Math.PI / 2 + lean + 0.5, h * 0.3, h * 0.035, 6);
	branch(tx, ty, Math.PI / 2 + lean - 0.45, h * 0.32, h * 0.035, 6);
	branch(tx, ty, Math.PI / 2 + lean, h * 0.3, h * 0.03, 5);
	return { segs, clumps: clumpsFromTips(segs, h * 0.09, h * 0.01, 1) };
}

/** Jeffrey pine, old growth: a clear tapered trunk, then limbs spiralling up
 *  it that droop low and rise near the top, with needle tufts only at their
 *  ends, so sky shows between the tiers. Narrow dome on top, ragged middle. */
export function pineShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const clumps: Clump[] = [];
	const lean = (rng() - 0.5) * 0.04;
	const at = (t: number) => ({ x: x + Math.sin(lean) * t * h, y: y - t * h });
	// Trunk in four tapering pieces.
	for (let i = 0; i < 4; i++) {
		const a = at(i / 4), b = at((i + 1) / 4);
		segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, thick: h * 0.05 * (1 - i * 0.2) });
	}
	const clear = 0.35 + rng() * 0.05;
	const limbs = 10 + Math.floor(rng() * 5);
	let side = rng() < 0.5 ? -1 : 1;
	for (let i = 0; i < limbs; i++) {
		const t = clear + (i + rng() * 0.6) / limbs * (0.97 - clear);
		side = rng() < 0.75 ? -side : side;                       // mostly alternating, as a spiral seen side-on
		const o = at(t);
		// Width: ragged and broad through the middle, a narrow dome on top.
		const u = (t - clear) / (1 - clear);
		const width = h * (0.06 + 0.24 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.25 + u * 0.95)), 0.7)) * (0.7 + rng() * 0.6);
		const ang = (-0.35 + u * 0.75) + (rng() - 0.5) * 0.2;      // droop low, rise high (radians from horizontal)
		const ex = o.x + side * Math.cos(ang) * width, ey = o.y - Math.sin(ang) * width;
		const thick = h * (0.016 - u * 0.006);
		segs.push({ x1: o.x, y1: o.y, x2: ex, y2: ey, thick });
		clumps.push({ x: ex, y: ey - h * 0.008, r: h * (0.08 + rng() * 0.05) });
		clumps.push({ x: o.x + (ex - o.x) * 0.55, y: o.y + (ey - o.y) * 0.55 - h * 0.01, r: h * (0.05 + rng() * 0.03) });
		// One or two sub-limbs off the outer half, each with its own tuft.
		const subs = 1 + (rng() < 0.5 ? 1 : 0);
		for (let k = 0; k < subs; k++) {
			const f = 0.45 + rng() * 0.35;
			const sx = o.x + (ex - o.x) * f, sy = o.y + (ey - o.y) * f;
			const sl = width * (0.25 + rng() * 0.2), sa = ang + (rng() < 0.5 ? 0.6 : -0.5);
			const tx = sx + side * Math.cos(sa) * sl, ty = sy - Math.sin(sa) * sl;
			segs.push({ x1: sx, y1: sy, x2: tx, y2: ty, thick: thick * 0.55 });
			clumps.push({ x: tx, y: ty, r: h * (0.055 + rng() * 0.035) });
		}
	}
	const top = at(1);
	clumps.push({ x: top.x, y: top.y + h * 0.03, r: h * 0.08 });
	return { segs, clumps };
}

/** Western juniper: short, multi-stemmed, a lumpy rounded crown. */
export function juniperShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const clumps: Clump[] = [];
	for (let i = 0; i < 3; i++) {
		const a = Math.PI / 2 + (i - 1) * 0.35 + (rng() - 0.5) * 0.2;
		const len = h * (0.45 + rng() * 0.15);
		segs.push({ x1: x + (i - 1) * h * 0.04, y1: y, x2: x + Math.cos(a) * len, y2: y - Math.sin(a) * len, thick: h * 0.04 });
	}
	for (let i = 0; i < 11; i++) {
		const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
		clumps.push({ x: x + Math.cos(a) * d * h * 0.42, y: y - h * 0.58 + Math.sin(a) * d * h * 0.3, r: h * (0.14 + rng() * 0.08) });
	}
	return { segs, clumps };
}

// ── rendering ─────────────────────────────────────────────────────────────
function barkFor(thick: number, maxThick: number): RGB {
	const t = Math.min(1, thick / Math.max(1, maxThick));
	return mix([125, 112, 98], [61, 49, 40], Math.sqrt(t));
}

function renderClump(r: number, f: Foliage, L: ArtLight, seed: number): HTMLCanvasElement {
	const rng = makePRNG(seed);
	const S = Math.ceil(r * 2.8);
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const ctx = c.getContext('2d')!;
	const cx = S / 2, cy = S / 2;
	// Each clump drifts a little in hue, so a crown is never one flat colour.
	const own = mix(f.mid, [112, 124, 64], rng() * 0.3);
	const mid = mix(L.night, mix(own, L.sunCol, 0.08), L.dl);
	const dark = mix(mid, [18, 26, 30], 0.5);
	const lit = mix(L.night, mix(own, L.sunCol, 0.45), L.dl);
	const blobs = (n: number, ox: number, oy: number, spread: number, r0: number, r1: number, col: RGB) => {
		ctx.fillStyle = rgb(col);
		for (let i = 0; i < Math.round(n * f.amount); i++) {
			const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * spread;
			ctx.beginPath();
			ctx.arc(cx + ox + Math.cos(a) * d * 1.15, cy + oy + Math.sin(a) * d * 0.6, r * (r0 + rng() * (r1 - r0)), 0, Math.PI * 2);   // wider than tall
			ctx.fill();
		}
	};
	if (f.needle) {
		// Tufts of needles: short strokes radiating from the clump, darker under.
		const tuft = (n: number, oy: number, col: RGB, len0: number, len1: number) => {
			ctx.strokeStyle = rgb(col);
			ctx.lineWidth = Math.max(0.8, r * 0.07);
			ctx.lineCap = 'round';
			ctx.beginPath();
			for (let i = 0; i < n; i++) {
				const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * r * 0.55;
				const px = cx + Math.cos(a) * d, py = cy + oy + Math.sin(a) * d * 0.6;
				const ra = a + (rng() - 0.5) * 0.8, l = r * (len0 + rng() * (len1 - len0));
				ctx.moveTo(px, py);
				ctx.lineTo(px + Math.cos(ra) * l, py + Math.sin(ra) * l * 0.7);
			}
			ctx.stroke();
		};
		tuft(110, r * 0.12, dark, 0.3, 0.55);
		tuft(90, 0, mid, 0.25, 0.5);
		if (L.dl > 0.05) tuft(30, -r * 0.15, lit, 0.15, 0.3);
		return c;
	}
	// Many small blobs rather than a few big ones: big circles read as popcorn.
	blobs(34, -L.sunDx * r * 0.1, r * 0.18, r * 0.85, 0.12, 0.26, dark);
	blobs(40, 0, -r * 0.05, r * 0.75, 0.1, 0.22, mid);
	if (L.dl > 0.05) blobs(24, L.sunDx * r * 0.3, -r * 0.35, r * 0.45, 0.06, 0.15, lit);
	blobs(18, 0, 0, r * 1.05, 0.03, 0.07, mid);     // loose leaves at the edge
	// A few gaps where the sky shows through.
	ctx.globalCompositeOperation = 'destination-out';
	for (let i = 0, n = 5 + Math.floor(rng() * 3); i < n; i++) {
		const a = rng() * Math.PI * 2, d = (0.3 + rng() * 0.5) * r;
		ctx.beginPath();
		ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.08 + rng() * 0.08), 0, Math.PI * 2);
		ctx.fill();
	}
	return c;
}

/** Bake a tree: tapered bark with a sunlit edge, and one sprite per clump. */
export function renderTreeArt(segs: Seg[], clumps: Clump[], f: Foliage, L: ArtLight, seed: number): TreeArt {
	let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, maxThick = 0, baseY = -Infinity;
	for (const s of segs) {
		x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2);
		y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2);
		maxThick = Math.max(maxThick, s.thick);
		baseY = Math.max(baseY, s.y1);
	}
	const pad = maxThick * 2 + 4;
	const trunk = document.createElement('canvas');
	trunk.width = Math.max(1, Math.ceil(x1 - x0 + pad * 2));
	trunk.height = Math.max(1, Math.ceil(y1 - y0 + pad * 2));
	const ctx = trunk.getContext('2d')!;
	ctx.translate(pad - x0, pad - y0);
	ctx.lineCap = 'round';
	for (const s of segs) {
		const dx = s.x2 - s.x1, dy = s.y2 - s.y1, len = Math.hypot(dx, dy) || 1;
		const nx = -dy / len, ny = dx / len;
		const w0 = s.thick / 2, w1 = (s.thick * 0.7) / 2;
		const col = mix(L.night, barkFor(s.thick, maxThick), L.dl);
		ctx.fillStyle = rgb(col);
		ctx.beginPath();
		ctx.moveTo(s.x1 + nx * w0, s.y1 + ny * w0);
		ctx.lineTo(s.x2 + nx * w1, s.y2 + ny * w1);
		ctx.lineTo(s.x2 - nx * w1, s.y2 - ny * w1);
		ctx.lineTo(s.x1 - nx * w0, s.y1 - ny * w0);
		ctx.closePath();
		ctx.fill();
		ctx.beginPath(); ctx.arc(s.x2, s.y2, w1, 0, Math.PI * 2); ctx.fill();
		// Sunlit edge on limbs thick enough to show one.
		if (s.thick > 2.5 && L.dl > 0.1) {
			const side = Math.sign(nx * L.sunDx) || 1;
			ctx.strokeStyle = rgb(mix(col, L.sunCol, 0.35 * L.dl));
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = Math.max(0.6, s.thick * 0.22);
			ctx.beginPath();
			ctx.moveTo(s.x1 + nx * w0 * 0.6 * side, s.y1 + ny * w0 * 0.6 * side);
			ctx.lineTo(s.x2 + nx * w1 * 0.6 * side, s.y2 + ny * w1 * 0.6 * side);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
	}
	const height = Math.max(1, baseY - y0);
	const sprites = f.amount > 0.02
		? clumps.map((c, i) => ({ x: c.x, y: c.y, img: renderClump(c.r, f, L, seed + i * 7919), sway: Math.max(0, (baseY - c.y) / height) }))
		: [];
	return { trunk, ox: x0 - pad, oy: y0 - pad, sprites };
}

/** Draw a baked tree; `windPx` is the sideways sway at the top of the crown. */
export function drawTreeArt(ctx: CanvasRenderingContext2D, art: TreeArt, windPx: number): void {
	ctx.drawImage(art.trunk, art.ox, art.oy);
	for (const s of art.sprites) {
		ctx.drawImage(s.img, s.x - s.img.width / 2 + windPx * s.sway * s.sway, s.y - s.img.height / 2);
	}
}
