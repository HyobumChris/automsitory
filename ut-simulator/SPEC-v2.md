# UTsim v2 — full improvement programme ("everything, and beyond")

This document amends `SPEC.md` (v1). v1 stays binding wherever v2 does not change it; where they
conflict, **v2 wins**. All v1 acceptance checks (SPEC §11.1 #1–#14) must keep passing after v2 (one
numeric change is allowed and listed in §9.0). Same product rules: ONE self-contained HTML file, no
external resources, no build tooling beyond `build.py`, headless-loadable modules, `UT.test` API.

Reading order for implementers: SPEC.md §2, §3, §4, §11, §13, §14, §15 → this file completely.

---

## 0. Scope overview (feature ids are used in ownership tables and acceptance checks)

| id | area | feature |
|---|---|---|
| P1 | physics | Piston (Bessel) beam directivity with side lobes, wider fan, correct −6/−20 dB edges |
| P2 | physics | Mode conversion (S↔L) at surfaces and defects, time-based echo placement, spurious-echo traps |
| P3 | physics | Surface (Rayleigh) wave from steep probes + finger-damping tool |
| P4 | physics | Materials library (velocities, attenuation, grass, anisotropic weld metal) |
| P5 | physics | Probe library (named probes, rectangular crystals, custom angles, twin angle probes) |
| P6 | physics | Focused probes (geometric focus) |
| P7 | physics | TCG (time-corrected gain) from DAC; Pulsar/Receiver settings that really act on the signal |
| P8 | physics | DGS/AVG diagrams and equivalent reflector size (ERS); FBH reference block |
| P9 | physics | TOFD v2: mode-converted signals, dead zones, PCS optimiser, hyperbolic cursor, straightening |
| P10 | physics | Phased array v2: array/focal laws, S-scan, E-scan, encoded C-scan, per-angle TCG |
| P11 | physics | AUT v2: up to 6 channels, C-scan map, adaptive step, speed |
| P12 | physics | B-scan window (encoded 0° scans) and echo-dynamic window |
| T1 | training | Guided lessons with automatic step checks, hints, "do it for me", progress badges |
| T2 | training | Trade test v2: difficulty, seeded geometry, full scoring (length/depth/height/type/false calls), timer, history, scoreboard, printable report, exam sharing |
| T3 | training | Standards evaluation window (ISO 17640 / ISO 11666 / ASME VIII / AWS D1.1 rule sets, editable), disposition scoring |
| T4 | training | Procedure presets (probe set, reference block, sensitivity, transfer correction), lock in exams |
| T5 | training | Random practice generator (like trade test without timer) |
| T6 | training | Sizing v2: 6 dB / 20 dB / max-amplitude / tip-diffraction height, echo-dynamic classification hint |
| F1 | fidelity | Weld preparations: single-bevel (K), J, single-V with backing bar, fillet T-joint (set-on), nozzle/branch |
| F2 | fidelity | EPOCH 600 Pulsar/Rcvr pages functional, AUTO XX % key, SAVE → datalogger window, Compare (frozen overlay) |
| F3 | fidelity | Gate alarm sound (Web Audio, opt-in) |
| F4 | fidelity | TOFD probe pair in plan view as the original's small box; focus-beam menu really focuses |
| U1 | usability | Complete Korean localisation (every string), live language switch |
| U2 | usability | Touch/pointer support + touch bar; responsive scaling (fits 1024×640 … 4K without clipping) |
| U3 | usability | Scenario save/load (5 slots + JSON text) and **share by URL** (`#scn=`) incl. exam mode |
| U4 | usability | Help: glossary (KO/EN, ≥ 60 terms), quick tour overlay, standards notes |
| U5 | usability | Accessibility: ARIA menus/toolbar, keyboard menu navigation, focus rings, high-contrast mode |
| E1 | engineering | `tools/acceptance.mjs` runner (v1 + v2 checks, exit code, JSON report) |
| E2 | engineering | GitHub Actions CI (selftests + build + acceptance in headless Chromium) |
| E3 | engineering | GitHub Pages: `build.py` also writes `docs/utman_simulator.html` |
| E4 | engineering | Performance: ≤ 8 ms compute with the wider fan, adaptive scan steps, typed arrays |
| E5 | engineering | Code-quality pass (dead code, duplication, JSDoc, consistent style) with regression tests |
| E6 | engineering | README v2 + CHANGELOG |

---

## 1. New/changed files and ownership

```
src/00-core.js        (frozen, updated by the lead)  + besselJ1, i18n params, dom.localPos scale-aware,
                      audio helper, defaultState v2 fields (§2)
src/10-specimens.js   (frozen, updated by the lead)  + materials, weld preps F1, fbhBlock, region helpers
src/20-probe.js       (frozen, updated by the lead)  + probe library P5, piston constants, focus, Rayleigh v
src/30-raytrace.js    P1 P2 P3 P4 P6 (+ weld-metal attenuation)                 owner: physics-1
src/40-ascan.js       time-based placement (P2), P7 (TCG, pulser/receiver), material grass, hooks   owner: physics-2
src/45-standards.js   NEW: P8 (DGS maths + window 'dgs'), T3 (rule sets + window 'evaluation'), T4 (procedures) owner: training-1
src/50-tofd.js        P9                                                        owner: physics-3
src/55-aut.js         P11                                                       owner: physics-4
src/56-pa.js          NEW: P10 (window 'pa')                                     owner: physics-5
src/60-view-cross.js  F1 drawing, P2/P3/P6 ray styles, finger tool, pointer events, FBH block     owner: ui-1
src/62-view-plan.js   F4, pointer events, PA/AUT map hints                      owner: ui-2
src/64-view-3d.js     F1 shapes (T-joint, nozzle), pointer events               owner: ui-3
src/66-view-plotter.js T6 sizing v2, P12 (windows 'bscan', 'echodyn'), plotter uses new edges   owner: ui-4
src/70-instruments.js F2, F3, TCG display, touch, high contrast, compare overlay owner: ui-5
src/80-modes.js       new modes (fbh, weld preps), procedure lock, thin wrappers delegating lessons/trade to 82/84   owner: ui-6
src/82-lessons.js     NEW: T1 (window 'lessons' v2)                             owner: training-2
src/84-trade.js       NEW: T2 T5 (windows 'trade', 'scoreboard', 'report')      owner: training-3
src/90-app.js + style.css  menus for everything, U2 scaling/touch bar, U4 tour, U5 a11y, print CSS, boot order   owner: ui-7
src/92-i18n-ko.js     NEW: U1 dictionary (+ glossary data, tour text)           owner: i18n (runs AFTER all UI files)
src/94-scenario.js    NEW: U3                                                   owner: training-4
tools/acceptance.mjs  NEW: E1                                                   owner: qa-1
.github/workflows/utsim-ci.yml NEW: E2                                          owner: qa-1
index.html            script order (lead): 00,10,20,30,40,45,50,55,56,60,62,64,66,70,80,82,84,90,92,94
```
Rules of SPEC §15.1–15.3 apply to the new files (IIFE, `UT.<name>`, `css` string + `injectCss`, headless-safe,
`Object.assign(UT.test, …)`). Namespaces: `UT.standards`, `UT.pa`, `UT.lessons`, `UT.trade`, `UT.scenario`,
`UT.i18nKo` (registers via `UT.i18n.add('ko', {...})` at load — allowed, no DOM), `UT.views.bscan`, `UT.views.echodyn`.

