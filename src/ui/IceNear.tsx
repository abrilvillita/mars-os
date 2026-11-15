/** Inspector section: nearest published water-ice evidence from the pinned location. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatLat, formatLon } from '../core/geo/mars';
import { ensureIce, iceData, nearestIce } from '../core/live/ice';
import { ICE_COLORS } from '../render/overlays/IceLayer';
import { useUI } from '../state/uiStore';
import { ProvBadge } from './common';

const km = (m: number) => (m < 10_000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 1000).toLocaleString()} km`);

export function IceNear({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useTranslation();
  const fly = useUI((s) => s.requestFlyTo);
  const set = useUI((s) => s.set);
  const [, setRev] = useState(0);
  useEffect(() => {
    ensureIce().then(() => setRev((r) => r + 1));
  }, []);
  if (iceData.error) return null;
  if (!iceData.points) return <div className="card small muted">{t('ice.loading')}</div>;
  const n = nearestIce(lat, lon);
  return (
    <div className="card">
      <div className="card-title">🧊 {t('ice.title')} <ProvBadge kind="derived" /></div>
      {(['icyCrater', 'glacier'] as const).map((k) => {
        const b = n[k];
        if (!b) return null;
        return (
          <div key={k} className="kv">
            <span className="k"><span className="swatch" style={{ background: ICE_COLORS[k] }} /> {t(`ice.${k}`)}</span>
            <span className="v">
              <b>{km(b.d)}</b>{' '}
              <button className="link" onClick={() => { set({ vectors: { ...useUI.getState().vectors, ice: true } }); fly({ lat: b.p.lat, lon: b.p.lon, distance: 60, tilt: 30 }); }} title={`${formatLat(b.p.lat, 2)} ${formatLon(b.p.lon, 2)}`}>
                {t('ice.go')}
              </button>
            </span>
          </div>
        );
      })}
      <p className="note">{t('ice.note')}</p>
    </div>
  );
}
