/**
 * Terrain tile shader: composites up to 4 imagery layers (each with its own ancestor-tile
 * UV transform), applies sun lighting, analysis modes and provenance tints.
 *
 * Modes: 0 imagery · 1 hypsometric (true MOLA meters) · 2 slope (from DEM) · 3 edits
 * Preview (pending AI proposal) deltas are always shown as an amber hatched ghost.
 */
import * as THREE from 'three';

export const MODE_INDEX = { imagery: 0, hypsometric: 1, slope: 2, edits: 3 } as const;

export function createGlobalUniforms() {
  return {
    uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    uRealLighting: { value: 1 },
    uMode: { value: 0 },
    uHypso: { value: new THREE.Vector2(-8000, 21000) },
    uFogColor: { value: new THREE.Color(0.8, 0.6, 0.45) },
    uFogDensity: { value: 0 },
    uTime: { value: 0 },
    uSelBox: { value: new THREE.Vector4(0, 0, 0, 0) }, // west,south,east,north (deg); zero box = none
    uHiBox: { value: new THREE.Vector4(0, 0, 0, 0) }, // highlight region
  };
}
export type GlobalUniforms = ReturnType<typeof createGlobalUniforms>;

export const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec2 aEdit;
attribute float aHeight;
attribute float aSlope;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vHeight;
varying vec2 vEdit;
varying float vSlope;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vHeight = aHeight;
  vEdit = aEdit;
  vSlope = aSlope;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const fragmentShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D uTex0; uniform sampler2D uTex1; uniform sampler2D uTex2; uniform sampler2D uTex3;
uniform vec4 uUvT0; uniform vec4 uUvT1; uniform vec4 uUvT2; uniform vec4 uUvT3;
uniform vec4 uOp; // per-slot opacity, 0 = slot disabled
uniform vec3 uSunDir;
uniform float uRealLighting;
uniform int uMode;
uniform vec2 uHypso;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uTime;
uniform vec4 uSelBox;
uniform vec4 uHiBox;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vHeight;
varying vec2 vEdit;
varying float vSlope;

vec4 slot(sampler2D t, vec4 tr) { return texture2D(t, tr.xy + vUv * tr.zw); }

vec3 hypsoRamp(float t) {
  // perceptual-ish ramp: deep blue → teal → sand → rust → white
  vec3 c0 = vec3(0.10, 0.16, 0.42), c1 = vec3(0.13, 0.52, 0.62), c2 = vec3(0.86, 0.78, 0.52);
  vec3 c3 = vec3(0.70, 0.33, 0.16), c4 = vec3(0.97, 0.95, 0.93);
  t = clamp(t, 0.0, 1.0);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.8) return mix(c2, c3, (t - 0.5) / 0.3);
  return mix(c3, c4, (t - 0.8) / 0.2);
}

vec3 slopeRamp(float deg) {
  if (deg < 5.0) return mix(vec3(0.16, 0.55, 0.34), vec3(0.45, 0.72, 0.30), deg / 5.0);
  if (deg < 15.0) return mix(vec3(0.45, 0.72, 0.30), vec3(0.95, 0.80, 0.25), (deg - 5.0) / 10.0);
  if (deg < 25.0) return mix(vec3(0.95, 0.80, 0.25), vec3(0.93, 0.42, 0.16), (deg - 15.0) / 10.0);
  return mix(vec3(0.93, 0.42, 0.16), vec3(0.75, 0.10, 0.12), clamp((deg - 25.0) / 10.0, 0.0, 1.0));
}

float boxEdge(vec4 box, float lat, float lon, float w) {
  if (box.z <= box.x) return 0.0;
  if (lon < box.x - w || lon > box.z + w || lat < box.y - w || lat > box.w + w) return 0.0;
  float d = min(min(abs(lon - box.x), abs(lon - box.z)), min(abs(lat - box.y), abs(lat - box.w)));
  return 1.0 - smoothstep(0.0, w, d);
}

void main() {
  #include <logdepthbuf_fragment>
  vec3 base = vec3(0.55, 0.36, 0.24);
  if (uOp.x > 0.0) { vec4 c = slot(uTex0, uUvT0); base = mix(base, c.rgb, c.a * uOp.x); }
  if (uOp.y > 0.0) { vec4 c = slot(uTex1, uUvT1); base = mix(base, c.rgb, c.a * uOp.y); }
  if (uOp.z > 0.0) { vec4 c = slot(uTex2, uUvT2); base = mix(base, c.rgb, c.a * uOp.z); }
  if (uOp.w > 0.0) { vec4 c = slot(uTex3, uUvT3); base = mix(base, c.rgb, c.a * uOp.w); }

  vec3 color = base;
  if (uMode == 1) {
    color = hypsoRamp((vHeight - uHypso.x) / max(1.0, uHypso.y - uHypso.x));
    color *= 0.75 + 0.25 * dot(base, vec3(0.333)) * 1.6;
  } else if (uMode == 2) {
    color = slopeRamp(vSlope);
  } else if (uMode == 3) {
    float g = dot(base, vec3(0.299, 0.587, 0.114));
    color = vec3(g) * 0.8;
    float e = vEdit.x;
    if (abs(e) > 0.01) {
      vec3 tint = e > 0.0 ? vec3(0.15, 0.85, 1.0) : vec3(1.0, 0.25, 0.85);
      color = mix(color, tint, clamp(0.35 + abs(e) / 40.0, 0.35, 0.9));
    }
  }

  // pending-proposal ghost (amber hatching)
  if (abs(vEdit.y) > 0.01) {
    float hatch = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0));
    color = mix(color, vec3(1.0, 0.72, 0.15), 0.35 + 0.25 * hatch);
  }

  vec3 n = normalize(vNormalW);
  vec3 up = normalize(vWorldPos);
  float diff;
  if (uRealLighting > 0.5) {
    float ndl = dot(n, uSunDir);
    float horizon = smoothstep(-0.12, 0.08, dot(up, uSunDir)); // soft terminator (atmospheric twilight)
    diff = max(ndl, 0.0) * horizon;
    color *= 0.035 + 1.05 * diff;
  } else {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    diff = 0.55 + 0.45 * max(dot(n, normalize(viewDir + up * 0.6)), 0.0);
    color *= diff;
  }

  float lat = degrees(asin(clamp(up.y, -1.0, 1.0)));
  float lon = degrees(atan(-up.z, up.x));
  float pxDeg = fwidth(lat) + fwidth(lon);
  float sel = boxEdge(uSelBox, lat, lon, pxDeg * 1.5);
  color = mix(color, vec3(1.0, 0.85, 0.2), sel);
  float hi = boxEdge(uHiBox, lat, lon, pxDeg * 1.2);
  color = mix(color, vec3(0.55, 0.85, 1.0), hi * 0.8);

  if (uFogDensity > 0.0) {
    float dist = length(cameraPosition - vWorldPos);
    float f = 1.0 - exp(-dist * uFogDensity);
    color = mix(color, uFogColor, clamp(f, 0.0, 1.0));
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;
