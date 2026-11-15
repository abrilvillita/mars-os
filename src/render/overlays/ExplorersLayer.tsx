/**
 * All surface explorers of Mars as clickable labels, plus the live paths of Curiosity
 * (MMGIS traverse) and Ingenuity (flight-to-flight path between its airfields).
 */
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ, MARS_RADIUS_KM } from '../../core/geo/mars';
import { currentPosition, ensureExplorers, explorersState, type Explorer } from '../../core/live/explorers';
import { expeditions, loadExpeditions, type ExpeditionStop } from '../../core/live/expeditions';
import { renderBridge } from '../bridge';
import { useUI } from '../../state/uiStore';
import { ensureRoverData, roverData } from './RoverLayer';

export const KIND_ICON = { rover: 'R', lander: 'L', helicopter: 'H' } as const;
export function KindDot({ kind }: { kind: keyof typeof KIND_ICON }) {
  return <span className={`kind-dot kd-${kind}`} aria-hidden>{KIND_ICON[kind]}</span>;
}

export function useExplorers() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const l = () => setRev((r) => r + 1);
    explorersState.listeners.add(l);
    roverData.listeners.add(l);
    ensureExplorers(import.meta.env.BASE_URL);
    ensureRoverData();
    loadExpeditions(import.meta.env.BASE_URL).then(l);
    return () => {
      explorersState.listeners.delete(l);
      roverData.listeners.delete(l);
    };
  }, []);
  return explorersState;
}

export function m20Last() {
  const w = roverData.waypoints;
  if (!w.length) return null;
  let best = w[0];
  for (const x of w) if (x.sol > best.sol || (x.sol === best.sol && (x.distTotal_m ?? 0) >= (best.distTotal_m ?? 0))) best = x;
  return { lat: best.lat, lon: best.lon, sol: best.sol, km: best.distTotal_m !== null ? best.distTotal_m / 1000 : null };
}

export function selectExplorer(id: string, fly = true) {
  const st = useUI.getState();
  st.set({ explorerId: id, rightTab: 'explorers', panelsOpen: { ...st.panelsOpen, right: true } });
  const e = explorersState.list.find((x) => x.id === id);
  if (e && fly) {
    const p = currentPosition(e, m20Last());
    st.requestFlyTo({ lat: p.lat, lon: p.lon, distance: e.live ? 6 : 60, tilt: 35 });
  }
}

function Label({ e }: { e: Explorer }) {
  const os = getMarsOS();
  const ex = useUI((s) => s.exaggeration);
  const sel = useUI((s) => s.explorerId === e.id);
  const p = currentPosition(e, m20Last());
  const pos = useMemo(() => {
    const h = os.ready ? os.terrainModel.height(p.lat, p.lon) : 0;
    const v = latLonToXYZ(p.lat, p.lon, (h + 60) * ex);
    return new THREE.Vector3(v[0], v[1], v[2]);
  }, [p.lat, p.lon, ex, os]);
  const el = useRef<HTMLButtonElement>(null);
  useFrame(({ camera }) => {
    const d = useUI.getState().camera.distance;
    const facing = pos.clone().normalize().dot(camera.position.clone().normalize()) > MARS_RADIUS_KM / camera.position.length() - 0.01;
    // at Jezero the rover layer already shows Perseverance/Ingenuity in detail
    const near = e.live === 'm20' || e.live === 'heli' ? d > 120 : d > 8;
    if (el.current) el.current.style.display = facing && near ? '' : 'none';
  });
  return (
    <Html position={pos} center zIndexRange={[11, 0]}>
      <button ref={el} style={{ display: 'none' }} className={`explorer-label k-${e.kind} ${e.ended ? 'ended' : 'active'} ${sel ? 'sel' : ''}`} onClick={() => selectExplorer(e.id)}>
        <KindDot kind={e.kind} /> {e.name} <span>{e.landed.slice(0, 4)}</span>
      </button>
    </Html>
  );
}

function PathLine({ points, color, width, maxDist }: { points: { lat: number; lon: number }[]; color: number; width: number; maxDist: number }) {
  const os = getMarsOS();
  const ex = useUI((s) => s.exaggeration);
  const line = useMemo(() => {
    if (points.length < 2) return null;
    const c = points[0];
    const o = latLonToXYZ(c.lat, c.lon, (os.terrainModel.height(c.lat, c.lon)) * ex);
    const arr: number[] = [];
    const tmp = [0, 0, 0];
    for (const p of points) {
      latLonToXYZ(p.lat, p.lon, (os.terrainModel.height(p.lat, p.lon) + 6) * ex, tmp);
      arr.push(tmp[0] - o[0], tmp[1] - o[1], tmp[2] - o[2]);
    }
    const g = new LineGeometry();
    g.setPositions(arr);
    const m = new LineMaterial({ color, linewidth: width, transparent: true, opacity: 0.95 });
    const l = new Line2(g, m);
    l.computeLineDistances();
    l.renderOrder = 5;
    l.position.set(o[0], o[1], o[2]);
    return l;
  }, [points, color, width, ex, os]);
  useFrame(({ size }) => {
    if (!line) return;
    (line.material as LineMaterial).resolution.set(size.width, size.height);
    line.visible = useUI.getState().camera.distance < maxDist;
  });
  return line ? <primitive object={line} /> : null;
}

