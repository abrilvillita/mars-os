/**
 * On-demand MOLA MEGDR 128 ppd crops (2°×2°, 256×256 int16 LE, meters) read with HTTP Range from
 * the PDS Geosciences Node and cached on disk. The PDS does not send CORS headers, so browsers
 * cannot read it directly — this proxy is the only reason it exists.
 *
 * PDS layout (verified from the .lbl files): 16 tiles of 44° lat × 90° lon, 11520 × 5632 samples,
 * MSB int16, rows from the northern edge, columns from the western edge (0–360 °E).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PDS = 'https://pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg128';
const PPD = 128;
const CROP_DEG = 2;
const TILE_W = 90 * PPD; // 11520
const N = CROP_DEG * PPD; // 256

const inflight = new Map<string, Promise<Buffer>>();

function tileFor(lat0: number, lon0: number) {
  const maxLat = lat0 >= 44 ? 88 : lat0 >= 0 ? 44 : lat0 >= -44 ? 0 : -44;
  const west = Math.floor(lon0 / 90) * 90;
  const latTag = maxLat >= 0 ? `${String(maxLat).padStart(2, '0')}n` : `${String(-maxLat).padStart(2, '0')}s`;
  return { url: `${PDS}/megt${latTag}${String(west).padStart(3, '0')}hb.img`, maxLat, west };
}

export function validCrop(lat0: number, lon0: number) {
  return Number.isInteger(lat0) && Number.isInteger(lon0) && lat0 % CROP_DEG === 0 && lon0 % CROP_DEG === 0 && lat0 >= -88 && lat0 <= 86 && lon0 >= 0 && lon0 <= 358;
}

export async function getMola128Crop(cacheDir: string, lat0: number, lon0: number): Promise<Buffer> {
  if (!validCrop(lat0, lon0)) throw new Error('lat0/lon0 must be even integers, lat0 ∈ [-88, 86], lon0 ∈ [0, 358] (°E)');
  const key = `${lat0}_${lon0}`;
  const file = join(cacheDir, `${key}.i16`);
  try {
    return await readFile(file);
  } catch { /* not cached */ }
  const running = inflight.get(key);
  if (running) return running;
  const p = (async () => {
    const t = tileFor(lat0, lon0);
    const row0 = Math.round((t.maxLat - (lat0 + CROP_DEG)) * PPD);
    const col0 = Math.round((lon0 - t.west) * PPD);
    const rowBytes = TILE_W * 2;
    const res = await fetch(t.url, { headers: { Range: `bytes=${row0 * rowBytes}-${(row0 + N) * rowBytes - 1}` } });
    if (res.status !== 206) throw new Error(`PDS returned HTTP ${res.status} (expected 206 Partial Content)`);
    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length !== N * rowBytes) throw new Error(`PDS returned ${raw.length} bytes, expected ${N * rowBytes}`);
    const out = Buffer.alloc(N * N * 2);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const s = r * rowBytes + (col0 + c) * 2, d = (r * N + c) * 2;
      out[d] = raw[s + 1]; // MSB → LSB
      out[d + 1] = raw[s];
    }
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, out);
    return out;
  })();
  inflight.set(key, p);
  try {
    return await p;
  } finally {
    inflight.delete(key);
  }
}
