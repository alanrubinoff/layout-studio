// Exporta el post.html de un proyecto a PNG a resolución real, renderizando el archivo solo (file://),
// sin el editor: espera fuentes e imágenes y captura exactamente el elemento .canvas.
// Uso:  npm run export -- demo/ejemplo   →  clientes/demo/posts/ejemplo/export/ejemplo.png
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, projectDirOrExit, exportPath } from './projects.js';

export async function launchBrowser() {
  const { chromium } = await import('playwright');
  // Chromium de Playwright; si no está descargado, Chrome o Edge instalados en el sistema.
  for (const options of [{}, { channel: 'chrome' }, { channel: 'msedge' }]) {
    try { return await chromium.launch(options); } catch {}
  }
  throw new Error('No hay navegador para exportar. Ejecutá: npx playwright install chromium');
}

export async function renderPng(projectDir) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(projectDir, 'post.html')).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
    });
    const canvas = page.locator('.canvas').first();
    if (!(await canvas.count())) throw new Error('post.html no tiene un elemento .canvas');
    const { width, height } = await canvas.evaluate((c) => ({ width: c.offsetWidth, height: c.offsetHeight }));
    await page.setViewportSize({ width, height });
    const buffer = await canvas.screenshot({ type: 'png', animations: 'disabled' });
    return { buffer, width, height };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = projectDirOrExit(process.argv[2], 'Uso: npm run export -- <proyecto>');
  const { buffer, width, height } = await renderPng(dir);
  const out = await exportPath(dir, 'png');
  await fs.writeFile(out, buffer);
  console.log(`${path.relative(ROOT, out).replaceAll('\\', '/')}  ${width}×${height}`);
}
