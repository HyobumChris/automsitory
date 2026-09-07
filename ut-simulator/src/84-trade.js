/* 84-trade.js — Trade test v2 (SPEC-v2 §4.2, T2) and random practice (§4.6, T5).
 * Seeded specimen + defect generator per difficulty, recordability filter (UT.rays.trace over the allowed
 * probes), one-to-one matching, attribute scoring, critical-miss fail, coverage tracker (module buffer filled
 * on 'render'), timer with an injectable clock, history/scoreboard, report template + print, exam flow
 * (seed-only sharing, code hash, result token) and windows 'trade', 'scoreboard', 'report', 'practice'.
 * Classic script, no DOM access at load time (SPEC §15.12).
 */
// SPEC NOTES (decisions where SPEC-v2 is silent or ambiguous)
// - UT.test.trade is created by 80-modes (late-bound start/truth/submit); this file only extends it with
//   Object.assign (configure, history, report, coverage, tick, reveal, verifyResult, addRowFromReadout, practice).
//   It is created here (with start/truth/submit) ONLY when absent (headless partial loads).
// - start(seed) always calls UT.modes.enter('trade', {keepProbe:true, silentUI:true}) and opens its own window
//   afterwards (unless headless / selftest), so a transitional 80 that still owns a legacy 'trade' window cannot
//   collide with this one. The window's onClose calls UT.modes.exit() while state.mode === 'trade' (v1 behaviour).
// - Recordability: for every allowed angle probe (procedure list → UT.probe.select, else generic 45/60/70) and both
//   sides, the generator traces x = capWidth/2 … capWidth/2 + 2·T·tanθ + 10 in 2 mm steps (fan 21, ≤ 3 legs) and
//   evaluates every defect echo at z = zc through UT.rays.zFactor (one trace per position serves all defects);
//   bestDb = 20·log10(pct34 / 80) with pct34 = UT.ascan.ampPctOf(amp, {gain: 34}) (reference: 3 mm SDH = 80 % at 34 dB).
// - Row type vocabulary: ids planar | crack | lof | root | volumetric | porosity | slag | lamination (labels 'lack of
//   fusion' / 'incomplete penetration'); aliases (ip, incompletePenetration, toeCrack, centrelineCrack, backingLof,
//   toeCrackFillet, 'lack of fusion', …) are normalised, so v1 truth rows (type 'root', 'lof', …) score full type points.
// - Length points use the truth length as the reference for the 20 % / 40 % tolerances. Rows without a finite z are
//   ignored; rows without length/depth/height are kept (length 0, depth/height NaN → 0 / full height points).
// - Score = mean over scoring truth defects (recordable and not revealed with 'Reveal one') − 15·falseCalls
//   − 5·hintsUsed (practice only), rounded, clamped 0…100. Without any scoring defect the mean is 100.
// - Critical miss: difficulty ≠ basic, an undetected scoring defect of sub-type crack / lof / root with height ≥ 3.
// - state.trade.coverage (written on submit) stores `map` as a plain Array (state must stay JSON-cloneable);
//   coverage() / coverageMap() return Uint8Arrays from the module buffer. Coverage bins overlap [z − 5, z + 5] so a
//   sync sweep with ≤ 10 mm steps covers every 5 mm bin; the probe must face the weld (side · x > 0).
// - Procedure compliance (0…10): DAC recorded (≥ 2 points, +4), reference gain stored (dac.refDb set or refGain ≠ the
//   default 30, +2), coverage ≥ 80 % on both sides (+4). Diagnostic only.
// - Result token codeHash: exam → exam.codeHash; plain tests → fnv1a(':' + seed) (empty code). verifyResult(token, code?)
//   checks ONE hash: the given code's, else the loaded exam's codeHash (same seed), else the empty-code hash — a token
//   signed with another code (or without the exam code) is {ok:false}.
// - makeExam({seed, code, difficulty, timeLimitMin, procedureId, revealOnSubmit, title, nameRequired}) and
//   loadExam(exam) are provided for 94-scenario (URL → exam → start(seed)). loadExam of a nameRequired exam without a
//   candidate name (setCandidate) enters mode 'trade' and opens the window WITHOUT starting (the Start button gates
//   the timer; returns null). start(seed) with a seed different from a loaded exam drops the exam.
// - Seeded draws: start(seed) feeds the generator with M.rng(mix32(M.fnv1a('trade:' + seed))) (lowbias32 finaliser —
//   the plain LCG's first draws are almost linear in a small seed); drawSpecimen() builds weldOpts from UT.defaultState() (L 300, every field
//   fixed) so the exam URL (seed only) regenerates the same truth on every machine. A configured procedure with a
//   `specimen` (45) fixes plate/pipe, T/OD/WT of the draw (the rng is consumed in the same order).
// - The pre-exam {weldOpts, material} are snapshotted before the first seeded draw and restored (specimen rebuilt
//   via UT.modes.enter(mode, {keepProbe, keepDefects, silentUI})) when mode 'trade' is left (v1: trade keeps the weld
//   specimen, SPEC §15.8).
// - submit() sets trade.active = false once the truth is revealed (so 90 can persist the history entry before the
//   window closes; a locked exam stays active until reveal(code) so the hidden truth defects never reach localStorage);
//   while the exam is locked, result.misses / result.detail[].truth carry only {n} (re-hydrated on reveal).
// - 'Reveal one' cannot draw a single hidden defect (display.hide is global): it prints the truth row, pre-fills a
//   report row and marks the defect non-scoring in trade.revealedOne.
// - configure({difficulty, timeLimitMin}) during a RUNNING test (trade.active && score === null, practice and a
//   pending exam included) is deferred to the next start() (cfg.next, exposed by config().next) — a running test,
//   above all a locked exam whose descriptor fixes difficulty and time, is never reconfigured; remainingSec()/submit()/
//   report() read the exam descriptor (diffOf/timeLimitOf) and the windows disable the difficulty select / time
//   input while a test runs or an exam is loaded. loadExam() applies the exam's values directly (it replaces any test).
// - Advanced difficulty forces display.beam = false while the test is unrevealed (re-applied on every 'state' event).
// - HTML report strings are escaped with a local esc(); report() never reads the truth while the exam is locked.
// - Practice runs in mode 'trade' (trade.active = true, trade.practice = true) without a timer; the practice window
//   opens the trade window for the report rows.
// - QA3 #1: submit() of a locked exam that already holds a result returns the STORED score (§4.2.3: one submission
//   per attempt — re-scoring while the exam stays active/locked was a z-sweep score oracle); the trade window greys
//   Submit / Row+ / Take from readout meanwhile.
// - QA3 #2: a 'state' event that writes weldOpts/material from OUTSIDE this module (a lesson baseline, a scenario,
//   the Weld dialog, applyProcedure) drops the preTrade snapshot, so the mode-exit restore can never clobber a
//   specimen another module just built (§4.1: lessons must pass regardless of what a trade test left behind).
// - QA3 #3: basic and intermediate draws replace every non-recordable non-tiny defect from the SAME rng (bounded
//   retries, later passes avoid the toe-crack geometry) until recordability() accepts it — the difficulty table
//   promises findable defects there; advanced keeps its sub-recordable tiny porosity/slag by design (V2-15d).
// - QA3 #4/#5/#6: timer announcements skip thresholds ≥ the configured limit; the report's reference level and
//   calibration block follow the applied procedure/rule (refReflector/refBlock, fallback '3 mm SDH'/'none
//   recorded'); a practice hint with nothing left to reveal costs nothing.
(function (UT) {
  'use strict';
  const M = UT.math;
  const S = UT.specimens;
  const dom = UT.dom;
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  function st() { return UT.state; }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }

  // ------------------------------------------------------------------ constants
  const PASS_MARK = 70;
  const FALSE_CALL_PENALTY = 15;
  const HINT_PENALTY = 5;
  const HISTORY_CAP = 30;
  const Z_BIN = 5;
  const RECORD_LIMIT_DB = -14;
  const REF_GAIN = 34;
  const DIFF = {
    basic: { count: [3, 3], minH: 4, len: [25, 45], time: 60, preps: ['single-v'], materials: ['carbon'], plate: [20, 20], pipe: false, D: 55, H: 0 },
    intermediate: { count: [4, 6], minH: 2, len: [15, 45], time: 60, preps: ['single-v', 'double-v'], materials: ['carbon'], plate: [12, 30], pipe: true, D: 45, H: 10 },
    advanced: { count: [5, 8], minH: 2, len: [15, 45], time: 30, preps: ['single-v', 'double-v', 'single-bevel'], materials: ['carbon', 'austenitic'], plate: [12, 30], pipe: true, D: 40, H: 15, tiny: true, traps: true },
  };
  const DIFF_KEYS = ['basic', 'intermediate', 'advanced'];
  const TYPE_OPTIONS = [
    { id: 'planar', label: 'planar', preset: null }, { id: 'crack', label: 'crack', preset: 'rootCrack' },
    { id: 'lof', label: 'lack of fusion', preset: 'lof' }, { id: 'root', label: 'incomplete penetration', preset: 'incompletePenetration' },
    { id: 'volumetric', label: 'volumetric', preset: null }, { id: 'porosity', label: 'porosity', preset: 'porosity' },
    { id: 'slag', label: 'slag', preset: 'slag' }, { id: 'lamination', label: 'lamination', preset: 'lamination' },
  ];
  const TYPE_ALIAS = {
    planar: 'planar', crack: 'crack', toecrack: 'crack', centrelinecrack: 'crack', toecrackfillet: 'crack', rootcrack: 'crack',
    lof: 'lof', 'lack of fusion': 'lof', 'lack of side-wall fusion': 'lof', backinglof: 'lof', sidewall: 'lof', fusion: 'lof',
    root: 'root', ip: 'root', 'incomplete penetration': 'root', incompletepenetration: 'root', penetration: 'root',
    volumetric: 'volumetric', porosity: 'porosity', pore: 'porosity', slag: 'slag', inclusion: 'slag', 'slag inclusion': 'slag',
    lamination: 'lamination',
  };
  const CAT = { planar: 'planar', crack: 'planar', lof: 'planar', root: 'planar', volumetric: 'volumetric', porosity: 'volumetric', slag: 'volumetric', lamination: 'lamination' };
  const CRITICAL_SUBS = { crack: 1, lof: 1, root: 1 };
  const DEFAULT_PROBES = ['gen-45-5-10', 'gen-60-5-10', 'gen-70-5-10'];
  const DISPOSITIONS = ['', 'accept', 'reject', 'record', 'not-recordable'];

  // ------------------------------------------------------------------ module buffers
  const cfg = { specimen: 'auto', procedureId: null, probes: null, next: null /* {difficulty?, timeLimitMin?} deferred while a test runs (§4.2: NEXT start) */ };
  const reportMeta = { couplant: 'gel', surface: 'as welded', remarks: '' };
  let quiet = false;               // selftest: never open windows
  let vOffset = 0;                 // virtual clock offset (ms) advanced by tick()
  let timer = null;
  let announced = {};
  let cov = null;                  // coverage buffer (§4.2.1)
  let usedProbes = {};             // probes seen during the test (report)
  let lastCovKey = '';
  let preTrade = null;             // {weldOpts, material} before the first seeded draw; restored when mode 'trade' is left
  let selfSet = false;             // true while THIS module writes weldOpts/material (QA3 #2: external writes drop preTrade)
  const ui = {};                   // live DOM refs of the trade window
  const pui = {};                  // practice window refs
  const sui = {};                  // scoreboard refs

  // ------------------------------------------------------------------ small helpers
  function num(v) { const x = typeof v === 'string' ? (v.trim() === '' ? NaN : +v) : +v; return Number.isFinite(x) ? x : NaN; }
  function r1(v) { return Math.round(v * 10) / 10; }
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock(sec) { const s = Math.max(0, Math.floor(sec)); const mm = Math.floor(s / 60), ss = s % 60; return (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss; }
  function tx(tag, key, params, attrs) { return dom.h(tag, Object.assign({ dataset: { i18n: key } }, attrs || {}), t(key, params)); }
  function btn(key, fn, attrs) { return dom.button(t(key), fn, Object.assign({ dataset: { i18n: key } }, attrs || {})); }
  function normType(v) {
    if (typeof v !== 'string') return '';
    const k = v.trim().toLowerCase();
    if (!k) return '';
    if (TYPE_ALIAS[k]) return TYPE_ALIAS[k];
    const compact = k.replace(/[\s_-]/g, '');
    return TYPE_ALIAS[compact] || '';
  }
  function typeLabel(id) {
    const o = TYPE_OPTIONS.find(function (q) { return q.id === id; });
    if (!o) return id;
    if (UT.i18n && UT.i18n.lang === 'ko' && o.preset && S && S.defectPresetNames) {
      const p = S.defectPresetNames.find(function (q) { return q.key === o.preset; });
      const m = p && /\(([^)]+)\)/.exec(p.label);
      if (m) return m[1];
    }
    return t(o.label);
  }
  /** 'A' | 'B' | 'CL' for a truth/report side (+1 | −1 | 0). */
  function sideLabel(side) { return side === -1 ? 'B' : (side === 1 ? 'A' : 'CL'); }
  /** Hint side (§4.6): the side of a centreline defect is the side it is best detected from, e.g. 'B (CL)'. */
  function hintSide(q) { return q.side === -1 || q.side === 1 ? sideLabel(q.side) : (q.bestSide === -1 || q.bestSide === 1 ? sideLabel(q.bestSide) + ' (CL)' : 'CL'); }
  function circDist(a, b, L, pipe) { let d = Math.abs(a - b); if (pipe && L > 0) { d = d % L; d = Math.min(d, L - d); } return d; }
  function overlapLen(a0, a1, b0, b1, L, pipe) {
    if (!pipe || !(L > 0)) return M.overlap(a0, a1, b0, b1);
    let best = 0;
    for (const k of [-1, 0, 1]) best = Math.max(best, M.overlap(a0 + k * L, a1 + k * L, b0, b1));
    return best;
  }

  // ------------------------------------------------------------------ base64url / token
  // The UTF-8 / base64url codec lives in 00-core (UT.core.b64url / b64urlDecode, shared with 94-scenario).
  function b64urlEncode(str) { return UT.core.b64url(str); }
  function b64urlDecode(s) { return UT.core.b64urlDecode(s); }
  function codeHashOf(code, seed) { return M.fnv1a(String(code || '') + ':' + String(seed >>> 0)).toString(16); }
  /** 32-bit finaliser (lowbias32): decorrelates the generator state of neighbouring classroom seeds. */
  function mix32(x) {
    x = (x ^ 0x9e3779b9) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
    x ^= x >>> 15; x = Math.imul(x, 0x846ca68b) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }
  /** Seeded generator of a trade test: M.rng over a mixed seed (the plain LCG's first draws are ~linear in the seed). */
  function tradeRng(seed) { return M.rng(mix32(M.fnv1a('trade:' + (seed >>> 0)))); }
  function payloadOf(o) { return { seed: o.seed, difficulty: o.difficulty, score: o.score, fail: !!o.fail, timeUsedSec: o.timeUsedSec, date: o.date, name: o.name || '' }; }
  function signPayload(payload, codeHash) { return M.fnv1a(JSON.stringify(payload) + ':' + codeHash).toString(16); }
  function tokenFor(res, codeHash) {
    const payload = payloadOf(res);
    const sig = signPayload(payload, codeHash);
    return 'rt:' + b64urlEncode(JSON.stringify(Object.assign({}, payload, { sig })));
  }
  /**
   * Verify a result token 'rt:…' (optionally with the exam code) → {ok, score, name, seed, fail, difficulty, date, timeUsedSec} | {ok:false}.
   * @param {string} token
   * @param {string} [code]
   */
  function verifyResult(token, code) {
    try {
      if (typeof token !== 'string' || token.trim().indexOf('rt:') !== 0) return { ok: false };
      const obj = JSON.parse(b64urlDecode(token.trim().slice(3)));
      if (!obj || typeof obj !== 'object' || typeof obj.sig !== 'string') return { ok: false };
      const payload = payloadOf(obj);
      const seed = obj.seed >>> 0;
      // §4.2.3: exactly one codeHash is acceptable — the instructor's code, else the loaded exam's hash (same seed),
      // else the empty code of a plain (non-exam) test. Never fall back to the empty-code hash for an exam.
      let hash;
      if (typeof code === 'string' && code.length) hash = codeHashOf(code, seed);
      else {
        const ex = st().trade && st().trade.exam;
        hash = ex && ex.codeHash && (ex.seed >>> 0) === seed ? ex.codeHash : codeHashOf('', seed);
      }
      if (signPayload(payload, hash) !== obj.sig) return { ok: false };
      return { ok: true, score: obj.score, name: obj.name || '', seed: obj.seed, fail: !!obj.fail, difficulty: obj.difficulty, date: obj.date, timeUsedSec: obj.timeUsedSec };
    } catch (e) { return { ok: false }; }
  }

  // ------------------------------------------------------------------ generator (§4.2 difficulty table)
  /**
   * Draw the specimen options of a difficulty from a seeded rng. Every weldOpts field is fixed by the draw or by
   * UT.defaultState() (L 300) — never by the current weldOpts (`cur` is accepted for API compatibility only), so the
   * same seed yields the same specimen on every machine. `fixed` = a procedure's specimen {pipe, od, wt, T}: it
   * overrides plate/pipe and T/OD/WT after the draw (the rng is consumed in the same order either way).
   * @returns {{weldOpts: object, material: string, trapKind: string|null}}
   */
  function drawSpecimen(rng, difficulty, cur, fixed) {
    const D = DIFF[difficulty] || DIFF.intermediate;
    const w = Object.assign({}, UT.defaultState ? UT.defaultState().weldOpts : (cur || {}));
    const pipe = D.pipe && rng() < 0.4;
    const T = D.plate[0] === D.plate[1] ? D.plate[0] : Math.round(D.plate[0] + rng() * (D.plate[1] - D.plate[0]));
    const od = rng() < 0.5 ? 168.3 : 219.1;
    const prep = D.preps[Math.floor(rng() * D.preps.length)] || 'single-v';
    const material = D.materials[Math.floor(rng() * D.materials.length)] || 'carbon';
    const transferLossDb = D.traps ? Math.round(rng() * 6) : 0;
    const trapKind = D.traps ? (rng() < 0.5 ? 'root' : 'cap') : null;
    w.T = T; w.pipe = pipe; w.od = od; w.wt = T;
    w.prep = prep; w.type = prep === 'double-v' ? 'double-v' : (prep === 'none' ? 'none' : 'single-v');
    w.bevel = prep === 'single-bevel' ? 45 : 30;
    w.rootGap = 2; w.rootFace = 2; w.backing = false; w.weldMaterial = 'same';
    w.capWidth = trapKind === 'cap' ? 20 : 16; w.capHeight = trapKind === 'cap' ? 3.5 : 2; w.rootHeight = trapKind === 'root' ? 3 : 1.5;
    w.transferLossDb = transferLossDb;
    w.L = 300;
    if (fixed && typeof fixed === 'object') {
      if (fixed.pipe) {
        w.pipe = true;
        if (Number.isFinite(fixed.od) && fixed.od > 0) w.od = fixed.od;
        const wt = Number.isFinite(fixed.wt) ? fixed.wt : fixed.T;
        if (Number.isFinite(wt) && wt > 0) { w.wt = wt; w.T = wt; }
      } else {
        w.pipe = false;
        if (Number.isFinite(fixed.T) && fixed.T > 0) { w.T = fixed.T; w.wt = fixed.T; }
      }
    }
    return { weldOpts: w, material, trapKind };
  }
  function slagDefect(spec, o) {
    const cx = o.x, cy = o.y, w = o.w, h = o.h;
    const pts = [{ x: cx - w / 2, y: cy - h / 2 }, { x: cx + w / 2, y: cy - h / 2 }, { x: cx + w / 2 + 0.5, y: cy + h / 2 }, { x: cx - w / 2 - 0.5, y: cy + h / 2 }, { x: cx - w / 2, y: cy - h / 2 }]
      .map(function (p) { return { x: r1(p.x), y: r1(p.y) }; });
    return S.makeDefect({ n: o.n, type: 'slag', label: 'Slag inclusion', pts, height: h, zFrom: o.zFrom, length: o.length, reflectivity: 0.8 });
  }
  /**
   * Draw ONE defect for slot i of a plan entry p = {key, trap?, tiny?, boost?} — extracted from drawDefects so a
   * non-recordable draw can be replaced from the same rng (QA3 #3, ensureRecordable). rng consumption is identical
   * to the original inline body when p.boost is absent; p.boost (mm) only raises a crack height on forced redraws.
   */
  function makeOne(rng, spec, difficulty, p, i, slotLen) {
    const D = DIFF[difficulty] || DIFF.intermediate;
    const T = spec.T, L = spec.L;
    const key = p.key;
    const length = Math.round(D.len[0] + rng() * (D.len[1] - D.len[0]));
    const zFrom = Math.round(M.clamp(i * slotLen + 3 + rng() * Math.max(1, slotLen - length - 6), 0, Math.max(0, L - length)));
    const o = { n: i + 1, zFrom, length, label: 'Defect ' + (i + 1) };
    let d = null;
    if (key === 'rootCrack') { o.height = r1((p.boost || 0) + D.minH + rng() * (difficulty === 'basic' ? 2 : 3)); }
    else if (key === 'centrelineCrack') { o.height = r1((p.boost || 0) + D.minH + rng() * 4); }
    else if (key === 'toeCrack') { o.side = rng() < 0.5 ? -1 : 1; o.height = r1(D.minH + rng() * 2); }
    else if (key === 'lof') {
      o.side = rng() < 0.5 ? -1 : 1;
      if (!p.trap) {
        const full = S.defectPresets.lof(spec, { side: o.side, t0: 0.001, t1: 0.999 });
        const faceH = Math.max(1, S.bbox(full.pts).h);
        const span = M.clamp((D.minH + 0.5) / faceH, 0.25, 0.7);
        o.t0 = r1(0.15 + rng() * Math.max(0.01, 0.85 - span - 0.15)); o.t1 = r1(Math.min(0.99, o.t0 + span));
      } else o.label = 'Lack of side-wall fusion (inclined)';
    } else if (key === 'porosity') {
      o.dia = p.tiny ? r1(1 + rng()) : r1(Math.max(D.minH, 2) + rng() * (difficulty === 'basic' ? 2 : 3));
      o.x = Math.round((rng() - 0.5) * 6); o.y = r1(T * (0.3 + rng() * 0.4));
    } else if (key === 'slag') {
      const h = p.tiny ? r1(1 + rng()) : r1(D.minH + rng() * 2);
      const w = p.tiny ? r1(2 + rng()) : r1(4 + rng() * 4);
      d = slagDefect(spec, { n: o.n, x: Math.round((rng() - 0.5) * 6), y: r1(T * (0.3 + rng() * 0.4)), w, h, zFrom, length });
    }
    if (!d) d = S.defectPresets[key](spec, o);
    d.n = i + 1; d.label = p.trap ? 'Defect ' + (i + 1) + ' (inclined LOF)' : 'Defect ' + (i + 1); d.id = 1000 + i;
    d.zFrom = zFrom; d.zTo = zFrom + length;
    return d;
  }
  /** Truth row of a drawn defect (plan entry p carries the tiny/trap flags). */
  function truthRow(d, p) {
    const b = S.bbox(d.pts);
    const side = b.cx > 0.5 ? 1 : (b.cx < -0.5 ? -1 : 0);
    return { n: d.n, zFrom: r1(d.zFrom), zTo: r1(d.zTo), length: r1(d.zTo - d.zFrom), depth: r1(b.yMin), yMin: r1(b.yMin), yMax: r1(b.yMax),
      height: r1(d.height), type: d.type, x: r1(b.cx), side, recordable: true, bestDb: null, tiny: !!(p && p.tiny), trap: !!(p && p.trap) };
  }
  /**
   * Draw the hidden defects for a difficulty from a seeded rng (pure apart from the rng).
   * @returns {{defects: object[], truth: object[]}}
   */
  function drawDefects(rng, spec, difficulty) {
    const D = DIFF[difficulty] || DIFF.intermediate;
    const L = spec.L;
    const count = D.count[0] + Math.floor(rng() * (D.count[1] - D.count[0] + 1));
    const pool = difficulty === 'basic' ? ['rootCrack', 'centrelineCrack', 'lof', 'porosity', 'toeCrack'] : ['rootCrack', 'centrelineCrack', 'lof', 'porosity', 'toeCrack', 'slag', 'incompletePenetration'];
    const nTiny = D.tiny ? 1 + Math.floor(rng() * 2) : 0;
    const plan = [];
    for (let i = 0; i < count; i++) {
      if (D.traps && i === 1) { plan.push({ key: 'lof', trap: true }); continue; }
      if (nTiny && i >= count - nTiny) { plan.push({ key: rng() < 0.5 ? 'porosity' : 'slag', tiny: true }); continue; }
      plan.push({ key: pool[Math.floor(rng() * pool.length)] });
    }
    const slotLen = L / count;
    const defects = plan.map(function (p, i) { return makeOne(rng, spec, difficulty, p, i, slotLen); });
    const truth = defects.map(function (d, i) { return truthRow(d, plan[i]); });
    return { defects, truth };
  }
  /**
   * §4.2 difficulty table (QA3 #3): basic promises 3 findable defects (planar height ≥ 4 mm) and intermediate
   * defects sized ≥ 2 mm — the recordability filter is meant for advanced's tiny porosity/slag, not for half of the
   * basic tests. Replace every non-recordable non-tiny draw (in practice toe cracks whose best traced echo stays
   * below −14 dB) from the SAME rng, so the truth stays deterministic per seed: two passes redraw from the pool
   * without the toe-crack geometry, later passes force a well-detected centreline crack (+2 mm height). Advanced is
   * left alone (sub-recordable tiny defects are by design — V2-15d relies on them).
   */
  function ensureRecordable(rng, spec, difficulty, g) {
    if (difficulty !== 'basic' && difficulty !== 'intermediate') return;
    if (!(has('rays.trace') && has('ascan.ampPctOf') && has('probe.derive'))) return;
    const pool = difficulty === 'basic' ? ['rootCrack', 'centrelineCrack', 'lof', 'porosity']
      : ['rootCrack', 'centrelineCrack', 'lof', 'porosity', 'slag', 'incompletePenetration'];
    const slotLen = spec.L / Math.max(1, g.defects.length);
    for (let retry = 0; retry < 4; retry++) {
      const bad = [];
      g.truth.forEach(function (q, i) { if (q.recordable === false && !q.tiny) bad.push(i); });
      if (!bad.length) return;
      bad.forEach(function (i) {
        const p = retry < 2 ? { key: pool[Math.floor(rng() * pool.length)] } : { key: 'centrelineCrack', boost: 2 };
        const d = makeOne(rng, spec, difficulty, p, i, slotLen);
        g.defects[i] = d;
        g.truth[i] = truthRow(d, p);
      });
      recordability(g.truth, g.defects, spec);
    }
  }

  // ------------------------------------------------------------------ recordability filter
  /** Probe patches (UT.probe.select) of the allowed angle probes: cfg.probes → procedure list → generic 45/60/70. */
  function allowedProbePatches() {
    let ids = Array.isArray(cfg.probes) && cfg.probes.length ? cfg.probes : null;
    if (!ids && has('standards.allowedProbes')) { try { const a = UT.standards.allowedProbes(st()); if (Array.isArray(a) && a.length) ids = a; } catch (e) { ids = null; } }
    if (!ids) ids = DEFAULT_PROBES;
    const out = [];
    for (const id of ids) {
      const p = UT.probe && UT.probe.select ? UT.probe.select(id) : null;
      if (!p || !(p.angle > 0)) continue;
      const lib = UT.probe.libEntry ? UT.probe.libEntry(id) : null;
      if (lib && (lib.family === 'pa' || lib.family === 'tofd')) continue;
      out.push(p);
    }
    if (!out.length) for (const id of DEFAULT_PROBES) { const p = UT.probe.select(id); if (p) out.push(p); }
    return out;
  }
  /** Fill truth[i].bestDb / recordable by tracing the allowed probes over the half- to full-skip band (both sides). */
  function recordability(truth, defects, spec) {
    const canTrace = has('rays.trace') && has('ascan.ampPctOf') && has('probe.derive');
    if (!canTrace || !spec) { truth.forEach(function (q) { q.bestDb = 0; q.recordable = true; }); return truth; }
    const best = {};
    truth.forEach(function (q, i) { best[defects[i].id] = { db: -60, i }; });
    const capW = (spec.weld && spec.weld.capWidth) || 16;
    const T = spec.T;
    const inst = { gain: REF_GAIN, damping: false, tcg: { on: false }, pulser: { energy: 200, damping: 150, prf: 60 }, receiver: { filter: 'broadband' }, dac: { points: [], on: false, refDb: null } };
    const display = { beam: true, skips: 3, colourCode: 'none', singleLine: false, focus: false, hide: false, convRays: false };
    const base = Object.assign({}, st().probe, { method: 'pe', skew: 0, surface: 'chord', focus: { on: false, F: 30 }, z: spec.L / 2 });
    const zc = truth.map(function (q) { return (q.zFrom + q.zTo) / 2; });
    for (const patch of allowedProbePatches()) {
      const theta = M.deg2rad(patch.angle);
      const xMax = capW / 2 + 2 * T * Math.tan(theta) + 10;
      const maxPath = 2 * T / Math.cos(theta) + 30;
      for (const side of [1, -1]) {
        for (let d = capW / 2; d <= xMax + 1e-9; d += 2) {
          const probe = Object.assign({}, base, patch, { side, x: side * d });
          const derived = UT.probe.derive(probe, spec);
          let res = null;
          try { res = UT.rays.trace({ specimen: spec, probe, derived, display, defects, opts: { maxPath, fanCount: 21, maxLegs: 3, physics: { modeConv: false, surfaceWave: false, sideLobes: false, fanRays: 21 } } }); } catch (e) { res = null; }
          if (!res || !res.echoes) continue;
          for (const e of res.echoes) {
            if (e.defectId === undefined || !best[e.defectId]) continue;
            const b = best[e.defectId];
            let amp = e.amp;
            if (has('rays.zFactor') && Number.isFinite(e.ampNoZ)) { try { amp = e.ampNoZ * UT.rays.zFactor(e, zc[b.i], 0, defects, spec); } catch (err) { amp = e.amp; } }
            if (!(amp > 0)) continue;
            const pct = UT.ascan.ampPctOf(amp, inst, derived, e.path);
            const db = 20 * Math.log10(Math.max(1e-6, pct) / 80);
            if (db > b.db) { b.db = db; b.angle = patch.angle; b.side = side; b.x = side * d; }
          }
        }
      }
    }
    truth.forEach(function (q, i) {
      const b = best[defects[i].id];
      q.bestDb = r1(b.db); q.recordable = b.db >= RECORD_LIMIT_DB;
      if (b.angle) { q.bestAngle = b.angle; q.bestSide = b.side; q.bestX = r1(b.x); }
    });
    return truth;
  }

  // ------------------------------------------------------------------ matching + scoring (pure)
  function normRow(r, i) {
    let z = num(r.z), len = num(r.length);
    // truth-shaped rows ({zFrom, zTo}) are accepted as a fallback so 'submit the truth rows' works literally (V1 #13 / V2-15)
    if (!Number.isFinite(z) && Number.isFinite(num(r.zFrom))) { z = num(r.zFrom); if (!Number.isFinite(len) && Number.isFinite(num(r.zTo))) len = num(r.zTo) - z; }
    if (!Number.isFinite(len)) len = 0;
    if (len < 0) { z += len; len = -len; }
    return { n: Number.isFinite(num(r.n)) ? num(r.n) : i + 1, z, length: len, depth: num(r.depth), height: num(r.height),
      type: typeof r.type === 'string' ? r.type : '', ampDb: num(r.ampDb), angle: num(r.angle), side: num(r.side),
      disposition: typeof r.disposition === 'string' ? r.disposition : '', tAddedSec: num(r.tAddedSec) };
  }
  function detects(row, tr, L, pipe) {
    const rowLen = Math.max(0, row.length), truthLen = Math.max(0.1, tr.zTo - tr.zFrom);
    const ov = overlapLen(row.z, row.z + rowLen, tr.zFrom, tr.zTo, L, pipe) / Math.max(truthLen, rowLen, 0.1);
    const dc = circDist(row.z + rowLen / 2, (tr.zFrom + tr.zTo) / 2, L, pipe);
    return { hit: ov >= 0.3 || (rowLen <= 15 && dc <= 10), ov, dc };
  }
  function typePoints(rowType, truthType, max) {
    const rt = normType(rowType), tt = normType(truthType);
    if (!rt || !tt || CAT[rt] !== CAT[tt]) return 0;
    if (rt === tt || rt === 'planar' || rt === 'volumetric' || rt === 'lamination') return max;
    return max / 2;
  }
  function dispositionBonus(row, tr, ctx) {
    if (!ctx || !ctx.standards || !Number.isFinite(row.ampDb) || !row.disposition || !has('standards.evaluate')) return 0;
    try {
      const ev = UT.standards.evaluate({ ruleId: ctx.standards.standard, level: ctx.standards.level, T: ctx.T, probeAngle: Number.isFinite(row.angle) ? row.angle : 60,
        indication: { ampDbVsRef: row.ampDb, lengthMm: row.length, type: normType(row.type) || normType(tr.type), soundPath: null, depth: row.depth } });
      if (!ev) return 0;
      const d = row.disposition;
      if (d === ev.disposition) return 10;
      if (d === 'record' && ev.recordable && ev.disposition === 'accept') return 10;
      return 0;
    } catch (e) { return 0; }
  }
  /**
   * Score a report against the truth (pure). o = {difficulty, L, pipe, hintsUsed, revealedOne, standards, T}.
   * @returns {{score:number, fail:boolean, pass:boolean, matched:number, typeMatches:number, falseCalls:number, duplicates:number, misses:object[], perDefect:object[], detail:object[], rows:object[]}}
   */
  function scoreReport(rowsIn, truth, o) {
    o = o || {};
    const D = DIFF[o.difficulty] || DIFF.intermediate;
    const L = o.L || 300, pipe = !!o.pipe;
    const revealedOne = Array.isArray(o.revealedOne) ? o.revealedOne : [];
    const rows = (Array.isArray(rowsIn) ? rowsIn : []).filter(function (r) { return r && typeof r === 'object'; }).map(normRow).filter(function (r) { return Number.isFinite(r.z); });
    const scoring = truth.map(function (tr, j) { return tr.recordable !== false && revealedOne.indexOf(j) < 0; });
    const cands = [];
    rows.forEach(function (r, i) { truth.forEach(function (tr, j) { if (!scoring[j]) return; const d = detects(r, tr, L, pipe); if (d.hit) cands.push({ i, j, ov: d.ov, dc: d.dc }); }); });
    cands.sort(function (a, b) { return b.ov - a.ov || a.dc - b.dc; });
    const match = {}, rowMatch = {};
    for (const c of cands) { if (match[c.j] !== undefined || rowMatch[c.i] !== undefined) continue; match[c.j] = c.i; rowMatch[c.i] = c.j; }
    let falseCalls = 0, duplicates = 0, typeMatches = 0;
    const detail = [];
    rows.forEach(function (r, i) {
      if (rowMatch[i] !== undefined) { detail.push({ row: r, truth: truth[rowMatch[i]], hit: true, status: 'detection' }); return; }
      const dup = truth.some(function (tr) { return detects(r, tr, L, pipe).hit; });
      if (dup) { duplicates++; detail.push({ row: r, truth: null, hit: false, status: 'duplicate' }); }
      else { falseCalls++; detail.push({ row: r, truth: null, hit: false, status: 'false-call' }); }
    });
    const perDefect = [];
    let sum = 0, nScoring = 0, matched = 0, fail = false;
    const misses = [];
    truth.forEach(function (tr, j) {
      const entry = { n: tr.n, found: match[j] !== undefined, scoring: scoring[j], recordable: tr.recordable !== false, revealedOne: revealedOne.indexOf(j) >= 0, rowIndex: match[j] === undefined ? null : match[j], tFoundSec: null, points: null, total: 0 };
      if (entry.found) {
        const r = rows[match[j]];
        const truthLen = tr.zTo - tr.zFrom;
        const dLen = Math.abs(r.length - truthLen);
        const lenPts = dLen <= Math.max(5, 0.2 * truthLen) + 1e-6 ? 15 : (dLen <= Math.max(10, 0.4 * truthLen) + 1e-6 ? 7.5 : 0);
        const yMin = Number.isFinite(tr.yMin) ? tr.yMin : tr.depth, yMax = Number.isFinite(tr.yMax) ? tr.yMax : tr.depth + (tr.height || 0);
        let depthPts = 0;
        if (Number.isFinite(r.depth)) depthPts = (r.depth >= yMin - 3 - 1e-6 && r.depth <= yMax + 3 + 1e-6) ? 15 : ((r.depth >= yMin - 9 - 1e-6 && r.depth <= yMax + 9 + 1e-6) ? 7.5 : 0);
        let hPts = D.H;
        if (Number.isFinite(r.height)) { const dh = Math.abs(r.height - tr.height); hPts = dh <= 2 + 1e-6 ? D.H : (dh <= 4 + 1e-6 ? D.H / 2 : 0); }
        const tPts = typePoints(r.type, tr.type, 15);
        if (tPts === 15) typeMatches++;
        const bonus = dispositionBonus(r, tr, o);
        const total = Math.min(100, D.D + tPts + lenPts + depthPts + hPts + bonus);
        entry.points = { detection: D.D, type: tPts, length: lenPts, depth: depthPts, height: hPts, bonus };
        entry.total = total;
        entry.tFoundSec = Number.isFinite(r.tAddedSec) ? r.tAddedSec : null;
        matched++;
        if (scoring[j]) { sum += total; nScoring++; }
      } else {
        if (scoring[j]) { nScoring++; misses.push(tr); }
        if (scoring[j] && o.difficulty !== 'basic' && CRITICAL_SUBS[normType(tr.type)] && tr.height >= 3) { fail = true; entry.critical = true; }
      }
      perDefect.push(entry);
    });
    const mean = nScoring ? sum / nScoring : 100;
    const hints = Number.isFinite(o.hintsUsed) ? o.hintsUsed : 0;
    const score = M.clamp(Math.round(mean - FALSE_CALL_PENALTY * falseCalls - HINT_PENALTY * hints), 0, 100);
    return { score, fail, pass: score >= PASS_MARK && !fail, matched, typeMatches, falseCalls, duplicates, misses, perDefect, detail, rows };
  }

  // ------------------------------------------------------------------ coverage tracker (§4.2.1)
  function covReset(spec) {
    const L = (spec && spec.L) || 300;
    const n = Math.max(1, Math.ceil(L / Z_BIN));
    const mk = function () { return { 1: new Uint8Array(n), '-1': new Uint8Array(n) }; };
    cov = { L, zBin: Z_BIN, n, pipe: !!(spec && spec.pipe), T: (spec && spec.T) || 20, capW: (spec && spec.weld && spec.weld.capWidth) || 16, sides: mk(), perAngle: { 45: mk(), 60: mk(), 70: mk() } };
    lastCovKey = '';
  }
  function angleBucket(a) { if (!(a > 0)) return null; return a < 52.5 ? 45 : (a < 65 ? 60 : 70); }
  function covRecord(s) {
    if (!cov || !s.trade || !s.trade.active || !s.specimen || s.specimen.kind !== 'weld') return;
    const p = s.probe;
    if (!p || p.method === 'pa' || p.surface !== 'chord') return;
    const side = p.side === -1 ? -1 : 1;
    const key = side + '|' + p.angle + '|' + p.x + '|' + p.z;
    if (key === lastCovKey) return;
    lastCovKey = key;
    const bucket = angleBucket(p.angle);
    if (!bucket) return;
    const d = side * p.x - cov.capW / 2;
    const tn = Math.tan(M.deg2rad(p.angle));
    if (d < 0.5 * cov.T * tn - 1 || d > 2 * cov.T * tn + 1) return;
    const z0 = p.z - 5, z1 = p.z + 5;
    for (let b = Math.floor(z0 / cov.zBin); b <= Math.floor(z1 / cov.zBin); b++) {
      let i = b;
      if (cov.pipe) i = ((b % cov.n) + cov.n) % cov.n;
      if (i < 0 || i >= cov.n) continue;
      cov.sides[side][i] = 1;
      cov.perAngle[bucket][side][i] = 1;
    }
  }
  function frac(arr) { let c = 0; for (let i = 0; i < arr.length; i++) if (arr[i]) c++; return arr.length ? c / arr.length : 0; }
  /** Coverage summary {sideA, sideB, perAngle:{45,60,70}, map} (fractions 0…1; map bit0 = side A, bit1 = side B). */
  function coverage() {
    if (!cov) return { sideA: 0, sideB: 0, perAngle: { 45: { sideA: 0, sideB: 0 }, 60: { sideA: 0, sideB: 0 }, 70: { sideA: 0, sideB: 0 } }, map: new Uint8Array(0), zBin: Z_BIN };
    const map = new Uint8Array(cov.n);
    for (let i = 0; i < cov.n; i++) map[i] = (cov.sides[1][i] ? 1 : 0) | (cov.sides[-1][i] ? 2 : 0);
    const perAngle = {};
    for (const a of [45, 60, 70]) perAngle[a] = { sideA: frac(cov.perAngle[a][1]), sideB: frac(cov.perAngle[a][-1]) };
    return { sideA: frac(cov.sides[1]), sideB: frac(cov.sides[-1]), perAngle, map, zBin: cov.zBin, L: cov.L };
  }
  /** {zBin, sides:{1: Uint8Array, -1: Uint8Array}} for the plan view band (62). */
  function coverageMap() {
    if (!cov) return { zBin: Z_BIN, sides: { 1: new Uint8Array(0), '-1': new Uint8Array(0) }, n: 0, L: 0 };
    return { zBin: cov.zBin, sides: cov.sides, n: cov.n, L: cov.L };
  }
  function usedProbesRecord(s) {
    if (!s.trade || !s.trade.active || !s.probe) return;
    const p = s.probe;
    const key = (p.libId || '') + '|' + p.angle + '|' + p.freq;
    if (usedProbes[key]) return;
    let wedge = null;
    try { wedge = UT.probe.derive(p, s.specimen).wedgeAngle; } catch (e) { wedge = null; }
    usedProbes[key] = { libId: p.libId || null, angle: p.angle, freq: p.freq, crystal: p.crystalDims ? p.crystalDims.a + '×' + p.crystalDims.b : (p.diameter + ' mm'), wedgeAngle: wedge };
  }

  // ------------------------------------------------------------------ timer (§4.2 timer)
  const trade = {};
  /** Injectable clock (ms); tick() advances a virtual offset. */
  trade._now = function () { return Date.now() + vOffset; };
  /** A test is running: active and not yet scored (practice and a pending exam included). */
  function running(tr) { tr = tr || st().trade; return !!(tr.active && (tr.score === null || tr.score === undefined)); }
  /** Difficulty of the CURRENT test: a loaded exam descriptor fixes it (§4.2.3), else the value captured at start. */
  function diffOf(tr) { tr = tr || st().trade; return tr.exam && DIFF[tr.exam.difficulty] ? tr.exam.difficulty : (DIFF[tr.difficulty] ? tr.difficulty : 'intermediate'); }
  /** Time limit (min) of the CURRENT test: the exam descriptor's, else the value captured at start. */
  function timeLimitOf(tr) {
    tr = tr || st().trade;
    const v = tr.exam && Number.isFinite(num(tr.exam.timeLimitMin)) ? num(tr.exam.timeLimitMin) : tr.timeLimitMin;
    return Math.max(0.05, Number.isFinite(v) ? v : 60);
  }
  /** Apply a difficulty / time limit deferred by configure() during a running test (called once the test is over). */
  function applyPending() {
    if (!cfg.next) return;
    const patch = cfg.next;
    cfg.next = null;
    UT.setIn('trade', patch, { noRender: true });
  }
  function remainingSec() {
    const tr = st().trade;
    if (tr.practice || !tr.startedAt || !(tr.active || tr.score !== null)) return null;
    const lim = timeLimitOf(tr) * 60;
    return lim - (trade._now() - tr.startedAt) / 1000;
  }
  function announce(msg) {
    if (ui.live) ui.live.textContent = msg;
    UT.status({ right: msg });
  }
  function timerCb() {
    const tr = st().trade;
    const rem = remainingSec();
    if (rem === null) { stopTimer(); return; }
    if (ui.clock) ui.clock.textContent = tr.revealed || tr.score !== null ? t('Time used {t}', { t: clock((trade._now() - tr.startedAt) / 1000) }) : t('Time left {t}', { t: clock(rem) });
    if (tr.score !== null) return;
    for (const th of [600, 300, 60]) if (rem <= th && rem > 0 && !announced[th]) { announced[th] = true; announce(t(th === 60 ? '{m} minute left' : '{m} minutes left', { m: th / 60 })); }
    if (rem <= 0 && tr.score === null && !announced[0]) {
      announced[0] = true;
      stopTimer();
      announce(t('Time is up — the report has been submitted automatically'));
      trade.submit(rowsFromUi());
    }
  }
  function stopTimer() { if (timer && typeof clearInterval === 'function') clearInterval(timer); timer = null; }
  function startTimer() {
    stopTimer();
    announced = {};
    // QA3 #4: an announcement fires when the remaining time CROSSES a threshold from above — thresholds at or above
    // the configured limit can never be crossed (a 3 min test must not announce '10/5 minutes left' on its first tick)
    const lim = timeLimitOf() * 60;
    for (const th of [600, 300, 60]) if (th >= lim) announced[th] = true;
    if (typeof setInterval !== 'function' || typeof document === 'undefined') return;
    timer = setInterval(timerCb, 1000);
  }
  /** Advance the virtual test clock by seconds and run the timer callback synchronously. Returns the remaining seconds. */
  function tick(seconds) {
    vOffset += (Number.isFinite(+seconds) ? +seconds : 0) * 1000;
    timerCb();
    const r = remainingSec();
    return r === null ? null : Math.max(0, r);
  }

  // ------------------------------------------------------------------ exam lock helpers
  /** Exam lock in force: only while a test is ACTIVE (a loaded exam that is not running never forces display.hide). */
  function locked(tr) { tr = tr || st().trade; return !!(tr.active && tr.exam && tr.exam.locked && !tr.revealed); }
  function codeHashCurrent(tr) { tr = tr || st().trade; return tr.exam && tr.exam.codeHash ? tr.exam.codeHash : codeHashOf('', tr.seed || 0); }
  /** Result without truth rows (§4.2.3: while the exam is locked only {n} of a missed / matched defect is kept). */
  function stripResult(res) {
    return Object.assign({}, res, {
      misses: (res.misses || []).map(function (m) { return { n: m.n }; }),
      detail: (res.detail || []).map(function (d) { return Object.assign({}, d, { truth: d.truth ? { n: d.truth.n } : null }); }),
    });
  }
  /** Put the truth rows back into a stripped result (reveal). */
  function hydrateResult(res, truth) {
    const byN = {};
    (truth || []).forEach(function (q) { byN[q.n] = q; });
    return Object.assign({}, res, {
      misses: (res.misses || []).map(function (m) { return byN[m.n] || m; }),
      detail: (res.detail || []).map(function (d) { return d.truth && byN[d.truth.n] ? Object.assign({}, d, { truth: byN[d.truth.n] }) : d; }),
    });
  }
  /** Procedure specimen ({pipe, od, wt, T}) of the configured procedure, or null. */
  function procedureSpecimen() {
    const procs = cfg.procedureId ? has('standards.procedures') : null;
    const p = procs && procs[cfg.procedureId];
    return p && p.specimen && typeof p.specimen === 'object' ? p.specimen : null;
  }

  // ------------------------------------------------------------------ public API
  /**
   * Configure the next test. Returns false (no throw) when `probes` contains an id the active procedure excludes
   * or when `difficulty` is unknown; otherwise true. Setting `difficulty` resets timeLimitMin to the table value
   * unless timeLimitMin is passed too. While a test is running (active, not yet scored — above all a locked exam)
   * difficulty / timeLimitMin are NOT applied to it: they are kept for the NEXT start() (§4.2, `config().next`).
   * @param {{difficulty?:string, timeLimitMin?:number, specimen?:string, procedureId?:string, probes?:string[]}} o
   */
  function configure(o) {
    o = o || {};
    const patch = {};
    if (o.difficulty !== undefined) {
      if (!DIFF[o.difficulty]) return false;
      patch.difficulty = o.difficulty;
      patch.timeLimitMin = DIFF[o.difficulty].time;
    }
    if (o.timeLimitMin !== undefined) { const v = num(o.timeLimitMin); if (!Number.isFinite(v)) return false; patch.timeLimitMin = Math.max(0.05, v); }
    if (o.probes !== undefined) {
      if (o.probes !== null && !Array.isArray(o.probes)) return false;
      let allowed = null;
      if (has('standards.allowedProbes')) { try { allowed = UT.standards.allowedProbes(st()); } catch (e) { allowed = null; } }
      if (Array.isArray(o.probes) && Array.isArray(allowed) && o.probes.some(function (id) { return allowed.indexOf(id) < 0; })) return false;
      if (Array.isArray(o.probes) && o.probes.some(function (id) { return !(UT.probe && UT.probe.select && UT.probe.select(id)); })) return false;
    }
    if (o.procedureId !== undefined) {
      cfg.procedureId = o.procedureId || null;
      if (cfg.procedureId && has('standards.applyProcedure')) { try { UT.standards.applyProcedure(cfg.procedureId); } catch (e) { /* ignore */ } }
    }
    if (o.specimen !== undefined) cfg.specimen = o.specimen === 'auto' ? 'auto' : (typeof o.specimen === 'string' ? o.specimen : 'auto');
    if (o.probes !== undefined) cfg.probes = Array.isArray(o.probes) && o.probes.length ? o.probes.slice() : null;
    if (Object.keys(patch).length) {
      // a running test keeps the difficulty / time limit captured at start (a locked exam fixes both): defer to the next start()
      if (running()) cfg.next = Object.assign(cfg.next || {}, patch);
      else UT.setIn('trade', patch, { noRender: true });
    }
    refreshAll();
    return true;
  }
  /** Copy of the module configuration (specimen, procedureId, probes, next = difficulty/time deferred until the next start). */
  function config() { return { specimen: cfg.specimen, procedureId: cfg.procedureId, probes: cfg.probes ? cfg.probes.slice() : null, next: cfg.next ? Object.assign({}, cfg.next) : null }; }

  function startInternal(seed, o) {
    const practice = !!(o && o.practice);
    applyPending();   // difficulty / time limit configured while the previous test was running apply to THIS start
    const s0 = st();
    const sd = seed === undefined || seed === null || seed === '' ? Math.floor(Math.random() * 1e9) : (Number(seed) >>> 0);
    const exam = !practice && s0.trade.exam && (s0.trade.exam.seed >>> 0) === sd ? Object.assign({}, s0.trade.exam, { locked: true }) : null;
    const difficulty = exam && DIFF[exam.difficulty] ? exam.difficulty : (DIFF[s0.trade.difficulty] ? s0.trade.difficulty : 'intermediate');
    const timeLimitMin = exam && Number.isFinite(exam.timeLimitMin) ? Math.max(0.05, exam.timeLimitMin) : (Number.isFinite(s0.trade.timeLimitMin) ? s0.trade.timeLimitMin : DIFF[difficulty].time);
    const ed = has('modes.defectEditor');
    if (ed && ed.isOpen && ed.isOpen()) ed.close();
    // mixed seed: the plain LCG's first draws are almost linear in a small classroom seed (pipe/plate, T, …)
    const rng = tradeRng(sd);
    if (cfg.specimen === 'auto') {
      // keep the user's weld specimen for the return from mode 'trade' (v1: trade keeps the weld specimen)
      if (!preTrade) preTrade = { weldOpts: Object.assign({}, s0.weldOpts), material: s0.material };
      const draw = drawSpecimen(rng, difficulty, s0.weldOpts, procedureSpecimen());
      selfSet = true;
      try { UT.set({ weldOpts: draw.weldOpts, material: draw.material }, { noRender: true }); } finally { selfSet = false; }
    }
    if (has('modes.enter')) UT.modes.enter('trade', { keepProbe: true, silentUI: true });
    else if (!st().specimen) UT.set({ specimen: S.plateWeld(st().weldOpts) }, { noRender: true });
    const s = st();
    const spec = s.specimen;
    const g = drawDefects(rng, spec, difficulty);
    recordability(g.truth, g.defects, spec);
    ensureRecordable(rng, spec, difficulty, g);
    covReset(spec);
    usedProbes = {};
    const display = Object.assign({}, s.display, { hide: true });
    if (difficulty === 'advanced' && !practice) display.beam = false;
    UT.set({
      defects: g.defects, selectedDefect: 0, display,
      trade: Object.assign({}, s.trade, { active: true, revealed: false, report: [], score: null, seed: sd, startedAt: trade._now(), truth: g.truth, result: null,
        difficulty, timeLimitMin, exam, coverage: null, practice, hintsUsed: 0, revealedOne: [] }),
    });
    if (practice) stopTimer(); else startTimer();
    resetRowsUi();
    if (!quiet && typeof document !== 'undefined') { tradeWin.open(); if (practice) practiceWin.open(); }
    refreshAll();
    UT.status({ right: practice ? t('Random practice started ({n} hidden defects). Hint, Reveal one and Check row are allowed', { n: g.truth.length })
      : t('Trade Test started ({n} hidden defects). Fill in the report, then Submit', { n: g.truth.length }) });
    return trade.truth();
  }
  /**
   * Start a trade test: seeded specimen draw (when configured 'auto'), enter mode 'trade', seeded defects,
   * recordability filter, timer. Returns the truth rows ([] while an exam is locked).
   * @param {number} [seed]
   */
  trade.start = function (seed) { return startInternal(seed, { practice: false }); };
  /** New random test (= start(undefined)). */
  trade.newTest = function () { return startInternal(undefined, { practice: false }); };
  /** Hidden truth rows [{n, zFrom, zTo, length, depth, yMin, yMax, height, type, x, side, recordable, bestDb}] — [] while the exam is locked. */
  trade.truth = function () {
    const tr = st().trade;
    if (locked(tr)) return [];
    return (tr.truth || []).map(function (q) { return Object.assign({}, q); });
  };
  function compliance(covSum) {
    const s = st();
    let c = 0;
    const dac = s.instrument.dac || {};
    if (Array.isArray(dac.points) && dac.points.length >= 2) c += 4;
    if (Number.isFinite(s.instrument.refGain) && (dac.refDb !== null && dac.refDb !== undefined || s.instrument.refGain !== 30)) c += 2;
    if (covSum && covSum.sideA >= 0.8 && covSum.sideB >= 0.8) c += 4;
    return c;
  }
  /**
   * Score the report rows (window rows when omitted) → score 0…100. Reveals the truth unless the exam says otherwise.
   * @param {object[]} [rows]
   */
  trade.submit = function (rows) {
    const s = st();
    const tr = s.trade;
    if (!tr.active || s.mode !== 'trade') return 0;
    // QA3 #1 (§4.2.3): ONE submission per exam attempt. A locked exam keeps trade.active after Submit (the truth
    // must not reach localStorage), but the exam is over — re-scoring fresh rows would be a z-sweep score oracle
    // (probe a row, read the score, resubmit the hits). Return the stored score; no new token or history entry.
    if (locked(tr) && tr.result && tr.score !== null && tr.score !== undefined) {
      announce(t('Report already submitted — the exam is over'));
      return tr.score;
    }
    const list = rows === undefined ? rowsFromUi() : rows;
    const spec = s.specimen || {};
    const difficulty = diffOf(tr);   // captured at start; a locked exam's descriptor fixes it (§4.2.3)
    const res = scoreReport(list, tr.truth || [], { difficulty, L: spec.L, pipe: !!spec.pipe, hintsUsed: tr.practice ? tr.hintsUsed : 0, revealedOne: tr.revealedOne, standards: s.standards, T: spec.T });
    const covSum = coverage();
    const timeUsedSec = Math.max(0, Math.round((trade._now() - (tr.startedAt || trade._now())) / 1000));
    const date = new Date(trade._now()).toISOString();
    const comp = compliance(covSum);
    const revealNow = tr.exam ? tr.exam.revealOnSubmit !== false : true;
    let result = { seed: tr.seed, difficulty, score: res.score, fail: res.fail, pass: res.pass, timeUsedSec, date, name: tr.candidate || '',
      coverageA: covSum.sideA, coverageB: covSum.sideB, compliance: comp, matched: res.matched, typeMatches: res.typeMatches, falseCalls: res.falseCalls, duplicates: res.duplicates,
      misses: res.misses, detail: res.detail, perDefect: res.perDefect, kind: tr.practice ? 'practice' : 'trade' };
    result.token = tokenFor(result, codeHashCurrent(tr));
    // §4.2.3: while the exam stays locked the score result must not carry the truth rows (UT.test.state() exports it)
    const stillLocked = !!(tr.exam && tr.exam.locked && !revealNow);
    if (stillLocked) result = stripResult(result);
    const entry = { date, seed: tr.seed, difficulty, kind: result.kind, score: res.score, fail: res.fail, timeUsedSec,
      specimen: { T: spec.T, pipe: !!spec.pipe, od: spec.pipe ? spec.pipe.od : null }, coverageA: covSum.sideA, coverageB: covSum.sideB, compliance: comp,
      perDefect: res.perDefect.map(function (p) { return { n: p.n, found: p.found, tFoundSec: p.tFoundSec }; }), name: tr.candidate || '' };
    const history = (tr.history || []).concat([entry]).slice(-HISTORY_CAP);
    const coverageState = { sideA: covSum.sideA, sideB: covSum.sideB, perAngle: covSum.perAngle, map: Array.from(covSum.map) };
    // The test is over once the truth is revealed: trade.active = false lets 90 persist the history entry now (the
    // 'not saved while trade.active' rule protects a running test). A locked exam stays active until reveal(code) so
    // the hidden truth defects (state.defects) are never written to localStorage.
    UT.set({
      trade: Object.assign({}, tr, { report: res.rows, score: res.score, revealed: revealNow, result, history, coverage: coverageState, active: stillLocked ? tr.active : false }),
      display: Object.assign({}, s.display, { hide: !revealNow }),
    });
    stopTimer();
    if (!running()) applyPending();
    refreshAll();
    UT.status({ right: t('Trade Test score {score}% — {found}/{n} found, {fc} false calls', { score: res.score, found: res.matched, n: (tr.truth || []).length, fc: res.falseCalls }) + (res.fail ? ' — ' + t('FAIL (critical miss)') : '') });
    return res.score;
  };
  /**
   * Reveal the hidden defects. Exams require the code (4–8 chars): a wrong code returns false and leaves display.hide.
   * @param {string} [code]
   */
  trade.reveal = function (code) {
    const s = st();
    const tr = s.trade;
    if (tr.exam && tr.exam.locked) {
      if (typeof code !== 'string' || code.length < 4 || code.length > 8) return false;
      if (codeHashOf(code, tr.seed) !== tr.exam.codeHash) return false;
      const submitted = tr.score !== null && tr.score !== undefined && !!tr.result;
      const result = submitted ? hydrateResult(tr.result, tr.truth || []) : tr.result;
      UT.set({ trade: Object.assign({}, tr, { revealed: true, exam: Object.assign({}, tr.exam, { locked: false }), result, active: submitted ? false : tr.active }), display: Object.assign({}, s.display, { hide: false }) });
    } else UT.set({ trade: Object.assign({}, tr, { revealed: true }), display: Object.assign({}, s.display, { hide: false }) });
    if (!tr.practice) stopTimer();
    if (!running()) applyPending();
    refreshAll();
    return true;
  };
  /** History entries (last 30), newest last. */
  trade.history = function () { return UT.clone(st().trade.history || []); };
  /** Build an exam descriptor (§4.2.3) — the URL carries this object, never the defects. */
  trade.makeExam = function (o) {
    o = o || {};
    const seed = o.seed === undefined || o.seed === null ? Math.floor(Math.random() * 1e9) : (Number(o.seed) >>> 0);
    const difficulty = DIFF[o.difficulty] ? o.difficulty : st().trade.difficulty;
    return { v: 2, seed, difficulty, timeLimitMin: Number.isFinite(num(o.timeLimitMin)) ? Math.max(0.05, num(o.timeLimitMin)) : (st().trade.timeLimitMin || DIFF[difficulty].time),
      procedureId: o.procedureId || cfg.procedureId || null, specimen: cfg.specimen, codeHash: codeHashOf(o.code || '', seed), revealOnSubmit: o.revealOnSubmit === true,
      title: o.title || '', nameRequired: !!o.nameRequired, locked: true };
  };
  /** Load an exam descriptor (from a shared URL) and start it: truth regenerated from exam.seed, locked. */
  trade.loadExam = function (exam) {
    if (!exam || typeof exam !== 'object' || !Number.isFinite(num(exam.seed))) return null;
    const ex = Object.assign({}, exam, { seed: num(exam.seed) >>> 0, locked: true });
    if (ex.procedureId) configure({ procedureId: ex.procedureId });
    if (DIFF[ex.difficulty]) {
      // the exam replaces any running test, so its difficulty / time limit are applied now (never deferred)
      cfg.next = null;
      UT.setIn('trade', { difficulty: ex.difficulty, timeLimitMin: Number.isFinite(num(ex.timeLimitMin)) ? Math.max(0.05, num(ex.timeLimitMin)) : DIFF[ex.difficulty].time }, { noRender: true });
    }
    UT.setIn('trade', { exam: ex, candidate: st().trade.candidate || '' }, { noRender: true });
    if (ex.nameRequired && !String(st().trade.candidate || '').trim()) {
      // 'candidate name required': the exam waits in mode 'trade' (locks apply, no truth, no timer) for the window's
      // Start button — or setCandidate(name) + start(exam.seed) from the API.
      if (has('modes.enter')) UT.modes.enter('trade', { keepProbe: true, silentUI: true });
      stopTimer();
      // a previous test of this trade session must not linger under the pending exam (truth, clock, defects)
      UT.set({ defects: [], selectedDefect: 0, display: Object.assign({}, st().display, { hide: true }),
        trade: Object.assign({}, st().trade, { truth: [], startedAt: null, score: null, result: null, revealed: false, report: [], seed: ex.seed, coverage: null, practice: false, hintsUsed: 0, revealedOne: [] }) }, { noRender: true });
      resetRowsUi();
      if (!quiet && typeof document !== 'undefined') tradeWin.open();
      refreshAll();
      UT.status({ right: t('Exam loaded — enter the candidate name and press Start') });
      return null;
    }
    return trade.start(ex.seed);
  };
  /** Set the candidate name (exam). */
  trade.setCandidate = function (name) { UT.setIn('trade', { candidate: String(name || '').slice(0, 80) }, { noRender: true }); refreshAll(); };
  trade.verifyResult = verifyResult;
  trade.tick = tick;
  trade.coverage = coverage;
  trade.coverageMap = coverageMap;
  trade.configure = configure;
  trade.config = config;
  trade.scoreReport = scoreReport;
  trade.compliance = function () { return compliance(coverage()); };
  trade.difficulties = DIFF_KEYS.slice();
  trade.typeOptions = TYPE_OPTIONS.map(function (o) { return { id: o.id, label: o.label }; });

  /** Report row from the current readout (depth = DP, dB vs reference, angle, side, z = probe.z); added to the window table. */
  trade.addRowFromReadout = function () {
    const s = st();
    const f = UT.frame;
    const r = f && f.readouts && f.readouts.primary;
    const tr = s.trade;
    let ampDb = NaN;
    if (r) {
      if (Number.isFinite(r.dBToDac)) ampDb = r1(r.dBToDac);
      else if (r.peakPct > 0) ampDb = r1(20 * Math.log10(r.peakPct / 80) - ((s.instrument.gain || 0) - (Number.isFinite(s.instrument.refGain) ? s.instrument.refGain : s.instrument.gain)));
    }
    const row = { n: (ui.rows ? ui.rows.children.length : (tr.report || []).length) + 1, z: Math.round(s.probe.z), length: NaN, depth: r ? r1(r.dp) : NaN, height: NaN,
      type: 'planar', ampDb, angle: s.probe.angle, side: s.probe.side === -1 ? -1 : 1, disposition: '', tAddedSec: tr.startedAt ? Math.round((trade._now() - tr.startedAt) / 1000) : 0 };
    if (ui.rows) addRowUi(row);
    return row;
  };

  // ------------------------------------------------------------------ report (§4.2.2)
  function probeLines() {
    const keys = Object.keys(usedProbes);
    if (!keys.length) { const p = st().probe; usedProbesRecord(st()); }
    return Object.keys(usedProbes).map(function (k) { const p = usedProbes[k]; return (p.libId || '—') + ' · ' + p.angle + '° · ' + p.freq + ' MHz · ' + p.crystal + (Number.isFinite(p.wedgeAngle) ? ' · ' + t('wedge') + ' ' + p.wedgeAngle.toFixed(1) + '°' : ''); });
  }
  /**
   * Report HTML (§4.2.2). {withTruth} adds the truth table (never while the exam is locked).
   * @param {{withTruth?:boolean}} [o]
   */
  trade.report = function (o) {
    o = o || {};
    const s = st(), tr = s.trade, spec = s.specimen || {}, inst = s.instrument, std = s.standards || {};
    const withTruth = (o.withTruth === undefined ? !!tr.revealed : !!o.withTruth) && !locked(tr) && (tr.truth || []).length > 0;
    const res = tr.result;
    const cs = tr.coverage || coverage();
    const rows = res && res.detail ? res.detail : (tr.report || []).map(function (r) { return { row: normRow(r, 0), status: '' }; });
    const L = function (k, p) { return esc(t(k, p)); };
    const kv = function (k, v) { return '<tr><th>' + L(k) + '</th><td>' + v + '</td></tr>'; };
    const mat = spec.material || {};
    const specTxt = (UT.i18n && UT.i18n.lang === 'ko' && mat.nameKo ? mat.nameKo : (mat.name || s.material || 'carbon')) + ' · ' + esc(spec.prep || (spec.weld && spec.weld.prep) || '—') + ' · ' +
      (spec.pipe ? 'OD ' + spec.pipe.od + ' mm / WT ' + spec.pipe.wt + ' mm' : 'T ' + (spec.T || '—') + ' mm') + ' · ' + L('datum: z 0 mark') + ' · ' + L('surfaces A (side +) / B (side −)');
    const dac = inst.dac || {};
    // QA3 #5 (§4.2.2): reference reflector / calibration block follow the procedure or rule set in force
    // (AWS: 1.5 mm IIW hole, ASME: 2.4 mm SDH, …); '3 mm SDH' / 'none recorded' only without one.
    const procs = has('standards.procedures');
    const proc = procs ? procs[std.procedure || cfg.procedureId || ''] : null;
    const ruleMap = has('standards.rules');
    const rule = ruleMap && std.standard ? ruleMap[std.standard] : null;
    const reflector = (proc && proc.refReflector) || (rule && rule.refReflector) || null;
    const blockNames = { iiw: 'IIW (V1)', v2: 'V2', dac: 'DAC', fbh: 'FBH' };
    const calTxt = Array.isArray(dac.points) && dac.points.length >= 2 ? L('DAC block ({n} points, T {T} mm)', { n: dac.points.length, T: s.weldOpts.T })
      : (proc && proc.refBlock ? esc((blockNames[proc.refBlock] || String(proc.refBlock).toUpperCase()) + (Number.isFinite(proc.refSdhMm) ? ' · ' + proc.refSdhMm + ' mm SDH' : '') + ' · T ' + s.weldOpts.T + ' mm') : L('none recorded'));
    const refTxt = (Number.isFinite(dac.refDb) ? dac.refDb : inst.refGain) + ' dB · ' + (reflector || t('3 mm SDH'));
    const scanTxt = inst.refGain !== undefined ? L('ref {r} dB + {x} dB', { r: inst.refGain, x: r1(inst.gain - inst.refGain) }) : inst.gain + ' dB';
    let html = '<div class="tr-report">';
    html += '<h2>' + (tr.exam && tr.exam.title ? esc(tr.exam.title) : L('Ultrasonic examination report')) + '</h2>';
    html += '<table class="tr-kv">';
    html += kv('Job / exam title', tr.exam && tr.exam.title ? esc(tr.exam.title) : L('Trade Test') + ' #' + esc(tr.seed === null ? '—' : tr.seed) + ' (' + L(diffOf(tr)) + (tr.practice ? ', ' + L('practice') : '') + ')');
    html += kv('Candidate', esc(tr.candidate || (res && res.name) || '—'));
    html += kv('Date / time', esc(res ? res.date : new Date(trade._now()).toISOString()));
    html += kv('Standard / acceptance level / testing level', esc(std.standard || '—') + ' / ' + esc(std.level || '—') + ' / ' + esc(std.testingLevel || '—'));
    html += kv('Procedure', esc(std.procedure || cfg.procedureId || '—'));
    html += kv('Specimen', specTxt);
    html += kv('Probes used', probeLines().map(esc).join('<br>') || '—');
    html += kv('Calibration block', calTxt);
    html += kv('Reference level', esc(refTxt));
    html += kv('Scanning sensitivity', scanTxt);
    html += kv('Transfer correction', esc(UT.fmtNum(std.transferDb || 0, 1)) + ' dB');
    html += kv('Couplant', esc(reportMeta.couplant));
    html += kv('Surface condition', esc(reportMeta.surface));
    html += '</table>';
    html += '<h3>' + L('Indications') + '</h3><table class="tr-ind"><tr>' + ['No', 'z from datum', 'x from weld CL', 'Length', 'Depth to top', 'Height', 'Max amp (% DAC / dB vs ref)', 'Angle & side', 'Classification', 'Disposition'].map(function (k) { return '<th>' + L(k) + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (d, i) {
      const r = d.row;
      const pct = Number.isFinite(r.ampDb) ? Math.round(100 * Math.pow(10, r.ampDb / 20)) + ' % / ' + UT.fmtNum(r.ampDb, 1) + ' dB' : '—';
      const xs = d.truth && Number.isFinite(d.truth.x) && withTruth ? UT.fmtNum(d.truth.x, 1) : '—';
      html += '<tr class="' + esc(d.status || '') + '"><td>' + esc(Number.isFinite(r.n) ? r.n : i + 1) + '</td><td>' + UT.fmtNum(r.z, 0) + '</td><td>' + xs + '</td><td>' + UT.fmtNum(r.length, 0) + '</td><td>' + UT.fmtNum(r.depth, 1) + '</td><td>' + UT.fmtNum(r.height, 1) + '</td><td>' + pct + '</td><td>' + (Number.isFinite(r.angle) ? r.angle + '°' : '—') + ' ' + (r.side === -1 ? 'B' : (r.side === 1 ? 'A' : '')) + '</td><td>' + esc(normType(r.type) ? typeLabel(normType(r.type)) : r.type) + '</td><td>' + esc(r.disposition ? t(r.disposition) : '—') + '</td></tr>';
    });
    if (!rows.length) html += '<tr><td colspan="10">' + L('no indications recorded') + '</td></tr>';
    html += '</table>';
    html += '<p>' + L('Coverage') + ': A ' + Math.round(cs.sideA * 100) + ' % · B ' + Math.round(cs.sideB * 100) + ' %' + (cs.sideB < 0.5 ? ' — <b>' + L('Side B not scanned') + '</b>' : '') + (cs.sideA < 0.5 ? ' — <b>' + L('Side A not scanned') + '</b>' : '') + '</p>';
    html += '<p>' + L('Procedure compliance') + ': ' + (res ? res.compliance : compliance(cs)) + ' / 10</p>';
    html += '<p>' + L('Remarks') + ': ' + esc(reportMeta.remarks || '—') + '</p>';
    if (has('aut.snapshot') && s.aut && s.aut.scan) { try { const url = UT.aut.snapshot(); if (typeof url === 'string' && url.indexOf('data:image') === 0) html += '<p>' + L('AUT strip chart') + '<br><img class="tr-aut" src="' + url + '" alt="AUT"></p>'; } catch (e) { /* ignore */ } }
    html += '<p class="tr-sign">' + L('Signature') + ': ______________________ &nbsp; ' + L('Date') + ': ____________</p>';
    if (res) {
      html += '<h3>' + L('Score') + '</h3><p class="tr-score-line">' + L('SCORE {score}%', { score: res.score }) + ' — ' + (res.fail ? '<b class="tr-fail">' + L('FAIL (critical miss)') + '</b>' : (res.pass ? L('PASS') : L('FAIL (below {p}%)', { p: PASS_MARK }))) + ' · ' + L('{found}/{n} found, {fc} false calls, time {t}', { found: res.matched, n: (tr.truth || []).length, fc: res.falseCalls, t: clock(res.timeUsedSec) }) + '</p>';
      html += '<table class="tr-pd"><tr>' + ['No', 'Found', 'Detection', 'Type', 'Length', 'Depth', 'Height', 'Bonus', 'Points'].map(function (k) { return '<th>' + L(k) + '</th>'; }).join('') + '</tr>';
      (res.perDefect || []).forEach(function (p) {
        const pts = p.points || {};
        html += '<tr class="' + (p.recordable ? '' : 'tr-dim') + '"><td>' + p.n + '</td><td>' + (p.found ? '✓' : (p.recordable ? '✗' : '')) + (p.critical ? ' ' + L('critical') : '') + '</td><td>' + (p.found ? pts.detection : 0) + '</td><td>' + (p.found ? pts.type : 0) + '</td><td>' + (p.found ? pts.length : 0) + '</td><td>' + (p.found ? pts.depth : 0) + '</td><td>' + (p.found ? pts.height : 0) + '</td><td>' + (p.found ? pts.bonus : 0) + '</td><td>' + (p.recordable ? p.total : L('below recording level')) + '</td></tr>';
      });
      html += '</table>';
      if (res.token) html += '<p>' + L('Result token') + ': <code class="tr-token">' + esc(res.token) + '</code></p>';
    }
    if (withTruth) {
      html += '<h3>' + L('True defects') + '</h3><table class="tr-truth"><tr>' + ['No', 'From z', 'Length', 'Depth', 'Height', 'Type', 'x', 'Side', 'Best dB'].map(function (k) { return '<th>' + L(k) + '</th>'; }).join('') + '</tr>';
      tr.truth.forEach(function (q) {
        html += '<tr class="' + (q.recordable === false ? 'tr-dim' : '') + '"><td>' + q.n + '</td><td>' + q.zFrom + '</td><td>' + UT.fmtNum(q.zTo - q.zFrom, 1) + '</td><td>' + q.depth + '</td><td>' + q.height + '</td><td>' + esc(typeLabel(normType(q.type)) || q.type) + '</td><td>' + UT.fmtNum(q.x, 1) + '</td><td>' + sideLabel(q.side) + '</td><td>' + UT.fmtNum(q.bestDb, 1) + (q.recordable === false ? ' (' + L('below recording level') + ')' : '') + '</td></tr>';
      });
      html += '</table>';
    }
    html += '</div>';
    return html;
  };
  /** Render the report into div#print-root (body) and print; the root is emptied on afterprint. */
  trade.printReport = function () {
    if (typeof document === 'undefined') return false;
    let root = document.getElementById('print-root');
    if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = trade.report({ withTruth: !!st().trade.revealed });
    if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('afterprint', function () { root.innerHTML = ''; }, { once: true });
    try { if (typeof window !== 'undefined' && typeof window.print === 'function') window.print(); } catch (e) { /* ignore */ }
    return true;
  };

  // ------------------------------------------------------------------ practice (§4.6)
  function nearestHidden(rows) {
    const s = st(), tr = s.trade, spec = s.specimen || {};
    if (!tr.active || !(tr.truth || []).length) return null;
    const res = scoreReport(rows, tr.truth, { difficulty: diffOf(tr), L: spec.L, pipe: !!spec.pipe, revealedOne: tr.revealedOne });
    let best = null;
    res.perDefect.forEach(function (p, j) {
      if (p.found || !p.scoring) return;
      const q = tr.truth[j];
      const zc = (q.zFrom + q.zTo) / 2;
      let dz = zc - s.probe.z;
      if (spec.pipe && spec.L) { dz = ((dz % spec.L) + spec.L) % spec.L; if (dz > spec.L / 2) dz -= spec.L; }
      if (!best || Math.abs(dz) < Math.abs(best.dz)) best = { j, dz, truth: q };
    });
    return best;
  }
  const practice = {
    /** Start a random practice run (same generator, no timer, reveal allowed). */
    start(seed) { return startInternal(seed, { practice: true }); },
    /** Print the z-distance and side of the nearest undetected recordable defect (costs 5 % of the practice score). */
    hint() {
      const tr = st().trade;
      if (!tr.active || !tr.practice) return null;
      const near = nearestHidden(rowsFromUi());
      let msg;
      if (!near) msg = t('No hidden indication left — every recordable defect is already reported');
      else {
        const d = Math.round(Math.abs(near.dz));
        msg = t('nearest hidden indication: {d} mm {dir} along z, side {side}', { d, dir: near.dz >= 0 ? t('further') : t('back'), side: hintSide(near.truth) });
        // QA3 #6 (§4.6): the 5 % penalty pays for the z-distance/side of a hidden defect — a hint that reveals
        // nothing ('No hidden indication left') is free.
        UT.setIn('trade', { hintsUsed: (tr.hintsUsed || 0) + 1 }, { noRender: true });
      }
      practiceMsg(msg);
      return msg;
    },
    /** Reveal the nearest hidden defect only (marked non-scoring) — returns its truth row. */
    revealOne() {
      const tr = st().trade;
      if (!tr.active || !tr.practice) return null;
      const near = nearestHidden(rowsFromUi());
      if (!near) { practiceMsg(t('No hidden indication left — every recordable defect is already reported')); return null; }
      const q = near.truth;
      UT.setIn('trade', { revealedOne: (tr.revealedOne || []).concat([near.j]) }, { noRender: true });
      const msg = t('Revealed defect {n}: {type}, z {z0}–{z1} mm, depth {d} mm, height {h} mm, side {side}', { n: q.n, type: typeLabel(normType(q.type)) || q.type, z0: q.zFrom, z1: q.zTo, d: q.depth, h: q.height, side: sideLabel(q.side) });
      if (ui.rows) addRowUi({ n: ui.rows.children.length + 1, z: q.zFrom, length: r1(q.zTo - q.zFrom), depth: q.depth, height: q.height, type: normType(q.type) || 'planar', angle: st().probe.angle, side: q.side || 1 });
      practiceMsg(msg);
      refreshAll();
      return Object.assign({}, q);
    },
    /** Immediate ✓/✗ for row i (0-based; row object optional) — detection only, no sizing feedback. */
    checkRow(i, row) {
      const s = st(), tr = s.trade, spec = s.specimen || {};
      if (!tr.active) return null;
      const rows = rowsFromUi();
      const idx = Number.isFinite(num(i)) ? num(i) : 0;
      if (row && typeof row === 'object') rows[idx] = row;
      if (!rows[idx]) return null;
      const res = scoreReport(rows, tr.truth || [], { difficulty: diffOf(tr), L: spec.L, pipe: !!spec.pipe, revealedOne: tr.revealedOne });
      const d = res.detail.find(function (q) { return q.row === res.rows[res.rows.findIndex(function (rr) { return rr.n === normRow(rows[idx], idx).n && rr.z === normRow(rows[idx], idx).z; })]; });
      const ok = !!(d && d.hit);
      const out = { ok, status: d ? d.status : 'ignored', n: d && d.truth ? d.truth.n : null };
      if (ui.rows && ui.rows.children[idx]) { const cell = ui.rows.children[idx].querySelector('.tr-chk'); if (cell) { cell.textContent = ok ? '✓' : '✗'; cell.className = 'tr-chk ' + (ok ? 'ok' : 'bad'); } }
      practiceMsg(ok ? t('Row {i}: detection ✓ (defect {n})', { i: idx + 1, n: out.n }) : t('Row {i}: no matching hidden defect ✗', { i: idx + 1 }));
      return out;
    },
  };
  function practiceMsg(msg) { if (pui.msg) pui.msg.textContent = msg; if (ui.live) ui.live.textContent = msg; UT.status({ right: msg }); }

  // ------------------------------------------------------------------ windows
  function winApi(name, titleKey, opts, build, onClose) {
    let w = null;
    const api = {
      name,
      get win() { return w; },
      get el() { return w ? w.el : null; },
      open() {
        if (typeof document === 'undefined') return null;
        dom.injectCss('trade', trade.css);
        if (!w) w = dom.win(Object.assign({ name, title: t(titleKey), content: build, onClose }, opts));
        if (!w.isOpen()) w.show(); else w.raise();
        api.refresh();
        return w;
      },
      show() { return api.open(); },
      close() { if (w) w.hide(); return api; },
      hide() { return api.close(); },
      toggle() { return api.isOpen() ? api.close() : api.open(); },
      isOpen() { return !!(w && w.isOpen()); },
      relabel() { if (w) { w.setTitle(t(titleKey)); w.setContent(build); api.refresh(); } },
      refresh() { if (api.onRefresh && w && w.isOpen()) api.onRefresh(); },
    };
    return api;
  }
  function difficultySelect(value, onchange) {
    const sel = dom.h('select', { class: 'tr-diff', title: t('Difficulty'), onchange: function () { onchange(sel.value); } }, DIFF_KEYS.map(function (k) { return dom.h('option', { value: k, selected: k === value ? true : null, dataset: { i18n: k } }, t(k)); }));
    return sel;
  }
  function rowsFromUi() {
    if (!ui.rows) return (st().trade.report || []).slice();
    return Array.from(ui.rows.children).map(function (trEl) {
      const q = function (cls) { const el = trEl.querySelector('.' + cls); return el ? el.value : ''; };
      return { n: num(q('tr-n')), z: num(q('tr-z')), length: num(q('tr-len')), depth: num(q('tr-dep')), height: num(q('tr-h')), type: q('tr-type'), ampDb: num(q('tr-db')),
        angle: num(q('tr-ang')), side: num(q('tr-side')), disposition: q('tr-disp'), tAddedSec: num(trEl.dataset.tadded) };
    });
  }
  function addRowUi(row) {
    if (!ui.rows) return null;
    const s = st();
    const n = ui.rows.children.length + 1;
    const r = Object.assign({ n, z: '', length: '', depth: '', height: '', type: 'planar', ampDb: '', angle: s.probe.angle, side: s.probe.side === -1 ? -1 : 1, disposition: '' }, row || {});
    const v = function (x) { return Number.isFinite(x) ? x : (x === undefined || x === null ? '' : x); };
    const tAdded = Number.isFinite(r.tAddedSec) ? r.tAddedSec : (s.trade.startedAt ? Math.round((trade._now() - s.trade.startedAt) / 1000) : 0);
    const trEl = dom.h('tr', { dataset: { tadded: tAdded } }, [
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.n), class: 'tr-n', min: 1, max: 32 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.z), class: 'tr-z', step: 1 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.length), class: 'tr-len', step: 1 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.depth), class: 'tr-dep', step: 0.5 })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.height), class: 'tr-h', step: 0.5 })),
      dom.h('td', {}, dom.h('select', { class: 'tr-type' }, TYPE_OPTIONS.map(function (o) { return dom.h('option', { value: o.id, selected: o.id === (normType(r.type) || 'planar') ? true : null }, typeLabel(o.id)); }))),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.ampDb), class: 'tr-db', step: 0.5, title: t('dB vs reference') })),
      dom.h('td', {}, dom.h('input', { type: 'number', value: v(r.angle), class: 'tr-ang', step: 1, min: 0, max: 80 })),
      dom.h('td', {}, dom.h('select', { class: 'tr-side' }, [dom.h('option', { value: 1, selected: r.side !== -1 ? true : null }, 'A'), dom.h('option', { value: -1, selected: r.side === -1 ? true : null }, 'B')])),
      dom.h('td', {}, dom.h('select', { class: 'tr-disp' }, DISPOSITIONS.map(function (d) { return dom.h('option', { value: d, selected: d === r.disposition ? true : null }, d ? t(d) : '—'); }))),
      dom.h('td', { class: 'tr-chk' }, ''),
      dom.h('td', {}, dom.button('✕', function () { trEl.remove(); }, { class: 'btn tr-del', title: t('Remove row') })),
    ]);
    ui.rows.appendChild(trEl);
    return trEl;
  }
  function resetRowsUi() { if (ui.rows) { ui.rows.textContent = ''; addRowUi(); } }
  function buildTrade() {
    const s = st(), tr = s.trade;
    const keep = ui.rows ? rowsFromUi() : null;
    ui.clock = dom.h('span', { class: 'tr-clock' }, t('Press Start'));
    ui.seedLbl = dom.h('span', { class: 'tr-seed' }, '');
    ui.live = dom.h('div', { class: 'tr-live', 'aria-live': 'polite' }, '');
    ui.rows = dom.h('tbody', {});
    ui.result = dom.h('div', { class: 'tr-result' });
    ui.examBox = dom.h('div', { class: 'tr-exam' });
    const seedIn = dom.h('input', { type: 'number', class: 'tr-seedin', placeholder: t('seed'), title: t('Optional seed (same seed = same test)') });
    const timeIn = dom.h('input', { type: 'number', class: 'tr-time', value: tr.timeLimitMin, min: 0.05, step: 1, title: t('Time limit (min)'), onchange: function () { configure({ timeLimitMin: timeIn.value }); } });
    ui.timeIn = timeIn;
    const diffSel = difficultySelect(tr.difficulty, function (v) { configure({ difficulty: v }); timeIn.value = st().trade.timeLimitMin; });
    ui.diffSel = diffSel;
    ui.nameIn = dom.h('input', { type: 'text', class: 'tr-name', placeholder: t('Candidate name'), value: tr.candidate || '', onchange: function () { trade.setCandidate(ui.nameIn.value); } });
    const startFn = function () {
      const ex = st().trade.exam;
      if (ex && ex.nameRequired && !(ui.nameIn.value || '').trim()) { announce(t('Please enter the candidate name first')); return; }
      trade.setCandidate(ui.nameIn.value);
      trade.start(ex ? ex.seed : (seedIn.value === '' ? undefined : +seedIn.value));
    };
    const table = dom.h('table', { class: 'tr-table' }, [
      dom.h('thead', {}, dom.h('tr', {}, ['#', 'z (mm)', 'Length', 'Depth (top)', 'Height', 'Type', 'dB', 'Angle', 'Side', 'Disposition', '', ''].map(function (k) { return k ? tx('th', k) : dom.h('th', {}, ''); }))),
      ui.rows,
    ]);
    const body = dom.h('div', { class: 'tr' }, [
      dom.h('div', { class: 'tr-head' }, [
        btn('Start', startFn, { class: 'btn primary' }), seedIn, btn('New test', function () { seedIn.value = ''; trade.newTest(); }),
        diffSel, timeIn, tx('span', 'min', null, { class: 'tr-unit' }), ui.clock, ui.seedLbl,
      ]),
      ui.examBox,
      tx('div', 'Report every indication you find: z start, length, depth to the top, height, type, dB vs reference, probe angle and side. Matching is one-to-one; false calls cost 15 points; pass mark 70 %.', null, { class: 'tr-intro' }),
      dom.h('div', { class: 'tr-scroll' }, table),
      dom.h('div', { class: 'btn-row' }, [
        ui.rowBtn = btn('Row+', function () { addRowUi(); }), ui.takeBtn = btn('Take from readout', function () { trade.addRowFromReadout(); }),
        ui.submitBtn = btn('Submit', function () { if (!(st().trade.truth || []).length) { announce(t('Press Start first')); return; } trade.submit(rowsFromUi()); }, { class: 'btn primary' }),
        btn('Reveal', function () { const ex = st().trade.exam; if (ex && ex.locked) { const code = ui.codeIn ? ui.codeIn.value : ''; if (!trade.reveal(code)) announce(t('Wrong exam code')); } else trade.reveal(); }),
        btn('Report...', function () { reportWin.open(); }), btn('Scoreboard...', function () { scoreboardWin.open(); }),
      ]),
      ui.live, ui.result,
    ]);
    if (keep && keep.length) keep.forEach(function (r) { addRowUi(r); }); else addRowUi();
    return body;
  }
  function refreshTrade() {
    if (!tradeWin.isOpen() || !ui.result) return;
    const s = st(), tr = s.trade;
    const started = tr.startedAt && (tr.active || tr.score !== null);
    if (!started) ui.clock.textContent = t('Press Start');
    else if (tr.practice) ui.clock.textContent = t('Practice (no timer)');
    else ui.clock.textContent = tr.score !== null || tr.revealed ? t('Time used {t}', { t: clock((trade._now() - tr.startedAt) / 1000) }) : t('Time left {t}', { t: clock(Math.max(0, remainingSec() || 0)) });
    ui.seedLbl.textContent = tr.seed === null || tr.seed === undefined ? '' : t('Test #{seed}', { seed: tr.seed }) + ' · ' + t(diffOf(tr));
    // QA3 #1 (§4.2.3): a locked exam that already holds its one submission takes no further rows or submissions
    const submitted = !!(locked(tr) && tr.score !== null && tr.score !== undefined);
    if (ui.submitBtn) ui.submitBtn.disabled = submitted;
    if (ui.rowBtn) ui.rowBtn.disabled = submitted;
    if (ui.takeBtn) ui.takeBtn.disabled = submitted;
    // §4.2: difficulty / time limit configure the NEXT test — locked while one runs (and while an exam descriptor is loaded)
    const cfgLocked = running(tr) || !!(tr.exam && tr.exam.locked);
    if (ui.diffSel) { ui.diffSel.disabled = cfgLocked; const dv = cfgLocked ? diffOf(tr) : (DIFF[tr.difficulty] ? tr.difficulty : ui.diffSel.value); if (ui.diffSel.value !== dv) ui.diffSel.value = dv; }
    if (ui.timeIn) { ui.timeIn.disabled = cfgLocked; if (document.activeElement !== ui.timeIn || cfgLocked) ui.timeIn.value = cfgLocked ? timeLimitOf(tr) : tr.timeLimitMin; }
    ui.examBox.textContent = '';
    if (tr.exam) {
      ui.codeIn = dom.h('input', { type: 'password', class: 'tr-code', placeholder: t('exam code'), maxlength: 8 });
      ui.examBox.appendChild(dom.h('div', { class: 'tr-exam-row' }, [
        tx('b', 'Exam mode'), dom.h('span', {}, ' ' + (tr.exam.title || '') + ' · ' + (tr.exam.locked && !tr.revealed ? t('truth locked') : t('unlocked'))),
        ui.nameIn, ui.codeIn,
      ]));
    } else ui.examBox.appendChild(dom.h('div', { class: 'tr-exam-row' }, [ui.nameIn]));
    ui.result.textContent = '';
    const res = tr.result;
    if (tr.score !== null && tr.score !== undefined && res) {
      ui.result.appendChild(dom.h('div', { class: 'tr-score' + (res.fail ? ' fail' : '') }, t('SCORE {score}%', { score: tr.score }) + ' — ' + (res.fail ? t('FAIL (critical miss)') : (res.pass ? t('PASS') : t('FAIL (below {p}%)', { p: PASS_MARK }))) + '  (' + t('{found}/{n} found, {fc} false calls, time {t}', { found: res.matched, n: (tr.truth || []).length, fc: res.falseCalls, t: clock(res.timeUsedSec) }) + ')'));
      ui.result.appendChild(dom.h('div', { class: 'tr-cov' }, t('Coverage') + ': A ' + Math.round(res.coverageA * 100) + ' % · B ' + Math.round(res.coverageB * 100) + ' % · ' + t('Procedure compliance') + ' ' + res.compliance + '/10'));
      const tbl = dom.h('table', { class: 'tr-truth' }, [dom.h('tr', {}, ['#', 'Found', 'Detection', 'Type', 'Length', 'Depth', 'Height', 'Points'].map(function (k) { return k === '#' ? dom.h('th', {}, '#') : tx('th', k); }))]
        .concat((res.perDefect || []).map(function (p) {
          const pts = p.points || {};
          const cells = [p.n, (p.found ? '✓' : (p.recordable ? '✗' : '')) + (p.critical ? ' ' + t('critical') : ''), p.found ? pts.detection : 0, p.found ? pts.type : 0, p.found ? pts.length : 0, p.found ? pts.depth : 0, p.found ? pts.height : 0, p.recordable ? p.total : t('below recording level')];
          return dom.h('tr', { class: p.recordable ? '' : 'tr-dim' }, cells.map(function (c) { return dom.h('td', {}, String(c)); }));
        })));
      ui.result.appendChild(tx('div', 'Per-defect breakdown', null, { class: 'tr-sub' }));
      ui.result.appendChild(tbl);
      if (res.token) ui.result.appendChild(dom.h('div', { class: 'tr-tokenbox' }, [tx('span', 'Result token'), dom.h('textarea', { class: 'tr-token', readonly: true, rows: 2 }, res.token)]));
    }
    if (tr.revealed && !locked(tr) && (tr.truth || []).length) {
      ui.result.appendChild(tx('div', 'True defects', null, { class: 'tr-sub' }));
      ui.result.appendChild(dom.h('table', { class: 'tr-truth' }, [dom.h('tr', {}, ['#', 'From z', 'Length', 'Depth', 'Height', 'Type', 'Side', 'Best dB'].map(function (k) { return k === '#' ? dom.h('th', {}, '#') : tx('th', k); }))]
        .concat(tr.truth.map(function (q) {
          const cells = [q.n, q.zFrom, r1(q.zTo - q.zFrom), q.depth, q.height, typeLabel(normType(q.type)) || q.type, sideLabel(q.side), UT.fmtNum(q.bestDb, 1) + (q.recordable === false ? ' (' + t('below recording level') + ')' : '')];
          return dom.h('tr', { class: q.recordable === false ? 'tr-dim' : '' }, cells.map(function (c) { return dom.h('td', {}, String(c)); }));
        }))));
      if (res && res.misses && res.misses.length) ui.result.appendChild(dom.h('div', { class: 'tr-miss' }, t('Missed') + ': ' + res.misses.map(function (m) { return '#' + m.n + ' (' + (typeLabel(normType(m.type)) || m.type) + ' z ' + m.zFrom + ')'; }).join(', ')));
    }
  }
  const tradeWin = winApi('trade', 'Trade Test', { x: 600, y: 110, w: 720 }, buildTrade, function () { if (st().mode === 'trade' && !locked() && has('modes.exit')) UT.modes.exit(); /* an accidental ✕ never forfeits a locked exam: reopen via Defects ▸ Trade Test… */ });
  tradeWin.onRefresh = refreshTrade;

  // scoreboard
  function buildScoreboard() {
    sui.list = dom.h('div', { class: 'tr-sb-list' });
    sui.verifyOut = dom.h('div', { class: 'tr-verify-out', 'aria-live': 'polite' });
    const tokIn = dom.h('textarea', { class: 'tr-token', rows: 3, placeholder: 'rt:…' });
    const codeIn = dom.h('input', { type: 'text', class: 'tr-code', placeholder: t('exam code (optional)'), maxlength: 8 });
    const json = dom.h('textarea', { class: 'tr-json', rows: 4, readonly: true });
    return dom.h('div', { class: 'tr' }, [
      sui.list,
      dom.h('div', { class: 'btn-row' }, [
        btn('Copy JSON', function () { json.value = JSON.stringify(trade.history(), null, 1); json.hidden = false; json.select(); try { if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { const p = navigator.clipboard.writeText(json.value); if (p && typeof p.catch === 'function') p.catch(function () { /* best effort: the textarea stays selected for manual copy */ }); } } catch (e) { /* ignore */ } }),
        btn('Clear history', function () { dom.confirm(t('Clear the trade test history?')).then(function (ok) { if (ok) { UT.setIn('trade', { history: [] }, { noRender: true }); refreshAll(); } }); }),
      ]),
      json,
      tx('div', 'Verify result', null, { class: 'tr-sub' }),
      dom.h('div', { class: 'tr-verify' }, [tokIn, codeIn, btn('Verify result', function () {
        const r = verifyResult(tokIn.value, codeIn.value);
        sui.verifyOut.textContent = r.ok ? t('Valid: {name} — seed {seed}, {difficulty}, score {score}%{fail}, {t}', { name: r.name || t('(no name)'), seed: r.seed, difficulty: t(r.difficulty || ''), score: r.score, fail: r.fail ? ' ' + t('FAIL (critical miss)') : '', t: r.date || '' }) : t('Invalid or tampered token');
      }, { class: 'btn primary' })]),
      sui.verifyOut,
    ]);
  }
  function refreshScoreboard() {
    if (!scoreboardWin.isOpen() || !sui.list) return;
    const hist = st().trade.history || [];
    sui.list.textContent = '';
    const best = {};
    const firstTimes = [];
    hist.forEach(function (e) {
      if (e.kind !== 'practice') {
        if (!best[e.difficulty] || e.score > best[e.difficulty].score) best[e.difficulty] = e;
        const tf = (e.perDefect || []).filter(function (p) { return p.found && Number.isFinite(p.tFoundSec); }).map(function (p) { return p.tFoundSec; });
        if (tf.length) firstTimes.push(Math.min.apply(null, tf));
      }
    });
    const summary = dom.h('div', { class: 'tr-sb-best' }, DIFF_KEYS.map(function (k) { return dom.h('div', {}, t(k) + ': ' + (best[k] ? t('best {score}% ({date})', { score: best[k].score, date: (best[k].date || '').slice(0, 10) }) : t('no result yet'))); }));
    summary.appendChild(dom.h('div', {}, t('Mean time to first detection') + ': ' + (firstTimes.length ? clock(firstTimes.reduce(function (a, b) { return a + b; }, 0) / firstTimes.length) : '—')));
    sui.list.appendChild(tx('div', 'Scoreboard', null, { class: 'tr-sub' }));
    sui.list.appendChild(summary);
    const mk = function (kind) {
      const rows = hist.filter(function (e) { return (e.kind === 'practice') === (kind === 'practice'); }).slice().reverse();
      const tbl = dom.h('table', { class: 'tr-truth' }, [dom.h('tr', {}, ['Date', 'Seed', 'Difficulty', 'Score', 'Time', 'Coverage', 'Name'].map(function (k) { return tx('th', k); }))]
        .concat(rows.map(function (e) { return dom.h('tr', { class: e.fail ? 'tr-failrow' : '' }, [(e.date || '').slice(0, 16).replace('T', ' '), e.seed, t(e.difficulty || ''), e.score + '%' + (e.fail ? ' ' + t('FAIL') : ''), clock(e.timeUsedSec || 0), Math.round((e.coverageA || 0) * 100) + '/' + Math.round((e.coverageB || 0) * 100) + ' %', e.name || ''].map(function (c) { return dom.h('td', {}, String(c)); })); })));
      sui.list.appendChild(tx('div', kind === 'practice' ? 'Practice results' : 'Trade tests', null, { class: 'tr-sub' }));
      sui.list.appendChild(rows.length ? tbl : tx('div', 'no result yet', null, { class: 'tr-dim' }));
    };
    mk('trade'); mk('practice');
  }
  const scoreboardWin = winApi('scoreboard', 'Scoreboard', { x: 520, y: 140, w: 620 }, buildScoreboard, null);
  scoreboardWin.onRefresh = refreshScoreboard;

  // report window
  const rui = {};
  function buildReport() {
    rui.body = dom.h('div', { class: 'tr-report-body' });
    const meta = function (key, field) { return dom.field(t(key), { type: 'text', value: reportMeta[field], onchange: function (v) { reportMeta[field] = String(v || ''); refreshAll(); } }); };
    return dom.h('div', { class: 'tr' }, [
      dom.h('div', { class: 'tr-meta' }, [meta('Couplant', 'couplant'), meta('Surface condition', 'surface'), meta('Remarks', 'remarks')]),
      dom.h('div', { class: 'btn-row' }, [btn('Print report', function () { trade.printReport(); }, { class: 'btn primary' }), btn('Refresh', function () { refreshAll(); })]),
      rui.body,
    ]);
  }
  function refreshReport() { if (reportWin.isOpen() && rui.body) rui.body.innerHTML = trade.report({ withTruth: !!st().trade.revealed }); }
  const reportWin = winApi('report', 'Report', { x: 300, y: 80, w: 760 }, buildReport, null);
  reportWin.onRefresh = refreshReport;

  // practice window
  function buildPractice() {
    const tr = st().trade;
    pui.msg = dom.h('div', { class: 'tr-live tr-pmsg', 'aria-live': 'polite' }, '');
    const seedIn = dom.h('input', { type: 'number', class: 'tr-seedin', placeholder: t('seed') });
    const rowIn = dom.h('input', { type: 'number', class: 'tr-rowin', value: 1, min: 1, title: t('Row number') });
    const diffSel = difficultySelect(tr.difficulty, function (v) { configure({ difficulty: v }); });
    pui.diffSel = diffSel;
    return dom.h('div', { class: 'tr' }, [
      tx('div', 'Random practice: the trade-test generator without timer or lock. Hint costs 5 % of the practice score; Reveal one shows the nearest hidden defect (non-scoring); Check row confirms a detection only.', null, { class: 'tr-intro' }),
      dom.h('div', { class: 'tr-head' }, [btn('Start practice', function () { practice.start(seedIn.value === '' ? undefined : +seedIn.value); }, { class: 'btn primary' }), seedIn, diffSel]),
      dom.h('div', { class: 'btn-row' }, [btn('Hint', function () { practice.hint(); }), btn('Reveal one', function () { practice.revealOne(); }), rowIn, btn('Check row', function () { practice.checkRow((+rowIn.value || 1) - 1); }), btn('Reveal all', function () { trade.reveal(); }), btn('Submit', function () { trade.submit(rowsFromUi()); })]),
      pui.msg,
    ]);
  }
  const practiceWin = winApi('practice', 'Random practice', { x: 560, y: 60, w: 520 }, buildPractice, null);
  practiceWin.onRefresh = function () {
    if (!pui.diffSel) return;
    const tr = st().trade;
    pui.diffSel.disabled = running(tr);   // the difficulty applies to the next start (§4.2)
    const dv = running(tr) ? diffOf(tr) : (DIFF[tr.difficulty] ? tr.difficulty : pui.diffSel.value);
    if (pui.diffSel.value !== dv) pui.diffSel.value = dv;
  };

  function refreshAll() { tradeWin.refresh(); scoreboardWin.refresh(); reportWin.refresh(); practiceWin.refresh(); }
  Object.assign(practice, { open() { return practiceWin.open(); }, close() { return practiceWin.close(); }, toggle() { return practiceWin.toggle(); }, show() { return practiceWin.open(); }, hide() { return practiceWin.close(); }, isOpen() { return practiceWin.isOpen(); } });
  trade.report.open = function () { return reportWin.open(); }; trade.report.close = function () { return reportWin.close(); }; trade.report.toggle = function () { return reportWin.toggle(); };
  trade.report.show = trade.report.open; trade.report.hide = trade.report.close; trade.report.isOpen = function () { return reportWin.isOpen(); };

  // ------------------------------------------------------------------ bus listeners
  UT.bus.on('render', function () { const s = st(); if (s.trade && s.trade.active) { covRecord(s); usedProbesRecord(s); } });
  UT.bus.on('mode', function (ev) {
    if (!ev) return;
    if (ev.prev === 'trade' && ev.mode !== 'trade') {
      stopTimer();
      cov = null;
      const tr = st().trade;
      if (tr.practice || tr.hintsUsed || (tr.revealedOne && tr.revealedOne.length)) UT.setIn('trade', { practice: false, hintsUsed: 0, revealedOne: [] }, { noRender: true });
      if (!running()) applyPending();
      if (preTrade) {
        // v1 §15.8: the trade test keeps the user's weld specimen — put the pre-exam weldOpts / material back and
        // rebuild the specimen of the mode just entered (defects and probe kept). QA3 #2: preTrade survives to this
        // point only when NOTHING outside this module wrote weldOpts/material meanwhile (see the 'state' listener),
        // so the restore can never clobber a specimen a lesson/scenario just set up.
        const snap = preTrade;
        preTrade = null;
        selfSet = true;
        try { UT.set({ weldOpts: snap.weldOpts, material: snap.material }, { noRender: true }); } finally { selfSet = false; }
        if (has('modes.enter')) { try { UT.modes.enter(ev.mode, { keepProbe: true, silentUI: true, keepDefects: true }); } catch (e) { /* ignore */ } }
      }
      refreshAll();
    }
  });
  UT.bus.on('state', function (ev) {
    const keys = ev && ev.keys ? ev.keys : [];
    // QA3 #2 (§4.1): a weldOpts/material write from OUTSIDE this module (a lesson baseline, quiz, scenario apply,
    // the Weld dialog, applyProcedure) takes ownership of the specimen — drop the pre-trade snapshot so the
    // mode-exit restore cannot rebuild the previous specimen over it (lessons 20/25 after a trade test).
    if (preTrade && !selfSet && (keys.indexOf('weldOpts') >= 0 || keys.indexOf('material') >= 0)) preTrade = null;
    if (keys.indexOf('display') < 0 && keys.indexOf('trade') < 0) return;
    const s = st(), tr = s.trade;
    if (!tr) return;
    if (locked(tr) && !s.display.hide) { UT.setIn('display', { hide: true }); return; }
    if (tr.active && !tr.revealed && !tr.practice && diffOf(tr) === 'advanced' && s.mode === 'trade' && s.display.beam) UT.setIn('display', { beam: false });
  });
  UT.bus.on('lang', function () { tradeWin.relabel(); scoreboardWin.relabel(); reportWin.relabel(); practiceWin.relabel(); });

  // ------------------------------------------------------------------ CSS
  const css = [
    '.win[data-win=trade] .win-body,.win[data-win=scoreboard] .win-body,.win[data-win=report] .win-body,.win[data-win=practice] .win-body{padding:6px;background:#ececec;font-size:12px}',
    '.tr{display:flex;flex-direction:column;gap:6px;max-height:70vh;overflow:auto}',
    '.tr-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    '.tr-seedin{width:70px}.tr-time{width:52px}.tr-unit{color:#555}.tr-diff{font-size:11px}',
    '.tr-clock{font-family:monospace;font-weight:bold;color:#a00;margin-left:auto}',
    '.tr-seed{color:#555;font-size:11px}',
    '.tr-intro{font-size:11px;color:#333}',
    '.tr-exam-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:11px}',
    '.tr-name{width:150px}.tr-code{width:90px}',
    '.tr-scroll{overflow:auto;max-height:220px;background:#fff;border:1px solid #999}',
    '.tr-table{border-collapse:collapse;width:100%;background:#fff}',
    '.tr-table th,.tr-table td{border:1px solid #999;padding:2px 3px;font-size:11px;text-align:center;white-space:nowrap}',
    '.tr-n{width:30px}.tr-z,.tr-len,.tr-dep,.tr-h,.tr-db,.tr-ang{width:48px}.tr-type{width:96px}.tr-side{width:40px}.tr-disp{width:80px}.tr-del{padding:0 5px;font-size:10px}',
    '.tr-chk{width:14px;font-weight:bold}.tr-chk.ok{color:#080}.tr-chk.bad{color:#a00}',
    '.tr-live{min-height:14px;color:#0a246a;font-size:11px}',
    '.tr-score{font-size:15px;font-weight:bold;color:#0a246a}.tr-score.fail{color:#a00}',
    '.tr-cov{font-size:11px;color:#333}',
    '.tr-sub{font-weight:bold;margin-top:4px}',
    '.tr-truth{border-collapse:collapse;background:#fff}.tr-truth th,.tr-truth td{border:1px solid #999;padding:1px 6px;font-size:11px}',
    '.tr-dim{color:#888;font-style:italic}.tr-failrow td{color:#a00}',
    '.tr-miss{color:#a00;font-size:11px;margin-top:3px}',
    '.tr-tokenbox{display:flex;flex-direction:column;gap:2px}.tr-token{width:100%;box-sizing:border-box;font-family:monospace;font-size:10px}',
    '.tr-json{width:100%;box-sizing:border-box;font-family:monospace;font-size:10px}',
    '.tr-verify{display:flex;flex-direction:column;gap:4px}.tr-verify-out{font-size:11px;color:#0a246a;min-height:14px}',
    '.tr-sb-best div{font-size:11px}',
    '.tr-meta{display:flex;gap:6px;flex-wrap:wrap}.tr-meta .fld-input{width:140px}',
    '.tr-report-body{background:#fff;border:1px solid #999;padding:8px;max-height:52vh;overflow:auto}',
    '.tr-report{font-family:Arial,sans-serif;font-size:11px;color:#000}.tr-report h2{font-size:15px;margin:0 0 6px}.tr-report h3{font-size:12px;margin:8px 0 3px}',
    '.tr-report table{border-collapse:collapse;margin:2px 0}.tr-report th,.tr-report td{border:1px solid #666;padding:1px 5px;font-size:10px;text-align:left}',
    '.tr-report .tr-kv th{width:170px;background:#eee}.tr-report .false-call td{color:#a00}.tr-report .duplicate td{color:#777}.tr-report .tr-fail{color:#a00}',
    '.tr-report .tr-aut{max-width:100%}.tr-sign{margin-top:14px}',
    '#print-root .tr-report{font-size:12px}',
  ].join('\n');

  // ------------------------------------------------------------------ self test (headless)
  function __selftest() {
    const f = [];
    const near = function (a, b, tol) { return Math.abs(a - b) <= tol; };
    try {
      if (normType('lack of fusion') !== 'lof' || normType('incompletePenetration') !== 'root' || normType('Slag') !== 'slag' || normType('toeCrack') !== 'crack' || normType('x') !== '') f.push('normType');
      if (typePoints('planar', 'crack', 15) !== 15 || typePoints('lof', 'crack', 15) !== 7.5 || typePoints('porosity', 'crack', 15) !== 0 || typePoints('root', 'root', 15) !== 15) f.push('typePoints');
      const s0 = 'héllo 실기 {"a":1}';
      if (b64urlDecode(b64urlEncode(s0)) !== s0) f.push('base64url round trip');
      if (b64urlEncode('ab') !== 'YWI' || b64urlEncode('abc') !== 'YWJj') f.push('base64url ' + b64urlEncode('ab'));
      // token
      const res0 = { seed: 7, difficulty: 'advanced', score: 85, fail: false, timeUsedSec: 12, date: '2026-01-01T00:00:00.000Z', name: 'A' };
      const tok = tokenFor(res0, codeHashOf('', 7));
      const v = verifyResult(tok);
      if (!v.ok || v.score !== 85 || v.seed !== 7) f.push('verifyResult ' + JSON.stringify(v));
      const tampered = 'rt:' + b64urlEncode(JSON.stringify(Object.assign(JSON.parse(b64urlDecode(tok.slice(3))), { score: 100 })));
      if (verifyResult(tampered).ok) f.push('tampered token accepted');
      if (verifyResult('nope').ok || verifyResult(null).ok) f.push('garbage token');
      const tokC = tokenFor(res0, codeHashOf('1234', 7));
      if (verifyResult(tokC).ok || !verifyResult(tokC, '1234').ok || verifyResult(tokC, '9999').ok) f.push('token with code');
      if (verifyResult(tok, '1234').ok) f.push('empty-code token accepted with a code');
      const strip = stripResult({ misses: [{ n: 2, zFrom: 5, type: 'crack' }], detail: [{ row: {}, truth: { n: 1, zFrom: 1 }, hit: true }, { row: {}, truth: null, hit: false }] });
      if (Object.keys(strip.misses[0]).join() !== 'n' || Object.keys(strip.detail[0].truth).join() !== 'n' || strip.detail[1].truth !== null) f.push('stripResult');
      const hyd = hydrateResult(strip, [{ n: 1, zFrom: 1 }, { n: 2, zFrom: 5, type: 'crack' }]);
      if (hyd.misses[0].zFrom !== 5 || hyd.detail[0].truth.zFrom !== 1) f.push('hydrateResult');
      // pure scoring on a synthetic truth (plate, L 300)
      const truth = [
        { n: 1, zFrom: 20, zTo: 50, length: 30, depth: 17, yMin: 17, yMax: 21.5, height: 4.5, type: 'crack', recordable: true },
        { n: 2, zFrom: 100, zTo: 140, length: 40, depth: 8, yMin: 8, yMax: 12, height: 4, type: 'lof', recordable: true },
        { n: 3, zFrom: 200, zTo: 216, length: 16, depth: 9, yMin: 9, yMax: 13, height: 4, type: 'porosity', recordable: true },
        { n: 4, zFrom: 250, zTo: 270, length: 20, depth: 10, yMin: 10, yMax: 11, height: 1, type: 'slag', recordable: false },
      ];
      const rowsOf = function (fn) { return truth.filter(function (q) { return q.recordable; }).map(function (q) { return fn({ n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }); }); };
      DIFF_KEYS.forEach(function (d) {
        const o = { difficulty: d, L: 300, pipe: false };
        if (scoreReport(rowsOf(function (r) { return r; }), truth, o).score !== 100) f.push(d + ' truth rows != 100');
        if (scoreReport(rowsOf(function (r) { return Object.assign({}, r, { length: r.length * 2 }); }), truth, o).score !== 85) f.push(d + ' lengths x2 != 85: ' + scoreReport(rowsOf(function (r) { return Object.assign({}, r, { length: r.length * 2 }); }), truth, o).score);
        if (scoreReport(rowsOf(function (r) { return Object.assign({}, r, { length: r.length * 1.2 }); }), truth, o).score !== 100) f.push(d + ' lengths x1.2 != 100');
        if (scoreReport(rowsOf(function (r) { return r; }).concat([{ n: 9, z: 285, length: 10, depth: 5, type: 'crack' }]), truth, o).score !== 85) f.push(d + ' false call != 85');
        const one = scoreReport([{ z: 0, length: 300 }], truth, o);
        if (one.matched > 1 || one.score > Math.ceil(100 / 3)) f.push(d + ' spanning row ' + one.matched + '/' + one.score);
        const centre = scoreReport(rowsOf(function (r) { const q = truth.find(function (x) { return x.n === r.n; }); return Object.assign({}, r, { depth: (q.yMin + q.yMax) / 2 }); }), truth, o);
        if (centre.score !== 100) f.push(d + ' centre depth != 100');
        const miss = scoreReport(rowsOf(function (r) { return r; }).filter(function (r) { return r.n !== 1; }), truth, o);
        if (d === 'basic' ? miss.fail : !miss.fail) f.push(d + ' critical miss flag ' + miss.fail);
        const dup = scoreReport(rowsOf(function (r) { return r; }).concat([{ n: 5, z: 255, length: 10, depth: 10, type: 'slag' }]), truth, o);
        if (dup.score !== 100 || dup.duplicates !== 1) f.push(d + ' non-recordable row must not be a false call');
        const noH = scoreReport(rowsOf(function (r) { return Object.assign({}, r, { height: 9 }); }), truth, o);
        if (d === 'basic' ? noH.score !== 100 : noH.score >= 100) f.push(d + ' wrong height ' + noH.score);
      });
      const pipeRes = scoreReport([{ z: 520, length: 20, depth: 10, type: 'crack' }], [{ n: 1, zFrom: 0, zTo: 12, length: 12, depth: 10, yMin: 10, yMax: 14, height: 4, type: 'crack', recordable: true }], { difficulty: 'basic', L: 528, pipe: true });
      if (pipeRes.matched !== 1) f.push('pipe wrap matching');
      // generator determinism (pure part) on a fresh plate
      if (S && S.plateWeld) {
        const spec = S.plateWeld({ T: 20 });
        const g1 = drawDefects(M.rng(7), spec, 'advanced'), g2 = drawDefects(M.rng(7), spec, 'advanced');
        if (JSON.stringify(g1.truth) !== JSON.stringify(g2.truth)) f.push('generator not deterministic');
        if (g1.truth.length < 5 || g1.truth.length > 8) f.push('advanced count ' + g1.truth.length);
        if (!g1.truth.some(function (q) { return q.tiny; }) || !g1.truth.some(function (q) { return q.trap; })) f.push('advanced traps');
        const gb = drawDefects(M.rng(3), spec, 'basic');
        if (gb.truth.length !== 3 || gb.truth.some(function (q) { return q.height < 4 - 1e-9 || q.length < 25 || q.length > 45; })) f.push('basic table ' + JSON.stringify(gb.truth.map(function (q) { return [q.type, q.height, q.length]; })));
        for (let i = 1; i < gb.truth.length; i++) if (gb.truth[i].zFrom < gb.truth[i - 1].zTo) f.push('basic overlap');
        const ds = drawSpecimen(M.rng(11), 'advanced', UT.defaultState().weldOpts);
        if (!(ds.weldOpts.T >= 12 && ds.weldOpts.T <= 30) || DIFF.advanced.preps.indexOf(ds.weldOpts.prep) < 0 || !(ds.weldOpts.transferLossDb >= 0 && ds.weldOpts.transferLossDb <= 6)) f.push('drawSpecimen ' + JSON.stringify(ds.weldOpts));
        if (drawSpecimen(M.rng(5), 'basic').weldOpts.T !== 20) f.push('basic plate 20');
        // the draw never inherits the current weldOpts (exam URL = seed only)
        const dl = drawSpecimen(M.rng(11), 'advanced', Object.assign({}, UT.defaultState().weldOpts, { L: 420, webT: 99 }));
        if (dl.weldOpts.L !== 300 || dl.weldOpts.webT === 99 || JSON.stringify(dl.weldOpts) !== JSON.stringify(ds.weldOpts)) f.push('drawSpecimen inherits weldOpts');
        const dp = drawSpecimen(M.rng(5), 'basic', null, { pipe: true, od: 168.3, wt: 20 });
        if (dp.weldOpts.pipe !== true || dp.weldOpts.od !== 168.3 || dp.weldOpts.wt !== 20 || dp.weldOpts.T !== 20) f.push('procedure specimen');
      }
      // coverage buffer
      covReset({ L: 300, T: 20, pipe: null, weld: { capWidth: 16 } });
      const fake = { trade: { active: true }, specimen: { kind: 'weld' }, probe: { angle: 60, side: 1, x: 8 + 20 * Math.tan(M.deg2rad(60)), z: 0, surface: 'chord', method: 'pe' } };
      for (let z = 0; z <= 300; z += 10) { fake.probe.z = z; covRecord(fake); }
      const c = coverage();
      if (!(c.sideA >= 0.95) || c.sideB !== 0 || !(c.perAngle[60].sideA >= 0.95) || c.map.length !== 60) f.push('coverage ' + JSON.stringify([c.sideA, c.sideB]));
      fake.probe.x = 200; fake.probe.z = 150; lastCovKey = ''; covRecord(fake);
      if (coverageMap().sides[1][30] !== 1) f.push('coverage keeps bins');
      cov = null;
      if (configure({ difficulty: 'nope' }) !== false) f.push('configure bad difficulty');
      // seed mixing: neighbouring seeds must not share the first draw (pipe/plate) in lock-step
      let pipes = 0;
      for (let sd = 1; sd <= 40; sd++) if (tradeRng(sd)() < 0.4) pipes++;
      if (pipes < 8 || pipes > 24 || tradeRng(3)() !== tradeRng(3)()) f.push('seed mixing ' + pipes);
      if (configure({ probes: ['not-a-probe'] }) !== false) f.push('configure bad probe');
    } catch (e) { f.push('exception ' + (e && e.stack || e)); }
    // live pipeline (state snapshot / restore like 80-modes)
    if (has('modes.enter') && has('rays.trace') && has('ascan.ampPctOf')) {
      const saved = Object.assign({}, UT.state);
      const savedCfg = Object.assign({}, cfg);
      quiet = true;
      try {
        configure({ difficulty: 'basic', timeLimitMin: 0.05 });
        const t1 = trade.start(7), t2 = trade.start(7);
        if (JSON.stringify(t1) !== JSON.stringify(t2) || !t1.length) f.push('start(7) not deterministic');
        if (!t1.every(function (q) { return typeof q.recordable === 'boolean' && Number.isFinite(q.bestDb); })) f.push('recordability fields');
        if (st().mode !== 'trade' || !st().trade.active || !st().display.hide) f.push('trade mode state');
        const rows = trade.truth().map(function (q) { return { n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }; });
        if (trade.submit(rows) !== 100) f.push('live truth rows score ' + st().trade.score);
        if (!st().trade.result || !st().trade.result.token || !verifyResult(st().trade.result.token).ok) f.push('live token');
        if (!st().trade.history.length || st().trade.history[st().trade.history.length - 1].score !== 100) f.push('history entry');
        if (trade.report({ withTruth: true }).indexOf('SCORE') < 0 || trade.report({ withTruth: false }).indexOf('True defects') >= 0) f.push('report html');
        trade.start(8);
        if (tick(4) !== 0 || st().trade.revealed !== true || st().trade.score === null) f.push('tick auto-submit');
        // locked exam: verifyResult needs the exam code, the result carries no truth rows until reveal(code)
        trade.loadExam(trade.makeExam({ seed: 9, code: 'abcd', revealOnSubmit: false }));
        trade.submit([]);
        const lockedRes = st().trade.result;
        if (!lockedRes || !st().trade.active || (lockedRes.misses || []).some(function (m) { return 'zFrom' in m; }) || (lockedRes.detail || []).some(function (d) { return d.truth && 'zFrom' in d.truth; })) f.push('locked result carries truth');
        if (verifyResult(lockedRes.token).ok !== true || verifyResult(lockedRes.token, 'zzzz').ok || verifyResult(tokenFor(lockedRes, codeHashOf('', 9)), 'abcd').ok || verifyResult(tokenFor(lockedRes, codeHashOf('', 9))).ok) f.push('exam token verification');
        // QA3 #1: a locked exam takes ONE submission — further submits return the stored score without re-scoring
        const h9 = (st().trade.history || []).length, s9 = st().trade.score;
        if (trade.submit([{ z: 10, length: 30, depth: 5, type: 'crack' }]) !== s9 || st().trade.score !== s9 ||
          (st().trade.history || []).length !== h9 || st().trade.result.token !== lockedRes.token) f.push('locked exam resubmit oracle');
        if (!trade.reveal('abcd') || st().trade.active || !(st().trade.result.misses || []).every(function (m) { return 'zFrom' in m; })) f.push('reveal hydrates the result');
        // nameRequired exam waits for a name
        UT.setIn('trade', { candidate: '' }, { noRender: true });
        if (trade.loadExam(trade.makeExam({ seed: 10, code: 'abcd', nameRequired: true })) !== null || st().trade.startedAt || (st().trade.truth || []).length) f.push('nameRequired gate');
        trade.setCandidate('A'); trade.start(10);
        if (!st().trade.exam || !st().trade.startedAt) f.push('nameRequired start');
        // QA3 #6: a hint with nothing left to reveal is free; one with a hidden defect costs 5 %
        if (!ui.rows) {
          practice.start(3);
          UT.setIn('trade', { report: trade.truth().map(function (q) { return { n: q.n, z: q.zFrom, length: q.zTo - q.zFrom, depth: q.depth, type: q.type }; }) }, { noRender: true });
          practice.hint();
          if (st().trade.hintsUsed !== 0) f.push('empty hint charged');
          UT.setIn('trade', { report: [] }, { noRender: true });
          practice.hint();
          if (st().trade.hintsUsed !== 1) f.push('hint not charged');
        }
        const drawn = JSON.stringify(st().weldOpts);
        UT.modes.enter('weld', { silentUI: true });
        if (st().trade.active) f.push('inactive after exit');
        if (JSON.stringify(st().weldOpts) !== JSON.stringify(saved.weldOpts) || st().material !== saved.material || preTrade) f.push('weldOpts restored after trade ' + drawn);
        // QA3 #2: an external weldOpts write (a lesson baseline) after a trade start must survive the restore
        trade.start(11);
        UT.set({ weldOpts: Object.assign({}, UT.defaultState().weldOpts, { T: 33 }) }, { noRender: true });
        UT.modes.enter('weld', { silentUI: true });
        if (st().weldOpts.T !== 33 || preTrade) f.push('lesson weldOpts clobbered by preTrade restore');
      } catch (e) { f.push('live exception ' + (e && e.message)); }
      finally {
        quiet = false;
        stopTimer();
        cov = null;
        preTrade = null;
        Object.assign(cfg, savedCfg);
        const modeBefore = st().mode;
        const patch = {};
        Object.keys(saved).forEach(function (k) { if (k !== 'status' && k !== 'cursor' && UT.state[k] !== saved[k]) patch[k] = saved[k]; });
        if (Object.keys(patch).length) UT.set(patch);
        if (modeBefore !== saved.mode) UT.bus.emit('mode', { mode: saved.mode, prev: modeBefore });
      }
    }
    return f;
  }

  Object.assign(trade, {
    practice, window: tradeWin, scoreboard: scoreboardWin, reportWindow: reportWin, practiceWindow: practiceWin,
    open() { return tradeWin.open(); }, close() { return tradeWin.close(); }, toggle() { return tradeWin.toggle(); }, isOpen() { return tradeWin.isOpen(); },
    css, normType, drawDefects, drawSpecimen, recordability, tradeRng, PASS_MARK, __selftest,
  });
  UT.trade = trade;

  // ------------------------------------------------------------------ test API (extends 80's shell)
  if (!UT.test.trade) UT.test.trade = { start(seed) { return trade.start(seed); }, truth() { return trade.truth(); }, submit(rows) { return trade.submit(rows); } };
  Object.assign(UT.test.trade, {
    configure, history: trade.history, report: trade.report, coverage, tick, reveal: trade.reveal, verifyResult, addRowFromReadout: trade.addRowFromReadout, practice,
    newTest: trade.newTest, makeExam: trade.makeExam, loadExam: trade.loadExam, result() { return UT.clone(st().trade.result); },
  });
})(window.UT = window.UT || {});
