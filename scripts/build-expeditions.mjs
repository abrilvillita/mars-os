/**
 * Build public/data/expeditions.json from NASA Mars Trek (ArcGIS services + feature pages).
 * Usage: node scripts/build-expeditions.mjs
 *
 *  - expedition stops and hardware positions of every NASA surface mission (located on
 *    HiRISE images, same map frame as the MARS OS base map), each with NASA's description
 *    and image from Trek's feature page
 *  - Exploration Zones (EZ) proposed at NASA's First Landing Site / Exploration Zone
 *    Workshop for Human Missions (2015), with their landing zones and 100 km buffers
 *  - landing ellipses (Perseverance, InSight)
 * The browser cannot read Trek's feature pages (no CORS), so they are copied here.
 */
import { writeFileSync } from 'node:fs';

const B = 'https://trek.nasa.gov/mars/trekarcgis/rest/services';
const SITE = 'https://trek.nasa.gov/mars/';
const MISSIONS = {
  viking1: 'viking_waypoints', viking2: 'viking2_waypoints', pathfinder: 'sojourner_waypoints', spirit: 'spirit_waypoints',
  opportunity: 'opportunity_waypoints', phoenix: 'phoenix_waypoints', curiosity: 'curiosity_waypoints', insight: 'InSight_waypoints',
  perseverance: 'mars2020_waypoints',
};
const lon180 = (l) => (l > 180 ? l - 360 : l);
const q = async (svc, layer = 0, extra = '') => (await fetch(`${B}/${svc}/MapServer/${layer}/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson${extra}`)).json();
const clean = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();

async function page(template) {
  if (!template || !/\.html?$/.test(template)) return { text: null, image: null, url: null };
  const url = SITE + template;
  try {
    const r = await fetch(url);
    if (!r.ok) return { text: null, image: null, url };
    const h = await r.text();
    const src = (h.match(/<img[^>]*src="([^"]+)"/) || [])[1];
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    const image = src ? (src.startsWith('http') ? src : src.startsWith('jpl/') ? SITE + src : base + src) : null;
    return { text: clean(h).slice(0, 1400), image, url };
  } catch {
    return { text: null, image: null, url };
  }
}

const stops = [];
for (const [mission, svc] of Object.entries(MISSIONS)) {
  const j = await q(svc);
  for (const f of j.features ?? []) {
    const c = f.geometry?.coordinates;
    if (!c || c[0] == null || c[1] == null) continue;
    const p = f.properties ?? {};
    const name = String(p.name ?? '').trim();
    const pg = await page(p.template);
    const hardware = /lander|backshell|parachute|heat shield|rover$|memorial station|landing site$/i.test(name);
    stops.push({ mission, name, lat: +c[1].toFixed(6), lon: +lon180(c[0]).toFixed(6), hardware, text: pg.text, image: pg.image, page: pg.url, source: `${B}/${svc}/MapServer` });
  }
  console.log(mission, stops.filter((s) => s.mission === mission).length);
}

const ezj = await q('EZMars', 0);
const zones = (ezj.features ?? []).map((f) => {
  const p = f.properties;
  const pres = String(p.presentati ?? '').trim();
  return { name: String(p.name).trim(), lat: +p.lat, lon: lon180(+p.lon), elevKm: isFinite(+p.elev) ? +p.elev : null, presentation: pres.startsWith('http') ? pres.replace(/^http:/, 'https:') : null };
});
const lzj = await q('EZMars', 2);
const landing = (lzj.features ?? []).map((f) => ({ name: String(f.properties.name).trim(), lat: f.geometry.coordinates[1], lon: lon180(f.geometry.coordinates[0]) }));
const ellipses = [];
for (const svc of ['perseverance_landing_ellipse', 'InSight_2018_ellipses']) {
  const j = await q(svc);
  for (const f of j.features ?? []) {
    const g = f.geometry;
    const ring = (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]).map(([lo, la]) => [+lon180(lo).toFixed(5), +la.toFixed(5)]);
    ellipses.push({ mission: svc.startsWith('perseverance') ? 'perseverance' : 'insight', name: String(f.properties.Name ?? '').trim(), date: f.properties.Date ?? null, size: f.properties.Size ?? null, areaKm2: f.properties.Area_kmsq ?? null, ring, source: `${B}/${svc}/MapServer` });
  }
}
const doc = {
  retrieved: new Date().toISOString().slice(0, 10),
  sources: {
    stops: 'NASA Mars Trek mission waypoint services and feature pages (https://trek.nasa.gov/mars/)',
    zones: 'NASA First Landing Site / Exploration Zone Workshop for Human Missions to Mars (2015), via Mars Trek EZMars service',
    ellipses: 'NASA Mars Trek landing-ellipse services',
  },
  stops, zones, landingZones: landing, ellipses,
};
writeFileSync('public/data/expeditions.json', JSON.stringify(doc) + '\n');
console.log('stops', stops.length, 'zones', zones.length, 'landing zones', landing.length, 'ellipses', ellipses.length);
