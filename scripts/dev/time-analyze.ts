// Diagnostic: time each phase of /api/ai/analyze without the HTTP layer.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MarsCatalog } from '../../src/contract';
import { ElevationService } from '../../src/core/elevation/ElevationService';
import { buildEvidencePack } from '../../server/evidence';
import { getMola128Crop } from '../../server/mola128';
import { analyzeWithFailover } from '../../server/gemini';
process.loadEnvFile('.env.local');
const t = () => performance.now();
const catalog = MarsCatalog.parse(JSON.parse(await readFile('public/data/catalog/jezero.catalog.json', 'utf8')));
const es = new ElevationService();
es.setLoader(async (url) => {
  if (url.startsWith('/api/elevation/mola128')) {
    const q = new URL(url, 'http://x').searchParams;
    const b = await getMola128Crop('server/.cache/mola128', Number(q.get('lat0')), Number(q.get('lon0')));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const b = await readFile(join('public', url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
});
await es.loadFromLayers(catalog.layers, '');
let t0 = t();
const pack = await buildEvidencePack(process.argv[2] ?? 'mars:eq:z12:x5858:y1628', catalog, es, [], []);
console.log('pack ms', Math.round(t() - t0), 'products', pack.products.map((p) => p.ref + ':' + p.layerId), 'bytes', JSON.stringify(pack).length);
if (process.argv.includes('--gemini')) {
  t0 = t();
  const { analysis: a, model, attempts } = await analyzeWithFailover(process.env.GEMINI_API_KEY!, undefined, pack);
  console.log('gemini ms', Math.round(t() - t0), 'model', model, 'attempts', JSON.stringify(attempts), 'findings', a.findings.length, 'drafts', a.proposals.length);
}
