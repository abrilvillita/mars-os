/**
 * Route risk analysis, "why this route" explanation and a downloadable route sheet.
 * Every warning comes from a named dataset; missing data is listed as missing, not guessed.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import { formatLat, formatLon } from '../core/geo/mars';
import { DUNE_SERVICE, duneAt, duneData, ensureDunes } from '../core/live/dunes';
import { knowledgeFor, type TrackIndex } from '../core/routes/knowledge';
import type { Route, RouteResult } from '../core/routes/RoutePlanner';
import { useRoutes } from '../state/routeStore';
import { ProvBadge, fmtM } from './common';

type Level = 'ok' | 'warn' | 'high';
interface Risk { key: string; level: Level; text: string }

function useDunes() {
  const [, setRev] = useState(0);
  useEffect(() => {
    ensureDunes().then(() => setRev((r) => r + 1));
  }, []);
  return duneData;
}

function hiriseShare(r: Route) {
  const l = getMarsOS().catalog.layer('layer.jezero.hirise');
  if (!l) return 0;
  const b = l.coverage.bbox;
  const inside = r.points.filter((p) => p.lat >= b.south && p.lat <= b.north && p.lon >= b.west && p.lon <= b.east).length;
  return r.points.length ? inside / r.points.length : 0;
}

export function routeRisks(r: Route, idx: TrackIndex | null, t: (k: string, o?: Record<string, unknown>) => string, caution: number): Risk[] {
  const out: Risk[] = [];
  // sand: mapped dune fields along the route (sampled)
  if (duneData.fields) {
    let inside: string | null = null, nearest = Infinity;
    const step = Math.max(1, Math.floor(r.points.length / 40));
    for (let i = 0; i < r.points.length; i += step) {
      const d = duneAt(r.points[i].lat, r.points[i].lon);
      if (d.inside) inside = d.inside.id;
      nearest = Math.min(nearest, d.nearestM);
    }
    if (inside) out.push({ key: 'sand', level: 'high', text: t('risk.sandInside', { id: inside }) });
    else if (nearest < 5000) out.push({ key: 'sand', level: 'warn', text: t('risk.sandNear', { d: fmtM(nearest) }) });
    else out.push({ key: 'sand', level: 'ok', text: t('risk.sandNone', { d: nearest === Infinity ? '—' : fmtM(nearest) }) });
  }
  const s = r.stats;
  out.push(s.cautionShare > 0.1 || s.maxSlopeDeg > caution ? { key: 'slope', level: s.cautionShare > 0.25 ? 'high' : 'warn', text: t('risk.slope', { max: s.maxSlopeDeg.toFixed(1), share: Math.round(s.cautionShare * 100), c: caution }) } : { key: 'slope', level: 'ok', text: t('risk.slopeOk', { max: s.maxSlopeDeg.toFixed(1) }) });
  out.push(s.dataLimitedShare > 0 ? { key: 'res', level: s.dataLimitedShare > 0.3 ? 'high' : 'warn', text: t('risk.res', { share: Math.round(s.dataLimitedShare * 100), coarse: fmtM(s.coarsestDataM) }) } : { key: 'res', level: 'ok', text: t('risk.resOk') });
  const hs = hiriseShare(r);
  out.push(hs > 0.9 ? { key: 'rocks', level: 'ok', text: t('risk.rocksHirise') } : { key: 'rocks', level: 'warn', text: t('risk.rocks', { share: Math.round(hs * 100) }) });
  if (idx) {
    const k = knowledgeFor(r, idx);
    const un = 1 - k.ground;
    out.push(un > 0.5 ? { key: 'known', level: 'warn', text: t('risk.unknown', { share: Math.round(un * 100) }) } : { key: 'known', level: 'ok', text: t('risk.known', { share: Math.round(k.ground * 100) }) });
  }
  return out;
}

export function RouteRiskCard({ result, idx }: { result: RouteResult; idx: TrackIndex | null }) {
  const { t } = useTranslation();
  const dunes = useDunes();
  const caution = useRoutes((s) => s.assumptions.cautionSlopeDeg);
  const routes = result.routes;
  const risks = useMemo(() => routes.map((r) => ({ r, list: routeRisks(r, idx, t as never, caution) })), [routes, idx, t, caution, dunes.fields]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="card risk">
      <div className="card-title">{t('risk.title')} <ProvBadge kind="derived" /></div>
      {risks.map(({ r, list }) => (
        <div key={r.kind} className="risk-route">
          <div className="small"><b>{t(`routes.kinds.${r.kind}`)}</b></div>
          <ul>
            {list.map((x) => <li key={x.key} className={`risk-${x.level}`}>{x.text}</li>)}
          </ul>
        </div>
      ))}
      {!dunes.fields && !dunes.error && <p className="small muted">{t('risk.loadingDunes')}</p>}
      <p className="note">{t('risk.note')}</p>
    </div>
  );
}

export function WhyRoute({ result }: { result: RouteResult }) {
  const { t } = useTranslation();
  const os = getMarsOS();
  const a = useRoutes((s) => s.assumptions);
  const profile = useRoutes((s) => s.profile);
  const rs = os.terrain.resolutionAt(result.start.lat, result.start.lon);
  const re = os.terrain.resolutionAt(result.end.lat, result.end.lon);
  const src = (id: string) => os.catalog.layer(id)?.label?.en ?? id;
  return (
    <details className="card why">
      <summary>{t('why.title')}</summary>
      <div className="field-label">{t('why.used')}</div>
      <ul className="findings small">
        <li>{t('why.elev', { a: src(rs.layerId), ra: fmtM(rs.metersPerPixel ?? 0), b: src(re.layerId), rb: fmtM(re.metersPerPixel ?? 0), cell: Math.round(result.cellM) })}</li>
        <li>{t('why.edits', { n: result.patchIds.length })}</li>
        <li>{t('why.rule', { max: a.maxSlopeDeg, caution: a.cautionSlopeDeg, w: a.slopeWeight, profile: t(`routes.profiles.${profile}`) })}</li>
        <li>{t('why.traverse')}</li>
        <li>{t('why.dunes')}</li>
      </ul>
      <div className="field-label">{t('why.missing')}</div>
      <ul className="findings small">
        {(['rocks', 'soil', 'fresh', 'weather'] as const).map((k) => <li key={k}>{t(`why.miss.${k}`)}</li>)}
      </ul>
      <p className="note">{t('why.note')}</p>
    </details>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Build a self-contained HTML route sheet and download it. */
