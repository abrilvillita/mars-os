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
