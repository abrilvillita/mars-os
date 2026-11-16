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

let cachedModels: { key: string; models: string[]; at: number } | null = null;
const CALL_TIMEOUT_MS = 22_000;

export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  if (!res.ok) throw new GeminiError(`Gemini models list failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`, res.status === 400 || res.status === 403 ? 401 : 502);
  const j = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  return (j.models ?? []).filter((m) => m.supportedGenerationMethods?.includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}

/** Available text models for this key, in preference order (first = primary, rest = failover). */
export async function candidateModels(apiKey: string, wanted?: string): Promise<string[]> {
  if (cachedModels && cachedModels.key === apiKey && Date.now() - cachedModels.at < 3600_000) return cachedModels.models;
  const available = await listModels(apiKey);
  const order = [...new Set([...(wanted ? [wanted] : []), ...PREFERRED])].filter((m) => available.includes(m));
  if (!order.length) {
    const any = available.find((m) => /flash/.test(m) && !/image|tts|live|audio/.test(m));
    if (any) order.push(any);
  }
  if (!order.length) throw new GeminiError(`No suitable Gemini text model available for this key. Available: ${available.slice(0, 12).join(', ')}`);
  cachedModels = { key: apiKey, models: order, at: Date.now() };
  return order;
}

export async function chooseModel(apiKey: string, wanted?: string): Promise<string> {
  return (await candidateModels(apiKey, wanted))[0];
}

/** Errors worth retrying on ANOTHER real Gemini model (overload / timeout), never on a simulation. */
const isTransient = (e: unknown) => e instanceof GeminiError && (e.status === 503 || e.status === 504 || e.status === 429);

/**
 * Tries the primary model, then the next available real Gemini models if one is overloaded or
 * times out. Returns which model actually answered and every attempt made (shown to the user).
 */
export async function analyzeWithFailover(apiKey: string, wanted: string | undefined, pack: unknown) {
  const models = (await candidateModels(apiKey, wanted)).slice(0, 4);
  const attempts: { model: string; error: string }[] = [];
  for (const model of models) {
    try {
      const analysis = await analyzeWithGemini(apiKey, model, pack);
      return { analysis, model, attempts };
    } catch (e) {
      attempts.push({ model, error: (e as Error).message });
      if (!isTransient(e)) throw e;
    }
  }
  throw new GeminiError(`All Gemini models are unavailable right now: ${attempts.map((a) => `${a.model}: ${a.error}`).join(' | ')}`, 503);
}

/**
 * The Gemini API accepts only a subset of JSON Schema. Keep structure (type, properties, required,
 * items, enum, description) and drop length/count/strictness keywords — Zod re-enforces all of
 * them on the response, so nothing is loosened in what MARS OS accepts.
 */
const KEEP = new Set(['type', 'properties', 'required', 'items', 'enum', 'description', 'anyOf']);
export function geminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(geminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!KEEP.has(k)) continue;
    if (k === 'properties') out[k] = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([p, s]) => [p, geminiSchema(s)]));
    else out[k] = geminiSchema(v);
  }
  return out;
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
  const schema = geminiSchema(z.toJSONSchema(AIAnalysis, { target: 'draft-2020-12' }));
  const body = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(pack) }] }],
    generationConfig: { temperature: 0.1, responseMimeType: 'application/json', ...(withSchema ? { responseJsonSchema: schema } : {}) },
  });
  const call = async (withSchema: boolean) => {
    try {
      return await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body(withSchema)),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
    } catch (e) {
      throw new GeminiError(`${model} did not answer within ${CALL_TIMEOUT_MS / 1000} s (${(e as Error).name})`, 504);
    }
  };
  let res = await call(true);
  // some models/API revisions reject responseJsonSchema: retry with JSON mode only (still Zod-validated below)
  if (res.status === 400) res = await call(false);
  if (res.status === 429) throw new GeminiError(`${model}: quota exceeded (HTTP 429). Free-tier limits apply; try again later.`, 429);
  if (res.status === 503) throw new GeminiError(`${model}: overloaded (HTTP 503)`, 503);
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
