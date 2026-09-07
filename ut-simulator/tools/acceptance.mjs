// UTsim acceptance runner (SPEC-v2 §6.1 / E1).
//
// Usage:
//   [NODE_PATH=…] node tools/acceptance.mjs [--file path/to/utman_simulator.html] [--json out.json]
//                                           [--only v1|v2] [--grep <substring>] [--verbose]
//
// Boots the built single-file simulator in headless Chromium (tools/qa-helpers.mjs launch()), runs every
// v1 acceptance check of SPEC §11.1 (#1–#14) and every v2 check of SPEC-v2 §9 (V2-1 … V2-27), prints a
// table, writes a JSON report and exits 1 when any check fails.
//
// Every check is a small named async function returning {name, pass, detail}; a check that throws is
// reported as failed with the exception text. Checks that need a fresh page (scenario URL loading,
// viewport scaling) launch a second browser through launch(). Timing budgets (SPEC-v2 §6.4) are relaxed
// ×2 when process.env.CI is set. playwright is resolved from NODE_PATH, /opt/node22/lib/node_modules or
// `npm root -g` (see resolvePlaywright) so the runner works both locally and in the CI job of §6.2.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const REPO = path.resolve(here, '..', '..');            // repository root (utman_simulator.html lives here)
const SIM_DIR = path.resolve(here, '..');                // ut-simulator/
const CI = !!process.env.CI && process.env.CI !== '0' && process.env.CI !== 'false';
const TIME_FACTOR = CI ? 2 : 1;

// ---------------------------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
function argOf(name, dflt) { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; }
const FILE = path.resolve(argOf('--file', path.join(REPO, 'utman_simulator.html')));
const JSON_OUT = argOf('--json', null);
const ONLY = argOf('--only', null);
const GREP = argOf('--grep', null);
const VERBOSE = argv.includes('--verbose');
if (ONLY && ONLY !== 'v1' && ONLY !== 'v2') { console.error('--only expects v1 or v2'); process.exit(2); }

// ---------------------------------------------------------------------------------------------- playwright
/** Make `require('playwright')` resolvable: NODE_PATH, the local global root, then `npm root -g`. */
function resolvePlaywright() {
  const tryResolve = () => { try { require.resolve('playwright'); return true; } catch (e) { return false; } };
  if (tryResolve()) return true;
  const candidates = [];
  if (process.env.NODE_PATH) candidates.push(...process.env.NODE_PATH.split(path.delimiter));
  candidates.push('/opt/node22/lib/node_modules');
  try { candidates.push(execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch (e) { /* npm absent */ }
  for (const dir of candidates) {
    if (!dir || !fs.existsSync(path.join(dir, 'playwright'))) continue;
    process.env.NODE_PATH = [dir].concat(process.env.NODE_PATH ? process.env.NODE_PATH.split(path.delimiter) : []).join(path.delimiter);
    Module._initPaths();
    if (tryResolve()) return true;
  }
  return false;
}
if (!resolvePlaywright()) {
  console.error('playwright not found: set NODE_PATH to a node_modules dir containing playwright (npm i -g playwright@1.56.0)');
  process.exit(2);
}
const { launch, TOOLBAR_IDS } = await import('./qa-helpers.mjs');

// ---------------------------------------------------------------------------------------------- assertion helper
/** Collects assertion failures; result() gives {pass, detail}. */
function checker() {
  const fails = [];
  const notes = [];
  const fmt = (v) => typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : JSON.stringify(v);
  const A = {
    ok(cond, label) { if (!cond) fails.push(label); return !!cond; },
    near(actual, expected, tol, label) {
      const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol + 1e-9;
      if (!ok) fails.push(`${label}: ${fmt(actual)} (expected ${fmt(expected)} ± ${fmt(tol)})`);
      return ok;
    },
    range(actual, lo, hi, label) {
      const ok = Number.isFinite(actual) && actual >= lo - 1e-9 && actual <= hi + 1e-9;
      if (!ok) fails.push(`${label}: ${fmt(actual)} (expected ${fmt(lo)}…${fmt(hi)})`);
      return ok;
    },
    le(actual, limit, label) { const ok = Number.isFinite(actual) && actual <= limit + 1e-9; if (!ok) fails.push(`${label}: ${fmt(actual)} (expected ≤ ${fmt(limit)})`); return ok; },
    ge(actual, limit, label) { const ok = Number.isFinite(actual) && actual >= limit - 1e-9; if (!ok) fails.push(`${label}: ${fmt(actual)} (expected ≥ ${fmt(limit)})`); return ok; },
    eq(actual, expected, label) { const ok = actual === expected; if (!ok) fails.push(`${label}: ${fmt(actual)} (expected ${fmt(expected)})`); return ok; },
    note(s) { notes.push(s); },
    fail(s) { fails.push(s); },
    result() { return { pass: fails.length === 0, detail: (fails.length ? 'FAIL ' + fails.join(' | ') : 'ok') + (notes.length ? ' — ' + notes.join('; ') : '') }; },
  };
  return A;
}
const dB = (a, b) => 20 * Math.log10(a / b);

// ---------------------------------------------------------------------------------------------- page helpers
/** Installed once into the page: pure helpers on window.ACC. */
const PAGE_HELPERS = `
window.ACC = {
  E() { return UT.test.echoes(); },
  best(re, extra) { const rx = re instanceof RegExp ? re : new RegExp(re); let b = null; for (const e of UT.test.echoes()) { if (!rx.test(e.kind || '')) continue; if (extra && !extra(e)) continue; if (!b || e.ampPct > b.ampPct) b = e; } return b; },
  bestNear(re, path, tol) { return this.best(re, e => Math.abs(e.path - path) <= tol); },
  scanX(x0, x1, step, pick) { const out = []; let best = null; for (let x = x0; x <= x1 + 1e-9; x += step) { UT.test.setProbe({ x }); const v = pick(UT.test.echoes(), x); out.push({ x, v }); if (v && (!best || v.ampPct > best.v.ampPct)) best = { x, v }; } return { out, best }; },
  reset() {
    const d = UT.defaultState();
    try { if (UT.lessons && UT.lessons.stop) UT.lessons.stop(); } catch (e) {}
    try { if (UT.aut && UT.aut.stopScan) UT.aut.stopScan(true); } catch (e) {}
    try { if (UT.tofd && UT.tofd.stopScan) UT.tofd.stopScan(true); } catch (e) {}
    try { if (UT.pa && UT.pa.stopScan) UT.pa.stopScan(true); } catch (e) {}
    try { for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w && w.isOpen && w.isOpen()) w.close(); } } catch (e) {}
    try { if (UT.app && UT.app.closeMenus) UT.app.closeMenus(); } catch (e) {}
    const keep = ['specimen', 'mode', 'status', 'lessons'];
    const patch = {};
    for (const k of Object.keys(d)) if (keep.indexOf(k) < 0) patch[k] = d[k];
    patch.display = Object.assign({}, d.display, { sound: false, touchBar: 'off' });
    patch.lessons = Object.assign({}, d.lessons, { progress: (UT.state.lessons && UT.state.lessons.progress) || {} });
    UT.set(patch, { noRender: true, silent: true });
    try { if (UT.standards && UT.standards.applyProcedure) UT.standards.applyProcedure(null); } catch (e) {}
    try { if (UT.standards && UT.standards.dgs && UT.standards.dgs.setReference) UT.standards.dgs.setReference(null); } catch (e) {}
    UT.test.enterMode('weld', { silentUI: true });
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.set({ probe: Object.assign({}, d.probe), instrument: Object.assign({}, d.instrument), physics: Object.assign({}, d.physics), damping: Object.assign({}, d.damping) }, { noRender: true });
    UT.test.setDefects([]);
    if (UT.app && UT.app.setLang) UT.app.setLang('en');
    UT.renderNow();
    return UT.state.mode;
  },
  /** −6 dB width (mm) of the strongest sample bump inside [pathLo, pathHi] of the current A-scan. */
  pulseWidth(pathLo, pathHi) {
    const a = UT.test.ascan(); const s = a.samples, n = s.length, mmPer = a.range / n;
    let iPk = -1, pk = -1;
    for (let i = 0; i < n; i++) { const p = a.delay + i * mmPer; if (p < pathLo || p > pathHi) continue; if (s[i] > pk) { pk = s[i]; iPk = i; } }
    if (iPk < 0) return null;
    const half = pk / 2;
    let l = iPk; while (l > 0 && s[l] > half) l--;
    let r = iPk; while (r < n - 1 && s[r] > half) r++;
    const fl = s[l] === s[l + 1] ? l : l + (half - s[l]) / (s[l + 1] - s[l]);
    const fr = s[r] === s[r - 1] ? r : r - (half - s[r]) / (s[r - 1] - s[r]);
    return { width: (fr - fl) * mmPer, peak: pk, path: a.delay + iPk * mmPer };
  },
  gatedPeak() { const r = UT.test.readouts(); return r && r.primary ? r.primary.peakPct : 0; },
  countUi(kind) { const c = { n: 0 }; const fn = (e) => { if (!kind || (e && e.kind === kind)) c.n++; }; UT.bus.on('ui', fn); c.stop = () => { UT.bus.off('ui', fn); return c.n; }; return c; },
  greyPixels(id) { const cv = document.getElementById(id); if (!cv) return -1; const ctx = cv.getContext('2d'); const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], g = d[i + 1], b = d[i + 2]; if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12 && r > 90 && r < 200) k++; } return k; },
};
`;

async function installHelpers(page) { await page.evaluate(PAGE_HELPERS); }

// ---------------------------------------------------------------------------------------------- checks
/** @type {{name:string, group:'v1'|'v2', timeout?:number, fn:(ctx)=>Promise<{pass:boolean, detail:string}>}[]} */
const CHECKS = [];
function check(name, group, fn, opts) { CHECKS.push(Object.assign({ name, group, fn }, opts || {})); }

// =============================================================================================== v1 (SPEC §11.1)
check('V1-1 0° backwall multiples + initial pulse', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('v1', { face: 'narrow' });
    UT.test.setProbe({ angle: 0, x: 150, crystal: 'single' });
    UT.test.setInstrument({ range: 125, gain: 30 });
    UT.test.compute();
    const bw = [25, 50, 75, 100].map(p => ACC.bestNear(/backwall/, p, 0.5));
    const init = UT.test.ascan().initialPulse;
    UT.test.setProbe({ crystal: 'twin' }); UT.test.compute();
    const initTwin = UT.test.ascan().initialPulse;
    UT.test.setProbe({ crystal: 'single' });
    return { bw: bw.map(e => e && { path: e.path, amp: e.ampPct }), init, initTwin };
  });
  r.bw.forEach((e, i) => { A.ok(!!e, `backwall ${(i + 1) * 25} mm present (±0.5)`); if (e) A.near(e.path, (i + 1) * 25, 0.5, `backwall ${i + 1} path`); });
  for (let i = 1; i < 4; i++) if (r.bw[i] && r.bw[i - 1]) A.range(dB(r.bw[i - 1].amp, r.bw[i].amp), 2, 5, `drop ${i}→${i + 1} dB`);
  A.eq(r.init, true, 'initial pulse (single)');
  A.eq(r.initTwin, false, 'no initial pulse (twin)');
  A.note('amps ' + r.bw.map(e => e ? e.amp.toFixed(1) : '-').join('/'));
  return A.result();
});

check('V1-2 V1 100 mm radius (all angles) + V2 radii', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const out = { v1: {}, v2: {} };
    UT.test.loadSpecimen('v1', { face: 'wide' });
    for (const a of [0, 45, 60, 70]) {
      UT.test.setProbe({ angle: a, x: 100, side: 1 }); UT.test.setInstrument({ range: 400, gain: 30 }); UT.test.compute();
      out.v1[a] = [100, 200, 300].map(p => { const e = ACC.bestNear(/./, p, 1); return e && { path: e.path, amp: e.ampPct, kind: e.kind }; });
    }
    out.status = UT.state.status.mid;
    UT.test.loadSpecimen('v2', { face: 'wide' });
    UT.test.setProbe({ angle: 45, x: 60, side: 1 }); UT.test.setInstrument({ range: 250 }); UT.test.compute();
    out.v2.plus = [25, 100, 175].map(p => { const e = ACC.bestNear(/./, p, 1); return e && { path: e.path, amp: e.ampPct }; });
    UT.test.setProbe({ side: -1 }); UT.test.compute();
    out.v2.minus = [50, 125, 200].map(p => { const e = ACC.bestNear(/./, p, 1); return e && { path: e.path, amp: e.ampPct }; });
    return out;
  });
  for (const a of [0, 45, 60, 70]) {
    const es = r.v1[a];
    es.forEach((e, i) => A.ok(!!e, `${a}° echo ${(i + 1) * 100} mm`));
    for (let i = 1; i < 3; i++) if (es[i] && es[i - 1]) A.ok(es[i].amp < es[i - 1].amp, `${a}° decreasing ${i}`);
  }
  A.ok(/100mm Radius\. Echoes 100, 200, 300, 400 etc/.test(r.status || ''), 'status text: ' + r.status);
  r.v2.plus.forEach((e, i) => A.ok(!!e, `V2 side+1 echo ${[25, 100, 175][i]}`));
  r.v2.minus.forEach((e, i) => A.ok(!!e, `V2 side−1 echo ${[50, 125, 200][i]}`));
  for (const k of ['plus', 'minus']) for (let i = 1; i < 3; i++) if (r.v2[k][i] && r.v2[k][i - 1]) A.ok(r.v2[k][i].amp < r.v2[k][i - 1].amp, `V2 ${k} decreasing ${i}`);
  return A.result();
});

