import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRawImages, type RawImage } from '../../core/live/m20';
import { formatLat, formatLon } from '../../core/geo/mars';
import { roverData } from '../../render/overlays/RoverLayer';
import { useUI } from '../../state/uiStore';
import { ProvBadge, fmtM } from '../common';

export function PhotosTab() {
  const { t } = useTranslation();
  const wp = useUI((s) => s.waypoint);
  const fly = useUI((s) => s.requestFlyTo);
  const [imgs, setImgs] = useState<RawImage[] | null>(null);
  const [err, setErr] = useState(false);
  const [big, setBig] = useState<RawImage | null>(null);

  useEffect(() => {
    if (!wp) return;
    setImgs(null);
    setErr(false);
    fetchRawImages(wp.sol, 36).then(setImgs).catch(() => setErr(true));
  }, [wp]);

  if (!wp) return <p className="empty">{t('photos.pick')}</p>;
  const meta = roverData.waypoints.find((w) => w.rmc === wp.rmc);

  return (
    <div className="photos">
      <div className="card">
        <div className="card-title">{t('photos.stop', { rmc: wp.rmc, sol: wp.sol })}</div>
        <div className="mono small">{formatLat(wp.lat, 5)} {formatLon(wp.lon, 5)}</div>
        {meta?.elevGeoid_m !== null && meta?.elevGeoid_m !== undefined && <div className="small">{t('photos.elev')}: {fmtM(meta.elevGeoid_m, 2)}</div>}
        {meta?.note && <div className="small muted">{meta.note}</div>}
        <button onClick={() => fly({ lat: wp.lat, lon: wp.lon, distance: 0.08, tilt: 78 })}>{t('photos.fly')}</button>
      </div>
      <p className="small muted">{t('photos.raw')} <ProvBadge kind="measured" /></p>
      {err && <p className="err-box">{t('env.error')}</p>}
      {!imgs && !err && <p className="muted">{t('photos.loading')}</p>}
      {imgs && imgs.length === 0 && <p className="muted">{t('photos.none')}</p>}
      <div className="thumbs">
        {imgs?.map((im) => (
          <button key={im.id} className="thumb" onClick={() => setBig(im)} title={`${im.instrument} · ${im.takenUtc}`}>
            <img src={im.small} alt={`${im.instrument} sol ${im.sol}`} loading="lazy" />
            <span>{im.instrument.replace(/_/g, ' ')}</span>
          </button>
        ))}
      </div>
      {big && (
        <div className="lightbox" onClick={() => setBig(null)} role="dialog">
          <img src={big.large ?? big.medium} alt={big.instrument} />
          <div className="lightbox-meta">
            {big.instrument} · sol {big.sol} · {big.takenUtc} UTC · NASA/JPL-Caltech{' '}
            <a href={big.fullRes ?? big.large ?? big.medium} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{t('photos.open')} ↗</a>
          </div>
        </div>
      )}
    </div>
  );
}
