# Mini Layout Editor — MVP HTML-first

**Especificación inicial para Codex / Claude Code · v0.2**

## Objetivo

Crear la herramienta local más pequeña posible para componer **posts gráficos de tamaño fijo** (p. ej. 1080 × 1350) con HTML/CSS y corregir rápidamente su posición y tamaño con el mouse. El resultado debe seguir siendo **un archivo HTML editable directamente por Codex**, no un formato propietario ni un JSON paralelo.

**Hipótesis a validar:** un HTML autocontenido por post, con estilos de geometría inline y un editor visual muy simple, permite producir y ajustar una composición más rápido que un editor gráfico complejo o un motor de diseño propio.

## Regla principal de arquitectura

**`post.html` es la única fuente de verdad del diseño.**

- HTML para elementos y texto; `<style>` dentro del mismo HTML para reglas comunes, marca y fuentes.
- Atributo `style` **inline** para propiedades específicas y modificables de cada elemento (posición, tamaño, rotación, tamaño de fuente, opacidad, z-index, etc.).
- Assets externos en `assets/` (fondo, referencia, logo, producto, tipografías): no embebidos como base64.
- Cada elemento editable tiene un `id` único y `data-editable="true"`; opcional `data-role="headline|logo|product|label|decoration"`.
- El editor **modifica el mismo archivo HTML** al confirmar una edición. **No** genera ni mantiene `design.json`, y Codex **no** debe sincronizar dos formatos.
- El diseño no es responsive: lienzo con dimensiones fijas, elementos en `position: absolute` relativos a `.canvas { position: relative; }`. **No** usar `position: fixed` para ubicar elementos del post.
- El zoom del editor modifica solo la visualización, nunca las coordenadas reales del HTML.

### Estructura mínima

```text
mini-layout-editor/
  package.json
  README.md
  app/                   # editor local, UI y persistencia
  projects/
    ejemplo/
      post.html          # ÚNICA fuente del diseño
      assets/
        fondo.jpg
        referencia.jpg
        logo.png
        fuente.woff2
```

### Ejemplo de `post.html`

```html
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: BrandDisplay; src: url('./assets/fuente.woff2'); }
    * { box-sizing: border-box; }
    html, body { margin: 0; }
    .canvas { position: relative; width: 1080px; height: 1350px; overflow: hidden; }
    .canvas > [data-editable] { position: absolute; }
    .headline { font-family: BrandDisplay, sans-serif; color: white; font-weight: 900; }
    .background { display: block; object-fit: cover; }
  </style>
</head>
<body>
  <main class="canvas" id="artboard">
    <img id="background" class="background" data-editable="true" data-role="background"
         src="./assets/fondo.jpg"
         style="left:0px;top:0px;width:1080px;height:1350px;z-index:0;" alt="">
    <h1 id="headline" class="headline" data-editable="true" data-role="headline"
        style="left:85px;top:140px;width:760px;font-size:94px;line-height:.95;transform:rotate(0deg);z-index:10;">
      ARROZ AL CURRY
    </h1>
    <img id="logo" data-editable="true" data-role="logo" src="./assets/logo.png"
         style="left:830px;top:55px;width:185px;transform:rotate(0deg);z-index:20;" alt="Logo">
  </main>
</body>
</html>
```

Este HTML **es el documento final**. La interfaz de edición es un *overlay* de la aplicación local, no código agregado permanentemente a `post.html`. El fondo y las imágenes pueden venir de ejemplos reales que aporte el usuario.

## Alcance estricto del primer MVP

1. **Abrir un proyecto local** con `post.html` y `assets/`; visualizarlo en un lienzo fijo con zoom para encajar en pantalla.
2. **Seleccionar un elemento editable** haciendo clic: mostrar contorno y manijas.
3. **Arrastrar para mover**, **redimensionar** con manijas y **rotar** con una manija sencilla. Flechas para mover 1 px; Shift + flechas para 10 px. Para textos, controlar además `font-size` de modo sencillo (tecla +/− o campo compacto). No es necesario replicar Photoshop.
4. **Overlay de referencia:** cargar/mostrar `assets/referencia.jpg` encima del lienzo, regular opacidad y alternar visibilidad. El overlay **no forma parte del `post.html` ni de la exportación**.
5. **Guardado automático al confirmar:** al soltar el mouse (`pointerup`/fin del drag, resize o rotate) persistir **una sola modificación** de las propiedades inline del elemento correspondiente en `post.html`. Para flechas/teclas, agrupar en una transacción al finalizar la interacción. No escribir a disco en cada movimiento intermedio.
6. **Indicación de estado:** `Guardando…`, `Guardado`, `Error al guardar`; no anunciar éxito antes de la confirmación. Mantener el cambio en pantalla si falla y permitir reintento.
7. **Exportar PNG** a la resolución original con Playwright, esperando que carguen imágenes y fuentes (`document.fonts.ready`). Generar PNG sin herramientas de editor ni overlay.
8. **Deshacer/rehacer** al menos para modificaciones hechas durante la sesión; cada arrastre confirmado es una única acción.
9. **Windows y macOS:** mismo proyecto Node.js, sin comandos dependientes de Bash ni rutas absolutas del sistema. Un comando documentado para arrancar.

