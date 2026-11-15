import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../../api/MarsOS';
import { MARS_SCALE_HEIGHT_KM } from '../../core/geo/mars';
import { fetchWeather, type WeatherSol } from '../../core/live/m20';
import { pickText } from '../../i18n';
import { useUI } from '../../state/uiStore';
import { KV, ProvBadge, Section, Toggle, fmtM } from '../common';
import { RemsChart } from '../RemsChart';

export function EnvironmentTab() {
  const { t, i18n } = useTranslation();
  const os = getMarsOS();
  const env = useUI((s) => s.env);
  const cam = useUI((s) => s.camera);
  const set = useUI((s) => s.set);
  const [weather, setWeather] = useState<WeatherSol[] | null>(null);
  const [werr, setWerr] = useState(false);
  useEffect(() => {
    fetchWeather().then(setWeather).catch(() => setWerr(true));
  }, []);
  const refs = os.catalog.referenceValues();
  const h = os.terrain.heightAt(cam.lat, cam.lon).height_m;
  const pModel = 610 * Math.exp(-h / 1000 / MARS_SCALE_HEIGHT_KM);
  const latest = weather?.filter((w) => w.minTempC !== null || w.pressurePa !== null).slice(-1)[0];

  return (
    <div className="env">

      <Section title={t('env.weather')}>
        {werr && <p className="err-box">{t('env.error')}</p>}
        {!weather && !werr && <p className="muted">{t('env.loading')}</p>}
        {weather && (
          <>
            <p className="warn-box small">{t('env.notLive', { date: latest?.terrestrialDate ?? '—' })} <ProvBadge kind="measured" /></p>
            <table className="wx">
              <thead>
                <tr><th>{t('env.sol')}</th><th>{t('env.date')}</th><th>{t('env.minT')}</th><th>{t('env.maxT')}</th><th>{t('env.pressure')}</th></tr>
              </thead>
              <tbody>
                {weather.slice().reverse().map((w) => (
                  <tr key={w.sol}>
                    <td className="mono">{w.sol}</td>
                    <td className="mono small">{w.terrestrialDate}</td>
                    <td>{w.minTempC !== null ? `${w.minTempC} °C` : '—'}</td>
                    <td>{w.maxTempC !== null ? `${w.maxTempC} °C` : '—'}</td>
                    <td>{w.pressurePa !== null ? `${w.pressurePa} Pa` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <small className="muted">Mars 2020 MEDA · NASA/JPL-Caltech/CAB(CSIC-INTA)</small>
          </>
        )}
      </Section>

      <Section title={t('rems.title')}>
        <RemsChart />
      </Section>

      <Section title={t('env.radiation')}>
        {refs.map((r) => {
          const src = os.catalog.source(r.sourceIds[0]);
          return (
            <div key={r.id} className="card">
              <div className="card-title">{pickText(r.label, i18n.language).text}</div>
              <div className="big mono">{r.value}{r.uncertainty !== null && ` ± ${r.uncertainty}`} {r.unit}</div>
              <ProvBadge kind={r.provenance} />
              {r.period && <div className="small muted">{r.period.start} → {r.period.end}</div>}
              {r.notes && <p className="note">{pickText(r.notes, i18n.language).text}</p>}
              {src && <div className="small cite">{src.citation} <a href={src.url} target="_blank" rel="noreferrer">↗</a></div>}
            </div>
          );
        })}
      </Section>

      <Section title={t('env.pressureModel')}>
        <KV k={t('inspect.elevation')}>{fmtM(h)}</KV>
        <div className="big mono">≈ {pModel.toFixed(0)} Pa</div>
        <ProvBadge kind="modeled" />
        <p className="note">{t('env.pressureModelNote')}</p>
      </Section>
      <Section title={t('env.scene')} defaultOpen={false}>
        <Toggle checked={env.dustStorm} onChange={(v) => set({ env: { ...env, dustStorm: v } })} label={<>{t('env.storm')} <ProvBadge kind="synthetic" /></>} hint={t('env.stormHint')} />
        {env.dustStorm && (
          <>
            <label className="field-label">{t('env.intensity')} <b>{Math.round(env.stormIntensity * 100)}%</b></label>
            <input type="range" min={0.1} max={1} step={0.05} value={env.stormIntensity} onChange={(e) => set({ env: { ...env, stormIntensity: +e.target.value } })} />
          </>
        )}
        <Toggle checked={env.atmosphere} onChange={(v) => set({ env: { ...env, atmosphere: v } })} label={t('env.atmosphere')} />
        <Toggle checked={env.moons} onChange={(v) => set({ env: { ...env, moons: v } })} label={t('env.moons')} hint={t('env.moonNote')} />
        <Toggle checked={env.stars} onChange={(v) => set({ env: { ...env, stars: v } })} label={t('env.stars')} />
      </Section>
    </div>
  );
}
