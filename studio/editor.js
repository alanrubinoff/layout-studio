// Editor visual: muestra <proyecto>/post.html en un iframe escalado y edita elementos [data-editable]
// (mover, escalar, rotar, flechas, tamaño). Cada interacción terminada se guarda como UNA operación
// sobre el atributo style del elemento en post.html, y es una entrada de deshacer.
const $ = (id) => document.getElementById(id);
const frame = $('frame'), board = $('board'), hit = $('hit'), viewport = $('viewport');
const hoverBox = $('hover-box'), selBox = $('sel-box'), selLabel = $('sel-label'), refBox = $('ref-box'), refSheet = $('ref-sheet');

const state = {
  project: null,      // "<cliente>/<post>"
  base: null,         // URL de la carpeta del post, p. ej. /clientes/demo/posts/ejemplo
  revision: null,     // revisión de post.html que el editor tiene cargada
  size: { w: 1080, h: 1350 },
  zoom: 1, fit: true,
  selectedId: null,
  gesture: null,      // arrastre en curso: { kind: 'move'|'scale'|'rotate', el, start, g, before, ... }
  keyTxn: null,       // flechas / +− agrupadas: { el, before, timer }
  saving: 0,
  failed: null,       // { elementId, changes } pendiente de reintento
  conflict: false,
  undo: [], redo: [], // { id, before, after }
  reference: null,
  refSide: true, refOver: false, refOpacity: 50,
};

// ---------- Estado visible ----------
function setStatus(kind, text, action) {
  $('status').dataset.state = kind;
  $('status-text').textContent = text;
  $('status-action').textContent = action?.label ?? '';
  $('status-action').onclick = action?.run ?? null;
}

// ---------- Documento del iframe ----------
const doc = () => frame.contentDocument;
const view = () => frame.contentWindow;
const byId = (id) => (id ? doc()?.getElementById(id) : null);
const selected = () => byId(state.selectedId);
// Esquina del .canvas dentro del iframe (las coordenadas del diseño son relativas a ella).
const canvasOrigin = () => doc()?.querySelector('.canvas')?.getBoundingClientRect() ?? { left: 0, top: 0 };
const editableAt = (x, y) => {
  const o = canvasOrigin();
  return doc()?.elementFromPoint(x + o.left, y + o.top)?.closest('[data-editable="true"]') ?? null;
};
// Texto = tiene texto y no es ni contiene imágenes/SVG (un grupo como el sello es una pieza gráfica).
const isText = (el) => !['IMG', 'svg', 'VIDEO', 'CANVAS'].includes(el.tagName) && !el.querySelector('img, svg, video, canvas') && el.textContent.trim() !== '';
// Sólo se edita la rotación si transform está vacío o es un rotate() simple (no pisar otros transforms),
// y si el elemento no tiene escala horizontal (`scale`), porque rotar algo comprimido lo deformaría.
const canRotate = (el) => /^(rotate\(-?[\d.]+deg\))?$/.test(el.style.transform.trim()) && !el.style.scale;

// Geometría en píxeles del diseño (sin rotar) + rotación en grados.
// left/top son los valores CSS; vx/vy, w/h describen lo que se ve (incluye `scale`, p. ej. escala horizontal
// de un texto, con transform-origin 0 0 para que left/top sigan marcando la esquina visible).
function geom(el) {
  const cs = view().getComputedStyle(el);
  const left = parseFloat(cs.left) || 0, top = parseFloat(cs.top) || 0;
  const [sx = 1, sy = sx] = cs.scale && cs.scale !== 'none' ? cs.scale.split(/\s+/).map(Number) : [];
  const [ox = 0, oy = 0] = cs.transformOrigin.split(/\s+/).map(parseFloat);
  const w = (parseFloat(cs.width) || 0) * sx, h = (parseFloat(cs.height) || 0) * sy;
  const vx = left + ox * (1 - sx), vy = top + oy * (1 - sy);
  let rot = 0;
  const m = cs.transform.match(/^matrix\(([^)]+)\)/);
  if (m) { const [a, b] = m[1].split(',').map(Number); rot = Math.atan2(b, a) * 180 / Math.PI; }
  return { left, top, vx, vy, w, h, rot, cx: vx + w / 2, cy: vy + h / 2, fs: parseFloat(cs.fontSize) || 16 };
}

