// Herramienta para agentes: lee la imagen de cajas del post (cajas.png: la referencia con rectángulos de
// colores dibujados alrededor de cada elemento) y arma una primera pasada.
//
//   npm run boxes -- demo/ejemplo                            → lista las cajas en px del diseño
//   npm run boxes -- demo/ejemplo --apply titulo=verde ...   → ajusta y centra cada elemento en su caja
//
// No genera ningún archivo de datos: las cajas se imprimen y, con --apply, se escriben como estilos
// inline en post.html (mismo parche seguro que usa el editor).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchBrowser } from './export.js';
import { patchElementStyle } from './style-patch.js';
import { findImage, projectDirOrExit } from './projects.js';

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const dataUrl = async (file) => `data:${MIME[path.extname(file).toLowerCase()]};base64,${(await fs.readFile(file)).toString('base64')}`;

// Corre en el navegador. Devuelve TODAS las cajas: cada rectángulo es una componente conexa de píxeles
// de un mismo tono saturado que no están en la referencia, cuyo contorno recorre los cuatro lados
// de su envolvente. Varias cajas pueden compartir color si están separadas.
function detectInPage({ boxesSrc, refSrc }) {
  const load = (src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  const pixels = (img) => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data;
  };
  return Promise.all([load(boxesSrc), refSrc ? load(refSrc) : null]).then(([boxes, ref]) => {
    const W = boxes.width, H = boxes.height, X = pixels(boxes), R = ref && ref.width === W && ref.height === H ? pixels(ref) : null;
    const HUES = [['rojo', 345, 15], ['naranja', 15, 42], ['amarillo', 42, 75], ['verde', 75, 165], ['cian', 165, 205], ['azul', 205, 255], ['violeta', 255, 300], ['magenta', 300, 345]];
    const label = new Int8Array(W * H).fill(-1);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4, r = X[i] / 255, g = X[i + 1] / 255, b = X[i + 2] / 255;
      if (R && Math.abs(X[i] - R[i]) + Math.abs(X[i + 1] - R[i + 1]) + Math.abs(X[i + 2] - R[i + 2]) < 120) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (max < 0.55 || d / max < 0.6) continue; // sólo colores vivos
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      label[p] = HUES.findIndex(([, a, z]) => (a < z ? h >= a && h < z : h >= a || h < z));
    }
    // Componentes conexas por tono. Vecindad de radio 6: une cortes de hasta ~5 px, p. ej. donde la línea
    // de otra caja (de otro color, con antialiasing) cruza el contorno.
    const RAD = 6, seen = new Uint8Array(W * H), result = [];
    for (let p0 = 0; p0 < W * H; p0++) {
      const j = label[p0];
      if (j < 0 || seen[p0]) continue;
      const stack = [p0], pts = [];
      seen[p0] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % W, y = (p - x) / W;
        pts.push(p);
        for (let dy = -RAD; dy <= RAD; dy++) for (let dx = -RAD; dx <= RAD; dx++) {
          const nx = x + dx, ny = y + dy, q = ny * W + nx;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && !seen[q] && label[q] === j) { seen[q] = 1; stack.push(q); }
        }
      }
      if (pts.length < 40) continue;
      let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
      for (const p of pts) { const x = p % W, y = (p - x) / W; if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      const w = bx1 - bx0 + 1, h = by1 - by0 + 1;
      if (w < 12 || h < 12) continue;
      // El rectángulo sale de sus bordes: filas y columnas con un tramo recto largo (≥50 % del lado,
      // tolerando cortes de RAD px). Texto o ruido pegados al contorno no forman tramos así.
      const bm = new Uint8Array(w * h);
      for (const p of pts) { const x = p % W, y = (p - x) / W; bm[(y - by0) * w + (x - bx0)] = 1; }
      const longestRun = (get, n) => { let best = 0, run = 0, gap = 0;
        for (let k = 0; k < n; k++) { if (get(k)) { run += gap + 1; gap = 0; } else if (run && gap < RAD) gap++; else { run = 0; gap = 0; } if (run > best) best = run; }
        return best; };
      const rows = [], cols = [];
      for (let y = 0; y < h; y++) { const r = longestRun((x) => bm[y * w + x], w); if (r >= 0.5 * w) rows.push([y, r / w]); }
      for (let x = 0; x < w; x++) { const r = longestRun((y) => bm[y * w + x], h); if (r >= 0.5 * h) cols.push([x, r / h]); }
      if (rows.length < 2 || cols.length < 2) continue;
      const top = rows[0], bottom = rows[rows.length - 1], left = cols[0], right = cols[cols.length - 1];
      if (bottom[0] - top[0] < 10 || right[0] - left[0] < 10) continue;
      const cover = Math.min(top[1], bottom[1], left[1], right[1]);
      result.push({ color: HUES[j][0], x0: bx0 + left[0], y0: by0 + top[0], x1: bx0 + right[0] + 1, y1: by0 + bottom[0] + 1, ok: cover >= 0.6 });
    }
    return { width: W, height: H, boxes: result };
  });
}

