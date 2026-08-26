import { SPECIMENS } from '../data/specimens.js'

export default function SpecimenSelector({ specimen, specimenParams, dispatch }) {
  return (
    <div className="rounded-lg border border-marine-600 bg-marine-800 p-2">
      <div className="mb-1.5 text-xs font-semibold text-cyan-glow">Specimen (시험편)</div>
      <div className="grid grid-cols-2 gap-1.5">
        {SPECIMENS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => dispatch({ type: 'SET_SPECIMEN', specimenId: s.id })}
            className={
              'rounded border px-2 py-1 text-left transition-colors ' +
              (s.id === specimen.id
                ? 'border-amber-glow bg-amber-glow/15 text-amber-glow'
                : 'border-marine-600 bg-marine-700 text-slate-300 hover:border-amber-glow/50')
            }
          >
            <div className="text-[11px] font-semibold">{s.name}</div>
            <div className="text-[9px] text-slate-400">{s.nameKo}</div>
          </button>
        ))}
      </div>

      {specimen.type === 'v1' && (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Face (탐상면):</span>
          {Object.entries(specimen.faces).map(([key, f]) => (
            <button
              key={key}
              type="button"
              onClick={() => dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'face', value: key })}
              className={
                'rounded px-2 py-0.5 transition-colors ' +
                ((specimenParams.face ?? specimen.defaultFace) === key
                  ? 'bg-cyan-glow/25 text-cyan-glow'
                  : 'bg-marine-700 text-slate-400 hover:text-cyan-glow')
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {specimen.type === 'weld' && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
          Plate thickness (판 두께): 
          <input
            type="range"
            min={specimen.minThickness}
            max={specimen.maxThickness}
            step={1}
            value={specimenParams.thickness ?? specimen.thickness}
            onChange={(e) =>
              dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'thickness', value: Number(e.target.value) })
            }
            className="flex-1 accent-cyan-500"
          />
          <span className="font-mono text-cyan-glow">{specimenParams.thickness ?? specimen.thickness} mm</span>
        </label>
      )}

      {specimen.type === 'tky' && (
        <label className="mt-2 flex items-center gap-2 text-[11px] text-slate-400">
          Brace angle (브레이스 각도): 
          <input
            type="range"
            min={30}
            max={90}
            step={5}
            value={specimenParams.braceAngle ?? specimen.braceAngle}
            onChange={(e) =>
              dispatch({ type: 'SET_SPECIMEN_PARAM', key: 'braceAngle', value: Number(e.target.value) })
            }
            className="flex-1 accent-cyan-500"
          />
          <span className="font-mono text-cyan-glow">{specimenParams.braceAngle ?? specimen.braceAngle}°</span>
        </label>
      )}
    </div>
  )
}
