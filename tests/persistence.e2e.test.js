// Pruebas en un navegador real sobre una COPIA temporal de demo/ejemplo (el post real no se toca).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from '../studio/server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Copia el post de ejemplo a un post temporal del mismo cliente (así resuelve ../../marca), levanta el servidor y abre el editor.
async function openEditor(t, name) {
  const POSTS = path.join(ROOT, 'clientes', 'demo', 'posts'), project = `demo/${name}`;
  const dir = path.join(POSTS, name);
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(path.join(POSTS, 'ejemplo'), dir, { recursive: true, filter: (src) => !/[\\/]export([\\/]|$)/.test(src) });
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  t.after(async () => { await browser.close(); server.close(); await fs.rm(dir, { recursive: true, force: true }); });

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const saves = [];
  page.on('request', (r) => r.url().endsWith('/api/save') && saves.push(r));
  await page.goto(`${base}/?project=${project}`);
  await page.locator('#status[data-state="idle"]').waitFor();
  const zoom = await page.evaluate(() => parseFloat(document.getElementById('zoom-label').textContent) / 100);
  const board = await page.locator('#board').boundingBox();
  // Convierte coordenadas del diseño a coordenadas de pantalla.
  const screen = (x, y) => [board.x + x * zoom, board.y + y * zoom];
  const post = path.join(dir, 'post.html');
  const read = () => fs.readFile(post, 'utf8');
  const styleOf = async (id) => (await read()).match(new RegExp(`id="${id}"[\\s\\S]*?style="([^"]*)"`))[1];
  // Espera a que haya exactamente n guardados (y a que el último termine).
  const waitSaves = async (n) => {
    for (const t0 = Date.now(); saves.length < n && Date.now() - t0 < 5000;) await page.waitForTimeout(25);
    assert.equal(saves.length, n, `se esperaban ${n} guardados`);
    assert.equal((await saves[n - 1].response()).status(), 200);
    await page.waitForTimeout(100);
    assert.equal(saves.length, n, `se esperaban ${n} guardados, no más`);
  };
  return { page, browser, base, project, dir, post, zoom, board, screen, saves, read, styleOf, waitSaves };
}

test('fase 0: mover el título con el mouse persiste left/top en post.html', async (t) => {
  const { page, browser, base, post, zoom, screen, saves, read, styleOf, waitSaves } = await openEditor(t, 'test-e2e-move');
  const original = await read();
  assert.ok(zoom < 1, 'el lienzo se ajusta a la ventana con zoom < 100%');

  // La referencia aparece al lado por defecto, con el mismo tamaño en pantalla que el diseño.
  await page.waitForFunction(() => document.getElementById('ref-img').complete && document.getElementById('ref-img').naturalWidth > 0);
  const [designBox, refBox] = [await page.locator('#board').boundingBox(), await page.locator('#ref-sheet').boundingBox()];
  assert.ok(refBox && refBox.x > designBox.x + designBox.width, 'referencia a la derecha del diseño');
  assert.deepEqual([refBox.width, refBox.height], [designBox.width, designBox.height]);

  const frame = page.frameLocator('#frame');
  const start = await frame.locator('#titulo').evaluate((el) => ({ left: el.offsetLeft, top: el.offsetTop }));
  const [sx, sy] = screen(start.left + 60, start.top + 40);
  const dx = 150, dy = 200;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx + (dx * zoom) / 2, sy + (dy * zoom) / 2, { steps: 5 });
  await page.mouse.move(sx + dx * zoom, sy + dy * zoom, { steps: 5 });
  assert.equal(saves.length, 0, 'no se guarda durante el arrastre');
  assert.equal(await read(), original, 'el archivo no cambia durante el arrastre');
  await page.mouse.up();
  await waitSaves(1);

  const style = await styleOf('titulo');
  const left = Number(style.match(/left:(-?\d+)px/)[1]), top = Number(style.match(/top:(-?\d+)px/)[1]);
  assert.ok(Math.abs(left - (start.left + dx)) <= 1, `left=${left}`);
  assert.ok(Math.abs(top - (start.top + dy)) <= 1, `top=${top}`);
  const originalStyle = await (async () => original.match(/id="titulo"[\s\S]*?style="([^"]*)"/)[1])();
  const expected = original.replace(originalStyle, originalStyle.replace(/left:-?\d+px/, `left:${left}px`).replace(/top:-?\d+px/, `top:${top}px`));
  assert.equal(await read(), expected, 'el resto del HTML queda idéntico');

  await page.reload();
  await page.locator('#status[data-state="idle"]').waitFor();
  const after = await page.frameLocator('#frame').locator('#titulo').evaluate((el) => ({ left: el.offsetLeft, top: el.offsetTop }));
  assert.deepEqual(after, { left, top });

  const solo = await browser.newPage();
  await solo.goto(`${base}/clientes/demo/posts/test-e2e-move/post.html`);
  assert.equal(await solo.locator('#titulo').evaluate((el) => el.offsetLeft), left, 'el post funciona solo, sin editor');

  // Edición externa (como Codex): el editor la detecta y recarga solo.
  await fs.writeFile(post, (await read()).replace(`left:${left}px`, 'left:42px'), 'utf8');
  await page.waitForFunction(() => document.getElementById('frame').contentDocument.getElementById('titulo')?.offsetLeft === 42);

  // Guardar con revisión vieja devuelve conflicto y no pisa el archivo.
  const stale = await page.evaluate(async () => (await fetch('/api/save', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: 'demo/test-e2e-move', elementId: 'titulo', changes: { left: '1px' }, expectedRevision: 'viejo' }),
  })).status);
  assert.equal(stale, 409);
  assert.match(await read(), /left:42px/);
});

