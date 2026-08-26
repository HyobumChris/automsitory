import { useRef, useState } from 'react'
import { DEFECT_TYPES } from '../data/specimens.js'

function useDragWindow(initial) {
  const [pos, setPos] = useState(initial)
  const drag = useRef(null)
  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setPos({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy })
  }
  const onPointerUp = () => {
    drag.current = null
  }
  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp } }
}

function SpinField({ label, value, step, min, max, onChange }) {
  const clamp = (v) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))
  return (
    <label className="flex items-center gap-1 text-[11px]">
      <span className="w-[74px]">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        className="sunken-white w-[58px] px-1 text-[11px]"
      />
      <span className="flex flex-col">
        <button type="button" onClick={() => onChange(clamp(value + step))} className="bevel-out h-[10px] w-[16px] text-[6px] leading-[6px] text-black">▲</button>
        <button type="button" onClick={() => onChange(clamp(value - step))} className="bevel-out h-[10px] w-[16px] text-[6px] leading-[6px] text-black">▼</button>
      </span>
    </label>
  )
}

export default function DefectEditor({ specimen, thickness, defects, selectedDefectId, dispatch, onClose }) {
  const { pos, handlers } = useDragWindow({ x: 430, y: 250 })
  const [newKind, setNewKind] = useState('crack')
  const selected = defects.find((d) => d.id === selectedDefectId) ?? defects[0] ?? null
  const selIndex = selected ? defects.indexOf(selected) : -1
  const upd = (patch) => selected && dispatch({ type: 'UPDATE_DEFECT', id: selected.id, patch })

  return (
    <div className="absolute z-50 w-[330px] select-none" style={{ left: pos.x, top: pos.y }}>
      <div className="bevel-out shadow-[4px_4px_8px_rgba(0,0,0,0.35)]">
        <div
          {...handlers}
          className="flex cursor-move touch-none items-center bg-[linear-gradient(90deg,#000080,#1084d0)] px-1.5 py-0.5 text-[11px] font-bold text-white"
        >
          Defect Editor (결함 편집)
          <button type="button" onClick={onClose} className="bevel-out ml-auto h-[15px] w-[17px] text-[9px] leading-none text-black">✕</button>
        </div>
        <div className="space-y-2 p-2">
          {!specimen.allowDefects ? (
            <p className="text-[11px]">Calibration blocks have fixed targets — 교정 시험편에는 결함을 추가할 수 없습니다.</p>
          ) : (
            <>
              {/* Select Defect group box */}
              <fieldset className="etched relative px-2 pb-1.5 pt-2">
                <legend className="px-1 text-[11px]">Select Defect</legend>
                <div className="grid grid-cols-4 gap-x-2 gap-y-0.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <label key={i} className={'flex items-center gap-1 text-[11px] ' + (i >= defects.length ? 'text-[#808080]' : '')}>
                      <input
                        type="radio"
                        name="defsel"
                        disabled={i >= defects.length}
                        checked={selIndex === i}
                        onChange={() => dispatch({ type: 'SELECT_DEFECT', id: defects[i].id })}
                      />
                      {i + 1}
                    </label>
                  ))}
                </div>
              </fieldset>

              {selected && (
                <fieldset className="etched relative space-y-1 px-2 pb-1.5 pt-2">
                  <legend className="px-1 text-[11px]">
                    Defect {selIndex + 1} — {selected.label}
                  </legend>
                  <SpinField label="SEPARATION" value={selected.x} step={1} min={0} max={specimen.length} onChange={(v) => upd({ x: v })} />
                  <SpinField label="DEPTH" value={selected.depth} step={0.5} min={0} max={thickness} onChange={(v) => upd({ depth: v })} />
                  <SpinField label="LENGTH" value={selected.size} step={1} min={1} max={100} onChange={(v) => upd({ size: v })} />
                  {selected.planar && !selected.lamination && (
                    <SpinField label="TILT °" value={selected.tilt} step={5} min={-90} max={90} onChange={(v) => upd({ tilt: v })} />
                  )}
                </fieldset>
              )}

              <div className="flex items-center gap-1">
                <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className="sunken-white max-w-[170px] flex-1 px-1 py-0.5 text-[11px]">
                  {DEFECT_TYPES.map((d) => (
                    <option key={d.kind} value={d.kind}>{d.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => defects.length < 8 && dispatch({ type: 'ADD_DEFECT', kind: newKind })}
                  disabled={defects.length >= 8}
                  className="bevel-out px-2 py-0.5 text-[11px] font-bold text-black disabled:embossed"
                >
                  Add
                </button>
              </div>

              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={!selected}
                  onClick={() => selected && dispatch({ type: 'REMOVE_DEFECT', id: selected.id })}
                  className="bevel-out px-2 py-0.5 text-[11px] text-black disabled:embossed"
                >
                  Delete Defect {selIndex >= 0 ? selIndex + 1 : ''}
                </button>
                <button type="button" onClick={() => dispatch({ type: 'CLEAR_DEFECTS' })} className="bevel-out px-2 py-0.5 text-[11px] text-black">
                  Delete All Defects
                </button>
                <button type="button" onClick={onClose} className="bevel-out ml-auto px-3 py-0.5 text-[11px] font-bold text-black">
                  OK
                </button>
              </div>

              {/* red defect summary */}
              <div className="space-y-0.5 text-[10px] text-defect-red">
                {defects.map((d, i) => (
                  <div key={d.id}>
                    {(d.planar ? 'PLA' : 'VOL') + ' Defect ' + (i + 1) + '  Depth=' + d.depth + 'mm Length=' + d.size + 'mm. From ' +
                      (d.x - d.size / 2).toFixed(0) + 'mm To ' + (d.x + d.size / 2).toFixed(0) + 'mm'}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
