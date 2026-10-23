// Tree rendering for the garden (2026-10-22): tapered bark with a sunlit edge,
// foliage as clumped masses rather than dots, three local species, and the
// seasons. A tree is built once into an offscreen trunk plus one sprite per
// leaf clump; each frame only blits them, nudging the clumps with the wind.

export type RGB = [number, number, number];

export interface Seg { x1: number; y1: number; x2: number; y2: number; thick: number }
export interface Clump { x: number; y: number; r: number }
export interface Foliage { mid: RGB; amount: number; needle?: boolean; scale?: boolean }   // amount: 0 bare → 1 full leaf; needle: tufts; scale: juniper stipple

export interface ArtLight {
	sunDx: number;   // -1 sun to the left, +1 to the right
	sunCol: RGB;
	dl: number;      // daylight 0–1
	night: RGB;      // silhouette colour after dark
	warm?: number;   // 0–1 golden hour: low side light, crown mostly in warm shade
	haze?: RGB;      // the horizon's colour; far trees fade toward it
	hazeK?: number;  // 0 near … how far toward it
}

const hazed = (c: RGB, L: ArtLight): RGB => L.haze && L.hazeK ? mix(c, L.haze, L.hazeK) : c;

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
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
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
export const JUNIPER_FOLIAGE: Foliage = { mid: [60, 78, 52], amount: 1, scale: true };   // dark olive, not blue

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
	const clear = 0.26 + rng() * 0.05;
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
		clumps.push({ x: o.x + (ex - o.x) * 0.55, y: o.y + (ey - o.y) * 0.55 - h * 0.01, r: h * (0.065 + rng() * 0.03) });
		clumps.push({ x: o.x + (ex - o.x) * 0.25, y: o.y + (ey - o.y) * 0.25 - h * 0.01, r: h * (0.05 + rng() * 0.02) });   // foliage runs back to the trunk
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

/** Western juniper: a short trunk splitting low into 2–4 twisting stems, an
 *  asymmetric crown wider than tall in flattish lumpy tiers. */
export function juniperShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const trunkH = h * (0.12 + rng() * 0.08);
	segs.push({ x1: x, y1: y, x2: x + (rng() - 0.5) * h * 0.05, y2: y - trunkH, thick: h * 0.1 });
	const bx = segs[0].x2, by = segs[0].y2;
	const lopsided = (rng() - 0.5) * 0.5;                        // the whole crown leans one way
	const stems = 2 + Math.floor(rng() * 3);
	for (let i = 0; i < stems; i++) {
		let a = Math.PI / 2 + lopsided + ((i + 0.5) / stems - 0.5) * 1.3 + (rng() - 0.5) * 0.25;
		let px = bx, py = by, thick = h * 0.07;
		const n = 4, len = (h - trunkH) * (0.75 + rng() * 0.3) / n;
		for (let k = 0; k < n; k++) {
			a += (rng() - 0.5) * 0.5;                              // twist
			const qx = px + Math.cos(a) * len, qy = py - Math.sin(a) * len;
			segs.push({ x1: px, y1: py, x2: qx, y2: qy, thick });
			// Side shoots: short, near horizontal, the tiers.
			if (k > 0) for (const side of [-1, 1]) {
				if (rng() < 0.35) continue;
				const sl = h * (0.12 + rng() * 0.16), sa = (side < 0 ? Math.PI : 0) + (rng() - 0.5) * 0.4;
				segs.push({ x1: qx, y1: qy, x2: qx + Math.cos(sa) * sl, y2: qy - Math.sin(sa) * sl * 0.4, thick: thick * 0.35 });
			}
			px = qx; py = qy; thick *= 0.75;
		}
	}
	// Foliage along everything above the trunk, on a fine grid: a dense, lumpy mass.
	const clumps = clumpsFromTips(segs.slice(1).flatMap((s) => [s, { ...s, x2: (s.x1 + s.x2) / 2, y2: (s.y1 + s.y2) / 2 }]), h * 0.1, Infinity, 1)
		.map((c) => ({ ...c, r: c.r * 1.35 }));            // overlapping, so the clumps run together into one mass
	return { segs, clumps };
}

// ── rendering ─────────────────────────────────────────────────────────────
function barkFor(thick: number, maxThick: number): RGB {
	const t = Math.min(1, thick / Math.max(1, maxThick));
	return mix([125, 112, 98], [61, 49, 40], Math.sqrt(t));
}