test('fase 1: escalar, rotar, flechas, tamaño, deshacer/rehacer y exportar PNG', async (t) => {
  const { page, dir, zoom, screen, saves, read, styleOf, waitSaves } = await openEditor(t, 'test-e2e-edit');
  const frame = page.frameLocator('#frame');
  const geom = (id) => frame.locator('#' + id).evaluate((el) => {
    const cs = getComputedStyle(el);
    return { left: parseFloat(cs.left), top: parseFloat(cs.top), w: parseFloat(cs.width), h: parseFloat(cs.height), fs: parseFloat(cs.fontSize) };
  });

  // 1) Escalar el logo (imagen) desde la esquina inferior derecha: cambia width, la esquina superior izquierda queda fija.
  const c0 = await geom('logo');
  await page.mouse.click(...screen(c0.left + c0.w / 2, c0.top + c0.h / 2));
  const se = await page.locator('#sel-box .handle[data-h="se"]').boundingBox();
  await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
  await page.mouse.down();
  await page.mouse.move(se.x + 60 * zoom, se.y + 60 * zoom, { steps: 6 });
  await page.mouse.up();
  await waitSaves(1);
  let s = await styleOf('logo');
  const w1 = Number(s.match(/width:(\d+)px/)[1]);
  assert.ok(w1 > c0.w + 40, `el logo creció (width=${w1})`);
  assert.match(s, new RegExp(`left:${c0.left}px;top:${c0.top}px`), 'la esquina opuesta no se movió');

  // 2) Rotar con la manija: transform: rotate(...) inline.
  const rot = await page.locator('#sel-box .handle[data-h="rot"]').boundingBox();
  await page.mouse.move(rot.x + rot.width / 2, rot.y + rot.height / 2);
  await page.mouse.down();
  await page.mouse.move(rot.x + 120 * zoom, rot.y + 40 * zoom, { steps: 6 });
  await page.mouse.up();
  await waitSaves(2);
  s = await styleOf('logo');
  const deg = Number(s.match(/transform:rotate\((-?[\d.]+)deg\)/)[1]);
  assert.ok(deg > 5, `rotó en sentido horario (${deg}°)`);

  // 3) Flechas: 3× derecha + Shift+abajo = UNA operación de guardado al soltar.
  const before3 = await styleOf('logo');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await page.waitForTimeout(200);
  assert.equal(saves.length, 2, 'no se guarda mientras se siguen tocando flechas');
  await waitSaves(3);
  s = await styleOf('logo');
  assert.match(s, new RegExp(`left:${c0.left + 3}px;top:${c0.top + 10}px`));

  // 4) Deshacer devuelve exactamente el estilo anterior; rehacer lo vuelve a aplicar.
  await page.keyboard.press('Control+z');
  await waitSaves(4);
  assert.equal(await styleOf('logo'), before3);
  await page.keyboard.press('Control+Shift+z');
  await waitSaves(5);
  assert.match(await styleOf('logo'), new RegExp(`left:${c0.left + 3}px;top:${c0.top + 10}px`));

  // 5) Texto: "+" (o "=") sube el tamaño de fuente 1px por pulsación.
  const h0 = await geom('subtitulo');
  await page.mouse.click(...screen(h0.left + 40, h0.top + 15));
  for (let i = 0; i < 3; i++) await page.keyboard.press('=');
  await waitSaves(6);
  assert.match(await styleOf('subtitulo'), new RegExp(`font-size:${h0.fs + 3}px`));

  // 6) Campo X de la barra de propiedades.
  await page.fill('#prop-x', '100');
  await page.press('#prop-x', 'Enter');
  await waitSaves(7);
  assert.match(await styleOf('subtitulo'), /left:100px/);

  // 6b) Grupo (sello = div con SVG adentro): se escala entero — cambia width y height, no font-size.
  const g0 = await geom('sello');
  await page.mouse.click(...screen(g0.left + g0.w * 0.5, g0.top + g0.h * 0.08));
  assert.match(await page.textContent('#sel-label'), /^#sello/);
  const nw = await page.locator('#sel-box .handle[data-h="nw"]').boundingBox();
  await page.mouse.move(nw.x + nw.width / 2, nw.y + nw.height / 2);
  await page.mouse.down();
  await page.mouse.move(nw.x + 40 * zoom, nw.y + 40 * zoom, { steps: 5 });
  await page.mouse.up();
  await waitSaves(8);
  const ss = await styleOf('sello'), sw = Number(ss.match(/width:(\d+)px/)[1]), shh = Number(ss.match(/height:(\d+)px/)[1]);
  assert.ok(sw < g0.w - 20 && Math.abs(sw - shh) <= 1, `sello achicado proporcionalmente (${sw}×${shh})`);
  assert.doesNotMatch(ss, /font-size/);
  const inner = await frame.locator('#sello svg').evaluate((el) => el.getBoundingClientRect().width);
  assert.ok(Math.abs(inner - sw) <= 2, `el contenido escala con el grupo (${inner} ≈ ${sw})`);

  // 7) Referencia encima: se superpone al diseño sin tocar post.html.
  const html = await read();
  await page.click('#ref-over-btn');
  assert.ok(await page.locator('#ref-over').isVisible());
  assert.equal(await read(), html);

  // 8) Exportar: PNG de 1080×1350 en el proyecto, sin controles del editor.
  await page.click('#export');
  await page.waitForFunction(() => /exportado/.test(document.getElementById('status-text').textContent), null, { timeout: 30000 });
  const png = await fs.readFile(path.join(dir, 'export', path.basename(dir) + '.png'));
  assert.equal(png.toString('latin1', 1, 4), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1080, 1350]);
  assert.equal(await read(), html, 'exportar no modifica post.html');
});
