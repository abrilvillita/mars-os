/** Small presentational building blocks shared by panels. */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProvenanceT } from '../contract';

export function Section({ title, children, defaultOpen = true, right }: { title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`section ${open ? 'open' : ''}`}>
      <header>
        <button className="section-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="chev">{open ? '▾' : '▸'}</span> {title}
        </button>
        {right}
      </header>
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}

export function ProvBadge({ kind }: { kind: ProvenanceT }) {
  const { t } = useTranslation();
  return <span className={`prov prov-${kind}`}>{t(`prov.${kind}`)}</span>;
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden />
      <span className="toggle-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function KV({ k, children }: { k: ReactNode; children: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{children}</span>
    </div>
  );
}

export function fmtM(m: number | null | undefined, digits = 0) {
  if (m === null || m === undefined || !isFinite(m)) return '—';
  if (Math.abs(m) >= 1000) return `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km`;
  if (Math.abs(m) < 1 && m !== 0) return `${(m * 100).toFixed(0)} cm`;
  return `${m.toFixed(digits)} m`;
}
