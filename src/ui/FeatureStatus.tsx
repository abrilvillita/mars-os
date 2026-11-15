/**
 * Honest, live list of what is scientifically verified, what needs configuration and what is
 * a simulation. Statuses for the backend and Gemini are checked at runtime, not assumed.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import { api } from '../api/apiBase';

type S = 'verified' | 'config' | 'simulation' | 'unavailable';

export function useBackendStatus() {
  const [s, setS] = useState<{ backend: boolean | null; ai: { configured: boolean; model: string | null; error: string | null } | null }>({ backend: null, ai: null });
  useEffect(() => {
    let alive = true;
    // a free-tier host may need ~1 min to wake up: allow it
    fetch(api('/api/health'), { signal: AbortSignal.timeout(75_000) })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => fetch(api('/api/ai/status')).then((r) => r.json()))
      .then((ai) => alive && setS({ backend: true, ai }))
      .catch(() => alive && setS({ backend: false, ai: null }));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

export function FeatureStatus() {
  const { t } = useTranslation();
  const st = useBackendStatus();
  const os = getMarsOS();
  const onDemand = os.terrain.onDemandStatus();
  const rows: [string, S][] = [
    ['featureStatus.imagery', 'verified'],
    ['featureStatus.elevation', 'verified'],
    ['featureStatus.ctx', 'verified'],
    ['featureStatus.rover', 'verified'],
    ['featureStatus.time', 'verified'],
    ['featureStatus.history', 'verified'],
    ['featureStatus.routes', 'verified'],
    ['featureStatus.minerals', 'verified'],
    ['featureStatus.hud', 'verified'],
    ['featureStatus.onDemand', st.backend === false ? 'unavailable' : onDemand.error ? 'unavailable' : 'verified'],
    ['featureStatus.gemini', st.ai?.configured && st.ai.model ? 'verified' : st.backend === false ? 'unavailable' : 'config'],
    ['featureStatus.storm', 'simulation'],
    ['featureStatus.moons', 'simulation'],
    ['featureStatus.demoEngine', 'simulation'],
  ];
  return (
    <table className="feature-status">
      <tbody>
        {rows.map(([k, s]) => (
          <tr key={k}>
            <td>{t(k)}</td>
            <td><span className={`fs fs-${s}`}>{t(`featureStatus.s.${s}`)}</span></td>
          </tr>
        ))}
      </tbody>
      {st.ai?.model && <caption className="small muted">Gemini: {st.ai.model}</caption>}
    </table>
  );
}
