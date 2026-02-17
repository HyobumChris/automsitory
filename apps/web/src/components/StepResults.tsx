'use client';

import { DecisionResults, AppliedMeasure, ColorsConfig, DEFAULT_COLORS, MEASURE_LABELS } from '@/lib/types';

interface Props {
  results: DecisionResults;
  filteredMeasures: AppliedMeasure[];
  visibleMeasures: Set<number>;
  colors: ColorsConfig;
}

export default function StepResults({ results, filteredMeasures, visibleMeasures, colors }: Props) {
  const memberMeasures = filteredMeasures.filter(am => am.target_type === 'member');
  const jointMeasures = filteredMeasures.filter(am => am.target_type === 'joint');

  // Group by target
  const memberGroups: Record<string, AppliedMeasure[]> = {};
  memberMeasures.forEach(am => {
    if (!memberGroups[am.target_id]) memberGroups[am.target_id] = [];
    memberGroups[am.target_id].push(am);
  });

  const jointGroups: Record<string, AppliedMeasure[]> = {};
  jointMeasures.forEach(am => {
    if (!jointGroups[am.target_id]) jointGroups[am.target_id] = [];
    jointGroups[am.target_id].push(am);
  });

  const flags = results.manual_review_flags;

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="card" style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Applied</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-green)' }}>
            {results.applied_measures.length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Members</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-blue)' }}>
            {Object.keys(memberGroups).length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Joints</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent-purple)' }}>
            {Object.keys(jointGroups).length}
          </div>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 150 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Review Flags</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: flags.length > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
            {flags.length}
          </div>
        </div>
      </div>

      {/* Members Table */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Member Targets (Plates / Structural Members)
        </h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Measures (Cumulative)</th>
                <th>Status</th>
                <th>Requirements</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(memberGroups).map(([tid, ams]) => (
                <tr key={tid}>
                  <td style={{ fontWeight: 600 }}>{tid}</td>
                  <td>
                    {ams.map(am => {
                      const color = colors.measures[String(am.measure_id)]?.hex || DEFAULT_COLORS[am.measure_id];
                      return (
                        <span key={am.measure_id} className="measure-tag" style={{ background: `${color}30` }}>
                          <span className="dot" style={{ background: color }}></span>
                          M{am.measure_id}
                        </span>
                      );
                    })}
                  </td>
                  <td>
                    {ams.map(am => (
                      <span key={am.measure_id} className={`badge badge-${am.status === 'applied' ? 'applied' : am.status === 'conditional' ? 'conditional' : 'pending'}`}
                            style={{ marginRight: 4 }}>
                        {am.status}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {ams.flatMap(am => am.requirements).map((r, i) => (
                      <div key={i} style={{ padding: '1px 0' }}>{r}</div>
                    ))}
                  </td>
                </tr>
              ))}
              {Object.keys(memberGroups).length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No visible member measures
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Joints Table */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--accent-purple)', marginBottom: 12 }}>
          Joint Targets (Welds / Connections)
        </h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Joint ID</th>
                <th>Measures (Cumulative)</th>
                <th>Status</th>
                <th>Requirements</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(jointGroups).map(([tid, ams]) => (
                <tr key={tid}>
                  <td style={{ fontWeight: 600 }}>{tid}</td>
                  <td>
                    {ams.map(am => {
                      const color = colors.measures[String(am.measure_id)]?.hex || DEFAULT_COLORS[am.measure_id];
                      return (
                        <span key={am.measure_id} className="measure-tag" style={{ background: `${color}30` }}>
                          <span className="dot" style={{ background: color }}></span>
                          M{am.measure_id}
                        </span>
                      );
                    })}
                  </td>
                  <td>
                    {ams.map(am => (
                      <span key={am.measure_id} className={`badge badge-${am.status === 'applied' ? 'applied' : am.status === 'conditional' ? 'conditional' : 'pending'}`}
                            style={{ marginRight: 4 }}>
                        {am.status}
                      </span>
                    ))}
                  </td>
                  <td style={{ fontSize: 11 }}>
                    {ams.flatMap(am => am.requirements).map((r, i) => (
                      <div key={i} style={{ padding: '1px 0' }}>{r}</div>
                    ))}
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--accent-orange)' }}>
                    {ams.flatMap(am => am.notes).filter(Boolean).join('; ') || '—'}
                  </td>
                </tr>
              ))}
              {Object.keys(jointGroups).length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No visible joint measures
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Review Flags */}
      {flags.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 14, color: 'var(--accent-orange)', marginBottom: 12 }}>
            Manual Review Flags ({flags.length})
          </h3>
          {flags.map((f, i) => (
            <div key={i} className={`flag-item flag-${f.severity || 'warning'}`}>
              <strong>[{f.flag_id}]</strong>{' '}
              {f.target_id !== '미지정' && <span style={{ color: 'var(--accent-blue)' }}>({f.target_id}) </span>}
              {f.description}
            </div>
          ))}
        </div>
      )}

      {/* 2D Diagrams (embedded SVG) */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--accent-blue)', marginBottom: 12 }}>
          2D Diagrams
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          SVG diagrams are generated by the engine. View them in the output directory
          or use the 3D viewer for interactive exploration.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 300 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Plan View</h4>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              background: 'white',
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <object data="/data/hatch_plan.svg" type="image/svg+xml"
                      style={{ maxWidth: '100%', maxHeight: 300 }}>
                <p style={{ color: '#666', fontSize: 12 }}>Plan SVG not available</p>
              </object>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Section View</h4>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 16,
              background: 'white',
              minHeight: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <object data="/data/hatch_section.svg" type="image/svg+xml"
                      style={{ maxWidth: '100%', maxHeight: 300 }}>
                <p style={{ color: '#666', fontSize: 12 }}>Section SVG not available</p>
              </object>
            </div>
          </div>
        </div>
      </div>

      {/* 3D Viewer Link */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--accent-blue)', marginBottom: 12 }}>
          3D Interactive Viewer
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Open the standalone Three.js viewer for interactive 3D exploration with
          measure layer toggling and click-to-inspect functionality.
        </p>
        <a href="/data/viewer.html" target="_blank" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          Open 3D Viewer →
        </a>
      </div>
    </div>
  );
}
