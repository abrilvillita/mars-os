#!/usr/bin/env node
/**
 * Builds a per-sol index of Perseverance CacheCam (Sample Caching System Camera) raw images
 * from the public NASA raw-images API (search=CACHECAM), and attaches the rover position for
 * each sol from the MMGIS waypoint file (last waypoint at or before that sol).
 *
 * CacheCam looks down into sample tubes inside the rover. Sols with CacheCam images indicate
 * sample-handling activity (coring, sealing, inspection, calibration) — not one sample per sol.
 *
 * Output: public/data/m20/cachecam-index.json
 * Usage:  node scripts/build-cachecam-index.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'm20', 'cachecam-index.json');
const API = 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&search=CACHECAM&order=sol+asc&num=100';
const WAYPOINTS = 'https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_waypoints.json';

const get = async (url) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url);
    if (res.ok) return res.json();
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error('failed ' + url);
};

const first = await get(`${API}&page=0`);
const total = first.total_results;
const pages = Math.ceil(total / 100);
const images = [...first.images];
for (let p = 1; p < pages; p++) {
  const j = await get(`${API}&page=${p}`);
  images.push(...j.images);
  process.stdout.write(`\rpage ${p + 1}/${pages}`);
}
console.log(`\nimages fetched: ${images.length} / ${total}`);
if (images.filter((i) => i.camera?.instrument === 'CACHECAM').length !== images.length) throw new Error('non-CacheCam image in results');

const bySol = new Map();
for (const i of images) {
  const s = bySol.get(i.sol) ?? { sol: i.sol, count: 0, firstUtc: i.date_taken_utc, lastUtc: i.date_taken_utc, samples: [] };
  s.count++;
  if (i.date_taken_utc < s.firstUtc) s.firstUtc = i.date_taken_utc;
  if (i.date_taken_utc > s.lastUtc) s.lastUtc = i.date_taken_utc;
  if (s.samples.length < 3) s.samples.push({ id: i.imageid, small: i.image_files.small, medium: i.image_files.medium });
  bySol.set(i.sol, s);
}

const wp = await get(WAYPOINTS);
const waypoints = wp.features.map((f) => f.properties).filter((p) => isFinite(p.lat) && isFinite(p.lon)).sort((a, b) => a.sol - b.sol);
const lastWpSol = waypoints[waypoints.length - 1].sol;
const posAt = (sol) => {
  let best = null;
  for (const w of waypoints) if (w.sol <= sol) best = w;
  return best ? { lat: best.lat, lon: best.lon, waypointSol: best.sol, rmc: best.RMC } : null;
};

const sols = [...bySol.values()].sort((a, b) => a.sol - b.sol).map((s) => ({ ...s, position: s.sol <= lastWpSol + 30 ? posAt(s.sol) : null }));
const out = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-cachecam-index.mjs',
  source: { images: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&search=CACHECAM', positions: WAYPOINTS },
  note: 'Sols with CacheCam (Sample Caching System Camera) raw images = sample-handling activity (coring, sealing, inspection, calibration); not one sample per sol. Position = last MMGIS waypoint at or before the sol; null when the waypoint file does not cover that sol.',
  totalImages: images.length,
  waypointsCoverToSol: lastWpSol,
  sols,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(out));
console.log(JSON.stringify({ sols: sols.length, withPosition: sols.filter((s) => s.position).length, firstSol: sols[0].sol, lastSol: sols[sols.length - 1].sol, waypointsCoverToSol: lastWpSol, top: [...sols].sort((a, b) => b.count - a.count).slice(0, 5).map((s) => `sol ${s.sol}: ${s.count}`) }, null, 1));
