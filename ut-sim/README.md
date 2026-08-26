# ut-sim — Ultrasonic Flaw Detector Simulator (UTman 스타일)

An interactive browser re-imagining of the classic **UTman** ultrasonic testing
(UT) training simulator by Paul Rawlinson (as seen in the "UTman Ultrasonic
Sim" YouTube playlist). It pairs a CRT-style flaw-detector **A-scan screen**
with a live **specimen cross-section view** showing the probe, the beam
centreline with its skip legs, and any defects.

React 19 + Vite 7 + Tailwind CSS 4, JSX, single-file build — same conventions
as the sibling `app/` project in this repository.

## Exercise modes → UTman playlist mapping

| Tab (모드) | UTman video topic |
| --- | --- |
| 기본 조작 (Basic Controls) | Instrument familiarisation: range, gain, X-shift, gates |
| 0° 탐상 (Zero Probe) | Compression probe zeroing, backwall multiples on plate |
| V1 교정 (V1 Calibration) | V1/IIW block: 100 mm radius (echoes at 100 then 200 mm by re-reflection), probe index, angle check off the 1.5 mm SDH, 0° cal on the 25 mm edge (25/50/75/100), 91 mm slot, 50 mm perspex insert |
| V2 교정 (V2 Calibration) | V2 block: 25/100/175 or 50/125/200 sequences depending on which radius the probe faces |
| 라미네이션 (Lamination) | Lamination checking: multiples of the lamination depth + collapsed backwall |
| 용접부 결함 (Weld Defects) | Single-V butt weld scanning: half-skip / full-skip, crack, lack of side-wall fusion, lack of root penetration, porosity, slag, toe crack |
| DAC | Recording a distance–amplitude correction curve off SDHs at 1/4t, 1/2t, 3/4t and grading indications in dB relative to DAC |
| 빔 확산 (Beam Spread) | 20 % drop probe-movement sizing with markers plotted on the cross-section |
| TKY | T / K / Y variable-configuration joints with settable brace angle |

## Commands

```bash
cd ut-sim
npm install
npm run dev       # Vite dev server with HMR
npm run build     # production single-file build (vite-plugin-singlefile)
npm run lint      # ESLint (flat config)
npm run preview
```

## Physics assumptions (`src/lib/ultrasound.js`, `src/lib/geometry.js`)

- Velocities in steel: compression 5.92 mm/µs (5920 m/s), shear 3.24 mm/µs
  (3240 m/s). All screen calibration is in **mm of beam path**.
- Screen mapping: `screenX = (beamPath − xShift) / range × screenWidth`;
  range steps 50/100/200/250/500 mm plus fine control; gain 0–110 dB in
  0.5 / 2 / 6 dB steps.
- Amplitude (%FSH): `A = 80 × reflectivity × 10^((ΔdB)/20)` where ΔdB combines
  a simple distance law `s0/s` beyond a 50 mm reference distance, material
  attenuation (0.005 dB/mm compression, 0.01 dB/mm shear), gaussian beam-spread
  falloff (−6 dB at the probe half-angle, 4–6°), orientation penalty for planar
  reflectors, and `gain − 30 dB`. Clamped 0–110 %. REJECT drops echoes below
  the threshold.
- 0° probe: backwall multiples at t, 2t, 3t… with per-bounce loss; a lamination
  at depth d echoes at d, 2d, 3d… and suppresses the backwall in proportion to
  how much of the probe footprint it covers.
- Angle probes travel in straight legs mirrored off the surfaces (first two
  legs modelled). For a hit: beam path `s`, surface distance `s·sinθ`, depth
  `s·cosθ` folded into the section (leg 2 → `2t − s·cosθ`).
- Planar defects are orientation-dependent (best when tilt + probe angle
  = 90°); root/toe defects act as corner reflectors; porosity is weak and
  omnidirectional. Radius targets on V1/V2 reflect back for any probe angle
  when the index point sits on the focus (arcs are centred on it), with
  re-reflection repeats (V1: +100 mm, V2: +75 mm).
- Probes carry a built-in wedge delay; the instrument applies
  `apparent = true + (wedgeDelay − probeZero)`, so a mis-set PROBE ZERO shifts
  every reading — exactly what the calibration exercises train you to fix.

## Known simplifications

- Near-field structure, mode conversion and surface waves are not modelled.
- The V2 block is drawn as its fan-shaped profile only; its 12.5 mm through
  thickness is not used for 0° work.
- The TKY joint uses the main-plate thickness for skip geometry; the brace is
  geometric drawing plus a weld-line defect.
- DAC points are recorded from the current gated peak; no TCG.
