// The night sky (2026-10-23). Counts follow the real sky: each magnitude
// fainter holds about 2.8× as many stars, so most are barely there and a
// handful stand out. The garden faces north, so the sky turns about the pole
// above the ridge, counter-clockwise, once a sidereal day, and the Milky Way is
// the real galactic plane: some nights it arches high, some it lies low.
//
// Stars are kept by polar distance and right ascension. The faint ones and the
// band are repainted into `field` when the sky has turned half a pixel at its
// edge (about once a minute); only the brightest are drawn per frame, so they
// can twinkle.

export interface Star {
	r: number;          // distance from the pole, physical px
	ra: number;         // right ascension, radians
	m: number;          // magnitude
	tint: [number, number, number];
	phase: number;
	speed: number;
}

export interface StarField {
	poleX: number; poleY: number;
	R: number;                  // reach of the disc: the farthest viewport corner
	faint: Star[];
	bright: Star[];
	band: HTMLCanvasElement;    // Milky Way glow, square, centred on the pole, at LST 0
	field: HTMLCanvasElement;   // viewport-sized: band + faint stars at `lst`
	lst: number;                // radians the field was last painted at (NaN = never)
	glow: HTMLCanvasElement;    // white halo sprite
	cw: number; hy: number; dpr: number;
}

const rad = Math.PI / 180;
export const POLE_ALT = 39.53;   // the garden's latitude
const SKY_TOP_ALT = 70;          // altitude at the top of the canvas
const LON = -119.81;             // Reno

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
export const magnitude = (u: number) => Math.max(-1, 6.5 + Math.log10(Math.max(u, 1e-9)) / 0.45);

/** Fades stars into the haze over the lowest part of the sky (y in 0–1, 1 = horizon). */
export const extinction = (y: number) => Math.max(0, Math.min(1, (1 - y) / 0.2)) ** 1.5;

/** Local sidereal time at Reno, degrees: how far the sky has turned. */
export function siderealDeg(d: Date): number {
	const jd = d.getTime() / 86400000 + 2440587.5;
	const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545);
	return (((gmst + LON) % 360) + 360) % 360;
}

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

// The galactic north pole and centre, as unit vectors in equatorial coordinates.
const unit = (raDeg: number, decDeg: number): [number, number, number] =>
	[Math.cos(decDeg * rad) * Math.cos(raDeg * rad), Math.cos(decDeg * rad) * Math.sin(raDeg * rad), Math.sin(decDeg * rad)];
const NGP = unit(192.86, 27.13), GC = unit(266.4, -28.94);

/** Galactic latitude (degrees) and closeness to the centre (−1…1) of a point on the sky. */
export function galactic(ra: number, dec: number): { b: number; c: number } {
	const v = [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
	return { b: Math.asin(v[0] * NGP[0] + v[1] * NGP[1] + v[2] * NGP[2]) / rad, c: v[0] * GC[0] + v[1] * GC[1] + v[2] * GC[2] };
}

export function makeStars(cw: number, hy: number, dpr: number, seed = 0xCAFEBABE): StarField {
	const r = prng(seed);
	const s = hy / SKY_TOP_ALT;                         // px per degree
	const poleX = cw / 2, poleY = hy - POLE_ALT * s;
	const R = Math.max(Math.hypot(poleX, poleY), Math.hypot(poleX, hy - poleY));
	const noise = valueNoise(seed ^ 0x5bd1e995);
	const decOf = (rr: number) => (90 - rr / s) * rad;

	// Milky Way glow, low-res, in the sky's own frame (LST 0). Brightest toward
	// the galactic centre and split there by the Great Rift; the band is about
	// 15° wide and lumpy.
	const S = 4 * dpr, side = Math.ceil(2 * R / S);
	const low = document.createElement('canvas'); low.width = low.height = side;
	const lc = low.getContext('2d')!, img = lc.createImageData(side, side);
	const k = 4 / side;
	for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) {
		const dx = (i + 0.5) * S - R, dy = (j + 0.5) * S - R, rr = Math.hypot(dx, dy);
		if (rr > R) continue;
		// At LST 0 the hour angle is −RA; up is H = 0, left is H = +90°.
		const ra = Math.atan2(dx, -dy), { b, c } = galactic(ra, decOf(rr));
		const wob = (noise(i * k * 0.7, j * k * 0.7) - 0.5) * 9;
		const q = (b + wob) / 9;
		let v = Math.exp(-q * q * 1.3);
		const rift = (b - 1.5 + (noise(i * k * 1.6 + 9, j * k * 1.6) - 0.5) * 5) / 3;
		v *= 1 - 0.75 * Math.exp(-rift * rift) * Math.max(0, Math.min(1, c + 0.4));
		v *= 0.45 + 0.9 * noise(i * k * 2.4, j * k * 2.4);
		v *= 0.5 + 0.55 * Math.max(0, c + 0.3);
		const o = (j * side + i) * 4, w = Math.max(0, c);
		img.data[o] = 205 + 30 * w; img.data[o + 1] = 212 + 12 * w; img.data[o + 2] = 232;
		img.data[o + 3] = Math.max(0, Math.min(255, v * 55));
	}
	lc.putImageData(img, 0, 0);
	const band = document.createElement('canvas');
	band.width = band.height = Math.ceil(2 * R / dpr);   // css-scale: soft anyway, and a quarter of the memory
	const bc = band.getContext('2d')!;
	bc.filter = 'blur(2px)';
	bc.drawImage(low, 0, 0, band.width, band.height);

	const star = (m: number): Star => ({ r: R * Math.sqrt(r()), ra: r() * Math.PI * 2, m, tint: tint(r()), phase: r() * Math.PI * 2, speed: 2 + r() * 4 });

	// The general field: about one star per 180 css px² of sky.
	const faint: Star[] = [], bright: Star[] = [];
	const n = Math.round(Math.PI * R * R / (dpr * dpr) / 180);
	for (let i = 0; i < n; i++) {
		const st = star(magnitude(r()));
		(st.m < 2.6 ? bright : faint).push(st);
	}
	// Unresolved stars crowd the band, thickest toward the centre.
	for (let i = 0; i < n * 1.3; i++) {
		const st = star(4.2 + r() * 2.3), { b, c } = galactic(st.ra, decOf(st.r));
		const q = b / 9;
		if (r() < Math.exp(-q * q * 1.6) * (0.4 + 0.6 * Math.max(0, c + 0.3))) faint.push(st);
	}

	const G = 32, glow = document.createElement('canvas'); glow.width = glow.height = G;
	const gc = glow.getContext('2d')!, gr = gc.createRadialGradient(G / 2, G / 2, 0, G / 2, G / 2, G / 2);
	gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.14)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
	gc.fillStyle = gr; gc.fillRect(0, 0, G, G);

	const field = document.createElement('canvas');
	field.width = Math.max(1, Math.round(cw)); field.height = Math.max(1, Math.round(hy));
	return { poleX, poleY, R, faint, bright, band, field, lst: NaN, glow, cw, hy, dpr };
}

