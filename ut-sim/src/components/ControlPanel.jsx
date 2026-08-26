import { useEffect, useRef, useState } from 'react'
import { RANGE_STEPS, GAIN_STEPS } from '../lib/ultrasound.js'

/* ---------- shared helpers ---------- */

function useDragWindow(initial) {
  const [pos, setPos] = useState(initial)
  const drag = useRef(null)
  const onPointerDown = (e) => {
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e) => {
    if (!drag.current) return
    setPos({
      x: drag.current.ox + e.clientX - drag.current.sx,
      y: drag.current.oy + e.clientY - drag.current.sy,
    })
  }
  const onPointerUp = () => {
    drag.current = null
  }
  return { pos, handlers: { onPointerDown, onPointerMove, onPointerUp } }
}

function HoldBtn({ onTrigger, children, className = '', title }) {
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
      className={'bevel-out flex items-center justify-center text-black active:bevel-in ' + className}
    >
      {children}
    </button>
  )
}

function Knob({ value, min, max, step = 1, onDelta, color = '#b8b8b8', size = 38 }) {
  const last = useRef(null)
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -135 + frac * 270
  return (
    <div
      className="relative touch-none rounded-full"
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 35% 30%, ' + color + ', #303030)',
        border: '2px solid #000',
        cursor: 'ns-resize',
      }}
      onPointerDown={(e) => {
        last.current = e.clientY
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (last.current == null) return
        const dy = last.current - e.clientY
        if (Math.abs(dy) >= 3) {
          onDelta(Math.sign(dy) * step)
          last.current = e.clientY
        }
      }}
      onPointerUp={() => {
        last.current = null
      }}
      onWheel={(e) => onDelta(e.deltaY < 0 ? step : -step)}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 2,
          height: size / 2 - 4,
          background: '#fff',
          transformOrigin: '50% 0%',
          transform: 'translate(-50%,0) rotate(' + (angle + 180) + 'deg)',
        }}
      />
    </div>
  )
}

function ArrowPair({ onDec, onInc }) {
  return (
    <div className="flex gap-0.5">
      <HoldBtn onTrigger={onDec} className="h-4 w-5 text-[8px]">◀</HoldBtn>
      <HoldBtn onTrigger={onInc} className="h-4 w-5 text-[8px]">▶</HoldBtn>
    </div>
  )
}

/* ---------- USK-7 analogue skin ---------- */

