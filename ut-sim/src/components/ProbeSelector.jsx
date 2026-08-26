import { ArrowLeftRight } from 'lucide-react'
import { PROBES } from '../data/probes.js'

export default function ProbeSelector({ probeId, probeDir, dispatch }) {
  return (
    <div className="rounded-lg border border-marine-600 bg-marine-800 p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold text-cyan-glow">Probe (탐촉자)</span>
        <button
          type="button"
          onClick={() => dispatch({ type: 'FLIP_PROBE' })}
          className="flex items-center gap-1 rounded border border-marine-600 px-1.5 py-0.5 text-[10px] text-slate-300 transition-colors hover:border-cyan-glow hover:text-cyan-glow"
          title="Flip scanning direction (주사 방향 반전)"
        >
          <ArrowLeftRight size={11} /> {probeDir > 0 ? '→' : '←'} flip
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {PROBES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => dispatch({ type: 'SET_PROBE', probeId: p.id })}
            className={
              'rounded border px-2 py-1 text-left transition-colors ' +
              (p.id === probeId
                ? 'border-cyan-glow bg-cyan-glow/15 text-cyan-glow'
                : 'border-marine-600 bg-marine-700 text-slate-300 hover:border-cyan-glow/50')
            }
          >
            <div className="text-[11px] font-semibold">{p.angle === 0 ? '0° comp' : p.angle + '° shear'}</div>
            <div className="text-[9px] text-slate-400">
              {p.freqMHz} MHz · zero {p.wedgeDelayMm} mm
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
