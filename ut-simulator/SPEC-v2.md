# UTsim v2 — full improvement programme ("everything, and beyond") — revision 2 (post-critique)

This document amends `SPEC.md` (v1). v1 stays binding wherever v2 does not change it; where they
conflict, **v2 wins**. All v1 acceptance checks (SPEC §11.1 #1–#14) must keep passing after v2 (the
quantities that legitimately move are enumerated in §9.0). Same product rules: ONE self-contained HTML
file, no external resources, no build tooling beyond `build.py`, headless-loadable modules, `UT.test` API.

Revision 2 incorporates the findings of three critics (NDT physics/standards, training/UX,
integration/feasibility). Where the critics disagreed the lead ruled: physics/standards numbers follow
the NDT critic, pedagogy/scoring/lesson content follows the training critic, architecture/ownership/
events/test API follow the integration critic. Points the editor could not settle are listed in §11.

Reading order for implementers: SPEC.md §2, §3, §4, §11, §13, §14, §15 → this file completely.

---

## 0. Scope overview (feature ids are used in ownership tables and acceptance checks)

| id | area | feature |
|---|---|---|
| P1 | physics | Piston (Bessel) beam directivity with side lobes, wider fan, correct −6/−20 dB edges |
| P2 | physics | Mode conversion (S↔L) at surfaces and defects, time-based echo placement, spurious-echo traps |
| P3 | physics | Surface (Rayleigh) wave from steep probes + finger-damping tool |
| P4 | physics | Materials library (velocities, one-way L/S attenuation, grass, anisotropic weld metal) |
| P5 | physics | Probe library (named probes, rectangular crystals with near-field factor k, custom angles, twin angle probes) |
| P6 | physics | Focused probes (geometric focus with explicit focal gain, F ≤ N) |
| P7 | physics | TCG (per-echo gain from DAC); Pulsar/Receiver settings (EPOCH 600 option lists) that really act on the signal |
| P8 | physics | DGS/AVG diagrams and equivalent reflector size (ERS); FBH reference block |
| P9 | physics | TOFD v2: mode-converted signals (Fermat L-S backwall + S-S replica), dead zones, PCS optimiser, hyperbolic cursor, straightening |
| P10 | physics | Phased array v2: array/focal laws (wedge-corrected), S-scan, E-scan, encoded C-scan, per-angle TCG |
| P11 | physics | AUT v2: up to 6 channels, C-scan map, adaptive step, speed |
| P12 | physics | B-scan window (encoded 0° scans) and echo-dynamic window (ISO 23279 patterns) |
| T1 | training | 25 guided lessons with automatic step checks (state/transition/choice/numeric), hints, "do it for me", progress badges |
| T2 | training | Trade test v2: difficulty table, seeded geometry, one-to-one matching, attribute scoring, recordability filter, critical-miss fail, coverage tracker, timer, history, scoreboard, full report template, seed-only exam sharing with signed result token |
| T3 | training | Standards evaluation window (ISO 17640 / ISO 11666 / ASME VIII App. 12 / AWS D1.1 rule sets as data, editable), disposition taxonomy, "Why?" cell |
| T4 | training | Procedure presets (probe set, reference block, sensitivity, transfer correction), allowed-probe lock in exams |
| T5 | training | Random practice generator (trade without timer) + Hint / Reveal one / Check row |
| T6 | training | Sizing v2: 6 dB / 20 dB (z-plane correction) / max-amplitude / fixed evaluation level (ISO) / tip-diffraction height, echo-dynamic hint |
| T7 | training | Echo-identification quiz (window `quiz`) — geometry vs defect vs spurious, with action question |
| F1 | fidelity | Weld preparations: single-bevel (K), J, single-V with backing bar, fillet T-joint (set-on), nozzle/branch |
| F2 | fidelity | EPOCH 600 Pulsar/Rcvr pages functional, AUTO XX % key (`UT.instruments.auto(pct)`), SAVE → datalogger window, Compare (frozen overlay) |
| F3 | fidelity | Gate alarm sound (Web Audio, opt-in, edge-triggered in 70) |
| F4 | fidelity | TOFD probe pair in plan view as the original's small box; Focus Beam menu really focuses |
| U1 | usability | Complete Korean localisation (single dictionary owner 92, render-time `t()`, KS terminology rules), live language switch |
| U2 | usability | Touch/pointer support + touch bar with auto-repeat; responsive scaling via a 1280×760 design box |
| U3 | usability | Scenario save/load (5 slots + JSON text) and **share by URL** (`#scn=`, async) incl. exam mode and teaching metadata |
| U4 | usability | Help: glossary (KO/EN, ≥ 60 terms with inspector meaning), quick tour overlay, standards notes |
| U5 | usability | Accessibility: ARIA menus/toolbar, F10 keyboard menu navigation, focus rings, live regions, high-contrast mode |
| E1 | engineering | `tools/acceptance.mjs` runner (v1 + v2 checks, exit code, JSON report, CI budget relaxation) |
| E2 | engineering | GitHub Actions CI (selftests + build + acceptance in headless Chromium; NODE_PATH for global Playwright) |
| E3 | engineering | `build.py` also writes `docs/utman_simulator.html`; publishing is a repo-settings decision |
| E4 | engineering | Performance: ≤ 10 ms compute with the wider fan (≤ 6 ms at 21 rays), conversion caps, typed arrays |
| E5 | engineering | Code-quality pass (dead code, duplication, JSDoc, consistent style) with regression tests |
| E6 | engineering | README v2 + CHANGELOG |

---

## 1. New/changed files and ownership

```
src/00-core.js        (frozen, updated by the lead)  + besselJ1, fnv1a, i18n params, dom.h i18n dataset, dom.win title keys,
                      dom.localPos/scale, audio helper, defaultState v2 fields (§2), test.state() without compare
src/10-specimens.js   (frozen, updated by the lead)  + materials (attenL5/attenS5/poisson), weld preps F1, fbhBlock,
                      spec.reflectors ('fbh','interface'), weld.regions/weldRegions(), prepNames, scanSurfaceAt 'web',
                      SURFACE_COLOURS.backing, spec.stepX(t) for the step wedge (lead)
src/20-probe.js       (frozen, updated by the lead)  + probe library P5 (a430s = 5 MHz 16×16 wedgePath 14), rectangular
                      near-field factor k, piston constants, halfAngle20dBz, focus, material-aware vRayleigh, presetFor
src/30-raytrace.js    P1 P2 P3 P4 P6 (+ weld-metal attenuation, transferLossDb, FBH law, describe().category)   owner: physics-1
src/40-ascan.js       time-based placement (P2), P7 (TCG per echo, pulser/receiver), material grass, initialPulse/grassPct,
                      traceOpts(), PA dispatch to UT.pa.compute                                        owner: physics-2
src/45-standards.js   NEW: P8 (DGS maths + window 'dgs'), T3 (rule sets + windows 'evaluation','stdnotes'), T4 ('procedures',
                      allowedProbes)                                                                    owner: training-1
src/50-tofd.js        P9 (writes cursor.tUs/depth/z on D-scan hover/click)                              owner: physics-3
src/55-aut.js         P11                                                                              owner: physics-4
src/56-pa.js          NEW: P10 (window 'pa', UT.pa.compute, UT.test.pa)                                 owner: physics-5
src/60-view-cross.js  F1 drawing, P2/P3/P6 ray styles, finger tool, pointer events, FBH block, emits 'ui' probe-drag   owner: ui-1
src/62-view-plan.js   F4, pointer events, PA/AUT map hints, coverage band                               owner: ui-2
src/64-view-3d.js     F1 shapes (T-joint, nozzle), pointer events                                       owner: ui-3
src/66-view-plotter.js T6 sizing v2, P12 (windows 'bscan', 'echodyn'; module-level buffers)             owner: ui-4
src/70-instruments.js F2, F3 (alarm edge), TCG display, touch, high contrast, compare overlay, UT.instruments.auto(pct),
                      emits 'ui' softkey/wheel, window 'datalog'                                        owner: ui-5
src/80-modes.js       new modes (fbh, weld preps), procedure lock, autocal.stage, lessonSetups + late-bound delegates to 82/84,
                      'tools' in ALL_MENUS, UT.test.trade shell, setMaterial                            owner: ui-6
src/82-lessons.js     NEW: T1 (window 'lessons' v2) + T7 (window 'quiz')                                owner: training-2
src/84-trade.js       NEW: T2 T5 (windows 'trade', 'scoreboard', 'report', 'practice'; coverage tracker; verifyResult)  owner: training-3
src/90-app.js + style.css  menus for everything, U2 design-box scaling/touch bar, U4 tour, U5 a11y, print root, boot order,
                      emits 'ui' menu-open/tb-hover/tb-click/window-open, UT.test.lang                  owner: ui-7
src/92-i18n-ko.js     NEW: U1 dictionary (single owner) + glossary data + tour text, UT.test.untranslated   owner: i18n (runs AFTER all UI files)
src/94-scenario.js    NEW: U3 (async toUrl/fromUrl, windows 'scenario','share')                          owner: training-4
tools/acceptance.mjs  NEW: E1                                                                          owner: qa-1
.github/workflows/utsim-ci.yml NEW: E2                                                                 owner: qa-1
index.html            script order (lead): 00,10,20,30,40,45,50,55,56,60,62,64,66,70,80,82,84,90,92,94
```
Rules of SPEC §15.1–15.3 apply to the new files (IIFE, `UT.<name>`, `css` string + `injectCss`, headless-safe,
`Object.assign(UT.test, …)`). Namespaces: `UT.standards`, `UT.pa`, `UT.lessons`, `UT.trade`, `UT.scenario`,
`UT.i18nKo` (registers via `UT.i18n.add('ko', {...})` at load — allowed, no DOM), `UT.views.bscan`, `UT.views.echodyn`.

Additional binding integration rules (from the integration critic):
- **No module may call `UT.set`/`UT.setIn` without `{noRender: true}` from inside a `'render'` listener**, and
  never synchronously (use `setTimeout(0)`); module-level buffers are used for per-render recording (§3.12).
- **Nested test namespaces** (`UT.test.trade`, `UT.test.pa`, `UT.test.scenario`) are created by exactly one file
  (`trade` by 80, `pa` by 56, `scenario` by 94) and extended by others only with `Object.assign(UT.test.trade, {...})`.
- **Late binding 80 → 82/84** (80 loads first): (1) 80 keeps its v1 lessons array as `UT.modes.lessonSetups`
  (same `{n, title, ko, en, setup, steps}` shape, `setup()` unchanged) and defines
  `Object.defineProperty(UT.modes, 'lessons', {get: () => (UT.lessons && UT.lessons.list) || lessonSetups})`.
  82 builds `UT.lessons.list[i] = Object.assign({}, UT.modes.lessonSetups[i], {steps: v2 step objects, stepsText: v1 strings})`
  at load (lessons 23–25 have their `setup()` defined in 82 itself). (2) 80's `modes.lessonsWindow`/`modes.tradeTest`
  are late-bound delegates: `open() { return UT.lessons ? UT.lessons.window.show() : legacyOpen(); }`; 80 MUST NOT
  create `dom.win` names `lessons`/`trade` when `UT.lessons`/`UT.trade` exist. (3) `UT.test.trade` is created by 80
  with late-binding methods `start(seed) { return (UT.trade || legacy).start(seed); }` (same for `truth`, `submit`);
  84 extends it only via `Object.assign(UT.test.trade, {configure, history, report, coverage, tick, reveal, verifyResult})`.
  (4) `UT.modes.enter('trade')` calls `modes.tradeTest.open()` (delegated); 84's window `onClose` calls
  `UT.modes.exit()` when `state.mode === 'trade'` exactly as v1. (5) `state.lesson` (v1, index|null) is kept in sync
  by 82: `lesson = active === null ? null : active − 1`.
- **Frozen probe patch**: `UT.probe.select(id)` returns `{libId, angle, mode, freq, diameter, crystalDims, crystal}`
  — use it, never build the patch by hand. Every `presets[angle]` lookup in 40/80/90 becomes `UT.probe.presetFor(angle)`;
  mode = `angle === 0 ? 'comp' : 'shear'`.

---

## 2. State additions (`UT.defaultState()` — written by the lead; use exactly these names)

Single sources of truth (duplicates resolved): `probe.crystal` stays `'single'|'twin'` (v1); crystal size is
`probe.crystalDims`. `weldOpts.prep` is authoritative; `weldOpts.type` is DERIVED by 10-specimens' builders
(`double-v` → 'double-v', prep 'none' → 'none', fillet/nozzle → 'fillet', else 'single-v') and kept for v1 records; on
restore of a record without `prep`, `prep = type`. `display.focus` stays for record compatibility but is never read —
`Probes ▸ Focus Beam…` reflects `probe.focus.on`. `display.deadZones` is REMOVED; `Options ▸ Show dead zones` toggles
`tofd.deadZones`. `probe.angleCustom` is REMOVED (derive: `angle ∉ {0,45,60,70}`; the toolbar shows no `.active` angle
button for a custom angle). `probe.paFrom/paTo/paStep` remain the single source read by physics; 56 writes
`UT.set({probe: {...probe, paFrom, paTo, paStep}, pa: {...}})` in one call and `pa.from/to/step` are mirrors updated by 56 only.
`instrument.damping` (boolean) stays the single source; `pulser.damping` Ω is derived (§3.7).

```js
// ---- v2 additions / changes to UT.defaultState() (merge into the v1 object; comments are normative)
probe: { /* …v1: angle, mode, crystal:'single'|'twin', freq, diameter, wedgeVel, method, x, z, side, skew, surface, paFrom, paTo, paStep */
  libId: 'gen-60-5-10',
  crystalDims: { a: 10, b: 10, shape: 'round' },   // a = size in the beam plane (mm), b = across the beam (along z)
  focus: { on: false, F: 30 },                     // F clamped to ≤ derived.nearField by the dialog (§3.6)
},
material: 'carbon',                                 // key into UT.specimens.materials
weldOpts: { /* …v1 */ prep: 'single-v', weldMaterial: 'same', backing: false, webT: 12, branchOd: 114.3,
  transferLossDb: 0 },                              // 0…8, flat two-way loss on weld-kind specimens only (§3.4); advanced trade randomises 0…6
physics: { modeConv: true, surfaceWave: true, sideLobes: true, fanRays: 41 },   // fanRays ∈ {21, 41}; other values clamp to 41
damping: { tool: false, points: [] },               // finger dampers: x positions on the scanning surface (max 3)
instrument: { /* …v1 incl. damping:boolean */
  tcg: { on: false },
  pulser: { energy: 200, damping: 150, prf: 60 },   // energy V ∈ {100,200,300,400}; damping Ω ∈ {50,100,150,200,400} (150 = v1 default, derived from damping:false)
  receiver: { filter: 'broadband' },                // 'broadband' | '0.2-10' | '1.5-8.5' | '5-15'
  autoPct: 80, compare: null /* Float32Array snapshot, never persisted/cloned */, datalog: [] /* {id, t, readouts, gain, range, note}, cap 100 */,
},
display: { /* …v1 incl. focus (unused) */ sound: false, touchBar: 'auto' /* 'auto'|'on'|'off' */, highContrast: false,
  scale: 'auto' /* 'auto'|'fixed' (strings only) */, convRays: true },
standards: { standard: 'iso11666', level: 'AL2', technique: 1, testingLevel: 'B', transferDb: 0,
  rulesOverride: null, procedure: null,
  lastEval: null },                                 // {ruleId, level, T, rows:[{indication, result}]} written by the evaluation window on 'Evaluate all'
lessons: { active: null, step: 0, progress: {} /* {n: {done, best, hints, doIt, wrong, auto}} + quiz: {best, attempts} */,
  answers: {} /* {n: {stepIdx: value}} */, memo: {} /* per-step scratch: ui tally, was, bwClean … reset on step change */,
  stepStartedAt: 0 },
quiz: { active: false, i: 0, n: 10, seed: null, difficulty: 'basic', correct: 0, wrong: 0, times: [], item: null /* {scenarioId, correctId, options[], askedAt} */ },
autocal: { stage: 0 /* 0 idle | 1 after Start | 2 after the first ✓ */, t1: null, d1: 10, d2: 25 },   // written by 80-modes
cursor: { x: null, y: null, view: null, tUs: null, depth: null, z: null },   // 60 writes x/y/view; 50 writes view:'dscan', tUs/depth/z
trade: { /* …v1: active, revealed, report, score, seed, startedAt, truth */
  difficulty: 'intermediate', timeLimitMin: 60, history: [] /* cap 30 */,
  exam: null,          // {v:2, seed, difficulty, timeLimitMin, procedureId, codeHash, revealOnSubmit, title, nameRequired, locked}
  candidate: '',       // candidate name typed at start (exam)
  coverage: null,      // {sideA, sideB, perAngle:{45,60,70}, map: Uint8Array} — module buffer mirrored here on submit only
  result: null,        // {seed, difficulty, score, fail, timeUsedSec, date, name, coverageA, coverageB, compliance, token}
  practice: false,     // true in Random practice (T5)
  hintsUsed: 0, revealedOne: [] /* truth indices revealed via 'Reveal one' */,
},
pa: { elements: 16, pitch: 1.0, freq: 5, from: 35, to: 75, step: 1, focusDepth: null, view: 'S',
  escanAngle: 60, scan: null /* {z0, z1, step, n, xBins, map: Float32Array} */, tcg: false },
bscan: { axis: 'x', on: false, columns: null },    // columns is ALWAYS null in state (module buffer in 66)
echodyn: { on: false, samples: [] },               // samples is ALWAYS [] in state (module buffer in 66)
tofd: { /* …v1 */ modeConv: true, straighten: false, deadZones: true },
aut: { /* …v1 */ channels: 3, gates: [ /* 6 entries */ ], map: null, speed: 6 },
scenario: { slot: null, name: '', title: '', noteKo: '', noteEn: '', author: '' },
```
Persistence (SPEC §15.9): record `v: 2` under the same key `utsim.v1`; `patchFromRecord` accepts `v` 1 or 2 (v1
records lack the new keys → defaults). Additionally saved: `material` (∈ `Object.keys(UT.specimens.materials)`),
`physics` (coerceLike), `standards` (coerceLike; `rulesOverride` only when object; never `lastEval`),
`lessons.progress` (object of `{done:boolean, best:number, …}` capped at 40 entries), `lessons.answers`,
`trade.history` (array capped at 30), `trade.difficulty`, `trade.timeLimitMin`, `pa` (coerceLike minus `scan`),
`display` (new keys), `weldOpts.prep`. `instrument.compare` and `instrument.datalog` are never persisted; `datalog`
is capped at 100 entries (oldest dropped); `compare` is excluded from `UT.test.state()` (core) and from `scenario.capture()`.
Not saved while `trade.active`.

---

## 3. Physics v2

