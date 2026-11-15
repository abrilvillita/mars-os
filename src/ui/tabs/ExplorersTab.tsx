/**
 * Mars explorers: every NASA robot that reached the surface, with a NASA photo, its story,
 * live odometry for active missions and distances between them; plus the orbiters whose data
 * MARS OS uses.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatLat, formatLon } from '../../core/geo/mars';
import { currentPosition, kmBetween, type Explorer } from '../../core/live/explorers';
import { KIND_ICON, m20Last, selectExplorer, useExplorers } from '../../render/overlays/ExplorersLayer';
import { useUI } from '../../state/uiStore';
import { ProvBadge } from '../common';

const ORBITERS: { id: string; name: string; agency: string; years: string; layers: string[] }[] = [
  { id: 'mro', name: 'Mars Reconnaissance Orbiter', agency: 'NASA', years: '2006 →', layers: ['CTX 6 m', 'CTX DEM 20 m', 'HiRISE 25 cm', 'CRISM'] },
  { id: 'odyssey', name: '2001 Mars Odyssey', agency: 'NASA', years: '2001 →', layers: ['THEMIS day', 'THEMIS night'] },
  { id: 'mgs', name: 'Mars Global Surveyor', agency: 'NASA', years: '1997–2006', layers: ['MOLA elevation (global + 128 ppd)', 'MOLA hillshade'] },
  { id: 'viking', name: 'Viking 1 & 2 orbiters', agency: 'NASA', years: '1976–1980', layers: ['Viking MDIM 2.1 colour mosaic'] },
  { id: 'mex', name: 'Mars Express', agency: 'ESA', years: '2003 →', layers: ['OMEGA hydrous minerals (Carter et al. 2013)'] },
];

function years(e: Explorer, t: (k: string) => string) {
  return `${e.landed.slice(0, 4)} – ${e.ended ? e.ended.slice(0, 4) : t('explorers.active')}`;
}

function Photo({ e, big }: { e: Explorer; big?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!e.photo) return null;
  return (
    <>
      <button className={`thumb explorer-photo ${big ? 'big' : ''}`} onClick={(ev) => { ev.stopPropagation(); setOpen(true); }} title={e.photo.title}>
        <img src={e.photo.src} alt={e.photo.title} loading="lazy" />
        {big && <span>{e.photo.title} · NASA/JPL-Caltech · {e.photo.id}</span>}
      </button>
      {open &&
        createPortal(
          <div className="lightbox" onClick={() => setOpen(false)} role="dialog">
            <img src={e.photo.src} alt={e.photo.title} />
            <div className="lightbox-meta">{e.photo.title} · NASA/JPL-Caltech · {e.photo.id}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Detail({ e, list }: { e: Explorer; list: Explorer[] }) {
  const { t } = useTranslation();
  const st = useExplorers();
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const last = m20Last();
  const here = currentPosition(e, last);
  const live = e.live === 'msl' ? st.msl : e.live === 'heli' ? st.heli : null;
  const km = e.live === 'm20' ? last?.km ?? null : live?.km ?? e.drivenKm ?? null;
  const others = list.filter((x) => x.id !== e.id).map((x) => ({ x, d: kmBetween(here, currentPosition(x, last)) })).sort((a, b) => a.d - b.d);
  return (
    <div className="explorer-detail">
      <Photo e={e} big />
      <div className="card">
        <div className="card-title">{KIND_ICON[e.kind]} {e.name} <span className={`status ${e.ended ? 'ended' : 'active'}`}>{e.ended ? t('explorers.ended') : t('explorers.activeNow')}</span></div>
        <div className="small">{t(`explorers.kinds.${e.kind}`)} · {e.agency} · {years(e, t)}</div>
        <p className="small">{t(`explorers.stories.${e.id}`)}</p>
        <div className="kv"><span className="k">{e.live ? t(e.ended ? 'explorers.finalPos' : 'explorers.lastPos') : t('explorers.landing')}</span><span className="v mono">{formatLat(here.lat, 3)} {formatLon(here.lon, 3)}</span></div>
        {km !== null && (
          <div className="kv"><span className="k">{e.kind === 'helicopter' ? t('explorers.flown', { n: live?.count ?? '' }) : t('explorers.driven')}</span><span className="v"><b>{km.toFixed(2)} km</b> {live || e.live === 'm20' ? <ProvBadge kind="measured" /> : null}</span></div>
        )}
        <p className="note">{t('explorers.coordSource')}: <a href={e.coordSource} target="_blank" rel="noreferrer">{new URL(e.coordSource).hostname}</a> · {e.live ? t('explorers.liveFeed') : `${t('explorers.precision')} ${e.precision}`}</p>
        <div className="actions">
          <button className="primary" onClick={() => fly({ lat: here.lat, lon: here.lon, distance: e.live ? 3 : 40, tilt: 45 })}>{t('explorers.fly')}</button>
          {e.id === 'perseverance' && <button onClick={() => useUI.getState().set({ rightTab: 'routes' })}>{t('explorers.compareDrive')}</button>}
          <button onClick={() => set({ explorerId: null })}>{t('explorers.all')}</button>
        </div>
      </div>
      <div className="card">
        <div className="card-title">📏 {t('explorers.distances', { name: e.name })} <ProvBadge kind="derived" /></div>
        <table className="route-table">
          <tbody>
            {others.map(({ x, d }) => (
              <tr key={x.id} onClick={() => selectExplorer(x.id)} style={{ cursor: 'pointer' }}>
                <td className="k">{KIND_ICON[x.kind]} {x.name}</td>
                <td>{d < 10 ? `${d.toFixed(2)} km` : `${Math.round(d).toLocaleString()} km`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="note">{t('explorers.distNote')}</p>
      </div>
    </div>
  );
}

export function ExplorersTab() {
  const { t } = useTranslation();
  const st = useExplorers();
  const id = useUI((s) => s.explorerId);
  const on = useUI((s) => s.vectors.explorers);
  const set = useUI((s) => s.set);
  const list = [...st.list].sort((a, b) => a.landed.localeCompare(b.landed));
  const sel = list.find((e) => e.id === id) ?? null;
  return (
    <div className="explorers">
      {!on && <button onClick={() => set({ vectors: { ...useUI.getState().vectors, explorers: true } })}>{t('explorers.showOnMap')}</button>}
      {sel ? (
        <Detail e={sel} list={list} />
      ) : (
        <>
          <p className="small muted">{t('explorers.intro')}</p>
          <div className="explorer-list">
            {list.map((e) => (
              <div key={e.id} className="explorer-row" role="button" tabIndex={0} onClick={() => selectExplorer(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && selectExplorer(e.id)}>
                <Photo e={e} />
                <div>
                  <div className="name">{KIND_ICON[e.kind]} {e.name}</div>
                  <div className="small muted">{t(`explorers.kinds.${e.kind}`)} · {years(e, t)}</div>
                </div>
                <span className={`status ${e.ended ? 'ended' : 'active'}`}>{e.ended ? t('explorers.ended') : t('explorers.activeNow')}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">🛰 {t('explorers.orbitersTitle')}</div>
            <p className="small muted">{t('explorers.orbitersIntro')}</p>
            {ORBITERS.map((o) => (
              <div key={o.id} className="orbiter-row">
                <div><b>{o.name}</b> <span className="small muted">· {o.agency} · {o.years}</span></div>
                <div className="small">{t(`explorers.orbiters.${o.id}`)}</div>
                <div className="legend chips">{o.layers.map((l) => <span key={l} className="chip">{l}</span>)}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
