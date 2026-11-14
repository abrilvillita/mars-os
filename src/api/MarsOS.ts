/**
 * MARS OS public API — the ONLY entry point other modules (AI engine, route planner,
 * mission analysis, tests, browser console) should use. It never exposes Three.js objects.
 *
 *   const os = getMarsOS();
 *   os.regions.at(18.44, 77.45)                       // named regions containing a point
 *   os.regions.cellAt(18.44, 77.45, 12)              // stable quadtree cell
 *   os.nodes.grid('mars:eq:z12:x5928:y1590', 9)       // editable node grid with heights
 *   os.terrain.heightAt(18.44, 77.45)                 // height + provenance breakdown
 *   os.proposals.submit({...ChangeProposal})          // AI/human change request (validated)
 *   os.proposals.approve(id) / reject(id) / revert(id)
 *   os.history.list() / view(versionId) / restore(versionId, regionId?)
 *   os.on('terrain:changed', ({ bbox }) => ...)
 *
 * In the browser it is also available as `window.marsOS` for quick experiments.
 */
import type { ActorT, BBoxT, ChangeProposalT, GeometryPatchT, LocalizedTextT, RegionT, TerrainChangeLogT } from '../contract';
import { SCHEMA_VERSION, TerrainChangeLog } from '../contract';
import { CatalogService } from '../core/catalog/CatalogService';
import { ElevationService } from '../core/elevation/ElevationService';
import { EventBus, type MarsEvents } from '../core/events';
import { bboxContainsPoint, bboxIntersects, distanceM } from '../core/geo/mars';
import {
  cellId, nodeId, nodeLatLon, parseCellId, parseNodeId, tileAt, tileBBox, tileWidthM, tilesInBBox, type TileKey,
} from '../core/geo/tiling';
import { VersionStore } from '../core/history/VersionStore';
import { ProposalService, type ApprovalPolicy } from '../core/proposals/ProposalService';
import { TerrainModel } from '../core/terrain/TerrainModel';
import { patchBBox } from '../core/terrain/patches';

export interface CellInfo {
  id: string;
  tile: TileKey;
  bbox: BBoxT;
  widthM: number;
  regions: string[]; // named regions intersecting this cell
}

export interface NodeInfo {
  id: string;
  cellId: string;
  i: number;
  j: number;
  lat: number;
  lon: number;
  height_m: number;
  source_m: number;
  edit_m: number;
  sourceLayerId: string;
  sourceMetersPerPixel: number | null;
  /** Spacing between neighbouring nodes, meters (E-W at node latitude, N-S). */
  spacingM: { ew: number; ns: number };
  /** True when node spacing is finer than the source elevation resolution (interpolated, not measured). */
  interpolated: boolean;
}

const STORAGE_KEY = 'marsos.changelog.v1';
const HUMAN: ActorT = { kind: 'human', id: 'local-user' };

export class MarsOS {
  readonly bus = new EventBus<MarsEvents>();
  readonly catalogService = new CatalogService();
  readonly elevationService = new ElevationService();
  readonly versionStore = new VersionStore();
  readonly terrainModel: TerrainModel;
  readonly proposalService: ProposalService;
  /** Version being viewed (time travel). null = HEAD. */
  viewingVersionId: string | null = null;
  ready = false;

  constructor() {
    this.terrainModel = new TerrainModel(this.elevationService, this.bus);
    this.proposalService = new ProposalService(
      this.versionStore,
      this.bus,
      (id) => this.catalogService.regions.get(id)?.bbox ?? null,
      () => this.syncTerrain('history'),
    );
    this.bus.on('proposals:changed', () => this.persist());
  }

  async init(opts: { baseUrl: string; catalogs: string[] }) {
    for (const c of opts.catalogs) await this.catalogService.load(opts.baseUrl + c);
    await this.elevationService.loadFromLayers([...this.catalogService.layers.values()], opts.baseUrl);
    this.restoreFromStorage();
    this.ready = true;
    this.syncTerrain('init');
    this.bus.emit('catalog:loaded', { catalogId: this.catalogService.primary?.id ?? '' });
  }

  on<K extends keyof MarsEvents>(type: K, fn: (p: MarsEvents[K]) => void) {
    return this.bus.on(type, fn);
  }

  /** Push the patch set of HEAD (or the viewed version) into the terrain model. */
  private syncTerrain(reason: string) {
    const state = this.versionStore.stateAt(this.viewingVersionId ?? this.versionStore.head);
    this.terrainModel.setActivePatches(state.values(), reason);
    this.bus.emit('history:changed', { headVersionId: this.versionStore.head, viewingVersionId: this.viewingVersionId });
    this.persist();
  }

