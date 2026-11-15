/**
 * Perseverance's named samples on the terrain, coloured by rock group. Position = rover
 * position on the sealing sol (NASA waypoints). Clicking one opens it in the Photos tab.
 */
import { Html } from '@react-three/drei';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { latLonToXYZ } from '../../core/geo/mars';
import { SAMPLE_COLORS, loadSamples, roverPositionAt, sampleGroup, sampleSol, samplesState, type RoverSample } from '../../core/live/samples';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';
import { ensureRoverData, roverData } from './RoverLayer';

export interface PlacedSample extends RoverSample {
  lat: number;
  lon: number;
  rmc: string;
}

export const placedSamples: { list: PlacedSample[] } = { list: [] };

function place(): PlacedSample[] {
  const doc = samplesState.doc;
  if (!doc || !roverData.waypoints.length) return [];
  const out: PlacedSample[] = [];
  for (const s of doc.samples) {
    const sol = sampleSol(s);
    if (sol === null) continue;
    const w = roverPositionAt(roverData.waypoints, sol);
    if (w) out.push({ ...s, lat: w.lat, lon: w.lon, rmc: w.rmc });
  }
  return out;
}

/** Load samples + rover positions once; resolves with the placed list. */
export async function ensurePlacedSamples(): Promise<PlacedSample[]> {
  await Promise.all([loadSamples(import.meta.env.BASE_URL), ensureRoverData()]);
  if (!placedSamples.list.length) placedSamples.list = place();
  return placedSamples.list;
}

/** Screen-space pick of the nearest sample marker (null if none within maxPx). */
export function pickNearestSample(sx: number, sy: number, maxPx: number): PlacedSample | null {
  if (!renderBridge.project) return null;
  const os = getMarsOS();
  let best: PlacedSample | null = null, bestD = maxPx;
  for (const s of placedSamples.list) {
    const p = renderBridge.project(s.lat, s.lon, os.terrainModel.height(s.lat, s.lon) + 8);
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
  const selected = useUI((s) => s.sampleN);
  const far = useUI((s) => s.camera.distance > 400);
  const [ready, setReady] = useState(placedSamples.list.length > 0);
  useEffect(() => {
    if (on || selected !== null) ensurePlacedSamples().then((l) => setReady(l.length > 0));
  }, [on, selected]);

  const geo = useMemo(() => {
    if (!ready) return null;
    const pts = placedSamples.list;
    const pos = new Float32Array(pts.length * 3), col = new Float32Array(pts.length * 3);
    const tmp = [0, 0, 0];
    const c = new THREE.Color();
    pts.forEach((s, i) => {
      latLonToXYZ(s.lat, s.lon, (os.terrainModel.height(s.lat, s.lon) + 8) * ex, tmp);
      pos.set(tmp, i * 3);
      c.set(s.n === selected ? '#ffffff' : SAMPLE_COLORS[sampleGroup(s)]);
      col.set([c.r, c.g, c.b], i * 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  }, [ready, ex, selected, os]);

  const sel = selected !== null ? placedSamples.list.find((s) => s.n === selected) : null;
  const selPos = sel ? latLonToXYZ(sel.lat, sel.lon, (os.terrainModel.height(sel.lat, sel.lon) + 14) * ex) : null;

  if (!geo || far || (!on && selected === null)) return null;
  return (
    <>
      {on && (
        <points geometry={geo} renderOrder={7}>
          <pointsMaterial vertexColors size={12} sizeAttenuation={false} transparent opacity={0.95} />
        </points>
      )}
      {sel && selPos && (
        <Html position={[selPos[0], selPos[1], selPos[2]]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div className="sample-label">🧪 {sel.name}</div>
        </Html>
      )}
    </>
  );
}
