# Layout Studio

Editor visual mínimo para armar **posts de Instagram de tamaño fijo (1080×1350)** en HTML: ubicás textos e imágenes con el mouse, los comparás con una imagen de referencia y exportás **PNG** o **PSD con capas** para seguir en Photoshop.

Cada post es un único archivo `post.html`. El editor guarda ahí cada cambio, y un agente de código (Claude Code o Codex) puede editar ese mismo archivo cuando le pedís algo en lenguaje natural.

## Cómo probarlo

1. Instalá **Node.js** (versión 22 o más nueva) desde [nodejs.org](https://nodejs.org).
2. Descargá este proyecto: botón verde **Code → Download ZIP** en GitHub, y descomprimilo.
3. Doble clic en **`iniciar.bat`** (Windows) o **`iniciar.command`** (Mac; la primera vez: clic derecho → Abrir). La primera vez instala lo necesario (unos minutos); después se abre el editor en el navegador con el post de ejemplo **Pan de masa madre**.
4. Probá: arrastrá el título, achicalo desde las esquinas, compará con la referencia (**Al lado** / **Encima**) y exportá **PNG** o **PSD**. Los cambios se guardan solos en `clientes/demo/posts/ejemplo/post.html`.

Para cerrarlo, cerrá la ventana negra (o `Ctrl+C` en ella).

## Trabajar con Claude Code

Abrí la carpeta del proyecto con Claude Code y pedile lo que necesites. El archivo [CLAUDE.md](CLAUDE.md) le explica el flujo, así que no hace falta darle más contexto. Por ejemplo:

- *"Quiero un post para mi cliente panaderia-sol. Dejé en Descargas la referencia, el fondo sin textos y el logo."*
- *"En panaderia-sol/promo-otono subí el título 20 px y poné el subtítulo en blanco."*
- *"Cambiá el texto del título por 'NUEVA TEMPORADA', que se siga viendo igual."*
- *"Exportame el PSD de panaderia-sol/promo-otono."*

**Qué conviene tener para un post nuevo** (en Descargas, con cualquier nombre):

| Imagen | Qué es | ¿Obligatoria? |
|---|---|---|
| Referencia | El diseño terminado que querés reproducir (por ejemplo, generado con ChatGPT) | Sí |
| Fondo | La misma escena **sin** textos ni íconos | Sí |
| Cajas | La referencia con un rectángulo de color alrededor de cada elemento: ayuda a ubicar todo en la primera pasada | Recomendada |
| Assets | Logo, íconos o sellos en PNG con transparencia | Si el diseño los usa |
| Fuentes | Los `.ttf` / `.otf` de la marca | Si no, se usan fuentes libres |

Los prompts para generar el fondo y las cajas en ChatGPT están en [`prompts/`](prompts/).

## Uso del editor

| Acción | Cómo |
|---|---|
| Elegir post | selector arriba a la izquierda, agrupado por cliente (aparece cuando hay más de un post) |
| Mover | arrastrar el elemento · flechas 1 px · `Shift` + flechas 10 px |
| Escalar (proporcional) | manijas de las esquinas; en textos cambia el tamaño de letra, en imágenes el ancho |
| Rotar | manija redonda de arriba · `Shift` de a 15° |
| Tamaño | `+` / `−` (textos ±1 px, `Shift` ±4) · campo **T** / **W** de la barra |
| Valores exactos | campos X, Y, T/W y ↻ de la barra superior (Enter para aplicar) |
| Deshacer / rehacer | `Ctrl/⌘+Z` · `Ctrl/⌘+Shift+Z` (cada arrastre o ráfaga de teclas es una sola acción) |
| Referencia | **Al lado** (`R`) y/o **Encima** con opacidad (`O`) |
| Zoom | pastilla abajo a la izquierda · `0` ajustar · `1` tamaño real (sólo visual: no cambia el diseño) |
| Exportar | **Exportar PNG** y **PSD** → carpeta `export/` del post. Tras el PSD, **Abrir en Photopea** |

## El PSD

El PSD sale organizado para seguir trabajando en Photoshop:

```text
▸ Cabecera                         (etiqueta gris)
    Menú · Usuario — tumarca · Logo
▸ Gráficos                         (verde)
    Sello NUEVO
▸ Textos                           (amarillo)
    Título — PAN DE MASA MADRE · Subtítulo — Recién salido del horno…
▸ Respaldos en píxeles (no editar) (oculto)
  Fondo                            (bloqueado)
```

- Los **textos son editables**, con la fuente real, el tamaño, el color, el interlineado, la escala horizontal y la sombra como efecto de capa.
- Imágenes y decoraciones son capas de píxeles en su posición exacta.
- Al abrirlo, Photoshop avisa que las capas de texto deben **actualizarse**. Pasa con todo PSD generado fuera de Photoshop: aceptá. Al redibujarlas pueden moverse 1 o 2 px (hasta 5–6 px abajo en títulos con tamaños mezclados). Si molesta, en *Respaldos* está cada texto exactamente como en el HTML.
- Las fuentes de la marca tienen que estar instaladas en la máquina donde se abre el PSD.
- **Ver sin Photoshop:** el botón **Abrir en Photopea** lo abre en photopea.com, que corre en tu navegador (no se sube nada). Si Chrome pide permiso para que photopea.com acceda a la red local, aceptá.

## Videos

Cada post puede tener un video vertical animado (1080×1920, para reels e historias) hecho con [Remotion](https://www.remotion.dev). Usa los mismos textos, imágenes y colores del post: la cabecera baja, el subtítulo aparece, el título entra línea por línea, el sello entra girando y el reloj cuenta los minutos.

```sh
npm run nuevo-video -- <cliente>/<post>    # crea video.jsx en la carpeta del post, leyendo su post.html
npm run video -- <cliente>/<post>          # abre Remotion Studio (vista previa con línea de tiempo)
npm run video:render -- <cliente>/<post>   # → export/<post>.mp4, junto al PNG y el PSD
```

- El video de un post es su archivo **`video.jsx`**: dice qué textos, imágenes, colores y duración usar. Se puede editar a mano o pedírselo a Claude Code ("hacé que el video dure 8 segundos", "sacá el reloj del video").
- Las animaciones compartidas están en [`video/VideoPost.jsx`](video/VideoPost.jsx). Cambiar algo ahí afecta a todos los videos.
- Remotion lee los archivos directamente de la carpeta del cliente (`staticFile('marca/logo.png')`), sin copiarlos.
- **Windows 11:** si exportar falla con `write EOF`, es *Smart App Control*. Bloquea el codificador de Remotion porque no está firmado; se desactiva en Seguridad de Windows → Control de aplicaciones y navegador. La vista previa en Studio funciona igual.

## Problemas comunes

| Problema | Solución |
|---|---|
| "Falta Node.js" o `npm` no existe | Instalá Node.js 22+ desde nodejs.org y volvé a abrir el iniciador |
| Mac: "no se puede abrir porque es de un desarrollador no identificado" | Clic derecho sobre `iniciar.command` → Abrir → Abrir |
| Mac: "permiso denegado" | En la Terminal, dentro de la carpeta: `chmod +x iniciar.command` |
| El navegador dice que no conecta | Esperá a que la ventana negra muestre `Layout Studio → http://localhost:4321` y recargá |
| `EADDRINUSE` (puerto ocupado) | Ya hay un editor abierto en otra ventana: usá ese, o cerralo |
| Exportar falla con "No hay navegador" | En la carpeta del proyecto: `npx playwright install chromium` |
| Photopea muestra el lienzo vacío | Revisá que el editor siga abierto y aceptá el permiso de red local de Chrome |
| Exportar video falla con `Failed to launch the browser process` / `ENOENT` | La carpeta del proyecto está demasiado "adentro" (Windows no acepta rutas de más de 260 caracteres): movela a una ruta corta, p. ej. `C:\layout-studio` |

---

## Para agentes y desarrolladores

### Comandos

```sh
npm install && npx playwright install chromium     # primera vez
npm start                                          # editor en http://localhost:4321 (?project=<cliente>/<post>)
npm run nuevo-cliente -- <cliente>                 # crea clientes/<cliente>/ copiando el demo
npm run nuevo -- <cliente>/<post>                  # crea un post desde la plantilla del cliente
npm run boxes -- <cliente>/<post> [--apply id=N …] # detecta cajas de colores y ubica elementos
npm run fit -- <cliente>/<post> <id> [--apply]     # ajusta un texto a la referencia
npm run export -- <cliente>/<post>                 # → export/<post>.png
npm run psd -- <cliente>/<post>                    # → export/<post>.psd (+ enlace a Photopea)
npm run nuevo-video -- <cliente>/<post>            # crea video.jsx del post desde su post.html
npm run video -- <cliente>/<post>                  # Remotion Studio con el video del post
npm run video:render -- <cliente>/<post>           # → export/<post>.mp4
npm test                                           # pruebas (usan el cliente demo)
```

El servidor escucha sólo en `127.0.0.1`. Un proyecto siempre se nombra **`<cliente>/<post>`**.

### Estructura y nombres

```text
clientes/
  <cliente>/                      demo, panaderia-sol…
    plantilla/post.html           base de cada post nuevo: estilo de marca + cabecera calibrada
    marca/                        lo que comparten todos los posts del cliente
      fonts/                      .ttf/.otf de la marca
      logo.png, <asset>.png       íconos y piezas reutilizables
    posts/
      <post>/                     ejemplo, promo-otono…
        post.html                 el diseño (nombre fijo)
        fondo.png                 base limpia, sin textos (nombre fijo)
        referencia.png            diseño objetivo, sólo para comparar (nombre fijo)
        cajas.png                 referencia con cajas de colores (nombre fijo, opcional)
        <asset>.png               assets propios del post (reloj-35.png)
        video.jsx                 video del post (opcional; npm run nuevo-video)
        export/<post>.png, .psd, .mp4   exportaciones (se regeneran; no se versionan)
```

- **Archivos y carpetas:** minúsculas, palabras separadas por guiones, sin acentos ni espacios. Los comandos rechazan nombres que no cumplan.
- **¿Marca o post?** Lo que otro post reutilizaría tal cual (fuentes, logo, íconos) va en `marca/`. Lo propio del post va en el post. Si una pieza mezcla las dos cosas (un reloj con "35'" dibujado), conviene separarla: el reloj vacío en `marca/` y los minutos como texto editable.
- **En `post.html`:** rutas relativas a la marca (`../../marca/logo.png`), para que el archivo abra solo, sin servidor.
- **Elementos:** un elemento por pieza. Cada uno lleva:
  - `id` en español por función (`titulo`, `subtitulo`, `usuario`, `logo`, `menu`, `sello`), con prefijo compartido entre partes de un grupo (`sello-anillo`);
  - `data-editable="true"`;
  - la geometría inline (`left`, `top`, `width`, `font-size`, `transform: rotate(…)`), con `position: absolute` dentro de `.canvas`;
  - `data-grupo` (`cabecera`, o un nombre propio para piezas que van juntas: sale como subcarpeta en el PSD) y, si el id no alcanza, `data-nombre`.
- **Piezas que se mueven juntas:** van dentro de un solo elemento editable, con sus partes en `%` para que escalen juntas (ver `#sello` en el demo).
- **Estilos compartidos** (fuentes, colores) en el `<style>` del mismo HTML. Clases con el nombre de la función (`.titulo`, `.subtitulo`, `.acento`).
- **Escala horizontal** de un texto (como en Photoshop): inline `scale:0.8 1;transform-origin:0 0;`. Sirve para acercarse a referencias con letra más angosta sin cambiar de fuente.

### Flujo para un post nuevo

1. `npm run nuevo -- <cliente>/<post>` y copiar `fondo.png`, `referencia.png` y `cajas.png` a la carpeta del post.
2. Reemplazar los textos de ejemplo y agregar las piezas propias (SVG para formas simples, PNG para ilustraciones).
3. **Primera pasada:** `npm run boxes -- <cliente>/<post>`.
   - Detecta todas las cajas, aunque repitan color (`verde`, `verde-2`…), numeradas en orden de lectura.
   - Deja una hoja con el recorte de la referencia dentro de cada caja, para saber qué hay en cada una.
   - Después se asocian: `--apply titulo=5 subtitulo=4`.
   - Ajusta la parte visible de cada elemento (sin sombras ni márgenes transparentes). `--inset N` descuenta el aire de las cajas: por defecto 5, ~14 si vienen holgadas.
   - La cabecera de la plantilla ya viene calibrada. Lo que es parte de la foto no se maqueta.
4. **Textos:** `npm run fit -- <cliente>/<post> <id>`.
   - Mide alto, ancho y posición de cada línea en la referencia.
   - Compara ajustar sólo el ancho contra ajustar el alto con escala horizontal, y elige por superposición de píxeles (IoU).
   - Deja una hoja de recortes para mirar antes de aplicar con `--apply`.
   - Si una línea tiene otra proporción, se resuelve en el CSS del post (`.acento { font-size: 1.14em }`, `.titulo .l2 { scale: 1.16 1 }` con `<span class="linea l2">`) y se vuelve a correr.
5. Afinar con el mouse (referencia **Encima**), exportar y comparar `export/<post>.png` con la referencia.

Las referencias suelen ser generadas por IA, así que la tipografía nunca coincide exacta: el objetivo es la intención (proporción, peso, bloque), no el píxel.

### Código

```text
studio/server.js        servidor local: archivos, POST /api/save, POST /api/export
studio/editor.html/.js  editor: post en un iframe escalado + overlay de selección
studio/style-patch.js   reescribe sólo el atributo style de un elemento (parse5 + offsets exactos)
studio/projects.js      convención <cliente>/<post>, nombres fijos, rutas de exportación
studio/export.js        render a PNG con Playwright
studio/psd.js           exportación a PSD organizada (ag-psd)
studio/boxes.js         detección de cajas de colores
studio/fit.js           ajuste de textos a la referencia
studio/new-client.js    npm run nuevo-cliente
studio/new-post.js      npm run nuevo
studio/video.js         npm run nuevo-video / video / video:render (Remotion)
video/VideoPost.jsx     animaciones compartidas de los videos
tests/                  pruebas (node --test)
docs/                   spec original y evaluación con agentes
prompts/                prompts de ChatGPT (cajas, fondo limpio)
```

### Cómo guarda el editor

Al terminar cada interacción (soltar el mouse, dejar de tocar flechas 0,5 s, Enter en un campo, deshacer), el editor envía **una** operación `{project, elementId, changes, expectedRevision}`. El servidor:

1. valida las propiedades permitidas (`left`, `top`, `width`, `height`, `font-size`, `line-height`, `transform: rotate()`, `scale`, `transform-origin: 0 0`);
2. compara la revisión del archivo y responde 409 si cambió por fuera (por ejemplo, porque lo editó un agente): el editor avisa en lugar de pisar el cambio;
3. reemplaza sólo el atributo `style` de ese elemento y escribe de forma atómica.

Nunca se serializa el DOM renderizado: el HTML queda tal como lo escribió la persona o el agente. Si el editor está abierto y el archivo cambia, se recarga solo.

### Licencias y material

- El cliente `demo` usa fuentes libres (Archivo, licencia SIL OFL, incluida en `clientes/demo/marca/fonts/`) e imágenes generadas para el ejemplo.
- No subas a un repo público fuentes comerciales (p. ej. de Adobe Fonts) ni material de clientes sin permiso: viven en `clientes/<cliente>/` de cada máquina.
- Probado en Windows 11 con Chromium. macOS **no se probó todavía**: el código no usa rutas absolutas ni comandos propios de Windows.

### Evaluación

[docs/evaluacion-fase2.md](docs/evaluacion-fase2.md): tres ajustes pedidos en lenguaje natural a agentes sin contexto previo. Los tres salieron correctos, con 13–17 acciones y ~40 k tokens cada uno, leyendo sólo el `post.html` y el README.
