// A live cloud layer (2026-11-28): a WebGL2 canvas, never in the DOM, ray-marches
// a cloud slab at reduced resolution; Garden composites it with drawImage.
// Density is a stateless function of position and scene time, read from one
// tileable 3D noise texture, so the same moment looks the same for everyone and
// the admin scene clock can scrub. Coverage slides through the noise's third
// axis (cells form and dissolve), billows scroll upward (turrets roll), and the
// shape noise drifts a little faster than coverage (the clouds shear).
// If WebGL2 is missing or the context is lost, `ok` is false and Garden keeps
// the baked sprites. Colours arrive as uniforms; this file knows no keyframes.

export type RGB3 = [number, number, number];

export interface CloudInput {
	top: RGB3; shadow: RGB3; zenith: RGB3; horizon: RGB3; ground: RGB3;   // 0–255
	cover: number;       // 0 clear .. 1 overcast
	altDeg: number;      // sun altitude, drives under-lighting
	lightAlt: number;    // altitude of whatever lights the clouds (sun or moon)
	lightX: number;      // its x, 0..1
	tSec: number;        // scene seconds
	pace: number;        // × the base drift/evolution speed
	night: number;       // 0..1
}

/** How much of the sky the day's weather covers. */
export function coverFor(kind: string): number {
	switch (kind) {
		case 'clear': return 0.05;
		case 'fair': return 0.25;
		case 'busy': return 0.42;
		case 'overcast': return 0.9;
		default: return 0.25;
	}
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const ss = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const mix3 = (a: RGB3, b: RGB3, t: number): RGB3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const n3 = (c: RGB3): RGB3 => [c[0] / 255, c[1] / 255, c[2] / 255];
/** Time offsets are reduced in doubles before they become float uniforms. */
export const wrap64 = (v: number): number => v - Math.floor(v / 64) * 64;

export interface CloudUniforms {
	th: number; tall: number; backlit: number; under: number; sheet: number; grey: number;
	L: RGB3; sunUV: [number, number];
	top: RGB3; shadow: RGB3; rim: RGB3; zenith: RGB3; horizon: RGB3; ground: RGB3;
	wind: [number, number]; wind2: [number, number]; evo: number; rise: number;
}

/** Pure: everything the shader needs, from the scene's state. */
export function cloudUniforms(i: CloudInput): CloudUniforms {
	const over = clamp01((i.cover - 0.7) / 0.25);
	const la = i.lightAlt;
	const e = (la >= 0 ? Math.min(75, 12 + la * 2.4) : Math.max(-20, la * 3)) * Math.PI / 180;
	const L: RGB3 = [(i.lightX - 0.5) * 1.5, Math.sin(e), -0.25 + 0.6 * (1 - ss(Math.abs(la) / 25))];
	const ln = Math.hypot(...L);
	const t = i.tSec * i.pace;
	return {
		th: 0.78 - 0.62 * i.cover,
		tall: 1 - 0.45 * over,
		backlit: (0.25 + 0.75 * (1 - ss((Math.abs(la) - 4) / 26))) * (1 - over),
		under: 1 - ss((i.altDeg + 1) / 5),
		sheet: i.cover < 0.12 ? 0 : 0.35 + 0.5 * over,
		grey: 0.75 * over,
		L: [L[0] / ln, L[1] / ln, L[2] / ln],
		sunUV: [i.lightX, clamp01(Math.sin(Math.max(0, la) * Math.PI / 180) * 0.88)],
		top: n3(i.top), shadow: n3(i.shadow), rim: n3(mix3(i.top, [255, 255, 255], 0.6)),
		zenith: n3(i.zenith), horizon: n3(i.horizon), ground: n3(mix3(i.ground, [10, 12, 14], i.night)),
		wind: [wrap64(-t * 0.012), wrap64(t * 0.0015)], wind2: [wrap64(-t * 0.0135), wrap64(t * 0.0022)],
		evo: ((t * 0.0011) % 1 + 1) % 1, rise: wrap64(t * 0.0035),
	};
}

// ── tileable 3D noise (R shape, G detail, B coverage), built in slices ─────
const N = 64;
function* makeNoise(seed: number): Generator<void, Uint8Array> {
	let s = seed >>> 0;
	const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	const lat = (P: number) => { const a = new Float32Array(P * P * P); for (let i = 0; i < a.length; i++) a[i] = rnd(); return { a, P }; };
	const vn = (L: { a: Float32Array; P: number }, x: number, y: number, z: number) => {
		const P = L.P, a = L.a; x *= P; y *= P; z *= P;
		const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
		let fx = x - xi, fy = y - yi, fz = z - zi; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
		const g = (i: number, j: number, k: number) => a[(((zi + k) % P) * P + (yi + j) % P) * P + (xi + i) % P];
		const l = (p: number, q: number, t: number) => p + (q - p) * t;
		return l(l(l(g(0, 0, 0), g(1, 0, 0), fx), l(g(0, 1, 0), g(1, 1, 0), fx), fy), l(l(g(0, 0, 1), g(1, 0, 1), fx), l(g(0, 1, 1), g(1, 1, 1), fx), fy), fz);
	};
	const cells = (F: number) => { const a = new Float32Array(F * F * F * 3); for (let i = 0; i < a.length; i++) a[i] = rnd(); return { a, F }; };
	const wor = (C: { a: Float32Array; F: number }, x: number, y: number, z: number) => {
		const F = C.F, a = C.a; x *= F; y *= F; z *= F;
		const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
		let m = 9;
		for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
			const cx = xi + i, cy = yi + j, cz = zi + k, q = ((((cz % F) + F) % F) * F + ((cy % F) + F) % F) * F + ((cx % F) + F) % F;
			const dx = cx + a[q * 3] - x, dy = cy + a[q * 3 + 1] - y, dz = cz + a[q * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
			if (d < m) m = d;
		}
		return 1 - Math.min(1, Math.sqrt(m));
	};
	const V = [2, 4, 8, 16, 32].map(lat), W = [3, 6, 12, 5, 10, 20].map(cells);
	const out = new Uint8Array(N * N * N * 4);
	for (let z = 0, o = 0; z < N; z++) {
		for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, o += 4) {
			const u = x / N, v = y / N, w = z / N;
			const pf = 0.5 * vn(V[1], u, v, w) + 0.27 * vn(V[2], u, v, w) + 0.15 * vn(V[3], u, v, w) + 0.08 * vn(V[4], u, v, w);
			const wl = 0.6 * wor(W[0], u, v, w) + 0.28 * wor(W[1], u, v, w) + 0.12 * wor(W[2], u, v, w);
			const wd = 0.6 * wor(W[3], u, v, w) + 0.28 * wor(W[4], u, v, w) + 0.12 * wor(W[5], u, v, w);
			const cv = 0.55 * vn(V[0], u, v, w) + 0.3 * vn(V[1], u, v, w) + 0.15 * vn(V[2], u, v, w);
			out[o] = 255 * clamp01((pf - 0.5) * 1.3 + wl * 1.15 - 0.05);
			out[o + 1] = 255 * clamp01(wd * 1.5 - 0.1);
			out[o + 2] = 255 * clamp01((cv - 0.5) * 2.2 + 0.5);
			out[o + 3] = 255;
		}
		if (z % 2 === 1) yield;
	}
	return out;
}

