/**
 * Elevation sampling from real raster grids declared in the catalog (layers of kind
 * "elevation" with access.protocol "raster_grid"). Always picks the finest grid that
 * covers a point and reports WHICH grid and at WHAT resolution the value came from.
 *
 * Between a fine regional grid and the coarse global grid the weights are feathered over
 * the outer band of the fine grid to avoid an artificial cliff at the crop boundary.
 * Those transition values are flagged `blended: true`.
 */
import type { LayerT } from '../../contract';

export interface ElevationGrid {
  layerId: string;
  sourceIds: string[];
  data: Int16Array | Float32Array;
  width: number;
  height: number;
  west: number; // in grid lon convention
  east: number;
  south: number;
  north: number;
  lon360: boolean;
  ppd: number; // pixels per degree (x)
  metersPerPixel: number | null;
  noData: number | null;
}

export interface ElevationSample {
  elevation_m: number;
  layerId: string; // finest contributing grid
  metersPerPixel: number | null;
  blended: boolean;
}

const FEATHER = 0.12; // fraction of the fine grid's half-size used for blending

export class ElevationService {
  private grids: ElevationGrid[] = [];

  get loaded() {
    return this.grids;
  }

  async loadFromLayers(layers: LayerT[], baseUrl: string) {
    const elev = layers.filter((l) => l.kind === 'elevation' && l.access.protocol === 'raster_grid');
    const loaded = await Promise.all(
      elev.map(async (layer) => {
        if (layer.access.protocol !== 'raster_grid') return null;
        const a = layer.access;
        const res = await fetch(baseUrl + a.url);
        if (!res.ok) throw new Error(`Elevation grid ${layer.id}: HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const data = a.encoding === 'int16le' ? new Int16Array(buf) : new Float32Array(buf);
        if (data.length !== a.width * a.height) throw new Error(`Elevation grid ${layer.id}: size mismatch`);
        const g: ElevationGrid = {
          layerId: layer.id,
          sourceIds: layer.sourceIds,
          data,
          width: a.width,
          height: a.height,
          west: a.gridExtent.west,
          east: a.gridExtent.east,
          south: a.gridExtent.south,
          north: a.gridExtent.north,
          lon360: a.lonConvention === '0-360E',
          ppd: a.width / (a.gridExtent.east - a.gridExtent.west),
          metersPerPixel: layer.resolution.metersPerPixel,
          noData: a.noData,
        };
        return g;
      }),
    );
    // finest first
    this.grids = loaded.filter((g): g is ElevationGrid => !!g).sort((a, b) => b.ppd - a.ppd);
  }

  /** Returns [weight 0..1, value] of a grid at the point, or null if outside. */
  private sampleGrid(g: ElevationGrid, lat: number, lon: number): [number, number] | null {
    const L = g.lon360 ? (lon < 0 ? lon + 360 : lon) : lon;
    if (L < g.west || L > g.east || lat < g.south || lat > g.north) return null;
    // pixel-is-area: centers at half-pixel offsets
    let fx = (L - g.west) * g.ppd - 0.5;
    const fy = (g.north - lat) * (g.height / (g.north - g.south)) - 0.5;
    const global = g.east - g.west >= 359.999;
    let x0 = Math.floor(fx);
    const y0 = Math.max(0, Math.min(g.height - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(g.height - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));
    let tx = fx - x0;
    let x1 = x0 + 1;
    if (global) {
      x0 = (x0 + g.width) % g.width;
      x1 = (x1 + g.width) % g.width;
    } else {
      x0 = Math.max(0, Math.min(g.width - 1, x0));
      x1 = Math.max(0, Math.min(g.width - 1, x1));
      tx = Math.max(0, Math.min(1, tx));
    }
    const d = g.data, w = g.width;
    const v00 = d[y0 * w + x0], v10 = d[y0 * w + x1], v01 = d[y1 * w + x0], v11 = d[y1 * w + x1];
    if (g.noData !== null && [v00, v10, v01, v11].includes(g.noData)) return null;
    const v = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    let weight = 1;
    if (!global) {
      // feather near the edges of regional grids
      const hx = (g.east - g.west) / 2, hy = (g.north - g.south) / 2;
      const ex = Math.min(L - g.west, g.east - L) / (hx * FEATHER);
      const ey = Math.min(lat - g.south, g.north - lat) / (hy * FEATHER);
      weight = Math.max(0, Math.min(1, Math.min(ex, ey)));
      weight = weight * weight * (3 - 2 * weight);
    }
    return [weight, v];
  }

  sample(lat: number, lon: number): ElevationSample {
    let acc = 0, remaining = 1;
    let finest: ElevationGrid | null = null;
    let blended = false;
    for (const g of this.grids) {
      const s = this.sampleGrid(g, lat, lon);
      if (!s) continue;
      const [w, v] = s;
      if (w <= 0) continue;
      if (!finest) finest = g;
      const used = remaining * w;
      acc += used * v;
      remaining -= used;
      if (w < 1) blended = true;
      if (remaining <= 1e-6) break;
    }
    if (!finest) return { elevation_m: 0, layerId: 'none', metersPerPixel: null, blended: false };
    if (remaining > 1e-6) acc /= 1 - remaining;
    return { elevation_m: acc, layerId: finest.layerId, metersPerPixel: finest.metersPerPixel, blended };
  }

  /** Fast path for mesh building (no provenance). */
  height(lat: number, lon: number): number {
    return this.sample(lat, lon).elevation_m;
  }
}
