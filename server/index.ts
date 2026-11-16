/**
 * MARS OS backend (Node, no framework).
 *
 *   GET  /api/health                     → { ok, version }
 *   GET  /api/elevation/mola128?lat0&lon0 → 256×256 int16 LE crop (MOLA 128 ppd, cached)
 *   GET  /api/ai/status                  → { configured, model | null, error | null }
 *   POST /api/ai/analyze { cellId, clientEdits? } → AIAnalyzeResponse (Gemini, validated)
 *   POST /api/ai/mission { question, kind, site, assumptions, facts } → mission verdict (Gemini, validated)
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
import { reviewMission } from './mission';
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
// MARS_OS_API_PORT locally; PORT on hosts like Render
const PORT = Number(process.env.MARS_OS_API_PORT ?? process.env.PORT ?? 8787);
/** Browser origins allowed to call this API from another domain (comma-separated). */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'https://abrilvilla.dev,https://abrilvillita.github.io,http://localhost:5173')
  .split(',').map((s) => s.trim()).filter(Boolean);
// Public-internet protection of the Gemini quota (free tier): per-IP and global caps.
const AI_PER_IP_PER_HOUR = Number(process.env.AI_PER_IP_PER_HOUR ?? 8);
const AI_GLOBAL_PER_DAY = Number(process.env.AI_GLOBAL_PER_DAY ?? 150);
const ELEV_PER_IP_PER_MIN = 120;
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
function cors(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'Origin');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-max-age', '86400');
  }
}
const hits = new Map<string, number[]>();
let aiToday = { day: new Date().toISOString().slice(0, 10), count: 0 };
/** Sliding-window rate limit; returns true if allowed. */
function allow(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    hits.set(key, arr);
    return false;
  }
  arr.push(now);
  hits.set(key, arr);
  return true;
}
const clientIp = (req: IncomingMessage) => String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

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
  cors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const ip = clientIp(req);
  try {
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, version: '0.2.0' });

    if (url.pathname === '/api/elevation/mola128' && req.method === 'GET') {
      if (!allow('elev:' + ip, ELEV_PER_IP_PER_MIN, 60_000)) return json(res, 429, { ok: false, error: 'Too many elevation requests, slow down' });
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
      if (Date.now() - lastAnalyze < 3000) return json(res, 429, { ok: false, error: 'Another analysis just started — try again in a few seconds' });
      const today = new Date().toISOString().slice(0, 10);
      if (aiToday.day !== today) aiToday = { day: today, count: 0 };
      if (aiToday.count >= AI_GLOBAL_PER_DAY) return json(res, 429, { ok: false, error: 'Daily AI analysis limit of this public demo reached (protects the free Gemini quota). Try again tomorrow.' });
      if (!allow('ai:' + ip, AI_PER_IP_PER_HOUR, 3600_000)) return json(res, 429, { ok: false, error: `Limit of ${AI_PER_IP_PER_HOUR} AI analyses per hour per visitor reached. Try again later.` });
      lastAnalyze = Date.now();
      aiToday.count++;
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

    if (url.pathname === '/api/ai/mission' && req.method === 'POST') {
      if (!apiKey()) return json(res, 503, { ok: false, error: 'GEMINI_API_KEY is not set on the server' });
      const today = new Date().toISOString().slice(0, 10);
      if (aiToday.day !== today) aiToday = { day: today, count: 0 };
      if (aiToday.count >= AI_GLOBAL_PER_DAY) return json(res, 429, { ok: false, error: 'Daily AI limit of this public demo reached (protects the free Gemini quota). Try again tomorrow.' });
      if (!allow('ai:' + ip, AI_PER_IP_PER_HOUR, 3600_000)) return json(res, 429, { ok: false, error: `Limit of ${AI_PER_IP_PER_HOUR} AI requests per hour per visitor reached.` });
      aiToday.count++;
      const out = await reviewMission(apiKey(), process.env.GEMINI_MODEL, await readBody(req, 16_000));
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
