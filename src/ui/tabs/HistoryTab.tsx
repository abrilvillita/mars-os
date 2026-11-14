import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { pickText } from '../../i18n';
import { useUI } from '../../state/uiStore';

export function HistoryTab() {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const fly = useUI((s) => s.requestFlyTo);
  const [, setRev] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => os.on('history:changed', () => setRev((r) => r + 1)), [os]);

  const versions = os.history.list().slice().reverse();
  const head = os.history.head();
  const viewing = os.history.viewing();

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(os.exportChangeLog(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `marsos-changelog-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      os.importChangeLog(JSON.parse(await f.text()));
      setErr(null);
    } catch (e) {
      setErr(`${t('history.importError')} ${(e as Error).message}`);
    }
  };

  return (
    <div className="history">
      {viewing && (
        <div className="warn-box row">
          <span>{t('history.viewing')}</span>
          <button onClick={() => os.history.view(null)}>{t('history.backToHead')}</button>
        </div>
      )}
      <p className="small muted">{t('history.restoreHint')}</p>
      <ol className="timeline">
        {versions.map((v) => {
          const isHead = v.id === head;
          const isView = v.id === viewing;
          return (
            <li key={v.id} className={`${isHead ? 'head' : ''} ${isView ? 'viewing' : ''}`}>
              <div className="row">
                <span className={`author a-${v.author.kind}`}>{t(`history.authors.${v.author.kind}`)}</span>
                <span className="small muted mono">{new Date(v.createdAt).toLocaleString(i18n.language)}</span>
              </div>
              <div>{pickText(v.message, i18n.language).text}{isHead && <b className="head-tag"> · {t('history.head')}</b>}</div>
              <div className="small muted">
                <span className="mono">{v.id}</span> · {t('history.ops', { count: v.ops.length })}
                {v.restoredFrom && <> · {t('history.restoredFrom', { id: v.restoredFrom })}</>}
              </div>
              <div className="actions">
                {!isView && !isHead && <button onClick={() => os.history.view(v.id)}>{t('history.view')}</button>}
                {!isHead && <button onClick={() => os.history.restore(v.id)}>{t('history.restore')}</button>}
                {v.bbox && (
                  <button onClick={() => fly({ lat: (v.bbox!.north + v.bbox!.south) / 2, lon: (v.bbox!.east + v.bbox!.west) / 2, distance: Math.max(0.8, (v.bbox!.north - v.bbox!.south) * 59.3 * 3), tilt: 50 })}>
                    {t('nav.goTo')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="actions">
        <button onClick={exportJson}>{t('history.export')}</button>
        <button onClick={() => file.current?.click()}>{t('history.import')}</button>
        <button className="danger" onClick={() => window.confirm(t('history.resetConfirm')) && os.resetChangeLog()}>{t('history.reset')}</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
      </div>
      {err && <p className="err-box">{err}</p>}
    </div>
  );
}
