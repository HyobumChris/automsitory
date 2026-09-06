/* 70-instruments.js — EPOCH 600 / EPOCH 4 / USK7 instrument skins (DOM + CSS) and the shared
 * A-scan / S-scan canvas renderers.  SPEC §7.1–7.3 as amended by §14.4 and §15.7.
 *
 * // SPEC NOTES (decisions where the spec is silent)
 * - USK7: the skin is a floating window (`data-win="usk7"`) holding the CRT canvas `cv-ascan`; while it is the
 *   active UT set `#instrument` shows a small dark panel with a "Show USK 7" button (the window can be closed
 *   with its OFF button and re-opened from that panel or Options ▸ UT Set).  Only one `#cv-ascan` exists at a time.
 * - `UT.instruments.window` is a lazy getter: the window is created on first access (needs a document).
 *   In v1/v2 the USK7 is parked bottom-right (§14.8); leaving those modes restores the position it had before.
 * - 2ND F is a latch: it highlights until the next key consumes it (dB → refGain = gain; ▲▼ → 6 dB gain steps;
 *   RANGE → previous preset instead of next; ↶ cancels).
 * - GATES hard key: cycles the active gate 1 → 2 → 1, turns that gate on, selects its Start parameter and shows it
 *   (page 2, Gate1/Gate2 sub-page).  P1–P5 always return to the top level of the page (sub-page cleared).
 *   dB / RANGE leave a sub-page that does not show Gain / Range (and fall back to page 1) so the selected value is visible.
 *   Selecting a Gate2 parameter from the Gate2 sub-page also switches `activeGate` and turns the gate on.
 * - ◀ ▶ (and Shift+▲▼) are coarse steps: gain 6 dB, range 10 %, delay 10 mm, gates 10 mm / 10 %, velocity
 *   100 m/s, zero 0.1 µs, trig angle 1°, trig thickness 1 mm.  Fine steps per §15.7 (velocity 10 m/s, zero
 *   0.01 µs, trig 0.1).  Manually adjusting Trig Angle / Thick turns `display.autoTrig` off.
 * - Rectify cycles full → half+ → half- → rf (`instrument.rectify`); half modes are drawn from `ascan.rf` when
 *   40-ascan supplies it, else like full wave.
 * - Page 5 `Reset` restores gain/range/delay/reject/gates/cal defaults (keeps DAC points and trig).
 * - `Gate Setup ▸ Mode Peak|Edge` is display only (kept in module memory); `Measure SP|Depth` sets `instrument.readout`.
 * - Focus: arrow keys reach `handleKey` only after the user clicked inside `#instrument` (or the USK7 window);
 *   clicking anywhere else (mousedown or click, so synthetic clicks count too) releases the focus so the app can use
 *   the arrows for the probe again.  EPOCH 4 screen softkeys / gate cells take the focus like the EPOCH 600 softkeys.
 * - EPOCH 600 ref gain lock: while `instrument.refGain` is set the Gain softkey reads `Ref 30.2 + 2.0 dB` (small font)
 *   and the `REF dB` caption above the dB key is lit; a second 2ND F + dB releases the lock (refGain = gain either
 *   way, so the state contract of §15.7 is unchanged), page 5 Reset clears it.  The lock flag lives in module memory.
 * - EPOCH 4 `AUTO-80`: gain += 20·log10(80 / gated peak %) when a gated peak exists (clamped 0…110 dB).
 * - Half-wave / full-wave EPOCH 4 label follows `instrument.rectify`; `DAMPING` shows 50 when damping is on, else 150.
 * - drawAscan theme: string ('epoch600' | 'epoch4' | 'usk7' | 'aut' | 'tofd') or an object merged over the
 *   epoch600 theme (`{bg, grid, gridStyle, trace, traceFill, peak, gate, gate2, dac, text, axes, margin,
 *   gates, dacPoints, xLabelStep, width, height}`); the plot rectangle is the canvas CSS box minus `margin`.
 *
 * // SPEC NOTES v2 (SPEC-v2 §3.7, §5.2 F2/F3, §5.4, §5.7, §7, §8, §9 V2-8/21/24)
 * - Pulsar page: Freq (display), Energy cycles 100→200→300→400 V, Damping cycles 50→100→150→200→400 Ω and writes
 *   `{damping: Ω === 50, pulser: {...pulser, damping: Ω}}` in ONE setIn (instrument.damping stays the single
 *   source); PRF cycles 30/60/120/240/480/1000 Hz (display only). The DAMP toolbar key / EPOCH 4 PULSER toggle
 *   writes `{damping: !d, pulser: {...pulser, damping: !d ? 50 : 150}}`. Rcvr page: Filter cycles the four
 *   EPOCH 600 bands (`instrument.receiver.filter`), Rectify, Reject. Option lists are taken from UT.ascan when it
 *   is loaded (ENERGIES/DAMPING_OHMS/FILTERS/PRF_LIST) and fall back to identical local copies.
 * - TCG: page 3 (and the DAC Setup sub-page) get a `TCG` softkey toggling `instrument.tcg.on`; while TCG is active
 *   (on and ≥ 2 DAC points — UT.ascan.tcgActive when present) the DAC curve is drawn FLAT at
 *   80·10^((gain − refDb)/20) %, the −6/−14 dB sub-curves follow it, and a `TCG` badge is shown on the A-scan.
 * - AUTO XX %: `UT.instruments.auto(pct = instrument.autoPct)` sets the gain so the gated peak reads pct (via
 *   UT.ascan.autoGain when present, else gain + 20·log10(pct/peak)), rounded to 0.1 dB, clamped 0…110; returns the
 *   new gain or null (no gated echo → status hint). `2ND F + GATES` calls it with `autoPct`, EPOCH 4 `AUTO-80`
 *   with 80. `instrument.autoPct` (10…100, step 1 / coarse 10) is editable as the `AUTO %` cell of the Gate Setup
 *   sub-page — `autoPct` is therefore an additional legal `selectedParam` (LEGAL_PARAMS gains it); the caption
 *   above the GATES key reads `AUTO 80%` live.
 * - `UT.instruments.storeRef()` (= 2ND F + dB) stores `refGain = gain` and raises the ref-lock flag (idempotent).
 *   The physical key sequence keeps the v1 toggle: pressed again while locked at the same gain it releases the lock.
 * - `UT.instruments.wheel(n)`: n rotary-knob clicks on the selected parameter (sign = direction). One click = the
 *   fine step of the parameter EXCEPT gain, where one click is 1 dB (lesson 1: `wheel(+6)` takes 30 → 36 dB; v1's
 *   ▲▼ keep 0.5 dB). The mouse wheel over #instrument / the USK7 CRT goes through the same function (Shift = ×6 clicks
 *   for gain, coarse step otherwise) so it emits the same `'ui'` event.
 * - Compare: `2ND F + ❄` (and `UT.instruments.compare()`) stores a Float32Array copy of the current samples in
 *   `instrument.compare` (module-level mirror `mem.compare`); pressed again it clears. drawAscan draws
 *   `instrument.compare` (or the mirror when the key was lost by a clone) as a grey trace behind the live trace with
 *   a `CMP` badge. Never persisted; core's UT.test.state() nulls it.
 * - SAVE (EPOCH 600 SAVE, EPOCH 4 SAVE WAVE / SAVE THICK) → `UT.instruments.save(note)` appends
 *   `{id, t, readouts: {sp, sd, dp, amp}, gain, range, note, utSet, mode, probe: {angle, x, z}}` to `instrument.datalog`
 *   (cloned array, capped at 100 — oldest dropped). Window `datalog` (`UT.instruments.datalog = {open, close, toggle,
 *   window, clear, remove, copyJson}`): table, per-row Delete, Clear all, Copy JSON (clipboard API with a textarea
 *   fallback), Save now; it re-renders on 'state' (datalog key) and on 'lang'.
 * - Gate alarm (F3): module-level `alarmWas[]`; on every 'render' (subscribed in mount) each gate with `on && alarm`
 *   compares `now = !!frame.readouts.gate[i]` with the previous value and calls `UT.audio.beep()` on the rising edge
 *   only; the A-scan shows a red `ALARM` badge while any alarmed gate has a readout. UT.audio.beep() is a no-op while
 *   `display.sound` is off (no AudioContext is created by 70 — never touched directly).
 * - 'ui' bus events (§4.1): every softkey / hard key / screen cell press emits `{kind:'softkey', id}` where id is the
 *   parameter name for value cells ('gain', 'range', …), the label for sub-pages/actions ('Pulsar', 'TCG', 'Record'),
 *   'db-30' for the bottom dB cells and the key name for hard keys ('dB', 'SAVE', 'GATES', 'RANGE', '2ND F',
 *   'PEAK MEM', 'freeze', 'up', 'down', 'left', 'right', 'enter', 'escape', 'NEXT GROUP', 'P3', 'F2', 'AUTO-80', …);
 *   wheel() emits `{kind:'wheel', id: selectedParam}` once per call (not per click).
 * - Touch: the skin root gets class `touch` when `display.touchBar === 'on'` or (`'auto'` and `(pointer: coarse)`);
 *   the CSS then enlarges the softkey cells, keys, bottom dB cells and the EPOCH 600 screen (330 × 290). Value drags
 *   (softkey cells, EPOCH 4 gate cells) and the USK7 knob dials use Pointer Events with setPointerCapture,
 *   `touch-action: none`, and divide the pointer delta by UT.dom.scale() (4 design px per fine step, 6 px per knob step).
 * - High contrast (`.hc` on #app, set by 90): brighter borders/text, white selected softkey outline, and the A-scan
 *   trace is drawn white and 2 px wide with a brighter grid (theme override in drawCanvas).
 * - EPOCH 4 screen: `ENERGY LOW|MED|MED+|HIGH` (100/200/300/400 V), `DAMPING <Ω>`, `FILTER STD|<band>`; the three
 *   cells are clickable and cycle their option (ENERGY → energy, DAMPING → Ω list, FILTER → band). 2ND F + PULSER
 *   cycles the filter (caption FILTER). USK7: a small magenta line under the CRT text shows `P 200V 150Ω  F BB`.
 * - PA: drawSscan draws `frame.sscan` (from UT.pa when present — 40 already prefers `frame.pa.sscan`) and marks the
 *   selected angle (`frame.paSelected.angle`) with a thin dashed radial line.
 * - i18n: softkey labels, captions, datalog window texts and status hints go through UT.i18n.t() with `data-i18n`
 *   (relabelled on 'lang'); product hard-key legends (dB, SAVE, GATES, OLYMPUS, EPOCH 600, P1…, F1…) sit in
 *   `.no-i18n` elements, as do numeric value cells.
 * - Test API: UT.test.datalog() (clone of the entries), autoPct(v?) (get / set), auto(pct) → gain, storeRef() → refGain,
 *   wheel(n) → the selected parameter's new value.
 */
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts.COLOURS;
  const RANGE_PRESETS = [50, 100, 200, 400];
  const LEGAL_PARAMS = ['gain', 'range', 'delay', 'reject', 'g1start', 'g1width', 'g1level', 'g2start', 'g2width', 'g2level', 'velocity', 'zero', 'trigAngle', 'trigThick', 'autoPct'];
  // v2 option lists (§3.7) — identical to 40-ascan's tables; UT.ascan's copies win when loaded
  const ENERGIES = [100, 200, 300, 400];
  const DAMPING_OHMS = [50, 100, 150, 200, 400];
  const PRF_LIST = [30, 60, 120, 240, 480, 1000];
  const FILTERS = ['broadband', '0.2-10', '1.5-8.5', '5-15'];
  const DATALOG_CAP = 100;
  const ENERGY_LABELS = { low: 100, med: 200, medium: 200, high: 400 };
  const ENERGY_E4 = { 100: 'LOW', 200: 'MED', 300: 'MED+', 400: 'HIGH' };

  // ------------------------------------------------------------------ module memory
  const mem = {
    container: null, skin: null, canvas: null, iconCanvas: null, refs: {}, mounted: false,
    secondF: false, subPage: null, gateMode: 'Peak', focused: false, refLock: false, uskWin: null, uskParked: null, drag: null,
    lastTexts: {}, ledOn: true,
    // v2
    compare: null, alarmWas: [], alarmNow: false, datalogWin: null, datalogKey: '', touch: false, mq: null, uiCount: 0,
  };

  // ------------------------------------------------------------------ small helpers
  function h(tag, attrs, kids) { return UT.dom.h(tag, attrs, kids); }
  function t(key, params) { return UT.i18n && UT.i18n.t ? UT.i18n.t(key, params) : key; }
  /** Translated text node element with data-i18n (relabelled by core on 'lang' when no params are used). */
  function tx(tag, cls, key, params) { const a = { class: cls || null, dataset: { i18n: key } }; if (!params) a['data-i18n-auto'] = '1'; return h(tag, a, t(key, params)); }
  /** Emit the 'ui' bus event of §4.1 ({kind:'softkey'|'wheel', id}). */
  function emitUi(kind, id) { mem.uiCount++; try { UT.bus.emit('ui', { kind, id: String(id) }); } catch (e) { /* bus logs */ } }
  function hasAscan(fn) { return !!(UT.ascan && typeof UT.ascan[fn] === 'function'); }
  function listOf(name, local) { const a = UT.ascan && UT.ascan[name]; return Array.isArray(a) && a.length ? a : local; }
  /** Current pulser energy (V) — accepts the v1 labels low/med/high. */
  function energyV(ins) {
    const I = ins || inst();
    if (hasAscan('energyV')) return UT.ascan.energyV(I);
    let e = I.pulser && I.pulser.energy;
    if (typeof e === 'string') e = ENERGY_LABELS[e.trim().toLowerCase()] || +e;
    if (!Number.isFinite(e)) return 200;
    return nearestIn(ENERGIES, e);
  }
  /** Effective damping Ω (instrument.damping boolean is the single source: true ⇒ 50 Ω). */
  function dampingOhms(ins) {
    const I = ins || inst();
    if (hasAscan('dampingOhms')) return UT.ascan.dampingOhms(I);
    if (I.damping) return 50;
    const o = I.pulser && DAMPING_OHMS.indexOf(I.pulser.damping) >= 0 ? I.pulser.damping : 150;
    return o === 50 ? 150 : o;
  }
  function filterOf(ins) { const I = ins || inst(); if (hasAscan('filterOf')) return UT.ascan.filterOf(I); const f = I.receiver && I.receiver.filter; return FILTERS.indexOf(f) >= 0 ? f : 'broadband'; }
  function prfOf(ins) { const I = ins || inst(); const p = I.pulser && +I.pulser.prf; return Number.isFinite(p) && p > 0 ? p : 60; }
  function nearestIn(list, v) { let best = list[0]; for (const x of list) if (Math.abs(x - v) < Math.abs(best - v)) best = x; return best; }
  function nextIn(list, cur) { const i = list.indexOf(cur); return list[(i + 1) % list.length]; }
  function filterLabel(f) { return f === 'broadband' ? 'Broadband' : f + ' MHz'; }
  function pulserOf(ins) { return Object.assign({ energy: 200, damping: 150, prf: 60 }, (ins || inst()).pulser || {}); }
  function tcgActive(ins) {
    const I = ins || inst();
    if (hasAscan('tcgActive')) return !!UT.ascan.tcgActive(I);
    return !!(I.tcg && I.tcg.on && I.dac && I.dac.points && I.dac.points.length >= 2);
  }
  function st() { return UT.state; }
  function inst() { return UT.state.instrument; }
  function derived() { return (UT.frame && UT.frame.derived) || UT.probe.derive(UT.state.probe, UT.state.specimen); }
  function fmtGain(g) { return (Math.abs(g - Math.round(g)) < 1e-9 ? String(Math.round(g)) : g.toFixed(1)) + 'dB'; }
  function fmtNum(v, dp) { return (v === null || v === undefined || Number.isNaN(v)) ? '--' : Number(v).toFixed(dp); }
  function isInch() { return st().display && st().display.units === 'inch'; }
  function fmtRead(mm) { if (mm === null || mm === undefined || Number.isNaN(mm)) return '--.--'; return isInch() ? (mm / 25.4).toFixed(3) : M.fmt2(mm); }
  function unitLabel() { return isInch() ? 'in' : 'mm'; }
  function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }
  function gateOf(i, ins) { const g = (ins || inst()).gates; return g[i] || { on: false, start: 0, width: 0, level: 0, alarm: false }; }
  function patchGate(i, patch) {
    const gates = inst().gates.map(function (g, j) { return j === i ? Object.assign({}, g, patch) : Object.assign({}, g); });
    while (gates.length <= i) gates.push(Object.assign({ on: false, start: 70, width: 20, level: 40, alarm: false }, patch));
    UT.setIn('instrument', { gates });
  }
  function setInst(patch) { UT.setIn('instrument', patch); }
  /** Next / previous range preset (50/100/200/400) relative to the current range. */
  function nextRange(cur, backwards) {
    if (backwards) { for (let i = RANGE_PRESETS.length - 1; i >= 0; i--) if (RANGE_PRESETS[i] < cur - 1e-6) return RANGE_PRESETS[i]; return RANGE_PRESETS[RANGE_PRESETS.length - 1]; }
    for (let i = 0; i < RANGE_PRESETS.length; i++) if (RANGE_PRESETS[i] > cur + 1e-6) return RANGE_PRESETS[i];
    return RANGE_PRESETS[0];
  }
  /** Fold a depth into 0..T (leg-corrected). */
  function foldDepth(d, T) {
    if (!(T > 0)) return d;
    const period = 2 * T;
    let r = d % period; if (r < 0) r += period;
    return r > T ? period - r : r;
  }
  /** Colour map for S-scan / amplitude images. */
  function ampColour(pct) {
    if (pct >= 80) return '#ff2020';
    if (pct >= 50) return '#ffe000';
    if (pct >= 30) return '#20e020';
    if (pct >= 10) return '#3060ff';
    return '#203080';
  }
  /** DAC polyline at the current gain: [{path, pct}] (linear interpolation, ends held), or [] when < 2 points. */
  function dacPolyline(instrument, gainOverride) {
    const dac = instrument.dac;
    if (!dac || !dac.points || dac.points.length < 2) return [];
    const pts = dac.points.slice().sort(function (a, b) { return a.path - b.path; });
    const gain = gainOverride === undefined ? instrument.gain : gainOverride;
    const scale = Math.pow(10, (gain - (dac.refDb === null || dac.refDb === undefined ? gain : dac.refDb)) / 20);
    return pts.map(function (p) { return { path: p.path, pct: p.ampPct * scale }; });
  }
  function dacAt(poly, path) {
    if (!poly.length) return null;
    if (path <= poly[0].path) return poly[0].pct;
    for (let i = 1; i < poly.length; i++) {
      if (path <= poly[i].path) { const a = poly[i - 1], b = poly[i]; const t = (path - a.path) / Math.max(1e-9, b.path - a.path); return M.lerp(a.pct, b.pct, t); }
    }
    return poly[poly.length - 1].pct;
  }
  /** Flat TCG reference polyline: 80·10^((gain − refDb)/20) % across the recorded DAC span (§3.7). */
  function tcgFlatPolyline(instrument) {
    const dac = instrument.dac;
    if (!dac || !dac.points || dac.points.length < 2) return [];
    const pts = dac.points.slice().sort(function (a, b) { return a.path - b.path; });
    const ref = dac.refDb === null || dac.refDb === undefined ? instrument.gain : dac.refDb;
    const pct = 80 * Math.pow(10, (instrument.gain - ref) / 20);
    return [{ path: pts[0].path, pct }, { path: pts[pts.length - 1].path, pct }];
  }
  /** The compare snapshot to draw for an instrument object: its own `compare`, else the module mirror when the key is absent. */
  function compareOf(instrument) {
    const c = instrument.compare;
    if (c && typeof c.length === 'number' && c.length) return c;
    if (c === undefined && mem.compare && instrument === (UT.state && UT.state.instrument)) return mem.compare;
    return null;
  }
  /** True when any gate with `on && alarm` currently holds a readout (visual alarm flag; the beep is edge-triggered in onRender). */
  function alarmActive(instrument, frame) {
    const ro = frame && frame.readouts; const gates = instrument && instrument.gates;
    if (!ro || !ro.gate || !gates) return false;
    for (let i = 0; i < gates.length; i++) { const g = gates[i]; if (g && g.on && g.alarm && ro.gate[i]) return true; }
    return false;
  }

  // ------------------------------------------------------------------ parameter model
  const PARAMS = {
    gain: { label: 'Gain', get(ins) { return (ins || inst()).gain; }, set(v) { setInst({ gain: M.clamp(v, 0, 110) }); }, step: 0.5, coarse: 6, fmt(v) { return fmtGain(v); } },
    range: { label: 'Range', get(ins) { return (ins || inst()).range; }, set(v) { setInst({ range: M.clamp(Math.round(v * 10) / 10, 10, 1000) }); }, stepOf: rangeStep, fmt(v) { return v.toFixed(1); } },
    delay: { label: 'Delay', get(ins) { return (ins || inst()).delay; }, set(v) { setInst({ delay: M.clamp(v, 0, 1000) }); }, step: 1, coarse: 10, fmt(v) { return (v < 10 ? '0' : '') + v.toFixed(1); } },
    reject: { label: 'Reject', get(ins) { return (ins || inst()).reject; }, set(v) { setInst({ reject: M.clamp(Math.round(v), 0, 80) }); }, step: 1, coarse: 10, fmt(v) { return v + '%'; } },
    velocity: { label: 'Velocity', get(ins) { const c = (ins || inst()).cal; return (c && c.vel !== null && c.vel !== undefined) ? c.vel : derived().vel; }, set(v) { setInst({ cal: Object.assign({}, inst().cal, { vel: M.clamp(v, 1, 10) }) }); }, step: 0.01, coarse: 0.1, fmt(v) { return Math.round(v * 1000) + 'm/s'; } },
    zero: { label: 'Zero', get(ins) { const c = (ins || inst()).cal; return (c && c.zero) || 0; }, set(v) { setInst({ cal: Object.assign({}, inst().cal, { zero: M.clamp(v, -50, 50) }) }); }, step: 0.01, coarse: 0.1, fmt(v) { return v.toFixed(2) + 'us'; } },
    trigAngle: { label: 'Angle', get(ins) { return (ins || inst()).trig.angle; }, set(v) { setInst({ trig: Object.assign({}, inst().trig, { angle: M.clamp(v, 0, 89) }) }); UT.setIn('display', { autoTrig: false }); }, step: 0.1, coarse: 1, fmt(v) { return v.toFixed(1) + '°'; } },
    trigThick: { label: 'Thick', get(ins) { return (ins || inst()).trig.thick; }, set(v) { setInst({ trig: Object.assign({}, inst().trig, { thick: M.clamp(v, 1, 1000) }) }); UT.setIn('display', { autoTrig: false }); }, step: 0.1, coarse: 1, fmt(v) { return v.toFixed(1); } },
    // v2: AUTO XX % target (2ND F + GATES)
    autoPct: { label: 'AUTO %', get(ins) { const v = (ins || inst()).autoPct; return Number.isFinite(v) ? v : 80; }, set(v) { setInst({ autoPct: M.clamp(Math.round(v), 10, 100) }); }, step: 1, coarse: 10, fmt(v) { return Math.round(v) + '%'; } },
  };
  [0, 1].forEach(function (gi) {
    const n = gi + 1;
    PARAMS['g' + n + 'start'] = { label: 'G' + n + 'Start', gate: gi, get(ins) { return gateOf(gi, ins).start; }, set(v) { patchGate(gi, { start: M.clamp(v, 0, 1000), on: true }); }, step: 1, coarse: 10, fmt(v) { return M.fmt2(v); } };
    PARAMS['g' + n + 'width'] = { label: 'G' + n + 'Width', gate: gi, get(ins) { return gateOf(gi, ins).width; }, set(v) { patchGate(gi, { width: M.clamp(v, 1, 1000), on: true }); }, step: 1, coarse: 10, fmt(v) { return M.fmt2(v); } };
    PARAMS['g' + n + 'level'] = { label: 'G' + n + 'Level', gate: gi, get(ins) { return gateOf(gi, ins).level; }, set(v) { patchGate(gi, { level: M.clamp(Math.round(v), 1, 100), on: true }); }, step: 1, coarse: 10, fmt(v) { return Math.round(v) + '%'; } };
  });

  /** Select a parameter for ▲▼ / wheel adjustment. */
  function selectParam(name) {
    if (!PARAMS[name]) return;
    const p = PARAMS[name];
    const patch = { selectedParam: name };
    if (p.gate !== undefined && inst().activeGate !== p.gate) patch.activeGate = p.gate;
    setInst(patch);
    if (p.gate !== undefined && !gateOf(p.gate).on) patchGate(p.gate, { on: true });
  }
  /** Step the selected (or given) parameter: dir ±1, coarse = big step. */
  function adjust(name, dir, coarse) {
    const p = PARAMS[name || inst().selectedParam];
    if (!p) return false;
    const cur = p.get();
    if ((name || inst().selectedParam) === 'gain') {
      const step = (coarse || mem.secondF) ? 6 : 0.5;
      if (mem.secondF) setSecondF(false);
      p.set(cur + dir * step);
      return true;
    }
    p.set(cur + dir * (p.stepOf ? p.stepOf(cur, dir, coarse) : (coarse ? p.coarse : p.step)));
    return true;
  }
  /**
   * Rotary-knob clicks on the selected parameter (SPEC-v2 §3.7 / §11.4): n > 0 up, n < 0 down. One click is the fine
   * step of the parameter except gain (1 dB per click); `coarse` multiplies gain clicks by 6 and uses the coarse
   * step otherwise. Emits ONE 'ui' {kind:'wheel', id: selectedParam} event. Returns the parameter's new value.
   * @param {number} n  clicks (sign = direction)
   * @param {{coarse?: boolean}} [o]
   */
  function wheel(n, o) {
    const name = inst().selectedParam;
    const p = PARAMS[name] || PARAMS.gain;
    const clicks = Math.round(Number(n) || 0);
    const dir = clicks < 0 ? -1 : 1;
    const coarse = !!(o && o.coarse);
    if (name === 'gain' || !PARAMS[name]) {
      const step = coarse ? 6 : 1;
      if (clicks !== 0) PARAMS.gain.set(PARAMS.gain.get() + clicks * step);
      if (mem.secondF) setSecondF(false);
    } else {
      for (let i = 0; i < Math.abs(clicks); i++) adjust(name, dir, coarse);
    }
    emitUi('wheel', PARAMS[name] ? name : 'gain');
    return p.get();
  }
  /** Range step (§15.7: 1 %, coarse 10 %) taken additively so ▲ then ▼ returns to the start: the step is
   *  1 % / 10 % of the value rounded to 0.1 mm (min 0.1); a downward step uses the step size of the value it
   *  lands on (fixed point of s = stepAt(cur − s)), which keeps the pair symmetric across step-size boundaries. */
  function rangeStep(cur, dir, coarse) {
    const pct = coarse ? 0.1 : 0.01;
    const stepAt = function (v) { return Math.max(0.1, Math.round(v * pct * 10) / 10); };
    let s = stepAt(cur);
    if (dir < 0) for (let i = 0; i < 8; i++) { const s2 = stepAt(cur - s); if (s2 === s) break; s = s2; }
    return s;
  }
  function setSecondF(on) { mem.secondF = !!on; if (mem.refs.secondF) mem.refs.secondF.classList.toggle('lit', mem.secondF); }

  // ------------------------------------------------------------------ hard-key actions (shared by skins)
  const keys = {
    dB() {
      if (mem.secondF) {
        // 2ND F + dB: store / lock the reference gain (v1 toggle kept: pressed again while locked at the same gain → release)
        setSecondF(false);
        if (mem.refLock && inst().refGain === inst().gain) {
          mem.refLock = false;
          setInst({ refGain: inst().gain, selectedParam: 'gain' });
          UT.status({ right: t('Reference gain lock off') });
        } else storeRef();
      } else selectParam('gain');
      revealParam('gain');
    },
    range() { setInst({ range: nextRange(inst().range, mem.secondF), selectedParam: 'range' }); setSecondF(false); revealParam('range'); },
    gates() {
      if (mem.secondF) { setSecondF(false); auto(); return; }   // 2ND F + GATES = AUTO XX % (§3.7)
      const g = (inst().activeGate + 1) % 2;
      mem.subPage = 'Gate' + (g + 1);
      setInst({ activeGate: g, selectedParam: 'g' + (g + 1) + 'start', page: 2 });
      if (!gateOf(g).on) patchGate(g, { on: true });
      setSecondF(false); rebuildSoftkeys();
    },
    peakMem() { setInst({ peakMem: !inst().peakMem }); setSecondF(false); },
    freeze() {
      if (mem.secondF) { setSecondF(false); compare(); return; }   // 2ND F + ❄ = compare snapshot (§3.7)
      setInst({ freeze: !inst().freeze }); setSecondF(false);
    },
    save() { setSecondF(false); save(); },
    tcg() { setInst({ tcg: Object.assign({}, inst().tcg || {}, { on: !(inst().tcg && inst().tcg.on) }) }); },
    energy() { setInst({ pulser: Object.assign(pulserOf(), { energy: nextIn(listOf('ENERGIES', ENERGIES), energyV()) }) }); },
    /** Pulsar page Damping softkey: cycle 50→100→150→200→400 Ω; `damping` boolean follows (Ω === 50). */
    dampCycle() {
      const ohm = nextIn(listOf('DAMPING_OHMS', DAMPING_OHMS), dampingOhms());
      setInst({ damping: ohm === 50, pulser: Object.assign(pulserOf(), { damping: ohm }) });
    },
    /** Set an explicit damping Ω (EPOCH 4 screen cell). */
    dampSet(ohm) { const o = nearestIn(listOf('DAMPING_OHMS', DAMPING_OHMS), +ohm); setInst({ damping: o === 50, pulser: Object.assign(pulserOf(), { damping: o }) }); },
    filter() { setInst({ receiver: Object.assign({}, inst().receiver || {}, { filter: nextIn(listOf('FILTERS', FILTERS), filterOf()) }) }); },
    prf() { setInst({ pulser: Object.assign(pulserOf(), { prf: nextIn(listOf('PRF_LIST', PRF_LIST), nearestIn(listOf('PRF_LIST', PRF_LIST), prfOf())) }) }); },
    compare() { setSecondF(false); compare(); },
    secondF() { setSecondF(!mem.secondF); },
    escape() { if (mem.secondF) { setSecondF(false); return; } if (mem.subPage) { mem.subPage = null; rebuildSoftkeys(); return; } if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.cancel) UT.modes.autoCal.cancel(); },
    enter() { if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.step && UT.modes.autoCal.state && UT.modes.autoCal.state()) UT.modes.autoCal.step(); setSecondF(false); },
    up() { adjust(null, +1, false); },
    down() { adjust(null, -1, false); },
    left() { adjust(null, -1, true); },
    right() { adjust(null, +1, true); },
    nextGroup() { mem.subPage = null; setInst({ page: (inst().page % 5) + 1 }); },
    autoCal() { if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.start) UT.modes.autoCal.start(); else UT.status({ right: 'Auto Cal is not available' }); },
    record() { if (UT.modes && UT.modes.dac && UT.modes.dac.record) UT.modes.dac.record(); else UT.status({ right: 'DAC record is not available' }); },
    erase() { if (UT.modes && UT.modes.dac && UT.modes.dac.erase) UT.modes.dac.erase(); else setInst({ dac: { points: [], on: false, refDb: null, curves: inst().dac.curves } }); },
    curve() { setInst({ dac: Object.assign({}, inst().dac, { on: !inst().dac.on }) }); },
    draw() { if (UT.modes && UT.modes.dac && UT.modes.dac.curves) UT.modes.dac.curves(); else setInst({ dac: Object.assign({}, inst().dac, { curves: !inst().dac.curves }) }); },
    rectify() { const order = ['full', 'half+', 'half-', 'rf']; const i = order.indexOf(inst().rectify); setInst({ rectify: order[(i + 1) % order.length] }); },
    grid() { UT.setIn('display', { grid: !st().display.grid }); },
    units() { UT.setIn('display', { units: isInch() ? 'mm' : 'inch' }); },
    /** DAMP toggle (tb-damp semantics, EPOCH 4 PULSER): boolean + derived Ω in one setIn (§3.7). */
    damping() { const d = !inst().damping; setInst({ damping: d, pulser: Object.assign(pulserOf(), { damping: d ? 50 : 150 }) }); },
    alarm(gi) { patchGate(gi, { alarm: !gateOf(gi).alarm }); },
    gateMode() { mem.gateMode = mem.gateMode === 'Peak' ? 'Edge' : 'Peak'; rebuildSoftkeys(); },
    measure() { setInst({ readout: inst().readout === 'dp' ? 'sp' : 'dp' }); },
    reset() {
      const d = UT.defaultState().instrument;
      mem.refLock = false;
      setInst({ gain: d.gain, refGain: d.refGain, range: d.range, delay: d.delay, reject: d.reject, gates: d.gates, cal: d.cal, selectedParam: 'gain', activeGate: 0 });
    },
    auto80() { auto(80); },
    setGain(g) { setInst({ gain: M.clamp(g, 0, 110), selectedParam: 'gain' }); },
    readout(name) { setInst({ readout: name }); },
  };

  // ------------------------------------------------------------------ v2 public actions (F2: AUTO %, ref gain, compare, datalog)
  /**
   * AUTO XX %: set the gain so the gated peak reads `pct` % FSH (default `instrument.autoPct`). Uses
   * UT.ascan.autoGain when present; the result is rounded to 0.1 dB and clamped 0…110.
   * @param {number} [pct]
   * @returns {number|null} the new gain, or null when no echo is in the active gate
   */
  function auto(pct) {
    const target = Number.isFinite(+pct) && +pct > 0 ? +pct : PARAMS.autoPct.get();
    const r = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    let g = null;
    if (hasAscan('autoGain')) g = UT.ascan.autoGain(target);
    else if (r && r.peakPct > 0) g = M.clamp(inst().gain + 20 * Math.log10(target / r.peakPct), 0, 110);
    emitUi('softkey', 'auto');
    if (g === null || !Number.isFinite(g)) { UT.status({ right: t('AUTO {pct} %: no echo in the gate', { pct: Math.round(target) }) }); return null; }
    g = M.clamp(Math.round(g * 10) / 10, 0, 110);
    setInst({ gain: g, selectedParam: 'gain' });
    UT.status({ right: t('AUTO {pct} %: gain set to {g} dB', { pct: Math.round(target), g: g.toFixed(1) }) });
    return g;
  }
  /**
   * 2ND F + dB: store the current gain as the reference gain (`instrument.refGain = gain`) and raise the ref lock.
   * @returns {number} the stored reference gain
   */
  function storeRef() {
    mem.refLock = true;
    setInst({ refGain: inst().gain, selectedParam: 'gain' });
    emitUi('softkey', 'storeRef');
    UT.status({ right: t('Reference gain stored: {g} — ▲▼ add scanning dB', { g: fmtGain(inst().gain) }) });
    return inst().refGain;
  }
  /** Float32Array copy of the current A-scan samples (UT.ascan.snapshot when present). */
  function snapshotSamples() {
    if (hasAscan('snapshot')) return UT.ascan.snapshot();
    const a = UT.frame && UT.frame.ascan;
    return a && a.samples ? new Float32Array(a.samples) : null;
  }
  /**
   * 2ND F + ❄: store the live trace as the grey compare overlay (`instrument.compare`); called again it clears.
   * @param {boolean} [on]  force on/off (omit to toggle)
   * @returns {boolean} whether a snapshot is now stored
   */
  function compare(on) {
    const want = on === undefined ? !inst().compare : !!on;
    const snap = want ? snapshotSamples() : null;
    mem.compare = snap;
    setInst({ compare: snap });
    emitUi('softkey', 'compare');
    UT.status({ right: snap ? t('Compare: trace frozen in grey behind the live A-scan (2ND F + ❄ clears)') : t('Compare cleared') });
    return !!snap;
  }
  /**
   * SAVE: append a datalogger entry {id, t, readouts:{sp, sd, dp, amp}, gain, range, note, utSet, mode, probe} to
   * `instrument.datalog` (capped at 100, oldest dropped).
   * @param {string} [note]
   * @returns {object} the entry
   */
  function save(note) {
    const I = inst(); const S = st();
    const p = UT.frame && UT.frame.readouts && UT.frame.readouts.primary;
    const num = function (v, dp) { return Number.isFinite(v) ? Math.round(v * Math.pow(10, dp)) / Math.pow(10, dp) : null; };
    const entry = {
      id: UT.uid(), t: Date.now(),
      readouts: p ? { sp: num(Number.isFinite(p.pathDisp) ? p.pathDisp : p.path, 2), sd: num(p.sd, 2), dp: num(p.dp, 2), amp: num(p.peakPct, 0), leg: p.leg || 1, kind: p.echoKind || null } : { sp: null, sd: null, dp: null, amp: null, leg: null, kind: null },
      gain: I.gain, range: I.range, note: note === undefined || note === null ? '' : String(note),
      utSet: S.utSet, mode: S.mode, probe: { angle: S.probe.angle, x: num(S.probe.x, 1), z: num(S.probe.z, 1) },
    };
    const list = (Array.isArray(I.datalog) ? I.datalog : []).slice();
    list.push(entry);
    while (list.length > DATALOG_CAP) list.shift();
    setInst({ datalog: list });
    emitUi('softkey', 'SAVE');
    UT.status({ right: t('Saved to the datalogger ({n} entries) — Tools ▸ Datalogger…', { n: list.length }) });
    return entry;
  }

  // ------------------------------------------------------------------ EPOCH 600 softkey pages (§14.4)
  /** Formatted value of a parameter; `ins` (default `state.instrument`) lets tests evaluate a local copy. */
  /** `instrument.refGain` is always numeric (default = gain, the DAC reference), so the on-screen lock is a skin flag
   *  (`mem.refLock`) raised by 2ND F + dB and dropped by a second 2ND F + dB or page 5 Reset. */
  function refLocked(ins) { const r = (ins || inst()).refGain; return !!mem.refLock && r !== null && r !== undefined && Number.isFinite(r); }
  /** Gain cell text while a reference gain is locked (2ND F + dB): `Ref 30.2 + 2.0 dB` (§7.1 / §1.1 #22). */
  function fmtRefGain(ins) { const I = ins || inst(); const d = I.gain - I.refGain; return 'Ref ' + I.refGain.toFixed(1) + ' ' + (d < 0 ? '−' : '+') + ' ' + Math.abs(d).toFixed(1) + ' dB'; }
  function valueOf(name, ins) { const p = PARAMS[name]; if (!p) return ''; if (name === 'gain' && refLocked(ins)) return fmtRefGain(ins); return p.fmt(p.get(ins)); }
  function calVel() { return PARAMS.velocity.get(); }
  const PAGES = {
    1: function () { return [pk('Gain', 'gain'), pk('Range', 'range'), pk('Delay', 'delay'), sub('Basic'), sub('Pulsar'), sub('Rcvr'), sub('Trig'), act('Auto Cal', keys.autoCal)]; },
    2: function () { return [pk('Gain', 'gain'), pk('Range', 'range'), pk('G1Level', 'g1level'), sub('Gate1'), sub('Gate2'), sub('Gate Setup')]; },
    3: function (ins) { return [pk('Gain', 'gain'), sub('DAC Setup'), act('Record', keys.record), act('Erase', keys.erase), act('Curve', keys.curve, ins.dac.on ? 'On' : 'Off'), act('Draw', keys.draw, ins.dac.curves ? '-6/-14' : 'Off'), act('TCG', keys.tcg, tcgLabel(ins))]; },
    4: function (ins) { return [hdr('Display'), act('Rectify', keys.rectify, rectLabel(ins)), act('Grid', keys.grid, st().display.grid ? 'On' : 'Off'), act('Peak Mem', keys.peakMem, ins.peakMem ? 'On' : 'Off'), act('Freeze', keys.freeze, ins.freeze ? 'On' : 'Off')]; },
    5: function (ins) { return [act('Units', keys.units, isInch() ? 'inch' : 'mm'), hdr('Trig'), pk('Angle', 'trigAngle'), pk('Thick', 'trigThick'), act('X Value', null, ins.trig.xValue.toFixed(1)), act('Reset', keys.reset)]; },
  };
  const SUBPAGES = {
    'Basic': function () { return [pk('Range', 'range'), pk('Velocity', 'velocity'), pk('Zero', 'zero'), pk('Delay', 'delay')]; },
    // v2 §3.7: functional Pulsar / Rcvr pages (option lists of the EPOCH 600)
    'Pulsar': function (ins) { return [act('Freq', null, (st().probe.freq || 5).toFixed(1) + 'MHz'), act('Energy', keys.energy, energyV(ins) + 'V'), act('Damping', keys.dampCycle, dampingOhms(ins) + 'Ω'), act('PRF', keys.prf, prfOf(ins) + 'Hz')]; },
    'Rcvr': function (ins) { return [act('Filter', keys.filter, filterLabel(filterOf(ins))), act('Rectify', keys.rectify, rectLabel(ins)), pk('Reject', 'reject')]; },
    'Trig': function (ins) { return [pk('Angle', 'trigAngle'), pk('Thick', 'trigThick'), act('X Value', null, ins.trig.xValue.toFixed(1)), act('CSC', null, 'Off')]; },
    'Gate1': function (ins) { return gatePage(0, ins); },
    'Gate2': function (ins) { return gatePage(1, ins); },
    'Gate Setup': function (ins) { return [act('Mode', keys.gateMode, mem.gateMode), act('Measure', keys.measure, ins.readout === 'sp' ? 'SP' : 'Depth'), pk('AUTO %', 'autoPct')]; },
    'DAC Setup': function (ins) { return [act('DAC', keys.curve, ins.dac.on ? 'On' : 'Off'), act('Ref dB', null, ins.dac.refDb === null || ins.dac.refDb === undefined ? '--' : fmtGain(ins.dac.refDb)), act('Points', null, String(ins.dac.points.length)), act('Curves', keys.draw, ins.dac.curves ? 'On' : 'Off'), act('TCG', keys.tcg, tcgLabel(ins))]; },
  };
  function gatePage(gi, ins) { const n = gi + 1; return [act('Zoom', null, 'Off'), pk('Start', 'g' + n + 'start'), pk('Width', 'g' + n + 'width'), pk('Level', 'g' + n + 'level'), act('Alarm', function () { keys.alarm(gi); }, gateOf(gi, ins).alarm ? 'On' : 'Off')]; }
  function rectLabel(ins) { const r = (ins || inst()).rectify; return r === 'rf' ? 'RF' : r === 'half+' ? 'Half+' : r === 'half-' ? 'Half−' : 'Full'; }
  /** TCG softkey value: Off | On (active) | On* (on but fewer than 2 DAC points → no effect). */
  function tcgLabel(ins) { const I = ins || inst(); if (!(I.tcg && I.tcg.on)) return 'Off'; return tcgActive(I) ? 'On' : 'On*'; }
  function pk(label, param) { return { kind: 'param', label, param }; }
  function sub(label) { return { kind: 'sub', label }; }
  function act(label, fn, value) { return { kind: 'act', label, fn, value }; }
  function hdr(label) { return { kind: 'hdr', label }; }
  /**
   * Softkey items for a page / sub-page (exported for tests).  Pure: reads `ins` (default `state.instrument`)
   * and `subPage` (default the live `mem.subPage`; pass `null` for the top level) without touching state.
   */
  function softkeyItems(ins, subPage) {
    ins = ins || inst();
    const sp = subPage === undefined ? mem.subPage : subPage;
    if (sp && SUBPAGES[sp]) return [{ kind: 'back', label: sp }].concat(SUBPAGES[sp](ins));
    const page = M.clamp(Math.round(ins.page) || 1, 1, 5);
    return PAGES[page](ins);
  }
  /**
   * After a hard key selected `param`, make sure its softkey cell is on screen: leave a sub-page that does not
   * show it and, if the page still hides it, return to page 1 (Gain / Range / Delay).
   */
  function revealParam(param) {
    const shown = function () { return softkeyItems().some(function (it) { return it.kind === 'param' && it.param === param; }); };
    if (!shown() && mem.subPage) mem.subPage = null;
    if (!shown() && PAGES[1]().some(function (it) { return it.kind === 'param' && it.param === param; })) setInst({ page: 1 });
    rebuildSoftkeys();
  }

  // ------------------------------------------------------------------ DOM builders
  /** Hard key button: product legend (no i18n), takes the instrument focus, emits 'ui' softkey {id: uiId || label}. */
  function key(label, onClick, cls, attrs, uiId) {
    return h('button', Object.assign({ class: 'ik no-i18n ' + (cls || ''), type: 'button', onclick: function (e) { e.preventDefault(); mem.focused = true; emitUi('softkey', uiId || label); onClick && onClick(e); } }, attrs || {}), label);
  }
  function arrowPad(cls) {
    return h('div', { class: 'ik-pad ' + (cls || '') }, [
      h('span'), key('▲', keys.up, 'ik-arrow', null, 'up'), h('span'),
      key('◀', keys.left, 'ik-arrow', null, 'left'), key('✓', keys.enter, 'ik-ok', null, 'enter'), key('▶', keys.right, 'ik-arrow', null, 'right'),
      key('❄', keys.freeze, 'ik-small ik-frz', null, 'freeze'), key('▼', keys.down, 'ik-arrow', null, 'down'), key('↶', keys.escape, 'ik-small ik-esc', null, 'escape'),
    ]);
  }
  function miniIcon() {
    const cv = h('canvas', { class: 'mini-ascan', width: 22, height: 26 });
    mem.iconCanvas = cv;
    return cv;
  }
  function drawMiniIcon(frame) {
    const cv = mem.iconCanvas; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const w = cv.width, hh = cv.height;
    ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, hh);
    ctx.strokeStyle = '#4c4'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, hh - 1);
    const s = frame && frame.ascan && frame.ascan.samples;
    ctx.beginPath(); ctx.strokeStyle = '#3f3';
    if (s && s.length) { const n = s.length; for (let x = 1; x < w - 1; x++) { const i = Math.floor((x - 1) / (w - 2) * (n - 1)); const y = hh - 2 - (M.clamp(s[i], 0, 100) / 100) * (hh - 4); if (x === 1) ctx.moveTo(x, y); else ctx.lineTo(x, y); } }
    else { ctx.moveTo(1, hh - 2); ctx.lineTo(w - 1, hh - 2); }
    ctx.stroke();
    const g = gateOf(inst().activeGate);
    if (g.on) { const r = inst().range || 100, d = inst().delay || 0; const x0 = 1 + M.clamp((g.start - d) / r, 0, 1) * (w - 2), x1 = 1 + M.clamp((g.start + g.width - d) / r, 0, 1) * (w - 2); const y = hh - 2 - (g.level / 100) * (hh - 4); ctx.strokeStyle = '#f33'; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.restore();
  }

  // ---- EPOCH 600 ----------------------------------------------------------
  function buildEpoch600(container) {
    const R = mem.refs = {};
    mem.canvas = h('canvas', { id: 'cv-ascan', class: 'e6-ascan' });
    R.secondF = key('2ND F', keys.secondF, 'ik-flat ik-2f');
    R.refCap = h('span', { class: 'ik-cap ik-refcap no-i18n' }, 'REF dB');
    R.autoCap = h('span', { class: 'ik-cap ik-autocap no-i18n' }, 'AUTO ' + PARAMS.autoPct.get() + '%');
    const leftPad = h('div', { class: 'e6-keys no-i18n' }, [
      h('div', { class: 'e6-keyrow' }, [h('div', { class: 'e6-keycol' }, [R.refCap, key('dB', keys.dB, 'ik-round ik-db')]), h('div', { class: 'e6-keycol' }, [h('span', { class: 'ik-cap' }, ' '), key('SAVE', keys.save, 'ik-flat ik-save')])]),
      arrowPad('e6-pad'),
      h('div', { class: 'e6-keyrow' }, [h('div', { class: 'e6-keycol' }, [R.autoCap, key('GATES', keys.gates, 'ik-flat')]), h('div', { class: 'e6-keycol' }, [h('span', { class: 'ik-cap' }, 'DELAY'), key('RANGE', keys.range, 'ik-flat')])]),
      h('div', { class: 'e6-keyrow' }, [h('div', { class: 'e6-keycol' }, [h('span', { class: 'ik-cap' }, ' '), R.secondF]), h('div', { class: 'e6-keycol' }, [h('span', { class: 'ik-cap' }, 'PEAK HOLD'), key('PEAK MEM', keys.peakMem, 'ik-flat ik-pm')])]),
      h('div', { class: 'e6-brand' }, 'EPOCH 600'),
    ]);
    // screen
    R.leds = [1, 2, 3].map(function (n) { return h('span', { class: 'e6-led' + (n === 1 ? ' on' : ''), title: 'LED ' + n }, String(n)); });
    R.readSP = h('span', { class: 'e6-rv' }, '--.--'); R.readSD = h('span', { class: 'e6-rv' }, '--.--'); R.readDP = h('span', { class: 'e6-rv' }, '--.--');
    R.readAmp = h('span', { class: 'e6-rv' }, '0%');
    R.big = h('span', { class: 'e6-big' }, '--.--'); R.bigUnit = h('span', { class: 'e6-unit' }, 'mm'); R.bigIcon = h('span', { class: 'e6-bigicon' }, '1↓');
    R.boxSP = h('div', { class: 'e6-rbox', dataset: { ro: 'sp' }, onclick: function () { keys.readout('sp'); } }, [h('span', { class: 'e6-ri' }, '1▶'), R.readSP]);
    R.boxSD = h('div', { class: 'e6-rbox', dataset: { ro: 'sd' }, onclick: function () { keys.readout('sd'); } }, [h('span', { class: 'e6-ri' }, '1⇒'), R.readSD]);
    R.boxDP = h('div', { class: 'e6-rbox', dataset: { ro: 'dp' }, onclick: function () { keys.readout('dp'); } }, [h('span', { class: 'e6-ri' }, '1↓'), R.readDP]);
    R.boxAmp = h('div', { class: 'e6-rbox e6-amp', dataset: { ro: 'amp' }, onclick: function () { keys.readout('amp'); } }, [h('span', { class: 'e6-ri' }, '1%'), R.readAmp]);
    R.softCol = h('div', { class: 'e6-soft' });
    R.legs = [1, 2, 3].map(function (n) { return h('span', { class: 'e6-leg' }, 'L' + n); });
    R.pageInd = h('span', { class: 'e6-page' }, '1/5');
    R.bottom = h('div', { class: 'e6-bottom no-i18n' }, [10, 20, 30, 40, 60, null, null].map(function (g) {
      return g === null ? h('span', { class: 'e6-bcell' }) : h('button', { class: 'e6-bcell', type: 'button', onclick: function () { mem.focused = true; emitUi('softkey', 'db-' + g); keys.setGain(g); } }, g.toFixed(1) + 'dB');
    }));
    const screen = h('div', { class: 'e6-screen' }, [
      h('div', { class: 'e6-hdr no-i18n' }, [h('span', { class: 'e6-hbox' }, 'NONAME00'), h('span', { class: 'e6-hlab' }, 'ID'), h('span', { class: 'e6-hbox e6-hid' }, '1')]),
      h('div', { class: 'e6-main' }, [
        h('div', { class: 'e6-left' }, [
          h('div', { class: 'e6-readrow' }, [h('div', { class: 'e6-rcol' }, [R.boxSP, R.boxAmp]), h('div', { class: 'e6-rcol' }, [R.boxSD, R.boxDP]), h('div', { class: 'e6-bigbox' }, [R.bigIcon, R.big, R.bigUnit])]),
          h('div', { class: 'e6-plot' }, [mem.canvas, R.pageInd]),
        ]),
        R.softCol,
      ]),
      R.bottom,
    ]);
    const centre = h('div', { class: 'e6-centre' }, [
      h('div', { class: 'e6-top no-i18n' }, [h('span', { class: 'e6-leds' }, R.leds), h('span', { class: 'e6-olympus' }, 'OLYMPUS'), key('⏻', function () { mem.ledOn = !mem.ledOn; R.leds[0].classList.toggle('on', mem.ledOn); }, 'ik-power', null, 'power')]),
      screen,
      h('div', { class: 'e6-prow no-i18n' }, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map(function (p) { return key(p, function () { const n = parseInt(p.slice(1), 10); mem.subPage = null; if (n <= 5) setInst({ page: n }); rebuildSoftkeys(); }, 'ik-p'); })),
    ]);
    const right = h('div', { class: 'e6-right no-i18n' }, [key('NEXT GROUP', keys.nextGroup, 'ik-next'), h('div', { class: 'e6-fkeys' }, ['F1', 'F2', 'F3', 'F4', 'F5'].map(function (f, i) { return key(f, function () { softkeyPress(i + (mem.subPage ? 1 : 0)); }, 'ik-f'); }))]);
    const body = h('div', { class: 'skin skin-epoch600' + (mem.touch ? ' touch' : '') }, [leftPad, centre, right]);
    container.appendChild(body);
    rebuildSoftkeys();
  }
  /** Press the i-th softkey of the current column (F1–F5 map to the value keys). */
  function softkeyPress(i) {
    const items = softkeyItems().filter(function (it) { return it.kind !== 'hdr'; });
    const it = items[i]; if (it) softkeyAction(it);
  }
  /** 'ui' id of a softkey item: the parameter name for value cells, else the (English) label. */
  function softkeyId(it) { return it.kind === 'param' ? it.param : it.label; }
  function softkeyAction(it) {
    mem.focused = true;
    emitUi('softkey', softkeyId(it));
    if (it.kind === 'param') selectParam(it.param);
    else if (it.kind === 'sub') { mem.subPage = it.label; if (it.label === 'Gate2' && inst().activeGate !== 1) setInst({ activeGate: 1 }); if (it.label === 'Gate1' && inst().activeGate !== 0) setInst({ activeGate: 0 }); rebuildSoftkeys(); }
    else if (it.kind === 'back') { mem.subPage = null; rebuildSoftkeys(); }
    else if (it.kind === 'act' && it.fn) { it.fn(); rebuildSoftkeys(); }
  }
  function rebuildSoftkeys() {
    const col = mem.refs.softCol; if (!col) return;
    col.dataset.page = inst().page + '|' + (mem.subPage || '');
    col.textContent = '';
    const items = softkeyItems();
    const sel = inst().selectedParam;
    items.forEach(function (it, idx) {
      const cell = h('div', { class: 'e6-sk' + (it.kind === 'param' && it.param === sel ? ' sel' : '') + (it.kind === 'hdr' || it.kind === 'back' ? ' hdr' : '') + (it.kind === 'sub' ? ' sub' : ''), dataset: { sk: it.label }, role: 'button', tabindex: '0', 'aria-label': t(it.label) });
      cell.appendChild(tx('span', 'e6-skl', it.label));
      if (it.kind === 'param') cell.appendChild(h('span', { class: 'e6-skv no-i18n' + (it.param === 'gain' && refLocked() ? ' ref' : ''), dataset: { param: it.param } }, valueOf(it.param)));
      else if (it.kind === 'act' && it.value !== undefined) cell.appendChild(h('span', { class: 'e6-skv no-i18n' }, it.value));
      cell.addEventListener('click', function () { softkeyAction(it); });
      cell.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); softkeyAction(it); } });
      if (it.kind === 'param') attachValueDrag(cell, it.param);
      col.appendChild(cell);
      if (idx === 2) col.appendChild(h('div', { class: 'e6-icon' }, [miniIcon(), h('span', { class: 'e6-icon1 no-i18n' }, '1'), h('div', { class: 'e6-legs no-i18n' }, mem.refs.legs)]));
    });
    if (items.length < 3) col.appendChild(h('div', { class: 'e6-icon' }, [miniIcon(), h('span', { class: 'e6-icon1 no-i18n' }, '1'), h('div', { class: 'e6-legs no-i18n' }, mem.refs.legs)]));
    if (mem.iconCanvas) drawMiniIcon(UT.frame);
  }
  /**
   * Drag vertically on a value cell to change the parameter (Pointer Events + capture, scale-aware: 4 design px per
   * fine step). A plain tap (no movement) leaves the click handler to select the parameter.
   */
  function attachValueDrag(cell, param) {
    cell.style.touchAction = 'none';
    cell.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      const k = UT.dom.scale ? (UT.dom.scale() || 1) : 1;
      mem.drag = { param, y: e.clientY / k, acc: 0, moved: false, id: e.pointerId, el: cell };
      try { cell.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      mem.focused = true;
      e.preventDefault();
    });
    cell.addEventListener('pointermove', function (e) {
      const d = mem.drag; if (!d || d.el !== cell) return;
      const k = UT.dom.scale ? (UT.dom.scale() || 1) : 1;
      const y = e.clientY / k;
      d.acc += d.y - y; d.y = y;
      if (!d.moved && Math.abs(d.acc) >= 4) { d.moved = true; if (inst().selectedParam !== d.param) selectParam(d.param); }
      while (d.acc >= 4) { adjust(d.param, +1, false); d.acc -= 4; }
      while (d.acc <= -4) { adjust(d.param, -1, false); d.acc += 4; }
    });
    const end = function (e) { const d = mem.drag; if (d && d.el === cell) { mem.drag = null; try { cell.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ } } };
    cell.addEventListener('pointerup', end);
    cell.addEventListener('pointercancel', end);
  }
  function updateEpoch600(frame) {
    const R = mem.refs; if (!R.big) return;
    const ro = frame && frame.readouts; const p = ro && ro.primary;
    const gi = inst().activeGate + 1;
    setText(R.boxSP.firstChild, gi + '▶'); setText(R.boxSD.firstChild, gi + '⇒'); setText(R.boxDP.firstChild, gi + '↓'); setText(R.boxAmp.firstChild, gi + '%');
    setText(R.readSP, p ? fmtRead(Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : '--.--'); setText(R.readSD, p ? fmtRead(p.sd) : '--.--'); setText(R.readDP, p ? fmtRead(p.dp) : '--.--');
    setText(R.readAmp, p ? Math.min(999, Math.round(p.peakPct)) + '%' : '0%');
    const which = inst().readout || 'dp';
    const icons = { sp: '▶', sd: '⇒', dp: '↓', amp: '%' };
    setText(R.bigIcon, gi + (icons[which] || '↓'));
    let big = '--.--', unit = unitLabel();
    if (p) { if (which === 'amp') { big = Math.min(999, Math.round(p.peakPct)); unit = '%'; } else big = fmtRead(which === 'sp' ? (Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : which === 'sd' ? p.sd : p.dp); }
    setText(R.big, String(big)); setText(R.bigUnit, unit);
    [R.boxSP, R.boxSD, R.boxDP, R.boxAmp].forEach(function (b) { b.classList.toggle('sel', b.dataset.ro === which); });
    const leg = p && p.leg ? p.leg : 1;
    R.legs.forEach(function (el, i) { el.classList.toggle('on', i + 1 === Math.min(3, leg)); });
    setText(R.pageInd, inst().page + '/5');
    // softkey values / selection (cheap in-place refresh; rebuild when the page changed)
    const col = R.softCol;
    if (col.dataset.page !== inst().page + '|' + (mem.subPage || '')) { col.dataset.page = inst().page + '|' + (mem.subPage || ''); rebuildSoftkeys(); }
    const sel = inst().selectedParam;
    Array.prototype.forEach.call(col.querySelectorAll('.e6-sk'), function (cell) {
      const v = cell.querySelector('.e6-skv[data-param]');
      if (v) { setText(v, valueOf(v.dataset.param)); cell.classList.toggle('sel', v.dataset.param === sel); if (v.dataset.param === 'gain') v.classList.toggle('ref', refLocked()); }
    });
    if (R.refCap) R.refCap.classList.toggle('lit', refLocked());
    if (R.autoCap) { setText(R.autoCap, 'AUTO ' + PARAMS.autoPct.get() + '%'); R.autoCap.classList.toggle('lit', mem.secondF); }
    R.leds[1].classList.toggle('on', !!inst().freeze); R.leds[2].classList.toggle('on', !!inst().peakMem);
    drawMiniIcon(frame);
  }

  // ---- EPOCH 4 ---------------------------------------------------------------
  function buildEpoch4(container) {
    const R = mem.refs = {};
    mem.canvas = h('canvas', { id: 'cv-ascan', class: 'e4-ascan' });
    R.gain = h('div', {}, 'GAIN 30dB'); R.rej = h('div', {}, 'REJ 0 %'); R.minDepth = h('div', {}, 'MIN DEPTH --.--');
    R.range = h('div', { class: 'e4-range' }, 'RANGE 100.0'); R.big = h('div', { class: 'e4-big' }, '↓--.-- mm');
    R.vel = h('span'); R.zero = h('span'); R.angle = h('span'); R.thick = h('span'); R.wave = h('span'); R.damp = h('span'); R.method = h('span'); R.freq = h('span');
    R.energy = h('span'); R.filter = h('span');
    R.gateCells = [];
    const gateRows = [0, 1].map(function (gi) {
      const cells = ['start', 'width', 'level'].map(function (f) { const c = h('td', { class: 'e4-gc', dataset: { param: 'g' + (gi + 1) + f }, onclick: function () { mem.focused = true; selectParam('g' + (gi + 1) + f); } }, '--'); R.gateCells.push(c); return c; });
      const alarm = h('td', { class: 'e4-gc', onclick: function () { mem.focused = true; keys.alarm(gi); } }, 'OFF');
      R.gateCells.push(alarm);
      return h('tr', {}, [h('td', {}, String(gi + 1))].concat(cells, [alarm]));
    });
    const screen = h('div', { class: 'e4-screen' }, [
      h('div', { class: 'e4-top' }, [
        h('div', { class: 'e4-tl' }, [R.gain, R.rej, R.minDepth]),
        h('div', { class: 'e4-tc' }, [R.range, R.big]),
        h('div', { class: 'e4-tr' }, [miniIcon()]),
      ]),
      mem.canvas,
      h('div', { class: 'e4-params no-i18n' }, [
        h('div', {}, [h('span', {}, 'VEL '), R.vel]), h('div', {}, R.wave), h('div', {}),
        h('div', {}, [h('span', {}, 'ZERO '), R.zero]), h('div', { class: 'e4-cell', title: t('Pulser energy (click to cycle)'), onclick: function () { mem.focused = true; emitUi('softkey', 'Energy'); keys.energy(); } }, [h('span', {}, 'ENERGY '), R.energy]), h('div', { class: 'e4-cell', title: t('Receiver filter (click to cycle)'), onclick: function () { mem.focused = true; emitUi('softkey', 'Filter'); keys.filter(); } }, [h('span', {}, 'FILTER '), R.filter]),
        h('div', {}, [h('span', {}, 'ANGLE '), R.angle]), h('div', { class: 'e4-cell', title: t('Damping (click to cycle)'), onclick: function () { mem.focused = true; emitUi('softkey', 'Damping'); keys.dampCycle(); } }, [h('span', {}, 'DAMPING '), R.damp]), h('div', {}, [h('span', {}, 'FREQ '), R.freq]),
        h('div', {}, [h('span', {}, 'THICK '), R.thick]), h('div', {}, R.method), h('div', {}),
      ]),
      h('table', { class: 'e4-gates' }, [h('tr', {}, ['Gate', 'Start', 'Width', 'Level', 'Alarm'].map(function (t) { return h('th', {}, t); }))].concat(gateRows)),
      h('div', { class: 'e4-soft' }, [
        h('span', { class: 'e4-sk', dataset: { sk: 'START' }, onclick: function () { mem.focused = true; selectParam('g' + (inst().activeGate + 1) + 'start'); } }, '1-START'),
        h('span', { class: 'e4-sk', dataset: { sk: 'WIDTH' }, onclick: function () { mem.focused = true; selectParam('g' + (inst().activeGate + 1) + 'width'); } }, '1-WIDTH'),
        h('span', { class: 'e4-sk', dataset: { sk: 'LEVEL' }, onclick: function () { mem.focused = true; selectParam('g' + (inst().activeGate + 1) + 'level'); } }, '1-LEVEL'),
        h('span', { class: 'e4-sk' }, ''),
        h('span', { class: 'e4-sk', dataset: { sk: 'AUTO-80' }, onclick: function () { mem.focused = true; emitUi('softkey', 'AUTO-80'); keys.auto80(); } }, 'AUTO-80'),
      ]),
    ]);
    screen.classList.add('no-i18n');
    R.softLabels = Array.prototype.slice.call(screen.querySelectorAll('.e4-sk'));
    R.secondF = key('2ND F', keys.secondF, 'e4k grey e4-2f');
    const kp = function (label, fn, cls, cap, uiId) { return h('div', { class: 'e4-kc' }, [h('span', { class: 'e4-cap' }, cap || ' '), key(label, fn, 'e4k ' + cls, null, uiId)]); };
    const keypad = h('div', { class: 'e4-keypad no-i18n' }, [
      h('div', { class: 'e4-padwrap' }, [h('span', { class: 'e4-cap' }, 'REF'), h('div', { class: 'e4-pad' }, [
        key('GAIN', keys.dB, 'e4k green', null, 'dB'), key('▲', keys.up, 'e4k green', null, 'up'), key('SAVE THICK', keys.save, 'e4k green', null, 'SAVE'),
        key('◀', keys.left, 'e4k green', null, 'left'), key('ENTER', keys.enter, 'e4k green', null, 'enter'), key('▶', keys.right, 'e4k green', null, 'right'),
        key('FREEZE', keys.freeze, 'e4k green', null, 'freeze'), key('▼', keys.down, 'e4k green', null, 'down'), key('SAVE WAVE', keys.save, 'e4k green', null, 'SAVE'),
      ])]),
      h('div', { class: 'e4-grid' }, [
        kp('GATE 1', function () { setInst({ activeGate: 0, selectedParam: 'g1start' }); }, 'red', 'ALARM 1'), kp('PULSER', function () { if (mem.secondF) { setSecondF(false); keys.filter(); } else keys.damping(); }, 'orange', 'FILTER'), kp('DISPLAY', keys.rectify, 'orange', 'PRINT'),
        kp('GATE 2', function () { setInst({ activeGate: 1, selectedParam: 'g2start' }); if (!gateOf(1).on) patchGate(1, { on: true }); }, 'red', 'ALARM 2'), kp('PEAK MEM', keys.peakMem, 'red'), kp('DEPTH %AMP', function () { setInst({ readout: inst().readout === 'amp' ? 'dp' : 'amp' }); }, 'orange', 'ECHO-ECHO'),
        kp('CAL', keys.autoCal, 'yellow', 'CONTRAST'), kp('ZERO OFFSET', function () { selectParam('zero'); }, 'yellow', '# DIV'), kp('RANGE', function () { if (mem.secondF) keys.range(); else selectParam('range'); }, 'yellow', 'ZOOM'),
        kp('VEL', function () { selectParam('velocity'); }, 'yellow', 'REJECT'), kp('ANGLE', function () { selectParam(mem.secondF ? 'trigThick' : 'trigAngle'); setSecondF(false); }, 'yellow', 'THICKNESS'), h('div', { class: 'e4-kc' }, [h('span', { class: 'e4-cap' }, ' '), R.secondF]),
        kp('OPTION', null, 'grey'), kp('ID', null, 'blue'), kp('ON/OFF', function () { mem.ledOn = !mem.ledOn; }, 'green'),
      ]),
    ]);
    const body = h('div', { class: 'skin skin-epoch4' }, [
      h('div', { class: 'e4-bezel' }, [screen]),
      h('div', { class: 'e4-fkeys' }, ['F1', 'F2', 'F3', 'F4', 'F5'].map(function (f, i) { return key(f, function () { const lbl = R.softLabels[i]; if (lbl) lbl.click(); }, 'e4-f'); })),
      keypad,
      h('div', { class: 'e4-brand' }, 'EPOCH 4'),
    ]);
    container.appendChild(body);
  }
  function updateEpoch4(frame) {
    const R = mem.refs; if (!R.gain) return;
    const I = inst(); const ro = frame && frame.readouts; const p = ro && ro.primary; const d = (frame && frame.derived) || derived();
    setText(R.gain, 'GAIN ' + fmtGain(I.gain)); setText(R.rej, 'REJ ' + I.reject + ' %');
    setText(R.minDepth, 'MIN DEPTH ' + (p ? fmtRead(p.dp) : '--.--'));
    setText(R.range, 'RANGE ' + I.range.toFixed(1));
    const which = I.readout || 'dp';
    const bigVal = !p ? '--.--' : which === 'amp' ? Math.min(999, Math.round(p.peakPct)) + ' %' : fmtRead(which === 'sp' ? (Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : which === 'sd' ? p.sd : p.dp) + ' ' + unitLabel();
    setText(R.big, (which === 'sp' ? '▶' : which === 'sd' ? '⇒' : which === 'amp' ? '%' : '↓') + bigVal);
    const cal = I.cal || {};
    const vel = (cal.vel !== null && cal.vel !== undefined) ? cal.vel : d.vel;
    setText(R.vel, (cal.vel !== null && cal.vel !== undefined) ? (vel * 1000).toFixed(3) : String(Math.round(vel * 1000)));
    setText(R.zero, M.fmt2(cal.zero || 0).slice(0, 4));
    setText(R.angle, I.trig.angle.toFixed(1)); setText(R.thick, I.trig.thick.toFixed(1));
    setText(R.wave, I.rectify === 'rf' ? 'RF' : I.rectify === 'half+' ? 'HALF+' : I.rectify === 'half-' ? 'HALF-' : 'FULLWAVE');
    setText(R.damp, String(dampingOhms(I)));
    setText(R.energy, ENERGY_E4[energyV(I)] || 'MED');
    const flt = filterOf(I); setText(R.filter, flt === 'broadband' ? 'STD' : flt);
    setText(R.method, st().probe.method === 'tt' ? 'THRU-TRANS' : st().probe.method === 'tandem' ? 'TANDEM' : 'PULSE-ECHO');
    setText(R.freq, st().probe.freq.toFixed(2) + 'MHz');
    const sel = I.selectedParam;
    [0, 1].forEach(function (gi) {
      const g = gateOf(gi); const base = gi * 4;
      setText(R.gateCells[base], M.fmt2(g.start)); setText(R.gateCells[base + 1], M.fmt2(g.width));
      setText(R.gateCells[base + 2], g.on ? Math.round(g.level) + '%' : 'OFF'); setText(R.gateCells[base + 3], g.alarm ? 'ON' : 'OFF');
      ['start', 'width', 'level'].forEach(function (f, k) { R.gateCells[base + k].classList.toggle('sel', sel === 'g' + (gi + 1) + f); });
    });
    const gn = I.activeGate + 1;
    setText(R.softLabels[0], gn + '-START'); setText(R.softLabels[1], gn + '-WIDTH'); setText(R.softLabels[2], gn + '-LEVEL');
    R.softLabels[0].classList.toggle('sel', sel === 'g' + gn + 'start'); R.softLabels[1].classList.toggle('sel', sel === 'g' + gn + 'width'); R.softLabels[2].classList.toggle('sel', sel === 'g' + gn + 'level');
    drawMiniIcon(frame);
  }

  // ---- USK7 --------------------------------------------------------------------
  function ensureUskWindow() {
    if (mem.uskWin) return mem.uskWin;
    if (typeof document === 'undefined') return null;
    UT.dom.injectCss('instruments', UT.instruments.css);
    mem.uskWin = UT.dom.win({
      name: 'usk7', title: 'USK 7', x: 460, y: 100, w: 484, class: 'win-usk7',
      onClose: function () { UT.status({ right: 'USK 7 switched off — Options ▸ UT Set or "Show USK 7" to restore' }); },
      onShow: function (api) { positionUsk(api); },
    });
    return mem.uskWin;
  }
  /**
   * Default USK7 placement (reference EGQxpCOD_xA.jpg): lower-left over the plan view, overlapping its bottom
   * and the X ruler, so the plan-view probe symbol (always ≈ 30 mm below the z-window top, i.e. in the upper
   * third of the plan) stays visible to the right of the window. Measured on the next frame because the
   * instrument column only shrinks to the USK7 launcher after the skin switch has been laid out.
   */
  function positionUsk(api) {
    if (mem.uskPositioned) return;
    mem.uskPositioned = true;
    const place = function () {
      const plan = document.getElementById('cv-plan');
      const r = plan ? plan.getBoundingClientRect() : null;
      if (!r || !(r.width > 0)) return;
      const hWin = api.el.offsetHeight || 230;
      const top = Math.max(r.top + 4, Math.round(r.bottom - Math.min(0.4 * r.height, hWin - 60)));
      api.el.style.left = Math.round(r.left + 4) + 'px'; api.el.style.top = top + 'px';
    };
    place();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { if (mem.uskWin === api && api.isOpen()) place(); });
  }
  /** USK7 rotary knob: ◀ ▶ buttons, mouse wheel and a scale-aware vertical pointer drag on the dial (6 design px per step). */
  function knob(label, opts) {
    const dial = h('div', { class: 'usk-dial', role: 'slider', 'aria-label': label, tabindex: '0' }, [h('div', { class: 'usk-ptr' })]);
    const el = h('div', { class: 'usk-knob no-i18n' }, [
      h('div', { class: 'usk-lr' }, [key('◀', function () { opts.step(-1); }, 'usk-arr', null, label + '-'), key('▶', function () { opts.step(+1); }, 'usk-arr', null, label + '+')]),
      dial, h('span', { class: 'usk-klab' }, label),
    ]);
    dial.addEventListener('wheel', function (e) { e.preventDefault(); emitUi('wheel', label); opts.step(e.deltaY < 0 ? 1 : -1); });
    let drag = null;
    dial.style.touchAction = 'none';
    dial.addEventListener('pointerdown', function (e) {
      const k = UT.dom.scale ? (UT.dom.scale() || 1) : 1;
      drag = { y: e.clientY / k, acc: 0 };
      try { dial.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      mem.focused = true; emitUi('softkey', label);
      e.preventDefault();
    });
    dial.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const k = UT.dom.scale ? (UT.dom.scale() || 1) : 1;
      const y = e.clientY / k; drag.acc += drag.y - y; drag.y = y;
      while (drag.acc >= 6) { opts.step(+1); drag.acc -= 6; }
      while (drag.acc <= -6) { opts.step(-1); drag.acc += 6; }
    });
    const end = function () { drag = null; };
    dial.addEventListener('pointerup', end); dial.addEventListener('pointercancel', end);
    dial.addEventListener('keydown', function (e) { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); opts.step(+1); } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); opts.step(-1); } });
    el.dial = dial;
    return el;
  }
  function buildUsk7(container) {
    const R = mem.refs = {};
    const win = ensureUskWindow();
    mem.canvas = h('canvas', { id: 'cv-ascan', class: 'usk-crt' });
    R.crtText = h('div', { class: 'usk-text no-i18n' }, 'AMP 30 dB  Suppr OFF  ANGLE 60°');
    R.crtPulser = h('div', { class: 'usk-pr no-i18n', title: t('Pulser energy / damping and receiver filter') }, 'P 200V 150Ω  F BB');
    R.knobRange = knob('RANGE', { step: function (d) { setInst({ range: M.clamp(inst().range * (1 + 0.02 * d), 10, 1000), selectedParam: 'range' }); } });
    R.knobShift = knob('X-SHIFT', { step: function (d) { setInst({ delay: M.clamp(inst().delay + d, 0, 1000), selectedParam: 'delay' }); } });
    R.knobSupp = knob('SUPPRESSION', { step: function (d) { setInst({ reject: M.clamp(inst().reject + 2 * d, 0, 80), selectedParam: 'reject' }); } });
    R.amp = h('input', { type: 'range', min: 0, max: 110, step: 0.5, class: 'usk-amp', title: 'AMP (dB)', orient: 'vertical' });
    R.amp.value = inst().gain;
    R.amp.addEventListener('input', function () { setInst({ gain: M.clamp(parseFloat(R.amp.value), 0, 110), selectedParam: 'gain' }); });
    R.ampLab = h('span', { class: 'usk-amplab' }, 'AMP=');
    R.erase = key('ERASE DAC', keys.erase, 'usk-erase');
    const panel = h('div', { class: 'usk-panel' }, [
      h('div', { class: 'usk-col' }, [R.knobRange, h('div', { class: 'usk-btn red', title: 'decorative' }), R.erase]),
      h('div', { class: 'usk-col usk-ampcol' }, [h('div', { class: 'usk-btn yellow' }), R.ampLab, R.amp, h('div', { class: 'usk-btn yellow' })]),
      h('div', { class: 'usk-col' }, [R.knobShift, R.knobSupp]),
      h('div', { class: 'usk-col usk-offcol' }, [key('OFF', function () { win.close(); }, 'usk-off'), h('span', { class: 'usk-brand' }, 'KRAUTKRÄMER USK 7')]),
    ]);
    const body = h('div', { class: 'skin skin-usk7' + (mem.touch ? ' touch' : '') }, [h('div', { class: 'usk-crtwrap' }, [mem.canvas, R.crtText, R.crtPulser]), panel]);
    win.setContent(body);
    win.el.addEventListener('pointerdown', function () { mem.focused = true; });
    win.el.addEventListener('wheel', function (e) { if (e.target === mem.canvas) { e.preventDefault(); wheel(e.deltaY < 0 ? 1 : -1, { coarse: e.shiftKey }); } }, { passive: false });
    win.show();
    // placeholder in the instrument column
    container.appendChild(h('div', { class: 'skin skin-uskdock' }, [
      h('div', { class: 'uskdock-title no-i18n' }, 'UT SET: KRAUTKRÄMER USK 7 (analogue)'),
      tx('div', 'uskdock-hint', 'The USK 7 floats over the plan view. Read the screen — this set has no digital readouts.'),
      UT.dom.button('Show USK 7', function () { mem.focused = true; emitUi('softkey', 'Show USK 7'); win.show(); }, { class: 'ik uskdock-btn' }),
    ]));
  }
  function updateUsk7() {
    const R = mem.refs; if (!R.crtText) return;
    const I = inst();
    setText(R.crtText, 'AMP ' + Math.round(I.gain) + ' dB  Suppr ' + (I.reject > 0 ? I.reject + '%' : 'OFF') + '  ANGLE ' + Math.round(I.trig.angle) + '°');
    const flt = filterOf(I);
    if (R.crtPulser) setText(R.crtPulser, 'P ' + energyV(I) + 'V ' + dampingOhms(I) + 'Ω  F ' + (flt === 'broadband' ? 'BB' : flt));
    if (document.activeElement !== R.amp && Math.abs(parseFloat(R.amp.value) - I.gain) > 1e-6) R.amp.value = I.gain;
    setText(R.ampLab, 'AMP=' + Math.round(I.gain));
    const rot = function (el, frac) { el.dial.firstChild.style.transform = 'rotate(' + Math.round(-135 + 270 * M.clamp(frac, 0, 1)) + 'deg)'; };
    rot(R.knobRange, Math.log10(I.range / 10) / 2); rot(R.knobShift, I.delay / 200); rot(R.knobSupp, I.reject / 80);
    const showErase = (I.dac.points && I.dac.points.length > 0) || st().mode === 'dac';
    R.erase.style.visibility = showErase ? 'visible' : 'hidden';
  }

  // ------------------------------------------------------------------ themes & A-scan renderer
  const THEMES = {
    epoch600: { bg: C.ascanBg, frame: '#1a1c1a', grid: C.ascanGrid, gridStyle: 'dots', trace: C.ascanTrace, traceFill: 'rgba(34,224,34,0.18)', peak: 'rgba(60,160,60,0.55)', gate: C.gate, gate2: '#4080ff', dac: C.dac, dacSub: '#ff9020', text: '#d0d0d0', axes: true, margin: { l: 16, r: 26, t: 4, b: 12 }, gates: true, dacPoints: true, xLabelStep: 1, lineWidth: 1 },
    epoch4: { bg: '#dfe3d5', frame: '#dfe3d5', grid: null, gridStyle: 'none', trace: '#101010', traceFill: null, peak: 'rgba(0,0,0,0.3)', gate: '#101010', gate2: '#404040', dac: '#303030', dacSub: '#606060', text: '#101010', axes: true, margin: { l: 22, r: 6, t: 3, b: 11 }, gates: true, gateWidth: 3, dacPoints: false, xLabelStep: 2, lineWidth: 1 },
    usk7: { bg: C.uskBg, frame: '#08104a', grid: C.uskGrid, gridStyle: 'lines', trace: C.uskTrace, traceFill: null, peak: 'rgba(127,247,255,0.35)', gate: '#ff60ff', gate2: '#ff60ff', dac: '#ff40ff', dacSub: '#c030c0', text: '#ffffff', axes: true, margin: { l: 4, r: 4, t: 4, b: 14 }, gates: false, dacPoints: true, dacLabel: true, xLabelStep: 2, lineWidth: 1.5 },
    aut: { bg: C.ascanBg, frame: '#000', grid: C.ascanGrid, gridStyle: 'dots', trace: C.ascanTrace, traceFill: null, peak: 'rgba(60,160,60,0.55)', gate: C.gate, gate2: '#ffe000', gate3: '#20e020', dac: C.dac, dacSub: '#ff9020', text: '#d0d0d0', axes: true, margin: { l: 16, r: 4, t: 4, b: 12 }, gates: true, dacPoints: false, xLabelStep: 1, lineWidth: 1 },
    tofd: { bg: '#0e5a4d', frame: '#0e5a4d', grid: '#0a3d34', gridStyle: 'lines', trace: '#22ff22', traceFill: null, peak: null, gate: C.gate, gate2: '#4080ff', dac: C.dac, dacSub: '#ff9020', text: '#d0ffd0', axes: true, margin: { l: 4, r: 4, t: 4, b: 12 }, gates: false, dacPoints: false, xLabelStep: 2, lineWidth: 1 },
  };
  function resolveTheme(theme) {
    if (!theme) return THEMES.epoch600;
    if (typeof theme === 'string') return THEMES[theme] || THEMES.epoch600;
    return Object.assign({}, THEMES[theme.base] || THEMES.epoch600, theme);
  }

  /**
   * Shared A-scan renderer: background, grid, peak-memory trace, trace, gate bars, DAC curves, badges, axes.
   * @param {CanvasRenderingContext2D} ctx  context scaled to CSS px (UT.dom.fitCanvas)
   * @param {object} frame  UT.frame (ascan may be null)
   * @param {object} state  UT.state
   * @param {string|object} theme  'epoch600' | 'epoch4' | 'usk7' | 'aut' | 'tofd' | override object
   */
  function drawAscan(ctx, frame, state, theme) {
    const th = resolveTheme(theme);
    const cv = ctx.canvas;
    const W = th.width || cv.clientWidth || cv.width, H = th.height || cv.clientHeight || cv.height;
    const m = th.margin; const px = m.l, py = m.t, pw = Math.max(10, W - m.l - m.r), ph = Math.max(10, H - m.t - m.b);
    const I = (state && state.instrument) || UT.defaultState().instrument;
    const asc = frame && frame.ascan;
    const range = (asc && asc.range) || I.range || 100;
    const delay = asc && asc.delay !== undefined && asc.delay !== null ? asc.delay : (I.delay || 0);
    const xOf = function (p) { return px + (p - delay) / range * pw; };
    const yOf = function (pct) { return py + ph * (1 - M.clamp(pct, 0, 100) / 100); };
    ctx.save();
    ctx.fillStyle = th.frame || th.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = th.bg; ctx.fillRect(px, py, pw, ph);
    // grid
    const showGrid = !(state && state.display && state.display.grid === false);
    if (th.grid && showGrid && th.gridStyle !== 'none') {
      ctx.strokeStyle = th.grid; ctx.lineWidth = 1;
      if (th.gridStyle === 'dots') ctx.setLineDash([1, 3]);
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const x = Math.round(px + pw * i / 10) + 0.5, y = Math.round(py + ph * i / 10) + 0.5;
        ctx.moveTo(x, py); ctx.lineTo(x, py + ph); ctx.moveTo(px, y); ctx.lineTo(px + pw, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.beginPath(); ctx.rect(px, py, pw, ph); ctx.clip();
    const rf = asc && asc.rf && (I.rectify === 'rf' || I.rectify === 'half+' || I.rectify === 'half-') ? asc.rf : null;
    const rfScale = rf ? (maxAbs(rf) <= 1.5 ? 100 : 1) : 1;
    const polyline = function (arr, transform) {
      const n = arr.length; if (!n) return;
      ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = px + pw * i / (n - 1); const y = transform(arr[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    };
    // v2 compare overlay (grey, behind everything else): instrument.compare or the module mirror when the key was lost by a clone
    const cmp = compareOf(I);
    if (cmp && cmp.length && th.compare !== false) {
      ctx.strokeStyle = th.compareColour || 'rgba(190,190,190,0.75)'; ctx.lineWidth = 1; ctx.setLineDash([]);
      polyline(cmp, yOf); ctx.stroke();
    }
    // peak memory (dim)
    if (asc && asc.peak && asc.peak.length && I.peakMem && th.peak) {
      ctx.strokeStyle = th.peak; ctx.lineWidth = 1; polyline(asc.peak, yOf); ctx.stroke();
    }
    // trace
    if (asc && asc.samples && asc.samples.length) {
      ctx.strokeStyle = th.trace; ctx.lineWidth = th.lineWidth || 1; ctx.lineJoin = 'round';
      if (rf && I.rectify === 'rf') {
        const mid = py + ph / 2;
        ctx.strokeStyle = th.grid || th.trace; ctx.beginPath(); ctx.moveTo(px, mid + 0.5); ctx.lineTo(px + pw, mid + 0.5); ctx.stroke();
        ctx.strokeStyle = th.trace;
        polyline(rf, function (v) { return mid - M.clamp(v * rfScale, -100, 100) / 100 * (ph / 2); }); ctx.stroke();
      } else if (rf) {
        const sign = I.rectify === 'half+' ? 1 : -1;
        polyline(rf, function (v) { return yOf(Math.max(0, sign * v * rfScale)); });
        if (th.traceFill) { ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.fillStyle = th.traceFill; ctx.fill(); }
        polyline(rf, function (v) { return yOf(Math.max(0, sign * v * rfScale)); }); ctx.stroke();
      } else {
        if (th.traceFill) { polyline(asc.samples, yOf); ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.fillStyle = th.traceFill; ctx.fill(); }
        polyline(asc.samples, yOf); ctx.stroke();
      }
    } else {
      ctx.strokeStyle = th.trace; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py + ph - 1); ctx.lineTo(px + pw, py + ph - 1); ctx.stroke();
    }
    // gates
    if (th.gates && I.gates) {
      I.gates.forEach(function (g, gi) {
        if (!g || !g.on) return;
        const x0 = xOf(g.start), x1 = xOf(g.start + g.width), y = Math.round(yOf(g.level)) + 0.5;
        if (x1 < px || x0 > px + pw) return;
        const active = gi === (I.activeGate || 0);
        ctx.strokeStyle = gi === 0 ? th.gate : (gi === 1 ? th.gate2 : (th.gate3 || th.gate2));
        ctx.lineWidth = th.gateWidth || (active ? 2.5 : 1.5);
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0 + 0.5, y - 4); ctx.lineTo(x0 + 0.5, y + 4); ctx.moveTo(x1 - 0.5, y - 4); ctx.lineTo(x1 - 0.5, y + 4); ctx.stroke();
      });
    }
    // DAC curves (v2: drawn FLAT at 80·10^((gain−refDb)/20) % while TCG is active — §3.7)
    const dac = I.dac;
    const tcgOn = tcgActive(I);
    if (dac && (dac.on || tcgOn) && dac.points && dac.points.length >= 2) {
      const poly = tcgOn ? tcgFlatPolyline(I) : dacPolyline(I);
      const curve = function (scale, colour, dash) {
        ctx.strokeStyle = colour; ctx.lineWidth = 1.2; ctx.setLineDash(dash || []);
        ctx.beginPath();
        const p0 = delay, p1 = delay + range; const N = 80;
        for (let i = 0; i <= N; i++) { const p = p0 + (p1 - p0) * i / N; const v = dacAt(poly, p) * scale; const x = xOf(p), y = yOf(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      curve(1, th.dac, []);
      if (dac.curves !== false) { curve(0.5, th.dacSub, [4, 3]); curve(0.2, th.dacSub, [2, 3]); }
      if (th.dacPoints && !tcgOn) {
        ctx.strokeStyle = th.dac; ctx.lineWidth = 1.2;
        poly.forEach(function (p) { const x = xOf(p.path), y = yOf(p.pct); ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke(); });
      }
      if (th.dacLabel) { ctx.fillStyle = th.dac; ctx.font = 'italic bold 15px Segoe UI, Arial, sans-serif'; const lp = poly[Math.min(1, poly.length - 1)]; ctx.fillText(tcgOn ? 'TCG' : 'DAC', M.clamp(xOf(lp.path) + 8, px + 4, px + pw - 40), M.clamp(yOf(lp.pct) + 18, py + 30, py + ph - 4)); }
    }
    // badges
    ctx.font = 'bold 11px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'top';
    if (I.freeze) { ctx.fillStyle = '#ffd21e'; ctx.fillRect(px + pw - 52, py + 3, 48, 14); ctx.fillStyle = '#000'; ctx.fillText('FREEZE', px + pw - 48, py + 4); }
    if (I.peakMem && th.gates) { ctx.fillStyle = th.text; ctx.fillText('PEAK', px + 4, py + 3); }
    if (I.rectify === 'rf' && !rf && th.gates) { ctx.fillStyle = th.text; ctx.fillText('RF', px + 4, py + 16); }
    if (th.gates) {
      let by = py + 3;
      const badge = function (text, colour) { ctx.fillStyle = colour; ctx.fillText(text, px + pw - 48, by); by += 12; };
      if (I.freeze) by += 14;
      if (tcgOn) badge('TCG', th.dac);
      if (cmp && cmp.length) badge('CMP', th.compareColour || '#bdbdbd');
      if (alarmActive(I, frame)) { ctx.fillStyle = '#ff2020'; ctx.fillRect(px + pw - 52, by - 1, 48, 13); ctx.fillStyle = '#fff'; ctx.fillText('ALARM', px + pw - 48, by); }
    }
    ctx.restore();
    // axes labels (outside the clip)
    if (th.axes) {
      ctx.save();
      ctx.fillStyle = th.text; ctx.font = '9px Segoe UI, Arial, sans-serif';
      if (m.l >= 14) { ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; for (let k = 0; k <= 5; k++) ctx.fillText(String(k * 20), px - 2, yOf(k * 20)); }
      if (m.b >= 9) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const stepK = th.xLabelStep || 1; for (let k = 0; k <= 10; k += stepK) ctx.fillText(String(k), px + pw * k / 10, py + ph + 1); }
      ctx.restore();
    }
  }
  function maxAbs(arr) { let m = 0; for (let i = 0; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > m) m = a; } return m; }

  /**
   * Phased-array sector image (colour map) drawn in place of the A-scan.
   * frame.sscan = {angles, columns: [{angle, echoes}], maxPath, T}
   */
  function drawSscan(ctx, frame, state) {
    const cv = ctx.canvas;
    const W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height;
    const S = frame && frame.sscan;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!S || !S.columns || !S.columns.length) { ctx.fillStyle = '#ccc'; ctx.font = '11px Segoe UI, Arial, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillText('S-SCAN (no data)', 4, H - 2); ctx.restore(); return; }
    const I = (state && state.instrument) || UT.defaultState().instrument;
    const K = (UT.ascan && UT.ascan.K_REF) || 1;
    const gainLin = Math.pow(10, (I.gain || 0) / 20);
    const angles = S.columns.map(function (c) { return c.angle; });
    const aMin = Math.min.apply(null, angles), aMax = Math.max.apply(null, angles);
    const maxPath = S.maxPath || (I.delay + I.range) || 100;
    const T = S.T || (state && state.specimen && state.specimen.T) || 20;
    const depthMax = Math.min(maxPath, Math.max(T * 1.05, maxPath * Math.cos(M.deg2rad(aMax)) * 1.05));
    const xMax = maxPath * Math.sin(M.deg2rad(aMax)) * 1.02;
    const side = (state && state.probe && state.probe.side) || 1;
    // USK7: the magenta CRT text line (.usk-text DOM overlay, ~canvas y 6..19) sits at the top-left, so
    // start the sector lower there; the caption goes on a second bottom row (never at the top-left).
    const mL = 18, mT = mem.skin === 'usk7' ? 26 : 18, mB = 24, mR = 6;
    const scale = Math.min((W - mL - mR) / Math.max(1, xMax), (H - mT - mB) / Math.max(1, depthMax));
    const ox = side > 0 ? W - mR : mL, oy = mT;
    const toX = function (lat) { return ox - side * lat * scale; };
    const toY = function (d) { return oy + d * scale; };
    // sector background
    ctx.fillStyle = '#101830'; ctx.beginPath(); ctx.moveTo(ox, oy);
    for (let a = aMin; a <= aMax + 1e-9; a += 1) { const r = maxPath; ctx.lineTo(toX(r * Math.sin(M.deg2rad(a))), toY(r * Math.cos(M.deg2rad(a)))); }
    ctx.closePath(); ctx.fill();
    // backwall line
    ctx.strokeStyle = '#4060a0'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(mL, toY(T) + 0.5); ctx.lineTo(W - mR, toY(T) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    // echoes as blobs along each column
    const colW = M.clamp(maxPath * scale * M.deg2rad(Math.max(0.5, (aMax - aMin) / Math.max(1, S.columns.length - 1))) * 0.35, 2, 7);
    S.columns.forEach(function (col) {
      const th = M.deg2rad(col.angle); const s = Math.sin(th), c = Math.cos(th);
      (col.echoes || []).forEach(function (e) {
        const pct = e.ampPct !== undefined ? e.ampPct : (e.amp || 0) * K * gainLin;
        if (pct < 5) return;
        const lat = e.path * s;
        const d = foldDepth(e.path * c, T);
        const len = Math.max(3, Math.min(14, 3 + pct / 10));
        ctx.strokeStyle = ampColour(pct); ctx.lineWidth = colW; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(toX(lat), toY(d) - len / 2); ctx.lineTo(toX(lat), toY(d) + len / 2); ctx.stroke();
      });
    });
    // v2: selected angle (frame.paSelected from 40/56) as a thin dashed radial line
    const selA = frame && frame.paSelected && Number.isFinite(frame.paSelected.angle) ? frame.paSelected.angle : null;
    if (selA !== null && selA >= aMin - 1e-9 && selA <= aMax + 1e-9) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(toX(maxPath * Math.sin(M.deg2rad(selA))), toY(maxPath * Math.cos(M.deg2rad(selA)))); ctx.stroke(); ctx.setLineDash([]);
    }
    // frame texts
    ctx.fillStyle = '#e0e0e0'; ctx.font = '9px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let d = 0; d <= depthMax + 1e-9; d += 10) { ctx.fillText(String(d), mL - 2, toY(d)); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('0', ox, H - mB + 1); ctx.fillText(Math.round(xMax) + ' mm', toX(xMax * 0.9), H - mB + 1);
    // caption: bottom-left, under the mm scale (the top-left is the USK7 CRT text line)
    ctx.font = 'bold 11px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('S-SCAN ' + aMin.toFixed(0) + '°–' + aMax.toFixed(0) + '°', 3, H - 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------ mount / render / skins
  /** Theme name / override for the live canvas (high-contrast: white 2 px trace, brighter grid — §5.7). */
  function liveTheme() {
    const base = mem.skin === 'epoch4' ? 'epoch4' : mem.skin === 'usk7' ? 'usk7' : 'epoch600';
    const d = st().display;
    if (!(d && d.highContrast)) return base;
    if (base === 'epoch4') return { base, lineWidth: 2, gateWidth: 4 };
    return { base, trace: '#ffffff', traceFill: null, grid: '#5a5a5a', lineWidth: 2, text: '#ffffff', compareColour: '#9a9a9a' };
  }
  function drawCanvas(frame) {
    const cv = mem.canvas; if (!cv || !cv.isConnected) return;
    const ctx = UT.dom.fitCanvas(cv);
    const s = st();
    if (frame && frame.sscan && s.probe.method === 'pa') drawSscan(ctx, frame, s);
    else drawAscan(ctx, frame, s, liveTheme());
  }
  /**
   * Gate alarm (F3, §5.2): edge-triggered beep per gate — `now = !!frame.readouts.gate[i]` for every gate with
   * `on && alarm`; a rising edge calls UT.audio.beep() (a no-op while display.sound is off). Module-level `alarmWas[]`.
   */
  function checkAlarms(frame) {
    const gates = inst().gates || [];
    const ro = frame && frame.readouts;
    let any = false;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      const armed = !!(g && g.on && g.alarm);
      const now = armed && !!(ro && ro.gate && ro.gate[i]);
      if (now) any = true;
      if (now && !mem.alarmWas[i]) { try { if (UT.audio && typeof UT.audio.beep === 'function') UT.audio.beep(); } catch (e) { /* ignore */ } }
      mem.alarmWas[i] = now;
    }
    mem.alarmNow = any;
  }
  // The alarm edge detector runs on EVERY 'render' (headless too): bus-only, no DOM, registered at load (§5.2 F3).
  UT.bus.on('render', function (frame) { try { checkAlarms(frame); } catch (e) { /* ignore */ } });
  function onRender(frame) {
    if (!mem.mounted) return;
    try {
      if (mem.skin === 'epoch600') updateEpoch600(frame);
      else if (mem.skin === 'epoch4') updateEpoch4(frame);
      else if (mem.skin === 'usk7') updateUsk7(frame);
      drawCanvas(frame);
      refreshDatalogWindow(false);
    } catch (e) { console.error('[UT.instruments]', e); }
  }
  /** True when touch-sized controls are wanted (display.touchBar 'on', or 'auto' with a coarse pointer — §5.4). */
  function wantTouch() {
    const tb = st().display && st().display.touchBar;
    if (tb === 'on') return true;
    if (tb === 'off') return false;
    try {
      if (!mem.mq && typeof matchMedia === 'function') mem.mq = matchMedia('(pointer: coarse)');
      return !!(mem.mq && mem.mq.matches);
    } catch (e) { return false; }
  }
  /** Apply / remove the `touch` class on the mounted skin root(s). */
  function applyTouch() {
    const on = wantTouch();
    mem.touch = on;
    const roots = [];
    if (mem.container) Array.prototype.push.apply(roots, mem.container.querySelectorAll('.skin'));
    if (mem.uskWin && mem.uskWin.el) Array.prototype.push.apply(roots, mem.uskWin.el.querySelectorAll('.skin'));
    roots.forEach(function (el) { el.classList.toggle('touch', on); });
  }
  function buildSkin(name) {
    const c = mem.container; if (!c) return;
    c.textContent = '';
    mem.refs = {}; mem.canvas = null; mem.iconCanvas = null; mem.subPage = null; setSecondF(false);
    mem.touch = wantTouch();
    if (mem.uskWin && name !== 'usk7') { mem.uskWin.setContent(null); mem.uskWin.hide(); mem.uskParked = null; }
    mem.skin = name;
    if (name === 'epoch4') buildEpoch4(c);
    else if (name === 'usk7') buildUsk7(c);
    else { mem.skin = 'epoch600'; buildEpoch600(c); }
    c.dataset.skin = mem.skin;
    onRender(UT.frame);
  }
  /**
   * Mount the instrument for `state.utSet` into the container (#instrument) and subscribe to 'render'.
   * @param {HTMLElement} container
   */
  function mount(container) {
    UT.dom.injectCss('instruments', UT.instruments.css);
    mem.container = container;
    if (!mem.mounted) {
      mem.mounted = true;
      UT.bus.on('render', onRender);
      container.addEventListener('pointerdown', function () { mem.focused = true; });
      container.addEventListener('mousedown', function () { mem.focused = true; });
      container.addEventListener('wheel', function (e) { e.preventDefault(); wheel(e.deltaY < 0 ? 1 : -1, { coarse: e.shiftKey }); }, { passive: false });
      const releaseFocus = function (e) {
        const inside = container.contains(e.target) || (mem.uskWin && mem.uskWin.el.contains(e.target)) || (mem.datalogWin && mem.datalogWin.el.contains(e.target));
        if (!inside) mem.focused = false;
      };
      document.addEventListener('pointerdown', releaseFocus);
      document.addEventListener('mousedown', releaseFocus);
      document.addEventListener('click', releaseFocus);   // synthetic clicks (canvas .click()) carry no pointerdown
      // v2: touch sizing follows display.touchBar (and the coarse-pointer media query in 'auto'); datalog window refresh
      UT.bus.on('state', function (ev) {
        const keys = (ev && ev.keys) || [];
        if (keys.indexOf('display') >= 0) applyTouch();
        if (keys.indexOf('instrument') >= 0) { const c = inst().compare; if (c === null || (c && typeof c.length === 'number')) mem.compare = c || null; }
      });
      try { if (!mem.mq && typeof matchMedia === 'function') mem.mq = matchMedia('(pointer: coarse)'); if (mem.mq && mem.mq.addEventListener) mem.mq.addEventListener('change', applyTouch); } catch (e) { /* ignore */ }
      UT.bus.on('lang', function () { rebuildSoftkeys(); refreshDatalogWindow(true); if (mem.skin) onRender(UT.frame); });
      UT.bus.on('mode', function (p) {
        if (mem.skin !== 'usk7' || !mem.uskWin || !p) return;
        const el = mem.uskWin.el;
        if (p.mode === 'v1' || p.mode === 'v2') {
          // §14.8: the USK7 floats bottom-right on the block screens; remember where it was so it can go back.
          if (!mem.uskParked) mem.uskParked = { left: el.style.left, top: el.style.top };
          const app = document.getElementById('app'); const r = app ? app.getBoundingClientRect() : { right: window.innerWidth, bottom: window.innerHeight };
          el.style.left = Math.max(0, r.right - 500) + 'px'; el.style.top = Math.max(0, r.bottom - 260) + 'px';
        } else if (mem.uskParked) {
          const prev = mem.uskParked; mem.uskParked = null;
          if (prev.left && prev.top) { el.style.left = prev.left; el.style.top = prev.top; }
          else { mem.uskPositioned = false; positionUsk(mem.uskWin); }   // default: lower-left of the plan view (reference EGQxpCOD_xA.jpg)
        }
      });
    }
    buildSkin(st().utSet || 'epoch600');
  }
  /**
   * Switch the skin ('epoch600' | 'epoch4' | 'usk7'); also syncs state.utSet when it differs.
   * @param {string} name
   */
  function setSkin(name) {
    const n = name === 'epoch4' || name === 'usk7' ? name : 'epoch600';
    if (st().utSet !== n) UT.set({ utSet: n }, { noRender: true });
    if (!mem.container) return;
    if (mem.skin !== n || !mem.canvas || !mem.canvas.isConnected) buildSkin(n);
    else if (n === 'usk7' && mem.uskWin) mem.uskWin.show();
  }
  /**
   * Keyboard handler for the instrument (90-app forwards key events). Returns true when consumed.
   * Arrow keys adjust the selected parameter while the instrument has focus.
   * @param {KeyboardEvent} ev
   */
  function handleKey(ev) {
    if (!mem.mounted || !mem.focused) return false;
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return false;
    switch (ev.key) {
      case 'ArrowUp': adjust(null, +1, ev.shiftKey); break;
      case 'ArrowDown': adjust(null, -1, ev.shiftKey); break;
      case 'ArrowLeft': adjust(null, -1, true); break;
      case 'ArrowRight': adjust(null, +1, true); break;
      case 'Enter': keys.enter(); break;
      default: return false;
    }
    if (ev.preventDefault) ev.preventDefault();
    return true;
  }

  // ------------------------------------------------------------------ datalogger window (F2, window 'datalog')
  function datalogEntries() { const l = inst().datalog; return Array.isArray(l) ? l : []; }
  function fmtTime(ms) {
    const d = new Date(ms);
    const p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return p2(d.getHours()) + ':' + p2(d.getMinutes()) + ':' + p2(d.getSeconds());
  }
  /** Remove one datalog entry by id. */
  function datalogRemove(id) { const list = datalogEntries().filter(function (e) { return e.id !== id; }); setInst({ datalog: list }); return list.length; }
  /** Clear the datalogger. */
  function datalogClear() { setInst({ datalog: [] }); return 0; }
  /** JSON text of the datalogger (pretty, 2 spaces). */
  function datalogJson() { return JSON.stringify(datalogEntries(), null, 2); }
  /** Copy the datalog JSON to the clipboard (Clipboard API, textarea fallback); returns a Promise<boolean>. */
  function datalogCopy() {
    const text = datalogJson();
    const fallback = function () {
      try {
        const ta = h('textarea', { style: { position: 'fixed', left: '-1000px', top: '0' } }); ta.value = text;
        document.body.appendChild(ta); ta.select();
        const ok = !!document.execCommand && document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
      } catch (e) { return false; }
    };
    const done = function (ok) { UT.status({ right: ok ? t('Datalog JSON copied to the clipboard') : t('Copy failed — select the text in the window and copy it manually') }); return ok; };
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return done(true); }, function () { return done(fallback()); });
    } catch (e) { /* fall through */ }
    return Promise.resolve(done(fallback()));
  }
  function buildDatalogContent() {
    const list = datalogEntries();
    const rows = list.map(function (e, i) {
      const r = e.readouts || {};
      const v = function (x, dp) { return x === null || x === undefined || !Number.isFinite(x) ? '--' : Number(x).toFixed(dp); };
      return h('tr', { dataset: { id: e.id } }, [
        h('td', { class: 'no-i18n' }, String(i + 1)),
        h('td', { class: 'no-i18n' }, fmtTime(e.t)),
        h('td', { class: 'no-i18n' }, v(r.sp, 2)), h('td', { class: 'no-i18n' }, v(r.sd, 2)), h('td', { class: 'no-i18n' }, v(r.dp, 2)),
        h('td', { class: 'no-i18n' }, r.amp === null || r.amp === undefined ? '--' : Math.round(r.amp) + '%'),
        h('td', { class: 'no-i18n' }, fmtGain(e.gain)), h('td', { class: 'no-i18n' }, Number(e.range).toFixed(0)),
        h('td', { class: 'no-i18n' }, (e.probe ? e.probe.angle + '° x' + e.probe.x + ' z' + e.probe.z : '')),
        h('td', {}, [h('input', { class: 'dl-note fld-input', type: 'text', value: e.note || '', placeholder: t('note'), 'aria-label': t('Note'), onchange: function (ev) { const l = datalogEntries().map(function (x) { return x.id === e.id ? Object.assign({}, x, { note: ev.target.value }) : x; }); setInst({ datalog: l }); } })]),
        h('td', {}, [UT.dom.button('Delete', function () { datalogRemove(e.id); refreshDatalogWindow(true); }, { class: 'btn dl-del' })]),
      ]);
    });
    const table = h('table', { class: 'dl-table' }, [
      h('thead', {}, [h('tr', {}, [tx('th', null, '#'), tx('th', null, 'Time'), tx('th', null, 'SP'), tx('th', null, 'SD'), tx('th', null, 'DP'), tx('th', null, 'AMP'), tx('th', null, 'Gain'), tx('th', null, 'Range'), tx('th', null, 'Probe'), tx('th', null, 'Note'), h('th')])]),
      h('tbody', {}, rows),
    ]);
    const empty = list.length ? null : tx('div', 'dl-empty', 'No entries yet — press SAVE on the instrument to log the current readouts.');
    const json = h('textarea', { class: 'dl-json no-i18n', readonly: true, rows: 4, 'aria-label': t('Datalog JSON') });
    json.value = datalogJson();
    return h('div', { class: 'dl-body' }, [
      h('div', { class: 'btn-row dl-tools' }, [
        UT.dom.button('Save now', function () { save(); refreshDatalogWindow(true); }, { class: 'btn primary' }),
        UT.dom.button('Copy JSON', function () { datalogCopy(); }),
        UT.dom.button('Clear all', function () { datalogClear(); refreshDatalogWindow(true); }),
        tx('span', 'dl-count', '{n} / 100 entries', { n: list.length }),
      ]),
      h('div', { class: 'dl-scroll' }, [table, empty]),
      json,
    ]);
  }
  function ensureDatalogWindow() {
    if (mem.datalogWin) return mem.datalogWin;
    if (typeof document === 'undefined') return null;
    UT.dom.injectCss('instruments', UT.instruments.css);
    mem.datalogWin = UT.dom.win({ name: 'datalog', title: 'Datalogger', x: 470, y: 140, w: 640, class: 'win-datalog', onShow: function () { refreshDatalogWindow(true); } });
    return mem.datalogWin;
  }
  /** Re-render the datalog window when open and (force or) the entry list changed. */
  function refreshDatalogWindow(force) {
    const w = mem.datalogWin; if (!w || !w.isOpen()) return;
    const list = datalogEntries();
    const key = list.length + ':' + (list.length ? list[list.length - 1].id : 0) + ':' + list.map(function (e) { return e.id; }).join(',');
    if (!force && key === mem.datalogKey) return;
    mem.datalogKey = key;
    w.setContent(buildDatalogContent());
  }
  const datalog = {
    open() { const w = ensureDatalogWindow(); if (w) w.show(); return w; },
    close() { if (mem.datalogWin) mem.datalogWin.close(); },
    toggle() { const w = ensureDatalogWindow(); if (w) w.toggle(); return w; },
    get window() { return ensureDatalogWindow(); },
    entries: datalogEntries, remove: datalogRemove, clear: datalogClear, copyJson: datalogCopy, json: datalogJson, save,
  };

  // ------------------------------------------------------------------ CSS (scoped under the skin classes)
  const css = [
    '.skin{font-family:Segoe UI,Arial,sans-serif;font-size:11px;user-select:none;box-sizing:border-box;}',
    '.skin *{box-sizing:border-box;}',
    '.ik{font:inherit;color:#e8e8e8;background:#3a3c40;border:1px solid #9a9ca0;border-radius:6px;padding:2px 4px;cursor:pointer;line-height:1.1;text-align:center;}',
    '.ik:active{background:#6a6c70;}',
    '.ik-cap{display:block;font-size:7px;color:#f0c020;height:9px;line-height:9px;text-align:center;white-space:nowrap;}',
    /* EPOCH 600 */
    '.skin-epoch600{display:flex;gap:4px;padding:6px 4px;background:linear-gradient(#5a5d62,#45484d 30%,#3b3d41);border:2px solid #8a8d92;border-radius:10px;min-height:396px;color:#eee;}',
    '.e6-keys{width:76px;flex:0 0 76px;background:#2a2c30;border-radius:8px;padding:6px 3px 4px;display:flex;flex-direction:column;gap:6px;}',
    '.e6-keyrow{display:flex;gap:3px;justify-content:space-between;}',
    '.e6-keycol{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;}',
    '.ik-round{width:30px;height:30px;border-radius:15px;font-weight:bold;font-size:12px;}',
    '.ik-flat{width:100%;min-width:0;height:22px;font-size:7.5px;padding:1px 0;border-radius:5px;white-space:normal;line-height:1;overflow:hidden;}',
    '.ik-2f{color:#f0c020;font-weight:bold;}.ik-2f.lit{background:#f0c020;color:#000;}',
    '.ik-pad{display:grid;grid-template-columns:20px 22px 20px;grid-template-rows:20px 22px 20px;gap:1px;justify-content:center;margin:2px auto;}',
    '.ik-pad .ik{padding:0;font-size:11px;}',
    '.ik-ok{border-radius:4px;background:#2a2c30;font-size:14px;}',
    '.ik-small{font-size:10px;border-radius:10px;}',
    '.e6-brand{margin-top:auto;font:italic bold 11px Segoe UI,Arial,sans-serif;color:#ddd;text-align:center;}',
    '.e6-centre{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:3px;}',
    '.e6-top{display:flex;align-items:center;justify-content:space-between;height:20px;padding:0 4px;}',
    '.e6-leds{display:flex;gap:8px;}',
    '.e6-led{display:inline-block;width:14px;font-size:8px;color:#ccc;text-align:center;border-top:4px solid #666;padding-top:1px;}',
    '.e6-led.on{border-top-color:#7fff3f;}',
    '.e6-olympus{font:bold 13px Arial,sans-serif;letter-spacing:2px;color:#ddd;}',
    '.ik-power{width:22px;height:18px;border-radius:9px;padding:0;color:#7fff3f;font-size:10px;}',
    '.e6-screen{width:330px;height:250px;max-width:100%;background:#1a1c1a;border:2px solid #111;display:flex;flex-direction:column;overflow:hidden;color:#eee;align-self:center;}',
    '.e6-hdr{display:flex;align-items:center;gap:3px;height:16px;padding:1px 2px;background:#2b2d2b;}',
    '.e6-hbox{background:#f4f4f4;color:#000;font:bold 9px Segoe UI,Arial,sans-serif;padding:0 3px;height:12px;line-height:12px;width:80px;}',
    '.e6-hlab{font-size:9px;}.e6-hid{width:60px;}',
    '.e6-main{flex:1 1 auto;display:flex;min-height:0;}',
    '.e6-left{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;}',
    '.e6-readrow{display:flex;height:34px;gap:2px;padding:1px 2px;background:#111;}',
    '.e6-rcol{display:flex;flex-direction:column;gap:1px;width:64px;}',
    '.e6-rbox{display:flex;align-items:center;gap:2px;height:15px;background:#1d1f1d;border:1px solid #333;padding:0 2px;cursor:pointer;}',
    '.e6-rbox.sel{border-color:#7fff3f;}',
    '.e6-ri{font-size:8px;color:#f0c020;width:14px;}',
    '.e6-rv{font:bold 10px Consolas,Segoe UI,monospace;color:#f4f4f4;margin-left:auto;}',
    '.e6-bigbox{flex:1;display:flex;align-items:baseline;justify-content:flex-end;gap:3px;background:#000;border:1px solid #333;padding:0 3px;}',
    '.e6-bigicon{font-size:9px;color:#f0c020;margin-right:auto;}',
    '.e6-big{font:bold 26px Consolas,Segoe UI,monospace;color:#3cff3c;letter-spacing:1px;line-height:30px;}',
    '.e6-unit{font-size:9px;color:#3cff3c;}',
    '.e6-plot{flex:1 1 auto;position:relative;min-height:0;background:#1a1c1a;}',
    '.e6-ascan{display:block;width:100%;height:100%;}',
    '.e6-page{position:absolute;right:2px;bottom:1px;background:#f4f4f4;color:#000;font-size:8px;padding:0 2px;line-height:10px;}',
    '.e6-soft{width:54px;flex:0 0 54px;display:flex;flex-direction:column;background:#2b2d2b;border-left:1px solid #444;}',
    '.e6-sk{flex:1 1 0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;border-bottom:1px solid #4a4c4a;background:#3a3c3a;color:#f0f0f0;cursor:pointer;padding:1px 0;line-height:1;}',
    '.e6-sk.sel{background:#22c022;color:#000;}',
    '.e6-sk.hdr{background:#1d1f1d;color:#f0c020;}',
    '.e6-sk.sub{background:#343634;}',
    '.e6-skl{font-size:9px;font-weight:bold;white-space:nowrap;}',
    '.e6-skv{font-size:8px;white-space:nowrap;}',
    '.e6-skv.ref{font-size:6.5px;letter-spacing:-0.2px;}',
    '.ik-cap.ik-refcap.lit{background:#f0c020;color:#000;border-radius:2px;padding:0 2px;}',
    '.e6-icon{height:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;background:#1a1c1a;}',
    '.e6-icon .mini-ascan{width:22px;height:26px;position:absolute;left:8px;top:2px;}',
    '.e6-icon1{position:absolute;left:32px;top:3px;font-size:8px;color:#f0c020;}',
    '.e6-legs{position:absolute;left:31px;top:14px;display:flex;flex-direction:column;}',
    '.e6-leg{font-size:6px;line-height:6px;color:#666;}.e6-leg.on{color:#3cff3c;font-weight:bold;}',
    '.e6-bottom{display:grid;grid-template-columns:repeat(7,1fr);height:18px;background:#2b2d2b;border-top:1px solid #444;}',
    '.e6-bcell{font:9px Segoe UI,Arial,sans-serif;color:#f0f0f0;background:#3a3c3a;border:0;border-right:1px solid #555;padding:0;cursor:pointer;}',
    'button.e6-bcell:hover{background:#4d4f4d;}',
    '.e6-prow{display:flex;justify-content:space-around;padding:2px 0 0;}',
    '.ik-p{width:30px;height:26px;border-radius:0 0 9px 9px;border-top:0;background:transparent;font-size:9px;color:#ddd;}',
    '.e6-right{width:38px;flex:0 0 38px;display:flex;flex-direction:column;align-items:center;gap:6px;padding-top:26px;}',
    '.ik-next{width:38px;height:30px;font-size:7px;font-weight:bold;border-radius:8px 8px 3px 3px;white-space:normal;line-height:1.1;}',
    '.e6-fkeys{display:flex;flex-direction:column;gap:8px;margin-top:10px;}',
    '.ik-f{width:30px;height:24px;border-radius:9px 0 0 9px;background:transparent;font-size:9px;color:#ddd;}',
    /* EPOCH 4 */
    '.skin-epoch4{background:#141414;border:2px solid #333;border-radius:12px;padding:8px 6px 4px;display:flex;flex-direction:column;align-items:center;gap:6px;color:#ddd;min-height:396px;}',
    '.e4-bezel{background:#0a0a0a;border:3px solid #2a2a2a;border-radius:8px;padding:6px;}',
    '.e4-screen{width:290px;height:232px;background:#dfe3d5;color:#101010;font:11px Consolas,"Courier New",monospace;line-height:12px;display:flex;flex-direction:column;padding:2px 3px;overflow:hidden;}',
    '.e4-top{display:flex;justify-content:space-between;height:38px;}',
    '.e4-tl{white-space:pre;}.e4-tc{text-align:center;}.e4-range{font-size:11px;}.e4-big{font:bold 16px Consolas,"Courier New",monospace;line-height:18px;}',
    '.e4-tr .mini-ascan{width:16px;height:22px;border:1px solid #101010;background:#dfe3d5;}',
    '.e4-ascan{display:block;width:100%;height:78px;flex:0 0 78px;}',
    '.e4-params{display:grid;grid-template-columns:1.1fr 1fr 1fr;font-size:10px;line-height:11px;white-space:nowrap;}',
    '.e4-gates{border-collapse:collapse;font-size:10px;line-height:11px;width:100%;}',
    '.e4-gates th{font-weight:normal;text-align:left;padding:0 2px;}',
    '.e4-gates td{padding:0 2px;cursor:pointer;}',
    '.e4-gc.sel{background:#101010;color:#dfe3d5;}',
    '.e4-soft{margin-top:auto;display:grid;grid-template-columns:repeat(5,1fr);border-top:1px solid #101010;font-size:9px;text-align:center;}',
    '.e4-sk{border-right:1px solid #101010;cursor:pointer;line-height:12px;}',
    '.e4-sk:last-child{border-right:0;}.e4-sk.sel{background:#101010;color:#dfe3d5;}',
    '.e4-fkeys{display:flex;gap:14px;}',
    '.e4-f{width:28px;height:22px;border-radius:6px;background:#d8d8d8;color:#222;border:1px solid #888;font-size:9px;font-weight:bold;}',
    '.e4-keypad{display:flex;gap:6px;background:#10153a;border:1px solid #445;border-radius:6px;padding:4px;}',
    '.e4-padwrap{display:flex;flex-direction:column;align-items:center;}',
    '.e4-pad{display:grid;grid-template-columns:34px 30px 34px;grid-template-rows:26px 26px 26px;gap:2px;}',
    '.e4-grid{display:grid;grid-template-columns:repeat(3,52px);gap:2px 4px;}',
    '.e4-kc{display:flex;flex-direction:column;align-items:center;}',
    '.e4-cap{display:block;font-size:6px;color:#ccc;height:8px;line-height:8px;white-space:nowrap;}',
    '.e4k{width:100%;height:22px;font-size:7px;font-weight:bold;border-radius:4px;border:1px solid #222;padding:0 1px;white-space:normal;line-height:1;color:#111;}',
    '.e4k.green{background:#4cc36a;}.e4k.red{background:#e0362e;color:#fff;}.e4k.orange{background:#f07a2a;color:#fff;}.e4k.yellow{background:#f2d43a;}.e4k.grey{background:#d0d0d0;}.e4k.blue{background:#2f7fe0;color:#fff;}',
    '.e4k.lit{outline:2px solid #fff;}',
    '.e4-brand{font:italic bold 11px Segoe UI,Arial,sans-serif;color:#ddd;align-self:flex-start;padding-left:6px;}',
    /* USK7 window */
    '.win-usk7 .win-body{padding:0;}',
    '.skin-usk7{display:flex;width:484px;height:200px;background:#0d0d0d;border:1px solid #333;}',
    '.usk-crtwrap{position:relative;width:200px;flex:0 0 200px;background:#0b0b0b;padding:6px;}',
    '.usk-crt{display:block;width:188px;height:188px;}',
    '.usk-text{position:absolute;left:14px;top:12px;font:bold 11px Segoe UI,Arial,sans-serif;color:#ff40ff;white-space:nowrap;pointer-events:none;}',
    '.usk-panel{flex:1 1 auto;display:flex;justify-content:space-around;background:radial-gradient(#3a3d40,#1e2022);padding:4px 2px;}',
    '.usk-col{display:flex;flex-direction:column;align-items:center;justify-content:space-around;gap:2px;}',
    '.usk-knob{display:flex;flex-direction:column;align-items:center;gap:1px;}',
    '.usk-lr{display:flex;gap:2px;}',
    '.usk-arr{width:18px;height:14px;padding:0;font-size:8px;border-radius:2px;background:#e8e8e8;color:#000;border:1px solid #666;}',
    '.usk-dial{width:36px;height:36px;border-radius:50%;background:radial-gradient(circle at 40% 35%,#777,#222);border:2px solid #555;position:relative;cursor:ns-resize;}',
    '.usk-ptr{position:absolute;left:16px;top:2px;width:3px;height:16px;background:#eee;transform-origin:1.5px 16px;border-radius:1px;}',
    '.usk-klab{font:bold 10px Segoe UI,Arial,sans-serif;color:#3cff3c;letter-spacing:1px;white-space:nowrap;}',
    '.usk-btn{width:16px;height:16px;border-radius:50%;border:2px solid #222;}',
    '.usk-btn.red{background:radial-gradient(#ff6060,#900);}.usk-btn.yellow{background:radial-gradient(#ffe860,#a08000);}',
    '.usk-ampcol{width:44px;}',
    '.usk-amp{writing-mode:vertical-lr;direction:rtl;width:18px;height:90px;margin:0;accent-color:#ccc;}',
    '.usk-amplab{font:bold 10px Segoe UI,Arial,sans-serif;color:#3cff3c;}',
    '.usk-erase{background:#111;color:#eee;border:1px solid #777;border-radius:2px;font-size:11px;padding:6px 8px;}',
    '.usk-offcol{justify-content:flex-start;padding-top:4px;}',
    '.usk-off{width:34px;height:20px;background:#ddd;color:#000;border-radius:3px;font-weight:bold;font-size:9px;}',
    '.usk-brand{writing-mode:vertical-rl;transform:rotate(180deg);font:bold 8px Arial,sans-serif;color:#bbb;letter-spacing:1px;margin-top:auto;}',
    '.skin-uskdock{width:220px;padding:14px 10px;color:#ddd;display:flex;flex-direction:column;gap:10px;align-items:center;justify-content:center;min-height:200px;text-align:center;}',
    '.uskdock-title{font-weight:bold;color:#3cff3c;}',
    '.uskdock-hint{font-size:11px;color:#bbb;}',
    '.uskdock-btn{padding:6px 12px;}',
    '.usk-pr{position:absolute;left:14px;top:25px;font:bold 9px Segoe UI,Arial,sans-serif;color:#ff40ff;white-space:nowrap;pointer-events:none;opacity:0.85;}',
    /* v2: AUTO caption, focus rings, softkey cells as buttons */
    '.ik-cap.ik-autocap.lit{background:#f0c020;color:#000;border-radius:2px;padding:0 2px;}',
    '.e6-sk{touch-action:none;}',
    '.e6-sk:focus-visible,.ik:focus-visible,.e6-bcell:focus-visible,.usk-dial:focus-visible{outline:2px solid #7fd0ff;outline-offset:-2px;}',
    '.e4-cell{cursor:pointer;}.e4-cell:hover{text-decoration:underline;}',
    /* v2: touch-sized controls (display.touchBar on / auto + coarse pointer) */
    '.skin.touch .ik{min-height:28px;font-size:10px;}',
    '.skin.touch .ik-flat{height:30px;font-size:9px;}',
    '.skin.touch .ik-round{width:36px;height:36px;border-radius:18px;}',
    '.skin.touch .ik-pad{grid-template-columns:26px 28px 26px;grid-template-rows:26px 28px 26px;gap:2px;}',
    '.skin.touch .ik-p{width:32px;height:30px;}',
    '.skin.touch .ik-f{width:34px;height:30px;}',
    '.skin.touch .ik-next{height:36px;}',
    '.skin-epoch600.touch .e6-screen{height:300px;}',
    '.skin-epoch600.touch .e6-soft{width:64px;flex-basis:64px;}',
    '.skin-epoch600.touch .e6-sk{min-height:26px;}',
    '.skin-epoch600.touch .e6-icon{height:30px;}',
    '.skin-epoch600.touch .e6-skl{font-size:10px;}.skin-epoch600.touch .e6-skv{font-size:9px;}',
    '.skin-epoch600.touch .e6-bottom{height:26px;}',
    '.skin-epoch600.touch .e6-bcell{font-size:10px;}',
    '.skin-epoch4.touch .e4k{height:28px;font-size:8px;}',
    '.skin-epoch4.touch .e4-sk{line-height:22px;font-size:10px;}',
    '.skin-epoch4.touch .e4-gates td{padding:2px 4px;}',
    '.skin-usk7.touch .usk-arr{width:24px;height:20px;font-size:10px;}',
    '.skin-usk7.touch .usk-dial{width:44px;height:44px;}.skin-usk7.touch .usk-ptr{left:20px;}',
    /* v2: high contrast (.hc on #app, set by 90-app) */
    '.hc .skin-epoch600{border-color:#fff;background:#202020;}',
    '.hc .ik{border-color:#fff;color:#fff;background:#111;}',
    '.hc .e6-sk{background:#000;color:#fff;border-bottom-color:#888;}',
    '.hc .e6-sk.sel{background:#fff;color:#000;outline:2px solid #fff;}',
    '.hc .e6-sk.hdr{color:#ffe000;}',
    '.hc .e6-rbox{border-color:#aaa;}.hc .e6-rbox.sel{border-color:#fff;border-width:2px;}',
    '.hc .e6-big{color:#fff;}.hc .e6-unit{color:#fff;}.hc .e6-rv{color:#fff;}',
    '.hc .e6-bcell{color:#fff;background:#000;border-right-color:#888;}',
    '.hc .e6-leg.on{color:#fff;}',
    '.hc .e4-screen{background:#fff;color:#000;}.hc .e4-gc.sel,.hc .e4-sk.sel{background:#000;color:#fff;}',
    '.hc .skin-usk7{border-color:#fff;}.hc .usk-klab,.hc .usk-amplab{color:#fff;}',
    /* v2: datalogger window */
    '.win-datalog .win-body{padding:6px;}',
    '.dl-body{display:flex;flex-direction:column;gap:6px;font-size:12px;}',
    '.dl-tools{align-items:center;gap:6px;}',
    '.dl-count{margin-left:auto;color:#555;font-size:11px;}',
    '.dl-scroll{max-height:260px;overflow:auto;border:1px solid #bbb;background:#fff;}',
    '.dl-table{border-collapse:collapse;width:100%;font-size:11px;}',
    '.dl-table th{position:sticky;top:0;background:#e4e4e4;text-align:left;padding:2px 4px;border-bottom:1px solid #999;font-weight:bold;}',
    '.dl-table td{padding:1px 4px;border-bottom:1px solid #e0e0e0;white-space:nowrap;}',
    '.dl-table .dl-note{width:110px;font-size:11px;padding:1px 3px;}',
    '.dl-table .dl-del{padding:0 6px;font-size:11px;}',
    '.dl-empty{padding:12px;color:#666;text-align:center;}',
    '.dl-json{width:100%;font:10px Consolas,"Courier New",monospace;resize:vertical;box-sizing:border-box;}',
  ].join('\n');

  // ------------------------------------------------------------------ public API
  UT.instruments = {
    mount, setSkin, drawAscan, drawSscan, handleKey, css,
    // v2 (SPEC-v2 §3.7 / §5.2 / §11.4)
    auto, storeRef, wheel, compare, save, datalog,
    fmtLen: function (mm, dp) { return UT.fmtLen(mm, dp); },
    /** Internals exposed for tests / other modules (read-only use). */
    _: { PARAMS, LEGAL_PARAMS, THEMES, keys, adjust, selectParam, softkeyItems, nextRange, foldDepth, ampColour, dacPolyline, dacAt, tcgFlatPolyline, compareOf, alarmActive, checkAlarms, energyV, dampingOhms, filterOf, prfOf, tcgActive, wantTouch, mem },
    get window() { return ensureUskWindow(); },
    __selftest() {
      const f = [];
      // ---- v2 invariants (pure: local instrument copies only; UT.state / mem untouched)
      const v2 = Object.assign({}, UT.defaultState().instrument);
      if (LEGAL_PARAMS.indexOf('autoPct') < 0 || !PARAMS.autoPct || PARAMS.autoPct.get(v2) !== 80 || PARAMS.autoPct.fmt(80) !== '80%') f.push('autoPct param');
      if (energyV(v2) !== 200 || dampingOhms(v2) !== 150 || filterOf(v2) !== 'broadband' || prfOf(v2) !== 60) f.push('pulser/receiver defaults ' + energyV(v2) + '/' + dampingOhms(v2) + '/' + filterOf(v2));
      if (energyV(Object.assign({}, v2, { pulser: { energy: 'high' } })) !== 400 || energyV(Object.assign({}, v2, { pulser: { energy: 'low' } })) !== 100) f.push('energy labels');
      if (dampingOhms(Object.assign({}, v2, { damping: true })) !== 50) f.push('damping boolean → 50 Ω');
      if (dampingOhms(Object.assign({}, v2, { damping: false, pulser: { damping: 400 } })) !== 400) f.push('pulser.damping 400');
      if (nextIn(ENERGIES, 400) !== 100 || nextIn(DAMPING_OHMS, 150) !== 200 || nextIn(FILTERS, '5-15') !== 'broadband') f.push('option cycling');
      if (ENERGIES.join() !== '100,200,300,400' || DAMPING_OHMS.join() !== '50,100,150,200,400' || FILTERS.join() !== 'broadband,0.2-10,1.5-8.5,5-15') f.push('option lists');
      if (UT.ascan && UT.ascan.FILTERS && UT.ascan.FILTERS.join() !== FILTERS.join()) f.push('FILTERS differ from 40-ascan');
      if (UT.ascan && UT.ascan.DAMPING_OHMS && UT.ascan.DAMPING_OHMS.join() !== DAMPING_OHMS.join()) f.push('DAMPING_OHMS differ from 40-ascan');
      const tcgI = Object.assign({}, v2, { gain: 40, tcg: { on: true }, dac: { points: [{ path: 20, ampPct: 100 }, { path: 50, ampPct: 40 }], refDb: 34, on: true, curves: true } });
      if (!tcgActive(tcgI) || tcgActive(Object.assign({}, tcgI, { tcg: { on: false } })) || tcgActive(Object.assign({}, tcgI, { dac: { points: [{ path: 20, ampPct: 100 }], refDb: 34 } }))) f.push('tcgActive');
      const flat = tcgFlatPolyline(tcgI);
      if (flat.length !== 2 || Math.abs(flat[0].pct - 80 * Math.pow(10, 6 / 20)) > 1e-6 || flat[0].path !== 20 || flat[1].path !== 50 || flat[1].pct !== flat[0].pct) f.push('tcgFlatPolyline ' + JSON.stringify(flat));
      if (tcgLabel(tcgI) !== 'On' || tcgLabel(Object.assign({}, tcgI, { dac: { points: [] } })) !== 'On*' || tcgLabel(v2) !== 'Off') f.push('tcgLabel');
      const cmpArr = new Float32Array([1, 2, 3]);
      if (compareOf(Object.assign({}, v2, { compare: cmpArr })) !== cmpArr || compareOf(Object.assign({}, v2, { compare: null })) !== null || compareOf(Object.assign({}, v2, { compare: new Float32Array(0) })) !== null) f.push('compareOf');
      const alarmI = Object.assign({}, v2, { gates: [{ on: true, alarm: true, start: 10, width: 60, level: 20 }, { on: true, alarm: false, start: 70, width: 20, level: 40 }] });
      if (!alarmActive(alarmI, { readouts: { gate: [{ peakPct: 50 }, null] } }) || alarmActive(alarmI, { readouts: { gate: [null, { peakPct: 50 }] } }) || alarmActive(alarmI, null)) f.push('alarmActive');
      // softkey pages v2: Pulsar / Rcvr / TCG / AUTO %
      const lab = function (p, sp) { return softkeyItems(Object.assign({}, v2, { page: p }), sp === undefined ? null : sp).map(function (i) { return i.label; }).join('|'); };
      if (lab(3) !== 'Gain|DAC Setup|Record|Erase|Curve|Draw|TCG') f.push('page 3 v2: ' + lab(3));
      if (lab(1, 'Pulsar') !== 'Pulsar|Freq|Energy|Damping|PRF') f.push('Pulsar sub-page: ' + lab(1, 'Pulsar'));
      if (lab(1, 'Rcvr') !== 'Rcvr|Filter|Rectify|Reject') f.push('Rcvr sub-page: ' + lab(1, 'Rcvr'));
      if (lab(2, 'Gate Setup') !== 'Gate Setup|Mode|Measure|AUTO %') f.push('Gate Setup sub-page: ' + lab(2, 'Gate Setup'));
      if (lab(3, 'DAC Setup').indexOf('|TCG') < 0) f.push('DAC Setup TCG');
      const pul = softkeyItems(Object.assign({}, v2, { page: 1 }), 'Pulsar');
      if (pul[2].value !== '200V' || pul[3].value !== '150Ω' || pul[4].value !== '60Hz') f.push('Pulsar values ' + pul.map(function (i) { return i.value; }).join(','));
      if (softkeyItems(Object.assign({}, v2, { page: 1 }), 'Rcvr')[1].value !== 'Broadband') f.push('Rcvr filter value');
      if (typeof auto !== 'function' || typeof storeRef !== 'function' || typeof wheel !== 'function' || typeof save !== 'function' || typeof compare !== 'function') f.push('v2 API');
      if (!datalog || typeof datalog.open !== 'function' || typeof datalog.toggle !== 'function' || typeof datalog.close !== 'function') f.push('datalog window API');
      if (!/\.hc /.test(css) || !/\.skin\.touch /.test(css) || !/win-datalog/.test(css)) f.push('v2 css blocks');
      if (fmtTime(0).length !== 8) f.push('fmtTime');
      if (ENERGY_E4[300] !== 'MED+' || filterLabel('broadband') !== 'Broadband' || filterLabel('5-15') !== '5-15 MHz') f.push('labels');
      // ---- v1 invariants
      // legal parameter list ↔ PARAMS
      LEGAL_PARAMS.forEach(function (k) { if (!PARAMS[k]) f.push('missing PARAMS.' + k); });
      Object.keys(PARAMS).forEach(function (k) { if (LEGAL_PARAMS.indexOf(k) < 0) f.push('illegal param ' + k); });
      [10, 50, 88.5, 100, 104.9, 200, 250, 999.9].forEach(function (r0) {
        [false, true].forEach(function (coarse) {
          const up = M.clamp(Math.round((r0 + rangeStep(r0, 1, coarse)) * 10) / 10, 10, 1000), back = Math.round((up - rangeStep(up, -1, coarse)) * 10) / 10;
          if (up <= r0 && r0 < 1000) f.push('rangeStep up ' + r0); if (r0 < 900 && back !== r0) f.push('rangeStep symmetry ' + (coarse ? 'coarse ' : '') + r0 + ' -> ' + up + ' -> ' + back);
        });
      });
      if (rangeStep(200, 1, false) !== 2 || rangeStep(200, 1, true) !== 20 || rangeStep(10, 1, false) !== 0.1) f.push('rangeStep sizes');
      if (nextRange(100) !== 200 || nextRange(400) !== 50 || nextRange(88.5) !== 100 || nextRange(100, true) !== 50 || nextRange(50, true) !== 400) f.push('nextRange cycle');
      if (Math.abs(foldDepth(25, 20) - 15) > 1e-9 || Math.abs(foldDepth(45, 20) - 5) > 1e-9 || Math.abs(foldDepth(8, 20) - 8) > 1e-9) f.push('foldDepth');
      const poly = dacPolyline({ gain: 40, dac: { points: [{ path: 50, ampPct: 80 }, { path: 20, ampPct: 100 }], refDb: 34, on: true } });
      if (poly.length !== 2 || poly[0].path !== 20) f.push('dacPolyline sort');
      if (Math.abs(poly[1].pct - 80 * Math.pow(10, 6 / 20)) > 1e-6) f.push('dacPolyline gain scaling ' + poly[1].pct);
      if (Math.abs(dacAt(poly, 35) - (poly[0].pct + poly[1].pct) / 2) > 1e-6) f.push('dacAt interpolation');
      if (dacAt(poly, 5) !== poly[0].pct || dacAt(poly, 500) !== poly[1].pct) f.push('dacAt hold ends');
      if (dacPolyline({ gain: 30, dac: { points: [{ path: 50, ampPct: 80 }], refDb: 30 } }).length !== 0) f.push('dacPolyline needs 2 points');
      if (ampColour(90) !== '#ff2020' || ampColour(5) !== '#203080') f.push('ampColour');
      if (fmtGain(30) !== '30dB' || fmtGain(30.5) !== '30.5dB') f.push('fmtGain');
      if (!THEMES.epoch600 || !THEMES.epoch4 || !THEMES.usk7) f.push('themes');
      if (resolveTheme({ base: 'usk7', trace: '#fff' }).bg !== THEMES.usk7.bg) f.push('resolveTheme override');
      // softkey page structure (§14.4)
      // (evaluated on a local copy of the default instrument — UT.state and mem are never mutated here, §15.1/§15.12)
      const tmp = Object.assign({}, UT.defaultState().instrument);
      const labels = function (p, sp) { return softkeyItems(Object.assign({}, tmp, { page: p }), sp === undefined ? null : sp).map(function (i) { return i.label; }).join('|'); };
      if (labels(1) !== 'Gain|Range|Delay|Basic|Pulsar|Rcvr|Trig|Auto Cal') f.push('page 1: ' + labels(1));
      if (labels(2) !== 'Gain|Range|G1Level|Gate1|Gate2|Gate Setup') f.push('page 2: ' + labels(2));
      if (labels(3) !== 'Gain|DAC Setup|Record|Erase|Curve|Draw|TCG') f.push('page 3: ' + labels(3));
      if (labels(4) !== 'Display|Rectify|Grid|Peak Mem|Freeze') f.push('page 4: ' + labels(4));
      if (labels(5) !== 'Units|Trig|Angle|Thick|X Value|Reset') f.push('page 5: ' + labels(5));
      if (labels(1, 'Basic') !== 'Basic|Range|Velocity|Zero|Delay') f.push('Basic sub-page');
      if (labels(1, 'Gate2') !== 'Gate2|Zoom|Start|Width|Level|Alarm') f.push('Gate2 sub-page');
      if (valueOf('gain', tmp) !== '30dB' || valueOf('range', tmp) !== '100.0' || valueOf('g1level', tmp) !== '20%') f.push('valueOf ' + valueOf('gain', tmp) + ' ' + valueOf('range', tmp) + ' ' + valueOf('g1level', tmp));
      if (css.indexOf('<\/style') >= 0 || css.indexOf('<\/script') >= 0) f.push('css contains closing tag');
      return f;
    },
  };

  // ------------------------------------------------------------------ test API (SPEC-v2 §7: owner 70)
  Object.assign(UT.test, {
    /** Clone of the datalogger entries. */
    datalog: function () { return UT.clone(datalogEntries()); },
    /** AUTO XX % target: autoPct() reads it, autoPct(v) sets it (10…100) and returns the stored value. */
    autoPct: function (v) { if (v !== undefined) { PARAMS.autoPct.set(+v); UT.renderNow(); } return PARAMS.autoPct.get(); },
    /** UT.instruments.auto(pct) + synchronous render; returns the new gain (null without a gated echo). */
    auto: function (pct) { const g = auto(pct); UT.renderNow(); return g; },
    /** 2ND F + dB; returns instrument.refGain. */
    storeRef: function () { const r = storeRef(); UT.renderNow(); return r; },
    /** n knob clicks on the selected parameter; returns its new value. */
    wheel: function (n) { const v = wheel(n); UT.renderNow(); return v; },
  });
})(window.UT = window.UT || {});
