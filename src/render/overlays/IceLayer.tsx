/** Water-ice evidence: icy impact craters (bright cyan) and glacier-like forms (pale blue). */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { ensureIce, iceData } from '../../core/live/ice';
import { useUI } from '../../state/uiStore';

export const ICE_COLORS = { icyCrater: '#3ff0ff', glacier: '#a9c8ff' } as const;

export function IceLayer() {
  const os = getMarsOS();
  const on = useUI((s) => s.vectors.ice);
  const ex = useUI((s) => s.exaggeration);
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (on) ensureIce().then(() => setRev((r) => r + 1));
  }, [on]);

  const geos = useMemo(() => {
    if (!on || !iceData.points) return null;
    const make = (kind: 'icyCrater' | 'glacier') => {
      const pts = iceData.points!.filter((p) => p.kind === kind);
      const pos = new Float32Array(pts.length * 3);
      const tmp = [0, 0, 0];
      pts.forEach((p, i) => {
        latLonToXYZ(p.lat, p.lon, (os.elevationService.height(p.lat, p.lon, 2000) + 60) * ex, tmp);
        pos.set(tmp, i * 3);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      return g;
    };
    return { craters: make('icyCrater'), glaciers: make('glacier') };
  }, [on, ex, rev, os]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!geos) return null;
  return (
    <>
      <points geometry={geos.glaciers} renderOrder={6}>
        <pointsMaterial color={ICE_COLORS.glacier} size={5} sizeAttenuation={false} transparent opacity={0.85} />
      </points>
      <points geometry={geos.craters} renderOrder={7}>
        <pointsMaterial color={ICE_COLORS.icyCrater} size={11} sizeAttenuation={false} transparent opacity={1} />
      </points>
    </>
  );
}
