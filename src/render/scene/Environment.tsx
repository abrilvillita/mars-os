/**
 * Space & atmosphere environment:
 *  - TimeDriver: simulation clock → real sun direction (Mars24 subsolar point)
 *  - Atmosphere rim glow (visual), surface sky colour & haze when close to the ground
 *  - Sun glare, star field (decorative), Phobos & Deimos (real orbit radii & periods,
 *    illustrative phase and simplified ellipsoid shapes)
 */
import { Html, Stars } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { latLonToXYZ, MARS_RADIUS_KM } from '../../core/geo/mars';
import { marsTime } from '../../core/time/marsTime';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';
import { useTranslation } from 'react-i18next';

export const sunDir = new THREE.Vector3(1, 0, 0);

export function TimeDriver() {
  const lastPush = useRef(0);
  useFrame((_, dt) => {
    const { time, set } = useUI.getState();
    if (time.playing) renderBridge.clock.epochMs += Math.min(dt, 0.1) * 1000 * time.speed;
    const t = marsTime(new Date(renderBridge.clock.epochMs));
    const p = latLonToXYZ(t.subsolarLat, t.subsolarLon, 0);
    sunDir.set(p[0], p[1], p[2]).normalize();
    const g = renderBridge.globe?.globals;
    if (g) g.uSunDir.value.copy(sunDir);
    const now = performance.now();
    if (now - lastPush.current > 250) {
      lastPush.current = now;
      set({ time: { ...time, epochMs: renderBridge.clock.epochMs } });
    }
  });
  return null;
}

/** Thin dusty limb glow (visual effect, not a physical atmosphere model). */
export function Atmosphere() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uSun: { value: sunDir }, uCam: { value: new THREE.Vector3() } },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(position); vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz;
            gl_Position = projectionMatrix*viewMatrix*w;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
          void main(){
            #include <logdepthbuf_fragment>
            vec3 v = normalize(cameraPosition - vW);
            float rim = pow(1.0 - abs(dot(v, vN)), 2.6);
            float day = smoothstep(-0.25, 0.35, dot(vN, uSun));
            vec3 dust = vec3(0.93, 0.62, 0.40);
            vec3 twilight = vec3(0.45, 0.62, 0.95); // forward-scattered blue near the sun (observed at Martian sunsets)
            float fwd = pow(max(dot(-v, uSun), 0.0), 8.0);
            vec3 c = mix(dust, twilight, fwd * 0.6);
            gl_FragColor = vec4(c * rim * day * 1.25, rim * day);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  return (
    <mesh material={mat} renderOrder={-1}>
      <sphereGeometry args={[MARS_RADIUS_KM * 1.028, 96, 64]} />
    </mesh>
  );
}

/** Background sky colour + distance haze once inside the atmosphere. */
export function SkyAndHaze() {
  const { scene, camera } = useThree();
  const bg = useMemo(() => new THREE.Color(0, 0, 0), []);
  useFrame(() => {
    const st = useUI.getState();
    const alt = st.camera.altitudeKm;
    const up = camera.position.clone().normalize();
    const sunElev = up.dot(sunDir); // sin of solar elevation at the camera
    const day = THREE.MathUtils.smoothstep(sunElev, -0.08, 0.25);
    const inside = THREE.MathUtils.smoothstep(-alt, -90, -6); // 0 above 90 km, 1 below 6 km
    const sky = SKY.horizon.clone().multiplyScalar(0.03 + 0.97 * day);
    bg.setRGB(0.004, 0.004, 0.012).lerp(sky, inside * (st.env.atmosphere ? 1 : 0));
    scene.background = bg;
    const g = renderBridge.globe?.globals;
    if (g) {
      const storm = st.env.dustStorm ? stormFactorAtCamera(camera.position) * st.env.stormIntensity : 0;
      const haze = st.env.atmosphere ? 0.012 * inside : 0;
      g.uFogDensity.value = haze + storm * 0.6 * inside + storm * 0.002;
      g.uFogColor.value.copy(sky).lerp(new THREE.Color(0.62, 0.42, 0.28).multiplyScalar(0.3 + day), storm);
    }
  });
  return null;
}

