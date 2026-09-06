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
 * - start(n) first resets a small baseline (single crystal, PE, skew 0, freeze/peakMem off, reject/delay 0, HIDE off, BEAM on)
 *   so lessons never inherit e.g. lesson 3's twin crystal (v1's loadLesson did not; the v1 setups assume these defaults).
 * - Manual 'Do it for me' force-advances when the check still fails after two renders (never leaves the user stuck);
 *   autoRun records such steps in `failedSteps` and continues so later steps are still exercised.
 * - Lesson 3 step 5: 80's enable matrix greys the Probes menu in v1 mode, so the menu path cannot be walked there; the
 *   check accepts any route to `probe.crystal === 'twin'` (Do it for me / UT.test.setProbe) — integrator to decide.
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
      for (let z = 0; z <= spec.L; z += 5) H.setProbe({ x: side === -1 ? -x : x, z, side });
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
      { hk: 'Probes 메뉴 ▸ Zero Probe 하위 메뉴 (V1 모드에서 메뉴가 비활성이면 Do it for me).', he: 'Probes menu ▸ Zero Probe submenu (use Do it for me if the menu is greyed in V1 mode).', ok: '송·수신 진동자가 분리되어 송신 펄스가 수신부에 들어오지 않습니다.', oe: 'Separate transmit/receive crystals keep the transmit pulse out of the receiver.' }),
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
    S('게인 40 dB, 토우 LOF의 (약한) 팁 에코를 최대로 (≥ 5 %)', 'Gain 40 dB, maximise the (weak) tip echo of the toe LOF (≥ 5 %)', function (c) { return c.E.some(function (e) { return (e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip') && e.ampPct >= 5; }); },
      function () { H.setInstrument({ gain: 40, gates: [{ on: true, start: 2, width: 90, level: 3 }] }); const sp = st().specimen; const x0 = sp && sp.tky ? sp.tky.toe.x + sp.tky.weldLeg : 0; H.maximise(function (e) { return e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip'; }, H.range(Math.max(10, x0 + 2), x0 + 80, 2)); },
      { hk: '코드 위에서 토우 바로 옆(x ≈ 10)부터 탐촉자를 움직여 보세요 — 면에 평행한 융합불량은 코드 쪽에서 거의 보이지 않습니다.', he: 'Move the probe on the chord starting right next to the toe (x ≈ 10) — a LOF parallel to the surface is nearly invisible from the chord.', ok: '코드 측에서는 팁 회절만 약하게 보입니다: 이 융합면은 브레이스 측에서 주사해야 합니다.', oe: 'From the chord only a weak tip diffraction shows: this fusion face must be scanned from the brace side.' }),
    S('45°로 전환', 'Switch to 45°', function (c) { return c.S.probe.angle === 45; }, function () { H.click('tb-45'); }, { hk: '노란 45° 버튼.', he: 'Yellow 45° button.', ok: '45°는 가파른 융합면에, 60/70°는 완만한 면에 수직으로 만납니다.', oe: '45° meets steep faces at right angles; 60/70° suit shallow faces.' }),
    C('브레이스 측에서 주사해야 하는 이유?', 'Why scan from the brace side too?', [['geometry', '코드 측에서 접근 불가한 융합면', 'Fusion faces unreachable from the chord'], ['gain', '게인이 낮아서', 'Lower gain'], ['easier', '더 쉬워서', 'Easier'], ['rule', '규정이라서', 'The rule says so']], 'geometry',
      { hk: '힐 쪽 융합면의 방향을 생각하세요.', he: 'Think about the heel fusion face direction.', ok: '힐 쪽 융합면은 브레이스에서 0.5 스킵으로만 수직 입사됩니다.', oe: 'The heel fusion face is only met normally from the brace at half skip.' }),
    N('브레이스 각도(°)?', 'Brace angle (°)?', function (c) { return c.spec && c.spec.tky ? c.spec.tky.braceAngle : 50; }, 2, { hk: '상태 표시줄 Brace angle.', he: 'Status bar: Brace angle.', ok: '각도는 절차서 도면과 일치해야 합니다.', oe: 'The angle must match the procedure drawing.' }),
  ]; };
  STEPS[9] = function () { return [
    S('13 mm 횡공 에코를 최대로', 'Maximise the 13 mm SDH', function (c) { return near(c.E, 'sdh', 26, 0.5) && abs(c.S.probe.x - 262.5) <= 1.5; }, function () { H.setInstrument({ gates: [{ on: true, start: 10, width: 90, level: 5 }] }); H.setProbe({ x: 262.5 }); },
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
    TR('PEAK MEM 켜고 탐촉자를 앞뒤로 주사', 'PEAK MEM on, then sweep the probe', function (c) { return c.S.instrument.peakMem === true && c.memo.ui.drag >= 1; }, function () { H.setInstrument({ peakMem: true }); H.dragTo(30); H.dragTo(38); },
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
  function r25x(spec) { const a = spec && spec.arcs ? spec.arcs.find(function (q) { return abs(q.r - 25) < 0.01; }) : null; return a ? a.cx : 60; }
  STEPS[19] = function () { return [
    S('60° 선택, V2, side +1', 'Select 60° on the V2 block, side +1', function (c) { return c.S.probe.angle === 60 && c.S.mode === 'v2' && c.S.probe.side === 1; }, function () { H.click('tb-60'); H.setProbe({ side: 1 }); },
      { hk: '녹색 60° 버튼.', he: 'Green 60° button.', ok: '60°/70°도 같은 R25/R50 순서를 냅니다.', oe: '60°/70° give the same R25/R50 sequence.' }),
    S('25 mm 에코를 최대로 하여 입사점을 확인', 'Maximise the 25 mm echo to check the index point', function (c) { return c.E.some(function (e) { return (e.kind === 'geometry' || e.kind === 'backwall' || e.kind === 'radius') && abs(e.path - 25) <= 0.5 && e.ampPct >= 50; }) && abs(c.S.probe.x - r25x(c.spec)) <= 1; },
      function () { H.setInstrument({ range: 100 }); H.setProbe({ x: r25x(st().specimen), side: 1 }); H.auto(80); },
      { hk: '반경 중심(눈금 0) 위에서 최대. 필요하면 게인을 올리세요.', he: 'Maximum over the radius centre (0 mark). Raise the gain if needed.', ok: '최대일 때 입사점이 눈금 0을 가리켜야 합니다.', oe: 'At the maximum the index mark should point at 0.' }),
    N('입사점 오차(mm)? = |probe.x − 표시 눈금|', 'Index error (mm) = |probe.x − mark|', function (c) { return abs(c.S.probe.x - r25x(c.spec)); }, 1, { hk: '탐촉자 입사점 표시와 블록 눈금 0의 차.', he: 'Offset between the probe index mark and the block 0.', ok: '오차가 1 mm를 넘으면 입사점을 다시 표시합니다.', oe: 'More than 1 mm: re-mark the index point.' }),
    S('5 mm 구멍(전면)으로 굴절각 확인: 60° 눈금 위치에서 최대', 'Angle check on the 5 mm hole (front face)', function (c) { return c.E.some(function (e) { return e.kind === 'sdh' && e.ampPct >= 40; }); },
      function () { if (has('modes.setFace')) UT.modes.setFace('narrow'); const h = H.hole5(st().specimen); if (h) H.maximise(function (e) { return e.kind === 'sdh'; }, H.range(h.x + h.y * T60 - 4, h.x + h.y * T60 + 4, 0.5), { side: 1 }); H.setInstrument({ range: 100 }); H.auto(80); },
      { hk: '좁은 면에서 x = 60 + 6.25·tan60 ≈ 70.8.', he: 'On the narrow face, x = 60 + 6.25·tan60 ≈ 70.8.', ok: '최대일 때 입사점이 가리키는 눈금이 실제 굴절각.', oe: 'The scale value under the index point at the maximum is the true angle.' }),
    C('측정 굴절각이 63°로 나왔다. 조치는?', 'Measured 63°: action?', [['record-and-use', '측정각을 기록하고 Trig 설정을 63°로 수정', 'Record it and set the Trig angle to 63°'], ['ignore', '무시', 'Ignore'], ['replace-probe-only', '탐촉자만 교체', 'Replace the probe only'], ['change-freq', '주파수 변경', 'Change frequency']], 'record-and-use',
      { also: function (c) { const a = c.S.instrument.trig.angle; return a >= 62 && a <= 64; }, ak: '기기 Trig 각도를 63°로 입력하세요 (setInstrument trig).', ae: 'Enter 63° as the instrument Trig angle.', doIt: function () { H.setInstrument({ trig: { angle: 63 } }); },
        hk: '깊이·표면 거리 계산은 어떤 각도로 할까요?', he: 'Which angle should the depth/surface-distance maths use?', ok: '측정각이 기기에 들어가야 DP/SD가 맞습니다 (명판과 2° 이상 차이면 기록).', oe: 'The measured angle must go into the set for DP/SD to be right (record when > 2° off the nameplate).' }),
  ]; };
  STEPS[20] = function () { return [
    S('DAC 블록, 70°', 'DAC block, 70°', function (c) { return c.S.mode === 'dac' && c.S.probe.angle === 70; }, function () { H.clickMode('dac'); H.click('tb-70'); H.setInstrument({ gates: [{ on: true, start: 5, width: 60, level: 10 }] }); }, { hk: 'DAC 버튼과 파란 70° 버튼.', he: 'DAC button and the blue 70° button.', ok: '3 mm 횡공 T/4·T/2·3T/4가 기준 반사체입니다.', oe: 'The 3 mm SDHs at T/4, T/2, 3T/4 are the reference reflectors.' }),
    S('T/4 구멍 최대 → Record', 'Maximise T/4 → Record', function (c) { const p = c.S.instrument.dac.points; return p.length >= 1 && abs(p[0].path - 14.6) <= 1; }, function () { const h = H.hole(st().specimen, 5); if (h) H.setProbe({ x: +(h.x + 5 * T70).toFixed(1) }); if (has('modes.dac.record')) UT.modes.dac.record(); UT.renderNow(); },
      { hk: 'x = 80 + 5·tan70 ≈ 93.7, Record (R).', he: 'x = 80 + 5·tan70 ≈ 93.7, Record (R).', ok: '빔 노정 5/cos70 = 14.6 mm.', oe: 'Beam path 5/cos70 = 14.6 mm.' }),
    S('T/2 → Record', 'T/2 → Record', function (c) { const p = c.S.instrument.dac.points; return p.length >= 2 && abs(p[1].path - 29.2) <= 1; }, function () { const h = H.hole(st().specimen, 10); if (h) H.setProbe({ x: +(h.x + 10 * T70).toFixed(1) }); if (has('modes.dac.record')) UT.modes.dac.record(); UT.renderNow(); },
      { hk: 'x = 150 + 10·tan70 ≈ 177.5.', he: 'x = 150 + 10·tan70 ≈ 177.5.', ok: '29.2 mm.', oe: '29.2 mm.' }),
    S('3T/4 → Record', '3T/4 → Record', function (c) { const p = c.S.instrument.dac.points; return p.length >= 3 && abs(p[2].path - 43.9) <= 1; }, function () { const h = H.hole(st().specimen, 15); if (h) H.setProbe({ x: +(h.x + 15 * T70).toFixed(1) }); if (has('modes.dac.record')) UT.modes.dac.record(); UT.renderNow(); },
      { hk: 'x = 220 + 15·tan70 ≈ 261.2.', he: 'x = 220 + 15·tan70 ≈ 261.2.', ok: '43.9 mm — 세 점이면 DAC를 그릴 수 있습니다.', oe: '43.9 mm — three points draw a DAC.' }),
    S('Draw Curves / 커브 그리기', 'Draw Curves', function (c) { return !!c.S.instrument.dac.on && !!c.S.instrument.dac.curves; }, function () { if (has('modes.dac.curves')) UT.modes.dac.curves(true); else UT.setIn('instrument', { dac: Object.assign({}, st().instrument.dac, { on: true, curves: true }) }); UT.renderNow(); },
      { hk: 'DAC 창의 Draw Curves.', he: 'Draw Curves in the DAC window.', ok: '−6 dB(50 %)·−14 dB(20 %) 보조 곡선이 함께 그려집니다.', oe: 'The −6 dB (50 %) and −14 dB (20 %) companions are drawn too.' }),
    C('DAC 커브의 의미?', 'The DAC curve shows…', [['same-ref', '같은 기준 반사체(3 mm 횡공)의 거리별 에코 높이', 'The same reference reflector (3 mm SDH) versus distance'], ['defect-size', '결함 크기', 'Defect size'], ['beam', '빔 폭', 'Beam width'], ['atten', '재료 감쇠만', 'Attenuation only']], 'same-ref',
      { hk: '거리에 따른 진폭 보정.', he: 'Distance–amplitude correction.', ok: '지시는 같은 거리의 기준 반사체와 비교됩니다 (% DAC).', oe: 'An indication is compared with the reference reflector at the same distance (% DAC).' }),
    S('LOF 프리셋을 추가하고 최대 에코에서 DAC % 읽기', 'Add the LOF preset and read DAC % at its maximum', function (c) { return c.S.defects.length >= 1 && !!c.R && c.R.dacPct !== null && c.R.dacPct !== undefined; },
      function () { H.enter('weld', { keepProbe: true }); H.addPreset('lof'); H.setInstrument({ gates: [{ on: true, start: 5, width: 60, level: 5 }] }); H.maximise(function (e) { return e.kind === 'defect' || e.kind === 'tip' || e.kind === 'corner'; }, H.range(25, 60, 1)); },
      { hk: 'Defects ▸ Add Preset ▸ LOF, 그 뒤 x ≈ 60에서 최대.', he: 'Defects ▸ Add Preset ▸ LOF, then maximise near x ≈ 60.', ok: 'DAC %와 dB 판독이 지시 평가의 입력입니다.', oe: 'DAC % and dB readouts are the inputs to evaluation.' }),
    N('DAC 대비 dB?', 'dB relative to DAC?', function (c) { return c.R ? c.R.dBToDac : NaN; }, 1, { hk: '판독 박스의 dB 값.', he: 'The dB readout.', ok: '0 dB = 커브 위, −6 dB = 50 % DAC.', oe: '0 dB = on the curve, −6 dB = 50 % DAC.' }),
    C('ASME (기록 20 % DAC, 기준 초과 + 길이 초과 시 불합격)에서 조치는?', 'Under ASME (record ≥ 20 % DAC; reject when above reference and over length): action?', [['record-size', '기록하고 길이를 측정한 뒤 판정', 'Record, measure the length, then disposition'], ['ignore', '무시', 'Ignore'], ['reject-now', '즉시 불합격', 'Reject now'], ['lower-gain', '게인 감소', 'Lower the gain']], 'record-size',
      { also: function (c) { const e = c.S.standards.lastEval; return !!e && Array.isArray(e.rows) && e.rows.length >= 1; }, ak: '평가 창(Tools ▸ Evaluation)에 이 지시를 추가하고 Evaluate all.', ae: 'Add this indication in Tools ▸ Evaluation and press Evaluate all.', doIt: function () { H.evaluateAll(); },
        hk: '판정에는 진폭과 길이가 모두 필요합니다.', he: 'Disposition needs amplitude and length.', ok: '20 % DAC 이상은 기록·조사 대상; 불합격은 진폭 > 100 % DAC 이고 길이 초과일 때.', oe: '≥ 20 % DAC: record and investigate; reject only when > 100 % DAC and over the length limit.' }),
  ]; };
  STEPS[21] = function () { return [
    S('Start', 'Start', function (c) { return !!c.S.trade.active; }, function () { H.tradeStart(21); }, { hk: 'Trade Test 창의 Start.', he: 'Start in the Trade Test window.', ok: '결함이 숨겨지고(HIDE) 타이머가 시작됩니다.', oe: 'Defects are hidden (HIDE) and the timer starts.' }),
    S('A면에서 45°와 60°로 전체 주사 (커버리지 ≥ 80 %)', 'Scan side A fully with 45° and 60° (coverage ≥ 80 %)', function () { return H.coverage().sideA >= 0.8; }, function () { H.sweep(45, 1); H.sweep(60, 1); },
      { hk: '0.5…1 스킵 거리에서 z 전체를 훑으세요.', he: 'Sweep the whole z at half- to full-skip stand-off.', ok: 'ISO 17640 B: 두 각도, 양면.', oe: 'ISO 17640 B: two angles, both sides.' }),
    S('B면도 동일', 'Same on side B', function () { return H.coverage().sideB >= 0.8; }, function () { H.sweep(45, -1); H.sweep(60, -1); }, { hk: 'side −1.', he: 'Side −1.', ok: '양면 주사로 두 융합면을 모두 수직에 가깝게 맞힙니다.', oe: 'Both sides so each fusion face is met near-normally.' }),
    S('지시 최대에서 Take from readout로 행 추가', 'Add a row from the readout at an indication maximum', function (c) { return c.S.trade.report.length >= 1; }, function () { const d = st().defects[0]; if (d) { H.click('tb-60'); H.setProbe({ z: (d.zFrom + d.zTo) / 2, side: 1 }); H.setInstrument({ gates: [{ on: true, start: 5, width: 80, level: 5 }] }); H.maximise(function (e) { return e.kind === 'defect' || e.kind === 'corner' || e.kind === 'tip'; }, H.range(15, 80, 1)); } const n0 = st().trade.report.length; H.addRow(); if (st().trade.report.length === n0) { const s = st(), r = UT.frame.readouts && UT.frame.readouts.primary; UT.setIn('trade', { report: s.trade.report.concat([{ n: n0 + 1, z: +s.probe.z.toFixed(1), length: 20, depth: r ? +r.dp.toFixed(1) : 0, type: 'planar', angle: s.probe.angle, side: s.probe.side }]) }); UT.renderNow(); } },
      { hk: 'Take from readout 버튼.', he: 'The Take from readout button.', ok: '행에는 z, 길이, 깊이(상단), 종류, dB가 들어갑니다.', oe: 'A row carries z, length, depth (to the top), type and dB.' }),
    S('Submit', 'Submit', function (c) { return !!c.S.trade.revealed; }, function () { H.tradeSubmit(); }, { hk: 'Submit 버튼.', he: 'Submit button.', ok: '제출 후 정답이 공개되고 점수가 계산됩니다.', oe: 'After submit the truth is revealed and scored.' }),
    C('허위 지시(false call)의 대가는?', 'A false call costs…', [['15', '−15점', '−15 points'], ['0', '0점', '0 points'], ['-5', '−5점', '−5 points'], ['fail', '불합격', 'Fail']], '15',
      { hk: '실제 검사에서 허위 지시는 불필요한 보수를 부릅니다.', he: 'In real work a false call means needless repair.', ok: '형상 에코를 결함으로 부르지 않도록 플로팅하세요.', oe: 'Plot before calling a geometry echo a defect.' }),
    C('균열을 놓치면?', 'Missing a crack means…', [['fail', '점수와 무관하게 불합격', 'Fail regardless of score'], ['minus-40', '−40점', '−40 points'], ['retry', '재시험', 'Retake'], ['nothing', '없음', 'Nothing']], 'fail',
      { hk: '치명적 누락(critical miss).', he: 'Critical miss.', ok: '높이 ≥ 3 mm의 평면 결함 누락 = 불합격.', oe: 'An undetected planar defect ≥ 3 mm high = FAIL.' }),
  ]; };
  STEPS[22] = function () { return [
    S('페이지 2 (Gate 소프트키)', 'Page 2 (gate softkeys)', function (c) { return c.S.instrument.page === 2; }, function () { UT.setIn('instrument', { page: 2 }); UT.renderNow(); }, { hk: 'NEXT GROUP 키.', he: 'NEXT GROUP key.', ok: '페이지 2: Gate 1 / Gate 2.', oe: 'Page 2: Gate 1 / Gate 2.' }),
    S('G2 켜기', 'G2 on', function (c) { return !!c.S.instrument.gates[1].on; }, function () { const g = st().instrument.gates.map(function (x) { return Object.assign({}, x); }); g[1].on = true; H.setInstrument({ gates: g }); },
      { hk: 'Gate 2 소프트키 → On.', he: 'Gate 2 softkey → On.', ok: '두 번째 게이트는 저면 에코 감시(접촉 확인)에 씁니다.', oe: 'The second gate monitors the backwall (coupling check).' }),
    S('2ND F + dB: 기준 게인 저장', '2ND F + dB stores the reference gain', function (c) { return c.S.instrument.refGain === c.S.instrument.gain; }, function () { H.storeRef(); },
      { hk: '2ND F 후 dB.', he: '2ND F then dB.', ok: '게인 셀이 Ref xx + 0.0 dB로 바뀝니다.', oe: 'The gain cell now shows Ref xx + 0.0 dB.' }),
    S('Auto Cal 소프트키', 'Auto Cal softkey', function () { return H.acStage() === 1; }, function () { if (has('modes.autoCal.start')) UT.modes.autoCal.start(); UT.renderNow(); }, { hk: '페이지 3의 Auto Cal.', he: 'Auto Cal on page 3.', ok: '마법사 1/2: 10 mm 스텝.', oe: 'Wizard 1/2: the 10 mm step.' }),
    S('취소 (Esc)', 'Cancel (Esc)', function () { return H.acStage() === 0; }, function () { if (has('modes.autoCal.cancel')) UT.modes.autoCal.cancel(); UT.renderNow(); }, { hk: 'Esc 또는 창의 Cancel.', he: 'Esc or Cancel.', ok: '취소하면 기존 교정이 유지됩니다.', oe: 'Cancelling keeps the previous calibration.' }),
    C('기준 게인 저장의 목적은?', 'Why store the reference gain?', [['return', '주사 후 기준 감도로 정확히 복귀', 'Return exactly to reference sensitivity after scanning'], ['louder', '더 큰 소리', 'Louder'], ['cal', '교정', 'Calibration'], ['none', '없음', 'None']], 'return',
      { hk: '주사 감도 = 기준 + 6 dB.', he: 'Scanning gain = reference + 6 dB.', ok: '평가는 기준 감도에서만 — 잠금이 실수를 막습니다.', oe: 'Evaluate at reference only — the lock prevents mistakes.' }),
    N('기준 게인(dB)?', 'Reference gain (dB)?', function (c) { return c.S.instrument.refGain; }, 0, { hk: '게인 셀의 Ref 값.', he: 'The Ref value in the gain cell.', ok: '보고서의 기준 감도 항목.', oe: 'The reference-sensitivity line of the report.' }),
  ]; };
  STEPS[23] = function () { return [
    S('Tools ▸ Procedures ▸ iso-B-plate20 적용', 'Apply the procedure iso-B-plate20', function (c) { return c.S.standards.procedure === 'iso-B-plate20'; }, function () { H.applyProcedure('iso-B-plate20'); },
      { hk: 'Tools 메뉴 ▸ Procedures.', he: 'Tools menu ▸ Procedures.', ok: '절차서가 표준·허용 수준·대비 시험편·탐촉자 세트를 정합니다.', oe: 'The procedure fixes standard, acceptance level, reference block and probe set.' }),
    S('T/2 횡공을 80 %로', 'T/2 SDH at 80 %', function (c) { return !!c.R && abs(c.R.peakPct - 80) <= 2 && c.R.echoKind === 'sdh'; }, function () { H.clickMode('dac'); H.click('tb-60'); const h = H.hole(st().specimen, st().specimen.T / 2); if (h) H.setProbe({ x: +(h.x + h.y * T60).toFixed(1) }); H.gate(10, 30, 10); H.auto(80); },
      { hk: HOLE_KO, he: HOLE_EN, ok: '기준 반사체 80 % — 이것이 기준 레벨(기준 감도)입니다.', oe: 'Reference reflector at 80 % — this is the reference level.' }),
    S('2ND F + dB 로 기준 게인 저장', 'Store as reference gain (2ND F + dB)', function (c) { return c.S.instrument.refGain === c.S.instrument.gain; }, function () { H.storeRef(); }, { hk: '2ND F 후 dB.', he: '2ND F then dB.', ok: '기준 게인이 잠깁니다.', oe: 'The reference gain is locked.' }),
    C('주사 감도는?', 'Scanning sensitivity is…', [['ref+6', '기준 + 6 dB (ISO 17640 — verify)', 'Reference + 6 dB (ISO 17640 — verify)'], ['ref', '기준과 동일', 'Same as reference'], ['ref-6', '기준 − 6 dB', 'Reference − 6 dB'], ['max', '최대', 'Maximum']], 'ref+6',
      { hk: '작은 지시를 놓치지 않으려면.', he: 'So that small indications are not missed.', ok: '주사는 기준 + 6 dB, 평가는 기준 감도로 되돌려서.', oe: 'Scan at reference + 6 dB; evaluate back at reference.' }),
    S('주사 감도로 설정 (기준 + 6)', 'Set scanning gain (ref + 6)', function (c) { return c.S.instrument.gain === c.S.instrument.refGain + 6; }, function () { H.setInstrument({ gain: st().instrument.refGain + 6 }); }, { hk: '▲ 12번 (0.5 dB) 또는 2ND F + ▲.', he: '▲ twelve times (0.5 dB) or 2ND F + ▲.', ok: '게인 셀: Ref xx + 6.0 dB.', oe: 'Gain cell: Ref xx + 6.0 dB.' }),
  ]; };
  STEPS[24] = function () { return [
    S('대비 시험편에서 0° 저면 에코 80 % (T = 20)', '0° backwall 80 % on the block (T = 20)', function (c) { return c.S.mode === 'dac' && c.S.probe.angle === 0 && !!c.R && c.R.echoKind === 'backwall' && abs(c.R.peakPct - 80) <= 2; },
      function () { H.clickMode('dac'); H.click('tb-0'); H.setProbe({ x: 40 }); H.gate(10, 20, 10); H.auto(80); },
      { hk: '0° 선택, 구멍이 없는 곳(x 40)에서 저면 에코를 게이트하고 80 %.', he: 'Select 0°, gate the backwall on a hole-free spot (x 40), 80 %.', ok: '대비 시험편에서의 게인이 기준입니다.', oe: 'The gain on the reference block is the baseline.', keep: ['gainBlock'], onPass: function (c) { return { gainBlock: c.S.instrument.gain }; } }),
    S('시험체 건전부에서 같은 경로의 저면 에코 80 %', 'Same on the specimen (clean spot)', function (c) { return c.S.mode === 'weld' && c.S.probe.angle === 0 && !!c.R && c.R.echoKind === 'backwall' && abs(c.R.peakPct - 80) <= 2; },
      function () { H.enter('weld', { keepProbe: true }); H.setProbe({ x: -40 }); H.gate(10, 20, 10); H.auto(80); },
      { hk: 'Weld 모드로 돌아가 x −40(용접부 밖)에서 80 %.', he: 'Back to the weld, x −40 (outside the weld), 80 %.', ok: '게인 차 = 전달 손실(표면·감쇠 차이).', oe: 'The gain difference = transfer loss (surface and attenuation).', keep: ['gainSpec'], onPass: function (c) { return { gainSpec: c.S.instrument.gain }; } }),
    N('전달 손실(dB)?', 'Transfer loss (dB)?', function (c) { return (c.memo.gainSpec || 0) - (c.memo.gainBlock || 0); }, 1, { hk: '시험체 게인 − 시험편 게인.', he: 'Specimen gain − block gain.', ok: 'ISO 17640: 2 dB 이하 무시, 2…12 dB 보정, 12 dB 초과 시 원인 조사.', oe: 'ISO 17640: ≤ 2 dB ignore, 2…12 dB compensate, > 12 dB investigate.' }),
    S('평가 창의 전달 보정에 입력', 'Enter it in Evaluation ▸ Transfer', function (c) { return abs(c.S.standards.transferDb - c.S.weldOpts.transferLossDb) <= 1; }, function () { UT.setIn('standards', { transferDb: st().weldOpts.transferLossDb }); UT.renderNow(); },
      { hk: 'Tools ▸ Evaluation ▸ Transfer dB.', he: 'Tools ▸ Evaluation ▸ Transfer dB.', ok: '보정값은 지시 dB에 더해져 평가됩니다.', oe: 'The correction is added to the indication dB before evaluation.' }),
    C('보정값이 +5 dB일 때 주사 감도는?', 'With +5 dB correction, scanning gain is…', [['ref+5+scan', '기준 + 5 + 주사 여유', 'Reference + 5 + scanning allowance'], ['ref', '기준', 'Reference'], ['ref-5', '기준 − 5', 'Reference − 5'], ['unchanged', '변화 없음', 'Unchanged']], 'ref+5+scan',
      { hk: '손실은 게인으로 보상합니다.', he: 'Losses are compensated with gain.', ok: '기준 34 + 5 + 6 = 45 dB로 주사.', oe: 'Reference 34 + 5 + 6 = 45 dB for scanning.' }),
  ]; };
  STEPS[25] = function () { return [
    S('시험 중 DAC 블록으로 돌아가 T/2 횡공 확인', 'Return to the DAC block and check the T/2 SDH', function (c) { return c.S.mode === 'dac' && c.E.some(function (e) { return e.kind === 'sdh' && abs(e.path - 20) <= 1; }); },
      function () { H.clickMode('dac'); H.click('tb-60'); const h = H.hole(st().specimen, 10); if (h) H.setProbe({ x: +(h.x + 10 * T60).toFixed(1) }); H.gate(10, 30, 10); },
      { hk: 'DAC 버튼, 60°, T/2 구멍 최대 위치.', he: 'DAC button, 60°, T/2 hole maximum.', ok: '80 %가 아닙니다 — 감도가 드리프트했습니다.', oe: 'It does not read 80 % — the sensitivity drifted.' }),
    C('80 %가 아닌 74 %(또는 86 %)로 읽힘. 조치는?', 'It reads 74 % (or 86 %), not 80 %. Action?', [['reset-rescan', '기준 감도를 다시 맞추고 그 사이 주사한 부분을 재주사 (ISO 17640: > 4 dB 차이 시)', 'Reset the reference and re-scan what was scanned since (ISO 17640: when > 4 dB)'], ['ignore', '무시', 'Ignore'], ['note-only', '기록만', 'Note only'], ['reject-all', '전부 불합격', 'Reject everything']], 'reset-rescan',
      { hk: '드리프트가 한계를 넘으면 그 사이의 결과를 믿을 수 없습니다.', he: 'Beyond the limit, the results since the last check are unreliable.', ok: 'ISO 17640: 감도 확인은 최소 4시간마다·검사 종료 시; 4 dB 초과 시 재주사.', oe: 'ISO 17640: check sensitivity at least every 4 h and at the end; > 4 dB → re-scan.' }),
    S('기준 감도 복원', 'Restore the reference', function (c) { return !!c.R && abs(c.R.peakPct - 80) <= 2 && c.S.instrument.gain === c.S.instrument.refGain; }, function () { H.setInstrument({ gain: st().instrument.refGain }); },
      { hk: '게인을 저장된 기준 게인으로.', he: 'Set the gain back to the stored reference.', ok: '잠긴 기준 게인 덕분에 정확히 복귀합니다.', oe: 'The locked reference makes the return exact.' }),
    N('드리프트(dB)?', 'Drift (dB)?', function (c) { return c.memo.driftDb; }, 1, { anySign: true, hk: '드리프트된 게인 − 기준 게인.', he: 'Drifted gain − reference gain.', ok: '3 dB: 한계(4 dB) 이내지만 기록합니다.', oe: '3 dB: within the 4 dB limit, but record it.' }),
    C('허용 드리프트 한계는?', 'Tolerated drift before re-scanning', [['4', '4 dB', '4 dB'], ['1', '1 dB', '1 dB'], ['10', '10 dB', '10 dB'], ['any', '무제한', 'Unlimited']], '4',
      { hk: 'ISO 17640 (verify).', he: 'ISO 17640 (verify).', ok: '4 dB 초과 → 직전 확인 이후 주사 구간 재검사.', oe: '> 4 dB → re-test everything since the previous check.' }),
  ]; };

  // ------------------------------------------------------------------ setups (late binding to 80-modes, §1)
  const setupsV1 = (UT.modes && (UT.modes.lessonSetups || (Array.isArray(UT.modes.lessons) ? UT.modes.lessons : null))) || [];
  function v1Setup(i) { const l = setupsV1[i]; return l && typeof l.setup === 'function' ? l.setup : function () { console.warn('[UT.lessons] v1 setup ' + (i + 1) + ' missing'); }; }
  const dacHole = function (y) { return H.hole(st().specimen, y); };
  const SETUP_OVERRIDES = {
    2: function () { v1Setup(1)(); H.setInstrument({ range: 50 }); },
    11: function () { v1Setup(10)(); H.setInstrument({ range: 200, gain: 30, peakMem: false, freeze: false, gates: [{ on: true, start: 10, width: 60, level: 20 }] }); },
    15: function () { H.weld({ T: 20, pipe: false }); H.setProbe({ angle: 60, x: 40 }); },
    17: function () {
      H.weld({ T: 25, pipe: true, od: 219.1, wt: 25, capWidth: 18 }); H.setProbe({ angle: 60, x: 40, z: 130 });
      const spec = st().specimen;
      const lam = UT.specimens.makeDefect({ n: 1, type: 'lamination', label: 'Lamination', pts: [{ x: -45, y: 12 }, { x: -15, y: 12 }], height: 0.5, zFrom: 100, zTo: 160 });
      H.setDefects([lam]); H.addPreset('rootCrack', { zFrom: 115, zTo: 145 }); H.setInstrument({ range: 100, gain: 30 }); void spec;
    },
    18: function () { v1Setup(17)(); H.addPreset('rootCrack', { zFrom: 120, zTo: 150 }); },
    22: function () { v1Setup(10)(); H.setInstrument({ page: 1, gain: 36, refGain: 30, range: 100, gates: [{ on: true, start: 10, width: 60, level: 20 }, { on: false, start: 70, width: 20, level: 40 }] }); UT.setIn('instrument', { page: 1 }); if (has('modes.autoCal.cancel')) UT.modes.autoCal.cancel(); },
  };
  const NEW_LESSONS = {
    23: { n: 23, title: 'Set the reference level', ko: '기준 감도 설정: 절차서, T/2 횡공 80 %, 기준 게인 잠금, 주사 감도', en: 'Reference level: procedure, T/2 SDH at 80 %, reference-gain lock, scanning gain',
      setup() { UT.setIn('weldOpts', { T: 20 }, { noRender: true }); H.enter('dac', { keepProbe: false }); H.setProbe({ angle: 60 }); H.setInstrument({ gain: 30, refGain: 30, range: 100, gates: [{ on: true, start: 10, width: 30, level: 10 }] }); UT.setIn('standards', { procedure: null, transferDb: 0 }); const h = dacHole(10); if (h) H.setProbe({ x: +(h.x + 10 * T60).toFixed(1) }); } },
    24: { n: 24, title: 'Transfer correction', ko: '전달 손실 보정: 대비 시험편 vs 시험체 저면 에코', en: 'Transfer correction: block versus specimen backwall',
      setup() { UT.set({ weldOpts: Object.assign({}, UT.defaultState().weldOpts, { T: 20, transferLossDb: 4 }) }, { noRender: true }); H.enter('dac', { keepProbe: false }); H.setProbe({ angle: 60, x: 40 }); H.setInstrument({ gain: 30, range: 100, gates: [{ on: true, start: 10, width: 20, level: 10 }] }); UT.setIn('standards', { transferDb: 0 }); } },
    25: { n: 25, title: 'Sensitivity re-check', ko: '감도 재확인: 드리프트 발견, 기준 복원, 재주사 판단', en: 'Sensitivity re-check: spot the drift, restore the reference, decide on re-scanning',
      setup() {
        UT.setIn('weldOpts', { T: 20 }, { noRender: true }); H.enter('dac', { keepProbe: false }); H.setProbe({ angle: 60 }); H.setInstrument({ gain: 34, range: 100, gates: [{ on: true, start: 10, width: 30, level: 10 }] });
        const h = dacHole(10); if (h) H.setProbe({ x: +(h.x + 10 * T60).toFixed(1) });
        H.auto(80); H.storeRef();
        H.enter('weld', { keepProbe: true }); H.setProbe({ x: 40 });
        L.drift++;
        const sign = M.rng(25 + L.drift)() < 0.5 ? -1 : 1;
        H.setInstrument({ gain: st().instrument.refGain + sign * 3 });
        return { driftDb: sign * 3 };
      } },
  };
  const list = [];
  for (let n = 1; n <= 25; n++) {
    const base = n <= 22 ? (setupsV1[n - 1] || { n, title: 'Lesson ' + n, ko: '레슨 ' + n, en: 'Lesson ' + n, setup: v1Setup(n - 1), steps: [] }) : NEW_LESSONS[n];
    const entry = Object.assign({}, base, { n, steps: STEPS[n](), stepsText: Array.isArray(base.steps) && typeof base.steps[0] === 'string' ? base.steps.slice() : [] });
    if (SETUP_OVERRIDES[n]) entry.setup = SETUP_OVERRIDES[n];
    entry.keep = []; entry.steps.forEach(function (s) { (s.keep || []).forEach(function (k) { if (entry.keep.indexOf(k) < 0) entry.keep.push(k); }); });
    list.push(entry);
  }

  // ------------------------------------------------------------------ engine
  const api = {};
  function lesson(n) { return list[n - 1] || null; }
  function progOf(n) { return Object.assign({ done: false, best: 0, hints: 0, doIt: 0, wrong: 0, auto: false }, (ls().progress || {})[n] || {}); }
  function writeProg(n, patch) { const p = Object.assign({}, ls().progress || {}); p[n] = Object.assign(progOf(n), patch); writeL({ progress: p }); }
  function ctx() {
    const s = st(), f = UT.frame || {}, l = s.lessons || {}, n = l.active, i = l.step;
    const memo = l.memo && typeof l.memo === 'object' ? l.memo : {};
    if (!memo.ui) memo.ui = tally();
    return { state: s, S: s, frame: f, modes: UT.modes, memo, ans: n !== null && l.answers && l.answers[n] ? l.answers[n][i] : undefined, prevFrame: L.prevFrame, spec: s.specimen, R: f.readouts ? f.readouts.primary : null, E: f.echoes || [], H };
  }
  function curStep() { const l = ls(); const ln = l.active !== null ? lesson(l.active) : null; return ln ? ln.steps[l.step] || null : null; }
  function safeCheck(step, c) { try { return !!step.check(c); } catch (e) { return false; } }
  function announce(text, kind) { L.feedback = text || ''; L.feedbackKind = kind || ''; if (L.ui.live) L.ui.live.textContent = L.feedback; }
  function stopHintTimer() { if (L.hintTimer) { clearTimeout(L.hintTimer); L.hintTimer = null; } }
  function startHintTimer() {
    stopHintTimer();
    if (L.autoRunning || typeof setTimeout !== 'function') return;
    L.hintTimer = setTimeout(function () { L.hintTimer = null; if (ls().active !== null && !L.hintShown) api.hint(); }, 30000);
  }
  /** Enter step i of the active lesson: reset memo (keep set), record `was`, restart the hint timer. */
  function enterStep(n, i) {
    const ln = lesson(n), step = ln.steps[i]; if (!step) return;
    const old = ls().memo || {};
    const memo = { ui: tally() };
    ln.keep.forEach(function (k) { if (old[k] !== undefined) memo[k] = old[k]; });
    (old.__init || []).forEach(function (k) { if (old[k] !== undefined) memo[k] = old[k]; });
    if (old.__init) memo.__init = old.__init;
    writeL({ step: i, memo, stepStartedAt: Date.now() });
    L.hintShown = false;
    if (step.onEnter) { try { const r = step.onEnter(ctx()); if (r && typeof r === 'object') writeL({ memo: Object.assign({}, ls().memo, r) }); } catch (e) { /* ignore */ } }
    if (step.mode === 'transition') writeL({ memo: Object.assign({}, ls().memo, { was: safeCheck(step, ctx()) }) });
    startHintTimer();
    refresh(true);
  }
  function passStep(n, i, how) {
    const ln = lesson(n), step = ln.steps[i];
    const p = progOf(n);
    if (how === 'doIt') p.doIt = (p.doIt || 0) + 1;
    p.passed = Object.assign({}, p.passed || {}); p.passed[i] = how;
    writeProg(n, p);
    if (step.onPass) { try { const r = step.onPass(ctx()); if (r && typeof r === 'object') writeL({ memo: Object.assign({}, ls().memo, r) }); } catch (e) { /* ignore */ } }
    announce((ko() ? step.okKo : step.okEn) || t('Step {n} done', { n: i + 1 }), 'ok');
    if (i + 1 < ln.steps.length) enterStep(n, i + 1); else complete(n);
  }
  function complete(n) {
    const ln = lesson(n), p = progOf(n), total = ln.steps.length;
    const byDoIt = Object.keys(p.passed || {}).filter(function (k) { return p.passed[k] === 'doIt' || p.passed[k] === 'skip'; }).length;
    const score = M.clamp(Math.round(100 * (total - byDoIt - 0.5 * (p.hints || 0) - 0.5 * (p.wrong || 0)) / total), 0, 100);
    const patch = { done: true, auto: !!L.autoRunning };
    if (!L.autoRunning) patch.best = Math.max(p.best || 0, score);
    patch.last = score;
    writeProg(n, patch);
    L.lastCompleted = n;
    stopHintTimer();
    writeL({ active: null, step: 0, memo: {} });
    UT.set({ lesson: null }, { noRender: true });
    if (!L.autoRunning) { announce(t('Lesson {n} complete — score {s} %', { n, s: score }), 'ok'); UT.status({ right: t('Lesson {n} complete — score {s} %', { n, s: score }) }); }
    refresh(true);
  }
  /** Evaluate only the current step (pure function of state + frame). Returns true when it passed. */
  function evaluate() {
    const l = ls(); if (l.active === null || l.active === undefined) return false;
    const n = l.active, i = l.step, ln = lesson(n), step = ln && ln.steps[i];
    if (!step) return false;
    const c = ctx();
    const ok = safeCheck(step, c);
    if (step.mode === 'transition') {
      if (!ok) { if (c.memo.was !== false) writeL({ memo: Object.assign({}, c.memo, { was: false }) }); return false; }
      if (c.memo.was !== false) return false;
    }
    if (!ok) return false;
    passStep(n, i, 'user');
    return true;
  }
  function scheduleEval() {
    if (L.evalTimer || typeof setTimeout !== 'function') return;
    const wait = Math.max(0, 150 - (Date.now() - L.lastEval));
    L.evalTimer = setTimeout(function () { L.evalTimer = null; L.lastEval = Date.now(); if (!L.autoRunning && ls().active !== null) evaluate(); }, wait);
  }

  api.list = list;
  /** Start lesson n (1…25): runs setup(), resets answers/memo, enters step 0. */
  api.start = function (n) {
    n = +n; const ln = lesson(n); if (!ln) return null;
    stopHintTimer();
    if (has('modes.defectEditor.isOpen') && UT.modes.defectEditor.isOpen()) UT.modes.defectEditor.close();
    if (has('modes.autoCal.cancel')) UT.modes.autoCal.cancel();
    L.cov = { 1: {}, '-1': {} };
    // clean baseline so a lesson never inherits twin crystal / freeze / reject / hidden defects from the previous one
    UT.setIn('instrument', { freeze: false, peakMem: false, reject: 0, delay: 0 }, { noRender: true });
    UT.setIn('probe', { crystal: 'single', method: 'pe', skew: 0 }, { noRender: true });
    UT.setIn('display', { hide: false, beam: true }, { noRender: true });
    let init = null;
    try { init = ln.setup(); } catch (e) { console.error('[UT.lessons] setup ' + n, e); }
    const memo = { ui: tally() };
    if (init && typeof init === 'object') { Object.assign(memo, init); memo.__init = Object.keys(init); }
    const answers = Object.assign({}, ls().answers || {}); answers[n] = {};
    writeProg(n, { hints: 0, doIt: 0, wrong: 0, passed: {} });
    writeL({ active: n, step: 0, memo, answers, stepStartedAt: Date.now() });
    UT.set({ lesson: n - 1 }, { noRender: true });
    L.lastCompleted = null;
    announce('', '');
    enterStep(n, 0);
    UT.renderNow();
    UT.status({ right: (ko() ? ln.ko : ln.en) });
    return ln;
  };
  /** Stop the active lesson (keeps progress). */
  api.stop = function () { stopHintTimer(); writeL({ active: null, step: 0, memo: {} }); UT.set({ lesson: null }, { noRender: true }); refresh(true); };
  /** Jump to step i of the active lesson. */
  api.goto = function (i) { const l = ls(); if (l.active === null) return; const ln = lesson(l.active); i = M.clamp(Math.round(+i || 0), 0, ln.steps.length - 1); enterStep(l.active, i); };
  /** {n, step, done[]} of the active lesson (n null when idle). */
  api.current = function () {
    const l = ls(); if (l.active === null || l.active === undefined) return { n: null, step: 0, done: [] };
    const p = progOf(l.active), ln = lesson(l.active);
    return { n: l.active, step: l.step, done: ln.steps.map(function (s, i) { return i < l.step || !!(p.passed && p.passed[i]); }) };
  };
  /** Skip to the next step (counts like 'Do it for me' for the score). */
  api.next = function () { const l = ls(); if (l.active === null) return; passStep(l.active, l.step, 'skip'); };
  api.prev = function () { const l = ls(); if (l.active === null || l.step === 0) return; enterStep(l.active, l.step - 1); };
  /** Show the hint of the current step (once per step it lowers the score). */
  api.hint = function () {
    const l = ls(), step = curStep(); if (!step) return '';
    if (!L.hintShown) { L.hintShown = true; writeProg(l.active, { hints: progOf(l.active).hints + 1 }); }
    const text = ko() ? step.hintKo : step.hintEn;
    announce(text || t('No hint for this step'), 'hint');
    refresh(true);
    return text;
  };
  /** Perform the current step for the user (never leaves the user stuck). */
  api.doIt = function () {
    const l = ls(), step = curStep(); if (!step) return false;
    const n = l.active, i = l.step;
    try { if (step.doIt) step.doIt(ctx()); } catch (e) { console.error('[UT.lessons] doIt ' + n + '/' + (i + 1), e); }
    UT.renderNow();
    if (ls().active === n && ls().step === i) {
      let ok = safeCheck(step, ctx());
      if (!ok) { UT.renderNow(); ok = safeCheck(step, ctx()); }
      passStep(n, i, 'doIt');
      return ok;
    }
    writeProg(n, { doIt: progOf(n).doIt + 1 });
    return true;
  };
  /** Answer the current choice/numeric step. Returns true when the step passed. */
  api.answer = function (value) {
    const l = ls(), step = curStep(); if (!step) return false;
    const n = l.active, i = l.step;
    const answers = Object.assign({}, l.answers || {}); answers[n] = Object.assign({}, answers[n] || {}); answers[n][i] = value;
    const patch = { answers };
    if (step.input === 'number') patch.memo = Object.assign({}, l.memo, { expected: step.expected(ctx()) });
    writeL(patch);
    const c = ctx();
    const ok = safeCheck(step, c);
    if (ok) { passStep(n, i, 'user'); return true; }
    if (step.choices) {
      const ch = step.choices.find(function (q) { return q.id === value; });
      if (value === step.answer && step.also) { announce(ko() ? step.alsoKo : step.alsoEn, 'hint'); refresh(true); return false; }
      writeProg(n, { wrong: progOf(n).wrong + 1 });
      announce((ch && (ko() ? ch.wrongKo : ch.wrongEn)) || (ko() ? step.wrongKo : step.wrongEn), 'wrong');
    } else {
      writeProg(n, { wrong: progOf(n).wrong + 1 });
      announce(ko() ? step.wrongKo : step.wrongEn, 'wrong');
    }
    refresh(true);
    return false;
  };
  /** Headless run of lesson n: doIt per step, then check. → Promise<{n, completed, failedSteps}> */
  api.autoRun = function (n) {
    return new Promise(function (resolve) {
      n = +n; const ln = lesson(n);
      if (!ln) { resolve({ n, completed: false, failedSteps: ['no such lesson'] }); return; }
      const failed = [];
      L.autoRunning = true;
      try {
        api.start(n);
        for (let i = 0; i < ln.steps.length; i++) {
          if (ls().active !== n) break;
          if (ls().step !== i) enterStep(n, i);
          const step = ln.steps[i];
          try { if (step.doIt) step.doIt(ctx()); } catch (e) { failed.push((i + 1) + ': doIt threw ' + (e && e.message)); }
          UT.renderNow();
          let ok = ls().active !== n || ls().step !== i;
          if (!ok) ok = safeCheck(step, ctx()) && (step.mode !== 'transition' || ls().memo.was === false);
          if (!ok) { UT.renderNow(); ok = safeCheck(step, ctx()) && (step.mode !== 'transition' || ls().memo.was === false); }
          if (!ok) failed.push((i + 1) + ': ' + step.en);
          if (ls().active === n && ls().step === i) passStep(n, i, ok ? 'auto' : 'skip');
        }
      } catch (e) { failed.push('error: ' + (e && e.message)); }
      L.autoRunning = false;
      if (ls().active === n) api.stop();
      writeProg(n, { done: true, auto: true });
      resolve({ n, completed: failed.length === 0, failedSteps: failed });
    });
  };

  // ------------------------------------------------------------------ bus consumers
  UT.bus.on('ui', function (ev) {
    L.uiSeen++;
    if (!ev || ls().active === null || ls().active === undefined) return;
    const memo = Object.assign({}, ls().memo || {});
    const ui = Object.assign(tally(), memo.ui || {});
    ui.tbClickCount = Object.assign({}, ui.tbClickCount || {});
    const id = ev.id === undefined || ev.id === null ? '' : String(ev.id);
    switch (ev.kind) {
      case 'menu-open': ui.menuOpen = pushU(ui.menuOpen, id); break;
      case 'tb-hover': ui.tbHover = pushU(ui.tbHover, id); break;
      case 'tb-click': ui.tbClick = pushU(ui.tbClick, id); ui.tbClickCount[id] = (ui.tbClickCount[id] || 0) + 1; if (id === 'tb-beam') memo.beamToggles = (memo.beamToggles || 0) + 1; break;
      case 'wheel': ui.wheel = (ui.wheel || 0) + 1; break;
      case 'probe-drag': ui.drag = (ui.drag || 0) + 1; break;
      case 'window-open': ui.win = pushU(ui.win, id); break;
      case 'softkey': ui.softkey = pushU(ui.softkey, id); break;
      default: return;
    }
    memo.ui = ui;
    writeL({ memo });
    scheduleEval();
  });
  UT.bus.on('win:show', function (w) {
    if (!w || !w.name || ls().active === null || ls().active === undefined) return;
    const memo = Object.assign({}, ls().memo || {}); const ui = Object.assign(tally(), memo.ui || {});
    if (ui.win.indexOf(w.name) >= 0) return;
    ui.win = pushU(ui.win, w.name); memo.ui = ui; writeL({ memo }); scheduleEval();
  });
  UT.bus.on('lang', function () {
    if (ls().active !== null && ls().active !== undefined) { const memo = Object.assign({}, ls().memo || {}); memo.langChanges = (memo.langChanges || 0) + 1; writeL({ memo }); scheduleEval(); }
    if (L.win) { L.win.setTitle(t('Lessons')); refresh(true); }
    if (Q.win) { Q.win.setTitle(t('Echo quiz')); quizRefresh(); }
  });
  UT.bus.on('render', function (frame) {
    L.prevFrame = L.curFrame; L.curFrame = frame;
    const s = st();
    if (s.lessons && s.lessons.active === 21 && s.trade && s.trade.active && s.specimen && !L.autoRunning) covRecord(s);
    else if (s.lessons && s.lessons.active === 21 && s.trade && s.trade.active && s.specimen) covRecord(s);
    if (s.lessons && s.lessons.active !== null && s.lessons.active !== undefined) scheduleEval();
    if (L.win && L.win.isOpen() && Date.now() - L.lastRefresh > 250) { L.lastRefresh = Date.now(); refresh(false); }
    if (Q.win && Q.win.isOpen() && Q.dirty) { Q.dirty = false; quizRefresh(); }
  });
  function covRecord(s) {
    const spec = s.specimen, p = s.probe; if (!spec || p.angle === 0) return;
    const T = spec.T || 20, th = Math.tan(p.angle * DEG), cap = (spec.weld && spec.weld.capWidth) || s.weldOpts.capWidth || 16;
    const x = (p.side === -1 ? -1 : 1) * p.x, lo = 0.5 * T * th, hi = 2 * T * th + cap / 2;
    if (x < lo || x > hi) return;
    L.cov[p.side === -1 ? -1 : 1][Math.floor(p.z / 5)] = 1;
  }

  // ------------------------------------------------------------------ window 'lessons' (v2)
  function hT(tag, attrs, key, params) { const a = Object.assign({}, attrs || {}); a.dataset = Object.assign({}, a.dataset || {}, { i18n: key }); return UT.dom.h(tag, a, t(key, params)); }
  function badgeOf(n) { const p = progOf(n); return !p.done ? { cls: 'ls2-b0', txt: '' } : (p.best >= 100 ? { cls: 'ls2-b2', txt: '★' } : { cls: 'ls2-b1', txt: '✓' }); }
  function headerText() {
    let done = 0, gold = 0;
    list.forEach(function (l) { const p = progOf(l.n); if (p.done) done++; if (p.done && p.best >= 100) gold++; });
    return t('{x}/25 done, {y} ★', { x: done, y: gold });
  }
  function buildList() {
    const dom = UT.dom, l = ls();
    return dom.h('div', { class: 'ls2-list', role: 'list' }, list.map(function (ln) {
      const b = badgeOf(ln.n);
      return dom.h('div', { class: 'ls2-row' + (l.active === ln.n ? ' active' : ''), role: 'listitem', tabindex: 0, title: ln.title,
        onclick: function () { api.start(ln.n); }, onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); api.start(ln.n); } } }, [
        dom.h('span', { class: 'ls2-badge ' + b.cls, 'aria-hidden': 'true' }, b.txt),
        dom.h('span', { class: 'ls2-n' }, String(ln.n)),
        dom.h('span', { class: 'ls2-txt' }, [dom.h('span', { class: 'ls2-t' }, ln.title), dom.h('span', { class: 'ls2-d' }, ko() ? ln.ko : ln.en)]),
      ]);
    }));
  }
  function echoList() {
    const dom = UT.dom, f = UT.frame, es = f && f.ascan && f.ascan.echoesOnScreen ? f.ascan.echoesOnScreen.slice().sort(function (a, b) { return a.pDisp - b.pDisp; }).slice(0, 12) : [];
    const ol = dom.h('ol', { class: 'ls2-echoes', 'aria-label': t('Echoes on screen') });
    es.forEach(function (e) {
      const name = has('rays.describe') ? UT.rays.describe(e.echo) : (e.echo && e.echo.kind);
      const label = (typeof name === 'object' && name ? (ko() && name.ko ? name.ko : name.en || name.text || '') : String(name || '')) + ' — ' + M.fmt(e.pDisp, 1) + ' mm, ' + Math.round(e.ampPct) + ' %';
      ol.appendChild(dom.h('li', {}, [dom.h('span', { class: 'ls2-echo' }, label), dom.button(t('Select'), function () { H.setInstrument({ gates: [{ on: true, start: Math.max(0.5, +(e.pDisp - 4).toFixed(1)), width: 8 }] }); }, { class: 'btn small', title: t('Gate this echo') })]));
    });
    if (!es.length) ol.appendChild(dom.h('li', { class: 'ls2-dim' }, t('No echoes on screen')));
    return ol;
  }
  function buildPanel() {
    const dom = UT.dom, l = ls();
    const wrap = dom.h('div', { class: 'ls2-panel' });
    const active = l.active !== null && l.active !== undefined ? lesson(l.active) : null;
    const shown = active || (L.lastCompleted ? lesson(L.lastCompleted) : null);
    if (!shown) {
      wrap.appendChild(hT('div', { class: 'ls2-dim' }, 'Select a lesson on the left and press Start'));
      wrap.appendChild(dom.h('div', { class: 'ls2-btns' }, [dom.button(t('Start'), function () { api.start(1); }, { class: 'btn primary' }), dom.button(t('Echo quiz'), function () { api.quiz.window.show(); })]));
      return wrap;
    }
    const p = progOf(shown.n);
    wrap.appendChild(dom.h('div', { class: 'ls2-title' }, shown.n + '. ' + shown.title));
    wrap.appendChild(dom.h('div', { class: 'ls2-desc' }, ko() ? shown.ko : shown.en));
    const stepIdx = active ? l.step : shown.steps.length;
    const ol = dom.h('ol', { class: 'ls2-steps', 'aria-label': t('Steps') }, shown.steps.map(function (s, i) {
      const passed = active ? (i < stepIdx) : true;
      const cls = passed ? 'done' : (i === stepIdx && active ? 'cur' : 'todo');
      const mark = passed ? '✓' : (cls === 'cur' ? '▶' : '○');
      return dom.h('li', { class: 'ls2-step ' + cls, 'aria-current': cls === 'cur' ? 'step' : null }, [dom.h('span', { class: 'ls2-tick', 'aria-hidden': 'true' }, mark), dom.h('span', {}, ko() ? s.ko : s.en)]);
    }));
    wrap.appendChild(ol);
    const step = active ? shown.steps[stepIdx] : null;
    if (step) {
      const box = dom.h('div', { class: 'ls2-cur', id: 'ls2-cur' });
      const text = ko() ? step.ko : step.en;
      box.appendChild(dom.h('div', { class: 'ls2-q', id: 'ls2-q' }, t('Step {n} of {m}', { n: stepIdx + 1, m: shown.steps.length }) + ': ' + text));
      if (step.choices) {
        const ans = l.answers && l.answers[shown.n] ? l.answers[shown.n][stepIdx] : undefined;
        box.appendChild(dom.h('div', { class: 'ls2-choices', role: 'group', 'aria-labelledby': 'ls2-q' }, step.choices.map(function (c) {
          return dom.button(ko() ? c.ko : c.en, function () { api.answer(c.id); }, { class: 'btn ls2-choice' + (ans === c.id ? ' picked' : ''), 'aria-pressed': ans === c.id ? 'true' : 'false' });
        })));
      } else if (step.input === 'number') {
        const inp = dom.h('input', { type: 'number', step: 'any', class: 'fld-input ls2-num', 'aria-label': text });
        const ok = dom.button(t('Answer'), function () { const v = parseFloat(inp.value); if (Number.isFinite(v)) api.answer(v); }, { class: 'btn primary' });
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
        box.appendChild(dom.h('div', { class: 'ls2-numrow' }, [inp, ok]));
      }
      wrap.appendChild(box);
    }
    const fb = dom.h('div', { class: 'ls2-fb ' + (L.feedbackKind || '') }, L.feedback || '');
    wrap.appendChild(fb);
    const btns = dom.h('div', { class: 'ls2-btns' }, [
      dom.button(t(active ? 'Restart' : 'Start'), function () { api.start(shown.n); }, { class: 'btn' }),
      dom.button(t('Hint'), function () { api.hint(); }, { class: 'btn', disabled: !active ? true : null }),
      dom.button(t('Do it for me'), function () { api.doIt(); }, { class: 'btn', disabled: !active ? true : null }),
      dom.button(t('Next lesson'), function () { api.start(shown.n < 25 ? shown.n + 1 : 1); }, { class: 'btn' }),
      dom.button(t('Stop'), function () { api.stop(); }, { class: 'btn', disabled: !active ? true : null }),
    ]);
    wrap.appendChild(btns);
    wrap.appendChild(dom.h('div', { class: 'ls2-score' }, [
      hT('span', {}, 'Best {b} % · hints {h} · do-it {d} · wrong {w}', { b: p.best || 0, h: p.hints || 0, d: p.doIt || 0, w: p.wrong || 0 }),
    ]));
    wrap.appendChild(hT('div', { class: 'ls2-sub' }, 'Echoes on screen (keyboard alternative to clicking the A-scan)'));
    L.ui.echoes = echoList();
    wrap.appendChild(L.ui.echoes);
    return wrap;
  }
  function build() {
    const dom = UT.dom;
    L.ui.head = dom.h('div', { class: 'ls2-head' }, headerText());
    L.ui.list = buildList();
    L.ui.panel = buildPanel();
    L.ui.live = L.ui.live || dom.h('div', { class: 'ls2-live', 'aria-live': 'polite', role: 'status' }, L.feedback || '');
    return dom.h('div', { class: 'ls2' }, [L.ui.head, dom.h('div', { class: 'ls2-body' }, [L.ui.list, L.ui.panel]), L.ui.live]);
  }
  /** Refresh the window: full rebuild, or light (ticks + echo list) from 'render'. */
  function refresh(full) {
    if (!L.win || !hasDoc() || !L.win.isOpen()) return;
    if (full) { L.win.setContent(build()); return; }
    if (L.ui.echoes && L.ui.echoes.parentNode) { const nu = echoList(); L.ui.echoes.parentNode.replaceChild(nu, L.ui.echoes); L.ui.echoes = nu; }
  }
  function ensureWin() {
    if (L.win) return L.win;
    UT.dom.injectCss('lessons', api.css);
    L.win = UT.dom.win({ name: 'lessons', title: t('Lessons'), x: 240, y: 60, w: 780, content: build(), onShow: function () { refresh(true); } });
    return L.win;
  }
  api.window = {
    show() { if (!hasDoc()) return null; ensureWin().show(); refresh(true); return L.win; },
    hide() { if (L.win) L.win.hide(); return L.win; },
    toggle() { return L.win && L.win.isOpen() ? api.window.hide() : api.window.show(); },
    open() { return api.window.show(); },
    close() { return api.window.hide(); },
    isOpen() { return !!(L.win && L.win.isOpen()); },
    get el() { return L.win ? L.win.el : null; },
    get win() { return L.win; },
  };
  api.show = api.window.show; api.hide = api.window.hide; api.toggle = api.window.toggle; api.open = api.window.show; api.close = api.window.hide;
  api.lessonsWindow = api.window;
  api.css = [
    '.win[data-win=lessons] .win-body{padding:6px;background:#ececec;font-size:12px}',
    '.ls2{display:flex;flex-direction:column;gap:4px;width:100%}',
    '.ls2-head{font-weight:bold;color:#123;padding:2px 4px}',
    '.ls2-body{display:flex;gap:6px;align-items:flex-start}',
    '.ls2-list{width:250px;max-height:460px;overflow:auto;background:#fff;border:1px inset #999;flex:none}',
    '.ls2-row{display:flex;gap:4px;align-items:center;padding:3px 4px;border-bottom:1px solid #e4e4e4;cursor:pointer}',
    '.ls2-row:hover{background:#eef4ff}.ls2-row.active{background:#0a246a;color:#fff}.ls2-row:focus-visible{outline:2px solid #ff8800;outline-offset:-2px}',
    '.ls2-badge{width:16px;height:16px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:11px;line-height:1}',
    '.ls2-b0{background:#bbb}.ls2-b1{background:#2f6fd6;color:#fff}.ls2-b2{background:#e6b800;color:#000}',
    '.ls2-n{width:18px;text-align:right;flex:none;font-weight:bold}',
    '.ls2-txt{display:flex;flex-direction:column;min-width:0}.ls2-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ls2-d{font-size:10px;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ls2-panel{flex:1;min-width:0;max-height:460px;overflow:auto;background:#fff;border:1px inset #999;padding:6px}',
    '.ls2-title{font-weight:bold;font-size:13px}.ls2-desc{color:#345;margin-bottom:4px}',
    '.ls2-steps{margin:4px 0;padding-left:4px;list-style:none}.ls2-step{display:flex;gap:6px;padding:1px 0}.ls2-step.done{color:#2a7a2a}.ls2-step.cur{font-weight:bold;color:#0a246a}.ls2-step.todo{color:#666}.ls2-tick{width:14px;flex:none}',
    '.ls2-cur{border:1px solid #9ab;background:#f4f8ff;padding:6px;margin:4px 0}.ls2-q{font-weight:bold;margin-bottom:4px}',
    '.ls2-choices{display:flex;flex-wrap:wrap;gap:4px}.ls2-choice{text-align:left}.ls2-choice.picked{outline:2px solid #0a246a}',
    '.ls2-numrow{display:flex;gap:4px;align-items:center}.ls2-num{width:110px}',
    '.ls2-fb{min-height:16px;padding:3px 4px;margin:2px 0}.ls2-fb.ok{color:#1b6e1b}.ls2-fb.wrong{color:#b00}.ls2-fb.hint{color:#8a5a00}',
    '.ls2-btns{display:flex;flex-wrap:wrap;gap:4px;margin:4px 0}',
    '.ls2-score{font-size:11px;color:#456}.ls2-sub{font-size:11px;margin-top:6px;color:#345}',
    '.ls2-echoes{margin:2px 0;padding-left:18px;max-height:120px;overflow:auto}.ls2-echoes li{display:flex;gap:6px;align-items:center;padding:1px 0}.ls2-echo{flex:1}',
    '.ls2-dim{color:#777;padding:6px}',
    '.ls2-live{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}',
    '.hc .ls2-row.active{background:#000;color:#ff0}.hc .ls2-step.cur{color:#000}',
  ].join('\n');

  // ------------------------------------------------------------------ §4.5 T7 echo-identification quiz (window 'quiz')
  const LABELS = {
    backwall: { ko: '저면 에코', en: 'Backwall echo', dko: '뒷면(저면)에서의 반사 — 형상 에코, 접촉 확인용', den: 'Reflection from the far surface — geometry, useful as a coupling check' },
    'geometry-root': { ko: '이면 비드(형상)', en: 'Root bead (geometry)', dko: '이면 비드 표면의 반사 — 0.5 스킵 경로, 저면 위치의 형상 에코', den: 'Reflection from the root bead — half-skip path, a geometry echo at the backwall position' },
    'geometry-cap': { ko: '덧살(형상)', en: 'Cap (geometry)', dko: '덧살 토우/표면에서의 반사 — 1 스킵 근처의 형상 에코', den: 'Reflection from the cap toe/surface — a geometry echo near the full skip' },
    'geometry-backing': { ko: '배킹 바 에지', en: 'Backing bar edge', dko: '배킹 바의 끝/아래면 반사 — 형상 에코', den: 'Reflection from the backing bar end/lower face — geometry' },
    corner: { ko: '코너 에코(루트 결함)', en: 'Corner echo (root defect)', dko: '표면 개구 결함과 저면이 이루는 코너의 강한 반사 — 기록', den: 'Strong reflection from the corner of a surface-breaking defect and the backwall — record' },
    tip: { ko: '팁 회절', en: 'Tip diffraction', dko: '결함 끝에서의 약한 회절 — 높이 측정에 사용, 기록', den: 'Weak diffraction from a defect tip — used for height, record' },
    defect: { ko: '결함(융합면)', en: 'Defect (fusion face)', dko: '융합면 결함의 반사 — 기록·사이징', den: 'Reflection from a fusion-face defect — record and size' },
    modeconv: { ko: '모드 변환 에코', en: 'Mode-converted echo', dko: '표면/결함에서 파 모드가 바뀐 의사 지시 — 형상 에코로 메모', den: 'Spurious indication from an S↔L conversion — note as geometry' },
    surface: { ko: '표면파', en: 'Surface wave', dko: '레일리파가 덧살 토우/끝면에서 되돌아온 의사 지시 — 손가락으로 감쇠 확인', den: 'Rayleigh wave returned from the cap toe/end — damp it with a finger to prove it' },
    lamination: { ko: '라미네이션', en: 'Lamination', dko: '압연 방향 판 내부 분리 — 기록, 사각 주사 계획 조정', den: 'In-plane separation of the plate — record, adapt the angle scan' },
    sdh: { ko: '횡공', en: 'SDH', dko: '기준 횡공의 반사 — 기준 감도 설정용 형상 에코', den: 'Reflection from the reference side-drilled hole — geometry, used to set sensitivity' },
  };
  const LABEL_IDS = Object.keys(LABELS);
  const ACTIONS = [{ id: 'record', ko: '기록', en: 'Record' }, { id: 'geometry-note', ko: '형상 에코로 메모', en: 'Note as geometry echo' }, { id: 'ignore', ko: '무시', en: 'Ignore' }];
  const DEFECT_CATS = ['corner', 'tip', 'defect', 'lamination'];
  function actionFor(cat) { return DEFECT_CATS.indexOf(cat) >= 0 ? 'record' : 'geometry-note'; }
  /** Category id of an echo/readout (fallback when UT.rays.describe returns a string). */
  function categoryOf(e) {
    if (!e) return null;
    const k = e.kind || e.echoKind, tag = e.tag || '';
    switch (k) {
      case 'backwall': case 'radius': return 'backwall';
      case 'geometry': return /back/.test(tag) ? 'geometry-backing' : (/cap|toe/.test(tag) ? 'geometry-cap' : 'geometry-root');
      case 'corner': return 'corner';
      case 'tip': return 'tip';
      case 'defect': case 'volumetric': return 'defect';
      case 'modeconv': return 'modeconv';
      case 'surface': return 'surface';
      case 'lamination': return 'lamination';
      case 'sdh': return 'sdh';
      default: return null;
    }
  }
  function describeCategory(R) {
    if (!R) return null;
    let d = null; try { d = UT.rays && UT.rays.describe ? UT.rays.describe(R) : null; } catch (e) { d = null; }
    if (d && typeof d === 'object' && d.category) return d.category;
    const e = (UT.frame.echoes || []).find(function (q) { return q.kind === R.echoKind && abs(q.path - R.path) < 0.05; });
    return categoryOf(e || R);
  }
  const Q = { win: null, ui: {}, dirty: false, saved: null, seed: null, rng: null, ids: [] };
  function gateOn(path) { H.setInstrument({ gates: [{ on: true, start: Math.max(0.5, +(path - 4).toFixed(1)), width: 8, level: 10 }] }); }
  /** Quiz scenarios: each applies a state and returns the target predicate for the gated echo. */
  const SCEN = [
    { id: 'v1-backwall', lvl: 0, apply() { H.setProbe({ angle: 0, crystal: 'single' }); H.enter('v1', { keepProbe: true }); H.setInstrument({ range: 125, gain: 30 }); H.setProbe({ x: 150 }); return { pred: function (e) { return e.kind === 'backwall' && abs(e.path - 50) < 1; }, xs: [150] }; } },
    { id: 'dac-sdh', lvl: 0, apply() { UT.setIn('weldOpts', { T: 20 }, { noRender: true }); H.enter('dac', { keepProbe: false }); H.setProbe({ angle: 60 }); H.setInstrument({ range: 100, gain: 30 }); const h = H.hole(st().specimen, 10); return { pred: function (e) { return e.kind === 'sdh' && abs(e.path - 20) < 1.5; }, xs: h ? H.range(h.x + 10 * T60 - 2, h.x + 10 * T60 + 2, 1) : [167] }; } },
    { id: 'lamination', lvl: 0, apply() { H.enter('lamination', { keepProbe: false }); H.setInstrument({ range: 100, gain: 30 }); H.setProbe({ z: 65 }); return { pred: function (e) { return e.kind === 'lamination'; }, xs: H.range(20, 36, 4) }; } },
    { id: 'root-bead', lvl: 0, apply() { H.weld({ T: 20 }); H.setDefects([]); H.setProbe({ angle: 60, side: 1 }); H.setInstrument({ range: 100, gain: 36 }); return { pred: function (e) { return e.kind === 'geometry' && /root/.test(e.tag || '') ; }, xs: H.range(30, 44, 1) }; } },
    { id: 'cap', lvl: 0, apply() { H.weld({ T: 20 }); H.setDefects([]); H.setProbe({ angle: 60, side: 1 }); H.setInstrument({ range: 100, gain: 40 }); return { pred: function (e) { return e.kind === 'geometry' && /cap|toe/.test(e.tag || ''); }, xs: H.range(66, 90, 1) }; } },
    { id: 'root-crack', lvl: 0, apply() { H.weld({ T: 20, rootHeight: 0, capHeight: 0 }); H.setDefects([]); H.addPreset('rootCrack'); H.setProbe({ angle: 60, side: 1 }); H.setInstrument({ range: 100, gain: 30 }); return { pred: function (e) { return e.kind === 'corner'; }, xs: H.range(30, 40, 1) }; } },
    { id: 'lof-30', lvl: 1, apply() { H.weld({ T: 20 }); H.setDefects([]); H.addPreset('lof'); H.setProbe({ angle: 45, side: 1 }); H.setInstrument({ range: 100, gain: 36 }); return { pred: function (e) { return e.kind === 'defect' || e.kind === 'modeconv'; }, xs: H.range(30, 60, 1) }; } },
    { id: 'cap-toe-70', lvl: 2, apply() { H.weld({ T: 20 }); H.setDefects([]); H.setProbe({ angle: 70, side: 1 }); H.setInstrument({ range: 100, gain: 40 }); return { pred: function (e) { return e.kind === 'surface'; }, xs: H.range(36, 44, 2) }; } },
    { id: 'backing-edge', lvl: 2, apply() { H.weld({ T: 20, prep: 'single-v-backing', backing: true }); H.setDefects([]); H.setProbe({ angle: 60, side: 1 }); H.setInstrument({ range: 100, gain: 40 }); return { pred: function (e) { return e.kind === 'geometry' && /back/.test(e.tag || ''); }, xs: H.range(40, 70, 1) }; } },
  ];
  function scenPool(diff) { const lvl = diff === 'advanced' ? 2 : diff === 'intermediate' ? 1 : 0; return SCEN.filter(function (s) { return s.lvl <= lvl; }); }
  /** Build one quiz item deterministically from Q.rng; returns the item or null when no scenario yields a gated echo. */
  function buildItem(pool) {
    const start = Math.floor(Q.rng() * pool.length);
    const draws = [Q.rng(), Q.rng(), Q.rng(), Q.rng()];
    for (let k = 0; k < pool.length; k++) {
      const sc = pool[(start + k) % pool.length];
      let target = null;
      try { target = sc.apply(); } catch (e) { target = null; }
      if (!target) continue;
      const best = H.maximise(target.pred, target.xs);
      if (!best) continue;
      gateOn(best.echo.path);
      H.auto(80);
      const R = UT.frame.readouts && UT.frame.readouts.primary;
      const cat = describeCategory(R);
      if (!cat || LABEL_IDS.indexOf(cat) < 0 || !R || abs(R.path - best.echo.path) > 1) continue;
      const others = LABEL_IDS.filter(function (id) { return id !== cat; });
      for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(draws[i % 3] * (i + 1)) % (i + 1); const tmp = others[i]; others[i] = others[j]; others[j] = tmp; }
      const options = others.slice(0, 3); options.splice(Math.floor(draws[3] * 4), 0, cat);
      return { scenarioId: sc.id, correctId: cat, options, askedAt: Date.now(), phase: 'what', answered: null, actionAnswered: null, correctAction: actionFor(cat), path: +R.path.toFixed(1) };
    }
    return null;
  }
  function quizWrite(patch) { UT.setIn('quiz', patch, { noRender: true }); Q.dirty = true; }
  function nextItem() {
    const q = st().quiz;
    if (q.i >= q.n) { finishQuiz(); return null; }
    Q.saved = { beam: st().display.beam, hide: st().display.hide };
    const item = buildItem(scenPool(q.difficulty));
    if (!item) { finishQuiz(); return null; }
    UT.setIn('display', { hide: true, beam: false }, { noRender: true });
    quizWrite({ item });
    UT.renderNow();
    quizRefresh();
    return item;
  }
  function finishQuiz() {
    const q = st().quiz;
    const score = q.n ? Math.round(100 * q.correct / q.n) : 0;
    const prog = Object.assign({}, ls().progress || {});
    const prev = prog.quiz || { best: 0, attempts: 0 };
    prog.quiz = { best: Math.max(prev.best || 0, score), attempts: (prev.attempts || 0) + 1, last: score, meanTimeSec: q.times.length ? +(q.times.reduce(function (a, b) { return a + b; }, 0) / q.times.length).toFixed(1) : 0 };
    writeL({ progress: prog });
    quizWrite({ active: false, item: null });
    if (Q.saved) UT.setIn('display', { beam: Q.saved.beam, hide: false }, { noRender: true });
    UT.renderNow();
    quizAnnounce(t('Quiz finished: {c}/{n} correct', { c: q.correct, n: q.n }));
    quizRefresh();
  }
  function quizAnnounce(text) { Q.feedback = text; if (Q.ui.live) Q.ui.live.textContent = text; }
  const quiz = {
    /** Start a quiz: {n:10, seed, difficulty:'basic'|'intermediate'|'advanced'}. Same seed → same items. */
    start(o) {
      o = o || {};
      const n = M.clamp(Math.round(+o.n || 10), 1, 50);
      const seed = o.seed === undefined || o.seed === null ? (Date.now() & 0xffff) : (+o.seed >>> 0);
      Q.rng = M.rng(seed); Q.seed = seed;
      if (ls().active !== null && ls().active !== undefined) api.stop();
      quizWrite({ active: true, i: 0, n, seed, difficulty: ['basic', 'intermediate', 'advanced'].indexOf(o.difficulty) >= 0 ? o.difficulty : 'basic', correct: 0, wrong: 0, times: [], item: null });
      quizAnnounce('');
      return nextItem();
    },
    /** Answer the echo question with a label id. Returns {correct, correctId}. */
    answer(id) {
      const q = st().quiz, item = q.item;
      if (!q.active || !item || item.phase !== 'what') return null;
      const correct = id === item.correctId;
      const dt = +((Date.now() - item.askedAt) / 1000).toFixed(2);
      quizWrite({ times: q.times.concat([dt]), item: Object.assign({}, item, { phase: 'action', answered: id, whatCorrect: correct }) });
      if (Q.saved) UT.setIn('display', { beam: Q.saved.beam, hide: false }, { noRender: true });
      const lab = LABELS[item.correctId];
      quizAnnounce((correct ? t('Correct') : t('Wrong')) + ' — ' + (ko() ? lab.ko + ': ' + lab.dko : lab.en + ': ' + lab.den));
      UT.status({ right: (ko() ? lab.ko : lab.en) + ' — ' + (ko() ? lab.dko : lab.den) });
      UT.renderNow();
      quizRefresh();
      return { correct, correctId: item.correctId };
    },
    /** Answer the action question ('record' | 'geometry-note' | 'ignore'); advances to the next item. */
    answerAction(id) {
      const q = st().quiz, item = q.item;
      if (!q.active || !item || item.phase !== 'action') return null;
      const ok = id === item.correctAction;
      const both = ok && item.whatCorrect;
      quizWrite({ correct: q.correct + (both ? 1 : 0), wrong: q.wrong + (both ? 0 : 1), i: q.i + 1, item: Object.assign({}, item, { phase: 'done', actionAnswered: id }) });
      quizAnnounce(ok ? t('Correct action') : t('Wrong action — {a}', { a: (ACTIONS.find(function (a) { return a.id === item.correctAction; }) || {})[ko() ? 'ko' : 'en'] }));
      nextItem();
      return { correct: ok, correctAction: item.correctAction };
    },
    /** Skip the current item (counts as wrong). */
    skip() { const q = st().quiz; if (!q.active) return null; quizWrite({ wrong: q.wrong + 1, i: q.i + 1 }); if (Q.saved) UT.setIn('display', { beam: Q.saved.beam, hide: false }, { noRender: true }); return nextItem(); },
    /** {active, i, n, correct, wrong, times[], seed, difficulty, item} */
    state() { const q = st().quiz; return { active: q.active, i: q.i, n: q.n, correct: q.correct, wrong: q.wrong, times: q.times.slice(), seed: q.seed, difficulty: q.difficulty, item: q.item ? UT.clone(q.item) : null }; },
    labels: LABELS, actions: ACTIONS, categoryOf, describeCategory, scenarios: SCEN.map(function (s) { return s.id; }),
  };
  function quizBuild() {
    const dom = UT.dom, q = st().quiz, item = q.item;
    const root = dom.h('div', { class: 'qz' });
    root.appendChild(dom.h('div', { class: 'qz-head' }, [
      dom.h('span', {}, t('Question {i} of {n}', { i: Math.min(q.i + 1, q.n), n: q.n })), dom.h('span', {}, t('Score {c} correct, {w} wrong', { c: q.correct, w: q.wrong })),
      dom.h('span', { class: 'qz-dim' }, t('Seed {s} · {d}', { s: q.seed === null ? '—' : q.seed, d: q.difficulty })),
    ]));
    if (!q.active) {
      const prog = (ls().progress || {}).quiz;
      root.appendChild(dom.h('div', { class: 'qz-q' }, prog ? t('Best {b} % · attempts {a}', { b: prog.best, a: prog.attempts }) : t('Identify the gated echo: geometry, defect or spurious?')));
      const nIn = dom.h('input', { type: 'number', class: 'fld-input qz-n', value: q.n || 10, min: 1, max: 50 });
      const dSel = dom.h('select', { class: 'fld-input' }, ['basic', 'intermediate', 'advanced'].map(function (d) { return dom.h('option', { value: d, selected: d === q.difficulty ? true : null }, t(d)); }));
      const sIn = dom.h('input', { type: 'number', class: 'fld-input qz-n', placeholder: t('seed'), value: q.seed === null ? '' : q.seed });
      root.appendChild(dom.h('div', { class: 'qz-row' }, [dom.h('label', { class: 'fld' }, [dom.h('span', { class: 'fld-label' }, t('Questions')), nIn]), dom.h('label', { class: 'fld' }, [dom.h('span', { class: 'fld-label' }, t('Difficulty')), dSel]), dom.h('label', { class: 'fld' }, [dom.h('span', { class: 'fld-label' }, t('Seed')), sIn])]));
      root.appendChild(dom.h('div', { class: 'qz-row' }, [dom.button(t('Start'), function () { quiz.start({ n: +nIn.value || 10, difficulty: dSel.value, seed: sIn.value === '' ? undefined : +sIn.value }); }, { class: 'btn primary' })]));
    } else if (item) {
      if (item.phase === 'what') {
        root.appendChild(dom.h('div', { class: 'qz-q', id: 'qz-q' }, ko() ? '게이트 안의 에코는 무엇입니까?' : 'What is the gated echo?'));
        root.appendChild(dom.h('div', { class: 'qz-choices', role: 'group', 'aria-labelledby': 'qz-q' }, item.options.map(function (id) { const lab = LABELS[id]; return dom.button(ko() ? lab.ko : lab.en, function () { quiz.answer(id); }, { class: 'btn qz-choice' }); })));
        root.appendChild(dom.h('div', { class: 'qz-row' }, [dom.button(t('Skip'), function () { quiz.skip(); })]));
      } else {
        root.appendChild(dom.h('div', { class: 'qz-fb ' + (item.whatCorrect ? 'ok' : 'wrong') }, Q.feedback || ''));
        root.appendChild(dom.h('div', { class: 'qz-q', id: 'qz-q' }, ko() ? '조치?' : 'Action?'));
        root.appendChild(dom.h('div', { class: 'qz-choices', role: 'group', 'aria-labelledby': 'qz-q' }, ACTIONS.map(function (a) { return dom.button(ko() ? a.ko : a.en, function () { quiz.answerAction(a.id); }, { class: 'btn qz-choice' }); })));
      }
    }
    Q.ui.live = Q.ui.live || dom.h('div', { class: 'ls2-live', 'aria-live': 'polite', role: 'status' });
    Q.ui.live.textContent = Q.feedback || '';
    root.appendChild(Q.ui.live);
    if (!q.active && Q.feedback) root.appendChild(dom.h('div', { class: 'qz-fb ok' }, Q.feedback));
    return root;
  }
  function quizRefresh() { if (Q.win && hasDoc() && Q.win.isOpen()) Q.win.setContent(quizBuild()); }
  quiz.window = {
    show() { if (!hasDoc()) return null; UT.dom.injectCss('lessons', api.css); if (!Q.win) Q.win = UT.dom.win({ name: 'quiz', title: t('Echo quiz'), x: 300, y: 120, w: 460, content: quizBuild(), onShow: function () { quizRefresh(); } }); Q.win.show(); quizRefresh(); return Q.win; },
    hide() { if (Q.win) Q.win.hide(); return Q.win; },
    toggle() { return Q.win && Q.win.isOpen() ? quiz.window.hide() : quiz.window.show(); },
    open() { return quiz.window.show(); }, close() { return quiz.window.hide(); },
    isOpen() { return !!(Q.win && Q.win.isOpen()); },
    get el() { return Q.win ? Q.win.el : null; },
  };
  quiz.show = quiz.window.show; quiz.hide = quiz.window.hide; quiz.toggle = quiz.window.toggle; quiz.open = quiz.window.show; quiz.close = quiz.window.hide;
  quiz.css = [
    '.win[data-win=quiz] .win-body{padding:6px;background:#ececec;font-size:12px}',
    '.qz{display:flex;flex-direction:column;gap:6px}.qz-head{display:flex;gap:10px;flex-wrap:wrap;font-weight:bold}.qz-dim{font-weight:normal;color:#666}',
    '.qz-q{font-size:13px;font-weight:bold}.qz-choices{display:flex;flex-wrap:wrap;gap:4px}.qz-choice{min-width:120px;text-align:left}',
    '.qz-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.qz-n{width:70px}',
    '.qz-fb{padding:4px}.qz-fb.ok{color:#1b6e1b}.qz-fb.wrong{color:#b00}',
  ].join('\n');
  api.css += '\n' + quiz.css;
  api.quiz = quiz;

  // ------------------------------------------------------------------ test API (§7) + selftest
  Object.assign(UT.test, {
    lessons() { return list.map(function (l) { return l.title; }); },
    lessonAutoRun(n) { return api.autoRun(n); },
    lessonState() { const c = api.current(); const l = ls(); return { n: c.n, step: c.step, done: c.done, answers: UT.clone(l.answers || {}), progress: UT.clone(l.progress || {}) }; },
    lessonAnswer(value) { return api.answer(value); },
    quiz: { start: quiz.start, answer: quiz.answer, answerAction: quiz.answerAction, state: quiz.state, skip: quiz.skip },
  });

  function __selftest() {
    const f = [];
    if (list.length !== 25) f.push('list ' + list.length);
    let total = 0;
    const need2 = { 5: 1, 7: 1, 12: 1, 13: 1, 20: 1, 21: 1 };
    list.forEach(function (l) {
      if (!l.title || !l.ko || !l.en || typeof l.setup !== 'function') f.push('lesson ' + l.n + ' incomplete');
      if (!Array.isArray(l.steps) || l.steps.length < 5) f.push('lesson ' + l.n + ' < 5 steps');
      total += l.steps.length;
      let q = 0;
      l.steps.forEach(function (s, i) {
        if (!s.ko || !s.en || typeof s.check !== 'function') f.push('lesson ' + l.n + ' step ' + (i + 1) + ' schema');
        if (s.mode !== 'state' && s.mode !== 'transition') f.push('lesson ' + l.n + ' step ' + (i + 1) + ' mode');
        if (s.choices) { q++; if (!s.choices.some(function (c) { return c.id === s.answer; })) f.push('lesson ' + l.n + ' step ' + (i + 1) + ' answer not in choices'); if (s.choices.length < 3) f.push('lesson ' + l.n + ' step ' + (i + 1) + ' < 3 choices'); }
        if (s.input === 'number') { q++; if (!(s.tol >= 0)) f.push('lesson ' + l.n + ' step ' + (i + 1) + ' tol'); }
        if (typeof s.doIt !== 'function') f.push('lesson ' + l.n + ' step ' + (i + 1) + ' doIt');
      });
      if (q < 1) f.push('lesson ' + l.n + ' has no choice/numeric step');
      if (need2[l.n] && q < 2) f.push('lesson ' + l.n + ' needs ≥ 2 decision steps');
    });
    if (total < 130) f.push('total steps ' + total);
    for (let n = 1; n <= 22; n++) if (setupsV1[n - 1] && !SETUP_OVERRIDES[n] && list[n - 1].setup !== setupsV1[n - 1].setup) f.push('lesson ' + n + ' setup not reused');
    if (!has('modes.lessonSetups') && !Array.isArray(has('modes.lessons'))) f.push('80-modes lessonSetups missing (guarded)');
    // quiz invariants
    if (LABEL_IDS.length !== 11) f.push('labels ' + LABEL_IDS.length);
    if (categoryOf({ kind: 'geometry', tag: 'cap' }) !== 'geometry-cap' || categoryOf({ kind: 'radius' }) !== 'backwall' || categoryOf({ kind: 'corner' }) !== 'corner') f.push('categoryOf');
    if (actionFor('corner') !== 'record' || actionFor('sdh') !== 'geometry-note') f.push('actionFor');
    if (SCEN.length !== 9) f.push('scenarios ' + SCEN.length);
    // step DSL
    const num = N('a', 'b', function () { return 10; }, 1);
    if (!num.check({ ans: 10.5, memo: {} }) || num.check({ ans: 12, memo: {} })) f.push('numeric check');
    const ch = C('a', 'b', [['x', 'x', 'x'], ['y', 'y', 'y'], ['z', 'z', 'z']], 'y');
    if (!ch.check({ ans: 'y' }) || ch.check({ ans: 'x' })) f.push('choice check');
    if (typeof UT.test.lessonAutoRun !== 'function' || typeof UT.test.quiz.start !== 'function') f.push('test api');
    if (api.current().n !== null && !UT.state.lessons.active) f.push('current idle');
    return f;
  }

  Object.assign(api, { __selftest, helpers: H, categoryOf });
  UT.lessons = api;
})(window.UT = window.UT || {});
