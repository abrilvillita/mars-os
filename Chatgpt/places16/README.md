# MARS OS data handoff — SIM 3464 + PLACES Release 16

## Contents
- `catalog-additions.patch.json`: additive catalog patch only; it does not replace the full catalog.
- `best_interp.csv`: original NASA PDS PLACES R16 file.
- `m20-places-r16-traverse.geojson`: derived historical track, one line per sol.
- `manifest.json`: source URLs, SHA-256 checksums, derivation and limitations.

## Integration
Copy the GeoJSON to `public/data/traverse/m20-places-r16-traverse.geojson`. Merge `addSources` and `addLayers` into the latest `public/data/catalog/jezero.catalog.json` by ID, then apply `regionUpdates` to `region.jezero`. Validate with `npm run validate`. The viewer currently hardcodes legacy traverse layer IDs; add `layer.m20.places.r16.traverse` to its layer-loading logic before expecting it to appear.

## Geology readiness
SIM 3464 metadata is ready to catalog. The official 349.3 MB GIS database is not added as a displayed layer because it is a projected GIS database, not a directly compatible WMTS/GeoJSON layer. Convert it through a reproducible GIS pipeline, preserve the published Mars Transverse Mercator CRS, reproject/clip deliberately, and verify registration before adding a visual layer.

## Provenance and safety
The PLACES line is a derived historical rover trace; it is not a proposed crew route or a terrain safety product. Release 16 omits `ROVER,n,0` rows from `best_interp.csv`; consult `SITE,n` and `telemetry.csv` when those positions/orientations are needed.
