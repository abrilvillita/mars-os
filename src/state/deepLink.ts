/**
 * Shareable views: open MARS OS at a given camera, time, layer and pinned location.
 *
 *   ?lat=18.4446&lon=77.4509&dist=1.4&tilt=62&heading=300
 *   &time=2026-11-14T15:00:00Z   (UTC; sets the real sun position, paused)
 *   &mode=imagery|hypsometric|slope|edits  &base=layer.mola.shade
 *   &tab=inspect|nodes|ai|history|environment|photos
 *   &pin=18.4446,77.4509          (pins a location in the inspector)
 *   &places=1                     (shows the PDS PLACES traverse)
 *   &minerals=1                   (shows orbital mineral detections and CRISM HumEx footprints)
 *   &panels=0                     (hides both side panels)
 *   &ui=0                         (presentation mode: only the planet, no interface)
 *   &hud=1                        (helmet visor HUD; with &route=… it guides along the low-slope route)
 *   &cachecam=196                 (opens the CacheCam sample-handling images of a sol)
 *   &walk=1                       (with &hud=1&route=…: walks the route automatically)
 *   &route=lat,lon;lat,lon        (compares routes A → B; opens the Routes tab)
 *   &profile=astronaut            (route profile; default rover)
 *   &drive=340,360                (loads Perseverance's real drive between two sols as A → B)
 */
import { cellId, tileAt } from '../core/geo/tiling';
import { renderBridge } from '../render/bridge';
import { useUI, type DisplayMode, type RightTab } from './uiStore';
import { useRoutes } from './routeStore';

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
  if (tab && ['inspect', 'routes', 'nodes', 'ai', 'history', 'environment', 'photos'].includes(tab)) st.set({ rightTab: tab });
  const pin = q.get('pin')?.split(',').map(Number);
  if (pin && pin.length === 2 && pin.every(isFinite)) {
    const id = cellId(tileAt(pin[0], pin[1], st.cellZoom));
    st.set({ pick: { lat: pin[0], lon: pin[1], distanceKm: 0, cellId: id, cellZoom: st.cellZoom, pinnedAt: Date.now() }, selectedCellId: id });
  }
  if (q.get('places') === '1') st.set({ vectors: { ...useUI.getState().vectors, placesTraverse: true } });
  if (q.get('minerals') === '1') st.set({ vectors: { ...useUI.getState().vectors, minerals: true, crism: true } });
  if (q.get('panels') === '0') st.set({ panelsOpen: { left: false, right: false } });
  if (q.get('ui') === '0') document.body.classList.add('presentation');
  const cc = num(q.get('cachecam'));
  if (cc !== null) st.set({ cachecamSol: cc, rightTab: 'photos', vectors: { ...useUI.getState().vectors, samples: true } });
  if (q.get('hud') === '1') st.set({ hud: true, panelsOpen: { left: false, right: false } });
  if (q.get('profile') === 'astronaut' || q.get('profile') === 'rover') {
    const p = q.get('profile') as 'rover' | 'astronaut';
    import('../core/routes/RoutePlanner').then(({ PROFILE_ASSUMPTIONS }) => useRoutes.getState().set({ profile: p, assumptions: { ...PROFILE_ASSUMPTIONS[p] } }));
  }
  const drive = q.get('drive')?.split(',').map(Number);
  if (drive && drive.length === 2 && drive.every(isFinite)) {
    if (!tab) st.set({ rightTab: 'routes' });
    import('../ui/tabs/RoutesTab').then(({ loadRealDrive }) => loadRealDrive(drive[0], drive[1]));
  }
  const route = q.get('route')?.split(';').map((s) => s.split(',').map(Number));
  if (route && route.length === 2 && route.every((p) => p.length === 2 && p.every(isFinite))) {
    useRoutes.getState().set({ start: { lat: route[0][0], lon: route[0][1] }, end: { lat: route[1][0], lon: route[1][1] } });
    if (!tab) st.set({ rightTab: 'routes' });
  }
}
