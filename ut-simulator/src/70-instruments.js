/* 70-instruments.js — EPOCH 600 / EPOCH 4 / USK7 instrument skins (DOM + CSS) and the shared
 * A-scan / S-scan canvas renderers.  SPEC §7.1–7.3 as amended by §14.4 and §15.7.
 *
 * // SPEC NOTES (decisions where the spec is silent)
 * - USK7: the skin is a floating window (`data-win="usk7"`) holding the CRT canvas `cv-ascan`; while it is the
 *   active UT set `#instrument` shows a small dark panel with a "Show USK 7" button (v3: the window is closed with
 *   its titlebar ✕ — OFF is a power key — and re-opened from that panel or Options ▸ UT Set; the button hides itself
 *   while the window is open).  Only one `#cv-ascan` exists at a time.
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
 *   selected angle (`frame.paSelected.angle`) with a thin dashed radial line. The sector replaces the A-scan on the
 *   EPOCH screens only (§6.9 "the EPOCH screen shows S-SCAN"): the analogue single-channel USK 7 has no sector
 *   display, so its CRT keeps the A-scan of the active focal law (and its text line reads that law's angle).
 * - Tooltips / aria-labels (§5.7): every hard key, dB cell, P/F key and USK7 button carries title + aria-label from the
 *   TIPS table (English keys, params for P{n}/F{n}/dB cells/knobs), stored in data-tip and re-applied by relabelTips()
 *   on 'lang' and when autoPct changes (GATES tip reads '2ND F + GATES = AUTO 80 %' live). KO entries live in 92.
 * - i18n: softkey labels, captions, datalog window texts and status hints go through UT.i18n.t() with `data-i18n`
 *   (relabelled on 'lang'); product hard-key legends (dB, SAVE, GATES, OLYMPUS, EPOCH 600, P1…, F1…) sit in
 *   `.no-i18n` elements, as do numeric value cells.
 * - Test API: UT.test.datalog() (clone of the entries), autoPct(v?) (get / set), auto(pct) → gain, storeRef() → refGain,
 *   wheel(n) → the selected parameter's new value.
 *
 * // SPEC NOTES v3 (SPEC-v3 §3.1 F1, §3.3 F3, §3.5 F5, §3.6 F6, §3.7 F7, §3.8 F8, §6.1 F40)
 * - F1 power: `instrument.powered === false` blanks the TRACE only — drawAscan still paints the frame, the graticule,
 *   the bezel strip and (on the USK 7) the CRT text line, and draws the same flat baseline as the "no samples" case
 *   (utman_functions f020 shows a grid-only CRT). Gates, DAC, peak memory, compare and the badges are skipped; the
 *   window, panel, knobs and softkeys stay mounted and live. USK 7 `OFF` and the EPOCH ⏻ / ON-OFF keys are power
 *   toggles (the titlebar ✕ still closes the window); `frame.ascan` is untouched, so physics keeps running.  The
 *   USK 7 `OFF` key therefore carries the power tip (TIPS.ON, 'Switch the set on / off …') and the dock's
 *   'Show USK 7' button is hidden (`hidden`) whenever the window is open, so neither promises a window close.
 * - F3 wizard: the on-LCD box is drawn by drawAscan (theme flag `calBox`) from the state written by 80-modes
 *   (`autocal.stage/field`); 70 owns only the drawing, the field stepping and the confirm/cancel keys. Because a
 *   canvas carries no accessible text the box's three lines are ALSO written to `#cv-ascan`'s aria-label
 *   (`UT.instruments.calText()` is the single source, used by both). Field text: 2 decimals while > 0, `0` at zero
 *   (f006). ▲▼ / wheel step 0.10 mm, 2ND F (or the coarse ◀ ▶) 1.00 mm, clamped 0…500; digits, '.' and Backspace
 *   typed while the wizard is up edit the field directly. Confirm goes through UT.modes.autoCal.confirm() when 80
 *   provides it and falls back to the v2 .step().
 *   SPEC NOTE (v3 QA r3): on the EPOCH 600 the CAL page is EXACTLY five slots — one per hardware F key — holding
 *   `CAL THIN | CAL THICK | CANCEL` on F1–F3 (§3.3) and two blank rows on F4/F5, with NO orange header cell and
 *   with the gate thumbnail suppressed while the wizard is up: header and thumbnail are extra drawn rows, and they
 *   pushed every legend one to two slots below the key that performs it (the key beside `CAL THICK` cancelled).
 *   F(n) therefore presses drawn row n, sub-page or not.  The stage is shown by the `<` marker on the live row and
 *   by the on-LCD box, which is where the original puts it.  `CAL THIN` pressed at stage 2 restarts the thin stage
 *   (`autoCal.start({d1, d2})`) and `CAL THICK` at stage 1 confirms the thin standard and moves on, so no legend
 *   is ever a dead key.
 * - F5 P-row: the relabelled row is the PHYSICAL P1…P7 key row (`.ik-p`), not the LCD's bottom dB cells — the dB
 *   cells are a v1 contract (V1-6 clicks them by their `10.0dB` text). EPOCH 600 labels are the bare numbers
 *   (`10.0`…`500.0`, V3-5); the EPOCH 4 / LTC quick-range row keeps the `10.0mm` form of f028.
 * - F5 Trig: `trig.diameter` (mm, default weldOpts.od) and `trig.csc` (bool) are added to `instrument.trig` by this
 *   module; they are NOT in defaultState, so a restored record drops them (90's coerceLike keeps the default shape).
 *   `CSC On` corrects the SD / DP shown ON THE INSTRUMENT SCREENS only (law of cosines from the pipe centre) —
 *   `frame.readouts` is owned by 40-ascan and is never rewritten from here.
 * - F5 EPOCH LTC (`utSet 'epochltc'`) is a cosmetic skin over the epoch600 canvas theme: green LCD, the
 *   `BASE | GATES | PULSER | RECEIVER` tab row, the VEL/ZERO/ANGLE + THICK/CSA/DIA parameter lines, the quick-range
 *   row and the `CAL THIN | CAL THICK | CANCEL` softkeys of f028/f036. It shares every action of the EPOCH 600.
 * - F6 shorts: TIPS values stay i18n KEY strings (relabelTips compares them), so the upper-case short forms live in
 *   the parallel `SHORTS` map with the same ui ids, are written to each key's `data-short` attribute and are echoed
 *   into `status.mid` on mouseenter / focus. The previous mid line is remembered per element and restored on
 *   mouseleave / blur (90's onRender only rewrites the mid when ITS computed line changes, so the restore has to be
 *   explicit). Key legends are never translated (F6).
 *   SPEC NOTE (v3 QA r1): §3.6's `UT.status({mid: short})` is the STATE contract (V3-6 reads `status.mid`), not the
 *   painted row — on its own it wiped Pos / Range / AMP, which the original never does (epoch_auto_calibration f010
 *   paints `Pos: 118 mm | ARROW LEFT/DOWN`, f022 `Pos: 118 mm | PULSAR`). So the hint ALSO writes
 *   `status.segments` — 90's renderStatus already prefers it over splitting `status.mid` — with the normal cells
 *   minus their trailing `Depth = …` cell (§4.11: the hint takes exactly that cell) plus the short form. The depth
 *   cell is recognised through the three t() templates rendered with a sentinel, so it is found in Korean too.
 *   `segments` is cleared (null) on every restore, and a 'status' event we did not write while a hint is armed
 *   re-bases the remembered line, so 90 rebuilding the mid under the cursor can leave neither cells nor restore stale.
 * - F7 UnCalibrate: `zero = 0.4 + 0.4·(rnd − 0.5)` — §3.7's `0.4 + 0.4·rnd` cannot produce the 0.20…0.60 µs range it
 *   asks for in the same sentence (V3-7 asserts the range). The velocity is additionally pushed ≥ 0.12 mm/µs away
 *   from the true velocity so the set is visibly out of calibration (≥ 0.4 mm at the 20 mm backwall).
 * - F7 Delete EPOCH records: `deleteRecords()` is the whole action — it writes the empty list into
 *   `instrument.datalog` (via `datalogClear()`, which now reports how many entries it removed), refreshes the
 *   datalogger window and sets `status.right`. §3.7 gates it behind `UT.dom.confirm('Delete all stored records?')`,
 *   so a bare call clears nothing until the dialog is answered (V3-7 asserts exactly that); `{confirm: false}`
 *   is the documented non-interactive path, and a dialog layer that is missing, throws or rejects falls through to
 *   the same clear rather than swallowing the menu command.
 *   `Always Show UT Controls`: the USK 7 window is re-shown on every mode entry and its OFF button only powers the
 *   set down; ✕ still hides it (it comes back on the next mode entry) — a window that cannot be dismissed at all
 *   would trap the screen at 1024 × 640.
 * - F8 float: `display.instrumentFloat` MOVES the `#instrument` element into a `.win[data-win=instrument]` and puts
 *   it back on exit; #main gets the class `inst-float` (injected CSS collapses the 470 px column so the views take
 *   the freed width). Closing the float window un-floats rather than hiding the instrument.
 * - F8 chrome: the `0 2 4 6 8 10` bezel labels are painted on a strip BELOW the glass (theme `bezel`), the on-glass
 *   magenta text line follows `display.ascanText` (default on when the key is absent), the AMP slider becomes a red
 *   rotary knob with an `input[aria-label="AMP (dB)"]` kept for the keyboard and for tests, and RANGE / X-SHIFT get
 *   a second ×10 arrow pair (10 % / 10 mm).
 * - F40 hand DAC: a pointer drag on `#cv-ascan` with ≥ 2 recorded DAC points writes `instrument.dac.hand`
 *   ([{xDiv, pct}], xDiv = graticule division 0…10); the ends snap to a recorded point within 6 px and the stroke is
 *   resampled to ≥ 5 points so a two-move drag still produces a curve. `Draw` / `Draw Curves` clears it.
 */