const PROPS = ['left', 'top', 'width', 'height', 'font-size', 'transform'];
const snapshot = (el, props = PROPS) => Object.fromEntries(props.map((p) => [p, el.style.getPropertyValue(p) || null]));
function applyProps(el, props) {
  for (const [p, v] of Object.entries(props)) v === null ? el.style.removeProperty(p) : el.style.setProperty(p, v);
}
const px = (n) => `${Math.round(n)}px`;
const half = (n) => Math.round(n * 2) / 2; // tamaños de fuente y grados de a 0.5
const fmt = (n) => String(Math.round(n * 10) / 10);

async function fetchRevision() {
  const r = await fetch(`/api/revision?project=${encodeURIComponent(state.project)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error((await r.json()).error);
  return (await r.json()).revision;
}

// Carga post.html en el iframe. Se pide la revisión antes y después de cargar: si difieren,
// el archivo cambió durante la carga y se vuelve a cargar, así revision siempre coincide con lo visible.
async function loadDocument() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await fetchRevision();
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.src = `${state.base}/post.html?r=${before}`;
    });
    await frame.contentDocument.fonts?.ready;
    const after = await fetchRevision();
    if (before === after) { state.revision = after; break; }
  }
  const canvas = doc().querySelector('.canvas') ?? doc().body;
  state.size = { w: canvas.offsetWidth || 1080, h: canvas.offsetHeight || 1350 };
  frame.style.width = state.size.w + 'px';
  frame.style.height = state.size.h + 'px';
  applyZoom();
  if (!selected()) state.selectedId = null;
  drawBoxes();
}

// ---------- Zoom (sólo visual: el iframe siempre mide lo mismo que el diseño) ----------
const sideVisible = () => state.refSide && !!state.reference;
function fitZoom() {
  // Márgenes de #stage: 24px a los lados, 32 arriba (título del panel) y 24 abajo.
  const panels = sideVisible() ? 2 : 1, gap = sideVisible() ? 24 : 0;
  return Math.min((viewport.clientWidth - 48 - gap) / (state.size.w * panels), (viewport.clientHeight - 56) / state.size.h, 2);
}
function applyZoom() {
  if (state.fit) state.zoom = fitZoom();
  state.zoom = Math.min(4, Math.max(0.1, state.zoom));
  frame.style.transform = `scale(${state.zoom})`;
  for (const sheet of [board, refSheet]) {
    sheet.style.width = state.size.w * state.zoom + 'px';
    sheet.style.height = state.size.h * state.zoom + 'px';
  }
  $('zoom-label').textContent = Math.round(state.zoom * 100) + '%';
  drawBoxes();
}
function setZoom(z) { state.fit = false; state.zoom = z; applyZoom(); }
const STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4];
$('zoom-in').onclick = () => setZoom(STEPS.find((s) => s > state.zoom + 0.001) ?? 4);
$('zoom-out').onclick = () => setZoom([...STEPS].reverse().find((s) => s < state.zoom - 0.001) ?? 0.1);
$('zoom-fit').onclick = () => { state.fit = true; applyZoom(); };
$('zoom-100').onclick = () => setZoom(1);
addEventListener('resize', () => state.fit && applyZoom());

// ---------- Overlay de selección (fuera del post) ----------
function placeBox(box, el) {
  if (!el) { box.style.display = 'none'; return; }
  const g = geom(el), z = state.zoom, origin = canvasOrigin();
  Object.assign(box.style, {
    display: 'block',
    left: (origin.left + g.vx) * z + 'px', top: (origin.top + g.vy) * z + 'px',
    width: g.w * z + 'px', height: g.h * z + 'px',
    transform: g.rot ? `rotate(${g.rot}deg)` : '',
  });
}
function drawBoxes(hoverEl) {
  const sel = selected();
  placeBox(selBox, sel);
  placeBox(refBox, sideVisible() ? sel : null); // mismo contorno sobre la referencia, para comparar
  placeBox(hoverBox, hoverEl && hoverEl !== sel ? hoverEl : null);
  if (sel) {
    selBox.classList.toggle('no-rotate', !canRotate(sel));
    const g = geom(sel), r = sel.getBoundingClientRect(), z = state.zoom;
    const size = isText(sel) ? `${fmt(g.fs)}px` : `${Math.round(g.w)}×${Math.round(g.h)}`;
    selLabel.textContent = `#${sel.id} · ${Math.round(g.left)}, ${Math.round(g.top)} · ${size}${g.rot ? ` · ${fmt(g.rot)}°` : ''}`;
    Object.assign(selLabel.style, { display: 'block', left: r.left * z + 'px', top: r.bottom * z + 8 + 'px' });
  } else {
    selLabel.style.display = 'none';
  }
  renderProps(sel);
}