  // ───────────────────────── catalog ─────────────────────────
  readonly catalog = {
    sources: () => [...this.catalogService.sources.values()],
    source: (id: string) => this.catalogService.sources.get(id) ?? null,
    layers: () => [...this.catalogService.layers.values()],
    layer: (id: string) => this.catalogService.layers.get(id) ?? null,
    features: () => this.catalogService.features(),
    referenceValues: () => this.catalogService.referenceValues(),
  };

  // ───────────────────────── regions & cells ─────────────────────────
  readonly regions = {
    list: (): RegionT[] => [...this.catalogService.regions.values()],
    get: (id: string): RegionT | null => this.catalogService.regions.get(id) ?? null,
    /** Named regions containing a point, smallest first. */
    at: (lat: number, lon: number): RegionT[] =>
      this.regions
        .list()
        .filter((r) => bboxContainsPoint(r.bbox, lat, lon))
        .sort((a, b) => (a.bbox.east - a.bbox.west) * (a.bbox.north - a.bbox.south) - (b.bbox.east - b.bbox.west) * (b.bbox.north - b.bbox.south)),
    query: (b: BBoxT): RegionT[] => this.regions.list().filter((r) => bboxIntersects(r.bbox, b)),
    cellAt: (lat: number, lon: number, z: number): CellInfo => this.regions.cell(cellId(tileAt(lat, lon, z)))!,
    cell: (id: string): CellInfo | null => {
      const t = parseCellId(id);
      if (!t) return null;
      const b = tileBBox(t);
      return { id, tile: t, bbox: b, widthM: tileWidthM(t), regions: this.regions.query(b).map((r) => r.id) };
    },
    cellsIn: (b: BBoxT, z: number): CellInfo[] => tilesInBBox(b, z, 1024).map((t) => this.regions.cell(cellId(t))!),
  };

  // ───────────────────────── nodes ─────────────────────────
  readonly nodes = {
    /** N×N node grid of a cell with current heights and provenance. */
    grid: (cell: string, gridSize = 9): NodeInfo[] => {
      const t = parseCellId(cell);
      if (!t) throw new Error('Invalid cell id ' + cell);
      const out: NodeInfo[] = [];
      for (let j = 0; j < gridSize; j++) for (let i = 0; i < gridSize; i++) out.push(this.nodes.get(nodeId(cell, gridSize, i, j))!);
      return out;
    },
    get: (id: string): NodeInfo | null => {
      const n = parseNodeId(id);
      if (!n) return null;
      const t = parseCellId(n.cellId)!;
      const { lat, lon } = nodeLatLon(t, n.gridSize, n.i, n.j);
      const b = this.terrainModel.breakdown(lat, lon);
      const bb = tileBBox(t);
      const ew = distanceM(lat, bb.west, lat, bb.east) / (n.gridSize - 1);
      const ns = distanceM(bb.north, lon, bb.south, lon) / (n.gridSize - 1);
      return {
        id, cellId: n.cellId, i: n.i, j: n.j, lat, lon,
        height_m: b.height_m,
        source_m: b.source_m,
        edit_m: b.applied.reduce((a, x) => a + x.delta_m, 0),
        sourceLayerId: b.sourceLayerId,
        sourceMetersPerPixel: b.sourceMetersPerPixel,
        spacingM: { ew, ns },
        interpolated: b.sourceMetersPerPixel !== null && Math.min(ew, ns) < b.sourceMetersPerPixel,
      };
    },
  };

  // ───────────────────────── terrain ─────────────────────────
  readonly terrain = {
    heightAt: (lat: number, lon: number) => this.terrainModel.breakdown(lat, lon),
    activePatches: (): GeometryPatchT[] => this.terrainModel.activePatches(),
    elevationGrids: () => this.elevationService.loaded.map(({ data: _d, ...meta }) => meta),
  };

