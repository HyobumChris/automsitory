import { useEffect, useRef } from 'react'

// Internal canvas resolution (scaled by CSS)
const W = 520
const H = 400
const ML = 10
const MR = 10
const MT = 10
const MB = 30
const PW = W - ML - MR
const PH = H - MT - MB

const SKINS = {
  usk7: {
    panel: '#0d1117',
    screen: '#061178',
    grid: '#1e2fa8',
    gridMajor: '#2f43c4',
    trace: '#3ce6ff',
    traceFill: 'rgba(60,230,255,0.82)',
    text: '#ffffff',
    dac: '#ffffff',
    gate: '#e8a13c',
  },
  epoch: {
    panel: '#0d1117',
    screen: '#050a05',
    grid: '#173a17',
    gridMajor: '#245c24',
    trace: '#37e05c',
    traceFill: 'rgba(55,224,92,0.82)',
    text: '#d0ffd0',
    dac: '#ffe08a',
    gate: '#e8a13c',
  },
}

function fract(v) {
  return v - Math.floor(v)
}

/** Rectified CRT pulse: oscillation lobes under a gaussian envelope. */
function pulse(d, w, damp) {
  const env = Math.exp(-(d * d) / (2 * w * w * 4))
  if (damp) return env
  return Math.abs(Math.cos((Math.PI * d) / (2 * w))) * env
}

/** Bipolar TOFD wiggle (Morlet-like). */
function wiggle(d, w) {
  return Math.sin((Math.PI * d) / w) * Math.exp(-(d * d) / (2 * w * w))
}

