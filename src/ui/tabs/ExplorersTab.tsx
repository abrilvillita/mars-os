/**
 * Mars explorers: every NASA robot that reached the surface, with a NASA photo, its story,
 * live odometry for active missions and distances between them; plus the orbiters whose data
 * MARS OS uses.
 */
import { useState } from 'react';
import type { ExpeditionStop } from '../../core/live/expeditions';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatLat, formatLon } from '../../core/geo/mars';
import { currentPosition, kmBetween, type Explorer } from '../../core/live/explorers';
import { KindDot, m20Last, selectExplorer, selectStop, useExplorers } from '../../render/overlays/ExplorersLayer';
import { expeditions } from '../../core/live/expeditions';
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

function Science({ e }: { e: Explorer }) {
  const { t, i18n } = useTranslation();
  const sc = e.science;
  if (!sc) return null;
  const es = i18n.language.startsWith('es');
  return (
    <div className="card">
      <div className="card-title">{t('explorers.findings')} <ProvBadge kind="measured" /></div>
      <ul className="findings">
        {sc.findings.map((x, i) => <li key={i} className="small">{es ? x.es : x.en}</li>)}
      </ul>
      <div className="field-label">{t('explorers.instruments')}</div>
      <div className="legend chips">{sc.instruments.map((x) => <span key={x} className="chip">{x}</span>)}</div>
      <p className="note">{t('explorers.sciSource')}: <a href={sc.page} target="_blank" rel="noreferrer">{sc.page.replace('https://', '')}</a></p>
    </div>
  );
}

function Stops({ mission }: { mission: string }) {
  const { t } = useTranslation();
  const doc = expeditions.doc;
  if (!doc) return null;
  const items = doc.stops.map((s, i) => ({ s, i })).filter((x) => x.s.mission === mission && x.s.text);
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="card-title">{t('explorers.stops', { n: items.length })}</div>
      <div className="stop-list">
        {items.map(({ s, i }) => (
          <button key={i} className={`stop-row ${s.hardware ? 'hw' : ''}`} onClick={() => selectStop(i)}>
            {s.image && <img src={s.image} alt="" loading="lazy" />}
            <span>{s.name}{s.hardware ? <span className="muted small"> · {t('explorers.hardware')}</span> : null}</span>
          </button>
        ))}
      </div>
      <p className="note">{t('explorers.stopsSource')}</p>
    </div>
  );
}