### 3.1 P1 — piston directivity (30-raytrace, 20-probe, 00-core)
- `UT.math.besselJ1(x)` (Abramowitz–Stegun 9.4.4/9.4.6 polynomial, |error| < 1e-7).
- One-way directivity `D1(θ) = |2·J1(x)/x|`, `x = (π·a/λ)·sinθ`, `a = derived.crystalA` (from `probe.crystalDims.a`;
  round: = diameter). Pulse-echo weight = `D1²`.
- `derived.directivity(δ) = |δ| ≤ nullAngle ? D1(δ) : (physics.sideLobes ? max(D1(δ), 10^(−30/20)) : 0)` — boundary
  inclusive: the floor applies strictly beyond the first null, so at the null itself the value is D1 ≈ 0.
- Derived (20-probe, frozen): `halfAngle6dB = asin(0.51 λ/a)` (pulse-echo −6 dB), `halfAngle20dB = asin(0.87 λ/a)`
  (**pulse-echo −20 dB; was 1.08**), `nullAngle = asin(1.22 λ/a)`, `fanMax = asin(min(0.99, 1.8 λ/a))`,
  `sidelobeDb = −17.6`, `halfAngle20dBz = asin(min(0.999, 0.87 λ/crystalB))` (lead adds). Reference values
  (5 MHz ⌀10, λ 0.648): D1 = 0.712 (−2.95 dB) at 0.51λ/a, 0.316 (−10.02 dB) at 0.87λ/a, 0.0002 at 1.22λ/a,
  0.119 at 1.5λ/a, first side lobe 0.132 (−17.57 dB) at 1.635λ/a.
- Rectangular near field: `N = k·a_max²·f/(4v)` with `k` = 1.37 (b/a ≥ 0.95), 1.30 (≥ 0.85), 1.15 (≥ 0.7),
  1.04 (≥ 0.55), 1.0 (≤ 0.5); circular `N = a²f/(4v)`. mwb60-2 → 9²·2·1.30/(4·3.24) = 16.3 mm.
- Fan (41 rays; `physics.fanRays` must be 41 or 21, others clamp to 41): rays 0…20 = the v1 grid, uniform on
  `[−θ20, +θ20]` (so `edge20 = [fan[0].pts, fan[20].pts]` and v1 semantics hold); rays 21…24 = ±(θ20+null)/2, ±null;
  rays 25…40 = 8 per side uniform on (null, fanMax]. Ray weight = `derived.directivity(δ_i)·(Δδ_i/Δδ_main)` (angular-bin
  weight so incoherent volumetric sums do not over-weight the denser side-lobe bands); receive weight
  `wReturn = derived.directivity(δ_return)`. With `sideLobes:false` rays 25…40 are NOT traced (effective fan 25).
  Every `M.beamWeight20(...)` in 30-raytrace (fan weight, return weight, tandem/TT acceptance, `mergeEchoes` coverage)
  is replaced by `derived.directivity(δ)`; `hz = path·tan(halfAngle20dBz) + crystalB/2`.
- Clamp every fan offset to `δ ≤ 89° − refracted` (drop rays beyond, never fold) — MWB70-2 (fanMax 21.4°) would otherwise
  launch above the surface. Optional refinement: `δ_steel = asin(sin(θ_w+δ_w)·v_s/v_w) − θ` for angle probes (asymmetric spread).
- Side-lobe rays (25…40) trace ≤ 2 legs and skip volumetric sampling. Performance budget in §6.4.

### 3.2 P2 — mode conversion and time-based echoes (30, 40)
- Every ray carries `mode ('S'|'L')`, `v` (from `specimen.material`), one-way `tUs` (metal only, NO wedge delay) and
  geometric `len`. **EVERY echo** (converted or not) sets `Echo.tUs` = two-way metal time and
  `Echo.path = Echo.tUs · derived.vel / 2` (for un-converted echoes this equals the v1 geometric path, so v1 checks are
  unchanged). Also `Echo.lenMm` = geometric one-way length and `Echo.mode` = arriving mode. Amplitude laws: `D` and `q`
  use `lenMm`; attenuation `M = 10^(−Σ_legs α_mode(leg)·2·len_leg/20)` accumulated per leg with the leg's own mode
  (α from §3.4). 40-ascan is unchanged: `dispPath(path)` reconstructs `t = 2·path/derived.vel + wedgeDelayUs =
  Echo.tUs + wedgeDelayUs`; DAC/TCG are evaluated at `Echo.path` (what a calibrated set sees); `mergeEchoes` keys stay on
  `path`; AUT re-weighting `amp = ampNoZ·zFactor(...)` is unchanged (converted echoes keep `defectId/hz/zs`).
  `UT.test.echoes()` adds `tUs` and `mode` to each row.
- At a reflection off an outline edge/arc or a planar defect segment with incidence angle φ (from the normal), when
  `physics.modeConv`: **at most ONE conversion per fan ray** (the first eligible reflection); the converted branch traces
  ≤ 2 further legs and never spawns; conversions are evaluated only on main-lobe rays (|δ| ≤ null).
  - incident **L**: converted S with `sinφS = sinφ·vS/vL`, energy fraction
    `R_LS(φ) = φ ≤ 62° ? 0.95·sin²(π/2·φ/62°) : 0.95·cos²(π/2·(φ−62°)/28°)` (15°: 0.13, 30°: 0.45, 45°: 0.78, 60°: 0.95,
    75°: 0.51, 90°: 0); specular L keeps `1 − R_LS`.
  - incident **S** with `φ < φc = asin(vS/vL)` (33.3° carbon, 33.4° austenitic, 29.7° aluminium — computed from the
    specimen material): converted L with `sinφL = sinφ·vL/vS`, `R_SL(φ) = φ < φc ? 0.85·(φ/φc)^1.5 : 0`; specular S keeps
    `1 − R_SL`. Both are labelled 'closed-form fits, ±0.1' in Help ▸ Standards notes.
  - Converted rays inherit the fan weight, get `e × R`, are dropped when `e < 0.01`, and are drawn with `kindTag:'L'|'S'`.
  - A converted wave arriving back at the probe within the aperture/direction acceptance is received with an extra factor
    0.5 **only when the ARRIVING mode ≠ probe mode** — kind `'modeconv'` (also when the wave re-converted and returns in
    the probe mode but was converted on the way: kind `'modeconv'`, no 0.5 penalty).
  - `UT.test.modeConv(mode, phiDeg) → {R, phiOut}` (30): `modeConv('S', 30) → {R ≥ 0.6, phiOut ≈ 65.6°}`, `modeConv('S', 40)
    → R = 0`, `modeConv('L', 60) → R ≥ 0.9`.
- Classic traps that MUST emerge: (a) **reciprocal path**: plate 20 (rootHeight 0, capHeight 0), 60° 5 MHz ⌀10, planar
  defect (−3, 14) → (3, 9) (face normal ≈ 39.6° from the downward vertical): in leg 2 the S wave hits the underside at
  φ = 20.4° < φc, the converted L (φL = 39.6°) travels vertically to the backwall, retraces, re-converts to S and returns
  to the probe → echo `modeconv` with metal two-way time 2·57/3.24 + 2·8.5/5.9 = 38.1 µs, displayed path 61.7 mm
  (probe x = 44…54); (b) TOFD L backwall followed by an L→S converted backwall and the S-S replica (§3.9); (c) **45°
  probe, leg 2 on the 30° bevel (φ = 15° < φc)** gives an L conversion → an extra earlier echo (a 60° beam meets the bevel
  at 60° in leg 1 and normally in leg 2 → no conversion, correct).
- `UT.rays.describe(echo)` labels converted echoes `'Mode-converted (L)'` etc. and returns `category` (§4.5).

### 3.3 P3 — surface (Rayleigh) wave + finger damping (30, 60, 90)
- `derived.vRayleigh = ((0.87 + 1.12ν)/(1 + ν))·vS` with `ν = material.poisson` (0.29 default → 0.92·vS; aluminium
  0.93, copper 0.93). When `physics.surfaceWave` and the probe is a shear angle probe with `refracted ≥ 65°` (or wedge
  angle within 6° of the second critical angle), launch a surface wave along the scanning surface in the beam direction
  with energy `eR = 0.15·clamp((refracted − 60)/15, 0, 1)` (60° → 0).
- It travels along consecutive `top`/`cap` outline edges; at a **discontinuity** — cap toe (first `cap` vertex), plate/block
  end, notch, a surface-breaking planar defect (crack reaching y ≤ 0.5) — a fraction reflects back: cap toe 0.5, end face
  1.0, notch 0.8, surface-breaking crack 0.8; the rest continues (cap: passes over). Returned energy → echo kind
  `'surface'`, `tUs = 2·d/vR`, displayed `path = d·vS/vR` (default weld capWidth 16 → toe at x = ±8; probe at x = 40 → d = 32,
  path = 34.8 mm), amplitude `eR·refl·q^0.5` with the surface-distance law.
- **Finger damping** (`damping.points`): each damper at `x_d` between the probe and the discontinuity multiplies the surface
  wave by 0.1 (both ways → −40 dB). Tool: `Probes ▸ Finger damping tool` (shortcut `D`) toggles `damping.tool`; while on,
  clicking on the scanning surface in the cross-section adds a damper (max 3; click within 4 mm removes), drawn as a small
  grey fingertip. `UT.test.setDampers([x…])`.
- 60-view-cross draws the surface wave as a wavy 1 px line along the surface (out to the reflector).

### 3.4 P4 — materials (10, 30, 40)
`UT.specimens.materials` (key → `{key, name, nameKo, vComp, vShear, attenL5, attenS5, atten5 /* legacy */, poisson, grass, anisotropic}`).
**Attenuation semantics**: `attenL5` / `attenS5` are ONE-WAY dB/mm at 5 MHz applied as `M = 10^(−atten·2·len/20)` per leg
with the leg's own mode (exactly v1's formula; carbon L 0.005 / S 0.010 reproduce v1). Values:

| key | vComp | vShear | attenL5 | attenS5 | poisson | grass | anisotropic |
|---|---|---|---|---|---|---|---|
| carbon | 5.90 | 3.24 | 0.005 | 0.010 | 0.29 | 0.02 | false |
| austenitic | 5.66 | 3.12 | 0.10 | 0.14 | 0.29 | 0.12 | true |
| aluminium | 6.32 | 3.13 | 0.003 | 0.004 | 0.33 | 0.01 | false |
| copper | 4.66 | 2.33 | 0.05 | 0.08 | 0.34 | 0.06 | false |
| titanium | 6.10 | 3.12 | 0.006 | 0.008 | 0.32 | 0.02 | false |
| castiron | 4.60 | 2.60 | 0.10 | 0.15 | 0.26 | 0.20 | true |
| perspex | 2.74 | 1.43 | 0.30 | — | — | 0.0 | false |

`atten5` (legacy, two-way-style label) stays in the object for v1 readers only; v2 code reads `attenL5/attenS5`.
Attenuation scales `(f/5)^1.5`, grass `(f/5)²`. `spec.material = materialOf(state.material)` (builders take `material` in
opts; modes pass `state.material`). Austenitic 25 mm backwall vs carbon at equal gain: (0.10 − 0.005)·50 = 4.75 dB lower.
Weld metal: `weldOpts.weldMaterial === 'austenitic'` → rays crossing `weldRegions(spec)` get extra attenuation
0.15 dB/mm·(f/5) one-way and the A-scan grass ×3 inside the weld time window (`UT.specimens.segmentInRegion(spec, a, b) → mm`).
A-scan grass level = `materials.grass · (f/5)² · 100 %` at 40 dB reference, scaled with gain (not TCG-scaled).
**Transfer loss** (`weldOpts.transferLossDb`, 0…8): applied by 30-raytrace as a flat two-way loss on weld-kind specimens
only (never on blocks) — the physics hook for lesson 24 and the procedure transfer correction.

### 3.5 P5 — probe library (20-probe, 90 dialog)
`UT.probe.library` entries: `{id, name, maker, family:'straight'|'angle'|'twin'|'tofd'|'pa', angle, freq, crystal:{a,b,shape}, wedgePath, crystalType, notes}`:
`gen-0-5-10`, `gen-45-5-10`, `gen-60-5-10`, `gen-70-5-10` ('Generic … 5 MHz ⌀10 (UTman default)' — the v1 defaults),
`mb4s` (MB 4 S, 4 MHz ⌀10), `mb2s` (2 MHz ⌀24), `k2n` (2 MHz ⌀24), `mseb4` (twin 4 MHz 8×9), `mwb45-2/60-2/70-2` (2 MHz
9×8, wedgePath 10), `mwb45-4/60-4/70-4` (4 MHz), `wb45-2n/60-2n/70-2n` (2 MHz 22×20, wedgePath 16), `a430s-45/60/70`
(**Olympus A430S-SB: 5 MHz 16×16 mm, wedgePath 14, notes 'ABWS-x wedge'**), `twin-60-4`, `tofd-60-5-6` (TOFD 5 MHz ⌀6 L),
`pa-16-1.0` (array; used by 56). `UT.probe.select(id)` → patch for `UT.setIn('probe', …)` (§1).
Custom angle: `probe.angle` may be any 35…80 (dialog); the toolbar angle buttons pick the library entry of the current
family with that angle (`libForAngle`, fallback generic). `derive()` uses `crystalDims.a` for the fan and `crystalDims.b`
for `hz`; twin-crystal angle probes: no initial pulse, near-surface sensitivity boost ×1.5 for path < 15 mm.
Library window `probelib` (90): table (maker, name, angle, freq, crystal, N, θ6/θ20), Select.

### 3.6 P6 — focused probes (30, 20)
`probe.focus = {on, F}`: when on, **focus REPLACES the angular fan** (41 aperture rays uniformly across `[−a/2, +a/2]`
along the surface tangent, each aimed at the focal point at distance `F` along the centre ray, no side lobes — never 41×41);
weight of each ray = `D1` of its angle from the centre direction. Explicit focal gain applied to every echo amplitude
(pulse-echo, one factor): `Gf(path) = 1 + (min(N/F, 3) − 1)·exp(−((path − F)/(0.25·F))²)` (F = 26, N = 38.6 → +3.4 dB).
Beyond F the geometric divergence from the aperture rays gives the wider beam. Constraints: `F ≤ N` (dialog clamps and
shows 'F > near field: no focusing effect'), `refracted ≤ 70°`, `F ≥ 10`. `Probes ▸ Focus Beam…` opens window `focus`
(on/off, F, shows N). `RayResult.focus = {F, x, y}` for the marker (§3.13). Expected: an SDH at path ≈ F reads ≥ 3 dB
higher than unfocused and its −6 dB x-width is 0.3–0.5× the unfocused width (≤ 0.7× required).

### 3.7 P7 — TCG, pulser, receiver (40, 70)
- **TCG is a per-ECHO gain**: `UT.ascan.ampPctOf(amp, instrument, derived, path)` gains a 4th parameter; when
  `instrument.tcg.on` and `dac.points.length ≥ 2` it multiplies by `10^(g(path)/20)`,
  `g(p) = clamp(20·log10(80 / dacPct_ref(p)), −12, +40)` where `dacPct_ref` = `dacCurve(instrument, derived)` at `refGain`,
  interpolated and flat-extended beyond the first/last point. `mapEchoes`, `synth` (`onScreen[].ampPct` and hence the
  envelopes) and `evalGates` all go through this function, so trace, `frame.echoes` and readouts agree; grass is not
  TCG-scaled. An echo on the DAC curve reads 80 % when `gain === refGain` (80·10^((gain−refGain)/20) otherwise); the DAC
  curve is drawn flat at 80 % when TCG is on. EPOCH page 3 gets a `TCG` softkey.
- Pulser (EPOCH 600 option lists): `pulser.energy` ∈ {100, 200, 300, 400} V → gain offset −6/0/+3/+6 dB relative to
  200 V and pulse width ×1.2/1/0.95/0.9 (**lead decision**: the v1 labels low/med/high map to 100/200/400 V, so
  'high vs low' = +12 dB, V2-8; `setInstrument({pulser:{energy:'high'}})` accepts the labels and stores the voltage). `pulser.damping` ∈ {50, 100, 150, 200, 400} Ω → pulse width ×0.75/0.9/1.0/1.0/1.3 and
  amplitude −2/−1/0/0/+1 dB (150 Ω = v1 default, width ×1, 0 dB). `instrument.damping` (boolean, `tb-damp`, EPOCH 4
  PULSER) remains the single source: 70 writes both in one `setIn` — toggle → `{damping: !d, pulser: {...pulser, damping:
  !d ? 50 : 150}}`; the Pulsar page `Damping` softkey cycles 50→100→150→200→400 and sets `damping = (Ω === 50)`. The 50 Ω
  width factor 0.75 REPLACES v1's 0.9-cycle rule (cycles = 1.5×factor); the v1 −2 dB (`DAMP_DB`) stays for 50 Ω only.
  PRF display only. Energy/damping apply as gain offsets inside `ampPctOf` (readouts agree); K_REF calibration always runs
  with `energy 200`, `filter 'broadband'`, `damping:false`.
- Receiver: `filter` ∈ 'broadband' | '0.2-10' | '1.5-8.5' | '5-15' (MHz): mismatch = probe centre frequency outside the
  band → −6 dB and pulse width ×1.3; 'broadband' never mismatches. `rectify`/`reject` as v1.
- AUTO XX %: `UT.instruments.auto(pct = instrument.autoPct)` (public) sets gain so the gated peak reads `pct`; EPOCH 600
  `2ND F + GATES` and EPOCH 4 `AUTO-80` call it. Compare: EPOCH `2ND F + ❄` stores the current trace in `instrument.compare`
  (module-level Float32Array mirror; drawn grey behind the live trace; again clears). SAVE key → datalogger entry
  `{id, t, readouts (SP/SD/DP/amp), gain, range, note}`; window `datalog` (70) lists entries, delete, copy JSON.

### 3.8 P8 — DGS / ERS + FBH block (45, 10, 30)
- Normalised DGS (Krautkrämer general diagram, circular crystal): `A = s/N`, `G = dERS/a`. Backwall
  `H_bw(A) = A ≤ 1 ? 1 : 1/A`; disc **`H_disc(A, G) = 2π·G²/max(A, 1)²`** (far-field disc/backwall ratio π·d²/(2λs));
  SDH `H_sdh(A, d) = sqrt(2λd)/(a·max(A,1)^1.5)` (physically sqrt(d/(2s)) relative to the backwall at the same s).
- `UT.standards.dgs.curves(derived, Gs=[0.1,0.2,0.3,0.4,0.5,0.7,1.0]) → {A[], bw[], discs:[{G, H[]}]}` (A 0.5…30 log-spaced).
- ERS: `UT.standards.dgs.ers({derived, ref:{kind:'backwall'|'fbh', path, ampPct, gain, fbhMm}, echo:{path, ampPct, gain}, transferDb})`
  → `{G, ersMm, dBvsRef, dBvsDisc3}`: `H_echo = H_ref(A_ref)·10^((ampEchoDb − ampRefDb)/20)` with
  `ampDb = 20log10(pct) − gain + transferDb`; solve **`G = A_echo·sqrt(H_echo/(2π))`**, `ersMm = G·a`.