export default function AScanDisplay({ echoes, settings, gate, dacPoints, skin = 'usk7', damp = false, tofd = null, onPick }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const C = SKINS[skin] ?? SKINS.usk7
    const { range, xShift } = settings
    const isTofd = !!(tofd && tofd.active)

    const xOfUnit = (u) => ML + ((u - xShift) / range) * PW
    const yOfPct = (pct) => MT + PH - (Math.min(pct, 104) / 100) * PH

    // panel + screen
    ctx.fillStyle = C.panel
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = C.screen
    ctx.fillRect(ML, MT, PW, PH)

    // graticule 10 x 10
    ctx.lineWidth = 1
    for (let i = 0; i <= 10; i++) {
      const x = ML + (PW * i) / 10
      ctx.strokeStyle = i === 5 ? C.gridMajor : C.grid
      ctx.beginPath()
      ctx.moveTo(x, MT)
      ctx.lineTo(x, MT + PH)
      ctx.stroke()
      const y = MT + (PH * i) / 10
      ctx.strokeStyle = i === 5 ? C.gridMajor : C.grid
      ctx.beginPath()
      ctx.moveTo(ML, y)
      ctx.lineTo(ML + PW, y)
      ctx.stroke()
    }

    // white numerals 0 2 4 6 8 10 below the screen, on the dark panel
    ctx.fillStyle = C.text
    ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'center'
    for (let i = 0; i <= 10; i += 2) {
      ctx.fillText(String(i), ML + (PW * i) / 10, H - 12)
    }
    ctx.textAlign = 'right'
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'
    ctx.fillText(isTofd ? 'µs  (0-' + range.toFixed(0) + ')' : 'mm  (0-' + range.toFixed(0) + ')', W - 6, H - 2)

    // DAC curve (dashed) - conventional modes only
    if (!isTofd && dacPoints.length >= 2) {
      ctx.strokeStyle = C.dac
      ctx.setLineDash([6, 4])
      ctx.lineWidth = 1.5
      ctx.beginPath()
      dacPoints.forEach((p, i) => {
        const x = xOfUnit(p.s)
        const y = yOfPct(p.amp)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = C.dac
      for (const p of dacPoints) {
        const x = xOfUnit(p.s)
        if (x < ML || x > ML + PW) continue
        ctx.beginPath()
        ctx.arc(x, yOfPct(p.amp), 2.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const unitPerPx = range / PW

    if (isTofd) {
      // RF (bipolar) display around a mid-screen baseline
      const baseY = MT + PH * 0.5
      const sig = new Float32Array(PW + 1)
      for (let px = 0; px <= PW; px++) {
        sig[px] = 0.8 * (fract(Math.sin((px + 1) * 12.9898) * 43758.5453) - 0.5)
      }
      for (const e of echoes) {
        const w = e.tip ? Math.max(range / 90, 0.12) : Math.max(range / 55, 0.2)
        const centerPx = ((e.apparent - xShift) / range) * PW
        const span = Math.ceil((w / unitPerPx) * 4)
        for (let px = Math.max(0, Math.floor(centerPx - span)); px <= Math.min(PW, Math.ceil(centerPx + span)); px++) {
          const dU = (px - centerPx) * unitPerPx
          sig[px] += (e.phase ?? 1) * e.amp * wiggle(dU, w)
        }
      }
      ctx.strokeStyle = C.trace
      ctx.lineWidth = 1.4
      ctx.shadowColor = C.trace
      ctx.shadowBlur = 2
      ctx.beginPath()
      for (let px = 0; px <= PW; px++) {
        const y = baseY - (Math.max(-100, Math.min(100, sig[px])) / 100) * (PH * 0.46)
        if (px === 0) ctx.moveTo(ML + px, y)
        else ctx.lineTo(ML + px, y)
      }
      ctx.stroke()
      ctx.shadowBlur = 0
      // picked cursor + depth label
      if (tofd.cursorUs != null) {
        const cx = xOfUnit(tofd.cursorUs)
        if (cx >= ML && cx <= ML + PW) {
          ctx.strokeStyle = '#ffffff'
          ctx.setLineDash([4, 3])
          ctx.beginPath()
          ctx.moveTo(cx, MT)
          ctx.lineTo(cx, MT + PH)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'left'
          ctx.font = '600 11px "IBM Plex Mono", ui-monospace, monospace'
          const lbl = tofd.cursorUs.toFixed(2) + 'µs  d=' + (tofd.depth != null ? tofd.depth.toFixed(1) : '--') + 'mm'
          ctx.fillText(lbl, Math.min(cx + 4, W - 120), MT + 14)
        }
      }
    } else {
      // rectified filled-spike trace
      const sig = new Float32Array(PW + 1)
      for (let px = 0; px <= PW; px++) {
        sig[px] = 0.6 + 1.1 * fract(Math.sin((px + 1) * 12.9898) * 43758.5453)
      }
      const wU = Math.max(range / 130, 0.35)
      for (const e of echoes) {
        const centerPx = ((e.apparent - xShift) / range) * PW
        const span = Math.ceil((wU / unitPerPx) * 7)
        for (let px = Math.max(0, Math.floor(centerPx - span)); px <= Math.min(PW, Math.ceil(centerPx + span)); px++) {
          const dU = (px - centerPx) * unitPerPx
          const v = e.amp * pulse(dU, wU, damp)
          if (v > sig[px]) sig[px] = v
        }
      }
      const baseY = MT + PH
      ctx.fillStyle = C.traceFill
      ctx.strokeStyle = C.trace
      ctx.lineWidth = 1.2
      ctx.shadowColor = C.trace
      ctx.shadowBlur = 2
      ctx.beginPath()
      ctx.moveTo(ML, baseY)
      for (let px = 0; px <= PW; px++) {
        ctx.lineTo(ML + px, yOfPct(sig[px]))
      }
      ctx.lineTo(ML + PW, baseY)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.shadowBlur = 0

      // gate bar (amber)
      if (gate.on) {
        const gx0 = Math.max(ML, xOfUnit(gate.start))
        const gx1 = Math.min(ML + PW, xOfUnit(gate.start + gate.width))
        if (gx1 > gx0) {
          const gy = yOfPct(gate.level)
          ctx.strokeStyle = C.gate
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(gx0, gy)
          ctx.lineTo(gx1, gy)
          ctx.stroke()
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(gx0, gy - 6)
          ctx.lineTo(gx0, gy + 6)
          ctx.moveTo(gx1, gy - 6)
          ctx.lineTo(gx1, gy + 6)
          ctx.stroke()
        }
      }
    }
  }, [echoes, settings, gate, dacPoints, skin, damp, tofd])

  const handleClick = (e) => {
    if (!onPick || !(tofd && tofd.active)) return
    const rect = canvasRef.current.getBoundingClientRect()
    const px = ((e.clientX - rect.left) * W) / rect.width - ML
    if (px < 0 || px > PW) return
    onPick(settings.xShift + (px / PW) * settings.range)
  }

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onClick={handleClick}
      className="block"
      style={{ width: W, height: H, cursor: tofd && tofd.active ? 'crosshair' : 'default' }}
    />
  )
}
