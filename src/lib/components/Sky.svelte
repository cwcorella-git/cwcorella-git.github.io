<script lang="ts">
	import { onMount } from 'svelte';
	import { themeState } from '$lib/admin/theme.svelte';

	// ── constants ─────────────────────────────────────────────────────────────
	const HORIZON_FRAC = 0.68;
	const SKIP = 2;  // ~30fps always

	let visibleEl = $state<HTMLCanvasElement | undefined>();

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

	// ── sun position ──────────────────────────────────────────────────────────
	function dayOfYear(d: Date): number {
		return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
	}

	function sunAltitudeDeg(date: Date): number {
		const rad  = Math.PI / 180;
		const doy  = dayOfYear(date);
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
	function sunXNorm(date: Date, lat: number): number {
		const rad   = Math.PI / 180;
		const doy   = dayOfYear(date);
		const decl  = 23.45 * Math.sin(rad * (360 / 365) * (doy - 81));
		const cosH0 = Math.max(-1, Math.min(1, -Math.tan(lat * rad) * Math.tan(decl * rad)));
		const H0_hours = Math.acos(cosH0) * 12 / Math.PI;
		const sunrise  = 12 - H0_hours;
		const sunset   = 12 + H0_hours;
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
	const SKY_KF: Array<{ alt: number; zenith: RGB; mid: RGB; lower: RGB; horizon: RGB }> = [
		{ alt: -20, zenith: [2,   4,  16] as RGB, mid: [3,   5,  22] as RGB, lower: [4,   7,  34] as RGB, horizon: [5,   8,  42] as RGB },
		{ alt: -12, zenith: [5,   8,  32] as RGB, mid: [7,  12,  42] as RGB, lower: [11,  18,  56] as RGB, horizon: [13,  21,  64] as RGB },
		{ alt:  -6, zenith: [13,  21,  64] as RGB, mid: [17,  27,  76] as RGB, lower: [22,  37,  98] as RGB, horizon: [26,  42, 108] as RGB },
		{ alt:  -1, zenith: [26,  42, 108] as RGB, mid: [32,  48, 114] as RGB, lower: [42,  58, 124] as RGB, horizon: [47,  64, 128] as RGB },
		{ alt:   0, zenith: [74, 144, 196] as RGB, mid: [90, 100, 148] as RGB, lower: [190, 115,  80] as RGB, horizon: [255, 107,  53] as RGB },
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

	let W = 0, H = 0, horizonY = 0;
	let dpr = 1;
	let offscreen: OffscreenCanvas | null = null;

	// ── draw: sky (full-canvas bleed) ─────────────────────────────────────────
	type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
	function drawSky(ctx: Ctx, altDeg: number): void {
		const { zenith, mid, horizon } = getSkyColors(altDeg);
		const lower  = lerpRGB(mid, horizon, 0.55);
		const bright = lerpRGB(horizon, [255, 255, 255] as RGB, 0.12);
		const g = ctx.createLinearGradient(0, 0, 0, H);
		g.addColorStop(0,    css(zenith));
		g.addColorStop(0.57, css(mid));
		g.addColorStop(0.76, css(lower));
		g.addColorStop(0.90, css(horizon));
		g.addColorStop(1,    css(bright));
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);
	}

	// ── draw: circumsolar Mie-scatter brightening ─────────────────────────────
	function drawCircumsolarGlow(ctx: Ctx, altDeg: number, sxn: number): void {
		if (altDeg <= -8) return;
		const sunX   = sxn * W;
		const sinAlt = Math.max(0, Math.sin(altDeg * Math.PI / 180));
		const sunY   = horizonY - sinAlt * horizonY * 0.92;
		const intensity = Math.max(0, 1 - Math.max(0, altDeg - 4) / 42) * 0.30;
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
	function drawPurpleLight(ctx: Ctx, altDeg: number, sxn: number): void {
		if (altDeg < -10 || altDeg > -1) return;
		const t         = (altDeg + 10) / 9;
		const intensity = Math.sin(t * Math.PI) * 0.45;
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
		ctx.fillRect(0, 0, W, H);
		ctx.restore();
	}

	// ── draw: crepuscular rays ────────────────────────────────────────────────
	function drawCrepuscularRays(ctx: Ctx, altDeg: number, sxn: number): void {
		if (altDeg < -3 || altDeg > 10) return;
		const intensity = Math.max(0, 1 - Math.abs(altDeg - 2.5) / 6) * 0.20;
		if (intensity < 0.01) return;

		const sunX = sxn * W;
		const sunY = horizonY;

		const rng = makePRNG(0xC0FFEE);
		ctx.save();
		ctx.globalCompositeOperation = 'screen';

		for (let i = 0; i < 10; i++) {
			const angle = (rng() - 0.5) * 1.3;
			const len   = H * (0.45 + rng() * 0.55);
			const width = 10 + rng() * 30;
			const alpha = intensity * (0.35 + rng() * 0.65);

			ctx.save();
			ctx.translate(sunX, sunY);
			ctx.rotate(angle);

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

	// ── draw: Belt of Venus ────────────────────────────────────────────────────
	function drawBeltOfVenus(ctx: Ctx, altDeg: number): void {
		if (altDeg >= -1 || altDeg < -6) return;
		const frac = Math.abs(altDeg + 1) / 5;

		const shadow = ctx.createLinearGradient(0, horizonY - 20, 0, horizonY + 60);
		shadow.addColorStop(0,   'rgba(0,0,0,0)');
		shadow.addColorStop(0.5, `rgba(38,48,88,${(frac * 0.38).toFixed(3)})`);
		shadow.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = shadow;
		ctx.fillRect(0, horizonY - 20, W, 80);

		const belt = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY - 8);
		belt.addColorStop(0,   'rgba(0,0,0,0)');
		belt.addColorStop(0.5, `rgba(255,180,192,${(frac * 0.28).toFixed(3)})`);
		belt.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = belt;
		ctx.fillRect(0, horizonY - 60, W, 52);
	}

	// ── draw: sun ─────────────────────────────────────────────────────────────
	function drawSun(ctx: Ctx, altDeg: number, sxn: number): void {
		if (altDeg <= -8) return;
		const sunX     = sxn * W;
		const sinAlt   = Math.max(0, Math.sin(altDeg * Math.PI / 180));
		const sunY     = horizonY - sinAlt * horizonY * 0.92;
		const isGolden = altDeg < 12;

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

		ctx.beginPath();
		ctx.arc(sunX, sunY, isGolden ? 18 : 10, 0, Math.PI * 2);
		ctx.fillStyle = isGolden ? '#FF7020' : '#FFFDE7';
		ctx.fill();

		if (isGolden && altDeg > -5) {
			const intensity = Math.max(0, 1 - Math.max(0, altDeg) / 12);
			const r  = W * 0.72;
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

	// ── draw: moon ────────────────────────────────────────────────────────────
	function drawMoon(ctx: Ctx, altDeg: number, sxn: number): void {
		const moonAlpha = Math.max(0, Math.min(1, (-altDeg - 6) / 8));
		if (moonAlpha <= 0) return;

		const moonX      = (1 - sxn) * W;
		const moonAltDeg = Math.min(72, Math.max(2, -altDeg * 0.65));
		const sinMoon    = Math.sin(moonAltDeg * Math.PI / 180);
		const moonY      = horizonY - sinMoon * horizonY * 0.88;

		const phase = moonPhase();
		const R = 11;

		const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, R * 5);
		glow.addColorStop(0,   `rgba(220,210,175,${(moonAlpha * 0.28).toFixed(3)})`);
		glow.addColorStop(0.5, `rgba(200,195,160,${(moonAlpha * 0.07).toFixed(3)})`);
		glow.addColorStop(1,   'rgba(0,0,0,0)');
		ctx.fillStyle = glow;
		ctx.fillRect(moonX - R * 5, moonY - R * 5, R * 10, R * 10);

		ctx.save();
		ctx.globalAlpha = moonAlpha;

		ctx.beginPath();
		ctx.arc(moonX, moonY, R, 0, Math.PI * 2);
		ctx.fillStyle = '#E8DFC0';
		ctx.fill();

		const lit      = Math.abs(phase - 0.5) * 2;
		const shadowCx = moonX + (phase < 0.5 ? -1 : 1) * R * lit * 0.82;
		ctx.beginPath();
		ctx.arc(moonX, moonY, R, -Math.PI / 2, Math.PI / 2);
		ctx.arc(shadowCx, moonY, R, Math.PI / 2, -Math.PI / 2, true);
		ctx.fillStyle = 'rgba(5,4,18,0.94)';
		ctx.fill();

		ctx.restore();
	}

	// ── draw: horizon atmosphere blend ───────────────────────────────────────
	function drawHorizonBlend(ctx: Ctx, altDeg: number): void {
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

	// ── draw: vignette ────────────────────────────────────────────────────────
	function drawVignette(ctx: Ctx): void {
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

	// ── day/night theme ────────────────────────────────────────────────────────
	let lastThemeAlt   = 9999;
	let lastPaletteVer = -1;
	let firstFrame     = true;
	let lastDarkGlass  = false;

	function updateTheme(altDeg: number): void {
		const paletteChanged = themeState.version !== lastPaletteVer;
		if (!paletteChanged && Math.abs(altDeg - lastThemeAlt) < 0.4) return;
		lastThemeAlt   = altDeg;
		lastPaletteVer = themeState.version;

		console.log('[Sky] updateTheme: palette=%s darkGlass=%s paletteChanged=%s',
			themeState.palette.name || 'unknown', themeState.palette.darkGlass, paletteChanged);

		if (themeState.palette.darkGlass) {
			console.log('[Sky] darkGlass=true, returning early (fixed colors via CSS)');
			return;
		}

		const dl = Math.max(0, Math.min(1, (altDeg + 12) / 18));
		console.log('[Sky] Setting dynamic CSS vars: dl=%f', dl);

		function ri(d: number, n: number): number { return Math.round(d + (n - d) * (1 - dl)); }

		const r = document.documentElement;
		const { glassDay, glassNight, textDay, textNight, darkPanelDay, darkPanelNight } = themeState.palette;

		const gr = ri(glassDay[0], glassNight[0]);
		const gg = ri(glassDay[1], glassNight[1]);
		const gb = ri(glassDay[2], glassNight[2]);
		r.style.setProperty('--glass-bg',     `rgba(${gr},${gg},${gb},${(0.22*dl + 0.42*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-border', `rgba(${gr},${gg},${gb},${(0.40*dl + 0.15*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-nav-bg', `rgba(${gr},${gg},${gb},${(0.30*dl + 0.52*(1-dl)).toFixed(2)})`);

		// Use cubic smoothstep for text: avoids muddy gray at dusk by staying at extremes longer
		const s = dl < 0.5 ? 2 * dl * dl : 1 - 2 * (1 - dl) * (1 - dl);
		r.style.setProperty('--clr-text',
			`rgb(${Math.round(textDay[0] + (textNight[0] - textDay[0]) * (1 - s))},${Math.round(textDay[1] + (textNight[1] - textDay[1]) * (1 - s))},${Math.round(textDay[2] + (textNight[2] - textDay[2]) * (1 - s))})`
		);

		// Overlays + panels also track sky so they match the page at all times of day
		r.style.setProperty('--glass-bg-dark',     `rgba(${gr},${gg},${gb},${(0.72*dl + 0.88*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-border-dark', `rgba(${gr},${gg},${gb},${(0.38*dl + 0.22*(1-dl)).toFixed(2)})`);
		r.style.setProperty('--glass-bg-heavy',    `rgba(${gr},${gg},${gb},${(0.78*dl + 0.92*(1-dl)).toFixed(2)})`);

		const tr = ri(textDay[0], textNight[0]);
		const tg = ri(textDay[1], textNight[1]);
		const tb = ri(textDay[2], textNight[2]);
		r.style.setProperty('--clr-dark-text', `rgb(${tr},${tg},${tb})`);

		if (darkPanelDay && darkPanelNight) {
			const [pr, pg, pb] = lerpRGB(darkPanelDay as RGB, darkPanelNight as RGB, 1 - dl);
			r.style.setProperty('--dark-panel-rgb', `${pr},${pg},${pb}`);
		}

		// Debug: log what we actually set
		console.log('[Sky] CSS vars set: --glass-bg=%s --clr-text=%s',
			r.style.getPropertyValue('--glass-bg'),
			r.style.getPropertyValue('--clr-text'));
	}

	// ── draw all atmospheric layers ────────────────────────────────────────────
	function drawAllLayers(ctx: Ctx, altDeg: number, sxn: number): void {
		ctx.clearRect(0, 0, W, H);
		drawSky(ctx, altDeg);
		drawMoon(ctx, altDeg, sxn);
		drawCircumsolarGlow(ctx, altDeg, sxn);
		drawSun(ctx, altDeg, sxn);
		drawCrepuscularRays(ctx, altDeg, sxn);
		drawBeltOfVenus(ctx, altDeg);
		drawPurpleLight(ctx, altDeg, sxn);
		drawHorizonBlend(ctx, altDeg);
		drawVignette(ctx);
	}

	// ── render to OffscreenCanvas ──────────────────────────────────────────────
	function renderToOffscreen(altDeg: number, sxn: number): void {
		if (!visibleEl) return;

		// Try OffscreenCanvas first (atomic buffering)
		if (offscreen) {
			const ctx = offscreen.getContext('2d');
			if (ctx) {
				drawAllLayers(ctx, altDeg, sxn);

				// Blit to visible canvas
				const vCtx = visibleEl.getContext('2d');
				if (vCtx) {
					vCtx.clearRect(0, 0, W, H);
					vCtx.drawImage(offscreen, 0, 0);
					return;
				}
			}
		}

		// Fallback: render directly to visible canvas
		const vCtx = visibleEl.getContext('2d');
		if (vCtx) drawAllLayers(vCtx, altDeg, sxn);
	}

	// ── main loop ──────────────────────────────────────────────────────────────
	let animFrame  = 0;
	let frameCount = 0;

	function draw(): void {
		animFrame = requestAnimationFrame(draw);
		if (++frameCount % SKIP !== 0) return;

		const now = new Date();
		const altDeg = sunAltitudeDeg(now);
		const sxn    = sunXNorm(now, 39.53);

		// IMPORTANT: Check for palette change BEFORE rendering
		const paletteChanged = themeState.version !== lastPaletteVer;
		const darkGlassChanged = lastDarkGlass !== themeState.palette.darkGlass;

		if (paletteChanged || darkGlassChanged) {
			console.log('[Sky] Palette/theme changed, clearing before render. darkGlass:', themeState.palette.darkGlass, 'was:', lastDarkGlass);
			if (visibleEl) {
				const vCtx = visibleEl.getContext('2d');
				if (vCtx) vCtx.clearRect(0, 0, W, H);
			}
			if (offscreen) {
				const oCtx = offscreen.getContext('2d');
				if (oCtx) oCtx.clearRect(0, 0, W, H);
			}
			lastDarkGlass = themeState.palette.darkGlass;
			lastPaletteVer = themeState.version;
		}

		renderToOffscreen(altDeg, sxn);
		updateTheme(altDeg);

		if (firstFrame) {
			document.documentElement.classList.add('sky-ready');
			firstFrame = false;
		}
	}

	function resize(): void {
		if (!visibleEl) return;
		dpr = window.devicePixelRatio || 1;
		const newW = Math.round(window.innerWidth * dpr);
		const newH = Math.round(window.innerHeight * dpr);
		if (newW === W && newH === H) return;

		W = visibleEl.width  = newW;
		H = visibleEl.height = newH;
		horizonY = H * HORIZON_FRAC;
		offscreen = new OffscreenCanvas(W, H);

		// Immediate render on resize
		const altDeg = sunAltitudeDeg(new Date());
		const sxn    = sunXNorm(new Date(), 39.53);
		renderToOffscreen(altDeg, sxn);
		updateTheme(altDeg);
	}

	onMount(() => {
		if (!visibleEl) return;
		dpr = window.devicePixelRatio || 1;
		W = Math.round(window.innerWidth * dpr);
		H = Math.round(window.innerHeight * dpr);
		horizonY = H * HORIZON_FRAC;

		visibleEl.width  = W;
		visibleEl.height = H;
		offscreen = new OffscreenCanvas(W, H);

		// Initial render
		const now = new Date();
		const altDeg = sunAltitudeDeg(now);
		const sxn    = sunXNorm(now, 39.53);
		renderToOffscreen(altDeg, sxn);
		updateTheme(altDeg);

		window.addEventListener('resize', resize);
		animFrame = requestAnimationFrame(draw);

		return () => {
			cancelAnimationFrame(animFrame);
			window.removeEventListener('resize', resize);
		};
	});
</script>

<canvas bind:this={visibleEl} class="sky-bg" aria-hidden="true"></canvas>

<style>
	.sky-bg {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		z-index: 0;
		pointer-events: none;
		display: block;
		will-change: transform;
		transform: translateZ(0);
	}
</style>