- Tracer FBH law (30-raytrace, `spec.reflectors` tag `'fbh'`, 0° only, specular at normal incidence):
  `amp_fbh(s) = amp_bw_law(s) · min(1, π·d²/(2·λ·max(s, N)))` where `amp_bw_law(s)` is the tracer's own backwall amplitude
  at path s (e = 1, S = 1, D = q^0.5); tip diffraction at the ends as for planar defects. Angle probes barely see it.
- Window `dgs` (45): log–log plot (A vs H in dB), backwall curve, disc curves, markers for the reference and the gated
  echo, ERS readout `ERS = 2.3 mm (G 0.23)`, "Record reference (backwall)" / "(FBH)" buttons reading
  `frame.readouts.primary`; note text: 'far-field approximation (A ≥ 1); DGS applies to the 0° probe only'.
- `UT.specimens.fbhBlock({T:60})` (frozen, done): 300 × 60 block, `spec.fbhs = [{x, y, d, label}]` ⌀ 2, 3, 4, 6 mm at depth
  30 (x = 60, 110, 160, 210) and ⌀ 3 at depth 50 (x = 260); `spec.reflectors` segments tag `'fbh'`. Mode `'fbh'` (80).

### 3.9 P9 — TOFD v2 (50)
- Mode-converted signals (`tofd.modeConv`); `wd` = one-way wedge delay per probe (12 mm / 2.74 = 4.38 µs; `2wd` = 8.76 µs as in
  V1 #11). All times below are absolute (metal + 2wd):
  - L→S backwall via the **Fermat minimum**: `t_LS = 2wd + min over x∈[0,pcs] ( √(x²+T²)/vL + √((pcs−x)²+T²)/vS )` (golden
    section on x, or solve sinφL/vL = sinφS/vS; pcs 60, T 20 → x = 48.2 mm from Tx, **24.77 µs absolute**, 16.0 µs
    wedge-zeroed), amplitude 0.35, phase like the backwall, event kind `modeconv-backwall`.
  - S-S backwall replica: `t_SS = 2wd + 2·√((pcs/2)²+T²)/vS` (31.02 µs absolute / 22.3 wedge-zeroed), amplitude 0.15, kind
    `modeconv-backwall-ss`.
  - Tip replicas: `t = 2wd + sT/vL + sR/vS` with sT, sR the Tx/Rx legs of that tip (amplitude 0.12), kind `modeconv-tip`.
- Dead zones (`tofd.deadZones`): `τ = 1.5/freqMHz` (µs, 1.5 cycles); lateral-wave dead depth
  `dL = ½·√((pcs/vL + τ)²·vL² − pcs²)` (pcs 60, 5 MHz → **7.3 mm**); backwall dead zone
  `dB = T − √((√(S²+T²) − vL·τ/2)² − S²)`, S = pcs/2 (→ 1.6 mm). `TofdResult.deadZones = {lateral: dL, backwall: dB}` (mm);
  shaded bands on the D-scan and in the cross-section (60) when `tofd.deadZones`.
- PCS optimiser button: `pcs = 2·(2T/3)·tan θ` ("2/3 T rule"; T 20, 60° → 46.2), applied to `tofd.pcs`. `UT.test.pcsOptimise()`.
- Hyperbolic cursor: hovering the D-scan at (z, t) draws the diffraction hyperbola of a point at that depth:
  `t(z') = 2wd + (√((x−xt)²+d²+(z'−z)²) + √((x−xr)²+d²+(z'−z)²))/vL` for z' ± 40 mm; 50 writes
  `cursor = {view:'dscan', tUs, depth, z}` on hover/click (depth from `depthFromTime`).
- Straightening (`tofd.straighten`): subtract per-column lateral-wave time offset (visual toggle that aligns the lateral
  wave to a flat line and marks it). RF grass from the material.

### 3.10 P10 — phased array v2 (56-pa, NEW)
- Array `{elements, pitch, freq}`; active aperture `A = elements·pitch`; wedge angle β = 36° (shear S-scan) or 0° (contact
  E-scan L, v_w = v_mat); `derived` per angle via `UT.probe.derive`. Angle set = `UT.probe.paAngles(probe)` (v1 fields).
- **Focal laws** (per steering angle θ in steel): `θ_w = asin(v_w·sinθ/v_mat)` (null past the critical angle → law invalid,
  angle skipped), `θ_rel = θ_w − β` (0 for the contact E-scan L probe, where θ_rel = θ). Steering only:
  `τ_i = x_i·sin(θ_rel)/v_w`, then `τ_i −= min(τ)` so all delays are ≥ 0 (60° through the 36° wedge: θ_w = 47.1°,
  θ_rel = 11.1°, slope 0.0702 µs/mm). Steering + focus at distance F (along the beam from the aperture centre in the wedge
  medium; for a focus in steel at depth Fd use `F = Fd/cosθ` and v_mat as an approximation):
  `d_i = √(F² + x_i² − 2·F·x_i·sin(θ_rel))`, `τ_i = (max(d) − d_i)/v_w`. Effective aperture for directivity:
  `a = A·cos(θ_rel)·cosθ/cos(θ_w)`. `UT.pa.focalLaw(θ, {escan}) → {delaysUs[], slope /* µs/mm */, valid}` shown as a bar chart.
- `UT.pa.compute(state) → {view, sscan: {angles, columns:[{angle, echoes}], maxPath, T} | null, escan: {columns:[{xOff, echoes}], angle} | null, focalLaws: {delaysUs}, aperture: {x0, x1}}`.
  40's `compute()` becomes: `if (probe.method === 'pa') { frame.pa = UT.pa && UT.pa.compute ? UT.pa.compute(state) : null;
  frame.sscan = frame.pa ? frame.pa.sscan : computeSscan(state); }` so 70's `drawSscan(frame.sscan)` and 60's sector/wedge
  drawing are unchanged; 56's window draws E-scan/C-scan and the focal-law chart from `frame.pa`.
- S-scan: per angle trace (fan 9 rays, ≤ 2 legs, via `UT.ascan.traceOpts`) → column of amplitudes vs path; image = sector
  (path·sinθ, folded depth) with the colour map; per-angle TCG (`pa.tcg`) flattens the DAC-block SDH response across angles
  (gain(θ) table computed on demand).
- E-scan: fixed `escanAngle`, aperture of 8 elements sliding across the array → columns at index offsets `x_k`; image =
  B-scan style (x vs depth).
- Encoded C-scan: `UT.pa.runScan(state, {sync})` steps z (adaptive step) and stores `state.pa.scan = {z0, z1, step, n, xBins, map: Float32Array}`
  via `UT.setIn('pa', …)` exactly like `aut.scan`.
- Window `pa`: tabs `S | E | C`, array controls, focal-law chart, angle/focus fields, Run/Stop/Clear, TCG toggle; the
  A-scan area shows the selected angle's trace. `UT.test.pa = {sscan(), escan(), runScan(), focalLaw(θ, opts)}` (created by 56).

### 3.11 P11 — AUT v2 (55)
`aut.channels` 1…6 (gates array of 6; UI shows `channels`), `Map` tab: C-scan map (z × channel, colour bands), adaptive
`step = max(1, round(L/400))`, `aut.speed` columns/frame slider, strip charts unchanged, export of the strip chart into
the trade report (`UT.aut.snapshot() → dataURL`). Trace options from `UT.ascan.traceOpts(state, spec, probe)`.

### 3.12 P12 — B-scan and echo-dynamic windows (66)
- Column/sample buffers are **MODULE-LEVEL in 66** (`bscan.columns`/`echodyn.samples` in state are always `null`/`[]`);
  66 records inside its `'render'` handler when `state.bscan.on`/`state.echodyn.on` and only when `probe.x/z` changed since
  the last column; it never calls `UT.set` from a render handler.
- `UT.views.bscan` (window `bscan`): image = position vs depth (samples → depth via path·cosθ), colour map; Clear;
  `UT.test.bscan() → {n, axis, columns: number[][]}` from the module buffer.
- `UT.views.echodyn` (window `echodyn`): rolling plot of the gated peak amplitude vs probe position (last 200) with the
  current marker; classification hint named after **ISO 23279 echo-dynamic patterns**: pattern 1 (single sharp peak, width
  ≈ w6 → 'point-like'), pattern 2 (plateau > 2·w6 → 'extended, smooth'), pattern 3 (ragged plateau → 'extended, rough'),
  with `w6 = 2·path·tan(halfAngle6dB)/cosθ + crystalA` for x-scans and `2·hz6 = 2·(path·tan(asin(0.51λ/crystalB)) + crystalB/2)` for z-scans.
  `UT.test.echodyn() → {samples, pattern}`.

### 3.13 Drawing contracts (what 60/62/64 draw — names are binding)
- `RayResult.surface: null | {pts:[{x,y}], reflectors:[{x, y, kind, refl}], dampers:[{x}]}` (P3; 60 draws the wavy line when `physics.surfaceWave`).
- `RayResult.converted: [{mode:'L'|'S', pts:[{x,y,leg}], weight}]` (P2; 60 styles orange dashed L / white S when `display.convRays`; ≤ 40 entries by weight).
- Focus (P6): `fan[i].pts[0]` is the aperture point (60 draws the fan from its first point) and `RayResult.focus = {F, x, y}`.
- FBH (P8): `spec.fbhs = [{x, y, d, label}]` + `spec.reflectors` tag `'fbh'` (60 draws bar + drill shaft to the bottom face; 64 ignores).
- Weld preps (F1): `spec.weld.backing = polygon|null`, `spec.weld.web = polygon|null`, `spec.weld.prep`, `spec.weld.regions[]`;
  the backing bar's lower face/ends are in `spec.edges` tagged `'backing'` (`SURFACE_COLOURS.backing = '#0040ff'`); the fillet
  web/plate interface is `spec.reflectors` tag `'interface'`; fillet cap edges are tagged `'cap'`.
- TOFD (P9): `TofdResult.deadZones = {lateral, backwall}` read by 50's D-scan and by 60 when `tofd.deadZones`.
- Coverage (T2): `UT.trade.coverageMap() → {zBin, sides:{1: Uint8Array, −1: Uint8Array}}` read by 62 for the faint green band.
- Probe drag helper (60, used by 82 doIt and by V2-19): `UT.views.cross.dragTo(x, {z} = {})` dispatches synthetic `pointerdown/pointermove/pointerup`
  on `#cv-cross` (scale-aware, `UT.dom.localPos`) so that the probe moves to x (mm from the weld centre / block datum) through the SAME
  code path as a real drag, emitting exactly one `'ui'` `{kind:'probe-drag'}` event; returns the resulting `probe.x`.

---

## 4. Training v2

### 4.1 T1 — guided lessons (82-lessons, NEW; 80-modes delegates)
```js
UT.lessons = {
  list: [{ n, title, ko, en, setup(), steps: Step[] }],   // 25 lessons (1–22 playlist order kept, 23 Reference level,
                                                          // 24 Transfer correction, 25 Sensitivity re-check); ≥ 5 steps each,
                                                          // ≥ 130 steps total; a choices or numeric input step in every lesson,
                                                          // ≥ 2 in lessons 5, 7, 12, 13, 20, 21
  start(n), stop(), goto(step), current() → {n, step, done[]}, next(), prev(), hint(), doIt(), answer(value),
  autoRun(n) → Promise<{n, completed, failedSteps}>, quiz /* §4.5 */, window /* dom.win 'lessons' */, css,
}
Step = {
  ko, en, hintKo, hintEn, okKo, okEn /* feedback shown after pass – the 'why' */,
  check(ctx) → bool, doIt(ctx), onEnter(ctx) /* optional: stores ctx.memo values via UT.setIn('lessons', {memo}, {noRender:true}) */,
  mode: 'state' | 'transition' /* default 'state' */,
  choices?: [{id, ko, en, wrongKo, wrongEn}], answer?: id | (ctx) => number, tol?: number, input?: 'number',
}
```
- `ctx = {state, frame, modes, memo: state.lessons.memo, ans: state.lessons.answers[n]?.[step], prevFrame, spec: state.specimen,
  R: frame.readouts?.primary, E: frame.echoes, S: state}` (the short names are used in the step lists below).
- Rules: **only the current step is evaluated** (on every `'render'`, throttled 150 ms, from a `setTimeout(0)` — never
  synchronously inside the `'render'` handler; progress writes use `UT.setIn('lessons', {...}, {noRender: true})`).
  `mode:'transition'` steps pass only when `check` was false at `onEnter` (recorded in `memo.was`) and becomes true
  later. Passing a step never re-opens earlier steps. Choice steps pass when `ans === answer`; numeric steps
  (`input:'number'`) when `|ans − answer(ctx)| ≤ tol` (`answer` may be a number or a function of ctx evaluated at
  answer time). A wrong choice shows `wrongKo/En` under the buttons and increments `progress[n].wrong`; the hint timer
  (**30 s**) restarts on every step change; `memo` is reset on step change except keys listed in `step.keep` (e.g.
  `bwClean`). `state.lessons.stepStartedAt = Date.now()` on step change.
