'use client';

import type { DecisionResults, MemberInput, JointInput, Measure3Choice } from '@/lib/types';

interface Props {
  results: DecisionResults | null;
  members: MemberInput[];
  joints: JointInput[];
  measure3Choice: Measure3Choice;
}

export default function ExportStep({ results, members, joints, measure3Choice }: Props) {
  const downloadJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportProjectInput = () => {
    const project = {
      project_meta: {
        project_id: results?.project_id || 'WEB-EXPORT',
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
        output_dir: 'outputs/export',
        hatch_opening_bbox: { L: 10000, B: 8000, H: 2000 },
      },
    };
    downloadJson(project, 'project_input.json');
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-1">Step 6: Export</h2>
        <p className="text-sm text-slate-400 mb-6">
          Download results and input files. Use the CLI for full 2D/3D generation.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Decision Results */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h3 className="text-sm font-medium text-white mb-2">Decision Results</h3>
            <p className="text-xs text-slate-400 mb-3">
              Complete measure determination results with evidence and flags.
            </p>
            <button
              onClick={() => results && downloadJson(results, 'decision_results.json')}
              disabled={!results}
              className="bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:cursor-not-allowed
                text-white px-4 py-2 rounded-lg text-sm font-medium transition w-full"
            >
              Download decision_results.json
            </button>
          </div>

          {/* Project Input */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700">
            <h3 className="text-sm font-medium text-white mb-2">Project Input</h3>
            <p className="text-xs text-slate-400 mb-3">
              Export current configuration as CLI-compatible input JSON.
            </p>
            <button
              onClick={exportProjectInput}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition w-full"
            >
              Download project_input.json
            </button>
          </div>
        </div>

        {/* CLI instructions */}
        <div className="bg-slate-800/30 rounded-lg p-4 mt-4 border border-slate-700">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Generate 2D/3D Outputs via CLI</h3>
          <div className="bg-slate-900 rounded p-3 font-mono text-xs text-green-400">
            <div className="text-slate-500"># Run from project root:</div>
            <div>python3 -m services.engine.cli --input project_input.json --out outputs/export</div>
            <div className="text-slate-500 mt-2"># This generates:</div>
            <div className="text-slate-400">#   outputs/export/decision_results.json</div>
            <div className="text-slate-400">#   outputs/export/hatch_plan.svg/png</div>
            <div className="text-slate-400">#   outputs/export/hatch_section.svg/png</div>
            <div className="text-slate-400">#   outputs/export/hatch_coaming.glb</div>
            <div className="text-slate-400">#   outputs/export/viewer.html</div>
            <div className="text-slate-400">#   outputs/export/rules_extraction.json</div>
          </div>
        </div>
      </div>
    </div>
  );
}
