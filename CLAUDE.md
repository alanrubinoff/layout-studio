# Layout Studio — guía para Claude Code

Herramienta para armar posts de Instagram de tamaño fijo (1080×1350) en HTML, ajustarlos con el mouse y exportarlos a PNG y PSD. **El `post.html` de cada post es la única fuente de verdad.** Detalle completo en [README.md](README.md); acá está lo necesario para trabajar.

## Arrancar (primera vez en una máquina)

```sh
npm install
npx playwright install chromium
npm start            # editor en http://localhost:4321 — dejalo corriendo en segundo plano
```
Para el usuario: doble clic en `iniciar.bat` (Windows) o `iniciar.command` (Mac) hace lo mismo y abre el navegador.

## Pedido típico: "quiero un post para <cliente>, dejé las imágenes en Descargas"

1. **Encontrar las imágenes** en la carpeta de descargas del usuario (`~/Downloads`; en Windows `%USERPROFILE%\Downloads`), ordenando por fecha (las más nuevas). Mirarlas (Read) para saber cuál es cuál:
   - **referencia**: el diseño terminado, con textos (lo que hay que imitar);
   - **fondo**: la misma escena **sin** textos ni íconos;
   - **cajas** (opcional): la referencia con rectángulos de colores alrededor de cada elemento;
   - otros **assets**: logo, íconos, sellos (PNG con transparencia).
   Si algo es ambiguo, preguntá. No modifiques ni borres los originales de Descargas: copialos.
2. **Cliente:** si no existe `clientes/<cliente>/`, crealo con `npm run nuevo-cliente -- <cliente>` y poné sus fuentes y logo en `clientes/<cliente>/marca/` (ajustando el `<style>` y la cabecera de `clientes/<cliente>/plantilla/post.html`). Si el usuario no tiene las fuentes, usá las libres del demo y avisá.
3. **Post:** `npm run nuevo -- <cliente>/<post>` y copiá las imágenes con nombres fijos: `fondo.png`, `referencia.png`, `cajas.png`. Assets del post con nombre descriptivo (`reloj-35.png`); los reutilizables van a `marca/`.
4. **Contenido:** reemplazá los textos de ejemplo de `post.html` por los de la referencia y agregá un elemento por pieza (SVG para formas simples). Cada elemento: `id` en español por función, `data-editable="true"`, geometría inline, `data-grupo` para el PSD (`cabecera`, o un nombre propio para piezas que van juntas).
5. **Ubicar:** `npm run boxes -- <cliente>/<post>` lista las cajas numeradas y deja una hoja de recortes para ver qué hay en cada una; después `--apply titulo=5 subtitulo=4 …`.
6. **Ajustar textos:** `npm run fit -- <cliente>/<post> <id>` (mirá la hoja de recortes) y `--apply` si mejora.
7. **Verificar y entregar:** `npm run export -- <cliente>/<post>` y mirá `export/<post>.png` contra la referencia. Pasale al usuario el enlace del editor: `http://localhost:4321/?project=<cliente>/<post>`. Si pide PSD: `npm run psd -- <cliente>/<post>` (imprime también un enlace para abrirlo en Photopea).

Si no hay imagen de cajas, se puede generar en ChatGPT con [prompts/cajas-chatgpt.md](prompts/cajas-chatgpt.md); para fondos limpios, [prompts/fondo-limpio-chatgpt.md](prompts/fondo-limpio-chatgpt.md).

## Pedido típico: "cambiá / mové / agrandá tal cosa"

Editá **sólo** el `post.html` del post: las propiedades inline del elemento (`left`, `top`, `width`, `font-size`, `scale`…). No hace falta leer el código de `studio/`. Si el editor está abierto, se recarga solo.

## Reglas

- Nombres: minúsculas con guiones, sin acentos (`panaderia-sol/pan-masa-madre`).
- Las referencias suelen ser generadas por IA: la tipografía nunca coincide exacta; buscá la intención (proporción, peso, bloque). Para textos, medí alto **y** ancho (`npm run fit`), no sólo ancho.
- No subas a repos públicos fuentes comerciales ni material de clientes sin permiso.
- `npm test` corre las pruebas (usa el cliente `demo`).
