/** View state of the route comparator (the planning logic lives in core/routes + MarsOS.routes). */
import { create } from 'zustand';
import { DEFAULT_ASSUMPTIONS, type LatLonPt, type RouteAssumptions, type RouteResult } from '../core/routes/RoutePlanner';

export interface RouteChangeNote {
  at: string;
  addedPatchIds: string[];
  removedPatchIds: string[];
  previewActive: boolean;
  deltas: { kind: 'shortest' | 'lowSlope'; lengthM: number; maxSlopeDeg: number; gainM: number }[];
}

interface RouteState {
  start: LatLonPt | null;
  end: LatLonPt | null;
  pickMode: 'start' | 'end' | null;
  assumptions: RouteAssumptions;
  status: 'idle' | 'computing' | 'done' | 'error';
  result: RouteResult | null;
  changeNote: RouteChangeNote | null;
  set: (p: Partial<RouteState>) => void;
}

export const useRoutes = create<RouteState>((set) => ({
  start: null,
  end: null,
  pickMode: null,
  assumptions: { ...DEFAULT_ASSUMPTIONS },
  status: 'idle',
  result: null,
  changeNote: null,
  set: (p) => set(p),
}));