---

## 2. State additions (`UT.defaultState()` — written by the lead; use exactly these names)
```js
probe: { …v1, libId: 'gen-60-5-10', crystal: { a: 10, b: 10, shape: 'round' }, // a = size in the beam plane (mm), b = across (z)
         focus: { on: false, F: 30 }, angleCustom: null /* number when not one of 0/45/60/70 */ },
material: 'carbon',                     // key into UT.specimens.materials
weldOpts: { …v1, prep: 'single-v', weldMaterial: 'same', backing: false, webT: 12, branchOd: 114.3 },
physics: { modeConv: true, surfaceWave: true, sideLobes: true, fanRays: 41 },
damping: { tool: false, points: [] },   // finger dampers: x positions on the scanning surface (max 3)
instrument: { …v1, tcg: { on: false }, pulser: { energy: 'med', damping: 150, prf: 60 },
              receiver: { filter: 'broadband' }, autoPct: 80, compare: null /* Float32Array snapshot */,
              datalog: [] /* {id, t, readouts, gain, range, note} */ },
display: { …v1, sound: false, touchBar: 'auto' /* 'auto'|'on'|'off' */, highContrast: false,
           scale: 'auto' /* 'auto'|1 */, convRays: true, deadZones: true },
standards: { standard: 'iso11666', level: 'AL2', technique: 1, testingLevel: 'B', transferDb: 0,
             rulesOverride: null, procedure: null },
lessons: { active: null, step: 0, progress: {} /* {n: {done: bool, best: %}} */ },
trade: { …v1, difficulty: 'intermediate', timeLimitMin: 60, history: [], exam: null /* {code, locked} */ },
pa: { elements: 16, pitch: 1.0, freq: 5, from: 35, to: 75, step: 1, focusDepth: null, view: 'S',
      escanAngle: 60, scan: null, tcg: false },
bscan: { axis: 'x', on: false, columns: null },
echodyn: { on: false, samples: [] },
tofd: { …v1, modeConv: true, straighten: false, deadZones: true },
aut: { …v1, channels: 3, gates: [6 entries], map: null, speed: 6 },
scenario: { slot: null, name: '' },
```
Persistence (SPEC §15.9) additionally saves: `material, physics, standards (except rulesOverride when null),
lessons.progress, trade.history, trade.difficulty, trade.timeLimitMin, pa (no scan), display (new keys)`.

---

## 3. Physics v2

### 3.1 P1 — piston directivity (30-raytrace, 20-probe, 00-core)
- `UT.math.besselJ1(x)` (Abramowitz–Stegun 9.4.4/9.4.6 polynomial, |error| < 1e-7).
- One-way directivity `D1(θ) = |2·J1(x)/x|`, `x = (π·a/λ)·sinθ`, `a = probe.crystal.a` (round: `d`).
  Pulse-echo weight = `D1²`. Rays outside the main lobe keep a floor `max(D1, 10^(−30/20))` when
  `physics.sideLobes` (else 0 beyond the first null).
- Derived (20-probe): `halfAngle6dB = asin(0.51 λ/a)` (pulse-echo −6 dB, unchanged),
  `halfAngle20dB = asin(0.87 λ/a)` (**pulse-echo −20 dB; was 1.08**), `nullAngle = asin(1.22 λ/a)`,
  `fanMax = asin(min(0.99, 1.8 λ/a))`, `sidelobeDb = −17.6`. `hz` (§6.7 v1) uses `crystal.b`.
- Fan: `physics.fanRays` (41) rays: 21 uniformly in `[−nullAngle, +nullAngle]`, the rest uniformly in
  the two side-lobe bands up to `±fanMax`. Weight of ray i = `D1(δ_i)` (one-way); receive weight
  `D1(δ_return)` as in v1. The edge20 polylines use the new `halfAngle20dB`.
- Performance: rays outside the main lobe trace at most 2 legs; keep ≤ 8 ms for the default plate.

### 3.2 P2 — mode conversion and time-based echoes (30, 40)
- Every ray carries `mode ('S'|'L')`, `v` (from `specimen.material`), cumulative `tUs` (one-way time)
  and `len`. Echo placement uses time: `Echo.tUs` = two-way time (return path assumed reciprocal:
  `2·tUs` for diffuse scatterers; the actual accumulated time for return-to-probe echoes), and
  `Echo.path = Echo.tUs · vProbe / 2` (what a calibrated set displays; `vProbe` = the probe's own mode
  velocity in the base material). 40-ascan keeps its time base (`t = tUs + wedgeDelayUs`).
- At every reflection off an outline edge/arc or a planar defect segment with incidence angle φ (from
  the normal), when `physics.modeConv` and the ray has `bounces < 3`:
  - incident **L**: converted S ray with `sinφS = sinφ·vS/vL`, energy fraction
    `R_LS(φ) = 0.9·(sin 2φ)^1.6` (φ in radians inside sin), specular L keeps `1 − R_LS`.
  - incident **S** with `φ < φc = asin(vS/vL)` (33.3° in steel): converted L with `sinφL = sinφ·vL/vS`,
    `R_SL(φ) = 0.85·(φ/φc)^1.5`, specular S keeps `1 − R_SL`. For `φ ≥ φc`: no conversion (total reflection).
  - Converted rays inherit the fan weight, get `e × R`, are dropped when `e < 0.01`, and are drawn with
    `kindTag: 'L'|'S'` so 60-view-cross can style converted legs (orange dashed for L, white for S).
  - A converted wave arriving back at the probe within the aperture/direction acceptance is received
    with an extra factor 0.5 (mode mismatch with the wedge) — kind `'modeconv'`.