check('V1-3 wedge angles 60/45/70', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => { UT.test.loadSpecimen('plate-weld', { T: 20 }); return [60, 45, 70].map(a => UT.test.setProbe({ angle: a }).wedgeAngle); });
  A.near(r[0], 47.1, 0.2, '60° wedge'); A.near(r[1], 36.7, 0.2, '45° wedge'); A.near(r[2], 52.6, 0.2, '70° wedge');
  A.note('wedge ' + r.map(v => v.toFixed(2)).join('/'));
  return A.result();
});

check('V1-4 IOW 13 mm SDH path 26.0 and maximum at x 262.5', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow');
    UT.test.setProbe({ angle: 60, side: 1, x: 262.5 }); UT.test.setInstrument({ range: 100, gain: 40 });
    const pick = (E) => { let b = null; for (const e of E) if (/sdh/.test(e.kind) && e.path > 18 && e.path < 34 && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    const s = ACC.scanX(257.5, 267.5, 0.5, pick);
    UT.test.setProbe({ x: 262.5 }); UT.test.compute();
    const at = pick(UT.test.echoes());
    return { at: at && { path: at.path, amp: at.ampPct }, best: s.best && { x: s.best.x, amp: s.best.v.ampPct } };
  });
  A.ok(!!r.at, 'SDH echo at x 262.5'); if (r.at) A.near(r.at.path, 26.0, 0.5, 'SDH path');
  A.ok(!!r.best, 'scan found SDH'); if (r.best) A.near(r.best.x, 262.5, 0.5, 'max-amplitude x');
  return A.result();
});

check('V1-5 readouts SP/SD/DP for the IOW SDH', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow');
    UT.test.setProbe({ angle: 60, side: 1, x: 262.5 }); UT.test.setInstrument({ range: 100, gain: 40, gates: [{ on: true, start: 18, width: 16, level: 20 }] });
    UT.test.compute();
    const p = UT.test.readouts().primary; return p && { sp: p.path, sd: p.sd, dp: p.dp, kind: p.echoKind };
  });
  A.ok(!!r, 'primary readout'); if (r) { A.near(r.sp, 26.0, 0.5, 'SP'); A.near(r.sd, 22.5, 0.5, 'SD'); A.near(r.dp, 13.0, 0.5, 'DP'); }
  return A.result();
});

check('V1-6 +6 dB doubles amplitude; dB softkeys set gain', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow');
    UT.test.setProbe({ angle: 60, side: 1, x: 262.5 }); UT.test.setInstrument({ range: 100, gain: 26, gates: [{ on: true, start: 18, width: 16, level: 5 }] });
    UT.test.compute(); const p1 = ACC.gatedPeak();
    UT.test.setInstrument({ gain: 32 }); UT.test.compute(); const p2 = ACC.gatedPeak();
    UT.set({ utSet: 'epoch600' }); UT.renderNow();
    const keys = {};
    for (const g of [10, 20, 30, 40, 60]) {
      const btn = Array.from(document.querySelectorAll('#instrument button')).find(b => b.textContent.trim() === g.toFixed(1) + 'dB');
      if (!btn) { keys[g] = 'missing'; continue; }
      btn.click(); UT.renderNow(); keys[g] = UT.state.instrument.gain;
    }
    return { p1, p2, keys };
  });
  A.ok(r.p1 > 0 && r.p2 < 120, `unclipped peaks ${r.p1.toFixed(1)} → ${r.p2.toFixed(1)}`);
  A.near(r.p2 / r.p1, 2, 0.1, 'ratio for +6 dB');
  for (const g of [10, 20, 30, 40, 60]) A.eq(r.keys[g], g, `softkey ${g} dB`);
  return A.result();
});

check('V1-7 range 100: 50 mm echo at division 5.0; delay 20 → 3.0', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('v1', { face: 'narrow' });
    UT.test.setProbe({ angle: 0, x: 150, crystal: 'single' });
    UT.test.setInstrument({ range: 100, delay: 0, gain: 30, gates: [{ on: true, start: 45, width: 10, level: 5 }] });
    UT.test.compute();
    const a = UT.test.readouts().primary;
    UT.test.setInstrument({ delay: 20 }); UT.test.compute();
    const b = UT.test.readouts().primary;
    return { x1: a && a.xDiv, p1: a && a.path, x2: b && b.xDiv, p2: b && b.path };
  });
  A.near(r.p1, 50, 0.5, 'gated echo path'); A.near(r.x1, 5.0, 0.05, 'xDiv at delay 0'); A.near(r.x2, 3.0, 0.05, 'xDiv at delay 20');
  return A.result();
});

check('V1-8 root crack corner echo (60°)', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const pick = (E) => { let b = null; for (const e of E) if (e.kind === 'corner' && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    UT.test.loadSpecimen('plate-weld', { T: 20, rootHeight: 0, capHeight: 0 });
    UT.test.setDefects([]); UT.test.addPreset('rootCrack');
    UT.test.setProbe({ angle: 60, side: 1, x: 34.6 }); UT.test.setInstrument({ range: 100, gain: 40 });
    const s = ACC.scanX(24, 45, 0.5, pick);
    const far = [19.6, 49.6].map(x => { UT.test.setProbe({ x }); return pick(UT.test.echoes()); });
    UT.test.loadSpecimen('plate-weld', Object.assign({}, UT.defaultState().weldOpts, { T: 20 }));
    UT.test.setDefects([]); const d = UT.test.addPreset('rootCrack');
    UT.test.setProbe({ angle: 60, side: 1, x: 38 });
    const pick40 = (E) => { let b = null; for (const e of E) if (e.kind === 'corner' && Math.abs(e.path - 40) <= 2 && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    const s2 = ACC.scanX(28, 48, 0.5, pick40);
    UT.test.setProbe({ x: 38 }); const at38 = pick40(UT.test.echoes());
    return { best: s.best && { x: s.best.x, path: s.best.v.path, amp: s.best.v.ampPct }, far: far.map(e => e ? e.ampPct : 0),
      ys: d ? d.pts.map(p => p.y) : null, best2: s2.best && { x: s2.best.x, path: s2.best.v.path, amp: s2.best.v.ampPct }, at38: at38 && { path: at38.path, amp: at38.ampPct } };
  });
  A.ok(!!r.best, 'corner echo (flat plate)');
  if (r.best) { A.near(r.best.path, 40, 1, 'corner path'); A.near(r.best.x, 34.6, 3, 'corner max x'); r.far.forEach((a, i) => A.ok(a === 0 || dB(a, r.best.amp) <= -20, `corner gone ±15 mm (${i}): ${a.toFixed(2)} vs ${r.best.amp.toFixed(1)}`)); }
  A.ok(r.ys && Math.min(...r.ys) === 17 && Math.max(...r.ys) === 21.5, 'default-weld preset spans y 17…21.5: ' + JSON.stringify(r.ys));
  A.ok(!!r.best2 && !!r.at38, 'corner echo (default weld) at path ≈ 40');
  if (r.best2 && r.at38) { A.near(r.at38.path, 40, 2, 'default-weld corner path at x 38'); A.ge(dB(r.at38.amp, r.best2.amp), -1, `corner at x 38 within 1 dB of the scan maximum (max ${r.best2.amp.toFixed(1)} % at x ${r.best2.x})`); }
  return A.result();
});

check('V1-9 LOF second-leg maximum; 45° ≥ 6 dB below 60°', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.setDefects([]); const d = UT.test.addPreset('lof');
    const mid = { x: (d.pts[0].x + d.pts[1].x) / 2, y: (d.pts[0].y + d.pts[1].y) / 2 };
    const pick = (E) => { let b = null; for (const e of E) if (e.defectId === d.id && e.kind !== 'tip' && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    UT.test.setInstrument({ range: 100, gain: 40 });
    UT.test.setProbe({ angle: 60, side: 1, x: 60 });
    const s60 = ACC.scanX(45, 70, 0.5, pick);
    UT.test.setProbe({ angle: 45, side: 1, x: 45 });
    const s45 = ACC.scanX(35, 60, 0.5, pick);
    return { xExp: mid.x + (40 - mid.y) * Math.tan(Math.PI / 3), mid, b60: s60.best && { x: s60.best.x, amp: s60.best.v.ampPct }, b45: s45.best && { x: s45.best.x, amp: s45.best.v.ampPct }, wo: UT.state.weldOpts };
  });
  A.ok(!!r.b60, '60° LOF echo');
  if (r.b60) A.near(r.b60.x, r.xExp, 4, `60° max x (expected ≈ ${r.xExp.toFixed(1)})`);
  // The 45° probe cannot return specularly from the 30° bevel: any LOF echo it shows must be ≥ 6 dB below the 60° maximum;
  // no 45° echo at all (the v2 z-profile law removes the last weak leg-4 mode-converted artefact) satisfies this trivially.
  if (r.b60 && r.b45) A.le(dB(r.b45.amp, r.b60.amp), -6, '45° best vs 60° best (dB)');
  else if (r.b60) A.note('no 45° LOF echo (≥ 6 dB below 60° trivially)');
  A.note(`bevel ${r.wo.bevel} gap ${r.wo.rootGap} face ${r.wo.rootFace}`);
  return A.result();
});

check('V1-10 lamination echo at depth; backwall −6 dB', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('lamination-plate');
    UT.test.setDefects([]); const d = UT.test.addPreset('lamination');
    const y = d.pts[0].y, xc = (d.pts[0].x + d.pts[1].x) / 2;
    UT.test.setInstrument({ range: 100, gain: 30 });
    UT.test.setProbe({ angle: 0, x: -100, z: (d.zFrom + d.zTo) / 2 }); UT.test.compute();
    const bwClean = ACC.bestNear(/backwall/, UT.state.specimen.T, 1);
    UT.test.setProbe({ x: xc }); UT.test.compute();
    const lam = ACC.best(/lamination/); const bwOver = ACC.bestNear(/backwall/, UT.state.specimen.T, 1);
    return { y, T: UT.state.specimen.T, lam: lam && { path: lam.path, amp: lam.ampPct }, bwClean: bwClean && bwClean.ampPct, bwOver: bwOver ? bwOver.ampPct : 0 };
  });
  A.ok(!!r.lam, 'lamination echo'); if (r.lam) A.near(r.lam.path, r.y, 0.5, 'lamination depth');
  A.ok(r.bwClean > 0, 'clean backwall present');
  if (r.bwClean > 0) A.le(dB(Math.max(r.bwOver, 1e-6), r.bwClean), -6, 'backwall drop dB');
  return A.result();
});

check('V1-11 TOFD lateral/backwall times, tips, depthFromTime', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.setDefects([{ n: 1, type: 'planar', pts: [{ x: 0, y: 8 }, { x: 0, y: 13 }], zFrom: 120, zTo: 180, label: 'Defect 1' }]);
    UT.test.enterMode('tofd', { silentUI: true });
    UT.setIn('tofd', { pcs: 60, txAngle: 60 }); UT.setIn('probe', { z: 150, freq: 5 }); UT.renderNow();
    const t = UT.test.tofd();
    const g = UT.tofd.derive(UT.state);
    return { lat: t.lateralUs, bw: t.backwallUs, tips: t.events.filter(e => /tip/.test(e.kind) && !/modeconv/.test(e.kind)).map(e => e.tUs), depth: UT.tofd.depthFromTime(t.backwallUs, g), wd: g.wd };
  });
  A.near(r.lat, 18.93, 0.05, 'lateralUs'); A.near(r.bw, 20.98, 0.05, 'backwallUs');
  A.ok(r.tips.length >= 1, 'tip events present'); r.tips.forEach((t, i) => A.ok(t > r.lat && t < r.bw, `tip ${i} between lateral and backwall (${t.toFixed(2)})`));
  A.near(r.depth, 20, 0.1, 'depthFromTime(backwall)');
  return A.result();
});

check('V1-12 AUT gate-1 above level only within z 110…160', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20, rootHeight: 0, capHeight: 0 });
    UT.test.setDefects([]); UT.test.addPreset('rootCrack', { zFrom: 120, length: 30 });
    UT.test.setProbe({ angle: 60, side: 1, x: 34.6 }); UT.test.setInstrument({ range: 100, gain: 34 });
    UT.test.enterMode('aut', { silentUI: true });
    UT.setIn('aut', { x: 34.6, gates: UT.state.aut.gates.map((g, i) => i === 0 ? Object.assign({}, g, { on: true, start: 30, width: 20, level: 20 }) : g) });
    UT.setIn('probe', { x: 34.6, angle: 60, side: 1 }); UT.renderNow();
    const s = UT.test.runAutScan();
    return { iv: s.aboveLevel && s.aboveLevel[0], n: s.n };
  });
  A.ok(Array.isArray(r.iv) && r.iv.length >= 1, 'gate-1 has an above-level interval');
  if (Array.isArray(r.iv)) for (const [a, b] of r.iv) { A.range(a, 110, 130, 'interval start'); A.range(b, 140, 160, 'interval end'); }
  A.note('intervals ' + JSON.stringify(r.iv));
  return A.result();
});

check('V1-13 trade start(42) deterministic; truth rows score 100', 'v1', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const t1 = JSON.stringify(UT.test.trade.start(42) || UT.test.trade.truth());
    const t2 = JSON.stringify(UT.test.trade.start(42) || UT.test.trade.truth());
    const truth = UT.test.trade.truth();
    const rows = truth.map(t => ({ n: t.n, z: t.zFrom, length: t.zTo - t.zFrom, depth: t.depth, type: t.type }));
    const score = UT.test.trade.submit(rows);
    return { same: t1 === t2, n: truth.length, score };
  });
  A.ok(r.same, 'same truth twice'); A.eq(r.score, 100, 'score'); A.note(`${r.n} defects`);
  return A.result();
});