- **'ui' bus event** (the ONLY addition to SPEC §15.9's catalogue): `'ui' {kind:'menu-open'|'tb-hover'|'tb-click'|'wheel'|
  'probe-drag'|'window-open'|'softkey', id}` emitted by 90 (menu-open, tb-hover, tb-click, window-open), 70 (wheel,
  softkey) and 60 (probe-drag, once per drag gesture). 82 keeps a per-step tally
  `state.lessons.memo.ui = {menuOpen:[…ids], tbHover:[…], tbClick:[…], wheel:n, drag:n, win:[…], softkey:[…]}` reset on step
  change, so checks stay pure functions of state. `doIt()` for gesture steps calls the real handler (`UT.test.menu(...)`,
  `UT.test.click(...)`, `UT.instruments.wheel(±n)`), which emits the event — no synthetic emits.
- 40-ascan adds `AscanResult.initialPulse: boolean` (true when `probe.angle === 0 && probe.crystal === 'single' && method === 'pe'`)
  and `AscanResult.grassPct` (mean of samples beyond the last echo) — owner physics-2.
- `autoRun(n)`: `setup()`, then for each step `onEnter`, `doIt`, `UT.renderNow()`, evaluate `check` synchronously (retry once
  after a second `renderNow()`); transition steps: `doIt` performs the change after `onEnter` recorded `was`; choice/numeric
  steps: `doIt` = `answer(correct)`; scans use `UT.test.runAutScan/runTofdScan/pa.runScan` (sync); on completion `stop()` and
  mark `progress[n] = {done:true, auto:true}` — auto runs never raise `best`.
- Progress: `progress[n] = {done, best: 0…100, hints, doIt, wrong, auto}` with
  `best = round(100·(steps − stepsPassedByDoIt − 0.5·hintsShown − 0.5·wrongChoices)/steps)` clamped 0…100 at completion;
  badge: grey = not started, blue ✓ = done, gold ★ = best 100; the window header shows `x/25 done, y ★`.
- Window: lesson list with badges, current lesson panel (title, KO/EN follows `UT.i18n.lang`), step list with ticks,
  choice buttons (`role="group"` labelled by the step text), numeric input, `aria-live="polite"` region (step-pass,
  wrong answer, hint), buttons `Start | Hint | Do it for me | Restart | Next lesson`, and an `<ol>` of
  `frame.ascan.echoesOnScreen` with 'select' buttons as the keyboard alternative to clicking the A-scan/D-scan.
- `UT.modes.lessons` stays a thin alias (§1), `UT.test.lessons()` returns 25 titles, plus `UT.test.lessonAutoRun(n)`,
  `UT.test.lessonState() → {n, step, done[], answers}`, `UT.test.lessonAnswer(value)`.
- Lesson 25 applies a silent gain drift on start (`instrument.gain = refGain ± 3`, sign from the seed).

### 4.1.1 Full step lists (KO / EN · check · doIt). `angle/x/z/side/gain/range` abbreviate `S.probe.*`/`S.instrument.*`.

**Lesson 1 — UTman functions** (weld plate 20, 60° x 40, gain 30, range 100)
1. '툴바에서 45° 탐촉자 선택 / Select the 45° probe' · `angle===45` · `click('tb-45')`
2. 'Weld ▸ Weld… 대화상자에서 두께 25 / Weld dialog: T = 25' · `S.weldOpts.T===25 && memo.ui.win.includes('weld')` · `menu('Weld/Weld...'); UT.setIn('weldOpts',{T:25}); enter('weld',{keepProbe:true})`
3. '탐촉자를 x = 50으로 드래그 / Drag the probe to x = 50' · transition · `|x−50|≤3 && memo.ui.drag≥1` · `UT.views.cross.dragTo(50)` (emits probe-drag)
4. '휠로 게인 36 dB / Wheel: gain 36 dB' · `gain===36 && memo.ui.wheel≥1` · `UT.instruments.wheel(+6)`
5. 'BEAM 끄고 다시 켜기 / BEAM off then on' · transition · `memo.beamToggles≥2 && S.display.beam===true` (onEnter records `beam`; tally from 'ui' tb-click id 'tb-beam') · `click('tb-beam'); click('tb-beam')`
6. choice '메뉴/툴바 중 결함을 숨기는 기능은? / Which control hides defects?' · [hide ✓ 'HIDE', beam 'BEAM', clear 'CLEAR', damp 'DAMP']

**Lesson 3 — Zero probe** (v1 narrow, 0° single, gain 30)
1. '툴바에서 0° 탐촉자를 선택 / Select the 0° probe' · `angle===0` · `click('tb-0')`
2. '측정 범위를 125 mm로 (저면 에코 4개) / Range 125 mm so four backwall echoes fit' · `range>=120 && range<=140` · `setInstrument({range:125})`
3. choice '화면 왼쪽 끝의 큰 신호는? / The big signal at the left edge is…' · [initial ✓ '초기 펄스(송신 펄스)', backwall '저면 에코', surface '표면파', defect '결함 지시']
4. numeric '첫 번째 저면 에코의 위치(mm)? / Position of the first backwall echo' · answer 25 tol 1
5. 'Probes ▸ Zero Probe ▸ Twin Crystal – 초기 펄스가 사라짐 / …the initial pulse disappears' · `S.probe.crystal==='twin' && frame.ascan.initialPulse===false` · `menu('Probes/Zero Probe - Twin or Single Crystal/Twin Crystal')`
6. '게이트 1을 첫 저면 에코에 걸고 DP 25.0 ± 0.3 / Gate the first echo: DP reads 25.0 ± 0.3' · `R && R.echoKind==='backwall' && |R.dp−25|≤0.3` · `setInstrument({gates:[{on:true,start:15,width:20,level:20}]})`
7. choice '이중진동자 탐촉자를 쓰는 이유는? / Why use a twin-crystal probe?' · [nearsurface ✓ '불감대 감소 – 근거리 분해능', deeper '더 깊은 투과', narrow '더 좁은 빔', shear '횡파 발생']
8. '저면 에코 4개 확인 (≥ 5 %) / Four backwall echoes ≥ 5 %' · `E.filter(e=>e.kind==='backwall' && e.ampPct>=5).length>=4` · (none needed)

**Lesson 4 — V1 angle** (v1 wide, 45°, x 100, side +1)
1. `angle===45` · `click('tb-45')`
2. '입사점을 x = 100(반경 중심)에 / Index at x = 100' · `S.mode==='v1' && |x−100|≤1 && side===1` · `setProbe({x:100,side:1})`
3. '범위 400: 100/200/300 mm 에코 / Range 400: echoes 100/200/300' · `range>=300 && [100,200,300].every(p=>E.some(e=>|e.path−p|≤1))` · `setInstrument({range:400})`
4. choice '100 mm 반경 에코로 확인하는 것은? / The 100 mm radius echo checks…' · [index-range ✓ '입사점과 측정 범위(거리 교정)', angle '굴절각', sens '감도', vel '쐐기 속도']
5. 'x = 150 (135 + 15·tan45)으로 이동해 1.5 mm 구멍 에코 / Move to x = 150 for the 1.5 mm hole' · `|x−150|≤3 && E.some(e=>e.kind==='sdh' && |e.path−21.2|≤1 && e.ampPct>=10)` · `setProbe({x:150}); setInstrument({range:100,gain:40})`
6. choice '1.5 mm 구멍의 용도는? / The 1.5 mm hole is used for…' · [angle ✓ '굴절각 점검(눈금과 대조)', index '입사점', range '측정 범위', reso '분해능']
7. 'x = 240, 0°: 퍼스펙스 인서트 에코 / 0° at x = 240: Perspex insert echo' · `angle===0 && E.some(e=>e.kind==='perspex')` · `click('tb-0'); setProbe({x:240})`
8. choice '퍼스펙스 에코가 50 mm 강 등가 위치에 오지 않으면? / If the Perspex echo is not at the 50 mm-steel position…' · [zero-vel ✓ '영점/속도 교정을 다시 한다', gain '게인을 올린다', probe '탐촉자 교체', ignore '무시']

**Lesson 5 — Lamination** (lamination plate 25, 0°, range 100; laminations x 15…40 y 10 z 40…90 and x −60…−30 y 18 z 150…200)
1. '건전부에서 저면 에코를 게이트 (DP 25.0) / Gate the backwall on a clean spot' · `R && R.echoKind==='backwall' && |R.dp−25|≤0.5`; on pass `memo.bwClean = R.peakPct` (keep) · `setProbe({x:-10,z:10}); setInstrument({gates:[{on:true,start:15,width:20,level:20}]})`
2. 'z 방향 래스터로 라미네이션 위로 (x 27, z 65) / Raster along z onto the lamination' · transition · `E.some(e=>e.kind==='lamination' && |e.path−10|≤1 && e.ampPct>=20)` · `setProbe({x:27,z:65})`
3. choice '지금 저면 에코는? / The backwall echo now…' · [lost ✓ '소실 또는 −6 dB 이상 감소', same '변화 없음', double '2배', closer '더 가까워짐'] AND `bwNow ≤ memo.bwClean·0.5` (bwNow = backwall echo ampPct or 0)
4. numeric '라미네이션 깊이(mm)? / Lamination depth' · answer 10 tol 0.5
5. 'SIZE 창: 6 dB 드롭으로 z 길이 측정 (≈ 50 mm) / Size along z with the 6 dB drop' · `S.sizing.method==='6dB' && S.sizing.result && |S.sizing.result.length−50|≤6` · `UT.views.sizing.open(); UT.views.sizing.setMethod('6dB'); setProbe({z:40}); UT.views.sizing.markL(); setProbe({z:90}); UT.views.sizing.markR()`
6. choice '6 dB 드롭법이 유효한 경우는? / The 6 dB drop is valid when…' · [bigger ✓ '반사체가 빔 폭보다 클 때', smaller '빔보다 작을 때', always '항상', volumetric '체적 결함만']
7. choice '보고서 조치? / Report action?' · [record-both ✓ '위치·깊이·길이·폭을 기록하고 사각 주사 시 고려', ignore '무시', grind '연삭 지시', only-depth '깊이만 기록']

**Lesson 7 — Amplitude** (dac T 20, 60°, gain 24, probe at the T/2 hole maximum)
1. 'T/2 횡공 에코 최대 (≈ 40 %) / T/2 SDH maximised' · `E.some(e=>e.kind==='sdh' && |e.path−20|≤1 && e.ampPct>=30)` · `setProbe({x: hole.x + 10·tan60})`
2. '30.0 dB 소프트키 (+6 dB): 에코 2배 / Press 30.0 dB: the echo doubles' · `gain===30 && R.peakPct>=70 && R.peakPct<=90` · `setInstrument({gain:30})`
3. numeric '에코 높이 %? / Echo height %' · answer `ctx => R.peakPct` tol 5
4. '40.0 dB: 클리핑 – 언클립 % 박스 읽기 / 40 dB: clipped – read the unclipped % box' · `gain===40 && R.peakPct>120` · `setInstrument({gain:40})`
5. choice '+6 dB = 진폭 몇 배? / +6 dB multiplies amplitude by' · [x2 ✓ '2배', x1.5 '1.5배', x4 '4배', x10 '10배']
6. choice '80 % → 20 %로 낮추려면? / To bring 80 % down to 20 %' · [-12 ✓ '−12 dB', -6 '−6 dB', -14 '−14 dB', -20 '−20 dB']
7. '게인을 조절해 정확히 80 % (AUTO 80 가능) / Set exactly 80 % (AUTO 80 allowed)' · `|R.peakPct−80|≤2` · `UT.instruments.auto(80)`
8. choice '기준 감도 34 dB, 주사 감도 +6 dB. 지시가 주사 감도에서 60 % → 기준 감도 대비? / Ref 34 dB, scanning +6 dB; 60 % at scanning gain – relative to reference?' · [30pct ✓ '30 % (−6 dB)', 60pct '60 %', 120pct '120 %', 15pct '15 %']

**Lesson 9 — Beam spread** (iow, 60°, side +1 — beam toward −x, x 262.5, gain 34, PLOT)
1. '13 mm 횡공 에코를 최대로 / Maximise the 13 mm SDH' · `E.some(e=>e.kind==='sdh' && |e.path−26|≤0.5) && |x−262.5|≤1.5` · `setProbe({x:262.5})`
2. '80 %로 설정 / Set 80 %' · `|R.peakPct−80|≤3` · `UT.instruments.auto(80)`
3. '앞으로 이동해 10 % (−20 dB)에서 Mark 10% edge / Move forward to 10 % and press Mark 10% edge' · transition · `S.plot.edgeMarks.some(m=>m.depth===13 && m.standOff<22.5)` · loop `x −= 0.5` until `R.peakPct≤10` then `UT.modes.plot.markEdge()`
4. '뒤로 이동해 반대쪽 에지 / Same backward' · `S.plot.edgeMarks.filter(m=>m.depth===13).length>=2` · loop `x += 0.5` from 262.5 until ≤ 10 %, `markEdge()`
5. '19/25/43 mm 구멍에서 반복 / Repeat for 19/25/43' · `[13,19,25,43].every(d=>S.plot.edgeMarks.filter(m=>m.depth===d).length>=2)` · same loops per hole
6. numeric '13 mm 깊이의 20 dB 빔 폭(mm)? / 20 dB beam width at 13 mm' · answer `ctx => |front.standOff − back.standOff|` from the user's own marks, tol 20 %
7. choice '플롯한 빔 에지의 용도는? / The plotted edges are used to…' · [plot-size ✓ '결함 에지를 플로팅해 실제 위치·크기 산정', gain '감도 설정', index '입사점', vel '속도']

**Lesson 12 — EPOCH Auto Cal** (step 5–25, 0°, EPOCH 600, wrong cal 5.60/0.4)
1. '10 mm 스텝에 놓고 게이트 1을 첫 에코에 / Probe on the 10 mm step, gate 1 on the first echo' · `S.mode==='step' && spec.thicknessAt(x)===10 && R && R.echoKind==='backwall'` · `setProbe({x: spec.stepX(10)}); setInstrument({gates:[{on:true,start:5,width:12,level:20}]})`
2. choice '표시값이 10.0이 아닌 이유? / Why does DP not read 10.0?' · [cal ✓ '속도·영점이 잘못 설정됨', wear '탐촉자 마모', gate '게이트 위치', gain '감도 부족']
3. 'Auto Cal → 10 mm ✓ / Auto Cal, tick on 10 mm' · `S.autocal.stage===2` · `UT.modes.autoCal.start(); UT.modes.autoCal.step()`
4. '25 mm 스텝 → ✓ / 25 mm step, tick' · `S.instrument.cal.vel!==null && |cal.vel−5.90|≤0.05 && |cal.zero|≤0.05` · `setProbe({x: spec.stepX(25)}); UT.modes.autoCal.step()`
5. '15 mm 스텝에서 15.0 ± 0.1 확인 / Verify 15.0 ± 0.1 on the 15 mm step' · `spec.thicknessAt(x)===15 && |R.dp−15|≤0.1` · `setProbe({x: spec.stepX(15)})`
6. choice '속도만 틀렸을 때 오차는? / With only the velocity wrong, the error…' · [proportional ✓ '깊이에 비례해 커진다', constant '일정하다', zero '없다', random '무작위']
7. choice '왜 첫 점을 5 mm가 아닌 10 mm 스텝으로? / Why 10 mm, not 5 mm, for the first point?' · [deadzone ✓ '단일진동자 불감대(≈ 5 mm)', thicker '두꺼워서', gain '게인', rule '규정']

**Lesson 13 — TOFD** (plate 20, planar y 8…13 z 120…150, pcs 60, 60° L)
1. numeric '저면파 도달 시간(µs)? / Backwall time' · answer `ctx => frame.tofd.backwallUs` tol 0.1
2. 'Run Scan' · `S.tofd.scan!==null` · `UT.test.runTofdScan()`
3. 'D-스캔에서 상단 팁 곡선을 클릭 / Click the upper tip arc on the D-scan' · `S.cursor.view==='dscan' && |S.cursor.depth−8|≤1` · `UT.tofd.cursorAt({z:135, depth:8})`
4. numeric '결함 상단 깊이? / Top depth' · answer 8 tol 1
5. numeric '높이(mm)? / Height' · answer 5 tol 1.5
6. choice '측면파와 저면파 사이의 두 곡선은? / The two arcs between lateral wave and backwall are…' · [tips ✓ '상단·하단 팁 회절 신호', modeconv '모드 변환', geometry '형상 에코', noise '노이즈']
7. 'PCS 최적화 (2/3 T 규칙) / Optimise PCS' · `|S.tofd.pcs − 46.2|≤1` · `UT.test.pcsOptimise()`
8. choice 'TOFD로 결함 높이를 구하는 근거는? / TOFD height comes from…' · [timediff ✓ '팁 신호의 시간차', amp '진폭', width '폭', phase '위상만']

**Lesson 17 — Lamination check before the angle-probe scan** (pipe 8 in WT 25, lamination x −45…−15 depth 12 z 100…160)
1. '0° 탐촉자로 용접부 양쪽 주사면(용접 중심 ±1.25 T)을 래스터 주사하세요 / Raster the scanning surfaces ±1.25 T either side of the weld with the 0° probe' · `memo.ui.drag>=1 && angle===0 && E.some(e=>e.kind==='lamination')` · `click('tb-0'); UT.views.cross.dragTo(-30); setProbe({z:130})`
2. numeric '라미네이션 깊이(DP)는? / Depth of the lamination?' · answer 12 tol 0.7
3. '60° 탐촉자를 라미네이션 위 x = −30 에 두고 루트 균열을 찾으세요 / Put the 60° probe on x = −30 over the lamination and look for the root crack' · `angle===60 && |x+30|≤3` · `click('tb-60'); setProbe({x:-30})`
4. choice '루트 에코가 약한/없는 이유는? / Why is the root echo weak or missing?' · [lamination-blocks ✓ '라미네이션이 빔을 차단(반사)함', wrong-angle '각도 오류', gain-low '게인 부족', skew '스큐']
5. choice '올바른 조치는? / Correct action?' · [scan-other-side ✓ '반대쪽 면에서 주사하고 라미네이션을 보고서에 기록', increase-gain '게인 증가', ignore '무시', use-70 '70° 사용']

**Lesson 19 — V2 with 60°/70°: index & angle check** (v2 wide, 60° x 60 side +1, range 100)
1. `angle===60 && S.mode==='v2' && side===1` · `click('tb-60'); setProbe({side:1})`
2. '25 mm 에코를 최대로 하여 입사점을 확인 / Maximise the 25 mm echo to check the index point' · `E.some(e=>(e.kind==='geometry'||e.kind==='backwall') && |e.path−25|≤0.5 && e.ampPct>=50) && |x − xR25max|≤1` (xR25max from `spec.arcs`) · `setProbe({x: xR25max})`
3. numeric '입사점 오차(mm)? = |probe.x − 표시 눈금| / Index error (mm)' · answer `ctx => |x − markX|` tol 1
4. '5 mm 구멍(전면)으로 굴절각 확인: 60° 눈금 위치에서 최대 / Angle check on the 5 mm hole' · `E.some(e=>e.kind==='sdh' && e.ampPct>=40)` · `const h = spec.holes.find(h => h.d === 5); setProbe({x: h.x + h.y·tan(60°)})` (hole centre `{x, y, d}` read from `spec.holes` of the v2 builder — no hard-coded x; `h.y` = depth of the hole centre)
5. choice '측정 굴절각이 63°로 나왔다. 조치는? / Measured 63°: action?' · [record-and-use ✓ '측정각을 기록하고 Trig 설정을 63°로 수정', ignore '무시', replace-probe-only '탐촉자만 교체', change-freq '주파수 변경'] AND `S.instrument.trig.angle>=62 && <=64` when 'record-and-use' (the *measured* angle goes into the set)

**Lesson 20 — Angle-probe calibration / DAC** (dac T 20, 70°, gain 30)
1. `S.mode==='dac' && angle===70` · `click('tb-dac'); click('tb-70')`
2. 'T/4 구멍 최대 → Record / Maximise T/4 → Record' · `dac.points.length>=1 && |points[0].path−14.6|≤1` · `setProbe({x: h.x + 5·tan70}); UT.modes.dac.record()`
3. 'T/2 → Record' · `points.length>=2 && |points[1].path−29.2|≤1` · same
4. '3T/4 → Record' · `points.length>=3 && |points[2].path−43.9|≤1` · same
5. 'Draw Curves / 커브 그리기' · `dac.on && dac.curves` · `UT.modes.dac.draw()`
6. choice 'DAC 커브의 의미? / The DAC curve shows…' · [same-ref ✓ '같은 기준 반사체(3 mm 횡공)의 거리별 에코 높이', defect-size '결함 크기', beam '빔 폭', atten '재료 감쇠만']
7. 'LOF 프리셋을 추가하고 최대 에코에서 DAC % 읽기 / Add the LOF preset and read DAC % at its maximum' · `S.defects.length>=1 && R && R.dacPct!==null` · `addPreset('lof'); setProbe({x:60})`
8. numeric 'DAC 대비 dB? / dB relative to DAC' · answer `ctx => R.dBToDac` tol 1
9. choice 'ASME (기록 20 % DAC, 기준 초과 + 길이 초과 시 불합격)에서 조치는? / Under ASME: action?' · [record-size ✓ '기록하고 길이를 측정한 뒤 판정', ignore '무시', reject-now '즉시 불합격', lower-gain '게인 감소'] AND `S.standards.lastEval?.rows.length>=1` (the evaluation window was used with this indication) · doIt `UT.standards.evaluation.open(); UT.standards.evaluation.addFromReadout(); UT.standards.evaluation.evaluateAll()`

**Lesson 21 — Trade test** (pipe 8 in WT 25, procedure like `iso-B-plate20`, 4 defects, seed fixed)
1. 'Start' · `S.trade.active` · `UT.trade.start(21)`
2. 'A면에서 45°와 60°로 전체 주사 (커버리지 ≥ 80 %) / Scan side A fully with 45° and 60°' · `UT.trade.coverage().sideA>=0.8` · sync sweep z 0…L at half-skip x for 45 then 60 (side +1)
3. 'B면도 동일 / Same on side B' · `coverage().sideB>=0.8` · same with side −1
4. '지시 최대에서 Take from readout로 행 추가 / Add a row from the readout at an indication maximum' · `S.trade.report.length>=1` · `UT.trade.addRowFromReadout()`
5. 'Submit' · `S.trade.revealed` · `UT.trade.submit(S.trade.report)`
6. choice '허위 지시(false call)의 대가는? / A false call costs…' · [15 ✓ '−15점', 0 '0점', -5 '−5점', fail '불합격']
7. choice '균열을 놓치면? / Missing a crack means…' · [fail ✓ '점수와 무관하게 불합격', minus-40 '−40점', retry '재시험', nothing '없음']

**Lesson 23 — Set the reference level / 기준 감도 설정** (procedure `iso-B-plate20`, dac T 20, 60°)
1. 'Tools ▸ Procedures ▸ iso-B-plate20 적용 / Apply the procedure' · `S.standards.procedure==='iso-B-plate20'` · `UT.standards.applyProcedure('iso-B-plate20')`
2. 'T/2 횡공을 80 %로 / T/2 SDH at 80 %' · `|R.peakPct−80|≤2 && R.echoKind==='sdh'` · `setProbe({x: h.x + 10·tan60}); UT.instruments.auto(80)`
3. '2ND F + dB 로 기준 게인 저장 / Store as reference gain' · `S.instrument.refGain===S.instrument.gain` · `UT.instruments.storeRef()`
4. choice '주사 감도는? / Scanning sensitivity is' · [ref+6 ✓ '기준 + 6 dB (ISO 17640 — verify)', ref '기준과 동일', ref-6 '기준 − 6 dB', max '최대']
5. '주사 감도로 설정 (기준 + 6) / Set scanning gain (ref + 6)' · `gain===S.instrument.refGain+6` · `setInstrument({gain: refGain+6})`

**Lesson 24 — Transfer correction / 전달 손실 보정** (dac T 20 block ↔ weld plate 20 with `transferLossDb` 4 set by setup)
1. '대비 시험편에서 0° 저면 에코 80 % (T = 20) / 0° backwall 80 % on the block' · `S.mode==='dac' && angle===0 && R.echoKind==='backwall' && |R.peakPct−80|≤2`; on pass `memo.gainBlock = gain` (keep) · `click('tb-0'); UT.instruments.auto(80)`
2. '시험체 건전부에서 같은 경로의 저면 에코 80 % / Same on the specimen' · `S.mode==='weld' && angle===0 && R.echoKind==='backwall' && |R.peakPct−80|≤2`; on pass `memo.gainSpec = gain` · `enter('weld',{keepProbe:true}); setProbe({x:-40}); UT.instruments.auto(80)`
3. numeric '전달 손실(dB)? / Transfer loss' · answer `ctx => memo.gainSpec − memo.gainBlock` tol 1
4. '평가 창의 전달 보정에 입력 / Enter it in Evaluation ▸ Transfer' · `|S.standards.transferDb − S.weldOpts.transferLossDb|≤1` · `UT.setIn('standards',{transferDb: S.weldOpts.transferLossDb})`
5. choice '보정값이 +5 dB일 때 주사 감도는? / With +5 dB correction, scanning gain is' · [ref+5+scan ✓ '기준 + 5 + 주사 여유', ref '기준', ref-5 '기준 − 5', unchanged '변화 없음']

**Lesson 25 — Sensitivity re-check / 감도 재확인** (dac T 20, 60°, refGain stored; gain drifted ± 3 dB silently)
1. '시험 중 DAC 블록으로 돌아가 T/2 횡공 확인 / Return to the DAC block and check the T/2 SDH' · `S.mode==='dac' && E.some(e=>e.kind==='sdh' && |e.path−20|≤1)` · `click('tb-dac'); setProbe({x: h.x + 10·tan60})`
2. choice '80 %가 아닌 74 %(또는 86 %)로 읽힘. 조치는? / It reads 74 % (or 86 %), not 80 %. Action?' · [reset-rescan ✓ '기준 감도를 다시 맞추고 그 사이 주사한 부분을 재주사 (ISO 17640: > 4 dB 차이 시)', ignore '무시', note-only '기록만', reject-all '전부 불합격']
3. '기준 감도 복원 / Restore the reference' · `|R.peakPct−80|≤2 && gain===S.instrument.refGain` · `setInstrument({gain: refGain})`
4. numeric '드리프트(dB)? / Drift in dB' · answer `ctx => memo.driftDb` (set by setup) tol 1
5. choice '허용 드리프트 한계는? / Tolerated drift before re-scanning' · [4 ✓ '4 dB', 1 '1 dB', 10 '10 dB', any '무제한']

### 4.1.2 Outlines of the remaining lessons (same style; authors expand to ≥ 5 steps each)
- **L2 Basic UT controls** (weld PIPE 6 in WT 20, 0° x 40, USK7, range 88.5): 1 RANGE until four backwalls fit (`range≥85 && ≥4 backwall`); 2 X-SHIFT 1st echo to div 2 (`|xDiv−2|≤0.2`); 3 AMP → 80 % (`|peakPct−80|≤3`); 4 SUPPRESSION 20 % (`reject===20`); 5 choice 'reject의 부작용은?' [linearity ✓ '진폭 직선성 상실', none, gain, range]; 6 numeric '벽두께?' 20 ± 0.5.
- **L6 V2** (v2 wide, 45° x 60 side +1, range 100): 1 side +1 echoes 25/100/175 (`E` paths ±1); 2 side −1 → 50/125/200; 3 index check at the max (`|x − xR25max|≤1`); 4 numeric '반경 차이(mm)?' 25 ± 1; 5 choice 'V2 블록의 용도는?' [index-angle-range ✓, sens, vel, reso]; 6 5 mm hole angle check (`sdh ampPct≥40`).
- **L8 TKY** (tky brace 60°, chord probe x +35): 1 ADJUST MODE slider to 50° (`S.tky.angle===50`); 2 `Load Def` toe LOF (`defects.some(type lof)`); 3 maximise it (`E.some(kind defect ampPct≥40)`); 4 `click('tb-45')`; 5 choice '브레이스 측에서 주사해야 하는 이유?' [geometry ✓ '코드 측에서 접근 불가한 융합면', gain, easier, rule]; 6 numeric '브레이스 각도?' from setup ± 2.
- **L10 Drawing Defects II** (weld plate 20, editor open, brush 26): 1 paint a root crack (`defects.some(brush && yMax≥19)`); 2 LENGTH 30 / SEPARATION 20 (`zTo−zFrom===30`); 3 APPLY TO ALL, OK (`editing.defect===false`); 4 scan along z (`memo.ui.drag≥1 && |z − zc|≤5`); 5 choice '루트 균열의 전형적 에코는?' [corner ✓ '코너 에코 (0.5 스킵, 강함)', tip, weak, none]; 6 numeric '코너 에코 빔 노정(mm)?' 40 ± 1.5.
- **L11 EPOCH** (weld plate 20, EPOCH 600, 60°, root-crack preset): 1 Gain softkey + arrows to 36 (`gain===36 && memo.ui.softkey.includes('gain')`); 2 RANGE key → 100; 3 GATES → G1 start 30 width 20 (`gates[0]`); 4 PEAK MEM sweep (transition: `peakMem && memo.ui.drag≥1`); 5 Freeze (`freeze===true`); 6 choice '피크 메모리의 용도는?' [echodynamic ✓ '에코 다이내믹 포락선/최대치 기록', gain, range, cal]; 7 numeric 'G1 최대 %?' `R.peakPct` ± 5.
- **L14 Shear & compression** (weld plate 20, 60°): 1 open `Probes ▸ Adjust Angle in Wedge (Shoe)` (`memo.ui.win.includes('wedge')`); 2 wedge 20° → mode comp (`derived.mode==='comp'`); 3 wedge 33° → both; 4 wedge 60° → shear 70-ish; 5 numeric '1차 임계각(°)?' 27.7 ± 0.5; 6 numeric '2차 임계각(°)?' 57.7 ± 0.5; 7 choice '2차 임계각 이상에서 생기는 파는?' [surface ✓ '표면파', shear, comp, none].
- **L15 UTman software** (as 1 with PIPE on): 1 `tb-pipe` on (`weldOpts.pipe`); 2 3-D window open (`memo.ui.win.includes('pipe3d')`); 3 Options ▸ UT Set → EPOCH 4 (`utSet==='epoch4'`); 4 back to EPOCH 600; 5 language toggle KO (`i18n.lang==='ko'`, via 'ui' menu); 6 choice '파이프 용접 주사에서 달라지는 것은?' [curvature ✓ '곡률에 따른 접촉·스킵 거리', nothing, gain, freq]; 7 numeric '외경(mm)?' 168.3 ± 0.1.
- **L16 Drawing Defects I** (pipe 6 in, editor, circle view): 1 drag on the ring From 76 To 143 (`defects[0].zFrom≈76 && zTo≈143 ±3`); 2 Delete Defect 1 (`defects.length===0`); 3 Save Def (`memo.ui.win.includes('export-defects')`); 4 Load Def (`defects.length≥1`); 5 numeric '결함 길이(mm)?' 67 ± 3; 6 choice '원주 위치 기준(datum)은?' [z0 ✓ 'z = 0 표시(12시)', probe, weld, any].
- **L18 AUT** (pipe, 60° x 40, gates start 30 width 11 level 21): 1 Gates Same (`aut.gates[1]` equals `[0]`); 2 Run (`aut.scan!==null`); 3 Stop; 4 Rev Map (`aut.revMap`); 5 numeric '지시 z 시작(mm)?' from the strip ± 5; 6 choice 'AUT 채널을 여러 개 쓰는 이유?' [zones ✓ '두께 방향 구역별 커버리지', speed, gain, none].
- **L22 UTman600** (as 11): 1 page 2 (`instrument.page===2`); 2 G2 on (`gates[1].on`); 3 2ND F + dB stores refGain (`refGain===gain`); 4 Auto Cal softkey (`autocal.stage===1`); 5 cancel (`stage===0`); 6 choice '기준 게인 저장의 목적은?' [return ✓ '주사 후 기준 감도로 정확히 복귀', louder, cal, none]; 7 numeric '기준 게인(dB)?' `refGain` ± 0.

### 4.2 T2 — trade test v2 (84-trade, NEW)
```js
UT.trade = { configure({difficulty, timeLimitMin, specimen:'auto'|…, procedureId, probes /* libId[] | undefined; rejected (returns false, no throw) when a procedure's allowedProbes() excludes any id */}) → boolean, start(seed), submit(rows), reveal(code?),
  newTest(), truth(), history(), report({withTruth}) → HTML, printReport(), coverage(), coverageMap(), addRowFromReadout(),
  verifyResult(token) → {ok, score, name, seed, fail} | {ok:false}, tick(seconds) /* test clock */, _now() /* injectable */,
  practice: { start(seed), hint(), revealOne(), checkRow(i) }, window, scoreboard, reportWindow, practiceWindow, css }
