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
	kind: 'grass' | 'fern';
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
const FERN_PALETTE  = ['#3d5c2a', '#4a6e30', '#526838', '#3a5225'];

// ── grass tufts ───────────────────────────────────────────────────────────
export function makeGrassTuft(
	x: number, y: number, maxHeight: number, seed: number
): PlantInstance {
	const rng         = makePRNG(seed);
	const strandCount = 3 + Math.floor(rng() * 4); // 3–6 strands
	const strands: PlantSegment[] = [];

	for (let i = 0; i < strandCount; i++) {
		const lean  = (rng() - 0.5) * 50;           // lean ±25°
		const h1    = maxHeight * (0.40 + rng() * 0.35);
		const h2    = maxHeight * (0.28 + rng() * 0.35);
		const color = GRASS_PALETTE[Math.floor(rng() * GRASS_PALETTE.length)];
		const thick = 1.2 + rng() * 1.2;

		const tip: PlantSegment = {
			restAngle: lean * 0.55 + (rng() - 0.5) * 18,
			angle:     lean * 0.55,
			angVel:    0,
			len:       h2,
			thick:     thick * 0.48,
			color,
			children: [],
			wx0: 0, wy0: 0, wx: 0, wy: 0,
		};

		strands.push({
			restAngle: lean,
			angle:     lean,
			angVel:    0,
			len:       h1,
			thick,
			color,
			children: [tip],
			wx0: 0, wy0: 0, wx: 0, wy: 0,
		});
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
export function makeFern(
	x: number, y: number, maxHeight: number, seed: number
): PlantInstance {
	const rng = makePRNG(seed);

	function makeNode(depth: number, len: number, thick: number, restAngle: number): PlantSegment {
		const color = FERN_PALETTE[Math.min(3 - Math.min(depth, 3), FERN_PALETTE.length - 1)];
		const seg: PlantSegment = {
			restAngle,
			angle:  restAngle,
			angVel: 0,
			len,
			thick,
			color,
			children: [],
			wx0: 0, wy0: 0, wx: 0, wy: 0,
		};

		if (depth > 0) {
			// Continuation — slight random upward curve
			seg.children.push(makeNode(
				depth - 1,
				len * 0.72,
				thick * 0.65,
				(rng() - 0.5) * 12,
			));

			// Alternating side fronds (only when there's enough depth)
			if (depth >= 2) {
				const frondLen   = len * 0.44;
				const frondThick = thick * 0.44;
				seg.children.push(makeNode(depth - 2, frondLen, frondThick, -55 + (rng() - 0.5) * 18));
				seg.children.push(makeNode(depth - 2, frondLen, frondThick,  55 + (rng() - 0.5) * 18));
			}
		}

		return seg;
	}

	const root: PlantSegment = {
		restAngle: 0, angle: 0, angVel: 0,
		len: 0, thick: 0, color: '',
		children: [makeNode(4, maxHeight * 0.55, 2.4, 0)],
		wx0: 0, wy0: 0, wx: 0, wy: 0,
	};
	return { x, y, kind: 'fern', root };
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

export function tickWind(plants: PlantInstance[], windForce: number, dt: number): void {
	for (const plant of plants) {
		for (const child of plant.root.children) tickSeg(child, windForce, dt, 0);
	}
}

// ── drawing ───────────────────────────────────────────────────────────────
// parentDir: degrees, -90 = pointing straight up
function drawSeg(
	ctx: CanvasRenderingContext2D,
	x: number, y: number,
	parentDir: number,
	seg: PlantSegment,
): void {
	if (seg.len === 0) {
		for (const child of seg.children) drawSeg(ctx, x, y, parentDir, child);
		return;
	}
	const dir    = parentDir + seg.angle;
	const radDir = dir * Math.PI / 180;
	const ex     = x + Math.cos(radDir) * seg.len;
	const ey     = y + Math.sin(radDir) * seg.len;

	seg.wx0 = x; seg.wy0 = y; seg.wx = ex; seg.wy = ey;

	ctx.beginPath();
	ctx.moveTo(x, y);
	ctx.lineTo(ex, ey);
	ctx.strokeStyle = seg.color;
	ctx.lineWidth   = seg.thick;
	ctx.lineCap     = 'round';
	ctx.stroke();

	for (const child of seg.children) drawSeg(ctx, ex, ey, dir, child);
}

export function drawPlants(ctx: CanvasRenderingContext2D, plants: PlantInstance[]): void {
	ctx.save();
	for (const plant of plants) {
		for (const child of plant.root.children) drawSeg(ctx, plant.x, plant.y, -90, child);
	}
	ctx.restore();
}

// ── mouse/touch interaction ────────────────────────────────────────────────
function applyForceSeg(seg: PlantSegment, mx: number, my: number, radius: number): void {
	if (seg.len > 0) {
		const midX = (seg.wx0 + seg.wx) * 0.5;
		const midY = (seg.wy0 + seg.wy) * 0.5;
		const dx   = mx - midX;
		const dy   = my - midY;
		const dist = Math.sqrt(dx * dx + dy * dy);
		if (dist < radius && dist > 0) {
			// 2D cross product: segment dir × cursor-to-mid vector → sign = which side
			const sdx   = seg.wx - seg.wx0;
			const sdy   = seg.wy - seg.wy0;
			const cross = sdx * dy - sdy * dx;
			const str   = (1 - dist / radius) * 90;
			seg.angVel += (cross > 0 ? -1 : 1) * str;
		}
	}
	for (const child of seg.children) applyForceSeg(child, mx, my, radius);
}

export function applyMouseForce(plants: PlantInstance[], mx: number, my: number, radius = 90): void {
	for (const plant of plants) {
		for (const child of plant.root.children) applyForceSeg(child, mx, my, radius);
	}
}
