/* 90-app.js — application shell: page layout, menu bar (v2 menus incl. Tools), toolbar, dialogs (weld v2,
 * wedge, options, step wedge, help/about/keys, export, probe library, material, focus, glossary, quick tour),
 * design-box scaling + touch bar (U2), accessibility (U5), print root, status bar, keyboard shortcuts,
 * persistence (v2 record) and boot. SPEC §7, §8, §9/§14.10, §10, §15.9; SPEC-v2 §5.4, §5.6, §5.7, §8.
 * Classic script; nothing touches the DOM at load time (§15.12).
 */
// SPEC NOTES (decisions where the spec is silent or ambiguous)
// - style.css lives at ut-simulator/style.css (where index.html / build.py reference it), not under src/.
// - Menu keys: every v1 key is kept verbatim ('Weld Settings...', 'Phased Array Probe', 'Focus Beam', 'Lessons...').
//   New v2 items use the SPEC-v2 §8 spelling with the Unicode ellipsis ('Probe library…', 'DGS diagram…').
//   UT.test.menu(path) matches segments tolerantly: trailing '…'/'...' are ignored and a small alias table maps
//   the §8 spellings onto the v1 keys ('Weld…' → 'Weld Settings...', 'Phased Array Probe…' → 'Phased Array Probe',
//   'Focus Beam…' → 'Focus Beam', 'Lessons…' → 'Lessons...'). A submenu entry may carry an action too (Tools ▸
//   Procedures opens the procedures window when activated directly).
// - Phased Array Probe: toggles probe.method 'pe' ⇄ 'pa' exactly as v1 and, when switching to 'pa', opens the PA
//   window (UT.pa.panel / UT.pa.window when 56 is loaded); switching back closes it.
// - Focus Beam… opens window 'focus' (on/off, F, shows N); the tick reflects probe.focus.on; display.focus is never read.
//   F is clamped to [10, N] where N = derived.nearField; the dialog shows 'F > near field: no focusing effect' when
//   the typed value exceeds N and refuses (message) refracted angles > 70°.
// - Material… (window 'material'): radio list of UT.specimens.materials + weld metal select (same | austenitic).
//   Applying uses UT.test.setMaterial(key) (80) when present, else UT.set({material}) + re-enter of the current mode.
// - Weld dialog: `prep` is authoritative; the legacy `type` is mirrored (double-v → 'double-v', none → 'none',
//   fillet-t / nozzle → 'fillet', else 'single-v'); `backing: true` with prep single-v is normalised to the prep
//   'single-v-backing'. Extra fields: backing bar, web thickness (fillet/nozzle), branch OD (nozzle), transfer loss
//   0…8 dB, weld metal. For pipes T is kept equal to WT; OD inch dropdown maps 4/6/8/10/12 → 114.3/168.3/219.1/273.1/323.9 mm.
// - Touch bar (#touchbar, between #main and the status bar, 44 px): the §5.4 list is 10 buttons (◀ ▶ ▲ ▼ − + Range
//   Freeze Peak Hide) plus the Step 1|5|10 mm cycle button ("9 buttons + step" in the spec counts the pairs loosely);
//   Mark L / Mark R appear while the sizing window is open, Row+ while a trade test / practice runs. Auto-repeat
//   400 ms delay then 12 Hz. Shown for display.touchBar 'on' or ('auto' and `(pointer: coarse)`).
// - Design-box scaling: #app.scaled is 1280 × 760 and transformed by k = clamp(min(innerW/1280, innerH/760), 0.6, 1.6),
//   position:fixed and horizontally centred with `left` (the spec only fixes transform-origin 0 0; a fixed box keeps
//   body.scrollWidth/Height equal to the viewport, which a transformed in-flow box does not). 'fixed' restores the v1 rules.
//   Windows are position:absolute inside #app (design px) — also in 'fixed' mode.
// - Quick tour: shown once automatically on first boot (localStorage utsim.tourDone) EXCEPT under automation
//   (navigator.webdriver) or when a location hash is present (#selftest / #scn=…) so acceptance runs and shared
//   links are never covered by the overlay; Help ▸ Quick tour always shows it. Text comes from UT.i18nKo.tour
//   when 92 provides it (array of {target, ko, en}), else from the built-in 8 steps.
// - Glossary window reads UT.i18nKo.glossary; without 92 the 20 binding example entries of SPEC-v2 §5.6 are shown.
// - prefers-reduced-motion: #app gets class `reduced-motion` and UT.app.reducedMotion() returns true; scan owners
//   (50/55/56) consult it to step synchronously (90 cannot change their run loops).
// - 'ui' bus events: menu-open {id: 'menu-…'} on every dropdown open (mouse, keyboard, Alt+letter); tb-hover {id: 'tb-…'}
//   on pointerenter of a toolbar button; tb-click {id} whenever a toolbar action actually runs (real click and
//   UT.test.click); window-open {id: win name} on every 'win:show'.
// - Print: div#print-root lives on document.body (created at boot). File ▸ Print report uses UT.trade.printReport()
//   when a trade report exists, otherwise a generic report (probe line, specimen, readouts, datalog, A-scan and
//   cross-section images) is written into #print-root; the CSS hides #app only while #print-root has content
//   (body.print-report, also :has()), so File ▸ Print still prints the page as in v1. #print-root is emptied on afterprint.
// - Persistence: record v:2 under 'utsim.v1'; patchFromRecord accepts v 1 or 2. Saved in addition to v1: material,
//   physics, standards (no lastEval; rulesOverride only when an object), lessons.progress (≤ 40 entries) / answers,
//   trade.history (≤ 30) / difficulty / timeLimitMin, pa (no scan), display v2 keys, weldOpts v2 keys,
//   instrument tcg/pulser/receiver/autoPct. Never compare/datalog/lastEval; not while trade.active. A v1 record
//   without `prep` gets prep = type. tofd.deadZones (Options ▸ Show dead zones) is not persisted (not listed in §2).
// - Menu bar keyboard model: F10 (or Alt released alone) opens the first enabled menu; ←/→ switch top menus,
//   ↑/↓ move the focus (real DOM focus on the entries, tabindex −1), → opens a submenu, ← returns, Enter/Space
//   activates, Esc closes and restores the previous focus. Alt+F/P/S/W/D/T/O/H opens that menu.
// - Sound: Options ▸ Sound alarm calls UT.audio.unlock() from the click itself and arms one-time pointerdown/keydown
//   listeners on document whenever display.sound turns on (state event) and no AudioContext exists yet.
// - UT.i18n: 90 registers no Korean entries (single dictionary owner is 92); core's small built-in map is the fallback.
// - Keyboard 'D' toggles the finger damping tool (state.damping.tool); Esc also closes the tour overlay.
// - Boot: restore → buildLayout → instruments.mount → view inits → init() of standards/pa/lessons/trade/i18nKo/scenario
//   (when they expose one) → enter weld → renderNow → scenario.applyFromLocation() (+ own 'hashchange' fallback when
//   94 has no init) → #selftest → first-boot tour.
(function (UT) {
  'use strict';
  const M = UT.math;
  const app = {};
  const mem = {
    built: false, booted: false, els: {}, tb: {}, openMenu: null, lang: 'en', saveTimer: null,
    lastLeft: '', lastMid: '', resizeObs: null, suspendSave: false,
    scale: 1, kbFocus: null, kbReturn: null, altArmed: false, coarse: false, coarseMq: null, motionMq: null,
    touch: { step: 1, timer: null, els: {} }, tour: { i: 0, el: null, open: false }, soundArmed: false,
    winBuilders: {}, printPending: false, lastRecord: null,
  };
  const DESIGN_W = 1280, DESIGN_H = 760;
  const OD_INCH = { 4: 114.3, 6: 168.3, 8: 219.1, 10: 273.1, 12: 323.9 };
  const STORE_KEY = 'utsim.v1';
  const TOUR_KEY = 'utsim.tourDone';
  const PERSIST_KEYS = ['probe', 'instrument', 'display', 'defects', 'weldOpts', 'utSet', 'material', 'physics', 'standards', 'lessons', 'trade', 'pa'];
  const INSTR_KEYS = ['gain', 'refGain', 'range', 'delay', 'reject', 'damping', 'rectify', 'gates', 'dac', 'cal', 'trig', 'tcg', 'pulser', 'receiver', 'autoPct'];
  const RANGE_PRESETS = [50, 100, 200, 400];
  // fallback copy of §14.7 (used only when UT.modes is missing)
  const HIDDEN_FALLBACK = { v1: ['plan', 'ruler', 'compass'], v2: ['plan', 'ruler', 'compass'], tky: ['plan', 'ruler', 'compass'], iow: ['plan', 'compass'], fbh: ['compass'] };
  const MENU_ALIASES = { 'Weld…': 'Weld Settings...', 'Weld...': 'Weld Settings...', 'Weld': 'Weld Settings...', 'Phased Array Probe…': 'Phased Array Probe', 'Focus Beam…': 'Focus Beam', 'Lessons…': 'Lessons...', 'Lessons': 'Lessons...', 'Standards notes': 'Standards notes…', 'Trade Test…': 'Trade Test...' };
  const ALT_MENU = { f: 'menu-file', p: 'menu-probes', s: 'menu-stepwedge', w: 'menu-weld', d: 'menu-defects', t: 'menu-tools', o: 'menu-options', h: 'menu-help' };

  // ------------------------------------------------------------------ small helpers
  function st() { return UT.state; }
  function has(path) {
    let o = UT;
    for (const k of path.split('.')) { if (!o || o[k] === undefined || o[k] === null) return null; o = o[k]; }
    return o;
  }
  /** Call UT.<path>(...args) when it exists; returns undefined otherwise (never throws). */
  function call(path, args) {
    const fn = has(path);
    if (typeof fn !== 'function') return undefined;
    const parent = has(path.split('.').slice(0, -1).join('.')) || UT;
    try { return fn.apply(parent, args || []); } catch (e) { console.error('[UT.app] ' + path, e); return undefined; }
  }
  /**
   * Normalise a defect list for state.defects: UT.specimens.normaliseDefects (up to 16, duplicate n possible)
   * then the §15.8 rule also enforced by UT.modes.setDefects: at most 8 defects with unique slots n = 1..8
   * (a taken / invalid n moves to the next free slot, the rest are dropped). Used wherever 90-app writes
   * state.defects without going through UT.modes.setDefects (boot restore, preset fallback).
   */
  function limitDefectSlots(arr, opts) {
    const list = has('specimens.normaliseDefects') ? UT.specimens.normaliseDefects(arr) : (Array.isArray(arr) ? arr : []);
    const out = [];
    const taken = function (n) { return out.some(function (d) { return d.n === n; }); };
    for (const d of list) {
      let n = Number.isInteger(d.n) && d.n >= 1 && d.n <= 8 && !taken(d.n) ? d.n : 0;
      if (!n) for (let k = 1; k <= 8; k++) if (!taken(k)) { n = k; break; }
      if (!n) break;
      out.push(normaliseZ(n === d.n ? d : Object.assign({}, d, { n }), opts));
    }
    return out;
  }
  /**
   * Same z normalisation as UT.modes.setDefects: on a plate zFrom <= zTo (an inverted range is swapped), on a
   * pipe an inverted range wraps through 0 (kept) but both ends are reduced to 0 <= z < circumference.
   * `opts = {pipe, circ}` — the specimen may not exist yet (boot restore), so the caller passes the weld options.
   */
  function normaliseZ(d, opts) {
    if (!d || !Number.isFinite(d.zFrom) || !Number.isFinite(d.zTo)) return d;
    const pipe = !!(opts && opts.pipe), C = opts && Number.isFinite(opts.circ) && opts.circ > 0 ? opts.circ : null;
    let zFrom = d.zFrom, zTo = d.zTo;
    if (pipe) { if (C) { zFrom = ((zFrom % C) + C) % C; zTo = ((zTo % C) + C) % C; } }
    else if (zFrom > zTo) { const t = zFrom; zFrom = zTo; zTo = t; }
    return zFrom === d.zFrom && zTo === d.zTo ? d : Object.assign({}, d, { zFrom, zTo });
  }
  /** `{pipe, circ}` of the current specimen (or of the weld options when no specimen is built yet). */
  function zOptsOf(weldOpts) {
    const sp = st().specimen;
    if (sp) return { pipe: !!sp.pipe, circ: sp.pipe ? sp.L : null };
    const o = weldOpts || st().weldOpts || {};
    return { pipe: !!o.pipe, circ: o.pipe && Number.isFinite(o.od) ? Math.PI * o.od : null };
  }
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  function h(tag, attrs, kids) { return UT.dom.h(tag, attrs, kids); }
  /** Text element whose content is an i18n key with params (re-rendered by the owner on 'lang'). */
  function tx(tag, attrs, key, params) { return h(tag, Object.assign({ dataset: { i18n: key } }, attrs || {}), t(key, params)); }
  function doc() { return typeof document === 'undefined' ? null : document; }
  function win_() { return typeof window === 'undefined' ? null : window; }
  function byId(id) { const d = doc(); return d ? d.getElementById(id) : null; }
  function winApi(name) { return UT.dom.wins[name] || null; }
  function winOpen(name) { const w = winApi(name); return !!(w && w.isOpen()); }
  function fmtNum(v, dp) { const n = +v; return Number.isInteger(n) ? String(n) : n.toFixed(dp === undefined ? 1 : dp); }
  function scanRange() {
    const sp = st().specimen;
    const ss = sp && sp.scanSurface ? sp.scanSurface : { xMin: -150, xMax: 150 };
    return ss;
  }
  function emitUi(kind, id) { try { UT.bus.emit('ui', { kind, id: String(id) }); } catch (e) { /* bus logs */ } }
  function derivedNow() {
    if (UT.frame && UT.frame.derived) return UT.frame.derived;
    return has('probe.derive') ? call('probe.derive', [st().probe, st().specimen]) : null;
  }
  /** Confirm dialog → Promise<boolean> (UT.dom.confirm resolves true on OK, false on Cancel/close). */
  function confirmDlg(message, opts) { return UT.dom.confirm(message, opts); }

  // ------------------------------------------------------------------ toolbar icons (inline SVG strings)
  function svg(inner) { return '<svg viewBox="0 0 24 22" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '<\/svg>'; }
  function sq(col) { return svg('<rect x="7" y="4" width="11" height="11" fill="' + col + '" stroke="#333" stroke-width="1"/>'); }
  const ICONS = {
    0: sq('#ff00ff'), 45: sq('#ffff00'), 60: sq('#00c000'), 70: sq('#0000ff'),
    v2: svg('<path d="M3 5 h18 v10 H12 A9 9 0 0 1 3 6 Z" fill="#9a9a9a" stroke="#333"/>'),
    v1: svg('<path d="M3 4 h18 v12 h-11 A7 7 0 0 1 3 9 Z" fill="#9a9a9a" stroke="#333"/><circle cx="16" cy="10" r="2" fill="#dde" stroke="#333"/>'),
    dac: svg('<rect x="3" y="3" width="18" height="15" fill="#e8f4ff" stroke="#333"/><polyline points="5,14 9,7 13,10 17,12 20,15" fill="none" stroke="#0040ff" stroke-width="1.5"/><path d="M5 16 Q12 4 20 6" fill="none" stroke="#e00" stroke-width="1"/>'),
    plot: svg('<rect x="3" y="3" width="18" height="15" fill="#ffffb0" stroke="#333"/><line x1="6" y1="15" x2="18" y2="6" stroke="#333" stroke-width="2"/>'),
    damp: svg('<polyline points="2,17 7,17 9,3 11,17 13,10 15,17 17,14 19,17 22,17" fill="none" stroke="#c000c0" stroke-width="1.6"/>'),
    size: svg('<rect x="3" y="4" width="18" height="6" fill="#4a7fe0" stroke="#333"/><rect x="3" y="12" width="12" height="6" fill="#8fb4ff" stroke="#333"/>'),
    defect: svg('<path d="M4 15 l4 -9 l3 6 l3 -8 l4 11" fill="none" stroke="#e00000" stroke-width="2.2"/><line x1="3" y1="18" x2="21" y2="18" stroke="#333"/>'),
    hide: svg('<path d="M6 14 l3 -6 l3 5 l3 -7" fill="none" stroke="#e00000" stroke-width="1.6"/><line x1="4" y1="4" x2="20" y2="17" stroke="#333" stroke-width="1.5"/>'),
    clear: svg('<rect x="4" y="9" width="12" height="7" fill="#f7c" stroke="#333" transform="rotate(-30 10 12)"/><rect x="13" y="6" width="6" height="7" fill="#fff" stroke="#333" transform="rotate(-30 16 9)"/>'),
    beam: svg('<rect x="3" y="3" width="18" height="15" fill="#111" stroke="#333"/><line x1="5" y1="5" x2="19" y2="16" stroke="#fff" stroke-width="1.5"/>'),
    rad: svg('<circle cx="12" cy="11" r="9" fill="#ffd800" stroke="#333"/><path d="M12 11 L12 2 A9 9 0 0 1 19.8 6.5 Z M12 11 L4.2 6.5 A9 9 0 0 0 4.2 15.5 Z M12 11 L19.8 15.5 A9 9 0 0 1 12 20 Z" fill="#111"/><circle cx="12" cy="11" r="2" fill="#ffd800"/>'),
    pipe: svg('<path d="M3 17 Q7 3 12 10 T21 5" fill="none" stroke="#1040ff" stroke-width="2"/><line x1="3" y1="18" x2="21" y2="18" stroke="#333"/>'),
    tky: svg('<path d="M12 19 V11 L5 3 M12 11 L19 3" fill="none" stroke="#f0c000" stroke-width="3"/>'),
    tofd: svg('<rect x="2" y="7" width="7" height="7" fill="#7b7b7b" stroke="#333"/><rect x="15" y="7" width="7" height="7" fill="#7b7b7b" stroke="#333"/><path d="M9 11 Q12 19 15 11" fill="none" stroke="#0040ff"/>'),
    aut: svg('<rect x="3" y="3" width="5" height="15" fill="#ff5050"/><rect x="9.5" y="3" width="5" height="15" fill="#00c0ff"/><rect x="16" y="3" width="5" height="15" fill="#40e040"/>'),
  };
  /** Small weld-preparation icons for the Weld dialog (36 × 24 viewBox). */
  function prepSvg(inner) { return '<svg viewBox="0 0 36 24" width="36" height="24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + inner + '<\/svg>'; }
  const PLATE = '<rect x="1" y="6" width="34" height="12" fill="#9a9a9a" stroke="#333" stroke-width="0.8"/>';
  const PREP_ICONS = {
    'single-v': prepSvg(PLATE + '<path d="M12 6 L17 16 L19 16 L24 6 Z" fill="#fdfbd8" stroke="#333" stroke-width="0.8"/><path d="M10 6 Q18 3 26 6" fill="#e0e0e0" stroke="#333" stroke-width="0.8"/>'),
    'double-v': prepSvg(PLATE + '<path d="M12 6 L17 12 L12 18 L24 18 L19 12 L24 6 Z" fill="#fdfbd8" stroke="#333" stroke-width="0.8"/>'),
    'single-bevel': prepSvg(PLATE + '<path d="M16 6 L16 16 L18 16 L26 6 Z" fill="#fdfbd8" stroke="#333" stroke-width="0.8"/>'),
    'j': prepSvg(PLATE + '<path d="M16 6 L16 14 Q16 17 19 17 L21 17 L24 6 Z" fill="#fdfbd8" stroke="#333" stroke-width="0.8"/>'),
    'single-v-backing': prepSvg(PLATE + '<path d="M11 6 L16 17 L20 17 L25 6 Z" fill="#fdfbd8" stroke="#333" stroke-width="0.8"/><rect x="10" y="17" width="16" height="4" fill="#0040ff" stroke="#333" stroke-width="0.8"/>'),
    'fillet-t': prepSvg('<rect x="1" y="14" width="34" height="8" fill="#9a9a9a" stroke="#333" stroke-width="0.8"/><rect x="15" y="1" width="6" height="13" fill="#9a9a9a" stroke="#333" stroke-width="0.8"/><path d="M15 14 L10 14 L15 9 Z M21 14 L26 14 L21 9 Z" fill="#e0e0e0" stroke="#333" stroke-width="0.8"/>'),
    'nozzle': prepSvg('<path d="M1 22 Q18 8 35 22 L35 24 L1 24 Z" fill="#9a9a9a" stroke="#333" stroke-width="0.8"/><rect x="14" y="1" width="8" height="12" fill="#9a9a9a" stroke="#333" stroke-width="0.8"/><path d="M14 13 L9 15 L14 9 Z M22 13 L27 15 L22 9 Z" fill="#e0e0e0" stroke="#333" stroke-width="0.8"/>'),
    'none': prepSvg(PLATE),
  };

  // ------------------------------------------------------------------ actions used by toolbar & menus
  /**
   * Toolbar / keyboard angle change: angle + mode (comp at 0°) exactly as v1, plus the library id: a named probe
   * series (same maker, family, frequency and crystal) follows to the new angle, everything else maps to the
   * generic `gen-<angle>-5-10` entry (wedgePath 12 = the v1 preset) WITHOUT touching freq / diameter / crystalDims,
   * so the v1 physics of the default probe is unchanged (UT.probe.libForAngle would prefer the A430S 16 × 16).
   */
  function setAngle(angle) {
    const patch = { angle, mode: angle === 0 ? 'comp' : 'shear' };
    const p = st().probe;
    const lib = has('probe.library') || [];
    const cur = has('probe.libEntry') ? UT.probe.libEntry(p.libId) : null;
    let target = null;
    if (cur && cur.maker !== 'generic' && cur.family !== 'pa' && cur.family !== 'tofd') {
      target = lib.find(function (q) { return q.angle === angle && q.maker === cur.maker && q.family === cur.family && q.freq === cur.freq && q.crystal.a === cur.crystal.a && q.crystal.b === cur.crystal.b; }) || null;
      if (target && has('probe.select')) Object.assign(patch, UT.probe.select(target.id), { angle, mode: patch.mode });
    }
    if (!target) { const gen = lib.find(function (q) { return q.id === 'gen-' + angle + '-5-10'; }); if (gen) patch.libId = gen.id; }
    UT.setIn('probe', patch);
  }
  function toggleMode(name) {
    if (has('modes.toggle')) return call('modes.toggle', [name]);
    console.warn('[UT.app] UT.modes missing; cannot toggle mode ' + name);
    return undefined;
  }
  function enterMode(name, opts) {
    if (has('modes.enter')) return call('modes.enter', [name, opts]);
    if (name === 'weld' && has('specimens.plateWeld')) {
      const o = Object.assign({}, st().weldOpts || {}, { material: st().material });
      const spec = o.pipe && UT.specimens.pipeWeld ? UT.specimens.pipeWeld(o) : UT.specimens.plateWeld(o);
      UT.set({ mode: 'weld', specimen: spec });
      return spec;
    }
    return undefined;
  }
  function currentMode() { return st().mode || 'weld'; }
  function reenterWeldLike() {
    const m = currentMode();
    enterMode(m === 'tofd' || m === 'aut' || m === 'trade' ? m : 'weld', { keepProbe: true });
  }
  function togglePipe() {
    const pipe = !(st().weldOpts && st().weldOpts.pipe);
    const s = st();
    // §15.9: PIPE on shows the 3-D window (also after it was closed with ✕): re-arm display.pipe3d in the SAME
    // patch as weldOpts so 64-view-3d treats it as the pipe rule (not as a '3D Plate' request) and shows it on
    // the specimen change; PIPE off then hides it again.
    const patch = { weldOpts: Object.assign({}, s.weldOpts, { pipe }) };
    if (pipe && s.display && !s.display.pipe3d) patch.display = Object.assign({}, s.display, { pipe3d: true });
    UT.set(patch, { noRender: true });
    reenterWeldLike();
    syncPipe3d();
  }
  /**
   * One rule for the 3-D window: 64-view-3d shows it when display.pipe3d && (pipe || weld mode) and
   * re-syncs itself on every 'display' / 'weldOpts' / 'specimen' / 'mode' state event, so after a
   * weldOpts / mode change the app only needs the fallback (window without 64-view-3d).
   */
  function syncPipe3d() {
    if (has('views.pipe3d.open')) return;
    const s = st();
    if (winApi('pipe3d')) showPipe3d(!!(s.weldOpts && s.weldOpts.pipe) && s.display.pipe3d !== false);
  }
  /** Options ▸ Show 3D Window state = the window itself (never a stale display.pipe3d flag). */
  function pipe3dOpen() { return winOpen('pipe3d'); }
  function setPipe3dShown(show) {
    if (has('views.pipe3d.open') && has('views.pipe3d.close')) { show ? UT.views.pipe3d.open() : UT.views.pipe3d.close(); return; }
    setDisplay({ pipe3d: !!show });
    syncPipe3d();
  }
  function showPipe3d(show) {
    const v = has('views.pipe3d');
    if (v) {
      if (show && typeof v.open === 'function') return v.open();
      if (!show && typeof v.close === 'function') return v.close();
      if (v.window && typeof v.window[show ? 'show' : 'hide'] === 'function') return v.window[show ? 'show' : 'hide']();
    }
    const w = winApi('pipe3d');
    if (w) show ? w.show() : w.hide();
    return undefined;
  }
  function clearAll() {
    call('ascan.clearPeak');
    UT.setIn('tofd', { scan: null }, { noRender: true });
    UT.setIn('aut', { scan: null, map: null }, { noRender: true });
    UT.setIn('plot', { points: [], edgeMarks: [] }, { noRender: true });
    UT.setIn('sizing', { marks: [] });
    call('views.plan.clearTrail');
  }
  /** Toggle the window of a module path ('views.sizing', 'standards.dgs', 'lessons.window'); guarded. */
  function toggleWindowOf(path, fallbackPath) {
    const v = has(path) || (fallbackPath ? has(fallbackPath) : null);
    if (!v) { console.warn('[UT.app] ' + path + ' not available'); return undefined; }
    if (typeof v.toggle === 'function') return v.toggle();
    if (v.window && typeof v.window.toggle === 'function') return v.window.toggle();
    if (typeof v.open === 'function') return v.open();
    if (typeof v.show === 'function') return v.show();
    return undefined;
  }
  /** Whether the window of a module path is open (module isOpen() when offered, else the dom.win registry). */
  function windowOfOpen(path, winName) {
    const v = has(path);
    if (v && typeof v.isOpen === 'function') { try { return !!v.isOpen(); } catch (e) { /* fall through */ } }
    if (v && v.window && typeof v.window.isOpen === 'function') { try { return !!v.window.isOpen(); } catch (e) { /* fall through */ } }
    return winOpen(winName);
  }
  function setUtSet(name) {
    if (st().utSet === name) { if (name === 'usk7') call('instruments.setSkin', [name]); return; }
    UT.set({ utSet: name });
  }
  function setDisplay(patch) { UT.setIn('display', patch); }
  function setPhysics(patch) { UT.setIn('physics', Object.assign({}, st().physics || {}, patch)); }
  function cycleRange() {
    const r = st().instrument.range;
    let i = RANGE_PRESETS.findIndex(function (p) { return p > r + 1e-6; });
    if (i < 0) i = 0;
    UT.setIn('instrument', { range: RANGE_PRESETS[i] });
  }
  function addPresetDefect(key) {
    if (has('test.addPreset')) return call('test.addPreset', [key]);
    const presets = has('specimens.defectPresets');
    if (!presets || !presets[key] || !st().specimen) return null;
    const d = presets[key](st().specimen);
    const defects = st().defects.slice();
    d.n = defects.length + 1;
    defects.push(d);
    UT.set({ defects: limitDefectSlots(defects, zOptsOf()) });
    return d;
  }
  /** Probes ▸ Phased Array Probe: v1 toggle pe ⇄ pa, plus the PA window (56) when switching to 'pa'. */
  function togglePa() {
    const toPa = st().probe.method !== 'pa';
    UT.setIn('probe', { method: toPa ? 'pa' : 'pe' });
    const panel = has('pa.panel') || has('pa.window');
    if (!panel) return;
    try {
      if (toPa) { if (typeof panel.open === 'function') panel.open(); else if (typeof panel.show === 'function') panel.show(); }
      else if (typeof panel.close === 'function') panel.close(); else if (typeof panel.hide === 'function') panel.hide();
    } catch (e) { console.error('[UT.app] pa panel', e); }
  }
  function toggleFinger() { UT.setIn('damping', Object.assign({}, st().damping || { points: [] }, { tool: !(st().damping && st().damping.tool) })); }
  function setMaterial(key) {
    if (!has('specimens.materials') || !UT.specimens.materials[key]) return false;
    if (has('test.setMaterial')) { call('test.setMaterial', [key]); return true; }
    UT.set({ material: key }, { noRender: true });
    if (has('modes.enter')) enterMode(currentMode(), { keepProbe: true, silentUI: true }); else reenterWeldLike();
    return true;
  }
  /** Sound alarm toggle (Options): unlock the AudioContext from the same user gesture. */
  function toggleSound() {
    const on = !st().display.sound;
    setDisplay({ sound: on });
    if (on) { armSoundUnlock(); try { UT.audio && UT.audio.unlock && UT.audio.unlock(); } catch (e) { /* ignore */ } }
  }
  /** One-time pointerdown/keydown listeners that create the AudioContext after display.sound turned on (§5.2 F3). */
  function armSoundUnlock() {
    const d = doc();
    if (!d || mem.soundArmed || !UT.audio || (UT.audio.ctx)) return;
    mem.soundArmed = true;
    const once = function () {
      d.removeEventListener('pointerdown', once, true); d.removeEventListener('keydown', once, true);
      mem.soundArmed = false;
      try { if (st().display.sound) UT.audio.unlock(); } catch (e) { /* ignore */ }
    };
    d.addEventListener('pointerdown', once, true);
    d.addEventListener('keydown', once, true);
  }
  function printReport() {
    const tr = st().trade || {};
    const hasTradeReport = has('trade.printReport') && (tr.result || (Array.isArray(tr.report) && tr.report.length) || tr.active);
    if (hasTradeReport) { call('trade.printReport'); return true; }
    return printGeneric();
  }

  // ------------------------------------------------------------------ toolbar model
  // Each entry: id (button id 'tb-<id>'), label (visible), tip (EN description) + ko (Korean) → tooltip (§8/§12).
  const TOOLBAR = [
    { id: '0', label: '0°', tip: '0° compression-wave probe (single/twin crystal)', ko: '0° 수직 탐촉자 (종파)', action: function () { setAngle(0); }, active: function () { return st().probe.angle === 0; } },
    { id: '45', label: '45°', tip: '45° shear-wave angle probe', ko: '45° 사각 탐촉자 (횡파)', action: function () { setAngle(45); }, active: function () { return st().probe.angle === 45; } },
    { id: '60', label: '60°', tip: '60° shear-wave angle probe', ko: '60° 사각 탐촉자 (횡파)', action: function () { setAngle(60); }, active: function () { return st().probe.angle === 60; } },
    { id: '70', label: '70°', tip: '70° shear-wave angle probe', ko: '70° 사각 탐촉자 (횡파)', action: function () { setAngle(70); }, active: function () { return st().probe.angle === 70; } },
    { gap: true },
    { id: 'v2', label: 'V2', tip: 'V2 (A4) calibration block: 25/50 mm radii, 5 mm hole', ko: 'V2 교정 시험편: 25/50 mm 반경, 5 mm 구멍', action: function () { toggleMode('v2'); }, active: function () { return currentMode() === 'v2'; } },
    { id: 'v1', label: 'V1', tip: 'V1 (A2) calibration block: 100 mm radius, 25/100 mm faces, 50 mm hole', ko: 'V1 교정 시험편: 100 mm 반경, 25/100 mm 면', action: function () { toggleMode('v1'); }, active: function () { return currentMode() === 'v1'; } },
    { id: 'dac', label: 'DAC', tip: 'record a distance-amplitude curve on the SDH block', ko: 'SDH 시험편에서 DAC 곡선 기록', action: function () { toggleMode('dac'); }, active: function () { return currentMode() === 'dac'; } },
    { gap: true },
    { id: 'plot', label: 'PLOT', tip: 'beam-spread plotting card on the IOW block (20 dB drop)', ko: 'IOW 시험편에서 빔 확산 플롯 (20 dB 드롭)', action: function () { toggleMode('iow'); }, active: function () { return currentMode() === 'iow'; } },
    { id: 'damp', label: 'DAMP', tip: 'toggle probe damping (shorter pulse, lower amplitude)', ko: '탐촉자 댐핑 켜기/끄기 (펄스 폭 감소)', action: function () { toggleDamping(); }, active: function () { return !!st().instrument.damping; } },
    { id: 'size', label: 'SIZE', tip: 'defect sizing panel: 6 dB / 20 dB drop, Mark L / Mark R', ko: '결함 크기 측정 패널: 6 dB / 20 dB 드롭', action: function () { toggleWindowOf('views.sizing'); }, active: function () { return winOpen('size'); } },
    { gap: true },
    { id: 'defect', label: 'DEFECT', tip: 'open the defect editor (position, length, height, type; draw with the brush)', ko: '결함 편집기 열기 (위치·길이·높이·종류, 브러시로 그리기)', action: function () { toggleWindowOf('modes.defectEditor'); }, active: function () { return winOpen('defects'); } },
    { id: 'hide', label: 'HIDE', tip: 'hide defects and beam for blind practice', ko: '결함과 빔 숨기기 (블라인드 연습)', action: function () { setDisplay({ hide: !st().display.hide }); }, active: function () { return !!st().display.hide; } },
    { id: 'clear', label: 'CLEAR', tip: 'clear peak memory, scans, plots and marks (defects are kept)', ko: '피크 메모리·스캔·플롯·마크 지우기 (결함은 유지)', action: clearAll, active: function () { return false; } },
    { gap: true },
    { id: 'beam', label: 'BEAM', tip: 'show / hide the sound beam', ko: '음향 빔 표시/숨기기', action: function () { setDisplay({ beam: !st().display.beam }); }, active: function () { return !!st().display.beam; } },
    { id: 'rad', label: 'RAD', tip: 'radiograph strip of the weld (compare with UT)', ko: '용접부 방사선 투과 사진 표시', action: function () { toggleWindowOf('views.radiograph'); }, active: function () { return winOpen('rad'); } },
    { gap: true },
    { id: 'pipe', label: 'PIPE', tip: 'switch plate weld ⇄ pipe circumferential weld (OD/WT in the Weld dialog)', ko: '평판 ⇄ 파이프 원주 용접부 전환 (Weld 대화상자의 OD/WT)', action: togglePipe, active: function () { return !!(st().weldOpts && st().weldOpts.pipe); } },
    { id: 'tky', label: 'TKY', tip: 'TKY tubular joint: brace / chord geometry', ko: 'TKY 관 이음: 브레이스/코드 형상', action: function () { toggleMode('tky'); }, active: function () { return currentMode() === 'tky'; } },
    { id: 'tofd', label: 'TOFD', tip: 'Time-of-Flight Diffraction: RF A-scan, D-scan, PCS', ko: 'TOFD (비행시간 회절법): RF A-스캔, D-스캔, PCS', action: function () { toggleMode('tofd'); }, active: function () { return currentMode() === 'tofd'; } },
    { id: 'aut', label: 'AUT', tip: 'Automated UT: strip charts, gates, colour map', ko: '자동 초음파 탐상: 스트립 차트, 게이트, 컬러 맵', action: function () { toggleMode('aut'); }, active: function () { return currentMode() === 'aut'; } },
  ];
  /** DAMP: instrument.damping (boolean) is the single source; pulser.damping Ω follows it (SPEC-v2 §3.7). */
  function toggleDamping() {
    const ins = st().instrument;
    const d = !ins.damping;
    const pulser = Object.assign({}, ins.pulser || { energy: 200, damping: 150, prf: 60 }, { damping: d ? 50 : 150 });
    UT.setIn('instrument', { damping: d, pulser });
  }
  /** Tooltip text for a toolbar button: label — EN description / KO (KO first when the UI language is Korean). */
  function tbTitle(def) {
    const en = def.tip || '', ko = def.ko || '';
    const parts = mem.lang === 'ko' ? [ko, en] : [en, ko];
    return def.label + (parts[0] ? ' — ' + parts[0] : '') + (parts[1] ? ' / ' + parts[1] : '');
  }
  const TB_IDS = TOOLBAR.filter(function (b) { return !b.gap; }).map(function (b) { return 'tb-' + b.id; });

  /** Whether a toolbar button is enabled in the current mode (§14.7). */
  function toolbarEnabled(id) {
    if (has('modes.isToolbarEnabled')) { try { return !!UT.modes.isToolbarEnabled(id); } catch (e) { return true; } }
    const en = has('modes.enabled');
    const row = en && en[currentMode()];
    if (row && Array.isArray(row.disabledToolbar)) return row.disabledToolbar.indexOf(id) < 0;
    if (row && Array.isArray(row.toolbar)) return row.toolbar.indexOf(id) >= 0;
    return true;
  }
  /** Whether a menu-bar entry is enabled in the current mode (§14.7). */
  function menuEnabled(id) {
    if (has('modes.isMenuEnabled')) { try { return !!UT.modes.isMenuEnabled(id); } catch (e) { return true; } }
    const en = has('modes.enabled');
    const row = en && en[currentMode()];
    if (row && Array.isArray(row.disabledMenus)) return row.disabledMenus.indexOf(id) < 0;
    if (row && Array.isArray(row.menus)) return row.menus.indexOf(id) >= 0;
    return true;
  }
  function activateToolbar(id) {
    const def = TOOLBAR.find(function (b) { return !b.gap && 'tb-' + b.id === id; });
    if (!def) return false;
    if (!toolbarEnabled(id)) return false;
    emitUi('tb-click', id);
    try { def.action(); } catch (e) { console.error('[UT.app] toolbar ' + id, e); }
    refreshToolbar();
    return true;
  }
  function refreshToolbar() {
    if (!mem.built) return;
    const custom = [0, 45, 60, 70].indexOf(st().probe.angle) < 0;   // custom angle: no .active angle button (§2)
    for (const def of TOOLBAR) {
      if (def.gap) continue;
      const el = mem.tb['tb-' + def.id];
      if (!el) continue;
      let active = false;
      try { active = !!def.active(); } catch (e) { active = false; }
      if (custom && ['0', '45', '60', '70'].indexOf(def.id) >= 0) active = false;
      const enabled = toolbarEnabled('tb-' + def.id);
      el.classList.toggle('active', active);
      el.classList.toggle('disabled', !enabled);
      el.setAttribute('aria-pressed', active ? 'true' : 'false');
      el.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }
    for (const id of Object.keys(mem.els.menus || {})) {
      const en = menuEnabled(id);
      mem.els.menus[id].classList.toggle('disabled', !en);
      mem.els.menus[id].setAttribute('aria-disabled', en ? 'false' : 'true');
    }
    refreshTouchBar();
  }

  // ------------------------------------------------------------------ menu model
  function sepItem() { return { sep: true }; }
  function radioProbe(key, field, value) {
    return { key, action: function () { const p = {}; p[field] = value; UT.setIn('probe', p); }, check: function () { return st().probe[field] === value; } };
  }
  /** Probe diameter items also write crystalDims (derive() reads the crystal size from crystalDims, not diameter). */
  function diameterItem(key, d) {
    return { key, action: function () { UT.setIn('probe', { diameter: d, crystalDims: { a: d, b: d, shape: 'round' } }); }, check: function () { const p = st().probe; return p.diameter === d && (!p.crystalDims || p.crystalDims.a === d); } };
  }
  function proceduresSub() {
    const sub = [];
    const list = has('standards.procedureList') ? (call('standards.procedureList') || []) : [];
    for (const p of list) {
      sub.push({ key: p.name || p.id, action: (function (id) { return function () { call('standards.applyProcedure', [id]); }; })(p.id), check: (function (id) { return function () { return !!(st().standards && st().standards.procedure === id); }; })(p.id) });
    }
    if (list.length) sub.push({ key: 'No procedure', action: function () { call('standards.applyProcedure', [null]); }, check: function () { return !(st().standards && st().standards.procedure); } }, sepItem());
    sub.push({ key: 'Procedures window…', action: function () { toggleWindowOf('standards.procedures', 'standards.proceduresWindow'); }, check: function () { return winOpen('procedures'); } });
    return sub;
  }
  function menuModel() {
    const s = st();
    const presetNames = has('specimens.defectPresetNames') || [];
    return [
      { id: 'menu-file', key: 'File', items: [
        { key: 'New', action: fileNew },
        { key: 'Save Setup', action: function () { app.saveNow(); UT.dom.alert(t('Setup saved to this browser (localStorage).'), 'Save Setup'); } },
        { key: 'Load Setup', action: fileLoad },
        sepItem(),
        { key: 'Save scenario…', action: function () { toggleWindowOf('scenario.window'); }, enabled: function () { return !!has('scenario.window'); }, check: function () { return winOpen('scenario'); } },
        { key: 'Load scenario…', action: function () { toggleWindowOf('scenario.window'); }, enabled: function () { return !!has('scenario.window'); } },
        { key: 'Share link…', action: function () { toggleWindowOf('scenario.share'); }, enabled: function () { return !!has('scenario.share'); }, check: function () { return winOpen('share'); } },
        sepItem(),
        { key: 'Export A-scan PNG', action: function () { openExport('cv-ascan'); } },
        { key: 'Print', action: function () { try { window.print(); } catch (e) { /* ignore */ } } },
        { key: 'Print report', action: printReport },
      ] },
      { id: 'menu-probes', key: 'Probes', items: [
        { key: 'Probe library…', action: openProbeLib, check: function () { return winOpen('probelib'); } },
        { key: 'Adjust Angle in Wedge (Shoe)', action: openWedge, check: function () { return st().probe.angle !== 0; } },
        { key: 'Zero Probe - Twin or Single Crystal', sub: [
          { key: 'Single Crystal', action: function () { zeroProbe('single'); }, check: function () { return st().probe.crystal !== 'twin'; } },
          { key: 'Twin Crystal', action: function () { zeroProbe('twin'); }, check: function () { return st().probe.crystal === 'twin'; } },
        ] },
        radioProbe('Pulse Echo', 'method', 'pe'),
        radioProbe('Through Transmission', 'method', 'tt'),
        radioProbe('Tandem (pitch catch)', 'method', 'tandem'),
        radioProbe('2.5 MHz Frequency', 'freq', 2.5),
        radioProbe('5 MHz Frequency', 'freq', 5),
        diameterItem('Probe Diameter 10mm', 10),
        diameterItem('Probe Diameter 5mm', 5),
        { key: 'Phased Array Probe', action: togglePa, check: function () { return st().probe.method === 'pa'; } },
        { key: 'Focus Beam', action: openFocus, check: function () { return !!(st().probe.focus && st().probe.focus.on); } },
        { key: 'Colour Code Display', sub: [
          { key: 'Mode Propagation', action: function () { setDisplay({ colourCode: st().display.colourCode === 'propagation' ? 'none' : 'propagation' }); }, check: function () { return st().display.colourCode === 'propagation'; } },
          { key: 'Geometry', action: function () { setDisplay({ colourCode: st().display.colourCode === 'geometry' ? 'none' : 'geometry' }); }, check: function () { return st().display.colourCode === 'geometry'; } },
        ] },
        { key: 'Number of Skips', sub: [1, 2, 3, 4].map(function (n) {
          return { key: String(n), action: function () { setDisplay({ skips: n }); }, check: function () { return st().display.skips === n; } };
        }) },
        { key: 'Single Line Beam', action: function () { setDisplay({ singleLine: !st().display.singleLine }); }, check: function () { return !!st().display.singleLine; } },
        sepItem(),
        { key: 'Mode conversion', action: function () { setPhysics({ modeConv: !st().physics.modeConv }); }, check: function () { return !!(st().physics && st().physics.modeConv); } },
        { key: 'Surface wave', action: function () { setPhysics({ surfaceWave: !st().physics.surfaceWave }); }, check: function () { return !!(st().physics && st().physics.surfaceWave); } },
        { key: 'Side lobes', action: function () { setPhysics({ sideLobes: !st().physics.sideLobes }); }, check: function () { return !!(st().physics && st().physics.sideLobes); } },
        { key: 'Finger damping tool', action: toggleFinger, check: function () { return !!(st().damping && st().damping.tool); } },
      ] },
      { id: 'menu-stepwedge', key: 'Step Wedge', items: [
        { key: 'Steps 5-25 mm (5 mm)', action: function () { enterStep([5, 10, 15, 20, 25], 40); }, check: function () { return stepIs([5, 10, 15, 20, 25]); } },
        { key: 'Steps 10-50 mm (10 mm)', action: function () { enterStep([10, 20, 30, 40, 50], 40); }, check: function () { return stepIs([10, 20, 30, 40, 50]); } },
        { key: 'Custom Steps...', action: openStepWedge },
        sepItem(),
        { key: 'Auto Cal', action: function () { if (currentMode() !== 'step') enterStep([5, 10, 15, 20, 25], 40); call('modes.autoCal.start'); }, enabled: function () { return !!has('modes.autoCal.start'); } },
        { key: 'Exit Step Wedge', action: function () { enterMode('weld', { keepProbe: false }); }, enabled: function () { return currentMode() === 'step' || currentMode() === 'fbh'; } },
        sepItem(),
        { key: 'FBH block', action: function () { toggleMode('fbh'); }, check: function () { return currentMode() === 'fbh'; } },
      ] },
      { id: 'menu-weld', key: 'Weld', items: [
        { key: 'Weld Settings...', action: openWeld },
        { key: 'Material…', action: openMaterial, check: function () { return winOpen('material'); } },
        { key: 'Presets', sub: WELD_PRESETS.map(function (p) {
          return { key: p.key, action: function () { applyWeldOpts(Object.assign({}, UT.defaultState().weldOpts, p.opts)); } };
        }) },
        sepItem(),
        { key: 'Pipe', action: togglePipe, check: function () { return !!(s.weldOpts && s.weldOpts.pipe); } },
        { key: 'TKY Joint', action: function () { toggleMode('tky'); }, check: function () { return currentMode() === 'tky'; } },
      ] },
      { id: 'menu-defects', key: 'Defects', items: [
        { key: 'Defect Editor...', action: function () { toggleWindowOf('modes.defectEditor'); }, check: function () { return winOpen('defects'); } },
        { key: 'Add Preset', sub: presetNames.map(function (p) { return { key: p.label, action: function () { addPresetDefect(p.key); } }; }), enabled: function () { return presetNames.length > 0; } },
        { key: 'Delete All Defects', action: function () { confirmDlg(t('Delete all defects?'), { title: 'ERASE ALL DEFECTS' }).then(function (ok) { if (ok) UT.set({ defects: [] }); }); }, enabled: function () { return !st().trade.active; } },
        { key: 'Hide Defects', action: function () { setDisplay({ hide: !st().display.hide }); }, check: function () { return !!st().display.hide; } },
        sepItem(),
        { key: 'Import Defects...', action: openImportDefects, enabled: function () { return !st().trade.active; } },
        { key: 'Export Defects...', action: openExportDefects },
        sepItem(),
        { key: 'Lamination Check', action: function () { toggleMode('lamination'); }, check: function () { return currentMode() === 'lamination'; } },
        { key: 'Trade Test...', action: function () { if (has('modes.tradeTest')) toggleWindowOf('modes.tradeTest'); else if (has('trade.window')) toggleWindowOf('trade.window'); else toggleMode('trade'); }, check: function () { return currentMode() === 'trade'; } },
        { key: 'Random practice…', action: function () { toggleWindowOf('trade.practiceWindow', 'modes.practice'); }, enabled: function () { return !!(has('trade.practiceWindow') || has('modes.practice')); }, check: function () { return winOpen('practice'); } },
      ] },
      { id: 'menu-tools', key: 'Tools', items: [
        { key: 'DGS diagram…', action: function () { toggleWindowOf('standards.dgs'); }, enabled: function () { return !!has('standards.dgs'); }, check: function () { return winOpen('dgs'); } },
        { key: 'Evaluation (standards)…', action: function () { toggleWindowOf('standards.evaluation'); }, enabled: function () { return !!has('standards.evaluation'); }, check: function () { return winOpen('evaluation'); } },
        { key: 'Procedures', sub: proceduresSub(), action: function () { toggleWindowOf('standards.procedures', 'standards.proceduresWindow'); }, enabled: function () { return !!has('standards'); } },
        sepItem(),
        { key: 'B-scan window', action: function () { toggleWindowOf('views.bscan'); }, enabled: function () { return !!has('views.bscan'); }, check: function () { return windowOfOpen('views.bscan', 'bscan'); } },
        { key: 'Echo dynamic window', action: function () { toggleWindowOf('views.echodyn'); }, enabled: function () { return !!has('views.echodyn'); }, check: function () { return windowOfOpen('views.echodyn', 'echodyn'); } },
        { key: 'Datalogger…', action: function () { toggleWindowOf('instruments.datalog'); }, enabled: function () { return !!has('instruments.datalog'); }, check: function () { return winOpen('datalog'); } },
        { key: 'Sizing…', action: function () { toggleWindowOf('views.sizing'); }, enabled: function () { return !!has('views.sizing'); }, check: function () { return winOpen('size'); } },
      ] },
      { id: 'menu-options', key: 'Options', items: [
        { key: 'UT Set', sub: [
          { key: 'EPOCH 600', action: function () { setUtSet('epoch600'); }, check: function () { return st().utSet === 'epoch600'; } },
          { key: 'EPOCH 4', action: function () { setUtSet('epoch4'); }, check: function () { return st().utSet === 'epoch4'; } },
          { key: 'USK7', action: function () { setUtSet('usk7'); }, check: function () { return st().utSet === 'usk7'; } },
        ] },
        { key: 'Units', sub: [
          { key: 'mm', action: function () { setDisplay({ units: 'mm' }); }, check: function () { return st().display.units !== 'inch'; } },
          { key: 'inch', action: function () { setDisplay({ units: 'inch' }); }, check: function () { return st().display.units === 'inch'; } },
        ] },
        { key: 'Colour Code', sub: [
          { key: 'None', action: function () { setDisplay({ colourCode: 'none' }); }, check: function () { return !st().display.colourCode || st().display.colourCode === 'none'; } },
          { key: 'Mode Propagation', action: function () { setDisplay({ colourCode: 'propagation' }); }, check: function () { return st().display.colourCode === 'propagation'; } },
          { key: 'Geometry', action: function () { setDisplay({ colourCode: 'geometry' }); }, check: function () { return st().display.colourCode === 'geometry'; } },
        ] },
        { key: 'Show Plan View', action: function () { setDisplay({ plan: !st().display.plan }); applyLayout(); }, check: function () { return st().display.plan !== false; } },
        { key: 'Show 3D Window', action: function () { setPipe3dShown(!pipe3dOpen()); }, check: pipe3dOpen },
        { key: 'Show Legend', action: function () { setDisplay({ legend: !st().display.legend }); }, check: function () { return st().display.legend !== false; } },
        { key: 'Language', sub: [
          { key: 'English', action: function () { app.setLang('en'); }, check: function () { return mem.lang === 'en'; } },
          { key: 'Korean (한국어)', action: function () { app.setLang('ko'); }, check: function () { return mem.lang === 'ko'; } },
        ] },
        sepItem(),
        { key: 'Sound alarm', action: toggleSound, check: function () { return !!st().display.sound; } },
        { key: 'Touch bar', sub: ['auto', 'on', 'off'].map(function (v) {
          return { key: v, action: function () { setDisplay({ touchBar: v }); }, check: function () { return (st().display.touchBar || 'auto') === v; } };
        }) },
        { key: 'High contrast', action: function () { setDisplay({ highContrast: !st().display.highContrast }); }, check: function () { return !!st().display.highContrast; } },
        { key: 'Auto-scale layout', action: function () { setDisplay({ scale: st().display.scale === 'fixed' ? 'auto' : 'fixed' }); }, check: function () { return st().display.scale !== 'fixed'; } },
        { key: 'Show dead zones', action: function () { UT.setIn('tofd', { deadZones: !(st().tofd && st().tofd.deadZones) }); }, check: function () { return !!(st().tofd && st().tofd.deadZones); } },
        sepItem(),
        { key: 'Options...', action: openOptions },
        { key: 'Reset Layout', action: resetLayout },
      ] },
      { id: 'menu-help', key: 'Help', items: [
        { key: 'About UTsim...', action: openAbout },
        { key: 'Quick Guide...', action: openGuide },
        { key: 'Keyboard Shortcuts...', action: openKeys },
        { key: 'Quick tour', action: function () { openTour(0); } },
        { key: 'Glossary…', action: openGlossary, check: function () { return winOpen('glossary'); } },
        { key: 'Standards notes…', action: function () { toggleWindowOf('standards.stdnotes'); }, enabled: function () { return !!has('standards.stdnotes'); }, check: function () { return winOpen('stdnotes'); } },
        sepItem(),
        { key: 'Lessons...', action: function () { toggleWindowOf('lessons.window', 'modes.lessonsWindow'); }, enabled: function () { return !!(has('lessons.window') || has('modes.lessonsWindow')); }, check: function () { return winOpen('lessons'); } },
        { key: 'Echo quiz…', action: function () { toggleWindowOf('lessons.quiz.window', 'lessons.quiz'); }, enabled: function () { return !!has('lessons.quiz'); }, check: function () { return winOpen('quiz'); } },
      ] },
    ];
  }
  const WELD_PRESETS = [
    { key: 'Plate 12 mm Single-V', opts: { T: 12, type: 'single-v', prep: 'single-v', bevel: 30, rootGap: 2, rootFace: 1.5, capWidth: 12, capHeight: 1.5, rootHeight: 1, pipe: false } },
    { key: 'Plate 20 mm Single-V', opts: { T: 20, type: 'single-v', prep: 'single-v', pipe: false } },
    { key: 'Plate 25 mm Double-V', opts: { T: 25, type: 'double-v', prep: 'double-v', bevel: 30, rootGap: 2, rootFace: 2, capWidth: 18, capHeight: 2, rootHeight: 2, pipe: false } },
    { key: 'Plate 40 mm Double-V', opts: { T: 40, type: 'double-v', prep: 'double-v', bevel: 25, rootGap: 3, rootFace: 3, capWidth: 26, capHeight: 2.5, rootHeight: 2.5, pipe: false } },
    { key: 'Plate 20 mm Single-bevel (K)', opts: { T: 20, prep: 'single-bevel', type: 'single-v', bevel: 45, rootGap: 2, rootFace: 2, pipe: false } },
    { key: 'Plate 25 mm Single-V with backing bar', opts: { T: 25, prep: 'single-v-backing', type: 'single-v', backing: true, rootGap: 6, rootHeight: 0, pipe: false } },
    { key: 'Fillet T-joint web 12', opts: { T: 20, prep: 'fillet-t', type: 'fillet', webT: 12, pipe: false } },
    { key: 'Pipe 6 inch WT 20', opts: { T: 20, wt: 20, od: 168.3, pipe: true } },
    { key: 'Pipe 8 inch WT 25', opts: { T: 25, wt: 25, od: 219.1, pipe: true, capWidth: 18 } },
    { key: 'Pipe 12 inch WT 30', opts: { T: 30, wt: 30, od: 323.9, pipe: true, capWidth: 20 } },
  ];
  /** Legacy weldOpts.type derived from prep (SPEC-v2 §2). */
  function typeOfPrep(prep) { return prep === 'double-v' ? 'double-v' : prep === 'none' ? 'none' : (prep === 'fillet-t' || prep === 'nozzle') ? 'fillet' : 'single-v'; }
  /** Write weldOpts (prep authoritative, type mirrored) and rebuild the weld-kind specimen. */
  function applyWeldOpts(o) {
    const v = Object.assign({}, o);
    if (v.backing && v.prep === 'single-v') v.prep = 'single-v-backing';
    if (!v.prep) v.prep = v.type === 'fillet' ? 'fillet-t' : (v.type || 'single-v');
    v.type = typeOfPrep(v.prep);
    v.backing = v.prep === 'single-v-backing';
    UT.setIn('weldOpts', v, { noRender: true });
    reenterWeldLike();
    syncPipe3d();
  }
  function zeroProbe(crystal) {
    const patch = { crystal };
    if (st().probe.angle !== 0 && toolbarEnabled('tb-0')) { patch.angle = 0; patch.mode = 'comp'; }
    UT.setIn('probe', patch);
  }
  function stepIs(steps) {
    const sp = st().specimen;
    return currentMode() === 'step' && !!sp && Array.isArray(sp.steps) && sp.steps.join(',') === steps.join(',');
  }
  function enterStep(steps, stepLen) { enterMode('step', { specimenOpts: { steps, stepLen: stepLen || 40 } }); }
  /** Parse a comma/space separated list of step thicknesses ("5,10,15") → sorted positive numbers. */
  function parseSteps(text) {
    const out = String(text || '').split(/[\s,;]+/).map(parseFloat).filter(function (v) { return Number.isFinite(v) && v > 0; });
    out.sort(function (a, b) { return a - b; });
    return out.filter(function (v, i) { return i === 0 || v !== out[i - 1]; });
  }

  // ------------------------------------------------------------------ menu DOM (role=menubar, keyboard model)
  function buildMenuBar() {
    const bar = h('div', { id: 'menubar', role: 'menubar', 'aria-label': 'Main menu' });
    mem.els.menus = {};
    let first = true;
    for (const top of menuModel()) {
      const item = h('div', { id: top.id, class: 'menu-item', role: 'menuitem', tabindex: first ? '0' : '-1', 'aria-haspopup': 'true', 'aria-expanded': 'false', dataset: { key: top.key } }, [h('span', { class: 'menu-label', dataset: { key: top.key } }, t(top.key))]);
      first = false;
      item.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        if (item.classList.contains('open')) closeMenus(); else openMenu(item, top.id);
      });
      item.addEventListener('mouseenter', function () { if (mem.openMenu && mem.openMenu !== item) openMenu(item, top.id); });
      bar.appendChild(item);
      mem.els.menus[top.id] = item;
    }
    return bar;
  }
  function openMenu(item, id, opts) {
    closeMenus(true);
    if (!menuEnabled(id)) return false;
    const top = menuModel().find(function (m) { return m.id === id; });
    if (!top) return false;
    const drop = h('div', { class: 'menu-drop', role: 'menu', 'aria-label': t(top.key), dataset: { menu: top.key } }, top.items.map(renderEntry));
    item.appendChild(drop);
    item.classList.add('open');
    item.setAttribute('aria-expanded', 'true');
    mem.openMenu = item;
    mem.kbFocus = null;
    if (opts && opts.keyboard) { try { item.focus(); } catch (e) { /* ignore */ } }
    emitUi('menu-open', id);
    return true;
  }
  function runEntry(it) {
    closeMenus();
    try { it.action && it.action(); } catch (err) { console.error('[UT.app] menu ' + it.key, err); }
    refreshToolbar();
  }
  function renderEntry(it) {
    if (it.sep) return h('div', { class: 'menu-sep', role: 'separator' });
    const enabled = it.enabled ? !!it.enabled() : true;
    let checked = false;
    try { checked = it.check ? !!it.check() : false; } catch (e) { checked = false; }
    const attrs = { class: 'menu-entry' + (it.sub ? ' has-sub' : '') + (enabled ? '' : ' disabled'), role: it.check ? 'menuitemcheckbox' : 'menuitem', tabindex: '-1', 'aria-disabled': enabled ? 'false' : 'true', dataset: { key: it.key } };
    if (it.check) attrs['aria-checked'] = checked ? 'true' : 'false';
    if (it.sub) { attrs['aria-haspopup'] = 'true'; attrs['aria-expanded'] = 'false'; }
    const el = h('div', attrs, [
      h('span', { class: 'm-check', 'aria-hidden': 'true' }, checked ? '✓' : ''),
      h('span', { class: 'm-label', dataset: { key: it.key } }, t(it.key)),
      it.sub ? h('span', { class: 'm-arrow', 'aria-hidden': 'true' }, '▶') : null,
      it.sub ? h('div', { class: 'menu-sub', role: 'menu', dataset: { menu: it.key } }, it.sub.map(renderEntry)) : null,
    ]);
    el._entry = it;
    if (!it.sub) {
      el.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); });
      el.addEventListener('mouseup', function (e) {
        e.stopPropagation();
        if (!enabled) return;
        runEntry(it);
      });
    } else {
      el.addEventListener('mousedown', function (e) { e.stopPropagation(); e.preventDefault(); el.classList.add('hover'); el.setAttribute('aria-expanded', 'true'); });
      if (it.action) el.addEventListener('dblclick', function (e) { e.stopPropagation(); if (enabled) runEntry(it); });
    }
    return el;
  }
  function closeMenus(keepReturn) {
    if (!mem.openMenu) return;
    const item = mem.openMenu;
    item.classList.remove('open');
    item.setAttribute('aria-expanded', 'false');
    const drop = item.querySelector('.menu-drop');
    if (drop) item.removeChild(drop);
    mem.openMenu = null;
    mem.kbFocus = null;
    if (!keepReturn && mem.kbReturn) {
      const ret = mem.kbReturn; mem.kbReturn = null;
      try { if (ret && ret.focus && doc() && doc().contains(ret)) ret.focus(); } catch (e) { /* ignore */ }
    } else if (!keepReturn) { try { item.blur(); } catch (e) { /* ignore */ } }
  }
  /** Tolerant label comparison for UT.test.menu: trailing '…'/'...' ignored, §8 spellings aliased to v1 keys. */
  function keyMatches(key, seg) {
    if (key === seg) return true;
    const strip = function (x) { return String(x).replace(/(\.\.\.|…)\s*$/, '').trim(); };
    if (strip(key) === strip(seg)) return true;
    const alias = MENU_ALIASES[seg];
    return !!alias && (alias === key || strip(alias) === strip(key));
  }
  /**
   * Resolve a label path ('Probes/Number of Skips/2') in the menu model and run its action synchronously.
   * @param {string} path exact English labels (data-key), '/'-separated
   * @returns {boolean} false when missing or disabled
   */
  function menuByPath(path) {
    const parts = String(path || '').split('/').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!parts.length) return false;
    const top = menuModel().find(function (m) { return m.key === parts[0]; });
    if (!top || !menuEnabled(top.id)) return false;
    let items = top.items, it = null;
    for (let i = 1; i < parts.length; i++) {
      it = (items || []).find(function (x) { return !x.sep && keyMatches(x.key, parts[i]); });
      // labels may themselves contain ' / ' (procedure names): re-join the following segments and retry
      for (let j = i + 1; !it && j < parts.length; j++) {
        const joined = parts.slice(i, j + 1).join(' / ');
        it = (items || []).find(function (x) { return !x.sep && (keyMatches(x.key, joined) || keyMatches(x.key, parts.slice(i, j + 1).join('/'))); });
        if (it) i = j;
      }
      if (!it) return false;
      if (it.enabled && !it.enabled()) return false;
      items = it.sub;
    }
    if (!it || typeof it.action !== 'function') return false;
    closeMenus();
    try { it.action(); } catch (e) { console.error('[UT.app] menu ' + path, e); return false; }
    refreshToolbar();
    return true;
  }
  // --- keyboard navigation (F10 / Alt / arrows / Enter / Esc)
  function enabledTops() { return Object.keys(mem.els.menus || {}).filter(menuEnabled); }
  function openTopByIndex(i, keyboard) {
    const ids = enabledTops();
    if (!ids.length) return false;
    const id = ids[((i % ids.length) + ids.length) % ids.length];
    return openMenu(mem.els.menus[id], id, { keyboard: keyboard !== false });
  }
  /** Open the menu bar from the keyboard (F10 / Alt): remembers the element to return the focus to. */
  function kbOpenMenu(id) {
    const d = doc();
    if (!mem.built || !d) return false;
    if (!mem.openMenu) mem.kbReturn = d.activeElement && d.activeElement !== d.body ? d.activeElement : null;
    if (id) return openMenu(mem.els.menus[id], id, { keyboard: true });
    return openTopByIndex(0, true);
  }
  function entriesOf(container) {
    return Array.from(container.querySelectorAll(':scope > .menu-entry')).filter(function (e) { return !e.classList.contains('disabled'); });
  }
  function kbFocusEntry(el) {
    if (mem.kbFocus && mem.kbFocus !== el) mem.kbFocus.classList.remove('kb');
    mem.kbFocus = el;
    if (el) { el.classList.add('kb'); try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  function kbMove(dir) {
    const drop = mem.openMenu && mem.openMenu.querySelector('.menu-drop');
    if (!drop) return;
    const container = mem.kbFocus && mem.kbFocus.parentNode && mem.kbFocus.parentNode.classList.contains('menu-sub') ? mem.kbFocus.parentNode : drop;
    const list = entriesOf(container);
    if (!list.length) return;
    let i = list.indexOf(mem.kbFocus);
    i = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    kbFocusEntry(list[i]);
  }
  function kbOpenSub() {
    const el = mem.kbFocus;
    if (!el || !el.classList.contains('has-sub')) return false;
    el.classList.add('hover'); el.setAttribute('aria-expanded', 'true');
    const list = entriesOf(el.querySelector(':scope > .menu-sub'));
    if (list.length) kbFocusEntry(list[0]);
    return true;
  }
  function kbCloseSub() {
    const el = mem.kbFocus;
    const sub = el && el.parentNode && el.parentNode.classList.contains('menu-sub') ? el.parentNode : null;
    if (!sub) return false;
    const parent = sub.parentNode;
    parent.classList.remove('hover'); parent.setAttribute('aria-expanded', 'false');
    kbFocusEntry(parent);
    return true;
  }
  function kbActivate() {
    const el = mem.kbFocus;
    if (!el) { kbMove(1); return; }
    const it = el._entry;
    if (!it) return;
    if (it.sub && !it.action) { kbOpenSub(); return; }
    if (it.sub && it.action && !el.classList.contains('hover')) { kbOpenSub(); return; }
    runEntry(it);
  }
  /** Handle a keydown while a menu is open (returns true when consumed). */
  function menuKey(ev) {
    if (!mem.openMenu) return false;
    const ids = enabledTops();
    const idx = ids.indexOf(mem.openMenu.id);
    switch (ev.key) {
      case 'Escape': closeMenus(); return true;
      case 'ArrowDown': kbMove(1); return true;
      case 'ArrowUp': kbMove(-1); return true;
      case 'ArrowRight': if (!kbOpenSub()) openTopByIndex(idx + 1, true); return true;
      case 'ArrowLeft': if (!kbCloseSub()) openTopByIndex(idx - 1, true); return true;
      case 'Home': { const l = entriesOf(mem.openMenu.querySelector('.menu-drop')); if (l.length) kbFocusEntry(l[0]); return true; }
      case 'End': { const l = entriesOf(mem.openMenu.querySelector('.menu-drop')); if (l.length) kbFocusEntry(l[l.length - 1]); return true; }
      case 'Enter': case ' ': kbActivate(); return true;
      case 'Tab': closeMenus(); return false;
      default: return false;
    }
  }

  // ------------------------------------------------------------------ layout
  /**
   * Build the whole page into #app (title bar, menu bar, toolbar, main grid, touch bar, status bar) and the
   * print root on document.body. Idempotent.
   * @returns {HTMLElement} the #app element
   */
  function buildLayout() {
    const d = doc();
    if (!d) return null;
    let root = d.getElementById('app');
    if (!root) { root = h('div', { id: 'app' }); d.body.appendChild(root); }
    if (mem.built) return root;
    root.textContent = '';
    mem.els.app = root;
    root.appendChild(h('div', { id: 'titlebar' }, [
      h('span', { class: 'tb-icon' }),
      h('span', { class: 'tb-name' }, 'UTsim — UTman-style Ultrasonic Simulator'),
      h('span', { class: 'tb-sub' }, '|  NDT Verification and Coaching'),
      h('span', { class: 'tb-ver' }, 'v' + UT.VERSION + '  ·  inspired by UTman / utsim.co.uk'),
    ]));
    root.appendChild(buildMenuBar());
    // toolbar
    const tb = h('div', { id: 'toolbar', role: 'toolbar', 'aria-label': 'Toolbar' });
    for (const def of TOOLBAR) {
      if (def.gap) { tb.appendChild(h('span', { class: 'tb-gap' })); continue; }
      const id = 'tb-' + def.id;
      const btn = h('button', { id, class: 'tb-btn', type: 'button', title: tbTitle(def), 'aria-label': def.label + ' — ' + (def.tip || ''), 'aria-pressed': 'false', dataset: { key: def.label } }, [
        h('span', { class: 'tb-ico', html: ICONS[def.id] || '' }),
        h('span', { class: 'tb-lbl' }, def.label),
      ]);
      btn.addEventListener('click', function (e) { e.preventDefault(); closeMenus(); activateToolbar(id); });
      btn.addEventListener('pointerenter', function () { emitUi('tb-hover', id); });
      tb.appendChild(btn);
      mem.tb[id] = btn;
    }
    root.appendChild(tb);
    // main grid
    const cvPlan = h('canvas', { id: 'cv-plan', role: 'img', 'aria-label': 'Plan view of the weld: probe position along the weld, skew compass' });
    const cvPlotter = h('canvas', { id: 'cv-plotter', role: 'img', 'aria-label': 'Beam plotting card' });
    const cvRuler = h('canvas', { id: 'cv-ruler', role: 'img', 'aria-label': 'X ruler (mm from the weld centre)' });
    const cvCross = h('canvas', { id: 'cv-cross', role: 'img', 'aria-label': 'Cross-section: specimen, probe, sound beam and defects' });
    const instrument = h('div', { id: 'instrument', tabindex: '0', role: 'region', 'aria-label': 'Flaw detector' });
    const main = h('div', { id: 'main' }, [
      instrument,
      h('div', { id: 'plan-area' }, [cvPlan, cvPlotter]),
      h('div', { id: 'ruler-area' }, [cvRuler]),
      h('div', { id: 'cross-area' }, [cvCross]),
    ]);
    root.appendChild(main);
    Object.assign(mem.els, { main, instrument, cvPlan, cvPlotter, cvRuler, cvCross });
    root.appendChild(buildTouchBar());
    // status bar
    const sb = h('div', { id: 'statusbar', role: 'status' }, [
      h('span', { class: 'sb-panel sb-left' }, ''),
      h('span', { class: 'sb-mid' }),
      h('span', { class: 'sb-panel sb-right', 'aria-live': 'polite' }, ''),
    ]);
    root.appendChild(sb);
    mem.els.statusbar = sb;
    if (!d.getElementById('print-root')) d.body.appendChild(h('div', { id: 'print-root' }));
    mem.built = true;
    bindGlobalEvents();
    applyA11y();
    applyScale();
    applyLayout();
    refreshToolbar();
    return root;
  }
  function hiddenViews() {
    let hidden = [];
    if (has('modes.hiddenViews')) { try { hidden = UT.modes.hiddenViews() || []; } catch (e) { hidden = []; } }
    else {
      const en = has('modes.enabled');
      const row = en && en[currentMode()];
      hidden = row && Array.isArray(row.hidden) ? row.hidden.slice() : (HIDDEN_FALLBACK[currentMode()] || []).slice();
    }
    if (st().display.plan === false && hidden.indexOf('plan') < 0) hidden.push('plan');
    return hidden;
  }
  /** Apply mode-dependent layout classes (#main.block/.no-ruler/.plot/.usk7) and request a render. */
  function applyLayout() {
    const main = mem.els.main;
    if (!main) return;
    const mode = currentMode();
    const hidden = hiddenViews();
    const plot = mode === 'iow';
    main.classList.toggle('plot', plot);
    main.classList.toggle('tall', ['iow', 'dac', 'step', 'lamination', 'fbh'].indexOf(mode) >= 0);
    main.classList.toggle('tt', st().probe.method === 'tt' && mode !== 'tofd');
    main.classList.toggle('block', !plot && hidden.indexOf('plan') >= 0);
    main.classList.toggle('no-ruler', hidden.indexOf('ruler') >= 0);
    main.classList.toggle('usk7', st().utSet === 'usk7');
    refreshTouchBar();
    UT.requestRender();
  }
  /** High contrast / reduced motion / finger cursor classes on #app (§5.7). */
  function applyA11y() {
    const root = mem.els.app;
    if (!root) return;
    root.classList.toggle('hc', !!st().display.highContrast);
    root.classList.toggle('reduced-motion', reducedMotion());
    root.classList.toggle('finger-tool', !!(st().damping && st().damping.tool));
  }
  /** True when the OS asks for reduced motion (scan owners step synchronously). */
  function reducedMotion() {
    const w = win_();
    if (!w || typeof w.matchMedia !== 'function') return false;
    try { if (!mem.motionMq) mem.motionMq = w.matchMedia('(prefers-reduced-motion: reduce)'); return !!mem.motionMq.matches; } catch (e) { return false; }
  }
  function coarsePointer() {
    const w = win_();
    if (!w || typeof w.matchMedia !== 'function') return false;
    try {
      if (!mem.coarseMq) { mem.coarseMq = w.matchMedia('(pointer: coarse)'); if (mem.coarseMq && mem.coarseMq.addEventListener) mem.coarseMq.addEventListener('change', function () { refreshTouchBar(); }); }
      return !!mem.coarseMq.matches;
    } catch (e) { return false; }
  }
  /**
   * Design-box scaling (SPEC-v2 §5.4): display.scale 'auto' → #app.scaled (1280 × 760) transformed by
   * k = clamp(min(innerW/1280, innerH/760), 0.6, 1.6); 'fixed' → v1 rules (100vh, no transform, k = 1).
   * @returns {number} the scale factor in use
   */
  function applyScale() {
    const root = mem.els.app, w = win_(), d = doc();
    if (!root || !w || !d) return 1;
    const auto = st().display.scale !== 'fixed';
    let k = 1;
    if (auto) {
      const iw = w.innerWidth || DESIGN_W, ih = w.innerHeight || DESIGN_H;
      k = M.clamp(Math.min(iw / DESIGN_W, ih / DESIGN_H), 0.6, 1.6);
      root.classList.add('scaled');
      root.style.transform = 'scale(' + k.toFixed(4) + ')';
      root.style.left = Math.max(0, Math.floor((iw - DESIGN_W * k) / 2)) + 'px';
    } else {
      root.classList.remove('scaled');
      root.style.transform = '';
      root.style.left = '';
    }
    d.documentElement.classList.toggle('scaled', auto);
    mem.scale = k;
    return k;
  }
  function onResize() {
    const k0 = mem.scale;
    applyScale();
    if (mem.els.app) UT.bus.emit('resize', { w: mem.els.app.clientWidth, h: mem.els.app.clientHeight, scale: mem.scale });
    if (k0 !== mem.scale) for (const n of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[n]; if (w && w.isOpen()) clampToViewport(w); }
    if (mem.tour.open) positionTour();
    UT.requestRender();
  }

  // ------------------------------------------------------------------ touch bar (§5.4)
  const TB_STEPS = [1, 5, 10];
  function touchDefs() {
    const s = st();
    const moveX = function (dir) { const p = st().probe, ss = scanRange(); UT.setIn('probe', { x: +M.clamp(p.x + dir * mem.touch.step, ss.xMin, ss.xMax).toFixed(1) }); };
    const moveZ = function (dir) {
      const sp = st().specimen, L = (sp && sp.L) || 300; let z = st().probe.z + dir * mem.touch.step;
      if (sp && sp.pipe) z = ((z % L) + L) % L; else z = M.clamp(z, 0, L);
      UT.setIn('probe', { z: +z.toFixed(1) });
    };
    const gain = function (dir) { UT.setIn('instrument', { gain: M.clamp(st().instrument.gain + dir, 0, 110) }); };
    return [
      { id: 'left', label: '◀', title: 'Probe left (x −)', repeat: true, action: function () { moveX(-1); } },
      { id: 'right', label: '▶', title: 'Probe right (x +)', repeat: true, action: function () { moveX(1); } },
      { id: 'up', label: '▲', title: 'Probe along the weld (z −)', repeat: true, action: function () { moveZ(-1); } },
      { id: 'down', label: '▼', title: 'Probe along the weld (z +)', repeat: true, action: function () { moveZ(1); } },
      { id: 'minus', label: '−', title: 'Gain −1 dB', repeat: true, action: function () { gain(-1); } },
      { id: 'plus', label: '+', title: 'Gain +1 dB', repeat: true, action: function () { gain(1); } },
      { id: 'range', label: 'Range', title: 'Range 50 → 100 → 200 → 400 mm', action: cycleRange },
      { id: 'freeze', label: 'Freeze', title: 'Freeze the A-scan', action: function () { UT.setIn('instrument', { freeze: !st().instrument.freeze }); }, active: function () { return !!st().instrument.freeze; } },
      { id: 'peak', label: 'Peak', title: 'Peak memory', action: function () { UT.setIn('instrument', { peakMem: !st().instrument.peakMem }); }, active: function () { return !!st().instrument.peakMem; } },
      { id: 'hide', label: 'Hide', title: 'Hide defects and beam', action: function () { activateToolbar('tb-hide'); }, active: function () { return !!s.display.hide; } },
      { id: 'markl', label: 'Mark L', title: 'Sizing: mark the left drop point', ctx: 'sizing', action: function () { call('views.sizing.markL'); } },
      { id: 'markr', label: 'Mark R', title: 'Sizing: mark the right drop point', ctx: 'sizing', action: function () { call('views.sizing.markR'); } },
      { id: 'row', label: 'Row+', title: 'Trade test: add a report row from the readouts', ctx: 'trade', action: function () { if (has('trade.addRowFromReadout')) call('trade.addRowFromReadout'); else call('test.trade.addRowFromReadout'); } },
    ];
  }
  function buildTouchBar() {
    const bar = h('div', { id: 'touchbar', role: 'toolbar', 'aria-label': 'Touch bar' });
    mem.touch.els = {};
    for (const def of touchDefs()) {
      const btn = h('button', { id: 'tbar-' + def.id, class: 'tbar-btn' + (def.ctx ? ' ctx-' + def.ctx : ''), type: 'button', title: t(def.title), 'aria-label': t(def.title), dataset: { i18n: def.title }, 'aria-pressed': def.active ? 'false' : null }, t(def.label));
      bindRepeat(btn, def);
      bar.appendChild(btn);
      mem.touch.els[def.id] = btn;
    }
    const step = h('button', { id: 'tbar-step', class: 'tbar-btn tbar-step', type: 'button', title: t('Step size for ◀ ▶ ▲ ▼'), 'aria-label': t('Step size for ◀ ▶ ▲ ▼') }, t('Step {n} mm', { n: mem.touch.step }));
    step.addEventListener('click', function () { mem.touch.step = TB_STEPS[(TB_STEPS.indexOf(mem.touch.step) + 1) % TB_STEPS.length]; step.textContent = t('Step {n} mm', { n: mem.touch.step }); });
    bar.appendChild(step);
    mem.touch.els.step = step;
    mem.els.touchbar = bar;
    return bar;
  }
  /** Pointer auto-repeat: fire on pointerdown, then every 83 ms after 400 ms (12 Hz) until release. */
  function bindRepeat(btn, def) {
    const stop = function () { if (mem.touch.timer) { clearTimeout(mem.touch.timer); clearInterval(mem.touch.timer); mem.touch.timer = null; } };
    const fire = function () { try { def.action(); } catch (e) { console.error('[UT.app] touch ' + def.id, e); } refreshToolbar(); };
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      stop();
      fire();
      if (def.repeat) mem.touch.timer = setTimeout(function () { mem.touch.timer = setInterval(fire, 83); }, 400);
    });
    const end = function () { stop(); };
    btn.addEventListener('pointerup', end); btn.addEventListener('pointercancel', end); btn.addEventListener('lostpointercapture', end);
    btn.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    btn.addEventListener('click', function (e) { e.preventDefault(); });
  }
  function touchBarVisible() {
    const v = st().display.touchBar || 'auto';
    return v === 'on' || (v === 'auto' && coarsePointer());
  }
  function refreshTouchBar() {
    const bar = mem.els.touchbar;
    if (!bar) return;
    const show = touchBarVisible();
    bar.classList.toggle('shown', show);
    if (mem.els.app) mem.els.app.classList.toggle('with-touchbar', show);
    if (!show) return;
    const s = st();
    const sizing = winOpen('size'), trade = !!(s.trade && s.trade.active);
    for (const def of touchDefs()) {
      const el = mem.touch.els[def.id];
      if (!el) continue;
      if (def.ctx === 'sizing') el.hidden = !sizing;
      if (def.ctx === 'trade') el.hidden = !trade;
      if (def.active) el.setAttribute('aria-pressed', def.active() ? 'true' : 'false');
      el.classList.toggle('active', !!(def.active && def.active()));
    }
  }

  // ------------------------------------------------------------------ global events
  function bindGlobalEvents() {
    const d = doc(), w = win_();
    d.addEventListener('mousedown', function (e) { if (mem.openMenu && !mem.openMenu.contains(e.target)) closeMenus(); });
    d.addEventListener('keydown', onKey);
    d.addEventListener('keyup', onKeyUp);
    if (typeof ResizeObserver === 'function') {
      mem.resizeObs = new ResizeObserver(function () { UT.requestRender(); UT.bus.emit('resize', { w: mem.els.app.clientWidth, h: mem.els.app.clientHeight, scale: mem.scale }); });
      mem.resizeObs.observe(mem.els.app);
    }
    w.addEventListener('resize', onResize);
    w.addEventListener('beforeprint', function () { const pr = byId('print-root'); d.body.classList.toggle('print-report', !!(pr && pr.childNodes.length)); });
    w.addEventListener('afterprint', function () { d.body.classList.remove('print-report'); if (mem.printPending) { mem.printPending = false; const pr = byId('print-root'); if (pr) pr.textContent = ''; } });
    UT.bus.on('render', onRender);
    UT.bus.on('status', renderStatus);
    UT.bus.on('state', onState);
    UT.bus.on('mode', function () { applyLayout(); refreshToolbar(); });
    UT.bus.on('win:show', function (wapi) { keepBelowToolbar(wapi); bindWinClamp(wapi); clampToViewport(wapi); refreshToolbar(); if (wapi && wapi.name) emitUi('window-open', wapi.name); });
    UT.bus.on('win:hide', refreshToolbar);
    UT.bus.on('win:close', function (wapi) {
      // ✕ on the 3-D window = the user no longer wants it: clear display.pipe3d so that Options ▸
      // Show 3D Window is unchecked and a single click re-opens it (64-view-3d does the same in onClose)
      if (wapi && wapi.name === 'pipe3d' && st().display && st().display.pipe3d) UT.setIn('display', { pipe3d: false }, { noRender: true });
      refreshToolbar();
    });
    UT.bus.on('resize', function () { for (const k of Object.keys(UT.dom.wins)) { const wapi = UT.dom.wins[k]; if (wapi && wapi.isOpen()) clampToViewport(wapi); } });
    UT.bus.on('lang', onLang);
    if (typeof w.matchMedia === 'function') {
      try { const mq = w.matchMedia('(prefers-reduced-motion: reduce)'); if (mq && mq.addEventListener) mq.addEventListener('change', applyA11y); } catch (e) { /* ignore */ }
    }
  }
  /** App box in design px (offsetWidth/Height are unaffected by the transform). */
  function appBox() {
    const root = mem.els.app;
    if (root && root.offsetWidth) return { w: root.offsetWidth, h: root.offsetHeight };
    const w = win_();
    return { w: w ? w.innerWidth : DESIGN_W, h: w ? w.innerHeight : DESIGN_H };
  }
  /**
   * Keep a floating window inside the app box (design px, §5.4): the full window where it fits, otherwise at
   * least the title bar (≥ 40 px of it horizontally) stays reachable; never above the toolbar.
   */
  function clampToViewport(w) {
    if (!w || !w.el || !w.isOpen() || typeof window === 'undefined') return;
    const el = w.el, box = appBox(), vw = box.w, vh = box.h;
    if (!(vw > 0 && vh > 0)) return;
    const k = UT.dom.scale() || 1;
    const r = el.getBoundingClientRect();
    const rw = r.width / k, rh = r.height / k;
    const tb = mem.built && !el.classList.contains('modal') ? byId('toolbar') : null;
    const minTop = tb ? Math.round(tb.offsetTop + tb.offsetHeight + 2) : 0;
    const titleH = Math.max(20, (el.firstChild && el.firstChild.offsetHeight) || 0);
    const maxLeft = Math.max(0, vw - rw);
    const maxTop = Math.max(minTop, vh - rh);
    const left = M.clamp(el.offsetLeft, Math.min(0, vw - 40 - rw), Math.min(maxLeft, vw - 40));
    const top = M.clamp(el.offsetTop, minTop, Math.max(minTop, Math.min(maxTop, vh - titleH)));
    if (left !== el.offsetLeft) el.style.left = Math.floor(left) + 'px';
    if (top !== el.offsetTop) el.style.top = Math.floor(top) + 'px';
  }
  /** Wrap 00-core's title-bar drag (frozen) with a viewport clamp: our listeners run after core's. */
  function bindWinClamp(w) {
    if (!w || !w.el || w.el.dataset.clampBound) return;
    w.el.dataset.clampBound = '1';
    const title = w.el.querySelector('.win-title');
    if (!title) return;
    let dragging = false;
    title.addEventListener('pointerdown', function (e) { if ((e.button === 0 || e.button === undefined) && !(e.target && e.target.classList && e.target.classList.contains('win-close'))) dragging = true; });
    title.addEventListener('pointermove', function () { if (dragging) clampToViewport(w); });
    const end = function () { if (dragging) { dragging = false; clampToViewport(w); } };
    title.addEventListener('pointerup', end); title.addEventListener('pointercancel', end);
  }
  /** Floating (non-modal) windows never cover the menu bar / toolbar: nudge them below the toolbar. */
  function keepBelowToolbar(w) {
    if (!w || !w.el || !mem.built || w.el.classList.contains('modal')) return;
    const tb = byId('toolbar');
    if (!tb) return;
    const limit = tb.offsetTop + tb.offsetHeight + 2;
    if (w.el.offsetTop < limit) w.el.style.top = Math.round(limit) + 'px';
  }
  function onState(ev) {
    const keys = (ev && ev.keys) || [];
    if (keys.indexOf('cursor') >= 0) { updateMid(); }
    if (keys.indexOf('status') >= 0 || (keys.length === 1 && keys[0] === 'cursor')) return;
    if (keys.indexOf('utSet') >= 0) { call('instruments.setSkin', [st().utSet]); applyLayout(); }
    if (keys.indexOf('display') >= 0) { applyA11y(); applyScale(); onResizeSoft(); armSoundIfOn(); }
    if (keys.indexOf('damping') >= 0) applyA11y();
    if (keys.indexOf('mode') >= 0 || keys.indexOf('display') >= 0) applyLayout();
    else if (keys.indexOf('probe') >= 0 && mem.els.main && mem.els.main.classList.contains('tt') !== (st().probe.method === 'tt' && currentMode() !== 'tofd')) applyLayout();
    if (keys.indexOf('trade') >= 0) refreshTouchBar();
    if (keys.indexOf('trade') >= 0 || keys.indexOf('standards') >= 0) syncProbeLibLock();
    refreshToolbar();
    scheduleSave(keys);
  }
  function onResizeSoft() { if (mem.els.app) UT.bus.emit('resize', { w: mem.els.app.clientWidth, h: mem.els.app.clientHeight, scale: mem.scale }); }
  function armSoundIfOn() { if (st().display.sound && UT.audio && !UT.audio.ctx) armSoundUnlock(); }

  // ------------------------------------------------------------------ status bar
  function midParts(frame) {
    const s = st(), p = s.probe, ins = s.instrument;
    const inch = s.display.units === 'inch';
    const parts = [];
    parts.push(inch ? 'Pos: ' + (p.x / 25.4).toFixed(2) + ' in' : 'Pos: ' + fmtNum(p.x) + ' mm');
    parts.push(inch ? 'Range ' + (ins.range / 25.4).toFixed(2) + 'in' : 'Range ' + (+ins.range).toFixed(1) + 'mm');
    parts.push('AMP= ' + fmtNum(s.mode === 'tofd' && s.tofd && Number.isFinite(s.tofd.gainDb) ? s.tofd.gainDb : ins.gain) + 'dB');
    let extra = '';
    if (has('modes.statusMid')) { try { extra = UT.modes.statusMid() || ''; } catch (e) { extra = ''; } }
    else if (s.specimen && s.specimen.pipe) extra = 'WT ' + s.specimen.pipe.wt + 'mm  Dia ' + s.specimen.pipe.odInch + 'inch';
    for (const seg of String(extra).split(/\s{3,}|\s\|\s/)) if (seg.trim()) parts.push(seg.trim());
    const c = s.cursor;
    if (c && typeof c.y === 'number' && !Number.isNaN(c.y)) {
      parts.push(s.mode === 'tofd' ? 'Depth: ' + c.y.toFixed(1) : (inch ? 'Depth = ' + (c.y / 25.4).toFixed(3) + 'in' : 'Depth = ' + c.y.toFixed(1) + 'mm'));
    } else if (c && c.view === 'dscan' && typeof c.depth === 'number' && !Number.isNaN(c.depth)) {
      parts.push('Depth: ' + c.depth.toFixed(1));
    }
    void frame;
    return parts;
  }
  function leftText(frame) {
    if (frame && frame.derived && frame.derived.statusLine) return frame.derived.statusLine;
    const d = has('probe.derive') ? call('probe.derive', [st().probe, st().specimen]) : null;
    return d && d.statusLine ? d.statusLine : '';
  }
  function updateMid() {
    const mid = midParts(UT.frame).join(' | ');
    if (mid !== mem.lastMid) { mem.lastMid = mid; UT.status({ mid }); }
  }
  function onRender(frame) {
    const left = leftText(frame);
    const mid = midParts(frame).join(' | ');
    if (left !== mem.lastLeft || mid !== mem.lastMid) {
      mem.lastLeft = left; mem.lastMid = mid;
      UT.status({ left, mid });
    } else if (mem.els.statusbar && !mem.els.statusbar.firstChild.textContent) renderStatus(st().status);
  }
  /** Render state.status (left physics line, middle sunken panels, right hint) into #statusbar. */
  function renderStatus(status) {
    const sb = mem.els.statusbar;
    if (!sb) return;
    const s = status || st().status || {};
    const left = sb.querySelector('.sb-left'), mid = sb.querySelector('.sb-mid'), right = sb.querySelector('.sb-right');
    if (left.textContent !== (s.left || '')) left.textContent = s.left || '';
    const segs = Array.isArray(s.segments) && s.segments.length ? s.segments.map(String) : String(s.mid || '').split(' | ').filter(Boolean);
    const key = segs.join('');
    if (mid.dataset.key !== key) {
      mid.dataset.key = key;
      mid.textContent = '';
      for (const seg of segs) mid.appendChild(h('span', { class: 'sb-panel' }, seg));
    }
    const rt = s.right ? t(s.right) : '';
    if (right.textContent !== rt) { right.textContent = rt; right.title = rt; }   // tooltip = full hint when ellipsized
    right.classList.toggle('empty', !rt);
  }

  // ------------------------------------------------------------------ keyboard
  function onKeyUp(ev) {
    if (ev.key === 'Alt' && mem.altArmed) { mem.altArmed = false; if (!mem.openMenu) { kbOpenMenu(); ev.preventDefault(); } return; }
    if (ev.key !== 'Alt') mem.altArmed = false;
  }
  function onKey(ev) {
    const key = ev.key;
    // menu bar entry: F10, Alt released alone, Alt+letter (§5.7)
    if (key === 'Alt') { mem.altArmed = !ev.ctrlKey && !ev.shiftKey && !ev.metaKey; return; }
    mem.altArmed = false;
    if (key === 'F10') { ev.preventDefault(); if (mem.openMenu) closeMenus(); else kbOpenMenu(); return; }
    if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ALT_MENU[String(key).toLowerCase()] && menuEnabled(ALT_MENU[String(key).toLowerCase()])) { ev.preventDefault(); kbOpenMenu(ALT_MENU[String(key).toLowerCase()]); return; }
    if (mem.openMenu && menuKey(ev)) { ev.preventDefault(); return; }
    if (key === 'Escape' && mem.tour.open) { closeTour(); ev.preventDefault(); return; }
    const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
    const editable = tag === 'input' || tag === 'textarea' || tag === 'select' || !!(ev.target && ev.target.isContentEditable);
    // Esc closes the top window also while a dialog field has the focus (SPEC v1 keyboard table) — before the editable early return
    if (key === 'Escape' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      if (mem.openMenu) { closeMenus(); ev.preventDefault(); return; }
      if (UT.dom.closeTopWindow()) { if (editable) { try { ev.target.blur(); } catch (e) { /* ignore */ } } ev.preventDefault(); }
      return;
    }
    if (editable) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (key.indexOf('Arrow') === 0 || key === 'Enter') {
      let used = false;
      try { used = !!(has('instruments.handleKey') && UT.instruments.handleKey(ev)); } catch (e) { used = false; }
      if (used) return;
    }
    if (key === 'Enter' || key === ' ') return;   // buttons / focused controls keep their default activation
    const s = st(), p = s.probe;
    const stepX = ev.shiftKey ? 10 : 1;
    switch (key) {
      case 'ArrowLeft': case 'ArrowRight': {
        if (s.editing && s.editing.defect) return;
        const ss = scanRange();
        const x = M.clamp(p.x + (key === 'ArrowLeft' ? -stepX : stepX), ss.xMin, ss.xMax);
        UT.setIn('probe', { x: +x.toFixed(1) });
        break;
      }
      case 'ArrowUp': case 'ArrowDown': {
        const L = (s.specimen && s.specimen.L) || 300;
        let z = p.z + (key === 'ArrowUp' ? -stepX : stepX);
        if (s.specimen && s.specimen.pipe) z = ((z % L) + L) % L; else z = M.clamp(z, 0, L);
        UT.setIn('probe', { z: +z.toFixed(1) });
        break;
      }
      case '+': case '=': UT.setIn('instrument', { gain: M.clamp(s.instrument.gain + (ev.shiftKey ? 6 : 1), 0, 110) }); break;
      case '-': case '_': UT.setIn('instrument', { gain: M.clamp(s.instrument.gain - (ev.shiftKey ? 6 : 1), 0, 110) }); break;
      case 'r': case 'R': cycleRange(); break;
      case 'f': case 'F': UT.setIn('instrument', { freeze: !s.instrument.freeze }); break;
      case 'p': case 'P': UT.setIn('instrument', { peakMem: !s.instrument.peakMem }); break;
      case 'h': case 'H': activateToolbar('tb-hide'); break;
      case 'b': case 'B': activateToolbar('tb-beam'); break;
      case 'd': case 'D': toggleFinger(); break;
      case '1': activateToolbar('tb-0'); break;
      case '2': activateToolbar('tb-45'); break;
      case '3': activateToolbar('tb-60'); break;
      case '4': activateToolbar('tb-70'); break;
      default: return;
    }
    ev.preventDefault();
    refreshToolbar();
  }

  // ------------------------------------------------------------------ dialogs
  function dialog(name, title, w, build, extra) {
    const win = UT.dom.win(Object.assign({ name, title, w, x: extra && extra.x, y: extra && extra.y }, extra || {}));
    mem.winBuilders[name] = build;
    win.setContent(function () { return build(win); });
    win.show();
    return win;
  }
  /**
   * Numeric dialog field: like UT.dom.field but the handler only ever sees a finite value clamped to
   * [min, max]; a blank / NaN / out-of-range entry is flagged (class 'invalid', red outline) and NOT
   * committed, and the visible value is normalised to the clamped one on blur ('change').
   * @param {string} label
   * @param {{value:number, min?:number, max?:number, step?:number, unit?:string, onchange?:function}} o
   */
  function numField(label, o) {
    const lo = o.min === undefined ? -Infinity : o.min, hi = o.max === undefined ? Infinity : o.max;
    const onchange = o.onchange;
    const check = function (v) { return { ok: Number.isFinite(v), v: Number.isFinite(v) ? M.clamp(v, lo, hi) : NaN }; };
    const f = UT.dom.field(label, Object.assign({ type: 'number', event: 'input' }, o, {
      onchange: function (v, e) {
        const c = check(v);
        f.input.classList.toggle('invalid', !c.ok || c.v !== v);
        if (c.ok && onchange) onchange(c.v, e);
      },
    }));
    f.input.addEventListener('change', function () {
      const c = check(parseFloat(f.input.value));
      if (!c.ok) return; // stays flagged; the dialog's Apply falls back to the previous value
      f.input.value = c.v;
      f.input.classList.remove('invalid');
      if (onchange) onchange(c.v);
    });
    if (o.unit) f.appendChild(h('span', { class: 'fld-unit' }, o.unit));
    return f;
  }
  const DLG_CSS = '.fld-input.invalid { outline: 2px solid #e00000; background: #ffe6e6; } .dlg-msg { color: #b00000; min-height: 1.2em; margin: 2px 0; font-size: 12px; } .probelib tr.locked td { color: #9a9a9a; background: #f3f3f3; } .probelib tr.locked .btn { opacity: 0.5; pointer-events: none; }';
  function inchOf(od) { for (const k of Object.keys(OD_INCH)) if (Math.abs(OD_INCH[k] - od) < 0.05) return k; return 'custom'; }
  function prepList() {
    const names = has('specimens.prepNames');
    if (Array.isArray(names) && names.length) return names;
    return WELD_PREPS.map(function (k) { return { key: k, label: k, ko: k }; });
  }

  /** Weld dialog (thickness, preparation, bevel, root, cap, plate length, backing/web/branch, transfer loss, pipe OD/WT).
   * Numeric entries are validated against WELD_RANGES on Apply/OK: blank/NaN falls back to the previously applied
   * value, out-of-range values are clamped (§8 Weld menu; the specimen can never be rebuilt from NaN). */
  function openWeld() {
    UT.dom.injectCss && UT.dom.injectCss('app-dlg', DLG_CSS);
    dialog('weld', 'Weld', 680, function (win) {
      const prev = Object.assign({}, UT.defaultState().weldOpts, st().weldOpts || {});
      if (!prev.prep) prev.prep = prev.type === 'fillet' ? 'fillet-t' : (prev.type || 'single-v');
      if (prev.backing && prev.prep === 'single-v') prev.prep = 'single-v-backing';
      const o = Object.assign({}, prev);
      const fields = {};
      const set = function (k) { return function (v) { o[k] = v; }; };
      const nf = function (k, label, opts) { fields[k] = numField(label, Object.assign({ value: o[k], min: WELD_RANGES[k][0], max: WELD_RANGES[k][1], onchange: set(k) }, opts || {})); return fields[k]; };
      const odMm = nf('od', 'OD (mm)', { step: 0.1, onchange: function (v) { o.od = v; odIn.input.value = inchOf(v); } });
      const odIn = UT.dom.field('OD (inch)', { tag: 'select', type: 'text', value: inchOf(o.od), options: [4, 6, 8, 10, 12].map(function (i) { return { value: String(i), label: i + ' inch (' + OD_INCH[i] + ' mm)' }; }).concat([{ value: 'custom', label: 'custom (mm)' }]), onchange: function (v) { if (OD_INCH[v]) { o.od = OD_INCH[v]; odMm.input.value = o.od; } } });
      const wt = nf('wt', 'Wall thickness WT', { step: 0.5, unit: 'mm' });
      const pipeChk = UT.dom.field('Pipe (circumferential weld)', { type: 'checkbox', value: !!o.pipe, onchange: function (v) { o.pipe = v; pipeBox.classList.toggle('disabled', !v); } });
      const pipeBox = h('div', { class: 'dlg-section' + (o.pipe ? '' : ' disabled') }, [h('span', { class: 'dlg-legend', i18n: 'Pipe' }), odIn, odMm, wt]);
      const msg = h('div', { class: 'dlg-msg' }, '');
      // preparation: select + icon strip
      const preps = prepList();
      const icons = h('div', { class: 'prep-icons', role: 'radiogroup', 'aria-label': t('Weld preparation') });
      const prepSel = UT.dom.field('Weld preparation', { tag: 'select', type: 'text', value: o.prep, options: preps.map(function (p) { return { value: p.key, label: mem.lang === 'ko' ? p.ko + ' (' + p.label + ')' : p.label }; }), onchange: function (v) { setPrep(v); } });
      const backingChk = UT.dom.field('Backing bar (25 × 6 mm under the root)', { type: 'checkbox', value: o.prep === 'single-v-backing', onchange: function (v) { setPrep(v ? 'single-v-backing' : (o.prep === 'single-v-backing' ? 'single-v' : o.prep)); } });
      const webT = nf('webT', 'Web thickness (fillet / nozzle)', { step: 0.5, unit: 'mm' });
      const branch = nf('branchOd', 'Branch OD (nozzle)', { step: 0.1, unit: 'mm' });
      const loss = nf('transferLossDb', 'Transfer loss (two-way)', { step: 0.5, unit: 'dB' });
      const wm = UT.dom.field('Weld metal', { tag: 'select', type: 'text', value: o.weldMaterial || 'same', options: [{ value: 'same', label: 'same as parent (carbon)' }, { value: 'austenitic', label: 'austenitic (attenuating, coarse grain)' }], onchange: set('weldMaterial') });
      const iconBtns = {};
      const refreshPrepUi = function () {
        for (const k of Object.keys(iconBtns)) { iconBtns[k].classList.toggle('active', o.prep === k); iconBtns[k].setAttribute('aria-checked', o.prep === k ? 'true' : 'false'); }
        prepSel.input.value = o.prep;
        backingChk.input.checked = o.prep === 'single-v-backing';
        backingChk.classList.toggle('disabled', !(o.prep === 'single-v' || o.prep === 'single-v-backing'));
        webT.classList.toggle('disabled', !(o.prep === 'fillet-t' || o.prep === 'nozzle'));
        branch.classList.toggle('disabled', o.prep !== 'nozzle');
      };
      const setPrep = function (v) { if (WELD_PREPS.indexOf(v) < 0) return; o.prep = v; o.backing = v === 'single-v-backing'; refreshPrepUi(); };
      for (const p of preps) {
        const b = h('button', { type: 'button', class: 'prep-icon', role: 'radio', 'aria-checked': 'false', title: mem.lang === 'ko' ? p.ko : p.label, 'aria-label': p.label, html: PREP_ICONS[p.key] || PREP_ICONS.none, onclick: function () { setPrep(p.key); } });
        iconBtns[p.key] = b;
        icons.appendChild(b);
      }
      refreshPrepUi();
      /** Validate the draft: non-finite → previously applied value, numbers clamped; refresh the inputs; report. */
      const validate = function () {
        const bad = [];
        for (const k of Object.keys(fields)) {
          const raw = parseFloat(fields[k].input.value);
          o[k] = Number.isFinite(raw) ? raw : prev[k]; // blank / NaN → previously applied value
          if (!Number.isFinite(raw)) bad.push(fields[k].querySelector('.fld-label').textContent + ' (' + WELD_RANGES[k][0] + '…' + WELD_RANGES[k][1] + ')');
          else if (raw !== M.clamp(raw, WELD_RANGES[k][0], WELD_RANGES[k][1])) bad.push(fields[k].querySelector('.fld-label').textContent + ' → ' + M.clamp(raw, WELD_RANGES[k][0], WELD_RANGES[k][1]));
        }
        const v = coerceWeld(prev, o);
        if (v.pipe && v.wt > pipeWtMax(v.od)) { clampPipeWall(v); bad.push(fields.wt.querySelector('.fld-label').textContent + ' → ' + v.wt + ' (< OD/2)'); }
        if (!v.pipe) v.wt = v.T; else v.T = v.wt;
        for (const k of Object.keys(fields)) { fields[k].input.value = v[k]; fields[k].input.classList.remove('invalid'); }
        odIn.input.value = inchOf(v.od);
        msg.textContent = bad.length ? t('Invalid entries were reset / clamped: {list}', { list: bad.join(', ') }) : '';
        Object.assign(o, v);
        return v;
      };
      const apply = function () {
        const v = validate();
        Object.assign(prev, v);
        applyWeldOpts(v);
      };
      return h('div', {}, [
        h('div', { class: 'fld-grid' }, [
          nf('T', 'Thickness T', { step: 0.5, unit: 'mm', onchange: function (v) { o.T = v; if (!o.pipe) o.wt = v; } }),
          prepSel,
          nf('bevel', 'Bevel angle', { step: 1, unit: '°' }),
          nf('rootGap', 'Root gap', { step: 0.5, unit: 'mm' }),
          nf('rootFace', 'Root face', { step: 0.5, unit: 'mm' }),
          nf('capWidth', 'Cap width', { step: 1, unit: 'mm' }),
          nf('capHeight', 'Cap height', { step: 0.5, unit: 'mm' }),
          nf('rootHeight', 'Root height', { step: 0.5, unit: 'mm' }),
          nf('L', 'Plate length L', { step: 10, unit: 'mm' }),
          wm,
        ]),
        icons,
        h('div', { class: 'fld-grid' }, [backingChk, webT, branch, loss]),
        pipeChk, pipeBox, msg,
        tx('div', { class: 'dlg-note' }, 'Weld thickness, preparation and pipe dimensions. Apply/OK re-builds the specimen (defects are kept).'),
        h('div', { class: 'btn-row' }, [
          UT.dom.button('Apply', apply), UT.dom.button('OK', function () { apply(); win.close(); }, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); }),
        ]),
      ]);
    });
  }

  /** Snell helper for the wedge dialog: wedge angle → {refracted, mode, beyond}. */
  function wedgeToRefracted(wedgeDeg, vW, mat) {
    const vC = (mat && mat.vComp) || UT.consts.V_COMP_STEEL, vS = (mat && mat.vShear) || UT.consts.V_SHEAR_STEEL;
    const crit = UT.probe.criticalAngles(vW, mat);
    if (wedgeDeg <= 0.001) return { refracted: 0, mode: 'comp', crit, beyond: false };
    if (wedgeDeg < crit.first) { const a = M.snellAngle(wedgeDeg, vW, vC); return { refracted: a === null ? 89.9 : a, mode: 'comp', crit, beyond: false, shearToo: M.snellAngle(wedgeDeg, vW, vS) }; }
    if (wedgeDeg < crit.second) { const a = M.snellAngle(wedgeDeg, vW, vS); return { refracted: a === null ? 89.9 : a, mode: 'shear', crit, beyond: false }; }
    return { refracted: 90, mode: 'shear', crit, beyond: true };
  }
  /** Probe patch for a refracted angle: snaps to the 45/60/70 presets, else a custom angle (0.1° steps). */
  function probePatchFor(refracted, mode) {
    let a = +refracted.toFixed(1);
    for (const p of [45, 60, 70]) if (Math.abs(refracted - p) < 0.05) a = p;
    if (a <= 0.05) return { angle: 0, mode: 'comp' };
    return { angle: a, mode: mode === 'comp' ? 'comp' : 'shear' };
  }
  /** "Adjust Angle in Wedge (Shoe)" dialog: wedge angle ↔ refracted angle with both critical angles. */
  function openWedge() {
    dialog('wedge', 'Adjust Angle in Wedge (Shoe)', 520, function (win) {
      const p = st().probe;
      const mat = st().specimen && st().specimen.material;
      const s = { vW: p.wedgeVel || UT.consts.V_PERSPEX, wedge: 0 };
      const d0 = has('probe.derive') ? UT.probe.derive(p, st().specimen) : null;
      s.wedge = d0 ? +d0.wedgeAngle.toFixed(1) : 0;
      const readout = h('div', { class: 'wedge-readout no-i18n', style: { overflowX: 'auto' } }, '');
      const scale = h('div', { class: 'wedge-scale' });
      const slider = UT.dom.field('Angle in wedge (shoe)', { type: 'range', value: s.wedge, min: 0, max: 80, step: 0.1, event: 'input', onchange: function (v) { s.wedge = parseFloat(v); fromWedge(true); } });
      const refIn = UT.dom.field('Refracted angle in steel', { type: 'number', value: 0, min: 0, max: 89, step: 0.5, event: 'input', onchange: function (v) { if (Number.isFinite(v)) fromRefracted(v); } });
      const matSel = UT.dom.field('Wedge material', { tag: 'select', type: 'text', value: String(s.vW), options: [{ value: '2.74', label: 'Perspex 2740 m/s' }, { value: '2.33', label: 'Rexolite 2330 m/s' }, { value: '2.35', label: 'Polystyrene 2350 m/s' }], onchange: function (v) { s.vW = parseFloat(v); fromWedge(true); } });
      const setProbe = function (r) {
        const patch = probePatchFor(r.beyond ? 90 : r.refracted, r.mode);
        patch.wedgeVel = s.vW;
        UT.setIn('probe', patch);
        refreshToolbar();
      };
      const show = function (r) {
        const crit = r.crit;
        const pct = function (a) { return M.clamp(a / 80 * 100, 0, 100); };
        scale.textContent = '';
        scale.style.background = 'linear-gradient(90deg,#cfe8ff 0 ' + pct(crit.first) + '%,#d8f5d0 ' + pct(crit.first) + '% ' + pct(crit.second) + '%,#f5d0d0 ' + pct(crit.second) + '%)';
        scale.appendChild(h('span', { style: { left: pct(crit.first / 2) + '%' }, i18n: 'compression' }));
        scale.appendChild(h('span', { style: { left: pct((crit.first + crit.second) / 2) + '%' }, i18n: 'shear' }));
        scale.appendChild(h('span', { style: { left: pct((crit.second + 80) / 2) + '%' }, i18n: 'surface' }));
        scale.appendChild(h('div', { class: 'crit', style: { left: pct(crit.first) + '%' } }));
        scale.appendChild(h('div', { class: 'crit', style: { left: pct(crit.second) + '%' } }));
        const vC = ((mat && mat.vComp) || UT.consts.V_COMP_STEEL) * 1000, vS = ((mat && mat.vShear) || UT.consts.V_SHEAR_STEEL) * 1000;
        readout.textContent =
          'Wedge angle            : ' + s.wedge.toFixed(1) + '°   (wedge velocity ' + Math.round(s.vW * 1000) + ' m/s)\n' +
          '1st critical angle     : ' + crit.first.toFixed(1) + '°   (compression wave, ' + Math.round(vC) + ' m/s)\n' +
          '2nd critical angle     : ' + crit.second.toFixed(1) + '°   (shear wave, ' + Math.round(vS) + ' m/s)\n' +
          (r.beyond ? 'Beyond 2nd critical    : surface (Rayleigh) wave only, no bulk wave\n'
            : (r.mode === 'comp' ? 'Compression wave angle : ' + r.refracted.toFixed(1) + '°' + (r.shearToo !== null && r.shearToo !== undefined ? '   (shear also present at ' + r.shearToo.toFixed(1) + '°)' : '') + '\n'
              : 'Shear wave angle       : ' + r.refracted.toFixed(1) + '°   (comp. wave totally reflected)\n')) +
          'sin(θ wedge)/v wedge = sin(θ steel)/v steel   (Snell)';
        readout.classList.toggle('dlg-warn', !!r.beyond);
      };
      const fromWedge = function (apply) {
        const r = wedgeToRefracted(s.wedge, s.vW, mat);
        refIn.input.value = r.beyond ? 90 : r.refracted.toFixed(1);
        slider.input.value = s.wedge;
        show(r);
        if (apply) setProbe(r);
      };
      const fromRefracted = function (a) {
        const mode = a > 0 && st().probe.mode === 'comp' && a < 90 ? 'comp' : 'shear';
        s.wedge = +UT.probe.wedgeAngleFor(M.clamp(a, 0, 89.9), mode, s.vW, mat).toFixed(1);
        const r = wedgeToRefracted(s.wedge, s.vW, mat);
        slider.input.value = s.wedge;
        show(r);
        setProbe(r);
      };
      const presetBtn = function (a) { return UT.dom.button(a + '°', function () { setAngle(a); s.wedge = +UT.probe.derive(st().probe, st().specimen).wedgeAngle.toFixed(1); fromWedge(false); }, { class: 'btn small' }); };
      fromWedge(false);
      return h('div', {}, [
        matSel, slider, scale, refIn, readout,
        tx('div', { class: 'dlg-note' }, 'Moving the slider changes the refracted angle and the wave mode (compression / shear) in steel by Snell\'s law. Watch the physics line in the status bar.'),
        h('div', { class: 'btn-row' }, [presetBtn(0), presetBtn(45), presetBtn(60), presetBtn(70), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }

  /** Options dialog (UT set, units, colour code, skips, view toggles, v2 options, language). */
  function openOptions() {
    dialog('options', 'Options', 420, function (win) {
      const s = st();
      const sel = function (label, value, options, onchange) { return UT.dom.field(label, { tag: 'select', type: 'text', value, options, onchange }); };
      const chk = function (label, value, onchange) { return UT.dom.field(label, { type: 'checkbox', value, onchange }); };
      return h('div', {}, [
        sel('UT Set', s.utSet, [{ value: 'epoch600', label: t('EPOCH 600') }, { value: 'epoch4', label: t('EPOCH 4 (ASME text screen)') }, { value: 'usk7', label: t('Krautkrämer USK 7 (analogue)') }], setUtSet),
        sel('Units', s.display.units || 'mm', [{ value: 'mm', label: t('mm') }, { value: 'inch', label: t('inch') }], function (v) { setDisplay({ units: v }); }),
        sel('Colour code', s.display.colourCode || 'none', [{ value: 'none', label: t('None') }, { value: 'propagation', label: t('Mode propagation (leg colours)') }, { value: 'geometry', label: t('Geometry (last surface)') }], function (v) { setDisplay({ colourCode: v }); }),
        sel('Number of skips', String(s.display.skips || 3), [1, 2, 3, 4].map(function (n) { return { value: String(n), label: String(n) }; }), function (v) { setDisplay({ skips: parseInt(v, 10) }); }),
        chk('Show plan view', s.display.plan !== false, function (v) { setDisplay({ plan: v }); applyLayout(); }),
        chk('Show 3D window', pipe3dOpen(), function (v) { setPipe3dShown(v); }),
        chk('Show legend', s.display.legend !== false, function (v) { setDisplay({ legend: v }); }),
        chk('Show beam', s.display.beam !== false, function (v) { setDisplay({ beam: v }); }),
        chk('Show converted rays', s.display.convRays !== false, function (v) { setDisplay({ convRays: v }); }),
        chk('Auto trig (angle/thickness follow probe)', s.display.autoTrig !== false, function (v) { setDisplay({ autoTrig: v }); }),
        chk('Sound alarm', !!s.display.sound, function (v) { if (v !== !!st().display.sound) toggleSound(); }),
        sel('Touch bar', s.display.touchBar || 'auto', [{ value: 'auto', label: t('auto (coarse pointer)') }, { value: 'on', label: t('on') }, { value: 'off', label: t('off') }], function (v) { setDisplay({ touchBar: v }); }),
        chk('High contrast', !!s.display.highContrast, function (v) { setDisplay({ highContrast: v }); }),
        chk('Auto-scale layout', s.display.scale !== 'fixed', function (v) { setDisplay({ scale: v ? 'auto' : 'fixed' }); }),
        chk('Show dead zones', !!(s.tofd && s.tofd.deadZones), function (v) { UT.setIn('tofd', { deadZones: v }); }),
        sel('Language / 언어', mem.lang, [{ value: 'en', label: 'English' }, { value: 'ko', label: '한국어 (Korean)' }], function (v) { app.setLang(v); }),
        h('div', { class: 'btn-row' }, [UT.dom.button('Reset Layout', resetLayout), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }

  /** Step wedge dialog: choose a step set and enter step mode. */
  function openStepWedge() {
    dialog('stepwedge', 'Step Wedge', 380, function (win) {
      const s = { choice: 'a', custom: '5, 10, 15, 20, 25', stepLen: 40 };
      const sp = st().specimen;
      if (currentMode() === 'step' && sp && Array.isArray(sp.steps)) { s.custom = sp.steps.join(', '); s.choice = 'c'; }
      const radio = function (val, label) {
        const inp = h('input', { type: 'radio', name: 'stepset', value: val, checked: s.choice === val ? true : null, onchange: function () { s.choice = val; } });
        return h('label', { class: 'fld' }, [inp, h('span', { i18n: label })]);
      };
      const customIn = UT.dom.field('Custom steps (mm)', { type: 'text', value: s.custom, event: 'input', onchange: function (v) { s.custom = v; s.choice = 'c'; win.body.querySelector('input[value=c]').checked = true; } });
      const lenIn = numField('Step length', { value: s.stepLen, min: 10, max: 200, step: 5, unit: 'mm', onchange: function (v) { s.stepLen = v; } });
      const ok = function () {
        const steps = s.choice === 'a' ? [5, 10, 15, 20, 25] : s.choice === 'b' ? [10, 20, 30, 40, 50] : parseSteps(s.custom);
        if (steps.length < 2) { UT.dom.alert(t('Enter at least two step thicknesses, e.g. 5, 10, 15, 20, 25'), 'Step Wedge'); return; }
        win.close();
        enterStep(steps, s.stepLen);
      };
      return h('div', {}, [
        radio('a', 'Steps 5, 10, 15, 20, 25 mm'), radio('b', 'Steps 10, 20, 30, 40, 50 mm'), radio('c', 'Custom'),
        customIn, lenIn,
        tx('div', { class: 'dlg-note' }, 'Choose a step wedge (stepped reference block) and practise range / zero calibration with the 0° probe (Auto Cal).'),
        h('div', { class: 'btn-row' }, [UT.dom.button('OK', ok, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); })]),
      ]);
    });
  }

  function textWin(name, title, w, build) { dialog(name, title, w, function (win) { return h('div', { class: 'dlg-text' }, build().concat([h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })])])); }); }
  function p2(en, ko) { return [tx('p', {}, en), h('p', { class: 'ko no-i18n' }, ko)]; }
  function openAbout() {
    textWin('about', 'About UTsim', 520, function () { return [
      h('h3', { class: 'no-i18n' }, 'UTsim v' + UT.VERSION + ' — UTman-style Ultrasonic Weld Testing Simulator'),
      tx('p', {}, 'An independent, open re-implementation inspired by the UTman ultrasonic simulator (utsim.co.uk) by Paul Rawlinson. Not affiliated with, endorsed by, or derived from the original software; all code and artwork are original and drawn with Canvas 2D/CSS.'),
      h('p', { class: 'ko no-i18n' }, 'UTsim은 Paul Rawlinson의 UTman 초음파 시뮬레이터(utsim.co.uk)에서 영감을 받아 독립적으로 재구현한 교육용 소프트웨어입니다. 원저작자와 무관하며, 모든 코드는 새로 작성되었습니다.'),
      tx('p', {}, 'Physics: 2-D polygon ray tracing (piston-directivity fan of 41 rays with side lobes, mode conversion, surface waves, up to 4 skips), Snell refraction in the Perspex wedge, near field / beam spread, DAC / TCG / DGS, TOFD with mode-converted signals, phased array, AUT strip charts. Instruments: EPOCH 600, EPOCH 4 and USK 7 skins.'),
      tx('p', {}, 'Single-file HTML, no network, no external libraries. Settings persist in this browser only.'),
    ]; });
  }
  function openGuide() {
    textWin('guide', 'Quick Guide', 600, function () { return [
      tx('h3', {}, '1. Layout')].concat(
      p2('Left: the flaw detector (EPOCH 600 by default). Right: plan view with the skew compass. Below: the X ruler and the cross-section with the probe, beam and defects. Status bar: wedge/refracted angle physics line, probe position, range, gain and hints.',
        '왼쪽은 탐상기(EPOCH 600), 오른쪽은 평면도(스큐 나침반 포함), 아래는 X 눈금자와 단면도입니다. 상태 표시줄에 웨지 각도·굴절각·위치·범위·감도가 표시됩니다.'),
      [tx('h3', {}, '2. Moving the probe')],
      p2('Left-drag in the cross-section or plan view (Shift-drag = along the weld). Arrow keys move 1 mm (Shift 10 mm). Drag the red needle of the compass to skew the probe. On touch screens use the touch bar (Options ▸ Touch bar).',
        '단면도나 평면도에서 마우스 왼쪽 버튼으로 드래그하세요(Shift+드래그 = 용접선 방향). 화살표 키 1 mm(Shift 10 mm). 나침반 바늘을 끌면 스큐가 바뀝니다. 터치 화면에서는 터치 바(옵션 ▸ 터치 바)를 사용하세요.'),
      [tx('h3', {}, '3. Instrument')],
      p2('Click a softkey (Gain, Range, Delay, …) then use ▲▼ or the mouse wheel over the instrument. The dB softkeys set 10/20/30/40/60 dB. RANGE cycles 50/100/200/400 mm. GATES selects gate 1/2. PEAK MEM, Freeze, Auto Cal on the step wedge. 2ND F + GATES = AUTO 80 %, SAVE → Datalogger, 2ND F + ❄ = Compare.',
        '소프트키(Gain, Range, Delay …)를 누른 뒤 ▲▼ 또는 마우스 휠로 값을 바꿉니다. dB 소프트키는 감도를 10/20/30/40/60 dB로 설정합니다. 2ND F + GATES = AUTO 80 %, SAVE → 데이터로거, 2ND F + ❄ = 비교.'),
      [tx('h3', {}, '4. Toolbar')],
      p2('0°/45°/60°/70° probes · V2/V1 calibration blocks · DAC bar (record points, draw curves) · PLOT beam spread on the IOW block · DAMP · SIZE (6 dB / 20 dB drop) · DEFECT editor (draw with the mouse) · HIDE (blind practice) · CLEAR · BEAM · RAD radiograph · PIPE (plate ⇄ pipe + 3D window) · TKY · TOFD · AUT.',
        '0°/45°/60°/70° 탐촉자 · V2/V1 교정 시험편 · DAC · PLOT(빔 확산) · DAMP · SIZE(6/20 dB 드롭) · DEFECT(결함 그리기) · HIDE(블라인드 연습) · CLEAR · BEAM · RAD(방사선 필름) · PIPE(3D 창) · TKY · TOFD · AUT.'),
      [tx('h3', {}, '5. Probes, Weld, Tools')],
      p2('Probes ▸ Probe library chooses named probes (MWB, WB, A430S …); Focus Beam focuses inside the near field; Mode conversion / Surface wave / Side lobes switch the v2 physics. Weld ▸ Weld… selects the preparation (single-V, double-V, K, J, backing bar, fillet T, nozzle) and Material… the parent material. Tools ▸ DGS diagram, Evaluation (ISO 11666 / ASME / AWS), Procedures, B-scan, Echo dynamic, Datalogger, Sizing.',
        '탐촉자 ▸ 탐촉자 라이브러리에서 실제 탐촉자를 고르고, 집속 빔·모드 변환·표면파·사이드 로브를 켜고 끕니다. 용접부 ▸ 용접부…에서 개선 형상을, 재질…에서 모재를 고릅니다. 도구 메뉴에 DGS 선도, 평가(규격), 절차서, B-스캔, 에코 다이내믹, 데이터로거, 크기 측정이 있습니다.'),
      [tx('h3', {}, '6. Lessons, quiz & trade test')],
      p2('Help ▸ Lessons lists 25 guided lessons with automatic step checks, hints and "Do it for me". Help ▸ Echo quiz asks you to identify gated echoes. Defects ▸ Trade Test hides random defects for you to find, size and report (timer, scoreboard, printable report); Random practice is the same without a timer. File ▸ Share link… encodes the whole scenario into a URL.',
        '도움말 ▸ 레슨에 25개의 안내 레슨(자동 단계 확인, 힌트, 대신 해 주기)이 있습니다. 도움말 ▸ 에코 퀴즈는 게이트 안의 에코를 맞히는 문제입니다. 결함 ▸ 실기 시험은 숨겨진 결함을 찾아 보고하고 채점합니다(타이머, 점수판, 보고서 인쇄). 파일 ▸ 공유 링크…로 시나리오 전체를 URL로 공유합니다.')); });
  }
  function openKeys() {
    const rows = [
      ['← / →', 'Move probe 1 mm (Shift: 10 mm)'], ['↑ / ↓', 'Move probe along the weld (z)'],
      ['+ / −', 'Gain ±1 dB (Shift: ±6 dB)'], ['R', 'Range 50 → 100 → 200 → 400 mm'], ['F', 'Freeze'], ['P', 'Peak memory'],
      ['H', 'Hide defects & beam'], ['B', 'Beam on/off'], ['D', 'Finger damping tool'], ['1 2 3 4', 'Probe 0° / 45° / 60° / 70°'], ['Esc', 'Close the top window, menu or tour'],
      ['F10, Alt', 'Open the menu bar (arrows navigate, Enter activates)'], ['Alt+F/P/S/W/D/T/O/H', 'Open the File / Probes / Step Wedge / Weld / Defects / Tools / Options / Help menu'],
      ['▲▼◀▶ (instrument focused)', 'Adjust the selected instrument parameter'], ['Mouse wheel', 'Over the cross-section: gain ±1 dB; over the instrument: selected parameter'],
    ];
    textWin('keys', 'Keyboard Shortcuts', 560, function () { return [h('table', {}, rows.map(function (r) { return h('tr', {}, [h('td', {}, h('kbd', { class: 'no-i18n' }, r[0])), tx('td', {}, r[1])]); }))]; });
  }
  /** Export dialog: shows a canvas as a PNG data URL inside an <img> (no download links). */
  function openExport(canvasId) {
    dialog('export', 'Export PNG', 760, function (win) {
      const img = h('img', { class: 'export-img', alt: 'export' });
      const note = tx('div', { class: 'dlg-note' }, 'Right-click the image and choose "Save image as…"');
      const load = function (id) {
        const cv = byId(id);
        if (!cv || typeof cv.toDataURL !== 'function') { note.textContent = t('Canvas #{id} is not available.', { id }); img.removeAttribute('src'); return; }
        try { img.src = cv.toDataURL('image/png'); note.textContent = t('Right-click the image and choose "Save image as…"') + '  (' + id + ')'; }
        catch (e) { note.textContent = t('Export failed: {msg}', { msg: e.message }); }
      };
      load(canvasId || 'cv-ascan');
      return h('div', {}, [
        h('div', { class: 'btn-row left' }, [
          UT.dom.button('A-scan', function () { load('cv-ascan'); }, { class: 'btn small' }),
          UT.dom.button('Cross section', function () { load('cv-cross'); }, { class: 'btn small' }),
          UT.dom.button('Plan view', function () { load('cv-plan'); }, { class: 'btn small' }),
        ]),
        img, note,
        h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }
  function openExportDefects() {
    dialog('export-defects', 'Export Defects', 520, function (win) {
      const ta = h('textarea', { class: 'dlg-textarea', readonly: true, 'aria-label': 'Defect JSON' });
      const locked = st().trade && st().trade.exam && st().trade.exam.locked && !st().trade.revealed;   // §4.2.3
      ta.value = locked ? '' : JSON.stringify(st().defects, null, 1);
      return h('div', {}, [tx('div', { class: 'dlg-note' }, locked ? 'Exam locked: defects are hidden until the test is revealed.' : 'Copy this JSON to keep the defects (Defects ▸ Import Defects… pastes it back).'), ta,
        h('div', { class: 'btn-row' }, [UT.dom.button('Select all', function () { ta.select(); }), UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })])]);
    });
  }
  function openImportDefects() {
    dialog('import-defects', 'Import Defects', 520, function (win) {
      const ta = h('textarea', { class: 'dlg-textarea', 'aria-label': 'Defect JSON', placeholder: '[ { "type": "planar", "pts": [ {"x": 0, "y": 17}, {"x": 0, "y": 20} ], "zFrom": 120, "zTo": 150 } ]' });
      const doImport = function () {
        try {
          const arr = JSON.parse(ta.value);
          if (!Array.isArray(arr)) throw new Error('expected a JSON array');
          if (has('modes.setDefects')) UT.modes.setDefects(arr);
          else UT.set({ defects: limitDefectSlots(arr, zOptsOf()) });
          win.close();
        } catch (e) { UT.dom.alert(t('Invalid defect JSON: {msg}', { msg: e.message }), 'Import Defects'); }
      };
      return h('div', {}, [tx('div', { class: 'dlg-note' }, 'Paste defect JSON (as produced by Export Defects / Save Def).'), ta,
        h('div', { class: 'btn-row' }, [UT.dom.button('Import', doImport, { class: 'btn primary' }), UT.dom.button('Cancel', function () { win.close(); })])]);
    });
  }

  // ------------------------------------------------------------------ v2 windows: probe library, material, focus, glossary
  /**
   * Procedure lock (SPEC-v2 §4.3 T4): library ids outside UT.standards.allowedProbes(state) are not selectable
   * while state.trade.active (null list = unrestricted; same rule 80-modes applies to the toolbar angle buttons).
   */
  function lockedProbeIds(state) {
    const s = state || st();
    if (!s.trade || !s.trade.active) return null;
    const fn = has('standards.allowedProbes');
    if (typeof fn !== 'function') return null;
    let ids = null;
    try { ids = fn(s); } catch (e) { ids = null; }
    return Array.isArray(ids) ? ids : null;
  }
  function probeAllowed(id, state) {
    const ids = lockedProbeIds(state);
    return !ids || ids.indexOf(id) >= 0;
  }
  /** Key of the current lock set: the open library window is rebuilt when it changes (trade start / end). */
  function probeLockKey(state) { const ids = lockedProbeIds(state); return ids ? ids.join(',') : ''; }
  /** Probes ▸ Probe library… (window 'probelib'): table of UT.probe.library with derived N / θ6 / θ20 and Select. */
  function openProbeLib() {
    dialog('probelib', 'Probe library', 760, function (win) {
      const lib = has('probe.library') || [];
      const cur = st().probe;
      const locked = lockedProbeIds();
      if (win && win.el) win.el.dataset.probeLock = probeLockKey();
      const rows = lib.map(function (p) {
        let d = null;
        try { d = has('probe.select') ? UT.probe.derive(Object.assign({}, cur, UT.probe.select(p.id), { method: 'pe' }), st().specimen) : null; } catch (e) { d = null; }
        const isCur = cur.libId === p.id;
        const isLocked = !!locked && locked.indexOf(p.id) < 0;
        const tr = h('tr', { class: (isCur ? 'cur' : '') + (isLocked ? ' locked' : ''), 'aria-disabled': isLocked ? 'true' : null }, [
          h('td', { class: 'no-i18n' }, p.maker), h('td', { class: 'no-i18n' }, p.name), h('td', {}, p.angle + '°'), h('td', {}, p.freq + ' MHz'),
          h('td', { class: 'no-i18n' }, p.crystal.shape === 'rect' ? p.crystal.a + ' × ' + p.crystal.b : '⌀' + p.crystal.a),
          h('td', {}, d ? d.nearField.toFixed(1) : '–'), h('td', {}, d ? d.halfAngle6dB.toFixed(1) + '° / ' + d.halfAngle20dB.toFixed(1) + '°' : '–'),
          h('td', {}, UT.dom.button(isCur ? 'Selected' : 'Select', function () { if (!isLocked) selectLibProbe(p.id); win.setContent(function () { return mem.winBuilders.probelib(win); }); }, { class: 'btn small' + (isCur ? ' pressed' : '') + (isLocked ? ' disabled' : ''), disabled: isLocked ? true : null, 'aria-disabled': isLocked ? 'true' : null })),
        ]);
        tr.title = isLocked ? t('Not allowed by the procedure while the trade test runs') : (p.notes || '');
        return tr;
      });
      return h('div', { class: 'probelib' }, [
        h('table', {}, [h('thead', {}, h('tr', {}, [tx('th', {}, 'Maker'), tx('th', {}, 'Name'), tx('th', {}, 'Angle'), tx('th', {}, 'Freq'), tx('th', {}, 'Crystal (mm)'), tx('th', {}, 'N (mm)'), 'θ6 / θ20'].map(function (c) { return typeof c === 'string' ? h('th', { class: 'no-i18n' }, c) : c; }).concat([h('th', {})]))), h('tbody', {}, rows)]),
        locked ? tx('div', { class: 'dlg-note' }, 'Procedure lock: only the probes of the applied procedure can be selected while the trade test runs.') : null,
        tx('div', { class: 'dlg-note' }, 'N = near field of the selected wave mode; θ6 / θ20 = pulse-echo half angles (−6 / −20 dB). Custom angles: Probes ▸ Adjust Angle in Wedge (Shoe).'),
        h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }
  /** Rebuild the open probe library window when the procedure lock set changed (trade start / end, procedure change). */
  function syncProbeLibLock() {
    const w = winApi('probelib');
    if (!w || !w.isOpen() || !mem.winBuilders.probelib) return;
    const key = probeLockKey();
    if (w.el && w.el.dataset.probeLock === key) return;
    try { w.setContent(function () { return mem.winBuilders.probelib(w); }); } catch (e) { console.error('[UT.app] probelib lock', e); }
  }
  /**
   * Select a library probe: UT.probe.select(id) patch (never built by hand) → probe. False (with a status
   * message) for ids outside the active procedure's probe list while the trade test runs (§4.3 T4).
   */
  function selectLibProbe(id) {
    if (!has('probe.select')) return false;
    const sel = UT.probe.select(id);
    if (!sel) return false;
    if (!probeAllowed(id)) { UT.status({ right: t('Probe {id} is not allowed by the procedure while the trade test runs', { id }) }); return false; }
    const entry = has('probe.libEntry') ? UT.probe.libEntry(id) : null;
    const patch = Object.assign({}, sel);
    if (entry && entry.family === 'pa') patch.method = 'pa'; else if (st().probe.method === 'pa') patch.method = 'pe';
    UT.setIn('probe', patch);
    refreshToolbar();
    return true;
  }
  /** Weld ▸ Material… (window 'material'): parent material radio list + weld metal. */
  function openMaterial() {
    dialog('material', 'Material', 560, function (win) {
      const mats = has('specimens.materials') || {};
      const cur = st().material || 'carbon';
      const list = h('div', { class: 'mat-list', role: 'radiogroup', 'aria-label': t('Parent material') });
      for (const k of Object.keys(mats)) {
        const m = mats[k];
        const inp = h('input', { type: 'radio', name: 'material', value: k, checked: k === cur ? true : null, onchange: function () { setMaterial(k); refreshToolbar(); } });
        list.appendChild(h('label', { class: 'fld mat-row' + (k === cur ? ' cur' : '') }, [inp,
          h('span', { class: 'mat-name no-i18n' }, mem.lang === 'ko' ? m.nameKo + ' (' + m.name + ')' : m.name),
          h('span', { class: 'mat-num no-i18n' }, 'vL ' + m.vComp.toFixed(2) + '  vS ' + m.vShear.toFixed(2) + ' mm/µs   αL ' + m.attenL5 + '  αS ' + (m.attenS5 === undefined ? '–' : m.attenS5) + ' dB/mm   ν ' + (m.poisson === undefined ? '–' : m.poisson) + (m.anisotropic ? '   ' + t('anisotropic') : '')),
        ]));
      }
      const wm = UT.dom.field('Weld metal', { tag: 'select', type: 'text', value: (st().weldOpts && st().weldOpts.weldMaterial) || 'same', options: [{ value: 'same', label: t('same as parent') }, { value: 'austenitic', label: t('austenitic (attenuating, coarse grain)') }], onchange: function (v) { applyWeldOpts(Object.assign({}, st().weldOpts, { weldMaterial: v })); } });
      return h('div', {}, [
        list, wm,
        tx('div', { class: 'dlg-note' }, 'One-way attenuation at 5 MHz (scales with (f/5)^1.5); grass scales with (f/5)². Changing the material re-builds the specimen and the readouts use its velocities.'),
        h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }
  /** Probes ▸ Focus Beam… (window 'focus'): on/off, focal distance F ≤ N, shows N (SPEC-v2 §3.6). */
  function openFocus() {
    UT.dom.injectCss && UT.dom.injectCss('app-dlg', DLG_CSS);
    dialog('focus', 'Focus Beam', 400, function (win) {
      const p = st().probe;
      const d = derivedNow();
      const N = d ? d.nearField : 38.6;
      const f0 = p.focus || { on: false, F: 30 };
      const s = { on: !!f0.on, F: M.clamp(f0.F || 30, 10, Math.max(10, N)) };
      const msg = h('div', { class: 'dlg-msg' }, '');
      const nInfo = h('div', { class: 'dlg-note no-i18n' }, '');
      const refresh = function () {
        nInfo.textContent = t('Near field N = {n} mm ({mode} {a}°, {f} MHz, crystal {c} mm)', { n: N.toFixed(1), mode: d ? d.mode : '', a: p.angle, f: p.freq, c: d ? d.crystalA : p.diameter });
        let m = '';
        if (p.angle > 70) m = t('Focusing needs a refracted angle ≤ 70°.');
        else if (Fin.input.value !== '' && parseFloat(Fin.input.value) > N + 1e-9) m = t('F > near field: no focusing effect') + ' (F ≤ ' + N.toFixed(1) + ')';
        msg.textContent = m;
      };
      const apply = function () {
        const raw = parseFloat(Fin.input.value);
        const F = Number.isFinite(raw) ? M.clamp(raw, 10, Math.max(10, N)) : s.F;
        s.F = F; Fin.input.value = F.toFixed(1);
        UT.setIn('probe', { focus: { on: s.on && p.angle <= 70, F } });
        refresh();
        refreshToolbar();
      };
      const onChk = UT.dom.field('Focused probe (geometric focus)', { type: 'checkbox', value: s.on, onchange: function (v) { s.on = v; apply(); } });
      const Fin = numField('Focal distance F', { value: +s.F.toFixed(1), min: 10, max: 150, step: 1, unit: 'mm', onchange: function () { refresh(); } });
      Fin.input.addEventListener('change', apply);
      refresh();
      return h('div', {}, [
        onChk, Fin, nInfo, msg,
        tx('div', { class: 'dlg-note' }, 'Focus replaces the angular fan by 41 aperture rays aimed at F along the centre ray; focal gain Gf = 1 + (min(N/F, 3) − 1)·exp(−((s − F)/(0.25 F))²). Beyond F the beam diverges again.'),
        h('div', { class: 'btn-row' }, [UT.dom.button('Apply', apply), UT.dom.button('Close', function () { apply(); win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }
  const GLOSSARY_FALLBACK = [
    ['Backwall echo', '저면 에코', 'Reflection from the far surface; its loss indicates a lamination or coupling problem', '뒷면(저면)에서의 반사. 소실되면 라미네이션이나 접촉 불량을 의심', [3, 5]],
    ['Angle probe', '사각 탐촉자', 'shear-wave probe with a Perspex wedge, 45/60/70°', '퍼스펙스 쐐기로 횡파를 비스듬히 입사시키는 탐촉자', [4]],
    ['Refracted angle', '굴절각', 'angle of the beam in steel (Snell)', '강 내부 빔의 각도', [14]],
    ['Index point', '입사점', 'point where the beam leaves the wedge; checked on the V1 100 mm radius', '빔이 쐐기를 떠나는 점', [4, 6]],
    ['Sensitivity / reference level', '감도 / 기준 감도', 'gain at which the reference reflector reads the reference height', '기준 반사체가 기준 높이로 읽히는 게인', [7, 20, 23]],
    ['Indication', '지시', 'any signal that needs interpretation – not yet a defect', '해석이 필요한 신호, 아직 결함이 아님', [21]],
    ['Dead zone', '불감대', 'region under the initial pulse where nothing can be detected', '초기 펄스에 가려 탐지 불가능한 영역', [3]],
    ['Near field', '근거리 음장', 'N = a²f/(4v); amplitudes are unreliable inside it', '진폭이 불안정한 근거리 영역', [9]],
    ['Beam spread', '빔 확산', 'divergence beyond the near field; plotted at 20 dB', '근거리 음장 이후의 퍼짐', [9]],
    ['Skip', '스킵', 'half skip = to the backwall, full skip = back to the surface', '0.5 스킵 = 저면까지, 1 스킵 = 다시 표면까지', [8]],
    ['DAC', '거리 진폭 보정 곡선', 'curve of the reference SDH echo vs distance', '기준 횡공의 거리별 에코 높이 곡선', [20]],
    ['TCG', '시간 보정 게인', 'gain vs time that flattens the DAC', 'DAC를 평탄하게 만드는 시간별 게인', []],
    ['SDH', '횡공', 'side-drilled hole reference reflector (3 mm, ISO)', '측면 드릴 구멍 기준 반사체', []],
    ['FBH / DGS', '평저공 / DGS 선도', 'flat-bottom hole; disc-equivalent size', '원판 등가 크기 산정', []],
    ['Corner echo', '코너 에코', 'strong echo from a surface-breaking defect and the backwall (90° corner)', '표면 개구 결함과 저면이 이루는 모서리 반사', [11]],
    ['Tip diffraction', '팁 회절(단부 에코)', 'weak echo from a crack tip; used for height', '균열 끝에서의 약한 회절 에코, 높이 측정', [13]],
    ['Mode conversion', '모드 변환', 'S↔L conversion at surfaces → spurious echoes', '표면·결함에서의 파 변환 → 의사 지시', []],
    ['Surface wave', '표면파', 'Rayleigh wave from steep wedges; damped by a finger', '손가락으로 감쇠되는 표면 진행파', []],
    ['Geometry echo', '형상 에코', 'root bead / cap / backing bar reflections – plot before calling a defect', '이면 비드·덧살·배킹 바 반사 – 결함 판정 전 플로팅', []],
    ['Transfer correction', '전달 손실 보정', 'dB added for surface/attenuation differences between block and part', '시험편과 대비 시험편의 차이를 보정하는 dB', [24]],
  ].map(function (r) { return { term: r[0], ko: r[1], en: r[0], defEn: r[2], defKo: r[3], see: r[4] }; });
  function glossaryData() {
    const g = has('i18nKo.glossary');
    if (Array.isArray(g) && g.length) return g;
    if (g && typeof g === 'object') { const arr = Object.keys(g).map(function (k) { return Object.assign({ term: k }, g[k]); }); if (arr.length) return arr; }
    return GLOSSARY_FALLBACK;
  }
  /** Help ▸ Glossary… (window 'glossary'): search box + KO/EN columns from UT.i18nKo.glossary. */
  function openGlossary() {
    dialog('glossary', 'Glossary', 720, function (win) {
      const data = glossaryData();
      const tbody = h('tbody');
      const search = h('input', { class: 'fld-input', type: 'search', placeholder: t('Search term (KO / EN)'), 'aria-label': t('Search term (KO / EN)') });
      const count = h('span', { class: 'dlg-note' });
      const render = function () {
        const q = search.value.trim().toLowerCase();
        tbody.textContent = '';
        let n = 0;
        for (const g of data) {
          const hay = [g.term, g.ko, g.en, g.defKo, g.defEn].join(' ').toLowerCase();
          if (q && hay.indexOf(q) < 0) continue;
          n++;
          const see = Array.isArray(g.see) && g.see.length ? g.see.map(function (l) { const b = h('button', { type: 'button', class: 'btn small', title: t('Open lesson {n}', { n: l }) }, 'L' + l); b.addEventListener('click', function () { if (has('lessons.start')) { UT.lessons.start(l); if (has('lessons.window.show')) UT.lessons.window.show(); } }); return b; }) : [];
          tbody.appendChild(h('tr', {}, [
            h('td', { class: 'g-term no-i18n' }, [h('b', {}, g.ko || ''), h('br'), g.en || g.term || '']),
            h('td', { class: 'no-i18n' }, g.defKo || ''), h('td', { class: 'no-i18n' }, g.defEn || ''), h('td', { class: 'g-see' }, see),
          ]));
        }
        count.textContent = t('{n} terms', { n });
      };
      search.addEventListener('input', render);
      render();
      return h('div', { class: 'glossary' }, [
        h('div', { class: 'fld' }, [tx('span', { class: 'fld-label' }, 'Search'), search, count]),
        h('div', { class: 'g-scroll' }, h('table', {}, [h('thead', {}, h('tr', {}, [tx('th', {}, 'Term'), tx('th', {}, 'Korean'), tx('th', {}, 'English'), tx('th', {}, 'Lessons')])), tbody])),
        h('div', { class: 'btn-row' }, [UT.dom.button('Close', function () { win.close(); }, { class: 'btn primary' })]),
      ]);
    });
  }

  // ------------------------------------------------------------------ quick tour (div#tour overlay, 8 steps)
  const TOUR_STEPS = [
    { target: '#toolbar', en: 'Welcome to UTsim. The toolbar selects the probe (0°/45°/60°/70°), calibration blocks (V1, V2, DAC), tools (PLOT, DAMP, SIZE), the defect editor, HIDE for blind practice, BEAM, RAD, PIPE, TKY, TOFD and AUT.', ko: 'UTsim에 오신 것을 환영합니다. 도구 모음에서 탐촉자(0°/45°/60°/70°), 교정 시험편(V1, V2, DAC), 도구(PLOT, DAMP, SIZE), 결함 편집기, 블라인드 연습용 HIDE, BEAM, RAD, PIPE, TKY, TOFD, AUT를 선택합니다.' },
    { target: '#instrument', en: 'The flaw detector (EPOCH 600 by default). Click a softkey (Gain, Range, Delay …) then use the arrows or the mouse wheel. Gates, DAC/TCG, peak memory, freeze, SAVE (datalogger) and AUTO 80 % are all functional.', ko: '탐상기(기본 EPOCH 600)입니다. 소프트키(Gain, Range, Delay …)를 누르고 화살표나 휠로 값을 바꿉니다. 게이트, DAC/TCG, 피크 메모리, 프리즈, SAVE(데이터로거), AUTO 80 %가 모두 동작합니다.' },
    { target: '#cv-plan', en: 'Plan view: the probe position along the weld (z), the skew compass and defect footprints. Drag the probe here to scan along the weld.', ko: '평면도: 용접선 방향 위치(z), 스큐 나침반, 결함의 평면 위치를 보여 줍니다. 여기서 탐촉자를 끌어 용접선을 따라 주사합니다.' },
    { target: '#cv-cross', en: 'Cross-section: specimen, weld preparation, probe and the sound beam with its skips. Drag the probe left/right (arrow keys: 1 mm, Shift 10 mm). Echoes on the A-scan correspond to the highlighted ray paths.', ko: '단면도: 시험편, 개선 형상, 탐촉자, 스킵을 포함한 음향 빔입니다. 탐촉자를 좌우로 끌거나 화살표 키(1 mm, Shift 10 mm)로 움직입니다. A-스캔의 에코는 강조된 빔 경로에 대응합니다.' },
    { target: '#menubar', en: 'Menus: Probes (library, wedge angle, focus, mode conversion, surface wave, finger damping), Weld (preparation, material, presets), Defects, Tools (DGS, standards evaluation, procedures, B-scan, echo dynamic, datalogger, sizing), Options and Help. F10 opens the menu bar from the keyboard.', ko: '메뉴: 탐촉자(라이브러리, 웨지 각도, 집속, 모드 변환, 표면파, 손가락 감쇠), 용접부(개선, 재질, 프리셋), 결함, 도구(DGS, 규격 평가, 절차서, B-스캔, 에코 다이내믹, 데이터로거, 크기 측정), 옵션, 도움말. F10으로 키보드에서 메뉴를 엽니다.' },
    { target: '#statusbar', en: 'Status bar: the physics line (wedge angle, refracted angle, velocities), probe position, range, gain, mode readouts and a hint for the current step.', ko: '상태 표시줄: 물리 라인(웨지 각도, 굴절각, 속도), 탐촉자 위치, 측정 범위, 게인, 모드별 판독값과 현재 단계의 힌트.' },
    { target: '#menu-help', en: 'Help ▸ Lessons: 25 guided lessons with automatic step checks, hints and "Do it for me". Help ▸ Echo quiz identifies gated echoes. Defects ▸ Trade Test / Random practice hide defects to find, size and report.', ko: '도움말 ▸ 레슨: 자동 단계 확인, 힌트, 대신 해 주기가 있는 25개의 안내 레슨. 도움말 ▸ 에코 퀴즈는 게이트 안의 에코를 맞힙니다. 결함 ▸ 실기 시험 / 무작위 연습은 숨겨진 결함을 찾아 크기를 재고 보고합니다.' },
    { target: '#menu-file', en: 'File ▸ Save scenario / Load scenario keep up to 5 setups; Share link… encodes the whole scenario (or an exam with a hidden truth) into a URL you can send to students. Enjoy!', ko: '파일 ▸ 시나리오 저장/불러오기로 5개의 설정을 보관하고, 공유 링크…는 시나리오 전체(또는 정답이 숨겨진 시험)를 URL로 만들어 학생에게 보낼 수 있습니다. 즐거운 학습 되세요!' },
  ];
  function tourSteps() {
    const s = has('i18nKo.tour');
    return Array.isArray(s) && s.length >= 3 ? s : TOUR_STEPS;
  }
  /** Help ▸ Quick tour: overlay #tour with a spotlight on the step target and a card (8 steps). */
  function openTour(i) {
    const root = mem.els.app;
    if (!root) return null;
    if (!mem.tour.el) {
      const el = h('div', { id: 'tour', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick tour' }, [
        h('div', { class: 'tour-spot' }),
        h('div', { class: 'tour-card' }, [
          h('div', { class: 'tour-head' }, [h('b', { class: 'tour-title' }), h('span', { class: 'tour-count' })]),
          h('div', { class: 'tour-text', 'aria-live': 'polite' }),
          h('div', { class: 'btn-row' }, [
            UT.dom.button('Skip', function () { closeTour(); }),
            UT.dom.button('Back', function () { openTour(mem.tour.i - 1); }, { class: 'tour-back' }),
            UT.dom.button('Next', function () { if (mem.tour.i >= tourSteps().length - 1) closeTour(); else openTour(mem.tour.i + 1); }, { class: 'btn primary tour-next' }),
          ]),
        ]),
      ]);
      el.addEventListener('mousedown', function (e) { if (e.target === el) closeTour(); });
      mem.tour.el = el;
    }
    const steps = tourSteps();
    mem.tour.i = M.clamp(i || 0, 0, steps.length - 1);
    mem.tour.open = true;
    if (!mem.tour.el.parentNode) root.appendChild(mem.tour.el);
    mem.tour.el.style.display = 'block';
    renderTour();
    return mem.tour.el;
  }
  function renderTour() {
    const el = mem.tour.el;
    if (!el || !mem.tour.open) return;
    const steps = tourSteps(), s = steps[mem.tour.i];
    el.querySelector('.tour-title').textContent = t('Quick tour');
    el.querySelector('.tour-count').textContent = (mem.tour.i + 1) + ' / ' + steps.length;
    el.querySelector('.tour-text').textContent = mem.lang === 'ko' ? (s.ko || s.en) : (s.en || s.ko);
    el.querySelector('.tour-back').classList.toggle('disabled', mem.tour.i === 0);
    el.querySelector('.tour-next').textContent = t(mem.tour.i >= steps.length - 1 ? 'Finish' : 'Next');
    positionTour();
    try { el.querySelector('.tour-next').focus(); } catch (e) { /* ignore */ }
  }
  /** Place the spotlight over the current target (design px inside #app). */
  function positionTour() {
    const el = mem.tour.el, root = mem.els.app;
    if (!el || !root || !mem.tour.open) return;
    const s = tourSteps()[mem.tour.i];
    const target = s.target ? root.querySelector(s.target) : null;
    const spot = el.querySelector('.tour-spot');
    const k = UT.dom.scale() || 1;
    if (target && target.offsetParent !== null) {
      const r = target.getBoundingClientRect(), a = root.getBoundingClientRect();
      spot.style.display = 'block';
      spot.style.left = ((r.left - a.left) / k - 4) + 'px'; spot.style.top = ((r.top - a.top) / k - 4) + 'px';
      spot.style.width = (r.width / k + 8) + 'px'; spot.style.height = (r.height / k + 8) + 'px';
    } else spot.style.display = 'none';
  }
  function closeTour() {
    if (!mem.tour.el) return;
    mem.tour.open = false;
    mem.tour.el.style.display = 'none';
    try { localStorage.setItem(TOUR_KEY, '1'); } catch (e) { /* ignore */ }
  }
  /** First-boot tour (once; never under automation or with a location hash). */
  function maybeAutoTour() {
    try {
      if (localStorage.getItem(TOUR_KEY)) return false;
      if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
      if (typeof location !== 'undefined' && location.hash) return false;
    } catch (e) { return false; }
    setTimeout(function () { if (!mem.tour.open) openTour(0); }, 300);
    return true;
  }

  // ------------------------------------------------------------------ print (div#print-root)
  /** Generic printable report into #print-root (used when no trade report exists). */
  function printGeneric() {
    const d = doc(), w = win_();
    if (!d) return false;
    let root = d.getElementById('print-root');
    if (!root) { root = h('div', { id: 'print-root' }); d.body.appendChild(root); }
    const s = st(), f = UT.frame || {};
    const dv = f.derived || derivedNow() || {};
    const R = f.readouts && f.readouts.primary;
    const sp = s.specimen || {};
    const kv = function (k, v) { return h('tr', {}, [h('th', {}, k), h('td', {}, String(v))]); };
    const imgOf = function (id) { const cv = byId(id); try { return cv && cv.toDataURL ? h('img', { src: cv.toDataURL('image/png'), alt: id, style: { maxWidth: '100%', border: '1px solid #333', margin: '4px 0' } }) : null; } catch (e) { return null; } };
    root.textContent = '';
    root.appendChild(h('div', { class: 'print-report' }, [
      h('h1', {}, 'UTsim — ' + t('Inspection report')),
      h('p', {}, new Date().toLocaleString()),
      h('table', { class: 'print-kv' }, [
        kv(t('Specimen'), (sp.name || sp.id || '') + (sp.T ? '  T ' + sp.T + ' mm' : '') + (sp.pipe ? '  OD ' + sp.pipe.od + ' mm' : '')),
        kv(t('Material'), (sp.material && sp.material.name) || s.material || 'carbon'),
        kv(t('Weld preparation'), (s.weldOpts && s.weldOpts.prep) || ''),
        kv(t('Probe'), (dv.libName || '') + '  ' + (s.probe.angle + '°') + ' ' + (s.probe.freq + ' MHz') + '  x ' + s.probe.x + '  z ' + s.probe.z + '  ' + t('side') + ' ' + (s.probe.side > 0 ? 'A' : 'B')),
        kv(t('Physics'), dv.statusLine || ''),
        kv(t('Instrument'), s.utSet + '  ' + t('Gain') + ' ' + s.instrument.gain + ' dB  ' + t('Range') + ' ' + s.instrument.range + ' mm  ' + t('Ref') + ' ' + s.instrument.refGain + ' dB'),
        R ? kv(t('Readouts'), 'SP ' + fmtNum(R.sp || R.path || 0) + '  SD ' + fmtNum(R.sd || 0) + '  DP ' + fmtNum(R.dp || R.depth || 0) + '  ' + fmtNum(R.peakPct || R.ampPct || 0) + ' %') : null,
        s.standards && s.standards.lastEval ? kv(t('Evaluation'), s.standards.lastEval.ruleId + ' ' + (s.standards.lastEval.level || '') + ': ' + (s.standards.lastEval.rows || []).map(function (r) { return (r.result && r.result.disposition) || ''; }).join(', ')) : null,
      ]),
      imgOf('cv-ascan'), imgOf('cv-cross'),
      (s.instrument.datalog && s.instrument.datalog.length) ? h('table', { class: 'print-kv' }, [h('tr', {}, [h('th', {}, '#'), h('th', {}, t('Time')), h('th', {}, t('Readouts')), h('th', {}, t('Gain')), h('th', {}, t('Note'))])].concat(s.instrument.datalog.map(function (e, i) { return h('tr', {}, [h('td', {}, String(i + 1)), h('td', {}, e.t ? new Date(e.t).toLocaleTimeString() : ''), h('td', {}, JSON.stringify(e.readouts || {})), h('td', {}, String(e.gain)), h('td', {}, e.note || '')]); }))) : null,
    ]));
    mem.printPending = true;
    d.body.classList.add('print-report');
    try { if (w && typeof w.print === 'function') w.print(); } catch (e) { /* ignore */ }
    return true;
  }

  // ------------------------------------------------------------------ file menu / layout reset
  function fileNew() {
    confirmDlg(t('Reset everything to the default setup? (defects, probe, instrument, weld)'), { title: 'New' }).then(function (ok) {
      if (!ok) return;
      try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
      mem.suspendSave = true;
      const def = UT.defaultState();
      UT.set(def, { noRender: true });
      mem.suspendSave = false;
      enterMode('weld', { keepProbe: false });
      if (!st().specimen) enterMode('weld');
      call('instruments.setSkin', [st().utSet]);
      applyA11y();
      applyScale();
      applyLayout();
      refreshToolbar();
      UT.renderNow();
    });
  }
  function fileLoad() {
    const patch = restore();
    if (!patch) { UT.dom.alert(t('No saved setup found in this browser.'), 'Load Setup'); return; }
    UT.set(patch, { noRender: true });
    enterMode('weld', { keepProbe: true });
    call('instruments.setSkin', [st().utSet]);
    applyA11y();
    applyScale();
    applyLayout();
    refreshToolbar();
    UT.renderNow();
  }
  function resetLayout() {
    for (const k of Object.keys(UT.dom.wins)) { const w = UT.dom.wins[k]; if (w && w.isOpen() && !w.el.classList.contains('modal')) { try { w.close(); } catch (e) { /* ignore */ } } }
    const d = UT.defaultState().display;
    setDisplay({ plan: d.plan, pipe3d: d.pipe3d, legend: d.legend, beam: d.beam, hide: false, scale: d.scale, touchBar: d.touchBar, highContrast: d.highContrast });
    if (st().utSet === 'usk7') call('instruments.setSkin', ['usk7']);
    syncPipe3d();
    applyScale();
    applyLayout();
    refreshToolbar();
  }

  // ------------------------------------------------------------------ language
  /**
   * Switch UI language ('en' | 'ko'): relabels the menus, toolbar tooltips, touch bar, open 90 windows and the
   * status hints, then emits 'lang' (every other window owner re-renders on it).
   * @param {string} lang
   * @returns {string} the language now in use
   */
  function setLang(lang) {
    const l = lang === 'ko' ? 'ko' : 'en';
    mem.lang = l;
    if (UT.i18n) UT.i18n.lang = l;
    UT.bus.emit('lang', l);
    scheduleSave(['lang']);
    return l;
  }
  /** 'lang' listener (also for changes made by others through UT.i18n.lang + emit). */
  function onLang(l) {
    if (l === 'ko' || l === 'en') { mem.lang = l; }
    const d = doc();
    if (d && d.documentElement) d.documentElement.lang = mem.lang;   // screen readers / font selection follow the UI language
    if (!d || !mem.built) return;
    for (const el of d.querySelectorAll('#menubar [data-key].menu-label')) el.textContent = t(el.dataset.key);
    for (const def of TOOLBAR) if (!def.gap && mem.tb['tb-' + def.id]) mem.tb['tb-' + def.id].title = tbTitle(def);
    closeMenus();
    for (const def of touchDefs()) { const el = mem.touch.els[def.id]; if (el) { el.title = t(def.title); el.setAttribute('aria-label', t(def.title)); el.textContent = t(def.label); } }
    if (mem.touch.els.step) mem.touch.els.step.textContent = t('Step {n} mm', { n: mem.touch.step });
    for (const name of Object.keys(mem.winBuilders)) {
      const w = winApi(name);
      if (w && w.isOpen()) { try { w.setContent(function () { return mem.winBuilders[name](w); }); } catch (e) { console.error('[UT.app] relabel ' + name, e); } }
    }
    if (mem.tour.open) renderTour();
    renderStatus(st().status);
  }

  // ------------------------------------------------------------------ persistence (v2 record)
  /** Build the JSON-serialisable persistence record for a state (pure; used by saveNow and __selftest). */
  function buildSavePatch(s, lang, prev) {
    const ins = {};
    for (const k of INSTR_KEYS) if (s.instrument && s.instrument[k] !== undefined) ins[k] = s.instrument[k];
    const std = Object.assign({}, s.standards || {});
    delete std.lastEval;
    if (!(std.rulesOverride && typeof std.rulesOverride === 'object')) delete std.rulesOverride;
    const lessons = s.lessons || {};
    const progress = {};
    let n = 0;
    for (const k of Object.keys(lessons.progress || {})) { if (n++ >= 40) break; progress[k] = lessons.progress[k]; }
    const trade = s.trade || {};
    const hist = Array.isArray(trade.history) ? trade.history.slice(-30) : [];
    const pa = Object.assign({}, s.pa || {}); delete pa.scan;
    // A trade test's seeded specimen and hidden truth defects are never the user's own setup: while the trade mode is
    // on screen (or a test is active / exam-locked) carry defects, weldOpts and material forward from the last saved
    // record — or omit them (patchFromRecord tolerates absent keys) — instead of the seeded values.
    const hidden = s.mode === 'trade' || !!(trade.active || (trade.exam && trade.exam.locked));
    const p = hidden && prev && typeof prev === 'object' ? prev : null;
    const rec = {
      v: 2, probe: s.probe, instrument: ins, display: s.display, defects: s.defects || [], weldOpts: s.weldOpts, utSet: s.utSet, lang: lang || 'en',
      material: s.material, physics: s.physics, standards: std, lessons: { progress, answers: lessons.answers || {} },
      trade: { history: hist, difficulty: trade.difficulty, timeLimitMin: trade.timeLimitMin }, pa,
    };
    if (hidden) {
      if (p && Array.isArray(p.defects)) rec.defects = p.defects; else delete rec.defects;
      if (p && p.weldOpts && typeof p.weldOpts === 'object') rec.weldOpts = p.weldOpts; else delete rec.weldOpts;
      if (p && typeof p.material === 'string') rec.material = p.material; else delete rec.material;
    }
    return UT.clone(rec);
  }
  /** Finite number from a stored value (number or numeric string), else `def`. */
  function num(v, def) {
    const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? +v : NaN);
    return Number.isFinite(n) ? n : def;
  }
  /** Finite number clamped to [lo, hi]; non-numeric → `def` (then clamped). */
  function numIn(v, def, lo, hi) { return M.clamp(num(v, def), lo, hi); }
  // Stored-record validation ranges (same limits as the Weld / wedge dialogs and instrument softkeys).
  const WELD_RANGES = { T: [3, 100], L: [50, 2000], bevel: [0, 60], rootGap: [0, 10], rootFace: [0, 10], capWidth: [0, 60], capHeight: [0, 10], rootHeight: [0, 10], od: [25, 2000], wt: [3, 100], webT: [3, 60], branchOd: [20, 1000], transferLossDb: [0, 8] };
  const WELD_TYPES = ['single-v', 'double-v', 'none', 'fillet'];
  const WELD_PREPS = ['single-v', 'double-v', 'single-bevel', 'j', 'single-v-backing', 'fillet-t', 'nozzle', 'none'];
  const WELD_ENUMS = { type: WELD_TYPES, prep: WELD_PREPS, weldMaterial: ['same', 'austenitic'] };
  /** Largest wall thickness a pipe of outside diameter `od` can have (a wall cannot exceed the radius; ≥ the WT minimum). */
  function pipeWtMax(od) { return Math.max(WELD_RANGES.wt[0], od / 2 - 1); }
  /** Cross-field pipe rule on a per-field-clamped weldOpts object: wt < od/2 (mutates and returns `o`). */
  function clampPipeWall(o) {
    if (o && o.pipe && Number.isFinite(o.od) && Number.isFinite(o.wt)) o.wt = Math.min(o.wt, pipeWtMax(o.od));
    return o;
  }
  /** Coerce weld options (prep authoritative, type mirrored; v1 records without prep get prep = type). */
  function coerceWeld(def, rec) {
    const src = rec && typeof rec === 'object' ? rec : {};
    const v = coerceLike(def, src, WELD_RANGES, WELD_ENUMS);
    if (typeof src.prep !== 'string' || WELD_PREPS.indexOf(src.prep) < 0) v.prep = v.type === 'fillet' ? 'fillet-t' : (WELD_PREPS.indexOf(v.type) >= 0 ? v.type : 'single-v');
    if (v.backing && v.prep === 'single-v') v.prep = 'single-v-backing';
    v.type = typeOfPrep(v.prep);
    v.backing = v.prep === 'single-v-backing';
    return clampPipeWall(v);
  }
  /** Stored probe.angle accepted as-is (the wedge dialog writes 0…90); outside → library angle (patchFromRecord). */
  const PROBE_ANGLE_VALID = [0, 90];
  const PROBE_RANGES = { angle: [0, 89.9], freq: [0.5, 20], diameter: [1, 50], wedgeVel: [1, 6], x: [-3000, 3000], z: [-5000, 5000], skew: [-360, 360], paFrom: [0, 89.9], paTo: [0, 89.9], paStep: [0.1, 10] };
  const PROBE_ENUMS = { mode: ['shear', 'comp'], crystal: ['single', 'twin'], method: ['pe', 'tt', 'tandem', 'pa'], surface: ['chord', 'brace', 'web'] };
  const DISPLAY_RANGES = { skips: [1, 12] };
  const DISPLAY_ENUMS = { units: ['mm', 'inch'], touchBar: ['auto', 'on', 'off'], scale: ['auto', 'fixed'], colourCode: ['none', 'propagation', 'geometry'] };
  const RECTIFY = ['full', 'rf', 'pos', 'neg'];
  const PULSER_ENERGY = [100, 200, 300, 400], PULSER_DAMPING = [50, 100, 150, 200, 400], FILTERS = ['broadband', '0.2-10', '1.5-8.5', '5-15'];
  const ENERGY_LABELS = { low: 100, med: 200, medium: 200, high: 400 };
  /**
   * Coerce `rec` onto the shape of `def`: every key of `def` keeps its default type (boolean → !!,
   * number → finite & clamped to ranges[k], string → one of enums[k] when given), unknown keys are dropped.
   * Nested plain objects are coerced recursively (ranges/enums looked up by the nested key), null defaults keep
   * a stored plain object/null and drop anything else.
   */
  function coerceLike(def, rec, ranges, enums) {
    const out = {};
    const src = rec && typeof rec === 'object' ? rec : {};
    for (const k of Object.keys(def)) {
      const d = def[k], v = src[k];
      if (typeof d === 'boolean') out[k] = v === undefined ? d : !!v;
      else if (typeof d === 'number') { const r = (ranges && ranges[k]) || [-1e6, 1e6]; out[k] = numIn(v, d, r[0], r[1]); }
      else if (typeof d === 'string') out[k] = typeof v === 'string' && (!enums || !enums[k] || enums[k].indexOf(v) >= 0) && v.length <= 40 ? v : d;
      else if (d === null) out[k] = v === undefined || (v !== null && typeof v !== 'object') ? null : v;
      else if (Array.isArray(d)) out[k] = Array.isArray(v) ? v : d.slice();
      else if (d && typeof d === 'object') out[k] = coerceLike(d, v, (ranges && ranges[k]) || ranges, (enums && enums[k]) || enums);
      else out[k] = v === undefined ? d : v;
    }
    return out;
  }
  function coerceGate(g, d) {
    const s = g && typeof g === 'object' ? g : {};
    return { on: s.on === undefined ? !!d.on : !!s.on, start: numIn(s.start, d.start, -50, 1000), width: numIn(s.width, d.width, 0, 1000), level: numIn(s.level, d.level, 0, 100), alarm: !!s.alarm };
  }
  function pickOf(v, list, def) { const n = num(v, NaN); return list.indexOf(n) >= 0 ? n : def; }
  function plainObj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : null; }
  /** Turn a stored record into a UT.set patch (validated, merged over the defaults); null when unusable. */
  function patchFromRecord(rec) {
    if (!rec || typeof rec !== 'object' || (rec.v !== 1 && rec.v !== 2)) return null;
    const def = UT.defaultState();
    const patch = {};
    if (rec.probe && typeof rec.probe === 'object') {
      const pr = coerceLike(def.probe, rec.probe, Object.assign({ crystalDims: { a: [1, 50], b: [1, 50] }, focus: { F: [10, 150] } }, PROBE_RANGES), Object.assign({ crystalDims: { shape: ['round', 'rect'] } }, PROBE_ENUMS));
      pr.side = num(rec.probe.side, 1) < 0 ? -1 : 1;
      if (!(has('probe.libEntry') && UT.probe.libEntry(pr.libId))) pr.libId = def.probe.libId;
      // Angle provenance: toolbar (0/45/60/70), a library entry, or the wedge dialog (custom 0…90, 90 = beyond the 2nd
      // critical angle). Anything else (NaN, 999, negative) is a corrupt record → the library entry's angle/mode via
      // UT.probe.select (never a clamp: an 89.9° probe is meaningless and no dialog can produce it).
      const rawAngle = num(rec.probe.angle, NaN);
      if (!(rawAngle >= PROBE_ANGLE_VALID[0] && rawAngle <= PROBE_ANGLE_VALID[1])) {
        const sel = has('probe.select') ? UT.probe.select(pr.libId) : null;
        pr.angle = sel ? sel.angle : def.probe.angle;
        pr.mode = sel ? sel.mode : def.probe.mode;
      }
      if (pr.angle === 0) pr.mode = 'comp';
      patch.probe = pr;
    }
    if (rec.instrument && typeof rec.instrument === 'object') {
      const ins = Object.assign({}, def.instrument);
      const ri = rec.instrument;
      for (const k of INSTR_KEYS) if (ri[k] !== undefined) ins[k] = ri[k];
      ins.gain = numIn(ins.gain, def.instrument.gain, 0, 110);
      ins.refGain = numIn(ins.refGain, ins.gain, 0, 110);
      ins.range = numIn(ins.range, def.instrument.range, 10, 1000);
      ins.delay = numIn(ins.delay, def.instrument.delay, -50, 1000);
      ins.reject = numIn(ins.reject, def.instrument.reject, 0, 80);
      ins.damping = !!ins.damping;
      if (RECTIFY.indexOf(ins.rectify) < 0) ins.rectify = def.instrument.rectify;
      const defGates = def.instrument.gates;
      // exactly defGates.length slots: junk entries fall back to that slot's default, extras are dropped
      ins.gates = defGates.map(function (d, i) { return coerceGate(Array.isArray(ins.gates) ? ins.gates[i] : undefined, d); });
      const dac = ins.dac && typeof ins.dac === 'object' ? ins.dac : def.instrument.dac;
      ins.dac = {
        points: (Array.isArray(dac.points) ? dac.points : []).filter(function (p) { return p && Number.isFinite(p.path) && Number.isFinite(p.ampPct); }).map(function (p) { return { path: p.path, ampPct: p.ampPct }; }),
        on: !!dac.on, refDb: Number.isFinite(dac.refDb) ? M.clamp(dac.refDb, 0, 110) : null, curves: dac.curves === undefined ? true : !!dac.curves,
      };
      const cal = ins.cal && typeof ins.cal === 'object' ? ins.cal : def.instrument.cal;
      ins.cal = { vel: Number.isFinite(cal.vel) ? M.clamp(cal.vel, 1, 10) : null, zero: numIn(cal.zero, 0, -50, 50) };
      ins.trig = coerceLike(def.instrument.trig, ins.trig, { angle: [0, 89.9], thick: [1, 1000], xValue: [-3000, 3000] });
      // v2 (SPEC-v2 §3.7): tcg / pulser (labels low/med/high accepted) / receiver / autoPct; never compare / datalog
      const tcg = plainObj(ins.tcg) || {};
      ins.tcg = { on: !!tcg.on };
      const pu = plainObj(ins.pulser) || {};
      const energy = typeof pu.energy === 'string' && ENERGY_LABELS[pu.energy.toLowerCase()] ? ENERGY_LABELS[pu.energy.toLowerCase()] : pickOf(pu.energy, PULSER_ENERGY, def.instrument.pulser.energy);
      ins.pulser = { energy, damping: pickOf(pu.damping, PULSER_DAMPING, ins.damping ? 50 : 150), prf: numIn(pu.prf, def.instrument.pulser.prf, 10, 2000) };
      const rc = plainObj(ins.receiver) || {};
      ins.receiver = { filter: FILTERS.indexOf(rc.filter) >= 0 ? rc.filter : 'broadband' };
      ins.autoPct = numIn(ins.autoPct, def.instrument.autoPct, 10, 100);
      ins.compare = null; ins.datalog = [];
      patch.instrument = ins;
    }
    if (rec.display && typeof rec.display === 'object') {
      const disp = coerceLike(def.display, rec.display, DISPLAY_RANGES, DISPLAY_ENUMS);
      if (typeof rec.display.scale !== 'string') disp.scale = def.display.scale;   // strings only (§2)
      patch.display = disp;
    }
    if (rec.weldOpts && typeof rec.weldOpts === 'object') patch.weldOpts = coerceWeld(def.weldOpts, rec.weldOpts);
    if (Array.isArray(rec.defects)) patch.defects = limitDefectSlots(rec.defects, zOptsOf(patch.weldOpts));
    if (rec.utSet === 'epoch600' || rec.utSet === 'epoch4' || rec.utSet === 'usk7') patch.utSet = rec.utSet;
    if (rec.lang === 'ko' || rec.lang === 'en') patch.__lang = rec.lang;
    // v2 keys (a v1 record lacks them → defaults)
    const mats = has('specimens.materials');
    if (typeof rec.material === 'string' && (mats ? !!mats[rec.material] : rec.material.length <= 20)) patch.material = rec.material;
    if (plainObj(rec.physics)) { const ph = coerceLike(def.physics, rec.physics, { fanRays: [21, 41] }); ph.fanRays = ph.fanRays === 21 ? 21 : 41; patch.physics = ph; }
    if (plainObj(rec.standards)) {
      const sd = coerceLike(def.standards, rec.standards, { technique: [1, 4], transferDb: [-20, 20] });
      sd.rulesOverride = plainObj(rec.standards.rulesOverride);
      sd.procedure = typeof rec.standards.procedure === 'string' && rec.standards.procedure.length <= 40 ? rec.standards.procedure : null;
      sd.lastEval = null;
      patch.standards = sd;
    }
    if (plainObj(rec.lessons)) {
      const progress = {};
      const rp = plainObj(rec.lessons.progress) || {};
      let n = 0;
      for (const k of Object.keys(rp)) {
        if (n >= 40) break;
        const e = plainObj(rp[k]);
        if (!e) continue;
        n++;
        progress[k] = k === 'quiz' ? { best: numIn(e.best, 0, 0, 100), attempts: numIn(e.attempts, 0, 0, 1e6) }
          : { done: !!e.done, best: numIn(e.best, 0, 0, 100), hints: numIn(e.hints, 0, 0, 1e6), doIt: numIn(e.doIt, 0, 0, 1e6), wrong: numIn(e.wrong, 0, 0, 1e6), auto: !!e.auto };
      }
      const answers = {};
      const ra = plainObj(rec.lessons.answers) || {};
      let m = 0;
      for (const k of Object.keys(ra)) { if (m++ >= 40) break; if (plainObj(ra[k])) answers[k] = UT.clone(ra[k]); }
      patch.lessons = Object.assign({}, def.lessons, { progress, answers });
    }
    if (plainObj(rec.trade)) {
      const rt = rec.trade;
      const history = (Array.isArray(rt.history) ? rt.history : []).filter(plainObj).slice(-30).map(function (e) { return UT.clone(e); });
      const difficulty = ['basic', 'intermediate', 'advanced'].indexOf(rt.difficulty) >= 0 ? rt.difficulty : def.trade.difficulty;
      patch.trade = Object.assign({}, def.trade, { history, difficulty, timeLimitMin: numIn(rt.timeLimitMin, def.trade.timeLimitMin, 0.01, 600) });
    }
    if (plainObj(rec.pa)) {
      const pa = coerceLike(def.pa, rec.pa, { elements: [1, 128], pitch: [0.1, 10], freq: [0.5, 20], from: [-89, 89], to: [-89, 89], step: [0.1, 10], escanAngle: [0, 89] }, { view: ['S', 'E', 'C'] });
      pa.focusDepth = Number.isFinite(num(rec.pa.focusDepth, NaN)) ? M.clamp(num(rec.pa.focusDepth, 0), 1, 1000) : null;
      pa.scan = null;
      patch.pa = pa;
    }
    return patch;
  }
  function restore() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      const patch = patchFromRecord(rec);
      if (patch) mem.lastRecord = rec;   // carried forward by buildSavePatch while a trade test is on screen
      if (patch && patch.__lang) { mem.lang = patch.__lang; if (UT.i18n) UT.i18n.lang = patch.__lang; delete patch.__lang; }
      return patch;
    } catch (e) { console.warn('[UT.app] restore failed', e); return null; }
  }
  /** Write the persistence record now (no debounce). Skipped while a trade test is active. */
  function saveNow() {
    if (mem.saveTimer) { clearTimeout(mem.saveTimer); mem.saveTimer = null; }
    if (st().trade && st().trade.active) return false;
    try {
      if (typeof localStorage === 'undefined') return false;
      const rec = buildSavePatch(st(), mem.lang, mem.lastRecord);
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
      mem.lastRecord = rec;
      return true;
    } catch (e) { console.warn('[UT.app] save failed', e); return false; }
  }
  function scheduleSave(keys) {
    if (mem.suspendSave || !mem.booted) return;
    if (!keys.some(function (k) { return PERSIST_KEYS.indexOf(k) >= 0 || k === 'lang'; })) return;
    if (st().trade && st().trade.active) return;
    if (mem.saveTimer) clearTimeout(mem.saveTimer);
    mem.saveTimer = setTimeout(function () { mem.saveTimer = null; saveNow(); }, 500);
  }

  // ------------------------------------------------------------------ boot
  /**
   * Run every `UT.*.__selftest()` (and `UT.views.*`) and log the results. Persistence is suspended for the whole
   * run and the top-level state objects are snapshotted / restored around each module, so a side-effecting
   * selftest can never reach localStorage or leave the app in a different mode.
   */
  function runSelftests() {
    const out = {};
    const wasSuspended = mem.suspendSave;
    mem.suspendSave = true;
    let dirty = false;
    const run = function (label, fn) {
      const saved = Object.assign({}, UT.state);
      try { out[label] = fn(); } catch (e) { out[label] = ['exception ' + (e && e.message)]; }
      const patch = {};
      for (const key of Object.keys(saved)) if (key !== 'status' && key !== 'cursor' && UT.state[key] !== saved[key]) patch[key] = saved[key];
      for (const key of Object.keys(UT.state)) if (!(key in saved)) delete UT.state[key];
      if (Object.keys(patch).length) {
        const modeBefore = st().mode;
        try { UT.set(patch, { noRender: true }); } catch (e) { console.warn('[UT.app] selftest restore', label, e); }
        if (patch.mode !== undefined && patch.mode !== modeBefore) UT.bus.emit('mode', { mode: patch.mode, prev: modeBefore });
        dirty = true;
      }
    };
    try {
      for (const k of Object.keys(UT)) {
        const m = UT[k];
        if (m && typeof m.__selftest === 'function') run(k, function () { return m.__selftest(); });
        if (k === 'views' && m) for (const v of Object.keys(m)) if (m[v] && typeof m[v].__selftest === 'function') run('views.' + v, function () { return m[v].__selftest(); });
      }
    } finally {
      if (mem.saveTimer) { clearTimeout(mem.saveTimer); mem.saveTimer = null; }
      mem.suspendSave = wasSuspended;
    }
    if (dirty) { refreshToolbar(); applyLayout(); try { UT.renderNow(); } catch (e) { /* logged by core */ } }
    for (const k of Object.keys(out)) console.log('[selftest] ' + k + ': ' + (out[k].length ? 'FAIL ' + JSON.stringify(out[k]) : 'ok'));
    return out;
  }
  /** init() of the v2 modules that expose one (45/56/82/84/92/94) — order = load order. */
  function initModules() {
    for (const name of ['standards', 'pa', 'lessons', 'trade', 'i18nKo', 'scenario']) {
      const m = UT[name];
      if (m && typeof m.init === 'function') { try { m.init(); } catch (e) { console.error('[UT.app] ' + name + '.init', e); } }
    }
  }
  /** Apply a #scn= scenario from the URL (94) after the first render; own hashchange fallback when 94 lacks init(). */
  function applyLocationScenario() {
    if (!has('scenario')) return;
    try {
      if (typeof UT.scenario.applyFromLocation === 'function') UT.scenario.applyFromLocation();
      else if (typeof location !== 'undefined' && /^#scn=/.test(location.hash) && typeof UT.scenario.fromUrl === 'function') UT.scenario.fromUrl(location.hash).then(function (o) { if (o) UT.scenario.apply(o); });
    } catch (e) { console.error('[UT.app] scenario from URL', e); }
    const w = win_();
    if (w && typeof UT.scenario.init !== 'function' && !mem.hashBound) { mem.hashBound = true; w.addEventListener('hashchange', applyLocationScenario); }
  }
  /**
   * Boot sequence (§15.9 / SPEC-v2 §5.5): restore → buildLayout → instruments.mount → view inits → module init()
   * → enter weld → renderNow → scenario from URL → #selftest → first-boot tour. Safe to call once; guarded
   * against missing modules.
   */
  function boot() {
    if (mem.booted) return;
    let patch = null;
    try { patch = restore(); } catch (e) { patch = null; }
    if (patch) { try { UT.set(patch, { silent: true, noRender: true }); } catch (e) { console.warn('[UT.app] restore apply failed', e); } }
    buildLayout();
    try { if (has('instruments.mount')) UT.instruments.mount(mem.els.instrument); } catch (e) { console.error('[UT.app] instruments.mount', e); }
    try { if (has('views.cross.init')) UT.views.cross.init(mem.els.cvCross); } catch (e) { console.error('[UT.app] views.cross.init', e); }
    try { if (has('views.cross.initRuler')) UT.views.cross.initRuler(mem.els.cvRuler); } catch (e) { console.error('[UT.app] views.cross.initRuler', e); }
    try { if (has('views.plan.init')) UT.views.plan.init(mem.els.cvPlan); } catch (e) { console.error('[UT.app] views.plan.init', e); }
    try { if (has('views.plotter.init')) UT.views.plotter.init(mem.els.cvPlotter); } catch (e) { console.error('[UT.app] views.plotter.init', e); }
    try { if (has('views.pipe3d.init')) UT.views.pipe3d.init(); } catch (e) { console.error('[UT.app] views.pipe3d.init', e); }
    initModules();
    mem.booted = true;
    try { enterMode('weld', { keepProbe: true }); } catch (e) { console.error('[UT.app] modes.enter', e); }
    if (!st().specimen && has('specimens.plateWeld')) {
      const o = Object.assign({}, st().weldOpts || {}, { material: st().material });
      UT.set({ specimen: o.pipe && UT.specimens.pipeWeld ? UT.specimens.pipeWeld(o) : UT.specimens.plateWeld(o) }, { noRender: true });
    }
    syncPipe3d();
    applyA11y();
    applyScale();
    applyLayout();
    refreshToolbar();
    armSoundIfOn();
    onLang(mem.lang);
    try { UT.renderNow(); } catch (e) { console.error('[UT.app] renderNow', e); }
    renderStatus(st().status);
    applyLocationScenario();
    if (typeof location !== 'undefined' && location.hash === '#selftest') runSelftests();
    maybeAutoTour();
  }

  // ------------------------------------------------------------------ public API + test API
  Object.assign(app, {
    boot, buildLayout, setLang, saveNow, applyLayout, applyScale, refreshToolbar, refreshTouchBar, menuByPath, activateToolbar, runSelftests,
    toolbarIds: TB_IDS, restore, patchFromRecord, buildSavePatch, coerceLike, parseSteps, wedgeToRefracted, probePatchFor, typeOfPrep, OD_INCH,
    openWeld, openWedge, openOptions, openStepWedge, openAbout, openGuide, openKeys, openExport, openProbeLib, openMaterial, openFocus, openGlossary,
    openTour, closeTour, printReport, closeMenus, openMenu: kbOpenMenu, selectLibProbe, setMaterial, applyWeldOpts,
    /** Current design-box scale factor (1 in 'fixed' mode). */
    scale() { return mem.scale; },
    /** True when the OS prefers reduced motion (scan owners step synchronously). */
    reducedMotion, touchBarVisible,
    /** Headless self test (pure helpers only). */
    __selftest() {
      const f = [];
      try {
        const probes = menuModel().find(function (m) { return m.id === 'menu-probes'; }).items.filter(function (i) { return !i.sep; }).map(function (i) { return i.key; });
        const want = ['Probe library…', 'Adjust Angle in Wedge (Shoe)', 'Zero Probe - Twin or Single Crystal', 'Pulse Echo', 'Through Transmission', 'Tandem (pitch catch)', '2.5 MHz Frequency', '5 MHz Frequency', 'Probe Diameter 10mm', 'Probe Diameter 5mm', 'Phased Array Probe', 'Focus Beam', 'Colour Code Display', 'Number of Skips', 'Single Line Beam', 'Mode conversion', 'Surface wave', 'Side lobes', 'Finger damping tool'];
        if (probes.join('|') !== want.join('|')) f.push('Probes menu order: ' + probes.join('|'));
        const ids = menuModel().map(function (m) { return m.id; }).join(',');
        if (ids !== 'menu-file,menu-probes,menu-stepwedge,menu-weld,menu-defects,menu-tools,menu-options,menu-help') f.push('menu ids ' + ids);
        const tools = menuModel().find(function (m) { return m.id === 'menu-tools'; }).items.filter(function (i) { return !i.sep; }).map(function (i) { return i.key; });
        if (tools.join('|') !== 'DGS diagram…|Evaluation (standards)…|Procedures|B-scan window|Echo dynamic window|Datalogger…|Sizing…') f.push('Tools menu ' + tools.join('|'));
        const keysOf = function (id) { return menuModel().find(function (m) { return m.id === id; }).items.filter(function (i) { return !i.sep; }).map(function (i) { return i.key; }); };
        for (const k of ['Save scenario…', 'Load scenario…', 'Share link…', 'Print report', 'New', 'Save Setup', 'Load Setup', 'Export A-scan PNG', 'Print']) if (keysOf('menu-file').indexOf(k) < 0) f.push('File menu lacks ' + k);
        for (const k of ['Sound alarm', 'Touch bar', 'High contrast', 'Auto-scale layout', 'Show dead zones', 'UT Set', 'Units', 'Language', 'Options...', 'Reset Layout']) if (keysOf('menu-options').indexOf(k) < 0) f.push('Options menu lacks ' + k);
        for (const k of ['Glossary…', 'Quick tour', 'Standards notes…', 'Echo quiz…', 'Lessons...', 'About UTsim...']) if (keysOf('menu-help').indexOf(k) < 0) f.push('Help menu lacks ' + k);
        if (keysOf('menu-weld').indexOf('Material…') < 0 || keysOf('menu-weld').indexOf('Weld Settings...') < 0) f.push('Weld menu');
        if (keysOf('menu-defects').indexOf('Random practice…') < 0 || keysOf('menu-stepwedge').indexOf('FBH block') < 0) f.push('Defects/Step Wedge v2 items');
        if (!keyMatches('Weld Settings...', 'Weld…') || !keyMatches('DGS diagram…', 'DGS diagram...') || !keyMatches('Focus Beam', 'Focus Beam…') || keyMatches('Pipe', 'TKY Joint')) f.push('keyMatches');
        if (TB_IDS.length !== 19 || TB_IDS[0] !== 'tb-0' || TB_IDS[18] !== 'tb-aut') f.push('toolbar ids ' + TB_IDS.join(','));
        // touch bar model: 10 listed buttons + 3 contextual (Mark L/R, Row+) + the Step button
        const td = touchDefs();
        if (td.filter(function (d) { return !d.ctx; }).length !== 10 || td.filter(function (d) { return d.ctx; }).length !== 3) f.push('touch bar defs');
        // persistence v2
        const ds = UT.defaultState();
        ds.instrument.compare = new Float32Array(4); ds.instrument.datalog = [{ id: 1 }];
        ds.standards.lastEval = { ruleId: 'x' };
        ds.pa.scan = { n: 1 };
        for (let i = 0; i < 45; i++) ds.lessons.progress[i + 1] = { done: true, best: 50 };
        ds.trade.history = new Array(35).fill({ score: 1 });
        const rec = buildSavePatch(ds, 'ko');
        if (rec.v !== 2 || rec.instrument.freeze !== undefined || rec.instrument.gain !== 30 || rec.lang !== 'ko') f.push('buildSavePatch');
        if (rec.instrument.compare !== undefined || rec.instrument.datalog !== undefined || rec.standards.lastEval !== undefined || rec.standards.rulesOverride !== undefined || rec.pa.scan !== undefined) f.push('buildSavePatch excludes compare/datalog/lastEval/scan');
        if (Object.keys(rec.lessons.progress).length !== 40 || rec.trade.history.length !== 30 || rec.material !== 'carbon' || rec.physics.fanRays !== 41 || rec.weldOpts.prep !== 'single-v') f.push('buildSavePatch caps / v2 keys');
        const p = patchFromRecord(rec);
        if (!p || p.instrument.gain !== 30 || p.utSet !== 'epoch600' || p.__lang !== 'ko' || !p.probe || p.instrument.compare !== null || p.instrument.datalog.length !== 0) f.push('patchFromRecord');
        if (!p.physics || p.physics.modeConv !== true || !p.standards || p.standards.lastEval !== null || !p.pa || p.pa.scan !== null || p.trade.history.length !== 30 || p.trade.active !== false) f.push('patchFromRecord v2 keys');
        if (patchFromRecord({ v: 3 }) !== null || patchFromRecord('x') !== null) f.push('patchFromRecord rejects');
        // trade test on screen: the seeded truth defects / weldOpts / material never reach the record (carried forward or omitted)
        const dt = UT.clone(ds); dt.mode = 'trade'; dt.trade.active = true; dt.defects = [{ type: 'crack', zFrom: 10, length: 20, height: 5 }]; dt.material = 'austenitic'; dt.weldOpts = Object.assign({}, dt.weldOpts, { T: 30, prep: 'double-v' });
        const prevRec = { v: 2, defects: [{ type: 'lof', zFrom: 1, length: 9, height: 2 }], weldOpts: { T: 20, prep: 'single-v', type: 'single-v' }, material: 'carbon' };
        const rt = buildSavePatch(dt, 'en', prevRec);
        if (!rt.defects || rt.defects[0].type !== 'lof' || rt.weldOpts.T !== 20 || rt.material !== 'carbon' || rt.probe === undefined) f.push('buildSavePatch trade carry-forward ' + JSON.stringify([rt.defects, rt.weldOpts, rt.material]));
        const rt2 = buildSavePatch(dt, 'en', null);
        if ('defects' in rt2 || 'weldOpts' in rt2 || 'material' in rt2 || !patchFromRecord(rt2)) f.push('buildSavePatch trade omits seeded keys');
        const dl = UT.clone(ds); dl.trade.exam = { locked: true }; dl.defects = dt.defects;
        if ('defects' in buildSavePatch(dl, 'en', null)) f.push('buildSavePatch exam-locked omits defects');
        if (buildSavePatch(ds, 'en', prevRec).defects.length !== ds.defects.length) f.push('buildSavePatch outside trade keeps live defects');
        const v1 = patchFromRecord({ v: 1, weldOpts: { T: 25, type: 'double-v' }, probe: { angle: 45 } });
        if (!v1 || v1.weldOpts.prep !== 'double-v' || v1.weldOpts.type !== 'double-v' || v1.probe.libId !== 'gen-60-5-10' || v1.probe.crystalDims.a !== 10 || v1.probe.focus.on !== false) f.push('v1 record → v2 defaults ' + JSON.stringify(v1.weldOpts));
        const fil = patchFromRecord({ v: 2, weldOpts: { prep: 'fillet-t', type: 'single-v' } }).weldOpts;
        if (fil.prep !== 'fillet-t' || fil.type !== 'fillet') f.push('prep mirrors type ' + JSON.stringify(fil));
        const bk = patchFromRecord({ v: 2, weldOpts: { prep: 'single-v', backing: true } }).weldOpts;
        if (bk.prep !== 'single-v-backing' || bk.type !== 'single-v' || bk.backing !== true) f.push('backing → single-v-backing');
        const bad = patchFromRecord({ v: 2, weldOpts: { T: 1e7, L: 'huge', bevel: -5, type: 'zigzag', prep: 'weird', pipe: 1, W: 1e9, transferLossDb: 99 }, instrument: { range: 0, delay: 'x', reject: -3, rectify: 'odd', gates: [{ start: 'a' }, null, { on: 1, level: 500 }], cal: { vel: 'v', zero: 1e9 }, pulser: { energy: 'high', damping: 77 }, receiver: { filter: 'nope' }, autoPct: 500, tcg: 'yes', compare: [1], datalog: 'x' }, probe: { angle: 'x', x: 1e9, side: -2, method: 'bogus', libId: 'nope', crystalDims: { a: 'q', shape: 'oval' }, focus: { on: 1, F: 999 } }, display: { skips: 99, units: 'furlong', plan: 0, scale: true, touchBar: 'maybe' }, physics: { fanRays: 33, modeConv: 0 }, material: 'unobtainium', standards: { lastEval: { x: 1 }, rulesOverride: 'str', procedure: 5 }, lessons: { progress: { 1: 'x', 2: { done: 1, best: 500 } }, answers: { 1: { 0: 'a' } } }, trade: { difficulty: 'insane', timeLimitMin: -5, history: 'x', active: true }, pa: { view: 'Q', elements: 1e9, focusDepth: 'x', scan: { n: 1 } } });
        const bw = bad.weldOpts, bi = bad.instrument, bp = bad.probe, bd = bad.display;
        if (bw.T !== 100 || bw.L !== 300 || bw.bevel !== 0 || bw.type !== 'single-v' || bw.prep !== 'single-v' || bw.pipe !== true || bw.W !== undefined || bw.transferLossDb !== 8) f.push('patchFromRecord weldOpts ' + JSON.stringify(bw));
        const thin = patchFromRecord({ v: 1, weldOpts: { od: 25, wt: 100, pipe: true } }).weldOpts;
        if (thin.od !== 25 || thin.wt !== 11.5) f.push('patchFromRecord pipe wall ' + JSON.stringify(thin));
        const plate = patchFromRecord({ v: 1, weldOpts: { od: 25, wt: 100, pipe: false } }).weldOpts;
        if (plate.wt !== 100) f.push('patchFromRecord plate wt untouched ' + JSON.stringify(plate));
        if (patchFromRecord({ v: 1, instrument: { gates: new Array(2000).fill({ start: 5 }) } }).instrument.gates.length !== 2) f.push('patchFromRecord gates truncated');
        if (bi.range !== 10 || bi.delay !== 0 || bi.reject !== 0 || bi.rectify !== 'full' || bi.gates.length !== 2 || bi.gates[0].start !== 10 || bi.gates[1].on !== false || bi.cal.vel !== null || bi.cal.zero !== 50) f.push('patchFromRecord instrument ' + JSON.stringify(bi));
        if (bi.pulser.energy !== 400 || bi.pulser.damping !== 150 || bi.receiver.filter !== 'broadband' || bi.autoPct !== 100 || bi.tcg.on !== false || bi.compare !== null || bi.datalog.length !== 0) f.push('patchFromRecord instrument v2 ' + JSON.stringify(bi.pulser));
        if (bp.angle !== 60 || bp.x !== 3000 || bp.side !== -1 || bp.method !== 'pe' || bp.libId !== 'gen-60-5-10' || bp.crystalDims.a !== 10 || bp.crystalDims.shape !== 'round' || bp.focus.on !== true || bp.focus.F !== 150) f.push('patchFromRecord probe ' + JSON.stringify(bp));
        // corrupt angles fall back to the library entry (bug: 999 used to clamp to 89.9°), legit custom angles survive
        const a999 = patchFromRecord({ v: 2, probe: { libId: 'nope', angle: 999 } }).probe;
        if (a999.angle !== 60 || a999.mode !== 'shear' || a999.libId !== 'gen-60-5-10') f.push('patchFromRecord angle 999 ' + JSON.stringify(a999));
        const aLib = patchFromRecord({ v: 2, probe: { libId: 'gen-45-5-10', angle: -7 } }).probe;
        if (aLib.angle !== 45 || aLib.libId !== 'gen-45-5-10') f.push('patchFromRecord negative angle → library angle ' + JSON.stringify(aLib));
        const aZero = patchFromRecord({ v: 2, probe: { libId: 'gen-0-5-10', angle: 'x', mode: 'shear' } }).probe;
        if (aZero.angle !== 0 || aZero.mode !== 'comp') f.push('patchFromRecord NaN angle → 0° comp ' + JSON.stringify(aZero));
        const aCustom = patchFromRecord({ v: 2, probe: { libId: 'gen-60-5-10', angle: 55.3 } }).probe;
        if (aCustom.angle !== 55.3 || patchFromRecord({ v: 2, probe: { angle: 90 } }).probe.angle !== 89.9 || patchFromRecord({ v: 1, probe: { angle: 45 } }).probe.angle !== 45) f.push('patchFromRecord custom angle kept');
        // procedure lock helpers (pure): no trade → unrestricted; the id test follows the allowed list
        if (!probeAllowed('gen-45-5-10', { trade: { active: false } }) || probeLockKey({ trade: { active: false } }) !== '') f.push('probeAllowed unrestricted');
        if (has('standards.procedures') && UT.standards.procedures['aws-d11-70']) {
          const ls = { trade: { active: true }, standards: { procedure: 'aws-d11-70' } };
          if (probeAllowed('gen-45-5-10', ls) || !probeAllowed('gen-70-5-10', ls) || !probeAllowed('mwb70-2', ls) || probeLockKey(ls).indexOf('gen-70-5-10') < 0) f.push('probeAllowed aws-d11-70');
        }
        if (bd.skips !== 12 || bd.units !== 'mm' || bd.plan !== false || bd.scale !== 'auto' || bd.touchBar !== 'auto') f.push('patchFromRecord display ' + JSON.stringify(bd));
        if (bad.physics.fanRays !== 41 || bad.physics.modeConv !== false || bad.material !== undefined || bad.standards.lastEval !== null || bad.standards.rulesOverride !== null || bad.standards.procedure !== null) f.push('patchFromRecord physics/material/standards');
        if (Object.keys(bad.lessons.progress).length !== 1 || bad.lessons.progress[2].best !== 100 || bad.lessons.progress[2].done !== true || bad.lessons.answers[1][0] !== 'a') f.push('patchFromRecord lessons ' + JSON.stringify(bad.lessons));
        if (bad.trade.difficulty !== 'intermediate' || bad.trade.timeLimitMin !== 0.01 || bad.trade.history.length !== 0 || bad.trade.active !== false) f.push('patchFromRecord trade ' + JSON.stringify(bad.trade));
        if (bad.pa.view !== 'S' || bad.pa.elements !== 128 || bad.pa.focusDepth !== null || bad.pa.scan !== null) f.push('patchFromRecord pa ' + JSON.stringify(bad.pa));
        if (parseSteps('25, 5,10 ,15;20 20').join(',') !== '5,10,15,20,25') f.push('parseSteps');
        const r = wedgeToRefracted(47.1, 2.74, null);
        if (r.mode !== 'shear' || Math.abs(r.refracted - 60) > 0.2) f.push('wedge 47.1 -> ' + r.refracted + ' ' + r.mode);
        const rc = wedgeToRefracted(20, 2.74, null);
        if (rc.mode !== 'comp' || Math.abs(rc.refracted - 47.4) > 0.3) f.push('wedge 20 comp -> ' + rc.refracted);
        if (!wedgeToRefracted(70, 2.74, null).beyond) f.push('beyond 2nd critical');
        if (Math.abs(r.crit.first - 27.7) > 0.1 || Math.abs(r.crit.second - 57.7) > 0.1) f.push('critical angles');
        if (probePatchFor(60.02, 'shear').angle !== 60 || probePatchFor(55.26, 'shear').angle !== 55.3 || probePatchFor(0, 'comp').mode !== 'comp') f.push('probePatchFor');
        if (typeOfPrep('nozzle') !== 'fillet' || typeOfPrep('j') !== 'single-v' || typeOfPrep('double-v') !== 'double-v' || typeOfPrep('none') !== 'none') f.push('typeOfPrep');
        if (OD_INCH[6] !== 168.3 || inchOf(219.1) !== '8' || inchOf(200) !== 'custom') f.push('OD table');
        const mid = midParts(null);
        if (!/^Pos: /.test(mid[0]) || !/^Range /.test(mid[1]) || !/^AMP= /.test(mid[2])) f.push('midParts ' + mid.join('|'));
        if (TOUR_STEPS.length !== 8 || TOUR_STEPS.some(function (s) { return !s.ko || !s.en || !s.target; })) f.push('tour steps');
        if (GLOSSARY_FALLBACK.length !== 20 || Object.keys(PREP_ICONS).length !== 8) f.push('glossary fallback / prep icons');
        if (typeof UT.test.lang !== 'function' || typeof UT.test.click !== 'function' || typeof UT.test.menu !== 'function') f.push('test api');
      } catch (e) { f.push('exception ' + (e && e.message)); }
      return f;
    },
  });
  UT.app = app;

  Object.assign(UT.test, {
    /** Click a toolbar button by id ('tb-60'); false when missing or disabled. */
    click(id) { return activateToolbar(String(id).indexOf('tb-') === 0 ? String(id) : 'tb-' + id); },
    /** Run a menu item by its English label path; false when missing or disabled. */
    menu(path) { return menuByPath(path); },
    /** Switch the UI language ('en' | 'ko') through UT.app.setLang; returns the language in use. */
    lang(code) { return setLang(code); },
  });

  if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { boot(); });
    else setTimeout(boot, 0);
  }
})(window.UT = window.UT || {});