```
- **Difficulty table** (`configure({difficulty})` sets `timeLimitMin` to the table value unless `timeLimitMin` is passed explicitly):

| difficulty | defects | min size | length | specimen | preps | material | extras | time |
|---|---|---|---|---|---|---|---|---|
| basic | 3 | planar height ≥ 4 mm, volumetric ⌀ ≥ 4 mm | 25…45 | plate 20 | single-v | carbon | — | 60 min |
| intermediate | 4–6 | height/⌀ ≥ 2 mm | 15…45 | plate 12–30 or pipe 6/8 in | single-v, double-v | carbon | — | 60 min |
| advanced | 5–8 | incl. 1–2 × ⌀ 1–2 mm porosity/slag | 15…45 | plate 12–30 or pipe 6/8 in | single-v, double-v, single-bevel | carbon or austenitic | one geometry trap (root bead or cap), one mode-conversion trap (30°-inclined LOF), `transferLossDb` random 0…6, HIDE + BEAM off enforced | 30 min |

- **Seeded geometry**: `start(seed)`: `rng = UT.math.rng(seed)`; draws specimen options first (T, pipe/od/wt, material,
  prep, transferLossDb) when `specimen:'auto'`, calls `UT.set({weldOpts, material}, {noRender:true})` then
  `UT.modes.enter('trade', {keepProbe:true, silentUI})`, then draws defects from the SAME rng. `newTest()` = `start(undefined)`.
- **Recordability filter**: after generation, for each truth defect the generator traces the allowed probes (procedure
  list or 45/60/70 both sides) over `x` in 2 mm steps at `z = zc` and records `truth[i].bestDb` (vs reference sensitivity at
  refGain 34); defects with `bestDb < −14` (20 % DAC) are flagged `truth[i].recordable = false`: excluded from the score
  mean, never counted as misses, and a row matching them is not a false call. The reveal table shows them greyed as
  "below recording level". `truth()` rows carry `{n, zFrom, zTo, length, depth /* yMin */, yMin, yMax, height, type, x, side, recordable, bestDb}`.
- **Report row v2** = `{n, z, length, depth /* to TOP of indication */, height, type, ampDb /* dB vs reference, optional */,
  angle, side, disposition, tAddedSec}`; the window has a *Take from readout* button (`addRowFromReadout()`) that fills
  depth = `readouts.primary.dp`, ampDb, angle, side from the current frame. Type dropdown lists
  `planar | crack | lack of fusion | incomplete penetration | volumetric | porosity | slag | lamination` (KO labels from `defectPresetNames`).
- **Matching** (one-to-one): rows and recordable truth defects are paired greedily by descending overlap score
  `ov = overlapLen / max(truthLen, rowLen)`; a pair is a detection when `ov ≥ 0.3` OR (`rowLen ≤ 15` AND `|zc_row − zc_truth| ≤ 10`)
  (zc = centre; pipe: circular distance). Each truth defect and each row may be used once. Unmatched rows are a
  **duplicate** (overlaps an already matched defect or a non-recordable one: no penalty, 0 points) or a **false call** (−15;
  v1 rule 'row matched to no truth defect', was −10 in v1 — V1 #13 unaffected).
- **Scoring**: score = mean over recordable truth defects of per-defect points − 15·falseCalls, clamp 0…100. Per defect
  (100): detection D, type 15, length 15, depth 15, height H, where (D, H) = basic (55, 0), intermediate (45, 10), advanced
  (40, 15). Length: full when `|Δ| ≤ max(5, 20 %)`, half up to `max(10, 40 %)`. Depth: full when `depthRow ∈ [yMin − 3, yMax + 3]`,
  half when within ±6 of that interval. Height: full `|Δ| ≤ 2`, half `≤ 4`; a row whose `height` is absent/NaN receives the
  height points when detected (in EVERY difficulty — this keeps the V1 #13 invariant and V2-15; advanced only raises H's weight). Type: full when `cat(rowType) === cat(truthType) && sub matches`,
  half when only the category matches, with `cat ∈ {planar, volumetric, lamination}`, planar = {planar, crack, lof, root,
  incompletePenetration, toeCrack, centrelineCrack, backingLof, toeCrackFillet}, volumetric = {volumetric, porosity, slag}
  (a row type 'planar'/'volumetric' with a matching category gets full points). Disposition bonus +10 (capped at 100) only
  when the candidate also gives `ampDb` and the disposition matches `UT.standards.evaluate` for the active procedure.
  **Pass mark 70 %.** **Critical miss**: in intermediate/advanced, an undetected recordable truth defect of type
  crack/lof/incompletePenetration (any planar sub-type except 'planar') with height ≥ 3 mm sets `result.fail = true` and the
  report prints FAIL (critical miss) next to the score. Worked example (V2-15): lengths ×2 with everything else correct →
  Δ = L ≥ 15 > 2·tol → length 0 → 85 per defect → score 85; lengths ×1.2 → Δ = 0.2L ≤ 20 % → 100.
  **Invariant (V1 #13, kept)**: in every difficulty, submitting `truth().map(t => ({n, z: t.zFrom, length: t.zTo − t.zFrom, depth: t.depth, type: t.type}))`
  scores exactly 100 (depth = yMin lies in the interval; type equal; height absent → full; no false calls).
- **Timer**: `configure({timeLimitMin})` accepts fractions (min 0.05); the timer uses `Date.now()` via an injectable clock
  `UT.trade._now`; `UT.test.trade.tick(seconds)` advances a virtual offset and runs the timer callback synchronously
  (auto-submit at 0 → `revealed` per `exam.revealOnSubmit`, default true outside exams). `aria-live` announcements at 10, 5, 1 min and 0.
- **History** (last 30): `{date, seed, difficulty, kind:'trade'|'practice', score, fail, timeUsedSec, specimen:{T, pipe, od}, coverageA, coverageB, compliance, perDefect:[{n, found, tFoundSec /* tAdded of the matched row */}]}`;
  scoreboard shows best per difficulty, mean time-to-first-detection, practice results listed separately, JSON copy.
- **Procedure compliance** line (diagnostic 0…10, printed in the report, not in the score): DAC/reference recorded on the
  block of the same T (+4), refGain stored (+2), coverage ≥ 80 % both sides (+4).
- Windows: `trade` (v1 layout + difficulty, timer, per-defect breakdown after submit, `Take from readout`, `Row+`),
  `scoreboard`, `report`, `practice`. 80 no longer creates `trade`.

#### 4.2.1 Coverage tracker (84, data from `'render'`, module buffer)
While `trade.active` (and in Random practice), every render bins the probe into `cov[side][angle][zBin]` (zBin = 5 mm,
side ±1, angle ∈ allowed set) when `probe.x` (distance from weld centre on that side) lies within
`[0.5·T·tanθ, 2·T·tanθ] + capWidth/2` (half- to full-skip band). `coverage() → {sideA, sideB, perAngle:{45,60,70}, map: Uint8Array}`
where sideA = fraction of zBins covered by ≥ 1 angle on side +1 (sideB: side −1). Plan view (62) draws the covered bins as a
faint green band per side while the test runs (also in HIDE). Report and scoreboard print coverage %; no score effect, but
the report flags "Side B not scanned" when < 50 %. `state.trade.coverage` is written only on submit.

#### 4.2.2 Report template (print + `report()` HTML, KO/EN labels)
Job/Exam title · candidate name · date/time · standard, acceptance level, testing level · procedure id · specimen (material,
prep, T/OD/WT, datum = z 0 mark, surfaces A/B) · probes used (libId, angle, freq, crystal size, wedge angle from `derived`) ·
calibration block (V1/V2/DAC/FBH, T) · reference level (dB, reflector) · scanning sensitivity (ref + x dB) · transfer
correction dB · couplant (text, default 'gel') · surface condition (text) · indication table
[No | z from datum | x from weld CL | length | depth to top | height | max amp (% DAC / dB vs ref) | angle & side | classification | disposition]
· coverage A/B % · procedure compliance · remarks · signature line · score section (after the tables; truth table only with
`withTruth:true`). `report({withTruth:false})` never requires reveal. `printReport()` renders into `div#print-root` appended to
`document.body` (outside `#app`), then `window.print()`; style.css: `#print-root{display:none} @media print { #app{display:none!important} #print-root{display:block} }`;
`#print-root` is emptied on `afterprint`. AUT strip-chart snapshot included when AUT was used.

#### 4.2.3 Exam sharing (with U3)
An exam URL contains **NO defects**: `exam = {v:2, seed, difficulty, timeLimitMin, procedureId, specimen…, codeHash:
fnv1a(code + ':' + seed).toString(16), revealOnSubmit: bool, title, nameRequired: bool}`; the truth is regenerated from `seed` by
`UT.trade.start(seed)` on load. While `exam.locked && !trade.revealed`: `UT.test.trade.truth()` returns `[]`,
`UT.test.state()`/`scenario.capture()`/Defects ▸ Export omit `defects`, the defect editor and HIDE/BEAM are locked,
`display.hide` is forced. `reveal(code)` requires the code (4–8 chars; wrong code → returns false, `display.hide` stays true);
when `revealOnSubmit` is false the truth is never drawn — only the score. After Submit the report shows a **result token**
`rt:<base64url(JSON {seed, difficulty, score, fail, timeUsedSec, date, name, sig})>` with `sig = fnv1a(JSON-without-sig + ':' + codeHash)`;
the instructor pastes it into Scoreboard ▸ Verify result (`verifyResult(token)` checks `sig` and lists the candidate).
The Share dialog for exams asks: title, candidate name required (y/n), code, reveal on submit, time limit. Help ▸ Standards
notes states plainly that this is obfuscation for classroom use, not security (devtools can still reach the generator).

### 4.3 T3 — standards evaluation (45-standards)
- `UT.standards.evaluate({ruleId, level, T, probeAngle, indication:{ampDbVsRef, lengthMm, type, soundPath, depth}}) →
  {disposition:'not-recordable'|'accept'|'reject'|'n/a', recordable:boolean, class /* 'A'..'D' AWS, 'short'|'long' ISO */, pct, ruleText, ruleTextKo, numbers}`.
  `'record'` is accepted as an **alias** in callers/tests meaning `recordable && disposition === 'accept'` (evaluate never
  returns it). Common semantics: dB values are relative to the reference echo (DAC/DGS/IIW hole) at the SAME gain;
  `pct = round(100·10^(ampDbVsRef/20))`; `standards.transferDb` is added to `ampDbVsRef` before evaluation.
- `lengthMethod` per rule (`'eval-level' | '6dB' | '50pct'`) is shown and pre-selected by the sizing window (§4.4); the labels come
  from ONE shared table in 45: `UT.standards.lengthMethodNames = { 'eval-level': {ko:'평가 레벨 고정법', en:'fixed evaluation level'}, '6dB': {ko:'6 dB 강하법', en:'6 dB drop'}, '50pct': {ko:'50 % 진폭법 (ASME)', en:'50 % amplitude (ASME)'} }`.
- Rule sets (`UT.standards.rules`, editable copy in `standards.rulesOverride`; every set carries
  `note: 'Illustrative transcription — verify against the current edition'`). **Verbatim data (NDT critic):**

