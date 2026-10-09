// Exporta el post a PSD, organizado para el diseñador:
//   npm run psd -- demo/ejemplo   →  clientes/demo/posts/ejemplo/export/ejemplo.psd
//
// · Grupos: Cabecera / Textos / Gráficos (con subgrupos como Reloj), según data-grupo de cada elemento;
//   respaldos en un grupo oculto; Fondo abajo y bloqueado. Nombres legibles (data-nombre o el id) y,
//   en los textos, su contenido: "Título — PAPAS CROCANTES AL PIMENTÓN".
// · Imágenes, SVG y decoraciones → capas de píxeles exactas (cada elemento renderizado solo).
// · Textos → capa de TEXTO editable (fuente, tamaño, color, interlineado, escala horizontal por tramo,
//   inclinación y sombra como efecto) con los píxeles ya cargados, + una copia en píxeles oculta como
//   respaldo exacto. Photoshop pide "Actualizar" las capas de texto al abrir: al hacerlo las redibuja él
//   y pueden moverse unos px respecto del HTML; el respaldo conserva el resultado original.
// · Imagen compuesta = el mismo render que el PNG exportado.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writePsdBuffer } from 'ag-psd';
import { launchBrowser } from './export.js';
import { ROOT, projectDirOrExit, photopeaLink, exportPath } from './projects.js';

// Nombre PostScript (tabla "name", id 6) de un archivo .otf/.ttf: es como Photoshop identifica la fuente.
async function postScriptName(file) {
  const buf = await fs.readFile(file);
  const tables = buf.readUInt16BE(4);
  let name = -1;
  for (let i = 0, off = 12; i < tables; i++, off += 16) if (buf.toString('latin1', off, off + 4) === 'name') name = buf.readUInt32BE(off + 8);
  if (name < 0) return null;
  const count = buf.readUInt16BE(name + 2), strings = name + buf.readUInt16BE(name + 4);
  for (let i = 0; i < count; i++) {
    const r = name + 6 + i * 12, platform = buf.readUInt16BE(r), id = buf.readUInt16BE(r + 6);
    if (id !== 6) continue;
    const len = buf.readUInt16BE(r + 8), off = strings + buf.readUInt16BE(r + 10), raw = buf.subarray(off, off + len);
    return platform === 1 ? raw.toString('latin1') : Buffer.from(raw).swap16().toString('utf16le');
  }
  return null;
}

