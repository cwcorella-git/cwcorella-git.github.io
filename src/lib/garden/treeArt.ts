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
export const PINE_FOLIAGE: Foliage    = { mid: [56, 80, 42], amount: 1, needle: true };
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
	return { segs, clumps: clumpsFromTips(segs, h * 0.16, h * 0.01, 1) };
}

/** Jeffrey pine, old growth (photos: Mature Jeffrey Pine; Pinus jeffreyi
 *  LassenCA2; Mono Lake, Wikimedia Commons): a straight trunk clear for its
 *  lower 40%, then a narrow crown, at most about a third as wide as the tree
 *  is tall. Many short limbs, drooping low and rising high, each splitting at
 *  the end into a few twigs; the needles are brush tufts on the twig ends. */
export function pineShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const clumps: Clump[] = [];
	const lean = (rng() - 0.5) * 0.04;
	const at = (t: number) => ({ x: x + Math.sin(lean) * t * h + Math.sin(t * 7 + seed) * h * 0.006, y: y - t * h });
	for (let i = 0; i < 6; i++) {
		const a = at(i / 6), b = at((i + 1) / 6);
		segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, thick: h * 0.05 * (1 - i * 0.14) });
	}
	const clear = 0.28 + rng() * 0.06;
	const limbs = 18 + Math.floor(rng() * 7);
	const flatTop = rng() < 0.5;                               // old trees often flatten at the top
	let side = rng() < 0.5 ? -1 : 1;
	const tuft = (tx: number, ty: number, r: number) => clumps.push({ x: tx, y: ty, r });
	for (let i = 0; i < limbs; i++) {
		const t = clear + (i + rng() * 0.8) / limbs * (0.98 - clear);
		side = rng() < 0.7 ? -side : side;
		const o = at(t);
		const u = (t - clear) / (0.98 - clear);                // 0 bottom of the crown … 1 top
		// Half-width profile: widest a third of the way up, narrowing to a
		// rounded (or flat) top; ragged, some limbs much shorter than others.
		const prof = u < 0.35 ? 0.75 + u * 0.7 : 1 - Math.pow((u - 0.35) / 0.65, flatTop ? 3 : 1.6) * 0.8;
		const width = h * 0.19 * prof * (0.6 + rng() * 0.55);
		const ang = (-0.3 + u * 0.75) + (rng() - 0.5) * 0.25;  // radians above horizontal
		const ex = o.x + side * Math.cos(ang) * width, ey = o.y - Math.sin(ang) * width;
		const thick = h * (0.014 - u * 0.006);
		segs.push({ x1: o.x, y1: o.y, x2: ex, y2: ey, thick });
		const r = h * (0.06 + rng() * 0.03);
		// Twigs fan out at the end, tips turned up; a tuft on each.
		const twigs = 2 + Math.floor(rng() * 3);
		for (let k = 0; k < twigs; k++) {
			const ta = ang + 0.25 + (k / Math.max(1, twigs - 1) - 0.5) * 1.1 + (rng() - 0.5) * 0.3;
			const tl = width * (0.18 + rng() * 0.18);
			const tx = ex + side * Math.cos(ta) * tl, ty = ey - Math.sin(ta) * tl;
			segs.push({ x1: ex, y1: ey, x2: tx, y2: ty, thick: thick * 0.5 });
			tuft(tx, ty, r);
		}
		tuft(ex, ey, r * 1.1);
		if (width > h * 0.08) tuft(o.x + (ex - o.x) * 0.55, o.y + (ey - o.y) * 0.55 - r * 0.3, r * 0.9);   // foliage along the inner limb
	}
	const top = at(1);
	tuft(top.x, top.y + h * 0.03, h * 0.07);
	tuft(top.x + h * 0.04, top.y + h * 0.07, h * 0.06);
	tuft(top.x - h * 0.04, top.y + h * 0.08, h * 0.06);
	return { segs, clumps };
}

/** Western juniper (photos: J. occidentalis australis old tree; on Lassen,
 *  Wikimedia Commons): a thick, short, fibrous red-brown trunk splitting into
 *  two or three twisted leaders that spread wide; the foliage is a few dense
 *  lumpy masses on the upper leaders, with limbs showing between them. */
