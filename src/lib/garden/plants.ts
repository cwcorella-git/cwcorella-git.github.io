// ── Plant physics + rendering for Garden.svelte ───────────────────────────

export interface PlantSegment {
	restAngle: number;   // degrees offset from parent direction, at rest
	angle:     number;   // current angle (degrees offset from parent direction)
	angVel:    number;   // angular velocity (degrees / second)
	len:       number;
	thick:     number;
	color:     string;
	children:  PlantSegment[];
	wx0: number;  // segment start x (world) — written by drawSeg each frame
	wy0: number;
	wx:  number;  // segment tip x (world)
	wy:  number;
}

export interface PlantInstance {
	x:    number;
	y:    number;
	kind: 'grass' | 'seedhead';
	root: PlantSegment;
}

// ── seeded PRNG (mulberry32) ───────────────────────────────────────────────
function makePRNG(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

// ── palettes ──────────────────────────────────────────────────────────────
const GRASS_PALETTE = ['#6b7c3a', '#7a8c45', '#5a6e2e', '#8a9c50', '#4e6228'];
const SEED_PALETTE  = ['#6e6a3c', '#9a8650', '#ae975e'];   // stem, panicle, spikelet tips: straw a shade darker than the meadow, so they show

/** A hex colour lightened (k > 1) or darkened (k < 1). */
function tone(hex: string, k: number): string {
	const c = [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))));
	return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ── grass tufts ───────────────────────────────────────────────────────────
export function makeGrassTuft(
	x: number, y: number, maxHeight: number, seed: number
): PlantInstance {
	const rng         = makePRNG(seed);
	const strandCount = 6 + Math.floor(rng() * 9); // 6–14 blades
	const strands: PlantSegment[] = [];

	// Each blade: three pieces, bending further the higher it goes, tapering
	// to a point, dark at the base and light at the tip.
	for (let i = 0; i < strandCount; i++) {
		const lean  = (rng() - 0.5) * 56;           // lean ±28°
		const bend  = lean * (0.35 + rng() * 0.3) + (rng() - 0.5) * 14;
		const len   = maxHeight * (0.45 + rng() * 0.55) / 3;
		const color = GRASS_PALETTE[Math.floor(rng() * GRASS_PALETTE.length)];
		const thick = 1.3 + rng() * 1.3;
		const piece = (k: number, rest: number, col: string): PlantSegment => ({
			restAngle: rest, angle: rest, angVel: 0,
			len: len * (1 - k * 0.12), thick: thick * (1 - k * 0.3), color: col,
			children: [], wx0: 0, wy0: 0, wx: 0, wy: 0,
		});
		const a = piece(0, lean, tone(color, 0.82));
		const b = piece(1, bend, color);
		const c = piece(2, bend * 1.3, tone(color, 1.22));
		a.children.push(b); b.children.push(c);
		strands.push(a);
	}

	// Zero-length anchor collects all strands
	const root: PlantSegment = {
		restAngle: 0, angle: 0, angVel: 0,
		len: 0, thick: 0, color: '',
		children: strands,
		wx0: 0, wy0: 0, wx: 0, wy: 0,
	};
	return { x, y, kind: 'grass', root };
}

// ── ferns ─────────────────────────────────────────────────────────────────
/** A dry grass stem (wild rye / needlegrass) with a drooping seed panicle:
 *  a gently curved stem in four pieces, then short spikelets that splay out
 *  and hang from the top two pieces. Same segment tree, so wind and the
 *  mouse act on it like any tuft. */
