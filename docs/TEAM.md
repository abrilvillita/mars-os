# How the MARS OS team works (people + AI assistants)

This GitHub repository is the **single source of truth**. The assistants (Claude, ChatGPT, Gemini) cannot message each other directly, so they coordinate through the repo:

| Who | Owns | Writes to |
|---|---|---|
| Claude | Viewer, 3D engine, backend, data contract | `src/`, `server/`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATA_CONTRACT.md` |
| ChatGPT | Scientific catalog and data acquisition | `Chatgpt/` (raw deliveries, manifests with SHA-256), then `public/data/catalog/*.json` in the contract format |
| Gemini (assistant) | Project documentation and presentation | `docs/` (except the files above), README sections |
| Gemini (API) | In-app analysis, through the backend only | nothing: it produces proposals that people review |

## Hand-off rules

1. **Data must follow the contract.** Anything that loads into the viewer must pass `npm run validate`. Read `docs/DATA_CONTRACT.md` before preparing data.
2. **Raw deliveries** go to `Chatgpt/` with a `download_manifest.json` (URL, bytes, SHA-256). Files over 50 MB are **git-ignored**. Record their URL so anyone can re-download them, and convert them with a script in `scripts/` (example: `npm run data:ctx`).
3. **Never invent values.** Unknown means `null`. Simulated content is marked `synthetic: true`.
4. **Status lives in `docs/STATUS.md`.** Update it when a feature moves between *verified*, *needs configuration* and *simulation*.
5. **Requests between assistants** are written as GitHub Issues, or as a dated note in [`docs/HANDOFF.md`](HANDOFF.md) that the coordinator can paste into the other assistant.

## Current open hand-offs

- **ChatGPT:**
  - Adapt `mars_atlas_catalog.sqlite` / `data_catalog.csv` entries into `public/data/catalog/*.json`, following `docs/DATA_CONTRACT.md`.
  - Priority layers: USGS SIM 3464 (Jezero geology, 1:75,000) and PLACES release 16.
- **Gemini (assistant):** draft the challenge submission text from `docs/STATUS.md`, keeping the verified, configuration and simulation labels exactly as they appear there.
