/**
 * "Perseverance was here": while you move on the ground (HUD or route walk), shows the raw
 * photos the rover took at the nearest stop of its real traverse, when one is within reach.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { distanceM } from '../core/geo/mars';
import { fetchRawImages, type RawImage, type Waypoint } from '../core/live/m20';
import { ensureRoverData, roverData } from '../render/overlays/RoverLayer';
import { useUI } from '../state/uiStore';
import { fmtM } from './common';

const REACH_M = 150;

export function RoverMemories() {
  const { t } = useTranslation();
  const cam = useUI((s) => s.camera);
  const [near, setNear] = useState<{ w: Waypoint; d: number } | null>(null);
  const [imgs, setImgs] = useState<RawImage[] | null>(null);

  useEffect(() => {
    ensureRoverData();
  }, []);

  // nearest stop within reach (cheap: ~700 stops, only near Jezero)
  useEffect(() => {
    if (cam.distance > 3 || Math.abs(cam.lat - 18.45) > 0.6 || Math.abs(cam.lon - 77.4) > 0.6) return setNear(null);
    let best: { w: Waypoint; d: number } | null = null;
    for (const w of roverData.waypoints) {
      if (Math.abs(w.lat - cam.lat) > 0.01 || Math.abs(w.lon - cam.lon) > 0.01) continue;
      const d = distanceM(cam.lat, cam.lon, w.lat, w.lon);
      if (d <= REACH_M && (!best || d < best.d)) best = { w, d };
    }
    setNear((prev) => (prev?.w.rmc === best?.w.rmc ? (best ? { ...prev!, d: best.d } : null) : best));
  }, [cam.lat, cam.lon, cam.distance]);

  const rmc = near?.w.rmc;
  useEffect(() => {
    setImgs(null);
    if (!near) return;
    let alive = true;
    const id = setTimeout(() => fetchRawImages(near.w.sol, 4).then((r) => alive && setImgs(r)).catch(() => alive && setImgs([])), 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [rmc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!near) return null;
  return (
    <div className="rover-memories">
      <div className="rm-title">📸 {t('memories.title', { sol: near.w.sol, d: fmtM(near.d) })}</div>
      <div className="rm-strip">
        {!imgs && <span className="muted small">{t('photos.loading')}</span>}
        {imgs?.map((im) => (
          <button key={im.id} title={`${im.instrument} · ${im.takenUtc}`} onClick={() => useUI.getState().set({ waypoint: { sol: near.w.sol, rmc: near.w.rmc, lat: near.w.lat, lon: near.w.lon }, sampleN: null, rightTab: 'photos', panelsOpen: { ...useUI.getState().panelsOpen, right: true } })}>
            <img src={im.small} alt={im.instrument} loading="lazy" />
          </button>
        ))}
      </div>
      <div className="rm-note">{t('memories.note')}</div>
    </div>
  );
}
