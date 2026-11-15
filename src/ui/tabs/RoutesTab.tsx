/**
 * Route comparator: shortest vs low-slope walking route on the current terrain.
 * Measured values come from elevation products; slope limits are editable planning assumptions;
 * walking time is an Earth heuristic. All three are labelled.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { formatLat, formatLon } from '../../core/geo/mars';
import { daylightAt } from '../../core/time/daylight';
import { formatHours, marsTime } from '../../core/time/marsTime';
import { PROFILE_ASSUMPTIONS, type Route, type RouteResult, type TravelerProfile } from '../../core/routes/RoutePlanner';
import { GROUND_M, buildTrackIndex, knowledgeFor, type TrackIndex } from '../../core/routes/knowledge';
import { extractRealDrive } from '../../core/routes/realDrive';
import { ensureRoverData, roverData } from '../../render/overlays/RoverLayer';
import { useRoutes } from '../../state/routeStore';
import { useUI } from '../../state/uiStore';
import { ProvBadge, fmtM } from '../common';
import { computeRoutes } from '../RouteController';

export const ROUTE_COLORS = { shortest: '#ff8a4c', lowSlope: '#b18cff', actual: '#f2f2f2' } as const;

/** Real drives worth comparing (sols of NASA's published traverse). */
export const DRIVE_PRESETS: { from: number; to: number; key: string }[] = [
  { from: 13, to: 100, key: 'first' },
  { from: 380, to: 420, key: 'rapid' },
];

/** Set A/B to the endpoints of a real Perseverance drive and keep its path for comparison. */
export async function loadRealDrive(fromSol: number, toSol: number) {
  await ensureRoverData();
  const rd = extractRealDrive(roverData.segments, roverData.waypoints, fromSol, toSol);
  if (!rd) return false;
  useRoutes.getState().set({ realDrive: rd, actualRoute: null, start: { lat: rd.start.lat, lon: rd.start.lon }, end: { lat: rd.end.lat, lon: rd.end.lon }, changeNote: null, pickMode: null });
  const lats = rd.path.map((p) => p.lat), lons = rd.path.map((p) => p.lon);
  const span = Math.max(Math.max(...lats) - Math.min(...lats), (Math.max(...lons) - Math.min(...lons)) * 0.95) * 59.3;
  useUI.getState().requestFlyTo({ lat: (Math.max(...lats) + Math.min(...lats)) / 2, lon: (Math.max(...lons) + Math.min(...lons)) / 2, distance: Math.max(1.2, span * 2.4), tilt: 35 });
  return true;
}

function useTrackIndex(): TrackIndex | null {
  const [, setRev] = useState(0);
  useEffect(() => {
    if (roverData.status === 'ready') return;
    const l = () => setRev((r) => r + 1);
    roverData.listeners.add(l);
    ensureRoverData();
    return () => void roverData.listeners.delete(l);
  }, []);
  const n = roverData.track.length;
  return useMemo(() => (n ? buildTrackIndex(roverData.track) : null), [n]);
}

function Profile({ routes }: { routes: Route[] }) {
  const all = routes.flatMap((r) => r.points.map((p) => p.h));
  const lo = Math.min(...all), hi = Math.max(...all);
  const maxLen = Math.max(...routes.map((r) => r.stats.lengthM));
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
      {routes.map((r) => <path key={r.kind} d={path(r)} fill="none" stroke={ROUTE_COLORS[r.kind]} strokeWidth="2" strokeDasharray={r.kind === 'actual' ? '4 3' : undefined} />)}
      <text x="2" y="10" className="axis">{fmtM(hi)}</text>
      <text x="2" y={H - 2} className="axis">{fmtM(lo)}</text>
    </svg>
  );
}

