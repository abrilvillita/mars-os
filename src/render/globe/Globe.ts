/**
 * Quadtree LOD globe built on Three.js.
 *
 *  - Tiles follow the Mars Trek EQ quadtree, so terrain tile (z,x,y) == imagery tile (z,row=y,col=x)
 *    == editable cell `mars:eq:z{z}:x{x}:y{y}`.
 *  - Each tile mesh is built relative-to-center (RTC) for float precision near the ground.
 *  - Heights come exclusively from the TerrainModel (source DEM + applied patches); the globe
 *    never owns scientific data.
 *  - `invalidate(bbox)` marks only intersecting tiles dirty → localized rebuilds.
 */
import * as THREE from 'three';
import type { BBoxT, LayerT } from '../../contract';
import { bboxIntersects, DEG, latLonToXYZ, M_PER_DEG, MARS_RADIUS_KM } from '../../core/geo/mars';
import { cellId, rootTiles, tileBBox, tileChildren, tileWidthM, type TileKey } from '../../core/geo/tiling';
import type { TerrainModel } from '../../core/terrain/TerrainModel';
import { TextureCache } from './TextureCache';
import { createGlobalUniforms, fragmentShader, vertexShader, type GlobalUniforms } from './tileShader';

const SEG = 32;
const MAX_BUILDS_PER_FRAME = 6;
const BUILD_BUDGET_MS = 7;
const EMPTY_TEX = new THREE.DataTexture(new Uint8Array([140, 90, 60, 255]), 1, 1);
EMPTY_TEX.needsUpdate = true;

export interface LayerSlot {
  layer: LayerT;
  opacity: number;
}

export interface LayerAtPoint {
  layerId: string;
  loadedZoom: number;
  effectiveMetersPerPixel: number;
  nativeMetersPerPixel: number | null;
  upsampledBy: number; // 1 = native tile, 2^n when an ancestor tile is magnified
  fromFallback: boolean;
}

class Tile {
  readonly key: TileKey;
  readonly id: string;
  readonly bbox: BBoxT;
  children: Tile[] | null = null;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  center = new THREE.Vector3();
  radius = 0;
  dirty = true;
  building = false;
  lastVisit = 0;
  minH = 0;
  maxH = 0;
  /** angular half-diagonal in radians, for horizon culling */
  angularRadius: number;
  uniforms: Record<string, THREE.IUniform>;

  constructor(key: TileKey, globals: GlobalUniforms) {
    this.key = key;
    this.id = cellId(key);
    this.bbox = tileBBox(key);
    const b = this.bbox;
    const c = latLonToXYZ((b.north + b.south) / 2, (b.east + b.west) / 2, 0);
    this.center.set(c[0], c[1], c[2]);
    const corner = latLonToXYZ(b.north, b.west, 0);
    this.radius = this.center.distanceTo(new THREE.Vector3(corner[0], corner[1], corner[2])) + 25; // + relief margin (km)
    this.angularRadius = Math.min(Math.PI, this.radius / MARS_RADIUS_KM);
    this.uniforms = {
      ...globals,
      uTex0: { value: EMPTY_TEX }, uTex1: { value: EMPTY_TEX }, uTex2: { value: EMPTY_TEX }, uTex3: { value: EMPTY_TEX },
      uUvT0: { value: new THREE.Vector4(0, 0, 1, 1) }, uUvT1: { value: new THREE.Vector4(0, 0, 1, 1) },
      uUvT2: { value: new THREE.Vector4(0, 0, 1, 1) }, uUvT3: { value: new THREE.Vector4(0, 0, 1, 1) },
      uOp: { value: new THREE.Vector4(0, 0, 0, 0) },
    };
  }

  /** Has drawable geometry (possibly stale while a rebuild is queued — shown until replaced). */
  get ready() {
    return !!this.mesh;
  }
}

export class Globe extends THREE.Group {
  readonly globals = createGlobalUniforms();
  readonly textures: TextureCache;
  private roots: Tile[];
  private buildQueue: Tile[] = [];
  private frame = 0;
  private frustum = new THREE.Frustum();
  private projScreen = new THREE.Matrix4();
  private tmpV = new THREE.Vector3();
  private renderedLeaves: Tile[] = [];
  exaggeration = 3;
  slots: LayerSlot[] = [];
  /** Extra max zoom forced by active patches (so small edits get enough vertices). */
  patchBoxes: BBoxT[] = [];
  lodFactor = 1.0;
  onChange: (() => void) | null = null;