export function makeSeedHead(
	x: number, y: number, maxHeight: number, seed: number
): PlantInstance {
	const rng = makePRNG(seed);
	const seg = (len: number, thick: number, restAngle: number, color: string): PlantSegment => ({
		restAngle, angle: restAngle, angVel: 0, len, thick, color, children: [],
		wx0: 0, wy0: 0, wx: 0, wy: 0,
	});
	const bend = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 4);     // the whole stem leans one way
	const stemLen = maxHeight * 0.3;
	const pieces: PlantSegment[] = [];
	for (let i = 0; i < 4; i++) {
		pieces.push(seg(stemLen * (1 - i * 0.08), 3.2 - i * 0.45, i === 0 ? (rng() - 0.5) * 10 : bend, SEED_PALETTE[0]));
		if (i > 0) pieces[i - 1].children.push(pieces[i]);
	}
	for (const p of pieces.slice(2)) {
		const n = 7 + Math.floor(rng() * 4);
		for (let k = 0; k < n; k++) {
			const side = k % 2 ? 1 : -1;
			const spike = seg(stemLen * (0.4 + rng() * 0.25), 1.7, side * (12 + rng() * 18), SEED_PALETTE[1]);
			spike.thick = 2.4;
			spike.children.push(seg(stemLen * (0.25 + rng() * 0.15), 1.8, side * (18 + rng() * 18), SEED_PALETTE[2]));   // the tip droops
			p.children.push(spike);
		}
	}
	const root = seg(0, 0, 0, '');
	root.children.push(pieces[0]);
	return { x, y, kind: 'seedhead', root };
}

// ── wind physics (spring-damper) ───────────────────────────────────────────
// K:       spring stiffness (degrees/s² per degree of displacement)
// DAMPING: velocity multiplier per second (0.88 = 12% decay/s)
// Force attenuates by 0.86 per segment depth from root
const SPRING_K = 7.0;
const DAMPING  = 0.88;

function tickSeg(seg: PlantSegment, wind: number, dt: number, depth: number): void {
	if (seg.len > 0) {
		const attenuation = Math.pow(0.86, depth);
		const accel       = SPRING_K * (seg.restAngle - seg.angle) + wind * attenuation;
		seg.angVel        = seg.angVel * Math.pow(DAMPING, dt) + accel * dt;
		seg.angle        += seg.angVel * dt;
		// Clamp to ±65° from rest to prevent wild swings
		seg.angle = Math.max(seg.restAngle - 65, Math.min(seg.restAngle + 65, seg.angle));
	}
	for (const child of seg.children) tickSeg(child, wind, dt, depth + (seg.len > 0 ? 1 : 0));
}

export function tickWind(
	plants: PlantInstance[],
	windForce: number,
	dt: number,
	horizonY: number,
	groundBand: number,
): void {
	for (const plant of plants) {
		// Foreground plants (heavy, large) barely sway — 8% of wind force.
		// Horizon plants (small, light) get full wind. Curve is convex so the
		// reduction is dramatic near the foreground and gentle near midground.
		const depthFrac = groundBand > 0 ? Math.max(0, Math.min(1, (plant.y - horizonY) / groundBand)) : 0;
		const mul = 0.08 + Math.pow(1 - depthFrac, 1.2) * 0.92;
		for (const child of plant.root.children) tickSeg(child, windForce * mul, dt, 0);
	}
}

// ── drawing ───────────────────────────────────────────────────────────────
// parentDir: degrees, -90 = pointing straight up
// Plant colours lit like the ground they stand on and browned by the
// season, memoised per (colour, light, season) step.
type RGB = [number, number, number];
const STRAW = [168, 150, 104];
const lit = new Map<string, string>();
function litColor(hex: string, light: RGB, green: number): string {
	const q = light.map((v) => Math.round(v * 32));
	const gs = Math.round(green * 16);
	const key = hex + q.join(',') + '|' + gs;
	let out = lit.get(key);
	if (!out) {
		const c = [1, 3, 5].map((i, k) => {
			const base = parseInt(hex.slice(i, i + 2), 16) * (gs / 16) + STRAW[k] * (1 - gs / 16);
			return Math.round(Math.min(255, base * (q[k] / 32)));
		});
		out = `rgb(${c[0]},${c[1]},${c[2]})`;
		lit.set(key, out);
	}
	return out;
}

