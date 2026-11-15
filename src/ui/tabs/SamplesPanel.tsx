/** Perseverance sample-handling (CacheCam) views for the Photos tab. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatLat, formatLon } from '../../core/geo/mars';
import { cachecam, fetchCacheCamImages, loadCacheCamIndex } from '../../core/live/cachecam';
import { useUI } from '../../state/uiStore';
import { ProvBadge } from '../common';

type Img = Awaited<ReturnType<typeof fetchCacheCamImages>>[number];

export function SampleSolList() {
  const { t } = useTranslation();
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const [, setRev] = useState(0);
  useEffect(() => {
    loadCacheCamIndex(import.meta.env.BASE_URL).then(() => setRev((r) => r + 1));
  }, []);
  const idx = cachecam.index;
  if (!idx) return null;
  return (
    <div className="card">
      <div className="card-title">🧪 {t('samples.listTitle')} <ProvBadge kind="measured" /></div>
      <p className="small muted">{t('samples.listNote', { sols: idx.sols.length, imgs: idx.totalImages })}</p>
      <div className="sol-chips">
        {idx.sols.map((s) => (
          <button
            key={s.sol}
            className="chip"
            title={`${s.count} · ${s.firstUtc.slice(0, 10)}`}
            onClick={() => {
              set({ cachecamSol: s.sol, waypoint: null, vectors: { ...useUI.getState().vectors, samples: true } });
              if (s.position) fly({ lat: s.position.lat, lon: s.position.lon, distance: 0.6, tilt: 55 });
            }}
          >
            {s.sol}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CacheCamPanel({ sol }: { sol: number }) {
  const { t } = useTranslation();
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const [imgs, setImgs] = useState<Img[] | null>(null);
  const [err, setErr] = useState(false);
  const [big, setBig] = useState<Img | null>(null);
  const [, setRev] = useState(0);
  const meta = cachecam.index?.sols.find((s) => s.sol === sol) ?? null;

  useEffect(() => {
    loadCacheCamIndex(import.meta.env.BASE_URL).then(() => setRev((r) => r + 1));
  }, []);

  useEffect(() => {
    setImgs(null);
    setErr(false);
    fetchCacheCamImages(sol).then(setImgs).catch(() => setErr(true));
  }, [sol]);

  return (
    <div className="photos">
      <div className="card">
        <div className="card-title">🧪 {t('samples.title', { sol })}</div>
        {meta?.position && (
          <div className="mono small">{formatLat(meta.position.lat, 5)} {formatLon(meta.position.lon, 5)} · {t('samples.nearStop', { rmc: meta.position.rmc })}</div>
        )}
        {meta && <div className="small muted">{meta.firstUtc.slice(0, 10)} · {t('samples.count', { n: meta.count })}</div>}
        <p className="small">{t('samples.explain')}</p>
        <div className="actions">
          {meta?.position && <button onClick={() => fly({ lat: meta.position!.lat, lon: meta.position!.lon, distance: 0.08, tilt: 78 })}>{t('photos.fly')}</button>}
          <button onClick={() => set({ cachecamSol: null })}>{t('samples.back')}</button>
        </div>
      </div>
      <p className="small muted">{t('samples.raw')} <ProvBadge kind="measured" /></p>
      {err && <p className="err-box">{t('env.error')}</p>}
      {!imgs && !err && <p className="muted">{t('photos.loading')}</p>}
      {imgs && imgs.length === 0 && <p className="muted">{t('photos.none')}</p>}
      <div className="thumbs">
        {imgs?.slice(0, 36).map((im) => (
          <button key={im.id} className="thumb" onClick={() => setBig(im)} title={im.takenUtc}>
            <img src={im.small} alt={`CacheCam sol ${sol}`} loading="lazy" />
            <span>{im.takenUtc.slice(11, 19)} UTC</span>
          </button>
        ))}
      </div>
      {big &&
        createPortal(
          <div className="lightbox" onClick={() => setBig(null)} role="dialog">
            <img src={big.large ?? big.medium} alt={`CacheCam sol ${sol}`} />
            <div className="lightbox-meta">
              CacheCam · sol {sol} · {big.takenUtc} UTC · NASA/JPL-Caltech{' '}
              <a href={big.fullRes ?? big.large ?? big.medium} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t('photos.open')} ↗</a>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
