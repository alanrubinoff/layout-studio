// Servidor local mínimo: sirve el workspace (posts + assets), el editor, y un endpoint
// que guarda cambios de estilo inline directamente en el post.html del proyecto.
// Un proyecto es "<cliente>/<post>" → clientes/<cliente>/posts/<post>/post.html (ver projects.js).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { patchElementStyle } from './style-patch.js';
import { renderPng } from './export.js';
import { buildPsd } from './psd.js';
import { ROOT, projectDir, projectUrl, listProjects, findImage, photopeaLink, exportPath } from './projects.js';

const HOST = '127.0.0.1'; // nunca expuesto a la red
const PORT = Number(process.env.PORT ?? 4321);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.psd': 'image/vnd.adobe.photoshop',
};

const revisionOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 12);

function postPath(project) {
  const dir = projectDir(project);
  return dir && path.join(dir, 'post.html');
}

// Un guardado a la vez por archivo, para que dos requests no se pisen.
const locks = new Map();
function withLock(key, fn) {
  const run = (locks.get(key) ?? Promise.resolve()).then(fn, fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

async function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, typeof data === 'string' ? 'utf8' : undefined);
  // En Windows rename puede fallar un instante si otro proceso tiene el archivo abierto.
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(tmp, file); return; }
    catch (err) {
      if (attempt >= 5 || !['EPERM', 'EACCES', 'EBUSY'].includes(err.code)) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
      await new Promise((r) => setTimeout(r, 40 * (attempt + 1)));
    }
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

// Photopea (https://www.photopea.com) puede LEER los archivos de clientes/ (PSD, fuentes, imágenes) para
// abrir un PSD exportado con "Abrir en Photopea". Corre en el navegador del usuario: nada se sube a un servidor.
// Sólo GET, sólo ese origen, sólo esa carpeta; guardar/exportar siguen cerrados para otros sitios.
const PHOTOPEA = 'https://www.photopea.com';
const photopeaHeaders = (req, pathname) =>
  req.headers.origin === PHOTOPEA && pathname.startsWith('/clientes/')
    ? { 'Access-Control-Allow-Origin': PHOTOPEA, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin' }
    : {};

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 64 * 1024) throw new Error('body demasiado grande'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Sólo aceptar escrituras desde el propio editor (evita que otra web haga POST a localhost).
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  return req.headers['content-type']?.startsWith('application/json') &&
    (!origin || origin === `http://${host}`);
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/projects' && req.method === 'GET') {
    const projects = (await listProjects()).map((id) => ({ id, url: projectUrl(id) }));
    return send(res, 200, { projects });
  }

  if (url.pathname === '/api/revision' && req.method === 'GET') {
    const file = postPath(url.searchParams.get('project'));
    if (!file) return send(res, 400, { error: 'proyecto inválido' });
    try { return send(res, 200, { revision: revisionOf(await fs.readFile(file, 'utf8')) }); }
    catch { return send(res, 404, { error: 'post.html no encontrado' }); }
  }

  // Imagen de referencia del proyecto (referencia.*). Es sólo para comparar en el editor; no forma parte de post.html.
  if (url.pathname === '/api/reference' && req.method === 'GET') {
    const file = postPath(url.searchParams.get('project'));
    if (!file) return send(res, 400, { error: 'proyecto inválido' });
    let names = [];
    try { names = await fs.readdir(path.dirname(file)); } catch {}
    return send(res, 200, { reference: findImage(names, 'referencia') });
  }

  if (url.pathname === '/api/save' && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'origen no permitido' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'JSON inválido' }); }
    const { project, elementId, changes, expectedRevision } = body ?? {};
    const file = postPath(project);
    if (!file) return send(res, 400, { error: 'proyecto inválido' });
    if (typeof elementId !== 'string' || !elementId) return send(res, 400, { error: 'elementId requerido' });

    return withLock(file, async () => {
      let html;
      try { html = await fs.readFile(file, 'utf8'); } catch { return send(res, 404, { error: 'post.html no encontrado' }); }
      const current = revisionOf(html);
      if (expectedRevision !== current) {
        return send(res, 409, { error: 'El archivo cambió fuera del editor', revision: current });
      }
      let next;
      try { next = patchElementStyle(html, elementId, changes); }
      catch (err) { return send(res, err.status ?? 500, { error: err.message }); }
      if (next !== html) await atomicWrite(file, next);
      console.log(`guardado ${project}/post.html #${elementId} ${JSON.stringify(changes)}`);
      return send(res, 200, { revision: revisionOf(next) });
    });
  }

  // Exporta post.html a <post>/export/<post>.png o .psd (mismo lock que el guardado: no exporta a mitad de una escritura).
  if (url.pathname === '/api/export' && req.method === 'POST') {
    if (!sameOrigin(req)) return send(res, 403, { error: 'origen no permitido' });
    let body;
    try { body = await readJson(req); } catch { return send(res, 400, { error: 'JSON inválido' }); }
    const file = postPath(body?.project);
    if (!file) return send(res, 400, { error: 'proyecto inválido' });
    const psd = body.format === 'psd';
    return withLock(file, async () => {
      try {
        const dir = path.dirname(file);
        const { buffer, width = 1080, height = 1350, layers, fontFiles } = psd ? await buildPsd(dir) : await renderPng(dir);
        const out = await exportPath(dir, psd ? 'psd' : 'png');
        await atomicWrite(out, buffer);
        const rel = path.relative(ROOT, out).split(path.sep).join('/');
        console.log(`exportado ${rel}${layers ? ` (${layers} capas)` : ` ${width}×${height}`}`);
        return send(res, 200, { file: rel, width, height, layers, ...(psd ? { photopea: photopeaLink(out, fontFiles, PORT) } : {}) });
      } catch (err) {
        return send(res, 500, { error: err.message });
      }
    });
  }

  return send(res, 404, { error: 'no encontrado' });
}

async function serveFile(req, res, pathname) {
  // "/" → editor; "/studio/..." → archivos del editor; el resto → workspace (posts y assets).
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/studio/editor.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'prohibido', 'text/plain');
  if (/[\\/](node_modules|\.git)([\\/]|$)/.test(path.relative(ROOT, file))) return send(res, 403, 'prohibido', 'text/plain');
  try {
    const data = await fs.readFile(file);
    send(res, 200, data, TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', photopeaHeaders(req, pathname));
  } catch {
    send(res, 404, 'no encontrado', 'text/plain');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      // Sólo hosts locales (evita DNS rebinding desde otra web).
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host ?? '')) return send(res, 403, 'host no permitido', 'text/plain');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
      else if (req.method === 'GET') await serveFile(req, res, url.pathname);
      else if (req.method === 'OPTIONS' && Object.keys(photopeaHeaders(req, url.pathname)).length) {
        send(res, 204, '', 'text/plain', photopeaHeaders(req, url.pathname)); // preflight (incl. red privada de Chrome)
      }
      else send(res, 405, { error: 'método no permitido' });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'error interno' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  createServer().listen(PORT, HOST, () => {
    console.log(`Layout Studio → http://localhost:${PORT}`);
  });
}
