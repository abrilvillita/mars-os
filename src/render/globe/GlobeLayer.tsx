/**
 * R3F wrapper: owns the Globe instance, feeds it view state (layers, mode, exaggeration),
 * listens to MarsOS terrain events (localized rebuilds) and turns pointer input into picks.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { patchBBox } from '../../core/terrain/patches';
import { cellId, parseCellId, tileAt, tileBBox } from '../../core/geo/tiling';
import { latLonToXYZ, xyzToLatLon, MARS_RADIUS_KM } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';
import { useRoutes } from '../../state/routeStore';
import { renderBridge } from '../bridge';
import { Globe } from './Globe';
import { MODE_INDEX } from './tileShader';
import { pickNearestWaypoint } from '../overlays/RoverLayer';
import { pickNearestNode } from '../overlays/NodeGrid';
import { pickNearestSample } from '../overlays/SamplesLayer';

const BASE_URL = import.meta.env.BASE_URL;

/** Choose an editable cell zoom adapted to camera distance (cell ≈ 1/3 of the view). */
export function autoCellZoom(distanceKm: number) {
  const targetKm = Math.max(0.05, distanceKm * 0.35);
  const z = Math.round(Math.log2((180 * 59.27) / targetKm)); // 59.27 km per degree
  return Math.max(3, Math.min(18, z));
}

