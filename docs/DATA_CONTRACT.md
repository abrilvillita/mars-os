# MARS OS — Data Contract v1.0.0

> Hand this file (plus `schema/*.json` and `public/data/catalog/jezero.catalog.json`) to whoever prepares the scientific catalog. Files that pass `npm run validate` load into the viewer without code changes.

**Source of truth:** `src/contract/*.ts` (Zod). JSON Schemas in `schema/` are generated from it with `npm run schema`. Never edit the JSON Schemas by hand.

## 1. Two documents, never mixed

| Document | Schema | Contains | Who writes it |
|---|---|---|---|
| `MarsCatalog` | `schema/mars-catalog.schema.json` | **Original data only**: sources, layers, regions, point features, reference values | Data team (ChatGPT + humans), ingest scripts |
| `TerrainChangeLog` | `schema/terrain-changelog.schema.json` | AI/human **proposals**, approved **patches**, **version history** | MARS OS at runtime, AI engines through the API |

A catalog may not contain `ai_proposed` or `human_edit` provenance: the validator rejects it. NASA data is never overwritten. The terrain shown is always:

```
height(lat, lon) = source elevation grid + Σ applied geometry patches
```

## 2. Global conventions

| Item | Rule |
|---|---|
| Body / CRS | Mars, `IAU_2015:49900` (Mars 2000 sphere, planetocentric). `EPSG:104905` is accepted for Mars Trek products. |
| Latitude | Planetocentric, degrees, −90…90 |
| Longitude | **East-positive**, degrees, **−180…180** (convert 0–360 °E values: `lon > 180 ? lon − 360 : lon`) |
| Elevation | Meters relative to the **MOLA areoid** unless the field says otherwise |
| Distances | Meters |
| Dates | ISO-8601 UTC. Reduced precision is allowed: `"2014"` or `"2014-01"`. **Never invent a day.** |
| Unknowns | `null`. Never fill a gap with a guess. |
| Ids | Lowercase `[a-z0-9][a-z0-9._:/-]*`, stable forever, e.g. `src.trek.jezero.hirise`, `layer.themis.day`, `region.jezero` |
| Names | `name` / `title` = **official** name, never translated. `label` / `description` = `LocalizedText` |
| `LocalizedText` | `{ "en": "...", "es": "...", ... }`. `en` is required. |
| Simulated content | `synthetic: true` **and** provenance `synthetic`. The UI labels it everywhere. |

### Provenance values

| Value | Meaning | Example |
|---|---|---|
| `measured` | Direct instrument observation | Rover raw image, MEDA temperature, RAD dose |
| `derived` | Product processed from measurements | HiRISE mosaic, MOLA MEGDR grid, THEMIS mosaic |
| `interpreted` | Expert interpretation | USGS geologic map units |
| `modeled` | Numerical model output | Climate model, pressure-vs-elevation estimate |
| `generated` | Produced by MARS OS itself | 3D mesh, interpolated nodes |
| `ai_proposed` | AI suggestion, not yet accepted as fact | *(change log only)* |
| `human_edit` | Manual team edit | *(change log only)* |
| `synthetic` | Simulated or demo content | Dust-storm visual, demo proposals |

## 3. `MarsCatalog`

```jsonc
{
  "schemaVersion": "1.0.0",
  "id": "catalog.jezero",
  "title": "…", "generatedAt": "2026-11-14T16:30:00Z", "generator": "who/what made it",
  "referenceSystem": { "body": "Mars", "crs": "IAU_2015:49900", "radius_m": 3396190,
    "latitudeType": "planetocentric", "longitudeDirection": "east", "longitudeDomain": "-180..180",
    "verticalDatum": "MOLA areoid …" },
  "sources": [ Source… ], "layers": [ Layer… ], "regions": [ Region… ],
  "features": [ Feature… ], "referenceValues": [ ReferenceValue… ]
}
```

Cross-reference rules, checked by `npm run validate`:
- every `sourceIds`, `layerIds`, `regionId` and `parentId` must exist in the same catalog
- ids are unique across all arrays

### 3.1 Source: a citable origin

Required: `id, title, kind (dataset|tile_service|api|publication|map|mission_page), agency, mission, instrument, productId, datasetId, doi, url, landingPage, citation, license, acquisition {start,end}|null, publishedAt, accessedAt, provenance, synthetic`. Use `null` for anything unknown.

### 3.2 Layer: something displayable or queryable

| Field | Notes |
|---|---|
| `kind` | `imagery, elevation, shaded_relief, thermal, geology, mineralogy, atmosphere, radiation, traverse, waypoints, rover_images` |
| `access.protocol = "wmts"` | `urlTemplate` with `{z} {row} {col}`; `tileMatrixSet: "trek-eq-2x1"` (zoom 0 = 2 cols × 1 row of 256 px tiles, as in Mars Trek EQ); `minZoom/maxZoom` taken from the service's `WMTSCapabilities.xml`; optional `fallback` (local copy of low zooms) |
| `access.protocol = "raster_grid"` | Binary grid: `url, encoding (int16le|float32le), width, height, gridExtent (pixel-is-area edges, in lonConvention), lonConvention ("-180-180"|"0-360E"), noData` |
| `access.protocol = "raster_pyramid"` | On-demand tiles `{url}/{level}/{row}_{col}.i16.gz`. `int16le` × `scale` + `offset`, `noData`, `tileSize`, `gridExtent`, and `levels[]` (level 0 = native data, others are labelled block-averaged overviews). Example: the CTX DEM 20 m. |
| `access.protocol = "raster_service"` | Crops served by the MARS OS backend (`url?lat0=&lon0=`), with `pixelsPerDegree`, `cropDegrees` and `coverageLat`. Example: MOLA 128 ppd. |
| `access.protocol = "geojson"` / `"json_api"` | `url` (with `{placeholders}` for APIs) |
| `valueEncoding` | `visual` (picture for display, **not numeric**), `physical` (`unit, scale, offset`), or `categorical` (`legendUrl`). Example: Mars Trek "DEM" PNG tiles are 8-bit stretched images, so they are `visual`. Numeric elevation must come from a `raster_grid`. |
| `resolution` | Native resolution of the **original** product: `metersPerPixel`, `pixelsPerDegree`, or `mapScale` for vector maps |
| `coverage` | `{ global, bbox }`. MARS OS requests tiles only inside the bbox. |
| `attribution` | Text shown on screen while the layer is visible |

