/* 55-aut.js — AUT (automated ultrasonic testing): fixed-x scan along the weld, up to six transit/TOF
 * gates ("channels"), strip charts (amplitude + TOF), per-channel strips, C-scan map and the AUT panel
 * window ('aut'). Physics functions are pure functions of their arguments; only startScan()/stopScan(),
 * the panel and the test API read/write UT.state. SPEC §6.8 as amended by §14.6, §15.10, §15.11 and
 * SPEC-v2 §3.11 (P11), §6.4, §9.1 V2-12.
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// v1 (unchanged behaviour)
// - The scan runs at the CURRENT probe x (state.probe.x, "user chosen" by dragging the probe) and at
//   the probe's skew; state.aut.x is refreshed to that x whenever a scan is started so the value in the
//   state mirrors the last scan. z steps 0 … L inclusive (n = floor(L/step) + 1; step 1 for L ≤ 600, see v2).
// - One trace at the fixed x (UT.rays.trace with the options 40-ascan uses — UT.ascan.traceOpts(state,
//   spec, probe): maxPath = delay + range, fanRays from state.physics, maxLegs from display.skips,
//   material / damping / transfer-loss options; a private v1 copy is the fallback when 40 is absent) and
//   per z: amp = ampNoZ · UT.rays.zFactor(...) for echoes that belong to a defect (echoes without
//   defectId are z-independent), then UT.ascan.synth at nSamples = UT.ascan.N_SAMPLES and
//   UT.ascan.evalGates with {...instrument, gates: aut.gates, activeGate: aut.activeGate}; so the
//   column at z = probe.z equals frame.aut.readouts exactly.
// - scan.amp[i][k] = the gate's peak % FSH (unclipped, as evalGates reports); when nothing in the gate
//   reaches the level the value is the gate's maximum sample (< level) so the amplitude trace stays
//   continuous, and scan.tof[i][k] = NaN. scan.tof is the TRUE sound path (mm) of the gated peak.
//   Unscanned columns (animated scan in progress) hold NaN in both arrays; scan.filled counts columns.
// - Gates that are off produce amp = 0 / tof = NaN and are skipped by aboveLevel(). scan.amp/tof have
//   one entry per entry of aut.gates (6 in the v2 default state; a 3-gate v1 record gives 3).
// - Colour map = §14.6 seven bands (white ≥ 100, red 80–100, magenta 60–80, yellow 40–60, green 25–40,
//   cyan 10–25, blue < 10); "Rev Map" reverses the colour order (blue for the strongest, white for the
//   weakest) in the legend, the TOF strip, the per-channel strips and the C-scan map.
// - RDT / RTD radios: state.aut.strip ∈ 'rdt' (amplitude strip only) | 'rtd' (TOF strip only) | 'both'
//   (default; both strips side by side). aut.rectified mirrors strip !== 'rtd' for other modules.
// - A "Gate on" checkbox is added to the gate group; "Gates Same" copies gate 1 (start/width/level/on)
//   into gates 2 … channels (v1: 2 and 3 — identical with the default 3 channels).
// - Level spinner 1 % steps (1 … 100), Width slider 1 mm steps (1 … 200), Start slider 1 mm steps
//   (0 … 400); Range ◀▶ ±2 % (10 … 1000 mm), X-Shift ◀▶ ±1 mm, AMP slider 0 … 110 dB — all written
//   through UT.setIn('instrument' | 'aut', …).
// - Animated scan: aut.speed columns per frame (v1: 6); the probe is moved along with the scan head
//   (UT.setIn('probe', {z})) so the live A-scan / cross-section follow it, and its original z is restored
//   when the scan finishes or is stopped. Partial scans are stored via UT.setIn('aut', {scan, map,
//   running}) and 'scan:progress' {kind: 'aut', i, n} is emitted every frame. runScan() is pure and
//   synchronous (opts.sync accepted and ignored).
// - Chart canvas cv-aut-strip (186 × 430 CSS px, the v1 strip chart): z runs top (0) → bottom (L);
//   amplitude strip white with dashed vertical threshold lines at every ON channel's level (the active
//   one darker), the active channel's trace black (others grey); TOF strip blue with a white bar at
//   (tof − start)/width and a 3 px amplitude-colour tick beside it; red horizontal line at the scan head
//   (probe.z when idle). Pointer down / drag on the strip or the map sets probe.z. Faint z labels.
// - OFF / ✕ leave the mode through UT.modes.exit() when available (re-entrancy guarded); without
//   80-modes they simply hide the panel. The window is positioned over the instrument column and is
//   laid out in two columns (charts | A-scan + Range/X-Shift/AMP + Transit/TOF Gate group) so that its
//   width (462 px body → 464 px window) stays inside the 470 px instrument column.
// v2 (SPEC-v2 §3.11)
// - Channels: aut.channels (1 … 6, clamped; missing → 3) = the number of gates that are scanned and
//   shown. Gates with index ≥ channels are treated as OFF by the scan (amp 0 / tof NaN) even when their
//   `on` flag is set, and their radio buttons are hidden. Choosing a larger channel count in the panel
//   switches the newly exposed gates ON (a channel that is off is useless); reducing it clamps
//   activeGate. scan.channels records the count used.
// - Adaptive step: step = max(1, round(L/400)) mm, n = floor(L/step) + 1, z1 = (n − 1)·step (plate 300
//   → 1 mm / 301 columns exactly as v1; 24-inch pipe C = 1916 → 5 mm / 384 columns).
// - C-scan map: state.aut.map = {z0, z1, step, n, k, map: Float32Array(n·k) row-major (i·k + j = column i,
//   channel j; NaN = unscanned), gates: [k gate copies], x, skew, filled, done} — the shape 62-view-plan
//   reads for its hint band. Written together with the scan (each animated frame, at the end of
//   runAutScan) and cleared by Clear / tb-clear. UT.aut.mapOf(scan) builds it from a scan.
// - Panel tabs (module-local `ui.tab`, not in state): Chart (v1 strip chart), Strips (one amplitude + TOF
//   strip PAIR per channel side by side — "6 strips" for 6 channels; UT.aut.stripLayout(k, W, mode) gives the
//   geometry), Map (canvas cv-aut-map: z vertical × channel bands horizontal, cells in the 7-band colour
//   map, header with channel numbers in the channel colours, z ticks, red scan-head line). Hovering the
//   strips / map shows "z · channel · amp % · path" in a small readout line; pointer down sets probe.z.
// - aut.speed (1 … 60 columns per frame, default 6) is the "Speed" slider in the chart column.
// - UT.aut.snapshot({strips, map}) → 'data:image/png;base64,…' of the strip chart for the trade report
//   (84): a header line (probe, gain, channels, step) + Chart | Strips (when channels > 1) | Map side by
//   side, rendered on an offscreen canvas (no window needed); null without a DOM or without a scan.
// - Channel colours (A-scan gate bars, strip headers): 1 red, 2 yellow, 3 green (v1), 4 cyan, 5 magenta,
//   6 orange. 70-instruments' drawAscan draws gates ≥ 4 in its gate3 colour, so the panel overlays the
//   channel-4…6 bars in their own colours.
// - Planar z-overlap exponent (SPEC-v2 §4.4 / §11 point 6, implemented in 30-raytrace): the V1 #12 window
//   is verified by the selftest to stay inside z 110 … 160 for the 120 … 150 LOF (measured 112 … 158).
// - UT.test.runAutScan() (owned here) additionally returns {channels, strips, mapN} — strips = the number
//   of per-channel strips (= channels) for V2-12.
// - Every user-visible string goes through UT.i18n.t (plain English keys); the panel content is rebuilt
//   on the 'lang' event so tooltips follow the live language switch.
(function (UT) {
  'use strict';
  const M = UT.math;
  const t = function (key, params) { return UT.i18n && typeof UT.i18n.t === 'function' ? UT.i18n.t(key, params) : key; };

  const COLS_PER_FRAME = 6;
  const MAX_CHANNELS = 6;
  const TARGET_COLUMNS = 400;
  const STRIP = { w: 186, h: 430 };
  const MAP = { w: 186, h: 430, head: 14 };
  const ASCAN = { w: 232, h: 122 };
  const LEGEND = { w: 16, h: 122 };
  const LIMITS = { level: [1, 100], width: [1, 200], start: [0, 400], range: [10, 1000], delay: [-50, 1000], gain: [0, 110], speed: [1, 60], channels: [1, MAX_CHANNELS] };
  /** Channel colours 1 … 6 (A-scan gate bars, strip headers, map header). */
  const CHANNEL_COLOURS = ['#ff2020', '#ffe000', '#20e020', '#20d0ff', '#ff40ff', '#ff9020'];

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

  /**
   * Number of AUT channels of a state (aut.channels clamped 1 … 6; missing → 3).
   * @param {object} state  UT.state-like
   * @returns {number}
   */
  function channelsOf(state) {
    const k = Math.round(+autOf(state).channels);
    return Number.isFinite(k) ? M.clamp(k, LIMITS.channels[0], LIMITS.channels[1]) : 3;
  }

  /**
   * Columns per animation frame (aut.speed clamped 1 … 60; missing → 6).
   * @param {object} state  UT.state-like
   * @returns {number}
   */
  function speedOf(state) {
    const s = Math.round(+autOf(state).speed);
    return Number.isFinite(s) ? M.clamp(s, LIMITS.speed[0], LIMITS.speed[1]) : COLS_PER_FRAME;
  }

  /**
   * Adaptive scan step (mm): max(1, round(L/400)).
   * @param {number} L  scan length (mm)
   * @returns {number}
   */
  function stepFor(L) { return Math.max(1, Math.round((Number.isFinite(L) ? L : 0) / TARGET_COLUMNS)); }

  /** Tracer options: UT.ascan.traceOpts (40) when present, else the v1 private copy. */
  function traceOptsOf(state, spec, probe) {
    if (UT.ascan && typeof UT.ascan.traceOpts === 'function') {
      try { return UT.ascan.traceOpts(state, spec, probe); } catch (e) { /* fall through */ }
    }
    const inst = (state && state.instrument) || {};
    return {
      maxPath: (inst.delay || 0) + (inst.range || 100),
      fanCount: 21,
      maxLegs: ((probe.angle || 0) === 0 || (spec && spec.kind === 'block')) ? 12 : ((state.display && state.display.skips) || 3),
    };
  }

  function visibleDefects(state) { return UT.ascan.visibleDefects(state); }

  /** Gate copies for a scan: gates with index ≥ channels are forced off. */
  function scanGates(state) {
    const k = channelsOf(state);
    return gatesOf(state).map(function (g, i) { return Object.assign({}, g, i >= k ? { on: false } : {}); });
  }

  /**
   * Trace ONCE at the fixed probe x and build the per-z cache used by scanColumn().
   * @param {object} state  UT.state-like ({specimen, probe, instrument, display, defects, aut, physics…})
   * @returns {object|null} cache {spec, probe, derived, inst, instLike, defects, echoes, zDep, nSamples, gates, channels}
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
    try { rays = UT.rays.trace({ specimen: spec, probe, derived, display: state.display || {}, defects, opts: traceOptsOf(state, spec, probe) }); }
    catch (e) { console.error('[UT.aut] trace failed', e); rays = null; }
    const echoes = ((rays && rays.echoes) || []).map(function (e) { return Object.assign({}, e, { ampNoZ: Number.isFinite(e.ampNoZ) ? e.ampNoZ : e.amp }); });
    const a = autOf(state);
    const gates = scanGates(state);
    const instLike = Object.assign({}, inst, { gates, activeGate: a.activeGate || 0, peakMem: false, freeze: false });
    return {
      spec, probe, derived, inst, instLike, defects, echoes, rays, gates, channels: channelsOf(state),
      // z-dependent: defect echoes AND echoes shadowed by a defect (echo.zs = [{defectId, hz, trans}], e.g. the backwall behind a lamination)
      zDep: echoes.map(function (e) { return e.defectId !== undefined || (Array.isArray(e.zs) && e.zs.length > 0); }),
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
   * @returns {{amp:number[], tof:number[]}} arrays of length gates.length
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

  /**
   * Empty scan object for a state (adaptive step, NaN columns). PURE.
   * @param {object} state  UT.state-like
   * @returns {object} scan {z0, z1, step, n, amp[], tof[], filled, done, x, skew, activeGate, gates, channels, range, delay, gain}
   */
  function scanShell(state) {
    const spec = state.specimen;
    const L = Math.max(1, Math.round(spec.L || 300));
    const step = stepFor(L);
    const n = Math.floor(L / step) + 1;
    const nG = gatesOf(state).length || 3;
    const amp = [], tof = [];
    for (let i = 0; i < nG; i++) { amp.push(new Float32Array(n).fill(NaN)); tof.push(new Float32Array(n).fill(NaN)); }
    return {
      z0: 0, z1: (n - 1) * step, step, n, amp, tof, filled: 0, done: false,
      x: state.probe.x, skew: state.probe.skew || 0, activeGate: autOf(state).activeGate || 0,
      gates: scanGates(state), channels: Math.min(channelsOf(state), nG),
      range: state.instrument.range, delay: state.instrument.delay || 0, gain: state.instrument.gain,
    };
  }

  function fillColumn(sc, k, col) {
    for (let i = 0; i < sc.amp.length; i++) { sc.amp[i][k] = col.amp[i]; sc.tof[i][k] = col.tof[i]; }
    if (k + 1 > sc.filled) sc.filled = k + 1;
  }

  /**
   * Synchronous full scan z = 0 … L (adaptive step). PURE — the caller stores the result (UT.setIn('aut', {scan})).
   * @param {object} state  UT.state-like
   * @param {{sync?:boolean}} [opts]
   * @returns {{z0:number, z1:number, step:number, n:number, channels:number, amp:Float32Array[], tof:Float32Array[]}|null}
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
   * C-scan map (z × channel) of a scan: {z0, z1, step, n, k, map: Float32Array(n·k) row-major, gates, x, skew, filled, done}.
   * @param {object} sc  scan object (runScan / state.aut.scan)
   * @returns {object|null}
   */
  function mapOf(sc) {
    if (!sc || !Array.isArray(sc.amp) || !(sc.n > 0)) return null;
    const k = M.clamp(Math.round(Number.isFinite(sc.channels) ? sc.channels : sc.amp.length), 1, Math.max(1, sc.amp.length));
    const n = sc.n;
    const map = new Float32Array(n * k);
    for (let i = 0; i < n; i++) for (let j = 0; j < k; j++) { const a = sc.amp[j]; map[i * k + j] = a ? a[i] : NaN; }
    return { z0: sc.z0, z1: sc.z1, step: sc.step, n, k, map, gates: (sc.gates || []).slice(0, k).map(function (g) { return Object.assign({}, g); }), x: sc.x, skew: sc.skew, filled: sc.filled, done: sc.done };
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
  /** prefers-reduced-motion (SPEC-v2 §5.7): UT.app.reducedMotion() when 90 is loaded, else the media query. */
  function reducedMotion() {
    try {
      if (UT.app && typeof UT.app.reducedMotion === 'function') return !!UT.app.reducedMotion();
      return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) { return false; }
  }

  /**
   * Animated scan (aut.speed columns per frame): stores partial scans via UT.setIn('aut', {scan, map, running}),
   * moves the probe with the scan head and emits 'scan:progress' {kind:'aut', i, n}.
   * @returns {boolean} true when a scan was started
   */
  function startScan() {
    const state = UT.state;
    if (!state.specimen) return false;
    stopScan(true);
    if (reducedMotion()) {
      // §5.7: no animation — every column in one synchronous loop, a single store/render, isScanning() stays false
      const full = runScan(state);
      if (!full) return false;
      UT.setIn('aut', { scan: full, map: mapOf(full), running: false, x: state.probe.x });
      UT.bus.emit('scan:progress', { kind: 'aut', i: full.n, n: full.n });
      return true;
    }
    const cache = prepare(state);
    if (!cache) return false;
    const sc = scanShell(state);
    anim = { sc, cache, i: 0, handle: null, z0Probe: state.probe.z };
    UT.setIn('aut', { scan: sc, map: mapOf(sc), running: true, x: state.probe.x }, { noRender: true });
    const stepFrame = function () {
      if (!anim || anim.sc !== sc) return;
      const perFrame = speedOf(UT.state);
      for (let k = 0; k < perFrame && anim.i < sc.n; k++, anim.i++) fillColumn(sc, anim.i, scanColumn(state, sc.z0 + anim.i * sc.step, cache));
      const finished = anim.i >= sc.n;
      sc.done = finished;
      const headZ = sc.z0 + Math.min(anim.i, sc.n - 1) * sc.step;
      UT.setIn('probe', { z: finished ? anim.z0Probe : headZ }, { noRender: true });
      UT.setIn('aut', { scan: sc, map: mapOf(sc), running: !finished });
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

  // ================================================================== layout helpers (pure)
  /**
   * Geometry of the per-channel strips (Strips tab): one amplitude + TOF pair per channel.
   * @param {number} k  channels (1 … 6)
   * @param {number} [W]  canvas width (CSS px, default STRIP.w)
   * @param {string} [mode]  'both' | 'rdt' | 'rtd'
   * @returns {{ch:number, x:number, w:number, ampX:number, ampW:number, tofX:number, tofW:number}[]}
   */
  function stripLayout(k, W, mode) {
    const n = M.clamp(Math.round(k) || 1, 1, MAX_CHANNELS);
    const width = W || STRIP.w;
    const gap = n > 1 ? 3 : 0;
    const cw = Math.floor((width - gap * (n - 1)) / n);
    const out = [];
    for (let j = 0; j < n; j++) {
      const x = j * (cw + gap);
      let ampW, tofW, tofX;
      if (mode === 'rdt') { ampW = cw; tofW = 0; tofX = x + cw; }
      else if (mode === 'rtd') { ampW = 0; tofW = cw; tofX = x; }
      else { ampW = Math.max(6, Math.round(cw * 0.6)); tofW = Math.max(0, cw - ampW - 1); tofX = x + ampW + 1; }
      out.push({ ch: j, x, w: cw, ampX: x, ampW, tofX, tofW });
    }
    return out;
  }

  /** z tick spacing (mm) giving ≥ minPx between labels. */
  function tickStep(zSpan, px, minPx) {
    const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
    for (let i = 0; i < steps.length; i++) if (steps[i] / zSpan * px >= (minPx || 24)) return steps[i];
    return steps[steps.length - 1];
  }

  // ================================================================== panel (DOM)
  const css = [
    '.win[data-win=aut] .win-body{padding:0;background:#000;color:#fff;overflow:hidden auto;font:12px "Segoe UI",Arial,sans-serif}',
    '.win[data-win=aut] .aut-panel{display:flex;align-items:flex-start;gap:4px;padding:3px;width:462px;box-sizing:border-box}',
    '.win[data-win=aut] .aut-strip-col{display:flex;flex-direction:column;gap:3px;width:186px}',
    '.win[data-win=aut] .aut-top{display:flex;align-items:stretch;height:34px}',
    '.win[data-win=aut] .aut-run{flex:1;margin:0;padding:0;font:bold 16px "Segoe UI",Arial,sans-serif;color:#000;background:#ececec;border:2px outset #fff;cursor:pointer}',
    '.win[data-win=aut] .aut-run.running{background:#ffe08a}',
    '.win[data-win=aut] .aut-clear{width:50px;margin:0 0 0 3px;padding:0;font:12px "Segoe UI",Arial,sans-serif;color:#000;background:#d8d8d8;border:2px outset #eee;cursor:pointer}',
    '.win[data-win=aut] .aut-tabs{display:flex;gap:2px;height:18px}',
    '.win[data-win=aut] .aut-tab{flex:1;margin:0;padding:0;font:11px "Segoe UI",Arial,sans-serif;color:#ccc;background:#222;border:1px solid #555;border-bottom:none;cursor:pointer}',
    '.win[data-win=aut] .aut-tab.active{color:#000;background:#e8e8e8;font-weight:bold}',
    '.win[data-win=aut] #cv-aut-strip,.win[data-win=aut] #cv-aut-map{display:block;width:186px;height:430px;cursor:crosshair;background:#000;border:1px solid #333;touch-action:none}',
    '.win[data-win=aut] #cv-aut-strip[hidden],.win[data-win=aut] #cv-aut-map[hidden]{display:none}',
    '.win[data-win=aut] .aut-info{height:13px;font:10px "Segoe UI",Arial,sans-serif;color:#9fe;white-space:nowrap;overflow:hidden}',
    '.win[data-win=aut] .aut-speed{display:flex;align-items:center;gap:2px;font:10px "Segoe UI",Arial,sans-serif;color:#ddd}',
    '.win[data-win=aut] .aut-speed input[type=range]{flex:1;min-width:0;height:12px;margin:0}',
    '.win[data-win=aut] .aut-speed span{white-space:nowrap}',
    '.win[data-win=aut] .aut-mid{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:254px}',
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
    '.win[data-win=aut] .aut-gates{width:100%;box-sizing:border-box;border:1px groove #7fb;padding:4px 5px 5px;margin:2px 0 0;position:relative}',
    '.win[data-win=aut] .aut-gates legend{color:#7fe7ff;font:12px "Segoe UI",Arial,sans-serif;padding:0 2px}',
    '.win[data-win=aut] .aut-radios{display:flex;justify-content:space-around;align-items:center;margin:0 0 4px}',
    '.win[data-win=aut] .aut-radios label{display:flex;align-items:center;gap:2px;cursor:pointer}',
    '.win[data-win=aut] .aut-radios label[hidden]{display:none}',
    '.win[data-win=aut] .aut-gates input{margin:0 2px 0 0}',
    '.win[data-win=aut] .aut-gate-row{display:flex;align-items:center;justify-content:space-between;gap:3px;margin:4px 0}',
    '.win[data-win=aut] .aut-gate-row .aut-lbl{white-space:nowrap;min-width:78px}',
    '.win[data-win=aut] .aut-gate-row select{font:11px "Segoe UI",Arial,sans-serif;height:18px;color:#000;background:#fff}',
    '.win[data-win=aut] .aut-spin{display:flex;flex-direction:column;gap:1px}',
    '.win[data-win=aut] .aut-spin button{height:10px;line-height:8px;font-size:7px}',
    '.win[data-win=aut] .aut-hslider{display:flex;align-items:center;gap:1px}',
    '.win[data-win=aut] .aut-hslider input[type=range]{width:110px;height:12px;margin:0}',
    '.win[data-win=aut] .aut-same{display:block;width:100%;margin:6px 0 4px;padding:2px 0;font:13px "Segoe UI",Arial,sans-serif;color:#000;background:#7fdf7f;border:2px outset #bfffbf;cursor:pointer}',
    '.win[data-win=aut] .aut-rdt{margin-top:2px}',
    '.win[data-win=aut] .aut-rdt .aut-rdt-cap{display:flex;gap:14px;text-decoration:underline;margin-bottom:2px}',
    '.win[data-win=aut] .aut-rdt .aut-radios{margin:0 0 4px}',
    '.win[data-win=aut] .aut-rev,.win[data-win=aut] .aut-on{display:flex;align-items:center;gap:3px;cursor:pointer}',
    '.win[data-win=aut] .aut-ch-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:1px}',
  ].join('\n');

  const TABS = ['chart', 'strips', 'map'];
  const ui = { win: null, strip: null, map: null, ascan: null, legend: null, runBtn: null, info: null, inputs: {}, labels: {}, radios: [], radioLabels: [], stripRadios: [], tabBtns: {}, subscribed: false, leaving: false, tab: 'chart' };

  function autState() { return UT.state.aut || UT.defaultState().aut; }
  function setAut(patch) { UT.setIn('aut', patch); }
  function setInst(patch) { UT.setIn('instrument', patch); }
  /** Gates as the panel sees them: aut.gates when it is a non-empty array, else a clone of the default gates. */
  function panelGates() {
    const g = autState().gates;
    if (Array.isArray(g) && g.length) return g;
    return UT.defaultState().aut.gates.map(function (d) { return Object.assign({}, d); });
  }
  function panelChannels() { return Math.min(channelsOf(UT.state), Math.max(1, panelGates().length)); }
  function activeGate() { const a = autState(); return M.clamp(a.activeGate || 0, 0, Math.max(0, panelChannels() - 1)); }
  function stripMode() { const a = autState(); return a.strip === 'rdt' || a.strip === 'rtd' ? a.strip : 'both'; }

  /** Patch one gate (clones the gates array). */
  function patchGate(gi, patch) {
    const gates = panelGates().map(function (g, i) { return i === gi ? Object.assign({}, g, patch) : Object.assign({}, g); });
    setAut({ gates });
  }
  function gateValue(key, v) { const l = LIMITS[key]; return Math.round(l ? M.clamp(v, l[0], l[1]) : v); }

  /** Set the channel count: newly exposed gates are switched on, activeGate is clamped. */
  function setChannels(k) {
    const n = M.clamp(Math.round(k) || 1, LIMITS.channels[0], LIMITS.channels[1]);
    const cur = panelChannels();
    const gates = panelGates().map(function (g, i) { return (i >= cur && i < n && !g.on) ? Object.assign({}, g, { on: true }) : Object.assign({}, g); });
    setAut({ channels: n, gates, activeGate: Math.min(activeGate(), n - 1) });
  }

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

  function stripZRange(state) {
    const s = state || UT.state;
    const sc = autOf(s).scan;
    const spec = s.specimen;
    if (sc && Number.isFinite(sc.z0) && Number.isFinite(sc.z1) && sc.z1 > sc.z0) return { z0: sc.z0, z1: sc.z1 };
    return { z0: 0, z1: (spec && spec.L) || 300 };
  }

  /** z (mm) of a canvas y (CSS px) inside a strip body of height h starting at y0. */
  function zAtY(y, y0, h) {
    const zr = stripZRange();
    return zr.z0 + (zr.z1 - zr.z0) * M.clamp((y - y0) / Math.max(1, h - 1), 0, 1);
  }

  function setProbeZ(z) {
    const spec = UT.state.specimen;
    UT.setIn('probe', { z: M.clamp(Math.round(z), 0, (spec && spec.L) || z) });
  }

  /** Column index of a scan for z (nearest), or −1. */
  function columnAt(sc, z) {
    if (!sc || !(sc.n > 0)) return -1;
    const i = Math.round((z - sc.z0) / (sc.step || 1));
    return i >= 0 && i < sc.n ? i : -1;
  }

  /** Readout line for a hovered (z, channel). */
  function infoText(z, ch) {
    const sc = autState().scan;
    const i = columnAt(sc, z);
    let s = t('z {z} mm', { z: Math.round(z) });
    if (ch !== null && ch !== undefined) s += ' · ' + t('Ch {n}', { n: ch + 1 });
    if (i >= 0 && ch !== null && ch !== undefined && sc.amp[ch]) {
      const a = sc.amp[ch][i], p = sc.tof[ch][i];
      if (Number.isFinite(a)) s += ' · ' + Math.round(a) + ' %';
      if (Number.isFinite(p)) s += ' · ' + M.fmt(p, 1) + ' mm';
    }
    return s;
  }
  function showInfo(text) { if (ui.info && ui.info.textContent !== text) ui.info.textContent = text; }

  /**
   * Pointer Events binding (pointerdown/move/up + capture, touch-action none via CSS).
   * @param {HTMLCanvasElement} cv
   * @param {function(object, boolean):void} handler  (localPos, pressed)
   */
  function bindPointer(cv, handler) {
    let active = null;
    const pos = function (e) { return UT.dom.localPos(e, cv); };
    if (typeof PointerEvent === 'undefined') {
      cv.addEventListener('mousedown', function (e) { if (e.button === 0) { handler(pos(e), true); e.preventDefault(); } });
      cv.addEventListener('mousemove', function (e) { handler(pos(e), (e.buttons & 1) === 1); });
      return;
    }
    cv.addEventListener('pointerdown', function (e) {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      active = e.pointerId;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      handler(pos(e), true);
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) { handler(pos(e), active === e.pointerId); });
    const end = function (e) {
      if (active !== e.pointerId) return;
      active = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', function () { if (active === null) showInfo(''); });
  }

  function onStripPointer(p, pressed) {
    if (p.y < 0 || p.y >= STRIP.h) return;
    let y0 = 0, h = STRIP.h, ch = activeGate();
    if (ui.tab === 'strips') {
      y0 = MAP.head; h = STRIP.h - MAP.head;
      const lay = stripLayout(panelChannels(), STRIP.w, stripMode());
      for (let j = 0; j < lay.length; j++) if (p.x >= lay[j].x && p.x < lay[j].x + lay[j].w) ch = j;
    }
    const z = zAtY(p.y, y0, h);
    showInfo(infoText(z, ch));
    if (pressed) setProbeZ(z);
  }

  function onMapPointer(p, pressed) {
    if (p.y < 0 || p.y >= MAP.h) return;
    const k = panelChannels();
    const colW = Math.floor((MAP.w - 2) / k);
    const ch = M.clamp(Math.floor((p.x - 1) / colW), 0, k - 1);
    const z = zAtY(p.y, MAP.head, MAP.h - MAP.head);
    showInfo(infoText(z, ch));
    if (pressed) setProbeZ(z);
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
    const cv = UT.dom.h('canvas', { id: 'cv-aut-ascan', width: ASCAN.w, height: ASCAN.h, title: t('Live A-scan at the probe position with the AUT gates (one colour per channel)') });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      setInst({ gain: M.clamp((+UT.state.instrument.gain || 0) + (e.deltaY < 0 ? 1 : -1), LIMITS.gain[0], LIMITS.gain[1]) });
    }, { passive: false });
    const legend = UT.dom.h('canvas', { id: 'cv-aut-legend', width: LEGEND.w, height: LEGEND.h, title: t('Amplitude colour map (white ≥100 %, red, magenta, yellow, green, cyan, blue <10 %)') });
    const axis = UT.dom.h('div', { class: 'aut-axis' }, ['0', '2', '4', '6', '8', '10'].map(function (v) { return UT.dom.h('span', {}, v); }));
    const sliders = UT.dom.h('div', { class: 'aut-sliders' }, [
      instSlider(t('Range'), 'range', LIMITS.range[0], LIMITS.range[1], 1, function (v) { return Math.max(1, Math.round(v * 0.02)); }, function (v) { return t('Range') + ' ' + M.fmt(v, 0) + 'mm'; }),
      instSlider(t('X-Shift'), 'delay', LIMITS.delay[0], LIMITS.delay[1], 1, function () { return 1; }, function (v) { return t('X-Shift') + ' ' + M.fmt(v, 0) + 'mm'; }),
    ]);
    const amp = UT.dom.h('input', { type: 'range', min: LIMITS.gain[0], max: LIMITS.gain[1], step: 1, orient: 'vertical', title: t('AMP — gain (dB)') });
    amp.value = +UT.state.instrument.gain || 0;
    amp.addEventListener('input', function () { setInst({ gain: M.clamp(parseFloat(amp.value), LIMITS.gain[0], LIMITS.gain[1]) }); });
    ui.inputs.gain = amp;
    const ampVal = UT.dom.h('span', { class: 'aut-amp-val' }, 'AMP ' + Math.round(amp.value) + 'dB');
    ui.labels.gain = { el: ampVal, fmt: function (v) { return 'AMP ' + Math.round(v) + 'dB'; } };
    const ampBox = UT.dom.h('div', { class: 'aut-amp' }, [amp, ampVal]);
    const off = UT.dom.h('button', { class: 'aut-off', type: 'button', title: t('Leave AUT') }, 'OFF');
    off.addEventListener('click', function () { leave(); });
    ui.ascan = cv;
    ui.legend = legend;
    return UT.dom.h('div', { class: 'aut-mid' }, [
      UT.dom.h('div', { class: 'aut-scope' }, [UT.dom.h('div', {}, [cv, axis]), legend]),
      UT.dom.h('div', { class: 'aut-ctl' }, [sliders, ampBox, off]),
      buildGateGroup(),
    ]);
  }

  function gateRadio(i) {
    const r = UT.dom.h('input', { type: 'radio', name: 'aut-gate', value: String(i), title: t('Select gate {n}', { n: i + 1 }) });
    r.addEventListener('change', function () { if (r.checked) setAut({ activeGate: i }); });
    ui.radios[i] = r;
    const lbl = UT.dom.h('label', {}, [r, UT.dom.h('span', { class: 'aut-ch-dot', style: { background: CHANNEL_COLOURS[i] } }), String(i + 1)]);
    ui.radioLabels[i] = lbl;
    return lbl;
  }

  function stripRadio(mode, title) {
    const r = UT.dom.h('input', { type: 'radio', name: 'aut-strip', value: mode, title });
    r.addEventListener('change', function () { if (r.checked) setAut({ strip: mode, rectified: mode !== 'rtd' }); });
    ui.stripRadios.push(r);
    return r;
  }

  function buildGateGroup() {
    const gi = function () { return activeGate(); };
    const gate = function () { return panelGates()[gi()] || { start: 0, width: 0, level: 0, on: false }; };
    // Channels select
    const chSel = UT.dom.h('select', { title: t('Number of AUT channels (gates scanned side by side)') });
    for (let i = 1; i <= MAX_CHANNELS; i++) chSel.appendChild(UT.dom.h('option', { value: String(i) }, String(i)));
    chSel.addEventListener('change', function () { setChannels(parseInt(chSel.value, 10)); });
    ui.inputs.channels = chSel;
    const chRow = UT.dom.h('div', { class: 'aut-gate-row' }, [UT.dom.h('span', { class: 'aut-lbl', i18n: 'Channels' }), chSel]);
    // Level spinner
    const lvlLbl = UT.dom.h('span', { class: 'aut-lbl' }, 'Level=');
    const up = UT.dom.h('button', { type: 'button', title: t('Level +1 %') }, '▲');
    const dn = UT.dom.h('button', { type: 'button', title: t('Level −1 %') }, '▼');
    up.addEventListener('click', function () { patchGate(gi(), { level: gateValue('level', (gate().level || 0) + 1) }); });
    dn.addEventListener('click', function () { patchGate(gi(), { level: gateValue('level', (gate().level || 0) - 1) }); });
    ui.labels.level = { el: lvlLbl, fmt: function (v) { return t('Level') + '=' + Math.round(v) + '%'; } };
    const levelRow = UT.dom.h('div', { class: 'aut-gate-row' }, [lvlLbl, UT.dom.h('div', { class: 'aut-spin' }, [up, dn])]);
    // Width / Start sliders
    const hslider = function (key, label, unit, title) {
      const lbl = UT.dom.h('span', { class: 'aut-lbl' }, t(label) + '=');
      ui.labels[key] = { el: lbl, fmt: function (v) { return t(label) + '=' + Math.round(v) + unit; } };
      const input = UT.dom.h('input', { type: 'range', min: LIMITS[key][0], max: LIMITS[key][1], step: 1, title });
      input.value = gate()[key] || 0;
      input.addEventListener('input', function () { const p = {}; p[key] = gateValue(key, parseFloat(input.value)); patchGate(gi(), p); });
      const dec = UT.dom.h('button', { type: 'button', title: t(label) + ' −1' }, '◀');
      const inc = UT.dom.h('button', { type: 'button', title: t(label) + ' +1' }, '▶');
      dec.addEventListener('click', function () { const p = {}; p[key] = gateValue(key, (gate()[key] || 0) - 1); patchGate(gi(), p); });
      inc.addEventListener('click', function () { const p = {}; p[key] = gateValue(key, (gate()[key] || 0) + 1); patchGate(gi(), p); });
      ui.inputs[key] = input;
      return UT.dom.h('div', { class: 'aut-gate-row' }, [lbl, UT.dom.h('div', { class: 'aut-hslider' }, [dec, input, inc])]);
    };
    const widthRow = hslider('width', 'Width', 'mm', t('Transit gate length (mm sound path)'));
    const startRow = hslider('start', 'Start', 'mm', t('Gate start (mm sound path)'));
    // Gate on checkbox
    const onChk = UT.dom.h('input', { type: 'checkbox', title: t('Gate on / off') });
    onChk.addEventListener('change', function () { patchGate(gi(), { on: !!onChk.checked }); });
    ui.inputs.on = onChk;
    // Gates same
    const same = UT.dom.h('button', { class: 'aut-same', type: 'button', title: t('Copy gate 1 settings to the other channels'), i18n: 'Gates Same' });
    same.addEventListener('click', function () {
      const g1 = panelGates()[0];
      if (!g1) return;
      const k = panelChannels();
      const gates = panelGates().map(function (g, i) { return (i === 0 || i >= k) ? Object.assign({}, g) : Object.assign({}, g, { start: g1.start, width: g1.width, level: g1.level, on: g1.on }); });
      setAut({ gates });
    });
    // RDT / RTD
    const rdt = UT.dom.h('div', { class: 'aut-rdt' }, [
      UT.dom.h('div', { class: 'aut-rdt-cap' }, [UT.dom.h('span', {}, 'RDT'), UT.dom.h('span', {}, 'RTD')]),
      UT.dom.h('div', { class: 'aut-radios' }, [
        stripRadio('rdt', t('RDT — rectified amplitude strip only')),
        stripRadio('rtd', t('RTD — transit time (TOF) strip only')),
        stripRadio('both', t('Both strips')),
      ]),
    ]);
    const rev = UT.dom.h('input', { type: 'checkbox', title: t('Reverse the colour map') });
    rev.addEventListener('change', function () { setAut({ revMap: !!rev.checked }); });
    ui.inputs.revMap = rev;
    const radios = [];
    for (let i = 0; i < MAX_CHANNELS; i++) radios.push(gateRadio(i));
    return UT.dom.h('fieldset', { class: 'aut-gates' }, [
      UT.dom.h('legend', { i18n: 'Transit/TOF Gate' }),
      UT.dom.h('div', { class: 'aut-radios' }, radios),
      chRow, levelRow, widthRow, startRow,
      UT.dom.h('label', { class: 'aut-on' }, [onChk, UT.dom.h('span', { i18n: 'Gate on' })]),
      same, rdt,
      UT.dom.h('label', { class: 'aut-rev' }, [rev, UT.dom.h('span', { i18n: 'Rev Map' })]),
    ]);
  }

  function tabButton(name, label) {
    const b = UT.dom.h('button', { class: 'aut-tab', type: 'button', i18n: label, title: t('Show the {tab} tab', { tab: t(label) }) });
    b.addEventListener('click', function () { panel.setTab(name); });
    ui.tabBtns[name] = b;
    return b;
  }

  /** Build the whole panel content (called on first open and on 'lang'). */
  function buildContent() {
    ui.inputs = {}; ui.labels = {}; ui.radios = []; ui.radioLabels = []; ui.stripRadios = []; ui.tabBtns = {};
    const runBtn = UT.dom.h('button', { class: 'aut-run', type: 'button', title: t('Scan along the weld at the current probe x') }, t('Run Scan'));
    runBtn.addEventListener('click', function () { if (isScanning()) stopScan(); else startScan(); syncInputs(); UT.requestRender(); });
    const clearBtn = UT.dom.h('button', { class: 'aut-clear', type: 'button', title: t('Clear the strip charts and the map'), i18n: 'Clear' });
    clearBtn.addEventListener('click', function () { stopScan(true); setAut({ scan: null, map: null, running: false }); });
    const strip = UT.dom.h('canvas', { id: 'cv-aut-strip', width: STRIP.w, height: STRIP.h, title: t('Amplitude strip (white) and TOF strip (blue) along the weld — click to move the probe') });
    bindPointer(strip, onStripPointer);
    const map = UT.dom.h('canvas', { id: 'cv-aut-map', width: MAP.w, height: MAP.h, title: t('C-scan map: z (down) × channel (across), amplitude colour bands — click to move the probe') });
    bindPointer(map, onMapPointer);
    map.hidden = ui.tab !== 'map';
    strip.hidden = ui.tab === 'map';
    const info = UT.dom.h('div', { class: 'aut-info' }, '');
    const speed = UT.dom.h('input', { type: 'range', min: LIMITS.speed[0], max: LIMITS.speed[1], step: 1, title: t('Scan speed (columns per frame)') });
    speed.value = speedOf(UT.state);
    speed.addEventListener('input', function () { setAut({ speed: M.clamp(parseInt(speed.value, 10) || COLS_PER_FRAME, LIMITS.speed[0], LIMITS.speed[1]) }); });
    ui.inputs.speed = speed;
    const speedVal = UT.dom.h('span', {}, '');
    ui.labels.speed = { el: speedVal, fmt: function (v) { return t('{n}/frame', { n: Math.round(v) }); } };
    const speedRow = UT.dom.h('div', { class: 'aut-speed' }, [UT.dom.h('span', { i18n: 'Speed' }), speed, speedVal]);
    const tabs = UT.dom.h('div', { class: 'aut-tabs' }, [tabButton('chart', 'Chart'), tabButton('strips', 'Strips'), tabButton('map', 'Map')]);
    const content = UT.dom.h('div', { class: 'aut-panel' }, [
      UT.dom.h('div', { class: 'aut-strip-col' }, [UT.dom.h('div', { class: 'aut-top' }, [runBtn, clearBtn]), tabs, strip, map, info, speedRow]),
      buildScope(),
    ]);
    ui.runBtn = runBtn;
    ui.strip = strip;
    ui.map = map;
    ui.info = info;
    return content;
  }

  function buildWindow() {
    const content = buildContent();
    const inst = anchorRect('instrument');
    ui.win = UT.dom.win({
      name: 'aut', title: 'AUT', x: inst ? Math.max(0, Math.round(inst.left)) : 4, y: inst ? Math.max(0, Math.round(inst.top)) : 96,
      content, onClose: function () { leave(); },
    });
  }

  function syncInputs() {
    if (!ui.win) return;
    const a = autState(), inst = UT.state.instrument;
    const gi = activeGate();
    const k = panelChannels();
    const g = panelGates()[gi] || { start: 0, width: 0, level: 0, on: false };
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const set = function (key, v) { const el = ui.inputs[key]; if (el && active !== el && String(el.value) !== String(v)) el.value = v; };
    set('range', +inst.range || 100);
    set('delay', +inst.delay || 0);
    set('gain', +inst.gain || 0);
    set('width', g.width || 0);
    set('start', g.start || 0);
    set('speed', speedOf(UT.state));
    set('channels', k);
    if (ui.inputs.on) ui.inputs.on.checked = !!g.on;
    if (ui.inputs.revMap) ui.inputs.revMap.checked = !!a.revMap;
    const lab = function (key, v) { const l = ui.labels[key]; if (!l) return; const s = l.fmt(v); if (l.el.textContent !== s) l.el.textContent = s; };
    lab('range', +inst.range || 100); lab('delay', +inst.delay || 0); lab('gain', +inst.gain || 0);
    lab('level', g.level || 0); lab('width', g.width || 0); lab('start', g.start || 0); lab('speed', speedOf(UT.state));
    ui.radios.forEach(function (r, i) { if (r) r.checked = i === gi; });
    ui.radioLabels.forEach(function (l, i) { if (l) l.hidden = i >= k; });
    const sm = stripMode();
    ui.stripRadios.forEach(function (r) { r.checked = r.value === sm; });
    TABS.forEach(function (name) { const b = ui.tabBtns[name]; if (b) b.classList.toggle('active', ui.tab === name); });
    if (ui.strip) ui.strip.hidden = ui.tab === 'map';
    if (ui.map) ui.map.hidden = ui.tab !== 'map';
    if (ui.runBtn) {
      const running = isScanning() || !!a.running;
      const txt = running ? t('Stop Scan') : t('Run Scan');
      if (ui.runBtn.textContent !== txt) ui.runBtn.textContent = txt;
      ui.runBtn.classList.toggle('running', running);
    }
  }

  // ------------------------------------------------------------------ drawing (pure canvas functions)
  function headZOf(state) {
    const sc = autOf(state).scan;
    return (anim && sc && anim.sc === sc) ? sc.z0 + Math.min(anim.i, sc.n - 1) * sc.step : state.probe.z;
  }

  function drawScope(frame, state) {
    const cv = ui.ascan;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, ASCAN.w, ASCAN.h);
    const k = Math.min(channelsOf(state), gatesOf(state).length);
    const gates = gatesOf(state).slice(0, k);
    const gi = activeGate();
    const margin = { l: 14, r: 4, t: 4, b: 4 };
    const W = ASCAN.w, H = ASCAN.h;
    const stateLike = Object.assign({}, state, { instrument: Object.assign({}, state.instrument, { gates, activeGate: gi, dac: Object.assign({}, state.instrument.dac, { on: false }) }) });
    const asc = frame && frame.ascan;
    const range = (asc && asc.range) || state.instrument.range || 100, delay = asc && asc.delay !== undefined && asc.delay !== null ? asc.delay : (state.instrument.delay || 0);
    const px = margin.l, pw = W - margin.l - margin.r, py = margin.t, ph = H - margin.t - margin.b;
    const gateBar = function (g, i) {
      if (!g || !g.on) return;
      const x0 = px + (g.start - delay) / range * pw, x1 = px + (g.start + g.width - delay) / range * pw, y = Math.round(py + ph * (1 - M.clamp(g.level, 0, 100) / 100)) + 0.5;
      if (x1 < px || x0 > px + pw) return;
      ctx.strokeStyle = CHANNEL_COLOURS[i] || CHANNEL_COLOURS[2]; ctx.lineWidth = i === gi ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(Math.max(px, x0), y); ctx.lineTo(Math.min(px + pw, x1), y); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 0.5, y - 4); ctx.lineTo(x0 + 0.5, y + 4); ctx.moveTo(x1 - 0.5, y - 4); ctx.lineTo(x1 - 0.5, y + 4); ctx.stroke();
    };
    if (UT.instruments && typeof UT.instruments.drawAscan === 'function') {
      UT.instruments.drawAscan(ctx, frame, stateLike, { base: 'aut', axes: false, margin });
      // channels 4 … 6 get their own colours (70 draws them in its gate-3 colour)
      ctx.save();
      gates.forEach(function (g, i) { if (i >= 3) gateBar(g, i); });
      ctx.restore();
      return;
    }
    // fallback: simple trace + gates
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1f5f1f'; ctx.setLineDash([1, 3]); ctx.beginPath();
    for (let i = 0; i <= 10; i++) { const x = Math.round(W * i / 10) + 0.5, y = Math.round(H * i / 10) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke(); ctx.setLineDash([]);
    if (asc && asc.samples) {
      ctx.strokeStyle = '#22e022'; ctx.beginPath();
      const n = asc.samples.length;
      for (let i = 0; i < n; i++) { const x = px + pw * i / (n - 1), y = py + ph * (1 - M.clamp(asc.samples[i], 0, 100) / 100); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    gates.forEach(gateBar);
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

  /** z tick labels (faint) down a strip; dark = true draws dark text on a light strip. */
  function drawZTicks(ctx, x, y0, h, zr, dark) {
    const step = tickStep(zr.z1 - zr.z0, h, 26);
    ctx.fillStyle = dark ? '#b0b0b0' : '#c8c8c8'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top';
    for (let z = Math.ceil(zr.z0 / step) * step; z <= zr.z1; z += step) {
      const y = y0 + (z - zr.z0) / (zr.z1 - zr.z0) * (h - 1);
      ctx.fillRect(x, Math.round(y) + 0.5, 4, 1);
      ctx.fillText(String(z), x + 5, Math.min(y0 + h - 10, y + 1));
    }
  }

  /** One amplitude strip (white) at x…x+w with the traces of channels `chans` (active black, others grey). */
  function ampStrip(ctx, x, w, y0, h, sc, gates, chans, gi, zr, ticks) {
    const yOf = function (z) { return y0 + (z - zr.z0) / (zr.z1 - zr.z0) * (h - 1); };
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y0, w, h);
    if (ticks) drawZTicks(ctx, x, y0, h, zr, true);
    chans.forEach(function (i) {
      const g = gates[i];
      if (!g || !g.on) return;
      const tx = x + Math.round(M.clamp(g.level, 0, 100) / 100 * (w - 1)) + 0.5;
      ctx.strokeStyle = i === gi ? '#202020' : '#9a9a9a'; ctx.lineWidth = 1; ctx.setLineDash(i === gi ? [4, 3] : [2, 3]);
      ctx.beginPath(); ctx.moveTo(tx, y0); ctx.lineTo(tx, y0 + h); ctx.stroke();
    });
    ctx.setLineDash([]);
    if (!(sc && sc.amp)) return;
    const order = chans.filter(function (i) { return i !== gi; });
    if (chans.indexOf(gi) >= 0) order.push(gi);
    order.forEach(function (i) {
      const arr = sc.amp[i];
      if (!arr || !gates[i] || !gates[i].on) return;
      ctx.strokeStyle = i === gi ? '#000000' : '#a0a0a0'; ctx.lineWidth = i === gi ? 1.5 : 1;
      ctx.beginPath();
      let pen = false;
      for (let k = 0; k < sc.n; k++) {
        const v = arr[k];
        if (!Number.isFinite(v)) { pen = false; continue; }
        const px = x + M.clamp(v, 0, 100) / 100 * (w - 1), py = yOf(sc.z0 + k * sc.step);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke();
    });
  }

  /** One TOF strip (blue) at x…x+w for channel `ch`. */
  function tofStrip(ctx, x, w, y0, h, sc, g, ch, rev, zr) {
    const yOf = function (z) { return y0 + (z - zr.z0) / (zr.z1 - zr.z0) * (h - 1); };
    ctx.fillStyle = '#0018e0'; ctx.fillRect(x, y0, w, h);
    if (!(sc && sc.tof && sc.tof[ch] && g && g.on && g.width > 0)) return;
    const tof = sc.tof[ch], amp = sc.amp[ch];
    const inner = Math.max(4, w - 12), tick = w >= 30 ? 3 : 2, bar = w >= 30 ? 6 : 4;
    for (let k = 0; k < sc.n; k++) {
      const p = tof[k];
      if (!Number.isFinite(p)) continue;
      const u = M.clamp((p - g.start) / g.width, 0, 1);
      const px = x + 4 + u * inner, py = yOf(sc.z0 + k * sc.step);
      ctx.fillStyle = colourFor(amp[k], rev); ctx.fillRect(px - tick - 1, py - 0.5, tick, 1.5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px, py - 0.5, bar, 1.5);
    }
  }

  function headLine(ctx, W, y0, h, zr, headZ) {
    if (!Number.isFinite(headZ)) return;
    const y = Math.round(y0 + (M.clamp(headZ, zr.z0, zr.z1) - zr.z0) / (zr.z1 - zr.z0) * (h - 1)) + 0.5;
    ctx.strokeStyle = '#ff0000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  /**
   * v1 strip chart (Chart tab): amplitude strip with all channel traces + TOF strip of the active channel.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W  @param {number} H
   * @param {object} state
   */
  function drawChart(ctx, W, H, state) {
    const a = autOf(state);
    const sc = a.scan;
    const zr = stripZRange(state);
    const mode = stripMode();
    const gap = 4;
    const ampW = mode === 'rdt' ? W : mode === 'rtd' ? 0 : Math.floor((W - gap) / 2);
    const tofX = mode === 'rdt' ? W : mode === 'rtd' ? 0 : ampW + gap;
    const tofW = W - tofX;
    const gi = activeGate();
    const k = Math.min(channelsOf(state), Math.max(1, gatesOf(state).length));
    const gates = (sc && sc.gates) || a.gates || [];
    const chans = [];
    for (let i = 0; i < k; i++) chans.push(i);
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (ampW > 0) ampStrip(ctx, 0, ampW, 0, H, sc, gates, chans, gi, zr, true);
    if (tofW > 0) tofStrip(ctx, tofX, tofW, 0, H, sc, gates[gi], gi, !!a.revMap, zr);
    headLine(ctx, W, 0, H, zr, headZOf(state));
    ctx.restore();
  }

  /**
   * Per-channel strips (Strips tab): one amplitude + TOF pair per channel side by side.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W  @param {number} H
   * @param {object} state
   */
  function drawStrips(ctx, W, H, state) {
    const a = autOf(state);
    const sc = a.scan;
    const zr = stripZRange(state);
    const gi = activeGate();
    const k = Math.min(channelsOf(state), Math.max(1, gatesOf(state).length));
    const gates = (sc && sc.gates) || a.gates || [];
    const lay = stripLayout(k, W, stripMode());
    const y0 = MAP.head, h = H - MAP.head;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.font = 'bold 10px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    lay.forEach(function (s) {
      ctx.fillStyle = CHANNEL_COLOURS[s.ch] || '#fff';
      ctx.fillText(String(s.ch + 1) + (s.ch === gi ? '◄' : ''), s.x + s.w / 2, 1);
      if (s.ampW > 0) ampStrip(ctx, s.ampX, s.ampW, y0, h, sc, gates, [s.ch], gi, zr, s.ch === 0 && s.ampW >= 40);
      if (s.tofW > 0) tofStrip(ctx, s.tofX, s.tofW, y0, h, sc, gates[s.ch], s.ch, !!a.revMap, zr);
      if (gates[s.ch] && !gates[s.ch].on) {   // off channel: grey veil
        ctx.fillStyle = 'rgba(80,80,80,0.75)'; ctx.fillRect(s.x, y0, s.w, h);
      }
    });
    ctx.textAlign = 'start';
    headLine(ctx, W, y0, h, zr, headZOf(state));
    ctx.restore();
  }

  /**
   * C-scan map (Map tab): z vertical × channel bands horizontal, cells in the 7-band colour map.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} W  @param {number} H
   * @param {object} state
   */
  function drawMap(ctx, W, H, state) {
    const a = autOf(state);
    const m = a.map || (a.scan ? mapOf(a.scan) : null);
    const zr = stripZRange(state);
    const rev = !!a.revMap;
    const k = m ? m.k : Math.min(channelsOf(state), Math.max(1, gatesOf(state).length));
    const y0 = MAP.head, h = H - MAP.head;
    const colW = Math.floor((W - 2) / k);
    const yOf = function (z) { return y0 + (z - zr.z0) / (zr.z1 - zr.z0) * (h - 1); };
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#181818'; ctx.fillRect(1, y0, colW * k, h);
    ctx.font = 'bold 10px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
    for (let j = 0; j < k; j++) { ctx.fillStyle = CHANNEL_COLOURS[j] || '#fff'; ctx.fillText(String(j + 1), 1 + j * colW + colW / 2, 1); }
    ctx.textAlign = 'start';
    if (m && m.map) {
      const hpx = Math.max(1, (m.step || 1) / (zr.z1 - zr.z0) * (h - 1));
      for (let i = 0; i < m.n; i++) {
        const y = yOf(m.z0 + i * m.step);
        for (let j = 0; j < k; j++) {
          const v = m.map[i * k + j];
          if (!Number.isFinite(v)) continue;
          ctx.fillStyle = colourFor(v, rev);
          ctx.fillRect(1 + j * colW, y - hpx / 2, colW - 1, hpx + 0.5);
        }
      }
    } else {
      ctx.fillStyle = '#9a9a9a'; ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(t('No scan'), W / 2, y0 + h / 2 - 6);
      ctx.textAlign = 'start';
    }
    // column separators + z ticks (outlined text so it stays readable over any colour)
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath();
    for (let j = 1; j < k; j++) { const x = 1 + j * colW - 0.5; ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); }
    ctx.stroke();
    const step = tickStep(zr.z1 - zr.z0, h, 26);
    ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top'; ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = '#ffffff';
    for (let z = Math.ceil(zr.z0 / step) * step; z <= zr.z1; z += step) {
      const y = Math.min(y0 + h - 10, yOf(z) + 1);
      ctx.strokeText(String(z), 3, y); ctx.fillText(String(z), 3, y);
    }
    headLine(ctx, W, y0, h, zr, headZOf(state));
    ctx.restore();
  }

  /**
   * Strip-chart snapshot for the trade report: header + Chart | Strips (channels > 1) | Map on an offscreen canvas.
   * @param {{strips?:boolean, map?:boolean}} [opts]  include the per-channel strips / the map (default: both, strips only when channels > 1)
   * @returns {string|null} 'data:image/png;base64,…' (null without a DOM or without a scan)
   */
  function snapshot(opts) {
    if (typeof document === 'undefined') return null;
    const o = opts || {};
    const state = UT.state;
    const a = autOf(state);
    if (!a.scan) return null;
    const k = Math.min(channelsOf(state), Math.max(1, gatesOf(state).length));
    const parts = ['chart'];
    if (o.strips === true || (o.strips !== false && k > 1)) parts.push('strips');
    if (o.map !== false) parts.push('map');
    const gap = 6, head = 28;   // line 1: description, line 2: panel names
    const W = parts.length * STRIP.w + (parts.length - 1) * gap, H = head + STRIP.h;
    let cv, ctx;
    try { cv = document.createElement('canvas'); cv.width = W; cv.height = H; ctx = cv.getContext('2d'); } catch (e) { return null; }
    if (!ctx) return null;
    const sc = a.scan, p = state.probe;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e0e0e0'; ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top';
    const desc = 'AUT ' + t('x {x} mm', { x: M.fmt(Number.isFinite(sc.x) ? sc.x : p.x, 0) }) + ' · ' + (p.angle || 0) + '° · ' + t('gain {g} dB', { g: M.fmt(Number.isFinite(sc.gain) ? sc.gain : state.instrument.gain, 0) }) + ' · ' + t('{n} channels', { n: k }) + ' · ' + t('step {s} mm', { s: sc.step || 1 }) + ' · ' + t('{n} columns', { n: sc.n });
    ctx.fillText(desc, 2, 2);
    const names = { chart: t('Chart'), strips: t('Strips'), map: t('Map') };
    parts.forEach(function (name, i) {
      const x = i * (STRIP.w + gap);
      ctx.save();
      ctx.translate(x, head);
      ctx.beginPath(); ctx.rect(0, 0, STRIP.w, STRIP.h); ctx.clip();
      if (name === 'chart') drawChart(ctx, STRIP.w, STRIP.h, state);
      else if (name === 'strips') drawStrips(ctx, STRIP.w, STRIP.h, state);
      else drawMap(ctx, STRIP.w, STRIP.h, state);
      ctx.restore();
      ctx.fillStyle = '#8fd'; ctx.font = 'bold 10px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(names[name], x + 2, 15);
    });
    try { return cv.toDataURL('image/png'); } catch (e) { return null; }
  }

  const panel = {
    /** The 'aut' window api (null until first open()). */
    window: null,
    isOpen() { return !!(ui.win && ui.win.isOpen()); },
    /** Current tab: 'chart' | 'strips' | 'map'. */
    get tab() { return ui.tab; },
    /**
     * Switch the chart column tab.
     * @param {string} name  'chart' | 'strips' | 'map'
     * @returns {string} the active tab
     */
    setTab(name) {
      if (TABS.indexOf(name) >= 0) ui.tab = name;
      if (ui.win) { syncInputs(); UT.requestRender(); }
      return ui.tab;
    },
    /** Create (lazily) and show the AUT window. */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('aut', css);
      if (!ui.win) buildWindow();
      panel.window = ui.win;
      if (!ui.subscribed) {
        ui.subscribed = true;
        UT.bus.on('render', function (frame) { panel.draw(frame); });
        UT.bus.on('lang', function () { if (ui.win) { ui.win.setContent(buildContent()); syncInputs(); UT.requestRender(); } });
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
    /** Draw the A-scan, legend and the active chart tab from the frame (no-op while hidden). */
    draw(frame) {
      if (!panel.isOpen()) return;
      const state = UT.state;
      try {
        syncInputs();
        drawScope(frame, state);
        drawLegend(state);
        if (ui.tab === 'map') { if (ui.map) drawMap(UT.dom.fitCanvas(ui.map, MAP.w, MAP.h), MAP.w, MAP.h, state); }
        else if (ui.strip) {
          const ctx = UT.dom.fitCanvas(ui.strip, STRIP.w, STRIP.h);
          if (ui.tab === 'strips') drawStrips(ctx, STRIP.w, STRIP.h, state); else drawChart(ctx, STRIP.w, STRIP.h, state);
        }
      } catch (e) { console.error('[UT.aut.panel]', e); }
    },
  };

  // ================================================================== test API
  function testRunAutScan() {
    stopScan(true);
    const sc = runScan(UT.state, { sync: true });
    if (!sc) return null;
    const map = mapOf(sc);
    UT.setIn('aut', { scan: sc, map, running: false, x: UT.state.probe.x });
    return {
      z0: sc.z0, z1: sc.z1, step: sc.step, n: sc.n, channels: sc.channels, strips: stripLayout(sc.channels).length, mapN: map ? map.n * map.k : 0,
      aboveLevel: sc.amp.map(function (_, i) { return aboveLevel(sc, i); }),
    };
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
      // v2 pure helpers
      if (stepFor(300) !== 1 || stepFor(400) !== 1 || stepFor(600) !== 2 || stepFor(1916) !== 5 || stepFor(0) !== 1) f.push('stepFor');
      if (channelsOf({ aut: { channels: 9 } }) !== 6 || channelsOf({ aut: {} }) !== 3 || channelsOf({ aut: { channels: 0 } }) !== 1) f.push('channelsOf');
      if (speedOf({ aut: {} }) !== 6 || speedOf({ aut: { speed: 200 } }) !== 60) f.push('speedOf');
      const lay6 = stripLayout(6, 186, 'both');
      if (lay6.length !== 6 || lay6[5].x + lay6[5].w > 186 || lay6.some(function (s) { return s.ampW <= 0 || s.tofW <= 0; })) f.push('stripLayout 6 ' + JSON.stringify(lay6[5]));
      if (stripLayout(1, 186, 'rdt')[0].ampW !== 186 || stripLayout(1, 186, 'rtd')[0].tofW !== 186 || stripLayout(3).length !== 3) f.push('stripLayout modes');
      const fm = mapOf({ z0: 0, z1: 2, step: 1, n: 3, channels: 2, gates: [{ on: true }, { on: true }, { on: false }], amp: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] });
      if (!fm || fm.k !== 2 || fm.map.length !== 6 || fm.map[1] !== 4 || fm.map[5] !== 6 || fm.gates.length !== 2) f.push('mapOf ' + JSON.stringify(fm && Array.from(fm.map)));
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
      if (sc.filled !== 61 || !sc.done || sc.channels !== 3) f.push('runScan filled/channels');
      if (!sc.amp[2].every(function (v) { return v === 0; }) || !sc.tof[2].every(function (v) { return Number.isNaN(v); })) f.push('gate off column');
      const c = prepare(st);
      const col = scanColumn(st, 30, c);
      if (col.amp.length !== 3 || Math.abs(col.amp[0] - sc.amp[0][30]) > 1e-3) f.push('scanColumn consistency');
      // amplitude must fall off away from the defect (z 20..40) and be symmetric-ish about its centre
      const centre = sc.amp[0][30], far = sc.amp[0][2];
      if (!(centre > far)) f.push('no z fall-off ' + centre + ' vs ' + far);
      if (Number.isFinite(sc.tof[0][30]) && !(sc.tof[0][30] >= 20 && sc.tof[0][30] <= 70)) f.push('tof outside gate ' + sc.tof[0][30]);
      // channels: gate 2 is scanned as OFF when channels = 1 even though it is on
      st.aut.channels = 1;
      const sc1 = runScan(st, { sync: true });
      if (!sc1 || sc1.channels !== 1 || !sc1.amp[1].every(function (v) { return v === 0; }) || aboveLevel(sc1, 1).length) f.push('channels 1 hides gate 2');
      if (!(sc1.amp[0][30] > 0 && Math.abs(sc1.amp[0][30] - sc.amp[0][30]) < 1e-3)) f.push('channels 1 keeps gate 1');
      const m1 = mapOf(sc1);
      if (!m1 || m1.k !== 1 || m1.n !== 61 || Math.abs(m1.map[30] - sc1.amp[0][30]) > 1e-6) f.push('mapOf scan');
      // V1 #12 (with the v2 planar z-overlap exponent): LOF z 120..150 on the 300 plate → gate 1 > level only within 110..160
      const st12 = UT.defaultState();
      st12.mode = 'aut';
      st12.specimen = UT.specimens.plateWeld({ T: 20, L: 300 });
      st12.defects = [UT.specimens.defectPresets.lof(st12.specimen, { zFrom: 120, zTo: 150 })];
      st12.probe.z = 135; st12.probe.x = bestX; st12.instrument.gain = 40;
      st12.aut.gates = st12.aut.gates.map(function (g, i) { return i === 0 ? Object.assign({}, g, { on: true, start: 10, width: 80, level: 20 }) : g; });
      const s12 = runScan(st12, { sync: true });
      const iv12 = s12 ? aboveLevel(s12, 0) : [];
      if (!s12 || s12.step !== 1 || s12.n !== 301 || s12.amp.length !== 6) f.push('V1 #12 shape');
      if (iv12.length !== 1 || iv12[0][0] < 110 || iv12[0][0] > 122 || iv12[0][1] < 148 || iv12[0][1] > 160) f.push('V1 #12 window ' + JSON.stringify(iv12));
      // V2-12: 24-inch pipe (C ≈ 1916) → adaptive step 5, n ≤ 500, 6 channels, sync ≤ 1.5 s
      const st24 = UT.defaultState();
      st24.mode = 'aut';
      st24.specimen = UT.specimens.pipeWeld({ od: 610, wt: 20 });
      st24.defects = [UT.specimens.defectPresets.lof(st24.specimen, { zFrom: 120, zTo: 150 })];
      st24.probe.x = bestX; st24.probe.z = 135; st24.instrument.gain = 40;
      st24.aut.channels = 6;
      st24.aut.gates = st24.aut.gates.map(function (g) { return Object.assign({}, g, { on: true }); });
      const t0 = Date.now();
      const s24 = runScan(st24, { sync: true });
      const ms = Date.now() - t0;
      if (!s24 || s24.step !== 5 || s24.n > 500 || s24.n < 300 || s24.z1 > st24.specimen.L || s24.channels !== 6) f.push('V2-12 shape ' + JSON.stringify(s24 && { step: s24.step, n: s24.n, z1: s24.z1, ch: s24.channels }));
      if (ms > 1500) f.push('V2-12 sync scan ' + ms + ' ms');
      const m24 = mapOf(s24);
      if (!m24 || m24.k !== 6 || m24.map.length !== s24.n * 6) f.push('V2-12 map');
      if (stripLayout(s24.channels).length !== 6) f.push('V2-12 strips');
    } catch (e) { f.push('exception: ' + (e && e.message)); }
    return f;
  }

  UT.aut = {
    BANDS, COLS_PER_FRAME, MAX_CHANNELS, CHANNEL_COLOURS, STRIP, MAP, ASCAN,
    colourFor, prepare, scanColumn, scanShell, runScan, aboveLevel, mapOf, startScan, stopScan, isScanning,
    channelsOf, speedOf, stepFor, stripLayout, traceOpts: traceOptsOf, snapshot,
    panel, css,
    open() { return panel.open(); },
    close() { return panel.close(); },
    toggle() { return panel.toggle(); },
    setTab(name) { return panel.setTab(name); },
    /** The 'aut' window api (null until first open()). */
    get window() { return panel.window; },
    __selftest: selftest,
  };

  Object.assign(UT.test, { runAutScan: testRunAutScan });
})(window.UT = window.UT || {});
