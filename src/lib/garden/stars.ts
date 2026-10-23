// The night sky (2026-10-23). Faint stars and the Milky Way are baked once per
// resize into one canvas; only the brightest stars are drawn per frame, so they
// can twinkle. Counts follow the real sky: each magnitude fainter holds about
// 2.8× as many stars, so most are barely there and a handful stand out.

export interface BrightStar {
	x: number; y: number;
	r: number;          // core radius, physical px
	a: number;          // peak alpha
	color: string;
	phase: number;
	speed: number;
}

export interface StarField {
	field: HTMLCanvasElement;   // faint stars + Milky Way, sky-sized
	bright: BrightStar[];
	glow: HTMLCanvasElement;    // white halo sprite, tinted by drawing under alpha
}

function prng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6D2B79F5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), s | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	};
}

// Mostly white. Colour only shows on the brighter stars, as it does to the eye.
const TINTS: Array<[number, number, number, number]> = [
	[200, 216, 255, 0.22],   // blue-white
	[240, 244, 255, 0.43],   // white
	[255, 244, 226, 0.23],   // yellow-white
	[255, 214, 170, 0.12],   // orange
];

function tint(u: number): [number, number, number] {
	for (const [r, g, b, w] of TINTS) { if ((u -= w) < 0) return [r, g, b]; }
	return [240, 244, 255];
}

/** Magnitude with the sky's distribution, brightest -1, faintest 6.5. */
const magnitude = (u: number) => Math.max(-1, 6.5 + Math.log10(Math.max(u, 1e-9)) / 0.45);

/** Fades stars into the haze over the lowest part of the sky (y in 0–1, 1 = horizon). */
export const extinction = (y: number) => Math.max(0, Math.min(1, (1 - y) / 0.2)) ** 1.5;

function valueNoise(seed: number) {
	const r = prng(seed), N = 64, g = Float32Array.from({ length: N * N }, () => r());
	const at = (x: number, y: number) => g[((y % N + N) % N) * N + ((x % N + N) % N)];
	const sm = (t: number) => t * t * (3 - 2 * t);
	const n = (x: number, y: number) => {
		const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
		const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * fx;
		const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * fx;
		return a + (b - a) * fy;
	};
	return (x: number, y: number) => (n(x, y) * 0.5 + n(x * 2.1, y * 2.1) * 0.27 + n(x * 4.3, y * 4.3) * 0.15 + n(x * 8.7, y * 8.7) * 0.08);
}

/** The band runs from the lower right up to the upper left; returns signed distance (css px) and position along it. */
function band(cw: number, hy: number) {
	const x0 = cw * 0.95, y0 = hy * 1.02, x1 = cw * 0.18, y1 = -hy * 0.1;
	const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
	return (x: number, y: number) => {
		const px = x - x0, py = y - y0;
		return { t: (px * ux + py * uy) / len, d: px * -uy + py * ux };
	};
}

