/**
 * "What is new on Mars": every time MARS OS opens it reads NASA's live rover feeds and compares
 * them with the last visit, then offers to send the newest rover position to Gemini. Gemini runs
 * only when a person asks (quota, and every proposal still needs human approval).
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cellId, tileAt } from '../core/geo/tiling';
import { formatLat, formatLon } from '../core/geo/mars';
import { ensureExplorers, explorersState } from '../core/live/explorers';
import { ensureRoverData, roverData } from '../render/overlays/RoverLayer';
import { m20Last } from '../render/overlays/ExplorersLayer';
import { useUI } from '../state/uiStore';
import { ProvBadge } from './common';

const KEY = 'marsos.watch.v1';
type Seen = { m20?: number; msl?: number; at?: string };

function readSeen(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function DataWatch() {
  const { t, i18n } = useTranslation();
  const [, setRev] = useState(0);
  const [seen] = useState<Seen>(readSeen);
  useEffect(() => {
    const l = () => setRev((r) => r + 1);
    roverData.listeners.add(l);
    explorersState.listeners.add(l);
    ensureRoverData();
    ensureExplorers(import.meta.env.BASE_URL);
    return () => {
      roverData.listeners.delete(l);
      explorersState.listeners.delete(l);
    };
  }, []);
  const m20 = m20Last();
  const msl = explorersState.msl?.last ?? null;
  useEffect(() => {
    if (!m20 || !msl) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ m20: m20.sol, msl: msl.sol, at: new Date().toISOString() }));
    } catch {
      /* ignore */
    }
  }, [m20?.sol, msl?.sol]); // eslint-disable-line react-hooks/exhaustive-deps

  const analyseAt = (lat: number, lon: number) => {
    const z = 14;
    const id = cellId(tileAt(lat, lon, z));
    const st = useUI.getState();
    st.set({ pick: { lat, lon, distanceKm: 0, cellId: id, cellZoom: z, pinnedAt: Date.now() }, selectedCellId: id, rightTab: 'ai', panelsOpen: { ...st.panelsOpen, right: true } });
    st.requestFlyTo({ lat, lon, distance: 1.5, tilt: 45 });
  };

  const row = (name: string, last: { lat: number; lon: number; sol: number } | null, before?: number) => {
    if (!last) return <div className="kv"><span className="k">{name}</span><span className="v muted">{t('photos.loading')}</span></div>;
    const fresh = before !== undefined && last.sol > before ? last.sol - before : 0;
    return (
      <div className="watch-row">
        <div className="kv">
          <span className="k">{name}</span>
          <span className="v">{t('watch.latest', { sol: last.sol })} {fresh > 0 ? <b className="new-tag">{t('watch.new', { n: fresh })}</b> : before !== undefined ? <span className="muted small">{t('watch.noNew')}</span> : null}</span>
        </div>
        <div className="row small">
          <span className="mono muted">{formatLat(last.lat, 4)} {formatLon(last.lon, 4)}</span>
          <button className="link" onClick={() => analyseAt(last.lat, last.lon)}>{t('watch.analyse')}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="card watch">
      <div className="card-title">{t('watch.title')} <ProvBadge kind="measured" /></div>
      <p className="small muted">{t('watch.intro')}{seen.at ? ` ${t('watch.lastVisit', { date: new Date(seen.at).toLocaleString(i18n.language) })}` : ''}</p>
      {row('Perseverance', m20, seen.m20)}
      {row('Curiosity', msl, seen.msl)}
      <p className="note">{t('watch.note')}</p>
    </div>
  );
}