- Classic traps that MUST emerge: (a) 0° L probe over a 45° inclined planar defect → converted S echo
  later than the L path would suggest; (b) TOFD L backwall followed by an L→S converted backwall
  (§3.9); (c) 45° S probe hitting a vertical crack face near the root (φ ≈ 45° > φc: no conversion —
  correct) but a **30°-inclined** LOF face gives an L conversion (φ < φc) → an extra earlier echo.
- `UT.rays.describe` labels converted echoes `'Mode-converted (L)'` etc.

### 3.3 P3 — surface (Rayleigh) wave + finger damping (30, 60, 90)
- `vR = 0.92·vS` (20-probe: `derived.vRayleigh`). When `physics.surfaceWave` and the probe is a shear
  angle probe with `refracted ≥ 65°` (or wedge angle within 6° of the second critical angle), launch a
  surface wave along the scanning surface in the beam direction with energy
  `eR = 0.15·clamp((refracted − 60)/15, 0, 1)`.
- It travels along consecutive `top`/`cap` outline edges; at a **discontinuity** — cap toe (first `cap`
  vertex), plate/block end, notch, a surface-breaking planar defect (crack reaching y ≤ 0.5) — a
  fraction reflects back: cap toe 0.5, end face 1.0, notch 0.8, surface-breaking crack 0.8; the rest
  continues (cap: passes over). Returned energy → echo kind `'surface'`, `tUs = 2·d/vR`, amplitude
  `eR·refl·q^0.5` with the surface-distance law.
- **Finger damping** (`damping.points`): each damper at `x_d` between the probe and the discontinuity
  multiplies the surface wave by 0.1 (both ways → −40 dB). Tool: `Probes ▸ Finger damping tool` (and
  toolbar? no — menu + shortcut `D`) toggles `damping.tool`; while on, clicking on the scanning
  surface in the cross-section adds a damper (max 3; click within 4 mm removes), drawn as a small
  grey fingertip. `UT.test.setDampers([x…])`.
- 60-view-cross draws the surface wave as a wavy 1 px line along the surface (out to the reflector).

### 3.4 P4 — materials (10, 30, 40)
`UT.specimens.materials` (key → `{name, nameKo, vComp, vShear, atten5 /* dB/mm at 5 MHz, two-way */, grass /* 0..1 */, anisotropic}`):
carbon (5.90, 3.24, 0.010, 0.02, false), austenitic (5.66, 3.12, 0.045, 0.12, true), aluminium (6.32, 3.13, 0.004, 0.01),
copper (4.66, 2.33, 0.030, 0.06), titanium (6.10, 3.12, 0.008, 0.02), castiron (4.60, 2.60, 0.080, 0.20, true),
perspex (2.74, 1.43, 0.15, 0.0). `spec.material = materials[state.material]` (builders take `material` in opts;
modes pass `state.material`). Attenuation scales `∝ (f/5)²` for grass and `(f/5)^1.5` for atten.
Weld metal: `weldOpts.weldMaterial === 'austenitic'` → rays crossing `weld.region` get extra attenuation
0.15 dB/mm·(f/5) and the A-scan grass ×3 inside the weld time window (`UT.specimens.segmentInRegion(spec, a, b) → mm`).
A-scan grass level = `materials.grass · (f/5)² · 100 %` at 40 dB reference, scaled with gain.

### 3.5 P5 — probe library (20-probe, 90 dialog)
`UT.probe.library` entries: `{id, name, maker, family:'straight'|'angle'|'twin'|'tofd', angle, freq, crystal:{a,b,shape}, wedgePath, crystalType, notes}`:
`mb4s` (MB 4 S, 4 MHz, ⌀10 straight), `mb2s` (2 MHz ⌀24), `mseb4` (twin 4 MHz 8×9), `mwb45-2/60-2/70-2` (2 MHz 8×9),
`mwb45-4/60-4/70-4` (4 MHz 8×9), `wb45-2n/60-2n/70-2n` (2 MHz 20×22), `k2n` (2 MHz ⌀24 straight), `a430s-45/60/70`
(5 MHz ⌀10 shear, the v1 defaults: ids `gen-45-5-10`, `gen-60-5-10`, `gen-70-5-10`), `gen-0-5-10`, `tofd-60-5-6`
(TOFD 5 MHz ⌀6 L), `pa-16-1.0` (array; used by 56). `UT.probe.select(id)` → patch for `UT.setIn('probe', …)`.
Custom angle: `probe.angle` may be any 35…80 (dialog); the toolbar angle buttons pick the library entry of
the current family with that angle (fallback generic). `derive()` uses `crystal.a` for the fan and `crystal.b`
for `hz`; twin-crystal angle probes: no initial pulse, near-surface sensitivity boost ×1.5 for path < 15 mm.

### 3.6 P6 — focused probes (30, 20)
`probe.focus = {on, F}`: when on, rays are launched from 41 aperture points uniformly across `[−a/2, +a/2]`
along the surface tangent, each aimed at the focal point at distance `F` along the centre ray; weight of
each ray = `D1` of its angle from the centre direction (so the focus is geometric, divergence beyond F
is geometric). Focus only for `refracted ≤ 70°` and `F` in 10…150. `Probes ▸ Focus Beam` opens a small
dialog (on/off, F). Expected: an SDH at path ≈ F reads ≥ 3 dB higher than unfocused and its −6 dB
x-width is ≤ 0.7× the unfocused width.

### 3.7 P7 — TCG, pulser, receiver (40, 70)
- TCG: `instrument.tcg.on` (needs ≥ 2 DAC points): per-sample gain `g(p) = 20·log10(80 / dacPct_ref(p))`
  where `dacPct_ref` is the DAC curve at `refGain`; applied in `synth` (clip 0…40 dB); the DAC curve is
  drawn flat at 80 % when TCG is on. EPOCH page 3 gets `TCG` softkey.
- Pulser: `energy` low/med/high → amplitude −6/0/+6 dB and pulse width ×1.2/1/0.9; `damping` 50/150/400 Ω →
  pulse width ×0.75/1/1.3 (v1 `instrument.damping` boolean maps to 50 Ω); PRF display only.
