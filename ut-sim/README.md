# ut-sim — UTman-Sim: Ultrasonic Simulator (NDT Verification and Training)

An interactive browser re-imagining of the classic **UTman II** ultrasonic
testing (UT) training simulator by Paul Rawlinson (as seen in the "UTman
Ultrasonic Sim" YouTube playlist), presented in a **modern NDT instrument
suite skin** (in the spirit of current Olympus/Evident or Krautkramer
companion software): a slim dark header with a live mode chip, a light
engineering workspace with the specimen cross-section, fine mm rulers and a
probe-position scale, a restyled PLAN VIEW dial, a grouped segmented toolbar
(probes / blocks / display / defects / advanced modes) with a single technical
cyan accent, floating card-style windows for the instrument and dialogs, and a
dark status strip with monospaced readout chips. The menu bar
(File / Probes / Step Wedge / Weld / Defects / Options / Help) and every
interaction are unchanged. The earlier retro Windows-2000 UTman II skin is
preserved in the git history if you want the classic look.

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
| TKY — toolbar **TKY** | T / K / Y variable-configuration joints with settable brace angle AND selectable scan surface (main plate / brace, correct thickness per surface) |
| ASME — toolbar **ASME** | ASME basic calibration block: three 3 mm SDHs at T/4, T/2, 3T/4 (T = 20–50 mm) for 3-point DAC construction and TCG |
| PIPE — toolbar **PIPE** | "Drawing Defects II" pipe videos: circumferential butt weld on selectable OD (6/8/12") and WT (10–25 mm), unrolled strip with 0 → πD circumferential ruler, Circle View defect dialog (annulus, spokes, red arcs, APPLY TO ALL, Save/Load Def), live "3D Pipe" window |
| RAD — toolbar **RAD** | Simulated radiograph window: film-style weld view with per-type RT indications (crack/LOF/LORP/porosity/slag), IQI wires — and laminations invisible on RT (the teaching point) |
| TOFD — toolbar **TOFD** | Time-of-Flight Diffraction: transmitter/receiver pair, lateral wave, top/bottom tip diffraction, backwall, click-to-measure depth |
| AUT — toolbar **AUT** | Automated UT: animated scan run with a live strip chart of gate amplitude vs position |
| EPOCH-SIM 600 — toolbar **EPOCH** | "How to use the EPOCH" / "EPOCH AUTO Calibration" / "UTman600": digital detector skin + AUTO CAL |

Every toolbar button is live: 0°/45°/60°/70°, V2, V1, ASME, PLOT, DAMP,
SIZE, DEFECT, HIDE, BEAM, RAD, PIPE, TKY, TOFD, AUT, EPOCH.

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
  a distance law `s0/s`, material attenuation (0.005 dB/mm compression,
  0.01 dB/mm shear), gaussian beam-spread falloff (−6 dB at the probe
  half-angle, 4–6°), orientation penalty for planar reflectors, and
  `gain − 30 dB`. Clamped 0–110 %. SUPPRESSION (reject) drops echoes below
  the threshold.
- **Near field**: each probe carries crystal size + frequency (0°: Ø10 mm
  4 MHz → N ≈ 17 mm; 45/60°: 9 mm 4 MHz shear → N ≈ 25 mm; 70°: 9 mm 2 MHz →
  N ≈ 12.5 mm), with N = D²f/(4v). Inside N the distance-amplitude law
  plateaus (no 1/s decay); the Probes menu shows each probe's N.
- **TCG**: with ≥ 2 recorded DAC points, the TCG toggle (USK-7 panel key,
  EPOCH P6, or Options menu) applies the DAC curve as time-corrected gain —
  reference echoes flatten to 80 % FSH and "dB TCG" reads relative to that.
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
- **V2 through face**: the V2 block can be flipped onto its 12.5 mm through
  thickness (Step Wedge menu) — the 0° probe then reads multiples
  12.5 / 25 / 37.5 / 50 mm.
- **TKY brace scanning**: the Weld menu selects the scan surface (main plate
  t = 20 mm or brace t = 14 mm). On the brace, the probe and skip legs are
  computed in the brace's own frame (its thickness) and drawn rotated onto the
  brace face at the selected brace angle.
- **Pipe curvature**: echoes use the unrolled (flat) model; the surface-distance
  readout is arc-corrected for OD curvature, `arc = 2R·asin(chord / 2R)`
  (shown as "mm(arc)"), and Pos reads circumferential mm of C = πD.
- **Secondary signals** (Options toggle, default on — teaching level): 0°
  probes show a weak mode-converted backwall echo at an apparent
  `t/2 × (1 + Vc/Vs) ≈ 1.41 t`; the 70° probe near a top-surface-breaking
  defect shows a weak creeping/surface wave at ~2.98 mm/µs (reads ≈1.09× the
  true surface distance on the shear-calibrated screen).
- **TOFD**: probe pair at ±S from the pair centre, compression 5.92 mm/µs.
  Lateral wave `t = 2S/v`; backwall `t = 2√(S²+t²)/v`; each defect contributes
  weak, phase-inverted top/bottom **tip diffraction** wiggles at
  `t = 2√(S²+d²)/v`. Picked-cursor depth `d = √((v·t/2)² − S²)`.
- **AUT**: a requestAnimationFrame-driven scan traverses the span, recording
  the gate peak per position into a strip chart (red above the gate level).

## Remaining approximations (stated precisely)

- **Ray model**: beam propagation is ray-based with a gaussian angular-spread
  amplitude penalty; there is no diffraction-based defect response (no GTD/Kirchhoff
  scattering), so echo amplitudes are calibrated relative levels, not absolute.
- **Near field**: modelled as a plateau of the distance-amplitude law inside
  N = D²f/(4v); the on-axis interference oscillations within the true near
  field are not reproduced.
- **Pipe**: echo dynamics use the unrolled flat-plate model; curvature is
  applied only as the chord→arc correction of the surface-distance readout.
  Beam refraction/refocusing at the curved OD/ID surfaces is not modelled.
- **Secondary signals**: the 0° mode-converted backwall echo and the 70°
  creeping/surface wave are fixed-amplitude teaching indications at the correct
  apparent ranges, not full wave-mode solutions.
- **TKY brace scanning**: skip legs use the flat-plate model in the brace's
  local frame; defect coordinates are shared between the main and brace frames
  (accurate near the weld toe, where the defects live).
- **TOFD**: ideal symmetric pair geometry with gaussian lateral-offset
  weighting; the RF wiggles are stylised Morlet pulses, not computed waveforms.
- **Radiograph**: film density is stylistic (per-defect-type indication
  shapes), not computed from radiographic attenuation/exposure.
- Single-frequency probes; no couplant, surface-condition, or grain-noise
  effects beyond the constant baseline grass.
