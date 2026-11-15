/**
 * Perseverance's named samples: a catalog for the Resources section and a detail view
 * (NASA photo, sample facts, CacheCam views inside the tube) for the Photos tab.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatLat, formatLon } from '../../core/geo/mars';
import { cachecam, fetchCacheCamImages, loadCacheCamIndex } from '../../core/live/cachecam';
import { SAMPLE_COLORS, sampleGroup, type SampleGroup } from '../../core/live/samples';
import { ensurePlacedSamples, placedSamples, type PlacedSample } from '../../render/overlays/SamplesLayer';
import { useUI } from '../../state/uiStore';
import { ProvBadge } from '../common';

type Img = Awaited<ReturnType<typeof fetchCacheCamImages>>[number];
const GROUPS: SampleGroup[] = ['igneous', 'sedimentary', 'special', 'regolith', 'atmospheric'];

function usePlacedSamples() {
  const [list, setList] = useState<PlacedSample[]>(placedSamples.list);
  useEffect(() => {
    let alive = true;
    ensurePlacedSamples().then((l) => alive && setList([...l]));
    return () => {
      alive = false;
    };
  }, []);
  return list;
}

export function openSample(s: PlacedSample, fly = true) {
  const st = useUI.getState();
  st.set({ sampleN: s.n, waypoint: null, rightTab: 'photos', panelsOpen: { ...st.panelsOpen, right: true }, vectors: { ...st.vectors, samples: true } });
  if (fly) st.requestFlyTo({ lat: s.lat, lon: s.lon, distance: 0.5, tilt: 55 });
}

/** Compact catalog for the Resources section of the left panel. */
export function SampleCatalog() {
  const { t } = useTranslation();
  const list = usePlacedSamples();
  const sel = useUI((s) => s.sampleN);
  if (!list.length) return <p className="small muted">{t('photos.loading')}</p>;
  const depot = list.filter((s) => s.location === 'depot').length;
  return (
    <div className="sample-catalog">
      <p className="small muted">{t('samples.catalogNote', { n: list.length, depot })}</p>
      {GROUPS.map((g) => {
        const items = list.filter((s) => sampleGroup(s) === g);
        if (!items.length) return null;
        return (
          <div key={g} className="sample-group">
            <div className="small"><span className="swatch" style={{ background: SAMPLE_COLORS[g] }} /> {t(`samples.groups.${g}`)} · {items.length}</div>
            <div className="sol-chips">
              {items.map((s) => (
                <button key={s.n} className={`chip ${sel === s.n ? 'on' : ''}`} onClick={() => openSample(s)} title={`No. ${s.n} · ${s.dateSealed ?? ''}`}>
                  {s.name}{s.location === 'depot' ? ' ⌂' : ''}
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="note">⌂ {t('samples.depotMark')}</p>
    </div>
  );
}

/** CacheCam sol nearest before (or at) the sealing sol, within 20 sols. */
function cacheCamSolFor(s: PlacedSample): number | null {
  const idx = cachecam.index;
  const ref = s.solSealed ?? s.imageSol;
  if (!idx || ref === null) return null;
  let best: number | null = null;
  for (const c of idx.sols) {
    if (c.sol > ref || ref - c.sol > 20) continue;
    if (best === null || c.sol > best) best = c.sol;
  }
  return best;
}

export function SampleDetail({ n }: { n: number }) {
  const { t } = useTranslation();
  const list = usePlacedSamples();
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const [ccRev, setCcRev] = useState(0);
  const [imgs, setImgs] = useState<Img[] | null>(null);
  const [err, setErr] = useState(false);
  const [big, setBig] = useState<{ src: string; meta: string; href: string } | null>(null);
  const s = list.find((x) => x.n === n) ?? null;

  useEffect(() => {
    loadCacheCamIndex(import.meta.env.BASE_URL).then(() => setCcRev((r) => r + 1));
  }, []);
  const ccSol = s ? cacheCamSolFor(s) : null;
  useEffect(() => {
    setImgs(null);
    setErr(false);
    if (ccSol !== null) fetchCacheCamImages(ccSol).then(setImgs).catch(() => setErr(true));
  }, [ccSol, ccRev]);

  if (!s) return <p className="muted">{t('photos.loading')}</p>;
  const g = sampleGroup(s);
  const i = list.indexOf(s);
  const hl = t(`samples.highlights.${s.n}`, { defaultValue: '' });
  return (
    <div className="photos">
      <div className="card sample-card" style={{ borderTopColor: SAMPLE_COLORS[g] }}>
        <div className="card-title">{s.name} <span className="muted small">· {t('samples.no', { n: s.n })}</span> <ProvBadge kind="measured" /></div>
        <div className="small"><span className="swatch" style={{ background: SAMPLE_COLORS[g] }} /> {t(`samples.groups.${g}`)}{s.rockType && s.rockType !== 'n/a' && (g === 'special' || g === 'regolith') ? ` · ${s.rockType}` : ''}</div>
        <div className="kv"><span className="k">{t('samples.type')}</span><span className="v">{s.type ?? '—'}{s.height && s.height !== 'n/a' ? ` · ${s.height}` : ''}</span></div>
        <div className="kv"><span className="k">{t('samples.sealed')}</span><span className="v">{s.solSealed !== null ? `sol ${s.solSealed} · ${s.dateSealed ?? ''}` : t('samples.notSealed')}</span></div>
        <div className="kv"><span className="k">{t('samples.target')}</span><span className="v">{s.feature ?? '—'}{s.samplingLocation ? ` · ${s.samplingLocation}` : ''}</span></div>
        <div className="kv"><span className="k">{t('samples.where')}</span><span className="v">{t(s.location === 'depot' ? 'samples.atDepot' : 'samples.onRover')}</span></div>
        <div className="mono small">{formatLat(s.lat, 5)} {formatLon(s.lon, 5)} · {t('samples.nearStop', { rmc: s.rmc })}</div>
        {hl && <p className="small sample-hl">{hl}</p>}
        <div className="actions">
          <button onClick={() => fly({ lat: s.lat, lon: s.lon, distance: 0.08, tilt: 78 })}>{t('explorers.fly')}</button>
          <button onClick={() => set({ sampleN: null, waypoint: { sol: s.solSealed ?? s.imageSol ?? 0, rmc: s.rmc, lat: s.lat, lon: s.lon } })}>{t('samples.stopPhotos')}</button>
        </div>
        <div className="actions">
          {i > 0 && <button onClick={() => openSample(list[i - 1])}>← {list[i - 1].name}</button>}
          {i < list.length - 1 && <button onClick={() => openSample(list[i + 1])}>{list[i + 1].name} →</button>}
          <button onClick={() => set({ sampleN: null })}>{t('samples.back')}</button>
        </div>
      </div>

      {s.image && (
        <button className="thumb sample-photo" onClick={() => setBig({ src: s.image!, meta: `${s.name} · NASA/JPL-Caltech`, href: s.image! })}>
          <img src={s.image} alt={`${s.name} — NASA`} loading="lazy" />
          <span>{t('samples.nasaPhoto')}</span>
        </button>
      )}

      <div className="field-label">{t('samples.insideTube')}</div>
      {ccSol === null && <p className="small muted">{t('samples.noCacheCam')}</p>}
      {ccSol !== null && <p className="small muted">{t('samples.cacheCamSol', { sol: ccSol })} <ProvBadge kind="measured" /></p>}
      {err && <p className="err-box">{t('env.error')}</p>}
      {ccSol !== null && !imgs && !err && <p className="muted">{t('photos.loading')}</p>}
      <div className="thumbs">
        {imgs?.slice(0, 24).map((im) => (
          <button key={im.id} className="thumb" onClick={() => setBig({ src: im.large ?? im.medium, meta: `CacheCam · sol ${ccSol} · ${im.takenUtc} UTC · NASA/JPL-Caltech`, href: im.fullRes ?? im.large ?? im.medium })} title={im.takenUtc}>
            <img src={im.small} alt={`CacheCam sol ${ccSol}`} loading="lazy" />
            <span>{im.takenUtc.slice(11, 19)} UTC</span>
          </button>
        ))}
      </div>
      <p className="note">{t('samples.sourceNote')}</p>
      {big &&
        createPortal(
          <div className="lightbox" onClick={() => setBig(null)} role="dialog">
            <img src={big.src} alt={big.meta} />
            <div className="lightbox-meta">
              {big.meta}{' '}
              <a href={big.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t('photos.open')} ↗</a>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
