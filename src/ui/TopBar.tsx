import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { lmst, marsTime, missionSol, PERSEVERANCE, formatHours, seasonKey } from '../core/time/marsTime';
import { renderBridge } from '../render/bridge';
import { useUI } from '../state/uiStore';
import { getMarsOS } from '../api/MarsOS';
import { selectExplorer, useExplorers } from '../render/overlays/ExplorersLayer';

const SPEEDS = [1, 600, 3600, 8878] as const;

/** Places for the "Go to" menu (approximate centres, USGS Gazetteer of Planetary Nomenclature). */
export const DESTINATIONS = {
  planet: { lat: 5, lon: -40, distance: 14000, heading: 0, tilt: 0 },
  olympus: { lat: 18.65, lon: -133.8, distance: 1600, tilt: 35 },
  valles: { lat: -13.9, lon: -59.2, distance: 2600, tilt: 25 },
  hellas: { lat: -42.4, lon: 70.5, distance: 3000, tilt: 20 },
  northPole: { lat: 85, lon: 0, distance: 3500, tilt: 10 },
  southPole: { lat: -85, lon: 0, distance: 3500, tilt: 10 },
  jezero: { lat: 18.4082, lon: 77.6873, distance: 160 },
  gale: { lat: -5.4, lon: 137.8, distance: 260 },
  hirise: { lat: 18.488, lon: 77.403, distance: 22 },
  landing: { lat: 18.4446, lon: 77.4509, distance: 1.4, tilt: 62 },
} as const;
const PLACES = ['planet', 'olympus', 'valles', 'hellas', 'northPole', 'southPole', 'jezero', 'gale'] as const;

/**
 * Ground view adapted to the imagery that exists at the target: walking height only where
 * HiRISE (25 cm) exists; a low flyover where only CTX (6 m) or global mosaics (~232 m) exist —
 * so the view never magnifies coarse data into a blur.
 */
export function groundViewFor(lat: number, lon: number) {
  const os = getMarsOS();
  const inside = (id: string) => {
    const l = os.catalog.layer(id);
    if (!l) return false;
    const b = l.coverage.bbox;
    return lat >= b.south && lat <= b.north && lon >= b.west && lon <= b.east;
  };
  if (inside('layer.jezero.hirise')) return { lat, lon, distance: 0.06, tilt: 80 };
  if (inside('layer.jezero.ctx')) return { lat, lon, distance: 1.2, tilt: 74 };
  return { lat, lon, distance: 14, tilt: 70 };
}

