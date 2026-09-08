# Changelog — UTsim (UTman-style ultrasonic weld testing simulator)

## v3 — 2026-09-08

The 17 original UTman videos were treated as the functional specification. A per-video audit inventoried **274
demonstrated features** (220 already working, 37 partial, 17 missing) and 111 fidelity gaps; `SPEC-v3.md` turned them
into features F1–F59 with acceptance checks V3-1…V3-64. All 112 checks (14 v1 + 34 v2 + 64 v3) pass.

### Instrument and calibration
- Instrument OFF blanks the trace without closing the window; UnCalibrate, EPOCH record deletion, Always Show UT Controls.
- Auto-calibration runs on the **current specimen** (1st and 2nd backwall at one probe position), not a forced step
  wedge, with the thickness values typed or arrowed **on the LCD** ('ENTER VALUE FOR THIN/THICK STANDARD') and the
  range re-set to a round value afterwards.
- Range-preset softkeys, Trig Diameter, Gate Status, F-key flash, LTC skin, key-function hints echoed into the status
  bar; USK 7 chrome with float/dock; hand-drawn DAC mode.
- 'Turn Probe' on the V1/V2 oblique screens; the V2 wide face with its 5 mm hole and 5° graduations; ASME / A5 block
  chooser; descending 20→8 mm step-wedge preset.

### Probe, beam and echoes
- The probe turns round when dragged across the weld (Pos shown unsigned); both wave modes are drawn below the first
  critical angle; the original's wording and leg colours; 'Normal 0°' status with range rescale.
- Fractional skips and 'Run to UT Screen Range'; twin-crystal near-surface boost at 0°; Through Transmission with a
  receiver moved by Shift+arrows; the mirrored (virtual) probe image; phased-array shoe stand-off and height.
- **Preset defects now land under the parked probe** (they were centred half a circumference away on pipes, which is
  the whole of the reported "pipes give no corner echo"); the toe-crack preset is near-vertical so the taught
  full-skip corner exercise works. Neither needed a ray-tracer change — verified by measurement.
- Echo-driven `Depth =` status cell.

### Defect editor
- The verbatim STEP 1–5 instructions dialog; right-drag draws a single-line LOF (erase moves to Alt/Ctrl+right-drag);
  keyboard manipulation (Shift+arrows move, Z/X rotate, A/S resize); stroke auto-classification with the
  'LACK OF FUSION  Defect Angle …  Height=…  Top=…' caption; the blue relocatable draw-region box; depth colour-coding
  in all three renderers; the HIDE key-code lock; Load Def / Save Def as real files.

### Plotter, Scale Mode, views and teaching aids
- Draw-on-block 10 % beam-edge marks; freehand beam-spread lines with a live 'NN.N degree' caption; the computed
  'angle BS = 7.9°' and '20dB K=1.08  12dB K=0.704' captions; PLOT as an overlay on the **current weld**; the movable
  ruler, green dots and angle hook.
- **Scale Mode** (new `85-scalemode.js`): import a picture from a local file, calibrate mm per pixel, trace the
  boundary into a polygon specimen the tracer scans, drop a protractor, and stamp skip-distance graduations.
- **Instructor annotation toolkit** (new `86-annotate.js`): Shift+F12 (or Ctrl+Shift+D) full-window drawing — left
  button red, right blue — a Tools ▸ Draw palette, and a pointer torch.
- TOFD gains the labelled 'Parallel Scan' strip beside 'Non-Parallel Scan', an A-scan OFF button and pipe-curvature
  times; TKY gains a genuinely curved chord and the complete pipe ring; the plan view gains the original's dial
  position, datum and flank rulers; the 3D pipe shows defect bands at their z extent.
- **Weld condition toggles**: root corrosion (a bumpy, echoing root), rough surface (transfer loss + grass),
  misalignment (a stepped joint with its corner echoes) and pipe wall-thickness variation (a backwall that walks).
- AccRej button, 'OK' demo splash, Save screen shot, Scale Mode and About promoted to the menu bar.

### Engineering
- 22 modules; `tools/acceptance.mjs` now runs 112 checks; the Korean dictionary covers every new surface.

## v2 — 2026-09-06