/** Where a star is on screen with the sky turned to `lst` (radians). */
function place(sf: StarField, st: Star, lst: number): [number, number] {
	const h = lst - st.ra;
	return [sf.poleX - Math.sin(h) * st.r, sf.poleY - Math.cos(h) * st.r];
}

function paintField(sf: StarField, lst: number): void {
	const ctx = sf.field.getContext('2d')!, { cw, hy, dpr } = sf;
	ctx.clearRect(0, 0, cw, hy);
	ctx.save();
	ctx.translate(sf.poleX, sf.poleY);
	ctx.rotate(-lst);
	ctx.drawImage(sf.band, -sf.R, -sf.R, 2 * sf.R, 2 * sf.R);
	ctx.restore();
	// The band fades into the haze like the stars do.
	ctx.globalCompositeOperation = 'destination-out';
	const g = ctx.createLinearGradient(0, hy * 0.8, 0, hy);
	g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
	ctx.fillStyle = g; ctx.fillRect(0, hy * 0.8, cw, hy * 0.2);
	ctx.globalCompositeOperation = 'source-over';

	for (const st of sf.faint) {
		const [x, y] = place(sf, st, lst);
		if (x < -2 || x > cw + 2 || y < -2 || y > hy) continue;
		const a = Math.min(1, 0.12 + 0.88 * 10 ** (-0.4 * (st.m - 2))) * extinction(y / hy);
		if (a < 0.03) continue;
		// Faint stars are near white; the colour comes up with brightness.
		const t = Math.max(0, Math.min(1, (4.5 - st.m) / 4));
		const c = st.tint.map((v) => Math.round(244 + (v - 244) * t));
		ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`;
		const rr = dpr * Math.max(0.45, 1.05 - 0.09 * st.m);
		if (rr < 0.9) ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
		else { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill(); }
	}
	sf.lst = lst;
}

/**
 * Draw the stars at overall visibility `vis` (0–1) with the sky turned to
 * `lstDeg`. `moonLight` (0–1) washes out the band and the faint stars first.
 * Twinkle grows toward the horizon, where the air is thickest.
 */
export function drawStarField(ctx: CanvasRenderingContext2D, sf: StarField, vis: number, time: number, lstDeg: number, moonLight = 0): void {
	const lst = lstDeg * rad, hy = sf.hy;
	if (!(Math.abs(lst - sf.lst) * sf.R < 0.5)) paintField(sf, lst);
	ctx.globalAlpha = vis * vis * (1 - 0.8 * moonLight);   // the band and the faint stars come out last
	ctx.drawImage(sf.field, 0, 0);
	const dim = vis * (1 - 0.35 * moonLight);
	for (const st of sf.bright) {
		const [x, y] = place(sf, st, lst);
		if (x < -20 || x > sf.cw + 20 || y < -20 || y > hy) continue;
		const low = y / hy, amp = 0.08 + 0.4 * low * low;
		const tw = 1 - amp * (0.5 + 0.5 * Math.sin(time * st.speed * (1 + low) + st.phase));
		const a = dim * Math.min(1, 0.55 + 0.45 * 10 ** (-0.4 * st.m)) * extinction(low) * tw;
		if (a < 0.02) continue;
		const rr = sf.dpr * (1.15 - 0.12 * st.m), g = rr * 7;
		ctx.globalAlpha = a * 0.8;
		ctx.drawImage(sf.glow, x - g, y - g, g * 2, g * 2);
		ctx.globalAlpha = a;
		ctx.fillStyle = `rgb(${st.tint[0]},${st.tint[1]},${st.tint[2]})`;
		ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fill();
	}
	ctx.globalAlpha = 1;
}