export function TopBar({ onAbout, onTour }: { onAbout: () => void; onTour: () => void }) {
  const { t, i18n } = useTranslation();
  const time = useUI((s) => s.time);
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const cam = useUI((s) => s.camera);
  const hud = useUI((s) => s.hud);
  const [open, setOpen] = useState(false);
  const explorers = useExplorers();
  const mt = marsTime(new Date(time.epochMs));
  const sol = missionSol(mt, PERSEVERANCE.landingUTC, PERSEVERANCE.lonEast);
  const hemi = cam.lat >= 0 ? 'north' : 'south';
  const date = new Date(time.epochMs);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" aria-hidden>
          <svg viewBox="0 0 32 32" width="26" height="26"><circle cx="16" cy="16" r="11" fill="url(#g)" /><ellipse cx="16" cy="16" rx="15" ry="5" fill="none" stroke="#ffb27a" strokeOpacity=".6" transform="rotate(-20 16 16)" /><defs><radialGradient id="g" cx=".35" cy=".35"><stop offset="0" stopColor="#f7a26b" /><stop offset="1" stopColor="#8a2f12" /></radialGradient></defs></svg>
        </span>
        <div>
          <strong>{t('app.title')}</strong>
          <small>{t('app.tagline')}</small>
        </div>
      </div>

      <select
        className="dest-menu"
        aria-label={t('nav.goTo')}
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v.startsWith('x:')) selectExplorer(v.slice(2));
          else if (v) fly(DESTINATIONS[v as keyof typeof DESTINATIONS]);
        }}
      >
        <option value="">{t('nav.goTo')} ▾</option>
        <optgroup label={t('nav.groupPlaces')}>
          {PLACES.map((k) => <option key={k} value={k}>{t(`nav.${k}`)}</option>)}
        </optgroup>
        <optgroup label={t('nav.groupExplorers')}>
          {[...explorers.list].sort((a, b) => a.landed.localeCompare(b.landed)).map((e) => <option key={e.id} value={`x:${e.id}`}>{e.name} ({e.landed.slice(0, 4)})</option>)}
        </optgroup>
      </select>
      <button className={`hud-btn ${hud ? 'on' : ''}`} aria-pressed={hud} title={t('hud2.toggleHint')} onClick={() => set({ hud: !hud, panelsOpen: hud ? { left: true, right: true } : { left: false, right: false } })}>{t('hud2.toggle')}</button>
      <button className="accent ground-btn" title={t('nav.groundHint')} onClick={() => fly(groundViewFor(cam.lat, cam.lon))}>{t('nav.ground')}</button>

      <div className="clock">
        <button className="clock-main" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="mono">{date.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
          <span className="sep">·</span>
          <span className="sol">MSD <b>{Math.floor(mt.msd).toLocaleString()}</b></span>
          <span className="sep">·</span>
          <span className="ls">Ls <b>{mt.ls.toFixed(1)}°</b></span>
          <span className="sep ls">·</span>
          <span className="season">{t(`time.seasons.${seasonKey(mt.ls, cam.lat)}`)} ({t(`time.${hemi}`)})</span>
        </button>
        <button className="icon" title={time.playing ? t('time.pause') : t('time.play')} onClick={() => set({ time: { ...time, playing: !time.playing } })}>
          {time.playing ? '❚❚' : '▶'}
        </button>
        <select aria-label={t('time.speed')} value={time.speed} onChange={(e) => set({ time: { ...time, speed: +e.target.value } })}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{t(`time.speeds.${s}`)}</option>
          ))}
        </select>
        {open && (
          <div className="popover clock-pop">
            <div className="kv"><span className="k">{t('time.msd')}</span><span className="v mono">{mt.msd.toFixed(4)}</span></div>
            <div className="kv"><span className="k">{t('time.mtc')}</span><span className="v mono">{formatHours(mt.mtc)}</span></div>
            <div className="kv"><span className="k">{t('time.my')}</span><span className="v mono">{mt.marsYear}</span></div>
            <div className="kv"><span className="k">{t('time.ls')}</span><span className="v mono">{mt.ls.toFixed(3)}°</span></div>
            <div className="kv"><span className="k">{t('time.sol')}</span><span className="v mono">{sol}</span></div>
            <div className="kv"><span className="k">LMST Jezero</span><span className="v mono">{formatHours(lmst(mt, PERSEVERANCE.lonEast))}</span></div>
            <input type="datetime-local" value={date.toISOString().slice(0, 16)} onChange={(e) => {
              const ms = Date.parse(e.target.value + 'Z');
              if (!isNaN(ms)) { renderBridge.clock.epochMs = ms; set({ time: { ...time, epochMs: ms } }); }
            }} />
            <button onClick={() => { renderBridge.clock.epochMs = Date.now(); set({ time: { ...time, epochMs: Date.now(), speed: 1 } }); }}>{t('time.now')}</button>
            <small className="muted">Mars24 — Allison &amp; McEwen (2000)</small>
          </div>
        )}
      </div>

      <div className="top-right">
        <select aria-label={t('lang.label')} value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
        <button onClick={onTour} title={t('tour.label')}>{t('tour.button')}</button>
        <button className="icon" onClick={onAbout} title={t('app.about')}>?</button>
      </div>
    </header>
  );
}
