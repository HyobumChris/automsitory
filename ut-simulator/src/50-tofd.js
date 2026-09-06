/* 50-tofd.js — TOFD (time-of-flight diffraction): two-probe pitch-catch physics, RF A-scan
 * synthesis, D-scan builder (Run Scan) and the TOFD panel windows ('tofd' + 'tofd-ascan').
 * Physics functions are pure functions of their arguments (no UT.state reads except compute(),
 * startScan()/stopScan() and the panel, which orchestrate).
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - Probe pair centred on probe.x: tx at probe.x + pcs/2 (right, facing left → side +1), rx at
//   probe.x − pcs/2 (facing right → side −1). Modes set probe.x = 0 in TOFD, giving §6.6 exactly.
// - Time axis (512 samples) = 2·wd + delayUs + rangeUs·i/511 (ABSOLUTE µs); defaultState has
//   rangeUs 15 (not 20 as the §6.6 prose says) — the frozen state wins, both 10.17 and 12.22 fit.
// - Wavelet: a 2-cycle sin²-windowed sine of the probe frequency starting exactly at the arrival
//   time (zero before it, so D-scan edges are crisp); polarity: lateral −1, backwall +1, upper tip +1,
//   lower tip −1. Amplitude = rel · 10^((gainDb − 40)/20), clipped to ±1; deterministic grass
//   (±0.015 at 40 dB, LCG seeded by probe z) so scans are repeatable.
// - Beam coverage: a tip is visible when its x lies between the probes ± 10 mm; its amplitude is
//   scaled by an in-plane directivity 10^(−½(δ/θ)²) per probe with an effective TOFD beam half angle
//   θ = 25° (real TOFD probes are small/wide-beam; the 5 MHz 10 mm crystal's 7° would hide every
//   tip). Along z the same law applies to the angle subtended by the z offset of the nearest defect
//   end, which produces the classic tip arcs in the D-scan beyond the defect ends (the in-plane time
//   then includes the z offset: √((x−xt)²+y²+dz²)). Pipes wrap the z interval.
// - Lateral wave amplitude 0.6·min(1, √(60/pcs)) (0.6 at pcs 60 as specified, weaker for wider PCS);
//   backwall 0.9 × the in-plane directivity at the mid-point reflection; tips 0.25·min(1, height/2)
//   × reflectivity, volumetric defects give one pair at the bbox centre-line with a further ×0.5.
// - depthFromTime() returns 0 when the argument of the root is negative (times before the lateral).
// - D-scan columns store GREY 0..1 ((rf + 1)/2) sampled on the scan's own axis (t0Us/rangeUs kept in
//   the scan object) and are resampled to the current Range/X-Shift when drawn. runScan() is pure
//   and synchronous (opts.sync is accepted and ignored); startScan()/stopScan() animate 8 columns per
//   frame, store partial scans via UT.setIn('tofd', {scan, running}) and emit 'scan:progress'.
// - D-scan canvas 280 × 450: left 140 px = the scan image (z top→bottom, wedge-zeroed time left→right),
//   top-right 140 × 140 = 2× magnifier around the crosshair, rest black. Red crosshair: horizontal at
//   probe.z, vertical at the hovered time (lateral-wave time when the mouse is elsewhere). Click sets
//   probe.z; hovering sets the status Depth readout.
// - Status: while the panel is open in tofd mode the RIGHT status text is
//   'Depth: d.d | Lateral Wave: x.xx micro sec + delay | BackWall: y.yy micro sec + delay | AMP= gdB'
//   (g = tofd.gainDb; Pos/Range/instrument AMP are in the mid segment owned by 90-app).
// - OFF / ✕ on either window leaves the mode through UT.modes.exit() when available (re-entrancy
//   guarded); without 80-modes they simply hide the panel.
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;

  const N_SAMPLES = 512;
  const REF_GAIN_DB = 40;            // gainDb at which the relative amplitudes below apply
  const BEAM_20DB_DEG = 25;          // effective TOFD beam half angle (−20 dB pulse-echo)
  const FOOTPRINT_MARGIN = 10;       // mm outside the probe pair still "in the beam"
  const WAVELET_CYCLES = 2;
  const GRASS = 0.015;
  const AMP_REL = { lateral: 0.6, backwall: 0.9, tip: 0.25 };
  const DSCAN = { w: 280, h: 450, imgW: 140, miniW: 140, miniH: 140 };
  const ASCAN = { w: 236, h: 140, plotW: 198, plotH: 118, legendX: 204, legendW: 30 };
  const LIMITS = { pcs: [20, 200], rangeUs: [2, 40], delayUs: [0, 40], gainDb: [0, 80] };

  // ================================================================== physics
  /**
   * TOFD geometry for the current state.
   * @param {object} state  UT.state-like ({probe, specimen, tofd})
   * @returns {{xt:number, xr:number, angle:number, pcs:number, derived:object, wd:number, vL:number, T:number, freq:number, probeX:number}}
   */
  function derive(state) {
    const tofd = state.tofd || {};
    const probe = state.probe || {};
    const spec = state.specimen || null;
    const pcs = M.clamp(+tofd.pcs || 60, LIMITS.pcs[0], LIMITS.pcs[1]);
    const angle = +tofd.txAngle || 60;
    const px = Number.isFinite(probe.x) ? probe.x : 0;
    const derived = UT.probe.derive(Object.assign({}, probe, { angle, mode: 'comp', method: 'pe', side: 1 }), spec);
    const xt = px + pcs / 2, xr = px - pcs / 2;
    const T = thicknessAt(spec, px);
    return {
      xt, xr, angle, pcs, derived, wd: derived.wedgeDelayUs / 2, vL: derived.vel, T,
      freq: derived.freq || 5, probeX: px,
    };
  }

  function thicknessAt(spec, x) {
    if (!spec) return 20;
    if (typeof spec.thicknessAt === 'function') { const t = spec.thicknessAt(x); if (Number.isFinite(t) && t > 0) return t; }
    return spec.T || 20;
  }

  /** Absolute arrival time (µs) of a diffractor at (x, y) offset dz along the weld from the probe pair. */
  function pointTime(x, y, dz, g) {
    const pt = Math.sqrt((x - g.xt) * (x - g.xt) + y * y + dz * dz);
    const pr = Math.sqrt((x - g.xr) * (x - g.xr) + y * y + dz * dz);
    return (pt + pr) / g.vL + 2 * g.wd;
  }

  /**
   * Depth (mm) of a diffractor on the probe centre-line from its ABSOLUTE arrival time.
   * @param {number} tUs  absolute time (µs, incl. 2·wd)
   * @param {object} geom  {pcs, wd, vL} (a derive() result)
   * @returns {number} depth ≥ 0 (0 before the lateral wave)
   */
  function depthFromTime(tUs, geom) {
    const vL = geom.vL || (geom.derived && geom.derived.vel) || C.V_COMP_STEEL;
    const wd = geom.wd === undefined ? ((geom.derived ? geom.derived.wedgeDelayUs : 0) / 2) : geom.wd;
    const pcs = geom.pcs === undefined ? Math.abs(geom.xt - geom.xr) : geom.pcs;
    const s = (tUs - 2 * wd) * vL;
    const q = s * s - pcs * pcs;
    return q <= 0 ? 0 : 0.5 * Math.sqrt(q);
  }

  /** Pulse-echo directivity of the pair for a point (x, y) with z offset dz. */
  function dirWeight(x, y, dz, g) {
    const th = M.deg2rad(g.angle);
    const sgn = g.xt >= g.xr ? 1 : -1;               // tx on the right → its axis points toward −x
    const s = Math.sin(th), c = Math.cos(th);
    const dxT = x - g.xt, dxR = x - g.xr;
    const inT = Math.hypot(dxT, y) || 1e-6, inR = Math.hypot(dxR, y) || 1e-6;
    const dT = M.angleBetween(dxT, y, -sgn * s, c);
    const dR = M.angleBetween(dxR, y, sgn * s, c);
    const zT = M.rad2deg(Math.atan2(Math.abs(dz), inT));
    const zR = M.rad2deg(Math.atan2(Math.abs(dz), inR));
    return M.beamWeight20(dT, BEAM_20DB_DEG) * M.beamWeight20(dR, BEAM_20DB_DEG) *
      M.beamWeight20(zT, BEAM_20DB_DEG) * M.beamWeight20(zR, BEAM_20DB_DEG);
  }

  /** Distance along z from probeZ to the defect's z interval (0 inside; pipes wrap). */
  function zOffset(d, probeZ, spec) {
    const L = (spec && spec.L) || 300;
    const wrap = !!(spec && spec.pipe);
    let a = d.zFrom, b = d.zTo;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    if (b < a) { if (wrap) b += L; else { const t = a; a = b; b = t; } }
    const cands = [probeZ];
    if (wrap) { cands.push(probeZ + L, probeZ - L); }
    let best = Infinity;
    for (const z of cands) {
      const off = z < a ? a - z : (z > b ? z - b : 0);
      if (off < best) best = off;
    }
    return best;
  }

  function tipPoints(d) {
    const pts = d.pts || [];
    if (pts.length < 2) return null;
    if (UT.specimens.isPlanar(d.type)) {
      let up = pts[0], lo = pts[0];
      for (const p of pts) { if (p.y < up.y) up = p; if (p.y > lo.y) lo = p; }
      return { up: { x: up.x, y: up.y }, lo: { x: lo.x, y: lo.y }, planar: true };
    }
    const b = UT.specimens.bbox(pts);
    return { up: { x: b.cx, y: b.yMin }, lo: { x: b.cx, y: b.yMax }, planar: false };
  }

  /**
   * TOFD events (lateral, backwall, tip pairs) for the probe pair at probeZ.
   * @returns {Array<{kind:string, tUs:number, depth:number, x:number, defectId:*, amp:number, polarity:number}>}
   */
  function eventsAt(spec, g, defects, probeZ) {
    const ev = [];
    const lateralUs = g.pcs / g.vL + 2 * g.wd;
    ev.push({ kind: 'lateral', tUs: lateralUs, depth: 0, x: (g.xt + g.xr) / 2, defectId: null, dz: 0,
      amp: AMP_REL.lateral * Math.min(1, Math.sqrt(60 / g.pcs)), polarity: -1 });
    const T = g.T;
    const xm = (g.xt + g.xr) / 2;
    const backwallUs = Math.sqrt(g.pcs * g.pcs + 4 * T * T) / g.vL + 2 * g.wd;
    ev.push({ kind: 'backwall', tUs: backwallUs, depth: T, x: xm, defectId: null, dz: 0,
      amp: AMP_REL.backwall * Math.max(0.15, dirWeight(xm, T, 0, g)), polarity: 1 });
    const xLo = Math.min(g.xt, g.xr) - FOOTPRINT_MARGIN, xHi = Math.max(g.xt, g.xr) + FOOTPRINT_MARGIN;
    for (const d of defects || []) {
      if (!d) continue;
      const tp = tipPoints(d);
      if (!tp) continue;
      const hgt = Number.isFinite(d.height) && d.height > 0 ? d.height : Math.max(0.5, tp.lo.y - tp.up.y);
      const base = AMP_REL.tip * Math.min(1, hgt / 2) * (Number.isFinite(d.reflectivity) ? d.reflectivity : 1) * (tp.planar ? 1 : 0.5);
      const dz = zOffset(d, probeZ, spec);
      const pair = [{ p: tp.up, kind: 'tipUpper', polarity: 1 }, { p: tp.lo, kind: 'tipLower', polarity: -1 }];
      for (const it of pair) {
        const x = it.p.x, y = Math.max(0, it.p.y);
        if (x < xLo || x > xHi) continue;
        const w = dirWeight(x, y, dz, g);
        if (w < 1e-3) continue;
        ev.push({ kind: it.kind, tUs: pointTime(x, y, dz, g), depth: y, x, defectId: d.id, n: d.n, dz,
          amp: base * w, polarity: it.polarity });
      }
    }
    ev.sort(function (a, b) { return a.tUs - b.tUs; });
    return ev;
  }

  /** Absolute time axis of the display window. */
  function timeAxis(tofd, g, n) {
    const N = n || N_SAMPLES;
    const rangeUs = M.clamp(+tofd.rangeUs || 15, 0.5, 200);
    const delayUs = +tofd.delayUs || 0;
    const t = new Float32Array(N);
    const t0 = 2 * g.wd + delayUs;
    for (let i = 0; i < N; i++) t[i] = t0 + rangeUs * i / (N - 1);
    return t;
  }

  /** RF synthesis of events on the given time axis at gainDb (−1..1, clipped). */
  function synthRf(events, t, gainDb, freqMHz, seed) {
    const n = t.length;
    const rf = new Float32Array(n);
    const dt = (t[n - 1] - t[0]) / (n - 1);
    const gLin = Math.pow(10, ((Number.isFinite(gainDb) ? gainDb : REF_GAIN_DB) - REF_GAIN_DB) / 20);
    const f = freqMHz || 5;
    const dur = WAVELET_CYCLES / f;
    for (const ev of events) {
      const a = ev.amp * ev.polarity * gLin;
      if (!a) continue;
      let i0 = Math.ceil((ev.tUs - t[0]) / dt), i1 = Math.floor((ev.tUs + dur - t[0]) / dt);
      if (i1 < 0 || i0 > n - 1) continue;
      if (i0 < 0) i0 = 0;
      if (i1 > n - 1) i1 = n - 1;
      for (let i = i0; i <= i1; i++) {
        const tau = t[i] - ev.tUs;
        if (tau < 0 || tau > dur) continue;
        const win = Math.sin(Math.PI * tau / dur);
        rf[i] += a * Math.sin(2 * Math.PI * f * tau) * win * win;
      }
    }
    const r = M.rng(Math.round((seed || 0) * 13 + 7));
    const grass = Math.min(0.1, GRASS * gLin);
    for (let i = 0; i < n; i++) {
      const v = rf[i] + (r() - 0.5) * 2 * grass;
      rf[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    return rf;
  }

  /**
   * TOFD RF A-scan for one probe-pair position.
   * @param {{specimen:object, tofdGeom:object, defects:Array, tofd:object, probeZ:number, probes?:Array}} o
   * @returns {{t:Float32Array, rf:Float32Array, events:Array, lateralUs:number, backwallUs:number, wd:number, geom:object, rangeUs:number, delayUs:number, gainDb:number, probeZ:number}}
   */
  function ascan(o) {
    const spec = o.specimen || null;
    const tofd = o.tofd || {};
    let g = o.tofdGeom || null;
    if (!g && Array.isArray(o.probes) && o.probes.length >= 2) {   // legacy {probes: [tx, rx]} form
      const px = (o.probes[0].x + o.probes[1].x) / 2;
      g = derive({ probe: Object.assign({}, o.probe || {}, { x: px }), specimen: spec, tofd: Object.assign({}, tofd, { pcs: Math.abs(o.probes[0].x - o.probes[1].x) }) });
    }
    if (!g) g = derive({ probe: o.probe || { x: 0 }, specimen: spec, tofd });
    const probeZ = Number.isFinite(o.probeZ) ? o.probeZ : 0;
    const events = o.events || eventsAt(spec, g, o.defects || [], probeZ);
    const t = timeAxis(tofd, g, N_SAMPLES);
    const rf = synthRf(events, t, tofd.gainDb, g.freq, probeZ);
    const lat = events.find(function (e) { return e.kind === 'lateral'; });
    const bw = events.find(function (e) { return e.kind === 'backwall'; });
    return {
      t, rf, events,
      lateralUs: lat ? lat.tUs : g.pcs / g.vL + 2 * g.wd,
      backwallUs: bw ? bw.tUs : Math.sqrt(g.pcs * g.pcs + 4 * g.T * g.T) / g.vL + 2 * g.wd,
      wd: g.wd, geom: { xt: g.xt, xr: g.xr, pcs: g.pcs, angle: g.angle, vL: g.vL, T: g.T, wd: g.wd, probeX: g.probeX },
      rangeUs: M.clamp(+tofd.rangeUs || 15, 0.5, 200), delayUs: +tofd.delayUs || 0,
      gainDb: Number.isFinite(tofd.gainDb) ? tofd.gainDb : REF_GAIN_DB, probeZ,
    };
  }

  function activeDefects(state) { return (state.defects || []).filter(function (d) { return d && d.visible !== false; }); }

  /**
   * TOFD frame result for UT.compute (mode 'tofd'). Reads state, writes nothing.
   * @param {object} state  UT.state
   * @returns {object|null} TofdResult
   */
  function compute(state) {
    if (!state || !state.specimen) return null;
    const g = derive(state);
    return ascan({ specimen: state.specimen, tofdGeom: g, defects: activeDefects(state), tofd: state.tofd || {}, probeZ: state.probe.z || 0 });
  }

  /** Index-point positions of the pair for the cross-section / plan view. */
  function probePositions(state) {
    const g = derive(state);
    return { tx: { x: g.xt, y: 0, side: 1, angle: g.angle }, rx: { x: g.xr, y: 0, side: -1, angle: g.angle }, pcs: g.pcs, angle: g.angle };
  }

  // ================================================================== D-scan
  function scanShell(state) {
    const spec = state.specimen;
    const g = derive(state);
    const tofd = state.tofd || {};
    const L = (spec && spec.L) || 300;
    const step = 1;
    const n = Math.floor(L / step) + 1;
    const t = timeAxis(tofd, g, N_SAMPLES);
    const fixed = eventsAt(spec, g, [], 0);          // lateral + backwall (z independent)
    return {
      z0: 0, z1: (n - 1) * step, step, n, columns: [], nS: N_SAMPLES,
      t0Us: +tofd.delayUs || 0, rangeUs: M.clamp(+tofd.rangeUs || 15, 0.5, 200), gainDb: tofd.gainDb,
      pcs: g.pcs, txAngle: g.angle, wd: g.wd, T: g.T, done: false,
      _g: g, _t: t, _fixed: fixed, _defects: activeDefects(state), _spec: spec,
    };
  }

  function scanColumn(sc, i) {
    const z = sc.z0 + i * sc.step;
    const evs = eventsAt(sc._spec, sc._g, sc._defects, z);
    const rf = synthRf(evs, sc._t, sc.gainDb, sc._g.freq, z);
    const col = new Float32Array(sc.nS);
    for (let k = 0; k < sc.nS; k++) col[k] = (rf[k] + 1) / 2;
    return col;
  }

  function stripPrivate(sc) {
    const out = {};
    for (const k of Object.keys(sc)) if (k[0] !== '_') out[k] = sc[k];
    return out;
  }

  /**
   * Synchronous D-scan: z = 0 … L in 1 mm steps, each column = grey samples 0..1 (0.5 = no signal).
   * PURE — the caller stores the result (UT.setIn('tofd', {scan})).
   * @param {object} state  UT.state
   * @param {{sync?:boolean}} [opts]
   * @returns {{z0:number, z1:number, step:number, n:number, columns:Float32Array[]}|null}
   */
  function runScan(state, opts) {   // eslint-disable-line no-unused-vars
    if (!state || !state.specimen) return null;
    const sc = scanShell(state);
    for (let i = 0; i < sc.n; i++) sc.columns.push(scanColumn(sc, i));
    sc.done = true;
    return stripPrivate(sc);
  }

  let anim = null;   // {sc, i, handle}
  function raf(fn) {
    if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }
  function cancelRaf(h) {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h); else clearTimeout(h);
  }

  /** Animated D-scan (8 columns per frame); stores partial scans into state and emits 'scan:progress'. */
  function startScan() {
    const state = UT.state;
    if (!state.specimen) return false;
    stopScan(true);
    const sc = scanShell(state);
    anim = { sc, i: 0, handle: null };
    UT.setIn('tofd', { scan: stripPrivate(sc), running: true });
    const stepFrame = function () {
      if (!anim || anim.sc !== sc) return;
      for (let k = 0; k < 8 && anim.i < sc.n; k++, anim.i++) sc.columns.push(scanColumn(sc, anim.i));
      const finished = anim.i >= sc.n;
      sc.done = finished;
      UT.setIn('tofd', { scan: stripPrivate(sc), running: !finished });
      UT.bus.emit('scan:progress', { kind: 'tofd', i: anim.i, n: sc.n });
      if (finished) { anim = null; return; }
      anim.handle = raf(stepFrame);
    };
    anim.handle = raf(stepFrame);
    return true;
  }

  /** Stop the animated scan (keeps the columns already built). */
  function stopScan(silent) {
    if (!anim) return false;
    if (anim.handle !== null) cancelRaf(anim.handle);
    anim = null;
    if (!silent) UT.setIn('tofd', { running: false });
    return true;
  }

  function isScanning() { return !!anim; }

  // ================================================================== panel (DOM)
  const css = [
    '.win[data-win=tofd] .win-body{padding:0;background:#000;overflow:hidden}',
    '.win[data-win=tofd] .tofd-top{display:flex;align-items:stretch;height:36px;background:#000}',
    '.win[data-win=tofd] .tofd-run{width:140px;margin:0;padding:0;font:bold 17px "Segoe UI",Arial,sans-serif;color:#000;background:#ececec;border:2px outset #fff;cursor:pointer}',
    '.win[data-win=tofd] .tofd-run.running{background:#ffe08a}',
    '.win[data-win=tofd] .tofd-clear{width:60px;margin:0 0 0 4px;padding:0;font:12px "Segoe UI",Arial,sans-serif;color:#000;background:#d8d8d8;border:2px outset #eee;cursor:pointer}',
    '.win[data-win=tofd] #cv-tofd-dscan{display:block;width:280px;height:450px;cursor:crosshair;background:#000}',
    '.win[data-win=tofd-ascan] .win-body{padding:3px;background:#fdfbd8}',
    '.win[data-win=tofd-ascan] #cv-tofd-ascan{display:block;width:236px;height:140px}',
    '.win[data-win=tofd-ascan] .tofd-ctl{display:flex;gap:4px;align-items:flex-start;margin-top:2px}',
    '.win[data-win=tofd-ascan] .tofd-sliders{flex:1;min-width:0}',
    '.win[data-win=tofd-ascan] .tofd-slider{display:flex;align-items:center;gap:2px;margin:3px 0}',
    '.win[data-win=tofd-ascan] .tofd-slider input[type=range]{width:74px;height:12px;margin:0}',
    '.win[data-win=tofd-ascan] .tofd-slider button{width:16px;height:14px;padding:0;margin:0;font-size:8px;line-height:12px;border:1px outset #ddd;background:#e4e4e4;cursor:pointer}',
    '.win[data-win=tofd-ascan] .tofd-slider span{font:12px "Segoe UI",Arial,sans-serif;color:#000;margin-left:4px;white-space:nowrap}',
    '.win[data-win=tofd-ascan] .tofd-amp{display:flex;flex-direction:column;align-items:center;font:12px "Segoe UI",Arial,sans-serif;color:#000}',
    '.win[data-win=tofd-ascan] .tofd-amp input[type=range]{writing-mode:vertical-lr;direction:rtl;height:56px;width:18px;margin:0}',
    '.win[data-win=tofd-ascan] .tofd-amp .tofd-amp-val{font-size:10px}',
    '.win[data-win=tofd-ascan] .tofd-off{width:38px;height:54px;margin:0;padding:0;font:bold 12px "Segoe UI",Arial,sans-serif;color:#fff;background:#2b2b2b;border:2px outset #777;cursor:pointer;align-self:center}',
    '.win[data-win=tofd-ascan] .tofd-extra{display:flex;gap:8px;align-items:center;margin-top:3px;font:11px "Segoe UI",Arial,sans-serif;color:#000}',
    '.win[data-win=tofd-ascan] .tofd-extra .fld{display:flex;align-items:center;gap:3px;margin:0}',
    '.win[data-win=tofd-ascan] .tofd-extra .fld-input{width:48px;font-size:11px;padding:1px 2px}',
    '.win[data-win=tofd-ascan] .tofd-extra select.fld-input{width:52px}',
  ].join('\n');

  const ui = {
    win: null, ascanWin: null, dscan: null, ascan: null, runBtn: null,
    inputs: {}, hover: null /* {tUs wedge-zeroed, z} */, subscribed: false, leaving: false,
  };

  function tofdState() { return UT.state.tofd || {}; }
  function setTofd(patch) { UT.setIn('tofd', patch); }
  function clampField(key, v) { const l = LIMITS[key]; return l ? M.clamp(v, l[0], l[1]) : v; }

  /** Leave the TOFD mode (OFF / ✕): via UT.modes.exit when present, else just hide the panel. */
  function leave() {
    if (ui.leaving) return;
    ui.leaving = true;
    try {
      if (UT.state.mode === 'tofd' && UT.modes && typeof UT.modes.exit === 'function') UT.modes.exit();
      else panel.close();
    } finally { ui.leaving = false; }
  }

  function anchorRect(id) {
    const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
    return el ? el.getBoundingClientRect() : null;
  }

  function buildDscanWindow() {
    const runBtn = UT.dom.h('button', { class: 'tofd-run', type: 'button', title: 'Build the D-scan image along the weld / 용접선을 따라 D-scan 생성' }, 'Run Scan');
    runBtn.addEventListener('click', function () { if (isScanning()) stopScan(); else startScan(); syncInputs(); UT.requestRender(); });
    const clearBtn = UT.dom.h('button', { class: 'tofd-clear', type: 'button', title: 'Clear the D-scan image' }, 'Clear');
    clearBtn.addEventListener('click', function () { stopScan(true); setTofd({ scan: null, running: false }); });
    const cv = UT.dom.h('canvas', { id: 'cv-tofd-dscan', width: DSCAN.w, height: DSCAN.h });
    cv.addEventListener('mousemove', function (e) { onDscanMouse(e, false); });
    cv.addEventListener('mousedown', function (e) { if (e.button === 0) onDscanMouse(e, true); });
    cv.addEventListener('mouseleave', function () { ui.hover = null; UT.requestRender(); });
    const content = UT.dom.h('div', { class: 'tofd-panel' }, [UT.dom.h('div', { class: 'tofd-top' }, [runBtn, clearBtn]), cv]);
    const inst = anchorRect('instrument');
    ui.win = UT.dom.win({
      name: 'tofd', title: 'TOFD', w: 290, x: inst ? Math.max(0, Math.round(inst.left)) : 4, y: inst ? Math.max(0, Math.round(inst.top)) : 96,
      content, onClose: function () { leave(); },
    });
    ui.runBtn = runBtn;
    ui.dscan = cv;
  }

  function dscanZRange() {
    const sc = tofdState().scan;
    const spec = UT.state.specimen;
    if (sc && Number.isFinite(sc.z0) && Number.isFinite(sc.z1) && sc.z1 > sc.z0) return { z0: sc.z0, z1: sc.z1 };
    return { z0: 0, z1: (spec && spec.L) || 300 };
  }

  function onDscanMouse(e, click) {
    const p = UT.dom.localPos(e, ui.dscan);
    const zr = dscanZRange();
    const t = tofdState();
    const rangeUs = M.clamp(+t.rangeUs || 15, 0.5, 200), delayUs = +t.delayUs || 0;
    if (p.x < 0 || p.x >= DSCAN.imgW || p.y < 0 || p.y >= DSCAN.h) { ui.hover = null; UT.requestRender(); return; }
    const z = zr.z0 + (zr.z1 - zr.z0) * p.y / (DSCAN.h - 1);
    const tUs = delayUs + rangeUs * p.x / (DSCAN.imgW - 1);
    ui.hover = { tUs, z };
    if (click) {
      const spec = UT.state.specimen;
      UT.setIn('probe', { z: M.clamp(Math.round(z), 0, (spec && spec.L) || z) });
      e.preventDefault();
    } else UT.requestRender();
  }

  function sliderRow(label, key, min, max, step, btnStep) {
    const input = UT.dom.h('input', { type: 'range', min, max, step, title: label });
    input.value = clampField(key, +tofdState()[key] || min);
    const apply = function (v) { const patch = {}; patch[key] = +clampField(key, v).toFixed(2); setTofd(patch); };
    input.addEventListener('input', function () { apply(parseFloat(input.value)); });
    const dec = UT.dom.h('button', { type: 'button', title: label + ' −' }, '◀');
    const inc = UT.dom.h('button', { type: 'button', title: label + ' +' }, '▶');
    dec.addEventListener('click', function () { apply((+tofdState()[key] || 0) - btnStep); });
    inc.addEventListener('click', function () { apply((+tofdState()[key] || 0) + btnStep); });
    ui.inputs[key] = input;
    return UT.dom.h('div', { class: 'tofd-slider' }, [dec, input, inc, UT.dom.h('span', {}, label)]);
  }

  function buildAscanWindow() {
    const cv = UT.dom.h('canvas', { id: 'cv-tofd-ascan', width: ASCAN.w, height: ASCAN.h });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      setTofd({ gainDb: clampField('gainDb', (+tofdState().gainDb || 0) + (e.deltaY < 0 ? 1 : -1)) });
    }, { passive: false });
    const sliders = UT.dom.h('div', { class: 'tofd-sliders' }, [
      sliderRow('Range', 'rangeUs', LIMITS.rangeUs[0], LIMITS.rangeUs[1], 0.5, 1),
      sliderRow('X-Shift', 'delayUs', LIMITS.delayUs[0], LIMITS.delayUs[1], 0.25, 0.5),
    ]);
    const amp = UT.dom.h('input', { type: 'range', min: LIMITS.gainDb[0], max: LIMITS.gainDb[1], step: 1, orient: 'vertical', title: 'AMP (dB)' });
    amp.value = clampField('gainDb', +tofdState().gainDb || REF_GAIN_DB);
    amp.addEventListener('input', function () { setTofd({ gainDb: clampField('gainDb', parseFloat(amp.value)) }); });
    ui.inputs.gainDb = amp;
    const ampVal = UT.dom.h('span', { class: 'tofd-amp-val' }, amp.value + 'dB');
    ui.inputs.gainLabel = ampVal;
    const ampBox = UT.dom.h('div', { class: 'tofd-amp' }, [amp, UT.dom.h('span', {}, 'AMP'), ampVal]);
    const off = UT.dom.h('button', { class: 'tofd-off', type: 'button', title: 'Close TOFD' }, 'OFF');
    off.addEventListener('click', function () { leave(); });
    const pcs = UT.dom.field('PCS', { type: 'number', value: tofdState().pcs || 60, min: LIMITS.pcs[0], max: LIMITS.pcs[1], step: 1, title: 'Probe centre separation (mm)',
      onchange: function (v) { if (Number.isFinite(v)) setTofd({ pcs: clampField('pcs', v) }); } });
    const ang = UT.dom.field('Angle', { tag: 'select', type: 'number', value: tofdState().txAngle || 60, options: [45, 60, 70], title: 'Probe angle (compression)',
      onchange: function (v) { const a = parseFloat(v); if (Number.isFinite(a)) setTofd({ txAngle: a }); } });
    ui.inputs.pcs = pcs.input;
    ui.inputs.txAngle = ang.input;
    const content = UT.dom.h('div', { class: 'tofd-ascan-panel' }, [
      cv,
      UT.dom.h('div', { class: 'tofd-ctl' }, [sliders, ampBox, off]),
      UT.dom.h('div', { class: 'tofd-extra' }, [pcs, ang]),
    ]);
    const plan = anchorRect('cv-plan');
    ui.ascanWin = UT.dom.win({
      name: 'tofd-ascan', title: 'TOFD A-Scan', w: 246,
      x: plan ? Math.max(0, Math.round(plan.right - 150 - 246)) : 700, y: plan ? Math.max(0, Math.round(plan.top + 24)) : 130,
      content, onClose: function () { leave(); },
    });
    ui.ascan = cv;
  }

  function syncInputs() {
    const t = tofdState();
    const set = function (key, v) { const el = ui.inputs[key]; if (el && document.activeElement !== el && String(el.value) !== String(v)) el.value = v; };
    set('rangeUs', +t.rangeUs || 15);
    set('delayUs', +t.delayUs || 0);
    set('gainDb', Number.isFinite(t.gainDb) ? t.gainDb : REF_GAIN_DB);
    set('pcs', t.pcs || 60);
    set('txAngle', t.txAngle || 60);
    if (ui.inputs.gainLabel) ui.inputs.gainLabel.textContent = Math.round(Number.isFinite(t.gainDb) ? t.gainDb : REF_GAIN_DB) + 'dB';
    if (ui.runBtn) {
      const running = isScanning() || !!t.running;
      ui.runBtn.textContent = running ? 'Stop Scan' : 'Run Scan';
      ui.runBtn.classList.toggle('running', running);
    }
  }

  // ------------------------------------------------------------------ drawing
  function drawAscan(frame, state) {
    const cv = ui.ascan;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, ASCAN.w, ASCAN.h);
    const res = (frame && frame.tofd) || (state.specimen ? compute(state) : null);
    ctx.save();
    ctx.fillStyle = '#fdfbd8';
    ctx.fillRect(0, 0, ASCAN.w, ASCAN.h);
    // plot area
    ctx.fillStyle = '#0e5a4d';
    ctx.fillRect(0, 0, ASCAN.plotW, ASCAN.plotH);
    ctx.strokeStyle = '#0a3d34';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 10; i++) { const x = Math.round(ASCAN.plotW * i / 10) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, ASCAN.plotH); }
    for (let j = 1; j < 5; j++) { const y = Math.round(ASCAN.plotH * j / 5) + 0.5; ctx.moveTo(0, y); ctx.lineTo(ASCAN.plotW, y); }
    ctx.stroke();
    const mid = ASCAN.plotH / 2;
    ctx.strokeStyle = '#146b5c';
    ctx.beginPath(); ctx.moveTo(0, mid + 0.5); ctx.lineTo(ASCAN.plotW, mid + 0.5); ctx.stroke();
    if (res && res.rf) {
      const n = res.rf.length;
      ctx.strokeStyle = '#22ff22';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = ASCAN.plotW * i / (n - 1);
        const y = mid - res.rf[i] * (mid - 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // hover time marker
      if (ui.hover) {
        const x = ASCAN.plotW * (ui.hover.tUs - res.delayUs) / res.rangeUs;
        if (x >= 0 && x <= ASCAN.plotW) { ctx.strokeStyle = 'rgba(255,60,60,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, ASCAN.plotH); ctx.stroke(); }
      }
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, ASCAN.plotW - 1, ASCAN.plotH - 1);
    // greyscale legend (white top → black bottom)
    const grad = ctx.createLinearGradient(0, 0, 0, ASCAN.plotH);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#000000');
    ctx.fillStyle = grad;
    ctx.fillRect(ASCAN.legendX, 0, ASCAN.legendW, ASCAN.plotH);
    ctx.strokeRect(ASCAN.legendX + 0.5, 0.5, ASCAN.legendW - 1, ASCAN.plotH - 1);
    // division labels 0 … 10
    ctx.fillStyle = '#000';
    ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 10; i += 2) {
      const x = ASCAN.plotW * i / 10;
      ctx.textAlign = i === 0 ? 'left' : (i === 10 ? 'right' : 'center');
      ctx.fillText(String(i), x, ASCAN.plotH + 3);
    }
    ctx.restore();
  }

  function greyAt(sc, zr, rangeUs, delayUs, px, py) {
    const z = zr.z0 + (zr.z1 - zr.z0) * py / (DSCAN.h - 1);
    const i = Math.round((z - sc.z0) / sc.step);
    if (i < 0 || i >= sc.columns.length) return -1;
    const tDisp = delayUs + rangeUs * px / (DSCAN.imgW - 1);
    const j = Math.round((tDisp - sc.t0Us) / sc.rangeUs * (sc.nS - 1));
    if (j < 0 || j >= sc.nS) return -1;
    return sc.columns[i][j];
  }

  function drawDscan(frame, state) {
    const cv = ui.dscan;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, DSCAN.w, DSCAN.h);
    const t = state.tofd || {};
    const sc = t.scan && Array.isArray(t.scan.columns) ? t.scan : null;
    const zr = dscanZRange();
    const rangeUs = M.clamp(+t.rangeUs || 15, 0.5, 200), delayUs = +t.delayUs || 0;
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, DSCAN.w, DSCAN.h);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, DSCAN.imgW, DSCAN.h);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(DSCAN.imgW, 0, DSCAN.miniW, DSCAN.miniH);
    const probeZ = state.probe.z || 0;
    const zRow = M.clamp((probeZ - zr.z0) / (zr.z1 - zr.z0) * (DSCAN.h - 1), 0, DSCAN.h - 1);
    if (sc && sc.columns.length) {
      const img = ctx.createImageData(DSCAN.imgW, DSCAN.h);
      const d = img.data;
      for (let py = 0; py < DSCAN.h; py++) {
        for (let px = 0; px < DSCAN.imgW; px++) {
          const v = greyAt(sc, zr, rangeUs, delayUs, px, py);
          const g = v < 0 ? 0 : Math.round(M.clamp(v, 0, 1) * 255);
          const k = (py * DSCAN.imgW + px) * 4;
          d[k] = g; d[k + 1] = g; d[k + 2] = g; d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // magnifier: 2× zoom of a 70 × 70 px region around the crosshair
      const hx = ui.hover ? (ui.hover.tUs - delayUs) / rangeUs * (DSCAN.imgW - 1) : (frame && frame.tofd ? (frame.tofd.lateralUs - 2 * frame.tofd.wd - delayUs) / rangeUs * (DSCAN.imgW - 1) : 0);
      const cx = M.clamp(Math.round(hx), 35, DSCAN.imgW - 35), cy = M.clamp(Math.round(zRow), 35, DSCAN.h - 35);
      const mini = ctx.createImageData(DSCAN.miniW, DSCAN.miniH);
      const md = mini.data;
      for (let py = 0; py < DSCAN.miniH; py++) {
        for (let px = 0; px < DSCAN.miniW; px++) {
          const v = greyAt(sc, zr, rangeUs, delayUs, cx - 35 + px / 2, cy - 35 + py / 2);
          const g = v < 0 ? 0 : Math.round(M.clamp(v, 0, 1) * 255);
          const k = (py * DSCAN.miniW + px) * 4;
          md[k] = g; md[k + 1] = g; md[k + 2] = g; md[k + 3] = 255;
        }
      }
      ctx.putImageData(mini, DSCAN.imgW, 0);
      if (!sc.done && sc.columns.length < sc.n) {
        const py = (sc.z0 + (sc.columns.length - 1) * sc.step - zr.z0) / (zr.z1 - zr.z0) * (DSCAN.h - 1);
        ctx.strokeStyle = '#00e000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(DSCAN.imgW, Math.round(py) + 0.5); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.font = '11px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('press Run Scan', DSCAN.imgW / 2, 24);
    }
    // crosshair: horizontal at probe.z (full width), vertical at hover / lateral time (image only)
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(zRow) + 0.5); ctx.lineTo(DSCAN.w, Math.round(zRow) + 0.5);
    let tv = null;
    if (ui.hover) tv = ui.hover.tUs;
    else if (frame && frame.tofd) tv = frame.tofd.lateralUs - 2 * frame.tofd.wd;
    if (tv !== null) {
      const x = (tv - delayUs) / rangeUs * (DSCAN.imgW - 1);
      if (x >= 0 && x < DSCAN.imgW) { ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, DSCAN.h); }
    }
    ctx.stroke();
    // z ticks on the image edge
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '9px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const zStep = (zr.z1 - zr.z0) > 400 ? 100 : 50;
    for (let z = Math.ceil(zr.z0 / zStep) * zStep; z <= zr.z1; z += zStep) {
      const py = (z - zr.z0) / (zr.z1 - zr.z0) * (DSCAN.h - 1);
      ctx.fillRect(0, Math.round(py), 4, 1);
      if (py > 6 && py < DSCAN.h - 6) ctx.fillText(String(z), 6, py);
    }
    ctx.restore();
  }

  function updateStatus(frame, state) {
    if (state.mode !== 'tofd') return;
    const res = (frame && frame.tofd) || null;
    if (!res) return;
    const g = res.geom || derive(state);
    const wd = res.wd;
    const cursorAbs = ui.hover ? ui.hover.tUs + 2 * wd : null;
    const depth = cursorAbs === null ? 0 : depthFromTime(cursorAbs, { pcs: g.pcs, wd, vL: g.vL });
    const gainDb = Number.isFinite(state.tofd.gainDb) ? state.tofd.gainDb : REF_GAIN_DB;
    const right = 'Depth: ' + depth.toFixed(1) + ' | Lateral Wave: ' + (res.lateralUs - 2 * wd).toFixed(2) + ' micro sec + delay | BackWall: ' +
      (res.backwallUs - 2 * wd).toFixed(2) + ' micro sec + delay | AMP= ' + Math.round(gainDb) + 'dB';
    if (state.status && state.status.right !== right) UT.status({ right });
  }

  const panel = {
    /** The 'tofd' window api (null until first open()). */
    window: null,
    ascanWindow: null,
    isOpen() { return !!(ui.win && ui.win.isOpen()); },
    /** Create (lazily) and show both TOFD windows. */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('tofd', css);
      if (!ui.win) buildDscanWindow();
      if (!ui.ascanWin) buildAscanWindow();
      panel.window = ui.win;
      panel.ascanWindow = ui.ascanWin;
      if (!ui.subscribed) {
        ui.subscribed = true;
        UT.bus.on('render', function (frame) { panel.draw(frame); });
      }
      ui.win.show();
      ui.ascanWin.show();
      syncInputs();
      UT.requestRender();
      return ui.win;
    },
    /** Hide both windows (stops a running scan; keeps the image). */
    close() {
      stopScan();
      if (ui.win && ui.win.isOpen()) ui.win.hide();
      if (ui.ascanWin && ui.ascanWin.isOpen()) ui.ascanWin.hide();
      return ui.win;
    },
    toggle() { return panel.isOpen() ? panel.close() : panel.open(); },
    /** Draw both canvases from the frame (no-op while hidden). */
    draw(frame) {
      if (!panel.isOpen() && !(ui.ascanWin && ui.ascanWin.isOpen())) return;
      const state = UT.state;
      try {
        syncInputs();
        if (ui.win && ui.win.isOpen()) drawDscan(frame, state);
        if (ui.ascanWin && ui.ascanWin.isOpen()) drawAscan(frame, state);
        updateStatus(frame, state);
      } catch (e) { console.error('[UT.tofd.panel]', e); }
    },
  };

  // ================================================================== test API
  function testTofd() {
    let res = UT.frame && UT.frame.tofd;
    if (!res) res = compute(UT.state);
    if (!res) return { events: [], lateralUs: null, backwallUs: null };
    return {
      events: res.events.map(function (e) { return { kind: e.kind, tUs: +e.tUs.toFixed(4), depth: +e.depth.toFixed(3), defectId: e.defectId === undefined ? null : e.defectId, amp: +e.amp.toFixed(4) }; }),
      lateralUs: +res.lateralUs.toFixed(4), backwallUs: +res.backwallUs.toFixed(4), wd: +res.wd.toFixed(4),
    };
  }
  function testRunTofdScan() {
    stopScan(true);
    const sc = runScan(UT.state, { sync: true });
    if (!sc) return null;
    UT.setIn('tofd', { scan: sc, running: false });
    return { z0: sc.z0, z1: sc.z1, step: sc.step, n: sc.n };
  }

  // ================================================================== self test
  function selftest() {
    const f = [];
    try {
      const st = UT.defaultState();
      st.mode = 'tofd';
      st.specimen = UT.specimens.plateWeld({ T: 20 });
      st.probe.x = 0; st.probe.z = 135;
      st.tofd.pcs = 60; st.tofd.txAngle = 60;
      st.defects = [UT.specimens.makeDefect({ pts: [{ x: 0, y: 8 }, { x: 0, y: 13 }], type: 'planar', zFrom: 120, zTo: 150, n: 1 })];
      const g = derive(st);
      if (Math.abs(g.derived.wedgeAngle - 23.7) > 0.2) f.push('wedge angle 60 comp ' + g.derived.wedgeAngle.toFixed(2));
      if (Math.abs(g.wd - 4.38) > 0.02) f.push('wd ' + g.wd);
      const res = compute(st);
      if (!res || !(res.t instanceof Float32Array) || res.t.length !== N_SAMPLES) f.push('t axis');
      if (Math.abs(res.lateralUs - 18.93) > 0.05) f.push('lateral ' + res.lateralUs.toFixed(3));
      if (Math.abs(res.backwallUs - 20.98) > 0.05) f.push('backwall ' + res.backwallUs.toFixed(3));
      const tips = res.events.filter(function (e) { return e.kind === 'tipUpper' || e.kind === 'tipLower'; });
      if (tips.length !== 2) f.push('tip events ' + tips.length);
      for (const e of tips) if (!(e.tUs > res.lateralUs && e.tUs < res.backwallUs)) f.push('tip time out of order ' + e.kind + ' ' + e.tUs.toFixed(2));
      const up = tips.find(function (e) { return e.kind === 'tipUpper'; }), lo = tips.find(function (e) { return e.kind === 'tipLower'; });
      if (up && lo && !(up.tUs < lo.tUs)) f.push('upper tip after lower');
      if (up && Math.abs(depthFromTime(up.tUs, g) - 8) > 0.05) f.push('depthFromTime(upper) ' + depthFromTime(up.tUs, g).toFixed(2));
      if (Math.abs(depthFromTime(res.backwallUs, g) - 20) > 0.05) f.push('depthFromTime(backwall) ' + depthFromTime(res.backwallUs, g).toFixed(2));
      if (depthFromTime(res.lateralUs, g) !== 0) f.push('depthFromTime(lateral) != 0');
      let maxAbs = 0, latPeak = 0;
      for (let i = 0; i < res.rf.length; i++) {
        const a = Math.abs(res.rf[i]);
        if (a > maxAbs) maxAbs = a;
        if (res.t[i] >= res.lateralUs && res.t[i] <= res.lateralUs + 0.5 && a > latPeak) latPeak = a;
      }
      if (maxAbs > 1 + 1e-6) f.push('rf not clipped');
      if (latPeak < 0.3) f.push('lateral wave too weak ' + latPeak.toFixed(2));
      const pp = probePositions(st);
      if (Math.abs(pp.tx.x - 30) > 1e-9 || Math.abs(pp.rx.x + 30) > 1e-9) f.push('probePositions');
      // far from the defect along z: tip amplitude must fall (arc decay)
      const far = eventsAt(st.specimen, g, st.defects, 200).filter(function (e) { return e.kind === 'tipLower'; });
      const near = eventsAt(st.specimen, g, st.defects, 135).filter(function (e) { return e.kind === 'tipLower'; });
      if (near.length && far.length && !(far[0].amp < near[0].amp * 0.2)) f.push('tip arc decay ' + (far[0].amp / near[0].amp).toFixed(3));
      const sc = runScan(st);
      if (!sc || sc.n !== 301 || sc.columns.length !== 301 || sc.step !== 1) f.push('runScan shape');
      if (sc && sc.columns[135]) {
        let lo2 = 1, hi2 = 0;
        for (let i = 0; i < sc.columns[135].length; i++) { lo2 = Math.min(lo2, sc.columns[135][i]); hi2 = Math.max(hi2, sc.columns[135][i]); }
        if (lo2 < 0 || hi2 > 1 || hi2 - lo2 < 0.3) f.push('scan column grey range ' + lo2.toFixed(2) + '..' + hi2.toFixed(2));
      }
      if (typeof css !== 'string' || css.indexOf('/style') >= 0) f.push('css');
    } catch (e) { f.push('exception ' + (e && e.message)); }
    return f;
  }

  UT.tofd = {
    N_SAMPLES, REF_GAIN_DB, BEAM_20DB_DEG, LIMITS,
    derive, pointTime, depthFromTime, eventsAt, ascan, compute, runScan, startScan, stopScan, isScanning,
    probePositions, panel, css,
    __selftest: selftest,
  };

  Object.assign(UT.test, { tofd: testTofd, runTofdScan: testRunTofdScan });
})(window.UT = window.UT || {});
