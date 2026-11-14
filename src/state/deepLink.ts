/**
 * Shareable views: open MARS OS at a given camera, time, layer and pinned location.
 *
 *   ?lat=18.4446&lon=77.4509&dist=1.4&tilt=62&heading=300
 *   &time=2026-11-14T15:00:00Z   (UTC; sets the real sun position, paused)
 *   &mode=imagery|hypsometric|slope|edits  &base=layer.mola.shade
 *   &tab=inspect|nodes|ai|history|environment|photos
 *   &pin=18.4446,77.4509          (pins a location in the inspector)
 *   &places=1                     (shows the PDS PLACES traverse)
 *   &panels=0                     (hides both side panels)
 *   &ui=0                         (presentation mode: only the planet, no interface)
 */
import { cellId, tileAt } from '../core/geo/tiling';
import { renderBridge } from '../render/bridge';
import { useUI, type DisplayMode, type RightTab } from './uiStore';

const num = (v: string | null) => (v !== null && v.trim() !== '' && isFinite(+v) ? +v : null);

export function applyDeepLink(search = window.location.search) {
  const q = new URLSearchParams(search);
  const lat = num(q.get('lat')), lon = num(q.get('lon'));
  const st = useUI.getState();
  if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    Object.assign(renderBridge.rig, {
      lat,
      lon,
      distance: Math.max(0.004, Math.min(45000, num(q.get('dist')) ?? 200)),
      tilt: Math.max(0, Math.min(88, num(q.get('tilt')) ?? 0)),
      heading: ((num(q.get('heading')) ?? 0) % 360 + 360) % 360,
    });
  }
  const time = q.get('time');
  if (time && !isNaN(Date.parse(time))) {
    renderBridge.clock.epochMs = Date.parse(time);
    st.set({ time: { epochMs: renderBridge.clock.epochMs, speed: 1, playing: false } });
  }
  const mode = q.get('mode') as DisplayMode | null;
  if (mode && ['imagery', 'hypsometric', 'slope', 'edits'].includes(mode)) st.set({ displayMode: mode });
  const base = q.get('base');
  if (base && /^layer\.[a-z0-9._-]+$/.test(base)) st.set({ baseLayerId: base });
  const tab = q.get('tab') as RightTab | null;
  if (tab && ['inspect', 'nodes', 'ai', 'history', 'environment', 'photos'].includes(tab)) st.set({ rightTab: tab });
  const pin = q.get('pin')?.split(',').map(Number);
  if (pin && pin.length === 2 && pin.every(isFinite)) {
    const id = cellId(tileAt(pin[0], pin[1], st.cellZoom));
    st.set({ pick: { lat: pin[0], lon: pin[1], distanceKm: 0, cellId: id, cellZoom: st.cellZoom, pinnedAt: Date.now() }, selectedCellId: id });
  }
  if (q.get('places') === '1') st.set({ vectors: { ...useUI.getState().vectors, placesTraverse: true } });
  if (q.get('panels') === '0') st.set({ panelsOpen: { left: false, right: false } });
  if (q.get('ui') === '0') document.body.classList.add('presentation');
}
