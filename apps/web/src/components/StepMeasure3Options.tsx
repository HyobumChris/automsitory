'use client';

import { DecisionResults, ColorsConfig, AppliedMeasure, DEFAULT_COLORS } from '@/lib/types';

interface Props {
  results: DecisionResults;
  colors: ColorsConfig;
}

export default function StepMeasure3Options({ results, colors }: Props) {
  const m3measures = results.applied_measures.filter(am => am.measure_id === 3);
  const m3Members = m3measures.filter(am => am.target_type === 'member');
  const m3Joints = m3measures.filter(am => am.target_type === 'joint');

  const m3Color = colors.measures['3']?.hex || DEFAULT_COLORS[3];

  return (
    <div>
      <div className="card">
        <h2 style={{ fontSize: 16, color: 'var(--accent-blue)', marginBottom: 12 }}>
          Step 4: Measure 3 – Crack Arrest Options
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
          Measure 3 involves one of four options: block shift (≥300mm offset),
          crack arrest hole, crack arrest insert, or enhanced NDE.
          Additionally, BCA steel may be required for hatch coaming side plate (always if M3 is required).
        </p>

        {m3Members.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: m3Color, marginBottom: 8 }}>
              BCA Steel (Member Targets)
            </h3>
            {m3Members.map(am => (
              <div key={am.target_id} className="card" style={{ borderLeft: `3px solid ${m3Color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{am.target_id}</strong>
                  <span className={`badge badge-${am.status === 'applied' ? 'applied' : 'pending'}`}>
                    {am.status}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, fontSize: 12 }}>
                  {am.requirements.map((r, i) => (
                    <li key={i} style={{ padding: '2px 0', borderLeft: '2px solid var(--border)', paddingLeft: 8, margin: '2px 0' }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {m3Joints.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, color: m3Color, marginBottom: 8 }}>
              Option-Specific (Joint Targets)
            </h3>
            {m3Joints.map(am => (
              <div key={am.target_id} className="card" style={{ borderLeft: `3px solid ${m3Color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <strong>{am.target_id}</strong>
                  <span className={`badge badge-${am.status === 'applied' ? 'applied' : am.status === 'conditional' ? 'conditional' : 'pending'}`}>
                    {am.status}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', padding: 0, fontSize: 12 }}>
                  {am.requirements.map((r, i) => (
                    <li key={i} style={{ padding: '2px 0', borderLeft: '2px solid var(--border)', paddingLeft: 8, margin: '2px 0' }}>
                      {r}
                    </li>
                  ))}
                </ul>
                {am.notes.length > 0 && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--accent-orange)' }}>
                    Notes: {am.notes.join('; ')}
                  </div>
                )}
                {am.rule_ref !== '미지정' && (
                  <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                    Rule ref: {String(am.rule_ref).substring(0, 150)}...
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {m3measures.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
            Measure 3 is not required for this configuration.
          </div>
        )}
      </div>
    </div>
  );
}
