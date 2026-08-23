import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = process.env.HISTOANNOTATOR_ROOT || path.resolve(here, '..');
export const APP_JS = process.env.HISTOANNOTATOR_APP_JS || path.join(ROOT, 'app', 'static', 'app.js');
export const source = fs.readFileSync(APP_JS, 'utf8');

export function extractFunction(name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const match = re.exec(source);
  if (!match) throw new Error(`Could not find function ${name} in ${APP_JS}`);
  const start = match.index;
  const parenStart = source.indexOf('(', match.index);
  let parenDepth = 0;
  let sigQuote = null;
  let sigEscape = false;
  let sigLineComment = false;
  let sigBlockComment = false;
  let parenEnd = -1;
  for (let i = parenStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';
    if (sigLineComment) { if (ch === '\n') sigLineComment = false; continue; }
    if (sigBlockComment) { if (ch === '*' && next === '/') { sigBlockComment = false; i += 1; } continue; }
    if (sigQuote) {
      if (sigEscape) sigEscape = false;
      else if (ch === '\\') sigEscape = true;
      else if (ch === sigQuote) sigQuote = null;
      continue;
    }
    if (ch === '/' && next === '/') { sigLineComment = true; i += 1; continue; }
    if (ch === '/' && next === '*') { sigBlockComment = true; i += 1; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { sigQuote = ch; continue; }
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) { parenEnd = i; break; }
    }
  }
  const braceStart = source.indexOf('{', parenEnd + 1);
  if (parenEnd < 0 || braceStart < 0) throw new Error(`Could not find body for ${name}`);

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1] || '';

    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated function ${name}`);
}

export function readConst(name) {
  const re = new RegExp(`\\bconst\\s+${name}\\s*=\\s*([^;]+);`);
  const match = source.match(re);
  if (!match) throw new Error(`Could not find const ${name}`);
  return vm.runInNewContext(match[1]);
}

export function makeContext(extra = {}) {
  const context = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    structuredClone: globalThis.structuredClone,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Promise,
    Map,
    Set,
    WeakMap,
    Date,
    Math,
    Number,
    Boolean,
    String,
    Array,
    Object,
    JSON,
    Error,
    encodeURIComponent,
    navigator: { onLine: true },
    window: { structuredClone: globalThis.structuredClone },
    ...extra,
  };
  vm.createContext(context);
  return context;
}

export function install(ctx, ...names) {
  for (const name of names) {
    const fn = vm.runInContext(`(${extractFunction(name)})`, ctx);
    ctx[name] = fn;
  }
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

export function rectangle(id, x1, y1, x2, y2) {
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1],
      ]],
    },
    properties: { classification: { name: id } },
  };
}

export function createFakeDraftDb(initial = []) {
  const records = new Map(initial.map((record) => [record.imageId, clone(record)]));
  const puts = [];

  const db = {
    transaction() {
      const tx = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore() {
          return {
            get(key) {
              const request = { result: undefined, error: null, onsuccess: null, onerror: null };
              queueMicrotask(() => {
                request.result = records.has(key) ? clone(records.get(key)) : undefined;
                request.onsuccess?.();
                queueMicrotask(() => tx.oncomplete?.());
              });
              return request;
            },
            put(record) {
              const copied = clone(record);
              records.set(copied.imageId, copied);
              puts.push(copied);
            },
          };
        },
      };
      return tx;
    },
  };

  return { db, records, puts };
}

