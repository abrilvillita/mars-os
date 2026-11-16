/**
 * Mapped dune fields (Mars Global Digital Dune Database, Hayward et al., USGS; served by NASA
 * Mars Trek "Dune_Field", 547 fields between about 65°N and 65°S). Used as a sand-hazard
 * indicator for routes. It maps dune FIELDS, not every ripple or sand patch.
 */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import { distanceM } from '../geo/mars';
import { getAllFeatures } from './minerals';

export const DUNE_SERVICE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services/Dune_Field/MapServer/0';

export interface DuneField {
  id: string;
  lat: number;
  lon: number;
  type: string;
  rings: [number, number][][];
  bbox: [number, number, number, number]; // west, south, east, north
}

export const duneData: { fields: DuneField[] | null; error: string | null; loading: Promise<void> | null } = { fields: null, error: null, loading: null };
const lon180 = (l: number) => (l > 180 ? l - 360 : l);

export function ensureDunes() {
  if (!duneData.loading) {
    duneData.loading = getAllFeatures(DUNE_SERVICE)
      .then(({ features }) => {
        const out: DuneField[] = [];
        for (const f of features) {
          const g = f.geometry as { type: string; coordinates: number[][][] | number[][][][] };
          const polys = g?.type === 'Polygon' ? [g.coordinates as number[][][]] : g?.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [];
          const rings: [number, number][][] = [];
          for (const p of polys) rings.push(p[0].map(([lo, la]) => [lon180(lo), la] as [number, number]));
          if (!rings.length) continue;
          const all = rings.flat();
          const p = f.properties ?? {};
          out.push({
            id: String(p.Dune_ID ?? p.FID),
            lat: Number(p.Dune_Lat),
            lon: lon180(Number(p.Dune_Lon)),
            type: String(p.Dune_Type ?? ''),
            rings,
            bbox: [Math.min(...all.map((q) => q[0])), Math.min(...all.map((q) => q[1])), Math.max(...all.map((q) => q[0])), Math.max(...all.map((q) => q[1]))],
          });
        }
        duneData.fields = out;
      })
      .catch((e: Error) => {
        duneData.error = e.message;
        duneData.loading = null;
      });
  }
  return duneData.loading ?? Promise.resolve();
}

/** Is a point inside a mapped dune field, and how far is the nearest field edge (approx., m)? */
export function duneAt(lat: number, lon: number) {
  let inside: DuneField | null = null;
  let best = Infinity;
  let nearest: DuneField | null = null;
  for (const f of duneData.fields ?? []) {
    const [w, s, e, n] = f.bbox;
    const inBox = lon >= w && lon <= e && lat >= s && lat <= n;
    if (inBox && !inside) {
      for (const r of f.rings) {
        try {
          if (booleanPointInPolygon(point([lon, lat]), { type: 'Polygon', coordinates: [r] })) inside = f;
        } catch {
          /* malformed ring */
        }
      }
    }
    // cheap pre-filter: skip a field when even its bounding box cannot beat the best distance so far
    const cLat = (s + n) / 2, cLon = (w + e) / 2;
    const half = distanceM(s, w, n, e) / 2;
    if (distanceM(lat, lon, cLat, cLon) - half > best) continue;
    for (const r of f.rings) for (let k = 0; k < r.length; k += 2) {
      const d = distanceM(lat, lon, r[k][1], r[k][0]);
      if (d < best) { best = d; nearest = f; }
    }
  }
  return { inside, nearestM: inside ? 0 : best, nearest };
}
