# UTsim — UTman-style Ultrasonic Weld Testing Simulator (single-file HTML)

This document is the **binding contract** for every module of the simulator. Read it fully before
writing code. If something is ambiguous, follow the reference screenshots (see §1.3) and the
physics in §6. Do not invent a different global structure, file layout or coordinate system.

The product re-creates, in one self-contained HTML file, the software shown in the YouTube playlist
"UTman Ultrasonic Sim" (Paul Rawlinson, utsim.co.uk): a real-time manual UT (MUT) weld inspection
simulator with calibration blocks, DAC, beam plotting, defect drawing, TKY joints, TOFD, AUT,
trade test and multiple flaw-detector "UT sets". Target users: UT trainees / NDT engineers.

---

## 1. Product scope

### 1.1 Features that MUST exist (mapped to the 22 playlist videos)

| # | Video title | Feature in this simulator |
|---|-------------|---------------------------|
| 1 | UTman Functions | Menu bar (File, Probes, Step Wedge, Weld, Defects, Options, Help) + toolbar (0°,45°,60°,70°,V2,V1,DAC,PLOT,DAMP,SIZE,DEFECT,HIDE,CLEAR,BEAM,RAD,PIPE,TKY,TOFD,AUT) |
| 2 | Basic UT controls Range X shift Amplitude | Range (mm), Delay/X-shift (mm), Gain/AMP (dB), Reject/Suppression (%) on every UT set |
| 3 | Zero Probe | 0° compression-wave probe, single vs twin crystal (initial pulse / dead zone vs none), multiple backwall echoes |
| 4 | Angle Probe using the V1 calibration block | IIW V1 block: 100 mm radius (echoes 100/200/300…), 25 mm thickness (25/50/75/100), 1.5 mm SDH at 15 mm depth, 50 mm Perspex insert, angle & 0° probe use |
| 5 | Lamination Check | Plate with lamination defects; 0° scan; lamination echo + loss of backwall; plan-view raster |
| 6 | Angle Probe using the V2 calibration block | V2 block: 25 & 50 mm radii, 5 mm hole, 12.5 mm thick; angle probe index & angle check |
| 7 | Making Sense of Amplitude | dB arithmetic: gain, reference gain quick keys (10/20/30/40/60 dB), amplitude %, +6 dB = ×2, DAC % readout |
| 8 | TKY Variable configuration Welds | T/K/Y joint geometry with adjustable brace angle, thickness, brace offset; ray tracing inside chord+brace |
| 9 | Plotting Beam Spread at 20% | IOW/A5 beam-profile block with SDHs (13/19/25/43 mm); plotter chart (beam-plotting card) with mirror image; plot 20 dB (10 %) beam edges; half-skip / full-skip stand-off & beam-path readouts |
| 10 | Drawing Defects II | Defect editor: draw defects in cross-section with the mouse; height/length/separation; up to 8 defects; planar vs volumetric |
| 11 | How to use the EPOCH | Instrument skins: **EPOCH 600** (primary) + **EPOCH 4** text screen + **USK7 analog** (knobs) |
| 12 | EPOCH AUTO Calibration | Auto-cal: two-point (thin/thick) velocity & zero calibration on step wedge / V1 |
| 13 | TOFD | Two-probe pitch-catch TOFD, lateral wave, backwall, tip diffraction, RF A-scan, D-scan grey image built by "Run Scan" |
| 14 | Shear wave and Compression wave | Mode/velocity handling; Snell wedge-angle calculator dialog ("Adjust Angle in Wedge (Shoe)"); status-bar physics line |
| 15 | UTman software utsim | Overall layout fidelity (see §7) |
| 16 | Drawing Defects I | Circle-view (pipe) defect editor: circumferential position ring 0…circumference, arcs = defects, select 1–8, SEPARATION / LENGTH / APPLY TO ALL, Delete/Load/Save |
| 17 | Lamination Check.mpg | (same as 5) |
| 18 | AUT | Automated scan along the weld: amplitude strip + TOF strip charts, gate panel (Level/Width/Start), colour map, Run/Stop/Clear |
| 19 | Angle Probe using the V2 calibration block | (same as 6) |
| 20 | Angleprobe Calibration | DAC block with SDHs; record DAC points ("Set Amplitude and press record button, then draw curves"); DAC curve + −6/−14 dB (ASME 50 %/20 %) curves on A-scan |
| 21 | Trade Test with UTman software | Exam mode: hidden random defects; candidate reports position/length/depth; reveal + score |
| 22 | UTman600 | EPOCH 600 skin fidelity, readouts (soundpath → surface distance ↓ depth, amplitude %), gate 1/2, Auto Cal, Peak Mem, Freeze, 2ND F |

Also required (seen in menus/screens): Probes menu items, in this order and with these exact labels:
*Adjust Angle in Wedge (Shoe)* ✓, *Zero Probe - Twin or Single Crystal* ▸ (Single Crystal | Twin Crystal),
*Pulse Echo* ✓, *Through Transmission*, *Tandem (pitch catch)*, *2.5 MHz Frequency*, *5 MHz Frequency* ✓,
*Probe Diameter 10mm* ✓, *Probe Diameter 5mm*, *Phased Array Probe*, *Colour Code Display* ▸
(Mode Propagation | Geometry), *Number of Skips* ▸ (1 | 2 | 3 | 4), *Single Line Beam*, *Focus Beam*;
toolbar *DAMP* (pulse damping), *SIZE* (6 dB-drop / 20 dB-drop sizing tool), *HIDE* (hide defects &
beam for blind practice), *RAD* (simulated radiograph strip of the weld), *PIPE* (plate ⇄ pipe + 3D
pipe window), *BEAM* (toggle beam fan drawing); plan view with skew compass dial; horizontal
position ruler; 3D pipe window; status bar physics line.

### 1.2 Non-goals
No server, no build tooling beyond `build.py`, no external libraries/CDNs, no fonts fetched from the
network, no images (everything drawn with Canvas 2D / CSS). Must open from `file://` offline.

### 1.3 Reference screenshots (read them!)
Scratchpad folder (read with the Read tool, they are JPEGs):
`/tmp/claude-0/-home-user-automsitory/6529fecf-0838-5127-8ddf-e0f6bae1c300/scratchpad/thumbs/`
- `RcSqNFlOF4E.jpg` UTman600 main layout (EPOCH 600 left, plan view right, ruler, cross-section, 3D pipe)
- `kmkvrl95GnQ.jpg` Trade test layout
- `xMf-CqHsRqQ.jpg` UTman II layout with USK7 A-scan, `KHEwJJ-mbCI.jpg` Probes menu open
- `0zNOuyu8bso.jpg` EPOCH 600 page-2 (Gate) screen on the DAC bar, `P4kYytdFYFc.jpg` EPOCH 4 text screen (ASME)
- `iLxs-95BAWQ.jpg` / `Ro4XIAnAVzI.jpg` circle-view defect editor, `gL5osw3TT8U.jpg` circle view + ERASE ALL DEFECTS confirm
- `6-2oiKWMnek.jpg` DAC recording on a 20 mm plate (UTman II, ERASE DAC on USK7), `BXVn88Jxp_A.jpg` EPOCH 4 skin in weld mode
- `F5lOZPN1dMs.jpg` lamination check (dup), `MhQq57aFWhA.jpg` 45° probe, root defect, 4 skips
- `5UovycItbKU.jpg` TOFD, `oS8LNNtzFOA.jpg` AUT, `42fD-emM_Hw.jpg` V1 block, `Vzsz3kVQmDs.jpg` V1 0° probe
- `iZMI8ZAnHww.jpg` beam plotting chart + DAC, `lFktISGY4hE.jpg` lamination check, `hm3kwQs5maU.jpg` TKY
- `EGQxpCOD_xA.jpg` basic controls on pipe (WT 20 mm, Dia 6 inch), `TFSqAMRmNvw.jpg` V2 lesson main view

---

## 2. Repository layout & build

```
ut-simulator/
  SPEC.md            this file
  README.md          user docs (KO + EN)  — written by the app/integration agent
  build.py           inlines src files into ../utman_simulator.html (single file, no deps)
  index.html         DEV page: loads style.css + src/*.js in the order below via <script src>
  src/
    00-core.js        UT namespace, constants, math, event bus, state store, test API stub
    10-specimens.js   specimens (plate/pipe weld, V1, V2, step wedge, IOW/DAC block, TKY) + defects
    20-probe.js       probe model, Snell, near field, beam spread, wedge delay, phased-array sweep
    30-raytrace.js    2-D polygon ray tracer, fan rays, echo collection
    40-ascan.js       A-scan synthesis, time base, gain, gates, DAC, peak memory, freeze, readouts
    50-tofd.js        TOFD physics + D-scan builder
    55-aut.js         AUT strip charts / colour map / gate logic
    60-view-cross.js  cross-section canvas (+ probe drag, defect drawing brush)
    62-view-plan.js   plan-view canvas (+ skew dial drag, plan defect rectangles, raster trail)
    64-view-3d.js     3-D pipe / plate window (canvas projection, drag to rotate)
    66-view-plotter.js beam-plotting chart, radiograph strip, sizing overlay
    70-instruments.js EPOCH 600 / EPOCH 4 / USK7 skins (DOM+CSS) + A-scan canvas renderer
    80-modes.js       mode controllers: calibration blocks, auto-cal, DAC record, PLOT, SIZE, HIDE, trade test, lessons
    90-app.js         layout, menu bar, toolbar, dialogs, status bar, keyboard, persistence, boot
  style.css
```

**Load order is the numeric prefix order.** Every file is a classic script (NOT an ES module) that
does `(function (UT) { ... })(window.UT = window.UT || {});` and attaches its API to `UT.<name>`.
No top-level `const` collisions: everything lives inside the IIFE. `'use strict'` inside each IIFE.
ES2020 syntax is fine (Chrome/Edge/Firefox/Safari current). No `import`/`export`.

`build.py` (python3 stdlib only): reads `index.html`, replaces `<link rel="stylesheet" href="style.css">`
with an inline `<style>` and each `<script src="src/xx.js"></script>` with an inline `<script>` in the
same order, writes `../utman_simulator.html`. It must escape nothing (no `</script>` inside JS strings:
write `'<\/script>'` if ever needed). Run: `cd ut-simulator && python3 build.py`.

Boot: `90-app.js` calls `UT.app.boot()` on `DOMContentLoaded`. Before boot nothing touches the DOM
(modules may only define functions/classes and constants at load time).

---

## 3. Coordinate systems & units

All physics in **millimetres, microseconds, degrees, dB**. Velocities in mm/µs (steel shear 3.24,
steel compression 5.90, Perspex 2.74, water 1.48). Angles in degrees at the API; convert internally.

### 3.1 Cross-section (XY) — the plane of the beam
- `x`: horizontal, **0 at the weld centre-line**, positive to the right. Probe on the right side by
  default, pointing left toward the weld (beam direction −x). `probe.side = +1` (right) or `−1` (left).
- `y`: **depth, 0 at the scanning (top) surface, positive downward**. Plate bottom at `y = T`.
- The specimen outline is a closed polygon in XY (counter-clockwise), including the weld cap/root
  bulges where relevant. Holes (SDH, V1 1.5 mm hole, V2 5 mm hole) are circles. Perspex insert is a
  circle with a different velocity (treated as a reflector interface, see §6.5).

### 3.2 Along-weld axis (Z)
- `z`: position along the weld (plan view vertical axis, mm). Plate: `0 … L` (default L = 300).
  Pipe: `0 … C` where `C = π·OD` (circumference), wrapping. Defects have `zFrom, zTo`.
- Probe has `z` (index-point position along the weld) and `skewDeg` (0 = beam perpendicular to the
  weld, pointing toward it; + = rotated clockwise in plan). Skew reduces coupling with defects that
  are parallel to the weld: see §6.7.

### 3.3 Pipe
- Circumferential butt weld. Cross-section = axial-radial plane = flat plate of thickness WT (this is
  physically correct for a circ. weld; the small curvature along the beam is ignored, as UTman does).