```js
// A) ISO 17640:2017 — confidence HIGH on structure, technique/reference reflectors, quality-level mapping, transfer
//    correction; MEDIUM on coverage per level. The evaluation level does NOT depend on the testing level (A–D define coverage).
iso17640: { id:'iso17640', reference:'ISO 17640:2017', lengthMethod:'eval-level',
  qualityToTestingLevel:{ 'ISO5817-B':'B', 'ISO5817-C':'A' }, // Table 1; level C/D by agreement
  testingLevels:{ A:{angles:1, sides:'both', surfaces:1, straightBeam:false},
                  B:{angles:2 /* ≥10° apart, e.g. 45+60 or 60+70 */, sides:'both', surfaces:1, straightBeam:true /* 0° scan of scanning zone for laminations */},
                  C:{angles:2, sides:'both', surfaces:2, straightBeam:true, tandemForVertical:true},
                  D:{custom:true} },
  techniques:{ 1:{ref:'DAC, 3 mm SDH, 8≤t≤100', evaluationDb:-10},
               2:{ref:'DGS DSR', dsrMm:{ '1.5-2.5MHz':[[8,15,1.5],[15,40,2.0],[40,100,3.0]], '3-5MHz':[[8,15,1.0],[15,40,1.5],[40,100,2.0]] }, evaluationDb:-10},
               3:{ref:'rectangular notch 1 mm deep (thin welds only)', evaluationDb:-6 /* LOW confidence; not needed by the sim */},
               4:{ref:'DSR 6 mm, tandem', evaluationDb:-10 /* LOW confidence */} },
  transferCorrection:{ ignoreBelowDb:2, compensateUpToDb:12, investigateAboveDb:12 }, // HIGH confidence
  scanningGainAboveRefDb:6 /* MEDIUM */,
  sensitivityRecheckDb:4 /* re-scan when the reference drifted by more than this (lesson 25) — MEDIUM */ },

// B) ISO 11666:2018 — confidence HIGH: AL2↔quality B, AL3↔quality C, no AL1; AL2 = −4 dB (short) / −10 dB (long),
//    short = l ≤ 0.5t (min 10 mm), evaluation level −10 dB (33 % DAC). AL3: LEAD DECISION = +4 dB (short, l ≤ 1.0t, min 10) /
//    −2 dB (long), evaluation −6 dB, confidence 'medium — verify' (alternative if disproved: 0 / −6 dB, evaluation −6 dB).
iso11666: { id:'iso11666', reference:'ISO 11666:2018 Tables 2-4', tMm:[8,100], refReflector:'as iso17640 techniques 1/2', lengthMethod:'eval-level',
  levels:{ AL2:{ quality:'B', evaluationDb:-10, recordingDb:-10, shortMaxMm:(t)=>Math.max(10, 0.5*t), shortLimitDb:-4, longLimitDb:-10, confidence:'high' },
           AL3:{ quality:'C', evaluationDb:-6,  recordingDb:-6,  shortMaxMm:(t)=>Math.max(10, 1.0*t), shortLimitDb:+4, longLimitDb:-2, confidence:'medium — verify' } },
  planarReject:['crack','lof','ip'] /* characterisation per ISO 23279 is optional in 11666 — sim rule, labelled */ }
// Rule: amp < evaluationDb → 'not-recordable'; else L ≤ shortMax ? (amp ≤ shortLimitDb ? accept : reject)
//       : (amp ≤ longLimitDb ? accept : reject); equality accepted. Lengths measured with the fixed-level technique at the evaluation level.

// C) ASME VIII-1 Mandatory App. 12 §12-3 + ASME V Art. 4 — confidence HIGH
asme8: { id:'asme8', reference:'ASME BPVC VIII-1 App.12 (12-3), ASME V Art.4', recordPct:20, // 'investigate all indications > 20 % of reference'
  lengthMethod:'50pct',
  rejectAmp:'> 100 % DAC (ampDbVsRef > 0)', rejectLengthMm:(t)=> t <= 19 ? 6 : (t <= 57 ? t/3 : 19), // 1/4 in | t/3 | 3/4 in; strict '>' on both
  planarReject:['crack','lof','ip'], tDefinition:'weld thickness excluding reinforcement; thinner member for unequal t',
  calibration:{ block:'ASME V T-434.2.1 basic block', sdhDiaMm:(t)=> t<=25 ? 2.4 : (t<=50 ? 3.0 : (t<=100 ? 5.0 : 6.4)), holesAt:['T/4','T/2','3T/4'], scanningGainAboveRefDb:6 } }
// Compare in percent (pct ≥ 20) so that a −14 dB echo (19.95 %) counts as 20 %/recordable, matching the v1 '−14 dB = 20 %' curve.
// dacBlock must be built with sdh:2.4 by the 'asme-pipe-6in' procedure.

// D) AWS D1.1:2020 Table 8.2 (= Table 6.3 in D1.1:2010), statically loaded nontubular — confidence MEDIUM-HIGH (~75 %) on the numbers,
//    HIGH on structure/rating/attenuation/length rules
awsd11: { id:'awsd11', reference:'AWS D1.1/D1.1M Table 8.2 (6.3 in :2010) — statically loaded', refReflector:'0.06 in (1.5 mm) SDH, IIW block (sim: v1 block hole at (135,15))',
  lengthMethod:'6dB',
  rating:(ampDbVsRef, soundPathMm)=>{ const spIn = soundPathMm/25.4; const c = spIn > 1 ? Math.round(2*(spIn-1)) : 0; /* 2 dB per inch beyond 1 in, rounded to nearest dB, .5 up */ return -ampDbVsRef - c; }, // d = a − b − c with a − b = −ampDbVsRef (louder indication ⇒ less gain ⇒ lower rating)
  bandsMm:[[8,20],[20,38],[38,65],[65,100],[100,200]], // 5/16–3/4, >3/4–1½, >1½–2½, >2½–4, >4–8 in
  bandOf:(t)=> t < 8 || t > 200 ? -1 : (t <= 20 ? 0 : (t <= 38 ? 1 : (t <= 65 ? 2 : (t <= 100 ? 3 : 4)))), // band 0 = 8 ≤ t ≤ 20; bands ≥ 1 use lo < t ≤ hi; −1 → 'n/a'
  table:{ // A: d ≤ value; B/C: d in [lo,hi]; D: d ≥ value
    0:{70:{A:5,B:[6,6],C:[7,7],D:8}},
    1:{70:{A:2,B:[3,3],C:[4,4],D:5}, 60:{A:7,B:[8,8],C:[9,9],D:10}, 45:{A:9,B:[10,10],C:[11,11],D:12}},
    2:{70:{A:-2,B:[-1,0],C:[1,2],D:3}, 60:{A:3,B:[4,5],C:[6,7],D:8}, 45:{A:5,B:[6,7],C:[8,9],D:10}},
    3:{70:{A:-5,B:[-4,-3],C:[-2,-1],D:0}, 60:{A:0,B:[1,2],C:[3,4],D:5}, 45:{A:2,B:[3,4],C:[5,6],D:7}},
    4:{70:{A:-7,B:[-6,-5],C:[-4,-3],D:-2}, 60:{A:-2,B:[-1,0],C:[1,2],D:3}, 45:{A:0,B:[1,2],C:[3,4],D:5}} },
  classRules:{ A:'reject regardless of length', B:'reject if L > 19 mm (3/4 in)', C:'reject if L > 50 mm (2 in) in the middle half of t, or > 19 mm in the top or bottom quarter (use dp < t/4 or dp > 3t/4)', D:'accept regardless' },
  scanningLevelsDb:[[0,64,14],[64,127,19],[127,254,29],[254,381,39]] /* sound path mm → gain above reference (Table 8.4) */ }
// For t ≤ 3/4 in only 70° is listed; evaluate() returns disposition 'n/a' (with ruleText) for 45°/60° in band 0.
// The B/C isolation (spacing) rule is omitted — say so in ruleText.
```
- Window `evaluation`: standard/level selectors, thickness (from specimen), reference (DAC/DGS/notch with
  `standards.transferDb`), a table of indications (from the trade report or `Add row` / `Add from readout`), disposition
  column plus an expandable **`Why?` cell** (button, `aria-expanded`) that prints `ruleText/ruleTextKo` and the numbers used
  (e.g. `ref −10 dB = 32 % → recorded; len 12 > 0.5·t = 10 → limit ref −10 dB; amp −6 dB > −10 → REJECT`); `Evaluate all`
  writes `standards.lastEval = {ruleId, level, T, rows:[{indication, result}]}`. Window `stdnotes` (Help ▸ Standards notes,
  owner 45) lists every rule set with its confidence notes, the mode-conversion fit note and the exam-lock note.
- **T4 procedures** (`UT.standards.procedures`, `applyProcedure(id)` writes `standards.procedure`, `standards.standard/level/testingLevel`,
  `weldOpts.T` (DAC block), `instrument.{gain, refGain, range}` defaults and `standards.transferDb` in ONE `UT.set`):
  - `iso-B-plate20`: `{standard:'iso11666', level:'AL2', testingLevel:'B', probes:['mwb45-4','mwb60-4','mwb70-4','mb4s'] /* any two angles ≥ 10° apart + 0° */, surfaces:'both sides, one surface', refBlock:'dac', refSdhMm:3, refReflector:'3 mm SDH (technique 1) / DSR 1.5 mm at 4 MHz (technique 2)', transferDb:0 /* 2–12 dB compensated */, scanningGainAboveRefDb:6}`
  - `asme-pipe-6in` (WT 20): `{standard:'asme8', refBlock:'dac', refSdhMm:2.4 /* T/4, T/2, 3T/4 */, probes:['gen-45-5-10','gen-60-5-10','gen-0-5-10'], scanningGainAboveRefDb:6, recordPct:20}`
  - `aws-d11-70` (t ≤ 20): `{standard:'awsd11', refBlock:'iiw' /* v1 block, 1.5 mm hole at (135,15) */, probes:['gen-70-5-10','mwb70-2'], notes:'AWS requires 2–2.5 MHz, 15–25 mm crystals for the standard procedure', scanningLevel:'ref + 14 dB for SP ≤ 64 mm'}`
  - `UT.standards.allowedProbes(state) → string[] | null` (null = unrestricted) derived from `standards.procedure`;
    enforcement: 90 disables toolbar angle buttons/library rows whose `libId` is not allowed while `state.trade.active`;
    84's `configure` rejects disallowed probes; 40's `testSetProbe` ignores the lock (test API stays free).

### 4.4 T6 — sizing v2 (66)
Sizing window methods (`sizing.method` ∈ '6dB' | '20dB' | 'max' | 'eval' | 'tip'); marks L/R taken at probe positions
(`UT.views.sizing.markL()/markR()/setMethod(m)`), `sizing.result = {method, length, height, warning}`:
- **6 dB drop** (z): `L = zR − zL` (v1 z-overlap exponent changes to `Z = clamp(overlap/(2·hz), 0, 1)` for planar/lamination
  defects so the −6 dB points fall exactly at the ends; volumetric clusters keep `^0.5`). Warning when `L < 2·wz6`:
  "6 dB drop under-sizes reflectors smaller than the beam (width here ≈ 2·wz6 mm)", `wz6 = path·tan(asin(0.51λ/crystalB)) + crystalB/2`.
- **20 dB drop** (z): `L = (zR − zL) − 2·wz20(path)`, `wz20 = path·tan(asin(0.87λ/crystalB)) + crystalB/2` (= `hz`); for
  `path < nearField` use `wz20 = crystalB/2`. 20 dB drop along x (plotter through-wall extent): edge ray projection
  `x_edge = x_probe − side·depth·tan(θ ± halfAngle20dB)` (− near end, + far end).
- **Max amplitude** (echo-dynamic ends): `L = zR − zL` where the marks are the last positions with `peak ≥ maxPeak·0.8` moving outward.
- **Fixed evaluation level** (`'eval'`, ISO 11666/17640): marks where `peakPct < refPct·10^(evaluationDb/20)`; `L = zR − zL`, no beam-width correction.
- **Tip diffraction height**: `h = |path_tip1 − path_tip2|·cosθ` using the two echoes of kind `tip` in the gate (window lists them).
- The window shows the method recommended by `standards.standard` (`rules[id].lengthMethod`) and pre-selects it
  (`6 dB drop (AWS)`, `Evaluation-level drop (ISO 11666: mark where amp < ref −10 dB)`, `50 % DAC (ASME)` → 'eval' with −6 dB).
  Results table with measured vs true (after reveal). Echo-dynamic hint (§3.12). Touch bar gets `Mark L/R` while open.

### 4.5 T7 — echo-identification quiz (82-lessons, window `quiz`, menu Help ▸ Echo quiz…)
`UT.lessons.quiz = {start({n:10, seed, difficulty}), answer(id), answerAction(id), skip(), state() → {i, n, correct, wrong, times[]}, css}`.
Generator (seeded `UT.math.rng`): pick a scenario from {plate 20 with root bead, plate with cap, root crack, LOF 30° inclined
(mode-conv trap, 45° probe), 70° with cap toe (surface wave), lamination plate, dac SDH, v1 backwall multiples,
single-v-backing bar edge}, a probe/position that maximises one echo, gate it, HIDE on and BEAM off; question
'게이트 안의 에코는 무엇입니까? / What is the gated echo?' with 4 buttons drawn from the label set {backwall 저면 에코,
geometry-root 이면 비드(형상), geometry-cap 덧살(형상), geometry-backing 배킹 바 에지, corner 코너 에코(루트 결함), tip 팁 회절,
defect 결함(융합면), modeconv 모드 변환 에코, surface 표면파, lamination 라미네이션, sdh 횡공}; correct =
`UT.rays.describe(frame.readouts.primary).category` (30 adds `describe().category` returning one of those ids — owner physics-1).
After answering, BEAM/HIDE are restored and the ray path is highlighted with the description text (KO/EN). Second question
per item: '조치? / Action?' [record 기록, geometry-note 형상 에코로 메모, ignore 무시] — correct = 'geometry-note' for geometry
kinds (backwall, geometry-*, sdh, surface, modeconv), 'record' for defect kinds (corner, tip, defect, lamination). Score and
mean time per item go to `lessons.progress.quiz = {best, attempts}`; state in `state.quiz` (§2). Same seed → same sequence.

### 4.6 T5 — random practice (84)
`Defects ▸ Random practice…` → same generator, no timer/lock, reveal anytime, `trade.practice = true`; window `practice` adds
**Hint** (costs 5 % of the practice score; prints the z-distance and side of the nearest undetected recordable defect:
"nearest hidden indication: 38 mm further along z, side B"), **Reveal one** (reveals the nearest defect only, marks it
non-scoring in `trade.revealedOne`), **Check row** (immediate ✓/✗ for the selected row's detection only — no sizing
feedback). Practice results go to history with `kind:'practice'`.

---

## 5. Fidelity and UI v2

### 5.1 F1 — weld preparations (10-specimens frozen/done; 60/64 drawing)
`weldOpts.prep` (enum for dialogs/validation: `['single-v','double-v','single-bevel','j','single-v-backing','fillet-t','nozzle','none']`,
labels from `UT.specimens.prepNames`): `single-v` (v1), `double-v` (v1), `single-bevel` (K: left face vertical, right bevel
45°, root face 2), `j` (left vertical, right J: 10° bevel + 8 mm radius, root face 2), `single-v-backing` (single-V, root
gap 6, backing bar 25 × 6 mm centred under the root, no root bead; the bar's lower face and ends are outline edges tagged
`backing` → geometry echoes at the bar edges; `weldOpts.backing === true` with prep 'single-v' also selects it), `fillet-t`
(set-on T-joint: base plate T with a vertical web `webT` thick centred at x = 0 rising 60 mm, fillet welds both sides,
leg = 0.7·webT, `weld.regions` = two polygons, fillet cap edges tagged `cap`, unfused web/plate interface in
`spec.reflectors` tag `interface`; probe on the base plate or on the web via `probe.surface:'web'` — `scanSurfaceAt` handles
it like 'brace'), `nozzle` (set-on branch on a pipe: cross-section = fillet-t with `webT = branch wt`, 3-D nozzle in 64).
Builders: `prep` wins over the legacy `type`; a UI that sets `prep` mirrors it into `type`. `weldGeometry` returns
`fusionFaces[{a, b, side, tag}]`, `region`, `regions`, `cap/root`, `backing`, `web` polygons; presets `lof` pick the face by
side; presets `backingLof` (planar along the bar top) and `toeCrackFillet`. Weld dialog: prep dropdown with a small SVG icon per prep.

### 5.2 F2/F3/F4
- F2 in §3.7 (`UT.instruments.auto(pct)`, `storeRef()`, `wheel(±n)`, datalog, compare).
- F3: `display.sound` → `UT.audio.beep()` (core: lazy `AudioContext`, 880 Hz, 60 ms, gain 0.1). **90**: when `display.sound`
  turns on, attach a one-time `pointerdown`/`keydown` listener on `document` that calls `UT.audio.unlock()`. **70** keeps a
  module-level `alarmWas[]`; on every `'render'`, for each gate i with `gates[i].alarm && gates[i].on`,
  `now = !!frame.readouts.gate[i]`; if `now && !alarmWas[i]` → `UT.audio.beep()`; `alarmWas[i] = now`. No AudioContext while sound is off.
- F4: plan view TOFD pair = one small green 24 × 16 mm box centred between the probes with two dots. `Probes ▸ Focus Beam…` → §3.6 dialog.

### 5.3 U1 — Korean (92-i18n-ko + all UI owners)
1. **Single dictionary owner: 92.** 90 deletes its `KO` table and the boot-time `add` (lead moves the existing entries into
   92); core's small built-in `ko` map stays as fallback. ≥ 400 entries, glossary data `UT.i18nKo.glossary` (≥ 60 terms), tour steps.
2. `t()` is called at RENDER time only — module-level tables hold English KEYS (`HINTS`, tooltips, lesson titles, softkey
   labels) and are translated where they are put into the DOM. Templates instead of concatenation:
   `t('Time left {t}', {t})`, never `'Time left ' + clock`.
3. Every user-visible DOM text node is created with `h(tag, {dataset:{i18n: key}}, t(key, params))` — or, for plain labels
   without params, with the shorthand `h(tag, {i18n: key})` (DONE by the lead in core: sets `data-i18n` + `data-i18n-auto` and
   `textContent = t(key)`; `dom.button(label)`, `dom.field(label)` and `dom.win({title: key})`/`setTitle(key)` use it automatically,
   and core relabels every `[data-i18n-auto]` element on `'lang'`). Elements whose text used params must be re-rendered by their
   owner on `'lang'`. Canvases are out of scope. Menu `data-key`s stay English.
