/**
 * UI/view state only (what is visible, selected, how it is displayed). Scientific data and
 * terrain state live in the MarsOS API; the renderer reads both.
 */
import { create } from 'zustand';

export type DisplayMode = 'imagery' | 'hypsometric' | 'slope' | 'edits';
export type RightTab = 'inspect' | 'routes' | 'nodes' | 'ai' | 'history' | 'environment' | 'photos';

export interface LayerViewState {
  on: boolean;
  opacity: number;
}

export interface HoverInfo {
  lat: number;
  lon: number;
  distanceKm: number;
}

/** A location fixed by clicking the terrain. Cursor movement never overwrites it. */
export interface PinnedLocation {
  lat: number;
  lon: number;
  distanceKm: number;
  cellId: string;
  cellZoom: number;
  pinnedAt: number;
}

export interface CameraTarget {
  lat: number;
  lon: number;
  /** distance from target in km */
  distance: number;
  heading?: number;
  tilt?: number;
}

export interface WaypointSelection {
  sol: number;
  rmc: string;
  lat: number;
  lon: number;
}

interface UIState {
  baseLayerId: string;
  overlays: Record<string, LayerViewState>;
  vectors: { traverse: boolean; placesTraverse: boolean; waypoints: boolean; regions: boolean; graticule: boolean; minerals: boolean; crism: boolean };
  displayMode: DisplayMode;
  realLighting: boolean;
  /** Helmet visor HUD overlay (training view). */
  hud: boolean;
  exaggeration: number;
  forceOffline: boolean;
  tileStatus: { offline: boolean; failures: number };

  rightTab: RightTab;
  panelsOpen: { left: boolean; right: boolean };

  hover: HoverInfo | null;
  /** Fixed selection (persists while the cursor moves or panels scroll). */
  pick: PinnedLocation | null;
  /** When true, clicks on the terrain do not replace the pinned location. */
  pinLocked: boolean;
  /** One-shot: the next terrain click replaces the pin even if locked. */
  repinArmed: boolean;
  selectedCellId: string | null;
  cellZoom: number;
  nodeGridSize: number;
  showNodes: boolean;
  selectedNodeIds: string[];
  previewProposalId: string | null;

  time: { epochMs: number; speed: number; playing: boolean };

  env: { dustStorm: boolean; stormIntensity: number; atmosphere: boolean; moons: boolean; stars: boolean };

  waypoint: WaypointSelection | null;

  flyTo: (CameraTarget & { nonce: number }) | null;
  camera: { lat: number; lon: number; distance: number; altitudeKm: number; tilt: number; heading: number };

  set: (p: Partial<UIState>) => void;
  setOverlay: (id: string, p: Partial<LayerViewState>) => void;
  requestFlyTo: (t: CameraTarget) => void;
}

export const useUI = create<UIState>((set) => ({
  baseLayerId: 'layer.viking.color',
  overlays: {
    'layer.jezero.ctx': { on: true, opacity: 1 },
    'layer.jezero.hirise': { on: true, opacity: 1 },
    'layer.geology.sim3292': { on: false, opacity: 0.55 },
  },
  vectors: { traverse: true, placesTraverse: false, waypoints: true, regions: true, graticule: false, minerals: false, crism: false },
  displayMode: 'imagery',
  realLighting: true,
  hud: false,
  exaggeration: 3,
  forceOffline: false,
  tileStatus: { offline: false, failures: 0 },

  rightTab: 'inspect',
  panelsOpen: { left: true, right: true },

  hover: null,
  pick: null,
  pinLocked: false,
  repinArmed: false,
  selectedCellId: null,
  cellZoom: 12,
  nodeGridSize: 9,
  showNodes: true,
  selectedNodeIds: [],
  previewProposalId: null,

  time: { epochMs: Date.now(), speed: 1, playing: true },

  env: { dustStorm: false, stormIntensity: 0.6, atmosphere: true, moons: true, stars: true },

  waypoint: null,

  flyTo: null,
  camera: { lat: 18.4, lon: 77.5, distance: 12000, altitudeKm: 12000, tilt: 0, heading: 0 },

  set: (p) => set(p),
  setOverlay: (id, p) => set((s) => ({ overlays: { ...s.overlays, [id]: { ...(s.overlays[id] ?? { on: false, opacity: 1 }), ...p } } })),
  requestFlyTo: (t) => set({ flyTo: { ...t, nonce: Math.random() } }),
}));
