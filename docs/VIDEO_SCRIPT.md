# MARS OS — guion del video (30 s)

> Space Apps acepta un demo de **hasta 30 segundos** de video (o hasta 7 diapositivas). Confírmalo en la página de entrega antes de exportar.
> Narración en **inglés** (el jurado es internacional). Debajo de cada línea va la traducción para que sepas qué estás diciendo. Habla tranquila: ~2.5 palabras por segundo.

## Antes de grabar (10 min)

1. **Despierta el backend**: abre https://mars-os-api.onrender.com/api/health y espera a que diga `ok` (tarda hasta 1 min si estaba dormido).
2. **Pre-carga Gemini**: abre el enlace de la toma 4 y presiona *Ask Gemini* una vez. Así, al grabar, la respuesta llega rápido (o grabas la respuesta ya puesta).
3. Navegador en **pantalla completa (F11)**, ventana 1920×1080, zoom del navegador 100 %, sin pestañas visibles.
4. Graba la pantalla con OBS o la Xbox Game Bar (Win + Alt + R), a 60 fps si puedes. Los movimientos de cámara se ven mucho mejor así.
5. Graba **cada toma de pantalla por separado** (5–8 s de margen antes y después) y recorta al editar.

## Los 3 lugares

| Lugar | Para qué | Idea de toma |
|---|---|---|
| **1. Tú (inicio)** | El gancho humano | Plano medio, luz de frente; empieza mirando hacia arriba (al cielo o a una lámpara roja) y gira a cámara al hablar |
| **2. La pantalla** | El producto (es el 70 % del video) | Grabación de pantalla, más un plano de tu mano en el mouse para transiciones |
| **3. Cierre (equipo)** | Quiénes somos | Abril y Jorge juntos frente a la laptop con MARS OS girando detrás |

## Guion toma por toma

| Tiempo | Lugar | Qué se ve (toma) | Narración (EN) | Traducción |
|---|---|---|---|---|
| **0–3 s** | 1 | Primer plano tuyo mirando arriba → giras a cámara. *Corte con whip-pan* (giro rápido de cámara) hacia la laptop | "Every robot we've sent to Mars has only seen a few kilometres." | “Cada robot que enviamos a Marte solo ha visto unos pocos kilómetros.” |
| **3–8 s** | 2 | Planeta girando con las etiquetas de los 10 robots → *Go to* → **Spirit**: vuela y se abre su ficha (foto, Troy, hallazgos). Enlace: `?explorer=spirit` | "MARS OS puts all of them — and every orbiter's map — into one living 3D atlas built on NASA data." | “MARS OS los reúne a todos, junto con los mapas de cada orbitador, en un atlas 3D vivo con datos de NASA.” |
| **8–14 s** | 2 | Pestaña **Laboratorio de misión** con la base sobre un cráter con hielo: anillo verde de EVA, oxígeno, energía, minutos de luz a la Tierra. Haz *scroll* lento. Enlace abajo | "Drop a crew, a rover or a base anywhere: it computes oxygen, power, light-time to Earth, radiation and the nearest water ice." | “Suelta una tripulación, un rover o una base donde quieras: calcula oxígeno, energía, tiempo de luz a la Tierra, radiación y el hielo más cercano.” |
| **14–19 s** | 2 | Clic en **Ask Gemini** → aparece el veredicto verde “Yes”, con sus riesgos. Haz zoom de pantalla (en la edición) al veredicto | "Then Gemini judges whether your mission answers its question — using only those facts." | “Luego Gemini evalúa si tu misión responde su pregunta, usando solo esos datos.” |
| **19–25 s** | 2 | **Rutas** → trayecto real de Perseverance (soles 380–420) → análisis de riesgos → **Simular el trayecto**: el rover 3D avanza con la cámara siguiéndolo. Enlace: `?drive=380,420&tab=routes` | "Routes show how well every metre is known — and warn about the sand that trapped Spirit." | “Las rutas muestran qué tan conocido es cada metro y avisan de la arena que atrapó a Spirit.” |
| **25–30 s** | 3 | Ustedes dos frente a la laptop; corte final a la pantalla de título con el logo y la URL | "MARS OS. From robots today to crews tomorrow — every number with its source." | “MARS OS. De los robots de hoy a las tripulaciones de mañana, cada número con su fuente.” |

## Enlaces para cada toma (ábrelos en pestañas antes de grabar)

- Toma 3–8 s: https://abrilvilla.dev/mars-os/?explorer=spirit
- Toma 8–19 s (base sobre un cráter con hielo, pregunta ya escrita):
  https://abrilvilla.dev/mars-os/?mission=46.33,176.9,base&lat=46.33&lon=176.9&dist=900&tilt=20&q=Can%20a%20crew%20reach%20water%20ice%20from%20this%20base%3F
- Toma 19–25 s: https://abrilvilla.dev/mars-os/?drive=380,420&tab=routes
- Toma extra (fotos de Perseverance en el visor): https://abrilvilla.dev/mars-os/?hud=1&lat=18.4446&lon=77.4509&dist=0.03&tilt=80
- Toma extra (hielo en el planeta): https://abrilvilla.dev/mars-os/?ice=1&lat=40&lon=150&dist=6000
- Toma extra cinematográfica, sin paneles: añade `&ui=0` a cualquier enlace.

## Tomas dinámicas (para que no parezca solo una grabación de pantalla)

- **Whip-pan** entre lugares: gira la cámara rápido al final de una toma y al inicio de la siguiente; al editar se unen como un solo movimiento.
- **Zoom de pantalla** en edición (CapCut/Clipchamp: “zoom” o “ken burns”) sobre el veredicto de Gemini y sobre los números de oxígeno.
- **Vuelo de cámara real** dentro de MARS OS: usa *Go to* → un lugar lejano. El vuelo de 3–4 s es tu mejor transición.
- **Mano en el mouse** (plano desde arriba con el celular) justo antes de dar clic en *Ask Gemini*: aumenta la expectativa.
- **Texto en pantalla** (2–3 palabras grandes) en cada toma: *10 robots* · *O2 · Power · Light-time* · *Gemini verdict* · *Real drive vs computed*.
- **Música**: sin letra, que suba en 0–3 s y baje cuando hablas. Si usas los sonidos reales de Perseverance (están en la ficha de Perseverance, de NASA), dilo en los créditos.

## Créditos (texto final, 1 línea)

“Data: NASA, JPL-Caltech, USGS, NASA Mars Trek, PDS. Video and sounds: NASA. Built by Abril Villa and Jorge Cornejo — team MARS OS.”

> Regla de Space Apps: no uses imágenes, video ni audio generados por IA. Todo lo que muestra MARS OS viene de NASA y USGS, así que está bien.
