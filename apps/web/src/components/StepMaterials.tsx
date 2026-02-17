'use client';

import { DecisionResults } from '@/lib/types';

interface Props {
  results: DecisionResults;
}

export default function StepMaterials({ results }: Props) {
  const summary = results.summary;
  const memberMeasures = summary.member_applied_measures || {};
  const yControl = results.control_values.y_control_nmm2;

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Step 1: Material Selection (Grade / Yield Strength)
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Review the yield strength and grade of each structural member. The controlling
          yield strength (y_control) is derived as max(side, top) for hatch coaming plates.
        </p>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>y_control (N/mm²)</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-orange)' }}>
              {yControl === '미지정' ? '미지정' : yControl}
            </div>
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Role</th>
                <th>Zone</th>
                <th>Yield (N/mm²)</th>
                <th>Grade</th>
                <th>Applied Measures</th>
              </tr>
            </thead>
            <tbody>
              {/* Extract member info from applied measures */}
              {Object.entries(memberMeasures).map(([mid, mids]) => {
                const measures = results.applied_measures.filter(
                  am => am.target_id === mid && am.target_type === 'member'
                );
                return (
                  <tr key={mid}>
                    <td style={{ fontWeight: 600 }}>{mid}</td>
                    <td>{measures[0]?.condition_expr?.split('role=')[1]?.split(' ')[0] || '—'}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>{(mids as number[]).map(m => `M${m}`).join(', ')}</td>
                  </tr>
                );
              })}
              {Object.keys(memberMeasures).length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No member data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