function Usk7Panel({ state, dispatch, tofdMode, onRecordDac, onAddMarker }) {
  const { settings, gate, dacPoints, beamMarkers, tofdS } = state
  const adj = (key, delta) => dispatch({ type: 'ADJUST_SETTING', key, delta })
  const lbl = 'text-[9px] font-bold tracking-wider text-knob-green'
  const val = 'text-[10px] text-knob-green'
  return (
    <div className="flex w-[252px] flex-col gap-2 bg-panel-olive p-2">
      {/* RANGE / coarse / X-SHIFT */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>RANGE</span>
          <ArrowPair onDec={() => adj('range', -5)} onInc={() => adj('range', 5)} />
          <Knob value={settings.range} min={4} max={1000} step={1} onDelta={(d) => adj('range', d)} />
          <span className={val}>{settings.range.toFixed(0)}{tofdMode ? 'µs' : 'mm'}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className={lbl}>COARSE</span>
          <div className="sunken flex flex-col-reverse gap-0.5 bg-[#101810] p-0.5">
            {RANGE_STEPS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => dispatch({ type: 'SET_SETTING', key: 'range', value: r })}
                className={
                  settings.range === r
                    ? 'bevel-out h-4 w-9 text-[8px] font-bold text-black'
                    : 'h-4 w-9 bg-[#243024] text-[8px] text-knob-green'
                }
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>X-SHIFT</span>
          <ArrowPair onDec={() => adj('xShift', -1)} onInc={() => adj('xShift', 1)} />
          <Knob value={settings.xShift} min={-50} max={500} step={0.5} onDelta={(d) => adj('xShift', d)} />
          <span className={val}>{settings.xShift.toFixed(1)}</span>
        </div>
      </div>

      {/* AMP (red knob) + dB steps (yellow buttons) */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>AMP=</span>
          <ArrowPair onDec={() => adj('gain', -settings.dbStep)} onInc={() => adj('gain', settings.dbStep)} />
          <Knob value={settings.gain} min={0} max={110} step={settings.dbStep} onDelta={(d) => adj('gain', d)} color="#cc2222" />
          <span className={val}>{settings.gain.toFixed(1)}dB</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>dB STEP</span>
          <div className="flex gap-1.5">
            {GAIN_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => dispatch({ type: 'SET_SETTING', key: 'dbStep', value: s })}
                className="flex flex-col items-center gap-0.5"
              >
                <span
                  className="block h-4 w-4 rounded-full border border-black"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, #ffe066, #b8860b)',
                    outline: settings.dbStep === s ? '2px solid #fff' : 'none',
                  }}
                />
                <span className="text-[8px] text-knob-green">{s}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>SUPPRESSION</span>
          <ArrowPair onDec={() => adj('reject', -2)} onInc={() => adj('reject', 2)} />
          <span className={val}>{settings.reject.toFixed(0)}%</span>
          <span className={lbl}>ZERO</span>
          <ArrowPair onDec={() => adj('probeZero', -0.5)} onInc={() => adj('probeZero', 0.5)} />
          <span className={val}>{settings.probeZero.toFixed(1)}</span>
        </div>
      </div>

      {/* GATE */}
      <div className="sunken bg-[#101810] p-1">
        <div className="flex items-center justify-between">
          <span className={lbl}>GATE</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_GATE', patch: { on: !gate.on } })}
            className={gate.on ? 'bevel-in px-1.5 text-[8px] font-bold text-black' : 'bevel-out px-1.5 text-[8px] text-black'}
          >
            {gate.on ? 'ON' : 'OFF'}
          </button>
        </div>
        {['start', 'width', 'level'].map((k) => (
          <div key={k} className="mt-0.5 flex items-center justify-between">
            <span className="w-10 text-[8px] uppercase text-knob-green">{k}</span>
            <span className="text-[9px] text-knob-green">
              {gate[k].toFixed(0)}
              {k === 'level' ? '%' : ''}
            </span>
            <ArrowPair
              onDec={() => dispatch({ type: 'SET_GATE', patch: { [k]: Math.max(k === 'width' ? 5 : 0, gate[k] - (k === 'level' ? 5 : 2)) } })}
              onInc={() => dispatch({ type: 'SET_GATE', patch: { [k]: Math.min(k === 'level' ? 100 : 500, gate[k] + (k === 'level' ? 5 : 2)) } })}
            />
          </div>
        ))}
      </div>

      {/* TOFD probe-centre spacing */}
      {tofdMode && (
        <div className="flex items-center justify-between">
          <span className={lbl}>TOFD PCS (2S)</span>
          <span className={val}>{2 * tofdS}mm</span>
          <ArrowPair onDec={() => dispatch({ type: 'SET_TOFD_S', delta: -1 })} onInc={() => dispatch({ type: 'SET_TOFD_S', delta: 1 })} />
        </div>
      )}

      {/* bottom: OFF square, brand, DAC/MARK keys */}
      <div className="mt-auto flex items-end gap-2">
        <div className="flex h-5 w-6 items-center justify-center border border-[#555] bg-black text-[7px] text-red-500">OFF</div>
        <span className="text-[8px] tracking-widest text-[#9a9a6a]">USK-7 SIM</span>
        <div className="ml-auto grid grid-cols-2 gap-0.5">
          <button type="button" onClick={onRecordDac} className="bevel-out px-1 text-[8px] font-bold">DAC PT {dacPoints.length}</button>
          <button type="button" onClick={() => dispatch({ type: 'CLEAR_DAC' })} className="bevel-out px-1 text-[8px]">CLR DAC</button>
          <button type="button" onClick={onAddMarker} className="bevel-out px-1 text-[8px] font-bold">MARK {beamMarkers.length}</button>
          <button type="button" onClick={() => dispatch({ type: 'CLEAR_MARKERS' })} className="bevel-out px-1 text-[8px]">CLR MK</button>
        </div>
      </div>
    </div>
  )
}

