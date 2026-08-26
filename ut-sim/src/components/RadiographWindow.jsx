import { useEffect, useRef } from 'react'
import WinWindow from './WinWindow.jsx'
import { effectiveLength, weldCenterOf } from '../data/specimens.js'

const W = 480
const H = 170
const BAND_Y0 = 58
const BAND_Y1 = 118
const APPLICABLE = ['weld', 'pipe', 'tky']

/** Deterministic pseudo-random stream seeded by a string id. */
function rng(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/**
 * "Radiograph" window: film-style plan view of the weld. Each defect renders
 * as its characteristic RT indication; laminations do NOT show (planar and
 * parallel to the film) - the classic RT-vs-UT teaching point.
 */
export default function RadiographWindow({ specimen, specimenParams, defects, onClose }) {
  const canvasRef = useRef(null)
  const applicable = APPLICABLE.includes(specimen.type)
  const L = effectiveLength(specimen, specimenParams)
  const center = weldCenterOf(specimen, specimenParams)
  const x0 = specimen.type === 'pipe' ? 0 : Math.max(0, center - 100)
  const x1 = specimen.type === 'pipe' ? L : Math.min(L, center + 100)
  const hasLam = defects.some((d) => d.lamination)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !applicable) return
    const mapX = (x) => 92 + ((x - x0) / Math.max(1, x1 - x0)) * (W - 104)
    const bandC = (BAND_Y0 + BAND_Y1) / 2

    // film base + grain
    ctx.fillStyle = '#121212'
    ctx.fillRect(0, 0, W, H)
    const grain = rng('film')
    ctx.fillStyle = 'rgba(255,255,255,0.03)'
    for (let i = 0; i < 700; i++) {
      ctx.fillRect(grain() * W, grain() * H, 1, 1)
    }

    // weld band (lighter: more metal = less exposure) + HAZ + cap edges
    const bg = ctx.createLinearGradient(0, BAND_Y0 - 12, 0, BAND_Y1 + 12)
    bg.addColorStop(0, '#1c1c1c')
    bg.addColorStop(0.25, '#3c3c3c')
    bg.addColorStop(0.5, '#464646')
    bg.addColorStop(0.75, '#3c3c3c')
    bg.addColorStop(1, '#1c1c1c')
    ctx.fillStyle = bg
    ctx.fillRect(60, BAND_Y0 - 12, W - 68, BAND_Y1 - BAND_Y0 + 24)
    ctx.strokeStyle = '#525252'
    ctx.lineWidth = 1
    const edge = rng('edge')
    for (const y of [BAND_Y0, BAND_Y1]) {
      ctx.beginPath()
      for (let px = 60; px <= W - 8; px += 6) {
        const yy = y + (edge() - 0.5) * 2
        if (px === 60) ctx.moveTo(px, yy)
        else ctx.lineTo(px, yy)
      }
      ctx.stroke()
    }

    // IQI wire penetrameter (7 wires, decreasing diameter)
    for (let i = 0; i < 7; i++) {
      const wx = 22 + i * 8
      ctx.fillStyle = 'rgba(200,200,200,' + (0.34 - i * 0.04) + ')'
      ctx.fillRect(wx, 52, Math.max(0.6, 3 - i * 0.4), 72)
    }
    ctx.fillStyle = '#8a8a8a'
    ctx.font = '8px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText('EN 462', 16, 46)
    ctx.fillText('W10', 16, 136)

    // defect indications
    for (const d of defects) {
      if (d.lamination) continue // not visible on RT
      const r = rng(d.id + d.kind)
      const fx0 = mapX(d.x - (d.size ?? 4) / 2)
      const fx1 = mapX(d.x + (d.size ?? 4) / 2)
      const jitter = (r() - 0.5) * 26
      const y = Math.min(BAND_Y1 - 6, Math.max(BAND_Y0 + 6, bandC + jitter))
      ctx.strokeStyle = '#050505'
      ctx.fillStyle = '#050505'
      switch (d.kind) {
        case 'crack':
        case 'toeCrack': {
          const yy = d.kind === 'toeCrack' ? BAND_Y0 + 4 : y
          ctx.lineWidth = 1
          ctx.beginPath()
          const n = Math.max(6, Math.floor((fx1 - fx0) / 4))
          for (let i = 0; i <= n; i++) {
            const px = fx0 + ((fx1 - fx0) * i) / n
            const py = yy + (r() - 0.5) * 6
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          }
          ctx.stroke()
          break
        }
        case 'lof': {
          const side = (d.tilt ?? 0) >= 0 ? -1 : 1
          const yy = bandC + side * 14
          ctx.lineWidth = 1.6
          ctx.beginPath()
          ctx.moveTo(fx0, yy)
          ctx.lineTo(fx1, yy)
          ctx.stroke()
          break
        }
        case 'lorp': {
          ctx.lineWidth = 2.2
          ctx.beginPath()
          ctx.moveTo(fx0, bandC)
          ctx.lineTo(fx1, bandC)
          ctx.stroke()
          break
        }
        case 'porosity': {
          const n = 6
          for (let i = 0; i < n; i++) {
            ctx.beginPath()
            ctx.arc(fx0 + r() * (fx1 - fx0), y + (r() - 0.5) * 18, 1.4 + r() * 1.6, 0, Math.PI * 2)
            ctx.fill()
          }
          break
        }
        case 'slag': {
          for (let i = 0; i < 3; i++) {
            ctx.save()
            ctx.translate(fx0 + r() * (fx1 - fx0), y + (r() - 0.5) * 12)
            ctx.rotate((r() - 0.5) * 1.2)
            ctx.beginPath()
            ctx.ellipse(0, 0, 3 + r() * 4, 1.2 + r() * 1.2, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
          break
        }
        case 'sdh': {
          ctx.beginPath()
          ctx.arc((fx0 + fx1) / 2, y, 2.2, 0, Math.PI * 2)
          ctx.fill()
          break
        }
        default:
          break
      }
    }

    // film scale labels
    ctx.fillStyle = '#777'
    ctx.font = '9px "IBM Plex Mono", ui-monospace, monospace'
    ctx.textAlign = 'center'
    const step = specimen.type === 'pipe' ? 100 : 50
    for (let mm = Math.ceil(x0 / step) * step; mm <= x1; mm += step) {
      ctx.fillText(String(mm), mapX(mm), H - 6)
    }
  }, [applicable, defects, specimen.type, x0, x1])

  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  return (
    <WinWindow title="Radiograph (방사선투과사진)" initial={{ x: Math.max(8, vw - 510), y: 54 }} onClose={onClose} className="z-[45]">
      <div className="bg-[#0a0a0a] p-1">
        {applicable ? (
          <canvas ref={canvasRef} width={W} height={H} className="block" />
        ) : (
          <div className="flex h-[80px] w-[380px] items-center justify-center px-4 text-center text-[11px] text-[#aaa]">
            Radiograph is available for weld, pipe and TKY specimens — 용접부/배관/TKY 시험편에서 사용 가능합니다.
          </div>
        )}
      </div>
      {applicable && hasLam && (
        <div className="border-t border-defect-red/25 bg-defect-red/6 px-2 py-1 text-[10px] font-medium text-defect-red">
          Lamination NOT visible on RT — planar and parallel to the film. Use 0° UT! (라미네이션은 RT에 나타나지 않음)
        </div>
      )}
    </WinWindow>
  )
}
