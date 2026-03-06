// Space Colonization Tree
// Generates an organic, mature oak-like branch structure by growing segment
// tips toward scattered crown attractors. Run once on first load; result
// stored in localStorage as normalised (0–1) coordinates so it scales to
// any viewport size without regeneration.

const SEG_LEN        = 7;    // px — growth step length (at generation canvas)
const INFLUENCE_R    = 90;   // px — attractor influence radius
const KILL_DIST      = 14;   // px — attractor consumed within this distance of a tip
const NUM_ATTRACTORS = 900;
const MAX_ITER       = 600;
const CACHE_KEY      = 'cwc:tree-v2';

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

// ── generation ────────────────────────────────────────────────────────────
// W, H, horizonY are the canvas dimensions at generation time. Positions are
// normalised to [0,1] fractions so they scale to any viewport on draw.
export function generateTree(W: number, H: number, horizonY: number): TreeSegment[] {
	const rng = makePRNG(0xDEADBEEF);

	const baseX   = W * 0.28;
	const baseY   = horizonY;
	const trunkH  = Math.min(horizonY * 0.44, 195);

	// Crown centre: above trunk, slightly left to look natural
	const crownCX = baseX - 12;
	const crownCY = baseY - trunkH - 80;
	const crownRX = 162;   // horizontal radius — wide spreading oak shape
	const crownRY = 112;   // vertical radius

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

	for (let i = 0; i < NUM_ATTRACTORS; i++) {
		const angle     = rng() * Math.PI * 2;
		const r         = Math.sqrt(rng()); // uniform in ellipse
		const vertBias  = (rng() - 0.35) * 28; // slight upward bias
		attX.push(crownCX + r * Math.cos(angle) * crownRX);
		attY.push(crownCY + r * Math.sin(angle) * crownRY + vertBias);
		attActive.push(true);
	}

	// ── space colonization main loop ─────────────────────────
	for (let iter = 0; iter < MAX_ITER; iter++) {
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
			// Trunk tapers from 18px at base to 5px at crown entry
			thick = Math.max(5, 18 - (i / trunkCount) * 13);
		} else {
			// Crown branches thin with depth from trunk top
			const crownDepth = depth - trunkCount;
			thick = Math.max(0.5, 5.2 * Math.pow(0.80, crownDepth * 0.14));
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
export function loadTreeFromCache(W: number, H: number): TreeSegment[] | null {
	try {
		const raw = localStorage.getItem(CACHE_KEY);
		if (!raw) return null;
		const cached = JSON.parse(raw) as { version: number; W: number; H: number; segments: TreeSegment[] };
		if (cached.version !== 2) return null;
		// Invalidate if viewport changed by more than 4px in either dimension
		if (Math.abs(cached.W - W) > 4 || Math.abs(cached.H - H) > 4) return null;
		return cached.segments;
	} catch {
		return null;
	}
}

export function saveTreeToCache(segments: TreeSegment[], W: number, H: number): void {
	try {
		localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 2, W, H, segments }));
	} catch {
		// localStorage full or unavailable — silently skip
	}
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
	ctx.restore();
}