/** Metrics in rows, one column per route — readable even in a narrow panel. */
function CompareTable({ routes, profile }: { routes: Route[]; profile: TravelerProfile }) {
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
    profile === 'rover' ? ['routes.driveTime', (s) => '≥ ' + time(s.roverHours).slice(1)] : ['routes.time', (s) => time(s.toblerHours)],
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
            <td className="k">{t(k)}{(k === 'routes.time' || k === 'routes.driveTime') && <> <ProvBadge kind="modeled" /></>}</td>
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

/** Daylight budget at A (Mars24) vs walking time of each route. */
function DaylightBudget({ result }: { result: RouteResult }) {
  const { t } = useTranslation();
  const epochMs = useUI((s) => s.time.epochMs);
  const d = daylightAt(marsTime(new Date(epochMs)), result.start.lat, result.start.lon);
  const longest = Math.max(...result.routes.map((r) => r.stats.toblerHours));
  const enough = d.isDay && d.remainingEarthH >= longest * 2; // walk there and back
  const fmtH = (h: number) => `${Math.floor(h)} h ${Math.round((h % 1) * 60)} min`;
  return (
    <div className={`card daylight ${d.isDay ? (enough ? 'ok' : 'tight') : 'night'}`}>
      <div className="card-title">☀ {t('routes.daylight.title')} <ProvBadge kind="modeled" /></div>
      <div className="kv"><span className="k">{t('routes.daylight.local')}</span><span className="v mono">{formatHours(d.ltstH)} · {t('routes.daylight.sunElev')} {d.sunElevDeg.toFixed(0)}°</span></div>
      {d.sunsetH !== null && d.sunriseH !== null && (
        <div className="kv"><span className="k">{t('routes.daylight.window')}</span><span className="v mono">{formatHours(d.sunriseH)} → {formatHours(d.sunsetH)}</span></div>
      )}
      <p className="small" style={{ margin: '4px 0 0' }}>
        {!d.isDay
          ? t('routes.daylight.night')
          : enough
            ? t('routes.daylight.ok', { left: fmtH(d.remainingEarthH), walk: fmtH(longest * 2) })
            : t('routes.daylight.tight', { left: fmtH(d.remainingEarthH), walk: fmtH(longest * 2) })}
      </p>
      <p className="note">{t('routes.daylight.note')}</p>
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
    </div>
  );
}

/** How well we know the ground under each route: rover-visited, 20 m orbital DEM, coarse only. */
function KnowledgeBars({ routes, idx }: { routes: Route[]; idx: TrackIndex | null }) {
  const { t } = useTranslation();
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <div className="card knowledge">
      <div className="card-title">🔭 {t('routes.know.title')} <ProvBadge kind="derived" /></div>
      {routes.map((r) => {
        const k = knowledgeFor(r, idx);
        return (
          <div key={r.kind} className="know-row">
            <div className="small"><span className="swatch" style={{ background: ROUTE_COLORS[r.kind] }} /> {t(`routes.kinds.${r.kind}`)}</div>
            <div className="know-bar" role="img" aria-label={`${t('routes.know.ground', { m: GROUND_M })} ${pct(k.ground)}, ${t('routes.know.orbital')} ${pct(k.orbital)}, ${t('routes.know.coarse')} ${pct(k.coarse)}`}>
              <span className="kb-ground" style={{ width: pct(k.ground) }} />
              <span className="kb-orbital" style={{ width: pct(k.orbital) }} />
              <span className="kb-coarse" style={{ width: pct(k.coarse) }} />
            </div>
            <div className="small muted mono">{pct(k.ground)} · {pct(k.orbital)} · {pct(k.coarse)}</div>
          </div>
        );
      })}
      <div className="know-legend small">
        <span><i className="kb-ground" /> {t('routes.know.ground', { m: GROUND_M })}</span>
        <span><i className="kb-orbital" /> {t('routes.know.orbital')}</span>
        <span><i className="kb-coarse" /> {t('routes.know.coarse')}</span>
      </div>
      {!idx && <p className="small muted">{t('routes.know.loading')}</p>}
      {idx && (() => {
        const sh = routes.find((r) => r.kind === 'shortest');
        const un = sh ? 1 - knowledgeFor(sh, idx).ground : 0;
        return un >= 0.3 ? <p className="warn-box small">{t('routes.know.unvisited', { pct: Math.round(un * 100) })}</p> : null;
      })()}
      <p className="note">{t('routes.know.note')}</p>
    </div>
  );
}

/** Real drive vs computed routes: deterministic comparison, no claim about which is better. */
function DriveInsight({ actual, routes }: { actual: Route; routes: Route[] }) {
  const { t } = useTranslation();
  const rd = useRoutes((s) => s.realDrive);
  if (!rd) return null;
  const sh = routes.find((r) => r.kind === 'shortest')!.stats;
  const lo = routes.find((r) => r.kind === 'lowSlope')!.stats;
  const a = actual.stats;
  return (
    <div className="card rec">
      <div className="card-title">🤖 {t('routes.drive.insightTitle', { from: rd.fromSol, to: rd.toSol })}</div>
      <p>{t('routes.drive.insight', { real: fmtM(a.lengthM), short: fmtM(sh.lengthM), extra: Math.round(((a.lengthM - sh.lengthM) / Math.max(1, sh.lengthM)) * 100), realMax: a.maxSlopeDeg.toFixed(1), shortMax: sh.maxSlopeDeg.toFixed(1), lowMax: lo.maxSlopeDeg.toFixed(1) })}</p>
      <p className="small">{t('routes.drive.why')}</p>
      <p className="small muted">{t('routes.drive.basis')}</p>
    </div>
  );
}

/** What a slope map cannot see — the lesson of Spirit (2009). */
function SlopeBlindSpots({ cell }: { cell: number }) {
  const { t } = useTranslation();
  return (
    <div className="card sand">
      <div className="card-title">⚠ {t('routes.sand.title')}</div>
      <p className="small">{t('routes.sand.spirit')}</p>
      <p className="small">{t('routes.rocks', { cell })}</p>
      <p className="note">{t('routes.sand.source')}</p>
    </div>
  );
}