/** Daytime Martian sky colours (visual approximation of rover sky images). */
export const SKY = {
  horizon: new THREE.Color(0.86, 0.66, 0.48),
  zenith: new THREE.Color(0.55, 0.38, 0.29),
  sunsetBlue: new THREE.Color(0.42, 0.58, 0.82),
};

/**
 * Sky dome seen from inside the atmosphere: butterscotch gradient by day, darker towards the
 * zenith, with the blue halo around the low Sun observed in rover sunset images. Fades out above
 * ~90 km so space stays black. Visual effect (not a radiative-transfer model).
 */
export function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uSun: { value: sunDir },
          uUp: { value: new THREE.Vector3(0, 1, 0) },
          uInside: { value: 0 },
          uHorizon: { value: SKY.horizon },
          uZenith: { value: SKY.zenith },
          uBlue: { value: SKY.sunsetBlue },
        },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec3 vDir;
          void main(){ vDir = normalize(position); vec4 w = modelMatrix*vec4(position,1.); gl_Position = projectionMatrix*viewMatrix*w;
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uSun; uniform vec3 uUp; uniform float uInside; uniform vec3 uHorizon; uniform vec3 uZenith; uniform vec3 uBlue;
          varying vec3 vDir;
          void main(){
            #include <logdepthbuf_fragment>
            vec3 d = normalize(vDir);
            float h = dot(d, uUp);                 // sine of view elevation
            float sunH = dot(uSun, uUp);           // sine of solar elevation
            float day = smoothstep(-0.12, 0.2, sunH);
            vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.75, max(h, 0.0)));
            float toSun = max(dot(d, uSun), 0.0);
            float low = 1.0 - smoothstep(0.05, 0.45, sunH);   // stronger near sunrise/sunset
            col = mix(col, uBlue, pow(toSun, 10.0) * (0.35 + 0.5 * low));
            col += vec3(1.0, 0.95, 0.85) * pow(toSun, 900.0) * 2.0;  // sun disk
            col *= mix(0.03, 1.0, day);
            col = mix(col, uHorizon * 0.5 * day, smoothstep(0.0, -0.08, h)); // below the horizon line
            gl_FragColor = vec4(mix(vec3(0.004, 0.004, 0.012), col, uInside), 1.0); // opaque: drawn first, terrain overwrites it
            #include <colorspace_fragment>
          }`,
        side: THREE.BackSide,
        transparent: false,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    const st = useUI.getState();
    if (!ref.current) return;
    ref.current.position.copy(camera.position);
    mat.uniforms.uUp.value.copy(camera.position).normalize();
    mat.uniforms.uInside.value = st.env.atmosphere ? THREE.MathUtils.smoothstep(-st.camera.altitudeKm, -90, -6) : 0;
    ref.current.visible = mat.uniforms.uInside.value > 0.001;
  });
  return (
    <mesh ref={ref} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[50000, 48, 24]} />
    </mesh>
  );
}

export const stormState = { center: new THREE.Vector3(1, 0, 0), radiusRad: 0.18 };
export function stormFactorAtCamera(p: THREE.Vector3) {
  const ang = p.clone().normalize().angleTo(stormState.center);
  return 1 - THREE.MathUtils.smoothstep(ang, stormState.radiusRad * 0.6, stormState.radiusRad);
}

export function SunGlare() {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,250,235,1)');
    grd.addColorStop(0.08, 'rgba(255,240,210,0.95)');
    grd.addColorStop(0.25, 'rgba(255,200,150,0.25)');
    grd.addColorStop(1, 'rgba(255,180,120,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const ref = useRef<THREE.Sprite>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.position.copy(camera.position).addScaledVector(sunDir, 800000);
  });
  return (
    <sprite ref={ref} scale={[0.09, 0.09, 1]}>
      <spriteMaterial map={tex} sizeAttenuation={false} blending={THREE.AdditiveBlending} depthWrite={false} transparent />
    </sprite>
  );
}

/** Moons: orbit radius and period from NASA fact sheets; phase is illustrative. */
const MOONS = [
  { key: 'phobos', name: 'Phobos', a_km: 9376, periodH: 7.6539, radii: [13.4, 11.2, 9.2] as const, phase0: 0.3, incl: 1.08 },
  { key: 'deimos', name: 'Deimos', a_km: 23463.2, periodH: 30.312, radii: [7.5, 6.1, 5.2] as const, phase0: 2.1, incl: 1.79 },
];
const MARS_SIDEREAL_DAY_H = 24.6229;

function Moon({ m }: { m: (typeof MOONS)[number] }) {
  const ref = useRef<THREE.Group>(null);
  const { t } = useTranslation();
  const geo = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 1 + 0.06 * Math.sin(v.x * 7.1) * Math.cos(v.y * 5.3) + 0.04 * Math.sin(v.z * 11.7 + v.x * 3.0);
      p.setXYZ(i, v.x * m.radii[0] * n, v.y * m.radii[2] * n, v.z * m.radii[1] * n);
    }
    g.computeVertexNormals();
    return g;
  }, [m]);
  const orbit = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 256; i++) {
      const a = (i / 256) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * m.a_km, Math.sin(a) * m.a_km * Math.sin(m.incl * Math.PI / 180), -Math.sin(a) * m.a_km * Math.cos(m.incl * Math.PI / 180)));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [m]);
  const labelRef = useRef<HTMLDivElement>(null);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    const hours = renderBridge.clock.epochMs / 3.6e6;
    const rate = (2 * Math.PI) / m.periodH - (2 * Math.PI) / MARS_SIDEREAL_DAY_H; // body-fixed frame
    const a = m.phase0 + rate * hours;
    const i = (m.incl * Math.PI) / 180;
    ref.current.position.set(Math.cos(a) * m.a_km, Math.sin(a) * m.a_km * Math.sin(i), -Math.sin(a) * m.a_km * Math.cos(i));
    ref.current.lookAt(0, 0, 0); // tidally locked: long axis points at Mars
    const p = ref.current.position;
    const hidden = p.clone().normalize().dot(camera.position.clone().normalize()) < 0 && p.clone().sub(camera.position).length() > camera.position.length();
    if (labelRef.current) labelRef.current.style.display = !hidden && camera.position.length() > MARS_RADIUS_KM * 1.3 ? 'flex' : 'none';
  });
  return (
    <>
      <lineLoop geometry={orbit}>
        <lineBasicMaterial color="#9fb3c8" transparent opacity={0.18} />
      </lineLoop>
      <group ref={ref}>
        <mesh geometry={geo}>
          <meshStandardMaterial color="#6f655c" roughness={1} />
        </mesh>
        {(
          <Html center style={{ pointerEvents: 'none' }} zIndexRange={[5, 0]}>
            <div className="moon-label" ref={labelRef}>
              <span className="dot" /> {m.name}
              <small>{t('env.moonNote')}</small>
            </div>
          </Html>
        )}
      </group>
    </>
  );
}

export function Moons() {
  const sunLight = useRef<THREE.DirectionalLight>(null);
  useFrame(() => {
    sunLight.current?.position.copy(sunDir).multiplyScalar(100000);
  });
  return (
    <>
      <directionalLight ref={sunLight} intensity={2.2} />
      <ambientLight intensity={0.04} />
      {MOONS.map((m) => (
        <Moon key={m.key} m={m} />
      ))}
    </>
  );
}

export function StarField() {
  const ref = useRef<THREE.Points>(null);
  useFrame(({ camera }) => {
    if (ref.current) {
      ref.current.position.copy(camera.position);
      const st = useUI.getState();
      const inside = THREE.MathUtils.smoothstep(-st.camera.altitudeKm, -90, -6);
      const day = THREE.MathUtils.smoothstep(camera.position.clone().normalize().dot(sunDir), -0.08, 0.25);
      ref.current.visible = !(inside * day > 0.5);
    }
  });
  return <Stars ref={ref as never} radius={400000} depth={100000} count={6000} factor={9000} saturation={0} fade={false} speed={0} />;
}
