# NASA Space Apps 2026: submission draft (English)

> Fill in every `[TODO]` before pasting into the Project page. All content on the Project page must be in English. Every statement below can be checked against `docs/STATUS.md`. Don't add claims that aren't there.

**Challenge:** Interplanetary Survival Guide: Martian Map
**Team name:** [TODO]
**Team members:** [TODO]

---

## Project Name

**MARS OS: a living, evidence-based atlas of Mars**

## High-Level Project Summary

MARS OS is an interactive 3D Mars that combines data from several NASA missions on one surface you can explore. An astronaut or planner can fly from orbit down to boot level, layer optical, thermal, geologic and elevation data, follow Perseverance's real traverse in Jezero Crater, and open the rover's raw photos from each stop. Its distinctive feature is that the map can change without ever being falsified. Each region has a stable ID and an editable grid of nodes. Proposed terrain changes, whether from people or from an AI that cross-checks independent datasets, are validated against the data, kept pending until a person approves them, and recorded in a reversible version history. Every value on screen states its source and resolution, so a crew always knows what is measured, what is derived, and what is simulated.

## Link to Project Demo

[TODO: public link to slides (≤ 7 slides) or video (≤ 30 s, English subtitles)]

## Link to Final Project

[TODO: public URL of the running app and/or the public GitHub repository]

## Detailed Project Description

**What it does**
- **3D globe from orbit to the ground.**
  - A level-of-detail globe streams NASA Mars Trek tiles: the Viking color mosaic, the MOLA hillshade, THEMIS day and night infrared, the USGS global geologic map, and, in Jezero, CTX at 6 m and HiRISE at 25 cm.
  - You can rotate 360°, tilt to the horizon and fly between destinations.
  - The Sun's position, and therefore day and night, follows the real date (Mars24 algorithm).
- **Multi-resolution elevation, loaded on demand.**
  - Global MOLA elevation and a 20 m CTX DEM of Jezero. Their values at Perseverance's first stop are −2567.4 m and −2568 m; the rover reported −2569.9 m.
  - Anywhere else on Mars, 463 m MOLA tiles are fetched through our backend.
  - The finest data available is always used and labelled. A node finer than the data is flagged as interpolated.
- **Mission context.**
  - The real Perseverance traverse and stops.
  - Raw photos for each sol.
  - MEDA surface weather, with its date.
  - A cited radiation reference value (MSL RAD).
- **A persistent inspector.** Clicking the terrain pins coordinates, elevation (with source product and resolution), the editable cell and nearest node, and the provenance of the imagery.
- **An editable terrain with a safety net.**
  - The planet is divided into quadtree cells with permanent IDs; each cell has a grid of nodes.
  - Changes are localized geometry patches that carry evidence, confidence and risk. Only the affected tiles are rebuilt.
  - Every change goes through an append-only history: view the past, restore the whole planet or a single cell, and export or import the history as JSON.
- **AI that cites its evidence (optional).**
  - The backend builds an evidence pack for the selected cell from catalogued data: node elevations from every product, differences between products, and rover-reported elevations.
  - Google Gemini reviews the pack and answers in a schema-validated JSON format.
  - Each claim is re-checked. Drafts that cite non-existent data, exceed the measured discrepancy or claim precision the data cannot support are rejected.
  - Confidence is computed by rules, never self-reported by the AI, and a person must approve every change.
  - In our test at the landing site, Gemini found that the CTX and MOLA products agree within about 13 m and that the rover elevations agree within about 2 m. It correctly proposed no change.

**Why it matters.** Mars maps today are static and built for regional views. Crews will need a map that improves as new observations arrive, without losing track of where each number came from. MARS OS shows how that can work, and it keeps measured, derived, AI-proposed and simulated information visibly separate. That separation is a safety requirement.

**Limits we state openly.** 20 m and 463 m elevation do not resolve rocks; nothing in MARS OS is a safety clearance. The dust storm is a labelled visual simulation, and the phase of Phobos and Deimos is illustrative.

