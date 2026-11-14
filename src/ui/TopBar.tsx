import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '../i18n';
import { lmst, marsTime, missionSol, PERSEVERANCE, formatHours, seasonKey } from '../core/time/marsTime';
import { renderBridge } from '../render/bridge';
import { useUI } from '../state/uiStore';

const SPEEDS = [1, 600, 3600, 8878] as const;

export const DESTINATIONS = {
  planet: { lat: 18.4, lon: 77.5, distance: 14000, heading: 0, tilt: 0 },
  jezero: { lat: 18.4082, lon: 77.6873, distance: 160 },
  hirise: { lat: 18.488, lon: 77.403, distance: 22 },
  landing: { lat: 18.4446, lon: 77.4509, distance: 1.4, tilt: 62 },
} as const;

export function TopBar({ onAbout }: { onAbout: () => void }) {
  const { t, i18n } = useTranslation();
  const time = useUI((s) => s.time);
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const cam = useUI((s) => s.camera);
  const [open, setOpen] = useState(false);
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

      <nav className="destinations" aria-label={t('nav.goTo')}>
        {(['planet', 'jezero', 'hirise', 'landing'] as const).map((k) => (
          <button key={k} onClick={() => fly(DESTINATIONS[k])}>{t(`nav.${k}`)}</button>
        ))}
        <button className="accent" onClick={() => fly({ lat: cam.lat, lon: cam.lon, distance: 0.03, tilt: 84 })}>{t('nav.ground')}</button>
      </nav>

      <div className="clock">
        <button className="clock-main" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="mono">{date.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
          <span className="sep">·</span>
          <span>{t('time.sol')} <b>{sol}</b></span>
          <span className="sep">·</span>
          <span>Ls <b>{mt.ls.toFixed(1)}°</b></span>
          <span className="sep">·</span>
          <span>{t(`time.seasons.${seasonKey(mt.ls, cam.lat)}`)} ({t(`time.${hemi}`)})</span>
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
        <button className="icon" onClick={onAbout} title={t('app.about')}>?</button>
      </div>
    </header>
  );
}
