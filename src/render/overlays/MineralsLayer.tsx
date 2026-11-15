/**
 * Orbital mineral detections (points, provider colours) and CRISM targeted-observation
 * footprints at Human Exploration sites (outlines). Loaded on demand when toggled on.
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { ensureMinerals, mineralData } from '../../core/live/minerals';
import { useUI } from '../../state/uiStore';

export function MineralsLayer() {
  const os = getMarsOS();
  const showPts = useUI((s) => s.vectors.minerals);
  const showCrism = useUI((s) => s.vectors.crism);
  const ex = useUI((s) => s.exaggeration);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (showPts || showCrism) ensureMinerals().then(() => setRev((r) => r + 1));
  }, [showPts, showCrism]);

  const points = useMemo(() => {
    if (!showPts || !mineralData.points) return null;
    const pts = mineralData.points;
    const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
    const tmp = [0, 0, 0];
    pts.forEach((p, i) => {
      latLonToXYZ(p.lat, p.lon, (os.elevationService.height(p.lat, p.lon, 2000) + 40) * ex, tmp);
      pos.set(tmp, i * 3);
      col.set(p.color, i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [showPts, ex, rev, os]); // eslint-disable-line react-hooks/exhaustive-deps

  const outlines = useMemo(() => {
    if (!showCrism || !mineralData.footprints) return null;
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: '#ff5ce1', transparent: true, opacity: 0.9 });
    const tmp = [0, 0, 0];
    for (const f of mineralData.footprints) {
      const pts: THREE.Vector3[] = [];
      for (let k = 0; k < f.ring.length - 1; k++) {
        // densify edges so outlines follow the curved surface
        const [lon0, lat0] = f.ring[k], [lon1, lat1] = f.ring[k + 1];
        for (let s = 0; s < 8; s++) {
          const t = s / 8, lat = lat0 + (lat1 - lat0) * t, lon = lon0 + (lon1 - lon0) * t;
          latLonToXYZ(lat, lon, (os.elevationService.height(lat, lon, 500) + 60) * ex, tmp);
          pts.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
        }
      }
      const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), mat);
      line.renderOrder = 6;
      g.add(line);
    }
    return g;
  }, [showCrism, ex, rev, os]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {points && (
        <points geometry={points} renderOrder={6}>
          <pointsMaterial vertexColors size={7} sizeAttenuation={false} transparent opacity={0.95} />
        </points>
      )}
      {outlines && <primitive object={outlines} />}
    </>
  );
}