check('V1-14 build: size, no external URLs, no console errors (load + toolbar)', 'v1', async ({ page, errors, bootErrors, file }) => {
  const A = checker();
  const html = fs.readFileSync(file, 'utf8');
  const size = Buffer.byteLength(html);
  A.le(size, 2.5 * 1024 * 1024, 'size bytes (SPEC-v2 V2-26 budget < 2.5 MB; v1 said 900 kB)');
  const ext = html.match(/(?:src|href)="https?:\/\/[^"]+"/g) || [];
  A.eq(ext.length, 0, 'external src/href URLs: ' + ext.slice(0, 3).join(','));
  A.eq(bootErrors.length, 0, 'console errors on load: ' + bootErrors.slice(0, 3).join(' ; '));
  const k0 = errors.length;
  for (const id of TOOLBAR_IDS) {
    const k = errors.length;
    const exists = await page.$('#' + id);
    if (!exists) { A.fail('missing #' + id); continue; }
    await page.evaluate(id => UT.test.click(id), id); await page.waitForTimeout(60);
    await page.evaluate(id => UT.test.click(id), id); await page.waitForTimeout(30);
    if (errors.length > k) A.fail(`${id}: ${errors.slice(k).join(' ; ')}`);
  }
  A.note(`${(size / 1024).toFixed(0)} kB, ${errors.length - k0} toolbar errors`);
  return A.result();
});

// =============================================================================================== v2 (SPEC-v2 §9)
check('V2-1 directivity (piston, side lobes, fan layout)', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.selectProbe('gen-60-5-10'); UT.test.setProbe({ angle: 60, freq: 5, diameter: 10 });
    const d = UT.test.compute().derived; const lam = d.lambda, a = d.crystalA; // piston formulas: sinθ = k·λ/D
    const th = (k) => Math.asin(k * lam / a) * 180 / Math.PI;
    UT.test.setPhysics({ sideLobes: true });
    const on = { d3: UT.test.directivity(th(0.51)), d10: UT.test.directivity(th(0.87)), nul: UT.test.directivity(0.999 * th(1.22)), sl: UT.test.directivity(th(1.635)), s15: UT.test.directivity(th(1.5)), fan: UT.test.fanAngles() };
    UT.test.setPhysics({ sideLobes: false });
    const off = { s15: UT.test.directivity(th(1.5)), fan: UT.test.fanAngles() };
    UT.test.setPhysics({ sideLobes: true });
    return { lam, a, h20: d.halfAngle20dB, on, off };
  });
  A.near(r.lam, 0.648, 0.002, 'lambda');
  A.near(r.on.d3, 0.712, 0.02, '−3 dB point'); A.near(r.on.d10, 0.316, 0.03, '−10 dB point'); A.le(r.on.nul, 0.02, 'null');
  A.near(r.on.sl, 0.13, 0.02, 'first side lobe'); A.ok(r.on.s15 > 0, '1.5λ/a > 0 with side lobes'); A.eq(r.off.s15, 0, '1.5λ/a = 0 without side lobes');
  A.eq(r.on.fan.length, 41, 'fan rays on'); A.eq(r.off.fan.length, 25, 'fan rays off');
  A.near(r.on.fan[0], -r.h20, 0.01, 'fan[0] = −θ20'); A.near(r.on.fan[20], r.h20, 0.01, 'fan[20] = +θ20');
  return A.result();
});

check('V2-2 mode conversion (reciprocal path) + coefficient API', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20, rootHeight: 0, capHeight: 0 });
    UT.test.selectProbe('gen-60-5-10'); UT.test.setProbe({ angle: 60, side: 1, z: 150 });
    UT.test.setDefects([{ n: 1, type: 'planar', pts: [{ x: -3, y: 14 }, { x: 3, y: 9 }], zFrom: 120, zTo: 180, label: 'Defect 1' }]);
    UT.test.setInstrument({ range: 125, gain: 40 });
    UT.test.setPhysics({ modeConv: true });
    const hits = []; let any = 0;
    for (let x = 44; x <= 54.001; x += 0.5) {
      UT.test.setProbe({ x });
      const mc = UT.test.echoes().filter(e => e.kind === 'modeconv');
      if (mc.length) any++;
      const ok = mc.find(e => Math.abs(e.tUs - 38.1) <= 1.0 && Math.abs(e.path - 61.7) <= 1.6);
      hits.push(ok ? { x, tUs: ok.tUs, path: ok.path, amp: ok.ampPct } : null);
    }
    UT.test.setPhysics({ modeConv: false });
    let offCount = 0;
    for (let x = 44; x <= 54.001; x += 0.5) { UT.test.setProbe({ x }); offCount += UT.test.echoes().filter(e => e.kind === 'modeconv').length; }
    UT.test.setPhysics({ modeConv: true });
    return { hits, any, offCount, s30: UT.test.modeConv('S', 30), s40: UT.test.modeConv('S', 40), l60: UT.test.modeConv('L', 60) };
  });
  const good = r.hits.filter(Boolean);
  A.ok(good.length >= 1, `a modeconv echo with tUs 38.1 ± 1.0 and path 61.7 ± 1.6 exists (positions with any modeconv: ${r.any}/21)`);
  A.eq(r.offCount, 0, 'no modeconv echo with modeConv off');
  A.ge(r.s30.R, 0.6, "modeConv('S',30).R"); A.near(r.s30.phiOut, 65.6, 1, "modeConv('S',30).phiOut");
  A.eq(r.s40.R, 0, "modeConv('S',40).R"); A.ge(r.l60.R, 0.9, "modeConv('L',60).R");
  A.note(`${good.length}/21 positions in tolerance` + (good[0] ? `, e.g. x ${good[0].x}: ${good[0].tUs.toFixed(2)} µs / ${good[0].path.toFixed(1)} mm` : ''));
  return A.result();
});

check('V2-3 surface wave (70°, cap toe), dampers, off switches', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.setDefects([]);
    UT.test.setPhysics({ surfaceWave: true }); UT.test.setDampers([]);
    UT.test.setProbe({ angle: 70, side: 1, x: 40 }); UT.test.setInstrument({ range: 100, gain: 40 });
    UT.test.compute();
    const sw = ACC.best(/surface/);
    UT.test.setDampers([20]); UT.test.compute(); const damped = ACC.best(/surface/, e => sw && Math.abs(e.path - sw.path) < 3);
    UT.test.setDampers([]); UT.test.setPhysics({ surfaceWave: false }); UT.test.compute(); const off = ACC.best(/surface/);
    UT.test.setPhysics({ surfaceWave: true }); UT.test.setProbe({ angle: 60 }); UT.test.compute(); const a60 = ACC.best(/surface/);
    return { sw: sw && { path: sw.path, amp: sw.ampPct }, damped: damped ? damped.ampPct : 0, off: !!off, a60: !!a60, capWidth: UT.state.weldOpts.capWidth };
  });
  A.ok(!!r.sw, 'surface echo present'); if (r.sw) { A.near(r.sw.path, 34.8, 1.5, 'surface path'); A.ok(r.damped === 0 || dB(r.damped, r.sw.amp) <= -30, `damper drop: ${r.damped.toFixed(3)} vs ${r.sw.amp.toFixed(2)} %`); }
  A.eq(r.off, false, 'absent with surfaceWave off'); A.eq(r.a60, false, 'absent with the 60° probe');
  return A.result();
});

check('V2-4 materials: austenitic grass, backwall, velocity readouts', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.setMaterial('carbon');
    UT.test.loadSpecimen('plate-weld', { T: 25 });
    UT.test.setDefects([]);
    UT.test.setProbe({ angle: 0, x: 60, crystal: 'single' }); UT.test.setInstrument({ range: 100, gain: 30, delay: 0, cal: { vel: null, zero: 0 }, gates: [{ on: true, start: 20, width: 12, level: 5 }] });
    UT.test.compute();
    const c = { grass: UT.test.ascan().grassPct, bw: ACC.gatedPeak(), dp: UT.test.readouts().primary && UT.test.readouts().primary.dp };
    UT.test.setMaterial('austenitic'); UT.test.compute();
    const a = { grass: UT.test.ascan().grassPct, bw: ACC.gatedPeak(), dp: UT.test.readouts().primary && UT.test.readouts().primary.dp, key: UT.state.material, specMat: UT.state.specimen.material && UT.state.specimen.material.key };
    UT.test.setInstrument({ cal: { vel: 5.90, zero: 0 } }); UT.test.compute();
    const cal = { dp: UT.test.readouts().primary && UT.test.readouts().primary.dp };
    UT.test.setInstrument({ cal: { vel: null, zero: 0 } }); UT.test.setMaterial('carbon');
    return { c, a, cal };
  });
  A.ge(r.a.grass / Math.max(r.c.grass, 1e-9), 3, `grass ratio (${r.a.grass.toFixed(2)} vs ${r.c.grass.toFixed(2)})`);
  A.range(dB(r.c.bw, r.a.bw), 4, 7, 'backwall carbon − austenitic (dB)');
  A.near(r.a.dp, 25.0, 0.2, 'austenitic DP with own velocity'); A.near(r.cal.dp, 26.1, 0.2, 'austenitic DP with carbon cal 5.90');
  A.note(`spec material ${r.a.specMat}`);
  return A.result();
});

check('V2-5 probe library + custom angle', 'v2', async ({ page, errors }) => {
  const A = checker();
  const k0 = errors.length;
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 });
    UT.test.selectProbe('mwb60-2'); let d = UT.test.compute().derived;
    const m = { freq: UT.state.probe.freq, dims: UT.state.probe.crystalDims, N: d.nearField, wedge: d.wedgeAngle };
    UT.test.selectProbe('a430s-60'); d = UT.test.compute().derived;
    const a = { dims: UT.state.probe.crystalDims, wedgePath: d.wedgePath };
    UT.test.selectProbe('gen-60-5-10');
    const c = UT.test.setProbe({ angle: 55 });
    UT.test.compute();
    return { m, a, c: { status: c.statusLine, mode: c.mode, wedge: c.wedgeAngle, refr: c.refracted }, angle: UT.state.probe.angle };
  });
  A.eq(r.m.freq, 2, 'mwb60-2 freq'); A.eq(r.m.dims.a, 9, 'mwb60-2 a'); A.eq(r.m.dims.b, 8, 'mwb60-2 b');
  A.near(r.m.N, 16.3, 0.3, 'mwb60-2 near field'); A.near(r.m.wedge, 47.1, 0.2, 'mwb60-2 wedge angle');
  A.eq(r.a.dims.a, 16, 'a430s a'); A.eq(r.a.dims.b, 16, 'a430s b'); A.eq(r.a.wedgePath, 14, 'a430s wedgePath');
  A.ok(/55\.0°/.test(r.c.status || ''), 'statusLine contains 55.0°'); A.eq(r.c.mode, 'shear', 'custom angle mode'); A.ok(Number.isFinite(r.c.wedge) && r.c.wedge > 36.7 && r.c.wedge < 47.1, `55° shoe angle ${r.c.wedge}`);
  A.eq(errors.length - k0, 0, 'console errors: ' + errors.slice(k0).join(' ; '));
  return A.result();
});

check('V2-6 focused probe on the IOW 13 mm SDH', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow');
    UT.test.selectProbe('gen-60-5-10'); UT.test.setProbe({ angle: 60, side: 1, x: 262.5 }); UT.test.setInstrument({ range: 100, gain: 40 });
    UT.test.setFocus({ on: false, F: 26 });
    const pick = (E) => { let b = null; for (const e of E) if (/sdh/.test(e.kind) && e.path > 18 && e.path < 34 && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    const width = (s) => { const m = s.best.v.ampPct / 2; const xs = s.out.filter(o => o.v && o.v.ampPct >= m).map(o => o.x); return xs.length ? Math.max(...xs) - Math.min(...xs) : 0; };
    const s0 = ACC.scanX(250, 275, 0.5, pick); const w0 = width(s0);
    UT.test.setFocus({ on: true, F: 26 });
    const s1 = ACC.scanX(250, 275, 0.5, pick); const w1 = width(s1);
    UT.test.setFocus({ on: true, F: 60 }); const F = UT.state.probe.focus.F; const N = UT.frame.derived.nearField;
    UT.test.setFocus({ on: false, F: 30 });
    return { a0: s0.best && s0.best.v.ampPct, a1: s1.best && s1.best.v.ampPct, w0, w1, F, N };
  });
  A.ok(r.a0 > 0 && r.a1 > 0, 'SDH echoes found');
  if (r.a0 > 0 && r.a1 > 0) A.ge(dB(r.a1, r.a0), 3, `focus gain dB (${r.a1.toFixed(1)} vs ${r.a0.toFixed(1)} %)`);
  A.le(r.w1, 0.7 * r.w0, `−6 dB width focused ${r.w1} vs unfocused ${r.w0}`);
  A.le(r.F, 38.6, 'F clamped to ≤ N'); A.near(r.N, 38.6, 0.1, 'near field');
  return A.result();
});