  private terrain: TerrainModel;

  constructor(terrain: TerrainModel, baseUrl: string) {
    super();
    this.terrain = terrain;
    this.name = 'MarsGlobe';
    this.textures = new TextureCache(baseUrl);
    this.roots = rootTiles().map((k) => new Tile(k, this.globals));
  }

  /** Mark tiles intersecting bbox (null = all) for rebuild. Only those tiles are rebuilt. */
  invalidate(bbox: BBoxT | null) {
    const visit = (t: Tile) => {
      if (bbox && !bboxIntersects(t.bbox, bbox)) return;
      t.dirty = true;
      t.children?.forEach(visit);
    };
    this.roots.forEach(visit);
  }

  get leaves() {
    return this.renderedLeaves;
  }

  get meshes() {
    return this.renderedLeaves.map((t) => t.mesh!).filter(Boolean);
  }

  /** Visible height range (true meters) of rendered tiles near the camera — for adaptive color ramps. */
  visibleHeightRange(): [number, number] {
    let lo = Infinity, hi = -Infinity;
    for (const t of this.renderedLeaves) {
      lo = Math.min(lo, t.minH);
      hi = Math.max(hi, t.maxH);
    }
    return isFinite(lo) ? [lo, hi] : [-8000, 21000];
  }

  private maxZoomFor(t: Tile) {
    let z = 7; // geometry depth that the global DEM + imagery justify
    for (const s of this.slots) {
      if (s.layer.access.protocol !== 'wmts') continue;
      if (!bboxIntersects(s.layer.coverage.bbox, t.bbox)) continue;
      z = Math.max(z, this.textures.effectiveMaxZoom(s.layer) + 1);
    }
    if (this.patchBoxes.some((b) => bboxIntersects(b, t.bbox))) z = Math.max(z, 15);
    return Math.min(z, 19);
  }

  update(camera: THREE.PerspectiveCamera, viewportHeight: number) {
    this.frame++;
    this.textures.frame = this.frame;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    const camPos = camera.position;
    const camDist = camPos.length();
    const camDir = this.tmpV.copy(camPos).normalize().clone();
    const horizonAngle = Math.acos(Math.min(1, MARS_RADIUS_KM / Math.max(camDist, MARS_RADIUS_KM + 1e-6)));
    const pxPerRad = viewportHeight / (2 * Math.tan((camera.fov * DEG) / 2));

    const leaves: Tile[] = [];
    const visit = (t: Tile) => {
      t.lastVisit = this.frame;
      // horizon culling
      const ang = Math.acos(Math.max(-1, Math.min(1, t.center.clone().normalize().dot(camDir))));
      const horizonOk = t.key.z < 2 || ang - t.angularRadius < horizonAngle + 0.05;
      const sphere = new THREE.Sphere(t.center, t.radius);
      const inFrustum = t.key.z < 1 || this.frustum.intersectsSphere(sphere);
      if (!horizonOk || !inFrustum) return;
      if (t.dirty && !t.building) this.enqueueBuild(t, camPos);

      const dist = Math.max(1e-4, camPos.distanceTo(t.center) - t.radius * 0.7);
      const projectedPx = ((tileWidthM(t.key) / 1000) / dist) * pxPerRad;
      const wantSplit = projectedPx > 300 * this.lodFactor && t.key.z < this.maxZoomFor(t);

      if (wantSplit) {
        if (!t.children) t.children = tileChildren(t.key).map((k) => new Tile(k, this.globals));
        const needed = t.children.filter((c) => this.childNeeded(c, camDir, horizonAngle));
        for (const c of t.children) {
          c.lastVisit = this.frame;
          if (c.dirty && !c.building) this.enqueueBuild(c, camPos);
        }
        // descend only when every needed child has a mesh; otherwise keep showing the parent (no holes)
        if (needed.every((c) => c.ready) || !t.ready) {
          t.children.forEach(visit);
          return;
        }
      } else if (t.children && this.frame % 60 === 0) {
        this.prune(t);
      }
      if (t.mesh) leaves.push(t);
    };
    this.roots.forEach(visit);

    this.processBuilds(camPos);
    this.syncScene(leaves, camPos);
    this.textures.pump();
  }

