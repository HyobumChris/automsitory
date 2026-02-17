import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, FileText } from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { MEASURES_DATA, BCA_TABLE, YIELD_STRENGTH } from '../../store/rulesEngine'

export function DetailPanel() {
  const {
    steelGrade,
    evaluation,
    measure3SubOption,
    showAll,
  } = useAppStore()

  const activeMeasures = showAll ? [1, 2, 3, 4, 5] : evaluation.activeMeasureIds
  const yieldVal = YIELD_STRENGTH[steelGrade]

  // Show BCA table when Measures 3, 4, or 5 are active
  const showBCA = activeMeasures.some((m) => [3, 4, 5].includes(m))

  if (activeMeasures.length === 0) {
    return (
      <div className="detail-panel">
        <div className="detail-empty">
          <BookOpen size={16} />
          <span>
            Select a material grade and thickness to see applicable crack arrest
            measures and rule references.
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="detail-panel">
      <div className="detail-content">
        {/* ─── Active Measure Rule Texts ─── */}
        <div className="detail-measures">
          <AnimatePresence mode="popLayout">
            {activeMeasures.map((id) => {
              const data = MEASURES_DATA[id]
              return (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="detail-card"
                  style={{ borderLeftColor: data.color }}
                >
                  <div className="detail-card-header">
                    <span
                      className="detail-card-badge"
                      style={{ backgroundColor: data.color }}
                    >
                      {data.name}
                    </span>
                    <span className="detail-card-ref">
                      <FileText size={10} />
                      {data.ruleRef}
                    </span>
                  </div>
                  <div className="detail-card-title">{data.title}</div>
                  <div className="detail-card-desc">{data.description}</div>

                  {/* Measure 3 sub-option detail */}
                  {id === 3 && measure3SubOption && data.subOptions && (
                    <div className="detail-suboption">
                      <span className="detail-suboption-key">
                        Option ({measure3SubOption}):
                      </span>
                      <span className="detail-suboption-label">
                        {data.subOptions[measure3SubOption].label}
                      </span>
                      <p className="detail-suboption-desc">
                        {data.subOptions[measure3SubOption].desc}
                      </p>
                      <span className="detail-suboption-ref">
                        Ref: {data.subOptions[measure3SubOption].ruleRef}
                      </span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* ─── BCA Table ─── */}
        {showBCA && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bca-table-container"
          >
            <div className="bca-table-header">
              <span>Table 8.2.2 — Brittle Crack Arrest Steel Types</span>
            </div>
            <table className="bca-table">
              <thead>
                <tr>
                  <th>Structural Member</th>
                  <th>Thickness (mm)</th>
                  <th>Yield (N/mm²)</th>
                  <th>BCA Type</th>
                </tr>
              </thead>
              <tbody>
                {BCA_TABLE.map((row, i) => {
                  const isRelevant = row.yields.includes(yieldVal)
                  return (
                    <tr
                      key={i}
                      className={isRelevant ? 'bca-row-relevant' : ''}
                    >
                      <td>{row.member}</td>
                      <td className="mono">{row.thickness}</td>
                      <td className="mono">{row.yields.join(', ')}</td>
                      <td>
                        <span
                          className={`bca-badge ${row.bca.toLowerCase()}`}
                        >
                          {row.bca}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </div>
    </div>
  )
}