export function downloadRouteSheet(result: RouteResult, idx: TrackIndex | null, t: (k: string, o?: Record<string, unknown>) => string) {
  const st = useRoutes.getState();
  const os = getMarsOS();
  const rs = os.terrain.resolutionAt(result.start.lat, result.start.lon);
  const rows = (r: Route) => {
    const s = r.stats;
    return `<tr><td>${esc(t(`routes.kinds.${r.kind}`))}</td><td>${fmtM(s.lengthM)}</td><td>${s.maxSlopeDeg.toFixed(1)}°</td><td>${s.meanSlopeDeg.toFixed(1)}°</td><td>+${Math.round(s.gainM)} / −${Math.round(s.lossM)} m</td><td>${Math.round(s.cautionShare * 100)}%</td><td>${Math.round(s.dataLimitedShare * 100)}%</td></tr>`;
  };
  const all = st.actualRoute ? [...result.routes, st.actualRoute] : result.routes;
  const risks = result.routes.map((r) => `<h3>${esc(t(`routes.kinds.${r.kind}`))}</h3><ul>${routeRisks(r, idx, t, st.assumptions.cautionSlopeDeg).map((x) => `<li class="${x.level}">${esc(x.text)}</li>`).join('')}</ul>`).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>MARS OS route sheet</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#1b1b1b}h1{font-size:22px}h2{font-size:16px;margin-top:24px;border-bottom:1px solid #ddd}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:4px 6px;text-align:left}li.high{color:#b00020}li.warn{color:#8a5a00}li.ok{color:#1e6b3a}.muted{color:#666;font-size:12px}</style></head><body>
<h1>MARS OS — ${esc(t('sheet.title'))}</h1>
<p class="muted">${esc(t('sheet.generated'))}: ${new Date().toISOString()} · https://abrilvilla.dev/mars-os/?route=${result.start.lat.toFixed(5)},${result.start.lon.toFixed(5)};${result.end.lat.toFixed(5)},${result.end.lon.toFixed(5)}</p>
<h2>${esc(t('sheet.points'))}</h2>
<p>A: ${formatLat(result.start.lat, 5)} ${formatLon(result.start.lon, 5)}<br>B: ${formatLat(result.end.lat, 5)} ${formatLon(result.end.lon, 5)}${st.realDrive ? `<br>${esc(t('sheet.realDrive', { from: st.realDrive.fromSol, to: st.realDrive.toSol }))}` : ''}</p>
<h2>${esc(t('sheet.results'))}</h2>
<table><tr><th></th><th>${esc(t('routes.length'))}</th><th>${esc(t('routes.maxSlope'))}</th><th>${esc(t('routes.meanSlope'))}</th><th>${esc(t('routes.gainLoss'))}</th><th>${esc(t('routes.caution'))}</th><th>${esc(t('routes.dataLimited'))}</th></tr>${all.map(rows).join('')}</table>
<h2>${esc(t('risk.title'))}</h2>${risks}
<h2>${esc(t('sheet.assumptions'))}</h2>
<p>${esc(t(`routes.profiles.${st.profile}`))} · ${esc(t('routes.maxSlopeA'))} ${st.assumptions.maxSlopeDeg}° · ${esc(t('routes.cautionA'))} ${st.assumptions.cautionSlopeDeg}° · ${esc(t('routes.weightA'))} ${st.assumptions.slopeWeight}<br>${esc(t('routes.basis', { cell: Math.round(result.cellM), w: result.gridSize[0], h: result.gridSize[1] }))}</p>
<h2>${esc(t('sheet.data'))}</h2>
<ul><li>${esc(t('sheet.elev', { layer: rs.layerId, res: fmtM(rs.metersPerPixel ?? 0) }))}</li><li>${esc(t('sheet.edits', { n: result.patchIds.length, ids: result.patchIds.join(', ') || '—' }))}</li></ul>
<h2>${esc(t('sheet.limits'))}</h2>
<ul>${(['rocks', 'soil', 'fresh', 'weather'] as const).map((k) => `<li>${esc(t(`why.miss.${k}`))}</li>`).join('')}<li>${esc(t(st.profile === 'rover' ? 'routes.disclaimerRover' : 'routes.disclaimer'))}</li></ul>
<h2>${esc(t('sheet.sources'))}</h2>
<ul><li>MOLA MEGDR — NASA PDS Geosciences: https://pds-geosciences.wustl.edu/missions/mgs/megdr.html</li><li>CTX DEM Jezero (20 m) — NASA Mars Trek: https://trek.nasa.gov/mars/</li><li>Perseverance traverse — NASA MMGIS: https://mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json</li><li>Mars Global Digital Dune Database — NASA Mars Trek: ${DUNE_SERVICE.replace('/0', '')}</li><li>Tobler (1993) hiking function — Earth heuristic; Perseverance top speed 152 m/h — NASA; 24° tilt limit — NASA (2026)</li></ul>
</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `mars-os-route-${result.start.lat.toFixed(3)}_${result.start.lon.toFixed(3)}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