4. `UT.test.untranslated()` (92) = for `UT.i18n.lang === 'ko'`, the unique `dataset.i18n` keys of all `[data-i18n]` elements
   currently in the document for which `UT.i18n.has(key)` is false, excluding keys matching
   `/^[\d\s.,:%°+\-/×~()a-zA-Z]{0,3}$/` or `/^[\d\s.,%°:+\-/()µ]+$/`, product names (EPOCH, USK7, IIW, TOFD, DAC, AUT, PA, ASME,
   ISO, AWS), `.no-i18n` subtrees, `#statusbar .sb-left` (physics status line) and probe library `name` strings.
5. `UT.test.lang(code)` lives in 90 (`UT.app.setLang`). On `'lang'` every window owner calls `win.setContent(build())`;
   82/84/45/56/66/70/94 must subscribe; menus/toolbar/status re-render.
6. **Terminology rules** (KS B 0817 / industry usage; binding for lessons, windows, glossary): reference level/sensitivity =
   기준 감도 (the dB value may be shown as '기준 게인 34 dB' on the EPOCH readout only); gain control = 게인(이득); echo
   amplitude in % FSH = 에코 높이 (%), 진폭 only for 'amplitude' in dB-arithmetic titles; indication = 지시, discontinuity =
   불연속, defect = 결함 — lessons and the evaluation window use 지시 until a disposition is 'reject'; slag inclusion =
   슬래그 혼입; beam path = 빔 노정 (빔 진행 거리), 'SP' kept; surface distance = 표면 거리; depth = 깊이; skip = 스킵 (0.5 스킵/1 스킵);
   V1 = IIW 표준 시험편 (STB-A1), V2 = 소형 표준 시험편 (STB-A3), DAC/IOW/FBH = 대비 시험편; SDH = 횡공 (측면 드릴 구멍), FBH = 평저공;
   toe = 토우(지단); cap = 덧살(여성); root bead = 이면 비드; geometry echo = 형상 에코; spurious indication = 의사 지시; mode
   conversion = 모드 변환; surface wave = 표면파(레일리파); dead zone = 불감대; near field = 근거리 음장; range = 측정 범위(레인지);
   delay = 지연(X-시프트); reject = 리젝션(억제); gate alarm = 게이트 경보; transfer correction = 전달 손실 보정;
   recording/evaluation/reference level = 기록 레벨 / 평가 레벨 / 기준 레벨; acceptance level = 허용 수준; disposition = 판정
   (합격/불합격/기록/기록 불요); through-wall height = 높이(두께 방향 치수); scanning = 주사; couplant = 접촉 매질; attenuation =
   감쇠; 6 dB drop = 6 dB 드롭법; tip diffraction = 단부 에코법(팁 회절).

### 5.4 U2 — touch and responsive scaling (90 + views + 70)
- Views use Pointer Events (`pointerdown/move/up`, `setPointerCapture`, `touch-action: none` on canvases). Hit targets ≥ 14 mm on `(pointer: coarse)`.
- Touch bar (90, `div#touchbar`, INSIDE the design box, takes 44 px from `#main`): `◀ ▶ (x) ▲ ▼ (z) − + (gain) Range Freeze Peak Hide`
  + a `Step 1|5|10 mm` cycle button (9 buttons + step); buttons auto-repeat (400 ms delay, 12 Hz); `Mark L/R` appear while the
  sizing window is open and `Row+` while a trade/practice runs. Shown when `display.touchBar === 'on'` or (`'auto'` and coarse pointer).
- **Design box scaling**: when `display.scale === 'auto'`, 90 sets `#app.scaled { width: 1280px; height: 760px; min-width: 0;
  transform-origin: 0 0; transform: scale(k) }` with `k = clamp(min(innerW/1280, innerH/760), 0.6, 1.6)` and
  `html, body { overflow: hidden; width: 100%; height: 100% }`; `display.scale === 'fixed'` restores the v1 rules (`height: 100vh`,
  no transform, k = 1). All window arithmetic is in design px: `dom.win.show()` clamps against `#app.offsetWidth/offsetHeight`
  (lead); 90's `clampToViewport` divides every `getBoundingClientRect()` value by `UT.dom.scale()` and uses `#app.offsetWidth/Height`;
  `.win-body { max-height: calc(760px − 60px) }` under `.scaled`; views comparing bounding rects of two canvases (66 plotter
  vs `#cv-cross`) divide the delta by `UT.dom.scale()`. Playwright pointer tests compute `clientX = rect.left + xCss·k`.
  No clipping at 1024 × 640 (k = 0.8); at 1920 × 1080 k ≈ 1.42.

### 5.5 U3 — scenarios (94-scenario, NEW)
```js
UT.scenario = { capture() → obj, apply(obj), save(slot 1..5, name), load(slot), remove(slot), list(),
                toText(), fromText(text) /* sync JSON */,
                toUrl(obj?, {exam:{code, title, nameRequired, revealOnSubmit}}) → Promise<string>,   // base = location.href.split('#')[0] (works for file://)
                fromUrl(hash) → Promise<obj|null> /* null on any decode error */, window /* 'scenario' */, share /* 'share' */, css }
```
- `obj = {v:2, name, title, noteKo, noteEn /* ≤ 400 chars each */, author, lesson: n|null, lessonStep, material, weldOpts, mode,
  specimenId, specimenOpts, probe, instrument (no compare/datalog), display (subset), defects /* omitted while exam-locked */,
  standards (no lastEval), pa (no scan), tofd (no scan), aut (no scan), exam}`. On load a small toast/window shows title + note;
  `apply()` with `lesson` calls `UT.lessons.start(n)` then `goto(lessonStep)`. `Help ▸ Quick tour` step 8 mentions Share link.
- Encoding: `#scn=z:<b64url(deflate-raw(utf8(JSON)))>` when `typeof CompressionStream === 'function'` else `#scn=r:<b64url(utf8(JSON))>`;
  `b64url = btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')`, decode re-pads with `=`; both forms decoded.
- Boot (90, §15.9 step 6.5): after `renderNow()`, `if (UT.scenario && /^#scn=/.test(location.hash)) UT.scenario.fromUrl(location.hash).then(o => o && UT.scenario.apply(o))`;
  `hashchange` does the same; `#selftest` keeps its meaning. Load-time rule for 94: reference `CompressionStream/TextEncoder/btoa/atob/location`
  only inside functions; `__selftest` round-trips through the `r:` path with a local base64 fallback. Lead adds `TextEncoder,
  TextDecoder, btoa, atob, Uint8Array, URL, CompressionStream, DecompressionStream` (when defined in Node) to `tools/node-load.mjs`.
- `File ▸ Save scenario… / Load scenario… / Share link…` (window `share`: URL textarea + Copy + metadata fields + exam fields). Exam per §4.2.3.

### 5.6 U4 — glossary and tour (90 + 92)
`Help ▸ Glossary` (window `glossary`: search box, KO/EN columns), `Help ▸ Quick tour` (overlay `div#tour`, 8 steps; shown once
automatically on first boot unless `localStorage utsim.tourDone`), `Help ▸ Standards notes` (window `stdnotes`, 45).
Glossary format `{term, ko, en, defKo, defEn, see: [lessonN]}`; the first 20 entries (binding examples): Backwall echo | 저면 에코 |
'Reflection from the far surface; its loss indicates a lamination or coupling problem' | '뒷면(저면)에서의 반사. 소실되면 라미네이션이나
접촉 불량을 의심' [3,5]; Angle probe | 사각 탐촉자 | shear-wave probe with a Perspex wedge, 45/60/70° | 퍼스펙스 쐐기로 횡파를 비스듬히
입사시키는 탐촉자 [4]; Refracted angle | 굴절각 | angle of the beam in steel (Snell) | 강 내부 빔의 각도 [14]; Index point | 입사점 |
point where the beam leaves the wedge; checked on the V1 100 mm radius | 빔이 쐐기를 떠나는 점 [4,6]; Sensitivity / reference level |
감도 / 기준 감도 | gain at which the reference reflector reads the reference height | 기준 반사체가 기준 높이로 읽히는 게인 [7,20,23];
Indication | 지시 | any signal that needs interpretation – not yet a defect | 해석이 필요한 신호, 아직 결함이 아님 [21]; Dead zone |
불감대 | region under the initial pulse where nothing can be detected | 초기 펄스에 가려 탐지 불가능한 영역 [3]; Near field | 근거리 음장 |
N = a²f/(4v); amplitudes are unreliable inside it | 진폭이 불안정한 근거리 영역 [9]; Beam spread | 빔 확산 | divergence beyond the near
field; plotted at 20 dB | 근거리 음장 이후의 퍼짐 [9]; Skip | 스킵 | half skip = to the backwall, full skip = back to the surface |
0.5 스킵 = 저면까지, 1 스킵 = 다시 표면까지 [8]; DAC | 거리 진폭 보정 곡선 | curve of the reference SDH echo vs distance | 기준 횡공의
거리별 에코 높이 곡선 [20]; TCG | 시간 보정 게인 | gain vs time that flattens the DAC | DAC를 평탄하게 만드는 시간별 게인; SDH | 횡공 |
side-drilled hole reference reflector (3 mm, ISO) | 측면 드릴 구멍 기준 반사체; FBH / DGS | 평저공 / DGS 선도 | flat-bottom hole;
disc-equivalent size | 원판 등가 크기 산정; Corner echo | 코너 에코 | strong echo from a surface-breaking defect and the backwall (90°
corner) | 표면 개구 결함과 저면이 이루는 모서리 반사 [11]; Tip diffraction | 팁 회절(단부 에코) | weak echo from a crack tip; used for
height | 균열 끝에서의 약한 회절 에코, 높이 측정 [13]; Mode conversion | 모드 변환 | S↔L conversion at surfaces → spurious echoes |
표면·결함에서의 파 변환 → 의사 지시; Surface wave | 표면파 | Rayleigh wave from steep wedges; damped by a finger | 손가락으로 감쇠되는
표면 진행파; Geometry echo | 형상 에코 | root bead / cap / backing bar reflections – plot before calling a defect | 이면 비드·덧살·배킹 바
반사 – 결함 판정 전 플로팅; Transfer correction | 전달 손실 보정 | dB added for surface/attenuation differences between block and part |
시험편과 대비 시험편의 차이를 보정하는 dB [24].

### 5.7 U5 — accessibility (90, 70, 82, 84)
`role="menubar"/"menuitem"`, `aria-haspopup`, `aria-expanded`; **menu bar keyboard entry is `F10`** (or `Alt` alone released),
`Alt+<letter>` (F/P/S/W/D/T/O/H) is best-effort with `preventDefault`; arrow keys navigate, `Enter` activates, `Esc` closes;
toolbar buttons `aria-pressed`; canvases `aria-label`; `:focus-visible` outlines everywhere; `display.highContrast` adds `.hc`
on `#app`; `prefers-reduced-motion` disables scan animations (sync stepping). Lessons/trade/quiz windows contain an
`aria-live="polite"` region (step-pass, wrong answer, hint, timer at 10/5/1 min and 0, quiz feedback); choice buttons are in a
`role="group"` labelled by the step text; every canvas a lesson asks to be clicked (A-scan echo, D-scan arc) has a keyboard
alternative (choice buttons or `Tab` to the echo `<ol>` in the lessons window).

---

## 6. Engineering v2

