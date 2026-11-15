# MARS OS: what is real, what needs setup, what is simulated

Last updated: 2026-11-14 (v0.2.0). The same list is shown live in the app under **? → About**, where the backend and Gemini rows are checked at runtime.

## ✅ Operational with verified data (no setup)

| Feature | Data | Verified how |
|---|---|---|
| 3D globe, imagery layers | Mars Trek WMTS: Viking, MOLA hillshade, THEMIS day/night IR, SIM 3292 geology, CTX 6 m and HiRISE 25 cm of Jezero | CORS checked, tiles load in the viewer |
| Global elevation | MOLA MEGDR 4 ppd (14.8 km) and a 32 ppd Jezero crop (1.85 km) from the PDS | Value at the landing site is −2568 m; the rover reported −2569.91 m |
| **Jezero elevation at 20 m** | USGS/JPL CTX DEM (provided by the data team, SHA-256 verified), loaded on demand as a 6-level pyramid | Value at waypoint RMC 3_0 is −2567.4 m; the rover reported −2569.9 m |
| Pinned inspector | Coordinates, elevation (with source and resolution), cell, nearest node, imagery provenance | Browser test: pin → move cursor → scroll panel → values unchanged |
| Editable cells and nodes anywhere | Node heights are flagged *interpolated* when the node spacing is finer than the data | Gale crater: 463 m data, 1.3 km nodes, not interpolated |
| **Route comparator (Marswalk)** | Shortest vs low-slope route (A*) on the measured slope of the current terrain: source DEM plus approved edits. It recalculates automatically when the terrain changes and explains why. Slope limits are editable assumptions; walking time uses Tobler's Earth hiking function and is labelled as a model estimate | Landing site → sol 400 stop: 1.37 km both; max slope 11.6° vs 4.6°. An approved +30 m obstacle made the low-slope route detour by +71 m. Computed in 0.3 s on a 20 m grid |
| **Mineral detections (resources)** | Aqueous minerals (Ehlmann & Edwards 2014) and hydrous detections (Carter et al. 2013) from NASA Mars Trek, plus CRISM targeted-observation footprints at Human Exploration sites (PDS). The inspector lists detections within 25 km of the pin | 6,220 points downloaded completely by object-id batches (the service caps responses at 1,000 and has no paging). Of the 36 carbonate detections, 10 lie around Jezero |
| **Daylight budget** | Local true solar time, geometric sunrise/sunset and daylight left at route start, compared with the round-trip walking time | Sol 1133: computed sunrise/sunset 06:18:07 / 17:13:44 LMST vs MEDA 06:18:07 / 17:13:51 |
| **Helmet visor HUD** | First-person training overlay: compass tape, slope underfoot, LTST, Sun elevation, daylight left, low-slope route guidance with steep-section warnings, automatic walk along the route. Labelled "training HUD, not flight software" | Verified walking the landing site → sol 400 route |
| Proposals, approval and history | Pending → Approved/Applied, or Rejected / Reverted. Append-only versions, time travel, restore, export/import | API test |
| Perseverance | Traverse and waypoints (MMGIS), raw photos per sol, MEDA weather (dated; latest 2024-04-27) | Live endpoints |
| Mars time and sun | Mars24 (Allison & McEwen 2000) | Sols 1127 and 1133 match MEDA |

## ⚙️ Needs configuration

| Feature | What to do |
|---|---|
| **Backend** (`server/`), which runs on-demand MOLA 463 m elevation anywhere on Mars and the Gemini proxy | Run `npm run dev`; it starts the backend and Vite together. Without the backend, the app falls back to the 14.8 km global grid and says so in the UI. |
| **Gemini analysis** | Create `.env.local` with `GEMINI_API_KEY=...` (copy `.env.example`). The key stays on the server and is git-ignored. `/api/ai/status` reports the model that was selected. Without a key, the AI tab says "not configured" and **nothing is simulated in its place**. **Verified 2026-11-14** with a free-tier key (see below). |