/* ---------- EPOCH digital skin ---------- */

const EPOCH_PARAMS = [
  { key: 'gain', label: 'GAIN', unit: 'dB', step: null },
  { key: 'range', label: 'RANGE', unit: '', step: 5 },
  { key: 'xShift', label: 'DELAY', unit: '', step: 1 },
  { key: 'probeZero', label: 'ZERO', unit: '', step: 0.5 },
  { key: 'start', label: 'G.START', gate: true, step: 2 },
  { key: 'width', label: 'G.WIDTH', gate: true, step: 2 },
  { key: 'level', label: 'G.LEVEL', unit: '%', gate: true, step: 5 },
]

function EpochBody({ state, dispatch, tofdMode, onRecordDac, onAddMarker, onOpenAutoCal, children }) {
  const [sel, setSel] = useState(0)
  const { settings, gate } = state
  const param = EPOCH_PARAMS[sel]
  const valueOf = (p) => (p.gate ? gate[p.key] : settings[p.key])
  const adjust = (p, dir) => {
    const step = p.step ?? settings.dbStep
    if (p.gate) {
      const lo = p.key === 'width' ? 5 : 0
      const hi = p.key === 'level' ? 100 : 500
      dispatch({ type: 'SET_GATE', patch: { [p.key]: Math.min(hi, Math.max(lo, gate[p.key] + dir * step)) } })
    } else {
      dispatch({ type: 'ADJUST_SETTING', key: p.key, delta: dir * step })
    }
  }
  const cycleStep = () => {
    const i = GAIN_STEPS.indexOf(settings.dbStep)
    dispatch({ type: 'SET_SETTING', key: 'dbStep', value: GAIN_STEPS[(i + 1) % GAIN_STEPS.length] })
  }
  const fkeys = [
    { cap: 'F1', label: 'AUTO CAL', onClick: onOpenAutoCal },
    { cap: 'F2', label: gate.on ? 'GATE ON' : 'GATE OFF', onClick: () => dispatch({ type: 'SET_GATE', patch: { on: !gate.on } }) },
    { cap: 'F3', label: 'REJ +', onClick: () => dispatch({ type: 'ADJUST_SETTING', key: 'reject', delta: 2 }) },
    { cap: 'F4', label: 'REJ −', onClick: () => dispatch({ type: 'ADJUST_SETTING', key: 'reject', delta: -2 }) },
    { cap: 'F5', label: 'USK-7', onClick: () => dispatch({ type: 'SET_INSTRUMENT', instrument: 'usk7' }) },
  ]
  const pkeys = [
    { cap: 'P1', label: 'DAC PT', onClick: onRecordDac },
    { cap: 'P2', label: 'CLR DAC', onClick: () => dispatch({ type: 'CLEAR_DAC' }) },
    { cap: 'P3', label: 'MARK', onClick: onAddMarker },
    { cap: 'P4', label: 'CLR MK', onClick: () => dispatch({ type: 'CLEAR_MARKERS' }) },
    { cap: 'P5', label: 'FLIP', onClick: () => dispatch({ type: 'FLIP_PROBE' }) },
    { cap: 'P6', label: tofdMode ? 'PCS −' : '—', onClick: tofdMode ? () => dispatch({ type: 'SET_TOFD_S', delta: -1 }) : null },
    { cap: 'P7', label: tofdMode ? 'PCS +' : '—', onClick: tofdMode ? () => dispatch({ type: 'SET_TOFD_S', delta: 1 }) : null },
  ]
  const keyCls = 'bevel-out flex h-7 flex-col items-center justify-center px-1 text-[8px] leading-tight text-black active:bevel-in'
  return (
    <div className="rounded-b-lg bg-[#3a3d42] p-2">
      <div className="flex gap-2">
        {/* left key cluster: arrow pad + dB */}
        <div className="flex w-[84px] flex-col items-center justify-center gap-2">
          <div className="grid grid-cols-3 gap-0.5">
            <span />
            <HoldBtn onTrigger={() => adjust(param, 1)} className="h-6 w-6 text-[9px]">▲</HoldBtn>
            <span />
            <button type="button" onClick={() => setSel((sel + EPOCH_PARAMS.length - 1) % EPOCH_PARAMS.length)} className={keyCls + ' w-6'}>◀</button>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#222] text-[7px] text-white">SEL</span>
            <button type="button" onClick={() => setSel((sel + 1) % EPOCH_PARAMS.length)} className={keyCls + ' w-6'}>▶</button>
            <span />
            <HoldBtn onTrigger={() => adjust(param, -1)} className="h-6 w-6 text-[9px]">▼</HoldBtn>
            <span />
          </div>
          <div className="flex gap-1">
            <HoldBtn onTrigger={() => dispatch({ type: 'ADJUST_SETTING', key: 'gain', delta: settings.dbStep })} className="h-6 w-7 text-[9px] font-bold" title="gain + step">dB</HoldBtn>
            <HoldBtn onTrigger={() => dispatch({ type: 'ADJUST_SETTING', key: 'gain', delta: -settings.dbStep })} className="h-6 w-7 text-[9px]" title="gain − step">dB−</HoldBtn>
          </div>
          <button type="button" onClick={cycleStep} className={keyCls + ' w-full'}>
            STEP {settings.dbStep}dB
          </button>
        </div>
        {/* LCD */}
        <div className="flex border-2 border-[#1c1e22] bg-black p-1">
          <div>{children}</div>
          <div className="flex w-[104px] flex-col gap-0.5 bg-[#050a05] p-1">
            {EPOCH_PARAMS.map((p, i) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSel(i)}
                className="border px-1 py-0.5 text-left text-[9px] leading-tight"
                style={
                  i === sel
                    ? { background: '#22cc44', color: '#000', borderColor: '#66ff88', fontWeight: 700 }
                    : { background: '#07120a', color: '#33ee55', borderColor: '#1c5c1c' }
                }
              >
                <div>{p.label}</div>
                <div>
                  {valueOf(p).toFixed(p.key === 'gain' ? 1 : 0)}
                  {p.key === 'gain' ? 'dB' : p.unit ?? ''}
                </div>
              </button>
            ))}
            <div className="mt-auto px-1 text-[8px] text-[#33ee55]">REJ {settings.reject.toFixed(0)}%</div>
          </div>
        </div>
        {/* F keys */}
        <div className="flex w-[62px] flex-col justify-center gap-1.5">
          {fkeys.map((f) => (
            <button key={f.cap} type="button" onClick={f.onClick} className={keyCls + ' w-full'}>
              <span className="font-bold">{f.cap}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>
      {/* bottom P row */}
      <div className="mt-2 flex items-center justify-center gap-1">
        <span className="mr-2 text-[9px] font-bold tracking-widest text-[#c8c8c8]">EPOCH-SIM 600</span>
        {pkeys.map((p) => (
          <button key={p.cap} type="button" onClick={p.onClick ?? undefined} disabled={!p.onClick} className={keyCls + ' w-11 disabled:opacity-40'}>
            <span className="font-bold">{p.cap}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* ---------- AUT strip chart ---------- */

function StripChart({ scan, gate, dispatch }) {
  const CW = 500
  const CH = 78
  const [x0, x1] = scan.span
  const xOf = (x) => ((x - x0) / Math.max(1, x1 - x0)) * CW
  const yOf = (a) => CH - (Math.min(a, 110) / 110) * CH
  const segs = []
  for (let i = 1; i < scan.data.length; i++) {
    const a = scan.data[i - 1]
    const b = scan.data[i]
    segs.push(
      <line
        key={i}
        x1={xOf(a.x)}
        y1={yOf(a.amp)}
        x2={xOf(b.x)}
        y2={yOf(b.amp)}
        stroke={a.amp > gate.level || b.amp > gate.level ? '#dd0000' : '#007700'}
        strokeWidth={1.4}
      />,
    )
  }
  const last = scan.data[scan.data.length - 1]
  const spanBtn = (di0, di1) =>
    dispatch({ type: 'SCAN_SPAN', span: [Math.max(4, Math.min(x0 + di0, x1 - 20)), Math.min(296, Math.max(x1 + di1, x0 + 20))] })
  return (
    <div className="bg-win-gray p-1">
      <div className="mb-0.5 flex items-center gap-1 text-[10px]">
        <span className="font-bold">AUT STRIP CHART (자동 주사)</span>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_START' })} disabled={scan.running} className="bevel-out px-1.5 text-[9px] font-bold disabled:embossed">START</button>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_STOP' })} disabled={!scan.running} className="bevel-out px-1.5 text-[9px] disabled:embossed">STOP</button>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_RESET' })} className="bevel-out px-1.5 text-[9px]">RESET</button>
        <span className="ml-1">
          span {x0}–{x1}mm
        </span>
        <HoldBtn onTrigger={() => spanBtn(-10, 0)} className="h-4 w-4 text-[7px]">◀</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(10, 0)} className="h-4 w-4 text-[7px]">▶</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(0, -10)} className="h-4 w-4 text-[7px]">◀</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(0, 10)} className="h-4 w-4 text-[7px]">▶</HoldBtn>
        <span className="ml-auto">{scan.data.length} pts</span>
      </div>
      <div className="sunken-white overflow-hidden" style={{ background: '#f8f8f0' }}>
        <svg width="100%" viewBox={'0 0 ' + CW + ' ' + CH} style={{ display: 'block' }}>
          <line x1={0} y1={yOf(gate.level)} x2={CW} y2={yOf(gate.level)} stroke="#dd0000" strokeWidth={0.8} strokeDasharray="4 3" />
          {segs}
          {last && <line x1={xOf(last.x)} y1={0} x2={xOf(last.x)} y2={CH} stroke="#0000ff" strokeWidth={1} />}
        </svg>
      </div>
    </div>
  )
}