function StopDetail({ s }: { s: ExpeditionStop }) {
  const { t } = useTranslation();
  const set = useUI((st) => st.set);
  const fly = useUI((st) => st.requestFlyTo);
  const [big, setBig] = useState(false);
  return (
    <div className="explorer-detail">
      {s.image && (
        <button className="thumb explorer-photo big" onClick={() => setBig(true)}>
          <img src={s.image} alt={s.name} loading="lazy" />
          <span>NASA/JPL-Caltech · NASA Mars Trek</span>
        </button>
      )}
      <div className="card">
        <div className="card-title">{s.name}</div>
        <div className="mono small">{formatLat(s.lat, 4)} {formatLon(s.lon, 4)}</div>
        {s.text && <p className="small">{s.text}</p>}
        <p className="note">{t('explorers.stopSource')}: {s.page ? <a href={s.page} target="_blank" rel="noreferrer">NASA Mars Trek</a> : 'NASA Mars Trek'} · <a href={s.source} target="_blank" rel="noreferrer">{t('explorers.dataService')}</a></p>
        <div className="actions">
          <button className="primary" onClick={() => fly({ lat: s.lat, lon: s.lon, distance: s.hardware ? 1 : 3, tilt: 50 })}>{t('explorers.fly')}</button>
          <button onClick={() => set({ stopIdx: null })}>{t('explorers.backTo')}</button>
        </div>
      </div>
      {big && s.image && createPortal(
        <div className="lightbox" onClick={() => setBig(false)} role="dialog">
          <img src={s.image} alt={s.name} />
          <div className="lightbox-meta">{s.name} · NASA/JPL-Caltech · NASA Mars Trek</div>
        </div>,
        document.body,
      )}
    </div>
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
        <div className="card-title"><KindDot kind={e.kind} /> {e.name} <span className={`status ${e.ended ? 'ended' : 'active'}`}>{e.ended ? t('explorers.ended') : t('explorers.activeNow')}</span></div>
        <div className="small">{t(`explorers.kinds.${e.kind}`)} · {e.agency} · {years(e, t)}</div>
        <p className="small">{t(`explorers.stories.${e.id}`)}</p>
        <div className="kv"><span className="k">{e.live ? t(e.ended ? 'explorers.finalPos' : 'explorers.lastPos') : e.trekPath && st.paths[e.id] ? t('explorers.finalPathEnd') : t('explorers.landing')}</span><span className="v mono">{formatLat(here.lat, 3)} {formatLon(here.lon, 3)}</span></div>
        {km !== null && (
          <div className="kv"><span className="k">{e.kind === 'helicopter' ? t('explorers.flown', { n: live?.count ?? '' }) : t('explorers.driven')}</span><span className="v"><b>{km.toFixed(2)} km</b> {live || e.live === 'm20' ? <ProvBadge kind="measured" /> : null}</span></div>
        )}
        <p className="note">{t('explorers.coordSource')}: <a href={e.coordSource} target="_blank" rel="noreferrer">{new URL(e.coordSource).hostname}</a> · {e.live ? t('explorers.liveFeed') : `${t('explorers.precision')} ${e.precision}`}{e.trekPath && st.paths[e.id] ? <> · {t('explorers.pathSource')}: <a href={`https://trek.nasa.gov/mars/trekarcgis/rest/services/${e.trekPath}/MapServer`} target='_blank' rel='noreferrer'>NASA Mars Trek</a></> : null}</p>
        <div className="actions">
          <button className="primary" onClick={() => fly({ lat: here.lat, lon: here.lon, distance: e.live ? 3 : 40, tilt: 45 })}>{t('explorers.fly')}</button>
          {e.id === 'perseverance' && <button onClick={() => useUI.getState().set({ rightTab: 'routes' })}>{t('explorers.compareDrive')}</button>}
          <button onClick={() => set({ explorerId: null, stopIdx: null })}>{t('explorers.all')}</button>
        </div>
      </div>
      <Science e={e} />
      <Stops mission={e.id} />
      <div className="card">
        <div className="card-title">{t('explorers.distances', { name: e.name })} <ProvBadge kind="derived" /></div>
        <table className="route-table">
          <tbody>
            {others.map(({ x, d }) => (
              <tr key={x.id} onClick={() => selectExplorer(x.id)} style={{ cursor: 'pointer' }}>
                <td className="k"><KindDot kind={x.kind} /> {x.name}</td>
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
  const stopIdx = useUI((s) => s.stopIdx);
  const stop = stopIdx !== null ? expeditions.doc?.stops[stopIdx] ?? null : null;
  return (
    <div className="explorers">
      {!on && <button onClick={() => set({ vectors: { ...useUI.getState().vectors, explorers: true } })}>{t('explorers.showOnMap')}</button>}
      {stop ? (
        <StopDetail s={stop} />
      ) : sel ? (
        <Detail e={sel} list={list} />
      ) : (
        <>
          <p className="small muted">{t('explorers.intro')}</p>
          <div className="explorer-list">
            {list.map((e) => (
              <div key={e.id} className="explorer-row" role="button" tabIndex={0} onClick={() => selectExplorer(e.id)} onKeyDown={(ev) => ev.key === 'Enter' && selectExplorer(e.id)}>
                <Photo e={e} />
                <div>
                  <div className="name"><KindDot kind={e.kind} /> {e.name}</div>
                  <div className="small muted">{t(`explorers.kinds.${e.kind}`)} · {years(e, t)}</div>
                </div>
                <span className={`status ${e.ended ? 'ended' : 'active'}`}>{e.ended ? t('explorers.ended') : t('explorers.activeNow')}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-title">{t('explorers.orbitersTitle')}</div>
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
