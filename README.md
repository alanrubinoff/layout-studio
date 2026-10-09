# Layout Studio

Editor visual mínimo para posts de tamaño fijo (1080×1350). **El `post.html` de cada post es la única fuente de verdad**: el editor escribe en ese mismo archivo, y Claude Code o Codex lo editan directamente.

## Cómo probarlo

1. Instalá **Node.js** (versión 22 o más nueva) desde [nodejs.org](https://nodejs.org).
2. Descargá este proyecto: botón verde **Code → Download ZIP** en GitHub, y descomprimilo.
3. Doble clic en **`iniciar.bat`** (Windows) o **`iniciar.command`** (Mac; la primera vez: clic derecho → Abrir). La primera vez instala lo necesario (unos minutos); después se abre el editor en el navegador con el post de ejemplo.
4. Probá: arrastrá el título, achicalo con las esquinas, compará con la referencia (**Al lado** / **Encima**), y exportá **PNG** o **PSD**. Los cambios se guardan solos en `clientes/demo/posts/ejemplo/post.html`.

**Con Claude Code:** abrí la carpeta del proyecto y pedile cosas como *"quiero un post para mi cliente panaderia-sol, dejé las imágenes en Descargas"* o *"subí el título 20 px"*. El archivo [CLAUDE.md](CLAUDE.md) le explica el flujo.

## Ejecutar desde la terminal (Windows y macOS)

```sh
npm install
npx playwright install chromium                      # navegador para exportar y para los tests (si falta, usa Chrome o Edge)
npm start                                            # → http://localhost:4321
npm run nuevo-cliente -- <cliente>                   # crea clientes/<cliente>/ desde el demo
npm run nuevo -- <cliente>/<post>                    # crea un post desde la plantilla del cliente
npm run export -- demo/ejemplo                       # → clientes/demo/posts/ejemplo/export/ejemplo.png
npm run psd -- demo/ejemplo                          # → export/ejemplo.psd: capas en grupos, textos editables
npm test                                             # unitarios + e2e (usan el cliente demo)
```

Requiere Node 22 o superior. El servidor escucha sólo en `127.0.0.1`. Todos los comandos reciben el proyecto como **`<cliente>/<post>`**; en el editor se elige con el selector o con `?project=<cliente>/<post>`.

## Convenciones de nombres

```text
clientes/
  <cliente>/                      demo, panaderia-sol…
    proceso-repetible.md          documentación propia del cliente
    plantilla/post.html           base de cada post nuevo: estilo de marca + elementos fijos (npm run nuevo)
    marca/                        lo que comparten todos sus posts
      fonts/<familia>-<variante>.ttf    archivo-black.ttf
      logo.png
      <asset>.png                 sombrero-chef.png
    posts/
      <post>/                     ejemplo, pan-masa-madre…
        post.html                 el diseño (nombre fijo)
        fondo.png                 imagen base limpia, sin textos (nombre fijo)
        referencia.png            diseño objetivo (nombre fijo; sólo para comparar)
        cajas.png                 referencia con cajas de colores (nombre fijo; opcional)
        <asset>[-<variante>].png  assets propios del post: reloj-35.png
        export/<post>.png, .psd   exportaciones con el nombre del post (se regeneran; no se versionan)
```

- **Carpetas y archivos:** minúsculas, palabras separadas por guiones, sin acentos ni espacios (`pan-masa-madre`, `sombrero-chef.png`). Los comandos rechazan proyectos que no cumplan la convención.
- **¿Marca o post?** Si otro post lo va a reutilizar tal cual (fuentes, logo, íconos), va en `marca/`. Si tiene contenido propio del post dibujado, va en el post — o mejor, se separa: `marca/reloj.png` es el reloj sin número y los minutos van como texto editable encima (`#reloj-minutos`, clase `.minutos`).
- **Grupos:** piezas que se mueven juntas van dentro de un único elemento editable, con sus partes en `%` para que escalen juntas: `#sello` contiene `#sello-anillo` (SVG) y `#sello-sombrero`.
- **Desde `post.html`**, los assets de la marca se referencian con rutas relativas: `../../marca/logo.png`. Así el archivo abre solo, sin servidor.
- **Ids de elementos:** en español y por función: `titulo`, `subtitulo`, `usuario`, `logo`, `menu`, `reloj`. Las piezas de un mismo grupo comparten prefijo: `sello-anillo`, `sello-sombrero`.
- **Clases CSS:** el mismo nombre que la función (`.titulo`, `.subtitulo`, `.acento`, `.sello`, `.fondo`).
- `data-role` usa el vocabulario del spec: `headline`, `label`, `logo`, `decoration`.

## Uso del editor

| Acción | Cómo |
|---|---|
| Mover | arrastrar el elemento · flechas 1 px · `Shift` + flechas 10 px |
| Escalar (proporcional) | manijas de las esquinas; en textos cambia `font-size`, en imágenes `width` |
| Rotar | manija redonda de arriba · `Shift` de a 15° |
| Tamaño | `+` / `−` (textos ±1 px, `Shift` ±4) · campo **T** / **W** de la barra |
| Valores exactos | campos X, Y, T/W y ↻ de la barra superior (Enter para aplicar) |
| Deshacer / rehacer | `Ctrl/⌘+Z` · `Ctrl/⌘+Shift+Z` (cada arrastre o ráfaga de teclas es una sola acción) |
| Referencia | **Al lado** (`R`) y/o **Encima** con opacidad (`O`) — usa `referencia.png` del post |
| Zoom | pastilla abajo a la izquierda · `0` ajustar · `1` tamaño real. Es sólo visual: no cambia coordenadas |
| Exportar | **Exportar PNG** → `export/<post>.png`, a resolución real · **PSD** → `export/<post>.psd` |

## Exportar a PSD

`npm run psd -- <cliente>/<post>` (o el botón **PSD** del editor) genera `export/<post>.psd`, organizado así (panel de capas, de arriba hacia abajo):

```text
▸ Cabecera                         (etiqueta gris)
    Menú · Usuario — tumarca · Logo
▸ Gráficos                         (verde)
    ▸ Reloj
        Minutos — 35’ · Reloj
    Sello RECETA
▸ Textos                           (amarillo)
    Título — PAPAS CROCANTES AL PIMENTÓN · Subtítulo — Fáciles, doradas…
▸ Respaldos en píxeles (no editar) (oculto, cerrado)
  Fondo                            (bloqueado)
```

- **Grupos:** salen de `data-grupo` en cada elemento del HTML (`cabecera`, `textos`, `graficos`, o cualquier otro nombre, que se vuelve subcarpeta: `data-grupo="reloj"`). Sin `data-grupo`, los textos van a *Textos* y el resto a *Gráficos*. Los grupos respetan el orden de apilado del diseño.
- **Nombres:** `data-nombre` si el elemento lo tiene (p. ej. `data-nombre="Sello RECETA"`), si no el `id` legible (`reloj-minutos` → *Minutos*). Los textos agregan su contenido, como hace Photoshop.
- **Imágenes, SVG y grupos del HTML** (logo, reloj, sello, subrayado, menú) → capas de píxeles exactas, en su posición.
- **Textos** → capas de **texto editables** en la fuente real (nombre PostScript leído del `.otf`), con tamaño, color, interlineado por renglón, escala horizontal por tramo (`scale` → *escala horizontal* de Photoshop), inclinación y la sombra como efecto de capa. Cada una tiene su copia **en píxeles** en el grupo de respaldos.
- La imagen compuesta del PSD es el mismo render que el PNG exportado.

Al abrirlo, Photoshop avisa que las capas de texto deben actualizarse (pasa con todo PSD generado fuera de Photoshop). Al aceptar, las redibuja él con la fuente instalada y pueden moverse unos píxeles respecto del HTML; si eso molesta, se usa el respaldo en píxeles. Las fuentes tienen que estar instaladas en la máquina del diseñador (las comerciales, p. ej. de Adobe Fonts, se instalan aparte). Generar el PSD no usa servicios externos.

**Ver en Photopea:** después de exportar, el editor ofrece **Abrir en Photopea** y `npm run psd` imprime el enlace. Photopea corre en el navegador y lee el PSD y las fuentes del post directamente del servidor local (`npm start` tiene que estar corriendo): nada se sube a un servidor. El servidor autoriza sólo a `https://www.photopea.com`, sólo a leer archivos de `clientes/`. Chrome puede pedir permiso para que photopea.com acceda a la red local: hay que aceptarlo.

**Medido en Photopea** (redibujando cada texto con su motor y las fuentes reales, como el "Actualizar" de Photoshop): textos de un estilo ≤2 px de diferencia con el HTML; títulos de varios renglones con tamaños mezclados, ≤1 px arriba y a los lados y 5–6 px abajo. Las imágenes no se mueven.

## Flujo para un post nuevo (agentes)

1. **Crear el post desde la plantilla del cliente:**
   ```sh
   npm run nuevo -- <cliente>/<post>
   ```
   Copia `clientes/<cliente>/plantilla/post.html` a `posts/<post>/post.html`. La plantilla trae lo fijo ya calibrado: el `<style>` de marca y la cabecera (logo, usuario, menú). Agregar en la carpeta `fondo.png` (idealmente generado *borrando* los textos de la referencia: [prompts/fondo-limpio-chatgpt.md](prompts/fondo-limpio-chatgpt.md)), `referencia.png` y `cajas.png` (generada en ChatGPT con [prompts/cajas-chatgpt.md](prompts/cajas-chatgpt.md)).
2. Reemplazar los textos de ejemplo y agregar las piezas propias del post (decoraciones en SVG, imágenes), una por elemento.
3. **Primera pasada con cajas:**
   ```sh
   npm run boxes -- <cliente>/<post>                                # lista las cajas numeradas + hoja de recortes
   npm run boxes -- <cliente>/<post> --apply subtitulo=4 titulo=5 subrayado=6
   ```
   Detecta **todas** las cajas, aunque repitan color (se nombran `verde`, `verde-2`… y se numeran en orden de lectura). Para saber qué hay en cada una, deja una hoja con el recorte de la referencia dentro de cada caja. La caja se elige por número o por nombre. Ajusta la **tinta visible** del elemento (sin sombras ni márgenes transparentes): en textos cambia `font-size`, en imágenes y SVG `width`. `--inset N` descuenta el aire alrededor (por defecto 5, medido con las cajas ajustadas del prompt; ~14 si vienen holgadas). La cabecera de la plantilla no hace falta pasarla por cajas: ya viene exacta. Lo que forma parte de la foto (p. ej. el paquete) no se maqueta aunque tenga caja.
4. **Ajustar cada texto a la referencia:**
   ```sh
   npm run fit -- <cliente>/<post> titulo            # analiza y propone, no escribe
   npm run fit -- <cliente>/<post> titulo --apply    # escribe la mejor variante
   ```
   Mide cada línea (alto, ancho, posición) en la referencia y en el render. Compara **ancho** (sólo `font-size`) contra **alto + escala horizontal** (`font-size` + `scale: X 1`), ajusta posición e interlineado, y elige por superposición de píxeles (IoU). Siempre deja una hoja de recortes (referencia / actual / propuesta) en la carpeta temporal del sistema para mirarla antes de aceptar. Sólo cuenta las zonas de la referencia cercanas al texto ya ubicado, para no confundir partes de la foto del mismo color (un suéter blanco) con letras.

   Si una línea tiene otra proporción en la referencia (más grande o menos comprimida), se resuelve en el CSS del post y se vuelve a correr `fit`: tamaño con `.acento { font-size: 1.14em }` y escala por línea con `<span class="linea l2">` + `.titulo .l2 { scale: 1.16 1 }`.
5. Afinar con el mouse (referencia **Encima**) y exportar.

Las referencias suelen ser generadas por IA: la tipografía nunca coincide exacta. El objetivo es la intención (proporciones, peso y bloque), no el píxel.

## Reglas para agentes

- Para mover o ajustar algo, editá **sólo** el `post.html` del post. No hace falta leer otros archivos.
- Cada elemento editable lleva un `id` único (ver convenciones), `data-editable="true"` y su geometría inline (`left`, `top`, `width`, `font-size`, `transform: rotate(…)`), con `position: absolute` dentro de `.canvas`.
- Los estilos compartidos (fuentes, colores) van en el `<style>` del mismo HTML.
- **Escala horizontal** de un texto (como en Photoshop): inline `scale:0.8 1;transform-origin:0 0;`. Así se acerca la fuente Wide a referencias de proporción más angosta sin cambiar de fuente. El editor la respeta (la selección mide lo visible) y no permite rotar ese elemento.
- Para verificar visualmente, usá `npm run export -- <cliente>/<post>` y mirá `export/<post>.png`.
- Al crear elementos, poné `data-grupo` (p. ej. `cabecera`, o un nombre propio para piezas que van juntas) y, si el id no alcanza, `data-nombre`: así queda ordenado el PSD.
- Si el editor está abierto, recarga solo cuando el archivo cambia (y vacía su historial de deshacer). Si había un cambio sin guardar, muestra un conflicto en lugar de pisarlo.

## Estructura del código

```text
studio/server.js        servidor local: sirve archivos, POST /api/save y POST /api/export
studio/projects.js      convención de proyectos (<cliente>/<post>) y nombres fijos de imágenes
studio/new-post.js      crea un post desde la plantilla del cliente (npm run nuevo)
studio/psd.js           exportación a PSD con capas (npm run psd)
studio/style-patch.js   reescribe sólo el atributo style del elemento (parse5 + offsets exactos)
studio/export.js        render de post.html solo (file://) a PNG con Playwright
studio/boxes.js         detección de cajas de colores y primera pasada (npm run boxes)
studio/fit.js           ajuste de textos a la referencia (npm run fit)
studio/editor.html/.js  editor: post en un iframe escalado más un overlay de selección
tests/                  pruebas
Layout_Studio_MVP_Minimo.md   spec original de la herramienta
```

## Guardado

Al terminar cada interacción (soltar el mouse, dejar de tocar flechas durante 0,5 s, Enter en un campo, deshacer), el editor envía **una** operación `{project, elementId, changes, expectedRevision}`. El servidor:

1. valida las propiedades permitidas: `left`, `top`, `width`, `height`, `font-size` en px, `transform: rotate(Ndeg)`, `line-height`, `scale` y `transform-origin: 0 0`. `null` quita la declaración (lo usa deshacer);
2. compara la revisión (hash del archivo) y devuelve 409 si difiere;
3. reemplaza sólo el texto del atributo `style` de ese elemento;
4. escribe de forma atómica (archivo temporal y luego `rename`).

Nunca se serializa el DOM renderizado. La rotación sólo se edita si el `transform` del elemento está vacío o es un `rotate()` simple.

## Evaluación con agentes

[docs/evaluacion-fase2.md](docs/evaluacion-fase2.md): tres ajustes pedidos en lenguaje natural a agentes de código (Claude Code; vale igual para Codex) sin contexto previo. Los tres correctos, con 13–17 acciones y ~40 k tokens cada uno, leyendo sólo el `post.html` (más el README para encontrar los comandos).

## Pendiente / conocido


- **Fuentes y material de clientes:** el repo público sólo trae el cliente `demo`, con fuentes libres (Archivo, licencia SIL OFL) e imágenes generadas para el ejemplo. Las fuentes comerciales (p. ej. de Adobe Fonts) y el material de cada marca no se publican: cada uno los pone en su `clientes/<cliente>/marca/`.
- Probado en Windows 11 (Chromium). macOS **no se probó**; el código no usa rutas absolutas ni comandos de Bash, y git fija saltos de línea LF en todas las plataformas.
