/** Inspector section: published orbital mineral detections near the pinned location. */
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point, polygon } from '@turf/helpers';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ensureMinerals, mineralData, mineralsNear } from '../core/live/minerals';
import { ProvBadge, fmtM } from './common';

const RADIUS_M = 25_000;

export function MineralsNear({ lat, lon }: { lat: number; lon: number }) {
  const { t } = useTranslation();
  const [, setRev] = useState(0);
  useEffect(() => {
    ensureMinerals().then(() => setRev((r) => r + 1));
  }, []);
  if (mineralData.error) return null;
  if (!mineralData.points) return <div className="card small muted">{t('minerals.loading')}</div>;

  const near = mineralsNear(mineralData.points, lat, lon, RADIUS_M);
  const counts = new Map<string, number>();
  for (const { p } of near) {
    const key = p.set === 'hydrous' ? `hydrous${p.instrument === 'OMEGA' ? 'Omega' : 'Crism'}` : p.cls;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const inside = (mineralData.footprints ?? []).filter((f) => {
    try {
      return booleanPointInPolygon(point([lon, lat]), polygon([f.ring]));
    } catch {
      return false;
    }
  });
  const label = (k: string) => (k === 'hydrousOmega' || k === 'hydrousCrism' ? t(`minerals.${k}`) : t(`minerals.${k}`, { defaultValue: k }));

  return (
    <div className="card">
      <div className="card-title">{t('minerals.title')} <ProvBadge kind="derived" /></div>
      {near.length === 0 ? (
        <p className="small muted">{t('minerals.none')}</p>
      ) : (
        <>
          <div className="mineral-counts">
            {[...counts].map(([k, n]) => (
              <span key={k} className="chip">{label(k)} · {n}</span>
            ))}
          </div>
          {near.slice(0, 4).map(({ p, d }) => (
            <div key={p.id} className="small">
              <span className="swatch" style={{ background: `rgb(${p.color.map((c) => Math.round(c * 255)).join(',')})` }} /> {p.set === 'hydrous' ? label(`hydrous${p.instrument === 'OMEGA' ? 'Omega' : 'Crism'}`) : label(p.cls)} · {fmtM(d)}
            </div>
          ))}
        </>
      )}
      {inside.map((f) => (
        <div key={f.id} className="small">
          {t('minerals.crismHere')}: <span className="mono">{f.productId}</span>
          {f.start && <span className="muted"> · {f.start.slice(0, 10)}</span>}{' '}
          {f.url && <a href={f.url} target="_blank" rel="noreferrer">{t('minerals.open')} ↗</a>}
        </div>
      ))}
      <p className="note">{t('minerals.note')}</p>
    </div>
  );
}
