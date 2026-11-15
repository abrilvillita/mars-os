/**
 * AI & proposals:
 *  - Gemini analysis of the selected cell through the MARS OS backend (key stays server-side).
 *    Errors are shown as errors — never replaced by simulated output.
 *  - Review queue: every change (AI or human) requires a human decision.
 *  - Simulated engine only in demo mode (?demo), with a separate history.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { simulateProposal, type SimScenario } from '../../ai/SimulatedAIEngine';
import { getMarsOS } from '../../api/MarsOS';
import type { AIAnalyzeResponse, ChangeProposalT } from '../../contract';
import { cellId, parseCellId, tileAt } from '../../core/geo/tiling';
import { proposalWarnings } from '../../core/proposals/ProposalService';
import { patchBBox } from '../../core/terrain/patches';
import { pickText } from '../../i18n';
import { DEMO_MODE } from '../../state/mode';
import { api } from '../../api/apiBase';
import { useUI } from '../../state/uiStore';
import { ProvBadge } from '../common';
import { useBackendStatus } from '../FeatureStatus';
import { DataWatch } from '../DataWatch';

function OriginBadge({ p }: { p: ChangeProposalT }) {
  const { t } = useTranslation();
  if (p.origin.kind === 'ai')
    return <span className="origin origin-ai">{t('ai.originAI')} · {p.origin.id}{p.origin.model ? ` (${p.origin.model})` : ''}</span>;
  return <span className="origin origin-human">{t('ai.originHuman')} · {p.origin.id}</span>;
}

function ProposalCard({ p }: { p: ChangeProposalT }) {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const preview = useUI((s) => s.previewProposalId);
  const set = useUI((s) => s.set);
  const fly = useUI((s) => s.requestFlyTo);
  const rationale = pickText(p.rationale, i18n.language);
  const warnings = proposalWarnings(p);
  const b = patchBBox(p.patches[0]);
  const togglePreview = () => {
    const next = preview === p.id ? null : p.id;
    os.proposals.preview(next);
    set({ previewProposalId: next });
  };
  const clearPreview = () => {
    if (preview === p.id) {
      os.proposals.preview(null);
      set({ previewProposalId: null });
    }
  };
  const statusKey = p.status === 'applied' ? 'applied' : p.status;
  return (
    <div className={`proposal status-${p.status} origin-${p.origin.kind}`}>
      <div className="row">
        <span className={`status-pill s-${p.status}`}>{t(`ai.status.${statusKey}`)}</span>
        {p.synthetic && <ProvBadge kind="synthetic" />}
      </div>
      <OriginBadge p={p} />
      <p className="rationale">
        {rationale.text}
        {rationale.fallback && <small className="muted"> {t('ai.untranslated')}</small>}
      </p>
      <div className="meter">
        <span>{t('ai.confidence')}</span>
        <div className="bar"><div style={{ width: `${p.confidence * 100}%` }} /></div>
        <b>{Math.round(p.confidence * 100)}%</b>
      </div>
      {p.confidenceBasis && <div className="small muted">{pickText(p.confidenceBasis, i18n.language).text}</div>}
      <div className="small">
        {t('ai.risk')}: <b className={`risk-${p.risk}`}>{t(`ai.risks.${p.risk}`)}</b> · {t('ai.patches', { count: p.patches.length })}
      </div>
      <div className="small muted">
        {t('ai.created')}: {new Date(p.createdAt).toLocaleString(i18n.language)} · {t('ai.regions')}: <span className="mono">{p.regionIds.join(', ')}</span>
      </div>
      {p.review && (
        <div className="small muted">
          {t('ai.reviewed')}: {p.review.decision} · {p.review.reviewer.id} · {new Date(p.review.at).toLocaleString(i18n.language)}
        </div>
      )}
      <details>
        <summary>{t('ai.evidence')} ({p.evidence.length})</summary>
        {p.evidence.map((e, i) => (
          <div key={i} className="evidence">
            <span className="chip">{e.kind}</span> <span className={e.verified ? 'ok' : 'warn'}>{e.verified ? t('ai.verified') : t('ai.unverified')}</span>
            {e.synthetic && <ProvBadge kind="synthetic" />}
            <div className="small">{pickText(e.description, i18n.language).text}</div>
            {e.sourceId && (
              <div className="small mono muted">
                {e.sourceId} {e.url && <a href={e.url} target="_blank" rel="noreferrer">↗</a>}
              </div>
            )}
          </div>
        ))}
      </details>
      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => <li key={w}>⚠ {t(`ai.warnings.${w}`)}</li>)}
        </ul>
      )}
      <div className="actions">
        <button onClick={() => fly({ lat: (b.north + b.south) / 2, lon: (b.east + b.west) / 2, distance: Math.max(0.6, (b.north - b.south) * 59.3 * 3), tilt: 55 })}>{t('ai.flyTo')}</button>
        {p.status === 'pending' && (
          <>
            <button onClick={togglePreview} className={preview === p.id ? 'on' : ''}>{preview === p.id ? t('ai.stopPreview') : t('ai.preview')}</button>
            <button className="primary" onClick={() => { clearPreview(); os.proposals.approve(p.id); }}>{t('ai.approve')}</button>
            <button className="danger" onClick={() => { clearPreview(); os.proposals.reject(p.id); }}>{t('ai.reject')}</button>
          </>
        )}
        {p.status === 'applied' && <button onClick={() => os.proposals.revert(p.id)}>{t('ai.revert')}</button>}
      </div>
    </div>
  );
}

// last analysis survives tab switches
let lastResult: AIAnalyzeResponse | null = null;

function GeminiPanel() {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const status = useBackendStatus();
  const pin = useUI((s) => s.pick);
  const selected = useUI((s) => s.selectedCellId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIAnalyzeResponse | null>(lastResult);
  const [submitted, setSubmitted] = useState<{ id: string; ok: boolean; errors: string[] }[]>([]);
  const cell = pin?.cellId ?? selected;
  const z = cell ? parseCellId(cell)?.z ?? 0 : 0;
  const ready = status.backend && status.ai?.configured && status.ai.model;

  const analyze = async () => {
    if (!cell) return;
    setBusy(true);
    setError(null);
    setSubmitted([]);
    try {
      const res = await fetch(api('/api/ai/analyze'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cellId: cell, clientEdits: os.terrain.activePatches().map((p) => p.id) }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      const r = j as AIAnalyzeResponse;
      lastResult = r;
      setResult(r);
      // proposals were validated server-side; the client validates again on submit
      setSubmitted(r.proposals.map((p) => {
        const v = os.proposals.submit(p);
        return { id: (p as ChangeProposalT).id, ok: v.ok, errors: v.errors };
      }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card gemini">
      <div className="card-title">{t('ai.gemini.title')}</div>
      {status.backend === null && <p className="small muted">{t('env.loading')}</p>}
      {status.backend === false && <p className="err-box">{t('ai.gemini.noBackend')}</p>}
      {status.backend && !status.ai?.configured && <p className="warn-box">{t('ai.gemini.notConfigured')}</p>}
      {status.backend && status.ai?.configured && !status.ai.model && <p className="err-box">{t('ai.gemini.modelError')}: {status.ai.error}</p>}
      {ready && <p className="small muted">{t('ai.gemini.ready', { model: status.ai!.model })}</p>}
      <p className="small">{cell ? <>{t('nodes.cell')}: <span className="mono">{cell}</span></> : t('ai.gemini.needCell')}</p>
      {cell && z < 6 && <p className="warn-box small">{t('ai.gemini.tooLarge')}</p>}
      <button className="primary" disabled={!ready || !cell || z < 6 || busy} onClick={analyze}>
        {busy ? t('ai.gemini.running') : t('ai.gemini.analyze')}
      </button>
      {error && <p className="err-box">{t('ai.gemini.failed')}: {error}</p>}
      {result && (
        <div className="analysis">
          <div className="small muted">{result.model} · {new Date(result.analyzedAt).toLocaleString(i18n.language)} · <span className="mono">{result.cellId}</span></div>
          <p>{pickText(result.analysis.summary, i18n.language).text}</p>
          <details open>
            <summary>{t('ai.gemini.dataUsed')}</summary>
            <table className="wx">
              <tbody>
                {result.pack.products.map((p) => (
                  <tr key={p.ref}><td className="mono">{p.ref}</td><td>{p.name}</td><td>{p.metersPerPixel} m/px</td></tr>
                ))}
              </tbody>
            </table>
            {result.pack.discrepancies.map((d) => (
              <div key={d.pair} className="small mono">{d.pair}: n={d.count} · mean {d.meanDiff_m} m · rms {d.rms_m} m · max {d.maxAbs_m} m</div>
            ))}
            <div className="small muted">{t('ai.gemini.packCounts', { nodes: result.pack.nodeCount, wps: result.pack.waypointCount })}</div>
          </details>
          {result.analysis.findings.map((f, i) => (
            <div key={i} className="finding">
              <b>{pickText(f.title, i18n.language).text}</b>
              <div className="small">{pickText(f.detail, i18n.language).text}</div>
              <div className="small mono muted">{f.evidenceRefs.join(', ')}</div>
            </div>
          ))}
          <p className="small">{t('ai.gemini.proposalsCount', { n: result.proposals.length })}</p>
          {submitted.filter((s) => !s.ok).map((s) => <p key={s.id} className="err-box small">{s.id}: {s.errors.join('; ')}</p>)}
          {result.rejected.map((r) => (
            <p key={r.index} className="warn-box small">{t('ai.gemini.rejectedDraft', { n: r.index + 1 })}: {r.reasons.join('; ')}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function DemoEngine() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const cam = useUI((s) => s.camera);
  const simulate = (sc: SimScenario) => {
    const cell = cellId(tileAt(cam.lat, cam.lon, 12));
    os.proposals.submit(simulateProposal(sc, cam.lat, cam.lon, cell));
  };
  return (
    <div className="card demo-card">
      <div className="card-title">{t('ai.simulate')} <ProvBadge kind="synthetic" /></div>
      <div className="actions">
        <button onClick={() => simulate('obstacle')}>{t('ai.simObstacle')}</button>
        <button onClick={() => simulate('news')}>{t('ai.simNews')}</button>
        <button onClick={() => simulate('rover')}>{t('ai.simRover')}</button>
      </div>
      <small className="muted">{t('ai.simNote')}</small>
    </div>
  );
}

type Filter = 'all' | 'pending' | 'applied' | 'rejected';

export function AITab() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const [list, setList] = useState(os.proposals.list());
  const [filter, setFilter] = useState<Filter>('all');
  useEffect(() => os.on('proposals:changed', () => setList(os.proposals.list())), [os]);
  const shown = list.filter((p) => filter === 'all' || (filter === 'rejected' ? p.status === 'rejected' || p.status === 'reverted' : p.status === filter));

  return (
    <div className="ai">
      <p className="ok-box small">{t('ai.humanApproval')}</p>
      <DataWatch />
      <GeminiPanel />
      {DEMO_MODE && <DemoEngine />}
      <div className="row">
        <b>{t('ai.title')}</b>
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          {(['all', 'pending', 'applied', 'rejected'] as const).map((f) => <option key={f} value={f}>{t(`ai.filter.${f}`)}</option>)}
        </select>
      </div>
      {shown.length === 0 ? <p className="empty">{t('ai.empty')}</p> : shown.map((p) => <ProposalCard key={p.id} p={p} />)}
    </div>
  );
}
