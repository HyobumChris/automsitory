import { useEffect, useRef } from 'react'

// Internal canvas resolution (scaled by CSS)
const W = 800
const H = 520
const ML = 46 // left margin (percent scale)
const MR = 14
const MT = 16
const MB = 30
const PW = W - ML - MR
const PH = H - MT - MB

const BG = '#03120a'
const GRID = 'rgba(57, 255, 90, 0.16)'
const GRID_MAJOR = 'rgba(57, 255, 90, 0.34)'
const TRACE = '#39ff5a'
const TEXT = 'rgba(140, 255, 160, 0.85)'
const GATE = '#ffab00'
const DAC = '#00e5ff'

function fract(v) {
  return v - Math.floor(v)
}

/** CRT-style pulse: rectified oscillation under a gaussian envelope. */
function pulse(d, w) {
  const env = Math.exp(-(d * d) / (2 * w * w * 4))
  return Math.abs(Math.cos((Math.PI * d) / (2 * w))) * env
}

export default function AScanDisplay({ echoes, settings, gate, dacPoints, probe }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const { range, xShift, gain, probeZero } = settings

    const xOfMm = (mm) => ML + ((mm - xShift) / range) * PW
    const yOfPct = (pct) => MT + PH - (Math.min(pct, 104) / 100) * PH

    // background
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, W, H)

    // graticule 10 x 10
    ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const x = ML + (PW * i) / 10
      ctx.strokeStyle = i === 5 ? GRID_MAJOR : GRID
      ctx.beginPath()
      ctx.moveTo(x, MT)
      ctx.lineTo(x, MT + PH)
      ctx.stroke()
      const y = MT + (PH * i) / 10
      ctx.strokeStyle = i === 5 ? GRID_MAJOR : GRID
      ctx.beginPath()
      ctx.moveTo(ML, y)
      ctx.lineTo(ML + PW, y)
      ctx.stroke()
    }
    // minor ticks along the baseline
    ctx.strokeStyle = GRID_MAJOR
    for (let i = 0; i <= 50; i++) {
      const x = ML + (PW * i) / 50
      ctx.beginPath()
      ctx.moveTo(x, MT + PH - 4)
      ctx.lineTo(x, MT + PH)
      ctx.stroke()
    }

    // axis labels
    ctx.fillStyle = TEXT
    ctx.font = '11px "IBM Plex Mono", monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 10; i += 2) {
      const mm = xShift + (range * i) / 10
      ctx.fillText(mm.toFixed(0), ML + (PW * i) / 10, H - 12)
    }
    ctx.fillText('mm (beam path)', ML + PW / 2, H - 1)
    ctx.textAlign = 'right'
    for (let i = 0; i <= 100; i += 20) {
      ctx.fillText(i + '%', ML - 6, yOfPct(i) + 4)
    }

    // DAC curve (dashed cyan)
    if (dacPoints.length >= 2) {
      ctx.strokeStyle = DAC
      ctx.setLineDash([7, 5])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      dacPoints.forEach((p, i) => {
        const x = xOfMm(p.s)
        const y = yOfPct(p.amp)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.setLineDash([])
    }
    // DAC recorded points
    ctx.fillStyle = DAC
    for (const p of dacPoints) {
      const x = xOfMm(p.s)
      if (x < ML || x > ML + PW) continue
      ctx.beginPath()
      ctx.arc(x, yOfPct(p.amp), 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // build the trace signal (max-combined echoes + faint baseline noise)
    const sig = new Float32Array(PW + 1)
    for (let px = 0; px <= PW; px++) {
      sig[px] = 0.6 + 1.1 * fract(Math.sin((px + 1) * 12.9898) * 43758.5453)
    }
    const wMm = Math.max(range / 130, 0.35) // pulse half-width in mm
    const mmPerPx = range / PW
    const wPx = wMm / mmPerPx
    for (const e of echoes) {
      const centerPx = ((e.apparent - xShift) / range) * PW
      const span = Math.ceil(wPx * 7)
      const lo = Math.max(0, Math.floor(centerPx - span))
      const hi = Math.min(PW, Math.ceil(centerPx + span))
      for (let px = lo; px <= hi; px++) {
        const dMm = (px - centerPx) * mmPerPx
        const v = e.amp * pulse(dMm, wMm)
        if (v > sig[px]) sig[px] = v
      }
    }

    // trace with phosphor glow
    ctx.save()
    ctx.strokeStyle = TRACE
    ctx.lineWidth = 1.6
    ctx.shadowColor = TRACE
    ctx.shadowBlur = 7
    ctx.beginPath()
    for (let px = 0; px <= PW; px++) {
      const x = ML + px
      const y = yOfPct(sig[px])
      if (px === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()

    // gate bar (amber)
    if (gate.on) {
      const gx0 = Math.max(ML, xOfMm(gate.start))
      const gx1 = Math.min(ML + PW, xOfMm(gate.start + gate.width))
      if (gx1 > gx0) {
        const gy = yOfPct(gate.level)
        ctx.strokeStyle = GATE
        ctx.lineWidth = 3
        ctx.shadowColor = GATE
        ctx.shadowBlur = 5
        ctx.beginPath()
        ctx.moveTo(gx0, gy)
        ctx.lineTo(gx1, gy)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(gx0, gy - 7)
        ctx.lineTo(gx0, gy + 7)
        ctx.moveTo(gx1, gy - 7)
        ctx.lineTo(gx1, gy + 7)
        ctx.stroke()
      }
    }

    // status line (top of the screen)
    ctx.fillStyle = TEXT
    ctx.font = '12px "IBM Plex Mono", monospace'
    ctx.textAlign = 'left'
    const status =
      'RANGE ' + range.toFixed(0) + 'mm  GAIN ' + gain.toFixed(1) + 'dB  X-SHIFT ' +
      xShift.toFixed(1) + '  ZERO ' + probeZero.toFixed(1) + '  ' +
      (probe.angle === 0 ? '0° COMP 5.92 mm/µs' : probe.angle + '° SHEAR 3.24 mm/µs')
    ctx.fillText(status, ML + 2, MT - 4)
  }, [echoes, settings, gate, dacPoints, probe])

  return (
    <div className="rounded-lg border border-marine-600 bg-black/60 p-2 shadow-[0_0_24px_rgba(0,229,255,0.08)]">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="w-full rounded"
        style={{ aspectRatio: W + ' / ' + H }}
      />
    </div>
  )
}