Programme defined in `SPEC-v2.md` (79 expert-critique findings applied before implementation). Sixteen modules were
implemented in parallel against the spec, then integrated, localised, and driven through adversarial QA rounds with the
v1 regression checks (SPEC §11.1 #1–#14) and the v2 acceptance checks (SPEC-v2 §9) run by `tools/acceptance.mjs`.

### Physics
- P1 Piston (Bessel) beam directivity with side lobes, 41-ray fan, correct −6/−20 dB edges; rectangular-crystal near-field factor.
- P2 Mode conversion (S↔L) at surfaces and defect faces; time-based echo placement; reciprocal-path spurious echoes; `describe().category`.
- P3 Rayleigh surface wave from steep probes, cap-toe/end/notch/crack reflectors, finger-damping tool (max 3 dampers).
- P4 Materials library (carbon, austenitic, aluminium, copper, titanium, cast iron, Perspex) with one-way L/S attenuation, grass, anisotropic weld metal; transfer-loss correction.
- P5 Probe library (22 named probes incl. MWB/WB/MB/MSEB series, A430S 16×16, twin 60°, TOFD, PA), custom angles, twin angle probes.
- P6 Focused probes (F ≤ N, focal gain).
- P7 TCG from the DAC curve; EPOCH 600 Pulsar (energy 100/200/300/400 V, damping 50…400 Ω, PRF) and Receiver (filter list) acting on the signal.
- P8 DGS/AVG diagram window with ERS readout (disc law 2π·G²/A²); FBH reference block.
- P9 TOFD v2: Fermat L-S mode-converted backwall (24.77 µs at PCS 60 / T 20) + S-S replica, dead zones, PCS optimiser, hyperbolic cursor, straightening.
- P10 Phased array v2 (`56-pa`): wedge-corrected focal laws, S-scan / E-scan / encoded C-scan, per-angle TCG (ACG-style).
- P11 AUT v2: up to 6 channels, C-scan map, adaptive step, speed, strip-chart snapshot for reports.
- P12 B-scan and echo-dynamic windows.

### Training
- T1 25 guided lessons (state / transition / choice / numeric steps, hints, Do it for me, progress badges, KO/EN); lessons 23–25 are new.
- T2 Trade test v2: difficulty table, seeded specimen + defects, recordability filter, one-to-one matching, attribute scoring, critical-miss FAIL, pass mark 70 %, coverage tracker, timer, history/scoreboard, full report template + print, seed-only exam links with code lock and signed result tokens.
- T3 Standards evaluation (ISO 17640, ISO 11666 AL2/AL3, ASME VIII App. 12, AWS D1.1 Table 8.2) as editable rule data with a "Why?" cell.
- T4 Procedure presets with allowed-probe lock; T5 random practice (Hint / Reveal one / Check row); T6 sizing v2 (6 dB, 20 dB, max, evaluation level, tip diffraction); T7 echo-identification quiz.

### Fidelity
- F1 Weld preparations: single-bevel (K), J, single-V with backing bar, fillet T-joint, nozzle/branch — in the cross-section and the 3-D window.
- F2 EPOCH 600 Pulsar/Rcvr pages, AUTO XX %, SAVE → datalogger window, Compare overlay. F3 gate alarm sound (opt-in). F4 TOFD pair box in the plan view; Focus Beam really focuses.

### Usability
- U1 Complete Korean localisation (single dictionary, live switch, KS terminology, glossary). U2 pointer/touch support, touch bar, design-box scaling.
- U3 Scenario slots, JSON import/export and `#scn=` share links (incl. exam mode). U4 glossary, quick tour, standards notes. U5 ARIA menus/toolbar, keyboard menu navigation, focus rings, high contrast, reduced motion.

### Engineering
- E1 `tools/acceptance.mjs` (v1 + v2 checks, JSON, exit code). E2 GitHub Actions workflow `utsim-ci.yml`. E3 `build.py` also writes `docs/utman_simulator.html`.
- Core: Bessel/piston helpers, i18n with parameters and automatic relabelling, scale-aware pointer helpers, Web Audio helper, test API hides the hidden truth while an exam is locked.

## v1 — 2026-09-06

First release: single-file simulator covering the 22 playlist videos (instrument skins EPOCH 600 / EPOCH 4 / USK7, probes 0–70°,
V1/V2/step/DAC/IOW/TKY/lamination specimens, plan + cross-section + 3-D views, defect editor, TOFD, AUT, trade test, lessons),
verified by 14 acceptance checks in headless Chromium.
