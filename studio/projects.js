// Ubicación de los proyectos. Un proyecto es "<cliente>/<post>" y vive en
//   clientes/<cliente>/posts/<post>/post.html
// con los recursos compartidos del cliente en clientes/<cliente>/marca/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENTS = path.join(ROOT, 'clientes');
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/; // minúsculas, números y guiones (convención de nombres)

// "<cliente>/<post>" → carpeta del post, o null si el id no respeta la convención.
export function projectDir(id) {
  if (typeof id !== 'string') return null;
  const [client, post, ...rest] = id.split('/');
  if (rest.length || !SLUG.test(client ?? '') || !SLUG.test(post ?? '')) return null;
  return path.join(CLIENTS, client, 'posts', post);
}

// URL (relativa a la raíz del servidor) de la carpeta del post.
export const projectUrl = (id) => {
  const [client, post] = id.split('/');
  return `/clientes/${client}/posts/${post}`;
};

export async function listProjects() {
  const out = [];
  const dirs = async (p) => (await fs.readdir(p, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name);
  for (const client of (await dirs(CLIENTS)).sort()) {
    for (const post of (await dirs(path.join(CLIENTS, client, 'posts'))).sort()) {
      const id = `${client}/${post}`;
      if (!projectDir(id)) continue;
      try { await fs.access(path.join(projectDir(id), 'post.html')); out.push(id); } catch {}
    }
  }
  return out;
}

// Imágenes con nombre fijo dentro del post: referencia.* y cajas.* (convención). Si no están,
// se acepta cualquier imagen que contenga "ref" / "cajas" o "boxes" en el nombre.
const IMG = /\.(png|jpe?g|webp)$/i;
const KINDS = { referencia: [/^referencia\./i, /ref/i], cajas: [/^cajas\./i, /(cajas|boxes)/i] };
export function findImage(names, kind) {
  const imgs = names.filter((n) => IMG.test(n)).sort();
  for (const re of KINDS[kind]) { const hit = imgs.find((n) => re.test(n)); if (hit) return hit; }
  return null;
}

// Exportaciones del post: <post>/export/<post>.png y .psd (con el nombre del post, para que no se
// confundan al compartirlas; la carpeta export/ no se versiona). Crea la carpeta si hace falta.
export async function exportPath(dir, ext) {
  await fs.mkdir(path.join(dir, 'export'), { recursive: true });
  return path.join(dir, 'export', `${path.basename(dir)}.${ext}`);
}

// Enlace que abre un PSD en Photopea leyendo los archivos del servidor local (con las fuentes del post
// como recursos, para que dibuje los textos con la tipografía real). Requiere `npm start` corriendo.
export function photopeaLink(psdFile, fontFiles = [], port = Number(process.env.PORT ?? 4321)) {
  const url = (f) => `http://localhost:${port}/${path.relative(ROOT, f).split(path.sep).map(encodeURIComponent).join('/')}`;
  const config = { files: [url(psdFile)], resources: fontFiles.map(url) };
  return `https://www.photopea.com#${encodeURIComponent(JSON.stringify(config))}`;
}

// Para los comandos: valida el argumento y explica la convención si no la respeta.
export function projectDirOrExit(id, usage) {
  const dir = projectDir(id);
  if (!dir) {
    console.error(`${usage}\n<proyecto> es "<cliente>/<post>", p. ej. demo/ejemplo`);
    process.exit(1);
  }
  return dir;
}
