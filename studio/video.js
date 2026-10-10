// Videos de un post con Remotion. El video vive en la carpeta del post:
//   clientes/<cliente>/posts/<post>/video.jsx   (qué textos, imágenes y colores usar)
// y las animaciones reutilizables en video/VideoPost.jsx.
//
//   npm run nuevo-video -- <cliente>/<post>    crea video.jsx leyendo el post.html (textos, colores, fuentes, piezas)
//   npm run video -- <cliente>/<post>          abre Remotion Studio para ver y ajustar
//   npm run video:render -- <cliente>/<post>   → export/<post>.mp4
//
// Remotion usa la carpeta del cliente como "public": staticFile('marca/logo.png') o
// staticFile('posts/<post>/fondo.png') leen los archivos originales, sin copiarlos.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { ROOT, CLIENTS, projectDirOrExit, exportPath } from './projects.js';
import { launchBrowser } from './export.js';

const require = createRequire(import.meta.url);
const posix = (p) => p.split(path.sep).join('/');

// ---------- nuevo-video: leer el post y escribir video.jsx ----------

// Corre en la página del post: textos por renglón, colores visibles, imágenes y familias de fuente.
function leerPost() {
  const $ = (s) => document.querySelector(s);
  const lineas = (el) => {
    if (!el) return [];
    const out = ['']; // texto por renglón (los <br> cortan), sin text-transform: se aplica en el video
    const walk = (n) => n.childNodes.forEach((c) => {
      if (c.nodeType === 3) out[out.length - 1] += c.textContent;
      else if (c.nodeName === 'BR') out.push('');
      else if (c.nodeType === 1) walk(c);
    });
    walk(el);
    return out.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  };
  const hex = (el) => {
    if (!el) return null;
    const [r, g, b] = getComputedStyle(el).color.match(/\d+(\.\d+)?/g).map(Number);
    return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  };
  const fuente = (el) => el && { familia: getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g, '').trim(), peso: getComputedStyle(el).fontWeight };
  const titulo = $('#titulo');
  const acento = titulo?.querySelector('.acento') ?? null;
  return {
    titulo: lineas(titulo),
    subtitulo: lineas($('#subtitulo')),
    usuario: $('#usuario')?.textContent.trim() || null,
    logo: $('#logo')?.getAttribute('src') || null,
    sello: $('#sello') ? {
      // el anillo del video repite la palabra 3 veces: tomar sólo la primera ("NUEVO · NUEVO ·" → "NUEVO")
      texto: $('#sello textPath')?.textContent.split('·')[0].trim() || null,
      imagen: $('#sello img')?.getAttribute('src') || null,
    } : null,
    reloj: $('#reloj') ? {
      imagen: $('#reloj')?.getAttribute('src') || null,
      minutos: parseInt($('#reloj-minutos')?.textContent ?? '', 10) || null,
    } : null,
    colores: { texto: hex(titulo), acento: hex(acento) ?? hex($('#subtitulo')), reloj: hex($('#reloj-minutos')) },
    fuentes: { titulo: fuente(titulo), texto: fuente($('#subtitulo') ?? $('#usuario')) },
  };
}

