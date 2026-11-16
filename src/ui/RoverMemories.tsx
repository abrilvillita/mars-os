/**
 * "Perseverance was here": while you move on the ground (HUD or route walk), shows the raw
 * photos the rover took at the nearest stop of its real traverse, when one is within reach.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { distanceM } from '../core/geo/mars';
import { fetchRawImages, type RawImage } from '../core/live/m20';
import { fetchMslImages } from '../core/live/msl';
import { ensureExplorers, explorersState } from '../core/live/explorers';
import { expeditions, loadExpeditions, type ExpeditionStop } from '../core/live/expeditions';
import { ensureRoverData, roverData } from '../render/overlays/RoverLayer';
import { useUI } from '../state/uiStore';
import { fmtM } from './common';

const REACH_M = 150;
type Stop = { mission: 'm20' | 'msl'; sol: number; rmc: string; lat: number; lon: number };

export function RoverMemories() {
  const { t } = useTranslation();
  const cam = useUI((s) => s.camera);
  const [near, setNear] = useState<{ w: Stop; d: number } | null>(null);
  const [imgs, setImgs] = useState<RawImage[] | null>(null);

  useEffect(() => {
    ensureRoverData();
    ensureExplorers(import.meta.env.BASE_URL);
  }, []);

  // nearest stop within reach (cheap: ~700 stops, only near Jezero)
  useEffect(() => {
    if (cam.distance > 3) return setNear(null);
    const atJezero = Math.abs(cam.lat - 18.45) < 0.6 && Math.abs(cam.lon - 77.4) < 0.6;
    const atGale = Math.abs(cam.lat + 4.7) < 0.8 && Math.abs(cam.lon - 137.4) < 0.8;
    if (!atJezero && !atGale) return setNear(null);
    const list: Stop[] = atJezero ? roverData.waypoints.map((w) => ({ mission: 'm20' as const, sol: w.sol, rmc: w.rmc, lat: w.lat, lon: w.lon })) : (explorersState.msl?.stops ?? []).map((w) => ({ mission: 'msl' as const, ...w }));
    let best: { w: Stop; d: number } | null = null;
    for (const w of list) {
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
    const id = setTimeout(() => (near.w.mission === 'msl' ? fetchMslImages(near.w.sol, 4) : fetchRawImages(near.w.sol, 4)).then((r) => alive && setImgs(r)).catch(() => alive && setImgs([])), 400);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [rmc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!near) return null;
  return (
    <div className="rover-memories">
      <div className="rm-title">{t('memories.title', { rover: near.w.mission === 'msl' ? 'Curiosity' : 'Perseverance', sol: near.w.sol, d: fmtM(near.d) })}</div>
      <div className="rm-strip">
        {!imgs && <span className="muted small">{t('photos.loading')}</span>}
        {imgs?.map((im) => (
          <button key={im.id} title={`${im.instrument} · ${im.takenUtc}`} onClick={() => useUI.getState().set({ waypoint: { mission: near.w.mission, sol: near.w.sol, rmc: near.w.rmc, lat: near.w.lat, lon: near.w.lon }, sampleN: null, rightTab: 'photos', panelsOpen: { ...useUI.getState().panelsOpen, right: true } })}>
            <img src={im.small} alt={im.instrument} loading="lazy" />
          </button>
        ))}
      </div>
      <div className="rm-note">{t('memories.note')}</div>
    </div>
  );
}

/**
 * "{Rover} was here" for every mission: near a named expedition stop (NASA Mars Trek) shows its
 * NASA image and description; along Spirit's and Opportunity's traverses says which rover drove here.
 */
export function ExpeditionMemory() {
  const { t } = useTranslation();
  const cam = useUI((s) => s.camera);
  const [, setRev] = useState(0);
  useEffect(() => {
    loadExpeditions(import.meta.env.BASE_URL).then(() => setRev((r) => r + 1));
    ensureExplorers(import.meta.env.BASE_URL);
  }, []);
  if (cam.distance > 20) return null;
  let stop: { s: ExpeditionStop; d: number } | null = null;
  for (const s of expeditions.doc?.stops ?? []) {
    if (!s.text || Math.abs(s.lat - cam.lat) > 0.02 || Math.abs(s.lon - cam.lon) > 0.02) continue;
    const d = distanceM(cam.lat, cam.lon, s.lat, s.lon);
    if (d <= 400 && (!stop || d < stop.d)) stop = { s, d };
  }
  let drove: string | null = null;
  for (const [id, p] of Object.entries(explorersState.paths)) {
    for (const q of p.points) {
      if (Math.abs(q.lat - cam.lat) > 0.002 || Math.abs(q.lon - cam.lon) > 0.002) continue;
      if (distanceM(cam.lat, cam.lon, q.lat, q.lon) < 60) { drove = explorersState.list.find((e) => e.id === id)?.name ?? id; break; }
    }
    if (drove) break;
  }
  if (!stop && !drove) return null;
  const mission = stop ? explorersState.list.find((e) => e.id === stop!.s.mission)?.name ?? stop.s.mission : drove;
  return (
    <div className="rover-memories exp-memory">
      <div className="rm-title">{stop ? t('memories.stop', { rover: mission, name: stop.s.name, d: fmtM(stop.d) }) : t('memories.drove', { rover: drove })}</div>
      {stop && (
        <div className="exp-row">
          {stop.s.image && <img src={stop.s.image} alt={stop.s.name} />}
          <p className="small">{stop.s.text!.slice(0, 260)}{stop.s.text!.length > 260 ? '…' : ''}</p>
        </div>
      )}
      <div className="rm-note">{t('memories.trekNote')}</div>
    </div>
  );
}
