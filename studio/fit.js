// Herramienta para agentes: ajusta un texto de post.html a cómo se ve en la referencia.
//
//   npm run fit -- demo/ejemplo titulo            → analiza y propone (no escribe)
//   npm run fit -- demo/ejemplo titulo --apply    → escribe la mejor variante en post.html
//
// Mide cada línea (alto, ancho, posición) en la referencia y en el render, y compara dos variantes:
//   · "ancho": sólo font-size, para igualar el ancho
//   · "alto + escala horizontal": font-size para igualar el alto y `scale: X 1` para el ancho
// Las posiciona y afina el interlineado por superposición de píxeles (IoU) y elige la mejor.
// Siempre genera una hoja con recortes (referencia / actual / propuesta) para revisarla a ojo.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './export.js';
import { patchElementStyle } from './style-patch.js';
import { findImage, projectDirOrExit } from './projects.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

// Se instala en la página: máscaras, líneas e IoU sobre el lienzo (W×H en px del diseño).
function setupPage({ refSrc, id }) {
  const canvas = document.querySelector('.canvas'), W = canvas.offsetWidth, H = canvas.offsetHeight;
  const el = document.getElementById(id);
  window.FIT = { W, H, original: el.getAttribute('style') ?? '' };
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onerror = fail;
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), s = Math.max(W / img.width, H / img.height);
      x.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      FIT.ref = x.getImageData(0, 0, W, H).data;
      FIT.refUrl = c.toDataURL('image/png');
      // Colores del texto (el elemento y sus hijos con texto propio), para buscarlo en la referencia.
      const colors = new Set();
      for (const n of [el, ...el.querySelectorAll('*')]) {
        if ([...n.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim())) colors.add(getComputedStyle(n).color);
      }
      FIT.colors = [...colors].map((c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number));
      // Zona de búsqueda: la caja actual con margen generoso (el punto de partida puede estar lejos).
      const r = el.getBoundingClientRect(), o = canvas.getBoundingClientRect(), pad = Math.max(60, r.width * 0.15, r.height * 0.3);
      FIT.region = { x0: Math.max(0, Math.floor(r.left - o.left - pad)), y0: Math.max(0, Math.floor(r.top - o.top - pad)),
        x1: Math.min(W, Math.ceil(r.right - o.left + pad)), y1: Math.min(H, Math.ceil(r.bottom - o.top + pad)) };
      // Zonas de otros elementos editables dentro de la zona de búsqueda: se excluyen de ambas máscaras
      // (p. ej. el subtítulo amarillo arriba del titular, o un sello del mismo color al lado).
      // Con 10 px de margen: en la referencia ese otro elemento puede estar unos px corrido respecto del nuestro.
      const Rg = FIT.region, M = 10;
      FIT.exclude = [...document.querySelectorAll('[data-editable="true"]')].filter((e) => e !== el && !e.contains(el))
        .map((e) => { const b = e.getBoundingClientRect(); return [b.left - o.left - M, b.top - o.top - M, b.right - o.left + M, b.bottom - o.top + M]; })
        .filter(([a, b, c, d]) => c > Rg.x0 && a < Rg.x1 && d > Rg.y0 && b < Rg.y1)
        // no excluir lo que contiene al texto (un marco o fondo, p. ej. los minutos dentro del reloj)
        .filter(([a, b, c, d]) => !(a <= r.left - o.left && b <= r.top - o.top && c >= r.right - o.left && d >= r.bottom - o.top));
      const inExcl = (x, y) => FIT.exclude.some(([a, b, c, d]) => x >= a && x < c && y >= b && y < d);
      const R = FIT.region, D = FIT.ref;
      FIT.refMask = new Uint8Array(W * H);
      for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
        if (inExcl(x, y)) continue;
        const i = (y * W + x) * 4;
        if (FIT.colors.some(([r, g, b]) => (D[i] - r) ** 2 + (D[i + 1] - g) ** 2 + (D[i + 2] - b) ** 2 < 55 ** 2)) FIT.refMask[y * W + x] = 1;
      }
      FIT.inExcl = inExcl;
      // Líneas de texto por perfil de filas. En los extremos de cada línea se recortan las filas cuya tinta
      // abarca menos del 20 % del ancho de la línea (una tilde pegada a la línea de arriba), y se descartan
      // "líneas" mínimas (una tilde suelta). Ascendentes/descendentes repartidos a lo ancho se conservan.
      FIT.lines = (m) => {
        const min = Math.max(3, Math.round((R.x1 - R.x0) * 0.01)), rows = [];
        for (let y = R.y0; y < R.y1; y++) {
          let n = 0, a = 1e9, z = -1;
          for (let x = R.x0; x < R.x1; x++) if (m[y * W + x]) { n++; if (x < a) a = x; if (x > z) z = x; }
          rows.push({ y, n, a, z });
        }
        const spans = []; let cur = null;
        for (const r of rows) { if (r.n > min) (cur ??= (spans.push([]), spans[spans.length - 1])).push(r); else cur = null; }
        const peak = Math.max(0, ...spans.map((s) => Math.max(...s.map((r) => r.n))));
        return spans.map((s) => {
          const p = Math.max(...s.map((r) => r.n));
          if (p < 0.25 * peak) return null;
          const span = Math.max(...s.map((r) => r.z)) - Math.min(...s.map((r) => r.a));
          const wide = (r) => r.z - r.a >= 0.2 * span;
          const first = s.findIndex(wide), last = s.length - 1 - [...s].reverse().findIndex(wide);
          const t = s.slice(first, last + 1), x0 = Math.min(...t.map((r) => r.a)), x1 = Math.max(...t.map((r) => r.z));
          return { top: t[0].y, h: t.length, x0, w: x1 - x0 + 1 };
        }).filter((l) => l && l.h >= 6);
      };
      FIT.iou = (m) => {
        let i = 0, u = 0;
        for (let y = R.y0; y < R.y1; y++) for (let x = R.x0; x < R.x1; x++) {
          const k = y * W + x, a = m[k] && !inExcl(x, y), b = FIT.refMask[k];
          if (a || b) { u++; if (a && b) i++; }
        }
        return u ? i / u : 0;
      };
      FIT.refLines = FIT.lines(FIT.refMask);
      ok({ W, H, region: R, colors: FIT.colors, refLines: FIT.refLines });
    };
    img.src = refSrc;
  });
}

