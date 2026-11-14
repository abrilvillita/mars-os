import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { parseNodeId } from '../../core/geo/tiling';
import { formatLat, formatLon } from '../../core/geo/mars';
import { pickText } from '../../i18n';
import { autoCellZoom } from '../../render/globe/GlobeLayer';
import { useUI } from '../../state/uiStore';
import { KV, Toggle, fmtM } from '../common';

export function NodesTab() {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const s = useUI();
  const [delta, setDelta] = useState(5);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [rev, setRev] = useState(0);
  useEffect(() => os.on('history:changed', () => setRev((r) => r + 1)), [os]);

  const cell = s.selectedCellId ? os.regions.cell(s.selectedCellId) : null;
  const nodes = useMemo(() => s.selectedNodeIds.map((id) => os.nodes.get(id)).filter(Boolean), [s.selectedNodeIds, rev, os]); // eslint-disable-line react-hooks/exhaustive-deps
  const sample = cell ? os.nodes.get(`${cell.id}/n${s.nodeGridSize}:0:0`) : null;
  const history = cell ? os.history.forRegion(cell.id) : [];

  const propose = () => {
    if (!cell || !nodes.length) return;
    const offsets = nodes.map((n) => ({ i: n!.i, j: n!.j, delta_m: delta }));
    const text = note.trim() || (i18n.language === 'es' ? 'Edición manual de nodos' : 'Manual node edit');
    const proposal = os.proposals.fromNodeOffsets(cell.id, s.nodeGridSize, offsets, { en: text, [i18n.language]: text });
    const res = os.proposals.submit(proposal);
    setMsg(res.ok ? { ok: true, text: t('nodes.submitted') } : { ok: false, text: `${t('nodes.rejectedValidation')} ${res.errors.join('; ')}` });
    if (res.ok) {
      setNote('');
      s.set({ selectedNodeIds: [] });
    }
  };

  return (
    <div className="nodes">
      <div className="row">
        <label className="field-label">{t('nodes.level')} <b>z{s.cellZoom}</b></label>
        <button className="link" onClick={() => s.set({ cellZoom: autoCellZoom(s.camera.distance) })}>{t('nodes.fit')}</button>
      </div>
      <input type="range" min={3} max={18} value={s.cellZoom} onChange={(e) => s.set({ cellZoom: +e.target.value })} />

      {!cell ? (
        <p className="empty">{t('nodes.noCell')}</p>
      ) : (
        <>
          <div className="card">
            <div className="card-title">{t('nodes.cell')}</div>
            <div className="mono small sel">{cell.id}</div>
            <KV k={t('nodes.size')}>{fmtM(cell.widthM)}</KV>
            <KV k="BBox"><span className="mono small">{formatLat(cell.bbox.south, 3)}…{formatLat(cell.bbox.north, 3)}, {formatLon(cell.bbox.west, 3)}…{formatLon(cell.bbox.east, 3)}</span></KV>
            {cell.regions.length > 0 && <KV k="">{cell.regions.map((id) => pickText(os.regions.get(id)!.label, i18n.language).text).join(', ')}</KV>}
          </div>

          <Toggle checked={s.showNodes} onChange={(v) => s.set({ showNodes: v })} label={t('nodes.show')} />
          <div className="row">
            <span className="field-label">{t('nodes.grid')}</span>
            <select value={s.nodeGridSize} onChange={(e) => s.set({ nodeGridSize: +e.target.value, selectedNodeIds: [] })}>
              {[5, 9, 17, 33].map((n) => <option key={n} value={n}>{n}×{n}</option>)}
            </select>
          </div>
          {sample && (
            <KV k={t('nodes.spacing')}>{fmtM(sample.spacingM.ew)} × {fmtM(sample.spacingM.ns)}</KV>
          )}
          {(() => {
            // progressive detail: report what the data at this cell actually supports
            const c = { lat: (cell.bbox.north + cell.bbox.south) / 2, lon: (cell.bbox.east + cell.bbox.west) / 2 };
            const r = os.terrain.resolutionAt(c.lat, c.lon);
            const st = os.terrain.onDemandStatus();
            if (!r.metersPerPixel) return null;
            const n = Math.max(2, Math.min(33, Math.floor(cell.widthM / r.metersPerPixel) + 1));
            const best = [5, 9, 17, 33].filter((g) => g <= Math.max(5, n)).pop()!;
            const src = os.catalog.layer(r.layerId);
            return (
              <div className="data-support">
                <p className="small">{t('nodes.dataSupports', { src: src?.name ?? r.layerId, res: fmtM(r.metersPerPixel), n })}</p>
                {best !== s.nodeGridSize && <button className="link" onClick={() => s.set({ nodeGridSize: best, selectedNodeIds: [] })}>{t('nodes.snap')} ({best}×{best})</button>}
                {st.pendingTiles > 0 && <p className="small muted">{t('nodes.loadingDetail')}</p>}
                {st.error && <p className="small warn">{t('nodes.detailError', { err: st.error })}</p>}
              </div>
            );
          })()}
          {sample?.interpolated && <p className="warn-box">{t('nodes.interpolatedWarn', { res: fmtM(sample.sourceMetersPerPixel) })}</p>}

          <p className="hint">{t('nodes.selectHint')}</p>
          <div className="row">
            <b>{t('nodes.selected', { count: nodes.length })}</b>
            <span>
              <button className="link" onClick={() => s.set({ selectedNodeIds: os.nodes.grid(cell.id, s.nodeGridSize).map((n) => n.id) })}>{t('nodes.selectAll')}</button>
              {nodes.length > 0 && <button className="link" onClick={() => s.set({ selectedNodeIds: [] })}>{t('nodes.clear')}</button>}
            </span>
          </div>
          {nodes.slice(0, 4).map((n) => (
            <div key={n!.id} className="node-card">
              <div className="mono small">{parseNodeId(n!.id) ? `n(${n!.i},${n!.j})` : n!.id}</div>
              <div className="small">
                {t('nodes.height')} <b>{fmtM(n!.height_m, 1)}</b> · {t('nodes.source')} {fmtM(n!.source_m, 1)}
                {Math.abs(n!.edit_m) > 0.01 && <> · {t('nodes.edit')} {n!.edit_m > 0 ? '+' : ''}{n!.edit_m.toFixed(1)} m</>}
              </div>
            </div>
          ))}
          {nodes.length > 4 && <div className="small muted">+{nodes.length - 4}</div>}

          {nodes.length > 0 && (
            <div className="card propose">
              <label className="field-label">{t('nodes.delta')} <b>{delta > 0 ? '+' : ''}{delta} m</b></label>
              <input type="range" min={-100} max={100} step={1} value={delta} onChange={(e) => setDelta(+e.target.value)} />
              <label className="field-label">{t('nodes.note')}</label>
              <textarea rows={2} value={note} placeholder={t('nodes.notePlaceholder')} onChange={(e) => setNote(e.target.value)} />
              <button className="primary" onClick={propose} disabled={delta === 0}>{t('nodes.propose')}</button>
            </div>
          )}
          {msg && <p className={msg.ok ? 'ok-box' : 'err-box'}>{msg.text}</p>}

          <div className="card">
            <div className="card-title">{t('nodes.history')}</div>
            {history.length === 0 ? (
              <p className="small muted">{t('nodes.noHistory')}</p>
            ) : (
              history.slice().reverse().map((v) => (
                <div key={v.id} className="hist-mini">
                  <span className="small">{pickText(v.message, i18n.language).text}</span>
                  <button className="link" onClick={() => os.history.restore(v.parentId ?? 'ver.base', cell.id)} title={t('nodes.restoreTo')}>↶ {t('history.restore')}</button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
