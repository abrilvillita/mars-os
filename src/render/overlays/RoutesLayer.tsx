/** Draws the compared routes (shortest = orange, low-slope = violet) and A/B markers on the terrain. */
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { useRoutes } from '../../state/routeStore';
import { useUI } from '../../state/uiStore';

const COLORS = { shortest: 0xff8a4c, lowSlope: 0xb18cff, actual: 0xf2f2f2 } as const;

export function RoutesLayer() {
  const os = getMarsOS();
  const result = useRoutes((s) => s.result);
  const actual = useRoutes((s) => s.actualRoute);
  const start = useRoutes((s) => s.start);
  const end = useRoutes((s) => s.end);
  const ex = useUI((s) => s.exaggeration);

  const origin = useMemo(() => {
    const c = start ?? end ?? { lat: 0, lon: 0 };
    const p = latLonToXYZ(c.lat, c.lon, os.ready ? os.terrainModel.height(c.lat, c.lon) * ex : 0);
    return new THREE.Vector3(p[0], p[1], p[2]);
  }, [start, end, ex, os]);

  const group = useMemo(() => {
    if (!result?.ok) return null;
    const g = new THREE.Group();
    const tmp = [0, 0, 0];
    for (const r of actual ? [...result.routes, actual] : result.routes) {
      const arr: number[] = [];
      for (const p of r.points) {
        // drape on the rendered terrain (+ a few metres so it is never hidden)
        latLonToXYZ(p.lat, p.lon, (os.terrainModel.height(p.lat, p.lon) + 6) * ex, tmp);
        arr.push(tmp[0] - origin.x, tmp[1] - origin.y, tmp[2] - origin.z);
      }
      if (arr.length < 6) continue;
      const geo = new LineGeometry();
      geo.setPositions(arr);
      const mat = new LineMaterial({ color: COLORS[r.kind], linewidth: r.kind === 'lowSlope' ? 4 : 3, transparent: true, opacity: 0.95 });
      const line = new Line2(geo, mat);
      line.computeLineDistances();
      line.renderOrder = 6;
      g.add(line);
    }
    return g;
  }, [result, actual, ex, origin, os]);

  const ref = useRef<THREE.Group | null>(null);
  ref.current = group;
  useFrame(({ size }) => {
    ref.current?.children.forEach((c) => ((c as Line2).material as LineMaterial).resolution.set(size.width, size.height));
  });

  const marker = (p: { lat: number; lon: number } | null, label: string) => {
    if (!p) return null;
    const v = latLonToXYZ(p.lat, p.lon, (os.ready ? os.terrainModel.height(p.lat, p.lon) + 10 : 0) * ex);
    return (
      <Html position={[v[0], v[1], v[2]]} center zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
        <div className={`route-marker rm-${label}`}>{label}</div>
      </Html>
    );
  };

  return (
    <>
      {group && (
        <group position={origin}>
          <primitive object={group} />
        </group>
      )}
      {marker(start, 'A')}
      {marker(end, 'B')}
    </>
  );
}