  private childNeeded(c: Tile, camDir: THREE.Vector3, horizonAngle: number) {
    const ang = Math.acos(Math.max(-1, Math.min(1, c.center.clone().normalize().dot(camDir))));
    return ang - c.angularRadius < horizonAngle + 0.05 && this.frustum.intersectsSphere(new THREE.Sphere(c.center, c.radius));
  }

  private prune(t: Tile) {
    const dispose = (n: Tile) => {
      n.children?.forEach(dispose);
      if (n.mesh) {
        n.mesh.geometry.dispose();
        n.mesh.material.dispose();
        this.remove(n.mesh);
        n.mesh = null;
      }
      n.children = null;
    };
    if (t.children && t.children.every((c) => this.frame - c.lastVisit > 90)) {
      t.children.forEach(dispose);
      t.children = null;
    }
  }

  private enqueueBuild(t: Tile, camPos: THREE.Vector3) {
    if (!this.buildQueue.includes(t)) this.buildQueue.push(t);
    (t as Tile & { prio: number }).prio = t.key.z * 1e6 + camPos.distanceTo(t.center);
  }

  private processBuilds(_camPos: THREE.Vector3) {
    if (!this.buildQueue.length) return;
    this.buildQueue = this.buildQueue.filter((t) => this.frame - t.lastVisit < 5);
    this.buildQueue.sort((a, b) => (a as Tile & { prio: number }).prio - (b as Tile & { prio: number }).prio);
    const t0 = performance.now();
    let n = 0;
    while (this.buildQueue.length && n < MAX_BUILDS_PER_FRAME && performance.now() - t0 < BUILD_BUDGET_MS) {
      const t = this.buildQueue.shift()!;
      this.buildTile(t);
      n++;
    }
    if (n) this.onChange?.();
  }

