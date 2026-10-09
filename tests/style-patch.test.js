import test from 'node:test';
import assert from 'node:assert/strict';
import { patchElementStyle, mergeStyle } from '../studio/style-patch.js';

const doc = (body) => `<!doctype html>\r\n<html><head><style>.a{left:1px}</style></head>\r\n<body>\r\n${body}\r\n</body></html>\r\n`;

test('cambia sólo left/top dentro del style del elemento, el resto del archivo queda byte a byte', () => {
  const before = doc(`<h1 id="t" data-editable="true"\r\n    style="left:88px; top:288px;font-size:104px;">Hola<br>mundo</h1>\r\n<p id="o" data-editable="true" style="left:1px;top:2px;">x</p>`);
  const after = patchElementStyle(before, 't', { left: '120px', top: '300px' });
  assert.equal(after, before.replace('left:88px; top:288px;', 'left:120px; top:300px;'));
});

test('agrega propiedades faltantes y el atributo style si no existe', () => {
  assert.equal(mergeStyle('font-size:10px', { left: '5px' }), 'font-size:10px;left:5px;');
  const out = patchElementStyle(doc('<div id="d" data-editable="true">x</div>'), 'd', { left: '5px', top: '6px' });
  assert.match(out, /<div id="d" data-editable="true" style="left:5px;top:6px;">x<\/div>/);
});

test('respeta BOM, comillas simples, entidades y url() con ";"', () => {
  const before = '﻿' + doc(`<i id="b" data-editable="true" style='background:url("data:image/png;base64,AA");left:0px;top:0px'>&amp;</i>`);
  const after = patchElementStyle(before, 'b', { left: '7px' });
  assert.ok(after.startsWith('﻿<!doctype html>'));
  assert.ok(after.includes(`style="background:url(&quot;data:image/png;base64,AA&quot;);left:7px;top:0px">&amp;</i>`));
});

test('null quita la declaración; un duplicado de la misma propiedad se elimina', () => {
  assert.equal(mergeStyle('left:1px; top:2px; width:3px', { top: null }), 'left:1px; width:3px');
  assert.equal(mergeStyle('left:1px;top:2px;', { left: null }), 'top:2px;');
  assert.equal(mergeStyle('left:1px;top:2px;left:9px;', { left: '5px' }), 'left:5px;top:2px;');
  assert.equal(mergeStyle('left:1px;', { height: null }), 'left:1px;');
});

test('acepta width/height/font-size/rotate válidos y rechaza variantes peligrosas', () => {
  const html = doc('<img id="i" data-editable="true" style="left:0px;width:10px">');
  const out = patchElementStyle(html, 'i', { width: '20px', height: '15px', 'font-size': '12.5px', transform: 'rotate(-7.5deg)' });
  assert.match(out, /style="left:0px;width:20px;height:15px;font-size:12.5px;transform:rotate\(-7.5deg\);"/);
  assert.throws(() => patchElementStyle(html, 'i', { width: '-5px' }), /inválido/);
  assert.throws(() => patchElementStyle(html, 'i', { transform: 'scale(2)' }), /inválido/);
  assert.throws(() => patchElementStyle(html, 'i', { transform: 'rotate(1deg) translate(9px)' }), /inválido/);
});

test('rechaza propiedades no permitidas, valores raros, ids inexistentes o no editables', () => {
  const html = doc('<h1 id="t" data-editable="true" style="left:0px">x</h1><p id="n" style="left:0px">y</p>');
  assert.throws(() => patchElementStyle(html, 't', { color: 'red' }), /no permitida/);
  assert.throws(() => patchElementStyle(html, 't', { left: '1px;color:red' }), /inválido/);
  assert.throws(() => patchElementStyle(html, 'zzz', { left: '1px' }), /no existe/);
  assert.throws(() => patchElementStyle(html, 'n', { left: '1px' }), /data-editable/);
});
