/**
 * Intake, validation, review and application of terrain change proposals
 * coming from an external AI engine (or from humans).
 *
 * Safety model:
 *   1. Every proposal is schema-validated and checked against hard rules (bounded size,
 *      declared regions intersect the patches, evidence present).
 *   2. Default policy is MANUAL: nothing changes until a human approves.
 *   3. Optional AUTO policy applies a proposal only if it passes validation AND meets the
 *      configured thresholds (confidence, risk, verified evidence, non-synthetic). Every
 *      auto-application is recorded as a version authored by "auto-policy" and is revertible.
 */
import type { ActorT, BBoxT, ChangeProposalT } from '../../contract';
import { ChangeProposal } from '../../contract';
import type { EventBus } from '../events';
import { bboxIntersects } from '../geo/mars';
import { parseCellId, tileBBox } from '../geo/tiling';
import type { VersionStore } from '../history/VersionStore';
import { patchBBox } from '../terrain/patches';

export interface ApprovalPolicy {
  mode: 'manual' | 'auto';
  autoMinConfidence: number;
  autoMaxRisk: 'low' | 'medium';
  autoRequireVerifiedEvidence: boolean;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[]; // block the proposal
  warnings: string[]; // shown to reviewer
}

/** Non-blocking issues a reviewer must see (keys are i18n ids under ai.warnings). */
export function proposalWarnings(p: ChangeProposalT): string[] {
  const w: string[] = [];
  if (!p.evidence.some((e) => e.verified)) w.push('no_verified_evidence');
  if (p.evidence.some((e) => e.kind === 'news')) w.push('news_evidence');
  if (p.synthetic || p.evidence.some((e) => e.synthetic)) w.push('synthetic');
  if (p.confidence < 0.5) w.push('low_confidence');
  return w;
}

const MAX_PATCHES = 64;
const MAX_ABS_DELTA_M = 2000;

export class ProposalService {
  private proposals = new Map<string, ChangeProposalT>();
  policy: ApprovalPolicy = { mode: 'manual', autoMinConfidence: 0.9, autoMaxRisk: 'low', autoRequireVerifiedEvidence: true };

  private history: VersionStore;
  private bus: EventBus;
  private resolveRegionBBox: (id: string) => BBoxT | null;
  private onApplied: () => void;

  constructor(history: VersionStore, bus: EventBus, resolveRegionBBox: (id: string) => BBoxT | null, onApplied: () => void) {
    this.history = history;
    this.bus = bus;
    this.resolveRegionBBox = resolveRegionBBox;
    this.onApplied = onApplied;
  }

