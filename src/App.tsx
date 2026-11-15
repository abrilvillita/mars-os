import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from './api/MarsOS';
import { MarsScene } from './render/MarsScene';
import { renderBridge } from './render/bridge';
import { Hud } from './ui/Hud';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { TopBar } from './ui/TopBar';
import './ui/styles.css';
import { FeatureStatus } from './ui/FeatureStatus';
import { RouteController } from './ui/RouteController';
import { HelmetHud } from './ui/HelmetHud';
import { Tour, useTour } from './ui/Tour';
import { DEMO_MODE } from './state/mode';
import { API_BASE } from './api/apiBase';
import { applyDeepLink } from './state/deepLink';

const CATALOGS = ['data/catalog/jezero.catalog.json'];


export default function App() {
  const { t } = useTranslation();
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [about, setAbout] = useState(false);
  const tour = useTour();
  // panels start right below the top bar, whatever its real height (zoom, fonts, language)
  const appRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = appRef.current;
    const bar = el?.querySelector('.topbar');
    if (!el || !bar) return;
    const update = () => el.style.setProperty('--top-offset', `${Math.round(bar.getBoundingClientRect().bottom + 8)}px`);
    const ro = new ResizeObserver(update);
    ro.observe(bar);
    window.addEventListener('resize', update);
    update();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [state]);

  const start = () => {
    setState('loading');
    getMarsOS()
      .init({ baseUrl: import.meta.env.BASE_URL, catalogs: CATALOGS, mode: DEMO_MODE ? 'demo' : 'production', serviceBaseUrl: API_BASE })
      .then(() => setState('ready'))
      .catch((e: Error) => {
        setError(e.message);
        setState('error');
      });
  };
  useEffect(() => {
    if (!getMarsOS().ready) start();
    else setState('ready');
    // opening shot: whole planet, Jezero facing the viewer
    Object.assign(renderBridge.rig, { lat: 18.4, lon: 77.5, distance: 14000, heading: 0, tilt: 0 });
    applyDeepLink(); // shareable views (?lat=&lon=&dist=&tilt=&pin=…)
  }, []);

  if (state === 'error') {
    return (
      <div className="splash">
        <h1>{t('loading.error')}</h1>
        <pre>{error}</pre>
        <button onClick={start}>{t('loading.retry')}</button>
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="splash">
        <div className="spinner" />
        <h1>MARS OS</h1>
        <p>{t('loading.catalog')}</p>
        <p className="muted">{t('loading.elevation')}</p>
      </div>
    );
  }
  return (
    <div className={`app ${DEMO_MODE ? 'demo' : ''}`} ref={appRef}>
      {DEMO_MODE && (
        <div className="demo-banner" role="status">
          {t('demo.banner')} <a href={window.location.pathname}>{t('demo.exit')}</a>
        </div>
      )}
      <MarsScene />
      <RouteController />
      <HelmetHud />
      <TopBar onAbout={() => setAbout(true)} onTour={() => tour.setOpen(true)} />
      {tour.open && <Tour onClose={() => tour.setOpen(false)} />}
      <LeftPanel />
      <RightPanel />
      <Hud />
      {about && (
        <div className="modal" onClick={() => setAbout(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>MARS OS</h2>
            <p>{t('app.aboutText')}</p>
            <FeatureStatus />
            <p className="small muted">NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map</p>
            {!DEMO_MODE && <p className="small"><a href="?demo">{t('demo.enter')}</a></p>}
            <button onClick={() => setAbout(false)}>{t('common.close')}</button>
          </div>
        </div>
      )}
    </div>
  );
}
