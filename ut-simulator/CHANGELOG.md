# Changelog — UTsim (UTman-style ultrasonic weld testing simulator)

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