// ---------- Barra de propiedades ----------
const propInputs = { x: $('prop-x'), y: $('prop-y'), size: $('prop-size'), rot: $('prop-rot') };
function renderProps(sel) {
  $('props').classList.toggle('on', !!sel);
  if (!sel) return;
  const g = geom(sel), text = isText(sel);
  $('prop-id').textContent = '#' + sel.id;
  $('prop-size-label').firstChild.textContent = text ? 'T ' : 'W ';
  $('prop-size-label').title = text ? 'Tamaño de fuente (px)' : 'Ancho (px)';
  const values = { x: Math.round(g.left), y: Math.round(g.top), size: text ? fmt(g.fs) : Math.round(g.w), rot: fmt(g.rot) };
  for (const [k, input] of Object.entries(propInputs)) {
    if (document.activeElement !== input) input.value = values[k];
  }
  propInputs.rot.disabled = !canRotate(sel);
}
function commitProp(key) {
  const el = selected(), v = parseFloat(propInputs[key].value);
  if (!el || !Number.isFinite(v)) return renderProps(el);
  flushKeyTxn();
  const before = snapshot(el), g = geom(el);
  if (key === 'x') applyProps(el, { left: px(v) });
  if (key === 'y') applyProps(el, { top: px(v) });
  if (key === 'rot' && canRotate(el)) applyProps(el, { transform: `rotate(${half(v)}deg)` });
  if (key === 'size' && v > 0) {
    if (isText(el)) applyProps(el, { 'font-size': `${half(v)}px` });
    else applyProps(el, { width: px(v), ...(el.style.height ? { height: px(g.h * v / g.w) } : {}) });
  }
  commit(el.id, before, snapshot(el));
  drawBoxes();
}
for (const [key, input] of Object.entries(propInputs)) {
  input.addEventListener('change', () => commitProp(key));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { renderProps(selected()); input.blur(); }
    e.stopPropagation(); // las flechas dentro del campo no mueven el elemento
  });
}

// ---------- Gestos con el mouse ----------
// Coordenadas del puntero en píxeles reales del diseño (independientes del zoom).
function designPoint(e) {
  const r = board.getBoundingClientRect(), origin = canvasOrigin();
  return { x: (e.clientX - r.left) / state.zoom - origin.left, y: (e.clientY - r.top) / state.zoom - origin.top };
}

function startGesture(kind, el, e, extra = {}) {
  if (state.conflict) return;
  if (state.failed && state.failed.elementId !== el.id) return; // primero resolver el guardado fallido
  flushKeyTxn();
  state.gesture = { kind, el, start: designPoint(e), g: geom(el), before: snapshot(el), text: isText(el), ...extra };
  e.target.setPointerCapture(e.pointerId);
  e.preventDefault();
}

hit.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !doc()) return;
  const p = designPoint(e);
  const el = editableAt(p.x, p.y);
  if (el?.id !== state.selectedId) flushKeyTxn();
  state.selectedId = el?.id ?? null;
  drawBoxes();
  if (el) startGesture('move', el, e);
});

for (const h of selBox.querySelectorAll('.handle')) {
  h.addEventListener('pointerdown', (e) => {
    const el = selected();
    if (e.button !== 0 || !el) return;
    e.stopPropagation();
    if (h.dataset.h === 'rot') startGesture('rotate', el, e);
    else startGesture('scale', el, e, { sx: h.dataset.h.includes('e') ? 1 : -1, sy: h.dataset.h.includes('s') ? 1 : -1 });
  });
}