### Gemini: how authenticity is enforced

1. The backend builds an **evidence pack** for the selected cell from catalogued products only: elevation sampled at 81 nodes from every product that covers it, differences between products, and rover waypoints with their reported elevations.
2. Gemini is asked for JSON in the shape of the `AIAnalysis` Zod schema, and the response is validated against it.
3. Every draft is **re-checked against the pack**. A draft is rejected when it:
   - cites a ref that does not exist
   - has a center outside the cell
   - asks for a `|delta|` larger than the measured discrepancy
   - uses a radius finer than the data resolution
4. Evidence records, source ids and URLs come from the catalog, not from the model. **Confidence is computed by rules** (agreement between independent products and rover data) and its basis is shown. The AI never reports it.
5. Accepted drafts enter the queue as **pending**. AI proposals can never auto-apply; a person must approve them.
6. Free-tier quota errors (HTTP 429) and any other failure are shown as errors.
7. **Failover between real models.** If a model is overloaded (HTTP 503) or takes longer than 40 s, the next available Gemini model is tried. The response reports the model that answered and every failed attempt. If all of them fail, the user sees an error.

**Verification run (2026-11-14), cell `mars:eq:z13:x11716:y3256` at the Perseverance landing site**

- **Models:** gemini-3.8-flash timed out; gemini-3.6-flash and gemini-3.5-flash returned 503 (overloaded); **gemini-3.5-flash-lite** answered. Total 45 s.
- **Evidence pack:** 81 nodes, 4 elevation products, 20 rover waypoints.
- **Product differences:** CTX DEM vs MOLA 128 ppd: RMS 5 m, max 13.3 m. CTX vs global MOLA 4 ppd: up to 130 m, because the coarse grid smooths local relief.
- **Gemini findings:** cited only pack refs (P1–P4, N*, W*). The rover waypoints agree with CTX/MOLA within about 2 m. It made **no geometry proposal**, which is the correct outcome when there is no localized discrepancy.
- **Schema handling:** the API rejects some JSON-Schema keywords (`maxLength`, `additionalProperties`…), so Gemini receives a structural subset of the schema. Zod still enforces the full schema on every response.

## 🎭 Simulations (always labelled)

| Feature | Label |
|---|---|
| Dust storm (orbit canopy, ground-level blowing dust, haze) | "Simulated" badge in the toggle, plus a **SIMULATED** badge in the HUD while it is on |
| Phobos and Deimos | Orbit radius and period are real; phase and shape are illustrative ("phase illustrative") |
| Demo AI engine | Only at `?demo`. It keeps a **separate history** and shows a demo banner. Production rejects synthetic proposals. |
| Atmosphere glow and star field | Visual only |

## Deployments

| Where | What works |
|---|---|
| https://abrilvilla.dev/mars-os/ (GitHub Pages, auto-deployed from `main`) + backend https://mars-os-api.onrender.com (Render free tier, `render.yaml`) | **Everything.** Verified 2026-11-14 from the public site: on-demand MOLA 463 m at Gale, and a Gemini analysis (gemini-3.8-flash overloaded, gemini-3.6-flash answered in 34 s, 2 findings, 0 proposals). Ground view runs at 48 FPS on an Intel UHD 620. The backend sleeps after 15 min idle; the first request then takes about a minute. |
| Local `npm run dev` with `.env.local` | Everything, including Gemini and on-demand elevation |

## Known limits

- 20 m (CTX) and 463 m (MOLA) do **not** resolve rocks or small scarps. Nothing in MARS OS is a safety clearance.
- HiRISE DTMs at 1 m (1.8 GB) and the 2024 MSR TRN mosaics (5.3 GB) are registered by the data team but not integrated. Their alignment to CTX is not perfect (<6 m at the 93rd percentile, per the data team's notes).
- MEDA data in the NASA feed ends at sol 1133 (2024-04-27). The UI shows the date.
- The production bundle is about 1.4 MB of JS. Code splitting is a future optimization.