export function makeStars(cw: number, hy: number, dpr: number, seed = 0xCAFEBABE): StarField {
	const r = prng(seed);
	const field = document.createElement('canvas');
	field.width = Math.max(1, Math.round(cw)); field.height = Math.max(1, Math.round(hy));
	const ctx = field.getContext('2d')!;
	const cssW = cw / dpr, cssH = hy / dpr;
	const onBand = band(cw, hy), noise = valueNoise(seed ^ 0x5bd1e995);
	const halfW = Math.min(cw, hy * 2.4) * 0.11;   // band half-width

	// Milky Way glow: low-res, smoothed up. Brightest toward the core (the lower
	// right, Sagittarius side) and split by the dark rift along its length.
	const S = 4 * dpr, mw = Math.ceil(cw / S), mh = Math.ceil(hy / S);
	const low = document.createElement('canvas'); low.width = mw; low.height = mh;
	const lc = low.getContext('2d')!, img = lc.createImageData(mw, mh);
	const k = 6 / Math.max(cw, hy);
	for (let j = 0; j < mh; j++) for (let i = 0; i < mw; i++) {
		const X = i * S, Y = j * S, { t, d } = onBand(X, Y);
		const wob = (noise(X * k * 0.6, Y * k * 0.6) - 0.5) * halfW * 0.9;
		const q = (d + wob) / halfW;
		let v = Math.exp(-q * q * 1.3);
		const rift = (q - 0.15 + (noise(X * k * 1.4 + 9, Y * k * 1.4) - 0.5) * 0.6) / 0.28;
		v *= 1 - 0.75 * Math.exp(-rift * rift) * Math.max(0, Math.min(1, (1.05 - t) * 1.6));
		v *= 0.45 + 0.9 * noise(X * k * 2.2, Y * k * 2.2);
		v *= 0.55 + 0.65 * Math.max(0, 1 - t);       // core end brighter
		v *= extinction(Y / hy);
		const o = (j * mw + i) * 4;
		img.data[o] = 205 + 30 * (1 - t); img.data[o + 1] = 212 + 12 * (1 - t); img.data[o + 2] = 232;
		img.data[o + 3] = Math.max(0, Math.min(255, v * 55));
	}
	lc.putImageData(img, 0, 0);
	ctx.imageSmoothingEnabled = true;
	ctx.filter = `blur(${2 * dpr}px)`;
	ctx.drawImage(low, 0, 0, cw, hy);
	ctx.filter = 'none';

	const dot = (x: number, y: number, m: number, c: [number, number, number], fade: number) => {
		const a = Math.min(1, 0.12 + 0.88 * 10 ** (-0.4 * (m - 2))) * fade;
		if (a < 0.03) return;
		// Faint stars are near white; the colour comes up with brightness.
		const s = Math.max(0, Math.min(1, (4.5 - m) / 4));
		const col = c.map((v) => Math.round(244 + (v - 244) * s));
		ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a.toFixed(3)})`;
		const rr = dpr * Math.max(0.45, 1.05 - 0.09 * m);
		if (rr < 0.9) ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
		else { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
	};

	// The general field: about one star per 180 css px² of sky.
	const bright: BrightStar[] = [];
	const n = Math.round(cssW * cssH / 180);
	for (let i = 0; i < n; i++) {
		const x = r() * cw, y = r() * hy, m = magnitude(r()), c = tint(r());
		const fade = extinction(y / hy);
		if (m < 2.6) {
			bright.push({
				x, y, color: `${c[0]},${c[1]},${c[2]}`,
				r: dpr * (1.15 - 0.12 * m),
				a: Math.min(1, 0.55 + 0.45 * 10 ** (-0.4 * m)) * fade,
				phase: r() * Math.PI * 2, speed: 2 + r() * 4,
			});
		} else dot(x, y, m, c, fade);
	}
	// Unresolved stars crowd the band, thickest where its glow is.
	const nb = Math.round(n * 1.3);
	for (let i = 0; i < nb; i++) {
		const x = r() * cw, y = r() * hy, { t, d } = onBand(x, y);
		const q = d / halfW, w = Math.exp(-q * q * 1.6) * (0.4 + 0.6 * Math.max(0, 1 - t));
		if (r() > w) continue;
		dot(x, y, 4.2 + r() * 2.3, tint(r()), extinction(y / hy) * (0.5 + 0.5 * noise(x * k * 2.2, y * k * 2.2)));
	}

	const G = 32, glow = document.createElement('canvas'); glow.width = glow.height = G;
	const gc = glow.getContext('2d')!, gr = gc.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
	gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
	gc.fillStyle = gr; gc.fillRect(0, 0, G, G);

	return { field, bright, glow };
}

/** Draw the sky's stars at overall visibility `vis` (0–1). Twinkle grows toward the horizon, where the air is thickest. */
export function drawStarField(ctx: CanvasRenderingContext2D, sf: StarField, hy: number, vis: number, time: number): void {
	ctx.globalAlpha = vis * vis;   // the band and the faint stars come out last
	ctx.drawImage(sf.field, 0, 0);
	for (const s of sf.bright) {
		const low = s.y / hy, amp = 0.08 + 0.4 * low * low;
		const tw = 1 - amp * (0.5 + 0.5 * Math.sin(time * s.speed * (1 + low) + s.phase));
		const a = vis * s.a * tw;
		if (a < 0.02) continue;
		const g = s.r * 7;
		ctx.globalAlpha = a * 0.8;
		ctx.drawImage(sf.glow, s.x - g, s.y - g, g * 2, g * 2);
		ctx.globalAlpha = a;
		ctx.fillStyle = `rgb(${s.color})`;
		ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
	}
	ctx.globalAlpha = 1;
}