/* ---------- AUTO CAL dialog (EPOCH) ---------- */

function AutoCalDialog({ readout, settings, dispatch, onClose }) {
  const { pos, handlers } = useDragWindow({ x: 120, y: 60 })
  const [ref1, setRef1] = useState(25)
  const [ref2, setRef2] = useState(50)
  const [m1, setM1] = useState(null)
  const [m2, setM2] = useState(null)
  const [result, setResult] = useState(null)
  const capture = (setter) => {
    if (readout && readout.peak) setter(readout.s)
  }
  const apply = () => {
    if (m1 == null || m2 == null) return
    const zeroErr = m1 - ref1
    const spanErr = m2 - m1 - (ref2 - ref1)
    const newZero = Math.round((settings.probeZero + zeroErr) * 100) / 100
    dispatch({ type: 'SET_SETTING', key: 'probeZero', value: newZero })
    setResult(
      'ZERO set to ' + newZero.toFixed(2) + ' mm (shift ' + (zeroErr >= 0 ? '+' : '') + zeroErr.toFixed(2) +
        ').  Span error ' + (spanErr >= 0 ? '+' : '') + spanErr.toFixed(2) + ' mm — check RANGE if large.',
    )
  }
  const num = (v, set) => (
    <input
      type="number"
      value={v}
      onChange={(e) => set(Number(e.target.value))}
      className="sunken-white w-14 px-1 text-[11px]"
    />
  )
  return (
    <div className="absolute z-50 w-[300px]" style={{ left: pos.x, top: pos.y }}>
      <div className="bevel-out">
        <div {...handlers} className="flex cursor-move touch-none items-center bg-[linear-gradient(90deg,#000080,#1084d0)] px-1.5 py-0.5 text-[11px] font-bold text-white">
          AUTO CAL (자동 교정)
          <button type="button" onClick={onClose} className="bevel-out ml-auto h-[15px] w-[17px] text-[9px] leading-none text-black">✕</button>
        </div>
        <div className="space-y-1.5 p-2 text-[11px]">
          <p>Gate echo 1, capture. Gate echo 2, capture. Then Apply — the computed probe zero is set automatically.</p>
          <div className="flex items-center gap-1">
            Ref 1 {num(ref1, setRef1)} mm
            <button type="button" onClick={() => capture(setM1)} className="bevel-out px-1.5 text-[10px] font-bold">Capture 1</button>
            <span className="text-[#000080]">{m1 != null ? m1.toFixed(1) + 'mm' : '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            Ref 2 {num(ref2, setRef2)} mm
            <button type="button" onClick={() => capture(setM2)} className="bevel-out px-1.5 text-[10px] font-bold">Capture 2</button>
            <span className="text-[#000080]">{m2 != null ? m2.toFixed(1) + 'mm' : '—'}</span>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={apply} disabled={m1 == null || m2 == null} className="bevel-out px-2 py-0.5 text-[11px] font-bold disabled:embossed">Apply</button>
            <button type="button" onClick={onClose} className="bevel-out px-2 py-0.5 text-[11px]">OK</button>
          </div>
          {result && <p className="text-defect-red">{result}</p>}
        </div>
      </div>
    </div>
  )
}

/* ---------- floating instrument window ---------- */

export default function ControlPanel({ state, dispatch, readout, tofdMode, autMode, onRecordDac, onAddMarker, children }) {
  const { pos, handlers } = useDragWindow({ x: 22, y: 8 })
  const [autoCal, setAutoCal] = useState(false)
  const epoch = state.instrument === 'epoch'
  return (
    <div className="absolute z-40 select-none" style={{ left: pos.x, top: pos.y }}>
      <div className="bevel-out shadow-[4px_4px_8px_rgba(0,0,0,0.35)]">
        <div
          {...handlers}
          className="flex cursor-move touch-none items-center gap-2 bg-[linear-gradient(90deg,#000080,#1084d0)] px-2 py-0.5 text-[11px] font-bold text-white"
        >
          {epoch ? 'EPOCH-SIM 600 — Digital Flaw Detector (디지털 탐상기)' : 'USK-7 SIM — Flaw Detector (탐상기)'}
          <span className="ml-auto text-[9px] font-normal opacity-75">drag to move</span>
        </div>
        {epoch ? (
          <EpochBody
            state={state}
            dispatch={dispatch}
            tofdMode={tofdMode}
            onRecordDac={onRecordDac}
            onAddMarker={onAddMarker}
            onOpenAutoCal={() => setAutoCal(true)}
          >
            {children}
          </EpochBody>
        ) : (
          <div className="flex bg-[#101010]">
            <div className="p-1">{children}</div>
            <Usk7Panel state={state} dispatch={dispatch} tofdMode={tofdMode} onRecordDac={onRecordDac} onAddMarker={onAddMarker} />
          </div>
        )}
        {autMode && <StripChart scan={state.scan} gate={state.gate} dispatch={dispatch} />}
      </div>
      {autoCal && (
        <AutoCalDialog readout={readout} settings={state.settings} dispatch={dispatch} onClose={() => setAutoCal(false)} />
      )}
    </div>
  )
}
