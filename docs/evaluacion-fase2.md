# Evaluación fase 2 — ajustes en lenguaje natural sobre el HTML

**Fecha:** 2026-10-09 · **Post base:** `la-manchega/probando-el-tuco`, un post de cliente (no incluido en el repo público), copiado a `eval-1`, `eval-2`, `eval-3`.

**Agente evaluado:** un agente de código Claude Code nuevo por pedido, sin ningún contexto de la conversación ni del proyecto (el rol es el mismo que tendría Codex: el flujo no depende de cuál se use). Recibió sólo la ruta del repo, el pedido literal y la consigna de no preguntar, no tocar otros archivos ni hacer commits, e informar archivos leídos, comandos y cambios. Las métricas de tokens/tiempo/acciones son las que reporta el entorno para cada agente.

## Resultados

| # | Pedido | Resultado | Acciones | Tiempo | Tokens | Archivos leídos |
|---|---|---|---|---|---|---|
| 1 | "Subí el título 20 px y achicá un poco el subtítulo: que la letra mida unos 28 px." | ✔ `top:251→231`, `font-size:31→28`. Además subió el subrayado 20 px para que no quedara despegado (lo informó y explicó cómo revertirlo). | 13 | 45 s | 38,9 k | README.md, post.html, post.png |
| 2 | "Cambiá el título por 'CUARTA VEZ / PROBANDO / EL TUCO'. Que siga viéndose como ahora." | ✔ Cambió el texto y, como "CUARTA VEZ" es más corta, agregó escala horizontal a la línea 1 (`.titulo .l1 { scale: 1.087 1 }`) para mantener el bloque justificado, con el mismo mecanismo que ya usaban las líneas 2 y 3. | 17 | 66 s | 44,3 k | post.html, README.md, package.json, post.png |
| 3 | "El subrayado amarillo hacelo blanco y un poco más corto, que termine donde termina la palabra TUCO." | ✔ Blanco con una regla propia del post; detectó que el pedido era contradictorio (el trazo ya terminaba antes que TUCO), priorizó "que termine en TUCO" y lo explicó. Estiró el SVG con `preserveAspectRatio="none"`. | 16 | 85 s | 39,9 k | package.json, export.js, post.html, referencia.png |

Los tres cambios se verificaron con `diff` contra el original y exportando a PNG: todos correctos, sin tocar otros elementos ni otros archivos.

## Observaciones

- **Contexto mínimo:** a los tres les alcanzó con el `post.html` del post (más el README o `package.json` para encontrar el comando de exportar). Ninguno necesitó leer el código del editor ni de las herramientas: la regla "un HTML por post, geometría inline, ids por función" funciona.
- **Criterio de diseño:** los agentes infirieron intenciones no dichas (mover el subrayado con el título, mantener el bloque justificado) y las informaron. Conviene que el pedido diga explícitamente si algo debe quedar fijo.
- **Verificación visual:** los tres exportaron y miraron el PNG antes de terminar. Uno escribió su propio script de medición en vez de usar `npm run export` / `npm run fit`; documentar mejor en el README cuándo usar `fit` podría ahorrar pasos.
- **Costo:** ~13–17 acciones, ~40 k tokens y 45–85 s por ajuste simple. La mayor parte se va en orientarse y verificar, no en editar (2–4 ediciones por pedido).

## Pendiente

- Experimento de refinamiento 3×3 (PRD, fase 2) — no se hizo: `npm run fit` resolvió los casos difíciles de los dos posts reales con una métrica objetiva (IoU) y hoja de recortes, que cumple la misma función.