  private buildTile(t: Tile) {
    const b = t.bbox;
    const rel = this.terrain.patchesFor(b);
    const N = SEG + 1;
    const E = SEG + 3; // with 1-vertex border for normals/slope
    const dLon = (b.east - b.west) / SEG, dLat = (b.north - b.south) / SEG;
    const H = new Float32Array(E * E), ED = new Float32Array(E * E), PV = new Float32Array(E * E);
    const P = new Float32Array(E * E * 3);
    const ex = this.exaggeration;
    const tmp = [0, 0, 0];
    const wantMpp = tileWidthM(t.key) / SEG; // ask elevation pyramids for a matching level only
    for (let j = 0; j < E; j++) {
      const lat = Math.max(-90, Math.min(90, b.north - (j - 1) * dLat));
      for (let i = 0; i < E; i++) {
        const lon = b.west + (i - 1) * dLon;
        const { h, edit, prev } = this.terrain.heightFast(lat, lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, rel, wantMpp);
        const k = j * E + i;
        H[k] = h; ED[k] = edit; PV[k] = prev;
        latLonToXYZ(lat, lon, h * ex, tmp);
        P[k * 3] = tmp[0] - t.center.x; P[k * 3 + 1] = tmp[1] - t.center.y; P[k * 3 + 2] = tmp[2] - t.center.z;
      }
    }
    const skirt = Math.max(0.02, (tileWidthM(t.key) / 1000) * 0.03);
    const vCount = N * N + 4 * N;
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const aH = new Float32Array(vCount), aE = new Float32Array(vCount * 2), aS = new Float32Array(vCount);
    const a = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), up = new THREE.Vector3();
    let minH = Infinity, maxH = -Infinity;
    const pAt = (i: number, j: number, out: THREE.Vector3) => out.set(P[(j * E + i) * 3], P[(j * E + i) * 3 + 1], P[(j * E + i) * 3 + 2]);
    for (let j = 0; j < N; j++) {
      const lat = b.north - j * dLat;
      const mPerDegLon = M_PER_DEG * Math.max(1e-3, Math.cos(lat * DEG));
      for (let i = 0; i < N; i++) {
        const ei = i + 1, ej = j + 1, k = ej * E + ei, v = j * N + i;
        pos[v * 3] = P[k * 3]; pos[v * 3 + 1] = P[k * 3 + 1]; pos[v * 3 + 2] = P[k * 3 + 2];
        // normal from exaggerated geometry (what the user sees)
        pAt(ei + 1, ej, a).sub(pAt(ei - 1, ej, c));
        const dx = a.clone();
        pAt(ei, ej - 1, a).sub(pAt(ei, ej + 1, c));
        nrm.crossVectors(dx, a).normalize();
        up.set(pos[v * 3] + t.center.x, pos[v * 3 + 1] + t.center.y, pos[v * 3 + 2] + t.center.z).normalize();
        if (nrm.dot(up) < 0) nrm.negate();
        if (!isFinite(nrm.x)) nrm.copy(up);
        nor[v * 3] = nrm.x; nor[v * 3 + 1] = nrm.y; nor[v * 3 + 2] = nrm.z;
        uv[v * 2] = i / SEG; uv[v * 2 + 1] = j / SEG;
        aH[v] = H[k]; aE[v * 2] = ED[k]; aE[v * 2 + 1] = PV[k];
        // TRUE slope (no exaggeration), degrees
        const gx = (H[k + 1] - H[k - 1]) / (2 * dLon * mPerDegLon);
        const gy = (H[k - E] - H[k + E]) / (2 * dLat * M_PER_DEG);
        aS[v] = Math.atan(Math.hypot(gx, gy)) / DEG;
        if (H[k] < minH) minH = H[k];
        if (H[k] > maxH) maxH = H[k];
      }
    }
    // skirts: duplicate edge vertices pushed inward/downward
    const edges: number[][] = [[], [], [], []];
    for (let i = 0; i < N; i++) {
      edges[0].push(i); edges[1].push((N - 1) * N + i); edges[2].push(i * N); edges[3].push(i * N + N - 1);
    }
    let sv = N * N;
    const skirtIdx: number[][] = [[], [], [], []];
    edges.forEach((edge, e) => {
      for (const v of edge) {
        up.set(pos[v * 3] + t.center.x, pos[v * 3 + 1] + t.center.y, pos[v * 3 + 2] + t.center.z).normalize();
        pos[sv * 3] = pos[v * 3] - up.x * skirt; pos[sv * 3 + 1] = pos[v * 3 + 1] - up.y * skirt; pos[sv * 3 + 2] = pos[v * 3 + 2] - up.z * skirt;
        nor[sv * 3] = nor[v * 3]; nor[sv * 3 + 1] = nor[v * 3 + 1]; nor[sv * 3 + 2] = nor[v * 3 + 2];
        uv[sv * 2] = uv[v * 2]; uv[sv * 2 + 1] = uv[v * 2 + 1];
        aH[sv] = aH[v]; aE[sv * 2] = aE[v * 2]; aE[sv * 2 + 1] = aE[v * 2 + 1]; aS[sv] = aS[v];
        skirtIdx[e].push(sv++);
      }
    });
    const idx: number[] = [];
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const p = j * N + i;
      idx.push(p, p + N, p + 1, p + 1, p + N, p + N + 1);
    }
    edges.forEach((edge, e) => {
      for (let k = 0; k < N - 1; k++) {
        const a0 = edge[k], a1 = edge[k + 1], s0 = skirtIdx[e][k], s1 = skirtIdx[e][k + 1];
        idx.push(a0, s0, a1, a1, s0, s1, a0, a1, s0, a1, s1, s0); // both windings (no culling issues)
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(aH, 1));
    geo.setAttribute('aEdit', new THREE.BufferAttribute(aE, 2));
    geo.setAttribute('aSlope', new THREE.BufferAttribute(aS, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    t.minH = minH; t.maxH = maxH;
    if (t.mesh) {
      t.mesh.geometry.dispose();
      t.mesh.geometry = geo;
    } else {
      const mat = new THREE.ShaderMaterial({ uniforms: t.uniforms, vertexShader, fragmentShader, extensions: { clipCullDistance: false, multiDraw: false } });
      t.mesh = new THREE.Mesh(geo, mat);
      t.mesh.matrixAutoUpdate = false;
      t.mesh.position.copy(t.center);
      t.mesh.updateMatrix();
      t.mesh.frustumCulled = true;
      t.mesh.userData.tileId = t.id;
      t.mesh.visible = false;
      this.add(t.mesh);
    }
    // refine culling sphere with real relief
    const bs = geo.boundingSphere!;
    t.radius = bs.radius + bs.center.length();
    t.dirty = false;
  }

  /** Show only the selected leaves and bind their texture slots. */
  private syncScene(leaves: Tile[], camPos: THREE.Vector3) {
    const visible = new Set(leaves);
    for (const t of this.renderedLeaves) if (!visible.has(t) && t.mesh) t.mesh.visible = false;
    for (const t of leaves) {
      if (!t.mesh) continue;
      t.mesh.visible = true;
      this.bindTextures(t, camPos);
    }
    this.renderedLeaves = leaves;
  }

  private bindTextures(t: Tile, camPos: THREE.Vector3) {
    const op = t.uniforms.uOp.value as THREE.Vector4;
    op.set(0, 0, 0, 0);
    let slotIdx = 0;
    const dist = camPos.distanceTo(t.center);
    for (const s of this.slots) {
      if (slotIdx > 3) break;
      if (s.layer.access.protocol !== 'wmts') continue;
      const cov = s.layer.coverage.bbox;
      if (!bboxIntersects(cov, t.bbox)) continue;
      // skip regional layers when the tile is vastly larger than their footprint
      const covW = cov.east - cov.west, tileW = t.bbox.east - t.bbox.west;
      if (!s.layer.coverage.global && tileW > covW * 16) continue;
      const found = this.findTexture(s.layer, t, dist);
      if (!found) continue;
      const i = slotIdx++;
      t.uniforms[`uTex${i}`].value = found.entry.texture;
      (t.uniforms[`uUvT${i}`].value as THREE.Vector4).copy(found.uvT);
      op.setComponent(i, s.opacity);
    }
  }

  private findTexture(layer: LayerT, t: Tile, dist: number) {
    if (layer.access.protocol !== 'wmts') return null;
    const maxZ = this.textures.effectiveMaxZoom(layer);
    if (maxZ < 0) return null;
    const target = Math.min(t.key.z, maxZ);
    for (let L = target; L >= 0; L--) {
      const d = t.key.z - L;
      const ax = t.key.x >> d, ay = t.key.y >> d;
      let e = this.textures.peek(layer.id, L, ay, ax);
      if (!e && L === target) e = this.textures.request(layer, L, ay, ax, L * 1e5 + dist);
      if (e?.state === 'ready' && e.texture) {
        const scale = 1 / 2 ** d;
        const uvT = new THREE.Vector4((t.key.x - (ax << d)) * scale, (t.key.y - (ay << d)) * scale, scale, scale);
        return { entry: e, uvT, level: L };
      }
      if (e?.state === 'missing' && L === target && !layer.coverage.global) return null;
    }
    // ensure a coarse level is on its way so something shows quickly
    if (target > 2) this.textures.request(layer, Math.min(2, target), t.key.y >> (t.key.z - Math.min(2, target)), t.key.x >> (t.key.z - Math.min(2, target)), 0);
    return null;
  }

  /** Plain-data description of what is rendered at a point (for the provenance inspector). */
  describeAt(lat: number, lon: number): { tileId: string; tileZoom: number; vertexSpacingM: number; layers: LayerAtPoint[] } | null {
    const leaf = this.renderedLeaves.find((t) => lat <= t.bbox.north && lat >= t.bbox.south && lon >= t.bbox.west && lon <= t.bbox.east);
    if (!leaf) return null;
    const layers: LayerAtPoint[] = [];
    for (const s of this.slots) {
      if (s.layer.access.protocol !== 'wmts' || !bboxIntersects(s.layer.coverage.bbox, { west: lon, east: lon, north: lat, south: lat })) continue;
      const found = this.findTexture(s.layer, leaf, 0);
      if (!found) continue;
      const tileWAtLevel = tileWidthM({ z: found.level, x: leaf.key.x >> (leaf.key.z - found.level), y: leaf.key.y >> (leaf.key.z - found.level) });
      const mpp = tileWAtLevel / s.layer.access.tileSize;
      layers.push({
        layerId: s.layer.id,
        loadedZoom: found.level,
        effectiveMetersPerPixel: Math.max(mpp, s.layer.resolution.metersPerPixel ?? 0),
        nativeMetersPerPixel: s.layer.resolution.metersPerPixel,
        upsampledBy: 2 ** (leaf.key.z - found.level),
        fromFallback: found.entry.fromFallback,
      });
    }
    return { tileId: leaf.id, tileZoom: leaf.key.z, vertexSpacingM: tileWidthM(leaf.key) / SEG, layers };
  }

  dispose() {
    const d = (t: Tile) => {
      t.children?.forEach(d);
      t.mesh?.geometry.dispose();
      t.mesh?.material.dispose();
    };
    this.roots.forEach(d);
  }
}
