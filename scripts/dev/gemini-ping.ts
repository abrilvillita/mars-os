// Diagnostic: minimal Gemini calls (plain, JSON mode, JSON schema) with timing and timeout.
process.loadEnvFile('.env.local');
const key = process.env.GEMINI_API_KEY!;
const model = process.argv[2] ?? 'gemini-3.8-flash';
async function call(label: string, generationConfig: object) {
  const t0 = performance.now();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with {"ok":true}' }] }], generationConfig }),
      signal: AbortSignal.timeout(60000),
    });
    const txt = await res.text();
    console.log(label, res.status, Math.round(performance.now() - t0), 'ms', txt.replace(/\s+/g, ' ').slice(0, 260));
  } catch (e) {
    console.log(label, 'FAILED', Math.round(performance.now() - t0), 'ms', (e as Error).message);
  }
}
await call('plain', {});
await call('json', { responseMimeType: 'application/json' });
await call('schema', { responseMimeType: 'application/json', responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] } });
