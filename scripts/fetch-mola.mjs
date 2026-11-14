#!/usr/bin/env node
/**
 * Reproducible ingest of MGS MOLA MEGDR elevation grids (real measured data, meters
 * relative to the MOLA areoid) from the PDS Geosciences Node.
 *
 *  - Global 4 px/deg grid (MEGT90N000CB.IMG, ~14.8 km/px)        -> full file (2 MB)
 *  - Jezero 32 px/deg crop (MEGT90N000FB.IMG, ~1.85 km/px)       -> HTTP Range request (rows only)
 *
 * Output: little-endian Int16 rasters + JSON metadata in public/data/elevation/.
 * Nothing is interpolated or invented here: values are copied byte-for-byte (endianness swap only).
 *
 * Usage: node scripts/fetch-mola.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'elevation');
const PDS = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x';

async function get(url, range) {
  const res = await fetch(url, range ? { headers: { Range: `bytes=${range[0]}-${range[1]}` } } : {});
  if (!res.ok && res.status !== 206) throw new Error(`${res.status} ${url}`);
  if (range && res.status !== 206) throw new Error(`Server ignored Range header for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** MSB int16 -> LSB int16 */
function swap16(buf) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i += 2) {
    out[i] = buf[i + 1];
    out[i + 1] = buf[i];
  }
  return out;
}

function stats(i16) {
  let min = Infinity, max = -Infinity;
  for (const v of i16) { if (v < min) min = v; if (v > max) max = v; }
  return { min, max };
}

async function globalGrid() {
  const ppd = 4, width = 360 * ppd, height = 180 * ppd;
  const url = `${PDS}/meg004/megt90n000cb.img`;
  console.log('Downloading', url);
  const raw = await get(url);
  if (raw.length !== width * height * 2) throw new Error('Unexpected size ' + raw.length);
  const le = swap16(raw);
  const s = stats(new Int16Array(le.buffer, le.byteOffset, le.length / 2));
  await writeFile(join(OUT, 'mola_megdr_4ppd_global.i16'), le);
  return {
    id: 'src.mola.megdr.4ppd',
    file: 'mola_megdr_4ppd_global.i16',
    width, height, pixelsPerDegree: ppd,
    bbox: { west: 0, east: 360, south: -90, north: 90 },
    lonConvention: '0-360E',
    stats: s,
    pds: { productId: 'MEGT90N000CB.IMG', dataSetId: 'MGS-M-MOLA-5-MEGDR-L3-V1.0', url, label: url.replace('.img', '.lbl') },
  };
}

async function jezeroCrop() {
  const ppd = 32, fullWidth = 360 * ppd; // 11520
  const north = 21.5, south = 15.5, west = 74.5, east = 80.5;
  const row0 = Math.round((90 - north) * ppd), rows = Math.round((north - south) * ppd);
  const col0 = Math.round(west * ppd), cols = Math.round((east - west) * ppd);
  const rowBytes = fullWidth * 2;
  const url = `${PDS}/meg032/megt90n000fb.img`;
  console.log(`Range-downloading rows ${row0}..${row0 + rows - 1} from`, url);
  const raw = await get(url, [row0 * rowBytes, (row0 + rows) * rowBytes - 1]);
  if (raw.length !== rows * rowBytes) throw new Error('Unexpected size ' + raw.length);
  const out = Buffer.alloc(rows * cols * 2);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = r * rowBytes + (col0 + c) * 2;
      const dst = (r * cols + c) * 2;
      out[dst] = raw[src + 1];
      out[dst + 1] = raw[src];
    }
  }
  const i16 = new Int16Array(out.buffer, out.byteOffset, out.length / 2);
  await writeFile(join(OUT, 'mola_megdr_32ppd_jezero.i16'), out);
  return {
    id: 'src.mola.megdr.32ppd.jezero',
    file: 'mola_megdr_32ppd_jezero.i16',
    width: cols, height: rows, pixelsPerDegree: ppd,
    bbox: { west, east, south, north },
    lonConvention: '0-360E',
    stats: stats(i16),
    pds: { productId: 'MEGT90N000FB.IMG', dataSetId: 'MGS-M-MOLA-5-MEGDR-L3-V1.0', url, label: url.replace('.img', '.lbl') },
    // sanity check against a known value: Perseverance waypoint at 18.44463N 77.45089E reports elev_geoid -2569.91 m
    sanityCheck: (() => {
      const lat = 18.44462715, lon = 77.45088573;
      const r = Math.floor((north - lat) * ppd), c = Math.floor((lon - west) * ppd);
      return { lat, lon, megdrValue: i16[r * cols + c], referenceElevGeoid: -2569.91, reference: 'M20_waypoints.json sol 13' };
    })(),
  };
}

await mkdir(OUT, { recursive: true });
const grids = [await globalGrid(), await jezeroCrop()];
const meta = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/fetch-mola.mjs',
  encoding: 'int16 little-endian, row-major, north-up, pixel-is-area (sample centers at half-pixel offsets)',
  unit: 'meter',
  verticalDatum: 'MOLA areoid (MEGDR topography = radius - areoid)',
  grids,
};
await writeFile(join(OUT, 'elevation.meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(grids.map((g) => ({ id: g.id, stats: g.stats, sanity: g.sanityCheck })), null, 2));
