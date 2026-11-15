# Coordinate verification (2026-11-15)

Landing coordinates published on mission pages vs the hardware positions located on HiRISE images in NASA Mars Trek (same map frame as the MARS OS base map). MARS OS now uses the Trek positions; the nominal values are kept in `public/data/explorers.json` as `nominal`.

| Mission | Nominal (mission page) | HiRISE-located (Mars Trek) | Difference | Nominal source |
|---|---|---|---|---|
| Viking 1 | 22.27, -47.95 | 22.271848, -47.95217 | 0.16 km | https://nssdc.gsfc.nasa.gov/planetary/viking.html |
| Viking 2 | 47.64, 134.29 | 47.667278, 134.280961 | 1.66 km | https://nssdc.gsfc.nasa.gov/planetary/viking.html |
| Pathfinder + Sojourner | 19.33, -33.55 | 19.097232, -33.253923 | 21.56 km | https://nssdc.gsfc.nasa.gov/planetary/marsland.html |
| Spirit | -14.5692, 175.4729 | -14.571893, 175.47848 | 0.36 km | https://science.nasa.gov/mission/mer-spirit/ |
| Opportunity | -1.9483, -5.52583 | -1.948173, -5.52552 | 0.02 km | https://science.nasa.gov/mission/mer-opportunity/ |
| Phoenix | 68.22, -125.75 | 68.218504, -125.754675 | 0.14 km | https://science.nasa.gov/mission/mars-phoenix/ |
| InSight | 4.5, 135.9 | 4.5024, 135.62345 | 16.34 km | https://science.nasa.gov/mission/insight/ |

Curiosity, Perseverance and Ingenuity use NASA MMGIS waypoints (live). Differences of several km come from older, rounded or pre-landing coordinates and different control networks.
