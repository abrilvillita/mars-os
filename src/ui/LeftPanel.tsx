import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMarsOS } from '../api/MarsOS';
import type { LayerT } from '../contract';
import { pickText } from '../i18n';
import { useUI, type DisplayMode } from '../state/uiStore';
import { ProvBadge, Section, Segmented, Toggle, fmtM } from './common';
import { SampleCatalog } from './tabs/SamplesPanel';

const BASE_IDS = ['layer.viking.color', 'layer.mola.shade', 'layer.themis.day', 'layer.themis.night'];
const OVERLAY_IDS = ['layer.jezero.ctx', 'layer.jezero.hirise', 'layer.geology.sim3292'];

function LayerInfo({ layer }: { layer: LayerT }) {
  const { t } = useTranslation();
  const os = getMarsOS();
  const sources = layer.sourceIds.map((id) => os.catalog.source(id)).filter(Boolean);
  const enc = layer.valueEncoding;
  return (
    <div className="layer-info">
      <div className="layer-official">{layer.name}</div>
      <div className="badges">
        <ProvBadge kind={layer.provenance} />
        <span className="chip">{enc.type === 'visual' ? t('layers.visual') : enc.type === 'physical' ? t('layers.physical', { unit: enc.unit }) : t('layers.categorical')}</span>
      </div>
      <dl>
        <dt>{t('layers.resolution')}</dt>
        <dd>{layer.resolution.metersPerPixel ? `${fmtM(layer.resolution.metersPerPixel, 2)}/px` : layer.resolution.mapScale ? `${t('layers.mapScale')} ${layer.resolution.mapScale}` : '—'}</dd>
        <dt>{t('layers.coverage')}</dt>
        <dd>{layer.coverage.global ? t('layers.global') : `${t('layers.regional')} · ${layer.coverage.bbox.south.toFixed(2)}…${layer.coverage.bbox.north.toFixed(2)}°N, ${layer.coverage.bbox.west.toFixed(2)}…${layer.coverage.bbox.east.toFixed(2)}°E`}</dd>
        {layer.access.protocol === 'wmts' && (<><dt>{t('layers.maxZoom')}</dt><dd>z{layer.access.maxZoom}{layer.access.fallback ? ` · offline z${layer.access.fallback.maxZoom}` : ` · ${t('layers.offlineUnavailable')}`}</dd></>)}
        {sources.map((s) => (
          <div key={s!.id} className="src">
            <dt>{s!.mission ?? s!.agency}</dt>
            <dd>
              {s!.instrument && <b>{s!.instrument} · </b>}{s!.title}
              {s!.publishedAt && <> · {t('layers.published')} {s!.publishedAt}</>}
              {s!.citation && <div className="cite">{s!.citation}</div>}
              <a href={s!.landingPage ?? s!.url} target="_blank" rel="noreferrer">{t('layers.openSource')} ↗</a>
            </dd>
          </div>
        ))}
      </dl>
      {layer.notes && <p className="note">{layer.notes}</p>}
    </div>
  );
}

function LayerRow({ layer, control, opacity, onOpacity }: { layer: LayerT; control: React.ReactNode; opacity?: number; onOpacity?: (v: number) => void }) {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState(false);
  return (
    <div className="layer-row">
      <div className="layer-line">
        {control}
        <span className="layer-label">
          {pickText(layer.label, i18n.language).text}
          <small>{layer.resolution.metersPerPixel ? `${fmtM(layer.resolution.metersPerPixel, 2)}/px` : layer.resolution.mapScale}</small>
        </span>
        <button className={`icon small ${info ? 'on' : ''}`} onClick={() => setInfo(!info)} title={t('layers.info')} aria-expanded={info}>i</button>
      </div>
      {onOpacity && opacity !== undefined && (
        <input className="opacity" type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => onOpacity(+e.target.value)} aria-label={t('layers.opacity')} />
      )}
      {info && <LayerInfo layer={layer} />}
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const mode = useUI((s) => s.displayMode);
  const cam = useUI((s) => s.camera);
  if (mode === 'slope') {
    const res = cam.lat > 15.5 && cam.lat < 21.5 && cam.lon > 74.5 && cam.lon < 80.5 ? '1.85 km' : '14.8 km';
    return (
      <div className="legend">
        <div className="legend-title">{t('legend.slope')}</div>
        <div className="ramp slope-ramp" />
        <div className="ramp-labels"><span>0°</span><span>5°</span><span>15°</span><span>25°</span><span>35°+</span></div>
        <p className="note">{t('legend.slopeNote', { res })}</p>
      </div>
    );
  }
  if (mode === 'hypsometric') {
    return (
      <div className="legend">
        <div className="legend-title">{t('legend.hypso')}</div>
        <div className="ramp hypso-ramp" />
        <div className="ramp-labels"><span>{cam.distance > 4000 ? '−8.2 km' : 'min'}</span><span>{cam.distance > 4000 ? '+21.2 km' : 'max'}</span></div>
      </div>
    );
  }
  if (mode === 'edits') {
    return (
      <div className="legend chips">
        <span className="chip c-raised">{t('legend.raised')}</span>
        <span className="chip c-lowered">{t('legend.lowered')}</span>
        <span className="chip c-pending">{t('legend.pending')}</span>
      </div>
    );
  }
  return (
    <div className="legend chips">
      <span className="chip c-selected">{t('legend.selected')}</span>
      <span className="chip c-hirise">{t('legend.hirise')}</span>
      <span className="chip c-pending">{t('legend.pending')}</span>
    </div>
  );
}

