import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { simulateProposal, type SimScenario } from '../../ai/SimulatedAIEngine';
import { getMarsOS } from '../../api/MarsOS';
import type { ChangeProposalT } from '../../contract';
import { cellId, tileAt } from '../../core/geo/tiling';
import { proposalWarnings } from '../../core/proposals/ProposalService';
import { patchBBox } from '../../core/terrain/patches';
import { pickText } from '../../i18n';
import { useUI } from '../../state/uiStore';
import { ProvBadge } from '../common';

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
  return (
    <div className={`proposal status-${p.status}`}>
      <div className="row">
        <span className={`status-pill s-${p.status}`}>{t(`ai.status.${p.status}`)}</span>
        <ProvBadge kind={p.origin.kind === 'ai' ? 'ai_proposed' : 'human_edit'} />
        {p.synthetic && <ProvBadge kind="synthetic" />}
      </div>
      <p className="rationale">
        {rationale.text}
        {rationale.fallback && <small className="muted"> {t('ai.untranslated')}</small>}
      </p>
      <div className="meter">
        <span>{t('ai.confidence')}</span>
        <div className="bar"><div style={{ width: `${p.confidence * 100}%` }} /></div>
        <b>{Math.round(p.confidence * 100)}%</b>
      </div>
      <div className="small">
        {t('ai.risk')}: <b className={`risk-${p.risk}`}>{t(`ai.risks.${p.risk}`)}</b> · {t('ai.patches', { count: p.patches.length })} · {t('ai.origin')}: <span className="mono">{p.origin.id}</span>
      </div>
      <details>
        <summary>{t('ai.evidence')} ({p.evidence.length})</summary>
        {p.evidence.map((e, i) => (
          <div key={i} className="evidence">
            <span className="chip">{e.kind}</span> <span className={e.verified ? 'ok' : 'warn'}>{e.verified ? t('ai.verified') : t('ai.unverified')}</span>
            {e.synthetic && <ProvBadge kind="synthetic" />}
            <div className="small">{pickText(e.description, i18n.language).text}</div>
            {e.sourceId && <div className="small mono muted">{e.sourceId}</div>}
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

export function AITab() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const cam = useUI((s) => s.camera);
  const [list, setList] = useState(os.proposals.list());
  const [policy, setPolicy] = useState(os.proposals.getPolicy());
  useEffect(() => os.on('proposals:changed', () => { setList(os.proposals.list()); setPolicy(os.proposals.getPolicy()); }), [os]);

  const simulate = (sc: SimScenario) => {
    const cell = cellId(tileAt(cam.lat, cam.lon, 12));
    const p = simulateProposal(sc, cam.lat, cam.lon, cell);
    os.proposals.submit(p);
  };

  return (
    <div className="ai">
      <div className="card">
        <div className="card-title">{t('ai.policy')}</div>
        <label className="radio"><input type="radio" checked={policy.mode === 'manual'} onChange={() => os.proposals.setPolicy({ mode: 'manual' })} /> {t('ai.manual')}</label>
        <label className="radio"><input type="radio" checked={policy.mode === 'auto'} onChange={() => os.proposals.setPolicy({ mode: 'auto' })} /> {t('ai.auto')}</label>
        <small className="muted">{t('ai.autoHint', { c: Math.round(policy.autoMinConfidence * 100) })}</small>
      </div>
      <div className="card">
        <div className="card-title">{t('ai.simulate')}</div>
        <div className="actions">
          <button onClick={() => simulate('obstacle')}>{t('ai.simObstacle')}</button>
          <button onClick={() => simulate('news')}>{t('ai.simNews')}</button>
          <button onClick={() => simulate('rover')}>{t('ai.simRover')}</button>
        </div>
        <small className="muted">{t('ai.simNote')}</small>
      </div>
      {list.length === 0 ? <p className="empty">{t('ai.empty')}</p> : list.map((p) => <ProposalCard key={p.id} p={p} />)}
      <p className="small muted mono">{t('ai.api')}</p>
    </div>
  );
}