### 3.3 Region: a named, georeferenced area with a stable id

`id, name (official), label, type (landing_site|crater|study_area|coverage|traverse_area|hazard_zone), crs, center {lat,lon,elevation_m}, bbox, polygon ([lon,lat] ring, or null), lod {minZoom,maxZoom,recommendedZoom}, layerIds, sourceIds, parentId, description, provenance, synthetic`.

`lod.maxZoom` is the deepest quadtree level that the best data in the region justifies. Don't set it deeper than the data supports.

### 3.4 Feature: a point (waypoint, sample, landmark, hazard)

`id, regionId, name, label, kind, position, observedAt, sol, properties (flat key → string|number|boolean|null), sourceIds, uncertainty {horizontal_m, vertical_m}|null, provenance, synthetic`.

### 3.5 ReferenceValue: a fixed cited number, never shown as live data

Example: the MSL RAD surface dose-equivalent rate `0.64 ± 0.12 mSv/day` (Hassler et al. 2014), stored with `location`, `period`, `sourceIds` and localized `notes`.

## 4. Editable geometry: cells and nodes

The planet uses the same equirectangular quadtree as Mars Trek EQ WMTS:

```
cell id   mars:eq:z{zoom}:x{col}:y{row}         zoom 0 = 2×1 cells of 180°
bbox      west = −180 + col·s, north = 90 − row·s, s = 180 / 2^zoom
node id   {cellId}/n{N}:{i}:{j}                 N×N grid that includes the cell edges
node pos  lon = west + i/(N−1)·width,  lat = north − j/(N−1)·height
```

Ids are deterministic: the same place always gets the same id, on every machine.

## 5. `TerrainChangeLog`: proposals, patches, versions

### GeometryPatch (localized; only intersecting tiles are rebuilt)

```jsonc
{ "type": "radial", "id": "patch.x", "center": {"lat": 18.44, "lon": 77.45},
  "radius_m": 250, "delta_m": 18, "falloff": "gaussian|cosine|linear|flat" }

{ "type": "node_offsets", "id": "patch.y", "cellId": "mars:eq:z13:x11716:y3256",
  "gridSize": 9, "offsets": [ {"i": 4, "j": 4, "delta_m": -3.5} ] }   // bilinear inside the cell, 0 outside
```

Limits: |delta| ≤ 2000 m (validator), radius ≤ 200 km, ≤ 64 patches per proposal.

### ChangeProposal

`id, createdAt, origin {kind: ai|human|ingest|system, id, model?, version?}, regionIds (catalog regions and/or cell ids), patches[], evidence[] (≥1), confidence 0..1, confidenceBasis? (LocalizedText explaining how confidence was computed; for AI proposals it is rule-based by MARS OS, never self-reported), risk low|medium|high, rationale (LocalizedText), status, review|null, appliedVersionId|null, synthetic`.

Evidence: `kind (dataset|image|publication|report|news|rover_observation|user_note), sourceId|null, url|null, description (LocalizedText), retrievedAt, verified (true only if cross-checked against an authoritative product), synthetic`.

Lifecycle: `pending → applied` (approved, new version committed) · `pending → rejected` · `applied → reverted` (new version removes the patches).

Validation **errors** block a proposal: schema violations, unknown region, a patch outside every declared region, delta too large. Validation **warnings** are shown to the reviewer: `no_verified_evidence`, `news_evidence`, `synthetic`, `low_confidence`.

### Version (immutable, append-only)

`id, parentId, createdAt, author, message (LocalizedText), proposalId, regionIds, bbox (union of affected areas), ops [{op:"add_patch", patch} | {op:"remove_patch", patchId}], restoredFrom`.

Restoring an old state appends a new version (`restoredFrom`). History is never rewritten.

## 6. Checklist for catalog authors

1. Copy `public/data/catalog/jezero.catalog.json` as a template and keep `schemaVersion: "1.0.0"`.
2. For every WMTS layer, open its `WMTSCapabilities.xml` and copy `maxZoom`, `format` and the tile template (`{TileMatrix}/{TileRow}/{TileCol}` → `{z}/{row}/{col}`).
3. Mark `valueEncoding: visual` for any picture-like product, even when it is called "DEM".
4. Use `null` for unknown fields. Set `synthetic: true` for anything simulated.
5. Run `npm run validate -- path/to/file.json` until you see ✔.
6. Add the file path to `CATALOGS` in `src/App.tsx`. Catalogs merge by id.
