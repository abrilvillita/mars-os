/**
 * Immutable, append-only version history of terrain edits.
 *
 *  - Each Version holds ops (add_patch / remove_patch) relative to its parent.
 *  - State at any version = replay of its ancestor chain.
 *  - Restoring an older state never deletes history: it appends a new version whose ops
 *    transform HEAD into the target state (optionally limited to one region's bbox).
 */
import type { ActorT, BBoxT, GeometryPatchT, LocalizedTextT, VersionOpT, VersionT } from '../../contract';
import { bboxIntersects, bboxUnion } from '../geo/mars';
import { patchBBox } from '../terrain/patches';

export type PatchState = Map<string, GeometryPatchT>;

let seq = 0;
const newId = (prefix: string) => `${prefix}.${Date.now().toString(36)}${(seq++).toString(36).padStart(3, '0')}`;

export class VersionStore {
  private versions = new Map<string, VersionT>();
  private order: string[] = [];
  private cache = new Map<string, PatchState>();
  head: string | null = null;

  constructor() {
    this.commitRaw({
      id: 'ver.base',
      parentId: null,
      createdAt: new Date().toISOString(),
      author: { kind: 'system', id: 'mars-os' },
      message: { en: 'Baseline: source elevation only (no edits)', es: 'Base: solo elevación de origen (sin ediciones)' },
      proposalId: null,
      regionIds: [],
      bbox: null,
      ops: [],
      restoredFrom: null,
    });
  }

  list(): VersionT[] {
    return this.order.map((id) => this.versions.get(id)!);
  }

  get(id: string) {
    return this.versions.get(id) ?? null;
  }

  private commitRaw(v: VersionT) {
    this.versions.set(v.id, v);
    this.order.push(v.id);
    this.head = v.id;
    return v;
  }

  stateAt(versionId: string | null): PatchState {
    if (!versionId) return new Map();
    const cached = this.cache.get(versionId);
    if (cached) return cached;
    const v = this.versions.get(versionId);
    if (!v) throw new Error('Unknown version ' + versionId);
    const state = new Map(this.stateAt(v.parentId));
    for (const op of v.ops) {
      if (op.op === 'add_patch') state.set(op.patch.id, op.patch);
      else state.delete(op.patchId);
    }
    this.cache.set(versionId, state);
    return state;
  }

  commit(input: {
    author: ActorT;
    message: LocalizedTextT;
    ops: VersionOpT[];
    regionIds: string[];
    proposalId?: string | null;
    restoredFrom?: string | null;
  }): VersionT {
    const before = this.stateAt(this.head);
    let bbox: BBoxT | null = null;
    for (const op of input.ops) {
      const p = op.op === 'add_patch' ? op.patch : before.get(op.patchId);
      if (p) bbox = bboxUnion(bbox, patchBBox(p));
    }
    return this.commitRaw({
      id: newId('ver'),
      parentId: this.head,
      createdAt: new Date().toISOString(),
      author: input.author,
      message: input.message,
      proposalId: input.proposalId ?? null,
      regionIds: input.regionIds,
      bbox,
      ops: input.ops,
      restoredFrom: input.restoredFrom ?? null,
    });
  }

  /** Ops that transform state A into state B (optionally only patches intersecting `within`). */
  diffOps(a: PatchState, b: PatchState, within?: BBoxT | null): VersionOpT[] {
    const inScope = (p: GeometryPatchT) => !within || bboxIntersects(patchBBox(p), within);
    const ops: VersionOpT[] = [];
    for (const [id, p] of a) if (!b.has(id) && inScope(p)) ops.push({ op: 'remove_patch', patchId: id });
    for (const [id, p] of b) {
      const old = a.get(id);
      if ((!old || JSON.stringify(old) !== JSON.stringify(p)) && inScope(p)) {
        if (old) ops.push({ op: 'remove_patch', patchId: id });
        ops.push({ op: 'add_patch', patch: p });
      }
    }
    return ops;
  }

  diff(fromId: string | null, toId: string | null) {
    const a = this.stateAt(fromId), b = this.stateAt(toId);
    const ops = this.diffOps(a, b);
    let bbox: BBoxT | null = null;
    for (const op of ops) {
      const p = op.op === 'add_patch' ? op.patch : a.get(op.patchId);
      if (p) bbox = bboxUnion(bbox, patchBBox(p));
    }
    return {
      added: ops.filter((o) => o.op === 'add_patch').map((o) => (o as { patch: GeometryPatchT }).patch),
      removed: ops.filter((o) => o.op === 'remove_patch').map((o) => a.get((o as { patchId: string }).patchId)!).filter(Boolean),
      bbox,
    };
  }

  /** Append a version that makes HEAD equal to `targetId` (within an optional bbox). */
  restore(targetId: string, author: ActorT, within?: BBoxT | null, regionIds: string[] = []): VersionT | null {
    const ops = this.diffOps(this.stateAt(this.head), this.stateAt(targetId), within);
    if (!ops.length) return null;
    return this.commit({
      author,
      message: { en: `Restore state of ${targetId}`, es: `Restaurar estado de ${targetId}` },
      ops,
      regionIds,
      restoredFrom: targetId,
    });
  }

  /** Versions whose changes touched a bbox (for per-region history). */
  touching(b: BBoxT): VersionT[] {
    return this.list().filter((v) => v.bbox && bboxIntersects(v.bbox, b));
  }

  toJSON() {
    return { headVersionId: this.head, versions: this.list() };
  }

  load(versions: VersionT[], head: string | null) {
    this.versions.clear();
    this.order = [];
    this.cache.clear();
    for (const v of versions) this.commitRaw(v);
    this.head = head ?? this.order[this.order.length - 1] ?? null;
  }
}