- Receiver: `filter` broadband | 2 MHz | 5 MHz | 10 MHz: if the band ≠ probe freq band → −6 dB and pulse
  width ×1.3; `rectify` as v1; `reject` as v1.
- AUTO XX %: EPOCH 600 `2ND F + GATES` (the "AUTO XX%" legend) sets gain so the gated peak reads
  `instrument.autoPct` (default 80); EPOCH 4 `AUTO-80` already exists.
- Compare: EPOCH `2ND F + ❄` stores the current trace in `instrument.compare`; drawn in grey behind the
  live trace; again clears.
- SAVE key → datalogger entry `{id, t, readouts (SP/SD/DP/amp), gain, range, note}`; window `datalog`
  (70) lists entries, delete, copy JSON.

### 3.8 P8 — DGS / ERS + FBH block (45, 10)
- Normalised DGS (Krautkrämer general diagram, circular crystal): `A = s/N`, `G = dERS/a`.
  Backwall `H_bw(A) = A ≤ 1 ? 1 : 1/A`; disc `H_disc(A, G) = (π/4)·G²/max(A, 1)²`; SDH reference is not
  a disc — the window converts SDH via `H_sdh(A, d) = 0.5·sqrt(d/a)/max(A,1)^1.5` (illustrative).
- `UT.standards.dgs.curves(derived, Gs=[0.1,0.2,0.3,0.4,0.5,0.7,1.0]) → {A[], bw[], discs:[{G, H[]}]}` (A 0.5…30 log-spaced).
- ERS: `UT.standards.dgs.ers({derived, ref:{kind:'backwall'|'fbh', path, ampPct, gain, fbhMm}, echo:{path, ampPct, gain}, transferDb})`
  → `{G, ersMm, dBvsRef, dBvsDisc3}`: H_echo = H_ref(A_ref)·10^((ampEchoDb − ampRefDb)/20) with
  ampDb = 20log10(pct) − gain + transferDb; solve `G = sqrt(H_echo·4·A_echo²/π)`.
- Window `dgs` (45): log–log plot (A vs H in dB), backwall curve, disc curves, markers for the reference
  and the gated echo, ERS readout `ERS = 2.3 mm (G 0.23)`, "Record reference (backwall)" / "(FBH)" buttons
  reading `frame.readouts.primary`.
- `UT.specimens.fbhBlock({T:60})`: 300 × 60 block with flat-bottom holes ⌀ 2, 3, 4, 6 mm at depths 30
  (x = 60, 110, 160, 210) and ⌀ 3 at depth 50 (x = 260): each FBH = a **horizontal planar reflector** of
  width d at depth y (segment tag `'fbh'`, specular, plus tip diffraction at its ends); 0° probes see it,
  angle probes barely. Drawn as a bar with a thin drill shaft to the bottom face. Mode `'fbh'` (80).

### 3.9 P9 — TOFD v2 (50)
- Mode-converted signals (`tofd.modeConv`): L→S backwall: `t = wd·2 + sL/vL + sS/vS` with
  `sL = sS = √((pcs/2)² + T²)` (amplitude 0.35, phase like the backwall) after the L backwall; S
  replicas of tip signals (`t_tip·(…)` computed with the S velocity on the return leg, amplitude 0.12).
- Dead zones (`tofd.deadZones`): lateral-wave dead depth `dL = ½·√((tL' + τ)²·vL² − pcs²)` with
  `tL' = pcs/vL`, `τ` = pulse length (1.5 cycles) — shaded band on the D-scan top and the cross-section;
  backwall dead zone similar (band above the backwall).
- PCS optimiser button: `pcs = 2·(2T/3)·tan θ` ("2/3 T rule"), applied to `tofd.pcs`.
- Hyperbolic cursor: hovering the D-scan at (z, t) draws the diffraction hyperbola of a point at that
  depth: `t(z') = 2wd + (√((x−xt)²+d²+(z'−z)²) + √((x−xr)²+d²+(z'−z)²))/vL` for z' ± 40 mm.
- Straightening (`tofd.straighten`): subtract per-column lateral-wave time offset (here constant → a
  visual toggle that aligns the lateral wave to a flat line and marks it).
- RF grass from the material.

### 3.10 P10 — phased array v2 (56-pa, NEW)
- Array `{elements, pitch, freq}`; active aperture `A = elements·pitch`; effective crystal `a = A·cos(wedge)`
  for the directivity; wedge 36° (shear) for S-scan, 0° for E-scan L; `derived` per angle via `UT.probe.derive`.
- Focal laws: for steering angle θ (and optional focus depth Fd): element delays
  `τ_i = (x_i·sinθ)/v_wedge` (+ focusing term `(√(x_i² + Fd²) − Fd)/v` sign-corrected) — shown as a bar
  chart in the panel.
- S-scan: angles `from…to` step; per angle trace (fan 9 rays, ≤ 2 legs) → column of amplitudes vs path;
  image = sector (path·sinθ, folded depth) with the colour map; per-angle TCG (`pa.tcg`) flattens the
  response of the DAC-block SDH across angles (gain(θ) table computed on demand).
- E-scan: fixed `escanAngle`, aperture of 8 elements sliding across the array → columns at index
  offsets `x_k`; image = B-scan style (x vs depth).
- Encoded C-scan: `UT.pa.runScan(state,{sync})` steps z (adaptive step) and stores the max amplitude of
  the S-scan per (z, x-bin) → top-view map (z × x, colour map).
- Window `pa`: tabs `S | E | C`, array controls, focal-law chart, angle/focus fields, Run/Stop/Clear, TCG
  toggle; the A-scan area shows the selected angle's trace; the cross-section draws the wedge and the
  sector; the plan view shows the array footprint. `UT.test.pa = {sscan(), escan(), runScan()}`.

### 3.11 P11 — AUT v2 (55)
`aut.channels` 1…6 (gates array of 6; UI shows `channels`), `Map` tab: C-scan map (z × channel, colour
bands), adaptive `step = max(1, round(L/400))`, `aut.speed` columns/frame slider, strip charts unchanged,
export of the strip chart into the trade report (`UT.aut.snapshot() → dataURL`).

