/**
 * Water-ice evidence from NASA Mars Trek ArcGIS services (CORS-enabled, verified 2026-11-15):
 *
 *  - icy impact sites: fresh craters whose excavated bright material was confirmed as water
 *    ice by HiRISE/CRISM (Dundas et al. 2014, JGR) — direct evidence of ice within ~1 m
 *  - glacier-like forms: debris-covered glaciers mapped from orbit (catalogue of 1,309 GLFs,
 *    2012 survey in the Trek "Mars_Fans_Glaciers_Gullies" service) — buried ice
 *
 * These are published positions of evidence, not an ice-depth or abundance map.
 */
import { distanceM } from '../geo/mars';
import { getAllFeatures } from './minerals';

const BASE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services';
export const ICE_SERVICES = {
  craters: `${BASE}/RSLs_Gullies_New_IcyCraters_clon0/MapServer/0`,
  glaciers: `${BASE}/Mars_Fans_Glaciers_Gullies/MapServer/1`,
} as const;

export interface IcePoint {
  id: string;
  kind: 'icyCrater' | 'glacier';
  lat: number;
  lon: number;
  ref: string;
  lengthKm?: number;
}

const lon180 = (l: number) => (l > 180 ? l - 360 : l);

export const iceData: { points: IcePoint[] | null; error: string | null; loading: Promise<void> | null } = { points: null, error: null, loading: null };

async function loadIce(): Promise<IcePoint[]> {
  const [cr, gl] = await Promise.all([getAllFeatures(ICE_SERVICES.craters), getAllFeatures(ICE_SERVICES.glaciers)]);
  const out: IcePoint[] = [];
  for (const f of cr.features) {
    const p = f.properties ?? {};
    if (!/icy impact/i.test(String(p.Type ?? ''))) continue;
    const [lon, lat] = (f.geometry?.coordinates as number[]) ?? [];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({ id: `ice-c-${p.FID}`, kind: 'icyCrater', lat, lon: lon180(lon), ref: String(p.Ref ?? 'Dundas et al. (2014, JGR)') });
  }
  for (const f of gl.features) {
    const p = f.properties ?? {};
    const [lon, lat] = (f.geometry?.coordinates as number[]) ?? [];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const len = Number(p.glf_length);
    out.push({ id: `ice-g-${p.FID}`, kind: 'glacier', lat, lon: lon180(lon), ref: 'Glacier-like forms survey (2012), NASA Mars Trek', lengthKm: isFinite(len) ? len : undefined });
  }
  return out;
}

export function ensureIce() {
  if (!iceData.loading) {
    iceData.loading = loadIce()
      .then((p) => {
        iceData.points = p;
      })
      .catch((e: Error) => {
        iceData.error = e.message;
        iceData.loading = null;
      });
  }
  return iceData.loading ?? Promise.resolve();
}

/** Nearest evidence of each kind from a point (any distance). */
export function nearestIce(lat: number, lon: number) {
  const best: Record<IcePoint['kind'], { p: IcePoint; d: number } | null> = { icyCrater: null, glacier: null };
  for (const p of iceData.points ?? []) {
    const d = distanceM(lat, lon, p.lat, p.lon);
    const b = best[p.kind];
    if (!b || d < b.d) best[p.kind] = { p, d };
  }
  return best;
}
