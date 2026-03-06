<script lang="ts">
	import { onMount } from 'svelte';

	// Fixed home location: Reno, NV
	const HOME_LAT = 39.53;

	let canvas = $state<HTMLCanvasElement | undefined>();

	// ── time utilities ─────────────────────────────────────────────────────

	function dayOfYear(d: Date): number {
		const start = new Date(d.getFullYear(), 0, 0);
		return Math.floor((d.getTime() - start.getTime()) / 86400000);
	}

	/** Sun altitude in degrees, -90 to +90 */
	function sunAltitudeDeg(date: Date): number {
		const rad = Math.PI / 180;
		const doy = dayOfYear(date);
		const decl = 23.45 * Math.sin(rad * (360 / 365) * (doy - 81));
		const hour = date.getHours() + date.getMinutes() / 60;
		const ha = 15 * (hour - 12);
		const lat = HOME_LAT * rad;
		const sinAlt =
			Math.sin(lat) * Math.sin(decl * rad) +
			Math.cos(lat) * Math.cos(decl * rad) * Math.cos(ha * rad);
		return (Math.asin(Math.max(-1, Math.min(1, sinAlt))) / rad);
	}

	/**
	 * Sun X position as fraction 0–1 (0 = east/right at 6am, 1 = west/left at 6pm).
	 * Simple east-to-west arc: east is on the right side of the canvas,
	 * west on the left. This matches the convention of the sun rising
	 * on the right and setting on the left of a north-facing scene.
	 */
	function sunXNorm(date: Date): number {
		const hour = date.getHours() + date.getMinutes() / 60;
		// 6am → right (1.0), noon → center (0.5), 6pm → left (0.0)
		return Math.max(0, Math.min(1, 1 - (hour - 6) / 12));
	}

	// ── color utilities ────────────────────────────────────────────────────

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
		return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
	}

	// ── sky keyframes ──────────────────────────────────────────────────────
	// Keyed by sun altitude (degrees). Blend between adjacent stops.

	const SKY_KF: Array<{ alt: number; zenith: RGB; horizon: RGB }> = [
		{ alt: -20, zenith: [2,  4,  16],  horizon: [5,  8,  42]  }, // deep night
		{ alt: -12, zenith: [5,  8,  32],  horizon: [13, 21, 64]  }, // astronomical twilight
		{ alt: -6,  zenith: [13, 21, 64],  horizon: [26, 42, 108] }, // nautical twilight
		{ alt: -1,  zenith: [26, 42, 108], horizon: [47, 64, 128] }, // blue hour
		{ alt: 0,   zenith: [74, 144, 196],horizon: [255,107, 53] }, // sunrise
		{ alt: 6,   zenith: [100,160, 210],horizon: [255,200, 140]}, // early morning
		{ alt: 15,  zenith: [100,165, 220],horizon: [200,230, 245]}, // morning
		{ alt: 45,  zenith: [30, 107, 158],horizon: [135,206, 235]}, // midday
	];

	function getSkyColors(altDeg: number): { zenith: RGB; horizon: RGB } {
		const kfs = SKY_KF;
		if (altDeg <= kfs[0].alt) return { zenith: kfs[0].zenith, horizon: kfs[0].horizon };
		for (let i = 0; i < kfs.length - 1; i++) {
			if (altDeg <= kfs[i + 1].alt) {
				const t = (altDeg - kfs[i].alt) / (kfs[i + 1].alt - kfs[i].alt);
				return {
					zenith: lerpRGB(kfs[i].zenith, kfs[i + 1].zenith, t),
					horizon: lerpRGB(kfs[i].horizon, kfs[i + 1].horizon, t),
				};
			}
		}
		const last = kfs[kfs.length - 1];
		return { zenith: last.zenith, horizon: last.horizon };
	}

	// ── drawing ────────────────────────────────────────────────────────────

	const HORIZON_FRAC = 0.68; // horizon sits 68% down the canvas

	function draw() {
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const W = canvas.width;
		const H = canvas.height;
		const horizonY = H * HORIZON_FRAC;

		const now = new Date();
		const altDeg = sunAltitudeDeg(now);
		const sunX = sunXNorm(now) * W;
		const { zenith, horizon } = getSkyColors(altDeg);
		const midColor = lerpRGB(zenith, horizon, 0.45);

		// ── sky gradient ───────────────────────────────────────────────────
		const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
		skyGrad.addColorStop(0, css(zenith));
		skyGrad.addColorStop(0.5, css(midColor));
		skyGrad.addColorStop(1, css(horizon));
		ctx.fillStyle = skyGrad;
		ctx.fillRect(0, 0, W, horizonY);

		// ── ground strip ───────────────────────────────────────────────────
		// Warm latte-to-soil gradient below the horizon
		const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
		groundGrad.addColorStop(0, '#e8d5b0');
		groundGrad.addColorStop(0.3, '#d4bc90');
		groundGrad.addColorStop(1, '#c0a878');
		ctx.fillStyle = groundGrad;
		ctx.fillRect(0, horizonY, W, H - horizonY);

		// ── sun / glow ─────────────────────────────────────────────────────
		if (altDeg > -8) {
			// Map altitude to canvas Y within the sky area
			// alt 0 → near horizon; alt 90 → top of canvas
			const sinAlt = Math.max(0, Math.sin(altDeg * Math.PI / 180));
			const sunY = horizonY - sinAlt * horizonY * 0.92;

			const isGolden = altDeg < 12;

			// Glow halo
			const glowR = isGolden ? Math.min(W * 0.35, 260) : 90;
			const glowAlpha = isGolden ? 0.42 : 0.12;
			const glowInner: RGB = isGolden ? [255, 160, 60] : [255, 245, 200];
			const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
			sunGlow.addColorStop(0, css(glowInner, glowAlpha));
			sunGlow.addColorStop(0.4, css(glowInner, glowAlpha * 0.3));
			sunGlow.addColorStop(1, 'rgba(0,0,0,0)');

			ctx.save();
			ctx.globalCompositeOperation = 'lighter';
			ctx.fillStyle = sunGlow;
			ctx.fillRect(0, 0, W, H);
			ctx.restore();

			// Disc
			const discR = isGolden ? 18 : 10;
			const discColor = isGolden ? '#FF7020' : '#FFFDE7';
			ctx.beginPath();
			ctx.arc(sunX, sunY, discR, 0, Math.PI * 2);
			ctx.fillStyle = discColor;
			ctx.fill();

			// Horizon glow band during golden hour / sunrise / sunset
			if (isGolden && altDeg > -5) {
				const intensity = Math.max(0, 1 - Math.max(0, altDeg) / 12);
				const bandGrad = ctx.createLinearGradient(
					sunX - W * 0.6, 0,
					sunX + W * 0.6, 0
				);
				bandGrad.addColorStop(0,    'rgba(255,100,0,0)');
				bandGrad.addColorStop(0.3,  `rgba(255,100,0,${intensity * 0.22})`);
				bandGrad.addColorStop(0.5,  `rgba(255,140,0,${intensity * 0.40})`);
				bandGrad.addColorStop(0.7,  `rgba(255,100,0,${intensity * 0.22})`);
				bandGrad.addColorStop(1,    'rgba(255,100,0,0)');

				ctx.save();
				ctx.globalCompositeOperation = 'screen';
				ctx.fillStyle = bandGrad;
				ctx.fillRect(0, horizonY * 0.6, W, horizonY * 0.5);
				ctx.restore();
			}

			// Belt of Venus: pink arc on anti-solar side when sun -2° to -6°
			if (altDeg < -1 && altDeg > -6) {
				const beltFrac = Math.abs(altDeg + 1) / 5; // 0→1 as sun goes deeper
				const antiSolarX = (1 - sunXNorm(now)) * W;

				// Earth's shadow (dark blue) at horizon on anti-solar side
				const shadowGrad = ctx.createLinearGradient(0, horizonY - 20, 0, horizonY + 60);
				shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
				shadowGrad.addColorStop(0.5, `rgba(40,50,90,${beltFrac * 0.4})`);
				shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
				const beltHorizGrad = ctx.createLinearGradient(
					antiSolarX - W * 0.5, 0,
					antiSolarX + W * 0.5, 0
				);
				beltHorizGrad.addColorStop(0, 'rgba(0,0,0,0)');
				beltHorizGrad.addColorStop(0.5, `rgba(40,50,90,${beltFrac * 0.4})`);
				beltHorizGrad.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = shadowGrad;
				ctx.fillRect(0, horizonY - 20, W, 80);

				// Pink belt above the shadow
				const beltPinkGrad = ctx.createLinearGradient(0, horizonY - 60, 0, horizonY - 10);
				beltPinkGrad.addColorStop(0, 'rgba(0,0,0,0)');
				beltPinkGrad.addColorStop(0.5, `rgba(255,182,193,${beltFrac * 0.3})`);
				beltPinkGrad.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = beltPinkGrad;
				ctx.fillRect(0, horizonY - 60, W, 50);
			}
		}
	}

	function resize() {
		if (!canvas) return;
		canvas.width = window.innerWidth;
		canvas.height = window.innerHeight;
		draw();
	}

	onMount(() => {
		resize();
		window.addEventListener('resize', resize);
		// Redraw every minute — sky shifts slowly on a real clock
		const interval = setInterval(draw, 60_000);
		return () => {
			window.removeEventListener('resize', resize);
			clearInterval(interval);
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