check('V2-7 TCG flattens the DAC-block SDHs to 80 %', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('dac', { T: 40 });
    UT.test.selectProbe('gen-60-5-10'); UT.test.setProbe({ angle: 60, side: 1 }); UT.test.setInstrument({ range: 125, gain: 30, tcg: { on: false } });
    UT.modes.dac.erase();
    const holes = UT.state.specimen.holes.filter(h => h.tag === 'sdh');
    const t60 = Math.tan(Math.PI / 3);
    const pick = (E) => { let b = null; for (const e of E) if (/sdh/.test(e.kind) && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    const pos = holes.map(h => { const x0 = h.x + h.y * t60; UT.test.setProbe({ x: x0 }); const s = ACC.scanX(x0 - 3, x0 + 3, 0.25, pick); return { x: s.best.x, path: s.best.v.path }; });
    // recording gain: first hole set to 80 %
    UT.test.setProbe({ x: pos[0].x }); UT.test.setInstrument({ gates: [{ on: true, start: pos[0].path - 5, width: 10, level: 5 }] });
    const refGain = UT.instruments.auto(80); UT.test.compute();
    const rec = pos.map(p => { UT.test.setProbe({ x: p.x }); UT.test.setInstrument({ gates: [{ on: true, start: p.path - 5, width: 10, level: 5 }] }); UT.test.compute(); return UT.modes.dac.record(); });
    const refDb = UT.state.instrument.dac.refDb;
    UT.test.setInstrument({ tcg: { on: true }, gain: refDb });
    const at = pos.map(p => { UT.test.setProbe({ x: p.x }); UT.test.setInstrument({ gates: [{ on: true, start: p.path - 5, width: 10, level: 5 }] }); UT.test.compute(); const R = UT.test.readouts().primary; const e = pick(UT.test.echoes()); return { pk: R ? R.peakPct : 0, echo: e ? e.ampPct : 0 }; });
    UT.test.setInstrument({ gain: refDb + 6 });
    const at6 = pos.map(p => { UT.test.setProbe({ x: p.x }); UT.test.setInstrument({ gates: [{ on: true, start: p.path - 5, width: 10, level: 5 }] }); UT.test.compute(); const R = UT.test.readouts().primary; return R ? R.peakPct : 0; });
    UT.test.setInstrument({ tcg: { on: false }, gain: 30 }); UT.modes.dac.erase();
    return { pos, refGain, refDb, rec: rec.map(p => p && p.ampPct), at, at6 };
  });
  A.eq(r.rec.filter(v => v != null).length, 3, 'three DAC points recorded');
  A.near(r.refDb, r.refGain, 0.01, 'dac.refDb = recording gain');
  r.at.forEach((v, i) => { A.near(v.pk, 80, 4, `SDH ${i + 1} peak % with TCG at refDb`); A.near(v.echo, v.pk, Math.max(1, 0.01 * v.pk), `SDH ${i + 1} echoes vs readouts`); });
  r.at6.forEach((v, i) => A.near(v, 160, 8, `SDH ${i + 1} at refDb + 6`));
  A.note('paths ' + r.pos.map(p => p.path.toFixed(1)).join('/') + ', refDb ' + (r.refDb && r.refDb.toFixed(1)));
  return A.result();
});

check('V2-8 pulser energy/damping and receiver filter', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow');
    UT.test.selectProbe('gen-60-5-10'); UT.test.setProbe({ angle: 60, side: 1, x: 262.5 });
    UT.test.setInstrument({ range: 50, gain: 30, damping: false, pulser: { energy: 200, damping: 150 }, receiver: { filter: 'broadband' }, gates: [{ on: true, start: 20, width: 12, level: 2 }] });
    const meas = () => { UT.test.compute(); const w = ACC.pulseWidth(20, 32); return { pk: ACC.gatedPeak(), w: w ? w.width : null }; };
    UT.test.setInstrument({ pulser: { energy: 100 } }); const e100 = meas(); const labOf = (v) => { const L = UT.ascan.ENERGY_LABELS || {}; return Object.keys(L).find(k => L[k] === v && k !== 'medium') || null; }; const lab100 = labOf(100);
    UT.test.setInstrument({ pulser: { energy: 400 } }); const e400 = meas(); const lab400 = labOf(400);
    UT.test.setInstrument({ pulser: { energy: 200, damping: 150 }, damping: false }); const d150 = meas();
    UT.test.setInstrument({ pulser: { damping: 50 } }); const d50 = meas(); const dampBool = UT.state.instrument.damping;
    UT.test.setInstrument({ pulser: { damping: 150 }, damping: false });
    UT.test.setInstrument({ receiver: { filter: '0.2-10' } }); const f1 = meas();
    UT.test.setInstrument({ receiver: { filter: 'broadband' } }); const bb5 = meas();
    UT.test.selectProbe('mwb60-2'); UT.test.setProbe({ x: 262.5 });
    UT.test.setInstrument({ receiver: { filter: 'broadband' } }); const m0 = meas();
    UT.test.setInstrument({ receiver: { filter: '5-15' } }); const m515 = meas();
    UT.test.setInstrument({ receiver: { filter: 'broadband' } }); const m1 = meas();
    UT.test.selectProbe('gen-60-5-10');
    return { e100, e400, lab100, lab400, d150, d50, dampBool, f1, bb5, base: d150, m0, m515, m1 };
  });
  A.near(dB(r.e400.pk, r.e100.pk), 12, 1, 'energy 400 vs 100 V (dB)');
  A.ok(String(r.lab400).toLowerCase() === 'high' && String(r.lab100).toLowerCase() === 'low', `energy labels ${r.lab100}/${r.lab400}`);
  A.near(dB(r.d50.pk, r.d150.pk), -2, 0.5, 'damping 50 vs 150 Ω (dB)'); A.eq(r.dampBool, true, 'damping boolean mirrors 50 Ω');
  A.near(r.d50.w / r.d150.w, 0.75, 0.1, `pulse −6 dB width ratio (${r.d50.w && r.d50.w.toFixed(2)} / ${r.d150.w && r.d150.w.toFixed(2)})`);
  A.near(dB(r.m515.pk, r.m0.pk), -6, 1, "filter '5-15' with the 2 MHz probe (dB)"); A.ge(r.m515.w / r.m0.w, 1.25, 'filter mismatch width ratio');
  A.near(r.bb5.pk, r.base.pk, 1e-6, 'broadband restores the 5 MHz amplitude'); A.near(r.m1.pk, r.m0.pk, 1e-6, 'broadband restores the 2 MHz amplitude');
  return A.result();
});

check('V2-9 DGS / ERS on the FBH block', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('fbh');
    UT.test.selectProbe('gen-0-5-10'); UT.test.setProbe({ angle: 0, x: 30, crystal: 'single', freq: 5, diameter: 10 });
    const T = UT.state.specimen.T;
    UT.test.setInstrument({ range: 100, gain: 30, gates: [{ on: true, start: T - 6, width: 12, level: 5 }] });
    UT.test.compute();
    const ref = UT.test.dgs({ record: 'backwall' });
    const fb = UT.state.specimen.fbhs;
    const ers = (d) => { const f = fb.find(h => h.d === d && h.y === 30); UT.test.setProbe({ x: f.x }); UT.test.setInstrument({ gates: [{ on: true, start: f.y - 6, width: 12, level: 2 }] }); UT.test.compute(); const c = UT.test.dgs(); return { ers: c.result && c.result.ersMm, echoPct: c.echo && c.echo.ampPct }; };
    const e3 = ers(3), e6 = ers(6);
    const H = UT.standards.dgs.hDisc ? UT.standards.dgs.hDisc(3, 0.3) : null;
    const curves = UT.standards.dgs.curves ? UT.standards.dgs.curves(UT.frame.derived, [0.3]) : null;
    let Hc = null; if (curves && curves.A) { let bi = 0; curves.A.forEach((a, i) => { if (Math.abs(a - 3) < Math.abs(curves.A[bi] - 3)) bi = i; }); Hc = { A: curves.A[bi], H: curves.discs[0].H[bi] }; }
    UT.standards.dgs.setReference(null);
    return { ref: ref && ref.ref, e3, e6, H, Hc };
  });
  A.ok(!!r.ref, 'backwall reference recorded');
  A.near(r.e3.ers, 3, 0.9, '⌀3 FBH ERS'); A.near(r.e6.ers, 6, 1.5, '⌀6 FBH ERS');
  A.near(r.H, 0.0628, 0.0628 * 0.01, 'hDisc(3, 0.3)');
  if (r.Hc && Math.abs(r.Hc.A - 3) < 1e-6) A.near(r.Hc.H, 0.0628, 0.0628 * 0.01, 'dgs.curves disc 0.3 at A 3');
  return A.result();
});

check('V2-10 TOFD v2: mode-converted backwalls, PCS optimiser, dead zones, cursor', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]);
    UT.test.enterMode('tofd', { silentUI: true });
    UT.setIn('tofd', { pcs: 60, txAngle: 60, modeConv: true }); UT.setIn('probe', { freq: 5 }); UT.renderNow();
    const t = UT.test.tofd();
    const ev = (k) => { const e = t.events.find(x => x.kind === k); return e ? e.tUs : null; };
    const dz = t.deadZones;
    const pcs = UT.test.pcsOptimise();
    UT.setIn('tofd', { pcs: 60 }); UT.renderNow();
    UT.test.tofdCursor({ z: 135, depth: 8 });
    const cur = UT.state.cursor;
    return { lsbw: ev('modeconv-backwall'), ssbw: ev('modeconv-backwall-ss'), dz, pcs, cur: { view: cur.view, depth: cur.depth, z: cur.z }, wd: t.wd };
  });
  A.near(r.lsbw, 24.77, 0.05, 'modeconv-backwall tUs'); A.near(r.ssbw, 31.02, 0.05, 'modeconv-backwall-ss tUs');
  A.near(r.pcs, 46.2, 0.1, 'pcsOptimise'); A.near(r.dz && r.dz.lateral, 7.3, 0.5, 'deadZones.lateral'); A.near(r.dz && r.dz.backwall, 1.6, 0.2, 'deadZones.backwall');
  A.eq(r.cur.view, 'dscan', 'cursor view'); A.near(r.cur.depth, 8, 0.05, 'cursor depth');
  return A.result();
});

check('V2-11 phased array S/E/C-scan, per-angle TCG, focal laws', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('dac', { T: 40 });
    const hole = UT.state.specimen.holes.find(h => Math.abs(h.y - 20) < 1e-6);
    UT.setIn('pa', { tcg: false, view: 'S' });
    const xp = hole.x + hole.y * Math.tan(55 * Math.PI / 180);
    UT.test.setProbe({ x: xp, side: 1 }); UT.test.setInstrument({ range: 125, gain: 30 });
    if (UT.pa && UT.pa.ensurePa) UT.pa.ensurePa(); else UT.setIn('probe', { method: 'pa' });
    UT.renderNow();
    const ss = UT.test.pa.sscan();
    const sdhOf = (col) => { let b = null; for (const e of col.echoes || []) if (/sdh/.test(e.kind) && (!b || (e.ampPct || 0) > (b.ampPct || 0))) b = e; return b; };
    let bestCol = null; for (const c of ss.columns) { const e = sdhOf(c); if (e && (!bestCol || e.ampPct > bestCol.amp)) bestCol = { angle: c.angle, amp: e.ampPct, path: e.path }; }
    const expAngle = Math.atan((xp - hole.x) / hole.y) * 180 / Math.PI;
    const es = UT.test.pa.escan();
    const sc = UT.test.pa.runScan();
    let finite = 0; if (sc && sc.map) for (let i = 0; i < sc.map.length; i++) if (Number.isFinite(sc.map[i]) && sc.map[i] > 0) finite++;
    UT.setIn('pa', { tcg: true }); UT.renderNow();
    const spread = [];
    for (const th of ss.angles) {
      UT.test.setProbe({ x: hole.x + hole.y * Math.tan(th * Math.PI / 180) });
      const s2 = UT.test.pa.sscan();
      const col = s2.columns.find(c => Math.abs(c.angle - th) < 1e-6);
      const e = col && sdhOf(col); if (e && e.ampPct > 0) spread.push(e.ampPct);
    }
    const mx = Math.max(...spread), mn = Math.min(...spread);
    const fl60 = UT.test.pa.focalLaw(60); const fl0 = UT.test.pa.focalLaw(0, { escan: true });
    UT.setIn('pa', { tcg: false }); UT.setIn('probe', { method: 'pe' }); UT.renderNow();
    return { nCols: ss.columns.length, bestCol, expAngle, nE: es ? es.columns.length : 0, finite, spreadDb: 20 * Math.log10(mx / mn), nSpread: spread.length, slope60: fl60.slope, slope0: fl0.slope, minDelay: Math.min(...fl60.delaysUs, ...fl0.delaysUs) };
  });
  A.eq(r.nCols, 41, 'S-scan columns'); A.ok(!!r.bestCol, 'SDH visible in the S-scan');
  if (r.bestCol) A.near(r.bestCol.angle, r.expAngle, 3, `SDH angle (expected ${r.expAngle.toFixed(1)}°)`);
  A.ge(r.nE, 8, 'E-scan columns'); A.ge(r.finite, 1, 'C-scan map non-empty');
  A.le(r.spreadDb, 3, `TCG spread dB over ${r.nSpread} angles`);
  A.near(r.slope60, 0.070, 0.003, 'focalLaw(60).slope'); A.eq(r.slope0, 0, 'focalLaw(0,{escan}).slope'); A.ge(r.minDelay, 0, 'delays ≥ 0');
  return A.result();
});

check('V2-12 AUT v2: 6 channels, adaptive step on a 24-inch pipe, sync time', 'v2', async ({ page, budget }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]); UT.test.addPreset('rootCrack');
    UT.test.setProbe({ angle: 60, side: 1, x: 34.6 });
    UT.setIn('aut', { channels: 6 }); UT.test.enterMode('aut', { silentUI: true }); UT.setIn('aut', { channels: 6 }); UT.renderNow();
    const s6 = UT.test.runAutScan();
    UT.test.enterMode('weld', { silentUI: true });
    UT.test.loadSpecimen('pipe-weld', { od: 609.6, wt: 20 }); UT.test.setDefects([]); UT.test.addPreset('rootCrack');
    UT.test.enterMode('aut', { silentUI: true }); UT.setIn('aut', { channels: 6 }); UT.renderNow();
    const t0 = performance.now(); const sp = UT.test.runAutScan(); const ms = performance.now() - t0;
    return { ch: s6.channels, strips: s6.strips, L: UT.state.specimen.L, n: sp.n, step: sp.step, ms };
  });
  A.eq(r.ch, 6, 'channels'); A.ok(r.strips === 6 || (Array.isArray(r.strips) && r.strips.length === 6), 'strips = 6 (' + JSON.stringify(r.strips) + ')');
  A.le(r.n, 500, `pipe columns (L ${r.L.toFixed(0)} mm, step ${r.step})`); A.le(r.ms, budget(1500), 'sync scan ms');
  return A.result();
});

