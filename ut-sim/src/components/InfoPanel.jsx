import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars
import WinWindow from './WinWindow.jsx'

const GUIDES = {
  basic: {
    title: 'Basic Controls (기본 조작)',
    steps: [
      'RANGE (측정 범위) sets the mm of beam path across the 10 screen divisions.',
      'AMP / GAIN (게인, dB) raises every echo — try the 0.5 / 2 / 6 dB steps.',
      'X-SHIFT (지연) slides the whole trace left; ZERO corrects the probe wedge delay.',
      'Drag the probe in the workspace (탐촉자 드래그) or use ← / → keys (Shift = ×5).',
      'The red GATE bar picks which echo drives the status-bar readouts.',
    ],
  },
  zero: {
    title: 'Zero / Compression Probe (0° 탐상)',
    steps: [
      'The 0° probe has a 2 mm built-in delay. With ZERO at 0 every reading is 2 mm high.',
      'Set RANGE 100 on the 25 mm plate: you should see backwall multiples.',
      'Adjust ZERO until the echoes sit exactly at 25 / 50 / 75 / 100 mm (교정 완료).',
      'On the EPOCH skin, F1 AUTO CAL computes and applies the zero from two gated echoes.',
      'A weak trailing echo at ≈1.41 t is the mode-converted (comp→shear) backwall signal — toggle it under Options → Secondary signals.',
    ],
  },
  v1: {
    title: 'V1 / IIW Block Calibration (V1 교정)',
    steps: [
      '1. Place the angle probe index over the focus point x = 100 facing the 100 mm radius (← 방향).',
      '2. Set RANGE 250. Echoes appear at 100 mm and again at 200 mm (re-reflection, 재반사).',
      '3. Slide the probe to maximise the echo — the index point (입사점) is then over the focus mark.',
      '4. Adjust ZERO until the echoes read exactly 100 / 200 mm.',
      '5. Flip the probe (→) and aim at the 1.5 mm SDH at 15 mm depth to check the beam angle.',
      '6. Step Wedge menu → Face: Edge (25 mm) with the 0° probe for compression range calibration.',
    ],
  },
  v2: {
    title: 'V2 Block Calibration (V2 교정)',
    steps: [
      'Facing the 50 mm radius (→): echoes at 50 / 125 / 200 mm (repeat every R1+R2 = 75 mm).',
      'Flip the probe (←) to face the 25 mm radius: echoes at 25 / 100 / 175 mm.',
      'Maximise the first echo to find the probe index, then set ZERO so the sequence reads true.',
      'The 5 mm hole gives an angle-check target like the V1 SDH.',
    ],
  },
  lam: {
    title: 'Lamination Check (라미네이션 검사)',
    steps: [
      'Sound plate (12 mm): backwall multiples at 12 / 24 / 36 / 48 mm.',
      'Slide the probe over the lamination: new multiples appear at 6 / 12 / 18 mm…',
      '…and the backwall echo collapses — the classic lamination signature (라미네이션 특유의 신호).',
      'Use RANGE 50 so the first few multiples fill the screen.',
    ],
  },
  weld: {
    title: 'Weld Defects (용접부 결함 탐상)',
    steps: [
      'Scan the single-V weld with a shear probe from the plate surface (반사법).',
      'Leg 1 (half skip) inspects the lower half; leg 2 (full skip) the upper half via the backwall.',
      'Read Surface distance + Depth in the status bar to plot each indication.',
      'Planar defects (LOF, crack) are orientation-sensitive — try 45° vs 60° vs 70°.',
      'Porosity is weak and omnidirectional; slag is intermediate. DEFECT button opens the editor.',
      'With the 70° probe near a surface-breaking defect, a weak creeping/surface-wave signal appears (Options → Secondary signals).',
      'RAD opens the simulated radiograph — note which defect types RT sees well, and that laminations do not show at all.',
    ],
  },
  dac: {
    title: 'DAC Curve (거리 진폭 보정 곡선)',
    steps: [
      'Three SDHs at 1/4t, 1/2t and 3/4t are drilled at x = 150.',
      'Peak the leg-1 echo of the shallowest hole, then press DAC PT.',
      'Repeat for the deeper holes (and leg-2 hits) — the dashed DAC curve appears.',
      'Now any indication is graded by "dB DAC" in the status bar (DAC 대비 dB).',
    ],
  },
  spread: {
    title: 'Beam Spread / 20 % Drop Sizing (빔 확산 20% 사이징)',
    steps: [
      'Maximise the lamination echo over the middle of the defect.',
      'Move the probe outwards until the echo drops to 20 % FSH, then press MARK.',
      'Do the same on the far side — the green crosses in the workspace size the defect.',
      'The distance between marks estimates the defect length (결함 길이 추정).',
    ],
  },
  tky: {
    title: 'T / K / Y Joints (TKY 이음부)',
    steps: [
      'A brace plate meets the main plate — set the brace angle in the Weld menu (30–90°).',
      'Scan towards the weld line at the brace toe; a toe crack sits just below the surface.',
      'Watch the skip legs: on thin main plate the leg-2 path reaches the far weld toe.',
      'Steeper braces need shallower probe angles to keep the beam normal to the weld line.',
    ],
  },
  tofd: {
    title: 'TOFD (시간비행회절)',
    steps: [
      'A 60° compression transmitter/receiver pair straddles the weld — drag to move the PAIR.',
      'First arrival: the LATERAL WAVE along the surface at t = 2S / 5.92 µs.',
      'Weak bipolar wiggles between lateral wave and backwall are TIP DIFFRACTION signals — the top and bottom tips of a defect arrive at different times.',
      'Last big signal: the BACKWALL at t = 2·√(S²+t²) / 5.92 µs.',
      'Click on the A-scan to place the cursor: depth d = √((5.92·t/2)² − S²) shows in the status bar.',
      'Adjust the probe-centre spacing with TOFD PCS (2S) and watch every arrival time change.',
    ],
  },
  asme: {
    title: 'ASME Basic Block — DAC/TCG (ASME 교정)',
    steps: [
      'The ASME basic calibration block has three 3 mm SDHs at T/4, T/2 and 3T/4 depth (T selectable 20–50 mm in the Step Wedge menu).',
      'With the 45° probe, peak the leg-1 echo of the T/4 hole and press DAC PT.',
      'Repeat for T/2 and 3T/4 — a 3-point DAC curve is drawn on the screen.',
      'Press TCG: the curve is applied as time-corrected gain and all three reference echoes flatten to 80 % FSH.',
      'The 0° probe sees the holes too — and backwall multiples of T for range calibration.',
    ],
  },
  pipe: {
    title: 'Pipe Circumferential Weld (배관 원주 용접부)',
    steps: [
      'The pipe is shown UNROLLED: the strip is the weld cross-section and the ruler reads circumferential position 0 → πD mm.',
      'Select OD (6/8/12 in) and wall thickness in the Weld menu; the strip length is the circumference C = πD.',
      'DEFECT opens the Circle View dialog: the pipe as an annulus with mm spokes, red defect arcs, APPLY TO ALL, and Save/Load Def.',
      'The 3D Pipe window shows defect clock positions live (0 at top).',
      'Readouts: the surface distance is arc-corrected for OD curvature (SD shown as mm(arc)); RAD shows the radiograph.',
    ],
  },
  aut: {
    title: 'AUT — Automated UT (자동 초음파 탐상)',
    steps: [
      'Press START on the strip chart: the probe traverses the scan span automatically.',
      'The chart records gate peak amplitude vs probe position, building up live.',
      'Segments above the red gate-level line turn RED — defect indications at their surface positions.',
      'Adjust the span with the ◀ ▶ spinners, STOP to pause, RESET to clear and re-run.',
    ],
  },
}

export default function InfoPanel({ modeId, onClose }) {
  const guide = GUIDES[modeId] ?? GUIDES.basic
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  return (
    <WinWindow title={'Exercise Guide — ' + guide.title} initial={{ x: Math.max(8, vw - 356), y: 46 }} width={340} onClose={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="p-2">
        <ol className="list-decimal space-y-1.5 pl-5 text-[11.5px] leading-snug text-ink marker:text-accent">
          {guide.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={onClose} className="bevel-in px-4 py-0.5 text-[11px] font-semibold">OK</button>
        </div>
      </motion.div>
    </WinWindow>
  )
}