// tone: where the clump sits in the whole crown. 0 the shaded side and
// underside, 1 between, 2 facing the sun. A crown lit only clump by clump
// reads as a pile of identical balls.
function renderClump(r: number, f: Foliage, L: ArtLight, seed: number, tone = 1): HTMLCanvasElement {
	const rng = makePRNG(seed);
	const S = Math.ceil(r * 2.8);
	const c = document.createElement('canvas');
	c.width = c.height = S;
	const ctx = c.getContext('2d')!;
	const cx = S / 2, cy = S / 2;
	// Each clump drifts a little in hue, so a crown is never one flat colour.
	const own = mix(f.mid, [112, 124, 64], rng() * 0.3);
	const w = L.warm ?? 0;
	const toneK = (f.needle || f.scale ? [0.82, 0.94, 1.04] : [0.68, 0.92, 1.08])[tone];
	const mid0 = mix(L.night, shade(mix(own, L.sunCol, 0.08 + 0.25 * w), (1 - 0.3 * w) * toneK), L.dl);
	const dark = hazed(mix(mix(mid0, [18, 26, 30], 0.5), [90, 74, 112], (f.needle || f.scale ? 0.08 : 0.3) * w), L);   // evening shade goes purple-grey, as the clouds do
	const mid = hazed(mid0, L);
	const lit = hazed(mix(L.night, mix(own, L.sunCol, 0.45 + 0.25 * w), L.dl), L);
	const litN = [0, 0.6, 1.6][tone];     // how much of the lit layer this side gets
	const blobs = (n: number, ox: number, oy: number, spread: number, r0: number, r1: number, col: RGB) => {
		ctx.fillStyle = rgb(col);
		for (let i = 0; i < Math.round(n * f.amount); i++) {
			const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * spread;
			ctx.beginPath();
			ctx.arc(cx + ox + Math.cos(a) * d * 1.15, cy + oy + Math.sin(a) * d * 0.6, r * (r0 + rng() * (r1 - r0)), 0, Math.PI * 2);   // wider than tall
			ctx.fill();
		}
	};
	// Conifers: a quieter split between shaded and sunlit clumps, and the lit
	// colour only as a sprinkle on the upper sun-side edge, never a pale lid.
	const soft = mix(mid, lit, 0.45);
	if (f.scale) {
		// Western juniper: one dense, fine-textured mass with a ragged edge,
		// dark olive, the texture coming from many small overlapping scales.
		const ph = rng() * 6.28, ph2 = rng() * 6.28;
		const edge = (a: number) => r * (0.72 + 0.16 * Math.sin(3 * a + ph) + 0.1 * Math.sin(5 * a + ph2));
		const speck = (n: number, col: RGB, oy: number, reach: number, s0: number, s1: number, bias = 0) => {
			ctx.fillStyle = rgb(col);
			for (let i = 0; i < n; i++) {
				const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * edge(a) * reach;
				const x = cx + Math.cos(a) * d * 1.15, y = cy + oy + Math.sin(a) * d * 0.85;
				if (bias && (x - cx) * L.sunDx + (cy - y) < 0) continue;
				ctx.beginPath();
				ctx.arc(x, y, r * (s0 + rng() * (s1 - s0)), 0, Math.PI * 2);
				ctx.fill();
			}
		};
		speck(150, dark, r * 0.06, 1, 0.05, 0.11);
		speck(130, mid, -r * 0.04, 0.85, 0.04, 0.09);
		if (L.dl > 0.05 && litN) speck(Math.round(60 * litN), soft, -r * 0.1, 0.8, 0.025, 0.05, 1);
		speck(40, dark, r * 0.1, 0.9, 0.02, 0.04);           // fine dark texture back over the mass
		if (L.dl > 0.05) speck(3, mix(L.night, [138, 150, 170], L.dl), 0, 0.7, 0.02, 0.03);   // dusty berries
		return c;
	}
	if (f.needle) {
		// Jeffrey pine: needles in brushy clusters at the twig ends, fanning up
		// and out. A clump is several such clusters run together along the
		// limb, so its outline is tufted and irregular, not a saucer.
		ctx.lineCap = 'round';
		const n = 6 + Math.floor(rng() * 4);
		const subs: { x: number; y: number; s: number }[] = [];
		for (let i = 0; i < n; i++) {
			const a = rng() * Math.PI * 2, d = Math.sqrt(rng());
			subs.push({ x: cx + Math.cos(a) * d * r * 0.75, y: cy + Math.sin(a) * d * r * 0.32, s: 0.7 + rng() * 0.5 });
		}
		subs.sort((p, q) => q.y - p.y);                  // lower ones first, upper ones over them
		const fan = (sx: number, sy: number, k: number, col: RGB, count: number, spread: number) => {
			ctx.strokeStyle = rgb(col);
			ctx.lineWidth = Math.max(0.7, r * 0.045);
			ctx.beginPath();
			for (let i = 0; i < count; i++) {
				const ra = -Math.PI / 2 + (rng() - 0.5) * spread, l = r * k * (0.16 + rng() * 0.2);
				const ox = (rng() - 0.5) * r * 0.08 * k;
				ctx.moveTo(sx + ox, sy);
				ctx.lineTo(sx + ox + Math.cos(ra) * l, sy + Math.sin(ra) * l * 0.9);
			}
			ctx.stroke();
		};
		for (const u of subs) {
			const low = (u.y - cy) / (r * 0.32);              // -1 top … 1 bottom
			fan(u.x, u.y + r * 0.06, u.s, low > 0 ? dark : mix(dark, mid, 0.5), 22, 3.6);   // the shaded underside droops
			fan(u.x, u.y, u.s, mid, 18, 2.6);
			if (L.dl > 0.05 && litN && low < 0.2 && (u.x - cx) * L.sunDx > -r * 0.2) fan(u.x, u.y - r * 0.04, u.s * 0.8, soft, Math.round(6 * litN), 1.8);
		}
		return c;
	}
	// Many small blobs rather than a few big ones: big circles read as popcorn.
	blobs(34, -L.sunDx * r * 0.1, r * 0.18, r * 0.85, 0.12, 0.26, dark);
	blobs(40, 0, -r * 0.05, r * 0.75, 0.1, 0.22, mid);
	if (L.dl > 0.05 && litN) blobs(Math.round(24 * litN), L.sunDx * r * 0.3, -r * 0.35, r * (0.45 + tone * 0.12), 0.06, 0.15, lit);
	blobs(30, 0, 0, r * 1.15, 0.025, 0.06, mid);     // loose leaves: a broken edge, not a ball's outline
	// A few gaps where the sky shows through.
	ctx.globalCompositeOperation = 'destination-out';
	for (let i = 0, n = 8 + Math.floor(rng() * 4); i < n; i++) {
		const a = rng() * Math.PI * 2, d = (0.35 + rng() * 0.55) * r;
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
		const bark = f.needle ? mix(barkFor(s.thick, maxThick), [150, 94, 62], 0.35) : barkFor(s.thick, maxThick);   // Jeffrey pine: cinnamon plates
		const col = hazed(mix(L.night, shade(mix(bark, L.sunCol, 0.15 * (L.warm ?? 0)), 1 - 0.3 * (L.warm ?? 0)), L.dl), L);
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
	// Clumps share sprites: a few variants per 3 px size bucket, picked by
	// index. A crown of 75 unique clumps cost ~70 ms on a throttled phone.
	const pool = new Map<number, HTMLCanvasElement[]>();
	const spriteFor = (r: number, i: number, tone: number) => {
		const b = Math.max(1, Math.round(r / 3));
		const k = b * 3 + tone;
		const list = pool.get(k) ?? [];
		pool.set(k, list);
		if (list.length < 3) list.push(renderClump(b * 3, f, L, seed + b * 7919 + tone * 31 + list.length * 104729, tone));
		return list[i % list.length];
	};
	// Light over the whole crown: from its centre, toward the sun and up is
	// lit, away and under is shade. Shaded clumps draw first, so the lit ones
	// sit on top of them.
	let cx = 0, cy = 0, cr = 1;
	for (const c of clumps) { cx += c.x; cy += c.y; }
	cx /= clumps.length || 1; cy /= clumps.length || 1;
	for (const c of clumps) cr = Math.max(cr, Math.hypot(c.x - cx, c.y - cy));
	const toneOf = (c: Clump) => {
		const v = (L.sunDx * (c.x - cx) * 0.8 - (c.y - cy)) / cr;
		return v > 0.25 ? 2 : v < -0.2 ? 0 : 1;
	};
	const sprites = f.amount > 0.02
		? clumps.map((c, i) => ({ c, i, t: toneOf(c) })).sort((a, b) => a.t - b.t)
			.map(({ c, i, t }) => ({ x: c.x, y: c.y, img: spriteFor(c.r, i, t), sway: Math.max(0, (baseY - c.y) / height) }))
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
