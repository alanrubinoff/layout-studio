# Layout Studio — guía para Claude Code

Herramienta para armar posts de Instagram de tamaño fijo (1080×1350) en HTML, ajustarlos con el mouse y exportarlos a PNG y PSD, más un video vertical animado (Remotion) por post.

**El `post.html` de cada post es la única fuente de verdad.** El usuario suele ser diseñador, no programador: hablale en términos de diseño y hacé vos la parte técnica. Referencia completa en [README.md](README.md) (sección "Para agentes y desarrolladores").

## Antes de empezar

- Si no existe `node_modules/`, corré `npm install` y `npx playwright install chromium`.
- El editor puede estar abierto: probá `curl -s -o /dev/null -w "%{http_code}" http://localhost:4321`. Si no responde 200, arrancalo en segundo plano con `npm start` y dejalo corriendo, porque el usuario lo necesita para ver y ajustar.
- Un proyecto se nombra siempre `<cliente>/<post>`, en minúsculas, con guiones y sin acentos (`panaderia-sol/promo-otono`). `clientes/demo/` es el ejemplo de referencia.

## Pedido: "quiero un post para <cliente>, dejé las imágenes en Descargas"

1. **Buscar las imágenes** en Descargas (`~/Downloads`; en Windows `%USERPROFILE%\Downloads`), las más recientes primero. Miralas con Read para saber cuál es cuál:
   - **referencia:** el diseño terminado, con textos (lo que hay que reproducir);
   - **fondo:** la misma escena **sin** textos ni íconos;
   - **cajas** (opcional): la referencia con rectángulos de colores alrededor de cada elemento;
   - **assets:** logo, íconos, sellos (PNG con transparencia); **fuentes** `.ttf` / `.otf`.

   Si algo es ambiguo o falta el fondo, preguntá. El fondo se puede generar en ChatGPT con [prompts/fondo-limpio-chatgpt.md](prompts/fondo-limpio-chatgpt.md) y las cajas con [prompts/cajas-chatgpt.md](prompts/cajas-chatgpt.md): pasale el prompt al usuario. **Copiá** los archivos; nunca muevas ni borres los originales de Descargas.

2. **Cliente nuevo** (si no existe `clientes/<cliente>/`):
   - `npm run nuevo-cliente -- <cliente>`. Copia el demo con fuentes libres y un logo de ejemplo.
   - Poné el logo y las fuentes de la marca en `clientes/<cliente>/marca/`, con nombres en minúsculas (`fonts/marca-bold.otf`).
   - En `clientes/<cliente>/plantilla/post.html`:
     - cambiá los `@font-face`, los colores y el texto del usuario (`tumarca`);
     - si la referencia tiene otra cabecera, ajustá el logo, el usuario y el menú, o borrá lo que no tenga.
   - Si no hay fuentes de la marca, usá las del demo y avisale al usuario qué fuente reemplazaría la original.

3. **Post:** `npm run nuevo -- <cliente>/<post>`. Copiá las imágenes con nombres fijos: `fondo.png`, `referencia.png`, `cajas.png`. Los assets propios del post van con nombre descriptivo (`reloj-35.png`); los reutilizables, a `marca/`.

4. **Contenido:** en `post.html`, reemplazá los textos de ejemplo por los de la referencia y agregá un elemento por pieza (SVG para formas simples). Cada elemento lleva:
   - `id` en español por función (`titulo`, `subtitulo`, `sello`…);
   - `data-editable="true"`;
   - la geometría inline;
   - `data-grupo` para ordenar el PSD (`cabecera`, o un nombre propio para piezas que van juntas) y, si el id no alcanza, `data-nombre`.

   Lo que ya es parte de la foto (por ejemplo, un producto) no se maqueta.

5. **Ubicar:** `npm run boxes -- <cliente>/<post>` lista las cajas numeradas e imprime la ruta de una hoja de recortes: miralá para saber qué elemento hay en cada caja. Después asociá cada caja con su elemento: `--apply titulo=5 subtitulo=4 sello=6`.

6. **Ajustar textos:** `npm run fit -- <cliente>/<post> <id>` para cada texto. Mirá la hoja que genera y, si la propuesta se parece más a la referencia, repetí con `--apply`.

7. **Verificar:** `npm run export -- <cliente>/<post>` y compará `export/<post>.png` con la referencia. Corregí lo que se note a simple vista.

8. **Entregar:** pasale al usuario:
   - el enlace del editor: `http://localhost:4321/?project=<cliente>/<post>` (ahí ajusta con el mouse, con la referencia **Al lado** o **Encima**);
   - qué quedó distinto de la referencia y por qué (fuente reemplazada, pieza que es parte de la foto…).

   Si pide PSD: `npm run psd -- <cliente>/<post>`. Genera `export/<post>.psd` e imprime un enlace para verlo en Photopea.

## Pedido: "hacé un video de este post"

1. Si el post no tiene `video.jsx`: `npm run nuevo-video -- <cliente>/<post>`. Lo arma leyendo `post.html`: textos, fuentes, colores, logo, sello y reloj.
2. Ajustá `clientes/<cliente>/posts/<post>/video.jsx` a lo que pida el usuario:
   - duración (`export const duracion`);
   - textos;
   - piezas a sacar (borrar la prop, por ejemplo `reloj={…}`);
   - tamaño del título (`tituloTamano`, `tituloEscala`).

   Las animaciones compartidas están en `video/VideoPost.jsx`. Si el usuario quiere otra animación sólo para ese post, escribila en su `video.jsx` en lugar de cambiar la compartida.
3. `npm run video:render -- <cliente>/<post>` genera `export/<post>.mp4`. Verificalo sacando un par de cuadros con el `ffmpeg` que trae Remotion (`node_modules/@remotion/compositor-*/ffmpeg.exe -ss 4 -i … -frames:v 1 cuadro.png`) y mirándolos.
4. Para que lo vea y ajuste, arrancá en segundo plano `npm run video -- <cliente>/<post>` y pasale **http://localhost:3000**.

Si el render falla con `write EOF` en Windows 11, es Smart App Control bloqueando el codificador de Remotion: explicáselo al usuario (lo desactiva él en Seguridad de Windows). No lo desactives vos.

## Pedido: "cambiá / mové / agrandá tal cosa"

Editá **sólo** el `post.html` del post: las propiedades inline del elemento (`left`, `top`, `width`, `font-size`, `scale`…), los textos o el CSS del `<style>`. No hace falta leer el código de `studio/`. Si el editor está abierto, se recarga solo. Si el pedido es ambiguo (por ejemplo, si el subrayado acompaña al título cuando se mueve), decidí con criterio de diseño y contá qué hiciste.

## Reglas

- Las referencias suelen ser generadas por IA: la tipografía nunca coincide exacta. Buscá la intención (proporción, peso, bloque). Para textos, medí alto **y** ancho (`npm run fit`), no sólo ancho.
- Para una letra más angosta que la fuente disponible, usá escala horizontal: `scale:0.8 1;transform-origin:0 0;`.
- No subas a repos públicos fuentes comerciales ni material de clientes sin permiso del usuario.
- Si tocás código de `studio/`, corré `npm test` (usa el cliente `demo`).
