# MARS OS

**Living scientific atlas of Mars** for NASA Space Apps Challenge 2026, challenge *Interplanetary Survival Guide: Martian Map*.

MARS OS is an interactive 3D Mars built on real NASA and USGS data. You can orbit the whole planet and then descend to walking height in Jezero Crater. Along the way you can turn on optical, thermal and geologic layers, follow Perseverance's real traverse, see the rover's raw photos from each stop, and edit small regions of the terrain through validated, revertible proposals that an AI engine can submit.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` | Typecheck and build the production bundle |
| `npm run validate` | Validate catalogs and change logs against the contract |
| `npm run schema` | Regenerate `schema/*.json` from `src/contract` |
| `npm run data:mola` | Re-download the MOLA elevation grids from the PDS |
| `npm run data:fallback` | Re-download the offline fallback tiles |

## What's inside

- **Real data:** Viking color mosaic, MOLA hillshade and elevation grids (PDS), THEMIS day/night IR, USGS geologic map SIM 3292, HiRISE 25 cm and CTX 6 m mosaics of Jezero, the Perseverance traverse and waypoints, rover raw images, and MEDA weather. Every layer shows its source, resolution and citation.
- **Modifiable planet:** stable quadtree cells (`mars:eq:z13:x11716:y3256`) with N×N node grids. Localized geometry patches rebuild only the tiles they touch.
- **AI-ready:** `marsOS.proposals.submit()` accepts proposals that carry evidence, confidence and risk. They go through validation, a manual or auto approval policy, preview, approve/reject, and revert.
- **Version history:** append-only versions, time travel, restore (for the whole planet or one cell), and JSON export/import.
- **Environment:** the real sun position (Mars24 algorithm), day/night, atmosphere, Phobos and Deimos, and a dust storm that is a labelled **simulation**.
- **Bilingual:** English by default, full Spanish, and new languages can be added by dropping in a JSON file.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): layers, rendering strategy, verified data facts, backend plan
- [docs/DATA_CONTRACT.md](docs/DATA_CONTRACT.md): the JSON contract for the data team
- [docs/API.md](docs/API.md): how other modules query regions, select nodes and request changes

## Credits

Data from NASA/JPL-Caltech (Mars Trek, Mars 2020), the NASA PDS Geosciences Node (MGS MOLA), Arizona State University (THEMIS), the University of Arizona (HiRISE), MSSS (CTX), USGS Astrogeology (Tanaka et al. 2014, SIM 3292) and CAB (MEDA). NASA does not endorse this project.
