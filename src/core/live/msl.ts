/**
 * Live NASA Curiosity (MSL) feeds, verified CORS-enabled 2026-11-15:
 *  - raw images per sol (mars.nasa.gov raw_image_items API)
 *  - REMS surface weather (Centro de Astrobiología via mars.nasa.gov; outreach values)
 */
import type { RawImage, WeatherSol } from './m20';

const PREFER = ['MAST_LEFT', 'MAST_RIGHT', 'NAV_LEFT_B', 'NAV_RIGHT_B', 'NAV_LEFT_A', 'MAHLI', 'CHEMCAM_RMI', 'FHAZ_LEFT_B', 'RHAZ_LEFT_B'];

export async function fetchMslImages(sol: number, limit = 36): Promise<RawImage[]> {
  const url = `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=80&page=0&condition_1=msl:mission&condition_2=${sol}:sol:gte&condition_3=${sol}:sol:lte`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('MSL raw images HTTP ' + res.status);
  const j = await res.json();
  const imgs: RawImage[] = (j.items ?? [])
    .filter((i: Record<string, unknown>) => !i.is_thumbnail && i.https_url)
    .map((i: Record<string, any>) => ({
      id: String(i.imageid ?? i.id),
      sol: Number(i.sol),
      instrument: String(i.instrument ?? 'UNKNOWN'),
      takenUtc: String(i.date_taken ?? '').replace('T', ' ').replace('.000Z', ''),
      small: i.https_url as string,
      medium: i.https_url as string,
      large: i.https_url as string,
      fullRes: i.https_url as string,
      caption: (i.title as string) ?? null,
    }));
  imgs.sort((a, b) => {
    const pa = PREFER.indexOf(a.instrument), pb = PREFER.indexOf(b.instrument);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
  return imgs.slice(0, limit);
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || v === '--' || !isFinite(+v) ? null : +v);

/** REMS daily summaries, newest first. */
export async function fetchRemsWeather(): Promise<WeatherSol[]> {
  const res = await fetch('https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json');
  if (!res.ok) throw new Error('REMS HTTP ' + res.status);
  const j = await res.json();
  return (j.soles ?? []).map((s: Record<string, unknown>) => ({
    terrestrialDate: String(s.terrestrial_date ?? ''),
    sol: Number(s.sol),
    ls: num(s.ls),
    season: s.season ? String(s.season) : null,
    minTempC: num(s.min_temp),
    maxTempC: num(s.max_temp),
    pressurePa: num(s.pressure),
    sunrise: s.sunrise ? String(s.sunrise) : null,
    sunset: s.sunset ? String(s.sunset) : null,
  }));
}
