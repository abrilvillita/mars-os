/**
 * Route comparator: shortest vs low-slope walking route on the current terrain.
 * Measured values come from elevation products; slope limits are editable planning assumptions;
 * walking time is an Earth heuristic. All three are labelled.
 */
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { formatLat, formatLon } from '../../core/geo/mars';
import type { Route, RouteResult } from '../../core/routes/RoutePlanner';
import { roverData } from '../../render/overlays/RoverLayer';
import { useRoutes } from '../../state/routeStore';
import { useUI } from '../../state/uiStore';
import { ProvBadge, fmtM } from '../common';
import { computeRoutes } from '../RouteController';

export const ROUTE_COLORS = { shortest: '#ff8a4c', lowSlope: '#b18cff' } as const;

function Profile({ result }: { result: RouteResult }) {
  const all = result.routes.flatMap((r) => r.points.map((p) => p.h));
  const lo = Math.min(...all), hi = Math.max(...all);
  const maxLen = Math.max(...result.routes.map((r) => r.stats.lengthM));
  const W = 300, H = 90;
  const path = (r: Route) => {
    let d = 0;
    return r.points
      .map((p, i) => {
        if (i > 0) {
          const q = r.points[i - 1];
          d += Math.hypot((p.lat - q.lat) * 59274.7, (p.lon - q.lon) * 59274.7 * Math.cos((p.lat * Math.PI) / 180));
        }
        return `${i ? 'L' : 'M'}${((d / maxLen) * W).toFixed(1)},${(H - ((p.h - lo) / Math.max(1, hi - lo)) * (H - 8) - 4).toFixed(1)}`;
      })
      .join(' ');
  };
  return (
    <svg className="profile" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Elevation profile">
      {result.routes.map((r) => <path key={r.kind} d={path(r)} fill="none" stroke={ROUTE_COLORS[r.kind]} strokeWidth="2" />)}
      <text x="2" y="10" className="axis">{fmtM(hi)}</text>
      <text x="2" y={H - 2} className="axis">{fmtM(lo)}</text>
    </svg>
  );
}

