# NASA Space Apps 2026: project page text (copy and paste)

> Every field of the Space Apps "Project" form is below, in order. All text is in English, as the rules require. Every claim can be checked in `docs/STATUS.md` and in the live app.

**Challenge:** Interplanetary Survival Guide: Martian Map
**Team name:** MARS OS
**Team members:** Abril Miranda Villa Márquez (team owner), Jorge Emilio Cornejo Murra

---

## Project Name

MARS OS: the survival map of Mars, built on NASA data

## Summary (50–200 words; 1,500 characters max)

MARS OS is a layered, integrated map a Mars astronaut could use to plan and carry out a Marswalk safely while doing new science. It answers the questions a survival guide must answer: where can we land, where is the water, what is dangerous, how do we move, and what does a mission need to stay alive? It brings data from 20+ NASA missions and datasets onto one globe you can fly from orbit to boot level. Every NASA robot that reached the surface is on the map with its real path, stops, photos, findings and sounds. Water-ice evidence, minerals, dune fields and NASA's candidate Exploration Zones for human missions show resources and hazards. Routes for rovers and astronauts are compared on measured slopes, with risk warnings and a downloadable route sheet. In the Mission Lab, anyone can drop a crew, rover or base anywhere and see oxygen, energy, Earth light time, radiation and EVA range, then ask Gemini whether the mission answers its question. Every number shows its source, and nothing changes the map without human approval. Robots explore Mars today; MARS OS turns what they learned into a map future crews can trust.

## Project Demonstration (one public link)

Use ONE of these (both are public, no login):
- Slide deck (7 slides, English): https://abrilvilla.dev/mars-os/deck/
- or your 30-second video (YouTube "Unlisted" or "Public", or Google Drive "Anyone with the link"), with English subtitles if you speak Spanish.

## Project (public link)

https://abrilvilla.dev/mars-os/

