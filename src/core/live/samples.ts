/**
 * Perseverance's named samples (NASA "Mars Rock Samples" table, copied into
 * public/data/m20/samples.json by scripts/build-samples.mjs). The map position of each sample
 * is DERIVED here: the rover position on the sealing sol (or the image sol when sealing is TBD)
 * from NASA's MMGIS waypoints. Pure data access, no rendering.
 */
import type { Waypoint } from './m20';

export interface RoverSample {
  n: number;
  name: string;
  feature: string | null;
  samplingLocation: string | null;
  type: string | null; // Rock Core | Regolith | Atmospheric
  solSealed: number | null;
  dateSealed: string | null;
  rockType: string | null;
  height: string | null;
  location: 'depot' | 'rover';
  image: string | null;
  imageSol: number | null;
}

export interface SamplesDoc {
  source: string;
  retrieved: string;
  samples: RoverSample[];
}

export type SampleGroup = 'igneous' | 'sedimentary' | 'special' | 'regolith' | 'atmospheric';

export const SAMPLE_COLORS: Record<SampleGroup, string> = {
  igneous: '#ff7a45',
  sedimentary: '#4fb3ff',
  special: '#c38bff',
  regolith: '#e8c27a',
  atmospheric: '#f2f2f2',
};

export function sampleGroup(s: RoverSample): SampleGroup {
  const r = (s.rockType ?? '').toLowerCase();
  if (/atmos/i.test(s.type ?? '')) return 'atmospheric';
  if (/regolith/i.test(s.type ?? '')) return 'regolith';
  if (/carbonate|serpentin|impactite| or /.test(r) || !r) return 'special';
  if (/sediment/.test(r)) return 'sedimentary';
  if (/igneous/.test(r)) return 'igneous';
  return 'special';
}

/** Sol used to place the sample: sealing sol, else the sol of NASA's image. */
export const sampleSol = (s: RoverSample) => s.solSealed ?? s.imageSol;

export const samplesState: { doc: SamplesDoc | null; loading: Promise<SamplesDoc | null> | null } = { doc: null, loading: null };

export function loadSamples(baseUrl: string) {
  if (!samplesState.loading) {
    samplesState.loading = fetch(baseUrl + 'data/m20/samples.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: SamplesDoc | null) => (samplesState.doc = j))
      .catch(() => null);
  }
  return samplesState.loading;
}

/** Last rover position reported on or before `sol`. */
export function roverPositionAt(wps: Waypoint[], sol: number): Waypoint | null {
  let best: Waypoint | null = null;
  for (const w of wps) {
    if (w.sol > sol) continue;
    if (!best || w.sol > best.sol || (w.sol === best.sol && (w.distTotal_m ?? 0) >= (best.distTotal_m ?? 0))) best = w;
  }
  return best;
}
