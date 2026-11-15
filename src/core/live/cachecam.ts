/**
 * Perseverance sample-handling activity: per-sol index of CacheCam (Sample Caching System Camera)
 * raw images, built by scripts/build-cachecam-index.mjs from the public NASA raw-images API,
 * with the rover position from the MMGIS waypoints. Live images for a sol come from the API.
 */
export interface CacheCamSol {
  sol: number;
  count: number;
  firstUtc: string;
  lastUtc: string;
  samples: { id: string; small: string; medium: string }[];
  position: { lat: number; lon: number; waypointSol: number; rmc: string } | null;
}

export interface CacheCamIndex {
  generatedAt: string;
  totalImages: number;
  waypointsCoverToSol: number;
  sols: CacheCamSol[];
}

export const cachecam: { index: CacheCamIndex | null; loading: Promise<CacheCamIndex | null> | null } = { index: null, loading: null };

export function loadCacheCamIndex(baseUrl: string) {
  if (!cachecam.loading) {
    cachecam.loading = fetch(baseUrl + 'data/m20/cachecam-index.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: CacheCamIndex | null) => (cachecam.index = j))
      .catch(() => null);
  }
  return cachecam.loading;
}

/** CacheCam raw images for one sol, live from the NASA raw-images API. */
export async function fetchCacheCamImages(sol: number) {
  const res = await fetch(`https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&search=CACHECAM&sol=${sol}`);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  return (j.images ?? [])
    .filter((i: { camera?: { instrument?: string }; sol: number }) => i.camera?.instrument === 'CACHECAM' && Number(i.sol) === sol)
    .map((i: Record<string, any>) => ({
      id: String(i.imageid),
      takenUtc: String(i.date_taken_utc ?? ''),
      small: i.image_files?.small as string,
      medium: i.image_files?.medium as string,
      large: (i.image_files?.large ?? null) as string | null,
      fullRes: (i.image_files?.full_res ?? null) as string | null,
    }));
}
