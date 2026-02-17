import { motion, AnimatePresence } from 'framer-motion'
import {
  Shield,
  Layers,
  Gauge,
  RotateCcw,
  Eye,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Info,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import type { Measure3SubOption } from '../../store/useAppStore'
import {
  type SteelGrade,
  YIELD_STRENGTH,
  MEASURES_DATA,
} from '../../store/rulesEngine'

const GRADES: SteelGrade[] = ['EH36', 'EH40', 'EH47']

export function ControlPanel() {
  const {
    steelGrade,
    thickness,
    evaluation,
    measure3SubOption,
    highlightedMeasure,
    showAll,
    setSteelGrade,
    setThickness,
    setMeasure3SubOption,
    setHighlightedMeasure,
    setShowAll,
    reset,
  } = useAppStore()

  const activeMeasures = showAll ? [1, 2, 3, 4, 5] : evaluation.activeMeasureIds

  return (
    <aside className="control-panel">
      {/* ─── Step 1: Material Grade ─── */}
      <div className="control-section">
        <div className="panel-header">
          <Shield size={14} />
          <span>Step 1 — Material Grade</span>
        </div>
        <div className="grade-cards">
          {GRADES.map((grade) => {
            const isActive = steelGrade === grade
            const yieldVal = YIELD_STRENGTH[grade]
            return (
              <motion.button
                key={grade}
                className={`grade-card ${isActive ? 'active' : ''}`}
                onClick={() => setSteelGrade(grade)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                layout
              >
                <div className="grade-card-header">
                  <span className="grade-name">{grade}</span>
                  {isActive && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="grade-check"
                    >
                      <CheckCircle2 size={14} />
                    </motion.span>
                  )}
                </div>
                <div className="grade-yield">{yieldVal} N/mm²</div>
              </motion.button>
            )
          })}
        </div>
      </div>

      <div className="panel-divider" />

      {/* ─── Step 2: Thickness ─── */}
      <div className="control-section">
        <div className="panel-header">
          <Layers size={14} />
          <span>Step 2 — Plate Thickness</span>
          <span className="thickness-value">{thickness} mm</span>
        </div>
        <input
          type="range"
          min={51}
          max={100}
          step={1}
          value={thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          className="control-slider"
        />
        <div className="slider-labels">
          <span>51 mm</span>
          <span className="slider-threshold">85 mm</span>
          <span>100 mm</span>
        </div>
        {thickness > 100 && (
          <div className="warning-banner">
            <AlertCircle size={12} />
            <span>Steels &gt;100mm require special consideration</span>
          </div>
        )}
      </div>

      <div className="panel-divider" />

      {/* ─── Applicable Measures ─── */}
      <div className="control-section">
        <div className="panel-header">
          <Gauge size={14} />
          <span>Applicable Measures</span>
          <span className="measures-count">{activeMeasures.length}</span>
        </div>

        <div className="measures-list">
          <AnimatePresence mode="popLayout">
            {activeMeasures.length === 0 && !showAll && (
              <motion.div
                key="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="no-measures"
              >
                No measures required for this configuration
              </motion.div>
            )}
            {[1, 2, 3, 4, 5].map((id) => {
              const data = MEASURES_DATA[id]
              const isActive = activeMeasures.includes(id)
              const measureResult = evaluation.measures.find((m) => m.id === id)
              const hasNote = measureResult?.note

              if (!isActive) return null

              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, x: -20, height: 0 }}
                  animate={{ opacity: 1, x: 0, height: 'auto' }}
                  exit={{ opacity: 0, x: -20, height: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  className={`measure-tag ${highlightedMeasure === id ? 'highlighted' : ''}`}
                  style={{ borderLeftColor: data.color }}
                  onMouseEnter={() => setHighlightedMeasure(id)}
                  onMouseLeave={() => setHighlightedMeasure(null)}
                  onClick={() =>
                    setHighlightedMeasure(highlightedMeasure === id ? null : id)
                  }
                >
                  <div
                    className="measure-dot"
                    style={{ backgroundColor: data.color }}
                  />
                  <div className="measure-tag-content">
                    <div className="measure-tag-title">
                      {data.name}: {data.title}
                    </div>
                    {hasNote && (
                      <div className="measure-note">
                        <Info size={10} />
                        <span>{hasNote}</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={12} className="measure-arrow" />
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Measure 3 Sub-Options ─── */}
      {activeMeasures.includes(3) && (
        <>
          <div className="panel-divider" />
          <div className="control-section">
            <div className="panel-header" style={{ color: '#DC2626' }}>
              <Shield size={14} />
              <span>Measure 3 — Design Option</span>
            </div>
            <div className="sub-options">
              {Object.entries(MEASURES_DATA[3].subOptions!).map(([key, opt]) => {
                const isSelected = measure3SubOption === key
                return (
                  <motion.button
                    key={key}
                    className={`sub-option-btn ${isSelected ? 'active' : ''}`}
                    onClick={() =>
                      setMeasure3SubOption(
                        isSelected ? null : (key as Measure3SubOption),
                      )
                    }
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                  >
                    <span className="sub-option-key">({key})</span>
                    <span className="sub-option-label">{opt.label}</span>
                    {isSelected && (
                      <CheckCircle2 size={12} className="sub-option-check" />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        </>
      )}

      <div className="panel-divider" />

      {/* ─── Controls ─── */}
      <div className="control-actions">
        <button
          className={`action-btn toggle-btn ${showAll ? 'active' : ''}`}
          onClick={() => setShowAll(!showAll)}
        >
          <Eye size={14} />
          <span>{showAll ? 'Showing All' : 'Show All'}</span>
        </button>
        <button className="action-btn reset-btn" onClick={reset}>
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      {/* ─── Legend ─── */}
      <div className="panel-divider" />
      <div className="control-section">
        <div className="panel-header">
          <Layers size={14} />
          <span>Color Legend</span>
        </div>
        <div className="legend">
          {Object.entries(MEASURES_DATA).map(([id, data]) => (
            <div key={id} className="legend-item">
              <div
                className="legend-swatch"
                style={{ backgroundColor: data.color }}
              />
              <span className="legend-label">{data.name}</span>
              <span className="legend-desc">— {data.title.split(' ').slice(0, 3).join(' ')}...</span>
            </div>
          ))}
          <div className="legend-item">
            <div className="legend-swatch" style={{ backgroundColor: '#3B4559' }} />
            <span className="legend-label">Base</span>
            <span className="legend-desc">— Uninspected structure</span>
          </div>
        </div>
      </div>

      {/* ─── Footer ─── */}
      <div className="panel-footer">
        LR Rules Pt 4, Ch 8, §2.3 | IACS UR S33
      </div>
    </aside>
  )
}
