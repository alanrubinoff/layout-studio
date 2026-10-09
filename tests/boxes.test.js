// Detección de cajas y primera pasada sobre un proyecto sintético (imágenes generadas en el test).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { detectBoxes, applyBoxes } from '../studio/boxes.js';

test('detecta cajas de colores y centra/escala elementos dentro de ellas', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'boxes-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  // Referencia (degradé con un "texto" amarillo pálido) y la misma imagen con dos cajas: verde y azul.
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const draw = (withBoxes) => page.evaluate((withBoxes) => {
    const c = document.createElement('canvas'); c.width = 540; c.height = 675;
    const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 540, 675);
    g.addColorStop(0, '#5a3a20'); g.addColorStop(1, '#c08040'); x.fillStyle = g; x.fillRect(0, 0, 540, 675);
    x.fillStyle = '#f6f09c'; x.fillRect(60, 100, 300, 60);
    if (withBoxes) {
      x.lineWidth = 3;
      x.strokeStyle = 'rgb(40,220,40)'; x.strokeRect(50, 90, 320, 80);
      x.strokeStyle = 'rgb(30,60,240)'; x.strokeRect(400, 400, 100, 100);
      // segunda caja verde, separada de la primera, cruzada por una línea azul (como cajas que se superponen)
      x.strokeStyle = 'rgb(40,220,40)'; x.strokeRect(60, 500, 200, 60);
      x.strokeStyle = 'rgb(30,60,240)'; x.beginPath(); x.moveTo(150, 480); x.lineTo(150, 580); x.stroke();
    }
    return c.toDataURL('image/png').split(',')[1];
  }, withBoxes);
  await fs.writeFile(path.join(dir, 'referencia.png'), Buffer.from(await draw(false), 'base64'));
  await fs.writeFile(path.join(dir, 'cajas.png'), Buffer.from(await draw(true), 'base64'));
  await browser.close();

  await fs.writeFile(path.join(dir, 'post.html'), `<!doctype html><meta charset="utf-8">
<style>body{margin:0}.canvas{position:relative;width:1080px;height:1350px}.canvas>*{position:absolute;margin:0}</style>
<main class="canvas">
  <div id="square" data-editable="true" style="left:0px;top:0px;width:50px;height:50px;background:#000;"></div>
</main>`);

  // La imagen de 540×675 se escala ×2 al lienzo de 1080×1350.
  const { boxes } = await detectBoxes(dir);
  const by = Object.fromEntries(boxes.map((b) => [b.name, b]));
  // Todas las cajas, aunque repitan color; numeradas en orden de lectura (arriba→abajo).
  assert.deepEqual(boxes.map((b) => `${b.n}:${b.name}`), ['1:verde', '2:azul', '3:verde-2']);
  assert.ok(Math.abs(by.verde.x - 98) <= 4 && Math.abs(by.verde.y - 178) <= 4, JSON.stringify(by.verde));
  assert.ok(Math.abs(by.azul.w - 200) <= 6 && Math.abs(by.azul.h - 200) <= 6, JSON.stringify(by.azul));
  // borde exterior: (200 + 3 de línea) × 2 de escala = 406; (60 + 3) × 2 = 126
  assert.ok(Math.abs(by['verde-2'].w - 406) <= 4 && Math.abs(by['verde-2'].h - 126) <= 4, JSON.stringify(by['verde-2']));

  // El cuadrado se escala y centra dentro de la caja azul, elegida por número (con 10 px de margen).
  const { html } = await applyBoxes(dir, [['square', '2']], boxes, { inset: 10 });
  const style = html.match(/style="([^"]*)"/g).pop();
  const n = (p) => Number(style.match(new RegExp(`${p}:(\\d+)px`))[1]);
  assert.ok(Math.abs(n('width') - (by.azul.w - 20)) <= 2, style);
  assert.ok(Math.abs(n('left') + n('width') / 2 - (by.azul.x + by.azul.w / 2)) <= 2, style);
  assert.match(html, /background:#000;/, 'el resto del estilo se conserva');
});
