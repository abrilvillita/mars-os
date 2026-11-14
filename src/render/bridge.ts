/**
 * Narrow bridge between the renderer and the DOM UI. The UI only receives plain data
 * (never Three.js objects), so the interface can be replaced without touching rendering.
 */
import type { Globe } from './globe/Globe';

export interface RigState {
  lat: number;
  lon: number;
  distance: number; // km from the target point on the surface
  heading: number; // deg, 0 = north
  tilt: number; // deg from looking straight down
}

export const renderBridge = {
  globe: null as Globe | null,
  rig: { lat: 18.4, lon: 77.5, distance: 14000, heading: 0, tilt: 0 } as RigState,
  /** Simulation clock (ms since epoch). Advanced by the TimeDriver inside the canvas. */
  clock: { epochMs: Date.now() },
  /** Project lat/lon/height to screen pixels; set by the scene. null if not visible. */
  project: null as null | ((lat: number, lon: number, h_m: number) => { x: number; y: number } | null),
  describeAt(lat: number, lon: number) {
    return this.globe?.describeAt(lat, lon) ?? null;
  },
  /** Renderer statistics for the performance HUD / debugging. */
  stats: { fps: 0, frameMs: 0, updateMs: 0, drawCalls: 0, triangles: 0, leaves: 0, textures: 0 },
};

// exposed for debugging in the browser console (read-only use)
(globalThis as unknown as { marsRender: typeof renderBridge }).marsRender = renderBridge;
