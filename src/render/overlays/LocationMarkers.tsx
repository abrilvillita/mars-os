/**
 * Visual distinction between the PINNED location (orange pin with a vertical beam, persistent)
 * and the CURSOR preview (small cyan ring that follows the mouse).
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';

function ringTexture(color: string, filled: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(32, 32, 24, 0, Math.PI * 2);
  g.stroke();
  if (filled) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(32, 32, 9, 0, Math.PI * 2);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

export function LocationMarkers() {
  const os = getMarsOS();
  const pinTex = useMemo(() => ringTexture('#ff8a4c', true), []);
  const curTex = useMemo(() => ringTexture('#5ce1ff', false), []);
  const pin = useRef<THREE.Sprite>(null);
  const cur = useRef<THREE.Sprite>(null);
  const beamGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), []);
  const beamObj = useMemo(() => {
    const l = new THREE.Line(beamGeo, new THREE.LineBasicMaterial({ color: '#ff8a4c', depthTest: false, transparent: true, opacity: 0.9 }));
    l.renderOrder = 20;
    l.frustumCulled = false;
    return l;
  }, [beamGeo]);
  const beam = useRef<THREE.Line>(beamObj);
  const tmp = useMemo(() => [0, 0, 0], []);

  useFrame(({ camera }) => {
    const st = useUI.getState();
    const ex = st.exaggeration;
    const place = (s: THREE.Object3D | null, p: { lat: number; lon: number } | null) => {
      if (!s) return null;
      if (!p || !os.ready) {
        s.visible = false;
        return null;
      }
      const h = os.terrainModel.height(p.lat, p.lon);
      latLonToXYZ(p.lat, p.lon, h * ex, tmp);
      s.position.set(tmp[0], tmp[1], tmp[2]);
      s.visible = true;
      return s.position;
    };
    const pp = place(pin.current, st.pick);
    place(cur.current, st.hover);
    if (beam.current) {
      beam.current.visible = !!pp;
      if (pp) {
        // beam length ~ 6% of camera distance so it reads at any scale
        const len = Math.max(0.01, camera.position.distanceTo(pp) * 0.06);
        const up = pp.clone().normalize();
        const pos = beamGeo.attributes.position as THREE.BufferAttribute;
        pos.setXYZ(0, pp.x, pp.y, pp.z);
        pos.setXYZ(1, pp.x + up.x * len, pp.y + up.y * len, pp.z + up.z * len);
        pos.needsUpdate = true;
        beamGeo.computeBoundingSphere();
      }
    }
  });

  return (
    <>
      <sprite ref={pin} scale={[0.035, 0.035, 1]} renderOrder={20} visible={false}>
        <spriteMaterial map={pinTex} sizeAttenuation={false} depthTest={false} transparent />
      </sprite>
      <sprite ref={cur} scale={[0.022, 0.022, 1]} renderOrder={19} visible={false}>
        <spriteMaterial map={curTex} sizeAttenuation={false} depthTest={false} transparent opacity={0.85} />
      </sprite>
      <primitive object={beamObj} />
    </>
  );
}
