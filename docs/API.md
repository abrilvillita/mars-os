# MARS OS — Module API (`MarsOS`)

Other modules (AI engine, route planner, obstacle detection, mission analysis, tests) talk to the planet **only** through `getMarsOS()` (`src/api/MarsOS.ts`). They never touch Three.js or the renderer. In the browser the same object is `window.marsOS`, so you can experiment from the dev console.

```ts
import { getMarsOS } from './api/MarsOS';
const os = getMarsOS();
await os.init({ baseUrl: '/', catalogs: ['data/catalog/jezero.catalog.json'] }); // App already does this
```

## Query regions and cells

```ts
os.regions.list()                         // catalog regions
os.regions.at(18.4446, 77.4509)           // regions containing a point, smallest first
os.regions.query({ west, south, east, north })
os.regions.cellAt(18.4446, 77.4509, 13)   // → { id: 'mars:eq:z13:x11716:y3256', bbox, widthM: 1236, regions: [...] }
os.regions.cell('mars:eq:z13:x11716:y3256')
os.regions.cellsIn(bbox, 12)              // all cells of a level inside a bbox (capped)
```

## Terrain heights with provenance

```ts
os.terrain.heightAt(lat, lon)
// → { height_m, source_m, sourceLayerId, sourceMetersPerPixel, sourceBlended,
//     applied: [{ patchId, delta_m }], preview: [{ patchId, delta_m }] }
os.terrain.activePatches()
os.terrain.elevationGrids()   // metadata of the loaded MOLA grids
```

## Select nodes

```ts
const nodes = os.nodes.grid('mars:eq:z13:x11716:y3256', 9); // 81 nodes
os.nodes.get('mars:eq:z13:x11716:y3256/n9:4:4')
// NodeInfo: { id, cellId, i, j, lat, lon, height_m, source_m, edit_m, sourceLayerId,
//             sourceMetersPerPixel, spacingM: { ew, ns }, interpolated }
```

`interpolated: true` means the node spacing is finer than the elevation data, so the height is interpolated, not measured. Show this to users.

## Request changes (AI engines and humans)

```ts
const result = os.proposals.submit({
  id: 'prop.myengine.0001',
  createdAt: new Date().toISOString(),
  origin: { kind: 'ai', id: 'my-engine', model: 'model-id', version: '1.2' },
  regionIds: ['mars:eq:z13:x11716:y3256'],
  patches: [{ type: 'radial', id: 'patch.0001', center: { lat: 18.4446, lon: 77.4509 }, radius_m: 300, delta_m: -6, falloff: 'gaussian' }],
  evidence: [{ kind: 'image', sourceId: 'src.trek.jezero.hirise', url: null, description: { en: '…', es: '…' }, retrievedAt: null, verified: true, synthetic: false }],
  confidence: 0.82, risk: 'medium',
  rationale: { en: 'Why', es: 'Por qué' },
  status: 'pending', review: null, appliedVersionId: null, synthetic: false,
});
// result: { ok, errors[], warnings[], proposal }
```

- `os.proposals.validate(p)`: dry run, never stored.
- `os.proposals.list(status?)`, `os.proposals.get(id)`
- `os.proposals.preview(id | null)`: draw a pending proposal as an amber ghost. History is not touched.
- `os.proposals.approve(id, reviewer?)`, `reject(id, reviewer?)`, `revert(id)`
- `os.proposals.setPolicy({ mode: 'manual' | 'auto', autoMinConfidence, autoMaxRisk, autoRequireVerifiedEvidence })`. The default is `manual`. In `auto` mode a proposal is applied only if it passes validation, meets the thresholds, has verified evidence (configurable), and is not synthetic. Auto-applied proposals are recorded with author `auto-policy` and can be reverted.
- `os.proposals.fromNodeOffsets(cellId, gridSize, offsets, note)` builds a human proposal from selected nodes.

## History and versions

```ts
os.history.list()                   // immutable versions
os.history.head()                   // current version id
os.history.view('ver.abc')          // time travel (read-only view); view(null) returns to HEAD
os.history.restore('ver.abc')       // new version equal to ver.abc (whole planet)
os.history.restore('ver.abc', 'mars:eq:z13:x11716:y3256') // only patches touching that cell/region
os.history.diff(fromId, toId)       // { added, removed, bbox }
os.history.forRegion(regionOrCellId)
os.exportChangeLog() / os.importChangeLog(json) / os.resetChangeLog()
```

The change log persists in `localStorage` (`marsos.changelog.v1`). Export it to share or to load into a future backend.

## Events

```ts
os.on('terrain:changed', ({ bbox, reason }) => …)   // only tiles inside bbox are rebuilt
os.on('proposals:changed', ({ proposalId }) => …)
os.on('history:changed', ({ headVersionId, viewingVersionId }) => …)
os.on('catalog:loaded', ({ catalogId }) => …)
```

## Catalog access

```ts
os.catalog.layers(), os.catalog.layer(id), os.catalog.sources(), os.catalog.source(id)
os.catalog.features(), os.catalog.referenceValues()
```

## Adding a new module (e.g. route planning)

1. Create `src/modules/routes/` with pure logic that uses only `getMarsOS()` (heights, slopes via `heightAt`, regions).
2. For visualization, add an overlay component in `src/render/overlays/` and register it in `src/render/MarsScene.tsx`.
3. For UI, add a tab in `src/ui/tabs/` and its strings in **every** `src/i18n/locales/*.json`.

No change to the globe, the core or the contract is needed unless the module produces new persistent data. In that case, extend the Zod contract first, then regenerate the schemas.


## Backend HTTP API (`server/index.ts`)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/elevation/mola128?lat0=&lon0=` | 2°×2° MOLA 128 ppd crop (256×256 int16 LE, meters). `lat0`/`lon0` are even integers, `lon0` in 0–358 °E. The crop is read from the PDS with HTTP Range and cached in `server/.cache`. |
| `GET /api/ai/status` | `{ configured, model, error }` |
| `POST /api/ai/analyze` `{ cellId, clientEdits? }` | Builds the evidence pack, calls Gemini, validates the answer and returns `AIAnalyzeResponse` (see `src/contract/ai.ts`). Proposals arrive as **pending**. |

`os.terrain.resolutionAt(lat, lon)`, `os.terrain.ensureDetail(lat, lon, radiusDeg)` and `os.terrain.onDemandStatus()` expose progressive elevation detail to modules.

Modes: `production` (default) refuses synthetic proposals. `demo` (`?demo` in the URL) allows the simulated engine and uses separate storage (`marsos.demo.changelog.v1`). AI-origin proposals are never auto-applied, whatever the policy.


## Routes (Marswalk comparator)

```ts
const r = await os.routes.plan({ lat: 18.4446, lon: 77.4509 }, { lat: 18.4619, lon: 77.4361 }, os.routes.defaults());
// r.routes: [{ kind: 'shortest' | 'lowSlope', points: [{ lat, lon, h, slopeDeg, dataMpp }], stats: { lengthM, gainM, lossM,
//   maxSlopeDeg, meanSlopeDeg, cautionShare, dataLimitedShare, coarsestDataM, toblerHours } }]
// r.cellM: grid spacing (never finer than the elevation data), r.patchIds: approved edits inside the analysed area
```

The planner samples `terrainModel.height()`, so approved edits change routes. It waits for on-demand elevation tiles first. Shareable link: `?route=lat,lon;lat,lon`.