### 3.12 P12 — B-scan and echo-dynamic windows (66)
- `UT.views.bscan` (window `bscan`): while `bscan.on`, every probe move records the A-scan column at
  the probe `x` (axis 'x') or `z` (axis 'z'); image = position vs depth (samples → depth via path·cosθ),
  colour map; shows laminations/backwall thickness profile; Clear; `UT.test.bscan()`.
- `UT.views.echodyn` (window `echodyn`): rolling plot of the gated peak amplitude vs probe x (last 200
  positions) with the current position marker; classification hint from the profile width at −6 dB:
  `≤ beam width → 'point-like (volumetric?)'`, `> 2× → 'extended (planar/lamination?)'`.

---

## 4. Training v2

### 4.1 T1 — guided lessons (82-lessons, NEW; 80-modes delegates)
```js
UT.lessons = {
  list: [{ n, title, ko, en, setup(), steps: [{ ko, en, hintKo, hintEn, check(ctx) → bool, doIt() }] }], // 22 lessons, ≥ 3 steps each, ≥ 80 total
  start(n), stop(), current() → {n, step, done[]}, next(), prev(), hint(), doIt(), autoRun(n) → Promise<{n, completed, failedSteps}>,
  window /* dom.win 'lessons' */, css,
}
```
- `ctx = { state: UT.state, frame: UT.frame, modes: UT.modes }`; checks are pure and deterministic
  (state/frame only). Checks are evaluated on every `'render'` (throttled 150 ms) while a lesson is
  active; a passing step auto-advances with a green tick and a short toast; after 40 s without progress
  the hint appears; `doIt()` performs the step through the same public APIs a user action would use
  (e.g. `UT.setIn('probe', {crystal:'twin'})`) so `autoRun` completes every lesson.
- Window: lesson list with progress badges (done/✓ best %), current lesson panel (title, KO/EN toggle
  follows `UT.i18n.lang`), step list with ticks, buttons `Start | Hint | Do it for me | Restart | Next lesson`.
- Progress persisted in `lessons.progress`. `UT.modes.lessons` stays as a thin alias of `UT.lessons.list`
  (v1 API), `UT.test.lessons()` unchanged, plus `UT.test.lessonAutoRun(n)`.
- Example (lesson 3 Zero Probe): 1 "Select the 0° probe" (`probe.angle === 0`); 2 "Set range 100–125"
  (`instrument.range` in range); 3 "Find the four backwall echoes" (`frame.echoes.filter(kind backwall).length ≥ 4`);
  4 "Switch to twin crystal — the initial pulse disappears" (`probe.crystal === 'twin' && !frame.ascan.initialPulse`);
  5 "Measure the plate: gate the 1st echo, DP reads 25.0 ± 0.3" (`readouts.primary.dp`).
  Write comparable, specific checks for all 22 lessons (SPEC §14.12 setups).

### 4.2 T2 — trade test v2 (84-trade, NEW)
- `UT.trade = { configure({difficulty, timeLimitMin, specimen:'auto'|…}), start(seed), submit(rows), reveal(), newTest(), truth(), history(), report() → HTML string, printReport(), window, scoreboard /* dom.win */, reportWindow, css }`.
- Difficulty: `basic` (3 defects, ≥ 4 mm, plate 20), `intermediate` (4–6, ≥ 2 mm, plate 12–30 or pipe 6–8 in),
  `advanced` (5–8 incl. 1–2 mm porosity/slag, geometry traps: root bead/cap, one mode-conversion trap,
  random material carbon/austenitic, HIDE + BEAM off enforced, 30 min).
- Scoring per truth defect (100 each, mean over defects, then − 15 per false call, clamp 0…100):
  detection 40 (z overlap or |z − zFrom| ≤ 10), type 15, length 15 (|Δ| ≤ max(5, 20 %)), depth 15 (≤ 3 mm),
  height 15 (≤ 2 mm; if not reported 0). Partial credit: length/depth/height give half points at 2× tolerance.
- Timer enforced (auto-submit at 0); `trade.history` (last 30: date, seed, difficulty, score, time used).
- Windows: `trade` (v1 layout + difficulty, timer, per-defect breakdown after submit), `scoreboard`
  (history table, best per difficulty, JSON copy), `report` (printable: header, specimen/probe/procedure,
  report table, truth table, score breakdown, strip-chart snapshot if AUT used; `File ▸ Print report`
  uses a print stylesheet that hides the app and shows only the report).
- Exam sharing (U3): a scenario with `exam: {locked: true, codeHash}` hides defects until `Reveal` with
  the 4-digit code (hash = FNV-1a of the code string); the author sets the code when creating the URL.
- T5 Random practice: `Defects ▸ Random practice…` → same generator, no timer/lock, reveal anytime.
- `UT.test.trade` keeps `start/truth/submit` (v1 semantics: submitting the truth rows scores 100) and adds
  `configure`, `history`.

### 4.3 T3 — standards evaluation (45-standards)
- Rule sets in `UT.standards.rules` (JSON, editable copy in `standards.rulesOverride`), each with
  `{id, name, note:'Illustrative defaults transcribed from …; verify against the current edition', reference, recordingDb, evaluationDb, levels:{…}}`:
  - `iso17640`: sensitivity techniques 1 (3 mm SDH DAC), 2 (DGS disc 1.5/2/3 mm by thickness 8–15/15–40/40–100),
    3 (rectangular notch), testing levels A–D; evaluation level = reference −10 dB (techniques 1/2) for level B;
    recording level = reference −6 dB? — **the critic must set the correct numbers**; keep them data-driven.
  - `iso11666`: acceptance levels AL2/AL3 (t 8–100 mm): recording level (dB vs reference), and per level the
    table `length ≤ L(t) → max amplitude dB`, e.g. AL2: `len ≤ 0.5t (min 10?) → ref −4 dB; longer → ref −10 dB`
    (**verify**); indications above reference are rejected regardless; cracks/LOF/IP rejected when identified.
  - `asme8`: Section VIII Div. 1 App. 12 / Section V Art. 4: record ≥ 20 % DAC; reject if > 100 % DAC (reference)
    and length > 6 mm (t ≤ 19), > t/3 (19 < t ≤ 57), > 19 mm (t > 57); cracks, LOF, IP rejected regardless.
  - `awsd11`: D1.1 Table 6.3 (statically loaded): indication rating `d = a − b − c`, `c = 2·(SP − 25.4)/25.4 dB` (2 dB/inch
    beyond 1 inch), class A/B/C/D thresholds by thickness band and probe angle (70°/60°/45°) — **verify**.
