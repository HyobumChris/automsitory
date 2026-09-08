# UTsim v3 — functional completeness against the 17 UTman videos — revision 1

This document amends `SPEC.md` (v1) and `SPEC-v2.md` (v2). v1 and v2 stay binding wherever v3 does not
change them; where they conflict, **v3 wins**. All v1 acceptance checks (SPEC §11.1 #1–#14) and all v2
acceptance checks (SPEC-v2 §9, V2-1…V2-27) must keep passing after v3 — the only quantities allowed to
move are enumerated in §9.0. Same product rules: ONE self-contained HTML file, no external resources, no
network, no build tooling beyond `build.py`, headless-loadable modules, `UT.test` API.

**Why v3 exists.** The project owner supplied the 17 original UTman / UTman600 videos and stated their
purpose plainly: *the videos define what the software must do*. They are the functional specification,
demonstrated. A functional audit of all 17 produced `feature-coverage.md` (274 demonstrated features:
220 verified, 37 partial, 17 missing) and `fidelity-backlog.md` (111 gaps: 18 major M1…M18, 53 minor,
40 cosmetic). v3 closes them. Every feature id below is traceable to an audit item and to the video(s)
that demonstrate it.

Reading order for implementers: SPEC.md §2, §3, §11, §14, §15 → SPEC-v2.md §1, §2, §7, §8, §9 → this file
completely → the reference keyframes named in each feature (`ref-frames/<video-slug>/f###.jpg`).

**Two lead corrections that override the audit text** (verified in Node by the lead and re-verified while
writing this spec — the reproductions are in §4.9 and §4.10):

1. **M12 is two different things, and half of it is a misdiagnosis.** The ray tracer is *fine on pipes*.
   `UT.specimens.pipeWeld({od:168.3, wt:20})` has `L = 528.7` (the unrolled circumference) and
   `defaultProbe.z = 132`, while every `defectPresets.*` centres itself at `spec.L/2 = 264.4` — half a
   circumference away from the probe, so only a weak tip echo is caught. With the probe at the defect's own
   z the pipe root crack gives **bit-for-bit the plate result**: kind `'corner'`, `amp` 0.4828,
   `path` 40.0 mm, `ampPct` 40.34 at gain 30. The fix therefore belongs to **F21 (preset z placement)** and
   **`30-raytrace.js` MUST NOT be changed for it**. No engineer is to "fix the tracer for pipes".
2. **The TKY half of M12 is real, and it is more general than TKY.** A planar defect that breaks the
   **scanning (top) surface** yields no corner echo *anywhere* — plate weld and TKY behave identically.
   `defectPresets.toeCrack` (first point exactly on the `'top'` edge at (8, 0), second at (6.5, 3)) returns
   only `'tip'` echoes at 45/60/70° over any stand-off; at the full-skip stand-off (48.0 / 77.3 / 117.9 mm)
   the best is 6.9–14.5 %FSH at 40 dB, and the loudest reading anywhere is with the probe almost on top of
   the crack. A surface-breaking toe crack must give a strong FULL-SKIP corner echo (bottom bounce, then the
   crack / top-surface corner pair). VERIFIED FURTHER BY THE LEAD: the corner rule already fires for
   scanning-surface pairs - a VERTICAL surface-breaking crack gives amp 0.3882 / path 56.6 on plate and
   TKY alike; only the 26.6 deg inclined `toeCrack` preset fails, which is correct physics. **F22 is a
   preset-geometry fix in 10-specimens; 30-raytrace must not change.**

---

## 0. Scope — feature ids

Feature ids are used in the ownership table (§1), the specifications (§3–§6) and the acceptance checks
(§9). "Audit" gives the backlog id (M1…M18) or the coverage-matrix status of the owning row; minor and
cosmetic gaps are folded into the acceptance text of the feature that owns them rather than getting ids of
their own. Video slugs are the `ref-frames/` directory names, abbreviated where unambiguous.

### §3 Instrument, calibration blocks and cal workflow

| id | title | audit | videos |
|---|---|---|---|
| F1 | Instrument OFF blanks the trace; it never closes the window or exits the mode | coverage §1 *different* + backlog minor | basic_ut_controls, tofd |
| F2 | Auto-cal runs on the CURRENT specimen from its own gated backwall echoes | **M6** | epoch_auto_calibration, how_to_use_the_epoch |
| F3 | Auto-cal thickness entry as an on-LCD `ENTER VALUE FOR …STANDARD` wizard | **M5** + "cal prompts on the LCD" minor | epoch_auto_calibration |
| F4 | Screen range re-set to a round value after a successful cal | coverage §2 *missing* | epoch_auto_calibration |
| F5 | Range preset softkeys, Trig ▸ Diameter, Gate ▸ Status, F-key press flash, LTC skin | 4 minors + 2 cosmetics | angleprobe_calibration, epoch_auto_calibration, how_to_use_the_epoch |
| F6 | Key-function hints echo into the status bar | coverage §1 *different* | epoch_auto_calibration |
| F7 | Options ▸ UnCalibrate / Delete EPOCH records / Always Show UT Controls | coverage §7 *missing* | utman_functions, angle_probe_using_the_v2, utman_software |
| F8 | USK 7 chrome, float/dock, blue standalone A-scan, default UT set | coverage §1 *partial* + cosmetics | basic_ut_controls, zero_probe, making_sense, lamination_check, utman_functions |
| F9 | 'Turn Probe' button on the V1/V2 block screens | **M4** | angleprobe_calibration, angle_probe_using_the_v2, how_to_use_the_epoch, tky, utman_software |
| F10 | V2 wide face: 5 mm hole, edge graduations, 4th radius multiple | 2 coverage §2 *partials* | angleprobe_calibration, angle_probe_using_the_v2 |
| F11 | ASME / A5 block chooser modal and the 'ASME' labels | 2 coverage §2 *differents* | plotting_beam_spread, making_sense, zero_probe, utman_functions, utman_software |
| F12 | Step wedge 20→8 mm descending preset | cosmetic | epoch_auto_calibration |

### §4 Probe, beam and echo physics

| id | title | audit | videos |
|---|---|---|---|
| F13 | Probe turns round when dragged across the weld; `Pos` unsigned | **M13** | angle_probe_using_the_v2 |
| F14 | Both wave modes below the 1st critical angle: status line, twin fans, dialog colours | 2 *partials* + 1 cosmetic | shear_wave |
| F15 | 'Compression Wave Angle' in full; Mode Propagation colours by wave mode; original leg hues | *partial* + 2 cosmetics | zero_probe, shear_wave, angle_probe_using_the_v2 |
| F16 | 0° probe: `Normal 0°` status segment and range rescaled at the active velocity | *partial* | utman_functions |
| F17 | Fractional skips and 'Run to UT Screen Range' | *partial* | utman_functions |
| F18 | Twin-crystal near-surface boost fires at 0° | *partial* | zero_probe |
| F19 | Through Transmission with a keyboard-movable receiver | *different* | utman_functions, utman_software |
| F20 | Mirrored (virtual) probe image in plan AND cross-section | *partial* | utman_functions |
| F21 | Preset defects reachable from the default probe z; z extent; plan/3D footprint | **M11** (+ the M12 misdiagnosis) | zero_probe, angle_probe_using_the_v2, drawing_defects_i |
| F22 | Toe-crack preset geometry (near-vertical, so the full-skip corner exercise works) | **M12** (both halves are misdiagnoses - 4.10) | tky, angle_probe_using_the_v2 |
| F23 | Echo-driven `Depth = NN.Nmm` status cell | *partial* | angle_probe_using_the_v2, making_sense |
| F24 | Phased-array shoe stand-off / shoe height fields | *different* | utman_functions |

### §5 Defect editor and defect rendering

| id | title | audit | videos |
|---|---|---|---|
| F25 | Editor STEP 1–5 instructions dialog, reopened with F1 | coverage §4 *missing* | drawing_defects_ii |
| F26 | Right-drag draws a single-line LOF; erase moves to Alt/Ctrl + right-drag | **M15** | drawing_defects_ii |
| F27 | Keyboard defect manipulation (SHIFT + arrows / Z X A S Q W) | **M16** | drawing_defects_ii |
| F28 | Stroke auto-classification and the LOF `Angle / Height / Top` caption | **M14** | drawing_defects_i, drawing_defects_ii |
| F29 | Editor captions, prompts, summary line, spot spinner, default brush, ring step | 7 minors + 3 cosmetics | drawing_defects_i, drawing_defects_ii, basic_ut_controls, utman_software |
| F30 | OK exits the editor; the modal mode is restored; editor lock scope | 3 *differents* + 1 cosmetic | drawing_defects_ii, tofd, tky, drawing_defects_i |
| F31 | Blue draw-region rectangle, relocatable beside the weld | *different* + cosmetic | drawing_defects_i |
| F32 | Defect depth colour-coding in circle view, plan view and cross-section | coverage §4 *missing* | drawing_defects_i |
| F33 | HIDE key-code lock | *partial* | utman_functions |
| F34 | Load Def / Save Def as real files | *partial* | drawing_defects_i, drawing_defects_ii |

### §6 Views, modes, teaching aids and shell

| id | title | audit | videos |
|---|---|---|---|
| F35 | Draw-on-block 10 % beam-edge marks | **M8** | plotting_beam_spread |
| F36 | Freehand beam-spread lines with a live `NN.N degree` caption | **M9** | plotting_beam_spread |
| F37 | `angle BS = 7.9°` and the K-factor captions | **M10** | angleprobe_calibration |
| F38 | PLOT overlays the current weld | **M7** | angle_probe_using_the_v2, utman_functions |
| F39 | Movable ruler on the block; mirrored X ruler in `iow`; green plot dots; angle hook; hint variants | 3 *partials* + 2 cosmetics | plotting_beam_spread, angleprobe_calibration, angle_probe_using_the_v2, zero_probe |
| F40 | Hand-drawn DAC curve | minor + cosmetic | making_sense |
| F41 | Scale Mode: picture import, mm/px calibration, protractor, arbitrary-shape tracing | **M2** | utman_software, utman_functions |
| F42 | Scale Mode ▸ magnified skip-distance graduations | coverage §5 *missing* | utman_functions |
| F43 | TOFD 'Non-Parallel Scan' + 'Parallel Scan' strips | **M3** | tofd, utman_software |
| F44 | TOFD OFF, compass, `Pos` from z, scan animation, pipe-curvature times, pair drawing | *different* + 4 *partials* + 2 cosmetics | tofd, lamination_check |
| F45 | Weld condition toggles: root corrosion, rough surface, misalignment, WT variation | **M1** | utman_functions |
| F46 | TKY curved chord / complete pipe ring configuration | **M18** | tky |
| F47 | TKY panel refresh + layout + defect-placement modal + pipe-thickness dialog | *different* + 3 cosmetics | tky, zero_probe |
| F48 | Pipe plan dial position pointer, 9 o'clock datum, both flank rulers, red weld strip | 2 *partials* + 3 cosmetics | drawing_defects_i, drawing_defects_ii, zero_probe, utman_functions, how_to_use_the_epoch |
| F49 | 3D pipe defect marks and the `utsim.co.uk` banner | *partial* + cosmetic | drawing_defects_i, angle_probe_using_the_v2, utman_functions |
| F50 | AUT wording and gate defaults | cosmetic | utman_software |
| F51 | Instructor annotation toolkit: SHIFT+F12 overlay, Tools ▸ Draw palette, highlight pointer | **M17** | shear_wave, tky, how_to_use_the_epoch |
| F52 | `AccRej` toolbar button | coverage §7 *missing* | utman_software |
| F53 | 'OK' startup splash / demo specimen | coverage §7 *missing* | utman_software |
| F54 | File ▸ Save screen shot (PNG) | *different* | utman_functions |
| F55 | Menu bar: `Scale Mode` and `About` at top level; Help contents index | *different* + cosmetic | utman_software, utman_functions |
| F56 | Lamination-check screen fidelity: welded plate, V1/V2 reachable | *partial* | lamination_check |
| F57 | Original hints, captions and colour cues | *different* + cosmetics | 8 videos |
| F58 | 'UTman Video' window — lessons are the sanctioned substitute (documented) | coverage §7 *missing* | utman_functions |
| F59 | UTman velocity set (3200 / 5960) as an optional material | minor + cosmetic | angleprobe_calibration, shear_wave, epoch_auto_calibration |

---

## 1. New/changed files and ownership

```
src/00-core.js         (frozen, updated by the lead)  + defaultState v3 fields (§2); dom.fileOpen(accept) →
                       Promise<{name, dataUrl, text}> (a hidden <input type=file>, no network); dom.win gains
                       `alwaysOnTop`; UT.math.fitLine(pts) → {angleDeg, a, b, rms}
src/10-specimens.js    (frozen, updated by the lead)  F45 weld condition flags in weldGeometry/plateWeld/
                       pipeWeld; F46 tky {kind, chordOd, chordWt} + curved chord outline/arcs; F21 preset
                       z centring; F10 v2 wide-face hole + graduations; F41 `polygon` builder + build('polygon');
                       F53 `okDemo` specimen; F56 laminationPlate weld outline; F59 material 'carbon-utman'
src/20-probe.js        F14 both-mode derive(), F15 statusLine wording, F16 'Normal 0°' + range rescale    owner: physics-1
src/30-raytrace.js     F17 fractional skips, F18 nearBoost at 0°,   (F22 is NOT a raytrace change - 4.10)
                       F45 root-corrosion / rough-surface scatter, F10 4th V2 radius multiple,
                       F41 polygon specimens (no pipe-specific change — see the lead correction 1)   owner: physics-2
src/40-ascan.js        F23 echo-driven depth, F45 rough-surface grass/transfer, F59 material wiring    owner: physics-3
src/50-tofd.js         F43 parallel-scan buffer, F44 (OFF flag, scan animation z, pipe curvature times) owner: physics-4
src/55-aut.js          F50                                                                             owner: physics-5
src/56-pa.js           F24                                                                             owner: physics-5
src/60-view-cross.js   F13 side flip on drag, F14 twin fans, F15 hues, F20 mirrored probe, F26 right-drag
                       LOF + Alt-erase, F31 draw-region box, F32 depth shading, F35 block marks,
                       F39 block ruler + mirrored X ruler, F42 skip graduations, F46 curved chord drawing,
                       F41 image + polygon underlay                                                    owner: ui-1
src/62-view-plan.js    F20, F32, F48, F29 (circle-view header/labels/graduations)                       owner: ui-2
src/64-view-3d.js      F49, F21 (defect z-extent bands)                                                 owner: ui-3
src/66-view-plotter.js F36 lines + degree caption, F37 BS/K captions, F38 weld overlay, F39 dots/hook/ruler owner: ui-4
src/70-instruments.js  F1 powered, F3 on-LCD wizard rendering, F5, F6, F7 (unCalibrate/records),
                       F8 chrome + float/dock, F40 DAC draw mode                                        owner: ui-5
src/80-modes.js        F2 F3 F4 F9 F11 F12 F25 F27 F28 F29 F30 F33 F34 F45 F46 F47 F56 F57              owner: ui-6
src/82-lessons.js      lesson setups for the new surfaces (F8 skin auto-switch, F10 lesson 6/19 on 60°), F58 owner: training-1
src/84-trade.js        F33 reuses the trade lock helper (`UT.trade.lock`)                               owner: training-2
src/85-scalemode.js    NEW: F41 F42 (windows `scale`, `protractor`; UT.scalemode; UT.test.scale)        owner: ui-7
src/86-annotate.js     NEW: F51 (overlay `div#annot`, window `draw`; UT.annotate; UT.test.annot)        owner: ui-8
src/90-app.js + style.css  menus for everything (§8), F7 F19 F23 F52 F53 F54 F55, status-bar cells      owner: ui-9
src/92-i18n-ko.js      NEW keys for every string added by v3 (§10)                                      owner: i18n
tools/acceptance.mjs   + V3-1…V3-64 (§9)                                                                owner: qa-1
index.html             script order (lead): 00,10,20,30,40,45,50,55,56,60,62,64,66,70,80,82,84,85,86,90,92,94
```

**Integration rules for the two NEW modules** (SPEC §15.1–15.3, SPEC-v2 §1 — binding, restated because a
new module is where they get broken):

- One IIFE per file: `(function (UT) { 'use strict'; … })(window.UT = window.UT || {});`, `'use strict'`
  inside, no `import`/`export`, no top-level `const` outside the IIFE.
- Namespace: **`UT.scalemode`** (85) and **`UT.annotate`** (86). Never assign to another module's namespace.
  `UT.views = UT.views || {}` is not needed — neither module is a canvas view in the §15.6 sense.
- **No DOM at load time** (SPEC §15.12): at IIFE evaluation time do not reference `document`, `window.*`
  other than `window.UT`, `requestAnimationFrame`, `ResizeObserver`, `localStorage`, `performance`,
  `FileReader`, `Image`, `URL` or `CompressionStream`. `node tools/node-load.mjs --selftest` must run both
  files clean, and each must export `__selftest()` returning `[]` or failure strings from pure helpers only.
- CSS: each exposes a string `UT.<name>.css` scoped under its own selectors
  (`.win[data-win=scale] …`, `#annot …`) and calls `UT.dom.injectCss('scalemode', UT.scalemode.css)` /
  `injectCss('annotate', …)` **inside `open()`/`mount()`**, never at load time. `style.css` stays owned by
  90-app. No `</style>` / `</script>` sequences inside the strings.
- Test API: extend with `Object.assign(UT.test, { … })` only. Nested namespaces `UT.test.scale` and
  `UT.test.annot` are **created by their owning module** (85 and 86 respectively) and extended by others
  only with `Object.assign(UT.test.scale, {…})`.
- Guards for absent modules: 90-app reaches both only through its existing
  `has('scalemode.window')` / `toggleWindowOf('scalemode.window')` pattern, so a build without them still
  boots; 85/86 in turn guard every cross-module call (`if (UT.modes && UT.modes.enter) …`,
  `if (UT.views && UT.views.cross) …`).
- State: neither module may call `UT.set`/`UT.setIn` from inside a `'render'` listener without
  `{noRender: true}`, and never synchronously — use `setTimeout(0)` (SPEC-v2 §1). Per-render buffers
  (the annotation stroke being drawn, the traced polygon in progress) live at module level, not in state.
- Windows: `UT.dom.win({name: 'scale', title: 'ADJUST SCALE', …})` created **lazily on first `open()`**,
  registered in `UT.dom.wins`, listed in §8.
- `85-scalemode.js` may not read files from anywhere but a user-initiated `<input type="file">`
  (`UT.dom.fileOpen`) — no `fetch`, no external URLs (see §11.9).

---

## 2. State additions (`UT.defaultState()` — written by the lead; use exactly these names)

Single sources of truth: `weldOpts.misalignmentMm` is the only high-low value (the drawing derives the
step); `plot.blockMarks` (marks drawn on the block, F35) is distinct from the v1 `plot.edgeMarks` (marks
recorded by the button and drawn on the card) — both are kept and both are cleared by `Erase Plotting` /
`tb-clear`. `instrument.powered` is the F1 flag; the USK 7 window's *existence* stays independent of it.
`scaleMode.mmPerPx` is authoritative; the ADJUST SCALE slider is a mirror written only by 85.

```js
// ---- v3 additions / changes to UT.defaultState() (merge into the v2 object; comments are normative)
instrument: { /* …v2… */
  powered: true,                       // F1: false blanks the trace, keeps grid + window + panel
},
weldOpts: { /* …v2… */
  rootCorrosion: false,                // F45: bumpy, echoing root bead
  roughSurface: false,                 // F45: scanning-surface roughness (transfer loss + grass)
  misalignmentMm: 0,                   // F45: high-low step at the joint, −5…+5 mm (0 = aligned)
  wtVariationMm: 0,                    // F45: pipe wall-thickness variation, 0…4 mm peak-to-peak
},
autocal: { /* …v2: stage, t1, d1, d2 */
  entered: { thin: null, thick: null },// F3: the values the trainee typed/arrowed (mm), null until entered
  field: 0,                            // F3: the live value of the on-LCD entry field (mm)
  source: 'specimen',                  // F2: 'specimen' (current specimen backwalls) | 'step' (forced step wedge)
  rangeAfter: null,                    // F4: the range set after a successful cal (mm), null before
},
plot: { /* …v2: points, edgeMarks, mirror, refPct, cardStyle */
  lines: [],                           // F36: [{pts:[{standoff, depth}], colour:'green'}] — freehand edge lines & rungs
  blockMarks: [],                      // F35: [{x /* mm on the block surface */, side /* ±1 */, hole /* mm depth or null */}]
  ruler: { on: false, x: 0, view: 'plotter' },  // F39: 'plotter' | 'block'; x = mm of the ruler's 0 mark
  bs: null,                            // F37: {angleDeg, k20, k12, k6, n} written by 66 when ≥2 marks per side exist
  overlay: false,                      // F38: true = plotter card over the current weld (not the IOW block)
},
scaleMode: {                           // F41/F42 — owned by 85-scalemode
  on: false, mmPerPx: 0.5,             // 0.05…5.0 mm per CSS px of the cross-section canvas
  picture: null,                       // {name, dataUrl, w, h, x, y} — data: URL only, never persisted
  outline: [],                         // [{x, y}] traced boundary in mm (closed, ≥3 points) → the polygon specimen
  protractor: null,                    // {x, y, rotDeg} in mm, or null when hidden
  magnify: false, gradStepMm: 5,       // F42: skip-line graduations every gradStepMm along each drawn skip
},
annot: {                               // F51 — owned by 86-annotate
  on: false,                           // SHIFT+F12 teaching-aid drawing mode
  tool: 'pencil',                      // 'pencil' | 'line' | 'eraser'
  strokes: [],                         // [{colour:'red'|'blue', tool, pts:[{x,y}] /* design px */}] cap 200
  torch: false,                        // Options ▸ Highlight pointer
  shown: false,                        // the STEP notification dialog has been shown once
},
tofd: { /* …v2… */
  ascanOn: true,                       // F44: the RF A-scan sub-window's OFF button (mode stays)
  parallel: null,                      // F43: {z0, z1, step, n, cols: Uint8Array} — ALWAYS null in state (module buffer in 50)
},
display: { /* …v2… */
  depthEcho: true,                     // F23: show 'Depth = …' from the strongest/gated echo
  defectShade: true,                   // F32: shade defects by mean depth
  alwaysShowControls: false,           // F7: pin the USK 7 controls on screen
  instrumentFloat: false,              // F8: float the EPOCH skins instead of docking them left
  drawRegion: null,                    // F31: {x, y, w, h} in mm; null = auto (around the weld)
},
editing: { /* …v1: defect, brush */
  lof: false,                          // F26: the current stroke is a right-button single-line LOF
  autoType: true,                      // F28: infer volumetric vs LOF from the stroke
  spotMm: 5,                           // F29: spot/brush diameter in mm (5…45); replaces the 10–60 px spinner
  returnMode: null,                    // F30: the modal mode to re-enter when the editor closes
  keyLock: null,                       // F33: HIDE key code (string) or null = NO KEY
},
tkyOpts: { kind: 'T-joint', braceAngle: 60, braceT: 12, chordT: 20, braceOffset: 0, precision: 1,
           chordOd: 600, chordWt: 32 },   // F46: promoted from 80-modes module state into state (persisted)
```

**Persistence** (SPEC-v2 §2, SPEC §15.9): the record version becomes `v: 3` under the same key `utsim.v1`;
`patchFromRecord` accepts `v` 1, 2 or 3 (older records lack the new keys → defaults). Additionally saved:
`weldOpts` new flags, `display` new keys, `tkyOpts` (coerceLike), `editing.spotMm`, `editing.keyLock`,
`scaleMode.mmPerPx` and `scaleMode.gradStepMm` **only** (never `scaleMode.picture` / `.outline` — a data:
URL can be megabytes), `plot.ruler`, `annot.torch` and `annot.shown` (never `annot.strokes`).
Never persisted and excluded from `UT.test.state()` and `UT.scenario.capture()`: `scaleMode.picture`,
`tofd.parallel`, `annot.strokes`. Not saved while `trade.active` (unchanged).

---

## 3. Instrument, calibration blocks and cal workflow

### 3.1 F1 — Instrument OFF blanks the trace

**Original.** basic_ut_controls: the USK 7 panel sits on screen with a grid-only blue CRT until it is
switched on; the `OFF` button is a power button, not a window close. tofd f062/f068: the TOFD A-scan
sub-window's `OFF` removes only the RF overlay — the D-scan, `Run Scan` and the whole TOFD screen stay.
**Ours today.** USK 7 `OFF` closes the window (leaving a "Show USK 7" dock button); TOFD `OFF` exits the
entire mode.

**Required.** `instrument.powered` (default `true`). `UT.instruments.power(on)` toggles it and
`UT.instruments.drawAscan` draws grid, graticule, bezel labels and the magenta CRT text line but **no
trace, no echoes, no DAC, no gates** when `powered === false`; the window, panel, knobs and softkeys stay
mounted and interactive; `frame.ascan` is unchanged (physics keeps running — freeze semantics are separate).
The titlebar `✕` still closes the window. `tofd.ascanOn` does the same for `.win[data-win=tofd-ascan]`:
`OFF` hides that window only; the TOFD window's `Show A-scan` button (and re-entering the mode) restores it;
`UT.modes.exit()` remains the only way out of TOFD mode.

### 3.2 F2 — Auto-cal on the current specimen

**Original.** epoch_auto_calibration f016–f022: the entire calibration is done at ONE probe position on the
20 mm **welded plate** under test — thin standard = the 1st backwall (readout `↓20.00 mm`), thick standard =
the 2nd multiple after gate 1 is dragged onto it (`↓40.01 mm`). The step wedge is never entered.
**Ours today.** `UT.modes.autoCal.start()` force-enters the step-wedge specimen and always prompts "place
the probe on the 10 mm step", even on V1.

**Required.** `autoCal.start()` inspects the current specimen first:

1. If the gated peak already has a backwall-family echo (`echoKind ∈ {'backwall','geometry'}` with
   `tag === 'bottom'`, or any echo whose `path` is within 5 % of a multiple of the local thickness
   `T = spec.thicknessAt ? spec.thicknessAt(probe.x) : spec.T`), keep the specimen:
   `autocal.source = 'specimen'`, `d1 = T`, `d2 = 2·T`, wording per §3.3.
2. Else if the mode is `v1`/`v2`, keep the specimen with `d1/d2` from the face
   (V1 narrow 25/50, V1 wide 100/200, V2 wide 25/50 or 50/125 by `probe.side`, V2 narrow 12.5/25) and the
   word **"backwall echo"** instead of "step".
3. Else fall back to today's behaviour: `enter('step')`, `autocal.source = 'step'`, `d1 = 10`, `d2 = 25`.

The stage-2 prompt tells the trainee to move **gate 1** onto the next multiple, not to move the probe, when
`source === 'specimen'`. `autocal.d1/d2` remain writable from the test API and are overwritten by F3's
entered values before `vel`/`zero` are computed. The cal maths is unchanged (SPEC §15.5):
`vel = 2·(d2 − d1)/(t2 − t1)`, `zero = t1 − wedgeDelayUs − 2·d1/vel`.

### 3.3 F3 — Auto-cal thickness entry, drawn on the instrument LCD

**Original.** epoch_auto_calibration f006/f009/f010/f013 (thin) and f019/f020/f021 (thick). A white box with
a 1 px black border overlays the A-scan area of the EPOCH 4 screen, about 15 %…90 % of the screen width and
a third of its height, holding three lines:

```
ENTER VALUE FOR THIN STANDARD
                       [ 0 ]                ← right-aligned numeric field, sunken border
 AND THEN PRESS Calibration
```

The field runs `0` → `16.50` → `20.00` (the trainee overshoots to `21.6` in f010 and arrows back).
Stage 2 is identical except for the two texts:

```
ENTER VALUE FOR THICK STANDARD
                     [ 42.00 ]              ← arrowed down through 40.3 to 40.0
 AND THEN PRESS ENTER
```

The header keeps showing `GAIN 40dB / REJ 0 % / MIN DEPTH 20.00`, `RANGE 77.6` and the big readout
(`↓20.00 mm` at stage 1, `↓40.01 mm` at stage 2, `↓40.00 mm` after the cal), and the status bar's middle
cell echoes the key function (`ARROW LEFT/DOWN`, `ARROW RIGHT/UP`, `CALIBRATE` — see F6).

**Required.**

- `state.autocal.field` holds the live value; ▲/▼ (and the rotary wheel, `UT.instruments.wheel(n)`) step it
  by **0.10 mm**, `2ND F` + ▲/▼ by **1.00 mm**, clamped 0…500; typing into the field is also accepted.
  It is displayed with 2 decimals while > 0 and as `0` at exactly zero (matching f006).
- Stage 1 confirm is the **CAL** hard key on EPOCH 4 / the `Auto Cal` softkey on EPOCH 600 (caption
  `AND THEN PRESS Calibration`); stage 2 confirm is **ENTER** / `✓` (caption `AND THEN PRESS ENTER`).
  `Esc` / `CANCEL` aborts to `stage 0` leaving `instrument.cal` untouched.
- On confirm, `autocal.entered.thin` / `.thick` are written, `autocal.d1 = entered.thin`,
  `d2 = entered.thick`, and only then are `vel`/`zero` computed.
- **Rendering owner is 70-instruments**, drawn inside `#cv-ascan` for the `epoch4` theme, and as a
  relabelled softkey page (`CAL THIN | CAL THICK | CANCEL`, F1–F3) plus the same overlay box for
  `epoch600`. The generic floating `autocal` window (80-modes) remains for the `usk7` skin and for
  headless use; it must show the same two captions and the same field.
- 80-modes keeps ownership of the state machine: `autoCal.start()`, `autoCal.step()`, `autoCal.cancel()`,
  plus new `autoCal.setField(mm)` and `autoCal.confirm()`.

### 3.4 F4 — Post-cal range re-set

**Original.** f016 → f022: `RANGE 77.6` before the cal, `RANGE 50.0` after it, so the calibrated 20/40 mm
echoes land on graticule divisions 4.0 and 8.0.
**Required.** On a **successful** two-point cal, 80-modes sets the range to the smallest preset that still
shows the **deepest path the cal itself had to display**, with 10 % headroom — one rule, two inputs:

```
deepest = (twoMultiple ? d2 : 2·d2)                       // mm
range   = min(r ∈ {10, 20, 50, 100, 125, 250, 500} : r ≥ 1.1 · deepest)   // 500 when none fits
twoMultiple = autocal.source ≠ 'step' and d1 > 0 and |d2 − 2·d1| ≤ 0.05·d1
```

`twoMultiple` is the **one-position** cal of §3.2: the probe never moves, `d1` is the backwall and `d2` is
its own 2nd multiple, so the deepest echo the trainee had to gate *is* `d2` and the screen only has to reach
it. Two **separate** standards (`source === 'step'`, or any `d2` that is not ≈ 2·`d1`) are gated one at a
time on their own backwalls, and the set is left able to show the thick standard's 2nd multiple, so the
deepest path is `2·d2`. The result is recorded in `autocal.rangeAfter`; `delay` is left alone.

Worked examples (rows 1–2 are asserted by V3-4, §9.1; all three by 80-modes' `__selftest`):

| `source` | `d1 / d2` | `twoMultiple` | `deepest` | `1.1 · deepest` | `range` |
| --- | --- | --- | --- | --- | --- |
| `specimen` | 20 / 40 | yes | 40 | 44.0 | **50.0** — the video (f022) |
| `step` | 10 / 25 | no | 50 | 55.0 | **100.0** |
| `specimen` | 10 / 25 | no (25 ≠ 2·10) | 50 | 55.0 | **100.0** |

Cancelling a cal never changes the range.

### 3.5 F5 — Softkey and key detail

Fold-ins, all in 70-instruments:

- **Range presets.** While `instrument.selectedParam === 'range'`, the P-row (EPOCH 600 `P1…P7`) is
  relabelled `10.0 | 20.0 | 50.0 | 100.0 | 125.0 | 250.0 | 500.0` mm and a press applies that range;
  leaving the parameter restores page switching. On the `epoch4`/LTC theme the row is
  `10.0mm | 20.0mm | 50.0mm | 100.0mm` (f028) on F1–F4.
- **Trig ▸ Diameter.** The Trig sub-page becomes `Angle | Thick | X Value | CSC | Diameter`. `Diameter`
  edits `instrument.trig.diameter` (mm, default `weldOpts.od`); with `CSC On` the SD/DP readouts apply the
  curved-surface correction for that diameter. `CSC` stops being a stub: `Off | On`.
- **Gate ▸ Status.** The Gate1/Gate2 sub-page becomes `Zoom | Start | Width | Level | Alarm | Status`;
  `Status` toggles `gates[n].on`.
- **F-key press flash.** Any `.ik-f` / `.ik-p` click adds class `.pressed` for 200 ms (yellow, per the
  original's lit key in how_to_use_the_epoch).
- **EPOCH model family.** `Options ▸ UT Set` gains `EPOCH LTC` as a **cosmetic preset over the epoch600
  canvas theme**: the green LCD tab row `BASE | GATES | PULSER | RECEIVER`, the parameter line
  `VEL … ZERO … ANGLE …` / `THICK … CSA … DIA …`, the quick-range row and the `CAL THIN | CAL THICK |
  CANCEL` softkeys of f028. `Epoch Lite / 4B / III` and `Delete EPOCH records` are **not** separate skins —
  see §11.2.

### 3.6 F6 — Key-function hints in the status bar

**Original.** Hovering or pressing an instrument key echoes its function into the status bar's **middle**
cell — the same cell that otherwise shows `Depth = …`: `CALIBRATE` (f013), `ARROW LEFT/DOWN` (f010),
`ARROW RIGHT/UP` (f019), `PULSAR` (f022), `NEXT GROUP`, `FREEZE`.
**Required.** On `mouseenter`/`focus` of any `[data-tip]` element inside `#instrument` or the USK 7 window,
70-instruments calls `UT.status({ mid: tipText })` with the **upper-case short form** from
`UT.instruments._.TIPS` (a new `short` field per entry, e.g. `CALIBRATE`, `ARROW RIGHT/UP`, `NEXT GROUP`,
`FREEZE`, `PULSAR`, `GATES`, `RANGE`, `PEAK MEM`, `2ND F`); on `mouseleave`/`blur` the normal mid line is
restored on the next `'render'`. `title` tooltips stay for accessibility. The short forms are i18n keys
(§10) but are **not** translated on the physical-key echo — an instrument's key legends stay English, as
the legends themselves are.

### 3.7 F7 — UnCalibrate, EPOCH records, Always Show UT Controls

**Original.** `Options ▸ UnCalibrate` knocks the set out of calibration so students must recalibrate;
`Delete EPOCH records` clears stored setups; `Always Show UT Controls` pins the USK 7 controls on screen.
**Required.**

- `Options ▸ UnCalibrate` → `UT.instruments.unCalibrate()`: sets
  `instrument.cal = { vel: 5.60 + 0.6·(rnd − 0.5), zero: 0.4 + 0.4·rnd }` rounded to 2 dp using
  `UT.math.rng(Date.now() & 0xffff)`, i.e. a wrong velocity in the same family as the v1 step-wedge preset
  (5.30…5.90 mm/µs) and a wrong zero (0.20…0.60 µs), then
  `UT.status({ right: 'The set is out of calibration — recalibrate on V1, V2 or the step wedge' })`.
  It never touches gain, range or gates. Idempotent-safe (calling it twice just re-randomises).
- `Options ▸ Delete EPOCH records` → clears `instrument.datalog` (with a
  `UT.dom.confirm('Delete all stored records?', {title:'Delete EPOCH records'})`).
- `Options ▸ Always Show UT Controls` → `display.alwaysShowControls`; when true the USK 7 window is shown
  on every mode entry and its close button hides rather than closes it.

### 3.8 F8 — USK 7 chrome, floating and the default set

**Original.** basic_ut_controls / utman_functions f020: a standalone bright deep-blue A-scan window
(ground `#0000C0`-family, lighter blue grid, cyan 1.5 px trace, **yellow `0 2 4 6 8 10` labels on a bezel
strip below the glass**, no on-glass text), coarse **and** fine arrow pairs above `RANGE` and `X-SHIFT`, a
large red rotary `AMP` knob, `SUPPRESSION OFF`, `OFF`, `KRAUTKRÄMER USK 7`. Every 2009-era video runs on
this set; epoch_auto_calibration f016 shows the EPOCH **floating** top-left over an enlarged specimen view.
**Required.**

- Bezel labels `0 2 4 6 8 10` drawn in `#ffff60` on a strip **below** the CRT (not on the glass); the
  magenta on-glass `AMP nn dB  Suppr OFF  ANGLE nn°` line becomes an Options toggle
  (`Options ▸ Show A-scan overlay text`, default **on** so v2's checks are unaffected).
- A second (×10) arrow pair beside RANGE and X-SHIFT (`◀◀ ◀ ▶ ▶▶`), stepping 10 % / 10 mm.
- The vertical gain slider is replaced by a round red rotary knob (drag or wheel = ±0.5 dB, Shift ×10);
  keep an invisible `<input type=range aria-label="AMP (dB)">` for keyboard and test access.
- USK 7 trace theme: ground `#0000C0`, grid `#4040e0`, trace `#40ffff`.
- `display.instrumentFloat` (Options ▸ Float instrument panel) puts the EPOCH skins in a draggable window
  instead of `#instrument`; the layout then gives the freed column to the views.
- **Default UT set stays `epoch600`** (§11.1), but lessons 2, 3, 5/17 and 7 call
  `UT.app.setUtSet('usk7')` in their `setup()` so every USK 7 lesson looks like the video.

### 3.9 F9 — 'Turn Probe'

**Original.** A persistent grey `Turn Probe` push-button on the V1/V2 block screens flips the probe to face
the other radius, switching the echo series 25/100/175 ↔ 50/125/200 and the status caption. The physics
(`probe.side = ±1`, both sequences, both captions) is already exact in our build — this is a pure UI gap.
**Required.** In `v1` and `v2` modes 80-modes draws a button `Turn Probe` (id `btn-turn-probe`, class
`btn oblique-btn`) in the top-left of the oblique block screen. Click →
`UT.setIn('probe', { side: -probe.side })`, re-render, flip the drawn shoe, and update
`UT.modes.statusMid()`. Exposed as `UT.modes.turnProbe()` and `UT.test.turnProbe()`. The button is present
in `v1` and `v2` only, is keyboard-focusable, and carries `aria-pressed` reflecting `probe.side === -1`.

### 3.10 F10 — V2 wide face

**Original.** angleprobe_calibration / angle_probe_using_the_v2: the V2 drawing shows the **5 mm hole** as a
clear white circle on the angle-probe face, used with the edge graduations for the probe angle/index check;
the status lists **four** multiples — `25mm Radius. Echoes 25, 100, 175, 250 etc` and
`50mm Radius. Echoes 50, 125, 200, 275 etc` — and the 4th is visible at range 250.
**Required.**

- `UT.specimens.v2({face:'wide'})` gains `holes: [{ x: 25, y: 12.5, r: 2.5, tag: 'hole5' }]` (the 5 mm
  through hole at the block's radius centre) and `graduations: [{x, deg}]` every 5° from 35° to 75° along
  the 25 mm radius edge; 60-view-cross draws the hole as a white filled circle with a 1 px dark outline and
  the graduations as 4 px ticks with 10° labels.
- 30-raytrace emits the **4th** V2 radius return (`25/100/175/250` and `50/125/200/275`), and
  `UT.modes.statusMid()` lists four numbers followed by ` etc`.
- Lessons 6 and 19 start on the **60°** probe (the video performs the whole V2 radius exercise at 60°),
  and lesson 19 reads the hole position from `spec.holes` rather than hard-coding it (SPEC-v2 §11 open
  point 3 — now resolved by this feature).

### 3.11 F11 — ASME / A5 chooser and labels

**Original.** The amplitude/plot action opens a modal `Click to Select ASME or A5 Block` with two buttons:
`ASME Block` — *Calibrate for Amplitude and draw DAC* — and `A5 Block IOW` — *Plot Beam Spread on the
Plotter and check Resolution*. The toolbar slot reads `ASME` (utman_software f020) and the block screen is
captioned `ASME BLOCK`.
**Required.** `tb-dac` and `tb-plot` keep their ids and their direct actions **when already in `dac` or
`iow` mode** (so v1/v2 automation is untouched). Otherwise both open the modal
(`UT.dom.win({name:'blockpick', title:'Click to Select ASME or A5 Block', modal:true})`) with the two
buttons and their verbatim sub-captions, routing to `UT.modes.toggle('dac')` and `UT.modes.toggle('iow')`.
The `tb-dac` label becomes `ASME`, its tooltip `ASME / DAC block — calibrate for amplitude and draw DAC`,
and `dacBlock()` gains `labels: [{x, y, text: 'ASME BLOCK'}]` drawn top-right of the block.
`UT.test.click('tb-dac')` must still reach `dac` mode in one call — the modal is bypassed when
`UT.test` drives the click (`activateToolbar(id, {direct:true})`).

### 3.12 F12 — Descending step-wedge preset

`Step Wedge ▸ Steps 20-8 mm (2 mm)` builds `stepWedge({steps:[20,18,16,14,12,10,8]})`, drawn descending
left-to-right with per-step mm labels, matching epoch_auto_calibration.

---

## 4. Probe, beam and echo physics

### 4.1 F13 — The probe turns round across the weld

**Original.** angle_probe_using_the_v2: dragging the probe past the weld centreline mirrors it so it keeps
facing the joint, and `Pos` is shown unsigned.
**Ours today.** A real drag from x = 40 to x = −40 leaves `probe.side = +1`, the beam points away from the
weld, and the status reads `Pos: -40 mm`; the user must instead rotate the compass needle 180°.
**Required.** In the cross-section drag handler (60-view-cross), on every pointer move on a **weld-kind**
specimen (`spec.weld` present, modes `weld|tofd|aut|trade`) set
`side = (x − weldCentre) >= 0 ? +1 : -1` where `weldCentre = spec.weld.capCentre || 0`; the flip happens
once per crossing, is included in the same `UT.set` as the new `x`, and emits one `'ui' probe-drag` event
as before. `UT.views.cross.dragTo(x)` follows the same rule. 90-app renders the Pos cell as
`'Pos: ' + Math.round(Math.abs(x)) + ' mm'` on weld-kind specimens (block specimens keep their absolute
block x). Blocks, TKY, IOW and the step wedge are unaffected. `UT.test.setProbe({x})` does **not** flip the
side (it is a state setter, not a gesture) — only the drag path does.

### 4.2 F14 — Both wave modes below the 1st critical angle

**Original.** shear_wave f045/f050: the `Adjust Angle in Wedge` panel prints, under the two black lines
`Angle of Sound Transmission in Perspex Shoe=20.0°` / `Velocity in Wedge (Shoe) = 2740 m/s`, **two**
coloured lines simultaneously:

```
[ Shear Wave Angle=23.9°   Velocity=3240 m/s]           ← GREEN
[ Compression Wave Angle=48.1°   Velocity=5960 m/s]     ← YELLOW
```

and the cross-section paints a **yellow compression fan and a green shear fan together, at equal
prominence** — the core visual of that lesson. Above the 1st critical angle the compression line and fan
vanish and only the green shear remains.
**Ours today.** `derive()` prints only the active mode and zeroes the other bracket; only the active fan is
prominent (the shear branch appears as faint dashed converted rays); the dialog is monochrome.
**Required.**

- 20-probe `derive()`: when `wedgeAngle < firstCritical`, compute **both**
  `snellAngle(wedgeAngle, vWedge, vShear)` and `snellAngle(wedgeAngle, vWedge, vComp)` and put both into
  `statusLine` in the §14.10 format with their real values (no zeroed bracket). The numerals above are the
  **original's**, printed with its 3.20/5.96 steel; with our default 3.24/5.90 (§11.7) the same wedge 20°
  reads `Shear Wave Angle=23.9°` / `Compression Wave Angle=47.4°   Velocity=5900 m/s`, and only
  `setMaterial('carbon-utman')` reproduces the 23.5° / 48.1° / 5960 m/s of the frame. Both are correct
  physics for their own steel; V3-14 asserts the default pair and V3-59 the UTman pair. Above the 1st critical
  angle the compression bracket reverts to `0.0°` / `0 m/s` exactly as v1/v2 (SPEC §14.10 unchanged for
  the 45/60/70° presets, so V1 #3 and the verbatim-status guards still hold).
  `derived.shearAngle` / `derived.compAngle` are exposed for the views.
- 60-view-cross: when `probe.mode === 'comp'` and `wedgeAngle < firstCritical`, draw a **second full
  fan** at `derived.shearAngle` in green (`#00c000`) with the same ray count and stroke width as the
  compression fan (`#ffd700`). `display.convRays` still controls the faint dashed mode-converted rays.
- 90-app wedge dialog: shear readout line green, compression line amber/yellow, and the mode band segment
  recoloured to match; layout otherwise unchanged.

### 4.3 F15 — Wording and colour semantics

- 20-probe `statusLine`: `Comp' Wave Angle` → **`Compression Wave Angle`** (one string, ~line 204). The
  full v1 format becomes
  `… [ Shear Wave Angle=${θs}°   Velocity=${vs} m/s]   [ Compression Wave Angle=${θc}°   Velocity=${vc} m/s]`.
  SPEC §14.10 is amended accordingly; SPEC-v2's untranslated-key exemption for `#statusbar .sb-left` keeps
  it out of i18n.
- `display.colourCode === 'propagation'` becomes a true **by-wave-mode** scheme: every compression leg
  yellow `#ffd700`, every shear leg green `#00c000`, mode-converted legs drawn in the colour of the mode
  they became. The existing per-leg scheme is renamed and kept as `Probes ▸ Colour Code Display ▸
  Leg colours` (`display.colourCode === 'legs'`), with the original's hues — leg 1 cyan `#00e0e0`,
  leg 2 yellow `#ffd700`, leg 3 orange `#ff8000`, leg 4 magenta `#ff40ff` (utman_software f048).
  `Geometry` is unchanged. Menu keys: `Mode Propagation`, `Leg colours`, `Geometry`.

### 4.4 F16 — 0° probe status and range

**Original.** utman_functions: selecting 0° replaces the wedge text with a `Normal 0°` segment and the
Range readout converts `94.4` → `173.6` mm (the screen range is fixed in **time**; the mm are re-scaled at
the active wave velocity: 94.4 × 5.90/3.24 = 171.9 ≈ 173.6 for the original's 5.96/3.24).
**Required.** When `probe.angle === 0`, `derived.statusLine` becomes
`Normal 0°   Velocity in Probe Shoe = 0 m/s   [ Compression Wave Angle=0.0°   Velocity=${vc} m/s]` and
`UT.probe.derive()` exposes `derived.rangeScale = vActive / vPrev`. On a probe-mode change
(shear ⇄ comp) 40-ascan multiplies `instrument.range` and `instrument.delay` by `rangeScale` and rounds to
0.1 mm, so the same time window is shown. The conversion is applied **once per mode change** and is skipped
while `instrument.cal.vel` is set by an auto-cal (a calibrated set keeps its range).

### 4.5 F17 — Fractional skips

`Probes ▸ Number of Skips` becomes `Run to UT Screen Range | Half Skip | 1 | 1.5 | 2 | 2.5 | 3` (the
original's list; `4` is kept at the end for v1/v2 compatibility). `display.skips` accepts 0.5-steps;
30-raytrace's leg budget uses `ceil(2·skips)` legs and the drawing stops mid-leg at
`floor(2·skips)` complete legs plus the half. `Run to UT Screen Range` sets
`display.skips = null`, and the tracer then uses `maxLegs = max(2, ceil(2·opts.maxPath/T) + 2)` and the
views draw every leg inside `instrument.delay + instrument.range`. The menu speaks one unit: one skip is a
full V, so every entry draws `ceil(2·skips)` legs (0.5→1, 1→2, 1.5→3, 2→4, 2.5→5, 3→6, 4→8). The ladder is
strictly increasing and no two entries draw the same polyline. The integer entries therefore no longer carry
v1's `legs == skips` meaning; V1 #1–#14 are unaffected anyway because the extra legs lie beyond `opts.maxPath`
at every v1 range.

### 4.6 F18 — Twin-crystal near-surface boost at 0°

**Original.** A twin-crystal 0° probe both loses the initial pulse **and** gains near-surface sensitivity.
**Ours today.** The suppression works but shallow reflectors return bit-identical amplitudes single vs twin
(lamination at 4 mm: 7.9 % both), because `C.nearBoost(lenMm)` is never applied on the 0° defect path.
**Required.** In 30-raytrace, `C.nearBoost` (the existing `TWIN_BOOST 1.5` below 15 mm law) is applied to
`kind ∈ {'defect','corner','lamination','tip'}` echoes whenever `probe.angle === 0 && probe.crystal ===
'twin'`, using the same length argument as `makeEcho`. Backwall and geometry echoes are unchanged (the
twin-probe advantage is near-surface resolution, not backwall gain). Expected result: the 4 mm lamination
reads ≈ 11.9 % twin vs 7.9 % single (+3.5 dB), and the 25 mm backwall is unchanged.

### 4.7 F19 — Through Transmission with a movable receiver

**Original.** utman_software f008: a `UTsim`-titled dialog with an `OK` button and the single line
`SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE`.
**Required.** `probe.rxOffset` (mm, default 0, range −200…+200) offsets the TT / tandem / TOFD receiver
from its auto-placed beam-exit point. `Shift + ArrowLeft/ArrowRight` while `probe.method ∈ {'tt','tandem'}`
steps it by 1 mm (Shift+Ctrl: 5 mm); `Shift + ArrowDown` resets it to 0. Selecting `Through Transmission`
shows the dialog **once per session** with that verbatim line. 30-raytrace uses
`rxIndex = autoRxIndex + probe.rxOffset` for the receive-aperture test; when the offset takes the receiver
off the scan surface it is clamped and the status shows `Receiver off the scanning surface`.

### 4.8 F20 — Mirrored (virtual) probe image

**Original.** utman_functions f044: while scanning, a mirrored virtual probe is drawn on the **far side of
the weld** in BOTH plan and cross-section (hatched green, dashed outline), teaching the skip/mirror concept.
`display.mirror` already exists in core but is unused by the weld views.
**Required.** When `display.mirror` is true, `spec.weld` exists and the drawn beam crosses the weld
centreline, `drawPlan` and `drawCross` additionally draw the probe reflected about `x = weld.capCentre`:
same outline path, 1 px dashed stroke in the probe colour, fill = the probe colour at 25 % alpha with a
45° hatch. The mirror image is never clickable and never drawn in `v1/v2/iow/dac/tky/step/fbh` modes.

### 4.9 F21 — Preset defects reachable from the taught workflow

> **This is the M11 fix, and it is the whole of the "pipe gives no echo" problem.
> `30-raytrace.js` must NOT be touched for it.**

**Reproduction (verified).**

```js
UT.specimens.pipeWeld({od:168.3, wt:20})   // → L = 528.7 (unrolled circumference), defaultProbe.z = 132
UT.specimens.defectPresets.rootCrack(spec) // → zFrom = spec.L/2 − 15 = 249.4, zTo = 279.4
// probe parked at defaultProbe.z = 132 → 117 mm of circumference away → 0 % defect echo.
// probe.z = 264.4 (the defect's own z) → kind 'corner', amp 0.4828, path 40.0, ampPct 40.34 @ 30 dB
//                                        — IDENTICAL, digit for digit, to the same preset on plateWeld.
```

**Required.**

1. Every entry of `UT.specimens.defectPresets` centres its z on
   `zc = (o && o.z !== undefined) ? o.z : (spec.defaultProbe && spec.defaultProbe.z !== undefined ?
   spec.defaultProbe.z : spec.L/2)` — i.e. `zFrom = zc − length/2`, `zTo = zc + length/2` — instead of
   `spec.L/2 − half`. On plates `defaultProbe.z = L/2 = 150`, so **every plate number in v1/v2 is
   unchanged**; on pipes the preset lands under the parked probe.
2. `UT.modes.addPreset(name, opts)` passes `{ z: st().probe.z }` when the probe is on the specimen, so a
   preset added after the probe has been moved lands where the trainee is looking. `UT.test.addPreset`
   inherits this; an explicit `opts.z` always wins.
3. Presets keep a **z extent** (they already carry `length`; the requirement is that `zFrom !== zTo` and
   that `makeDefect` records both), so `62-view-plan` draws the red bar and `64-view-3d` draws the band
   (F49). Any preset whose `length` is 0 is given the default 30 mm.
4. **No change to `30-raytrace.js`.** Any patch to the tracer justified by "pipes give no corner echo" is
   to be rejected in review; the corner/specular rules are already correct on curved backwalls.

### 4.10 F22 — Toe-crack preset geometry (NOT a ray-tracer change)

**Lead measurements (Node, `maxLegs 4`, `maxPath 200`, fan 21, sweeps in 0.5 mm steps to x = 130).
These override the audit text and the first draft of this section — read them before touching anything.**

```js
// A VERTICAL surface-breaking crack already produces a full-skip corner echo, and plate and TKY agree
// to four decimals — the corner rule of SPEC 6.1 2d covers scanning-surface pairs exactly as it covers
// backwall pairs, on flat and curved boundaries alike:
{pts:[{x:8,y:0},{x:8,y:4}]}   on build('tky',{})    -> kind 'corner', amp 0.3882, path 56.6 (45 deg, x 51.5)
{pts:[{x:20,y:0},{x:20,y:4}]} on build('tky',{})    -> kind 'corner', amp 0.3882, path 56.6 (45 deg, x 63.5)
{pts:[{x:9,y:0},{x:9,y:4}]}   on plateWeld({T:20})  -> kind 'corner', amp 0.3882, path 56.6 (45 deg, x 53)
                                                    -> 0.1144 at 60 deg (x 78.5), 0.0884 at 70 deg (x 117)
// The preset's INCLINATION is what kills it, on both specimens equally:
defectPresets.toeCrack  pts (8,0)->(6.5,3) = 26.6 deg from vertical -> no corner echo at any stand-off
// Inclination sweep (plate, 3 mm crack, best corner over 45/60 deg):
//   0 -> 0.2912   5 -> 0.0189   10 -> none   15 -> 0.0219   20 -> none   26.6 -> 0.0116
```

**Why the cliff is correct.** Tilting one face of a right-angle pair by a rotates the returned beam by 2a.
The aperture gate accepts `dev < devMax = 2*halfAngle20dB` (about 6.5 deg), so a 5 deg tilt (10 deg return)
already falls outside it. This is the idealisation the model is built on (a point probe, no roughness); it is
consistent with the backwall corner and must NOT be "fixed" by widening the gate — doing so would move
V1 #8 and every corner amplitude in the suite.

**The actual defect.** `UT.specimens.defectPresets.toeCrack` builds a crack inclined 26.6 deg from vertical,
so the exercise the videos teach — put the probe at full skip, find the toe defect — cannot succeed with it.

**Required (10-specimens only).** `toeCrack` becomes a **near-vertical** surface-breaking crack: first point
on the scanning surface at the weld toe (`x = capWidth/2 + 1`, `y = 0`), second point `{x: same, y: 4}`
(0 deg inclination, height 4 mm). `toeCrackFillet` (v2, fillet-T) keeps its own placement but is likewise
built perpendicular to the face it breaks. No file other than `src/10-specimens.js` changes for this
feature; a patch to `src/30-raytrace.js` justified by "toe cracks give no corner echo" must be
**rejected in review**.

**Documentation duty.** Add to SPEC.md 6.1's corner rule (SPEC NOTE 12) one sentence recording that a planar
reflector tilted more than about 3 deg out of the right angle loses its corner return by design, so lesson
and trade-test geometry must use near-perpendicular cracks when a corner response is the teaching point.

### 4.11 F23 — Echo-driven `Depth =` status cell

**Original.** The status bar shows a `Depth = NN.Nmm` cell whenever the beam is on the defect, independent
of the selected UT set. Ours shows Depth only on cursor hover.
**Required.** 90-app's mid status becomes: `cursor depth` when `state.cursor.y != null` (unchanged,
hover wins), else — when `display.depthEcho` and no key-function hint (F6) is showing — the depth of the
**gated** echo if a gate is on and has a reading, else of the strongest `frame.echoes` entry with
`ampPct ≥ 20` whose `kind ∈ {'defect','corner','tip','lamination'}`, formatted
`'Depth = ' + y.toFixed(1) + 'mm'` from that echo's reflection point `y`. Nothing shows when no echo
qualifies. The cell keeps the v1 format so the verbatim-status guards hold.

### 4.12 F24 — Phased-array shoe fields

The `Phased Array Probe Details` window (56-pa) gains `Shoe Stand Off (mm)` (default 8) and
`Shoe Height (mm)` (default 12), stored as `pa.shoeStandOff` / `pa.shoeHeight`, which offset the aperture
origin along the surface and along the wedge normal respectively (the existing `Shoe Angle`,
`Number of Elements`, `Element Spacing` and `Wedge Velocity 2740` fields are unchanged). Focal-law timing
uses the offset origin, so `pa.focalLaw(60).slope` (V2-11) is unaffected at the default values.

---

## 5. Defect editor and defect rendering

### 5.1 F25 — The STEP 1–5 instructions dialog

**Original.** drawing_defects_ii f005 — a modal window titled `UTman` with a close box and an `OK` button,
carrying this text verbatim (line breaks as shown; the trailing `'Q' or 'W'` fragment is the original's):

```
STEP 1. Draw a defect in the weld CROSS SECTION within the BLUE BOX.
Drawing is activated by mouse click and drag over the weld.
     Use RIGHT mouse to draw single line LOF defect.
     Use LEFT mouse to draw volumetric defects.

STEP 2. Draw the defect position on the circle-view (in the gray pipe side view)
     Eight defect regions can be drawn.
     Select a defect via the Option buttons.

STEP 3. Defects can be moved by shifted right/left cursor key to create
laminations.

STEP 4. Defect length and separation can set by entering values in the text
boxes.

STEP 5. Exit the draw-defect mode by clicking the OK button.

To alter LOF defects use: SHIFT+ 'Z' or 'X' = Rotate, 'A' or 'S' = change size, 'Q'
or 'W'

All defects can be moved with: SHIFT+  LEFT or RIGHT cursor key

Press F1 to redisplay these instructions
```

**Required.** 80-modes shows it (`UT.dom.win({name:'defect-steps', title:'UTsim', modal:true, w:470})`)
the **first** time the defect editor is opened in a session (`localStorage utsim.editorSteps` suppresses it
afterwards, like the quick tour), and whenever **F1** is pressed while the editor is open. The `OK` button
and the close box both dismiss it; dismissing does not close the editor. Two adaptations for a browser:
the right-mouse line gains ` (right-click menu suppressed)` and the sentence
`Use Alt or Ctrl with the RIGHT mouse to erase.` is appended to STEP 1 (F26). The text is one i18n key per
paragraph (§10).

### 5.2 F26 — Right-drag draws a single-line LOF

**Original.** STEP 1: *Use RIGHT mouse to draw single line LOF defect* — used throughout to place LOF on the
fusion face. Ours makes right-drag **erase** brush points, and LOF is only reachable through the Type
dropdown.
**Required.**

- 60-view-cross, while `state.editing.defect`: a plain right-button drag (`ev.button === 2` with neither
  `altKey` nor `ctrlKey`/`metaKey`) collects mm points and on pointerup emits
  `UT.bus.emit('defect:brush', { pts, erase: false, lof: true, brushMm })`. The canvas must call
  `ev.preventDefault()` on `contextmenu` while the editor is open (and only then), so the browser menu
  never appears.
- 80-modes, on `lof: true`: fit a straight line through the stroke with `UT.math.fitLine(pts)` and store a
  **2-point** defect — `pts = [first projected onto the fit, last projected onto the fit]`, `type: 'lof'`,
  `height` = the fitted length's y-extent (min 0.5 mm) — replacing the selected slot.
- Erase moves to **Alt + right-drag** or **Ctrl + right-drag**
  (`{ pts, erase: true }`, semantics unchanged: remove points within 2 mm, drop the defect if < 2 remain).
  An explicit `Eraser` toggle button in the editor's left column does the same with the left button.

### 5.3 F27 — Keyboard defect manipulation

**Original.** STEP 3 and the LOF footnote of f005.
**Required.** 80-modes installs a `keydown` listener on `document` **only while the editor window is open**
(removed on close). It ignores events whose target is an `<input>`/`<textarea>`/`<select>`. Bindings:

| keys | effect |
|---|---|
| `SHIFT + ArrowLeft` / `ArrowRight` | move the selected defect's `zFrom`/`zTo` by **−1 / +1 mm** (with `APPLY TO ALL DEFECTS` ticked: every defect), wrapping on pipes |
| `SHIFT + Ctrl + ArrowLeft/Right` | the same in 10 mm steps |
| `SHIFT + Z` / `SHIFT + X` | rotate a **planar/LOF/crack** defect's `pts` about their centroid by **−1° / +1°** |
| `SHIFT + A` / `SHIFT + S` | scale `pts` about their centroid by **÷1.05 / ×1.05** (clamped so the 2D length stays 0.5…60 mm) |
| `SHIFT + Q` / `SHIFT + W` | move the defect in **depth** by **−0.5 / +0.5 mm** (`pts.y` shifted; clamped to −5…T+5) |
| `F1` | reopen the STEP dialog (F25) |
| `Delete` | delete the selected defect (same as `Delete Defect N`) |

Every change re-renders, updates the caption (F28/F29) live and writes through `UT.set({defects})` (never a
direct mutation). Exposed headlessly as `UT.modes.editorKey(key, mods)` and `UT.test.editorKey(key, mods)`
where `mods = {shift, ctrl, alt}`.

### 5.4 F28 — Stroke auto-classification and the LOF caption

**Original.** The class is inferred from the stroke: blobs give
`VOL Defect 1  Height=0mm Length=30mm. From 20mm  To 50mm` (drawing_defects_ii f050), straight strokes give
a live `LACK OF FUSION  Defect Angle 0   Height=0.5   Top=-0.2` (f085) — and
`LACK OF FUSION  Defect Angle 46  Height=0.998  Top=5.1` for a sloping one — with
`Angle= 90  LOF` in the summary line (drawing_defects_i f038).
**Required.**

- `UT.specimens.defectFromBrush(pts, brush, o)` gains an `auto` path used when `editing.autoType` is true
  and the caller passes `brush === 'auto'`: compute the bounding box of the (decimated) stroke and the
  `UT.math.fitLine` rms. Classify **LOF** when `rms ≤ 0.6 mm` **and** `max(w,h)/max(min(w,h), 0.4) ≥ 4`;
  otherwise **volumetric**. A near-stationary stroke (span < 1 mm) is a spot blob (F29).
- `editorStatusLine()` gains the planar branch: for `type ∈ {'lof','planar','crack','root'}`

  ```
  LACK OF FUSION  Defect Angle {a}   Height={h}   Top={t}
  ```

  where `a = round(|atan2(yLast − yFirst, xLast − xFirst)| in degrees, 0…180)`, `h` = the 2D length's
  y-extent to 3 significant decimals as the original prints it (`0.998`, `0.5`), `t` = `min(y)` to 1 dp
  (may be negative above the surface). The label is `LACK OF FUSION` for `lof`, `CRACK` for `crack`,
  `PLANAR` for `planar`/`root`. Volumetric types keep the verified v1 wording exactly.
- The summary line under the circle view (F29) prints `Angle= {a}  {TYPE}` for planar defects.

### 5.5 F29 — Editor captions, prompts, spinner and defaults

All in 80-modes (with 62-view-plan for the ring), verbatim from the frames named:

- **Empty-slot prompt** (drawing_defects_ii f030/f065):
  `VOL  Defect Num {n}, DRAW DEFECT ON CROSS SECTION BELOW` — the prefix follows the pending type
  (`VOL` / `LOF` / `PLANAR`). (The later UTsim build drops the prefix: `Defect Number 2, DRAW DEFECT ON
  CROSS SECTION BELOW`, utman_software f042. Use the prefixed form.)
- **Selected-defect summary**, drawn in red under the ring once the defect exists (drawing_defects_i f038):
  `Defect Number {n}.  Length={len}mm.  From {zFrom}mm   To  {zTo}mm  Angle= {a}  {TYPE}`.
  The live-drawing caption stays the verified `VOL Defect {n}  Height={h}mm Length={len}mm. From {zFrom}mm
  To {zTo}mm` / the F28 planar form.
- **Circle-View header**: `Circle-View. Position {z}mm` with the live circumferential probe position
  (utman_software; today the number is missing).
- **Depth label**: `Depth = {d}mm` in 11 px black at the **top-centre** of the circle panel, mirroring the
  status cell (drawing_defects_ii f030/f050/f075).
- **Ring graduations**: label every `step = max(10, round(C/12/10)·10)` mm — for the 6-inch pipe
  (C = 528.7) that is 40 mm, giving `0 mm, 40mm, 80mm … 440mm` anticlockwise from 12 o'clock exactly as
  drawing_defects_ii f030. The underlying positions stay the true circumference (see §11.6).
- **Spot spinner**: labelled in **mm**, range 5…45 step 1, default 5, bound to `editing.spotMm`; a
  near-stationary click (`span < 1 mm`) synthesises a circular `pts` outline of diameter `spotMm`
  (`UT.specimens.circlePts(x, y, spotMm/2, 16)`), so a single click at a large spinner value paints a large
  filled blob exactly as in drawing_defects_ii f050 (spinner 50, one click, one big red disc). The red
  preview dot scales with `spotMm` through `UT.views.cross.toPx`.
- **Default brush**: opening the editor sets `editing.brush = 'auto'` with `editing.autoType = true`, so
  the first left-drag produces a **VOL** defect (the original's behaviour); the Type dropdown gains an
  `Auto (from stroke)` entry at the top and selecting any explicit type clears `autoType`.
- **Count spinner** beside the Delete buttons showing the number of defects (read-only, matching f030's
  numeric box).

### 5.6 F30 — OK exits, the modal mode returns, lock scope

- The editor's `OK` handler calls `applyEditorFields()` **then** `editorWin.close()` (STEP 5).
- On open, 80-modes records `editing.returnMode = current()` when that mode is one of
  `{'tofd','aut','tky','iow','dac','lamination','trade'}`; on close it re-enters that mode with
  `{keepProbe: true, silentUI: false}` instead of dropping to pulse-echo. (tofd/tky demand it; the editor
  overlays the modal screen in the original.)
- Lock scope: `DISABLED.editor.menus` drops `'file'` (File and Help stay usable) and
  `DISABLED.editor.toolbar` drops `'pipe'` (the PIPE button stays lit), matching drawing_defects_i.

### 5.7 F31 — Blue draw-region rectangle

**Original.** drawing_defects_i f038/f065: a **blue rectangle** outlines the active drawing region on the
cross-section while the editor is open, and it can be relocated beside the weld to draw parent-plate
defects.
**Required.** 60-view-cross draws, while `state.editing.defect`, a 2 px `#0000ff` rectangle at
`display.drawRegion` (mm) or — when that is null — around the weld:
`{x: capCentre − max(capWidth, T)·0.75, y: −3, w: max(capWidth, T)·1.5, h: T + 6}`. Dragging its border
(within 4 px) moves it (`display.drawRegion` updated, clamped to the specimen extents); dragging inside it
still draws. Strokes started **outside** the rectangle are ignored, with the status hint
`Draw inside the blue box — drag its edge to move the box`.

### 5.8 F32 — Defect depth colour-coding

**Original.** drawing_defects_i: near-OD defects bright red, deeper defects dark red, consistently in the
circle view, the plan view and the cross-section. Ours uses one red (`#e00000`) and reserves dark red for
"selected".
**Required.** When `display.defectShade`, every defect renderer (60, 62 ring + plan, 64) fills with
`lerp('#e00000', '#7a0000', clamp(yMean/T, 0, 1))` where `yMean` is the mean `y` of the defect's `pts`
(laminations use their single depth). **Selection** is shown by a 2 px `#00a0ff` outline plus the existing
blue bounding rectangle in the cross-section — never by a fill colour. A single shared helper
`UT.specimens.defectShade(defect, T)` returns the hex so all three renderers agree.

### 5.9 F33 — HIDE key-code lock

**Original.** `HIDE` prompts `KEY PREVENTS STUDENTS SEEING THE DEFECT` / `Key code will be used to SHOW the
defect` with a `NO KEY` default, so only the instructor can reveal.
**Required.** Pressing `tb-hide` while `display.hide` is false opens a one-field dialog
(`UT.dom.win({name:'hidekey', title:'HIDE', modal:true})`) with those two lines, a text field, and buttons
`OK` / `NO KEY` / `Cancel`. `NO KEY` (and an empty field) hides with `editing.keyLock = null` — today's
free toggle. A non-empty key stores it and, on any un-hide path (`tb-hide`, `Defects ▸ Hide Defects`,
`UT.test.click('tb-hide')`), prompts for it; a wrong key leaves `display.hide` true and shows
`Wrong key code`. The comparison and the lock helper are the trade-test ones
(`UT.trade.lock(key)` / `UT.trade.unlock(key)`, extended by 84 with a plain-string mode); `UT.test`
un-hides through `UT.test.hideKey(code)`.

### 5.10 F34 — Load Def / Save Def as files

`Save Def` writes a `.json` download (`UT.dom.download(name, text, 'application/json')` using a
`Blob` + object URL, revoked after the click) named `utsim-defects-<yyyymmdd-hhmm>.json`;
`Load Def` opens `UT.dom.fileOpen('.json,application/json')` and applies the parsed array through
`UT.specimens.normaliseDefects`. Both keep the existing `localStorage utsim.defects` behaviour as a
fallback (a `Browser storage` checkbox in the editor selects it) and the JSON textarea stays for
copy/paste. No network is involved; failures show `Could not read that file` and change nothing.

---

## 6. Views, modes, teaching aids and shell

### 6.1 Plotter and beam characterisation

#### F35 — Draw-on-block 10 % beam-edge marks

**Original.** plotting_beam_spread f080: dragging along the IOW block's **top surface** leaves short black
tick marks at each 20 dB (10 %) drop probe position, accumulating either side of every SDH. Our own status
bar already promises `Draw on Block to mark 10% Beam Edge`.
**Required.** In `iow` mode (and, with F38, over a weld), a left-drag in `#cv-cross` whose pointerdown is
within **10 px** of the scanning surface does **not** move the probe: it appends
`{x, side: sign(x − probe.x) || 1, hole: <depth of the SDH nearest the leg-1 centre ray, or null>}` to
`plot.blockMarks` at every 2 mm of travel. 60-view-cross draws each as a 6 px black vertical tick rising
from the surface at that x. `Erase Plotting` and `tb-clear` empty `plot.blockMarks` together with
`plot.points`, `plot.edgeMarks` and `plot.lines`. `UT.views.cross.markBlock(x)` and
`UT.test.drawOnBlock(x)` add one headlessly.

#### F36 — Freehand beam-spread lines and the live degree caption

**Original.** plotting_beam_spread f080/f084/f088: dragging on the plotter draws **green freehand edge
lines and rungs** (a ladder between the two 20 dB edges), and a live red caption **`60.0 degree`** sits at
the card's **top-left**, on the graticule. Either mouse button plots; the status offers
`RIGHT OR LEFT mouse button/Drag to PLOT Beam Spread on Plotter`.
**Required.**

- A pointer **drag** on the plotter card records the path into `plot.lines` as
  `{pts: [{standoff, depth}, …], colour: 'green'}` (points decimated to 1 mm), stroked 2 px `#00a000`.
  A **click** (travel < 3 px) still plots a point (F39).
- While dragging, 66 draws `${a.toFixed(1)} degree` in 12 px `#c00000` at (8, 14) px of the card, where
  `a` is the angle of the straight line from the drag's first to its current point, measured from the
  **normal** in the card plane (0° = straight down, 90° = along the surface), i.e.
  `a = |atan2(Δstandoff, Δdepth)|` folded into 0…90, so a line drawn along a 60° beam reads
  `60.0 degree` and along a 70° beam `70.0 degree`. (LEAD CORRECTION, QA round 3: the first draft said
  "from the surface" in the same breath as the 60° worked example, which is its complement and therefore
  self-contradictory. plotting_beam_spread f080 settles it — the caption reads `60.0 degree` while the
  instructor draws along the 60° probe's beam, and 60° is the operator's from-normal probe angle. F37's
  internal edge fit keeps `UT.math.fitLine`'s own from-surface `angleDeg`; only this caption is from-normal.) The caption persists showing the last completed line's angle until `Erase Plotting`.
- Both buttons draw; `Alt`+click removes the nearest point/line (F39).

#### F37 — BS angle and K-factor captions

**Original.** angleprobe_calibration f096–f126, right edge of the plotter graticule, two lines:

```
…angle BS = 7.9°
20dB K=1.08     12dB K=0.704     6dB K=…
```

(the first fragment and the last K value are covered by the instrument window in every available frame —
see §11.5).
**Required.** When `plot.blockMarks` (or `plot.edgeMarks`) hold **≥ 2 marks on each side** of the beam
centre line, 66 fits one line per side through the marks (`UT.math.fitLine`), takes
`BS = (|angleUpper − angleLower|)/2` in degrees, and writes
`plot.bs = { angleDeg: BS, k20, k12, k6, n }` with

```
K(dropDb) = crystalA · sin(BS(dropDb)) / lambda      // crystalA = derived.crystalA (mm), lambda = derived.lambda (mm)
```

evaluated at the measured 20 dB spread and, for the 12 dB and 6 dB rows, at the theoretical ratios of the
same piston law (`K12 = K20 · 0.652`, `K6 = K20 · 0.519`, the ratios the original's 1.08 / 0.704 / 0.56
table encodes). It draws, right-aligned at the graticule's right edge in 11 px `#000`:

```
Beam spread half angle BS = {BS.toFixed(1)}°
20dB K={k20.toFixed(2)}   12dB K={k12.toFixed(3)}   6dB K={k6.toFixed(2)}
```

For the video's case (5 MHz, ⌀5 shear, BS 7.9°) this reproduces `K=1.08`, `12dB K=0.704`, `6dB K=0.56`.
`UT.test.bs()` returns `plot.bs`.

#### F38 — PLOT on the current weld

**Original.** angle_probe_using_the_v2: the plotter card overlays the **weld under inspection**, so a weld
defect is plotted against the weld's own mirror image (`HALF SKIP BEAMPATH=40mm` / `STANDOFF=35mm` for
T = 20, defect marked red). Ours force-loads the IOW block, so the flaw-location exercise on a weld is
impossible.
**Required.** `tb-plot` (and `Tools ▸ Plotter`) becomes an **overlay** when the current mode is
`weld`/`tofd`/`aut`/`trade`/`tky`: `plot.overlay = true`, the specimen and probe are **kept**, the plan view
is replaced by the card (as today), `plot.cardStyle = 'weld'` (the v1 hatched-plate variant), and every
defect is drawn on the card as a red mark at its (standoff, depth). Pressing it again clears the overlay
and restores the plan view. The IOW block is reached by `Step Wedge ▸ A5 IOW block` and by the F11 chooser
(`A5 Block IOW`), which still enters mode `iow` — the beam-spread lesson is unchanged, and V1/V2 checks
that call `UT.modes.toggle('iow')` or `loadSpecimen('iow')` are untouched.

#### F39 — Ruler, dots, hook, hints

- **Movable ruler.** The translucent `0mm 10mm … 80mm` strip becomes draggable and can sit on the
  **plotter card** or on the **block surface** in the cross-section (plotting_beam_spread f080), sharing
  `plot.ruler = {on, x, view}`. Double-click resets it under the probe index.
- **X ruler in `iow`.** Labels become the mirrored distance from the probe index
  (`100 … 10 0 10 … 100`) instead of the absolute block x, matching the original on both blocks and welds.
- **Plot points.** Drawn as 3 px filled `#009900` dots (not black crosses); **either** mouse button plots;
  `Alt`+click removes the nearest point.
- **Probe-angle hook.** A short 2-segment red hook where the beam centre line meets the top stand-off
  ruler (plotting_beam_spread f080), 8 px long, `#c00000`.
- **Hint variants.** The `iow` hint starts as the verified
  `Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge` and switches,
  after the first point/line/mark, to
  `RIGHT OR LEFT mouse button/Drag to PLOT Beam Spread on Plotter. Draw on Block to mark 10% Beam Edge`.

#### F40 — Hand-drawn DAC curve

After ≥ 2 recorded DAC points, a pointer drag on `#cv-ascan` lays the DAC polyline
(`instrument.dac.hand = [{xDiv, pct}]`), snapping to within 6 px of a recorded point, with the status
`LEFT mouse button/drag to draw curve`. `Draw Curves` (the interpolating button) stays and clears
`dac.hand`. On the `usk7` theme the main DAC is drawn in the theme's magenta (`#ff40ff`) as in
making_sense, with `+` point ticks and the `DAC` label; EPOCH themes keep the v1/v2 yellow.

### 6.2 Scale Mode

#### F41 — Scale Mode (new module `85-scalemode.js`, namespace `UT.scalemode`)

**Original.** utman_software f020–f036 — the promo video's longest segment. `Scale Mode` is a top-level
menu; entering it clears the client area to a white sheet with **graduated rulers along the top and left
edges**, and opens a small floating window titled **`ADJUST SCALE`** containing, top to bottom:

1. a horizontal scrollbar (`◀ [thumb] ▶`) — the mm-per-pixel scale;
2. a row of eight small **weld-geometry icon buttons** (butt/bevel/T variants, circle, ellipse) followed by
   an **`OK`** button;
3. a row of four buttons: **`Capture`** | **`Load Pic`** | **`Pipe`** | **`Protractor`**.

The instructor loads any picture or drawing, calibrates mm/px against the rulers, drops a **protractor**
overlay (a semicircular 0–180° scale that snaps its centre to the probe index, f032), and scans the
arbitrary shape live with the USK 7 A-scan responding to the traced boundary (f024 the "O" ring, f028/f032
a hand-drawn T-joint, f001 the "OK" splash with the probe on the "K").

**Required.**

- `UT.scalemode = { enter(), exit(), on(), window /* 'scale' */, loadPicture(file|dataUrl),
  setMmPerPx(v), trace(pts), clearTrace(), protractor(show), capture(), css, __selftest }`.
- **Entering** sets `scaleMode.on = true` and calls `UT.modes.enter('scale', {silentUI:true})`; 80-modes
  gains mode `'scale'` with
  `DISABLED.scale = { toolbar: ['v2','v1','dac','plot','tky','tofd','aut','pipe','defect'], menus: ['weld','defects'], hidden: ['plan','compass'] }`
  and `HINTS.scale = 'Load a picture, set the scale, then LEFT mouse button/drag to move the UT Probe'`.
- **Picture import** is the only file path a single-file offline HTML can offer: a user-initiated
  `<input type="file" accept="image/*">` via `UT.dom.fileOpen`, read with `FileReader.readAsDataURL`, stored
  as `scaleMode.picture = {name, dataUrl, w, h, x: 0, y: 0}`. **No network, no external URLs, no clipboard
  paste requirement** (a `paste` handler for `image/*` is a nice-to-have and must degrade silently).
  `Capture` renders the current `#cv-cross` + `#cv-plan` into an offscreen canvas and uses its
  `toDataURL('image/png')` as the picture — this is the browser-safe reading of the original's screen
  capture. Pictures are capped at 8 MP and 4 MB of data URL; larger files are refused with
  `Picture too large — use one under 4 MB`.
- **Scale.** `scaleMode.mmPerPx` (0.05…5.0, slider + numeric field, 3 significant figures) sets the
  cross-section transform in Scale Mode: `toPx(x) = originPx + x/mmPerPx` (60-view-cross uses it instead of
  its fixed `canvasWidth/320` scale, §14.1, when `state.mode === 'scale'`). The top and left rulers are
  drawn by 60 with ticks every 10 mm and labels every 50 mm.
- **Tracing.** `Trace boundary` (added to the icon row) starts a polygon trace: each click adds a vertex,
  double-click / `OK` closes it. The polygon becomes a specimen through a new lead-owned builder
  `UT.specimens.polygon({outline, T, material})` (registered in `build('polygon')`), which runs the normal
  `finish()` path so the tracer, A-scan and views work unchanged. `scaleMode.outline` holds the mm
  polygon. The eight icon buttons load canned outlines (butt weld, single-bevel, T-joint, ring/pipe,
  ellipse, plate, step, "OK" letters) so the mode is usable without a picture.
- **Pipe** turns the traced outline into a closed ring of the same wall thickness (the original's `Pipe`
  button), i.e. the outline is offset inward by `T` and both loops are kept.
- **Protractor.** `scaleMode.protractor = {x, y, rotDeg}`; drawn by 60 as a 60 mm-radius semicircular
  scale with 1° ticks, 5° medium and 10° labelled, a red baseline and a red index hook. It snaps its centre
  to the probe **index point** when dropped within 8 mm of it, and is dragged/rotated by its rim
  (Shift = 1° steps). Hidden when null.

#### F42 — Scale Mode magnified skip graduations

**Original.** utman_functions: a magnified view in which the drawn skip lines carry **surface-distance
graduations** — red/blue diagonals labelled 55 … 120 mm with the out-of-plate zones crosshatched.
**Required.** `Scale Mode ▸ Skip graduations` sets `scaleMode.magnify = true`; 60-view-cross then
(a) zooms the cross-section by ×2 about the probe index, (b) stamps a tick every
`scaleMode.gradStepMm` (default 5 mm) along **each drawn beam leg**, labelling every 5th tick with the
cumulative **surface distance** in mm (`path·sinθ` from the index), leg 1 in red `#c00000` and leg 2 in
blue `#0000c0`, and (c) crosshatches the area outside the specimen outline at 45°, 6 px pitch,
`rgba(0,0,0,0.25)`. It works in `scale` mode and in `weld` mode (where the original demonstrates it).

### 6.3 TOFD, TKY, pipe and AUT

#### F43 — TOFD Parallel Scan strip

**Original.** tofd / utman_software f008: two labelled greyscale strips fill during one `Run Scan` —
**`Non-Parallel Scan`** (left, the full-length D-scan) and **`Parallel Scan`** (right, shorter), each with
its caption in 11 px black at its top-left.
**Required.** The existing D-scan is captioned `Non-Parallel Scan`. A second buffer of the same 8-bit
greyscale kind is built in the same `runScan()`: the pair is stepped **along the beam direction** (probe
`x` from `−pcs` to `+pcs` in `n = 61` steps) with `probe.z` fixed at the defect's centre (or the scan
centre when there is no defect), giving the classic parallel-scan hyperbola. It is stored in the module
buffer and mirrored as `state.tofd.parallel = null` in state (module buffer in 50, like `bscan.columns`).
Canvas `cv-tofd-parallel` (120 × 450) sits right of the D-scan, replacing the 2× magnifier, which moves
under it (140 × 140). `UT.test.tofdParallel()` returns `{x0, x1, step, n, peakCol}`.

#### F44 — TOFD chrome, position and pipe times

- **OFF** hides only `.win[data-win=tofd-ascan]` (F1); a `Show A-scan` button in the TOFD window restores
  it; mode exit stays on the TOFD window's close box.
- **Compass** stays on screen in `tofd` and `lamination`: `'compass'` is removed from
  `DISABLED.tofd.hidden` and `DISABLED.lamination.hidden` (this is what our own comment in
  `62-view-plan.js` already assumes).
- **`Pos:`** in `tofd` mode is rendered from `probe.z` (`'Pos: ' + Math.round(probe.z) + ' mm'`), matching
  the original's `Pos: 194 mm` / `Pos: 26 mm` as the scan or a D-scan click moves along the weld.
- **Scan animation** sets `probe.z` to the column being written on each animation tick, so the plan-view
  pair travels, the dial rotates (F48) and the 3D pipe line sweeps. `runTofdScan()` (synchronous) restores
  the original `probe.z` when it finishes.
- **Pipe curvature.** When `spec.pipe`, the backwall event reflects at the **inner radius**: with
  `ri = od/2 − wt` and half-PCS `s = pcs/2`, the reflected path is
  `2·sqrt(s² + (ro − sqrt(ri² − s²·(ri/ro)²))²)` evaluated by the existing Fermat search over the inner
  arc rather than the flat depth `T`; the lateral wave is unchanged. For the video's 6-inch WT 20 pipe at
  PCS 60 this lengthens the wedge-zeroed backwall time from the flat-plate 12.22 µs toward the observed
  **10.41 µs** family — the acceptance requirement is only that the pipe time differs from the flat-plate
  time by ≥ 0.15 µs in the correct direction and that the flat-plate numbers (V1 #11, V2-10) are untouched.
- **Cosmetics.** The plan view draws the pair as **two** 24 × 16 mm green boxes at ±pcs/2 with dotted beam
  lines between them (superseding SPEC-v2 F4, which stays the fallback when `display.legend` is off), and
  the cross-section fills the rx wedge with the tx wedge's green.

#### F45 — Weld condition toggles

**Original.** The `Weld` menu carries one-click **Root Corrosion** (bumpy, echoing root), **Rough
Surface**, **Misalignment** (stepped plates) and **Pipe Wall Thickness Variation**, each visibly changing
the cross-section and the echoes. None of the four exists anywhere in our src.
**Required.** Four checkable `Weld ▸` items writing `weldOpts.rootCorrosion`, `.roughSurface`,
`.misalignmentMm`, `.wtVariationMm` (the last two open a one-field dialog with ranges −5…5 mm and 0…4 mm;
0 = off, and the menu check reflects `!== 0`).

| flag | geometry (10-specimens) | echoes (30/40) |
|---|---|---|
| `rootCorrosion` | the root-bead crown between `x = ±capWidth/4` is replaced by a pseudo-random bumpy profile: 9 vertices at 1.5 mm pitch with `y = T + rootHeight − 0.8·rnd`, seeded by `UT.math.rng(1)` so it is deterministic | the bumpy segments are tagged `'root'`; each bump is a geometry scatterer, so the root gives a **train** of `geometry` echoes 3–8 dB below a clean root bead instead of one |
| `roughSurface` | the top edge is drawn with a 0.3 mm sawtooth (cosmetic only — the scan surface stays flat so probe placement is unchanged) | `transferLossDb += 4` (two-way) and `ascan.grassPct × 2.5` |
| `misalignmentMm` | the plate on the `+x` side of the weld is offset **down** by the value (its top edge at `y = m`, its bottom at `y = T + m`); the weld body bridges the step | the step produces a `geometry` echo tagged `'misalign'` from both the top and bottom corners — the classic "root misalignment looks like lack of penetration" teaching case |
| `wtVariationMm` | pipes only: `T` varies sinusoidally along z, `T(z) = wt − v/2 + v/2·sin(2π·z/L·3)`; the cross-section is drawn at `T(probe.z)` | the backwall path follows `T(probe.z)`, so the backwall walks as the probe travels — reproduces angleprobe_calibration's "Wall thickness thinning 136–151" report row |

All four are `false`/`0` by default, so every v1/v2 number is unchanged when they are off.

#### F46 — TKY curved chord and pipe ring

**Original.** tky f012–f020: the chord section is drawn **genuinely curved** (a convex arc), the status
carries `Diameter=600  W/T=32mm`, and shrinking the diameter turns it into a **complete pipe ring** scanned
on the OD (f020 — a full grey annulus filling the client area with the green probe on the outside). The
`ADJUST MODE` panel's kind row is `Plate | T-joint | Pipe` with the active one bright green.
**Ours today.** The `Plate` and `Pipe` kind buttons are rendered but deliberately disabled, and PIPE weld
mode keeps a flat unrolled cross-section.
**Required.**

- `UT.specimens.tky(opts)` accepts `kind: 'Plate' | 'T-joint' | 'Pipe'`, `chordOd` (mm, 100…2000, default
  600) and `chordWt` (mm, 6…60, default 32). For `'T-joint'` and `'Pipe'` the chord outline becomes a true
  arc: outer radius `ro = chordOd/2`, inner `ri = ro − chordWt`, sampled with `arcPoints` and backed by
  exact entries in `spec.arcs` so the tracer reflects off the real curvature. When
  `2·ro ≤ 0.9 × the drawable width` the **complete ring** is emitted (both circles closed) and
  `spec.ring = true`; otherwise only the arc spanning the canvas is kept, with straight end faces.
  `'Plate'` keeps today's flat chord.
- `scanSurfaceAt` follows the arc: `probe.x` stays the **arc length** from the toe along the OD, and the
  local normal points at the centre, so probe placement, wedge delay and skip geometry all work unchanged
  for a flat chord (`ro → ∞`).
- `tkyOpts` is promoted into `state.tkyOpts` (§2) and the ADJUST MODE panel gains `Diameter` and `W/T`
  numeric fields; `UT.modes.rebuild()` reads them.
- Status: `UT.modes.statusMid()` appends `Diameter={od}  W/T={wt}mm` in tky mode with kind ≠ Plate — the
  original's caption; for the default configuration that is `Diameter=600  W/T=32mm`.

#### F47 — TKY panel refresh, layout, modals, pipe thickness

- `UT.modes.rebuild(opts)` (or a `'state'` subscription on `tkyOpts`) calls `tkyRefresh()` so the slider,
  label and fields follow an API-driven rebuild — today `UT.modes.rebuild({braceAngle:75})` updates the
  specimen and status bar while the panel still shows the old values.
- The tky cross-section is scaled so the chord spans the canvas and the brace reaches the top (SPEC §14.9),
  and the `ADJUST MODE` window's default position is **below** the section (or auto-nudged) so it never
  covers the probe and toe at 1280 × 760.
- Opening the defect editor in `tky` mode shows a one-time modal:
  `Use LEFT mouse button to place the DEFECT on the joint.` / `Click the DEFECT button to resume UT.`
- `Weld ▸ Pipe Thickness…` opens a single-field prompt titled `Pipe Thickness` with the validation text
  `Enter Thickness between 6mm and 40mm`, `OK`/`Cancel`, writing `weldOpts.wt` (the full Weld Settings
  dialog stays).

#### F48 — Plan-view dial, rulers and weld strip

- **Circumferential position on pipes.** The blue dial keeps the skew needle (drag unchanged) and gains a
  **thin red position pointer** at `2π·probe.z/C`, so it rotates as the probe travels around the pipe
  (drawing_defects_i/ii). On plates the position pointer is omitted.
- **Datum.** The pipe end-view circle's red radius starts at **9 o'clock** (`−90°`), matching zero_probe.
- **Both flank rulers.** The vertical skip-distance ruler is mirrored to the **left** edge of `#cv-plan`
  as well as the right (utman_functions).
- **Weld strip.** The hatched weld band gains a solid red vertical strip of width `max(2 px, capWidth/6)`
  on the weld centreline (how_to_use_the_epoch), drawn under the defect footprints.

#### F49 — 3D pipe defect marks and banner

Each defect is drawn on the 3D pipe as a **filled** band spanning its z extent × its x extent, shaded by
mean depth with the F32 helper (today: faint dashed outlines, and nothing at all for presets without a z
extent — which F21 also fixes). The yellow 13 px caption under the title becomes `utsim.co.uk`
(utman_functions/drawing_defects_i show `http://www.utsim.co.uk/`).

#### F50 — AUT wording and gate defaults

`Gates Same` → **`Set Gates Same Position`** (green button, two lines); the `RDT / RTD` strip radios keep
their function but the checkbox is captioned **`RDTech`**; the group box title follows the selected gate
kind — `Amplitude Gate` or `Transit/TOF Gate` (utman_software f068/f072). Default gates become
`Level = 15 %`, `Width = 15 mm`, `Start = 30 mm` for gate 1 (and the same for 2 and 3), replacing
20 % / 40 mm / 20 mm. V1 #12's AUT window is asserted against the defect z-extent, not against the
defaults, and the check sets its own gates — confirm in QA that it still passes.

### 6.4 Teaching aids

#### F51 — Instructor annotation toolkit (new module `86-annotate.js`, namespace `UT.annotate`)

**Original.** Three mechanisms used on camera:

1. **SHIFT+F12 'TEACHING AID DRAWING MODE'** — a transparent freehand overlay over the whole screen, **left
   mouse red, right mouse blue**, with its own explanatory dialog on first use (shear_wave).
2. The **TKY floating `Tools` palette** — pencil / eraser / line / `Clear` — used to sketch a plate with two
   holes beside the joint (tky f040).
3. A soft **yellow pointer torch** that spotlights LCD readouts, keys and the probe (visible in
   how_to_use_the_epoch, epoch_auto_calibration f016/f028, plotting_beam_spread f080).

**Required.**

- `UT.annotate = { toggle(), on(), setTool(name), clear(), torch(on), window /* 'draw' */, css,
  __selftest }`.
- **SHIFT+F12** toggles `annot.on`. On it, 86 inserts `div#annot` (a full-`#app` absolutely-positioned
  transparent canvas, `pointer-events:auto`, z-index above the views and below `.win`), and on first use
  shows a dialog titled `UTsim` with the line
  `TEACHING AID DRAWING MODE — LEFT mouse draws red, RIGHT mouse draws blue. SHIFT+F12 again to clear and exit.`
  (`annot.shown` suppresses it afterwards). Toggling off clears `annot.strokes` and removes the canvas.
- **Buttons.** Left button strokes are `#e00000`, right button strokes `#0000e0`; `contextmenu` is
  suppressed on `#annot` only while `annot.on`. Strokes are stored in **design-box px** (SPEC-v2 §5.4), so
  they follow `UT.dom.scale()` and survive a resize. Cap 200 strokes / 4000 points; oldest dropped.
- **Tools palette.** `Tools ▸ Draw palette` opens window `draw` (title `Tools`) with `Pencil | Line |
  Eraser | Clear` and a colour pair (red/blue); it writes to the same overlay and can be used without
  SHIFT+F12 (opening it sets `annot.on`).
- **Highlight pointer.** `Options ▸ Highlight pointer` toggles `annot.torch`: a 44 px-radius
  `radial-gradient(rgba(255,255,120,0.55), transparent)` circle follows the pointer over `#app`
  (`pointer-events:none`, `prefers-reduced-motion` respected — no animation, just position).
- Keyboard alternative (SPEC-v2 §5.7 a11y): while `annot.on`, arrow keys move a virtual pen 4 px,
  `Space` toggles drawing, `c` clears — so the mode is reachable without a mouse.

### 6.5 Shell, menus and wording

#### F52 — `AccRej` toolbar button

`tb-accrej`, label `AccRej`, inserted **between `RAD` and `PIPE`** (the original's position,
utman_software f020), opening the existing evaluation window
(`toggleWindowOf('standards.evaluation')`, `active` = `winOpen('evaluation')`, disabled when 45-standards
is absent). The toolbar becomes 20 buttons; every `enabled`/`DISABLED` list gains `'accrej'` wherever
`'rad'` appears, and `ALL_TB` is extended — SPEC §14.7's matrix is amended by adding `accrej` to the
disabled sets of `v1`, `v2` and `editor` only.

#### F53 — 'OK' startup splash

`Help ▸ Demo (OK splash)` loads `UT.specimens.build('okDemo')` — two letter-shaped polygon specimens ("O"
as an annulus, "K" as a polygon) built through the F41 polygon path, with the probe on the "K" and the
protractor shown, reproducing utman_software f001/f020. It is **not** shown automatically at boot
(§11.4): our boot goes straight to the working screen, and the quick tour already owns first-run
attention. `UT.test.loadSpecimen('ok-demo')` reaches it headlessly.

#### F54 — Save screen shot (PNG)

`File ▸ Save screen shot (PNG)` composes the visible canvases (`#cv-plan`, `#cv-ruler`, `#cv-cross`,
`#cv-ascan`, and any open window canvas) into one offscreen canvas at their on-screen positions, divided by
`UT.dom.scale()`, and downloads it as `utsim-screen-<yyyymmdd-hhmm>.png` via `UT.dom.download`. A note
under the item reads `You can attach this file to an email and send it to other UTsim users` — the
original's hint. The existing `Export A-scan PNG` and `Share link…` stay.

#### F55 — Menu bar layout

Top level becomes **File, Probes, Step Wedge, Weld, Defects, Scale Mode, Tools, Options, About, Help**
(the original's bar plus our `Tools`). `menu-scalemode` sits between `menu-defects` and `menu-tools`;
`menu-about` sits between `menu-options` and `menu-help` and holds the single item `About UTsim...`
(which also stays under Help for v1/v2 path compatibility — `UT.test.menu('Help/About UTsim...')` must keep
working). `ALL_MENUS` becomes
`['file','probes','stepwedge','weld','defects','scalemode','tools','options','about','help']`; 90's
selftest expects exactly those ids in that order. Optional (not required by any check): a
`Help ▸ Contents` window presenting the existing help pages as one tree — Welcome, User Interface,
Amplitude Gate, TOF, MAPS, TOFD, Defects, Keys, UT Sets, License — matching the original's help file.

#### F56 — Lamination-check screen fidelity

`laminationPlate()` gains a butt-weld outline at `x = 0` (single-V, cap 16, no root bulge) and the plan
view draws its hatched band, so the lesson teaches "check the scanning surface **next to** the weld" as the
original does. `DISABLED.lamination.toolbar` drops `'v1'` and `'v2'`, so the instructor can hop to the
Carbon Steel Block for a calibration interlude and come back without leaving the mode.

#### F57 — Original hints, captions and colour cues

Adopt the original strings wherever the wording **is** the teaching cue; keep our spelling corrections
elsewhere (we do **not** copy `Tandom (pitch catch)`, `Mode Propergation` or `Applitude`):

| where | string |
|---|---|
| plotter, before plotting | `Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge` *(already verbatim)* |
| plotter, after the first mark | `RIGHT OR LEFT mouse button/Drag to PLOT Beam Spread on Plotter. Draw on Block to mark 10% Beam Edge` |
| plan view, probe direction | `LEFT or RIGHT mouse button to change probe direction` |
| lamination mode | `LEFT mouse button/drag to move the UT Probe` (the plain v1 wording, not our coaching line) |
| V1 / V2 hint | `Drag the probe onto the top face (100mm Radius) or the front face (25mm thickness)` — with the radius value filled in for V2 (`25mm Radius` / `50mm Radius` per `probe.side`) |
| TT dialog | `SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE` |
| defect editor | `LEFT mouse button/drag to draw defect.` *(already verbatim)* |
| editor empty slot | `VOL  Defect Num {n}, DRAW DEFECT ON CROSS SECTION BELOW` (F29) |

Colour cue: the probe is drawn **yellow `#ffd700`** while `state.utSet` starts with `'epoch'` and green
`#00c000` with `usk7` (utman_software f055, epoch_auto_calibration) — this is the original's UT-set cue.
Angle-button colour coding (0° magenta / 45° yellow / 60° green / 70° blue) is unchanged and still drives
the probe body in the **plan** view.

#### F58 — 'UTman Video' window

**Decision: not built.** The original's child window played local training clips; a single-file offline
HTML cannot ship 17 videos, and embedding user files adds no teaching value we do not already have. The
sanctioned substitute is the **25 guided lessons** (the first literally titled `UTman Functions`) plus the
echo quiz, which reproduce all 17 videos step by step. `Help ▸ About` gains a `Video → lesson map` table
listing each video slug against its lesson number(s), so the substitution is discoverable. See §11.3.

#### F59 — UTman velocity set

The original's two builds disagree with each other and with us: UTman II prints shear **3240** m/s and
compression **5960** m/s (shear_wave f045/f050), UTman600 prints shear **3200** m/s
(angleprobe_calibration f010, `Shoe=53.6°` at 70°). Our carbon steel is 3.24 / 5.90 mm·µs⁻¹, so our shear
matches UTman II exactly and our compression is 0.06 low. Moving `vL` would break V1 #11 and V2-10 (both
pin TOFD times at vL 5.90) and every pinned lesson answer, so the **default does not move** (§11.7).
Instead 10-specimens gains a material `'carbon-utman'`
(`{vL: 5.96, vS: 3.20, attenL5: 0.005, attenS5: 0.010, …}`, label `Carbon steel (UTman numerals)`), which
an instructor selects from `Weld ▸ Material…` to reproduce the videos' numerals digit for digit:
`Shoe=53.6°` at 70°, `Compression Wave Angle=48.1°` at shoe 20°, 1st critical 27.4°, `VEL 5959.993` after
a cal.

---

## 7. Test API additions (`Object.assign(UT.test, …)`)

| function | owner |
|---|---|
| `turnProbe()` → the new `probe.side` | 80-modes (F9) |
| `autocal = {start(), field(mm), confirm(), cancel(), state()}` (namespace created by 80) | 80-modes (F2/F3/F4) |
| `unCalibrate()` → `{vel, zero}` | 70-instruments (F7) |
| `power(on)` → `instrument.powered` | 70-instruments (F1) |
| `weldCondition({rootCorrosion, roughSurface, misalignmentMm, wtVariationMm})` | 80-modes (F45) |
| `skips(v)` accepting `0.5`-steps and `null` (`Run to UT Screen Range`) | 80-modes (F17) |
| `editorKey(key, mods)`, `editorBrush(pts, {button, alt})`, `hideKey(code)` | 80-modes (F26/F27/F33) |
| `defectCaption()` → the live editor caption string; `defectSummary()` → the ring summary string | 80-modes (F28/F29) |
| `drawOnBlock(x)` → the new `plot.blockMarks.length` | 60-view-cross (F35) |
| `plotDrag(pts)` → the new `plot.lines.length`; `plotAngle()` → the live degree caption; `bs()` → `plot.bs` | 66-view-plotter (F36/F37) |
| `tofdParallel()` → `{x0, x1, step, n, peakCol}` | 50-tofd (F43) |
| `tkyConfig({kind, chordOd, chordWt, braceAngle})` → the rebuilt `spec.tky` | 80-modes (F46) |
| `scale = {enter, exit, setMmPerPx, loadPicture(dataUrl), trace(pts), protractor(show), state}` (namespace created by 85) | 85-scalemode (F41/F42) |
| `annot = {toggle, stroke(pts, button), clear, torch(on), state}` (namespace created by 86) | 86-annotate (F51) |
| `screenshot()` → a data URL string | 90-app (F54) |
| `mirrorProbe()` → `{drawn: boolean, x}` | 62-view-plan (F20) |

`UT.test.state()` additionally omits `scaleMode.picture`, `tofd.parallel` and `annot.strokes`.
`UT.test.click('tb-dac' | 'tb-plot')` bypasses the F11 chooser (`{direct:true}`) so v1/v2 automation is
unaffected. `UT.test.lessons()` still returns 25 titles.

---

## 8. Menus and window registry additions (90-app; English `data-key`s)

Placement is given relative to the v2 menus of SPEC-v2 §8; everything else is unchanged.

- **File ▸** … v2 … + `Save screen shot (PNG)` (after `Export A-scan PNG`) — F54
- **Probes ▸** `Number of Skips ▸` becomes `Run to UT Screen Range | Half Skip | 1 | 1.5 | 2 | 2.5 | 3 | 4` — F17;
  `Colour Code Display ▸` becomes `Mode Propagation | Leg colours | Geometry` — F15
- **Step Wedge ▸** … v2 … + `Steps 20-8 mm (2 mm)` (after `Steps 10-50 mm (10 mm)`) — F12,
  + `A5 IOW block` (after `FBH block`) — F38
- **Weld ▸** … v2 … + a separator, then `Root Corrosion` ✓, `Rough Surface` ✓, `Misalignment…`,
  `Pipe Wall Thickness Variation…` — F45; + `Pipe Thickness…` (after `Weld Settings...`) — F47
- **Defects ▸** … v2 … (unchanged; `Defect Editor...` now honours F25/F30)
- **Scale Mode** (NEW top-level menu, id `menu-scalemode`, between Defects and Tools) ▸
  `Adjust Scale…` (opens window `scale`), `Load Pic…`, `Capture`, `Pipe`, `Protractor` ✓,
  `Trace boundary`, `Skip graduations` ✓, `Exit Scale Mode` — F41/F42
- **Tools ▸** … v2 … + `Draw palette…` (window `draw`) — F51
- **Options ▸** … v2 … + `UnCalibrate`, `Delete EPOCH records`, `Always Show UT Controls` ✓,
  `Float instrument panel` ✓, `Show A-scan overlay text` ✓, `Highlight pointer` ✓ — F7/F8/F51;
  `UT Set ▸` gains `EPOCH LTC` — F5
- **About** (NEW top-level menu, id `menu-about`, between Options and Help) ▸ `About UTsim...` — F55
- **Help ▸** … v2 … + `Demo (OK splash)` — F53, + `Contents` (optional, §6.5)
- **Enable matrix**: `ALL_MENUS = ['file','probes','stepwedge','weld','defects','scalemode','tools',
  'options','about','help']`; `ALL_TB` gains `'accrej'` after `'rad'`;
  `DISABLED.scale = {toolbar:['v2','v1','dac','plot','tky','tofd','aut','pipe','defect'],
  menus:['weld','defects'], hidden:['plan','compass']}`; `MODE_OF['polygon'] = 'scale'` and
  `MODE_OF['ok-demo'] = 'scale'`; `'accrej'` joins the disabled sets of `v1`, `v2` and `editor`;
  `'compass'` leaves `DISABLED.tofd.hidden` and `DISABLED.lamination.hidden` (F44);
  `DISABLED.editor` drops `'file'` and `'pipe'` (F30); `DISABLED.lamination` drops `'v1'`/`'v2'` (F56).
- **Window registry** (`data-win` → owner): v1 + v2 lists of SPEC §15.9 / SPEC-v2 §8, plus
  `blockpick` (80 — F11), `defect-steps` (80 — F25), `hidekey` (80 — F33), `pipethk` (90 — F47),
  `scale` (85), `protractor` overlay drawn on `#cv-cross` (85, not a win),
  `draw` (86), `div#annot` overlay (86, not a win), `ttinfo` (90 — F19).
- **Toolbar**: 20 buttons — `0° 45° 60° 70° | V2 V1 ASME | PLOT DAMP SIZE | DEFECT HIDE CLEAR |
  BEAM RAD AccRej | PIPE TKY TOFD AUT`. `tb-dac`'s **label** becomes `ASME`; its **id stays `tb-dac`**.

---

## 9. Acceptance checks v3 (headless Chromium via `UT.test`; tolerances inclusive)

### 9.0 Regression

V1 #1–#14 and V2-1…V2-27 unchanged. Quantities that legitimately change:

- `derived.statusLine` gains the real compression bracket **below the 1st critical angle only** (F14/F15);
  the 45/60/70° and 0° preset strings of SPEC §14.10 are byte-identical apart from
  `Comp' Wave Angle` → `Compression Wave Angle`. Any test asserting the abbreviation must be updated —
  this is the only string regression v3 permits.
- `plot` gains `lines`/`blockMarks`/`ruler`/`bs`/`overlay`; `tb-clear` clears them too (V1 #14's
  console-clean requirement is unaffected).
- The toolbar has 20 buttons instead of 19 (V2-22's `aria-pressed` sweep covers the new one).
- `ALL_MENUS` has 10 entries; 90's selftest string in SPEC-v2 §8 is replaced by the §8 list above.
- AUT gate **defaults** move to 15 % / 15 mm / 30 mm (F50); V1 #12 sets its own gates and is unaffected —
  QA to confirm.
- Twin-crystal 0° amplitudes rise below 15 mm (F18); no v1/v2 check asserts a twin 0° defect amplitude.
- The `Number of Skips` ladder is renumbered to `legs = 2·skips` (F17, §4.5); the drawn beam for the integer
  entries 1/2/3/4 is twice as long as in v1/v2. No v1 or v2 acceptance number moves (the extra legs are past
  `maxPath` at every range those checks use) — measured, 112/112.
- Nothing else. In particular **no plate number moves** because of F21 (`defaultProbe.z = L/2 = 150` on
  plates) and **no bottom-corner number moves** because of F22.

### 9.1 Instrument, calibration and blocks

- **V3-1 OFF blanks, does not close** (F1): `utSet 'usk7'`, `UT.test.power(false)` →
  `state().instrument.powered === false`, `.win[data-win=usk7]` still open, `#cv-ascan` still in the DOM,
  and the drawn trace is flat: the standard deviation of the middle 800 samples read back from the canvas
  is ≤ 1 %FSH while `UT.test.ascan().samples` still contains the 20 mm backwall. `power(true)` restores it.
  In `tofd` mode, `UT.tofd.ascanOff()` hides `.win[data-win=tofd-ascan]` and leaves
  `UT.modes.current() === 'tofd'` with `.win[data-win=tofd]` open.
- **V3-2 Auto-cal on the current specimen** (F2): `loadSpecimen('plate-weld', {T:20})`, 0° probe at
  x = 40, gain 40, `setInstrument({cal:{vel:5.60, zero:0.4}})`, gate 1 over the first backwall →
  `UT.test.autocal.start()` sets `state().autocal.source === 'specimen'` and `d1 = 20`, `d2 = 40`, and
  `UT.modes.current() === 'weld'` (the step wedge is NOT entered). With no backwall echo (probe off the
  plate) `start()` falls back to `source === 'step'` and `current() === 'step'`.
- **V3-3 Thickness entry and the on-LCD wizard** (F3): after V3-2, `autocal.field(16.50)` →
  `state().autocal.field === 16.5`; `autocal.field(20.00)`; `autocal.confirm()` →
  `state().autocal.entered.thin === 20` and `stage === 2`; move gate 1 onto the 2nd multiple,
  `autocal.field(42.00)`, `autocal.field(40.0)`, `autocal.confirm()` → `entered.thick === 40`,
  `stage === 0`, `instrument.cal.vel` = 5.90 ± 0.02 and the 20 mm backwall reads `readouts().primary.pathDisp`
  = 20.00 ± 0.05. With `utSet 'epoch4'` the text `ENTER VALUE FOR THIN STANDARD` and
  `AND THEN PRESS Calibration` are present in the wizard's accessible text
  (`UT.test.autocal.state().caption`), and the thick stage's are `ENTER VALUE FOR THICK STANDARD` /
  `AND THEN PRESS ENTER`.
- **V3-4 Post-cal range** (F4): after V3-3, `state().instrument.range === 50` and
  `state().autocal.rangeAfter === 50`; with `d1/d2 = 10/25` the range becomes 100; a cancelled cal leaves
  the range untouched.
- **V3-5 Softkeys** (F5): `setInstrument({selectedParam:'range'})` → the P/F row labels are
  `['10.0','20.0','50.0','100.0','125.0','250.0','500.0']` and pressing the 3rd sets `range === 50`;
  the Trig page labels contain `Diameter`, editing it sets `instrument.trig.diameter`; the Gate1 page
  labels contain `Status` and pressing it flips `gates[0].on`; a softkey click adds `.pressed` for
  ≤ 300 ms; `Options ▸ UT Set ▸ EPOCH LTC` mounts without console errors and its softkeys contain
  `CAL THIN` and `CAL THICK`.
- **V3-6 Key hints in the status bar** (F6): dispatching `mouseenter` on the EPOCH `CAL` key sets
  `state().status.mid === 'CALIBRATE'`; `mouseleave` restores a mid line starting with `Pos:` on the next
  render; the ▲ key gives `ARROW RIGHT/UP` and `NEXT GROUP` is produced by the group key.
- **V3-7 UnCalibrate** (F7): from a calibrated set, `UT.test.unCalibrate()` returns `{vel, zero}` with
  `vel ∈ [5.30, 5.90]`, `zero ∈ [0.20, 0.60]`, `vel !== 5.90`; the 20 mm backwall then reads
  `|pathDisp − 20| ≥ 0.3`; `state().status.right` contains `recalibrate`. `Options ▸ Delete EPOCH records`
  empties `instrument.datalog`.
- **V3-8 USK 7 chrome and float** (F8): with `utSet 'usk7'` the window contains a `[data-tip]` element per
  knob, two arrow pairs beside RANGE (4 buttons) and an `input[aria-label="AMP (dB)"]`;
  `display.instrumentFloat = true` with `utSet 'epoch600'` puts `#instrument` inside a `.win`;
  `UT.lessons.start(2)` leaves `state().utSet === 'usk7'`.
- **V3-9 Turn Probe** (F9): `enterMode('v2')`, `setFace('wide')`, `probe.side = +1` → `statusMid()`
  contains `25mm Radius. Echoes 25, 100, 175, 250 etc`; `UT.test.turnProbe()` → `probe.side === -1` and
  `statusMid()` contains `50mm Radius. Echoes 50, 125, 200, 275 etc`; the button
  `#btn-turn-probe` exists in `v1` and `v2` and not in `weld`.
- **V3-10 V2 wide face** (F10): `loadSpecimen('v2', {face:'wide'})` → `state().specimen` reports a hole
  with `r = 2.5`; at range 250 with the 45° probe at x = 60 side +1, `echoes()` contains paths
  25, 100, 175 **and** 250 (±1 mm) with monotonically decreasing `ampPct`; side −1 gives 50/125/200/275.
  `UT.lessons.list[5].setup()` and `[18].setup()` leave `probe.angle === 60`.
- **V3-11 ASME chooser** (F11): from `weld`, a real click on `#tb-dac` opens `.win[data-win=blockpick]`
  whose text contains `ASME Block`, `Calibrate for Amplitude and draw DAC`, `A5 Block IOW` and
  `Plot Beam Spread`; clicking the first enters `dac`. `UT.test.click('tb-dac')` enters `dac` directly with
  no modal. The `tb-dac` button's text is `ASME` and `specimen.labels` contains `ASME BLOCK`.
- **V3-12 Descending step wedge** (F12): `menu('Step Wedge/Steps 20-8 mm (2 mm)')` → the specimen's step
  thicknesses are `[20,18,16,14,12,10,8]` and `spec.stepX(8) > spec.stepX(20)`.

### 9.2 Probe, beam and echo physics

- **V3-13 Probe turns round** (F13): plate weld T 20, 60°, `UT.views.cross.dragTo(40)` → `probe.side === 1`
  and the Pos cell is `Pos: 40 mm`; `dragTo(-40)` → `probe.side === -1` and the Pos cell is **`Pos: 40 mm`**
  (unsigned); `dragTo(5)` → `side === 1`. On `iow` the same drag leaves `side` unchanged.
  `UT.test.setProbe({x:-40})` does **not** change `side`.
- **V3-14 Both modes below the 1st critical angle** (F14): `setProbe({angle:0})` then set the wedge angle
  to 20° through the wedge dialog API → `derived.statusLine` contains both
  `Shear Wave Angle=23.9°` and `Compression Wave Angle=47.4°`, each ±0.2° with the default 3.24/5.90:
  asin(sin 20° × 5.90/2.74) = 47.43°, **not** the original's 48.1°, which is the 5.96 figure. With
  `setMaterial('carbon-utman')` applied **before** the wedge is dialled (the stored nominal refracted
  angle re-solves the shoe angle when the velocities change, so a material switch after the fact leaves
  the shoe at 19.8° and reads 47.5°) the same wedge 20° gives `Shear Wave Angle=23.5°` /
  `Compression Wave Angle=48.1°   Velocity=5960 m/s` — the frame's numerals, see V3-59. At wedge 35° the
  compression bracket is `0.0°` / `0 m/s`. `UT.frame.rays` contains two fans whose centre-ray angles are
  23.9° and 47.4° ± 0.5° (23.5°/48.1° ± 0.5° under `carbon-utman`), both with ≥ 9 rays.
- **V3-15 Wording and colour code** (F15): `derived.statusLine` contains `Compression Wave Angle` and does
  not contain `Comp'`; `menu('Probes/Colour Code Display/Leg colours')` sets
  `display.colourCode === 'legs'`; with `'propagation'` and a 60° shear probe every drawn leg uses
  `#00c000` (checked via `UT.views.cross.__legColours()` returning the per-leg hex list).
- **V3-16 0° status and range** (F16): 60° at range 94.4 → `setProbe({angle:0})` gives
  `derived.statusLine` starting `Normal 0°` and `instrument.range` = 171.9 ± 0.5 (94.4 × 5.90/3.24); going
  back to 60° restores 94.4 ± 0.5. With `instrument.cal.vel` set, the range is not rescaled.
- **V3-17 Fractional skips** (F17): `UT.test.skips(0.5)` → `display.skips === 0.5` and the drawn ray
  polylines end on the backwall (max leg index 1); `skips(2.5)` → max leg index 5;
  `menu('Probes/Number of Skips/Run to UT Screen Range')` → `display.skips === null` and, at range 400 on a
  20 mm plate, the tracer returns ≥ 8 legs. `skips(3)` reproduces the v1 drawing exactly.
- **V3-18 Twin near-surface boost** (F18): lamination plate, 0°, lamination at 4 mm depth:
  `crystal 'single'` → `ampPct` A; `crystal 'twin'` → `ampPct` B with `20·log10(B/A)` = 3.5 ± 1.0 dB; the
  25 mm backwall amplitude changes by ≤ 0.2 dB between the two.
- **V3-19 Movable TT receiver** (F19): `setProbe({method:'tt'})` shows `.win[data-win=ttinfo]` once, whose
  text contains `SHIFT and LEFT or RIGHT CURSOR KEY TO MOVE RECEIVER PROBE`; `Shift+ArrowRight` ×5 sets
  `probe.rxOffset === 5`; the through-transmission amplitude at `rxOffset 0` is ≥ 6 dB above the value at
  `rxOffset 20`.
- **V3-20 Mirrored probe** (F20): plate weld, 60° at x = 40, `display.mirror` true →
  `UT.test.mirrorProbe()` returns `{drawn:true, x: -40 ± 0.5}`; with `display.mirror` false, `drawn:false`;
  in `iow` mode `drawn:false`.
- **V3-21 Pipe presets reachable — and the tracer is NOT changed** (F21, lead correction 1):
  `loadSpecimen('pipe-weld', {od:168.3, wt:20})` → `state().probe.z === 132` and
  `state().specimen.L` = 528.7 ± 0.1. `addPreset('rootCrack')` → the returned defect satisfies
  `zFrom < 132 < zTo` and `zTo − zFrom` ≥ 20. Scanning `x = 26…42` in 0.5 mm steps at 60°, gain 30,
  range 100: the best `'corner'` echo reads `ampPct` **40.34 ± 1.0** at `path` **40.0 ± 0.5**. The
  identical sweep on `loadSpecimen('plate-weld', {T:20})` gives the same two numbers to within 1 %.
  Guard: `UT.rays.__version` (or the file's byte length recorded by the runner) must be unchanged by any
  commit whose message cites M12's pipe half — the runner prints a warning, not a failure.
- **V3-22 Toe-crack preset geometry** (F22, lead correction 2): after `loadSpecimen('plate-weld', {T:20})`
  and `addPreset('toeCrack')`, the preset's `pts` are vertical (`|pts[0].x - pts[1].x| <= 0.05`) with
  `pts[0].y === 0`; sweeping 45 deg over x 42...60 in 0.5 mm steps yields `kind 'corner'`, `path 56.6 +/- 3`,
  `amp >= 0.20`, and >= 6 dB above the best `tip` of the same defect. The same holds on
  `loadSpecimen('tky')`. **Non-regression** (the tracer is untouched, so these must be bit-identical):
  `plateWeld({T:20, rootHeight:0, capHeight:0})` + `rootCrack` peaks at `amp 0.3219 / path 40.0`, the
  default weld at `amp 0.4828 / path 40.0` (V1 #8), and a 26.6 deg inclined crack still gives no corner echo.
- **V3-23 Echo-driven Depth** (F23): plate weld, 60° at the root-crack maximum, no cursor →
  `state().status.mid` contains `Depth = 20.0mm` (±0.3); moving the probe 15 mm away removes the Depth
  cell; a cursor hover still wins over the echo value.
- **V3-24 PA shoe fields** (F24): `pa.shoeStandOff = 20` shifts the S-scan's apex by 20 ± 1 mm along the
  surface; `pa.focalLaw(60).slope` is unchanged (0.070 ± 0.003 µs/mm) at the defaults.

### 9.3 Defect editor

- **V3-25 STEP dialog** (F25): opening the editor for the first time shows `.win[data-win=defect-steps]`
  containing `STEP 1.`, `Use RIGHT mouse to draw single line LOF defect.`, `STEP 5.` and
  `Press F1 to redisplay these instructions`; dismissing it and pressing `F1` reopens it; the editor stays
  open throughout.
- **V3-26 Right-drag LOF** (F26): with the editor open,
  `UT.test.editorBrush([{x:6,y:4},{x:10,y:9}], {button:2})` creates a defect with `type === 'lof'` and
  exactly 2 points; `{button:2, alt:true}` over an existing defect **erases** points instead; the
  `contextmenu` event on `#cv-cross` is `defaultPrevented` while the editor is open and not prevented
  after it closes.
- **V3-27 Keyboard manipulation** (F27): with defect 1 at `zFrom 140 / zTo 160`,
  `editorKey('ArrowRight', {shift:true})` ×2 → `zFrom === 142`; `editorKey('ArrowLeft', {shift:true})` →
  141. On an LOF, `editorKey('X', {shift:true})` ×10 rotates the fitted angle by +10 ± 1°;
  `editorKey('S', {shift:true})` ×5 grows the 2D length by ×1.276 ± 0.03;
  `editorKey('W', {shift:true})` ×2 moves the mean depth +1.0 ± 0.05 mm. Keystrokes typed into a field are
  ignored, and no binding fires after the editor closes.
- **V3-28 Auto-classification and LOF caption** (F28): a 20-point blob stroke (bbox 4 × 3 mm) →
  `type 'volumetric'` and `defectCaption()` starting `VOL Defect 1`; a straight stroke from (6,4) to (10,9)
  → `type 'lof'` and `defectCaption()` matching
  `/^LACK OF FUSION\s+Defect Angle 51\s+Height=[\d.]+\s+Top=4\.0$/` (angle 51 ± 2, Top = min y ± 0.2);
  `defectSummary()` matches `/Angle= 51\s+LOF$/`.
- **V3-29 Captions, prompts, spinner** (F29): with slot 2 empty, `defectCaption()` is
  `VOL  Defect Num 2, DRAW DEFECT ON CROSS SECTION BELOW`; after drawing,
  `defectSummary()` matches `/^Defect Number 2\.\s+Length=30mm\.\s+From \d+mm\s+To\s+\d+mm/`; the
  circle header text matches `/^Circle-View\. Position \d+mm$/` and changes when `probe.z` changes;
  a `Depth = ` label exists in `#cv-circle`'s panel; on a 6-inch pipe the ring labels are
  `0 mm, 40mm, …, 440mm` (12 labels, step 40); `editing.spotMm = 45` plus a 0.2 mm stroke produces a defect
  whose 2D bbox is 45 ± 3 mm across; opening the editor sets `editing.brush === 'auto'`.
- **V3-30 OK exits and the mode returns** (F30): in `tofd` mode, `UT.test.click('tb-defect')` opens the
  editor with `editing.returnMode === 'tofd'`; clicking `OK` applies the fields, closes the window and
  leaves `UT.modes.current() === 'tofd'` with `.win[data-win=tofd]` open. With the editor open,
  `menu('File/Save Setup')` succeeds and `#tb-pipe` is enabled.
- **V3-31 Draw-region box** (F31): with the editor open on a T 20 weld, `display.drawRegion` is null and
  `UT.views.cross.__drawRegion()` returns a rect covering `x ∈ [−15, 15]`, `y ∈ [−3, 23]` (±2 mm);
  a stroke wholly outside it creates no defect and sets a status hint containing `blue box`;
  setting `display.drawRegion = {x:30, y:0, w:40, h:20}` moves it and a stroke inside it creates a defect.
- **V3-32 Depth colour-coding** (F32): two defects at mean depths 3 mm and 17 mm on a T 20 weld →
  `UT.specimens.defectShade(d1, 20)` is brighter than `defectShade(d2, 20)` on every channel, `d1` is
  within 8 of `#e00000` per channel and `d2` within 12 of `#7a0000`; selecting `d2` does **not** change its
  fill (only adds the outline), and the same two hexes appear in the plan, ring and cross-section
  renderers' reported palettes.
- **V3-33 HIDE key lock** (F33): `UT.test.click('tb-hide')` with `editing.keyLock` null hides freely;
  after `UT.test.hideKey('1234')` sets the lock, `click('tb-hide')` leaves `display.hide === true` and
  `UT.test.hideKey('0000')` returns false with `display.hide` still true; `hideKey('1234')` returns true
  and un-hides.
- **V3-34 Save/Load Def files** (F34): `UT.modes.defectEditor.saveFile()` returns a Blob/object-URL whose
  text parses to the current `defects` array; feeding that text to `loadFile(text)` after
  `setDefects([])` restores an equal array (`zFrom/zTo/type/pts` deep-equal); a malformed file leaves
  `state().defects` unchanged and shows `Could not read that file`.

### 9.4 Plotter, Scale Mode and views

- **V3-35 Block marks** (F35): in `iow` mode, `UT.test.drawOnBlock(255)` then `(262)` then `(269)` →
  `plot.blockMarks.length === 3` with `x` values 255/262/269 ± 0.5; `UT.views.plotter.erase()` and
  `UT.test.click('tb-clear')` each empty it; a normal probe drag (pointerdown ≥ 20 px below the surface)
  adds no marks and still moves the probe.
- **V3-36 Freehand lines and caption** (F36): `UT.test.plotDrag([{standoff:0,depth:0},{standoff:20,depth:34.6}])`
  → `plot.lines.length === 1` with ≥ 2 points, and `UT.test.plotAngle()` returns `60.0` ± 0.3; a click
  (single point) still appends to `plot.points`; `Erase Plotting` empties both.
- **V3-37 BS and K captions** (F37): with 3 block marks each side fitting ±7.9° about the beam centre
  line, `UT.test.bs()` returns `{angleDeg: 7.9 ± 0.3, k20, k12, k6}` where `k12/k20` = 0.652 ± 0.005 and
  `k6/k20` = 0.519 ± 0.005; for a 5 MHz ⌀5 shear probe `k20` = 1.08 ± 0.05, `k12` = 0.704 ± 0.03. The
  rendered card text contains `angle BS = 7.9°` and `20dB K=1.08`.
- **V3-38 PLOT over the weld** (F38): from `weld` with a root-crack preset, `UT.test.click('tb-plot')` →
  `plot.overlay === true`, `UT.modes.current() === 'weld'`, `state().specimen.id === 'plate-weld'`,
  `plot.cardStyle === 'weld'`, and the card reports a red defect mark at
  `(standoff 34.6 ± 2, depth 20 ± 1)`. Pressing it again clears the overlay and restores the plan view.
  `UT.modes.toggle('iow')` still loads the IOW block.
- **V3-39 Ruler, dots, hook** (F39): `plot.ruler = {on:true, view:'block', x:250}` draws the strip in
  `#cv-cross` (reported by `UT.views.cross.__rulerRect()`); in `iow` mode the X-ruler labels are mirrored
  about the probe index (the label at the index is `0` and the labels at ±40 mm are both `40`);
  `UT.views.plotter.__pointStyle()` reports `{colour:'#009900', shape:'dot'}`; the hint switches to the
  `RIGHT OR LEFT mouse button/Drag…` wording after the first plotted point.
- **V3-40 Hand-drawn DAC** (F40): with 2 recorded DAC points, a drag on `#cv-ascan` fills
  `instrument.dac.hand` with ≥ 5 points whose first and last snap to the recorded points (±6 px);
  `Draw Curves` clears `dac.hand`; on `usk7` the main DAC stroke colour is `#ff40ff`.
- **V3-41 Scale Mode** (F41): `UT.test.scale.enter()` → `UT.modes.current() === 'scale'`,
  `.win[data-win=scale]` open with the title `ADJUST SCALE` and buttons `Capture`, `Load Pic`, `Pipe`,
  `Protractor`; `scale.setMmPerPx(0.25)` changes `UT.views.cross.toPx(10).x − toPx(0).x` to 40 ± 1 px;
  `scale.loadPicture(<a 4×4 px data: URL>)` sets `scaleMode.picture.w === 4` and draws it (no console
  error, no network request — the runner asserts zero requests);
  `scale.trace([{x:0,y:0},{x:60,y:0},{x:60,y:20},{x:0,y:20}])` builds a specimen with
  `id === 'polygon'`, `T === 20`, and a 0° probe on it gives a backwall echo at path 20.0 ± 0.3;
  `scale.protractor(true)` sets `scaleMode.protractor` non-null and snaps its centre within 8 mm of the
  probe index. `UT.test.state().scaleMode.picture` is absent.
- **V3-42 Skip graduations** (F42): `scaleMode.magnify = true` on a T 20 weld with a 60° probe →
  `UT.views.cross.__gradTicks()` returns ≥ 8 ticks on leg 1 whose labels are the cumulative surface
  distance in 5 mm steps, leg 1 red and leg 2 blue, and the reported hatch rect covers the area outside
  the outline.
- **V3-43 TOFD parallel scan** (F43): `runTofdScan()` → `UT.test.tofdParallel()` returns `n === 61` with
  `peakCol` within 3 columns of the centre for a defect at the pair centre; both canvases
  `#cv-tofd-dscan` and `#cv-tofd-parallel` exist and their captions read `Non-Parallel Scan` and
  `Parallel Scan`; `state().tofd.parallel === null`.
- **V3-44 TOFD chrome and pipe times** (F44): in `tofd` the compass is drawn
  (`UT.modes.hiddenViews()` does not contain `'compass'`), the Pos cell reads `Pos: 150 mm` for
  `probe.z = 150`, and a synchronous scan leaves `probe.z` at its pre-scan value while
  `scan:progress` events carried increasing z. On `pipe-weld {od:168.3, wt:20}` at PCS 60,
  `tofd().backwallUs` differs from the flat-plate 20.98 µs by ≥ 0.15 µs; on a plate the value is still
  20.98 ± 0.05 (V1 #11) and V2-10's mode-converted events are unchanged.

### 9.5 Weld conditions, TKY, shell and teaching aids

- **V3-45 Weld conditions** (F45): `weldCondition({rootCorrosion:true})` on a T 20 weld, 60° at the root
  position → `echoes()` contains ≥ 3 `geometry` echoes tagged `'root'` within a 6 mm path window (one
  without the flag), and the loudest is 3…8 dB below the clean-root value.
  `weldCondition({roughSurface:true})` → `ascan().grassPct` ≥ 2× and the backwall drops 4 ± 1 dB.
  `weldCondition({misalignmentMm:3})` → the specimen's `+x` top edge is at `y = 3` and a `geometry` echo
  tagged `'misalign'` appears. `weldCondition({wtVariationMm:4})` on a pipe → the backwall path at
  `probe.z = 0` and at `probe.z = L/6` differ by ≥ 2 mm. All four off → every number equals the v2 value.
- **V3-46 TKY curvature and ring** (F46): `tkyConfig({kind:'T-joint', chordOd:600, chordWt:32})` →
  `state().specimen.arcs.length ≥ 1` and the chord's mid-surface y differs from its edge y by ≥ 2 mm
  (a real arc, not a flat line); `statusMid()` contains `Diameter=600  W/T=32mm`; a 0° probe on the chord
  gives a backwall at 32.0 ± 0.5 mm. `tkyConfig({kind:'Pipe', chordOd:180, chordWt:20})` →
  `state().specimen.ring === true`, the outline has two closed loops, and a 0° probe on the OD gives a
  backwall at 20.0 ± 0.5 mm. `kind:'Plate'` reproduces today's flat chord exactly.
- **V3-47 TKY panel and dialogs** (F47): `UT.modes.rebuild({braceAngle:75})` leaves the ADJUST MODE slider
  at 75 and the label `Brace angle = 75°`; the panel's default rect does not intersect the drawn probe rect
  at 1280 × 760; opening the editor in `tky` shows a modal containing `Click the DEFECT button to resume UT`;
  `menu('Weld/Pipe Thickness…')` opens a dialog whose text contains
  `Enter Thickness between 6mm and 40mm` and rejects 3 and 50.
- **V3-48 Plan dial and rulers** (F48): on a 6-inch pipe, `probe.z = 0` and `probe.z = C/4` give position
  pointers 90 ± 2° apart (`UT.views.plan.__dial()` reports both needles); the end-view red radius starts at
  −90°; `UT.views.plan.__flankRulers()` reports 2 rulers; the weld band contains a red strip.
- **V3-49 3D marks** (F49): with a defect z 140…160 on a pipe, `UT.views.pipe3d.__marks()` reports one
  filled band whose z span is 20 ± 1 mm and whose fill equals `defectShade(d, T)`; the banner text is
  `utsim.co.uk`.
- **V3-50 AUT wording** (F50): the AUT window contains `Set Gates Same Position` and `RDTech`, the group
  title switches between `Amplitude Gate` and `Transit/TOF Gate`, and the default gates are
  `{level:15, width:15, start:30}`.
- **V3-51 Annotation toolkit** (F51): `UT.test.annot.toggle()` → `annot.on === true`, `#annot` present,
  and a first-use dialog containing `TEACHING AID DRAWING MODE`; `annot.stroke([{x:10,y:10},{x:80,y:60}], 0)`
  → one stroke with `colour '#e00000'`, button 2 → `'#0000e0'`; `contextmenu` on `#annot` is prevented;
  `annot.toggle()` again clears the strokes and removes `#annot`. `Options ▸ Highlight pointer` sets
  `annot.torch` and inserts one `pointer-events:none` element. `UT.test.state().annot.strokes` is absent.
- **V3-52 AccRej** (F52): `#tb-accrej` exists between `#tb-rad` and `#tb-pipe` in DOM order, carries
  `aria-pressed`, and `UT.test.click('tb-accrej')` opens `.win[data-win=evaluation]`; it is disabled in
  `v1`, `v2` and with the editor open; the toolbar has 20 buttons.
- **V3-53 OK demo** (F53): `UT.test.loadSpecimen('ok-demo')` builds without error, the specimen has ≥ 2
  outline loops, a probe placed on it produces at least one echo, and no console error is logged. It is
  **not** entered at boot (a fresh page's `state().mode === 'weld'`).
- **V3-54 Screenshot** (F54): `UT.test.screenshot()` returns a string starting `data:image/png;base64,`
  of length ≥ 5000, and the menu item exists under File.
- **V3-55 Menu bar** (F55): the menubar ids are exactly
  `menu-file, menu-probes, menu-stepwedge, menu-weld, menu-defects, menu-scalemode, menu-tools,
  menu-options, menu-about, menu-help`; `menu('About/About UTsim...')` and `menu('Help/About UTsim...')`
  both open `.win[data-win=about]`; every v1/v2 menu path listed in 90's selftest still resolves.
- **V3-56 Lamination screen** (F56): `enterMode('lamination')` → `state().specimen.weld` is non-null with
  `capWidth === 16`, the plan view draws a hatched band, and `#tb-v1` and `#tb-v2` are enabled.
- **V3-57 Wordings** (F57): the exact strings of the §6.5 table are present in
  `state().status.right` in their stated modes (asserted string-for-string); with `utSet 'epoch600'` the
  probe fill reported by `UT.views.cross.__probeStyle()` is `#ffd700` and with `'usk7'` it is `#00c000`.
- **V3-58 Video substitution documented** (F58): `UT.test.lessons().length === 25`; the About window's
  text contains `Video → lesson map` and at least 15 of the 17 video slugs; `menu('Help/Lessons...')`
  opens `.win[data-win=lessons]`.
- **V3-59 UTman velocities** (F59): `setMaterial('carbon-utman')` → the 70° probe's `derived.wedgeAngle`
  is 53.6 ± 0.1° and `statusLine` contains `Velocity=3200 m/s`; at wedge 20° the compression angle is
  48.1 ± 0.1° with `Velocity=5960 m/s`; the 1st critical angle is 27.4 ± 0.1°. `setMaterial('carbon')`
  restores 52.6°/3240/5900 and `tofd().lateralUs` is 18.93 ± 0.05 (V1 #11 unaffected).

### 9.6 Engineering

- **V3-60 Runner**: `node tools/acceptance.mjs` exits 0 and its JSON lists ≥ 100 checks (14 v1 + 33 v2 +
  the V3 set); `--only v3` runs only the new ones.
- **V3-61 Headless load**: `node tools/node-load.mjs --selftest` passes for all 22 files, including
  `85-scalemode.js` and `86-annotate.js`; neither touches `document`, `FileReader`, `Image` or `localStorage`
  at load time (asserted by loading them in a context where those globals are `undefined`).
- **V3-62 Build**: `python3 build.py` writes `utman_simulator.html` and `docs/utman_simulator.html`
  byte-identical, size < 3.0 MB (the v2 limit of 2.5 MB is raised by the two new modules — the source is
  inlined unminified by design), no external URLs, and zero console errors on load and on every `tb-*`
  click including `tb-accrej`.
- **V3-63 Performance**: §6.4's v2 budgets are unchanged with all v3 features **off**; with
  `weldOpts.rootCorrosion` on, `UT.test.compute()` stays ≤ 12 ms desktop / ≤ 24 ms under `CI`; the TOFD
  run with the parallel strip stays ≤ 1.2 s; Scale Mode with a traced 200-vertex polygon computes ≤ 15 ms.
- **V3-64 i18n**: after `lang('ko')` and opening every window of §8 (including `scale`, `draw`,
  `blockpick`, `defect-steps`, `hidekey`, `pipethk`, `ttinfo`), `untranslated().length ≤ 5`.

---

## 10. Korean / i18n obligations

- **92-i18n-ko owns the dictionary** (SPEC-v2 §5.3.1). Every user-visible string v3 adds — menu keys,
  window titles, buttons, field labels, dialog paragraphs, status hints, softkey short forms — gets a `ko`
  entry there. Feature owners add **English keys only**, in module-level tables translated at render time
  through `t()` (SPEC-v2 §5.3.2); templates, never concatenation
  (`t('Depth = {d}mm', {d})`, never `'Depth = ' + d + 'mm'`).
- **Out of scope for translation** (kept English, per the existing exemptions of SPEC-v2 §5.3.4): the
  physics status line (`#statusbar .sb-left`), instrument key legends and their F6 short forms
  (`CALIBRATE`, `ARROW RIGHT/UP`, `NEXT GROUP`, `FREEZE`), the on-LCD wizard captions of F3
  (`ENTER VALUE FOR THIN STANDARD` etc. — they are printed *by the simulated instrument*, which is an
  English-language device), the plotter's `HALF SKIP …` / `NN.N degree` / `angle BS = …` / `K=…` captions,
  and the editor's red canvas captions (`VOL Defect …`, `LACK OF FUSION …`, `Defect Number …`), all of
  which live inside `.no-i18n` subtrees or on canvases. The **menu items, window titles, buttons and
  status hints** that reach them are translated.
- **New terminology** (KS B 0817 / industry usage, extending SPEC-v2 §5.3.6 — binding for lessons, windows
  and the glossary):

  | English | Korean |
  |---|---|
  | beam spread half angle / BS | 빔 확산 반각 |
  | K factor (beam-spread constant) | K 계수 (빔 확산 상수) |
  | 20 dB drop / 10 % edge | 20 dB 드롭 (10 % 에지) |
  | stand-off | 스탠드오프 (입사점 거리) |
  | root corrosion | 루트 부식 |
  | rough surface | 표면 거칠기 |
  | misalignment / high-low | 맞댐 어긋남 (하이-로우) |
  | wall thickness variation | 두께 변동 |
  | parallel scan / non-parallel scan | 평행 주사 / 비평행 주사 |
  | scale mode | 축척 모드 |
  | protractor | 각도기 |
  | mm per pixel | 픽셀당 mm |
  | trace boundary | 경계 추적 |
  | teaching aid drawing mode | 교육용 그리기 모드 |
  | highlight pointer | 강조 포인터 |
  | uncalibrate | 교정 해제 |
  | thin / thick standard | 얇은 기준편 / 두꺼운 기준편 |
  | turn probe | 탐촉자 돌리기 |
  | draw region (blue box) | 그리기 영역 (파란 상자) |
  | single-line LOF | 단일선 융합 불량 |
  | key code (HIDE lock) | 키 코드 |
  | chord / brace (TKY) | 코드(주관) / 브레이스(지관) |
  | accept / reject (AccRej) | 합격 / 불합격 판정 |
  | screen shot | 화면 저장 |

  92 must carry `'Misalignment': '맞댐 어긋남 (하이-로우)'` and
  `'Misalignment…': '맞댐 어긋남…'` for the menu item.
- **Glossary** (`UT.i18nKo.glossary`) gains at least: `Beam spread half angle`, `K factor`,
  `Stand-off`, `Root corrosion`, `Misalignment (high-low)`, `Parallel scan`, `Corner echo at the scanning
  surface`, `Scale mode`, `Protractor`, `Thin/thick standard`, each in the existing
  `{term, ko, en, defKo, defEn, see:[lessonN]}` shape.
- `UT.test.untranslated()` must return ≤ 5 keys with every v3 window open (V3-64). New product names to add
  to the exemption set: `USK`, `LTC`, `RDTech`, `AccRej`, `BS`, `K`.

---

## 11. Lead decisions (taken) and open points

**Taken (final):**

1. **Default UT set stays `epoch600`.** The original's default is the USK 7, but our EPOCH 600 is the
   modern set our lessons and standards work assume, and V2's checks boot on it. F8 satisfies the videos by
   auto-switching the USK 7 lessons instead. (Coverage §1 "Default UT set" *different* — resolved this way.)
2. **EPOCH 600 is the sanctioned stand-in for the Epoch LTC / Lite / 4B / III family.** F5 adds an `EPOCH
   LTC` cosmetic preset because the cal video's second half runs on it and the tab row is a real teaching
   surface; the other three are pure re-skins with no behaviour of their own and are **out of scope**.
   `Delete EPOCH records` is implemented as a datalog clear (F7), not as a record store.
3. **No embedded video player** (F58). A single-file offline HTML cannot ship 17 videos and must not fetch
   them; the 25 lessons are the substitute, documented in About.
4. **The 'OK' splash is a menu item, not the boot screen** (F53). Booting into a letter-shaped demo would
   contradict SPEC §15.9's boot order and the quick tour, and would cost every user a mode change on first
   load.
5. **The plotter's third K value is not legible.** `angle BS = 7.9°`, `K=1.08` and `12dB K=0.704` are read
   directly from angleprobe_calibration f096–f126; the leading fragment of line 1 and the `6dB K=` value
   are covered by the EPOCH window in every available frame. F37 therefore *derives* all three from one
   measured half-angle with the ratios that 1.08 / 0.704 encode (`K12 = 0.652·K20`, `K6 = 0.519·K20`),
   which reproduces 1.08 / 0.704 / 0.56. If a clearer frame ever surfaces, only the two constants move.
6. **Circle-view graduations are labelled at a round step, positions stay true.** The original labels every
   40 mm (treating the 6-inch circumference as ≈ 480 mm); we keep the true `C = π·168.3 = 528.7` for all
   physics and gating and label at `max(10, round(C/12/10)·10) = 40` mm (F29). A UTman user comparing
   numbers sees the same labels; the physics stays correct.
7. **Velocity constants do not move** (F59). Our shear 3.24 already matches UTman II exactly; our
   compression 5.90 vs the original's 5.96 is pinned by V1 #11 and V2-10 and by every lesson answer. The
   optional `carbon-utman` material reproduces the videos' numerals without moving a single existing check.
8. **The IOW block's hole order stays mirrored.** SPEC marks `iow()` geometry FROZEN and the frozen
   self-test constants depend on it; the teaching content is identical. Not changed in v3.
9. **Picture import is exactly what an offline single file can do** (F41). Achievable: a user-initiated
   `<input type="file" accept="image/*">` read with `FileReader.readAsDataURL` into an in-memory
   `data:` URL, drawn on the cross-section, calibrated with the mm/px slider, and traced into a polygon
   specimen; plus `Capture`, which re-uses our own canvases via `toDataURL`. **Not achievable and not
   attempted:** loading a picture by URL or path, drag-and-drop from a remote source, reading the Windows
   clipboard reliably, saving the picture into the scenario/share link or into `localStorage` (a data URL
   of a photograph blows both budgets), and any form of screen capture outside our own canvases. Pictures
   are session-only, capped at 4 MB, and never persisted (§2).
10. **Windows-only affordances get browser-safe equivalents that keep the gesture.** Right mouse → the same
    right-button drag with `contextmenu` suppressed on the owning canvas only, and only while the relevant
    mode is active (F26, F51, F39); erase moves to Alt/Ctrl + right-drag and gains an explicit Eraser
    button. `SHIFT+F12` is kept as-is (Chrome does not reserve it) with `Tools ▸ Draw palette` as the
    discoverable equivalent, and a keyboard drawing path for a11y (F51). Windows file dialogs become a
    hidden `<input type=file>` for open and a Blob download for save (F34), with localStorage kept as the
    fallback. Nothing depends on a right mouse button existing: every right-button gesture has a menu or
    modifier equivalent.
11. **No change to `30-raytrace.js` for the pipe half of M12** (lead correction 1, §4.9). Reviewers must
    reject any such patch.
12. **F22 is a preset-geometry fix, not a tracer change** (lead correction 2 as re-measured, §4.10). The
    corner rule already fires for scanning-surface pairs; only the inclined `toeCrack` preset fails, and a
    tilted reflector losing its corner return is correct physics. Reviewers must reject a 30-raytrace patch.
13. **No-change items** confirmed from the audit and not given feature ids: the stylised device rendering
    (SPEC-sanctioned), the shaded weld cross-section texture, the corrected spellings
    (`Tandem (pitch catch)`, `Mode Propagation`, `Amplitude` — we do not copy the original's typos), the
    ASME DAC block's three-hole T/4-T/2-3T/4 layout (more standard-correct than the original's two), the
    V1 caption's pixel position, and the external-spreadsheet habit (our Datalogger and Print report cover
    it).

14. **F4's post-cal range is one rule with two inputs, not two examples** (QA round 3). The draft §3.4
    printed `r ≥ 1.1·2·d2` and then claimed 50.0 for the video's 20/40 cal, which that formula gives as 100;
    the shipped code was right and the sentence was wrong. §3.4 now states the rule as implemented — the
    deepest path the cal had to display is `d2` for a one-position two-multiple cal (`source ≠ 'step'` and
    `|d2 − 2·d1| ≤ 0.05·d1`) and `2·d2` for two separate standards — so 20/40 gives 50.0 (f022) and
    10/25 gives 100.0 with no special case. `rangeAfterCal()` in 80-modes and V3-4 are unchanged; only the
    prose moved.

**Lead decisions on the open points (taken — these are binding; the reasoning is recorded so a later
reader can reopen one with evidence rather than preference):**

1. **TKY chord caption** — ship `Diameter={od}  W/T={wt}mm` as drafted. The frames cannot resolve the words
   between the numbers and the two numerals are what the exercise teaches; revisit only if a sharper frame
   appears.
2. **F51 chord** — bind BOTH `Shift+F12` (fidelity to the original) and `Ctrl+Shift+D` (guaranteed free),
   and list both in Help ▸ Keyboard shortcuts. A teaching aid that a window manager can silently swallow is
   worse than a second binding.
3. **Toolbar at 20 buttons** — keep all 19 v1 buttons and add `AccRej` as the 20th. `CLEAR` stays on the
   toolbar: it is in the v1 contract and in lesson steps, and moving it to a menu to match the original's
   count would break more than it buys. The row already scales with the design box (SPEC-v2 §5.4), so 20
   fits at 1024×640; verify in V3-61 rather than dropping a button.
4. **`tb-dac` id with an `ASME` label** — keep the id. Element ids are contract (v1 checks, lessons,
   `UT.test.click`); only the visible label follows the chosen block. Record the mismatch in the file header
   of 90-app so the next reader is not surprised. No rename, no alias.
5. **Weld-condition physics depth** — F45 ships the GEOMETRIC change only (stepped/​bumpy/​rough contour, and
   the echoes that follow from tracing it). Beam mis-steer and roughness-driven scatter are explicitly out of
   scope for v3; if a later programme wants them they get their own feature id and their own acceptance
   numbers, because they would move existing amplitudes.
6. **Range rescale rounding** — accept the ≤ 0.1 mm walk per shear⇄comp switch. Storing a time-base range
   would be a second source of truth for `instrument.range`, which SPEC-v2 §2 forbids.
7. **`Run to UT Screen Range` sentinel** — do NOT use `display.skips = null`. Add a separate boolean
   `display.skipsToRange` (default false); when true the renderers derive the skip count from the current
   range and `display.skips` keeps its last numeric value. `coerceLike` then needs no exemption and every
   existing reader of `display.skips` stays valid.
8. **Parallel-scan length** — accept `x ∈ [−pcs, +pcs]` in 61 steps as drafted; the original never states it
   and this spans the lateral-wave-to-backwall window symmetrically.
9. **AUT default gates** — adopt the original's 15 % / 15 mm / 30 mm defaults ONLY if V1 #12 (gate 1 above
   level exclusively within z 110…160) still passes unchanged with them; otherwise keep the current defaults
   and expose the original's values as the AUT panel's `Reset to UTman defaults` button. The v1 check wins.
10. **Fourth step-wedge preset** — add `Steps 20-8 mm (2 mm)` as its own menu entry. `Custom Steps…` keeps
    its current default; repurposing it would change what an existing lesson step produces.

**Open points that remain (nothing blocks implementation):**


(For the record, the questions these decisions answer:)

1. **TKY chord caption wording.** The audit reports `Diameter=600 … W/T=32mm`; the available frames
   (tky f012–f020) are too soft to resolve the words between the two numbers — the glyph run reads as
   `Diameter=<n> Met…s  W/T=32mm`. F46 specifies `Diameter={od}  W/T={wt}mm`. Confirm, or supply a
   sharper frame, before the string is translated.
2. **`SHIFT+F12` availability.** It is free in Chrome and Edge but some Linux window managers grab F12
   chords. Should F51 also bind a second, guaranteed-free chord (proposal: `Ctrl+Shift+D`)? The menu item
   makes the feature reachable either way.
3. **Toolbar width at 20 buttons.** Adding `AccRej` (F52) makes the row 20 wide; at 1024×640 with
   `display.scale='auto'` (k = 0.8) it still fits, but only just. Accept, or drop `CLEAR` into
   `Options ▸` to keep 19 as the original's count?
4. **`ASME` label vs `tb-dac` id.** F11 renames the visible label only; the id stays `tb-dac` so v1/v2
   automation keeps working. Confirm we are content with a permanent label/id mismatch, or schedule an id
   rename with an alias for one release.
5. **Weld-condition physics depth.** F45 specifies deterministic, cheap perturbations (a seeded bumpy root,
   a doubled grass term, a geometric step, a sinusoidal wall). The originals were almost certainly no
   deeper, but if the lead wants misalignment to also mis-steer the beam refraction at the step, that is a
   larger change to 30-raytrace and should be its own feature.
6. **Range rescale on mode change** (F16) is applied once per shear⇄comp transition. If a user switches
   0°⇄60° repeatedly the range walks back and forth by rounding (≤ 0.1 mm per switch). Accept, or store the
   time-base range and derive the mm range each frame (cleaner, but touches `instrument.range`'s meaning,
   which v1/v2 checks read directly)?
7. **`Run to UT Screen Range`** (F17) sets `display.skips = null`. Persistence and scenarios coerce
   `display` with `coerceLike`, which will reject `null` for a numeric field — the lead should confirm the
   sentinel (`null` with an explicit exemption, or the string `'range'`).
8. **Parallel-scan geometry** (F43). The original never states the parallel scan's length; F43 uses
   `x ∈ [−pcs, +pcs]` in 61 steps, which produces a well-shaped hyperbola for the T 20 / PCS 60 case.
   Confirm, or pin a length in mm.
9. **AUT default gates** (F50) move to the original's 15 % / 15 mm / 30 mm. This changes what a user sees
   on first entering AUT. Confirm this is wanted, given that our defaults were chosen to make V1 #12's
   defect obvious.
10. **`Steps 20-8 mm (2 mm)`** (F12) adds a fourth step-wedge preset. If the menu is felt to be getting
    long, it could replace `Custom Steps...`'s default rather than adding a row.
