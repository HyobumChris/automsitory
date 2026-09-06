/* 82-lessons.js — T1 guided lessons (window 'lessons' v2) + T7 echo-identification quiz (window 'quiz').
 * UT.lessons = { list, start, stop, goto, current, next, prev, hint, doIt, answer, autoRun, quiz, window, css }
 * Classic script; nothing here touches the DOM at load time (headless-safe, node tools/node-load.mjs).
 *
 * // SPEC NOTES (deviations / assumptions — SPEC-v2 §4.1, §4.5, §1)
 * - Late binding (§1): the 25-entry `UT.lessons.list` is built at load from `UT.modes.lessonSetups`
 *   (fallback `UT.modes.lessons` when it is still the v1 array). Entries 1–22 keep the v1 `setup()`; lessons whose v2
 *   step list needs a different starting state wrap it (2: range 50 so RANGE is a real step; 11/22: range 200 / page 1
 *   + gain 36 ≠ refGain 30; 15: PIPE off so step 1 turns it on; 17: pipe 8 in WT 25 + lamination + root crack as §4.1.1;
 *   18: + root crack z 120…150 so the strip shows an indication; 25 defines its own setup). 23–25 are defined here.
 * - Missing v2 helpers degrade: `dragTo/wheel/auto/storeRef/cursorAt/pcsOptimise/trade.x/standards.x` fall back to the
 *   equivalent `UT.setIn`. Only in that fallback (no real handler could emit) a `'ui'` event tagged `synthetic:true` is
 *   emitted so the memo tally stays consistent; once 60/70/90 emit the real events the fallback never fires.
 *   `memo.ui.win` is additionally fed from core's `'win:show'` (name) so window checks work with the v1 app.
 * - Choice steps with an extra state condition (§4.1.1 lesson 5/19/20 'AND …') use `step.also(ctx)`; a right answer
 *   whose `also` fails shows `alsoKo/En`. Numeric wrong answers also increment `progress[n].wrong`.
 * - `memo` keep set = union of `step.keep` over the lesson (so `bwClean`, `gainBlock/gainSpec`, `driftDb` survive every
 *   later step); `setup()` may return an object merged into the initial memo (lesson 25 → `driftDb`, sign from a seed
 *   that advances per start so repeat runs alternate).
 * - Transition steps: `memo.was` is (re)set to false whenever the check is false, so a step that was already true at
 *   entry passes after the user makes it false and true again.
 * - Manual 'Do it for me' force-advances when the check still fails after two renders (never leaves the user stuck);
 *   autoRun records such steps in `failedSteps` and continues so later steps are still exercised.
 * - Lesson 4 step 7: 0° in v1 rebuilds the narrow face (80); doIt restores `setFace('wide')` for the Perspex insert.
 * - Lesson 14: wedge 33° is between the critical angles (shear only, 40°) and 60° is beyond the 2nd critical angle, so
 *   the outline's '33° → both / 60° → shear' is corrected to 20° comp, 33° shear, 52.6° → shear 70°.
 * - Lesson 20 step 7: the DAC block has no fusion faces, so doIt enters the weld (keepProbe) before `addPreset('lof')`.
 * - Lesson 25 step 4 accepts the drift with either sign (|ans| = |drift| within tol).
 * - Quiz: `describe()` returning a string (v1 30) → category derived from the gated echo's kind/tag here; with v2 30
 *   the correct id is exactly `UT.rays.describe(frame.readouts.primary).category`. An item counts as correct only when
 *   both the echo and the action answers are right; the mode/specimen of the last item is left in place on finish.
 * - v1 `UT.modes.lessons` (80) is left untouched; `UT.test.lessons()` is redefined here to return the 25 titles.
 */
