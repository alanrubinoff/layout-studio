// Actualiza propiedades inline de UN elemento dentro del texto HTML, sin re-serializar
// el documento: parse5 da los offsets exactos del tag y sólo se reemplaza ese rango.
import { parse } from 'parse5';

// Propiedades que el editor puede escribir y formato de valor aceptado.
// Un valor null significa "quitar la declaración" (lo usa deshacer cuando la propiedad no existía).
const PX = /^-?\d+(\.\d+)?px$/;
const POSITIVE_PX = /^\d+(\.\d+)?px$/;
export const ALLOWED = {
  left: PX,
  top: PX,
  width: POSITIVE_PX,
  height: POSITIVE_PX,
  'font-size': POSITIVE_PX,
  transform: /^rotate\(-?\d+(\.\d+)?deg\)$/,
  // escala horizontal de textos (la escribe `npm run fit`; el editor la conserva)
  'line-height': /^\d+(\.\d+)?$/,
  scale: /^\d+(\.\d+)?( \d+(\.\d+)?)?$/,
  'transform-origin': /^0 0$/,
};

export function validateChanges(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return 'changes inválido';
  const keys = Object.keys(changes);
  if (keys.length === 0) return 'changes vacío';
  for (const k of keys) {
    if (!ALLOWED[k]) return `propiedad no permitida: ${k}`;
    if (changes[k] === null) continue;
    if (typeof changes[k] !== 'string' || !ALLOWED[k].test(changes[k])) return `valor inválido para ${k}`;
  }
  return null;
}

function findById(node, id, found = []) {
  if (node.attrs?.some((a) => a.name === 'id' && a.value === id)) found.push(node);
  for (const child of node.childNodes ?? []) findById(child, id, found);
  if (node.content) findById(node.content, id, found); // <template>
  return found;
}

// Divide una declaración CSS inline en segmentos por ';', respetando comillas y paréntesis
// (url(data:...;...) no se rompe). Cada segmento conserva su espaciado original.
function splitDeclarations(css) {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) { if (c === quote && css[i - 1] !== '\\') quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (c === ';' && depth === 0) { parts.push(css.slice(start, i)); start = i + 1; }
  }
  parts.push(css.slice(start));
  return parts;
}

export function mergeStyle(style, changes) {
  const parts = splitDeclarations(style);
  const pending = new Map(Object.entries(changes));
  const done = new Set();
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(/^(\s*)([-\w]+)(\s*:\s*)(.*?)(\s*)$/s);
    if (!m) continue;
    const prop = m[2].toLowerCase();
    if (done.has(prop)) { parts[i] = null; continue; } // duplicado de una propiedad ya escrita: gana la nueva
    if (!pending.has(prop)) continue;
    const value = pending.get(prop);
    parts[i] = value === null ? null : m[1] + m[2] + m[3] + value + m[5];
    pending.delete(prop);
    done.add(prop);
  }
  let out = parts.filter((p) => p !== null).join(';');
  for (const [prop, value] of pending) {
    if (value === null) continue;
    if (out.trim() && !out.trimEnd().endsWith(';')) out = out.trimEnd() + ';';
    out += `${prop}:${value};`;
  }
  return out;
}

const escapeAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

// Devuelve el HTML nuevo. Lanza Error con .status para errores de cliente.
export function patchElementStyle(html, elementId, changes) {
  const fail = (status, msg) => Object.assign(new Error(msg), { status });
  const invalid = validateChanges(changes);
  if (invalid) throw fail(400, invalid);

  const doc = parse(html, { sourceCodeLocationInfo: true });
  const matches = findById(doc, elementId);
  if (matches.length === 0) throw fail(404, `no existe #${elementId}`);
  if (matches.length > 1) throw fail(409, `id duplicado: #${elementId}`);
  const el = matches[0];
  if (!el.attrs.some((a) => a.name === 'data-editable' && a.value === 'true')) {
    throw fail(403, `#${elementId} no tiene data-editable="true"`);
  }

  const loc = el.sourceCodeLocation;
  const tag = loc?.startTag;
  if (!tag || html[tag.startOffset] !== '<') throw fail(500, 'no se pudo ubicar el tag en el archivo');

  const styleLoc = loc.attrs?.style;
  if (styleLoc) {
    const raw = html.slice(styleLoc.startOffset, styleLoc.endOffset);
    const m = raw.match(/^style(\s*=\s*)(["']?)([\s\S]*?)\2$/i);
    if (!m) throw fail(500, 'atributo style con formato inesperado');
    const current = el.attrs.find((a) => a.name === 'style').value; // ya decodificado
    const next = `style${m[1]}"${escapeAttr(mergeStyle(current, changes))}"`;
    return html.slice(0, styleLoc.startOffset) + next + html.slice(styleLoc.endOffset);
  }
  // Sin atributo style: insertarlo justo antes del cierre del start tag.
  const end = html[tag.endOffset - 2] === '/' ? tag.endOffset - 2 : tag.endOffset - 1;
  const insert = ` style="${escapeAttr(mergeStyle('', changes))}"`;
  return html.slice(0, end) + insert + html.slice(end);
}
