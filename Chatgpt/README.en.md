# Data-team deliveries (English summary)

This folder holds raw deliveries from the data team (prepared with ChatGPT). The original notes in Spanish are in `README.md`. MARS OS converts the data with scripts in `scripts/`.

| File | What it is |
|---|---|
| `M20_JezeroCrater_CTXDEM_20m.tif` (git-ignored, 90 MB) | USGS/JPL CTX DEM of Jezero, 20 m/pixel, float32, SHA-256 `ba7f706e…1ba2`. Converted to an on-demand tile pyramid by `npm run data:ctx`. |
| `M20_JezeroCrater_CTXDEM_20m.xml` | PDS4 label of the DEM (projection, extents, nodata) |
| `download_manifest.json` | Source URLs, byte sizes and SHA-256 of each asset |
| `data_catalog.csv`, `mars_atlas_catalog.sqlite` | Candidate catalog of 28 NASA/USGS products and layers (metadata only) |

Key caveats recorded by the data team:
- 20 m does not resolve rocks; nothing here is a safety clearance.
- The DEM's PDS4 label has nil observation dates; 2021-10-14 is the release date.
- Sphere radius: 3,396,190 m in the label vs 3,396,160 m on the USGS page (unreconciled).
- MEDA, PIXL, SuperCam and SHERLOC are point or time-series measurements, not continuous maps.
- PDS releases lag operations. PLACES Release 16 covers sols 0–1897.
