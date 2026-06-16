'use client';

import type { MemberInput } from '@/lib/types';

const ROLES = [
  { value: 'upper_deck_plate', label: 'Upper Deck Plate' },
  { value: 'hatch_coaming_side_plate', label: 'Hatch Coaming Side Plate' },
  { value: 'hatch_coaming_top_plate', label: 'Hatch Coaming Top Plate' },
  { value: 'attached_longitudinal', label: 'Attached Longitudinal' },
  { value: 'other', label: 'Other' },
];

const YIELDS = [355, 390, 460];

interface Props {
  members: MemberInput[];
  setMembers: (m: MemberInput[]) => void;
  onNext: () => void;
}

export default function MaterialStep({ members, setMembers, onNext }: Props) {
  const updateMember = (idx: number, field: keyof MemberInput, value: unknown) => {
    const updated = [...members];
    updated[idx] = { ...updated[idx], [field]: value };
    setMembers(updated);
  };

  const addMember = () => {
    const id = `M${String(members.length + 1).padStart(2, '0')}`;
    setMembers([...members, {
      member_id: id, member_role: 'other', zone: 'cargo_hold_region',
      yield_strength_nmm2: '미지정', grade: '미지정', thickness_mm_as_built: '미지정',
      geometry_ref: '미지정',
    }]);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#1e293b] rounded-xl p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-1">Step 1: Material Selection</h2>
        <p className="text-sm text-slate-400 mb-4">Define structural members with their roles, grades, and yield strengths.</p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-slate-700">
                <th className="text-left py-2 px-2">ID</th>
                <th className="text-left py-2 px-2">Role</th>
                <th className="text-left py-2 px-2">Zone</th>
                <th className="text-left py-2 px-2">Yield (N/mm²)</th>
                <th className="text-left py-2 px-2">Grade</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, idx) => (
                <tr key={m.member_id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                  <td className="py-2 px-2 font-mono text-blue-400">{m.member_id}</td>
                  <td className="py-2 px-2">
                    <select
                      value={m.member_role}
                      onChange={(e) => updateMember(idx, 'member_role', e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-full"
                    >
                      {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={m.zone}
                      onChange={(e) => updateMember(idx, 'zone', e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                    >
                      <option value="cargo_hold_region">Cargo Hold Region</option>
                      <option value="outside_cargo_hold">Outside Cargo Hold</option>
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      value={String(m.yield_strength_nmm2)}
                      onChange={(e) => updateMember(idx, 'yield_strength_nmm2', Number(e.target.value) || e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                    >
                      {YIELDS.map(y => <option key={y} value={y}>{y}</option>)}
                      <option value="미지정">미지정</option>
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={String(m.grade)}
                      onChange={(e) => updateMember(idx, 'grade', e.target.value)}
                      className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm w-24"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button onClick={addMember}
          className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
          + Add Member
        </button>
      </div>

      <div className="flex justify-end">
        <button onClick={onNext}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium transition">
          Next: Thickness
        </button>
      </div>
    </div>
  );
}
