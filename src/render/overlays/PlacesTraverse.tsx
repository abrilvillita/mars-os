/**
 * Perseverance traverse from the archival NASA PDS PLACES Release 16 product (one line per sol),
 * drawn in green so it can be compared with the more recent MMGIS traverse (cyan). Generic over
 * any catalog layer of kind "traverse" with a local GeoJSON. Draped on the current terrain model.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';

const LAYER_ID = 'layer.m20.places.r16.traverse';

export function PlacesTraverse() {
  const os = getMarsOS();
  const on = useUI((s) => s.vectors.placesTraverse);
  const ex = useUI((s) => s.exaggeration);
  const [lines, setLines] = useState<[number, number][][] | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    if (!on || lines) return;
    const layer = os.catalog.layer(LAYER_ID);
    if (!layer || layer.access.protocol !== 'geojson') return;
    fetch(import.meta.env.BASE_URL + layer.access.url)
      .then((r) => r.json())
      .then((gj) => setLines((gj.features ?? []).filter((f: { geometry?: { type: string } }) => f.geometry?.type === 'LineString').map((f: { geometry: { coordinates: [number, number][] } }) => f.geometry.coordinates)))
      .catch(() => setLines([]));
  }, [on, lines, os]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = os.on('terrain:changed', ({ bbox }) => {
      if (bbox && !(bbox.east > 77.2 && bbox.west < 77.5 && bbox.north > 18.4 && bbox.south < 18.5)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRev((v) => v + 1), 500);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [os]);

  const origin = useMemo(() => {
    const p = latLonToXYZ(18.45, 77.42, -2500 * ex);
    return new THREE.Vector3(p[0], p[1], p[2]);
  }, [ex]);

  const group = useMemo(() => {
    if (!lines || !lines.length) return null;
    const g = new THREE.Group();
    const mat = new LineMaterial({ color: 0x7dff9a, linewidth: 2, transparent: true, opacity: 0.9 });
    const tmp = [0, 0, 0];
    for (const coords of lines) {
      const arr: number[] = [];
      for (const [lon, lat] of coords) {
        latLonToXYZ(lat, lon, (os.terrainModel.height(lat, lon) + 6) * ex, tmp);
        arr.push(tmp[0] - origin.x, tmp[1] - origin.y, tmp[2] - origin.z);
      }
      if (arr.length < 6) continue;
      const geo = new LineGeometry();
      geo.setPositions(arr);
      const l = new Line2(geo, mat);
      l.computeLineDistances();
      l.renderOrder = 5;
      g.add(l);
    }
    g.userData.mat = mat;
    return g;
  }, [lines, ex, origin, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const ref = useRef<THREE.Group | null>(null);
  ref.current = group;
  useFrame(({ size }) => {
    const g = ref.current;
    if (!g) return;
    (g.userData.mat as LineMaterial).resolution.set(size.width, size.height);
    g.visible = useUI.getState().camera.distance < 1500;
  });

  if (!on || !group) return null;
  return (
    <group position={origin}>
      <primitive object={group} />
    </group>
  );
}
