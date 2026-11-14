/**
 * The editable terrain model:  height = source elevation + Σ patch deltas.
 *
 * It never mutates source data. It exposes which patches are active (HEAD, or a past
 * version while "time-travelling"), optional preview patches (pending proposals shown
 * as ghosts), and emits `terrain:changed` with the minimal bbox so the renderer can
 * rebuild only the tiles that intersect it.
 */
import type { BBoxT, GeometryPatchT } from '../../contract';
import type { EventBus } from '../events';
import { bboxIntersects, bboxUnion } from '../geo/mars';
import type { ElevationService } from '../elevation/ElevationService';
import { compilePatch, type CompiledPatch } from './patches';

export interface HeightBreakdown {
  height_m: number; // final (source + applied edits [+ preview])
  source_m: number;
  sourceLayerId: string;
  sourceMetersPerPixel: number | null;
  sourceBlended: boolean;
  applied: { patchId: string; delta_m: number }[];
  preview: { patchId: string; delta_m: number }[];
}

export class TerrainModel {
  private active: CompiledPatch[] = [];
  private preview: CompiledPatch[] = [];

  private elevation: ElevationService;
  private bus: EventBus;

  constructor(elevation: ElevationService, bus: EventBus) {
    this.elevation = elevation;
    this.bus = bus;
  }

  /** Replace the applied patch set; emits change for the symmetric difference only. */
  setActivePatches(patches: Iterable<GeometryPatchT>, reason: string) {
    const next = [...patches];
    const oldIds = new Map(this.active.map((c) => [c.patch.id, c]));
    const newIds = new Set(next.map((p) => p.id));
    let bbox: BBoxT | null = null;
    for (const c of this.active) if (!newIds.has(c.patch.id)) bbox = bboxUnion(bbox, c.bbox);
    const compiled = next.map((p) => {
      const old = oldIds.get(p.id);
      if (old && JSON.stringify(old.patch) === JSON.stringify(p)) return old;
      const c = compilePatch(p);
      bbox = bboxUnion(bbox, c.bbox);
      if (old) bbox = bboxUnion(bbox, old.bbox);
      return c;
    });
    this.active = compiled;
    if (bbox) this.bus.emit('terrain:changed', { bbox, reason });
  }

  setPreviewPatches(patches: GeometryPatchT[]) {
    let bbox: BBoxT | null = null;
    for (const c of this.preview) bbox = bboxUnion(bbox, c.bbox);
    this.preview = patches.map(compilePatch);
    for (const c of this.preview) bbox = bboxUnion(bbox, c.bbox);
    if (bbox) this.bus.emit('terrain:changed', { bbox, reason: 'preview' });
  }

  /** Patches relevant to a tile — call once per tile build, then use heightFast. */
  patchesFor(b: BBoxT) {
    return {
      active: this.active.filter((c) => bboxIntersects(c.bbox, b)),
      preview: this.preview.filter((c) => bboxIntersects(c.bbox, b)),
    };
  }

  heightFast(lat: number, lon: number, rel: { active: CompiledPatch[]; preview: CompiledPatch[] }) {
    let h = this.elevation.height(lat, lon), edit = 0, prev = 0;
    for (const c of rel.active) edit += c.delta(lat, lon);
    for (const c of rel.preview) prev += c.delta(lat, lon);
    h += edit + prev;
    return { h, edit, prev };
  }

  /** Final height (source + applied + preview), no provenance. */
  height(lat: number, lon: number) {
    let h = this.elevation.height(lat, lon);
    for (const c of this.active) h += c.delta(lat, lon);
    for (const c of this.preview) h += c.delta(lat, lon);
    return h;
  }

  breakdown(lat: number, lon: number): HeightBreakdown {
    const s = this.elevation.sample(lat, lon);
    const applied = this.active.map((c) => ({ patchId: c.patch.id, delta_m: c.delta(lat, lon) })).filter((x) => x.delta_m !== 0);
    const preview = this.preview.map((c) => ({ patchId: c.patch.id, delta_m: c.delta(lat, lon) })).filter((x) => x.delta_m !== 0);
    const total = applied.reduce((a, b) => a + b.delta_m, 0) + preview.reduce((a, b) => a + b.delta_m, 0);
    return {
      height_m: s.elevation_m + total,
      source_m: s.elevation_m,
      sourceLayerId: s.layerId,
      sourceMetersPerPixel: s.metersPerPixel,
      sourceBlended: s.blended,
      applied,
      preview,
    };
  }

  activePatches() {
    return this.active.map((c) => c.patch);
  }
}
