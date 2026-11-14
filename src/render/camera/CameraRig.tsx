/**
 * Surface-aware camera: orbit the whole planet from space, then glide down to walking
 * height. Target = a point on the terrain; the camera sits `distance` km away with a
 * heading (compass) and tilt (0 = straight down, → 85° near the ground = horizon view).
 *
 * Controls: drag = move · right-drag / Shift+drag = rotate 360° & tilt · wheel/pinch = zoom
 * Keys: WASD/arrows move · Q/E rotate · R/F tilt · +/- zoom
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { DEG, latLonToXYZ, M_PER_DEG, MARS_RADIUS_KM, normalizeLon, distanceM } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';

const MIN_DIST = 0.004; // 4 m
const MAX_DIST = 45000;
const MIN_CLEARANCE_KM = 0.0018; // ~ eye height of a suited astronaut

/** Max tilt allowed at a given distance: straight-down far away, near-horizontal close up. */
export function maxTiltFor(d: number) {
  if (d > 6000) return 0;
  if (d > 1500) return 25 * (1 - (d - 1500) / 4500);
  const t = Math.log10(Math.max(d, MIN_DIST) / MIN_DIST) / Math.log10(1500 / MIN_DIST);
  return 25 + (1 - t) * 63;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function CameraRig() {
  const { camera, gl } = useThree();
  const rig = renderBridge.rig;
  const keys = useRef(new Set<string>());
  const autoTilt = useRef(true);
  const fly = useRef<null | { from: typeof rig; to: typeof rig; t: number; dur: number; peak: number }>(null);
  const lastStore = useRef(0);
  const exaggeration = useUI((s) => s.exaggeration);
  const flyTo = useUI((s) => s.flyTo);

  // fly-to requests from the UI
  useEffect(() => {
    if (!flyTo) return;
    const from = { ...rig };
    const to = {
      lat: flyTo.lat, lon: flyTo.lon, distance: flyTo.distance,
      heading: flyTo.heading ?? rig.heading, tilt: flyTo.tilt ?? Math.min(maxTiltFor(flyTo.distance) * 0.7, 60),
    };
    // shortest heading/longitude path
    if (to.lon - from.lon > 180) from.lon += 360;
    if (from.lon - to.lon > 180) from.lon -= 360;
    const arc = distanceM(from.lat, from.lon, to.lat, to.lon) / 1000;
    const peak = Math.min(MAX_DIST * 0.5, Math.max(from.distance, to.distance, arc * 0.9));
    fly.current = { from, to, t: 0, dur: Math.min(4.5, 1.6 + Math.log10(1 + arc) * 0.8 + Math.abs(Math.log10(from.distance / to.distance)) * 0.25), peak };
    autoTilt.current = flyTo.tilt === undefined;
  }, [flyTo]); // eslint-disable-line react-hooks/exhaustive-deps

  // pointer & keyboard input
  useEffect(() => {
    const el = gl.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let mode: 'pan' | 'rotate' | null = null;
    let pinchDist = 0;
    const pxPerRad = () => el.clientHeight / (2 * Math.tan(((camera as THREE.PerspectiveCamera).fov * DEG) / 2));

    const pan = (dx: number, dy: number) => {
      const mpp = (rig.distance * 1000) / pxPerRad();
      // far away the globe rotates by angle instead of ground meters
      const k = rig.distance > 3000 ? Math.min(1, (MARS_RADIUS_KM * 1.6) / rig.distance) : 1;
      const h = rig.heading * DEG;
      const dE = (-dx * Math.cos(h) + dy * Math.sin(h)) * mpp * k;
      const dN = (dx * Math.sin(h) + dy * Math.cos(h)) * mpp * k;
      rig.lat = Math.max(-89.5, Math.min(89.5, rig.lat + dN / M_PER_DEG));
      rig.lon = normalizeLon(rig.lon + dE / (M_PER_DEG * Math.max(0.05, Math.cos(rig.lat * DEG))));
    };
    const rotate = (dx: number, dy: number) => {
      rig.heading = (rig.heading - dx * 0.25 + 360) % 360;
      rig.tilt = Math.max(0, Math.min(maxTiltFor(rig.distance), rig.tilt - dy * 0.2));
      autoTilt.current = false;
    };
    const zoom = (factor: number) => {
      const before = rig.distance;
      rig.distance = Math.max(MIN_DIST, Math.min(MAX_DIST, rig.distance * factor));
      if (autoTilt.current) rig.tilt = Math.min(maxTiltFor(rig.distance) * 0.75, 70);
      else rig.tilt = Math.min(rig.tilt, maxTiltFor(rig.distance));
      if (before !== rig.distance) fly.current = null;
    };

    const onDown = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      mode = e.button === 2 || e.shiftKey || e.ctrlKey ? 'rotate' : 'pan';
      fly.current = null;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (pointers.size === 2) {
        p.x = e.clientX; p.y = e.clientY;
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) zoom(pinchDist / d);
        pinchDist = d;
        return;
      }
      p.x = e.clientX; p.y = e.clientY;
      if (mode === 'pan') pan(dx, dy);
      else if (mode === 'rotate') rotate(dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      if (!pointers.size) mode = null;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012)));
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.type === 'keydown') keys.current.add(e.key.toLowerCase());
      else keys.current.delete(e.key.toLowerCase());
    };
    const noMenu = (e: Event) => e.preventDefault();
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', noMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    (rig as unknown as { _zoom: typeof zoom; _pan: typeof pan; _rotate: typeof rotate })._zoom = zoom;
    (rig as unknown as { _pan: typeof pan })._pan = pan;
    (rig as unknown as { _rotate: typeof rotate })._rotate = rotate;
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', noMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, [camera, gl, rig]);

  const T = useRef(new THREE.Vector3());
  const tmp = useRef([0, 0, 0]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const os = getMarsOS();
    const r = rig as unknown as { _zoom?: (f: number) => void; _pan?: (x: number, y: number) => void; _rotate?: (x: number, y: number) => void };
    const k = keys.current;
    if (k.size && r._pan && r._zoom && r._rotate) {
      const s = 420 * dt;
      if (k.has('w') || k.has('arrowup')) r._pan(0, s);
      if (k.has('s') || k.has('arrowdown')) r._pan(0, -s);
      if (k.has('a') || k.has('arrowleft')) r._pan(s, 0);
      if (k.has('d') || k.has('arrowright')) r._pan(-s, 0);
      if (k.has('q')) r._rotate(-s * 0.6, 0);
      if (k.has('e')) r._rotate(s * 0.6, 0);
      if (k.has('r')) r._rotate(0, -s * 0.4);
      if (k.has('f')) r._rotate(0, s * 0.4);
      if (k.has('+') || k.has('=')) r._zoom(Math.exp(-1.6 * dt));
      if (k.has('-') || k.has('_')) r._zoom(Math.exp(1.6 * dt));
    }

    // fly-to animation (zooms out along the way for long hops)
    const f = fly.current;
    if (f) {
      f.t = Math.min(1, f.t + dt / f.dur);
      const e = ease(f.t);
      rig.lat = f.from.lat + (f.to.lat - f.from.lat) * e;
      rig.lon = normalizeLon(f.from.lon + (f.to.lon - f.from.lon) * e);
      const logD = Math.log(f.from.distance) * (1 - e) + Math.log(f.to.distance) * e;
      const bump = Math.sin(Math.PI * f.t) * Math.max(0, Math.log(f.peak) - Math.max(Math.log(f.from.distance), Math.log(f.to.distance)));
      rig.distance = Math.exp(logD + bump);
      let dh = f.to.heading - f.from.heading;
      if (dh > 180) dh -= 360;
      if (dh < -180) dh += 360;
      rig.heading = (f.from.heading + dh * e + 360) % 360;
      rig.tilt = Math.min(maxTiltFor(rig.distance), f.from.tilt + (f.to.tilt - f.from.tilt) * e);
      if (f.t >= 1) fly.current = null;
    }

    // target point on the (exaggerated) terrain
    const ready = os.ready;
    const hT = ready ? os.terrainModel.height(rig.lat, rig.lon) * exaggeration : 0;
    latLonToXYZ(rig.lat, rig.lon, hT, tmp.current);
    T.current.set(tmp.current[0], tmp.current[1], tmp.current[2]);
    const up = T.current.clone().normalize();
    const east = new THREE.Vector3(0, 1, 0).cross(up);
    if (east.lengthSq() < 1e-8) east.set(1, 0, 0);
    east.normalize();
    const north = up.clone().cross(east).normalize();
    const h = rig.heading * DEG, tl = rig.tilt * DEG;
    const fwd = north.clone().multiplyScalar(Math.cos(h)).add(east.clone().multiplyScalar(Math.sin(h)));
    const dir = up.clone().multiplyScalar(Math.cos(tl)).add(fwd.clone().multiplyScalar(-Math.sin(tl)));
    const camPos = T.current.clone().add(dir.multiplyScalar(rig.distance));

    // terrain collision: keep the eye above the ground below the camera
    if (ready && rig.distance < 200) {
      const cl = camPos.clone().normalize();
      const cLat = Math.asin(cl.y) / DEG, cLon = Math.atan2(-cl.z, cl.x) / DEG;
      const ground = MARS_RADIUS_KM + (os.terrainModel.height(cLat, cLon) * exaggeration) / 1000 + MIN_CLEARANCE_KM;
      if (camPos.length() < ground) camPos.setLength(ground);
    }

    camera.position.copy(camPos);
    camera.up.copy(fwd.clone().multiplyScalar(Math.cos(tl)).add(up.clone().multiplyScalar(Math.sin(tl))).normalize());
    camera.lookAt(T.current);
    const pc = camera as THREE.PerspectiveCamera;
    const alt = camPos.length() - MARS_RADIUS_KM;
    pc.near = Math.max(0.00005, Math.min(1, alt * 0.001));
    pc.far = 3e6;
    pc.updateProjectionMatrix();
    camera.updateMatrixWorld();

    const now = performance.now();
    if (now - lastStore.current > 150) {
      lastStore.current = now;
      const altSurface = alt - (ready ? (os.terrainModel.height(rig.lat, rig.lon) * exaggeration) / 1000 : 0);
      useUI.getState().set({
        camera: { lat: rig.lat, lon: rig.lon, distance: rig.distance, altitudeKm: Math.max(0, altSurface), tilt: rig.tilt, heading: rig.heading },
      });
    }
  });

  return null;
}