(Source code: https://github.com/abrilvillita/mars-os — mention it inside Project Details.)

## Project Details

**What it does**

MARS OS is a survival guide in map form. It helps a planner or a future crew answer five questions with real data:

1. **Where can we land?** The Landing tab explains how landing sites are chosen, shows real landing ellipses (InSight's computes to 129.6 × 27.0 km from the NASA polygon; NASA states 130 × 27 km) and the 51 Exploration Zones NASA collected for the first human missions. Pin any point to get a factual check: elevation, latitude, slope, nearest ice, minerals, nearest robot and nearest zone.
2. **Where is the water and what resources exist?** Craters that exposed water ice (Dundas et al. 2014) and 1,309 buried glaciers, 6,220 orbital mineral detections, and Perseverance's 30 named rock samples with NASA photos and the camera views inside each tube.
3. **What is dangerous?** Mapped dune fields (the sand that trapped Spirit), steep slopes, low-resolution data and ground no rover has ever crossed are flagged on every route.
4. **How do we move?** Shortest vs. gentlest route for a rover (Perseverance's 24° tilt limit) or an astronaut, on measured slopes. You can load a real Perseverance drive and compare it, read "why this route" (data used and data missing), simulate the drive with a 3D rover and download a route sheet with sources.
5. **What does a mission need?** The Mission Lab: drop a crew, rover or base anywhere, even against MARS OS's advice. It computes oxygen (NASA BVAD), energy (sunlight by latitude, season and dust; solar area vs. MMRTGs), communication with Earth (distance, light time and solar conjunction from JPL orbital elements), radiation (MSL RAD vs. NASA's career limit), water distance and EVA range. It compares two base sites and asks Gemini whether the mission answers its question, using only those facts.

**Every robot, every expedition.** All NASA surface missions from Viking 1 to Ingenuity, with photos, findings, instruments, official links, NASA videos and Mars sounds, 66 expedition stops with NASA descriptions, Curiosity's and Perseverance's full drives and raw photos per stop (loaded live), and 3D rover models where each rover is today. Near a real stop, the visor HUD shows "Perseverance was here" with the photos the rover took there.

**A map that can change without being falsified.** Every region has a stable ID and an editable grid. A person or Gemini can propose a terrain correction with evidence; it is validated, kept pending until a person approves it, and stored in a reversible version history.

**How it works**
- Front end: React, TypeScript, Three.js / React Three Fiber, a quadtree level-of-detail globe streaming NASA Mars Trek tiles, multi-resolution elevation (MOLA 463 m–1.85 km global, CTX 20 m at Jezero), Mars24 sun position.
- Live NASA feeds: MMGIS traverses (Perseverance, Curiosity, Ingenuity), raw-image APIs, MEDA and REMS weather, Mars Trek ArcGIS services, NASA Image and Video Library.
- Backend (Node.js on Render): Gemini API with schema-validated answers, rate limits and no silent fallback; on-demand MOLA elevation.
- Data contract in Zod with JSON Schemas, bilingual interface (English and Spanish).

**Why it is valid**
We checked our numbers against NASA: landing coordinates against hardware located in HiRISE images (we corrected Pathfinder by 21.6 km and InSight by 16.3 km), MOLA vs. rover elevation at Jezero (−2568 m vs. −2569.9 m), our sunrise/sunset vs. MEDA (within 10 s), our Earth–Mars model vs. the 2025 opposition (0.644 vs. 0.642 AU). Every value is labelled measured, derived or modelled, with its source.

**Impact**
Robots explore Mars today, and each one was sent to a different place. MARS OS joins what they learned with what orbiters mapped, so students, planners and future crews can see where Mars is known, where it is not, and what a mission there would need.

**Links**
- Live app: https://abrilvilla.dev/mars-os/
- Source code: https://github.com/abrilvillita/mars-os
- Demo deck: https://abrilvilla.dev/mars-os/deck/

## Use of Super Intelligence (SI)

Tick the options for **code** and for **text/data** (research and writing). Do not tick images, video or audio: the project uses none generated by AI.

Text to paste if the form asks for details:

> We used SI tools and say where in the project README. Claude (Anthropic) generated most of the source code and documentation under the team's direction; the team defined the concept and the challenge approach, made the design decisions, and reviewed and tested the results. ChatGPT (OpenAI) helped research NASA/USGS data sources; every dataset was verified against its official source. Google Gemini is a feature of the app: it reviews terrain evidence and mission plans, its output is schema-validated and labelled as AI, and nothing it proposes changes the map without human approval. No AI-generated images, video or audio are used; all imagery, video and sound comes from NASA and USGS.

## NASA Data (Link Text → Link URL)

| Link Text | Link URL |
|---|---|
| NASA Mars Trek (Viking, MOLA, THEMIS, CTX, HiRISE mosaics and ArcGIS services) | https://trek.nasa.gov/mars/ |
| MGS MOLA MEGDR elevation (NASA PDS Geosciences) | https://pds-geosciences.wustl.edu/missions/mgs/megdr.html |
| Mars 2020 CTX DEM mosaic, Jezero 20 m | https://astrogeology.usgs.gov/search/map/mars_2020_science_investigation_ctx_dem_mosaic |
| Perseverance location map and traverse (MMGIS) | https://science.nasa.gov/mission/mars-2020-perseverance/location-map/ |
| Perseverance raw images | https://mars.nasa.gov/mars2020/multimedia/raw-images/ |
| Perseverance MEDA weather | https://mars.nasa.gov/mars2020/weather/ |
| Mars 2020 rock samples table | https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/ |
| Mars 2020 PLACES localization (PDS) | https://pds-geosciences.wustl.edu/missions/mars2020/places.htm |
| Curiosity traverse (MMGIS) | https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json |
| Curiosity raw images | https://mars.nasa.gov/msl/multimedia/raw-images/ |
| Curiosity REMS weather | https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json |
| Ingenuity flight log (MMGIS) | https://mars.nasa.gov/mmgis-maps/M20/Layers/json/m20_heli_waypoints.json |
| Icy impact craters (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/RSLs_Gullies_New_IcyCraters_clon0/MapServer |
| Glacier-like forms (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Mars_Fans_Glaciers_Gullies/MapServer |
| Aqueous and hydrous mineral detections (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Aquieous_Mineral_Distribution_Options_clon0/MapServer |
| Mars Global Digital Dune Database (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/Dune_Field/MapServer |
| Exploration Zones for human missions (Mars Trek) | https://trek.nasa.gov/mars/trekarcgis/rest/services/EZMars/MapServer |
| CRISM observations (PDS Orbital Data Explorer) | https://ode.rsl.wustl.edu/mars/ |
| NASA mission pages (Viking, Pathfinder, Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance) | https://science.nasa.gov/mars/ |
| NSSDCA Mars landing sites | https://nssdc.gsfc.nasa.gov/planetary/marsland.html |
| NASA Image and Video Library (photos, videos, Mars sounds) | https://images.nasa.gov/ |
| Mars24 sunclock algorithm (NASA GISS) | https://www.giss.nasa.gov/tools/mars24/ |
| MSL RAD surface radiation (Hassler et al. 2014) | https://doi.org/10.1126/science.1244797 |
| NASA Perseverance tilt limit update (2026) | https://science.nasa.gov/blog/tracks-along-the-longest-drive-on-another-world/ |

## Space Agency Partner & Other Data (Link Text → Link URL)

| Link Text | Link URL |
|---|---|
| ESA Mars Express OMEGA (hydrous minerals, Carter et al. 2013, via Mars Trek) | https://www.esa.int/Science_Exploration/Space_Science/Mars_Express |
| Centro de Astrobiología (CAB, Spain): MEDA weather station on Perseverance (instrument page) | https://science.nasa.gov/mission/mars-2020-perseverance/science-instruments/ |
| USGS Geologic Map of Mars SIM 3292 | https://pubs.usgs.gov/sim/3292/ |
| USGS Jezero geologic map SIM 3464 | https://pubs.usgs.gov/publication/sim3464 |
| IAU/USGS Gazetteer of Planetary Nomenclature | https://planetarynames.wr.usgs.gov/ |
| JPL approximate planetary orbital elements | https://ssd.jpl.nasa.gov/planets/approx_pos.html |
| Google Gemini API (in-app AI reviewer) | https://ai.google.dev/ |
| Three.js | https://threejs.org/ |
| React | https://react.dev/ |
| React Three Fiber | https://github.com/pmndrs/react-three-fiber |
| MARS OS source code (public repository) | https://github.com/abrilvillita/mars-os |

## Before pressing Submit

- [ ] Open both links in a private window: they must load without login.
- [ ] Wake the backend first: https://mars-os-api.onrender.com/api/health
- [ ] Demo: ≤ 7 slides or ≤ 30 s, English (or English subtitles), with team name, member names and challenge.
- [ ] No images of anyone under 18.
- [ ] Tick "Agree to Terms" and "Confirm All Work is Original", then **Submit for Judging** (saving is not submitting) before **Sun 15 Nov 2026, 11:59 p.m.** (team owner's local time).
