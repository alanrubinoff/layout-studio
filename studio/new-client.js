// Crea un cliente nuevo a partir del cliente demo:
//   npm run nuevo-cliente -- <cliente>   →  clientes/<cliente>/{marca/fonts, plantilla/post.html, posts/}
// La plantilla arranca con las fuentes libres del demo (copiadas a marca/fonts) y un logo de ejemplo:
// después se reemplazan por las de la marca (fuentes, logo, colores en el <style> de la plantilla).
// No pisa un cliente existente.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CLIENTS } from './projects.js';

const client = process.argv[2];
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(client ?? '')) {
  console.error('Uso: npm run nuevo-cliente -- <cliente>   (minúsculas y guiones, p. ej. panaderia-sol)');
  process.exit(1);
}
const dir = path.join(CLIENTS, client), demo = path.join(CLIENTS, 'demo');
try { await fs.access(dir); console.error(`Ya existe clientes/${client}: no lo piso.`); process.exit(1); } catch {}

await fs.mkdir(path.join(dir, 'posts'), { recursive: true });
await fs.cp(path.join(demo, 'marca'), path.join(dir, 'marca'), { recursive: true });
await fs.mkdir(path.join(dir, 'plantilla'), { recursive: true });
const html = (await fs.readFile(path.join(demo, 'plantilla', 'post.html'), 'utf8'))
  .replace('<title>Demo — post</title>', `<title>${client} — post</title>`)
  .replace(/PLANTILLA del cliente demo[^\n]*/, `PLANTILLA de ${client} (creada desde demo: reemplazar fuentes, logo y colores por los de la marca).`);
await fs.writeFile(path.join(dir, 'plantilla', 'post.html'), html, 'utf8');
console.log(`Creado clientes/${client}/ (marca/, plantilla/post.html, posts/).
Siguiente: poner las fuentes y el logo de la marca en clientes/${client}/marca/ y ajustar el <style> de la plantilla.
Después: npm run nuevo -- ${client}/<post>`);
