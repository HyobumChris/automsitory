/* 94-scenario.js — U3 scenarios (SPEC-v2 §5.5): capture/apply of a complete teaching set-up, 5 localStorage
 * slots, JSON text import/export, share-by-URL (`#scn=z:…` deflate-raw + base64url, `r:` raw fallback) including
 * seed-only exam sharing (§4.2.3) and teaching metadata (title / notes / author), windows 'scenario' and 'share'.
 * Classic script; no DOM / browser globals at load time (SPEC §15.12). CompressionStream / TextEncoder / btoa /
 * atob / location are referenced only inside functions and every one of them has a local fallback.
 */
// SPEC NOTES (decisions where SPEC-v2 is silent or ambiguous)
// - Scenario object (§5.5) additionally carries `utSet` (instrument skin) and `physics` (mode conversion / surface
//   wave / side lobes / fanRays) because both change what a shared set-up shows; both are optional on apply.
//   `instrument.freeze`, `tofd.running`, `aut.running` and `aut.map` are omitted as well (a frozen / running scan
//   must not be shared), `instrument.compare/datalog` and every scan are never captured (§2).
// - `display` subset = beam, skips, colourCode, singleLine, hide, plan, pipe3d, mirror, units, legend, grid,
//   convRays, autoTrig (device preferences sound / touchBar / highContrast / scale stay local). `hide` is applied
//   only outside exams (an exam forces hide via UT.trade.start).
// - `specimenOpts` is derived from the live specimen (v1/v2: face; tky: braceAngle/braceT/chordT/braceOffset;
//   dac/fbh: T; lamination: T/L; weld modes: none — weldOpts is authoritative). A non-exam capture taken inside a
//   running trade test / practice is stored as mode 'weld' (the hidden truth IS exported, exactly like
//   UT.test.state() outside an exam lock); an exam-locked capture keeps mode 'trade' + `exam` and omits `defects`.
// - apply(): base patch (material, weldOpts, physics, utSet, probe, instrument, display, standards, pa, tofd, aut,
//   scenario metadata) with {noRender}, then UT.modes.enter(mode, {specimenOpts, keepProbe:true}) (unknown /
//   missing mode or a transitional 80 without it → 'weld'; no UT.modes → UT.specimens.build), then the captured
//   probe (clamped to the new scan surface) and instrument are re-applied because enter() adjusts both for tofd/
//   step, then defects via UT.specimens.normaliseDefects, then UT.lessons.start(n) + goto(step), then renderNow()
//   and the toast. Exams: UT.trade.loadExam(exam) (fallback: state.trade.exam + UT.test.trade.start(seed)); the
//   apply never enters 'trade' itself. All values are coerced onto UT.defaultState() shapes (unknown keys dropped,
//   NaN / out-of-range → default / clamped) so a hand-edited JSON cannot poison the state.
// - Slots: localStorage keys 'utsim.scenario.<1..5>' = {v:2, slot, name, title, savedAt, obj}; list() always returns
//   5 rows ({slot, empty, name, title, savedAt}). state.scenario.slot/name follow save()/load().
// - toUrl(): base = location.href.split('#')[0] ('' headless); 'z:' only when CompressionStream exists AND the
//   deflate succeeds, else 'r:'. Exam links: opts.exam = {code, title, nameRequired, revealOnSubmit (default false),
//   timeLimitMin, difficulty, seed, procedureId}; seed defaults to the running trade seed, else random; the exam
//   descriptor comes from UT.trade.makeExam (local replica when 84 is absent: codeHash = fnv1a(code + ':' + seed)
//   hex); the link object gets mode 'trade', no `defects`, no lesson.
// - fromUrl() accepts '#scn=…', 'scn=…' or a full URL, both encodings, and returns null on ANY error (bad base64,
//   inflate failure, JSON error, non-object, v other than 2 / undefined).
// - Boot: 90 calls UT.scenario.init() (hashchange listener, idempotent) and applyFromLocation(). As a safety net
//   94 also arms itself on the FIRST 'render' event via setTimeout(0) (never UT.set inside the render listener);
//   the same hash is applied at most once (`appliedHash`), so 90 and the safety net cannot double-apply.
// - The toast (#scn-toast inside #app) shows title (or name / 'Scenario loaded'), the note in the current language
//   and the author for 8 s; UT.scenario.lastToast records it for tests.
(function (UT) {
  'use strict';
  const M = UT.math;
  const dom = UT.dom;
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  function st() { return UT.state; }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }
  const clone = UT.clone;
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max || 200) : (typeof v === 'number' && Number.isFinite(v) ? String(v) : ''); }

  // ------------------------------------------------------------------ constants
  const SLOTS = 5;
  const SLOT_KEY = 'utsim.scenario.';
  const NOTE_MAX = 400;
  const TOAST_MS = 8000;
  const MODES = ['weld', 'v1', 'v2', 'step', 'iow', 'dac', 'tky', 'tofd', 'aut', 'trade', 'lamination', 'fbh'];
  const SPEC_MODE = { 'plate-weld': 'weld', 'pipe-weld': 'weld', v1: 'v1', v2: 'v2', step: 'step', iow: 'iow', dac: 'dac', fbh: 'fbh', tky: 'tky', 'lamination-plate': 'lamination' };
  const MODE_SPEC = { weld: 'plate-weld', tofd: 'plate-weld', aut: 'plate-weld', trade: 'plate-weld', v1: 'v1', v2: 'v2', step: 'step', iow: 'iow', dac: 'dac', fbh: 'fbh', tky: 'tky', lamination: 'lamination-plate' };
  const DISPLAY_KEYS = ['beam', 'skips', 'colourCode', 'singleLine', 'hide', 'plan', 'pipe3d', 'mirror', 'units', 'legend', 'grid', 'convRays', 'autoTrig'];
  const UT_SETS = ['epoch600', 'epoch4', 'usk7'];
  const DIFFICULTIES = ['basic', 'intermediate', 'advanced'];
  const RANGES = {
    probe: { angle: [0, 89.9], freq: [0.5, 20], diameter: [1, 50], wedgeVel: [1, 6], x: [-3000, 3000], z: [-5000, 5000], skew: [-360, 360], paFrom: [0, 89.9], paTo: [0, 89.9], paStep: [0.1, 10],
      crystalDims: { a: [1, 50], b: [1, 50] }, focus: { F: [1, 1000] } },
    instrument: { gain: [0, 110], refGain: [0, 110], range: [10, 1000], delay: [-50, 1000], reject: [0, 80], activeGate: [0, 5], page: [1, 5], autoPct: [1, 100],
      gates: { start: [-50, 1000], width: [0, 1000], level: [0, 100] }, cal: { zero: [-50, 50] }, trig: { angle: [0, 89.9], thick: [1, 1000], xValue: [-3000, 3000] },
      pulser: { energy: [100, 400], damping: [50, 400], prf: [1, 5000] } },
    weldOpts: { T: [3, 100], L: [50, 2000], bevel: [0, 60], rootGap: [0, 10], rootFace: [0, 10], capWidth: [0, 60], capHeight: [0, 10], rootHeight: [0, 10], od: [25, 2000], wt: [3, 100], webT: [1, 100], branchOd: [10, 2000], transferLossDb: [0, 8] },
    display: { skips: [1, 12] },
    tofd: { pcs: [5, 500], txAngle: [30, 80], rangeUs: [1, 500], delayUs: [-50, 500], gainDb: [0, 110] },
    aut: { x: [-3000, 3000], channels: [1, 6], speed: [1, 200], activeGate: [0, 5], gates: { start: [-50, 1000], width: [0, 1000], level: [0, 100] } },
    pa: { elements: [1, 128], pitch: [0.1, 10], freq: [0.5, 20], from: [0, 89.9], to: [0, 89.9], step: [0.1, 10], escanAngle: [0, 89.9] },
    physics: { fanRays: [21, 41] },
    standards: { transferDb: [-20, 20], technique: [1, 4] },
  };
  const ENUMS = {
    probe: { mode: ['shear', 'comp'], crystal: ['single', 'twin'], method: ['pe', 'tt', 'tandem', 'pa'], surface: ['chord', 'brace'] },
    instrument: { rectify: ['full', 'rf', 'pos', 'neg'], readout: ['sp', 'sd', 'dp', 'amp'], receiver: { filter: ['broadband', '0.2-10', '1.5-8.5', '5-15'] } },
    weldOpts: { type: ['single-v', 'double-v', 'none', 'fillet'], weldMaterial: ['same', 'austenitic'] },
    display: { units: ['mm', 'inch'], colourCode: ['none', 'propagation', 'geometry'] },
    pa: { view: ['S', 'E', 'C'] },
    tofd: {},
    aut: {},
    physics: {},
    standards: {},
  };

  // ------------------------------------------------------------------ bytes / base64url / utf-8 (local fallbacks)
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64EncodeLocal(bin) {
    let out = '';
    for (let i = 0; i < bin.length; i += 3) {
      const a = bin.charCodeAt(i), b = i + 1 < bin.length ? bin.charCodeAt(i + 1) : NaN, c = i + 2 < bin.length ? bin.charCodeAt(i + 2) : NaN;
      const n = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (Number.isNaN(b) ? '=' : B64[(n >> 6) & 63]) + (Number.isNaN(c) ? '=' : B64[n & 63]);
    }
    return out;
  }
  function b64DecodeLocal(s) {
    let out = '';
    let buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '=') break;
      const v = B64.indexOf(ch);
      if (v < 0) throw new Error('bad base64');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 255); buf &= (1 << bits) - 1; }
    }
    return out;
  }
  function bytesToBin(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x2000) bin += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + 0x2000));
    return bin;
  }
  function binToBytes(bin) {
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 255;
    return out;
  }
  /** Uint8Array → base64url (no padding). */
  function b64url(bytes) {
    const bin = bytesToBin(bytes);
    const b64 = typeof btoa === 'function' ? btoa(bin) : b64EncodeLocal(bin);
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  /** base64url (with or without padding) → Uint8Array; throws on malformed input. */
  function b64urlDecode(s) {
    let b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/]*=*$/.test(b64)) throw new Error('bad base64url');
    while (b64.length % 4) b64 += '=';
    const bin = typeof atob === 'function' ? atob(b64) : b64DecodeLocal(b64);
    return binToBytes(bin);
  }
  /** string → UTF-8 bytes (TextEncoder when available). */
  function utf8Encode(s) {
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(s);
    const out = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return new Uint8Array(out);
  }
  /** UTF-8 bytes → string (TextDecoder when available). */
  function utf8Decode(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8').decode(bytes);
    let s = '';
    for (let i = 0; i < bytes.length;) {
      const b = bytes[i++];
      let c;
      if (b < 0x80) c = b;
      else if ((b & 0xe0) === 0xc0) c = ((b & 31) << 6) | (bytes[i++] & 63);
      else if ((b & 0xf0) === 0xe0) { c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6); c |= bytes[i++] & 63; }
      else { c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12); c |= (bytes[i++] & 63) << 6; c |= bytes[i++] & 63; }
      if (c >= 0x10000) { c -= 0x10000; s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff)); } else s += String.fromCharCode(c);
    }
    return s;
  }
  function concatChunks(chunks) {
    let n = 0;
    for (const c of chunks) n += c.length;
    const out = new Uint8Array(n);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
  async function pumpStream(stream, bytes) {
    const writer = stream.writable.getWriter();
    const reader = stream.readable.getReader();
    // The write/close chain is observed unconditionally: when the (de)compressor rejects (corrupt 'z:' data) the read
    // loop throws first and the caller's try/catch swallows it — an un-observed `written` rejection would otherwise
    // surface as an unhandled promise rejection (page error) although fromUrl() correctly returns null (§5.5).
    const written = writer.write(bytes).then(function () { return writer.close(); });
    written.catch(function () { /* reported through the read side */ });
    const chunks = [];
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        chunks.push(r.value instanceof Uint8Array ? r.value : new Uint8Array(r.value));
      }
    } finally {
      try { reader.releaseLock(); } catch (e) { /* ignore */ }
    }
    await written;
    return concatChunks(chunks);
  }
  async function deflateRaw(bytes) { return pumpStream(new CompressionStream('deflate-raw'), bytes); }
  async function inflateRaw(bytes) { return pumpStream(new DecompressionStream('deflate-raw'), bytes); }

  // ------------------------------------------------------------------ coercion onto the default state shapes
  function isRange(r) { return Array.isArray(r) && r.length === 2 && typeof r[0] === 'number'; }
  /**
   * Coerce `src` onto the shape of `def`: booleans → !!, numbers → finite (clamped by ranges[k]), strings → enum-checked,
   * null defaults accept null | number | string | object, arrays of objects are coerced element-wise to def's length,
   * other arrays are cloned (≤ 400 entries), unknown keys are dropped.
   */
  function coerce(def, src, ranges, enums) {
    const out = {};
    const s = src && typeof src === 'object' && !Array.isArray(src) ? src : {};
    const R = ranges && typeof ranges === 'object' ? ranges : {};
    const E = enums && typeof enums === 'object' ? enums : {};
    for (const k of Object.keys(def)) {
      const d = def[k], v = s[k];
      if (typeof d === 'boolean') out[k] = v === undefined ? d : !!v;
      else if (typeof d === 'number') {
        const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
        out[k] = typeof n === 'number' && Number.isFinite(n) ? (isRange(R[k]) ? M.clamp(n, R[k][0], R[k][1]) : n) : d;
      } else if (typeof d === 'string') out[k] = typeof v === 'string' && (!Array.isArray(E[k]) || E[k].indexOf(v) >= 0) ? v.slice(0, 200) : d;
      else if (d === null) out[k] = v === undefined || typeof v === 'boolean' || typeof v === 'function' ? null : (typeof v === 'number' && !Number.isFinite(v) ? null : clone(v));
      else if (Array.isArray(d)) {
        if (!Array.isArray(v)) out[k] = clone(d);
        else if (d.length && d[0] && typeof d[0] === 'object') out[k] = d.map(function (dd, i) { return coerce(dd, v[i], isRange(R[k]) ? null : R[k], E[k]); });
        else out[k] = clone(v.filter(function (x) { return typeof x !== 'function' && x !== undefined; }).slice(0, 400));
      } else if (typeof d === 'object') out[k] = coerce(d, v, isRange(R[k]) ? null : R[k], E[k]);
    }
    return out;
  }
  function omit(obj, keys) {
    const o = Object.assign({}, obj || {});
    for (const k of keys) delete o[k];
    return o;
  }
  function pick(obj, keys) {
    const o = {};
    for (const k of keys) if (obj && obj[k] !== undefined) o[k] = obj[k];
    return o;
  }
  function isLocked(tr) { return !!(tr && tr.exam && tr.exam.locked && !tr.revealed); }

  /** Options that rebuild the current block specimen (weld modes rely on weldOpts). */
  function specimenOptsOf(spec) {
    if (!spec) return null;
    switch (spec.id) {
      case 'v1': case 'v2': return spec.face ? { face: spec.face } : null;
      case 'tky': return spec.tky ? pick(spec.tky, ['braceAngle', 'braceT', 'chordT', 'braceOffset']) : null;
      case 'dac': case 'fbh': return Number.isFinite(spec.T) ? { T: spec.T } : null;
      case 'lamination-plate': return { T: spec.T, L: spec.L };
      default: return null;
    }
  }
  /** Sanitised specimenOpts: finite numbers and the 'face' string only. */
  function cleanSpecimenOpts(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return undefined;
    const out = {};
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
      else if (k === 'face' && (v === 'wide' || v === 'narrow')) out[k] = v;
    }
    return Object.keys(out).length ? out : undefined;
  }

  // ------------------------------------------------------------------ capture
  /**
   * Scenario object from a state (pure; no scans, no compare/datalog, no defects while an exam is locked).
   * @param {object} s  a UT.state-shaped object
   */
  function captureFrom(s) {
    const tr = s.trade || {};
    const locked = isLocked(tr);
    const sc = s.scenario || {};
    const spec = s.specimen;
    let mode = MODES.indexOf(s.mode) >= 0 ? s.mode : 'weld';
    if (mode === 'trade' && !locked) mode = 'weld';
    const ls = s.lessons || {};
    const obj = {
      v: 2,
      name: str(sc.name, 80), title: str(sc.title, 120), noteKo: str(sc.noteKo, NOTE_MAX), noteEn: str(sc.noteEn, NOTE_MAX), author: str(sc.author, 80),
      lesson: Number.isInteger(ls.active) ? ls.active : null,
      lessonStep: Number.isInteger(ls.step) ? ls.step : 0,
      material: typeof s.material === 'string' ? s.material : 'carbon',
      utSet: UT_SETS.indexOf(s.utSet) >= 0 ? s.utSet : 'epoch600',
      weldOpts: clone(s.weldOpts || {}),
      physics: clone(s.physics || {}),
      mode,
      specimenId: spec && typeof spec.id === 'string' ? spec.id : (MODE_SPEC[mode] || null),
      specimenOpts: mode === 'trade' ? null : specimenOptsOf(spec),
      probe: clone(s.probe || {}),
      instrument: omit(s.instrument, ['compare', 'datalog', 'freeze']),
      display: pick(s.display, DISPLAY_KEYS),
      standards: omit(s.standards, ['lastEval']),
      pa: omit(s.pa, ['scan']),
      tofd: omit(s.tofd, ['scan', 'running']),
      aut: omit(s.aut, ['scan', 'map', 'running']),
      exam: locked ? clone(tr.exam) : null,
    };
    if (!locked) obj.defects = clone(Array.isArray(s.defects) ? s.defects : []);
    return clone(obj);
  }
  /** Capture the current set-up (§5.5 object). Never scans / compare / datalog; no defects while exam-locked. */
  function capture() { return captureFrom(st()); }

  /** Validate + coerce a scenario object (any JSON) onto the state shapes; unknown/invalid values fall back. */
  function sanitise(obj) {
    const def = UT.defaultState();
    const o = obj && typeof obj === 'object' ? obj : {};
    const mats = has('specimens.materials');
    const out = {
      v: 2,
      name: str(o.name, 80), title: str(o.title, 120), noteKo: str(o.noteKo, NOTE_MAX), noteEn: str(o.noteEn, NOTE_MAX), author: str(o.author, 80),
      lesson: Number.isInteger(o.lesson) && o.lesson >= 1 && o.lesson <= 99 ? o.lesson : null,
      lessonStep: Number.isInteger(o.lessonStep) && o.lessonStep >= 0 && o.lessonStep < 1000 ? o.lessonStep : 0,
      material: typeof o.material === 'string' && (!mats || mats[o.material]) ? o.material : def.material,
      utSet: UT_SETS.indexOf(o.utSet) >= 0 ? o.utSet : undefined,
      mode: MODES.indexOf(o.mode) >= 0 ? o.mode : 'weld',
      specimenId: typeof o.specimenId === 'string' && SPEC_MODE[o.specimenId] ? o.specimenId : null,
      specimenOpts: cleanSpecimenOpts(o.specimenOpts),
      exam: o.exam && typeof o.exam === 'object' && Number.isFinite(Number(o.exam.seed)) ? clone(o.exam) : null,
    };
    if (o.weldOpts && typeof o.weldOpts === 'object') {
      const preps = has('specimens.preps');
      const w = coerce(def.weldOpts, o.weldOpts, RANGES.weldOpts, ENUMS.weldOpts);
      if (o.weldOpts.prep === undefined && typeof o.weldOpts.type === 'string') w.prep = o.weldOpts.type;   // v1 record: prep = type
      if (Array.isArray(preps) && preps.length && preps.indexOf(w.prep) < 0) w.prep = def.weldOpts.prep;
      if (w.pipe && Number.isFinite(w.od) && Number.isFinite(w.wt)) w.wt = Math.min(w.wt, Math.max(3, w.od / 2 - 1));
      out.weldOpts = w;
    }
    if (o.physics && typeof o.physics === 'object') { out.physics = coerce(def.physics, o.physics, RANGES.physics); if (out.physics.fanRays !== 21) out.physics.fanRays = 41; }
    if (o.probe && typeof o.probe === 'object') {
      const p = coerce(def.probe, o.probe, RANGES.probe, ENUMS.probe);
      p.side = Number(o.probe.side) < 0 ? -1 : 1;
      if (p.angle === 0) p.mode = 'comp';
      out.probe = p;
    }
    if (o.instrument && typeof o.instrument === 'object') {
      const ins = coerce(omit(def.instrument, ['compare', 'datalog', 'freeze']), o.instrument, RANGES.instrument, ENUMS.instrument);
      ins.dac.points = ins.dac.points.filter(function (q) { return q && typeof q === 'object' && Number.isFinite(q.path) && Number.isFinite(q.ampPct); })
        .map(function (q) { return { path: q.path, ampPct: q.ampPct }; }).slice(0, 64);
      if (ins.dac.refDb !== null && !(typeof ins.dac.refDb === 'number')) ins.dac.refDb = null;
      if (ins.cal.vel !== null && !(typeof ins.cal.vel === 'number' && ins.cal.vel >= 1 && ins.cal.vel <= 10)) ins.cal.vel = null;
      out.instrument = ins;
    }
    if (o.display && typeof o.display === 'object') out.display = pick(coerce(def.display, o.display, RANGES.display, ENUMS.display), DISPLAY_KEYS.filter(function (k) { return o.display[k] !== undefined; }));
    if (o.standards && typeof o.standards === 'object') {
      const sd = coerce(omit(def.standards, ['lastEval']), o.standards, RANGES.standards, ENUMS.standards);
      if (sd.rulesOverride !== null && typeof sd.rulesOverride !== 'object') sd.rulesOverride = null;
      if (sd.procedure !== null && typeof sd.procedure !== 'string') sd.procedure = null;
      out.standards = sd;
    }
    if (o.pa && typeof o.pa === 'object') { const pa = coerce(omit(def.pa, ['scan']), o.pa, RANGES.pa, ENUMS.pa); if (pa.focusDepth !== null && typeof pa.focusDepth !== 'number') pa.focusDepth = null; out.pa = pa; }
    if (o.tofd && typeof o.tofd === 'object') out.tofd = coerce(omit(def.tofd, ['scan', 'running']), o.tofd, RANGES.tofd, ENUMS.tofd);
    if (o.aut && typeof o.aut === 'object') out.aut = coerce(omit(def.aut, ['scan', 'map', 'running']), o.aut, RANGES.aut, ENUMS.aut);
    if (Array.isArray(o.defects)) out.defects = o.defects.slice(0, 16);
    return out;
  }
  function clampProbeTo(p, spec) {
    const q = Object.assign({}, p);
    if (!spec) return q;
    const ss = spec.scanSurface || spec.extents;
    if (ss && !(q.surface === 'brace' && spec.tky)) q.x = M.clamp(q.x, ss.xMin, ss.xMax);
    if (Number.isFinite(spec.L) && spec.L > 0) q.z = spec.pipe ? ((q.z % spec.L) + spec.L) % spec.L : M.clamp(q.z, 0, spec.L);
    return q;
  }

  // ------------------------------------------------------------------ apply
  function enterMode(mode, specimenOpts, silentUI) {
    const opts = { keepProbe: true, silentUI: !!silentUI };
    if (specimenOpts) opts.specimenOpts = specimenOpts;
    if (has('modes.enter')) {
      try { UT.modes.enter(mode, opts); return true; } catch (e) { console.warn('[UT.scenario] enter(' + mode + ') failed, falling back to weld', e); }
      try { UT.modes.enter('weld', { keepProbe: true, silentUI: !!silentUI }); return true; } catch (e) { console.warn('[UT.scenario] enter(weld) failed', e); }
    }
    if (has('specimens.build')) {
      const s = st();
      const id = MODE_SPEC[mode] || 'plate-weld';
      const o = id === 'plate-weld' || id === 'pipe-weld' ? Object.assign({}, s.weldOpts, { material: s.material }) : Object.assign({ material: s.material }, specimenOpts || {});
      let spec = null;
      try { spec = UT.specimens.build(s.weldOpts && s.weldOpts.pipe && id === 'plate-weld' ? 'pipe-weld' : id, o); } catch (e) { spec = null; }
      if (spec) UT.set({ mode, specimen: spec, probe: clampProbeTo(s.probe, spec) }, { noRender: true });
      return !!spec;
    }
    return false;
  }
  /**
   * Load an exam through UT.trade.loadExam (fallback: state.trade.exam + start(seed)).
   * @returns {boolean} true when the exam has started; false when it is pending (nameRequired without a candidate
   *   name: loadExam returns null, the trade window opens and the Start button gates the timer)
   */
  function applyExam(exam) {
    const ex = Object.assign({}, exam, { seed: Number(exam.seed) >>> 0, locked: true });
    let started = false;
    if (has('trade.loadExam')) { started = UT.trade.loadExam(ex) !== null; }
    else {
      UT.setIn('trade', { exam: ex, revealed: false }, { noRender: true });
      const start = has('trade.start') || has('test.trade.start');
      if (start) { start(ex.seed); started = !!st().trade.startedAt; }
    }
    UT.setIn('display', { hide: true }, { noRender: true });
    return started;
  }
  /**
   * Apply a scenario object: rebuilds the specimen through UT.modes.enter, restores probe/instrument/display/
   * standards/pa/tofd/aut/defects and the lesson; exams are started from their seed (no defects in the object).
   * @param {object} obj  scenario object (capture()/fromText()/fromUrl())
   * @param {{silentUI?:boolean, toast?:boolean}} [opts]
   * @returns {boolean} true when applied
   */
  function apply(obj, opts) {
    const o = opts || {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const sc = sanitise(obj);
    const s0 = st();
    if (has('lessons.stop') && s0.lessons && s0.lessons.active !== null && s0.lessons.active !== undefined) { try { UT.lessons.stop(); } catch (e) { /* ignore */ } }
    const s = st();
    const base = { scenario: Object.assign({}, s.scenario, { name: sc.name, title: sc.title, noteKo: sc.noteKo, noteEn: sc.noteEn, author: sc.author }), material: sc.material };
    if (sc.utSet) base.utSet = sc.utSet;
    if (sc.weldOpts) base.weldOpts = sc.weldOpts;
    if (sc.physics) base.physics = sc.physics;
    if (sc.probe) base.probe = Object.assign({}, s.probe, sc.probe);
    if (sc.instrument) base.instrument = Object.assign({}, s.instrument, sc.instrument, { compare: null, datalog: s.instrument.datalog || [], freeze: false });
    if (sc.display) base.display = Object.assign({}, s.display, sc.exam ? omit(sc.display, ['hide']) : sc.display);
    if (sc.standards) base.standards = Object.assign({}, s.standards, sc.standards, { lastEval: null });
    if (sc.pa) base.pa = Object.assign({}, s.pa, sc.pa, { scan: null });
    if (sc.tofd) base.tofd = Object.assign({}, s.tofd, sc.tofd, { scan: null, running: false });
    if (sc.aut) base.aut = Object.assign({}, s.aut, sc.aut, { scan: null, map: null, running: false });
    UT.set(base, { noRender: true });
    let examPending = false;
    if (sc.exam) {
      examPending = !applyExam(sc.exam);
    } else {
      let mode = sc.mode === 'trade' ? 'weld' : sc.mode;
      if (!sc.mode && sc.specimenId && SPEC_MODE[sc.specimenId]) mode = SPEC_MODE[sc.specimenId];
      enterMode(mode, sc.specimenOpts, o.silentUI);
      const s2 = st();
      const after = {};
      if (sc.probe) after.probe = clampProbeTo(Object.assign({}, s2.probe, sc.probe), s2.specimen);
      if (sc.instrument) after.instrument = Object.assign({}, s2.instrument, sc.instrument, { compare: null, datalog: s2.instrument.datalog || [], freeze: false });
      if (sc.defects) { after.defects = has('specimens.normaliseDefects') ? UT.specimens.normaliseDefects(sc.defects) : sc.defects; after.selectedDefect = 0; }
      if (Object.keys(after).length) UT.set(after, { noRender: true });
    }
    if (sc.lesson !== null && !sc.exam && has('lessons.start')) {
      try { UT.lessons.start(sc.lesson); if (sc.lessonStep > 0 && has('lessons.goto')) UT.lessons.goto(sc.lessonStep); } catch (e) { console.warn('[UT.scenario] lesson start failed', e); }
    }
    try { UT.renderNow(); } catch (e) { console.error('[UT.scenario] renderNow', e); }
    if (o.toast !== false) showToast(sc, { examPending });
    return true;
  }

  // ------------------------------------------------------------------ toast
  let toastTimer = null;
  const scenario = {};
  scenario.lastToast = null;
  const EXAM_HINT = 'Exam mode: the defects are hidden until you submit';
  const EXAM_PENDING_HINT = 'Exam loaded — enter the candidate name and press Start';
  /**
   * @param {object} sc  scenario object
   * @param {{examPending?:boolean}} [info]  examPending: the exam is loaded but waits for the candidate name (Start)
   */
  function showToast(sc, info) {
    const lang = UT.i18n && UT.i18n.lang;
    const title = sc.title || sc.name || t('Scenario loaded');
    const note = lang === 'ko' ? (sc.noteKo || sc.noteEn || '') : (sc.noteEn || sc.noteKo || '');
    const examHint = sc.exam ? (info && info.examPending ? EXAM_PENDING_HINT : EXAM_HINT) : '';
    scenario.lastToast = { title, note, author: sc.author || '', exam: examHint ? t(examHint) : '', at: Date.now() };
    if (typeof document === 'undefined') return null;
    const root = document.getElementById('app') || document.body;
    if (!root) return null;
    dom.injectCss('scenario', scenario.css);
    let el = document.getElementById('scn-toast');
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = dom.h('div', { id: 'scn-toast', role: 'status', 'aria-live': 'polite' }, [
      dom.h('div', { class: 'scn-toast-title' }, [dom.h('span', { i18n: 'Scenario' }), ': ' + title]),
      note ? dom.h('div', { class: 'scn-toast-note' }, note) : null,
      sc.author ? dom.h('div', { class: 'scn-toast-author' }, t('by {author}', { author: sc.author })) : null,
      examHint ? dom.h('div', { class: 'scn-toast-exam', i18n: examHint }) : null,
      dom.h('button', { class: 'scn-toast-close', type: 'button', title: t('Close'), onclick: function () { hideToast(); } }, '✕'),
    ]);
    root.appendChild(el);
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, TOAST_MS);
    return el;
  }
  function hideToast() {
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
    if (typeof document === 'undefined') return;
    const el = document.getElementById('scn-toast');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // ------------------------------------------------------------------ slots (localStorage)
  function validSlot(n) { const k = Number(n); return Number.isInteger(k) && k >= 1 && k <= SLOTS ? k : null; }
  function storage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
  function readSlot(n) {
    const ls = storage();
    if (!ls) return null;
    try {
      const raw = ls.getItem(SLOT_KEY + n);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      return rec && typeof rec === 'object' && rec.obj && typeof rec.obj === 'object' ? rec : null;
    } catch (e) { return null; }
  }
  /**
   * Save the current set-up into slot 1..5 (localStorage). Returns the stored object or null.
   * @param {number} slot
   * @param {string} [name]
   */
  function save(slot, name) {
    const n = validSlot(slot);
    if (!n) return null;
    const obj = capture();
    if (name !== undefined && name !== null) obj.name = str(name, 80);
    const rec = { v: 2, slot: n, name: obj.name, title: obj.title, savedAt: new Date().toISOString(), obj };
    const ls = storage();
    if (!ls) return null;
    try { ls.setItem(SLOT_KEY + n, JSON.stringify(rec)); } catch (e) { console.warn('[UT.scenario] save failed', e); return null; }
    UT.setIn('scenario', { slot: n, name: obj.name }, { noRender: true });
    return obj;
  }
  /** Load and apply slot 1..5; returns the object or null when the slot is empty. */
  function load(slot) {
    const n = validSlot(slot);
    const rec = n ? readSlot(n) : null;
    if (!rec) return null;
    if (!apply(rec.obj)) return null;
    UT.setIn('scenario', { slot: n, name: str(rec.name, 80) }, { noRender: true });
    return rec.obj;
  }
  /** Delete slot 1..5; true when something was removed. */
  function remove(slot) {
    const n = validSlot(slot);
    const ls = storage();
    if (!n || !ls) return false;
    const had = !!readSlot(n);
    try { ls.removeItem(SLOT_KEY + n); } catch (e) { return false; }
    if (st().scenario && st().scenario.slot === n) UT.setIn('scenario', { slot: null }, { noRender: true });
    return had;
  }
  /** The 5 slots: [{slot, empty, name, title, savedAt}]. */
  function list() {
    const out = [];
    for (let n = 1; n <= SLOTS; n++) {
      const rec = readSlot(n);
      out.push(rec ? { slot: n, empty: false, name: str(rec.name, 80), title: str(rec.title, 120), savedAt: str(rec.savedAt, 40) } : { slot: n, empty: true, name: '', title: '', savedAt: '' });
    }
    return out;
  }

  // ------------------------------------------------------------------ JSON text
  /** Pretty JSON of capture(). */
  function toText() { return JSON.stringify(capture(), null, 2); }
  /** Parse scenario JSON → object, or null on any error (not applied). */
  function fromText(text) {
    try {
      const obj = JSON.parse(String(text));
      return isScenarioObject(obj) ? obj : null;
    } catch (e) { return null; }
  }
  function isScenarioObject(obj) { return !!obj && typeof obj === 'object' && !Array.isArray(obj) && (obj.v === 2 || obj.v === undefined); }

  // ------------------------------------------------------------------ URL sharing
  function baseUrl() {
    try { return typeof location !== 'undefined' && location && typeof location.href === 'string' ? location.href.split('#')[0] : ''; } catch (e) { return ''; }
  }
  function localMakeExam(a) {
    const seed = a.seed === undefined || a.seed === null || a.seed === '' ? Math.floor(Math.random() * 1e9) : (Number(a.seed) >>> 0);
    const difficulty = DIFFICULTIES.indexOf(a.difficulty) >= 0 ? a.difficulty : (st().trade && DIFFICULTIES.indexOf(st().trade.difficulty) >= 0 ? st().trade.difficulty : 'intermediate');
    const tl = Number(a.timeLimitMin);
    return { v: 2, seed, difficulty, timeLimitMin: Number.isFinite(tl) ? Math.max(0.05, tl) : ({ basic: 60, intermediate: 60, advanced: 30 })[difficulty],
      procedureId: a.procedureId || null, specimen: 'auto', codeHash: M.fnv1a(String(a.code || '') + ':' + String(seed)).toString(16),
      revealOnSubmit: a.revealOnSubmit === true, title: a.title || '', nameRequired: !!a.nameRequired, locked: true };
  }
  /** Turn a scenario object into a seed-only exam object (§4.2.3): exam descriptor, mode 'trade', NO defects. */
  function examify(obj, ex) {
    const e = ex && typeof ex === 'object' ? ex : {};
    const tr = st().trade || {};
    const seed = e.seed !== undefined && e.seed !== null && e.seed !== '' ? e.seed : (tr.active && tr.seed !== null && tr.seed !== undefined ? tr.seed : undefined);
    const args = { seed, code: typeof e.code === 'string' ? e.code : '', difficulty: e.difficulty, timeLimitMin: e.timeLimitMin, procedureId: e.procedureId,
      revealOnSubmit: e.revealOnSubmit === true, title: e.title || obj.title || '', nameRequired: !!e.nameRequired };
    const exam = has('trade.makeExam') ? UT.trade.makeExam(args) : localMakeExam(args);
    const out = Object.assign({}, obj, { mode: 'trade', specimenId: 'plate-weld', specimenOpts: null, exam, lesson: null, lessonStep: 0 });
    if (exam.title && !out.title) out.title = exam.title;
    delete out.defects;
    return out;
  }
  /** Sync raw encoding ('r:' path) — used by the selftest and as the fallback of toUrl(). */
  function encodeRaw(obj) { return 'r:' + b64url(utf8Encode(JSON.stringify(obj))); }
  function parseHash(hash) {
    const m = /(?:^|[#&?])scn=([zr]):([A-Za-z0-9_\-=]+)/.exec(String(hash || ''));
    return m ? { kind: m[1], data: m[2] } : null;
  }
  /** Sync decode of a raw ('r:') hash; null for 'z:' or any error. */
  function decodeRaw(hash) {
    try {
      const p = parseHash(hash);
      if (!p || p.kind !== 'r') return null;
      const obj = JSON.parse(utf8Decode(b64urlDecode(p.data)));
      return isScenarioObject(obj) ? obj : null;
    } catch (e) { return null; }
  }
  /**
   * Share link for a scenario: base URL + '#scn=z:…' (deflate-raw + base64url) or '#scn=r:…' when CompressionStream
   * is unavailable. opts.exam = {code, title, nameRequired, revealOnSubmit, timeLimitMin, difficulty, seed} builds a
   * seed-only exam link (no defects).
   * @param {object} [obj]  defaults to capture()
   * @param {{exam?: object}} [opts]
   * @returns {Promise<string>}
   */
  async function toUrl(obj, opts) {
    let o = obj && typeof obj === 'object' && !Array.isArray(obj) ? clone(obj) : capture();
    if (opts && opts.exam) o = examify(o, opts.exam);
    const bytes = utf8Encode(JSON.stringify(o));
    let payload = null;
    if (typeof CompressionStream === 'function') {
      try { payload = 'z:' + b64url(await deflateRaw(bytes)); } catch (e) { payload = null; }
    }
    if (!payload) payload = 'r:' + b64url(bytes);
    return baseUrl() + '#scn=' + payload;
  }
  /**
   * Decode a '#scn=…' hash (or a full URL) → scenario object; null on any decode error.
   * @param {string} hash
   * @returns {Promise<object|null>}
   */
  async function fromUrl(hash) {
    try {
      const p = parseHash(hash);
      if (!p) return null;
      let bytes = b64urlDecode(p.data);
      if (p.kind === 'z') {
        if (typeof DecompressionStream !== 'function') return null;
        bytes = await inflateRaw(bytes);
      }
      const obj = JSON.parse(utf8Decode(bytes));
      return isScenarioObject(obj) ? obj : null;
    } catch (e) { return null; }
  }
  let appliedHash = null;
  /** Apply the scenario in location.hash (if any) → Promise<obj|null>. The same hash is applied once. */
  function applyFromLocation(force) {
    let hash = '';
    try { hash = typeof location !== 'undefined' && location ? String(location.hash || '') : ''; } catch (e) { hash = ''; }
    if (!/^#scn=/.test(hash)) return Promise.resolve(null);
    if (!force && appliedHash === hash) return Promise.resolve(null);
    appliedHash = hash;
    return fromUrl(hash).then(function (o) { if (o) apply(o); return o; });
  }
  let inited = false;
  /** Arm the hashchange listener (idempotent; 90 calls it at boot after restore). */
  function init() {
    if (inited) return false;
    if (typeof window === 'undefined' || !window || typeof window.addEventListener !== 'function') return false;
    inited = true;
    window.addEventListener('hashchange', function () { applyFromLocation(); });
    return true;
  }
  // Safety net when 90 does not wire the boot: arm on the first render (deferred; never UT.set inside 'render').
  let armed = false;
  UT.bus.on('render', function onFirstRender() {
    if (armed) return;
    armed = true;
    UT.bus.off('render', onFirstRender);
    setTimeout(function () { init(); applyFromLocation(); }, 0);
  });

  // ------------------------------------------------------------------ windows
  function copyText(text, el) {
    try { if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).catch(function () { /* ignore */ }); return true; } } catch (e) { /* ignore */ }
    try { if (el) { el.focus(); el.select(); } return !!document.execCommand('copy'); } catch (e) { return false; }
  }
  function metaFields() {
    const sc = st().scenario || {};
    const setMeta = function (k, v) { const p = {}; p[k] = str(v, k === 'noteKo' || k === 'noteEn' ? NOTE_MAX : 120); UT.setIn('scenario', p, { noRender: true }); };
    const title = dom.field('Title', { type: 'text', value: sc.title || '', attrs: { maxlength: 120 }, event: 'input', onchange: function (v) { setMeta('title', v); } });
    const author = dom.field('Author', { type: 'text', value: sc.author || '', attrs: { maxlength: 80 }, event: 'input', onchange: function (v) { setMeta('author', v); } });
    const noteKo = dom.field('Note (KO)', { tag: 'textarea', type: 'text', value: sc.noteKo || '', attrs: { maxlength: NOTE_MAX, rows: 2 }, event: 'input', onchange: function (v) { setMeta('noteKo', v); } });
    const noteEn = dom.field('Note (EN)', { tag: 'textarea', type: 'text', value: sc.noteEn || '', attrs: { maxlength: NOTE_MAX, rows: 2 }, event: 'input', onchange: function (v) { setMeta('noteEn', v); } });
    return dom.h('div', { class: 'scn-sec scn-meta' }, [dom.h('h4', { i18n: 'Teaching metadata' }), title, author, noteKo, noteEn]);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  let scenarioWin = null, shareWin = null;
  function buildScenarioBody(api) {
    const sc = st().scenario || {};
    const nameIn = dom.field('Name', { type: 'text', value: sc.name || '', attrs: { maxlength: 80 }, event: 'input', onchange: function (v) { UT.setIn('scenario', { name: str(v, 80) }, { noRender: true }); } });
    const rows = list().map(function (r) {
      const label = r.empty ? dom.h('span', { class: 'scn-empty', i18n: '(empty)' }) : dom.h('span', {}, [dom.h('b', {}, r.name || r.title || t('Scenario {n}', { n: r.slot })), r.title && r.name ? ' — ' + r.title : '', dom.h('span', { class: 'scn-date' }, ' ' + fmtDate(r.savedAt))]);
      return dom.h('tr', { class: sc.slot === r.slot ? 'current' : null }, [
        dom.h('td', { class: 'scn-slot' }, t('Slot {n}', { n: r.slot })),
        dom.h('td', { class: 'scn-name' }, label),
        dom.h('td', { class: 'scn-actions' }, [
          dom.button('Save', function () { save(r.slot, nameIn.input.value); refresh(); }, { class: 'btn small', dataset: { act: 'save', slot: r.slot } }),
          dom.button('Load', function () { load(r.slot); refresh(); }, { class: 'btn small' + (r.empty ? ' disabled' : ''), dataset: { act: 'load', slot: r.slot }, disabled: r.empty ? true : null }),
          dom.button('Delete', function () { remove(r.slot); refresh(); }, { class: 'btn small' + (r.empty ? ' disabled' : ''), dataset: { act: 'delete', slot: r.slot }, disabled: r.empty ? true : null }),
        ]),
      ]);
    });
    const table = dom.h('table', { class: 'scn-table' }, [dom.h('tbody', {}, rows)]);
    const ta = dom.h('textarea', { class: 'scn-json', spellcheck: 'false', 'aria-label': t('Scenario JSON') });
    const msg = dom.h('div', { class: 'scn-msg', 'aria-live': 'polite' });
    const say = function (s) { msg.textContent = s; };
    const jsonBtns = dom.h('div', { class: 'btn-row left' }, [
      dom.button('Export JSON', function () { ta.value = toText(); say(t('{n} characters', { n: ta.value.length })); }),
      dom.button('Copy', function () { if (!ta.value) ta.value = toText(); say(copyText(ta.value, ta) ? t('Copied to the clipboard') : t('Copy failed — select the text and copy it manually')); }),
      dom.button('Import JSON', function () {
        const obj = fromText(ta.value);
        if (!obj) { say(t('Invalid scenario JSON')); return; }
        apply(obj); say(t('Scenario applied')); refresh();
      }),
      dom.button('Share link…', function () { scenario.share.open(); }),
    ]);
    const refresh = function () { if (api && api.isOpen && api.isOpen()) api.setContent(buildScenarioBody(api)); };
    return dom.h('div', { class: 'scn-body' }, [
      metaFields(),
      dom.h('div', { class: 'scn-sec scn-slots' }, [dom.h('h4', { i18n: 'Saved scenarios (this browser)' }), nameIn, table]),
      dom.h('div', { class: 'scn-sec scn-jsonsec' }, [dom.h('h4', { i18n: 'Scenario JSON' }), ta, jsonBtns, msg]),
    ]);
  }
  function buildShareBody(api) {
    const tr = st().trade || {};
    const ta = dom.h('textarea', { class: 'scn-url', readonly: true, spellcheck: 'false', 'aria-label': t('Share link') });
    const info = dom.h('div', { class: 'scn-msg', 'aria-live': 'polite' });
    const say = function (s) { info.textContent = s; };
    const examOn = dom.field('Exam mode (seed only)', { type: 'checkbox', value: false, onchange: function (v) { examBox.hidden = !v; } });
    const code = dom.field('Exam code (4–8 characters)', { type: 'text', value: '', attrs: { maxlength: 8 } });
    const exTitle = dom.field('Exam title', { type: 'text', value: st().scenario.title || '', attrs: { maxlength: 120 } });
    const nameReq = dom.field('Candidate name required', { type: 'checkbox', value: true });
    const reveal = dom.field('Reveal the truth on submit', { type: 'checkbox', value: false });
    const timeLimit = dom.field('Time limit (min)', { type: 'number', value: Number.isFinite(tr.timeLimitMin) ? tr.timeLimitMin : 60, min: 1, max: 600, step: 1 });
    const diff = dom.field('Difficulty', { tag: 'select', type: 'text', value: DIFFICULTIES.indexOf(tr.difficulty) >= 0 ? tr.difficulty : 'intermediate', options: DIFFICULTIES.map(function (d) { return { value: d, label: t(d) }; }) });
    const seed = dom.field('Seed (blank = random)', { type: 'number', value: tr.active && tr.seed !== null && tr.seed !== undefined ? tr.seed : '', min: 0, step: 1 });
    const examBox = dom.h('div', { class: 'scn-exam', hidden: true }, [code, exTitle, nameReq, reveal, timeLimit, diff, seed, dom.h('div', { class: 'scn-hint', i18n: 'The link carries only the seed and a code hash — the candidate cannot see the defects; the code (or the instructor) reveals them.' })]);
    let busy = false;
    const generate = function () {
      if (busy) return;
      let opts = null;
      if (examOn.input.checked) {
        const c = (code.input.value || '').trim();
        if (c.length < 4 || c.length > 8) { say(t('Enter an exam code of 4–8 characters')); return; }
        const sd = seed.input.value === '' ? undefined : Number(seed.input.value);
        opts = { exam: { code: c, title: exTitle.input.value || '', nameRequired: !!nameReq.input.checked, revealOnSubmit: !!reveal.input.checked, timeLimitMin: Number(timeLimit.input.value), difficulty: diff.input.value, seed: Number.isFinite(sd) ? sd : undefined } };
      }
      busy = true;
      say(t('Generating…'));
      toUrl(undefined, opts).then(function (url) {
        busy = false;
        ta.value = url;
        say(t('{n} characters · {enc}', { n: url.length, enc: /#scn=z:/.test(url) ? t('compressed') : t('raw') }) + (opts ? ' · ' + t('exam link (no defects)') : ''));
      }, function () { busy = false; say(t('Could not build the link')); });
    };
    const btns = dom.h('div', { class: 'btn-row left' }, [
      dom.button('Generate link', generate, { class: 'btn primary' }),
      dom.button('Copy', function () { say(copyText(ta.value, ta) ? t('Copied to the clipboard') : t('Copy failed — select the text and copy it manually')); }),
      dom.button('Close', function () { api.close(); }),
    ]);
    setTimeout(generate, 0);
    return dom.h('div', { class: 'scn-body' }, [
      metaFields(),
      dom.h('div', { class: 'scn-sec' }, [dom.h('h4', { i18n: 'Exam' }), examOn, examBox]),
      dom.h('div', { class: 'scn-sec scn-urlsec' }, [dom.h('h4', { i18n: 'Share link' }), ta, btns, info]),
    ]);
  }
  function winApi(name, title, w, builder, getter, setter) {
    return {
      open() {
        if (typeof document === 'undefined') return null;
        dom.injectCss('scenario', scenario.css);
        let win = getter();
        if (!win) {
          win = dom.win({ name, title, w, x: 230, y: 70, content: function (api) { return builder(api); }, onShow: function (api) { api.setContent(builder(api)); } });
          setter(win);
        }
        win.show();
        return win;
      },
      close() { const win = getter(); if (win) win.hide(); return win; },
      toggle() { const win = getter(); if (win && win.isOpen()) { win.hide(); return win; } return this.open(); },
      isOpen() { const win = getter(); return !!(win && win.isOpen()); },
      get window() { return getter(); },
    };
  }
  scenario.window = winApi('scenario', 'Scenario', 560, buildScenarioBody, function () { return scenarioWin; }, function (w) { scenarioWin = w; });
  scenario.share = winApi('share', 'Share link', 560, buildShareBody, function () { return shareWin; }, function (w) { shareWin = w; });

  scenario.css = [
    '.win[data-win=scenario] .win-body,.win[data-win=share] .win-body{width:540px;font-size:12px}',
    '.scn-sec{border:1px solid #a0a0a0;background:#f4f4f4;padding:6px 8px;margin:6px 0}',
    '.scn-sec h4{margin:0 0 4px;font-size:12px}',
    '.scn-sec .fld-label{flex-basis:170px}',
    '.scn-sec .fld textarea.fld-input{height:38px;resize:vertical;font:inherit}',
    '.scn-table{width:100%;border-collapse:collapse;margin-top:4px}',
    '.scn-table td{padding:3px 4px;border-top:1px solid #d0d0d0;vertical-align:middle}',
    '.scn-table tr.current td{background:#e8f0ff}',
    '.scn-table .scn-slot{white-space:nowrap;width:52px;font-weight:bold}',
    '.scn-table .scn-actions{white-space:nowrap;text-align:right;width:150px}',
    '.scn-table .scn-actions .btn{margin-left:3px}',
    '.scn-empty{color:#888;font-style:italic}',
    '.scn-date{color:#666;font-size:11px}',
    '.scn-json,.scn-url{width:100%;box-sizing:border-box;font:11px/1.3 monospace;border:1px solid #808080;background:#fff;color:#000}',
    '.scn-json{height:120px}',
    '.scn-url{height:72px;word-break:break-all;resize:vertical}',
    '.scn-msg{margin-top:4px;color:#204080;min-height:14px}',
    '.scn-hint{color:#555;font-size:11px;margin-top:4px}',
    '.scn-exam[hidden]{display:none}',
    '#scn-toast{position:absolute;left:50%;top:108px;transform:translateX(-50%);z-index:5000;max-width:560px;min-width:240px;background:#fffbe6;color:#000;',
    'border:1px solid #806000;box-shadow:2px 2px 0 #000;padding:8px 30px 8px 12px;font-size:12px;line-height:1.35}',
    '#scn-toast .scn-toast-title{font-weight:bold}',
    '#scn-toast .scn-toast-note{white-space:pre-wrap;margin-top:3px}',
    '#scn-toast .scn-toast-author,#scn-toast .scn-toast-exam{color:#555;font-size:11px;margin-top:2px}',
    '#scn-toast .scn-toast-close{position:absolute;right:4px;top:3px;border:none;background:transparent;cursor:pointer;font-size:12px;padding:2px 4px}',
    '.hc #scn-toast{background:#000;color:#fff;border-color:#fff}',
  ].join('\n');

  // ------------------------------------------------------------------ self test (headless)
  function __selftest() {
    const f = [];
    try {
      // base64url + utf-8 round trips (local fallbacks AND the native path when present)
      const all = new Uint8Array(256);
      for (let i = 0; i < 256; i++) all[i] = i;
      const enc = b64url(all);
      if (/[+/=]/.test(enc)) f.push('b64url alphabet');
      const dec = b64urlDecode(enc);
      let same = dec.length === 256;
      for (let i = 0; i < 256 && same; i++) same = dec[i] === i;
      if (!same) f.push('b64url round trip');
      const locEnc = b64EncodeLocal(bytesToBin(all)), locDec = b64DecodeLocal(locEnc);
      if (locEnc.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== enc || locDec !== bytesToBin(all)) f.push('local base64');
      const ko = '초음파 탐상 시뮬레이터 — ✓ 😀';
      if (utf8Decode(utf8Encode(ko)) !== ko) f.push('utf8 round trip');
      let bad = false;
      try { b64urlDecode('***'); } catch (e) { bad = true; }
      if (!bad) f.push('b64urlDecode accepts junk');
      // capture from a default state: shape
      const s = UT.defaultState();
      s.specimen = { id: 'v1', name: 'V1', T: 100, L: 25, face: 'wide', scanSurface: { y: 0, xMin: 0, xMax: 300 } };
      s.mode = 'v1';
      s.instrument.compare = new Float32Array(4); s.instrument.datalog = [{ id: 1 }]; s.instrument.freeze = true;
      s.tofd.scan = { z0: 0 }; s.aut.scan = { z0: 0 }; s.aut.map = { n: 1 }; s.pa.scan = { n: 1 };
      s.defects = [{ n: 1, type: 'planar', pts: [{ x: 0, y: 5 }, { x: 2, y: 9 }], zFrom: 100, zTo: 130 }];
      s.scenario = { slot: null, name: 'n', title: 'T', noteKo: '노트', noteEn: 'note', author: 'A' };
      const c = captureFrom(s);
      if (c.v !== 2 || c.mode !== 'v1' || c.specimenId !== 'v1' || !c.specimenOpts || c.specimenOpts.face !== 'wide') f.push('capture mode/specimen ' + JSON.stringify([c.mode, c.specimenId, c.specimenOpts]));
      if ('compare' in c.instrument || 'datalog' in c.instrument || 'freeze' in c.instrument) f.push('capture leaks compare/datalog/freeze');
      if ('scan' in c.tofd || 'scan' in c.aut || 'map' in c.aut || 'scan' in c.pa) f.push('capture leaks scans');
      if (!Array.isArray(c.defects) || c.defects.length !== 1 || c.title !== 'T' || c.noteKo !== '노트' || c.exam !== null) f.push('capture defects/meta');
      if ('sound' in c.display || c.display.beam !== true) f.push('capture display subset');
      // exam-locked capture: no defects, exam kept, mode trade
      s.mode = 'trade'; s.trade.active = true; s.trade.exam = { v: 2, seed: 7, locked: true, codeHash: 'ab' }; s.trade.revealed = false;
      const cl = captureFrom(s);
      if ('defects' in cl || !cl.exam || cl.exam.seed !== 7 || cl.mode !== 'trade') f.push('locked capture ' + JSON.stringify([Object.keys(cl), cl.mode]));
      s.trade.revealed = true;
      const cr = captureFrom(s);
      if (!Array.isArray(cr.defects) || cr.exam !== null || cr.mode !== 'weld') f.push('revealed capture');
      // sanitise: junk → defaults / clamps
      const sz = sanitise({ v: 2, probe: { angle: 'x', x: 1e9, side: -3, method: 'bogus', crystalDims: { a: 'big' } }, instrument: { gain: 500, rectify: 'odd', gates: [{ start: 'a', level: 900 }], dac: { points: [{ path: 1, ampPct: 2 }, { path: 'x' }] } },
        weldOpts: { T: 1e6, type: 'zigzag', pipe: 1, od: 25, wt: 100 }, display: { skips: 99, units: 'furlong', sound: true }, mode: 'nope', material: 'unobtainium', lesson: 3.5, noteKo: 'x'.repeat(900) });
      if (sz.probe.angle !== 60 || sz.probe.x !== 3000 || sz.probe.side !== -1 || sz.probe.method !== 'pe' || sz.probe.crystalDims.a !== 10) f.push('sanitise probe ' + JSON.stringify(sz.probe));
      if (sz.instrument.gain !== 110 || sz.instrument.rectify !== 'full' || sz.instrument.gates.length !== 2 || sz.instrument.gates[0].start !== 10 || sz.instrument.gates[0].level !== 100 || sz.instrument.dac.points.length !== 1) f.push('sanitise instrument ' + JSON.stringify(sz.instrument));
      if (sz.weldOpts.T !== 100 || sz.weldOpts.type !== 'single-v' || sz.weldOpts.pipe !== true || sz.weldOpts.wt !== 11.5) f.push('sanitise weldOpts ' + JSON.stringify(sz.weldOpts));
      if (sz.display.skips !== 12 || sz.display.units !== 'mm' || 'sound' in sz.display || sz.mode !== 'weld' || sz.material !== 'carbon' || sz.lesson !== null || sz.noteKo.length !== NOTE_MAX) f.push('sanitise misc');
      if (sanitise({ weldOpts: { type: 'double-v' } }).weldOpts.prep !== 'double-v') f.push('sanitise prep from type');
      // JSON text + raw URL round trip (sync 'r:' path)
      const txt = JSON.stringify(c);
      const back = fromText(txt);
      if (!back || JSON.stringify(back) !== txt) f.push('fromText round trip');
      if (fromText('{bad') !== null || fromText('[1]') !== null || fromText('{"v":9}') !== null) f.push('fromText rejects');
      const raw = encodeRaw(c);
      if (!/^r:[A-Za-z0-9_-]+$/.test(raw)) f.push('encodeRaw form');
      const d2 = decodeRaw('#scn=' + raw);
      if (!d2 || JSON.stringify(d2) !== txt) f.push('decodeRaw round trip');
      if (decodeRaw('#scn=r:!!!') !== null || decodeRaw('#selftest') !== null || decodeRaw('#scn=z:abc') !== null) f.push('decodeRaw rejects');
      if (!parseHash('http://x/y.html#scn=z:abc_-') || parseHash('#scn=z:abc_-').kind !== 'z') f.push('parseHash');
      // exam link object: no defects, exam descriptor with the spec's code hash
      const ex = examify(c, { code: '1234', seed: 42, revealOnSubmit: false, nameRequired: true, title: 'Exam A' });
      if ('defects' in ex || !ex.exam || ex.mode !== 'trade' || ex.exam.seed !== 42 || ex.exam.revealOnSubmit !== false || ex.exam.nameRequired !== true) f.push('examify ' + JSON.stringify(Object.keys(ex)));
      if (ex.exam.codeHash !== M.fnv1a('1234:42').toString(16)) f.push('examify codeHash ' + ex.exam.codeHash);
      if (!ex.exam.locked || ex.lesson !== null) f.push('examify locked/lesson');
      // slots API guards (no storage side effects for invalid slots)
      if (validSlot(0) !== null || validSlot(6) !== null || validSlot('3') !== 3 || save(9) !== null || load(0) !== null || remove(7) !== false) f.push('slot guards');
      if (list().length !== SLOTS) f.push('list length');
      if (typeof toUrl !== 'function' || typeof fromUrl !== 'function' || !UT.test.scenario || typeof UT.test.scenario.toUrl !== 'function') f.push('api');
    } catch (e) { f.push('exception: ' + (e && e.message)); }
    return f;
  }

  // ------------------------------------------------------------------ exports
  Object.assign(scenario, {
    capture, captureFrom, apply, save, load, remove, list, toText, fromText, toUrl, fromUrl, applyFromLocation, init,
    sanitise, examify, encodeRaw, decodeRaw, parseHash, b64url, b64urlDecode, utf8Encode, utf8Decode, showToast, hideToast,
    SLOTS, __selftest, selftest: __selftest,
  });
  UT.scenario = scenario;
  Object.assign(UT.test, { scenario: { capture, apply, toUrl, fromUrl, toText, fromText } });
})(window.UT = window.UT || {});
