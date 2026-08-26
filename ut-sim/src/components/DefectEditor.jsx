import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { DEFECT_TYPES } from '../data/specimens.js'

function NumField({ label, value, min, max, step, onChange }) {
  return (
    <label className="flex flex-col text-[9px] uppercase tracking-wide text-slate-500">
      {label}
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-16 rounded border border-marine-600 bg-marine-900 px-1 py-0.5 font-mono text-[11px] text-cyan-glow outline-none focus:border-cyan-glow"
      />
    </label>
  )
}

export default function DefectEditor({ specimen, thickness, defects, selectedDefectId, dispatch }) {
  const [newKind, setNewKind] = useState('crack')
  if (!specimen.allowDefects) {
    return (
      <div className="rounded-lg border border-marine-600 bg-marine-800 p-2 text-[11px] text-slate-500">
        Defects (결함): calibration blocks have fixed targets — 교정 시험편에는 결함을 추가할 수 없습니다.
      </div>
    )
  }
  const upd = (id, patch) => dispatch({ type: 'UPDATE_DEFECT', id, patch })
  return (
    <div className="rounded-lg border border-marine-600 bg-marine-800 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-red-glow">Defects (결함 편집)</span>
        <div className="flex items-center gap-1">
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value)}
            className="rounded border border-marine-600 bg-marine-900 px-1 py-0.5 text-[10px] text-slate-300 outline-none"
          >
            {DEFECT_TYPES.map((d) => (
              <option key={d.kind} value={d.kind}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => dispatch({ type: 'ADD_DEFECT', kind: newKind })}
            className="flex items-center gap-0.5 rounded border border-red-glow/40 bg-red-glow/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-glow hover:bg-red-glow/25"
          >
            <Plus size={11} /> add
          </button>
        </div>
      </div>
      {defects.length === 0 && (
        <div className="text-[11px] text-slate-500">No defects (결함 없음) — add one above.</div>
      )}
      <div className="space-y-1.5">
        {defects.map((d) => (
          <div
            key={d.id}
            onClick={() => dispatch({ type: 'SELECT_DEFECT', id: d.id })}
            className={
              'rounded border p-1.5 transition-colors ' +
              (d.id === selectedDefectId ? 'border-amber-glow/70 bg-marine-700' : 'border-marine-600')
            }
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-slate-200">{d.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  dispatch({ type: 'REMOVE_DEFECT', id: d.id })
                }}
                className="text-slate-500 transition-colors hover:text-red-glow"
                title="remove"
              >
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <NumField label="x mm" value={d.x} min={0} max={specimen.length} step={1} onChange={(v) => upd(d.id, { x: v })} />
              <NumField label="depth" value={d.depth} min={0} max={thickness} step={0.5} onChange={(v) => upd(d.id, { depth: v })} />
              <NumField label="size" value={d.size} min={1} max={100} step={1} onChange={(v) => upd(d.id, { size: v })} />
              {d.planar && !d.lamination && (
                <NumField label="tilt°" value={d.tilt} min={-90} max={90} step={5} onChange={(v) => upd(d.id, { tilt: v })} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
