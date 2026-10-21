#!/usr/bin/env node
// Traces the real western skyline as seen from downtown Reno and writes it to
// src/lib/ridge.json for Ridge.svelte.
//
// For each azimuth from SOUTH to NORTH (looking west, south is on the left), it
// samples SRTM 90m elevations along a ray and keeps the highest elevation angle,
// with earth curvature and standard refraction. That is the skyline: the outline
// of the Carson Range (Slide Mountain, Mt Rose) running into Peavine Peak.
//
// Elevations come from the public OpenTopoData API (100 points per request,
// 1 request per second). A full run is about 100 requests. Run it only to
// change the viewpoint or the resolution; the output is committed.
//
//   node scripts/trace-ridge.mjs

import fs from 'node:fs';

const VIEW = { lat: 39.5296, lng: -119.8138, name: 'Downtown Reno (Virginia St & 1st St)' };
const EYE = 2; // metres above ground
const SOUTH = 180, NORTH = 340, STEP = 1; // azimuth range in degrees, clockwise from north
const DISTS = Array.from({ length: 64 }, (_, i) => 400 * Math.pow(1.075, i)); // ~0.4 km to ~40 km
const R = 6371000, K = 0.13; // earth radius, refraction coefficient

const OUT = new URL('../src/lib/ridge.json', import.meta.url);
const API = 'https://api.opentopodata.org/v1/srtm90m';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function destination(lat, lng, azDeg, d) {
	const rad = Math.PI / 180, δ = d / R, θ = azDeg * rad, φ1 = lat * rad, λ1 = lng * rad;
	const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
	const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
	return [φ2 / rad, λ2 / rad];
}

async function elevations(points) {
	const out = [];
	for (let i = 0; i < points.length; i += 100) {
		const batch = points.slice(i, i + 100);
		const q = batch.map(([a, b]) => `${a.toFixed(5)},${b.toFixed(5)}`).join('|');
		for (let attempt = 0; ; attempt++) {
			const res = await fetch(`${API}?locations=${q}`);
			if (res.ok) {
				const body = await res.json();
				out.push(...body.results.map((r) => r.elevation ?? 0));
				break;
			}
			if (attempt === 4) throw new Error(`OpenTopoData ${res.status} after 5 attempts`);
			await sleep(3000);
		}
		process.stderr.write(`\r${Math.min(i + 100, points.length)}/${points.length}`);
		await sleep(1100);
	}
	process.stderr.write('\n');
	return out;
}

const azimuths = [];
for (let az = SOUTH; az <= NORTH; az += STEP) azimuths.push(az);
const points = [[VIEW.lat, VIEW.lng]];
for (const az of azimuths) for (const d of DISTS) points.push(destination(VIEW.lat, VIEW.lng, az, d));

const elev = await elevations(points);
const h0 = elev[0] + EYE;
let k = 1;
const skyline = azimuths.map((az) => {
	let best = -90;
	for (const d of DISTS) {
		const drop = (d * d * (1 - K)) / (2 * R);
		const angle = (Math.atan((elev[k++] - h0 - drop) / d) * 180) / Math.PI;
		if (angle > best) best = angle;
	}
	return [az, +best.toFixed(3)];
});

fs.writeFileSync(OUT, JSON.stringify({
	source: 'SRTM 90m via OpenTopoData, traced by scripts/trace-ridge.mjs',
	viewpoint: { ...VIEW, groundElevation: elev[0] },
	azimuthRange: [SOUTH, NORTH],
	// [azimuth°, elevation angle° of the skyline], south (left) to north (right)
	skyline,
}) + '\n');
const top = skyline.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`wrote ${skyline.length} azimuths; highest ${top[1]}° at azimuth ${top[0]}°`);