(function (UT) {
  'use strict';
  const M = UT.math;
  const DEG = Math.PI / 180;
  const T60 = Math.tan(60 * DEG), T70 = Math.tan(70 * DEG), T45 = 1;
  const st = function () { return UT.state; };
  const t = function (key, params) { return UT.i18n.t(key, params); };
  const ko = function () { return UT.i18n.lang === 'ko'; };
  const hasDoc = function () { return typeof document !== 'undefined' && !!document; };
  function has(path) { let o = UT; for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; } return o; }
  function ls() { return st().lessons || { active: null, step: 0, progress: {}, answers: {}, memo: {}, stepStartedAt: 0 }; }
  function writeL(patch) { UT.setIn('lessons', patch, { noRender: true }); }
  function abs(v) { return Math.abs(v); }
  function tally() { return { menuOpen: [], tbHover: [], tbClick: [], tbClickCount: {}, wheel: 0, drag: 0, win: [], softkey: [] }; }
  function pushU(arr, id) { const a = Array.isArray(arr) ? arr.slice() : []; if (a.indexOf(id) < 0) a.push(id); return a; }

  // module-level buffers (never written to state from a 'render' listener)
  const L = { win: null, ui: {}, hintTimer: null, evalTimer: null, lastEval: 0, uiSeen: 0, autoRunning: false, prevFrame: null, curFrame: null,
    lastRefresh: 0, feedback: '', feedbackKind: '', hintShown: false, lastCompleted: null, cov: { 1: {}, '-1': {} }, drift: 0 };

  // ------------------------------------------------------------------ action helpers used by doIt() (guarded + fallbacks)
  function emitUi(kind, id) { UT.bus.emit('ui', { kind, id, synthetic: true }); }
  function seen(fn) { const before = L.uiSeen; fn(); return L.uiSeen > before; }
  const H = {
    st, has,
    tan(deg) { return Math.tan(deg * DEG); },
    setProbe(p) { if (has('test.setProbe')) return UT.test.setProbe(p); UT.setIn('probe', p); return UT.renderNow().derived; },
    setInstrument(p) { if (has('test.setInstrument')) UT.test.setInstrument(p); else UT.setIn('instrument', p); return UT.renderNow(); },
    setIn(key, p) { UT.setIn(key, p); return UT.renderNow(); },
    enter(mode, opts) { const o = Object.assign({}, opts || {}); if (!hasDoc()) o.silentUI = true; if (has('modes.enter')) UT.modes.enter(mode, o); return UT.renderNow(); },
    weld(opts, extra) { UT.set({ weldOpts: Object.assign({}, UT.defaultState().weldOpts, opts || {}) }, { noRender: true }); return H.enter('weld', Object.assign({ keepProbe: false }, extra || {})); },
    addPreset(name, opts) { const d = has('test.addPreset') ? UT.test.addPreset(name, opts) : null; UT.renderNow(); return d; },
    setDefects(arr) { if (has('test.setDefects')) UT.test.setDefects(arr); else UT.set({ defects: arr }); return UT.renderNow(); },
    /** Toolbar click through the real handler; falls back to the equivalent state change (+ synthetic 'ui'). */
    click(id) {
      const tb = String(id).indexOf('tb-') === 0 ? String(id) : 'tb-' + id;
      let ok = false;
      const before = L.uiSeen;
      if (hasDoc() && has('test.click')) { try { ok = UT.test.click(tb) !== false; } catch (e) { ok = false; } }
      if (!ok) {
        const s = st(), name = tb.slice(3);
        if (/^(0|45|60|70)$/.test(name)) H.setProbe({ angle: +name });
        else if (/^(v1|v2|dac|tky|tofd|aut)$/.test(name)) { if (has('modes.toggle')) H.enter(s.mode === name ? 'weld' : name, s.mode === name ? { keepProbe: false } : { keepProbe: true }); }
        else if (name === 'plot') H.enter(s.mode === 'iow' ? 'weld' : 'iow', { keepProbe: true });
        else if (name === 'damp') H.setIn('instrument', { damping: !s.instrument.damping });
        else if (name === 'hide') H.setIn('display', { hide: !s.display.hide });
        else if (name === 'beam') H.setIn('display', { beam: !s.display.beam });
        else if (name === 'pipe') { UT.setIn('weldOpts', { pipe: !s.weldOpts.pipe }, { noRender: true }); H.enter('weld', { keepProbe: true }); }
        else if (name === 'size' && has('views.sizing.toggle')) UT.views.sizing.toggle();
        else if (name === 'defect' && has('modes.defectEditor.toggle')) UT.modes.defectEditor.toggle();
        else if (name === 'clear') { UT.setIn('plot', { points: [], edgeMarks: [] }); UT.setIn('sizing', { marks: [] }); }
      }
      if (L.uiSeen === before) emitUi('tb-click', tb);
      return ok;
    },
    /** Mode toolbar button that must not toggle the mode off when already active. */
    clickMode(name) { if (st().mode === (name === 'plot' ? 'iow' : name)) return true; return H.click('tb-' + name); },
    /** Menu by label path(s); `fb()` runs when no path resolved. */
    menu(paths, fb) {
      const list = Array.isArray(paths) ? paths : [paths];
      if (hasDoc() && has('test.menu')) for (const p of list) { let r = false; try { r = UT.test.menu(p); } catch (e) { r = false; } if (r) return true; }
      if (fb) fb();
      return false;
    },
    dragTo(x, o) {
      let rx = null;
      if (hasDoc() && has('views.cross.dragTo')) { try { const before = L.uiSeen; rx = UT.views.cross.dragTo(x, o || {}); if (L.uiSeen === before) emitUi('probe-drag', 'cv-cross'); } catch (e) { rx = null; } }
      if (rx === null || rx === undefined) { const p = { x }; if (o && o.z !== undefined) p.z = o.z; H.setProbe(p); emitUi('probe-drag', 'cv-cross'); rx = st().probe.x; }
      else if (o && o.z !== undefined) H.setProbe({ z: o.z });
      UT.renderNow();
      return rx;
    },
    wheel(n) {
      if (has('instruments.wheel')) { const before = L.uiSeen; UT.instruments.wheel(n); if (L.uiSeen === before) emitUi('wheel', 'gain'); }
      else { H.setInstrument({ gain: st().instrument.gain + n }); emitUi('wheel', 'gain'); }
      return UT.renderNow();
    },
    softkey(param) {
      const before = L.uiSeen;
      if (has('instruments._.selectParam')) { try { UT.instruments._.selectParam(param); } catch (e) { /* ignore */ } }
      if (L.uiSeen === before) emitUi('softkey', param);
    },
    auto(pct) {
      if (has('instruments.auto')) { UT.instruments.auto(pct); return UT.renderNow(); }
      const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
      if (r && r.peakPct > 0) H.setInstrument({ gain: M.clamp(+(st().instrument.gain + 20 * Math.log10(pct / r.peakPct)).toFixed(1), 0, 110) });
      return UT.renderNow();
    },
    storeRef() { if (has('instruments.storeRef')) UT.instruments.storeRef(); else UT.setIn('instrument', { refGain: st().instrument.gain }); return UT.renderNow(); },
    cursorAt(o) {
      if (has('tofd.cursorAt')) { UT.tofd.cursorAt(o); return UT.renderNow(); }
      let tUs = null; try { const g = UT.tofd && UT.tofd.derive ? UT.tofd.derive(st()) : null; if (g && UT.tofd.pointTime) tUs = UT.tofd.pointTime(g, 0, o.depth); } catch (e) { tUs = null; }
      UT.setIn('cursor', { view: 'dscan', tUs, depth: o.depth, z: o.z });
      return UT.renderNow();
    },
    pcsOptimise() {
      if (has('test.pcsOptimise')) { UT.test.pcsOptimise(); return UT.renderNow(); }
      const s = st(), T = s.specimen ? s.specimen.T : 20;
      UT.setIn('tofd', { pcs: +(2 * (2 * T / 3) * Math.tan((s.tofd.txAngle || 60) * DEG)).toFixed(1) });
      return UT.renderNow();
    },
    runTofdScan() { if (has('test.runTofdScan')) return UT.test.runTofdScan(); return null; },
    runAutScan() { if (has('test.runAutScan')) return UT.test.runAutScan(); return null; },
    /** Move the probe over `xs`, keep the x giving the largest echo accepted by `pred`. Returns {x, echo} or null. */
    maximise(pred, xs, extra) {
      let best = null;
      for (const x of xs) {
        H.setProbe(Object.assign({ x }, extra || {}));
        for (const e of UT.frame.echoes || []) if (pred(e) && (!best || e.ampPct > best.echo.ampPct)) best = { x, echo: e };
      }
      if (best) H.setProbe(Object.assign({ x: best.x }, extra || {}));
      return best;
    },
    range(a, b, step) { const out = []; for (let x = a; step > 0 ? x <= b + 1e-9 : x >= b - 1e-9; x += step) out.push(+x.toFixed(3)); return out; },
    hole(spec, y) { return spec && spec.holes ? spec.holes.find(function (h) { return abs(h.y - y) < 0.01; }) || null : null; },
    hole5(spec) { return spec && spec.holes ? spec.holes.find(function (h) { return h.d === 5 || abs(2 * h.r - 5) < 0.01 || h.label === '5mm'; }) || null : null; },
    acStage() { const a = st().autocal; if (a && a.stage) return a.stage; const s = has('modes.autoCal.state') ? UT.modes.autoCal.state() : null; return s ? s.step : 0; },
    winOpen(name) { const w = UT.dom && UT.dom.wins && UT.dom.wins[name]; return !!(w && w.isOpen && w.isOpen()); },
    gate(start, width, level) { return H.setInstrument({ gates: [{ on: true, start, width, level: level === undefined ? 20 : level }] }); },
    coverage() {
      if (has('trade.coverage')) { try { const c = UT.trade.coverage(); if (c) return c; } catch (e) { /* fall through */ } }
      const spec = st().specimen, n = spec ? Math.max(1, Math.ceil(spec.L / 5)) : 1;
      return { sideA: Object.keys(L.cov[1]).length / n, sideB: Object.keys(L.cov[-1]).length / n };
    },
    sweep(angle, side) {
      const s = st(), spec = s.specimen; if (!spec) return;
      H.click('tb-' + angle);
      const T = spec.T || 20, cap = (spec.weld && spec.weld.capWidth) || s.weldOpts.capWidth || 16;
      const x = +(T * Math.tan(angle * DEG) + cap / 2 + 1).toFixed(1);
      for (let z = 0; z <= spec.L; z += 5) H.setProbe({ x, z, side });
    },
    addRow() {
      if (has('trade.addRowFromReadout')) { UT.trade.addRowFromReadout(); return UT.renderNow(); }
      const s = st(), r = UT.frame.readouts && UT.frame.readouts.primary;
      const row = { n: s.trade.report.length + 1, z: +s.probe.z.toFixed(1), length: 20, depth: r ? +r.dp.toFixed(1) : 0, type: 'planar', angle: s.probe.angle, side: s.probe.side };
      UT.setIn('trade', { report: s.trade.report.concat([row]) });
      return UT.renderNow();
    },
    tradeStart(seed) { if (has('trade.start')) UT.trade.start(seed); else if (has('modes.trade.start')) UT.modes.trade.start(seed); return UT.renderNow(); },
    tradeSubmit(rows) { const r = rows || st().trade.report; if (has('trade.submit')) UT.trade.submit(r); else if (has('modes.trade.submit')) UT.modes.trade.submit(r); return UT.renderNow(); },
    applyProcedure(id) {
      if (has('standards.applyProcedure')) { UT.standards.applyProcedure(id); return UT.renderNow(); }
      UT.setIn('standards', { procedure: id, standard: 'iso11666', level: 'AL2', testingLevel: 'B' });
      return UT.renderNow();
    },
    evaluateAll() {
      if (has('standards.evaluation.open') && hasDoc()) { try { UT.standards.evaluation.open(); UT.standards.evaluation.addFromReadout(); UT.standards.evaluation.evaluateAll(); } catch (e) { /* fallback below */ } }
      if (!(st().standards.lastEval && st().standards.lastEval.rows && st().standards.lastEval.rows.length)) {
        const s = st(), r = UT.frame.readouts && UT.frame.readouts.primary;
        UT.setIn('standards', { lastEval: { ruleId: s.standards.standard, level: s.standards.level, T: s.specimen ? s.specimen.T : 20, rows: [{ indication: { ampDbVsRef: r ? r.dBToDac : null, lengthMm: 25, type: 'lof' }, result: null }] } });
      }
      return UT.renderNow();
    },
    sizingOpen() { if (hasDoc() && has('views.sizing.open')) { try { UT.views.sizing.open(); } catch (e) { /* ignore */ } } },
    sizingMethod(m) { if (has('views.sizing.setMethod')) UT.views.sizing.setMethod(m); else if (has('modes.sizing.method')) UT.modes.sizing.method(m); else UT.setIn('sizing', { method: m }); },
    markL() { if (has('modes.sizing.markL')) UT.modes.sizing.markL(); else if (has('views.sizing.markL')) UT.views.sizing.markL(); return UT.renderNow(); },
    markR() { if (has('modes.sizing.markR')) UT.modes.sizing.markR(); else if (has('views.sizing.markR')) UT.views.sizing.markR(); return UT.renderNow(); },
    markEdge() { if (has('modes.plot.markEdge')) UT.modes.plot.markEdge(); return UT.renderNow(); },
    /** Walk the probe from its position in `dx` steps until the gated peak ≤ pct (max 80 steps). */
    walkUntil(dx, pct) {
      for (let i = 0; i < 80; i++) {
        const r = UT.frame.readouts && UT.frame.readouts.primary;
        if (!r || r.peakPct <= pct) return;
        H.setProbe({ x: +(st().probe.x + dx).toFixed(2) });
      }
    },
    toeLof() {
      const spec = st().specimen; if (!spec || !spec.tky) return null;
      const toe = spec.tky.toe.x + spec.tky.weldLeg, y = 0.6;
      const d = UT.specimens.makeDefect({ n: 1, type: 'lof', label: 'Toe LOF', pts: [{ x: toe - 20, y }, { x: toe, y }], height: 0.6, zFrom: spec.L / 2 - 10, zTo: spec.L / 2 + 10 });
      return H.setDefects([d]);
    },
    wedge(deg, mode) {
      const mat = st().specimen && st().specimen.material;
      const vW = st().probe.wedgeVel || 2.74, v = mode === 'comp' ? ((mat && mat.vComp) || 5.9) : ((mat && mat.vShear) || 3.24);
      const a = M.snellAngle(deg, vW, v);
      if (a === null) return null;
      UT.setIn('probe', { angle: +a.toFixed(1), mode });
      return UT.renderNow();
    },
  };
  function near(E, kind, path, tol, minAmp) { return (E || []).some(function (e) { return (!kind || e.kind === kind) && abs(e.path - path) <= tol && (minAmp === undefined || e.ampPct >= minAmp); }); }
  function bbox(pts) { return UT.specimens && UT.specimens.bbox ? UT.specimens.bbox(pts) : { yMin: Math.min.apply(null, pts.map(function (p) { return p.y; })), yMax: Math.max.apply(null, pts.map(function (p) { return p.y; })) }; }

  // ------------------------------------------------------------------ step DSL (§4.1 Step schema)
  const WRONG_KO = '다시 생각해 보세요. 화면의 지시와 상태 표시줄을 확인하세요.', WRONG_EN = 'Not quite — look again at the indication and the status line.';
  function norm(s, o) {
    o = o || {};
    return Object.assign({ hintKo: o.hk || '', hintEn: o.he || '', okKo: o.ok || '', okEn: o.oe || '', wrongKo: o.wk || WRONG_KO, wrongEn: o.we || WRONG_EN, keep: o.keep || [], onEnter: o.onEnter || null, onPass: o.onPass || null, mode: 'state' }, s);
  }
  /** State step. */
  function S(ko, en, check, doIt, o) { return norm({ ko, en, check, doIt: doIt || null }, o); }
  /** Transition step (check false at entry, true later). */
  function TR(ko, en, check, doIt, o) { const s = S(ko, en, check, doIt, o); s.mode = 'transition'; return s; }
  /** Choice step: choices [[id, ko, en, wrongKo?, wrongEn?], …]; `also(ctx)` = extra state condition. */
  function C(ko, en, choices, answer, o) {
    o = o || {};
    const s = norm({ ko, en, answer, choices: choices.map(function (c) { return { id: c[0], ko: c[1], en: c[2], wrongKo: c[3] || null, wrongEn: c[4] || null }; }),
      also: o.also || null, alsoKo: o.ak || '', alsoEn: o.ae || '' }, o);
    s.check = function (ctx) { return ctx.ans === s.answer && (!s.also || !!s.also(ctx)); };
    s.doIt = function (ctx) { if (o.doIt) o.doIt(ctx); api.answer(s.answer); };
    return s;
  }
  /** Numeric step: answer = number | ctx => number; tol absolute (o.rel → relative fraction). */
  function N(ko, en, answer, tol, o) {
    o = o || {};
    const s = norm({ ko, en, answer, tol, input: 'number', rel: !!o.rel }, o);
    s.expected = function (ctx) { return typeof s.answer === 'function' ? s.answer(ctx) : s.answer; };
    s.check = function (ctx) {
      if (ctx.ans === undefined || ctx.ans === null || !Number.isFinite(+ctx.ans)) return false;
      const exp = ctx.memo && Number.isFinite(ctx.memo.expected) ? ctx.memo.expected : s.expected(ctx);
      if (!Number.isFinite(exp)) return false;
      const tl = s.rel ? abs(exp) * s.tol : s.tol;
      return abs(+ctx.ans - exp) <= tl + 1e-9 || (!!o.anySign && abs(abs(+ctx.ans) - abs(exp)) <= tl + 1e-9);
    };
    s.doIt = function (ctx) { if (o.doIt) o.doIt(ctx); api.answer(+(+s.expected(ctx)).toFixed(2)); };
    return s;
  }
  const HOLE_KO = 'T/2 횡공 위치는 시험편 라벨을 보세요. 최대 에코 = 구멍 x + 깊이·tan(굴절각).', HOLE_EN = 'Read the SDH position from the block label; maximum at x = hole x + depth·tan(angle).';

  // ------------------------------------------------------------------ §4.1.1 / §4.1.2 step lists
  const STEPS = {};
  STEPS[1] = function () { return [
    S('툴바에서 45° 탐촉자 선택', 'Select the 45° probe on the toolbar', function (c) { return c.S.probe.angle === 45; }, function () { H.click('tb-45'); },
      { hk: '툴바의 노란 45° 버튼을 누르세요.', he: 'Press the yellow 45° toolbar button.', ok: '굴절각이 바뀌면 상태 표시줄의 쐐기각도 36.7°로 바뀝니다.', oe: 'Changing the refracted angle also changes the wedge angle in the status line (36.7°).' }),
    S('Weld ▸ Weld… 대화상자에서 두께 25', 'Weld dialog: T = 25', function (c) { return c.S.weldOpts.T === 25 && (c.memo.ui.win.indexOf('weld') >= 0); },
      function () { H.menu(['Weld/Weld...', 'Weld/Weld…', 'Weld/Weld Settings...'], function () { emitUi('window-open', 'weld'); }); UT.setIn('weldOpts', { T: 25 }, { noRender: true }); H.enter('weld', { keepProbe: true }); if (H.winOpen('weld')) UT.dom.wins.weld.close(); },
      { hk: 'Weld 메뉴의 첫 항목을 열고 Thickness를 25로 바꾸세요.', he: 'Open the first item of the Weld menu and set Thickness to 25.', ok: '두께가 바뀌면 스킵 거리(0.5 스킵 = T·tanθ)와 저면 에코 위치가 함께 바뀝니다.', oe: 'Thickness sets the skip distance (half skip = T·tanθ) and the backwall echo position.' }),
    TR('탐촉자를 x = 50으로 드래그', 'Drag the probe to x = 50', function (c) { return abs(c.S.probe.x - 50) <= 3 && c.memo.ui.drag >= 1; }, function () { H.dragTo(50); },
      { hk: '단면도에서 탐촉자를 마우스 왼쪽 버튼으로 끌어 놓으세요. 상태 표시줄의 Pos 값을 보세요.', he: 'Drag the probe with the left mouse button in the cross section; watch Pos in the status bar.', ok: '탐촉자 위치(입사점)는 용접 중심에서의 표면 거리입니다.', oe: 'The probe position is the surface distance of the index point from the weld centre.' }),
    S('휠로 게인 36 dB', 'Wheel: gain 36 dB', function (c) { return c.S.instrument.gain === 36 && c.memo.ui.wheel >= 1; }, function () { H.wheel(6); },
      { hk: '단면도 위에서 마우스 휠을 굴리면 1 dB 단위로 게인이 바뀝니다.', he: 'Roll the wheel over the cross section: 1 dB per click.', ok: '+6 dB는 에코 높이를 2배로 만듭니다 (20·log10 2 = 6).', oe: '+6 dB doubles the echo height (20·log10 2 = 6).' }),
    TR('BEAM 끄고 다시 켜기', 'BEAM off then on', function (c) { return (c.memo.beamToggles || 0) >= 2 && c.S.display.beam === true; }, function () { H.click('tb-beam'); H.click('tb-beam'); },
      { hk: '툴바의 BEAM 버튼을 두 번 누르세요.', he: 'Press the BEAM toolbar button twice.', ok: 'BEAM은 빔 경로 표시만 끕니다 — 실제 탐상에서는 보이지 않는 것을 기억하세요.', oe: 'BEAM only hides the drawn path — in real testing you never see it.', onEnter: function (c) { return { beam: c.S.display.beam }; } }),
    C('메뉴/툴바 중 결함을 숨기는 기능은?', 'Which control hides defects?', [['hide', 'HIDE', 'HIDE'], ['beam', 'BEAM', 'BEAM', 'BEAM은 빔 경로 표시입니다.', 'BEAM toggles the drawn beam path.'], ['clear', 'CLEAR', 'CLEAR', 'CLEAR는 피크 메모리·마크를 지웁니다.', 'CLEAR erases peak memory and marks.'], ['damp', 'DAMP', 'DAMP', 'DAMP는 펄서 댐핑입니다.', 'DAMP is the pulser damping.']], 'hide',
      { hk: '실기 시험(Trade Test)에서 자동으로 켜지는 버튼입니다.', he: 'The button the Trade Test switches on automatically.', ok: 'HIDE는 결함을 숨겨 A-스캔만으로 지시를 해석하게 합니다 — 실기 시험의 기본 상태입니다.', oe: 'HIDE hides the defects so you interpret the A-scan alone — the Trade Test default.' }),
  ]; };
  STEPS[2] = function () { return [
    S('RANGE: 저면 에코 4개가 화면에 들어오도록', 'RANGE until four backwall echoes fit', function (c) { const i = c.S.instrument; return i.range >= 85 && c.E.filter(function (e) { return e.kind === 'backwall' && e.path <= i.range + i.delay && e.ampPct >= 3; }).length >= 4; }, function () { H.setInstrument({ range: 88.5 }); },
      { hk: 'USK7의 RANGE 노브(◀▶)로 측정 범위를 늘리세요 (T = 20 → 80 mm까지 필요).', he: 'Turn the USK7 RANGE knob (◀▶); T = 20 needs 80 mm on screen.', ok: '두께 20 mm의 저면 에코는 20/40/60/80 mm에 반복됩니다.', oe: 'Backwall multiples of a 20 mm plate sit at 20/40/60/80 mm.' }),
    S('X-SHIFT: 첫 에코를 눈금 2에', 'X-SHIFT the first echo to division 2', function (c) { return !!c.R && c.R.echoKind === 'backwall' && abs(c.R.xDiv - 2) <= 0.2; }, function () { const i = st().instrument; H.gate(10, 25); H.setInstrument({ delay: +(20 - 0.2 * i.range).toFixed(2) }); },
      { hk: 'X-SHIFT(지연)는 화면을 왼쪽으로 밀어냅니다: delay = 20 − 0.2·range.', he: 'X-SHIFT (delay) moves the trace left: delay = 20 − 0.2·range.', ok: '지연은 시간축의 영점을 옮길 뿐 에코 간격은 그대로입니다.', oe: 'Delay only moves the time-base zero; the echo spacing is unchanged.' }),
    S('AMP: 첫 에코 80 %', 'AMP until the first echo reads 80 %', function (c) { return !!c.R && abs(c.R.peakPct - 80) <= 3; }, function () { H.auto(80); },
      { hk: 'AMP(게인)를 올리거나 내려 게이트 안의 첫 저면 에코를 80 %에 맞추세요.', he: 'Raise or lower AMP (gain) until the gated first backwall reads 80 %.', ok: '80 % FSH는 대부분의 절차서에서 기준 에코 높이입니다.', oe: '80 % FSH is the reference height in most procedures.' }),
    S('SUPPRESSION 20 %', 'SUPPRESSION 20 %', function (c) { return c.S.instrument.reject === 20; }, function () { H.setInstrument({ reject: 20 }); },
      { hk: 'SUPPRESSION(리젝션) 노브를 20 %로.', he: 'Set the SUPPRESSION (reject) knob to 20 %.', ok: '리젝션은 기준선의 잡음(grass)을 잘라 냅니다 — 작은 지시도 함께 사라집니다.', oe: 'Reject cuts the grass off the baseline — small indications vanish with it.' }),
    C('리젝션의 부작용은?', 'The side effect of reject is…', [['linearity', '진폭 직선성 상실', 'Loss of amplitude linearity'], ['none', '없음', 'None', '리젝션은 낮은 진폭을 잘라내므로 dB 계산이 틀어집니다.', 'Reject removes the low part of every echo, so dB arithmetic no longer holds.'], ['gain', '게인 감소', 'Lower gain'], ['range', '측정 범위 변경', 'Range change']], 'linearity',
      { hk: '20 %를 잘라내면 60 % 에코와 30 % 에코의 비는 더 이상 2:1이 아닙니다.', he: 'After cutting 20 %, a 60 % and a 30 % echo are no longer 2:1.', ok: '규격(ISO 17640, ASME V)은 리젝션 사용을 금지하거나 기록을 요구합니다.', oe: 'Standards (ISO 17640, ASME V) forbid reject or require it to be recorded.' }),
    N('벽두께(mm)?', 'Wall thickness (mm)?', 20, 0.5, { hk: '저면 에코 간격 = 두께.', he: 'Backwall spacing = thickness.', ok: '파이프 6 in WT 20: 저면 에코 간격 20 mm.', oe: 'Pipe 6 in WT 20: backwall spacing 20 mm.' }),
  ]; };
  STEPS[3] = function () { return [
    S('툴바에서 0° 탐촉자를 선택', 'Select the 0° probe', function (c) { return c.S.probe.angle === 0; }, function () { H.click('tb-0'); },
      { hk: '자홍색 0° 버튼.', he: 'The magenta 0° button.', ok: '0° 종파 탐촉자는 두께 방향의 저면 에코와 라미네이션을 봅니다.', oe: 'The 0° compression probe sees the backwall and laminations through the thickness.' }),
    S('측정 범위를 125 mm로 (저면 에코 4개)', 'Range 125 mm so four backwall echoes fit', function (c) { return c.S.instrument.range >= 120 && c.S.instrument.range <= 140; }, function () { H.setInstrument({ range: 125 }); },
      { hk: 'RANGE 소프트키 후 ▲▼, 또는 휠.', he: 'RANGE softkey then ▲▼ or the wheel.', ok: 'V1 25 mm 면: 25/50/75/100 mm 다중 에코.', oe: 'V1 25 mm face: multiples at 25/50/75/100 mm.' }),
    C('화면 왼쪽 끝의 큰 신호는?', 'The big signal at the left edge is…', [['initial', '초기 펄스(송신 펄스)', 'Initial (transmit) pulse'], ['backwall', '저면 에코', 'Backwall echo', '저면 에코는 25 mm 위치에 있습니다.', 'The backwall echo sits at 25 mm.'], ['surface', '표면파', 'Surface wave'], ['defect', '결함 지시', 'Defect indication']], 'initial',
      { hk: '탐촉자 위치를 바꿔도 움직이지 않는 신호입니다.', he: 'It does not move when you move the probe.', ok: '초기 펄스 아래는 불감대: 이 구간의 반사체는 보이지 않습니다.', oe: 'Under the initial pulse lies the dead zone: reflectors there cannot be seen.' }),
    N('첫 번째 저면 에코의 위치(mm)?', 'Position of the first backwall echo (mm)', 25, 1, { hk: '게이트를 걸면 SP 표시값을 읽을 수 있습니다.', he: 'Gate it and read SP.', ok: 'V1의 얇은 면 두께 25 mm.', oe: 'The narrow face of the V1 is 25 mm thick.' }),
    S('Probes ▸ Zero Probe ▸ Twin Crystal – 초기 펄스가 사라짐', 'Probes ▸ Zero Probe ▸ Twin Crystal — the initial pulse disappears', function (c) { return c.S.probe.crystal === 'twin' && !!c.frame.ascan && c.frame.ascan.initialPulse === false; },
      function () { H.menu(['Probes/Zero Probe - Twin or Single Crystal/Twin Crystal'], function () { H.setProbe({ crystal: 'twin' }); }); },
      { hk: 'Probes 메뉴 ▸ Zero Probe 하위 메뉴.', he: 'Probes menu ▸ Zero Probe submenu.', ok: '송·수신 진동자가 분리되어 송신 펄스가 수신부에 들어오지 않습니다.', oe: 'Separate transmit/receive crystals keep the transmit pulse out of the receiver.' }),
    S('게이트 1을 첫 저면 에코에 걸고 DP 25.0 ± 0.3', 'Gate the first echo: DP reads 25.0 ± 0.3', function (c) { return !!c.R && c.R.echoKind === 'backwall' && abs(c.R.dp - 25) <= 0.3; }, function () { H.gate(15, 20); },
      { hk: 'GATES 키: G1 start 15, width 20.', he: 'GATES key: G1 start 15, width 20.', ok: 'DP(깊이) 표시값은 게이트 안 최대 피크의 위치입니다.', oe: 'DP (depth) is the position of the highest peak inside the gate.' }),
    C('이중진동자 탐촉자를 쓰는 이유는?', 'Why use a twin-crystal probe?', [['nearsurface', '불감대 감소 – 근거리 분해능', 'Smaller dead zone — near-surface resolution'], ['deeper', '더 깊은 투과', 'Deeper penetration'], ['narrow', '더 좁은 빔', 'Narrower beam'], ['shear', '횡파 발생', 'Generates shear waves']], 'nearsurface',
      { hk: '초기 펄스가 사라진 것을 보셨죠?', he: 'You saw the initial pulse vanish.', ok: '얇은 판·부식 측정·표면 직하 라미네이션은 이중진동자로.', oe: 'Thin plate, corrosion mapping and near-surface laminations: use a twin probe.' }),
    S('저면 에코 4개 확인 (≥ 5 %)', 'Four backwall echoes ≥ 5 %', function (c) { return c.E.filter(function (e) { return e.kind === 'backwall' && e.ampPct >= 5; }).length >= 4; },
      function () { for (let k = 0; k < 6; k++) { const n = UT.frame.echoes.filter(function (e) { return e.kind === 'backwall' && e.ampPct >= 5; }).length; if (n >= 4) break; H.setInstrument({ gain: st().instrument.gain + 4 }); } },
      { hk: '필요하면 게인을 조금 올리세요.', he: 'Raise the gain a little if needed.', ok: '다중 에코는 매번 2–5 dB씩 줄어듭니다 (감쇠 + 빔 확산).', oe: 'Each multiple is 2–5 dB lower than the last (attenuation + beam spread).' }),
  ]; };
  STEPS[4] = function () { return [
    S('45° 탐촉자 선택', 'Select the 45° probe', function (c) { return c.S.probe.angle === 45; }, function () { H.click('tb-45'); }, { hk: '노란 45° 버튼.', he: 'Yellow 45° button.', ok: 'V1 블록은 100 mm 반경으로 사각 탐촉자의 입사점·범위를 교정합니다.', oe: 'The V1 block calibrates index and range of angle probes on its 100 mm radius.' }),
    S('입사점을 x = 100(반경 중심)에', 'Index at x = 100 (radius centre)', function (c) { return c.S.mode === 'v1' && abs(c.S.probe.x - 100) <= 1 && c.S.probe.side === 1; }, function () { H.setProbe({ x: 100, side: 1 }); },
      { hk: '반경 중심 "0" 표시 위에 입사점을 두세요.', he: 'Put the index point over the "0" mark of the radius centre.', ok: '입사점이 중심에 있을 때만 반사가 자기 자신으로 돌아옵니다.', oe: 'Only with the index point at the centre does the radius reflect back on itself.' }),
    S('범위 400: 100/200/300 mm 에코', 'Range 400: echoes 100/200/300', function (c) { return c.S.instrument.range >= 300 && [100, 200, 300].every(function (p) { return near(c.E, null, p, 1); }); }, function () { H.setInstrument({ range: 400 }); },
      { hk: 'RANGE 키를 눌러 400으로.', he: 'Press RANGE until 400.', ok: '홈(슬롯)이 반사를 되돌려 100 mm 간격의 다중 에코를 만듭니다.', oe: 'The slot retro-reflects the beam, giving multiples every 100 mm.' }),
    C('100 mm 반경 에코로 확인하는 것은?', 'The 100 mm radius echo checks…', [['index-range', '입사점과 측정 범위(거리 교정)', 'Index point and range (distance calibration)'], ['angle', '굴절각', 'Refracted angle', '굴절각은 1.5 mm 구멍 또는 퍼스펙스 옆 눈금으로 확인합니다.', 'The angle is checked on the 1.5 mm hole / angle scale.'], ['sens', '감도', 'Sensitivity'], ['vel', '쐐기 속도', 'Wedge velocity']], 'index-range',
      { hk: '에코 최대일 때 눈금 0에 있는 점이 무엇일까요?', he: 'What sits at the 0 mark when the echo peaks?', ok: '최대 에코 위치 = 입사점, 에코 위치 100 mm = 측정 범위 교정.', oe: 'Echo maximum → index point; echo at 100 mm → range calibration.' }),
    S('x = 150 (135 + 15·tan45)으로 이동해 1.5 mm 구멍 에코', 'Move to x = 150 for the 1.5 mm hole', function (c) { return abs(c.S.probe.x - 150) <= 3 && c.E.some(function (e) { return e.kind === 'sdh' && abs(e.path - 21.2) <= 1 && e.ampPct >= 10; }); }, function () { H.setInstrument({ range: 100, gain: 40 }); H.setProbe({ x: 150 }); },
      { hk: '구멍 (135, 15): x = 135 + 15·tan45 = 150. 게인 40, 범위 100.', he: 'Hole at (135, 15): x = 135 + 15·tan45 = 150. Gain 40, range 100.', ok: '빔 노정 15/cos45 = 21.2 mm.', oe: 'Beam path 15/cos45 = 21.2 mm.' }),
    C('1.5 mm 구멍의 용도는?', 'The 1.5 mm hole is used for…', [['angle', '굴절각 점검(눈금과 대조)', 'Angle check (against the scale)'], ['index', '입사점', 'Index point'], ['range', '측정 범위', 'Range'], ['reso', '분해능', 'Resolution']], 'angle',
      { hk: '에코 최대일 때 입사점이 블록의 각도 눈금 어디에 오는지 봅니다.', he: 'At the maximum, read where the index point sits on the angle scale.', ok: '측정 각도가 명판과 2° 이상 다르면 탐촉자를 교체하거나 기록합니다.', oe: 'If the measured angle differs by > 2° from the nameplate, replace or record.' }),
    S('x = 240, 0°: 퍼스펙스 인서트 에코', '0° at x = 240: Perspex insert echo', function (c) { return c.S.probe.angle === 0 && c.E.some(function (e) { return e.kind === 'perspex'; }); },
      function () { H.click('tb-0'); if (has('modes.setFace')) UT.modes.setFace('wide'); H.setProbe({ x: 240 }); UT.renderNow(); },
      { hk: '0° 탐촉자를 퍼스펙스 인서트(x 240, 넓은 면) 위에.', he: 'Put the 0° probe over the Perspex insert (x 240 on the wide face).', ok: '퍼스펙스 23 mm는 강 50 mm과 같은 시간 — 종파 속도 점검.', oe: '23 mm Perspex takes the time of 50 mm steel — a compression-velocity check.' }),
    C('퍼스펙스 에코가 50 mm 강 등가 위치에 오지 않으면?', 'If the Perspex echo is not at the 50 mm-steel position…', [['zero-vel', '영점/속도 교정을 다시 한다', 'Redo the zero/velocity calibration'], ['gain', '게인을 올린다', 'Raise the gain'], ['probe', '탐촉자 교체', 'Replace the probe'], ['ignore', '무시', 'Ignore']], 'zero-vel',
      { hk: '위치 오차는 진폭과 무관합니다.', he: 'A position error has nothing to do with amplitude.', ok: '시간축(속도·영점)이 틀리면 모든 깊이 표시값이 틀립니다.', oe: 'A wrong time base (velocity/zero) makes every depth reading wrong.' }),
  ]; };
  STEPS[5] = function () { return [
    S('건전부에서 저면 에코를 게이트 (DP 25.0)', 'Gate the backwall on a clean spot (DP 25.0)', function (c) { return !!c.R && c.R.echoKind === 'backwall' && abs(c.R.dp - 25) <= 0.5; }, function () { H.setProbe({ x: -10, z: 10 }); H.gate(15, 20); },
      { hk: 'x −10, z 10은 라미네이션이 없는 곳입니다. G1 start 15 width 20.', he: 'x −10, z 10 is clean. G1 start 15, width 20.', ok: '건전부의 저면 에코 높이가 이후 비교의 기준입니다.', oe: 'The clean-spot backwall height is the reference for what follows.', keep: ['bwClean'], onPass: function (c) { return { bwClean: c.R.peakPct }; } }),
    TR('z 방향 래스터로 라미네이션 위로 (x 27, z 65)', 'Raster along z onto the lamination (x 27, z 65)', function (c) { return c.E.some(function (e) { return e.kind === 'lamination' && abs(e.path - 10) <= 1 && e.ampPct >= 20; }); }, function () { H.setProbe({ x: 27, z: 65 }); },
      { hk: '↑/↓ 키로 z를, 드래그로 x를 바꾸세요. 라미네이션은 x 15…40, z 40…90.', he: '↑/↓ move z, drag moves x. The lamination lies at x 15…40, z 40…90.', ok: '라미네이션 에코는 저면보다 앞(깊이 10)에 나타나고 저면 에코를 가립니다.', oe: 'The lamination echo appears before the backwall (depth 10) and shadows it.' }),
    C('지금 저면 에코는?', 'The backwall echo now…', [['lost', '소실 또는 −6 dB 이상 감소', 'Lost or ≥ 6 dB down'], ['same', '변화 없음', 'Unchanged', '라미네이션이 빔을 가로막습니다.', 'The lamination blocks the beam.'], ['double', '2배', 'Doubled'], ['closer', '더 가까워짐', 'Closer']], 'lost',
      { also: function (c) { const bw = c.E.filter(function (e) { return e.kind === 'backwall'; }).map(function (e) { return e.ampPct; }); const now = bw.length ? Math.max.apply(null, bw) : 0; return Number.isFinite(c.memo.bwClean) ? now <= c.memo.bwClean * 0.5 : true; },
        ak: '탐촉자가 라미네이션 위(x 27, z 65)에 있어야 합니다.', ae: 'The probe must stay over the lamination (x 27, z 65).', hk: '저면 에코 높이를 건전부와 비교하세요.', he: 'Compare the backwall height with the clean spot.', ok: '저면 에코 소실은 라미네이션·큰 개재물·접촉 불량의 신호입니다.', oe: 'Loss of backwall means lamination, a large inclusion or bad coupling.' }),
    N('라미네이션 깊이(mm)?', 'Lamination depth (mm)?', 10, 0.5, { hk: '게이트를 앞으로 옮겨 DP를 읽으세요.', he: 'Move the gate forward and read DP.', ok: '깊이 10 mm: 판 두께의 40 %.', oe: 'Depth 10 mm — 40 % of the plate.' }),
    S('SIZE 창: 6 dB 드롭으로 z 길이 측정 (≈ 50 mm)', 'Size along z with the 6 dB drop (≈ 50 mm)', function (c) { const z = c.S.sizing; return z.method === '6dB' && !!z.result && abs(z.result.length - 50) <= 6; },
      function () { H.sizingOpen(); H.sizingMethod('6dB'); H.setProbe({ x: 27, z: 40 }); H.markL(); H.setProbe({ z: 90 }); H.markR(); },
      { hk: 'SIZE 버튼 → 최대에서 −6 dB 되는 양쪽 z에서 Mark L / Mark R.', he: 'SIZE button → Mark L / Mark R where the echo halves (−6 dB) at each end.', ok: '6 dB 드롭: 빔 중심이 반사체 끝을 지날 때 에코가 절반이 됩니다.', oe: '6 dB drop: the echo halves when the beam centre passes the reflector edge.' }),
    C('6 dB 드롭법이 유효한 경우는?', 'The 6 dB drop is valid when…', [['bigger', '반사체가 빔 폭보다 클 때', 'The reflector is larger than the beam'], ['smaller', '빔보다 작을 때', 'Smaller than the beam', '빔보다 작으면 빔 폭을 재게 됩니다.', 'Smaller than the beam you measure the beam width.'], ['always', '항상', 'Always'], ['volumetric', '체적 결함만', 'Volumetric only']], 'bigger',
      { hk: '빔보다 작은 반사체에서는 무엇을 재는 걸까요?', he: 'What do you measure on a reflector smaller than the beam?', ok: '작은 반사체는 20 dB 드롭 또는 최대 진폭법으로.', oe: 'Small reflectors: 20 dB drop or maximum-amplitude technique.' }),
    C('보고서 조치?', 'Report action?', [['record-both', '위치·깊이·길이·폭을 기록하고 사각 주사 시 고려', 'Record position, depth, length, width; allow for it in the angle scan'], ['ignore', '무시', 'Ignore'], ['grind', '연삭 지시', 'Order grinding'], ['only-depth', '깊이만 기록', 'Depth only']], 'record-both',
      { hk: '라미네이션은 사각 빔을 가로막습니다.', he: 'A lamination blocks the angle beam.', ok: 'ISO 17640 B/C: 주사면의 라미네이션 검사 후 사각 주사 계획을 조정합니다.', oe: 'ISO 17640 B/C: check the scanning zone for laminations, then adapt the angle scan.' }),
  ]; };
  STEPS[6] = function () { return [
    S('side +1, 범위 250: 25/100/175 mm 에코', 'Side +1, range 250: echoes 25/100/175', function (c) { return c.S.probe.side === 1 && [25, 100, 175].every(function (p) { return near(c.E, null, p, 1); }); }, function () { H.setInstrument({ range: 250 }); H.setProbe({ x: 60, side: 1 }); },
      { hk: 'R25를 향해(side +1) 입사점 x 60, 범위 250.', he: 'Facing R25 (side +1), index x 60, range 250.', ok: 'R25 → 25, 그 뒤 R50 왕복이 더해져 100, 175…', oe: 'R25 gives 25; the R50 round trip adds 75 each time: 100, 175…' }),
    S('side −1: 50/125/200', 'Side −1: 50/125/200', function (c) { return c.S.probe.side === -1 && [50, 125, 200].every(function (p) { return near(c.E, null, p, 1); }); }, function () { H.setProbe({ side: -1 }); },
      { hk: '탐촉자를 돌리세요 (side −1).', he: 'Turn the probe round (side −1).', ok: 'R50 → 50, 이후 75 mm 간격.', oe: 'R50 gives 50, then every 75 mm.' }),
    S('최대 에코에서 입사점 확인 (|x − 60| ≤ 1)', 'Index check at the maximum (|x − 60| ≤ 1)', function (c) { return abs(c.S.probe.x - 60) <= 1 && near(c.E, null, 25, 0.5) || abs(c.S.probe.x - 60) <= 1 && near(c.E, null, 50, 0.5); }, function () { H.setProbe({ x: 60, side: 1 }); },
      { hk: '에코가 최대일 때 입사점은 반경 중심(눈금 0) 위에 있습니다.', he: 'At the maximum the index point sits over the radius centre (0 mark).', ok: '입사점 표시가 눈금과 다르면 그 차이를 기록합니다.', oe: 'Record any offset between the probe index mark and the scale.' }),
    N('반경 차이(mm)?', 'Radius difference (mm)?', 25, 1, { hk: 'R50 − R25.', he: 'R50 − R25.', ok: '두 반경의 차 25 mm가 다중 에코 간격 75 mm의 근거입니다 (25 + 50).', oe: 'The 25 mm difference explains the 75 mm multiple spacing (25 + 50).' }),
    C('V2 블록의 용도는?', 'The V2 block is used for…', [['index-angle-range', '입사점·굴절각·측정 범위 확인', 'Index, angle and range checks'], ['sens', '감도 설정', 'Sensitivity'], ['vel', '속도 측정', 'Velocity'], ['reso', '분해능', 'Resolution']], 'index-angle-range',
      { hk: '작은 현장용 표준 시험편입니다.', he: 'It is the small field calibration block.', ok: 'V2(STB-A3): 휴대용, 사각 탐촉자 교정 전용.', oe: 'V2 (STB-A3): portable, for angle-probe calibration.' }),
    S('5 mm 구멍(전면)으로 굴절각 확인 (SDH ≥ 40 %)', 'Angle check on the 5 mm hole (front face, SDH ≥ 40 %)', function (c) { return c.E.some(function (e) { return e.kind === 'sdh' && e.ampPct >= 40; }); },
      function () { if (has('modes.setFace')) UT.modes.setFace('narrow'); const h = H.hole5(st().specimen); if (h) H.maximise(function (e) { return e.kind === 'sdh'; }, H.range(h.x + h.y * T45 - 4, h.x + h.y * T45 + 4, 0.5), { side: 1 }); H.setInstrument({ range: 100 }); H.auto(80); },
      { hk: '좁은 면(전면)으로 돌린 뒤 x = 60 + 6.25·tan45 ≈ 66. 필요하면 게인을 올리세요.', he: 'Switch to the narrow face; x = 60 + 6.25·tan45 ≈ 66. Raise the gain if needed.', ok: '최대 에코에서 입사점이 가리키는 각도 눈금 = 실제 굴절각.', oe: 'At the maximum the index point shows the true refracted angle on the scale.' }),
  ]; };
  STEPS[7] = function () { return [
    S('T/2 횡공 에코 최대 (≈ 40 %)', 'T/2 SDH maximised (≈ 40 %)', function (c) { return c.E.some(function (e) { return e.kind === 'sdh' && abs(e.path - 20) <= 1 && e.ampPct >= 30; }); },
      function () { const h = H.hole(st().specimen, 10); if (h) H.setProbe({ x: +(h.x + 10 * T60).toFixed(1) }); }, { hk: HOLE_KO, he: HOLE_EN, ok: '빔 노정 10/cos60 = 20 mm.', oe: 'Beam path 10/cos60 = 20 mm.' }),
    S('30.0 dB 소프트키 (+6 dB): 에코 2배', 'Press 30.0 dB (+6 dB): the echo doubles', function (c) { return c.S.instrument.gain === 30 && !!c.R && c.R.peakPct >= 70 && c.R.peakPct <= 90; }, function () { H.setInstrument({ gain: 30 }); },
      { hk: 'EPOCH 소프트키 열의 30.0 dB.', he: 'The 30.0 dB softkey.', ok: '+6 dB = ×2: 40 % → 80 %.', oe: '+6 dB = ×2: 40 % → 80 %.' }),
    N('에코 높이 %?', 'Echo height %?', function (c) { return c.R ? c.R.peakPct : NaN; }, 5, { hk: '게이트 판독 % 값을 읽으세요.', he: 'Read the gate % readout.', ok: '읽은 값이 80 % 근처면 기준 감도입니다.', oe: 'Near 80 % — that is the reference height.' }),
    S('40.0 dB: 클리핑 – 언클립 % 박스 읽기', '40 dB: clipped — read the unclipped % box', function (c) { return c.S.instrument.gain === 40 && !!c.R && c.R.peakPct > 120; }, function () { H.setInstrument({ gain: 40 }); },
      { hk: '40.0 dB 소프트키.', he: 'The 40.0 dB softkey.', ok: '+10 dB = ×3.16: 80 % → 250 %. 화면은 100 %에서 잘리지만 판독 박스는 계속 계산합니다.', oe: '+10 dB = ×3.16: 80 → 250 %. The screen clips at 100 %, the readout still computes.' }),
    C('+6 dB = 진폭 몇 배?', '+6 dB multiplies amplitude by', [['x2', '2배', '×2'], ['x1.5', '1.5배', '×1.5'], ['x4', '4배', '×4', '×4는 +12 dB.', '×4 is +12 dB.'], ['x10', '10배', '×10', '×10은 +20 dB.', '×10 is +20 dB.']], 'x2',
      { hk: 'dB = 20·log10(A2/A1).', he: 'dB = 20·log10(A2/A1).', ok: '6 dB ↔ 2배, 12 dB ↔ 4배, 20 dB ↔ 10배.', oe: '6 dB ↔ ×2, 12 dB ↔ ×4, 20 dB ↔ ×10.' }),
    C('80 % → 20 %로 낮추려면?', 'To bring 80 % down to 20 %', [['-12', '−12 dB', '−12 dB'], ['-6', '−6 dB', '−6 dB', '−6 dB는 40 %.', '−6 dB gives 40 %.'], ['-14', '−14 dB', '−14 dB'], ['-20', '−20 dB', '−20 dB', '−20 dB는 8 %.', '−20 dB gives 8 %.']], '-12',
      { hk: '80 → 40 → 20: 6 dB 두 번.', he: '80 → 40 → 20: two steps of 6 dB.', ok: '20 % DAC(ASME 기록 레벨)는 기준보다 −14 dB입니다 — 헷갈리지 마세요.', oe: '20 % DAC (ASME recording level) is −14 dB, not −12 — do not mix them up.' }),
    S('게인을 조절해 정확히 80 % (AUTO 80 가능)', 'Set exactly 80 % (AUTO 80 allowed)', function (c) { return !!c.R && abs(c.R.peakPct - 80) <= 2; }, function () { H.auto(80); },
      { hk: '2ND F + GATES = AUTO 80, 또는 ▲▼ 0.5 dB.', he: '2ND F + GATES = AUTO 80, or ▲▼ in 0.5 dB.', ok: '기준 반사체 80 % → 이 게인이 기준 감도.', oe: 'Reference reflector at 80 % → this gain is the reference sensitivity.' }),
    C('기준 감도 34 dB, 주사 감도 +6 dB. 지시가 주사 감도에서 60 % → 기준 감도 대비?', 'Ref 34 dB, scanning +6 dB; 60 % at scanning gain — relative to reference?', [['30pct', '30 % (−6 dB)', '30 % (−6 dB)'], ['60pct', '60 %', '60 %', '주사 감도는 기준보다 6 dB 높습니다.', 'Scanning gain is 6 dB above reference.'], ['120pct', '120 %', '120 %'], ['15pct', '15 %', '15 %']], '30pct',
      { hk: '주사 여유 6 dB를 빼세요.', he: 'Take the 6 dB scanning allowance off.', ok: '평가는 항상 기준 감도에서: 60 % − 6 dB = 30 %.', oe: 'Evaluate always at reference sensitivity: 60 % − 6 dB = 30 %.' }),
  ]; };
  STEPS[8] = function () { return [
    S('ADJUST MODE 슬라이더로 브레이스 각도 50°', 'ADJUST MODE slider: brace angle 50°', function (c) { return !!c.spec && !!c.spec.tky && abs(c.spec.tky.braceAngle - 50) < 0.6; }, function () { if (has('modes.rebuild')) UT.modes.rebuild({ braceAngle: 50 }); UT.renderNow(); },
      { hk: 'TKY 창(ADJUST MODE)의 슬라이더.', he: 'The slider in the TKY window (ADJUST MODE).', ok: '브레이스 각도가 작아질수록 힐 쪽 융합면이 가팔라집니다.', oe: 'A smaller brace angle steepens the heel-side fusion face.' }),
    S('Load Def: 토우 융합불량', 'Load Def: the toe LOF', function (c) { return c.S.defects.some(function (d) { return d.type === 'lof'; }); }, function () { H.toeLof(); },
      { hk: 'TKY 창의 Load Def 버튼.', he: 'The Load Def button of the TKY window.', ok: '토우 융합면은 코드 표면 바로 아래에 있습니다.', oe: 'The toe fusion face lies just under the chord surface.' }),
    S('토우 LOF 에코를 최대로 (≥ 40 %)', 'Maximise the toe LOF echo (≥ 40 %)', function (c) { return c.E.some(function (e) { return (e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip') && e.ampPct >= 40; }); },
      function () { const sp = st().specimen; const x0 = sp && sp.tky ? sp.tky.toe.x + sp.tky.weldLeg : 0; H.maximise(function (e) { return e.kind === 'defect' || e.kind === 'corner'; }, H.range(x0 + 4, x0 + 70, 2)); H.auto(80); },
      { hk: '코드 위에서 탐촉자를 토우 쪽으로 움직이며 최대를 찾고 게인을 올리세요.', he: 'Move the probe on the chord toward the toe for the maximum, then raise the gain.', ok: '0.5 스킵으로 토우 융합면을 직접 맞힙니다.', oe: 'Half skip hits the toe fusion face directly.' }),
    S('45°로 전환', 'Switch to 45°', function (c) { return c.S.probe.angle === 45; }, function () { H.click('tb-45'); }, { hk: '노란 45° 버튼.', he: 'Yellow 45° button.', ok: '45°는 가파른 융합면에, 60/70°는 완만한 면에 수직으로 만납니다.', oe: '45° meets steep faces at right angles; 60/70° suit shallow faces.' }),
    C('브레이스 측에서 주사해야 하는 이유?', 'Why scan from the brace side too?', [['geometry', '코드 측에서 접근 불가한 융합면', 'Fusion faces unreachable from the chord'], ['gain', '게인이 낮아서', 'Lower gain'], ['easier', '더 쉬워서', 'Easier'], ['rule', '규정이라서', 'The rule says so']], 'geometry',
      { hk: '힐 쪽 융합면의 방향을 생각하세요.', he: 'Think about the heel fusion face direction.', ok: '힐 쪽 융합면은 브레이스에서 0.5 스킵으로만 수직 입사됩니다.', oe: 'The heel fusion face is only met normally from the brace at half skip.' }),
    N('브레이스 각도(°)?', 'Brace angle (°)?', function (c) { return c.spec && c.spec.tky ? c.spec.tky.braceAngle : 50; }, 2, { hk: '상태 표시줄 Brace angle.', he: 'Status bar: Brace angle.', ok: '각도는 절차서 도면과 일치해야 합니다.', oe: 'The angle must match the procedure drawing.' }),
  ]; };
  STEPS[9] = function () { return [
    S('13 mm 횡공 에코를 최대로', 'Maximise the 13 mm SDH', function (c) { return near(c.E, 'sdh', 26, 0.5) && abs(c.S.probe.x - 262.5) <= 1.5; }, function () { H.setInstrument({ gates: [{ on: true, start: 10, width: 90, level: 10 }] }); H.setProbe({ x: 262.5 }); },
      { hk: 'x = 240 + 13·tan60 = 262.5.', he: 'x = 240 + 13·tan60 = 262.5.', ok: '빔 노정 13/cos60 = 26 mm.', oe: 'Beam path 13/cos60 = 26 mm.' }),
    S('80 %로 설정', 'Set 80 %', function (c) { return !!c.R && abs(c.R.peakPct - 80) <= 3; }, function () { H.auto(80); }, { hk: 'AUTO 80.', he: 'AUTO 80.', ok: '80 %가 20 dB 드롭(10 %)의 기준입니다.', oe: '80 % is the reference for the 20 dB drop (10 %).' }),
    TR('앞으로 이동해 10 % (−20 dB)에서 Mark 10% edge', 'Move forward to 10 % and press Mark 10% edge', function (c) { return c.S.plot.edgeMarks.some(function (m) { return m.depth === 13 && m.standOff < 22.5; }); }, function () { H.setProbe({ x: 262.5 }); H.walkUntil(-0.5, 10); H.markEdge(); },
      { hk: '탐촉자를 구멍 쪽(x 감소)으로 조금씩 옮겨 10 %가 되면 Mark 10% edge.', he: 'Step the probe toward the hole (x decreasing) until 10 %, then Mark 10% edge.', ok: '빔 뒤쪽 에지(−20 dB)가 구멍을 지나는 위치입니다.', oe: 'This is where the trailing −20 dB edge of the beam passes the hole.' }),
    S('뒤로 이동해 반대쪽 에지', 'Same backward', function (c) { return c.S.plot.edgeMarks.filter(function (m) { return m.depth === 13; }).length >= 2; }, function () { H.setProbe({ x: 262.5 }); H.walkUntil(0.5, 10); H.markEdge(); },
      { hk: '262.5에서 x 증가 방향으로.', he: 'From 262.5 in the +x direction.', ok: '두 마크의 간격이 13 mm 깊이의 20 dB 빔 폭.', oe: 'The two marks span the 20 dB beam width at 13 mm.' }),
    S('19/25/43 mm 구멍에서 반복', 'Repeat for 19/25/43', function (c) { return [13, 19, 25, 43].every(function (d) { return c.S.plot.edgeMarks.filter(function (m) { return m.depth === d; }).length >= 2; }); },
      function () { const sp = st().specimen; [19, 25, 43].forEach(function (d) { const h = H.hole(sp, d); if (!h) return; const x0 = +(h.x + d * T60).toFixed(1); H.setProbe({ x: x0 }); H.auto(80); H.walkUntil(-0.5, 10); H.markEdge(); H.setProbe({ x: x0 }); H.walkUntil(0.5, 10); H.markEdge(); }); },
      { hk: '각 구멍: x = 구멍 x + 깊이·tan60, 80 % 후 양쪽 10 %.', he: 'Each hole: x = hole x + depth·tan60, 80 %, then 10 % each side.', ok: '깊이가 커질수록 빔 폭이 커집니다 — 플로터 카드에 그려집니다.', oe: 'The beam widens with depth — drawn on the plotter card.' }),
    N('13 mm 깊이의 20 dB 빔 폭(mm)?', '20 dB beam width at 13 mm (mm)?', function (c) { const ms = c.S.plot.edgeMarks.filter(function (m) { return m.depth === 13; }); const f = ms.filter(function (m) { return m.standOff < 22.5; }), b = ms.filter(function (m) { return m.standOff >= 22.5; }); return f.length && b.length ? abs(f[0].standOff - b[b.length - 1].standOff) : NaN; }, 0.2,
      { rel: true, hk: '두 마크 stand-off의 차.', he: 'Difference of the two stand-offs.', ok: '실제 결함 플로팅에서 이 폭이 위치 불확실성이 됩니다.', oe: 'When plotting a real defect this width is your position uncertainty.' }),
    C('플롯한 빔 에지의 용도는?', 'The plotted edges are used to…', [['plot-size', '결함 에지를 플로팅해 실제 위치·크기 산정', 'Plot defect edges for true position and size'], ['gain', '감도 설정', 'Set sensitivity'], ['index', '입사점', 'Index point'], ['vel', '속도', 'Velocity']], 'plot-size',
      { hk: '20 dB 드롭 사이징의 보정값입니다.', he: 'It is the correction for 20 dB drop sizing.', ok: '20 dB 드롭 길이 = 마크 간격 − 빔 폭.', oe: '20 dB drop length = mark spacing − beam width.' }),
  ]; };
  STEPS[10] = function () { return [
    S('브러시로 루트 균열을 그리기 (y ≥ 19까지)', 'Paint a root crack with the brush (down to y ≥ 19)', function (c) { return c.S.defects.some(function (d) { return d.pts && d.pts.length >= 2 && bbox(d.pts).yMax >= 19; }); },
      function () { H.setDefects([{ n: 1, type: 'planar', pts: [{ x: 0, y: 17 }, { x: 0, y: 20 }], zFrom: 135, zTo: 165, label: 'Defect 1' }]); },
      { hk: '결함 편집기(DEFECT)를 열고 단면의 루트(y 17…20)에서 아래로 드래그.', he: 'Open the defect editor and drag downward at the root (y 17…20).', ok: '루트 개구 균열은 저면(y = T)에 닿습니다.', oe: 'A root crack breaks the back surface (y = T).' }),
    S('LENGTH 30 / SEPARATION 20', 'LENGTH 30 / SEPARATION 20', function (c) { return c.S.defects.some(function (d) { return abs((d.zTo - d.zFrom) - 30) <= 0.5; }); },
      function () { const d = st().defects[0]; H.setDefects([Object.assign({}, d || { n: 1, type: 'planar', pts: [{ x: 0, y: 17 }, { x: 0, y: 20 }] }, { zFrom: 135, zTo: 165 })]); },
      { hk: '편집기의 LENGTH 30, SEPARATION 20 입력.', he: 'Editor fields LENGTH 30, SEPARATION 20.', ok: '길이 30 mm: z 방향 범위.', oe: 'Length 30 mm along z.' }),
    S('APPLY TO ALL, OK (편집기 닫기)', 'APPLY TO ALL, OK (close the editor)', function (c) { return c.S.editing.defect === false; }, function () { if (has('modes.defectEditor.close')) UT.modes.defectEditor.close(); else UT.setIn('editing', { defect: false }); UT.renderNow(); },
      { hk: 'OK 버튼으로 편집기를 닫습니다.', he: 'Close the editor with OK.', ok: '편집기가 열려 있는 동안은 드래그가 브러시입니다.', oe: 'While the editor is open, dragging paints.' }),
    S('z 방향으로 결함 중심까지 주사', 'Scan along z to the defect centre', function (c) { const d = c.S.defects[0]; const zc = d ? (d.zFrom + d.zTo) / 2 : 150; return c.memo.ui.drag >= 1 && abs(c.S.probe.z - zc) <= 5; },
      function () { const d = st().defects[0]; H.dragTo(st().probe.x, { z: d ? (d.zFrom + d.zTo) / 2 : 150 }); },
      { hk: '↑/↓ 키 또는 평면도 드래그로 z를 맞추세요.', he: 'Use ↑/↓ or drag in the plan view to set z.', ok: '결함 중심에서 코너 에코가 최대입니다.', oe: 'The corner echo peaks at the defect centre.' }),
    C('루트 균열의 전형적 에코는?', 'The typical root-crack echo is…', [['corner', '코너 에코 (0.5 스킵, 강함)', 'Corner echo (half skip, strong)'], ['tip', '팁 회절만', 'Tip only', '팁은 약합니다; 코너가 지배적입니다.', 'Tips are weak; the corner dominates.'], ['weak', '약한 지시', 'Weak indication'], ['none', '없음', 'None']], 'corner',
      { hk: '균열과 저면이 90°를 이룹니다.', he: 'Crack and backwall form a 90° corner.', ok: '코너 에코는 각도와 무관하게 되돌아옵니다 — 표면 개구 결함의 표지.', oe: 'A corner reflects back regardless of angle — the signature of a surface-breaking defect.' }),
    N('코너 에코 빔 노정(mm)?', 'Corner-echo beam path (mm)?', 40, 1.5, { hk: 'T/cos60.', he: 'T/cos60.', ok: '20/cos60 = 40 mm, 탐촉자 x ≈ 34.6.', oe: '20/cos60 = 40 mm, probe at x ≈ 34.6.' }),
  ]; };
  STEPS[11] = function () { return [
    S('Gain 소프트키 + 화살표로 36 dB', 'Gain softkey + arrows to 36 dB', function (c) { return c.S.instrument.gain === 36 && (c.memo.ui.softkey.indexOf('gain') >= 0 || c.memo.ui.softkey.indexOf('db') >= 0); },
      function () { H.softkey('gain'); if (has('instruments._.adjust')) { for (let k = 0; k < 12 && st().instrument.gain < 36; k++) UT.instruments._.adjust('gain', 1, false); } if (st().instrument.gain !== 36) H.setInstrument({ gain: 36 }); UT.renderNow(); },
      { hk: 'dB 키(또는 Gain 소프트키)를 누른 뒤 ▲ 0.5 dB씩.', he: 'Press dB (or the Gain softkey), then ▲ in 0.5 dB steps.', ok: '선택된 파라미터가 소프트키 열에 강조됩니다.', oe: 'The selected parameter is highlighted in the softkey column.' }),
    S('RANGE 키 → 100', 'RANGE key → 100', function (c) { return c.S.instrument.range === 100; }, function () { for (let k = 0; k < 4 && st().instrument.range !== 100 && has('instruments._.keys.range'); k++) UT.instruments._.keys.range(); if (st().instrument.range !== 100) H.setInstrument({ range: 100 }); UT.renderNow(); },
      { hk: 'RANGE 하드키는 50/100/200/400을 순환합니다.', he: 'The RANGE hard key cycles 50/100/200/400.', ok: '범위 100: 60° 탐촉자의 1 스킵(80 mm)이 들어옵니다.', oe: 'Range 100 shows the full skip (80 mm) of the 60° probe.' }),
    S('GATES → G1 start 30, width 20', 'GATES → G1 start 30, width 20', function (c) { const g = c.S.instrument.gates[0]; return g.on && g.start === 30 && g.width === 20; }, function () { H.gate(30, 20); },
      { hk: 'GATES 키 → Start / Width 소프트키.', he: 'GATES key → Start / Width softkeys.', ok: '게이트 30…50이 루트 코너 에코(40 mm)를 감시합니다.', oe: 'Gate 30…50 watches the root corner echo (40 mm).' }),
    TR('PEAK MEM 켜고 탐촉자를 앞뒤로 주사', 'PEAK MEM on, then sweep the probe', function (c) { return c.S.instrument.peakMem === true && c.memo.ui.drag >= 1; }, function () { H.setInstrument({ peakMem: true }); H.dragTo(30); H.dragTo(45); },
      { hk: 'PEAK MEM 키 후 단면도에서 탐촉자를 드래그.', he: 'Press PEAK MEM, then drag the probe in the cross section.', ok: '피크 메모리는 에코 다이내믹 포락선을 남깁니다.', oe: 'Peak memory keeps the echo-dynamic envelope.' }),
    S('Freeze', 'Freeze', function (c) { return c.S.instrument.freeze === true; }, function () { H.setInstrument({ freeze: true }); }, { hk: 'FREEZE 키.', he: 'FREEZE key.', ok: '프리즈 상태에서 판독값을 기록합니다.', oe: 'Take the readings while frozen.' }),
    C('피크 메모리의 용도는?', 'Peak memory is used for…', [['echodynamic', '에코 다이내믹 포락선/최대치 기록', 'Echo-dynamic envelope / maximum capture'], ['gain', '게인 자동 조정', 'Automatic gain'], ['range', '범위 설정', 'Range setting'], ['cal', '교정', 'Calibration']], 'echodynamic',
      { hk: '주사 중 최대값을 잡아 둡니다.', he: 'It holds the maximum during a sweep.', ok: '포락선 모양(ISO 23279 패턴)이 점상/연장 반사체를 구분합니다.', oe: 'The envelope shape (ISO 23279 patterns) separates point-like from extended reflectors.' }),
    N('G1 최대 %?', 'G1 maximum %?', function (c) { return c.R ? c.R.peakPct : NaN; }, 5, { hk: '판독 박스의 % 값.', he: 'The % readout.', ok: '기록: 최대 진폭, 위치, 게인.', oe: 'Record maximum amplitude, position and gain.' }),
  ]; };
  STEPS[12] = function () { return [
    S('10 mm 스텝에 놓고 게이트 1을 첫 에코에', 'Probe on the 10 mm step, gate 1 on the first echo', function (c) { return c.S.mode === 'step' && !!c.spec && !!c.spec.thicknessAt && c.spec.thicknessAt(c.S.probe.x) === 10 && !!c.R && c.R.echoKind === 'backwall'; },
      function () { const sp = st().specimen; if (sp && sp.stepX) H.setProbe({ x: sp.stepX(10) }); H.gate(5, 12); },
      { hk: '두 번째 스텝. G1 start 5, width 12.', he: 'The second step. G1 start 5, width 12.', ok: '표시값이 10.0이 아닌 것을 확인하세요.', oe: 'Note that DP does not read 10.0.' }),
    C('표시값이 10.0이 아닌 이유?', 'Why does DP not read 10.0?', [['cal', '속도·영점이 잘못 설정됨', 'Velocity and zero are wrong'], ['wear', '탐촉자 마모', 'Probe wear'], ['gate', '게이트 위치', 'Gate position'], ['gain', '감도 부족', 'Too little gain']], 'cal',
      { hk: '기기의 속도 5.60, 영점 0.4 µs.', he: 'The set reads velocity 5.60 and zero 0.4 µs.', ok: '시간 → 거리 변환이 틀리면 모든 위치가 틀립니다.', oe: 'A wrong time-to-distance conversion shifts every position.' }),
    S('Auto Cal → 10 mm ✓', 'Auto Cal, tick on 10 mm', function () { return H.acStage() === 2; }, function () { if (has('modes.autoCal.start')) { UT.modes.autoCal.start(); const sp = st().specimen; if (sp && sp.stepX) H.setProbe({ x: sp.stepX(10) }); H.gate(5, 12); UT.modes.autoCal.step(); } UT.renderNow(); },
      { hk: 'Auto Cal 소프트키(페이지 3) 후 ✓.', he: 'Auto Cal softkey (page 3), then ✓.', ok: '첫 점: 10 mm에서의 도달 시간.', oe: 'First point: the arrival time at 10 mm.' }),
    S('25 mm 스텝 → ✓', '25 mm step, tick', function (c) { const cal = c.S.instrument.cal; return cal.vel !== null && abs(cal.vel - 5.90) <= 0.05 && abs(cal.zero) <= 0.05; },
      function () { const sp = st().specimen; if (sp && sp.stepX) H.setProbe({ x: sp.stepX(25) }); H.gate(15, 25); if (has('modes.autoCal.step')) UT.modes.autoCal.step(); UT.renderNow(); },
      { hk: '가장 두꺼운 스텝, 게이트를 25 mm 에코에 맞춘 뒤 ✓.', he: 'The thickest step; gate the 25 mm echo, then ✓.', ok: '두 점에서 속도 = 2·Δd/Δt, 영점 = t1 − 2·d1/v.', oe: 'Two points: v = 2·Δd/Δt, zero = t1 − 2·d1/v.' }),
    S('15 mm 스텝에서 15.0 ± 0.1 확인', 'Verify 15.0 ± 0.1 on the 15 mm step', function (c) { return !!c.spec && !!c.spec.thicknessAt && c.spec.thicknessAt(c.S.probe.x) === 15 && !!c.R && abs(c.R.dp - 15) <= 0.1; },
      function () { const sp = st().specimen; if (sp && sp.stepX) H.setProbe({ x: sp.stepX(15) }); H.gate(8, 15); },
      { hk: '교정 후 제3의 두께로 검증합니다.', he: 'Verify on a third thickness after calibrating.', ok: '검증은 교정의 일부입니다 — 기록하세요.', oe: 'Verification is part of the calibration — record it.' }),
    C('속도만 틀렸을 때 오차는?', 'With only the velocity wrong, the error…', [['proportional', '깊이에 비례해 커진다', 'Grows in proportion to depth'], ['constant', '일정하다', 'Is constant', '일정한 오차는 영점 오류입니다.', 'A constant offset is a zero error.'], ['zero', '없다', 'Is zero'], ['random', '무작위', 'Is random']], 'proportional',
      { hk: 'd = v·t/2.', he: 'd = v·t/2.', ok: '영점 오류 = 상수, 속도 오류 = 비례.', oe: 'Zero error = constant; velocity error = proportional.' }),
    C('왜 첫 점을 5 mm가 아닌 10 mm 스텝으로?', 'Why 10 mm, not 5 mm, for the first point?', [['deadzone', '단일진동자 불감대(≈ 5 mm)', 'Single-crystal dead zone (≈ 5 mm)'], ['thicker', '두꺼워서', 'It is thicker'], ['gain', '게인', 'Gain'], ['rule', '규정', 'The rule']], 'deadzone',
      { hk: '레슨 3의 초기 펄스를 떠올리세요.', he: 'Remember the initial pulse of lesson 3.', ok: '5 mm 에코는 초기 펄스에 묻혀 피크 시간이 부정확합니다.', oe: 'The 5 mm echo is buried in the initial pulse; its peak time is unreliable.' }),
  ]; };
  STEPS[13] = function () { return [
    N('저면파 도달 시간(µs)?', 'Backwall time (µs)?', function (c) { return c.frame.tofd ? c.frame.tofd.backwallUs : NaN; }, 0.1, { hk: '상태 표시줄의 BackWall 값.', he: 'BackWall in the status bar.', ok: 't = 2·√((pcs/2)² + T²)/vL + 2·wd.', oe: 't = 2·√((pcs/2)² + T²)/vL + 2·wd.' }),
    S('Run Scan', 'Run Scan', function (c) { return c.S.tofd.scan !== null; }, function () { H.runTofdScan(); }, { hk: 'TOFD 창의 Run Scan.', he: 'Run Scan in the TOFD window.', ok: 'D-스캔: z 방향으로 RF 신호를 쌓은 그림.', oe: 'The D-scan stacks RF traces along z.' }),
    S('D-스캔에서 상단 팁 곡선을 클릭', 'Click the upper tip arc on the D-scan', function (c) { return c.S.cursor.view === 'dscan' && abs(c.S.cursor.depth - 8) <= 1; }, function () { H.cursorAt({ z: 135, depth: 8 }); },
      { hk: '측면파 바로 아래의 첫 번째 곡선(z 120…150).', he: 'The first arc below the lateral wave (z 120…150).', ok: '커서 깊이가 상단 팁의 깊이입니다.', oe: 'The cursor depth is the depth of the upper tip.' }),
    N('결함 상단 깊이?', 'Top depth (mm)?', 8, 1, { hk: '커서 판독.', he: 'Cursor readout.', ok: '상단 팁 8 mm.', oe: 'Upper tip at 8 mm.' }),
    N('높이(mm)?', 'Height (mm)?', 5, 1.5, { hk: '하단 팁 − 상단 팁.', he: 'Lower tip − upper tip.', ok: '13 − 8 = 5 mm.', oe: '13 − 8 = 5 mm.' }),
    C('측면파와 저면파 사이의 두 곡선은?', 'The two arcs between lateral wave and backwall are…', [['tips', '상단·하단 팁 회절 신호', 'Upper and lower tip diffraction'], ['modeconv', '모드 변환', 'Mode conversion', '모드 변환 신호는 저면파 뒤에 옵니다.', 'Mode-converted signals arrive after the backwall.'], ['geometry', '형상 에코', 'Geometry'], ['noise', '노이즈', 'Noise']], 'tips',
      { hk: '위상이 서로 반대입니다.', he: 'Their phases are opposite.', ok: '상단 팁은 측면파와 반대 위상, 하단 팁은 같은 위상.', oe: 'The upper tip is inverted relative to the lateral wave; the lower tip is not.' }),
    S('PCS 최적화 (2/3 T 규칙)', 'Optimise PCS (2/3 T rule)', function (c) { return abs(c.S.tofd.pcs - 46.2) <= 1; }, function () { H.pcsOptimise(); }, { hk: 'PCS = 2·(2T/3)·tanθ.', he: 'PCS = 2·(2T/3)·tanθ.', ok: '빔 교차점을 2/3 T에 두면 두께 전체를 고르게 봅니다.', oe: 'Crossing the beams at 2/3 T covers the thickness evenly.' }),
    C('TOFD로 결함 높이를 구하는 근거는?', 'TOFD height comes from…', [['timediff', '팁 신호의 시간차', 'The time difference of the tip signals'], ['amp', '진폭', 'Amplitude'], ['width', '폭', 'Width'], ['phase', '위상만', 'Phase only']], 'timediff',
      { hk: 'TOFD는 진폭을 쓰지 않습니다.', he: 'TOFD does not use amplitude.', ok: '시간 → 깊이 변환이므로 진폭·방향에 둔감합니다.', oe: 'Time-to-depth conversion — insensitive to amplitude and orientation.' }),
  ]; };
  STEPS[14] = function () { return [
    S('Probes ▸ Adjust Angle in Wedge (Shoe) 열기', 'Open Probes ▸ Adjust Angle in Wedge (Shoe)', function (c) { return c.memo.ui.win.indexOf('wedge') >= 0; }, function () { H.menu(['Probes/Adjust Angle in Wedge (Shoe)'], function () { emitUi('window-open', 'wedge'); }); },
      { hk: 'Probes 메뉴 첫 항목.', he: 'First item of the Probes menu.', ok: '쐐기각과 굴절각은 스넬 법칙으로 연결됩니다.', oe: 'Wedge angle and refracted angle are linked by Snell.' }),
    S('쐐기각 20° → 종파', 'Wedge 20° → compression mode', function (c) { const d = c.frame.derived; return !!d && d.mode === 'comp' && abs(d.wedgeAngle - 20) <= 1.5; }, function () { H.wedge(20, 'comp'); },
      { hk: '슬라이더를 20°로.', he: 'Slider to 20°.', ok: '1차 임계각(27.7°) 아래: 종파 47°와 횡파가 함께 존재.', oe: 'Below the 1st critical angle (27.7°): compression 47° and shear coexist.' }),
    S('쐐기각 33° → 횡파만 (약 40°)', 'Wedge 33° → shear only (≈ 40°)', function (c) { const d = c.frame.derived; return !!d && d.mode === 'shear' && abs(d.wedgeAngle - 33) <= 1.5; }, function () { H.wedge(33, 'shear'); },
      { hk: '27.7°와 57.7° 사이에서는 횡파만.', he: 'Between 27.7° and 57.7° only shear remains.', ok: '종파는 전반사 — 사각 탐촉자가 쓰는 구간.', oe: 'Compression totally reflected — the angle-probe working range.' }),
    S('쐐기각 52.6° → 70° 횡파', 'Wedge 52.6° → 70° shear', function (c) { const d = c.frame.derived; return !!d && d.mode === 'shear' && abs(d.refracted - 70) <= 2; }, function () { H.wedge(52.6, 'shear'); },
      { hk: '70° 프리셋 버튼.', he: 'The 70° preset button.', ok: '2차 임계각(57.7°)에 가까울수록 표면파 성분이 커집니다.', oe: 'Close to the 2nd critical angle (57.7°) the surface-wave share grows.' }),
    N('1차 임계각(°)?', '1st critical angle (°)?', 27.7, 0.5, { hk: 'asin(2.74/5.90).', he: 'asin(2.74/5.90).', ok: '종파 굴절각 90°가 되는 쐐기각.', oe: 'The wedge angle where the compression wave refracts to 90°.' }),
    N('2차 임계각(°)?', '2nd critical angle (°)?', 57.7, 0.5, { hk: 'asin(2.74/3.24).', he: 'asin(2.74/3.24).', ok: '횡파 굴절각 90°.', oe: 'Shear refracted to 90°.' }),
    C('2차 임계각 이상에서 생기는 파는?', 'Beyond the 2nd critical angle you get…', [['surface', '표면파', 'Surface (Rayleigh) wave'], ['shear', '횡파', 'Shear'], ['comp', '종파', 'Compression'], ['none', '없음', 'Nothing']], 'surface',
      { hk: '레일리파는 표면을 따라 갑니다.', he: 'The Rayleigh wave runs along the surface.', ok: '70° 탐촉자에서도 표면파 성분이 덧살 토우에서 의사 지시를 만듭니다.', oe: 'Even a 70° probe launches some surface wave — spurious indications from the cap toe.' }),
  ]; };
  STEPS[15] = function () { return [
    S('PIPE 켜기', 'PIPE on', function (c) { return !!c.S.weldOpts.pipe; }, function () { H.click('tb-pipe'); }, { hk: '툴바 PIPE.', he: 'Toolbar PIPE.', ok: '파이프 모델: 원주 방향 z, 곡률 반영.', oe: 'Pipe model: z runs around the circumference, curvature included.' }),
    S('3-D 창 열기', 'Open the 3-D window', function (c) { return c.memo.ui.win.indexOf('pipe3d') >= 0 || H.winOpen('pipe3d'); }, function () { if (!H.winOpen('pipe3d')) H.menu(['Options/Show 3D Window'], function () { if (has('views.pipe3d.open')) { try { UT.views.pipe3d.open(); } catch (e) { /* ignore */ } } emitUi('window-open', 'pipe3d'); }); },
      { hk: 'Options ▸ Show 3D Window.', he: 'Options ▸ Show 3D Window.', ok: '3-D 창은 탐촉자 위치와 결함을 파이프 위에 보여 줍니다.', oe: 'The 3-D window shows probe and defects on the pipe.' }),
    S('Options ▸ UT Set → EPOCH 4', 'Options ▸ UT Set → EPOCH 4', function (c) { return c.S.utSet === 'epoch4'; }, function () { H.menu(['Options/UT Set/EPOCH 4'], function () { UT.set({ utSet: 'epoch4' }); }); UT.renderNow(); },
      { hk: 'Options 메뉴 ▸ UT Set.', he: 'Options menu ▸ UT Set.', ok: 'EPOCH 4: ASME 스타일 화면, AUTO-80 키.', oe: 'EPOCH 4: ASME-style screen, AUTO-80 key.' }),
    S('다시 EPOCH 600', 'Back to EPOCH 600', function (c) { return c.S.utSet === 'epoch600'; }, function () { H.menu(['Options/UT Set/EPOCH 600'], function () { UT.set({ utSet: 'epoch600' }); }); UT.renderNow(); },
      { hk: 'Options ▸ UT Set ▸ EPOCH 600.', he: 'Options ▸ UT Set ▸ EPOCH 600.', ok: '기기가 바뀌어도 상태(게인·범위·게이트)는 유지됩니다.', oe: 'Gain, range and gates survive the set change.' }),
    TR('언어 전환 (Options ▸ Language) 후 원래대로', 'Toggle the language (Options ▸ Language) and back', function (c) { return (c.memo.langChanges || 0) >= 1; },
      function () { const l0 = UT.i18n.lang, l1 = l0 === 'ko' ? 'en' : 'ko'; const setL = function (l) { if (has('app.setLang')) UT.app.setLang(l); else { UT.i18n.lang = l; UT.bus.emit('lang', l); } }; setL(l1); setL(l0); },
      { hk: 'Options ▸ Language ▸ 한국어 / English.', he: 'Options ▸ Language ▸ Korean / English.', ok: '메뉴·창·레슨 텍스트가 즉시 바뀝니다.', oe: 'Menus, windows and lessons relabel immediately.' }),
    C('파이프 용접 주사에서 달라지는 것은?', 'What changes when scanning a pipe weld?', [['curvature', '곡률에 따른 접촉·스킵 거리', 'Coupling and skip distance with curvature'], ['nothing', '없음', 'Nothing'], ['gain', '게인만', 'Gain only'], ['freq', '주파수', 'Frequency']], 'curvature',
      { hk: '곡면 위의 평면 쐐기를 생각하세요.', he: 'Think of a flat wedge on a curved surface.', ok: 'OD < 100 mm 또는 곡률이 크면 쐐기 가공과 곡면 대비 시험편이 필요합니다.', oe: 'Small OD or strong curvature needs contoured wedges and a curved reference block.' }),
    N('외경(mm)?', 'Outside diameter (mm)?', function (c) { return c.S.weldOpts.od; }, 0.1, { hk: 'Weld 대화상자의 OD.', he: 'OD in the Weld dialog.', ok: '6 in 파이프 = 168.3 mm.', oe: '6 in pipe = 168.3 mm.' }),
  ]; };
  STEPS[16] = function () { return [
    S('링 위에서 드래그: Defect 1 From 76 To 143', 'Drag on the ring: Defect 1 From 76 To 143', function (c) { const d = c.S.defects[0]; return !!d && abs(d.zFrom - 76) <= 3 && abs(d.zTo - 143) <= 3; },
      function () { H.setDefects([{ n: 1, type: 'planar', pts: [{ x: 0, y: 17 }, { x: 0, y: 20 }], zFrom: 76, zTo: 143, label: 'Defect 1' }]); },
      { hk: '서클 뷰의 링에서 마우스로 호를 그리세요 (또는 From/To 입력).', he: 'Drag an arc on the ring of the circle view (or type From/To).', ok: 'z는 12시 기준(z = 0)에서 원주를 따라 잰 거리입니다.', oe: 'z is the circumferential distance from the 12 o’clock datum (z = 0).' }),
    S('Delete Defect 1', 'Delete Defect 1', function (c) { return c.S.defects.length === 0; }, function () { H.setDefects([]); }, { hk: '편집기의 Delete Defect 1.', he: 'Delete Defect 1 in the editor.', ok: '슬롯 번호는 보고서 행과 대응합니다.', oe: 'Slot numbers map to report rows.' }),
    S('Save Def (Export Defects…)', 'Save Def (Export Defects…)', function (c) { return c.memo.ui.win.indexOf('export-defects') >= 0; }, function () { H.menu(['Defects/Export Defects...'], function () { emitUi('window-open', 'export-defects'); }); if (H.winOpen('export-defects')) UT.dom.wins['export-defects'].close(); },
      { hk: 'Defects ▸ Export Defects… (JSON).', he: 'Defects ▸ Export Defects… (JSON).', ok: '결함 JSON은 실기 시험 시나리오로 재사용됩니다.', oe: 'The defect JSON is reusable as a trade-test scenario.' }),
    S('Load Def: 결함 불러오기', 'Load Def: load a defect', function (c) { return c.S.defects.length >= 1; }, function () { H.addPreset('rootCrack', { zFrom: 76, zTo: 143 }); },
      { hk: 'Load Def 또는 Defects ▸ Add Preset.', he: 'Load Def or Defects ▸ Add Preset.', ok: '불러온 결함은 편집기 슬롯에 채워집니다.', oe: 'Loaded defects fill the editor slots.' }),
    N('결함 길이(mm)?', 'Defect length (mm)?', function (c) { const d = c.S.defects[0]; return d ? d.zTo - d.zFrom : 67; }, 3, { hk: 'To − From.', he: 'To − From.', ok: '143 − 76 = 67 mm.', oe: '143 − 76 = 67 mm.' }),
    C('원주 위치 기준(datum)은?', 'The circumferential datum is…', [['z0', 'z = 0 표시(12시)', 'The z = 0 mark (12 o’clock)'], ['probe', '탐촉자 위치', 'The probe position'], ['weld', '용접 중심', 'The weld centre'], ['any', '임의', 'Anywhere']], 'z0',
      { hk: '보고서의 z는 어디서부터 잴까요?', he: 'Where does the report z start?', ok: '기준점 없는 위치 기록은 재현할 수 없습니다.', oe: 'A position without a datum cannot be reproduced.' }),
  ]; };
  STEPS[17] = function () { return [
    S('0° 탐촉자로 용접부 양쪽 주사면(용접 중심 ±1.25 T)을 래스터 주사', 'Raster the scanning surfaces ±1.25 T either side of the weld with the 0° probe', function (c) { return c.memo.ui.drag >= 1 && c.S.probe.angle === 0 && c.E.some(function (e) { return e.kind === 'lamination'; }); },
      function () { H.click('tb-0'); H.dragTo(-30, { z: 130 }); },
      { hk: '0° 선택 후 x −45…−15, z 100…160 영역으로 드래그.', he: 'Select 0°, then drag into x −45…−15, z 100…160.', ok: 'ISO 17640 B/C: 사각 주사 전 주사면 라미네이션 검사.', oe: 'ISO 17640 B/C: check the scanning zone for laminations before the angle scan.' }),
    N('라미네이션 깊이(DP)는?', 'Depth of the lamination (DP)?', 12, 0.7, { hk: '게이트 안 DP 판독.', he: 'DP readout in the gate.', ok: '12 mm — 60° 빔의 0.5 스킵 경로를 정확히 가로막는 깊이.', oe: '12 mm — right in the half-skip path of the 60° beam.' }),
    S('60° 탐촉자를 라미네이션 위 x = −30에 두고 루트 균열을 찾기', 'Put the 60° probe on x = −30 over the lamination and look for the root crack', function (c) { return c.S.probe.angle === 60 && abs(c.S.probe.x + 30) <= 3; }, function () { H.click('tb-60'); H.setProbe({ x: -30, side: -1, z: 130 }); },
      { hk: '60° 선택, x −30 (side −1).', he: 'Select 60°, x −30 (side −1).', ok: '루트 에코가 약하거나 없습니다 — 왜일까요?', oe: 'The root echo is weak or missing — why?' }),
    C('루트 에코가 약한/없는 이유는?', 'Why is the root echo weak or missing?', [['lamination-blocks', '라미네이션이 빔을 차단(반사)함', 'The lamination blocks (reflects) the beam'], ['wrong-angle', '각도 오류', 'Wrong angle'], ['gain-low', '게인 부족', 'Too little gain'], ['skew', '스큐', 'Skew']], 'lamination-blocks',
      { hk: '0° 검사에서 무엇을 찾았나요?', he: 'What did the 0° scan find?', ok: '빔이 라미네이션에서 반사되어 루트에 닿지 않습니다.', oe: 'The beam reflects off the lamination and never reaches the root.' }),
    C('올바른 조치는?', 'Correct action?', [['scan-other-side', '반대쪽 면에서 주사하고 라미네이션을 보고서에 기록', 'Scan from the other side and record the lamination'], ['increase-gain', '게인 증가', 'Increase gain'], ['ignore', '무시', 'Ignore'], ['use-70', '70° 사용', 'Use 70°']], 'scan-other-side',
      { hk: '게인은 차단된 빔을 되살리지 못합니다.', he: 'Gain cannot restore a blocked beam.', ok: '커버리지 제한을 보고서에 명시합니다.', oe: 'State the coverage limitation in the report.' }),
  ]; };
  STEPS[18] = function () { return [
    S('Gates Same (게이트 2 = 게이트 1)', 'Gates Same (gate 2 = gate 1)', function (c) { const g = c.S.aut.gates; return g[1].start === g[0].start && g[1].width === g[0].width && g[1].level === g[0].level; },
      function () { const g = st().aut.gates.map(function (x) { return Object.assign({}, x); }); g[1] = Object.assign({}, g[1], { start: g[0].start, width: g[0].width, level: g[0].level, on: true }); H.setIn('aut', { gates: g }); },
      { hk: 'AUT 창의 Gates Same 버튼.', he: 'Gates Same in the AUT window.', ok: '두 채널이 같은 구간을 감시하면 스트립이 겹쳐 보입니다.', oe: 'Two channels on the same window give matching strips.' }),
    S('Run', 'Run', function (c) { return c.S.aut.scan !== null; }, function () { H.runAutScan(); }, { hk: 'Run 버튼.', he: 'Run button.', ok: '스트립 차트: z에 대한 게이트 진폭·TOF.', oe: 'Strip charts: gate amplitude and TOF versus z.' }),
    S('Stop', 'Stop', function (c) { return c.S.aut.scan !== null && !c.S.aut.running; }, function () { if (has('aut.stopScan')) UT.aut.stopScan(); UT.renderNow(); }, { hk: 'Stop 버튼.', he: 'Stop button.', ok: '정지 후 스트립을 판독합니다.', oe: 'Read the strips after stopping.' }),
    S('Rev Map', 'Rev Map', function (c) { return !!c.S.aut.revMap; }, function () { H.setIn('aut', { revMap: true }); }, { hk: 'Rev Map 체크.', he: 'Tick Rev Map.', ok: '색 반전 맵은 약한 지시를 강조합니다.', oe: 'The reversed map emphasises weak indications.' }),
    N('지시 z 시작(mm)?', 'Indication z start (mm)?', function (c) { const d = c.S.defects[0]; return d ? d.zFrom : NaN; }, 5, { hk: '스트립에서 진폭이 레벨을 넘기 시작하는 z.', he: 'The z where the strip first exceeds the level.', ok: '스트립의 시작/끝이 결함 길이입니다 (빔 폭만큼 넓어짐).', oe: 'Strip start/end give the length (widened by the beam).' }),
    C('AUT 채널을 여러 개 쓰는 이유?', 'Why several AUT channels?', [['zones', '두께 방향 구역별 커버리지', 'Zone coverage through the thickness'], ['speed', '속도', 'Speed'], ['gain', '게인', 'Gain'], ['none', '이유 없음', 'No reason']], 'zones',
      { hk: '구역(zone) 판별.', he: 'Zone discrimination.', ok: '채널마다 다른 각도·게이트로 루트/충전/덧살 구역을 나눕니다.', oe: 'Each channel’s angle/gate covers a root/fill/cap zone.' }),
  ]; };
