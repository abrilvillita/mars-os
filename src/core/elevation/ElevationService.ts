/**
 * Multi-resolution elevation from real products declared in the catalog (layers of kind
 * "elevation"). Three source types, all sampled through one interface:
 *
 *  - raster_grid     whole file loaded at start (MOLA global 4 ppd, MOLA Jezero 32 ppd)
 *  - raster_pyramid  tiled pyramid loaded ON DEMAND per tile and level (CTX DEM 20 m)
 *  - raster_service  crops fetched ON DEMAND from the MARS OS backend (MOLA 128 ppd, any region)
 *
 * Every sample reports WHICH product and WHAT resolution it came from. The finest loaded
 * source wins; sources are feathered at their edges to avoid artificial cliffs. When a finer
 * tile arrives, `onRegionLoaded(bbox)` fires so only the affected terrain is rebuilt.
 * Nothing is ever sharpened or invented: where only coarse data exists, the coarse value
 * (and its coarse resolution) is returned.
 */
import type { BBoxT, LayerT } from '../../contract';
import { M_PER_DEG } from '../geo/mars';

export interface ElevationSample {
  elevation_m: number;
  layerId: string; // finest contributing source
  metersPerPixel: number | null; // resolution actually used (pyramid level / grid)
  blended: boolean;
}

export type BinaryLoader = (url: string) => Promise<ArrayBuffer>;

const FEATHER = 0.12; // fraction of a regional source's half-size used for edge blending

/** Gunzip only if the bytes are still gzip (some servers send Content-Encoding: gzip and the
 *  browser has already decompressed the body). */
async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const b = new Uint8Array(buf, 0, Math.min(2, buf.byteLength));
  if (b[0] !== 0x1f || b[1] !== 0x8b) return buf;
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export const defaultLoader: BinaryLoader = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.arrayBuffer();
};

interface Sampler {
  layerId: string;
  sourceIds: string[];
  finestMpp: number;
  global: boolean;
  /** [weight, meters, mppUsed] or null if not covered / not loaded */
  sample(lat: number, lon: number, wantMpp: number): [number, number, number] | null;
}

const toConv = (lon: number, lon360: boolean) => (lon360 && lon < 0 ? lon + 360 : lon);

function edgeWeight(L: number, lat: number, w: number, e: number, s: number, n: number) {
  const hx = (e - w) / 2, hy = (n - s) / 2;
  const ex = Math.min(L - w, e - L) / (hx * FEATHER);
  const ey = Math.min(lat - s, n - lat) / (hy * FEATHER);
  const k = Math.max(0, Math.min(1, Math.min(ex, ey)));
  return k * k * (3 - 2 * k);
}

/** A fully loaded grid (static file or a backend crop). */
export class GridSampler implements Sampler {
  layerId: string;
  sourceIds: string[];
  finestMpp: number;
  global: boolean;
  private data: Int16Array | Float32Array;
  private width: number;
  private height: number;
  private west: number;
  private east: number;
  private south: number;
  private north: number;
  private lon360: boolean;
  private noData: number | null;
  private scale: number;

  constructor(o: {
    layerId: string; sourceIds: string[]; data: Int16Array | Float32Array; width: number; height: number;
    west: number; east: number; south: number; north: number; lon360: boolean; noData: number | null; mpp: number | null; scale?: number;
  }) {
    this.layerId = o.layerId;
    this.sourceIds = o.sourceIds;
    this.data = o.data;
    this.width = o.width;
    this.height = o.height;
    this.west = o.west;
    this.east = o.east;
    this.south = o.south;
    this.north = o.north;
    this.lon360 = o.lon360;
    this.noData = o.noData;
    this.scale = o.scale ?? 1;
    this.global = o.east - o.west >= 359.999;
    this.finestMpp = o.mpp ?? ((o.east - o.west) / o.width) * M_PER_DEG;
  }

