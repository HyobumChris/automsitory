'use client';

import type { MemberInput } from '@/lib/types';

interface Props {
  members: MemberInput[];
  setMembers: (m: MemberInput[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ThicknessStep({ members, setMembers, onNext, onBack }: Props) {
  const updateThickness = (idx: number, value: string) => {
    const updated = [...members];
    const num = Number(value);
    updated[idx] = { ...updated[idx], thickness_mm_as_built: isNaN(num) ? value : num };
    setMembers(updated);
  };

  const sideMembers = members.filter(m => m.member_role === 'hatch_coaming_side_plate');
  const topMembers = members.filter(m => m.member_role === 'hatch_coaming_top_plate');
  const sideT = sideMembers[0]?.thickness_mm_as_built;
  const topT = topMembers[0]?.thickness_mm_as_built;
  const sideN = typeof sideT === 'number' ? sideT : null;
  const topN = typeof topT === 'number' ? topT : null;
  const tControl = sideN !== null && topN !== null ? Math.max(sideN, topN) : '미지정';

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-1">Step 2: Thickness Input</h2>
        <p className="text-sm text-slate-400 mb-4">Enter as-built thickness for each member. Control thickness is derived from max(side, top).</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            {members.map((m, idx) => (
              <div key={m.member_id} className="flex items-center gap-3">
                <span className="font-mono text-blue-400 text-sm w-10">{m.member_id}</span>
                <span className="text-slate-400 text-sm flex-1 truncate">
                  {m.member_role.replace(/_/g, ' ')}
                </span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={typeof m.thickness_mm_as_built === 'number' ? m.thickness_mm_as_built : ''}
                    placeholder="미지정"
                    onChange={(e) => updateThickness(idx, e.target.value)}
                    className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-24 text-right"
                  />
                  <span className="text-slate-500 text-xs">mm</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Control Values (Derived)</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Side thickness:</span>
                <span className="text-white font-mono">{sideT !== undefined ? `${sideT} mm` : '미지정'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Top thickness:</span>
                <span className="text-white font-mono">{topT !== undefined ? `${topT} mm` : '미지정'}</span>
              </div>
              <div className="border-t border-slate-600 pt-2 flex justify-between">
                <span className="text-slate-300 font-medium">t_control:</span>
                <span className="text-yellow-400 font-mono font-bold">
                  {tControl !== '미지정' ? `${tControl} mm` : '미지정'}
                </span>
              </div>
              {typeof tControl === 'number' && tControl > 100 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded px-3 py-2 mt-2">
                  <span className="text-amber-400 text-xs font-medium">
                    Special consideration required (t &gt; 100 mm)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button onClick={onBack}
          className="text-slate-400 hover:text-white px-4 py-2 transition">
          Back
        </button>
        <button onClick={onNext}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">
          Next: Determine Measures
        </button>
      </div>
    </div>
  );
}
