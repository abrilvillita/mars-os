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
| Proposals, approval and history | Pending → Approved/Applied, or Rejected / Reverted. Append-only versions, time travel, restore, export/import | API test |
| Perseverance | Traverse and waypoints (MMGIS), raw photos per sol, MEDA weather (dated; latest 2024-04-27) | Live endpoints |
| Mars time and sun | Mars24 (Allison & McEwen 2000) | Sols 1127 and 1133 match MEDA |

## ⚙️ Needs configuration

| Feature | What to do |
|---|---|
| **Backend** (`server/`), which runs on-demand MOLA 463 m elevation anywhere on Mars and the Gemini proxy | Run `npm run dev`; it starts the backend and Vite together. Without the backend, the app falls back to the 14.8 km global grid and says so in the UI. |
| **Gemini analysis** | Create `.env.local` with `GEMINI_API_KEY=...` (copy `.env.example`). The key stays on the server and is git-ignored. `/api/ai/status` reports the model that was selected. Without a key, the AI tab says "not configured" and **nothing is simulated in its place**. |

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

## 🎭 Simulations (always labelled)

| Feature | Label |
|---|---|
| Dust storm (orbit canopy, ground-level blowing dust, haze) | "Simulated" badge in the toggle, plus a **SIMULATED** badge in the HUD while it is on |
| Phobos and Deimos | Orbit radius and period are real; phase and shape are illustrative ("phase illustrative") |
| Demo AI engine | Only at `?demo`. It keeps a **separate history** and shows a demo banner. Production rejects synthetic proposals. |
| Atmosphere glow and star field | Visual only |

## Known limits

- 20 m (CTX) and 463 m (MOLA) do **not** resolve rocks or small scarps. Nothing in MARS OS is a safety clearance.
- HiRISE DTMs at 1 m (1.8 GB) and the 2024 MSR TRN mosaics (5.3 GB) are registered by the data team but not integrated. Their alignment to CTX is not perfect (<6 m at the 93rd percentile, per the data team's notes).
- MEDA data in the NASA feed ends at sol 1133 (2024-04-27). The UI shows the date.
- The production bundle is about 1.4 MB of JS. Code splitting is a future optimization.
