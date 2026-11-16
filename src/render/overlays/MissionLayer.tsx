/**
 * Mission Lab on the map: the crew / rover / base you placed (3D model + label), the EVA
 * exploration radius around it, and the two saved sites being compared. Also shows a rover
 * model where each rover is today (or ended its mission).
 */
import { Html } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { getMarsOS } from '../../api/MarsOS';
import { DEG, latLonToXYZ, M_PER_DEG } from '../../core/geo/mars';
import { currentPosition, explorersState } from '../../core/live/explorers';
import { evaRadiusKm } from '../../core/mission/missionModel';
import { useMission } from '../../state/missionStore';
import { useUI } from '../../state/uiStore';
import { m20Last, useExplorers } from './ExplorersLayer';
import { AstronautShape, BaseShape, RoverShape, SurfaceObject } from './Models';
import { DriveSim } from './DriveSim';

function Ring({ lat, lon, rKm, color }: { lat: number; lon: number; rKm: number; color: string }) {
  const os = getMarsOS();
  const ex = useUI((s) => s.exaggeration);
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const tmp = [0, 0, 0];
    for (let k = 0; k <= 96; k++) {
      const a = (k / 96) * 2 * Math.PI;
      const la = lat + (rKm * 1000 * Math.cos(a)) / M_PER_DEG;
      const lo = lon + (rKm * 1000 * Math.sin(a)) / (M_PER_DEG * Math.cos(lat * DEG));
      latLonToXYZ(la, lo, (os.terrainModel.height(la, lo) + 15) * ex, tmp);
      pts.push(new THREE.Vector3(tmp[0], tmp[1], tmp[2]));
    }
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color }));
    l.renderOrder = 8;
    return l;
  }, [lat, lon, rKm, color, ex, os]);
  return <primitive object={line} />;
}

function Label({ lat, lon, text, cls }: { lat: number; lon: number; text: string; cls: string }) {
  const os = getMarsOS();
  const v = latLonToXYZ(lat, lon, (os.terrainModel.height(lat, lon) + 30) * useUI.getState().exaggeration);
  return (
    <Html position={[v[0], v[1], v[2]]} center zIndexRange={[12, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`mission-label ${cls}`}>{text}</div>
    </Html>
  );
}

/** Rover models where Spirit, Opportunity, Curiosity and Perseverance are (or stopped). */
function RoverModels() {
  const st = useExplorers();
  const near = useUI((s) => s.camera.distance < 400);
  if (!near) return null;
  const last = m20Last();
  return (
    <>
      {st.list.filter((e) => e.kind === 'rover' && e.id !== 'pathfinder').map((e) => {
        const p = currentPosition(e, last);
        return (
          <group key={e.id}>
            <SurfaceObject lat={p.lat} lon={p.lon} heading={0} scale={1} viewM={120}>
              <RoverShape />
            </SurfaceObject>
            <Label lat={p.lat} lon={p.lon} text={e.name} cls="m-rover" />
          </group>
        );
      })}
    </>
  );
}

export function MissionLayer() {
  const site = useMission((s) => s.site);
  const inputs = useMission((s) => s.inputs);
  const saved = useMission((s) => s.saved);
  const explorersOn = useUI((s) => s.vectors.explorers);
  const r = evaRadiusKm(inputs);
  void explorersState;
  return (
    <>
      <hemisphereLight args={['#fff4e6', '#5a3a2a', 0.6]} />
      {explorersOn && <RoverModels />}
      <DriveSim />
      {site && (
        <>
          <SurfaceObject lat={site.lat} lon={site.lon} heading={30} viewM={120}>
            {inputs.kind === 'rover' ? <RoverShape /> : inputs.kind === 'base' ? <BaseShape /> : <AstronautShape />}
          </SurfaceObject>
          {inputs.kind !== 'rover' && r > 0 && <Ring lat={site.lat} lon={site.lon} rKm={r} color="#5fd39a" />}
          <Label lat={site.lat} lon={site.lon} text="MISSION" cls="m-site" />
        </>
      )}
      {saved.A && <Label lat={saved.A.lat} lon={saved.A.lon} text={`A · ${saved.A.label}`} cls="m-a" />}
      {saved.B && <Label lat={saved.B.lat} lon={saved.B.lon} text={`B · ${saved.B.label}`} cls="m-b" />}
    </>
  );
}