const VS = `#version 300 es
in vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }`;
const FS = (steps: number) => `#version 300 es
precision highp float; precision highp sampler3D;
uniform sampler3D uN;
uniform vec2  uRes;
uniform float uAspect, uK;
uniform vec3  uL;          // direction the light travels FROM the cloud TO the light
uniform vec2  uSunUV;      // sun (or moon) on screen, sky uv
uniform vec3  uTop, uShadow, uRim, uZenith, uHorizon, uGround;
uniform float uTh, uTall, uBacklit, uUnder, uSheet, uGrey;
uniform vec2  uWind, uWind2;
uniform float uEvo, uRise, uFadeTop, uFadeBot;
out vec4 o;
const float BASE = 2.2, THICK = 2.6, SC = 1.0;
float hash(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
float cover(vec2 xz){
  vec2 q = xz*SC + uWind;
  return 0.6*texture(uN, vec3(q*0.075, uEvo)).b + 0.4*texture(uN, vec3(q*0.19 + 0.31, uEvo*1.6 + 0.47)).b;
}
float dens(vec3 p, bool fine){
  float h = (p.y - BASE)/THICK;
  if (h < 0. || h > 1.) return 0.;
  float d0 = smoothstep(uTh, uTh + 0.36, cover(p.xz));
  if (d0 <= 0.) return 0.;
  float topH = (0.2 + 0.8*d0)*uTall;                       // strong cells build higher
  vec3 q = vec3(p.x*SC + uWind2.x, p.y*SC - uRise, p.z*SC + uWind2.y);
  float s = texture(uN, q*0.27).r;
  float hb = h + 0.16*(s - 0.5) + 0.12*(0.5 - d0);   // the base undulates and rises at the cell edge
  float prof = smoothstep(0., 0.16, hb)*(1. - smoothstep(topH*0.45, topH, h));
  float d = d0*prof - (1. - s)*0.72;                        // billows erode the cell
  if (fine && d < 0.35) d -= (1. - texture(uN, q*0.47 + vec3(0., -uRise*1.5, 0.)).g)*0.2*(1. - d/0.35);
  return clamp(d*2.7, 0., 1.);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec3 rd = normalize(vec3((uv.x - .5)*uAspect*uK, uv.y*uK + 0.012, 1.));
  vec3 fogc = mix(uHorizon, uZenith, smoothstep(0., 0.7, uv.y));
  vec3 C = vec3(0.); float T = 1.;
  float t0 = BASE/rd.y, t1 = min((BASE + THICK)/rd.y, t0 + 14.);
  if (t0 < 34.) {
    float dt = (t1 - t0)/${steps}., t = t0 + dt*hash(gl_FragCoord.xy);
    float glow = pow(clamp(1. - distance(uv*vec2(uAspect,1.), uSunUV*vec2(uAspect,1.))*1.1, 0., 1.), 3.);
    for (int i = 0; i < ${steps}; i++, t += dt) {
      vec3 p = rd*t;
      float d = dens(p, true)*(1. - smoothstep(22., 34., t));
      if (d < 0.004) continue;
      float h = (p.y - BASE)/THICK;
      float acc = 0., s = 0.16; vec3 lp = p;
      for (int k = 0; k < 4; k++) { lp += uL*s; acc += dens(lp, false)*s; s *= 1.9; }
      float beer = exp(-acc*3.2);
      float lit = max(beer, 0.5*exp(-acc*0.7));            // light that wandered in: cores never go black
      lit *= 0.62 + 0.38*(1. - exp(-d*5.));                 // powder: thin skin a little darker
      vec3 amb = mix(mix(uShadow, uGround, 0.28*(1. - uUnder)), mix(uShadow, uZenith, 0.25), smoothstep(0., 0.6, h));
      vec3 col = mix(amb, uTop, clamp(lit*1.15, 0., 1.));
      col = mix(col, uShadow*0.86, 0.55*(1. - uUnder)*(1. - smoothstep(0., 0.12, h))*(1. - beer));   // grey flat base
      col = mix(col, uRim, glow*beer*uBacklit*(1. - 0.6*d));                                       // silver lining toward the light
      col = mix(col, mix(uShadow, uTop, 0.45), uGrey);
      col = mix(col, fogc, 0.72*(1. - exp(-t*0.028)));     // distance changes colour, not opacity
      float a = 1. - exp(-d*dt*7.);
      C += T*a*col; T *= 1. - a;
      if (T < 0.02) { T = 0.; break; }
    }
  }
  // A thin high sheet behind the cumulus: one plane, no march.
  if (uSheet > 0.) {
    float ts = 7./rd.y; vec2 q = rd.xz*ts*vec2(0.012, 0.035) + uWind*0.3;
    float a = smoothstep(0.42, 0.85, texture(uN, vec3(q, uEvo*0.5 + 0.2)).b*0.7 + texture(uN, vec3(q*3.1, 0.6)).r*0.3)*uSheet*(1. - smoothstep(30., 70., ts));
    vec3 col = mix(mix(uShadow, uTop, 0.75), fogc, 0.6*(1. - exp(-ts*0.03)));
    C += T*a*col; T *= 1. - a;
  }
  float fade = (1. - smoothstep(1. - uFadeTop, 1., uv.y))*smoothstep(0., uFadeBot, uv.y);
  o = vec4(C*fade, (1. - T)*fade);   // premultiplied
}`;


