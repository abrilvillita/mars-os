/**
 * MARS OS DATA CONTRACT — AI analysis exchange.
 *
 * The backend builds an EVIDENCE PACK from catalogued data (never from the model), sends it to
 * the AI, and accepts back only an `AIAnalysis` that references evidence by its `ref` ids.
 * The backend then re-checks every claim against the pack and builds the ChangeProposals itself:
 * sources, coordinates checks, measurements and confidence are NEVER taken from the model.
 */
import { z } from 'zod';
import { Falloff } from './changes';

/** en + es required for AI text (the two published UI languages). */
export const BilingualText = z.object({ en: z.string().min(1).max(1200), es: z.string().min(1).max(1200) });

export const AIFinding = z.object({
  title: BilingualText,
  detail: BilingualText,
  evidenceRefs: z.array(z.string().max(40)).min(1).max(20),
});

export const AIProposalDraft = z.object({
  center: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
  radius_m: z.number().positive().max(200_000),
  delta_m: z.number().min(-2000).max(2000),
  falloff: Falloff,
  risk: z.enum(['low', 'medium', 'high']),
  rationale: BilingualText,
  evidenceRefs: z.array(z.string().max(40)).min(1).max(20),
});

export const AIAnalysis = z.object({
  summary: BilingualText,
  findings: z.array(AIFinding).max(10),
  proposals: z.array(AIProposalDraft).max(5),
});

export type AIAnalysisT = z.infer<typeof AIAnalysis>;
export type AIProposalDraftT = z.infer<typeof AIProposalDraft>;

/** What the backend returns to the client. */
export interface AIAnalyzeResponse {
  ok: true;
  model: string;
  analyzedAt: string;
  cellId: string;
  pack: EvidencePackSummary;
  analysis: AIAnalysisT;
  proposals: unknown[]; // ChangeProposal objects (validated server-side, re-validated client-side)
  rejected: { index: number; reasons: string[] }[];
}

export interface EvidencePackSummary {
  products: { ref: string; layerId: string; name: string; metersPerPixel: number }[];
  nodeCount: number;
  waypointCount: number;
  discrepancies: { pair: string; count: number; meanDiff_m: number; rms_m: number; maxAbs_m: number }[];
}
