/**
 * Inspector with a PERSISTENT selection:
 *  - cursor movement only updates a small preview strip
 *  - a click on the terrain pins a location (coords, elevation, cell, nearest node, provenance)
 *  - the pin survives scrolling, tab switches and cursor movement; it can be locked so further
 *    clicks don't replace it, re-armed for one new pick, or cleared
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { nodeId, parseCellId, tileBBox } from '../../core/geo/tiling';
import { formatLat, formatLon, DEG } from '../../core/geo/mars';
import { formatHours, ltst, marsTime } from '../../core/time/marsTime';
import { pickText } from '../../i18n';
import { renderBridge } from '../../render/bridge';
import { useUI, type PinnedLocation } from '../../state/uiStore';
import { KV, ProvBadge, fmtM } from '../common';
import { MineralsNear } from '../MineralsNear';
import { IceNear } from '../IceNear';

function nearestNode(cell: string, N: number, lat: number, lon: number) {
  const t = parseCellId(cell);
  if (!t) return null;
  const b = tileBBox(t);
  const i = Math.max(0, Math.min(N - 1, Math.round(((lon - b.west) / (b.east - b.west)) * (N - 1))));
  const j = Math.max(0, Math.min(N - 1, Math.round(((b.north - lat) / (b.north - b.south)) * (N - 1))));
  return nodeId(cell, N, i, j);
}

function PinnedDetails({ p }: { p: PinnedLocation }) {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const epochMs = useUI((s) => s.time.epochMs);
  const N = useUI((s) => s.nodeGridSize);
  const [copied, setCopied] = useState<string | null>(null);
  const h = os.terrain.heightAt(p.lat, p.lon);
  const src = os.catalog.layer(h.sourceLayerId);
  const desc = renderBridge.describeAt(p.lat, p.lon);
  const regions = os.regions.at(p.lat, p.lon);
  const mt = marsTime(new Date(epochMs));
  const cosZ = Math.sin(p.lat * DEG) * Math.sin(mt.subsolarLat * DEG) + Math.cos(p.lat * DEG) * Math.cos(mt.subsolarLat * DEG) * Math.cos((p.lon - mt.subsolarLon) * DEG);
  const sunElev = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / DEG;
  const nId = nearestNode(p.cellId, N, p.lat, p.lon);
  const node = nId ? os.nodes.get(nId) : null;
  const interpolated = desc && h.sourceMetersPerPixel !== null && desc.vertexSpacingM < h.sourceMetersPerPixel;
  const copy = (s: string) => {
    navigator.clipboard?.writeText(s);
    setCopied(s);
    setTimeout(() => setCopied(null), 1200);
  };

  return (
    <>
      <div className="card">
        <div className="card-title">{t('inspect.elevation')} <span className="mono big">{fmtM(h.height_m)}</span></div>
        <KV k={t('inspect.source')}>{src ? src.name : h.sourceLayerId} {src && <ProvBadge kind={src.provenance} />}</KV>
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

      <div className="card">
        <div className="card-title">{t('inspect.cellNode')}</div>
        <KV k={t('inspect.cell')}>
          <span className="mono small">{p.cellId}</span>{' '}
          <button className="link" onClick={() => copy(p.cellId)}>{copied === p.cellId ? t('inspect.copied') : t('inspect.copy')}</button>
        </KV>
        {node && (
          <>
            <KV k={t('inspect.nearestNode')}>
              <span className="mono small">{node.id.split('/')[1]}</span>{' '}
              <button className="link" onClick={() => copy(node.id)}>{copied === node.id ? t('inspect.copied') : t('inspect.copy')}</button>
            </KV>
            <KV k={t('nodes.height')}>
              {fmtM(node.height_m, 1)} {node.interpolated && <span className="warn small">· {t('inspect.interpolated')}</span>}
            </KV>
          </>
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

      <MineralsNear lat={p.lat} lon={p.lon} />
      <IceNear lat={p.lat} lon={p.lon} />

      <div className="card">
        <KV k={t('inspect.regions')}>{regions.length ? regions.map((r) => pickText(r.label, i18n.language).text).join(' › ') : t('inspect.none')}</KV>
        <KV k={t('inspect.localTime')}><span className="mono">{formatHours(ltst(mt, p.lon))}</span></KV>
        <KV k={t('inspect.sunElev')}><span className="mono">{sunElev.toFixed(1)}°</span></KV>
      </div>
    </>
  );
}

export function InspectTab() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const hover = useUI((s) => s.hover);
  const pin = useUI((s) => s.pick);
  const locked = useUI((s) => s.pinLocked);
  const armed = useUI((s) => s.repinArmed);
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const cam = useUI((s) => s.camera);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000); // refresh provenance while tiles/elevation stream in
    const off = os.on('terrain:changed', () => tick((n) => n + 1));
    return () => {
      clearInterval(id);
      off();
    };
  }, [os]);

  const hoverH = hover ? os.terrain.heightAt(hover.lat, hover.lon).height_m : null;

  return (
    <div className="inspect">
      <div className="cursor-strip" aria-live="off">
        <span className="tag cursor-tag">⌖ {t('inspect.cursor')}</span>
        {hover ? (
          <span className="mono small">{formatLat(hover.lat)} {formatLon(hover.lon)} · {fmtM(hoverH)}</span>
        ) : (
          <span className="small muted">{t('inspect.cursorNone')}</span>
        )}
      </div>

      {!pin ? (
        <p className="empty">{t('inspect.empty')}</p>
      ) : (
        <>
          <div className={`pin-head ${locked ? 'locked' : ''}`}>
            <div className="row">
              <span className="tag pin-tag">📍 {t('inspect.pinned')}{locked && ` · ${t('inspect.locked')}`}</span>
              <span className="small muted">{new Date(pin.pinnedAt).toLocaleTimeString()}</span>
            </div>
            <div className="mono big">{formatLat(pin.lat, 5)} {formatLon(pin.lon, 5)}</div>
            <div className="actions">
              <button className={locked ? 'on' : ''} onClick={() => set({ pinLocked: !locked, repinArmed: false })} aria-pressed={locked}>
                {locked ? `🔒 ${t('inspect.unlock')}` : `🔓 ${t('inspect.lock')}`}
              </button>
              <button className={armed ? 'on' : ''} onClick={() => set({ repinArmed: !armed })}>{armed ? t('inspect.armed') : t('inspect.repick')}</button>
              <button onClick={() => fly({ lat: pin.lat, lon: pin.lon, distance: Math.min(cam.distance, 30) })}>{t('nav.goTo')}</button>
              <button className="danger" onClick={() => set({ pick: null, pinLocked: false, repinArmed: false })}>{t('inspect.clear')}</button>
            </div>
          </div>
          <PinnedDetails p={pin} />
        </>
      )}
    </div>
  );
}