// Tinta visible de un elemento (px del diseño): se renderiza solo, sin sombras, y se buscan los píxeles opacos.
export async function inkBox(page, id) {
  await page.evaluate((id) => {
    for (const el of document.querySelectorAll('.canvas > *')) el.style.visibility = el.id === id ? '' : 'hidden';
    const el = document.getElementById(id);
    el.style.textShadow = 'none'; el.style.filter = 'none';
    return null;
  }, id);
  const buffer = await page.locator('.canvas').first().screenshot({ omitBackground: true, type: 'png' });
  return page.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  }, buffer.toString('base64'));
}

export async function detectBoxes(projectDir) {
  const names = await fs.readdir(projectDir);
  const boxesFile = findImage(names, 'cajas');
  if (!boxesFile) throw new Error('No hay imagen de cajas (cajas.png en la carpeta del post)');
  const refFile = findImage(names, 'referencia');
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(projectDir, 'post.html')).href);
    const canvas = await page.evaluate(() => { const c = document.querySelector('.canvas'); return { w: c.offsetWidth, h: c.offsetHeight }; });
    const refSrc = refFile ? await dataUrl(path.join(projectDir, refFile)) : null;
    const raw = await page.evaluate(detectInPage, { boxesSrc: await dataUrl(path.join(projectDir, boxesFile)), refSrc });
    // La imagen se mapea al lienzo como el fondo (object-fit: cover, centrada).
    const s = Math.max(canvas.w / raw.width, canvas.h / raw.height);
    const ox = (canvas.w - raw.width * s) / 2, oy = (canvas.h - raw.height * s) / 2;
    // Orden de lectura (arriba→abajo, izquierda→derecha). Nombre: color, y si se repite color-2, color-3…
    const sorted = raw.boxes.sort((a, b) => (Math.abs(a.y0 - b.y0) > 20 ? a.y0 - b.y0 : a.x0 - b.x0));
    const count = {};
    const boxes = sorted.map((b, i) => {
      count[b.color] = (count[b.color] ?? 0) + 1;
      return {
        n: i + 1, name: count[b.color] === 1 ? b.color : `${b.color}-${count[b.color]}`, color: b.color, ok: b.ok,
        x: Math.round(b.x0 * s + ox), y: Math.round(b.y0 * s + oy),
        w: Math.round((b.x1 - b.x0) * s), h: Math.round((b.y1 - b.y0) * s),
        src: { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 },
      };
    });
    // Hoja para asociar cada caja con su elemento: el recorte de la referencia dentro de cada caja, rotulado.
    const sheetPath = path.join(os.tmpdir(), `layout-studio-cajas-${path.basename(path.dirname(path.dirname(projectDir)))}-${path.basename(projectDir)}.png`);
    const sheet = await browser.newPage({ viewport: { width: 1000, height: 200 } });
    const src = refSrc ?? await dataUrl(path.join(projectDir, boxesFile));
    await sheet.setContent(`<body style="margin:0;padding:12px;background:#111;font:600 14px sans-serif;color:#fff;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;width:976px">
      ${boxes.map((b) => {
        const k = Math.min(1, 460 / b.src.w, 220 / b.src.h); // recortes de hasta 460×220 px
        return `<figure style="margin:0"><figcaption style="margin-bottom:4px">${b.n} · ${b.name} · ${b.x},${b.y} ${b.w}×${b.h}</figcaption>
          <div style="width:${b.src.w * k}px;height:${b.src.h * k}px;overflow:hidden;position:relative;outline:2px solid #fff3">
          <img src="${src}" style="position:absolute;left:${-b.src.x * k}px;top:${-b.src.y * k}px;width:${raw.width * k}px"></div></figure>`;
      }).join('')}</body>`);
    await sheet.screenshot({ path: sheetPath, fullPage: true });
    return { boxesFile, refFile, scale: s, canvas, boxes, sheetPath };
  } finally {
    await browser.close();
  }
}

