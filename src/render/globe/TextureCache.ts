/**
 * WMTS tile texture cache with a concurrency-limited, prioritized request queue,
 * LRU eviction, and an offline fallback path.
 *
 *  - HTTP 404  → "missing" (no data at this tile; renderer walks up to an ancestor).
 *  - Network failure → try the local fallback copy (if the layer has one and z ≤ fallback.maxZoom),
 *    mark the cache as offline, and record `fromFallback` so the UI can show the true resolution.
 */
import * as THREE from 'three';
import type { LayerT } from '../../contract';

export type EntryState = 'queued' | 'loading' | 'ready' | 'missing' | 'error';

export interface TexEntry {
  key: string;
  layerId: string;
  z: number;
  row: number;
  col: number;
  state: EntryState;
  texture: THREE.Texture | null;
  fromFallback: boolean;
  lastUsed: number;
  priority: number;
}

const MAX_INFLIGHT = 10;
const MAX_ENTRIES = 700;

export class TextureCache {
  private entries = new Map<string, TexEntry>();
  private queue: TexEntry[] = [];
  private inflight = 0;
  frame = 0;
  forceOffline = false;
  offlineDetected = false;
  failures = 0;
  onStatus: ((s: { offline: boolean; failures: number }) => void) | null = null;
  onLoaded: (() => void) | null = null;
  maxAnisotropy = 4;

  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  get offline() {
    return this.forceOffline || this.offlineDetected;
  }

  static key(layerId: string, z: number, row: number, col: number) {
    return `${layerId}|${z}|${row}|${col}`;
  }

  peek(layerId: string, z: number, row: number, col: number) {
    const e = this.entries.get(TextureCache.key(layerId, z, row, col));
    if (e) e.lastUsed = this.frame;
    return e ?? null;
  }

  /** Highest zoom this layer can currently be fetched at (fallback caps it when offline). */
  effectiveMaxZoom(layer: LayerT) {
    if (layer.access.protocol !== 'wmts') return -1;
    if (this.offline) return layer.access.fallback ? Math.min(layer.access.maxZoom, layer.access.fallback.maxZoom) : -1;
    return layer.access.maxZoom;
  }

  request(layer: LayerT, z: number, row: number, col: number, priority: number) {
    const key = TextureCache.key(layer.id, z, row, col);
    let e = this.entries.get(key);
    if (e) {
      e.lastUsed = this.frame;
      if (e.state === 'queued') e.priority = Math.min(e.priority, priority);
      return e;
    }
    e = { key, layerId: layer.id, z, row, col, state: 'queued', texture: null, fromFallback: false, lastUsed: this.frame, priority };
    this.entries.set(key, e);
    this.queue.push(e);
    (e as TexEntry & { layer: LayerT }).layer = layer;
    return e;
  }

  /** Call once per frame. */
  pump() {
    this.frame++;
    if (this.queue.length && this.inflight < MAX_INFLIGHT) {
      // drop stale requests (not asked for in the last 30 frames)
      this.queue = this.queue.filter((e) => {
        if (this.frame - e.lastUsed > 30) {
          this.entries.delete(e.key);
          return false;
        }
        return true;
      });
      this.queue.sort((a, b) => a.priority - b.priority);
      while (this.inflight < MAX_INFLIGHT && this.queue.length) this.load(this.queue.shift()!);
    }
    if (this.entries.size > MAX_ENTRIES && this.frame % 30 === 0) this.evict();
  }

  private url(layer: LayerT, z: number, row: number, col: number, fallback: boolean) {
    if (layer.access.protocol !== 'wmts') throw new Error('not wmts');
    const tpl = fallback ? this.baseUrl + layer.access.fallback!.urlTemplate : layer.access.urlTemplate;
    return tpl.replace('{z}', String(z)).replace('{row}', String(row)).replace('{col}', String(col));
  }

  private async load(e: TexEntry) {
    const layer = (e as TexEntry & { layer: LayerT }).layer;
    const fb = layer.access.protocol === 'wmts' ? layer.access.fallback : null;
    const canFallback = !!fb && e.z <= fb.maxZoom;
    e.state = 'loading';
    this.inflight++;
    try {
      let blob: Blob | null = null;
      if (!this.offline) {
        try {
          const res = await fetch(this.url(layer, e.z, e.row, e.col, false), { mode: 'cors' });
          if (res.status === 404 || res.status === 204) {
            e.state = 'missing';
            return;
          }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          blob = await res.blob();
        } catch (err) {
          this.failures++;
          if (this.failures >= 6 && !this.offlineDetected) this.offlineDetected = true;
          this.onStatus?.({ offline: this.offline, failures: this.failures });
          if (!canFallback) throw err;
        }
      }
      if (!blob && canFallback) {
        const res = await fetch(this.url(layer, e.z, e.row, e.col, true));
        if (!res.ok) throw new Error('fallback HTTP ' + res.status);
        blob = await res.blob();
        e.fromFallback = true;
      }
      if (!blob) throw new Error('no data');
      const bmp = await createImageBitmap(blob, { imageOrientation: 'none', premultiplyAlpha: 'none' });
      const tex = new THREE.Texture(bmp as unknown as HTMLImageElement);
      tex.flipY = false;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAnisotropy;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = true;
      tex.needsUpdate = true;
      e.texture = tex;
      e.state = 'ready';
      this.onLoaded?.();
    } catch {
      e.state = 'error';
    } finally {
      this.inflight--;
    }
  }

  private evict() {
    const sorted = [...this.entries.values()].filter((e) => e.state === 'ready' || e.state === 'missing' || e.state === 'error').sort((a, b) => a.lastUsed - b.lastUsed);
    let excess = this.entries.size - MAX_ENTRIES * 0.85;
    for (const e of sorted) {
      if (excess <= 0) break;
      if (this.frame - e.lastUsed < 10) break; // still in use
      if (e.z <= 1) continue; // keep the planet-wide base levels
      e.texture?.dispose();
      (e.texture?.image as ImageBitmap | undefined)?.close?.();
      this.entries.delete(e.key);
      excess--;
    }
  }

  /** Forget errors (e.g. after going back online) and fallback-sourced tiles so live data can replace them. */
  resetFailures() {
    this.failures = 0;
    this.offlineDetected = false;
    for (const e of [...this.entries.values()]) {
      if (e.state === 'error' || e.fromFallback) {
        e.texture?.dispose();
        this.entries.delete(e.key);
      }
    }
    this.onStatus?.({ offline: this.offline, failures: 0 });
  }
}