// Filtra la máscara de la referencia: conserva las componentes conexas que tocan la tinta actual del
// elemento dilatada D px (FIT.cand debe venir de un trialMask con el estado actual).
function keepNearText(D) {
  const { W, region: R, cand, refMask } = FIT;
  const rw = R.x1 - R.x0, rh = R.y1 - R.y0;
  // Dilatación con suma acumulada 2D: "hay tinta a ≤ D px".
  const S = new Int32Array((rw + 1) * (rh + 1));
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    S[(y + 1) * (rw + 1) + x + 1] = cand[(y + R.y0) * W + x + R.x0] + S[y * (rw + 1) + x + 1] + S[(y + 1) * (rw + 1) + x] - S[y * (rw + 1) + x];
  }
  const near = (x, y) => {
    const a = Math.max(0, x - D), b = Math.max(0, y - D), c = Math.min(rw, x + D + 1), d = Math.min(rh, y + D + 1);
    return S[d * (rw + 1) + c] - S[b * (rw + 1) + c] - S[d * (rw + 1) + a] + S[b * (rw + 1) + a] > 0;
  };
  const seen = new Uint8Array(rw * rh), keep = new Uint8Array(refMask.length);
  for (let y0 = 0; y0 < rh; y0++) for (let x0 = 0; x0 < rw; x0++) {
    if (seen[y0 * rw + x0] || !refMask[(y0 + R.y0) * W + x0 + R.x0]) continue;
    const stack = [[x0, y0]], comp = []; let touches = false;
    seen[y0 * rw + x0] = 1;
    while (stack.length) {
      const [x, y] = stack.pop(); comp.push(x, y);
      if (!touches && near(x, y)) touches = true;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < rw && ny < rh && !seen[ny * rw + nx] && refMask[(ny + R.y0) * W + nx + R.x0]) { seen[ny * rw + nx] = 1; stack.push([nx, ny]); }
      }
    }
    if (touches) for (let k = 0; k < comp.length; k += 2) keep[(comp[k + 1] + R.y0) * W + comp[k] + R.x0] = 1;
  }
  FIT.refMask = keep;
  FIT.refLines = FIT.lines(keep);
  return FIT.refLines;
}

// Aplica estilos de prueba al elemento (sobre su style original) y deja visible sólo a él, sin sombra.
function applyTrial([id, styles, solo]) {
  const el = document.getElementById(id);
  el.setAttribute('style', FIT.original);
  for (const [k, v] of Object.entries(styles)) v === null ? el.style.removeProperty(k) : el.style.setProperty(k, v);
  for (const e of document.querySelectorAll('.canvas > *')) e.style.visibility = solo && e !== el ? 'hidden' : '';
  if (solo) el.style.textShadow = 'none';
  // en modo "solo" el lienzo no debe aportar tinta (puede tener background propio)
  for (const e of [document.documentElement, document.body, document.querySelector('.canvas')]) e.style.background = solo ? 'transparent' : '';
}

