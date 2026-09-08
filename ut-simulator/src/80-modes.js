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
//   UT.test.trade = {start, truth, submit, practice} is created here with late-binding methods; 84 extends it
//   with Object.assign. modes.trade / modes.practice / modes.tradeTest / modes.lessonsWindow are thin delegates to
//   UT.trade / UT.trade.practice / UT.trade.window / UT.lessons.window: the v1 engine and windows were removed
//   (E5, dead in the single file) and a delegate throws '[UT.modes] 8x … is not loaded' when its owner is absent.
//   Leaving mode 'trade' also discards a shared exam (trade.exam = null): the §4.2.3 lock never outlives the exam.
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
// ---- v3 (SPEC-v3 §3.2–§3.4, §3.9, §3.11, §3.12, §5, §6.3, §6.5) ----
// - F2 autoCal.start() inspects the CURRENT specimen before forcing anything: a gated/echo backwall family
//   (kind 'backwall'|'geometry' tagged 'bottom', or any echo within 5 % of a multiple of the local thickness)
//   keeps the specimen with d1 = T, d2 = 2·T ('specimen'); v1/v2 keep the specimen with the face's own pair and the
//   word 'backwall echo'; anything else falls back to enter('step') with 10/25 ('step').
//   DECISION (spec silent): when the mode ALREADY IS 'step' the source stays 'step' and d1/d2 stay the taught
//   10/25 — rule 1 would otherwise read the 5 mm step under the parked probe and change what lesson 12/22 teach.
// - F3 the wizard's confirm path is autoCal.setField(mm) → autoCal.confirm(); the legacy autoCal.step() (used by
//   lessons 12/22 and the ✓ button) still captures with the CURRENT d1/d2 and never needs an entered value.
//   Stage 2 pre-loads the field with 2·d1 (the video arrows down to it from 42.00). 70-instruments draws the
//   on-LCD box from state.autocal and calls setField/confirm/cancel; the floating 'autocal' window (usk7 skin and
//   headless) shows the same two captions and the same field.
//   QA round 2: the floating window opens ONLY when no on-LCD wizard is visible — lcdWizard() is true while
//   70-instruments is loaded, #cv-ascan exists and utSet starts with 'epoch' (every EPOCH skin draws the box).
//   Otherwise the trainee saw the same three lines twice, the second copy parked over the plan view. A skin
//   change mid-cal re-syncs through the 'state' listener (acSync), so the window is never left orphaned.
// - F4 post-cal range: implements SPEC-v3 §3.4 verbatim — deepest = d2 for a one-position two-multiple cal
//   (source ≠ 'step', |d2 − 2·d1| ≤ 0.05·d1), else 2·d2; range = the smallest preset of
//   {10,20,50,100,125,250,500} ≥ 1.1 · deepest. So 20/40 on a specimen gives 50.0 (the video) and 10/25 gives
//   100 from either source. Cancelling never touches the range.
//   QA round 3 — F2 case 3 reads the step wedge's OWN steps (stepPair(): 2nd-thinnest and thickest, so 10/25 on
//   the default wedge). state.autocal.d1/d2 are NOT consulted there: they carry the previous cal's standards
//   (20/40 after a 20 mm plate), which prompted for steps the wedge has not got and scaled vel by (d2−d1)/15.
//   Explicit standards are now an argument — autoCal.start({d1, d2}) — and cancel() rolls d1/d2 back to the pair
//   start() chose (and clears `entered`), so a half-finished cal leaves nothing behind.
// - F9 'Turn Probe' is a real DOM button (#btn-turn-probe) parked over #cross-area in v1/v2 only; SPEC-v3 §3.9
//   says top-left, the frames (angle_probe_using_the_v2 f020) show it below the block — the spec wins, so it sits
//   at the top-left of the cross-section area with a translucent skin so it never hides the block outline.
// - F11 the ASME/A5 chooser is UT.modes.blockPick(); 90-app routes tb-dac / tb-plot into it unless the mode already
//   is 'dac'/'iow' or the caller asks for {direct:true} (UT.test.click). 'ASME BLOCK' is added to the DAC block's
//   labels HERE (buildSpecimen), because 10-specimens is frozen for v3 and the label is pure chrome.
// - F12 clampOpts now passes a `steps` ARRAY through (2…12 finite thicknesses, order preserved) — without it every
//   Step Wedge preset silently built the default wedge, so the descending 20→8 mm preset could not exist.
// - F25/F27 the STEP 1–5 dialog ('defect-steps') opens once per browser (localStorage utsim.editorSteps) and on F1;
//   the editor's document keydown listener lives only while the window is open and ignores form fields.
//   QA round 3 — the STEP dialog (and the F47 TKY placement modal) belong to the EDITOR SESSION: defectEditor
//   ._closed() closes whichever of them is still up, because a modal that outlives the editor keeps its
//   .win-backdrop over the whole app and swallows every click (STEP 5 says the OK button EXITS the mode).
// - F28 stroke classification: LOF when the total-least-squares rms ≤ 0.6 mm AND (aspect ≥ 4 OR the stroke is
//   essentially perfectly straight, rms ≤ 0.05 × span). The second clause is ours: §5.4's aspect rule alone
//   rejects the two-point (6,4)→(10,9) stroke that V3-28 requires to be an LOF.
// - F29 the spot spinner is mm (editing.spotMm 5…45, default 5) and replaces the v1 10–60 px spinner; a stroke
//   spanning < 1 mm paints a circle of that diameter. The editor grows a Circle-View header, a Depth label and a
//   second red line carrying defectSummary().
//   QA round 2 — the Depth cell: its VALUE is 90-app's status rule / 62-view-plan's canvas rule (cursor depth,
//   signed while the editor is open, else frame.depthEcho), so panel, ring and status bar always agree, and its
//   TEXT goes through t('Depth = {d}mm') like the canvas cell. It is refreshed from the 'state' event carrying
//   `cursor` (60-view-cross writes the cursor with {noRender:true}, so a hover fires no render and the cell used
//   to stay stale); the canvas repaint is coalesced into one requestAnimationFrame so V3-63's budget is kept.
//   DECISION (spec silent): with no depth at all the cell prints the instrument's no-reading placeholder
//   `Depth = --.-mm` rather than disappearing — the panel's top row would otherwise jump as the pointer leaves.
// - F30 editing.returnMode records the modal mode the editor was opened from and is re-entered on close; the
//   editor lock keeps File / Help and the PIPE button live.
// - F33 HIDE key lock: editing.keyLock holds the code; the 'state' listener forces display.hide back on while a
//   lock is armed, so every un-hide path (toolbar, menu, test) has to go through hideKey(code).
// - F45 weldCondition() is a thin setWeldOpts() wrapper (the geometry and the echoes are 10/30/40's); the two
//   numeric conditions are clamped −5…5 mm and 0…4 mm here.
// - F46/F47 tkyOpts now lives in state.tkyOpts (the module object mirrors it); Plate / T-joint / Pipe are all real,
//   the panel gains Diameter and W/T and follows an API-driven rebuild(), and statusMid appends the video's
//   'Diameter={od}  W/T={wt}mm' for the curved kinds.
//   QA round 2 — panel placement: tkyPanelPos() works in DESIGN px (the #app box and #cv-cross's rect divided by
//   dom.scale(); window.innerWidth/Height are the WRONG unit for dom.win, which positions inside the scaled box)
//   and bottom-aligns the panel to the section on the chord's low side, at least 45 % of the section down, so the
//   yellow probe, the weld toe and the CHORD label stay clear at 1280 × 760. The measured height is applied on
//   the first show only — a panel the user has dragged keeps its place.
// - QA round 3 — SPEC-v3 §6.5 F54 names a `UT.dom.download` helper that 00-core has never exported, so the dead
//   `has('dom.download')` arm of saveDefFile() is gone: the <a download> click on an object URL IS the download.
// - Mode 'scale' (F41, owned by 85-scalemode) is registered here only as far as the enable matrix, MODE_OF and
//   buildSpecimen need it, so loadSpecimen('ok-demo'/'polygon') works in a build without 85.
// ---- v3 QA round 1 (decisions where the spec is silent) ----
// - F46 entry: buildSpecimen('tky') honours state.tkyOpts.kind (§2 default 'T-joint'), so the taught workflow
//   (toolbar → TKY) opens on the curved chord with 'Diameter=600  W/T=32mm' as tky f012–f020 does. A flat chord
//   is always a CHOICE — kind:'Plate' from the panel button, tkyConfig() or lesson 8's own setup.
// - setTkyOpts() clamps every numeric field to the same table 90-app persists with (TKY_RANGES), so a
//   non-finite braceAngle / braceT / … can never reach the builder and produce a NaN outline.
// - F29 the `Circle-View. Position {z}mm` header is painted by 62-view-plan (§1 ownership). This file keeps only
//   the `Depth = …` label and the red summary line; circleHeader() stays exported for 62 and the test API.
// - F29 the editor's Type <select> shows the DRAWING MODE (editing.brush), not the selected defect's type:
//   'Auto (from stroke)' therefore round-trips through OK, and only an explicit pick clears editing.autoType.
// - §5.7 the draw-region test lives in onBrush(), so the pointer path, UT.views.cross.brushStroke() and
//   UT.test.editorBrush() all obey it. The pointer path dilates its stroke by the brush radius before emitting,
//   so the rule is 'no point of the stroke inside the box' (a stroke started inside always keeps points inside).
// - §5.5 the editor's SEPARATION / LENGTH / HEIGHT live in `ed` and are reset to 20 / 30 / 3 whenever the editor
//   is opened and whenever a new specimen id is built, so a length picked up from an earlier selection cannot
//   leak into a later session (it used to make results order-dependent).
// - F33 the un-hide prompt is its own dialog ('SHOW DEFECTS'): unlock wording, no NO KEY button (it could only
//   fail there) and it stays open on a wrong code with 'Wrong key code' shown inside. Keys are clamped to
//   KEY_MAX = 64 characters, the limit 90-app's patchFromRecord accepts, so an armed lock survives a reload.
// - F44 'compass' is not hidden in tofd / lamination (SPEC-v3 §8).
// ---- v3 QA round 1 fixes ----
// - §5.5 / V3-29: selecting an EMPTY slot puts the LENGTH / HEIGHT fields back to ED_DEFAULT (30 / 3) unless the
//   user typed into them, so a freshly drawn defect is always the 30 mm the summary line promises. Before this,
//   editorRefresh() copied the length of a previously selected defect into `ed` and never put it back, so
//   selecting a 20 mm defect and then drawing into the next slot produced a 20 mm defect ('Length=20mm').
//   `ed.typed` is raised by an 'input' on either field and cleared again whenever the fields mirror a defect.
// - §5.7 / V3-31: drawRegion() falls back to state.display.drawRegion when 60-view-cross carries no v3 helper,
//   so an explicitly placed box is still honoured in a build without that module. With no helper AND no explicit
//   box the region stays unknown and strokes are accepted (never reject on a guess).
(function (UT) {
  'use strict';
  const M = UT.math;
  const S = UT.specimens;
  const modes = {};

  // ------------------------------------------------------------------ constants / tables
  const HINTS = {
    weld: 'LEFT mouse button/drag to move the UT Probe',
    v1: 'Drag the probe onto the top face (100mm Radius) or the front face (25mm thickness)',
    // v3 F57: the V2 hint names the radius the probe is facing (two literal i18n keys, one per side)
    v2: 'Drag the probe onto the top face (25mm Radius) or the front face (12.5mm thickness)',
    v2b: 'Drag the probe onto the top face (50mm Radius) or the front face (12.5mm thickness)',
    step: 'Place the probe on a step, then press Auto Cal (EPOCH 600) for the two-point calibration',
    iow: 'Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge',
    // v3 F57: once something has been plotted the original names both mouse buttons
    iowPlotted: 'RIGHT OR LEFT mouse button/Drag to PLOT Beam Spread on Plotter. Draw on Block to mark 10% Beam Edge',
    dac: 'Set Amplitude and press record button, then draw curves',
    tky: 'Adjust the brace angle in ADJUST MODE. LEFT mouse button/drag to move the UT Probe',
    tofd: 'Press Run Scan to build the D-scan. Click on the D-scan to move the probe',
    aut: 'Set the gates (Level / Width / Start) then press Run Scan',
    trade: 'Trade Test: find the hidden defects, fill in the report table and press Submit',
    lamination: 'LEFT mouse button/drag to move the UT Probe',
    editor: 'LEFT mouse button/drag to draw defect.',
    // v3 F41/F57: the original's Scale Mode cue, verbatim (utman_software) — the teaching wording, not a paraphrase
    scale: 'Load a picture, set the scale, then LEFT mouse button/drag to move the UT Probe',
    // v3 F57: hints owned here but SET by their own views (62 plan view, 90's TT dialog, 60's draw region)
    planDirection: 'LEFT or RIGHT mouse button to change probe direction',
    ttReceiver: 'SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE',
    drawRegion: 'Draw inside the blue box — drag its edge to move the box',
    fbh: 'FBH reference block: 0° probe — record the backwall reference, then gate a flat-bottom hole (Tools ▸ DGS diagram)',
    dampingTool: 'Finger damping tool: click on the scanning surface to add a damper (max 3; click within 4 mm removes)',
    practice: 'Random practice: find the hidden defects — Hint, Reveal one and Check row are allowed',
  };
  const MODES = ['weld', 'v1', 'v2', 'step', 'iow', 'dac', 'tky', 'tofd', 'aut', 'trade', 'lamination', 'fbh', 'scale'];
  const WELD_KIND = { weld: 1, tofd: 1, aut: 1, trade: 1 };
  const BLOCK_KIND = { v1: 1, v2: 1, step: 1, iow: 1, dac: 1, tky: 1, fbh: 1, scale: 1 };
  const WELD_SPEC_MODES = ['weld', 'tofd', 'aut', 'trade'];   // v3 F45: modes whose specimen is weldSpecimen()
  const WALL_REBUILD_MM = 0.05;                              // v3 F45: smallest wall change worth a rebuild
  const MODE_OF = { 'plate-weld': 'weld', 'pipe-weld': 'weld', v1: 'v1', v2: 'v2', step: 'step', iow: 'iow', dac: 'dac', tky: 'tky', 'lamination-plate': 'lamination', fbh: 'fbh', polygon: 'scale', 'ok-demo': 'scale', okDemo: 'scale' };
  const DEFECT_TYPES = ['planar', 'volumetric', 'crack', 'lof', 'porosity', 'slag', 'lamination', 'root'];
  /** English option labels of the editor's Type <select> (same wording as 84-trade's TYPE_OPTIONS; translated at render time). */
  const TYPE_LABELS = { auto: 'Auto (from stroke)', planar: 'planar', volumetric: 'volumetric', crack: 'crack', lof: 'lack of fusion', porosity: 'porosity', slag: 'slag', lamination: 'lamination', root: 'incomplete penetration' };
  const EDITOR_TYPES = ['auto'].concat(DEFECT_TYPES);   // v3 F29: 'Auto (from stroke)' heads the editor's Type list
  // v3 §8: 20 toolbar buttons — 'accrej' (F52) joins after 'rad'; tb-dac keeps its id while its LABEL becomes ASME (F11, lead decision 4)
  const ALL_TB = ['0', '45', '60', '70', 'v2', 'v1', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'clear', 'beam', 'rad', 'accrej', 'pipe', 'tky', 'tofd', 'aut'];
  // v2: 'tools' between defects and options; v3 §8: 'scalemode' before tools (F41) and 'about' before help (F55)
  const ALL_MENUS = ['file', 'probes', 'stepwedge', 'weld', 'defects', 'scalemode', 'tools', 'options', 'about', 'help'];
  const ANGLE_TB = { 'tb-0': 0, 'tb-45': 45, 'tb-60': 60, 'tb-70': 70 };
  const PREPS = (S.preps && S.preps.length) ? S.preps.slice() : ['single-v', 'double-v', 'single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle', 'none'];
  const DISABLED = {
    weld: { toolbar: [], menus: [], hidden: [] },
    fbh: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut', 'pipe'], menus: ['weld', 'defects'], hidden: ['compass'] },
    dac: { toolbar: ['damp', 'defect', 'hide', 'rad', 'pipe', 'tky', 'tofd', 'aut'], menus: [], hidden: ['compass'] },
    v1: { toolbar: ['0', '45', '60', '70', 'v2', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'accrej', 'pipe', 'tky', 'tofd', 'aut'], menus: ['file', 'probes', 'weld', 'defects', 'options'], hidden: ['plan', 'ruler'] },
    v2: { toolbar: ['0', '45', '60', '70', 'v1', 'dac', 'plot', 'damp', 'size', 'defect', 'hide', 'accrej', 'pipe', 'tky', 'tofd', 'aut'], menus: ['file', 'probes', 'weld', 'defects', 'options'], hidden: ['plan', 'ruler'] },
    // v3 F30: the editor keeps the PIPE button lit and the File / Help menus usable (drawing_defects_i)
    editor: { toolbar: ALL_TB.filter(function (t) { return ['defect', 'beam', 'rad', 'pipe'].indexOf(t) < 0; }), menus: ALL_MENUS.filter(function (m) { return m !== 'help' && m !== 'file'; }), hidden: [] },
    // v3 F41 (§8): Scale Mode — owned by 85-scalemode, registered here for the enable matrix
    scale: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut', 'pipe', 'defect'], menus: ['weld', 'defects'], hidden: ['plan', 'compass'] },
    iow: { toolbar: ['damp', 'defect', 'hide', 'pipe', 'tky', 'tofd', 'aut'], menus: ['weld', 'defects'], hidden: ['plan', 'compass'] },
    // v3 F44: the compass STAYS on screen in tofd and lamination (SPEC-v3 §8 / §6.3)
    tofd: { toolbar: ['0', 'v2', 'v1', 'damp'], menus: ['probes', 'options'], hidden: [] },
    aut: { toolbar: ['damp'], menus: ['options'], hidden: ['compass'] },
    tky: { toolbar: ['v2', 'v1', 'dac', 'plot', 'pipe', 'tofd', 'aut'], menus: ['weld'], hidden: ['plan', 'compass', 'ruler'] },
    trade: { toolbar: ['defect', 'hide', 'v1', 'v2', 'dac', 'plot', 'tky'], menus: ['defects'], hidden: [] },
    step: { toolbar: ['v2', 'v1', 'dac', 'plot', 'tky', 'tofd', 'aut'], menus: [], hidden: ['compass'] },
    // v3 F56: the instructor can hop to the Carbon Steel Block (V1 / V2) for a calibration interlude and come back
    lamination: { toolbar: ['dac', 'plot', 'tky', 'tofd', 'aut'], menus: [], hidden: [] },
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
  let autoCalState = null;     // {step: 1|2, t1, d1, d2}
  let acStartPair = null;      // the standards autoCal.start() chose, restored on cancel so no stale pair is left behind
  let acMsgText = '';          // v3 F3: the wizard's current prompt (re-shown when the skin changes mid-cal)
  let depthRaf = null;         // v3 F29: coalesced editor repaint after a cursor move (one per animation frame)
  let tkyPlaced = false;       // v3 F47: the ADJUST MODE panel has had its measured default position applied
  let rebuildTimer = null;     // deferred specimen-vs-state check after a material / weldOpts change (v2)
  let dampingToolWas = false;  // last seen damping.tool (status hint edge, v2 P3)
  let dacWin = null, tkyWin = null, editorWin = null, autoCalWin = null;
  let stepsWin = null, hideKeyWin = null, blockPickWin = null, tkyDefectWin = null;   // v3 F25 / F33 / F11 / F47
  let turnBtn = null;          // v3 F9: the 'Turn Probe' button parked over #cross-area in v1 / v2
  let editorKeyHandler = null; // v3 F27: document keydown, installed only while the editor window is open
  let editorClosing = false;   // v3 F30: re-entry guard while the editor restores its modal mode
  let scaleSpecId = 'ok-demo'; // v3 F41: the specimen id mode 'scale' last built (85-scalemode owns the rest)
  let lastSpecId = null;       // last specimen id seen by the editor (a change resets its field defaults)
  const ui = {};               // live DOM refs of the windows (rebuilt lazily)
  /** §14.9 Default TKY configuration; v3 F46 adds kind / chordOd / chordWt (state.tkyOpts is authoritative). */
  const TKY_DEFAULT = { kind: 'T-joint', braceAngle: 60, braceT: 12, chordT: 20, braceOffset: 0, precision: 1, chordOd: 600, chordWt: 32 };
  const TKY_KINDS = ['Plate', 'T-joint', 'Pipe'];
  /** v3 F33: longest HIDE key code that survives a reload (90-app's patchFromRecord drops longer ones). */
  const KEY_MAX = 64;
  /** Numeric limits of every tkyOpts field — the same table 90-app's persistence uses (SPEC-v3 §2). */
  const TKY_RANGES = { braceAngle: [15, 90], braceT: [3, 60], chordT: [3, 100], braceOffset: [-200, 200], precision: [0.1, 10], chordOd: [100, 2000], chordWt: [6, 60] };

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
  /** v3 F46: the live TKY configuration (state.tkyOpts over the §14.9 defaults). Always a fresh object. */
  function tkyOpts() { return Object.assign({}, TKY_DEFAULT, st().tkyOpts || {}); }
  /**
   * Merge a patch into state.tkyOpts (the single source of truth since v3 §2). Never renders by itself.
   * @param {object} patch partial {kind, braceAngle, braceT, chordT, braceOffset, precision, chordOd, chordWt}
   * @returns {object} the new state.tkyOpts
   */
  function setTkyOpts(patch) {
    const next = Object.assign(tkyOpts(), patch || {});
    if (TKY_KINDS.indexOf(next.kind) < 0) next.kind = 'T-joint';
    // Every numeric field is clamped to 90-app's TKY_RANGES so a non-finite value can never reach the builder
    // (a NaN there produced a specimen outline of NaN points with no error at all).
    Object.keys(TKY_RANGES).forEach(function (k) {
      const r = TKY_RANGES[k];
      const raw = next[k];
      const v = raw === null || raw === undefined || raw === '' || typeof raw === 'boolean' ? NaN : +raw;
      next[k] = M.clamp(Number.isFinite(v) ? v : TKY_DEFAULT[k], r[0], r[1]);
    });
    UT.set({ tkyOpts: next }, { noRender: true });
    return st().tkyOpts;
  }

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
    if (o.pipe) {
      // v3 F45: a varying wall is built at T(probe.z); 10-specimens' pipeWeld() reads `z` (its own doc names
      // 80-modes as the module that rebuilds "as the probe travels and the backwall walks").
      const z = o.z === undefined ? ((st().probe && st().probe.z) || 0) : o.z;
      return S.pipeWeld(Object.assign({}, o, { wt: o.wt === undefined ? o.T : o.wt, z }));
    }
    return S.plateWeld(o);
  }
  /**
   * v3 F45: rebuild the pipe weld when the probe has travelled far enough along z for the varying wall to
   * change the local thickness. No-op unless `weldOpts.pipe` and `wtVariationMm > 0`, so no v1/v2 number moves.
   * @returns {boolean} true when a rebuild happened
   */
  function rebuildForWallVariation() {
    const s = st();
    const spec = s.specimen;
    if (!spec || !spec.pipe || !(spec.pipe.wtVariationMm > 0) || typeof spec.thicknessAtZ !== 'function') return false;
    if (WELD_SPEC_MODES.indexOf(s.mode) < 0) return false;
    const z = (s.probe && s.probe.z) || 0;
    if (Math.abs(z - (spec.pipe.wtZ || 0)) < 1e-6) return false;
    if (Math.abs(spec.thicknessAtZ(z) - (spec.pipe.wtHere || spec.T)) < WALL_REBUILD_MM) return false;
    const fresh = weldSpecimen({ z });
    UT.set({ specimen: fresh }, { noRender: true });
    return true;
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
      case 'dac': {
        // v3 F11: the block screen is captioned 'ASME BLOCK' (10-specimens is frozen for v3, so the label is added here)
        const spec = S.dacBlock(Object.assign({ T: st().weldOpts.T || 20 }, withMat(so)));
        spec.labels = (spec.labels || []).concat([{ x: 250, y: -6, text: 'ASME BLOCK' }]);
        return spec;
      }
      case 'fbh': return S.fbhBlock(Object.assign({ T: 60 }, withMat(so)));
      case 'tky': {
        // v3 F46: the chord kind is state (§2 default 'T-joint'), so the taught workflow (toolbar → TKY)
        // lands on the genuinely curved chord with 'Diameter=600  W/T=32mm' exactly as tky f012–f020 opens.
        // A flat chord is a CHOICE (kind:'Plate' — the panel button, tkyConfig, lesson 8's setup), never a default.
        const o = setTkyOpts(so || {});
        return S.tky(withMat({ kind: o.kind, braceAngle: o.braceAngle, braceT: o.braceT, chordT: o.chordT, braceOffset: o.braceOffset, chordOd: o.chordOd, chordWt: o.chordWt }));
      }
      case 'lamination': return S.laminationPlate(withMat(so));
      case 'scale': {
        // v3 F41: 85-scalemode owns the mode; this only has to build what MODE_OF points at
        if (so && typeof so.id === 'string' && so.id) scaleSpecId = so.id;
        const sm = st().scaleMode || {};
        const opts = Object.assign({ outline: Array.isArray(sm.outline) && sm.outline.length >= 3 ? sm.outline : undefined }, withMat(so));
        const id = scaleSpecId === 'polygon' && !opts.outline ? 'ok-demo' : scaleSpecId;
        if (typeof S.build !== 'function') throw new Error('Scale Mode needs UT.specimens.build()');
        return S.build(id, opts);
      }
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
        // The exam is over: the hidden truth must not survive into another mode (§15.8), so submit() cannot score it.
        // A shared exam (SPEC-v2 §4.2.3) is abandoned with it: the lock (HIDE/BEAM/editor, forced display.hide) applies
        // only while the exam runs — the candidate must never stay locked out of the simulator without the code.
        patch.trade = Object.assign({}, s.trade, { active: false, truth: [], seed: null, score: null, result: null, report: [], startedAt: null, revealed: false, practice: false, exam: null, hintsUsed: 0, revealedOne: [] });
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
    syncTurnButton();                       // v3 F9: the 'Turn Probe' button exists in v1 / v2 only
    if (!o.silentUI) openModeWindows(name);
    UT.status({ right: hintFor(name) });   // English KEY — 90 renderStatus t()s it at render time (SPEC-v2 §5.3.2)
    UT.bus.emit('mode', { mode: name, prev });
    return spec;
  }
  /** Status hint key for a mode (practice / damping tool / v3 F57 plotted / V2 radius variants). */
  function hintFor(name) {
    const s = st();
    if (s.damping && s.damping.tool) return HINTS.dampingTool;
    if (name === 'trade' && s.trade && s.trade.practice) return HINTS.practice;
    // v3 F57: the plotter names both mouse buttons once something has been plotted or marked
    if (name === 'iow' && s.plot && ((s.plot.points || []).length || (s.plot.blockMarks || []).length)) return HINTS.iowPlotted;
    // v3 F57: the V2 hint names the radius the probe is facing
    if (name === 'v2') return (s.probe && s.probe.side < 0) ? HINTS.v2b : HINTS.v2;
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
    UT.status({ right: hintFor(s.mode) });
    return spec;
  }

  /** Extra middle status text for the current mode (90-app appends it after Pos/Range/AMP). */
  function statusMid() {
    const s = st(), spec = s.specimen, p = s.probe;
    if (!spec) return '';
    const parts = [];
    if (s.mode === 'v1') parts.push(spec.face === 'narrow' ? '25mm thickness. Echoes 25, 50, 75, 100 etc' : '100mm Radius. Echoes 100, 200, 300, 400 etc');
    // v3 F10: the V2 wide face lists FOUR multiples — the 4th is visible at range 250 (angle_probe_using_the_v2 f020)
    else if (s.mode === 'v2') parts.push(spec.face === 'narrow' ? '12.5mm thickness. Echoes 12.5, 25, 37.5, 50 etc' : (p.side >= 0 ? '25mm Radius. Echoes 25, 100, 175, 250 etc' : '50mm Radius. Echoes 50, 125, 200, 275 etc'));
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
    } else if (s.mode === 'tky' && spec.tky) {
      parts.push('Brace angle = ' + spec.tky.braceAngle + '°');
      // v3 F46: the original's chord caption (tky f012–f020); flat 'Plate' chords have no diameter
      if (spec.tky.kind && spec.tky.kind !== 'Plate') parts.push('Diameter=' + spec.tky.chordOd + '  W/T=' + spec.tky.chordWt + 'mm');
    }
    else if (s.mode === 'fbh') parts.push(t('FBH block {T} mm: ⌀2/3/4/6 at 30 mm, ⌀3 at 50 mm', { T: spec.T }));
    else if (s.mode === 'trade' && !(UT.trade && s.trade.practice)) parts.push('TRADE TEST ' + tradeClock());
    if (spec.material && spec.material.key && spec.material.key !== 'carbon') parts.push(spec.material.name);
    if (spec.pipe && (s.mode === 'weld' || s.mode === 'aut' || s.mode === 'trade')) parts.push('WT ' + spec.pipe.wt + 'mm  Dia ' + spec.pipe.odInch + 'inch');
    return parts.join('   ');
  }

  // ------------------------------------------------------------------ v3 F9: 'Turn Probe' (V1 / V2 oblique screens)
  /**
   * Flip the probe to face the other radius of the V1 / V2 block (probe.side = ±1) and re-caption the status
   * line. A pure UI wrapper: both echo sequences and both captions already exist in the physics (SPEC-v3 §3.9).
   * @returns {number} the new probe.side (+1 or −1)
   */
  function turnProbe() {
    const s = st();
    const side = (s.probe.side || 1) >= 0 ? -1 : 1;
    UT.setIn('probe', { side });
    syncTurnButton();
    UT.status({ right: hintFor(s.mode) });
    return side;
  }
  /** Create / show / hide the persistent grey `Turn Probe` push-button over the cross-section area. */
  function syncTurnButton() {
    if (typeof document === 'undefined') return null;
    const on = st().mode === 'v1' || st().mode === 'v2';
    if (!on) { if (turnBtn && turnBtn.parentNode) turnBtn.parentNode.removeChild(turnBtn); return null; }
    const host = document.getElementById('cross-area');
    if (!host) return null;
    UT.dom.injectCss('modes', modes.css);
    if (!turnBtn) turnBtn = UT.dom.button('Turn Probe', function () { turnProbe(); }, { id: 'btn-turn-probe', class: 'btn oblique-btn', title: 'Turn the probe to face the other radius' });
    if (turnBtn.parentNode !== host) host.appendChild(turnBtn);
    turnBtn.setAttribute('aria-pressed', (st().probe.side || 1) < 0 ? 'true' : 'false');
    return turnBtn;
  }

  // ------------------------------------------------------------------ v3 F11: ASME / A5 block chooser
  /**
   * The original's `Click to Select ASME or A5 Block` modal. 90-app routes tb-dac / tb-plot here unless the
   * mode already is 'dac' / 'iow' or the click is driven by UT.test ({direct:true}); SPEC-v3 §3.11.
   * @returns {object|null} the modal window api (null headless)
   */
  function blockPick() {
    if (typeof document === 'undefined') { UT.status({ right: 'Click to Select ASME or A5 Block' }); return null; }
    UT.dom.injectCss('modes', modes.css);
    const dom = UT.dom;
    const pick = function (mode) { if (blockPickWin) blockPickWin.close(); toggle(mode); };
    const card = function (label, caption, mode) {
      return dom.h('div', { class: 'bp-card' }, [
        dom.button(label, function () { pick(mode); }, { class: 'btn primary bp-btn' }),
        dom.h('div', { class: 'bp-cap', i18n: caption }, t(caption)),
      ]);
    };
    if (!blockPickWin) {
      blockPickWin = dom.win({
        name: 'blockpick', title: 'Click to Select ASME or A5 Block', modal: true, w: 420, x: 380, y: 200,
        content: dom.h('div', { class: 'bp' }, [
          card('ASME Block', 'Calibrate for Amplitude and draw DAC', 'dac'),
          card('A5 Block IOW', 'Plot Beam Spread on the Plotter and check Resolution', 'iow'),
        ]),
      });
    }
    blockPickWin.show();
    return blockPickWin;
  }

  // ------------------------------------------------------------------ v3 F45: weld condition toggles
  /**
   * Set the four Weld ▸ condition flags (SPEC-v3 §6.3 F45). The geometry and the echoes follow in
   * 10-specimens / 30-raytrace / 40-ascan; this only validates and rebuilds.
   * @param {{rootCorrosion?:boolean, roughSurface?:boolean, misalignmentMm?:number, wtVariationMm?:number}} patch
   * @returns {object} the new state.weldOpts
   */
  function weldCondition(patch) {
    const p = {};
    const o = patch || {};
    if (o.rootCorrosion !== undefined) p.rootCorrosion = !!o.rootCorrosion;
    if (o.roughSurface !== undefined) p.roughSurface = !!o.roughSurface;
    if (o.misalignmentMm !== undefined) p.misalignmentMm = M.clamp(+o.misalignmentMm || 0, -5, 5);
    if (o.wtVariationMm !== undefined) p.wtVariationMm = M.clamp(+o.wtVariationMm || 0, 0, 4);
    return setWeldOpts(p);
  }
  /**
   * v3 F47: `Weld ▸ Pipe Thickness…` — the wall thickness only (the full Weld Settings dialog stays).
   * @param {number} mm 6…40 mm
   * @returns {boolean} false when the value is outside the original's validation range
   */
  function setPipeThickness(mm) {
    const v = +mm;
    if (!Number.isFinite(v) || v < 6 || v > 40) { UT.status({ right: 'Enter Thickness between 6mm and 40mm' }); return false; }
    setWeldOpts({ wt: v, T: v });
    return true;
  }
  /**
   * v3 F17: number of skips drawn. Accepts 0.5 steps; `null` selects 'Run to UT Screen Range'
   * (lead decision 7: a separate boolean, so display.skips keeps its last numeric value).
   * @param {number|null} v
   * @returns {number|null} the effective skips (null while running to the range)
   */
  function setSkips(v) {
    if (v === null || v === undefined || v === 'range') { UT.setIn('display', { skipsToRange: true }); return null; }
    const n = M.clamp(Math.round((+v || 0) * 2) / 2, 0.5, 8);
    UT.setIn('display', { skips: n, skipsToRange: false });
    return n;
  }

  // ------------------------------------------------------------------ v3 F33: HIDE key-code lock
  /** Compare a typed key with the stored lock through 84-trade's helper when it is loaded, else plain text. */
  function keyMatches(code, stored) {
    const tr = has('trade');
    if (tr && typeof tr.unlock === 'function') { try { const r = tr.unlock(String(code), stored); if (typeof r === 'boolean') return r; } catch (e) { /* fall through */ } }
    return String(code) === String(stored);
  }
  /** Store a key through 84-trade's helper when it is loaded, else the plain string. */
  function keyStore(code) {
    const tr = has('trade');
    if (tr && typeof tr.lock === 'function') { try { const r = tr.lock(String(code)); if (typeof r === 'string' && r) return r; } catch (e) { /* fall through */ } }
    return String(code);
  }
  /**
   * v3 F33 / §7: arm or release the HIDE key lock.
   * With no lock armed the code is STORED and the defects are hidden; with a lock armed the code is CHECKED —
   * a match clears the lock and un-hides, a mismatch leaves `display.hide` true and reports `Wrong key code`.
   * @param {string} code the key code ('' / null = NO KEY, i.e. today's free toggle)
   * @returns {boolean} true when the call armed the lock or unlocked it
   */
  function hideKey(code) {
    const s = st();
    // KEY_MAX matches 90-app's persistence rule (a longer key is dropped by patchFromRecord, so the lock would
    // silently disappear on the next reload and a student could un-hide the defects freely).
    const txt = (code === null || code === undefined ? '' : String(code).trim()).slice(0, KEY_MAX);
    const lock = s.editing.keyLock;
    if (!lock) {
      UT.setIn('editing', { keyLock: txt ? keyStore(txt) : null }, { noRender: true });
      UT.setIn('display', { hide: true });
      UT.status({ right: txt ? 'Defects hidden — the key code is needed to show them again' : 'Defects hidden' });
      return true;
    }
    if (!keyMatches(txt, lock)) { UT.status({ right: 'Wrong key code' }); return false; }
    UT.setIn('editing', { keyLock: null }, { noRender: true });
    UT.setIn('display', { hide: false });
    UT.status({ right: hintFor(s.mode) });
    return true;
  }
  /**
   * v3 F33: the HIDE dialog — `KEY PREVENTS STUDENTS SEEING THE DEFECT` / `Key code will be used to SHOW the
   * defect` with OK / NO KEY / Cancel. Opened by tb-hide while the defects are visible.
   * @returns {object|null} the modal window api (null headless — the defects are then hidden with no key)
   */
  function hideKeyPrompt() {
    const s = st();
    if (s.display.hide) {                                  // un-hiding: ask for the code when one is armed
      if (!s.editing.keyLock) { UT.setIn('display', { hide: false }); UT.status({ right: hintFor(s.mode) }); return null; }
      return hideKeyAsk();
    }
    if (typeof document === 'undefined') { hideKey(''); return null; }
    return hideKeyAsk(true);
  }
  function hideKeyAsk(arming) {
    if (typeof document === 'undefined') return null;
    UT.dom.injectCss('modes', modes.css);
    const dom = UT.dom;
    const input = dom.h('input', { type: 'text', class: 'hk-input', 'aria-label': 'Key code', value: '', maxlength: KEY_MAX });
    // The two paths are different jobs and read differently: ARMING states what the key is for and offers
    // NO KEY (the original's default); UNLOCKING asks for the stored code, has no NO KEY button (it could
    // only ever fail there) and keeps the dialog open on a wrong code with the error shown INSIDE it.
    const err = dom.h('div', { class: 'hk-err' }, '');
    const lines = arming
      ? [dom.h('div', { class: 'hk-line', i18n: 'KEY PREVENTS STUDENTS SEEING THE DEFECT' }, t('KEY PREVENTS STUDENTS SEEING THE DEFECT')),
        dom.h('div', { class: 'hk-line2', i18n: 'Key code will be used to SHOW the defect' }, t('Key code will be used to SHOW the defect'))]
      : [dom.h('div', { class: 'hk-line', i18n: 'Enter the key code to SHOW the defects' }, t('Enter the key code to SHOW the defects')),
        dom.h('div', { class: 'hk-line2', i18n: 'The defects stay hidden until the key code matches' }, t('The defects stay hidden until the key code matches'))];
    const buttons = [dom.button('OK', function () {
      if (arming) { if (hideKeyWin) hideKeyWin.close(); hideKey(input.value); return; }
      if (hideKey(input.value)) { if (hideKeyWin) hideKeyWin.close(); return; }
      err.textContent = t('Wrong key code');                       // stays open: the instructor can try again
      try { input.select(); } catch (e) { /* ignore */ }
    }, { class: 'btn primary' })];
    if (arming) buttons.push(dom.button('NO KEY', function () { if (hideKeyWin) hideKeyWin.close(); hideKey(''); }));
    buttons.push(dom.button('Cancel', function () { if (hideKeyWin) hideKeyWin.close(); }));
    const body = dom.h('div', { class: 'hk' }, lines.concat([input, err, dom.h('div', { class: 'btn-row' }, buttons)]));
    const title = arming ? 'HIDE' : 'SHOW DEFECTS';
    if (hideKeyWin) { hideKeyWin.setContent(body); if (typeof hideKeyWin.setTitle === 'function') hideKeyWin.setTitle(title); }
    else hideKeyWin = dom.win({ name: 'hidekey', title, modal: true, w: 360, x: 420, y: 220, content: body });
    hideKeyWin.show();
    try { input.focus(); } catch (e) { /* ignore */ }
    return hideKeyWin;
  }

  // ------------------------------------------------------------------ state listener
  UT.bus.on('state', function (ev) {
    const keys = ev && ev.keys ? ev.keys : [];
    const s = st();
    // v3 F3: a skin change mid-cal moves the wizard between the LCD and the floating window (never both)
    if (keys.indexOf('utSet') >= 0) acSync();
    // v3 F29 / QA round 2: the editor's `Depth =` cell mirrors the status cell, which refreshes off the state
    // change — 60-view-cross writes state.cursor with {noRender: true}, so a hover fires no render at all.
    if (keys.indexOf('cursor') >= 0) editorCursorRefresh();
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
      if (s.mode === 'v1' || s.mode === 'v2') syncTurnButton();     // v3 F9: aria-pressed follows probe.side
      if (rebuildForWallVariation()) return;                        // v3 F45: the backwall walks with probe.z
    }
    if (keys.indexOf('display') >= 0 || keys.indexOf('trade') >= 0) {
      // Trade test: the hidden truth defects can never be shown until Submit / Reveal (§8.12, §14.7).
      if (s.mode === 'trade' && s.trade.active && !s.trade.revealed && !s.display.hide) { UT.setIn('display', { hide: true }); return; }
      // v3 F33: while a HIDE key is armed every un-hide path has to go through hideKey(code)
      if (s.editing && s.editing.keyLock && !s.display.hide) { UT.setIn('display', { hide: true }); UT.status({ right: 'Wrong key code' }); return; }
    }
    // v3 F57: the plotter hint names both mouse buttons once something has been plotted or marked
    if (keys.indexOf('plot') >= 0 && s.mode === 'iow') UT.status({ right: hintFor('iow') });
    // v3 F47: an API-driven rebuild must be reflected in the ADJUST MODE panel
    if (keys.indexOf('tkyOpts') >= 0) tkyRefresh();
    if (keys.indexOf('probe') >= 0 || keys.indexOf('specimen') >= 0 || keys.indexOf('display') >= 0) {
      if (s.display.autoTrig) {
        const trig = s.instrument.trig || { angle: 60, thick: 20, xValue: 0 };
        const ang = s.probe.method === 'pa' ? s.probe.paFrom : s.probe.angle;
        const T = s.specimen.T;
        if (trig.angle !== ang || trig.thick !== T) UT.setIn('instrument', { trig: Object.assign({}, trig, { angle: ang, thick: T }) });
      }
    }
    if (keys.indexOf('specimen') >= 0) {
      // A different specimen is a new editor session: the LENGTH / SEPARATION / HEIGHT numbers go back to their
      // §5.5 defaults (a wall-variation rebuild keeps the same id and is not a new session).
      const id = s.specimen.id || null;
      if (id !== lastSpecId) { lastSpecId = id; resetEditorFields(); }
    }
    if (keys.indexOf('defects') >= 0 || keys.indexOf('selectedDefect') >= 0 || keys.indexOf('specimen') >= 0) editorRefresh();
    if (keys.indexOf('instrument') >= 0) dacRefresh();
    // v2: material / weld-preparation changes rebuild the current specimen (deferred; no-op after an explicit enter())
    if (keys.indexOf('material') >= 0 || keys.indexOf('weldOpts') >= 0) scheduleRebuildCheck();
    // v2: finger damping tool status hint (P3)
    if (keys.indexOf('damping') >= 0) {
      const wasTool = !!dampingToolWas, isTool = !!(s.damping && s.damping.tool);
      dampingToolWas = isTool;
      if (isTool !== wasTool) UT.status({ right: isTool ? HINTS.dampingTool : hintFor(s.mode) });
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
    // v3 F2: with source 'specimen' the trainee moves GATE 1 onto the next multiple (the probe never moves), so
    // the capture has to be the gated peak; the step-wedge exercise keeps the v1 'earliest backwall' preference.
    const useFirst = ((st().autocal || {}).source || 'step') !== 'specimen';
    let first = null;
    for (const e of (f && f.echoes) || []) {
      if (e.kind === 'backwall' && e.ampPct >= level && (!first || e.path < first.path)) first = e;
    }
    if (useFirst && first && (!r || !(r.path > 0) || first.path < r.path - 0.5)) return { t: 2 * first.path / d.vel + d.wedgeDelayUs, d, firstBackwall: true };
    if (r && r.path > 0) return { t: 2 * r.path / d.vel + d.wedgeDelayUs, d };
    // fallback: the backwall under the probe (no gated echo yet)
    const spec = st().specimen;
    const T = spec && spec.thicknessAt ? spec.thicknessAt(st().probe.x) : (spec ? spec.T : 25);
    return { t: 2 * T / d.vel + d.wedgeDelayUs, d, fallback: true };
  }
  function autoCalWindow() {
    if (autoCalWin) return autoCalWin;
    ui.acMsg = UT.dom.h('div', { class: 'ac-msg' }, '');
    // v3 F3: the same on-LCD wizard, as a floating window for the USK 7 skin and for headless use
    ui.acTitle = UT.dom.h('div', { class: 'ac-title' }, '');
    ui.acField = UT.dom.h('input', { type: 'number', class: 'ac-field', min: 0, max: 500, step: 0.1, value: 0, 'aria-label': 'Standard thickness (mm)' });
    ui.acField.addEventListener('input', function () { autoCal.setField(+ui.acField.value); });
    ui.acConfirm = UT.dom.h('div', { class: 'ac-confirm' }, '');
    autoCalWin = UT.dom.win({
      name: 'autocal', title: 'Auto Cal', x: 470, y: 150, w: 330,
      content: UT.dom.h('div', { class: 'ac-body' }, [
        ui.acMsg, ui.acTitle, ui.acField, ui.acConfirm,
        UT.dom.h('div', { class: 'btn-row' }, [
          UT.dom.button('✓', function () { modes.autoCal.confirm(); }, { class: 'btn primary', title: 'Capture' }),
          UT.dom.button('Cancel', function () { modes.autoCal.cancel(); }),
        ]),
      ]),
      onClose: function () { setAcState(null); },
    });
    return autoCalWin;
  }
  /** v3 F3: the two on-LCD captions (70-instruments owns the canvas drawing; this mirrors them). */
  function acCaption(stage) {
    const s = stage === 1 || stage === 2 ? stage : 0;
    if (!s) return null;
    const ins = has('instruments.calText');
    if (typeof ins === 'function') { try { const r = UT.instruments.calText(s); if (r && r.text) return r; } catch (e) { /* fall through */ } }
    const v = +(st().autocal || {}).field || 0;
    const title = s === 1 ? 'ENTER VALUE FOR THIN STANDARD' : 'ENTER VALUE FOR THICK STANDARD';
    const confirm = s === 1 ? 'AND THEN PRESS Calibration' : 'AND THEN PRESS ENTER';
    return { stage: s, title, value: v > 0 ? v.toFixed(2) : '0', confirm, text: title + '  ' + (v > 0 ? v.toFixed(2) : '0') + '  ' + confirm };
  }
  function acRefresh() {
    if (!autoCalWin || !ui.acTitle) return;
    const cap = acCaption(autoCalState ? autoCalState.step : 0);
    ui.acTitle.textContent = cap ? t(cap.title) : '';
    ui.acConfirm.textContent = cap ? t(cap.confirm) : '';
    if (cap && document.activeElement !== ui.acField) ui.acField.value = String(+(st().autocal || {}).field || 0);
  }
  /**
   * v3 F3 / QA round 2: does the CURRENT skin already draw the wizard on the instrument LCD? 70-instruments
   * paints the `ENTER VALUE FOR …STANDARD` box inside `#cv-ascan` for every EPOCH skin (epoch600 / epoch4 /
   * epochltc), so the generic floating window would be a second copy of the same three lines parked over the
   * views. It stays for the USK 7 skin and for headless / instrument-less builds (§3.3).
   * @returns {boolean} true while the on-LCD wizard is the visible one
   */
  function lcdWizard() {
    if (typeof document === 'undefined') return false;
    if (!UT.instruments || typeof UT.instruments.calText !== 'function') return false;
    if (!document.getElementById('cv-ascan')) return false;
    return String(st().utSet || '').indexOf('epoch') === 0;
  }
  /** Show / hide the floating wizard for the current skin, keeping its three lines and the field in step. */
  function acSync() {
    if (typeof document === 'undefined') return;
    const running = !!autoCalState;
    if (!running || lcdWizard()) {
      if (autoCalWin && autoCalWin.isOpen()) autoCalWin.hide();
      acRefresh();
      return;
    }
    const w = autoCalWindow();
    UT.dom.injectCss('modes', modes.css);
    if (ui.acMsg) ui.acMsg.textContent = acMsgText;
    w.show();
    acRefresh();
  }
  function acShow(msg) {
    acMsgText = msg || '';
    acSync();
    UT.status({ right: msg });
  }
  /** Set the wizard state (module variable) and mirror it into state.autocal {stage, t1, d1, d2, …} (SPEC-v2 §2, v3 §2). */
  function setAcState(next, extra) {
    autoCalState = next;
    const cur = st().autocal || {};
    const stage = next ? next.step : 0;
    const t1 = next ? next.t1 : null, d1 = next ? next.d1 : (cur.d1 === undefined ? 10 : cur.d1), d2 = next ? next.d2 : (cur.d2 === undefined ? 25 : cur.d2);
    const patch = Object.assign({ stage, t1, d1, d2 }, extra || {});
    let changed = false;
    Object.keys(patch).forEach(function (k) { if (cur[k] !== patch[k]) changed = true; });
    if (changed) UT.setIn('autocal', patch, { noRender: true });
    acRefresh();
  }
  // v3 F4: the range presets the post-cal re-set may choose from (epoch_auto_calibration f022: RANGE 50.0)
  const RANGE_PRESETS = [10, 20, 50, 100, 125, 250, 500];
  /**
   * v3 F4: the round screen range a successful two-point cal leaves behind — the smallest preset that shows the
   * deepest path the cal had to display, with 10 % headroom. A two-multiple cal at ONE probe position
   * (d2 ≈ 2·d1) only has to show d2 (20/40 → 50.0, the video); two separate standards have to show the thick
   * one's 2nd multiple (10/25 → 100). This is SPEC-v3 §3.4's rule as written.
   * @param {number} d1 thin standard (mm)
   * @param {number} d2 thick standard (mm)
   * @param {string} [source] 'specimen' | 'step'
   * @returns {number} one of 10, 20, 50, 100, 125, 250, 500
   */
  function rangeAfterCal(d1, d2, source) {
    const twoMultiple = source !== 'step' && d1 > 0 && Math.abs(d2 - 2 * d1) <= 0.05 * d1;
    const need = 1.1 * (twoMultiple ? d2 : 2 * d2);
    for (const r of RANGE_PRESETS) if (r >= need - 1e-9) return r;
    return 500;
  }
  /** Local thickness under the probe (step wedges vary along x). */
  function localT() {
    const spec = st().specimen;
    return spec && spec.thicknessAt ? spec.thicknessAt(st().probe.x) : (spec ? spec.T : 25);
  }
  /**
   * v3 F2: does the current frame already show a backwall family on this specimen? True for a 'backwall' /
   * 'geometry' echo tagged 'bottom', or for any echo whose path is within 5 % of a multiple of T.
   * @param {number} T local thickness (mm)
   * @returns {boolean}
   */
  function hasBackwallFamily(T) {
    const f = UT.frame;
    const echoes = (f && f.echoes) || [];
    const r = f && f.readouts && f.readouts.primary;
    if (r && (r.echoKind === 'backwall' || r.echoKind === 'geometry')) return true;
    for (const e of echoes) {
      if (e.kind !== 'backwall' && e.kind !== 'geometry') continue;      // 'backwall family' — never an SDH or a defect
      if (!(e.ampPct >= 5)) continue;                                    // a cal needs an echo the trainee can gate
      if (e.tag === 'bottom') return true;
      if (T > 0 && e.path > 0) { const k = e.path / T; if (k >= 0.95 && Math.abs(k - Math.round(k)) <= 0.05) return true; }
    }
    return false;
  }
  /** v3 F2 rule 2: the standards pair of the V1 / V2 face under the probe, or null outside those modes. */
  function blockPair() {
    const s = st(), spec = s.specimen;
    if (s.mode === 'v1') return (spec && spec.face === 'narrow') ? { d1: 25, d2: 50 } : { d1: 100, d2: 200 };
    if (s.mode === 'v2') {
      if (spec && spec.face === 'narrow') return { d1: 12.5, d2: 25 };
      return (s.probe.side || 1) >= 0 ? { d1: 25, d2: 50 } : { d1: 50, d2: 125 };
    }
    return null;
  }
  /** Stage prompt (i18n key + params) for the wizard's source and stage. */
  function acPrompt(stage, d) {
    const src = (st().autocal || {}).source;
    if (src === 'step') {
      return stage === 1
        ? t('Auto Cal 1/2: Place the probe on the {d} mm step (gate 1 start below the first backwall echo), then press ✓', { d })
        : t('Auto Cal 2/2: Place the probe on the {d} mm step, then press ✓', { d });
    }
    return stage === 1
      ? t('Auto Cal 1/2: gate the {d} mm backwall echo, enter the thin standard and press ✓', { d })
      : t('Auto Cal 2/2: move gate 1 onto the {d} mm backwall echo, enter the thick standard and press ✓', { d });
  }
  /**
   * v3 F2 case 3: the two standards of the step wedge under the probe, read from the WEDGE itself
   * (spec.steps) so a previous cal's d1/d2 can never be inherited — the taught pair is the 2nd step and the
   * thickest step, i.e. 10 / 25 on the default 5/10/15/20/25 wedge.
   * @returns {{d1:number, d2:number}}
   */
  function stepPair() {
    const spec = st().specimen;
    const steps = (spec && Array.isArray(spec.steps) ? spec.steps : [])
      .map(Number).filter(function (n) { return Number.isFinite(n) && n > 0; })
      .sort(function (a, b) { return a - b; });
    if (steps.length < 2) return { d1: 10, d2: 25 };
    return { d1: steps[1], d2: steps[steps.length - 1] };
  }
  const autoCal = {
    /**
     * Start the two-point wizard ON THE CURRENT SPECIMEN (v3 F2): its own backwall multiples when the frame
     * already shows one, the V1 / V2 face's standards on a calibration block, and only otherwise the step
     * wedge (which is then entered). Sets autocal.stage = 1, source, d1/d2 and clears the entry field.
     * @param {{d1?:number, d2?:number}} [opts] explicit standards (test API override; F3's entered values
     *   still win over them at confirm time)
     * @returns {{step:number, d1:number, d2:number, t1:(number|null)}} the wizard state
     */
    start(opts) {
      const s = st();
      let source = 'specimen', d1 = null, d2 = null;
      if (s.mode === 'step') {                      // the taught 10 / 25 exercise stays exactly as v1 taught it
        source = 'step';
        // NOT state.autocal.d1/d2: those carry the LAST specimen's standards (20/40 after a 20 mm plate cal),
        // which would prompt for steps this wedge does not have and scale the velocity by (d2−d1)/15.
        const pair = stepPair();
        d1 = pair.d1; d2 = pair.d2;
      } else {
        const T = localT();
        const pair = blockPair();
        if (T > 0 && hasBackwallFamily(T)) { d1 = +T.toFixed(2); d2 = +(2 * T).toFixed(2); }
        else if (pair) { d1 = pair.d1; d2 = pair.d2; }
        else { enter('step'); source = 'step'; const sp = stepPair(); d1 = sp.d1; d2 = sp.d2; }
      }
      // explicit standards from the caller (test API) still win — but only when they are asked for
      const o = opts || {};
      if (Number.isFinite(+o.d1) && +o.d1 > 0) d1 = +o.d1;
      if (Number.isFinite(+o.d2) && +o.d2 > 0) d2 = +o.d2;
      acStartPair = { d1, d2 };
      setAcState({ step: 1, d1, d2, t1: null }, { source, entered: { thin: null, thick: null }, field: 0, rangeAfter: null });
      acShow(acPrompt(1, d1));
      return autoCalState;
    },
    /**
     * v3 F3: write the on-LCD entry field (mm, 0…500, 2 dp). 70-instruments' ▲▼ / wheel / typing route here.
     * @param {number} mm
     * @returns {number} the stored value
     */
    setField(mm) {
      const v = M.clamp(Math.round((Number(mm) || 0) * 100) / 100, 0, 500);
      UT.setIn('autocal', { field: v }, { noRender: true });
      acRefresh();
      return v;
    },
    /**
     * v3 F3: confirm the current stage — the entered value becomes d1 (stage 1) / d2 (stage 2) and is recorded
     * in autocal.entered before the capture. CAL / `Auto Cal` softkey at stage 1, ENTER / ✓ at stage 2.
     * @returns {object|null} the wizard state (stage 1) or the new cal (stage 2); null when idle
     */
    confirm() {
      if (!autoCalState) return null;
      const stage = autoCalState.step;
      const field = +(st().autocal || {}).field || 0;
      if (field > 0) { if (stage === 1) autoCalState.d1 = field; else autoCalState.d2 = field; }
      const entered = Object.assign({ thin: null, thick: null }, (st().autocal || {}).entered || {});
      if (stage === 1) entered.thin = field > 0 ? field : autoCalState.d1;
      else entered.thick = field > 0 ? field : autoCalState.d2;
      UT.setIn('autocal', { entered, d1: autoCalState.d1, d2: autoCalState.d2 }, { noRender: true });
      return autoCal.step();
    },
    /** Capture the current gated peak time for the current wizard step (stage 1 → 2, stage 2 → done). Returns the new cal when finished; null when the wizard is not running (✓ / Enter is then a no-op — only the 'Auto Cal' softkey starts it). */
    step() {
      if (!autoCalState) return null;
      const cap = trueTimeOfGatedPeak();
      if (!cap) return null;
      if (autoCalState.step === 1) {
        const d1 = autoCalState.d1, d2 = autoCalState.d2;
        // the video arrows the thick field down to it from 42.00 — start it on the 2nd multiple of the thin standard
        setAcState({ step: 2, d1, d2, t1: cap.t }, { field: +(2 * d1).toFixed(2) });
        acShow(acPrompt(2, d2));
        return autoCalState;
      }
      const t1 = autoCalState.t1, t2 = cap.t, d1 = autoCalState.d1, d2 = autoCalState.d2;
      if (!(t2 > t1 + 1e-6)) { acShow(t('Auto Cal: the second echo must be later than the first — move to the {d} mm step and press ✓', { d: d2 })); return null; }
      const vel = 2 * (d2 - d1) / (t2 - t1);
      const zero = t1 - cap.d.wedgeDelayUs - 2 * d1 / vel;
      const cal = { vel: +vel.toFixed(4), zero: +zero.toFixed(4) };
      // v3 F4: a SUCCESSFUL cal re-sets the screen range to a round value; delay is left alone
      const range = rangeAfterCal(d1, d2, (st().autocal || {}).source);
      UT.setIn('instrument', { cal, range });
      acStartPair = null;
      setAcState(null, { rangeAfter: range });
      if (autoCalWin) autoCalWin.hide();
      UT.status({ right: t('Auto Cal done: Velocity {v} m/s, Zero {z} µs', { v: Math.round(vel * 1000), z: zero.toFixed(2) }) });
      return cal;
    },
    /**
     * Abort the wizard (autocal.stage = 0). instrument.cal and the range are left untouched; the standards
     * are rolled back to the pair start() chose, so a half-entered value is not inherited by the next cal.
     */
    cancel() {
      const p = acStartPair || {};
      const extra = { field: 0, entered: { thin: null, thick: null } };
      if (Number.isFinite(p.d1)) extra.d1 = p.d1;
      if (Number.isFinite(p.d2)) extra.d2 = p.d2;
      acStartPair = null;
      setAcState(null, extra);
      if (autoCalWin) autoCalWin.hide();
      UT.status({ right: hintFor(st().mode) });
    },
    state() { return autoCalState; },
    /** v3 §7: the full wizard state for UT.test.autocal.state() — stage, field, standards and the LCD caption. */
    info() {
      const a = st().autocal || {};
      const cap = acCaption(a.stage);
      return { stage: a.stage || 0, field: +a.field || 0, d1: a.d1, d2: a.d2, t1: a.t1, source: a.source, entered: Object.assign({}, a.entered || {}), rangeAfter: a.rangeAfter === undefined ? null : a.rangeAfter, caption: cap ? cap.text : '' };
    },
  };

  // ------------------------------------------------------------------ DAC (§8.3)
  const dac = {
    /** Record the gated peak as a DAC point normalised to the reference gain. Returns the point or null. */
    record() {
      const s = st();
      const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
      if (!r || !(r.path > 0)) { UT.status({ right: 'DAC: no echo above the gate level — maximise the echo first' }); return null; }
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
      UT.status({ right: hintFor(st().mode) });
    },
    /** Toggle the −6 / −14 dB companion curves (or set explicitly). Returns the new state. */
    curves(on) {
      const cur = st().instrument.dac;
      const v = on === undefined ? !cur.curves : !!on;
      UT.setIn('instrument', { dac: Object.assign({}, cur, { curves: v, on: cur.points.length >= 2 }) });
      if (cur.points.length < 2) UT.status({ right: 'DAC: record at least 2 points, then Draw Curves' });
      else UT.status({ right: v ? 'DAC −6 dB (50 %) / −14 dB (20 %) curves drawn' : 'DAC companion curves hidden' });
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
    if (ui.dacDraw) { const k = d.curves ? 'Hide Curves' : 'Draw Curves'; ui.dacDraw.dataset.i18n = k; ui.dacDraw.textContent = t(k); }
  }
  const dacPanel = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      if (!dacWin) {
        ui.dacList = UT.dom.h('div', { class: 'dac-list' });
        ui.dacRef = UT.dom.h('div', { class: 'dac-ref' });
        const body = UT.dom.h('div', { class: 'dac-body', tabindex: 0, onkeydown: function (e) { if (e.key === 'r' || e.key === 'R') { dac.record(); e.preventDefault(); } } }, [
          UT.dom.h('div', { class: 'dac-hint', i18n: HINTS.dac }),
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
    // v2 exam lock (§4.2.3): no defect may join a locked exam's hidden truth (Defects ▸ Add Preset stays reachable, see isMenuEnabled)
    if (examLocked(s)) { UT.status({ right: 'Defect editor is locked during the Trade Test' }); return null; }
    const fn = S.defectPresets[name];
    if (!fn) { UT.status({ right: t('Unknown preset {name}', { name }) }); return null; }
    const spec = s.specimen || S.plateWeld(s.weldOpts);
    const n = freeSlot(s.defects);
    if (!n) { UT.status({ right: 'Maximum 8 defects' }); return null; }
    // v3 F21 (§4.9 rule 2): a preset lands where the trainee is looking — the probe's own z — unless the caller
    // pins one. On plates defaultProbe.z = L/2 = 150, so every v1/v2 plate number is unchanged.
    const zc = Number.isFinite(s.probe && s.probe.z) ? s.probe.z : undefined;
    const d = fn(spec, Object.assign(zc === undefined ? {} : { z: zc }, { n }, opts || {}));
    d.n = n;
    UT.set({ defects: s.defects.concat([d]) });
    return d;
  }

  // ------------------------------------------------------------------ defect editor window (§14.3)
  /** SPEC-v3 §5.5 defaults of the editor's SEPARATION / LENGTH / HEIGHT fields (a fresh session starts here). */
  const ED_DEFAULT = { separation: 20, length: 30, height: 3, applyAll: false, drag: null, typed: false };
  const ed = Object.assign({}, ED_DEFAULT);
  /**
   * Reset the editor's field values to SPEC-v3 §5.5's defaults (30 mm long, 3 mm high). Called when the editor
   * is opened and when a new specimen is loaded, so a length picked up from an earlier selection can never leak
   * into a later session (it used to survive Clear, reopen and loadSpecimen and made results order-dependent).
   */
  function resetEditorFields() {
    Object.assign(ed, ED_DEFAULT);
    if (ui.fSep) ui.fSep.input.value = ed.separation;
    if (ui.fLength) ui.fLength.input.value = ed.length;
    if (ui.fHeight) ui.fHeight.input.value = ed.height;
    if (ui.fAll) ui.fAll.input.checked = false;
  }
  function selectedN() { return (st().selectedDefect || 0) + 1; }
  function selectedDefect() { return slotDefect(st().defects, selectedN()); }

  // v3 F28 / F29: the original's editor captions (drawing_defects_i f038, drawing_defects_ii f030/f050/f085)
  const PLANAR4 = { lof: 1, planar: 1, crack: 1, root: 1 };
  const PLANAR_LABEL = { lof: 'LACK OF FUSION', crack: 'CRACK', planar: 'PLANAR', root: 'PLANAR' };
  const SUMMARY_TYPE = { lof: 'LOF', crack: 'CRACK', planar: 'PLANAR', root: 'PLANAR' };
  /** Defect angle as the original prints it: |atan2(Δy, Δx)| of the first→last point, whole degrees 0…180. */
  function defectAngle(d) {
    const p = (d && d.pts) || [];
    if (p.length < 2) return 0;
    const a = p[0], b = p[p.length - 1];
    return M.clamp(Math.round(Math.abs(Math.atan2(b.y - a.y, b.x - a.x)) / Math.PI * 180), 0, 180);
  }
  /** Height as the original prints it: up to 3 decimals with the trailing zeros dropped ('0.998', '0.5'). */
  function fmtHeight(v) { return String(+(Number(v) || 0).toFixed(3)); }
  /** The pending brush's caption prefix for an empty slot ('VOL' | 'LOF' | 'PLANAR'). */
  function pendingPrefix() {
    const b = st().editing.brush;
    if (b === 'lof') return 'LOF';
    if (b && PLANAR4[b]) return 'PLANAR';
    return 'VOL';
  }
  /** v3 F29: `Circle-View. Position {z}mm` — the live circumferential probe position. */
  function circleHeader() { return t('Circle-View. Position {z}mm', { z: Math.round(st().probe ? st().probe.z : 0) }); }
  /**
   * v3 F29: the number the circle panel's `Depth =` cell reports — the same rule as the status cell (90-app
   * midParts) and the canvas cell 62-view-plan draws, so the panel, the ring and the status bar never
   * disagree: the cursor depth while the pointer carries one (signed inside the editor, §14.3), else the F23
   * echo depth (`frame.depthEcho`, `display.depthEcho` respected).
   * @returns {number|null} millimetres, or null when nothing is under the pointer or the gate
   */
  function depthValue() {
    const s = st();
    const c = s.cursor;
    if (c && Number.isFinite(c.y) && ((s.editing && s.editing.defect) || c.y >= 0)) return c.y;
    if (s.display && s.display.depthEcho === false) return null;
    let de = UT.frame ? UT.frame.depthEcho : null;
    if (de === undefined && has('ascan.echoDepth')) { try { de = UT.ascan.echoDepth(UT.frame, s); } catch (e) { de = null; } }
    return de && Number.isFinite(de.y) ? de.y : null;
  }
  /**
   * v3 F29: the circle panel's `Depth = {d}mm` label, through i18n like every other user-visible string
   * (62-view-plan draws the same key on the canvas). With no depth the cell prints the instrument's own
   * no-reading placeholder (`Depth = --.-mm`) instead of a dangling `Depth = `.
   * @returns {string}
   */
  function depthLabel() {
    const d = depthValue();
    return t('Depth = {d}mm', { d: d === null ? '--.-' : d.toFixed(1) });
  }
  /** v3 F29 / lead decision 6: ring label step — round to 10 mm, at least 10 (6-inch pipe → 40 mm). */
  function ringStepMm(C) { return Math.max(10, Math.round((C > 0 ? C : 480) / 12 / 10) * 10); }
  /** v3 F29: the 12 ring labels anticlockwise from 12 o'clock ('0 mm', '40mm' … '440mm'). */
  function ringLabels(C) {
    const step = ringStepMm(C);
    const out = [];
    for (let k = 0; k < 12; k++) out.push(k === 0 ? '0 mm' : (k * step) + 'mm');
    return out;
  }
  /**
   * The red caption under the ring: the empty-slot prompt, the planar `LACK OF FUSION …` line (v3 F28) or the
   * verified v1 volumetric line.
   * @returns {string}
   */
  function editorStatusLine() {
    const d = selectedDefect();
    if (!d) return t('{p}  Defect Num {n}, DRAW DEFECT ON CROSS SECTION BELOW', { p: pendingPrefix(), n: selectedN() });
    if (PLANAR4[d.type]) {
      const b = S.bbox(d.pts);
      return PLANAR_LABEL[d.type] + '  Defect Angle ' + defectAngle(d) + '   Height=' + fmtHeight(d.height) + '   Top=' + b.yMin.toFixed(1);
    }
    const spec = st().specimen;
    const len = S.defectLength(d, spec);
    return (S.isPlanar(d.type) ? 'PLANAR' : 'VOL') + ' Defect ' + d.n + '  Height=' + M.fmt(d.height, 1) + 'mm Length=' + M.fmt(len, 0) + 'mm. From ' + Math.round(d.zFrom) + 'mm  To ' + Math.round(d.zTo) + 'mm';
  }
  /**
   * v3 F29: the selected defect's summary, drawn in red under the ring (drawing_defects_i f038):
   * `Defect Number 7.  Length=30mm.  From 320mm   To  350mm  Angle= 90  LOF`.
   * @returns {string} '' when the slot is empty
   */
  function editorSummaryLine() {
    const d = selectedDefect();
    if (!d) return '';
    const len = S.defectLength(d, st().specimen);
    let s = 'Defect Number ' + d.n + '.  Length=' + M.fmt(len, 0) + 'mm.  From ' + Math.round(d.zFrom) + 'mm   To  ' + Math.round(d.zTo) + 'mm';
    if (PLANAR4[d.type]) s += '  Angle= ' + defectAngle(d) + '  ' + SUMMARY_TYPE[d.type];
    return s;
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
    // v3 F29 / lead decision 6: the LABELS run at a round step (40 mm for the 6-inch pipe), the POSITIONS stay true
    const stepMm = ringStepMm(C);
    const labels = ringLabels(C);
    ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let k = 0; k < 12; k++) {
      const z = k * C / 12;
      const a = circlePt(geo, z, geo.r), b = circlePt(geo, z, geo.R);
      if (k > 0) { ctx.setLineDash([3, 3]); ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(geo.cx, geo.cy); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); }
      const l = circlePt(geo, z, geo.r - 22);
      ctx.fillText(labels[k], l.x, l.y);
      void a; void stepMm;
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(circleHeader(), o.w - 6, 4);
    ctx.textAlign = 'center'; ctx.fillText(depthLabel(), o.w / 2, 4);
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
    if (ui.edSummary) ui.edSummary.textContent = editorSummaryLine();
    if (ui.edHeader) ui.edHeader.textContent = circleHeader();
    if (ui.edDepth) ui.edDepth.textContent = depthLabel();
  }
  /**
   * v3 F29 / QA round 2: follow the pointer. A hover over the cross-section writes `state.cursor` with
   * {noRender: true} (V3-63's frame budget), so the 'render' subscription never fires and the editor's
   * `Depth =` cell went stale. The text cell is updated immediately from the 'state' event — like 90-app's
   * status cell — and the canvas repaint (the same cell drawn on #cv-circle) is coalesced into the next
   * animation frame so a fast drag still costs one draw per frame.
   */
  function editorCursorRefresh() {
    if (!editorWin || !editorWin.isOpen()) return;
    if (ui.edDepth) ui.edDepth.textContent = depthLabel();
    const w = typeof window !== 'undefined' ? window : null;
    if (!w || typeof w.requestAnimationFrame !== 'function') { drawEditorCanvas(); return; }
    if (depthRaf !== null) return;
    depthRaf = w.requestAnimationFrame(function () { depthRaf = null; drawEditorCanvas(); });
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
      // The fields mirror the selected defect, so anything the user typed for the previous slot is gone.
      ed.length = +S.defectLength(d, s.specimen).toFixed(1);
      ed.height = d.height;
      ed.typed = false;
      ui.fLength.input.value = ed.length;
      ui.fHeight.input.value = ed.height;
    } else if (!ed.typed) {
      // v3 QA round 1 / V3-29: an EMPTY slot draws with SPEC-v3 §5.5's defaults (30 mm long, 3 mm high) — the
      // length of a defect selected earlier must never become the length of the next freehand defect.
      ed.length = ED_DEFAULT.length;
      ed.height = ED_DEFAULT.height;
      ui.fLength.input.value = ed.length;
      ui.fHeight.input.value = ed.height;
    }
    // v3 F29: the Type control shows the DRAWING MODE (editing.brush), never the selected defect's type —
    // otherwise pressing OK silently retyped the defect and cleared autoType without the user touching it.
    if (EDITOR_TYPES.indexOf(s.editing.brush) >= 0) ui.fType.input.value = s.editing.brush;
    if (ui.fCount) ui.fCount.input.value = s.defects.length;                   // v3 F29: read-only count box
    if (ui.spotIn) ui.spotIn.value = M.clamp(+s.editing.spotMm || 5, 5, 45);   // v3 F29: spot spinner in mm
    drawEditorCanvas();
  }
  function applyEditorFields() {
    const s = st();
    const spec = s.specimen;
    const L = spec ? spec.L : 300;
    const len = Math.max(0.5, +ui.fLength.input.value || ed.length);
    const sep = Math.max(0, +ui.fSep.input.value || 0);
    const height = Math.max(0.2, +ui.fHeight.input.value || ed.height);
    const sel = ui.fType.input.value;
    ed.length = len; ed.separation = sep; ed.height = height; ed.applyAll = !!ui.fAll.input.checked;
    UT.setIn('editing', { brush: sel, autoType: sel === 'auto' }, { noRender: true, silent: true });
    let defects = sortByN(s.defects);
    if (!defects.length) return;
    // v3 F29: 'Auto (from stroke)' is a drawing mode, not a defect type — it never retypes what is already drawn
    const type = sel === 'auto' ? null : sel;
    if (ed.applyAll) {
      const z0 = defects[0].zFrom;
      defects = defects.map(function (d, i) {
        let zFrom = z0 + i * (len + sep), zTo = zFrom + len;
        if (spec && spec.pipe) { zFrom = ((zFrom % L) + L) % L; zTo = ((zTo % L) + L) % L; } else { zFrom = M.clamp(zFrom, 0, L); zTo = M.clamp(zTo, 0, L); }
        return scaleHeight(Object.assign({}, d, type ? { zFrom, zTo, type } : { zFrom, zTo }), height);
      });
    } else {
      defects = defects.map(function (d) {
        if (d.n !== selectedN()) return d;
        let zTo = d.zFrom + len;
        zTo = spec && spec.pipe ? ((zTo % L) + L) % L : M.clamp(zTo, 0, L);
        return scaleHeight(Object.assign({}, d, type ? { zTo, type } : { zTo }), height);
      });
    }
    UT.set({ defects });
  }
  /**
   * v3 F28: classify a free stroke as a single-line LOF or a volumetric blob.
   * §5.4's rule is `rms ≤ 0.6 mm AND aspect ≥ 4`; a stroke that is essentially PERFECTLY straight
   * (rms ≤ 0.05 × span, e.g. the two-point (6,4)→(10,9) of V3-28) is an LOF whatever its aspect.
   * @param {Array<{x:number,y:number}>} pts stroke in mm
   * @returns {'lof'|'volumetric'}
   */
  function classifyStroke(pts) {
    const fit = M.fitLine(pts);
    const b = S.bbox(pts);
    const span = Math.max(b.w, b.h);
    if (!fit || span < 1e-6) return 'volumetric';
    const aspect = span / Math.max(Math.min(b.w, b.h), 0.4);
    if (fit.rms <= 0.6 && aspect >= 4) return 'lof';
    if (fit.rms <= 0.05 * span && span >= 1) return 'lof';
    return 'volumetric';
  }
  /** v3 F26/F28: reduce a straight stroke to the 2 points of its fitted line (first and last, projected). */
  function twoPointLine(pts) {
    const fit = M.fitLine(pts);
    if (!fit) return pts.slice(0, 2);
    const proj = function (p) {
      const s = (p.x - fit.x0) * fit.ux + (p.y - fit.y0) * fit.uy;
      return { x: +(fit.x0 + s * fit.ux).toFixed(2), y: +(fit.y0 + s * fit.uy).toFixed(2) };
    };
    return [proj(pts[0]), proj(pts[pts.length - 1])];
  }
  /**
   * The blue draw region (F31) as 60-view-cross computes it, or null (no 60 / no weld / editor closed).
   * When that module is absent or carries no v3 helper an explicitly placed box (`display.drawRegion`) is still
   * honoured; with neither, the region stays unknown and onBrush() accepts the stroke rather than guess.
   * @returns {{x:number,y:number,w:number,h:number}|null} the region in mm
   */
  function drawRegion() {
    const c = has('views.cross');
    if (c) {
      try {
        if (typeof c.__drawRegion === 'function') return c.__drawRegion();
        if (typeof c.regionFor === 'function') return c.regionFor(st());
      } catch (e) { /* a view without the v3 helpers */ }
    }
    const s = st();
    const dr = s.display && s.display.drawRegion;
    if (dr && Number.isFinite(dr.x) && Number.isFinite(dr.y) && dr.w > 0 && dr.h > 0) {
      return { x: dr.x, y: dr.y, w: dr.w, h: dr.h };
    }
    return null;
  }
  /**
   * SPEC-v3 §5.7: a stroke that never enters the blue rectangle is ignored, with the F31 status hint. The test
   * lives HERE so the pointer path, UT.views.cross.brushStroke() and UT.test.editorBrush() all obey it (the
   * pointer path dilates its stroke by the brush radius before emitting, hence 'any point inside' rather than
   * 'the first point inside' — a stroke started inside always keeps points inside).
   * @param {Array<{x:number,y:number}>} pts stroke in mm
   * @returns {boolean} true when the stroke must be dropped
   */
  function outsideDrawRegion(pts) {
    const r = drawRegion();
    if (!r || !Array.isArray(pts) || !pts.length) return false;
    const hit = pts.some(function (p) { return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; });
    if (hit) return false;
    UT.status({ right: t(HINTS.drawRegion) });
    return true;
  }
  function onBrush(ev) {
    const s = st();
    if (!s.editing || !s.editing.defect || !ev || !Array.isArray(ev.pts) || !ev.pts.length) return;
    if (outsideDrawRegion(ev.pts)) return;
    // §14.3 brush only on welds, §15.8 trade lock; v3 F47 adds the TKY joint (the original places defects there)
    if (s.trade.active || (s.specimen && s.specimen.kind !== 'weld' && s.specimen.kind !== 'tky')) return;
    const n = selectedN();
    if (ev.erase || s.editing.erase) {
      const defects = [];
      for (const d of s.defects) {
        const pts = d.pts.filter(function (p) { return !ev.pts.some(function (q) { return M.dist(p.x, p.y, q.x, q.y) <= 2; }); });
        if (pts.length >= 2) defects.push(pts.length === d.pts.length ? d : S.makeDefect(Object.assign({}, d, { pts, height: undefined })));
      }
      UT.set({ defects });
      return;
    }
    const existing = slotDefect(s.defects, n);
    const spec = s.specimen;
    const zFrom = existing ? existing.zFrom : M.clamp((spec ? spec.L / 2 : 150) - ed.length / 2, 0, spec ? spec.L : 300);
    const zTo = existing ? existing.zTo : zFrom + ed.length;
    // ---- v3 F26 / F28 / F29: what the stroke means
    const box = S.bbox(ev.pts);
    const span = Math.max(box.w, box.h);
    const brush = s.editing.brush || 'planar';
    let pts = ev.pts, type = brush;
    if (ev.lof) {                                       // F26: a plain right-drag is a single-line LOF
      type = 'lof';
      if (ev.pts.length < 2) return;
      pts = twoPointLine(ev.pts);
    } else if (span < 1) {                              // F29: a near-stationary click paints a spot of spotMm
      const dia = M.clamp(+s.editing.spotMm || 5, 5, 45);
      type = (brush === 'auto' || PLANAR4[brush]) ? 'volumetric' : brush;
      pts = S.circlePts(+((box.xMin + box.xMax) / 2).toFixed(2), +((box.yMin + box.yMax) / 2).toFixed(2), dia / 2, 16);
    } else if (brush === 'auto') {                      // F28: infer the class from the stroke
      type = s.editing.autoType === false ? 'volumetric' : classifyStroke(ev.pts);
      if (type === 'lof') pts = twoPointLine(ev.pts);
    } else if (ev.pts.length < 2) return;
    const d = S.defectFromBrush(pts, type, { n, zFrom, zTo, label: 'Defect ' + n, id: existing ? existing.id : undefined });
    const defects = s.defects.filter(function (x) { return x.n !== n; }).concat([d]);
    UT.set({ defects: sortByN(defects) });
  }
  UT.bus.on('defect:brush', onBrush);
  UT.bus.on('render', function () { drawEditorCanvas(); });

  // ------------------------------------------------------------------ v3 F25: the STEP 1–5 instructions dialog
  // Verbatim from drawing_defects_ii f005, with the two browser adaptations of SPEC-v3 §5.1 (the right-click
  // menu note and the Alt/Ctrl erase sentence). One i18n key per paragraph (§10).
  const STEP_TEXT = [
    'STEP 1. Draw a defect in the weld CROSS SECTION within the BLUE BOX.\nDrawing is activated by mouse click and drag over the weld.\n     Use RIGHT mouse to draw single line LOF defect. (right-click menu suppressed)\n     Use LEFT mouse to draw volumetric defects.\n     Use Alt or Ctrl with the RIGHT mouse to erase.',
    'STEP 2. Draw the defect position on the circle-view (in the gray pipe side view)\n     Eight defect regions can be drawn.\n     Select a defect via the Option buttons.',
    'STEP 3. Defects can be moved by shifted right/left cursor key to create\nlaminations.',
    'STEP 4. Defect length and separation can set by entering values in the text\nboxes.',
    'STEP 5. Exit the draw-defect mode by clicking the OK button.',
    "To alter LOF defects use: SHIFT+ 'Z' or 'X' = Rotate, 'A' or 'S' = change size, 'Q'\nor 'W'",
    'All defects can be moved with: SHIFT+  LEFT or RIGHT cursor key',
    'Press F1 to redisplay these instructions',
  ];
  /**
   * v3 F25: show the STEP 1–5 dialog. Opens by itself the first time the editor is used in this browser
   * (localStorage `utsim.editorSteps`) and on every F1 while the editor is open; dismissing it never closes
   * the editor.
   * @param {boolean} [force] true = always show (F1), false/undefined = only on first use
   * @returns {object|null} the modal window api, or null when it was suppressed / headless
   */
  function showEditorSteps(force) {
    if (typeof document === 'undefined') return null;
    if (!force) {
      let seen = null;
      try { seen = localStorage.getItem('utsim.editorSteps'); } catch (e) { seen = null; }
      if (seen) return null;
    }
    try { localStorage.setItem('utsim.editorSteps', '1'); } catch (e) { /* private mode: shown every time */ }
    UT.dom.injectCss('modes', modes.css);
    const dom = UT.dom;
    const body = dom.h('div', { class: 'dsteps' },
      STEP_TEXT.map(function (p) { return dom.h('p', { class: 'dsteps-p', i18n: p }, t(p)); })
        .concat([dom.h('div', { class: 'btn-row dsteps-row' }, [dom.button('OK', function () { if (stepsWin) stepsWin.close(); }, { class: 'btn primary' })])]));
    if (stepsWin) stepsWin.setContent(body); else stepsWin = dom.win({ name: 'defect-steps', title: 'UTsim', modal: true, w: 470, x: 300, y: 90, content: body });
    stepsWin.show();
    return stepsWin;
  }

  // ------------------------------------------------------------------ v3 F27: keyboard defect manipulation
  function ptsCentroid(pts) {
    let x = 0, y = 0;
    for (const p of pts) { x += p.x; y += p.y; }
    return { x: x / pts.length, y: y / pts.length };
  }
  function ptsLength(pts) {
    let l = 0;
    for (let i = 1; i < pts.length; i++) l += M.dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    return l;
  }
  /** Replace the selected defect's points (rebuilt through makeDefect so height / width follow). */
  function transformSelected(fn) {
    const s = st(), n = selectedN();
    const d = slotDefect(s.defects, n);
    if (!d || !Array.isArray(d.pts) || d.pts.length < 2) return false;
    const pts = fn(d.pts, d);
    if (!pts) return false;
    const nd = S.makeDefect(Object.assign({}, d, { pts, height: undefined }));
    UT.set({ defects: sortByN(s.defects.filter(function (x) { return x.n !== n; }).concat([nd])) });
    return true;
  }
  /** Move the selected defect (or every defect with APPLY TO ALL ticked) along z, wrapping on pipes. */
  function moveDefectZ(dz) {
    const s = st(), spec = s.specimen;
    const L = spec && spec.L > 0 ? spec.L : 300, pipe = !!(spec && spec.pipe);
    const n = selectedN();
    const wrap = function (v) { return pipe ? ((v % L) + L) % L : M.clamp(v, 0, L); };
    const defects = s.defects.map(function (d) {
      if (!ed.applyAll && d.n !== n) return d;
      return Object.assign({}, d, { zFrom: +wrap(d.zFrom + dz).toFixed(1), zTo: +wrap(d.zTo + dz).toFixed(1) });
    });
    UT.set({ defects });
    return true;
  }
  /**
   * v3 F27 / §7: the editor's keyboard bindings, headless-callable.
   * SHIFT+←/→ move ∓1 mm (with Ctrl 10 mm), SHIFT+Z/X rotate ∓1°, SHIFT+A/S scale ÷/×1.05,
   * SHIFT+Q/W move the depth ∓0.5 mm, F1 reopens the STEP dialog, Delete removes the selected defect.
   * @param {string} key  a KeyboardEvent.key value ('ArrowRight', 'X', 'F1', 'Delete', …)
   * @param {{shift?:boolean, ctrl?:boolean, alt?:boolean}} [mods]
   * @returns {boolean} true when the key was consumed
   */
  function editorKey(key, mods) {
    const m = mods || {};
    const s = st();
    if (!s.editing || !s.editing.defect) return false;      // bindings live only while the editor is open
    const k = String(key === undefined ? '' : key);
    if (k === 'F1') { showEditorSteps(true); return true; }
    if (k === 'Delete') {
      const n = selectedN();
      if (!slotDefect(s.defects, n)) return false;
      UT.set({ defects: s.defects.filter(function (d) { return d.n !== n; }) });
      return true;
    }
    if (!m.shift) return false;
    if (k === 'ArrowLeft' || k === 'ArrowRight') return moveDefectZ((k === 'ArrowRight' ? 1 : -1) * (m.ctrl ? 10 : 1));
    const up = k.length === 1 ? k.toUpperCase() : k;
    const d = selectedDefect();
    if (!d) return false;
    if (up === 'Z' || up === 'X') {
      if (!PLANAR4[d.type]) return false;
      const th = (up === 'X' ? 1 : -1) * Math.PI / 180, co = Math.cos(th), si = Math.sin(th);
      return transformSelected(function (pts) {
        const c = ptsCentroid(pts);
        return pts.map(function (p) {
          const dx = p.x - c.x, dy = p.y - c.y;
          return { x: +(c.x + dx * co - dy * si).toFixed(3), y: +(c.y + dx * si + dy * co).toFixed(3) };
        });
      });
    }
    if (up === 'A' || up === 'S') {
      const k2 = up === 'S' ? 1.05 : 1 / 1.05;
      return transformSelected(function (pts) {
        const len = ptsLength(pts);
        if (len * k2 < 0.5 || len * k2 > 60) return null;
        const c = ptsCentroid(pts);
        return pts.map(function (p) { return { x: +(c.x + (p.x - c.x) * k2).toFixed(3), y: +(c.y + (p.y - c.y) * k2).toFixed(3) }; });
      });
    }
    if (up === 'Q' || up === 'W') {
      const dy = up === 'W' ? 0.5 : -0.5;
      const T = (s.specimen && s.specimen.T) || 25;
      return transformSelected(function (pts) {
        return pts.map(function (p) { return { x: p.x, y: +M.clamp(p.y + dy, -5, T + 5).toFixed(3) }; });
      });
    }
    return false;
  }
  function installEditorKeys() {
    if (editorKeyHandler || typeof document === 'undefined') return;
    editorKeyHandler = function (e) {
      const tg = e.target;
      if (tg && tg.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
      if (editorKey(e.key, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey })) e.preventDefault();
    };
    document.addEventListener('keydown', editorKeyHandler);
  }
  function removeEditorKeys() {
    if (!editorKeyHandler || typeof document === 'undefined') return;
    document.removeEventListener('keydown', editorKeyHandler);
    editorKeyHandler = null;
  }

  // ------------------------------------------------------------------ v3 F34: Load Def / Save Def as real files
  function fileStamp() {
    const d = new Date();
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  /**
   * v3 F34: write the current defects as a `.json` download (Blob + object URL, revoked after the click) and
   * keep the localStorage / textarea fallbacks. No network is involved. SPEC-v3 §6.5 F54 mentions a
   * `UT.dom.download` helper; 00-core has never exported one, so the anchor click here IS the download path.
   * @returns {{name:string, text:string, url:(string|null)}}
   */
  function saveDefFile() {
    const text = JSON.stringify(st().defects);
    const name = 'utsim-defects-' + fileStamp() + '.json';
    try { localStorage.setItem('utsim.defects', text); } catch (e) { /* ignore */ }
    if (ui.jsonArea) { ui.jsonArea.value = text; ui.jsonArea.style.display = 'block'; }
    let url = null;
    // one <a download> click on an object URL — no UT.dom.download helper exists (see the SPEC NOTES)
    if (typeof document !== 'undefined' && typeof Blob === 'function' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = UT.dom.h('a', { href: url, download: name, style: { display: 'none' } });
        (document.body || document.documentElement).appendChild(a);
        a.click();
        const href = url;
        setTimeout(function () { try { URL.revokeObjectURL(href); } catch (e) { /* ignore */ } if (a.parentNode) a.parentNode.removeChild(a); }, 0);
      } catch (e) { url = null; }
    }
    UT.status({ right: 'Defects saved' });
    return { name, text, url };
  }
  /**
   * v3 F34: apply a defect file. With a JSON string it is applied straight away; with nothing it opens
   * `UT.dom.fileOpen('.json,application/json')` and resolves with the applied array. A malformed file
   * changes nothing and reports `Could not read that file`.
   * @param {string} [text] the file's contents
   * @returns {Array|Promise<Array|null>|null}
   */
  function loadDefFile(text) {
    if (typeof text === 'string') {
      let arr = null;
      try { arr = JSON.parse(text); } catch (e) { arr = null; }
      if (!Array.isArray(arr)) { UT.status({ right: 'Could not read that file' }); return null; }
      try { setDefects(arr); } catch (e) { UT.status({ right: 'Could not read that file' }); return null; }
      if (ui.jsonArea) { ui.jsonArea.value = text; ui.jsonArea.style.display = 'block'; }
      UT.status({ right: 'Defects loaded' });
      return st().defects;
    }
    const fo = has('dom.fileOpen');
    if (typeof fo !== 'function') { UT.status({ right: 'Could not read that file' }); return null; }
    return UT.dom.fileOpen('.json,application/json', { text: true })
      .then(function (f) { return f ? loadDefFile(String(f.text || '')) : null; })
      .catch(function () { UT.status({ right: 'Could not read that file' }); return null; });
  }

  function buildEditor() {
    const dom = UT.dom;
    // left column
    ui.delN = dom.button('Delete Defect 1', function () {
      const n = selectedN();
      UT.set({ defects: st().defects.filter(function (d) { return d.n !== n; }) });
    }, { class: 'btn dfe-btn' });
    // v3 F29: the spot spinner is in MILLIMETRES (5…45, default 5) and drives editing.spotMm
    const brushIn = (ui.spotIn = dom.h('input', { type: 'number', min: 5, max: 45, step: 1, value: M.clamp(+st().editing.spotMm || 5, 5, 45), class: 'dfe-brush', 'aria-label': 'Spot size (mm)' }));
    const dot = dom.h('span', { class: 'dfe-dot', style: { width: '10px', height: '10px' } });
    const sizeDot = function (mm) {
      const px = has('views.cross.toPx') ? 0 : 0;   // the cross view's mm→px is per-frame; 2 px/mm is the editor's preview scale
      void px;
      const d = Math.max(6, Math.round(mm * 2));
      dot.style.width = dot.style.height = d + 'px';
    };
    sizeDot(M.clamp(+st().editing.spotMm || 5, 5, 45));
    brushIn.addEventListener('input', function () {
      const mm = M.clamp(+brushIn.value || 5, 5, 45);
      sizeDot(mm);
      UT.setIn('editing', { spotMm: mm }, { noRender: true });
    });
    ui.jsonArea = dom.h('textarea', { class: 'dfe-json', rows: 4, spellcheck: 'false', 'aria-label': t('Defect JSON'), placeholder: 'Defect JSON (Save Def writes here; paste here and press Load Def)' });
    ui.jsonArea.style.display = 'none';
    const presetSel = (ui.presetSel = dom.h('select', { class: 'dfe-preset', 'aria-label': 'Defect preset' }, S.defectPresetNames.map(function (p) { return dom.h('option', { value: p.key, dataset: { i18n: p.label } }, t(p.label)); })));
    const left = dom.h('div', { class: 'dfe-left' }, [
      dom.button('Delete All Defects', function () {
        dom.confirm('Delete all defects?', { title: 'ERASE ALL DEFECTS' }).then(function (yes) { if (yes) UT.set({ defects: [] }); });
      }, { class: 'btn dfe-btn' }),
      ui.delN,
      dom.h('div', { class: 'dfe-brushrow', title: 'Spot size (mm)' }, [brushIn, dot]),
      // v3 F26: an explicit Eraser toggle does with the LEFT button what Alt/Ctrl + right-drag does
      (ui.eraseBtn = dom.button('Erase', function () {
        const on = !st().editing.erase;
        UT.setIn('editing', { erase: on }, { noRender: true });
        ui.eraseBtn.classList.toggle('active', on);
        ui.eraseBtn.setAttribute('aria-pressed', String(on));   // the .active class alone is invisible to assistive tech
        UT.status({ right: on ? 'Eraser: drag over a defect to remove its points' : HINTS.editor });
      }, { class: 'btn dfe-btn', 'aria-pressed': 'false' })),
      // v3 F34: real files, with the browser-storage / textarea fallbacks kept
      (ui.storeChk = dom.field('Browser storage', { type: 'checkbox', value: false, title: 'Load / Save through localStorage instead of a file' })),
      dom.button('Load Def', function () {
        if (ui.storeChk.input.checked) {
          let txt = ui.jsonArea.value.trim();
          if (!txt) { try { txt = localStorage.getItem('utsim.defects') || ''; } catch (e) { txt = ''; } }
          if (!txt) { UT.status({ right: 'No saved defects (utsim.defects)' }); return; }
          loadDefFile(txt);
          return;
        }
        loadDefFile();
      }, { class: 'btn dfe-btn' }),
      dom.button('Save Def', function () { saveDefFile(); }, { class: 'btn dfe-btn' }),
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
    // v3 F29: the circle panel carries the Depth label and the summary line. The `Circle-View. Position {z}mm`
    // header is painted ON #cv-circle by 62-view-plan (SPEC-v3 §1 ownership) — a DOM copy here drew it twice.
    ui.edHeader = null;
    ui.edDepth = dom.h('div', { class: 'dfe-depth' }, depthLabel());
    ui.edSummary = dom.h('div', { class: 'dfe-status dfe-summary' }, '');
    const mid = dom.h('div', { class: 'dfe-mid' }, [
      dom.h('div', { class: 'dfe-toprow' }, [ui.edDepth]),
      ui.circle, ui.edStatus, ui.edSummary,
    ]);
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
    // v3 QA round 1: a typed LENGTH / HEIGHT wins over the ED_DEFAULT restore an empty slot performs, and takes
    // effect on the next stroke (not only on OK) — the original's fields govern what the next defect becomes.
    [['fLength', 'length'], ['fHeight', 'height']].forEach(function (pair) {
      const f = ui[pair[0]];
      f.input.addEventListener('input', function () {
        const v = +f.input.value;
        if (Number.isFinite(v) && v > 0) { ed[pair[1]] = v; ed.typed = true; }
      });
    });
    // v3 F29: 'Auto (from stroke)' heads the Type list; picking an explicit type clears editing.autoType
    ui.fType = dom.field('Type', { tag: 'select', type: 'select', value: st().editing.brush || 'auto', options: EDITOR_TYPES.map(function (k) { return { value: k, label: t(TYPE_LABELS[k] || k) }; }), onchange: function (v) { UT.setIn('editing', { brush: v, autoType: v === 'auto' }, { noRender: true }); editorRefresh(); } });
    ui.fAll = dom.field('APPLY TO ALL DEFECTS', { type: 'checkbox', value: false });
    // v3 F29: the read-only count box beside the Delete buttons (drawing_defects_ii f030)
    ui.fCount = dom.field('Defects', { type: 'number', value: 0, attrs: { readonly: 'readonly', tabindex: '-1' } });
    const right = dom.h('div', { class: 'dfe-right' }, [
      dom.h('fieldset', { class: 'dfe-select' }, [dom.h('legend', { i18n: 'Select Defect' })].concat(radioRows)),
      ui.fSep, ui.fLength, ui.fHeight, ui.fType, ui.fAll, ui.fCount,
      dom.button('OK', function () { applyEditorFields(); defectEditor.close(); }, { class: 'btn dfe-ok' }),
    ]);
    const body = dom.h('div', { class: 'dfe' }, [dom.h('div', { class: 'dfe-row' }, [left, mid, right]), ui.jsonArea]);
    editorWin = dom.win({
      name: 'defects', title: 'Defects', x: 380, y: 104, w: 900, content: body,
      onClose: function () { defectEditor._closed(); },
    });
    return editorWin;
  }
  // v3 F30: the modal modes the editor overlays and returns to when it closes
  const RETURN_MODES = { tofd: 1, aut: 1, tky: 1, iow: 1, dac: 1, lamination: 1, trade: 1 };
  /** v3 F47: the one-time TKY placement modal (tky f0xx: 'Click the DEFECT button to resume UT.'). */
  function tkyDefectModal() {
    if (typeof document === 'undefined' || tkyDefectWin) return tkyDefectWin;
    const dom = UT.dom;
    tkyDefectWin = dom.win({
      name: 'tkydefect', title: 'UTsim', modal: true, w: 380, x: 400, y: 200,
      content: dom.h('div', { class: 'confirm-body' }, [
        dom.h('div', { class: 'alert-msg', i18n: 'Use LEFT mouse button to place the DEFECT on the joint.' }, t('Use LEFT mouse button to place the DEFECT on the joint.')),
        dom.h('div', { class: 'alert-msg', i18n: 'Click the DEFECT button to resume UT.' }, t('Click the DEFECT button to resume UT.')),
        dom.h('div', { class: 'btn-row' }, [dom.button('OK', function () { if (tkyDefectWin) tkyDefectWin.close(); }, { class: 'btn primary' })]),
      ]),
    });
    tkyDefectWin.show();
    return tkyDefectWin;
  }
  const defectEditor = {
    /** Open the defect editor: enables the cross-section brush (state.editing.defect = true). */
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      if (!editorWin) buildEditor();
      if ((st().mode === 'trade' && st().trade.active) || examLocked()) { UT.status({ right: 'Defect editor is locked during the Trade Test' }); return null; }
      // v3 F29: the editor opens in 'Auto (from stroke)' so the first left-drag makes a VOL defect
      // v3 §5.5: and on the default 30 mm / 3 mm field values — never on the numbers a previous session left
      // v3 F30: remember the modal mode this was opened from, to re-enter it on close
      resetEditorFields();
      const mode = st().mode;
      UT.setIn('editing', { defect: true, brush: 'auto', autoType: true, erase: false, spotMm: M.clamp(+st().editing.spotMm || 5, 5, 45), returnMode: RETURN_MODES[mode] ? mode : null });
      editorWin.show();
      editorRefresh();
      installEditorKeys();                     // v3 F27: bindings live only while the window is open
      showEditorSteps(false);                  // v3 F25: STEP 1–5 on first use
      if (mode === 'tky') tkyDefectModal();    // v3 F47
      UT.status({ right: HINTS.editor });
      return editorWin;
    },
    close() { if (editorWin && editorWin.isOpen()) editorWin.close(); else defectEditor._closed(); },
    toggle() { return editorWin && editorWin.isOpen() ? defectEditor.close() : defectEditor.open(); },
    _closed() {
      removeEditorKeys();
      // v3 F25/F30: the modal helper dialogs belong to the EDITOR SESSION — closing the editor (OK, ✕ or a
      // second DEFECT press) must take them down, or their backdrop outlives the editor and swallows every click.
      if (stepsWin && stepsWin.isOpen()) stepsWin.close();
      if (tkyDefectWin && tkyDefectWin.isOpen()) tkyDefectWin.close();
      const back = st().editing.returnMode;
      if (st().editing.defect || back) UT.setIn('editing', { defect: false, erase: false, returnMode: null });
      // v3 F30: STEP 5 — OK returns to the modal mode the editor was opened over (tofd / tky / … )
      if (back && !editorClosing && st().mode !== back) {
        editorClosing = true;
        try { enter(back, { keepProbe: true }); } catch (e) { console.error('[UT.modes] editor return', e); }
        finally { editorClosing = false; }
        return;
      }
      UT.status({ right: hintFor(st().mode) });
    },
    isOpen() { return !!(editorWin && editorWin.isOpen()); },
    /** v3 F25: (re)show the STEP 1–5 instructions dialog (F1). */
    steps() { return showEditorSteps(true); },
    /** v3 F34: write the current defects to a .json download. @returns {{name:string,text:string,url:(string|null)}} */
    saveFile: saveDefFile,
    /** v3 F34: apply a defect file (JSON text, or the file picker when called with no argument). */
    loadFile: loadDefFile,
    get window() { return editorWin; },
    fields: ed,
  };

  // ------------------------------------------------------------------ trade test (§8.12, §15.8; v2 engine in 84-trade)
  // The trade engine, its windows and the random practice live in 84-trade.js (always loaded, index.html). This file
  // keeps the v1 status clock, the exam-lock rule (SPEC-v2 §4.2.3) and the late-bound delegates of SPEC-v2 §1 (2)(3);
  // the delegates fail loudly (Error '[UT.modes] 84-trade.js is not loaded …') instead of running a second engine.
  /** Remaining time of the running trade test as mm:ss for the v1 status line ('TRADE TEST 59:58'). */
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
  /** True while a shared exam is locked (truth hidden, editor / HIDE / BEAM disabled) — SPEC-v2 §4.2.3. */
  function examLocked(state) {
    const tr = (state || st()).trade;
    return !!(tr && tr.exam && tr.exam.locked && !tr.revealed);
  }
  /** Error thrown by a delegate whose owner module (82 / 84) is not loaded. */
  function missingModule(file, what) { return new Error('[UT.modes] ' + file + ' is not loaded: ' + what + ' is unavailable'); }
  /** UT.trade (84) or a clear error. */
  function tradeEngine() { const e = has('trade'); if (e && typeof e.start === 'function') return e; throw missingModule('84-trade.js', 'the Trade Test engine (UT.trade)'); }
  /** Late-bound trade engine (SPEC-v2 §1 (3)): start / truth / submit / reveal delegate to UT.trade. */
  const trade = {
    /** Start a trade test with hidden seeded defects → truth rows ([] while an exam is locked). */
    start(seed) { return tradeEngine().start(seed); },
    /** Hidden truth rows [{n, zFrom, zTo, depth, height, type, …}] ([] while a shared exam is locked, §4.2.3). */
    truth() { if (examLocked()) return []; return tradeEngine().truth(); },
    /** Score the report rows [{n, z, length, depth, height, type}] → 0..100. */
    submit(rows) { return tradeEngine().submit(rows); },
    /** Reveal the hidden defects (exams need the code). */
    reveal(code) { return tradeEngine().reveal(code); },
  };
  /** UT.trade.practice (84) or a clear error. */
  function practiceEngine() { const e = has('trade.practice'); if (e && typeof e.start === 'function') return e; throw missingModule('84-trade.js', 'Random practice (UT.trade.practice)'); }
  /** Random practice entry (T5): delegates to UT.trade.practice / UT.trade.practiceWindow. */
  const practice = {
    /** Start a practice run (no timer, no lock). Returns the truth rows. */
    start(seed) { return practiceEngine().start(seed); },
    hint() { return practiceEngine().hint(); },
    revealOne() { return practiceEngine().revealOne(); },
    checkRow(i, row) { return practiceEngine().checkRow(i, row); },
    /** Open the practice window (84). */
    open() { const w = has('trade.practiceWindow'); if (w && typeof (w.open || w.show) === 'function') return (w.open || w.show).call(w); throw missingModule('84-trade.js', 'the Random practice window (UT.trade.practiceWindow)'); },
    toggle() { const w = has('trade.practiceWindow'); if (w && typeof w.toggle === 'function') return w.toggle(); return practice.open(); },
  };
  /** Owner window of the trade test (84): {open/show, close/hide, toggle, isOpen, win} or a clear error. */
  function tradeOwnerWin() { const w = has('trade.window'); if (w && typeof w === 'object') return w; throw missingModule('84-trade.js', 'the Trade Test window (UT.trade.window)'); }
  /**
   * Late-bound Trade Test window (SPEC-v2 §1 (2)): delegates to UT.trade.window (84) and NEVER creates a dom.win
   * 'trade' of its own. isOpen() / window are non-throwing (menu check marks).
   */
  const tradeTest = {
    open() { const w = tradeOwnerWin(); return (w.open || w.show).call(w); },
    close() { const w = tradeOwnerWin(); return (w.close || w.hide).call(w); },
    toggle() { const w = tradeOwnerWin(); return w.toggle ? w.toggle() : (w.isOpen && w.isOpen() ? tradeTest.close() : tradeTest.open()); },
    isOpen() { const w = has('trade.window'); return !!(w && typeof w.isOpen === 'function' && w.isOpen()); },
    get window() { const w = has('trade.window'); return w ? (w.win || w) : null; },
  };

  // ------------------------------------------------------------------ TKY panel (§14.9)
  /** Tooltips of the Plate / T-joint / Pipe buttons (i18n; refreshed on 'lang' — the labels relabel via data-i18n). */
  function tkyKindTitles() {
    const TIP = {
      Plate: 'Plate chord: the flat chord of the v1 / v2 T-joint',
      'T-joint': 'T-joint: curved chord of the given diameter with an angled brace',
      Pipe: 'Pipe: the complete ring, scanned on the OD',
    };
    (ui.tkyKind || []).forEach(function (b) { b.title = t(TIP[b.dataset.kind] || b.dataset.kind); });
  }
  UT.bus.on('lang', tkyKindTitles);
  /** 'lang': re-render the DAC window's parametrised lines and the defect editor's <select> option labels (SPEC-v2 §5.3.3/5). */
  UT.bus.on('lang', function () {
    if (typeof document === 'undefined') return;
    try {
      if (ui.fType) for (const o of Array.from(ui.fType.input.options)) o.textContent = t(TYPE_LABELS[o.value] || o.value);
      if (ui.presetSel) for (const o of Array.from(ui.presetSel.options)) o.textContent = t(o.dataset.i18n || o.value);
      dacRefresh();
      editorRefresh();
    } catch (e) { console.error('[UT.modes] lang', e); }
  });
  /**
   * v3 F46: apply a TKY configuration patch (kind / brace / chord / diameter / wall) and rebuild the joint.
   * @param {object} patch partial tkyOpts
   */
  function tkyApply(patch) {
    const o = setTkyOpts(patch || {});
    if (st().mode !== 'tky') enter('tky', { specimenOpts: Object.assign({}, o) });
    else rebuild(Object.assign({}, o));
    tkyRefresh();
  }
  function tkyRefresh() {
    if (!tkyWin || !ui.tkySlider) return;
    const o = tkyOpts();
    ui.tkySlider.value = o.braceAngle;
    ui.tkySlider.step = o.precision;
    ui.tkyLabel.textContent = t('Brace angle = {a}°', { a: o.braceAngle });
    ui.tkyKind.forEach(function (b) { b.classList.toggle('active', b.dataset.kind === o.kind); });
    ui.tkyPrec.classList.toggle('active', o.precision !== 1);
    ui.tkyPrec.textContent = t('Precision {p}', { p: o.precision === 1 ? '1°' : '0.1°' });
    ui.fBraceT.input.value = o.braceT; ui.fChordT.input.value = o.chordT; ui.fOffset.input.value = o.braceOffset;
    if (ui.fChordOd) ui.fChordOd.input.value = o.chordOd;
    if (ui.fChordWt) ui.fChordWt.input.value = o.chordWt;
  }
  /** The #app box in DESIGN px — dom.win positions inside it, not in viewport px (90-app's design-box scaling). */
  function designBox() {
    if (typeof document === 'undefined') return { w: 1280, h: 760 };
    const app = document.getElementById('app');
    return { w: (app && app.offsetWidth) || 1280, h: (app && app.offsetHeight) || 760 };
  }
  /**
   * An element's rect in DESIGN px relative to #app (its screen rect divided by the layout scale k).
   * @param {string} id element id
   * @returns {{x:number, y:number, w:number, h:number}|null} null when the element is absent or hidden
   */
  function designRect(id) {
    if (typeof document === 'undefined') return null;
    const app = document.getElementById('app'), el = document.getElementById(id);
    if (!app || !el || typeof el.getBoundingClientRect !== 'function') return null;
    const k = (UT.dom && typeof UT.dom.scale === 'function' && UT.dom.scale()) || 1;
    const a = app.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0 && k > 0)) return null;
    return { x: (r.left - a.left) / k, y: (r.top - a.top) / k, w: r.width / k, h: r.height / k };
  }
  /**
   * v3 F47: the ADJUST MODE panel's default position, in design px. The joint is drawn with the chord
   * sweeping up to the right and the probe sitting on it beside the brace toe (tky f012), so the free area
   * is BELOW the chord on the right: the panel is bottom-aligned to the section and pushed clear of the
   * upper half where the probe, the toe and the CHORD label live. Computed from the #app design box (never
   * window.innerWidth: the box is scaled, so viewport px would place the panel in the wrong unit).
   * @param {number} w panel width (design px)
   * @param {number} h panel height (design px)
   * @returns {{x:number, y:number}} left / top for dom.win
   */
  function tkyPanelPos(w, h) {
    const box = designBox();
    const cr = designRect('cv-cross');
    const W = w > 0 ? w : 300, H = h > 0 ? h : 330;
    let x = cr ? cr.x + cr.w - W - 10 : box.w - W - 16;
    let y = (cr ? Math.min(box.h - 8, cr.y + cr.h) : box.h - 38) - H;
    if (cr) y = Math.max(y, cr.y + 0.45 * cr.h);            // never over the probe / toe band on the chord
    x = M.clamp(Math.round(x), 8, Math.max(8, box.w - W - 8));
    y = M.clamp(Math.round(y), 106, Math.max(106, box.h - H - 8));
    return { x, y };
  }
  const tkyPanel = {
    open() {
      if (typeof document === 'undefined') return null;
      UT.dom.injectCss('modes', modes.css);
      const dom = UT.dom;
      if (!tkyWin) {
        ui.tkyLabel = dom.h('div', { class: 'tky-label' }, 'Brace angle = 60°');
        ui.tkySlider = dom.h('input', { type: 'range', min: 30, max: 90, step: 1, value: 60, class: 'tky-slider', 'aria-label': 'Brace angle (degrees)' });
        ui.tkySlider.addEventListener('input', function () { tkyApply({ braceAngle: +(+ui.tkySlider.value).toFixed(1) }); });
        // v3 F46: all three chords are real now — Plate (flat), T-joint (curved chord) and Pipe (complete ring)
        ui.tkyKind = TKY_KINDS.map(function (k) {
          return dom.button(k, function () { tkyApply({ kind: k }); }, { class: 'btn tky-kind', dataset: { kind: k } });
        });
        tkyKindTitles();
        ui.tkyPrec = dom.button('Precision 1°', function () { tkyApply({ precision: tkyOpts().precision === 1 ? 0.1 : 1 }); }, { class: 'btn tky-btn' });
        ui.fBraceT = dom.field('Brace T (mm)', { type: 'number', value: 12, min: 4, max: 60, step: 1, onchange: function (v) { if (v > 0) tkyApply({ braceT: v }); } });
        ui.fChordT = dom.field('Chord T (mm)', { type: 'number', value: 20, min: 6, max: 100, step: 1, onchange: function (v) { if (v > 0) tkyApply({ chordT: v }); } });
        ui.fOffset = dom.field('Brace offset (mm)', { type: 'number', value: 0, min: -60, max: 60, step: 1, onchange: function (v) { if (Number.isFinite(v)) tkyApply({ braceOffset: v }); } });
        // v3 F46/F47: the chord's diameter and wall — the video's 'Diameter=600  W/T=32mm'
        ui.fChordOd = dom.field('OD (mm)', { type: 'number', value: TKY_DEFAULT.chordOd, min: 100, max: 2000, step: 10, onchange: function (v) { if (v > 0) tkyApply({ chordOd: v }); } });
        ui.fChordWt = dom.field('Wall thickness WT', { type: 'number', value: TKY_DEFAULT.chordWt, min: 6, max: 60, step: 1, onchange: function (v) { if (v > 0) tkyApply({ chordWt: v }); } });
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
              UT.status({ right: 'Default toe LOF loaded (20 mm long under the toe weld)' });
            }, { class: 'btn tky-btn' }),
          ]),
          ui.fBraceT, ui.fChordT, ui.fOffset, ui.fChordOd, ui.fChordWt,
        ]);
        // v3 F47: the panel sits BELOW the drawn chord (bottom-right of the section), so it never covers the
        // probe, the weld toe or the CHORD label at 1280 × 760 — the real height is measured on first show.
        const p0 = tkyPanelPos(300, 330);
        tkyWin = dom.win({ name: 'tky', title: 'ADJUST MODE', x: p0.x, y: p0.y, w: 300, content: body, onClose: function () { if (st().mode === 'tky') exit(); } });
      }
      tkyWin.show();
      if (!tkyPlaced && tkyWin.el && tkyWin.el.offsetHeight) {
        tkyPlaced = true;                                    // measured once; a window the user has dragged stays put
        const p = tkyPanelPos(tkyWin.el.offsetWidth, tkyWin.el.offsetHeight);
        tkyWin.el.style.left = p.x + 'px';
        tkyWin.el.style.top = p.y + 'px';
      }
      tkyRefresh();
      return tkyWin;
    },
    close() { if (tkyWin) tkyWin.hide(); },
    toggle() { return tkyWin && tkyWin.isOpen() ? tkyPanel.close() : tkyPanel.open(); },
    get window() { return tkyWin; },
    /** v3 F46: the live configuration (state.tkyOpts over the §14.9 defaults). */
    get opts() { return tkyOpts(); },
    apply: tkyApply,
    refresh: tkyRefresh,
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
  /** Owner window of the v2 lessons (82) or a clear error. */
  function lessonsOwnerWin() { const w = has('lessons.window'); if (w && typeof w === 'object') return w; throw missingModule('82-lessons.js', 'the Lessons window (UT.lessons.window)'); }
  /**
   * Late-bound Lessons window (SPEC-v2 §1 (2)): UT.lessons.window.show() (82) — this file never creates a dom.win
   * 'lessons'. load(i) → UT.lessons.start(i + 1) (0-based i, returns the lesson record). isOpen() / window are non-throwing.
   */
  const lessonsWindow = {
    open() { const w = lessonsOwnerWin(); return (w.show || w.open).call(w); },
    close() { const w = lessonsOwnerWin(); return (w.hide || w.close).call(w); },
    toggle() { const w = lessonsOwnerWin(); return w.toggle ? w.toggle() : (w.isOpen && w.isOpen() ? lessonsWindow.close() : lessonsWindow.open()); },
    isOpen() { const w = has('lessons.window'); return !!(w && typeof w.isOpen === 'function' && w.isOpen()); },
    /** Load lesson i (0-based) through UT.lessons.start(i + 1). Returns the lesson record. */
    load(i) { if (!has('lessons.start')) throw missingModule('82-lessons.js', 'lesson loading (UT.lessons.start)'); UT.lessons.start(i + 1); return modes.lessons[i] || null; },
    get window() { const w = has('lessons.window'); return w ? (w.win || w) : null; },
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
    // v3: F45 weld conditions, F46 TKY chord
    misalignmentMm: [-5, 5], wtVariationMm: [0, 4], chordOd: [100, 2000], chordWt: [6, 60],
  };
  const OPT_ENUMS = {
    type: ['single-v', 'double-v', 'none', 'fillet'], face: ['wide', 'narrow'],
    prep: PREPS, weldMaterial: ['same', 'austenitic'],
    material: Object.keys(S.materials || { carbon: 1 }),
    kind: TKY_KINDS,                                   // v3 F46
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
      // v3 F12: the step wedge's thickness list must survive (order preserved — the 20→8 mm preset is descending)
      else if (k === 'steps' && Array.isArray(v)) {
        const list = v.map(function (n) { return typeof n === 'string' ? +n : n; }).filter(function (n) { return Number.isFinite(n) && n > 0; }).map(function (n) { return M.clamp(n, 1, 200); });
        if (list.length >= 2) out.steps = list.slice(0, 12);
      }
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
    } else if (mode === 'scale') {
      scaleSpecId = id === 'okDemo' ? 'ok-demo' : id;    // v3 F41/F53: 85-scalemode owns the mode itself
      enter('scale', { specimenOpts: Object.assign({ id: scaleSpecId }, o), silentUI: true });
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
    /** enterMode(name, opts) → the mode's status hint — enter one of MODES ('weld' | 'v1' | 'v2' | 'step' | 'iow' | 'dac' | 'tky' | 'tofd' | 'aut' | 'trade' | 'lamination' | 'fbh'); THROWS on an unknown name; opts {keepProbe, silentUI}; @see enter(). */
    enterMode: enter,
    /** lessons() → string[] of lesson titles — 82-lessons overwrites this member with its own 25-title getter when it loads (SPEC-v2 §1 (3)). */
    lessons() { return modes.lessons.map(function (l) { return l.title; }); },
    // SPEC-v2 §7: test helpers are state helpers + renderNow, so UT.frame is current when the call returns
    /** setMaterial(key) → boolean — set state.material and re-enter the current mode keeping the probe; false for an unknown key; @see setMaterial(). */
    setMaterial(key) { const r = setMaterial(key); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    // §1 (3): late-binding shell — 84-trade extends it with Object.assign(UT.test.trade, {...})
    /** trade = {start(seed) → truth rows, truth() → truth rows, submit(rows) → score, practice:{start(seed)}} — delegates to UT.trade once 84-trade has loaded, else to 80's own shell. */
    trade: {
      start(seed) { return (UT.trade || trade).start(seed); },
      truth() { return (UT.trade || trade).truth(); },
      submit(rows) { return (UT.trade || trade).submit(rows); },
      practice: { start(seed) { return practice.start(seed); } },
    },
    // ---- v3 §7
    /** turnProbe() → the new probe.side — flip the probe on the V1 / V2 oblique screen (F9). */
    turnProbe() { const r = turnProbe(); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    /** autocal = {start, field(mm), confirm, cancel, state} — the F2/F3/F4 wizard (namespace created here). */
    autocal: {
      /** Start the wizard on the current specimen ({d1, d2} overrides the standards); @see UT.modes.autoCal.start(). */
      start(opts) { const r = autoCal.start(opts); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
      /** Write the on-LCD entry field (mm) → the stored value. */
      field(mm) { return autoCal.setField(mm); },
      /** Confirm the current stage (CAL / ENTER) → the wizard state or the new cal. */
      confirm() { const r = autoCal.confirm(); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
      /** Abort the wizard. */
      cancel() { return autoCal.cancel(); },
      /** state() → {stage, field, d1, d2, source, entered, rangeAfter, caption}. */
      state() { return autoCal.info(); },
    },
    /** weldCondition(patch) → the new weldOpts — the four F45 condition flags. */
    weldCondition(patch) { const r = weldCondition(patch); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    /** skips(v) → the effective skip count; 0.5 steps, null = 'Run to UT Screen Range' (F17). */
    skips(v) { const r = setSkips(v); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    /** editorKey(key, mods) → boolean — the editor's keyboard bindings (F27); @see UT.modes.editorKey(). */
    editorKey(key, mods) { const r = editorKey(key, mods); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    /**
     * editorBrush(pts, {button, alt, ctrl}) → the selected defect — drive the cross-section brush headlessly
     * (F26/F28). Obeys the F31 draw region exactly as the pointer path and UT.views.cross.brushStroke() do:
     * a stroke outside the blue box is refused (null) with the F31 hint. The stroke is NOT dilated by the
     * brush radius, so the caller's mm points are the defect's points.
     */
    editorBrush(pts, o) {
      const q = o || {};
      const right = q.button === 2;
      const erase = right && !!(q.alt || q.ctrl);
      if (outsideDrawRegion(pts)) { try { UT.renderNow(); } catch (e) { /* logged by core */ } return null; }
      onBrush({ pts, erase, lof: right && !erase, brushMm: st().editing.spotMm });
      try { UT.renderNow(); } catch (e) { /* logged by core */ }
      return selectedDefect();
    },
    /** hideKey(code) → boolean — arm the HIDE lock, or unlock and un-hide with the right code (F33). */
    hideKey(code) { const r = hideKey(code); try { UT.renderNow(); } catch (e) { /* logged by core */ } return r; },
    /** defectCaption() → the live red editor caption (F28/F29). */
    defectCaption() { return editorStatusLine(); },
    /** defectSummary() → the ring summary line (F29). */
    defectSummary() { return editorSummaryLine(); },
    /** tkyConfig({kind, chordOd, chordWt, braceAngle}) → the rebuilt spec.tky (F46). */
    tkyConfig(o) { tkyApply(o || {}); try { UT.renderNow(); } catch (e) { /* logged by core */ } return st().specimen && st().specimen.tky; },
  });

  // ------------------------------------------------------------------ CSS
  const css = [
    '.win[data-win=defects] .win-body{padding:4px;background:#ececec}',
    '.dfe-row{display:flex;gap:6px;align-items:flex-start}',
    '.dfe-left{display:flex;flex-direction:column;gap:4px;width:132px}',
    // v3 F34: the left column's captions ('Browser storage', 'Delete All Defects') must be readable, so the
    // 150 px fixed label of style.css wraps and shrinks here instead of being clipped mid-word.
    '.dfe-left .fld{gap:5px;margin:1px 0;align-items:flex-start}',
    '.dfe-left .fld-label{flex:1 1 auto;min-width:0;text-align:left;font-size:11px;line-height:1.15;white-space:normal;overflow-wrap:break-word}',
    '.dfe-left .fld-input{flex:0 0 auto}',
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
    // ---- v3
    '#cross-area{position:relative}',
    '#btn-turn-probe{position:absolute;left:8px;top:8px;z-index:3;min-width:120px;padding:8px 14px;font-size:13px;background:#e4e4e4;border:1px solid #8a8a8a;box-shadow:1px 1px 0 #fff inset}',
    '#btn-turn-probe[aria-pressed=true]{background:#cfe6cf}',
    '.win[data-win=blockpick] .win-body,.win[data-win=hidekey] .win-body,.win[data-win=defect-steps] .win-body{padding:8px;background:#ececec;font-size:12px}',
    '.bp{display:flex;gap:10px}',
    '.bp-card{flex:1;display:flex;flex-direction:column;gap:5px;align-items:center;text-align:center}',
    '.bp-btn{width:100%;font-size:13px;font-weight:bold;padding:8px 4px}',
    '.bp-cap{font-size:11px;color:#333;line-height:1.25}',
    '.hk{display:flex;flex-direction:column;gap:6px}',
    '.hk-line{font-weight:bold;color:#a00}',
    '.hk-line2{color:#333}',
    '.hk-input{width:100%;box-sizing:border-box;font-size:13px;padding:3px}',
    '.hk-err{color:#c00000;font-weight:bold;font-size:12px;min-height:15px}',
    '.dsteps{max-height:60vh;overflow:auto;background:#fff;border:1px solid #999;padding:8px 10px}',
    '.dsteps-p{white-space:pre-line;margin:0 0 9px;font-size:12px;line-height:1.3;color:#000}',
    '.dsteps-row{justify-content:flex-end;margin-top:4px}',
    '.dfe-toprow{display:flex;width:100%;box-sizing:border-box;padding:2px 6px;gap:8px;font-size:11px;color:#000;background:#fff}',
    '.dfe-depth{flex:1;text-align:center}',
    '.dfe-summary{color:#e00000;font-weight:normal}',
    '.dfe-btn.active{background:#ffd000}',
    '.dfe-right .fld[title]{color:#ff0}',
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
    // v2 exam lock (§4.2.3) locks the defect editor, HIDE, BEAM and Export — NOT the Defects menu: 'Trade Test…' (report
    // rows, Submit, Reveal with the code, Report / Scoreboard) lives there and must stay reachable after the candidate
    // closes the window (the v1 trade row would grey the whole menu). The editor entries guard themselves while locked:
    // defectEditor.open() / addPreset() refuse, display.hide is forced back, Delete / Import are off while trade.active
    // and Export omits the defects (90).
    if (examLocked() && key === 'menu-defects') return true;
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
    const savedVars = { stash, lastAngle, savedAngle, savedGates, savedProbeMode, autoCalState, scaleSpecId };
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
      if (has('trade.start') && typeof document === 'undefined') {
        // the engine (determinism, scoring) is 84's and covered by its selftest; here: delegates + the exit rule
        const truth = trade.start(42);
        if (!Array.isArray(truth) || !truth.length || st().mode !== 'trade' || !st().trade.active) f.push('trade.start delegate');
        const rows = truth.map(function (q) { return { n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, height: q.height, type: q.type }; });
        if (trade.submit(rows) !== 100) f.push('trade score ' + st().trade.score);
        enter('weld', { silentUI: true });
        if (st().trade.active || st().trade.truth.length) f.push('trade inactive after exit');
      } else if (typeof UT.trade === 'undefined') {
        let threw = false;
        try { trade.start(1); } catch (e) { threw = /84-trade/.test(e.message); }
        if (!threw) f.push('trade delegate must throw a clear error without 84');
      }
      // leaving trade mode abandons a shared exam: the lock and the forced display.hide go with it (SPEC-v2 §4.2.3)
      enter('trade', { silentUI: true });
      UT.setIn('trade', { active: true, exam: { v: 2, seed: 7, locked: true, codeHash: 'x' }, revealed: false }, { silent: true, noRender: true });
      if (!examLocked() || !st().display.hide) f.push('exam lock inside trade');
      enter('weld', { silentUI: true });
      if (examLocked() || st().trade.exam !== null || st().display.hide || !isToolbarEnabled('tb-hide') || !isMenuEnabled('menu-defects')) f.push('exam lock must be released on mode exit');
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
      if (ALL_MENUS.indexOf('tools') !== 6 || enabled.weld.menus.indexOf('menu-tools') < 0 || enabled.editor.menus.indexOf('menu-tools') >= 0) f.push('tools menu in the enable matrix');
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
      if (!examLocked() || isToolbarEnabled('tb-hide') || isToolbarEnabled('tb-beam') || isToolbarEnabled('tb-defect')) f.push('exam lock');
      if (!isMenuEnabled('menu-defects')) f.push('Defects menu (Trade Test…) must stay reachable while exam-locked');
      if (trade.truth().length !== 0) f.push('truth must be [] while exam-locked');
      { const nBefore = st().defects.length; if (addPreset('rootCrack') !== null || st().defects.length !== nBefore) f.push('addPreset must refuse while exam-locked'); }
      UT.setIn('trade', { exam: null, active: false }, { silent: true, noRender: true });
      if (!isToolbarEnabled('tb-beam')) f.push('beam enabled without exam lock');
      // library-aware lesson setProbe
      setProbe({ angle: 45 });
      if (st().probe.angle !== 45 || st().probe.mode !== 'shear' || (has('probe.libForAngle') && st().probe.libId !== 'gen-45-5-10')) f.push('setProbe libId ' + st().probe.libId);
      setProbe({ angle: 0 });
      if (st().probe.mode !== 'comp' || (has('probe.libForAngle') && st().probe.libId !== 'gen-0-5-10')) f.push('setProbe 0° libId ' + st().probe.libId);
      if (typeOfPrep('nozzle') !== 'fillet' || typeOfPrep('none') !== 'none' || typeOfPrep('j') !== 'single-v') f.push('typeOfPrep');
      // ---- v3 invariants (SPEC-v3 §3, §5, §6)
      if (ALL_TB.length !== 20 || ALL_TB[15] !== 'accrej' || ALL_MENUS.length !== 10 || ALL_MENUS[5] !== 'scalemode' || ALL_MENUS[8] !== 'about') f.push('v3 toolbar / menu lists');
      if (enabled.editor.disabledToolbar.indexOf('tb-pipe') >= 0 || enabled.editor.disabledMenus.indexOf('menu-file') >= 0) f.push('F30 editor lock scope');
      if (enabled.v1.disabledToolbar.indexOf('tb-accrej') < 0 || enabled.editor.disabledToolbar.indexOf('tb-accrej') < 0) f.push('F52 accrej disabled in v1 / editor');
      if (enabled.lamination.disabledToolbar.indexOf('tb-v1') >= 0 || enabled.lamination.disabledToolbar.indexOf('tb-v2') >= 0) f.push('F56 lamination must reach V1 / V2');
      if (!enabled.scale || MODE_OF['ok-demo'] !== 'scale' || MODE_OF.polygon !== 'scale') f.push('F41 scale mode registration');
      // F12: the step list must survive clampOpts, in the order given (the 20→8 preset is descending)
      const cs = clampOpts({ steps: [20, 18, 16, 14, 12, 10, 8], stepLen: 40 });
      if (!Array.isArray(cs.steps) || cs.steps.join() !== '20,18,16,14,12,10,8') f.push('F12 clampOpts steps ' + JSON.stringify(cs.steps));
      // F4: the post-cal range (20/40 → 50 as in the video; 10/25 → 100)
      if (rangeAfterCal(20, 40, 'specimen') !== 50 || rangeAfterCal(10, 25, 'step') !== 100 || rangeAfterCal(10, 25, 'specimen') !== 100) f.push('F4 rangeAfterCal ' + rangeAfterCal(20, 40, 'specimen') + '/' + rangeAfterCal(10, 25, 'step'));
      // F28: stroke classification and the captions
      if (classifyStroke([{ x: 6, y: 4 }, { x: 10, y: 9 }]) !== 'lof') f.push('F28 straight stroke → lof');
      if (classifyStroke(S.circlePts(0, 10, 2, 12)) !== 'volumetric') f.push('F28 blob → volumetric');
      if (defectAngle({ pts: [{ x: 6, y: 4 }, { x: 10, y: 9 }] }) !== 51 || defectAngle({ pts: [{ x: 0, y: 0 }, { x: 0, y: 4 }] }) !== 90) f.push('F28 defectAngle');
      // F29: ring labels at a round step, positions unchanged
      const rl = ringLabels(528.7);
      if (ringStepMm(528.7) !== 40 || rl.length !== 12 || rl[0] !== '0 mm' || rl[1] !== '40mm' || rl[11] !== '440mm') f.push('F29 ring labels ' + rl.join(','));
      // F45 / F46 / F17 through the live store
      enter('weld', { silentUI: true });
      const wc = weldCondition({ rootCorrosion: true, misalignmentMm: 9, wtVariationMm: -2 });
      if (wc.rootCorrosion !== true || wc.misalignmentMm !== 5 || wc.wtVariationMm !== 0) f.push('F45 weldCondition clamp ' + JSON.stringify([wc.rootCorrosion, wc.misalignmentMm, wc.wtVariationMm]));
      weldCondition({ rootCorrosion: false, misalignmentMm: 0, wtVariationMm: 0 });
      if (setSkips(2.5) !== 2.5 || st().display.skips !== 2.5 || st().display.skipsToRange !== false) f.push('F17 skips 2.5');
      if (setSkips(null) !== null || st().display.skipsToRange !== true || st().display.skips !== 2.5) f.push('F17 run to range');
      setSkips(3);
      // F46: the three chord kinds
      tkyApply({ kind: 'T-joint', chordOd: 600, chordWt: 32, braceAngle: 60 });
      if (st().mode !== 'tky' || !st().specimen.tky || st().specimen.tky.kind !== 'T-joint' || !st().specimen.arcs || !st().specimen.arcs.length) f.push('F46 curved chord');
      if (statusMid().indexOf('Diameter=600  W/T=32mm') < 0) f.push('F46 status caption: ' + statusMid());
      tkyApply({ kind: 'Pipe', chordOd: 180, chordWt: 20 });
      if (!st().specimen.tky || st().specimen.tky.kind !== 'Pipe') f.push('F46 pipe ring');
      tkyApply({ kind: 'Plate' });
      if (statusMid().indexOf('Diameter=') >= 0) f.push('F46 flat chord must not carry a diameter caption');
      if (st().tkyOpts.kind !== 'Plate') f.push('F46 tkyOpts promoted into state');
      rebuild({ braceAngle: 75 });
      if (tkyOpts().braceAngle !== 75) f.push('F47 rebuild must update tkyOpts');
      enter('weld', { silentUI: true });
      // F21: a preset lands under the parked probe (plates: defaultProbe.z = L/2, so v1/v2 numbers are unchanged)
      UT.set({ defects: [] }, { noRender: true });
      const pd = addPreset('rootCrack');
      if (!pd || !(pd.zFrom < st().probe.z && pd.zTo > st().probe.z) || pd.zTo - pd.zFrom < 20) f.push('F21 preset z placement ' + (pd ? pd.zFrom + '..' + pd.zTo : 'null'));
      // F27: keyboard manipulation (needs editing.defect, which the window normally sets)
      UT.setIn('editing', { defect: true, brush: 'auto', autoType: true, returnMode: null }, { noRender: true });
      UT.set({ defects: [S.makeDefect({ n: 1, type: 'lof', pts: [{ x: 6, y: 4 }, { x: 10, y: 9 }], zFrom: 140, zTo: 160 })], selectedDefect: 0 }, { noRender: true });
      editorKey('ArrowRight', { shift: true }); editorKey('ArrowRight', { shift: true });
      if (st().defects[0].zFrom !== 142) f.push('F27 shift+right ' + st().defects[0].zFrom);
      editorKey('ArrowLeft', { shift: true });
      if (st().defects[0].zFrom !== 141) f.push('F27 shift+left ' + st().defects[0].zFrom);
      const a0 = M.fitLine(st().defects[0].pts).angleDeg;
      for (let i = 0; i < 10; i++) editorKey('X', { shift: true });
      const a1 = M.fitLine(st().defects[0].pts).angleDeg;
      if (Math.abs(a1 - a0 - 10) > 1) f.push('F27 rotate ' + (a1 - a0));
      const l0 = ptsLength(st().defects[0].pts);
      for (let i = 0; i < 5; i++) editorKey('S', { shift: true });
      if (Math.abs(ptsLength(st().defects[0].pts) / l0 - 1.2763) > 0.03) f.push('F27 scale ' + (ptsLength(st().defects[0].pts) / l0));
      const y0 = ptsCentroid(st().defects[0].pts).y;
      editorKey('W', { shift: true }); editorKey('W', { shift: true });
      if (Math.abs(ptsCentroid(st().defects[0].pts).y - y0 - 1) > 0.05) f.push('F27 depth ' + (ptsCentroid(st().defects[0].pts).y - y0));
      if (editorKey('X', {}) !== false) f.push('F27 unshifted keys are not bindings');
      // F28/F29 captions
      if (!/^LACK OF FUSION {2}Defect Angle \d+ {3}Height=[\d.]+ {3}Top=[-\d.]+$/.test(editorStatusLine())) f.push('F28 caption: ' + editorStatusLine());
      if (!/Angle= \d+ {2}LOF$/.test(editorSummaryLine())) f.push('F29 summary: ' + editorSummaryLine());
      UT.set({ defects: [], selectedDefect: 1 }, { noRender: true });
      if (editorStatusLine() !== 'VOL  Defect Num 2, DRAW DEFECT ON CROSS SECTION BELOW') f.push('F29 empty prompt: ' + editorStatusLine());
      // F28/F29 brush: a right-drag is a 2-point LOF, a near-stationary click a spot of spotMm
      UT.set({ selectedDefect: 0 }, { noRender: true });
      onBrush({ pts: [{ x: 6, y: 4 }, { x: 8, y: 6.5 }, { x: 10, y: 9 }], lof: true });
      if (!st().defects[0] || st().defects[0].type !== 'lof' || st().defects[0].pts.length !== 2) f.push('F26 right-drag LOF');
      UT.set({ defects: [] }, { noRender: true });
      UT.setIn('editing', { spotMm: 45 }, { noRender: true });
      onBrush({ pts: [{ x: 0, y: 10 }, { x: 0.1, y: 10.1 }] });
      const sb = st().defects[0] ? S.bbox(st().defects[0].pts) : null;
      if (!sb || Math.abs(sb.w - 45) > 3) f.push('F29 spot spinner ' + (sb ? sb.w : 'none'));
      UT.setIn('editing', { spotMm: 5, defect: false }, { noRender: true });
      UT.set({ defects: [] }, { noRender: true });
      if (editorKey('ArrowRight', { shift: true }) !== false) f.push('F27 bindings must be dead once the editor is closed');
      // F33: the HIDE key lock
      if (hideKey('1234') !== true || st().display.hide !== true || !st().editing.keyLock) f.push('F33 arming the lock');
      UT.setIn('display', { hide: false });
      if (st().display.hide !== true) f.push('F33 the lock must force display.hide back on');
      if (hideKey('0000') !== false || st().display.hide !== true) f.push('F33 wrong key');
      if (hideKey('1234') !== true || st().display.hide !== false || st().editing.keyLock !== null) f.push('F33 unlock');
      // F2/F3/F4: the wizard on the current specimen
      loadSpecimen('plate-weld', { T: 20 });
      setProbe({ angle: 0, x: 40 });
      UT.setIn('instrument', { gain: 40, range: 100, cal: { vel: 5.60, zero: 0.4 }, gates: [{ on: true, start: 5, width: 60, level: 10 }] }, { noRender: true });
      UT.compute();
      autoCal.start();
      if (st().autocal.source !== 'specimen' || st().mode !== 'weld' || st().autocal.d1 !== 20 || st().autocal.d2 !== 40) f.push('F2 on the current specimen: ' + st().autocal.source + '/' + st().mode + '/' + st().autocal.d1 + '/' + st().autocal.d2);
      if (autoCal.info().caption.indexOf('ENTER VALUE FOR THIN STANDARD') < 0 || autoCal.info().caption.indexOf('AND THEN PRESS Calibration') < 0) f.push('F3 thin caption: ' + autoCal.info().caption);
      autoCal.setField(20); autoCal.confirm();
      if (st().autocal.entered.thin !== 20 || st().autocal.stage !== 2) f.push('F3 thin entry ' + JSON.stringify(st().autocal.entered));
      if (autoCal.info().caption.indexOf('ENTER VALUE FOR THICK STANDARD') < 0 || autoCal.info().caption.indexOf('AND THEN PRESS ENTER') < 0) f.push('F3 thick caption: ' + autoCal.info().caption);
      autoCal.cancel();
      if (st().autocal.stage !== 0 || st().autocal.rangeAfter !== null || st().instrument.range !== 100) f.push('F4 a cancelled cal must not move the range');
      enter('weld', { silentUI: true });
    } catch (e) { f.push('exception ' + (e && e.message) + (e && e.stack ? ' @ ' + String(e.stack).split('\n')[1] : '')); }
    finally {
      if (rebuildTimer !== null && typeof clearTimeout === 'function') { clearTimeout(rebuildTimer); rebuildTimer = null; }
      stash = savedVars.stash; lastAngle = savedVars.lastAngle; savedAngle = savedVars.savedAngle;
      savedGates = savedVars.savedGates; savedProbeMode = savedVars.savedProbeMode; autoCalState = savedVars.autoCalState;
      scaleSpecId = savedVars.scaleSpecId;
      // put back exactly the top-level objects that changed (one 'state' event so the toolbar / layout resync)
      const modeBefore = st().mode;
      const patch = {};
      Object.keys(saved).forEach(function (k) { if (k !== 'status' && k !== 'cursor' && UT.state[k] !== saved[k]) patch[k] = saved[k]; });
      Object.keys(UT.state).forEach(function (k) { if (!(k in saved)) delete UT.state[k]; });
      if (Object.keys(patch).length) UT.set(patch);
      if (modeBefore !== saved.mode) UT.bus.emit('mode', { mode: saved.mode, prev: modeBefore });
      UT.status(Object.assign({}, saved.status || {}, { right: saved.status && saved.status.right ? saved.status.right : (HINTS[saved.mode] || '') }));
    }
    return f;
  }

  Object.assign(modes, {
    enter, exit, toggle, current, setFace, statusMid, rebuild,
    enabled, isToolbarEnabled, isMenuEnabled, hiddenViews, allowedAngles, examLocked, hints: HINTS,
    lessonSetups, lessonsWindow, defectEditor, tradeTest, tkyPanel, dacPanel,
    autoCal, dac, plot, sizing, trade, practice, setDefects, clampOpts,
    setMaterial, setPrep, setWeldOpts, normaliseWeldPatch, typeOfPrep, preps: PREPS.slice(), modeList: MODES.slice(),
    // ---- v3
    turnProbe, blockPick, weldCondition, setPipeThickness, setSkips, hideKey, hideKeyPrompt,
    editorKey, editorStatusLine, editorSummaryLine, classifyStroke, defectAngle,
    ringStepMm, ringLabels, circleHeader, depthLabel, rangeAfterCal, addPreset,
    rebuildForWallVariation,
    get tkyOpts() { return tkyOpts(); }, setTkyOpts, tkyKinds: TKY_KINDS.slice(), stepText: STEP_TEXT.slice(),
    rng: M.rng, css, __selftest,
  });
  // §1 (1): late-bound lessons — 82's v2 list when loaded, else the v1 setups (same {n, title, ko, en, setup, steps} shape)
  Object.defineProperty(modes, 'lessons', { get: function () { return (UT.lessons && UT.lessons.list) || lessonSetups; }, enumerable: true, configurable: true });
  UT.modes = modes;
})(window.UT = window.UT || {});
