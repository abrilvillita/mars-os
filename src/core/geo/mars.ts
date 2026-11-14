/**
 * Mars reference constants and coordinate conversions.
 *
 * Scene convention (renderer-agnostic, but shared with render/): 1 scene unit = 1 km,
 * body-fixed frame, +Y = north pole, +X = (lat 0, lon 0), east longitude increases
 * counter-clockwise when seen from +Y (i.e. towards -Z at lon 90E).
 */
import type { BBoxT } from '../../contract';

/** IAU 2015 Mars sphere radius (meters) — used for rendering and great-circle distances. */
export const MARS_RADIUS_M = 3_396_190;
export const MARS_RADIUS_KM = MARS_RADIUS_M / 1000;
/** Atmospheric scale height (km), commonly cited mean value. Used only for labelled model estimates. */
export const MARS_SCALE_HEIGHT_KM = 11.1;

export const DEG = Math.PI / 180;

export function normalizeLon(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lon > 0) l = 180;
  return l;
}

/** Writes the body-fixed position (km) of (lat, lon, height_m) into `out` ([x,y,z]). */
export function latLonToXYZ(lat: number, lon: number, height_m = 0, out: number[] = [0, 0, 0]): number[] {
  const r = MARS_RADIUS_KM + height_m / 1000;
  const phi = lat * DEG, lam = lon * DEG;
  const c = Math.cos(phi);
  out[0] = r * c * Math.cos(lam);
  out[1] = r * Math.sin(phi);
  out[2] = -r * c * Math.sin(lam);
  return out;
}

export function xyzToLatLon(x: number, y: number, z: number): { lat: number; lon: number; r_km: number } {
  const r = Math.hypot(x, y, z);
  return { lat: Math.asin(y / r) / DEG, lon: Math.atan2(-z, x) / DEG, r_km: r };
}

/** Great-circle distance on the Mars sphere, meters. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dp = (lat2 - lat1) * DEG, dl = (lon2 - lon1) * DEG;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * MARS_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Meters per degree of latitude on the sphere. */
export const M_PER_DEG = (MARS_RADIUS_M * Math.PI) / 180;

/** BBox of a circle (center, radius m). Ignores antimeridian wrap (fine for local patches). */
export function circleBBox(lat: number, lon: number, radius_m: number): BBoxT {
  const dLat = radius_m / M_PER_DEG;
  const dLon = radius_m / (M_PER_DEG * Math.max(0.01, Math.cos(lat * DEG)));
  return {
    west: Math.max(-180, lon - dLon),
    east: Math.min(180, lon + dLon),
    south: Math.max(-90, lat - dLat),
    north: Math.min(90, lat + dLat),
  };
}

export function bboxIntersects(a: BBoxT, b: BBoxT): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

export function bboxContainsPoint(b: BBoxT, lat: number, lon: number): boolean {
  return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
}

export function bboxUnion(a: BBoxT | null, b: BBoxT | null): BBoxT | null {
  if (!a) return b;
  if (!b) return a;
  return {
    west: Math.min(a.west, b.west),
    east: Math.max(a.east, b.east),
    south: Math.min(a.south, b.south),
    north: Math.max(a.north, b.north),
  };
}

export function formatLat(lat: number, digits = 4) {
  return `${Math.abs(lat).toFixed(digits)}°${lat >= 0 ? 'N' : 'S'}`;
}
export function formatLon(lon: number, digits = 4) {
  return `${Math.abs(lon).toFixed(digits)}°${lon >= 0 ? 'E' : 'W'}`;
}
export function formatDistance(m: number) {
  if (m >= 10_000) return `${(m / 1000).toFixed(0)} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  if (m >= 10) return `${m.toFixed(0)} m`;
  return `${m.toFixed(2)} m`;
}
