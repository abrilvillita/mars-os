/**
 * Mission Lab review (server-side Gemini). Input: the mission question, what is sent (crew,
 * rover, base), the site and the FACTS MARS OS computed from catalogued data. Output: a verdict
 * on whether this site and plan can answer the question, with risks and suggestions — validated
 * with Zod. Gemini may only use the facts given; no silent fallback.
 */
import { z } from 'zod';
import { GeminiError, candidateModels, geminiSchema } from './gemini';

const API = 'https://generativelanguage.googleapis.com/v1beta';
const Bi = z.object({ en: z.string().min(1).max(600), es: z.string().min(1).max(600) });
export const MissionVerdict = z.object({
  verdict: z.enum(['yes', 'partly', 'no']),
  summary: Bi,
  risks: z.array(Bi).max(6),
  suggestions: z.array(Bi).max(5),
});

const MissionInput = z.object({
  question: z.string().min(1).max(400),
  kind: z.enum(['crew', 'rover', 'base']),
  site: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), label: z.string().max(120) }),
  assumptions: z.record(z.string(), z.union([z.number(), z.string()])),
  facts: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
});

const SYSTEM = `You are the mission reviewer of MARS OS, a scientific Mars atlas.
You receive a mission QUESTION, what is being sent (crew on EVA, rover, or base camp), a site, the user's ASSUMPTIONS and FACTS computed by MARS OS from NASA data (elevation, pressure, slope, dune fields, water-ice evidence, minerals, sunlight, Earth light time, solar conjunction, oxygen, radiation, EVA range).
Rules:
- Use ONLY the facts and assumptions given. Never invent measurements, places, instruments or sources. If a fact needed to answer is missing, say so.
- verdict: "yes" if the site and plan can plausibly address the question with the facts given, "partly" if only some of it, "no" if the facts work against it.
- risks: the most important risks for THIS site and plan, each grounded in a given fact (quote the value).
- suggestions: concrete changes (another kind of explorer, shorter EVA, different season, move toward ice, etc.).
- This is a planning aid, not a safety certification: never claim a site is safe or habitable.
- Every text in English (en) and Spanish (es). Return only JSON matching the schema.`;

const transient = (e: unknown) => e instanceof GeminiError && [429, 500, 502, 503, 504].includes(e.status);

async function callModel(apiKey: string, model: string, payload: unknown) {
  const schema = geminiSchema(z.toJSONSchema(MissionVerdict, { target: 'draft-2020-12' }));
  const body = (withSchema: boolean) => ({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(payload) }] }],
    generationConfig: { temperature: 0.2, responseMimeType: 'application/json', ...(withSchema ? { responseJsonSchema: schema } : {}) },
  });
  const call = async (withSchema: boolean) => {
    try {
      return await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body(withSchema)), signal: AbortSignal.timeout(22_000),
      });
    } catch (e) {
      throw new GeminiError(`${model} did not answer within 22 s (${(e as Error).name})`, 504);
    }
  };
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  if (res.status === 429) throw new GeminiError(`${model}: quota exceeded (HTTP 429)`, 429);
  if (res.status === 503) throw new GeminiError(`${model}: overloaded (HTTP 503)`, 503);
  if (!res.ok) throw new GeminiError(`Gemini request failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  } catch {
    throw new GeminiError('Gemini returned invalid JSON');
  }
  const v = MissionVerdict.safeParse(parsed);
  if (!v.success) throw new GeminiError('Gemini response failed schema validation: ' + v.error.issues.slice(0, 4).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return v.data;
}

export async function reviewMission(apiKey: string, wanted: string | undefined, raw: unknown) {
  const input = MissionInput.safeParse(raw);
  if (!input.success) throw new GeminiError('Invalid mission request: ' + input.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  const models = (await candidateModels(apiKey, wanted)).slice(0, 4);
  const attempts: string[] = [];
  for (const model of models) {
    try {
      const out = await callModel(apiKey, model, input.data);
      return { ...out, model, at: new Date().toISOString() };
    } catch (e) {
      attempts.push(`${model}: ${(e as Error).message}`);
      if (!transient(e)) throw e;
    }
  }
  throw new GeminiError(`All Gemini models are unavailable right now: ${attempts.join(' | ')}`, 503);
}
