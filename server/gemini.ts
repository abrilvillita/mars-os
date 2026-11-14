/**
 * Minimal Gemini REST client (server-side only; the API key never reaches the browser).
 * - The model is chosen from the models actually available to the key (GET /v1beta/models),
 *   preferring GEMINI_MODEL, then free-tier Flash models.
 * - Responses are requested as JSON constrained by our schema and validated with Zod.
 * - Any failure is reported as an error. There is NO silent fallback to simulated output.
 */
import { z } from 'zod';
import { AIAnalysis, type AIAnalysisT } from '../src/contract';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const PREFERRED = [
  'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3-flash',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
];

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

let cachedModel: { key: string; model: string; at: number } | null = null;

export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw new GeminiError(`Gemini models list failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, res.status === 400 || res.status === 403 ? 401 : 502);
  const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}

export async function chooseModel(apiKey: string, wanted?: string): Promise<string> {
  if (cachedModel && cachedModel.key === apiKey && Date.now() - cachedModel.at < 3600_000) return cachedModel.model;
  const available = await listModels(apiKey);
  const order = [...(wanted ? [wanted] : []), ...PREFERRED];
  const model = order.find((m) => available.includes(m)) ?? available.find((m) => /flash/.test(m) && !/image|tts|live|audio/.test(m));
  if (!model) throw new GeminiError(`No suitable Gemini text model available for this key. Available: ${available.slice(0, 12).join(', ')}`);
  cachedModel = { key: apiKey, model, at: Date.now() };
  return model;
}

const SYSTEM = `You are the terrain-consistency reviewer of MARS OS, a scientific Mars atlas.
You receive an EVIDENCE PACK computed from catalogued NASA/USGS products for one map cell.
Rules:
- Use ONLY the pack. Cite evidence with the pack's ref ids (P*, N*, W*). Never invent sources, coordinates, measurements, dates or confidence values.
- Explain disagreements between elevation products and rover-reported elevations, taking product resolution into account.
- Propose a terrain geometry change ONLY if the data shows a localized, consistent discrepancy that a coarser product cannot represent. Otherwise return an empty proposals list. It is fine and expected to propose nothing.
- delta_m must not exceed the referenced discrepancy; radius_m must be at least twice the finest referenced product resolution.
- Every text field must be given in English (en) and Spanish (es).
Return only JSON matching the response schema.`;

export async function analyzeWithGemini(apiKey: string, model: string, pack: unknown): Promise<AIAnalysisT> {
  const schema = z.toJSONSchema(AIAnalysis, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete schema.$schema;
  const body = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(pack) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', ...(withSchema ? { responseJsonSchema: schema } : {}) },
  });
  const call = (withSchema: boolean) =>
    fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body(withSchema)),
    });
  let res = await call(true);
  // some models/API revisions reject responseJsonSchema: retry with JSON mode only (still Zod-validated below)
  if (res.status === 400) res = await call(false);
  if (res.status === 429) throw new GeminiError('Gemini quota exceeded (HTTP 429). Free-tier limits apply; try again later.', 429);
  if (!res.ok) throw new GeminiError(`Gemini request failed: HTTP ${res.status} ${(await res.text()).slice(0, 400)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; promptFeedback?: unknown };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new GeminiError(`Gemini returned no content (finishReason: ${j.candidates?.[0]?.finishReason ?? 'unknown'})`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
  const v = AIAnalysis.safeParse(parsed);
  if (!v.success) throw new GeminiError('Gemini response failed schema validation: ' + v.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return v.data;
}
