'use client';

import type { DecisionResults } from '@/lib/types';
import { MEASURE_COLORS } from '@/lib/types';

interface Props {
  results: DecisionResults | null;
  loading: boolean;
  onNext: () => void;
  onBack: () => void;
}

export default function MeasuresGlobalStep({ results, loading, onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-1">Step 3: Required Measures (Global)</h2>
        <p className="text-sm text-slate-400 mb-4">
          Based on Table 8.2.1 lookup with derived control values.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-blue-400 py-8 justify-center">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Running decision engine...
          </div>
        )}

        {!loading && results && (
          <div className="space-y-4">
            {/* Control values */}
            <div className="bg-slate-800/50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-slate-400 block">t_control</span>
                <span className="text-white font-mono font-bold">{results.control_values.t_control}</span>
              </div>
              <div>
                <span className="text-slate-400 block">y_control</span>
                <span className="text-white font-mono font-bold">{results.control_values.y_control}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Table Row</span>
                <span className="text-white font-mono text-xs">
                  {results.table_821_row_used
                    ? `${results.table_821_row_used.yield_strength_nmm2} / ${results.table_821_row_used.thickness_range}`
                    : 'No match'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Special</span>
                <span className={results.special_consideration ? 'text-amber-400 font-bold' : 'text-green-400'}>
                  {results.special_consideration ? 'YES' : 'No'}
                </span>
              </div>
            </div>

            {/* Measure badges */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-slate-300">Required Measures:</h3>
              {results.required_measures_global.length === 0 ? (
                <div className="text-slate-500 text-sm py-4 text-center">
                  No measures required by Table 8.2.1 for current inputs.
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {results.required_measures_global.map(mid => {
                    const c = MEASURE_COLORS[mid];
                    return (
                      <div key={mid}
                        className="flex items-center gap-2 rounded-lg px-4 py-2 border"
                        style={{
                          borderColor: c?.hex || '#666',
                          backgroundColor: `${c?.hex || '#666'}15`,
                        }}>
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: c?.hex }} />
                        <span className="text-sm font-medium text-white">M{mid}</span>
                        <span className="text-xs text-slate-400">{c?.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cumulative set visualization */}
            <div className="bg-slate-800/30 rounded-lg p-4">
              <h3 className="text-xs font-medium text-slate-400 mb-2">Cumulative Application Preview</h3>
              <div className="flex items-center gap-2 flex-wrap text-sm">
                <span className="text-slate-500">set: [ ]</span>
                {results.required_measures_global.map((mid, i) => (
                  <span key={mid} className="flex items-center gap-1">
                    <span className="text-slate-500">&rarr;</span>
                    <span className="font-mono" style={{ color: MEASURE_COLORS[mid]?.hex }}>
                      [{results.required_measures_global.slice(0, i + 1).join(', ')}]
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* Manual review flags */}
            {results.manual_review_flags.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                <h3 className="text-sm font-medium text-amber-400 mb-2">Manual Review Flags</h3>
                <ul className="space-y-1">
                  {results.manual_review_flags.map((flag, i) => (
                    <li key={i} className="text-xs text-amber-300/80 flex gap-2">
                      <span className="text-amber-500">!</span>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack}
          className="text-slate-400 hover:text-white px-4 py-2 transition">Back</button>
        <button onClick={onNext}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">
          Next: Measure 3 Options
        </button>
      </div>
    </div>
  );
}