export function selectStop(idx: number, fly = true) {
  const st = useUI.getState();
  const s = expeditions.doc?.stops[idx];
  if (!s) return;
  st.set({ stopIdx: idx, explorerId: s.mission, rightTab: 'explorers', panelsOpen: { ...st.panelsOpen, right: true } });
  if (fly) st.requestFlyTo({ lat: s.lat, lon: s.lon, distance: s.hardware ? 1.5 : 4, tilt: 45 });
}

/** Named expedition stops of every mission (NASA Mars Trek), labelled when the camera is near. */
function StopLabel({ s, idx }: { s: ExpeditionStop; idx: number }) {
  const os = getMarsOS();
  const ex = useUI((st) => st.exaggeration);
  const sel = useUI((st) => st.stopIdx === idx);
  const pos = useMemo(() => {
    const v = latLonToXYZ(s.lat, s.lon, ((os.ready ? os.terrainModel.height(s.lat, s.lon) : 0) + 20) * ex);
    return new THREE.Vector3(v[0], v[1], v[2]);
  }, [s, ex, os]);
  const el = useRef<HTMLButtonElement>(null);
  useFrame(({ camera }) => {
    const c = useUI.getState().camera;
    const facing = pos.clone().normalize().dot(camera.position.clone().normalize()) > MARS_RADIUS_KM / camera.position.length() - 0.002;
    const close = Math.abs(c.lat - s.lat) < 3 && c.distance < (s.hardware ? 25 : 220);
    if (el.current) el.current.style.display = facing && close ? '' : 'none';
  });
  return (
    <Html position={pos} center zIndexRange={[10, 0]}>
      <button ref={el} style={{ display: 'none' }} className={`stop-label ${s.hardware ? 'hw' : ''} ${sel ? 'sel' : ''}`} onClick={() => selectStop(idx, false)}>
        {s.name}
      </button>
    </Html>
  );
}

/** Screen-space pick of the nearest Curiosity stop (MMGIS, one per sol). */
export function pickNearestMslStop(sx: number, sy: number, maxPx: number) {
  const stops = explorersState.msl?.stops;
  const cam = useUI.getState().camera;
  if (!stops || !renderBridge.project || cam.distance > 400 || Math.abs(cam.lat + 4.7) > 2 || Math.abs(cam.lon - 137.4) > 2) return null;
  const os = getMarsOS();
  let best: (typeof stops)[number] | null = null, bestD = maxPx;
  for (const w of stops) {
    const p = renderBridge.project(w.lat, w.lon, os.terrainModel.height(w.lat, w.lon) + 4);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}

function MslStops() {
  const os = getMarsOS();
  const ex = useUI((s) => s.exaggeration);
  const stops = explorersState.msl?.stops;
  const geo = useMemo(() => {
    if (!stops) return null;
    const pos = new Float32Array(stops.length * 3);
    const tmp = [0, 0, 0];
    stops.forEach((w, i) => {
      latLonToXYZ(w.lat, w.lon, (os.terrainModel.height(w.lat, w.lon) + 4) * ex, tmp);
      pos.set(tmp, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [stops, ex, os]);
  const ref = useRef<THREE.Points>(null);
  useFrame(() => {
    if (ref.current) ref.current.visible = useUI.getState().camera.distance < 400;
  });
  if (!geo) return null;
  return (
    <points ref={ref} geometry={geo} renderOrder={7}>
      <pointsMaterial color="#ffd23f" size={6} sizeAttenuation={false} transparent opacity={0.95} />
    </points>
  );
}

export function ExplorersLayer() {
  const on = useUI((s) => s.vectors.explorers);
  const st = useExplorers();
  const os = getMarsOS();
  if (!on || !os.ready) return null;
  return (
    <>
      {st.list.map((e) => <Label key={e.id} e={e} />)}
      {st.msl && <PathLine points={st.msl.points} color={0xffd23f} width={2.5} maxDist={2500} />}
      {Object.entries(st.paths).map(([id, p]) => <PathLine key={id} points={p.points} color={0xffa94d} width={2.2} maxDist={2500} />)}
      {st.heli && <PathLine points={st.heli.points} color={0x9cff6b} width={1.8} maxDist={300} />}
      <MslStops />
      {expeditions.doc?.stops.map((s, i) => (s.mission === 'perseverance' && !s.hardware ? null : <StopLabel key={i} s={s} idx={i} />))}
    </>
  );
}
