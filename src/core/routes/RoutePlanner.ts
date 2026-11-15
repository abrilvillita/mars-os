/**
 * Route comparison for a Marswalk (pure logic, no rendering).
 *
 * Builds a grid over the area between start and end, samples the CURRENT terrain model
 * (source elevation + approved edits) at a spacing the data supports, and runs A* twice:
 *
 *   shortest   minimise distance; edges steeper than the hard slope limit are impassable
 *   lowSlope   minimise distance weighted by slope and uncertain (coarse-data) ground
 *
 * What is measured vs assumed:
 *   - slopes, lengths, elevation gain/loss → computed from the elevation products (real data)
 *   - slope limits and weights            → editable PLANNING ASSUMPTIONS (not validated EVA rules)
 *   - walking time                         → Tobler's hiking function (Earth heuristic), labelled as such
 *   - rover drive time                     → lower bound at Perseverance's top speed (152 m/h, NASA)
 *   - data limits                          → share of the route where the elevation source is coarser than 20 m
 */
import type { BBoxT } from '../../contract';
import { DEG, M_PER_DEG, distanceM } from '../geo/mars';

export interface LatLonPt {
  lat: number;
  lon: number;
}

export interface RouteAssumptions {
  /** Edges steeper than this are not walkable (degrees). */
  maxSlopeDeg: number;
  /** Above this slope the ground counts as "caution" (degrees). */
  cautionSlopeDeg: number;
  /** How strongly the low-slope route avoids steep ground (0 = ignore slope). */
  slopeWeight: number;
}

export const DEFAULT_ASSUMPTIONS: RouteAssumptions = { maxSlopeDeg: 25, cautionSlopeDeg: 15, slopeWeight: 6 };

/** Who travels the route. Only the defaults and the time estimate differ. */
export type TravelerProfile = 'rover' | 'astronaut';

/**
 * Rover: 24° = the tilt limit NASA's Perseverance team set in 2026 ("Tracks Along the Longest
 * Drive on Another World", science.nasa.gov, Oct 2026). Terrain slope on a 20 m grid is only a
 * proxy for vehicle tilt (rocks under single wheels add more), so it stays an assumption.
 * Astronaut: unvalidated planning numbers (no public EVA slope rule is used).
 */
export const PROFILE_ASSUMPTIONS: Record<TravelerProfile, RouteAssumptions> = {
  rover: { maxSlopeDeg: 24, cautionSlopeDeg: 15, slopeWeight: 6 },
  astronaut: { ...DEFAULT_ASSUMPTIONS },
};

/** Perseverance top speed on flat hard ground: 4.2 cm/s = 152 m/h (NASA). Real drives are slower. */
export const ROVER_TOP_SPEED_M_PER_H = 152;

export interface RouteStats {
  lengthM: number;
  gainM: number;
  lossM: number;
  maxSlopeDeg: number;
  meanSlopeDeg: number;
  cautionShare: number; // fraction of length steeper than cautionSlopeDeg
  dataLimitedShare: number; // fraction of length where elevation source is coarser than 20 m
  coarsestDataM: number;
  toblerHours: number;
  /** Driving time at Perseverance's top speed: a lower bound, never a forecast. */
  roverHours: number;
}

export interface Route {
  kind: 'shortest' | 'lowSlope' | 'actual';
  points: (LatLonPt & { h: number; slopeDeg: number; dataMpp: number })[];
  stats: RouteStats;
}

export interface RouteResult {
  ok: boolean;
  error?: 'no_path' | 'too_far' | 'same_point';
  start: LatLonPt;
  end: LatLonPt;
  cellM: number;
  gridSize: [number, number];
  bbox: BBoxT;
  routes: Route[];
  /** Applied terrain patches that intersect the analysed area (for change explanations). */
  patchIds: string[];
  computedAt: string;
}

export interface TerrainSampler {
  /** Final height (m) including approved edits, sampled at a resolution of ~wantMpp. */
  height(lat: number, lon: number, wantMpp: number): number;
  /** Resolution (m/px) of the finest elevation source available at a point. */
  resolution(lat: number, lon: number): number;
}

const MAX_CELLS = 70_000;
const MAX_DISTANCE_M = 25_000;

/** Tobler (1993) hiking function, km/h, for signed gradient dh/dx. Earth heuristic. */
function toblerKmh(grad: number) {
  return 6 * Math.exp(-3.5 * Math.abs(grad + 0.05));
}

