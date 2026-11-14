/**
 * Live NASA Mars 2020 (Perseverance) feeds. All endpoints verified CORS-enabled (2026-11-14).
 * Pure data access — no rendering.
 */
export interface TraverseSegment {
  sol: number;
  length_m: number | null;
  coords: [number, number, number | null][]; // lon, lat, elev_geoid (m) as published
}

export interface Waypoint {
  rmc: string;
  sol: number;
  lat: number;
  lon: number;
  elevGeoid_m: number | null;
  distTotal_m: number | null;
  note: string | null;
}

export interface RawImage {
  id: string;
  sol: number;
  instrument: string;
  takenUtc: string;
  small: string;
  medium: string;
  large: string | null;
  fullRes: string | null;
  caption: string | null;
}

export interface WeatherSol {
  terrestrialDate: string;
  sol: number;
  ls: number | null;
  season: string | null;
  minTempC: number | null;
  maxTempC: number | null;
  pressurePa: number | null;
  sunrise: string | null;
  sunset: string | null;
}

const num = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && isFinite(+v) ? +v : null);

export async function loadTraverse(url: string): Promise<TraverseSegment[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('traverse HTTP ' + res.status);
  const gj = await res.json();
  const out: TraverseSegment[] = [];
  for (const f of gj.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const line of lines) {
      out.push({
        sol: f.properties?.sol ?? -1,
        length_m: num(f.properties?.length),
        coords: line.map((c) => [c[0], c[1], c[2] ?? null] as [number, number, number | null]),
      });
    }
  }
  return out;
}

export async function loadWaypoints(url: string): Promise<Waypoint[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error('waypoints HTTP ' + res.status);
  const gj = await res.json();
  return (gj.features ?? [])
    .map((f: { properties: Record<string, unknown> }) => {
      const p = f.properties;
      return {
        rmc: String(p.RMC ?? ''),
        sol: Number(p.sol ?? -1),
        lat: Number(p.lat),
        lon: Number(p.lon),
        elevGeoid_m: num(p.elev_geoid),
        distTotal_m: num(p.dist_total_m),
        note: (p.Note as string) ?? null,
      } satisfies Waypoint;
    })
    .filter((w: Waypoint) => isFinite(w.lat) && isFinite(w.lon));
}

export async function fetchRawImages(sol: number, limit = 40): Promise<RawImage[]> {
  const url = `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&sol=${sol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('raw images HTTP ' + res.status);
  const j = await res.json();
  const prefer = ['NAVCAM_LEFT', 'MCZ_LEFT', 'MCZ_RIGHT', 'FRONT_HAZCAM_LEFT_A', 'SHERLOC_WATSON', 'SUPERCAM_RMI'];
  const imgs: RawImage[] = (j.images ?? []).map((i: Record<string, any>) => ({
    id: String(i.imageid ?? i.image_files?.small),
    sol: Number(i.sol),
    instrument: String(i.camera?.instrument ?? 'UNKNOWN'),
    takenUtc: String(i.date_taken_utc ?? ''),
    small: i.image_files?.small,
    medium: i.image_files?.medium,
    large: i.image_files?.large ?? null,
    fullRes: i.image_files?.full_res ?? null,
    caption: i.caption ?? null,
  }));
  imgs.sort((a, b) => {
    const pa = prefer.indexOf(a.instrument), pb = prefer.indexOf(b.instrument);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  return imgs.slice(0, limit);
}

export async function fetchWeather(): Promise<WeatherSol[]> {
  const res = await fetch('https://mars.nasa.gov/rss/api/?feed=weather&category=mars2020&feedtype=json');
  if (!res.ok) throw new Error('weather HTTP ' + res.status);
  const j = await res.json();
  return (j.sols ?? []).map((s: Record<string, unknown>) => ({
    terrestrialDate: String(s.terrestrial_date),
    sol: Number(s.sol),
    ls: num(s.ls),
    season: (s.season as string) ?? null,
    minTempC: num(s.min_temp),
    maxTempC: num(s.max_temp),
    pressurePa: num(s.pressure),
    sunrise: (s.sunrise as string) ?? null,
    sunset: (s.sunset as string) ?? null,
  }));
}
