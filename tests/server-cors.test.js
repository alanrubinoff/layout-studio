// Photopea puede LEER archivos de clientes/ (para "Abrir en Photopea"); ningún otro sitio, y nadie de afuera
// puede guardar ni exportar.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../studio/server.js';

test('servidor: sólo photopea.com puede leer clientes/, nadie externo puede escribir', async (t) => {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const file = `${base}/clientes/demo/marca/logo.png`;

  const fromPhotopea = await fetch(file, { headers: { Origin: 'https://www.photopea.com' } });
  assert.equal(fromPhotopea.headers.get('access-control-allow-origin'), 'https://www.photopea.com');
  const fromOther = await fetch(file, { headers: { Origin: 'https://otro.example' } });
  assert.equal(fromOther.headers.get('access-control-allow-origin'), null);
  const outside = await fetch(`${base}/studio/server.js`, { headers: { Origin: 'https://www.photopea.com' } });
  assert.equal(outside.headers.get('access-control-allow-origin'), null, 'fuera de clientes/ no se habilita');

  const preflight = await fetch(file, { method: 'OPTIONS', headers: { Origin: 'https://www.photopea.com', 'Access-Control-Request-Private-Network': 'true' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

  for (const api of ['/api/save', '/api/export']) {
    const r = await fetch(base + api, { method: 'POST', headers: { Origin: 'https://www.photopea.com', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403, `${api} rechaza orígenes externos`);
  }
});
