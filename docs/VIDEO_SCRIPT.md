# MARS OS — guion del video (30 s, estructura oficial de Space Apps)

> Reglas (Project Submission Guide 2026): **30 segundos o menos**, en inglés **o** en otro idioma **con subtítulos en inglés**; sin personas menores de 18 años; sin imagen, video ni audio generados por IA. Los jueces califican **Impacto, Creatividad, Validez, Relevancia y Presentación**.
> La guía propone este orden: **0:00** quiénes son → **0:02** el reto y por qué → **0:05** nombre y tagline → **0:10** cómo funciona, con datos de NASA → **0:20–0:30** el futuro. El guion lo sigue segundo a segundo.

## Los 3 lugares

| Lugar | Qué es | Cómo grabarlo |
|---|---|---|
| **A · Equipo** | Abril y Jorge juntos | Plano medio, luz de frente (ventana o lámpara), fondo oscuro o con la laptop mostrando el planeta |
| **B · Pantalla** | MARS OS en acción (la mitad del video) | Grabación de pantalla 1920×1080 a 60 fps (OBS o Win + Alt + R), navegador en F11 |
| **C · Afuera** | El futuro | Al atardecer o de noche, mirando al cielo; Marte sale de madrugada en noviembre de 2026, así que basta con el cielo |

## Guion

| Tiempo | Lugar | Toma | Narración (EN) | Subtítulo / traducción |
|---|---|---|---|---|
| **0:00–0:02** | A | Los dos a cámara | "Hi! We're Abril and Jorge — team MARS OS." | “¡Hola! Somos Abril y Jorge, del equipo MARS OS.” |
| **0:02–0:05** | A → B | Corte con *whip-pan* (giro rápido de cámara) a la pantalla: el planeta girando con las etiquetas de los 10 robots | "Our challenge: a map that helps a human explorer plan a safe Marswalk on Mars." | “Nuestro reto: un mapa que ayude a un explorador humano a planear una caminata segura en Marte.” |
| **0:05–0:10** | B | **Vuelo** desde la órbita hasta el suelo de Jezero (*Go to* → Jezero, luego *Ground view*). Texto grande: **MARS OS — the survival map of Mars** | "This is MARS OS: the survival map of Mars, built on NASA data." | “Esto es MARS OS: el mapa de supervivencia de Marte, hecho con datos de NASA.” |
| **0:10–0:13** | B | Exploradores → Spirit: ficha con foto, Troy y su recorrido | "Every robot's real path, photos and findings…" | “El recorrido real, las fotos y los hallazgos de cada robot…” |
| **0:13–0:16** | B | Capa de hielo y pestaña Aterrizaje: Zonas de Exploración y elipses | "…where the water ice is, and where humans could land…" | “…dónde está el hielo de agua y dónde podrían aterrizar humanos…” |
| **0:16–0:20** | B | Rutas: riesgos (arena) y el rover 3D simulando el trayecto. Corte al Laboratorio de misión: veredicto de Gemini en verde | "…safe routes, and what any mission needs to survive — checked by AI." | “…rutas seguras y lo que cualquier misión necesita para sobrevivir, revisado con IA.” |
| **0:20–0:25** | C | Tú mirando al cielo; la cámara sube lentamente | "Robots explore Mars today. Each one saw only a small piece of it." | “Hoy los robots exploran Marte. Cada uno vio solo un pedacito.” |
| **0:25–0:30** | C → B | Corte al planeta girando sin paneles (`&ui=0`), con el logo y la URL | "MARS OS joins them into one map — for the crews who will follow." | “MARS OS los une en un solo mapa, para las tripulaciones que vendrán.” |

Unas 75 palabras: a ritmo tranquilo caben en 30 s. Si te pasas, quita “and photos” y “checked by AI”.

## Enlaces para cada toma (ábrelos en pestañas antes de grabar)

- 0:02 planeta con robots: https://abrilvilla.dev/mars-os/?tab=explorers
- 0:05 vuelo: desde la vista del planeta usa *Go to* → *Jezero crater* y luego *Ground view*
- 0:10 Spirit: https://abrilvilla.dev/mars-os/?explorer=spirit
- 0:13 hielo: https://abrilvilla.dev/mars-os/?ice=1&lat=40&lon=150&dist=6000 · zonas: https://abrilvilla.dev/mars-os/?zones=1&tab=landing&lat=10&lon=-40&dist=13000
- 0:16 ruta real + rover 3D: https://abrilvilla.dev/mars-os/?drive=380,420&tab=routes (botón *Simulate the drive*)
- 0:18 misión + Gemini: https://abrilvilla.dev/mars-os/?mission=46.33,176.9,base&lat=46.33&lon=176.9&dist=900&tilt=20&q=Can%20a%20crew%20reach%20water%20ice%20from%20this%20base%3F
- 0:25 final cinematográfico: https://abrilvilla.dev/mars-os/?lat=5&lon=-40&dist=9000&ui=0
- Extra (fotos en el visor): https://abrilvilla.dev/mars-os/?hud=1&lat=18.4446&lon=77.4509&dist=0.03&tilt=80

## Antes de grabar

1. Despierta el backend: https://mars-os-api.onrender.com/api/health (espera a que diga `ok`).
2. Abre el enlace de la misión y presiona **Ask Gemini** una vez, para que la respuesta salga rápido al grabar.
3. Graba cada toma de pantalla por separado con 5 s de margen antes y después; recorta al editar.
4. **Guarda esas grabaciones.** Sirven para el video y también para meterlas en la presentación como clips animados (ver abajo).

## Trucos de edición (CapCut o Clipchamp)

- *Whip-pan* entre lugares: giro rápido de cámara al final de una toma y al inicio de la siguiente.
- Zoom digital lento (*Ken Burns*) sobre el veredicto de Gemini y la ficha de Spirit.
- Texto grande de 2–4 palabras por toma: **10 robots · 1 map** · **Water ice** · **Landing zones** · **Safe routes** · **AI-checked missions**.
- Música instrumental baja; puedes usar 2 s de los **sonidos reales de Perseverance** (NASA, en la ficha de Perseverance) y acreditarlos.
- Créditos (última línea, 1 s): *Data: NASA, JPL-Caltech, USGS, NASA Mars Trek, PDS · Sounds: NASA*.
