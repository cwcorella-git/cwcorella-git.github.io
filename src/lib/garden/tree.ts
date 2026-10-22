// Tree generation — two approaches:
//   generateFgTree: recursive binary branching — fast, controllable, used for the foreground tree
//   generateBgTree: space colonization — slow but organic, used as background silhouette

const SEG_LEN     = 7;    // px — growth step length (at generation canvas)
const INFLUENCE_R = 90;   // px — attractor influence radius
const KILL_DIST   = 14;   // px — attractor consumed within this distance of a tip
const BG_CACHE_KEY = 'cwc:tree-v3';
const FG_CACHE_KEY = 'cwc:fg-tree-v1';

// ── types ─────────────────────────────────────────────────────────────────
export interface TreeSegment {
	x1f: number; y1f: number;   // start, fractions of W / H
	x2f: number; y2f: number;   // end
	thick: number;
	color: string;
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

// ── spatial hash — grid of node indices keyed by cell ─────────────────────
function buildGrid(xs: number[], ys: number[], cellSize: number): Map<string, number[]> {
	const grid = new Map<string, number[]>();
	for (let i = 0; i < xs.length; i++) {
		const k = `${Math.floor(xs[i] / cellSize)},${Math.floor(ys[i] / cellSize)}`;
		const cell = grid.get(k);
		if (cell) cell.push(i); else grid.set(k, [i]);
	}
	return grid;
}

function nearestNode(
	ax: number, ay: number,
	xs: number[], ys: number[],
	grid: Map<string, number[]>,
	cellSize: number, radius: number,
): number {
	const cx    = Math.floor(ax / cellSize);
	const cy    = Math.floor(ay / cellSize);
	const cells = Math.ceil(radius / cellSize);
	let minD = radius, best = -1;
	for (let dcx = -cells; dcx <= cells; dcx++) {
		for (let dcy = -cells; dcy <= cells; dcy++) {
			const bucket = grid.get(`${cx + dcx},${cy + dcy}`);
			if (!bucket) continue;
			for (const i of bucket) {
				const d = Math.hypot(xs[i] - ax, ys[i] - ay);
				if (d < minD) { minD = d; best = i; }
			}
		}
	}
	return best;
}

// ── background tree: space colonization ───────────────────────────────────
// Used as a background silhouette. Slow to generate (~150ms) so cached in
// localStorage. Base position W*0.28 — caller translates via ctx.translate.
export function generateBgTree(W: number, H: number, horizonY: number, ageFraction = 1.0): TreeSegment[] {
	const rng = makePRNG(0xDEADBEEF);

	const gf    = Math.max(0.05, Math.min(1, ageFraction));
	const baseX = W * 0.28;
	const baseY = horizonY;
	// Trunk height and crown radii all scale linearly with age.
	// sqrt(gf) for thickness so a young trunk isn't a twig.
	const trunkH       = Math.min(horizonY * 0.44, 195) * gf;
	const crownRX      = 162 * gf;
	const crownRY      = 112 * gf;
	const crownOffset  = 80  * gf;  // gap between trunk top and crown centre

	// Crown centre: above trunk, slightly left to look natural
	const crownCX = baseX - 12;
	const crownCY = baseY - trunkH - crownOffset;

	// Attractor/iteration counts — fewer means sparser, less-developed crown
	const numAttractors = Math.max(60, Math.round(900 * gf));
	const maxIter       = Math.max(60, Math.round(600 * gf));

	// Trunk thickness at base and top, sqrt-scaled so young trunks look believable
	const trunkThickBase = Math.max(3,   18 * Math.sqrt(gf));
	const trunkThickTop  = Math.max(1.5,  5 * Math.sqrt(gf));

	// ── trunk nodes ─────────────────────────────────────────
	const nodeX: number[]      = [];
	const nodeY: number[]      = [];
	const nodeParent: number[] = [];
	const nodeDepth: number[]  = [];

	const trunkCount = Math.floor(trunkH / SEG_LEN);
	for (let i = 0; i <= trunkCount; i++) {
		nodeX.push(baseX + (rng() - 0.5) * 1.8);
		nodeY.push(baseY - i * SEG_LEN);
		nodeParent.push(Math.max(0, i - 1));
		nodeDepth.push(i);
	}

	// ── crown attractors ────────────────────────────────────
	const attX:      number[]  = [];
	const attY:      number[]  = [];
	const attActive: boolean[] = [];

	for (let i = 0; i < numAttractors; i++) {
		const angle    = rng() * Math.PI * 2;
		const r        = Math.sqrt(rng()); // uniform in ellipse
		const vertBias = (rng() - 0.35) * 28; // slight upward bias
		attX.push(crownCX + r * Math.cos(angle) * crownRX);
		attY.push(crownCY + r * Math.sin(angle) * crownRY + vertBias);
		attActive.push(true);
	}

	// ── space colonization main loop ─────────────────────────
	for (let iter = 0; iter < maxIter; iter++) {
		// Gather still-active attractor indices
		const active: number[] = [];
		for (let i = 0; i < attActive.length; i++) { if (attActive[i]) active.push(i); }
		if (active.length === 0) break;

		const grid = buildGrid(nodeX, nodeY, INFLUENCE_R);

		// Accumulate pull forces per node
		const fx = new Map<number, number>();
		const fy = new Map<number, number>();

		for (const ai of active) {
			const ni = nearestNode(attX[ai], attY[ai], nodeX, nodeY, grid, INFLUENCE_R, INFLUENCE_R);
			if (ni < 0) continue;
			const d = Math.hypot(nodeX[ni] - attX[ai], nodeY[ni] - attY[ai]);
			if (d === 0) continue;
			fx.set(ni, (fx.get(ni) ?? 0) + (attX[ai] - nodeX[ni]) / d);
			fy.set(ni, (fy.get(ni) ?? 0) + (attY[ai] - nodeY[ni]) / d);
		}

		if (fx.size === 0) break;

		const newStart = nodeX.length;

		// Grow one new node per influenced existing node
		for (const [ni] of fx) {
			const len = Math.hypot(fx.get(ni)!, fy.get(ni)!);
			if (len === 0) continue;
			const nx = fx.get(ni)! / len;
			const ny = fy.get(ni)! / len;
			// Small jitter for organic shape
			const jit = SEG_LEN * 0.07;
			nodeX.push(nodeX[ni] + nx * SEG_LEN + (rng() - 0.5) * jit);
			nodeY.push(nodeY[ni] + ny * SEG_LEN + (rng() - 0.5) * jit);
			nodeParent.push(ni);
			nodeDepth.push(nodeDepth[ni] + 1);
		}

		// Consume attractors close to any newly grown node
		const newEnd = nodeX.length;
		for (const ai of active) {
			if (!attActive[ai]) continue;
			for (let ni = newStart; ni < newEnd; ni++) {
				if (Math.hypot(nodeX[ni] - attX[ai], nodeY[ni] - attY[ai]) < KILL_DIST) {
					attActive[ai] = false;
					break;
				}
			}
		}
	}

	// ── build segment list ───────────────────────────────────
	const segments: TreeSegment[] = [];
	for (let i = 1; i < nodeX.length; i++) {
		const pi         = nodeParent[i];
		const depth      = nodeDepth[i];
		const isTrunk    = i <= trunkCount;

		let thick: number;
		if (isTrunk) {
			// Trunk tapers from base to crown entry; both ends scaled by sqrt(gf)
			thick = Math.max(trunkThickTop, trunkThickBase - (i / trunkCount) * (trunkThickBase - trunkThickTop));
		} else {
			// Crown branches thin with depth; starter thickness scaled by gf
			const crownDepth = depth - trunkCount;
			thick = Math.max(0.5, 5.2 * gf * Math.pow(0.80, crownDepth * 0.14));
		}

		const color = thick > 8  ? '#4A2C17'
		            : thick > 3.5 ? '#6B4423'
		            : thick > 1.5 ? '#8B5E3C'
		            :                '#9B7050';

		segments.push({
			x1f: nodeX[pi] / W,  y1f: nodeY[pi] / H,
			x2f: nodeX[i]  / W,  y2f: nodeY[i]  / H,
			thick,
			color,
		});
	}

	return segments;
}

// ── localStorage cache ────────────────────────────────────────────────────
// gf is quantized to 2 decimal places — cache only invalidates when growth
// changes by ≥0.005, which at the current growth rate takes ~250 real days.
function quantizeGF(gf: number): number { return Math.round(gf * 100) / 100; }

export function loadBgTreeFromCache(W: number, H: number, gf: number): TreeSegment[] | null {
	try {
		const raw = localStorage.getItem(BG_CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as { version: number; W: number; H: number; gf: number; segments: TreeSegment[] };
		if (cached.version !== 3) return null;
		if (Math.abs(cached.W - W) > 4 || Math.abs(cached.H - H) > 4) return null;
		if (Math.abs(cached.gf - quantizeGF(gf)) > 0.005) return null;
		return cached.segments;
	} catch {
		return null;
	}
}

export function saveBgTreeToCache(segments: TreeSegment[], W: number, H: number, gf: number): void {
	try {
		localStorage.setItem(BG_CACHE_KEY, JSON.stringify({ version: 3, W, H, gf: quantizeGF(gf), segments }));
	} catch {}
}

// ── foreground tree: recursive binary branching ───────────────────────────
// Fast (~1ms), fully controllable, supports scaffold branches and growth age.
// Same base position as generateBgTree (W*0.28) so the lean transform works.
export function generateFgTree(W: number, H: number, horizonY: number, ageFraction = 1.0): TreeSegment[] {
	const rng = makePRNG(0xDEADBEEF);
	const gf  = Math.max(0.05, Math.min(1, ageFraction));
	const segments: TreeSegment[] = [];

	const bx      = W * 0.28;
	const by      = horizonY;
	const trunkH  = Math.min(horizonY * 0.44, 195) * gf;
	const thkBase = Math.max(3, 18 * Math.sqrt(gf));
	const thkTop  = Math.max(1.5, 5 * Math.sqrt(gf));

	function barkColor(thick: number): string {
		return thick > 8   ? '#4A2C17'
		     : thick > 3.5 ? '#6B4423'
		     : thick > 1.5 ? '#8B5E3C'
		     :                '#9B7050';
	}

	// Recursive crown — s0/sR: spread base+range; r0/rR: length-ratio base+range
	function addBranch(
		x: number, y: number,
		angle: number, length: number, thick: number,
		depth: number,
		s0 = 0.50, sR = 0.24, r0 = 0.67, rR = 0.08
	): void {
		if (depth <= 0 || length < 2.5) return;
		const x2 = x + Math.cos(angle) * length;
		const y2 = y - Math.sin(angle) * length;
		segments.push({ x1f: x/W, y1f: y/H, x2f: x2/W, y2f: y2/H, thick, color: barkColor(thick) });
		const ratio  = r0 + rng() * rR;
		const spread = s0 + rng() * sR;
		const bias   = (rng() - 0.5) * 0.22;
		addBranch(x2, y2, angle + spread + bias, length * ratio,        thick * 0.62, depth - 1, s0, sR, r0, rR);
		addBranch(x2, y2, angle - spread + bias, length * ratio * 0.94, thick * 0.60, depth - 1, s0, sR, r0, rR);
		if (depth >= 5 && rng() < 0.28)
			addBranch(x2, y2, angle + bias * 0.3, length * ratio * 0.72, thick * 0.50, depth - 2, s0, sR, r0, rR);
	}

	// Trunk: segmented with organic x-jitter
	const steps = Math.max(5, Math.floor(trunkH / 7));
	let tx = bx;
	for (let i = 0; i < steps; i++) {
		const t1  = i / steps;
		const t2  = (i + 1) / steps;
		const x1  = tx + (rng() - 0.5) * 2;
		const x2  = tx + (rng() - 0.5) * 2;
		const y1  = by - t1 * trunkH;
		const y2  = by - t2 * trunkH;
		const thk = Math.max(thkTop, thkBase - t1 * (thkBase - thkTop));
		segments.push({ x1f: x1/W, y1f: y1/H, x2f: x2/W, y2f: y2/H, thick: thk, color: barkColor(thk) });
		tx = x2;
	}
	const topX = tx;
	const topY = by - trunkH;

	// Scaffold branches at 3 heights — open-grown trees retain lower limbs
	if (gf >= 0.3) {
		const scaffolds = [
			{ t: 0.35, depth: 8, dir:  1 },
			{ t: 0.52, depth: 8, dir: -1 },
			{ t: 0.67, depth: 7, dir:  1 },
		];
		for (const s of scaffolds) {
			const sx  = bx + (rng() - 0.5) * 4;
			const sy  = by - s.t * trunkH;
			const thk = Math.max(1.5, thkTop * (1.3 - s.t * 0.4));
			const len = trunkH * (0.34 + rng() * 0.12) * gf;
			addBranch(sx, sy, Math.PI / 2 + s.dir * (0.44 + rng() * 0.20), len, thk, s.depth);
			if (rng() < 0.65)
				addBranch(sx, sy, Math.PI / 2 - s.dir * (0.38 + rng() * 0.18), len * 0.60, thk * 0.72, s.depth - 1);
		}
	}

	// Main crown from trunk top
	addBranch(topX, topY, Math.PI / 2, trunkH * 0.44 * gf, thkTop * 0.9, 10);

	return segments;
}

export function loadFgTreeFromCache(W: number, H: number, gf: number): TreeSegment[] | null {
	try {
		const raw = localStorage.getItem(FG_CACHE_KEY);
		if (!raw) return null;
		const c = JSON.parse(raw) as { version: number; W: number; H: number; gf: number; segments: TreeSegment[] };
		if (c.version !== 1) return null;
		if (Math.abs(c.W - W) > 4 || Math.abs(c.H - H) > 4) return null;
		if (Math.abs(c.gf - quantizeGF(gf)) > 0.005) return null;
		return c.segments;
	} catch { return null; }
}

export function saveFgTreeToCache(segments: TreeSegment[], W: number, H: number, gf: number): void {
	try { localStorage.setItem(FG_CACHE_KEY, JSON.stringify({ version: 1, W, H, gf: quantizeGF(gf), segments })); } catch {}
}

export function clearFgTreeCache(): void {
	try { localStorage.removeItem(FG_CACHE_KEY); } catch {}
}

// ── leaves ─────────────────────────────────────────────────────────────────
// Draws foliage blobs at the tips of fine twigs (thick ≤ 1.8).
// Overlapping semi-transparent circles build a pointillist foliage cloud.
export function drawLeaves(
	ctx: CanvasRenderingContext2D,
	segments: TreeSegment[],
	W: number, H: number,
	leafColor: string,
	alpha: number,
): void {
	if (alpha < 0.01) return;
	ctx.save();
	ctx.fillStyle = leafColor;
	let n = 0;
	for (const seg of segments) {
		if (seg.thick > 1.8) continue;
		n++;
		if (n % 3 !== 0) continue;  // every 3rd twig — balances density vs perf
		ctx.globalAlpha = alpha * (0.22 + (n % 7) * 0.04);
		ctx.beginPath();
		ctx.arc(seg.x2f * W, seg.y2f * H, 7 + (n % 5) * 0.8, 0, Math.PI * 2);
		ctx.fill();
	}
	ctx.restore();
}

// ── draw ──────────────────────────────────────────────────────────────────
// Segments are drawn individually to allow per-segment lineWidth.
// Since the tree is static (no wind physics yet), this is called each frame
// but the data never changes — the bottleneck is canvas state changes, not JS.
export function drawTree(
	ctx: CanvasRenderingContext2D,
	segments: TreeSegment[],
	W: number, H: number,
): void {
	ctx.save();
	ctx.lineCap  = 'round';
	ctx.lineJoin = 'round';
	for (const seg of segments) {
		ctx.beginPath();
		ctx.moveTo(seg.x1f * W, seg.y1f * H);
		ctx.lineTo(seg.x2f * W, seg.y2f * H);
		ctx.lineWidth   = seg.thick;
		ctx.strokeStyle = seg.color;
		ctx.stroke();
	}

	// Root flare — covers the round lineCap at the trunk base and splays into
	// the ground so the trunk looks planted rather than floating.
	// segments[0] is always the first trunk step; its start point is the base.
	if (segments.length > 0) {
		const base = segments[0];
		const bx   = base.x1f * W;
		const by   = base.y1f * H;
		const hw   = base.thick / 2;   // half trunk width at the base (~9px)

		ctx.fillStyle = '#4A2C17';
		ctx.beginPath();
		// Top edge sits just above the round cap so there's no visible gap
		ctx.moveTo(bx - hw,       by - hw * 0.5);
		ctx.lineTo(bx + hw,       by - hw * 0.5);
		// Splay out ~90% wider as it descends into the ground
		ctx.lineTo(bx + hw * 1.9, by + hw * 1.4);
		ctx.lineTo(bx - hw * 1.9, by + hw * 1.4);
		ctx.closePath();
		ctx.fill();
	}

	ctx.restore();
}
