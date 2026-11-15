/**
 * Landing: NASA human Exploration Zones (labels + 100 km circles) and real landing ellipses
 * (Perseverance, InSight) from NASA Mars Trek.
 */
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { DEG, latLonToXYZ, M_PER_DEG, MARS_RADIUS_KM } from '../../core/geo/mars';
import { expeditions, loadExpeditions, type ExplorationZone } from '../../core/live/expeditions';
import { useUI } from '../../state/uiStore';

export const EZ_RADIUS_KM = 100;

export function selectZone(i: number, fly = true) {
  const st = useUI.getState();
  const z = expeditions.doc?.zones[i];
  st.set({ zoneIdx: i, rightTab: 'landing', panelsOpen: { ...st.panelsOpen, right: true }, vectors: { ...st.vectors, zones: true } });
  if (z && fly) st.requestFlyTo({ lat: z.lat, lon: z.lon, distance: 900, tilt: 20 });
}

function ZoneLabel({ z, i }: { z: ExplorationZone; i: number }) {
  const sel = useUI((s) => s.zoneIdx === i);
  const pos = useMemo(() => {
    const v = latLonToXYZ(z.lat, z.lon, 8000);
    return new THREE.Vector3(v[0], v[1], v[2]);
  }, [z]);
  const el = useRef<HTMLButtonElement>(null);
  useFrame(({ camera }) => {
    const d = useUI.getState().camera.distance;
    const facing = pos.clone().normalize().dot(camera.position.clone().normalize()) > MARS_RADIUS_KM / camera.position.length() + 0.05;
    if (el.current) el.current.style.display = facing && d > 300 ? '' : 'none';
  });
  return (
    <Html position={pos} center zIndexRange={[9, 0]}>
      <button ref={el} style={{ display: 'none' }} className={`zone-label ${sel ? 'sel' : ''}`} onClick={() => selectZone(i, false)} title={z.name}>
        {z.name}
      </button>
    </Html>
  );
}

function ring(lat: number, lon: number, rKm: number, h: number, ex: number) {
  const pts: THREE.Vector3[] = [];
  const tmp = [0, 0, 0];
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * 2 * Math.PI;
    const dLat = (rKm * 1000 * Math.cos(a)) / M_PER_DEG;
    const dLon = (rKm * 1000 * Math.sin(a)) / (M_PER_DEG * Math.cos(lat * DEG));
    latLonToXYZ(lat + dLat, lon + dLon, h * ex, tmp);
    pts.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
  }
  return pts;
}

export function ZonesLayer() {
  const on = useUI((s) => s.vectors.zones);
  const ex = useUI((s) => s.exaggeration);
  const os = getMarsOS();
  const [ready, setReady] = useState(!!expeditions.doc);
  useEffect(() => {
    if (on) loadExpeditions(import.meta.env.BASE_URL).then(() => setReady(true));
  }, [on]);

  const lines = useMemo(() => {
    const doc = expeditions.doc;
    if (!ready || !doc) return null;
    const g = new THREE.Group();
    const zm = new THREE.LineBasicMaterial({ color: '#7fd1ff', transparent: true, opacity: 0.7 });
    for (const z of doc.zones) g.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ring(z.lat, z.lon, EZ_RADIUS_KM, os.elevationService.height(z.lat, z.lon, 5000) + 300, ex)), zm));
    const em = new THREE.LineBasicMaterial({ color: '#ffcf4a' });
    const tmp = [0, 0, 0];
    for (const e of doc.ellipses) {
      const pts = e.ring.map(([lon, lat]) => {
        latLonToXYZ(lat, lon, (os.elevationService.height(lat, lon, 500) + 80) * ex, tmp);
        return new THREE.Vector3(tmp[0], tmp[1], tmp[2]);
      });
      const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), em);
      l.renderOrder = 6;
      g.add(l);
    }
    return g;
  }, [ready, ex, os]);

  if (!on || !lines) return null;
  return (
    <>
      <primitive object={lines} />
      {expeditions.doc?.zones.map((z, i) => <ZoneLabel key={i} z={z} i={i} />)}
    </>
  );
}