export interface CloudField {
	readonly canvas: HTMLCanvasElement;
	/** False when WebGL2 is missing or lost, or the noise is still being built. */
	readonly ok: boolean;
	/** True while the noise is still being built (and the context is fine). */
	readonly pending: boolean;
	/** Advance the noise build a few ms; call every animation frame until ok. */
	pump(): void;
	resize(cssW: number, cssH: number, res: number, steps: number): void;
	render(u: CloudUniforms): void;
	dispose(): void;
}

/** Null when WebGL2 is unavailable. */
export function createCloudField(): CloudField | null {
	const canvas = document.createElement('canvas');
	const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true });
	if (!gl) return null;
	let prog: WebGLProgram | null = null;
	let U: Record<string, WebGLUniformLocation | null> = {};
	let ready = false, lost = false, curSteps = 0;
	let gen: Generator<void, Uint8Array> | null = makeNoise(20261128);
	let tex: WebGLTexture | null = null;
	let size: [number, number, number, number] = [0, 0, 0, 0];

	canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });

	function compile(steps: number): void {
		const sh = (t: number, src: string) => {
			const s = gl!.createShader(t)!; gl!.shaderSource(s, src); gl!.compileShader(s);
			if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) ?? 'shader');
			return s;
		};
		if (prog) gl!.deleteProgram(prog);
		prog = gl!.createProgram()!;
		gl!.attachShader(prog, sh(gl!.VERTEX_SHADER, VS)); gl!.attachShader(prog, sh(gl!.FRAGMENT_SHADER, FS(steps)));
		gl!.linkProgram(prog);
		if (!gl!.getProgramParameter(prog, gl!.LINK_STATUS)) throw new Error(gl!.getProgramInfoLog(prog) ?? 'link');
		gl!.useProgram(prog);
		U = {};
		for (let i = 0, n = gl!.getProgramParameter(prog, gl!.ACTIVE_UNIFORMS) as number; i < n; i++) {
			const u = gl!.getActiveUniform(prog, i)!; U[u.name] = gl!.getUniformLocation(prog, u.name);
		}
		curSteps = steps;
	}

	function upload(data: Uint8Array): void {
		tex = gl!.createTexture(); gl!.bindTexture(gl!.TEXTURE_3D, tex);
		gl!.texImage3D(gl!.TEXTURE_3D, 0, gl!.RGBA8, N, N, N, 0, gl!.RGBA, gl!.UNSIGNED_BYTE, data);
		for (const p of [gl!.TEXTURE_WRAP_S, gl!.TEXTURE_WRAP_T, gl!.TEXTURE_WRAP_R]) gl!.texParameteri(gl!.TEXTURE_3D, p, gl!.REPEAT);
		gl!.texParameteri(gl!.TEXTURE_3D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR); gl!.texParameteri(gl!.TEXTURE_3D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
		const b = gl!.createBuffer(); gl!.bindBuffer(gl!.ARRAY_BUFFER, b);
		gl!.bufferData(gl!.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl!.STATIC_DRAW);
		gl!.enableVertexAttribArray(0); gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
	}

	const api: CloudField = {
		canvas,
		get ok() { return ready && !lost; },
		get pending() { return !ready && !lost; },
		pump() {
			if (ready || !gen) return;
			const t0 = performance.now();
			while (performance.now() - t0 < 8) {
				const r = gen.next();
				if (r.done) { upload(r.value); ready = true; gen = null; return; }
			}
		},
		resize(cssW, cssH, res, steps) {
			const w = Math.max(2, Math.round(cssW * res)), h = Math.max(2, Math.round(cssH * res));
			if (lost) return;
			if (w !== size[0] || h !== size[1]) { canvas.width = w; canvas.height = h; }
			try { if (!prog || steps !== curSteps) compile(steps); } catch { lost = true; return; }
			gl.viewport(0, 0, canvas.width, canvas.height);
			size = [w, h, 0, 0];
		},
		render(u) {
			if (!api.ok || !prog) return;
			gl.useProgram(prog);
			const aspect = canvas.width / canvas.height;
			gl.uniform2f(U.uRes, canvas.width, canvas.height); gl.uniform1f(U.uAspect, aspect); gl.uniform1f(U.uK, 0.46);
			gl.uniform3f(U.uL, ...u.L); gl.uniform2f(U.uSunUV, ...u.sunUV);
			gl.uniform3fv(U.uTop, u.top); gl.uniform3fv(U.uShadow, u.shadow); gl.uniform3fv(U.uRim, u.rim);
			gl.uniform3fv(U.uZenith, u.zenith); gl.uniform3fv(U.uHorizon, u.horizon); gl.uniform3fv(U.uGround, u.ground);
			gl.uniform1f(U.uTh, u.th); gl.uniform1f(U.uTall, u.tall); gl.uniform1f(U.uBacklit, u.backlit);
			gl.uniform1f(U.uUnder, u.under); gl.uniform1f(U.uSheet, u.sheet); gl.uniform1f(U.uGrey, u.grey);
			gl.uniform2f(U.uWind, ...u.wind); gl.uniform2f(U.uWind2, ...u.wind2);
			gl.uniform1f(U.uEvo, u.evo); gl.uniform1f(U.uRise, u.rise); gl.uniform1f(U.uFadeTop, 0.12); gl.uniform1f(U.uFadeBot, 0.3);
			gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		},
		dispose() { try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* gone */ } lost = true; },
	};
	return api;
}
