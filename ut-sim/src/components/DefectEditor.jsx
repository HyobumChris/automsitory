import { useState } from 'react'
import WinWindow from './WinWindow.jsx'
import { DEFECT_TYPES, effectiveLength } from '../data/specimens.js'

const LS_KEY = 'ut-sim-defects'

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

/** Circle View: pipe drawn as an annulus with mm spokes and red defect arcs. */
function CircleView({ specimen, specimenParams, defects, selectedDefectId, circumference }) {
  const S = 176
  const c = S / 2
  const R = ((specimenParams.odIn ?? specimen.odIn) * 25.4) / 2
  const wt = specimenParams.wt ?? specimen.wt
  const outerR = 74
  const innerR = outerR * ((R - wt) / R)
  const midR = (outerR + innerR) / 2
  const ang = (mm) => (mm / circumference) * Math.PI * 2 - Math.PI / 2
  const spokes = []
  for (let mm = 0; mm < circumference; mm += 40) {
    const a = ang(mm)
    spokes.push(
      <g key={mm}>
        <line
          x1={c + (innerR - 8) * Math.cos(a)}
          y1={c + (innerR - 8) * Math.sin(a)}
          x2={c + (outerR + 3) * Math.cos(a)}
          y2={c + (outerR + 3) * Math.sin(a)}
          stroke="#666"
          strokeWidth={0.6}
          strokeDasharray="3 2"
        />
        <text x={c + (outerR + 12) * Math.cos(a)} y={c + (outerR + 12) * Math.sin(a) + 3} fontSize={8} textAnchor="middle" fill="#000">
          {mm}
        </text>
      </g>,
    )
  }
  const arcPath = (mm0, mm1) => {
    const a0 = ang(mm0)
    const a1 = ang(mm1)
    const large = mm1 - mm0 > circumference / 2 ? 1 : 0
    return (
      'M ' + (c + midR * Math.cos(a0)) + ' ' + (c + midR * Math.sin(a0)) +
      ' A ' + midR + ' ' + midR + ' 0 ' + large + ' 1 ' + (c + midR * Math.cos(a1)) + ' ' + (c + midR * Math.sin(a1))
    )
  }
  return (
    <svg width={S} height={S} className="mx-auto block">
      <circle cx={c} cy={c} r={outerR} fill="#a8a8a8" stroke="#000" strokeWidth={1} />
      <circle cx={c} cy={c} r={innerR} fill="#f0edcd" stroke="#000" strokeWidth={1} />
      {spokes}
      {defects.map((d) => (
        <path
          key={d.id}
          d={arcPath(d.x - d.size / 2, d.x + d.size / 2)}
          fill="none"
          stroke={d.id === selectedDefectId ? '#ff6600' : '#dd0000'}
          strokeWidth={Math.min(outerR - innerR, 7)}
          strokeLinecap="butt"
        />
      ))}
      <text x={c} y={c + 3} fontSize={9} textAnchor="middle" fill="#000">
        {(specimenParams.odIn ?? specimen.odIn) + '" OD'}
      </text>
    </svg>
  )
}

export default function DefectEditor({ specimen, specimenParams, thickness, defects, selectedDefectId, dispatch, onClose }) {
  const [newKind, setNewKind] = useState('crack')
  const [applyAll, setApplyAll] = useState(false)
  const [ioMsg, setIoMsg] = useState(null)
  const isPipe = specimen.type === 'pipe'
  const length = effectiveLength(specimen, specimenParams)
  const selected = defects.find((d) => d.id === selectedDefectId) ?? defects[0] ?? null
  const selIndex = selected ? defects.indexOf(selected) : -1
  const upd = (patch, allowAll = true) => {
    if (!selected) return
    if (applyAll && allowAll) dispatch({ type: 'UPDATE_ALL_DEFECTS', patch })
    else dispatch({ type: 'UPDATE_DEFECT', id: selected.id, patch })
  }
  const saveDefects = () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(defects))
      setIoMsg('Saved ' + defects.length + ' defect(s).')
    } catch {
      setIoMsg('Save failed (localStorage unavailable).')
    }
  }
  const loadDefects = () => {
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (!raw) {
        setIoMsg('Nothing saved yet.')
        return
      }
      const parsed = JSON.parse(raw)
      dispatch({ type: 'LOAD_DEFECTS', defects: parsed })
      setIoMsg('Loaded ' + (Array.isArray(parsed) ? Math.min(parsed.length, 8) : 0) + ' defect(s).')
    } catch {
      setIoMsg('Load failed (bad data).')
    }
  }

  return (
    <WinWindow
      title={isPipe ? 'Circle View — Pipe Defects (원형 보기)' : 'Defect Editor (결함 편집)'}
      initial={{ x: 430, y: 230 }}
      width={isPipe ? 360 : 330}
      onClose={onClose}
    >
      <div className="space-y-2 p-2">
        {!specimen.allowDefects ? (
          <p className="text-[11px]">Calibration blocks have fixed targets — 교정 시험편에는 결함을 추가할 수 없습니다.</p>
        ) : (
          <>
            {isPipe && (
              <CircleView
                specimen={specimen}
                specimenParams={specimenParams}
                defects={defects}
                selectedDefectId={selected?.id ?? null}
                circumference={length}
              />
            )}

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
                <SpinField label="SEPARATION" value={selected.x} step={1} min={0} max={length} onChange={(v) => upd({ x: v }, false)} />
                <SpinField label="DEPTH" value={selected.depth} step={0.5} min={0} max={thickness} onChange={(v) => upd({ depth: v })} />
                <SpinField label="LENGTH" value={selected.size} step={1} min={1} max={100} onChange={(v) => upd({ size: v })} />
                {selected.planar && !selected.lamination && (
                  <SpinField label="TILT °" value={selected.tilt} step={5} min={-90} max={90} onChange={(v) => upd({ tilt: v })} />
                )}
                <label className="flex items-center gap-1 text-[11px]">
                  <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
                  APPLY TO ALL DEFECTS (전체 적용)
                </label>
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

            <div className="flex flex-wrap gap-1">
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
              <button type="button" onClick={saveDefects} className="bevel-out px-2 py-0.5 text-[11px] text-black">Save Def</button>
              <button type="button" onClick={loadDefects} className="bevel-out px-2 py-0.5 text-[11px] text-black">Load Def</button>
              <button type="button" onClick={onClose} className="bevel-out ml-auto px-3 py-0.5 text-[11px] font-bold text-black">
                OK
              </button>
            </div>
            {ioMsg && <div className="text-[10px] text-[#000080]">{ioMsg}</div>}

            <div className="space-y-0.5 text-[10px] text-defect-red">
              {defects.map((d, i) => (
                <div key={d.id}>
                  {(d.planar ? 'PLA' : 'VOL') + ' Defect ' + (i + 1) + '  Height=' + d.depth + 'mm Length=' + d.size + 'mm. From ' +
                    (d.x - d.size / 2).toFixed(0) + 'mm To ' + (d.x + d.size / 2).toFixed(0) + 'mm'}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </WinWindow>
  )
}
