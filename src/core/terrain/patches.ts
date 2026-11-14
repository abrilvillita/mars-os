/**
 * Evaluation of localized geometry patches (see contract/changes.ts).
 * Pure functions: given a patch and a point, return the height delta in meters.
 */
import type { BBoxT, FalloffT, GeometryPatchT } from '../../contract';
import { circleBBox, distanceM } from '../geo/mars';
import { parseCellId, tileBBox } from '../geo/tiling';

const G = Math.exp(-4.5);
function falloff(t: number, kind: FalloffT) {
  if (t >= 1) return 0;
  switch (kind) {
    case 'gaussian':
      return (Math.exp(-4.5 * t * t) - G) / (1 - G);
    case 'cosine':
      return 0.5 * (1 + Math.cos(Math.PI * t));
    case 'linear':
      return 1 - t;
    case 'flat':
      return 1;
  }
}

export function patchBBox(p: GeometryPatchT): BBoxT {
  if (p.type === 'radial') return circleBBox(p.center.lat, p.center.lon, p.radius_m);
  const t = parseCellId(p.cellId);
  if (!t) throw new Error('Invalid cellId ' + p.cellId);
  return tileBBox(t);
}

/** Pre-computed evaluator for speed during mesh building. */
export interface CompiledPatch {
  patch: GeometryPatchT;
  bbox: BBoxT;
  delta(lat: number, lon: number): number;
}

export function compilePatch(p: GeometryPatchT): CompiledPatch {
  const bbox = patchBBox(p);
  if (p.type === 'radial') {
    return {
      patch: p,
      bbox,
      delta: (lat, lon) => {
        if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) return 0;
        const d = distanceM(p.center.lat, p.center.lon, lat, lon);
        return p.delta_m * falloff(d / p.radius_m, p.falloff);
      },
    };
  }
  const N = p.gridSize;
  const grid = new Float32Array(N * N);
  for (const o of p.offsets) if (o.i < N && o.j < N) grid[o.j * N + o.i] = o.delta_m;
  return {
    patch: p,
    bbox,
    delta: (lat, lon) => {
      if (lat < bbox.south || lat > bbox.north || lon < bbox.west || lon > bbox.east) return 0;
      const fx = ((lon - bbox.west) / (bbox.east - bbox.west)) * (N - 1);
      const fy = ((bbox.north - lat) / (bbox.north - bbox.south)) * (N - 1);
      const i0 = Math.min(N - 2, Math.floor(fx)), j0 = Math.min(N - 2, Math.floor(fy));
      const tx = fx - i0, ty = fy - j0;
      const a = grid[j0 * N + i0], b = grid[j0 * N + i0 + 1], c = grid[(j0 + 1) * N + i0], d = grid[(j0 + 1) * N + i0 + 1];
      return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
    },
  };
}
