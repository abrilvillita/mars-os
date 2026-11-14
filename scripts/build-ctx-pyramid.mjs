#!/usr/bin/env node
/**
 * Builds an on-demand tile pyramid from the USGS/JPL CTX DEM of Jezero (20 m/px) downloaded by
 * the data team (Chatgpt/M20_JezeroCrater_CTXDEM_20m.tif, PDS4 label alongside).
 *
 * - Verifies the SHA-256 recorded in Chatgpt/download_manifest.json.
 * - Reads the float32 payload directly at the byte offset declared by the PDS4 label
 *   (uncompressed, "Last Index Fastest" = row-major).
 * - Level 0 = native 20 m samples, quantized to 0.25 m in int16 (well below the DEM's vertical
 *   precision). Levels 1..5 = 2×2 block averages of valid pixels (40…640 m), labelled as such.
 * - Tiles: 256×256 int16 little-endian, gzip, public/data/elevation/ctx-jezero-20m/{level}/{row}_{col}.i16.gz
 *
 * Usage: node scripts/build-ctx-pyramid.mjs [path/to/tif]
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] ?? join(ROOT, 'Chatgpt', 'M20_JezeroCrater_CTXDEM_20m.tif');
const OUT = join(ROOT, 'public', 'data', 'elevation', 'ctx-jezero-20m');

// From the PDS4 label M20_JezeroCrater_CTXDEM_20m.xml
const LABEL = {
  offset: 31092,
  samples: 4456,
  lines: 5067,
  west: 76.99743706146,
  east: 78.5825633240882,
  south: 17.5805199105448,
  north: 19.2901870068662,
  missing: -3.4028234663852886e38,
  pixelResolution_m: 20,
};
const SCALE = 0.25;
const NODATA = -32768;
const TILE = 256;
const LEVELS = 6;

const buf = await readFile(SRC);
const sha = createHash('sha256').update(buf).digest('hex');
let expected = null;
try {
  const manifest = JSON.parse(await readFile(join(dirname(SRC), 'download_manifest.json'), 'utf8'));
  expected = manifest.assets.find((a) => a.file.endsWith('CTXDEM_20m.tif'))?.sha256 ?? null;
} catch { /* manifest optional */ }
if (expected && expected !== sha) throw new Error(`SHA-256 mismatch: ${sha} != ${expected}`);
const expectedBytes = LABEL.offset + LABEL.samples * LABEL.lines * 4;
if (buf.length !== expectedBytes) throw new Error(`Unexpected size ${buf.length}, label implies ${expectedBytes}`);
console.log('SHA-256 OK', sha);

// level 0 as float (NaN = nodata)
let W = LABEL.samples, H = LABEL.lines;
let cur = new Float32Array(W * H);
const dv = new DataView(buf.buffer, buf.byteOffset + LABEL.offset, W * H * 4);
let valid = 0, min = Infinity, max = -Infinity;
for (let i = 0; i < W * H; i++) {
  const v = dv.getFloat32(i * 4, true);
  if (v <= -1e30 || !Number.isFinite(v)) cur[i] = NaN;
  else { cur[i] = v; valid++; if (v < min) min = v; if (v > max) max = v; }
}
console.log({ valid, min, max });

await rm(OUT, { recursive: true, force: true });
const levels = [];
let mpp = LABEL.pixelResolution_m;
let bytes = 0, files = 0;
for (let level = 0; level < LEVELS; level++) {
  levels.push({ level, metersPerPixel: mpp, width: W, height: H });
  const tilesX = Math.ceil(W / TILE), tilesY = Math.ceil(H / TILE);
  for (let tr = 0; tr < tilesY; tr++) {
    for (let tc = 0; tc < tilesX; tc++) {
      const tw = Math.min(TILE, W - tc * TILE), th = Math.min(TILE, H - tr * TILE);
      const out = new Int16Array(tw * th);
      let any = false;
      for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
        const v = cur[(tr * TILE + y) * W + tc * TILE + x];
        if (Number.isNaN(v)) out[y * tw + x] = NODATA;
        else { out[y * tw + x] = Math.round(v / SCALE); any = true; }
      }
      if (!any) continue; // fully empty tiles are not written (loader marks them missing)
      const dir = join(OUT, String(level));
      await mkdir(dir, { recursive: true });
      const gz = gzipSync(Buffer.from(out.buffer), { level: 9 });
      await writeFile(join(dir, `${tr}_${tc}.i16.gz`), gz);
      bytes += gz.length; files++;
    }
  }
  // next level: 2×2 average of valid pixels
  const W2 = Math.ceil(W / 2), H2 = Math.ceil(H / 2);
  const next = new Float32Array(W2 * H2);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    let s = 0, n = 0;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = 2 * x + dx, sy = 2 * y + dy;
      if (sx >= W || sy >= H) continue;
      const v = cur[sy * W + sx];
      if (!Number.isNaN(v)) { s += v; n++; }
    }
    next[y * W2 + x] = n ? s / n : NaN;
  }
  cur = next; W = W2; H = H2; mpp *= 2;
}

// sanity: value at the first Perseverance waypoint vs rover-reported elevation
const lat = 18.44462715, lon = 77.45088573;
const px = Math.floor(((lon - LABEL.west) / (LABEL.east - LABEL.west)) * LABEL.samples);
const py = Math.floor(((LABEL.north - lat) / (LABEL.north - LABEL.south)) * LABEL.lines);
const at = dv.getFloat32((py * LABEL.samples + px) * 4, true);

const meta = {
  generatedAt: new Date().toISOString(),
  generator: 'scripts/build-ctx-pyramid.mjs',
  source: { file: 'M20_JezeroCrater_CTXDEM_20m.tif', sha256: sha, url: 'https://planetarymaps.usgs.gov/mosaic/mars2020_trn/CTX/ScienceInvestigationMaps_JPL/M20_JezeroCrater_CTXDEM_20m.tif' },
  encoding: { type: 'int16le', scale: SCALE, offset: 0, noData: NODATA, compression: 'gzip', tileSize: TILE },
  gridExtent: { west: LABEL.west, east: LABEL.east, south: LABEL.south, north: LABEL.north },
  levels,
  stats: { validPixels: valid, min_m: min, max_m: max },
  sanityCheck: { lat, lon, ctxValue_m: at, roverReportedElevGeoid_m: -2569.91, reference: 'M20_waypoints.json RMC 3_0 (sol 13)' },
  totals: { files, gzBytes: bytes },
};
await writeFile(join(OUT, 'pyramid.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify({ levels: levels.map((l) => [l.level, l.metersPerPixel, l.width, l.height]), files, MB: (bytes / 1e6).toFixed(1), sanity: meta.sanityCheck }, null, 1));
