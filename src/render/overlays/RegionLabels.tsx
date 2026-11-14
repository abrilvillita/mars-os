/** Labels for catalog regions (DOM via drei Html), hidden behind the planet or at the wrong scale. */
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ, MARS_RADIUS_KM } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';
import type { RegionT } from '../../contract';

function zoomWindow(r: RegionT): [number, number] {
  // [min, max] camera distance (km) at which the label is useful
  const w = (r.bbox.east - r.bbox.west) * 59.3;
  return [w * 0.4, w * 400];
}

function Label({ r }: { r: RegionT }) {
  const { i18n } = useTranslation();
  const ex = useUI((s) => s.exaggeration);
  const os = getMarsOS();
  const pos = useMemo(() => {
    const h = os.ready ? os.terrainModel.height(r.center.lat, r.center.lon) : 0;
    const p = latLonToXYZ(r.center.lat, r.center.lon, (h + 50) * ex);
    return new THREE.Vector3(p[0], p[1], p[2]);
  }, [r, ex, os]);
  const el = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    const d = useUI.getState().camera.distance;
    const [lo, hi] = zoomWindow(r);
    const facing = pos.clone().normalize().dot(camera.position.clone().normalize()) > MARS_RADIUS_KM / camera.position.length() - 0.01;
    const v = facing && d > lo && d < hi;
    if (el.current) el.current.style.display = v ? '' : 'none';
  });
  const label = (r.label as Record<string, string>)[i18n.language] ?? r.label.en;
  return (
    <Html position={pos} center style={{ pointerEvents: 'none' }} zIndexRange={[10, 0]}>
      <div ref={el} style={{ display: 'none' }} className={`region-label type-${r.type}`}>{label}</div>
    </Html>
  );
}

export function RegionLabels() {
  const show = useUI((s) => s.vectors.regions);
  const os = getMarsOS();
  if (!show || !os.ready) return null;
  return (
    <>
      {os.regions.list().map((r) => (
        <Label key={r.id} r={r} />
      ))}
    </>
  );
}
