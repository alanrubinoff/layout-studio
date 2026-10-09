// fit recupera tamaño, escala horizontal y posición de un texto a partir de una referencia
// generada con valores conocidos (el mismo HTML renderizado con otros estilos).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { fitText } from '../studio/fit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const post = (style) => `<!doctype html><meta charset="utf-8">
<style>
  @font-face { font-family: 'Display'; font-weight: 900; src: url('./fonts/archivo-black.ttf'); }
  body { margin: 0; } .canvas { position: relative; width: 1080px; height: 1350px; background: #3a2a1c; overflow: hidden; }
  .canvas > * { position: absolute; margin: 0; }
  .t { font-family: 'Display'; font-weight: 900; color: #fff; text-transform: uppercase; white-space: nowrap; }
</style>
<main class="canvas"><h1 id="t" class="t" data-editable="true" style="${style}">Papas<br>crocantes</h1></main>`;

test('fit: encuentra alto + escala horizontal y posición de un texto', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fit-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  await fs.cp(path.join(ROOT, 'clientes', 'demo', 'marca', 'fonts'), path.join(dir, 'fonts'), { recursive: true });

  // "Referencia": 99px, comprimido al 80 %, en (100, 300).
  await fs.writeFile(path.join(dir, 'post.html'), post('left:100px;top:300px;font-size:99px;line-height:1;scale:0.8 1;transform-origin:0 0;'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  await page.goto(pathToFileURL(path.join(dir, 'post.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.locator('.canvas').screenshot({ path: path.join(dir, 'referencia.png') });
  await browser.close();

  // Punto de partida equivocado: más chico, sin comprimir, corrido.
  await fs.writeFile(path.join(dir, 'post.html'), post('left:120px;top:280px;font-size:70px;line-height:1.3;'));
  const r = await fitText(dir, 't');
  assert.equal(r.winner.name, 'alto + escala horizontal');
  const s = r.winner.style;
  assert.ok(Math.abs(parseFloat(s['font-size']) - 99) <= 3, `font-size ${s['font-size']}`);
  assert.ok(Math.abs(parseFloat(s.scale) - 0.8) <= 0.03, `scale ${s.scale}`);
  assert.ok(Math.abs(parseFloat(s.left) - 100) <= 4 && Math.abs(parseFloat(s.top) - 300) <= 4, `pos ${s.left},${s.top}`);
  assert.ok(r.winner.iou > 0.9, `IoU ${r.winner.iou}`);
  assert.match(r.html, /scale:0\.8\d? 1;transform-origin:0 0;/, 'escribe la escala en el style inline');
});
