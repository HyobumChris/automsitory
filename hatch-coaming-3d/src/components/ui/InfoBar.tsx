import { Anchor, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { YIELD_STRENGTH } from '../../store/rulesEngine'

export function InfoBar() {
  const { steelGrade, thickness, evaluation, showAll } = useAppStore()
  const activeMeasures = showAll ? [1, 2, 3, 4, 5] : evaluation.activeMeasureIds

  return (
    <header className="info-bar">
      <div className="info-bar-left">
        <Anchor size={18} />
        <h1>LR Rules Pt 4, Ch 8, §2.3 — Crack Arrest Measures for Thick Steel Plates in Container Ships</h1>
      </div>
      <div className="info-bar-right">
        <span className="info-chip">
          {steelGrade} ({YIELD_STRENGTH[steelGrade]} N/mm²)
        </span>
        <span className="info-chip">
          t = {thickness} mm
        </span>
        <span className={`info-chip ${activeMeasures.length > 0 ? 'info-chip-count' : ''}`}>
          {activeMeasures.length} Measure{activeMeasures.length !== 1 ? 's' : ''} Active
        </span>
        {thickness > 100 && (
          <span className="info-chip info-chip-warning">
            <AlertTriangle size={12} />
            Special Consideration
          </span>
        )}
      </div>
    </header>
  )
}