  // ───────────────────────── proposals ─────────────────────────
  readonly proposals = {
    validate: (p: unknown) => this.proposalService.validate(p),
    submit: (p: unknown) => this.proposalService.submit(p),
    list: (status?: ChangeProposalT['status']) => this.proposalService.list(status ? { status } : undefined),
    get: (id: string) => this.proposalService.get(id),
    approve: (id: string, reviewer: ActorT = HUMAN, comment: string | null = null) => this.proposalService.approve(id, reviewer, comment),
    reject: (id: string, reviewer: ActorT = HUMAN, comment: string | null = null) => this.proposalService.reject(id, reviewer, comment),
    revert: (id: string, actor: ActorT = HUMAN) => this.proposalService.revert(id, actor),
    /** Show a pending proposal as a ghost on the terrain (null = clear). Does not modify history. */
    preview: (id: string | null) => this.terrainModel.setPreviewPatches(id ? this.proposalService.get(id)?.patches ?? [] : []),
    getPolicy: (): ApprovalPolicy => ({ ...this.proposalService.policy }),
    setPolicy: (p: Partial<ApprovalPolicy>) => {
      this.proposalService.policy = { ...this.proposalService.policy, ...p };
      this.bus.emit('proposals:changed', { proposalId: null });
    },
    /** Helper for UIs: build a human proposal that offsets selected nodes of a cell. */
    fromNodeOffsets: (cell: string, gridSize: number, offsets: { i: number; j: number; delta_m: number }[], note: LocalizedTextT): ChangeProposalT => ({
      id: `prop.human.${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      origin: HUMAN,
      regionIds: [cell],
      patches: [{ type: 'node_offsets', id: `patch.${Date.now().toString(36)}`, cellId: cell, gridSize, offsets }],
      evidence: [{ kind: 'user_note', sourceId: null, url: null, description: note, retrievedAt: null, verified: false, synthetic: false }],
      confidence: 0.5,
      risk: 'medium',
      rationale: note,
      status: 'pending',
      review: null,
      appliedVersionId: null,
      synthetic: false,
    }),
  };

  // ───────────────────────── history ─────────────────────────
  readonly history = {
    list: () => this.versionStore.list(),
    head: () => this.versionStore.head,
    viewing: () => this.viewingVersionId,
    /** Time-travel: render the terrain as it was at a version (null = back to HEAD). Read-only. */
    view: (versionId: string | null) => {
      this.viewingVersionId = versionId === this.versionStore.head ? null : versionId;
      this.syncTerrain('time-travel');
    },
    /** Make HEAD equal to an older version (whole planet, or only within a region/cell). */
    restore: (versionId: string, regionOrCellId?: string, actor: ActorT = HUMAN) => {
      const within = regionOrCellId ? this.proposalService.regionBBox(regionOrCellId) : null;
      const v = this.versionStore.restore(versionId, actor, within, regionOrCellId ? [regionOrCellId] : []);
      this.viewingVersionId = null;
      this.syncTerrain('restore');
      return v;
    },
    diff: (fromId: string | null, toId: string | null) => this.versionStore.diff(fromId, toId),
    forRegion: (regionOrCellId: string) => {
      const b = this.proposalService.regionBBox(regionOrCellId);
      return b ? this.versionStore.touching(b) : [];
    },
    patchBBox,
  };

  // ───────────────────────── persistence ─────────────────────────
  exportChangeLog(): TerrainChangeLogT {
    return {
      schemaVersion: SCHEMA_VERSION,
      catalogId: this.catalogService.primary?.id ?? 'catalog.unknown',
      headVersionId: this.versionStore.head,
      proposals: this.proposalService.toJSON(),
      versions: this.versionStore.list(),
    };
  }

  importChangeLog(json: unknown) {
    const parsed = TerrainChangeLog.safeParse(json);
    if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
    this.versionStore.load(parsed.data.versions, parsed.data.headVersionId);
    this.proposalService.load(parsed.data.proposals);
    this.viewingVersionId = null;
    this.syncTerrain('import');
  }

  resetChangeLog() {
    this.versionStore.load([], null);
    const fresh = new VersionStore();
    this.versionStore.load(fresh.list(), fresh.head);
    this.proposalService.load([]);
    this.viewingVersionId = null;
    this.syncTerrain('reset');
  }

  private persist() {
    if (!this.ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.exportChangeLog()));
    } catch {
      /* storage unavailable: history stays in memory */
    }
  }

  private restoreFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = TerrainChangeLog.safeParse(JSON.parse(raw));
      if (!parsed.success) return;
      this.versionStore.load(parsed.data.versions, parsed.data.headVersionId);
      this.proposalService.load(parsed.data.proposals);
    } catch {
      /* ignore corrupted or unavailable storage */
    }
  }
}

let instance: MarsOS | null = null;
export function getMarsOS() {
  if (!instance) {
    instance = new MarsOS();
    (globalThis as unknown as { marsOS: MarsOS }).marsOS = instance;
  }
  return instance;
}
