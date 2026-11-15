/**
 * Gold markers at the rover position on sols with CacheCam (sample-handling) activity.
 * Clicking one opens the Photos tab with that sol's CacheCam images.
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { cachecam, loadCacheCamIndex, type CacheCamSol } from '../../core/live/cachecam';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';

/** Screen-space pick of the nearest sample-handling marker (null if none within maxPx). */
export function pickNearestSample(sx: number, sy: number, maxPx: number): CacheCamSol | null {
  const idx = cachecam.index;
  if (!idx || !renderBridge.project) return null;
  const os = getMarsOS();
  let best: CacheCamSol | null = null, bestD = maxPx;
  for (const s of idx.sols) {
    if (!s.position) continue;
    const p = renderBridge.project(s.position.lat, s.position.lon, os.terrainModel.height(s.position.lat, s.position.lon) + 8);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

export function SamplesLayer() {
  const os = getMarsOS();
  const on = useUI((s) => s.vectors.samples);
  const ex = useUI((s) => s.exaggeration);
  const selected = useUI((s) => s.cachecamSol);
  const far = useUI((s) => s.camera.distance > 400);
  const [ready, setReady] = useState(!!cachecam.index);
  useEffect(() => {
    if (on) loadCacheCamIndex(import.meta.env.BASE_URL).then(() => setReady(true));
  }, [on]);

  const geo = useMemo(() => {
    const idx = cachecam.index;
    if (!ready || !idx) return null;
    const pts = idx.sols.filter((s) => s.position);
    const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
    const tmp = [0, 0, 0];
    pts.forEach((s, i) => {
      const p = s.position!;
      latLonToXYZ(p.lat, p.lon, (os.terrainModel.height(p.lat, p.lon) + 8) * ex, tmp);
      pos.set(tmp, i * 3);
      const isSel = s.sol === selected;
      col.set(isSel ? [1, 1, 1] : [1, 0.78, 0.2], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [ready, ex, selected, os]);

  if (!on || !geo || far) return null;
  return (
    <points geometry={geo} renderOrder={7}>
      <pointsMaterial vertexColors size={11} sizeAttenuation={false} transparent opacity={0.95} />
    </points>
  );
}
