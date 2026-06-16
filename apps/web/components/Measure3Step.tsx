'use client';

import type { DecisionResults, Measure3Choice } from '@/lib/types';

const M3_OPTIONS = [
  { value: 'block_shift', label: 'Block Shift (Stagger)', desc: 'Minimum 300mm offset between adjacent butt welds' },
  { value: 'crack_arrest_hole', label: 'Crack Arrest Hole', desc: 'Holes fitted with special fatigue assessment' },
  { value: 'crack_arrest_insert', label: 'Crack Arrest Insert', desc: 'Insert plate or weld metal insert' },
  { value: 'enhanced_NDE', label: 'Enhanced NDE', desc: 'Stricter acceptance criteria, CTOD >= 0.18mm, no EGW' },
  { value: '미지정', label: 'Not Selected (미지정)', desc: 'Measure 3 option pending manual selection' },
];

interface Props {
  measure3Choice: Measure3Choice;
  setMeasure3Choice: (c: Measure3Choice) => void;
  results: DecisionResults | null;
  onNext: () => void;
  onBack: () => void;
}

export default function Measure3Step({ measure3Choice, setMeasure3Choice, results, onNext, onBack }: Props) {
  const isM3Required = results?.required_measures_global.includes(3) ?? false;

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-1">Step 4: Measure 3 Options</h2>
        <p className="text-sm text-slate-400 mb-4">
          {isM3Required
            ? 'Measure 3 is required. Select a crack arrest option and provide parameters.'
            : 'Measure 3 is not required for current inputs. You may still configure for reference.'}
        </p>

        {/* Option cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {M3_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setMeasure3Choice({ ...measure3Choice, option: opt.value })}
              className={`text-left rounded-lg p-4 border transition-all
                ${measure3Choice.option === opt.value
                  ? 'border-red-500 bg-red-500/10 ring-1 ring-red-500/30'
                  : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'}
              `}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-3 h-3 rounded-full border-2 ${
                  measure3Choice.option === opt.value ? 'border-red-500 bg-red-500' : 'border-slate-500'
                }`} />
                <span className="text-sm font-medium text-white">{opt.label}</span>
              </div>
              <p className="text-xs text-slate-400 ml-5">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Parameters */}
        {measure3Choice.option === 'block_shift' && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Block Shift Parameters</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Offset (mm):</label>
              <input
                type="number"
                value={typeof measure3Choice.parameters.block_shift_offset_mm === 'number'
                  ? measure3Choice.parameters.block_shift_offset_mm : ''}
                placeholder="미지정"
                onChange={(e) => setMeasure3Choice({
                  ...measure3Choice,
                  parameters: { ...measure3Choice.parameters, block_shift_offset_mm: Number(e.target.value) || '미지정' },
                })}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-32"
              />
              <span className="text-xs text-slate-500">(min 300mm required)</span>
            </div>
          </div>
        )}

        {measure3Choice.option === 'crack_arrest_hole' && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Crack Arrest Hole Parameters</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Hole Diameter (mm):</label>
              <input
                type="number"
                value={typeof measure3Choice.parameters.hole_diameter_mm === 'number'
                  ? measure3Choice.parameters.hole_diameter_mm : ''}
                placeholder="미지정"
                onChange={(e) => setMeasure3Choice({
                  ...measure3Choice,
                  parameters: { ...measure3Choice.parameters, hole_diameter_mm: Number(e.target.value) || '미지정' },
                })}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-32"
              />
            </div>
          </div>
        )}

        {measure3Choice.option === 'enhanced_NDE' && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600 space-y-3">
            <h3 className="text-sm font-medium text-slate-300 mb-2">Enhanced NDE Parameters</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">NDE Method:</label>
              <select
                value={String(measure3Choice.parameters.enhanced_nde_method || '미지정')}
                onChange={(e) => setMeasure3Choice({
                  ...measure3Choice,
                  parameters: { ...measure3Choice.parameters, enhanced_nde_method: e.target.value },
                })}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
              >
                <option value="미지정">미지정</option>
                <option value="UT">UT</option>
                <option value="PAUT">PAUT</option>
                <option value="TOFD">TOFD</option>
                <option value="RT">RT</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Acceptance Criteria Ref:</label>
              <input
                type="text"
                value={String(measure3Choice.parameters.enhanced_nde_acceptance_criteria_ref || '')}
                placeholder="미지정 (ShipRight ref)"
                onChange={(e) => setMeasure3Choice({
                  ...measure3Choice,
                  parameters: { ...measure3Choice.parameters, enhanced_nde_acceptance_criteria_ref: e.target.value || '미지정' },
                })}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm flex-1"
              />
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded px-3 py-2 text-xs text-amber-300">
              CTOD &ge; 0.18 mm required &middot; EGW not permitted &middot; Stricter acceptance criteria per ShipRight
            </div>
          </div>
        )}

        {measure3Choice.option === 'crack_arrest_insert' && (
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Crack Arrest Insert Parameters</h3>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400">Insert Type:</label>
              <input
                type="text"
                value={String(measure3Choice.parameters.insert_type || '')}
                placeholder="e.g. SUF"
                onChange={(e) => setMeasure3Choice({
                  ...measure3Choice,
                  parameters: { ...measure3Choice.parameters, insert_type: e.target.value || '미지정' },
                })}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-40"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack}
          className="text-slate-400 hover:text-white px-4 py-2 transition">Back</button>
        <button onClick={onNext}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">
          Next: View Results
        </button>
      </div>
    </div>
  );
}