- `UT.standards.evaluate({ruleId, level, T, indication:{ampDbVsRef, lengthMm, type, soundPath}, probeAngle}) → {disposition:'not-recordable'|'record'|'accept'|'reject', ruleText, ruleTextKo}`.
- Window `evaluation`: standard/level selectors, thickness (from specimen), reference (DAC/DGS/notch
  with `standards.transferDb`), a table of indications (from the trade report or `Add row`), disposition
  column with the rule text on hover; `Evaluate all`. Trade v2 adds a `Disposition` column to the report
  and +10 bonus when the candidate's disposition matches the standard's.
- T4 procedures: `UT.standards.procedures` = `[{id, name, standard, level, probes:[libIds], surfaces, refBlock:'dac'|'fbh'|'iow', refReflector, transferDb, notes}]`
  (e.g. `iso-B-plate20`, `asme-pipe-6in`, `aws-d11-70`); `UT.standards.applyProcedure(id)` sets probe library
  entries allowed, DAC block T, instrument defaults; trade/exam locks the probe choice to the procedure list.

### 4.4 T6 — sizing v2 (66)
Sizing window methods: `6 dB drop`, `20 dB drop` (uses the beam edge: end = probe position where the echo
drops 20 dB minus the half beam width at that depth), `max amplitude` (echo-dynamic ends), `tip diffraction
height` (path difference of two tip echoes → height = Δpath·cosθ). Results table with measured vs true
(after reveal). Echo-dynamic hint (§3.12).

---

## 5. Fidelity and UI v2

### 5.1 F1 — weld preparations (10-specimens; 60/64 drawing)
`weldOpts.prep`: `single-v` (v1), `double-v` (v1), `single-bevel` (K: left face vertical, right bevel 45°, root face 2),
`j` (left vertical, right J: 10° bevel + 8 mm radius, root face 2), `single-v-backing` (single-V, root gap 6,
backing bar 25 × 6 mm centred under the root, no root bead; the bar's lower face and ends are outline
edges tagged `backing` → geometry echoes at the bar edges), `fillet-t` (set-on T-joint: base plate T with a
vertical web `webT` thick centred at x = 0 rising 60 mm, fillet welds both sides, leg = 0.7·webT; probe on the
base plate or on the web (`probe.surface:'web'` analogous to 'brace')), `nozzle` (set-on branch on a pipe:
cross-section = fillet-t with web = branch wall `(branchOd − 2·wt)/2`… simplified as `fillet-t` with
`webT = branch wt` and a 3-D nozzle in 64). `weldGeometry` returns `fusionFaces`, `region`, `cap/root`,
`backing`, `web` polygons; presets `lof` pick the face by side; new preset `backingLof` (planar along the
bar top), `toeCrackFillet`. Weld dialog: prep dropdown with a small SVG icon per prep.

### 5.2 F2/F3/F4
- F2 in §3.7. F3: `display.sound` → `UT.audio.beep()` (00-core: lazy `AudioContext` created on the first user
  gesture after enabling; 880 Hz, 60 ms, gain 0.1) when a gate with `alarm` has a peak above level (edge-triggered).
- F4: plan view TOFD pair = one small green 24 × 16 mm box centred between the probes with two dots.
  `Probes ▸ Focus Beam` → §3.6 dialog.

### 5.3 U1 — Korean (92-i18n-ko + all UI owners)
- Every user-visible string in every module goes through `UT.i18n.t('English text', params)`; params via
  `{n}` placeholders (`UT.i18n.t('Defect {n}', {n: 3})` — core supports it). Menu `data-key`s stay English.
- 92-i18n-ko registers the dictionary at load (`UT.i18n.add('ko', {...})`) — the agent collects ALL keys by
  grepping `t('…')` in src after the UI files are done, and provides Korean for each (≥ 400 entries),
  glossary data `UT.i18nKo.glossary = [{term, ko, en, defKo, defEn}]` (≥ 60 terms), and tour steps.
- Language switch relabels live (`'lang'` event → windows rebuild their text; menus/toolbar/status re-render).

### 5.4 U2 — touch and responsive scaling (90 + views + 70)
- Views use Pointer Events (`pointerdown/move/up`, `setPointerCapture`, `touch-action: none` on canvases).
  Hit targets ≥ 14 mm on `(pointer: coarse)`.
- Touch bar (90): a bottom strip of large buttons `◀ ▶ (x ±1) ▲ ▼ (z) − + (gain) Range Freeze Peak Hide` shown when
  `display.touchBar === 'on'` or (`'auto'` and coarse pointer).
- Scaling: the app has a design size of 1280 × 760; `#app` gets `transform: scale(k)` (transform-origin top left,
  `k = min(innerW/1280, innerH/760)` clamped 0.6…1.6) when `display.scale === 'auto'`; core's `UT.dom.localPos`
  already compensates (ratio of `offsetWidth/rect.width`). No clipping at 1024 × 640; at 1920 × 1080 `k ≤ 1.42`.

### 5.5 U3 — scenarios (94-scenario, NEW)
```js
UT.scenario = { capture() → obj, apply(obj), save(slot 1..5, name), load(slot), remove(slot), list(),
                toText(), fromText(text), toUrl(obj?, {exam:{code}}) → 'https://…#scn=…', fromUrl(hash) → obj|null, window, css }
```
- `obj = {v:2, name, material, weldOpts, mode, specimenId, specimenOpts, probe, instrument (no compare/datalog), display (subset), defects, standards, pa, tofd (no scan), aut (no scan), exam}`.
- Encoding: `#scn=z:<base64url(deflate-raw(JSON))>` via `CompressionStream('deflate-raw')` when available,
  else `#scn=r:<base64url(JSON)>`; decoding handles both (`DecompressionStream`). Boot (90) applies a hash
  scenario after restore; `hashchange` too. `File ▸ Save scenario… / Load scenario… / Share link…`
  (window shows the URL in a textarea + "Copy"). Exam: `exam.codeHash` per §4.2.

### 5.6 U4 — glossary and tour (90 + 92)
`Help ▸ Glossary` (window `glossary`: search box, KO/EN columns), `Help ▸ Quick tour` (overlay with 8 steps
highlighting instrument, plan view, cross-section, toolbar groups, status bar, lessons; Next/Skip; shown once
automatically on first boot unless `localStorage utsim.tourDone`), `Help ▸ Standards notes` (window listing the
rule sets with their "illustrative — verify" notes).