export function juniperShape(x: number, y: number, h: number, seed: number): { segs: Seg[]; clumps: Clump[] } {
	const rng = makePRNG(seed);
	const segs: Seg[] = [];
	const trunkH = h * (0.3 + rng() * 0.08);
	// The trunk in two pieces with a kink: junipers are rarely straight.
	const kx = x + (rng() - 0.5) * h * 0.06;
	segs.push({ x1: x, y1: y, x2: kx, y2: y - trunkH * 0.5, thick: h * 0.16 });
	segs.push({ x1: kx, y1: y - trunkH * 0.5, x2: kx + (rng() - 0.5) * h * 0.06, y2: y - trunkH, thick: h * 0.13 });
	const bx = segs[1].x2, by = segs[1].y2;
	const lopsided = (rng() - 0.5) * 0.5;
	const stems = 2 + Math.floor(rng() * 2);
	const crown: Seg[] = [];
	for (let i = 0; i < stems; i++) {
		let a = Math.PI / 2 + lopsided + ((i + 0.5) / stems - 0.5) * 0.9 + (rng() - 0.5) * 0.25;
		let px = bx, py = by, thick = h * 0.08;
		const n = 4, len = (h - trunkH) * (0.85 + rng() * 0.25) / n;
		for (let k = 0; k < n; k++) {
			a += (rng() - 0.5) * 0.35 + (Math.PI / 2 - a) * 0.25;   // twist, but keep heading up
			const qx = px + Math.cos(a) * len, qy = py - Math.sin(a) * len;
			const sg = { x1: px, y1: py, x2: qx, y2: qy, thick };
			segs.push(sg);
			if (k >= 1) crown.push(sg);
			if (k > 0) for (const side of [-1, 1]) {
				if (rng() < 0.4) continue;
				const sl = h * (0.08 + rng() * 0.1), sa = (side < 0 ? Math.PI : 0) + (rng() - 0.5) * 0.5 + side * -0.35;
				const sh = { x1: qx, y1: qy, x2: qx + Math.cos(sa) * sl, y2: qy - Math.sin(sa) * sl * 0.5 - sl * 0.15, thick: thick * 0.4 };
				segs.push(sh);
				crown.push(sh);
			}
			px = qx; py = qy; thick *= 0.72;
		}
	}
	// Foliage only on the upper leaders and shoots, in a few big lumps; the
	// trunk and the forks below stay bare.
	const clumps = clumpsFromTips(crown.flatMap((s) => [s, { ...s, x2: (s.x1 + s.x2) / 2, y2: (s.y1 + s.y2) / 2 }]), h * 0.12, Infinity, 1).map((c) => ({ ...c, r: c.r * 1.25 }));
	return { segs, clumps };
}

// ── rendering ─────────────────────────────────────────────────────────────
function barkFor(thick: number, maxThick: number): RGB {
	const t = Math.min(1, thick / Math.max(1, maxThick));
	return mix([125, 112, 98], [61, 49, 40], Math.sqrt(t));
}

