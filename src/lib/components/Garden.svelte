<script lang="ts">
	import { onMount } from 'svelte';
	import { makeGrassTuft, makeFern, tickWind, drawPlants, applyMouseForce, type PlantInstance } from '$lib/garden/plants';
	import { generateTree, loadTreeFromCache, saveTreeToCache, drawTree, type TreeSegment } from '$lib/garden/tree';
	import { loadGardenState, saveGardenState, creditVisit, accrueElapsedDays, growthFactor, treeGrowthFactor } from '$lib/garden/state';
	import { themeState } from '$lib/admin/theme.svelte';

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
		cache:         HTMLCanvasElement | null;
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
	let treeSegments: TreeSegment[] = [];
	let gardenAgeUnits              = 11315;   // default; overwritten from localStorage on mount
	let W = 0, H = 0, horizonY = 0;
	let dpr = 1;   // devicePixelRatio — canvas works in physical pixels so zoom has no effect

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
			const aspectRatio = 0.10 + perspFrac * 0.34;   // 0.10 flat sliver → 0.44 tall dome
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
			});
		}

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
			const depth  = 0.35 + yFrac * 1.60;
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
			const depth  = 0.40 + yFrac * 1.40;
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
		const { zenith, mid, lower, horizon } = getSkyColors(altDeg);
		// Bright segment: the actual horizon line is slightly lighter than horizon color
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
		ctx.fillRect(0, 0, W, horizonY * 0.65);
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
	function drawTerrain(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const isTwilight = altDeg > -10 && altDeg < 12;
		const isNight    = altDeg < -14;

		// Aerial perspective haze: ramps from near-zero at night to ~0.36 at midday.
		// Each layer uses a fraction of hazeBase — far = most, hills = least.
		const hazeBase = isNight
			? 0.03
			: Math.max(0.06, Math.min(0.36, (altDeg + 8) / 28));
		const { horizon } = getSkyColors(altDeg);

		// Far mountains (most atmospheric haze — notably lighter base, heavy haze overlay)
		const farColor = isNight    ? 'rgba(14,18,35,0.78)'
		               : isTwilight ? 'rgba(112,98,120,0.75)'
		               :              'rgba(170,158,142,0.72)';
		fillMountainRange(ctx, 2.3, horizonY * 0.20, farColor, horizon, Math.min(0.95, hazeBase * 1.30));

		// Near mountains
		const nearColor = isNight    ? 'rgba(8,10,22,0.90)'
		                : isTwilight ? 'rgba(58,46,62,0.88)'
		                :              'rgba(95,82,62,0.88)';
		fillMountainRange(ctx, 5.7, horizonY * 0.26, nearColor, horizon, Math.min(0.72, hazeBase * 0.58));

		// Rolling hills (fBm — softer, greener)
		const hillColor = isNight    ? 'rgba(6,8,16,0.92)'
		                : isTwilight ? 'rgba(40,44,32,0.90)'
		                :              'rgba(70,82,46,0.88)';
		fillHillRange(ctx, 8.1, horizonY * 0.14, hillColor, horizon, hazeBase * 0.24);
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
	// Four trees at horizon depth — solid silhouettes (no branch detail at this scale).
	// Each has a distinct species and birth offset so they represent different growth arcs:
	//   round    — 30yr head start → visibly growing over the site's lifetime
	//   oak      — 150yr head start → always looks ancient, barely changes
	//   pine     — same age as garden → most dramatically growing (45%→85% over 69yr)
	//   columnar — 15yr younger → young sapling becoming a tall slender poplar
	function drawMidgroundTrees(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const isNight    = altDeg < -6;
		const isTwilight = !isNight && altDeg < 6;
		const clr = isNight    ? 'rgb(8,10,20)'
		          : isTwilight ? 'rgb(42,46,55)'
		          :              'rgb(55,68,38)';

		type Kind = 'oak' | 'pine' | 'round' | 'columnar';
		const specs: { xf: number; bornAgo: number; kind: Kind }[] = [
			{ xf: 0.49, bornAgo: 10950,  kind: 'round'    },  // +30yr
			{ xf: 0.58, bornAgo: 54750,  kind: 'oak'      },  // +150yr — ancient
			{ xf: 0.74, bornAgo: 0,      kind: 'pine'     },  // same age
			{ xf: 0.85, bornAgo: -5475,  kind: 'columnar' },  // −15yr
		];

		for (const spec of specs) {
			const gf = treeGrowthFactor(Math.max(0, gardenAgeUnits + spec.bornAgo));
			const bx = spec.xf * W;
			const by = horizonY;
			const tw = Math.max(0.8, 3.5 * gf);

			ctx.save();
			ctx.fillStyle   = clr;
			ctx.strokeStyle = clr;
			ctx.globalAlpha = 0.80;
			ctx.lineCap     = 'round';

			// Trunk
			const trunkH = ({ oak: 90, pine: 80, round: 70, columnar: 60 } as const)[spec.kind] * gf;
			ctx.lineWidth = tw;
			ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - trunkH); ctx.stroke();

			if (spec.kind === 'oak') {
				// Ancient oak: three heavy ellipse masses + a drooping low branch
				const rx = 72 * gf, ry = 55 * gf;
				const cx = bx - rx * 0.08, cy = by - trunkH - ry * 0.5;
				ctx.beginPath(); ctx.ellipse(cx,              cy,              rx,        ry,        0,     0, Math.PI * 2); ctx.fill();
				ctx.beginPath(); ctx.ellipse(cx - rx * 0.55,  cy + ry * 0.14,  rx * 0.56, ry * 0.44, -0.2,  0, Math.PI * 2); ctx.fill();
				ctx.beginPath(); ctx.ellipse(cx + rx * 0.50,  cy - ry * 0.10,  rx * 0.48, ry * 0.40, 0.15,  0, Math.PI * 2); ctx.fill();
				// Signature drooping branch — marks it as old growth
				ctx.lineWidth = tw * 2.0;
				ctx.beginPath();
				ctx.moveTo(bx, by - trunkH * 0.50);
				ctx.quadraticCurveTo(bx - rx * 0.42, by - trunkH * 0.52, bx - rx * 0.78, by - trunkH * 0.60);
				ctx.stroke();

			} else if (spec.kind === 'pine') {
				// Conical/fir — triangular path with fBm edge wobble
				const halfW = 30 * gf, crownH = 88 * gf;
				const tipY  = by - trunkH - crownH;
				const STEPS = 14;
				ctx.beginPath();
				ctx.moveTo(bx, tipY);
				for (let i = 1; i <= STEPS; i++) {
					const t = i / STEPS;
					ctx.lineTo(bx + t * halfW * (1 + noise1D(t * 4.2 + spec.xf * 7) * 0.12),      tipY + t * crownH);
				}
				for (let i = STEPS; i >= 0; i--) {
					const t = i / STEPS;
					ctx.lineTo(bx - t * halfW * (1 + noise1D(t * 4.2 + spec.xf * 7 + 11) * 0.12), tipY + t * crownH);
				}
				ctx.closePath(); ctx.fill();

			} else if (spec.kind === 'round') {
				// Two offset ellipses — irregular natural dome
				const rx = 38 * gf, ry = 34 * gf;
				const cx = bx, cy = by - trunkH - ry * 0.5;
				ctx.beginPath(); ctx.ellipse(cx,             cy,             rx,        ry,        0,   0, Math.PI * 2); ctx.fill();
				ctx.beginPath(); ctx.ellipse(cx + rx * 0.38, cy - ry * 0.20, rx * 0.72, ry * 0.65, 0.2, 0, Math.PI * 2); ctx.fill();

			} else {
				// Columnar — narrow upright, Lombardy poplar / cypress
				ctx.beginPath();
				ctx.ellipse(bx, by - trunkH - 75 * gf * 0.5, 11 * gf, 75 * gf * 0.5, 0, 0, Math.PI * 2);
				ctx.fill();
			}

			ctx.restore();
		}
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

		// Horizon glow band (golden hour)
		if (isGolden && altDeg > -5) {
			const intensity = Math.max(0, 1 - Math.max(0, altDeg) / 12);
			const bg = ctx.createLinearGradient(sunX - W * 0.6, 0, sunX + W * 0.6, 0);
			bg.addColorStop(0,    'rgba(255,100,0,0)');
			bg.addColorStop(0.3,  `rgba(255,100,0,${(intensity * 0.22).toFixed(3)})`);
			bg.addColorStop(0.5,  `rgba(255,140,0,${(intensity * 0.40).toFixed(3)})`);
			bg.addColorStop(0.7,  `rgba(255,100,0,${(intensity * 0.22).toFixed(3)})`);
			bg.addColorStop(1,    'rgba(255,100,0,0)');
			ctx.save();
			ctx.globalCompositeOperation = 'screen';
			ctx.fillStyle = bg;
			ctx.fillRect(0, horizonY * 0.6, W, horizonY * 0.5);
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

		ctx.save();
		ctx.lineCap = 'round';

		for (const c of cirrus) {
			const rawX = (c.xFrac * W + minutesSinceEpoch * c.speed) % (W + c.width * 2);
			const cx   = rawX - c.width;
			const cy   = c.yFrac * horizonY;

			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(c.angle);

			const rng = makePRNG(c.prngseed);
			// 8 strands per cluster — varying length, angle, origin
			for (let i = 0; i < 8; i++) {
				const x0   = (rng() - 0.5) * c.width * 0.80;
				const y0   = (rng() - 0.5) * 14;
				const len  = c.width * (0.28 + rng() * 0.58);
				const cpx  = x0 + len * 0.45 + (rng() - 0.5) * len * 0.30;
				const cpy  = y0 + (rng() - 0.5) * 12;
				const x1   = x0 + len;
				const y1   = y0 + (rng() - 0.5) * 10;
				const strandAlpha = c.alpha * alphaBase * (0.40 + rng() * 0.60);

				// Three passes: core (narrow) → mid → halo (wide, faint)
				const passes = [
					{ w: 0.8 + rng() * 1.2, a: strandAlpha },
					{ w: 2.0 + rng() * 1.5, a: strandAlpha * 0.38 },
					{ w: 4.0 + rng() * 2.0, a: strandAlpha * 0.14 },
				];
				for (const p of passes) {
					ctx.beginPath();
					ctx.moveTo(x0, y0);
					ctx.quadraticCurveTo(cpx, cpy, x1, y1);
					ctx.strokeStyle = css(top);
					ctx.lineWidth   = p.w;
					ctx.globalAlpha = p.a;
					ctx.stroke();
				}
			}
			ctx.restore();
		}
		ctx.restore();
	}

	// ── cloud: offscreen renderer ─────────────────────────────────────────────
	// Path-based silhouette: ONE continuous bezier shape — flat base + bumpy top.
	// No individual circles. The bumpy outline IS the cloud edge, drawn as a
	// connected series of quadratic bezier curves through generated peak points.
	// Perspective baked via aspectRatio: near-horizon ~0.10, overhead ~0.42.
	function renderCloudToCanvas(cloud: CloudDef, topRGB: RGB, shadowRGB: RGB): HTMLCanvasElement {
		const rng    = makePRNG(cloud.prngseed);
		const totalW = cloud.size;
		const totalH = Math.max(cloud.size * cloud.aspectRatio, 10);

		// Small top buffer (peaks are path points, not extended circles);
		// generous bottom padding for base-fade.
		const padX = totalW * 0.15;
		const padT = Math.max(totalH * 0.12, 6);
		const padB = Math.max(totalH * 0.42, 10);

		const CW    = Math.ceil(totalW + padX * 2);
		const CH    = Math.ceil(totalH + padT + padB);
		const baseY = CH - padB;

		const c  = document.createElement('canvas');
		c.width  = CW;
		c.height = CH;
		const ctx = c.getContext('2d')!;

		// ── Generate bump peaks ──────────────────────────────────────────────────
		// Edge peaks are shorter → dome silhouette, not a flat bar.
		const numBumps = 3 + Math.floor(rng() * 4);
		const peaks: Array<{ x: number; y: number }> = [];
		for (let i = 0; i < numBumps; i++) {
			const xFrac    = (i + 0.15 + rng() * 0.70) / numBumps;
			const px       = padX + xFrac * totalW;
			const edgeness = Math.abs(xFrac - 0.5) * 2;
			const h        = totalH * (0.58 + rng() * 0.42) * (1 - edgeness * 0.40);
			peaks.push({ x: px, y: baseY - h });
		}
		peaks.sort((a, b) => a.x - b.x);

		const leftX  = padX * 0.3;
		const rightX = CW - padX * 0.3;
		const lastP  = peaks[peaks.length - 1];

		// ── Build silhouette path ────────────────────────────────────────────────
		ctx.beginPath();
		ctx.moveTo(leftX, baseY);

		// Sweep up from left edge to first peak
		ctx.quadraticCurveTo(
			leftX + (peaks[0].x - leftX) * 0.42, baseY - totalH * 0.30,
			peaks[0].x, peaks[0].y
		);

		// Walk through peaks; each pair shares a shallow valley
		for (let i = 0; i < peaks.length - 1; i++) {
			const p1 = peaks[i], p2 = peaks[i + 1];
			// Valley sits between peaks, 14–30% of the way down toward baseY
			const valX  = (p1.x + p2.x) / 2 + (rng() - 0.5) * (p2.x - p1.x) * 0.18;
			const lower = Math.max(p1.y, p2.y);
			const valY  = lower + (baseY - lower) * (0.14 + rng() * 0.18);
			ctx.quadraticCurveTo(p1.x + (valX - p1.x) * 0.58, p1.y, valX, valY);
			ctx.quadraticCurveTo(valX + (p2.x - valX) * 0.42, p2.y, p2.x, p2.y);
		}

		// Sweep down from last peak to right edge
		ctx.quadraticCurveTo(
			rightX - (rightX - lastP.x) * 0.42, baseY - totalH * 0.30,
			rightX, baseY
		);
		ctx.lineTo(leftX, baseY);
		ctx.closePath();

		// Fill unified shape — all shading applied on top of this flat fill
		ctx.fillStyle = css(topRGB, 0.92);
		ctx.fill();

		// ── Directional shading (source-atop) ────────────────────────────────────
		ctx.save();
		ctx.globalCompositeOperation = 'source-atop';
		const shadeTop = Math.max(0, baseY - totalH);
		const shade    = ctx.createLinearGradient(0, shadeTop, 0, baseY);
		shade.addColorStop(0.00, css(shadowRGB, 0.00));
		shade.addColorStop(0.50, css(shadowRGB, 0.00));
		shade.addColorStop(0.75, css(shadowRGB, 0.28));
		shade.addColorStop(1.00, css(shadowRGB, 0.60));
		ctx.fillStyle = shade;
		ctx.fillRect(0, 0, CW, CH);
		ctx.restore();

		// ── Shadow pockets at bump valleys (source-atop) ─────────────────────────
		ctx.save();
		ctx.globalCompositeOperation = 'source-atop';
		for (let i = 0; i < peaks.length - 1; i++) {
			const p1    = peaks[i], p2 = peaks[i + 1];
			const valX  = (p1.x + p2.x) / 2;
			const lower = Math.max(p1.y, p2.y);
			const valY  = lower + (baseY - lower) * 0.22;
			const rr    = (p2.x - p1.x) * 0.20;
			const vg    = ctx.createRadialGradient(valX, valY, 0, valX, valY, rr);
			vg.addColorStop(0, css(shadowRGB, 0.28));
			vg.addColorStop(1, css(shadowRGB, 0));
			ctx.beginPath();
			ctx.ellipse(valX, valY, rr * 1.2, rr * 0.60, 0, 0, Math.PI * 2);
			ctx.fillStyle = vg;
			ctx.fill();
		}
		ctx.restore();

		// ── Feather base edge (destination-out) ──────────────────────────────────
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		const fTop = baseY - Math.max(totalH * 0.15, 5);
		const fade = ctx.createLinearGradient(0, fTop, 0, baseY + padB * 0.55);
		fade.addColorStop(0.00, 'rgba(0,0,0,0)');
		fade.addColorStop(0.48, 'rgba(0,0,0,0.45)');
		fade.addColorStop(1.00, 'rgba(0,0,0,1)');
		ctx.fillStyle = fade;
		ctx.fillRect(0, fTop, CW, baseY + padB * 0.55 - fTop);
		ctx.restore();

		// ── Feather sides (destination-out) ──────────────────────────────────────
		ctx.save();
		ctx.globalCompositeOperation = 'destination-out';
		const sw = padX * 1.15;
		const lf = ctx.createLinearGradient(0, 0, sw, 0);
		lf.addColorStop(0, 'rgba(0,0,0,1)'); lf.addColorStop(1, 'rgba(0,0,0,0)');
		ctx.fillStyle = lf; ctx.fillRect(0, 0, sw, CH);
		const rf = ctx.createLinearGradient(CW - sw, 0, CW, 0);
		rf.addColorStop(0, 'rgba(0,0,0,0)'); rf.addColorStop(1, 'rgba(0,0,0,1)');
		ctx.fillStyle = rf; ctx.fillRect(CW - sw, 0, sw, CH);
		ctx.restore();

		return c;
	}
	// ── draw: clouds ───────────────────────────────────────────────────────────
	function drawClouds(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const cloudAlpha = Math.max(0, Math.min(1, (altDeg + 14) / 6));
		if (cloudAlpha <= 0) return;

		const minutesSinceEpoch = Date.now() / 60000;
		const { top, shadow } = getCloudColors(altDeg);
		const colorKey = quantizeColorKey(top, shadow);

		ctx.save();
		for (const cloud of clouds) {
			if (!cloud.cache || cloud.cacheColorKey !== colorKey) {
				cloud.cache = renderCloudToCanvas(cloud, top, shadow);
				cloud.cacheColorKey = colorKey;
			}

			// Compute where in the offscreen canvas the flat base sits, so we can
			// align it to the cloud's vertical position in the main canvas.
			const totalH = Math.max(cloud.size * cloud.aspectRatio, 8);
			const padB   = Math.max(totalH * 0.42, 10);
			const CH     = cloud.cache.height;
			const baseY  = CH - padB;   // base y within offscreen canvas

			const rawX = (cloud.xFrac * W + minutesSinceEpoch * cloud.speed) % (W + cloud.cache.width);
			const drawX = rawX - cloud.cache.width / 2;
			const skyY  = cloud.yFrac * horizonY * 0.84;   // base sits at this y in main canvas
			const drawY = skyY - baseY;

			ctx.globalAlpha = cloud.alpha * cloudAlpha;
			ctx.drawImage(cloud.cache, drawX, drawY);
		}
		ctx.restore();
	}

	// ── day/night theme ────────────────────────────────────────────────────────
	// Interpolates CSS vars on :root so all glass panels and text adapt to the sky.
	// RGB seed values come from themeState.palette so switching palettes
	// (amber / beige / gray / neutral) changes the colours without touching this fn.

	let lastThemeAlt     = 9999;
	let lastPaletteVer   = -1;

	function updateTheme(altDeg: number): void {
		const paletteChanged = themeState.version !== lastPaletteVer;
		if (!paletteChanged && Math.abs(altDeg - lastThemeAlt) < 0.4) return;
		lastThemeAlt   = altDeg;
		lastPaletteVer = themeState.version;

		// Dark-glass palettes (amber, dusk) set their own fixed glass/text vars
		// in applyPalette() — don't override them per-frame.
		if (themeState.palette.darkGlass) return;

		const dl = Math.max(0, Math.min(1, (altDeg + 12) / 18)); // 0 = night, 1 = day

		function ri(d: number, n: number): number { return Math.round(d + (n - d) * (1 - dl)); }

		const r = document.documentElement;
		const { glassDay, glassNight, textDay, textNight, darkPanelDay, darkPanelNight } = themeState.palette;

		// Glass surfaces — RGB interpolates between palette day and night seeds
		const gr = ri(glassDay[0], glassNight[0]);
		const gg = ri(glassDay[1], glassNight[1]);
		const gb = ri(glassDay[2], glassNight[2]);
		r.style.setProperty('--glass-bg',     `rgba(${gr},${gg},${gb},${(0.22*dl + 0.42*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-border', `rgba(${gr},${gg},${gb},${(0.40*dl + 0.15*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-nav-bg', `rgba(${gr},${gg},${gb},${(0.30*dl + 0.52*(1-dl)).toFixed(2)})`);

		// Text — single high-contrast color, dark at day / light at night
		r.style.setProperty('--clr-text',
			`rgb(${ri(textDay[0],textNight[0])},${ri(textDay[1],textNight[1])},${ri(textDay[2],textNight[2])})`
		);

		// Adaptive dark-panel chrome — palettes that define darkPanelDay/Night get
		// their --dark-panel-rgb interpolated too, so inputs/borders in BookForm etc.
		// shift colour with the sky.
		if (darkPanelDay && darkPanelNight) {
			const [pr, pg, pb] = lerpRGB(darkPanelDay as RGB, darkPanelNight as RGB, 1 - dl);
			r.style.setProperty('--dark-panel-rgb', `${pr},${pg},${pb}`);
		}
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
		updateTheme(altDeg);

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
		drawTerrain(ctx, altDeg);
		drawMidgroundTrees(ctx, altDeg);
		drawHorizonBlend(ctx, altDeg);
		drawPlants(ctx, bgPlants, horizonY, H);   // far grass — behind tree
		drawCirrus(ctx, altDeg);
		drawClouds(ctx, altDeg);
		drawTreeShadow(ctx, altDeg);
		if (treeSegments.length > 0) drawTree(ctx, treeSegments, W, H);
		drawPlants(ctx, fgPlants, horizonY, H);   // near grass — in front of everything
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
			treeSegments = generateTree(W, H, horizonY);
			saveTreeToCache(treeSegments, W, H);
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

		buildScene(W, H, horizonY);

		animFrame = requestAnimationFrame(draw);
		window.addEventListener('resize', resize);
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('touchmove', onTouchMove, { passive: true });

		// Load tree from cache, or generate on first visit (deferred so first
		// frame paints before the ~200ms generation runs).
		const cached = loadTreeFromCache(W, H);
		if (cached) {
			treeSegments = cached;
		} else {
			setTimeout(() => {
				treeSegments = generateTree(W, H, horizonY);
				saveTreeToCache(treeSegments, W, H);
			}, 80);
		}

		return () => {
			cancelAnimationFrame(animFrame);
			window.removeEventListener('resize', resize);
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('touchmove', onTouchMove);
			clearTimeout(cursorTimeout);
		};
	});
</script>

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