// Primera pasada: escala cada elemento para que su tinta entre en la caja (contain) y la centra.
// Textos → font-size; resto → width (y height si está inline). Devuelve el HTML nuevo y un informe.
// inset: margen que se descuenta de cada lado de la caja (ChatGPT dibuja las cajas con algo de aire).
// Con el prompt de prompts/cajas-chatgpt.md (cajas ajustadas) el mejor valor medido fue 4–6 px
// (medido en un post real, error medio ~3.4 px). Con cajas holgadas convenía ~14.
export const DEFAULT_INSET = 5;
export async function applyBoxes(projectDir, mapping, boxes, { inset = DEFAULT_INSET } = {}) {
  const file = path.join(projectDir, 'post.html');
  let html = await fs.readFile(file, 'utf8');
  const browser = await launchBrowser();
  const report = [];
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    for (const [id, ref] of mapping) {
      // La caja se elige por nombre (verde, verde-2) o por número (3).
      const box = boxes.find((b) => b.name === ref || String(b.n) === ref);
      if (!box) { report.push(`#${id}: no hay caja "${ref}"`); continue; }
      const color = box.name;
      const T = { x: box.x + inset, y: box.y + inset, w: box.w - 2 * inset, h: box.h - 2 * inset };
      const info = await page.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const text = !['IMG', 'svg'].includes(el.tagName) && !el.querySelector('img, svg') && el.textContent.trim() !== '';
        return { text, fs: parseFloat(cs.fontSize), w: parseFloat(cs.width), h: parseFloat(cs.height), hasH: !!el.style.height, left: parseFloat(cs.left), top: parseFloat(cs.top) };
      }, id);
      if (!info) { report.push(`#${id}: no existe`); continue; }
      const changes = {};
      // Dos iteraciones de escala (el tamaño de la tinta de un texto no es exactamente lineal).
      for (let k = 0; k < 2; k++) {
        const ink = await inkBox(page, id);
        if (!ink) break;
        const s = Math.min(T.w / (ink.x1 - ink.x0), T.h / (ink.y1 - ink.y0));
        const cur = await page.evaluate((id) => { const cs = getComputedStyle(document.getElementById(id)); return { fs: parseFloat(cs.fontSize), w: parseFloat(cs.width), h: parseFloat(cs.height) }; }, id);
        if (info.text) changes['font-size'] = `${Math.round(cur.fs * s * 2) / 2}px`;
        else { changes.width = `${Math.round(cur.w * s)}px`; if (info.hasH) changes.height = `${Math.round(cur.h * s)}px`; }
        await page.evaluate(([id, ch]) => { const el = document.getElementById(id); for (const [p, v] of Object.entries(ch)) el.style.setProperty(p, v); }, [id, changes]);
      }
      // Centrar la tinta en la caja.
      const ink = await inkBox(page, id);
      const pos = await page.evaluate((id) => { const cs = getComputedStyle(document.getElementById(id)); return { left: parseFloat(cs.left), top: parseFloat(cs.top) }; }, id);
      changes.left = `${Math.round(pos.left + (T.x + T.w / 2) - (ink.x0 + ink.x1) / 2)}px`;
      changes.top = `${Math.round(pos.top + (T.y + T.h / 2) - (ink.y0 + ink.y1) / 2)}px`;
      await page.evaluate(([id, ch]) => { const el = document.getElementById(id); for (const [p, v] of Object.entries(ch)) el.style.setProperty(p, v); }, [id, changes]);
      html = patchElementStyle(html, id, changes);
      report.push(`#${id} ← ${color}: ${Object.entries(changes).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    }
  } finally {
    await browser.close();
  }
  return { html, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [project, ...rest] = process.argv.slice(2);
  const dir = projectDirOrExit(project, 'Uso: npm run boxes -- <proyecto> [--apply id=caja ...] [--inset N]   (caja = nombre o número)');
  const { boxesFile, scale, canvas, boxes, sheetPath } = await detectBoxes(dir);
  console.log(`${project}/${boxesFile} → lienzo ${canvas.w}×${canvas.h} (escala ${scale.toFixed(4)}), ${boxes.length} cajas`);
  for (const b of boxes) console.log(`  ${String(b.n).padStart(2)}  ${b.name.padEnd(11)} x ${String(b.x).padStart(4)}  y ${String(b.y).padStart(4)}  w ${String(b.w).padStart(4)}  h ${String(b.h).padStart(4)}${b.ok ? '' : '   ⚠ borde tapado en parte, revisar'}`);
  console.log(`Qué hay en cada caja: ${sheetPath}`);
  if (rest[0] === '--apply') {
    const insetAt = rest.indexOf('--inset');
    const inset = insetAt > 0 ? Number(rest[insetAt + 1]) : DEFAULT_INSET;
    const mapping = rest.slice(1).filter((a, i, all) => a.includes('=') && all[i - 1] !== '--inset').map((a) => a.split('='));
    const { html, report } = await applyBoxes(dir, mapping, boxes, { inset });
    await fs.writeFile(path.join(dir, 'post.html'), html, 'utf8');
    console.log('\nAplicado en post.html:\n  ' + report.join('\n  '));
  }
}