**Technology.** React, TypeScript, Three.js / React Three Fiber, Zod (data contract and validation), i18next (English and Spanish), and a Node backend (HTTP Range proxy for PDS elevation data, Gemini REST API).

**Future work.** HiRISE 1 m DTMs where available, route planning on top of the same API, and integration with surface robots that send new observations back as proposals.

## Use of Super Intelligence (SI) / AI disclosure

We used AI tools openly, and every AI-generated result was reviewed by the team:
- **Claude (Anthropic)** generated most of the source code (viewer, backend, data contract, documentation) under the team's direction. The team defined the concept, made the design decisions, and reviewed and tested the results.
- **ChatGPT (OpenAI)** helped research NASA and USGS data sources. It assembled a candidate data catalog and downloaded the CTX DEM; we verified it by SHA-256 and against its PDS4 label.
- **Google Gemini API** is part of the product: an optional in-app reviewer of elevation consistency. Its output is schema-validated and checked against the data, and it can only create proposals that a person must approve.
- No AI-generated images, video or audio are used. All imagery comes from NASA and USGS.

## NASA Data

| Data | Mission / instrument | Provider / link |
|---|---|---|
| Viking MDIM 2.1 global color mosaic | Viking Orbiter, VIS | NASA Mars Trek WMTS, https://trek.nasa.gov/mars/ |
| MOLA global color hillshade | Mars Global Surveyor, MOLA | NASA Mars Trek |
| MOLA MEGDR elevation (4, 32, 128 px/°) | Mars Global Surveyor, MOLA | NASA PDS Geosciences Node, MGS-M-MOLA-5-MEGDR-L3-V1.0 |
| THEMIS-IR day and night global mosaics (100 m) | 2001 Mars Odyssey, THEMIS | NASA Mars Trek |
| HiRISE Jezero controlled mosaic (25 cm) | Mars Reconnaissance Orbiter, HiRISE | NASA Mars Trek |
| CTX Jezero controlled mosaic (6 m) | Mars Reconnaissance Orbiter, CTX | NASA Mars Trek |
| Mars 2020 Science Investigation CTX DEM Mosaic (20 m) | Mars Reconnaissance Orbiter, CTX | USGS / NASA PDS, urn:nasa:pds:mars2020_ctx_basemap_2021 |
| Perseverance traverse and waypoints | Mars 2020 | NASA/JPL MMGIS location map |
| Perseverance raw images | Mars 2020 | https://mars.nasa.gov/mars2020/multimedia/raw-images/ |
| MEDA surface weather | Mars 2020, MEDA | NASA/JPL feed |
| RAD surface dose-equivalent rate (reference value) | Mars Science Laboratory, RAD | Hassler et al. 2014, Science, doi:10.1126/science.1244797 |

## Space Agency Partner Data and Other References

- USGS Astrogeology: Geologic Map of Mars, SIM 3292 (Tanaka et al. 2014, doi:10.3133/sim3292); Astropedia product page for the CTX DEM.
- Allison, M. & McEwen, M. (2000). *A post-Pathfinder evaluation of areocentric solar coordinates…* Planetary and Space Science 48 (Mars24 time algorithm).
- IAU/USGS Gazetteer of Planetary Nomenclature (Jezero).
- MEDA is developed with Centro de Astrobiología (CAB, CSIC-INTA, Spain).
- Software: React, Three.js, React Three Fiber, drei, Zod, i18next, zustand, Turf, Vite.
- Source code: [TODO: public GitHub URL]

## Pre-submission checklist

- [ ] Repository and/or app link is public and opens without login (test in a private window)
- [ ] Demo link is public; ≤ 7 slides (including title) or ≤ 30 s with English subtitles
- [ ] Demo includes the team name, the members' names and the challenge name
- [ ] All Project-page text is in English
- [ ] No images or likeness of anyone under 18
- [ ] Terms checkbox and "Confirm All Work is Original" checked, then **Submit for Judging** (saving ≠ submitting) before **Sun 15 Nov 2026, 11:59 p.m.**
