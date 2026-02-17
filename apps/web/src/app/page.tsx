'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  DecisionResults,
  AppliedMeasure,
  MemberInput,
  JointInput,
  DEFAULT_COLORS,
  MEASURE_LABELS,
} from '@/lib/types';
import { SAMPLE_COLORS } from '@/lib/sampleData';
import StepMaterials from '@/components/StepMaterials';
import StepThickness from '@/components/StepThickness';
import StepGlobalMeasures from '@/components/StepGlobalMeasures';
import StepMeasure3Options from '@/components/StepMeasure3Options';
import StepResults from '@/components/StepResults';
import StepExport from '@/components/StepExport';
import Legend from '@/components/Legend';

const STEPS = [
  { id: 1, label: 'Materials' },
  { id: 2, label: 'Thickness' },
  { id: 3, label: 'Global Measures' },
  { id: 4, label: 'Measure 3 Options' },
  { id: 5, label: 'Results & Viz' },
  { id: 6, label: 'Export' },
];

export default function Home() {
  const [step, setStep] = useState(1);
  const [results, setResults] = useState<DecisionResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable state (for stepper steps 1-4)
  const [members, setMembers] = useState<MemberInput[]>([]);
  const [joints, setJoints] = useState<JointInput[]>([]);
  const [measure3Option, setMeasure3Option] = useState('미지정');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/data/decision_results.json');
      if (res.ok) {
        const data: DecisionResults = await res.json();
        setResults(data);
        setError(null);
      } else {
        setError('No decision results found. Run the engine first: python -m services.engine.cli --input inputs/project.json --out outputs/demo');
      }
    } catch (e) {
      setError('Failed to load decision results. Ensure the engine has been run and output copied to apps/web/public/data/.');
    }
    setLoading(false);
  }

  const activeMeasures = results
    ? [...new Set(results.applied_measures.map(am => am.measure_id))].sort()
    : [];

  const [visibleMeasures, setVisibleMeasures] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (results) {
      setVisibleMeasures(new Set(activeMeasures));
    }
  }, [results]);

  const toggleMeasure = useCallback((mid: number) => {
    setVisibleMeasures(prev => {
      const next = new Set(prev);
      if (next.has(mid)) next.delete(mid);
      else next.add(mid);
      return next;
    });
  }, []);

  const filteredMeasures = results?.applied_measures.filter(
    am => visibleMeasures.has(am.measure_id)
  ) ?? [];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, color: 'var(--accent-blue)', marginBottom: 4 }}>
          LR Hatch Coaming Measure Engine
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Brittle fracture prevention Measures 1–5 | Cumulative visualization
          {results && <span> | Project: <strong>{results.project_id}</strong></span>}
        </p>
      </header>

      {/* Stepper */}
      <div className="stepper">
        {STEPS.map(s => (
          <div
            key={s.id}
            className={`stepper-step ${step === s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`}
            onClick={() => setStep(s.id)}
          >
            <span className="step-number">{step > s.id ? '✓' : s.id}</span>
            {s.label}
          </div>
        ))}
      </div>

      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p>Loading decision results...</p>
        </div>
      )}

      {error && (
        <div className="card" style={{ borderLeft: '3px solid var(--accent-orange)' }}>
          <p style={{ color: 'var(--accent-orange)', marginBottom: 8, fontWeight: 600 }}>Data Not Loaded</p>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{error}</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            The app will display demo content once decision_results.json is available.
          </p>
        </div>
      )}

      {results && (
        <>
          {/* Legend (always visible) */}
          <Legend
            activeMeasures={activeMeasures}
            visibleMeasures={visibleMeasures}
            onToggle={toggleMeasure}
            colors={SAMPLE_COLORS}
          />

          {/* Step content */}
          {step === 1 && <StepMaterials results={results} />}
          {step === 2 && <StepThickness results={results} />}
          {step === 3 && <StepGlobalMeasures results={results} colors={SAMPLE_COLORS} />}
          {step === 4 && <StepMeasure3Options results={results} colors={SAMPLE_COLORS} />}
          {step === 5 && (
            <StepResults
              results={results}
              filteredMeasures={filteredMeasures}
              visibleMeasures={visibleMeasures}
              colors={SAMPLE_COLORS}
            />
          )}
          {step === 6 && <StepExport results={results} />}

          {/* Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setStep(Math.max(1, step - 1))}
              disabled={step === 1}
            >
              ← Previous
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep(Math.min(6, step + 1))}
              disabled={step === 6}
            >
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
