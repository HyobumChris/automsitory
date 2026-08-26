# ut-sim — UTman-Sim: Ultrasonic Simulator (NDT Verification and Training)

An interactive browser re-imagining of the classic **UTman II** ultrasonic
testing (UT) training simulator by Paul Rawlinson (as seen in the "UTman
Ultrasonic Sim" YouTube playlist), **imitating the original retro
Windows-2000-era desktop-app look**: navy title bar, menu bar
(File / Probes / Step Wedge / Weld / Defects / Options / Help), a 3D-beveled
toolbar, a pale-cream workspace with the specimen cross-section, mm rulers and
probe-position scale, a PLAN VIEW indicator, a floating skeuomorphic flaw
detector window, classic Windows dialogs, and a sunken-panel status bar.

Two instrument skins are driven by the same simulator state:

- **USK-7 SIM** — Krautkramer USK7-style analogue set: deep-blue CRT with cyan
  filled trace, rotary knobs (RANGE, X-SHIFT, red AMP knob), yellow dB-step
  buttons, SUPPRESSION/ZERO, coarse-range lever, gate controls.
- **EPOCH-SIM 600** — Olympus EPOCH 600-style digital set: black LCD with green
  trace, right-hand parameter column (Gain highlighted), F1–F5 side keys,
  arrow pad + dB keys, P1–P7 bottom key row, and an **AUTO CAL** dialog that
  computes and applies the probe zero from two gated reference echoes.

React 19 + Vite 7 + Tailwind CSS 4, JSX, single-file build — same conventions
as the sibling `app/` project in this repository.

## Exercise modes → UTman playlist mapping

| Mode (Options menu / toolbar) | UTman video topic |
| --- | --- |
| Basic Controls (기본 조작) | Instrument familiarisation: range, gain, X-shift, gates |
| Zero Probe (0° 탐상) | Compression probe zeroing, backwall multiples on plate |
| V1 Calibration (V1 교정) — toolbar **V1** | V1/IIW block: 100 mm radius (echoes at 100 then 200 mm by re-reflection), probe index, angle check off the 1.5 mm SDH, 0° cal on the 25 mm edge (25/50/75/100), 91 mm slot, 50 mm perspex insert |
| V2 Calibration (V2 교정) — toolbar **V2** | V2 block: 25/100/175 or 50/125/200 sequences depending on which radius the probe faces |
| Lamination (라미네이션) | Lamination checking: multiples of the lamination depth + collapsed backwall |
| Weld Defects (용접부 결함) — toolbar **DEFECT** | Single-V butt weld scanning: half-skip / full-skip, crack, lack of side-wall fusion, lack of root penetration, porosity, slag, toe crack |
| DAC — toolbar **PLOT** | Recording a distance–amplitude correction curve off SDHs at 1/4t, 1/2t, 3/4t and grading indications in dB relative to DAC |
| Beam Spread 20% — toolbar **SIZE** | 20 % drop probe-movement sizing with markers plotted on the cross-section |
| TKY — toolbar **TKY** | T / K / Y variable-configuration joints with settable brace angle |
| TOFD — toolbar **TOFD** | Time-of-Flight Diffraction: transmitter/receiver pair, lateral wave, top/bottom tip diffraction, backwall, click-to-measure depth |
| AUT — toolbar **AUT** | Automated UT: animated scan run with a live strip chart of gate amplitude vs position |
| EPOCH-SIM 600 — toolbar **EPOCH** | "How to use the EPOCH" / "EPOCH AUTO Calibration" / "UTman600": digital detector skin + AUTO CAL |

Toolbar buttons **ASME**, **RAD** and **PIPE** render disabled (grayed
embossed), like the real app when a mode is unavailable.

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
  (3240 m/s). Conventional screen calibration is in **mm of beam path**;
  TOFD mode switches the axis to **µs**.
- Screen mapping: `screenX = (beamPath − xShift) / range × screenWidth`;
  range steps 50/100/200/250/500 mm plus fine control; gain 0–110 dB in
  0.5 / 2 / 6 dB steps.
- Amplitude (%FSH): `A = 80 × reflectivity × 10^((ΔdB)/20)` where ΔdB combines
  a simple distance law `s0/s` beyond a 50 mm reference distance, material
  attenuation (0.005 dB/mm compression, 0.01 dB/mm shear), gaussian beam-spread
  falloff (−6 dB at the probe half-angle, 4–6°), orientation penalty for planar
  reflectors, and `gain − 30 dB`. Clamped 0–110 %. SUPPRESSION (reject) drops
  echoes below the threshold.
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
  every reading — exactly what the calibration exercises (and the EPOCH AUTO
  CAL) train you to fix.
- **TOFD**: probe pair at ±S from the pair centre, compression 5.92 mm/µs.
  Lateral wave `t = 2S/v`; backwall `t = 2√(S²+t²)/v`; each defect contributes
  weak, phase-inverted top/bottom **tip diffraction** wiggles at
  `t = 2√(S²+d²)/v`. Picked-cursor depth `d = √((v·t/2)² − S²)`.
- **AUT**: a requestAnimationFrame-driven scan traverses the span, recording
  the gate peak per position into a strip chart (red above the gate level).

## Known simplifications

- Near-field structure, mode conversion and surface waves are not modelled.
- The V2 block is drawn as its fan-shaped profile only; its 12.5 mm through
  thickness is not used for 0° work.
- The TKY joint uses the main-plate thickness for skip geometry; the brace is
  geometric drawing plus a weld-line defect.
- TOFD assumes the ideal symmetric pair geometry (defect mid-way weighting via
  a gaussian falloff) and shows stylised RF wiggles, not true waveforms.
- DAC points are recorded from the current gated peak; no TCG.
- ASME block, radius scanning (RAD) and pipe geometry (PIPE) are intentionally
  disabled toolbar entries, as in the real app when unavailable.