check('V2-13 B-scan window records columns without a render loop', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('lamination-plate'); UT.test.setDefects([]); UT.test.addPreset('lamination', { y: 10, x0: 15, x1: 45 });
    UT.test.setProbe({ angle: 0, x: -60, crystal: 'single' }); UT.test.setInstrument({ range: 100, gain: 30 });
    UT.views.bscan.clear(); UT.views.bscan.open();
    let renders = 0; const fn = () => renders++; UT.bus.on('render', fn);
    let maxPerStep = 0;
    for (let x = -60; x <= 60; x += 1) { const r0 = renders; UT.test.setProbe({ x }); maxPerStep = Math.max(maxPerStep, renders - r0); }
    UT.bus.off('render', fn);
    const b = UT.test.bscan();
    const fd = b.firstDepth || [];
    const near = (v) => fd.filter(d => Number.isFinite(d) && Math.abs(d - v) <= 1.5).length;
    const colsNull = UT.state.bscan.columns === null;
    UT.views.bscan.close();
    return { n: b.columns.length, maxPerStep, n10: near(10), n25: near(25), colsNull, on: UT.state.bscan.on };
  });
  A.ge(r.n, 100, 'columns'); A.le(r.maxPerStep, 2, 'renders per step'); A.ge(r.n10, 5, 'columns with first depth ≈ 10'); A.ge(r.n25, 5, 'columns with first depth ≈ 25');
  A.eq(r.colsNull, true, 'state.bscan.columns === null');
  return A.result();
});

check('V2-14 lessons: autoRun 1…25, manual lesson 3, progress flags', 'v2', async ({ page }) => {
  const A = checker();
  const titles = await page.evaluate(() => UT.test.lessons());
  A.eq(titles.length, 25, 'lessons().length');
  const auto = [];
  for (let n = 1; n <= 25; n++) {
    const res = await page.evaluate(async (n) => { try { const r = await UT.test.lessonAutoRun(n); return { n, completed: r.completed, failed: r.failedSteps }; } catch (e) { return { n, error: String(e && e.message || e) }; } }, n);
    auto.push(res);
    if (res.error) A.fail(`lesson ${n} autoRun threw ${res.error}`);
    else if (!(res.completed && res.failed && res.failed.length === 0)) A.fail(`lesson ${n}: completed ${res.completed}, failedSteps ${JSON.stringify(res.failed)}`);
    await page.evaluate(() => { try { UT.lessons.stop(); } catch (e) {} for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w.isOpen() && k !== 'lessons') w.close(); } });
  }
  // manual lesson 3
  await page.evaluate(() => ACC.reset());
  const step = async (label, fn) => { await page.evaluate(fn); await page.waitForTimeout(400); return page.evaluate(() => UT.test.lessonState().step); };
  await page.evaluate(() => { UT.lessons.start(3); });
  await page.waitForTimeout(400);
  const steps = [];
  steps.push(['start', await page.evaluate(() => UT.test.lessonState().step)]);
  steps.push(['tb-0', await step('tb-0', () => UT.test.click('tb-0'))]);
  steps.push(['range 125', await step('range', () => UT.test.setInstrument({ range: 125 }))]);
  steps.push(["answer 'initial'", await step('ans', () => UT.test.lessonAnswer('initial'))]);
  steps.push(['answer 25', await step('ans25', () => UT.test.lessonAnswer(25))]);
  steps.push(['twin crystal', await step('twin', () => { if (!UT.test.menu('Probes/Zero Probe - Twin or Single Crystal/Twin Crystal')) UT.test.setProbe({ crystal: 'twin' }); })]);
  steps.push(['gate DP 25', await step('gate', () => UT.test.setInstrument({ gates: [{ on: true, start: 15, width: 20, level: 20 }] }))]);
  const wrongBefore = await page.evaluate(() => (UT.test.lessonState().progress[3] || {}).wrong || 0);
  steps.push(["wrong answer 'deeper'", await step('wrong', () => UT.test.lessonAnswer('deeper'))]);
  const wrongAfter = await page.evaluate(() => (UT.test.lessonState().progress[3] || {}).wrong || 0);
  steps.push(["answer 'nearsurface'", await step('right', () => UT.test.lessonAnswer('nearsurface'))]);
  const st = await page.evaluate(() => { const s = UT.test.lessonState(); return { step: s.step, auto: (s.progress[3] || {}).auto, done: s.done }; });
  let prev = steps[0][1];
  for (let i = 1; i < steps.length; i++) {
    const [label, s] = steps[i];
    if (/wrong/.test(label)) { A.eq(s, prev, `wrong choice does not advance (${label})`); }
    else if (label === 'tb-0') A.ok(s === Math.max(prev, 1), `${label}: step ${prev} → ${s} (step 1 may be pre-satisfied by the setup)`);
    else A.ok(s === prev + 1 || (i === steps.length - 1 && s >= prev + 1), `${label}: step ${prev} → ${s}`);
    prev = s;
  }
  A.eq(wrongAfter, wrongBefore + 1, 'progress[3].wrong incremented');
  A.eq(st.auto, true, 'progress[3].auto after autoRun');
  await page.evaluate(() => { try { UT.lessons.stop(); } catch (e) {} });
  A.note('autoRun ' + auto.filter(a => a.completed).length + '/25');
  return A.result();
}, { timeout: 900000 });

check('V2-14b echo quiz: deterministic sequence and 10/10 score', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const DEF = ['corner', 'tip', 'defect', 'lamination'];
    const run = () => {
      UT.test.quiz.start({ n: 10, seed: 3 });
      const seq = [];
      for (let i = 0; i < 10; i++) {
        const it = UT.test.quiz.state().item; if (!it) break;
        seq.push(it.scenarioId + ':' + it.correctId);
        UT.renderNow();
        const d = UT.rays.describe(UT.frame.readouts.primary);
        const cat = d && d.category ? d.category : it.correctId;
        UT.test.quiz.answer(cat);
        UT.test.quiz.answerAction(DEF.indexOf(cat) >= 0 ? 'record' : 'geometry-note');
      }
      return { seq, st: UT.test.quiz.state() };
    };
    const a = run(); const b = run();
    return { seqA: a.seq, seqB: b.seq, correct: b.st.correct, wrong: b.st.wrong, active: b.st.active };
  });
  A.eq(r.seqA.length, 10, 'ten items'); A.eq(JSON.stringify(r.seqA), JSON.stringify(r.seqB), 'same item sequence for seed 3');
  A.eq(r.correct, 10, `correct (wrong ${r.wrong})`);
  return A.result();
});

check('V2-15 trade v2: configure/start/score/tick/history/report', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade;
    const cfg = T.configure({ difficulty: 'advanced', timeLimitMin: 0.05 });
    T.start(7); const t1 = JSON.stringify(T.truth()); const w1 = JSON.stringify([UT.state.weldOpts, UT.state.material]);
    T.start(7); const t2 = JSON.stringify(T.truth()); const w2 = JSON.stringify([UT.state.weldOpts, UT.state.material]);
    const truth = T.truth();
    const rows = (fn) => truth.map(q => fn({ n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }));
    const id = (x) => x;
    const s100 = T.submit(rows(id));
    T.start(7); const s85 = T.submit(rows(q => Object.assign({}, q, { length: q.length * 2 })));
    T.start(7); const s12 = T.submit(rows(q => Object.assign({}, q, { length: q.length * 1.2 })));
    T.start(7);
    const L = UT.state.specimen.L; let zFree = null;
    for (let z = 5; z < L - 15; z += 5) { if (!truth.some(q => z + 10 >= q.zFrom - 25 && z <= q.zTo + 25)) { zFree = z; break; } }
    const extra = rows(id).concat([{ n: 99, z: zFree === null ? L - 12 : zFree, length: 10, depth: 5, type: 'slag' }]);
    const sExtra = T.submit(extra);
    T.start(7); UT.setIn('trade', { revealed: false }); T.tick(4);
    const revealed = UT.state.trade.revealed;
    const h = T.history(); const e = h[h.length - 1] || h[0];
    const hasKeys = h.some(x => x && 'coverageA' in x && 'coverageB' in x && 'perDefect' in x);
    T.start(7); const score = T.submit(rows(id));
    const rep = T.report({ withTruth: true }); const repNo = T.report({ withTruth: false });
    const tables = (rep.match(/<table/g) || []).length;
    const truthMarker = truth.map(q => String(q.zFrom)); const truthIn = truthMarker.filter(m => rep.indexOf('>' + m + '<') >= 0).length;
    return { cfg, same: t1 === t2, n: truth.length, sameWeld: w1 === w2, s100, s85, s12, sExtra, zFree, revealed, hasKeys, hKeys: e ? Object.keys(e) : [], score, tables, repLen: rep.length, repNoLen: repNo.length, truthIn, hasScore: rep.indexOf(String(score)) >= 0, noTruth: repNo.indexOf('tr-truth') < 0 && rep.indexOf('tr-truth') >= 0 };
  });
  A.eq(r.cfg, true, 'configure accepted'); A.ok(r.same, 'start(7) twice → same truth'); A.range(r.n, 5, 8, 'defect count'); A.ok(r.sameWeld, 'same weldOpts/material');
  A.eq(r.s100, 100, 'truth rows → 100'); A.eq(r.s85, 85, 'lengths ×2 → 85'); A.eq(r.s12, 100, 'lengths ×1.2 → 100'); A.eq(r.sExtra, 85, `extra unmatched row → 85 (z ${r.zFree})`);
  A.eq(r.revealed, true, 'tick(4) reveals'); A.ok(r.hasKeys, 'history entry has coverageA/coverageB/perDefect: ' + r.hKeys.join(','));
  A.ok(r.hasScore, 'report contains the score'); A.ge(r.tables, 2, 'report tables (indications + truth)'); A.ge(r.truthIn, 1, 'truth rows present in report');
  A.ok(r.noTruth, 'report({withTruth:false}) has no truth table');
  return A.result();
});

check('V2-15b one-to-one matching: one spanning row detects ≤ 1', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade; T.configure({ difficulty: 'advanced', timeLimitMin: 60 });
    T.start(7); const truth = T.truth(); const L = UT.state.specimen.L;
    const score = T.submit([{ n: 1, z: 0, length: L, depth: 10, type: 'planar' }]);
    const h = T.history(); const e = h[h.length - 1];
    const det = e && e.perDefect ? e.perDefect.filter(p => p.found).length : null;
    const N = truth.filter(q => q.recordable !== false).length;
    return { score, det, N };
  });
  A.ok(r.det === null || r.det <= 1, `detections ${r.det}`); A.le(r.score, Math.ceil(100 / r.N), `score with N ${r.N}`);
  return A.result();
});

check('V2-15c depth = truth centre scores full depth points', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade; T.configure({ difficulty: 'advanced', timeLimitMin: 60 });
    T.start(7); const truth = T.truth();
    const rows = truth.map(q => ({ n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: (q.yMin + q.yMax) / 2, type: q.type }));
    return { score: T.submit(rows) };
  });
  A.eq(r.score, 100, 'score');
  return A.result();
});

check('V2-15d recordability: truth rows carry recordable/bestDb; omitting non-recordable costs nothing', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade; T.configure({ difficulty: 'advanced', timeLimitMin: 60 });
    let found = null;
    for (let seed = 1; seed <= 40 && !found; seed++) { T.start(seed); const tr = T.truth(); if (tr.some(q => q.recordable === false)) found = { seed, truth: tr }; }
    if (!found) return { found: false };
    const tr = found.truth;
    const shape = tr.every(q => typeof q.recordable === 'boolean' && typeof q.bestDb === 'number');
    const rows = tr.filter(q => q.recordable).map(q => ({ n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }));
    return { found: true, seed: found.seed, shape, score: T.submit(rows), nonRec: tr.filter(q => !q.recordable).length };
  });
  A.ok(r.found, 'an advanced seed (1…40) with a non-recordable defect exists');
  if (r.found) { A.ok(r.shape, 'rows carry recordable:boolean + bestDb:number'); A.eq(r.score, 100, `score omitting ${r.nonRec} non-recordable (seed ${r.seed})`); }
  return A.result();
});

check('V2-15e coverage tracker: sweep side A at half skip', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade; T.configure({ difficulty: 'basic', timeLimitMin: 60 });
    T.start(3);
    const c0 = T.coverage();
    const s = UT.state; const Tk = s.specimen.T, cw = (s.weldOpts.capWidth || 16) / 2, L = s.specimen.L;
    const x = cw + Tk * Math.tan(Math.PI / 3);
    UT.test.setProbe({ angle: 60, side: 1, x });
    for (let z = 0; z <= L; z += 5) UT.test.setProbe({ z });
    const c1 = T.coverage();
    return { a0: c0.sideA, b0: c0.sideB, a1: c1.sideA, b1: c1.sideB, x };
  });
  A.ge(r.a1, 0.95, `sideA after sweep (x ${r.x.toFixed(1)})`); A.eq(r.b1, r.b0, 'sideB unchanged');
  return A.result();
});