- Circle-view positions are `z` in mm around the circumference (0 at 12 o'clock, clockwise).

### 3.4 Screen mapping
Each view keeps its own `mm→px` transform (`scale`, `originPx`). Views expose
`toPx(x,y)` / `toMm(px,py)`. Default cross-section scale fits the specimen width into the canvas
width with 8 px margin; vertical scale equals horizontal scale (no distortion).

---

## 4. Global state, events, render loop (00-core.js)

```js
UT.VERSION = '1.0.0';
UT.bus = { on(evt, fn), off(evt, fn), emit(evt, payload) };   // simple synchronous event bus
UT.state = { ...see below };                                   // single mutable store
UT.set(patch, opts)  // shallow-merge patch into UT.state, mark dirty, emit 'state' with {keys, patch}
                     // opts.silent skips emit; nested objects are REPLACED, not merged (callers clone)
UT.requestRender()   // coalesces to one requestAnimationFrame; on frame emits 'render' (views draw)
UT.math = { clamp, lerp, deg2rad, rad2deg, dist, snellAngle, dB2lin, lin2dB, gaussian, fmt(num, dp) }
UT.uid()             // incrementing id
UT.test = {}         // §11 test API, filled by other modules
UT.consts = { V_SHEAR_STEEL: 3.24, V_COMP_STEEL: 5.90, V_PERSPEX: 2.74, V_WATER: 1.48,
              PROBE_COLOURS: { 0: '#ff00ff', 45: '#ffff00', 60: '#00c000', 70: '#0000ff', pa: '#ff8800' } }
```

### 4.1 `UT.state` shape (SUMMARY — the authoritative shape is `UT.defaultState()` in src/00-core.js, see §15.1)
```js
{
  mode: 'weld',              // 'weld' | 'v1' | 'v2' | 'step' | 'iow' | 'dac' | 'tky' | 'tofd' | 'aut' | 'trade' | 'lamination'
  utSet: 'epoch600',         // 'epoch600' | 'epoch4' | 'usk7'
  specimen: <Specimen>,      // §5.1 (built by UT.specimens.*); replaced whole on change
  probe: {                   // §5.2
    angle: 60, mode: 'shear', crystal: 'single', freq: 5, diameter: 10,
    wedgeVel: 2.74, method: 'pe',  // 'pe' | 'tt' | 'tandem' | 'pa'
    x: 40, z: 150, side: +1, skew: 0,
    paFrom: 40, paTo: 70, paStep: 1,
  },
  instrument: {              // §5.3
    gain: 30, refGain: 30, range: 100, delay: 0, reject: 0, damping: false,
    rectify: 'full',         // 'full' | 'rf'
    freeze: false, peakMem: false,
    gates: [ { on: true,  start: 10, width: 60, level: 20, alarm: false },
             { on: false, start: 70, width: 20, level: 40, alarm: false } ],
    activeGate: 0,
    dac: { points: [], on: false, refDb: null },   // points: [{path, ampPct}] recorded at refGain
    page: 1,                 // EPOCH600 softkey page 1..5
  },
  display: {
    beam: true, skips: 3, colourCode: 'none', singleLine: false, focus: false,   // colourCode: 'none' | 'propagation' | 'geometry'
    hide: false, plan: true, pipe3d: true, mirror: true, units: 'mm', legend: true,
  },
  defects: [],               // §5.4  (max 8 in editor; trade test may hold more)
  selectedDefect: 0,
  tofd: { pcs: 60, txAngle: 60, scan: null },     // scan: {z0, z1, step, columns:[Float32Array]} or null
  aut: { gates: [...], scan: null, running: false },
  plot: { points: [], edgeMarks: [] },             // beam plotting
  sizing: { marks: [] },
  trade: { active: false, revealed: false, report: [], score: null },
  lesson: null,              // index into UT.modes.lessons or null
  status: { left: '', mid: '', right: '' },        // status bar text
  cursor: { x: null, y: null, view: null },
}
```
Views must **never** mutate state directly except via `UT.set(...)`. Physics modules are pure
functions of arguments (no reading `UT.state` inside `30-raytrace.js` / `40-ascan.js` / `50-tofd.js`
so they are testable); `80-modes.js` and `90-app.js` orchestrate.

### 4.2 Frame pipeline
`UT.set()` → dirty → rAF → `UT.compute()` (in 40-ascan: recompute rays + echoes + A-scan into
`UT.frame`) → emit `'render'` → each view draws from `UT.frame` + `UT.state`.
```js
UT.frame = { rays: RayResult, echoes: Echo[], ascan: AscanResult, readouts: Readouts, ts: number }
```
Performance budget: full compute ≤ 6 ms for a plate weld with 8 defects and 21 fan rays × 4 legs.

---

## 5. Data models

### 5.1 Specimen (10-specimens.js)
```js
Specimen = {
  id: 'plate-weld' | 'pipe-weld' | 'v1' | 'v2' | 'step' | 'iow' | 'dac' | 'tky' | 'lamination-plate',
  name: 'Plate 20 mm Single-V', kind: 'weld'|'block'|'tky',
  T: 20,                           // thickness (mm) at the probe position (chord thickness for TKY)
  outline: [{x,y}, ...],           // CCW closed polygon incl. cap/root bulges; arcs sampled every ≤2°
  edges: [{a:{x,y}, b:{x,y}, tag:'top'|'bottom'|'end'|'radius'|'cap'|'root'|'brace'|'step'|'fusion'}], // derived
  holes: [{x,y,r,tag:'sdh'|'hole', label:'13mm'}],   // circular reflectors (diffuse, §6.1)
  arcs: [{cx, cy, r, a0, a1, tag:'radius'}],        // exact circular arcs (V1/V2 radii): tracer intersects analytically;
                                                    // the sampled 'radius' outline edges are for drawing/pointInside only (already removed from `edges`)
  retroSlot: bool,                                  // V1 wide: slot at the arc centre (§6.1 2g); drawn as a 2×5 mm notch at (100, 0)
  perspex: {x,y,r} | null,         // V1 50 mm Perspex insert
  weld: {                          // weld-kind specimens only
    type: 'single-v'|'double-v'|'none', bevel: 30, rootGap: 2, rootFace: 2, capWidth: 16, capHeight: 2,
    rootHeight: 1.5, hazHalfWidth: 12,
    fusionFaces: [{a:{x,y}, b:{x,y}}],              // for LOF detection heuristics (optional)
  } | null,
  pipe: { od: 168.3, wt: 20, circumference: 528.7 } | null,
  L: 300,                          // along-weld length (plate) or circumference (pipe)
  scanSurface: { y: 0, xMin: -150, xMax: 150 },     // where the probe can sit (TKY: chord top)
  tky: { braceAngle: 45, braceT: 12, braceOffset: 0, chordT: 20, side: +1 } | null,
  material: { vShear: 3.24, vComp: 5.90, name: 'Carbon steel' },
  extents: { xMin, xMax, yMin, yMax },              // bounding box
  labels: [{x,y,text}],            // e.g. 'V1', '100mm Radius', hole depths
}
```
Builders (all return a fresh Specimen):
- `UT.specimens.plateWeld({T=20, L=300, type='single-v', bevel=30, rootGap=2, capWidth=16, capHeight=2, rootHeight=1.5})`
- `UT.specimens.pipeWeld({od=168.3, wt=20, ...weld opts})` — `L = π·od`
- `UT.specimens.v1({face='wide'})` — IIW V1 block (300 long × 100 high × 25 thick, carbon steel).
  `face:'wide'` = side view used with angle probes (XY = the 300 × 100 face):
  top face `y = 0` from `x = 0 … 300`; right end `x = 300`; bottom face `y = 100` from `x = 300 … 100`;
  the **100 mm radius quadrant** occupies the whole left end: arc centred at the top-face index mark
  `C = (100, 0)`, radius 100, running from `(100, 100)` (bottom) to `(0, 0)` (top-left corner).
  A probe whose index point is at `C` sees the arc at normal incidence for every refracted angle,
  so it gets an echo at 100 mm (the tracer's return-to-probe rule, §6.1, produces the multiples).
  Reflectors: 1.5 mm hole (`tag:'sdh', label:'1.5mm'`) at `(135, 15)`; 50 mm Perspex insert
  (`perspex = {x: 240, y: 55, r: 25}`), and the 2 mm-wide × 5 mm-deep slot cut in the TOP face at the arc
  centre (`x = 99…101, y = 0…5`) — NOT part of the outline (the emission surface stays intact);
  `retroSlot: true` makes the tracer apply §6.1 2g; the cross-section draws the notch.
  `arcs = [{cx:100, cy:0, r:100, a0:90, a1:180, tag:'radius'}]` (angles in math convention:
  x = cx + r·cos a, y = cy + r·sin a). Labels: `V1`, `100mm Radius`, `50mm Perspex`.
  `face:'narrow'` = the block seen across its 25 mm thickness for 0° range calibration: a
  300 × 25 rectangle (`T = 25`), label `25mm thickness. Echoes 25, 50, 75, 100 etc`.
- `UT.specimens.v2({face='wide'})` — V2 miniature block (12.5 thick, radii 25 and 50 concentric about
  the top-face index mark `C = (60, 0)`). `wide` side view: top face `y = 0` from `x = 10 … 110`;
  **R25 arc** on the left: centred `C`, radius 25, from `(35, 0)` down to `(60, 25)`; **R50 arc** on the
  right: centred `C`, radius 50, from `(60, 50)` up to `(110, 0)`; the bottom is closed by the
  segment `(60, 25) → (60, 50)` (vertical, tag `end`). 5 mm hole at `(60, 12.5)` is **not** modelled in
  the wide view (it lies on the arc axis) — `narrow` view: 100 × 12.5 rectangle with the 5 mm hole at
  `(60, 6.25)`. Expected echo sequences with the index at `C`: facing R25 → 25, 100, 175 mm; facing
  R50 → 50, 125, 200 mm (the return from the far arc arrives travelling the wrong way, is mirrored
  by the top surface and only registers after the next return from the near arc — this must emerge
  from §6.1, do not hard-code it). `arcs = [{cx:60, cy:0, r:25, a0:90, a1:180}, {cx:60, cy:0, r:50, a0:0, a1:90}]`;
  no slot (`retroSlot: false`).
- `UT.specimens.stepWedge({steps=[5,10,15,20,25], stepLen=40})` — staircase profile, top flat, bottom stepped (0° calibration / auto-cal).
- `UT.specimens.iow()` — A5/IOW beam-profile block (FROZEN geometry, as implemented): outline
  x 0…300, y 0…45 (T = 45); 1.5 mm SDHs ordered deep→shallow so every hole can be reached from the
  right: 43 mm at x = 60, 25 mm at x = 120, 19 mm at x = 180, 13 mm at x = 240, with labels `13mm` …
  drawn at the top of dashed vertical guide lines (60-view-cross for `spec.id === 'iow'`); a 5-hole
  ladder at x = 20 (depths 8, 14, 20, 26, 32; scanned from the left, side −1). Default probe
  x = 262, side +1 (on the 13 mm hole: 240 + 13·tan60 = 262.5).
- `UT.specimens.dacBlock({T = 40, sdh = 3})` (FROZEN geometry, as implemented; modes pass
  `T = weldOpts.T`): outline x 0…300, y 0…T; 3 mm SDHs at (80, T/4), (150, T/2), (220, 3T/4)
  (`tag:'sdh'`, labels in mm) and a 2 mm notch in the bottom face at each end (x 4…6 and 294…296,
  edge corner reflectors). Default probe on the T/4 hole, side +1. Status segments `AMP= 34dB` and
  hint `Set Amplitude and press record button, then draw curves`.
- `UT.specimens.tky({braceAngle=45, braceT=12, chordT=20, braceOffset=0})` — chord plate (x from −150..150, y 0..chordT) with a brace plate rising from the top surface at angle `braceAngle` (measured from the chord surface), joined by a weld at the toe; outline is a single polygon (chord ∪ brace ∪ weld fillet). The probe sits on the chord top surface (right of the toe) and on the brace surface (mode `tky` allows `probe.surface = 'chord'|'brace'`; for v1 keep chord only but include the brace outline so rays reflect off it).
- `UT.specimens.laminationPlate({T=25, L=300})` — plain plate; defects supplied separately (laminations = planar horizontal).

`UT.specimens.deriveEdges(outline)` fills `edges`. `UT.specimens.pointInside(spec, x, y)`.

### 5.2 Probe (20-probe.js)
```js
UT.probe.derive(probe, specimen) → {
  refracted: 60,                // deg in steel (0 only for the 0° probe; TOFD uses 60° compression)
  wedgeAngle: 47.1,             // deg in Perspex via Snell (0 for 0°)
  vel: 3.24,                    // mm/µs in steel for this mode
  lambda: 0.648,                // mm
  nearField: 38.6,              // mm  N = D²/(4λ)  (D = crystal diameter) — use D·D·f/(4v)
  halfAngle6dB: 1.9, halfAngle20dB: 4.0,   // deg  sin = 0.51λ/D, sin = 1.08λ/D  (60° shear 5 MHz 10 mm)
  wedgeDelayUs: 8.76,           // µs, TWO-WAY in wedge: 2·wedgePath/2.74; wedgePath = 12 mm for angle probes (incl. TOFD), 0 for 0°
  // second worked example — 0° comp 5 MHz 10 mm: λ 1.18, N 21.2, θ6 3.45°, θ20 7.3°, wedgeDelayUs 0
  // critical angles in Perspex→steel: first (comp) asin(2.74/5.90) = 27.7°, second (shear) asin(2.74/3.24) = 57.7°
  indexOffset: 12,              // mm from probe front to index point (drawing)
  shoeWidth: 24, shoeHeight: 14,// drawing size
  colour: '#00c000',
}
UT.probe.snell(theta1Deg, v1, v2) → theta2Deg | null (null when past critical angle)
UT.probe.criticalAngles(vWedge) → { first: 27.7, second: 57.7 }   // deg, for Perspex 2.74 on steel
UT.probe.presets = { 0: {...}, 45: {...}, 60: {...}, 70: {...} }
```
Method semantics: `pe` pulse-echo (default), `tt` through transmission (receiver on opposite surface
at mirrored x; A-scan shows a single transmitted pulse whose amplitude drops when a defect shadows
the path), `tandem` (two identical angle probes, tx at `probe.x`, rx at `probe.x − T·tan(θ)·... ` i.e.
spaced for a vertical reflector at mid-depth; received echo only from vertical planar defects),
`pa` phased array (sector sweep paFrom..paTo, renders S-scan in the A-scan area, see §8.6).

### 5.3 Instrument semantics (40-ascan.js)
- `range` = displayed **sound path** span in mm (0…range across 10 divisions); a float 10…1000,
  arrows/wheel step 1 % (Shift ×10), the RANGE hard key cycles 50/100/200/400. `delay` shifts the
  start (mm of sound path). Time base: every echo has a true arrival time
  `tEcho = derived.wedgeDelayUs + 2·path/vTrue` (µs). The **displayed path** is
  `pDisp = (tEcho − cal.zero)·cal.vel/2` with `instrument.cal = {vel, zero}`; `vel: null` means
  `vTrue` and `zero: null` means `derived.wedgeDelayUs` (calibrated defaults → pDisp = path exactly).
  Auto-cal (§8.2) writes numeric values. Sample i shows `pDisp = delay + i/(n−1)·range`.
- `gain` dB. Echo amplitude on screen (% FSH) = `ampRef · 10^((gain − 0)/20)` where `ampRef` is the
  raw echo amplitude produced by the ray tracer in linear units such that a 3 mm SDH at 50 mm sound
  path with a 60° 5 MHz 10 mm probe reads **80 % FSH at 34 dB**. Calibrate a constant in 40-ascan.js to
  enforce this (`UT.ascan.K_REF`). Clip at 120 % (screen shows up to 100 %; ">100%" readout allowed).
- `reject` (suppression) removes everything below `reject %`.
- `damping` true → pulse envelope width × 0.6 (better resolution, slightly lower amplitude −2 dB).
- `rectify`: `full` (default) or `rf` (TOFD, "Rcvr" menu).
- `peakMem`: envelope hold of maxima per sample while probe moves (reset when toggled).
- `freeze`: no recompute.
- Gates: `start`, `width` in mm sound path, `level` % FSH; readout takes the **peak** above level inside
  the gate (EPOCH "Peak" mode). `alarm` true → beep-free visual flag (status text).
- DAC: `points = [{path, ampPct}]` where every point is **normalised to the reference gain**
  `refDb` (the gain when the first point was recorded): `ampPct = ampMeasured · 10^((refDb − gainAtRecord)/20)`;
  Record refuses a point whose normalised value would exceed 120 %. The curve is linear
  interpolation between points (sorted by path), holding the end values outside the recorded span
  (no extrapolation), drawn scaled by `10^((gain − refDb)/20)`; also −6 dB and −14 dB curves
  (ASME 50 % and 20 % reference). DAC % readout = echo amp / curve amp at that path × 100.
- Readouts (EPOCH top row): `SP` sound path (mm), `SD` surface distance = SP·sinθ − (0), `DP` depth
  (leg-corrected: leg 1: SP·cosθ; leg 2: 2T − SP·cosθ; leg 3: SP·cosθ − 2T … general: fold into
  0..T), `AMP` % FSH, `DAC %` if DAC on, `dB to DAC` = 20·log10(amp/curve).

### 5.4 Defect model
```js
Defect = {
  id, n: 1..8, type: 'planar' | 'volumetric' | 'lamination' | 'crack' | 'lof' | 'porosity' | 'slag' | 'root',
  // XY geometry: a polyline (drawn) — for planar/crack/lof/lamination, the segments are specular mirrors;
  // for volumetric/porosity/slag the polyline outline is filled and each sample point is an omnidirectional scatterer
  pts: [{x,y}, ...],           // ≥ 2 points, mm, in cross-section
  height: 3,                   // mm (through-thickness extent) — derived from pts bounding box when drawn
  zFrom: 120, zTo: 150,        // along-weld extent (length = zTo − zFrom, wrap on pipe)
  reflectivity: 1.0,           // 0.2..1.5 scaling
  label: 'Defect 1',
  visible: true,
}
```
Helpers: `UT.specimens.defectFromBrush(pts, type)`, `UT.specimens.defectLength(d, spec)`,
`UT.specimens.defectPresets` (root crack, LOF on fusion face, porosity cluster, slag line, toe crack,
lamination, incomplete penetration) — each preset is a function `(spec) → Defect` placed sensibly
inside the weld (uses `spec.weld` geometry).

---

## 6. Physics (30-raytrace.js, 40-ascan.js, 50-tofd.js)

### 6.1 Ray tracer
`UT.rays.trace({specimen, probe, derived, display, defects, opts}) → RayResult`
```js
RayResult = {
  centre: {pts:[{x,y}...], legs:[{a,b,leg,surfaceTag}]},   // the centre ray polyline, up to display.skips legs
  fan: [{angleOffsetDeg, weight, pts:[...]}],                // 21 fan rays from −halfAngle20dB..+halfAngle20dB
  edge20: [polyline, polyline],                              // ±20 dB edge rays (dashed drawing)
  echoes: Echo[],                                            // merged, see below
  hits: [{x,y,kind,defectId|tag}],                           // for drawing highlight dots
}
Echo = { path: 52.3, amp: 0.41, kind: 'defect'|'sdh'|'backwall'|'radius'|'corner'|'geometry'|'lamination'|'perspex'|'tip'|'transmitted',
         leg: 1, x: 12.1, y: 17.3, defectId, tag, angleDev: 2.1 }
```
Only ONE mechanism creates echoes from specular surfaces: **the ray must come back to the probe**.
Diffuse (omnidirectional) scatterers create echoes when the ray passes through them. This makes
backwall multiples, radius echoes, V2 sequences, corner (root-crack) echoes, geometry (cap/root)
echoes and the absence of a backwall echo for angle probes all emerge from one algorithm.

1. **Emission**. Index point `E = (probe.x, 0)` on the scanning surface (TKY: on the chosen surface).
   Launch direction of the centre ray `u₀ = (−side·sinθ, cosθ)` (θ = refracted angle; 0° → (0, 1)).
   Fan: 21 rays with angle offsets δ ∈ [−θ20, +θ20]. **One-way** directivity weight
   `w(δ) = 10^(−½·(δ/θ20)²)` (−10 dB at θ20; `UT.math.beamWeight20(δ, θ20)`), so a reflector on the
   θ20 ray is exactly −20 dB in pulse-echo (transmit × receive). θ6 is used only for the return
   aperture `ra` and the skew law (§6.7).
2. **Marching**. For each ray keep `pos`, `dir`, cumulative one-way `len`, `bounces` (count), `leg`
   (1 + number of reflections off outline edges), `topHits`. Repeat until `bounces > display.skips + 5`
   or `len > max(2·(delay + range) + 100, 700)` or the ray leaves the polygon:
   a. Find the nearest intersection among: outline edges (tags; **edges tagged `radius` are
      excluded when the specimen has `arcs`** — `UT.specimens` already removes them from `edges`),
      `specimen.arcs` (analytic ray–circle intersection restricted to the arc's angular span; reflect
      about the exact radial normal), Perspex circle, planar-defect segments (types
      planar/crack/lof/lamination/root), TT/tandem receiver apertures. Holes are NOT specular (see b).
   b. Before moving, test **diffuse scatterers** along the segment: every sample point of a
      volumetric defect (types volumetric/porosity/slag: outline sampled every 1 mm, plus interior
      points on a 1.5 mm grid), every planar-defect **end point** (tip diffraction, weak), and every
      hole **centre** (holes are diffuse only: capture when the ray passes within `max(c, r + 0.5)`
      of the centre; `path` = len to the foot point of the centre). Generic capture distance
      `c = 0.5 + 0.03·len` mm (perpendicular). Emit an echo with `path = len + distance to the foot
      point`, kind per reflector, amplitude per rule 4 with `wReturn = w(δ)` (transmit × receive
      directivity applies to diffuse scatterers as well) times the size factor `S`.
   c. Move to the intersection. If it is a hole circle or a specular defect segment or an outline
      edge: reflect `dir` about the local normal (`dir' = dir − 2(dir·n)n`), `bounces++`, and if the
      surface is an outline edge or arc: `leg++`; if its tag is `top` (scanning surface) multiply the
      ray's running energy `e` by 0.85 (partial loss into the probe/couplant), else by 0.95; defect
      segments × 1.0. Record a hit for drawing (first 3 legs only).
   d. **Return-to-probe test** after every reflection: intersect the *new* ray with the scanning
      surface segment. If it crosses it at a point within `ra = diameter/2 + len·sin(θ6)` of `E`
      **and** the angle between `dir'` and `−u₀` is `< θ20`, then emit an echo. The displayed
      path is one-way, i.e. half the total out-and-back length:
      `path = (len + dist(pos → crossing)) / 2`, `wReturn = w(angle(dir', −u₀))`,
      kind = tag of the last reflecting surface (`radius` → 'radius', `bottom` → 'backwall',
      `cap`/`root`/`end`/`step`/`brace`/`fusion` → 'geometry', defect segment → 'defect';
      **'corner' when the last two reflections are one outline edge/arc and one planar-defect
      segment in either order**), `x,y` = the last reflection point, `leg` = leg at that reflection.
      The ray then continues normally (it will reflect off the top surface again → multiples).
   e. Grazing rule: if a ray meets a planar defect segment at incidence > 80° from the normal, pass
      through it (no reflection); tips still scatter (b).
   f. Perspex circle: the steel→Perspex interface is a strong reflector (|R| ≈ 0.87): treat the
      circle as a specular reflector with `S = 0.9` (front-face 'perspex' echo); when the 0° centre
      ray enters the circle also emit a far-side 'perspex' echo at path `y_top + 2r·(vComp/2.74)`
      (= 137.7 mm for the V1 insert) with `S = 0.2`.
   g. **V1 slot retro-reflection** (`specimen.retroSlot` true, V1 wide only): the 2 × 5 mm slot cut
      in the TOP face at the arc centre acts as a corner reflector for sound returning to `C`. When a
      returning ray crosses the scanning surface within 1.0 mm of `E` (after the echo of 2d has been
      recorded), relaunch it from `E` along the original launch direction `u₀` with `e × 0.5` instead
      of the normal top-surface reflection. This yields 100/200/300 for angle probes as in the
      original. The emission itself ignores the slot.
3. **Special cases handled by the same loop**: 0° backwall (normal incidence bottom → straight back);
   0° multiples (top reflection ×0.6 each); V1 radius 100/200/300 (0°) and 100 only (angle probes);
   V2 25/100/175 and 50/125/200; corner echo of root cracks (bottom + crack face, either order);
   weld root/cap geometry echoes at half/full skip; lamination echo + shadowed backwall (the
   lamination segment is opaque: the ray reflects off it, so the backwall behind it is never reached;
   partial coverage arises from the fan — some fan rays miss the lamination).
4. **Amplitude** (linear, before gain): `amp = K · w(δ) · wReturn · e · S · D(path) · Z · M`
   - `S` size factor: outline surfaces/arcs 1.0; SDH of diameter d: `min(1, √(d/3))`; planar defect
     segments: `min(1.2, height/4)`; volumetric scatterers: `min(1, height/3)/nSamples^0.5` (so a
     cluster sums sensibly after merging — see 5); tips: 0.12.
   - `D(path)` distance–amplitude with `q = N/max(path, N)` (so D = 1 up to the near-field end):
     outline surfaces/arcs/laminations `D = q^0.5` (keeps 25 mm-plate multiples falling ≈ 3–4 dB
     each like the original); SDHs (cylindrical) `D = q^1.5`; point-like volumetric scatterers and
     tips `D = q²`; planar defect segments `D = q^1.5`.
   - `Z` z-overlap factor (§6.7); `M = 10^(−α·2·path/20)`, α = 0.01 dB/mm shear, 0.005 comp.
   - `K` is `UT.ascan.K_REF`, tuned so the §5.3 reference (3 mm SDH at 50 mm, 60°, 5 MHz, 10 mm → 80 %
     at 34 dB) holds.
5. **Merging**: group echoes by `(kind, defectId|tag, leg, round(path/1.5))`; keep the max `amp`
   and its path; for volumetric groups take `sqrt(sum(amp²))` (incoherent sum). Sort by path.
6. `angleDev` = δ of the winning fan ray. `hits` = reflection/scatter points of the centre ray and of
   the winning rays (for the cross-section highlight dots).
7. Through transmission (`method:'tt'`): receiver aperture = a segment on the opposite surface centred
   where the *centre* ray of the tx probe exits; each fan ray reaching that segment (within ±D/2)
   adds `w(δ)·e` to `transmitted`; echo kind `'transmitted'`, path = length of the centre ray leg
   (T for 0°, T/cosθ for angle). Defects in the path shadow it (rays reflect/scatter away).
8. Tandem (`method:'tandem'`): rx probe (same angle, same side) at `x_rx = probe.x − side·T·tanθ`,
   aperture on the top surface ±D/2, accepts rays travelling within θ20 of `(−side·sinθ, −cosθ)`
   mirrored… i.e. of the direction `(+side·sinθ, −cosθ)` — the ray comes up toward rx after bouncing
   off the bottom and a vertical reflector. Path convention = half the total tx→reflector→rx length.
### 6.2 A-scan synthesis
`UT.ascan.synth({echoes, probe, derived, instrument, nSamples=1000}) → AscanResult`
```js
AscanResult = { samples: Float32Array(nSamples) /* 0..120 (% FSH) */, pathAt(i), rf: Float32Array|null,
                echoesOnScreen: [{echo, xDiv, ampPct}], noiseSeed, initialPulse: bool }
```
- Sample i ↔ path `p = delay + i/(n−1)·range`.
- Each echo → envelope `ampPct · exp(−((p − path)/σ)²)` with σ = `0.5·(v/f)·cycles`, cycles = 1.5
  (damping → 0.9), plus for `rf` a carrier `cos(2π·2(p−path)/λ)` (p is one-way path, so the period
  in displayed path is λ/2).
- Initial pulse (single-crystal 0° only — angle probes are zeroed, twin crystal has none):
  saturated ringing from p=0 decaying over the dead zone
  `dz = 3·λ + 1.5` mm. Twin-crystal: none.
- Grass: uniform noise 0–2 % (×3 in AUT coarse material option; ignore otherwise), deterministic per
  frame via a seeded LCG (so QA is repeatable): `seed = round(probe.x*7 + probe.z*13)`.
- Apply reject, clip at 120.
- Gates: `UT.ascan.evalGates(ascan, instrument, derived, specimen, probe) → Readouts`:
```js
Readouts = { gate: [{ peakPct, path, xDiv, sd, dp, leg, dacPct, dBToDac, echoKind }], primary: {...same, for activeGate},
             textSP: '11.03', textSD: '09.58', textDP: '05.51', textAmp: '34%' }
```
- `UT.ascan.dacCurve(instrument, derived) → [{path, pct}]` (interpolated, clipped ≤ 100 at refGain).
- `UT.compute()` lives here: reads `UT.state`, calls probe.derive → rays.trace → synth → evalGates
  (or TOFD/AUT/PA equivalents by mode) and stores `UT.frame`. It is the ONLY function that reads
  `UT.state` inside 40-ascan.js. Exposed as `UT.ascan.compute()` and aliased `UT.compute`.

### 6.3 Zero-degree specifics
- 0° probe, `mode = 'comp'`, v = 5.90 (`material.vComp`). Backwall multiples emerge from §6.1
  (top ×0.85 per bounce and D = q^0.5) — no extra decay law. Lamination (planar, horizontal) → strong echo at its depth,
  backwall reduced by coverage `c = overlap(beam footprint, lamination x-extent)/footprint`,
  and repeated lamination multiples.
- Step wedge: backwall at the local step thickness under the probe centre.
- Perspex insert: see §6.1 2f (front 0.9, far side 0.2 at steel-equivalent path).

### 6.4 Angle-probe specifics
- The index point is the emission point; the wedge is drawn but sound is launched at the index.
- Skips: leg 1 (index → bottom), leg 2 (bottom → top), …; `display.skips` limits both drawing and
  echo search. Colour code `propagation`: leg 1 red, leg 2 blue, leg 3 green, leg 4 orange;
  `geometry`: rays coloured by the surface they last reflected from (bottom = blue, top = red,
  end/radius = green, weld = orange).
- Surface distance readout `SD = path·sinθ` for leg 1 and `SD = path·sinθ` for all legs (the
  projection is linear in path), `DP` folded (§5.3).

### 6.5 Through transmission / tandem
See §6.1 items 7–8. UI: `tt` draws the receiver on the opposite surface (hollow outline, same colour);
`tandem` draws the rx wedge hollow on the same surface. A-scan in `tt` shows a single transmitted pulse
(amplitude 100 % × transmission factor at refGain) and no echoes; in `tandem` only tandem echoes.
### 6.6 TOFD (50-tofd.js)
- Tx at `x = +pcs/2`, Rx at `x = −pcs/2` (both angle θ, compression mode! TOFD uses longitudinal
  waves: v = 5.90; wedge 2.74 → wedge angle 23.7° for 60°). Lateral wave time `tL = pcs/vL + 2·wd`,
  backwall `tB = √(pcs²+4T²)/vL + 2·wd` where **`wd = derived.wedgeDelayUs / 2`** (one-way wedge
  delay; derived.wedgeDelayUs is two-way = 8.76 µs for the 12 mm wedge path). Times in
  `UT.test.tofd()` and `events[].tUs` are ABSOLUTE (include 2·wd); the TOFD screen axis and the
  status-bar values 'x.xx micro sec + delay' are wedge-zeroed (t − 2·wd); default screen range
  20 µs, delay 0 (so 10.17 / 12.22 are on screen for pcs 60, T 20). Any point (x, y) (defect tip) gives `t = (√((x−xt)²+y²) + √((x−xr)²+y²))/vL + 2·wd`.
  Depth from time: `d = ½·√((t−2wd)²·vL² − pcs²)`.
- Signals: lateral wave (RF, negative-first phase), backwall (positive-first), upper tip (phase
  inverted relative to lateral) and lower tip (same as lateral) of every planar defect within the
  beam (x within beam footprint = between the probes ± 10 mm, z overlap with probe.z); volumetric
  defects give a single tip pair with small amplitude. Amplitudes relative: lateral 0.6, backwall
  0.9, tips 0.25·min(1, height/2). Display in µs: `tofd.rangeUs` (default 20), `tofd.delayUs`.
- `UT.tofd.ascan({specimen, probes, defects, instrument}) → {t: Float32Array, rf: Float32Array, events:[...]}`
- D-scan: `UT.tofd.runScan(state)` steps `z` from 0 to L in `step = 1 mm` increments (cheap: 300 columns
  × 512 samples), each column = RF samples mapped to grey (0 = black, 0.5 = mid grey, 1 = white);
  stored in `state.tofd.scan = {z0, z1, step, n, columns: Float32Array[]}`. Rendered in the TOFD
  panel: vertical axis = z (scan), horizontal = time (or vice versa as in the screenshot: the scan is
  vertical, time horizontal — the UTman image shows scan axis vertical). Crosshair follows probe.z
  and the cursor; clicking on the image sets probe.z. "Run Scan" animates (rAF, 8 columns/frame) and
  can be stopped; "CLEAR" clears.

### 6.7 Along-weld (z) coupling & skew
- Beam footprint half-length along z at the reflector: `hz = path·tan(θ20dB) + diameter/2`.
- Overlap factor `Z = clamp(overlap([probe.z − hz, probe.z + hz], [zFrom, zTo]) / (2·hz), 0, 1)^0.5`
  for defects; holes span all z (Z = 1).
- Skew: planar defect and geometry echo amplitude ×`UT.math.skewWeight(skew)` =
  `max(0.05, exp(−ln2·(skew/6°)²))` (−4.2 dB at 5°, −17 dB at 10°, floor −26 dB); volumetric and
  SDH ×1. The compass dial snaps every 1° (Shift-drag = 5°).
- Sizing (6 dB drop): amplitude vs z follows the overlap curve, so moving the probe along z past the
  defect end drops the echo naturally.

### 6.8 AUT (55-aut.js)
- Fixed probe x (user chosen) sweeping z at 1 mm steps: for each z compute the A-scan (reuse
  `UT.rays.trace` + `UT.ascan.synth`, with probe.z = z), evaluate 3 gates (`aut.gates[i]`: start, width,
  level) → amplitude % and TOF (path) → `scan.amp[i][z]`, `scan.tof[i][z]`.
- Strip chart rendering: a vertical strip per gate: amplitude bar (blue background, white bar length ∝
  amp %, red line at the gate level) and TOF strip (position ∝ path within the gate → coloured by amp).
  Colour map (white <10 %, blue 10–30, green 30–50, yellow 50–80, red >80).
- Controls: gate select (radio 1/2/3), Level, Width, Start sliders, "Gates Same", RDT/RTD (rectified
  display vs raw), Rev Map (reverse), Run/Stop/Clear. Scan animates 6 columns/frame.

### 6.9 Phased array (S-scan)
- Angles from `paFrom` to `paTo` step `paStep`; for each angle compute echoes (fan of 5 rays, 1 leg
  + optional 2nd leg) and paint a sector: pixel = (path·sinθ, depth) with depth folded per §5.3
  (leg 1: path·cosθ; leg 2: 2T − path·cosθ), colour map by amp %.
  Render in place of the A-scan (EPOCH screen shows "S-SCAN"), cross-section shows the wedge of rays.

---

## 7. UI layout & look (90-app.js, style.css, 70-instruments.js)

Fixed-ratio desktop layout that mirrors UTman600 (see `RcSqNFlOF4E.jpg`):

```
┌ title bar: "UTsim — UTman-style Ultrasonic Simulator  |  NDT Verification and Coaching" ───────┐
│ menu: File  Probes  Step Wedge  Weld  Defects  Options  Help                                       │
│ toolbar: [■0°][■45°][■60°][■70°] | [V2][V1][DAC] | [PLOT][DAMP][SIZE] | [DEFECT][HIDE][CLEAR] |    │
│          [BEAM][RAD] | [PIPE][TKY][TOFD][AUT]      (icons drawn in CSS/inline SVG, label below)    │
├───────────────────────────────┬───────────────────────────────────────────────────────────────────┤
│ INSTRUMENT (EPOCH 600 skin)   │ PLAN VIEW canvas (grey) with weld band, defects, probe, compass    │
│  A-scan canvas inside         │ dial (blue ring, red needle) top-right, z ruler on the right       │
│  softkeys, keypad, F1–F5, P1–7│                                                                   │
├───────────────────────────────┴───────────────────────────────────────────────────────────────────┤
│ X ruler (−160 … 0 … 160 mm) with blue probe marker                                                 │
│ CROSS SECTION canvas: plate grey, weld profile, probe shoe, beam, defects, depth ruler at left      │
├────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ status bar: "Angle of Sound Transmission in Perspex Shoe=47.1°  Velocity in Wedge (Shoe)=2740 m/s   │
│  [Shear Wave Angle=60.0°  Velocity=3240 m/s]   Pos: 67 mm   Range 100 mm   AMP=30dB   <hint>"       │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
+ floating draggable windows: "3D Pipe" (bottom-right), "Defects" editor, "TOFD"/"AUT" panels,
  "Plotter", "Weld", "Probe angle in wedge", "Trade Test", "Lessons", "Options".
```
- Page background cream `#fdfbd8` like the original; canvases have 1 px dark borders; rulers black
  ticks on cream; specimen grey `#8c8c8c`; weld region hatched darker; defects red `#e00000`; holes
  white with black outline; probe colours per angle (`UT.consts.PROBE_COLOURS`); selected/hover
  probe gets a yellow glow. Fonts: system UI (`Segoe UI, Arial, sans-serif`), 12–13 px.
- Windows/dialogs: Win-classic style (grey `#ececec` frame, blue-gradient title bar `#0a246a→#a6caf0`,
  white close ✕), draggable by title, no external libs.
- The instrument panel column is 440 px wide at ≥ 1280 px viewport; the whole app is a CSS grid that
  scales down to 1024 px (canvases resize with `ResizeObserver` and re-fit their mm→px scale).
- Keyboard: `←/→` move probe 1 mm (Shift ×10), `↑/↓` move z, `+/−` gain 1 dB (Shift 6 dB),
  `R` toggle range 50/100/200/400, `F` freeze, `P` peak mem, `H` hide, `B` beam, `1–4` probe angle,
  `Esc` closes the top dialog.

### 7.1 EPOCH 600 skin (70-instruments.js)
DOM+CSS replica (dark grey body, rounded corners, `EPOCH 600` label, LEDs 1 2 3, power button,
left keypad: dB / SAVE / ▲▼◀▶ ✓ / ❄ / ↶ / GATES / RANGE / 2ND F / PEAK MEM; right column NEXT GROUP,
F1–F5; bottom P1–P7; screen area 330 × 250 px with: header row (`NONAME00 | ID 1`), readout row
(`▶ SP  ⇒ SD  ↓ DP` small + big green digits for the active readout + unit `mm`), A-scan canvas
(black, green grid dots, green trace, red gate bars, DAC curves in yellow/orange dashes, peak-mem
trace in dim green), right softkey column (page 1: Gain / Range / Delay / Basic / Pulsar / Rcvr /
Trig / Auto Cal; page 2: Gain / Range / G1Level / Gate1 / Gate2 / Gate Setup; page 3: Gain / DAC
Setup / Record / Erase / Curve / …; page 4: Display (Rectify full/RF, Grid), page 5: Units/Reset),
bottom softkeys `10.0dB 20.0dB 30.0dB 40.0dB 60.0dB` (set gain), page indicator `1/5`.
Interaction: click a softkey to select the parameter (highlight), then ▲▼ (or mouse wheel over the
screen, or drag on the value) to change it; `dB` key selects gain; `2ND F` + `dB` = ref gain lock;
`RANGE` cycles range presets; `GATES` selects gate 1/2; `PEAK MEM` toggles peak memory; ❄ freeze.
### 7.2 EPOCH 4 skin (ASME)
Black handheld with a monochrome text screen: `GAIN 40dB RANGE 50.0 REJ 0% MIN DEPTH ↓20.00 mm`,
A-scan line trace, parameter block (`VEL 5900 ZERO 00.0 ANGLE 60.0 THICK 20.0 FULLWAVE ENERGY MED
DAMPING 150 PULSE-ECHO FILTER STD FREQ 5.00MHz`), gate table (Gate/Start/Width/Level/Alarm), softkeys
`1-START 1-WIDTH 1-LEVEL AUTO-80`, keypad (GAIN ▲▼◀▶ ENTER FREEZE SAVE THICK SAVE WAVE GATE 1 GATE 2
PULSER DISPLAY PEAK MEM DEPTH %AMP CAL ZERO OFFSET RANGE VEL ANGLE 2ND F OPTION ID ON/OFF).
`AUTO-80` sets gain so the gated peak reads 80 %.
### 7.3 USK7 analog skin
Blue CRT (`#0b1fa8` background, lighter grid, cyan trace `#7ff`), knobs RANGE, AMP (slider), X-SHIFT,
SUPPRESSION, OFF button; `◀ ▶` buttons per knob; no digital readouts (trainee reads the screen).
All three skins render into the same instrument container and switch via Options ▸ UT Set.
The A-scan renderer `UT.instruments.drawAscan(ctx, frame, state, theme)` is shared.

### 7.4 Plan view (62-view-plan.js)
Grey field; weld as a vertical hatched band at x=0 (width = cap width) with a cap-shading; z ruler at
right (mm); defects as red rectangles (x-extent × z-extent) or red arcs for pipe (still drawn in the
unrolled plan); probe symbol: square in probe colour with a white dot at the index point, rotated by
skew; beam footprint dashed lines; raster trail (last 200 probe positions as faint dots when
`lamination` mode). Compass dial (r = 60 px) top-right: blue ring, red needle; drag to set `skew`
(snaps every 5°, double-click resets). Drag the probe symbol to move x and z.

### 7.5 Cross-section (60-view-cross.js)
Draw order: background cream → specimen polygon grey (weld region hatched darker with cap/root
outlines) → holes → Perspex (light blue) → defects (red, filled polylines with 3 px stroke; hidden
when `display.hide`) → beam (fan rays faint grey, edge rays dashed, centre ray solid coloured per
leg/colour-code; hidden when `!display.beam` or `hide`) → hit markers → probe shoe (trapezoid
sloped at the wedge angle, colour by angle, index mark line) → tandem/TT/TOFD second probe → depth
ruler (left) → labels. Interaction: drag probe (x; Shift-drag = z); mouse wheel anywhere over the
instrument or cross-section = gain ±1 dB. In DEFECT edit mode, left-drag paints a defect polyline (brush), released → defect
created/updated via the editor; right-drag erases. Cursor readout: status "Pos: x mm  Depth: y mm".

### 7.6 3-D window (64-view-3d.js)
Canvas 260 × 200: simple perspective projection of a cylinder (pipe) with the weld ring, or a slab
(plate). Draw defects as red patches at their z (angular position) and probe as a coloured block
on the surface at (x, z). Drag to rotate (yaw/pitch), wheel to zoom. Light shading by normal·light.

### 7.7 Plotter (66-view-plotter.js)
Beam-plotting card overlay above the cross-section (like `iZMI8ZAnHww.jpg`): a chart with depth
lines every 10 mm (and the SDH depth lines labelled `A5 IOW Block 13mm SDH` etc. in red), range arcs
every 10 mm of beam path (blue), the probe centre line at the selected angle, mirror image below
(full-skip) toggle "Hide Mirror Image", and "Erase Plotting". Clicking on the chart plots a point
(x = stand-off from the index, y = depth); points connect to show the measured beam edges. Readouts
`HALF SKIP BEAMPATH DISTANCE`, `HALF SKIP STANDOFF`, `FULL SKIP …`. The PLOT workflow (§8.4) adds the
20 dB-edge marks automatically when the user presses "Mark 10 % edge" with the probe at a position.
Radiograph (RAD): a strip (film) image of the weld along z: film grey, weld slightly lighter band,
defects as dark indications (planar = thin lines, volumetric = blobs), with IQI-ish marker and the
z-scale. Sizing (SIZE) overlay: stores probe z when user presses "Mark" at −6 dB positions and shows
the measured length vs the true length (after reveal).

---

## 8. Modes & workflows (80-modes.js)

`UT.modes.enter(modeName, opts)` sets `state.mode`, swaps the specimen, resets probe position to a
sensible default, opens/closes floating panels, sets status hints. `UT.modes.exit()` returns to
`'weld'`. Toolbar buttons that are modal (V1, V2, DAC, PLOT, TKY, TOFD, AUT) are toggles.

1. **weld** (default): plate or pipe weld with the editor's defects. Status hint
   `LEFT mouse button/drag to move the UT Probe`.
2. **Auto-cal (EPOCH)**: on `step` (or V1 narrow face): press `Auto Cal` → wizard: "Place probe on
   the 10 mm step, press ✓" → captures the gated peak time `t1` (absolute µs, §5.3) for known
   `d1 = 10` → "Place on the 25 mm step, press ✓" → `t2`, `d2 = 25` →
   `cal.vel = 2·(d2 − d1)/(t2 − t1)`, `cal.zero = t1 − 2·d1/cal.vel`. The wizard first sets a
   deliberately wrong `cal = {vel: 5.60, zero: derived.wedgeDelayUs + 0.4}` (lesson 12) so trainees
   see the readouts move to the correct 10.0 / 25.0 mm; `instrument.cal = {vel: null, zero: null}`
   (= calibrated) everywhere else. Use d1 = 10 (not 5: the single-crystal dead zone is ≈ 5 mm).
3. **DAC record**: on `dac` block: status `Set Amplitude and press record button, then draw curves`;
   the "Record" softkey (or `R` in the DAC panel) stores `{path: readout SP, ampPct}` at current gain
   (first point fixes `refDb`); ≥ 2 points → curve drawn; "Draw Curves" toggles −6/−14 dB; Erase.
   Also enabled in weld mode (curve persists and follows gain).
4. **PLOT** (beam spread at 20 %): on `iow`: user positions the probe to maximise the 13 mm SDH echo,
   sets ref gain (say 80 %), moves forward until the echo drops to 10 % (−20 dB), presses "Mark Edge"
   → plots the point (stand-off, depth 13); repeat backward; repeat for 19/25/43 mm. The chart then
   shows the beam envelope lines through the marks (front edge/back edge/centre). Mirror image shows
   the full-skip reflection.
5. **SIZE**: sizing panel: choose 6 dB-drop or 20 dB-drop; "Mark L" / "Mark R" record probe.z at the
   drop points, shows length; "Depth" from readout. Compare after reveal.
6. **DEFECT editor**: floating window (`iLxs-95BAWQ.jpg`): select defect 1–8 (radios), fields
   SEPARATION (mm, gap between defect and weld centre = x offset), LENGTH (mm along z), HEIGHT (mm),
   type dropdown (planar/volumetric/crack/LOF/porosity/slag/lamination/root), Z position (From),
   APPLY TO ALL, OK; buttons Delete All / Delete N / Load Def / Save Def (localStorage JSON +
   download/upload via textarea copy-paste — no file download links); presets dropdown (calls
   `defectPresets`); plate: linear z bar; pipe: **circle view** ring with labelled positions every
   40 mm and red arcs for defects; drag on the ring to set From/To. Drawing brush in the cross-section
   is active while the editor is open (status `LEFT mouse button/drag to draw defect.`).
7. **HIDE**: hides defects and the beam (blind practice). **BEAM** toggles beam only.
8. **RAD**: shows the radiograph strip panel. **PIPE**: switches plate ⇄ pipe (WT/OD from the Weld
   dialog) and shows/hides the 3D window.
9. **TKY**: TKY window: brace angle 30–90, brace thickness, chord thickness, offset; probe on chord.
10. **TOFD**: TOFD panel (A-scan RF with Range/AMP/X-shift, D-scan image, Run Scan/Stop, Clear),
    status `Lateral Wave: x.xx micro sec + delay   BackWall: y.yy micro sec + delay   Depth: d`
    (depth of the cursor time). PCS control (mm) and angle 45/60/70.
11. **AUT**: AUT panel (strip charts + gate panel + Run/Stop/Clear).
12. **Trade test**: "Trade Test" window: Start → generates 3–6 random defects (types/positions/lengths
    from presets, hidden, `display.hide = true`, defect editor locked), timer; candidate fills a
    report table (defect #, z start, length, depth, type) with "Add row"; Submit → reveal: draws the
    true defects, scores each reported row by position tolerance (±10 mm z, ±3 mm depth, type match)
    and lists misses/false calls; percent score. "New test", "Reveal".
13. **Lessons**: window listing the 22 videos (title, 1-line KO/EN description); clicking loads the
    corresponding scenario (mode, specimen, probe, instrument settings) and shows the instructions
    text in the window. `UT.modes.lessons` = array of `{n, title, ko, en, setup(): void, steps: [..]}`.
14. **lamination**: laminationPlate with 2–3 laminations, 0° probe, raster trail in plan view.

`Options` menu: UT Set (EPOCH 600 / EPOCH 4 / USK7), Units (mm/inch display only), Colour code,
Show plan view / 3D window / legend, Reset layout, Language (EN/KO labels for menus & status — keep
an `UT.i18n.t(key)` with a small dictionary; default EN, KO for tooltips/lesson text always shown).
`Help` menu: About (credits: inspired by UTman/utsim.co.uk, Paul Rawlinson; this is an independent
re-implementation), Quick guide (KO+EN), Keyboard shortcuts, Lessons.
`File` menu: New (reset), Save/Load setup (localStorage), Export A-scan PNG (canvas → open in new tab
via `toDataURL` shown in an <img> inside a dialog; no download links), Print.
`Weld` menu: Weld dialog (thickness, type single-V/double-V/none, bevel, root gap, cap width/height,
root height, plate length; pipe OD (inch dropdown 4/6/8/10/12 + mm) & WT), presets.
`Probes` menu: exactly the items listed in §1.1 (checkmarks reflect state).
`Step Wedge` menu: choose step sets (5–25 ×5, 10–50 ×10, custom), enter step mode.
`Defects` menu: Open editor, presets submenu, Delete all, Hide/Show, Import/Export.

---

## 9. Status bar
Left segment (physics line) always: for angle probes
`Angle of Sound Transmission in Perspex Shoe=47.1°  Velocity in Wedge (Shoe) = 2740 m/s  [Shear Wave Angle=60.0°  Velocity=3240 m/s]`;
for 0°: `[Comp' Wave Angle=0.0°  Velocity=5900 m/s]`. Middle: `Pos: 67 mm` `Range 100.0mm` `AMP=30dB`
and mode-specific readouts (`WT 20mm  Dia 6inch`, `25mm thickness. Echoes 25, 50, 75, 100 etc`,
`100mm Radius. Echoes 100, 200, 300, 400 etc`, `Depth = 4.0mm`). Right: contextual hint.

---

## 10. Persistence
`localStorage['utsim.v1']` = JSON of `{probe, instrument, display, defects, weldOpts, utSet}` saved
on change (debounced 500 ms) and restored at boot (guarded try/catch; ignore if invalid).

---

## 11. Test API (`window.UT.test`) — MUST be implemented exactly (QA drives the page with Playwright)
```js
UT.test.setProbe({angle, x, z, skew, crystal, method, freq, diameter}) // partial ok; returns derived
UT.test.setInstrument({gain, range, delay, reject, damping, rectify, gates:[...]})
UT.test.enterMode(name, opts)          // same as UT.modes.enter
UT.test.loadSpecimen(id, opts)         // 'plate-weld' | 'pipe-weld' | 'v1' | 'v2' | 'step' | 'iow' | 'dac' | 'tky' | 'lamination-plate'
UT.test.setDefects(arr)                // replaces state.defects (validated)
UT.test.addPreset(name, opts)          // adds a preset defect; returns it
UT.test.compute()                      // synchronous recompute; returns UT.frame
UT.test.echoes()                       // frame.echoes sorted by path: [{path, ampPct, kind, leg, x, y}]
UT.test.ascan()                        // {samples: number[], range, delay}
UT.test.readouts()                     // frame.readouts
UT.test.state()                        // deep clone of UT.state (without scans)
UT.test.click(toolbarId)               // e.g. 'tb-60', 'tb-v1', 'tb-tofd' (toolbar button ids are 'tb-<name>')
UT.test.menu(path)                     // e.g. 'Probes/Zero Probe - Twin or Single Crystal/Twin Crystal' — label path, exact visible labels (trimmed, case-sensitive); returns false if disabled/missing
UT.test.tofd()                         // {events:[{kind, tUs, depth}], lateralUs, backwallUs}
UT.test.runAutScan(); UT.test.runTofdScan()   // synchronous full scan (no animation), returns scan summary
UT.test.lessons()                      // list of lesson titles
UT.test.trade.start(seed); UT.test.trade.truth(); UT.test.trade.submit(rows) → score
UT.test.version                        // UT.VERSION
```
Validation contract (`setProbe` / `setInstrument`, implemented in 40-ascan): numeric fields are applied
only when they coerce to a finite number (then clamped: gain 0…110, range 10…1000, delay −50…1000,
reject 0…80, gates 1 mm / 1 %), otherwise the previous value is kept; `side` → ±1; `skew` → 0..360;
`crystal` / `method` / `surface` / `mode` / `rectify` are checked against their enum lists (unknown values
keep the previous one); gate entries that are not objects are ignored; `setInstrument({gates})` is capped at the
two instrument gate slots (G1/G2). State never receives NaN or strings for numeric fields.
Toolbar button ids: `tb-0, tb-45, tb-60, tb-70, tb-v2, tb-v1, tb-dac, tb-plot, tb-damp, tb-size,
tb-defect, tb-hide, tb-clear, tb-beam, tb-rad, tb-pipe, tb-tky, tb-tofd, tb-aut`. Menu bar items have
ids `menu-file, menu-probes, menu-stepwedge, menu-weld, menu-defects, menu-options, menu-help`.
Main canvases ids: `cv-ascan, cv-plan, cv-cross, cv-3d, cv-ruler`. Status bar id `statusbar`.
Instrument container id `instrument`. Floating windows have class `.win` and `data-win="<name>"`.

### 11.1 Acceptance checks (QA will assert these; implementers must self-verify)
1. 0° single-crystal on `v1` narrow face (25 mm), range 125: echoes at 25/50/75/100 (±0.5 mm) with
   decreasing amplitude (each multiple 2–5 dB below the previous); initial pulse present; twin
   crystal → no initial pulse.
2. `v1` wide, index at x = 100, range 400: 0°, 45°, 60° and 70° probes ALL give echoes at
   100/200/300 (±1 mm, decreasing amplitude — the slot retro-reflection 2g provides the angle-probe
   multiples); status `100mm Radius. Echoes 100, 200, 300, 400 etc`. V2 wide, index x=60, range 250:
   45° facing left (side +1) → 25, 100, 175; facing right (side −1) → 50, 125, 200 (±1 mm; decreasing).
3. 60° probe: derived wedge angle 47.1° ± 0.2; 45° → 36.7°; 70° → 52.6° (2.74/3.24 Perspex/steel).
4. 60° probe on `iow`, 13 mm SDH at (240, 13): with probe side +1 at `x = 240 + 13·tan60 = 262.5` the
   SDH echo path = 26.0 mm (±0.5) and it is the max-amplitude position within ±5 mm scans.
5. Readouts for that echo: SP≈26.0, SD≈22.5, DP≈13.0 (±0.5).
6. Gain +6 dB doubles amplitude % (below clipping); the 10/20/30/40/60 dB softkeys set gain.
7. Range 100 → an echo at 50 mm sits at division 5.0 (`xDiv`); delay 20 → division 3.0.
8. `plateWeld({T:20, rootHeight:0, capHeight:0})`, 60°, root crack preset (vertical planar at x=0,
   y=17..20): 'corner' echo at path = T/cos60 = 40 (±1) with probe at x ≈ T·tan60 = 34.6 (±3), gone
   (> 20 dB down) when the probe is ±15 mm away. With the default weld (rootHeight 1.5) the preset
   spans y = T−3 … T+rootHeight and the 'corner' echo still appears at path ≈ 40 (±2, maximum near
   x ≈ 38); additional weak 'tip'/'geometry' echoes near 44 mm are allowed.
9. LOF preset on the right fusion face (bevel 30°): the 60° beam is normal to the face in the SECOND
   leg — maximum with the probe at x ≈ x_f + (2T − y_f)·tan60 (≈ 60 mm for T 20, bevel 30, rootGap 2,
   rootFace 2, where (x_f, y_f) is the face midpoint); scan x = 45…70 for 60° and 35…60 for 45°:
   the 45° best amplitude is ≥ 6 dB below the 60° best.
10. Lamination plate: 0° over the lamination gives the lamination echo at its depth and the backwall
    drops ≥ 6 dB versus a clean position.
11. TOFD: pcs 60, T 20, vL 5.90, wedge 12 mm: `UT.test.tofd()` lateralUs = 10.17 + 8.76 = 18.93,
    backwallUs = 12.22 + 8.76 = 20.98 (±0.05, absolute); tip events for a planar defect of height 5
    at y 8..13 (z overlapping probe.z) lie between them; depthFromTime(backwallUs) ≈ 20.0.
12. AUT synchronous scan over a defect of z 120..150 shows gate-1 amplitude > level only within
    z ≈ 110..160.
13. Trade test: `start(42)` twice yields the same truth; submitting the truth rows scores 100.
14. `python3 build.py` produces `utman_simulator.html` < 900 kB, no external URLs, no console errors
    on load in headless Chromium, and every `tb-*` click leaves no console errors.

---

## 12. Coding conventions
- 2-space indent, semicolons, single quotes, `'use strict'` in each IIFE, JSDoc on public functions.
- Canvas drawing: always `ctx.save()/restore()`; devicePixelRatio-aware (`UT.dom.fitCanvas(canvas)`
  in 00-core sets width/height × dpr and returns ctx scaled).
- No `innerHTML` with unescaped user strings. Use `UT.dom.h(tag, attrs, children)` helper from
  00-core for DOM building.
- Every module exposes `UT.<name>.__selftest()` returning `[]` or a list of failed assertion strings
  (cheap invariants) — run at boot when `location.hash === '#selftest'` and results logged.
- Do not use `alert/confirm/prompt`; use `UT.dom.confirm(msg) → Promise<boolean>` (custom dialog).
- Keep each source file ≤ ~1500 lines; split helpers sensibly inside the file.
- Comments in English; UI strings in EN with KO in tooltips/lesson text where the spec says.

---

## 13. Ownership table (who creates what) — binding for parallel implementation

| Artefact | Owner file |
|---|---|
| `UT.core`, `UT.math`, `UT.dom.*` (h, win, field, button, confirm, alert, fitCanvas), `UT.set/setIn/status/bus`, `UT.i18n`, `UT.test.state` | `00-core.js` (DONE) |
| `UT.specimens.*`, defect presets/helpers | `10-specimens.js` (DONE) |
| `UT.probe.*` | `20-probe.js` (DONE) |
| `UT.rays.trace`, `UT.rays.describe` | `30-raytrace.js` |
| `UT.ascan.*`, `UT.compute`, `UT.frame`, `UT.test.setProbe / setInstrument / compute / echoes / ascan / readouts` | `40-ascan.js` |
| `UT.tofd.*` physics + **TOFD panel window** (`data-win="tofd"`), `UT.tofd.probePositions(state)`, `UT.test.tofd`, `UT.test.runTofdScan` | `50-tofd.js` |
| `UT.aut.*` physics + **AUT panel window** (`data-win="aut"`), `UT.test.runAutScan` | `55-aut.js` |
| `UT.views.cross` (canvas `cv-cross`) + X ruler (canvas `cv-ruler`), probe drag, brush events (`bus 'brush'`, `'brush-erase'`) | `60-view-cross.js` |
| `UT.views.plan` (canvas `cv-plan`), compass dial, `drawCircleView`, `drawLinearBar` | `62-view-plan.js` |
| `UT.views.pipe3d` + window `pipe3d` (canvas `cv-3d`) | `64-view-3d.js` |
| `UT.views.plotter` (window `plotter`), `UT.views.radiograph` (window `rad`), `UT.views.sizing` (window `size`) | `66-view-plotter.js` |
| `UT.instruments.*` (skins, `cv-ascan`, `drawAscan`, `css` string) | `70-instruments.js` |
| `UT.modes.*` (enter/exit, lessons + window `lessons`, defect editor window `defects`, trade test window `trade`, TKY window `tky`, autoCal, dac, plot, sizing workflows), `UT.test.enterMode / loadSpecimen / setDefects / addPreset / lessons / trade` | `80-modes.js` |
| `UT.app.*` (layout, menus, toolbar, status bar, keyboard, persistence, boot), dialogs `weld`, `wedge`, `options`, help/about windows, `UT.test.click / menu`, `src/style.css` (incl. `.win*`, `.btn`, `.fld` styling) | `90-app.js` |

Rules: a module may CALL another module's API only through `UT.<name>` and must guard with
`if (UT.x && UT.x.fn)` when the other module is optional at boot (views/instruments/modes/tofd/aut).
Windows are created lazily on first `open()` via `UT.dom.win({name})`; `90-app.js` toggles them from
menus/toolbar by calling the owner's `open/close/toggle`. `index.html` loads `style.css` then
the scripts in numeric order (module CSS is injected at runtime via `UT.dom.injectCss`).

### 13.1 Events on `UT.bus`
| Event | Payload | Emitter → listeners |
|---|---|---|
| `state` | `{keys, patch}` | `UT.set` → anyone (views refit when `specimen` changes) |
| `render` | `UT.frame` | `UT.requestRender` → all views/instruments/panels draw |
| `status` | `state.status` | `UT.status` → app status bar |
| `brush` | `{pts:[{x,y}], done:boolean}` | cross view → modes.defectEditor |
| `brush-erase` | `{x, y, r}` | cross view → modes.defectEditor |
| `mode` | `{name, prev}` | modes.enter → app (toolbar pressed states), views |
| `win:show/hide/close` | win api | dom.win → app |

---

## 14. Fidelity addenda (from the reference screenshots) — these OVERRIDE §5–§9 where they differ

### 14.1 Cross-section look (60-view-cross)
- Fixed scale: `scale = canvasWidth / 320` px per mm for weld/DAC/IOW/step/lamination specimens
  (10 mm ≈ 40 px at 1280 wide); the specimen is centred on x = 0 (welds) or on its extents centre
  (blocks) and **clipped** by the canvas if taller/wider (no refit). `toPx/toMm` use this scale.
- Weld drawn as **outlines only** (1 px `#d0d0d0` bevel lines from `weld.fusionFaces`, cap and root
  bulges from the outline) — no hatch in the cross-section (hatch only in the plan view).
- Angle probe shoe = "house" pentagon (front-top corner sloped at the wedge angle) 24 × 14 mm in the
  probe colour with a short green index line beneath the index point; 0° probe = square 20 × 18 mm
  with a centre tick and a cyan contact line; TT receiver / tandem rx / TOFD rx = same shapes
  hollow. Planar defects = 3 px red lines; volumetric = red filled blobs; the selected defect (editor
  open) gets a blue bounding rectangle. Hidden defects (`display.hide`) are not drawn.
- Beam: default `display.colourCode === 'none'` → all rays 1 px dotted `rgba(255,255,255,0.55)`
  (centre ray too). `propagation`/`geometry` use the palettes in `UT.consts`. `singleLine` draws the
  centre ray only (solid 1.5 px). 0° beam = a ladder of parallel dotted vertical lines from the
  probe to the backwall (width = crystal diameter). Only the first `display.skips` legs are drawn.
- Caption `CROSS SECTION` 12 px black at the top-right above the plate; depth ruler at the left
  (ticks every 5 mm, labels every 10). For `spec.id === 'iow'` draw dashed vertical guide lines from
  the surface to each SDH with the depth label at the top. For `spec.retroSlot` draw the 2 × 5 mm
  notch at (100, 0). TOFD mode: draw the lateral wave as a 2 px yellow line along the surface
  between the two index points.
- X ruler (`cv-ruler`, drawn by 60-view-cross with the same `toPx`): ticks every 2 mm, taller
  every 10 mm, labels every 10 mm **unsigned** (`160 … 10 0 10 … 160`) for welds (0 at the weld
  centre); for blocks labels are the block x (0…300 from the left end); blue probe marker at
  `probe.x`; clicking on the ruler moves the probe there.
- V1/V2 modes (§14.8) replace the plan view + ruler + cross-section by ONE oblique block drawing.

### 14.2 Plan view (62-view-plan)
- Scrolling **z window**: visible height = `canvasHeight / scale` mm (≈ 65 mm with the shared
  scale); `zTop = clamp(probe.z − 30, 0, L − window)`; z ruler on the right, ticks every 5, labels
  every 10, blue tick at `probe.z`. The X scale is the SAME as the ruler/cross-section (`UT.views.cross.toPx`).
- Weld band: vertical hatched band of `weld.capWidth` at x = 0 with a rippled cap texture.
- 0° probe = filled **circle** of diameter D in the probe colour; angle probe = rectangle 24 × 16 mm
  with a lighter 4 mm front strip and a white 3 px dot at the index (front) edge, rotated by skew.
- Beam footprint = three dashed white lines (centre and ± θ20dB) from the index to x = 0 (or to the
  end of the last drawn leg).
- Defects: red rectangles (x extent × z extent); laminations wide red rectangles.
- Compass dial (`PLAN VIEW` label to its left): blue ring r = 60 px, red needle; drag → `probe.skew`
  snapping 1° (Shift: 5°); double-click → 0. Hidden in dac/v1/v2/tky/plot modes (§14.7).
- Raster trail: last 200 probe positions as faint dots when `state.mode === 'lamination'` (cleared by `tb-clear`).

### 14.3 Defect editor (80-modes, window `defects`, canvas `cv-circle`)
- **Circle view** (pipe): grey annulus (outer r 150 px, inner r 120 px), 12 dashed spokes, labels
  `k·round(C/12) mm` (k = 0…11) just inside the ring, positions increase **ANTICLOCKWISE** from 12
  o'clock (`angle = −z/C·360°`), a solid vertical line from the centre to the 0 mm mark with a black
  arrow at the top pointing LEFT; defects = red arcs on the annulus, the selected one dark red with
  two red radial lines from the centre to its ends; drag on the ring sets the selected defect's
  `zFrom/zTo`. Under the ring a red status line `VOL Defect 5  Height=0mm Length=30mm. From 220mm  To 250mm`
  (prefix `VOL` for volumetric types, `PLANAR` otherwise). Plates use `drawLinearBar` (horizontal
  bar 0…L with the same semantics). Both helpers live in 62-view-plan (§13).
- Right panel `Select Defect` (black background, yellow text) radios 1–8; fields **SEPARATION** (mm)
  = gap along z between consecutive defects, **LENGTH** (mm) = z-length of the selected defect,
  HEIGHT (mm, scales `pts` in y about the bbox top), type dropdown (planar / volumetric / crack /
  lof / porosity / slag / lamination / root), **APPLY TO ALL DEFECTS** checkbox, `OK` (applies:
  with APPLY TO ALL, `zFrom_n = zFrom_1 + (n−1)·(LENGTH+SEPARATION)`, `zTo_n = zFrom_n + LENGTH`).
  x/y of a defect come ONLY from the brush strokes.
- Left column: `Delete All Defects` (opens `UT.dom.confirm('Delete all defects?', {title:'ERASE ALL DEFECTS'})`),
  `Delete Defect N` (N = selected), brush-size spinner (10–60 px, default 26) with a red preview dot,
  `Load Def` / `Save Def` (localStorage `utsim.defects` + a textarea with the JSON for copy/paste),
  presets dropdown (`UT.specimens.defectPresetNames`) + `Add preset`.
- Status while open: `Pos: 96 mm | Depth = -4.0mm | LEFT mouse button/drag to draw defect.` (cursor
  depth may be negative above the surface). Probe drag is locked while the editor is open.

### 14.4 Instruments (70-instruments)
- **EPOCH 600**: readout row = three boxes `1▶ 11.03` (SP), `1⇒ 09.58` (SD), `1↓ 05.51` (DP, big
  4-digit green with unit `mm`), and `1% 340%` under SP — the amplitude is **unclipped** (format
  `340%`, max `999%`). Mini A-scan icon right of the screen with `1` and a leg indicator `L1|L2|L3`
  under it. Bottom softkey row has **7 cells** (`10.0dB 20.0dB 30.0dB 40.0dB 60.0dB` + 2 blank).
  Softkey pages (page indicator `n/5`): 1 `Gain | Range | Delay | Basic | Pulsar | Rcvr | Trig | Auto Cal`;
  2 `Gain | Range | G1Level | Gate1 | Gate2 | Gate Setup`; 3 `Gain | DAC Setup | Record | Erase | Curve | Draw`;
  4 `Display: Rectify (Full|Half+|Half−|RF) | Grid | Peak Mem | Freeze`; 5 `Units | Trig: Angle | Thick | X Value | Reset`.
  Sub-pages: Basic = Range / Velocity / Zero / Delay; Pulsar = Freq / Energy / Damping / PRF (display
  only except Damping ↔ `instrument.damping`); Rcvr = Filter / Rectify / Reject; Trig = Angle /
  Thick / X Value / CSC; Gate1/Gate2 = Zoom / Start / Width / Level / Alarm; Gate Setup = Mode
  Peak|Edge / Measure SP|Depth. Big readout = `primary[instrument.readout]`.
- `instrument.trig = {angle, thick, xValue}` — SD/DP/leg readouts use `trig.angle/trig.thick` (NOT
  the probe). `display.autoTrig` (default true) copies the probe angle and specimen T into `trig`
  whenever they change (so acceptance check 5 holds). Both live in state (`instrument.trig`,
  `display.autoTrig`) — added to `UT.defaultState()`.
- **EPOCH 4** text screen (monospace 12 px black on `#dfe3d5`): top-left three lines `GAIN 40dB` /
  `REJ 0 %` / `MIN DEPTH 20.00`; `RANGE 50.0` top-centre; big `↓20.00 mm`; mini A-scan icon top-right;
  A-scan with vertical scale 0/20/40/60/80/100 and horizontal 0,2,…,10, gate = thick black bar;
  parameter block `VEL 5959.993 | FULLWAVE`, `ZERO 00.0 | ENERGY MED | FILTER STD`,
  `ANGLE 60.0 | DAMPING 150 | FREQ 5.00MHz`, `THICK 20.0 | PULSE-ECHO` (ANGLE/THICK follow
  `instrument.trig`, VEL/ZERO follow `instrument.cal`, FREQ the probe); gate table
  `Gate Start Width Level Alarm` rows `1 11.13 80.94 24% OFF` / `2 147.16 18.40 OFF OFF` with the
  selected cell inverted; softkey row `1-START | 1-WIDTH | 1-LEVEL | | AUTO-80` (AUTO-80 sets gain so
  the gated peak reads 80 %).
- **USK7**: CRT text line (magenta 11 px, top-left) `AMP 29 dB  Suppr OFF  ANGLE 60°`; DAC curve as
  a magenta polyline through recorded points drawn as `+` with the label `DAC`; `ERASE DAC`
  push-button (visible when DAC points exist or mode is dac); trace = 1.5 px cyan polyline (no fill;
  the initial pulse saturated with a sloping decay); knobs RANGE (◀▶ ±2 %), AMP slider, X-SHIFT,
  SUPPRESSION, a red and two yellow push-buttons (decorative), `OFF`, label `KRAUTKRÄMER USK 7`.
  The USK7 is a floating window `.win[data-win=usk7]` (~480 × 200) defaulting to the top-left of the
  plan view; EPOCH 600 / EPOCH 4 render in the fixed left column `#instrument`.
- Range is continuous (float 10…1000 mm) — see §5.3.

### 14.5 Plotter card (66-view-plotter, PLOT mode)
PLOT mode **hides the plan view + compass** and shows the card in that area (down to the X ruler),
sharing the X-ruler scale (index at ruler 0 = `probe.x`): white card; light-blue range arcs every
10 mm of beam path centred on the index; blue horizontal depth lines every 10 mm labelled `10 … 50`
at the right; red horizontal lines labelled `A5 IOW Block 13mm SDH` (19/25/43) from `spec.holes`;
a stand-off ruler along the TOP edge reading `80 70 … 10 | 0 | 10 20` (0 at the index, increasing
toward the beam); dashed vertical axis at 0; the blue beam centre line at the probe angle; grey
mirror image below the surface line (full skip) toggled by `Hide Mirror Image` / `Show Mirror Image`
(bottom-left); `Erase Plotting` (bottom-right); a small mm ruler `0mm 10mm … 80mm` at the bottom
under the probe; cursor readouts `HALF SKIP BEAMPATH DISTANCE=150mm` / `HALF SKIP STANDOFF=130mm`
following the mouse (BEAMPATH = √(standOff² + depth²), STANDOFF = |cursor.x − probe.x|; FULL SKIP
variants use 2T − depth). Left-click on the card plots a cross at the cursor (`plot.points`);
`Mark 10% edge` (or left-drag on the block at the 10 % position) drops an edge mark at the
selected hole's depth and the current stand-off (`plot.edgeMarks`). Status hint:
`Use mouse button on the Plotter to plot Beam Spread. Draw on Block to mark 10% Beam Edge`.
`plot.cardStyle: 'iow' | 'weld'` — the weld variant (UTman II) shows hatched plate halves either
side of the weld with a red beam-path scale ticked every 5 mm (10…60 on the probe side, 60…120 after
the mirror).

### 14.6 TOFD / AUT panels
- TOFD (`.win[data-win=tofd]`, docked left, width 290): `[Run Scan|Stop Scan]` button, D-scan canvas
  `cv-tofd-dscan` 280 × 450 (z vertical, wedge-zeroed time horizontal, 8-bit grey, red crosshair at
  probe.z / cursor), a mini pane 140 × 140 = the last column magnified, black filler. A-scan sub-window
  (`.win[data-win=tofd-ascan]`, 240 × 250, over the plan view): teal background `#0e5a4d`, grid
  `#0a3d34`, green RF trace `#22ff22`, greyscale legend bar 30 px on the right, `Range` / `X-Shift`
  ◀▶ sliders, vertical `AMP` slider, `PCS` field, angle select 45/60/70, `OFF` button (closes).
  Plan view draws the pair as one rectangle with a white dot; cross-section draws both probes
  facing each other + the yellow lateral-wave line (§14.1). Status: `Pos: 67 mm | Depth: 17.2 |
  Lateral Wave: 3.98 micro sec + delay | BackWall: 10.41 micro sec + delay | AMP= 46dB`.
- AUT (`.win[data-win=aut]`): group box `Transit/TOF Gate` with radios gate 1/2/3, `Level=21%` ▲▼
  spinner, `Width=11mm` ◀▶ slider, `Start=30mm` ◀▶ slider, green `Gates Same` button (copies gate 1
  to 2 and 3), caption `RDT   RTD` with three radios (RDT = rectified amplitude strip, RTD = TOF
  strip, third = both), `Rev Map` checkbox; A-scan canvas `cv-aut-ascan` shows the three gates as
  red/yellow/green bars at their levels and `AMP 44dB` under the AMP slider; 7-band colour legend
  (top→bottom white ≥100 %, red 80–100, magenta 60–80, yellow 40–60, green 25–40, cyan 10–25, blue
  <10) right of the A-scan; strip canvas `cv-aut-strip`: left white strip with dashed threshold
  lines and a black amplitude trace, right blue strip with white TOF bars, a red horizontal line at
  the current scan z; `[Run Scan|Stop Scan]`, `Clear`, `OFF`.

### 14.7 Enable matrix (`UT.modes.enabled[mode] = {toolbar: [ids], menus: [ids]}`)
Disabled toolbar buttons get class `.disabled` (50 % opacity, no click; `UT.test.click` returns false).
| mode | disabled toolbar | disabled menus | hidden views |
|---|---|---|---|
| weld | — | — | — |
| dac | damp, defect, hide, rad, pipe, tky, tofd, aut | — | compass |
| v1 / v2 | 0,45,60,70, v2/v1 (the other), dac, plot, damp, size, defect, hide, pipe, tky, tofd, aut | file, probes, weld, defects, options | plan, ruler (oblique block instead) |
| defect editor open | everything except defect, beam, rad | all except Help | — |
| iow (plot) | damp, defect, hide, pipe, tky, tofd, aut | weld, defects | plan + compass (card instead) |
| tofd | 0, v2, v1, damp | probes, options | compass |
| aut | damp | options | compass |
| tky | v2, v1, dac, plot, pipe, tofd, aut | weld | plan, compass, ruler |
| trade | defect (locked), hide (locked until Submit/Reveal), v1, v2, dac, plot, tky | defects | — |
| step / lamination | v2, v1, dac, plot, tky, tofd, aut | — | compass |

### 14.8 V1 / V2 block screens (60-view-cross draws; 80-modes owns the face switch)
One **oblique drawing** of the block fills the main area: front face = the wide side view
(300 × 100 for V1; V2 to scale), top face = the narrow face sheared 30° upward-right (25 mm deep
for V1, 12.5 for V2), caption `Carbon Steel Block` top-right, `V1`/`V2` label, Perspex insert as a
light circle, index tick + `0` on the top face, 1.5 mm hole as a small circle. The probe (angle:
blue box with a cable; 0°: magenta cylinder with a cable) is draggable over BOTH faces: dropping it on
the top-face band selects `face:'wide'` physics (`UT.modes.setFace('wide')` → rebuild `v1({face})`)
with status `100mm Radius. Echoes 100, 200, 300, 400 etc` (V2: `25mm Radius…`/`50mm Radius…`
depending on `probe.side`), dropping it on the front face selects `face:'narrow'` (T = 25 / 12.5,
status `25mm thickness. Echoes 25, 50, 75, 100 etc`). Status also shows `AMP= <gain>dB` and
`Range <range>mm`. Angle buttons are disabled in v1/v2 (choose the probe before pressing V1/V2); the
USK7 floats bottom-right in these modes when it is the active UT set.

### 14.9 TKY screen (80-modes window `tky`, title `ADJUST MODE`)
Enter tky: hide plan view, compass and ruler; cross-section scale so the chord spans the canvas
width and the brace reaches the top. Panel: `<input type=range>` brace angle 30–90 with label
`Brace angle = 60°`; button row 1 `Plate | T-joint | Pipe` (joint kind; active = `#00e000`); row 2
`Precision` (toggle 1°/0.1° step) | `Default` (60°, braceT 12, chordT 20, offset 0) | `Load Def`
(adds the default planar LOF 20 mm long along the chord surface under the toe weld). Default probe
60° on the chord right of the toe.

### 14.10 Status bar formats (90-app renders `state.status.segments` as sunken panels)
- Physics (left): `Angle of Sound Transmission in Perspex Shoe=${wedge.toFixed(1)}°  Velocity in Wedge (Shoe) = 2740 m/s   [ Shear Wave Angle=${θs.toFixed(1)}°   Velocity=${vs} m/s]   [ Comp' Wave Angle=${θc.toFixed(1)}°   Velocity=${vc} m/s]`
  — BOTH brackets always shown; the unused mode shows `0.0°` / `0 m/s` (0° probe: shear bracket zero,
  comp bracket `0.0° 5900 m/s`; angle probe: comp bracket zero). `UT.probe.derive().statusLine` must
  produce exactly this.
- `Pos: ${x} mm` · `Range ${range.toFixed(1)}mm` · `AMP= ${gain}dB` · `Depth: ${d.toFixed(1)}` (tofd) /
  `Depth = ${d.toFixed(1)}mm` (editor/cursor) · `WT ${wt}mm  Dia ${inch}inch` (pipe) · block texts of §14.8
  · TOFD `Lateral Wave: … micro sec + delay`, `BackWall: … micro sec + delay` · AUT `Transit Gate Length=${width}mm`.

### 14.11 3-D window (64-view-3d)
Title `3D Pipe` (`3D Plate` for plates), black background, yellow 13 px caption `UTsim` top-left,
matte grey cylinder with a lighter weld ring, defects as 3 px red arcs on the ring, probe as a 2 px
green outlined square at (x, z), the plan-view z-window bounds as black dotted lines on the cylinder.

### 14.12 Lessons — concrete setups (80-modes `UT.modes.lessons`, playlist order)
Each entry: `{n, title, ko, en, setup(), steps: [..]}`; `setup()` uses `UT.modes.enter` + `UT.set`.
1. UTman Functions — weld, plate 20, 60° x 40, gain 30, range 100. Steps: hover every toolbar
   button, open each menu, drag the probe, wheel the gain.
2. Basic UT controls — weld, PIPE 6 in WT 20, 0° x 40, USK7, range 88.5. Steps: RANGE until 4
   backwalls fit; X-SHIFT to move the 1st echo to div 2; AMP until the 1st echo reads 80 %; SUPPRESSION 20 %.
3. Zero Probe — v1 narrow, 0° single, range 100. Steps: identify the initial pulse & dead zone;
   Probes ▸ Zero Probe ▸ Twin Crystal → the pulse disappears; count multiples 25/50/75/100.
4. V1 angle — v1 wide, 45° x 100, range 200 then 400. Steps: echoes 100/200/300; move to
   x = 135 + 15·tan45 = 150 (side +1, beam toward −x) for the 1.5 mm hole; Perspex insert with 0° at x 240.
5./17. Lamination — lamination-plate 25, two laminations (x 15…40 depth 10, z 40…90; x −60…−30
   depth 18, z 150…200), 0°, range 100. Steps: raster along z, note the lamination echo and the
   lost backwall; size it with the 6 dB drop (SIZE window).
6./19. V2 — v2 wide, 45° x 60 side +1, range 100 then side −1 (`probe.side`). Steps: 25/100/175 vs
   50/125/200; index check at the maximum; angle check on the 5 mm hole (narrow face).
7. Amplitude — dac bar T 20, 60° at the T/2 hole maximum, gain 34. Steps: press the 40 dB softkey →
   the echo doubles; +6 dB again → clipped, read the `%` box (unclipped); note 20·log10 ratios.
8. TKY — tky brace 60°, 60° chord probe x +35. Steps: change the angle with the ADJUST MODE slider;
   find the toe LOF (`Load Def`); switch to 45°.
9. Beam spread — iow, 60° x 262.5 (13 mm hole), gain for 80 %, PLOT. Steps per §8.4 for 13/19/25/43.
10. Drawing Defects II — weld plate 20, editor open, brush 26. Steps: paint a root crack; LENGTH 30,
    SEPARATION 20, APPLY TO ALL, OK; scan along z.
11. How to use the EPOCH — weld plate 20, EPOCH 600, 60°, root-crack preset. Steps: Gain softkey +
    arrows; RANGE key; GATES → G1 start/width; PEAK MEM sweep; Freeze.
12. EPOCH Auto Cal — step wedge 5–25, 0°, EPOCH 600, wrong cal preset (vel 5.60, zero 0.4). Steps per §8.2.
13. TOFD — weld plate 20, planar defect y 8…13 z 120…150, pcs 60, 60° comp. Steps: read lateral /
    backwall status, Run Scan, click the D-scan on the tip arc, read Depth.
14. Shear & Compression — weld plate 20, 60°. Steps: Probes ▸ Adjust Angle in Wedge (Shoe), drag
    the wedge angle 20 → 80°, watch the status line and the critical angles; mode changes.
15. UTman software — as 1 with PIPE on (3D window) and the Options ▸ UT Set switch.
16. Drawing Defects I — pipe 6 in, editor, circle view. Steps: drag on the ring to place Defect 1
    From 76 To 143; Delete Defect 1; Save Def / Load Def.
18. AUT — pipe, 60° x 40, gates start 30 width 11 level 21. Steps: Gates Same, Run, Stop, Rev Map.
20. Angle-probe calibration / DAC — dac bar T 20, 70°. Steps: maximise the T/4 hole → Record; T/2 →
    Record; 3T/4 → Record; Draw Curves (−6/−14 dB); scan a defect and read DAC %.
21. Trade Test — pipe 8 in WT 25, seeded random defects, HIDE on, 45°/60°/70°, 60 min timer.
    Steps: fill report rows, Submit, Reveal, score.
22. UTman600 — as 11 plus page 2 gates, 2ND F + dB (reference gain), Auto Cal softkey.

---

## 15. Integration contract — binding decisions for parallel implementation (overrides earlier text)

### 15.1 Frozen modules and their real API
`src/00-core.js`, `src/10-specimens.js`, `src/20-probe.js` are DONE and frozen; **their code is the
contract** (read them; the §4/§5 prose is a summary). In particular:
- `UT.defaultState()` is the state shape (it includes `weldOpts`, `editing`, `instrument.cal/readout/selectedParam/trig`,
  `display.grid/autoTrig`, `tofd.rangeUs/delayUs/gainDb/running`, `aut.x/gates[3]/activeGate/rectified/revMap`,
  `plot.mirror/refPct/cardStyle`, `sizing.method/result`, `trade.seed/startedAt/truth`, `specimen: null` at boot).
- Never mutate `UT.state.<key>.<field>` directly: `UT.setIn('instrument', {gain: 40})` for one-level
  patches (it clones the top-level object); clone arrays you patch (`gates: gates.map(g => ({...g}))`).
  `UT.set(patch, {silent, noRender})`. `UT.renderNow()` = synchronous compute + `'render'`.
  `UT.status({left, mid, right, segments})` updates the status bar without a recompute. Freeze is
  handled by core: modules never check `instrument.freeze` themselves.
- Helpers available: `UT.dom.h/win/wins/closeTopWindow/confirm/alert/field/button/fitCanvas/cssSize/localPos/injectCss`,
  `UT.math.*` (incl. `beamWeight20`, `skewWeight`, `raySegment`, `rayCircle`, `pointSegment`,
  `pointInPolygon`, `angleBetween`, `rng`, `fmt`, `fmt2`, `overlap`), `UT.fmtLen(mm, dp)` (honours
  `display.units`), `UT.i18n`, `UT.consts`, `UT.clone`, `UT.uid`, `UT.specimens.*` (incl. `build`,
  `scanSurfaceAt`, `defectSamples`, `isPlanar`, `defectFromBrush`, `normaliseDefects`, `defectPresets`,
  `defectPresetNames`, `bbox`), `UT.probe.*` (`derive`, `presets`, `skip`, `paAngles`, `criticalAngles`, `wedgeAngleFor`).
- `spec.thicknessAt` (step wedge) is a function: never serialise `specimen` (persist `weldOpts`);
  `UT.test.state()` returns `specimen: {id, name, T, L, face}` only.
- `UT.test` is extended ONLY with `Object.assign(UT.test, {...})`.

### 15.2 Module namespaces
`00 → UT.core (+ UT.math/bus/dom/i18n/set)`, `10 → UT.specimens`, `20 → UT.probe`, `30 → UT.rays`,
`40 → UT.ascan` (+ `UT.compute` alias), `50 → UT.tofd`, `55 → UT.aut`, `60 → UT.views.cross`,
`62 → UT.views.plan`, `64 → UT.views.pipe3d`, `66 → UT.views.plotter / UT.views.radiograph / UT.views.sizing`,
`70 → UT.instruments`, `80 → UT.modes`, `90 → UT.app`. `UT.views = UT.views || {}` is created by
whichever view file loads first (each view file does `UT.views = UT.views || {}` then assigns its own
key). Each `__selftest` lives on that object. Never assign to another module's namespace.

### 15.3 CSS
`style.css` is owned exclusively by 90-app (layout grid, menu/toolbar, `.win` chrome, `.btn`, `.fld`,
`.btn-row`, `.confirm-body`, rulers, status bar, page colours). Every other module that needs CSS
exposes a string `UT.<name>.css` scoped under a module class (`.skin-epoch600 …`, `.win[data-win=tofd] …`)
and calls `UT.dom.injectCss('<name>', UT.<name>.css)` (idempotent) inside its `mount()`/`open()` —
never at load time. There is NO `instruments.css` file. `index.html` (owned by the integration agent)
keeps exactly `<link rel="stylesheet" href="style.css">` and `<script src="src/NN-name.js"></script>`
tags (no attributes). No `</style>` / `</script>` sequences inside CSS/JS strings.
(§2's mention of `src/instruments.css` is superseded: there is no such file.)

### 15.4 Frame, echoes, K_REF, tracer options
```js
UT.frame = {
  ts: performance.now(),        // MUST be set by every compute (core uses !ts to detect the first compute)
  mode, derived: DerivedProbe,  // UT.probe.derive(state.probe, state.specimen)
  rays: RayResult | null,
  echoes: EchoOnScreen[],       // rays.echoes mapped to {...echo, ampPct} at current gain (before reject/clip), sorted by path
  ascan: AscanResult | null, readouts: Readouts | null,
  tofd: TofdResult | null, aut: { readouts: Readouts } | null, sscan: SscanResult | null,
}
```
- Tracer amplitude is **dimensionless** (`amp = w(δ)·wReturn·e·S·D·Z·M`, ≈ 1 for a big reflector at
  the near-field end); no K in 30-raytrace. 40-ascan: `ampPct = amp · UT.ascan.K_REF · 10^(gain/20)`,
  `K_REF` tuned in 40-ascan so the 3 mm SDH reference (§5.3) holds; reject and the 120 % clip only when
  synthesising samples.
- `UT.rays.trace({specimen, probe, derived, display, defects, opts})` with
  `opts = { maxPath /* mm, = instrument.delay + instrument.range */, fanCount: 21, maxLegs }` where
  `maxLegs`: for `probe.angle === 0` → `max(12, min(60, ceil(2·opts.maxPath/T) + 2))` with T = local
  thickness under the probe (step wedge: `thicknessAt(probe.x)`), so the 0° backwall multiples continue to
  the end of the range as in the original; `specimen.kind === 'block'` with an angled probe → 12; otherwise
  `display.skips`; stop marching when
  `len > max(2·opts.maxPath + 100, 700)` or `leg > opts.maxLegs`. Drawing always shows only the first
  `display.skips` legs. Every `Echo` also carries `ampNoZ` (amp with Z = 1) and `hz`;
  `UT.rays.zFactor(echo, probeZ, probeSkew, defects, specimen) → Z` recomputes §6.7 for another z
  (used by AUT). Volumetric sample sets are cached in a `WeakMap` keyed by the defect object.
- Echo kinds for defect segments: `defect.type === 'lamination'` → `'lamination'`; corner rule (§6.1 2d)
  → `'corner'`; else `'defect'`.
- Emission point: `E = UT.specimens.scanSurfaceAt(specimen, probe)` → `{x, y, tangent, normal /* into metal */, segment}`;
  `u₀ = rotate(normal, −side·θ)` about the surface; the return-to-probe test uses `segment`. On the TKY
  brace (`probe.surface === 'brace'`) `probe.x` is the distance from the toe weld along the brace's
  toe-side face; `side +1` = beam toward the toe weld (down the brace).

### 15.5 Time base, cal, peak memory, readouts (40-ascan)
- True two-way time of an echo: `t = 2·path/vTrue + derived.wedgeDelayUs`. Displayed path:
  `pDisp = (t − derived.wedgeDelayUs − cal.zero) · (cal.vel ?? vTrue) / 2`, so the default
  `cal = {vel: null, zero: 0}` shows the true metal path. `Echo.path`, `Readouts.path` are TRUE paths;
  the mapping is applied only in `synth()` / `xDiv`. `UT.modes.enter('step')` sets
  `cal = {vel: 5.60, zero: 0.4}`; leaving step mode restores `{vel: null, zero: 0}`. Auto-cal: capture
  `t1, t2` = true times of the gated peak (`t = 2·readouts.primary.path/vTrue + wedgeDelayUs`) on the
  10 mm and 25 mm steps → `vel = 2·(25 − 10)/(t2 − t1)`, `zero = t1 − wedgeDelayUs − 2·10/vel`,
  `UT.setIn('instrument', {cal: {vel, zero}})`.
- `AscanResult = { samples: Float32Array(1000) /* %FSH 0..120 */, rf: Float32Array|null, peak: Float32Array|null, range, delay, pathAt(i), echoesOnScreen: [{echo, xDiv, ampPct}] }`.
  Peak memory: 40-ascan keeps a module-level `peakBuf`; when `instrument.peakMem`, `peakBuf[i] = max(peakBuf[i], samples[i])`,
  `ascan.peak = peakBuf`; cleared when `peakMem` toggles, on `tb-clear` (`UT.ascan.clearPeak()`), and when range/delay change.
- `Readouts = { gate: (GateReadout|null)[] /* one per gates entry, any length; null when off or nothing above level */, primary: GateReadout|null /* gate[activeGate] */, textSP, textSD, textDP, textAmp }`,
  `GateReadout = { peakPct /* unclipped */, path /* TRUE */, pathDisp /* cal-mapped, = the drawn position */, xDiv, sd, dp, leg /* from pathDisp */, dacPct|null, dBToDac|null, echoKind }`;
  `text*` are formatted from `pathDisp`/`sd`/`dp`; `Echo.path` and `Readouts.path` remain TRUE paths (auto-cal captures
  `t = 2·primary.path/vTrue + wedgeDelayUs` as before);
  `text*` use `UT.math.fmt2` (`'05.51'`), `textAmp = Math.round(peakPct) + '%'`. SD/DP/leg use
  `instrument.trig.angle/thick` (§14.4). `UT.ascan.evalGates(ascan, instrumentLike, derived, specimen, probe)`
  accepts any number of gates (AUT passes `{...instrument, gates: aut.gates, activeGate: aut.activeGate}`).
- `UT.compute()` dispatch: `mode === 'tofd'` → `frame.tofd = UT.tofd.compute(state)` (and `frame.ascan = null`);
  `probe.method === 'pa'` → `frame.sscan = UT.ascan.computeSscan(state) = {angles, columns: [{angle, echoes}], maxPath, T}`;
  everything else (AUT included: the live A-scan is at `probe.z`) → PE pipeline. Always set `frame.derived`, `frame.ts`.

### 15.6 View contract (60/62/64/66)
Every canvas view exports `{ init(canvas), draw(frame, state), toPx(x, y) → {x, y}, toMm(px, py) → {x, y}, fit() }`.
`init()` stores the canvas, attaches its own mouse handlers and does `UT.bus.on('render', f => draw(f, UT.state))`.
`draw()` begins with `const ctx = UT.dom.fitCanvas(canvas)` (idempotent, dpr-aware) and recomputes the
transform from `canvas.clientWidth/Height` and the specimen every frame. 90-app builds the layout DOM
with the canvas ids of §11, then calls `UT.views.cross.init(#cv-cross)`, `UT.views.cross.initRuler(#cv-ruler)`,
`UT.views.plan.init(#cv-plan)`, `UT.views.pipe3d.init()` (creates its own window + `cv-3d`), and owns ONE
`ResizeObserver` on `#app` that calls `UT.requestRender()`. Views must tolerate `frame.rays/ascan/readouts/tofd/sscan`
being null and `state.specimen` being null (draw nothing). `UT.views.plan` uses `UT.views.cross.toPx` for
the shared X scale when available.

### 15.7 Instruments API (70)
`UT.instruments = { mount(container), setSkin(name), drawAscan(ctx, frame, state, theme), drawSscan(ctx, frame, state), handleKey(ev) → bool, css, window /* USK7 dom.win */ }`.
`mount()` renders the skin for `state.utSet` into `#instrument` (containing `<canvas id="cv-ascan">`) and
subscribes to `'render'`; 90-app calls `setSkin` when a `'state'` event carries `utSet`. All value changes
go through `UT.setIn('instrument', …)`; gain clamped 0…110 dB; `refGain` set only by 2ND F + dB.
Legal `instrument.selectedParam`: `'gain'|'range'|'delay'|'reject'|'g1start'|'g1width'|'g1level'|'g2start'|'g2width'|'g2level'|'velocity'|'zero'|'trigAngle'|'trigThick'`.
Steps per ▲/▼: gain 0.5 dB (2ND F: 6 dB), range 1 % (Shift 10 %) with the RANGE hard key cycling
`50/100/200/400`, delay 1 mm, gates 1 mm / 1 %. Mouse wheel over `#instrument` → the selected parameter;
over `#cv-cross` → gain ±1 dB. `'Auto Cal'` softkey → `UT.modes.autoCal.start()`; `'Record'` → `UT.modes.dac.record()`;
`'Erase'` → `UT.modes.dac.erase()` (guard with `if (UT.modes && …)`).

### 15.8 Modes API (80)
`UT.modes.enter(name, opts = {specimenOpts, keepProbe, silentUI})`, `exit()` (= `enter('weld', {keepProbe: false})`),
`toggle(name)`, `current()`, `setFace('wide'|'narrow')` (v1/v2), `statusMid()` → extra mid-status text,
`enabled` (§14.7), `lessons`, windows `defectEditor / tradeTest / tkyPanel / lessonsWindow / dacPanel`
(each `{open, close, toggle, window}`), `autoCal = {start, step, cancel}`, `dac = {record, erase, curves}`,
`plot = {markEdge, erase}`, `sizing = {markL, markR, clear}`.
Mode → specimen/windows table: weld → `plateWeld|pipeWeld(weldOpts)`; v1 → `v1({face})` (face
`'narrow'` when `probe.angle === 0`, else `'wide'`; changing the angle to/from 0° while in v1/v2 rebuilds
the face); v2 → `v2({face})`; step → `stepWedge()` + wrong cal; iow → `iow()` + window `plotter`, hides plan;
dac → `dacBlock({T: weldOpts.T})` + window `dac`; tky → `tky(opts)` + window `tky`; tofd → keeps the weld
specimen, window `tofd` (+ `tofd-ascan`), `probe.x = 0`, `rectify:'rf'`; aut → keeps weld specimen, window
`aut`; trade → keeps weld specimen, window `trade`, `trade.active = true`, `display.hide = true`;
lamination → `laminationPlate()` + 2 lamination presets (§14.12 lesson 5), 0° probe.
`enter()` order: exit the previous modal mode (closing its windows) → `UT.set({mode, specimen, probe: keepProbe ? clamped probe : {...probe, ...specimen.defaultProbe}, defects: per table})`
→ open windows unless `silentUI` → `UT.status({right: hint})` → `UT.bus.emit('mode', {mode, prev})`.
Defect editor protocol: opening sets `UT.setIn('editing', {defect: true, brush: type})`, closing `defect: false`;
`state.selectedDefect` is the 0-based slot (`n = selectedDefect + 1`); ≤ 8 defects with unique `n`.
60-view-cross, while `state.editing.defect`, collects mm points on left-drag and on mouseup emits
`UT.bus.emit('defect:brush', {pts, erase: false})`; right-drag emits `{pts, erase: true}`. The editor:
`erase:false` → `UT.specimens.defectFromBrush(pts, brush, {n, zFrom, zTo, label})` replaces the slot with
that `n` (or appends) via `UT.set({defects})`; `erase:true` → removes points within 2 mm of any brush
point (drop the defect if < 2 remain). SEPARATION/LENGTH/HEIGHT semantics per §14.3.
Trade: report row `{n, z, length, depth, type}`; `UT.test.trade.start(seed)` uses `UT.math.rng(seed)`,
stores `trade.seed` and `trade.truth = defects.map(d => ({n, zFrom, zTo, depth: bbox(d.pts).yMin, height, type}))`
(state.defects holds the hidden truth; persistence is suspended while `trade.active`); `truth()` returns
that array; `submit(rows)` matches each row to the nearest unmatched truth defect with
`|z − zFrom| ≤ 10 && |depth − truth.depth| ≤ 3` (+ type match), `score = clamp(round(100·(matched + typeMatches/2)/(1.5·truth.length)) − 10·falseCalls, 0, 100)`,
sets `trade.score`, `trade.revealed = true`, `display.hide = false`, returns the number.

### 15.9 App (90): toolbar actions, windows, events, status, persistence, boot
- Toolbar: `tb-0/45/60/70 → UT.setIn('probe', {angle, mode: UT.probe.presets[angle].mode})` (radio, `.active`);
  `tb-v2/v1/dac/plot/tky/tofd/aut → UT.modes.toggle(name)` (`plot` toggles mode `iow`; `.active` while active);
  `tb-damp → instrument.damping`, `tb-hide → display.hide`, `tb-beam → display.beam` (toggles mirroring state);
  `tb-size → UT.views.sizing.toggle()`; `tb-defect → UT.modes.defectEditor.toggle()`; `tb-rad → UT.views.radiograph.toggle()`;
  `tb-pipe → UT.setIn('weldOpts', {pipe: !pipe})` then `UT.modes.enter('weld', {keepProbe: true})` and show/hide
  window `pipe3d`; `tb-clear → UT.ascan.clearPeak(); UT.setIn('tofd', {scan: null}); UT.setIn('aut', {scan: null}); UT.setIn('plot', {points: [], edgeMarks: []}); UT.setIn('sizing', {marks: []})` + clear the raster trail (never defects).
- Windows (`data-win`) and owners: `pipe3d` (64), `defects` (80), `tofd`, `tofd-ascan` (50), `aut` (55),
  `plotter`, `rad`, `size` (66), `usk7` (70), `weld`, `wedge`, `options`, `stepwedge`, `about`, `guide`, `keys`,
  `export`, `export-defects`, `import-defects` (90, Defects ▸ Export/Import dialogs), `tky`, `trade`, `lessons`, `dac`,
  `autocal` (80, the Auto Cal two-point wizard). Owners create them lazily on first `open()`.
- Events (complete catalogue): `'state' {keys, patch}`, `'render' frame`, `'status' status`,
  `'win:show'|'win:hide'|'win:close' winApi` (core); `'resize'` (90); `'mode' {mode, prev}` (80);
  `'defect:brush' {pts, erase}` (60); `'lang' lang` (90); `'scan:progress' {kind, i, n}` (50/55). No others.
- Status: 90-app owns `left` and `mid`: on every `'render'` it sets `left = frame.derived.statusLine`,
  `mid = 'Pos: <x> mm' + ' Range <r>mm' + ' AMP= <g>dB' + UT.modes.statusMid() + cursor depth`;
  80-modes owns `right` (hints) via `UT.status({right})`; 60-view-cross writes only `state.cursor`.
- Menus: every item carries `data-key="<English label>"` and submenus `data-menu="<English label>"`;
  `UT.test.menu('Probes/Zero Probe - Twin or Single Crystal/Twin Crystal')` resolves by `data-key` path
  and dispatches the handler synchronously (returns false when missing/disabled). Language changes
  relabel via `UT.i18n.t(key)` but keys stay English.
- Persistence: `localStorage['utsim.v1'] = {v: 1, probe, instrument: {gain, refGain, range, delay, reject, damping, rectify, gates, dac, cal, trig}, display, defects, weldOpts, utSet, lang}`
  saved debounced 500 ms on `'state'` when `keys` intersects those names, and NOT while `trade.active`.
- Boot: (1) restore inside try/catch with `UT.set(patch, {silent: true, noRender: true})` (defects
  normalised); (2) `buildLayout()`; (3) `UT.instruments.mount(#instrument)`; (4) view inits; (5)
  `UT.modes.enter('weld', {keepProbe: true})` (fallback `UT.set({specimen: UT.specimens.plateWeld(weldOpts)})`
  when modes is missing); (6) `UT.renderNow()`; (7) if `location.hash === '#selftest'` run every
  `UT.*.__selftest()` and `console.log` the results. `File ▸ New` = `UT.set(UT.defaultState())` + `localStorage.removeItem` + `enter('weld')`.

### 15.10 Test API ownership
| function | owner |
|---|---|
| `state`, `version` | 00-core (frozen) |
| `setProbe`, `setInstrument`, `compute`, `echoes`, `ascan`, `readouts` | 40-ascan |
| `tofd`, `runTofdScan` | 50-tofd |
| `runAutScan` | 55-aut |
| `loadSpecimen`, `setDefects`, `addPreset`, `enterMode`, `lessons`, `trade` | 80-modes |
| `click`, `menu` | 90-app |
Semantics: `loadSpecimen(id, opts)` = `UT.modes.enter(MODE_OF[id], {specimenOpts: opts, silentUI: true})` with
`MODE_OF = {'plate-weld':'weld','pipe-weld':'weld','v1':'v1','v2':'v2','step':'step','iow':'iow','dac':'dac','tky':'tky','lamination-plate':'lamination'}`
(for `pipe-weld` set `weldOpts.pipe = true` first, for `plate-weld` false; `opts` merge into `weldOpts`);
it sets `probe.x/z/side` from `specimen.defaultProbe`, keeps angle/gain, opens no windows.
`setProbe(p)` also applies `UT.probe.presets[angle].mode`, clamps x to the scan surface, then `UT.renderNow()`
and returns a JSON-serialisable copy of `frame.derived`. `compute()` = `UT.renderNow()`. `echoes()` = `frame.echoes`
(has `ampPct`). `ascan()` = `{samples: Array.from(samples), range, delay}`. `addPreset(name, opts)` keys =
`UT.specimens.defectPresetNames[].key`; appends and returns the defect. `setDefects(arr)` = `UT.set({defects: UT.specimens.normaliseDefects(arr)})`.
`runTofdScan()/runAutScan()` run synchronously, store the scan, and return `{z0, z1, step, n}` (AUT also `aboveLevel` per gate).
`tofd()` = `{events, lateralUs, backwallUs}` from `frame.tofd` (absolute µs).

### 15.11 Performance
AUT scan: trace ONCE at the fixed probe x, then per z: `amp = ampNoZ · UT.rays.zFactor(...)`, re-synthesise and
evaluate gates (≤ 300 ms for 300 columns synchronous). TOFD D-scan: recompute only `events` per column.
Ray tracer: ≤ 6 ms per compute (plate, 8 defects, 21 rays, 4 legs).

### 15.12 Load-time restrictions
`node tools/node-load.mjs --selftest` MUST run every file without error: at IIFE evaluation time do not
reference `document`, `window.*` other than `window.UT`, `requestAnimationFrame`, `ResizeObserver`,
`localStorage` or `performance` (use them only inside functions called after boot; `UT.frame.ts` may use
`Date.now()` when `performance` is undefined). `__selftest()` of 60–90 must also run headless (pure helpers only).