/** Metrics in rows, one column per route — readable even in a narrow panel. */
function CompareTable({ routes }: { routes: Route[] }) {
  const { t } = useTranslation();
  const time = (h: number) => {
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    return `~${hh ? `${hh} h ` : ''}${mm} min`;
  };
  const rows: [string, (s: Route['stats']) => string, boolean?][] = [
    ['routes.length', (s) => fmtM(s.lengthM)],
    ['routes.maxSlope', (s) => `${s.maxSlopeDeg.toFixed(1)}°`, true],
    ['routes.meanSlope', (s) => `${s.meanSlopeDeg.toFixed(1)}°`],
    ['routes.gainLoss', (s) => `+${Math.round(s.gainM)} / −${Math.round(s.lossM)} m`],
    ['routes.caution', (s) => `${(s.cautionShare * 100).toFixed(0)}%`],
    ['routes.dataLimited', (s) => `${(s.dataLimitedShare * 100).toFixed(0)}%`],
    ['routes.time', (s) => time(s.toblerHours)],
  ];
  return (
    <table className="route-table">
      <thead>
        <tr>
          <th />
          {routes.map((r) => (
            <th key={r.kind}><span className="swatch" style={{ background: ROUTE_COLORS[r.kind] }} /> {t(`routes.kinds.${r.kind}`)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([k, f, strong]) => (
          <tr key={k}>
            <td className="k">{t(k)}{k === 'routes.time' && <> <ProvBadge kind="modeled" /></>}</td>
            {routes.map((r) => <td key={r.kind} className={strong ? 'strong' : ''}>{f(r.stats)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RouteCard({ r }: { r: Route }) {
  const { t } = useTranslation();
  const s = r.stats;
  const hours = Math.floor(s.toblerHours), mins = Math.round((s.toblerHours - hours) * 60);
  return (
    <div className="route-card" style={{ borderTopColor: ROUTE_COLORS[r.kind] }}>
      <div className="route-name"><span className="swatch" style={{ background: ROUTE_COLORS[r.kind] }} />{t(`routes.kinds.${r.kind}`)}</div>
      <div className="kv"><span className="k">{t('routes.length')}</span><span className="v">{fmtM(s.lengthM)}</span></div>
      <div className="kv"><span className="k">{t('routes.gainLoss')}</span><span className="v">+{Math.round(s.gainM)} / −{Math.round(s.lossM)} m</span></div>
      <div className="kv"><span className="k">{t('routes.maxSlope')}</span><span className="v"><b>{s.maxSlopeDeg.toFixed(1)}°</b></span></div>
      <div className="kv"><span className="k">{t('routes.meanSlope')}</span><span className="v">{s.meanSlopeDeg.toFixed(1)}°</span></div>
      <div className="kv"><span className="k">{t('routes.caution')}</span><span className="v">{(s.cautionShare * 100).toFixed(0)}%</span></div>
      <div className="kv"><span className="k">{t('routes.dataLimited')}</span><span className={`v ${s.dataLimitedShare > 0 ? 'warn' : ''}`}>{(s.dataLimitedShare * 100).toFixed(0)}%</span></div>
      <div className="kv"><span className="k">{t('routes.time')}</span><span className="v">~{hours ? `${hours} h ` : ''}{mins} min <ProvBadge kind="modeled" /></span></div>
    </div>
  );
}

/** Deterministic recommendation from the measured statistics (no AI involved). */
function Recommendation({ result }: { result: RouteResult }) {
  const { t } = useTranslation();
  const a = useRoutes((s) => s.assumptions);
  const sh = result.routes.find((r) => r.kind === 'shortest')!.stats;
  const lo = result.routes.find((r) => r.kind === 'lowSlope')!.stats;
  const extra = (lo.lengthM - sh.lengthM) / Math.max(1, sh.lengthM);
  const slopeGain = sh.maxSlopeDeg - lo.maxSlopeDeg;
  let key: string;
  if (slopeGain >= 2 && extra < 0.01) key = 'routes.rec.lowSlopeSame';
  else if (slopeGain >= 2 && extra <= 0.3) key = 'routes.rec.lowSlope';
  else if (slopeGain >= 2) key = 'routes.rec.tradeoff';
  else key = 'routes.rec.similar';
  return (
    <div className="card rec">
      <div className="card-title">{t('routes.recTitle')}</div>
      <p>{t(key, { extra: Math.round(extra * 100), slope: slopeGain.toFixed(1), shortMax: sh.maxSlopeDeg.toFixed(1), lowMax: lo.maxSlopeDeg.toFixed(1), caution: a.cautionSlopeDeg })}</p>
      <p className="small muted">{t('routes.recBasis', { cell: Math.round(result.cellM) })}</p>
      {(sh.dataLimitedShare > 0 || lo.dataLimitedShare > 0) && <p className="warn-box small">{t('routes.dataWarn')}</p>}
      <p className="small muted">{t('routes.rocks', { cell: Math.round(result.cellM) })}</p>
    </div>
  );
}

export function RoutesTab() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const r = useRoutes();
  const pin = useUI((s) => s.pick);
  const fly = useUI((s) => s.requestFlyTo);

  const example = () => {
    // real data: Perseverance landing waypoint → the rover's stop closest to sol 400
    const wps = roverData.waypoints;
    const end = wps.length ? [...wps].sort((a, b) => Math.abs(a.sol - 400) - Math.abs(b.sol - 400))[0] : null;
    r.set({ start: { lat: 18.44462715, lon: 77.45088573 }, end: end ? { lat: end.lat, lon: end.lon } : { lat: 18.4619, lon: 77.4361 }, changeNote: null });
    fly({ lat: 18.452, lon: 77.443, distance: 4, tilt: 45, heading: 330 });
  };

  const point = (which: 'start' | 'end') => {
    const p = r[which];
    return (
      <div className="route-point">
        <span className={`pt-badge pt-${which}`}>{which === 'start' ? 'A' : 'B'}</span>
        <span className="mono small">{p ? `${formatLat(p.lat, 4)} ${formatLon(p.lon, 4)}` : t('routes.notSet')}</span>
        <span className="actions">
          <button className={r.pickMode === which ? 'on' : ''} onClick={() => r.set({ pickMode: r.pickMode === which ? null : which })}>
            {r.pickMode === which ? t('routes.clickMap') : t('routes.pickMap')}
          </button>
          {pin && <button onClick={() => r.set({ [which]: { lat: pin.lat, lon: pin.lon }, changeNote: null } as never)}>{t('routes.usePin')}</button>}
        </span>
      </div>
    );
  };

  const res = r.result;
  return (
    <div className="routes">
      <p className="small muted">{t('routes.intro')}</p>
      {point('start')}
      {point('end')}
      <div className="actions">
        <button onClick={example}>{t('routes.example')}</button>
        {r.start && r.end && <button className="primary" onClick={() => computeRoutes('user')} disabled={r.status === 'computing'}>{r.status === 'computing' ? t('routes.computing') : t('routes.compute')}</button>}
        {(r.start || r.end) && <button className="danger" onClick={() => r.set({ start: null, end: null, result: null, changeNote: null, status: 'idle' })}>{t('inspect.clear')}</button>}
      </div>

      <details className="card assumptions">
        <summary>{t('routes.assumptions')} <ProvBadge kind="modeled" /></summary>
        <p className="small muted">{t('routes.assumptionsNote')}</p>
        <label className="field-label">{t('routes.maxSlopeA')} <b>{r.assumptions.maxSlopeDeg}°</b></label>
        <input type="range" min={8} max={40} value={r.assumptions.maxSlopeDeg} onChange={(e) => r.set({ assumptions: { ...r.assumptions, maxSlopeDeg: +e.target.value } })} />
        <label className="field-label">{t('routes.cautionA')} <b>{r.assumptions.cautionSlopeDeg}°</b></label>
        <input type="range" min={3} max={30} value={r.assumptions.cautionSlopeDeg} onChange={(e) => r.set({ assumptions: { ...r.assumptions, cautionSlopeDeg: +e.target.value } })} />
        <label className="field-label">{t('routes.weightA')} <b>{r.assumptions.slopeWeight}</b></label>
        <input type="range" min={0} max={20} value={r.assumptions.slopeWeight} onChange={(e) => r.set({ assumptions: { ...r.assumptions, slopeWeight: +e.target.value } })} />
      </details>

      {r.status === 'computing' && <p className="muted">{t('routes.computing')}</p>}
      {res && !res.ok && <p className="err-box">{t(`routes.errors.${res.error}`, { max: r.assumptions.maxSlopeDeg })}</p>}

      {r.changeNote && (
        <div className="change-note">
          <b>{t('routes.changed')}</b>
          {r.changeNote.addedPatchIds.length > 0 && <div className="small">{t('routes.changeAdded')}: <span className="mono">{r.changeNote.addedPatchIds.join(', ')}</span></div>}
          {r.changeNote.removedPatchIds.length > 0 && <div className="small">{t('routes.changeRemoved')}: <span className="mono">{r.changeNote.removedPatchIds.join(', ')}</span></div>}
          {r.changeNote.previewActive && <div className="small warn">{t('routes.changePreview')}</div>}
          {r.changeNote.deltas.map((d) => (
            <div key={d.kind} className="small">
              <span className="swatch" style={{ background: ROUTE_COLORS[d.kind] }} /> {t(`routes.kinds.${d.kind}`)}: {d.lengthM >= 0 ? '+' : ''}{Math.round(d.lengthM)} m · {t('routes.maxSlope')} {d.maxSlopeDeg >= 0 ? '+' : ''}{d.maxSlopeDeg.toFixed(1)}° · +{Math.round(d.gainM)} m
            </div>
          ))}
        </div>
      )}

      {res?.ok && (
        <>
          <CompareTable routes={res.routes} />
          <div className="field-label">{t('routes.profile')}</div>
          <Profile result={res} />
          <Recommendation result={res} />
          <button onClick={() => fly({ lat: (res.start.lat + res.end.lat) / 2, lon: (res.start.lon + res.end.lon) / 2, distance: Math.max(1.5, (res.bbox.north - res.bbox.south) * 59.3 * 1.6), tilt: 40 })}>{t('nav.goTo')}</button>
          <p className="small muted">{t('routes.basis', { cell: Math.round(res.cellM), w: res.gridSize[0], h: res.gridSize[1] })} <ProvBadge kind="derived" /></p>
        </>
      )}
      <p className="small muted">{t('routes.disclaimer')}</p>
      {os.ready && null}
    </div>
  );
}