export function GlobeLayer() {
  const os = getMarsOS();
  const { camera, size, gl, raycaster, pointer } = useThree();
  const globe = useMemo(() => new Globe(os.terrainModel, BASE_URL), [os]);
  const ui = useUI;
  const exaggeration = useUI((s) => s.exaggeration);
  const forceOffline = useUI((s) => s.forceOffline);

  useEffect(() => {
    renderBridge.globe = globe;
    globe.textures.maxAnisotropy = gl.capabilities.getMaxAnisotropy();
    globe.textures.onStatus = (s) => useUI.getState().set({ tileStatus: s });
    const off1 = os.on('terrain:changed', ({ bbox }) => {
      globe.patchBoxes = os.terrain.activePatches().map(patchBBox);
      globe.invalidate(bbox);
    });
    return () => {
      off1();
      renderBridge.globe = null;
      globe.dispose();
    };
  }, [globe, os, gl]);

  useEffect(() => {
    globe.exaggeration = exaggeration;
    globe.invalidate(null);
  }, [exaggeration, globe]);

  useEffect(() => {
    globe.textures.forceOffline = forceOffline;
    if (!forceOffline) globe.textures.resetFailures();
    globe.textures.onStatus?.({ offline: globe.textures.offline, failures: globe.textures.failures });
  }, [forceOffline, globe]);

  // pointer: hover (throttled) and click picking
  const lastFrame = useRef(performance.now());
  const lastDetail = useRef(0);
  const down = useRef<{ x: number; y: number } | null>(null);
  const lastHover = useRef(0);
  useEffect(() => {
    const el = gl.domElement;
    const pick = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(globe.meshes, false)[0];
      if (!hit) return null;
      const ll = xyzToLatLon(hit.point.x, hit.point.y, hit.point.z);
      return { lat: ll.lat, lon: ll.lon, distanceKm: hit.distance };
    };
    const onDown = (e: PointerEvent) => (down.current = { x: e.clientX, y: e.clientY });
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHover.current < 90 || e.buttons) return;
      lastHover.current = now;
      ui.getState().set({ hover: pick(e.clientX, e.clientY) });
    };
    const onUp = (e: PointerEvent) => {
      const d = down.current;
      down.current = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || e.button !== 0) return;
      const r = el.getBoundingClientRect();
      const sx = e.clientX - r.left, sy = e.clientY - r.top;
      const st = ui.getState();
      // 0) sample-handling (CacheCam) site?
      if (st.vectors.samples && st.camera.distance <= 400) {
        const s = pickNearestSample(sx, sy, 10);
        if (s) {
          st.set({ sampleN: s.n, waypoint: null, rightTab: 'photos', panelsOpen: { ...st.panelsOpen, right: true } });
          return;
        }
      }
      // 1) rover waypoint?
      if (st.vectors.waypoints) {
        const w = pickNearestWaypoint(sx, sy, 9);
        if (w) {
          st.set({ waypoint: { sol: w.sol, rmc: w.rmc, lat: w.lat, lon: w.lon }, sampleN: null, rightTab: 'photos', panelsOpen: { ...st.panelsOpen, right: true } });
          return;
        }
      }
      // 2) node of the selected cell?
      if (st.rightTab === 'nodes' && st.showNodes && st.selectedCellId) {
        const n = pickNearestNode(sx, sy, 12);
        if (n) {
          const sel = st.selectedNodeIds.includes(n) ? st.selectedNodeIds.filter((x) => x !== n) : e.shiftKey || e.ctrlKey ? [...st.selectedNodeIds, n] : [n];
          st.set({ selectedNodeIds: sel });
          return;
        }
      }
      // 3) route comparator waiting for a point (A or B)?
      const rs = useRoutes.getState();
      if (rs.pickMode) {
        const p = pick(e.clientX, e.clientY);
        if (p) rs.set({ [rs.pickMode]: { lat: p.lat, lon: p.lon }, pickMode: rs.pickMode === 'start' && !rs.end ? 'end' : null, changeNote: null } as never);
        return;
      }
      // 4) surface point → pin location + select editable cell (unless the pin is locked)
      if (st.pinLocked && !st.repinArmed) return;
      const p = pick(e.clientX, e.clientY);
      if (!p) return;
      const z = st.cellZoom;
      const id = cellId(tileAt(p.lat, p.lon, z));
      st.set({
        pick: { lat: p.lat, lon: p.lon, distanceKm: p.distanceKm, cellId: id, cellZoom: z, pinnedAt: Date.now() },
        repinArmed: false,
        selectedCellId: id,
        selectedNodeIds: [],
      });
    };
    const onLeave = () => ui.getState().set({ hover: null }); // preview only; the pin is untouched
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, raycaster, pointer, globe, ui]);

  // projection helper for overlays/UI (plain numbers only)
  useEffect(() => {
    const v = new THREE.Vector3();
    const out = [0, 0, 0];
    renderBridge.project = (lat, lon, h) => {
      latLonToXYZ(lat, lon, h * useUI.getState().exaggeration, out);
      v.set(out[0], out[1], out[2]);
      // behind the planet?
      const cam = camera.position;
      const toP = v.clone().sub(cam);
      const camLen = cam.length();
      if (v.clone().normalize().dot(cam.clone().normalize()) < MARS_RADIUS_KM / camLen - 0.002 && toP.length() > 50) return null;
      v.project(camera);
      if (v.z > 1) return null;
      return { x: ((v.x + 1) / 2) * size.width, y: ((1 - v.y) / 2) * size.height };
    };
  }, [camera, size]);

  useFrame(() => {
    const st = useUI.getState();
    const layers = os.catalog;
    const base = layers.layer(st.baseLayerId);
    const slots = [] as { layer: NonNullable<ReturnType<typeof layers.layer>>; opacity: number }[];
    if (base) slots.push({ layer: base, opacity: 1 });
    for (const id of ['layer.jezero.ctx', 'layer.jezero.hirise', 'layer.geology.sim3292']) {
      const o = st.overlays[id];
      const l = layers.layer(id);
      if (o?.on && l) slots.push({ layer: l, opacity: o.opacity });
    }
    globe.slots = slots;
    const g = globe.globals;
    g.uMode.value = MODE_INDEX[st.displayMode];
    g.uRealLighting.value = st.realLighting ? 1 : 0;
    if (st.displayMode === 'hypsometric') {
      const [lo, hi] = st.camera.distance > 4000 ? [-8200, 21200] : globe.visibleHeightRange();
      g.uHypso.value.set(lo, Math.max(lo + 1, hi));
    }
    const sel = st.selectedCellId ? parseCellId(st.selectedCellId) : null;
    if (sel) {
      const b = tileBBox(sel);
      g.uSelBox.value.set(b.west, b.south, b.east, b.north);
    } else g.uSelBox.value.set(0, 0, 0, 0);
    const hi = st.vectors.regions && st.camera.distance < 900 ? os.regions.get('region.jezero.hirise-coverage') : null;
    if (hi) g.uHiBox.value.set(hi.bbox.west, hi.bbox.south, hi.bbox.east, hi.bbox.north);
    else g.uHiBox.value.set(0, 0, 0, 0);
    // progressive detail: when close to the surface (or a location is pinned), request
    // on-demand elevation (MOLA 128 ppd via backend) for that area — anywhere on Mars
    const nowD = performance.now();
    if (nowD - lastDetail.current > 600) {
      lastDetail.current = nowD;
      if (st.camera.distance < 1500) os.terrain.ensureDetail(st.camera.lat, st.camera.lon, Math.min(2, st.camera.distance / 120));
      if (st.pick) os.terrain.ensureDetail(st.pick.lat, st.pick.lon, 0);
    }
    const t0 = performance.now();
    globe.update(camera as THREE.PerspectiveCamera, size.height);
    const st2 = renderBridge.stats;
    st2.updateMs = st2.updateMs * 0.9 + (performance.now() - t0) * 0.1;
    st2.drawCalls = gl.info.render.calls;
    st2.triangles = gl.info.render.triangles;
    st2.leaves = globe.leaves.length;
    st2.textures = gl.info.memory.textures;
    const now = performance.now();
    const dt = now - lastFrame.current;
    lastFrame.current = now;
    st2.frameMs = st2.frameMs * 0.9 + dt * 0.1;
    st2.fps = 1000 / Math.max(1, st2.frameMs);
  });

  return <primitive object={globe} />;
}