// @font-face del post → [{ familia, pesos: [min, max], url }]
function fontFaces(html) {
  return [...html.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => {
    const familia = m[1].match(/font-family:\s*['"]?([^;'"]+)/)?.[1].trim();
    const pesos = (m[1].match(/font-weight:\s*([\d\s]+)/)?.[1] ?? '400').trim().split(/\s+/).map(Number);
    return { familia, pesos: [pesos[0], pesos[1] ?? pesos[0]], url: m[1].match(/url\(\s*['"]?([^'")]+)/)?.[1] };
  }).filter((f) => f.familia && f.url);
}

async function nuevoVideo(id, dir) {
  const target = path.join(dir, 'video.jsx');
  try { await fs.access(target); console.error(`Ya existe ${posix(path.relative(ROOT, target))}: no lo piso.`); process.exit(1); } catch {}
  const clientDir = path.join(CLIENTS, id.split('/')[0]);
  const html = await fs.readFile(path.join(dir, 'post.html'), 'utf8');
  const browser = await launchBrowser();
  let datos;
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(dir, 'post.html')).href);
    await page.evaluate(() => document.fonts.ready);
    datos = await page.evaluate(leerPost);
  } finally { await browser.close(); }

  // Rutas del post (relativas a su carpeta) → relativas a la carpeta del cliente, para staticFile().
  const delCliente = (src) => src && posix(path.relative(clientDir, path.resolve(dir, src)));
  const faces = fontFaces(html);
  const archivoFuente = (f) => {
    if (!f) return null;
    const peso = Number(f.peso);
    const face = faces.find((x) => x.familia === f.familia && peso >= x.pesos[0] && peso <= x.pesos[1]) ?? faces.find((x) => x.familia === f.familia);
    return face ? delCliente(face.url) : null;
  };
  const fondo = (await fs.readdir(dir)).find((n) => /^fondo\./i.test(n));
  const lit = (v) => JSON.stringify(v);
  const sf = (p) => (p ? `staticFile(${lit(p)})` : 'null');
  const post = path.basename(dir);
  const lineasJsx = [
    `      fondo={${sf(fondo && delCliente(fondo))}}`,
    `      titulo={${lit(datos.titulo)}}`,
    datos.subtitulo.length ? `      subtitulo={${lit(datos.subtitulo)}}` : null,
    (datos.logo || datos.usuario) ? `      cabecera={{ logo: ${sf(delCliente(datos.logo))}, usuario: ${lit(datos.usuario)} }}` : null,
    datos.sello ? `      sello={{ texto: ${lit(datos.sello.texto ?? '')}, imagen: ${sf(delCliente(datos.sello.imagen))} }}` : null,
    datos.reloj?.imagen ? `      reloj={{ imagen: ${sf(delCliente(datos.reloj.imagen))}, minutos: ${lit(datos.reloj.minutos)} }}` : null,
    `      colores={${lit(Object.fromEntries(Object.entries(datos.colores).filter(([, v]) => v)))}}`,
  ].filter(Boolean).join('\n');

  const codigo = `// Video de ${id}: vertical 1080×1920 a 30 fps.
// Generado desde post.html con \`npm run nuevo-video\`; editalo libremente (textos, piezas, duración).
// Ver:      npm run video -- ${id}
// Exportar: npm run video:render -- ${id}   → export/${post}.mp4
// staticFile() lee archivos de clientes/${id.split('/')[0]}/ (la carpeta del cliente).
import { staticFile } from 'remotion';
import { VideoPost, cargarFuentes } from '../../../../video/VideoPost.jsx';

export const duracion = 5; // segundos

cargarFuentes({ titulo: ${sf(archivoFuente(datos.fuentes.titulo))}, texto: ${sf(archivoFuente(datos.fuentes.texto))} });

export default function Video() {
  return (
    <VideoPost
${lineasJsx}
    />
  );
}
`;
  await fs.writeFile(target, codigo, 'utf8');
  console.log(`Creado ${posix(path.relative(ROOT, target))}\nVer: npm run video -- ${id}   ·   Exportar: npm run video:render -- ${id}`);
}

// ---------- studio / render ----------

async function escribirEntrada(id, dir) {
  const video = path.join(dir, 'video.jsx');
  try { await fs.access(video); } catch { console.error(`Este post no tiene video. Crealo con: npm run nuevo-video -- ${id}`); process.exit(1); }
  const entrada = path.join(ROOT, 'video', '.entrada.jsx');
  const rel = posix(path.relative(path.dirname(entrada), video));
  await fs.writeFile(entrada, `// Generado por studio/video.js para ${id} — no editar.
import { Composition, registerRoot } from 'remotion';
import Video, { duracion } from '${rel.startsWith('.') ? rel : './' + rel}';

registerRoot(() => (
  <Composition id="${path.basename(dir)}" component={Video} width={1080} height={1920} fps={30}
    durationInFrames={Math.round((duracion ?? 5) * 30)} />
));
`, 'utf8');
  return entrada;
}

function remotion(args) {
  const cli = path.join(path.dirname(require.resolve('@remotion/cli/package.json')), 'remotion-cli.js');
  const child = spawn(process.execPath, [cli, ...args], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

const [modo, id, ...extra] = process.argv.slice(2);
const usos = { nuevo: 'npm run nuevo-video -- <cliente>/<post>', studio: 'npm run video -- <cliente>/<post>', render: 'npm run video:render -- <cliente>/<post>' };
const dir = projectDirOrExit(id, `Uso: ${usos[modo] ?? usos.studio}`);
const publicDir = path.join(CLIENTS, id.split('/')[0]);

if (modo === 'nuevo') await nuevoVideo(id, dir);
else if (modo === 'studio') remotion(['studio', await escribirEntrada(id, dir), '--public-dir', publicDir, ...extra]);
else if (modo === 'render') {
  const out = await exportPath(dir, 'mp4');
  console.log(`Exportando ${posix(path.relative(ROOT, out))}…`);
  remotion(['render', await escribirEntrada(id, dir), path.basename(dir), out, '--public-dir', publicDir, ...extra]);
} else {
  console.error(`Modo desconocido: ${modo}`);
  process.exit(1);
}
