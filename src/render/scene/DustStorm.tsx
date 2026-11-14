/**
 * SIMULATED dust storm visualisation (not data-driven). From orbit: an animated dust
 * canopy; near the ground inside the storm: blowing-dust streaks around the camera and
 * heavy haze (see SkyAndHaze). The UI labels it "Simulated" whenever it is on.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { latLonToXYZ, MARS_RADIUS_KM } from '../../core/geo/mars';
import { useUI } from '../../state/uiStore';
import { renderBridge } from '../bridge';
import { sunDir, stormState, stormFactorAtCamera } from './Environment';

const noise = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5; } return s; }
`;

export function DustStorm() {
  const on = useUI((s) => s.env.dustStorm);
  const intensity = useUI((s) => s.env.stormIntensity);

  // place the storm under the camera target when enabled
  useEffect(() => {
    if (!on) return;
    const r = renderBridge.rig;
    const p = latLonToXYZ(r.lat, r.lon, 0);
    stormState.center.set(p[0], p[1], p[2]).normalize();
  }, [on]);

  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCenter: { value: stormState.center }, uRadius: { value: stormState.radiusRad }, uSun: { value: sunDir }, uI: { value: 0.6 } },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec3 vN; varying vec3 vW;
          void main(){ vN = normalize(position); vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position = projectionMatrix*viewMatrix*w;
          #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform float uTime; uniform vec3 uCenter; uniform float uRadius; uniform vec3 uSun; uniform float uI;
          varying vec3 vN; varying vec3 vW;
          ${noise}
          void main(){
            #include <logdepthbuf_fragment>
            float ang = acos(clamp(dot(vN, uCenter), -1.0, 1.0));
            float mask = 1.0 - smoothstep(uRadius*0.55, uRadius, ang);
            if (mask <= 0.0) discard;
            vec3 q = vN*9.0 + vec3(uTime*0.05, 0.0, uTime*0.03);
            float n = fbm(q + fbm(q*1.7 - uTime*0.02));
            float a = smoothstep(0.35, 0.8, n) * mask * uI;
            float light = 0.15 + 0.85*smoothstep(-0.1, 0.3, dot(vN, uSun));
            gl_FragColor = vec4(vec3(0.78,0.56,0.38)*light, a*0.85);
            #include <colorspace_fragment>
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );

  // blowing dust streaks around the camera (only rendered near the ground inside the storm)
  const COUNT = 2500;
  const ptsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT * 3; i++) p[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    return g;
  }, []);
  const ptsMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uBox: { value: 0.4 }, uWind: { value: new THREE.Vector3(1, 0, 0) }, uAlpha: { value: 0 } },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          uniform float uTime; uniform float uBox; uniform vec3 uWind; varying float vA;
          void main(){
            vec3 p = fract(position + uWind*uTime*0.35 + vec3(0.0, sin(uTime*0.7+position.x*20.0)*0.01, 0.0)) - 0.5;
            vec4 mv = modelViewMatrix * vec4(p*uBox, 1.0);
            gl_Position = projectionMatrix*mv;
            gl_PointSize = clamp(6.0 / -mv.z * uBox * 0.6, 1.0, 5.0);
            vA = 1.0 - smoothstep(0.3, 0.5, length(p));
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform float uAlpha; varying float vA;
          void main(){
            #include <logdepthbuf_fragment>
            gl_FragColor = vec4(0.82,0.62,0.45, vA*uAlpha);
          }`,
        transparent: true,
        depthWrite: false,
      }),
    [],
  );
  const pts = useRef<THREE.Points>(null);

  useFrame(({ camera, clock }) => {
    shellMat.uniforms.uTime.value = clock.elapsedTime;
    shellMat.uniforms.uI.value = intensity;
    ptsMat.uniforms.uTime.value = clock.elapsedTime;
    if (pts.current) {
      const alt = useUI.getState().camera.altitudeKm;
      const f = stormFactorAtCamera(camera.position) * intensity;
      pts.current.visible = on && alt < 25 && f > 0.02;
      pts.current.position.copy(camera.position);
      ptsMat.uniforms.uBox.value = Math.max(0.05, Math.min(3, alt * 0.8 + 0.05));
      ptsMat.uniforms.uAlpha.value = f * 0.9;
      const east = new THREE.Vector3(0, 1, 0).cross(camera.position.clone().normalize()).normalize();
      ptsMat.uniforms.uWind.value.copy(east).multiplyScalar(1 / ptsMat.uniforms.uBox.value);
    }
  });

  if (!on) return null;
  return (
    <>
      <mesh material={shellMat} renderOrder={2}>
        <sphereGeometry args={[MARS_RADIUS_KM + 18, 160, 120]} />
      </mesh>
      <points ref={pts} geometry={ptsGeo} material={ptsMat} renderOrder={3} frustumCulled={false} />
    </>
  );
}
