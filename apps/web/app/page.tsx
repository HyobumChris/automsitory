'use client';

import { useState, useCallback, useEffect } from 'react';
import type { DecisionResults, ProjectInput, MemberInput, JointInput, Measure3Choice } from '@/lib/types';
import { STEPS, MEASURE_COLORS } from '@/lib/types';
import Stepper from '@/components/Stepper';
import MaterialStep from '@/components/MaterialStep';
import ThicknessStep from '@/components/ThicknessStep';
import MeasuresGlobalStep from '@/components/MeasuresGlobalStep';
import Measure3Step from '@/components/Measure3Step';
import ResultsStep from '@/components/ResultsStep';
import ExportStep from '@/components/ExportStep';

const DEFAULT_MEMBERS: MemberInput[] = [
  { member_id: 'M01', member_role: 'upper_deck_plate', zone: 'cargo_hold_region', yield_strength_nmm2: 390, grade: 'DH40', thickness_mm_as_built: 90, geometry_ref: 'upper_deck' },
  { member_id: 'M02', member_role: 'hatch_coaming_side_plate', zone: 'cargo_hold_region', yield_strength_nmm2: 390, grade: 'DH40', thickness_mm_as_built: 92, geometry_ref: 'coaming_side' },
  { member_id: 'M03', member_role: 'hatch_coaming_top_plate', zone: 'cargo_hold_region', yield_strength_nmm2: 390, grade: 'DH40', thickness_mm_as_built: 88, geometry_ref: 'coaming_top' },
];

const DEFAULT_JOINTS: JointInput[] = [
  { joint_id: 'J01', joint_type: 'block_to_block_butt', zone: 'cargo_hold_region', connected_members: ['M01', 'M02'], weld_process: 'FCAW', geom: { type: '미지정', data: '미지정' }, related_joint_ids: ['J03'], notes: '미지정' },
  { joint_id: 'J02', joint_type: 'coaming_to_deck_connection', zone: 'cargo_hold_region', connected_members: ['M01', 'M02'], weld_process: 'FCAW', geom: { type: '미지정', data: '미지정' }, related_joint_ids: [], notes: '미지정' },
  { joint_id: 'J03', joint_type: 'block_to_block_butt', zone: 'cargo_hold_region', connected_members: ['M02', 'M03'], weld_process: 'FCAW', geom: { type: '미지정', data: '미지정' }, related_joint_ids: ['J01'], notes: '미지정' },
];

export default function Home() {
  const [currentStep, setCurrentStep] = useState(0);
  const [members, setMembers] = useState<MemberInput[]>(DEFAULT_MEMBERS);
  const [joints, setJoints] = useState<JointInput[]>(DEFAULT_JOINTS);
  const [measure3Choice, setMeasure3Choice] = useState<Measure3Choice>({
    option: '미지정',
    parameters: {},
  });
  const [results, setResults] = useState<DecisionResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedFromFile, setLoadedFromFile] = useState(false);

  const runEngine = useCallback(async () => {
    setLoading(true);
    try {
      const projectInput: ProjectInput = {
        project_meta: {
          project_id: 'WEB-SESSION',
          vessel_name: '미지정',
          date_local: new Date().toISOString().split('T')[0],
          timezone: 'Asia/Seoul',
          allow_web_fetch: false,
        },
        sources: { scanned_rule_files: [], diagram_files: [], optional_shipright_files: [] },
        members,
        joints,
        measure3_choice: measure3Choice,
        visualization_inputs: {
          output_dir: 'outputs/web',
          hatch_opening_bbox: { L: 10000, B: 8000, H: 2000 },
        },
      };

      const resp = await fetch('/api/engine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectInput),
      });

      if (resp.ok) {
        const data = await resp.json();
        setResults(data);
      }
    } catch (err) {
      console.error('Engine error:', err);
    }
    setLoading(false);
  }, [members, joints, measure3Choice]);

  const handleLoadResults = useCallback((data: DecisionResults) => {
    setResults(data);
    setLoadedFromFile(true);
    setCurrentStep(4);
  }, []);

  useEffect(() => {
    if (currentStep >= 2 && !loadedFromFile) {
      runEngine();
    }
  }, [currentStep, members, joints, measure3Choice, runEngine, loadedFromFile]);

  return (
    <main className="min-h-screen bg-[#0f172a]">
      {/* Header */}
      <header className="border-b border-slate-700 bg-[#1e293b]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">
              LR Hatch Coaming – Brittle Fracture Measure Viewer
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              LR Pt4 Ch8 2.3 &middot; Tables 8.2.1 / 8.2.2 &middot; Measure 1–5 Auto-Determination
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/fine-draft"
              className="text-xs text-cyan-300 border border-cyan-400/40 rounded-lg px-3 py-2 hover:bg-cyan-400/10 transition"
            >
              과속과징금 Draft 앱
            </a>
            <label className="flex items-center gap-2 cursor-pointer bg-slate-700/50 rounded-lg px-3 py-2 hover:bg-slate-700 transition">
              <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-xs text-slate-300">Load Results JSON</span>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const data = JSON.parse(ev.target?.result as string);
                        handleLoadResults(data);
                      } catch {}
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </label>
          </div>
        </div>
      </header>

      {/* Stepper */}
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <Stepper steps={[...STEPS]} currentStep={currentStep} onStepClick={setCurrentStep} />
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {currentStep === 0 && (
          <MaterialStep members={members} setMembers={setMembers} onNext={() => setCurrentStep(1)} />
        )}
        {currentStep === 1 && (
          <ThicknessStep members={members} setMembers={setMembers} onNext={() => setCurrentStep(2)} onBack={() => setCurrentStep(0)} />
        )}
        {currentStep === 2 && (
          <MeasuresGlobalStep results={results} loading={loading} onNext={() => setCurrentStep(3)} onBack={() => setCurrentStep(1)} />
        )}
        {currentStep === 3 && (
          <Measure3Step
            measure3Choice={measure3Choice}
            setMeasure3Choice={setMeasure3Choice}
            results={results}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && (
          <ResultsStep results={results} members={members} joints={joints} loading={loading} />
        )}
        {currentStep === 5 && (
          <ExportStep results={results} members={members} joints={joints} measure3Choice={measure3Choice} />
        )}
      </div>
    </main>
  );
}
