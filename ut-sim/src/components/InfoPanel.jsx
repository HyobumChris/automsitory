import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // eslint-disable-line no-unused-vars
import { BookOpen, ChevronDown } from 'lucide-react'

const GUIDES = {
  basic: {
    title: 'Basic Controls (기본 조작)',
    steps: [
      'RANGE (측정 범위) sets the mm of beam path across the 10 graticule divisions.',
      'GAIN (게인, dB) raises every echo — try the 0.5 / 2 / 6 dB steps.',
      'X-SHIFT (지연) slides the whole trace left; ZERO corrects the probe wedge delay.',
      'Drag the probe in the specimen view (탐촉자를 드래그) or use ← / → keys (Shift = ×5).',
      'The amber GATE bar picks which echo drives the readouts below.',
    ],
  },
  zero: {
    title: 'Zero / Compression Probe (0° 탐상)',
    steps: [
      'The 0° probe has a 2 mm built-in delay. With ZERO at 0 every reading is 2 mm high.',
      'Set RANGE 100 on the 25 mm plate: you should see backwall multiples.',
      'Adjust ZERO until the echoes sit exactly at 25 / 50 / 75 / 100 mm (교정 완료).',
      'REJECT (제거) removes small grass — note it also hides genuine weak echoes.',
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
      '6. Switch Face to Edge (25 mm) with the 0° probe for compression range calibration.',
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
      'Read Surface distance + Depth to plot each indication on the cross-section.',
      'Planar defects (LOF, crack) are orientation-sensitive — try 45° vs 60° vs 70°.',
      'Porosity is weak and omnidirectional; slag is intermediate. Edit defects on the right.',
    ],
  },
  dac: {
    title: 'DAC Curve (거리 진폭 보정 곡선)',
    steps: [
      'Three SDHs at 1/4t, 1/2t and 3/4t are drilled at x = 150.',
      'Peak the leg-1 echo of the shallowest hole, then press "Record DAC point".',
      'Repeat for the deeper holes (and leg-2 hits) — the dashed cyan DAC curve appears.',
      'Now any indication is graded by "dB to DAC" in the readout bar (DAC 대비 dB).',
    ],
  },
  spread: {
    title: 'Beam Spread / 20 % Drop Sizing (빔 확산 20% 사이징)',
    steps: [
      'Maximise the lamination echo over the middle of the defect.',
      'Move the probe outwards until the echo drops to 20 % FSH, then press "Mark 20% edge".',
      'Do the same on the far side — the green crosses in the specimen view size the defect.',
      'The distance between marks estimates the defect length (결함 길이 추정).',
    ],
  },
  tky: {
    title: 'T / K / Y Joints (TKY 이음부)',
    steps: [
      'A brace plate meets the main plate — set the brace angle with the slider (30–90°).',
      'Scan towards the weld line at the brace toe; a toe crack sits just below the surface.',
      'Watch the skip legs: on thin main plate the leg-2 path reaches the far weld toe.',
      'Steeper braces need shallower probe angles to keep the beam normal to the weld line.',
    ],
  },
}

export default function InfoPanel({ modeId }) {
  const [open, setOpen] = useState(true)
  const guide = GUIDES[modeId] ?? GUIDES.basic
  return (
    <div className="rounded-lg border border-marine-600 bg-marine-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-glow">
          <BookOpen size={13} /> {guide.title}
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-slate-400">
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ol className="list-decimal space-y-1 px-4 pb-2 pl-7 text-[11px] leading-snug text-slate-300">
              {guide.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