### Guardado real, no aparente

Un HTML servido en el navegador **no puede sobrescribir su propio archivo arbitrariamente**. Implementar un **servidor local Node.js** con un endpoint de guardado. El cliente envía `{elementId, changes, expectedRevision}`; el servidor valida una lista permitida de propiedades, comprueba revisión, modifica únicamente el elemento identificado en `post.html`, escribe de forma atómica y responde con la revisión confirmada.

Para evitar cambios accidentales, usar un parser HTML con localización de nodos o un mecanismo probado para actualizar el atributo `style` **sin reformatear todo el documento**. Nunca guardar una serialización completa del DOM renderizado: incluiría controles del editor o alteraría el HTML de Codex. Limitar acceso a rutas del workspace y no exponer el servidor en la red por defecto.

Si Codex cambió el HTML mientras el editor estaba abierto, detectar revisión distinta y mostrar un conflicto o recargar **sin pisar silenciosamente** el contenido nuevo. La primera versión puede bloquear edición al detectar conflicto; no necesita sincronización colaborativa.

## Reglas para Codex / Claude Code

- Trabajá principalmente sobre `projects/<proyecto>/post.html`, sin buscar una jerarquía grande de archivos para mover un texto.
- Al crear elementos nuevos, asigná `id` único, `data-editable="true"` y estilos geométricos inline.
- Mantené en `<style>` los estilos compartidos, fuentes y colores de marca; inline solo las propiedades particulares del elemento.
- Cuando te pidan mover/agrandar un elemento, cambia sus propiedades inline directamente, sin tocar elementos no relacionados.
- No implementes un motor JSON, una base de datos, un sistema de plugins, un generador de prompts ni una interfaz de workspaces en este MVP.
- Usá Playwright para verificar las composiciones visualmente **cuando aporta valor**; no generes nueve capturas por cada cambio trivial.
- Si necesitás explorar nueve variantes 3×3, hacelo mediante **script interno de experimentación**, con una sola contact sheet de **recortes locales ampliados** para evaluación propia; **no** construyas una pantalla pública de nueve opciones. La estrategia es experimental: elegí y justificá qué información mostrar, no sigas una receta visual fija.
- Priorizá pocos archivos, poco código, nombres claros y herramientas directas. No leas el PRD completo repetidamente si basta el archivo HTML y una instrucción concreta.

## Fases de implementación con aprobación

### Fase 0 — Spike de viabilidad (hacer primero)

**Construir solamente:** un `post.html` de ejemplo, un visor/editor local básico y persistencia de `left`/`top` al soltar un elemento. Abrir el archivo HTML luego en un navegador común y comprobar que el cambio quedó escrito en su atributo `style`.

**Demo obligatoria:** mover título → soltar → estado Guardado → recargar → título sigue en lugar nuevo → abrir HTML y ver CSS inline actualizado. Probar macOS y Windows, o declarar explícitamente cuál entorno no pudo probarse.

**Detenerse y pedir aprobación.** No avanzar a la fase 1 por iniciativa propia.

### Fase 1 — MVP usable

Agregar resize, rotate, flechas, tamaño de fuente, overlay de referencia, deshacer/rehacer, autosave robusto y exportación PNG. Probar una publicación real.

**Demo obligatoria:** reconstruir aproximadamente un post de referencia, afinar elementos con el mouse y exportar PNG limpio de 1080×1350. Recargar sin perder las correcciones. **Detenerse para aprobación.**

### Fase 2 — Evaluar eficiencia de Codex (solo si lo anterior funciona)

Pedir a Codex tres ajustes en lenguaje natural sobre el mismo HTML; medir pasos, tiempo y uso de contexto/tokens si están disponibles. Experimentar con **refinamiento local 3×3** para layouts difíciles usando el procedimiento de abajo. **No agregar una nueva arquitectura sin evidencia.**

#### Experimento optativo: refinamiento local 3×3 (herramienta interna del agente)

**Propósito:** cuando Codex quiera aproximar un elemento (p. ej. un titular) a una imagen de referencia, probar nueve cambios *pequeños* alrededor de su mejor estimación y evaluarlos viendo **una sola imagen compuesta** de nueve **recortes ampliados** de la misma región. **No** son nueve diseños completos ni una vista para el usuario.

