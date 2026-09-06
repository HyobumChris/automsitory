/* 80-modes.js — mode controllers: calibration blocks (V1/V2 face switch), step wedge + auto-cal,
 * DAC recording, PLOT (beam spread), SIZE, defect editor window, TKY panel, trade test, lessons.
 * Orchestrates state through UT.set / UT.setIn only. No DOM access at load time (SPEC §15.12).
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - UT.modes.enabled[mode] = {toolbar, menus} lists the ENABLED ids (literal meaning of the property
//   name; toolbar ids 'tb-*', menu ids 'menu-*'). The §14.7 table (disabled ids) is exposed alongside as
//   enabled[mode].disabledToolbar / disabledMenus / hidden, plus enabled.editor for the editor-open row.
//   UT.modes.isToolbarEnabled(id) / isMenuEnabled(id) combine the current mode with the editor state.
// - Defects policy per mode: weld/tofd/aut keep state.defects; block modes (v1, v2, step, iow, dac, tky)
//   stash the weld defects in a module variable and use []; lamination uses two lamination presets;
//   trade uses the seeded truth. Returning to a weld-kind mode restores the stash.
// - step and lamination modes force a 0° probe (comp mode); tofd sets probe.x = 0 and rectify 'rf'
//   (restored to 'full' on exit); leaving step restores cal {vel: null, zero: 0}.
//   The angle the mode forced away (savedAngle) is restored on exit ONLY while the probe is still at that
//   forced 0°: choosing 45/60/70 inside step/lamination (enabled there, §14.7), or setting an angle through
//   the lesson setProbe just before enter(), drops the saved angle so the user's choice survives exit().
//   Entering step also stashes instrument.gates and sets gate 1 to {start 6, width 40, level 20} so the first
//   backwall of the 10 mm step (8.4 mm under the wrong cal) is gated for Auto Cal; the gates are restored on exit.
//   Auto Cal captures the earliest 'backwall' echo above the gate level (gated max only when it IS that echo).
//   tky enters with brace 60° / braceT 12 / chordT 20 / offset 0 (= the Default button) and a 60° probe (§14.9).
// - Windows of other modules are opened/closed through the first available of
//   UT.<owner>.open/close, UT.<owner>.panel.open/close, UT.<owner>.window.show/hide, UT.dom.wins[name].
// - Brush size lives in state.editing.brushPx (10–60, default 26); type in state.editing.brush.
// - The circle view / linear bar are drawn by UT.views.plan.drawCircleView / drawLinearBar when present
//   (called as (canvas, {spec, defects, selected: n, onDrag(zFrom, zTo), onSelect(n)}) — the helper binds
//   its own ring/bar mouse handlers); this file carries a fallback renderer + handlers for headless use.
// - Trade test: 3–6 defects from UT.specimens.defectPresets placed in sequential z windows; truth rows
//   are rounded to 0.1 mm; the timer is 60 min (informational only, no auto-submit).
// - DAC: dac.on becomes true once ≥ 2 points are recorded; Record replaces a point within 1 mm of an
//   existing path; the first recorded point fixes refDb (= gain at that moment). The −6/−14 dB companion
//   curves start OFF when the first point is recorded (and after Erase) so that 'Draw Curves' really draws
//   them (§1.1 #20 / §8.3); the panel button then reads 'Hide Curves' while they are shown.
// - Lessons 7 / 20 (§14.12 says gain 34): with the §5.3 reference (3 mm SDH at 50 mm = 80 % at 34 dB) the
//   near-field SDHs of the 20 mm DAC bar read 120–130 % at 34 dB, which Record refuses (> 120 % rule) and
//   which clips the '+6 dB doubles' story. Lesson 20 therefore starts at 30 dB (70°: T/4 81 %, T/2 78 %,
//   3T/4 62 %) and lesson 7 at 24 dB (60° T/2 hole 40 % → 30 dB softkey 80 % → 40 dB softkey 252 %, clipped).
// - TKY joint kind row (§14.9): UT.specimens.tky() (frozen) models only the T-joint (plate chord + angled
//   brace); the Plate / Pipe buttons are shown disabled with a tooltip instead of pretending to switch geometry.
// - Defect z ranges: setDefects normalises zFrom <= zTo on plates (inverted ranges are swapped; on pipes an
//   inverted range wraps through 0, see UT.specimens.defectLength) so defectLength is never negative.
// - __selftest exercises enter()/trade on the live store but snapshots the top-level state (+ the module
//   variables) first and restores everything in a finally block without opening any window.
// - Plot markEdge picks the IOW hole whose depth is nearest the gated depth readout (fallback: 13 mm).
// - Auto-cal wizard window is 'autocal' (owned here); ✓ = autoCal.step(), Cancel = autoCal.cancel().
// ---- v2 (SPEC-v2 §1, §2, §7, §8) ----
// - Late binding to 82/84: the v1 lesson array is UT.modes.lessonSetups; UT.modes.lessons is a getter returning
//   UT.lessons.list when 82 is loaded (else lessonSetups). modes.lessonsWindow / modes.tradeTest delegate to
//   UT.lessons.window / UT.trade.window when those modules exist and NEVER create dom.win 'lessons' / 'trade' then;
//   the legacy v1 windows are created only in their absence. UT.test.trade = {start, truth, submit, practice} is
//   created here with late-binding methods ((UT.trade || legacy).start …); 84 extends it with Object.assign.
//   modes.trade stays the legacy (v1) engine; modes.practice.start(seed) → UT.trade.practice.start when present,
//   else the legacy generator with trade.practice = true and no timer (reveal allowed any time).
// - Mode 'fbh' (UT.specimens.fbhBlock, T from specimenOpts, default 60): forces the 0° probe like step/lamination
//   (DGS applies to the 0° probe only) with the same savedAngle restore rule; MODE_OF.fbh = 'fbh'; DISABLED.fbh and
//   'tools' in ALL_MENUS exactly per SPEC-v2 §8 (tools is enabled in every mode except with the editor open).
// - Every builder receives material: state.material; weld builders receive the whole weldOpts (prep, backing, webT,
//   branchOd, weldMaterial, transferLossDb). sameWeld() also compares the material key so tofd/aut/trade rebuild on
//   a material change. A 'state' event carrying material or weldOpts schedules a deferred (setTimeout 0) check: when
//   the current specimen no longer matches the state (material key, weld options) the current mode is re-entered
//   with {keepProbe, silentUI, keepDefects}; an explicit enter() in the same tick makes the check a no-op.
// - enter(name, {keepDefects}) (new option): when re-entering the SAME mode the defects are kept instead of the v1
//   per-mode policy (used by the rebuild path, setMaterial and setPrep); explicit mode changes are unchanged.
// - setPrep(prep) / setWeldOpts(patch) mirror `prep` into the legacy `type` ('double-v' | 'none' | 'fillet' | 'single-v')
//   and set backing = (prep === 'single-v-backing') so a stale type/backing flag can never override the chosen prep
//   (10-specimens' prepOf lets a non-default type win over the default prep). loadSpecimen(opts) does the same.
// - UT.test.setMaterial(key) = UT.set({material}, {noRender}) + enter(current, {keepProbe, silentUI}); returns the
//   specimen's material record (false for an unknown key). loadSpecimen(id, {material}) sets state.material first.
// - autocal.stage is written to state (0 idle | 1 after Start | 2 after the first ✓) together with t1/d1/d2.
// - Procedure lock: while trade.active and UT.standards.allowedProbes(state) returns a list, isToolbarEnabled()
//   disables the angle buttons (tb-0/45/60/70) whose angle no allowed library probe has. Exam lock (trade.exam.locked
//   && !trade.revealed): tb-defect / tb-hide / tb-beam disabled and defectEditor.open() refuses.
// - Lesson setProbe({angle}) also follows the probe library (UT.probe.libForAngle in the current family / frequency,
//   falling back to the generic probe) so libId / crystalDims stay consistent; explicit fields in the patch win.
// - Finger damping tool: when damping.tool turns on the status hint explains the click-to-place rule; off restores
//   the mode hint. Random practice: modes.practice.start / Defects ▸ Random practice… (90) → UT.trade.practice.start.
(function (UT) {
  'use strict';
  const M = UT.math;
  const S = UT.specimens;
  const modes = {};

  // ------------------------------------------------------------------ constants / tables
  const HINTS = {
    weld: 'LEFT mouse button/drag to move the UT Probe',
    v1: 'Drag the probe onto the top face (100mm Radius) or the front face (25mm thickness)',
    v2: 'Drag the probe onto the top face (Radius) or the front face (12.5mm thickness)',
    step: 'Place the probe on a step, then press Auto Cal (EPOCH 600) for the two-point calibration',
    iow: 'Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge',
    dac: 'Set Amplitude and press record button, then draw curves',
    tky: 'Adjust the brace angle in ADJUST MODE. LEFT mouse button/drag to move the UT Probe',
    tofd: 'Press Run Scan to build the D-scan. Click on the D-scan to move the probe',
    aut: 'Set the gates (Level / Width / Start) then press Run Scan',
    trade: 'Trade Test: find the hidden defects, fill in the report table and press Submit',
    lamination: 'Raster the 0° probe along the plate: note the lamination echo and the lost backwall',
    editor: 'LEFT mouse button/drag to draw defect.',
    fbh: 'FBH reference block: 0° probe — record the backwall reference, then gate a flat-bottom hole (Tools ▸ DGS diagram)',
    dampingTool: 'Finger damping tool: click on the scanning surface to add a damper (max 3; click within 4 mm removes)',
    practice: 'Random practice: find the hidden defects — Hint, Reveal one and Check row are allowed',
  };
  const MODES = ['weld', 'v1', 'v2', 'step', 'iow', 'dac', 'tky', 'tofd', 'aut', 'trade', 'lamination', 'fbh'];
  const WELD_KIND = { weld: 1, tofd: 1, aut: 1, trade: 1 };
  const BLOCK_KIND = { v1: 1, v2: 1, step: 1, iow: 1, dac: 1, tky: 1, fbh: 1 };
  const MODE_OF = { 'plate-weld': 'weld', 'pipe-weld': 'weld', v1: 'v1', v2: 'v2', step: 'step', iow: 'iow', dac: 'dac', tky: 'tky', 'lamination-plate': 'lamination', fbh: 'fbh' };
  const DEFECT_TYPES = ['planar', 'volumetric', 'crack', 'lof', 'porosity', 'slag', 'lamination', 'root'];
  const ALL_TB = ['0', '45', '60', '70', 'v2', 'v1', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'clear', 'beam', 'rad', 'pipe', 'tky', 'tofd', 'aut'];
  const ALL_MENUS = ['file', 'probes', 'stepwedge', 'weld', 'defects', 'tools', 'options', 'help'];   // v2: 'tools' between defects and options (§8)
  const ANGLE_TB = { 'tb-0': 0, 'tb-45': 45, 'tb-60': 60, 'tb-70': 70 };
  const PREPS = (S.preps && S.preps.length) ? S.preps.slice() : ['single-v', 'double-v', 'single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle', 'none'];
  const DISABLED = {
    weld: { toolbar: [], menus: [], hidden: [] },
    fbh: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut', 'pipe'], menus: ['weld', 'defects'], hidden: ['compass'] },
    dac: { toolbar: ['damp', 'defect', 'hide', 'rad', 'pipe', 'tky', 'tofd', 'aut'], menus: [], hidden: ['compass'] },
    v1: { toolbar: ['0', '45', '60', '70', 'v2', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'pipe', 'tky', 'tofd', 'aut'], menus: ['file', 'probes', 'weld', 'defects', 'options'], hidden: ['plan', 'ruler'] },
    v2: { toolbar: ['0', '45', '60', '70', 'v1', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'pipe', 'tky', 'tofd', 'aut'], menus: ['file', 'probes', 'weld', 'defects', 'options'], hidden: ['plan', 'ruler'] },
    editor: { toolbar: ALL_TB.filter(function (t) { return ['defect', 'beam', 'rad'].indexOf(t) < 0; }), menus: ALL_MENUS.filter(function (m) { return m !== 'help'; }), hidden: [] },
    iow: { toolbar: ['damp', 'defect', 'hide', 'pipe', 'tky', 'tofd', 'aut'], menus: ['weld', 'defects'], hidden: ['plan', 'compass'] },
    tofd: { toolbar: ['0', 'v2', 'v1', 'damp'], menus: ['probes', 'options'], hidden: ['compass'] },
    aut: { toolbar: ['damp'], menus: ['options'], hidden: ['compass'] },
    tky: { toolbar: ['v2', 'v1', 'dac', 'plot', 'pipe', 'tofd', 'aut'], menus: ['weld'], hidden: ['plan', 'compass', 'ruler'] },
    trade: { toolbar: ['defect', 'hide', 'v1', 'v2', 'dac', 'plot', 'tky'], menus: ['defects'], hidden: [] },
    step: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut'], menus: [], hidden: ['compass'] },
    lamination: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut'], menus: [], hidden: ['compass'] },
  };
  const enabled = {};
  Object.keys(DISABLED).forEach(function (k) {
    const d = DISABLED[k];
    const dt = d.toolbar.map(function (t) { return 'tb-' + t; });
    const dm = d.menus.map(function (m) { return 'menu-' + m; });
    enabled[k] = {
      toolbar: ALL_TB.map(function (t) { return 'tb-' + t; }).filter(function (id) { return dt.indexOf(id) < 0; }),
      menus: ALL_MENUS.map(function (m) { return 'menu-' + m; }).filter(function (id) { return dm.indexOf(id) < 0; }),
      disabledToolbar: dt, disabledMenus: dm, hidden: d.hidden.slice(),
    };
  });

  // ------------------------------------------------------------------ module state
  let stash = null;            // weld defects stashed while in a block / lamination / trade mode
  let lastAngle = null;        // for the v1/v2 face rebuild on angle change
  let savedAngle = null;       // angle probe in use before step/lamination forced 0°, restored on exit
  let savedGates = null;       // instrument.gates before step mode reset gate 1 for the auto-cal, restored on exit
  let savedProbeMode = null;   // {angle, mode} before tofd forced the compression mode (§6.6), restored on exit
  const STEP_GATE1 = { on: true, start: 6, width: 40, level: 20, alarm: false };   // covers the 1st backwall of the 10 mm step under the wrong cal (8.4 mm)
  let tradeTimer = null;
  let quietUI = false;         // true while __selftest runs: trade.start must not open the Trade Test window
  let autoCalState = null;     // {step: 1|2, t1, d1, d2}
  let rebuildTimer = null;     // deferred specimen-vs-state check after a material / weldOpts change (v2)
  let dampingToolWas = false;  // last seen damping.tool (status hint edge, v2 P3)
  let dacWin = null, tkyWin = null, tradeWin = null, lessonsWin = null, editorWin = null, autoCalWin = null;
  const ui = {};               // live DOM refs of the windows (rebuilt lazily)
  const tkyOpts = { braceAngle: 60, braceT: 12, chordT: 20, braceOffset: 0, precision: 1, kind: 'T-joint' };   // §14.9 Default

  function st() { return UT.state; }
  function t(key, params) { return UT.i18n.t(key, params); }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }
  /** Wave mode of a probe angle (custom angles resolve through UT.probe.presetFor, §1 frozen probe patch). */
  function presetMode(angle) {
    const P = UT.probe;
    const p = P ? (typeof P.presetFor === 'function' ? P.presetFor(angle) : P.presets[angle]) : null;
    return angle === 0 ? 'comp' : (p ? p.mode : 'shear');
  }
  /** Legacy weldOpts.type mirrored from a preparation key (SPEC-v2 §2). */
  function typeOfPrep(prep) { return prep === 'double-v' ? 'double-v' : prep === 'none' ? 'none' : (prep === 'fillet-t' || prep === 'nozzle') ? 'fillet' : 'single-v'; }
  /** Valid material key or null. */
  function materialKey(k) { return typeof k === 'string' && S.materials && S.materials[k] ? k : null; }

  // ------------------------------------------------------------------ external windows (other owners)
  const OWNERS = { plotter: 'views.plotter', rad: 'views.radiograph', size: 'views.sizing', tofd: 'tofd', 'tofd-ascan': 'tofd', aut: 'aut', pipe3d: 'views.pipe3d', usk7: 'instruments' };
  /** Open/close a window owned by another module through whichever API it exposes. */
  function extWin(name, open) {
    const owner = has(OWNERS[name] || '');
    const verb = open ? 'open' : 'close';
    try {
      if (owner) {
        if (name === 'tofd-ascan' && owner.ascanWindow && typeof owner.ascanWindow[open ? 'show' : 'hide'] === 'function') return owner.ascanWindow[open ? 'show' : 'hide']();
        if (typeof owner[verb] === 'function') return owner[verb]();
        if (owner.panel && typeof owner.panel[verb] === 'function') return owner.panel[verb]();
        if (owner.window && typeof owner.window[open ? 'show' : 'hide'] === 'function') return owner.window[open ? 'show' : 'hide']();
      }
      const w = UT.dom && UT.dom.wins && UT.dom.wins[name];
      if (w) return open ? w.show() : w.hide();
    } catch (e) { console.error('[UT.modes] window ' + name, e); }
    return null;
  }

  // ------------------------------------------------------------------ specimen per mode
  /** Options for a block builder: the sanitised specimenOpts plus material: state.material (SPEC-v2 §3.4). */
  function withMat(so) { return Object.assign({ material: st().material || 'carbon' }, so || {}); }
  function weldSpecimen(extra) {
    const o = Object.assign({ material: st().material || 'carbon' }, st().weldOpts, extra || {});
    if (o.pipe) return S.pipeWeld(Object.assign({}, o, { wt: o.wt === undefined ? o.T : o.wt }));
    return S.plateWeld(o);
  }
  function sameWeld(a, b) {
    if (!a || !b || a.id !== b.id || a.T !== b.T || Math.abs(a.L - b.L) > 1e-6 || !!a.pipe !== !!b.pipe) return false;
    if (a.pipe && (a.pipe.od !== b.pipe.od || a.pipe.wt !== b.pipe.wt)) return false;
    if ((a.material && a.material.key) !== (b.material && b.material.key)) return false;
    return JSON.stringify(a.weld || null) === JSON.stringify(b.weld || null);
  }
  function buildSpecimen(mode, opts, probe) {
    const cur = st().specimen;
    const so = opts && opts.specimenOpts ? clampOpts(opts.specimenOpts) : undefined;
    switch (mode) {
      case 'weld': return weldSpecimen(so);
      case 'tofd': case 'aut': case 'trade': {
        // Keep the current weld specimen (identity) only while it still matches weldOpts (PIPE toggle,
        // Weld dialog changes must rebuild the geometry, see 90-app togglePipe → enter(mode, {keepProbe}))
        const fresh = weldSpecimen(so);
        return (cur && cur.kind === 'weld' && !so && sameWeld(cur, fresh)) ? cur : fresh;
      }
      case 'v1': return S.v1(Object.assign({ face: probe.angle === 0 ? 'narrow' : 'wide' }, withMat(so)));
      case 'v2': return S.v2(Object.assign({ face: probe.angle === 0 ? 'narrow' : 'wide' }, withMat(so)));
      case 'step': return S.stepWedge(withMat(so));
      case 'iow': return S.iow(withMat(so));
      case 'dac': return S.dacBlock(Object.assign({ T: st().weldOpts.T || 20 }, withMat(so)));
      case 'fbh': return S.fbhBlock(Object.assign({ T: 60 }, withMat(so)));
      case 'tky': {
        Object.assign(tkyOpts, so || {});
        return S.tky(withMat({ braceAngle: tkyOpts.braceAngle, braceT: tkyOpts.braceT, chordT: tkyOpts.chordT, braceOffset: tkyOpts.braceOffset }));
      }
      case 'lamination': return S.laminationPlate(withMat(so));
      default: throw new Error('Unknown mode: ' + mode);
    }
  }
  /** True when the current specimen still reflects state.material / state.weldOpts (deferred rebuild check). */
  function specimenMatchesState() {
    const s = st(), spec = s.specimen;
    if (!spec) return true;
    const mk = spec.material && spec.material.key;
    if (mk && s.material && mk !== s.material) return false;
    if (spec.kind === 'weld') { try { return sameWeld(spec, weldSpecimen()); } catch (e) { return true; } }
    return true;
  }
  function scheduleRebuildCheck() {
    if (rebuildTimer !== null || typeof setTimeout !== 'function') return;
    rebuildTimer = setTimeout(function () {
      rebuildTimer = null;
      if (specimenMatchesState()) return;
      try { enter(st().mode, { keepProbe: true, silentUI: true, keepDefects: true }); } catch (e) { console.error('[UT.modes] rebuild', e); }
    }, 0);
  }
  function clampProbe(p, spec) {
    const ss = spec.scanSurface || spec.extents;
    const q = Object.assign({}, p);
    if (q.surface !== 'brace' || !spec.tky) { q.x = M.clamp(q.x, ss.xMin, ss.xMax); }
    q.z = spec.pipe ? ((q.z % spec.L) + spec.L) % spec.L : M.clamp(q.z, 0, spec.L);
    return q;
  }
  function laminationDefects(spec) {
    return [
      S.makeDefect({ n: 1, type: 'lamination', label: 'Lamination 1', pts: [{ x: 15, y: 10 }, { x: 40, y: 10 }], height: 0.5, zFrom: 40, zTo: 90 }),
      S.makeDefect({ n: 2, type: 'lamination', label: 'Lamination 2', pts: [{ x: -60, y: 18 }, { x: -30, y: 18 }], height: 0.5, zFrom: 150, zTo: 200 }),
    ].map(function (d) { d.zFrom = M.clamp(d.zFrom, 0, spec.L); d.zTo = M.clamp(d.zTo, 0, spec.L); return d; });
  }

  // ------------------------------------------------------------------ enter / exit
  function closeModeWindows(mode) {
    if (mode === 'iow') extWin('plotter', false);
    if (mode === 'dac' && dacWin) dacWin.hide();
    if (mode === 'tky' && tkyWin) tkyWin.hide();
    if (mode === 'tofd') { extWin('tofd', false); extWin('tofd-ascan', false); }
    if (mode === 'aut') extWin('aut', false);
    if (mode === 'trade') { try { modes.tradeTest.close(); } catch (e) { /* ignore */ } }
    if (mode === 'step') { if (autoCalWin) autoCalWin.hide(); if (autoCalState) setAcState(null); }
  }
  function openModeWindows(mode) {
    if (mode === 'iow') extWin('plotter', true);
    if (mode === 'dac') modes.dacPanel.open();
    if (mode === 'tky') modes.tkyPanel.open();
    if (mode === 'tofd') { extWin('tofd', true); extWin('tofd-ascan', true); }
    if (mode === 'aut') extWin('aut', true);
    if (mode === 'trade') modes.tradeTest.open();
  }

  /**
   * Enter a mode: swaps the specimen, resets the probe, opens the mode's windows, sets the hint.
   * @param {string} name  'weld'|'v1'|'v2'|'step'|'iow'|'dac'|'tky'|'tofd'|'aut'|'trade'|'lamination'|'fbh'
   * @param {{specimenOpts?:object, keepProbe?:boolean, silentUI?:boolean, keepDefects?:boolean}} [opts]
   *   keepDefects (v2): when re-entering the SAME mode keep state.defects (rebuild semantics).
   */
  function enter(name, opts) {
    const o = opts || {};
    if (MODES.indexOf(name) < 0) throw new Error('Unknown mode: ' + name);
    const s = st();
    const prev = s.mode;
    const patch = {};
    const instr = {};
    let probe = Object.assign({}, s.probe);
    // The defect editor (brush) exists only for the weld specimen (§14.3); trade locks it (§14.7 / §15.8).
    if (name !== 'weld' && defectEditor.isOpen()) defectEditor.close();
    if (prev !== name) {
      closeModeWindows(prev);
      if (prev === 'step') { instr.cal = { vel: null, zero: 0 }; if (savedGates) { instr.gates = savedGates; savedGates = null; } }
      if (prev === 'tofd') {
        instr.rectify = 'full';
        // TOFD forced the compression mode: back to the wave mode the probe had before (or its preset)
        probe.mode = savedProbeMode && savedProbeMode.angle === probe.angle ? savedProbeMode.mode : presetMode(probe.angle);
        savedProbeMode = null;
      }
      if (prev === 'trade') {
        stopTradeTimer();
        // The exam is over: the hidden truth must not survive into another mode (§15.8), so submit() cannot score it
        patch.trade = Object.assign({}, s.trade, { active: false, truth: [], seed: null, score: null, result: null, report: [], startedAt: null, revealed: false, practice: false });
        patch.display = Object.assign({}, s.display, { hide: false });
      }
    }
    // probe adjustments per mode (v2: the FBH block is a 0° / DGS block and forces 0° like step / lamination)
    const forcesZero = name === 'step' || name === 'lamination' || name === 'fbh';
    const forcedPrev = prev === 'step' || prev === 'lamination' || prev === 'fbh';
    if (forcesZero) {
      if (probe.angle !== 0 && savedAngle === null) savedAngle = probe.angle;
      probe.angle = 0; probe.mode = 'comp';
    } else if (savedAngle !== null) {
      // Restore only the angle the mode itself forced away: a probe that is no longer at 0° was chosen by the
      // user / a lesson inside step or lamination (angles are enabled there, §14.7) and must survive exit().
      if (probe.angle === 0 && forcedPrev) { probe.angle = savedAngle; probe.mode = presetMode(savedAngle); }
      savedAngle = null;
    }
    if (name !== 'tky') probe.surface = 'chord';
    else if (!o.keepProbe) { probe.angle = 60; probe.mode = presetMode(60); }   // §14.9: default probe 60° on the chord
    if (name === 'tofd') {
      probe.method = probe.method === 'pa' ? 'pe' : probe.method;
      if (probe.angle === 0) { probe.angle = s.tofd.txAngle || 60; probe.mode = presetMode(probe.angle); }
      // The TOFD pair is a compression-wave pair (§6.6, lesson 13 '60° comp'): the physics status line follows probe.mode
      if (prev !== 'tofd') savedProbeMode = { angle: probe.angle, mode: probe.mode };
      probe.mode = 'comp';
    }
    const spec = buildSpecimen(name, o, probe);
    if (o.keepProbe) probe = clampProbe(probe, spec);
    else probe = clampProbe(Object.assign(probe, spec.defaultProbe), spec);
    if (name === 'tofd') probe.x = 0;
    // defects policy
    let defects = s.defects;
    if (o.keepDefects && prev === name) {
      defects = s.defects;                        // v2 rebuild semantics (material / prep change, setMaterial)
    } else if (BLOCK_KIND[name] || name === 'lamination' || name === 'trade') {
      if (WELD_KIND[prev] && !(prev === 'trade')) stash = s.defects;
      defects = name === 'lamination' ? laminationDefects(spec) : (name === 'trade' ? (s.trade.active && prev === 'trade' ? s.defects : []) : []);
    } else if (prev === 'trade') {
      defects = stash || [];                      // the hidden truth never survives the exam (§15.8)
      stash = null;
    } else if (WELD_KIND[name] && !WELD_KIND[prev]) {
      if (stash) { defects = stash; stash = null; }
    }
    // mode specific instrument / state patches
    if (name === 'step') {
      instr.cal = { vel: 5.60, zero: 0.4 };
      // Gate 1 must contain the FIRST backwall of the 10 mm step as displayed under the wrong cal
      // ((3.39 − 0.4)·5.6/2 = 8.4 mm, below the default gate start of 10) or Auto Cal would capture the 20 mm multiple.
      if (prev !== 'step') {
        savedGates = s.instrument.gates;
        instr.gates = s.instrument.gates.map(function (g, i) { return i === 0 ? Object.assign({}, g, STEP_GATE1) : g; });
        instr.activeGate = 0;
      }
    }
    if (name === 'tofd') instr.rectify = 'rf';
    if (name === 'iow') patch.plot = Object.assign({}, s.plot, { cardStyle: 'iow' });
    if (name === 'trade') {
      patch.trade = Object.assign({}, s.trade, { active: true });
      patch.display = Object.assign({}, patch.display || s.display, { hide: true });
    }
    if (Object.keys(instr).length) patch.instrument = Object.assign({}, s.instrument, instr);
    patch.mode = name;
    patch.specimen = spec;
    patch.probe = probe;
    patch.defects = defects;
    if (name !== 'trade' && !WELD_KIND[name]) patch.selectedDefect = 0;
    lastAngle = probe.angle;
    UT.set(patch);
    if (!o.silentUI) openModeWindows(name);
    UT.status({ right: t(hintFor(name)) });
    UT.bus.emit('mode', { mode: name, prev });
    return spec;
  }
  /** Status hint key for a mode (practice / damping tool variants). */
  function hintFor(name) {
    const s = st();
    if (s.damping && s.damping.tool) return HINTS.dampingTool;
    if (name === 'trade' && s.trade && s.trade.practice) return HINTS.practice;
    return HINTS[name] || '';
  }
  /** Return to the default weld mode. */
  function exit() { return enter('weld', { keepProbe: false }); }
  /** Toggle a modal mode: enter it, or exit to weld when already active. 'plot' is an alias of 'iow'. */
  function toggle(name) {
    const n = name === 'plot' ? 'iow' : name;
    if (st().mode === n) return exit();
    return enter(n);
  }
  function current() { return st().mode; }

  /** Rebuild the specimen of the current mode with new options, keeping the probe (used by panels). */
  function rebuild(specimenOpts) {
    const s = st();
    const spec = buildSpecimen(s.mode, { specimenOpts }, s.probe);
    UT.set({ specimen: spec, probe: clampProbe(s.probe, spec) });
    return spec;
  }

  /**
   * V1/V2 face switch: 'wide' (radius side view) or 'narrow' (thickness face). Keeps the probe (clamped).
   * @param {'wide'|'narrow'} face
   */
  function setFace(face) {
    const s = st();
    if (s.mode !== 'v1' && s.mode !== 'v2') return null;
    const spec = s.mode === 'v1' ? S.v1({ face }) : S.v2({ face });
    const probe = clampProbe(s.probe, spec);
    if (!s.specimen || s.specimen.face !== face) Object.assign(probe, { x: spec.defaultProbe.x, z: spec.defaultProbe.z });
    UT.set({ specimen: spec, probe });
    UT.status({ right: t(hintFor(s.mode)) });
    return spec;
  }

  /** Extra middle status text for the current mode (90-app appends it after Pos/Range/AMP). */
  function statusMid() {
    const s = st(), spec = s.specimen, p = s.probe;
    if (!spec) return '';
    const parts = [];
    if (s.mode === 'v1') parts.push(spec.face === 'narrow' ? '25mm thickness. Echoes 25, 50, 75, 100 etc' : '100mm Radius. Echoes 100, 200, 300, 400 etc');
    else if (s.mode === 'v2') parts.push(spec.face === 'narrow' ? '12.5mm thickness. Echoes 12.5, 25, 37.5, 50 etc' : (p.side >= 0 ? '25mm Radius. Echoes 25, 100, 175 etc' : '50mm Radius. Echoes 50, 125, 200 etc'));
    else if (s.mode === 'step' && spec.thicknessAt) parts.push('Step ' + spec.thicknessAt(p.x) + 'mm');
    else if (s.mode === 'tofd') {
      const f = UT.frame && UT.frame.tofd, d = UT.frame && UT.frame.derived;
      if (f && d && f.lateralUs !== undefined) {
        const wd = d.wedgeDelayUs || 0;
        parts.push('Lateral Wave: ' + (f.lateralUs - wd).toFixed(2) + ' micro sec + delay');
        parts.push('BackWall: ' + (f.backwallUs - wd).toFixed(2) + ' micro sec + delay');
      }
    } else if (s.mode === 'aut') {
      const g = s.aut.gates[s.aut.activeGate] || s.aut.gates[0];
      if (g) parts.push('Transit Gate Length=' + g.width + 'mm');
    } else if (s.mode === 'tky' && spec.tky) parts.push('Brace angle = ' + spec.tky.braceAngle + '°');
    else if (s.mode === 'fbh') parts.push(t('FBH block {T} mm: ⌀2/3/4/6 at 30 mm, ⌀3 at 50 mm', { T: spec.T }));
    else if (s.mode === 'trade' && !(UT.trade && s.trade.practice)) parts.push('TRADE TEST ' + tradeClock());
    if (spec.material && spec.material.key && spec.material.key !== 'carbon') parts.push(spec.material.name);
    if (spec.pipe && (s.mode === 'weld' || s.mode === 'aut' || s.mode === 'trade')) parts.push('WT ' + spec.pipe.wt + 'mm  Dia ' + spec.pipe.odInch + 'inch');
    return parts.join('   ');
  }

  // ------------------------------------------------------------------ state listener
  UT.bus.on('state', function (ev) {
    const keys = ev && ev.keys ? ev.keys : [];
    const s = st();
    if (!s.specimen) return;
    if (keys.indexOf('probe') >= 0) {
      const a = s.probe.angle;
      // an angle picked inside step / lamination replaces the one the mode forced to 0°: nothing to restore on exit
      if ((s.mode === 'step' || s.mode === 'lamination') && a !== 0) savedAngle = null;
      if (s.mode === 'tofd' && a !== 0 && s.probe.mode !== 'comp') { lastAngle = a; UT.setIn('probe', { mode: 'comp' }); return; }
      if ((s.mode === 'v1' || s.mode === 'v2') && lastAngle !== null && (a === 0) !== (lastAngle === 0)) {
        lastAngle = a;
        setFace(a === 0 ? 'narrow' : 'wide');
        return;
      }
      lastAngle = a;
    }
    if (keys.indexOf('display') >= 0 || keys.indexOf('trade') >= 0) {
      // Trade test: the hidden truth defects can never be shown until Submit / Reveal (§8.12, §14.7).
      if (s.mode === 'trade' && s.trade.active && !s.trade.revealed && !s.display.hide) { UT.setIn('display', { hide: true }); return; }
    }
    if (keys.indexOf('probe') >= 0 || keys.indexOf('specimen') >= 0 || keys.indexOf('display') >= 0) {
      if (s.display.autoTrig) {
        const trig = s.instrument.trig || { angle: 60, thick: 20, xValue: 0 };
        const ang = s.probe.method === 'pa' ? s.probe.paFrom : s.probe.angle;
        const T = s.specimen.T;
        if (trig.angle !== ang || trig.thick !== T) UT.setIn('instrument', { trig: Object.assign({}, trig, { angle: ang, thick: T }) });
      }
    }
    if (keys.indexOf('defects') >= 0 || keys.indexOf('selectedDefect') >= 0 || keys.indexOf('specimen') >= 0) editorRefresh();
    if (keys.indexOf('instrument') >= 0) dacRefresh();
    // v2: material / weld-preparation changes rebuild the current specimen (deferred; no-op after an explicit enter())
    if (keys.indexOf('material') >= 0 || keys.indexOf('weldOpts') >= 0) scheduleRebuildCheck();
    // v2: finger damping tool status hint (P3)
    if (keys.indexOf('damping') >= 0) {
      const wasTool = !!dampingToolWas, isTool = !!(s.damping && s.damping.tool);
      dampingToolWas = isTool;
      if (isTool !== wasTool) UT.status({ right: t(isTool ? HINTS.dampingTool : hintFor(s.mode)) });
    }
  });

  // ------------------------------------------------------------------ auto-cal wizard (§8.2 / §15.5)
  function trueTimeOfGatedPeak() {
    const f = UT.frame;
    const d = (f && f.derived) || (UT.probe && UT.probe.derive(st().probe, st().specimen));
    const r = f && f.readouts && f.readouts.primary;
    if (!d) return null;
    // The two-point cal assigns d1 = 10 / d2 = 25 to the FIRST backwall of the step, so when the gate sits on a
    // later multiple (or on noise) use the earliest backwall echo above the gate level instead of the gated max.
    const g = st().instrument.gates[st().instrument.activeGate || 0] || st().instrument.gates[0] || {};
    const level = Number.isFinite(g.level) ? g.level : 20;
    let first = null;
    for (const e of (f && f.echoes) || []) {
      if (e.kind === 'backwall' && e.ampPct >= level && (!first || e.path < first.path)) first = e;
    }
    if (first && (!r || !(r.path > 0) || first.path < r.path - 0.5)) return { t: 2 * first.path / d.vel + d.wedgeDelayUs, d, firstBackwall: true };
    if (r && r.path > 0) return { t: 2 * r.path / d.vel + d.wedgeDelayUs, d };
    // fallback: the backwall under the probe (no gated echo yet)
    const spec = st().specimen;
    const T = spec && spec.thicknessAt ? spec.thicknessAt(st().probe.x) : (spec ? spec.T : 25);
    return { t: 2 * T / d.vel + d.wedgeDelayUs, d, fallback: true };
  }
  function autoCalWindow() {
    if (autoCalWin) return autoCalWin;
    ui.acMsg = UT.dom.h('div', { class: 'ac-msg' }, '');
    autoCalWin = UT.dom.win({
      name: 'autocal', title: 'Auto Cal', x: 470, y: 150, w: 330,
      content: UT.dom.h('div', { class: 'ac-body' }, [
        ui.acMsg,
        UT.dom.h('div', { class: 'btn-row' }, [
          UT.dom.button('✓', function () { modes.autoCal.step(); }, { class: 'btn primary', title: 'Capture' }),
          UT.dom.button('Cancel', function () { modes.autoCal.cancel(); }),
        ]),
      ]),
      onClose: function () { setAcState(null); },
    });
    return autoCalWin;
  }
  function acShow(msg) {
    if (typeof document === 'undefined') { UT.status({ right: msg }); return; }
    const w = autoCalWindow();
    UT.dom.injectCss('modes', modes.css);
    ui.acMsg.textContent = msg;
    w.show();
    UT.status({ right: msg });
  }
  /** Set the wizard state (module variable) and mirror it into state.autocal {stage, t1, d1, d2} (SPEC-v2 §2). */
  function setAcState(next) {
    autoCalState = next;
    const cur = st().autocal || {};
    const stage = next ? next.step : 0;
    const t1 = next ? next.t1 : null, d1 = next ? next.d1 : (cur.d1 === undefined ? 10 : cur.d1), d2 = next ? next.d2 : (cur.d2 === undefined ? 25 : cur.d2);
    if (cur.stage !== stage || cur.t1 !== t1 || cur.d1 !== d1 || cur.d2 !== d2) UT.setIn('autocal', { stage, t1, d1, d2 }, { noRender: true });
  }
  const autoCal = {
    /** Start the two-point wizard (10 mm then 25 mm step). Enters step mode when not already there. Sets autocal.stage = 1. */
    start() {
      if (st().mode !== 'step' && !(st().mode === 'v1' && st().specimen && st().specimen.face === 'narrow')) enter('step');
      const ac = st().autocal || {};
      setAcState({ step: 1, d1: Number.isFinite(ac.d1) ? ac.d1 : 10, d2: Number.isFinite(ac.d2) ? ac.d2 : 25, t1: null });
      acShow(t('Auto Cal 1/2: Place the probe on the {d} mm step (gate 1 start below the first backwall echo), then press ✓', { d: autoCalState.d1 }));
      return autoCalState;
    },
    /** Capture the current gated peak time for the current wizard step (stage 1 → 2, stage 2 → done). Returns the new cal when finished; null when the wizard is not running (✓ / Enter is then a no-op — only the 'Auto Cal' softkey starts it). */
    step() {
      if (!autoCalState) return null;
      const cap = trueTimeOfGatedPeak();
      if (!cap) return null;
      if (autoCalState.step === 1) {
        setAcState({ step: 2, d1: autoCalState.d1, d2: autoCalState.d2, t1: cap.t });
        acShow(t('Auto Cal 2/2: Place the probe on the {d} mm step, then press ✓', { d: autoCalState.d2 }));
        return autoCalState;
      }
      const t1 = autoCalState.t1, t2 = cap.t, d1 = autoCalState.d1, d2 = autoCalState.d2;
      if (!(t2 > t1 + 1e-6)) { acShow(t('Auto Cal: the second echo must be later than the first — move to the {d} mm step and press ✓', { d: d2 })); return null; }
      const vel = 2 * (d2 - d1) / (t2 - t1);
      const zero = t1 - cap.d.wedgeDelayUs - 2 * d1 / vel;
      const cal = { vel: +vel.toFixed(4), zero: +zero.toFixed(4) };
      UT.setIn('instrument', { cal });
      setAcState(null);
      if (autoCalWin) autoCalWin.hide();
      UT.status({ right: t('Auto Cal done: Velocity {v} m/s, Zero {z} µs', { v: Math.round(vel * 1000), z: zero.toFixed(2) }) });
      return cal;
    },
    /** Abort the wizard (autocal.stage = 0). */
    cancel() { setAcState(null); if (autoCalWin) autoCalWin.hide(); UT.status({ right: t(hintFor(st().mode)) }); },
    state() { return autoCalState; },
  };

  // ------------------------------------------------------------------ DAC (§8.3)
  const dac = {
    /** Record the gated peak as a DAC point normalised to the reference gain. Returns the point or null. */
    record() {
      const s = st();
      const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
      if (!r || !(r.path > 0)) { UT.status({ right: t('DAC: no echo above the gate level — maximise the echo first') }); return null; }
      const cur = s.instrument.dac;
      const refDb = cur.refDb === null || cur.refDb === undefined ? s.instrument.gain : cur.refDb;
      const ampPct = r.peakPct * Math.pow(10, (refDb - s.instrument.gain) / 20);
      if (ampPct > 120) { UT.status({ right: t('DAC: point refused ({pct}% at ref gain) — reduce the amplitude', { pct: Math.round(ampPct) }) }); return null; }
      const pt = { path: +r.path.toFixed(2), ampPct: +ampPct.toFixed(1), gainAtRecord: s.instrument.gain };
      const points = cur.points.filter(function (p) { return Math.abs(p.path - pt.path) > 1; }).concat([pt]).sort(function (a, b) { return a.path - b.path; });
      // a fresh curve starts without the −6/−14 dB companions: 'Draw Curves' draws them (§8.3)
      const curves = cur.points.length ? cur.curves : false;
      UT.setIn('instrument', { dac: Object.assign({}, cur, { points, refDb, curves, on: points.length >= 2 }) });
      UT.status({ right: t(points.length < 2 ? 'DAC point {n} recorded at {path} mm, {amp}% — record another point' : 'DAC point {n} recorded at {path} mm, {amp}%', { n: points.length, path: pt.path, amp: pt.ampPct }) });
      return pt;
    },
    /** Erase all DAC points. */
    erase() {
      const cur = st().instrument.dac;
      UT.setIn('instrument', { dac: Object.assign({}, cur, { points: [], on: false, refDb: null, curves: false }) });
      UT.status({ right: t(hintFor(st().mode)) });
    },
    /** Toggle the −6 / −14 dB companion curves (or set explicitly). Returns the new state. */
    curves(on) {
      const cur = st().instrument.dac;
      const v = on === undefined ? !cur.curves : !!on;
      UT.setIn('instrument', { dac: Object.assign({}, cur, { curves: v, on: cur.points.length >= 2 }) });
      if (cur.points.length < 2) UT.status({ right: t('DAC: record at least 2 points, then Draw Curves') });
      else UT.status({ right: t(v ? 'DAC −6 dB (50 %) / −14 dB (20 %) curves drawn' : 'DAC companion curves hidden') });
      return v;
    },
  };
  function dacRefresh() {
    if (!dacWin || !dacWin.isOpen() || !ui.dacList) return;
    const d = st().instrument.dac;
    ui.dacList.textContent = '';
    d.points.forEach(function (p, i) {
      ui.dacList.appendChild(UT.dom.h('div', { class: 'dac-pt' }, (i + 1) + ':  ' + p.path.toFixed(1) + ' mm   ' + p.ampPct.toFixed(0) + ' %'));
    });
    if (!d.points.length) ui.dacList.appendChild(UT.dom.h('div', { class: 'dac-pt dim', i18n: 'no points' }));
    ui.dacRef.textContent = t('Ref gain: {g}   Curves: {c}', { g: d.refDb === null || d.refDb === undefined ? '--' : d.refDb + ' dB', c: d.curves ? t('ON (−6 / −14 dB)') : t('off') });
    if (ui.dacDraw) ui.dacDraw.textContent = t(d.curves ? 'Hide Curves' : 'Draw Curves');
  }
  const dacPanel = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      if (!dacWin) {
        ui.dacList = UT.dom.h('div', { class: 'dac-list' });
        ui.dacRef = UT.dom.h('div', { class: 'dac-ref' });
        const body = UT.dom.h('div', { class: 'dac-body', tabindex: 0, onkeydown: function (e) { if (e.key === 'r' || e.key === 'R') { dac.record(); e.preventDefault(); } } }, [
          UT.dom.h('div', { class: 'dac-hint' }, 'Set Amplitude and press record button, then draw curves'),
          UT.dom.h('div', { class: 'btn-row' }, [
            UT.dom.button('Record', function () { dac.record(); }, { class: 'btn primary', title: 'Record the gated peak (R)' }),
            UT.dom.button('Erase', function () { dac.erase(); }, { title: 'Erase all DAC points' }),
            (ui.dacDraw = UT.dom.button('Draw Curves', function () { dac.curves(); }, { title: 'Draw / hide the −6 dB (50 %) and −14 dB (20 %) curves' })),
          ]),
          ui.dacRef, ui.dacList,
        ]);
        dacWin = UT.dom.win({ name: 'dac', title: 'DAC', x: 460, y: 420, w: 300, content: body, onClose: function () { if (st().mode === 'dac') exit(); } });
      }
      dacWin.show();
      dacRefresh();
      return dacWin;
    },
    close() { if (dacWin) dacWin.hide(); },
    toggle() { return dacWin && dacWin.isOpen() ? dacPanel.close() : dacPanel.open(); },
    get window() { return dacWin; },
  };

  // ------------------------------------------------------------------ PLOT (§8.4) and SIZE (§8.5)
  const plot = {
    /** Drop a 20 dB (10 %) beam-edge mark at the current stand-off for the hole nearest the gated depth. */
    markEdge() {
      const s = st(), spec = s.specimen;
      if (!spec) return null;
      const holes = (spec.holes || []).filter(function (h) { return !h.ladder; });
      const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
      let hole = holes[0] || { x: spec.defaultProbe.x, y: 13, label: '13mm' };
      if (r && r.dp !== undefined && holes.length) {
        holes.forEach(function (h) { if (Math.abs(h.y - r.dp) < Math.abs(hole.y - r.dp)) hole = h; });
      }
      const mark = { x: s.probe.x, z: s.probe.z, standOff: +Math.abs(s.probe.x - hole.x).toFixed(1), depth: hole.y, hole: hole.label, side: s.probe.side, gain: s.instrument.gain, ampPct: r ? +r.peakPct.toFixed(1) : null };
      UT.setIn('plot', { edgeMarks: s.plot.edgeMarks.concat([mark]) });
      UT.status({ right: t('Edge mark {n}: stand-off {so} mm at {hole} SDH', { n: s.plot.edgeMarks.length + 1, so: mark.standOff, hole: hole.label }) });
      return mark;
    },
    /** Erase all plotted points and edge marks. */
    erase() { UT.setIn('plot', { points: [], edgeMarks: [] }); },
  };
  function sizingResult(marks) {
    const s = st(), spec = s.specimen;
    const L = marks.find(function (m) { return m.side === 'L'; }), R = marks.find(function (m) { return m.side === 'R'; });
    if (!L || !R) return null;
    let len = Math.abs(R.z - L.z);
    if (spec && spec.pipe) len = Math.min(len, spec.L - len);
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    return { length: +len.toFixed(1), zFrom: Math.min(L.z, R.z), zTo: Math.max(L.z, R.z), depth: r ? +r.dp.toFixed(1) : (L.depth === undefined ? null : L.depth), method: s.sizing.method };
  }
  function sizingMark(side) {
    const s = st();
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const mark = { side, z: +s.probe.z.toFixed(1), x: s.probe.x, depth: r ? +r.dp.toFixed(1) : null, ampPct: r ? +r.peakPct.toFixed(1) : null };
    const marks = s.sizing.marks.filter(function (m) { return m.side !== side; }).concat([mark]);
    const result = sizingResult(marks);
    UT.setIn('sizing', { marks, result });
    UT.status({ right: result ? t('Sizing ({method} drop): length {len} mm', { method: result.method, len: result.length }) : t('Mark {side} at z = {z} mm — now mark the other end', { side, z: mark.z }) });
    return mark;
  }
  const sizing = {
    /** Mark the left (low-z) drop point at the current probe z. */
    markL() { return sizingMark('L'); },
    /** Mark the right (high-z) drop point at the current probe z. */
    markR() { return sizingMark('R'); },
    /** Clear the sizing marks. */
    clear() { UT.setIn('sizing', { marks: [], result: null }); },
    /** Set the sizing method: '6dB' | '20dB'. */
    method(m) { UT.setIn('sizing', { method: m === '20dB' ? '20dB' : '6dB' }); },
  };

  // ------------------------------------------------------------------ defect helpers
  function slotDefect(defects, n) { return defects.find(function (d) { return d.n === n; }) || null; }
  function freeSlot(defects) { for (let n = 1; n <= 8; n++) if (!slotDefect(defects, n)) return n; return null; }
  function sortByN(defects) { return defects.slice().sort(function (a, b) { return a.n - b.n; }); }
  /**
   * Unknown type strings survive normaliseDefects (the tracer treats them as volumetric); map them to
   * 'volumetric' so the editor's Type <select> (DEFECT_TYPES) and the trade report always hold a known
   * value without changing the physics.
   */
  function coerceTypes(list) {
    return list.map(function (d) { return DEFECT_TYPES.indexOf(d.type) >= 0 ? d : Object.assign({}, d, { type: 'volumetric' }); });
  }
  /** Enforce §15.8: at most 8 defects with unique slots n = 1..8 (duplicates move to the next free slot, the rest are dropped). */
  function limitSlots(list) {
    const out = [];
    for (const d of list) {
      const n = Number.isInteger(d.n) && d.n >= 1 && d.n <= 8 && !slotDefect(out, d.n) ? d.n : freeSlot(out);
      if (!n) break;
      out.push(n === d.n ? d : Object.assign({}, d, { n }));
    }
    return out;
  }
  /**
   * Normalise the z extent of every defect: on plates zFrom <= zTo (an inverted range is swapped), on pipes
   * an inverted range means a wrap through 0 (kept, see UT.specimens.defectLength) but both ends are reduced
   * to 0 <= z < circumference. Pure (returns copies for the records it changes).
   */
  function normaliseZ(list, spec) {
    const pipe = !!(spec && spec.pipe);
    const C = spec && spec.L > 0 ? spec.L : null;
    return list.map(function (d) {
      if (!Number.isFinite(d.zFrom) || !Number.isFinite(d.zTo)) return d;
      let zFrom = d.zFrom, zTo = d.zTo;
      if (pipe && C) { zFrom = ((zFrom % C) + C) % C; zTo = ((zTo % C) + C) % C; }
      else if (zFrom > zTo) { const t = zFrom; zFrom = zTo; zTo = t; }
      return zFrom === d.zFrom && zTo === d.zTo ? d : Object.assign({}, d, { zFrom, zTo });
    });
  }
  function setDefects(arr) { UT.set({ defects: limitSlots(coerceTypes(normaliseZ(S.normaliseDefects(arr), st().specimen))) }); return st().defects; }
  function scaleHeight(d, height) {
    const b = S.bbox(d.pts);
    const h = Math.max(1e-6, b.h);
    const k = height / h;
    const pts = b.h < 1e-6 ? d.pts.map(function (p, i) { return { x: p.x, y: +(b.yMin + (i === d.pts.length - 1 ? height : 0)).toFixed(2) }; })
      : d.pts.map(function (p) { return { x: p.x, y: +(b.yMin + (p.y - b.yMin) * k).toFixed(2) }; });
    return S.makeDefect(Object.assign({}, d, { pts, height }));
  }
  function addPreset(name, opts) {
    const s = st();
    const fn = S.defectPresets[name];
    if (!fn) { UT.status({ right: t('Unknown preset {name}', { name }) }); return null; }
    const spec = s.specimen || S.plateWeld(s.weldOpts);
    const n = freeSlot(s.defects);
    if (!n) { UT.status({ right: t('Maximum 8 defects') }); return null; }
    const d = fn(spec, Object.assign({ n }, opts || {}));
    d.n = n;
    UT.set({ defects: s.defects.concat([d]) });
    return d;
  }

  // ------------------------------------------------------------------ defect editor window (§14.3)
  const ed = { separation: 20, length: 30, height: 3, applyAll: false, drag: null };
  function selectedN() { return (st().selectedDefect || 0) + 1; }
  function selectedDefect() { return slotDefect(st().defects, selectedN()); }

  function editorStatusLine() {
    const d = selectedDefect();
    if (!d) return t('Defect {n} — draw it in the cross section with the LEFT mouse button', { n: selectedN() });
    const spec = st().specimen;
    const len = S.defectLength(d, spec);
    return (S.isPlanar(d.type) ? 'PLANAR' : 'VOL') + ' Defect ' + d.n + '  Height=' + M.fmt(d.height, 1) + 'mm Length=' + M.fmt(len, 0) + 'mm. From ' + Math.round(d.zFrom) + 'mm  To ' + Math.round(d.zTo) + 'mm';
  }

  /** z (mm) on the circle view from a canvas point; null when off the ring. */
  function circleZFromPoint(px, py, geo) {
    const dx = px - geo.cx, dy = py - geo.cy;
    const r = Math.hypot(dx, dy);
    if (r < geo.r - 25 || r > geo.R + 25) return null;
    const u = Math.atan2(-dx, -dy);                        // anticlockwise from 12 o'clock
    const z = ((u / (2 * Math.PI)) % 1 + 1) % 1 * geo.C;
    return z;
  }
  function circleGeometry(spec, w, h) {
    const R = Math.min(w, h) / 2 - 15;
    return { cx: w / 2, cy: h / 2, R, r: R * 0.8, C: spec.L };
  }
  function circlePt(geo, z, rad) {
    const u = 2 * Math.PI * z / geo.C;
    return { x: geo.cx - rad * Math.sin(u), y: geo.cy - rad * Math.cos(u) };
  }
  /** Fallback circle view (used when UT.views.plan.drawCircleView is unavailable). */
  function drawCircleFallback(ctx, o) {
    const geo = circleGeometry(o.spec, o.w, o.h);
    const C = geo.C;
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, o.w, o.h);
    ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.R, 0, 2 * Math.PI); ctx.arc(geo.cx, geo.cy, geo.r, 0, 2 * Math.PI, true);
    ctx.fillStyle = '#8c8c8c'; ctx.fill('evenodd');
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.R, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(geo.cx, geo.cy, geo.r, 0, 2 * Math.PI); ctx.stroke();
    const stepMm = Math.round(C / 12);
    ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 12; k++) {
      const z = k * stepMm;
      const a = circlePt(geo, z, geo.r), b = circlePt(geo, z, geo.R);
      if (k > 0) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
      const l = circlePt(geo, z, geo.r - 22);
      ctx.fillText(z + ' mm', l.x, l.y);
      void a;
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('Circle-View. Position', o.w - 6, 4);
    // 0 mm line + arrow (pointing left) at the top
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy); ctx.lineTo(geo.cx, geo.cy - geo.R - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy - geo.R - 8); ctx.lineTo(geo.cx - 60, geo.cy - geo.R - 8); ctx.stroke();
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(geo.cx - 70, geo.cy - geo.R - 8); ctx.lineTo(geo.cx - 58, geo.cy - geo.R - 13); ctx.lineTo(geo.cx - 58, geo.cy - geo.R - 3); ctx.closePath(); ctx.fill();
    // defects
    const drawArc = function (z0, z1, colour) {
      let len = z1 - z0; if (len < 0) len += C;
      const n = Math.max(2, Math.ceil(len / C * 180));
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const p = circlePt(geo, z0 + len * i / n, geo.R - 1); if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      for (let i = n; i >= 0; i--) { const p = circlePt(geo, z0 + len * i / n, geo.r + 1); ctx.lineTo(p.x, p.y); }
      ctx.closePath(); ctx.fillStyle = colour; ctx.fill();
    };
    for (const d of o.defects) if (d.n !== o.selectedN) drawArc(d.zFrom, d.zTo, '#e00000');
    const sel = o.defects.find(function (d) { return d.n === o.selectedN; });
    if (sel) {
      drawArc(sel.zFrom, sel.zTo, '#8b0000');
      ctx.strokeStyle = '#e00000'; ctx.lineWidth = 1.5;
      [sel.zFrom, sel.zTo].forEach(function (z) { const p = circlePt(geo, z, geo.R); ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    }
    ctx.restore();
  }
  function barGeometry(spec, w, h) { return { x0: 30, x1: w - 30, y: h / 2, L: spec.L }; }
  /** Fallback linear bar for plates. */
  function drawBarFallback(ctx, o) {
    const g = barGeometry(o.spec, o.w, o.h);
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, o.w, o.h);
    ctx.fillStyle = '#8c8c8c'; ctx.fillRect(g.x0, g.y - 18, g.x1 - g.x0, 36);
    ctx.strokeStyle = '#333'; ctx.strokeRect(g.x0, g.y - 18, g.x1 - g.x0, 36);
    const zx = function (z) { return g.x0 + (g.x1 - g.x0) * z / g.L; };
    ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let z = 0; z <= g.L + 1e-6; z += 10) {
      const x = zx(z), big = Math.round(z) % 50 === 0;
      ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(x, g.y + 18); ctx.lineTo(x, g.y + 18 + (big ? 8 : 4)); ctx.stroke();
      if (big) ctx.fillText(Math.round(z) + ' mm', x, g.y + 28);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('Plate. Position', o.w - 6, 4);
    for (const d of o.defects) {
      const sel = d.n === o.selectedN;
      ctx.fillStyle = sel ? '#8b0000' : '#e00000';
      ctx.fillRect(zx(Math.max(0, d.zFrom)), g.y - 16, Math.max(2, zx(Math.min(g.L, d.zTo)) - zx(Math.max(0, d.zFrom))), 32);
      if (sel) { ctx.strokeStyle = '#e00000'; ctx.lineWidth = 1.5; ctx.strokeRect(zx(d.zFrom) - 2, g.y - 20, zx(d.zTo) - zx(d.zFrom) + 4, 40); }
    }
    ctx.restore();
  }
  /** Apply a z span (from a ring/bar drag) to the selected slot, creating a default defect when empty. */
  function editorDragSpan(zFrom, zTo) {
    const s = st(), spec = s.specimen;
    if (!spec) return;
    const n = selectedN();
    const existing = slotDefect(s.defects, n);
    const base = existing || S.makeDefect({ n, type: s.editing.brush || 'planar', label: 'Defect ' + n, pts: [{ x: 0, y: Math.max(2, spec.T - 3) }, { x: 0, y: spec.T }] });
    const d = Object.assign({}, base, { zFrom: +zFrom.toFixed(1), zTo: +zTo.toFixed(1), n });
    UT.set({ defects: sortByN(s.defects.filter(function (x) { return x.n !== n; }).concat([d])) });
  }
  function planHelper(spec) {
    const plan = has('views.plan');
    const fn = plan && (spec && spec.pipe ? plan.drawCircleView : plan.drawLinearBar);
    return typeof fn === 'function' ? fn : null;
  }
  function drawEditorCanvas() {
    if (!ui.circle || !editorWin || !editorWin.isOpen()) return;
    const s = st(), spec = s.specimen;
    if (!spec) return;
    const size = UT.dom.cssSize(ui.circle);
    const fn = planHelper(spec);
    let ok = false;
    if (fn) {
      try {
        fn(ui.circle, { spec, defects: s.defects, selected: selectedN(), onDrag: editorDragSpan, onSelect: function (n) { if (n >= 1 && n <= 8) UT.set({ selectedDefect: n - 1 }); } });
        ok = true;
      } catch (e) { ok = false; }
    }
    if (!ok) {
      const ctx = UT.dom.fitCanvas(ui.circle);
      const o = { spec, defects: s.defects, selectedN: selectedN(), w: size.w, h: size.h };
      (spec.pipe ? drawCircleFallback : drawBarFallback)(ctx, o);
    }
    ui.edStatus.textContent = editorStatusLine();
  }
  function editorZAt(ev) {
    const spec = st().specimen;
    const p = UT.dom.localPos(ev, ui.circle);
    const size = UT.dom.cssSize(ui.circle);
    if (spec.pipe) return circleZFromPoint(p.x, p.y, circleGeometry(spec, size.w, size.h));
    const g = barGeometry(spec, size.w, size.h);
    if (p.y < g.y - 30 || p.y > g.y + 40) return null;
    return M.clamp((p.x - g.x0) / (g.x1 - g.x0) * g.L, 0, g.L);
  }
  function editorRefresh() {
    if (!editorWin || !editorWin.isOpen()) return;
    const s = st();
    const n = selectedN();
    ui.radios.forEach(function (r, i) { r.checked = i === s.selectedDefect; });
    ui.delN.textContent = t('Delete Defect {n}', { n });
    const d = selectedDefect();
    if (d) {
      ed.length = +S.defectLength(d, s.specimen).toFixed(1);
      ed.height = d.height;
      ui.fLength.input.value = ed.length;
      ui.fHeight.input.value = ed.height;
      ui.fType.input.value = d.type;
    }
    drawEditorCanvas();
  }
  function applyEditorFields() {
    const s = st();
    const spec = s.specimen;
    const L = spec ? spec.L : 300;
    const len = Math.max(0.5, +ui.fLength.input.value || ed.length);
    const sep = Math.max(0, +ui.fSep.input.value || 0);
    const height = Math.max(0.2, +ui.fHeight.input.value || ed.height);
    const type = ui.fType.input.value;
    ed.length = len; ed.separation = sep; ed.height = height; ed.applyAll = !!ui.fAll.input.checked;
    UT.setIn('editing', { brush: type }, { noRender: true, silent: true });
    let defects = sortByN(s.defects);
    if (!defects.length) return;
    if (ed.applyAll) {
      const z0 = defects[0].zFrom;
      defects = defects.map(function (d, i) {
        let zFrom = z0 + i * (len + sep), zTo = zFrom + len;
        if (spec && spec.pipe) { zFrom = ((zFrom % L) + L) % L; zTo = ((zTo % L) + L) % L; } else { zFrom = M.clamp(zFrom, 0, L); zTo = M.clamp(zTo, 0, L); }
        return scaleHeight(Object.assign({}, d, { zFrom, zTo, type }), height);
      });
    } else {
      defects = defects.map(function (d) {
        if (d.n !== selectedN()) return d;
        let zTo = d.zFrom + len;
        zTo = spec && spec.pipe ? ((zTo % L) + L) % L : M.clamp(zTo, 0, L);
        return scaleHeight(Object.assign({}, d, { zTo, type }), height);
      });
    }
    UT.set({ defects });
  }
  function onBrush(ev) {
    const s = st();
    if (!s.editing || !s.editing.defect || !ev || !Array.isArray(ev.pts) || !ev.pts.length) return;
    if (s.trade.active || (s.specimen && s.specimen.kind !== 'weld')) return;   // §14.3 brush only on welds, §15.8 trade lock
    const n = selectedN();
    if (ev.erase) {
      const defects = [];
      for (const d of s.defects) {
        const pts = d.pts.filter(function (p) { return !ev.pts.some(function (q) { return M.dist(p.x, p.y, q.x, q.y) <= 2; }); });
        if (pts.length >= 2) defects.push(pts.length === d.pts.length ? d : S.makeDefect(Object.assign({}, d, { pts, height: undefined })));
      }
      UT.set({ defects });
      return;
    }
    if (ev.pts.length < 2) return;
    const existing = slotDefect(s.defects, n);
    const spec = s.specimen;
    const zFrom = existing ? existing.zFrom : M.clamp((spec ? spec.L / 2 : 150) - ed.length / 2, 0, spec ? spec.L : 300);
    const zTo = existing ? existing.zTo : zFrom + ed.length;
    const d = S.defectFromBrush(ev.pts, s.editing.brush || 'planar', { n, zFrom, zTo, label: 'Defect ' + n, id: existing ? existing.id : undefined });
    const defects = s.defects.filter(function (x) { return x.n !== n; }).concat([d]);
    UT.set({ defects: sortByN(defects) });
  }
  UT.bus.on('defect:brush', onBrush);
  UT.bus.on('render', function () { drawEditorCanvas(); });

  function buildEditor() {
    const dom = UT.dom;
    // left column
    ui.delN = dom.button('Delete Defect 1', function () {
      const n = selectedN();
      UT.set({ defects: st().defects.filter(function (d) { return d.n !== n; }) });
    }, { class: 'btn dfe-btn' });
    const brushIn = dom.h('input', { type: 'number', min: 10, max: 60, step: 2, value: st().editing.brushPx || 26, class: 'dfe-brush' });
    const dot = dom.h('span', { class: 'dfe-dot', style: { width: '13px', height: '13px' } });
    brushIn.addEventListener('input', function () {
      const px = M.clamp(+brushIn.value || 26, 10, 60);
      dot.style.width = dot.style.height = Math.round(px / 2) + 'px';
      UT.setIn('editing', { brushPx: px }, { noRender: true });
    });
    ui.jsonArea = dom.h('textarea', { class: 'dfe-json', rows: 4, spellcheck: 'false', placeholder: 'Defect JSON (Save Def writes here; paste here and press Load Def)' });
    ui.jsonArea.style.display = 'none';
    const presetSel = dom.h('select', { class: 'dfe-preset' }, S.defectPresetNames.map(function (p) { return dom.h('option', { value: p.key }, p.label); }));
    const left = dom.h('div', { class: 'dfe-left' }, [
      dom.button('Delete All Defects', function () {
        dom.confirm('Delete all defects?', { title: 'ERASE ALL DEFECTS' }).then(function (yes) { if (yes) UT.set({ defects: [] }); });
      }, { class: 'btn dfe-btn' }),
      ui.delN,
      dom.h('div', { class: 'dfe-brushrow', title: 'Brush size (px)' }, [brushIn, dot]),
      dom.button('Load Def', function () {
        let txt = ui.jsonArea.value.trim();
        if (!txt) { try { txt = localStorage.getItem('utsim.defects') || ''; } catch (e) { txt = ''; } }
        if (!txt) { UT.status({ right: t('No saved defects (utsim.defects)') }); return; }
        try { setDefects(JSON.parse(txt)); ui.jsonArea.value = txt; ui.jsonArea.style.display = 'block'; UT.status({ right: t('Defects loaded') }); }
        catch (e) { UT.status({ right: t('Load Def: invalid JSON') }); }
      }, { class: 'btn dfe-btn' }),
      dom.button('Save Def', function () {
        const txt = JSON.stringify(st().defects);
        try { localStorage.setItem('utsim.defects', txt); } catch (e) { /* ignore */ }
        ui.jsonArea.value = txt; ui.jsonArea.style.display = 'block';
        UT.status({ right: t('Defects saved (utsim.defects) — JSON shown for copy/paste') });
      }, { class: 'btn dfe-btn' }),
      presetSel,
      dom.button('Add preset', function () {
        const d = addPreset(presetSel.value);
        if (d) UT.set({ selectedDefect: d.n - 1 });
      }, { class: 'btn dfe-btn' }),
    ]);
    // middle: canvas
    ui.circle = dom.h('canvas', { id: 'cv-circle', width: 560, height: 400, class: 'dfe-canvas' });
    ui.edStatus = dom.h('div', { class: 'dfe-status' }, '');
    // Own drag handlers only when 62-view-plan's helpers (which bind their own) are unavailable.
    if (!has('views.plan.drawCircleView')) {
      // Pointer Events (mouse / touch / pen) with capture, touch-action none on the canvas (SPEC-v2 §5.4)
      ui.circle.style.touchAction = 'none';
      const startDrag = function (e) {
        if (e.button !== undefined && e.button !== 0) return;
        const z = editorZAt(e);
        if (z === null) return;
        ed.drag = { z0: z, n: selectedN() };
        try { ui.circle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      };
      const moveDrag = function (e) {
        if (!ed.drag) return;
        const z = editorZAt(e);
        if (z === null) return;
        const spec = st().specimen;
        let zFrom = Math.round(ed.drag.z0), zTo = Math.round(z);
        if (!spec.pipe && zTo < zFrom) { const tmp = zFrom; zFrom = zTo; zTo = tmp; }
        if (Math.abs(zTo - zFrom) < 1) zTo = zFrom + 1;
        editorDragSpan(zFrom, zTo);
      };
      const endDrag = function (e) { ed.drag = null; try { ui.circle.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } };
      ui.circle.addEventListener('pointerdown', startDrag);
      ui.circle.addEventListener('pointermove', moveDrag);
      ui.circle.addEventListener('pointerup', endDrag);
      ui.circle.addEventListener('pointercancel', endDrag);
    }
    const mid = dom.h('div', { class: 'dfe-mid' }, [ui.circle, ui.edStatus]);
    // right: select defect panel
    ui.radios = [];
    const radioRows = [];
    for (let i = 0; i < 8; i++) {
      const r = dom.h('input', { type: 'radio', name: 'dfe-sel', value: i });
      r.addEventListener('change', function () { if (r.checked) UT.set({ selectedDefect: i }); });
      ui.radios.push(r);
      radioRows.push(dom.h('label', { class: 'dfe-radio' }, [r, String(i + 1)]));
    }
    ui.fSep = dom.field('SEPARATION', { type: 'number', value: ed.separation, min: 0, max: 500, step: 1 });
    ui.fLength = dom.field('LENGTH', { type: 'number', value: ed.length, min: 1, max: 1000, step: 1 });
    ui.fHeight = dom.field('HEIGHT', { type: 'number', value: ed.height, min: 0.2, max: 100, step: 0.5 });
    ui.fType = dom.field('Type', { tag: 'select', type: 'select', value: st().editing.brush || 'planar', options: DEFECT_TYPES.map(function (t) { return { value: t, label: t }; }), onchange: function (v) { UT.setIn('editing', { brush: v }, { noRender: true }); } });
    ui.fAll = dom.field('APPLY TO ALL DEFECTS', { type: 'checkbox', value: false });
    const right = dom.h('div', { class: 'dfe-right' }, [
      dom.h('fieldset', { class: 'dfe-select' }, [dom.h('legend', {}, 'Select Defect')].concat(radioRows)),
      ui.fSep, ui.fLength, ui.fHeight, ui.fType, ui.fAll,
      dom.button('OK', applyEditorFields, { class: 'btn dfe-ok' }),
    ]);
    const body = dom.h('div', { class: 'dfe' }, [dom.h('div', { class: 'dfe-row' }, [left, mid, right]), ui.jsonArea]);
    editorWin = dom.win({
      name: 'defects', title: 'Defects', x: 380, y: 104, w: 900, content: body,
      onClose: function () { defectEditor._closed(); },
    });
    return editorWin;
  }
  const defectEditor = {
    /** Open the defect editor: enables the cross-section brush (state.editing.defect = true). */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      if (!editorWin) buildEditor();
      if ((st().mode === 'trade' && st().trade.active) || examLocked()) { UT.status({ right: t('Defect editor is locked during the Trade Test') }); return null; }
      UT.setIn('editing', { defect: true, brush: st().editing.brush || 'planar', brushPx: st().editing.brushPx || 26 });
      editorWin.show();
      editorRefresh();
      UT.status({ right: t(HINTS.editor) });
      return editorWin;
    },
    close() { if (editorWin && editorWin.isOpen()) editorWin.close(); else defectEditor._closed(); },
    toggle() { return editorWin && editorWin.isOpen() ? defectEditor.close() : defectEditor.open(); },
    _closed() {
      if (st().editing.defect) UT.setIn('editing', { defect: false });
      UT.status({ right: t(hintFor(st().mode)) });
    },
    isOpen() { return !!(editorWin && editorWin.isOpen()); },
    get window() { return editorWin; },
    fields: ed,
  };

  // ------------------------------------------------------------------ trade test (§8.12, §15.8)
  const TRADE_PRESETS = ['rootCrack', 'lof', 'porosity', 'slag', 'toeCrack', 'centrelineCrack', 'incompletePenetration'];
  function generateTruth(seed, spec) {
    const r = M.rng(seed);
    const count = 3 + Math.floor(r() * 4);          // 3..6
    const L = spec.L;
    const slotLen = L / count;
    const defects = [];
    for (let i = 0; i < count; i++) {
      const key = TRADE_PRESETS[Math.floor(r() * TRADE_PRESETS.length)];
      const length = Math.round(15 + r() * 30);
      const zFrom = Math.round(M.clamp(i * slotLen + 5 + r() * Math.max(1, slotLen - length - 10), 0, Math.max(0, L - length)));
      const opts = { n: i + 1, zFrom, length, label: 'Defect ' + (i + 1) };
      if (key === 'lof' || key === 'toeCrack') opts.side = r() < 0.5 ? -1 : 1;
      if (key === 'rootCrack' || key === 'centrelineCrack') opts.height = Math.round(2 + r() * 4);
      if (key === 'porosity') { opts.dia = +(2 + r() * 3).toFixed(1); opts.x = Math.round((r() - 0.5) * 6); opts.y = +(spec.T * (0.3 + r() * 0.4)).toFixed(1); }
      if (key === 'slag') { opts.x = Math.round((r() - 0.5) * 6); opts.y = +(spec.T * (0.3 + r() * 0.4)).toFixed(1); }
      const d = S.defectPresets[key](spec, opts);
      d.n = i + 1; d.label = 'Defect ' + (i + 1); d.id = 1000 + i;
      defects.push(d);
    }
    const truth = defects.map(function (d) {
      const b = S.bbox(d.pts);
      return { n: d.n, zFrom: +d.zFrom.toFixed(1), zTo: +d.zTo.toFixed(1), depth: +b.yMin.toFixed(1), height: +d.height.toFixed(1), type: d.type };
    });
    return { defects, truth };
  }
  function tradeClock() {
    const tr = st().trade;
    if (!tr.active || !tr.startedAt || tr.practice) return '';
    const now = UT.trade && typeof UT.trade._now === 'function' ? UT.trade._now() : Date.now();
    const el = Math.max(0, Math.floor((now - tr.startedAt) / 1000));
    const limit = Number.isFinite(tr.timeLimitMin) && tr.timeLimitMin > 0 ? tr.timeLimitMin : 60;
    const rem = Math.max(0, Math.round(limit * 60) - el);
    const mm = Math.floor(rem / 60), ss = rem % 60;
    return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function stopTradeTimer() { if (tradeTimer && typeof clearInterval === 'function') clearInterval(tradeTimer); tradeTimer = null; }
  function startTradeTimer() {
    stopTradeTimer();
    if (typeof setInterval !== 'function' || typeof document === 'undefined') return;
    tradeTimer = setInterval(function () { if (ui.tClock) ui.tClock.textContent = t('Time left {t}', { t: tradeClock() }); }, 1000);
  }
  /** True while a shared exam is locked (truth hidden, editor / HIDE / BEAM disabled) — SPEC-v2 §4.2.3. */
  function examLocked(state) {
    const tr = (state || st()).trade;
    return !!(tr && tr.exam && tr.exam.locked && !tr.revealed);
  }
  const trade = {
    /**
     * Start a trade test with hidden seeded defects.
     * @param {number} [seed]
     */
    start(seed) {
      const sd = seed === undefined || seed === null ? Math.floor(Math.random() * 1e9) : (seed >>> 0);
      if (defectEditor.isOpen()) defectEditor.close();
      if (st().mode !== 'trade') enter('trade', { keepProbe: true, silentUI: quietUI || typeof document === 'undefined' });
      const s = st();
      const g = generateTruth(sd, s.specimen);
      UT.set({
        defects: g.defects,
        trade: Object.assign({}, s.trade, { active: true, revealed: false, report: [], score: null, seed: sd, startedAt: Date.now(), truth: g.truth, result: null, practice: false }),
        display: Object.assign({}, s.display, { hide: true }),
        selectedDefect: 0,
      });
      startTradeTimer();
      if (ui.tRows) { ui.tRows.textContent = ''; tradeAddRow(); }     // fresh report table with one empty row
      tradeRefresh();
      UT.status({ right: t('Trade Test started ({n} hidden defects). Fill in the report, then Submit', { n: g.truth.length }) });
      return g.truth.map(function (q) { return Object.assign({}, q); });
    },
    /** Hidden truth rows [{n, zFrom, zTo, depth, height, type}] ([] while a shared exam is locked). */
    truth() { if (examLocked()) return []; return (st().trade.truth || []).map(function (q) { return Object.assign({}, q); }); },
    /**
     * Score a report: rows [{n, z, length, depth, type}] → 0..100. Reveals the defects.
     */
    submit(rows) {
      const s = st();
      if (!s.trade.active || s.mode !== 'trade') return 0;      // no test running: nothing to score, state untouched
      const truth = s.trade.truth || [];
      const num = function (v) { const x = typeof v === 'string' && v.trim() === '' ? NaN : +v; return Number.isFinite(x) ? x : NaN; };
      const report = (Array.isArray(rows) ? rows : []).filter(function (r) { return r && typeof r === 'object'; }).map(function (r, i) {
        const n = num(r.n);
        return { n: Number.isFinite(n) ? n : i + 1, z: num(r.z), length: num(r.length), depth: num(r.depth), type: typeof r.type === 'string' ? r.type : '' };
      }).filter(function (r) { return Number.isFinite(r.z) && Number.isFinite(r.depth); });
      const used = {};
      let matched = 0, typeMatches = 0, falseCalls = 0;
      const detail = [];
      for (const r of report) {
        let best = -1, bestD = Infinity;
        truth.forEach(function (t, i) {
          if (used[i]) return;
          const dz = Math.abs(r.z - t.zFrom), dd = Math.abs(r.depth - t.depth);
          if (dz <= 10 && dd <= 3 && dz + dd < bestD) { bestD = dz + dd; best = i; }
        });
        if (best >= 0) {
          used[best] = true; matched++;
          const tm = truth[best].type === r.type;
          if (tm) typeMatches++;
          detail.push({ row: r, truth: truth[best], hit: true, typeMatch: tm });
        } else { falseCalls++; detail.push({ row: r, truth: null, hit: false, typeMatch: false }); }
      }
      const misses = truth.filter(function (t, i) { return !used[i]; });
      const N = Math.max(1, truth.length);
      const score = M.clamp(Math.round(100 * (matched + typeMatches / 2) / (1.5 * N)) - 10 * falseCalls, 0, 100);
      UT.set({
        trade: Object.assign({}, s.trade, { report, score, revealed: true, result: { matched, typeMatches, falseCalls, misses, detail } }),
        display: Object.assign({}, s.display, { hide: false }),
      });
      stopTradeTimer();
      tradeRefresh();
      UT.status({ right: t('Trade Test score {score}% — {m}/{n} found, {f} false calls', { score, m: matched, n: truth.length, f: falseCalls }) });
      return score;
    },
    /** Reveal the hidden defects without scoring. */
    reveal() {
      const s = st();
      UT.set({ trade: Object.assign({}, s.trade, { revealed: true }), display: Object.assign({}, s.display, { hide: false }) });
      tradeRefresh();
    },
  };
  /** Legacy random practice (T5 fallback when 84-trade is absent): the v1 generator without a timer, reveal any time. */
  const legacyPractice = {
    start(seed) {
      const truth = trade.start(seed);
      stopTradeTimer();
      UT.setIn('trade', { practice: true, hintsUsed: 0, revealedOne: [] });
      UT.status({ right: t(HINTS.practice) });
      return truth;
    },
    hint() {
      const s = st(), tr = s.trade;
      if (!tr.active || !tr.truth.length) return null;
      const z = s.probe.z;
      let best = null;
      tr.truth.forEach(function (q) {
        const zc = (q.zFrom + q.zTo) / 2;
        const d = Math.abs(zc - z);
        if (!best || d < best.d) best = { d, q, zc };
      });
      UT.setIn('trade', { hintsUsed: (tr.hintsUsed || 0) + 1 });
      const msg = t('nearest hidden indication: {d} mm further along z, side {side}', { d: Math.round(best.d), side: best.zc >= z ? 'B' : 'A' });
      UT.status({ right: msg });
      return { dz: +(best.zc - z).toFixed(1), n: best.q.n };
    },
    revealOne() { trade.reveal(); return st().trade.truth[0] || null; },
    checkRow(i) {
      const tr = st().trade, r = (tr.report || [])[i];
      if (!r) return null;
      return tr.truth.some(function (q) { return Math.abs(r.z - q.zFrom) <= 10 && Math.abs(r.depth - q.depth) <= 3; });
    },
  };
  /** Random practice entry (T5): UT.trade.practice when 84 is loaded, else the legacy fallback. */
  const practice = {
    /** Start a practice run (no timer, no lock). Returns the truth rows. */
    start(seed) { const p = has('trade.practice.start'); return p ? UT.trade.practice.start(seed) : legacyPractice.start(seed); },
    hint() { const p = has('trade.practice.hint'); return p ? UT.trade.practice.hint() : legacyPractice.hint(); },
    revealOne() { const p = has('trade.practice.revealOne'); return p ? UT.trade.practice.revealOne() : legacyPractice.revealOne(); },
    checkRow(i) { const p = has('trade.practice.checkRow'); return p ? UT.trade.practice.checkRow(i) : legacyPractice.checkRow(i); },
    /** Open the practice window (84) or start a legacy practice run. */
    open() { const w = has('trade.practiceWindow'); if (w && typeof (w.open || w.show) === 'function') return (w.open || w.show).call(w); return practice.start(); },
    toggle() { const w = has('trade.practiceWindow'); if (w && typeof w.toggle === 'function') return w.toggle(); return practice.open(); },
  };
  function tradeRows() {
    if (!ui.tRows) return [];
    return Array.from(ui.tRows.children).map(function (tr) {
      const inp = tr.querySelectorAll('input, select');
      return { n: +inp[0].value, z: parseFloat(inp[1].value), length: parseFloat(inp[2].value), depth: parseFloat(inp[3].value), type: inp[4].value };
    });
  }
  function tradeAddRow(row) {
    const dom = UT.dom;
    const n = ui.tRows.children.length + 1;
    const r = row || { n, z: '', length: '', depth: '', type: 'planar' };
    const tr = dom.h('tr', {}, [
      dom.h('td', {}, dom.h('input', { type: 'number', value: r.n, class: 'tt-n', min: 1, max: 16 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: r.z, class: 'tt-in', step: 1 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: r.length, class: 'tt-in', step: 1 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: r.depth, class: 'tt-in', step: 0.5 })),
      dom.h('td', {}, dom.h('select', { class: 'tt-sel' }, DEFECT_TYPES.map(function (t) { return dom.h('option', { value: t, selected: t === r.type ? true : null }, t); }))),
      dom.h('td', {}, dom.button('✕', function () { tr.remove(); }, { class: 'btn tt-del', title: 'Remove row' })),
    ]);
    ui.tRows.appendChild(tr);
    return tr;
  }
  function tradeRefresh() {
    if (!tradeWin || !tradeWin.isOpen() || !ui.tResult) return;
    const tr = st().trade;
    ui.tClock.textContent = tr.active && tr.startedAt ? t('Time left {t}', { t: tradeClock() }) : t('Press Start');
    ui.tSeed.textContent = tr.seed === null || tr.seed === undefined ? '' : t('Test #{seed}', { seed: tr.seed });
    ui.tResult.textContent = '';
    if (tr.score !== null && tr.score !== undefined && tr.result) {
      const res = tr.result;
      ui.tResult.appendChild(UT.dom.h('div', { class: 'tt-score' }, t('SCORE {score}%   ({m} of {n} found, {tm} type correct, {f} false calls)', { score: tr.score, m: res.matched, n: tr.truth.length, tm: res.typeMatches, f: res.falseCalls })));
    }
    if (tr.revealed && tr.truth && tr.truth.length) {
      const tbl = UT.dom.h('table', { class: 'tt-truth' }, [
        UT.dom.h('tr', {}, ['#', 'From z', 'Length', 'Depth', 'Height', 'Type'].map(function (h) { return UT.dom.h('th', { i18n: h }); })),
      ].concat(tr.truth.map(function (d) {
        return UT.dom.h('tr', {}, [d.n, d.zFrom, +(d.zTo - d.zFrom).toFixed(1), d.depth, d.height, d.type].map(function (v) { return UT.dom.h('td', {}, String(v)); }));
      })));
      ui.tResult.appendChild(UT.dom.h('div', { class: 'tt-sub', i18n: 'True defects' }));
      ui.tResult.appendChild(tbl);
      if (tr.result && tr.result.misses && tr.result.misses.length) ui.tResult.appendChild(UT.dom.h('div', { class: 'tt-miss' }, t('Missed: {list}', { list: tr.result.misses.map(function (m) { return '#' + m.n + ' (' + m.type + ' at z ' + m.zFrom + ')'; }).join(', ') })));
    }
  }
  /** Owner window of the v2 trade test (84) when loaded: {open/show, close/hide, toggle, isOpen, win}. */
  function tradeOwnerWin() { const w = has('trade.window'); return w && typeof w === 'object' ? w : null; }
  const legacyTradeTest = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      const dom = UT.dom;
      if (!tradeWin) {
        ui.tClock = dom.h('span', { class: 'tt-clock' }, 'Press Start');
        ui.tSeed = dom.h('span', { class: 'tt-seed' }, '');
        ui.tRows = dom.h('tbody', {});
        ui.tResult = dom.h('div', { class: 'tt-result' });
        const seedIn = dom.h('input', { type: 'number', class: 'tt-seedin', placeholder: 'seed', title: 'Optional seed (same seed = same test)' });
        const table = dom.h('table', { class: 'tt-table' }, [
          dom.h('thead', {}, dom.h('tr', {}, ['#', 'z start (mm)', 'Length (mm)', 'Depth (mm)', 'Type', ''].map(function (h) { return dom.h('th', {}, h); }))),
          ui.tRows,
        ]);
        const body = dom.h('div', { class: 'tt' }, [
          dom.h('div', { class: 'tt-head' }, [
            dom.button('Start', function () { trade.start(seedIn.value === '' ? undefined : +seedIn.value); }, { class: 'btn primary' }),
            seedIn,
            dom.button('New test', function () { seedIn.value = ''; trade.start(); }),
            ui.tClock, ui.tSeed,
          ]),
          dom.h('div', { class: 'tt-intro' }, 'Report every defect you find: start position along the weld (z), length, depth of the top of the defect and its type. Tolerance ±10 mm (z), ±3 mm (depth). 실기시험: 발견한 결함의 위치(z), 길이, 깊이, 종류를 기록하고 Submit을 누르세요.'),
          table,
          dom.h('div', { class: 'btn-row' }, [
            dom.button('Add row', function () { tradeAddRow(); }),
            dom.button('Submit', function () { if (!st().trade.truth.length) { UT.status({ right: t('Press Start first') }); return; } trade.submit(tradeRows()); }, { class: 'btn primary' }),
            dom.button('Reveal', function () { trade.reveal(); }),
          ]),
          ui.tResult,
        ]);
        tradeWin = dom.win({ name: 'trade', title: 'Trade Test', x: 600, y: 110, w: 560, content: body, onClose: function () { if (st().mode === 'trade') exit(); } });
      }
      tradeWin.show();
      if (!ui.tRows.children.length) tradeAddRow();
      tradeRefresh();
      return tradeWin;
    },
    close() { if (tradeWin) tradeWin.hide(); },
    toggle() { return tradeWin && tradeWin.isOpen() ? legacyTradeTest.close() : legacyTradeTest.open(); },
    isOpen() { return !!(tradeWin && tradeWin.isOpen()); },
    get window() { return tradeWin; },
  };
  /**
   * Late-bound Trade Test window (SPEC-v2 §1): delegates to UT.trade.window (84) when loaded and NEVER creates the
   * v1 dom.win 'trade' in that case; the legacy window is used only without 84.
   */
  const tradeTest = {
    open() { const w = tradeOwnerWin(); if (w) return (w.open || w.show).call(w); return legacyTradeTest.open(); },
    close() { const w = tradeOwnerWin(); if (w) return (w.close || w.hide).call(w); return legacyTradeTest.close(); },
    toggle() { const w = tradeOwnerWin(); if (w) return w.toggle ? w.toggle() : (w.isOpen && w.isOpen() ? tradeTest.close() : tradeTest.open()); return legacyTradeTest.toggle(); },
    isOpen() { const w = tradeOwnerWin(); if (w) return !!(w.isOpen && w.isOpen()); return legacyTradeTest.isOpen(); },
    get window() { const w = tradeOwnerWin(); return w ? (w.win || w) : tradeWin; },
    legacy: legacyTradeTest,
  };

  // ------------------------------------------------------------------ TKY panel (§14.9)
  function tkyApply(patch) {
    const p = Object.assign({}, patch || {});
    if (p.kind !== undefined && p.kind !== 'T-joint') delete p.kind;   // only the T-joint geometry is modelled
    Object.assign(tkyOpts, p);
    if (st().mode !== 'tky') enter('tky', { specimenOpts: Object.assign({}, tkyOpts) });
    else rebuild(Object.assign({}, tkyOpts));
    tkyRefresh();
  }
  function tkyRefresh() {
    if (!tkyWin || !ui.tkySlider) return;
    ui.tkySlider.value = tkyOpts.braceAngle;
    ui.tkySlider.step = tkyOpts.precision;
    ui.tkyLabel.textContent = t('Brace angle = {a}°', { a: tkyOpts.braceAngle });
    ui.tkyKind.forEach(function (b) { b.classList.toggle('active', b.dataset.kind === tkyOpts.kind); });
    ui.tkyPrec.classList.toggle('active', tkyOpts.precision !== 1);
    ui.tkyPrec.textContent = t('Precision {p}', { p: tkyOpts.precision === 1 ? '1°' : '0.1°' });
    ui.fBraceT.input.value = tkyOpts.braceT; ui.fChordT.input.value = tkyOpts.chordT; ui.fOffset.input.value = tkyOpts.braceOffset;
  }
  const tkyPanel = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      const dom = UT.dom;
      if (!tkyWin) {
        ui.tkyLabel = dom.h('div', { class: 'tky-label' }, 'Brace angle = 60°');
        ui.tkySlider = dom.h('input', { type: 'range', min: 30, max: 90, step: 1, value: 60, class: 'tky-slider' });
        ui.tkySlider.addEventListener('input', function () { tkyApply({ braceAngle: +(+ui.tkySlider.value).toFixed(1) }); });
        // Only the T-joint (plate chord + angled brace) exists in UT.specimens.tky(): Plate / Pipe stay visible
        // for fidelity (§14.9) but disabled, so the row never pretends to change the modelled geometry.
        ui.tkyKind = ['Plate', 'T-joint', 'Pipe'].map(function (k) {
          const modelled = k === 'T-joint';
          return dom.button(k, function () { if (modelled) tkyApply({ kind: k }); }, {
            class: 'btn tky-kind', dataset: { kind: k }, disabled: !modelled,
            title: modelled ? 'T-joint: plate chord with an angled brace (modelled)' : k + ' joint is not modelled in this version — only the T-joint geometry is available',
          });
        });
        ui.tkyPrec = dom.button('Precision 1°', function () { tkyApply({ precision: tkyOpts.precision === 1 ? 0.1 : 1 }); }, { class: 'btn tky-btn' });
        ui.fBraceT = dom.field('Brace T (mm)', { type: 'number', value: 12, min: 4, max: 60, step: 1, onchange: function (v) { if (v > 0) tkyApply({ braceT: v }); } });
        ui.fChordT = dom.field('Chord T (mm)', { type: 'number', value: 20, min: 6, max: 100, step: 1, onchange: function (v) { if (v > 0) tkyApply({ chordT: v }); } });
        ui.fOffset = dom.field('Brace offset (mm)', { type: 'number', value: 0, min: -60, max: 60, step: 1, onchange: function (v) { if (Number.isFinite(v)) tkyApply({ braceOffset: v }); } });
        const body = dom.h('div', { class: 'tky' }, [
          ui.tkyLabel, ui.tkySlider,
          dom.h('div', { class: 'btn-row tky-row' }, ui.tkyKind),
          dom.h('div', { class: 'btn-row tky-row' }, [
            ui.tkyPrec,
            dom.button('Default', function () { tkyApply({ braceAngle: 60, braceT: 12, chordT: 20, braceOffset: 0 }); }, { class: 'btn tky-btn' }),
            dom.button('Load Def', function () {
              const spec = st().specimen;
              if (!spec || !spec.tky) return;
              const toe = spec.tky.toe.x + spec.tky.weldLeg;
              const y = 0.6;
              const d = S.makeDefect({ n: 1, type: 'lof', label: 'Toe LOF', pts: [{ x: toe - 20, y }, { x: toe, y }], height: 0.6, zFrom: spec.L / 2 - 10, zTo: spec.L / 2 + 10 });
              UT.set({ defects: [d] });
              UT.status({ right: t('Default toe LOF loaded (20 mm long under the toe weld)') });
            }, { class: 'btn tky-btn' }),
          ]),
          ui.fBraceT, ui.fChordT, ui.fOffset,
        ]);
        tkyWin = dom.win({ name: 'tky', title: 'ADJUST MODE', x: Math.max(480, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 316), y: 106, w: 300, content: body, onClose: function () { if (st().mode === 'tky') exit(); } });
      }
      tkyWin.show();
      tkyRefresh();
      return tkyWin;
    },
    close() { if (tkyWin) tkyWin.hide(); },
    toggle() { return tkyWin && tkyWin.isOpen() ? tkyPanel.close() : tkyPanel.open(); },
    get window() { return tkyWin; },
    opts: tkyOpts,
    apply: tkyApply,
  };

  // ------------------------------------------------------------------ lessons (§14.12)
  /** Library patch for an angle in the probe's current family / frequency (v2 §3.5); null for custom angles / no library. */
  function libPatchFor(angle, probe) {
    const P = UT.probe;
    if (!P || !Array.isArray(P.library) || typeof P.select !== 'function') return null;
    const cur = (P.libEntry && P.libEntry(probe.libId)) || null;
    const wantFamily = angle === 0 ? 'straight' : 'angle';
    const maker = cur ? cur.maker : 'generic';
    const freq = probe.freq || 5;
    // Preference: same maker + same frequency → same maker → generic + same frequency → generic (v1 defaults are generic,
    // so a v1 lesson setup keeps the generic 5 MHz ⌀10 probe; a user's Krautkrämer set follows its own family).
    let best = null, bestScore = Infinity;
    P.library.forEach(function (p) {
      if (p.family !== wantFamily || Math.abs((p.angle || 0) - angle) > 0.5) return;
      const score = (p.maker === maker ? 0 : (p.maker === 'generic' ? 10 : 20)) + Math.abs((p.freq || 5) - freq);
      if (score < bestScore) { bestScore = score; best = p; }
    });
    return best ? P.select(best.id) : null;
  }
  function setProbe(p) {
    const s = st();
    let np = Object.assign({}, s.probe, p);
    if (p.angle !== undefined) {
      const lp = libPatchFor(p.angle, s.probe);
      np = Object.assign({}, s.probe, lp || {}, p);                       // explicit fields win over the library entry
      np.mode = presetMode(p.angle); savedAngle = null;                    // explicit angle (0° included): nothing to restore later
    }
    UT.set({ probe: s.specimen ? clampProbe(np, s.specimen) : np });
  }
  function setInstr(p) { UT.setIn('instrument', p); }
  function weld(opts, extra) {
    const o = Object.assign({}, UT.defaultState().weldOpts, opts || {});
    if (opts && opts.type && !opts.prep && PREPS.indexOf(opts.type) >= 0) o.prep = opts.type;   // legacy type → prep
    if (o.prep) o.type = typeOfPrep(o.prep);
    UT.set({ weldOpts: o }, { noRender: true });
    enter('weld', Object.assign({ keepProbe: false }, extra || {}));
  }
  const lessonSetups = [
    { n: 1, title: 'UTman Functions', ko: '메뉴·툴바 기능 전체 둘러보기', en: 'Tour of the menu bar and toolbar',
      setup() { weld({ T: 20 }); setProbe({ angle: 60, x: 40 }); setInstr({ gain: 30, range: 100 }); },
      steps: ['Hover every toolbar button (0°…AUT) and read the tooltip', 'Open each menu: File, Probes, Step Wedge, Weld, Defects, Options, Help', 'Drag the probe in the cross section', 'Turn the mouse wheel over the cross section: gain ±1 dB'] },
    { n: 2, title: 'Basic UT controls Range X shift Amplitude', ko: '레인지·X시프트·진폭·억제 기본 조작 (USK7)', en: 'Range, X-shift, amplitude and suppression on the USK7',
      setup() { weld({ pipe: true, od: 152.4, wt: 20, T: 20 }); UT.set({ utSet: 'usk7' }); setProbe({ angle: 0, x: 40 }); setInstr({ range: 88.5, gain: 30, delay: 0, reject: 0 }); },
      steps: ['RANGE ◀▶ until four backwall echoes fit on the screen', 'X-SHIFT to move the first echo to division 2', 'AMP until the first echo reads 80 %', 'SUPPRESSION 20 %: the grass disappears'] },
    { n: 3, title: 'Zero Probe', ko: '0° 탐촉자: 초기펄스/불감대, 단일 vs 이중진동자', en: '0° probe: initial pulse, dead zone, single vs twin crystal',
      setup() { setProbe({ angle: 0, crystal: 'single' }); enter('v1'); setInstr({ range: 100, gain: 30 }); },
      steps: ['Identify the initial pulse and the dead zone on the left of the screen', 'Probes ▸ Zero Probe ▸ Twin Crystal: the initial pulse disappears', 'Count the multiples 25 / 50 / 75 / 100 mm'] },
    { n: 4, title: 'Angle Probe using the V1 calibration block', ko: 'V1 블록으로 사각탐촉자 교정 (100 mm 반경, 1.5 mm 구멍, 퍼스펙스)', en: 'Angle probe on the V1 block: 100 mm radius, 1.5 mm hole, Perspex insert',
      setup() { setProbe({ angle: 45 }); enter('v1'); setProbe({ x: 100, side: 1 }); setInstr({ range: 200, gain: 30 }); },
      steps: ['Index at 100: echoes 100 / 200 / 300 (set Range 400)', 'Move to x = 150 (135 + 15·tan45) for the 1.5 mm hole', 'Perspex insert: 0° probe at x = 240'] },
    { n: 5, title: 'Lamination Check', ko: '라미네이션 검사: 0° 래스터 스캔, 저면에코 소실', en: 'Lamination check: 0° raster, lamination echo and lost backwall',
      setup() { enter('lamination'); setInstr({ range: 100, gain: 30 }); },
      steps: ['Raster along z with ↑/↓ (Shift ×10)', 'Note the lamination echo at 10 / 18 mm and the lost backwall', 'Size it with the 6 dB drop (SIZE window: Mark L / Mark R)'] },
    { n: 6, title: 'Angle Probe using the V2 calibration block', ko: 'V2 블록: 25/100/175 vs 50/125/200, 입사점·굴절각 확인', en: 'V2 block: 25/100/175 vs 50/125/200, index and angle check',
      setup() { setProbe({ angle: 45 }); enter('v2'); setProbe({ x: 60, side: 1 }); setInstr({ range: 100, gain: 30 }); },
      steps: ['Facing R25: 25 / 100 / 175 mm', 'Turn the probe (side −1): 50 / 125 / 200 mm', 'Index check at the maximum; angle check on the 5 mm hole (front face)'] },
    { n: 7, title: 'Making Sense of Amplitude', ko: '진폭과 dB: +6 dB = 2배, 퀵 게인 키', en: 'dB arithmetic: +6 dB doubles, quick gain keys, % readout',
      setup() {
        // 24 dB: the T/2 hole reads ≈ 40 % so that the 30 dB softkey doubles it (80 %) and 40 dB clips (see SPEC NOTES)
        enter('dac'); setProbe({ angle: 60 }); setInstr({ gain: 24, range: 100 });
        // §14.12: park the 60° probe at the T/2 hole maximum (hole x + depth·tan 60°)
        const spec = st().specimen, h = spec && spec.holes ? spec.holes.find(function (o) { return Math.abs(o.y - spec.T / 2) < 1e-6; }) : null;
        if (h) setProbe({ x: +(h.x + h.y * Math.tan(M.deg2rad(60))).toFixed(1) });
      },
      steps: ['Maximise the T/2 hole echo (≈ 40 % at 24 dB)', 'Press the 30.0dB softkey (+6 dB): the echo doubles to ≈ 80 %', 'Press the 40.0dB softkey (+10 dB more): clipped — read the unclipped % box (≈ 250 %)', 'Note 20·log10(ratio): ×2 = 6 dB, ×3.16 = 10 dB'] },
    { n: 8, title: 'TKY Variable configuration Welds', ko: 'T/K/Y 이음: 브레이스 각도 조절, 토우 융합불량', en: 'T/K/Y joints: adjustable brace angle, toe LOF',
      setup() { enter('tky', { specimenOpts: { braceAngle: 60 } }); setProbe({ angle: 60, x: 35 }); },
      steps: ['Change the brace angle with the ADJUST MODE slider', 'Load Def: find the toe LOF', 'Switch to 45° and compare'] },
    { n: 9, title: 'Plotting Beam Spread at 20%', ko: 'IOW 블록 빔 확산 플롯 (20 dB 강하)', en: 'Beam spread plotting on the IOW block (20 dB drop)',
      setup() { enter('iow'); setProbe({ angle: 60, x: 262 }); setInstr({ range: 100, gain: 34 }); },
      steps: ['Maximise the 13 mm SDH echo, set 80 %', 'Move forward until 10 %, press Mark 10% edge', 'Repeat backward; repeat for 19 / 25 / 43 mm', 'Hide/Show Mirror Image for the full skip'] },
    { n: 10, title: 'Drawing Defects II', ko: '단면에 결함 그리기, 길이/간격/전체 적용', en: 'Draw defects in the cross section; LENGTH / SEPARATION / APPLY TO ALL',
      setup() { weld({ T: 20 }); setProbe({ angle: 60 }); defectEditor.open(); },
      steps: ['Paint a root crack with the brush (26 px)', 'LENGTH 30, SEPARATION 20, APPLY TO ALL, OK', 'Scan along z with ↑/↓'] },
    { n: 11, title: 'How to use the EPOCH', ko: 'EPOCH 600 조작: 게인, 레인지, 게이트, 피크메모리, 프리즈', en: 'EPOCH 600: gain, range, gates, peak memory, freeze',
      setup() { weld({ T: 20 }); UT.set({ utSet: 'epoch600' }); setProbe({ angle: 60 }); setDefects([]); addPreset('rootCrack'); },
      steps: ['Gain softkey + ▲▼', 'RANGE key cycles 50/100/200/400', 'GATES → G1 start / width', 'PEAK MEM sweep, then Freeze'] },
    { n: 12, title: 'EPOCH AUTO Calibration', ko: 'EPOCH 자동 교정: 10/25 mm 2점 속도·영점', en: 'EPOCH auto-cal: two-point velocity and zero on the step wedge',
      setup() { UT.set({ utSet: 'epoch600' }); enter('step'); setInstr({ range: 50, gain: 30 }); },
      steps: ['Note the wrong readouts (vel 5.60, zero 0.4)', 'Auto Cal softkey → probe on the 10 mm step → ✓', 'Probe on the 25 mm step → ✓', 'Readouts now 10.0 / 25.0 mm'] },
    { n: 13, title: 'TOFD', ko: 'TOFD: 측면파·저면파·팁 회절, D-스캔', en: 'TOFD: lateral wave, backwall, tip diffraction, D-scan',
      setup() { weld({ T: 20 }); setDefects([{ n: 1, type: 'planar', pts: [{ x: 0, y: 8 }, { x: 0, y: 13 }], zFrom: 120, zTo: 150, label: 'Defect 1' }]); UT.setIn('tofd', { pcs: 60, txAngle: 60 }); setProbe({ angle: 60 }); enter('tofd', { keepProbe: true }); },
      steps: ['Read Lateral / BackWall in the status bar', 'Run Scan', 'Click the D-scan on the tip arc and read Depth'] },
    { n: 14, title: 'Shear wave and Compression wave', ko: '횡파/종파, 쐐기각 계산 (Snell), 임계각', en: 'Shear vs compression, wedge angle (Snell), critical angles',
      setup() { weld({ T: 20 }); setProbe({ angle: 60 }); },
      steps: ['Probes ▸ Adjust Angle in Wedge (Shoe)', 'Drag the wedge angle 20 → 80°', 'Watch the status line and the critical angles 27.7° / 57.7°'] },
    { n: 15, title: 'UTman software utsim', ko: '전체 레이아웃과 UT 세트 전환', en: 'Overall layout and the Options ▸ UT Set switch',
      setup() { weld({ T: 20, pipe: true }); setProbe({ angle: 60, x: 40 }); extWin('pipe3d', true); },
      steps: ['PIPE on: the 3D window appears', 'Options ▸ UT Set: EPOCH 600 / EPOCH 4 / USK7'] },
    { n: 16, title: 'Drawing Defects I', ko: '서클뷰 결함 편집 (파이프)', en: 'Circle-view defect editor on a pipe',
      setup() { weld({ T: 20, pipe: true, od: 152.4, wt: 20 }); defectEditor.open(); },
      steps: ['Drag on the ring: Defect 1 From 76 To 143', 'Delete Defect 1', 'Save Def / Load Def'] },
    { n: 17, title: 'Lamination Check.mpg', ko: '라미네이션 검사 (반복)', en: 'Lamination check (repeat of lesson 5)',
      setup() { lessonSetups[4].setup(); }, steps: ['Same as lesson 5'] },
    { n: 18, title: 'AUT', ko: '자동 스캔: 스트립 차트, 게이트 패널', en: 'Automated scan: strip charts and the gate panel',
      setup() { weld({ T: 20, pipe: true }); setProbe({ angle: 60, x: 40 }); UT.setIn('aut', { gates: st().aut.gates.map(function (g, i) { return Object.assign({}, g, i === 0 ? { start: 30, width: 11, level: 21 } : {}); }) }); enter('aut', { keepProbe: true }); },
      steps: ['Gates Same', 'Run Scan / Stop', 'Rev Map'] },
    { n: 19, title: 'Angle Probe using the V2 calibration block', ko: 'V2 블록 (반복)', en: 'V2 block (repeat of lesson 6)',
      setup() { lessonSetups[5].setup(); }, steps: ['Same as lesson 6'] },
    { n: 20, title: 'Angleprobe Calibration', ko: 'DAC 기록: T/4, T/2, 3T/4 구멍 → Record → Draw Curves', en: 'DAC recording on the reference block and the −6/−14 dB curves',
      // 30 dB: the three 70° SDH echoes read ≈ 81 / 78 / 62 % (recordable; 34 dB would put the near-field holes > 120 %)
      setup() { enter('dac'); setProbe({ angle: 70 }); setInstr({ gain: 30, range: 100 }); },
      steps: ['Maximise the T/4 hole → Record (≈ 80 % at 30 dB)', 'T/2 → Record', '3T/4 → Record', 'Draw Curves (−6 / −14 dB), then scan a defect and read DAC %'] },
    { n: 21, title: 'Trade Test with UTman software', ko: '실기 시험: 숨은 결함 찾기, 보고서, 채점', en: 'Exam mode: hidden defects, report, score',
      setup() { weld({ T: 25, pipe: true, od: 219.1, wt: 25 }); setProbe({ angle: 60 }); enter('trade', { keepProbe: true }); trade.start(); },
      steps: ['Scan with 45° / 60° / 70°', 'Fill the report rows, Submit', 'Reveal, read the score (60 min timer)'] },
    { n: 22, title: 'UTman600', ko: 'EPOCH 600 상세: 게이트 페이지, 2ND F + dB, Auto Cal', en: 'EPOCH 600 details: page 2 gates, 2ND F + dB, Auto Cal',
      setup() { lessonSetups[10].setup(); setInstr({ page: 2 }); },
      steps: ['Page 2: Gate 1 / Gate 2 softkeys', '2ND F + dB = reference gain', 'Auto Cal softkey'] },
  ];
  function loadLesson(i) {
    const l = lessonSetups[i];
    if (!l) return null;
    if (defectEditor.isOpen()) defectEditor.close();     // clean UI; lessons 10 / 16 reopen it in setup()
    if (autoCalWin) autoCal.cancel();
    try { l.setup(); } catch (e) { console.error('[UT.modes] lesson ' + l.n, e); }
    UT.set({ lesson: i });
    lessonsRefresh();
    return l;
  }
  function lessonsRefresh() {
    if (!lessonsWin || !ui.lSteps) return;
    const i = st().lesson;
    ui.lSteps.textContent = '';
    if (i === null || i === undefined || !lessonSetups[i]) { ui.lSteps.appendChild(UT.dom.h('div', { class: 'ls-dim', i18n: 'Select a lesson and press Load' })); return; }
    const l = lessonSetups[i];
    ui.lSteps.appendChild(UT.dom.h('div', { class: 'ls-title' }, l.n + '. ' + l.title));
    ui.lSteps.appendChild(UT.dom.h('div', { class: 'ls-ko' }, l.ko));
    ui.lSteps.appendChild(UT.dom.h('ol', {}, l.steps.map(function (s) { return UT.dom.h('li', {}, s); })));
    Array.from(ui.lList.children).forEach(function (row, k) { row.classList.toggle('active', k === i); });
  }
  const legacyLessonsWindow = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      const dom = UT.dom;
      if (!lessonsWin) {
        ui.lList = dom.h('div', { class: 'ls-list' }, lessonSetups.map(function (l, i) {
          return dom.h('div', { class: 'ls-row' }, [
            dom.h('div', { class: 'ls-n' }, String(l.n)),
            dom.h('div', { class: 'ls-txt' }, [dom.h('div', { class: 'ls-t' }, l.title), dom.h('div', { class: 'ls-d' }, l.ko + ' — ' + l.en)]),
            dom.button('Load', function () { loadLesson(i); }, { class: 'btn ls-load' }),
          ]);
        }));
        ui.lSteps = dom.h('div', { class: 'ls-steps' });
        lessonsWin = dom.win({ name: 'lessons', title: 'Lessons', x: 300, y: 80, w: 620, content: dom.h('div', { class: 'ls' }, [ui.lList, ui.lSteps]) });
      }
      lessonsWin.show();
      lessonsRefresh();
      return lessonsWin;
    },
    close() { if (lessonsWin) lessonsWin.hide(); },
    toggle() { return lessonsWin && lessonsWin.isOpen() ? legacyLessonsWindow.close() : legacyLessonsWindow.open(); },
    isOpen() { return !!(lessonsWin && lessonsWin.isOpen()); },
    load: loadLesson,
    get window() { return lessonsWin; },
  };
  /** Owner window of the v2 lessons (82) when loaded. */
  function lessonsOwnerWin() { const w = has('lessons.window'); return w && typeof w === 'object' ? w : null; }
  /**
   * Late-bound Lessons window (SPEC-v2 §1): UT.lessons.window.show() when 82 is loaded (the v1 dom.win 'lessons'
   * is then never created); the legacy v1 list window otherwise. load(i) → UT.lessons.start(i + 1) | v1 loadLesson.
   */
  const lessonsWindow = {
    open() { const w = lessonsOwnerWin(); if (w) return (w.show || w.open).call(w); return legacyLessonsWindow.open(); },
    close() { const w = lessonsOwnerWin(); if (w) return (w.hide || w.close).call(w); return legacyLessonsWindow.close(); },
    toggle() { const w = lessonsOwnerWin(); if (w) return w.toggle ? w.toggle() : (w.isOpen && w.isOpen() ? lessonsWindow.close() : lessonsWindow.open()); return legacyLessonsWindow.toggle(); },
    isOpen() { const w = lessonsOwnerWin(); if (w) return !!(w.isOpen && w.isOpen()); return legacyLessonsWindow.isOpen(); },
    /** Load lesson i (0-based): v2 UT.lessons.start(n) when present, else the v1 setup. Returns the lesson record. */
    load(i) { if (has('lessons.start')) { UT.lessons.start(i + 1); return modes.lessons[i] || null; } return loadLesson(i); },
    get window() { const w = lessonsOwnerWin(); return w ? (w.win || w) : lessonsWin; },
    legacy: legacyLessonsWindow,
  };

  // ------------------------------------------------------------------ test API (§15.10)
  // Numeric limits for specimen options (same as the Weld dialog / 90-app WELD_RANGES — keep in sync);
  // non-finite values are dropped, numbers clamped, so an oversized specimen can never reach the state.
  const OPT_RANGES = {
    T: [3, 100], L: [50, 2000], bevel: [0, 60], rootGap: [0, 10], rootFace: [0, 10], capWidth: [0, 60], capHeight: [0, 10],
    rootHeight: [0, 10], od: [25, 2000], wt: [3, 100],
    braceAngle: [20, 90], braceT: [3, 100], chordT: [3, 100], braceOffset: [-100, 100], braceLen: [20, 300], weldLeg: [2, 30],
    // v2 weld preparations (§5.1) / transfer loss (§3.4) / step wedge
    webT: [3, 60], branchOd: [20, 2000], branchWt: [2, 60], transferLossDb: [0, 8], stepLen: [10, 100],
  };
  const OPT_ENUMS = {
    type: ['single-v', 'double-v', 'none', 'fillet'], face: ['wide', 'narrow'],
    prep: PREPS, weldMaterial: ['same', 'austenitic'],
    material: Object.keys(S.materials || { carbon: 1 }),
  };
  /** Sanitised copy of a specimen-options object (unknown keys pass through only when finite/boolean/short string). */
  function clampOpts(opts) {
    const out = {};
    if (!opts || typeof opts !== 'object') return out;
    Object.keys(opts).forEach(function (k) {
      const v = opts[k];
      if (OPT_RANGES[k]) { const n = typeof v === 'string' && v.trim() !== '' ? +v : v; if (Number.isFinite(n)) out[k] = M.clamp(n, OPT_RANGES[k][0], OPT_RANGES[k][1]); }
      else if (OPT_ENUMS[k]) { if (OPT_ENUMS[k].indexOf(v) >= 0) out[k] = v; }
      else if (typeof v === 'boolean') out[k] = v;
      else if (typeof v === 'number') { if (Number.isFinite(v)) out[k] = M.clamp(v, -1e4, 1e4); }
      else if (typeof v === 'string' && v.length <= 40) out[k] = v;
    });
    // cross-field pipe rule (same as 90-app WELD_RANGES): the wall cannot exceed the pipe radius
    if (out.pipe && Number.isFinite(out.od) && Number.isFinite(out.wt)) out.wt = Math.min(out.wt, Math.max(OPT_RANGES.wt[0], out.od / 2 - 1));
    return out;
  }
  /**
   * Weld-option patch normalisation (v2 §2 / §5.1): `prep` is mirrored into the legacy `type`, a legacy `type`
   * without `prep` becomes the prep, and `backing` follows the prep ('single-v-backing' ⇔ true).
   */
  function normaliseWeldPatch(o) {
    const out = Object.assign({}, o);
    if (out.prep === undefined && out.type !== undefined && PREPS.indexOf(out.type) >= 0) out.prep = out.type;
    if (out.backing === true && (out.prep === undefined || out.prep === 'single-v')) out.prep = 'single-v-backing';
    if (out.prep !== undefined) { out.type = typeOfPrep(out.prep); out.backing = out.prep === 'single-v-backing'; }
    return out;
  }
  function loadSpecimen(id, opts) {
    const mode = MODE_OF[id];
    if (!mode) throw new Error('Unknown specimen id: ' + id);
    const o = clampOpts(opts);
    if (o.material) { UT.set({ material: o.material }, { silent: true, noRender: true }); delete o.material; }   // v2: state.material is authoritative
    if (id === 'plate-weld' || id === 'pipe-weld') {
      if (id === 'pipe-weld') {
        // wall/radius rule against the MERGED options (existing od when opts carries only wt, and vice versa)
        const merged = normaliseWeldPatch(Object.assign({}, st().weldOpts, o, { pipe: true }));
        if (Number.isFinite(merged.od) && Number.isFinite(merged.wt)) { merged.wt = Math.min(merged.wt, Math.max(OPT_RANGES.wt[0], merged.od / 2 - 1)); merged.T = merged.wt; }
        UT.setIn('weldOpts', merged, { silent: true, noRender: true });
      } else UT.setIn('weldOpts', normaliseWeldPatch(Object.assign(o, { pipe: false })), { silent: true, noRender: true });
      enter('weld', { silentUI: true });
    } else enter(mode, { specimenOpts: opts ? o : undefined, silentUI: true });
    return st().specimen;
  }
  /**
   * v2 §7: select the specimen material (key of UT.specimens.materials) and rebuild the current mode's specimen
   * keeping the probe. Returns the specimen's material record, or false for an unknown key.
   * @param {string} key
   */
  function setMaterial(key) {
    const k = materialKey(key);
    if (!k) { UT.status({ right: t('Unknown material {key}', { key: String(key) }) }); return false; }
    UT.set({ material: k }, { noRender: true });
    enter(current(), { keepProbe: true, silentUI: true, keepDefects: true });
    return st().specimen && st().specimen.material ? Object.assign({}, st().specimen.material) : { key: k };
  }
  /**
   * Merge a weld-option patch (Weld dialog / prep dropdown / PIPE toggle) into state.weldOpts with the v2 mirrors and
   * rebuild the weld when a weld-kind mode is active (keepProbe). Returns the new weldOpts.
   * @param {object} patch  partial weldOpts (prep, type, backing, T, pipe, od, wt, webT, branchOd, weldMaterial, transferLossDb, …)
   */
  function setWeldOpts(patch) {
    const o = normaliseWeldPatch(clampOpts(patch));
    const merged = Object.assign({}, st().weldOpts, o);
    if (merged.pipe && Number.isFinite(merged.od) && Number.isFinite(merged.wt)) { merged.wt = Math.min(merged.wt, Math.max(OPT_RANGES.wt[0], merged.od / 2 - 1)); merged.T = merged.wt; }
    UT.set({ weldOpts: merged }, { noRender: true });
    if (WELD_KIND[current()]) enter(current(), { keepProbe: true, silentUI: true, keepDefects: true });
    else UT.requestRender();
    return st().weldOpts;
  }
  /**
   * Select a weld preparation (SPEC-v2 §5.1 enum) — mirrors `type`/`backing` and rebuilds the weld (keepProbe).
   * @param {string} prep  'single-v'|'double-v'|'single-bevel'|'j'|'single-v-backing'|'fillet-t'|'nozzle'|'none'
   * @returns {boolean}
   */
  function setPrep(prep) {
    if (PREPS.indexOf(prep) < 0) return false;
    setWeldOpts({ prep });
    return true;
  }
  Object.assign(UT.test, {
    loadSpecimen,
    setDefects,
    addPreset,
    enterMode: enter,
    lessons() { return modes.lessons.map(function (l) { return l.title; }); },
    // SPEC-v2 §7: test helpers are state helpers + renderNow, so UT.frame is current when the call returns
    setMaterial(key) { const r = setMaterial(key); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    // §1 (3): late-binding shell — 84-trade extends it with Object.assign(UT.test.trade, {...})
    trade: {
      start(seed) { return (UT.trade || trade).start(seed); },
      truth() { return (UT.trade || trade).truth(); },
      submit(rows) { return (UT.trade || trade).submit(rows); },
      practice: { start(seed) { return practice.start(seed); } },
    },
  });

  // ------------------------------------------------------------------ CSS
  const css = [
    '.win[data-win=defects] .win-body{padding:4px;background:#ececec}',
    '.dfe-row{display:flex;gap:6px;align-items:flex-start}',
    '.dfe-left{display:flex;flex-direction:column;gap:4px;width:110px}',
    '.dfe-btn{width:100%;font-size:11px;padding:4px 2px;white-space:normal;line-height:1.15}',
    '.dfe-brushrow{display:flex;align-items:center;gap:8px;padding:4px 0}',
    '.dfe-brush{width:50px;font-size:11px}',
    '.dfe-dot{display:inline-block;border-radius:50%;background:#e00000}',
    '.dfe-preset{width:100%;font-size:11px}',
    '.dfe-mid{display:flex;flex-direction:column;align-items:center;background:#fff;border:1px solid #999}',
    '.dfe-canvas{width:560px;height:400px;display:block;cursor:crosshair}',
    '.dfe-status{color:#e00000;font-size:12px;font-weight:bold;padding:3px;min-height:16px;align-self:flex-start;background:#ececec;width:100%;box-sizing:border-box}',
    '.dfe-right{background:#000;color:#ff0;width:130px;padding:4px;display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:bold;align-self:stretch}',
    '.dfe-right .fld{display:flex;flex-direction:column;align-items:center;gap:2px;margin:2px 0;color:#ff0;flex:0 0 auto}',
    '.dfe-right .fld-label{flex:0 0 auto;text-align:center;color:#ff0}',
    '.dfe-right .fld-input{flex:0 0 auto;min-width:0}',
    '.dfe-left .btn,.dfe-right .btn{flex:0 0 auto}',
    '.dfe-mid{flex:0 0 auto}',
    '.dfe-right .fld-input{width:56px;font-size:11px;text-align:left;box-sizing:border-box}',
    '.dfe-right input,.dfe-right select{color:#111;background:#fff}',
    '.dfe-right .fld input[type=checkbox]{width:auto}',
    '.dfe-right select.fld-input{width:100px}',
    '.dfe-select{border:1px solid #ff0;margin:0;padding:2px 6px;display:flex;flex-direction:column;gap:1px}',
    '.dfe-select legend{color:#ff0;font-size:11px}',
    '.dfe-radio{display:flex;align-items:center;gap:6px;color:#ff0;font-weight:normal}',
    '.dfe-ok{font-size:16px;font-weight:bold;padding:6px 0;margin-top:4px}',
    '.dfe-json{width:100%;box-sizing:border-box;font-size:10px;font-family:monospace;margin-top:4px}',
    '.win[data-win=dac] .win-body,.win[data-win=tky] .win-body,.win[data-win=trade] .win-body,.win[data-win=lessons] .win-body,.win[data-win=autocal] .win-body{padding:6px;background:#ececec;font-size:12px}',
    '.dac-hint{color:#a00;font-weight:bold;margin-bottom:4px}',
    '.dac-list{max-height:120px;overflow:auto;background:#fff;border:1px solid #999;padding:3px;font-family:monospace;font-size:11px;margin-top:4px}',
    '.dac-pt.dim{color:#888}',
    '.dac-ref{font-size:11px;color:#333;margin-top:4px}',
    '.ac-msg{font-size:13px;font-weight:bold;color:#0a246a;margin-bottom:6px;min-height:34px}',
    '.tky{display:flex;flex-direction:column;gap:6px}',
    '.tky-label{font-weight:bold;text-align:center}',
    '.tky-slider{width:100%}',
    '.tky-row{display:flex;gap:4px}',
    '.tky-kind,.tky-btn{flex:1;font-size:11px;background:#d8d8d8}',
    '.tky-kind.active{background:#00e000;color:#000;font-weight:bold}',
    '.tky-kind[disabled]{opacity:.5;cursor:not-allowed}',
    '.tky-btn.active{background:#00e000}',
    '.tt{display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow:auto}',
    '.tt-head{display:flex;gap:6px;align-items:center}',
    '.tt-seedin{width:70px}',
    '.tt-clock{font-family:monospace;font-weight:bold;color:#a00;margin-left:auto}',
    '.tt-seed{color:#555;font-size:11px}',
    '.tt-intro{font-size:11px;color:#333}',
    '.tt-table{border-collapse:collapse;width:100%;background:#fff}',
    '.tt-table th,.tt-table td{border:1px solid #999;padding:2px 4px;font-size:11px;text-align:center}',
    '.tt-n{width:34px}.tt-in{width:64px}.tt-sel{width:90px}.tt-del{padding:0 6px;font-size:10px}',
    '.tt-score{font-size:15px;font-weight:bold;color:#0a246a}',
    '.tt-sub{font-weight:bold;margin-top:4px}',
    '.tt-truth{border-collapse:collapse;background:#fff}.tt-truth th,.tt-truth td{border:1px solid #999;padding:1px 6px;font-size:11px}',
    '.tt-miss{color:#a00;font-size:11px;margin-top:3px}',
    '.ls{display:flex;gap:6px;max-height:70vh}',
    '.ls-list{width:340px;overflow:auto;background:#fff;border:1px solid #999}',
    '.ls-row{display:flex;gap:6px;align-items:center;padding:3px 4px;border-bottom:1px solid #ddd}',
    '.ls-row.active{background:#dbe7ff}',
    '.ls-n{width:20px;text-align:right;font-weight:bold;color:#0a246a}',
    '.ls-txt{flex:1;min-width:0}.ls-t{font-weight:bold;font-size:12px}.ls-d{font-size:11px;color:#444}',
    '.ls-load{font-size:11px}',
    '.ls-steps{flex:1;overflow:auto;background:#fdfbd8;border:1px solid #999;padding:6px;font-size:12px}',
    '.ls-title{font-weight:bold;font-size:13px}.ls-ko{color:#444;margin:2px 0 4px}.ls-dim{color:#777}',
    '.ls-steps ol{margin:0;padding-left:18px}.ls-steps li{margin:2px 0}',
  ].join('\n');

  // ------------------------------------------------------------------ enable helpers
  /**
   * Angles (deg) allowed by the active procedure while a trade test runs (SPEC-v2 §4.3 T4), or null = unrestricted.
   * Derived from UT.standards.allowedProbes(state) → library ids → UT.probe.libEntry(id).angle.
   */
  function allowedAngles(state) {
    const s = state || st();
    if (!s.trade || !s.trade.active) return null;
    const fn = has('standards.allowedProbes');
    if (typeof fn !== 'function') return null;
    let ids = null;
    try { ids = fn(s); } catch (e) { ids = null; }
    if (!Array.isArray(ids)) return null;
    const out = [];
    ids.forEach(function (id) {
      const lib = has('probe.libEntry') ? UT.probe.libEntry(id) : null;
      if (lib && Number.isFinite(lib.angle) && out.indexOf(lib.angle) < 0) out.push(lib.angle);
    });
    return out;
  }
  function isToolbarEnabled(id) {
    const key = id.indexOf('tb-') === 0 ? id : 'tb-' + id;
    const s = st();
    if (defectEditor.isOpen() && enabled.editor.disabledToolbar.indexOf(key) >= 0) return false;
    // v2 exam lock (§4.2.3): the editor, HIDE and BEAM stay locked while a shared exam's truth is hidden
    if (examLocked(s) && (key === 'tb-defect' || key === 'tb-hide' || key === 'tb-beam')) return false;
    // v2 procedure lock (T4): angle buttons outside the procedure's probe list are disabled while the test runs
    if (ANGLE_TB[key] !== undefined) {
      const ang = allowedAngles(s);
      if (ang && ang.indexOf(ANGLE_TB[key]) < 0) return false;
    }
    if (s.mode === 'trade' && key === 'tb-hide' && s.trade.revealed) return true;   // §14.7: locked only until Submit / Reveal
    const e = enabled[s.mode] || enabled.weld;
    return e.disabledToolbar.indexOf(key) < 0;
  }
  function isMenuEnabled(id) {
    const key = id.indexOf('menu-') === 0 ? id : 'menu-' + id;
    if (defectEditor.isOpen() && enabled.editor.disabledMenus.indexOf(key) >= 0) return false;
    if (examLocked() && key === 'menu-defects') return false;
    const e = enabled[st().mode] || enabled.weld;
    return e.disabledMenus.indexOf(key) < 0;
  }
  function hiddenViews() { const e = enabled[st().mode] || enabled.weld; return e.hidden.slice(); }

  // ------------------------------------------------------------------ self test (headless)
  function __selftest() {
    const f = [];
    // Snapshot the live store (top-level references: UT.set only ever REPLACES top-level objects) and the
    // module variables, so the checks below leave the app, the toolbar and the persisted record untouched.
    const saved = Object.assign({}, UT.state);
    const savedVars = { stash, lastAngle, savedAngle, savedGates, savedProbeMode, autoCalState };
    quietUI = true;
    try {
      // pure helpers first
      const nz = normaliseZ([{ n: 1, type: 'crack', pts: [{ x: 0, y: 17 }, { x: 0, y: 20 }], zFrom: 200, zTo: 100 }], { L: 300 });
      if (nz[0].zFrom !== 100 || nz[0].zTo !== 200) f.push('normaliseZ swap ' + JSON.stringify(nz[0]));
      if (S.defectLength(nz[0], { L: 300 }) < 0) f.push('defectLength negative after normaliseZ');
      const nzp = normaliseZ([{ n: 1, type: 'crack', pts: [], zFrom: 500, zTo: -500 }], { L: 400, pipe: { od: 168.3 } });
      if (nzp[0].zFrom !== 100 || nzp[0].zTo !== 300) f.push('normaliseZ pipe wrap ' + JSON.stringify(nzp[0]));
      const before = st().mode;
      UT.setIn('probe', { angle: 60, mode: 'shear' }, { noRender: true });
      enter('v1', { silentUI: true });
      if (st().mode !== 'v1' || !st().specimen || st().specimen.id !== 'v1') f.push('enter v1');
      if (st().specimen.face !== 'wide') f.push('v1 face wide expected for angle probe');
      UT.setIn('probe', { angle: 0, mode: 'comp' });
      if (st().specimen.face !== 'narrow') f.push('v1 face should rebuild to narrow on 0°');
      if (st().instrument.trig.thick !== 25) f.push('autoTrig thick ' + st().instrument.trig.thick);
      enter('step', { silentUI: true });
      if (st().instrument.cal.vel !== 5.6) f.push('step wrong cal');
      if (st().probe.angle !== 0) f.push('step forces 0°');
      enter('weld', { silentUI: true });
      if (st().instrument.cal.vel !== null) f.push('cal restore');
      // savedAngle: 60° forced to 0° by step is restored on exit, but an angle chosen inside step survives
      UT.setIn('probe', { angle: 60, mode: 'shear' }, { noRender: true });
      enter('step', { silentUI: true });
      enter('weld', { silentUI: true });
      if (st().probe.angle !== 60) f.push('forced angle restored on exit: ' + st().probe.angle);
      enter('lamination', { silentUI: true });
      UT.setIn('probe', { angle: 70, mode: 'shear' }, { noRender: true });
      enter('weld', { silentUI: true });
      if (st().probe.angle !== 70) f.push('angle chosen inside lamination must survive exit: ' + st().probe.angle);
      enter('lamination', { silentUI: true });
      setProbe({ angle: 0 });
      enter('v1', { silentUI: true });
      if (st().probe.angle !== 0 || st().specimen.face !== 'narrow') f.push('explicit 0° before v1 must give the narrow face: ' + st().probe.angle + '/' + st().specimen.face);
      enter('weld', { silentUI: true });
      const g1 = generateTruth(42, st().specimen), g2 = generateTruth(42, st().specimen);
      if (JSON.stringify(g1.truth) !== JSON.stringify(g2.truth)) f.push('trade seed not deterministic');
      if (g1.truth.length < 3 || g1.truth.length > 6) f.push('trade count ' + g1.truth.length);
      trade.start(42);
      const rows = trade.truth().map(function (t) { return { n: t.n, z: t.zFrom, length: t.zTo - t.zFrom, depth: t.depth, type: t.type }; });
      if (trade.submit(rows) !== 100) f.push('trade score ' + st().trade.score);
      if (trade.submit([]) !== 0) f.push('empty report should score 0');
      enter('weld', { silentUI: true });
      if (st().trade.active) f.push('trade inactive after exit');
      if (lessonSetups.length !== 22) f.push('lessons ' + lessonSetups.length);
      lessonSetups.forEach(function (l) { if (!l.title || !l.ko || !l.en || typeof l.setup !== 'function' || !l.steps.length) f.push('lesson ' + l.n + ' incomplete'); });
      if (!Array.isArray(modes.lessons) || modes.lessons.length < 22 || (UT.lessons && UT.lessons.list && modes.lessons !== UT.lessons.list)) f.push('lessons getter');
      if (!enabled.v1.disabledToolbar.length || enabled.v1.toolbar.indexOf('tb-v1') < 0) f.push('enabled matrix');
      const z = circleZFromPoint(165, 15, { cx: 165, cy: 165, R: 150, r: 120, C: 480 });
      if (z === null || Math.abs(z) > 0.01) f.push('circle z at 12 o\'clock ' + z);
      const zl = circleZFromPoint(15, 165, { cx: 165, cy: 165, R: 150, r: 120, C: 480 });
      if (zl === null || Math.abs(zl - 120) > 0.5) f.push('circle z at 9 o\'clock (anticlockwise 90°) ' + zl);
      void before;
      // ---- v2 invariants (SPEC-v2 §1, §2, §7, §8)
      if (ALL_MENUS.indexOf('tools') !== 5 || enabled.weld.menus.indexOf('menu-tools') < 0 || enabled.editor.menus.indexOf('menu-tools') >= 0) f.push('tools menu in the enable matrix');
      if (!enabled.fbh || enabled.fbh.disabledToolbar.join() !== 'tb-v2,tb-v1,tb-dac,tb-plot,tb-tky,tb-tofd,tb-aut,tb-pipe' || enabled.fbh.disabledMenus.join() !== 'menu-weld,menu-defects' || enabled.fbh.hidden.join() !== 'compass') f.push('DISABLED.fbh');
      if (MODE_OF.fbh !== 'fbh') f.push('MODE_OF.fbh');
      if (typeof UT.test.setMaterial !== 'function' || !UT.test.trade || typeof UT.test.trade.start !== 'function' || typeof UT.test.trade.practice.start !== 'function') f.push('test api v2');
      UT.setIn('probe', { angle: 60, mode: 'shear' }, { noRender: true });
      enter('fbh', { silentUI: true });
      if (st().mode !== 'fbh' || !st().specimen || st().specimen.id !== 'fbh' || !st().specimen.fbhs || st().specimen.fbhs.length !== 5) f.push('enter fbh');
      if (st().probe.angle !== 0 || st().probe.mode !== 'comp') f.push('fbh forces 0°');
      if (!st().specimen.material || st().specimen.material.key !== (st().material || 'carbon')) f.push('fbh material');
      if (!isToolbarEnabled('tb-0') || isToolbarEnabled('tb-dac') || isMenuEnabled('menu-weld') || !isMenuEnabled('menu-tools') || hiddenViews().indexOf('compass') < 0) f.push('fbh enable matrix');
      enter('weld', { silentUI: true });
      if (st().probe.angle !== 60) f.push('angle restored after fbh: ' + st().probe.angle);
      // materials: every builder takes state.material; setMaterial re-enters keeping the probe and the defects
      const px = st().probe.x;
      addPreset('rootCrack');
      const nDef = st().defects.length;
      const mat = setMaterial('austenitic');
      if (!mat || mat.key !== 'austenitic' || st().material !== 'austenitic' || st().specimen.material.key !== 'austenitic' || Math.abs(st().specimen.material.vComp - 5.66) > 1e-9) f.push('setMaterial austenitic');
      if (st().probe.x !== px || st().defects.length !== nDef) f.push('setMaterial must keep probe/defects');
      if (setMaterial('unobtainium') !== false || st().material !== 'austenitic') f.push('setMaterial unknown key');
      enter('dac', { silentUI: true });
      if (!st().specimen.material || st().specimen.material.key !== 'austenitic') f.push('block builder material');
      enter('weld', { silentUI: true });
      setMaterial('carbon');
      if (st().specimen.material.key !== 'carbon') f.push('setMaterial carbon');
      // weld preparations through setPrep / setWeldOpts / loadSpecimen (type mirror, backing flag)
      const expectType = { 'single-v': 'single-v', 'double-v': 'double-v', 'single-bevel': 'single-v', j: 'single-v', 'single-v-backing': 'single-v', 'fillet-t': 'fillet', nozzle: 'fillet', none: 'none' };
      PREPS.forEach(function (prep) {
        if (!setPrep(prep)) { f.push('setPrep ' + prep); return; }
        const s = st();
        if (s.mode !== 'weld' || !s.specimen || s.specimen.prep !== prep || s.weldOpts.prep !== prep) f.push('prep ' + prep + ' → specimen ' + (s.specimen && s.specimen.prep));
        if (s.weldOpts.type !== expectType[prep] || s.weldOpts.backing !== (prep === 'single-v-backing')) f.push('prep ' + prep + ' type/backing mirror ' + s.weldOpts.type + '/' + s.weldOpts.backing);
        if (prep !== 'none' && (!s.specimen.weld || !s.specimen.weld.fusionFaces || !s.specimen.weld.fusionFaces.length)) f.push('prep ' + prep + ' fusion faces');
      });
      if (setPrep('bogus') !== false) f.push('setPrep bogus');
      setPrep('single-v-backing'); setPrep('single-v');
      if (st().weldOpts.backing !== false || st().specimen.prep !== 'single-v') f.push('backing flag cleared when returning to single-v');
      loadSpecimen('plate-weld', { T: 20, prep: 'j', material: 'aluminium' });
      if (st().specimen.prep !== 'j' || st().weldOpts.type !== 'single-v' || st().material !== 'aluminium' || st().specimen.material.key !== 'aluminium') f.push('loadSpecimen prep/material');
      loadSpecimen('pipe-weld', { od: 168.3, wt: 20, prep: 'single-bevel' });
      if (!st().specimen.pipe || st().specimen.prep !== 'single-bevel') f.push('loadSpecimen pipe prep');
      loadSpecimen('fbh', { T: 60 });
      if (st().mode !== 'fbh' || st().specimen.id !== 'fbh' || st().specimen.T !== 60) f.push('loadSpecimen fbh');
      loadSpecimen('plate-weld', { T: 20, prep: 'single-v', material: 'carbon' });
      if (st().specimen.prep !== 'single-v' || st().material !== 'carbon') f.push('loadSpecimen back to single-v');
      const nw = normaliseWeldPatch({ type: 'double-v' });
      if (nw.prep !== 'double-v' || nw.type !== 'double-v' || nw.backing !== false) f.push('normaliseWeldPatch legacy type');
      if (normaliseWeldPatch({ backing: true }).prep !== 'single-v-backing') f.push('normaliseWeldPatch backing');
      // specimen-vs-state check (deferred rebuild path)
      if (!specimenMatchesState()) f.push('specimenMatchesState after enter');
      UT.set({ material: 'copper' }, { silent: true, noRender: true });
      if (specimenMatchesState()) f.push('specimenMatchesState must detect a material change');
      UT.set({ material: 'carbon' }, { silent: true, noRender: true });
      // autocal.stage mirror
      enter('step', { silentUI: true });
      autoCal.start();
      if (st().autocal.stage !== 1 || autoCalState.step !== 1) f.push('autocal.stage 1');
      autoCal.cancel();
      if (st().autocal.stage !== 0 || autoCalState !== null) f.push('autocal.stage 0 after cancel');
      enter('weld', { silentUI: true });
      // procedure lock (only checkable with 45-standards) and exam lock
      UT.set({ trade: Object.assign({}, st().trade, { active: true, exam: null, revealed: false }), standards: Object.assign({}, st().standards, { procedure: 'aws-d11-70' }) }, { silent: true, noRender: true });
      if (has('standards.allowedProbes') && Array.isArray(UT.standards.allowedProbes(st()))) {
        if (!isToolbarEnabled('tb-70') || isToolbarEnabled('tb-45') || isToolbarEnabled('tb-60') || isToolbarEnabled('tb-0')) f.push('procedure lock (aws-d11-70 → 70° only)');
        UT.set({ standards: Object.assign({}, st().standards, { procedure: 'iso-B-plate20' }) }, { silent: true, noRender: true });
        if (!isToolbarEnabled('tb-45') || !isToolbarEnabled('tb-0')) f.push('procedure lock (iso-B-plate20 allows 45/60/70/0)');
      }
      UT.set({ standards: Object.assign({}, st().standards, { procedure: null }) }, { silent: true, noRender: true });
      if (!isToolbarEnabled('tb-45')) f.push('no procedure → angle buttons enabled');
      UT.setIn('trade', { exam: { v: 2, seed: 1, locked: true }, revealed: false }, { silent: true, noRender: true });
      if (!examLocked() || isToolbarEnabled('tb-hide') || isToolbarEnabled('tb-beam') || isToolbarEnabled('tb-defect') || isMenuEnabled('menu-defects')) f.push('exam lock');
      if (trade.truth().length !== 0) f.push('legacy truth must be [] while exam-locked');
      UT.setIn('trade', { exam: null, active: false }, { silent: true, noRender: true });
      if (!isToolbarEnabled('tb-beam')) f.push('beam enabled without exam lock');
      // library-aware lesson setProbe
      setProbe({ angle: 45 });
      if (st().probe.angle !== 45 || st().probe.mode !== 'shear' || (has('probe.libForAngle') && st().probe.libId !== 'gen-45-5-10')) f.push('setProbe libId ' + st().probe.libId);
      setProbe({ angle: 0 });
      if (st().probe.mode !== 'comp' || (has('probe.libForAngle') && st().probe.libId !== 'gen-0-5-10')) f.push('setProbe 0° libId ' + st().probe.libId);
      if (typeOfPrep('nozzle') !== 'fillet' || typeOfPrep('none') !== 'none' || typeOfPrep('j') !== 'single-v') f.push('typeOfPrep');
    } catch (e) { f.push('exception ' + (e && e.message) + (e && e.stack ? ' @ ' + String(e.stack).split('\n')[1] : '')); }
    finally {
      quietUI = false;
      stopTradeTimer();
      if (rebuildTimer !== null && typeof clearTimeout === 'function') { clearTimeout(rebuildTimer); rebuildTimer = null; }
      stash = savedVars.stash; lastAngle = savedVars.lastAngle; savedAngle = savedVars.savedAngle;
      savedGates = savedVars.savedGates; savedProbeMode = savedVars.savedProbeMode; autoCalState = savedVars.autoCalState;
      // put back exactly the top-level objects that changed (one 'state' event so the toolbar / layout resync)
      const modeBefore = st().mode;
      const patch = {};
      Object.keys(saved).forEach(function (k) { if (k !== 'status' && k !== 'cursor' && UT.state[k] !== saved[k]) patch[k] = saved[k]; });
      Object.keys(UT.state).forEach(function (k) { if (!(k in saved)) delete UT.state[k]; });
      if (Object.keys(patch).length) UT.set(patch);
      if (modeBefore !== saved.mode) UT.bus.emit('mode', { mode: saved.mode, prev: modeBefore });
      UT.status(Object.assign({}, saved.status || {}, { right: saved.status && saved.status.right ? saved.status.right : UT.i18n.t(HINTS[saved.mode] || '') }));
    }
    return f;
  }

  Object.assign(modes, {
    enter, exit, toggle, current, setFace, statusMid, rebuild,
    enabled, isToolbarEnabled, isMenuEnabled, hiddenViews, allowedAngles, examLocked, hints: HINTS,
    lessonSetups, lessonsWindow, defectEditor, tradeTest, tkyPanel, dacPanel,
    autoCal, dac, plot, sizing, trade, practice, setDefects, clampOpts,
    setMaterial, setPrep, setWeldOpts, normaliseWeldPatch, typeOfPrep, preps: PREPS.slice(), modeList: MODES.slice(),
    rng: M.rng, css, __selftest,
  });
  // §1 (1): late-bound lessons — 82's v2 list when loaded, else the v1 setups (same {n, title, ko, en, setup, steps} shape)
  Object.defineProperty(modes, 'lessons', { get: function () { return (UT.lessons && UT.lessons.list) || lessonSetups; }, enumerable: true, configurable: true });
  UT.modes = modes;
})(window.UT = window.UT || {});
