// nuevo-video: genera video.jsx a partir del post.html (copia de demo/ejemplo), con rutas para staticFile()
// relativas a la carpeta del cliente. No renderiza (lento); el render se prueba a mano con npm run video:render.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT, projectDir } from '../studio/projects.js';

const run = promisify(execFile);

test('nuevo-video: video.jsx con textos, fuentes, piezas y colores del post', async (t) => {
  const dir = projectDir('demo/test-video');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(projectDir('demo/ejemplo'), dir, { recursive: true, filter: (s) => !/[\\/](export|video\.jsx)([\\/]|$)/.test(s) });
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  await run(process.execPath, [path.join(ROOT, 'studio', 'video.js'), 'nuevo', 'demo/test-video'], { cwd: ROOT });
  const jsx = await fs.readFile(path.join(dir, 'video.jsx'), 'utf8');
  assert.match(jsx, /from '\.\.\/\.\.\/\.\.\/\.\.\/video\/VideoPost\.jsx'/);
  assert.match(jsx, /export const duracion = 5;/);
  assert.match(jsx, /titulo: staticFile\("marca\/fonts\/archivo-black\.ttf"\), texto: staticFile\("marca\/fonts\/archivo\.ttf"\)/);
  assert.match(jsx, /fondo=\{staticFile\("posts\/test-video\/fondo\.png"\)\}/);
  assert.match(jsx, /titulo=\{\["Pan","de masa","madre"\]\}/);
  assert.match(jsx, /subtitulo=\{\["Recién salido del horno","todos los días"\]\}/);
  assert.match(jsx, /cabecera=\{\{ logo: staticFile\("marca\/logo\.png"\), usuario: "tumarca" \}\}/);
  assert.match(jsx, /sello=\{\{ texto: "NUEVO", imagen: null \}\}/);
  assert.doesNotMatch(jsx, /reloj=/, 'sin reloj si el post no lo tiene');
  assert.match(jsx, /"acento":"#ffd27a"/);

  // no pisa un video existente
  await assert.rejects(run(process.execPath, [path.join(ROOT, 'studio', 'video.js'), 'nuevo', 'demo/test-video'], { cwd: ROOT }));
});