// A repeating tile of small leaf marks in three tones, at random, densely
// enough to read as foliage with tiny gaps. Cached per colour set and size.
const tiles = new Map<string, HTMLCanvasElement>();
type Style = 'leaf' | 'scale' | 'needle';
function leafTile(cols: RGB[], ms: number, style: Style, amount: number): HTMLCanvasElement {
	const key = cols.map((c) => c.map((v) => v | 0).join(',')).join('|') + `|${ms.toFixed(1)}|${style}|${amount.toFixed(1)}`;
	let t = tiles.get(key);
	if (t) return t;
	if (tiles.size > 48) tiles.clear();
	const T = 40;
	t = document.createElement('canvas');
	t.width = t.height = T;
	const ctx = t.getContext('2d')!;
	const rng = makePRNG(T * 31 + Math.round(ms * 10));
	const n = Math.round((style === 'needle' ? 0.7 : 1.5) * T * T / (ms * ms) * Math.max(0.25, amount));
	const w = [0.4, 0.42, 0.18];
	ctx.lineCap = 'round';
	ctx.lineWidth = Math.max(0.6, ms * 0.4);
	cols.forEach((col, k) => {
		ctx.fillStyle = ctx.strokeStyle = rgb(col);
		ctx.beginPath();
		for (let i = 0; i < n * w[k]; i++) {
			const x = rng() * T, y = rng() * T, sz = ms * (style === 'scale' ? 0.5 + rng() * 0.4 : 0.7 + rng() * 0.6), a = rng() * Math.PI;
			const m = style === 'needle' ? ms * 4 : 3;
			// Draw wrapped copies near the tile's edges so it repeats seamlessly.
			for (const ox of x < m ? [0, T] : x > T - m ? [0, -T] : [0]) for (const oy of y < m ? [0, T] : y > T - m ? [0, -T] : [0]) {
				const px = x + ox, py = y + oy;
				if (style === 'needle') {
					// Needles: short strokes, mostly upward and splayed.
					const na = -Math.PI / 2 + (rng() - 0.5) * 2, l = ms * (2 + rng() * 2.5);
					ctx.moveTo(px, py);
					ctx.lineTo(px + Math.cos(na) * l, py + Math.sin(na) * l);
					continue;
				}
				if (style === 'scale') { ctx.moveTo(px + sz, py); ctx.arc(px, py, sz, 0, Math.PI * 2); continue; }
				ctx.moveTo(px + Math.cos(a) * sz, py + Math.sin(a) * sz);
				ctx.lineTo(px + Math.cos(a + 2.2) * sz * 0.6, py + Math.sin(a + 2.2) * sz * 0.6);
				ctx.lineTo(px - Math.cos(a) * sz, py - Math.sin(a) * sz);
				ctx.lineTo(px + Math.cos(a - 1.9) * sz * 0.7, py + Math.sin(a - 1.9) * sz * 0.7);
				ctx.closePath();
			}
		}
		if (style === 'needle') ctx.stroke(); else ctx.fill();
	});
	tiles.set(key, t);
	return t;
}

