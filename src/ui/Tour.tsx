/**
 * Guided tour (skippable). Opens on the first visit and from the "Tour" button. Each step can
 * move the camera, open a panel tab or switch a layer on, so the visitor sees the feature.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUI, type RightTab } from '../state/uiStore';
import { useRoutes } from '../state/routeStore';
import { useMission } from '../state/missionStore';
import { m20Last } from '../render/overlays/ExplorersLayer';

type Step = { key: string; tab?: RightTab; fly?: { lat: number; lon: number; distance: number; tilt?: number; heading?: number }; vectors?: Record<string, boolean>; left?: boolean; right?: boolean; hud?: boolean; action?: () => (() => void) | void };

/** Start Perseverance's real drive (sols 13–100) and let the 3D rover drive it. */
function startDrive() {
  let alive = true;
  import('./tabs/RoutesTab').then(({ loadRealDrive }) => {
    if (!alive) return;
    loadRealDrive(13, 100);
    const unsub = useRoutes.subscribe((st) => {
      if (st.result?.ok && st.actualRoute) {
        unsub();
        if (alive) setTimeout(() => alive && useRoutes.getState().set({ driving: true }), 1200);
      }
    });
  });
  return () => {
    alive = false;
    useRoutes.getState().set({ driving: false });
  };
}

const STEPS: Step[] = [
  { key: 'welcome', fly: { lat: 5, lon: -40, distance: 14000, tilt: 0 }, left: false, right: false },
  { key: 'layers', left: true, right: false },
  { key: 'explorers', tab: 'explorers', right: true, vectors: { explorers: true }, fly: { lat: 0, lon: 100, distance: 13000, tilt: 0 } },
  {
    key: 'rovers3d', left: false, right: false, vectors: { explorers: true },
    action: () => {
      const p = m20Last() ?? { lat: 18.43559, lon: 77.23322 };
      useUI.getState().requestFlyTo({ lat: p.lat, lon: p.lon, distance: 0.016, tilt: 72, heading: 200 });
    },
  },
  { key: 'resources', left: true, vectors: { ice: true }, fly: { lat: 40, lon: 150, distance: 7000, tilt: 0 } },
  { key: 'landing', tab: 'landing', right: true, vectors: { zones: true }, fly: { lat: 10, lon: -40, distance: 13000, tilt: 0 } },
  {
    key: 'mission', tab: 'mission', right: true, left: false, fly: { lat: 46.3292, lon: 176.9, distance: 0.12, tilt: 66, heading: 20 },
    action: () => useMission.getState().set({ site: { lat: 46.33, lon: 176.9 }, inputs: { ...useMission.getState().inputs, kind: 'base' }, question: 'Can a crew reach water ice from this base?' }),
  },
  { key: 'inspect', tab: 'inspect', right: true, fly: { lat: 18.44, lon: 77.45, distance: 30, tilt: 30 } },
  { key: 'routes', tab: 'routes', right: true, left: false, action: startDrive },
  { key: 'ai', tab: 'ai', right: true },
  { key: 'history', tab: 'history', right: true },
  { key: 'hud', left: false, right: false, hud: true, fly: { lat: 18.4446, lon: 77.4509, distance: 0.03, tilt: 80 } },
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
    const shared = ['lat', 'route', 'drive', 'sample', 'explorer', 'hud', 'ui', 'mission', 'spin', 'tab', 'ice', 'zones', 'embed'].some((k) => deep.has(k));
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
    st.set({ hud: !!step.hud });
    if (step.fly) st.requestFlyTo(step.fly);
    const undo = step.action?.();
    return () => {
      if (typeof undo === 'function') undo();
    };
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => {
    const st = useUI.getState();
    st.set({ panelsOpen: { left: true, right: true }, hud: false });
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
