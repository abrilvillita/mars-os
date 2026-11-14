#!/usr/bin/env node
/**
 * Downloads a small offline fallback pyramid (zoom 0-2) of two global NASA Mars Trek
 * WMTS layers into public/fallback/tiles/. Used only when the live service is unreachable.
 * The viewer labels these tiles with their real (low) resolution: zoom 2 = 2048 px / 360 deg
 * (~10.4 km/px at the equator). They are never presented as higher-detail data.
 *
 * Usage: node scripts/fetch-fallback-tiles.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'fallback', 'tiles');
const MAX_Z = 2;
const LAYERS = [
  { id: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', ext: 'jpg' },
  { id: 'Mars_MGS_MOLA_ClrShade_merge_global_463m', ext: 'jpg' },
];

for (const layer of LAYERS) {
  for (let z = 0; z <= MAX_Z; z++) {
    const cols = 2 * 2 ** z, rows = 2 ** z;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const url = `https://trek.nasa.gov/tiles/Mars/EQ/${layer.id}/1.0.0/default/default028mm/${z}/${row}/${col}.${layer.ext}`;
        const dir = join(OUT, layer.id, String(z), String(row));
        await mkdir(dir, { recursive: true });
        const res = await fetch(url);
        if (!res.ok) { console.warn('skip', res.status, url); continue; }
        await writeFile(join(dir, `${col}.${layer.ext}`), Buffer.from(await res.arrayBuffer()));
      }
    }
    console.log(layer.id, 'z', z, 'done');
  }
}
await writeFile(join(OUT, 'fallback.meta.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  maxZoom: MAX_Z,
  source: 'NASA/JPL-Caltech Mars Trek WMTS (EQ, EPSG::104905)',
  layers: LAYERS.map((l) => l.id),
}, null, 2));
