/* 00-core.js — UT namespace, constants, math, event bus, state store, DOM helpers, test API stub.
 * Loaded first. Classic script (no modules). Nothing here touches the DOM at load time.
 *
 * v3 additions (SPEC-v3 §1, §2 — lead-owned):
 *  - UT.defaultState() gains instrument.powered, weldOpts.{rootCorrosion, roughSurface, misalignmentMm,
 *    wtVariationMm}, autocal.{entered, field, source, rangeAfter}, plot.{lines, blockMarks, ruler, bs,
 *    overlay}, scaleMode{…}, annot{…}, tofd.{ascanOn, parallel}, display.{depthEcho, defectShade,
 *    alwaysShowControls, instrumentFloat, drawRegion, skipsToRange}, editing.{lof, autoType, spotMm,
 *    returnMode, keyLock} and tkyOpts{…}. Every one of them is off/neutral by default, so no v1/v2
 *    number moves; UT.test.state() drops scaleMode.picture, tofd.parallel and annot.strokes.
 *  - UT.dom.fileOpen(accept) → Promise<{name, size, type, dataUrl, text}> via a hidden <input type=file>
 *    created on call (no network, no persistence).
 *  - UT.dom.win({alwaysOnTop:true}) raises in a separate z band; api.setAlwaysOnTop(on) / api.onTop().
 *  - UT.math.fitLine(pts) → {angleDeg, a, b, rms, …} (total least squares; angleDeg in the plotter
 *    caption's convention — 0° along the surface, 90° straight down).
 *
 * SPEC NOTES (v3, where SPEC-v3 is silent — recorded per the working agreement):
 *  1. display.skipsToRange is added here, not in §2's list, because §11 decision 7 (binding) replaces the
 *     `display.skips = null` sentinel of F17 with a separate boolean. `display.skips` keeps its numeric type
 *     so coerceLike needs no exemption.
 *  2. fitLine is a TOTAL least-squares (principal-axis) fit rather than an ordinary y-on-x regression, so a
 *     vertical drag on the plotter card reports 90.0 instead of dividing by zero. For a non-vertical fit the
 *     reported `a`/`b` are the ordinary y = a·x + b coefficients of the same line; `a` and `b` are null when
 *     the fit is vertical, and `rms` is always the RMS PERPENDICULAR residual.
 *  3. fileOpen resolves null on cancel where the browser fires the `cancel` event (Chrome/Edge) and stays
 *     pending otherwise; callers must not block UI on it. It never persists the data URL — that is §11.9.
 */