  get bbox(): BBoxT {
    const f = (l: number) => (l > 180 ? l - 360 : l);
    return { west: f(this.west), east: f(this.east), south: this.south, north: this.north };
  }

  sample(lat: number, lon: number): [number, number, number] | null {
    const L = toConv(lon, this.lon360);
    if (L < this.west || L > this.east || lat < this.south || lat > this.north) return null;
    const ppdX = this.width / (this.east - this.west), ppdY = this.height / (this.north - this.south);
    const fx = (L - this.west) * ppdX - 0.5;
    const fy = (this.north - lat) * ppdY - 0.5;
    let x0 = Math.floor(fx), x1 = x0 + 1;
    const y0 = Math.max(0, Math.min(this.height - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(this.height - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));
    let tx = fx - x0;
    if (this.global) {
      x0 = (x0 + this.width) % this.width;
      x1 = (x1 + this.width) % this.width;
    } else {
      x0 = Math.max(0, Math.min(this.width - 1, x0));
      x1 = Math.max(0, Math.min(this.width - 1, x1));
      tx = Math.max(0, Math.min(1, tx));
    }
    const d = this.data, w = this.width;
    const v00 = d[y0 * w + x0], v10 = d[y0 * w + x1], v01 = d[y1 * w + x0], v11 = d[y1 * w + x1];
    if (this.noData !== null && (v00 === this.noData || v10 === this.noData || v01 === this.noData || v11 === this.noData)) return null;
    const v = ((v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty) * this.scale;
    const weight = this.global ? 1 : edgeWeight(L, lat, this.west, this.east, this.south, this.north);
    return [weight, v, this.finestMpp];
  }
}

interface PyramidMeta {
  levels: { level: number; metersPerPixel: number; width: number; height: number }[];
  tileSize: number;
  west: number; east: number; south: number; north: number;
  lon360: boolean;
  scale: number; offset: number; noData: number;
  gzip: boolean;
}

/** Tiled multi-level pyramid; tiles are requested lazily the first time they are sampled. */
export class PyramidSampler implements Sampler {
  layerId: string;
  sourceIds: string[];
  finestMpp: number;
  global = false;
  private tiles = new Map<string, Int16Array | 'loading' | 'missing'>();
  private loader: BinaryLoader;
  private baseUrl: string;
  private m: PyramidMeta;
  private onTile: (bbox: BBoxT) => void;
  pending = 0;

  constructor(layerId: string, sourceIds: string[], baseUrl: string, meta: PyramidMeta, loader: BinaryLoader, onTile: (bbox: BBoxT) => void) {
    this.layerId = layerId;
    this.sourceIds = sourceIds;
    this.baseUrl = baseUrl;
    this.m = meta;
    this.loader = loader;
    this.onTile = onTile;
    this.finestMpp = meta.levels[0].metersPerPixel;
  }

  get bbox(): BBoxT {
    return { west: this.m.west, east: this.m.east, south: this.m.south, north: this.m.north };
  }

  /** Coarsest level whose resolution still satisfies wantMpp (0 = finest). */
  private levelFor(wantMpp: number) {
    let L = 0;
    for (const lv of this.m.levels) if (lv.metersPerPixel <= Math.max(wantMpp, this.finestMpp)) L = lv.level;
    return L;
  }

  private tileBBox(level: number, tr: number, tc: number): BBoxT {
    const lv = this.m.levels[level];
    const dx = (this.m.east - this.m.west) / lv.width, dy = (this.m.north - this.m.south) / lv.height;
    const ts = this.m.tileSize;
    return {
      west: this.m.west + tc * ts * dx,
      east: Math.min(this.m.east, this.m.west + (tc + 1) * ts * dx),
      north: this.m.north - tr * ts * dy,
      south: Math.max(this.m.south, this.m.north - (tr + 1) * ts * dy),
    };
  }

  private request(level: number, tr: number, tc: number) {
    const key = `${level}/${tr}_${tc}`;
    if (this.tiles.has(key)) return;
    this.tiles.set(key, 'loading');
    this.pending++;
    const url = `${this.baseUrl}/${key}.i16${this.m.gzip ? '.gz' : ''}`;
    this.loader(url)
      .then((buf) => (this.m.gzip ? gunzip(buf) : buf))
      .then((buf) => {
        this.tiles.set(key, new Int16Array(buf));
        this.onTile(this.tileBBox(level, tr, tc));
      })
      .catch(() => this.tiles.set(key, 'missing'))
      .finally(() => this.pending--);
  }

  private pixel(level: number, x: number, y: number): number | null {
    const lv = this.m.levels[level];
    x = Math.max(0, Math.min(lv.width - 1, x));
    y = Math.max(0, Math.min(lv.height - 1, y));
    const ts = this.m.tileSize;
    const tc = Math.floor(x / ts), tr = Math.floor(y / ts);
    const t = this.tiles.get(`${level}/${tr}_${tc}`);
    if (t === undefined) this.request(level, tr, tc);
    if (!(t instanceof Int16Array)) return null;
    const tw = Math.min(ts, lv.width - tc * ts);
    const raw = t[(y - tr * ts) * tw + (x - tc * ts)];
    return raw === this.m.noData ? null : raw * this.m.scale + this.m.offset;
  }

  sample(lat: number, lon: number, wantMpp: number): [number, number, number] | null {
    const L0 = toConv(lon, this.m.lon360);
    const m = this.m;
    if (L0 < m.west || L0 > m.east || lat < m.south || lat > m.north) return null;
    const start = this.levelFor(wantMpp);
    for (let level = start; level < m.levels.length; level++) {
      const lv = m.levels[level];
      const fx = ((L0 - m.west) / (m.east - m.west)) * lv.width - 0.5;
      const fy = ((m.north - lat) / (m.north - m.south)) * lv.height - 0.5;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ts = m.tileSize;
      const tc = Math.max(0, Math.floor(Math.max(0, x0) / ts)), tr = Math.max(0, Math.floor(Math.max(0, y0) / ts));
      const key = `${level}/${tr}_${tc}`;
      const tile = this.tiles.get(key);
      if (tile === undefined) this.request(level, tr, tc);
      if (!(tile instanceof Int16Array)) continue; // fall back to a coarser loaded level
      const tx = Math.max(0, Math.min(1, fx - x0)), ty = Math.max(0, Math.min(1, fy - y0));
      const a = this.pixel(level, x0, y0), b = this.pixel(level, x0 + 1, y0), c = this.pixel(level, x0, y0 + 1), d = this.pixel(level, x0 + 1, y0 + 1);
      if (a === null || b === null || c === null || d === null) {
        // neighbour tile not loaded yet or nodata: use the nearest valid pixel only if this one is valid
        const own = this.pixel(level, Math.round(fx), Math.round(fy));
        if (own === null) continue;
        return [edgeWeight(L0, lat, m.west, m.east, m.south, m.north), own, lv.metersPerPixel];
      }
      const v = (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
      return [edgeWeight(L0, lat, m.west, m.east, m.south, m.north), v, lv.metersPerPixel];
    }
    return null;
  }
}

/** Crops fetched on demand from the MARS OS backend (e.g. MOLA 128 ppd). */
export class ServiceSampler implements Sampler {
  layerId: string;
  sourceIds: string[];
  finestMpp: number;
  global = false;
  private crops = new Map<string, GridSampler | 'loading' | 'failed'>();
  private order: string[] = [];
  private url: string;
  private ppd: number;
  private deg: number;
  private latRange: [number, number];
  private loader: BinaryLoader;
  private onCrop: (bbox: BBoxT) => void;
  /** Last error (e.g. backend not running) — shown in the UI, never hidden. */
  lastError: string | null = null;
  available = true;

  constructor(layer: LayerT, loader: BinaryLoader, onCrop: (bbox: BBoxT) => void, baseUrl = '') {
    if (layer.access.protocol !== 'raster_service') throw new Error('not raster_service');
    this.layerId = layer.id;
    this.sourceIds = layer.sourceIds;
    this.url = baseUrl + layer.access.url;
    this.ppd = layer.access.pixelsPerDegree;
    this.deg = layer.access.cropDegrees;
    this.latRange = layer.access.coverageLat;
    this.loader = loader;
    this.onCrop = onCrop;
    this.finestMpp = layer.resolution.metersPerPixel ?? M_PER_DEG / this.ppd;
  }

  private keyFor(lat: number, lon: number) {
    const lonE = lon < 0 ? lon + 360 : lon;
    const lat0 = Math.floor(lat / this.deg) * this.deg, lon0 = Math.floor(lonE / this.deg) * this.deg;
    return { lat0, lon0, key: `${lat0}_${lon0}` };
  }

  /** Request the crop(s) around a point (call when the user zooms in or selects a cell). */
  ensure(lat: number, lon: number, radiusDeg = 0) {
    if (!this.available) return;
    const pts = radiusDeg > 0
      ? [[lat, lon], [lat + radiusDeg, lon], [lat - radiusDeg, lon], [lat, lon + radiusDeg], [lat, lon - radiusDeg]]
      : [[lat, lon]];
    for (const [la, lo] of pts) {
      if (la < this.latRange[0] || la >= this.latRange[1]) continue;
      const { lat0, lon0, key } = this.keyFor(la, lo);
      if (this.crops.has(key)) continue;
      this.crops.set(key, 'loading');
      const n = Math.round(this.deg * this.ppd);
      this.loader(`${this.url}?lat0=${lat0}&lon0=${lon0}`)
        .then((buf) => {
          const data = new Int16Array(buf);
          if (data.length !== n * n) throw new Error('size mismatch');
          const g = new GridSampler({
            layerId: this.layerId, sourceIds: this.sourceIds, data, width: n, height: n,
            west: lon0, east: lon0 + this.deg, south: lat0, north: lat0 + this.deg, lon360: true, noData: null, mpp: this.finestMpp,
          });
          this.crops.set(key, g);
          this.order.push(key);
          this.lastError = null;
          if (this.order.length > 48) {
            const old = this.order.shift()!;
            this.crops.delete(old);
          }
          this.onCrop(g.bbox);
        })
        .catch((e: Error) => {
          this.crops.set(key, 'failed');
          this.lastError = e.message;
        });
    }
  }

  sample(lat: number, lon: number): [number, number, number] | null {
    const c = this.crops.get(this.keyFor(lat, lon).key);
    if (!(c instanceof GridSampler)) return null;
    const s = c.sample(lat, lon);
    if (!s) return null;
    // crops tile seamlessly with each other, so only feather where a neighbour crop is missing
    return [1, s[1], s[2]];
  }

  loadingCount() {
    return [...this.crops.values()].filter((c) => c === 'loading').length;
  }

  loadedCount() {
    return [...this.crops.values()].filter((c) => c instanceof GridSampler).length;
  }
}

export class ElevationService {
  private samplers: Sampler[] = [];
  private loader: BinaryLoader = defaultLoader;
  /** Called when finer data for a bbox becomes available (the terrain model re-emits it). */
  onRegionLoaded: ((bbox: BBoxT, layerId: string) => void) | null = null;
  service: ServiceSampler | null = null;
  pyramids: PyramidSampler[] = [];

  setLoader(l: BinaryLoader) {
    this.loader = l;
  }

  get loaded() {
    return this.samplers.map((s) => ({ layerId: s.layerId, sourceIds: s.sourceIds, metersPerPixel: s.finestMpp, global: s.global }));
  }

  async loadFromLayers(layers: LayerT[], baseUrl: string, serviceBaseUrl = '') {
    const elev = layers.filter((l) => l.kind === 'elevation');
    const out: Sampler[] = [];
    for (const layer of elev) {
      const a = layer.access;
      if (a.protocol === 'raster_grid') {
        const buf = await this.loader(baseUrl + a.url);
        const data = a.encoding === 'int16le' ? new Int16Array(buf) : new Float32Array(buf);
        if (data.length !== a.width * a.height) throw new Error(`Elevation grid ${layer.id}: size mismatch`);
        out.push(new GridSampler({
          layerId: layer.id, sourceIds: layer.sourceIds, data, width: a.width, height: a.height,
          west: a.gridExtent.west, east: a.gridExtent.east, south: a.gridExtent.south, north: a.gridExtent.north,
          lon360: a.lonConvention === '0-360E', noData: a.noData, mpp: layer.resolution.metersPerPixel,
        }));
      } else if (a.protocol === 'raster_pyramid') {
        const p = new PyramidSampler(layer.id, layer.sourceIds, baseUrl + a.url, {
          levels: a.levels, tileSize: a.tileSize,
          west: a.gridExtent.west, east: a.gridExtent.east, south: a.gridExtent.south, north: a.gridExtent.north,
          lon360: a.lonConvention === '0-360E', scale: a.scale, offset: a.offset, noData: a.noData, gzip: a.compression === 'gzip',
        }, this.loader, (bbox) => this.onRegionLoaded?.(bbox, layer.id));
        this.pyramids.push(p);
        out.push(p);
      } else if (a.protocol === 'raster_service') {
        this.service = new ServiceSampler(layer, this.loader, (bbox) => this.onRegionLoaded?.(bbox, layer.id), serviceBaseUrl);
        out.push(this.service);
      }
    }
    this.samplers = out.sort((x, y) => x.finestMpp - y.finestMpp); // finest first
  }

  /** Ask on-demand sources for detail around a point (no-op where unavailable). */
  ensureDetail(lat: number, lon: number, radiusDeg = 0) {
    this.service?.ensure(lat, lon, radiusDeg);
  }

  sample(lat: number, lon: number, wantMpp = 0): ElevationSample {
    let acc = 0, remaining = 1;
    let finest: { id: string; mpp: number } | null = null;
    let blended = false;
    for (const s of this.samplers) {
      const r = s.sample(lat, lon, wantMpp);
      if (!r) continue;
      const [w, v, mpp] = r;
      if (w <= 0) continue;
      if (!finest) finest = { id: s.layerId, mpp };
      const used = remaining * w;
      acc += used * v;
      remaining -= used;
      if (w < 1) blended = true;
      if (remaining <= 1e-6) break;
    }
    if (!finest) return { elevation_m: 0, layerId: 'none', metersPerPixel: null, blended: false };
    if (remaining > 1e-6) acc /= 1 - remaining;
    return { elevation_m: acc, layerId: finest.id, metersPerPixel: finest.mpp, blended };
  }

  /** Sample each source INDEPENDENTLY (no blending) — used to detect disagreements between products. */
  sampleEach(lat: number, lon: number, wantMpp = 0): { layerId: string; elevation_m: number; metersPerPixel: number }[] {
    const out: { layerId: string; elevation_m: number; metersPerPixel: number }[] = [];
    for (const s of this.samplers) {
      const r = s.sample(lat, lon, wantMpp);
      if (r && r[0] > 0.999) out.push({ layerId: s.layerId, elevation_m: r[1], metersPerPixel: r[2] });
    }
    return out;
  }

  height(lat: number, lon: number, wantMpp = 0): number {
    return this.sample(lat, lon, wantMpp).elevation_m;
  }

  pendingTiles() {
    return this.pyramids.reduce((a, p) => a + p.pending, 0);
  }

  /** Resolves when no on-demand tile or crop is loading (or after timeoutMs). */
  async whenIdle(timeoutMs = 15000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (this.pendingTiles() === 0 && (this.service?.loadingCount() ?? 0) === 0) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }
}
