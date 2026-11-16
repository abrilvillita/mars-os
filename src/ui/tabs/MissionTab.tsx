/**
 * Mission Lab: send your own crew, rover or base camp anywhere on Mars. MARS OS does not stop
 * you: it computes what that place means for oxygen, energy, communication with Earth,
 * radiation, water, terrain and EVA range, compares two candidate sites, and can ask Gemini
 * whether the mission answers its question. Every value is labelled measured / computed / assumed.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { api } from '../../api/apiBase';
import { DEG, M_PER_DEG, distanceM, formatLat, formatLon } from '../../core/geo/mars';
import { duneAt, duneData, ensureDunes } from '../../core/live/dunes';
import { expeditions, loadExpeditions } from '../../core/live/expeditions';
import { currentPosition, explorersState } from '../../core/live/explorers';
import { ensureIce, iceData, nearestIce } from '../../core/live/ice';
import { ensureMinerals, mineralData, mineralsNear } from '../../core/live/minerals';
import { CONST, conjunctionDays, earthLink, evaRadiusKm, oxygenNeeds, pressureAt, radiation, solar, type MissionInputs } from '../../core/mission/missionModel';
import { marsTime } from '../../core/time/marsTime';
import { m20Last, useExplorers } from '../../render/overlays/ExplorersLayer';
import { useMission, type MissionAIResult } from '../../state/missionStore';
import { useUI } from '../../state/uiStore';
import { ProvBadge, fmtM } from '../common';

type Level = 'ok' | 'warn' | 'high';
const km = (m: number) => (m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString()} km`);

export function computeSite(lat: number, lon: number, i: MissionInputs, epochMs: number) {
  const os = getMarsOS();
  const h = os.elevationService.height(lat, lon, 500);
  const d = 2500, dLat = d / M_PER_DEG, dLon = d / (M_PER_DEG * Math.cos(lat * DEG));
  const gx = (os.elevationService.height(lat, lon + dLon, 500) - os.elevationService.height(lat, lon - dLon, 500)) / (2 * d);
  const gy = (os.elevationService.height(lat + dLat, lon, 500) - os.elevationService.height(lat - dLat, lon, 500)) / (2 * d);
  const slope = Math.atan(Math.hypot(gx, gy)) / DEG;
  const mt = marsTime(new Date(epochMs));
  const sun = solar(lat, mt.subsolarLat, mt.sunDistanceAU, i);
  const link = earthLink(epochMs);
  const conj = conjunctionDays(epochMs, Math.max(1, i.days));
  const ice = iceData.points ? nearestIce(lat, lon) : null;
  const dune = duneData.fields ? duneAt(lat, lon) : null;
  const r = evaRadiusKm(i);
  const mineralsInRange = mineralData.points ? mineralsNear(mineralData.points, lat, lon, Math.max(r, 1) * 1000).length : null;
  const minerals100 = mineralData.points ? mineralsNear(mineralData.points, lat, lon, 100_000).length : null;
  const last = m20Last();
  const robots = explorersState.list.map((e) => { const p = currentPosition(e, last); return { e, d: distanceM(lat, lon, p.lat, p.lon) }; }).sort((a, b) => a.d - b.d);
  const stopsInRange = (expeditions.doc?.stops ?? []).filter((s) => distanceM(lat, lon, s.lat, s.lon) <= r * 1000).length;
  return { h, pressure: pressureAt(h), slope, sun, link, conj, ice, dune, r, mineralsInRange, minerals100, robot: robots[0] ?? null, stopsInRange, o2: oxygenNeeds(i), rad: radiation(i.days), lat };
}

type Site = ReturnType<typeof computeSite>;

function flags(s: Site, i: MissionInputs, t: (k: string, o?: Record<string, unknown>) => string) {
  const f: { level: Level; text: string }[] = [];
  if (i.kind !== 'rover') f.push({ level: 'high', text: t('mission.f.pressure', { p: Math.round(s.pressure), a: CONST.armstrongPa }) });
  if (s.dune?.inside) f.push({ level: 'high', text: t('mission.f.dune', { id: s.dune.inside.id }) });
  else if (s.dune && s.dune.nearestM < 10_000) f.push({ level: 'warn', text: t('mission.f.duneNear', { d: km(s.dune.nearestM) }) });
  if (i.kind === 'rover' && s.slope > 24) f.push({ level: 'high', text: t('mission.f.slopeRover', { s: s.slope.toFixed(1) }) });
  else if (s.slope > 10) f.push({ level: 'warn', text: t('mission.f.slope', { s: s.slope.toFixed(1) }) });
  if (s.sun.surface < 60 && (i.kind !== 'rover' || i.roverPower === 'solar')) f.push({ level: s.sun.surface < 20 ? 'high' : 'warn', text: t('mission.f.sun', { w: Math.round(s.sun.surface) }) });
  if (s.conj.length) f.push({ level: 'warn', text: t('mission.f.conj', { n: s.conj.length, first: s.conj[0] }) });
  if (s.rad.limitShare > 0.25) f.push({ level: s.rad.limitShare > 0.5 ? 'high' : 'warn', text: t('mission.f.rad', { p: Math.round(s.rad.limitShare * 100) }) });
  if (s.ice?.icyCrater && s.ice.icyCrater.d / 1000 <= s.r) f.push({ level: 'ok', text: t('mission.f.iceInRange') });
  else if (i.kind !== 'rover' && s.ice) f.push({ level: 'warn', text: t('mission.f.iceFar', { d: km(Math.min(s.ice.icyCrater?.d ?? Infinity, s.ice.glacier?.d ?? Infinity)) }) });
  if (Math.abs(s.lat) > 60) f.push({ level: 'warn', text: t('mission.f.polar') });
  return f;
}

function Num({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string }) {
  return (
    <label className="num-field">
      <span>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Math.min(max, Math.max(min, +e.target.value)))} />
      {unit && <span className="muted small">{unit}</span>}
    </label>
  );
}

function siteLabel(lat: number, lon: number) {
  const z = expeditions.doc?.zones.map((x) => ({ x, d: distanceM(lat, lon, x.lat, x.lon) })).sort((a, b) => a.d - b.d)[0];
  return z && z.d < 150_000 ? z.x.name : `${formatLat(lat, 1)} ${formatLon(lon, 1)}`;
}

export function MissionTab() {
  const { t, i18n } = useTranslation();
  useExplorers();
  const m = useMission();
  const pin = useUI((s) => s.pick);
  const epochMs = useUI((s) => s.time.epochMs);
  const fly = useUI((s) => s.requestFlyTo);
  const [, setRev] = useState(0);
  useEffect(() => {
    Promise.all([ensureIce(), ensureMinerals(), ensureDunes(), loadExpeditions(import.meta.env.BASE_URL)]).then(() => setRev((r) => r + 1));
  }, []);
  const i = m.inputs;
  const setI = (p: Partial<MissionInputs>) => m.set({ inputs: { ...i, ...p }, ai: null });
  const s = m.site ? computeSite(m.site.lat, m.site.lon, i, epochMs) : null;
  const es = i18n.language.startsWith('es');
  const tt = t as unknown as (k: string, o?: Record<string, unknown>) => string;

  const askAI = async () => {
    if (!s || !m.site) return;
    m.set({ aiStatus: 'running', aiError: null });
    try {
      const body = {
        question: m.question.trim() || t('mission.defaultQuestion', { kind: t(`mission.kinds.${i.kind}`) }),
        kind: i.kind,
        site: { lat: +m.site.lat.toFixed(4), lon: +m.site.lon.toFixed(4), label: siteLabel(m.site.lat, m.site.lon) },
        assumptions: i,
        facts: {
          elevation_m: Math.round(s.h), pressure_Pa: Math.round(s.pressure), regional_slope_deg: +s.slope.toFixed(1),
          inside_dune_field: !!s.dune?.inside, nearest_dune_field_km: s.dune ? +(s.dune.nearestM / 1000).toFixed(1) : null,
          nearest_icy_crater_km: s.ice?.icyCrater ? Math.round(s.ice.icyCrater.d / 1000) : null, nearest_glacier_km: s.ice?.glacier ? Math.round(s.ice.glacier.d / 1000) : null,
          mineral_detections_within_100km: s.minerals100, eva_radius_km: +s.r.toFixed(1), expedition_stops_in_eva_range: s.stopsInRange,
          daily_sunlight_surface_W_m2: Math.round(s.sun.surface), earth_light_time_min: +s.link.lightMin.toFixed(1), solar_conjunction_days_in_mission: s.conj.length,
          oxygen_needed_kg_total: +s.o2.total.toFixed(0), radiation_surface_mSv: +s.rad.surface.toFixed(0), nearest_robot: s.robot ? `${s.robot.e.name} ${Math.round(s.robot.d / 1000)} km` : null,
        },
      };
      const res = await fetch(api('/api/ai/mission'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      m.set({ ai: j as MissionAIResult, aiStatus: 'idle' });
    } catch (e) {
      m.set({ aiStatus: 'error', aiError: (e as Error).message });
    }
  };

  const save = (k: 'A' | 'B') => m.site && m.set({ saved: { ...m.saved, [k]: { ...m.site, label: siteLabel(m.site.lat, m.site.lon) } } });
  const A = m.saved.A ? computeSite(m.saved.A.lat, m.saved.A.lon, i, epochMs) : null;
  const B = m.saved.B ? computeSite(m.saved.B.lat, m.saved.B.lon, i, epochMs) : null;

  return (
    <div className="mission">
      <p className="small muted">{t('mission.intro')}</p>
      <div className="segmented" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {(['crew', 'rover', 'base'] as const).map((k) => <button key={k} className={i.kind === k ? 'active' : ''} onClick={() => setI({ kind: k })}>{t(`mission.kinds.${k}`)}</button>)}
      </div>

      <div className="card">
        <div className="card-title">{t('mission.site')}</div>
        {m.site ? <div className="mono small">{formatLat(m.site.lat, 4)} {formatLon(m.site.lon, 4)} · {siteLabel(m.site.lat, m.site.lon)}</div> : <p className="small muted">{t('mission.noSite')}</p>}
        <div className="actions">
          <button className={m.picking ? 'on' : 'primary'} onClick={() => m.set({ picking: !m.picking })}>{m.picking ? t('routes.clickMap') : t('mission.place')}</button>
          {pin && <button onClick={() => m.set({ site: { lat: pin.lat, lon: pin.lon }, ai: null })}>{t('routes.usePin')}</button>}
          {m.site && <button onClick={() => fly({ lat: m.site!.lat, lon: m.site!.lon, distance: i.kind === 'base' ? 0.4 : 0.05, tilt: 70 })}>{t('mission.see')}</button>}
        </div>
        <textarea className="mission-q" rows={2} placeholder={t('mission.questionPh')} value={m.question} onChange={(e) => m.set({ question: e.target.value, ai: null })} />
      </div>

      <details className="card">
        <summary>{t('mission.assumptions')} <ProvBadge kind="modeled" /></summary>
        <div className="num-grid">
          {i.kind !== 'rover' && <Num label={t('mission.in.crew')} value={i.crew} min={1} max={12} onChange={(v) => setI({ crew: v })} />}
          <Num label={t('mission.in.days')} value={i.days} min={1} max={700} onChange={(v) => setI({ days: v })} unit="sols" />
          {i.kind !== 'rover' && <Num label={t('mission.in.eva')} value={i.evaHours} min={1} max={10} step={0.5} onChange={(v) => setI({ evaHours: v })} unit="h" />}
          {i.kind !== 'rover' && <Num label={t('mission.in.reserve')} value={i.reservePct} min={0} max={80} onChange={(v) => setI({ reservePct: v })} unit="%" />}
          {i.kind !== 'rover' && <Num label={t('mission.in.walk')} value={i.walkKmh} min={0.5} max={6} step={0.5} onChange={(v) => setI({ walkKmh: v })} unit="km/h" />}
          {i.kind !== 'rover' && <Num label={t('mission.in.power')} value={i.powerKw} min={1} max={200} onChange={(v) => setI({ powerKw: v })} unit="kW" />}
          <Num label={t('mission.in.tau')} value={i.tau} min={0.1} max={5} step={0.1} onChange={(v) => setI({ tau: v })} />
          <Num label={t('mission.in.eff')} value={i.panelEff} min={0.05} max={0.4} step={0.01} onChange={(v) => setI({ panelEff: v })} />
          {i.kind === 'rover' && (
            <label className="num-field"><span>{t('mission.in.roverPower')}</span>
              <select value={i.roverPower} onChange={(e) => setI({ roverPower: e.target.value as 'rtg' | 'solar' })}><option value="rtg">MMRTG</option><option value="solar">{t('mission.in.solar')}</option></select>
            </label>
          )}
          {i.kind === 'rover' && i.roverPower === 'solar' && <Num label={t('mission.in.panel')} value={i.panelM2} min={0.2} max={10} step={0.1} onChange={(v) => setI({ panelM2: v })} unit="m²" />}
        </div>
        <p className="note">{t('mission.assumptionsNote')}</p>
      </details>

      {s && (
        <>
          <div className="card risk">
            <div className="card-title">{t('mission.what')} <ProvBadge kind="derived" /></div>
            <ul>{flags(s, i, tt).map((x, k) => <li key={k} className={`risk-${x.level}`}>{x.text}</li>)}</ul>
          </div>

          <div className="card">
            <div className="card-title">{t('mission.terrain')} <ProvBadge kind="measured" /></div>
            <div className="kv"><span className="k">{t('landing.check.elev')}</span><span className="v">{fmtM(s.h)}</span></div>
            <div className="kv"><span className="k">{t('mission.pressure')}</span><span className="v">≈ {Math.round(s.pressure)} Pa <ProvBadge kind="modeled" /></span></div>
            <div className="kv"><span className="k">{t('landing.check.slope')}</span><span className="v">{s.slope.toFixed(1)}°</span></div>
            {s.dune && <div className="kv"><span className="k">{t('mission.dunes')}</span><span className="v">{s.dune.inside ? t('mission.insideDune') : km(s.dune.nearestM)}</span></div>}
            {s.ice?.icyCrater && <div className="kv"><span className="k">{t('ice.icyCrater')}</span><span className="v">{km(s.ice.icyCrater.d)}</span></div>}
            {s.ice?.glacier && <div className="kv"><span className="k">{t('ice.glacier')}</span><span className="v">{km(s.ice.glacier.d)}</span></div>}
            {s.minerals100 !== null && <div className="kv"><span className="k">{t('landing.check.minerals')}</span><span className="v">{s.minerals100}</span></div>}
            {s.robot && <div className="kv"><span className="k">{t('landing.check.robot')}</span><span className="v">{s.robot.e.name} · {km(s.robot.d)}</span></div>}
          </div>

          {i.kind !== 'rover' && (
            <div className="card">
              <div className="card-title">{t('mission.o2.title')} <ProvBadge kind="modeled" /></div>
              <div className="kv"><span className="k">{t('mission.o2.perDay')}</span><span className="v">{s.o2.perDay.toFixed(2)} kg</span></div>
              <div className="kv"><span className="k">{t('mission.o2.total', { n: i.days })}</span><span className="v"><b>{s.o2.total.toFixed(0)} kg</b></span></div>
              <div className="kv"><span className="k">{t('mission.o2.moxie')}</span><span className="v">≈ {Math.ceil(s.o2.moxieUnits)}</span></div>
              <p className="note">{t('mission.o2.note')}</p>
            </div>
          )}

          <div className="card">
            <div className="card-title">{t('mission.energy.title')} <ProvBadge kind="modeled" /></div>
            <div className="kv"><span className="k">{t('mission.energy.toa')}</span><span className="v">{Math.round(s.sun.toa)} W/m²</span></div>
            <div className="kv"><span className="k">{t('mission.energy.surface', { tau: i.tau })}</span><span className="v">{Math.round(s.sun.surface)} W/m²</span></div>
            {i.kind !== 'rover' ? (
              <>
                <div className="kv"><span className="k">{t('mission.energy.area', { kw: i.powerKw })}</span><span className="v"><b>{Number.isFinite(s.sun.areaM2) ? `${Math.round(s.sun.areaM2).toLocaleString()} m²` : '—'}</b></span></div>
                <div className="kv"><span className="k">{t('mission.energy.rtg')}</span><span className="v">{Math.ceil((i.powerKw * 1000) / CONST.mmrtgW)}</span></div>
              </>
            ) : i.roverPower === 'solar' ? (
              <div className="kv"><span className="k">{t('mission.energy.roverSolar', { m2: i.panelM2 })}</span><span className="v"><b>{Math.round(s.sun.roverWh)} Wh/sol</b></span></div>
            ) : (
              <div className="kv"><span className="k">MMRTG</span><span className="v">≈ {CONST.mmrtgW} W · {Math.round(CONST.mmrtgW * CONST.solHours)} Wh/sol</span></div>
            )}
            <p className="note">{t('mission.energy.note')}</p>
          </div>

          <div className="card">
            <div className="card-title">{t('mission.comms.title')} <ProvBadge kind="modeled" /></div>
            <div className="kv"><span className="k">{t('mission.comms.dist')}</span><span className="v">{s.link.au.toFixed(2)} AU</span></div>
            <div className="kv"><span className="k">{t('mission.comms.light')}</span><span className="v"><b>{s.link.lightMin.toFixed(1)} min</b> · {t('mission.comms.round', { m: (2 * s.link.lightMin).toFixed(0) })}</span></div>
            <div className="kv"><span className="k">{t('mission.comms.conj')}</span><span className="v">{s.conj.length ? t('mission.comms.conjYes', { n: s.conj.length, first: s.conj[0] }) : t('mission.comms.conjNo')}</span></div>
            <p className="note">{t('mission.comms.note')}</p>
          </div>

          {i.kind !== 'rover' && (
            <div className="card">
              <div className="card-title">{t('mission.rad.title')} <ProvBadge kind="measured" /></div>
              <div className="kv"><span className="k">{t('mission.rad.surface', { n: i.days })}</span><span className="v"><b>{s.rad.surface.toFixed(0)} mSv</b> · {Math.round(s.rad.limitShare * 100)}% {t('mission.rad.limit')}</span></div>
              <p className="note">{t('mission.rad.note')}</p>
            </div>
          )}

          {i.kind !== 'rover' && (
            <div className="card">
              <div className="card-title">{t('mission.eva.title')} <ProvBadge kind="modeled" /></div>
              <div className="kv"><span className="k">{t('mission.eva.radius')}</span><span className="v"><b>{s.r.toFixed(1)} km</b></span></div>
              {s.mineralsInRange !== null && <div className="kv"><span className="k">{t('mission.eva.minerals')}</span><span className="v">{s.mineralsInRange}</span></div>}
              <div className="kv"><span className="k">{t('mission.eva.stops')}</span><span className="v">{s.stopsInRange}</span></div>
              <p className="note">{t('mission.eva.note')}</p>
            </div>
          )}

          <div className="card">
            <div className="card-title">{t('mission.ai.title')}</div>
            <button className="primary" disabled={m.aiStatus === 'running'} onClick={askAI}>{m.aiStatus === 'running' ? t('ai.gemini.running') : t('mission.ai.ask')}</button>
            {m.aiStatus === 'error' && <p className="err-box small">{t('mission.ai.error')} {m.aiError}</p>}
            {m.ai && (
              <div className="mission-ai">
                <div className={`verdict v-${m.ai.verdict}`}>{t(`mission.ai.v.${m.ai.verdict}`)}</div>
                <p className="small">{es ? m.ai.summary.es : m.ai.summary.en}</p>
                {m.ai.risks.length > 0 && <><div className="field-label">{t('mission.ai.risks')}</div><ul className="findings small">{m.ai.risks.map((r, k) => <li key={k}>{es ? r.es : r.en}</li>)}</ul></>}
                {m.ai.suggestions.length > 0 && <><div className="field-label">{t('mission.ai.suggestions')}</div><ul className="findings small">{m.ai.suggestions.map((r, k) => <li key={k}>{es ? r.es : r.en}</li>)}</ul></>}
                <p className="note">{m.ai.model} · {new Date(m.ai.at).toLocaleString(i18n.language)} · {t('mission.ai.note')}</p>
              </div>
            )}
          </div>

          <div className="actions">
            <button onClick={() => save('A')}>{t('mission.saveA')}</button>
            <button onClick={() => save('B')}>{t('mission.saveB')}</button>
          </div>
        </>
      )}

      {A && B && m.saved.A && m.saved.B && (
        <div className="card">
          <div className="card-title">{t('mission.compare')} <ProvBadge kind="derived" /></div>
          <table className="route-table">
            <thead><tr><th /><th>A · {m.saved.A.label}</th><th>B · {m.saved.B.label}</th></tr></thead>
            <tbody>
              {([
                [t('landing.check.elev'), (x: Site) => fmtM(x.h), (x: Site) => -x.h],
                [t('mission.pressure'), (x: Site) => `${Math.round(x.pressure)} Pa`, (x: Site) => x.pressure],
                [t('landing.check.slope'), (x: Site) => `${x.slope.toFixed(1)}°`, (x: Site) => -x.slope],
                [t('ice.icyCrater'), (x: Site) => (x.ice?.icyCrater ? km(x.ice.icyCrater.d) : '—'), (x: Site) => -(x.ice?.icyCrater?.d ?? 1e9)],
                [t('ice.glacier'), (x: Site) => (x.ice?.glacier ? km(x.ice.glacier.d) : '—'), (x: Site) => -(x.ice?.glacier?.d ?? 1e9)],
                [t('landing.check.minerals'), (x: Site) => String(x.minerals100 ?? '—'), (x: Site) => x.minerals100 ?? 0],
                [t('mission.dunes'), (x: Site) => (x.dune ? (x.dune.inside ? t('mission.insideDune') : km(x.dune.nearestM)) : '—'), (x: Site) => (x.dune?.inside ? -1 : x.dune?.nearestM ?? 0)],
                [t('mission.energy.surface', { tau: i.tau }), (x: Site) => `${Math.round(x.sun.surface)} W/m²`, (x: Site) => x.sun.surface],
                [t('mission.eva.minerals'), (x: Site) => String(x.mineralsInRange ?? '—'), (x: Site) => x.mineralsInRange ?? 0],
              ] as [string, (x: Site) => string, (x: Site) => number][]).map(([k, f, score]) => {
                const better = score(A) === score(B) ? null : score(A) > score(B) ? 'A' : 'B';
                return <tr key={k}><td className="k">{k}</td><td className={better === 'A' ? 'strong better' : ''}>{f(A)}</td><td className={better === 'B' ? 'strong better' : ''}>{f(B)}</td></tr>;
              })}
            </tbody>
          </table>
          <p className="note">{t('mission.compareNote')}</p>
        </div>
      )}
      <p className="note">{t('mission.sources')}</p>
    </div>
  );
}
