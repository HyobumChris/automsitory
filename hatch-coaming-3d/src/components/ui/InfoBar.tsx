import { useAppStore } from '../../store/useAppStore'
import { YIELD_STRENGTH } from '../../store/rulesEngine'
import { Anchor } from 'lucide-react'

/**
 * Top info bar showing current input summary and rule context.
 */
export function InfoBar() {
  const steelGrade = useAppStore((s) => s.steelGrade)
  const thickness = useAppStore((s) => s.thickness)
  const measures = useAppStore((s) => s.measures)

  const measureCount = [
    measures.measure1,
    measures.measure2,
    measures.measure3,
    measures.measure4_5 !== 'NONE',
  ].filter(Boolean).length

  return (
    <header className="info-bar">
      <div className="info-bar-left">
        <Anchor size={20} />
        <h1>LR Hatch Coaming – Crack Arrest Measures</h1>
      </div>
      <div className="info-bar-right">
        <span className="info-chip">
          {steelGrade} · {YIELD_STRENGTH[steelGrade]} N/mm²
        </span>
        <span className="info-chip">
          t = {thickness} mm
        </span>
        <span className="info-chip info-chip-count">
          {measureCount} measure{measureCount !== 1 ? 's' : ''} active
        </span>
      </div>
    </header>
  )
}
