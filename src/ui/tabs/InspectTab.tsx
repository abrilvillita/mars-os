import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { cellId, tileAt } from '../../core/geo/tiling';
import { formatLat, formatLon, DEG } from '../../core/geo/mars';
import { formatHours, ltst, marsTime } from '../../core/time/marsTime';
import { pickText } from '../../i18n';
import { renderBridge } from '../../render/bridge';
import { useUI } from '../../state/uiStore';
import { KV, ProvBadge, fmtM } from '../common';

export function InspectTab() {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const hover = useUI((s) => s.hover);
  const pick = useUI((s) => s.pick);
  const cellZoom = useUI((s) => s.cellZoom);
  const epochMs = useUI((s) => s.time.epochMs);
  const [, tick] = useState(0);
  const [copied, setCopied] = useState(false);
  const p = hover ?? pick;
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 700); // refresh while tiles stream in
    return () => clearInterval(id);
  }, []);

  if (!p) return <p className="empty">{t('inspect.empty')}</p>;
  const h = os.terrain.heightAt(p.lat, p.lon);
  const src = os.catalog.layer(h.sourceLayerId);
  const desc = renderBridge.describeAt(p.lat, p.lon);
  const regions = os.regions.at(p.lat, p.lon);
  const mt = marsTime(new Date(epochMs));
  const cosZ = Math.sin(p.lat * DEG) * Math.sin(mt.subsolarLat * DEG) + Math.cos(p.lat * DEG) * Math.cos(mt.subsolarLat * DEG) * Math.cos((p.lon - mt.subsolarLon) * DEG);
  const sunElev = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / DEG;
  const cell = cellId(tileAt(p.lat, p.lon, cellZoom));
  const interpolated = desc && h.sourceMetersPerPixel !== null && desc.vertexSpacingM < h.sourceMetersPerPixel;

  return (
    <div className="inspect">
      <div className="inspect-head">
        <span className="tag">{hover ? t('inspect.hover') : t('inspect.picked')}</span>
        <span className="mono big">{formatLat(p.lat)} {formatLon(p.lon)}</span>
      </div>

      <div className="card">
        <div className="card-title">{t('inspect.elevation')} <span className="mono big">{fmtM(h.height_m)}</span></div>
        <KV k={t('inspect.source')}>
          {src ? src.name : h.sourceLayerId} <ProvBadge kind="derived" />
        </KV>
        <KV k={t('inspect.sourceRes')}>{fmtM(h.sourceMetersPerPixel)}/px{h.sourceBlended && <em> · {t('inspect.blended')}</em>}</KV>
        {h.applied.length > 0 && (
          <KV k={t('inspect.edits')}>
            {h.applied.map((a) => (
              <div key={a.patchId} className="mono small">{a.delta_m > 0 ? '+' : ''}{a.delta_m.toFixed(2)} m · {a.patchId}</div>
            ))}
          </KV>
        )}
        {h.preview.length > 0 && (
          <KV k={t('inspect.preview')}>
            {h.preview.map((a) => (
              <div key={a.patchId} className="mono small"><ProvBadge kind="ai_proposed" /> {a.delta_m > 0 ? '+' : ''}{a.delta_m.toFixed(2)} m</div>
            ))}
          </KV>
        )}
      </div>

      {desc && (
        <div className="card">
          <div className="card-title">{t('inspect.imagery')}</div>
          {desc.layers.map((l) => {
            const layer = os.catalog.layer(l.layerId);
            return (
              <div key={l.layerId} className="img-layer">
                <div>{layer ? pickText(layer.label, i18n.language).text : l.layerId} {layer && <ProvBadge kind={layer.provenance} />}</div>
                <div className="small muted">
                  {t('inspect.native')} {fmtM(l.nativeMetersPerPixel, 2)}/px · {t('inspect.displayed')} {fmtM(l.effectiveMetersPerPixel, 1)}/px (z{l.loadedZoom})
                  {l.upsampledBy > 1 && <span className="warn"> · {t('inspect.upsampled', { n: l.upsampledBy })}</span>}
                  {l.fromFallback && <span className="warn"> · {t('inspect.fallback')}</span>}
                </div>
              </div>
            );
          })}
          <div className="img-layer">
            <div>{t('inspect.geometry')} <ProvBadge kind="generated" /></div>
            <div className="small muted">
              z{desc.tileZoom} · {t('inspect.vertexSpacing')} {fmtM(desc.vertexSpacingM, 1)}
              {interpolated && <span className="warn"> · {t('inspect.interpolated')}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <KV k={t('inspect.regions')}>{regions.length ? regions.map((r) => pickText(r.label, i18n.language).text).join(' › ') : t('inspect.none')}</KV>
        <KV k={t('inspect.localTime')}><span className="mono">{formatHours(ltst(mt, p.lon))}</span></KV>
        <KV k={t('inspect.sunElev')}><span className="mono">{sunElev.toFixed(1)}°</span></KV>
        <KV k={t('inspect.distance')}><span className="mono">{fmtM(p.distanceKm * 1000)}</span></KV>
        <KV k={t('inspect.cell')}>
          <span className="mono small">{cell}</span>{' '}
          <button className="link" onClick={() => { navigator.clipboard?.writeText(cell); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>
            {copied ? t('inspect.copied') : t('inspect.copy')}
          </button>
        </KV>
      </div>
    </div>
  );
}
