/* 55-aut.js — AUT (automated ultrasonic testing): fixed-x scan along the weld, three transit/TOF
 * gates, strip charts (amplitude + TOF), colour map and the AUT panel window ('aut').
 * Physics functions are pure functions of their arguments; only startScan()/stopScan(), the panel
 * and the test API read/write UT.state. SPEC §6.8 as amended by §14.6, §15.10 and §15.11.
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - The scan runs at the CURRENT probe x (state.probe.x, "user chosen" by dragging the probe) and at
//   the probe's skew; state.aut.x is refreshed to that x whenever a scan is started so the value in the
//   state mirrors the last scan. z steps 0 … L inclusive in 1 mm steps (n = L + 1, like the TOFD D-scan).
// - One trace at the fixed x (UT.rays.trace with the same opts 40-ascan uses: maxPath = delay + range,
//   21 fan rays, maxLegs from display.skips) and per z: amp = ampNoZ · UT.rays.zFactor(...) for echoes
//   that belong to a defect (echoes without defectId are z-independent), then UT.ascan.synth at
//   nSamples = UT.ascan.N_SAMPLES and UT.ascan.evalGates with {...instrument, gates: aut.gates,
//   activeGate: aut.activeGate}; so the column at z = probe.z equals frame.aut.readouts exactly.
// - scan.amp[i][k] = the gate's peak % FSH (unclipped, as evalGates reports); when nothing in the gate
//   reaches the level the value is the gate's maximum sample (< level) so the amplitude trace stays
//   continuous, and scan.tof[i][k] = NaN. scan.tof is the TRUE sound path (mm) of the gated peak.
//   Unscanned columns (animated scan in progress) hold NaN in both arrays; scan.filled counts columns.
// - Gates that are off produce amp = 0 / tof = NaN and are skipped by aboveLevel().
// - Colour map = §14.6 seven bands (white ≥ 100, red 80–100, magenta 60–80, yellow 40–60, green 25–40,
//   cyan 10–25, blue < 10); "Rev Map" reverses the colour order (blue for the strongest, white for the
//   weakest) in the legend and in the TOF strip. The §6.8 five-band map is superseded by §14.6.
// - RDT / RTD radios: state.aut.strip ∈ 'rdt' (amplitude strip only) | 'rtd' (TOF strip only) | 'both'
//   (default; both strips side by side). aut.rectified mirrors strip !== 'rtd' for other modules.
// - A "Gate on" checkbox is added to the gate group (the frozen default state has gate 3 off and the
//   screenshot offers no way to switch a gate on); "Gates Same" copies gate 1 (start/width/level/on)
//   into gates 2 and 3.
// - Level spinner 1 % steps (1 … 100), Width slider 1 mm steps (1 … 200), Start slider 1 mm steps
//   (0 … 400); Range ◀▶ ±2 % (10 … 1000 mm), X-Shift ◀▶ ±1 mm, AMP slider 0 … 110 dB — all written
//   through UT.setIn('instrument' | 'aut', …).
// - Animated scan: 6 columns per frame; the probe is moved along with the scan head (UT.setIn('probe',
//   {z})) so the live A-scan / cross-section follow it, and its original z is restored when the scan
//   finishes or is stopped. Partial scans are stored via UT.setIn('aut', {scan, running}) and
//   'scan:progress' {kind: 'aut', i, n} is emitted every frame. runScan() is pure and synchronous
//   (opts.sync accepted and ignored).
// - Strip canvas cv-aut-strip (186 × 430 CSS px): z runs top (0) → bottom (L); amplitude strip white
//   with dashed vertical threshold lines at every ON gate's level (the active gate darker), the active
//   gate's trace black (others grey); TOF strip blue with a white bar at (tof − start)/width and a
//   3 px amplitude-colour tick beside it; red horizontal line at the scan head (probe.z when idle).
//   Clicking on the strip sets probe.z. Faint z labels every 50 mm on the amplitude strip.
// - OFF / ✕ leave the mode through UT.modes.exit() when available (re-entrancy guarded); without
//   80-modes they simply hide the panel. The window is positioned over the instrument column.
(function (UT) {
  'use strict';
  const M = UT.math;

  const COLS_PER_FRAME = 6;
  const STRIP = { w: 186, h: 430 };
  const ASCAN = { w: 232, h: 122 };
  const LEGEND = { w: 16, h: 122 };
  const LIMITS = { level: [1, 100], width: [1, 200], start: [0, 400], range: [10, 1000], delay: [-50, 1000], gain: [0, 110] };

  /** Colour bands top → bottom (§14.6). */
  const BANDS = [
    { min: 100, colour: '#ffffff', label: '≥100' },
    { min: 80, colour: '#ff0000', label: '80' },
    { min: 60, colour: '#ff00ff', label: '60' },
    { min: 40, colour: '#ffff00', label: '40' },
    { min: 25, colour: '#00c000', label: '25' },
    { min: 10, colour: '#00ffff', label: '10' },
    { min: -Infinity, colour: '#0000ff', label: '<10' },
  ];

  // ================================================================== colour map
  /**
   * Colour of an amplitude (% FSH) in the 7-band AUT map.
   * @param {number} pct  amplitude % FSH (NaN → transparent black)
   * @param {boolean} [rev]  reverse the map ("Rev Map")
   * @returns {string} CSS colour
   */
  function colourFor(pct, rev) {
    if (!Number.isFinite(pct)) return 'rgba(0,0,0,0)';
    let idx = BANDS.length - 1;
    for (let i = 0; i < BANDS.length; i++) { if (pct >= BANDS[i].min) { idx = i; break; } }
    return BANDS[rev ? BANDS.length - 1 - idx : idx].colour;
  }

  // ================================================================== physics
  function autOf(state) { return (state && state.aut) || UT.defaultState().aut; }
  function gatesOf(state) { return autOf(state).gates || []; }

  function traceOpts(state, spec, probe) {
    const inst = state.instrument || {};
    return {
      maxPath: (inst.delay || 0) + (inst.range || 100),
      fanCount: 21,
      maxLegs: ((probe.angle || 0) === 0 || (spec && spec.kind === 'block')) ? 12 : ((state.display && state.display.skips) || 3),
    };
  }

  function visibleDefects(state) { return (state.defects || []).filter(function (d) { return d && d.visible !== false; }); }

  /**
   * Trace ONCE at the fixed probe x and build the per-z cache used by scanColumn().
   * @param {object} state  UT.state-like ({specimen, probe, instrument, display, defects, aut})
   * @returns {object|null} cache {spec, probe, derived, inst, instLike, defects, echoes, zDep, nSamples}
   */
  function prepare(state) {
    if (!state || !state.specimen) return null;
    if (!(UT.rays && typeof UT.rays.trace === 'function' && UT.ascan && typeof UT.ascan.synth === 'function')) return null;
    const spec = state.specimen;
    const probe = Object.assign({}, state.probe, { method: state.probe.method === 'pa' ? 'pe' : state.probe.method });
    const derived = UT.probe.derive(probe, spec);
    const inst = state.instrument || UT.defaultState().instrument;
    const defects = visibleDefects(state);
    let rays = null;
    try { rays = UT.rays.trace({ specimen: spec, probe, derived, display: state.display || {}, defects, opts: traceOpts(state, spec, probe) }); }
    catch (e) { console.error('[UT.aut] trace failed', e); rays = null; }
    const echoes = ((rays && rays.echoes) || []).map(function (e) { return Object.assign({}, e, { ampNoZ: Number.isFinite(e.ampNoZ) ? e.ampNoZ : e.amp }); });
    const a = autOf(state);
    const gates = (a.gates || []).map(function (g) { return Object.assign({}, g); });
    const instLike = Object.assign({}, inst, { gates, activeGate: a.activeGate || 0, peakMem: false, freeze: false });
    return {
      spec, probe, derived, inst, instLike, defects, echoes, rays, gates,
      zDep: echoes.map(function (e) { return e.defectId !== undefined; }),
      nSamples: (UT.ascan && UT.ascan.N_SAMPLES) || 1000,
    };
  }

  /** Maximum sample inside a gate (displayed-path window), 0 when the gate is empty. */
  function gateMax(ascan, g) {
    if (!ascan || !g || !(g.width > 0)) return 0;
    const n = ascan.samples.length;
    const i0 = Math.max(0, Math.ceil((g.start - ascan.delay) / ascan.range * (n - 1)));
    const i1 = Math.min(n - 1, Math.floor((g.start + g.width - ascan.delay) / ascan.range * (n - 1)));
    let m = 0;
    for (let i = i0; i <= i1; i++) if (ascan.samples[i] > m) m = ascan.samples[i];
    return m;
  }

  /**
   * One scan column: gate amplitudes (% FSH) and TOF (true path, mm; NaN when nothing above level)
   * for the probe at along-weld position z (probe x fixed).
   * @param {object} state  UT.state-like
   * @param {number} z  along-weld position (mm)
   * @param {object} [cached]  result of prepare(state) (built on the fly when omitted — slow)
   * @returns {{amp:number[], tof:number[]}} arrays of length gates.length (3)
   */
  function scanColumn(state, z, cached) {
    const c = cached || prepare(state);
    const nG = gatesOf(state).length || 3;
    const amp = new Array(nG).fill(0), tof = new Array(nG).fill(NaN);
    if (!c) return { amp, tof };
    const echoes = new Array(c.echoes.length);
    for (let i = 0; i < c.echoes.length; i++) {
      const e = c.echoes[i];
      if (c.zDep[i]) {
        const Z = UT.rays.zFactor(e, z, c.probe.skew || 0, c.defects, c.spec);
        echoes[i] = Object.assign({}, e, { amp: e.ampNoZ * Z });
      } else echoes[i] = e;
    }
    const probe = Object.assign({}, c.probe, { z });
    const ascan = UT.ascan.synth({ echoes, probe, derived: c.derived, instrument: c.instLike, nSamples: c.nSamples });
    const ro = UT.ascan.evalGates(ascan, c.instLike, c.derived, c.spec, probe);
    for (let i = 0; i < nG; i++) {
      const g = c.gates[i];
      const r = ro.gate[i];
      if (!g || !g.on) { amp[i] = 0; tof[i] = NaN; continue; }
      if (r) { amp[i] = r.peakPct; tof[i] = r.path; }
      else { amp[i] = gateMax(ascan, g); tof[i] = NaN; }
    }
    return { amp, tof };
  }

  function scanShell(state) {
    const spec = state.specimen;
    const L = Math.max(1, Math.round(spec.L || 300));
    const n = L + 1;
    const nG = gatesOf(state).length || 3;
    const amp = [], tof = [];
    for (let i = 0; i < nG; i++) { amp.push(new Float32Array(n).fill(NaN)); tof.push(new Float32Array(n).fill(NaN)); }
    return {
      z0: 0, z1: L, step: 1, n, amp, tof, filled: 0, done: false,
      x: state.probe.x, skew: state.probe.skew || 0, activeGate: autOf(state).activeGate || 0,
      gates: gatesOf(state).map(function (g) { return Object.assign({}, g); }),
      range: state.instrument.range, delay: state.instrument.delay || 0, gain: state.instrument.gain,
    };
  }

  function fillColumn(sc, k, col) {
    for (let i = 0; i < sc.amp.length; i++) { sc.amp[i][k] = col.amp[i]; sc.tof[i][k] = col.tof[i]; }
    if (k + 1 > sc.filled) sc.filled = k + 1;
  }

  /**
   * Synchronous full scan z = 0 … L (1 mm). PURE — the caller stores the result (UT.setIn('aut', {scan})).
   * @param {object} state  UT.state-like
   * @param {{sync?:boolean}} [opts]
   * @returns {{z0:number, z1:number, step:number, n:number, amp:Float32Array[], tof:Float32Array[]}|null}
   */
  function runScan(state, opts) {   // eslint-disable-line no-unused-vars
    if (!state || !state.specimen) return null;
    const c = prepare(state);
    const sc = scanShell(state);
    for (let k = 0; k < sc.n; k++) fillColumn(sc, k, scanColumn(state, sc.z0 + k * sc.step, c));
    sc.done = true;
    return sc;
  }

  /**
   * Intervals of z where a gate's amplitude exceeds its level.
   * @param {object} scan  a scan object
   * @param {number} gi  gate index
   * @returns {number[][]} [[zStart, zEnd], ...] (empty when the gate is off or nothing exceeds the level)
   */
  function aboveLevel(scan, gi) {
    const out = [];
    if (!scan || !scan.amp || !scan.amp[gi]) return out;
    const g = (scan.gates && scan.gates[gi]) || null;
    if (!g || !g.on) return out;
    const a = scan.amp[gi];
    let start = null;
    for (let k = 0; k < scan.n; k++) {
      const z = scan.z0 + k * scan.step;
      const on = Number.isFinite(a[k]) && a[k] > (g.level || 0);
      if (on && start === null) start = z;
      if (!on && start !== null) { out.push([start, z - scan.step]); start = null; }
    }
    if (start !== null) out.push([start, scan.z0 + (scan.n - 1) * scan.step]);
    return out;
  }

  // ================================================================== animated scan
  let anim = null;   // {sc, cache, i, handle, z0Probe}
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }
  function cancelRaf(h) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h); else clearTimeout(h);
  }
  function isScanning() { return !!anim; }

  /**
   * Animated scan (6 columns per frame): stores partial scans via UT.setIn('aut', {scan, running}),
   * moves the probe with the scan head and emits 'scan:progress' {kind:'aut', i, n}.
   * @returns {boolean} true when a scan was started
   */
  function startScan() {
    const state = UT.state;
    if (!state.specimen) return false;
    stopScan(true);
    const cache = prepare(state);
    if (!cache) return false;
    const sc = scanShell(state);
    anim = { sc, cache, i: 0, handle: null, z0Probe: state.probe.z };
    UT.setIn('aut', { scan: sc, running: true, x: state.probe.x }, { noRender: true });
    const stepFrame = function () {
      if (!anim || anim.sc !== sc) return;
      for (let k = 0; k < COLS_PER_FRAME && anim.i < sc.n; k++, anim.i++) fillColumn(sc, anim.i, scanColumn(state, sc.z0 + anim.i * sc.step, cache));
      const finished = anim.i >= sc.n;
      sc.done = finished;
      const headZ = sc.z0 + Math.min(anim.i, sc.n - 1) * sc.step;
      UT.setIn('probe', { z: finished ? anim.z0Probe : headZ }, { noRender: true });
      UT.setIn('aut', { scan: sc, running: !finished });
      UT.bus.emit('scan:progress', { kind: 'aut', i: anim.i, n: sc.n });
      if (finished) { anim = null; return; }
      anim.handle = raf(stepFrame);
    };
    anim.handle = raf(stepFrame);
    return true;
  }

  /**
   * Stop the animated scan (keeps the columns already built, restores the probe z).
   * @param {boolean} [silent]  do not touch aut.running
   */
  function stopScan(silent) {
    if (!anim) return false;
    if (anim.handle !== null) cancelRaf(anim.handle);
    const z0 = anim.z0Probe;
    anim = null;
    if (Number.isFinite(z0)) UT.setIn('probe', { z: z0 }, { noRender: !!silent });
    if (!silent) UT.setIn('aut', { running: false });
    return true;
  }

  // ================================================================== panel (DOM)
  const css = [
    '.win[data-win=aut] .win-body{padding:0;background:#000;color:#fff;overflow:hidden;font:12px "Segoe UI",Arial,sans-serif}',
    '.win[data-win=aut] .aut-panel{display:flex;align-items:flex-start;gap:4px;padding:3px}',
    '.win[data-win=aut] .aut-strip-col{display:flex;flex-direction:column;gap:3px}',
    '.win[data-win=aut] .aut-top{display:flex;align-items:stretch;height:34px}',
    '.win[data-win=aut] .aut-run{flex:1;margin:0;padding:0;font:bold 16px "Segoe UI",Arial,sans-serif;color:#000;background:#ececec;border:2px outset #fff;cursor:pointer}',
    '.win[data-win=aut] .aut-run.running{background:#ffe08a}',
    '.win[data-win=aut] .aut-clear{width:50px;margin:0 0 0 3px;padding:0;font:12px "Segoe UI",Arial,sans-serif;color:#000;background:#d8d8d8;border:2px outset #eee;cursor:pointer}',
    '.win[data-win=aut] #cv-aut-strip{display:block;width:186px;height:430px;cursor:crosshair;background:#000;border:1px solid #333}',
    '.win[data-win=aut] .aut-mid{display:flex;flex-direction:column;gap:2px}',
    '.win[data-win=aut] .aut-scope{display:flex;gap:4px;align-items:flex-start}',
    '.win[data-win=aut] #cv-aut-ascan{display:block;width:232px;height:122px;background:#000}',
    '.win[data-win=aut] #cv-aut-legend{display:block;width:16px;height:122px;border:1px solid #555}',
    '.win[data-win=aut] .aut-axis{display:flex;justify-content:space-between;width:232px;padding:0 10px 0 14px;box-sizing:border-box;font:bold 13px "Segoe UI",Arial,sans-serif;color:#fff}',
    '.win[data-win=aut] .aut-ctl{display:flex;gap:6px;align-items:flex-start;margin-top:2px}',
    '.win[data-win=aut] .aut-sliders{flex:1;min-width:0}',
    '.win[data-win=aut] .aut-slider{display:flex;align-items:center;gap:2px;margin:3px 0}',
    '.win[data-win=aut] .aut-slider input[type=range]{width:70px;height:12px;margin:0}',
    '.win[data-win=aut] .aut-slider button,.win[data-win=aut] .aut-gate-row button{width:16px;height:14px;padding:0;margin:0;font-size:8px;line-height:12px;border:1px outset #ddd;background:#e4e4e4;color:#000;cursor:pointer}',
    '.win[data-win=aut] .aut-slider span{margin-left:4px;white-space:nowrap}',
    '.win[data-win=aut] .aut-amp{display:flex;flex-direction:column;align-items:center;font:12px "Segoe UI",Arial,sans-serif}',
    '.win[data-win=aut] .aut-amp input[type=range]{writing-mode:vertical-lr;direction:rtl;height:52px;width:18px;margin:0}',
    '.win[data-win=aut] .aut-amp .aut-amp-val{font-size:11px;white-space:nowrap}',
    '.win[data-win=aut] .aut-off{width:38px;height:54px;margin:0;padding:0;font:bold 12px "Segoe UI",Arial,sans-serif;color:#fff;background:#2b2b2b;border:2px outset #777;cursor:pointer;align-self:center}',
    '.win[data-win=aut] .aut-gates{width:138px;border:1px groove #7fb;padding:4px 5px 5px;margin:0;position:relative}',
    '.win[data-win=aut] .aut-gates legend{color:#7fe7ff;font:12px "Segoe UI",Arial,sans-serif;padding:0 2px}',
    '.win[data-win=aut] .aut-radios{display:flex;justify-content:space-around;align-items:center;margin:0 0 4px}',
    '.win[data-win=aut] .aut-radios label{display:flex;align-items:center;gap:2px;cursor:pointer}',
    '.win[data-win=aut] .aut-gates input{margin:0 2px 0 0}',
    '.win[data-win=aut] .aut-gate-row{display:flex;align-items:center;justify-content:space-between;gap:3px;margin:4px 0}',
    '.win[data-win=aut] .aut-gate-row .aut-lbl{white-space:nowrap;min-width:78px}',
    '.win[data-win=aut] .aut-spin{display:flex;flex-direction:column;gap:1px}',
    '.win[data-win=aut] .aut-spin button{height:10px;line-height:8px;font-size:7px}',
    '.win[data-win=aut] .aut-hslider{display:flex;align-items:center;gap:1px}',
    '.win[data-win=aut] .aut-hslider input[type=range]{width:54px;height:12px;margin:0}',
    '.win[data-win=aut] .aut-same{display:block;width:100%;margin:6px 0 4px;padding:2px 0;font:13px "Segoe UI",Arial,sans-serif;color:#000;background:#7fdf7f;border:2px outset #bfffbf;cursor:pointer}',
    '.win[data-win=aut] .aut-rdt{margin-top:2px}',
    '.win[data-win=aut] .aut-rdt .aut-rdt-cap{display:flex;gap:14px;text-decoration:underline;margin-bottom:2px}',
    '.win[data-win=aut] .aut-rdt .aut-radios{margin:0 0 4px}',
    '.win[data-win=aut] .aut-rev,.win[data-win=aut] .aut-on{display:flex;align-items:center;gap:3px;cursor:pointer}',
  ].join('\n');

  const ui = { win: null, strip: null, ascan: null, legend: null, runBtn: null, inputs: {}, labels: {}, radios: [], stripRadios: [], subscribed: false, leaving: false };

  function autState() { return UT.state.aut || UT.defaultState().aut; }
  function setAut(patch) { UT.setIn('aut', patch); }
  function setInst(patch) { UT.setIn('instrument', patch); }
  function activeGate() { const a = autState(); return M.clamp(a.activeGate || 0, 0, Math.max(0, (a.gates || []).length - 1)); }
  function stripMode() { const a = autState(); return a.strip === 'rdt' || a.strip === 'rtd' ? a.strip : 'both'; }

  /** Patch one gate (clones the gates array). */
  function patchGate(gi, patch) {
    const gates = (autState().gates || []).map(function (g, i) { return i === gi ? Object.assign({}, g, patch) : Object.assign({}, g); });
    setAut({ gates });
  }
  function gateValue(key, v) { const l = LIMITS[key]; return Math.round(l ? M.clamp(v, l[0], l[1]) : v); }

  /** Leave the AUT mode (OFF / ✕): via UT.modes.exit when present, else just hide the panel. */
  function leave() {
    if (ui.leaving) return;
    ui.leaving = true;
    try {
      if (UT.state.mode === 'aut' && UT.modes && typeof UT.modes.exit === 'function') UT.modes.exit();
      else panel.close();
    } finally { ui.leaving = false; }
  }

  function anchorRect(id) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    return el ? el.getBoundingClientRect() : null;
  }

  function stripZRange() {
    const sc = autState().scan;
    const spec = UT.state.specimen;
    if (sc && Number.isFinite(sc.z0) && Number.isFinite(sc.z1) && sc.z1 > sc.z0) return { z0: sc.z0, z1: sc.z1 };
    return { z0: 0, z1: (spec && spec.L) || 300 };
  }

  function onStripMouse(e) {
    const p = UT.dom.localPos(e, ui.strip);
    const zr = stripZRange();
    if (p.y < 0 || p.y >= STRIP.h) return;
    const z = zr.z0 + (zr.z1 - zr.z0) * p.y / (STRIP.h - 1);
    const spec = UT.state.specimen;
    UT.setIn('probe', { z: M.clamp(Math.round(z), 0, (spec && spec.L) || z) });
    e.preventDefault();
  }

  function instSlider(label, key, min, max, step, btnStep, fmt) {
    const input = UT.dom.h('input', { type: 'range', min, max, step, title: label });
    const cur = function () { const v = +UT.state.instrument[key]; return Number.isFinite(v) ? v : 0; };
    input.value = cur();
    const apply = function (v) { const patch = {}; patch[key] = +M.clamp(v, LIMITS[key][0], LIMITS[key][1]).toFixed(2); setInst(patch); };
    input.addEventListener('input', function () { apply(parseFloat(input.value)); });
    const dec = UT.dom.h('button', { type: 'button', title: label + ' −' }, '◀');
    const inc = UT.dom.h('button', { type: 'button', title: label + ' +' }, '▶');
    dec.addEventListener('click', function () { apply(cur() - btnStep(cur())); });
    inc.addEventListener('click', function () { apply(cur() + btnStep(cur())); });
    ui.inputs[key] = input;
    const lbl = UT.dom.h('span', {}, label);
    ui.labels[key] = { el: lbl, fmt };
    return UT.dom.h('div', { class: 'aut-slider' }, [dec, input, inc, lbl]);
  }

  function buildScope() {
    const cv = UT.dom.h('canvas', { id: 'cv-aut-ascan', width: ASCAN.w, height: ASCAN.h, title: 'Live A-scan at the probe position with the three AUT gates (red / yellow / green)' });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      setInst({ gain: M.clamp((+UT.state.instrument.gain || 0) + (e.deltaY < 0 ? 1 : -1), LIMITS.gain[0], LIMITS.gain[1]) });
    }, { passive: false });
    const legend = UT.dom.h('canvas', { id: 'cv-aut-legend', width: LEGEND.w, height: LEGEND.h, title: 'Amplitude colour map (white ≥100 %, red, magenta, yellow, green, cyan, blue <10 %)' });
    const axis = UT.dom.h('div', { class: 'aut-axis' }, ['0', '2', '4', '6', '8', '10'].map(function (t) { return UT.dom.h('span', {}, t); }));
    const sliders = UT.dom.h('div', { class: 'aut-sliders' }, [
      instSlider('Range', 'range', LIMITS.range[0], LIMITS.range[1], 1, function (v) { return Math.max(1, Math.round(v * 0.02)); }, function (v) { return 'Range ' + M.fmt(v, 0) + 'mm'; }),
      instSlider('X-Shift', 'delay', LIMITS.delay[0], LIMITS.delay[1], 1, function () { return 1; }, function (v) { return 'X-Shift ' + M.fmt(v, 0) + 'mm'; }),
    ]);
    const amp = UT.dom.h('input', { type: 'range', min: LIMITS.gain[0], max: LIMITS.gain[1], step: 1, orient: 'vertical', title: 'AMP — gain (dB)' });
    amp.value = +UT.state.instrument.gain || 0;
    amp.addEventListener('input', function () { setInst({ gain: M.clamp(parseFloat(amp.value), LIMITS.gain[0], LIMITS.gain[1]) }); });
    ui.inputs.gain = amp;
    const ampVal = UT.dom.h('span', { class: 'aut-amp-val' }, 'AMP ' + Math.round(amp.value) + 'dB');
    ui.labels.gain = { el: ampVal, fmt: function (v) { return 'AMP ' + Math.round(v) + 'dB'; } };
    const ampBox = UT.dom.h('div', { class: 'aut-amp' }, [amp, ampVal]);
    const off = UT.dom.h('button', { class: 'aut-off', type: 'button', title: 'Leave AUT / AUT 종료' }, 'OFF');
    off.addEventListener('click', function () { leave(); });
    ui.ascan = cv;
    ui.legend = legend;
    return UT.dom.h('div', { class: 'aut-mid' }, [
      UT.dom.h('div', { class: 'aut-scope' }, [UT.dom.h('div', {}, [cv, axis]), legend]),
      UT.dom.h('div', { class: 'aut-ctl' }, [sliders, ampBox, off]),
    ]);
  }

  function gateRadio(i) {
    const r = UT.dom.h('input', { type: 'radio', name: 'aut-gate', value: String(i), title: 'Select gate ' + (i + 1) });
    r.addEventListener('change', function () { if (r.checked) setAut({ activeGate: i }); });
    ui.radios[i] = r;
    return UT.dom.h('label', {}, [r, String(i + 1)]);
  }

  function stripRadio(mode, title) {
    const r = UT.dom.h('input', { type: 'radio', name: 'aut-strip', value: mode, title });
    r.addEventListener('change', function () { if (r.checked) setAut({ strip: mode, rectified: mode !== 'rtd' }); });
    ui.stripRadios.push(r);
    return r;
  }

  function buildGateGroup() {
    const gi = function () { return activeGate(); };
    const gate = function () { return autState().gates[gi()] || { start: 0, width: 0, level: 0, on: false }; };
    // Level spinner
    const lvlLbl = UT.dom.h('span', { class: 'aut-lbl' }, 'Level=');
    const up = UT.dom.h('button', { type: 'button', title: 'Level +1 %' }, '▲');
    const dn = UT.dom.h('button', { type: 'button', title: 'Level −1 %' }, '▼');
    up.addEventListener('click', function () { patchGate(gi(), { level: gateValue('level', (gate().level || 0) + 1) }); });
    dn.addEventListener('click', function () { patchGate(gi(), { level: gateValue('level', (gate().level || 0) - 1) }); });
    ui.labels.level = { el: lvlLbl, fmt: function (v) { return 'Level=' + Math.round(v) + '%'; } };
    const levelRow = UT.dom.h('div', { class: 'aut-gate-row' }, [lvlLbl, UT.dom.h('div', { class: 'aut-spin' }, [up, dn])]);
    // Width / Start sliders
    const hslider = function (key, label, unit, title) {
      const lbl = UT.dom.h('span', { class: 'aut-lbl' }, label + '=');
      ui.labels[key] = { el: lbl, fmt: function (v) { return label + '=' + Math.round(v) + unit; } };
      const input = UT.dom.h('input', { type: 'range', min: LIMITS[key][0], max: LIMITS[key][1], step: 1, title });
      input.value = gate()[key] || 0;
      input.addEventListener('input', function () { const p = {}; p[key] = gateValue(key, parseFloat(input.value)); patchGate(gi(), p); });
      const dec = UT.dom.h('button', { type: 'button', title: label + ' −1' }, '◀');
      const inc = UT.dom.h('button', { type: 'button', title: label + ' +1' }, '▶');
      dec.addEventListener('click', function () { const p = {}; p[key] = gateValue(key, (gate()[key] || 0) - 1); patchGate(gi(), p); });
      inc.addEventListener('click', function () { const p = {}; p[key] = gateValue(key, (gate()[key] || 0) + 1); patchGate(gi(), p); });
      ui.inputs[key] = input;
      return UT.dom.h('div', { class: 'aut-gate-row' }, [lbl, UT.dom.h('div', { class: 'aut-hslider' }, [dec, input, inc])]);
    };
    const widthRow = hslider('width', 'Width', 'mm', 'Transit gate length (mm sound path)');
    const startRow = hslider('start', 'Start', 'mm', 'Gate start (mm sound path)');
    // Gate on checkbox
    const onChk = UT.dom.h('input', { type: 'checkbox', title: 'Gate on / off' });
    onChk.addEventListener('change', function () { patchGate(gi(), { on: !!onChk.checked }); });
    ui.inputs.on = onChk;
    // Gates same
    const same = UT.dom.h('button', { class: 'aut-same', type: 'button', title: 'Copy gate 1 settings to gates 2 and 3 / 게이트 1 설정을 2, 3에 복사' }, 'Gates Same');
    same.addEventListener('click', function () {
      const g1 = autState().gates[0];
      if (!g1) return;
      const gates = autState().gates.map(function (g, i) { return i === 0 ? Object.assign({}, g) : Object.assign({}, g, { start: g1.start, width: g1.width, level: g1.level, on: g1.on }); });
      setAut({ gates });
    });
    // RDT / RTD
    const rdt = UT.dom.h('div', { class: 'aut-rdt' }, [
      UT.dom.h('div', { class: 'aut-rdt-cap' }, [UT.dom.h('span', {}, 'RDT'), UT.dom.h('span', {}, 'RTD')]),
      UT.dom.h('div', { class: 'aut-radios' }, [
        stripRadio('rdt', 'RDT — rectified amplitude strip only'),
        stripRadio('rtd', 'RTD — transit time (TOF) strip only'),
        stripRadio('both', 'Both strips'),
      ]),
    ]);
    const rev = UT.dom.h('input', { type: 'checkbox', title: 'Reverse the colour map' });
    rev.addEventListener('change', function () { setAut({ revMap: !!rev.checked }); });
    ui.inputs.revMap = rev;
    return UT.dom.h('fieldset', { class: 'aut-gates' }, [
      UT.dom.h('legend', {}, 'Transit/TOF Gate'),
      UT.dom.h('div', { class: 'aut-radios' }, [gateRadio(0), gateRadio(1), gateRadio(2)]),
      levelRow, widthRow, startRow,
      UT.dom.h('label', { class: 'aut-on' }, [onChk, 'Gate on']),
      same, rdt,
      UT.dom.h('label', { class: 'aut-rev' }, [rev, 'Rev Map']),
    ]);
  }

  function buildWindow() {
    const runBtn = UT.dom.h('button', { class: 'aut-run', type: 'button', title: 'Scan along the weld at the current probe x / 현재 탐촉자 위치에서 용접선을 따라 자동 주사' }, 'Run Scan');
    runBtn.addEventListener('click', function () { if (isScanning()) stopScan(); else startScan(); syncInputs(); UT.requestRender(); });
    const clearBtn = UT.dom.h('button', { class: 'aut-clear', type: 'button', title: 'Clear the strip charts' }, 'Clear');
    clearBtn.addEventListener('click', function () { stopScan(true); setAut({ scan: null, running: false }); });
    const strip = UT.dom.h('canvas', { id: 'cv-aut-strip', width: STRIP.w, height: STRIP.h, title: 'Amplitude strip (white) and TOF strip (blue) along the weld — click to move the probe' });
    strip.addEventListener('mousedown', function (e) { if (e.button === 0) onStripMouse(e); });
    const content = UT.dom.h('div', { class: 'aut-panel' }, [
      UT.dom.h('div', { class: 'aut-strip-col' }, [UT.dom.h('div', { class: 'aut-top' }, [runBtn, clearBtn]), strip]),
      buildScope(),
      buildGateGroup(),
    ]);
    const inst = anchorRect('instrument');
    ui.win = UT.dom.win({
      name: 'aut', title: 'AUT', x: inst ? Math.max(0, Math.round(inst.left)) : 4, y: inst ? Math.max(0, Math.round(inst.top)) : 96,
      content, onClose: function () { leave(); },
    });
    ui.runBtn = runBtn;
    ui.strip = strip;
  }

  function syncInputs() {
    if (!ui.win) return;
    const a = autState(), inst = UT.state.instrument;
    const gi = activeGate();
    const g = a.gates[gi] || { start: 0, width: 0, level: 0, on: false };
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const set = function (key, v) { const el = ui.inputs[key]; if (el && active !== el && String(el.value) !== String(v)) el.value = v; };
    set('range', +inst.range || 100);
    set('delay', +inst.delay || 0);
    set('gain', +inst.gain || 0);
    set('width', g.width || 0);
    set('start', g.start || 0);
    if (ui.inputs.on) ui.inputs.on.checked = !!g.on;
    if (ui.inputs.revMap) ui.inputs.revMap.checked = !!a.revMap;
    const lab = function (key, v) { const l = ui.labels[key]; if (!l) return; const t = l.fmt(v); if (l.el.textContent !== t) l.el.textContent = t; };
    lab('range', +inst.range || 100); lab('delay', +inst.delay || 0); lab('gain', +inst.gain || 0);
    lab('level', g.level || 0); lab('width', g.width || 0); lab('start', g.start || 0);
    ui.radios.forEach(function (r, i) { if (r) r.checked = i === gi; });
    const sm = stripMode();
    ui.stripRadios.forEach(function (r) { r.checked = r.value === sm; });
    if (ui.runBtn) {
      const running = isScanning() || !!a.running;
      ui.runBtn.textContent = running ? 'Stop Scan' : 'Run Scan';
      ui.runBtn.classList.toggle('running', running);
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawScope(frame, state) {
    const cv = ui.ascan;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, ASCAN.w, ASCAN.h);
    const a = autOf(state);
    const stateLike = Object.assign({}, state, { instrument: Object.assign({}, state.instrument, { gates: a.gates, activeGate: activeGate(), dac: Object.assign({}, state.instrument.dac, { on: false }) }) });
    if (UT.instruments && typeof UT.instruments.drawAscan === 'function') {
      UT.instruments.drawAscan(ctx, frame, stateLike, { base: 'aut', axes: false, margin: { l: 14, r: 4, t: 4, b: 4 } });
      return;
    }
    // fallback: simple trace + gates
    const W = ASCAN.w, H = ASCAN.h;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1f5f1f'; ctx.setLineDash([1, 3]); ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = Math.round(W * i / 10) + 0.5, y = Math.round(H * i / 10) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke(); ctx.setLineDash([]);
    const asc = frame && frame.ascan;
    const range = (asc && asc.range) || state.instrument.range || 100, delay = asc ? asc.delay : (state.instrument.delay || 0);
    if (asc && asc.samples) {
      ctx.strokeStyle = '#22e022'; ctx.beginPath();
      const n = asc.samples.length;
      for (let i = 0; i < n; i++) { const x = W * i / (n - 1), y = H * (1 - M.clamp(asc.samples[i], 0, 100) / 100); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    const cols = ['#ff2020', '#ffe000', '#20e020'];
    (a.gates || []).forEach(function (g, i) {
      if (!g || !g.on) return;
      const x0 = (g.start - delay) / range * W, x1 = (g.start + g.width - delay) / range * W, y = Math.round(H * (1 - g.level / 100)) + 0.5;
      ctx.strokeStyle = cols[i] || cols[2]; ctx.lineWidth = i === activeGate() ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    });
    ctx.restore();
  }

  function drawLegend(state) {
    const cv = ui.legend;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, LEGEND.w, LEGEND.h);
    const rev = !!autOf(state).revMap;
    const bh = LEGEND.h / BANDS.length;
    ctx.save();
    for (let i = 0; i < BANDS.length; i++) {
      ctx.fillStyle = BANDS[rev ? BANDS.length - 1 - i : i].colour;
      ctx.fillRect(0, i * bh, LEGEND.w, Math.ceil(bh));
    }
    ctx.restore();
  }

  function drawStrip(frame, state) {
    const cv = ui.strip;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, STRIP.w, STRIP.h);
    const W = STRIP.w, H = STRIP.h;
    const a = autOf(state);
    const sc = a.scan;
    const zr = stripZRange();
    const yOf = function (z) { return (z - zr.z0) / (zr.z1 - zr.z0) * (H - 1); };
    const mode = stripMode();
    const gap = 4;
    const ampW = mode === 'rdt' ? W : mode === 'rtd' ? 0 : Math.floor((W - gap) / 2);
    const tofX = mode === 'rdt' ? W : mode === 'rtd' ? 0 : ampW + gap;
    const tofW = W - tofX;
    const gi = activeGate();
    const gates = (sc && sc.gates) || a.gates || [];
    const rev = !!a.revMap;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // amplitude strip
    if (ampW > 0) {
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ampW, H);
      // faint z labels every 50 mm
      ctx.fillStyle = '#b0b0b0'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top';
      for (let z = Math.ceil(zr.z0 / 50) * 50; z <= zr.z1; z += 50) { const y = yOf(z); ctx.fillRect(0, Math.round(y) + 0.5, 4, 1); ctx.fillText(String(z), 5, Math.min(H - 10, y + 1)); }
      // thresholds
      gates.forEach(function (g, i) {
        if (!g || !g.on) return;
        const x = Math.round(M.clamp(g.level, 0, 100) / 100 * (ampW - 1)) + 0.5;
        ctx.strokeStyle = i === gi ? '#202020' : '#9a9a9a'; ctx.lineWidth = 1; ctx.setLineDash(i === gi ? [4, 3] : [2, 3]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      });
      ctx.setLineDash([]);
      // traces (other gates grey, active black)
      if (sc && sc.amp) {
        const order = [];
        for (let i = 0; i < sc.amp.length; i++) if (i !== gi) order.push(i);
        order.push(gi);
        order.forEach(function (i) {
          const arr = sc.amp[i];
          if (!arr || !gates[i] || !gates[i].on) return;
          ctx.strokeStyle = i === gi ? '#000000' : '#a0a0a0'; ctx.lineWidth = i === gi ? 1.5 : 1;
          ctx.beginPath();
          let pen = false;
          for (let k = 0; k < sc.n; k++) {
            const v = arr[k];
            if (!Number.isFinite(v)) { pen = false; continue; }
            const x = M.clamp(v, 0, 100) / 100 * (ampW - 1), y = yOf(sc.z0 + k * sc.step);
            if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        });
      }
    }
    // TOF strip
    if (tofW > 0) {
      ctx.fillStyle = '#0018e0'; ctx.fillRect(tofX, 0, tofW, H);
      const g = gates[gi];
      if (sc && sc.tof && sc.tof[gi] && g && g.on && g.width > 0) {
        const tof = sc.tof[gi], amp = sc.amp[gi];
        for (let k = 0; k < sc.n; k++) {
          const t = tof[k];
          if (!Number.isFinite(t)) continue;
          const u = M.clamp((t - g.start) / g.width, 0, 1);
          const x = tofX + 4 + u * (tofW - 12), y = yOf(sc.z0 + k * sc.step);
          ctx.fillStyle = colourFor(amp[k], rev); ctx.fillRect(x - 4, y - 0.5, 3, 1.5);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y - 0.5, 6, 1.5);
        }
      }
    }
    // scan head / probe z
    const headZ = (anim && sc) ? sc.z0 + Math.min(anim.i, sc.n - 1) * sc.step : state.probe.z;
    if (Number.isFinite(headZ)) {
      const y = Math.round(yOf(M.clamp(headZ, zr.z0, zr.z1))) + 0.5;
      ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();
  }

  const panel = {
    /** The 'aut' window api (null until first open()). */
    window: null,
    isOpen() { return !!(ui.win && ui.win.isOpen()); },
    /** Create (lazily) and show the AUT window. */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('aut', css);
      if (!ui.win) buildWindow();
      panel.window = ui.win;
      if (!ui.subscribed) {
        ui.subscribed = true;
        UT.bus.on('render', function (frame) { panel.draw(frame); });
      }
      ui.win.show();
      syncInputs();
      UT.requestRender();
      return ui.win;
    },
    /** Hide the window (stops a running scan; keeps the strips). */
    close() {
      stopScan();
      if (ui.win && ui.win.isOpen()) ui.win.hide();
      return ui.win;
    },
    toggle() { return panel.isOpen() ? panel.close() : panel.open(); },
    /** Draw the A-scan, legend and strip charts from the frame (no-op while hidden). */
    draw(frame) {
      if (!panel.isOpen()) return;
      const state = UT.state;
      try {
        syncInputs();
        drawScope(frame, state);
        drawLegend(state);
        drawStrip(frame, state);
      } catch (e) { console.error('[UT.aut.panel]', e); }
    },
  };

  // ================================================================== test API
  function testRunAutScan() {
    stopScan(true);
    const sc = runScan(UT.state, { sync: true });
    if (!sc) return null;
    UT.setIn('aut', { scan: sc, running: false, x: UT.state.probe.x });
    return { z0: sc.z0, z1: sc.z1, step: sc.step, n: sc.n, aboveLevel: sc.amp.map(function (_, i) { return aboveLevel(sc, i); }) };
  }

  // ================================================================== self test
  function selftest() {
    const f = [];
    try {
      if (colourFor(100) !== '#ffffff' || colourFor(99.9) !== '#ff0000' || colourFor(60) !== '#ff00ff' || colourFor(45) !== '#ffff00' || colourFor(30) !== '#00c000' || colourFor(15) !== '#00ffff' || colourFor(5) !== '#0000ff') f.push('colourFor bands');
      if (colourFor(100, true) !== '#0000ff' || colourFor(5, true) !== '#ffffff') f.push('colourFor rev');
      const fake = { z0: 0, z1: 5, step: 1, n: 6, gates: [{ on: true, level: 20 }], amp: [[0, 30, 40, 10, 50, 60]] };
      const iv = aboveLevel(fake, 0);
      if (JSON.stringify(iv) !== '[[1,2],[4,5]]') f.push('aboveLevel ' + JSON.stringify(iv));
      if (!(UT.rays && UT.ascan && UT.specimens)) return f;   // physics modules absent: helpers only
      const st = UT.defaultState();
      st.mode = 'aut';
      st.specimen = UT.specimens.plateWeld({ T: 20, L: 60 });
      st.defects = [UT.specimens.defectPresets.lof(st.specimen, { zFrom: 20, zTo: 40 })];
      st.probe.z = 30;
      st.instrument.gain = 40;
      st.aut.gates = [{ on: true, start: 10, width: 80, level: 20 }, { on: true, start: 30, width: 30, level: 20 }, { on: false, start: 40, width: 20, level: 20 }];
      // put the probe at the LOF maximum (second-leg normal incidence, x ≈ 50…60 for T 20 / 60°)
      let bestX = 54, bestAmp = -1;
      for (let x = 46; x <= 64; x += 2) {
        st.probe.x = x;
        const pc = prepare(st);
        const e = pc ? pc.echoes.filter(function (q) { return q.defectId !== undefined; }).sort(function (p, q) { return q.ampNoZ - p.ampNoZ; })[0] : null;
        if (e && e.ampNoZ > bestAmp) { bestAmp = e.ampNoZ; bestX = x; }
      }
      st.probe.x = bestX;
      const sc = runScan(st, { sync: true });
      if (!sc || sc.n !== 61 || sc.z1 !== 60 || sc.step !== 1 || sc.amp.length !== 3 || sc.tof.length !== 3) { f.push('runScan shape'); return f; }
      if (sc.amp[0].length !== 61 || !(sc.amp[0] instanceof Float32Array)) f.push('runScan arrays');
      if (sc.filled !== 61 || !sc.done) f.push('runScan filled');
      if (!sc.amp[2].every(function (v) { return v === 0; }) || !sc.tof[2].every(function (v) { return Number.isNaN(v); })) f.push('gate off column');
      const c = prepare(st);
      const col = scanColumn(st, 30, c);
      if (col.amp.length !== 3 || Math.abs(col.amp[0] - sc.amp[0][30]) > 1e-3) f.push('scanColumn consistency');
      // amplitude must fall off away from the defect (z 20..40) and be symmetric-ish about its centre
      const centre = sc.amp[0][30], far = sc.amp[0][2];
      if (!(centre > far)) f.push('no z fall-off ' + centre + ' vs ' + far);
      if (Number.isFinite(sc.tof[0][30]) && !(sc.tof[0][30] >= 20 && sc.tof[0][30] <= 60)) f.push('tof outside gate ' + sc.tof[0][30]);
    } catch (e) { f.push('exception: ' + (e && e.message)); }
    return f;
  }

  UT.aut = {
    BANDS, COLS_PER_FRAME, STRIP, ASCAN,
    colourFor, prepare, scanColumn, runScan, aboveLevel, startScan, stopScan, isScanning,
    panel, css,
    open() { return panel.open(); },
    close() { return panel.close(); },
    toggle() { return panel.toggle(); },
    /** The 'aut' window api (null until first open()). */
    get window() { return panel.window; },
    __selftest: selftest,
  };

  Object.assign(UT.test, { runAutScan: testRunAutScan });
})(window.UT = window.UT || {});