(function (UT) {
  'use strict';
  const M = UT.math;
  const C = UT.consts.COLOURS;
  const RANGE_PRESETS = [50, 100, 200, 400];
  // v3 F5: quick-range softkey rows — EPOCH 600 P1…P7 and the EPOCH 4 / LTC F1…F4 row of f028
  const QUICK_RANGES = [10, 20, 50, 100, 125, 250, 500];
  const QUICK_RANGES_E4 = [10, 20, 50, 100];
  // the hardware softkey column: F(n) presses the drawn softkey row n (v3 QA r3 — the CAL page is sized to it)
  const FKEYS = ['F1', 'F2', 'F3', 'F4', 'F5'];
  const LEGAL_PARAMS = ['gain', 'range', 'delay', 'reject', 'g1start', 'g1width', 'g1level', 'g2start', 'g2width', 'g2level', 'velocity', 'zero', 'trigAngle', 'trigThick', 'autoPct', 'trigDiameter'];
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
    compare: null, alarmWas: [], alarmNow: false, datalogWin: null, datalogKey: '', deletePending: null, touch: false, mq: null, uiCount: 0,
    // v3: F6 status-hint stack, F8 float window, F40 hand-DAC drag, F3 typing buffer
    midSaved: null, midShown: null, hintWriting: false, floatWin: null, floatHome: null, dacDrag: null, calType: '', calAria: '',
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
    // v3 (F5): Trig ▸ Diameter — the curved-surface-correction diameter (mm); defaults to the weld's OD
    trigDiameter: {
      label: 'Diameter',
      get(ins) { const tr = (ins || inst()).trig || {}; const d = +tr.diameter; return Number.isFinite(d) && d > 0 ? d : (st().weldOpts && +st().weldOpts.od) || 168.3; },
      set(v) { setInst({ trig: Object.assign({}, inst().trig, { diameter: M.clamp(Math.round(v * 10) / 10, 5, 5000) }) }); },
      step: 0.5, coarse: 10, fmt(v) { return v.toFixed(1); },
    },
    // v2: AUTO XX % target (2ND F + GATES)
    autoPct: { label: 'AUTO %', get(ins) { const v = (ins || inst()).autoPct; return Number.isFinite(v) ? v : 80; }, set(v) { setInst({ autoPct: M.clamp(Math.round(v), 10, 100) }); }, step: 1, coarse: 10, fmt(v) { return Math.round(v) + '%'; } },
  };
  [0, 1].forEach(function (gi) {
    const n = gi + 1;
    PARAMS['g' + n + 'start'] = { label: 'G' + n + 'Start', gate: gi, get(ins) { return gateOf(gi, ins).start; }, set(v) { patchGate(gi, { start: M.clamp(v, 0, 1000), on: true }); }, step: 1, coarse: 10, fmt(v) { return M.fmt2(v); } };
    PARAMS['g' + n + 'width'] = { label: 'G' + n + 'Width', gate: gi, get(ins) { return gateOf(gi, ins).width; }, set(v) { patchGate(gi, { width: M.clamp(v, 1, 1000), on: true }); }, step: 1, coarse: 10, fmt(v) { return M.fmt2(v); } };
    PARAMS['g' + n + 'level'] = { label: 'G' + n + 'Level', gate: gi, get(ins) { return gateOf(gi, ins).level; }, set(v) { patchGate(gi, { level: M.clamp(Math.round(v), 1, 100), on: true }); }, step: 1, coarse: 10, fmt(v) { return Math.round(v) + '%'; } };
  });

  // ------------------------------------------------------------------ F3: the auto-cal thickness-entry wizard (drawn here, driven by 80)
  /** Live auto-cal wizard stage (1 thin | 2 thick | 0 idle) — mirrored into state by 80-modes. */
  function calStage() { const a = st().autocal; const s = a && +a.stage; return s === 1 || s === 2 ? s : 0; }
  /** The value of the on-LCD entry field (mm). */
  function calField() { const a = st().autocal || {}; const v = +a.field; return Number.isFinite(v) ? v : 0; }
  /** Field text: two decimals while above zero, a bare `0` at exactly zero (epoch_auto_calibration f006). */
  function calFieldText(v) { const f = Number.isFinite(v) ? v : 0; return f > 0 ? f.toFixed(2) : '0'; }
  /**
   * The three lines of the on-LCD entry box (SPEC-v3 §3.3, epoch_auto_calibration f009 / f020).
   * @param {number} [stage]  1 = thin standard, 2 = thick standard (default: the live stage)
   * @returns {{stage:number, title:string, value:string, confirm:string, text:string}|null} null while idle
   */
  function calText(stage) {
    const s = stage === undefined ? calStage() : stage;
    if (s !== 1 && s !== 2) return null;
    const title = s === 1 ? 'ENTER VALUE FOR THIN STANDARD' : 'ENTER VALUE FOR THICK STANDARD';
    const confirm = s === 1 ? 'AND THEN PRESS Calibration' : 'AND THEN PRESS ENTER';
    const value = calFieldText(calField());
    return { stage: s, title, value, confirm, text: title + '  ' + value + '  ' + confirm };
  }
  /** Write the entry field (through 80's state machine when it is loaded). Returns the stored value. */
  function setCalField(mm) {
    const v = M.clamp(Math.round((Number(mm) || 0) * 100) / 100, 0, 500);
    if (UT.modes && UT.modes.autoCal && typeof UT.modes.autoCal.setField === 'function') { UT.modes.autoCal.setField(v); return calField(); }
    UT.setIn('autocal', { field: v });
    return calField();
  }
  /** ▲▼ / wheel while the wizard is up: 0.10 mm per click, 1.00 mm with 2ND F or a coarse step. */
  function stepCalField(dir, coarse) {
    const step = (coarse || mem.secondF) ? 1 : 0.1;
    if (mem.secondF) setSecondF(false);
    mem.calType = '';
    setCalField(calField() + dir * step);
    return true;
  }
  /** Confirm the current wizard stage (CAL / ✓ / ENTER); falls back to the v2 `step()` when 80 is older. */
  function calConfirm() {
    const ac = UT.modes && UT.modes.autoCal;
    if (!ac) return null;
    mem.calType = '';
    if (typeof ac.confirm === 'function') return ac.confirm();
    if (typeof ac.step === 'function') return ac.step();
    return null;
  }
  /** Cancel the wizard (Esc / CANCEL softkey) — `instrument.cal` is left untouched by 80. */
  function calCancel() { const ac = UT.modes && UT.modes.autoCal; mem.calType = ''; if (ac && typeof ac.cancel === 'function') ac.cancel(); }
  /** Digits / '.' / Backspace typed into the field while the wizard is up. Returns true when consumed. */
  function calTypeKey(k) {
    if (!calStage()) return false;
    if (k === 'Backspace') { mem.calType = mem.calType.slice(0, -1); setCalField(parseFloat(mem.calType) || 0); return true; }
    if (k === '.' && mem.calType.indexOf('.') < 0) { mem.calType = (mem.calType || '0') + '.'; return true; }
    if (/^[0-9]$/.test(k)) { const s = (mem.calType + k).slice(0, 6); if (!(parseFloat(s) > 500)) mem.calType = s; setCalField(parseFloat(mem.calType) || 0); return true; }
    return false;
  }

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
    if (!name && calStage()) return stepCalField(dir, coarse);   // F3: ▲▼ edit the on-LCD entry field
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
    if (calStage()) {   // F3: the rotary wheel edits the entry field while the wizard is up
      for (let i = 0; i < Math.abs(clicks); i++) stepCalField(dir, coarse);
      emitUi('wheel', 'calField');
      return calField();
    }
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
    escape() { if (mem.secondF) { setSecondF(false); return; } if (calStage()) { calCancel(); return; } if (mem.subPage) { mem.subPage = null; rebuildSoftkeys(); return; } if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.cancel) UT.modes.autoCal.cancel(); },
    /** ✓ / ENTER — stage-2 confirm of the F3 wizard (v2: the generic next step). */
    enter() { if (calStage()) { calConfirm(); setSecondF(false); return; } if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.step && UT.modes.autoCal.state && UT.modes.autoCal.state()) UT.modes.autoCal.step(); setSecondF(false); },
    up() { adjust(null, +1, false); },
    down() { adjust(null, -1, false); },
    left() { adjust(null, -1, true); },
    right() { adjust(null, +1, true); },
    nextGroup() { mem.subPage = null; setInst({ page: (inst().page % 5) + 1 }); },
    /** CAL / Auto Cal: starts the wizard, and confirms the THIN stage while it is up (F3). */
    autoCal() {
      if (calStage() === 1) { calConfirm(); return; }
      if (calStage() === 2) { UT.status({ right: t('Auto Cal 2/2: press ENTER to confirm the thick standard') }); return; }
      if (UT.modes && UT.modes.autoCal && UT.modes.autoCal.start) UT.modes.autoCal.start(); else UT.status({ right: 'Auto Cal is not available' });
    },
    /**
     * F3 softkey CAL THIN: stage 1 confirms the thin standard, stage 2 goes BACK and re-enters it (the wizard is
     * restarted on the same standards — `instrument.cal` is untouched either way), idle starts the wizard.
     */
    calThin() {
      const s = calStage();
      const ac = UT.modes && UT.modes.autoCal;
      if (s === 1) { calConfirm(); return; }
      if (s === 2) {
        if (!(ac && typeof ac.start === 'function')) return;
        const a = st().autocal || {};
        mem.calType = '';
        ac.start({ d1: +a.d1, d2: +a.d2 });
        UT.status({ right: t('Auto Cal 1/2: enter the thin standard again') });
        return;
      }
      if (ac && typeof ac.start === 'function') ac.start();
    },
    /** F3 softkey CAL THICK: stage 2 confirms the thick standard; at stage 1 it captures the thin one and moves on. */
    calThick() { if (calStage()) calConfirm(); },
    calCancel() { calCancel(); },
    /** F1: power the set on / off — the window, panel and softkeys stay, only the trace goes (§3.1). */
    power(on) { power(on === undefined ? !(inst().powered !== false) : !!on); },
    /** F5: a quick-range softkey (P1…P7 / F1…F4) applies its preset. */
    quickRange(mm) { setInst({ range: M.clamp(+mm || 100, 10, 1000), selectedParam: 'range' }); },
    /** F5: Trig ▸ CSC — curved-surface correction of the SD / DP readouts for `trig.diameter`. */
    csc() { setInst({ trig: Object.assign({}, inst().trig, { csc: !cscOn() }) }); },
    /** F5: Gate ▸ Status — turn the gate on / off. */
    gateStatus(gi) { patchGate(gi, { on: !gateOf(gi).on }); },
    record() { if (UT.modes && UT.modes.dac && UT.modes.dac.record) UT.modes.dac.record(); else UT.status({ right: 'DAC record is not available' }); },
    erase() { if (UT.modes && UT.modes.dac && UT.modes.dac.erase) UT.modes.dac.erase(); else setInst({ dac: { points: [], on: false, refDb: null, curves: inst().dac.curves } }); handDac(null); },
    curve() { setInst({ dac: Object.assign({}, inst().dac, { on: !inst().dac.on }) }); },
    /** Draw Curves — the interpolated −6/−14 dB curves; clears any hand-drawn DAC (F40). */
    draw() { if (UT.modes && UT.modes.dac && UT.modes.dac.curves) UT.modes.dac.curves(); else setInst({ dac: Object.assign({}, inst().dac, { curves: !inst().dac.curves }) }); handDac(null); },
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

  // ------------------------------------------------------------------ v3 public actions (F1 power, F5 CSC, F7 UnCalibrate / records, F40 hand DAC)
  /** True while the set is powered (the F1 default is on; an absent key counts as on). */
  function powered(ins) { return (ins || inst()).powered !== false; }
  /**
   * F1: power the set on / off. `instrument.powered === false` blanks the trace and the gate / DAC overlays; the
   * window, panel, knobs and softkeys stay mounted and the physics keeps running (`frame.ascan` is untouched).
   * @param {boolean} [on]  omit to toggle
   * @returns {boolean} the new powered state
   */
  function power(on) {
    const want = on === undefined ? !powered() : !!on;
    setInst({ powered: want });
    emitUi('softkey', want ? 'ON' : 'OFF');
    UT.status({ right: want ? t('Instrument switched on') : t('Instrument switched off — the trace is blanked; press OFF again to switch it back on') });
    return want;
  }
  /** F5: whether the curved-surface correction is active on the instrument readouts. */
  function cscOn(ins) { const tr = (ins || inst()).trig || {}; return !!tr.csc; }
  /**
   * F5: curved-surface correction of a readout pair for `trig.diameter` (law of cosines from the pipe centre).
   * Display-only — `frame.readouts` (40-ascan) is never rewritten.
   * @param {{path:number, sd:number, dp:number}} p  the primary readout
   * @param {object} [ins]  instrument (default: state) — lets the self-test evaluate a local copy
   * @returns {{sd:number, dp:number}} corrected surface distance and depth (mm)
   */
  function cscCorrect(p, ins) {
    const I = ins || inst();
    const S = Number(p && p.path);
    const dia = PARAMS.trigDiameter.get(I);
    const ang = M.deg2rad((I.trig && I.trig.angle) || 0);
    const R = dia / 2;
    if (!(S > 0) || !(R > 0)) return { sd: p && p.sd, dp: p && p.dp };
    const r2 = R * R + S * S - 2 * R * S * Math.cos(ang);
    const r = Math.sqrt(Math.max(0, r2));
    const dp = M.clamp(R - r, 0, 2 * R);
    const s = r > 0 ? M.clamp(S * Math.sin(ang) / r, -1, 1) : 0;
    return { sd: R * Math.asin(s), dp };
  }
  /** Readout pair for the instrument screens: the frame's own numbers, curved-surface corrected while CSC is On. */
  function readPair(p, ins) {
    if (!p) return { sd: null, dp: null };
    if (!cscOn(ins)) return { sd: p.sd, dp: p.dp };
    return cscCorrect(p, ins);
  }
  /**
   * F7 `Options ▸ UnCalibrate`: knock the set out of calibration (a wrong velocity in the step-wedge family and a
   * wrong zero) so the trainee has to recalibrate. Gain, range and gates are untouched.
   * @returns {{vel:number, zero:number}} the wrong calibration now in `instrument.cal`
   */
  function unCalibrate() {
    const rnd = M.rng((Date.now() & 0xffff) || 1);
    let vel = 5.60 + 0.6 * (rnd() - 0.5);
    const zero = Math.round((0.4 + 0.4 * (rnd() - 0.5)) * 100) / 100;
    // stay visibly out of calibration: ≥ 0.12 mm/µs from the true velocity is ≥ 0.4 mm at a 20 mm backwall
    let vTrue = 5.90;
    try { const d = derived(); if (d && Number.isFinite(d.vel) && d.vel > 0) vTrue = d.vel; } catch (e) { /* keep 5.90 */ }
    if (Math.abs(vel - vTrue) < 0.12) vel = vel <= vTrue ? Math.max(5.30, vTrue - 0.2) : Math.min(5.89, vTrue + 0.2);
    vel = M.clamp(Math.round(vel * 100) / 100, 5.30, 5.89);
    setInst({ cal: { vel, zero: M.clamp(zero, 0.20, 0.60) } });
    UT.status({ right: t('The set is out of calibration — recalibrate on V1, V2 or the step wedge') });
    return { vel, zero: M.clamp(zero, 0.20, 0.60) };
  }
  /**
   * F7 `Options ▸ Delete EPOCH records`: clear the stored setups / datalog after a confirmation.
   * The empty entry list is written into `instrument.datalog` through `datalogClear()`, the datalogger window is
   * refreshed and `status.right` reports the deletion. SPEC-v3 §3.7 puts a `UT.dom.confirm` in front of it, so a
   * bare call deletes NOTHING until that dialog is answered; non-interactive callers (automation, a build without a
   * dialog layer) pass `{confirm: false}` to clear straight away.
   * @param {{confirm?: boolean}} [opts] `{confirm: false}` skips the dialog and clears synchronously
   * @returns {Promise<number|false>} the number of records removed, or false when the confirmation was cancelled
   */
  function deleteRecords(opts) {
    const done = function () {
      const n = datalogClear();
      refreshDatalogWindow(true);
      UT.status({ right: t('EPOCH records deleted') });
      return n;
    };
    const ask = !(opts && opts.confirm === false) && UT.dom && typeof UT.dom.confirm === 'function' && typeof document !== 'undefined';
    if (!ask) return Promise.resolve(done());
    if (mem.deletePending) return mem.deletePending;      // one dialog at a time (a second menu click re-uses it)
    let dlg = null;
    try { dlg = UT.dom.confirm(t('Delete all stored records?'), { title: 'Delete EPOCH records' }); } catch (e) { dlg = null; }
    if (!dlg || typeof dlg.then !== 'function') return Promise.resolve(done());   // no usable dialog → still delete
    const p = dlg.then(function (ok) { mem.deletePending = null; return ok ? done() : false; },
      function () { mem.deletePending = null; return done(); });
    mem.deletePending = p;
    return p;
  }
  /**
   * F40: set / clear the hand-drawn DAC polyline (`instrument.dac.hand` = [{xDiv, pct}]).
   * @param {Array<{xDiv:number, pct:number}>|null} pts
   * @returns {number} the number of points stored
   */
  function handDac(pts) {
    const cur = inst().dac || {};
    const list = Array.isArray(pts) && pts.length >= 2 ? pts : null;
    if (!list && !cur.hand) return 0;
    setInst({ dac: Object.assign({}, cur, { hand: list }) });
    return list ? list.length : 0;
  }

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
    // v3 F5: CSC is functional (Off | On) and Diameter feeds the curved-surface correction
    'Trig': function (ins) { return [pk('Angle', 'trigAngle'), pk('Thick', 'trigThick'), act('X Value', null, ins.trig.xValue.toFixed(1)), act('CSC', keys.csc, cscOn(ins) ? 'On' : 'Off'), pk('Diameter', 'trigDiameter')]; },
    'Gate1': function (ins) { return gatePage(0, ins); },
    'Gate2': function (ins) { return gatePage(1, ins); },
    'Gate Setup': function (ins) { return [act('Mode', keys.gateMode, mem.gateMode), act('Measure', keys.measure, ins.readout === 'sp' ? 'SP' : 'Depth'), pk('AUTO %', 'autoPct')]; },
    'DAC Setup': function (ins) { return [act('DAC', keys.curve, ins.dac.on ? 'On' : 'Off'), act('Ref dB', null, ins.dac.refDb === null || ins.dac.refDb === undefined ? '--' : fmtGain(ins.dac.refDb)), act('Points', null, String(ins.dac.points.length)), act('Curves', keys.draw, ins.dac.curves ? 'On' : 'Off'), act('TCG', keys.tcg, tcgLabel(ins))]; },
  };
  /** Gate 1 / Gate 2 sub-page — v3 F5 adds the `Status` cell (gate on / off). */
  function gatePage(gi, ins) { const n = gi + 1; return [act('Zoom', null, 'Off'), pk('Start', 'g' + n + 'start'), pk('Width', 'g' + n + 'width'), pk('Level', 'g' + n + 'level'), act('Alarm', function () { keys.alarm(gi); }, gateOf(gi, ins).alarm ? 'On' : 'Off'), act('Status', function () { keys.gateStatus(gi); }, gateOf(gi, ins).on ? 'On' : 'Off')]; }
  function rectLabel(ins) { const r = (ins || inst()).rectify; return r === 'rf' ? 'RF' : r === 'half+' ? 'Half+' : r === 'half-' ? 'Half−' : 'Full'; }
  /** TCG softkey value: Off | On (active) | On* (on but fewer than 2 DAC points → no effect). */
  function tcgLabel(ins) { const I = ins || inst(); if (!(I.tcg && I.tcg.on)) return 'Off'; return tcgActive(I) ? 'On' : 'On*'; }
  /**
   * F3: the softkey column while the auto-cal thickness wizard is up (SPEC-v3 §3.3, epoch_auto_calibration
   * f036 / f044) — `CAL THIN | CAL THICK | CANCEL` on F1–F3.  The page is ALWAYS one slot per hardware F key
   * (`FKEYS`) with no header row, and `rebuildSoftkeys()` suppresses the gate thumbnail while it is drawn, so
   * slot n is the row level with F(n + 1): the legend a trainee reads beside a key is the action that key runs.
   * @param {number} [stage]  1 = thin, 2 = thick (default: the live wizard stage) — an argument so the selftest is pure
   * @returns {Array<object>} the five softkey slots (three actions, then blanks)
   */
  function CAL_PAGE(stage) {
    const s = stage === undefined ? calStage() : stage;
    const page = [
      act('CAL THIN', keys.calThin, s === 1 ? '<' : ''),
      act('CAL THICK', keys.calThick, s === 2 ? '<' : ''),
      act('CANCEL', keys.calCancel),
    ];
    while (page.length < FKEYS.length) page.push(blank());
    return page;
  }
  function pk(label, param) { return { kind: 'param', label, param }; }
  function sub(label) { return { kind: 'sub', label }; }
  function act(label, fn, value) { return { kind: 'act', label, fn, value }; }
  function hdr(label) { return { kind: 'hdr', label }; }
  /** An empty softkey row: drawn, never pressed — it keeps slot n level with F(n + 1) (v3 QA r3). */
  function blank() { return { kind: 'blank', label: '' }; }
  /**
   * Softkey items for a page / sub-page (exported for tests).  Pure: reads `ins` (default `state.instrument`)
   * and `subPage` (default the live `mem.subPage`; pass `null` for the top level) without touching state.
   */
  function softkeyItems(ins, subPage) {
    ins = ins || inst();
    const sp = subPage === undefined ? mem.subPage : subPage;
    // v3 F3: while the thickness-entry wizard is up the column becomes CAL THIN | CAL THICK | CANCEL
    if (subPage === undefined && calStage()) return CAL_PAGE();
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
  /**
   * Tooltip / screen-reader texts of the hard keys (SPEC-v2 §5.7: every control is labelled), keyed by the 'ui' id
   * (`uiId || label`). English KEYS — translated at render time by t() and re-applied on 'lang' (relabelTips).
   */
  const TIPS = {
    'dB': 'Gain — select the gain (2ND F + dB = store / release the reference gain)',
    'SAVE': 'Save the current readouts to the datalogger',
    'up': 'Step the selected parameter up (gain +0.5 dB; 2ND F + ▲ = +6 dB)',
    'down': 'Step the selected parameter down (gain −0.5 dB; 2ND F + ▼ = −6 dB)',
    'left': 'Coarse step down (gain −6 dB)',
    'right': 'Coarse step up (gain +6 dB)',
    'enter': 'Enter — confirm (next Auto Cal step)',
    'freeze': 'Freeze the A-scan (2ND F + ❄ = Compare snapshot)',
    'escape': 'Back — leave the sub-page, cancel 2ND F / Auto Cal',
    'GATES': 'Gates — select gate 1 / 2 and open its page (2ND F + GATES = AUTO {pct} %)',
    'RANGE': 'Range 50 → 100 → 200 → 400 mm (2ND F + RANGE = backwards)',
    '2ND F': 'Second function — latch, then press dB, GATES, ❄, RANGE or ▲▼',
    'PEAK MEM': 'Peak memory on / off',
    'power': 'Power (decorative LED)',
    'NEXT GROUP': 'Next softkey page',
    'P': 'Softkey page {n}',
    'F': 'Press softkey {n} of the current column',
    // EPOCH 4 keypad
    'GATE 1': 'Gate 1 — select gate 1 (start)', 'GATE 2': 'Gate 2 — select gate 2 (start)',
    'PULSER': 'Pulser — damping on / off (2ND F + PULSER = receiver filter)', 'DISPLAY': 'Display — cycle the rectification',
    'DEPTH %AMP': 'Big readout: depth ↔ amplitude %', 'CAL': 'Auto Cal — two-point velocity / zero calibration',
    'ZERO OFFSET': 'Select the zero offset', 'RANGE-e4': 'Select the range (2ND F + RANGE = 50 → 100 → 200 → 400 mm)',
    'VEL': 'Select the velocity', 'ANGLE': 'Select the probe angle (2ND F + ANGLE = thickness)',
    'OPTION': 'Option (no function)', 'ID': 'ID (no function)', 'ON/OFF': 'Power (decorative LED)',
    // USK 7
    'ERASE DAC': 'Erase the DAC curve', 'Show USK 7': 'Re-open the USK 7 window',   // F1: 'OFF' is a power key — its tip is TIPS.ON
    'knob-': 'Turn {k} down', 'knob+': 'Turn {k} up',
    // v3
    'ON': 'Switch the set on / off (the trace is blanked while it is off)',
    'P-range': 'Set the range to {r} mm', 'F-range': 'Set the range to {r} mm',
    'knob10-': 'Turn {k} down ×10', 'knob10+': 'Turn {k} up ×10',
    'AMP': 'AMP — receiver gain (drag or wheel: ±0.5 dB, Shift ×10)',
    'CAL THIN': 'Confirm the thin-standard value', 'CAL THICK': 'Confirm the thick-standard value', 'CANCEL': 'Cancel the calibration',
  };
  /**
   * F6: the upper-case short form echoed into the status bar's middle cell on hover / focus, keyed by the same ui id
   * as TIPS. Instrument legends stay English (F6), so these are NOT translated.
   */
  const SHORTS = {
    'dB': 'GAIN', 'SAVE': 'SAVE', 'up': 'ARROW RIGHT/UP', 'down': 'ARROW LEFT/DOWN', 'left': 'ARROW LEFT/DOWN', 'right': 'ARROW RIGHT/UP',
    'enter': 'ENTER', 'freeze': 'FREEZE', 'escape': 'ESCAPE', 'GATES': 'GATES', 'RANGE': 'RANGE', '2ND F': '2ND F',
    'PEAK MEM': 'PEAK MEM', 'power': 'ON/OFF', 'ON': 'ON/OFF', 'NEXT GROUP': 'NEXT GROUP',
    'GATE 1': 'GATE 1', 'GATE 2': 'GATE 2', 'PULSER': 'PULSAR', 'DISPLAY': 'DISPLAY', 'DEPTH %AMP': 'DEPTH / %AMP',
    'CAL': 'CALIBRATE', 'ZERO OFFSET': 'ZERO OFFSET', 'RANGE-e4': 'RANGE', 'VEL': 'VELOCITY', 'ANGLE': 'ANGLE',
    'OPTION': 'OPTION', 'ID': 'ID', 'ON/OFF': 'ON/OFF', 'ERASE DAC': 'ERASE DAC', 'OFF': 'ON/OFF',
    'CAL THIN': 'CAL THIN', 'CAL THICK': 'CAL THICK', 'CANCEL': 'CANCEL',
  };
  /** Short form for a ui id (P{n} / F{n} share one entry). */
  function shortOf(uiId) {
    if (!uiId) return '';
    if (SHORTS[uiId]) return SHORTS[uiId];
    if (/^P[1-7]$/.test(uiId)) return 'NEXT GROUP';
    if (/^F[1-5]$/.test(uiId)) return 'SOFTKEY ' + uiId;
    return '';
  }
  /** The mid-cell templates 90-app formats the depth into (F23) — the ONE cell a key hint takes over (F6). */
  const DEPTH_KEYS = ['Depth = {d}mm', 'Depth = {d}in', 'Depth: {d}'];
  /**
   * True when a status mid cell is a `Depth = …` cell, in ANY language: each template is rendered with a
   * sentinel in place of the number and the cell is matched against the text around it (the English form is
   * also matched directly, for a build without the i18n dictionary).
   * @param {string} seg one status mid cell
   * @returns {boolean}
   */
  function isDepthCell(seg) {
    const s = String(seg || '');
    if (!s) return false;
    if (/^Depth\s*[:=]/.test(s)) return true;
    for (let i = 0; i < DEPTH_KEYS.length; i++) {
      const parts = t(DEPTH_KEYS[i], { d: '\u0001' }).split('\u0001');
      if (parts.length !== 2) continue;
      const pre = parts[0], post = parts[1];
      if (!pre) continue;
      if (s.indexOf(pre) === 0 && (!post || s.slice(-post.length) === post)) return true;
    }
    return false;
  }
  /**
   * F6: the cells the hint keeps beside it — the normal mid line minus its trailing Depth cell.
   * @param {string} line the joined mid line
   * @returns {string[]} the surviving cells (Pos / Range / AMP / mode extras)
   */
  function hintCells(line) {
    const segs = String(line || '').split(' | ').filter(Boolean);
    while (segs.length && isDepthCell(segs[segs.length - 1])) segs.pop();
    return segs;
  }
  /**
   * F6: write the armed hint out — `status.mid` is the bare short form (§3.6), while `status.segments`
   * carries the cells 90-app paints, so Pos / Range / AMP survive beside it and only the Depth cell goes.
   */
  function applyHint() {
    if (mem.midShown === null) return;
    const cells = hintCells(mem.midSaved);
    cells.push(mem.midShown);
    mem.hintWriting = true;
    try { UT.status({ mid: mem.midShown, segments: cells }); } finally { mem.hintWriting = false; }
  }
  /** F6: echo a key's short function into the status bar's middle cell, remembering the line it replaced. */
  function hintOn(text) {
    if (!text) return;
    const cur = (st().status && st().status.mid) || '';
    if (mem.midShown === null) mem.midSaved = cur;
    mem.midShown = text;
    applyHint();
  }
  /** F6: put the normal mid line back (90 only rewrites it when ITS computed line changes). */
  function hintOff() {
    if (mem.midShown === null) return;
    const back = mem.midSaved || '';
    mem.midShown = null; mem.midSaved = null;
    mem.hintWriting = true;
    try { UT.status({ mid: back, segments: null }); } finally { mem.hintWriting = false; }
    UT.requestRender();
  }
  /**
   * F6: 90-app rebuilt the mid line while a hint is armed — keep the remembered line fresh and repaint the
   * hint over the new cells, so neither the hint nor the restore ever shows a stale Pos / Range / AMP.
   * @param {object} status state.status as emitted on the 'status' bus event
   */
  function onStatus(status) {
    if (mem.hintWriting || mem.midShown === null) return;
    const mid = (status && status.mid) || '';
    if (mid === mem.midShown) return;
    mem.midSaved = mid;
    applyHint();
  }
  /** Set title + aria-label from an i18n key (+ params) and remember the key on the element for relabelTips(). */
  function tip(el, key, params, uiId) {
    if (!el || !key) return el;
    el.dataset.tip = key;
    if (params) el.dataset.tipParams = JSON.stringify(params); else delete el.dataset.tipParams;
    const s = t(key, params);
    el.setAttribute('title', s); el.setAttribute('aria-label', s);
    // F6: hovering / focusing a key echoes its function into the status bar's middle cell
    const short = shortOf(uiId);
    if (short && !el.dataset.short) {
      el.dataset.short = short;
      el.addEventListener('mouseenter', function () { hintOn(el.dataset.short); });
      el.addEventListener('mouseleave', hintOff);
      el.addEventListener('focus', function () { hintOn(el.dataset.short); });
      el.addEventListener('blur', hintOff);
    } else if (short) el.dataset.short = short;
    return el;
  }
  /** Re-apply every [data-tip] title / aria-label of the mounted skins (on 'lang' and when autoPct changes). */
  function relabelTips() {
    const roots = [];
    if (mem.container) roots.push(mem.container);
    if (mem.uskWin && mem.uskWin.el) roots.push(mem.uskWin.el);
    roots.forEach(function (root) {
      const els = root.querySelectorAll('[data-tip]');
      for (let i = 0; i < els.length; i++) {
        let params = null;
        try { params = els[i].dataset.tipParams ? JSON.parse(els[i].dataset.tipParams) : null; } catch (e) { params = null; }
        if (els[i].dataset.tip === TIPS.GATES) params = { pct: PARAMS.autoPct.get() };
        tip(els[i], els[i].dataset.tip, params);
      }
    });
  }
  /**
   * Hard key button: product legend (no i18n), takes the instrument focus, emits 'ui' softkey {id: uiId || label}.
   * Carries a translated title / aria-label: `attrs.tip` (+ `attrs.tipParams`) or TIPS[uiId || label] (§5.7).
   */
  function key(label, onClick, cls, attrs, uiId) {
    const a = Object.assign({}, attrs || {});
    const tk = a.tip || TIPS[uiId || label]; let tp = a.tipParams || null; delete a.tip; delete a.tipParams;
    if (tk === TIPS.GATES) tp = { pct: PARAMS.autoPct.get() };
    const el = h('button', Object.assign({ class: 'ik no-i18n ' + (cls || ''), type: 'button', onclick: function (e) { e.preventDefault(); mem.focused = true; flashKey(el); emitUi('softkey', uiId || label); onClick && onClick(e); } }, a), label);
    return tip(el, tk, tp, uiId || label);
  }
  /** F5: light a pressed P / F key for 200 ms (`.pressed`, the original's lit key in how_to_use_the_epoch). */
  function flashKey(el) {
    if (!el || !el.classList || !/\bik-f\b|\bik-p\b|\be4-f\b|\bltc-f\b/.test(el.className)) return;
    el.classList.add('pressed');
    setTimeout(function () { if (el.classList) el.classList.remove('pressed'); }, 200);
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
      return g === null ? h('span', { class: 'e6-bcell' }) : tip(h('button', { class: 'e6-bcell', type: 'button', onclick: function () { mem.focused = true; emitUi('softkey', 'db-' + g); keys.setGain(g); } }, g.toFixed(1) + 'dB'), 'Set the gain to {g} dB', { g: g.toFixed(1) });
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
      h('div', { class: 'e6-top no-i18n' }, [h('span', { class: 'e6-leds' }, R.leds), h('span', { class: 'e6-olympus' }, 'OLYMPUS'), key('⏻', function () { keys.power(); mem.ledOn = powered(); R.leds[0].classList.toggle('on', mem.ledOn); }, 'ik-power', null, 'power')]),
      screen,
      // F5: while `range` is the selected parameter the P row becomes the quick-range presets of §3.5
      h('div', { class: 'e6-prow no-i18n' }, (R.pkeys = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map(function (p, i) {
        return key(p, function () {
          if (inst().selectedParam === 'range') { keys.quickRange(QUICK_RANGES[i]); rebuildSoftkeys(); return; }
          const n = i + 1; mem.subPage = null; if (n <= 5) setInst({ page: n }); rebuildSoftkeys();
        }, 'ik-p', { tip: TIPS.P, tipParams: { n: String(i + 1) } });
      }))),
    ]);
    const right = h('div', { class: 'e6-right no-i18n' }, [key('NEXT GROUP', keys.nextGroup, 'ik-next'), h('div', { class: 'e6-fkeys' }, FKEYS.map(function (f, i) { return key(f, function () { softkeyPress(i); }, 'ik-f', { tip: TIPS.F, tipParams: { n: i + 1 } }); }))]);
    const body = h('div', { class: 'skin skin-epoch600' + (mem.touch ? ' touch' : '') }, [leftPad, centre, right]);
    container.appendChild(body);
    rebuildSoftkeys();
  }
  /**
   * The softkey item hardware key F(i + 1) addresses.  While the F3 wizard is up the CAL page owns every drawn
   * row, so the key presses ITS OWN row (v3 QA r3); otherwise the historic mapping is kept (header cells filtered
   * out, a sub-page's title row skipped).
   * @param {number} i  0-based F key (F1 → 0)
   * @param {number} [stage]  wizard-stage override (selftest); default the live stage
   * @returns {object|null} the item, or null when the key faces a blank row
   */
  function fkeyItem(i, stage) {
    const s = stage === undefined ? calStage() : stage;
    if (s) { const c = CAL_PAGE(s)[i]; return c && c.kind !== 'blank' ? c : null; }
    const items = softkeyItems().filter(function (it) { return it.kind !== 'hdr'; });
    return items[i + (mem.subPage ? 1 : 0)] || null;
  }
  /** Press the i-th softkey of the current column (F1–F5 map to the drawn rows). */
  function softkeyPress(i) { const it = fkeyItem(i); if (it) softkeyAction(it); }
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
  /** Key identifying the softkey column's current content (page, sub-page and the F3 wizard stage). */
  function pageKey() { return inst().page + '|' + (mem.subPage || '') + '|c' + calStage(); }
  function rebuildSoftkeys() {
    const col = mem.refs.softCol; if (!col) return;
    col.dataset.page = pageKey();
    col.textContent = '';
    const items = softkeyItems();
    const sel = inst().selectedParam;
    // v3 QA r3: while the CAL page is up the five slots ARE the five F keys — no gate thumbnail between them
    const wiz = !!calStage();
    col.classList.toggle('cal', wiz);   // lay the five rows out ON the physical F keys (CSS `.e6-soft.cal`)
    const iconRow = function () { return h('div', { class: 'e6-icon' }, [miniIcon(), h('span', { class: 'e6-icon1 no-i18n' }, '1'), h('div', { class: 'e6-legs no-i18n' }, mem.refs.legs)]); };
    items.forEach(function (it, idx) {
      if (it.kind === 'blank') { col.appendChild(h('div', { class: 'e6-sk blank' })); return; }
      const cell = h('div', { class: 'e6-sk' + (it.kind === 'param' && it.param === sel ? ' sel' : '') + (it.kind === 'hdr' || it.kind === 'back' ? ' hdr' : '') + (it.kind === 'sub' ? ' sub' : ''), dataset: { sk: it.label }, role: 'button', tabindex: '0', 'aria-label': t(it.label) });
      // all-caps legends (the F3 CAL THIN | CAL THICK | CANCEL page) are product key legends: never translated (F6)
      cell.appendChild(/^[A-Z0-9 ]{4,}$/.test(it.label) ? h('span', { class: 'e6-skl no-i18n' }, it.label) : tx('span', 'e6-skl', it.label));
      if (it.kind === 'param') cell.appendChild(h('span', { class: 'e6-skv no-i18n' + (it.param === 'gain' && refLocked() ? ' ref' : ''), dataset: { param: it.param } }, valueOf(it.param)));
      else if (it.kind === 'act' && it.value !== undefined) cell.appendChild(h('span', { class: 'e6-skv no-i18n' }, it.value));
      cell.addEventListener('click', function () { softkeyAction(it); });
      cell.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); softkeyAction(it); } });
      if (it.kind === 'param') attachValueDrag(cell, it.param);
      col.appendChild(cell);
      if (!wiz && idx === 2) col.appendChild(iconRow());
    });
    if (!wiz && items.length < 3) col.appendChild(iconRow());
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
    const rp = readPair(p);   // F5: curved-surface corrected while Trig ▸ CSC is On
    setText(R.readSP, p ? fmtRead(Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : '--.--'); setText(R.readSD, p ? fmtRead(rp.sd) : '--.--'); setText(R.readDP, p ? fmtRead(rp.dp) : '--.--');
    setText(R.readAmp, p ? Math.min(999, Math.round(p.peakPct)) + '%' : '0%');
    const which = inst().readout || 'dp';
    const icons = { sp: '▶', sd: '⇒', dp: '↓', amp: '%' };
    setText(R.bigIcon, gi + (icons[which] || '↓'));
    let big = '--.--', unit = unitLabel();
    if (p) { if (which === 'amp') { big = Math.min(999, Math.round(p.peakPct)); unit = '%'; } else big = fmtRead(which === 'sp' ? (Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : which === 'sd' ? rp.sd : rp.dp); }
    setText(R.big, String(big)); setText(R.bigUnit, unit);
    [R.boxSP, R.boxSD, R.boxDP, R.boxAmp].forEach(function (b) { b.classList.toggle('sel', b.dataset.ro === which); });
    const leg = p && p.leg ? p.leg : 1;
    R.legs.forEach(function (el, i) { el.classList.toggle('on', i + 1 === Math.min(3, leg)); });
    setText(R.pageInd, inst().page + '/5');
    // softkey values / selection (cheap in-place refresh; rebuild when the page changed)
    const col = R.softCol;
    if (col.dataset.page !== pageKey()) { col.dataset.page = pageKey(); rebuildSoftkeys(); }
    const sel = inst().selectedParam;
    Array.prototype.forEach.call(col.querySelectorAll('.e6-sk'), function (cell) {
      const v = cell.querySelector('.e6-skv[data-param]');
      if (v) { setText(v, valueOf(v.dataset.param)); cell.classList.toggle('sel', v.dataset.param === sel); if (v.dataset.param === 'gain') v.classList.toggle('ref', refLocked()); }
    });
    if (R.refCap) R.refCap.classList.toggle('lit', refLocked());
    if (R.autoCap) {
      setText(R.autoCap, 'AUTO ' + PARAMS.autoPct.get() + '%'); R.autoCap.classList.toggle('lit', mem.secondF);
      if (mem.tipPct !== PARAMS.autoPct.get()) { mem.tipPct = PARAMS.autoPct.get(); relabelTips(); }
    }
    R.leds[1].classList.toggle('on', !!inst().freeze); R.leds[2].classList.toggle('on', !!inst().peakMem);
    R.leds[0].classList.toggle('on', powered() && mem.ledOn);
    relabelPRow();
    drawMiniIcon(frame);
  }
  /**
   * F5: the labels the P row is showing (pure) — the quick-range presets while `range` is selected, `P1…P7` else.
   * @param {object} [ins]
   * @returns {string[]} seven labels
   */
  function pRowLabels(ins) {
    const ranged = (ins || inst()).selectedParam === 'range';
    return QUICK_RANGES.map(function (r, i) { return ranged ? r.toFixed(1) : 'P' + (i + 1); });
  }
  /**
   * F5: write `pRowLabels()` onto the physical P1…P7 keys and re-point their tooltips — quick-range presets
   * (`10.0`…`500.0`) while `range` is selected, the product legends otherwise.
   */
  function relabelPRow() {
    const row = mem.refs.pkeys; if (!row) return;
    const ranged = inst().selectedParam === 'range';
    row.forEach(function (b, i) {
      const label = ranged ? QUICK_RANGES[i].toFixed(1) : 'P' + (i + 1);
      setText(b, label);
      b.classList.toggle('ranged', ranged);
      if (ranged) tip(b, TIPS['P-range'], { r: QUICK_RANGES[i].toFixed(1) }, 'P' + (i + 1));
      else tip(b, TIPS.P, { n: String(i + 1) }, 'P' + (i + 1));
    });
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
      // F5: the row carries the gate softkeys, or the quick-range presets `10.0mm … 100.0mm` of f028 while `range` is selected
      h('div', { class: 'e4-soft' }, [
        h('span', { class: 'e4-sk', dataset: { sk: 'START' }, onclick: function () { mem.focused = true; if (rangeRow(0)) return; selectParam('g' + (inst().activeGate + 1) + 'start'); } }, '1-START'),
        h('span', { class: 'e4-sk', dataset: { sk: 'WIDTH' }, onclick: function () { mem.focused = true; if (rangeRow(1)) return; selectParam('g' + (inst().activeGate + 1) + 'width'); } }, '1-WIDTH'),
        h('span', { class: 'e4-sk', dataset: { sk: 'LEVEL' }, onclick: function () { mem.focused = true; if (rangeRow(2)) return; selectParam('g' + (inst().activeGate + 1) + 'level'); } }, '1-LEVEL'),
        h('span', { class: 'e4-sk', onclick: function () { mem.focused = true; rangeRow(3); } }, ''),
        h('span', { class: 'e4-sk', dataset: { sk: 'AUTO-80' }, onclick: function () { mem.focused = true; emitUi('softkey', 'AUTO-80'); keys.auto80(); } }, 'AUTO-80'),
      ]),
    ]);
    screen.classList.add('no-i18n');
    R.softLabels = Array.prototype.slice.call(screen.querySelectorAll('.e4-sk'));
    R.secondF = key('2ND F', keys.secondF, 'e4k grey e4-2f');
    const kp = function (label, fn, cls, cap, uiId, tipKey) { return h('div', { class: 'e4-kc' }, [h('span', { class: 'e4-cap' }, cap || ' '), key(label, fn, 'e4k ' + cls, tipKey ? { tip: tipKey } : null, uiId)]); };
    const keypad = h('div', { class: 'e4-keypad no-i18n' }, [
      h('div', { class: 'e4-padwrap' }, [h('span', { class: 'e4-cap' }, 'REF'), h('div', { class: 'e4-pad' }, [
        key('GAIN', keys.dB, 'e4k green', null, 'dB'), key('▲', keys.up, 'e4k green', null, 'up'), key('SAVE THICK', keys.save, 'e4k green', null, 'SAVE'),
        key('◀', keys.left, 'e4k green', null, 'left'), key('ENTER', keys.enter, 'e4k green', null, 'enter'), key('▶', keys.right, 'e4k green', null, 'right'),
        key('FREEZE', keys.freeze, 'e4k green', null, 'freeze'), key('▼', keys.down, 'e4k green', null, 'down'), key('SAVE WAVE', keys.save, 'e4k green', null, 'SAVE'),
      ])]),
      h('div', { class: 'e4-grid' }, [
        kp('GATE 1', function () { setInst({ activeGate: 0, selectedParam: 'g1start' }); }, 'red', 'ALARM 1'), kp('PULSER', function () { if (mem.secondF) { setSecondF(false); keys.filter(); } else keys.damping(); }, 'orange', 'FILTER'), kp('DISPLAY', keys.rectify, 'orange', 'PRINT'),
        kp('GATE 2', function () { setInst({ activeGate: 1, selectedParam: 'g2start' }); if (!gateOf(1).on) patchGate(1, { on: true }); }, 'red', 'ALARM 2'), kp('PEAK MEM', keys.peakMem, 'red'), kp('DEPTH %AMP', function () { setInst({ readout: inst().readout === 'amp' ? 'dp' : 'amp' }); }, 'orange', 'ECHO-ECHO'),
        kp('CAL', keys.autoCal, 'yellow', 'CONTRAST'), kp('ZERO OFFSET', function () { selectParam('zero'); }, 'yellow', '# DIV'), kp('RANGE', function () { if (mem.secondF) keys.range(); else selectParam('range'); }, 'yellow', 'ZOOM', null, TIPS['RANGE-e4']),
        kp('VEL', function () { selectParam('velocity'); }, 'yellow', 'REJECT'), kp('ANGLE', function () { selectParam(mem.secondF ? 'trigThick' : 'trigAngle'); setSecondF(false); }, 'yellow', 'THICKNESS'), h('div', { class: 'e4-kc' }, [h('span', { class: 'e4-cap' }, ' '), R.secondF]),
        kp('OPTION', null, 'grey'), kp('ID', null, 'blue'), kp('ON/OFF', function () { keys.power(); mem.ledOn = powered(); }, 'green'),
      ]),
    ]);
    const body = h('div', { class: 'skin skin-epoch4' }, [
      h('div', { class: 'e4-bezel' }, [screen]),
      h('div', { class: 'e4-fkeys' }, ['F1', 'F2', 'F3', 'F4', 'F5'].map(function (f, i) { return key(f, function () { const lbl = R.softLabels[i]; if (lbl) lbl.click(); }, 'e4-f', { tip: TIPS.F, tipParams: { n: i + 1 } }); })),
      keypad,
      h('div', { class: 'e4-brand' }, 'EPOCH 4'),
    ]);
    container.appendChild(body);
  }
  function updateEpoch4(frame) {
    const R = mem.refs; if (!R.gain) return;
    const I = inst(); const ro = frame && frame.readouts; const p = ro && ro.primary; const d = (frame && frame.derived) || derived();
    setText(R.gain, 'GAIN ' + fmtGain(I.gain)); setText(R.rej, 'REJ ' + I.reject + ' %');
    const rp = readPair(p);   // F5: curved-surface corrected while Trig ▸ CSC is On
    setText(R.minDepth, 'MIN DEPTH ' + (p ? fmtRead(rp.dp) : '--.--'));
    setText(R.range, 'RANGE ' + I.range.toFixed(1));
    const which = I.readout || 'dp';
    const bigVal = !p ? '--.--' : which === 'amp' ? Math.min(999, Math.round(p.peakPct)) + ' %' : fmtRead(which === 'sp' ? (Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : which === 'sd' ? rp.sd : rp.dp) + ' ' + unitLabel();
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
    if (sel === 'range') {
      // F5 (f028): the softkey row becomes the quick-range presets
      QUICK_RANGES_E4.forEach(function (r, i) { setText(R.softLabels[i], r.toFixed(1) + 'mm'); R.softLabels[i].classList.toggle('sel', Math.abs(I.range - r) < 0.05); });
    } else {
      setText(R.softLabels[0], gn + '-START'); setText(R.softLabels[1], gn + '-WIDTH'); setText(R.softLabels[2], gn + '-LEVEL'); setText(R.softLabels[3], '');
      R.softLabels[0].classList.toggle('sel', sel === 'g' + gn + 'start'); R.softLabels[1].classList.toggle('sel', sel === 'g' + gn + 'width'); R.softLabels[2].classList.toggle('sel', sel === 'g' + gn + 'level');
      R.softLabels[3].classList.remove('sel');
    }
    drawMiniIcon(frame);
  }
  /** F5: a click on the EPOCH 4 / LTC softkey row while `range` is selected applies preset `i`. Returns true when handled. */
  function rangeRow(i) {
    if (inst().selectedParam !== 'range' || !QUICK_RANGES_E4[i]) return false;
    emitUi('softkey', 'range-' + QUICK_RANGES_E4[i]);
    keys.quickRange(QUICK_RANGES_E4[i]);
    return true;
  }

  // ---- EPOCH LTC (v3 F5: a cosmetic preset over the EPOCH 600 actions — epoch_auto_calibration f028) ------
  /**
   * Build the EPOCH LTC skin: green LCD, the BASE | GATES | PULSER | RECEIVER tab row, the VEL/ZERO/ANGLE and
   * THICK/CSA/DIA parameter lines, the quick-range row and the CAL THIN | CAL THICK | CANCEL softkeys of f028.
   * @param {HTMLElement} container
   */
  function buildEpochLtc(container) {
    const R = mem.refs = {};
    mem.canvas = h('canvas', { id: 'cv-ascan', class: 'ltc-ascan' });
    R.gain = h('span', { class: 'ltc-gain' }, 'GAIN 40dB');
    R.unit = h('div', { class: 'ltc-unit' }, 'mm');
    R.big = h('div', { class: 'ltc-big' }, '00.00');
    R.amp = h('div', { class: 'ltc-amp' }, '0%');
    R.delay = h('div', { class: 'ltc-delay' }, 'DELAY 00.0');
    R.range = h('div', { class: 'ltc-range' }, 'RANGE 100.0');
    R.tabs = ['BASE', 'GATES', 'PULSER', 'RECEIVER'].map(function (name, i) {
      return h('span', { class: 'ltc-tab' + (i === 0 ? ' sel' : ''), dataset: { tab: name }, onclick: function () { mem.focused = true; emitUi('softkey', name); ltcTab(name); } }, name);
    });
    R.vel = h('span', {}, '5900'); R.zero = h('span', {}, '00.0'); R.angle = h('span', {}, '60.0');
    R.thick = h('span', {}, '20.0'); R.csa = h('span', {}, '00.0'); R.dia = h('span', {}, '168.3');
    const cell = function (lab, val, param) {
      return h('span', { class: 'ltc-pc', dataset: { param: param || '' }, onclick: function () { mem.focused = true; if (param) { emitUi('softkey', param); selectParam(param); } } }, [h('span', { class: 'ltc-pl' }, lab + ' '), val]);
    };
    R.quick = QUICK_RANGES_E4.map(function (r) {
      return h('span', { class: 'ltc-q', onclick: function () { mem.focused = true; emitUi('softkey', 'range-' + r); keys.quickRange(r); } }, r.toFixed(1) + 'mm');
    });
    R.soft = ['CAL THIN', 'CAL THICK', 'CANCEL'].map(function (lab) {
      const fn = lab === 'CAL THIN' ? keys.calThin : lab === 'CAL THICK' ? keys.calThick : keys.calCancel;
      return h('span', { class: 'ltc-sk', dataset: { sk: lab }, onclick: function () { mem.focused = true; emitUi('softkey', lab); fn(); } }, lab);
    });
    const screen = h('div', { class: 'ltc-screen no-i18n' }, [
      h('div', { class: 'ltc-hdr' }, [h('span', { class: 'ltc-id' }, 'ID 1 2 1 1 1 3'), R.gain]),
      h('div', { class: 'ltc-main' }, [
        h('div', { class: 'ltc-plot' }, [mem.canvas]),
        h('div', { class: 'ltc-side' }, [R.unit, R.big, R.amp, R.delay, R.range]),
      ]),
      h('div', { class: 'ltc-tabs' }, R.tabs),
      h('div', { class: 'ltc-params' }, [
        h('div', {}, [cell('VEL', R.vel, 'velocity'), cell('ZERO', R.zero, 'zero'), cell('ANGLE', R.angle, 'trigAngle')]),
        h('div', {}, [cell('THICK', R.thick, 'trigThick'), cell('CSA', R.csa), cell('DIA', R.dia, 'trigDiameter')]),
      ]),
      h('div', { class: 'ltc-quick' }, R.quick),
      h('div', { class: 'ltc-soft' }, R.soft),
    ]);
    const pad = h('div', { class: 'ltc-pad no-i18n' }, [
      h('div', { class: 'ltc-prow' }, [key('GAIN', keys.dB, 'ltck', null, 'dB'), key('▲', keys.up, 'ltck', null, 'up'), key('GATES', keys.gates, 'ltck', null, 'GATES')]),
      h('div', { class: 'ltc-prow' }, [key('◀', keys.left, 'ltck', null, 'left'), key('ENTER', keys.enter, 'ltck', null, 'enter'), key('▶', keys.right, 'ltck', null, 'right')]),
      h('div', { class: 'ltc-prow' }, [key('FREEZE', keys.freeze, 'ltck', null, 'freeze'), key('▼', keys.down, 'ltck', null, 'down'), key('MEAS', function () { keys.measure(); rebuildSoftkeys(); }, 'ltck')]),
      h('div', { class: 'ltc-prow' }, [key('DISPLAY SETUP', keys.rectify, 'ltck grey', null, 'DISPLAY'), key('SAVE', keys.save, 'ltck grey', null, 'SAVE'), key('RANGE', function () { selectParam('range'); }, 'ltck grey', null, 'RANGE'), key('CAL', keys.autoCal, 'ltck grey', null, 'CAL')]),
      h('div', { class: 'ltc-prow' }, [key('2ND F', keys.secondF, 'ltck grey', null, '2ND F'), key('ID', null, 'ltck grey', null, 'ID'), key('SYSTEM MENU', keys.nextGroup, 'ltck grey', null, 'NEXT GROUP'), key('ON/OFF', function () { keys.power(); }, 'ltck green', null, 'ON')]),
    ]);
    const body = h('div', { class: 'skin skin-epochltc' + (mem.touch ? ' touch' : '') }, [
      h('div', { class: 'ltc-brandtop no-i18n' }, 'PANAMETRICS-NDT   OLYMPUS'),
      h('div', { class: 'ltc-bezel' }, [screen]),
      h('div', { class: 'ltc-fkeys no-i18n' }, ['F1', 'F2', 'F3', 'F4'].map(function (f, i) { return key(f, function () { const s = R.soft[i] || R.quick[i]; if (s) s.click(); }, 'ltc-f', { tip: TIPS.F, tipParams: { n: i + 1 } }); })),
      pad,
      h('div', { class: 'ltc-brand no-i18n' }, 'EPOCH LTC'),
    ]);
    container.appendChild(body);
  }
  /** EPOCH LTC tab row: BASE | GATES | PULSER | RECEIVER selects the matching EPOCH 600 softkey page. */
  function ltcTab(name) {
    const page = name === 'GATES' ? 2 : 1;
    mem.subPage = name === 'PULSER' ? 'Pulsar' : name === 'RECEIVER' ? 'Rcvr' : name === 'GATES' ? 'Gate1' : 'Basic';
    setInst({ page });
    if (mem.refs.tabs) mem.refs.tabs.forEach(function (el) { el.classList.toggle('sel', el.dataset.tab === name); });
  }
  /**
   * Per-frame refresh of the EPOCH LTC screen (readouts, parameter line, quick-range and cal softkey selection).
   * @param {object} frame  UT.frame
   */
  function updateEpochLtc(frame) {
    const R = mem.refs; if (!R.big) return;
    const I = inst(); const ro = frame && frame.readouts; const p = ro && ro.primary; const d = (frame && frame.derived) || derived();
    const rp = readPair(p);
    setText(R.gain, 'GAIN ' + fmtGain(I.gain));
    const which = I.readout || 'dp';
    setText(R.unit, which === 'amp' ? '%' : unitLabel());
    setText(R.big, !p ? '00.00' : which === 'amp' ? String(Math.min(999, Math.round(p.peakPct))) : fmtRead(which === 'sp' ? (Number.isFinite(p.pathDisp) ? p.pathDisp : p.path) : which === 'sd' ? rp.sd : rp.dp));
    setText(R.amp, (p ? Math.min(999, Math.round(p.peakPct)) : 0) + '%');
    setText(R.delay, 'DELAY ' + I.delay.toFixed(1));
    setText(R.range, 'RANGE ' + I.range.toFixed(1));
    const cal = I.cal || {};
    const vel = (cal.vel !== null && cal.vel !== undefined) ? cal.vel : d.vel;
    setText(R.vel, String(Math.round(vel * 1000)));
    setText(R.zero, (cal.zero || 0).toFixed(1));
    setText(R.angle, I.trig.angle.toFixed(1)); setText(R.thick, I.trig.thick.toFixed(1));
    setText(R.csa, cscOn(I) ? 'ON' : '00.0'); setText(R.dia, PARAMS.trigDiameter.get(I).toFixed(1));
    const sel = I.selectedParam;
    if (R.quick) R.quick.forEach(function (el, i) { el.classList.toggle('sel', Math.abs(I.range - QUICK_RANGES_E4[i]) < 0.05); });
    if (R.soft) { const s = calStage(); R.soft[0].classList.toggle('sel', s === 1); R.soft[1].classList.toggle('sel', s === 2); }
    Array.prototype.forEach.call(R.tabs[0].parentNode.parentNode.querySelectorAll('.ltc-pc'), function (el) { el.classList.toggle('sel', !!el.dataset.param && el.dataset.param === sel); });
  }

  // ---- USK7 --------------------------------------------------------------------
  function ensureUskWindow() {
    if (mem.uskWin) return mem.uskWin;
    if (typeof document === 'undefined') return null;
    UT.dom.injectCss('instruments', UT.instruments.css);
    mem.uskWin = UT.dom.win({
      name: 'usk7', title: 'USK 7', x: 460, y: 100, w: 484, class: 'win-usk7',
      onClose: function () { UT.status({ right: 'USK 7 switched off — Options ▸ UT Set or "Show USK 7" to restore' }); },
      onShow: function (api) {
        const m = st().mode;
        if (m === 'v1' || m === 'v2') {
          // shown while on a block screen (§14.8): park bottom-right; remember the way back (default placement when never positioned)
          if (!mem.uskParked) mem.uskParked = mem.uskPositioned ? { left: api.el.style.left, top: api.el.style.top } : { left: '', top: '' };
          mem.uskPositioned = true;
          parkUsk(api, false);
        } else positionUsk(api);
        syncUskDock();
      },
    });
    UT.bus.on('win:hide', function (api) { if (api === mem.uskWin) syncUskDock(); });
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
      const r = plan ? designRect(plan) : null;
      if (!r || !(r.width > 0)) return;
      const hWin = api.el.offsetHeight || 230;
      const top = Math.max(r.top + 4, Math.round(r.bottom - Math.min(0.4 * r.height, hWin - 60)));
      api.el.style.left = Math.round(r.left + 4) + 'px'; api.el.style.top = top + 'px';
    };
    place();
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { if (mem.uskWin === api && api.isOpen()) place(); });
  }
  /**
   * Bounding rect of an element in DESIGN px relative to the #app box (SPEC-v2 §5.4: window positions are style px inside
   * the scaled design box, so screen rects must be divided by UT.dom.scale() and offset by #app's own rect).
   */
  function designRect(el) {
    const r = el.getBoundingClientRect();
    const app = document.getElementById('app');
    const a = app && app !== el ? app.getBoundingClientRect() : { left: 0, top: 0 };
    const k = UT.dom.scale ? (UT.dom.scale() || 1) : 1;
    return { left: (r.left - a.left) / k, top: (r.top - a.top) / k, width: r.width / k, height: r.height / k, right: (r.left - a.left + r.width) / k, bottom: (r.top - a.top + r.height) / k };
  }
  /**
   * Pure §14.8 parking arithmetic (design px): bottom-right of the W×H app box with the v1 margins (16 px right, 37 px
   * bottom = above the status bar), never negative. v1 used `innerWidth − 500` / `innerHeight − 260` for the 484×223 window.
   * @param {number} W app width  @param {number} H app height  @param {number} w window width  @param {number} h window height
   * @returns {{left:number, top:number}}
   */
  function uskParkPos(W, H, w, h) {
    const ww = w > 0 ? w : 484, hh = h > 0 ? h : 223;
    return { left: Math.max(0, Math.round(W - ww - 16)), top: Math.max(0, Math.round(H - hh - 37)) };
  }
  /**
   * Park the USK7 bottom-right of the (unscaled) #app design box — SPEC §14.8 V1/V2 block screens. Uses #app.offsetWidth/Height
   * (design px, SPEC-v2 §5.4) so the window stays fully inside the box at every display.scale; re-run on bus 'resize'.
   * @param {object} api  dom.win api  @param {boolean} [remember]  store the current position in mem.uskParked for the way back
   */
  function parkUsk(api, remember) {
    const el = api.el;
    if (remember && !mem.uskParked) mem.uskParked = { left: el.style.left, top: el.style.top };
    const app = document.getElementById('app');
    const W = app && app.offsetWidth > 0 ? app.offsetWidth : (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const H = app && app.offsetHeight > 0 ? app.offsetHeight : (typeof window !== 'undefined' ? window.innerHeight : 760);
    const pos = uskParkPos(W, H, el.offsetWidth, el.offsetHeight);
    el.style.left = pos.left + 'px'; el.style.top = pos.top + 'px';
  }
  /** USK7 rotary knob: ◀ ▶ buttons, mouse wheel and a scale-aware vertical pointer drag on the dial (6 design px per step). */
  function knob(label, opts) {
    const dial = h('div', { class: 'usk-dial' + (opts.red ? ' red' : ''), role: 'slider', 'aria-label': label, tabindex: '0' }, [h('div', { class: 'usk-ptr' })]);
    // F8: coarse (×10) and fine arrow pairs — `◀◀ ◀ ▶ ▶▶` — above RANGE and X-SHIFT
    const arrows = [];
    if (opts.step10) arrows.push(key('◀◀', function () { opts.step10(-1); }, 'usk-arr usk-arr10', { tip: TIPS['knob10-'], tipParams: { k: label } }, label + '10-'));
    arrows.push(key('◀', function () { opts.step(-1); }, 'usk-arr', { tip: TIPS['knob-'], tipParams: { k: label } }, label + '-'));
    arrows.push(key('▶', function () { opts.step(+1); }, 'usk-arr', { tip: TIPS['knob+'], tipParams: { k: label } }, label + '+'));
    if (opts.step10) arrows.push(key('▶▶', function () { opts.step10(+1); }, 'usk-arr usk-arr10', { tip: TIPS['knob10+'], tipParams: { k: label } }, label + '10+'));
    const el = h('div', { class: 'usk-knob no-i18n' + (opts.red ? ' usk-knob-amp' : '') }, [
      h('div', { class: 'usk-lr' }, arrows),
      dial, h('span', { class: 'usk-klab' }, label),
    ]);
    dial.addEventListener('wheel', function (e) { e.preventDefault(); emitUi('wheel', label); const n = e.deltaY < 0 ? 1 : -1; if (e.shiftKey && opts.step10) opts.step10(n); else opts.step(n); });
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
    R.knobRange = knob('RANGE', {
      step: function (d) { setInst({ range: M.clamp(inst().range * (1 + 0.02 * d), 10, 1000), selectedParam: 'range' }); },
      step10: function (d) { setInst({ range: M.clamp(inst().range * (1 + 0.10 * d), 10, 1000), selectedParam: 'range' }); },
    });
    R.knobShift = knob('X-SHIFT', {
      step: function (d) { setInst({ delay: M.clamp(inst().delay + d, 0, 1000), selectedParam: 'delay' }); },
      step10: function (d) { setInst({ delay: M.clamp(inst().delay + 10 * d, 0, 1000), selectedParam: 'delay' }); },
    });
    R.knobSupp = knob('SUPPRESSION', { step: function (d) { setInst({ reject: M.clamp(inst().reject + 2 * d, 0, 80), selectedParam: 'reject' }); } });
    // F8: the vertical gain slider becomes the big red AMP knob; the range input stays for the keyboard and for tests
    R.knobAmp = knob('AMP', {
      red: true,
      step: function (d) { setInst({ gain: M.clamp(inst().gain + 0.5 * d, 0, 110), selectedParam: 'gain' }); },
      step10: function (d) { setInst({ gain: M.clamp(inst().gain + 5 * d, 0, 110), selectedParam: 'gain' }); },
    });
    R.amp = h('input', { type: 'range', min: 0, max: 110, step: 0.5, class: 'usk-amp', title: 'AMP (dB)', 'aria-label': 'AMP (dB)' });
    R.amp.value = inst().gain;
    R.amp.addEventListener('input', function () { setInst({ gain: M.clamp(parseFloat(R.amp.value), 0, 110), selectedParam: 'gain' }); });
    R.ampLab = h('span', { class: 'usk-amplab' }, 'AMP=');
    R.erase = key('ERASE DAC', keys.erase, 'usk-erase');
    // F1: OFF is the set's power switch, not a window close — it must announce itself that way (the titlebar ✕ closes)
    R.off = key('OFF', function () { keys.power(); }, 'usk-off', { tip: TIPS.ON }, 'OFF');
    const panel = h('div', { class: 'usk-panel' }, [
      h('div', { class: 'usk-col' }, [R.knobRange, h('div', { class: 'usk-btn red', title: 'decorative' }), R.erase]),
      h('div', { class: 'usk-col usk-ampcol' }, [R.ampLab, R.knobAmp, R.amp]),
      h('div', { class: 'usk-col' }, [R.knobShift, R.knobSupp]),
      h('div', { class: 'usk-col usk-offcol' }, [R.off, h('span', { class: 'usk-brand' }, 'KRAUTKRÄMER USK 7')]),
    ]);
    const body = h('div', { class: 'skin skin-usk7' + (mem.touch ? ' touch' : '') }, [h('div', { class: 'usk-crtwrap' }, [mem.canvas, R.crtText, R.crtPulser]), panel]);
    win.setContent(body);
    win.el.addEventListener('pointerdown', function () { mem.focused = true; });
    win.el.addEventListener('wheel', function (e) { if (e.target === mem.canvas) { e.preventDefault(); wheel(e.deltaY < 0 ? 1 : -1, { coarse: e.shiftKey }); } }, { passive: false });
    win.show();
    // placeholder in the instrument column
    container.appendChild(h('div', { class: 'skin skin-uskdock' }, [
      h('div', { class: 'uskdock-title', i18n: 'UT SET: KRAUTKRÄMER USK 7 (analogue)' }),
      tx('div', 'uskdock-hint', 'The USK 7 floats over the plan view. Read the screen — this set has no digital readouts.'),
      R.dockBtn = tip(UT.dom.button('Show USK 7', function () { mem.focused = true; emitUi('softkey', 'Show USK 7'); win.show(); }, { class: 'ik uskdock-btn' }), TIPS['Show USK 7']),
    ]));
    syncUskDock();
  }
  /** F1: the dock's "Show USK 7" button only makes sense while the window is closed — hide it while it is open. */
  function syncUskDock() {
    const R = mem.refs; if (!R || !R.dockBtn) return;
    const open = !!(mem.uskWin && mem.uskWin.isOpen());
    if (R.dockBtn.hidden !== open) R.dockBtn.hidden = open;
  }
  function updateUsk7(frame) {
    const R = mem.refs; if (!R.crtText) return;
    const I = inst();
    // ANGLE = instrument.trig.angle, except with a PA probe where the CRT shows the A-scan of the selected focal
    // law (drawCanvas) — then the law's angle is what the trace belongs to.
    const paSel = st().probe.method === 'pa' && frame && frame.paSelected && Number.isFinite(frame.paSelected.angle) ? frame.paSelected.angle : null;
    setText(R.crtText, 'AMP ' + Math.round(I.gain) + ' dB  Suppr ' + (I.reject > 0 ? I.reject + '%' : 'OFF') + '  ANGLE ' + Math.round(paSel === null ? I.trig.angle : paSel) + '°');
    const flt = filterOf(I);
    if (R.crtPulser) setText(R.crtPulser, 'P ' + energyV(I) + 'V ' + dampingOhms(I) + 'Ω  F ' + (flt === 'broadband' ? 'BB' : flt));
    if (document.activeElement !== R.amp && Math.abs(parseFloat(R.amp.value) - I.gain) > 1e-6) R.amp.value = I.gain;
    setText(R.ampLab, 'AMP=' + Math.round(I.gain));
    // F8: `Options ▸ Show A-scan overlay text` — the magenta on-glass line (default on when the key is absent)
    const showText = !(st().display && st().display.ascanText === false);
    R.crtText.style.display = showText ? '' : 'none';
    if (R.crtPulser) R.crtPulser.style.display = showText ? '' : 'none';
    const rot = function (el, frac) { el.dial.firstChild.style.transform = 'rotate(' + Math.round(-135 + 270 * M.clamp(frac, 0, 1)) + 'deg)'; };
    rot(R.knobRange, Math.log10(I.range / 10) / 2); rot(R.knobShift, I.delay / 200); rot(R.knobSupp, I.reject / 80);
    if (R.knobAmp) rot(R.knobAmp, I.gain / 110);
    if (R.off) R.off.classList.toggle('lit', !powered(I));
    const showErase = (I.dac.points && I.dac.points.length > 0) || st().mode === 'dac';
    R.erase.style.visibility = showErase ? 'visible' : 'hidden';
  }

  // ------------------------------------------------------------------ themes & A-scan renderer
  const THEMES = {
    epoch600: { bg: C.ascanBg, frame: '#1a1c1a', grid: C.ascanGrid, gridStyle: 'dots', trace: C.ascanTrace, traceFill: 'rgba(34,224,34,0.18)', peak: 'rgba(60,160,60,0.55)', gate: C.gate, gate2: '#4080ff', dac: C.dac, dacSub: '#ff9020', text: '#d0d0d0', axes: true, margin: { l: 16, r: 26, t: 4, b: 12 }, gates: true, dacPoints: true, xLabelStep: 1, lineWidth: 1 },
    epoch4: { bg: '#dfe3d5', frame: '#dfe3d5', grid: null, gridStyle: 'none', trace: '#101010', traceFill: null, peak: 'rgba(0,0,0,0.3)', gate: '#101010', gate2: '#404040', dac: '#303030', dacSub: '#606060', text: '#101010', axes: true, margin: { l: 22, r: 6, t: 3, b: 11 }, gates: true, gateWidth: 3, dacPoints: false, xLabelStep: 2, lineWidth: 1 },
    // v3 F8: the deep-blue USK 7 CRT of basic_ut_controls / utman_functions f020 — ground #0000C0, grid #4040e0,
    // cyan 1.5 px trace, and the `0 2 4 6 8 10` labels on a bezel strip BELOW the glass (not on it)
    usk7: { calBox: false, bg: '#0000c0', frame: '#08104a', grid: '#4040e0', gridStyle: 'lines', trace: '#40ffff', traceFill: null, peak: 'rgba(64,255,255,0.35)', gate: '#ff60ff', gate2: '#ff60ff', dac: '#ff40ff', dacSub: '#c030c0', text: '#ffffff', axes: true, margin: { l: 4, r: 4, t: 4, b: 16 }, gates: false, dacPoints: true, dacLabel: true, xLabelStep: 2, lineWidth: 1.5, bezel: '#c9c9c9', bezelText: '#ffff60' },
    // v3 F5: EPOCH LTC — the green LCD of epoch_auto_calibration f028 over the epoch600 renderer
    epochltc: { bg: '#0c2410', frame: '#0c2410', grid: '#1f5f2a', gridStyle: 'lines', trace: '#40ff40', traceFill: null, peak: 'rgba(60,200,60,0.5)', gate: '#ff2020', gate2: '#40a0ff', dac: C.dac, dacSub: '#ff9020', text: '#b8f0b8', axes: true, margin: { l: 16, r: 6, t: 4, b: 12 }, gates: true, dacPoints: true, xLabelStep: 2, lineWidth: 1.2 },
    aut: { calBox: false, bg: C.ascanBg, frame: '#000', grid: C.ascanGrid, gridStyle: 'dots', trace: C.ascanTrace, traceFill: null, peak: 'rgba(60,160,60,0.55)', gate: C.gate, gate2: '#ffe000', gate3: '#20e020', dac: C.dac, dacSub: '#ff9020', text: '#d0d0d0', axes: true, margin: { l: 16, r: 4, t: 4, b: 12 }, gates: true, dacPoints: false, xLabelStep: 1, lineWidth: 1 },
    tofd: { calBox: false, bg: '#0e5a4d', frame: '#0e5a4d', grid: '#0a3d34', gridStyle: 'lines', trace: '#22ff22', traceFill: null, peak: null, gate: C.gate, gate2: '#4080ff', dac: C.dac, dacSub: '#ff9020', text: '#d0ffd0', axes: true, margin: { l: 4, r: 4, t: 4, b: 12 }, gates: false, dacPoints: false, xLabelStep: 2, lineWidth: 1 },
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
    // v3 F1: with the set switched off the graticule, the frame and the bezel stay — the trace and every overlay go
    const on = I.powered !== false;
    if (!on) {
      // a crisp 1 px filled baseline (not a stroked line): every column reads the same sample, so the
      // "trace is flat" measurement of V3-1 sees a standard deviation of exactly zero
      ctx.fillStyle = th.trace; ctx.fillRect(px, Math.round(py + ph) - 1, pw, 1);
      ctx.restore();
      drawBezel(ctx, th, px, py, pw, ph, W, H);
      drawCalBox(ctx, th, px, py, pw, ph);
      return;
    }
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
    const hand = dac && !tcgOn && Array.isArray(dac.hand) && dac.hand.length >= 2 ? dac.hand : null;   // F40
    if (dac && (dac.on || tcgOn || hand) && dac.points && dac.points.length >= 2) {
      const poly = tcgOn ? tcgFlatPolyline(I) : dacPolyline(I);
      const curve = function (scale, colour, dash) {
        ctx.strokeStyle = colour; ctx.lineWidth = 1.2; ctx.setLineDash(dash || []);
        ctx.beginPath();
        const p0 = delay, p1 = delay + range; const N = 80;
        for (let i = 0; i <= N; i++) { const p = p0 + (p1 - p0) * i / N; const v = dacAt(poly, p) * scale; const x = xOf(p), y = yOf(v); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.setLineDash([]);
      };
      if (hand) {
        // F40: the hand-drawn curve replaces the interpolated one (Draw Curves clears it)
        ctx.strokeStyle = th.dac; ctx.lineWidth = 1.6; ctx.setLineDash([]); ctx.beginPath();
        hand.forEach(function (q, i) { const x = px + pw * M.clamp(q.xDiv, 0, 10) / 10, y = yOf(q.pct); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
        ctx.stroke();
      } else curve(1, th.dac, []);
      if (dac.curves !== false && !hand) { curve(0.5, th.dacSub, [4, 3]); curve(0.2, th.dacSub, [2, 3]); }
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
      if (m.b >= 9 && !th.bezel) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; const stepK = th.xLabelStep || 1; for (let k = 0; k <= 10; k += stepK) ctx.fillText(String(k), px + pw * k / 10, py + ph + 1); }
      ctx.restore();
    }
    drawBezel(ctx, th, px, py, pw, ph, W, H);
    drawCalBox(ctx, th, px, py, pw, ph);
  }
  /**
   * F8: the USK 7 graticule strip BELOW the glass — a light bevel band carrying `0 2 4 6 8 10` in #ffff60
   * (basic_ut_controls f012, utman_functions f020). Themes without `bezel` draw nothing.
   */
  function drawBezel(ctx, th, px, py, pw, ph, W, H) {
    if (!th.bezel) return;
    const y0 = py + ph + 1, hgt = Math.max(8, Math.min(14, H - y0 - 1));
    if (hgt < 6) return;
    ctx.save();
    ctx.fillStyle = th.bezel; ctx.fillRect(px, y0, pw, hgt);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(px, y0 + hgt - 2, pw, 2);
    ctx.fillStyle = th.bezelText || '#ffff60';
    ctx.font = 'bold 10px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const stepK = th.xLabelStep || 2;
    for (let k = 0; k <= 10; k += stepK) ctx.fillText(String(k), M.clamp(px + pw * k / 10, px + 6, px + pw - 6), y0 + hgt / 2);
    ctx.restore();
    void W;
  }
  /**
   * F3: the auto-cal thickness-entry box drawn over the A-scan area — a white panel with a 1 px black border
   * from 15 % to 90 % of the plot width and a third of its height, holding the title, the right-aligned value
   * field (sunken border) and the confirm line (epoch_auto_calibration f009 / f020).
   */
  function drawCalBox(ctx, th, px, py, pw, ph) {
    if (th.calBox === false) return;
    const c = calText();
    if (!c) return;
    ctx.save();
    // 15 %…90 % of the plot width, widened (and the type shrunk) on a narrow LCD so the caption never clips
    let x0 = Math.round(px + 0.15 * pw), x1 = Math.round(px + 0.90 * pw);
    let size = 10;
    ctx.font = 'bold ' + size + 'px Segoe UI, Arial, sans-serif';
    while (size > 7 && ctx.measureText(c.title).width > x1 - x0 - 12) {
      if (x0 > px + 2) { x0 = Math.max(Math.round(px + 2), x0 - 8); x1 = Math.min(Math.round(px + pw - 2), x1 + 4); }
      else { size -= 0.5; ctx.font = 'bold ' + size + 'px Segoe UI, Arial, sans-serif'; }
    }
    const w = Math.max(110, x1 - x0), hgt = Math.max(46, Math.round(ph / 3));
    const y0 = Math.round(py + ph * 0.22);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x0, y0, w, hgt);
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, hgt - 1);
    ctx.fillStyle = '#000000'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';
    ctx.fillText(c.title, x0 + 6, y0 + 5);
    // value field: sunken box, value right-aligned inside it
    const fw = Math.round(w * 0.55), fx = x0 + w - fw - 8, fy = y0 + Math.round(hgt * 0.38), fh = 15;
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(fx, fy, fw, fh);
    ctx.strokeStyle = '#808080'; ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
    ctx.fillStyle = '#000000'; ctx.font = 'bold 11px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(c.value, fx + fw - 4, fy + 2);
    ctx.textAlign = 'left'; ctx.font = Math.max(7, size - 1) + 'px Segoe UI, Arial, sans-serif';
    ctx.fillText(c.confirm, x0 + 6, y0 + hgt - 13);
    ctx.restore();
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
    // Margins are skin-independent (the analogue USK 7 never shows the sector — drawCanvas keeps its A-scan).
    const mL = 18, mT = 18, mB = 24, mR = 6;
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
    // caption: bottom-left, under the mm scale
    ctx.font = 'bold 11px Segoe UI, Arial, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText('S-SCAN ' + aMin.toFixed(0) + '°–' + aMax.toFixed(0) + '°', 3, H - 1);
    ctx.restore();
  }

  // ------------------------------------------------------------------ mount / render / skins
  /** Theme name / override for the live canvas (high-contrast: white 2 px trace, brighter grid — §5.7). */
  function liveTheme() {
    const base = mem.skin === 'epoch4' ? 'epoch4' : mem.skin === 'usk7' ? 'usk7' : mem.skin === 'epochltc' ? 'epochltc' : 'epoch600';
    const d = st().display;
    if (!(d && d.highContrast)) return base;
    if (base === 'epoch4') return { base, lineWidth: 2, gateWidth: 4 };
    if (base === 'epochltc') return { base, trace: '#ffffff', grid: '#5a8a5a', lineWidth: 2, text: '#ffffff' };
    return { base, trace: '#ffffff', traceFill: null, grid: '#5a5a5a', lineWidth: 2, text: '#ffffff', compareColour: '#9a9a9a' };
  }
  function drawCanvas(frame) {
    const cv = mem.canvas; if (!cv || !cv.isConnected) return;
    const ctx = UT.dom.fitCanvas(cv);
    const s = st();
    // §6.9: the sector image replaces the A-scan on the EPOCH screens. The USK 7 is an analogue single-channel set
    // with no sector display, so its CRT keeps the A-scan of the active focal law (40 puts the selected column's
    // trace in frame.ascan and its angle in frame.paSelected).
    if (frame && frame.sscan && s.probe.method === 'pa' && mem.skin !== 'usk7') drawSscan(ctx, frame, s);
    else drawAscan(ctx, frame, s, liveTheme());
    // F3: a canvas carries no accessible text — mirror the wizard's three lines into the canvas label
    const c = calText();
    const aria = c ? c.text : '';
    if (mem.calAria !== aria) {
      mem.calAria = aria;
      if (aria) { cv.setAttribute('aria-label', aria); cv.setAttribute('role', 'img'); } else { cv.removeAttribute('aria-label'); cv.removeAttribute('role'); }
    }
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
      else if (mem.skin === 'epochltc') updateEpochLtc(frame);
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
    hintOff();                                   // F6: the hovered key goes away without a mouseleave
    c.textContent = '';
    mem.refs = {}; mem.canvas = null; mem.iconCanvas = null; mem.subPage = null; setSecondF(false);
    mem.touch = wantTouch();
    if (mem.uskWin && name !== 'usk7') { mem.uskWin.setContent(null); mem.uskWin.hide(); }   // mem.uskParked survives a skin switch (way back from v1/v2)
    mem.skin = name;
    if (name === 'epoch4') buildEpoch4(c);
    else if (name === 'usk7') buildUsk7(c);
    else if (name === 'epochltc') buildEpochLtc(c);
    else { mem.skin = 'epoch600'; buildEpoch600(c); }
    c.dataset.skin = mem.skin;
    attachDacDraw(mem.canvas);
    applyFloat();
    onRender(UT.frame);
  }
  /**
   * F40: drag on `#cv-ascan` to lay the DAC by hand once at least two points are recorded. The stroke is captured in
   * graticule divisions, its ends snap to a recorded point within 6 px and it is resampled to ≥ 5 points.
   * @param {HTMLCanvasElement} cv
   */
  function attachDacDraw(cv) {
    if (!cv || cv.dataset.dacDraw) return;
    cv.dataset.dacDraw = '1';
    cv.style.touchAction = 'none';
    const armed = function () { const d = inst().dac; return !!(d && Array.isArray(d.points) && d.points.length >= 2); };
    const geom = function () {
      const th = resolveTheme(liveTheme());
      const W = cv.clientWidth || cv.width, H = cv.clientHeight || cv.height, m = th.margin;
      return { px: m.l, py: m.t, pw: Math.max(10, W - m.l - m.r), ph: Math.max(10, H - m.t - m.b) };
    };
    const at = function (e) {
      const g = geom();
      const p = UT.dom.localPos ? UT.dom.localPos(e, cv) : { x: e.offsetX, y: e.offsetY };
      return { xDiv: M.clamp((p.x - g.px) / g.pw * 10, 0, 10), pct: M.clamp((1 - (p.y - g.py) / g.ph) * 100, 0, 100), x: p.x, y: p.y, g };
    };
    cv.addEventListener('pointerdown', function (e) {
      if (!armed() || (e.button !== undefined && e.button !== 0)) return;
      mem.focused = true;
      const p = at(e);
      mem.dacDrag = { pts: [{ xDiv: p.xDiv, pct: p.pct }], g: p.g };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      UT.status({ right: t('LEFT mouse button/drag to draw curve') });
      e.preventDefault();
    });
    cv.addEventListener('pointermove', function (e) {
      const d = mem.dacDrag; if (!d) return;
      const p = at(e);
      const last = d.pts[d.pts.length - 1];
      if (Math.abs(p.xDiv - last.xDiv) > 0.02 || Math.abs(p.pct - last.pct) > 0.5) d.pts.push({ xDiv: p.xDiv, pct: p.pct });
    });
    const end = function (e) {
      const d = mem.dacDrag; if (!d) return;
      mem.dacDrag = null;
      try { cv.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      const pts = finishHandDac(d.pts, d.g);
      if (pts) { handDac(pts); emitUi('softkey', 'dacHand'); UT.requestRender(); }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
  }
  /**
   * F40 helper (pure): snap the ends of a hand stroke to the recorded DAC points within 6 px and resample the
   * polyline so it always carries at least 5 points.
   * @param {Array<{xDiv:number, pct:number}>} pts
   * @param {{px:number, py:number, pw:number, ph:number}} g  plot rectangle in CSS px
   * @param {object} [ins]  instrument (default: state)
   * @returns {Array<{xDiv:number, pct:number}>|null}
   */
  function finishHandDac(pts, g, ins) {
    if (!Array.isArray(pts) || pts.length < 2 || !g || !(g.pw > 0)) return null;
    const I = ins || inst();
    const poly = dacPolyline(I);
    const range = I.range || 100, delay = I.delay || 0;
    const snap = function (q) {
      let best = null, bd = 6;
      poly.forEach(function (r) {
        const rd = { xDiv: (r.path - delay) / range * 10, pct: r.pct };
        const dx = (rd.xDiv - q.xDiv) / 10 * g.pw, dy = (rd.pct - q.pct) / 100 * g.ph;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= bd) { bd = dist; best = rd; }
      });
      return best || q;
    };
    const out = pts.slice();
    out[0] = snap(out[0]);
    out[out.length - 1] = snap(out[out.length - 1]);
    if (out.length >= 5) return out;
    // resample the polyline to 5 evenly spaced points so a two-move drag still gives a curve
    const res = [];
    const N = 4;
    for (let i = 0; i <= N; i++) {
      const u = i / N * (out.length - 1);
      const k = Math.min(out.length - 2, Math.floor(u)), f = u - k;
      res.push({ xDiv: M.lerp(out[k].xDiv, out[k + 1].xDiv, f), pct: M.lerp(out[k].pct, out[k + 1].pct, f) });
    }
    res[0] = out[0]; res[res.length - 1] = out[out.length - 1];
    return res;
  }
  // ------------------------------------------------------------------ F8: floating instrument panel (display.instrumentFloat)
  /** The window that carries `#instrument` while it floats (created lazily — epoch_auto_calibration f016). */
  function ensureFloatWindow() {
    if (mem.floatWin) return mem.floatWin;
    if (typeof document === 'undefined') return null;
    UT.dom.injectCss('instruments', UT.instruments.css);
    mem.floatWin = UT.dom.win({
      name: 'instrument', title: 'Flaw detector', x: 12, y: 60, class: 'win-instrument', alwaysOnTop: true,
      onClose: function () { UT.setIn('display', { instrumentFloat: false }); applyFloat(); },
    });
    return mem.floatWin;
  }
  /**
   * F8: move `#instrument` into (or out of) the float window and give the freed 470 px column to the views.
   * The USK 7 already floats in its own window, so the flag is ignored while that skin is up.
   */
  function applyFloat() {
    const c = mem.container;
    if (!c || typeof document === 'undefined') return;
    const want = !!(st().display && st().display.instrumentFloat) && mem.skin !== 'usk7';
    const main = c.parentNode && c.parentNode.id === 'main' ? c.parentNode : document.getElementById('main');
    if (want) {
      const w = ensureFloatWindow(); if (!w) return;
      if (!mem.floatHome) mem.floatHome = { parent: c.parentNode, next: c.nextSibling };
      if (c.parentNode !== w.body) { w.body.textContent = ''; w.body.appendChild(c); }
      if (main) main.classList.add('inst-float');
      w.show();
    } else {
      if (mem.floatHome && c.parentNode && c.parentNode !== mem.floatHome.parent) {
        mem.floatHome.parent.insertBefore(c, mem.floatHome.next || null);
      }
      if (main) main.classList.remove('inst-float');
      if (mem.floatWin && mem.floatWin.isOpen()) mem.floatWin.hide();
    }
    UT.requestRender();
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
      UT.bus.on('status', onStatus);                // F6: follow 90's mid rebuilds while a key hint is armed
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
        if (keys.indexOf('display') >= 0) { applyTouch(); applyFloat(); }
        if (keys.indexOf('instrument') >= 0) { const c = inst().compare; if (c === null || (c && typeof c.length === 'number')) mem.compare = c || null; }
      });
      try { if (!mem.mq && typeof matchMedia === 'function') mem.mq = matchMedia('(pointer: coarse)'); if (mem.mq && mem.mq.addEventListener) mem.mq.addEventListener('change', applyTouch); } catch (e) { /* ignore */ }
      UT.bus.on('lang', function () { rebuildSoftkeys(); relabelTips(); refreshDatalogWindow(true); if (mem.skin) onRender(UT.frame); });
      UT.bus.on('mode', function (p) {
        if (!mem.uskWin || !p) return;
        // F7 Always Show UT Controls: the USK 7 controls are pinned — bring them back on every mode entry
        if (mem.skin === 'usk7' && st().display && st().display.alwaysShowControls && !mem.uskWin.isOpen()) mem.uskWin.show();
        const el = mem.uskWin.el, visible = mem.skin === 'usk7' && mem.uskWin.isOpen();
        if (p.mode === 'v1' || p.mode === 'v2') {
          // §14.8: the USK7 floats bottom-right on the block screens (design px, inside #app); remember where it was so it can go back.
          if (visible) parkUsk(mem.uskWin, true);   // a hidden window is parked (and remembered) by onShow when it comes back
        } else if (mem.uskParked) {
          const prev = mem.uskParked; mem.uskParked = null;
          if (prev.left && prev.top) { el.style.left = prev.left; el.style.top = prev.top; }
          else { mem.uskPositioned = false; if (visible) positionUsk(mem.uskWin); }   // default: lower-left of the plan view (reference EGQxpCOD_xA.jpg)
        }
      });
      // a scale/viewport change while parked on a block screen: keep the USK7 bottom-right inside the design box (§14.8)
      UT.bus.on('resize', function () {
        if (mem.skin !== 'usk7' || !mem.uskWin || !mem.uskParked || !mem.uskWin.isOpen()) return;
        const m = st().mode;
        if (m === 'v1' || m === 'v2') parkUsk(mem.uskWin, false);
      });
    }
    buildSkin(st().utSet || 'epoch600');
  }
  /**
   * Switch the skin ('epoch600' | 'epoch4' | 'epochltc' | 'usk7'); also syncs state.utSet when it differs.
   * `'ltc'` / `'epoch-ltc'` are accepted as aliases of the v3 EPOCH LTC preset (F5).
   * @param {string} name
   */
  function setSkin(name) {
    const alias = name === 'ltc' || name === 'epoch-ltc' || name === 'epochLTC' ? 'epochltc' : name;
    const n = alias === 'epoch4' || alias === 'usk7' || alias === 'epochltc' ? alias : 'epoch600';
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
    // F3: digits / '.' / Backspace type straight into the on-LCD entry field while the wizard is up
    if (calStage() && calTypeKey(ev.key)) { if (ev.preventDefault) ev.preventDefault(); UT.requestRender(); return true; }
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
  /**
   * Clear the datalogger: write the empty entry list into `instrument.datalog`.
   * @returns {number} the number of entries removed
   */
  function datalogClear() { const n = datalogEntries().length; setInst({ datalog: [] }); return n; }
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
    '.e6-sk.blank{background:#2b2d2b;cursor:default;}',
    /* v3 QA r3 — the F3 CAL page is drawn ON the hardware keys: the F stack starts 72 px below the skin's content
       top (.e6-right padding 26 + .ik-next 30 + gap 6 + .e6-fkeys margin 10) and the softkey column starts at 41
       (.e6-top 20 + gap 3 + .e6-screen border 2 + .e6-hdr 16), so key n is centred 43 + 32n px into the column. */
    '.e6-soft.cal{padding-top:31px;}',
    '.skin-epoch600 .e6-soft.cal .e6-sk{flex:0 0 24px;height:24px;min-height:0;margin-bottom:8px;border-bottom:0;}',   /* out-ranks the .touch min-height */
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
    // width:100% (border-box) = the win body's content width — the win is 484 px wide INCLUDING its 1 px borders,
    // so a hard-coded 484 px skin was 2 px wider than the 482 px body and the body grew a horizontal scrollbar.
    '.skin-usk7{display:flex;width:100%;height:200px;background:#0d0d0d;border:1px solid #333;}',
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
    '.uskdock-btn[hidden]{display:none;}',
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
    /* the touch F stack is taller (.ik-next 36 + .ik-f 30, pitch 38) — keep the CAL rows on the keys */
    '.skin-epoch600.touch .e6-soft.cal{padding-top:37px;}',
    '.skin-epoch600.touch .e6-soft.cal .e6-sk{flex:0 0 30px;height:30px;margin-bottom:8px;}',
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
    /* ---------------- v3 ---------------- */
    /* F5: pressed key flash + the quick-range P row */
    '.ik-p.pressed,.ik-f.pressed,.e4-f.pressed,.ltc-f.pressed{background:#f0c020;color:#101010;border-color:#fff0a0;}',
    '.ik-p.ranged{font-size:8px;color:#ffe08a;}',
    /* F8: USK 7 rotary AMP knob, ×10 arrows, hidden keyboard slider */
    '.usk-arr10{width:20px;letter-spacing:-1px;}',
    '.usk-knob-amp .usk-dial{background:radial-gradient(circle at 40% 35%,#ff7060,#8a0000);border-color:#5a1010;width:42px;height:42px;}',
    '.usk-knob-amp .usk-ptr{left:19px;}',
    '.usk-knob-amp .usk-klab{color:#ff8080;}',
    '.usk-amp{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;margin:0;}',
    '.usk-ampcol{position:relative;}',
    '.usk-off.lit{background:#ff6060;color:#fff;}',
    /* F8: the floating instrument window and the freed layout column */
    '.win-instrument .win-body{padding:2px;background:#2a2c30;}',
    '#main.inst-float{grid-template-columns:0 minmax(0,1fr);}',
    '#main.inst-float #plan-area,#main.inst-float #ruler-area,#main.inst-float #cross-area{grid-column:1 / 3;}',
    /* F5: EPOCH LTC skin (epoch_auto_calibration f028) */
    '.skin-epochltc{display:flex;flex-direction:column;gap:3px;padding:4px;background:linear-gradient(#2a3550,#161d2e);border:2px solid #7a8496;border-radius:8px;color:#e8e8e8;width:262px;min-height:396px;}',
    '.ltc-brandtop{font:bold 9px Arial,sans-serif;letter-spacing:1px;color:#dfe6ff;text-align:center;}',
    '.ltc-bezel{background:#0b1220;border:2px solid #3a4560;border-radius:4px;padding:3px;}',
    '.ltc-screen{background:#0c2410;border:1px solid #061006;display:flex;flex-direction:column;gap:1px;font:9px Consolas,"Courier New",monospace;color:#b8f0b8;padding:2px;}',
    '.ltc-hdr{display:flex;justify-content:space-between;font-size:8px;color:#d8ffd8;}',
    '.ltc-main{display:flex;gap:2px;}',
    '.ltc-plot{flex:1 1 auto;min-width:0;height:120px;}',
    '.ltc-ascan{display:block;width:100%;height:120px;}',
    '.ltc-side{width:56px;flex:0 0 56px;display:flex;flex-direction:column;gap:1px;text-align:right;}',
    '.ltc-unit{background:#1d4a24;color:#c8ffc8;font-size:8px;padding:0 2px;}',
    '.ltc-big{font:bold 15px Consolas,"Courier New",monospace;color:#7dff7d;}',
    '.ltc-amp{font-size:9px;color:#9ce09c;}',
    '.ltc-delay{font-size:8px;margin-top:auto;}',
    '.ltc-range{font-size:8px;background:#5a4a10;color:#ffd060;}',
    '.ltc-tabs{display:flex;gap:1px;}',
    '.ltc-tab{flex:1 1 0;text-align:center;font-size:8px;padding:1px 0;background:#123018;cursor:pointer;}',
    '.ltc-tab.sel{background:#1a3ea8;color:#fff;}',
    '.ltc-params{display:flex;flex-direction:column;gap:1px;font-size:8px;}',
    '.ltc-params>div{display:flex;gap:4px;}',
    '.ltc-pc{flex:1 1 0;cursor:pointer;white-space:nowrap;overflow:hidden;}',
    '.ltc-pc.sel{background:#1a3ea8;color:#fff;}',
    '.ltc-pl{color:#8ac88a;}',
    '.ltc-quick,.ltc-soft{display:flex;gap:1px;border-top:1px solid #1d4a24;padding-top:1px;}',
    '.ltc-q,.ltc-sk{flex:1 1 0;text-align:center;font-size:8px;padding:1px 0;cursor:pointer;background:#0f2c14;}',
    '.ltc-q.sel,.ltc-sk.sel{background:#1a3ea8;color:#fff;}',
    '.ltc-fkeys{display:flex;justify-content:space-around;}',
    '.ltc-f{width:44px;height:20px;border-radius:5px;font-size:9px;}',
    '.ltc-pad{display:flex;flex-direction:column;gap:3px;padding:4px 2px;background:#1b2334;border-radius:6px;}',
    '.ltc-prow{display:flex;gap:3px;justify-content:center;}',
    '.ltck{flex:1 1 0;min-width:0;height:22px;font-size:7.5px;background:#3ea23e;color:#04240b;border-color:#7fe07f;border-radius:4px;overflow:hidden;}',
    '.ltck.grey{background:#6d7280;color:#f0f0f0;border-color:#aeb3c0;}',
    '.ltck.green{background:#2ecc40;color:#04240b;}',
    '.ltc-brand{font:italic bold 10px Segoe UI,Arial,sans-serif;color:#dfe6ff;text-align:right;}',
    '.hc .skin-epochltc{border-color:#fff;}',
  ].join('\n');

  // ------------------------------------------------------------------ public API
  UT.instruments = {
    mount, setSkin, drawAscan, drawSscan, handleKey, css,
    // v2 (SPEC-v2 §3.7 / §5.2 / §11.4)
    auto, storeRef, wheel, compare, save, datalog,
    // v3 (SPEC-v3 §3.1 F1, §3.3 F3, §3.5 F5, §3.7 F7, §6.1 F40)
    power, powered, unCalibrate, deleteRecords, calText, setCalField, handDac, applyFloat,
    fmtLen: function (mm, dp) { return UT.fmtLen(mm, dp); },
    /** Internals exposed for tests / other modules (read-only use). */
    _: { PARAMS, LEGAL_PARAMS, THEMES, keys, adjust, selectParam, softkeyItems, nextRange, foldDepth, ampColour, dacPolyline, dacAt, tcgFlatPolyline, compareOf, alarmActive, checkAlarms, energyV, dampingOhms, filterOf, prfOf, tcgActive, wantTouch, uskParkPos, mem, TIPS, tip, relabelTips,
      // v3
      SHORTS, shortOf, QUICK_RANGES, QUICK_RANGES_E4, calStage, calField, calFieldText, cscCorrect, cscOn, readPair, finishHandDac, pRowLabels },
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
      // §14.8 / SPEC-v2 §5.4: USK7 parking in design px — the window rect must lie inside the W×H app box, above the 37 px status margin
      [[1280, 760], [1400, 831], [1024, 608], [1869, 1080], [400, 200]].forEach(function (d) {
        const pp = uskParkPos(d[0], d[1], 484, 223);
        if (pp.left < 0 || pp.top < 0 || (d[0] >= 500 && pp.left + 484 + 16 > d[0] + 0.5) || (d[1] >= 260 && pp.top + 223 + 37 > d[1] + 0.5)) f.push('uskParkPos ' + d.join('x') + ' → ' + JSON.stringify(pp));
      });
      if (uskParkPos(1280, 760, 484, 223).left !== 780 || uskParkPos(1280, 760, 484, 223).top !== 500 || uskParkPos(1280, 760, 0, 0).left !== 780) f.push('uskParkPos v1 numbers');
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
      // v3 F5: the gate pages gained `Status`, the Trig page `Diameter` (and a live CSC)
      if (labels(1, 'Gate2') !== 'Gate2|Zoom|Start|Width|Level|Alarm|Status') f.push('Gate2 sub-page: ' + labels(1, 'Gate2'));
      if (labels(1, 'Trig') !== 'Trig|Angle|Thick|X Value|CSC|Diameter') f.push('Trig sub-page: ' + labels(1, 'Trig'));
      if (valueOf('gain', tmp) !== '30dB' || valueOf('range', tmp) !== '100.0' || valueOf('g1level', tmp) !== '20%') f.push('valueOf ' + valueOf('gain', tmp) + ' ' + valueOf('range', tmp) + ' ' + valueOf('g1level', tmp));
      if (css.indexOf('<\/style') >= 0 || css.indexOf('<\/script') >= 0) f.push('css contains closing tag');
      // ---- v3 invariants (pure: local copies, no DOM, UT.state untouched)
      const v3 = Object.assign({}, UT.defaultState().instrument);
      if (v3.powered !== true) f.push('powered default');
      if (QUICK_RANGES.join() !== '10,20,50,100,125,250,500' || QUICK_RANGES_E4.join() !== '10,20,50,100') f.push('quick range lists');
      if (pRowLabels(v3).join() !== 'P1,P2,P3,P4,P5,P6,P7') f.push('P row idle labels');
      if (pRowLabels(Object.assign({}, v3, { selectedParam: 'range' })).join() !== '10.0,20.0,50.0,100.0,125.0,250.0,500.0') f.push('P row range labels: ' + pRowLabels(Object.assign({}, v3, { selectedParam: 'range' })).join());
      if (PARAMS.trigDiameter.fmt(168.3) !== '168.3' || LEGAL_PARAMS.indexOf('trigDiameter') < 0) f.push('trigDiameter param');
      if (cscOn(v3) !== false || cscOn(Object.assign({}, v3, { trig: { csc: true } })) !== true) f.push('cscOn');
      if (calFieldText(0) !== '0' || calFieldText(20) !== '20.00' || calFieldText(16.5) !== '16.50') f.push('calFieldText ' + calFieldText(16.5));
      // F3 CAL page (v3 QA r3): one slot per F key, no header row, and F(n) presses the row it is drawn beside
      [1, 2].forEach(function (s) {
        const page = CAL_PAGE(s);
        const labs = page.map(function (i) { return i.label; }).join('|');
        if (page.length !== FKEYS.length) f.push('CAL page rows ' + page.length);
        if (labs !== 'CAL THIN|CAL THICK|CANCEL||') f.push('CAL page labels: ' + labs);
        if (page.some(function (i) { return i.kind === 'hdr'; })) f.push('CAL page header row');
        if (page[0].value !== (s === 1 ? '<' : '') || page[1].value !== (s === 2 ? '<' : '')) f.push('CAL page stage marker ' + s);
        if (page[2].fn !== keys.calCancel) f.push('CANCEL is not on F3');
        page.forEach(function (it, i) {
          const k = fkeyItem(i, s);
          const same = it.kind === 'act' ? (k && k.label === it.label && k.fn === it.fn) : k === null;
          if (!same) f.push('F' + (i + 1) + ' does not press its own row (stage ' + s + ')');
        });
      });
      if (shortOf('CAL') !== 'CALIBRATE' || shortOf('up') !== 'ARROW RIGHT/UP' || shortOf('down') !== 'ARROW LEFT/DOWN' || shortOf('NEXT GROUP') !== 'NEXT GROUP' || shortOf('P3') !== 'NEXT GROUP' || shortOf('freeze') !== 'FREEZE' || shortOf('PULSER') !== 'PULSAR') f.push('SHORTS');
      Object.keys(SHORTS).forEach(function (k) { if (SHORTS[k] !== SHORTS[k].toUpperCase()) f.push('short not upper-case: ' + k); });
      // CSC: a flat set (huge diameter) reproduces the plain trigonometry; a 168.3 mm pipe reads shallower
      const cscI = Object.assign({}, v3, { trig: { angle: 60, thick: 20, xValue: 0, csc: true, diameter: 1e6 } });
      const flatC = cscCorrect({ path: 40, sd: 34.64, dp: 20 }, cscI);
      if (Math.abs(flatC.dp - 20) > 0.05 || Math.abs(flatC.sd - 34.64) > 0.05) f.push('cscCorrect flat limit ' + JSON.stringify(flatC));
      const pipeC = cscCorrect({ path: 40, sd: 34.64, dp: 20 }, Object.assign({}, cscI, { trig: Object.assign({}, cscI.trig, { diameter: 168.3 }) }));
      if (!(pipeC.dp < 20 && pipeC.dp > 10) || !(pipeC.sd > 34.64)) f.push('cscCorrect pipe ' + JSON.stringify(pipeC));
      // F40: the hand-DAC stroke is snapped and resampled to ≥ 5 points
      const hi = Object.assign({}, v3, { range: 100, delay: 0, gain: 30, dac: { points: [{ path: 20, ampPct: 80 }, { path: 60, ampPct: 40 }], refDb: 30, on: true, curves: true } });
      const hg = { px: 0, py: 0, pw: 200, ph: 100 };
      const hand = finishHandDac([{ xDiv: 2.05, pct: 79 }, { xDiv: 6, pct: 41 }], hg, hi);
      if (!hand || hand.length < 5) f.push('finishHandDac length');
      else if (Math.abs(hand[0].xDiv - 2) > 0.001 || Math.abs(hand[0].pct - 80) > 0.001) f.push('finishHandDac snap ' + JSON.stringify(hand[0]));
      if (finishHandDac([{ xDiv: 1, pct: 1 }], hg, hi) !== null) f.push('finishHandDac needs 2 points');
      if (!THEMES.epochltc || THEMES.usk7.bg !== '#0000c0' || THEMES.usk7.trace !== '#40ffff' || THEMES.usk7.bezelText !== '#ffff60') f.push('usk7 v3 theme');
      if (!/inst-float/.test(css) || !/skin-epochltc/.test(css) || !/\.ik-p\.pressed/.test(css)) f.push('v3 css blocks');
      if (typeof power !== 'function' || typeof unCalibrate !== 'function' || typeof calText !== 'function' || typeof handDac !== 'function') f.push('v3 API');
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
    // ---- v3 (SPEC-v3 §7: owner 70)
    /** F1: power the set on / off; returns `instrument.powered`. */
    power: function (on) { power(on); UT.renderNow(); return inst().powered !== false; },
    /** F7: knock the set out of calibration; returns the wrong {vel, zero} now in instrument.cal. */
    unCalibrate: function () { const r = unCalibrate(); UT.renderNow(); return r; },
  });
})(window.UT = window.UT || {});
