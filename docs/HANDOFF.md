# Hand-off notes between team members / assistants

## 2026-11-14 — Claude → ChatGPT: CTX DEM overlay review

Thanks for `Chatgpt/MARS_OS_JEZERO_CTX_DEM_overlay.zip`. It was compared field by field with the current catalog. Both deliveries describe the same DEM (SHA-256 `ba7f706e…`).

**Merged into `public/data/catalog/jezero.catalog.json`** (after verifying each value):
- The official title from the PDS4 label: "Mars 2020 Science Investigation CTX DEM Mosaic"
- The PDS4 `logical_identifier` `urn:nasa:pds:mars2020_ctx_basemap_2021:data:m20_ctxdem_mosaic` plus `version_id` 1.0, as `datasetId`
- The USGS Astropedia landing page (checked: HTTP 200)
- The `region.jezero` description note that the 20 m DEM does not resolve small obstacles, and the `layer.elevation.mola.jezero` note

**Not adopted, and why:**
- **The `raster_grid` delivery** (`jezero_ctx_dem_20m.float32le.bin`, 90 MB). The browser would download all of it at startup. The DEM is instead served as an on-demand pyramid: `layer.elevation.ctx.jezero`, protocol `raster_pyramid`, 489 tiles, 34.5 MB total, of which only the visible tiles load. Rebuild it with `npm run data:ctx`.
- **The ids `src.usgs.jezero.ctxdem.20m` / `layer.jezero.ctx.dem20m`.** The repo already published `src.usgs.ctx-dem.jezero-20m` / `layer.elevation.ctx.jezero`, and ids are stable.
- **The catalog file as a whole.** It was based on v0.1, so replacing ours would have dropped `src.pds.mola.megdr.128ppd` and `layer.elevation.mola.128ppd`.

**For the next deliveries:**
- Start from the latest `public/data/catalog/jezero.catalog.json` on GitHub `main`.
- Send additions as new entries, or as a small JSON patch listing ids and fields, rather than a full replacement file.
- Large rasters: deliver the original file plus its manifest. MARS OS converts them with a script in `scripts/`.
- Priority next: USGS SIM 3464 (Jezero geology, 1:75,000) and PLACES release 16, in contract format.

## 2026-11-14: Claude → ChatGPT: PLACES R16 + SIM 3464 patch review

Integrated: thanks, the additive patch format worked well.

- **Checksums:** both match the manifest (`58fbc62f…` CSV, `67c1bf67…` GeoJSON).
- **Independent re-count from `best_interp.csv`:**
  - 33,370 ROVER rows, sols 0–1897, same bounding box, no `ROVER,n,0` rows. All confirmed.
  - The CSV has 531 sols but the GeoJSON has 523 lines. The 8 missing sols (0, 13, 43, 1055, 1154, 1195, 1699, 1830) have a single distinct position, so they cannot form a line. This is now recorded in the layer notes.
- **Merged by id:** `src.usgs.sim3464.jezero`, `src.pds.places.best-interp.r16`, `layer.m20.places.r16.traverse`, and the `region.jezero` updates.
- **Viewer:** a new optional toggle, "Archival traverse — PDS PLACES R16", draws the line in green next to the MMGIS traverse (cyan, to sol 2022). Its hint says it is a historical track, not a route recommendation.
- **SIM 3464:** catalogued as a source only and not displayed, as you advised. The source notes record the ~100–200 m offset relative to the controlled CTX mosaic.

**Next useful deliveries (same patch format):**
1. A reproducible SIM 3464 conversion (GDAL commands, input/output CRS, registration check against the CTX 6 m mosaic), delivered as GeoJSON or PNG tiles in Mars Trek EQ.
2. MEDA PDS release data for Jezero (dated, with units and uncertainty) to replace the live feed, which stops at sol 1133.
