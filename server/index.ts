/**
 * MARS OS backend (Node, no framework).
 *
 *   GET  /api/health                     → { ok, version }
 *   GET  /api/elevation/mola128?lat0&lon0 → 256×256 int16 LE crop (MOLA 128 ppd, cached)
 *   GET  /api/ai/status                  → { configured, model | null, error | null }
 *   POST /api/ai/analyze { cellId, clientEdits? } → AIAnalyzeResponse (Gemini, validated)
 *
 * Secrets: GEMINI_API_KEY is read from the environment or `.env.local` (git-ignored).
 * It is never sent to the browser or logged.
 *
 * Run: npm run server   (dev: started automatically by `npm run dev`)
 *      npm start        (serves the production build from dist/ as well)
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MarsCatalog, type AIAnalyzeResponse } from '../src/contract';
import { ElevationService } from '../src/core/elevation/ElevationService';
import { loadWaypoints, type Waypoint } from '../src/core/live/m20';
import { buildEvidencePack, draftsToProposals } from './evidence';
import { analyzeWithFailover, chooseModel, GeminiError } from './gemini';
import { getMola128Crop } from './mola128';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = join(ROOT, f);
  if (existsSync(p)) {
    try {
      process.loadEnvFile(p);
    } catch { /* ignore malformed env file */ }
  }
}
const PORT = Number(process.env.MARS_OS_API_PORT ?? 8787);
const SERVE_DIST = process.argv.includes('--serve-dist');
const CACHE = join(ROOT, 'server', '.cache', 'mola128');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');
const CATALOGS = ['data/catalog/jezero.catalog.json'];
const apiKey = () => process.env.GEMINI_API_KEY?.trim() || '';

// ── scientific context loaded once (same core code as the browser) ──
const catalog = MarsCatalog.parse(JSON.parse(await readFile(join(PUBLIC, CATALOGS[0]), 'utf8')));
const elevation = new ElevationService();
elevation.setLoader(async (url) => {
  if (url.startsWith('/api/elevation/mola128')) {
    const q = new URL(url, 'http://x').searchParams;
    const b = await getMola128Crop(CACHE, Number(q.get('lat0')), Number(q.get('lon0')));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  const b = await readFile(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
});
await elevation.loadFromLayers(catalog.layers, '');
let waypoints: Waypoint[] = [];
const wpLayer = catalog.layers.find((l) => l.id === 'layer.m20.waypoints');
if (wpLayer?.access.protocol === 'geojson') {
  loadWaypoints(wpLayer.access.url).then((w) => (waypoints = w)).catch((e) => console.warn('[mars-os] waypoints unavailable:', e.message));
}

// ── helpers ──
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage, limit = 64_000): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
let lastAnalyze = 0;

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.gz': 'application/gzip', '.i16': 'application/octet-stream' };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version: '0.2.0' });

    if (url.pathname === '/api/elevation/mola128' && req.method === 'GET') {
      const buf = await getMola128Crop(CACHE, Number(url.searchParams.get('lat0')), Number(url.searchParams.get('lon0')));
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'x-source': 'MGS MOLA MEGDR 128ppd (PDS Geosciences)' });
      return res.end(buf);
    }

    if (url.pathname === '/api/ai/status') {
      if (!apiKey()) return json(res, 200, { configured: false, model: null, error: 'GEMINI_API_KEY is not set on the server' });
      try {
        const model = await chooseModel(apiKey(), process.env.GEMINI_MODEL);
        return json(res, 200, { configured: true, model, error: null });
      } catch (e) {
        return json(res, 200, { configured: true, model: null, error: (e as Error).message });
      }
    }

    if (url.pathname === '/api/ai/analyze' && req.method === 'POST') {
      if (!apiKey()) return json(res, 503, { ok: false, error: 'GEMINI_API_KEY is not set on the server' });
      if (Date.now() - lastAnalyze < 5000) return json(res, 429, { ok: false, error: 'Please wait a few seconds between analyses' });
      lastAnalyze = Date.now();
      const body = (await readBody(req)) as { cellId?: unknown; clientEdits?: unknown };
      if (typeof body.cellId !== 'string') return json(res, 400, { ok: false, error: 'cellId required' });
      const edits = Array.isArray(body.clientEdits) ? body.clientEdits.filter((x): x is string => typeof x === 'string') : [];
      const pack = await buildEvidencePack(body.cellId, catalog, elevation, waypoints, edits);
      if (pack.products.length === 0) return json(res, 422, { ok: false, error: 'No elevation data available for this cell' });
      const { analysis, model, attempts } = await analyzeWithFailover(apiKey(), process.env.GEMINI_MODEL, pack);
      const { proposals, rejected } = draftsToProposals(pack, analysis, model, catalog);
      const out: AIAnalyzeResponse = {
        ok: true, model, attempts, analyzedAt: new Date().toISOString(), cellId: body.cellId, analysis, proposals, rejected,
        pack: {
          products: pack.products.map(({ ref, layerId, name, metersPerPixel }) => ({ ref, layerId, name, metersPerPixel })),
          nodeCount: pack.nodes.length,
          waypointCount: pack.roverWaypoints.length,
          discrepancies: pack.discrepancies.map(({ pair, count, meanDiff_m, rms_m, maxAbs_m }) => ({ pair, count, meanDiff_m, rms_m, maxAbs_m })),
        },
      };
      return json(res, 200, out);
    }

    if (url.pathname.startsWith('/api/')) return json(res, 404, { ok: false, error: 'Not found' });

    if (SERVE_DIST) {
      let p = normalize(join(DIST, decodeURIComponent(url.pathname)));
      if (!p.startsWith(DIST)) return json(res, 403, { error: 'forbidden' });
      if (!existsSync(p) || url.pathname === '/') p = join(DIST, 'index.html');
      const data = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
      return res.end(data);
    }
    return json(res, 404, { ok: false, error: 'Not found' });
  } catch (e) {
    const status = e instanceof GeminiError ? e.status : 500;
    console.warn('[mars-os]', url.pathname, (e as Error).message);
    return json(res, status, { ok: false, error: (e as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`[mars-os] backend on http://localhost:${PORT}  (Gemini: ${apiKey() ? 'key configured' : 'NOT configured'})${SERVE_DIST ? ' — serving dist/' : ''}`);
});