check('V2-15f critical miss fails the test', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const T = UT.test.trade; T.configure({ difficulty: 'intermediate', timeLimitMin: 60 });
    let found = null;
    for (let seed = 1; seed <= 60 && !found; seed++) { T.start(seed); const tr = T.truth(); const c = tr.find(q => /crack/.test(q.type) && q.height >= 3 && q.recordable !== false); if (c) found = { seed, tr, c }; }
    if (!found) return { found: false };
    const rows = found.tr.filter(q => q.n !== found.c.n).map(q => ({ n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }));
    const score = T.submit(rows);
    const res = UT.state.trade.result; const rep = T.report();
    return { found: true, seed: found.seed, score, fail: res && res.fail, hasFAIL: /FAIL/.test(rep) };
  });
  A.ok(r.found, 'an intermediate seed with a crack of height ≥ 3 exists');
  if (r.found) { A.eq(r.fail, true, `result.fail (seed ${r.seed}, score ${r.score})`); A.ok(r.hasFAIL, "report contains 'FAIL'"); }
  return A.result();
});

check('V2-16 standards evaluation (ASME VIII, ISO 11666 AL2/AL3, procedure lock)', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const ev = (ruleId, level, amp, len, type) => { const x = UT.test.evaluate({ ruleId, level, T: 20, transferDb: 0, indication: { ampDbVsRef: amp, lengthMm: len, type: type || 'slag' } }); return { d: x.disposition, rec: x.recordable }; };
    const out = {};
    out.a1 = ev('asme8', null, 1, 10); out.a2 = ev('asme8', null, -10, 10); out.a3 = ev('asme8', null, -16, 10); out.a4 = ev('asme8', null, -6, 6, 'crack');
    out.i1 = ev('iso11666', 'AL2', -12, 8); out.i2 = ev('iso11666', 'AL2', -6, 8); out.i3 = ev('iso11666', 'AL2', 2, 8); out.i4 = ev('iso11666', 'AL2', -8, 15); out.i5 = ev('iso11666', 'AL2', -11, 30); out.i6 = ev('iso11666', 'AL2', -10, 30);
    out.j1 = ev('iso11666', 'AL3', 3, 15); out.j2 = ev('iso11666', 'AL3', -2, 25); out.j3 = ev('iso11666', 'AL3', -1, 25); out.j4 = ev('iso11666', 'AL3', 0, 25);
    const ap = UT.test.applyProcedure('iso-B-plate20');
    const allowed = UT.test.allowedProbes();
    const listed = UT.standards.procedures['iso-B-plate20'] && (UT.standards.procedures['iso-B-plate20'].probes || UT.standards.procedures['iso-B-plate20'].allowedProbes);
    const rej = UT.trade.configure({ probes: ['gen-45-5-10'] });
    UT.test.applyProcedure(null);
    return Object.assign(out, { ap, allowed, listed, rej });
  });
  const acc = (v) => v.d === 'accept' || v.d === 'record';
  A.eq(r.a1.d, 'reject', 'asme8 +1/10'); A.ok(acc(r.a2) && r.a2.rec === true, 'asme8 −10/10 accept+recordable'); A.eq(r.a3.d, 'not-recordable', 'asme8 −16'); A.eq(r.a4.d, 'reject', 'asme8 crack −6/6');
  A.eq(r.i1.d, 'not-recordable', 'AL2 −12/8'); A.ok(acc(r.i2), 'AL2 −6/8 accept'); A.eq(r.i3.d, 'reject', 'AL2 +2/8'); A.eq(r.i4.d, 'reject', 'AL2 −8/15'); A.eq(r.i5.d, 'not-recordable', 'AL2 −11/30'); A.ok(acc(r.i6), 'AL2 −10/30 accept');
  A.ok(acc(r.j1), 'AL3 +3/15 accept'); A.ok(acc(r.j2), 'AL3 −2/25 accept'); A.eq(r.j3.d, 'reject', 'AL3 −1/25'); A.eq(r.j4.d, 'reject', 'AL3 0/25');
  A.ok(r.ap === true || r.ap === undefined, 'applyProcedure returned ' + r.ap); A.ok(Array.isArray(r.allowed) && r.allowed.length >= 1, 'allowedProbes list');
  if (Array.isArray(r.listed)) A.eq(JSON.stringify(r.allowed), JSON.stringify(r.listed), 'allowedProbes = procedure list');
  A.eq(r.rej, false, "configure({probes:['gen-45-5-10']}) rejected");
  return A.result();
});

check('V2-16b AWS D1.1 classes and bands', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const ev = (T, angle, amp, len, sp) => { const x = UT.test.evaluate({ ruleId: 'awsd11', T, probeAngle: angle, transferDb: 0, indication: { ampDbVsRef: amp, lengthMm: len, soundPath: sp } }); return { d: x.disposition, cls: x.class, n: x.numbers }; };
    const R = UT.standards.rules.awsd11;
    return { a: ev(25, 70, 1, 30, 50), c: ev(25, 70, -6, 30, 50), c60: ev(25, 70, -6, 60, 50), d: ev(25, 70, -9, 30, 50), na45: ev(15, 45, -6, 30, 50), b20: R.bandOf ? R.bandOf(20) : null, na7: ev(7, 70, -6, 30, 50) };
  });
  A.eq(r.a.d, 'reject', `+1 dB → class ${r.a.cls}`); A.eq(String(r.a.cls), 'A', 'class A');
  A.ok(r.c.d === 'accept' || r.c.d === 'record', `−6/30 → class ${r.c.cls} accept`); A.eq(String(r.c.cls), 'C', 'class C');
  A.eq(r.c60.d, 'reject', '−6/60 reject'); A.ok(r.d.d === 'accept' || r.d.d === 'record', `−9 → class ${r.d.cls} accept`); A.eq(String(r.d.cls), 'D', 'class D');
  A.eq(r.na45.d, 'n/a', '45° with T 15 → n/a'); A.eq(r.b20, 0, 'bandOf(20) === 0'); A.eq(r.na7.d, 'n/a', 'T 7 → n/a');
  return A.result();
});

check('V2-17 sizing v2: tip diffraction, 20 dB / 6 dB drop, eval level', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]); UT.test.addPreset('rootCrack', { height: 3 });
    UT.test.setProbe({ angle: 60, side: 1, x: 38, z: 150 }); UT.test.setInstrument({ range: 100, gain: 40, gates: [{ on: true, start: 30, width: 20, level: 5 }] });
    const tip = UT.test.sizing({ method: 'tip', auto: true });
    UT.test.setDefects([]); const d = UT.test.addPreset('lof', { zFrom: 135, length: 30 });
    const pick = (E) => { let b = null; for (const e of E) if (e.defectId === d.id && e.kind !== 'tip' && (!b || e.ampPct > b.ampPct)) b = e; return b; };
    UT.test.setProbe({ x: 60, z: 150 }); const s = ACC.scanX(45, 70, 0.5, pick);
    UT.test.setProbe({ x: s.best.x }); UT.test.setInstrument({ gates: [{ on: true, start: s.best.v.path - 6, width: 12, level: 5 }] }); UT.test.compute();
    const l20 = UT.test.sizing({ method: '20dB', auto: true, zFrom: 100, zTo: 200, step: 1 });
    const l6 = UT.test.sizing({ method: '6dB', auto: true, zFrom: 100, zTo: 200, step: 1 });
    UT.setIn('standards', { standard: 'iso11666', level: 'AL2' });
    UT.instruments.auto(80); UT.instruments.storeRef();
    const le = UT.test.sizing({ method: 'eval', auto: true, zFrom: 100, zTo: 200, step: 1 });
    return { tipH: tip && tip.height, tipWarn: tip && tip.warning, l20: l20 && l20.length, l6: l6 && l6.length, le: le && le.length, x: s.best.x, refGain: UT.state.instrument.refGain, gain: UT.state.instrument.gain };
  });
  A.near(r.tipH, 3, 1, 'tip-diffraction height' + (r.tipWarn ? ` (warning: ${r.tipWarn})` : ''));
  A.near(r.l20, 30, 3, '20 dB drop length'); A.near(r.l6, 30, 2, '6 dB drop length'); A.ge(r.le, r.l6 - 2, `eval (−10 dB) length vs 6 dB (${r.l6 && r.l6.toFixed(1)})`);
  return A.result();
});

check('V2-18 Korean UI: untranslated() ≤ 5 with every window open', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const has = (p) => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), UT) != null;
    const openers = {
      dgs: 'standards.dgs', evaluation: 'standards.evaluation', procedures: 'standards.proceduresWindow', stdnotes: 'standards.stdnotes', pa: 'pa.panel', bscan: 'views.bscan', echodyn: 'views.echodyn',
      datalog: 'instruments.datalog', autocal: 'modes.autoCal', lessons: 'lessons.window', quiz: 'lessons.quiz.window', trade: 'trade.window', scoreboard: 'trade.scoreboard', report: 'trade.reportWindow', practice: 'trade.practiceWindow',
      scenario: 'scenario.window', share: 'scenario.share', pipe3d: 'views.pipe3d', defects: 'modes.defectEditor', tofd: 'tofd.panel', aut: 'aut.panel', plotter: 'views.plotter', rad: 'views.radiograph', size: 'views.sizing', tky: 'modes.tkyPanel', dac: 'modes.dacPanel',
    };
    const appWins = ['openWeld', 'openWedge', 'openOptions', 'openStepWedge', 'openAbout', 'openGuide', 'openKeys', 'openExport', 'openProbeLib', 'openMaterial', 'openFocus', 'openGlossary'];
    if (!UT.test.lang) return { noLang: true };
    UT.test.lang('ko');
    const opened = [], failed = [];
    for (const k of Object.keys(openers)) { const p = openers[k]; try { const o = p.split('.').reduce((a, b) => a && a[b], UT); if (o && typeof o.open === 'function') { o.open(); opened.push(k); } else if (o && typeof o.start === 'function') { o.start(); opened.push(k); } else failed.push(k); } catch (e) { failed.push(k + ':' + e.message); } }
    for (const f of appWins) { try { if (UT.app && typeof UT.app[f] === 'function') { UT.app[f](); opened.push(f); } } catch (e) { failed.push(f + ':' + e.message); } }
    UT.renderNow();
    const un = UT.test.untranslated ? UT.test.untranslated() : null;
    // §5.3.4 exemptions: short tokens, numeric strings, product names, .no-i18n subtrees, the physics status line, probe library names
    const SHORT = /^[\d\s.,:%°+\-/×~()a-zA-Z]{0,3}$/, NUM = /^[\d\s.,%°:+\-/()µ]+$/;
    const libNames = new Set((UT.probe && UT.probe.library || []).map(p => p.name));
    const UNIT = /^[A-Za-z⌀]{0,2}\s*\(?(mm|µs|us|dB|%|°|Hz|MHz)\)?$/;   // unit labels ('SP (mm)', '⌀ mm') stay as they are in Korean
    const exempt = (k, el) => SHORT.test(k) || NUM.test(k) || !/[A-Za-z]/.test(k) || UNIT.test(k) || /[\u3131-\uD79D]/.test(k) || libNames.has(k) || !!(UT.i18nKo && UT.i18nKo.isProductName && UT.i18nKo.isProductName(k)) || !!el.closest('.no-i18n') || !!el.closest('#statusbar .sb-left');
    const where = (el) => { const w = el.closest('.win'); return w ? 'win:' + w.dataset.win : (el.closest('#menubar') ? 'menubar' : el.closest('#instrument') ? 'instrument' : el.id || el.tagName.toLowerCase()); };
    const same = Array.from(new Set(Array.from(document.querySelectorAll('[data-i18n]')).filter(el => el.dataset.i18n && el.textContent.trim() === el.dataset.i18n.trim() && !exempt(el.dataset.i18n, el)).map(el => el.dataset.i18n + ' @' + where(el)))).slice(0, 12);
    try { if (UT.modes.autoCal && UT.modes.autoCal.cancel) UT.modes.autoCal.cancel(); } catch (e) {}
    for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w.isOpen()) w.close(); }
    UT.test.lang('en');
    return { opened: opened.length, failed, un, same };
  });
  if (r.noLang) { A.fail('UT.test.lang missing'); return A.result(); }
  A.ok(Array.isArray(r.un), 'UT.test.untranslated() exists (92-i18n-ko)');
  if (Array.isArray(r.un)) A.le(r.un.length, 5, 'untranslated keys: ' + r.un.slice(0, 8).join(', '));
  A.eq(r.same.length, 0, 'elements whose text equals the key while ko: ' + r.same.join(', '));
  A.note(`${r.opened} windows opened` + (r.failed.length ? `, openers missing: ${r.failed.join(',')}` : ''));
  return A.result();
});

