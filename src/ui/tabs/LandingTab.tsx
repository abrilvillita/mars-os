/**
 * Landing: how landing sites are chosen, real landing ellipses, NASA's candidate Exploration
 * Zones for human missions, and a factual "landing site check" for the pinned point
 * (elevation, slope, nearest ice, minerals, nearest robot). No verdict: the numbers and sources.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { DEG, M_PER_DEG, distanceM, formatLat, formatLon } from '../../core/geo/mars';
import { expeditions, loadExpeditions, type LandingEllipse } from '../../core/live/expeditions';
import { currentPosition, explorersState } from '../../core/live/explorers';
import { ensureIce, iceData, nearestIce } from '../../core/live/ice';
import { ensureMinerals, mineralData, mineralsNear } from '../../core/live/minerals';
import { m20Last, useExplorers } from '../../render/overlays/ExplorersLayer';
import { EZ_RADIUS_KM, selectZone } from '../../render/overlays/ZonesLayer';
import { useUI } from '../../state/uiStore';
import { useMission } from '../../state/missionStore';
import { ProvBadge, fmtM } from '../common';

const km = (m: number) => (m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString()} km`);

/** Major/minor axes and area of an ellipse polygon, in a local plane (km). */
function ellipseSize(e: LandingEllipse) {
  const lat0 = e.ring.reduce((a, p) => a + p[1], 0) / e.ring.length;
  const lon0 = e.ring.reduce((a, p) => a + p[0], 0) / e.ring.length;
  const xy = e.ring.map(([lon, lat]) => [((lon - lon0) * M_PER_DEG * Math.cos(lat0 * DEG)) / 1000, ((lat - lat0) * M_PER_DEG) / 1000]);
  let major = 0;
  for (let i = 0; i < xy.length; i += 4) for (let j = i + 1; j < xy.length; j += 4) major = Math.max(major, Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]));
  let area = 0;
  for (let i = 0; i < xy.length - 1; i++) area += xy[i][0] * xy[i + 1][1] - xy[i + 1][0] * xy[i][1];
  area = Math.abs(area) / 2;
  const minor = (4 * area) / (Math.PI * major);
  return { major, minor, area, lat: lat0, lon: lon0 };
}

/** Factual landing-site check for a point. */
function SiteCheck({ lat, lon, title }: { lat: number; lon: number; title: string }) {
  const { t } = useTranslation();
  const os = getMarsOS();
  const [, setRev] = useState(0);
  useEffect(() => {
    Promise.all([ensureIce(), ensureMinerals()]).then(() => setRev((r) => r + 1));
  }, []);
  const h = os.elevationService.height(lat, lon, 500);
  const d = 2500; // slope over ±2.5 km from the global elevation model
  const dLat = d / M_PER_DEG, dLon = d / (M_PER_DEG * Math.cos(lat * DEG));
  const gx = (os.elevationService.height(lat, lon + dLon, 500) - os.elevationService.height(lat, lon - dLon, 500)) / (2 * d);
  const gy = (os.elevationService.height(lat + dLat, lon, 500) - os.elevationService.height(lat - dLat, lon, 500)) / (2 * d);
  const slope = Math.atan(Math.hypot(gx, gy)) / DEG;
  const res = os.terrain.resolutionAt(lat, lon).metersPerPixel;
  const ice = iceData.points ? nearestIce(lat, lon) : null;
  const minerals = mineralData.points ? mineralsNear(mineralData.points, lat, lon, 100_000).length : null;
  const last = m20Last();
  const robots = explorersState.list.map((e) => ({ e, d: (() => { const p = currentPosition(e, last); return distanceM(lat, lon, p.lat, p.lon); })() })).sort((a, b) => a.d - b.d);
  const zones = expeditions.doc?.zones.map((z, i) => ({ z, i, d: distanceM(lat, lon, z.lat, z.lon) })).sort((a, b) => a.d - b.d) ?? [];
  return (
    <div className="card">
      <div className="card-title">{title} <ProvBadge kind="derived" /></div>
      <div className="mono small">{formatLat(lat, 3)} {formatLon(lon, 3)}</div>
      <div className="kv"><span className="k">{t('landing.check.elev')}</span><span className="v"><b>{fmtM(h)}</b> <span className="muted small">{t('landing.check.elevWhy')}</span></span></div>
      <div className="kv"><span className="k">{t('landing.check.lat')}</span><span className="v">{Math.abs(lat).toFixed(1)}° {lat >= 0 ? 'N' : 'S'} <span className="muted small">{t('landing.check.latWhy')}</span></span></div>
      <div className="kv"><span className="k">{t('landing.check.slope')}</span><span className="v">{slope.toFixed(1)}° <span className="muted small">{t('landing.check.slopeWhy', { res: fmtM(res) })}</span></span></div>
      {ice && ice.icyCrater && <div className="kv"><span className="k">{t('ice.icyCrater')}</span><span className="v">{km(ice.icyCrater.d)}</span></div>}
      {ice && ice.glacier && <div className="kv"><span className="k">{t('ice.glacier')}</span><span className="v">{km(ice.glacier.d)}</span></div>}
      {minerals !== null && <div className="kv"><span className="k">{t('landing.check.minerals')}</span><span className="v">{minerals}</span></div>}
      {robots[0] && <div className="kv"><span className="k">{t('landing.check.robot')}</span><span className="v">{robots[0].e.name} · {km(robots[0].d)}</span></div>}
      {zones[0] && <div className="kv"><span className="k">{t('landing.check.zone')}</span><span className="v"><button className="link" onClick={() => selectZone(zones[0].i)}>{zones[0].z.name}</button> · {km(zones[0].d)}</span></div>}
      <p className="note">{t('landing.check.note')}</p>
    </div>
  );
}

