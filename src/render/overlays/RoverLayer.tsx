/**
 * Perseverance traverse (line) and waypoints (points) from the live MMGIS GeoJSON.
 * Heights are draped on the CURRENT terrain model (+ small offset) so the line follows
 * edits; the rover's own published elevations are kept in the data for the inspector.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { getMarsOS } from '../../api/MarsOS';
import { distanceM, latLonToXYZ } from '../../core/geo/mars';
import { loadTraverse, loadWaypoints, type TraverseSegment, type Waypoint } from '../../core/live/m20';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';

export const roverData: {
  waypoints: Waypoint[];
  /** Drive segments as published (one or more per sol). */
  segments: TraverseSegment[];
  /** Whole traverse flattened, ≥ 3 m spacing (for "near the rover's path" queries). */
  track: { lat: number; lon: number }[];
  status: 'idle' | 'loading' | 'ready' | 'error';
  traverseKm: number;
  listeners: Set<() => void>;
} = {
  waypoints: [],
  segments: [],
  track: [],
  listeners: new Set(),
  status: 'idle',
  traverseKm: 0,
};

export function pickNearestWaypoint(sx: number, sy: number, maxPx: number): Waypoint | null {
  if (!renderBridge.project) return null;
  const os = getMarsOS();
  let best: Waypoint | null = null, bestD = maxPx;
  const cam = useUI.getState().camera;
  if (cam.distance > 400) return null;
  for (const w of roverData.waypoints) {
    if (Math.abs(w.lat - cam.lat) > 1 || Math.abs(w.lon - cam.lon) > 1) continue;
    const p = renderBridge.project(w.lat, w.lon, os.terrainModel.height(w.lat, w.lon) + 3);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}

let loading: Promise<void> | null = null;

/**
 * Load Perseverance's traverse + waypoints once (idempotent). Waits for MarsOS to be ready,
 * so callers (layer, route comparator, deep links) never race the catalog.
 */
export function ensureRoverData(): Promise<void> {
  if (loading) return loading;
  const os = getMarsOS();
  loading = (os.ready ? Promise.resolve() : new Promise<void>((res) => {
    const t = setInterval(() => os.ready && (clearInterval(t), res()), 100);
  })).then(async () => {
    const tr = os.catalog.layer('layer.m20.traverse');
    const wp = os.catalog.layer('layer.m20.waypoints');
    if (!tr || tr.access.protocol !== 'geojson' || !wp || wp.access.protocol !== 'geojson') throw new Error('no rover layers');
    roverData.status = 'loading';
    const [segs, wps] = await Promise.all([loadTraverse(tr.access.url), loadWaypoints(wp.access.url)]);
    // flatten + thin to ≥ 3 m spacing
    const out: { lat: number; lon: number }[] = [];
    let total = 0;
    for (const sg of [...segs].sort((x, y) => x.sol - y.sol)) for (const [lon, lat] of sg.coords) {
      const last = out[out.length - 1];
      if (last) {
        const d = distanceM(last.lat, last.lon, lat, lon);
        if (d < 3) continue;
        total += d;
      }
      out.push({ lat, lon });
    }
    roverData.waypoints = wps;
    roverData.segments = segs;
    roverData.track = out;
    roverData.traverseKm = total / 1000;
    roverData.status = 'ready';
    roverData.listeners.forEach((l) => l());
  }).catch(() => {
    roverData.status = 'error';
    loading = null; // allow a retry
    roverData.listeners.forEach((l) => l());
  });
  return loading;
}

export function RoverLayer() {
  const os = getMarsOS();
  const showTraverse = useUI((s) => s.vectors.traverse);
  const showWaypoints = useUI((s) => s.vectors.waypoints);
  const exaggeration = useUI((s) => s.exaggeration);
  const selected = useUI((s) => s.waypoint);
  const [pts, setPts] = useState<{ lat: number; lon: number }[] | null>(null);
  const [rev, setRev] = useState(0);

  useEffect(() => {
    let alive = true;
    ensureRoverData().then(() => alive && roverData.status === 'ready' && setPts(roverData.track));
    return () => {
      alive = false;
    };
  }, [os]);

  // re-drape when terrain changes near the traverse
  // re-drape when terrain (edits or newly loaded elevation tiles) changes near the traverse — debounced
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = os.on('terrain:changed', ({ bbox }) => {
      if (bbox && !(bbox.east > 77.1 && bbox.west < 77.8 && bbox.north > 18.2 && bbox.south < 18.8)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setRev((v) => v + 1), 400);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [os]);

  const origin = useMemo(() => {
    const p = latLonToXYZ(18.45, 77.42, -2500 * exaggeration);
    return new THREE.Vector3(p[0], p[1], p[2]);
  }, [exaggeration]);

  const line = useMemo(() => {
    if (!pts) return null;
    const arr: number[] = [];
    const tmp = [0, 0, 0];
    for (const p of pts) {
      const h = os.terrainModel.height(p.lat, p.lon);
      latLonToXYZ(p.lat, p.lon, (h + 4) * exaggeration, tmp);
      arr.push(tmp[0] - origin.x, tmp[1] - origin.y, tmp[2] - origin.z);
    }
    const g = new LineGeometry();
    g.setPositions(arr);
    const m = new LineMaterial({ color: 0x5ce1ff, linewidth: 2.5, transparent: true, opacity: 0.95, depthTest: true });
    const l = new Line2(g, m);
    l.computeLineDistances();
    l.renderOrder = 5;
    return l;
  }, [pts, exaggeration, origin, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const wpPoints = useMemo(() => {
    if (!pts || !roverData.waypoints.length) return null;
    const arr = new Float32Array(roverData.waypoints.length * 3);
    const tmp = [0, 0, 0];
    roverData.waypoints.forEach((w, i) => {
      latLonToXYZ(w.lat, w.lon, (os.terrainModel.height(w.lat, w.lon) + 4) * exaggeration, tmp);
      arr[i * 3] = tmp[0] - origin.x; arr[i * 3 + 1] = tmp[1] - origin.y; arr[i * 3 + 2] = tmp[2] - origin.z;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, [pts, exaggeration, origin, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const selGeo = useMemo(() => {
    if (!selected) return null;
    const p = latLonToXYZ(selected.lat, selected.lon, (os.terrainModel.height(selected.lat, selected.lon) + 4) * exaggeration);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([p[0] - origin.x, p[1] - origin.y, p[2] - origin.z]), 3));
    return g;
  }, [selected, exaggeration, origin, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineRef = useRef<Line2 | null>(null);
  lineRef.current = line;
  useFrame(({ size }) => {
    const d = useUI.getState().camera.distance;
    if (lineRef.current) {
      (lineRef.current.material as LineMaterial).resolution.set(size.width, size.height);
      lineRef.current.visible = d < 1500;
    }
  });

  const far = useUI((s) => s.camera.distance > 300);
  return (
    <group position={origin}>
      {showTraverse && line && <primitive object={line} />}
      {showWaypoints && wpPoints && !far && (
        <points geometry={wpPoints} renderOrder={6}>
          <pointsMaterial color="#ffffff" size={5} sizeAttenuation={false} depthTest transparent opacity={0.85} />
        </points>
      )}
      {selGeo && (
        <points geometry={selGeo} renderOrder={7}>
          <pointsMaterial color="#ffd23f" size={13} sizeAttenuation={false} depthTest={false} />
        </points>
      )}
    </group>
  );
}
