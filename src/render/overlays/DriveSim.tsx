/**
 * Drive simulation: a rover model drives the low-slope route (or Perseverance's real drive when
 * one is loaded) with the camera following it. Playback is accelerated; the real time at
 * Perseverance's 152 m/h top speed is shown in the Routes tab.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { DEG, distanceM, latLonToXYZ } from '../../core/geo/mars';
import { useRoutes } from '../../state/routeStore';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';
import { AstronautShape, RoverShape } from './Models';

const PLAYBACK_MS = 12; // metres of route per second of animation

function bearing(lat1: number, lon1: number, lat2: number, lon2: number) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  return ((Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / DEG) + 360) % 360;
}

export function DriveSim() {
  const driving = useRoutes((s) => s.driving);
  const result = useRoutes((s) => s.result);
  const actual = useRoutes((s) => s.actualRoute);
  const profile = useRoutes((s) => s.profile);
  const os = getMarsOS();
  const group = useRef<THREE.Group>(null);
  const s = useRef(0);
  const route = actual ?? (result?.ok ? result.routes.find((r) => r.kind === 'lowSlope') ?? null : null);
  const arc = useMemo(() => {
    if (!route) return null;
    const a = [0];
    for (let i = 1; i < route.points.length; i++) a.push(a[i - 1] + distanceM(route.points[i - 1].lat, route.points[i - 1].lon, route.points[i].lat, route.points[i].lon));
    return a;
  }, [route]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || !driving || !route || !arc) return;
    const total = arc[arc.length - 1];
    s.current = Math.min(total, s.current + PLAYBACK_MS * Math.min(dt, 0.1));
    let i = arc.findIndex((v) => v >= s.current);
    if (i <= 0) i = 1;
    const a = route.points[i - 1], b = route.points[i];
    const f = (s.current - arc[i - 1]) / Math.max(1e-6, arc[i] - arc[i - 1]);
    const lat = a.lat + (b.lat - a.lat) * f, lon = a.lon + (b.lon - a.lon) * f;
    const ahead = route.points[Math.min(route.points.length - 1, i + 2)];
    const hdg = bearing(lat, lon, ahead.lat, ahead.lon);
    const ex = useUI.getState().exaggeration;
    const p = latLonToXYZ(lat, lon, os.terrainModel.height(lat, lon) * ex);
    const pos = new THREE.Vector3(p[0], p[1], p[2]);
    const up = pos.clone().normalize();
    const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north.clone().negate()));
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -hdg * DEG));
    g.position.copy(pos);
    g.quaternion.copy(q);
    g.visible = true;
    // camera follows behind the rover
    const rig = renderBridge.rig;
    let dh = hdg - rig.heading;
    if (dh > 180) dh -= 360;
    if (dh < -180) dh += 360;
    Object.assign(rig, { lat, lon, distance: 0.014, tilt: 70, heading: (rig.heading + dh * Math.min(1, dt * 2) + 360) % 360 });
    if (s.current >= total) {
      s.current = 0;
      useRoutes.getState().set({ driving: false });
    }
  });

  if (!driving || !route) return null;
  return (
    <group ref={group} scale={0.001} visible={false}>
      {profile === 'astronaut' ? <AstronautShape /> : <RoverShape spin />}
    </group>
  );
}
