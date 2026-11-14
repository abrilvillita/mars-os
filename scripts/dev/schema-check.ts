// Diagnostic: does the API accept our AIAnalysis JSON schema? Prints the API error if not.
import { z } from 'zod';
import { AIAnalysis } from '../../src/contract';
process.loadEnvFile('.env.local');
import { geminiSchema } from '../../server/gemini';
const schema = geminiSchema(z.toJSONSchema(AIAnalysis, { target: 'draft-2020-12' }));
console.log(JSON.stringify(schema).slice(0, 600));
for (const model of ['gemini-3.6-flash', 'gemini-3.5-flash-lite']) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Return an empty analysis: summary in en/es saying "no data", no findings, no proposals.' }] }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema } }),
    signal: AbortSignal.timeout(60000),
  });
  const txt = await res.text();
  console.log(model, res.status, txt.replace(/\s+/g, ' ').replace(/"thoughtSignature": "[^"]*"/g, '').slice(0, 700));
}
