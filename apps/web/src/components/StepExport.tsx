'use client';

import { DecisionResults } from '@/lib/types';

interface Props {
  results: DecisionResults;
}

export default function StepExport({ results }: Props) {

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decision_results_${results.project_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const summary = results.summary;

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Step 6: Export & Summary
        </h2>

        {/* Summary table */}
        <div className="card" style={{ background: 'var(--bg-secondary)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Summary Report</h3>
          <table>
            <tbody>
              <tr>
                <td style={{ color: 'var(--text-muted)', width: 200 }}>Project ID</td>
                <td style={{ fontWeight: 600 }}>{results.project_id}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>t_control (mm)</td>
                <td>{summary.t_control_mm}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>y_control (N/mm²)</td>
                <td>{summary.y_control_nmm2}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>Table 8.2.1 Row</td>
                <td>{summary.table_821_row}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>Required Measures (Global)</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--accent-green)' }}>
                  [{(summary.required_measures_global || []).join(', ')}]
                </td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>Total Applied Measures</td>
                <td>{summary.total_applied}</td>
              </tr>
              <tr>
                <td style={{ color: 'var(--text-muted)' }}>Manual Review Flags</td>
                <td style={{ color: summary.manual_review_count > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                  {summary.manual_review_count}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={downloadJSON}>
            Download decision_results.json
          </button>
          <a href="/data/hatch_plan.svg" download className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Download Plan SVG
          </a>
          <a href="/data/hatch_section.svg" download className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Download Section SVG
          </a>
          <a href="/data/hatch_coaming.glb" download className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Download 3D Model (.glb)
          </a>
          <a href="/data/viewer.html" target="_blank" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            Open 3D Viewer
          </a>
        </div>

        {/* File listing */}
        <div style={{ marginTop: 20, fontSize: 12, color: 'var(--text-muted)' }}>
          <h4 style={{ marginBottom: 8 }}>Generated Files:</h4>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            <li>📄 decision_results.json – Full decision audit trail</li>
            <li>📄 rules_extraction.json – Extracted rules database</li>
            <li>🖼️ hatch_plan.svg – 2D Plan view diagram</li>
            <li>🖼️ hatch_section.svg – 2D Section view diagram</li>
            <li>🧊 hatch_coaming.glb – 3D model</li>
            <li>🌐 viewer.html – Interactive 3D viewer</li>
            <li>📁 evidence/ocr_snippets/ – OCR evidence snippets</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
