/** Composition root of the 3D view. Swap or extend layers here without touching core/ or ui/. */
import { PerformanceMonitor } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useState } from 'react';
import * as THREE from 'three';
import { CameraRig } from './camera/CameraRig';
import { GlobeLayer } from './globe/GlobeLayer';
import { NodeGrid } from './overlays/NodeGrid';
import { RegionLabels } from './overlays/RegionLabels';
import { RoverLayer } from './overlays/RoverLayer';
import { LocationMarkers } from './overlays/LocationMarkers';
import { PlacesTraverse } from './overlays/PlacesTraverse';
import { RoutesLayer } from './overlays/RoutesLayer';
import { DustStorm } from './scene/DustStorm';
import { Atmosphere, Moons, SkyAndHaze, SkyDome, StarField, SunGlare, TimeDriver } from './scene/Environment';
import { renderBridge } from './bridge';
import { useUI } from '../state/uiStore';

const MAX_DPR = Math.min(1.5, window.devicePixelRatio || 1);

export function MarsScene() {
  const env = useUI((s) => s.env);
  // adaptive quality for integrated GPUs: lower internal resolution and LOD detail when FPS drops
  const [dpr, setDpr] = useState(Math.min(1.25, MAX_DPR));
  const adapt = (factor: number) => {
    setDpr(Math.max(0.75, Math.min(MAX_DPR, 0.75 + factor * (MAX_DPR - 0.75))));
    if (renderBridge.globe) renderBridge.globe.lodFactor = 1.6 - factor * 0.6;
  };
  return (
    <Canvas
      className="mars-canvas"
      dpr={dpr}
      gl={{ logarithmicDepthBuffer: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 45, near: 0.001, far: 3e6, position: [20000, 0, 0] }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.NoToneMapping;
      }}
    >
      <PerformanceMonitor factor={0.7} bounds={() => [32, 55]} onChange={({ factor }) => adapt(factor)} flipflops={6} />
      <TimeDriver />
      <CameraRig />
      <SkyAndHaze />
      {env.atmosphere && <SkyDome />}
      {env.stars && <StarField />}
      <SunGlare />
      <GlobeLayer />
      {env.atmosphere && <Atmosphere />}
      {env.moons && <Moons />}
      <DustStorm />
      <RoverLayer />
      <PlacesTraverse />
      <RoutesLayer />
      <NodeGrid />
      <RegionLabels />
      <LocationMarkers />
    </Canvas>
  );
}