/** The middle-tone colours of a clump (what `renderClump` computes at tone 1). */
function tone1Cols(own: RGB, f: Foliage, L: ArtLight): RGB[] {
	const w = L.warm ?? 0;
	const conifer = f.needle || f.scale;
	const mid0 = mix(L.night, shade(mix(own, L.sunCol, 0.08 + 0.25 * w), (1 - 0.3 * w) * (conifer ? 0.94 : 0.92)), L.dl);
	const dark = hazed(mix(mix(mid0, [18, 26, 30], 0.5), [90, 74, 112], (conifer ? 0.08 : 0.3) * w), L);
	const mid = hazed(mid0, L);
	const lit = hazed(mix(L.night, mix(own, L.sunCol, 0.45 + 0.25 * w), L.dl), L);
	const third = f.scale ? hazed(mix(L.night, mix(own, [176, 170, 84], 0.5), L.dl), L) : conifer ? mix(mid, lit, 0.45) : lit;
	return [dark, mid, third];
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
	const own = mix(f.mid, [112, 124, 64], (f.needle ? rng() : Math.floor(rng() * 2) / 2) * 0.3);   // two hues for leaves, so tiles are shared
	const w = L.warm ?? 0;
	const toneK = (f.needle || f.scale ? [0.82, 0.94, 1.04] : [0.68, 0.92, 1.08])[tone];
	const mid0 = mix(L.night, shade(mix(own, L.sunCol, 0.08 + 0.25 * w), (1 - 0.3 * w) * toneK), L.dl);
	const dark = hazed(mix(mix(mid0, [18, 26, 30], 0.5), [90, 74, 112], (f.needle || f.scale ? 0.08 : 0.3) * w), L);   // evening shade goes purple-grey, as the clouds do
	const mid = hazed(mid0, L);
	const lit = hazed(mix(L.night, mix(own, L.sunCol, 0.45 + 0.25 * w), L.dl), L);
	const litN = [0, 0.6, 1.6][tone];     // how much of the lit layer this side gets

	// Conifers: a quieter split between shaded and sunlit clumps, and the lit
	// colour only as a sprinkle on the upper sun-side edge, never a pale lid.
	// Juniper's lit tops go gold-green (the photos), not just paler.
	const soft = f.scale ? hazed(mix(L.night, mix(own, [176, 170, 84], 0.5), L.dl), L) : mix(mid, lit, 0.45);
	// Broadleaf and scale foliage: one lumpy mass with a noisy edge, filled
	// with a baked tile of small marks (shared per colour set; drawing each
	// leaf per lobe cost ~2 s on a throttled phone), shaded across the lobe,
	// and with single marks only along the edge to break it up. Nested
	// dark/mid/lit blobs gave every clump an outline and a bright core.
	const ph = rng() * 6.28, ph2 = rng() * 6.28, ph3 = rng() * 6.28;
	const spike = f.needle ? 0.08 : 0;
	const edge = (a: number) => 0.78 + 0.13 * Math.sin(2 * a + ph) + 0.09 * Math.sin(5 * a + ph2) + (0.05 + spike) * Math.sin(9 * a + ph3) + spike * Math.sin(17 * a + ph);
	const style: Style = f.needle ? 'needle' : f.scale ? 'scale' : 'leaf';
	const ms = Math.max(1.3, Math.min(2.6, r * 0.045));   // a mark stays a few px whatever the lobe's size
	const third = f.scale || f.needle ? soft : lit;
	// The tile is coloured as the middle tone, so a tree needs two tiles, not
	// six; the crown-level tone goes on afterwards as a wash.
	const t1 = tone1Cols(own, f, L);
	const leaf = (x: number, y: number, sz: number, a: number) => {
		if (f.scale) { ctx.moveTo(x + sz, y); ctx.arc(x, y, sz, 0, Math.PI * 2); return; }
		ctx.moveTo(x + Math.cos(a) * sz, y + Math.sin(a) * sz);
		ctx.lineTo(x + Math.cos(a + 2.2) * sz * 0.6, y + Math.sin(a + 2.2) * sz * 0.6);
		ctx.lineTo(x - Math.cos(a) * sz, y - Math.sin(a) * sz);
		ctx.lineTo(x + Math.cos(a - 1.9) * sz * 0.7, y + Math.sin(a - 1.9) * sz * 0.7);
		ctx.closePath();
	};
	if (f.amount > 0.02) {
		const tile = leafTile(t1, ms, style, f.amount);
		ctx.save();
		ctx.beginPath();
		for (let i = 0; i <= 40; i++) {
			const a = (i / 40) * Math.PI * 2, d = r * edge(a) * 0.9;
			ctx.lineTo(cx + Math.cos(a) * d * 1.12, cy + Math.sin(a) * d * 0.82);
		}
		ctx.closePath();
		const pat = ctx.createPattern(tile, 'repeat')!;
		pat.setTransform(new DOMMatrix().translate(rng() * 64, rng() * 64));
		ctx.fillStyle = pat;
		ctx.fill();
		// Light across the lobe: shade away from the sun and underneath, a
		// lift on the sun-side top. Only over what is already drawn.
		ctx.globalCompositeOperation = 'source-atop';
		const ux = L.sunDx * 0.5, uy = -0.86;
		const g = ctx.createLinearGradient(cx - ux * r, cy - uy * r, cx + ux * r, cy + uy * r);
		g.addColorStop(0, `rgba(${dark.map((v) => v | 0).join(',')},0.55)`);
		g.addColorStop(0.5, `rgba(${dark.map((v) => v | 0).join(',')},0)`);
		g.addColorStop(1, `rgba(${third.map((v) => v | 0).join(',')},${(0.3 * litN * Math.min(1, L.dl * 4)).toFixed(2)})`);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, S, S);
		if (tone !== 1) {
			ctx.fillStyle = tone === 0 ? `rgba(${dark.map((v) => v | 0).join(',')},0.4)` : `rgba(${third.map((v) => v | 0).join(',')},${(0.16 * Math.min(1, L.dl * 4)).toFixed(2)})`;
			ctx.fillRect(0, 0, S, S);
		}
		ctx.restore();
		// Single marks along the edge, coloured by position: a broken outline.
		const buckets: [number, number, number, number][][] = [[], [], []];
		const ne = Math.round(r * 3.5 / ms * f.amount);
		for (let i = 0; i < ne; i++) {
			const a = rng() * Math.PI * 2, d = r * edge(a) * (0.8 + rng() * 0.28);
			const x = cx + Math.cos(a) * d * 1.12, y = cy + Math.sin(a) * d * 0.82;
			const v = ((cy - y) / r) * 0.9 + ((x - cx) * L.sunDx / r) * 0.5 + (rng() - 0.5) * 0.8;
			buckets[v < -0.3 ? 0 : v > 0.4 && L.dl > 0.05 && litN ? 2 : 1].push([x, y, ms * (0.6 + rng() * 0.6), rng() * Math.PI]);
		}
		buckets.forEach((bs, k) => {
			ctx.fillStyle = rgb([dark, mid, third][k]);
			ctx.beginPath();
			if (f.needle) {
				ctx.strokeStyle = ctx.fillStyle;
				ctx.lineWidth = Math.max(0.6, ms * 0.4);
				ctx.lineCap = 'round';
				for (const [x, y, sz] of bs) {
					const na = Math.atan2(y - cy, x - cx) * 0.5 - Math.PI / 4 + (rng() - 0.5) * 0.8;   // up and out
					ctx.moveTo(x, y);
					ctx.lineTo(x + Math.cos(na) * sz * 3.5, y + Math.sin(na) * sz * 3.5);
				}
				ctx.stroke();
			} else {
				for (const [x, y, sz, a] of bs) leaf(x, y, sz, a);
				ctx.fill();
			}
		});
	}
	if (f.scale) {
		if (L.dl > 0.05) {
			ctx.fillStyle = rgb(mix(L.night, [138, 150, 170], L.dl));   // dusty berries
			for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(cx + (rng() - 0.5) * r, cy + (rng() - 0.5) * r * 0.6, r * 0.025, 0, Math.PI * 2); ctx.fill(); }
		}
		return c;
	}
	if (f.needle) return c;
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
		const w0 = s.thick / 2, w1 = (s.thick * 0.86) / 2;   // gentle taper: a steep one stepped where pieces meet
		const bark = f.needle ? mix(barkFor(s.thick, maxThick), [150, 94, 62], 0.35)
			: f.scale ? mix(barkFor(s.thick, maxThick), [118, 80, 60], 0.32)        // juniper: red-brown
			: barkFor(s.thick, maxThick);   // Jeffrey pine: cinnamon plates
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
		// Juniper bark: fibrous strips running along the stem, light and dark.
		if (f.scale && s.thick > 2.5 && L.dl > 0.1) {
			ctx.lineWidth = Math.max(0.5, s.thick * 0.05);
			for (let k = -3; k <= 3; k++) {
				ctx.strokeStyle = rgb(mix(col, k % 2 ? [40, 24, 18] : [190, 150, 120], 0.35));
				const o = k * 0.13 * w0;
				ctx.beginPath();
				ctx.moveTo(s.x1 + nx * o, s.y1 + ny * o);
				ctx.quadraticCurveTo((s.x1 + s.x2) / 2 + nx * o * 1.3, (s.y1 + s.y2) / 2 + ny * o * 1.3, s.x2 + nx * o * 0.7, s.y2 + ny * o * 0.7);
				ctx.stroke();
			}
		}
		// Jeffrey pine bark: dark furrows between cinnamon plates on the trunk.
		if (f.needle && s.thick > 3 && L.dl > 0.1) {
			ctx.strokeStyle = rgb(mix(col, [40, 26, 20], 0.45));
			ctx.lineWidth = Math.max(0.5, s.thick * 0.06);
			ctx.beginPath();
			for (let k = -1; k <= 1; k += 2) {
				const o = k * 0.3 * w0;
				ctx.moveTo(s.x1 + nx * o, s.y1 + ny * o);
				ctx.lineTo(s.x2 + nx * o * 0.7, s.y2 + ny * o * 0.7);
			}
			ctx.stroke();
		}
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
		const b = Math.max(1, Math.round(Math.log(r) / Math.log(1.18)));   // size steps of 18%: few buckets at any scale
		const k = b * 3 + tone;
		const list = pool.get(k) ?? [];
		pool.set(k, list);
		if (list.length < 2) list.push(renderClump(Math.pow(1.18, b), f, L, seed + b * 7919 + tone * 31 + list.length * 104729, tone));
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
