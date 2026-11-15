/**
 * Every robot that has explored the surface of Mars (NASA missions), with landing sites from
 * NASA/NSSDCA and live positions/paths for Curiosity, Perseverance and Ingenuity from NASA's
 * MMGIS feeds (verified CORS-enabled 2026-11-15). Pure data access, no rendering.
 */
import { distanceM } from '../geo/mars';

export interface Explorer {
  id: string;
  name: string;
  kind: 'rover' | 'lander' | 'helicopter';
  agency: string;
  landed: string;
  ended: string | null;
  lat: number;
  lon: number;
  precision: string;
  drivenKm?: number;
  live?: 'msl' | 'm20' | 'heli';
  /** Historic traverse on NASA Mars Trek (ArcGIS polyline). */
  trekPath?: string;
  coordSource: string;
  photo: { id: string; title: string; src: string } | null;
}

export interface LivePath {
  points: { lat: number; lon: number }[];
  /** Odometry / distance flown (km), as published in the feed. */
  km: number | null;
  /** Last reported position. */
  last: { lat: number; lon: number; sol: number } | null;
  count?: number;
}

export const explorersState: {
  list: Explorer[];
  msl: LivePath | null;
  heli: LivePath | null;
  /** Historic traverses (Spirit, Opportunity) by explorer id. */
  paths: Record<string, LivePath>;
  loading: Promise<void> | null;
  listeners: Set<() => void>;
} = { list: [], msl: null, heli: null, paths: {}, loading: null, listeners: new Set() };

const notify = () => explorersState.listeners.forEach((l) => l());

async function loadMsl(): Promise<LivePath> {
  const [tr, wp] = await Promise.all([
    fetch('https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json').then((r) => r.json()),
    fetch('https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json').then((r) => r.json()),
  ]);
  const segs: { sol: number; c: number[][] }[] = [];
  for (const f of tr.features ?? []) {
    const g = f.geometry;
    if (!g) continue;
    const lines: number[][][] = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) segs.push({ sol: Number(f.properties?.sol ?? 0), c: l });
  }
  segs.sort((a, b) => a.sol - b.sol);
  const points: { lat: number; lon: number }[] = [];
  for (const s of segs) for (const [lon, lat] of s.c) {
    const p = points[points.length - 1];
    if (p && distanceM(p.lat, p.lon, lat, lon) < 5) continue;
    points.push({ lat, lon });
  }
  const wps = (wp.features ?? []).map((f: { properties: Record<string, number> }) => f.properties).filter((p: Record<string, number>) => isFinite(p.lat) && isFinite(p.lon));
  wps.sort((a: Record<string, number>, b: Record<string, number>) => a.sol - b.sol || (a.dist_total_m ?? 0) - (b.dist_total_m ?? 0));
  const last = wps[wps.length - 1];
  return { points, km: last?.dist_total_m ? last.dist_total_m / 1000 : null, last: last ? { lat: +last.lat, lon: +last.lon, sol: +last.sol } : null };
}

async function loadHeli(): Promise<LivePath> {
  const j = await fetch('https://mars.nasa.gov/mmgis-maps/M20/Layers/json/m20_heli_waypoints.json').then((r) => r.json());
  const ps = (j.features ?? []).map((f: { properties: Record<string, number> }) => f.properties).filter((p: Record<string, number>) => isFinite(p.Lat) && isFinite(p.Lon));
  ps.sort((a: Record<string, number>, b: Record<string, number>) => a.Flight - b.Flight);
  const last = ps[ps.length - 1];
  return {
    points: ps.map((p: Record<string, number>) => ({ lat: +p.Lat, lon: +p.Lon })),
    km: last ? +last.Total_km : null,
    last: last ? { lat: +last.Lat, lon: +last.Lon, sol: +last.Sol } : null,
    count: last ? +last.Flight : 0,
  };
}

async function loadTrekPath(service: string): Promise<LivePath> {
  const j = await fetch(`https://trek.nasa.gov/mars/trekarcgis/rest/services/${service}/MapServer/0/query?where=1%3D1&returnGeometry=true&f=geojson`).then((r) => r.json());
  const points: { lat: number; lon: number }[] = [];
  for (const f of j.features ?? []) {
    const g = f.geometry;
    const lines: number[][][] = g?.type === 'LineString' ? [g.coordinates] : g?.type === 'MultiLineString' ? g.coordinates : [];
    for (const l of lines) for (const [lon, lat] of l) {
      const p = points[points.length - 1];
      if (p && distanceM(p.lat, p.lon, lat, lon) < 5) continue;
      points.push({ lat, lon: lon > 180 ? lon - 360 : lon });
    }
  }
  const last = points[points.length - 1];
  return { points, km: null, last: last ? { ...last, sol: -1 } : null };
}

export function ensureExplorers(baseUrl: string): Promise<void> {
  if (!explorersState.loading) {
    explorersState.loading = fetch(baseUrl + 'data/explorers.json')
      .then((r) => r.json())
      .then((j: { explorers: Explorer[] }) => {
        explorersState.list = j.explorers;
        notify();
        // live feeds load independently; a failure leaves the fixed landing site
        loadMsl().then((m) => ((explorersState.msl = m), notify())).catch(() => {});
        loadHeli().then((h) => ((explorersState.heli = h), notify())).catch(() => {});
        for (const e of j.explorers) if (e.trekPath) loadTrekPath(e.trekPath).then((p) => ((explorersState.paths[e.id] = p), notify())).catch(() => {});
      })
      .catch(() => {
        explorersState.loading = null;
      });
  }
  return explorersState.loading;
}

/** Current position: last live report when available, else the landing site. */
export function currentPosition(e: Explorer, m20Last: { lat: number; lon: number } | null) {
  if (e.live === 'msl' && explorersState.msl?.last) return explorersState.msl.last;
  if (e.live === 'heli' && explorersState.heli?.last) return explorersState.heli.last;
  if (e.live === 'm20' && m20Last) return m20Last;
  if (e.trekPath && explorersState.paths[e.id]?.last) return explorersState.paths[e.id].last!;
  return { lat: e.lat, lon: e.lon };
}

/** Great-circle distance between two explorers' current positions (km). */
export const kmBetween = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => distanceM(a.lat, a.lon, b.lat, b.lon) / 1000;