(function (UT) {
  'use strict';

  UT.VERSION = '1.0.0';

  // ------------------------------------------------------------------ constants
  UT.consts = {
    V_SHEAR_STEEL: 3.24,   // mm/us
    V_COMP_STEEL: 5.90,    // mm/us
    V_PERSPEX: 2.74,       // mm/us (longitudinal, wedge/shoe)
    V_WATER: 1.48,
    PROBE_COLOURS: { 0: '#ff00ff', 45: '#ffff00', 60: '#00c000', 70: '#0000ff', pa: '#ff8800' },
    LEG_COLOURS: ['#e00000', '#0040ff', '#00a000', '#ff8800'],            // propagation colour code, leg 1..4
    SURFACE_COLOURS: { bottom: '#0040ff', top: '#e00000', end: '#00a000', radius: '#00a000', cap: '#ff8800', root: '#ff8800', step: '#00a000', brace: '#a000a0', fusion: '#ff8800' },
    COLOURS: {
      cream: '#fdfbd8', steel: '#8c8c8c', steelDark: '#6e6e6e', weldHatch: '#5c5c5c', defect: '#e00000',
      hole: '#ffffff', perspex: '#bfe3ff', ruler: '#111111', beamFan: 'rgba(255,255,255,0.35)',
      ascanBg: '#000000', ascanGrid: '#1f5f1f', ascanTrace: '#22e022', gate: '#ff2020', dac: '#ffd21e',
      uskBg: '#0b1fa8', uskGrid: '#3a52d8', uskTrace: '#7ff7ff',
    },
  };

  // ------------------------------------------------------------------ math
  const DEG = Math.PI / 180;
  const math = {
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    deg2rad(d) { return d * DEG; },
    rad2deg(r) { return r / DEG; },
    dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },
    /** Snell: returns refracted angle (deg) in medium 2, or null beyond the critical angle. */
    snellAngle(theta1Deg, v1, v2) {
      const s = Math.sin(theta1Deg * DEG) * v2 / v1;
      if (s >= 1 || s <= -1) return null;
      return Math.asin(s) / DEG;
    },
    dB2lin(db) { return Math.pow(10, db / 20); },
    lin2dB(lin) { return lin > 0 ? 20 * Math.log10(lin) : -120; },
    /** Un-normalised Gaussian exp(-x^2 / (2 sigma^2)). */
    gaussian(x, sigma) { return Math.exp(-(x * x) / (2 * sigma * sigma)); },
    /** Beam-profile weight w(delta) = exp(-ln2 (delta/theta6)^2): 0.5 at theta6. */
    beamWeight(deltaDeg, theta6Deg) { const r = deltaDeg / Math.max(theta6Deg, 1e-6); return Math.exp(-Math.LN2 * r * r); },
    /** One-way directivity weight w(delta) = 10^(-1/2 (delta/theta20)^2): -10 dB at theta20 (pulse-echo -20 dB). */
    beamWeight20(deltaDeg, theta20Deg) { const r = deltaDeg / Math.max(theta20Deg, 1e-6); return Math.pow(10, -0.5 * r * r); },
    /** Skew loss for planar/geometry reflectors: max(0.05, exp(-ln2 (skew/6)^2)). */
    skewWeight(skewDeg) { const r = skewDeg / 6; return Math.max(0.05, Math.exp(-Math.LN2 * r * r)); },
    fmt(num, dp) { return (num === null || num === undefined || Number.isNaN(num)) ? '--' : Number(num).toFixed(dp === undefined ? 1 : dp); },
    /** Fixed-width EPOCH style number: fmt2(5.51) -> '05.51'. */
    fmt2(num) { if (num === null || num === undefined || Number.isNaN(num)) return '--.--'; const s = Math.abs(num).toFixed(2); return (num < 0 ? '-' : '') + (s.length < 5 ? '0' + s : s); },
    /** Overlap length of intervals [a0,a1] and [b0,b1] (0 if disjoint). */
    overlap(a0, a1, b0, b1) { return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0)); },
    /** Seeded LCG in [0,1). */
    rng(seed) { let s = (seed >>> 0) || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; },
    /** Segment intersection: ray (p, d) with segment a-b. Returns {t, u, x, y} or null. t = ray distance (>= eps). */
    raySegment(px, py, dx, dy, ax, ay, bx, by, eps) {
      const ex = bx - ax, ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) return null;
      const t = ((ax - px) * ey - (ay - py) * ex) / den;
      const u = ((ax - px) * dy - (ay - py) * dx) / den;
      if (t < (eps === undefined ? 1e-6 : eps) || u < 0 || u > 1) return null;
      return { t, u, x: px + dx * t, y: py + dy * t };
    },
    /** Ray (p, d) with circle (c, r): nearest positive t or null. */
    rayCircle(px, py, dx, dy, cx, cy, r, eps) {
      const fx = px - cx, fy = py - cy;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sq = Math.sqrt(disc);
      const e = eps === undefined ? 1e-6 : eps;
      let t = (-b - sq) / (2 * a);
      if (t < e) t = (-b + sq) / (2 * a);
      if (t < e) return null;
      return { t, x: px + dx * t, y: py + dy * t };
    },
    /** Distance from point p to segment a-b and the foot parameter u in [0,1]. */
    pointSegment(px, py, ax, ay, bx, by) {
      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey;
      let u = len2 > 0 ? ((px - ax) * ex + (py - ay) * ey) / len2 : 0;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const x = ax + ex * u, y = ay + ey * u;
      return { d: Math.sqrt((px - x) * (px - x) + (py - y) * (py - y)), u, x, y };
    },
    /** Point in polygon (array of {x,y}). */
    pointInPolygon(x, y, poly) {
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
        const hit = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (hit) inside = !inside;
      }
      return inside;
    },
    /** Bessel function of the first kind J1(x) (Abramowitz & Stegun 9.4.4 / 9.4.6, |err| < 1e-7). */
    besselJ1(x) {
      const ax = Math.abs(x);
      if (ax < 3) {
        const y = (x / 3) * (x / 3);
        return x * (0.5 + y * (-0.56249985 + y * (0.21093573 + y * (-0.03954289 + y * (0.00443319 + y * (-0.00031761 + y * 0.00001109))))));
      }
      const y = 3 / ax;
      const f1 = 0.79788456 + y * (0.00000156 + y * (0.01659667 + y * (0.00017105 + y * (-0.00249511 + y * (0.00113653 + y * -0.00020033)))));
      const t1 = ax - 2.35619449 + y * (0.12499612 + y * (0.00005650 + y * (-0.00637879 + y * (0.00074348 + y * (0.00079824 + y * -0.00029166)))));
      const v = f1 * Math.cos(t1) / Math.sqrt(ax);
      return x < 0 ? -v : v;
    },
    /** One-way piston directivity |2 J1(x)/x| with x = (π a/λ) sinθ (a = crystal size in the beam plane, mm). */
    pistonDirectivity(thetaDeg, aMm, lambdaMm) {
      const x = Math.PI * aMm / Math.max(lambdaMm, 1e-6) * Math.sin(thetaDeg * DEG);
      if (Math.abs(x) < 1e-6) return 1;
      return Math.abs(2 * math.besselJ1(x) / x);
    },
    /** FNV-1a 32-bit hash of a string (used for exam codes). */
    fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; },
    /**
     * Least-squares straight-line fit of 2-D points (total least squares, so a vertical set is fine).
     * Accepts `{x, y}` or the plotter's `{standoff, depth}` (standoff → x, depth → y).
     * `angleDeg` is measured the way the original's plotter caption measures it (SPEC-v3 §6.1 F36):
     * from the SURFACE — 0° = along the surface (+x), 90° = straight down (+y) — in the range (−90, 90].
     * @param {Array<{x?:number,y?:number,standoff?:number,depth?:number}>} pts at least two distinct finite points
     * @returns {{angleDeg:number,a:number|null,b:number|null,rms:number,n:number,x0:number,y0:number,ux:number,uy:number}|null}
     *   a/b are the slope and intercept of y = a·x + b (both null for a vertical fit), rms the RMS
     *   perpendicular distance of the points from the line, (x0, y0) their centroid and (ux, uy) the unit
     *   direction. null when fewer than two distinct finite points are given.
     */
    fitLine(pts) {
      if (!Array.isArray(pts) || pts.length < 2) return null;
      const xs = [], ys = [];
      for (const p of pts) {
        if (!p || typeof p !== 'object') continue;
        const x = Number(p.x === undefined ? p.standoff : p.x);
        const y = Number(p.y === undefined ? p.depth : p.y);
        if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y); }
      }
      const n = xs.length;
      if (n < 2) return null;
      let mx = 0, my = 0;
      for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
      mx /= n; my /= n;
      let sxx = 0, syy = 0, sxy = 0;
      for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
      if (sxx + syy <= 1e-18) return null;                       // every point identical
      const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);        // principal axis, in (−π/2, π/2]
      const ux = Math.cos(theta), uy = Math.sin(theta);
      let ss = 0;
      for (let i = 0; i < n; i++) { const d = (xs[i] - mx) * uy - (ys[i] - my) * ux; ss += d * d; }   // perpendicular residual
      const vertical = Math.abs(ux) < 1e-9;
      return {
        angleDeg: theta / DEG,
        a: vertical ? null : uy / ux,
        b: vertical ? null : my - (uy / ux) * mx,
        rms: Math.sqrt(ss / n), n, x0: mx, y0: my, ux, uy,
      };
    },
    /** Angle (deg, 0..180) between two direction vectors. */
    angleBetween(ax, ay, bx, by) {
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      return Math.acos(math.clamp((ax * bx + ay * by) / (la * lb), -1, 1)) / DEG;
    },
  };
  UT.math = math;

  let _uid = 1;
  UT.uid = function () { return _uid++; };
  UT.clone = function (obj) { return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj)); };

  // ------------------------------------------------------------------ event bus
  const listeners = new Map();
  UT.bus = {
    on(evt, fn) { if (!listeners.has(evt)) listeners.set(evt, []); listeners.get(evt).push(fn); return fn; },
    off(evt, fn) { const l = listeners.get(evt); if (!l) return; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); },
    emit(evt, payload) {
      const l = listeners.get(evt);
      if (!l) return;
      for (const fn of l.slice()) {
        try { fn(payload); } catch (e) { console.error('[UT.bus]', evt, e); }
      }
    },
  };

  // ------------------------------------------------------------------ state
  UT.defaultState = function () {
    return {
      mode: 'weld',
      utSet: 'epoch600',
      specimen: null,               // set by UT.modes / UT.app at boot via UT.specimens.plateWeld()
      probe: {
        angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10,
        wedgeVel: 2.74, method: 'pe',
        x: 40, z: 150, side: 1, skew: 0, surface: 'chord',
        paFrom: 40, paTo: 70, paStep: 1,
        // v2
        libId: 'gen-60-5-10', crystalDims: { a: 10, b: 10, shape: 'round' }, focus: { on: false, F: 30 },
      },
      material: 'carbon',
      physics: { modeConv: true, surfaceWave: true, sideLobes: true, fanRays: 41 },
      damping: { tool: false, points: [] },
      instrument: {
        gain: 30, refGain: 30, range: 100, delay: 0, reject: 0, damping: false,
        rectify: 'full', freeze: false, peakMem: false,
        gates: [
          { on: true, start: 10, width: 60, level: 20, alarm: false },
          { on: false, start: 70, width: 20, level: 40, alarm: false },
        ],
        activeGate: 0,
        dac: { points: [], on: false, refDb: null, curves: true },
        cal: { vel: null, zero: 0 },   // vel null = vTrue; zero (us) relative to the wedge-zeroed time; auto-cal sets numbers
        trig: { angle: 60, thick: 20, xValue: 0 },   // instrument trigonometry settings used for SD/DP/leg readouts
        page: 1,
        readout: 'dp',                 // which readout is shown big on EPOCH 600: 'sp' | 'sd' | 'dp' | 'amp'
        selectedParam: 'gain',         // softkey parameter being adjusted
        // v2
        tcg: { on: false }, pulser: { energy: 200, damping: 150, prf: 60 }, receiver: { filter: 'broadband' },   // energy V ∈ {100,200,300,400}; damping Ω ∈ {50,100,150,200,400}
        autoPct: 80, compare: null, datalog: [],
        // v3
        powered: true,                 // F1: false blanks the trace, keeps grid + window + panel
      },
      display: {
        beam: true, skips: 3, colourCode: 'none', singleLine: false, focus: false,
        hide: false, plan: true, pipe3d: true, mirror: true, units: 'mm', legend: true, grid: true,
        // v2
        sound: false, touchBar: 'auto', highContrast: false, scale: 'auto' /* 'auto'|'fixed' */, convRays: true, autoTrig: true,
        // v3
        depthEcho: true,               // F23: show 'Depth = …' from the strongest/gated echo
        defectShade: true,             // F32: shade defects by mean depth
        alwaysShowControls: false,     // F7: pin the USK 7 controls on screen
        instrumentFloat: false,        // F8: float the EPOCH skins instead of docking them left
        drawRegion: null,              // F31: {x, y, w, h} in mm; null = auto (around the weld)
        skipsToRange: false,           // F17 (§11.7): 'Run to UT Screen Range' — derive the skip count from the range, `skips` keeps its last numeric value
      },
      weldOpts: { T: 20, L: 300, type: 'single-v', bevel: 30, rootGap: 2, rootFace: 2, capWidth: 16, capHeight: 2, rootHeight: 1.5, pipe: false, od: 168.3, wt: 20,
        prep: 'single-v', weldMaterial: 'same', backing: false, webT: 12, branchOd: 114.3, transferLossDb: 0,   // v2: prep supersedes type; transferLossDb 0…8 two-way
        // v3 (F45 weld conditions — all off by default, so every v1/v2 number is unchanged)
        rootCorrosion: false,          // bumpy, echoing root bead
        roughSurface: false,           // scanning-surface roughness (transfer loss + grass)
        misalignmentMm: 0,             // high-low step at the joint, −5…+5 mm (0 = aligned)
        wtVariationMm: 0 },            // pipe wall-thickness variation, 0…4 mm peak-to-peak
      defects: [],
      selectedDefect: 0,
      tofd: { pcs: 60, txAngle: 60, rangeUs: 15, delayUs: 0, gainDb: 40, scan: null, running: false,
        modeConv: true, straighten: false, deadZones: true,
        // v3
        ascanOn: true,                 // F44: the RF A-scan sub-window's OFF button (the mode stays)
        parallel: null },              // F43: {z0, z1, step, n, cols} — ALWAYS null in state (module buffer in 50-tofd)
      aut: {
        x: 40,
        gates: [
          { on: true, start: 20, width: 40, level: 20 },
          { on: true, start: 30, width: 30, level: 20 },
          { on: false, start: 40, width: 20, level: 20 },
          { on: false, start: 50, width: 20, level: 20 },
          { on: false, start: 60, width: 20, level: 20 },
          { on: false, start: 70, width: 20, level: 20 },
        ],
        activeGate: 0, scan: null, running: false, rectified: true, revMap: false,
        channels: 3, map: null, speed: 6,
      },
      standards: { standard: 'iso11666', level: 'AL2', technique: 1, testingLevel: 'B', transferDb: 0, rulesOverride: null, procedure: null, lastEval: null },
      lessons: { active: null, step: 0, progress: {}, answers: {}, memo: {}, stepStartedAt: 0 },
      quiz: { active: false, i: 0, n: 10, seed: null, difficulty: 'basic', correct: 0, wrong: 0, times: [], item: null },
      autocal: { stage: 0, t1: null, d1: 10, d2: 25,     // written by 80-modes (0 idle | 1 after Start | 2 after the first tick)
        // v3
        entered: { thin: null, thick: null },   // F3: the values the trainee typed/arrowed (mm), null until entered
        field: 0,                               // F3: the live value of the on-LCD entry field (mm)
        source: 'specimen',                     // F2: 'specimen' (current specimen backwalls) | 'step' (forced step wedge)
        rangeAfter: null },                     // F4: the range set after a successful cal (mm), null before
      pa: { elements: 16, pitch: 1.0, freq: 5, from: 35, to: 75, step: 1, focusDepth: null, view: 'S', escanAngle: 60, scan: null, tcg: false },
      bscan: { axis: 'x', on: false, columns: null },
      echodyn: { on: false, samples: [] },
      scenario: { slot: null, name: '', title: '', noteKo: '', noteEn: '', author: '' },
      plot: { points: [], edgeMarks: [], mirror: true, refPct: 80, cardStyle: 'iow',
        // v3
        lines: [],                              // F36: [{pts:[{standoff, depth}], colour:'green'}] — freehand edge lines & rungs
        blockMarks: [],                         // F35: [{x /* mm on the block surface */, side /* ±1 */, hole /* mm depth or null */}]
        ruler: { on: false, x: 0, view: 'plotter' },   // F39: 'plotter' | 'block'; x = mm of the ruler's 0 mark
        bs: null,                               // F37: {angleDeg, k20, k12, k6, n} written by 66 when ≥2 marks per side exist
        overlay: false },                       // F38: true = plotter card over the current weld (not the IOW block)
      scaleMode: {                              // F41/F42 — owned by 85-scalemode
        on: false, mmPerPx: 0.5,                // 0.05…5.0 mm per CSS px of the cross-section canvas
        picture: null,                          // {name, dataUrl, w, h, x, y} — data: URL only, never persisted
        outline: [],                            // [{x, y}] traced boundary in mm (closed, ≥3 points) → the polygon specimen
        protractor: null,                       // {x, y, rotDeg} in mm, or null when hidden
        magnify: false, gradStepMm: 5,          // F42: skip-line graduations every gradStepMm along each drawn skip
      },
      annot: {                                  // F51 — owned by 86-annotate
        on: false,                              // SHIFT+F12 teaching-aid drawing mode
        tool: 'pencil',                         // 'pencil' | 'line' | 'eraser'
        strokes: [],                            // [{colour:'red'|'blue', tool, pts:[{x,y}] /* design px */}] cap 200
        torch: false,                           // Options ▸ Highlight pointer
        shown: false,                           // the STEP notification dialog has been shown once
      },
      tkyOpts: { kind: 'T-joint', braceAngle: 60, braceT: 12, chordT: 20, braceOffset: 0, precision: 1,
        chordOd: 600, chordWt: 32 },            // F46: promoted from 80-modes module state into state (persisted)
      sizing: { method: '6dB', marks: [], result: null },
      trade: { active: false, revealed: false, report: [], score: null, seed: null, startedAt: null, truth: [],
        difficulty: 'intermediate', timeLimitMin: 60, history: [], exam: null,
        candidate: '', coverage: null, result: null, practice: false, hintsUsed: 0, revealedOne: [] },
      lesson: null,
      status: { left: '', mid: '', right: '' },
      cursor: { x: null, y: null, view: null, tUs: null, depth: null, z: null },   // 60 writes x/y/view; 50 writes view:'dscan', tUs/depth/z
      editing: { defect: false, brush: 'planar',      // cross-section brush active when defect editor open
        // v3
        lof: false,                             // F26: the current stroke is a right-button single-line LOF
        erase: false,                           // F26: the editor's Erase toggle (left-drag rubs points out)
        autoType: true,                         // F28: infer volumetric vs LOF from the stroke
        spotMm: 5,                              // F29: spot/brush diameter in mm (5…45); replaces the 10–60 px spinner
        returnMode: null,                       // F30: the modal mode to re-enter when the editor closes
        keyLock: null },                        // F33: HIDE key code (string) or null = NO KEY
    };
  };
  UT.state = UT.defaultState();

  let _dirty = false;
  let _rafPending = false;
  const _hasRAF = typeof requestAnimationFrame === 'function';

  /** Shallow-merge patch into UT.state (nested objects are REPLACED), mark dirty, emit 'state'. */
  UT.set = function (patch, opts) {
    const keys = Object.keys(patch || {});
    for (const k of keys) UT.state[k] = patch[k];
    _dirty = true;
    if (!(opts && opts.silent)) UT.bus.emit('state', { keys, patch });
    if (!(opts && opts.noRender)) UT.requestRender();
    return UT.state;
  };
  /** Convenience: patch a nested object one level down, e.g. UT.setIn('instrument', {gain: 40}). */
  UT.setIn = function (key, patch, opts) {
    const next = Object.assign({}, UT.state[key], patch);
    const p = {}; p[key] = next;
    return UT.set(p, opts);
  };

  UT.frame = { rays: null, echoes: [], ascan: null, readouts: null, ts: 0 };
  UT.compute = function () { /* replaced by 40-ascan.js */ return UT.frame; };

  UT.requestRender = function () {
    if (_rafPending) return;
    _rafPending = true;
    const run = function () {
      _rafPending = false;
      try {
        if (_dirty || !UT.frame.ts) {
          _dirty = false;
          if (!UT.state.instrument.freeze || !UT.frame.ts) UT.compute();
        }
        UT.bus.emit('render', UT.frame);
      } catch (e) { console.error('[UT.render]', e); }
    };
    if (_hasRAF) requestAnimationFrame(run); else setTimeout(run, 0);
  };
  /** Synchronous recompute + render (used by the test API and scans). */
  UT.renderNow = function () { _dirty = false; UT.compute(); UT.bus.emit('render', UT.frame); return UT.frame; };

  // ------------------------------------------------------------------ i18n
  const dict = {
    ko: {
      'File': '파일', 'Probes': '탐촉자', 'Step Wedge': '스텝 웨지', 'Weld': '용접부', 'Defects': '결함', 'Options': '옵션', 'Help': '도움말',
      'LEFT mouse button/drag to move the UT Probe': '마우스 왼쪽 버튼 드래그로 탐촉자를 이동하세요',
      'LEFT mouse button/drag to draw defect.': '마우스 왼쪽 버튼 드래그로 결함을 그리세요.',
      'Set Amplitude and press record button, then draw curves': '진폭을 맞춘 뒤 Record를 누르고 커브를 그리세요',
      'Lessons': '레슨', 'Trade Test': '실기 시험', 'Start': '시작', 'Reveal': '정답 공개', 'Submit': '제출',
    },
  };
  UT.i18n = {
    lang: 'en',
    t(key, params) {
      const d = dict[UT.i18n.lang];
      let s = (d && d[key]) || key;
      if (params) s = s.replace(/\{(\w+)\}/g, function (m, k) { return params[k] === undefined ? m : String(params[k]); });
      return s;
    },
    has(key) { const d = dict[UT.i18n.lang]; return !!(d && d[key]); },
    dict(lang) { return dict[lang || UT.i18n.lang] || {}; },
    add(lang, entries) { dict[lang] = Object.assign(dict[lang] || {}, entries); },
  };

  // ------------------------------------------------------------------ DOM helpers
  /** Relabel every element created with the i18n shorthand (button/field/win titles/h({i18n})) after a language change. */
  function relabelAuto() {
    if (typeof document === 'undefined') return;
    const els = document.querySelectorAll('[data-i18n-auto]');
    for (let i = 0; i < els.length; i++) { const key = els[i].dataset.i18n; if (key) els[i].textContent = UT.i18n.t(key); }
  }
  UT.bus.on('lang', relabelAuto);
  const dom = {
    /** h('div', {class:'x', onclick: fn, dataset:{a:1}, style:{...}}, [children | strings]) */
    h(tag, attrs, children) {
      const el = document.createElement(tag);
      if (attrs) {
        for (const k of Object.keys(attrs)) {
          const v = attrs[k];
          if (v === null || v === undefined || v === false) continue;
          if (k === 'class' || k === 'className') el.className = v;
          else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
          else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
          else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
          else if (k === 'text') el.textContent = v;
          else if (k === 'i18n') { el.dataset.i18n = v; el.dataset.i18nAuto = '1'; if (children === undefined) el.textContent = UT.i18n.t(v); }   // v2: auto-relabelled on 'lang'
          else if (k === 'html') el.innerHTML = v;   // only for trusted, module-authored markup
          else if (v === true) el.setAttribute(k, '');
          else el.setAttribute(k, String(v));
        }
      }
      const kids = Array.isArray(children) ? children : (children === undefined ? [] : [children]);
      for (const c of kids) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      }
      return el;
    },
    /** Size a canvas to its CSS box × devicePixelRatio and return a ctx scaled to CSS pixels. */
    fitCanvas(canvas, cssW, cssH) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const w = cssW || canvas.clientWidth || canvas.width || 300;
      const h = cssH || canvas.clientHeight || canvas.height || 150;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return ctx;
    },
    cssSize(canvas) { return { w: canvas.clientWidth || canvas.width, h: canvas.clientHeight || canvas.height }; },
    /** Mouse/touch position in CSS px relative to element. */
    localPos(ev, el) {
      const r = el.getBoundingClientRect();
      const p = ev.touches && ev.touches[0] ? ev.touches[0] : ev;
      // compensate a CSS transform: scale(k) on an ancestor (responsive layout scaling)
      const kx = r.width > 0 && el.offsetWidth ? el.offsetWidth / r.width : 1;
      const ky = r.height > 0 && el.offsetHeight ? el.offsetHeight / r.height : 1;
      return { x: (p.clientX - r.left) * kx, y: (p.clientY - r.top) * ky };
    },
    /** Current layout scale factor k of #app (1 when not scaled). */
    scale() {
      const app = typeof document !== 'undefined' && document.getElementById('app');
      if (!app || !app.offsetWidth) return 1;
      const r = app.getBoundingClientRect();
      return r.width > 0 ? r.width / app.offsetWidth : 1;
    },
    button(label, onClick, attrs) {
      if (typeof label === 'string') return dom.h('button', Object.assign({ class: 'btn', type: 'button', onclick: onClick, i18n: label }, attrs || {}));
      return dom.h('button', Object.assign({ class: 'btn', type: 'button', onclick: onClick }, attrs || {}), label);
    },
    /** Labelled numeric/text input row: field('Gain', {type:'number', value: 30, min:0, max:110, step:1, onchange}) */
    field(label, opts) {
      const o = opts || {};
      const input = dom.h(o.tag || 'input', Object.assign({ class: 'fld-input', type: o.type || 'number' }, o.attrs || {}));
      if (o.type !== 'checkbox') input.value = o.value === undefined ? '' : o.value; else input.checked = !!o.value;
      if (o.min !== undefined) input.min = o.min;
      if (o.max !== undefined) input.max = o.max;
      if (o.step !== undefined) input.step = o.step;
      if (o.options) { for (const opt of o.options) input.appendChild(dom.h('option', { value: opt.value === undefined ? opt : opt.value, selected: String(opt.value === undefined ? opt : opt.value) === String(o.value) ? true : null }, opt.label === undefined ? String(opt) : opt.label)); }
      if (o.onchange) input.addEventListener(o.event || 'change', function (e) { o.onchange(o.type === 'checkbox' ? input.checked : (o.type === 'number' ? parseFloat(input.value) : input.value), e); });
      const row = dom.h('label', { class: 'fld', title: o.title || null }, [typeof label === 'string' ? dom.h('span', { class: 'fld-label', i18n: label }) : dom.h('span', { class: 'fld-label' }, label), input]);
      row.input = input;
      return row;
    },
    /** Custom confirm dialog → Promise<boolean>. */
    confirm(message, opts) {
      return new Promise(function (resolve) {
        const o = opts || {};
        let win;
        let settled = false;
        const settle = function (v) { if (!settled) { settled = true; resolve(v); } };
        const done = function (v) { settle(v); win.close(); };
        win = dom.win({
          name: 'confirm-' + UT.uid(), title: o.title || 'Confirm', modal: true, w: 320,
          content: dom.h('div', { class: 'confirm-body' }, [
            dom.h('p', {}, message),
            dom.h('div', { class: 'btn-row' }, [dom.button(o.ok || 'OK', function () { done(true); }, { class: 'btn primary' }), dom.button(o.cancel || 'Cancel', function () { done(false); })]),
          ]),
          // one-shot dialog: destroy on every close path (button, ✕, Esc) so no hidden window/backdrop/registry entry is left behind
          onClose: function (w) { settle(false); w.destroy(); },
        });
        win.show();
      });
    },
    /** Simple message dialog. */
    alert(message, title) {
      const win = dom.win({ name: 'alert-' + UT.uid(), title: title || 'UTsim', modal: true, w: 360,
        content: dom.h('div', { class: 'confirm-body' }, [dom.h('div', { class: 'alert-msg' }, message), dom.h('div', { class: 'btn-row' }, [dom.button('OK', function () { win.close(); }, { class: 'btn primary' })])]),
        onClose: function (w) { w.destroy(); } });
      win.show();
      return win;
    },
    /**
     * User-initiated file picker (SPEC-v3 §1: Load Def / Load Pic). Creates a hidden `<input type="file">`,
     * clicks it and resolves with the chosen file. Nothing is fetched and nothing is persisted — the data
     * URL lives only in the returned object, which the caller is expected to drop when it is done.
     * @param {string} [accept] the input's accept attribute, e.g. 'image/*' or '.json,.def'
     * @param {{text?:boolean}} [opts] text:true forces, text:false suppresses the extra readAsText pass
     *   (by default text is read for text/JSON types and for .json/.txt/.csv/.def names)
     * @returns {Promise<{name:string,size:number,type:string,dataUrl:string,text:(string|null)}|null>}
     *   null when the picker is cancelled or the document is unavailable; rejects when the file cannot be read
     */
    fileOpen(accept, opts) {
      return new Promise(function (resolve, reject) {
        if (typeof document === 'undefined') { resolve(null); return; }
        const o = opts || {};
        const input = dom.h('input', { type: 'file', accept: accept || null, style: { position: 'fixed', left: '-10000px', top: '0', width: '1px', height: '1px', opacity: '0' } });
        let settled = false;
        const settle = function (value, err) {
          if (settled) return;
          settled = true;
          if (input.parentNode) input.parentNode.removeChild(input);
          if (err) reject(err); else resolve(value);
        };
        input.addEventListener('cancel', function () { settle(null); });   // Chrome/Edge; elsewhere the promise simply never settles
        input.addEventListener('change', function () {
          const file = input.files && input.files[0];
          if (!file) { settle(null); return; }
          const name = String(file.name || 'file');
          const type = String(file.type || '');
          const wantText = o.text === true || (o.text !== false && (/^text\//.test(type) || type === 'application/json' || /\.(json|txt|csv|def)$/i.test(name)));
          const urlReader = new FileReader();
          urlReader.onerror = function () { settle(null, new Error('Could not read ' + name)); };
          urlReader.onload = function () {
            const dataUrl = String(urlReader.result || '');
            if (!wantText) { settle({ name, size: file.size || 0, type, dataUrl, text: null }); return; }
            const textReader = new FileReader();
            textReader.onerror = function () { settle({ name, size: file.size || 0, type, dataUrl, text: null }); };
            textReader.onload = function () { settle({ name, size: file.size || 0, type, dataUrl, text: String(textReader.result || '') }); };
            textReader.readAsText(file);
          };
          urlReader.readAsDataURL(file);
        });
        (document.body || document.documentElement).appendChild(input);
        input.click();
      });
    },
    wins: {},
    _z: 100,
    _zTop: 100000,   // always-on-top band (SPEC-v3 §1: dom.win({alwaysOnTop:true}))
    /**
     * Floating, draggable Win-classic style window.
     * dom.win({name, title, x, y, w, h, content: Element|() => Element, onClose, onShow, modal, resizable,
     *          alwaysOnTop})
     * → { el, body, show(), hide(), toggle(), close(), setTitle(), setContent(), isOpen(), raise(),
     *     setAlwaysOnTop(on), onTop() }
     * `alwaysOnTop` (SPEC-v3 §1) raises the window in a separate z band above every ordinary window, so a
     * floating instrument or palette stays visible while other windows are raised over each other.
     * Windows are appended to #app (or document.body) on first show. Registry: dom.wins[name].
     */
    win(o) {
      const name = o.name || ('win-' + UT.uid());
      if (dom.wins[name] && !o.replace) { const existing = dom.wins[name]; if (o.content) existing.setContent(o.content); return existing; }
      const titleEl = dom.h('span', { class: 'win-title-text', i18n: o.title || name });   // title is an i18n KEY, relabelled on 'lang'
      const closeBtn = dom.h('button', { class: 'win-close', type: 'button', title: 'Close' }, '✕');
      const titleBar = dom.h('div', { class: 'win-title' }, [titleEl, closeBtn]);
      const body = dom.h('div', { class: 'win-body' });
      const el = dom.h('div', { class: 'win' + (o.modal ? ' modal' : '') + (o.class ? ' ' + o.class : ''), role: 'dialog', 'aria-modal': o.modal ? 'true' : null, dataset: { win: name }, style: { left: (o.x === undefined ? 200 : o.x) + 'px', top: (o.y === undefined ? 120 : o.y) + 'px', width: o.w ? o.w + 'px' : null, height: o.h ? o.h + 'px' : null, display: 'none' } }, [titleBar, body]);
      let backdrop = null;
      let prevFocus = null;
      let onTop = !!o.alwaysOnTop;
      const api = {
        el, body, name,
        isOpen() { return el.style.display !== 'none'; },
        raise() { el.style.zIndex = String(onTop ? ++dom._zTop : ++dom._z); },
        /** True while this window sits in the always-on-top z band. */
        onTop() { return onTop; },
        /** Move the window into (true) or out of (false) the always-on-top band and re-raise it. */
        setAlwaysOnTop(on) { onTop = !!on; api.raise(); return api; },
        setTitle(t) { titleEl.dataset.i18n = t; titleEl.textContent = UT.i18n.t(t); },
        setContent(c) { body.textContent = ''; const node = typeof c === 'function' ? c(api) : c; if (node) body.appendChild(node); },
        show() {
          if (!el.parentNode) { (document.getElementById('app') || document.body).appendChild(el); }
          if (o.modal && !backdrop) { backdrop = dom.h('div', { class: 'win-backdrop' }); el.parentNode.insertBefore(backdrop, el); }
          if (backdrop) backdrop.style.display = 'block';
          el.style.display = 'block';
          api.raise();
          // keep inside the (logical, unscaled) app box
          const box = el.offsetParent || document.body;
          const bw = box.clientWidth || window.innerWidth, bh = box.clientHeight || window.innerHeight;
          if (el.offsetLeft + el.offsetWidth > bw) el.style.left = Math.max(0, bw - el.offsetWidth - 8) + 'px';
          if (el.offsetTop + el.offsetHeight > bh) el.style.top = Math.max(0, bh - el.offsetHeight - 8) + 'px';
          if (o.onShow) o.onShow(api);
          // modal dialogs take the keyboard focus (SPEC-v2 §5.7): primary button first, else the first focusable control
          if (o.modal || o.autofocus) {
            const active = document.activeElement;
            if (active && active !== document.body && !el.contains(active)) prevFocus = active;
            const target = el.querySelector('.btn.primary') || api.focusables()[0];
            if (target && typeof target.focus === 'function') { try { target.focus(); } catch (e) { /* ignore */ } }
          }
          UT.bus.emit('win:show', api);
          return api;
        },
        /** Keyboard-reachable controls inside the window (title-bar ✕ last), in DOM order. */
        focusables() {
          const list = Array.prototype.slice.call(el.querySelectorAll('button, [href], input, select, textarea, [tabindex]'));
          return list.filter(function (n) { return n !== closeBtn && !n.disabled && n.tabIndex >= 0 && n.getAttribute('aria-hidden') !== 'true' && (n.offsetWidth > 0 || n.offsetHeight > 0 || n.getClientRects().length > 0); }).concat([closeBtn]);
        },
        hide() {
          el.style.display = 'none'; if (backdrop) backdrop.style.display = 'none';
          // give the focus back to the control that opened a modal dialog (focus trap released)
          const active = document.activeElement;
          if (prevFocus && (!active || active === document.body || el.contains(active))) { try { if (prevFocus.isConnected !== false) prevFocus.focus(); } catch (e) { /* ignore */ } }
          prevFocus = null;
          UT.bus.emit('win:hide', api); return api;
        },
        toggle() { return api.isOpen() ? api.hide() : api.show(); },
        close() { api.hide(); if (o.onClose) o.onClose(api); UT.bus.emit('win:close', api); return api; },
        destroy() { if (api.isOpen()) api.hide(); if (el.parentNode) el.parentNode.removeChild(el); if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); delete dom.wins[name]; },
      };
      closeBtn.addEventListener('click', function (e) { e.stopPropagation(); api.close(); });
      // keyboard (SPEC-v2 §5.7): while a modal dialog is up, Tab/Shift+Tab cycle inside it and Enter activates the primary button
      // (Esc stays with 90's document handler → closeTopWindow). Listener on the window itself, so it runs before the app's handlers.
      if (o.modal) {
        el.addEventListener('keydown', function (e) {
          if (e.ctrlKey || e.altKey || e.metaKey) return;
          if (e.key === 'Tab') {
            const list = api.focusables();
            if (!list.length) { e.preventDefault(); return; }
            let i = list.indexOf(document.activeElement);
            if (i < 0) i = e.shiftKey ? 0 : list.length - 1;
            const next = list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
            e.preventDefault(); e.stopPropagation();
            try { next.focus(); } catch (err) { /* ignore */ }
          } else if (e.key === 'Enter') {
            const t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
            if (tag === 'button' || tag === 'a') { e.stopPropagation(); return; }   // native activation of the focused control (kept away from the app's Enter handlers)
            if (tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;   // multi-line input / native behaviour
            const primary = el.querySelector('.btn.primary');
            if (!primary || primary.disabled) return;
            e.preventDefault(); e.stopPropagation();
            primary.click();
          }
        });
      }
      el.addEventListener('mousedown', function () { api.raise(); });
      // drag by title bar
      let drag = null;
      titleBar.addEventListener('pointerdown', function (e) {
        if (e.target === closeBtn) return;
        const k = dom.scale();
        drag = { dx: e.clientX / k - el.offsetLeft, dy: e.clientY / k - el.offsetTop, k };
        try { titleBar.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      });
      titleBar.addEventListener('pointermove', function (e) {
        if (!drag) return;
        el.style.left = Math.max(0, e.clientX / drag.k - drag.dx) + 'px';
        el.style.top = Math.max(0, e.clientY / drag.k - drag.dy) + 'px';
      });
      const endDrag = function () { drag = null; };
      titleBar.addEventListener('pointerup', endDrag);
      titleBar.addEventListener('pointercancel', endDrag);
      if (o.content) api.setContent(o.content);
      dom.wins[name] = api;
      return api;
    },
    /** Idempotently inject a module CSS string as <style id="css-<name>">. */
    injectCss(name, cssText) {
      if (typeof document === 'undefined' || !cssText) return null;
      const id = 'css-' + name;
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('style'); el.id = id; (document.head || document.body).appendChild(el); }
      if (el.textContent !== cssText) el.textContent = cssText;
      return el;
    },
    /** Close the top-most open window (Esc). Returns true if one was closed. */
    closeTopWindow() {
      let top = null, z = -1;
      for (const k of Object.keys(dom.wins)) { const w = dom.wins[k]; if (w.isOpen() && +w.el.style.zIndex > z) { z = +w.el.style.zIndex; top = w; } }
      if (top) { top.close(); return true; }
      return false;
    },
  };
  UT.dom = dom;

  // ------------------------------------------------------------------ audio (gate alarm beep, opt-in)
  UT.audio = {
    ctx: null, lastBeep: 0, unlocked: false,
    /** Call from a user gesture after enabling display.sound (creates the AudioContext lazily). */
    unlock() {
      if (!UT.state.display.sound || UT.audio.ctx) return;
      try { UT.audio.ctx = new (window.AudioContext || window.webkitAudioContext)(); UT.audio.unlocked = true; } catch (e) { UT.audio.ctx = null; }
    },
    /** Short 880 Hz beep (no-op while display.sound is off). */
    beep(freq, ms) {
      if (!UT.state.display.sound) return false;
      if (!UT.audio.ctx) UT.audio.unlock();
      const c = UT.audio.ctx;
      if (!c) return false;
      try {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = freq || 880; g.gain.value = 0.1;
        o.connect(g); g.connect(c.destination);
        o.start(); o.stop(c.currentTime + (ms || 60) / 1000);
        UT.audio.lastBeep = Date.now();
        return true;
      } catch (e) { return false; }
    },
  };

  // ------------------------------------------------------------------ status helper
  UT.status = function (patch) { UT.setIn('status', patch, { noRender: true }); UT.bus.emit('status', UT.state.status); };

  // ------------------------------------------------------------------ test API stub (filled by modules)
  UT.test = { version: UT.VERSION };
  UT.test.state = function () {
    const s = Object.assign({}, UT.state);
    s.tofd = Object.assign({}, s.tofd, { scan: null });
    s.aut = Object.assign({}, s.aut, { scan: null, map: null });
    s.pa = Object.assign({}, s.pa, { scan: null }); s.bscan = Object.assign({}, s.bscan, { columns: null });
    s.instrument = Object.assign({}, s.instrument, { compare: null });
    // v3 §2: never leaves the page — a picture data: URL is megabytes, the parallel-scan buffer is binary,
    // and the annotation strokes are a per-session teaching overlay
    if (s.scaleMode) { s.scaleMode = Object.assign({}, s.scaleMode); delete s.scaleMode.picture; }
    if (s.tofd) { s.tofd = Object.assign({}, s.tofd); delete s.tofd.parallel; }
    if (s.annot) { s.annot = Object.assign({}, s.annot); delete s.annot.strokes; }
    // exam lock (SPEC-v2 §4.2.3): the hidden truth never leaves the page while an exam is locked and unrevealed
    if (s.trade && s.trade.exam && s.trade.exam.locked && !s.trade.revealed) { delete s.defects; s.trade = Object.assign({}, s.trade, { truth: [] }); }
    s.specimen = s.specimen ? { id: s.specimen.id, name: s.specimen.name, T: s.specimen.T, L: s.specimen.L, face: s.specimen.face || null, kind: s.specimen.kind } : null;
    return UT.clone(s);
  };
  /** Length formatter honouring display.units ('mm' | 'inch'). */
  UT.fmtLen = function (mm, dp) {
    if (mm === null || mm === undefined || Number.isNaN(mm)) return '--';
    if (UT.state.display && UT.state.display.units === 'inch') return (mm / 25.4).toFixed(dp === undefined ? 3 : dp) + '"';
    return math.fmt(mm, dp === undefined ? 1 : dp) + ' mm';
  };
  /**
   * Shared plain-number formatter (QA round 1): ONE dash string for every window so the same readout never prints
   * '--', '—' and 'NaN' in different places. dp: decimals (default 1) or 'auto' (integers without decimals, else 1 dp —
   * the v1 status-bar style 'Pos: 67 mm'); dash: text for null/undefined/NaN/±∞ (default '—').
   */
  UT.fmtNum = function (v, dp, dash) {
    const n = Number(v);
    if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return dash === undefined ? '—' : dash;
    if (dp === 'auto') return Number.isInteger(n) ? String(n) : n.toFixed(1);
    return n.toFixed(dp === undefined ? 1 : dp);
  };

  // ------------------------------------------------------------------ bytes / UTF-8 / base64url (shared by 84 + 94)
  const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const B64MAP = {};
  for (let i = 0; i < 64; i++) B64MAP[B64URL[i]] = i;
  B64MAP['+'] = 62; B64MAP['/'] = 63;
  /** string → UTF-8 bytes (Uint8Array; array-like of numbers, surrogate pairs combined). */
  function utf8Encode(str) {
    const s = String(str === undefined || str === null ? '' : str);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  /** UTF-8 bytes (Uint8Array | number[]) → string. */
  function utf8Decode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i++];
      let c;
      if (b < 0x80) c = b;
      else if (b < 0xe0) c = ((b & 31) << 6) | (bytes[i++] & 63);
      else if (b < 0xf0) { c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6); c |= bytes[i++] & 63; }
      else { c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12); c |= (bytes[i++] & 63) << 6; c |= bytes[i++] & 63; }
      if (c >= 0x10000) { c -= 0x10000; s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); } else s += String.fromCharCode(c);
    }
    return s;
  }
  /** bytes (Uint8Array | number[]) → base64url (alphabet A–Z a–z 0–9 - _, no padding). */
  function b64urlBytes(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i], b = i + 1 < bytes.length ? bytes[i + 1] : undefined, c = i + 2 < bytes.length ? bytes[i + 2] : undefined;
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      s += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63] + (b === undefined ? '' : B64URL[(n >> 6) & 63]) + (c === undefined ? '' : B64URL[n & 63]);
    }
    return s;
  }
  /** base64url or base64 ('+' '/' and trailing '=' accepted, whitespace ignored) → Uint8Array; THROWS on an invalid character. */
  function b64urlDecodeBytes(str) {
    const clean = String(str === undefined || str === null ? '' : str).replace(/\s+/g, '').replace(/=+$/, '');
    const out = [];
    let buf = 0, bits = 0;
    for (let i = 0; i < clean.length; i++) {
      const v = B64MAP[clean[i]];
      if (v === undefined) throw new Error('bad base64url');
      buf = ((buf << 6) | v) & 0xffffff; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return new Uint8Array(out);
  }
  /** string → base64url of its UTF-8 bytes (no padding). */
  function b64url(str) { return b64urlBytes(utf8Encode(str)); }
  /** base64url (or base64) → string via UTF-8; THROWS on an invalid character (94 wraps it to return null). */
  function b64urlDecode(str) { return utf8Decode(b64urlDecodeBytes(str)); }

  // ------------------------------------------------------------------ self test
  UT.core = {
    utf8Encode, utf8Decode, b64url, b64urlDecode, b64urlBytes, b64urlDecodeBytes,
    __selftest() {
      const f = [];
      const s0 = 'h\u00e9llo \uc2e4\uae30 {"a":1} \ud83d\ude00';
      if (b64urlDecode(b64url(s0)) !== s0) f.push('base64url round trip');
      if (b64url('ab') !== 'YWI' || b64url('abc') !== 'YWJj' || b64urlDecode('YWI=') !== 'ab') f.push('base64url ' + b64url('ab'));
      const all = new Uint8Array(256); for (let i = 0; i < 256; i++) all[i] = i;
      const enc = b64urlBytes(all), dec = b64urlDecodeBytes(enc);
      let same = dec.length === 256 && !/[+/=]/.test(enc); for (let i = 0; i < 256 && same; i++) same = dec[i] === i;
      if (!same) f.push('b64urlBytes round trip');
      let bad = false; try { b64urlDecode('***'); } catch (e) { bad = true; }
      if (!bad) f.push('b64urlDecode accepts junk');
      const a = math.snellAngle(47.1, 2.74, 3.24);
      if (Math.abs(a - 60) > 0.2) f.push('snell 47.1->60 got ' + a);
      if (math.snellAngle(80, 2.74, 5.9) !== null) f.push('critical angle not detected');
      if (Math.abs(math.beamWeight(5, 5) - 0.5) > 1e-9) f.push('beamWeight(θ6) != 0.5');
      if (Math.abs(math.beamWeight20(4, 4) - Math.sqrt(0.1)) > 1e-9) f.push('beamWeight20(θ20) != -10 dB');
      const hit = math.raySegment(0, 0, 0, 1, -1, 10, 1, 10);
      if (!hit || Math.abs(hit.t - 10) > 1e-9) f.push('raySegment');
      const c = math.rayCircle(0, 0, 0, 1, 0, 10, 2);
      if (!c || Math.abs(c.t - 8) > 1e-9) f.push('rayCircle');
      if (!math.pointInPolygon(1, 1, [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }])) f.push('pointInPolygon');
      if (math.fmt2(5.51) !== '05.51') f.push('fmt2');
      if (Math.abs(math.besselJ1(1) - 0.44005) > 1e-4) f.push('besselJ1(1) ' + math.besselJ1(1));
      if (Math.abs(math.besselJ1(5) + 0.32758) > 1e-4) f.push('besselJ1(5) ' + math.besselJ1(5));
      const d6 = math.pistonDirectivity(math.rad2deg(Math.asin(0.51 * 0.648 / 10)), 10, 0.648);
      if (Math.abs(20 * Math.log10(d6) + 3) > 0.3) f.push('piston -3 dB at 0.51 λ/a: ' + (20 * Math.log10(d6)).toFixed(2));
      if (UT.i18n.t('Defect {n}', { n: 3 }) !== 'Defect 3') f.push('i18n params');
      // v3: fitLine (F36/F37) — the plotter caption's angle convention
      const fl = math.fitLine([{ standoff: 0, depth: 0 }, { standoff: 20, depth: 34.6 }]);
      if (!fl || Math.abs(fl.angleDeg - 60) > 0.1 || Math.abs(fl.a - 1.73) > 0.01 || fl.rms > 1e-6) f.push('fitLine 60° ' + JSON.stringify(fl));
      const flh = math.fitLine([{ x: 0, y: 7 }, { x: 10, y: 7 }, { x: 20, y: 7 }]);
      if (!flh || Math.abs(flh.angleDeg) > 1e-9 || Math.abs(flh.a) > 1e-9 || Math.abs(flh.b - 7) > 1e-9) f.push('fitLine horizontal ' + JSON.stringify(flh));
      const flv = math.fitLine([{ x: 5, y: 0 }, { x: 5, y: 9 }]);
      if (!flv || Math.abs(flv.angleDeg - 90) > 1e-9 || flv.a !== null || flv.b !== null) f.push('fitLine vertical ' + JSON.stringify(flv));
      const flr = math.fitLine([{ x: 0, y: 0 }, { x: 10, y: 1 }, { x: 20, y: 1 }, { x: 30, y: 0 }]);
      if (!flr || Math.abs(flr.angleDeg) > 1e-9 || Math.abs(flr.rms - 0.5) > 1e-9) f.push('fitLine rms ' + JSON.stringify(flr));
      if (math.fitLine([{ x: 1, y: 1 }]) !== null || math.fitLine([{ x: 1, y: 1 }, { x: 1, y: 1 }]) !== null) f.push('fitLine degenerate');
      // v3 state additions (§2) — names other modules bind to
      const s3 = UT.defaultState();
      if (s3.instrument.powered !== true || s3.weldOpts.misalignmentMm !== 0 || s3.plot.blockMarks.length !== 0 ||
          s3.scaleMode.mmPerPx !== 0.5 || s3.annot.tool !== 'pencil' || s3.tofd.parallel !== null ||
          s3.display.depthEcho !== true || s3.editing.spotMm !== 5 || s3.tkyOpts.chordOd !== 600 ||
          s3.autocal.source !== 'specimen') f.push('v3 defaultState keys');
      return f;
    },
  };
})(window.UT = window.UT || {});
