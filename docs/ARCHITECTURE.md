# MARS OS — Architecture

## Layers (dependencies point down only)

```
 ui/            React DOM panels (i18n strings only, no Three.js)
 render/        Three.js / React Three Fiber (reads state, never owns scientific data)
 state/         zustand view state (layers on/off, selection, camera, time)
 api/MarsOS     public facade: regions · nodes · terrain · proposals · history · catalog · events
 core/          pure TypeScript: geo, tiling, elevation, patches, versions, proposals, Mars time, live feeds
 contract/      Zod schemas = TS types + runtime validation + generated JSON Schema
 public/data    catalogs (JSON), elevation grids (binary), offline fallback tiles
```

- **Scientific data ≠ application logic ≠ rendering.** You can swap the renderer (for example to CesiumJS or a native app) and keep `core/`, `api/` and `contract/` unchanged. You can add new data sources by adding catalog entries, with no code changes.
- The renderer talks to the UI through `render/bridge.ts`, and only with plain data (`describeAt`, `project`, `rig`, `stats`).

## Folder map

```
src/contract/        primitives.ts · catalog.ts · changes.ts   ← DATA CONTRACT
src/core/geo/        mars.ts (constants, conversions) · tiling.ts (quadtree ids)
src/core/elevation/  ElevationService (multi-grid sampling + provenance + feathered seams)
src/core/terrain/    patches.ts (localized deltas) · TerrainModel (source + patches, emits bbox)
src/core/history/    VersionStore (append-only, replay, restore, diff)
src/core/proposals/  ProposalService (validation, policy, approve/reject/revert)
src/core/time/       marsTime.ts (Mars24: MSD, MTC, Ls, subsolar point, mission sol)
src/core/live/       m20.ts (Perseverance traverse, waypoints, raw images, MEDA weather)
src/api/MarsOS.ts    facade + localStorage persistence; window.marsOS
src/ai/              SimulatedAIEngine (SYNTHETIC demo proposals)
src/render/globe/    Globe.ts (quadtree LOD) · TextureCache.ts · tileShader.ts · GlobeLayer.tsx
src/render/camera/   CameraRig.tsx (orbit → ground, 360° heading, tilt, fly-to, collision)
src/render/scene/    Environment (sun, atmosphere, sky/haze, stars, Phobos/Deimos) · DustStorm (simulated)
src/render/overlays/ RoverLayer · NodeGrid · RegionLabels
src/ui/              TopBar · LeftPanel · RightPanel · tabs/* · Hud · styles.css
src/i18n/            index.ts · locales/en.json · locales/es.json
scripts/             fetch-mola.mjs · fetch-fallback-tiles.mjs · generate-schema.ts · validate-data.ts
schema/              generated JSON Schemas
docs/                ARCHITECTURE.md · DATA_CONTRACT.md · API.md
```

## Rendering strategy

| Concern | Approach |
|---|---|
| Tiling | Equirectangular quadtree identical to Mars Trek EQ WMTS (z0 = 2×1). Terrain tile `(z,x,y)` is the same as imagery tile `(z,row,col)` and editable cell `mars:eq:z:x:y`. |
| LOD | Screen-space size test (split when the tile would cover > ~300 px). Horizon culling plus frustum culling. Max depth = deepest available imagery at that place + 1 (HiRISE at Jezero reaches z17–18). Areas with edits get at least z15 so small patches have vertices. |
| No holes | A parent stays visible until every visible child has a mesh. A stale mesh stays visible until its rebuild finishes. |
| Precision | Each tile is built relative to its center (RTC). The logarithmic depth buffer covers 4 m to 45,000 km. |
| Mesh | 33×33 vertices + skirts. Normals come from neighbours (no seams). True slope (no exaggeration) and true height go in per-vertex attributes. |
| Imagery | Up to 4 layers composited in the shader. A missing tile falls back to its nearest loaded ancestor, magnified with a UV transform. The inspector reports "magnified ×N". |
| Budget | ≤ 6 tile builds or 7 ms per frame. ≤ 10 concurrent tile requests, prioritized by zoom and distance. LRU of 700 textures. Unused subtrees are pruned. Adaptive DPR/LOD via `PerformanceMonitor` for integrated GPUs. |
| Edits | `terrain:changed {bbox}` marks only the intersecting tiles dirty. Nothing else is rebuilt. |
| Offline | A network failure switches to the local z0–z2 copies (`public/fallback/`). They are labelled with their real ~10 km/px resolution. |

## Data verified on 2026-11-14

- **Mars Trek WMTS** (`trek.nasa.gov/tiles/Mars/EQ/...`) sends `Access-Control-Allow-Origin: *`. The SIM3292 ArcGIS endpoint echoes the origin. Browsers load both directly, so no proxy is needed.
- Mars Trek "DEM" tiles are 8-bit stretched PNGs, so they are **not** numeric elevation. Numeric elevation comes from the **MOLA MEGDR** grids on the PDS Geosciences Node: global 4 ppd (≈14.8 km/px) plus a Jezero crop of 32 ppd (≈1.85 km/px), extracted with HTTP Range by `scripts/fetch-mola.mjs`.
- Sanity check: MEGDR 32 ppd at the first Perseverance waypoint gives **−2568 m**. The rover reported **−2569.91 m** (`M20_waypoints.json`, sol 13).
- **Mars24** implementation: Perseverance sols 1127 and 1133 match the MEDA feed dates (2024-04-21, 2024-04-27). The reference epoch 2000-01-06T00:00Z gives MSD 44795.9998 (published value 44795.99980).
- Perseverance traverse/waypoints (MMGIS), the raw-images API and the MEDA weather feed all send `Access-Control-Allow-Origin: *`. On 2026-11-14 the latest MEDA entry was sol 1133 (2024-04-27). The UI shows that date and never presents it as current.

## Honesty rules enforced in code

- Every layer shows its provenance badge, native resolution, coverage and citation. `visual` layers are marked "not quantitative".
- The inspector separates **original imagery**, **elevation data** (with grid and resolution), the **generated mesh** (vertex spacing, flagged when finer than the data) and **edits / AI previews**.
- Simulated things (dust storm, demo AI proposals) carry `synthetic` badges, and a **SIMULATED** HUD badge appears while they affect the view.
- AI changes are never applied silently. Manual approval is the default. Auto mode needs validation, thresholds and verified, non-synthetic evidence, and stays revertible.

## Future backend (Supabase / PostgreSQL / PostGIS)

| Contract entity | Table | Geometry |
|---|---|---|
| Source, Layer | `sources`, `layers` (jsonb `access`) | `coverage geometry(Polygon, 949900)` |
| Region | `regions` | `geom geometry(MultiPolygon, 949900)`, center point |
| Feature | `features` | `geom geometry(PointZ, 949900)` |
| ChangeProposal | `proposals` (status enum, jsonb patches/evidence) | `bbox geometry(Polygon)` |
| Version | `versions` (append-only, `parent_id`) | `bbox geometry(Polygon)` |

`949900` stands for a custom SRID registered from IAU_2015:49900. Row-level security: only reviewers can update `proposals.status`. Versions are insert-only. `MarsOS.init` would fetch from Supabase instead of `public/data`. The contract and validators stay the same.
