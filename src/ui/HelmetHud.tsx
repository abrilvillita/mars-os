/**
 * Helmet visor HUD (training view, inspired by the challenge's "heads-up display projected on
 * the spacesuit helmet visor"). Everything shown is computed from MARS OS data:
 *  - compass tape and heading, position, elevation and true slope under the camera target
 *  - local true solar time, Sun elevation and daylight left (Mars24)
 *  - route guidance along the compared low-slope route: distance to go, bearing to the next
 *    guide point, steep-section warnings ahead, data-resolution reminder
 * "Walk the route" moves the camera along the route in first person (accelerated time).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import { DEG, M_PER_DEG, distanceM, formatLat, formatLon } from '../core/geo/mars';
import { daylightAt } from '../core/time/daylight';
import { formatHours, marsTime } from '../core/time/marsTime';
import { renderBridge } from '../render/bridge';
import { useRoutes } from '../state/routeStore';
import { useUI } from '../state/uiStore';
import { fmtM } from './common';
import { RoverMemories } from './RoverMemories';

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / DEG) + 360) % 360;
}

const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const WALK_SPEED_MS = 1.0; // real walking pace basis (m/s); playback is accelerated
const PLAYBACK = 25;

export function HelmetHud() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const on = useUI((s) => s.hud);
  const cam = useUI((s) => s.camera);
  const epochMs = useUI((s) => s.time.epochMs);
  const result = useRoutes((s) => s.result);
  const caution = useRoutes((s) => s.assumptions.cautionSlopeDeg);
  const [walking, setWalking] = useState(false);
  const walkS = useRef(0);

  const route = result?.ok ? result.routes.find((r) => r.kind === 'lowSlope') ?? null : null;
  const arc = useMemo(() => {
    if (!route) return null;
    const s = [0];
    for (let i = 1; i < route.points.length; i++) s.push(s[i - 1] + distanceM(route.points[i - 1].lat, route.points[i - 1].lon, route.points[i].lat, route.points[i].lon));
    return s;
  }, [route]);

  // ?walk=1 starts the first-person walk automatically once a route exists (demo / kiosk)
  const autoWalk = useRef(new URLSearchParams(window.location.search).get('walk') === '1');
  useEffect(() => {
    if (autoWalk.current && route && on) {
      autoWalk.current = false;
      walkS.current = 0;
      setWalking(true);
    }
  }, [route, on]);

  // hide the mouse-controls hint while the visor is shown
  useEffect(() => {
    document.body.classList.toggle('visor-on', on);
    return () => document.body.classList.remove('visor-on');
  }, [on]);

  // first-person walk along the route
  useEffect(() => {
    if (!walking || !route || !arc) return;
    let raf = 0, last = performance.now();
    const total = arc[arc.length - 1];
    const step = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      walkS.current = Math.min(total, walkS.current + WALK_SPEED_MS * PLAYBACK * dt);
      let i = arc.findIndex((v) => v >= walkS.current);
      if (i <= 0) i = 1;
      const a = route.points[i - 1], b = route.points[i];
      const f = (walkS.current - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
      const lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f;
      const ahead = route.points[Math.min(route.points.length - 1, i + 4)];
      const target = bearingDeg(lat, lon, ahead.lat, ahead.lon);
      const rig = renderBridge.rig;
      let dh = target - rig.heading;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      Object.assign(rig, { lat, lon, distance: 0.025, tilt: 82, heading: (rig.heading + dh * Math.min(1, dt * 3) + 360) % 360 });
      if (walkS.current >= total) setWalking(false);
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [walking, route, arc]);

  if (!on) return null;

  // under-foot values (true slope, no exaggeration)
  const lat = cam.lat, lon = cam.lon;
  const h0 = os.terrainModel.height(lat, lon, 20);
  const dLat = 20 / M_PER_DEG, dLon = 20 / (M_PER_DEG * Math.cos(lat * DEG));
  const gx = (os.terrainModel.height(lat, lon + dLon, 20) - os.terrainModel.height(lat, lon - dLon, 20)) / 40;
  const gy = (os.terrainModel.height(lat + dLat, lon, 20) - os.terrainModel.height(lat - dLat, lon, 20)) / 40;
  const slope = Math.atan(Math.hypot(gx, gy)) / DEG;
  const res = os.terrain.resolutionAt(lat, lon).metersPerPixel;
  const day = daylightAt(marsTime(new Date(epochMs)), lat, lon);

  // route guidance
  let guide: null | { toGo: number; rel: number; dist: number; steepIn: number | null; steepDeg: number } = null;
  if (route && arc) {
    let best = 0, bestD = Infinity;
    route.points.forEach((p, i) => {
      const d = distanceM(lat, lon, p.lat, p.lon);
      if (d < bestD) { bestD = d; best = i; }
    });
    const nextIdx = arc.findIndex((v) => v >= arc[best] + 120);
    const next = route.points[nextIdx < 0 ? route.points.length - 1 : nextIdx];
    const rel = ((bearingDeg(lat, lon, next.lat, next.lon) - cam.heading + 540) % 360) - 180;
    let steepIn: number | null = null, steepDeg = 0;
    for (let i = best + 1; i < route.points.length && arc[i] - arc[best] < 300; i++) {
      if (route.points[i].slopeDeg > caution) { steepIn = arc[i] - arc[best]; steepDeg = route.points[i].slopeDeg; break; }
    }
    guide = { toGo: arc[arc.length - 1] - arc[best], rel, dist: distanceM(lat, lon, next.lat, next.lon), steepIn, steepDeg };
  }

  // compass tape: ticks every 15° within ±60° of heading
  const ticks = [];
  for (let a = -60; a <= 60; a += 15) {
    const deg = Math.round((cam.heading + a + 360) % 360 / 15) * 15 % 360;
    const off = ((deg - cam.heading + 540) % 360) - 180;
    ticks.push({ off, label: deg % 45 === 0 ? CARD[deg / 45] : String(deg) });
  }

  return (
    <div className="hud-visor" aria-label="Helmet HUD">
      <div className="hv-tape">
        {ticks.map((k, i) => (
          <span key={i} style={{ left: `${50 + (k.off / 60) * 45}%` }} className={CARD.includes(k.label) ? 'card' : ''}>{k.label}</span>
        ))}
        <span className="hv-caret">▼ {Math.round(cam.heading)}°</span>
      </div>
      <div className="hv-reticle" />
      {guide && (
        <div className="hv-guide" style={{ transform: `translate(-50%, 0) rotate(${guide.rel}deg)` }}>
          <div className="hv-arrow">▲</div>
        </div>
      )}
      <div className="hv-left">
        <div className="mono">{formatLat(lat, 5)} {formatLon(lon, 5)}</div>
        <div>{t('hud2.elev')} <b>{fmtM(h0)}</b> · {t('hud2.slope')} <b className={slope > caution ? 'warn' : ''}>{slope.toFixed(1)}°</b></div>
        <div>{t('hud2.lts')} <b className="mono">{formatHours(day.ltstH)}</b> · {t('hud2.sun')} <b>{day.sunElevDeg.toFixed(0)}°</b></div>
        <div>{day.isDay ? t('hud2.daylight', { h: day.remainingEarthH.toFixed(1) }) : t('hud2.night')}</div>
        <div className="muted">{t('hud2.data', { res: fmtM(res) })}</div>
      </div>
      <div className="hv-right">
        {guide ? (
          <>
            <div className="hv-title">{t('hud2.route')}</div>
            <div>{t('hud2.toGo')} <b>{fmtM(guide.toGo)}</b></div>
            <div>{t('hud2.next', { d: fmtM(guide.dist) })} {Math.abs(guide.rel) < 10 ? '⬆' : guide.rel > 0 ? '↗' : '↖'} {Math.abs(Math.round(guide.rel))}°</div>
            {guide.steepIn !== null && <div className="warn">⚠ {t('hud2.steep', { deg: guide.steepDeg.toFixed(0), d: fmtM(guide.steepIn) })}</div>}
            <button className={walking ? 'on' : ''} onClick={() => { if (!walking && guide && guide.toGo < 5) walkS.current = 0; setWalking(!walking); }}>
              {walking ? t('hud2.pause') : t('hud2.walk')}
            </button>
            {!walking && <button onClick={() => { walkS.current = 0; setWalking(true); }}>{t('hud2.restart')}</button>}
          </>
        ) : (
          <div className="muted">{t('hud2.noRoute')}</div>
        )}
      </div>
      <RoverMemories />
      <div className="hv-badge">{t('hud2.badge')}</div>
    </div>
  );
}