function gestureChanges(gs, p, shift) {
  const { g } = gs;
  if (gs.kind === 'move') {
    return { left: px(g.left + p.x - gs.start.x), top: px(g.top + p.y - gs.start.y) };
  }
  if (gs.kind === 'rotate') {
    const a0 = Math.atan2(gs.start.y - g.cy, gs.start.x - g.cx), a = Math.atan2(p.y - g.cy, p.x - g.cx);
    let rot = g.rot + (a - a0) * 180 / Math.PI;
    rot = shift ? Math.round(rot / 15) * 15 : half(rot);
    rot = ((rot + 540) % 360) - 180;
    return { transform: `rotate(${fmt(rot)}deg)` };
  }
  // scale: proporcional, con la esquina opuesta fija en pantalla (también si el elemento está rotado).
  const rad = g.rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const rotV = (x, y) => ({ x: x * cos - y * sin, y: x * sin + y * cos });
  const o = rotV(-gs.sx * g.w / 2, -gs.sy * g.h / 2);
  const opp = { x: g.cx + o.x, y: g.cy + o.y };
  const d = rotV(gs.sx * g.w, gs.sy * g.h);
  let s = ((p.x - opp.x) * d.x + (p.y - opp.y) * d.y) / (d.x * d.x + d.y * d.y);
  s = Math.max(s, 8 / Math.max(1, Math.min(g.w, g.h)));
  const w2 = g.w * s, h2 = g.h * s;
  const o2 = rotV(-gs.sx * w2 / 2, -gs.sy * h2 / 2);
  const c2 = { x: opp.x - o2.x, y: opp.y - o2.y };
  // de esquina visible a left/top CSS (difieren sólo si hay `scale` con un origen distinto de 0 0)
  const changes = { left: px(c2.x - w2 / 2 - (g.vx - g.left)), top: px(c2.y - h2 / 2 - (g.vy - g.top)) };
  const inline = gs.before;
  if (gs.text) {
    changes['font-size'] = `${half(g.fs * s)}px`;
    if (inline.width) changes.width = px(w2);
  } else {
    changes.width = px(w2);
    if (inline.height) changes.height = px(h2);
  }
  return changes;
}

document.addEventListener('pointermove', (e) => {
  const gs = state.gesture;
  if (gs) {
    applyProps(gs.el, gestureChanges(gs, designPoint(e), e.shiftKey));
    drawBoxes();
    return;
  }
  if (e.target !== hit || !doc()) return;
  const p = designPoint(e);
  const el = editableAt(p.x, p.y);
  hit.classList.toggle('over', !!el && !state.conflict);
  drawBoxes(el);
});
hit.addEventListener('pointerleave', () => { if (!state.gesture) drawBoxes(); });

function endGesture() {
  const gs = state.gesture;
  if (!gs) return;
  state.gesture = null;
  commit(gs.el.id, gs.before, snapshot(gs.el)); // no guarda nada si no hubo cambio
}
document.addEventListener('pointerup', endGesture);
document.addEventListener('pointercancel', endGesture);

// ---------- Teclado: flechas y +/− agrupadas en una transacción ----------
function keyEdit(fn) {
  const el = selected();
  if (!el || state.conflict || state.gesture) return;
  if (state.keyTxn && state.keyTxn.el !== el) flushKeyTxn();
  state.keyTxn ??= { el, before: snapshot(el) };
  clearTimeout(state.keyTxn.timer);
  applyProps(el, fn(geom(el), el));
  drawBoxes();
  state.keyTxn.timer = setTimeout(flushKeyTxn, 500); // se guarda al dejar de tocar teclas
}
function flushKeyTxn() {
  const txn = state.keyTxn;
  if (!txn) return;
  clearTimeout(txn.timer);
  state.keyTxn = null;
  commit(txn.el.id, txn.before, snapshot(txn.el));
}