function drawSeg(
	ctx: CanvasRenderingContext2D,
	x: number, y: number,
	parentDir: number,
	seg: PlantSegment,
	light: RGB, green: number,
): void {
	if (seg.len === 0) {
		for (const child of seg.children) drawSeg(ctx, x, y, parentDir, child, light, green);
		return;
	}
	const dir    = parentDir + seg.angle;
	const radDir = dir * Math.PI / 180;
	const ex     = x + Math.cos(radDir) * seg.len;
	const ey     = y + Math.sin(radDir) * seg.len;

	seg.wx0 = x; seg.wy0 = y; seg.wx = ex; seg.wy = ey;

	// A tapered quad: full width at the base, the next piece's width at the
	// tip, a point where nothing follows. Strokes read as sticks.
	const w0 = seg.thick / 2, w1 = seg.children.length ? w0 * 0.7 : 0.15;
	const nx = -Math.sin(radDir), ny = Math.cos(radDir);
	ctx.beginPath();
	ctx.moveTo(x + nx * w0, y + ny * w0);
	ctx.lineTo(ex + nx * w1, ey + ny * w1);
	ctx.lineTo(ex - nx * w1, ey - ny * w1);
	ctx.lineTo(x - nx * w0, y - ny * w0);
	ctx.fillStyle = litColor(seg.color, light, green);
	ctx.fill();

	for (const child of seg.children) drawSeg(ctx, ex, ey, dir, child, light, green);
}

export function drawPlants(
	ctx: CanvasRenderingContext2D,
	plants: PlantInstance[],
	horizonY: number,
	H: number,
	light: RGB = [1, 1, 1],   // multiplier from the ground's light (terrain.ts meadowLight)
	green = 1,                // 1 summer grass … 0 winter straw
): void {
	ctx.save();
	const depthBand = (H - horizonY) * 0.80;
	// Sort back-to-front so near plants correctly overlap far ones within each layer.
	const sorted = [...plants].sort((a, b) => a.y - b.y);
	for (const plant of sorted) {
		// Far plants (near horizon) fade to 0.55 alpha; foreground is fully opaque.
		const t = depthBand > 0 ? Math.max(0, Math.min(1, (plant.y - horizonY) / depthBand)) : 1;
		ctx.globalAlpha = 0.55 + t * 0.45;
		for (const child of plant.root.children) drawSeg(ctx, plant.x, plant.y, -90, child, light, green);
	}
	ctx.globalAlpha = 1;
	ctx.restore();
}

// ── mouse/touch interaction ────────────────────────────────────────────────
function applyForceSeg(seg: PlantSegment, mx: number, my: number, radius: number, forceMul: number): void {
	if (seg.len > 0) {
		const midX = (seg.wx0 + seg.wx) * 0.5;
		const midY = (seg.wy0 + seg.wy) * 0.5;
		const dx   = mx - midX;
		const dy   = my - midY;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < radius && dist > 0) {
			const sdx   = seg.wx - seg.wx0;
			const sdy   = seg.wy - seg.wy0;
			const cross = sdx * dy - sdy * dx;
			const str   = (1 - dist / radius) * 90 * forceMul;
			seg.angVel += (cross > 0 ? -1 : 1) * str;
		}
	}
	for (const child of seg.children) applyForceSeg(child, mx, my, radius, forceMul);
}

export function applyMouseForce(
	plants: PlantInstance[],
	mx: number, my: number,
	horizonY: number,
	groundBand: number,
	radius = 90,
): void {
	for (const plant of plants) {
		const depthFrac = groundBand > 0 ? Math.max(0, Math.min(1, (plant.y - horizonY) / groundBand)) : 0;
		const forceMul = 0.08 + Math.pow(1 - depthFrac, 1.2) * 0.92;
		for (const child of plant.root.children) applyForceSeg(child, mx, my, radius, forceMul);
	}
}
