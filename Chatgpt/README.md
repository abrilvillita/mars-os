# Mars Atlas — catálogo científico inicial

Corte: 14-nov-2026. Región piloto: cráter Jezero y recorrido archivado de Perseverance.

## Archivos
- M20_JezeroCrater_CTXDEM_20m.tif: DEM real descargado de Jezero, 20 m/píxel, un canal float32.
- M20_JezeroCrater_CTXDEM_20m.xml: etiqueta PDS4 del raster.
- mars_atlas_catalog.sqlite: base de datos SQLite.
- data_catalog.csv: exportación tabular de las 28 fuentes/capas/productos candidatos.

La base contiene catálogos, metadatos, identificadores WMTS, DOIs/enlaces, footprints publicados, evidencia fechada y recetas de cálculo. **No contiene los mosaicos PDS ni cubos de instrumentos completos.** Algunos pueden ser grandes; hay que seleccionar productos por zona, escala y nivel de procesamiento. Mars Trek permite pedir capas WMTS; PDS/ODE permite buscar y descargar productos científicos con sus etiquetas y documentación.

## MVP recomendado
1. MRO HiRISE Jezero controlled mosaic, 25 cm/pixel nominal.
2. MRO CTX controlled mosaic, 6 m/pixel nominal.
3. USGS SIM 3464, geología Jezero–Nili a 1:75,000, base CTX 6 m/pixel.
4. Perseverance PLACES para recorrido/localización histórica.
5. MEDA para mediciones meteorológicas y ambientales del rover.
6. THEMIS-IR y MOLA como contexto regional/global, no para evitar rocas individuales.

## Cifras verificadas
- Aterrizaje: 18.4446°N, 77.4509°E según artículo alojado en NASA NTRS. Confirmar referencia/convención antes de GIS joins.
- NASA reportó 45.22 km de odómetro acumulado el 11-oct-2026; no es una distancia recta ni un valor posterior.
- Mars 2020 Release 16, publicado 11-ago-2026, agrega datos de sols 1740–1859 adquiridos 10-ene a 13-may-2026 y revisiones.
- PLACES Release 16 cubre hasta sol 1897, 21-jun-2026.
- PDS publica datos de Perseverance aproximadamente tres veces al año: no es actualización en vivo.
- USGS SIM 3464 cubre aproximadamente 1°×1° (60×60 km) a escala 1:75,000.

## Uso con rigor
- Resolución nominal no equivale a exactitud absoluta ni a seguridad operacional.
- Mantener producto, release, sol/tiempo, instrumento, nivel de procesamiento, frame, unidad, footprint, incertidumbre y crédito.
- Distinguir medición, mosaico/derivado, interpretación geológica, cálculo y simulación.
- No fusionar capas hasta armonizar frame planetario, latitud areocéntrica/planetográfica, longitud este/oeste, proyección, unidades, época y resolución.
- MEDA son medidas locales del rover y una serie temporal, no una capa continua en todo Jezero.
- RIMFAX ofrece radargramas del subsuelo a lo largo del recorrido, no un raster de obstáculos en superficie.
- PIXL/SuperCam/SHERLOC miden objetivos concretos, no composición uniforme de toda la zona.
- MOLA/THEMIS globales sirven de contexto; no tienen granularidad para peligros de escala humana.
- Resolver desacuerdos como conflictos con fuentes y versiones. No permitir que una noticia suelta reescriba el terreno automáticamente.
- La fórmula de costo de ruta es una heurística de prototipo, no una probabilidad de lesión ni una regla EVA validada.

## Fórmulas listas para implementar
- Distancia de superficie (haversine; radio nominal Marte = 3,396,190 m declarado en metadata de Mars Trek), solo con coordenadas en un mismo frame.
- Pendiente: atan(sqrt((dz/dx)^2+(dz/dy)^2)) desde un DEM co-registrado.
- Ruta: combinar distancia, pendiente, peligros y valor científico con pesos explícitos y editables; mostrar el desglose y la incertidumbre. El DEM CTX de 20 m ya está integrado como archivo local, pero no se propone una ruta hasta disponer de waypoints consistentes, obstáculos registrados y una verificación geométrica del trazado.

## Fuentes
- Mars Trek WMTS y capas: https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=mars
- PDS Mars 2020: https://pds-geosciences.wustl.edu/missions/mars2020/
- PLACES: https://pds-geosciences.wustl.edu/missions/mars2020/places.htm
- MEDA: https://pds-atmospheres.nmsu.edu/data_and_services/atmospheres_data/PERSEVERANCE/meda.html
- Mars ODE REST/API: https://oderest.rsl.wustl.edu
- USGS Jezero SIM 3464: https://doi.org/10.3133/sim3464
- NASA mapa y trayecto: https://science.nasa.gov/mission/mars-2020-perseverance/location-map/
- Coordenadas reportadas en investigación NASA NTRS: https://ntrs.nasa.gov/api/citations/20230016428/downloads/Bell%20et%20al%202022sciadv.pdf

Tablas: metadata, missions, datasets, dataset_mission_sources, evidence, calculations.

Incluye también el punto de referencia del aterrizaje en site_points; reconcilia sus coordenadas con el frame del producto antes de fusionar capas.


## DEM real descargado y verificado
- Archivo: M20_JezeroCrater_CTXDEM_20m.tif (90,345,300 bytes).
- SHA-256: ba7f706ea1b5d63a562f28a7dcf7a7f3c79bce7f048e6974b57e8a33c30d1ba2.
- Resolución: 20 m/pixel; 4,456 muestras × 5,067 líneas; 1 banda IEEE754LSBSingle; nodata -3.4028234663852886e38.
- Cobertura: 76.9974370614600–78.5825633240882°E, 17.5805199105448–19.2901870068662°N.
- Proyección: equirectangular; latitud planetocéntrica; longitud positiva este; unidades de elevación en m.
- La etiqueta PDS4 declara start/stop date como nil/inapplicable; no atribuir al mosaico una sola fecha de observación. 2021-10-14 es publicación.
- Conflicto de metadata: la etiqueta PDS4 del archivo indica radio esférico 3,396,190 m y la ficha USGS del producto 3,396,160 m. Mantener ambos valores, usar la etiqueta nativa del raster hasta confirmar y reconciliar frames antes de mezclar.
- Comprobación local: tamaño exacto esperado por encabezado + payload de 1 banda float32; hash SHA-256 en download_assets.
- Estadísticas calculadas de la grilla, no suministradas por NASA: 22,564,575 celdas válidas; 13,977 nodata; mínimo -3504.645 m; máximo -475.841 m; media -2316.081 m. La media es aritmética por celda, no ponderada por área ni útil como métrica de misión.

## DEMs de más detalle registrados, aún no descargados
- HiRISE TRN 1 m/pixel, 1.8 GB y cobertura más limitada.
- Extensión HiRISE 2025 hacia el oeste del recorrido, ZIP de 5.3 GB. Sus autores reportan alineación interna HiRISE sólida, pero alineación HiRISE–CTX de <6 m al percentil 93 y <10.2 m al percentil 99; un estudio también recomienda no considerarla perfectamente alineada a CTX. No fusionar sin registrar incertidumbre y medir desplazamientos.
- El CTX 20 m sirve como relieve regional de todo Jezero; no resuelve obstáculos del tamaño de una roca. Combinar con ortoimagen HiRISE donde exista cobertura y marcar claramente escala/resolución.
