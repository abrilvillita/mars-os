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
import { useUI } from '../../state/uiStore';
import { ensureRoverData, roverData } from './RoverLayer';

export const KIND_ICON = { rover: '🤖', lander: '🛬', helicopter: '🚁' } as const;

export function useExplorers() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const l = () => setRev((r) => r + 1);
    explorersState.listeners.add(l);
    roverData.listeners.add(l);
    ensureExplorers(import.meta.env.BASE_URL);
    ensureRoverData();
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
        {KIND_ICON[e.kind]} {e.name} <span>{e.landed.slice(0, 4)}</span>
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

export function ExplorersLayer() {
  const on = useUI((s) => s.vectors.explorers);
  const st = useExplorers();
  const os = getMarsOS();
  if (!on || !os.ready) return null;
  return (
    <>
      {st.list.map((e) => <Label key={e.id} e={e} />)}
      {st.msl && <PathLine points={st.msl.points} color={0xffd23f} width={2.5} maxDist={2500} />}
      {st.heli && <PathLine points={st.heli.points} color={0x9cff6b} width={1.8} maxDist={300} />}
    </>
  );
}
