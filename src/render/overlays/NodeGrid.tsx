/**
 * Editable node grid of the selected cell: nodes (points) + connections (grid edges),
 * drawn relative to the cell center. Colors: white = source, cyan/magenta = edited up/down,
 * yellow = selected; hollow-looking (dim) = interpolated finer than the source DEM.
 */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { getMarsOS, type NodeInfo } from '../../api/MarsOS';
import { bboxIntersects, latLonToXYZ } from '../../core/geo/mars';
import { parseCellId, tileBBox } from '../../core/geo/tiling';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';

let currentNodes: NodeInfo[] = [];

export function pickNearestNode(sx: number, sy: number, maxPx: number): string | null {
  if (!renderBridge.project) return null;
  let best: string | null = null, bestD = maxPx;
  for (const n of currentNodes) {
    const p = renderBridge.project(n.lat, n.lon, n.height_m);
    if (!p) continue;
    const d = Math.hypot(p.x - sx, p.y - sy);
    if (d < bestD) { bestD = d; best = n.id; }
  }
  return best;
}

export function NodeGrid() {
  const os = getMarsOS();
  const cell = useUI((s) => s.selectedCellId);
  const N = useUI((s) => s.nodeGridSize);
  const show = useUI((s) => s.showNodes && s.rightTab === 'nodes');
  const selected = useUI((s) => s.selectedNodeIds);
  const ex = useUI((s) => s.exaggeration);
  const [rev, setRev] = useState(0);

  useEffect(() => os.on('terrain:changed', ({ bbox }) => {
    const t = cell ? parseCellId(cell) : null;
    if (t && (!bbox || bboxIntersects(bbox, tileBBox(t)))) setRev((r) => r + 1);
  }), [os, cell]);

  const data = useMemo(() => {
    if (!cell || !show) {
      currentNodes = [];
      return null;
    }
    const t = parseCellId(cell)!;
    const b = tileBBox(t);
    const nodes = os.nodes.grid(cell, N);
    currentNodes = nodes;
    const c = latLonToXYZ((b.north + b.south) / 2, (b.east + b.west) / 2, nodes[0].height_m * ex);
    const center = new THREE.Vector3(c[0], c[1], c[2]);
    const pos = new Float32Array(nodes.length * 3), col = new Float32Array(nodes.length * 3);
    const tmp = [0, 0, 0];
    const sel = new Set(selected);
    nodes.forEach((n, k) => {
      latLonToXYZ(n.lat, n.lon, (n.height_m + 2) * ex, tmp);
      pos[k * 3] = tmp[0] - center.x; pos[k * 3 + 1] = tmp[1] - center.y; pos[k * 3 + 2] = tmp[2] - center.z;
      let color = n.interpolated ? new THREE.Color(0.75, 0.75, 0.78) : new THREE.Color(1, 1, 1);
      if (Math.abs(n.edit_m) > 0.01) color = n.edit_m > 0 ? new THREE.Color(0.2, 0.9, 1) : new THREE.Color(1, 0.3, 0.9);
      if (sel.has(n.id)) color = new THREE.Color(1, 0.84, 0.15);
      col[k * 3] = color.r; col[k * 3 + 1] = color.g; col[k * 3 + 2] = color.b;
    });
    const idx: number[] = [];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      if (i < N - 1) idx.push(k, k + 1);
      if (j < N - 1) idx.push(k, k + N);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lg.setIndex(idx);
    return { center, pg, lg };
  }, [cell, N, show, selected, ex, os, rev]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  return (
    <group position={data.center}>
      <lineSegments geometry={data.lg} renderOrder={8}>
        <lineBasicMaterial color="#ffd970" transparent opacity={0.45} depthTest={false} />
      </lineSegments>
      <points geometry={data.pg} renderOrder={9}>
        <pointsMaterial vertexColors size={8} sizeAttenuation={false} depthTest={false} />
      </points>
    </group>
  );
}
