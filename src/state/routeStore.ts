/** View state of the route comparator (the planning logic lives in core/routes + MarsOS.routes). */
import { create } from 'zustand';
import { PROFILE_ASSUMPTIONS, type LatLonPt, type Route, type RouteAssumptions, type RouteResult, type TravelerProfile } from '../core/routes/RoutePlanner';
import type { RealDrive } from '../core/routes/realDrive';

export interface RouteChangeNote {
  at: string;
  addedPatchIds: string[];
  removedPatchIds: string[];
  previewActive: boolean;
  deltas: { kind: 'shortest' | 'lowSlope' | 'actual'; lengthM: number; maxSlopeDeg: number; gainM: number }[];
}

interface RouteState {
  start: LatLonPt | null;
  end: LatLonPt | null;
  pickMode: 'start' | 'end' | null;
  profile: TravelerProfile;
  assumptions: RouteAssumptions;
  status: 'idle' | 'computing' | 'done' | 'error';
  result: RouteResult | null;
  changeNote: RouteChangeNote | null;
  /** A real Perseverance drive whose endpoints are A and B (null = free A/B). */
  realDrive: RealDrive | null;
  /** That drive measured with the same rules as the computed routes. */
  actualRoute: Route | null;
  /** Drive simulation running (rover/astronaut model follows the route). */
  driving: boolean;
  set: (p: Partial<RouteState>) => void;
}

export const useRoutes = create<RouteState>((set) => ({
  start: null,
  end: null,
  pickMode: null,
  profile: 'rover',
  assumptions: { ...PROFILE_ASSUMPTIONS.rover },
  status: 'idle',
  result: null,
  changeNote: null,
  realDrive: null,
  actualRoute: null,
  driving: false,
  set: (p) => set(p),
}));
