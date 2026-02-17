'use client';

import { DecisionResults, ColorsConfig, DEFAULT_COLORS, MEASURE_LABELS } from '@/lib/types';

interface Props {
  results: DecisionResults;
  colors: ColorsConfig;
}

export default function StepGlobalMeasures({ results, colors }: Props) {
  const cv = results.control_values;
  const M = cv.required_measures_global;

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Step 3: Required Measures (Table 8.2.1 Lookup)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Based on y_control = {cv.y_control_nmm2} N/mm² and t_control = {cv.t_control_mm} mm,
          the following measures are required from Table 8.2.1.
          Note: &quot;3+4&quot; columns are expanded into separate Measure 3 and Measure 4 entries.
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map(mid => {
            const required = M.includes(mid);
            const cfg = colors.measures[String(mid)];
            const color = cfg?.hex || DEFAULT_COLORS[mid] || '#888';
            const label = cfg?.label || MEASURE_LABELS[mid];

            return (
              <div
                key={mid}
                className="card"
                style={{
                  flex: 1,
                  minWidth: 150,
                  borderLeft: `4px solid ${color}`,
                  opacity: required ? 1 : 0.4,
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Measure {mid}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  {label}
                </div>
                <span className={`badge ${required ? 'badge-applied' : ''}`}
                      style={!required ? { background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' } : {}}>
                  {required ? 'REQUIRED' : 'Not Required'}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 13 }}>
          <strong>Cumulative Set: </strong>
          <span style={{ color: 'var(--accent-green)', fontFamily: 'monospace' }}>
            [{M.join(', ')}]
          </span>
        </div>
      </div>
    </div>
  );
}
