// Crea un post nuevo a partir de la plantilla del cliente:
//   npm run nuevo -- <cliente>/<post>   →  clientes/<cliente>/posts/<post>/post.html
// Copia clientes/<cliente>/plantilla/post.html ajustando las rutas a la marca (../marca → ../../marca).
// No pisa un post.html existente. Las imágenes del post (fondo, referencia, cajas) se agregan aparte.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CLIENTS, projectDirOrExit } from './projects.js';

const id = process.argv[2];
const dir = projectDirOrExit(id, 'Uso: npm run nuevo -- <cliente>/<post>');
const template = path.join(CLIENTS, id.split('/')[0], 'plantilla', 'post.html');
const target = path.join(dir, 'post.html');

let html;
try { html = await fs.readFile(template, 'utf8'); }
catch { console.error(`No hay plantilla para el cliente: ${path.relative(process.cwd(), template)}`); process.exit(1); }
try { await fs.access(target); console.error(`Ya existe ${path.relative(process.cwd(), target)}: no lo piso.`); process.exit(1); } catch {}

await fs.mkdir(dir, { recursive: true });
html = html
  .replace(/[ \t]*<!--\s*PLANTILLA[\s\S]*?-->\r?\n/, '') // el comentario de la plantilla no va en el post
  .replaceAll("'../marca/", "'../../marca/").replaceAll('"../marca/', '"../../marca/');
await fs.writeFile(target, html, 'utf8');
const have = (await fs.readdir(dir)).filter((n) => /^(fondo|referencia|cajas)\./i.test(n));
console.log(`Creado ${path.relative(process.cwd(), target).replaceAll('\\', '/')}`);
const missing = ['fondo', 'referencia', 'cajas'].filter((k) => !have.some((n) => n.toLowerCase().startsWith(k + '.')));
if (missing.length) console.log(`Falta agregar en la carpeta: ${missing.map((k) => k + '.png').join(', ')} (cajas es opcional)`);