function RealDriveCard() {
  const { t } = useTranslation();
  const rd = useRoutes((s) => s.realDrive);
  const [from, setFrom] = useState(380);
  const [to, setTo] = useState(420);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async (f: number, tt: number) => {
    setBusy(true);
    setErr(false);
    setFrom(f);
    setTo(tt);
    const ok = await loadRealDrive(f, tt);
    setBusy(false);
    setErr(!ok);
  };
  return (
    <details className="card real-drive" open={!!rd}>
      <summary>🛞 {t('routes.drive.title')} <ProvBadge kind="measured" /></summary>
      <p className="small muted">{t('routes.drive.intro')}</p>
      <div className="actions">
        {DRIVE_PRESETS.map((p) => (
          <button key={p.key} onClick={() => go(p.from, p.to)} disabled={busy}>{t(`routes.drive.presets.${p.key}`)}</button>
        ))}
      </div>
      <div className="sol-range">
        <label>{t('routes.drive.from')} <input type="number" min={0} value={from} onChange={(e) => setFrom(+e.target.value)} /></label>
        <label>{t('routes.drive.to')} <input type="number" min={1} value={to} onChange={(e) => setTo(+e.target.value)} /></label>
        <button className="primary" onClick={() => go(from, to)} disabled={busy}>{busy ? t('photos.loading') : t('routes.drive.load')}</button>
      </div>
      {err && <p className="err-box small">{t('routes.drive.none')}</p>}
      {rd && (
        <p className="small">
          <span className="swatch" style={{ background: ROUTE_COLORS.actual }} /> {t('routes.drive.loaded', { from: rd.fromSol, to: rd.toSol, n: rd.drives, len: fmtM(rd.lengthM), a: rd.start.rmc, b: rd.end.rmc })}
        </p>
      )}
    </details>
  );
}

export function RoutesTab() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const r = useRoutes();
  const pin = useUI((s) => s.pick);
  const fly = useUI((s) => s.requestFlyTo);
  const idx = useTrackIndex();
  const setProfile = (p: TravelerProfile) => r.set({ profile: p, assumptions: { ...PROFILE_ASSUMPTIONS[p] } });

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
  const shown = res?.ok ? (r.actualRoute ? [...res.routes, r.actualRoute] : res.routes) : [];
  return (
    <div className="routes">
      <div className="segmented profile-seg" role="group" aria-label={t('routes.profileLabel')}>
        {(['rover', 'astronaut'] as const).map((p) => (
          <button key={p} className={r.profile === p ? 'active' : ''} onClick={() => setProfile(p)}>{t(`routes.profiles.${p}`)}</button>
        ))}
      </div>
      <p className="small muted">{t(r.profile === 'rover' ? 'routes.introRover' : 'routes.intro')}</p>
      {point('start')}
      {point('end')}
      <div className="actions">
        <button onClick={example}>{t('routes.example')}</button>
        {r.start && r.end && <button className="primary" onClick={() => computeRoutes('user')} disabled={r.status === 'computing'}>{r.status === 'computing' ? t('routes.computing') : t('routes.compute')}</button>}
        {(r.start || r.end) && <button className="danger" onClick={() => r.set({ start: null, end: null, result: null, changeNote: null, status: 'idle' })}>{t('inspect.clear')}</button>}
      </div>

      <RealDriveCard />

      <details className="card assumptions">
        <summary>{t('routes.assumptions')} <ProvBadge kind="modeled" /></summary>
        <p className="small muted">{t(r.profile === 'rover' ? 'routes.assumptionsRover' : 'routes.assumptionsNote')}</p>
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
          <CompareTable routes={shown} profile={r.profile} />
          <div className="field-label">{t('routes.profile')}</div>
          <Profile routes={shown} />
          {r.actualRoute && <DriveInsight actual={r.actualRoute} routes={res.routes} />}
          <Recommendation result={res} />
          <KnowledgeBars routes={shown} idx={idx} />
          <SlopeBlindSpots cell={Math.round(res.cellM)} />
          {r.profile === 'astronaut' ? <DaylightBudget result={res} /> : <p className="small muted">{t('routes.roverPower')}</p>}
          <button className="primary" onClick={() => { useUI.getState().set({ hud: true, panelsOpen: { left: false, right: false } }); fly({ lat: res.start.lat, lon: res.start.lon, distance: 0.025, tilt: 82 }); }}>{t('hud2.openFromRoutes')}</button>
          <button onClick={() => fly({ lat: (res.start.lat + res.end.lat) / 2, lon: (res.start.lon + res.end.lon) / 2, distance: Math.max(1.5, (res.bbox.north - res.bbox.south) * 59.3 * 1.6), tilt: 40 })}>{t('nav.goTo')}</button>
          <p className="small muted">{t('routes.basis', { cell: Math.round(res.cellM), w: res.gridSize[0], h: res.gridSize[1] })} <ProvBadge kind="derived" /></p>
        </>
      )}
      <p className="small muted">{t(r.profile === 'rover' ? 'routes.disclaimerRover' : 'routes.disclaimer')}</p>
      {os.ready && null}
    </div>
  );
}
