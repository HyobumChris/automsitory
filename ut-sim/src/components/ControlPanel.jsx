import { useEffect, useRef } from 'react'
import { Minus, Plus, Power, Crosshair, Trash2, Target } from 'lucide-react'
import { RANGE_STEPS, GAIN_STEPS } from '../lib/ultrasound.js'

function HoldButton({ onTrigger, children, title }) {
  const timers = useRef({ t: null, i: null })

  const stop = () => {
    clearTimeout(timers.current.t)
    clearInterval(timers.current.i)
  }
  const start = () => {
    onTrigger()
    timers.current.t = setTimeout(() => {
      timers.current.i = setInterval(onTrigger, 90)
    }, 350)
  }
  useEffect(() => stop, [])

  return (
    <button
      type="button"
      title={title}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      className="flex h-7 w-7 items-center justify-center rounded border border-marine-600 bg-marine-700 text-cyan-glow transition-colors hover:border-cyan-glow hover:bg-marine-600 active:bg-cyan-glow/20"
    >
      {children}
    </button>
  )
}

function Knob({ label, labelKo, value, unit, onDelta, children }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-marine-600 bg-marine-800 px-2 py-2">
      <div className="text-[10px] font-semibold tracking-wider text-slate-400">
        {label} <span className="text-slate-500">({labelKo})</span>
      </div>
      <div className="font-mono text-sm font-semibold text-cyan-glow">
        {value}
        <span className="ml-0.5 text-[10px] text-slate-400">{unit}</span>
      </div>
      <div className="flex items-center gap-1">
        <HoldButton onTrigger={() => onDelta(-1)} title="decrease">
          <Minus size={14} />
        </HoldButton>
        <HoldButton onTrigger={() => onDelta(1)} title="increase">
          <Plus size={14} />
        </HoldButton>
      </div>
      {children}
    </div>
  )
}

export default function ControlPanel({ state, dispatch, onRecordDac, onAddMarker }) {
  const { settings, gate, dacPoints, beamMarkers } = state
  const adj = (key, delta) => dispatch({ type: 'ADJUST_SETTING', key, delta })

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      <Knob
        label="RANGE"
        labelKo="측정 범위"
        value={settings.range.toFixed(0)}
        unit="mm"
        onDelta={(d) => adj('range', d * 5)}
      >
        <div className="flex flex-wrap justify-center gap-1">
          {RANGE_STEPS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => dispatch({ type: 'SET_SETTING', key: 'range', value: r })}
              className={
                'rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ' +
                (settings.range === r
                  ? 'bg-cyan-glow/25 text-cyan-glow'
                  : 'bg-marine-700 text-slate-400 hover:text-cyan-glow')
              }
            >
              {r}
            </button>
          ))}
        </div>
      </Knob>

      <Knob
        label="GAIN"
        labelKo="게인"
        value={settings.gain.toFixed(1)}
        unit="dB"
        onDelta={(d) => adj('gain', d * settings.dbStep)}
      >
        <div className="flex gap-1">
          {GAIN_STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => dispatch({ type: 'SET_SETTING', key: 'dbStep', value: s })}
              className={
                'rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors ' +
                (settings.dbStep === s
                  ? 'bg-amber-glow/25 text-amber-glow'
                  : 'bg-marine-700 text-slate-400 hover:text-amber-glow')
              }
            >
              {s} dB
            </button>
          ))}
        </div>
      </Knob>

      <Knob
        label="X-SHIFT"
        labelKo="지연"
        value={settings.xShift.toFixed(1)}
        unit="mm"
        onDelta={(d) => adj('xShift', d * 1)}
      />

      <Knob
        label="ZERO"
        labelKo="탐촉자 영점"
        value={settings.probeZero.toFixed(1)}
        unit="mm"
        onDelta={(d) => adj('probeZero', d * 0.5)}
      />

      <Knob
        label="REJECT"
        labelKo="제거"
        value={settings.reject.toFixed(0)}
        unit="%"
        onDelta={(d) => adj('reject', d * 2)}
      />

      {/* GATE group */}
      <div className="flex flex-col gap-1 rounded-lg border border-marine-600 bg-marine-800 px-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold tracking-wider text-slate-400">
            GATE <span className="text-slate-500">(게이트)</span>
          </span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_GATE', patch: { on: !gate.on } })}
            className={
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ' +
              (gate.on ? 'bg-amber-glow/25 text-amber-glow' : 'bg-marine-700 text-slate-500')
            }
          >
            <Power size={11} /> {gate.on ? 'ON' : 'OFF'}
          </button>
        </div>
        {['start', 'width', 'level'].map((k) => (
          <div key={k} className="flex items-center justify-between gap-1">
            <span className="w-10 text-[10px] uppercase text-slate-500">{k}</span>
            <span className="font-mono text-xs text-amber-glow">
              {gate[k].toFixed(0)}
              <span className="text-[9px] text-slate-500">{k === 'level' ? '%' : 'mm'}</span>
            </span>
            <div className="flex gap-1">
              <HoldButton
                onTrigger={() =>
                  dispatch({ type: 'SET_GATE', patch: { [k]: Math.max(k === 'width' ? 5 : 0, gate[k] - (k === 'level' ? 5 : 2)) } })
                }
              >
                <Minus size={12} />
              </HoldButton>
              <HoldButton
                onTrigger={() =>
                  dispatch({ type: 'SET_GATE', patch: { [k]: Math.min(k === 'level' ? 100 : 500, gate[k] + (k === 'level' ? 5 : 2)) } })
                }
              >
                <Plus size={12} />
              </HoldButton>
            </div>
          </div>
        ))}
      </div>

      {/* DAC + beam-spread markers */}
      <div className="flex flex-col justify-center gap-1.5 rounded-lg border border-marine-600 bg-marine-800 px-2 py-2">
        <button
          type="button"
          onClick={onRecordDac}
          className="flex items-center gap-1.5 rounded border border-cyan-glow/40 bg-cyan-glow/10 px-2 py-1 text-[11px] font-semibold text-cyan-glow transition-colors hover:bg-cyan-glow/25"
        >
          <Target size={12} /> Record DAC point (DAC 기록) [{dacPoints.length}]
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR_DAC' })}
          className="flex items-center gap-1.5 rounded border border-marine-600 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-red-glow"
        >
          <Trash2 size={12} /> Clear DAC
        </button>
        <button
          type="button"
          onClick={onAddMarker}
          className="flex items-center gap-1.5 rounded border border-emerald-glow/40 bg-emerald-glow/10 px-2 py-1 text-[11px] font-semibold text-emerald-glow transition-colors hover:bg-emerald-glow/25"
        >
          <Crosshair size={12} /> Mark 20% edge (20% 마커) [{beamMarkers.length}]
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR_MARKERS' })}
          className="flex items-center gap-1.5 rounded border border-marine-600 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:text-red-glow"
        >
          <Trash2 size={12} /> Clear markers
        </button>
      </div>
    </div>
  )
}
