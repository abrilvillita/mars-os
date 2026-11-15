/**
 * Non-visual controller: computes routes when start/end/assumptions change, and RE-computes
 * them when the terrain under the analysed area changes (approved edits, restores, previews,
 * or finer elevation data), recording WHY the recommendation changed.
 */
import { useEffect, useRef } from 'react';
import { getMarsOS } from '../api/MarsOS';
import { bboxIntersects } from '../core/geo/mars';
import type { RouteResult } from '../core/routes/RoutePlanner';
import { useRoutes, type RouteChangeNote } from '../state/routeStore';

let runId = 0;

export async function computeRoutes(reason: 'user' | 'terrain') {
  const st = useRoutes.getState();
  if (!st.start || !st.end) return;
  const os = getMarsOS();
  const id = ++runId;
  const prev = st.result;
  st.set({ status: 'computing' });
  try {
    const result = await os.routes.plan(st.start, st.end, st.assumptions);
    if (id !== runId) return; // a newer request superseded this one
    let changeNote: RouteChangeNote | null = reason === 'user' ? null : useRoutes.getState().changeNote;
    if (reason === 'terrain' && prev?.ok && result.ok) {
      const before = new Set(prev.patchIds), after = new Set(result.patchIds);
      changeNote = {
        at: new Date().toISOString(),
        addedPatchIds: result.patchIds.filter((p) => !before.has(p)),
        removedPatchIds: prev.patchIds.filter((p) => !after.has(p)),
        previewActive: os.terrainModel.patchesFor(result.bbox).preview.length > 0,
        deltas: result.routes.map((r) => {
          const o = prev.routes.find((x) => x.kind === r.kind)!;
          return { kind: r.kind, lengthM: r.stats.lengthM - o.stats.lengthM, maxSlopeDeg: r.stats.maxSlopeDeg - o.stats.maxSlopeDeg, gainM: r.stats.gainM - o.stats.gainM };
        }),
      };
      const trivial = changeNote.deltas.every((d) => Math.abs(d.lengthM) < 1 && Math.abs(d.maxSlopeDeg) < 0.05) && !changeNote.addedPatchIds.length && !changeNote.removedPatchIds.length;
      if (trivial) changeNote = useRoutes.getState().changeNote;
    }
    // a real Perseverance drive between A and B? measure it with the same rules and grid
    const rd = useRoutes.getState().realDrive;
    const actualRoute = rd && result.ok ? os.routes.measure(rd.path, result.cellM, st.assumptions) : null;
    useRoutes.getState().set({ result, status: result.ok ? 'done' : 'error', changeNote, actualRoute });
  } catch {
    if (id === runId) useRoutes.getState().set({ status: 'error' });
  }
}

export function RouteController() {
  const start = useRoutes((s) => s.start);
  const end = useRoutes((s) => s.end);
  const assumptions = useRoutes((s) => s.assumptions);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A or B moved away from the loaded real drive → it no longer applies
    const rd = useRoutes.getState().realDrive;
    const same = (p: { lat: number; lon: number } | null, q: { lat: number; lon: number }) => !!p && Math.abs(p.lat - q.lat) < 1e-7 && Math.abs(p.lon - q.lon) < 1e-7;
    if (rd && !(same(start, rd.start) && same(end, rd.end))) useRoutes.getState().set({ realDrive: null, actualRoute: null });
    if (start && end) computeRoutes('user');
  }, [start, end, assumptions]);

  useEffect(() => {
    const os = getMarsOS();
    return os.on('terrain:changed', ({ bbox, reason }) => {
      const r: RouteResult | null = useRoutes.getState().result;
      if (!r) return;
      if (bbox && !bboxIntersects(bbox, r.bbox)) return;
      if (reason.startsWith('elevation-data') && useRoutes.getState().status === 'computing') return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => computeRoutes('terrain'), 700);
    });
  }, []);

  return null;
}