addEventListener('keydown', (e) => {
  if (e.target.closest('select, input')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod) return;
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && selected()) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1, [dx, dy] = arrows[e.key];
    keyEdit((g) => ({ left: px(g.left + dx * step), top: px(g.top + dy * step) }));
    return;
  }
  if (['+', '=', '-', '_'].includes(e.key)) {
    if (!selected()) { (e.key === '-' || e.key === '_' ? $('zoom-out') : $('zoom-in')).click(); return; }
    e.preventDefault();
    const sign = e.key === '-' || e.key === '_' ? -1 : 1;
    keyEdit((g, el) => isText(el)
      ? { 'font-size': `${Math.max(1, half(g.fs + sign * (e.shiftKey ? 4 : 1)))}px` }
      : { width: px(Math.max(4, g.w + sign * (e.shiftKey ? 10 : 2))), ...(el.style.height ? { height: px(Math.max(4, g.h * (g.w + sign * (e.shiftKey ? 10 : 2)) / g.w)) } : {}) });
    return;
  }
  if (e.key === '0') $('zoom-fit').click();
  if (e.key === '1') $('zoom-100').click();
  if (e.key === 'r' || e.key === 'R') $('ref-side-btn').click();
  if (e.key === 'o' || e.key === 'O') $('ref-over-btn').click();
  if (e.key === 'Escape') { flushKeyTxn(); state.selectedId = null; drawBoxes(); }
});

// ---------- Historial ----------
// Registra la diferencia entre antes y después como una entrada de deshacer y la guarda (una operación).
function commit(id, before, after) {
  const b = {}, a = {};
  for (const k of Object.keys(after)) if (before[k] !== after[k]) { b[k] = before[k]; a[k] = after[k]; }
  if (!Object.keys(a).length) return;
  state.undo.push({ id, before: b, after: a });
  state.redo = [];
  renderHistory();
  save(id, a);
}
function travel(from, to, side) {
  flushKeyTxn();
  if (state.conflict || state.gesture) return;
  const entry = from.pop();
  if (!entry) return;
  const el = byId(entry.id);
  if (!el) return renderHistory();
  applyProps(el, entry[side]);
  to.push(entry);
  state.selectedId = entry.id;
  drawBoxes();
  renderHistory();
  save(entry.id, entry[side]);
}
const undo = () => travel(state.undo, state.redo, 'before');
const redo = () => travel(state.redo, state.undo, 'after');
$('undo').onclick = undo;
$('redo').onclick = redo;
function renderHistory() {
  $('undo').disabled = !state.undo.length;
  $('redo').disabled = !state.redo.length;
}
function resetHistory() { state.undo = []; state.redo = []; renderHistory(); }

// ---------- Guardado ----------
let queue = Promise.resolve();
function save(elementId, changes) {
  state.saving++;
  queue = queue.then(() => doSave(elementId, changes)).finally(() => { state.saving--; });
  return queue;
}

async function doSave(elementId, changes) {
  if (state.conflict) return;
  setStatus('saving', 'Guardando…');
  try {
    const r = await fetch('/api/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: state.project, elementId, changes, expectedRevision: state.revision }),
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 409 && body.revision) {
      state.failed = null;
      state.conflict = true;
      setStatus('conflict', 'El archivo cambió fuera del editor; este cambio no se guardó', { label: 'Recargar', run: reloadAfterConflict });
      return;
    }
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    state.revision = body.revision;
    state.failed = null;
    setStatus('saved', 'Guardado');
  } catch (err) {
    // El cambio queda en pantalla; se puede reintentar con los mismos valores.
    state.failed = { elementId, changes };
    setStatus('error', `Error al guardar: ${err.message}`, { label: 'Reintentar', run: () => save(elementId, changes) });
  }
}

async function reloadAfterConflict() {
  state.conflict = false;
  state.failed = null;
  resetHistory();
  await loadDocument();
  setStatus('saved', 'Recargado desde el archivo');
}

addEventListener('beforeunload', (e) => {
  if (state.saving || state.failed || state.keyTxn) e.preventDefault();
});

// ---------- Cambios externos (Codex / Claude Code editando post.html) ----------
// Si el archivo cambia y no hay nada pendiente en el editor, se recarga solo.
const busy = () => state.gesture || state.keyTxn || state.saving;
setInterval(async () => {
  if (!state.project || busy() || state.conflict || document.hidden) return;
  let rev;
  try { rev = await fetchRevision(); } catch { return; }
  if (rev === state.revision || busy()) return;
  if (state.failed) {
    state.conflict = true;
    setStatus('conflict', 'El archivo cambió y hay un cambio sin guardar', { label: 'Recargar', run: reloadAfterConflict });
    return;
  }
  resetHistory(); // el historial se refería a la versión anterior del archivo
  await loadDocument();
  setStatus('saved', 'Actualizado desde el archivo');
}, 1000);

