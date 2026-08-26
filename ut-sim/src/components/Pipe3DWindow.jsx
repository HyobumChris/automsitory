import { useEffect, useRef } from 'react'
import WinWindow from './WinWindow.jsx'
import { effectiveLength } from '../data/specimens.js'

const W = 300
const H = 190

/** "3D Pipe" window: pseudo-3D pipe on black with weld band + defect marks. */
export default function Pipe3DWindow({ specimen, specimenParams, defects, onClose }) {
  const canvasRef = useRef(null)
  const C = effectiveLength(specimen, specimenParams)
  const odIn = specimenParams.odIn ?? specimen.odIn

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, W, H)

    const cy = 95
    const ry = 55
    const rx = 14
    const x0 = 34
    const x1 = 266

    // cylinder body with metallic vertical gradient
    const grad = ctx.createLinearGradient(0, cy - ry, 0, cy + ry)
    grad.addColorStop(0, '#4a4a4a')
    grad.addColorStop(0.28, '#c0c0c0')
    grad.addColorStop(0.55, '#8a8a8a')
    grad.addColorStop(1, '#2f2f2f')
    ctx.fillStyle = grad
    ctx.fillRect(x0, cy - ry, x1 - x0, 2 * ry)

    // ends
    ctx.strokeStyle = '#d0d0d0'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.ellipse(x0, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#222'
    ctx.beginPath()
    ctx.ellipse(x1, cy, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()

    // weld band (circumferential) at centre
    const wx = (x0 + x1) / 2
    ctx.fillStyle = 'rgba(230,230,230,0.5)'
    ctx.fillRect(wx - 5, cy - ry, 10, 2 * ry)
    ctx.strokeStyle = '#666'
    ctx.strokeRect(wx - 5, cy - ry, 10, 2 * ry)
    ctx.beginPath()
    ctx.ellipse(wx, cy, rx * 0.9, ry, 0, -Math.PI / 2, Math.PI / 2)
    ctx.strokeStyle = 'rgba(240,240,240,0.7)'
    ctx.stroke()

    // defect marks at their clock positions (theta = 0 at top, front = right half)
    for (const d of defects) {
      const th = (d.x / Math.max(C, 1)) * Math.PI * 2
      const y = cy - ry * Math.cos(th)
      const front = Math.sin(th) >= 0
      const h = Math.max(3, ((d.size ?? 4) / C) * 2 * ry * Math.PI * 0.5)
      ctx.fillStyle = front ? '#ff2020' : '#701010'
      ctx.fillRect(wx - 5, y - h / 2, 10, h)
    }

    // caption
    ctx.fillStyle = '#c8c8c8'
    ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(odIn + '" OD pipe — C = ' + C + ' mm — 0 at top, front = right', 8, H - 8)
  }, [defects, C, odIn])

  return (
    <WinWindow title="3D Pipe" initial={{ x: 630, y: 330 }} onClose={onClose} className="z-[45]">
      <div className="bg-black p-1">
        <canvas ref={canvasRef} width={W} height={H} className="block" />
      </div>
    </WinWindow>
  )
}
