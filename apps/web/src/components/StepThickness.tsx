'use client';

import { DecisionResults } from '@/lib/types';

interface Props {
  results: DecisionResults;
}

export default function StepThickness({ results }: Props) {
  const cv = results.control_values;

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Step 2: Thickness (As-Built)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          The controlling thickness (t_control) is max(coaming_side, coaming_top).
          This value determines which Table 8.2.1 row applies.
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>t_control (mm)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-orange)' }}>
              {cv.t_control_mm === '미지정' ? '미지정' : `${cv.t_control_mm} mm`}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>y_control (N/mm²)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-blue)' }}>
              {cv.y_control_nmm2 === '미지정' ? '미지정' : cv.y_control_nmm2}
            </div>
          </div>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Table 8.2.1 Row</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent-green)' }}>
              {cv.table_821_row_used === '미지정' ? 'No match' : cv.table_821_row_used}
            </div>
          </div>
        </div>

        {typeof cv.t_control_mm === 'number' && cv.t_control_mm > 100 && (
          <div className="flag-item flag-warning" style={{ marginTop: 12 }}>
            <strong>Special Consideration:</strong> t_control = {cv.t_control_mm} mm exceeds 100 mm.
            Per LR rules, special consideration is required.
          </div>
        )}
      </div>
    </div>
  );
}