// @font-face del post → { "familia|peso": "NombrePostScript" }
async function fontNames(html, dir) {
  const out = {};
  for (const m of html.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const family = m[1].match(/font-family:\s*['"]?([^;'"]+)/)?.[1].trim();
    const weight = m[1].match(/font-weight:\s*(\d+)/)?.[1] ?? '400';
    const url = m[1].match(/url\(\s*['"]?([^'")]+)/)?.[1];
    if (!family || !url) continue;
    const ps = await postScriptName(path.resolve(dir, url)).catch(() => null);
    if (ps) { out[`${family}|${weight}`] = ps; (out.__files ??= []).push(path.resolve(dir, url)); }
  }
  return out;
}

// ---------- Funciones que corren en la página ----------

// Capas en orden de apilado (z-index, luego orden en el DOM), de abajo hacia arriba.
function listLayers() {
  return [...document.querySelector('.canvas').children].map((el, order) => {
    const cs = getComputedStyle(el);
    const text = !['IMG', 'svg'].includes(el.tagName) && !el.querySelector('img, svg') && el.textContent.trim() !== '';
    return { id: el.id || `${el.tagName.toLowerCase()}-${order}`, order, z: parseInt(cs.zIndex, 10) || 0, text,
      nombre: el.dataset.nombre || null, grupo: el.dataset.grupo || null, editable: el.dataset.editable === 'true' };
  }).sort((a, b) => a.z - b.z || a.order - b.order);
}

// Deja visible sólo el elemento `order` (con o sin sombra de texto) y el lienzo transparente.
function solo([order, shadow]) {
  const kids = [...document.querySelector('.canvas').children];
  kids.forEach((e, i) => { e.style.visibility = i === order ? '' : 'hidden'; });
  kids[order].style.textShadow = shadow ? '' : 'none';
  for (const e of [document.documentElement, document.body, document.querySelector('.canvas')]) e.style.background = 'transparent';
}

// PNG (base64) del lienzo → recorte a la tinta visible, como RGBA en base64.
async function cropToInk(b64) {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++) for (let X = 0; X < c.width; X++) {
    if (d[(y * c.width + X) * 4 + 3]) { if (X < x0) x0 = X; if (X > x1) x1 = X; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, px = x.getImageData(x0, y0, w, h).data;
  let bin = '';
  for (let i = 0; i < px.length; i += 0x8000) bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
  return { left: x0, top: y0, width: w, height: h, rgba: btoa(bin) };
}

// Datos de texto del elemento `order`: texto con saltos, tramos de estilo y posición de la 1.ª línea base.
function textData(order) {
  const el = document.querySelector('.canvas').children[order], canvas = document.querySelector('.canvas').getBoundingClientRect();
  const scaleOf = (node) => { const s = getComputedStyle(node).scale; return s && s !== 'none' ? Number(s.split(/\s+/)[0]) : 1; };
  const runs = [];
  const push = (chars, node) => {
    const cs = getComputedStyle(node);
    let hs = 1; for (let n = node; n && n !== el.parentElement; n = n.parentElement) hs *= scaleOf(n); // escala acumulada
    const color = cs.color.match(/[\d.]+/g).map(Number);
    const shadow = cs.textShadow !== 'none' ? cs.textShadow.match(/rgba?\(([^)]+)\)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/) : null;
    runs.push({ chars, family: cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim(), weight: cs.fontWeight, italic: cs.fontStyle !== 'normal',
      size: parseFloat(cs.fontSize), leading: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2, hs, color, shadow: shadow && shadow.slice(1).join('|') });
  };
  const walk = (node) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        let t = n.textContent.replace(/\s+/g, ' ');
        const tt = getComputedStyle(n.parentElement).textTransform;
        if (tt === 'uppercase') t = t.toUpperCase(); else if (tt === 'lowercase') t = t.toLowerCase();
        if (t) push(t, n.parentElement);
      } else if (n.nodeName === 'BR') push('\n', n.parentElement);
      else if (n.nodeType === 1) walk(n);
    }
  };
  walk(el);
  // Espacios colapsados como en el navegador: nada al inicio/fin ni pegado a un salto de línea.
  let all = runs.map((r) => r.chars).join('');
  const keep = [...all].map((ch, i) => !(ch === ' ' && (i === 0 || i === all.length - 1 || all[i - 1] === '\n' || all[i + 1] === '\n' || all[i - 1] === ' ')));
  let k = 0;
  for (const r of runs) { r.chars = [...r.chars].filter(() => keep[k++]).join(''); }
  // Línea base de cada renglón: un marcador inline-block vacío al principio de cada uno se apoya en ella.
  const marks = [el.firstChild, ...el.querySelectorAll('br')].map((at, i) => {
    const m = document.createElement('span');
    m.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    if (i === 0) el.insertBefore(m, at); else at.after(m);
    return m;
  });
  const baselines = marks.map((m) => m.getBoundingClientRect().top - canvas.top);
  marks.forEach((m) => m.remove());
  // Interlineado de Photoshop = distancia a la línea base anterior, por renglón (en CSS la manda la línea
  // del contenedor aunque el renglón tenga letra más chica; en Photoshop la mandan los caracteres del renglón).
  const leadingOf = (line) => (line > 0 ? baselines[line] - baselines[line - 1] : (baselines[1] - baselines[0]) || null);
  const split = [];
  let line = 0;
  for (const r of runs.filter((r) => r.chars)) {
    let buf = '';
    const flush = () => { if (buf) split.push({ ...r, chars: buf, leading: leadingOf(line) ?? r.leading }); buf = ''; };
    for (const ch of r.chars) { buf += ch; if (ch === '\n') { flush(); line++; } }
    flush();
  }
  const r = el.getBoundingClientRect();
  return { runs: split, x: r.left - canvas.left, baseline: baselines[0] };
}

// ---------- Armado del PSD ----------

const imageData = (l) => ({ width: l.width, height: l.height, data: new Uint8ClampedArray(Buffer.from(l.rgba, 'base64')) });

// ---------- Organización del PSD (grupos y nombres para el diseñador) ----------
// Nombre de capa: data-nombre del elemento, o su id legible ("reloj-minutos" → "Minutos"). Los textos
// llevan además su contenido, como los nombra Photoshop: "Título — PAPAS CROCANTES AL PIMENTÓN".
const NOMBRES = { titulo: 'Título', subtitulo: 'Subtítulo', usuario: 'Usuario', menu: 'Menú', logo: 'Logo', fondo: 'Fondo',
  reloj: 'Reloj', 'reloj-minutos': 'Minutos', sello: 'Sello', subrayado: 'Subrayado' };
const legible = (id) => NOMBRES[id] ?? id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
const recorte = (s, n = 34) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
// Grupo: data-grupo del elemento ("cabecera", "reloj"…); si no tiene, textos → "Textos" y el resto → "Gráficos".
const GRUPOS = { cabecera: { name: 'Cabecera', color: 'gray' }, textos: { name: 'Textos', color: 'yellow' }, graficos: { name: 'Gráficos', color: 'green' } };
const grupoDe = (l) => l.grupo ?? (l.text ? 'textos' : 'graficos');

// Arma el árbol de capas (de abajo hacia arriba): Fondo bloqueado, respaldos ocultos, y un grupo por
// data-grupo ordenado por apilado. Un grupo que no es de primer nivel (p. ej. "reloj") se anida dentro
// del grupo por defecto de sus elementos (Gráficos), como subcarpeta.
function organize(items) {
  const fondo = items.filter((i) => !i.editable && i.layer.name === 'Fondo');
  const rest = items.filter((i) => !fondo.includes(i));
  const top = new Map(); // grupo de primer nivel → [items o subgrupos]
  const subs = new Map();
  for (const it of rest) {
    const g = grupoDe(it.meta);
    if (GRUPOS[g]) { if (!top.has(g)) top.set(g, []); top.get(g).push(it); continue; }
    const parent = it.meta.text ? 'textos' : 'graficos';
    if (!subs.has(g)) { const sub = { sub: g, parent, members: [], rank: it.rank }; subs.set(g, sub); if (!top.has(parent)) top.set(parent, []); top.get(parent).push(sub); }
    const sub = subs.get(g); sub.members.push(it); sub.rank = Math.max(sub.rank, it.rank);
  }
  const rank = (x) => (x.sub ? x.rank : x.rank);
  const toLayer = (x) => x.sub
    ? { name: legible(x.sub), opened: true, children: x.members.sort((a, b) => a.rank - b.rank).map((m) => m.layer) }
    : x.layer;
  const groups = [...top].map(([g, members]) => ({ g, members, rank: Math.max(...members.map(rank)) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ g, members }) => ({ name: (GRUPOS[g] ?? { name: legible(g) }).name, layerColor: (GRUPOS[g] ?? {}).color ?? 'none', opened: true,
      children: members.sort((a, b) => rank(a) - rank(b)).map(toLayer) }));
  const backups = items.flatMap((i) => (i.backup ? [i.backup] : []));
  return [
    ...fondo.map((i) => ({ ...i.layer, protected: { transparency: true, composite: true, position: true } })),
    ...(backups.length ? [{ name: 'Respaldos en píxeles (no editar)', hidden: true, opened: false, children: backups }] : []),
    ...groups,
  ];
}

export async function buildPsd(projectDir) {
  const file = path.join(projectDir, 'post.html');
  const html = await fs.readFile(file, 'utf8');
  const fonts = await fontNames(html, projectDir);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
    const size = await page.evaluate(() => { const c = document.querySelector('.canvas'); return { width: c.offsetWidth, height: c.offsetHeight }; });
    await page.setViewportSize(size);
    const canvas = page.locator('.canvas').first();
    const composite = await page.evaluate(cropToInk, (await canvas.screenshot({ type: 'png' })).toString('base64'));

    const items = [], report = [];
    let rank = 0;
    for (const layer of await page.evaluate(listLayers)) {
      rank++;
      const nombre = layer.nombre ?? legible(layer.id);
      const shot = async (shadow) => {
        await page.evaluate(solo, [layer.order, shadow]);
        return page.evaluate(cropToInk, (await canvas.screenshot({ type: 'png', omitBackground: true })).toString('base64'));
      };
      const pixels = await shot(true);
      if (!pixels) continue;
      if (!layer.text) {
        items.push({ meta: layer, rank, layer: { name: nombre, left: pixels.left, top: pixels.top, imageData: imageData(pixels) } });
        report.push(`${nombre} (#${layer.id}): píxeles ${pixels.width}×${pixels.height} en ${pixels.left},${pixels.top}`);
        continue;
      }
      const t = await page.evaluate(textData, layer.order);
      const styleOf = (r) => ({
        // fuente exacta por familia+peso; si no (p. ej. una fuente variable con rango de pesos), la de esa familia
        font: { name: fonts[`${r.family}|${r.weight}`] ?? Object.entries(fonts).find(([k]) => k.startsWith(`${r.family}|`))?.[1] ?? r.family },
        fontSize: r.size, leading: r.leading, autoLeading: false,
        horizontalScale: +r.hs.toFixed(3), fauxItalic: r.italic,
        fillColor: { r: r.color[0], g: r.color[1], b: r.color[2] },
      });
      const first = t.runs[0];
      const sh = first.shadow?.split('|');
      const shadowEffect = sh && (() => {
        const [rgba, dx, dy, blur] = sh, c = rgba.split(',').map(Number);
        // Efecto completo: sin contorno (curva) ni los demás campos, Photopea no puede dibujar el documento.
        return { scale: 1, dropShadow: [{ enabled: true, present: true, showInDialog: true, blendMode: 'multiply',
          color: { r: c[0], g: c[1], b: c[2] }, opacity: c[3] ?? 1, angle: Math.round(Math.atan2(Number(dy), -Number(dx)) * 180 / Math.PI) || 90,
          useGlobalLight: false, distance: { units: 'Pixels', value: Math.hypot(Number(dx), Number(dy)) }, choke: { units: 'Pixels', value: 0 },
          size: { units: 'Pixels', value: Number(blur) }, noise: 0, antialiased: false, layerConceals: true,
          contour: { name: 'Linear', curve: [{ x: 0, y: 0 }, { x: 255, y: 255 }] } }] };
      })();
      const textPixels = await shot(false); // sin sombra: la sombra va como efecto de capa
      const contenido = t.runs.map((r) => r.chars).join('');
      const textName = `${nombre} — ${recorte(contenido.replace(/\s*\n\s*/g, ' '))}`;
      items.push({
        meta: layer, rank,
        // respaldo en píxeles: va al grupo "Respaldos" (oculto)
        backup: { name: `${textName} (píxeles)`, left: pixels.left, top: pixels.top, imageData: imageData(pixels) },
        layer: {
        name: textName, left: textPixels.left, top: textPixels.top, imageData: imageData(textPixels),
        ...(shadowEffect ? { effects: shadowEffect } : {}),
        text: {
          text: t.runs.map((r) => r.chars).join(''),
          transform: [1, 0, 0, 1, Math.round(t.x), Math.round(t.baseline)],
          style: styleOf(first),
          styleRuns: t.runs.map((r) => ({ length: r.chars.length, style: styleOf(r) })),
          paragraphStyle: { justification: 'left' },
        },
      } });
      report.push(`${textName} (#${layer.id}): texto — ${[...new Set(t.runs.map((r) => styleOf(r).font.name))].join(', ')}`);
    }
    const children = organize(items);
    const countLayers = (ls) => ls.reduce((n, l) => n + (l.children ? countLayers(l.children) : 1), 0);
    const psd = {
      width: size.width, height: size.height, children,
      // Resolución explícita (72 ppp, pantalla): sin ella Photopea no puede calcular la vista y el lienzo queda vacío.
      imageResources: { resolutionInfo: { horizontalResolution: 72, horizontalResolutionUnit: 'PPI', widthUnit: 'Inches',
        verticalResolution: 72, verticalResolutionUnit: 'PPI', heightUnit: 'Inches' } },
      imageData: { width: size.width, height: size.height, data: imageData(composite).data },
    };
    return { buffer: writePsdBuffer(psd, { generateThumbnail: false }), report, layers: countLayers(children), tree: children, fontFiles: fonts.__files ?? [] };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = projectDirOrExit(process.argv[2], 'Uso: npm run psd -- <proyecto>');
  const { buffer, layers, tree, fontFiles } = await buildPsd(dir);
  const out = await exportPath(dir, 'psd');
  await fs.writeFile(out, buffer);
  console.log(`${path.relative(ROOT, out).replaceAll('\\', '/')}  (${layers} capas, ${(buffer.length / 1e6).toFixed(1)} MB)`);
  // Árbol tal como se ve en el panel de capas (de arriba hacia abajo).
  const show = (ls, depth) => [...ls].reverse().forEach((l) => {
    console.log(`  ${'   '.repeat(depth)}${l.children ? '▸ ' : '· '}${l.name}${l.hidden ? '  (oculto)' : ''}${l.protected ? '  (bloqueado)' : ''}${l.text ? '  [texto]' : ''}`);
    if (l.children) show(l.children, depth + 1);
  });
  show(tree, 0);
  console.log(`
Ver en Photopea (con npm start corriendo):
${photopeaLink(out, fontFiles)}`);
}