class MinHeap {
  private a: number[] = [];
  private p: Float64Array;
  constructor(n: number) {
    this.p = new Float64Array(n);
  }
  get size() {
    return this.a.length;
  }
  push(i: number, prio: number) {
    this.p[i] = prio;
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const par = (k - 1) >> 1;
      if (this.p[a[par]] <= this.p[a[k]]) break;
      [a[par], a[k]] = [a[k], a[par]];
      k = par;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = k;
        if (l < a.length && this.p[a[l]] < this.p[a[m]]) m = l;
        if (r < a.length && this.p[a[r]] < this.p[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

export interface PreparedGrid {
  bbox: BBoxT;
  w: number;
  h: number;
  cellM: number;
  dLat: number;
  dLon: number;
  heights: Float32Array;
  dataMpp: Float32Array;
  latOf(j: number): number;
  lonOf(i: number): number;
}

/** Grid geometry for a start/end pair (call `sampleGrid` to fill heights). */
export function gridFor(start: LatLonPt, end: LatLonPt, minCellM: number) {
  const d = distanceM(start.lat, start.lon, end.lat, end.lon);
  const margin = Math.max(400, d * 0.35);
  const midLat = (start.lat + end.lat) / 2;
  const mLon = M_PER_DEG * Math.cos(midLat * DEG);
  const south = Math.min(start.lat, end.lat) - margin / M_PER_DEG;
  const north = Math.max(start.lat, end.lat) + margin / M_PER_DEG;
  const west = Math.min(start.lon, end.lon) - margin / mLon;
  const east = Math.max(start.lon, end.lon) + margin / mLon;
  const spanX = (east - west) * mLon, spanY = (north - south) * M_PER_DEG;
  // never finer than the data supports, never more than MAX_CELLS
  const cellM = Math.max(minCellM, Math.sqrt((spanX * spanY) / MAX_CELLS));
  const w = Math.max(8, Math.round(spanX / cellM)), h = Math.max(8, Math.round(spanY / cellM));
  return { bbox: { west, east, south, north }, w, h, cellM, distanceM: d };
}

export function sampleGrid(start: LatLonPt, end: LatLonPt, terrain: TerrainSampler): PreparedGrid {
  const minCell = Math.max(terrain.resolution(start.lat, start.lon), terrain.resolution(end.lat, end.lon), 20);
  const g = gridFor(start, end, minCell);
  const { bbox, w, h, cellM } = g;
  const dLat = (bbox.north - bbox.south) / (h - 1), dLon = (bbox.east - bbox.west) / (w - 1);
  const heights = new Float32Array(w * h), dataMpp = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    const lat = bbox.north - j * dLat;
    for (let i = 0; i < w; i++) {
      const lon = bbox.west + i * dLon;
      heights[j * w + i] = terrain.height(lat, lon, cellM);
      dataMpp[j * w + i] = terrain.resolution(lat, lon);
    }
  }
  return {
    bbox, w, h, cellM, dLat, dLon, heights, dataMpp,
    latOf: (j) => bbox.north - j * dLat,
    lonOf: (i) => bbox.west + i * dLon,
  };
}

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

function astar(g: PreparedGrid, s: number, t: number, kind: Route['kind'], a: RouteAssumptions): number[] | null {
  const { w, h, heights, dataMpp } = g;
  const midLat = (g.bbox.north + g.bbox.south) / 2;
  const dx = g.dLon * M_PER_DEG * Math.cos(midLat * DEG), dy = g.dLat * M_PER_DEG;
  const maxTan = Math.tan(a.maxSlopeDeg * DEG), cautionTan = Math.tan(a.cautionSlopeDeg * DEG);
  const n = w * h;
  const gScore = new Float64Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap(n);
  const ti = t % w, tj = Math.floor(t / w);
  const heur = (k: number) => {
    const ex = Math.abs((k % w) - ti) * dx, ey = Math.abs(Math.floor(k / w) - tj) * dy;
    return Math.max(ex, ey) + (Math.SQRT2 - 1) * Math.min(ex, ey); // octile, admissible (cost ≥ distance)
  };
  gScore[s] = 0;
  heap.push(s, heur(s));
  while (heap.size) {
    const k = heap.pop();
    if (k === t) break;
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % w, j = Math.floor(k / w);
    for (const [di, dj] of NB) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= h) continue;
      const m = nj * w + ni;
      if (closed[m]) continue;
      const run = Math.hypot(di * dx, dj * dy);
      const tan = Math.abs(heights[m] - heights[k]) / run;
      if (tan > maxTan) continue; // not walkable under the assumptions
      let cost = run;
      if (kind === 'lowSlope') {
        const r = tan / maxTan;
        cost *= 1 + a.slopeWeight * r * r + (tan > cautionTan ? a.slopeWeight * 0.5 : 0);
        if (dataMpp[m] > 20) cost *= 1.15; // prefer ground covered by the 20 m DEM (better-known terrain)
      }
      const ng = gScore[k] + cost;
      if (ng < gScore[m]) {
        gScore[m] = ng;
        came[m] = k;
        heap.push(m, ng + heur(m));
      }
    }
  }
  if (!Number.isFinite(gScore[t])) return null;
  const path: number[] = [];
  for (let k = t; k !== -1; k = came[k]) path.push(k);
  return path.reverse();
}

type PathPt = { lat: number; lon: number; h: number; mpp: number };

function statsForPoints(src: PathPt[], a: RouteAssumptions): Omit<Route, 'kind'> {
  const pts: Route['points'] = [];
  let len = 0, gain = 0, loss = 0, maxS = 0, slopeLen = 0, caution = 0, limited = 0, coarsest = 0, hours = 0;
  for (let q = 0; q < src.length; q++) {
    const { lat, lon, h: hgt, mpp } = src[q];
    let slope = 0;
    if (q > 0) {
      const p = pts[q - 1];
      const run = Math.max(1e-6, distanceM(p.lat, p.lon, lat, lon));
      const dh = hgt - p.h;
      slope = Math.atan(Math.abs(dh) / run) / DEG;
      len += run;
      if (dh > 0) gain += dh;
      else loss -= dh;
      maxS = Math.max(maxS, slope);
      slopeLen += slope * run;
      if (slope > a.cautionSlopeDeg) caution += run;
      if (mpp > 20) limited += run;
      hours += run / 1000 / toblerKmh(dh / run);
    }
    coarsest = Math.max(coarsest, mpp);
    pts.push({ lat, lon, h: hgt, slopeDeg: slope, dataMpp: mpp });
  }
  return {
    points: pts,
    stats: {
      lengthM: len, gainM: gain, lossM: loss, maxSlopeDeg: maxS,
      meanSlopeDeg: len ? slopeLen / len : 0,
      cautionShare: len ? caution / len : 0,
      dataLimitedShare: len ? limited / len : 0,
      coarsestDataM: coarsest,
      toblerHours: hours,
      roverHours: len / ROVER_TOP_SPEED_M_PER_H,
    },
  };
}

function statsFor(g: PreparedGrid, path: number[], a: RouteAssumptions) {
  return statsForPoints(
    path.map((k) => {
      const i = k % g.w, j = Math.floor(k / g.w);
      return { lat: g.latOf(j), lon: g.lonOf(i), h: g.heights[k], mpp: g.dataMpp[k] };
    }),
    a,
  );
}

/**
 * Measure a GIVEN path (e.g. the drive Perseverance really made) with the same rules as the
 * computed routes: resampled at the grid spacing, heights from the current terrain model.
 */
export function measurePath(path: LatLonPt[], terrain: TerrainSampler, cellM: number, a: RouteAssumptions): Route {
  const out: PathPt[] = [];
  const add = (lat: number, lon: number) => out.push({ lat, lon, h: terrain.height(lat, lon, cellM), mpp: terrain.resolution(lat, lon) });
  if (path.length) add(path[0].lat, path[0].lon);
  let carry = 0;
  for (let k = 1; k < path.length; k++) {
    const p = path[k - 1], q = path[k];
    const d = distanceM(p.lat, p.lon, q.lat, q.lon);
    let at = cellM - carry;
    while (at <= d) {
      const f = at / d;
      add(p.lat + (q.lat - p.lat) * f, p.lon + (q.lon - p.lon) * f);
      at += cellM;
    }
    carry = d - (at - cellM);
  }
  const last = path[path.length - 1];
  if (last && carry > 1) add(last.lat, last.lon);
  return { ...statsForPoints(out, a), kind: 'actual' };
}

export function planRoutes(start: LatLonPt, end: LatLonPt, g: PreparedGrid, a: RouteAssumptions, patchIds: string[]): RouteResult {
  const base = { start, end, cellM: g.cellM, gridSize: [g.w, g.h] as [number, number], bbox: g.bbox, patchIds, computedAt: new Date().toISOString() };
  const d = distanceM(start.lat, start.lon, end.lat, end.lon);
  if (d < 2 * g.cellM) return { ...base, ok: false, error: 'same_point', routes: [] };
  if (d > MAX_DISTANCE_M) return { ...base, ok: false, error: 'too_far', routes: [] };
  const idx = (p: LatLonPt) => {
    const i = Math.round((p.lon - g.bbox.west) / g.dLon), j = Math.round((g.bbox.north - p.lat) / g.dLat);
    return Math.max(0, Math.min(g.h - 1, j)) * g.w + Math.max(0, Math.min(g.w - 1, i));
  };
  const s = idx(start), t = idx(end);
  const routes: Route[] = [];
  for (const kind of ['shortest', 'lowSlope'] as const) {
    const path = astar(g, s, t, kind, a);
    if (!path) return { ...base, ok: false, error: 'no_path', routes: [] };
    routes.push({ ...statsFor(g, path, a), kind });
  }
  return { ...base, ok: true, routes };
}

export const MAX_ROUTE_DISTANCE_M = MAX_DISTANCE_M;
