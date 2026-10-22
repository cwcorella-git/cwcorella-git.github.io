// The sun at the garden's latitude, on the visitor's own clock (2026-10-22).
//
// The garden shows the visitor's time of day, so the clock is theirs, not
// Reno's. What used to be wrong is that the clock hour was taken as solar
// time: in daylight saving the sun ran an hour ahead, and the equation of
// time added up to a quarter hour more. solarHour removes both. Longitude
// within the time zone is unknown, so the zone's own meridian stands in
// (off by at most about half an hour, and nil at Reno).

const rad = Math.PI / 180;
export const GARDEN_LAT = 39.53;   // Reno, NV

export function dayOfYear(d: Date): number {
	return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
}

function declinationDeg(d: Date): number {
	return 23.45 * Math.sin(rad * (360 / 365) * (dayOfYear(d) - 81));
}

/** Local apparent solar time in hours: 12 is when the sun is highest. */
export function solarHour(d: Date): number {
	const y = d.getFullYear();
	const std = Math.max(new Date(y, 0, 1).getTimezoneOffset(), new Date(y, 6, 1).getTimezoneOffset());
	const dst = (std - d.getTimezoneOffset()) / 60;
	const B = rad * (360 / 365) * (dayOfYear(d) - 81);
	const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);   // minutes
	return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600 - dst + eot / 60;
}

export function sunAltitudeDeg(d: Date, latDeg = GARDEN_LAT): number {
	const decl = declinationDeg(d) * rad, lat = latDeg * rad;
	const ha = 15 * (solarHour(d) - 12) * rad;
	const s = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
	return Math.asin(Math.max(-1, Math.min(1, s))) / rad;
}

/** Solar azimuth, degrees clockwise from north. */
export function sunAzimuthDeg(d: Date, latDeg = GARDEN_LAT): number {
	const decl = declinationDeg(d) * rad, lat = latDeg * rad;
	const ha = 15 * (solarHour(d) - 12) * rad;
	const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
	return (az / rad + 180 + 360) % 360;
}

/** Sunrise → 1 (right), solar noon → 0.5, sunset → 0 (left). */
export function sunXNorm(d: Date, latDeg = GARDEN_LAT): number {
	const decl = declinationDeg(d) * rad;
	const cosH0 = Math.max(-1, Math.min(1, -Math.tan(latDeg * rad) * Math.tan(decl)));
	const H0 = Math.acos(cosH0) * 12 / Math.PI;
	return Math.max(0, Math.min(1, 1 - (solarHour(d) - (12 - H0)) / (2 * H0)));
}
