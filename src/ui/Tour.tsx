/**
 * Guided tour (skippable). Opens on the first visit and from the "Tour" button. Each step can
 * move the camera, open a panel tab or switch a layer on, so the visitor sees the feature.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, type RightTab } from '../state/uiStore';

type Step = { key: string; tab?: RightTab; fly?: { lat: number; lon: number; distance: number; tilt?: number }; vectors?: Record<string, boolean>; left?: boolean; right?: boolean };

const STEPS: Step[] = [
  { key: 'welcome', fly: { lat: 5, lon: -40, distance: 14000, tilt: 0 }, left: false, right: false },
  { key: 'layers', left: true, right: false },
  { key: 'explorers', tab: 'explorers', right: true, vectors: { explorers: true }, fly: { lat: 0, lon: 100, distance: 13000, tilt: 0 } },
  { key: 'resources', left: true, vectors: { ice: true }, fly: { lat: 40, lon: 150, distance: 7000, tilt: 0 } },
  { key: 'landing', tab: 'landing', right: true, vectors: { zones: true }, fly: { lat: 10, lon: -40, distance: 13000, tilt: 0 } },
  { key: 'inspect', tab: 'inspect', right: true, fly: { lat: 18.44, lon: 77.45, distance: 30, tilt: 30 } },
  { key: 'routes', tab: 'routes', right: true, fly: { lat: 18.452, lon: 77.443, distance: 4, tilt: 45 } },
  { key: 'ai', tab: 'ai', right: true },
  { key: 'history', tab: 'history', right: true },
  { key: 'hud', left: false, right: false },
];

const KEY = 'marsos.tour.v1';

export function useTour() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === 'done';
    } catch {
      /* storage unavailable: show the tour */
    }
    const deep = new URLSearchParams(window.location.search);
    // shared views (deep links) open directly on what was shared
    const shared = ['lat', 'route', 'drive', 'sample', 'explorer', 'hud', 'ui'].some((k) => deep.has(k));
    if (!seen && !shared) setOpen(true);
  }, []);
  return { open, setOpen };
}

export function Tour({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(0);
  const step = STEPS[i];

  useEffect(() => {
    const st = useUI.getState();
    const patch: Record<string, unknown> = {};
    if (step.tab) patch.rightTab = step.tab;
    if (step.left !== undefined || step.right !== undefined) patch.panelsOpen = { left: step.left ?? st.panelsOpen.left, right: step.right ?? st.panelsOpen.right };
    if (step.vectors) patch.vectors = { ...st.vectors, ...step.vectors };
    if (Object.keys(patch).length) st.set(patch as never);
    if (step.fly) st.requestFlyTo(step.fly);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    try {
      localStorage.setItem(KEY, 'done');
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <div className={`tour tour-${step.key}`} role="dialog" aria-label={t('tour.label')}>
      <div className="tour-head">
        <span className="tour-count">{i + 1} / {STEPS.length}</span>
        <button className="link" onClick={close}>{t('tour.skip')}</button>
      </div>
      <h3>{t(`tour.steps.${step.key}.title`)}</h3>
      <p>{t(`tour.steps.${step.key}.text`)}</p>
      <div className="tour-dots">{STEPS.map((s, k) => <span key={s.key} className={k === i ? 'on' : ''} onClick={() => setI(k)} />)}</div>
      <div className="actions">
        {i > 0 && <button onClick={() => setI(i - 1)}>{t('tour.back')}</button>}
        {i < STEPS.length - 1 ? <button className="primary" onClick={() => setI(i + 1)}>{t('tour.next')}</button> : <button className="primary" onClick={close}>{t('tour.finish')}</button>}
      </div>
    </div>
  );
}
