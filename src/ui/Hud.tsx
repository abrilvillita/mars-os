import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import { formatLat, formatLon } from '../core/geo/mars';
import { useUI } from '../state/uiStore';
import { fmtM } from './common';

/** Bottom HUD: position, altitude, compass, scale bar, simulated-content warning, attribution. */
export function Hud() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const cam = useUI((s) => s.camera);
  const storm = useUI((s) => s.env.dustStorm);
  const base = useUI((s) => s.baseLayerId);
  const overlays = useUI((s) => s.overlays);
  const vectors = useUI((s) => s.vectors);
  const [synthetic, setSynthetic] = useState(false);
  useEffect(() => {
    const check = () => {
      const ids = new Set(os.terrain.activePatches().map((p) => p.id));
      setSynthetic(os.proposals.list().some((p) => p.synthetic && (p.status === 'applied' && p.patches.some((x) => ids.has(x.id)))));
    };
    check();
    const a = os.on('history:changed', check);
    const b = os.on('proposals:changed', check);
    return () => { a(); b(); };
  }, [os]);

  // scale bar: meters represented by 100 px at the target (approx., view centre)
  const pxPerRad = window.innerHeight / (2 * Math.tan((45 * Math.PI) / 360));
  const m100 = (cam.distance * 1000 * 100) / pxPerRad;
  const nice = [1, 2, 5].flatMap((m) => [-1, 0, 1, 2, 3, 4, 5, 6].map((e) => m * 10 ** e)).sort((a, b) => a - b);
  const bar = nice.filter((n) => n <= m100).pop() ?? m100;
  const barPx = (bar / m100) * 100;

  const visible = [os.catalog.layer(base), ...Object.entries(overlays).filter(([, v]) => v.on).map(([id]) => os.catalog.layer(id)), os.catalog.layer('layer.elevation.mola.global'), vectors.traverse ? os.catalog.layer('layer.m20.traverse') : null]
    .filter(Boolean)
    .map((l) => l!.attribution);
  const attributions = [...new Set(visible)];

  return (
    <>
      <div className="hud">
        <div className="compass" title={t('hud.heading')} style={{ transform: `rotate(${-cam.heading}deg)` }}>
          <span>N</span>
        </div>
        <div className="hud-block mono">
          <div>{formatLat(cam.lat, 4)} {formatLon(cam.lon, 4)}</div>
          <div className="small">{t('hud.alt')} {fmtM(cam.altitudeKm * 1000)} · {t('hud.heading')} {cam.heading.toFixed(0)}° · {t('hud.tilt')} {cam.tilt.toFixed(0)}°</div>
        </div>
        <div className="scalebar" title={t('hud.scale')}>
          <div style={{ width: barPx }} />
          <span className="mono small">{fmtM(bar)}</span>
        </div>
        {(storm || synthetic) && <div className="sim-badge">{t('hud.simulated')}</div>}
      </div>
      <div className="controls-hint">{t('hud.controls')}</div>
      <footer className="attribution">
        <b>{t('attribution.prefix')}:</b> {attributions.join(' · ')}
      </footer>
    </>
  );
}
