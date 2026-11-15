/**
 * Curiosity REMS: every published daily summary (min/max air temperature, pressure) as a
 * time series over the whole mission. Shows the seasonal pressure cycle (CO2 freezing onto
 * the polar caps and returning) — a measurement, not a model.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRemsWeather } from '../core/live/msl';
import type { WeatherSol } from '../core/live/m20';
import { ProvBadge } from './common';

function Series({ data, pick, color, unit, label, lo, hi }: { data: WeatherSol[]; pick: (w: WeatherSol) => number | null; color: string; unit: string; label: string; lo?: number; hi?: number }) {
  const W = 320, H = 90;
  const pts = data.map((w) => ({ x: w.sol, y: pick(w) })).filter((p): p is { x: number; y: number } => p.y !== null);
  if (pts.length < 2) return null;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
  const ys = pts.map((p) => p.y);
  const y0 = lo ?? Math.min(...ys), y1 = hi ?? Math.max(...ys);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(((p.x - x0) / (x1 - x0)) * W).toFixed(1)},${(H - 6 - ((p.y - y0) / Math.max(1e-6, y1 - y0)) * (H - 12)).toFixed(1)}`).join(' ');
  return (
    <figure className="rems">
      <figcaption className="small">{label} <span className="muted">({Math.round(Math.min(...ys))} … {Math.round(Math.max(...ys))} {unit})</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        <path d={d} fill="none" stroke={color} strokeWidth="0.8" />
        <text x="2" y="10" className="axis">{Math.round(y1)} {unit}</text>
        <text x="2" y={H - 2} className="axis">{Math.round(y0)} {unit}</text>
        <text x={W - 2} y={H - 2} className="axis" textAnchor="end">sol {x1}</text>
      </svg>
    </figure>
  );
}

export function RemsChart() {
  const { t } = useTranslation();
  const [data, setData] = useState<WeatherSol[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    fetchRemsWeather().then(setData).catch(() => setErr(true));
  }, []);
  const sorted = useMemo(() => (data ? [...data].sort((a, b) => a.sol - b.sol) : null), [data]);
  if (err) return <p className="err-box">{t('env.error')}</p>;
  if (!sorted) return <p className="muted">{t('env.loading')}</p>;
  const last = sorted[sorted.length - 1];
  return (
    <div>
      <p className="small">{t('rems.intro', { n: sorted.length.toLocaleString(), from: sorted[0].terrestrialDate, to: last.terrestrialDate })} <ProvBadge kind="measured" /></p>
      <Series data={sorted} pick={(w) => w.pressurePa} color="#7fd1ff" unit="Pa" label={t('rems.pressure')} />
      <Series data={sorted} pick={(w) => w.maxTempC} color="#ff9a5c" unit="°C" label={t('rems.maxT')} />
      <Series data={sorted} pick={(w) => w.minTempC} color="#9cb6ff" unit="°C" label={t('rems.minT')} />
      <p className="note">{t('rems.note')} <a href="https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json" target="_blank" rel="noreferrer">REMS feed</a></p>
    </div>
  );
}