### 6.1 E1 — acceptance runner (`tools/acceptance.mjs`, qa-1)
`NODE_PATH=… node tools/acceptance.mjs [--file …] [--json out.json] [--only v1|v2]` boots the built file with
`qa-helpers.launch`, runs every check of SPEC §11.1 (#1–#14) and every v2 check (§9), prints a table, writes JSON, exits 1
on any failure. Each check is a small async function with a name and tolerance. Timing budgets (§6.4) are relaxed ×2 when
`process.env.CI` is set.

### 6.2 E2 — CI (`.github/workflows/utsim-ci.yml`, qa-1) — exact job
`on: {push: {paths: ['ut-simulator/**', 'utman_simulator.html', '.github/workflows/utsim-ci.yml']}, pull_request: {paths: [same]}}`;
`runs-on: ubuntu-latest`; `env: {CI: 'true'}`; steps: `actions/checkout@v4`; `actions/setup-node@v4` (`node-version: 20`);
`actions/setup-python@v5` (3.x); `npm i -g playwright@1.56.0`; `echo "NODE_PATH=$(npm root -g)" >> "$GITHUB_ENV"`;
`npx --yes playwright@1.56.0 install --with-deps chromium`; `node tools/node-load.mjs --selftest` (working-directory `ut-simulator`);
`python3 build.py`; `node tools/acceptance.mjs --json acceptance.json`; `actions/upload-artifact@v4` with
`path: |\n utman_simulator.html\n docs/utman_simulator.html\n ut-simulator/acceptance.json`. Must not modify `deploy-pages.yml`.

### 6.3 E3 — Pages
`build.py` writes `../utman_simulator.html` and `../docs/utman_simulator.html` (done). Publishing is a repo-settings decision,
not a v2 code change: EITHER the maintainer sets Pages source to `main:/docs` (then `deploy-pages.yml` stays untouched), OR —
with explicit approval — `deploy-pages.yml` gains one step `cp docs/utman_simulator.html hatch-coaming-3d/dist/` before
`upload-pages-artifact`. README v2 documents which was chosen; V2-26 checks only that both files are written and identical.

### 6.4 E4 — performance targets
Measured as the mean of 20 `UT.test.compute()` calls after 5 warm-up calls, default plate + 8 defects: `fanRays 41`,
`modeConv on` → ≤ 10 ms desktop / ≤ 20 ms under `CI=true`; `fanRays 21` → ≤ 6 ms (v1 budget, must not regress). AUT sync scan
of a 24-inch pipe (C ≈ 1915 mm) ≤ 1.5 s; TOFD D-scan ≤ 0.8 s; PA S-scan (41 angles) ≤ 60 ms. 55/56/66 obtain trace options
from `UT.ascan.traceOpts(state, spec, probe)` (exported by 40; reads `state.physics.fanRays`) instead of private copies.

### 6.5 E5 — code quality
Per-file pass in the QA phase: remove dead code/duplication, JSDoc on public functions, consistent naming; no behaviour
change (acceptance runner must stay green). E6: README v2 + CHANGELOG.

---

## 7. Test API additions (`Object.assign(UT.test, …)`)
| function | owner |
|---|---|
| `setMaterial(key)` (`UT.set({material}, {noRender:true}); enter(current(), {keepProbe:true, silentUI:true})`) | 80-modes |
| `setDampers([x])`, `setPhysics({modeConv, surfaceWave, sideLobes, fanRays})`, `setFocus({on, F})`, `selectProbe(libId)`, `setInstrument({…, tcg, pulser, receiver})` (state helpers + `renderNow`) | 40-ascan |
| `directivity(thetaDeg) → one-way weight`, `fanAngles()`, `modeConv(mode, phiDeg) → {R, phiOut}`, `echoes()` rows gain `tUs, mode, lenMm` | 30-raytrace |
| `dgs(args)`, `evaluate(args)`, `applyProcedure(id)`, `rules()`, `allowedProbes()`, `standardsNotes() → string[]` | 45-standards |
| `tofd()` (events incl. `modeconv-backwall`, `modeconv-backwall-ss`, `modeconv-tip`; `deadZones`), `pcsOptimise()`, `tofdCursor({z, depth})` | 50-tofd |
| `pa = {sscan(), escan(), runScan(), focalLaw(θ, {escan})}` (namespace created by 56) | 56-pa |
| `bscan() → {n, axis, columns}`, `echodyn() → {samples, pattern}`, `sizing({method, marks}) → result` | 66 |
| `datalog()`, `autoPct()`, `auto(pct)`, `storeRef()`, `wheel(n)` | 70 |
| `lessonAutoRun(n)`, `lessonState()`, `lessonAnswer(value)`, `quiz = {start, answer, answerAction, state}` | 82 |
| `trade.{configure, history, report, coverage, tick, reveal, verifyResult, addRowFromReadout, practice}` (extends 80's shell) | 84 |
| `lang(code)` | 90 |
| `untranslated() → string[]` | 92 |
| `scenario = {capture, apply, toUrl, fromUrl, toText, fromText}` (namespace created by 94) | 94 |
`UT.test.lessons()` returns 25 titles. `UT.test.state()` omits `instrument.compare`, scans, and `defects` while exam-locked.

---

## 8. Menus v2 (90-app; English keys) and window registry
- Probes ▸ `Probe library…`, `Adjust Angle in Wedge (Shoe)`, `Zero Probe - Twin or Single Crystal ▸`, `Pulse Echo`,
  `Through Transmission`, `Tandem (pitch catch)`, `2.5 MHz Frequency`, `5 MHz Frequency`, `Probe Diameter 10mm`,
  `Probe Diameter 5mm`, `Phased Array Probe…`, `Focus Beam…` (check-mark = `probe.focus.on`), `Colour Code Display ▸`,
  `Number of Skips ▸`, `Single Line Beam`, `Mode conversion` ✓, `Surface wave` ✓, `Side lobes` ✓, `Finger damping tool`
- Weld ▸ `Weld…` (prep dropdown), `Material…`, `Presets ▸`
- Defects ▸ … v1 …, `Random practice…`
- Tools (NEW menu, id `menu-tools`, between Defects and Options) ▸ `DGS diagram…`, `Evaluation (standards)…`, `Procedures ▸`,
  `B-scan window`, `Echo dynamic window`, `Datalogger…`, `Sizing…`
- Step Wedge ▸ v1 + `FBH block`
- File ▸ v1 + `Save scenario…`, `Load scenario…`, `Share link…`, `Print report`
- Options ▸ v1 + `Sound alarm`, `Touch bar ▸ auto/on/off`, `High contrast`, `Auto-scale layout`, `Show dead zones` (→ `tofd.deadZones`)
- Help ▸ v1 + `Glossary…`, `Quick tour`, `Standards notes…`, `Echo quiz…`
- Enable matrix: 80 adds `'tools'` to `ALL_MENUS` and `DISABLED.fbh = {toolbar: ['v2','v1','dac','plot','tky','tofd','aut','pipe'], menus: ['weld','defects'], hidden: ['compass']}`;
  90's selftest expects `menu-file, menu-probes, menu-stepwedge, menu-weld, menu-defects, menu-tools, menu-options, menu-help`.
  `MODE_OF['fbh'] = 'fbh'` in `loadSpecimen`; specimen id `'fbh'` in `UT.specimens.build`.
- **Window registry** (`data-win` → owner; menu → `UT.<owner>.<win>.toggle()` guarded with `has()`): v1 list of SPEC §15.9 plus
  `dgs`, `evaluation`, `procedures`, `stdnotes` (45); `pa` (56); `bscan`, `echodyn` (66); `datalog` (70); `autocal` (80);
  `lessons`, `quiz` (82 — 80 no longer creates `lessons`); `trade`, `scoreboard`, `report`, `practice` (84 — 80 no longer
  creates `trade`); `probelib`, `material`, `focus`, `glossary`, `touchbar` (a `div#touchbar`, not a win), tour overlay
  `div#tour`, `print-root` (`div#print-root` on body) (90); `scenario`, `share` (94).
- Toolbar unchanged (19 buttons) + `.active` states as v1; no `.active` angle button for a custom angle.

---

## 9. Acceptance checks v2 (headless Chromium via `UT.test`; tolerances inclusive)

### 9.0 Regression
V1 #1–#14 unchanged. Quantities that legitimately change: `derived.halfAngle20dB` (60°/5 MHz/⌀10: 3.23° instead of 4.02°),
`RayResult.edge20`, `Echo.hz` (hence the AUT z-extent in #12: the window narrows by ≈ 0.6 mm per side, still within
"≈ 110..160"; the planar z-overlap exponent 1 of §4.4 moves the −6 dB points to the defect ends — also within), plotter
20 dB beam-width numbers (lesson 9), sizing 20 dB drop, TT/tandem acceptance cones. On-axis amplitudes (#4–#7, K_REF) are
unchanged because `D1(0) = 1`. #8/#9 amplitude ratios may shift ≤ 1 dB; tolerances stay. Attenuation is numerically identical
to v1 for carbon (L 0.005 / S 0.010 one-way). #13 holds by the invariant of §4.2.

### 9.1 Physics
- **V2-1 Directivity** (5 MHz ⌀10, λ 0.648): `UT.test.directivity(θ)` at `asin(0.51λ/a)` = 0.712 ± 0.02 (one-way −3 dB), at
  `asin(0.87λ/a)` = 0.316 ± 0.03 (−10 dB), at `0.999·asin(1.22λ/a)` ≤ 0.02, at `asin(1.635λ/a)` = 0.13 ± 0.02 (first side lobe,
  −17.6 dB) with sideLobes on; at `asin(1.5λ/a)` > 0 with sideLobes on and = 0 with sideLobes off. `fanAngles().length` = 41
  (on) / 25 traced (off); `fanAngles()[0] = −halfAngle20dB`, `[20] = +halfAngle20dB`.
- **V2-2 Mode conversion (reciprocal path)**: plate 20 (rootHeight 0, capHeight 0), 60° 5 MHz ⌀10 (`gen-60-5-10`), planar
  defect pts (−3, 14) → (3, 9), probe scanned x = 44…54 (0.5 mm) with modeConv on: an echo of kind `modeconv` exists with
  `tUs` = 38.1 ± 1.0 µs and displayed `path` = 61.7 ± 1.6 mm; with modeConv off no `modeconv` echo. Coefficient API:
  `modeConv('S', 30) → R ≥ 0.6 and phiOut = 65.6 ± 1°`, `modeConv('S', 40) → R = 0`, `modeConv('L', 60) → R ≥ 0.9`.
  TOFD (V2-10) is the timing check.
- **V2-3 Surface wave**: plate 20, default weld (capWidth 16 → toe at x = ±8), 70° at x = 40 (side +1): echo kind `surface`
  at path 34.8 ± 1.5 mm (= 32 mm / 0.92); `setDampers([20])` drops it ≥ 30 dB; `setPhysics({surfaceWave:false})` → absent;
  with the 60° probe → absent (eR = 0).
- **V2-4 Materials**: `setMaterial('austenitic')` → `ascan.grassPct` ≥ 3× carbon; first backwall of a 25 mm plate (0°) at equal
  gain is 4…7 dB lower than carbon (expected 4.75); readouts use vL 5.66 (backwall DP = 25.0 ± 0.2); with
  `setInstrument({cal:{vel:5.90, zero:0}})` (carbon calibration) the austenitic backwall DP reads 26.1 ± 0.2.
- **V2-5 Probe library**: `selectProbe('mwb60-2')` → `probe.freq` 2, `crystalDims` {a:9, b:8}, `derived.nearField` = 16.3 ± 0.3
  (k = 1.30), `wedgeAngle` 47.1 ± 0.2; `selectProbe('a430s-60')` → crystalDims 16×16, `derived.wedgePath` 14; custom angle
  55 via `setProbe({angle:55})` → `statusLine` contains '55.0°', mode 'shear', a 55° shoe drawn, no console error.
- **V2-6 Focus**: IOW 13 mm SDH, 60° (N = 38.6), `setFocus({on:true, F:26})` → SDH amplitude ≥ 3 dB above unfocused (expected
  +3.4) and the −6 dB x-width ≤ 0.7× the unfocused width; `setFocus({F:60})` is clamped to ≤ N (`state.probe.focus.F ≤ 38.6`).
- **V2-7 TCG**: DAC block T 40, 60°, record the three SDHs (`dac.refDb` = the recording gain), TCG on → at `gain = dac.refDb` each
  SDH maximum reads 80 ± 4 % (`readouts.primary.peakPct` and `frame.echoes` agree within 1 %); at `refDb + 6` → 160 ± 8 unclipped.
- **V2-8 Pulser/receiver**: `pulser.energy` 400 vs 100 V (labels 'high' vs 'low') = +12 ± 1 dB on the gated peak; `pulser.damping`
  50 Ω vs 150 Ω = −2 ± 0.5 dB and pulse −6 dB width 0.75 ± 0.1×; filter mismatch (`receiver.filter '5-15'` with the 2 MHz
  `mwb60-2`) = −6 ± 1 dB and width ≥ 1.25×; `'broadband'` never changes amplitude.
- **V2-9 DGS**: FBH block, 0° 5 MHz ⌀10: record the backwall reference on a clean spot, gate the ⌀3 mm FBH at 30 mm → `ers`
  within 3 ± 0.9 mm; ⌀6 → 6 ± 1.5. `dgs.curves` disc G = 0.3 at A = 3 → H = 2π·0.09/9 = 0.0628 ± 1 %.
- **V2-10 TOFD v2** (pcs 60, T 20, 5 MHz, wedge 12 mm → 2wd 8.76 µs): events include `modeconv-backwall` at 24.77 ± 0.05 µs
  absolute and `modeconv-backwall-ss` at 31.02 ± 0.05; `pcsOptimise()` sets pcs = 46.2 ± 0.1; `tofd().deadZones.lateral` = 7.3 ± 0.5 mm
  and `.backwall` = 1.6 ± 0.2 mm; `tofdCursor({z:135, depth:8})` sets `state.cursor = {view:'dscan', depth ≈ 8}`.
- **V2-11 PA**: `pa.sscan()` returns 41 angle columns; the DAC-block T/2 SDH appears at the angle whose `path·sinθ` matches its
  position (±3°); E-scan has ≥ 8 columns; `pa.runScan()` map non-empty; with `pa.tcg` the SDH amplitude spread across angles
  ≤ 3 dB (measured ON-AXIS per angle, i.e. the probe placed so that each angle's centre ray hits the SDH — ACG-style angle-gain
  calibration; a fixed probe reading the SDH in neighbouring columns is NOT the measure); `pa.focalLaw(60).slope` = 0.070 ± 0.003 µs/mm, `pa.focalLaw(0, {escan:true}).slope` = 0, all delays ≥ 0.
- **V2-12 AUT v2**: `channels 6` yields 6 strips; adaptive step on a 24-inch pipe → n ≤ 500 columns; sync scan ≤ 1.5 s.
- **V2-13 B-scan**: lamination plate, 0°, drag x from −60 to 60 → `bscan().columns.length ≥ 100` with a thickness step where the
  lamination is (depth 10 vs 25); `state.bscan.columns === null` throughout (no render loop: `'render'` count per drag step ≤ 2).

### 9.2 Training
- **V2-14 Lessons**: `lessonAutoRun(n)` for n = 1…25 resolves `completed: true` with `failedSteps: []`; `UT.test.lessons().length === 25`;
  manual: start lesson 3, perform steps via `UT.test` (incl. `lessonAnswer('initial')`, `lessonAnswer(25)`) → `lessonState().step`
  advances each time; a wrong choice does not advance and increments `progress[3].wrong`; `progress[3].auto === true` after autoRun.
- **V2-14b Quiz**: `quiz.start({n:10, seed:3})` twice yields the same `item` sequence; answering each item with
  `UT.rays.describe(frame.readouts.primary).category` and the matching action scores 10/10 (`state().correct === 10`).
- **V2-15 Trade v2**: `trade.configure({difficulty:'advanced', timeLimitMin: 0.05})`, `start(7)` twice → identical truth (5–8 defects,
  identical `weldOpts/material`); submitting the truth rows (v1 shape) → 100; lengths ×2 (rest correct) → 85; lengths ×1.2 → 100;
  one extra unmatched row → −15; `trade.tick(4)` → `state.trade.revealed === true`; `history()` has the entry with
  `coverageA/coverageB/perDefect`; `report()` HTML contains the score, the indication table and the truth table;
  `report({withTruth:false})` contains no truth rows.
- **V2-15b Matching**: `submit([{z:0, length:L}])` (one row spanning the specimen) → detections ≤ 1 and score ≤ ceil(100/N).
- **V2-15c Depth**: reporting `depth = (yMin + yMax)/2` (truth centre) for every defect scores full depth points (100 with the rest correct).
- **V2-15d Recordability**: `truth()` rows carry `recordable` (boolean) and `bestDb` (number); advanced seeds with a
  `recordable:false` defect do not lose points for omitting it.
- **V2-15e Coverage**: after a sync sweep of side +1 with 60° from z 0…L at half-skip x, `trade.coverage().sideA ≥ 0.95`, `sideB` unchanged.
- **V2-15f Critical miss**: intermediate seed with a crack of height ≥ 3: submitting all truth rows except that one → `result.fail === true`
  and `report()` contains 'FAIL'.
- **V2-16 Standards**: `evaluate({ruleId:'asme8', T:20, indication:{ampDbVsRef:+1, lengthMm:10, type:'slag'}})` → reject;
  `{−10, 10}` → accept with `recordable:true` (alias 'record'); `{−16}` → not-recordable; `{−6, 6, 'crack'}` → reject (planar).
  `iso11666` AL2 T 20: `{−12, 8}` → not-recordable; `{−6, 8}` → accept (short: 8 ≤ max(10, 0.5·20) = 10, −6 ≤ −4);
  `{+2, 8}` → reject; `{−8, 15}` → reject (long: 15 > 10, −8 > −10); `{−11, 30}` → not-recordable; `{−10, 30}` → accept (equality).
  `iso11666` AL3 T 20 (+4/−2 kept): `{+3, 15}` → accept (15 ≤ 20); `{−2, 25}` → accept (long, equality); `{−1, 25}` → reject; `{0, 25}` → reject.
  `applyProcedure('iso-B-plate20')` → `allowedProbes()` = the listed ids and `UT.trade.configure({probes:['gen-45-5-10']})` is rejected.
- **V2-16b AWS**: `evaluate({ruleId:'awsd11', T:25 /* band 1: 20 < T ≤ 38 */, probeAngle:70, indication:{ampDbVsRef:+1, lengthMm:30, soundPath:50}})` → c = 2,
  d = −3 → class A → reject; `{−6, 30}` → d = 4 → class C → accept (30 ≤ 50, mid-thickness), `{−6, 60}` → reject; `{−9}` → d = 7 →
  class D → accept regardless; `probeAngle:45` with T 15 (band 0) → disposition 'n/a'; T 20 is band 0 (`bandOf(20) === 0`), T 7 → 'n/a'.
- **V2-17 Sizing v2**: root-crack preset height 3 → tip-diffraction height 3 ± 1 using the two tip echoes at the optimum probe
  position; 30 mm LOF: 20 dB drop length = 30 ± 3, 6 dB drop length = 30 ± 2; method `'eval'` with ISO −10 dB yields a length
  ≥ the 6 dB length − 2.

### 9.3 UI / usability
- **V2-18 i18n**: `lang('ko')` → `untranslated().length ≤ 5` after opening every window (registry §8); `lang('en')` restores; no
  `[data-i18n]` element whose text equals its key while `ko` (apart from the exemptions).
- **V2-19 Scaling/touch**: at 1024×640 no element overflows the viewport (`scrollWidth/Height == inner`), `UT.dom.scale()` ≈ 0.8;
  pointer events (`pointerdown/move/up` at `rect.left + xCss·k`) on `#cv-cross` move the probe by the dragged mm and emit one
  `'ui' probe-drag`; touch bar `on` shows 9 buttons + the Step button; `display.scale = 'fixed'` removes the transform.
- **V2-20 Scenario/exam**: `scenario.capture()` → change gain/defects → `scenario.apply(saved)` restores them; `await toUrl()`
  → navigate to that URL in a fresh page → the scenario is applied (same defects/probe, title toast shown); exam URL
  (`toUrl(obj, {exam:{code:'1234'}})`) contains no `defects` key; after load `UT.test.trade.truth()` is `[]` and
  `UT.test.state().defects` is absent until `trade.reveal('1234')`; `reveal('0000')` returns false and leaves `display.hide` true;
  after submit `trade.verifyResult(token)` (token from `report()`/`state.trade.result.token`) returns `{ok:true, score}`; a
  tampered token returns `{ok:false}`.
- **V2-21 Sound**: with `display.sound` on and `setInstrument({gates:[{on:true, alarm:true, start:10, width:60, level:20}]})` over
  an echo, `UT.audio.lastBeep` updates once (edge); no AudioContext is created while sound is off.
- **V2-22 Accessibility**: `#menubar [role=menubar]` exists, `F10` then `ArrowRight` opens the Probes menu, arrow keys move
  focus, every `tb-*` has `aria-pressed`; `display.highContrast` adds `.hc`; the lessons window has an `[aria-live]` region.
- **V2-23 Weld preps**: each of `single-bevel, j, single-v-backing, fillet-t, nozzle` builds, traces without errors, has ≥ 1
  fusion face, and `addPreset('lof')` lands on a fusion face; backing bar gives a `geometry` echo from its ends; `weldOpts.type`
  mirrors `prep` ('fillet' for fillet-t/nozzle).
- **V2-24 Datalogger/compare/AUTO**: pressing SAVE adds a datalog entry; `2ND F + GATES` (= `UT.instruments.auto(80)`) sets the
  gated peak to 80 ± 1 %; compare snapshot drawn (grey trace present) and `UT.test.state().instrument.compare` is undefined.

### 9.4 Engineering
- **V2-25** `node tools/acceptance.mjs` exits 0 and its JSON lists ≥ 40 checks (14 v1 + 33 v2 incl. the b–f sub-checks; V2-25 is the runner and is not self-listed).
- **V2-26** CI workflow file valid YAML with exactly the steps of §6.2; `build.py` writes both outputs and they are byte-identical; size < 2.5 MB (lead decision: the source is inlined unminified and commented by design — readability of the single file is a feature; the v2 modules total ≈ 1.5–2 MB).
- **V2-27** Performance of §6.4: 41 rays + modeConv ≤ 10 ms (≤ 20 ms with `CI`), 21 rays ≤ 6 ms; AUT ≤ 1.5 s; TOFD ≤ 0.8 s; PA ≤ 60 ms.

---

## 10. Lessons to be more "coaching" (for 82-lessons authors)
Each lesson must teach a **decision**, not just a click: end with a step whose check verifies an inspector's conclusion
(choice step, e.g. "identify the echo at 40 mm as the root crack corner echo" → `ans === 'corner'`; the window offers 3–4
candidate labels as buttons when `step.choices` is defined, and a numeric input when `step.input === 'number'`). Every
lesson has ≥ 1 such step (≥ 2 in lessons 5, 7, 12, 13, 20, 21). Feedback (`okKo/okEn`, `wrongKo/wrongEn`) must say *why*,
in the 지시/불연속/결함 vocabulary of §5.3. Prefer decisions that recur in real Level 2 work: geometry vs defect, reference
level and scanning gain arithmetic, transfer correction, calibration error types, recording/evaluation levels, sizing
method validity, report/disposition actions.

---

## 11. Lead decisions (taken) and open points

**Taken (final):** ISO 11666 AL3 = shortLimit +4 dB / longLimit −2 dB / evaluation −6 dB (confidence 'medium — verify');
disposition taxonomy `{'not-recordable','accept','reject'}` + `recordable` + `class`, `'record'` alias accepted by callers;
DGS disc law `2π·G²/A²`; PA focal law per §3.10; TOFD L-S backwall via the Fermat minimum (24.77 µs for pcs 60 / T 20) plus the
S-S replica; one-way `attenL5/attenS5` per material (carbon L 0.005 / S 0.010 unchanged from v1; the lead patched 10-specimens);
R_LS/R_SL shapes per §3.2; V2-2 replaced by the reciprocal-path case; focal gain `Gf` and `F ≤ N`; sizing corrections in the
z-plane with `crystalDims.b`; 25 lessons + T7 quiz + coverage tracker + result-token exam flow + full report template +
recordability filter + one-to-one matching + critical-miss fail + `'ui'` bus event + step schema; rectangular near-field
factor k (V2-5 = 16.3 ± 0.3; the lead patched 20-probe); a430s = 5 MHz 16×16 wedgePath 14; EPOCH pulser energy 100/200/300/400 V
(labels low/med/high → 100/200/400), damping Ω list, filters `['broadband','0.2-10','1.5-8.5','5-15']`; TCG clip −12…+40; V2-1
null/floor wording; V2-3 = 34.8 mm; V2-10 = 7.3 ± 0.5 mm and 24.77 µs.

**Open points for the lead:**
1. RESOLVED — the lead added `spec.stepX(t)` (centre x of the step whose thickness is nearest to t; `null` when the spec has no steps) to `stepWedge()` in 10-specimens.
2. `pulser.damping` option list: EPOCH 600 offers 50/100/200/400 Ω (NDT critic) while v1's default 150 Ω is kept as the
   'damping:false' value (integration critic). This spec keeps {50,100,150,200,400}; drop 150 → 200 if strict fidelity is preferred
   (then `damping:false` ↔ 200 Ω, width ×1.0, 0 dB — numerically identical).
3. Lesson 19 step 4 (5 mm hole of the V2 block): the probe x for the 60° maximum must be derived from the v2 builder's hole
   position; 82 should read `spec.holes` rather than hard-code it.
4. CONFIRMED (binding): 70 exports `UT.instruments.storeRef()` (= 2ND F + dB) and `UT.instruments.wheel(n)` (n clicks of the rotary
   knob on the selected parameter, emits `'ui'` wheel); 50 exports `UT.tofd.cursorAt({z, depth})` (writes `cursor.view='dscan', tUs, depth, z`)
   and `UT.test.tofdCursor`; 60 exports `UT.views.cross.dragTo(x)` (§3.13).
5. ISO 17640 scanning gain above reference (+6 dB) and the 4 dB re-check limit are MEDIUM confidence; lesson 23/25 texts
   carry '(verify)'.
6. The z-overlap exponent change (planar: 1 instead of 0.5) slightly moves the AUT window edges of V1 #12 — QA to confirm
   it stays inside 110…160 (expected).
7. AWS example from the training critic (`−8 dB → class C`) conflicts with the NDT table (`d = 6 → D` in band 1); V2-16b follows
   the NDT table.
8. RESOLVED — the lead removed `angleCustom` from `UT.probe.select()` and from `defaultState().probe`; nobody reads or writes it.
9. DECIDED — outside exams `revealOnSubmit` is `true`; the Share ▸ Exam dialog defaults the checkbox to `false` (score only), the
   instructor opts in to revealing the truth to the candidate.
