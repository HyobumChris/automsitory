import { motion } from 'framer-motion'
import { Settings, Layers, AlertTriangle, Shield, Eye, Wrench } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { YIELD_STRENGTH, type SteelGrade } from '../../store/rulesEngine'

const GRADES: SteelGrade[] = ['YP36', 'YP40', 'YP47']

export function ControlPanel() {
  const steelGrade = useAppStore((s) => s.steelGrade)
  const thickness = useAppStore((s) => s.thickness)
  const measures = useAppStore((s) => s.measures)
  const setSteelGrade = useAppStore((s) => s.setSteelGrade)
  const setThickness = useAppStore((s) => s.setThickness)

  const activeMeasures: { id: string; label: string; color: string; icon: React.ReactNode }[] = []
  if (measures.measure1) {
    activeMeasures.push({
      id: 'm1',
      label: 'Measure 1 – NDE (UT)',
      color: '#FFD700',
      icon: <Eye size={14} />,
    })
  }
  if (measures.measure2) {
    activeMeasures.push({
      id: 'm2',
      label: 'Measure 2 – Periodic NDE',
      color: '#FFA500',
      icon: <Shield size={14} />,
    })
  }
  if (measures.measure3) {
    activeMeasures.push({
      id: 'm3',
      label: 'Measure 3 – Staggered Welds',
      color: '#38bdf8',
      icon: <Wrench size={14} />,
    })
  }
  if (measures.measure4_5 !== 'NONE') {
    activeMeasures.push({
      id: 'm45',
      label: `Measure 4/5 – ${measures.measure4_5} Steel`,
      color: measures.measure4_5 === 'BCA2' ? '#6B3FA0' : '#0047AB',
      icon: <Layers size={14} />,
    })
  }

  return (
    <div className="control-panel">
      {/* Header */}
      <div className="panel-header">
        <Settings size={18} />
        <span>Control Panel</span>
      </div>

      {/* Steel Grade */}
      <div className="control-section">
        <label className="control-label">Steel Grade</label>
        <select
          value={steelGrade}
          onChange={(e) => setSteelGrade(e.target.value as SteelGrade)}
          className="control-select"
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g} ({YIELD_STRENGTH[g]} N/mm²)
            </option>
          ))}
        </select>
      </div>

      {/* Thickness Slider */}
      <div className="control-section">
        <label className="control-label">
          Plate Thickness
          <span className="thickness-value">{thickness} mm</span>
        </label>
        <input
          type="range"
          min={50}
          max={100}
          step={1}
          value={thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          className="control-slider"
        />
        <div className="slider-labels">
          <span>50 mm</span>
          <span>75 mm</span>
          <span>100 mm</span>
        </div>
      </div>

      {/* Divider */}
      <div className="panel-divider" />

      {/* Active Measures */}
      <div className="control-section">
        <label className="control-label">
          <AlertTriangle size={14} />
          Active Measures
        </label>
        <div className="measures-list">
          {activeMeasures.length === 0 ? (
            <div className="no-measures">
              Set thickness above 50mm to trigger measures
            </div>
          ) : (
            activeMeasures.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="measure-tag"
                style={{ borderLeftColor: m.color }}
              >
                <span className="measure-icon" style={{ color: m.color }}>
                  {m.icon}
                </span>
                <span>{m.label}</span>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="panel-divider" />

      {/* Legend */}
      <div className="control-section">
        <label className="control-label">Color Legend</label>
        <div className="legend">
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#FF0000' }} />
            <span>Uninspected Weld</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#FFD700' }} />
            <span>NDE Passed (Gold)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#4A4A4A' }} />
            <span>Standard Steel</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#0047AB' }} />
            <span>BCA1 (Kca ≥ 6,000)</span>
          </div>
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#6B3FA0' }} />
            <span>BCA2 (Kca ≥ 8,000)</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="panel-footer">
        LR Pt 4, Ch 8, §2.3 · IACS UR S33
      </div>
    </div>
  )
}
