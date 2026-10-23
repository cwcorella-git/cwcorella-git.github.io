<script lang="ts">
	import { dayOfYear, sunAltitudeDeg, sunXNorm } from '$lib/garden/sun';
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { loadTerrain, relightTerrain, snowLineFor, meadowLight, meadowSeason, type Terrain, type TerrainLight } from '$lib/garden/terrain';
	import { makeGrassTuft, makeSeedHead, tickWind, drawPlants, applyMouseForce, type PlantInstance } from '$lib/garden/plants';
	import { generateFgTree, loadFgTreeFromCache, saveFgTreeToCache, clearFgTreeCache, generateBgTree, loadBgTreeFromCache, saveBgTreeToCache, drawTree, drawLeaves, type TreeSegment } from '$lib/garden/tree';
	import { loadGardenState, saveGardenState, creditVisit, accrueElapsedDays, growthFactor, treeGrowthFactor, addAgeUnits } from '$lib/garden/state';
	import { adminState } from '$lib/admin/state.svelte';
	import { isUnlockDay } from '$lib/admin/tlock';
	import { toast } from '$lib/admin/toast.svelte';
	import { renderTreeArt, drawTreeArt, clumpsFromTips, broadleafShape, pineShape, juniperShape, cottonwoodFoliage, PINE_FOLIAGE, JUNIPER_FOLIAGE, type TreeArt, type Seg } from '$lib/garden/treeArt';
	import { weatherFor, type Weather } from '$lib/garden/weather';
	import { renderMeadow, renderNoiseCloud, renderNoiseCirrus, makeGrainTile } from '$lib/garden/detail';

	// ── constants ─────────────────────────────────────────────────────────────
	const HORIZON_FRAC = 0.68;   // horizon at 68% down canvas
	const STAR_COUNT   = 700;
	const NAV_CLEAR    = 70;   // CSS px kept clear above clouds

	let canvas = $state<HTMLCanvasElement | undefined>();

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

	// ── noise functions ────────────────────────────────────────────────────────
	function hashN(n: number): number {
		const s = Math.sin(n * 127.1) * 43758.5453123;
		return s - Math.floor(s);
	}
	function fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }
	function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

	function noise1D(x: number): number {
		const i = Math.floor(x), f = x - i;
		return lerp(hashN(i), hashN(i + 1), fade(f));
	}

	function fbm1D(x: number, octaves = 5): number {
		let v = 0, a = 0.5, f = 1;
		for (let i = 0; i < octaves; i++) { v += a * noise1D(x * f); a *= 0.5; f *= 2; }
		return v;
	}

	function ridged1D(x: number, octaves = 6): number {
		let v = 0, a = 0.5, f = 1, prev = 1;
		for (let i = 0; i < octaves; i++) {
			let n = 1 - Math.abs(noise1D(x * f) * 2 - 1);
			n = n * n * prev;
			v += n * a; prev = n; a *= 0.5; f *= 2.1;
		}
		return v;
	}

	// ── sun position ──────────────────────────────────────────────────────────
	// In $lib/garden/sun.ts, shared with the terrain.

	// ── moon phase (Julian date) ───────────────────────────────────────────────
	function moonPhase(): number {
		const JD = Date.now() / 86400000 + 2440587.5;
		return ((JD - 2451550.1) % 29.53058867) / 29.53058867;
	}

	// ── color utilities ────────────────────────────────────────────────────────
	type RGB = [number, number, number];

	function smoothstep(t: number): number {
		const c = Math.max(0, Math.min(1, t));
		return c * c * (3 - 2 * c);
	}
	function lerpRGB(a: RGB, b: RGB, t: number): RGB {
		const s = smoothstep(t);
		return [
			Math.round(a[0] + (b[0] - a[0]) * s),
			Math.round(a[1] + (b[1] - a[1]) * s),
			Math.round(a[2] + (b[2] - a[2]) * s),
		];
	}
	function css(c: RGB, alpha = 1): string {
		return `rgba(${c[0]},${c[1]},${c[2]},${alpha.toFixed(3)})`;
	}

	// ── sky keyframes (zenith → mid-upper → lower → horizon) ──────────────────
	// 5-stop non-linear gradient gives better horizon brightening + mid-sky tones.
	const SKY_KF: Array<{ alt: number; zenith: RGB; mid: RGB; lower: RGB; horizon: RGB }> = [
		{ alt: -20, zenith: [2,   4,  16] as RGB, mid: [3,   5,  22] as RGB, lower: [4,   7,  34] as RGB, horizon: [5,   8,  42] as RGB },
		{ alt: -12, zenith: [5,   8,  32] as RGB, mid: [7,  12,  42] as RGB, lower: [11,  18,  56] as RGB, horizon: [13,  21,  64] as RGB },
		{ alt:  -6, zenith: [13,  21,  64] as RGB, mid: [17,  27,  76] as RGB, lower: [22,  37,  98] as RGB, horizon: [26,  42, 108] as RGB },
		{ alt:  -1, zenith: [26,  42, 108] as RGB, mid: [32,  48, 114] as RGB, lower: [42,  58, 124] as RGB, horizon: [47,  64, 128] as RGB },
		// Sunset: mid sky goes violet-gray; lower bridges to orange horizon
		{ alt:   0, zenith: [74, 144, 196] as RGB, mid: [90, 100, 148] as RGB, lower: [190, 115,  80] as RGB, horizon: [255, 107,  53] as RGB },
		// Golden hour: warm mid sky, amber-cream lower band
		{ alt:   6, zenith: [100, 160, 210] as RGB, mid: [115, 165, 200] as RGB, lower: [200, 205, 170] as RGB, horizon: [255, 200, 140] as RGB },
		{ alt:  15, zenith: [100, 165, 220] as RGB, mid: [128, 188, 228] as RGB, lower: [172, 218, 238] as RGB, horizon: [200, 230, 245] as RGB },
		{ alt:  45, zenith: [30,  107, 158] as RGB, mid: [62, 152, 198] as RGB, lower: [108, 186, 222] as RGB, horizon: [135, 206, 235] as RGB },
	];

	function getSkyColors(altDeg: number): { zenith: RGB; mid: RGB; lower: RGB; horizon: RGB } {
		const kfs = SKY_KF;
		if (altDeg <= kfs[0].alt) return kfs[0];
		for (let i = 0; i < kfs.length - 1; i++) {
			if (altDeg <= kfs[i + 1].alt) {
				const t = (altDeg - kfs[i].alt) / (kfs[i + 1].alt - kfs[i].alt);
				return {
					zenith:  lerpRGB(kfs[i].zenith,  kfs[i + 1].zenith,  t),
					mid:     lerpRGB(kfs[i].mid,     kfs[i + 1].mid,     t),
					lower:   lerpRGB(kfs[i].lower,   kfs[i + 1].lower,   t),
					horizon: lerpRGB(kfs[i].horizon, kfs[i + 1].horizon, t),
				};
			}
		}
		return kfs[kfs.length - 1];
	}

	// ── cloud color keyframes ─────────────────────────────────────────────────
	// Shadow is always cool-opposite of lit top (skylight, never neutral grey).
	const CLOUD_KF: Array<{ alt: number; top: RGB; shadow: RGB }> = [
		{ alt: -14, top: [72,  82, 110] as RGB, shadow: [ 34,  40,  66] as RGB },  // deep night
		{ alt:  -6, top: [148, 122, 162] as RGB, shadow: [ 62,  50,  98] as RGB },  // pre-dawn purple
		{ alt:   0, top: [255, 140,  70] as RGB, shadow: [120, 118, 150] as RGB },  // sunset: orange-lit bases, grey-blue tops
		{ alt:   8, top: [255, 228, 168] as RGB, shadow: [ 90,  74, 112] as RGB },  // golden hour: amber top, purple-grey shadow
		{ alt:  22, top: [252, 250, 246] as RGB, shadow: [148, 160, 184] as RGB },  // midday: white top, cool blue-grey shadow
	];

	function getCloudColors(altDeg: number): { top: RGB; shadow: RGB } {
		const kfs = CLOUD_KF;
		if (altDeg <= kfs[0].alt) return kfs[0];
		for (let i = 0; i < kfs.length - 1; i++) {
			if (altDeg <= kfs[i + 1].alt) {
				const t = (altDeg - kfs[i].alt) / (kfs[i + 1].alt - kfs[i].alt);
				return {
					top:    lerpRGB(kfs[i].top,    kfs[i + 1].top,    t),
					shadow: lerpRGB(kfs[i].shadow, kfs[i + 1].shadow, t),
				};
			}
		}
		return kfs[kfs.length - 1];
	}

	// Cache key: quantize RGB to 8-step bins so slow sky transitions don't
	// trigger a rebuild every single frame.
	function quantizeColorKey(top: RGB, shadow: RGB): string {
		const q = (c: number) => Math.round(c / 8) * 8;
		return `${top.map(q)}_${shadow.map(q)}`;
	}

	// ── scene data (rebuilt on resize) ────────────────────────────────────────
	interface Star {
		x: number; y: number;
		r: number;
		color: string;
		twinklePhase: number;
		twinkleSpeed: number;
		isMilkyWay: boolean;
	}

	interface CloudDef {
		xFrac:         number;   // initial x fraction (0–1)
		yFrac:         number;   // 0 = high in sky, ~0.38 = near horizon
		size:          number;   // body width in px
		aspectRatio:   number;   // height÷width — near-horizon ~0.10, overhead ~0.42
		alpha:         number;
		haze:          number;   // 0 overhead … 1 at the horizon
		squash:        number;   // drawn height ÷ baked height; <1 flattens the high layer into a sheet
		prngseed:      number;
		speed:         number;   // px / minute
		cache:         { canvas: HTMLCanvasElement; baseY: number; w: number; h: number } | null;
		cacheColorKey: string;
		grey?:         boolean;  // an overcast deck: baked in the shadow colour
		life?:         { seed: number; phase: number; period: number; cycle: number };   // cumulus form and fade
	}

	interface CirrusDef {
		xFrac:    number;
		yFrac:    number;   // high in sky (0.03–0.18)
		width:    number;   // streak width
		angle:    number;   // slight tilt in radians
		alpha:    number;
		prngseed: number;
		speed:    number;   // px / minute (slow)
		cache:    HTMLCanvasElement | null;
		cacheColorKey: string;
	}

	const SPECTRAL: Array<{ color: string; weight: number }> = [
		{ color: '#aabfff', weight: 3  },
		{ color: '#cad7ff', weight: 5  },
		{ color: '#f8f7ff', weight: 10 },
		{ color: '#fff4ea', weight: 15 },
		{ color: '#ffd2a1', weight: 30 },
		{ color: '#ffcc6f', weight: 37 },
	];
	const SPECTRAL_TOTAL = SPECTRAL.reduce((s, e) => s + e.weight, 0);

	let stars: Star[]               = [];
	let clouds: CloudDef[]          = [];
	let cirrus: CirrusDef[]         = [];
	let bgPlants: PlantInstance[]   = [];  // drawn before midground trees (far, near horizon)
	let fgPlants: PlantInstance[]   = [];  // drawn after trees (near, foreground)
	let fgTreeSegs:   TreeSegment[] = [];  // recursive branching — main foreground tree
	let bgTreeSegs:   TreeSegment[] = [];  // space colonization — background silhouette
	let gardenAgeUnits              = 11315;   // default; overwritten from localStorage on mount
	let treeLeanAngle               = 0;       // stable per-seed foreground tree lean (±4°)
	let W = 0, H = 0, horizonY = 0;
	let dpr = 1;   // devicePixelRatio — canvas works in physical pixels so zoom has no effect
	let meadow: HTMLCanvasElement | null = null;   // multiply layer over the ground band
	let grain: CanvasPattern | null = null;

	// Today's clouds, from weatherFor: the seeds include the date, so each day
	// has its own sky. Rebuilt by draw() when the date changes.
	let weather: Weather = weatherFor(new Date());
	let weatherDay = '';
	function buildClouds(): void {
		const now = new Date();
		weatherDay = now.toDateString();
		weather = weatherFor(now);
		const crng = makePRNG(weather.seed);
		const over = weather.kind === 'overcast';
		clouds = [];
		// A thin, wide, high layer first, so the cumulus pass in front of it.
		// Overcast: wider, lower and denser, lying across the sky.
		for (let i = 0; i < weather.sheets; i++) {
			clouds.push({
				xFrac: over ? i / weather.sheets + crng() * 0.1 : crng(),
				yFrac: over ? 0.02 + crng() * 0.12 : 0.03 + crng() * 0.08,
				size: over ? 620 + crng() * 300 : 260 + crng() * 160, aspectRatio: over ? 0.2 : 0.12,
				alpha: over ? 0.5 + crng() * 0.15 : 0.12 + crng() * 0.1, haze: over ? 0.5 : 0.4, grey: over,
				squash: over ? 0.45 : 0.35, prngseed: Math.floor(crng() * 0x7FFFFFFF),
				speed: (10 + crng() * 10) * dpr, cache: null, cacheColorKey: '',
			});
		}
		for (let i = 0; i < weather.cumulus; i++) {
			const xFrac  = crng();
			const yFrac  = 0.05 + crng() * 0.33;  // 0 = high, 0.38 = near horizon

			// Perspective: clouds high in sky are taller + more opaque.
			// perspFrac = 1 overhead, 0 near horizon.
			const perspFrac  = 1 - yFrac / 0.38;
			const size       = (110 + crng() * 130) * (0.50 + perspFrac * 0.50) * weather.cumulusSize;
			const aspectRatio = 0.20 + perspFrac * 0.32;   // 0.20 modest sliver → 0.52 tall dome
			const alpha      = (0.52 + crng() * 0.32) * (0.38 + perspFrac * 0.62);
			const prngseed   = Math.floor(crng() * 0x7FFFFFFF);
			const speed      = (25 + crng() * 35) * dpr * (0.6 + 0.4 * perspFrac);   // nearer clouds cross faster
			clouds.push({
				xFrac, yFrac, size, aspectRatio, alpha, prngseed, speed,
				haze: 1 - perspFrac, squash: 1,
				life: { seed: prngseed, phase: crng(), period: 10 + crng() * 10, cycle: -1 },
				cache:         null,
				cacheColorKey: '',
			});
		}

		const cirrng = makePRNG(weather.seed ^ 0xC19C1991);
		cirrus = [];
		for (let i = 0; i < weather.cirrus; i++) {
			cirrus.push({
				xFrac:    cirrng(),
				yFrac:    0.03 + cirrng() * 0.15,
				width:    130 + cirrng() * 220,
				angle:    (cirrng() - 0.5) * 0.28,
				alpha:    0.22 + cirrng() * 0.30,
				prngseed: Math.floor(cirrng() * 0x7FFFFFFF),
				speed:    (8 + cirrng() * 8) * dpr,
				cache:    null,
				cacheColorKey: '',
			});
		}
		terrainLit = { key: '', canvas: terrainLit.canvas };
		treeCache.key = '';
		treePending = null;
	}

	function buildScene(cw: number, ch: number, hy: number): void {
		const rng = makePRNG(0xCAFEBABE);
		stars = [];

		for (let i = 0; i < STAR_COUNT; i++) {
			const mag = rng() * 6.5;
			const r   = Math.max(0.25, 2.6 - mag * 0.35);
			let w = rng() * SPECTRAL_TOTAL, colorStr = '#fff4ea';
			for (const s of SPECTRAL) { w -= s.weight; if (w <= 0) { colorStr = s.color; break; } }

			const isMilkyWay = i < 200;
			let x: number, y: number;
			if (isMilkyWay) {
				// Diagonal band: runs from lower-right to upper-left
				const t      = rng();
				const spread = (rng() - 0.5) * 0.26;
				x = Math.max(0.01, Math.min(0.99, (t + spread * 0.4) % 1.0));
				y = Math.max(0.02, Math.min(0.97, 1 - t * 0.78 + spread * 0.55));
			} else {
				x = rng();
				y = rng() * 0.96 + 0.02;
			}

			stars.push({
				x: x * cw,
				y: y * hy,
				r,
				color: colorStr,
				twinklePhase: rng() * Math.PI * 2,
				twinkleSpeed: 1.5 + rng() * 3.0,
				isMilkyWay,
			});
		}

		buildClouds();

		terrainLit = { key: '', canvas: terrainLit.canvas };
		shadowCache = { key: '', canvas: null };
		meadow = renderMeadow(cw, ch - hy, dpr);

		// ── plants ──────────────────────────────────────────────────────────────────────────
		const prng = makePRNG(0xBADC0FFE);

		// Plants scatter across 80% of the ground band. yFrac=0 is at the horizon (far/small),
		// yFrac=1 is deep foreground (large/opaque). Split at bgCut: bg layer draws behind
		// the tree, fg layer draws in front.
		const groundBand = (ch - hy) * 0.80;
		const bgCut = 0.42;   // yFrac threshold separating bg from fg

		bgPlants = [];
		fgPlants = [];

		// Grass — denser toward the foreground, fewer on a phone's narrow meadow
		const tufts = cw / dpr < 700 ? 90 : 150;
		for (let i = 0; i < tufts; i++) {
			const yFrac  = Math.pow(prng(), 1.4);
			const x      = prng() * cw;
			const y      = hy + yFrac * groundBand;
			const bornAt = prng() * 4000;
			const scale  = growthFactor(Math.max(0, gardenAgeUnits - bornAt));
			// True 1/d perspective scaling: same endpoints as linear (0.35× far, 1.85× near)
			// but correct hyperbolic curve — midground plants are ~half the linear approximation.
			const depth  = 0.431 / (1.233 - yFrac);
			const h      = (20 + prng() * 40) * scale * depth;
			const seed   = Math.floor(prng() * 0x7FFFFFFF);
			const plant  = makeGrassTuft(x, y, h, seed);
			(yFrac < bgCut ? bgPlants : fgPlants).push(plant);
		}

		// Seed heads — 18 in four patches, mostly in the near field, kept off the very horizon
		const patches = Array.from({ length: 4 }, () => ({ x: prng() * cw, y: Math.pow(prng(), 0.7) * 0.7 + 0.1 }));
		for (let i = 0; i < 18; i++) {
			const p      = patches[i % 4];
			const yFrac  = Math.max(0.06, Math.min(0.92, p.y + (prng() - 0.5) * 0.12));
			const x      = p.x + (prng() - 0.5) * cw * 0.08;
			const y      = hy + yFrac * groundBand;
			const bornAt = prng() * 6000;
			const scale  = growthFactor(Math.max(0, gardenAgeUnits - bornAt));
			const depth  = 0.431 / (1.233 - yFrac);
			const h      = (50 + prng() * 50) * scale * depth;
			const seed   = Math.floor(prng() * 0x7FFFFFFF);
			const plant  = makeSeedHead(x, y, h, seed);
			(yFrac < bgCut ? bgPlants : fgPlants).push(plant);
		}
	}

	// ── draw: sky ─────────────────────────────────────────────────────────────
	// 5 stops at power-2.5 non-linear positions — more gradient range near horizon.
	// Stop positions [0, 0.25, 0.5, 0.75, 1] remapped: [0, 0.57, 0.76, 0.88, 1.0]
	function drawSky(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const { zenith, mid, horizon } = getSkyColors(altDeg);
		// Derive `lower` as a smooth bridge between mid and horizon rather than
		// using the independently-keyed value — independent values caused visible
		// banding when hue shifted abruptly between keyframes (golden-hour warm
		// amber → morning cool blue produced a greenish strip at ~alt 10°).
		const lower = lerpRGB(mid, horizon, 0.55);
		const bright = lerpRGB(horizon, [255, 255, 255] as RGB, 0.12);
		const g = ctx.createLinearGradient(0, 0, 0, horizonY);
		g.addColorStop(0,    css(zenith));
		g.addColorStop(0.57, css(mid));
		g.addColorStop(0.76, css(lower));
		g.addColorStop(0.90, css(horizon));
		g.addColorStop(1,    css(bright));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, horizonY);
	}

	// ── draw: circumsolar Mie-scatter brightening ─────────────────────────────
	// Wide warm glow around the sun simulating forward-scattering by aerosols.
	// Intensity peaks at low solar altitudes (golden hour / horizon crossing).
	function drawCircumsolarGlow(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		if (altDeg <= -8) return;
		const sunX   = sxn * W;
		const sinAlt = Math.max(0, Math.sin(altDeg * Math.PI / 180));
		const sunY   = horizonY - sinAlt * horizonY * 0.92;
		// Fade at high altitudes; full intensity near horizon
		const intensity = Math.max(0, 1 - Math.max(0, altDeg - 4) / 42) * 0.30;
		// Color: warm orange-amber when low, cool white when high
		const warmth = Math.max(0, 1 - altDeg / 22);
		const cr = 255, cg = Math.round(238 - warmth * 38), cb = Math.round(212 - warmth * 82);
		const radius = Math.min(W * 0.58, horizonY * 0.85);
		const glow   = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
		glow.addColorStop(0,    `rgba(${cr},${cg},${cb},${intensity.toFixed(3)})`);
		glow.addColorStop(0.35, `rgba(${cr},${cg},${cb},${(intensity * 0.32).toFixed(3)})`);
		glow.addColorStop(1,    'rgba(255,235,210,0)');
		ctx.save();
		ctx.globalCompositeOperation = 'screen';
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, W, H);
		ctx.restore();
	}

	// ── draw: purple light / afterglow ────────────────────────────────────────
	// Stratospheric aerosol scattering produces a rose-magenta glow on the
	// sun-side upper sky for ~30 min after sunset (alt -2° to -10°).
	function drawPurpleLight(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		if (altDeg < -10 || altDeg > -1) return;
		const t         = (altDeg + 10) / 9;           // 0 at -10°, 1 at -1°
		const intensity = Math.sin(t * Math.PI) * 0.45; // peaks near -5.5°
		const cx = sxn * W;
		const cy = horizonY * 0.17;
		const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.62);
		grad.addColorStop(0,   `rgba(180,80,140,${(intensity * 0.34).toFixed(3)})`);
		grad.addColorStop(0.4, `rgba(140,58,118,${(intensity * 0.18).toFixed(3)})`);
		grad.addColorStop(0.7, `rgba(100,48,118,${(intensity * 0.07).toFixed(3)})`);
		grad.addColorStop(1,   'rgba(80,40,100,0)');
		ctx.save();
		ctx.globalCompositeOperation = 'screen';
		ctx.fillStyle = grad;
		ctx.fillRect(0, 0, W, horizonY);  // full sky — gradient fades to 0 before edge
		ctx.restore();
	}

	// ── draw: crepuscular rays ────────────────────────────────────────────────
	// Fan of light shafts radiating from the sun at horizon crossing.
	// Uses rotate+translate so each strip gets a proper linear gradient.
	function drawCrepuscularRays(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		if (altDeg < -3 || altDeg > 10) return;
		const intensity = Math.max(0, 1 - Math.abs(altDeg - 2.5) / 6) * 0.20;
		if (intensity < 0.01) return;

		const sunX = sxn * W;
		const sunY = horizonY;

		const rng = makePRNG(0xC0FFEE);
		ctx.save();
		ctx.beginPath();
		ctx.rect(0, 0, W, horizonY);   // clip rays to sky area
		ctx.clip();
		ctx.globalCompositeOperation = 'screen';

		for (let i = 0; i < 10; i++) {
			const angle  = (rng() - 0.5) * 1.3;           // ±0.65 rad around vertical
			const len    = H * (0.45 + rng() * 0.55);
			const width  = 10 + rng() * 30;
			const alpha  = intensity * (0.35 + rng() * 0.65);

			ctx.save();
			ctx.translate(sunX, sunY);
			ctx.rotate(angle);                             // 0 = straight up

			const grad = ctx.createLinearGradient(0, 0, 0, -len);
			grad.addColorStop(0,   `rgba(255,210,140,${alpha.toFixed(3)})`);
			grad.addColorStop(0.4, `rgba(255,200,120,${(alpha * 0.35).toFixed(3)})`);
			grad.addColorStop(1,   'rgba(255,200,120,0)');

			ctx.fillStyle = grad;
			ctx.fillRect(-width / 2, -len, width, len);
			ctx.restore();
		}
		ctx.restore();
	}

	// ── draw: ground ──────────────────────────────────────────────────────────
	// Ground color tracks sky state: warm sandy by day, amber at sunset, dark at night.
	function drawGround(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const dl  = Math.max(0, Math.min(1, (altDeg + 8) / 16));   // 0=night, 1=full-day
		const slt = Math.max(0, Math.min(1, 1 - Math.abs(altDeg - 3) / 7)); // sunset peak ~alt 3°

		// topColor is slightly lighter than before — increases recession contrast toward horizon.
		const dayTop:    RGB = [218, 202, 168];
		const sunsetTop: RGB = [210, 138,  68];
		const nightTop:  RGB = [ 30,  30,  50];
		const dayBot:    RGB = [155, 134,  96];
		const sunsetBot: RGB = [140,  78,  30];
		const nightBot:  RGB = [  8,   8,  18];

		let topColor: RGB, botColor: RGB;
		if (dl > 0.5) {
			const t = slt * 0.45;
			topColor = lerpRGB(dayTop, sunsetTop, t);
			botColor = lerpRGB(dayBot, sunsetBot, t);
		} else {
			topColor = lerpRGB(nightTop, dayTop, dl * 2);
			botColor = lerpRGB(nightBot, dayBot, dl * 2);
		}

		const g = ctx.createLinearGradient(0, horizonY, 0, H);
		g.addColorStop(0,   css(topColor));
		g.addColorStop(0.4, css(lerpRGB(topColor, botColor, 0.5)));
		g.addColorStop(1,   css(botColor));
		ctx.fillStyle = g;
		ctx.fillRect(0, horizonY, W, H - horizonY);

		// Foreground shadow: darkens the bottom ~22% of the ground band, simulating
		// the shadow cast beneath the viewer's feet. Depth cue independent of time of day.
		const shadowH = (H - horizonY) * 0.22;
		const sg = ctx.createLinearGradient(0, H - shadowH, 0, H);
		sg.addColorStop(0, 'rgba(0,0,0,0)');
		sg.addColorStop(1, 'rgba(0,0,0,0.20)');
		ctx.fillStyle = sg;
		ctx.fillRect(0, H - shadowH, W, shadowH);
	}

	// ── draw: stars & Milky Way ────────────────────────────────────────────────
	function drawStars(ctx: CanvasRenderingContext2D, altDeg: number, time: number): void {
		// Fade in from alt -8° (0) to -14° (1)
		const starAlpha = Math.max(0, Math.min(1, (-altDeg - 8) / 6));
		if (starAlpha <= 0) return;

		// Milky Way haze: soft blue-gray smear over the band stars
		if (starAlpha > 0.3) {
			ctx.save();
			ctx.globalAlpha = starAlpha * 0.10;
			ctx.fillStyle = '#b8c8e0';
			for (let i = 0; i < 200 && i < stars.length; i++) {
				const s = stars[i];
				ctx.beginPath();
				ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.restore();
		}

		// Individual stars
		for (const s of stars) {
			const twinkle = 0.70 + 0.30 * Math.sin(time * s.twinkleSpeed + s.twinklePhase);
			const alpha   = starAlpha * twinkle * (s.isMilkyWay ? 0.55 : 1.0);
			ctx.globalAlpha = alpha;
			ctx.fillStyle   = s.color;
			ctx.beginPath();
			ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
	}

	// ── draw: moon ────────────────────────────────────────────────────────────
	function drawMoon(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		// Moon fades in below sun alt -6°
		const moonAlpha = Math.max(0, Math.min(1, (-altDeg - 6) / 8));
		if (moonAlpha <= 0) return;

		// Simplified: moon roughly opposite sun, altitude = -altDeg * 0.65
		const moonX      = (1 - sxn) * W;
		const moonAltDeg = Math.min(72, Math.max(2, -altDeg * 0.65));
		const sinMoon    = Math.sin(moonAltDeg * Math.PI / 180);
		const moonY      = horizonY - sinMoon * horizonY * 0.88;

		const phase = moonPhase(); // 0=new, 0.5=full, 1=new
		const R = 11;

		// Glow
		const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, R * 5);
		glow.addColorStop(0,   `rgba(220,210,175,${(moonAlpha * 0.28).toFixed(3)})`);
		glow.addColorStop(0.5, `rgba(200,195,160,${(moonAlpha * 0.07).toFixed(3)})`);
		glow.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = glow;
		ctx.fillRect(moonX - R * 5, moonY - R * 5, R * 10, R * 10);

		ctx.save();
		ctx.globalAlpha = moonAlpha;

		// Lit disc
		ctx.beginPath();
		ctx.arc(moonX, moonY, R, 0, Math.PI * 2);
		ctx.fillStyle = '#E8DFC0';
		ctx.fill();

		// Shadow overlay (crescent via two overlapping arcs)
		const lit      = Math.abs(phase - 0.5) * 2;   // 0=full, 1=new
		const shadowCx = moonX + (phase < 0.5 ? -1 : 1) * R * lit * 0.82;
		ctx.beginPath();
		ctx.arc(moonX, moonY, R, -Math.PI / 2, Math.PI / 2);
		ctx.arc(shadowCx, moonY, R, Math.PI / 2, -Math.PI / 2, true);
		ctx.fillStyle = 'rgba(5,4,18,0.94)';
		ctx.fill();

		ctx.restore();
	}

	// ── draw: mountains & hills ────────────────────────────────────────────────
	// The mountains are a real terrain panorama (terrain.ts, baked by
	// scripts/bake-terrain.py), drawn once its atlas loads; until then, or if it
	// never does, the sky meets the hills. The noise ranges that stood here went
	// on 2026-10-22: they read as flat cut-outs however they were lit.
	let terrain: Terrain | null = null;
	let terrainLit: { key: string; canvas: HTMLCanvasElement | null } = { key: '', canvas: null };
	// What the grass tufts take from the ground: its light and its season.
	let plantLight: RGB | null = null;
	let plantGreen = 1;

	const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

	function drawTerrain(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const dl     = clamp01((altDeg + 8) / 16);                       // 0 night → 1 day
		const golden = altDeg > -4 ? clamp01(1 - Math.abs(altDeg - 3) / 9) : 0;
		const { horizon, zenith } = getSkyColors(altDeg);

		if (terrain) drawRealTerrain(ctx, terrain, altDeg, sxn, dl, golden, horizon, zenith);
		if (terrain?.meta.nrowTop) return;                               // the bake carries its own ground

		// Rolling hills, filled to the bottom: this is the ground the meadow multiplies over.
		const hill: RGB = dl < 0.5 ? lerpRGB([6, 8, 16], [52, 54, 40], dl * 2) : lerpRGB([52, 54, 40], [150, 148, 98], (dl - 0.5) * 2);
		const warm = lerpRGB(hill, [190, 140, 80], golden * 0.25);
		fillHillRange(ctx, 8.1, horizonY * 0.14, css(warm), horizon, (1 - Math.exp(-(0.3 + 0.75 * dl) * 0.08)));
	}

	/** The baked panorama (terrain.ts), re-lit about every half degree of sun,
	 *  standing on the horizon. The light comes from where the garden draws the
	 *  sun (sunrise right, sunset left), whichever way the bake faces, so the
	 *  lit faces always agree with the sky. Narrow screens show a centred slice
	 *  instead of squeezing the whole span in, so the slopes keep their shape. */
	function drawRealTerrain(ctx: CanvasRenderingContext2D, t: Terrain, altDeg: number, sxn: number, dl: number, golden: number, horizon: RGB, zenith: RGB): void {
		const m = t.meta;
		const month = new Date().getMonth();
		const mid = (m.az0 + m.az1) / 2, half = (m.az1 - m.az0) / 2;
		const az = mid + (sxn - 0.5) * 2 * half * 1.3;
		const ph = horizonY * 0.36;                                       // panorama height on screen
		const frame = m.ang1 - m.ang0, total = m.az1 - m.az0;
		const span = Math.min(total, (4 * W * frame) / ph);              // ≤ 4× vertical exaggeration
		const cols = (span / total) * m.ncol;
		const c0 = (m.ncol - cols) / 2;
		const doy = dayOfYear(new Date());
		const key = `${Math.round(altDeg * 2)}|${Math.round(az)}|${doy}|${Math.round(c0)}|${weather.kind}`;
		if (terrainLit.key !== key) {
			const L: TerrainLight = {
				az, alt: altDeg,
				sunCol: dimSun(lerpRGB([255, 246, 228], [255, 170, 96], golden)),
				sky:    lerpRGB(lerpRGB(zenith, horizon, 0.5), [150, 152, 158], weather.cover * 0.4),
				night:  [14, 18, 35],
				dl,
				fog:    horizon,
				beta:   0.18 + 0.35 * dl,
				snowLine: snowLineFor(m, month),
				doy,
			};
			plantLight = meadowLight(L);
			plantGreen = meadowSeason(doy);
			terrainLit = {
				key,
				canvas: relightTerrain(t, L, terrainLit.canvas ?? undefined, [Math.floor(c0), Math.ceil(c0 + cols)], W / dpr < 800 ? 2 : 1),   // phones: half-res light
			};
		}
		const top = m.nrowTop ?? m.nrow;
		// Mountains above the horizon; below it, the baked meadow in its own
		// perspective, down to the bottom of the screen.
		ctx.drawImage(terrainLit.canvas!, c0, 0, cols, top, 0, horizonY - ph, W, ph);
		if (top < m.nrow) ctx.drawImage(terrainLit.canvas!, c0, top, cols, m.nrow - top, 0, horizonY, W, H - horizonY);
	}

	function tuftLight(altDeg: number): RGB {
		if (terrain && plantLight) return plantLight;
		const v = clamp01((altDeg + 6) / 12) * 0.9 + 0.1;   // no terrain: the old dimming
		return [v, v, v];
	}

	// ── draw: meadow ──────────────────────────────────────────────────────────
	function drawMeadow(ctx: CanvasRenderingContext2D): void {
		if (!meadow) return;
		ctx.save();
		ctx.globalCompositeOperation = 'multiply';
		ctx.drawImage(meadow, 0, horizonY);
		ctx.restore();
	}

	// ── draw: cloud shadows ───────────────────────────────────────────────────
	// Soft shadows drifting over the ground with their clouds. Overhead clouds
	// shade the foreground; clouds near the horizon shade the far field.
	// A cumulus forms, grows and fades over its period; at the end of each
	// cycle it comes back as a new cloud somewhere else (new seed, new x),
	// rebaked under drawClouds' one-bake-per-frame budget.
	function cloudLife(cloud: CloudDef, minutes: number): { a: number; k: number } {
		const L = cloud.life;
		if (!L) return { a: 1, k: 1 };
		const t = minutes / L.period + L.phase, n = Math.floor(t), f = t - n;
		if (n !== L.cycle) {
			L.cycle = n;
			const r = makePRNG(L.seed ^ Math.imul(n, 0x9E3779B1));
			cloud.prngseed = Math.floor(r() * 0x7FFFFFFF);
			cloud.xFrac = r();
			cloud.cache = null;
		}
		const a = smoothstep(clamp01(f / 0.15)) * smoothstep(clamp01((1 - f) / 0.2));
		return { a, k: 0.85 + 0.2 * f };
	}

	// Wrap over a FIXED span. The distance since 1970 is ~1e9 px, so a modulus
	// that moves with the cloud's growing width throws it across the sky every frame.
	function driftX(cloud: CloudDef, minutes: number): number {
		const span = W + cloud.size * 2.6;   // the bake is 2.4 × size wide, ×1.05 at full growth
		return (cloud.xFrac * W + minutes * cloud.speed) % span - cloud.size * 1.3;
	}

	// Cloud cover dims the direct sun; overcast light is flat.
	function dimSun(c: RGB): RGB { const k = 1 - 0.7 * weather.cover; return [c[0] * k, c[1] * k, c[2] * k]; }

	function drawCloudShadows(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const sun = clamp01((altDeg - 2) / 12) * (1 - weather.cover / 0.6);
		if (sun < 0.02) return;
		const minutes = Date.now() / 60000;
		const sunX = sxn * W;
		ctx.save();
		ctx.beginPath(); ctx.rect(0, horizonY, W, H - horizonY); ctx.clip();
		for (const cloud of clouds) {
			const { a: life, k } = cloudLife(cloud, minutes);
			if (life <= 0) continue;
			const cx   = driftX(cloud, minutes);
			const near = clamp01(1 - cloud.yFrac / 0.38);
			const gx   = cx + (cx - sunX) * 0.15;
			const gy   = horizonY + (0.12 + 0.8 * near) * (H - horizonY);
			const rx   = cloud.size * k * (0.7 + 0.9 * near);
			const ry   = rx * (0.10 + 0.12 * near);
			const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
			g.addColorStop(0,   `rgba(10,16,30,${(0.24 * sun * cloud.alpha * life).toFixed(3)})`);
			g.addColorStop(0.6, `rgba(10,16,30,${(0.12 * sun * cloud.alpha * life).toFixed(3)})`);
			g.addColorStop(1,   'rgba(10,16,30,0)');
			ctx.save();
			ctx.translate(gx, gy);
			ctx.scale(rx, ry);
			ctx.fillStyle = g;
			ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
			ctx.restore();
		}
		ctx.restore();
	}

	// ── draw: foreground tree's cast shadow ───────────────────────────────────
	// The tree redrawn flat on the ground, sheared away from the sun and longer
	// as the sun drops. Baked offscreen (with a slight blur) per sun position.
	let shadowCache: { key: string; canvas: HTMLCanvasElement | null } = { key: '', canvas: null };

	function drawTreeCastShadow(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const sunFactor = clamp01((altDeg - 1) / 8);
		if (sunFactor < 0.03 || fgTreeSegs.length === 0 || !treeArts(altDeg, sxn).fg) return;
		const bx = fgBaseX();
		const key = `${W}x${H}|${altDeg.toFixed(1)}|${Math.round(sxn * 100)}|${fgTreeSegs.length}|${gardenAgeUnits}`;
		if (shadowCache.key !== key) {
			const L    = Math.min(3.5, 1 / Math.tan(Math.max(4, altDeg) * Math.PI / 180));
			const fy   = 0.16 * L;                                   // ground foreshortening
			const away = Math.sign(bx - sxn * W) || 1;               // +1: sun on the left
			const m    = away * Math.min(1.4, 0.35 * L) * clamp01(Math.abs(sxn * W - bx) / (W * 0.4) + 0.2);
			const raw = document.createElement('canvas');
			raw.width = W; raw.height = H;
			const rctx = raw.getContext('2d')!;
			// (x, y) → (x + m·(by − y), by + fy·(by − y)), by the tree's base
			const by = fgBaseY();
			rctx.setTransform(1, 0, -m, -fy, m * by, by * (1 + fy));
			rctx.translate(bx, fgBaseY());
			rctx.rotate(treeLeanAngle);
			rctx.translate(-bx, -fgBaseY());
			// Cast from the same trunk and leaf clumps the tree is drawn with, so the
			// shadow has the crown's gaps and lumps, then flattened to black.
			const art = treeArts(altDeg, sxn).fg;
			if (art) drawTreeArt(rctx, art, 0);
			rctx.setTransform(1, 0, 0, 1, 0, 0);
			rctx.globalCompositeOperation = 'source-in';
			rctx.fillStyle = '#000';
			rctx.fillRect(0, 0, W, H);
			const out = document.createElement('canvas');
			out.width = W; out.height = H;
			const octx = out.getContext('2d')!;
			octx.filter = `blur(${Math.round(1.5 * dpr)}px)`;
			octx.drawImage(raw, 0, 0);
			shadowCache = { key, canvas: out };
		}
		if (!shadowCache.canvas) return;
		ctx.save();
		ctx.globalAlpha = 0.26 * sunFactor;
		ctx.drawImage(shadowCache.canvas, 0, 0);
		ctx.restore();
	}

	// ── draw: grain ───────────────────────────────────────────────────────────
	function drawGrain(ctx: CanvasRenderingContext2D): void {
		if (!grain) {
			grain = ctx.createPattern(makeGrainTile(), 'repeat');
			if (!grain) return;
		}
		ctx.fillStyle = grain;
		ctx.fillRect(0, 0, W, H);
	}

	function fillMountainRange(
		ctx: CanvasRenderingContext2D,
		seed: number, heightScale: number, color: string,
		hazeRGB: RGB = [255, 255, 255], hazeAlpha = 0
	): void {
		// Extend terrain 60px beyond each edge so the range appears to continue
		// off-screen; the canvas clips the visual output naturally.
		const OVER = 60;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(-OVER, H);
		for (let px = -OVER; px <= W + OVER; px += 3) {
			const h = ridged1D((px / W) * 3.5 + seed) * heightScale;
			ctx.lineTo(px, horizonY - h);
		}
		ctx.lineTo(W + OVER, H);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		if (hazeAlpha > 0.005) {
			ctx.clip();
			ctx.fillStyle = css(hazeRGB, hazeAlpha);
			ctx.fillRect(0, 0, W, H);
		}
		ctx.restore();
	}

	function fillHillRange(
		ctx: CanvasRenderingContext2D,
		seed: number, heightScale: number, color: string,
		hazeRGB: RGB = [255, 255, 255], hazeAlpha = 0
	): void {
		const OVER = 60;
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(-OVER, H);
		for (let px = -OVER; px <= W + OVER; px += 4) {
			const h = fbm1D((px / W) * 4.5 + seed) * heightScale;
			ctx.lineTo(px, horizonY - h);
		}
		ctx.lineTo(W + OVER, H);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
		if (hazeAlpha > 0.005) {
			ctx.clip();
			ctx.fillStyle = css(hazeRGB, hazeAlpha);
			ctx.fillRect(0, 0, W, H);
		}
		ctx.restore();
	}

	// ── draw: horizon atmosphere blend ───────────────────────────────────────
	// Soft sky-color wash straddling the horizon — dissolves the hard edge between
	// sky and ground into the same atmospheric haze visible in pencil landscapes.
	function drawHorizonBlend(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const { horizon } = getSkyColors(altDeg);
		const band = Math.max(6, horizonY * 0.022);
		const g = ctx.createLinearGradient(0, horizonY - band, 0, horizonY + band * 1.8);
		g.addColorStop(0,   css(horizon, 0));
		g.addColorStop(0.3, css(horizon, 0.32));
		g.addColorStop(0.6, css(horizon, 0.18));
		g.addColorStop(1,   css(horizon, 0));
		ctx.fillStyle = g;
		ctx.fillRect(0, horizonY - band, W, band * 2.8);
	}

	// ── draw: ground contour lines ────────────────────────────────────────────
	// Faint wavy strokes receding to the horizon — quadratic y-spacing mimics
	// perspective foreshortening: dense near the horizon, spread in the foreground.
	function drawGroundContours(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const dl = Math.max(0, Math.min(1, (altDeg + 8) / 16));
		const alpha = dl * 0.05;
		if (alpha < 0.004) return;

		const groundH   = H - horizonY;
		const lineCount = 7;
		ctx.save();
		ctx.strokeStyle = `rgba(0,0,0,${alpha.toFixed(3)})`;
		ctx.lineCap = 'round';

		for (let i = 0; i < lineCount; i++) {
			const t     = (i + 1) / (lineCount + 1);
			const yFrac = t * t;                           // quadratic: crowd near horizon
			const y     = horizonY + yFrac * groundH * 0.82;
			const amp   = yFrac * H * 0.010;
			ctx.lineWidth = Math.max(0.3, yFrac * 1.0);
			ctx.beginPath();
			ctx.moveTo(0, y);
			for (let x = 0; x <= W; x += 10) {
				ctx.lineTo(x, y + noise1D(x / 200 + i * 5.3) * amp);
			}
			ctx.stroke();
		}
		ctx.restore();
	}

	// ── draw: vignette ────────────────────────────────────────────────────────
	// Soft dark radial gradient from the corners — frames the scene and adds
	// the atmospheric edge-darkness present in every pencil landscape reference.
	function drawVignette(ctx: CanvasRenderingContext2D): void {
		const cx    = W / 2;
		const cy    = H / 2;
		const inner = Math.min(W, H) * 0.28;
		const outer = Math.max(W, H) * 0.80;
		const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
		g.addColorStop(0,    'rgba(0,0,0,0)');
		g.addColorStop(0.55, 'rgba(0,0,0,0)');
		g.addColorStop(1,    'rgba(0,0,0,0.42)');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);
	}

	// ── trees ─────────────────────────────────────────────────────────────────
	// Local species (2026-10-22): the foreground and far-right trees are
	// cottonwoods, which follow the seasons; the midground has a cottonwood,
	// two Jeffrey pines and a juniper. Each tree is baked by treeArt.ts into a
	// trunk plus leaf-clump sprites and re-baked when the sun moves a degree.
	// yf: how far down the meadow each stands (0 on the horizon). Nearer
	// trees stand lower and larger, by the same 1/d curve as the grass.
	const MIDGROUND: { xf: number; yf: number; bornAgo: number; kind: 'cottonwood' | 'pine' | 'juniper'; h: number }[] = [
		{ xf: 0.74, yf: 0.0,  bornAgo: 0,     kind: 'pine',       h: 120 },  // same age as the site
		{ xf: 0.49, yf: 0.03, bornAgo: 54750, kind: 'cottonwood', h: 130 },  // +150yr
		{ xf: 0.61, yf: 0.07, bornAgo: 10950, kind: 'pine',       h: 150 },  // +30yr
		{ xf: 0.93, yf: 0.12, bornAgo: -5475, kind: 'juniper',    h: 110 },  // −15yr
	];
	const depthK = (yf: number) => 1.233 / (1.233 - yf);
	const groundY = (yf: number) => horizonY + yf * (H - horizonY);
	// The foreground cottonwood stands a third of the way down the meadow, so
	// it is in front of the others and not one more tree on the horizon.
	// On a phone it stands further left and less far forward, or its crown
	// covers the old cottonwood and the pine.
	const narrow = () => W / dpr < 700;
	const fgYf = () => narrow() ? 0.22 : 0.3;
	const fgBaseX = () => W * (narrow() ? 0.18 : 0.28);
	const fgBaseY = () => groundY(fgYf());
	let treeCache: { key: string; fg: TreeArt | null; bg: TreeArt | null; mid: TreeArt[] } = { key: '', fg: null, bg: null, mid: [] };

	// tree.ts sizes its trees in fixed px. Generate in CSS px (segments are
	// stored as fractions of W, H, so they scale up) and widen the limbs by dpr;
	// before this the phone's foreground tree was half the size of the far ones.
	const byDpr = (t: TreeSegment[]) => t.map((s) => ({ ...s, thick: s.thick * dpr }));
	function fgTreeFor(tgf: number): TreeSegment[] { return byDpr(generateFgTree(W / dpr, H / dpr, horizonY / dpr, tgf)); }
	function bgTreeFor(tgf: number): TreeSegment[] { return byDpr(generateBgTree(W / dpr, H / dpr, horizonY / dpr, tgf)); }

	function segsFromTree(t: TreeSegment[]): Seg[] {
		return t.map((s) => ({ x1: s.x1f * W, y1: s.y1f * H, x2: s.x2f * W, y2: s.y2f * H, thick: s.thick }));
	}
	// tree.ts grows the foreground tree on the horizon; scale it about its
	// base and set it down at its own depth. Applied at bake, so the cached
	// segments stay as tree.ts made them.
	function fgSegs(): Seg[] {
		const k = depthK(fgYf()), gx = W * 0.28, bx = fgBaseX(), by = fgBaseY();
		const px = (x: number) => bx + (x - gx) * k, py = (y: number) => by - (horizonY - y) * k;
		return segsFromTree(fgTreeSegs).map((s) => ({ x1: px(s.x1), y1: py(s.y1), x2: px(s.x2), y2: py(s.y2), thick: s.thick * k }));
	}

	// A light change (each degree of sun) re-bakes one tree per frame and swaps
	// them in together; ~100 ms in one frame on a throttled phone hitched.
	// A geometry change (resize, growth, first load) bakes all at once.
	let treePending: { key: string; jobs: (() => void)[]; next: typeof treeCache; frame: number } | null = null;

	function treeArts(altDeg: number, sxn: number): typeof treeCache {
		const doy = dayOfYear(new Date());
		const geom = `${W}x${H}|${gardenAgeUnits}|${fgTreeSegs.length}|${bgTreeSegs.length}`;
		const key = `${geom}|${Math.round(altDeg)}|${Math.round(sxn * 40)}|${doy}`;
		if (treeCache.key === key) return treeCache;
		if (treePending?.key !== key) {
			const next: typeof treeCache = { key, fg: null, bg: null, mid: [] };
			treePending = { key, jobs: treeJobs(altDeg, sxn, doy, next), next, frame: -1 };
		}
		const P = treePending;
		if (!treeCache.key.startsWith(geom + '|')) {
			for (const j of P.jobs) j();
			P.jobs = [];
		} else if (P.frame !== frameCount) {
			P.frame = frameCount;     // several draws call this per frame; one job per frame
			P.jobs.shift()?.();
		}
		if (P.jobs.length) return treeCache;
		treeCache = P.next;
		treePending = null;
		return treeCache;
	}

	function treeJobs(altDeg: number, sxn: number, doy: number, next: typeof treeCache): (() => void)[] {
		const dl     = clamp01((altDeg + 6) / 12);
		const golden = altDeg > -4 ? clamp01(1 - Math.abs(altDeg - 3) / 9) : 0;
		const L = {
			sunDx:  0,
			sunCol: dimSun(lerpRGB([255, 246, 228], [255, 170, 96], golden)),
			dl,
			night:  [14, 17, 24] as RGB,
			warm:   golden,
		};
		const sunX = sxn * W;
		const leaf = cottonwoodFoliage(doy);
		const bake = (segs: Seg[], cell: number, seed: number) => {
			const xs = segs.length ? segs[0].x1 : 0;
			const clumps = clumpsFromTips(segs, cell, 1.8, 1);
			return renderTreeArt(segs, clumps, leaf, { ...L, sunDx: sunX < xs ? -1 : 1 }, seed);
		};
		const jobs: (() => void)[] = [
			() => { next.fg = fgTreeSegs.length ? bake(fgSegs(), 12 * dpr * depthK(fgYf()), 101) : null; },
			() => { next.bg = bgTreeSegs.length ? bake(segsFromTree(bgTreeSegs), 15 * dpr, 211) : null; },
		];
		MIDGROUND.forEach((m, i) => jobs.push(() => {
			const gf = treeGrowthFactor(Math.max(0, gardenAgeUnits + m.bornAgo));
			const x = m.xf * W, h = Math.max(12, m.h * gf * dpr * depthK(m.yf)), gy = groundY(m.yf);
			const seed = Math.floor(m.xf * 0x7FFFFFFF);
			const shape = m.kind === 'pine' ? pineShape(x, gy, h, seed)
			            : m.kind === 'juniper' ? juniperShape(x, gy, h, seed)
			            : broadleafShape(x, gy, h, seed);
			const f = m.kind === 'pine' ? PINE_FOLIAGE : m.kind === 'juniper' ? JUNIPER_FOLIAGE : leaf;
			next.mid[i] = renderTreeArt(shape.segs, shape.clumps, f, { ...L, sunDx: sunX < x ? -1 : 1 }, seed + i);
		}));
		return jobs;
	}

	function drawMidgroundTrees(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number, windPx: number): void {
		const arts = treeArts(altDeg, sxn).mid;
		ctx.save();
		ctx.globalAlpha = 0.92;
		for (const a of arts) drawTreeArt(ctx, a, windPx * 0.4);
		ctx.restore();
	}

	// ── draw: background tree (space colonization) ────────────────────────────
	// Far right at 58% scale, behind the midground trees.
	function drawBgTree(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number, windPx: number): void {
		const art = treeArts(altDeg, sxn).bg;
		if (!art) return;
		const bgBaseX = W * 0.86, bgScale = 0.58;
		ctx.save();
		ctx.translate(bgBaseX, horizonY);
		ctx.scale(bgScale, bgScale);
		ctx.translate(-W * 0.28, -horizonY);
		ctx.globalAlpha = 0.75;
		drawTreeArt(ctx, art, windPx * 0.5);
		ctx.restore();
	}

	// ── draw: tree shadow pool ────────────────────────────────────────────────
	// Soft radial ellipse at the foreground tree base — anchors it to the ground.
	function drawTreeShadow(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const sunFactor = Math.max(0, Math.min(1, (altDeg + 4) / 20));
		if (sunFactor < 0.04) return;

		const bx = fgBaseX();
		const by = fgBaseY();
		const rx = Math.max(40, 70 * (W / 1200)) * depthK(fgYf());
		const ry = rx * 0.20;

		const g = ctx.createRadialGradient(bx, by, 0, bx, by, rx);
		g.addColorStop(0,   `rgba(0,0,0,${(0.30 * sunFactor).toFixed(3)})`);
		g.addColorStop(0.45, `rgba(0,0,0,${(0.12 * sunFactor).toFixed(3)})`);
		g.addColorStop(1,   'rgba(0,0,0,0)');

		ctx.save();
		ctx.scale(1, ry / rx);
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.ellipse(bx, by * (rx / ry), rx, rx, 0, 0, Math.PI * 2);
		ctx.fill();
		ctx.restore();
	}

	// ── draw: sun ─────────────────────────────────────────────────────────────
	function drawSun(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		if (altDeg <= -8) return;
		const sunX    = sxn * W;
		const sinAlt  = Math.max(0, Math.sin(altDeg * Math.PI / 180));
		const sunY    = horizonY - sinAlt * horizonY * 0.92;
		const isGolden = altDeg < 12;
		ctx.save();
		ctx.globalAlpha = 1 - 0.75 * weather.cover;   // behind overcast, a pale disc

		// Glow
		const glowR     = isGolden ? Math.min(W * 0.35, 260) : 90;
		const glowAlpha = isGolden ? 0.42 : 0.12;
		const glowRGB: RGB = isGolden ? [255, 160, 60] : [255, 245, 200];
		const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
		glow.addColorStop(0,   css(glowRGB, glowAlpha));
		glow.addColorStop(0.4, css(glowRGB, glowAlpha * 0.3));
		glow.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.fillStyle = glow;
		ctx.fillRect(0, 0, W, H);
		ctx.restore();

		// Disc
		ctx.beginPath();
		ctx.arc(sunX, sunY, isGolden ? 18 : 10, 0, Math.PI * 2);
		ctx.fillStyle = isGolden ? '#FF7020' : '#FFFDE7';
		ctx.fill();

		// Horizon glow band (golden hour) — radial gradient centred on sun at horizon
		// so it fades in all directions with no hard rectangular edge.
		if (isGolden && altDeg > -5) {
			const intensity = Math.max(0, 1 - Math.max(0, altDeg) / 12);
			const r = W * 0.72;
			const bg = ctx.createRadialGradient(sunX, horizonY, 0, sunX, horizonY, r);
			bg.addColorStop(0,    `rgba(255,140,0,${(intensity * 0.40).toFixed(3)})`);
			bg.addColorStop(0.35, `rgba(255,100,0,${(intensity * 0.22).toFixed(3)})`);
			bg.addColorStop(1,    'rgba(255,80,0,0)');
			ctx.save();
			ctx.globalCompositeOperation = 'screen';
			ctx.fillStyle = bg;
			ctx.fillRect(0, 0, W, H);
			ctx.restore();
		}
		ctx.restore();
	}

	// ── draw: Belt of Venus ────────────────────────────────────────────────────
	function drawBeltOfVenus(ctx: CanvasRenderingContext2D, altDeg: number): void {
		if (altDeg >= -1 || altDeg < -6) return;
		const frac = Math.abs(altDeg + 1) / 5;

		// Earth's shadow (dark blue strip at horizon)
		const shadow = ctx.createLinearGradient(0, horizonY - 20, 0, horizonY + 60);
		shadow.addColorStop(0,   'rgba(0,0,0,0)');
		shadow.addColorStop(0.5, `rgba(38,48,88,${(frac * 0.38).toFixed(3)})`);
		shadow.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = shadow;
		ctx.fillRect(0, horizonY - 20, W, 80);

		// Pink belt just above the shadow
		const belt = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY - 8);
		belt.addColorStop(0,   'rgba(0,0,0,0)');
		belt.addColorStop(0.5, `rgba(255,180,192,${(frac * 0.28).toFixed(3)})`);
		belt.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = belt;
		ctx.fillRect(0, horizonY - 60, W, 52);
	}

	// ── draw: cirrus ───────────────────────────────────────────────────────────
	// High-altitude ice-crystal streaks rendered as tapered quadratic bezier strands.
	// Multiple overlapping passes per strand give a soft, feathered edge.
	function drawCirrus(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const alphaBase = Math.max(0, Math.min(1, (altDeg + 8) / 6));
		if (alphaBase <= 0) return;

		const minutesSinceEpoch = Date.now() / 60000;
		const { top } = getCloudColors(altDeg);
		const colorKey = quantizeColorKey(top, top);

		ctx.save();
		ctx.globalAlpha = alphaBase;
		for (const c of cirrus) {
			if (!c.cache || c.cacheColorKey !== colorKey) {
				c.cache = renderNoiseCirrus(c.width * 1.4, c.prngseed, top, Math.min(1, c.alpha * 1.6));
				c.cacheColorKey = colorKey;
			}
			const rawX = (c.xFrac * W + minutesSinceEpoch * c.speed) % (W + c.width * 2);
			ctx.save();
			ctx.translate(rawX - c.width, c.yFrac * horizonY);
			ctx.rotate(c.angle);
			ctx.drawImage(c.cache, -c.cache.width / 2, -c.cache.height / 2);
			ctx.restore();
		}
		ctx.restore();
	}

	// ── draw: clouds ───────────────────────────────────────────────────────────
	// Noise-density clouds lit from the sun's side (detail.ts, 2026-10-22).
	// Perspective is baked in via aspectRatio: near-horizon slivers, overhead domes.
	function drawClouds(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const cloudAlpha = Math.max(0, Math.min(1, (altDeg + 14) / 6));
		if (cloudAlpha <= 0) return;

		const minutesSinceEpoch = Date.now() / 60000;
		const { top, shadow } = getCloudColors(altDeg);
		const sunSide  = sxn < 0.5 ? -1 : 1;
		const colorKey = quantizeColorKey(top, shadow) + sunSide + ':' + Math.round(altDeg);

		// One bake per frame (~70 ms on a slow phone): stale clouds keep their
		// old colours a moment longer, new ones appear a frame apart.
		let budget = 1;
		ctx.save();
		for (const cloud of clouds) {
			const { a: life, k } = cloudLife(cloud, minutesSinceEpoch);
			if ((!cloud.cache || cloud.cacheColorKey !== colorKey) && budget > 0) {
				budget--;
				// Bake at most ~200 px across and scale up when drawn: clouds are soft,
				// and full size cost 140 ms per cumulus, 870 ms per overcast sheet on a
				// 4×-throttled phone (2026-10-22).
				const q = Math.min(0.55, 200 / cloud.size);
				const r = renderNoiseCloud(cloud.size * q, cloud.aspectRatio, cloud.prngseed, cloud.grey ? lerpRGB(top, shadow, 0.55) : top, shadow, sunSide, 1, cloud.haze, altDeg);
				cloud.cache = { ...r, w: r.w / q, h: r.h / q, baseY: r.baseY / q };
				cloud.cacheColorKey = colorKey;
			}
			if (!cloud.cache) continue;
			if (life <= 0) continue;
			const { canvas: img } = cloud.cache;
			const baseY = cloud.cache.baseY * k, w = cloud.cache.w * k, h = cloud.cache.h * k;
			const rawX = driftX(cloud, minutesSinceEpoch);
			let skyY = cloud.yFrac * horizonY * 0.84;     // base sits at this y in main canvas
			skyY = Math.max(skyY, NAV_CLEAR * dpr + baseY * cloud.squash);   // keep the top out from behind the nav bar
			ctx.globalAlpha = Math.min(1, 0.3 + cloud.alpha) * cloudAlpha * life;   // cores read opaque; edges stay soft in the bake
			ctx.drawImage(img, rawX - w / 2, skyY - baseY * cloud.squash, w, h * cloud.squash);
		}
		ctx.restore();
	}

	// ── cursor tracking ────────────────────────────────────────────────────────
	let rawMouseX  = -9999;
	let rawMouseY  = -9999;
	let smMouseX   = -9999;
	let smMouseY   = -9999;
	let cursorActive = false;
	let cursorTimeout = 0;

	function onMouseMove(e: MouseEvent): void {
		rawMouseX = e.clientX * dpr;
		rawMouseY = e.clientY * dpr;
		cursorActive = true;
		clearTimeout(cursorTimeout);
		cursorTimeout = window.setTimeout(() => { cursorActive = false; }, 2000);
		// Show seed cursor when admin is hovering over the foreground tree area
		if (canvas && adminState.active && !isUnlockDay()) {
			const px = e.clientX * dpr;
			const py = e.clientY * dpr;
			const near = Math.abs(px - fgBaseX()) < 200 * dpr && py > fgBaseY() - treeGrowthFactor(gardenAgeUnits) * 300 * dpr && py < fgBaseY() + 20;
			canvas.style.cursor = near ? 'cell' : '';
		} else if (canvas) {
			canvas.style.cursor = '';
		}
	}

	// ── admin: seed the foreground tree ────────────────────────────────────────
	// Each click injects 365 age units (≈ 1 yr equivalent) and regenerates the
	// foreground tree immediately. Locked off permanently after 2095.
	function onCanvasClick(e: MouseEvent): void {
		if (!adminState.active || isUnlockDay()) return;
		const px = e.clientX * dpr;
		const py = e.clientY * dpr;
		// Hit-test: rough bounding area of the foreground tree
		const trunkH = Math.min(horizonY * 0.44, 195 * dpr) * treeGrowthFactor(gardenAgeUnits) * depthK(fgYf());
		if (Math.abs(px - fgBaseX()) > 260 * dpr || py > fgBaseY() + 20 || py < fgBaseY() - trunkH - 240 * dpr) return;
		addAgeUnits(365);
		gardenAgeUnits += 365;
		const tgf = treeGrowthFactor(gardenAgeUnits);
		clearFgTreeCache();
		fgTreeSegs = fgTreeFor(tgf);
		saveFgTreeToCache(fgTreeSegs, W, H, tgf);
		toast.success(`+1 yr of growth · tree age ${Math.round(gardenAgeUnits / 365.25)} yr`);
	}

	function onTouchMove(e: TouchEvent): void {
		const t = e.touches[0];
		rawMouseX = t.clientX * dpr;
		rawMouseY = t.clientY * dpr;
		cursorActive = true;
		clearTimeout(cursorTimeout);
		cursorTimeout = window.setTimeout(() => { cursorActive = false; }, 2000);
	}

	// ── main loop ─────────────────────────────────────────────────────────────
	let animFrame  = 0;
	let frameCount = 0;
	let lastStamp  = 0;

	function draw(timestamp: DOMHighResTimeStamp = 0): void {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		frameCount++;
		const now     = new Date();
		const altDeg  = sunAltitudeDeg(now);
		const sxn     = sunXNorm(now, 39.53);
		const isNight = altDeg < -8;

		// Day: draw at ~4fps (every 15 frames). Night: draw at ~30fps (every 2 frames).
		// Boost to every frame when cursor is active so interaction feels responsive.
		const skip = cursorActive ? 1 : isNight ? 2 : 15;
		if (frameCount % skip !== 0) {
			animFrame = requestAnimationFrame(draw);
			return;
		}

		const time = timestamp / 1000;
		const dt   = lastStamp > 0 ? Math.min((timestamp - lastStamp) / 1000, 0.1) : 0.016;
		lastStamp  = timestamp;

		// Smooth cursor (exponential lerp, ~12 frame lag)
		const alpha = 1 - Math.pow(0.75, dt * 60);
		smMouseX = smMouseX < -9000 ? rawMouseX : smMouseX + (rawMouseX - smMouseX) * alpha;
		smMouseY = smMouseY < -9000 ? rawMouseY : smMouseY + (rawMouseY - smMouseY) * alpha;

		// Wind: slow noise-driven oscillation (degrees/s²)
		// groundBand matches buildScene so depth attenuation is consistent.
		const windForce  = noise1D(time / 6) * 28;
		const groundBand = (H - horizonY) * 0.65;
		tickWind(bgPlants, windForce, dt, horizonY, groundBand);
		tickWind(fgPlants, windForce, dt, horizonY, groundBand);
		if (cursorActive) {
			applyMouseForce(bgPlants, smMouseX, smMouseY, horizonY, groundBand);
			applyMouseForce(fgPlants, smMouseX, smMouseY, horizonY, groundBand);
		}

		ctx.clearRect(0, 0, W, H);

		if (now.toDateString() !== weatherDay) buildClouds();
		drawSky(ctx, altDeg);
		if (weather.cover > 0.3) {
			// An overcast sky is greyed toward the cloud shadow colour.
			const { shadow } = getCloudColors(altDeg);
			ctx.fillStyle = css(lerpRGB(shadow, [196, 198, 204], clamp01((altDeg + 2) / 14)), 0.9 * weather.cover);
			ctx.fillRect(0, 0, W, horizonY);
		}
		drawStars(ctx, altDeg, time);
		drawMoon(ctx, altDeg, sxn);
		drawCircumsolarGlow(ctx, altDeg, sxn);
		drawSun(ctx, altDeg, sxn);
		drawCrepuscularRays(ctx, altDeg, sxn);
		drawBeltOfVenus(ctx, altDeg);
		drawPurpleLight(ctx, altDeg, sxn);
		drawGround(ctx, altDeg);
		drawGroundContours(ctx, altDeg);
		drawTerrain(ctx, altDeg, sxn);
		drawMeadow(ctx);
		drawCloudShadows(ctx, altDeg, sxn);
		const windPx = (noise1D(time / 6) - 0.5) * 6 * dpr;
		drawBgTree(ctx, altDeg, sxn, windPx);            // space-colonization cottonwood — far right background
		drawMidgroundTrees(ctx, altDeg, sxn, windPx);
		drawHorizonBlend(ctx, altDeg);
		drawPlants(ctx, bgPlants, horizonY, H, tuftLight(altDeg), plantGreen);   // far grass — behind tree
		drawCirrus(ctx, altDeg);
		drawClouds(ctx, altDeg, sxn);
		drawTreeCastShadow(ctx, altDeg, sxn);
		drawTreeShadow(ctx, altDeg);
		const fgArt = treeArts(altDeg, sxn).fg;
		if (fgArt) {
			// Seeded trunk lean — rotate the whole tree around its base
			const bx = fgBaseX();
			ctx.save();
			ctx.translate(bx, fgBaseY());
			ctx.rotate(treeLeanAngle);
			ctx.translate(-bx, -fgBaseY());
			drawTreeArt(ctx, fgArt, windPx);
			ctx.restore();
		}
		drawPlants(ctx, fgPlants, horizonY, H, tuftLight(altDeg), plantGreen);   // near grass — in front of everything
		drawGrain(ctx);
		drawVignette(ctx);
		saveAverage(timestamp);

		animFrame = requestAnimationFrame(draw);
	}

	// The scene's average colour, for app.html to paint before anything mounts,
	// so a reload opens on the garden's colour rather than the default theme.
	let avgCanvas: HTMLCanvasElement | null = null;
	let lastAvgAt = -1e9;
	function saveAverage(timestamp: number): void {
		if (!canvas || !terrain || timestamp - lastAvgAt < 20_000) return;
		lastAvgAt = timestamp;
		avgCanvas ??= Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
		const a = avgCanvas.getContext('2d', { willReadFrequently: true })!;
		a.drawImage(canvas, 0, 0, 16, 16);
		const d = a.getImageData(0, 0, 16, 16).data;
		const sum = [0, 0, 0];
		for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
		const rgb = sum.map((v) => Math.round(v / 256));
		try { localStorage.setItem('cwc-paint-bg', JSON.stringify({ at: Date.now(), rgb })); } catch { /* ignore */ }
	}

	function resize(): void {
		if (!canvas) return;
		dpr = window.devicePixelRatio || 1;
		// Work in physical pixels: innerWidth * dpr stays constant across zoom levels,
		// so browser zoom no longer triggers a scene rebuild or repositions elements.
		const newW = Math.round(window.innerWidth * dpr);
		const newH = Math.round(window.innerHeight * dpr);
		if (newW === W && newH === H) return;   // zoom-only event — nothing to do
		const prevW = W, prevH = H;
		W = canvas.width  = newW;
		H = canvas.height = newH;
		horizonY = H * HORIZON_FRAC;
		buildScene(W, H, horizonY);
		if (Math.abs(W - prevW) > 4 || Math.abs(H - prevH) > 4) {
			const tgf = treeGrowthFactor(gardenAgeUnits);
			fgTreeSegs = fgTreeFor(tgf);
			saveFgTreeToCache(fgTreeSegs, W, H, tgf);
			bgTreeSegs = bgTreeFor(tgf);
			saveBgTreeToCache(bgTreeSegs, W, H, tgf);
		}
	}

	onMount(() => {
		dpr = window.devicePixelRatio || 1;
		W = canvas!.width  = Math.round(window.innerWidth * dpr);
		H = canvas!.height = Math.round(window.innerHeight * dpr);
		horizonY = H * HORIZON_FRAC;

		// Load persistent garden state, credit visit, accrue days offline
		const gs = loadGardenState();
		accrueElapsedDays(gs);
		creditVisit(gs);
		saveGardenState(gs);
		gardenAgeUnits = gs.ageUnits;
		// Seeded lean — stable per visitor, changes only if they reset localStorage
		treeLeanAngle = (makePRNG(gs.seed)() - 0.5) * 0.14; // ±4° windward lean

		buildScene(W, H, horizonY);
		loadTerrain(`${base}/garden`).then((t) => { terrain = t; }).catch(() => {});   // noise ranges stay if it fails

		animFrame = requestAnimationFrame(draw);
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('touchmove', onTouchMove, { passive: true });
		canvas!.addEventListener('click', onCanvasClick);

		// Load / generate both trees. Foreground (recursive) is fast; background
		// (space colonization) is deferred 80ms so the first frame paints first.
		const tgf     = treeGrowthFactor(gardenAgeUnits);
		const fgCache = loadFgTreeFromCache(W, H, tgf);
		fgTreeSegs    = fgCache ?? fgTreeFor(tgf);
		if (!fgCache) saveFgTreeToCache(fgTreeSegs, W, H, tgf);

		const bgCache = loadBgTreeFromCache(W, H, tgf);
		if (bgCache) {
			bgTreeSegs = bgCache;
		} else {
			setTimeout(() => {
				bgTreeSegs = bgTreeFor(tgf);
				saveBgTreeToCache(bgTreeSegs, W, H, tgf);
			}, 80);
		}

		return () => {
			cancelAnimationFrame(animFrame);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('touchmove', onTouchMove);
			canvas?.removeEventListener('click', onCanvasClick);
			clearTimeout(cursorTimeout);
		};
	});
</script>

<!-- The nature scene, restored 2026-10-21 from garden-archive (removed in 04176ba).
     Drawing only: Sky.svelte still owns the glass and text colours. -->
<canvas bind:this={canvas} class="garden-bg" aria-hidden="true"></canvas>

<style>
	.garden-bg {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
		display: block;
	}
</style>