check('V2-19 scaling and touch at 1024×640', 'v2', async ({ launchFresh }) => {
  const A = checker();
  const { browser, page, errors } = await launchFresh({ width: 1024, height: 640 });
  try {
    await installHelpers(page);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      return { sw: de.scrollWidth, sh: de.scrollHeight, bw: document.body.scrollWidth, bh: document.body.scrollHeight, iw: window.innerWidth, ih: window.innerHeight, k: UT.dom.scale(), scale: UT.state.display.scale };
    });
    A.ok(r.sw <= r.iw && r.sh <= r.ih && r.bw <= r.iw && r.bh <= r.ih, `no overflow: doc ${r.sw}×${r.sh}, body ${r.bw}×${r.bh}, inner ${r.iw}×${r.ih}`);
    A.near(r.k, 0.8, 0.02, 'UT.dom.scale()');
    // pointer drag on #cv-cross by 20 mm
    const g = await page.evaluate(() => {
      UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setProbe({ angle: 60, x: 40, side: 1 });
      const cv = document.getElementById('cv-cross'); const b = cv.getBoundingClientRect(); const k = UT.dom.scale();
      const p0 = UT.views.cross.toPx(40, -5), p1 = UT.views.cross.toPx(60, -5);
      window.__uiCount = ACC.countUi('probe-drag');
      return { x0: b.left + p0.x * k, y0: b.top + p0.y * k, x1: b.left + p1.x * k, y1: b.top + p1.y * k, px: UT.state.probe.x };
    });
    await page.mouse.move(g.x0, g.y0); await page.mouse.down(); await page.mouse.move((g.x0 + g.x1) / 2, g.y0, { steps: 4 }); await page.mouse.move(g.x1, g.y1, { steps: 6 }); await page.mouse.up();
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => ({ x: UT.state.probe.x, drags: window.__uiCount.stop() }));
    A.near(after.x - g.px, 20, 1, `probe moved by dragged mm (${g.px} → ${after.x})`); A.eq(after.drags, 1, "'ui' probe-drag events");
    const tb = await page.evaluate(() => {
      UT.setIn('display', { touchBar: 'on' }); UT.renderNow(); if (UT.app.refreshTouchBar) UT.app.refreshTouchBar();
      const bar = document.getElementById('touchbar'); const vis = bar && bar.offsetParent !== null && getComputedStyle(bar).display !== 'none';
      const btns = bar ? Array.from(bar.querySelectorAll('.tbar-btn')).filter(b => b.offsetParent !== null) : [];
      const step = document.getElementById('tbar-step');
      UT.setIn('display', { scale: 'fixed' }); UT.renderNow(); if (UT.app.applyScale) UT.app.applyScale();
      const app = document.getElementById('app');
      return { vis, n: btns.filter(b => b.id !== 'tbar-step').length, step: !!step && step.offsetParent !== null, transform: app.style.transform, scaled: app.classList.contains('scaled') };
    });
    A.ok(tb.vis, 'touch bar visible when on'); A.ge(tb.n, 9, 'touch-bar buttons (excluding Step)'); A.ok(tb.step, 'Step button');
    A.ok(!tb.transform && !tb.scaled, `display.scale 'fixed' removes the transform (transform '${tb.transform}')`);
    A.eq(errors.length, 0, 'console errors: ' + errors.slice(0, 3).join(' ; '));
  } finally { await browser.close(); }
  return A.result();
});

check('V2-20 scenario capture/apply, share URL, exam flow and result token', 'v2', async ({ page, launchFresh, file }) => {
  const A = checker();
  const r = await page.evaluate(async () => {
    UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]); UT.test.addPreset('rootCrack'); UT.test.addPreset('lof');
    UT.test.setProbe({ angle: 60, x: 38 }); UT.test.setInstrument({ gain: 33 });
    UT.setIn('scenario', { title: 'ACC scenario' });
    const saved = UT.test.scenario.capture();
    UT.test.setInstrument({ gain: 50 }); UT.test.setDefects([]);
    UT.test.scenario.apply(saved);
    const restored = { gain: UT.state.instrument.gain, nDef: UT.state.defects.length, x: UT.state.probe.x };
    const url = await UT.test.scenario.toUrl();
    const examUrl = await UT.test.scenario.toUrl(saved, { exam: { code: '1234' } });
    const examObj = await UT.test.scenario.fromUrl(examUrl);
    return { restored, url, examUrl, examHasDefects: !!(examObj && examObj.defects), examMode: examObj && examObj.mode, examKeys: examObj ? Object.keys(examObj) : null, defects: UT.state.defects.map(d => d.type) };
  });
  A.eq(r.restored.gain, 33, 'apply restores gain'); A.eq(r.restored.nDef, 2, 'apply restores defects'); A.eq(r.restored.x, 38, 'apply restores probe x');
  A.ok(typeof r.url === 'string' && r.url.indexOf('#') > 0, 'toUrl gives a hash URL'); A.eq(r.examHasDefects, false, 'exam URL carries no defects');
  const hash = r.url.slice(r.url.indexOf('#'));
  const one = await launchFresh({ hash, settle: 1200 });
  try {
    const s = await one.page.evaluate(() => ({ types: UT.state.defects.map(d => d.type), x: UT.state.probe.x, angle: UT.state.probe.angle, gain: UT.state.instrument.gain, toast: !!(UT.scenario.lastToast) || !!document.getElementById('scn-toast'), title: UT.scenario.lastToast && UT.scenario.lastToast.title }));
    A.eq(JSON.stringify(s.types), JSON.stringify(r.defects), 'fresh page: same defects'); A.eq(s.x, 38, 'fresh page: probe x'); A.eq(s.gain, 33, 'fresh page: gain'); A.ok(s.toast, 'title toast shown');
    A.eq(one.errors.length, 0, 'console errors (scenario page): ' + one.errors.slice(0, 2).join(' ; '));
  } finally { await one.browser.close(); }
  const ex = await launchFresh({ hash: r.examUrl.slice(r.examUrl.indexOf('#')), settle: 1500 });
  try {
    const e = await ex.page.evaluate(() => {
      const out = {};
      out.locked = !!(UT.state.trade.exam && UT.state.trade.exam.locked); out.active = UT.state.trade.active;
      out.truth = UT.test.trade.truth(); out.defectsKey = 'defects' in UT.test.state(); out.hide = UT.state.display.hide;
      out.rev0 = UT.test.trade.reveal('0000'); out.hideAfter0 = UT.state.display.hide; out.defectsAfter0 = 'defects' in UT.test.state();
      out.score = UT.test.trade.submit([]);
      const res = UT.state.trade.result; out.token = res && res.token;
      out.verify = out.token ? UT.test.trade.verifyResult(out.token) : null;
      out.tampered = out.token ? UT.test.trade.verifyResult(out.token.slice(0, -3) + 'abc') : null;
      out.rev1 = UT.test.trade.reveal('1234'); out.defectsAfter1 = 'defects' in UT.test.state();
      return out;
    });
    A.ok(e.locked, 'exam locked after load'); A.ok(Array.isArray(e.truth) && e.truth.length === 0, 'truth() is [] while locked'); A.eq(e.defectsKey, false, 'state().defects absent while locked');
    A.eq(e.rev0, false, "reveal('0000') → false"); A.eq(e.hideAfter0, true, 'display.hide stays true'); A.eq(e.defectsAfter0, false, 'defects still absent after wrong code');
    A.ok(e.verify && e.verify.ok === true && Number.isFinite(e.verify.score), 'verifyResult(token) ok: ' + JSON.stringify(e.verify));
    A.ok(e.tampered && e.tampered.ok === false, 'tampered token rejected');
    A.eq(e.rev1, true, "reveal('1234') → true"); A.eq(e.defectsAfter1, true, 'defects visible after reveal');
    A.eq(ex.errors.length, 0, 'console errors (exam page): ' + ex.errors.slice(0, 2).join(' ; '));
  } finally { await ex.browser.close(); }
  return A.result();
});

check('V2-21 gate alarm sound: edge-triggered beep, no AudioContext while off', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(async () => {
    UT.test.loadSpecimen('iow'); UT.test.setProbe({ angle: 60, side: 1, x: 262.5 });
    UT.setIn('display', { sound: false }); UT.audio.ctx = null;
    UT.test.setInstrument({ range: 100, gain: 40, gates: [{ on: true, alarm: true, start: 10, width: 60, level: 20 }] });
    UT.test.compute();
    const ctxOff = UT.audio.ctx;
    UT.test.setInstrument({ gates: [{ on: true, alarm: false, start: 10, width: 60, level: 20 }] }); UT.test.compute();
    UT.setIn('display', { sound: true });
    if (UT.audio.unlock) UT.audio.unlock();
    const b0 = UT.audio.lastBeep;
    await new Promise(r => setTimeout(r, 5));
    UT.test.setInstrument({ gates: [{ on: true, alarm: true, start: 10, width: 60, level: 20 }] }); UT.test.compute();
    const b1 = UT.audio.lastBeep;
    await new Promise(r => setTimeout(r, 5));
    UT.test.compute(); UT.test.compute();
    const b2 = UT.audio.lastBeep;
    UT.setIn('display', { sound: false });
    UT.test.setInstrument({ gates: [{ on: true, alarm: false, start: 10, width: 60, level: 20 }] });
    return { ctxOff: !!ctxOff, ctxOn: !!UT.audio.ctx, b0, b1, b2 };
  });
  A.eq(r.ctxOff, false, 'no AudioContext while sound is off');
  A.ok(r.b1 && r.b1 !== r.b0, `lastBeep updated on the alarm edge (${r.b0} → ${r.b1})`); A.eq(r.b2, r.b1, 'no repeated beep while the alarm holds');
  return A.result();
});

check('V2-22 accessibility: menubar keyboard model, aria-pressed, high contrast, aria-live', 'v2', async ({ page }) => {
  const A = checker();
  const pre = await page.evaluate(() => { ACC.reset(); document.body.focus(); return { menubar: !!document.querySelector('#menubar[role=menubar]') }; });
  A.ok(pre.menubar, '#menubar[role=menubar]');
  await page.keyboard.press('F10'); await page.waitForTimeout(80);
  const m0 = await page.evaluate(() => Array.from(document.querySelectorAll('#menubar .menu-item')).filter(e => e.getAttribute('aria-expanded') === 'true').map(e => e.id));
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(80);
  const m1 = await page.evaluate(() => Array.from(document.querySelectorAll('#menubar .menu-item')).filter(e => e.getAttribute('aria-expanded') === 'true').map(e => e.id));
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(50);
  const f1 = await page.evaluate(() => { const a = document.activeElement; return a ? { id: a.id, cls: a.className, inProbes: !!a.closest('#menu-probes') } : null; });
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(50);
  const f2 = await page.evaluate(() => { const a = document.activeElement; return a ? { id: a.id, cls: a.className, txt: (a.textContent || '').trim().slice(0, 30) } : null; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(50);
  A.ok(m0.length === 1, `F10 opens a menu (${m0.join(',')})`); A.ok(m1.length === 1 && m1[0] === 'menu-probes', `ArrowRight opens Probes (${m1.join(',')})`);
  A.ok(f1 && f1.inProbes, 'ArrowDown focuses an entry of the Probes menu: ' + JSON.stringify(f1));
  A.ok(f2 && f1 && (f2.txt !== (f1.txt || '') || f2.id !== f1.id), 'ArrowDown moves the focus again: ' + JSON.stringify(f2));
  const r = await page.evaluate(() => {
    const tb = Array.from(document.querySelectorAll('.tb-btn, [id^=tb-]')).filter(b => /^tb-/.test(b.id));
    const missing = tb.filter(b => !b.hasAttribute('aria-pressed')).map(b => b.id);
    UT.setIn('display', { highContrast: true }); UT.renderNow(); const hc = document.getElementById('app').classList.contains('hc');
    UT.setIn('display', { highContrast: false }); UT.renderNow();
    UT.lessons.window.open(); const w = UT.dom.wins.lessons; const live = w && !!w.el.querySelector('[aria-live]'); UT.lessons.window.close();
    return { n: tb.length, missing, hc, live };
  });
  A.ok(r.n >= 19 && r.missing.length === 0, `aria-pressed on every tb-* (${r.n}, missing ${r.missing.join(',')})`);
  A.ok(r.hc, 'display.highContrast adds .hc'); A.ok(r.live, 'lessons window has an [aria-live] region');
  return A.result();
});

check('V2-23 weld preparations build, trace, fusion faces, backing bar echo', 'v2', async ({ page, errors }) => {
  const A = checker();
  const k0 = errors.length;
  const r = await page.evaluate(() => {
    const out = {};
    const distSeg = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y; const l2 = dx * dx + dy * dy || 1; let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)); };
    for (const prep of ['single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle']) {
      const o = { prep };
      try {
        UT.test.loadSpecimen('plate-weld', { T: 20, prep });
        UT.test.setDefects([]);
        const spec = UT.state.specimen; const faces = (spec.weld && spec.weld.fusionFaces) || [];
        o.faces = faces.length; o.type = UT.state.weldOpts.type; o.prepState = UT.state.weldOpts.prep;
        UT.test.setProbe({ angle: 60, side: 1, x: spec.defaultProbe ? spec.defaultProbe.x : 40, surface: 'chord' }); UT.test.compute(); o.echoes = UT.test.echoes().length;
        const d = UT.test.addPreset('lof');
        if (d) { const mid = { x: (d.pts[0].x + d.pts[1].x) / 2, y: (d.pts[0].y + d.pts[1].y) / 2 }; o.lofDist = Math.min(...faces.map(f => distSeg(mid, f.a, f.b)), 99); } else o.lofDist = null;
        if (prep === 'single-v-backing') {
          UT.test.setDefects([]); UT.test.setInstrument({ range: 125, gain: 44 });
          let best = null;
          for (let x = 15; x <= 90; x += 1) { UT.test.setProbe({ x }); for (const e of UT.test.echoes()) if (e.kind === 'geometry' && /backing/.test(e.tag || '') && (!best || e.ampPct > best.ampPct)) best = Object.assign({ x }, e); }
          o.backing = best && { x: best.x, path: best.path, amp: best.ampPct, tag: best.tag };
          o.backingEdges = spec.weld && spec.weld.backing ? true : false;
        }
      } catch (e) { o.error = String(e && e.message || e); }
      out[prep] = o;
    }
    UT.test.loadSpecimen('plate-weld', { T: 20, prep: 'single-v' });
    return out;
  });
  for (const prep of Object.keys(r)) {
    const o = r[prep];
    if (o.error) { A.fail(`${prep}: ${o.error}`); continue; }
    A.ge(o.faces, 1, `${prep} fusion faces`); A.eq(o.prepState, prep, `${prep} weldOpts.prep`);
    const expType = /fillet|nozzle/.test(prep) ? 'fillet' : 'single-v';
    A.eq(o.type, expType, `${prep} weldOpts.type`);
    if (o.lofDist !== null) A.le(o.lofDist, 1, `${prep} LOF preset on a fusion face (distance mm)`); else A.fail(`${prep}: addPreset('lof') returned null`);
    if (prep === 'single-v-backing') A.ok(!!o.backing, 'backing bar geometry echo (tag backing)' + (o.backing ? ` at x ${o.backing.x}, path ${o.backing.path.toFixed(1)}` : ''));
  }
  A.eq(errors.length - k0, 0, 'console errors: ' + errors.slice(k0, k0 + 3).join(' ; '));
  return A.result();
});

