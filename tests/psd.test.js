// Exportación a PSD sobre una copia de demo/ejemplo: organizado en grupos con nombres legibles, textos
// editables con su fuente PostScript, respaldos en un grupo oculto y fondo bloqueado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readPsd, initializeCanvas } from 'ag-psd';
import { buildPsd } from '../studio/psd.js';
import { projectDir } from '../studio/projects.js';

initializeCanvas(() => { throw new Error('sin canvas'); }, (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }));

test('psd: grupos, nombres legibles, textos editables y respaldos', async (t) => {
  const dir = projectDir('demo/test-psd');
  await fs.rm(dir, { recursive: true, force: true });
  await fs.cp(projectDir('demo/ejemplo'), dir, { recursive: true, filter: (s) => !/[\\/]export([\\/]|$)/.test(s) });
  // un subgrupo propio (data-grupo con otro nombre) y escala horizontal en el título, para probarlos
  let html = await fs.readFile(`${dir}/post.html`, 'utf8');
  html = html.replace('data-nombre="Sello NUEVO"', 'data-nombre="Sello NUEVO" data-grupo="promo"')
    .replace(/(id="titulo"[^>]*style="[^"]*)z-index:10;/, '$1scale:0.8 1;transform-origin:0 0;z-index:10;');
  await fs.writeFile(`${dir}/post.html`, html);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  const { buffer } = await buildPsd(dir);
  const psd = readPsd(buffer, { useImageData: true });
  assert.deepEqual([psd.width, psd.height], [1080, 1350]);
  assert.equal(psd.imageResources?.resolutionInfo?.horizontalResolution, 72, 'resolución declarada');

  // Primer nivel, de abajo hacia arriba: Fondo (bloqueado), Respaldos (oculto) y los grupos según apilado.
  assert.deepEqual(psd.children.map((l) => l.name), ['Fondo', 'Respaldos en píxeles (no editar)', 'Textos', 'Gráficos', 'Cabecera']);
  const group = (name) => psd.children.find((l) => l.name === name);
  assert.ok(group('Fondo').protected?.position, 'fondo bloqueado');
  assert.ok(group('Respaldos en píxeles (no editar)').hidden, 'respaldos ocultos');
  assert.deepEqual(group('Cabecera').children.map((l) => l.name), ['Logo', 'Usuario — tumarca', 'Menú']);
  const promo = group('Gráficos').children.find((l) => l.name === 'Promo' && l.children);
  assert.deepEqual(promo?.children.map((l) => l.name), ['Sello NUEVO'], 'subgrupo por data-grupo, nombre por data-nombre');

  // Textos editables con la fuente real (también variable) y escala horizontal; un respaldo por texto.
  const titulo = group('Textos').children.find((l) => l.name.startsWith('Título — '));
  assert.equal(titulo.name, 'Título — PAN DE MASA MADRE');
  assert.equal(titulo.text.text, 'PAN\nDE MASA\nMADRE');
  // al releer, cada tramo omite lo que coincide con el estilo base
  const runStyle = (r, k) => r.style[k] ?? titulo.text.style[k];
  assert.ok(titulo.text.styleRuns.every((r) => runStyle(r, 'font').name === 'ArchivoBlack-Regular'));
  assert.ok(titulo.text.styleRuns.some((r) => Math.abs(runStyle(r, 'horizontalScale') - 0.8) < 0.01));
  const sub = group('Textos').children.find((l) => l.name.startsWith('Subtítulo'));
  assert.equal((sub.text.styleRuns?.[0]?.style.font ?? sub.text.style.font).name, 'Archivo-SemiBold');
  assert.equal(group('Respaldos en píxeles (no editar)').children.length, 3);
  // La sombra va como efecto completo: un contorno vacío deja a Photopea sin poder dibujar el documento.
  const shadow = titulo.effects?.dropShadow?.[0];
  assert.ok(shadow?.enabled && shadow.contour?.curve?.length >= 2, 'sombra con contorno válido');

  // Gráficos como píxeles en su lugar.
  const logo = group('Cabecera').children.find((l) => l.name === 'Logo');
  assert.ok(!logo.text && Math.abs(logo.left - 41) <= 3 && Math.abs(logo.top - 22) <= 3, `logo en ${logo.left},${logo.top}`);
});