  list(filter?: { status?: ChangeProposalT['status'] }) {
    const all = [...this.proposals.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return filter?.status ? all.filter((p) => p.status === filter.status) : all;
  }

  get(id: string) {
    return this.proposals.get(id) ?? null;
  }

  regionBBox(id: string): BBoxT | null {
    const cell = parseCellId(id);
    return cell ? tileBBox(cell) : this.resolveRegionBBox(id);
  }

  validate(input: unknown): ValidationResult & { proposal?: ChangeProposalT } {
    const parsed = ChangeProposal.safeParse(input);
    if (!parsed.success) {
      return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), warnings: [] };
    }
    const p = parsed.data;
    const errors: string[] = [], warnings: string[] = [];
    if (this.proposals.has(p.id)) errors.push(`Duplicate proposal id ${p.id}`);
    if (p.patches.length > MAX_PATCHES) errors.push(`Too many patches (${p.patches.length} > ${MAX_PATCHES})`);
    const regionBoxes = p.regionIds.map((id) => [id, this.regionBBox(id)] as const);
    for (const [id, b] of regionBoxes) if (!b) errors.push(`Unknown region or cell id: ${id}`);
    for (const patch of p.patches) {
      const pb = patchBBox(patch);
      if (!regionBoxes.some(([, b]) => b && bboxIntersects(b, pb))) errors.push(`Patch ${patch.id} lies outside all declared regions`);
      const maxDelta = patch.type === 'radial' ? Math.abs(patch.delta_m) : Math.max(...patch.offsets.map((o) => Math.abs(o.delta_m)));
      if (maxDelta > MAX_ABS_DELTA_M) errors.push(`Patch ${patch.id} delta ${maxDelta} m exceeds ${MAX_ABS_DELTA_M} m`);
      if (patch.type === 'node_offsets') {
        if (patch.offsets.some((o) => o.i >= patch.gridSize || o.j >= patch.gridSize)) errors.push(`Patch ${patch.id}: node index outside grid`);
      }
    }
    warnings.push(...proposalWarnings(p));
    return { ok: errors.length === 0, errors, warnings, proposal: p };
  }

  /** Submit a proposal. Returns validation; on success the proposal is stored as pending (or auto-applied). */
  submit(input: unknown): ValidationResult & { proposal?: ChangeProposalT } {
    const v = this.validate(input);
    if (!v.ok || !v.proposal) return v;
    const p: ChangeProposalT = { ...v.proposal, status: 'pending', review: null, appliedVersionId: null };
    this.proposals.set(p.id, p);
    this.bus.emit('proposals:changed', { proposalId: p.id });
    if (this.policy.mode === 'auto' && this.passesAutoPolicy(p, v.warnings)) {
      this.approve(p.id, { kind: 'system', id: 'auto-policy' }, 'Auto-applied by policy');
    }
    return { ...v, proposal: this.proposals.get(p.id) };
  }

  passesAutoPolicy(p: ChangeProposalT, warnings: string[]) {
    const pol = this.policy;
    const riskRank = { low: 0, medium: 1, high: 2 } as const;
    if (p.synthetic || warnings.includes('synthetic')) return false;
    if (p.confidence < pol.autoMinConfidence) return false;
    if (riskRank[p.risk] > riskRank[pol.autoMaxRisk]) return false;
    if (pol.autoRequireVerifiedEvidence && warnings.includes('no_verified_evidence')) return false;
    return true;
  }

  approve(id: string, reviewer: ActorT, comment: string | null = null) {
    const p = this.proposals.get(id);
    if (!p || p.status !== 'pending') return null;
    const version = this.history.commit({
      author: reviewer.kind === 'system' ? reviewer : { ...reviewer },
      message: { en: `Apply proposal ${p.id}`, es: `Aplicar propuesta ${p.id}` },
      ops: p.patches.map((patch) => ({ op: 'add_patch' as const, patch })),
      regionIds: p.regionIds,
      proposalId: p.id,
    });
    const updated: ChangeProposalT = {
      ...p,
      status: 'applied',
      review: { reviewer, at: new Date().toISOString(), decision: 'approved', comment },
      appliedVersionId: version.id,
    };
    this.proposals.set(id, updated);
    this.onApplied();
    this.bus.emit('proposals:changed', { proposalId: id });
    return updated;
  }

  reject(id: string, reviewer: ActorT, comment: string | null = null) {
    const p = this.proposals.get(id);
    if (!p || p.status !== 'pending') return null;
    const updated: ChangeProposalT = { ...p, status: 'rejected', review: { reviewer, at: new Date().toISOString(), decision: 'rejected', comment } };
    this.proposals.set(id, updated);
    this.bus.emit('proposals:changed', { proposalId: id });
    return updated;
  }

  /** Undo an applied proposal with a new version that removes its patches. */
  revert(id: string, actor: ActorT) {
    const p = this.proposals.get(id);
    if (!p || p.status !== 'applied') return null;
    const head = this.history.stateAt(this.history.head);
    const ops = p.patches.filter((x) => head.has(x.id)).map((x) => ({ op: 'remove_patch' as const, patchId: x.id }));
    if (ops.length) {
      this.history.commit({
        author: actor,
        message: { en: `Revert proposal ${p.id}`, es: `Revertir propuesta ${p.id}` },
        ops,
        regionIds: p.regionIds,
        proposalId: p.id,
      });
    }
    const updated: ChangeProposalT = { ...p, status: 'reverted' };
    this.proposals.set(id, updated);
    this.onApplied();
    this.bus.emit('proposals:changed', { proposalId: id });
    return updated;
  }

  toJSON() {
    return [...this.proposals.values()];
  }

  load(list: ChangeProposalT[]) {
    this.proposals = new Map(list.map((p) => [p.id, p]));
    this.bus.emit('proposals:changed', { proposalId: null });
  }
}