check('V2-24 datalogger SAVE, AUTO 80 %, compare snapshot', 'v2', async ({ page }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    UT.test.loadSpecimen('iow'); UT.test.setProbe({ angle: 60, side: 1, x: 262.5 });
    UT.test.setInstrument({ range: 100, gain: 30, gates: [{ on: true, start: 18, width: 16, level: 5 }], compare: null });
    UT.set({ utSet: 'epoch600' }); UT.renderNow();
    const n0 = UT.test.datalog().length;
    const btn = Array.from(document.querySelectorAll('#instrument button, #instrument .ik-save, #instrument [class*=save]')).find(b => /^SAVE$/.test((b.textContent || '').trim()));
    let how = 'dom';
    if (btn) btn.click(); else { how = 'api'; UT.instruments.save(); }
    UT.renderNow();
    const n1 = UT.test.datalog().length;
    const g = UT.instruments.auto(80); UT.renderNow();
    const pk = ACC.gatedPeak();
    const grey0 = ACC.greyPixels('cv-ascan');
    UT.instruments.compare(true); UT.renderNow();
    const grey1 = ACC.greyPixels('cv-ascan');
    const isF32 = UT.state.instrument.compare instanceof Float32Array;
    const cloned = UT.test.state().instrument.compare;
    UT.instruments.compare(false); UT.renderNow();
    return { n0, n1, how, g, pk, grey0, grey1, isF32, cloned: cloned === undefined ? 'undefined' : cloned };
  });
  A.eq(r.n1, r.n0 + 1, `SAVE adds a datalog entry (${r.how})`); A.near(r.pk, 80, 1, 'AUTO 80 % gated peak');
  A.ok(r.isF32, 'instrument.compare is a Float32Array'); A.ok(r.grey1 > r.grey0, `grey trace drawn (${r.grey0} → ${r.grey1} grey px)`);
  A.ok(r.cloned === 'undefined' || r.cloned === null, 'state().instrument.compare is undefined/null (' + r.cloned + ')');
  return A.result();
});

check('V2-25 runner lists ≥ 40 checks and writes JSON', 'v2', async ({ jsonOut }) => {
  const A = checker();
  const listed = CHECKS.filter(c => !/^V2-25/.test(c.name));
  A.ge(listed.length, 40, 'checks listed (excluding V2-25)');
  const bad = listed.filter(c => !c.name || typeof c.fn !== 'function');
  A.eq(bad.length, 0, 'every check has a name and a function');
  A.note(`${listed.length} checks (${CHECKS.filter(c => c.group === 'v1').length} v1 + ${CHECKS.filter(c => c.group === 'v2').length - 1} v2), json ${jsonOut || '(none)'}`);
  return A.result();
});

check('V2-26 CI workflow YAML (§6.2), build outputs identical, size < 2.5 MB', 'v2', async ({ file }) => {
  const A = checker();
  const wf = path.join(REPO, '.github', 'workflows', 'utsim-ci.yml');
  A.ok(fs.existsSync(wf), 'workflow file exists');
  if (fs.existsSync(wf)) {
    let doc = null;
    try {
      const out = execSync('python3 -c "import sys,json,yaml; print(json.dumps(yaml.safe_load(open(sys.argv[1]).read())))" ' + JSON.stringify(wf), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      doc = JSON.parse(out);
    } catch (e) { A.note('python yaml unavailable (' + String(e.message).split('\n')[0].slice(0, 60) + '), textual check only'); }
    const text = fs.readFileSync(wf, 'utf8');
    const paths = ['ut-simulator/**', 'utman_simulator.html', '.github/workflows/utsim-ci.yml'];
    if (doc) {
      const on = doc.on || doc[true];
      A.ok(on && on.push && JSON.stringify(on.push.paths) === JSON.stringify(paths), 'on.push.paths');
      A.ok(on && on.pull_request && JSON.stringify(on.pull_request.paths) === JSON.stringify(paths), 'on.pull_request.paths');
      const jobs = doc.jobs ? Object.values(doc.jobs) : [];
      A.eq(jobs.length, 1, 'one job');
      const job = jobs[0] || {};
      A.eq(job['runs-on'], 'ubuntu-latest', 'runs-on'); A.eq(String(job.env && job.env.CI), 'true', "env CI 'true'");
      const steps = job.steps || [];
      const sig = steps.map(s => s.uses ? 'uses:' + s.uses : 'run:' + String(s.run).trim());
      const expected = ['uses:actions/checkout@v4', 'uses:actions/setup-node@v4', 'uses:actions/setup-python@v5', 'run:npm i -g playwright@1.56.0', 'run:echo "NODE_PATH=$(npm root -g)" >> "$GITHUB_ENV"',
        'run:npx --yes playwright@1.56.0 install --with-deps chromium', 'run:node tools/node-load.mjs --selftest', 'run:python3 build.py', 'run:node tools/acceptance.mjs --json acceptance.json', 'uses:actions/upload-artifact@v4'];
      A.eq(JSON.stringify(sig), JSON.stringify(expected), 'steps exactly as §6.2: ' + sig.join(' → '));
      const node = steps.find(s => s.uses === 'actions/setup-node@v4'); A.ok(node && String(node.with && node.with['node-version']) === '20', 'node-version 20');
      const py = steps.find(s => s.uses === 'actions/setup-python@v5'); A.ok(py && /^3/.test(String(py.with && py.with['python-version'])), 'python-version 3.x');
      for (const s of steps.filter(s => s.run && /node-load|build\.py|acceptance/.test(s.run))) A.eq(s['working-directory'] || (job.defaults && job.defaults.run && job.defaults.run['working-directory']), 'ut-simulator', 'working-directory of ' + s.run.trim());
      const up = steps.find(s => s.uses === 'actions/upload-artifact@v4');
      const upPaths = up && up.with && String(up.with.path).split('\n').map(s => s.trim()).filter(Boolean);
      A.ok(upPaths && JSON.stringify(upPaths) === JSON.stringify(['utman_simulator.html', 'docs/utman_simulator.html', 'ut-simulator/acceptance.json']), 'upload-artifact paths: ' + JSON.stringify(upPaths));
    } else {
      for (const s of ['playwright@1.56.0', 'NODE_PATH=$(npm root -g)', 'GITHUB_ENV', 'node tools/node-load.mjs --selftest', 'python3 build.py', 'node tools/acceptance.mjs --json acceptance.json', 'actions/upload-artifact@v4', "CI: 'true'"]) A.ok(text.indexOf(s) >= 0, 'workflow contains ' + s);
    }
  }
  const main = path.join(REPO, 'utman_simulator.html'), docs = path.join(REPO, 'docs', 'utman_simulator.html');
  A.ok(fs.existsSync(main) && fs.existsSync(docs), 'both build outputs exist');
  if (fs.existsSync(main) && fs.existsSync(docs)) A.ok(fs.readFileSync(main).equals(fs.readFileSync(docs)), 'outputs byte-identical');
  const size = fs.statSync(file).size; A.le(size, 2.5 * 1024 * 1024 - 1, `size ${(size / 1024 / 1024).toFixed(2)} MB`);
  const deploy = path.join(REPO, '.github', 'workflows', 'deploy-pages.yml');
  A.ok(!fs.existsSync(deploy) || !/utsim|acceptance/.test(fs.readFileSync(deploy, 'utf8')), 'deploy-pages.yml untouched by the UTsim job');
  return A.result();
});

check('V2-27 performance budgets (§6.4)', 'v2', async ({ page, budget }) => {
  const A = checker();
  const r = await page.evaluate(() => {
    const out = {};
    UT.test.loadSpecimen('plate-weld', { T: 20 }); UT.test.setDefects([]);
    for (const p of ['rootCrack', 'lof', 'porosity', 'slag', 'toeCrack', 'centrelineCrack', 'incompletePenetration', 'lamination']) UT.test.addPreset(p);
    out.nDef = UT.state.defects.length;
    UT.test.setProbe({ angle: 60, side: 1, x: 40 }); UT.test.setInstrument({ range: 100, gain: 34 });
    const mean = (fn, n) => { for (let i = 0; i < 5; i++) fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t0) / n; };
    UT.test.setPhysics({ fanRays: 41, modeConv: true }); out.ms41 = mean(() => UT.test.compute(), 20);
    UT.test.setPhysics({ fanRays: 21 }); out.ms21 = mean(() => UT.test.compute(), 20);
    UT.test.setPhysics({ fanRays: 41 });
    UT.test.setDefects([]); UT.test.addPreset('rootCrack');
    UT.test.enterMode('tofd', { silentUI: true }); UT.renderNow();
    let t0 = performance.now(); UT.test.runTofdScan(); out.tofdMs = performance.now() - t0;
    UT.test.enterMode('weld', { silentUI: true });
    UT.test.loadSpecimen('pipe-weld', { od: 609.6, wt: 20 }); UT.test.setDefects([]); UT.test.addPreset('rootCrack');
    UT.test.enterMode('aut', { silentUI: true }); UT.renderNow();
    t0 = performance.now(); const sc = UT.test.runAutScan(); out.autMs = performance.now() - t0; out.autN = sc.n;
    UT.test.enterMode('weld', { silentUI: true });
    UT.test.loadSpecimen('dac', { T: 40 }); UT.test.setProbe({ x: 178 });
    if (UT.pa && UT.pa.ensurePa) UT.pa.ensurePa();
    out.paMs = mean(() => UT.test.pa.sscan(), 10); out.paCols = UT.test.pa.sscan().columns.length;
    UT.setIn('probe', { method: 'pe' });
    return out;
  });
  A.le(r.ms41, budget(10), `compute 41 rays + modeConv ms (${r.nDef} defects)`); A.le(r.ms21, budget(6), 'compute 21 rays ms');
  A.le(r.autMs, budget(1500), `AUT 24-inch sync ms (${r.autN} columns)`); A.le(r.tofdMs, budget(800), 'TOFD D-scan ms'); A.le(r.paMs, budget(60), `PA S-scan ms (${r.paCols} angles)`);
  A.note(`41: ${r.ms41.toFixed(2)} ms, 21: ${r.ms21.toFixed(2)} ms, AUT ${r.autMs.toFixed(0)} ms, TOFD ${r.tofdMs.toFixed(0)} ms, PA ${r.paMs.toFixed(1)} ms${CI ? ' (CI ×2)' : ''}`);
  return A.result();
});

// ---------------------------------------------------------------------------------------------- runner
async function main() {
  const selected = CHECKS.filter(c => (!ONLY || c.group === ONLY) && (!GREP || c.name.toLowerCase().includes(GREP.toLowerCase())));
  if (!selected.length) { console.error('no checks selected'); process.exit(2); }
  const t0 = Date.now();
  const { browser, page, errors } = await launch({ file: FILE });
  const bootErrors = errors.slice();
  await installHelpers(page);
  const launchFresh = (opts) => launch(Object.assign({ file: FILE }, opts || {}));
  const ctx = { page, browser, errors, bootErrors, file: FILE, launchFresh, budget: (ms) => ms * TIME_FACTOR, ci: CI, jsonOut: JSON_OUT };
  const results = [];
  for (const c of selected) {
    const start = Date.now();
    const k = errors.length;
    let res;
    try {
      if (c.group !== 'v1' || !/V1-14/.test(c.name)) await page.evaluate(() => ACC.reset());
      const timeout = c.timeout || 180000;
      let timer = null;
      const guard = new Promise(resolve => { timer = setTimeout(() => resolve({ pass: false, detail: `TIMEOUT after ${timeout} ms` }), timeout); });
      res = await Promise.race([c.fn(ctx), guard]).finally(() => clearTimeout(timer));
    } catch (e) {
      res = { pass: false, detail: 'EXCEPTION ' + String(e && e.stack || e).split('\n').slice(0, 2).join(' ') };
    }
    const newErrors = errors.slice(k);
    const row = { name: c.name, group: c.group, pass: !!res.pass, detail: res.detail || '', ms: Date.now() - start };
    if (newErrors.length) row.consoleErrors = newErrors.slice(0, 5);
    results.push(row);
    const mark = row.pass ? 'PASS' : 'FAIL';
    process.stdout.write(`${mark}  ${row.name.padEnd(78)} ${String(row.ms).padStart(6)} ms  ${VERBOSE || !row.pass ? row.detail : row.detail.slice(0, 100)}${newErrors.length ? '  [console errors: ' + newErrors.length + ']' : ''}\n`);
  }
  await browser.close();
  const passed = results.filter(r => r.pass).length;
  const summary = { file: FILE, date: new Date().toISOString(), ci: CI, timeFactor: TIME_FACTOR, node: process.version, only: ONLY, total: results.length, passed, failed: results.length - passed, ms: Date.now() - t0, checks: results };
  if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 1)); }
  console.log(`\n${passed}/${results.length} checks passed in ${((Date.now() - t0) / 1000).toFixed(1)} s${JSON_OUT ? ' — JSON: ' + JSON_OUT : ''}`);
  if (passed < results.length) { console.log('failed: ' + results.filter(r => !r.pass).map(r => r.name.split(' ')[0]).join(', ')); process.exit(1); }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(2); });