async function trialMask(page, id, styles) {
  await page.evaluate(applyTrial, [id, styles, true]);
  const buf = await page.locator('.canvas').first().screenshot({ omitBackground: true, type: 'png' });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = FIT.W; c.height = FIT.H;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, FIT.W, FIT.H).data, m = new Uint8Array(FIT.W * FIT.H);
    for (let k = 0; k < m.length; k++) m[k] = d[k * 4 + 3] > 128 ? 1 : 0;
    FIT.cand = m;
    return { lines: FIT.lines(m), iou: FIT.iou(m) };
  }, buf.toString('base64'));
}

export async function fitText(projectDir, id, { sheet } = {}) {
  const names = await fs.readdir(projectDir);
  const refFile = findImage(names, 'referencia');
  if (!refFile) throw new Error('No hay imagen de referencia (referencia.png en la carpeta del post)');
  const file = path.join(projectDir, 'post.html');
  const html = await fs.readFile(file, 'utf8');
  const refSrc = `data:${MIME[path.extname(refFile).toLowerCase()]};base64,${(await fs.readFile(path.join(projectDir, refFile))).toString('base64')}`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    const base = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const [sx = 1] = cs.scale && cs.scale !== 'none' ? cs.scale.split(/\s+/).map(Number) : [];
      return {
        text: !['IMG', 'svg'].includes(el.tagName) && !el.querySelector('img, svg') && el.textContent.trim() !== '',
        fs: parseFloat(cs.fontSize), lh: cs.lineHeight === 'normal' ? 1.2 : parseFloat(cs.lineHeight) / parseFloat(cs.fontSize),
        left: parseFloat(cs.left), top: parseFloat(cs.top), sx, inline: { scale: el.style.scale || null, origin: el.style.transformOrigin || null },
      };
    }, id);
    if (!base) throw new Error(`no existe #${id}`);
    if (!base.text) throw new Error(`#${id} no es un texto (para imágenes usá npm run boxes)`);
    const info = await page.evaluate(setupPage, { refSrc, id });
    if (!info.refLines.length) throw new Error('no se encontró el texto en la referencia (¿otro color o fuera de la zona?)');

    // Quedarse sólo con las manchas de la referencia cercanas a nuestro texto ya ubicado: la foto puede tener
    // zonas del mismo color (un suéter blanco, brillos) que se pegarían a una línea y la inflarían.
    await trialMask(page, id, {});
    info.refLines = await page.evaluate(keepNearText, 24);
    if (!info.refLines.length) throw new Error('no se encontró el texto en la referencia cerca de su posición actual (ubicarlo antes con npm run boxes)');
    const current = await trialMask(page, id, {});
    // Comparar la línea más ancha (la medida más estable); si la cantidad de líneas no coincide, el bloque entero.
    const union = (L) => [{ top: Math.min(...L.map((l) => l.top)), h: Math.max(...L.map((l) => l.top + l.h)) - Math.min(...L.map((l) => l.top)),
      x0: Math.min(...L.map((l) => l.x0)), w: Math.max(...L.map((l) => l.x0 + l.w)) - Math.min(...L.map((l) => l.x0)) }];
    const same = current.lines.length === info.refLines.length;
    const refL = same ? info.refLines : union(info.refLines), curL = same ? current.lines : union(current.lines);
    const k = curL.reduce((best, l, i) => (l.w > curL[best].w ? i : best), 0);
    const kh = refL[k].h / curL[k].h, kw = refL[k].w / curL[k].w;
    const pitch = same && refL.length > 1 ? (refL[refL.length - 1].top - refL[0].top) / (refL.length - 1) : null;

    const round = (n, step) => Math.round(n / step) * step;
    const variants = [
      { name: 'ancho', fs: base.fs * kw, sx: base.sx },
      { name: 'alto + escala horizontal', fs: base.fs * kh, sx: Math.min(1.2, Math.max(0.5, base.sx * kw / kh)) },
    ];
    const styleFor = (v, left, top, lh) => ({
      'font-size': `${round(v.fs, 0.5)}px`, 'line-height': String(+lh.toFixed(3)), left: `${Math.round(left)}px`, top: `${Math.round(top)}px`,
      scale: Math.abs(v.sx - 1) < 0.005 ? null : `${round(v.sx, 0.01).toFixed(2).replace(/0$/, '')} 1`,
      'transform-origin': Math.abs(v.sx - 1) < 0.005 ? null : '0 0',
    });
    const results = [{ name: 'actual', iou: current.iou, lines: current.lines, style: null }];
    for (const v of variants) {
      let lh = pitch ? pitch / round(v.fs, 0.5) : base.lh;
      const first = await trialMask(page, id, styleFor(v, base.left, base.top, lh));
      if (!first.lines.length) continue;
      const fl = same ? first.lines : union(first.lines);
      const left0 = base.left + refL[0].x0 - fl[0].x0, top0 = base.top + refL[0].top - fl[0].top;
      let best = null;
      for (const dlh of pitch ? [-0.03, -0.015, 0, 0.015, 0.03] : [0]) for (const dy of [-2, 0, 2]) for (const dx of [-2, 0, 2]) {
        const style = styleFor(v, left0 + dx, top0 + dy, lh + dlh);
        const r = await trialMask(page, id, style);
        if (!best || r.iou > best.iou) best = { name: v.name, iou: r.iou, lines: r.lines, style };
      }
      results.push(best);
    }
    const winner = results.reduce((a, b) => (b.iou > a.iou ? b : a));

    // Hoja de recortes con colores reales: referencia / actual / propuesta.
    const R = info.region, clip = { x: R.x0, y: R.y0, width: R.x1 - R.x0, height: R.y1 - R.y0 };
    const crops = [];
    await page.evaluate(applyTrial, [id, {}, false]);
    crops.push(['actual', (await page.locator('.canvas').first().screenshot({ clip: undefined })).toString('base64')]);
    if (winner.style) { await page.evaluate(applyTrial, [id, winner.style, false]); crops.push([`propuesta: ${winner.name}`, (await page.locator('.canvas').first().screenshot()).toString('base64')]); }
    const sheetPath = sheet ?? path.join(os.tmpdir(), `layout-studio-fit-${path.basename(path.dirname(path.dirname(projectDir)))}-${path.basename(projectDir)}-${id}.png`);
    const sheetPage = await browser.newPage({ viewport: { width: Math.min(1600, clip.width * 2) + 20, height: 200 } });
    const scale = Math.min(2, 1600 / clip.width);
    const cell = (label, src) => `<div style="position:relative;width:${clip.width * scale}px;height:${clip.height * scale}px;overflow:hidden;margin-bottom:8px">
      <img src="${src}" style="position:absolute;left:${-clip.x * scale}px;top:${-clip.y * scale}px;width:${info.W * scale}px">
      <span style="position:absolute;left:6px;top:4px;background:#000b;color:#fff;padding:2px 6px;font:600 14px sans-serif">${label}</span></div>`;
    const refUrl = await page.evaluate(() => FIT.refUrl);
    await sheetPage.setContent(`<body style="margin:0;padding:10px;background:#111">${cell('referencia', refUrl)}${crops.map(([n, b64]) => cell(n, 'data:image/png;base64,' + b64)).join('')}</body>`);
    await sheetPage.screenshot({ path: sheetPath, fullPage: true });

    return { refLines: info.refLines, results, winner, sheetPath, html: winner.style ? patchElementStyle(html, id, winner.style) : html };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [project, id, ...flags] = process.argv.slice(2);
  const dir = projectDirOrExit(id ? project : null, 'Uso: npm run fit -- <proyecto> <id> [--apply]');
  const r = await fitText(dir, id);
  const fmt = (L) => L.map((l) => `${l.top}/${l.h}/${l.w}`).join('  ');
  console.log(`#${id} — líneas como top/alto/ancho (px del diseño)`);
  console.log(`  referencia                 ${fmt(r.refLines)}`);
  for (const v of r.results) console.log(`  ${v.name.padEnd(26)} IoU ${v.iou.toFixed(3)}   ${fmt(v.lines)}`);
  console.log(`\nMejor: ${r.winner.name}${r.winner.style ? ' → ' + Object.entries(r.winner.style).map(([k, v]) => `${k}:${v ?? '(quitar)'}`).join(' ') : ''}`);
  console.log(`Hoja de recortes: ${r.sheetPath}`);
  if (flags.includes('--apply') && r.winner.style) {
    await fs.writeFile(path.join(dir, 'post.html'), r.html, 'utf8');
    console.log('Aplicado en post.html');
  }
}
