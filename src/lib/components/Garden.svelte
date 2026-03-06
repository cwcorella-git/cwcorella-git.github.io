<script lang="ts">
	import { onMount } from 'svelte';
	import { makeGrassTuft, makeFern, tickWind, drawPlants, applyMouseForce, type PlantInstance } from '$lib/garden/plants';
	import { generateTree, loadTreeFromCache, saveTreeToCache, drawTree, type TreeSegment } from '$lib/garden/tree';
	import { loadGardenState, saveGardenState, creditVisit, accrueElapsedDays, growthFactor } from '$lib/garden/state';

	// ── constants ─────────────────────────────────────────────────────────────
	const HOME_LAT    = 39.53;   // Reno, NV
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
		const lat  = HOME_LAT * rad;
		const sinAlt =
			Math.sin(lat) * Math.sin(decl * rad) +
			Math.cos(lat) * Math.cos(decl * rad) * Math.cos(ha * rad);
		return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad;
	}

	// 6am → right (1.0), noon → center (0.5), 6pm → left (0.0)
	function sunXNorm(date: Date): number {
		const hour = date.getHours() + date.getMinutes() / 60;
		return Math.max(0, Math.min(1, 1 - (hour - 6) / 12));
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

	// ── sky keyframes ──────────────────────────────────────────────────────────
	const SKY_KF: Array<{ alt: number; zenith: RGB; horizon: RGB }> = [
		{ alt: -20, zenith: [2,   4,  16] as RGB, horizon: [5,   8,  42] as RGB },
		{ alt: -12, zenith: [5,   8,  32] as RGB, horizon: [13,  21,  64] as RGB },
		{ alt:  -6, zenith: [13,  21,  64] as RGB, horizon: [26,  42, 108] as RGB },
		{ alt:  -1, zenith: [26,  42, 108] as RGB, horizon: [47,  64, 128] as RGB },
		{ alt:   0, zenith: [74, 144, 196] as RGB, horizon: [255, 107,  53] as RGB },
		{ alt:   6, zenith: [100, 160, 210] as RGB, horizon: [255, 200, 140] as RGB },
		{ alt:  15, zenith: [100, 165, 220] as RGB, horizon: [200, 230, 245] as RGB },
		{ alt:  45, zenith: [30,  107, 158] as RGB, horizon: [135, 206, 235] as RGB },
	];

	function getSkyColors(altDeg: number): { zenith: RGB; horizon: RGB } {
		const kfs = SKY_KF;
		if (altDeg <= kfs[0].alt) return { zenith: kfs[0].zenith, horizon: kfs[0].horizon };
		for (let i = 0; i < kfs.length - 1; i++) {
			if (altDeg <= kfs[i + 1].alt) {
				const t = (altDeg - kfs[i].alt) / (kfs[i + 1].alt - kfs[i].alt);
				return {
					zenith:  lerpRGB(kfs[i].zenith,  kfs[i + 1].zenith,  t),
					horizon: lerpRGB(kfs[i].horizon, kfs[i + 1].horizon, t),
				};
			}
		}
		const last = kfs[kfs.length - 1];
		return { zenith: last.zenith, horizon: last.horizon };
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
		xFrac:  number;   // initial x fraction (0–1)
		yFrac:  number;   // y fraction in sky area (0–1)
		size:   number;
		alpha:  number;
		prngseed: number;
		speed:  number;   // px / minute
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
	let plants: PlantInstance[]     = [];
	let treeSegments: TreeSegment[] = [];
	let gardenAgeUnits              = 11315;   // default; overwritten from localStorage on mount
	let W = 0, H = 0, horizonY = 0;

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
			clouds.push({
				xFrac:    crng(),
				yFrac:    0.06 + crng() * 0.34,
				size:     55 + crng() * 90,
				alpha:    0.62 + crng() * 0.28,
				prngseed: Math.floor(crng() * 0x7FFFFFFF),
				speed:    8 + crng() * 18,
			});
		}

		// ── plants ──────────────────────────────────────────────────────────────────────────
		const prng = makePRNG(0xBADC0FFE);
		plants = [];

		for (let i = 0; i < 50; i++) {
			const x      = prng() * cw;
			const y      = hy + prng() * 12;
			const bornAt = prng() * 4000;   // plants born at random points during pre-history
			const scale  = growthFactor(Math.max(0, gardenAgeUnits - bornAt));
			const h      = (22 + prng() * 42) * scale;
			const seed   = Math.floor(prng() * 0x7FFFFFFF);
			plants.push(makeGrassTuft(x, y, h, seed));
		}

		for (let i = 0; i < 8; i++) {
			const x      = prng() * cw;
			const y      = hy + prng() * 8;
			const bornAt = prng() * 6000;   // ferns can be older relative to the pre-history
			const scale  = growthFactor(Math.max(0, gardenAgeUnits - bornAt));
			const h      = (52 + prng() * 52) * scale;
			const seed   = Math.floor(prng() * 0x7FFFFFFF);
			plants.push(makeFern(x, y, h, seed));
		}
	}

	// ── draw: sky ─────────────────────────────────────────────────────────────
	function drawSky(ctx: CanvasRenderingContext2D, altDeg: number): void {
		const { zenith, horizon } = getSkyColors(altDeg);
		const mid = lerpRGB(zenith, horizon, 0.45);
		const g   = ctx.createLinearGradient(0, 0, 0, horizonY);
		g.addColorStop(0,   css(zenith));
		g.addColorStop(0.5, css(mid));
		g.addColorStop(1,   css(horizon));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, horizonY);
	}

	// ── draw: ground ──────────────────────────────────────────────────────────
	function drawGround(ctx: CanvasRenderingContext2D): void {
		const g = ctx.createLinearGradient(0, horizonY, 0, H);
		g.addColorStop(0,   '#e8d5b0');
		g.addColorStop(0.4, '#d4bc90');
		g.addColorStop(1,   '#c0a878');
		ctx.fillStyle = g;
		ctx.fillRect(0, horizonY, W, H - horizonY);
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

		// Far mountains (most atmospheric haze)
		const farColor = isNight    ? 'rgba(12,15,30,0.84)'
		               : isTwilight ? 'rgba(95,82,100,0.82)'
		               :              'rgba(155,142,124,0.78)';
		fillMountainRange(ctx, 2.3, horizonY * 0.20, farColor);

		// Near mountains
		const nearColor = isNight    ? 'rgba(8,10,22,0.90)'
		                : isTwilight ? 'rgba(58,46,62,0.88)'
		                :              'rgba(95,82,62,0.88)';
		fillMountainRange(ctx, 5.7, horizonY * 0.33, nearColor);

		// Rolling hills (fBm — softer, greener)
		const hillColor = isNight    ? 'rgba(6,8,16,0.92)'
		                : isTwilight ? 'rgba(40,44,32,0.90)'
		                :              'rgba(70,82,46,0.88)';
		fillHillRange(ctx, 8.1, horizonY * 0.14, hillColor);
	}

	function fillMountainRange(
		ctx: CanvasRenderingContext2D,
		seed: number, heightScale: number, color: string
	): void {
		ctx.beginPath();
		ctx.moveTo(0, H);
		for (let px = 0; px <= W; px += 3) {
			const h = ridged1D((px / W) * 3.5 + seed) * heightScale;
			ctx.lineTo(px, horizonY - h);
		}
		ctx.lineTo(W, H);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
	}

	function fillHillRange(
		ctx: CanvasRenderingContext2D,
		seed: number, heightScale: number, color: string
	): void {
		ctx.beginPath();
		ctx.moveTo(0, H);
		for (let px = 0; px <= W; px += 4) {
			const h = fbm1D((px / W) * 4.5 + seed) * heightScale;
			ctx.lineTo(px, horizonY - h);
		}
		ctx.lineTo(W, H);
		ctx.closePath();
		ctx.fillStyle = color;
		ctx.fill();
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

	// ── draw: clouds ───────────────────────────────────────────────────────────
	function drawClouds(ctx: CanvasRenderingContext2D, altDeg: number): void {
		// Fade out in deep night
		const cloudAlpha = Math.max(0, Math.min(1, (altDeg + 14) / 6));
		if (cloudAlpha <= 0) return;

		const minutesSinceEpoch = Date.now() / 60000;
		ctx.save();
		ctx.fillStyle = '#FEFCF4';

		for (const cloud of clouds) {
			const rawX  = (cloud.xFrac * W + minutesSinceEpoch * cloud.speed) % (W + cloud.size * 3);
			const cx    = rawX - cloud.size * 1.5;
			const cy    = cloud.yFrac * horizonY * 0.82;
			ctx.globalAlpha = cloud.alpha * cloudAlpha;
			drawCloudBlob(ctx, cx, cy, cloud.size, cloud.prngseed);
		}
		ctx.restore();
	}

	function drawCloudBlob(
		ctx: CanvasRenderingContext2D,
		cx: number, cy: number, size: number, seed: number
	): void {
		const rng = makePRNG(seed);
		for (let i = 0; i < 7; i++) {
			const ox = (rng() - 0.5) * size * 1.5;
			const oy = (rng() - 0.5) * size * 0.35;
			const rx = size * (0.38 + rng() * 0.62);
			ctx.beginPath();
			ctx.ellipse(cx + ox, cy + oy, rx, rx * 0.56, 0, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	// ── day/night theme ────────────────────────────────────────────────────────
	// Interpolates CSS vars on :root so all glass panels and text adapt to the sky.
	// Day (alt ≥ 6°): white glass + dark warm text.
	// Night (alt ≤ −12°): dark glass + warm off-white text.
	let lastThemeAlt = 9999;

	function updateTheme(altDeg: number): void {
		if (Math.abs(altDeg - lastThemeAlt) < 0.4) return;
		lastThemeAlt = altDeg;
		const dl = Math.max(0, Math.min(1, (altDeg + 12) / 18)); // 0 = night, 1 = day

		function ri(d: number, n: number): number { return Math.round(d + (n - d) * (1 - dl)); }

		const r = document.documentElement;
		// Glass surfaces
		const gr = ri(255, 8), gg = ri(255, 6), gb = ri(255, 2);
		r.style.setProperty('--glass-bg',      `rgba(${gr},${gg},${gb},${(0.22*dl + 0.42*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-border',  `rgba(${gr},${gg},${gb},${(0.40*dl + 0.15*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-nav-bg',  `rgba(${gr},${gg},${gb},${(0.30*dl + 0.52*(1-dl)).toFixed(2)})`);
		// Text
		r.style.setProperty('--clr-text-primary',   `rgb(${ri(61,224)},${ri(46,210)},${ri(26,190)})`);
		r.style.setProperty('--clr-text-prose',      `rgb(${ri(74,212)},${ri(56,198)},${ri(32,178)})`);
		r.style.setProperty('--clr-text-secondary',  `rgb(${ri(138,185)},${ri(106,162)},${ri(64,118)})`);
		r.style.setProperty('--clr-text-muted',      `rgb(${ri(154,168)},${ri(122,148)},${ri(80,108)})`);
		r.style.setProperty('--clr-text-faint',      `rgb(${ri(176,148)},${ri(144,130)},${ri(112,98)})`);
		r.style.setProperty('--clr-accent-dim',      `rgb(${ri(138,200)},${ri(106,164)},${ri(64,96)})`);
	}

	// ── cursor tracking ────────────────────────────────────────────────────────
	let rawMouseX  = -9999;
	let rawMouseY  = -9999;
	let smMouseX   = -9999;
	let smMouseY   = -9999;
	let cursorActive = false;
	let cursorTimeout = 0;

	function onMouseMove(e: MouseEvent): void {
		rawMouseX = e.clientX;
		rawMouseY = e.clientY;
		cursorActive = true;
		clearTimeout(cursorTimeout);
		cursorTimeout = window.setTimeout(() => { cursorActive = false; }, 2000);
	}

	function onTouchMove(e: TouchEvent): void {
		const t = e.touches[0];
		rawMouseX = t.clientX;
		rawMouseY = t.clientY;
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
		const sxn     = sunXNorm(now);
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
		const windForce = noise1D(time / 6) * 28;
		tickWind(plants, windForce, dt);
		if (cursorActive) applyMouseForce(plants, smMouseX, smMouseY);

		ctx.clearRect(0, 0, W, H);

		drawSky(ctx, altDeg);
		drawGround(ctx);
		drawStars(ctx, altDeg, time);
		drawMoon(ctx, altDeg, sxn);
		drawTerrain(ctx, altDeg);
		if (treeSegments.length > 0) drawTree(ctx, treeSegments, W, H);
		drawSun(ctx, altDeg, sxn);
		drawBeltOfVenus(ctx, altDeg);
		drawClouds(ctx, altDeg);
		drawPlants(ctx, plants);

		animFrame = requestAnimationFrame(draw);
	}

	function resize(): void {
		if (!canvas) return;
		W        = canvas.width  = window.innerWidth;
		H        = canvas.height = window.innerHeight;
		horizonY = H * HORIZON_FRAC;
		buildScene(W, H, horizonY);
	}

	onMount(() => {
		W        = canvas!.width  = window.innerWidth;
		H        = canvas!.height = window.innerHeight;
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
		const cached = loadTreeFromCache();
		if (cached) {
			treeSegments = cached;
		} else {
			setTimeout(() => {
				treeSegments = generateTree(W, H, horizonY);
				saveTreeToCache(treeSegments);
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
