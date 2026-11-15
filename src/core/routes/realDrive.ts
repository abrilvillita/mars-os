/**
 * Extract a real Perseverance drive between two sols from NASA's published traverse
 * (MMGIS M20_traverse + M20_waypoints). Pure logic, no rendering.
 */
import { distanceM } from '../geo/mars';
import type { TraverseSegment, Waypoint } from '../live/m20';
import type { LatLonPt } from './RoutePlanner';

export interface RealDrive {
  fromSol: number;
  toSol: number;
  start: LatLonPt & { rmc: string };
  end: LatLonPt & { rmc: string };
  path: LatLonPt[];
  /** Length of the published drive geometry (m). */
  lengthM: number;
  drives: number;
}

/** Last rover position reported on or before a sol (largest odometry wins within a sol). */
function positionAt(wps: Waypoint[], sol: number): Waypoint | null {
  let best: Waypoint | null = null;
  for (const w of wps) {
    if (w.sol > sol) continue;
    if (!best || w.sol > best.sol || (w.sol === best.sol && (w.distTotal_m ?? 0) >= (best.distTotal_m ?? 0))) best = w;
  }
  // before the first reported position (e.g. sol 0 vs landing reported on sol 13): use the earliest
  if (!best) for (const w of wps) if (!best || w.sol < best.sol) best = w;
  return best;
}

export function extractRealDrive(segments: TraverseSegment[], wps: Waypoint[], fromSol: number, toSol: number): RealDrive | null {
  if (!(toSol > fromSol)) return null;
  const a = positionAt(wps, fromSol), b = positionAt(wps, toSol);
  if (!a || !b || a === b) return null;
  const segs = segments.filter((s) => s.sol > fromSol && s.sol <= toSol).sort((x, y) => x.sol - y.sol);
  if (!segs.length) return null;
  const path: LatLonPt[] = [{ lat: a.lat, lon: a.lon }];
  let len = 0;
  const push = (lat: number, lon: number) => {
    const l = path[path.length - 1];
    const d = distanceM(l.lat, l.lon, lat, lon);
    if (d < 1) return;
    len += d;
    path.push({ lat, lon });
  };
  for (const s of segs) for (const [lon, lat] of s.coords) push(lat, lon);
  push(b.lat, b.lon);
  return {
    fromSol, toSol,
    start: { lat: a.lat, lon: a.lon, rmc: a.rmc },
    end: { lat: b.lat, lon: b.lon, rmc: b.rmc },
    path, lengthM: len, drives: segs.length,
  };
}
