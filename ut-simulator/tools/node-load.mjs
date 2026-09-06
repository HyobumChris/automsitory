// Load src/*.js classic scripts into a Node context for physics testing (no DOM).
// Usage (from ut-simulator/):  node tools/node-load.mjs [--upto 40] [--selftest]
// Or import { loadUT } from './tools/node-load.mjs' and call loadUT({ upto: 40 }) -> UT
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(here, '..', 'src');

export function loadUT(opts = {}) {
  const upto = opts.upto === undefined ? 999 : opts.upto;
  const sandbox = { console, setTimeout, clearTimeout, performance: globalThis.performance, Math, JSON, Date, Number, Float32Array, Map, Set, Array, Object, String, Boolean, Error, Promise, parseFloat, parseInt, isNaN, isFinite };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  sandbox.document = undefined;
  sandbox.navigator = { userAgent: 'node' };
  sandbox.localStorage = { _m: {}, getItem(k) { return this._m[k] === undefined ? null : this._m[k]; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
  const ctx = vm.createContext(sandbox);
  const files = fs.readdirSync(srcDir).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
  for (const f of files) {
    const n = parseInt(f.slice(0, 2), 10);
    if (n > upto) continue;
    if (opts.only && !opts.only.includes(f)) continue;
    const code = fs.readFileSync(path.join(srcDir, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  }
  return sandbox.UT;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--upto');
  const UT = loadUT({ upto: i >= 0 ? parseInt(args[i + 1], 10) : 999 });
  console.log('loaded UT modules:', Object.keys(UT).join(', '));
  if (args.includes('--selftest')) {
    for (const k of Object.keys(UT)) {
      if (UT[k] && typeof UT[k].__selftest === 'function') {
        const r = UT[k].__selftest();
        console.log(k, r.length ? 'FAIL ' + JSON.stringify(r) : 'ok');
      }
    }
  }
}
