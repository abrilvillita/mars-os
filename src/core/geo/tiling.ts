/**
 * Equirectangular quadtree ("trek-eq-2x1"), identical to the NASA Mars Trek EQ WMTS
 * tile matrix: zoom 0 = 2 columns x 1 row of 180° tiles; each level splits in 4.
 *
 * The same quadtree is used for: imagery tiles, terrain mesh tiles (LOD), editable
 * regions ("cells") and node grids. Cell ids are therefore STABLE and DETERMINISTIC:
 *
 *     mars:eq:z{zoom}:x{column}:y{row}
 *
 * Node ids inside a cell's N×N grid:  {cellId}/n{N}:{i}:{j}
 */
import type { BBoxT } from '../../contract';
import { M_PER_DEG, DEG } from './mars';

export interface TileKey {
  z: number;
  x: number; // column, from 180°W eastwards
  y: number; // row, from 90°N southwards
}

export const MAX_TILE_ZOOM = 20;

export function tileSizeDeg(z: number) {
  return 180 / 2 ** z;
}

export function tileBBox({ z, x, y }: TileKey): BBoxT {
  const s = tileSizeDeg(z);
  return { west: -180 + x * s, east: -180 + (x + 1) * s, north: 90 - y * s, south: 90 - (y + 1) * s };
}

export function tileAt(lat: number, lon: number, z: number): TileKey {
  const s = tileSizeDeg(z);
  const cols = 2 * 2 ** z, rows = 2 ** z;
  return {
    z,
    x: Math.min(cols - 1, Math.max(0, Math.floor((lon + 180) / s))),
    y: Math.min(rows - 1, Math.max(0, Math.floor((90 - lat) / s))),
  };
}

export function tileChildren({ z, x, y }: TileKey): TileKey[] {
  return [
    { z: z + 1, x: 2 * x, y: 2 * y },
    { z: z + 1, x: 2 * x + 1, y: 2 * y },
    { z: z + 1, x: 2 * x, y: 2 * y + 1 },
    { z: z + 1, x: 2 * x + 1, y: 2 * y + 1 },
  ];
}

export function tileAncestor(t: TileKey, z: number): TileKey {
  const d = t.z - z;
  return { z, x: t.x >> d, y: t.y >> d };
}

export const rootTiles = (): TileKey[] => [
  { z: 0, x: 0, y: 0 },
  { z: 0, x: 1, y: 0 },
];

export function cellId(t: TileKey) {
  return `mars:eq:z${t.z}:x${t.x}:y${t.y}`;
}

const CELL_RE = /^mars:eq:z(\d+):x(\d+):y(\d+)$/;
export function parseCellId(id: string): TileKey | null {
  const m = CELL_RE.exec(id);
  return m ? { z: +m[1], x: +m[2], y: +m[3] } : null;
}

export function nodeId(cell: string, gridSize: number, i: number, j: number) {
  return `${cell}/n${gridSize}:${i}:${j}`;
}

const NODE_RE = /^(mars:eq:z\d+:x\d+:y\d+)\/n(\d+):(\d+):(\d+)$/;
export function parseNodeId(id: string): { cellId: string; gridSize: number; i: number; j: number } | null {
  const m = NODE_RE.exec(id);
  return m ? { cellId: m[1], gridSize: +m[2], i: +m[3], j: +m[4] } : null;
}

/** Lat/lon of node (i, j) of an N×N grid spanning the cell edges. */
export function nodeLatLon(t: TileKey, gridSize: number, i: number, j: number) {
  const b = tileBBox(t);
  return {
    lon: b.west + (i / (gridSize - 1)) * (b.east - b.west),
    lat: b.north - (j / (gridSize - 1)) * (b.north - b.south),
  };
}

/** Approximate tile width in meters at its center latitude. */
export function tileWidthM(t: TileKey) {
  const b = tileBBox(t);
  const midLat = (b.north + b.south) / 2;
  return tileSizeDeg(t.z) * M_PER_DEG * Math.max(0.02, Math.cos(midLat * DEG));
}

/** All tiles of zoom z intersecting a bbox (capped). */
export function tilesInBBox(b: BBoxT, z: number, cap = 4096): TileKey[] {
  const a = tileAt(b.north, b.west, z), c = tileAt(b.south, b.east, z);
  const out: TileKey[] = [];
  for (let y = a.y; y <= c.y; y++) for (let x = a.x; x <= c.x; x++) {
    out.push({ z, x, y });
    if (out.length >= cap) return out;
  }
  return out;
}

/** Smallest zoom whose tile width is <= target meters (at latitude). */
export function zoomForResolution(metersPerPixel: number, tilePx = 256, lat = 0) {
  for (let z = 0; z <= MAX_TILE_ZOOM; z++) {
    const w = tileSizeDeg(z) * M_PER_DEG * Math.max(0.02, Math.cos(lat * DEG));
    if (w / tilePx <= metersPerPixel) return z;
  }
  return MAX_TILE_ZOOM;
}