### 5.7 U5 — accessibility (90, 70)
`role="menubar"/"menuitem"`, `aria-haspopup`, `aria-expanded`, `Alt+F/P/S/W/D/O/H` opens menus, arrow keys
navigate, `Enter` activates, `Esc` closes; toolbar buttons `aria-pressed`; canvases `aria-label`; `:focus-visible`
outlines everywhere; `display.highContrast` adds `.hc` on `#app` (2 px outlines, larger status text, higher
contrast palette for rulers/labels); `prefers-reduced-motion` disables scan animations (sync stepping).

---

## 6. Engineering v2

### 6.1 E1 — acceptance runner (`tools/acceptance.mjs`, qa-1)
`NODE_PATH=… node tools/acceptance.mjs [--file …] [--json out.json] [--only v1|v2]` boots the built file with
`qa-helpers.launch`, runs every check of SPEC §11.1 (#1–#14) and every v2 check (§9), prints a table, writes
JSON, exits 1 on any failure. Each check is a small async function with a name and tolerance.

### 6.2 E2 — CI (`.github/workflows/utsim-ci.yml`, qa-1)
On push/PR touching `ut-simulator/**` or `utman_simulator.html`: ubuntu-latest, Node 20, `npm i -g playwright@1.56`
+ `npx playwright install --with-deps chromium`, `node tools/node-load.mjs --selftest`, `python3 build.py`,
`node tools/acceptance.mjs --json acceptance.json`, upload `utman_simulator.html` and `acceptance.json` as artifacts.
Must not modify the existing `deploy-pages.yml` behaviour.

### 6.3 E3 — Pages (lead): `build.py` writes `../utman_simulator.html` AND `../docs/utman_simulator.html`.

### 6.4 E4 — performance targets
Default plate + 8 defects, 41 rays: `UT.test.compute()` ≤ 8 ms mean (20 runs); AUT sync scan of a 24-inch pipe
(C ≈ 1915 mm) ≤ 1.5 s; TOFD D-scan ≤ 0.8 s; PA S-scan (41 angles) ≤ 60 ms.

### 6.5 E5 — code quality
Per-file pass in the QA phase: remove dead code/duplication, JSDoc on public functions, consistent naming;
no behaviour change (acceptance runner must stay green).

---

## 7. Test API additions (`Object.assign(UT.test, …)`)
| function | owner |
|---|---|
| `setMaterial(key)`, `setDampers([x])`, `setPhysics({modeConv, surfaceWave, sideLobes, fanRays})`, `setFocus({on, F})`, `selectProbe(libId)` | 40-ascan (state helpers) |
| `directivity(thetaDeg) → one-way weight`, `fanAngles()` | 30-raytrace |
| `dgs(args)`, `evaluate(args)`, `applyProcedure(id)`, `rules()` | 45-standards |
| `tofd()` (+ `modeConvEvents`), `pcsOptimise()` | 50-tofd |
| `pa.sscan()`, `pa.escan()`, `pa.runScan()` | 56-pa |
| `bscan()`, `echodyn()` | 66 |
| `lessonAutoRun(n)`, `lessonState()` | 82 |
| `trade.configure/history/report` | 84 |
| `scenario.capture/apply/toUrl/fromUrl` | 94 |
| `lang(code)`, `untranslated() → string[]` (visible texts not found in the dictionary) | 90 / 92 |
| `datalog()`, `autoPct()` | 70 |

---

## 8. Menus v2 (90-app; English keys)
- Probes ▸ `Probe library…`, `Adjust Angle in Wedge (Shoe)`, `Zero Probe - Twin or Single Crystal ▸`, `Pulse Echo`,
  `Through Transmission`, `Tandem (pitch catch)`, `2.5 MHz Frequency`, `5 MHz Frequency`, `Probe Diameter 10mm`,
  `Probe Diameter 5mm`, `Phased Array Probe…`, `Focus Beam…`, `Colour Code Display ▸`, `Number of Skips ▸`,
  `Single Line Beam`, `Mode conversion` ✓, `Surface wave` ✓, `Side lobes` ✓, `Finger damping tool`
- Weld ▸ `Weld…` (prep dropdown), `Material…`, `Presets ▸`
- Defects ▸ … v1 …, `Random practice…`
- Tools (NEW menu, id `menu-tools`) ▸ `DGS diagram…`, `Evaluation (standards)…`, `Procedures ▸`, `B-scan window`,
  `Echo dynamic window`, `Datalogger…`, `Sizing…`
- Step Wedge ▸ v1 + `FBH block`
- File ▸ v1 + `Save scenario…`, `Load scenario…`, `Share link…`, `Print report`
- Options ▸ v1 + `Sound alarm`, `Touch bar ▸ auto/on/off`, `High contrast`, `Auto-scale layout`, `Show dead zones`
- Help ▸ v1 + `Glossary…`, `Quick tour`, `Standards notes…`
Toolbar unchanged (19 buttons) + `.active` states as v1.

---

## 9. Acceptance checks v2 (headless Chromium via `UT.test`; tolerances inclusive)

### 9.0 Regression
All SPEC §11.1 #1–#14 pass unchanged, except that beam-edge–derived quantities use `halfAngle20dB = asin(0.87λ/a)`.

### 9.1 Physics
- V2-1 Directivity: `UT.test.directivity(θ)` at `asin(0.51λ/a)` = 10^(−3/20) ± 0.02 (one-way), at `asin(0.87λ/a)` =
  10^(−10/20) ± 0.03, at `asin(1.22λ/a)` ≤ 0.02, and > 0 at `1.5λ/a` with sideLobes on, = 0 with sideLobes off.
- V2-2 Mode conversion: plate 20, 0° probe, planar defect inclined 45° (pts (10,8)→(16,14)): with modeConv on an
  echo of kind `modeconv` exists whose `path` differs from the L echo by ≥ 3 mm; off → none. TOFD (§9.3) shows the
  converted backwall.
- V2-3 Surface wave: plate 20 with cap, 70° probe at x = 40: echo kind `surface` at path ≈ (2·d/vR)·vS/2 where
  d = distance index → cap toe (±1.5 mm); `setDampers([x between])` reduces it ≥ 30 dB; `surfaceWave:false` removes it.
- V2-4 Materials: `setMaterial('austenitic')` → grass ≥ 3× carbon (mean of samples beyond the last echo),
  first backwall on a 25 mm plate ≥ 4 dB lower than carbon at equal gain; readouts use vL 5.66 (DP of the backwall = 25.0 ± 0.2).
- V2-5 Probe library: `selectProbe('mwb60-2')` → freq 2, crystal 8×9, derived.nearField = 8²·2/(4·3.24) ± 0.2,
  wedge angle 47.1; custom angle 55 via `setProbe({angle:55})` → statusLine shows 55.0° and a 55° shoe (no error).
- V2-6 Focus: IOW 13 mm SDH, 60°, `setFocus({on:true, F:26})` → amplitude ≥ 3 dB above unfocused and the −6 dB
  x-width ≤ 0.7× the unfocused width.
- V2-7 TCG: DAC block T 40, 60°, record the three SDHs, TCG on → each reads 80 ± 4 % at its maximum.
- V2-8 Pulser/receiver: energy high vs low = +12 dB ± 1; filter mismatch (2 MHz filter with a 5 MHz probe) = −6 dB ± 1
  and pulse −6 dB width ≥ 1.25×.
- V2-9 DGS: FBH block, 0° 5 MHz ⌀10: record the backwall reference on a clean spot, gate the ⌀3 mm FBH at 30 mm →
  `ers` within 3 ± 0.9 mm; ⌀6 → 6 ± 1.5.
- V2-10 TOFD v2: events include `modeconv-backwall` at `2wd + sL/vL + sS/vS` ± 0.05 µs; `pcsOptimise()` sets
  pcs = 2·(2T/3)·tan60 ± 0.1; dead-zone depth `dL` positive and < 6 mm for pcs 60/T 20.
- V2-11 PA: `pa.sscan()` returns 41 angle columns; the DAC-block T/2 SDH appears at the angle whose
  `path·sinθ` matches its position (±3°); E-scan has ≥ 8 columns; `pa.runScan()` map non-empty; with `pa.tcg`
  the SDH amplitude spread across angles ≤ 3 dB.
- V2-12 AUT v2: `channels 6` yields 6 strips; adaptive step on a 24-inch pipe → n ≤ 500 columns; sync scan ≤ 1.5 s.
- V2-13 B-scan: lamination plate, 0°, drag x from −60 to 60 → `bscan()` columns ≥ 100 with a thickness step where the
  lamination is (depth 10 vs 25).

### 9.2 Training
- V2-14 Lessons: `lessonAutoRun(n)` for n = 1…22 resolves `completed: true` with `failedSteps: []`; manual: start lesson 3,
  perform steps via `UT.test` → `lessonState().step` advances each time.
- V2-15 Trade v2: `trade.configure({difficulty:'advanced', timeLimitMin: 1})`, `start(7)` twice → identical truth (5–8 defects);
  truth rows → 100; a report with lengths ×1.5 scores ≤ 85; a false extra row costs 15; after 60 s the test auto-submits
  (`state.trade.revealed === true`); `history()` has the entry; `report()` HTML contains the score and the tables.
- V2-16 Standards: `evaluate({ruleId:'asme8', T:20, indication:{ampDbVsRef:+1, lengthMm:10, type:'slag'}})` → `reject`;
  `{ampDbVsRef:−10, lengthMm:10}` → `record`; `{ampDbVsRef:−16}` → `not-recordable`; `iso11666 AL2`, `T:20`,
  `{ampDbVsRef:−12, lengthMm:8}` → `accept`; `{ampDbVsRef:+2, lengthMm:8}` → `reject`; `applyProcedure('iso-B-plate20')`
  restricts `UT.trade` probe choices to the listed ids.
- V2-17 Sizing v2: root-crack preset height 3 → tip-diffraction height 3 ± 1 using the two tip echoes at the
  optimum probe position; 20 dB drop length of a 30 mm LOF = 30 ± 6.

### 9.3 UI / usability
- V2-18 i18n: `lang('ko')` → `untranslated().length ≤ 5` after opening every window; `lang('en')` restores.
- V2-19 Scaling/touch: at 1024×640 no element overflows the viewport (`scrollWidth/Height == inner`), `#app` scale ≈ 0.8;
  pointer events (`pointerdown/move/up`) on `#cv-cross` move the probe by the dragged mm; touch bar `on` shows 9 buttons.
- V2-20 Scenario: `scenario.capture()` → change gain/defects → `scenario.apply(saved)` restores them; `toUrl()` →
  navigate to that URL in a fresh page → the scenario is applied (same defects/probe); exam URL hides defects until
  the code is entered (`UT.trade.reveal('1234')`).
- V2-21 Sound: with `display.sound` on and a gate alarm, `UT.audio.lastBeep` timestamp updates; no AudioContext is created
  while sound is off.
- V2-22 Accessibility: `#menubar [role=menubar]` exists, `Alt+P` opens the Probes menu, arrow keys move focus, every
  `tb-*` has `aria-pressed`; `display.highContrast` adds `.hc`.
- V2-23 Weld preps: each of `single-bevel, j, single-v-backing, fillet-t, nozzle` builds, traces without errors, has
  ≥ 1 fusion face, and `addPreset('lof')` lands on a fusion face; backing bar gives a `geometry` echo from its ends.
- V2-24 Datalogger/compare/AUTO: pressing SAVE adds a datalog entry; `2ND F + GATES` sets the gated peak to 80 ± 1 %;
  compare snapshot drawn (pixel check: grey trace present).

### 9.4 Engineering
- V2-25 `node tools/acceptance.mjs` exits 0 and its JSON lists ≥ 39 checks (14 + 25) all passed.
- V2-26 CI workflow file valid YAML with the steps of §6.2; `build.py` writes both outputs; size < 1.2 MB.
- V2-27 Performance targets of §6.4.

---

## 10. Lessons to be more "coaching" (for 82-lessons authors)
Each lesson must teach a **decision**, not just a click: end with a step whose check verifies an inspector's
conclusion (e.g. "identify the echo at 40 mm as the root crack corner echo" → the step asks the user to click
the echo on the A-scan; check: `state.lessons.answers[n] === 'corner'`; the lessons window offers 3–4
candidate labels as buttons per step when `step.choices` is defined). Provide such a choice step in ≥ 12 lessons.
