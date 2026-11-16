/**
 * Simple procedural 3D models (real-world scale, scene units = km): a six-wheeled rover,
 * a suited astronaut and a base habitat. Illustrative shapes, not engineering models.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';

const M = 0.001; // 1 metre in scene units

const mat = {
  body: new THREE.MeshStandardMaterial({ color: '#e9e4dc', roughness: 0.6, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: '#3a3d44', roughness: 0.8 }),
  gold: new THREE.MeshStandardMaterial({ color: '#c9a24a', roughness: 0.4, metalness: 0.6 }),
  panel: new THREE.MeshStandardMaterial({ color: '#1d2f5c', roughness: 0.3, metalness: 0.5 }),
  suit: new THREE.MeshStandardMaterial({ color: '#f4f2ee', roughness: 0.7 }),
  visor: new THREE.MeshStandardMaterial({ color: '#d8a64a', roughness: 0.15, metalness: 0.9 }),
  hab: new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.5, emissive: '#3a3a3a' }),
beacon: new THREE.MeshStandardMaterial({ color: '#5fd39a', emissive: '#5fd39a', emissiveIntensity: 1.2 }),
};

/** Orient a group on the surface: +Y = local up, heading rotates about up (0 = north). */
export function useSurfaceFrame(lat: number, lon: number, headingDeg: number, lift = 0) {
  const os = getMarsOS();
  const ex = useUI((s) => s.exaggeration);
  // re-read the ground height when finer elevation tiles arrive (otherwise the model can end up buried)
  const [rev, setRev] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = os.on('terrain:changed', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setRev((r) => r + 1), 300);
    });
    return () => {
      off();
      if (t) clearTimeout(t);
    };
  }, [os]);
  return useMemo(() => {
    const h = os.ready ? os.terrainModel.height(lat, lon) : 0;
    const p = latLonToXYZ(lat, lon, h * ex + lift);
    const pos = new THREE.Vector3(p[0], p[1], p[2]);
    const up = pos.clone().normalize();
    const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
    const east = new THREE.Vector3().crossVectors(north, up).normalize();
    const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -headingDeg * (Math.PI / 180)));
    return { pos, q };
  }, [lat, lon, headingDeg, lift, ex, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Real scale up close; when the camera is farther than `viewM` metres the model grows so it keeps
 * the size it has from that distance (otherwise a 3 m rover or 40 m base vanishes from orbit).
 */
export function SurfaceObject({ lat, lon, heading = 0, scale = 1, viewM = 250, children }: { lat: number; lon: number; heading?: number; scale?: number; viewM?: number; children: ReactNode }) {
  const { pos, q } = useSurfaceFrame(lat, lon, heading);
  const g = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    if (!g.current) return;
    const d = camera.position.distanceTo(pos); // km
    g.current.scale.setScalar(scale * M * Math.max(1, (d * 1000) / viewM));
  });
  return (
    <group ref={g} position={pos} quaternion={q} scale={scale * M}>
      {children}
    </group>
  );
}

/** Six-wheeled rover about 3 m long (Curiosity/Perseverance-class proportions). */
export function RoverShape({ spin = false }: { spin?: boolean }) {
  const wheels = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin && wheels.current) wheels.current.children.forEach((w) => (w.rotation.x += dt * 3));
  });
  const wheelGeo = useMemo(() => new THREE.CylinderGeometry(0.26, 0.26, 0.4, 18).rotateZ(Math.PI / 2), []);
  return (
    <group>
      <mesh material={mat.body} position={[0, 1.0, 0]}><boxGeometry args={[2.0, 0.6, 2.8]} /></mesh>
      <mesh material={mat.gold} position={[0, 1.35, -0.6]}><boxGeometry args={[1.6, 0.1, 1.2]} /></mesh>
      <mesh material={mat.dark} position={[0.6, 1.25, -1.3]} rotation={[0.3, 0, 0]}><cylinderGeometry args={[0.32, 0.32, 0.7, 14]} /></mesh>
      <mesh material={mat.body} position={[0.7, 1.9, 1.1]}><cylinderGeometry args={[0.06, 0.06, 1.4, 8]} /></mesh>
      <mesh material={mat.dark} position={[0.7, 2.65, 1.15]}><boxGeometry args={[0.55, 0.3, 0.3]} /></mesh>
      <mesh material={mat.body} position={[-0.6, 1.0, 1.7]} rotation={[0.8, 0, 0]}><boxGeometry args={[0.12, 0.12, 1.2]} /></mesh>
      <group ref={wheels}>
        {[-1.15, 0, 1.15].flatMap((z) => [-1.05, 1.05].map((x) => <mesh key={`${x}${z}`} geometry={wheelGeo} material={mat.dark} position={[x, 0.26, z]} />))}
      </group>
      <mesh material={mat.dark} position={[-1.05, 0.55, 0]}><boxGeometry args={[0.1, 0.12, 2.4]} /></mesh>
      <mesh material={mat.dark} position={[1.05, 0.55, 0]}><boxGeometry args={[0.1, 0.12, 2.4]} /></mesh>
    </group>
  );
}

/** Suited astronaut about 1.8 m tall. */
export function AstronautShape() {
  return (
    <group>
      <mesh material={mat.suit} position={[0, 1.0, 0]}><capsuleGeometry args={[0.28, 0.7, 6, 12]} /></mesh>
      <mesh material={mat.suit} position={[0, 1.62, 0]}><sphereGeometry args={[0.2, 16, 12]} /></mesh>
      <mesh material={mat.visor} position={[0, 1.63, 0.1]}><sphereGeometry args={[0.15, 14, 10, 0, Math.PI]} /></mesh>
      <mesh material={mat.dark} position={[0, 1.1, -0.32]}><boxGeometry args={[0.5, 0.6, 0.25]} /></mesh>
      <mesh material={mat.suit} position={[-0.13, 0.35, 0]}><capsuleGeometry args={[0.1, 0.5, 4, 8]} /></mesh>
      <mesh material={mat.suit} position={[0.13, 0.35, 0]}><capsuleGeometry args={[0.1, 0.5, 4, 8]} /></mesh>
    </group>
  );
}

/** Base camp: habitat domes and a landing pad (about 40 m across). */
export function BaseShape() {
  return (
    <group>
      <mesh material={mat.hab} position={[0, 0, 0]}><sphereGeometry args={[6, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh material={mat.hab} position={[11, 0, 3]}><sphereGeometry args={[4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /></mesh>
      <mesh material={mat.body} position={[5.5, 1.2, 1.5]} rotation={[0, 0.3, Math.PI / 2]}><cylinderGeometry args={[1.2, 1.2, 6, 12]} /></mesh>
      <mesh material={mat.panel} position={[-12, 1.2, -6]} rotation={[-0.4, 0, 0]}><boxGeometry args={[10, 0.1, 4]} /></mesh>
      <mesh material={mat.panel} position={[-12, 1.2, 0]} rotation={[-0.4, 0, 0]}><boxGeometry args={[10, 0.1, 4]} /></mesh>
      <mesh material={mat.dark} position={[4, 0.05, -16]}><cylinderGeometry args={[7, 7, 0.1, 32]} /></mesh>
      <mesh material={mat.body} position={[0, 9, 0]}><cylinderGeometry args={[0.25, 0.25, 6, 8]} /></mesh>
      <mesh material={mat.beacon} position={[0, 12.5, 0]}><sphereGeometry args={[1, 12, 8]} /></mesh>
      <mesh material={mat.dark} position={[0, 0.3, 0]}><torusGeometry args={[6.3, 0.35, 8, 32]} /></mesh>
    </group>
  );
}
