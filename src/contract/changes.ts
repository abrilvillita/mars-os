/**
 * MARS OS DATA CONTRACT — terrain changes, AI proposals and version history.
 *
 * Kept in a SEPARATE document (TerrainChangeLog) from the scientific catalog so original
 * NASA data is never overwritten. The rendered terrain is:
 *
 *     height(lat, lon) = sourceElevation(lat, lon) + Σ applied GeometryPatch deltas
 *
 * Every patch is localized (bounded bbox) so only intersecting tiles are rebuilt.
 */
import { z } from 'zod';
import { BBox, Id, IsoDate, LatLon, LocalizedText, SCHEMA_VERSION } from './primitives';

export const Falloff = z.enum(['gaussian', 'cosine', 'linear', 'flat']);

/** Smooth circular raise/lower around a point. */
export const RadialPatch = z.object({
  type: z.literal('radial'),
  id: Id,
  center: LatLon,
  radius_m: z.number().positive().max(200_000),
  delta_m: z.number().min(-5000).max(5000).describe('Height change at the center, meters'),
  falloff: Falloff,
});

/**
 * Explicit offsets on the node grid of one quadtree cell. Node (i, j) of cell
 * `mars:eq:z{z}:x{x}:y{y}` with grid size N sits at
 *   lon = west + (i / (N-1)) * width,  lat = north - (j / (N-1)) * height
 * Offsets are bilinearly interpolated inside the cell and zero outside it.
 */
export const NodeOffsetsPatch = z.object({
  type: z.literal('node_offsets'),
  id: Id,
  cellId: z.string().regex(/^mars:eq:z\d+:x\d+:y\d+$/),
  gridSize: z.number().int().min(2).max(129),
  offsets: z
    .array(z.object({ i: z.number().int().min(0), j: z.number().int().min(0), delta_m: z.number().min(-5000).max(5000) }))
    .min(1),
});

export const GeometryPatch = z.discriminatedUnion('type', [RadialPatch, NodeOffsetsPatch]);

export const ActorKind = z.enum(['ai', 'human', 'ingest', 'system']);
export const Actor = z.object({
  kind: ActorKind,
  id: z.string().describe('User id, engine name or script name'),
  model: z.string().nullable().optional().describe('AI model id when kind = ai'),
  version: z.string().nullable().optional(),
});

export const Evidence = z.object({
  kind: z.enum(['dataset', 'image', 'publication', 'report', 'news', 'rover_observation', 'user_note']),
  sourceId: Id.nullable().describe('Catalog source id when the evidence is a catalogued product'),
  url: z.string().url().nullable(),
  description: LocalizedText,
  retrievedAt: IsoDate.nullable(),
  verified: z.boolean().describe('True only if cross-checked against an authoritative product'),
  synthetic: z.boolean().default(false),
});

export const ProposalStatus = z.enum(['pending', 'approved', 'rejected', 'applied', 'reverted', 'superseded']);

export const ChangeProposal = z.object({
  id: Id,
  createdAt: IsoDate,
  origin: Actor,
  regionIds: z.array(z.string()).min(1).describe('Named region ids and/or quadtree cell ids affected'),
  patches: z.array(GeometryPatch).min(1),
  evidence: z.array(Evidence).min(1),
  confidence: z.number().min(0).max(1),
  confidenceBasis: LocalizedText.nullable().optional().describe('How confidence was computed (e.g. rule-based from data agreement — never self-reported by an AI)'),
  risk: z.enum(['low', 'medium', 'high']).describe('Impact on mission safety if the change is wrong'),
  rationale: LocalizedText,
  status: ProposalStatus,
  review: z
    .object({
      reviewer: Actor,
      at: IsoDate,
      decision: z.enum(['approved', 'rejected']),
      comment: z.string().nullable(),
    })
    .nullable(),
  appliedVersionId: Id.nullable(),
  synthetic: z.boolean().default(false).describe('True for demo/simulated proposals'),
});

export const VersionOp = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_patch'), patch: GeometryPatch }),
  z.object({ op: z.literal('remove_patch'), patchId: Id }),
]);

/** Immutable commit. Restoring an old state creates a NEW version (history is never rewritten). */
export const Version = z.object({
  id: Id,
  parentId: Id.nullable(),
  createdAt: IsoDate,
  author: Actor,
  message: LocalizedText,
  proposalId: Id.nullable(),
  regionIds: z.array(z.string()),
  bbox: BBox.nullable().describe('Union of affected areas, used to rebuild only intersecting tiles'),
  ops: z.array(VersionOp),
  restoredFrom: Id.nullable().describe('Set when this version restores the state of an older one'),
});

export const TerrainChangeLog = z.object({
  $schema: z.string().optional(),
  schemaVersion: z.literal(SCHEMA_VERSION),
  catalogId: Id.describe('Catalog the changes apply to'),
  headVersionId: Id.nullable(),
  proposals: z.array(ChangeProposal),
  versions: z.array(Version),
});

export type FalloffT = z.infer<typeof Falloff>;
export type RadialPatchT = z.infer<typeof RadialPatch>;
export type NodeOffsetsPatchT = z.infer<typeof NodeOffsetsPatch>;
export type GeometryPatchT = z.infer<typeof GeometryPatch>;
export type ActorT = z.infer<typeof Actor>;
export type EvidenceT = z.infer<typeof Evidence>;
export type ProposalStatusT = z.infer<typeof ProposalStatus>;
export type ChangeProposalT = z.infer<typeof ChangeProposal>;
export type VersionOpT = z.infer<typeof VersionOp>;
export type VersionT = z.infer<typeof Version>;
export type TerrainChangeLogT = z.infer<typeof TerrainChangeLog>;
