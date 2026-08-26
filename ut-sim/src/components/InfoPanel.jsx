import { useRef, useState } from 'react'
import { motion } from 'framer-motion' // eslint-disable-line no-unused-vars

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

function useDragWindow(initial) {
  const [pos, setPos] = useState(initial)
  const drag = useRef(null)
  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy })
  }
  const onPointerUp = () => {
    drag.current = null
  }
  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp } }
}

export default function InfoPanel({ modeId, onClose }) {
  const { pos, handlers } = useDragWindow({ x: 850, y: 40 })
  const guide = GUIDES[modeId] ?? GUIDES.basic
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className="absolute z-50 w-[340px] select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="bevel-out shadow-[4px_4px_8px_rgba(0,0,0,0.35)]">
        <div
          {...handlers}
          className="flex cursor-move touch-none items-center bg-[linear-gradient(90deg,#000080,#1084d0)] px-1.5 py-0.5 text-[11px] font-bold text-white"
        >
          Exercise Guide — {guide.title}
          <button type="button" onClick={onClose} className="bevel-out ml-auto h-[15px] w-[17px] text-[9px] leading-none text-black">✕</button>
        </div>
        <div className="p-2">
          <ol className="list-decimal space-y-1 pl-5 text-[11px] leading-snug text-black">
            {guide.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={onClose} className="bevel-out px-4 py-0.5 text-[11px] font-bold text-black">OK</button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
