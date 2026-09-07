/* 50-tofd.js — TOFD (time-of-flight diffraction): two-probe pitch-catch physics, RF A-scan
 * synthesis, D-scan builder (Run Scan) and the TOFD panel windows ('tofd' + 'tofd-ascan').
 * Physics functions are pure functions of their arguments (no UT.state reads except compute(),
 * startScan()/stopScan(), cursorAt(), pcsOptimise() and the panel, which orchestrate).
 *
 * v2 (SPEC-v2 §3.9 P9): mode-converted signals (Fermat L-S backwall, S-S replica, converted tip
 * replicas), dead zones (lateral / backwall) in TofdResult.deadZones + UT.tofd.deadZones(state),
 * PCS optimiser (2/3 T rule), hyperbolic D-scan cursor writing state.cursor {view:'dscan', tUs,
 * depth, z}, straightening toggle, material grass, pointer events on the D-scan.
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - Probe pair centred on probe.x: tx at probe.x + pcs/2 (right, facing left → side +1), rx at
//   probe.x − pcs/2 (facing right → side −1). Modes set probe.x = 0 in TOFD, giving §6.6 exactly.
// - Time axis (512 samples) = 2·wd + delayUs + rangeUs·i/511 (ABSOLUTE µs); defaultState has
//   rangeUs 15 (not 20 as the §6.6 prose says) — the frozen state wins, both 10.17 and 12.22 fit.
//   The mode-converted backwall (16.0 µs wedge-zeroed) and its S-S replica (22.3) need Range ≥ 17 /
//   23: the A-scan prints a small amber hint when they lie beyond the screen (no silent range change).
// - Wavelet: a 2-cycle sin²-windowed sine of the probe frequency starting exactly at the arrival
//   time (zero before it, so D-scan edges are crisp); polarity: lateral −1, backwall +1, upper tip +1,
//   lower tip −1. Amplitude = rel · 10^((gainDb − 40)/20), clipped to ±1; deterministic grass
//   (LCG seeded by probe z) so scans are repeatable. v2: the grass level is the material's —
//   0.015 · (material.grass / 0.02) · (f/5)² at 40 dB, i.e. exactly v1's ±0.015 for carbon at 5 MHz.
// - Beam coverage: a tip is visible when its x lies between the probes ± 10 mm; its amplitude is
//   scaled by an in-plane directivity 10^(−½(δ/θ)²) per probe with an effective TOFD beam half angle
//   θ = 25° (real TOFD probes are small/wide-beam; the 5 MHz 10 mm crystal's 7° would hide every
//   tip). Along z the same law applies to the angle subtended by the z offset of the nearest defect
//   end, which produces the classic tip arcs in the D-scan beyond the defect ends (the in-plane time
//   then includes the z offset: √((x−xt)²+y²+dz²)). Pipes wrap the z interval.
// - Lateral wave amplitude 0.6·min(1, √(60/pcs)) (0.6 at pcs 60 as specified, weaker for wider PCS);
//   backwall 0.9 × the in-plane directivity at the mid-point reflection; tips 0.25·min(1, height/2)
//   × reflectivity, volumetric defects give one pair at the bbox centre-line with a further ×0.5.
// - Mode conversion (tofd.modeConv, §3.9): ONE 'modeconv-backwall' event (the two reciprocal L→S /
//   S→L paths share the Fermat time; amplitude 0.35 stands for both), polarity +1 like the backwall,
//   x = the Fermat reflection point (48.2 mm from Tx for pcs 60 / T 20), depth = T. The golden-section
//   search runs on x ∈ [0, pcs] (60 iterations, |Δt| < 1e-6 µs). 'modeconv-backwall-ss' uses the
//   symmetric S-S mid-point path, amplitude 0.15, polarity +1. 'modeconv-tip' (Tx leg L, Rx leg S) is
//   emitted per visible tip with 0.12/0.25 of that tip's amplitude (same directivity, same polarity,
//   same dz law). Event rows carry mode 'L' | 'LS' | 'SS'. vS comes from spec.material.vShear.
// - Dead zones (§3.9): τ = 1.5/f µs; lateral dL = ½·√((pcs/vL + τ)²·vL² − pcs²), backwall
//   dB = T − √((√(S² + T²) − vL·τ/2)² − S²) (0 when the root is negative). In TIME the lateral dead
//   zone is [tL, tL + τ] and the backwall dead zone [tB − τ, tB] — those bands are shaded red on the
//   D-scan when tofd.deadZones (the cross-section bands are drawn by 60 from TofdResult.deadZones).
// - PCS optimiser: pcs = 2·(2T/3)·tan(txAngle) with T = thicknessAt(probe.x) (20 → 46.2 at 60°),
//   rounded to 0.1 mm and clamped to LIMITS.pcs; UT.tofd.pcsOptimise() writes tofd.pcs and returns it.
// - Cursor: pointer hover/click on the D-scan image writes state.cursor = {x: null, y: depth,
//   view: 'dscan', tUs (ABSOLUTE, incl. 2·wd), depth, z} with {noRender: true} from the pointer
//   handler (never from the 'render' listener — v1 wrote it from the render path, v2 does not) and a
//   requestRender(); `y` is kept equal to depth so 90-app's existing 'Depth: d.d' readout still works.
//   Leaving the canvas clears the cursor (only when cursor.view === 'dscan'). UT.tofd.cursorAt({z,
//   depth}) places the same cursor programmatically (tUs = pointTime of (xm, depth)); when it is called
//   while a 'render' is being dispatched the write is deferred with setTimeout(0).
// - Hyperbolic cursor: t(z') = 2wd + (√((x−xt)²+d²+(z'−z)²) + √((x−xr)²+d²+(z'−z)²))/vL for z' = z ± 40
//   mm (1 mm steps) with x = the pair centre and d = depthFromTime(cursor) — drawn cyan over the D-scan;
//   UT.tofd.hyperbola(geom, {z, depth}, span, step) → [{z, tUs}] (absolute) is the pure helper.
// - Straightening (tofd.straighten): the D-scan builder applies a small deterministic coupling/PCS
//   wander to every column (≤ 0.12 µs, two slow sines of z — the classic lateral-wave wobble of a real
//   scan; the live A-scan and every UT.test.tofd() number are untouched) and stores the per-column
//   lateral time in scan.latUs. With straighten on, each column is shifted by −(latUs[i] − lateralUs)
//   so the lateral wave becomes a flat line, which is marked yellow.
// - depthFromTime() returns 0 when the argument of the root is negative (times before the lateral).
// - D-scan columns store GREY 0..1 (0.5 + rf·2, clipped — a ×2 display contrast so the lateral wave and
//   backwall saturate to black/white bands as in UTman) sampled on the scan's own axis (t0Us/rangeUs kept in
//   the scan object) and are resampled to the current Range/X-Shift when drawn with a signed peak hold per
//   pixel (the 512-sample wavelets are shorter than one screen pixel otherwise). runScan() is pure
//   and synchronous (opts.sync is accepted and ignored); startScan()/stopScan() animate 8 columns per
//   frame, store partial scans via UT.setIn('tofd', {scan, running}) and emit 'scan:progress'.
// - D-scan canvas 280 × 450: left 140 px = the scan image (z top→bottom, wedge-zeroed time left→right),
//   top-right 140 × 140 = 2× magnifier around the crosshair, rest black. Red crosshair: horizontal at
//   probe.z, vertical at the hovered time (lateral-wave time when the pointer is elsewhere). Click sets
//   probe.z (v1) and the cursor.
// - Status: 90-app renders Lateral/BackWall/AMP from UT.modes.statusMid() and 'Depth: d.d' from cursor.y.
// - OFF / ✕ on either window leaves the mode through UT.modes.exit() when available (re-entrancy
//   guarded); without 80-modes they simply hide the panel.
// - Angle: in TOFD mode the toolbar 45/60/70 radio (probe.angle, §15.9) and tofd.txAngle (panel select)
//   are ONE value (the reference shows the toolbar radio as the TOFD angle). A 'state' listener mirrors
//   probe.angle → txAngle on probe/mode changes (the toolbar wins when it is 45/60/70, else the probe
//   follows txAngle) and txAngle → probe.angle (+ preset mode) on tofd changes; the select writes both.
// - Docking: while the 'tofd' window is shown, #instrument gets the class `tofd-docked`
//   (visibility: hidden — the grid keeps its size) so the D-scan panel REPLACES the flaw detector in
//   the instrument column as in UTman instead of half-covering the EPOCH keys; removed on hide/close.
// - Panel v2 controls (A-scan window, second row): 'Optimise PCS' button, check-boxes Mode conv. /
//   Straighten / Dead zones (the last mirrors Options ▸ Show dead zones, same state key).
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts;
  function t(key, params) { return UT.i18n.t(key, params); }

  const N_SAMPLES = 512;
  const REF_GAIN_DB = 40;            // gainDb at which the relative amplitudes below apply
  const BEAM_20DB_DEG = 25;          // effective TOFD beam half angle (−20 dB pulse-echo)
  const FOOTPRINT_MARGIN = 10;       // mm outside the probe pair still "in the beam"
  const WAVELET_CYCLES = 2;
  const GRASS = 0.015;               // RF grass amplitude at 40 dB for carbon steel at 5 MHz (v1)
  const GRASS_MATERIAL_REF = 0.02;   // material.grass of carbon steel (the v1 reference)
  const AMP_REL = { lateral: 0.6, backwall: 0.9, tip: 0.25, modeconvBackwall: 0.35, modeconvBackwallSS: 0.15, modeconvTip: 0.12 };
  const DEAD_ZONE_CYCLES = 1.5;      // τ = 1.5 / f (µs)
  const HYPERBOLA_SPAN = 40;         // ± mm along z drawn for the hyperbolic cursor
  const WANDER_US = [0.08, 0.04];    // D-scan lateral-wave wobble amplitudes (µs) removed by straightening
  const DSCAN = { w: 280, h: 450, imgW: 140, miniW: 140, miniH: 140 };
  const DSCAN_CONTRAST = 2;          // D-scan grey = 0.5 + rf·DSCAN_CONTRAST (clipped): lateral/backwall saturate as in UTman
  const ASCAN = { w: 236, h: 140, plotW: 198, plotH: 118, legendX: 204, legendW: 30 };
  const LIMITS = { pcs: [20, 200], rangeUs: [2, 40], delayUs: [0, 40], gainDb: [0, 80] };
  const TOFD_ANGLES = [45, 60, 70];  // the only angles enabled in TOFD mode (§14.7) = the panel select options
  const MODECONV_KINDS = { 'modeconv-backwall': 1, 'modeconv-backwall-ss': 1, 'modeconv-tip': 1 };

  // ================================================================== physics
  function materialOf(spec) {
    if (spec && spec.material && typeof spec.material === 'object') return spec.material;
    const mats = UT.specimens && UT.specimens.materials;
    return (mats && mats.carbon) || { key: 'carbon', vComp: C.V_COMP_STEEL, vShear: C.V_SHEAR_STEEL, grass: GRASS_MATERIAL_REF };
  }

  /**
   * TOFD geometry for the current state.
   * @param {object} state  UT.state-like ({probe, specimen, tofd})
   * @returns {{xt:number, xr:number, angle:number, pcs:number, derived:object, wd:number, vL:number, vS:number, T:number, freq:number, probeX:number, modeConv:boolean, material:object}}
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
    const mat = materialOf(spec);
    return {
      xt, xr, angle, pcs, derived, wd: derived.wedgeDelayUs / 2, vL: derived.vel,
      vS: Number.isFinite(mat.vShear) && mat.vShear > 0 ? mat.vShear : C.V_SHEAR_STEEL,
      T, freq: derived.freq || 5, probeX: px,
      modeConv: tofd.modeConv !== false, material: mat,
    };
  }

  function thicknessAt(spec, x) {
    if (!spec) return 20;
    if (typeof spec.thicknessAt === 'function') { const t0 = spec.thicknessAt(x); if (Number.isFinite(t0) && t0 > 0) return t0; }
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

  /**
   * Fermat minimum of the L→S converted backwall path: min over x ∈ [0, pcs] of
   * √(x²+T²)/vL + √((pcs−x)²+T²)/vS (golden section). x is measured from the Tx index point.
   * @param {{pcs:number, T:number, vL:number, vS:number}} g
   * @returns {{x:number, tUs:number}} metal-only one-way-sum time (add 2·wd for the absolute time)
   */
  function fermatLS(g) {
    const pcs = g.pcs, T = g.T, vL = g.vL, vS = g.vS || C.V_SHEAR_STEEL;
    const f = function (x) { return Math.sqrt(x * x + T * T) / vL + Math.sqrt((pcs - x) * (pcs - x) + T * T) / vS; };
    const gr = (Math.sqrt(5) - 1) / 2;
    let a = 0, b = pcs;
    let c = b - gr * (b - a), d = a + gr * (b - a);
    let fc = f(c), fd = f(d);
    for (let i = 0; i < 60 && (b - a) > 1e-7; i++) {
      if (fc < fd) { b = d; d = c; fd = fc; c = b - gr * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + gr * (b - a); fd = f(d); }
    }
    const x = (a + b) / 2;
    return { x, tUs: f(x) };
  }

  /**
   * Dead zones (mm) of the pair: τ = 1.5/f µs; lateral dL = ½·√((pcs/vL + τ)²·vL² − pcs²),
   * backwall dB = T − √((√(S²+T²) − vL·τ/2)² − S²), S = pcs/2.
   * @param {object} stateOrGeom  UT.state-like ({probe, specimen, tofd}) or a derive() result
   * @returns {{lateral:number, backwall:number, tauUs:number}}
   */
  function deadZones(stateOrGeom) {
    const g = stateOrGeom && Number.isFinite(stateOrGeom.xt) && Number.isFinite(stateOrGeom.vL) ? stateOrGeom : derive(stateOrGeom || {});
    const tau = DEAD_ZONE_CYCLES / (g.freq || 5);
    const pcs = g.pcs, vL = g.vL, T = g.T;
    const qL = Math.pow((pcs / vL + tau) * vL, 2) - pcs * pcs;
    const lateral = qL > 0 ? 0.5 * Math.sqrt(qL) : 0;
    const S = pcs / 2;
    const r = Math.sqrt(S * S + T * T) - vL * tau / 2;
    const qB = r * r - S * S;
    const backwall = qB > 0 ? Math.max(0, T - Math.sqrt(qB)) : T;
    return { lateral: +lateral.toFixed(3), backwall: +backwall.toFixed(3), tauUs: +tau.toFixed(4) };
  }

  /**
   * Optimum probe centre separation by the 2/3 T rule: pcs = 2·(2T/3)·tan θ (mm, 0.1 mm resolution).
   * @param {number} T  thickness (mm)
   * @param {number} angleDeg  nominal beam angle (deg)
   */
  function optimalPcs(T, angleDeg) {
    const th = M.deg2rad(M.clamp(+angleDeg || 60, 20, 80));
    return +M.clamp(2 * (2 * (+T || 20) / 3) * Math.tan(th), LIMITS.pcs[0], LIMITS.pcs[1]).toFixed(1);
  }

  /**
   * Diffraction hyperbola of a point at (pair centre, depth) seen along z: [{z, tUs}] (ABSOLUTE µs).
   * @param {object} g  derive() result
   * @param {{z:number, depth:number}} p
   * @param {number} [span=40]  ± mm along z
   * @param {number} [step=1]
   */
  function hyperbola(g, p, span, step) {
    const sp = Number.isFinite(span) ? Math.abs(span) : HYPERBOLA_SPAN;
    const st = Number.isFinite(step) && step > 0 ? step : 1;
    const xm = (g.xt + g.xr) / 2, d = Math.max(0, +p.depth || 0), z0 = +p.z || 0;
    const out = [];
    for (let dz = -sp; dz <= sp + 1e-9; dz += st) out.push({ z: z0 + dz, tUs: pointTime(xm, d, dz, g) });
    return out;
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
    if (b < a) { if (wrap) b += L; else { const tmp = a; a = b; b = tmp; } }
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
   * TOFD events (lateral, backwall, tip pairs, v2 mode-converted signals) for the probe pair at probeZ.
   * @param {object} spec
   * @param {object} g  derive() result (g.modeConv enables the converted events; opts.modeConv overrides)
   * @param {Array} defects
   * @param {number} probeZ
   * @param {{modeConv?:boolean}} [opts]
   * @returns {Array<{kind:string, tUs:number, depth:number, x:number, defectId:*, amp:number, polarity:number, mode:string}>}
   */
  function eventsAt(spec, g, defects, probeZ, opts) {
    const ev = [];
    const modeConv = opts && opts.modeConv !== undefined ? !!opts.modeConv : g.modeConv !== false;
    const vS = g.vS || C.V_SHEAR_STEEL;
    const lateralUs = g.pcs / g.vL + 2 * g.wd;
    ev.push({ kind: 'lateral', tUs: lateralUs, depth: 0, x: (g.xt + g.xr) / 2, defectId: null, dz: 0,
      amp: AMP_REL.lateral * Math.min(1, Math.sqrt(60 / g.pcs)), polarity: -1, mode: 'L' });
    const T = g.T;
    const xm = (g.xt + g.xr) / 2;
    const backwallUs = Math.sqrt(g.pcs * g.pcs + 4 * T * T) / g.vL + 2 * g.wd;
    ev.push({ kind: 'backwall', tUs: backwallUs, depth: T, x: xm, defectId: null, dz: 0,
      amp: AMP_REL.backwall * Math.max(0.15, dirWeight(xm, T, 0, g)), polarity: 1, mode: 'L' });
    if (modeConv) {
      const fm = fermatLS(g);
      const sgn = g.xt >= g.xr ? -1 : 1;             // reflection point lies fm.x from Tx toward Rx
      ev.push({ kind: 'modeconv-backwall', tUs: fm.tUs + 2 * g.wd, depth: T, x: g.xt + sgn * fm.x, defectId: null, dz: 0,
        amp: AMP_REL.modeconvBackwall, polarity: 1, mode: 'LS' });
      ev.push({ kind: 'modeconv-backwall-ss', tUs: 2 * Math.sqrt(g.pcs * g.pcs / 4 + T * T) / vS + 2 * g.wd, depth: T, x: xm, defectId: null, dz: 0,
        amp: AMP_REL.modeconvBackwallSS, polarity: 1, mode: 'SS' });
    }
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
          amp: base * w, polarity: it.polarity, mode: 'L', tip: it.kind });
        if (modeConv) {
          const sT = Math.sqrt((x - g.xt) * (x - g.xt) + y * y + dz * dz);
          const sR = Math.sqrt((x - g.xr) * (x - g.xr) + y * y + dz * dz);
          ev.push({ kind: 'modeconv-tip', tUs: sT / g.vL + sR / vS + 2 * g.wd, depth: y, x, defectId: d.id, n: d.n, dz,
            amp: base * w * (AMP_REL.modeconvTip / AMP_REL.tip), polarity: it.polarity, mode: 'LS', tip: it.kind });
        }
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
    const tt = new Float32Array(N);
    const t0 = 2 * g.wd + delayUs;
    for (let i = 0; i < N; i++) tt[i] = t0 + rangeUs * i / (N - 1);
    return tt;
  }

  /** RF grass amplitude at 40 dB for a material / frequency (v1's 0.015 for carbon at 5 MHz). */
  function grassLevel(material, freqMHz) {
    const gm = material && Number.isFinite(material.grass) ? material.grass : GRASS_MATERIAL_REF;
    const f = freqMHz || 5;
    return GRASS * (gm / GRASS_MATERIAL_REF) * (f / 5) * (f / 5);
  }

  /**
   * RF synthesis of events on the given time axis at gainDb (−1..1, clipped).
   * @param {Array} events
   * @param {Float32Array} tAxis  absolute µs
   * @param {number} gainDb
   * @param {number} freqMHz
   * @param {number} seed  grass seed (probe z)
   * @param {{grass?:number, shiftUs?:number}} [opts]  grass amplitude at 40 dB; time shift applied to every event
   */
  function synthRf(events, tAxis, gainDb, freqMHz, seed, opts) {
    const n = tAxis.length;
    const rf = new Float32Array(n);
    const dt = (tAxis[n - 1] - tAxis[0]) / (n - 1);
    const gLin = Math.pow(10, ((Number.isFinite(gainDb) ? gainDb : REF_GAIN_DB) - REF_GAIN_DB) / 20);
    const f = freqMHz || 5;
    const dur = WAVELET_CYCLES / f;
    const shift = opts && Number.isFinite(opts.shiftUs) ? opts.shiftUs : 0;
    for (const ev of events) {
      const a = ev.amp * ev.polarity * gLin;
      if (!a) continue;
      const tEv = ev.tUs + shift;
      let i0 = Math.ceil((tEv - tAxis[0]) / dt), i1 = Math.floor((tEv + dur - tAxis[0]) / dt);
      if (i1 < 0 || i0 > n - 1) continue;
      if (i0 < 0) i0 = 0;
      if (i1 > n - 1) i1 = n - 1;
      for (let i = i0; i <= i1; i++) {
        const tau = tAxis[i] - tEv;
        if (tau < 0 || tau > dur) continue;
        const win = Math.sin(Math.PI * tau / dur);
        rf[i] += a * Math.sin(2 * Math.PI * f * tau) * win * win;
      }
    }
    const r = M.rng(Math.round((seed || 0) * 13 + 7));
    const g0 = opts && Number.isFinite(opts.grass) ? opts.grass : GRASS;
    const grass = Math.min(0.1, g0 * gLin);
    for (let i = 0; i < n; i++) {
      const v = rf[i] + (r() - 0.5) * 2 * grass;
      rf[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    return rf;
  }

  /**
   * TOFD RF A-scan for one probe-pair position.
   * @param {{specimen:object, tofdGeom:object, defects:Array, tofd:object, probeZ:number, probes?:Array}} o
   * @returns {{t:Float32Array, rf:Float32Array, events:Array, lateralUs:number, backwallUs:number, wd:number, geom:object, rangeUs:number, delayUs:number, gainDb:number, probeZ:number, deadZones:{lateral:number, backwall:number}, modeConv:boolean}}
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
    const tAxis = timeAxis(tofd, g, N_SAMPLES);
    const rf = synthRf(events, tAxis, tofd.gainDb, g.freq, probeZ, { grass: grassLevel(g.material || materialOf(spec), g.freq) });
    const lat = events.find(function (e) { return e.kind === 'lateral'; });
    const bw = events.find(function (e) { return e.kind === 'backwall'; });
    const dz = deadZones(g);
    return {
      t: tAxis, rf, events,
      lateralUs: lat ? lat.tUs : g.pcs / g.vL + 2 * g.wd,
      backwallUs: bw ? bw.tUs : Math.sqrt(g.pcs * g.pcs + 4 * g.T * g.T) / g.vL + 2 * g.wd,
      wd: g.wd, geom: { xt: g.xt, xr: g.xr, pcs: g.pcs, angle: g.angle, vL: g.vL, vS: g.vS, T: g.T, wd: g.wd, probeX: g.probeX, freq: g.freq },
      rangeUs: M.clamp(+tofd.rangeUs || 15, 0.5, 200), delayUs: +tofd.delayUs || 0,
      gainDb: Number.isFinite(tofd.gainDb) ? tofd.gainDb : REF_GAIN_DB, probeZ,
      deadZones: { lateral: dz.lateral, backwall: dz.backwall, tauUs: dz.tauUs },
      modeConv: g.modeConv !== false,
    };
  }

  function activeDefects(state) { return (state.defects || []).filter(function (d) { return d && d.visible !== false; }); }

  /**
   * TOFD frame result for UT.compute (mode 'tofd'). Reads state, writes nothing.
   * @param {object} state  UT.state
   * @returns {object|null} TofdResult (incl. deadZones {lateral, backwall})
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

  /**
   * Apply the 2/3 T rule to the live state: tofd.pcs = 2·(2T/3)·tan(txAngle) (T under the pair centre).
   * @returns {number} the new pcs (mm)
   */
  function pcsOptimise() {
    const s = UT.state || {};
    const g = derive(s);
    const pcs = optimalPcs(g.T, g.angle);
    UT.setIn('tofd', { pcs });
    return pcs;
  }

  // ================================================================== D-scan
  /** Deterministic coupling / PCS wobble of the lateral wave along the scan (µs), removed by straightening. */
  function wanderUs(z, L) {
    const u = z / (L || 300);
    return WANDER_US[0] * Math.sin(2 * Math.PI * 1.3 * u) + WANDER_US[1] * Math.sin(2 * Math.PI * 3.7 * u + 1);
  }

  function scanShell(state) {
    const spec = state.specimen;
    const g = derive(state);
    const tofd = state.tofd || {};
    const L = (spec && spec.L) || 300;
    const step = 1;
    const n = Math.floor(L / step) + 1;
    const tAxis = timeAxis(tofd, g, N_SAMPLES);
    const dz = deadZones(g);
    return {
      z0: 0, z1: (n - 1) * step, step, n, columns: [], nS: N_SAMPLES,
      t0Us: +tofd.delayUs || 0, rangeUs: M.clamp(+tofd.rangeUs || 15, 0.5, 200), gainDb: tofd.gainDb,
      pcs: g.pcs, txAngle: g.angle, wd: g.wd, T: g.T, done: false,
      lateralUs: g.pcs / g.vL + 2 * g.wd, backwallUs: Math.sqrt(g.pcs * g.pcs + 4 * g.T * g.T) / g.vL + 2 * g.wd,
      latUs: new Float32Array(n), deadZones: { lateral: dz.lateral, backwall: dz.backwall, tauUs: dz.tauUs },
      modeConv: g.modeConv !== false,
      _g: g, _t: tAxis, _defects: activeDefects(state), _spec: spec, _L: L, _grass: grassLevel(g.material, g.freq),
    };
  }

  function scanColumn(sc, i) {
    const z = sc.z0 + i * sc.step;
    const evs = eventsAt(sc._spec, sc._g, sc._defects, z);
    const shift = wanderUs(z, sc._L);
    sc.latUs[i] = sc.lateralUs + shift;
    const rf = synthRf(evs, sc._t, sc.gainDb, sc._g.freq, z, { grass: sc._grass, shiftUs: shift });
    const col = new Float32Array(sc.nS);
    for (let k = 0; k < sc.nS; k++) col[k] = M.clamp(0.5 + rf[k] * DSCAN_CONTRAST, 0, 1);
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
   * @returns {{z0:number, z1:number, step:number, n:number, columns:Float32Array[], latUs:Float32Array, lateralUs:number, deadZones:object}|null}
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

  /** Per-column time shift (µs) that straightens the lateral wave (0 when the scan has no latUs). */
  function columnShift(sc, i) {
    if (!sc || !sc.latUs || !(i >= 0 && i < sc.latUs.length) || !Number.isFinite(sc.lateralUs)) return 0;
    const v = sc.latUs[i];
    return Number.isFinite(v) ? v - sc.lateralUs : 0;
  }

  // ================================================================== cursor (state.cursor, view 'dscan')
  let inRender = false;   // true while panel.draw runs (the 'render' listener) — cursor writes are deferred then

  function cursorPatch(tAbs, depth, z) {
    return { x: null, y: +depth.toFixed(2), view: 'dscan', tUs: +tAbs.toFixed(4), depth: +depth.toFixed(2), z: +z.toFixed(2) };
  }
  function writeCursor(patch) {
    const cur = UT.state.cursor || {};
    if (cur.view === 'dscan' && cur.tUs === patch.tUs && cur.depth === patch.depth && cur.z === patch.z) return;
    UT.set({ cursor: patch }, { noRender: true });
  }
  function clearCursor() {
    const cur = UT.state.cursor || {};
    if (cur.view !== 'dscan') return;
    UT.set({ cursor: { x: null, y: null, view: null, tUs: null, depth: null, z: null } }, { noRender: true });
  }

  /**
   * Cursor for a D-scan point on the pair centre-line (pure): {x:null, y, view:'dscan', tUs (absolute), depth, z}.
   * @param {object} state  UT.state-like
   * @param {{z:number, depth?:number, tUs?:number}} p  depth (mm) or absolute tUs
   */
  function cursorFor(state, p) {
    const g = derive(state || {});
    const z = Number.isFinite(+p.z) ? +p.z : ((state && state.probe && state.probe.z) || 0);
    let tAbs, depth;
    if (Number.isFinite(+p.tUs)) { tAbs = +p.tUs; depth = depthFromTime(tAbs, g); }
    else { depth = Math.max(0, +p.depth || 0); tAbs = pointTime((g.xt + g.xr) / 2, depth, 0, g); }
    return cursorPatch(tAbs, depth, z);
  }

  /**
   * Place the hyperbolic D-scan cursor at (z, depth) [or absolute tUs] and write state.cursor
   * {view:'dscan', tUs, depth, z}. Deferred with setTimeout(0) when called during a 'render'.
   * @param {{z:number, depth?:number, tUs?:number}} p
   * @returns {object} the cursor patch
   */
  function cursorAt(p) {
    const patch = cursorFor(UT.state, p || {});
    ui.hover = { tUs: patch.tUs - 2 * derive(UT.state).wd, z: patch.z, depth: patch.depth };
    if (inRender) setTimeout(function () { writeCursor(patch); UT.requestRender(); }, 0);
    else { writeCursor(patch); UT.requestRender(); }
    return patch;
  }

  // ================================================================== panel (DOM)
  const css = [
    '.win[data-win=tofd] .win-body{padding:0;background:#000;overflow:hidden}',
    '.win[data-win=tofd] .tofd-top{display:flex;align-items:stretch;height:36px;background:#000}',
    '.tofd-docked{visibility:hidden}',
    '.win[data-win=tofd] .tofd-run{width:140px;margin:0;padding:0;font:bold 17px "Segoe UI",Arial,sans-serif;color:#000;background:#ececec;border:2px outset #fff;cursor:pointer}',
    '.win[data-win=tofd] .tofd-run.running{background:#ffe08a}',
    '.win[data-win=tofd] .tofd-clear{width:60px;margin:0 0 0 4px;padding:0;font:12px "Segoe UI",Arial,sans-serif;color:#000;background:#d8d8d8;border:2px outset #eee;cursor:pointer}',
    '.win[data-win=tofd] #cv-tofd-dscan{display:block;width:280px;height:450px;cursor:crosshair;background:#000;touch-action:none}',
    '.win[data-win=tofd-ascan] .win-body{padding:3px;background:#fdfbd8}',
    '.win[data-win=tofd-ascan] #cv-tofd-ascan{display:block;width:236px;height:140px;touch-action:none}',
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
    '.win[data-win=tofd-ascan] .tofd-extra{display:flex;flex-wrap:wrap;gap:3px 10px;align-items:center;margin-top:3px;max-width:100%;overflow:hidden;font:11px "Segoe UI",Arial,sans-serif;color:#000}',
    '.win[data-win=tofd-ascan] .tofd-extra .fld{display:flex;flex:0 0 auto;align-items:center;gap:3px;margin:0;min-width:0}',
    '.win[data-win=tofd-ascan] .tofd-extra .fld-label{flex:0 0 auto;width:auto;text-align:left;font-size:11px;white-space:nowrap}',
    '.win[data-win=tofd-ascan] .tofd-extra .fld-input{flex:0 0 auto;width:48px;min-width:0;box-sizing:border-box;font-size:11px;padding:1px 2px}',
    '.win[data-win=tofd-ascan] .tofd-extra select.fld-input{width:52px}',
    '.win[data-win=tofd-ascan] .tofd-extra input[type=checkbox].fld-input{width:13px;height:13px;margin:0;padding:0}',
    '.win[data-win=tofd-ascan] .tofd-opt{height:18px;padding:0 6px;margin:0;font:11px "Segoe UI",Arial,sans-serif;color:#000;background:#dfe9d0;border:1px outset #eee;cursor:pointer;white-space:nowrap}',
    '.win[data-win=tofd-ascan] .tofd-v2{gap:3px 7px}',
  ].join('\n');

  const ui = {
    win: null, ascanWin: null, dscan: null, ascan: null, runBtn: null,
    inputs: {}, hover: null /* {tUs wedge-zeroed, z, depth} */, subscribed: false, leaving: false, syncing: false,
    pointerDown: false,
  };

  function tofdState() { return UT.state.tofd || {}; }
  function setTofd(patch) { UT.setIn('tofd', patch); }
  function clampField(key, v) { const l = LIMITS[key]; return l ? M.clamp(v, l[0], l[1]) : v; }
  function validAngle(a) { return TOFD_ANGLES.indexOf(+a) >= 0; }
  function presetMode(a) { const p = UT.probe && UT.probe.presetFor ? UT.probe.presetFor(a) : (UT.probe && UT.probe.presets ? UT.probe.presets[a] : null); return p ? p.mode : 'shear'; }
  function setProbeAngle(a) { UT.setIn('probe', { angle: +a, mode: presetMode(+a) }); }

  /**
   * Keep probe.angle (toolbar 45/60/70 radio, status physics line) and tofd.txAngle (panel select,
   * TOFD physics/drawing) equal while in TOFD mode. probe/mode keys: the toolbar wins when it holds a
   * TOFD angle, otherwise the probe follows txAngle; tofd key alone: the probe follows txAngle.
   * @param {string[]} keys  the 'state' event keys
   */
  function syncAngle(keys) {
    if (ui.syncing || !UT.state || UT.state.mode !== 'tofd') return;
    const s = UT.state, tf = s.tofd || {}, p = s.probe || {};
    ui.syncing = true;
    try {
      if (keys.indexOf('probe') >= 0 || keys.indexOf('mode') >= 0) {
        if (validAngle(p.angle)) { if (+tf.txAngle !== +p.angle) setTofd({ txAngle: +p.angle }); }
        else if (validAngle(tf.txAngle) && +p.angle !== +tf.txAngle) setProbeAngle(tf.txAngle);
      } else if (keys.indexOf('tofd') >= 0 && validAngle(tf.txAngle) && +p.angle !== +tf.txAngle) setProbeAngle(tf.txAngle);
    } finally { ui.syncing = false; }
  }
  UT.bus.on('state', function (ev) { syncAngle((ev && ev.keys) || []); });

  /** Hide/restore the flaw detector while the D-scan panel is docked in its column (§14.6 look). */
  function dockInstrument(docked) {
    const el = typeof document !== 'undefined' ? document.getElementById('instrument') : null;
    if (el) el.classList.toggle('tofd-docked', !!docked);
  }
  UT.bus.on('win:show', function (w) { if (w && w.name === 'tofd') dockInstrument(true); });
  UT.bus.on('win:hide', function (w) { if (w && w.name === 'tofd') dockInstrument(false); });
  UT.bus.on('win:close', function (w) { if (w && w.name === 'tofd') dockInstrument(false); });

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
    const runBtn = UT.dom.h('button', { class: 'tofd-run', type: 'button', title: t('Build the D-scan image along the weld') }, t('Run Scan'));
    runBtn.addEventListener('click', function () { if (isScanning()) stopScan(); else startScan(); syncInputs(); UT.requestRender(); });
    const clearBtn = UT.dom.h('button', { class: 'tofd-clear', type: 'button', title: t('Clear the D-scan image') }, t('Clear'));
    clearBtn.addEventListener('click', function () { stopScan(true); setTofd({ scan: null, running: false }); });
    const cv = UT.dom.h('canvas', { id: 'cv-tofd-dscan', width: DSCAN.w, height: DSCAN.h, 'aria-label': t('TOFD D-scan: hover for the hyperbolic cursor, click to move the probe') });
    cv.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      ui.pointerDown = true;
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      onDscanPointer(e, true);
    });
    cv.addEventListener('pointermove', function (e) { onDscanPointer(e, false); });
    const up = function (e) {
      ui.pointerDown = false;
      try { if (cv.hasPointerCapture && cv.hasPointerCapture(e.pointerId)) cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (e.pointerType !== 'mouse') { ui.hover = null; UT.requestRender(); }   // touch: no hover after lift
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', function () { if (!ui.pointerDown) { ui.hover = null; clearCursor(); UT.requestRender(); } });
    const content = UT.dom.h('div', { class: 'tofd-panel' }, [UT.dom.h('div', { class: 'tofd-top' }, [runBtn, clearBtn]), cv]);
    const inst = anchorRect('instrument');
    const k = UT.dom.scale ? UT.dom.scale() : 1;
    ui.win = UT.dom.win({
      name: 'tofd', title: 'TOFD', w: 290, x: inst ? Math.max(0, Math.round(inst.left / k)) : 4, y: inst ? Math.max(0, Math.round(inst.top / k)) : 96,
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

  /** Pointer hover/click on the D-scan image: hyperbolic cursor + state.cursor; click also moves probe.z. */
  function onDscanPointer(e, click) {
    const p = UT.dom.localPos(e, ui.dscan);
    const zr = dscanZRange();
    const tf = tofdState();
    const rangeUs = M.clamp(+tf.rangeUs || 15, 0.5, 200), delayUs = +tf.delayUs || 0;
    if (p.x < 0 || p.x >= DSCAN.imgW || p.y < 0 || p.y >= DSCAN.h) { ui.hover = null; clearCursor(); UT.requestRender(); return; }
    const z = zr.z0 + (zr.z1 - zr.z0) * p.y / (DSCAN.h - 1);
    const tUs = delayUs + rangeUs * p.x / (DSCAN.imgW - 1);
    const g = derive(UT.state);
    const tAbs = tUs + 2 * g.wd;
    const depth = depthFromTime(tAbs, g);
    ui.hover = { tUs, z, depth };
    writeCursor(cursorPatch(tAbs, depth, z));
    if (click) {
      const spec = UT.state.specimen;
      UT.setIn('probe', { z: M.clamp(Math.round(z), 0, (spec && spec.L) || z) });
      e.preventDefault();
    } else UT.requestRender();
  }

  function sliderRow(label, key, min, max, step, btnStep) {
    const input = UT.dom.h('input', { type: 'range', min, max, step, title: t(label) });
    input.value = clampField(key, +tofdState()[key] || min);
    const apply = function (v) { const patch = {}; patch[key] = +clampField(key, v).toFixed(2); setTofd(patch); };
    input.addEventListener('input', function () { apply(parseFloat(input.value)); });
    const dec = UT.dom.h('button', { type: 'button', title: t(label) + ' −' }, '◀');
    const inc = UT.dom.h('button', { type: 'button', title: t(label) + ' +' }, '▶');
    dec.addEventListener('click', function () { apply((+tofdState()[key] || 0) - btnStep); });
    inc.addEventListener('click', function () { apply((+tofdState()[key] || 0) + btnStep); });
    ui.inputs[key] = input;
    return UT.dom.h('div', { class: 'tofd-slider' }, [dec, input, inc, UT.dom.h('span', { i18n: label })]);
  }

  function buildAscanWindow() {
    const cv = UT.dom.h('canvas', { id: 'cv-tofd-ascan', width: ASCAN.w, height: ASCAN.h, 'aria-label': t('TOFD RF A-scan') });
    cv.addEventListener('wheel', function (e) {
      e.preventDefault();
      setTofd({ gainDb: clampField('gainDb', (+tofdState().gainDb || 0) + (e.deltaY < 0 ? 1 : -1)) });
    }, { passive: false });
    const sliders = UT.dom.h('div', { class: 'tofd-sliders' }, [
      sliderRow('Range', 'rangeUs', LIMITS.rangeUs[0], LIMITS.rangeUs[1], 0.5, 1),
      sliderRow('X-Shift', 'delayUs', LIMITS.delayUs[0], LIMITS.delayUs[1], 0.25, 0.5),
    ]);
    const amp = UT.dom.h('input', { type: 'range', min: LIMITS.gainDb[0], max: LIMITS.gainDb[1], step: 1, orient: 'vertical', title: t('AMP (dB)') });
    amp.value = clampField('gainDb', +tofdState().gainDb || REF_GAIN_DB);
    amp.addEventListener('input', function () { setTofd({ gainDb: clampField('gainDb', parseFloat(amp.value)) }); });
    ui.inputs.gainDb = amp;
    const ampVal = UT.dom.h('span', { class: 'tofd-amp-val' }, amp.value + 'dB');
    ui.inputs.gainLabel = ampVal;
    const ampBox = UT.dom.h('div', { class: 'tofd-amp' }, [amp, UT.dom.h('span', { i18n: 'AMP' }), ampVal]);
    const off = UT.dom.h('button', { class: 'tofd-off', type: 'button', title: t('Close TOFD') }, 'OFF');
    off.addEventListener('click', function () { leave(); });
    const pcs = UT.dom.field('PCS', { type: 'number', value: tofdState().pcs || 60, min: LIMITS.pcs[0], max: LIMITS.pcs[1], step: 1, title: t('Probe centre separation (mm)'),
      onchange: function (v) { if (Number.isFinite(v)) setTofd({ pcs: clampField('pcs', v) }); } });
    const ang = UT.dom.field('Angle', { tag: 'select', type: 'number', value: tofdState().txAngle || 60, options: [45, 60, 70], title: t('Probe angle (compression)'),
      onchange: function (v) {
        const a = parseFloat(v);
        if (!validAngle(a)) return;
        setTofd({ txAngle: a });
        if (UT.state.mode === 'tofd' && +UT.state.probe.angle !== a) setProbeAngle(a);   // toolbar radio + status follow
      } });
    ui.inputs.pcs = pcs.input;
    ui.inputs.txAngle = ang.input;
    // v2 controls: PCS optimiser (2/3 T rule) + physics/display toggles
    const opt = UT.dom.h('button', { class: 'tofd-opt', type: 'button', i18n: 'Optimise PCS', title: t('2/3 T rule: PCS = 2·(2T/3)·tan θ') });
    opt.addEventListener('click', function () { pcsOptimise(); });
    const chk = function (label, key, title) {
      const f = UT.dom.field(label, { type: 'checkbox', value: !!tofdState()[key], title: t(title), onchange: function (v) { const patch = {}; patch[key] = !!v; setTofd(patch); } });
      ui.inputs[key] = f.input;
      return f;
    };
    const content = UT.dom.h('div', { class: 'tofd-ascan-panel' }, [
      cv,
      UT.dom.h('div', { class: 'tofd-ctl' }, [sliders, ampBox, off]),
      UT.dom.h('div', { class: 'tofd-extra' }, [pcs, ang, opt]),
      UT.dom.h('div', { class: 'tofd-extra tofd-v2' }, [
        chk('Mode conv.', 'modeConv', 'Mode-converted backwall (L-S Fermat path), S-S replica and converted tip signals'),
        chk('Straighten', 'straighten', 'Align the lateral wave of the D-scan to a flat line'),
        chk('Dead zones', 'deadZones', 'Shade the lateral-wave and backwall dead zones'),
      ]),
    ]);
    const plan = anchorRect('cv-plan');
    const k = UT.dom.scale ? UT.dom.scale() : 1;
    ui.ascanWin = UT.dom.win({
      name: 'tofd-ascan', title: 'TOFD A-Scan', w: 246,
      x: plan ? Math.max(0, Math.round(plan.right / k - 150 - 246)) : 700, y: plan ? Math.max(0, Math.round(plan.top / k + 24)) : 130,
      content, onClose: function () { leave(); },
    });
    ui.ascan = cv;
  }

  function syncInputs() {
    const tf = tofdState();
    const set = function (key, v) { const el = ui.inputs[key]; if (el && document.activeElement !== el && String(el.value) !== String(v)) el.value = v; };
    const setChk = function (key, v) { const el = ui.inputs[key]; if (el && el.checked !== !!v) el.checked = !!v; };
    set('rangeUs', +tf.rangeUs || 15);
    set('delayUs', +tf.delayUs || 0);
    set('gainDb', Number.isFinite(tf.gainDb) ? tf.gainDb : REF_GAIN_DB);
    set('pcs', tf.pcs || 60);
    set('txAngle', tf.txAngle || 60);
    setChk('modeConv', tf.modeConv !== false);
    setChk('straighten', tf.straighten);
    setChk('deadZones', tf.deadZones);
    if (ui.inputs.gainLabel) ui.inputs.gainLabel.textContent = Math.round(Number.isFinite(tf.gainDb) ? tf.gainDb : REF_GAIN_DB) + 'dB';
    if (ui.runBtn) {
      const running = isScanning() || !!tf.running;
      const label = running ? t('Stop Scan') : t('Run Scan');
      if (ui.runBtn.textContent !== label) ui.runBtn.textContent = label;
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
      const xOf = function (tAbs) { return ASCAN.plotW * (tAbs - 2 * res.wd - res.delayUs) / res.rangeUs; };
      // dead-zone bands (time): [tL, tL + τ] and [tB − τ, tB]
      if (state.tofd && state.tofd.deadZones && res.deadZones) {
        const tau = res.deadZones.tauUs || DEAD_ZONE_CYCLES / ((res.geom && res.geom.freq) || 5);
        ctx.fillStyle = 'rgba(255,40,40,0.22)';
        const band = function (a, b) { const x0 = M.clamp(xOf(a), 0, ASCAN.plotW), x1 = M.clamp(xOf(b), 0, ASCAN.plotW); if (x1 > x0) ctx.fillRect(x0, 0, x1 - x0, ASCAN.plotH); };
        band(res.lateralUs, res.lateralUs + tau);
        band(res.backwallUs - tau, res.backwallUs);
      }
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
      // mode-converted signal markers (LS / SS) at the top edge; amber hint when they lie beyond the range
      if (res.modeConv) {
        ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        let beyond = false;
        for (const ev of res.events) {
          if (ev.kind !== 'modeconv-backwall' && ev.kind !== 'modeconv-backwall-ss') continue;
          const x = xOf(ev.tUs);
          if (x < 0 || x > ASCAN.plotW) { beyond = true; continue; }
          ctx.fillStyle = '#ffb020';
          ctx.fillRect(Math.round(x) - 0.5, 0, 2, 5);
          ctx.fillText(ev.mode, M.clamp(x, 8, ASCAN.plotW - 8), 5);
        }
        if (beyond) { ctx.fillStyle = '#ffb020'; ctx.textAlign = 'right'; ctx.fillText(t('mode conv. beyond range ▶'), ASCAN.plotW - 3, 2); }
      }
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

  /**
   * Grey (0..1) of the D-scan pixel (px, py); −1 outside the scan. Each pixel covers `binPx` screen
   * pixels of time: the signed extreme (farthest from mid grey) of the samples in that bin is used
   * (peak hold) so the short RF wavelets survive the 512-sample → 140-px resampling as solid stripes.
   * `straighten` reads each column shifted by its lateral-wave wander so the lateral wave is flat.
   */
  function greyAt(sc, zr, rangeUs, delayUs, px, py, binPx, straighten) {
    const z = zr.z0 + (zr.z1 - zr.z0) * py / (DSCAN.h - 1);
    const i = Math.round((z - sc.z0) / sc.step);
    if (i < 0 || i >= sc.columns.length) return -1;
    const col = sc.columns[i];
    const half = (binPx || 1) / 2;
    const sPerPx = rangeUs / (DSCAN.imgW - 1) / sc.rangeUs * (sc.nS - 1);   // scan samples per screen pixel
    const shift = straighten ? columnShift(sc, i) : 0;
    const jc = (delayUs + rangeUs * px / (DSCAN.imgW - 1) + shift - sc.t0Us) / sc.rangeUs * (sc.nS - 1);
    let j0 = Math.ceil(jc - half * sPerPx), j1 = Math.floor(jc + half * sPerPx);
    if (j1 < j0) j0 = j1 = Math.round(jc);
    if (j1 < 0 || j0 >= sc.nS) return -1;
    if (j0 < 0) j0 = 0;
    if (j1 > sc.nS - 1) j1 = sc.nS - 1;
    let best = col[j0], dev = Math.abs(best - 0.5);
    for (let j = j0 + 1; j <= j1; j++) { const d = Math.abs(col[j] - 0.5); if (d > dev) { dev = d; best = col[j]; } }
    return best;
  }

  function drawDscan(frame, state) {
    const cv = ui.dscan;
    if (!cv) return;
    const ctx = UT.dom.fitCanvas(cv, DSCAN.w, DSCAN.h);
    const tf = state.tofd || {};
    const sc = tf.scan && Array.isArray(tf.scan.columns) ? tf.scan : null;
    const zr = dscanZRange();
    const rangeUs = M.clamp(+tf.rangeUs || 15, 0.5, 200), delayUs = +tf.delayUs || 0;
    const straighten = !!tf.straighten;
    const res = frame && frame.tofd;
    const g = res && res.geom ? res.geom : derive(state);
    const wd = res ? res.wd : g.wd;
    const xOfT = function (tWz) { return (tWz - delayUs) / rangeUs * (DSCAN.imgW - 1); };
    const yOfZ = function (z) { return (z - zr.z0) / (zr.z1 - zr.z0) * (DSCAN.h - 1); };
    ctx.save();
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, DSCAN.w, DSCAN.h);
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, DSCAN.imgW, DSCAN.h);
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(DSCAN.imgW, 0, DSCAN.miniW, DSCAN.miniH);
    const probeZ = state.probe.z || 0;
    const zRow = M.clamp(yOfZ(probeZ), 0, DSCAN.h - 1);
    if (sc && sc.columns.length) {
      const img = ctx.createImageData(DSCAN.imgW, DSCAN.h);
      const d = img.data;
      for (let py = 0; py < DSCAN.h; py++) {
        for (let px = 0; px < DSCAN.imgW; px++) {
          const v = greyAt(sc, zr, rangeUs, delayUs, px, py, 1, straighten);
          const gv = v < 0 ? 0 : Math.round(M.clamp(v, 0, 1) * 255);
          const k = (py * DSCAN.imgW + px) * 4;
          d[k] = gv; d[k + 1] = gv; d[k + 2] = gv; d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      // magnifier: 2× zoom of a 70 × 70 px region around the crosshair
      const hx = ui.hover ? xOfT(ui.hover.tUs) : (res ? xOfT(res.lateralUs - 2 * res.wd) : 0);
      const cx = M.clamp(Math.round(hx), 35, DSCAN.imgW - 35), cy = M.clamp(Math.round(zRow), 35, DSCAN.h - 35);
      const mini = ctx.createImageData(DSCAN.miniW, DSCAN.miniH);
      const md = mini.data;
      for (let py = 0; py < DSCAN.miniH; py++) {
        for (let px = 0; px < DSCAN.miniW; px++) {
          const v = greyAt(sc, zr, rangeUs, delayUs, cx - 35 + px / 2, cy - 35 + py / 2, 0.5, straighten);
          const gv = v < 0 ? 0 : Math.round(M.clamp(v, 0, 1) * 255);
          const k = (py * DSCAN.miniW + px) * 4;
          md[k] = gv; md[k + 1] = gv; md[k + 2] = gv; md[k + 3] = 255;
        }
      }
      ctx.putImageData(mini, DSCAN.imgW, 0);
      if (!sc.done && sc.columns.length < sc.n) {
        const py = yOfZ(sc.z0 + (sc.columns.length - 1) * sc.step);
        ctx.strokeStyle = '#00e000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Math.round(py) + 0.5); ctx.lineTo(DSCAN.imgW, Math.round(py) + 0.5); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#9a9a9a';
      ctx.font = '11px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('press Run Scan'), DSCAN.imgW / 2, 24);
    }
    // dead zones (v2): red bands over [tL, tL + τ] and [tB − τ, tB] (wedge-zeroed screen time)
    const lateralWz = (res ? res.lateralUs : g.pcs / g.vL + 2 * wd) - 2 * wd;
    const backwallWz = (res ? res.backwallUs : Math.sqrt(g.pcs * g.pcs + 4 * g.T * g.T) / g.vL + 2 * wd) - 2 * wd;
    if (tf.deadZones) {
      const dz = (res && res.deadZones) || deadZones(state);
      const tau = dz.tauUs || DEAD_ZONE_CYCLES / (g.freq || 5);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, DSCAN.imgW, DSCAN.h); ctx.clip();
      const band = function (a, b, label, row) {
        const x0 = xOfT(a), x1 = xOfT(b);
        if (x1 <= 0 || x0 >= DSCAN.imgW) return;
        ctx.fillStyle = 'rgba(224,0,0,0.28)';
        ctx.fillRect(x0, 0, x1 - x0, DSCAN.h);
        ctx.strokeStyle = 'rgba(255,80,80,0.6)'; ctx.lineWidth = 1;
        for (let x = x0 - 8; x < x1; x += 6) { ctx.beginPath(); ctx.moveTo(x, DSCAN.h); ctx.lineTo(x + 8, DSCAN.h - 8); ctx.stroke(); }
        // labels on staggered rows (the two bands are often only a few px apart); measured and kept
        // inside the image area so the text is never cut by the clip at DSCAN.imgW
        ctx.fillStyle = '#ff9090'; ctx.font = '9px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, M.clamp(x0 + 2, 0, Math.max(0, DSCAN.imgW - tw - 2)), DSCAN.h - 10 - 12 * row);
      };
      band(lateralWz, lateralWz + tau, t('LW dead {mm} mm', { mm: dz.lateral.toFixed(1) }), 1);
      band(backwallWz - tau, backwallWz, t('BW dead {mm} mm', { mm: dz.backwall.toFixed(1) }), 0);
      ctx.restore();
    }
    // straightening marker: the lateral wave is aligned to a flat line (yellow)
    if (straighten) {
      const x = xOfT(lateralWz);
      if (x >= 0 && x < DSCAN.imgW) {
        ctx.strokeStyle = '#ffe000'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, DSCAN.h); ctx.stroke();
        ctx.fillStyle = '#ffe000'; ctx.font = '9px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(t('LW'), Math.min(x + 3, DSCAN.imgW - 16), 2);
      }
    }
    // hyperbolic cursor (v2): diffraction arc of a point at the hovered depth, z ± 40 mm
    if (ui.hover && ui.hover.depth > 0) {
      const pts = hyperbola(Object.assign({}, g, { wd }), { z: ui.hover.z, depth: ui.hover.depth }, HYPERBOLA_SPAN, 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, DSCAN.imgW, DSCAN.h); ctx.clip();
      ctx.strokeStyle = 'rgba(0,255,255,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      let first = true;
      for (const p of pts) {
        const x = xOfT(p.tUs - 2 * wd), y = yOfZ(p.z);
        if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#7ff7ff'; ctx.font = '10px "Segoe UI", Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(t('d {mm} mm  z {z}', { mm: ui.hover.depth.toFixed(1), z: Math.round(ui.hover.z) }), DSCAN.imgW + 4, DSCAN.miniH + 4);
      ctx.fillText(t('t {us} µs', { us: ui.hover.tUs.toFixed(2) }), DSCAN.imgW + 4, DSCAN.miniH + 16);
    }
    // crosshair: horizontal at probe.z (full width), vertical at hover / lateral time (image only)
    ctx.strokeStyle = '#ff2020';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(zRow) + 0.5); ctx.lineTo(DSCAN.w, Math.round(zRow) + 0.5);
    let tv = null;
    if (ui.hover) tv = ui.hover.tUs;
    else if (res) tv = res.lateralUs - 2 * res.wd;
    if (tv !== null) {
      const x = xOfT(tv);
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
      const py = yOfZ(z);
      ctx.fillRect(0, Math.round(py), 4, 1);
      if (py > 6 && py < DSCAN.h - 6) ctx.fillText(String(z), 6, py);
    }
    ctx.restore();
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
        UT.bus.on('lang', function () { syncInputs(); UT.requestRender(); });
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
    /** Draw both canvases from the frame (no-op while hidden). Never writes state. */
    draw(frame) {
      if (!panel.isOpen() && !(ui.ascanWin && ui.ascanWin.isOpen())) return;
      const state = UT.state;
      inRender = true;
      try {
        syncInputs();
        if (ui.win && ui.win.isOpen()) drawDscan(frame, state);
        if (ui.ascanWin && ui.ascanWin.isOpen()) drawAscan(frame, state);
      } catch (e) { console.error('[UT.tofd.panel]', e); }
      finally { inRender = false; }
    },
  };

  // ================================================================== test API
  function testTofd() {
    let res = UT.frame && UT.frame.tofd;
    if (!res) res = compute(UT.state);
    if (!res) return { events: [], lateralUs: null, backwallUs: null, deadZones: null };
    return {
      events: res.events.map(function (e) { return { kind: e.kind, tUs: +e.tUs.toFixed(4), depth: +e.depth.toFixed(3), defectId: e.defectId === undefined ? null : e.defectId, amp: +e.amp.toFixed(4), mode: e.mode || 'L', x: +(+e.x).toFixed(3) }; }),
      lateralUs: +res.lateralUs.toFixed(4), backwallUs: +res.backwallUs.toFixed(4), wd: +res.wd.toFixed(4),
      deadZones: { lateral: +res.deadZones.lateral.toFixed(3), backwall: +res.deadZones.backwall.toFixed(3) },
      modeConv: !!res.modeConv,
    };
  }
  function testRunTofdScan() {
    stopScan(true);
    const sc = runScan(UT.state, { sync: true });
    if (!sc) return null;
    UT.setIn('tofd', { scan: sc, running: false });
    return { z0: sc.z0, z1: sc.z1, step: sc.step, n: sc.n };
  }
  function testPcsOptimise() {
    const pcs = pcsOptimise();
    UT.renderNow();
    return pcs;
  }
  function testTofdCursor(p) {
    const c = cursorAt(p || {});
    UT.renderNow();
    return c;
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
      if (Math.abs(g.vS - 3.24) > 1e-9) f.push('vS ' + g.vS);
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
      // --- v2: mode conversion (V2-10)
      const mcb = res.events.find(function (e) { return e.kind === 'modeconv-backwall'; });
      const mss = res.events.find(function (e) { return e.kind === 'modeconv-backwall-ss'; });
      if (!mcb || Math.abs(mcb.tUs - 24.77) > 0.05) f.push('modeconv-backwall ' + (mcb ? mcb.tUs.toFixed(3) : 'missing'));
      if (mcb && Math.abs(Math.abs(mcb.x - g.xt) - 48.2) > 0.3) f.push('fermat x ' + (mcb ? Math.abs(mcb.x - g.xt).toFixed(2) : '?'));
      if (!mss || Math.abs(mss.tUs - 31.02) > 0.05) f.push('modeconv-backwall-ss ' + (mss ? mss.tUs.toFixed(3) : 'missing'));
      if (mcb && !(mcb.amp === AMP_REL.modeconvBackwall && mcb.polarity === 1)) f.push('modeconv-backwall amp/phase');
      const mct = res.events.filter(function (e) { return e.kind === 'modeconv-tip'; });
      if (mct.length !== 2) f.push('modeconv-tip count ' + mct.length);
      for (const e of mct) {
        const tipE = res.events.find(function (q) { return q.kind === e.tip; });
        const expect = 2 * g.wd + Math.hypot(e.x - g.xt, e.depth) / g.vL + Math.hypot(e.x - g.xr, e.depth) / g.vS;
        if (Math.abs(e.tUs - expect) > 1e-6 || !(e.tUs > res.backwallUs)) f.push('modeconv-tip time ' + e.tUs.toFixed(3));
        if (tipE && Math.abs(e.amp / tipE.amp - AMP_REL.modeconvTip / AMP_REL.tip) > 1e-9) f.push('modeconv-tip amp');
      }
      const off = eventsAt(st.specimen, g, st.defects, 135, { modeConv: false });
      if (off.some(function (e) { return MODECONV_KINDS[e.kind]; })) f.push('modeconv events with modeConv off');
      const st2 = UT.clone(Object.assign({}, st, { specimen: null })); st2.specimen = st.specimen; st2.tofd.modeConv = false;
      if (compute(st2).events.some(function (e) { return MODECONV_KINDS[e.kind]; })) f.push('tofd.modeConv=false not honoured');
      if (!res.events.every(function (e) { return typeof e.mode === 'string'; })) f.push('event mode tags');
      // --- v2: dead zones
      const dz = deadZones(st);
      if (Math.abs(dz.lateral - 7.34) > 0.05) f.push('dead zone lateral ' + dz.lateral);
      if (Math.abs(dz.backwall - 1.64) > 0.05) f.push('dead zone backwall ' + dz.backwall);
      if (!res.deadZones || res.deadZones.lateral !== dz.lateral || res.deadZones.backwall !== dz.backwall) f.push('TofdResult.deadZones');
      if (Math.abs(deadZones(g).lateral - dz.lateral) > 1e-9) f.push('deadZones(geom)');
      // --- v2: PCS optimiser, hyperbola, cursor helper
      if (Math.abs(optimalPcs(20, 60) - 46.2) > 0.05) f.push('optimalPcs ' + optimalPcs(20, 60));
      const hyp = hyperbola(g, { z: 135, depth: 8 }, 40, 1);
      if (hyp.length !== 81 || Math.abs(hyp[40].tUs - pointTime(0, 8, 0, g)) > 1e-9 || !(hyp[0].tUs > hyp[40].tUs) || Math.abs(hyp[0].tUs - hyp[80].tUs) > 1e-9) f.push('hyperbola');
      const cur = cursorFor(st, { z: 135, depth: 8 });
      if (cur.view !== 'dscan' || Math.abs(cur.depth - 8) > 1e-9 || cur.z !== 135 || Math.abs(depthFromTime(cur.tUs, g) - 8) > 0.01 || cur.y !== cur.depth) f.push('cursorFor ' + JSON.stringify(cur));
      const cur2 = cursorFor(st, { z: 10, tUs: res.backwallUs });
      if (Math.abs(cur2.depth - 20) > 0.05) f.push('cursorFor(tUs) ' + cur2.depth);
      // --- v2: material grass (austenitic ≫ carbon), v1 grass level for carbon
      if (Math.abs(grassLevel(UT.specimens.materials.carbon, 5) - GRASS) > 1e-12) f.push('carbon grass ≠ v1');
      if (!(grassLevel(UT.specimens.materials.austenitic, 5) > 5 * GRASS)) f.push('austenitic grass');
      const sc = runScan(st);
      if (!sc || sc.n !== 301 || sc.columns.length !== 301 || sc.step !== 1) f.push('runScan shape');
      if (sc && sc.columns[135]) {
        let lo2 = 1, hi2 = 0;
        for (let i = 0; i < sc.columns[135].length; i++) { lo2 = Math.min(lo2, sc.columns[135][i]); hi2 = Math.max(hi2, sc.columns[135][i]); }
        if (lo2 < 0 || hi2 > 1 || hi2 - lo2 < 0.3) f.push('scan column grey range ' + lo2.toFixed(2) + '..' + hi2.toFixed(2));
        if (lo2 > 0.05 || hi2 < 0.95) f.push('scan column not saturated by lateral/backwall ' + lo2.toFixed(2) + '..' + hi2.toFixed(2));
      }
      // --- v2: straightening data (per-column lateral time, bounded wander, shift helper)
      if (!sc || !(sc.latUs instanceof Float32Array) || sc.latUs.length !== 301) f.push('scan.latUs');
      else {
        let mx = 0;
        for (let i = 0; i < sc.n; i++) mx = Math.max(mx, Math.abs(columnShift(sc, i)));
        if (!(mx > 0.02 && mx <= WANDER_US[0] + WANDER_US[1] + 1e-6)) f.push('wander range ' + mx.toFixed(3));
        if (Math.abs(sc.lateralUs - res.lateralUs) > 1e-9 || !sc.deadZones || sc.deadZones.lateral !== dz.lateral) f.push('scan lateralUs/deadZones');
      }
      if (typeof css !== 'string' || css.indexOf('/style') >= 0) f.push('css');
    } catch (e) { f.push('exception ' + (e && e.message)); }
    return f;
  }

  UT.tofd = {
    N_SAMPLES, REF_GAIN_DB, BEAM_20DB_DEG, LIMITS, AMP_REL,
    derive, pointTime, depthFromTime, eventsAt, ascan, compute, runScan, startScan, stopScan, isScanning,
    probePositions, panel, css,
    // v2
    fermatLS, deadZones, optimalPcs, pcsOptimise, hyperbola, cursorFor, cursorAt, grassLevel, columnShift, wanderUs,
    __selftest: selftest,
  };

  Object.assign(UT.test, { tofd: testTofd, runTofdScan: testRunTofdScan, pcsOptimise: testPcsOptimise, tofdCursor: testTofdCursor });
})(window.UT = window.UT || {});
