/* 56-pa.js — Phased array v2 (SPEC-v2 §3.10 P10): linear array + wedge-corrected focal laws, S-scan
 * (sector, per-angle TCG), E-scan (sliding 8-element aperture), encoded C-scan (z × lateral map), the
 * window 'pa' (tabs S | E | C, array/sweep/focus controls, focal-law bar chart, Run/Stop/Clear) and the
 * nested test namespace UT.test.pa. Physics functions are pure functions of their arguments (state-like
 * objects); only setSweep()/setArray(), startScan()/stopScan(), the panel and the test API touch UT.state.
 * Headless-safe: nothing here reads the DOM at load time.
 */
// SPEC NOTES (decisions where SPEC-v2 §3.10 is silent or ambiguous)
// 1. Sweep source: the physics reads probe.paFrom/paTo/paStep (UT.probe.paAngles) — pa.from/to/step are
//    mirrors. Both are written in ONE UT.set by setSweep(). The frozen defaults disagree (probe 40…70 vs pa
//    35…75): ensurePa() (panel open, test API) adopts the pa mirror ONLY while the probe sweep is still the
//    v1 default 40/70/1 and the mirror differs; in every other case the mirror is aligned to the probe.
// 2. Selected column: state.pa.angle (deg, written by the panel / the image click) — 40's selectColumn()
//    already prefers it; probe.angle is the fallback. It is an extra pa.* field (56-owned, not persisted by 94).
// 3. Aperture per column: A = n·pitch (n = elements, E-scan 8), a = A·cos(θ_rel)·cosθ/cos(θ_w) clamped 1…200,
//    crystalDims {a, b: 10, shape 'rect'}, freq = pa.freq, libId 'pa-16-1.0' (wedgePath 12), fan 9 rays,
//    ≤ 2 legs, side lobes off (a 9-ray fan has no side-lobe rays anyway); trace options from
//    UT.ascan.traceOpts() when 40 is present. Focus: focusDepth Fd (mm, null = unfocused) → probe.focus
//    {on, F = Fd/cosθ}; the tracer clamps F ≤ N (§3.6). Wedge β = 36° shear for the S-scan; the E-scan is a
//    contact L probe (β = 0, v_w = v_mat, θ_w = θ_rel = θ, mode 'comp') exactly as §3.10 states; its
//    columns slide an 8-element aperture across the array (elements − 7 columns, ≥ 8 for 16 elements),
//    column xOff = surface offset of the sub-aperture centre from the array centre (+x).
// 4. Focal laws: steering τ_i = x_i·sin(θ_rel)/v_w − min; with a focus depth the §3.10 focused law
//    d_i = √(F² + x_i² − 2F·x_i·sin θ_rel), τ_i = (max d − d_i)/v_w with F = Fd/cosθ (the spec's "v_mat"
//    clause only covers the F = Fd/cosθ approximation; the delays are wedge travel times, so the focused law
//    converges to the steering law as F → ∞). `slope` is always the steering slope |sin θ_rel|/v_w (µs/mm), 0 when the
//    law is invalid (past the critical angle: null θ_w → valid:false, delays 0, the column is skipped).
// 5. Per-angle TCG (pa.tcg): gain(θ) = 20·log10(A_max/A(θ)) clamped 0…30 dB where A(θ) is the tracer
//    amplitude of the DAC-block T/2 SDH insonified ON AXIS at θ (probe at x_h + y_h·tanθ) with the same
//    array/aperture/focus; the block is the current specimen when it is the DAC block, else
//    UT.specimens.dacBlock({T: weldOpts.T ≥ 10 ? weldOpts.T : 40}) in the specimen's material. Angles with no
//    SDH echo inherit the nearest computed value. The table is cached by its parameter key and applied to
//    echo.amp/ampNoZ (so 40's synth of the selected column and 70's drawSscan agree) and to ampPct.
// 6. Column samples: Float32Array(160) of % FSH vs TRUE path over [delay, delay + range] (Gaussian
//    envelopes, σ = UT.ascan.sigmaOf, ≥ 1.5 sample spacings, clipped at 120) — the sector image of the
//    window; 70 keeps drawing its blob S-scan from the same columns.
// 7. C-scan: z0 = 0 … z1 = L, adaptive step = max(1, round(L/400)), n = floor(L/step) + 1, xBins = 32 lateral
//    bins over [0, latMax = maxPath·sin(aMax)] (lateral = path·sinθ), map value = max echo % FSH (NaN while
//    unscanned, 0 when empty). Like AUT: one trace per angle at the fixed probe x, per z only the z-dependent
//    echoes (defectId / zs) are re-weighted with UT.rays.zFactor. runScan() is pure; the caller stores
//    UT.setIn('pa', {scan}). startScan() animates 8 columns per frame, moves probe.z with the scan head
//    (restored at the end), emits 'scan:progress' {kind:'pa', i, n}; prefers-reduced-motion → synchronous.
// 8. Window 'pa' (x 930, y 110, 340 px): open() switches probe.method to 'pa' (the S-scan replaces the
//    A-scan on the instrument) and close() switches it back to 'pe' when it is still 'pa'; a running scan
//    is stopped. Pointer events on the image select the angle (S view), ← / → step it (keyboard); 'lang'
//    rebuilds the content. compute() only evaluates the E-scan while pa.view === 'E' (performance);
//    UT.test.pa.escan() always does.
// 9. Angle sets longer than 181 entries are decimated (step raised) so a sweep never exceeds 181 traces.
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;

  const WEDGE_BETA = 36;                 // deg, S-scan shear wedge (§3.10)
  const V_WEDGE = C.V_PERSPEX;           // mm/µs
  const ESCAN_ELEMENTS = 8;
  const CRYSTAL_B = 10;                  // mm across the beam (§3.10 crystalDims {a, b: 10})
  const COL_SAMPLES = 160;
  const FAN_COUNT = 9;
  const MAX_LEGS = 2;
  const MAX_ANGLES = 181;
  const X_BINS = 32;
  const COLS_PER_FRAME = 8;
  const TCG_MAX_DB = 30;
  const CLIP_PCT = 120;
  const PA_LIB_ID = 'pa-16-1.0';
  const VIEWS = ['S', 'E', 'C'];
  const IMG = { w: 320, h: 200 };
  const LAW = { w: 320, h: 64 };
  const DEF_PA = UT.defaultState().pa;
  const DEF_INST = UT.defaultState().instrument;

  let traceErrorLogged = false;

  // ================================================================== helpers
  function clampNum(v, lo, hi, dflt) { const n = +v; return Number.isFinite(n) ? M.clamp(n, lo, hi) : dflt; }
  function clampInt(v, lo, hi, dflt) { return Math.round(clampNum(v, lo, hi, dflt)); }
  function rad(d) { return M.deg2rad(d); }

  /** Normalised array / view parameters of a state-like object (defaults for anything missing). */
  function arrayOf(state) {
    const pa = Object.assign({}, DEF_PA, (state && state.pa) || {});
    const fd = +pa.focusDepth;
    return {
      elements: clampInt(pa.elements, 1, 128, 16),
      pitch: clampNum(pa.pitch, 0.1, 10, 1),
      freq: clampNum(pa.freq, 0.5, 20, 5),
      focusDepth: Number.isFinite(fd) && fd > 0 ? fd : null,
      escanAngle: clampNum(pa.escanAngle, 0, 89, 60),
      tcg: !!pa.tcg,
      view: VIEWS.indexOf(pa.view) >= 0 ? pa.view : 'S',
      angle: Number.isFinite(+pa.angle) ? +pa.angle : null,
    };
  }

  /** Full material record of a specimen (UT.specimens.materialOf; carbon steel when spec/material is missing). */
  function materialOf(spec) { return UT.specimens.materialOf(spec && spec.material); }

  /** Angle set of the sweep from probe.paFrom/paTo/paStep (SPEC NOTE 1, 9). */
  function sweepOf(state) {
    const probe = (state && state.probe) || {};
    const from = clampNum(probe.paFrom, 0, 89, 40), to = clampNum(probe.paTo, 0, 89, 70);
    let step = clampNum(probe.paStep, 0.25, 10, 1);
    const lo = Math.min(from, to), hi = Math.max(from, to);
    while ((hi - lo) / step + 1 > MAX_ANGLES) step *= 2;
    let angles = UT.probe && typeof UT.probe.paAngles === 'function' ? UT.probe.paAngles({ paFrom: lo, paTo: hi, paStep: step }) : null;
    if (!angles || !angles.length) { angles = []; for (let a = lo; a <= hi + 1e-9; a += step) angles.push(+a.toFixed(2)); }
    if (!angles.length) angles = [lo];
    return { from: lo, to: hi, step, angles };
  }

  function visibleDefects(state) { return UT.ascan.visibleDefects(state || {}); }

  function ampPctOf(amp, inst, derived, path) {
    if (UT.ascan && typeof UT.ascan.ampPctOf === 'function') return UT.ascan.ampPctOf(amp, inst, derived, path);
    const K = (UT.ascan && UT.ascan.K_REF) || 2.64;
    return amp * K * M.dB2lin((inst && inst.gain) || 0);
  }

  function sigmaOf(derived, inst) {
    if (UT.ascan && typeof UT.ascan.sigmaOf === 'function') { try { return UT.ascan.sigmaOf(derived, inst); } catch (e) { /* fall through */ } }
    return 0.5 * (derived.lambda || 0.65) * 1.5;
  }

  function foldDepth(d, T) {
    if (!(T > 0)) return d;
    const period = 2 * T;
    let r = d % period; if (r < 0) r += period;
    return r > T ? period - r : r;
  }

  // ================================================================== wedge / aperture / focal laws
  /**
   * Wedge geometry of a steering angle θ in the material: S-scan = Perspex wedge β 36° (shear), E-scan =
   * contact L probe (β 0, v_w = v_mat). Returns {valid, vW, vMat, beta, thetaW, thetaRel}.
   * @param {number} thetaDeg
   * @param {boolean} escan
   * @param {object} [material]  {vComp, vShear}
   */
  function wedgeOf(thetaDeg, escan, material) {
    const mat = material || materialOf(null);
    const vMat = escan ? mat.vComp : mat.vShear;
    const vW = escan ? mat.vComp : V_WEDGE;
    const beta = escan ? 0 : WEDGE_BETA;
    const s = vW * Math.sin(rad(thetaDeg)) / vMat;
    if (!(s < 1 && s > -1)) return { valid: false, vW, vMat, beta, thetaW: null, thetaRel: null };
    const thetaW = M.rad2deg(Math.asin(s));
    return { valid: true, vW, vMat, beta, thetaW, thetaRel: thetaW - beta };
  }

  /** Element centre positions along the array face (mm, centred). */
  function elementXs(n, pitch) {
    const out = [];
    for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * pitch);
    return out;
  }

  /**
   * Effective aperture of a column: {A, a, n, thetaW, thetaRel, footprint} or null past the critical angle.
   * a = A·cos(θ_rel)·cosθ/cos(θ_w) (§3.10).
   */
  function apertureOf(thetaDeg, arr, escan, material) {
    const n = escan ? Math.min(ESCAN_ELEMENTS, arr.elements) : arr.elements;
    const A = n * arr.pitch;
    const w = wedgeOf(thetaDeg, escan, material);
    if (!w.valid) return null;
    const a = A * Math.cos(rad(w.thetaRel)) * Math.cos(rad(thetaDeg)) / Math.max(0.05, Math.cos(rad(w.thetaW)));
    return { A, a: M.clamp(a, 1, 200), n, thetaW: w.thetaW, thetaRel: w.thetaRel, vW: w.vW, vMat: w.vMat, footprint: A * Math.cos(rad(w.beta)) };
  }

  /**
   * Focal law of one steering angle: {angle, delaysUs[], slope (µs/mm), valid, thetaW, thetaRel, vW, xEl[], F}.
   * @param {number} thetaDeg  steering angle in the material
   * @param {{escan?:boolean, state?:object, elements?:number, pitch?:number, focusDepth?:number|null, material?:object}} [opts]
   */
  function focalLaw(thetaDeg, opts) {
    const o = opts || {};
    const state = o.state || UT.state;
    const arr = arrayOf(state);
    const escan = !!o.escan;
    const elements = clampInt(o.elements === undefined ? arr.elements : o.elements, 1, 128, 16);
    const pitch = clampNum(o.pitch === undefined ? arr.pitch : o.pitch, 0.1, 10, 1);
    const n = escan ? Math.min(ESCAN_ELEMENTS, elements) : elements;
    const mat = o.material || materialOf(state && state.specimen);
    const theta = clampNum(thetaDeg, -89, 89, 0);
    const xs = elementXs(n, pitch);
    const w = wedgeOf(theta, escan, mat);
    if (!w.valid) return { angle: theta, delaysUs: xs.map(function () { return 0; }), slope: 0, valid: false, thetaW: null, thetaRel: null, vW: w.vW, xEl: xs, F: null };
    const sinRel = Math.sin(rad(w.thetaRel));
    const slope = Math.abs(sinRel) / w.vW;
    const fdRaw = o.focusDepth === undefined ? arr.focusDepth : o.focusDepth;
    const Fd = Number.isFinite(+fdRaw) && +fdRaw > 0 ? +fdRaw : null;
    let delays, F = null;
    if (Fd !== null) {
      F = Fd / Math.max(0.05, Math.cos(rad(theta)));
      const dist = xs.map(function (x) { return Math.sqrt(Math.max(0, F * F + x * x - 2 * F * x * sinRel)); });
      const mx = Math.max.apply(null, dist);
      // SPEC-v2 §3.10: τ_i = (max(d) − d_i)/v_w — the delays are travel times in the WEDGE medium,
      // so the focused law tends to the pure steering law as F → ∞ (continuous focus on/off).
      delays = dist.map(function (d) { return (mx - d) / w.vW; });
    } else {
      delays = xs.map(function (x) { return x * sinRel / w.vW; });
      const mn = Math.min.apply(null, delays);
      delays = delays.map(function (v) { return v - mn; });
    }
    delays = delays.map(function (v) { return v < 0 ? 0 : v; });
    return { angle: theta, delaysUs: delays, slope, valid: true, thetaW: w.thetaW, thetaRel: w.thetaRel, vW: w.vW, xEl: xs, F };
  }

  /**
   * Focal laws of the whole sweep (one per angle; the E-scan law is appended as `escan`).
   * @param {object} state
   * @returns {object[]} [{angle, delaysUs, slope, valid, …}] with .escan = the E-scan law
   */
  function focalLaws(state) {
    const s = state || UT.state;
    const sweep = sweepOf(s);
    const laws = sweep.angles.map(function (a) { return focalLaw(a, { state: s }); });
    laws.escan = focalLaw(arrayOf(s).escanAngle, { state: s, escan: true });
    return laws;
  }

  // ================================================================== tracing
  /** Probe patch of one column (S-scan angle θ, or E-scan sub-aperture at xOff) — null past the critical angle. */
  function columnProbe(state, thetaDeg, xOff, escan) {
    const probe = state.probe || {};
    const arr = arrayOf(state);
    const mat = materialOf(state.specimen);
    const ap = apertureOf(thetaDeg, arr, escan, mat);
    if (!ap) return null;
    const focus = arr.focusDepth !== null ? { on: true, F: M.clamp(arr.focusDepth / Math.max(0.05, Math.cos(rad(thetaDeg))), 10, 150) } : { on: false, F: 30 };
    return Object.assign({}, probe, {
      angle: thetaDeg, method: 'pe', mode: escan ? 'comp' : 'shear', crystal: 'single',
      freq: arr.freq, diameter: ap.a, crystalDims: { a: ap.a, b: CRYSTAL_B, shape: 'rect' }, libId: PA_LIB_ID,
      wedgeVel: escan ? mat.vComp : V_WEDGE, focus,
      x: (probe.x || 0) + (xOff || 0), paFrom: probe.paFrom, paTo: probe.paTo, paStep: probe.paStep,
    });
  }

  function traceOptsFor(state, spec, p, maxPath) {
    let base = null;
    if (UT.ascan && typeof UT.ascan.traceOpts === 'function') { try { base = UT.ascan.traceOpts(state, spec, p); } catch (e) { base = null; } }
    const inst = state.instrument || DEF_INST;
    const ph = (state.physics) || {};
    const o = Object.assign({
      maxPath: (inst.delay || 0) + (inst.range || 100),
      physics: { modeConv: ph.modeConv !== false, surfaceWave: ph.surfaceWave !== false, sideLobes: false, fanRays: 41 },
      damping: { tool: false, points: [] }, weldMaterial: (state.weldOpts && state.weldOpts.weldMaterial) || 'same', transferLossDb: 0,
    }, base || {});
    o.fanCount = FAN_COUNT;
    o.maxLegs = Math.min(MAX_LEGS, ((state.display && state.display.skips) || MAX_LEGS));
    o.physics = Object.assign({}, o.physics, { sideLobes: false });
    if (Number.isFinite(maxPath)) o.maxPath = maxPath;
    return o;
  }

  /** Trace one column: {derived, echoes (raw tracer echoes)}. */
  function traceColumn(state, spec, p, defects, opts) {
    const derived = UT.probe.derive(p, spec);
    let rays = null;
    if (spec && UT.rays && typeof UT.rays.trace === 'function') {
      try { rays = UT.rays.trace({ specimen: spec, probe: p, derived, display: Object.assign({}, state.display || {}, { skips: opts.maxLegs }), defects, opts }); }
      catch (e) { if (!traceErrorLogged) { traceErrorLogged = true; console.error('[UT.pa] rays.trace failed', e); } rays = null; }
    }
    return { derived, echoes: (rays && rays.echoes) || [] };
  }

  /** Column envelope samples (% FSH vs TRUE path over [delay, delay + range]) — SPEC NOTE 6. */
  function columnSamples(echoes, derived, inst) {
    const n = COL_SAMPLES;
    const out = new Float32Array(n);
    const delay = (inst && inst.delay) || 0, range = (inst && inst.range) || 100;
    const dp = range / (n - 1);
    const sig = Math.max(sigmaOf(derived, inst), 1.5 * dp);
    for (const e of echoes) {
      const pct = e.ampPct;
      if (!(pct > 0.5) || !Number.isFinite(e.path)) continue;
      const i0 = Math.max(0, Math.floor((e.path - 3 * sig - delay) / dp));
      const i1 = Math.min(n - 1, Math.ceil((e.path + 3 * sig - delay) / dp));
      for (let i = i0; i <= i1; i++) { const r = (delay + i * dp - e.path) / sig; out[i] += pct * Math.exp(-r * r); }
    }
    for (let i = 0; i < n; i++) if (out[i] > CLIP_PCT) out[i] = CLIP_PCT;
    return out;
  }

  // ================================================================== per-angle TCG (SPEC NOTE 5)
  const tcgCache = { key: null, table: null };

  function refBlockOf(state) {
    const spec = state.specimen;
    if (spec && spec.id === 'dac' && spec.T > 0 && spec.holes && spec.holes.length >= 2) return spec;
    if (!(UT.specimens && typeof UT.specimens.dacBlock === 'function')) return null;
    const T = state.weldOpts && state.weldOpts.T >= 10 ? state.weldOpts.T : 40;
    const matKey = materialOf(spec).key || 'carbon';
    try { return UT.specimens.dacBlock({ T, material: matKey }); } catch (e) { return null; }
  }

  /**
   * Per-angle gain table (dB ≥ 0) flattening the DAC-block T/2 SDH response across the sweep.
   * @param {object} state
   * @param {number[]} angles
   * @returns {number[]}
   */
  function tcgTable(state, angles) {
    const arr = arrayOf(state);
    const block = refBlockOf(state);
    const zero = angles.map(function () { return 0; });
    if (!block || !(UT.rays && UT.rays.trace)) return zero;
    const hole = block.holes.reduce(function (best, h) { return (!best || Math.abs(h.y - block.T / 2) < Math.abs(best.y - block.T / 2)) ? h : best; }, null);
    if (!hole) return zero;
    const ph = state.physics || {};
    const key = JSON.stringify([angles, arr.elements, arr.pitch, arr.freq, arr.focusDepth, block.T, hole.x, hole.y, (block.material && block.material.key) || 'carbon', ph.modeConv !== false, ph.fanRays]);
    if (tcgCache.key === key && tcgCache.table) return tcgCache.table;
    const raw = angles.map(function (theta) {
      const x = hole.x + hole.y * Math.tan(rad(theta));
      const st = Object.assign({}, state, { specimen: block, probe: Object.assign({}, state.probe, { x, z: (block.L || 100) / 2, side: 1, skew: 0, surface: 'chord' }), defects: [], damping: { tool: false, points: [] } });
      const p = columnProbe(st, theta, 0, false);
      if (!p) return null;
      const want = hole.y / Math.max(0.05, Math.cos(rad(theta)));
      const opts = traceOptsFor(st, block, p, Math.max(want * 1.5 + 20, 60));
      const res = traceColumn(st, block, p, [], opts);
      let best = 0;
      for (const e of res.echoes) {
        if (e.kind !== 'sdh' || Math.abs(e.path - want) > 3) continue;
        const a = Number.isFinite(e.ampNoZ) ? e.ampNoZ : e.amp;
        if (a > best) best = a;
      }
      return best > 0 ? best : null;
    });
    let mx = 0;
    for (const a of raw) if (a !== null && a > mx) mx = a;
    const table = raw.map(function (a) { return a === null || !(mx > 0) ? null : M.clamp(20 * Math.log10(mx / a), 0, TCG_MAX_DB); });
    for (let i = 0; i < table.length; i++) {
      if (table[i] !== null) continue;
      let j = 1, v = null;
      while (v === null && (i - j >= 0 || i + j < table.length)) { if (i - j >= 0 && table[i - j] !== null) v = table[i - j]; else if (i + j < table.length && table[i + j] !== null) v = table[i + j]; j++; }
      table[i] = v === null ? 0 : v;
    }
    tcgCache.key = key; tcgCache.table = table;
    return table;
  }

  // ================================================================== S-scan / E-scan
  function selectedIndex(angles, state) {
    const arr = arrayOf(state);
    const want = arr.angle !== null ? arr.angle : ((state.probe && state.probe.angle) || 0);
    let bi = 0;
    for (let i = 1; i < angles.length; i++) if (Math.abs(angles[i] - want) < Math.abs(angles[bi] - want)) bi = i;
    return bi;
  }

  function mapColumn(raw, derived, inst, gainDb, extra) {
    const lin = gainDb ? M.dB2lin(gainDb) : 1;
    const echoes = raw.map(function (e) {
      const amp = (Number.isFinite(e.amp) ? e.amp : 0) * lin;
      const ampNoZ = (Number.isFinite(e.ampNoZ) ? e.ampNoZ : (Number.isFinite(e.amp) ? e.amp : 0)) * lin;
      return Object.assign({}, e, extra, { amp, ampNoZ, ampPct: ampPctOf(amp, inst, derived, e.path), ampPctNoZ: ampPctOf(ampNoZ, inst, derived, e.path) });
    });
    echoes.sort(function (a, b) { return a.path - b.path; });
    return echoes;
  }

  /**
   * Sectorial scan: one traced column per sweep angle.
   * @param {object} state  UT.state-like
   * @returns {{angles:number[], columns:{angle:number, echoes:object[], samples:Float32Array, valid:boolean, tcgDb:number}[], selected:number, maxPath:number, T:number, delay:number, range:number, side:number, tcgDb:number[]}}
   */
  function sscan(state) {
    const s = state || UT.state;
    const spec = s.specimen;
    const inst = s.instrument || DEF_INST;
    const sweep = sweepOf(s);
    const angles = sweep.angles;
    const arr = arrayOf(s);
    const delay = inst.delay || 0, range = inst.range || 100;
    const maxPath = delay + range;
    const tcg = arr.tcg && spec ? tcgTable(s, angles) : angles.map(function () { return 0; });
    const defects = visibleDefects(s);
    const columns = angles.map(function (theta, i) {
      const p = spec ? columnProbe(s, theta, 0, false) : null;
      if (!p) return { angle: theta, echoes: [], samples: new Float32Array(COL_SAMPLES), valid: false, tcgDb: 0, aperture: null, nearField: null };
      const res = traceColumn(s, spec, p, defects, traceOptsFor(s, spec, p, maxPath));
      const echoes = mapColumn(res.echoes, res.derived, inst, tcg[i], { angle: theta });
      return { angle: theta, echoes, samples: columnSamples(echoes, res.derived, inst), valid: true, tcgDb: tcg[i], aperture: res.derived.crystalA, nearField: res.derived.nearField };
    });
    return { angles, columns, selected: selectedIndex(angles, s), maxPath, T: spec ? (spec.T || 0) : 0, delay, range, side: (s.probe && s.probe.side) || 1, tcgDb: tcg, from: sweep.from, to: sweep.to, step: sweep.step };
  }

  /**
   * Electronic (linear) scan at pa.escanAngle: an 8-element aperture sliding across the array.
   * @param {object} state
   * @returns {{angle:number, columns:{xOff:number, index:number, echoes:object[], samples:Float32Array, valid:boolean}[], maxPath:number, T:number, delay:number, range:number, side:number, sub:number, pitch:number, elements:number}}
   */
  function escan(state) {
    const s = state || UT.state;
    const spec = s.specimen;
    const inst = s.instrument || DEF_INST;
    const arr = arrayOf(s);
    const theta = arr.escanAngle;
    const n = arr.elements, sub = Math.min(ESCAN_ELEMENTS, n);
    const delay = inst.delay || 0, range = inst.range || 100;
    const maxPath = delay + range;
    const defects = visibleDefects(s);
    const columns = [];
    for (let j = 0; j <= n - sub; j++) {
      const xOff = (j + (sub - 1) / 2 - (n - 1) / 2) * arr.pitch;
      const p = spec ? columnProbe(s, theta, xOff, true) : null;
      if (!p) { columns.push({ xOff, index: j, echoes: [], samples: new Float32Array(COL_SAMPLES), valid: false }); continue; }
      const res = traceColumn(s, spec, p, defects, traceOptsFor(s, spec, p, maxPath));
      const echoes = mapColumn(res.echoes, res.derived, inst, 0, { angle: theta, xOff });
      columns.push({ xOff, index: j, echoes, samples: columnSamples(echoes, res.derived, inst), valid: true });
    }
    return { angle: theta, columns, maxPath, T: spec ? (spec.T || 0) : 0, delay, range, side: (s.probe && s.probe.side) || 1, sub, pitch: arr.pitch, elements: n };
  }

  /**
   * Frame contribution for probe.method === 'pa' (called by 40's compute()).
   * @param {object} state
   * @returns {{view:string, sscan:object|null, escan:object|null, focalLaws:object, aperture:{x0:number, x1:number, A:number, elements:number, pitch:number}, selected:{angle:number, index:number}|null}}
   */
  function compute(state) {
    const s = state || UT.state;
    const arr = arrayOf(s);
    const ss = sscan(s);
    const es = arr.view === 'E' ? escan(s) : null;
    const selAngle = ss.angles.length ? ss.angles[ss.selected] : null;
    const law = arr.view === 'E' ? focalLaw(arr.escanAngle, { state: s, escan: true }) : focalLaw(selAngle === null ? 60 : selAngle, { state: s });
    const A = arr.elements * arr.pitch;
    const fp = A * Math.cos(rad(WEDGE_BETA));
    const px = (s.probe && s.probe.x) || 0;
    return {
      view: arr.view, sscan: ss, escan: es,
      focalLaws: { angle: law.angle, delaysUs: law.delaysUs, slope: law.slope, valid: law.valid, thetaW: law.thetaW, thetaRel: law.thetaRel, escan: arr.view === 'E' },
      aperture: { x0: px - fp / 2, x1: px + fp / 2, A, elements: arr.elements, pitch: arr.pitch, footprint: fp },
      selected: selAngle === null ? null : { angle: selAngle, index: ss.selected },
    };
  }

  // ================================================================== encoded C-scan (SPEC NOTE 7)
  function prepareScan(state) {
    const s = state;
    if (!s || !s.specimen) return null;
    if (!(UT.rays && typeof UT.rays.zFactor === 'function')) return null;
    const ss = sscan(s);
    const cols = ss.columns.map(function (c) {
      const sin = Math.sin(rad(c.angle));
      const echoes = c.echoes.map(function (e) {
        return { e, sin, zDep: e.defectId !== undefined || (Array.isArray(e.zs) && e.zs.length > 0), pct: e.ampPct, pctNoZ: e.ampPctNoZ };
      });
      return { angle: c.angle, echoes };
    });
    return { spec: s.specimen, defects: visibleDefects(s), skew: (s.probe && s.probe.skew) || 0, cols, ss };
  }

  function scanShell(state, ss) {
    const spec = state.specimen;
    const L = Math.max(1, Math.round(spec.L || 300));
    const step = Math.max(1, Math.round(L / 400));
    const n = Math.floor(L / step) + 1;
    const aMax = ss.angles.length ? Math.max.apply(null, ss.angles) : 70;
    const latMax = Math.max(1, ss.maxPath * Math.sin(rad(aMax)));
    const map = new Float32Array(n * X_BINS);
    map.fill(NaN);
    return { z0: 0, z1: (n - 1) * step, step, n, xBins: X_BINS, latMax, map, x: state.probe.x, angles: ss.angles.slice(), filled: 0, done: false, gain: (state.instrument || DEF_INST).gain };
  }

  function scanColumn(cache, sc, k) {
    const base = k * sc.xBins;
    for (let b = 0; b < sc.xBins; b++) sc.map[base + b] = 0;
    const z = sc.z0 + k * sc.step;
    for (const col of cache.cols) {
      for (const it of col.echoes) {
        let pct = it.pct;
        if (it.zDep) pct = it.pctNoZ * UT.rays.zFactor(it.e, z, cache.skew, cache.defects, cache.spec);
        if (!(pct > 0)) continue;
        const lat = it.e.path * it.sin;
        const b = M.clamp(Math.floor(lat / sc.latMax * sc.xBins), 0, sc.xBins - 1);
        if (pct > sc.map[base + b]) sc.map[base + b] = pct;
      }
    }
    if (k + 1 > sc.filled) sc.filled = k + 1;
  }

  /**
   * Synchronous encoded C-scan z = 0 … L (PURE — the caller stores it via UT.setIn('pa', {scan})).
   * @param {object} state
   * @param {{sync?:boolean}} [opts]
   * @returns {{z0:number, z1:number, step:number, n:number, xBins:number, latMax:number, map:Float32Array}|null}
   */
  function runScan(state, opts) {   // eslint-disable-line no-unused-vars
    const s = state || UT.state;
    const cache = prepareScan(s);
    if (!cache) return null;
    const sc = scanShell(s, cache.ss);
    for (let k = 0; k < sc.n; k++) scanColumn(cache, sc, k);
    sc.done = true;
    return sc;
  }

  let anim = null;   // {sc, cache, i, handle, z0Probe}
  function raf(fn) { return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 16); }
  function cancelRaf(h) { if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h); else clearTimeout(h); }
  function isScanning() { return !!anim; }
  function reducedMotion() {
    try { return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  }

  /**
   * Animated C-scan (8 columns per frame): partial maps stored via UT.setIn('pa', {scan}); the probe z follows
   * the scan head and is restored at the end; emits 'scan:progress' {kind:'pa', i, n}.
   * @returns {boolean} true when a scan was started
   */
  function startScan() {
    const state = UT.state;
    if (!state.specimen) return false;
    stopScan(true);
    if (reducedMotion()) {
      const full = runScan(state);
      if (!full) return false;
      UT.setIn('pa', { scan: full });
      UT.bus.emit('scan:progress', { kind: 'pa', i: full.n, n: full.n });
      return true;
    }
    const cache = prepareScan(state);
    if (!cache) return false;
    const sc = scanShell(state, cache.ss);
    anim = { sc, cache, i: 0, handle: null, z0Probe: state.probe.z };
    UT.setIn('pa', { scan: sc }, { noRender: true });
    const stepFrame = function () {
      if (!anim || anim.sc !== sc) return;
      for (let k = 0; k < COLS_PER_FRAME && anim.i < sc.n; k++, anim.i++) scanColumn(cache, sc, anim.i);
      const finished = anim.i >= sc.n;
      sc.done = finished;
      const headZ = sc.z0 + Math.min(anim.i, sc.n - 1) * sc.step;
      UT.setIn('probe', { z: finished ? anim.z0Probe : headZ }, { noRender: true });
      UT.setIn('pa', { scan: sc });
      UT.bus.emit('scan:progress', { kind: 'pa', i: anim.i, n: sc.n });
      if (finished) { anim = null; return; }
      anim.handle = raf(stepFrame);
    };
    anim.handle = raf(stepFrame);
    return true;
  }

  /**
   * Stop the animated scan (keeps the columns already built, restores the probe z).
   * @param {boolean} [silent]  no re-render
   */
  function stopScan(silent) {
    if (!anim) return false;
    if (anim.handle !== null) cancelRaf(anim.handle);
    const z0 = anim.z0Probe;
    anim = null;
    if (Number.isFinite(z0)) UT.setIn('probe', { z: z0 }, { noRender: !!silent });
    else if (!silent) UT.requestRender();
    return true;
  }

  // ================================================================== state writers (SPEC NOTE 1, 2)
  /**
   * Write the sweep to probe.paFrom/paTo/paStep AND the pa.from/to/step mirrors in ONE UT.set.
   * @param {{from?:number, to?:number, step?:number}} patch
   */
  function setSweep(patch) {
    const s = UT.state;
    const probe = s.probe, pa = Object.assign({}, DEF_PA, s.pa || {});
    const q = patch || {};
    let from = clampNum(q.from === undefined ? probe.paFrom : q.from, 0, 89, 40);
    let to = clampNum(q.to === undefined ? probe.paTo : q.to, 0, 89, 70);
    let step = clampNum(q.step === undefined ? probe.paStep : q.step, 0.25, 10, 1);
    if (from > to) { const t = from; from = to; to = t; }
    while ((to - from) / step + 1 > MAX_ANGLES) step *= 2;
    UT.set({ probe: Object.assign({}, probe, { paFrom: from, paTo: to, paStep: step }), pa: Object.assign({}, pa, { from, to, step }) });
  }

  /** Coerce and write array / view fields into state.pa (elements, pitch, freq, focusDepth, escanAngle, tcg, view, angle). */
  function setArray(patch) {
    const q = patch || {};
    const cur = Object.assign({}, DEF_PA, UT.state.pa || {});
    const out = {};
    if (q.elements !== undefined) out.elements = clampInt(q.elements, 1, 128, cur.elements);
    if (q.pitch !== undefined) out.pitch = clampNum(q.pitch, 0.1, 10, cur.pitch);
    if (q.freq !== undefined) out.freq = clampNum(q.freq, 0.5, 20, cur.freq);
    if (q.focusDepth !== undefined) { const fd = +q.focusDepth; out.focusDepth = Number.isFinite(fd) && fd > 0 ? fd : null; }
    if (q.escanAngle !== undefined) out.escanAngle = clampNum(q.escanAngle, 0, 89, cur.escanAngle);
    if (q.tcg !== undefined) out.tcg = !!q.tcg;
    if (q.view !== undefined && VIEWS.indexOf(q.view) >= 0) out.view = q.view;
    if (q.angle !== undefined) { const a = +q.angle; out.angle = Number.isFinite(a) ? M.clamp(a, 0, 89) : null; }
    if (q.scan !== undefined) out.scan = q.scan;
    UT.setIn('pa', out);
  }

  /** Make the live state a PA state: probe.method 'pa', sweep mirrors consistent (SPEC NOTE 1). One UT.set. */
  function ensurePa(opts) {
    const s = UT.state;
    const pa = Object.assign({}, DEF_PA, s.pa || {});
    let probe = s.probe;
    let changed = false;
    if (probe.method !== 'pa') { probe = Object.assign({}, probe, { method: 'pa' }); changed = true; }
    const v1Default = probe.paFrom === 40 && probe.paTo === 70 && probe.paStep === 1;
    const mirrorDiffers = pa.from !== probe.paFrom || pa.to !== probe.paTo || pa.step !== probe.paStep;
    const paPatch = {};
    if (mirrorDiffers) {
      if (v1Default && Number.isFinite(+pa.from) && Number.isFinite(+pa.to) && Number.isFinite(+pa.step)) {
        probe = Object.assign({}, probe, { paFrom: clampNum(pa.from, 0, 89, 40), paTo: clampNum(pa.to, 0, 89, 70), paStep: clampNum(pa.step, 0.25, 10, 1) });
      } else { paPatch.from = probe.paFrom; paPatch.to = probe.paTo; paPatch.step = probe.paStep; }
      changed = true;
    }
    if (!changed) return false;
    const patch = { probe };
    if (Object.keys(paPatch).length) patch.pa = Object.assign({}, pa, paPatch);
    UT.set(patch, Object.assign({ noRender: true }, opts || {}));
    return true;
  }

  // ================================================================== panel (window 'pa')
  const css = [
    '.win[data-win=pa] .win-body{padding:6px;background:#1c1f26;color:#e8e8e8;font:12px "Segoe UI",Arial,sans-serif}',
    // width:100% (not a fixed 328px) so the panel tracks the body content box in BOTH skins: Options ▸ High
    // contrast gives .win a 2px border, which shrank the content box to 326px and made 328px overflow (scrollbar).
    '.win[data-win=pa] .pa-panel{width:100%;display:flex;flex-direction:column;gap:5px}',
    '.win[data-win=pa] .pa-tabs{display:flex;gap:4px;align-items:center}',
    '.win[data-win=pa] .pa-tab{min-width:34px;font-weight:bold}',
    '.win[data-win=pa] .pa-tab.active{background:#ff8800;color:#000;border-color:#ffc070 #804000 #804000 #ffc070}',
    '.win[data-win=pa] .pa-tab-title{margin-left:auto;color:#ffb060;white-space:nowrap}',
    '.win[data-win=pa] .pa-image{display:block;width:320px;height:200px;background:#000;border:1px solid #444;touch-action:none;cursor:crosshair}',
    '.win[data-win=pa] .pa-image:focus-visible{outline:2px solid #ff8800}',
    '.win[data-win=pa] .pa-law{display:block;width:320px;height:64px;background:#0b0d12;border:1px solid #444}',
    '.win[data-win=pa] .pa-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 8px}',
    '.win[data-win=pa] .pa-grid .fld{margin:2px 0}',
    '.win[data-win=pa] .pa-grid .fld-label{flex:0 0 96px;color:#d0d0d0;font-size:11px;line-height:1.1}',
    '.win[data-win=pa] .pa-grid .fld-input{width:52px;min-width:0;padding:1px 3px;font-size:11px;background:#fff;color:#000;border:1px solid #888}',
    '.win[data-win=pa] .pa-grid .fld-input[type=checkbox]{width:14px}',
    '.win[data-win=pa] .pa-actions{margin-top:2px;gap:6px}',
    '.win[data-win=pa] .pa-run.running{background:#ffe08a}',
    '.win[data-win=pa] .pa-readout{color:#9fd4ff;font:11px "Segoe UI",Arial,sans-serif;white-space:normal;min-height:14px}',
    '.win[data-win=pa] .pa-hint{color:#aaa;font-size:11px}',
  ].join('\n');

  const ui = { win: null, image: null, law: null, inputs: {}, tabs: [], runBtn: null, readout: null, subscribed: false, drag: null, sector: null, closing: false };
  const VIEW_TITLES = { S: 'Sectorial scan', E: 'Electronic scan', C: 'C-scan (encoded)' };

  function st() { return UT.state; }
  function t(key, params) { return UT.i18n.t(key, params); }

  /** Colour of an amplitude (% FSH): UT.aut's 7-band map when present, else a compatible fallback. */
  function colourFor(pct) {
    if (UT.aut && typeof UT.aut.colourFor === 'function') { try { return UT.aut.colourFor(pct, false); } catch (e) { /* fall through */ } }
    if (!Number.isFinite(pct)) return 'rgba(0,0,0,0)';
    return pct >= 100 ? '#ffffff' : pct >= 80 ? '#ff0000' : pct >= 60 ? '#ff00ff' : pct >= 40 ? '#ffff00' : pct >= 25 ? '#00c000' : pct >= 10 ? '#00ffff' : '#0000ff';
  }

  function angleFromPointer(px, py) {
    const sec = ui.sector;
    if (!sec) return null;
    const dx = (px - sec.ox) * -sec.side, dy = py - sec.oy;
    if (dy <= 0.5) return null;
    return M.clamp(M.rad2deg(Math.atan2(dx, dy)), sec.a0, sec.a1);
  }

  function onImagePointer(e) {
    if (!ui.image) return;
    const s = st();
    if (arrayOf(s).view !== 'S') return;
    const p = UT.dom.localPos(e, ui.image);
    const a = angleFromPointer(p.x, p.y);
    if (a === null) return;
    const step = sweepOf(s).step || 1;
    const snapped = Math.round(a / step) * step;
    if (s.pa && Math.abs((+s.pa.angle) - snapped) < 1e-9) return;
    setArray({ angle: +snapped.toFixed(2) });
  }

  function stepAngle(dir) {
    const s = st();
    const sw = sweepOf(s);
    const ss = { angles: sw.angles };
    const i = selectedIndex(ss.angles, s);
    const j = M.clamp(i + dir, 0, ss.angles.length - 1);
    setArray({ angle: ss.angles[j] });
  }

  function numField(label, key, opts) {
    const o = opts || {};
    const f = UT.dom.field(label, { type: 'number', value: o.value, min: o.min, max: o.max, step: o.step, title: o.title ? t(o.title) : null, onchange: o.onchange });
    ui.inputs[key] = f.input;
    return f;
  }

  function buildContent() {
    const h = UT.dom.h;
    const s = st();
    const arr = arrayOf(s), sw = sweepOf(s);
    ui.inputs = {};
    const tabTitle = h('span', { class: 'pa-tab-title', dataset: { i18n: VIEW_TITLES[arr.view] } }, t(VIEW_TITLES[arr.view]));
    ui.tabTitle = tabTitle;
    const tabs = h('div', { class: 'pa-tabs', role: 'tablist' }, VIEWS.map(function (v) {
      return h('button', { class: 'btn small pa-tab' + (v === arr.view ? ' active' : ''), type: 'button', role: 'tab', 'aria-selected': v === arr.view ? 'true' : 'false', dataset: { view: v }, title: t(VIEW_TITLES[v]), onclick: function () { setArray({ view: v }); } }, v);
    }).concat([tabTitle]));
    ui.tabs = Array.prototype.slice.call(tabs.querySelectorAll('.pa-tab'));
    const image = h('canvas', { id: 'cv-pa-image', class: 'pa-image', width: IMG.w, height: IMG.h, tabindex: 0, 'aria-label': t('Phased array image (click to select the angle)') });
    image.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      ui.drag = true;
      try { image.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      onImagePointer(e);
      e.preventDefault();
    });
    image.addEventListener('pointermove', function (e) { if (ui.drag) onImagePointer(e); });
    const endDrag = function () { ui.drag = false; };
    image.addEventListener('pointerup', endDrag);
    image.addEventListener('pointercancel', endDrag);
    image.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { stepAngle(-1); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { stepAngle(1); e.preventDefault(); }
    });
    ui.image = image;
    const law = h('canvas', { id: 'cv-pa-law', class: 'pa-law', width: LAW.w, height: LAW.h, 'aria-label': t('Focal law delays') });
    ui.law = law;
    const grid = h('div', { class: 'pa-grid' }, [
      numField('Elements', 'elements', { value: arr.elements, min: 1, max: 128, step: 1, title: 'Number of array elements', onchange: function (v) { setArray({ elements: v }); } }),
      numField('From (°)', 'from', { value: sw.from, min: 0, max: 89, step: 1, title: 'First steering angle of the sweep', onchange: function (v) { setSweep({ from: v }); } }),
      numField('Pitch (mm)', 'pitch', { value: arr.pitch, min: 0.1, max: 10, step: 0.1, title: 'Element pitch', onchange: function (v) { setArray({ pitch: v }); } }),
      numField('To (°)', 'to', { value: sw.to, min: 0, max: 89, step: 1, title: 'Last steering angle of the sweep', onchange: function (v) { setSweep({ to: v }); } }),
      numField('Frequency (MHz)', 'freq', { value: arr.freq, min: 0.5, max: 20, step: 0.5, title: 'Array centre frequency', onchange: function (v) { setArray({ freq: v }); } }),
      numField('Step (°)', 'step', { value: sw.step, min: 0.25, max: 10, step: 0.25, title: 'Angle step of the sweep', onchange: function (v) { setSweep({ step: v }); } }),
      numField('Focus depth (mm)', 'focusDepth', { value: arr.focusDepth === null ? 0 : arr.focusDepth, min: 0, max: 300, step: 1, title: 'Focus depth in the material (0 = unfocused; F ≤ near field)', onchange: function (v) { setArray({ focusDepth: v }); } }),
      numField('Selected angle (°)', 'angle', { value: sw.angles[selectedIndex(sw.angles, s)], min: 0, max: 89, step: sw.step, title: 'Angle whose A-scan is shown on the instrument', onchange: function (v) { setArray({ angle: v }); } }),
      numField('E-scan angle (°)', 'escanAngle', { value: arr.escanAngle, min: 0, max: 89, step: 1, title: 'Fixed steering angle of the electronic scan (contact L)', onchange: function (v) { setArray({ escanAngle: v }); } }),
      (function () { const f = UT.dom.field('Per-angle TCG', { type: 'checkbox', value: arr.tcg, title: t('Flatten the DAC-block SDH response across the sweep'), onchange: function (v) { setArray({ tcg: v }); } }); ui.inputs.tcg = f.input; return f; })(),
    ]);
    const runBtn = UT.dom.button('Run', function () { if (!isScanning()) startScan(); syncInputs(); }, { class: 'btn small pa-run', title: t('Encoded C-scan along the weld at the current probe x') });
    const stopBtn = UT.dom.button('Stop', function () { stopScan(); syncInputs(); }, { class: 'btn small' });
    const clearBtn = UT.dom.button('Clear', function () { stopScan(true); setArray({ scan: null }); }, { class: 'btn small' });
    ui.runBtn = runBtn;
    const readout = h('div', { class: 'pa-readout no-i18n', 'aria-live': 'polite' });
    ui.readout = readout;
    return h('div', { class: 'pa-panel' }, [tabs, image, law, grid, h('div', { class: 'btn-row left pa-actions' }, [runBtn, stopBtn, clearBtn]), readout]);
  }

  function buildWindow() {
    ui.win = UT.dom.win({
      name: 'pa', title: 'Phased array', x: 930, y: 110, w: 342,
      content: buildContent(),
      onShow: function () { UT.requestRender(); },
      onClose: function () { leave(); },
    });
  }

  function leave() {
    if (ui.closing) return;
    ui.closing = true;
    try {
      stopScan(true);
      if (st().probe.method === 'pa') UT.setIn('probe', { method: 'pe' });
      else UT.requestRender();
    } finally { ui.closing = false; }
  }

  function syncInputs() {
    if (!ui.win) return;
    const s = st();
    const arr = arrayOf(s), sw = sweepOf(s);
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const set = function (key, v) { const el = ui.inputs[key]; if (el && active !== el && String(el.value) !== String(v)) el.value = v; };
    set('elements', arr.elements); set('pitch', arr.pitch); set('freq', arr.freq);
    set('from', sw.from); set('to', sw.to); set('step', sw.step);
    set('focusDepth', arr.focusDepth === null ? 0 : arr.focusDepth);
    set('escanAngle', arr.escanAngle);
    set('angle', sw.angles[selectedIndex(sw.angles, s)]);
    if (ui.inputs.tcg && ui.inputs.tcg.checked !== arr.tcg) ui.inputs.tcg.checked = arr.tcg;
    ui.tabs.forEach(function (b) { const on = b.dataset.view === arr.view; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (ui.tabTitle) { const key = VIEW_TITLES[arr.view]; if (ui.tabTitle.dataset.i18n !== key) { ui.tabTitle.dataset.i18n = key; ui.tabTitle.textContent = t(key); } }
    if (ui.runBtn) ui.runBtn.classList.toggle('running', isScanning());
  }

  // ------------------------------------------------------------------ drawing
  function drawSector(ctx, ss, s, W, H) {
    if (!ss || !ss.columns.length) { ui.sector = null; hint(ctx, W, H, t('no data')); return; }
    const angles = ss.angles;
    const a0 = Math.min.apply(null, angles), a1 = Math.max.apply(null, angles);
    const maxPath = ss.maxPath || 100;
    const T = ss.T || 20;
    const depthMax = Math.min(maxPath, Math.max(T * 1.05, maxPath * Math.cos(rad(a1)) * 1.05));
    const xMax = maxPath * Math.sin(rad(a1)) * 1.02;
    const side = ss.side || 1;
    const mL = 22, mT = 14, mB = 16, mR = 6;
    const scale = Math.min((W - mL - mR) / Math.max(1, xMax), (H - mT - mB) / Math.max(1, depthMax));
    const ox = side > 0 ? W - mR : mL, oy = mT;
    const toX = function (lat) { return ox - side * lat * scale; };
    const toY = function (d) { return oy + d * scale; };
    ui.sector = { ox, oy, scale, side, a0, a1 };
    ctx.fillStyle = '#101830'; ctx.beginPath(); ctx.moveTo(ox, oy);
    for (let a = a0; a <= a1 + 1e-9; a += 1) ctx.lineTo(toX(maxPath * Math.sin(rad(a))), toY(maxPath * Math.cos(rad(a))));
    ctx.lineTo(toX(maxPath * Math.sin(rad(a1))), toY(maxPath * Math.cos(rad(a1))));
    ctx.closePath(); ctx.fill();
    const dp = (ss.range || 100) / (COL_SAMPLES - 1);
    const dAng = angles.length > 1 ? (a1 - a0) / (angles.length - 1) : 1;
    const colW = Math.max(1.5, maxPath * scale * rad(dAng) * 0.6);
    const cellH = Math.max(1.2, dp * scale * 1.1);
    for (const col of ss.columns) {
      const th = rad(col.angle), sn = Math.sin(th), cs = Math.cos(th);
      const smp = col.samples;
      if (!smp) continue;
      for (let i = 0; i < smp.length; i++) {
        const pct = smp[i];
        if (pct < 4) continue;
        const p = (ss.delay || 0) + i * dp;
        const x = toX(p * sn), y = toY(foldDepth(p * cs, T));
        ctx.fillStyle = colourFor(pct);
        ctx.fillRect(x - colW / 2, y - cellH / 2, colW, cellH);
      }
    }
    ctx.strokeStyle = '#4060a0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mL, toY(T) + 0.5); ctx.lineTo(W - mR, toY(T) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    const sel = ss.angles[ss.selected];
    if (Number.isFinite(sel)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(toX(maxPath * Math.sin(rad(sel))), toY(maxPath * Math.cos(rad(sel)))); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.fillStyle = '#d0d0d0'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let d = 0; d <= depthMax + 1e-9; d += depthMax > 60 ? 20 : 10) ctx.fillText(String(Math.round(d)), mL - 2, toY(d));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('S ' + a0.toFixed(0) + '°–' + a1.toFixed(0) + '°' + (arrayOf(s).tcg ? ' TCG' : ''), 2, 1);
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(xMax) + ' mm', W - 3, H - 11);
  }

  function drawEscan(ctx, es, s, W, H) {
    ui.sector = null;
    if (!es || !es.columns.length) { hint(ctx, W, H, t('no data')); return; }
    const T = es.T || 20;
    const side = es.side || 1;
    const th = rad(es.angle), sn = Math.sin(th), cs = Math.cos(th);
    const maxPath = es.maxPath || 100;
    const depthMax = Math.min(T * 1.05, Math.max(5, maxPath * cs));
    let latMin = Infinity, latMax = -Infinity;
    for (const c of es.columns) {
      latMin = Math.min(latMin, c.xOff, c.xOff - side * depthMax * Math.tan(th) * 1.2);
      latMax = Math.max(latMax, c.xOff, c.xOff - side * depthMax * Math.tan(th) * 1.2);
    }
    if (latMax - latMin < 20) { const m = (latMax + latMin) / 2; latMin = m - 10; latMax = m + 10; }
    const mL = 22, mT = 14, mB = 14, mR = 6;
    const sx = (W - mL - mR) / (latMax - latMin), sy = (H - mT - mB) / Math.max(1, depthMax);
    const toX = function (lat) { return mL + (lat - latMin) * sx; };
    const toY = function (d) { return mT + d * sy; };
    ctx.fillStyle = '#101830'; ctx.fillRect(mL, mT, W - mL - mR, H - mT - mB);
    const dp = (es.range || 100) / (COL_SAMPLES - 1);
    const colW = Math.max(1.5, es.pitch * sx * 0.9);
    const cellH = Math.max(1.2, dp * cs * sy * 1.1);
    for (const col of es.columns) {
      const smp = col.samples; if (!smp) continue;
      for (let i = 0; i < smp.length; i++) {
        const pct = smp[i]; if (pct < 4) continue;
        const p = (es.delay || 0) + i * dp;
        const d = p * cs;
        if (d > 2 * T + 1) continue;
        const x = toX(col.xOff - side * p * sn), y = toY(foldDepth(d, T));
        ctx.fillStyle = colourFor(pct);
        ctx.fillRect(x - colW / 2, y - cellH / 2, colW, cellH);
      }
    }
    ctx.strokeStyle = '#4060a0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mL, toY(T) + 0.5); ctx.lineTo(W - mR, toY(T) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#d0d0d0'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let d = 0; d <= depthMax + 1e-9; d += depthMax > 60 ? 20 : 10) ctx.fillText(String(Math.round(d)), mL - 2, toY(d));
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('E ' + es.angle.toFixed(0) + '° L · ' + es.columns.length + ' × ' + es.sub + ' el.', 2, 1);
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(latMin) + '', mL, H - 11); ctx.fillText(Math.round(latMax) + ' mm', W - mR - 12, H - 11);
  }

  function drawCscan(ctx, sc, s, W, H) {
    ui.sector = null;
    if (!sc || !sc.map || !(sc.n > 0)) { hint(ctx, W, H, t('no scan — press Run')); return; }
    const mL = 22, mT = 14, mB = 14, mR = 6;
    const iw = W - mL - mR, ih = H - mT - mB;
    const cw = iw / sc.n, ch = ih / sc.xBins;
    for (let k = 0; k < sc.n; k++) {
      for (let b = 0; b < sc.xBins; b++) {
        const v = sc.map[k * sc.xBins + b];
        ctx.fillStyle = Number.isFinite(v) ? colourFor(v) : '#202020';
        ctx.fillRect(mL + k * cw, mT + b * ch, cw + 0.5, ch + 0.5);
      }
    }
    const pz = s.probe && Number.isFinite(s.probe.z) ? s.probe.z : null;
    if (pz !== null && sc.step > 0) {
      const x = mL + M.clamp((pz - sc.z0) / sc.step, 0, sc.n - 1) * cw + cw / 2;
      ctx.strokeStyle = '#ff2020'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, mT); ctx.lineTo(x, mT + ih); ctx.stroke();
    }
    ctx.fillStyle = '#d0d0d0'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('0', mL - 2, mT + 4); ctx.fillText(String(Math.round(sc.latMax || 0)), mL - 2, mT + ih - 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('C  z 0–' + sc.z1 + ' mm · ' + (sc.done ? sc.n : sc.filled + '/' + sc.n) + ' col.', 2, 1);
    ctx.textAlign = 'center'; ctx.fillText('z', mL + iw / 2, H - 11);
  }

  function hint(ctx, W, H, text) {
    ctx.fillStyle = '#9a9a9a'; ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, W / 2, H / 2);
  }

  function drawImage(pa, s) {
    const cv = ui.image; if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, IMG.w, IMG.h);
    const W = IMG.w, H = IMG.h;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    const view = arrayOf(s).view;
    if (!pa) { ui.sector = null; hint(ctx, W, H, t('Phased array probe is off (Probes ▸ Phased Array Probe)')); ctx.restore(); return; }
    if (view === 'S') drawSector(ctx, pa.sscan, s, W, H);
    else if (view === 'E') drawEscan(ctx, pa.escan, s, W, H);
    else drawCscan(ctx, s.pa && s.pa.scan, s, W, H);
    ctx.restore();
  }

  function drawLaw(pa, s) {
    const cv = ui.law; if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, LAW.w, LAW.h);
    const W = LAW.w, H = LAW.h;
    ctx.save();
    ctx.fillStyle = '#0b0d12'; ctx.fillRect(0, 0, W, H);
    const law = pa && pa.focalLaws;
    const d = law && law.delaysUs;
    ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillStyle = '#d0d0d0';
    if (!d || !d.length) { ctx.fillText(t('Focal law'), 3, 2); ctx.restore(); return; }
    const mx = Math.max.apply(null, d);
    const mL = 4, mR = 4, mT = 13, mB = 3;
    const bw = (W - mL - mR) / d.length;
    for (let i = 0; i < d.length; i++) {
      const hgt = mx > 0 ? (H - mT - mB) * d[i] / mx : 0;
      ctx.fillStyle = law.valid ? '#ff8800' : '#606060';
      ctx.fillRect(mL + i * bw + 1, H - mB - hgt, Math.max(1, bw - 2), hgt);
    }
    ctx.fillStyle = '#d0d0d0';
    const txt = law.valid
      ? t('Focal law') + ' ' + (law.escan ? 'E ' : 'S ') + M.fmt(law.angle, 0) + '°  θw ' + M.fmt(law.thetaW, 1) + '°  ' + M.fmt(law.slope, 3) + ' µs/mm  max ' + M.fmt(mx, 2) + ' µs'
      : t('Focal law') + ' ' + M.fmt(law.angle, 0) + '°  ' + t('invalid (beyond the critical angle)');
    ctx.fillText(txt, 3, 2);
    ctx.restore();
  }

  function updateReadout(pa, s) {
    if (!ui.readout) return;
    let text = '';
    if (pa && pa.sscan && pa.sscan.columns.length) {
      const col = pa.sscan.columns[pa.sscan.selected];
      const law = pa.focalLaws;
      const parts = [t('Angle {a}°', { a: M.fmt(col.angle, 1) })];
      if (law && law.valid && !law.escan) parts.push('θw ' + M.fmt(law.thetaW, 1) + '°');
      if (col.aperture) parts.push(t('aperture {a} mm', { a: M.fmt(col.aperture, 1) }));
      if (col.nearField) parts.push('N ' + M.fmt(col.nearField, 0) + ' mm');
      if (arrayOf(s).tcg) parts.push('TCG +' + M.fmt(col.tcgDb, 1) + ' dB');
      const top = col.echoes.slice().sort(function (a, b) { return b.ampPct - a.ampPct; })[0];
      if (top) parts.push(t('{kind} at {p} mm, {pct} %', { kind: top.kind, p: M.fmt(top.path, 1), pct: Math.round(top.ampPct) }));
      text = parts.join(' · ');
    }
    if (ui.readout.textContent !== text) ui.readout.textContent = text;
  }

  const panel = {
    /** The 'pa' window api (null until first open()). */
    window: null,
    isOpen() { return !!(ui.win && ui.win.isOpen()); },
    /** Create (lazily) and show the window; switches the probe to the phased-array method. */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('pa', css);
      if (!ui.win) buildWindow();
      panel.window = ui.win;
      if (!ui.subscribed) {
        ui.subscribed = true;
        UT.bus.on('render', function (frame) { panel.draw(frame); });
        UT.bus.on('lang', function () { if (ui.win) { ui.win.setContent(buildContent()); syncInputs(); UT.requestRender(); } });
      }
      ensurePa({ noRender: true });
      ui.win.show();
      syncInputs();
      UT.requestRender();
      return ui.win;
    },
    /** Hide the window (stops a running scan; the probe returns to pulse-echo). */
    close() {
      if (ui.win && ui.win.isOpen()) ui.win.close();
      return ui.win;
    },
    toggle() { return panel.isOpen() ? panel.close() : panel.open(); },
    /** Redraw the image / focal-law canvases from a frame (never writes state). */
    draw(frame) {
      if (!ui.win || !ui.win.isOpen()) return;
      const s = st();
      const pa = frame && frame.pa;
      drawImage(pa, s);
      drawLaw(pa, s);
      updateReadout(pa, s);
      syncInputs();
    },
  };

  // ================================================================== test API
  function echoRows(echoes) {
    return (echoes || []).map(function (e) {
      return { kind: e.kind, path: e.path, ampPct: e.ampPct, leg: e.leg, x: e.x, y: e.y, tUs: Number.isFinite(e.tUs) ? e.tUs : null, mode: e.mode || null, angle: e.angle, defectId: e.defectId, tag: e.tag };
    });
  }
  /** UT.test.pa.sscan(): run one S-scan sweep on the current focal law. @returns {{angles:number[], selected:number, maxPath:number, T:number, tcgDb:number[], from:number, to:number, step:number, columns:{angle:number, valid:boolean, tcgDb:number, aperture:object, nearField:number, echoes:object[], samples:number[]}[]}} */
  function testSscan() {
    ensurePa({ noRender: true });
    const frame = UT.renderNow();
    const ss = (frame.pa && frame.pa.sscan) || sscan(UT.state);
    return {
      angles: ss.angles.slice(), selected: ss.selected, maxPath: ss.maxPath, T: ss.T, tcgDb: ss.tcgDb.slice(), from: ss.from, to: ss.to, step: ss.step,
      columns: ss.columns.map(function (c) { return { angle: c.angle, valid: c.valid, tcgDb: c.tcgDb, aperture: c.aperture, nearField: c.nearField, echoes: echoRows(c.echoes), samples: Array.from(c.samples) }; }),
    };
  }
  /** UT.test.pa.escan(): run one E-scan (contact L probe, sliding 8-element aperture). @returns {{angle:number, sub:number, elements:number, maxPath:number, T:number, columns:{xOff:number, index:number, valid:boolean, echoes:object[]}[]}} */
  function testEscan() {
    ensurePa({ noRender: true });
    UT.renderNow();
    const es = escan(UT.state);
    return { angle: es.angle, sub: es.sub, elements: es.elements, maxPath: es.maxPath, T: es.T, columns: es.columns.map(function (c) { return { xOff: c.xOff, index: c.index, valid: c.valid, echoes: echoRows(c.echoes), samples: Array.from(c.samples) }; }) };
  }
  /** UT.test.pa.runScan(): synchronous PA C-scan of the whole scan length (stored in state.pa.scan). @returns {{z0:number, z1:number, step:number, n:number, xBins:number, latMax:number, nonEmpty:number, max:number, map:number[]}|null} */
  function testRunScan() {
    ensurePa({ noRender: true });
    stopScan(true);
    UT.renderNow();
    const sc = runScan(UT.state, { sync: true });
    if (!sc) return null;
    UT.setIn('pa', { scan: sc });
    UT.renderNow();
    let nonEmpty = 0, max = 0;
    for (let i = 0; i < sc.map.length; i++) { const v = sc.map[i]; if (Number.isFinite(v) && v > 0) { nonEmpty++; if (v > max) max = v; } }
    return { z0: sc.z0, z1: sc.z1, step: sc.step, n: sc.n, xBins: sc.xBins, latMax: sc.latMax, nonEmpty, max, map: Array.from(sc.map) };
  }
  /** UT.test.pa.focalLaw(θ, {escan, focusDepth}): focal law of one steering angle (deg in steel) for the current state. @returns {{angle:number, delaysUs:number[], slope:number, valid:boolean, thetaW:number, thetaRel:number, vW:number, F:number, xEl:number[]}} */
  function testFocalLaw(theta, opts) {
    const law = focalLaw(theta, Object.assign({}, opts || {}, { state: UT.state }));
    return { angle: law.angle, delaysUs: law.delaysUs.slice(), slope: law.slope, valid: law.valid, thetaW: law.thetaW, thetaRel: law.thetaRel, vW: law.vW, F: law.F, xEl: law.xEl.slice() };
  }

  // ================================================================== selftest
  function selftest() {
    const f = [];
    try {
      const base = UT.defaultState();
      const l60 = focalLaw(60, { state: base });
      if (!l60.valid || Math.abs(l60.slope - 0.0702) > 0.003) f.push('focalLaw(60).slope ' + l60.slope);
      if (Math.abs(l60.thetaW - 47.1) > 0.2 || Math.abs(l60.thetaRel - 11.1) > 0.2) f.push('focalLaw(60) θw/θrel ' + l60.thetaW + '/' + l60.thetaRel);
      if (l60.delaysUs.length !== 16 || l60.delaysUs.some(function (v) { return v < 0; }) || Math.min.apply(null, l60.delaysUs) !== 0) f.push('focalLaw(60) delays');
      if (Math.abs(Math.max.apply(null, l60.delaysUs) - 15 * 0.0702) > 0.02) f.push('focalLaw(60) span ' + Math.max.apply(null, l60.delaysUs));
      const e0 = focalLaw(0, { state: base, escan: true });
      if (!e0.valid || e0.slope !== 0 || e0.delaysUs.length !== 8 || e0.delaysUs.some(function (v) { return Math.abs(v) > 1e-9; })) f.push('focalLaw(0, escan) ' + JSON.stringify(e0.delaysUs));
      const lf = focalLaw(60, { state: base, focusDepth: 20 });
      if (!lf.valid || lf.delaysUs.some(function (v) { return v < 0; }) || Math.abs(lf.F - 40) > 1e-9 || lf.slope !== l60.slope) f.push('focused law');
      const lfar = focalLaw(60, { state: base, focusDepth: 5000 });
      if (!lfar.valid || Math.abs(lfar.delaysUs[15] - l60.delaysUs[15]) > 0.01 * l60.delaysUs[15]) f.push('focused law F→∞ ≠ steering ' + lfar.delaysUs[15] + ' vs ' + l60.delaysUs[15]);
      const cu = focalLaw(60, { state: base, material: { key: 'copper', vComp: 4.66, vShear: 2.33 } });
      if (cu.valid || cu.slope !== 0 || cu.delaysUs.some(function (v) { return v !== 0; })) f.push('copper 60° should be invalid');
      const ap = apertureOf(60, arrayOf(base), false, materialOf(null));
      if (!ap || Math.abs(ap.a - 16 * Math.cos(rad(11.1)) * 0.5 / Math.cos(rad(47.1))) > 0.1) f.push('aperture 60 ' + (ap && ap.a));
      const apE = apertureOf(60, arrayOf(base), true, materialOf(null));
      if (!apE || Math.abs(apE.a - 8 * Math.cos(rad(60))) > 1e-6) f.push('escan aperture ' + (apE && apE.a));
      if (sweepOf({ probe: { paFrom: 35, paTo: 75, paStep: 1 } }).angles.length !== 41) f.push('sweep 35..75');
      if (sweepOf({ probe: { paFrom: 0, paTo: 89, paStep: 0.25 } }).angles.length > MAX_ANGLES) f.push('sweep cap');
      if (!(UT.rays && UT.rays.trace && UT.specimens && UT.specimens.dacBlock && UT.ascan)) return f;
      // ---- V2-11 geometry on the DAC block (T 40): T/2 SDH at (150, 20), probe at 60° position
      const st = UT.defaultState();
      st.specimen = UT.specimens.dacBlock({ T: 40 });
      st.probe = Object.assign({}, st.probe, { method: 'pa', x: 150 + 20 * Math.tan(rad(60)), z: 50, side: 1, paFrom: 35, paTo: 75, paStep: 1 });
      st.pa = Object.assign({}, st.pa, { from: 35, to: 75, step: 1 });
      const t0 = Date.now();
      const ss = sscan(st);
      const dt = Date.now() - t0;
      if (ss.angles.length !== 41 || ss.columns.length !== 41) { f.push('sscan columns ' + ss.columns.length); return f; }
      let bestA = null, bestAmp = 0, bestE = null;
      ss.columns.forEach(function (c) { c.echoes.forEach(function (e) { if (e.kind === 'sdh' && e.ampPct > bestAmp) { bestAmp = e.ampPct; bestA = c.angle; bestE = e; } }); });
      if (bestA === null || Math.abs(bestA - 60) > 3) f.push('SDH angle ' + bestA);
      if (bestE && Math.abs(bestE.path * Math.sin(rad(bestA)) - 34.64) > 2.5) f.push('SDH lateral ' + (bestE.path * Math.sin(rad(bestA))));
      if (!(ss.columns[25].samples instanceof Float32Array) || ss.columns[25].samples.length !== COL_SAMPLES) f.push('samples');
      if (Math.max.apply(null, Array.from(ss.columns[25].samples)) < 5) f.push('samples empty at 60°');
      if (ss.selected !== 25) f.push('selected index ' + ss.selected);
      const es = escan(st);
      if (es.columns.length < 8 || es.columns.length !== 9) f.push('escan columns ' + es.columns.length);
      if (Math.abs(es.columns[0].xOff + 4) > 1e-9 || Math.abs(es.columns[8].xOff - 4) > 1e-9) f.push('escan offsets');
      const sc = runScan(st, { sync: true });
      if (!sc || sc.n !== 101 || sc.step !== 1 || sc.xBins !== X_BINS || sc.map.length !== 101 * X_BINS) f.push('runScan shape ' + (sc && sc.n));
      else { let any = false; for (let i = 0; i < sc.map.length; i++) if (sc.map[i] > 0) { any = true; break; } if (!any) f.push('runScan map empty'); if (!sc.done) f.push('runScan done'); }
      // frame shape
      const fr = compute(st);
      if (!fr.sscan || fr.view !== 'S' || fr.escan !== null || !fr.focalLaws || fr.focalLaws.angle !== 60 || !fr.aperture || Math.abs(fr.aperture.x1 - fr.aperture.x0 - 16 * Math.cos(rad(36))) > 1e-6) f.push('compute shape');
      st.pa.view = 'E';
      if (!compute(st).escan) f.push('compute escan view');
      st.pa.view = 'S';
      // ---- per-angle TCG: SDH insonified on axis at every 5th angle reads within 3 dB
      const spread = function (tcg) {
        st.pa.tcg = tcg;
        let lo = Infinity, hi = -Infinity;
        for (let a = 35; a <= 75; a += 5) {
          st.probe.x = 150 + 20 * Math.tan(rad(a));
          const r = sscan(st);
          const col = r.columns[r.angles.indexOf(a)];
          let amp = 0;
          col.echoes.forEach(function (e) { if (e.kind === 'sdh' && Math.abs(e.path - 20 / Math.cos(rad(a))) <= 3 && e.ampPct > amp) amp = e.ampPct; });
          if (!(amp > 0)) { f.push('no SDH at ' + a + '°' + (tcg ? ' (tcg)' : '')); continue; }
          lo = Math.min(lo, amp); hi = Math.max(hi, amp);
        }
        return 20 * Math.log10(hi / lo);
      };
      const spOff = spread(false), spOn = spread(true);
      if (!(spOn <= 3)) f.push('TCG spread ' + spOn.toFixed(2) + ' dB (off ' + spOff.toFixed(2) + ')');
      if (!(spOn <= spOff + 1e-9)) f.push('TCG did not reduce the spread');
      if (ss.tcgDb.length !== 41 || ss.tcgDb.some(function (v) { return v !== 0; })) f.push('tcgDb zeros while off');
      if (dt > 400) f.push('sscan slow ' + dt + ' ms');
      // sanity: table cached
      const tb1 = tcgTable(st, ss.angles), tb2 = tcgTable(st, ss.angles);
      if (tb1 !== tb2 || tb1.length !== 41 || tb1.some(function (v) { return !(v >= 0 && v <= TCG_MAX_DB); })) f.push('tcgTable cache/range');
    } catch (e) { f.push('exception: ' + (e && e.stack || e)); }
    return f;
  }

  UT.pa = {
    WEDGE_BETA, ESCAN_ELEMENTS, COL_SAMPLES, X_BINS, COLS_PER_FRAME, VIEWS,
    compute, sscan, escan, runScan, startScan, stopScan, isScanning,
    focalLaw, focalLaws, wedgeOf, apertureOf, tcgTable, sweepOf, arrayOf, columnProbe,
    setSweep, setArray, ensurePa,
    panel, css,
    /** Window-registry alias (§8: menu → UT.<owner>.<win>.toggle()). */
    pa: panel,
    /** open() → the 'pa' window api — build (first call) and show the phased-array panel; @see panel.open(). */
    open() { return panel.open(); },
    /** close() → void — hide the 'pa' window (keeps the built content, the sweep and any scan data); @see panel.close(). */
    close() { return panel.close(); },
    /** toggle() → the 'pa' window api or null — open when closed, close when open (Probes ▸ Phased Array Probe…); @see panel.toggle(). */
    toggle() { return panel.toggle(); },
    /** The 'pa' window api (null until first open()). */
    get window() { return panel.window; },
    __selftest: selftest,
  };

  Object.assign(UT.test, { pa: { sscan: testSscan, escan: testEscan, runScan: testRunScan, focalLaw: testFocalLaw } });
})(window.UT = window.UT || {});
