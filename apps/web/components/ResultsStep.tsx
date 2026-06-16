'use client';

import { useState } from 'react';
import type { DecisionResults, MemberInput, JointInput, TargetResult } from '@/lib/types';
import { MEASURE_COLORS } from '@/lib/types';

interface Props {
  results: DecisionResults | null;
  members: MemberInput[];
  joints: JointInput[];
  loading: boolean;
}

function MeasureBadge({ mid, status }: { mid: number; status: string }) {
  const c = MEASURE_COLORS[mid] || MEASURE_COLORS[0];
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${c.hex}20`, color: c.hex, border: `1px solid ${c.hex}40` }}
    >
      M{mid}
      {status !== 'applied' && (
        <span className="opacity-60">({status})</span>
      )}
    </span>
  );
}

function TargetCard({ tr }: { tr: TargetResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700/30 transition"
      >
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
            tr.target_type === 'member' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
          }`}>
            {tr.target_type}
          </span>
          <span className="font-mono text-white text-sm">{tr.target_id}</span>
          <div className="flex gap-1 flex-wrap">
            {tr.applied_measures.map(am => (
              <MeasureBadge key={am.measure_id} mid={am.measure_id} status={am.status} />
            ))}
          </div>
        </div>
        <span className="text-slate-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50">
          {tr.applied_measures.map(am => (
            <div key={am.measure_id} className="mt-3">
              <div className="flex items-center gap-2 mb-1">
                <MeasureBadge mid={am.measure_id} status={am.status} />
                <span className="text-xs text-slate-400">{MEASURE_COLORS[am.measure_id]?.label}</span>
              </div>
              {am.requirements.map((req, i) => (
                <div key={i} className="ml-4 text-xs text-slate-300 mb-1">
                  <span className="text-slate-500 mr-1">&bull;</span>
                  {req.description}
                  {req.rule_ref !== '미지정' && (
                    <span className="text-slate-500 ml-1">[{req.rule_ref}]</span>
                  )}
                </div>
              ))}
              {am.notes.length > 0 && (
                <div className="ml-4 mt-1">
                  {am.notes.map((n, i) => (
                    <div key={i} className="text-xs text-slate-400 italic">&rarr; {n}</div>
                  ))}
                </div>
              )}
              {am.condition_expr && (
                <div className="ml-4 text-[10px] text-slate-500 mt-1 font-mono">
                  Condition: {am.condition_expr}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResultsStep({ results, members, joints, loading }: Props) {
  const [tab, setTab] = useState<'summary' | 'members' | 'joints' | 'flags'>('summary');

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3" />
        <span className="text-blue-400">Computing results...</span>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="text-center py-20 text-slate-500">
        No results available. Complete previous steps or load a results JSON file.
      </div>
    );
  }

  const memberEntries = Object.entries(results.member_results).sort();
  const jointEntries = Object.entries(results.joint_results).sort();

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 bg-[#1e293b] rounded-lg p-1 border border-slate-700 w-fit">
        {(['summary', 'members', 'joints', 'flags'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              tab === t ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}>
            {t === 'summary' ? 'Summary' : t === 'members' ? `Members (${memberEntries.length})` :
             t === 'joints' ? `Joints (${jointEntries.length})` : `Flags (${results.manual_review_flags.length})`}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {tab === 'summary' && (
        <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700 space-y-4">
          <h2 className="text-lg font-semibold text-white">Step 5: Results Summary</h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">t_control</div>
              <div className="text-xl font-bold text-white font-mono">{results.control_values.t_control}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">y_control</div>
              <div className="text-xl font-bold text-white font-mono">{results.control_values.y_control}</div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">Measures Required</div>
              <div className="text-xl font-bold text-white font-mono">
                {results.required_measures_global.length > 0 ? results.required_measures_global.join(', ') : 'None'}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <div className="text-xs text-slate-400">Special Consideration</div>
              <div className={`text-xl font-bold ${results.special_consideration ? 'text-amber-400' : 'text-green-400'}`}>
                {results.special_consideration ? 'YES' : 'No'}
              </div>
            </div>
          </div>

          {/* Cumulative flow */}
          <div className="bg-slate-800/30 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Applied Measures (Cumulative)</h3>
            <div className="flex flex-wrap gap-2">
              {results.required_measures_global.map(mid => {
                const c = MEASURE_COLORS[mid];
                return (
                  <div key={mid} className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                    style={{ backgroundColor: `${c?.hex}15`, border: `1px solid ${c?.hex}40` }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c?.hex }} />
                    <span className="text-xs text-white font-medium">{c?.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {results.noncompliance_flags.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-400 mb-2">Noncompliance Flags</h3>
              {results.noncompliance_flags.map((f, i) => (
                <div key={i} className="text-xs text-red-300 flex gap-2 mb-1">
                  <span className="text-red-500 font-bold">!!</span> {f}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-2">
          {memberEntries.length === 0 ? (
            <div className="text-slate-500 text-center py-10">No member-level measures applied.</div>
          ) : (
            memberEntries.map(([id, tr]) => <TargetCard key={id} tr={tr} />)
          )}
        </div>
      )}

      {/* Joints tab */}
      {tab === 'joints' && (
        <div className="space-y-2">
          {jointEntries.length === 0 ? (
            <div className="text-slate-500 text-center py-10">No joint-level measures applied.</div>
          ) : (
            jointEntries.map(([id, tr]) => <TargetCard key={id} tr={tr} />)
          )}
        </div>
      )}

      {/* Flags tab */}
      {tab === 'flags' && (
        <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700 space-y-3">
          <h3 className="text-sm font-medium text-amber-400">Manual Review Flags ({results.manual_review_flags.length})</h3>
          {results.manual_review_flags.map((f, i) => (
            <div key={i} className="text-xs text-amber-300/80 flex gap-2 bg-amber-500/5 rounded px-3 py-2">
              <span className="text-amber-500 font-bold">{i + 1}.</span> {f}
            </div>
          ))}
          {results.noncompliance_flags.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-red-400 mt-4">Noncompliance Flags ({results.noncompliance_flags.length})</h3>
              {results.noncompliance_flags.map((f, i) => (
                <div key={i} className="text-xs text-red-300 flex gap-2 bg-red-500/5 rounded px-3 py-2">
                  <span className="text-red-500 font-bold">!!</span> {f}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