export function LandingTab() {
  const { t } = useTranslation();
  useExplorers();
  const [, setRev] = useState(0);
  const pick = useUI((s) => s.pick);
  const zoneIdx = useUI((s) => s.zoneIdx);
  const on = useUI((s) => s.vectors.zones);
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  useEffect(() => {
    loadExpeditions(import.meta.env.BASE_URL).then(() => setRev((r) => r + 1));
  }, []);
  const doc = expeditions.doc;
  const zone = zoneIdx !== null ? doc?.zones[zoneIdx] ?? null : null;

  return (
    <div className="landing">
      {!on && <button onClick={() => set({ vectors: { ...useUI.getState().vectors, zones: true } })}>{t('landing.showOnMap')}</button>}
      {zone && (
        <>
          <SiteCheck lat={zone.lat} lon={zone.lon} title={zone.name} />
          <div className="actions">
            <button className="primary" onClick={() => fly({ lat: zone.lat, lon: zone.lon, distance: 900, tilt: 20 })}>{t('explorers.fly')}</button>
            <button onClick={() => { useMission.getState().set({ site: { lat: zone.lat, lon: zone.lon }, inputs: { ...useMission.getState().inputs, kind: 'base' }, ai: null }); set({ rightTab: 'mission' }); }}>{t('landing.planBase')}</button>
            <button onClick={() => set({ zoneIdx: null })}>{t('landing.allZones')}</button>
          </div>
        </>
      )}
      {!zone && pick && <SiteCheck lat={pick.lat} lon={pick.lon} title={t('landing.check.pinned')} />}
      {!zone && !pick && <p className="small muted">{t('landing.pinHint')}</p>}

      <details className="card" open={!zone}>
        <summary>{t('landing.how.title')}</summary>
        <ol className="findings small">
          {(['elev', 'lat', 'ellipse', 'surface', 'science', 'resources'] as const).map((k) => <li key={k}><b>{t(`landing.how.${k}.t`)}</b> {t(`landing.how.${k}.d`)}</li>)}
        </ol>
      </details>

      {doc && (
        <div className="card">
          <div className="card-title">{t('landing.ellipses')} <ProvBadge kind="measured" /></div>
          {doc.ellipses.map((e, i) => {
            const z = ellipseSize(e);
            return (
              <div key={i} className="kv">
                <span className="k">{e.mission === 'perseverance' ? 'Perseverance (2021)' : 'InSight (2018)'}</span>
                <span className="v">≈ {z.major.toFixed(1)} × {z.minor.toFixed(1)} km · {Math.round(z.area).toLocaleString()} km² <button className="link" onClick={() => { set({ vectors: { ...useUI.getState().vectors, zones: true } }); fly({ lat: z.lat, lon: z.lon, distance: Math.max(20, z.major * 2.2), tilt: 20 }); }}>{t('ice.go')}</button></span>
              </div>
            );
          })}
          <p className="note">{t('landing.ellipsesNote')}</p>
        </div>
      )}

      {doc && !zone && (
        <div className="card">
          <div className="card-title">{t('landing.zones', { n: doc.zones.length })}</div>
          <p className="small muted">{t('landing.zonesIntro', { r: EZ_RADIUS_KM })}</p>
          <div className="sol-chips">
            {doc.zones.map((z, i) => (
              <button key={i} className="chip" onClick={() => selectZone(i)} title={`${formatLat(z.lat, 1)} ${formatLon(z.lon, 1)}`}>{z.name}</button>
            ))}
          </div>
          <p className="note">{t('landing.zonesSource')}</p>
        </div>
      )}
    </div>
  );
}