export function LeftPanel() {
  const { t } = useTranslation();
  const os = getMarsOS();
  const s = useUI();
  const layers = (ids: string[]) => ids.map((id) => os.catalog.layer(id)).filter((l): l is LayerT => !!l);
  const elev = layers(['layer.elevation.ctx.jezero', 'layer.elevation.mola.128ppd', 'layer.elevation.mola.jezero', 'layer.elevation.mola.global']);

  return (
    <aside className={`panel left ${s.panelsOpen.left ? '' : 'collapsed'}`}>
      <button className="collapse" onClick={() => s.set({ panelsOpen: { ...s.panelsOpen, left: !s.panelsOpen.left } })} aria-label="toggle">{s.panelsOpen.left ? '‹' : '›'}</button>
      {s.panelsOpen.left && (
        <div className="panel-scroll">
          <Section title={t('layers.base')}>
            {layers(BASE_IDS).map((l) => (
              <LayerRow key={l.id} layer={l} control={<input type="radio" name="base" checked={s.baseLayerId === l.id} onChange={() => s.set({ baseLayerId: l.id })} />} />
            ))}
          </Section>
          <Section title={t('layers.overlays')}>
            {layers(OVERLAY_IDS).map((l) => (
              <LayerRow
                key={l.id}
                layer={l}
                control={<input type="checkbox" checked={!!s.overlays[l.id]?.on} onChange={(e) => s.setOverlay(l.id, { on: e.target.checked })} />}
                opacity={s.overlays[l.id]?.on ? s.overlays[l.id].opacity : undefined}
                onOpacity={(v) => s.setOverlay(l.id, { opacity: v })}
              />
            ))}
          </Section>
          <Section title={t('layers.elevation')} defaultOpen={false}>
            {elev.map((l) => (
              <LayerRow key={l.id} layer={l} control={<span className="dot-elev" />} />
            ))}
          </Section>
          <Section title={t('layers.vectors')}>
            <Toggle checked={s.vectors.traverse} onChange={(v) => s.set({ vectors: { ...s.vectors, traverse: v } })} label={t('layers.traverse')} hint={t('layers.traverseHint')} />
            <Toggle checked={s.vectors.placesTraverse} onChange={(v) => s.set({ vectors: { ...s.vectors, placesTraverse: v } })} label={t('layers.placesTraverse')} hint={t('layers.placesHint')} />
            <Toggle checked={s.vectors.waypoints} onChange={(v) => s.set({ vectors: { ...s.vectors, waypoints: v } })} label={t('layers.waypoints')} />
            <Toggle checked={s.vectors.explorers} onChange={(v) => s.set({ vectors: { ...s.vectors, explorers: v } })} label={t('layers.explorers')} hint={t('layers.explorersHint')} />
            <Toggle checked={s.vectors.regions} onChange={(v) => s.set({ vectors: { ...s.vectors, regions: v } })} label={t('layers.regions')} />
          </Section>
          <Section title={t('layers.resources')}>
            <Toggle checked={s.vectors.samples} onChange={(v) => s.set({ vectors: { ...s.vectors, samples: v } })} label={t('layers.samples')} hint={t('layers.samplesHint')} />
            {s.vectors.samples && <SampleCatalog />}
            <Toggle checked={s.vectors.minerals} onChange={(v) => s.set({ vectors: { ...s.vectors, minerals: v } })} label={t('layers.minerals')} hint={t('layers.mineralsHint')} />
            {s.vectors.minerals && (
              <div className="legend chips">
                <span className="chip"><span className="swatch" style={{ background: 'rgb(51,204,0)' }} /> {t('minerals.carbonate')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(0,153,255)' }} /> {t('minerals.phyllosilicate')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(153,0,204)' }} /> {t('minerals.silica')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(255,102,153)' }} /> {t('minerals.sulfate')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(255,255,0)' }} /> {t('minerals.chloride')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(255,0,0)' }} /> {t('minerals.hydrousCrism')}</span>
                <span className="chip"><span className="swatch" style={{ background: 'rgb(220,240,255)' }} /> {t('minerals.hydrousOmega')}</span>
              </div>
            )}
            <Toggle checked={s.vectors.crism} onChange={(v) => s.set({ vectors: { ...s.vectors, crism: v } })} label={t('layers.crism')} hint={t('layers.crismHint')} />
          </Section>
          <Section title={t('view.title')}>
            <div className="field-label">{t('view.mode')}</div>
            <Segmented<DisplayMode>
              value={s.displayMode}
              onChange={(v) => s.set({ displayMode: v })}
              options={(['imagery', 'hypsometric', 'slope', 'edits'] as const).map((m) => ({ value: m, label: t(`view.modes.${m}`) }))}
            />
            <Legend />
            <Toggle checked={s.realLighting} onChange={(v) => s.set({ realLighting: v })} label={t('view.lighting')} hint={t('view.lightingHint')} />
            <div className="field-label">
              {t('view.exaggeration')} <b>×{s.exaggeration}</b>
            </div>
            <input type="range" min={1} max={10} step={1} value={s.exaggeration} onChange={(e) => s.set({ exaggeration: +e.target.value })} />
            <small className="muted">{t('view.exaggerationHint')}</small>
            <Toggle checked={s.forceOffline} onChange={(v) => s.set({ forceOffline: v })} label={t('view.offline')} />
            <div className={`net-status ${s.tileStatus.offline ? 'off' : 'on'}`}>
              {s.tileStatus.offline ? t('status.offline') : t('status.live')}
              {s.tileStatus.failures > 0 && <small> · {t('status.failures', { count: s.tileStatus.failures })}</small>}
            </div>
          </Section>
        </div>
      )}
    </aside>
  );
}