// ---------- Exportar PNG / PSD ----------
async function exportAs(format) {
  flushKeyTxn();
  await queue;
  if (state.failed || state.conflict) return setStatus('error', 'Resolvé el guardado pendiente antes de exportar');
  const buttons = [$('export'), $('export-psd')];
  buttons.forEach((b) => { b.disabled = true; });
  setStatus('saving', `Exportando ${format.toUpperCase()}…`);
  try {
    const r = await fetch('/api/export', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project: state.project, format }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
    $('status').title = body.file;
    if (format === 'psd') setStatus('saved', `PSD exportado · ${body.layers} capas`, { label: 'Abrir en Photopea', run: () => open(body.photopea, '_blank') });
    else setStatus('saved', `PNG exportado · ${body.width}×${body.height}`, { label: 'Abrir', run: () => open(`/${body.file}?t=${Date.now()}`, '_blank') });
  } catch (err) {
    setStatus('error', `Error al exportar: ${err.message}`);
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}
$('export').onclick = () => exportAs('png');
$('export-psd').onclick = () => exportAs('psd');

// ---------- Referencia: al lado y/o encima ----------
function renderRef() {
  const has = !!state.reference;
  $('ref-side-btn').disabled = $('ref-over-btn').disabled = !has;
  $('ref-side-btn').classList.toggle('on', has && state.refSide);
  $('ref-over-btn').classList.toggle('on', has && state.refOver);
  document.body.classList.toggle('ref-side', has && state.refSide);
  document.body.classList.toggle('ref-over', has && state.refOver);
  $('ref-over').style.opacity = state.refOpacity / 100;
  $('ref-opacity').value = state.refOpacity;
  localStorage.setItem('layout-studio.ref', JSON.stringify({ side: state.refSide, over: state.refOver, opacity: state.refOpacity }));
  applyZoom();
}
$('ref-side-btn').onclick = () => { state.refSide = !state.refSide; renderRef(); };
$('ref-over-btn').onclick = () => { state.refOver = !state.refOver; renderRef(); };
$('ref-opacity').oninput = (e) => { state.refOpacity = Number(e.target.value); renderRef(); };

async function loadReference() {
  const r = await fetch(`/api/reference?project=${encodeURIComponent(state.project)}`);
  state.reference = r.ok ? (await r.json()).reference : null;
  if (state.reference) {
    const src = `${state.base}/${encodeURIComponent(state.reference)}`;
    $('ref-img').src = $('ref-over').src = src;
    $('ref-name').textContent = `Referencia · ${state.reference}`;
  }
  try {
    const saved = JSON.parse(localStorage.getItem('layout-studio.ref') ?? '{}');
    state.refSide = saved.side ?? true; // al lado, visible por defecto
    state.refOver = saved.over ?? false;
    state.refOpacity = saved.opacity ?? 50;
  } catch {}
  renderRef();
}

// ---------- Inicio ----------
async function start() {
  renderHistory();
  const { projects } = await (await fetch('/api/projects')).json(); // [{ id: 'cliente/post', url }]
  if (!projects.length) { $('stage').style.display = 'none'; $('empty').style.display = 'block'; setStatus('idle', ''); return; }
  const wanted = new URLSearchParams(location.search).get('project');
  const current = projects.find((p) => p.id === wanted) ?? projects[0];
  state.project = current.id;
  state.base = current.url;

  // Selector agrupado por cliente.
  const select = $('project');
  const byClient = projects.reduce((m, p) => m.set(p.id.split('/')[0], [...(m.get(p.id.split('/')[0]) ?? []), p]), new Map());
  select.hidden = projects.length < 2;
  select.innerHTML = [...byClient].map(([client, ps]) => `<optgroup label="${client}">${ps.map((p) =>
    `<option value="${p.id}"${p.id === state.project ? ' selected' : ''}>${p.id.split('/')[1]}</option>`).join('')}</optgroup>`).join('');
  select.onchange = () => { location.search = `?project=${encodeURIComponent(select.value)}`; };
  $('project-name').textContent = projects.length < 2 ? `/ ${state.project}` : '';
  $('open-post').href = `${state.base}/post.html`;

  try {
    await loadReference();
    await loadDocument();
    setStatus('idle', 'Listo');
  } catch (err) {
    setStatus('error', `No se pudo abrir: ${err.message}`);
  }
}
start();
