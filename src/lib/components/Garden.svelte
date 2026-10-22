<script lang="ts">
	import { onMount } from 'svelte';
	import { makeGrassTuft, makeFern, tickWind, drawPlants, applyMouseForce, type PlantInstance } from '$lib/garden/plants';
	import { generateFgTree, loadFgTreeFromCache, saveFgTreeToCache, clearFgTreeCache, generateBgTree, loadBgTreeFromCache, saveBgTreeToCache, drawTree, drawLeaves, type TreeSegment } from '$lib/garden/tree';
	import { loadGardenState, saveGardenState, creditVisit, accrueElapsedDays, growthFactor, treeGrowthFactor, addAgeUnits } from '$lib/garden/state';
	import { adminState } from '$lib/admin/state.svelte';
	import { isUnlockDay } from '$lib/admin/tlock';
	import { toast } from '$lib/admin/toast.svelte';
	import { renderMeadow, renderRange, renderNoiseCloud, renderNoiseCirrus, makeGrainTile } from '$lib/garden/detail';

	// ── constants ─────────────────────────────────────────────────────────────
	const HORIZON_FRAC = 0.68;   // horizon at 68% down canvas
	const STAR_COUNT   = 700;
	const CLOUD_COUNT  = 7;

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
	function dayOfYear(d: Date): number {
		return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
	}

	function sunAltitudeDeg(date: Date): number {
		const rad = Math.PI / 180;
		const doy = dayOfYear(date);
		const decl = 23.45 * Math.sin(rad * (360 / 365) * (doy - 81));
		const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
		const ha   = 15 * (hour - 12);
		const lat  = 39.53 * rad;  // Reno, NV
		const sinAlt =
			Math.sin(lat) * Math.sin(decl * rad) +
			Math.cos(lat) * Math.cos(decl * rad) * Math.cos(ha * rad);
		return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad;
	}

	// sunrise → right (1.0), noon → center (~0.5), sunset → left (0.0)
	// Uses real sunrise/sunset hour angles from declination and latitude.
	function sunXNorm(date: Date, lat: number): number {
		const rad  = Math.PI / 180;
		const doy  = dayOfYear(date);
		const decl = 23.45 * Math.sin(rad * (360 / 365) * (doy - 81));
		const cosH0 = Math.max(-1, Math.min(1, -Math.tan(lat * rad) * Math.tan(decl * rad)));
		const H0_hours = Math.acos(cosH0) * 12 / Math.PI;
		const sunrise = 12 - H0_hours;
		const sunset  = 12 + H0_hours;
		const hour = date.getHours() + date.getMinutes() / 60;
		return Math.max(0, Math.min(1, 1 - (hour - sunrise) / (sunset - sunrise)));
	}

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
		{ alt:   0, top: [255, 140,  70] as RGB, shadow: [165,  72, 128] as RGB },  // sunset: orange top, magenta shadow
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
		prngseed:      number;
		speed:         number;   // px / minute
		cache:         { canvas: HTMLCanvasElement; baseY: number; w: number; h: number } | null;
		cacheColorKey: string;
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

		const crng = makePRNG(0xC10DE00F);
		clouds = [];
		for (let i = 0; i < CLOUD_COUNT; i++) {
			const xFrac  = crng();
			const yFrac  = 0.05 + crng() * 0.33;  // 0 = high, 0.38 = near horizon

			// Perspective: clouds high in sky are taller + more opaque.
			// perspFrac = 1 overhead, 0 near horizon.
			const perspFrac  = 1 - yFrac / 0.38;
			const size       = (110 + crng() * 130) * (0.50 + perspFrac * 0.50);
			const aspectRatio = 0.20 + perspFrac * 0.32;   // 0.20 modest sliver → 0.52 tall dome
			const alpha      = (0.52 + crng() * 0.32) * (0.38 + perspFrac * 0.62);
			const prngseed   = Math.floor(crng() * 0x7FFFFFFF);
			const speed      = 6 + crng() * 16;
			clouds.push({
				xFrac, yFrac, size, aspectRatio, alpha, prngseed, speed,
				cache:         null,
				cacheColorKey: '',
			});
		}

		const cirrng = makePRNG(0xC19C1991);
		cirrus = [];
		for (let i = 0; i < 6; i++) {
			cirrus.push({
				xFrac:    cirrng(),
				yFrac:    0.03 + cirrng() * 0.15,
				width:    130 + cirrng() * 220,
				angle:    (cirrng() - 0.5) * 0.28,
				alpha:    0.22 + cirrng() * 0.30,
				prngseed: Math.floor(cirrng() * 0x7FFFFFFF),
				speed:    2 + cirrng() * 5,
				cache:    null,
				cacheColorKey: '',
			});
		}

		buildRangeHeights();
		rangeCache = { key: '', layers: [] };
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

		// Grass — 85 total, weighted toward the foreground but with a healthy far population
		for (let i = 0; i < 85; i++) {
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

		// Ferns — 14 total, kept off the very horizon
		for (let i = 0; i < 14; i++) {
			const yFrac  = Math.pow(prng(), 1.2) * 0.78 + 0.06;
			const x      = prng() * cw;
			const y      = hy + yFrac * groundBand;
			const bornAt = prng() * 6000;
			const scale  = growthFactor(Math.max(0, gardenAgeUnits - bornAt));
			const depth  = 0.431 / (1.233 - yFrac);
			const h      = (50 + prng() * 50) * scale * depth;
			const seed   = Math.floor(prng() * 0x7FFFFFFF);
			const plant  = makeFern(x, y, h, seed);
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
	// Four ranges far to near, then the hills (2026-10-22). Each range is mixed
	// toward the horizon sky by 1 − e^(−βd), so distance reads as haze the way it
	// does outdoors, and slopes facing the sun take its colour. Ranges render
	// offscreen and rebuild only when the sun moves about a degree. The two
	// original silhouettes (seeds 2.3 and 5.7) are kept.
	const RANGES = [
		{ seed: 11.7, freq: 2.0, h: 0.30, ridged: true,  dist: 1.00, snow: true  },
		{ seed: 2.3,  freq: 3.5, h: 0.20, ridged: true,  dist: 0.50, snow: true  },
		{ seed: 5.7,  freq: 3.5, h: 0.26, ridged: true,  dist: 0.24, snow: false },
		{ seed: 9.4,  freq: 6.0, h: 0.07, ridged: false, dist: 0.18, snow: false },
	];
	let rangeHeights: Float32Array[] = [];
	let rangeCache: { key: string; layers: { canvas: HTMLCanvasElement; top: number }[] } = { key: '', layers: [] };

	function buildRangeHeights(): void {
		rangeHeights = RANGES.map((r) => {
			const a = new Float32Array(W);
			for (let x = 0; x < W; x++) {
				const n = r.ridged ? ridged1D((x / W) * r.freq + r.seed) : fbm1D((x / W) * r.freq + r.seed);
				a[x] = n * horizonY * r.h;
			}
			return a;
		});
	}

	const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

	function drawTerrain(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const dl     = clamp01((altDeg + 8) / 16);                       // 0 night → 1 day
		const golden = altDeg > -4 ? clamp01(1 - Math.abs(altDeg - 3) / 9) : 0;
		const { horizon, zenith } = getSkyColors(altDeg);

		const key = `${W}x${H}|${Math.round(altDeg)}|${Math.round(sxn * 40)}`;
		if (rangeCache.key !== key) {
			const rock: RGB = dl < 0.5 ? lerpRGB([14, 18, 35], [104, 90, 112], dl * 2) : lerpRGB([104, 90, 112], [126, 116, 102], (dl - 0.5) * 2);
			const sunCol: RGB = lerpRGB([255, 244, 220], [255, 168, 92], golden);
			const beta = 0.3 + 0.75 * dl;
			const month = new Date().getMonth();
			const snowy = month >= 10 || month <= 4;                         // Nov–May on the Sierra
			rangeCache = {
				key,
				layers: RANGES.map((r, i) => renderRange(W, horizonY + 2, rangeHeights[i], {
					base:   rock,
					lit:    lerpRGB(rock, sunCol, dl * (0.45 + 0.35 * golden)),
					shade:  lerpRGB(rock, lerpRGB(zenith, [0, 0, 0], 0.5), 0.35 * dl),
					fog:    horizon,
					fogAmt: 1 - Math.exp(-beta * r.dist),
					sunX:   sxn * W,
					snow:   snowy && r.snow ? lerpRGB([30, 34, 52], [236, 238, 244], dl) : null,
				})),
			};
		}
		for (const l of rangeCache.layers) ctx.drawImage(l.canvas, 0, l.top);

		// Rolling hills, filled to the bottom: this is the ground the meadow multiplies over.
		const hill: RGB = dl < 0.5 ? lerpRGB([6, 8, 16], [52, 54, 40], dl * 2) : lerpRGB([52, 54, 40], [150, 148, 98], (dl - 0.5) * 2);
		const warm = lerpRGB(hill, [190, 140, 80], golden * 0.25);
		fillHillRange(ctx, 8.1, horizonY * 0.14, css(warm), horizon, (1 - Math.exp(-(0.3 + 0.75 * dl) * 0.08)));
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
	function drawCloudShadows(ctx: CanvasRenderingContext2D, altDeg: number, sxn: number): void {
		const sun = clamp01((altDeg - 2) / 12);
		if (sun < 0.02) return;
		const minutes = Date.now() / 60000;
		const sunX = sxn * W;
		ctx.save();
		ctx.beginPath(); ctx.rect(0, horizonY, W, H - horizonY); ctx.clip();
		for (const cloud of clouds) {
			const w    = cloud.cache?.w ?? cloud.size;
			const cx   = (cloud.xFrac * W + minutes * cloud.speed) % (W + w);
			const near = clamp01(1 - cloud.yFrac / 0.38);
			const gx   = cx + (cx - sunX) * 0.15;
			const gy   = horizonY + (0.12 + 0.8 * near) * (H - horizonY);
			const rx   = cloud.size * (0.7 + 0.9 * near);
			const ry   = rx * (0.10 + 0.12 * near);
			const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
			g.addColorStop(0,   `rgba(10,16,30,${(0.24 * sun * cloud.alpha).toFixed(3)})`);
			g.addColorStop(0.6, `rgba(10,16,30,${(0.12 * sun * cloud.alpha).toFixed(3)})`);
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
		if (sunFactor < 0.03 || fgTreeSegs.length === 0) return;
		const bx = W * 0.28;
		const key = `${W}x${H}|${altDeg.toFixed(1)}|${Math.round(sxn * 100)}|${fgTreeSegs.length}|${gardenAgeUnits}`;
		if (shadowCache.key !== key) {
			const L    = Math.min(3.5, 1 / Math.tan(Math.max(4, altDeg) * Math.PI / 180));
			const fy   = 0.16 * L;                                   // ground foreshortening
			const away = Math.sign(bx - sxn * W) || 1;               // +1: sun on the left
			const m    = away * Math.min(1.4, 0.35 * L) * clamp01(Math.abs(sxn * W - bx) / (W * 0.4) + 0.2);
			const raw = document.createElement('canvas');
			raw.width = W; raw.height = H;
			const rctx = raw.getContext('2d')!;
			// (x, y) → (x + m·(hy − y), hy + fy·(hy − y))
			rctx.setTransform(1, 0, -m, -fy, m * horizonY, horizonY * (1 + fy));
			rctx.translate(bx, horizonY);
			rctx.rotate(treeLeanAngle);
			rctx.translate(-bx, -horizonY);
			drawTree(rctx, fgTreeSegs, W, H, '#000');
			drawLeaves(rctx, fgTreeSegs, W, H, '#000', 1);
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

	// ── draw: midground tree silhouettes ──────────────────────────────────────
	// Two species, four trees. Oak: wide decurrent crown, ±8° trunk lean,
	// scaffold branches at 42–64% trunk height. Maple: tighter dome, ±5° lean.
	// Both species draw a curved trunk (quadratic bezier) following the lean.
	function drawMidgroundTrees(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const isNight    = altDeg < -6;
		const isTwilight = !isNight && altDeg < 6;
		const clr = isNight    ? 'rgb(8,10,20)'
		          : isTwilight ? 'rgb(42,46,55)'
		          :              'rgb(55,68,38)';
		// Leaf cluster alpha — zero at night, fades in through civil twilight
		const leafAlpha = isNight ? 0 : Math.max(0, Math.min(1, (altDeg + 2) / 12));

		// Recursive deciduous crown. angle: math radians, π/2 = straight up.
		// spread0/spreadR: base + RNG range for split angle; ratio0/ratioR: length ratio.
		function branch(
			x: number, y: number,
			angle: number, length: number, thick: number,
			depth: number, rng: () => number,
			spread0 = 0.50, spreadR = 0.24, ratio0 = 0.67, ratioR = 0.08
		): void {
			if (depth <= 0 || length < 1.2) return;
			const x2 = x + Math.cos(angle) * length;
			const y2 = y - Math.sin(angle) * length;
			ctx.lineWidth = Math.max(0.3, thick);
			ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
			// Leaf cluster at terminal nodes
			if (depth <= 1 && leafAlpha > 0.01) {
				ctx.globalAlpha = 0.82 * leafAlpha * (0.25 + rng() * 0.25);
				ctx.beginPath(); ctx.arc(x2, y2, 4 + rng() * 4, 0, Math.PI * 2); ctx.fill();
				ctx.globalAlpha = 0.82;
			}
			const ratio  = ratio0 + rng() * ratioR;
			const spread = spread0 + rng() * spreadR;
			const bias   = (rng() - 0.5) * 0.22;
			branch(x2, y2, angle + spread + bias, length * ratio,        thick * 0.62, depth - 1, rng, spread0, spreadR, ratio0, ratioR);
			branch(x2, y2, angle - spread + bias, length * ratio * 0.94, thick * 0.60, depth - 1, rng, spread0, spreadR, ratio0, ratioR);
			// Occasional third shoot — mid-crown density
			if (depth >= 4 && rng() < 0.28)
				branch(x2, y2, angle + bias * 0.3, length * ratio * 0.72, thick * 0.50, depth - 2, rng, spread0, spreadR, ratio0, ratioR);
		}

		type Kind = 'oak' | 'maple';
		const specs: { xf: number; bornAgo: number; kind: Kind }[] = [
			{ xf: 0.49, bornAgo: 54750, kind: 'oak'   },  // +150yr — ancient spreading oak
			{ xf: 0.61, bornAgo: 10950, kind: 'maple' },  // +30yr  — mid-growth maple
			{ xf: 0.74, bornAgo: 0,     kind: 'oak'   },  // same age as site — oak
			{ xf: 0.85, bornAgo: -5475, kind: 'maple' },  // −15yr  — young maple
		];

		for (const spec of specs) {
			const gf  = treeGrowthFactor(Math.max(0, gardenAgeUnits + spec.bornAgo));
			const bx  = spec.xf * W;
			const by  = horizonY;
			const tw  = Math.max(0.8, 3.5 * gf);
			const rng = makePRNG(Math.floor(spec.xf * 0x7FFFFFFF));

			ctx.save();
			ctx.strokeStyle = clr;
			ctx.fillStyle   = clr;
			ctx.globalAlpha = 0.82;
			ctx.lineCap     = 'round';

			if (spec.kind === 'oak') {
				const trunkH    = 72 * gf;
				const leanAngle = (rng() - 0.5) * 0.14;  // ±8° — wind/phototropism lean
				const topX      = bx + Math.sin(leanAngle) * trunkH;
				const topY      = by - trunkH;
				// Bezier control point — trunk curves into the lean direction
				const cpX = bx + Math.sin(leanAngle) * trunkH * 0.45;
				const cpY = by - trunkH * 0.55;
				ctx.lineWidth = tw;
				ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpX, cpY, topX, topY); ctx.stroke();

				// Scaffold branches at ~45–65% trunk height — dominant side first
				const scaffT    = 0.42 + rng() * 0.22;
				const scaffX    = bx + Math.sin(leanAngle) * scaffT * trunkH;
				const scaffY    = by - scaffT * trunkH;
				const leanSign  = leanAngle >= 0 ? 1 : -1;
				const scaffLen  = trunkH * (0.38 + rng() * 0.12);
				branch(scaffX, scaffY, Math.PI / 2 + leanSign * (0.42 + rng() * 0.25), scaffLen, tw * 0.50, 5, rng);
				// Secondary scaffold on opposite side (smaller)
				if (rng() < 0.70)
					branch(scaffX, scaffY, Math.PI / 2 - leanSign * (0.36 + rng() * 0.20), scaffLen * 0.68, tw * 0.38, 4, rng);

				// Crown from trunk top — angle biased toward lean
				branch(topX, topY, Math.PI / 2 + leanAngle * 0.5, trunkH * 0.55, tw * 0.78, 8, rng);

			} else {
				// Maple: tighter dome, ±5° lean, compact spreading crown
				const trunkH    = 60 * gf;
				const leanAngle = (rng() - 0.5) * 0.09;  // ±5°
				const topX      = bx + Math.sin(leanAngle) * trunkH;
				const topY      = by - trunkH;
				const cpX = bx + Math.sin(leanAngle) * trunkH * 0.45;
				const cpY = by - trunkH * 0.55;
				ctx.lineWidth = tw;
				ctx.beginPath(); ctx.moveTo(bx, by); ctx.quadraticCurveTo(cpX, cpY, topX, topY); ctx.stroke();

				// One scaffold branch at ~55% height (only on mature trees)
				if (gf > 0.25 && rng() < 0.80) {
					const scaffT   = 0.48 + rng() * 0.18;
					const scaffX   = bx + Math.sin(leanAngle) * scaffT * trunkH;
					const scaffY   = by - scaffT * trunkH;
					const leanSign = leanAngle >= 0 ? 1 : -1;
					const scaffLen = trunkH * (0.30 + rng() * 0.10);
					branch(scaffX, scaffY, Math.PI / 2 + leanSign * (0.35 + rng() * 0.20), scaffLen, tw * 0.42, 4, rng, 0.28, 0.17, 0.73, 0.07);
				}

				// Crown — tighter spread (±16–26°), higher length ratio → dome shape
				branch(topX, topY, Math.PI / 2 + leanAngle * 0.5, trunkH * 0.58, tw * 0.75, 9, rng, 0.28, 0.17, 0.73, 0.07);
			}

			ctx.restore();
		}
	}

	// ── draw: background tree (space colonization silhouette) ─────────────────
	// Rendered far right at 60% scale, before midground trees so it sits behind
	// them. Uses hardcoded bark colors but globalAlpha drives night darkening.
	function drawBgTree(ctx: CanvasRenderingContext2D, altDeg: number): void {
		if (bgTreeSegs.length === 0) return;
		const dayness  = Math.max(0, Math.min(1, (altDeg + 2) / 14));
		const bgBaseX  = W * 0.86;
		const bgScale  = 0.58;
		const treeAlpha = Math.max(0.12, dayness * 0.42);
		const leafAlpha = dayness * 0.28;

		// Canvas transform: translate base from W*0.28 to bgBaseX, scale around base
		ctx.save();
		ctx.translate(bgBaseX - W * 0.28, 0);
		ctx.translate(W * 0.28, horizonY);
		ctx.scale(bgScale, bgScale);
		ctx.translate(-W * 0.28, -horizonY);
		ctx.globalAlpha = treeAlpha;
		drawTree(ctx, bgTreeSegs, W, H);
		if (leafAlpha > 0.01) drawLeaves(ctx, bgTreeSegs, W, H, 'rgb(52,68,34)', leafAlpha / bgScale);
		ctx.restore();
	}

	// ── draw: tree shadow pool ────────────────────────────────────────────────
	// Soft radial ellipse at the foreground tree base — anchors it to the ground.
	function drawTreeShadow(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const sunFactor = Math.max(0, Math.min(1, (altDeg + 4) / 20));
		if (sunFactor < 0.04) return;

		const bx = W * 0.28;
		const by = horizonY;
		const rx = Math.max(40, 70 * (W / 1200));
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
		const colorKey = quantizeColorKey(top, shadow) + sunSide;

		ctx.save();
		for (const cloud of clouds) {
			if (!cloud.cache || cloud.cacheColorKey !== colorKey) {
				cloud.cache = renderNoiseCloud(cloud.size, cloud.aspectRatio, cloud.prngseed, top, shadow, sunSide, 1);
				cloud.cacheColorKey = colorKey;
			}
			const { canvas: img, baseY, w, h } = cloud.cache;
			const rawX = (cloud.xFrac * W + minutesSinceEpoch * cloud.speed) % (W + w);
			const skyY = cloud.yFrac * horizonY * 0.84;   // base sits at this y in main canvas
			ctx.globalAlpha = cloud.alpha * cloudAlpha;
			ctx.drawImage(img, rawX - w / 2, skyY - baseY, w, h);
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
			const near = Math.abs(px - W * 0.28) < 200 && py > horizonY - treeGrowthFactor(gardenAgeUnits) * 220 && py < horizonY + 20;
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
		const trunkH = Math.min(horizonY * 0.44, 195) * treeGrowthFactor(gardenAgeUnits);
		if (Math.abs(px - W * 0.28) > 200 || py > horizonY + 20 || py < horizonY - trunkH - 180) return;
		addAgeUnits(365);
		gardenAgeUnits += 365;
		const tgf = treeGrowthFactor(gardenAgeUnits);
		clearFgTreeCache();
		fgTreeSegs = generateFgTree(W, H, horizonY, tgf);
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

		drawSky(ctx, altDeg);
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
		drawBgTree(ctx, altDeg);            // space-colonization silhouette — far right background
		drawMidgroundTrees(ctx, altDeg);
		drawHorizonBlend(ctx, altDeg);
		drawPlants(ctx, bgPlants, horizonY, H, 1 - clamp01((altDeg + 6) / 12));   // far grass — behind tree
		drawCirrus(ctx, altDeg);
		drawClouds(ctx, altDeg, sxn);
		drawTreeCastShadow(ctx, altDeg, sxn);
		drawTreeShadow(ctx, altDeg);
		if (fgTreeSegs.length > 0) {
			// Apply seeded trunk lean — rotate the whole tree around its base
			const bx       = W * 0.28;
			const tgf      = treeGrowthFactor(gardenAgeUnits);
			const dayness  = Math.max(0, Math.min(1, (altDeg + 2) / 14));
			const leafAlpha = tgf * dayness * 0.55;
			ctx.save();
			ctx.translate(bx, horizonY);
			ctx.rotate(treeLeanAngle);
			ctx.translate(-bx, -horizonY);
			// After sunset the tree goes to silhouette instead of keeping its daylight bark.
			drawTree(ctx, fgTreeSegs, W, H, altDeg < -2 ? css(lerpRGB([16, 18, 26], [60, 52, 46], clamp01((altDeg + 8) / 6))) : undefined);
			const golden = altDeg > -4 ? clamp01(1 - Math.abs(altDeg - 3) / 9) : 0;
			drawLeaves(ctx, fgTreeSegs, W, H, 'rgb(62,84,40)', leafAlpha, {
				dark:  'rgb(30,42,24)',
				light: css(lerpRGB([112, 134, 62], [196, 160, 78], golden)),
				sunDx: sxn * W < bx ? -1 : 1,
			});
			ctx.restore();
		}
		drawPlants(ctx, fgPlants, horizonY, H, 1 - clamp01((altDeg + 6) / 12));   // near grass — in front of everything
		drawGrain(ctx);
		drawVignette(ctx);

		animFrame = requestAnimationFrame(draw);
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
			fgTreeSegs = generateFgTree(W, H, horizonY, tgf);
			saveFgTreeToCache(fgTreeSegs, W, H, tgf);
			bgTreeSegs = generateBgTree(W, H, horizonY, tgf);
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

		animFrame = requestAnimationFrame(draw);
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('touchmove', onTouchMove, { passive: true });
		canvas!.addEventListener('click', onCanvasClick);

		// Load / generate both trees. Foreground (recursive) is fast; background
		// (space colonization) is deferred 80ms so the first frame paints first.
		const tgf     = treeGrowthFactor(gardenAgeUnits);
		const fgCache = loadFgTreeFromCache(W, H, tgf);
		fgTreeSegs    = fgCache ?? generateFgTree(W, H, horizonY, tgf);
		if (!fgCache) saveFgTreeToCache(fgTreeSegs, W, H, tgf);

		const bgCache = loadBgTreeFromCache(W, H, tgf);
		if (bgCache) {
			bgTreeSegs = bgCache;
		} else {
			setTimeout(() => {
				bgTreeSegs = generateBgTree(W, H, horizonY, tgf);
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