**Entrada orientativa:** `post.html`, imagen de referencia, `id` del elemento objetivo, región aproximada del objetivo y propiedades que conviene explorar (por ejemplo `left`, `top`, `width`, `font-size`, `line-height` o rotación). El agente puede inferir la región y los rangos, y debe mantener constante el contenido que no está evaluando.

**Render de cada candidato:** capturar **el mismo crop de referencia** y superponer en él la versión candidata del elemento objetivo. Cuando aporten información, incluir también los elementos ya aprobados que estén cerca o afecten el espacio disponible (p. ej. subtítulo o sello). Evitar elementos lejanos que no influyan en la decisión. El agente tiene libertad para elegir entre estos modos y comparar cuál resulta más legible:

- **Aislado:** referencia + candidato; bueno para ajustar geometría y tipografía inicialmente.
- **Contexto local:** referencia + candidato + elementos ya fijados que interaccionen con él; bueno para evitar choques y comprobar composición.
- **Doble verificación:** primero aislado y luego los mejores candidatos con contexto local o una captura de mayor resolución.

**Overlay:** distinguir visualmente el candidato de los textos preexistentes en la referencia. Probar opacidad o color contrastante si dos textos blancos superpuestos impiden juzgar el ajuste. No fijar por contrato una opacidad única (por ejemplo 50 %) ni exigir que las capas fijadas estén siempre presentes: **la claridad de la comparación manda**.

**Composición:** nueve recortes numerados del 1 al 9 dentro de una única *contact sheet* 3×3, con idéntico origen, escala y región entre variantes. Dejar margen suficiente alrededor del objetivo para observar alineación, saltos de línea y colisiones. Si las miniaturas pierden detalle, usar crops más cerrados, una imagen más grande o una segunda revisión en alta resolución; no sacrificar precisión por forzar el formato.

**Exploración:** comenzar por pocos parámetros y cambios controlados (por ejemplo, cuadrícula de desplazamientos X/Y). En pasadas posteriores variar tamaño de fuente, ancho o interlineado. La selección de parámetros, amplitud de los pasos, orden y número de rondas corresponde al agente según el caso; **3×3 es una heurística, no un dogma**. No cambiar demasiadas propiedades simultáneamente si eso impide interpretar qué mejoró.

**Salida de la prueba:** guardar la contact sheet, un pequeño manifiesto con los nueve valores ensayados y la opción elegida, más una captura del ganador a resolución suficiente. Aplicar el ganador a `post.html` **solo después** de seleccionarlo; los candidatos intermedios no deben sobrescribir el documento real ni los cambios manuales.

**Evaluación empírica:** comparar al menos (a) edición directa con una sola captura, (b) 3×3 con referencia + candidato, (c) 3×3 con contexto local pertinente. Registrar calidad del ajuste, cantidad de iteraciones, tiempo, imágenes consultadas y uso de tokens/contexto **solo si puede medirse**. Pedir intervención humana si varias opciones parecen equivalentes o la referencia es ambigua. El modelo puede cambiar el método si demuestra funcionar mejor. No declarar ahorros de tokens o precisión sin medirlos.

**Criterio de éxito:** se obtiene un ajuste visualmente más cercano —o de calidad comparable con menos esfuerzo— sin alterar los demás elementos. Si la técnica no aporta valor en pruebas reales, se mantiene opcional o se descarta; no bloquea el MVP.

### Después, solamente si se valida la necesidad

Carruseles, proyectos/marcas, bibliotecas de componentes, generación por IA, exportación PSD (experimentar con Photopea / herramientas PSD), etc. **Fuera de alcance actual.**

## Criterios de aceptación del spike

- [ ] `post.html` permanece siendo la única fuente de verdad de la composición.
- [ ] La app abre un lienzo 1080×1350 y selecciona el título.
- [ ] El título se mueve fluidamente, sin escribir en disco durante el drag.
- [ ] Al soltar, el servidor guarda exactamente una operación y muestra confirmación real.
- [ ] Al recargar, el elemento mantiene sus coordenadas.
- [ ] El HTML resultante funciona por sí solo, sin cargar el editor.
- [ ] El guardado no inserta controles del editor ni reformatea otras partes del HTML.
- [ ] Las diferencias entre macOS y Windows están resueltas o documentadas.
- [ ] Se puede mostrar una demo concreta y esperar aprobación antes de avanzar.

## Primer mensaje sugerido al agente

> Implementá **únicamente la fase 0** de `Layout_Studio_MVP_Minimo.md`. Quiero un experimento mínimo con `post.html` autocontenido y geometría inline, un editor visual local que permita mover un elemento y guarde sus coordenadas en ese mismo HTML **al soltar el mouse**. No crees JSON, motor de diseño, workspaces, generador de IA ni exportación PSD. Hacé una demo verificable, explicá cómo ejecutarla en macOS y Windows, y detenete para mi aprobación.
