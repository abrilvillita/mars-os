/**
 * Orbital mineral detections from the NASA Mars Trek ArcGIS services (CORS-enabled, verified
 * 2026-11-14). These are COMPILED DETECTIONS at published positions — "a spectral detection
 * exists around here" — not resource maps or abundances.
 *
 *  - Aqueous minerals (Ehlmann & Edwards 2014): silica, phyllosilicates, sulfates, chlorides, carbonates
 *  - Hydrous mineral detections (Carter et al. 2013): CRISM and OMEGA
 *  - CRISM MTRDR full-resolution targets at Human Exploration (HumEx) candidate sites (NASA PDS / ODE)
 */
import { distanceM } from '../geo/mars';

const BASE = 'https://trek.nasa.gov/mars/trekarcgis/rest/services';
const layerUrl = (service: string) => `${BASE}/${service}/MapServer/0`;

export const MINERAL_SERVICES = {
  aqueous: layerUrl('Aquieous_Mineral_Distribution_Options_clon0'), // service name spelled this way by the provider
  hydrous: layerUrl('Hydrous_Mineral_Detections_OMEGA_CRISM_clon0'),
  humex: layerUrl('mars_mro_crism_mtrdr_c0a_humex_frt_sites'),
} as const;

/**
 * Complete download: these services cap responses at 1000 records and do not support paging,
 * so we fetch ALL object ids first (no cap) and then the features in batches of ids.
 */
export async function getAllFeatures(layer: string): Promise<{ features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[]; expected: number }> {
  const idsRes = await fetch(`${layer}/query?where=1%3D1&returnIdsOnly=true&f=json`);
  if (!idsRes.ok) throw new Error(`HTTP ${idsRes.status}`);
  const ids: number[] = (await idsRes.json()).objectIds ?? [];
  const batches: number[][] = [];
  for (let i = 0; i < ids.length; i += 800) batches.push(ids.slice(i, i + 800));
  const parts = await Promise.all(
    batches.map(async (b) => {
      const body = new URLSearchParams({ objectIds: b.join(','), outFields: '*', returnGeometry: 'true', f: 'geojson' });
      const r = await fetch(`${layer}/query`, { method: 'POST', body });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return (await r.json()).features ?? [];
    }),
  );
  const features = parts.flat();
  if (features.length !== ids.length) throw new Error(`incomplete download (${features.length}/${ids.length})`);
  return { features, expected: ids.length };
}

export type MineralSet = 'aqueous' | 'hydrous';

export interface MineralPoint {
  id: string;
  set: MineralSet;
  lat: number;
  lon: number;
  cls: string; // e.g. carbonates, silica, "Hydrous Mineral Detection"
  instrument: string | null;
  color: [number, number, number];
}

export interface CrismFootprint {
  id: string;
  productId: string;
  datasetId: string;
  start: string | null;
  url: string | null;
  ring: [number, number][];
  center: { lat: number; lon: number };
}

const rgb = (s: unknown): [number, number, number] => {
  const p = String(s ?? '').trim().split(/\s+/).map(Number);
  return p.length >= 3 && p.every((v) => isFinite(v)) ? [p[0] / 255, p[1] / 255, p[2] / 255] : [1, 1, 1];
};
const lon180 = (l: number) => (l > 180 ? l - 360 : l);

export async function loadMineralPoints(): Promise<MineralPoint[]> {
  const [aq, hy] = await Promise.all([getAllFeatures(MINERAL_SERVICES.aqueous), getAllFeatures(MINERAL_SERVICES.hydrous)]);
  const out: MineralPoint[] = [];
  for (const f of aq.features) {
    const p = f.properties ?? {};
    const [lon, lat] = (f.geometry?.coordinates as number[]) ?? [];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    out.push({ id: `aq-${p.FID}`, set: 'aqueous', lat, lon: lon180(lon), cls: String(p.Class ?? 'aqueous mineral'), instrument: null, color: rgb(p.jC_fillclr) });
  }
  for (const f of hy.features) {
    const p = f.properties ?? {};
    const [lon, lat] = (f.geometry?.coordinates as number[]) ?? [];
    if (!isFinite(lat) || !isFinite(lon)) continue;
    const instrument = p.Instrument ? String(p.Instrument) : null;
    // provider colours, except OMEGA hydrous: recoloured because the provider reuses the phyllosilicate blue
    const color: [number, number, number] = instrument === 'OMEGA' ? [0.86, 0.94, 1] : rgb(p.jC_fillclr);
    out.push({ id: `hy-${p.FID}`, set: 'hydrous', lat, lon: lon180(lon), cls: 'hydrous', instrument, color });
  }
  return out;
}

export async function loadCrismFootprints(): Promise<CrismFootprint[]> {
  const j = await getAllFeatures(MINERAL_SERVICES.humex);
  return (j.features as unknown[] as { geometry: { type: string; coordinates: number[][][] }; properties: Record<string, unknown> }[])
    .filter((f: { geometry?: { type: string } }) => f.geometry?.type === 'Polygon')
    .map((f: { properties: Record<string, unknown>; geometry: { coordinates: number[][][] } }) => {
      const p = f.properties;
      return {
        id: `crism-${p.FID}`,
        productId: String(p.ProductId ?? ''),
        datasetId: String(p.DatasetId ?? ''),
        start: p.UTCstart ? String(p.UTCstart) : null,
        url: typeof p.ExtURL === 'string' && p.ExtURL.startsWith('http') ? p.ExtURL.replace(/^http:/, 'https:') : null,
        ring: f.geometry.coordinates[0].map(([lon, lat]) => [lon180(lon), lat] as [number, number]),
        center: { lat: Number(p.CenterLat), lon: lon180(Number(p.CenterLon)) },
      } satisfies CrismFootprint;
    });
}

/** Detections within radiusM of a point, nearest first. */
export function mineralsNear(points: MineralPoint[], lat: number, lon: number, radiusM: number) {
  return points
    .map((p) => ({ p, d: distanceM(lat, lon, p.lat, p.lon) }))
    .filter((x) => x.d <= radiusM)
    .sort((a, b) => a.d - b.d);
}

/** Shared cache so the 3D layer and the inspector use one download. */
export const mineralData: { points: MineralPoint[] | null; footprints: CrismFootprint[] | null; error: string | null; loading: Promise<void> | null } = {
  points: null,
  footprints: null,
  error: null,
  loading: null,
};

export function ensureMinerals() {
  if (!mineralData.loading) {
    mineralData.loading = Promise.all([loadMineralPoints(), loadCrismFootprints()])
      .then(([p, f]) => {
        mineralData.points = p;
        mineralData.footprints = f;
      })
      .catch((e: Error) => {
        mineralData.error = e.message;
        mineralData.loading = null;
      });
  }
  return mineralData.loading ?? Promise.resolve();
}
