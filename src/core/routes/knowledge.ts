/**
 * "How well do we know this ground?" — classifies each point of a route into three levels:
 *
 *   ground   within GROUND_M of where Perseverance actually drove (published traverse):
 *            a rover has physically crossed or passed right next to it
 *   orbital  covered by the 20 m CTX DEM (orbital stereo, metre-scale imagery available)
 *   coarse   only coarse orbital elevation (MOLA, ≥ ~460 m/px): slopes are smoothed
 *
 * Pure logic, no rendering. The traverse comes from NASA's MMGIS feed (see core/live/m20).
 */
import { DEG, M_PER_DEG } from '../geo/mars';
import type { LatLonPt, Route } from './RoutePlanner';

export const GROUND_M = 50;

export interface TrackIndex {
  near(lat: number, lon: number, maxM?: number): boolean;
}

/** Bucket the (≈3 m spaced) traverse points so "is this point near the rover's path" is O(1). */
export function buildTrackIndex(track: LatLonPt[]): TrackIndex {
  const cellDeg = 0.002; // ≈ 118 m in latitude
  const buckets = new Map<string, LatLonPt[]>();
  for (const p of track) {
    const k = `${Math.floor(p.lat / cellDeg)}:${Math.floor(p.lon / cellDeg)}`;
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = []));
    b.push(p);
  }
  return {
    near(lat, lon, maxM = GROUND_M) {
      const bi = Math.floor(lat / cellDeg), bj = Math.floor(lon / cellDeg);
      const mLon = M_PER_DEG * Math.cos(lat * DEG);
      const max2 = maxM * maxM;
      for (let di = -1; di <= 1; di++)
        for (let dj = -1; dj <= 1; dj++) {
          const b = buckets.get(`${bi + di}:${bj + dj}`);
          if (!b) continue;
          for (const p of b) {
            const dy = (p.lat - lat) * M_PER_DEG, dx = (p.lon - lon) * mLon;
            if (dx * dx + dy * dy <= max2) return true;
          }
        }
      return false;
    },
  };
}

export interface KnowledgeShares {
  ground: number;
  orbital: number;
  coarse: number;
}

/** Length-weighted share of a route in each knowledge level (sums to 1). */
export function knowledgeFor(route: Route, idx: TrackIndex | null): KnowledgeShares {
  let g = 0, o = 0, c = 0;
  const pts = route.points;
  for (let k = 1; k < pts.length; k++) {
    const p = pts[k - 1], q = pts[k];
    const run = Math.hypot((q.lat - p.lat) * M_PER_DEG, (q.lon - p.lon) * M_PER_DEG * Math.cos(q.lat * DEG));
    const mLat = (p.lat + q.lat) / 2, mLon = (p.lon + q.lon) / 2;
    if (idx?.near(mLat, mLon)) g += run;
    else if (Math.max(p.dataMpp, q.dataMpp) <= 20) o += run;
    else c += run;
  }
  const t = g + o + c || 1;
  return { ground: g / t, orbital: o / t, coarse: c / t };
}
