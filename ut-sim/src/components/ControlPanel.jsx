import { useEffect, useRef, useState } from 'react'
import { RANGE_STEPS, GAIN_STEPS } from '../lib/ultrasound.js'
import WinWindow from './WinWindow.jsx'

/* ---------- shared helpers ---------- */

function HoldBtn({ onTrigger, children, className = '', title, disabled }) {
  const timers = useRef({ t: null, i: null })
  const stop = () => {
    clearTimeout(timers.current.t)
    clearInterval(timers.current.i)
  }
  const start = () => {
    if (disabled) return
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
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      className={'flex items-center justify-center ' + className}
    >
      {children}
    </button>
  )
}

/** Machined rotary knob: knurled edge, brushed face, raised dome, pointer. */
function Knob({ value, min, max, step = 1, onDelta, red = false, size = 46, skirt = false }) {
  const last = useRef(null)
  const frac = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const angle = -135 + frac * 270
  const face = red
    ? 'conic-gradient(from 30deg, #8a3038, #5b2026 25%, #8a3038 50%, #5b2026 75%, #8a3038)'
    : 'conic-gradient(from 30deg, #4a525b, #2b323a 25%, #4a525b 50%, #2b323a 75%, #4a525b)'
  const dome = red
    ? 'radial-gradient(circle at 40% 32%, #a04a52, #4a181d)'
    : 'radial-gradient(circle at 40% 32%, #5d666f, #22282f)'
  return (
    <div
      className="relative touch-none"
      style={{ width: size, height: size, cursor: 'ns-resize', filter: 'drop-shadow(0 3px 3px rgb(0 0 0 / 0.55))' }}
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
      {skirt && (
        <div
          className="absolute rounded-full"
          style={{ inset: -5, background: 'radial-gradient(circle at 50% 35%, #262d34, #0e1216)', border: '1px solid #05070a' }}
        />
      )}
      {/* knurled edge ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: 'repeating-conic-gradient(#39424b 0deg 7deg, #1c2229 7deg 14deg)', border: '1px solid #0a0e13' }}
      />
      {/* brushed face */}
      <div
        className="absolute rounded-full"
        style={{
          inset: size * 0.12,
          background: face,
          boxShadow: 'inset 0 1px 2px rgb(255 255 255 / 0.25), inset 0 -2px 3px rgb(0 0 0 / 0.55)',
        }}
      />
      {/* raised dome centre */}
      <div
        className="absolute rounded-full"
        style={{ inset: size * 0.32, background: dome, boxShadow: '0 1px 2px rgb(0 0 0 / 0.5)' }}
      />
      {/* position pointer */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: 2.5,
          height: size * 0.42,
          background: '#eef3f5',
          borderRadius: 2,
          transformOrigin: '50% 0%',
          transform: 'translate(-50%,0) rotate(' + (angle + 180) + 'deg)',
          boxShadow: '0 0 2px rgb(0 0 0 / 0.7)',
        }}
      />
    </div>
  )
}

function ArrowPair({ onDec, onInc }) {
  return (
    <div className="flex gap-0.5">
      <HoldBtn onTrigger={onDec} className="rkey h-4 w-5 text-[8px]">◀</HoldBtn>
      <HoldBtn onTrigger={onInc} className="rkey h-4 w-5 text-[8px]">▶</HoldBtn>
    </div>
  )
}

/** Small round indicator lamp. */
function Lamp({ on, color = '#3fb27f', label }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span
        className="block h-2.5 w-2.5 rounded-full"
        style={{
          background: on
            ? 'radial-gradient(circle at 40% 35%, rgb(255 255 255 / 0.7), ' + color + ' 45%)'
            : 'radial-gradient(circle at 40% 35%, #333a41, #14181d)',
          boxShadow: on ? '0 0 6px ' + color : 'inset 0 1px 2px rgb(0 0 0 / 0.8)',
          border: '1px solid #05070a',
        }}
      />
      <span className="engraved text-[7px] uppercase tracking-wider">{label}</span>
    </div>
  )
}

/** Vertical coarse-range lever: slotted track with a raised sliding handle. */
function CoarseLever({ value, onSet }) {
  const idx = RANGE_STEPS.indexOf(value)
  const n = RANGE_STEPS.length
  const H = 108
  return (
    <div className="flex items-center gap-1">
      <div className="lever-track relative w-6 shrink-0" style={{ height: H }}>
        {idx >= 0 && (
          <div
            className="lever-handle absolute h-[15px] transition-[top] duration-100"
            style={{ left: -4, right: -4, top: 4 + (n - 1 - idx) * ((H - 23) / (n - 1)) }}
          />
        )}
        {RANGE_STEPS.map((r, i) => (
          <button
            key={r}
            type="button"
            onClick={() => onSet(r)}
            className="absolute left-0 right-0"
            style={{ top: (n - 1 - i) * (H / n), height: H / n }}
            title={r + ' mm'}
          />
        ))}
      </div>
      <div className="flex flex-col-reverse justify-between py-0.5" style={{ height: H }}>
        {RANGE_STEPS.map((r) => (
          <span key={r} className={'font-mono text-[8px] leading-none ' + (value === r ? 'text-[#3ce6ff]' : 'text-knob-green/70')}>
            {r}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- USK-7 analogue control field ---------- */

function Usk7Panel({ state, dispatch, tofdMode, onRecordDac, onAddMarker }) {
  const { settings, gate, dacPoints, beamMarkers, tofdS } = state
  const adj = (key, delta) => dispatch({ type: 'ADJUST_SETTING', key, delta })
  const lbl = 'engraved text-[8.5px] font-medium uppercase tracking-[0.08em]'
  const val = 'font-mono text-[10px] text-knob-green'
  const key = 'rkey px-1.5 py-0.5 font-mono text-[8px]'
  return (
    <div
      className="flex w-[272px] shrink-0 flex-col gap-2.5 border-l border-black/70 p-2.5"
      style={{
        background: 'linear-gradient(180deg,#182027,#10161c 55%,#0b0f14)',
        boxShadow: 'inset 1px 0 0 rgb(255 255 255 / 0.05)',
      }}
    >
      {/* RANGE / coarse lever / X-SHIFT */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>Range</span>
          <ArrowPair onDec={() => adj('range', -5)} onInc={() => adj('range', 5)} />
          <Knob value={settings.range} min={4} max={1000} step={1} onDelta={(d) => adj('range', d)} />
          <span className={val}>{settings.range.toFixed(0)}{tofdMode ? 'µs' : 'mm'}</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>Coarse</span>
          <CoarseLever value={settings.range} onSet={(r) => dispatch({ type: 'SET_SETTING', key: 'range', value: r })} />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>X-Shift</span>
          <ArrowPair onDec={() => adj('xShift', -1)} onInc={() => adj('xShift', 1)} />
          <Knob value={settings.xShift} min={-50} max={500} step={0.5} onDelta={(d) => adj('xShift', d)} />
          <span className={val}>{settings.xShift.toFixed(1)}</span>
        </div>
      </div>

      {/* AMP red knob + dB step keys + suppression/zero */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-1">
          <span className={lbl}>Amp =</span>
          <ArrowPair onDec={() => adj('gain', -settings.dbStep)} onInc={() => adj('gain', settings.dbStep)} />
          <Knob value={settings.gain} min={0} max={110} step={settings.dbStep} onDelta={(d) => adj('gain', d)} red size={54} skirt />
          <span className={val}>{settings.gain.toFixed(1)}dB</span>
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <span className={lbl}>dB Step</span>
          <div className="flex gap-1">
            {GAIN_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => dispatch({ type: 'SET_SETTING', key: 'dbStep', value: s })}
                className={key + (settings.dbStep === s ? ' pressed text-[#3ce6ff]' : '')}
              >
                {s}
              </button>
            ))}
          </div>
          <span className={lbl}>Suppression</span>
          <div className="flex items-center gap-1.5">
            <ArrowPair onDec={() => adj('reject', -2)} onInc={() => adj('reject', 2)} />
            <span className={val}>{settings.reject.toFixed(0)}%</span>
          </div>
          <span className={lbl}>Zero</span>
          <div className="flex items-center gap-1.5">
            <ArrowPair onDec={() => adj('probeZero', -0.5)} onInc={() => adj('probeZero', 0.5)} />
            <span className={val}>{settings.probeZero.toFixed(1)}</span>
          </div>
        </div>
      </div>

      {/* GATE (inset field) */}
      <div className="rounded border border-black/70 bg-[#0a0e13] p-1.5 shadow-[inset_0_2px_4px_rgb(0_0_0/0.7)]">
        <div className="flex items-center justify-between">
          <span className={lbl}>Gate</span>
          <button
            type="button"
            onClick={() => dispatch({ type: 'SET_GATE', patch: { on: !gate.on } })}
            className={key + (gate.on ? ' pressed text-amber' : '')}
          >
            {gate.on ? 'ON' : 'OFF'}
          </button>
        </div>
        {['start', 'width', 'level'].map((k) => (
          <div key={k} className="mt-0.5 flex items-center justify-between">
            <span className="engraved w-10 text-[8px] uppercase">{k}</span>
            <span className="font-mono text-[9px] text-knob-green">
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

      {tofdMode && (
        <div className="flex items-center justify-between">
          <span className={lbl}>TOFD PCS (2S)</span>
          <span className={val}>{2 * tofdS}mm</span>
          <ArrowPair onDec={() => dispatch({ type: 'SET_TOFD_S', delta: -1 })} onInc={() => dispatch({ type: 'SET_TOFD_S', delta: 1 })} />
        </div>
      )}

      {/* lamps, record keys, nameplate */}
      <div className="mt-auto flex items-end gap-2">
        <div className="flex gap-2">
          <Lamp on label="Pwr" />
          <Lamp on={gate.on} color="#e8a13c" label="Gate" />
          <Lamp on={settings.tcg} color="#3ce6ff" label="TCG" />
        </div>
        <div className="ml-auto grid grid-cols-2 gap-1">
          <button type="button" onClick={onRecordDac} className={key}>DAC PT {dacPoints.length}</button>
          <button type="button" onClick={() => dispatch({ type: 'CLEAR_DAC' })} className={key}>CLR DAC</button>
          <button type="button" onClick={onAddMarker} className={key}>MARK {beamMarkers.length}</button>
          <button type="button" onClick={() => dispatch({ type: 'CLEAR_MARKERS' })} className={key}>CLR MK</button>
          <button
            type="button"
            disabled={dacPoints.length < 2}
            onClick={() => dispatch({ type: 'SET_SETTING', key: 'tcg', value: !settings.tcg })}
            className={key + ' col-span-2' + (settings.tcg ? ' pressed text-[#3ce6ff]' : '')}
            title="Time-corrected gain: flattens DAC reference echoes to 80%"
          >
            TCG {settings.tcg ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div className="flex justify-end">
        <span className="nameplate px-2 py-0.5 font-mono text-[8px] tracking-[0.18em] text-[#cfd6dc]">USK-7 SIM</span>
      </div>
    </div>
  )
}

/* ---------- EPOCH handheld skin ---------- */

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
    {
      cap: 'P6',
      label: tofdMode ? 'PCS −' : settings.tcg ? 'TCG ON' : 'TCG OFF',
      onClick: tofdMode
        ? () => dispatch({ type: 'SET_TOFD_S', delta: -1 })
        : state.dacPoints.length >= 2
          ? () => dispatch({ type: 'SET_SETTING', key: 'tcg', value: !settings.tcg })
          : null,
    },
    { cap: 'P7', label: tofdMode ? 'PCS +' : '—', onClick: tofdMode ? () => dispatch({ type: 'SET_TOFD_S', delta: 1 }) : null },
  ]
  const keyCls = 'rkey flex flex-col items-center justify-center px-1 text-[8px] leading-tight'
  const padBtn = 'absolute flex items-center justify-center text-[10px] text-white/85'
  return (
    <div className="bg-[#0b0e12] p-2">
      <div className="epoch-body relative px-5 pb-3 pt-3">
        {/* moulded side grips */}
        <div className="grip absolute bottom-8 left-1 top-8 w-2" />
        <div className="grip absolute bottom-8 right-1 top-8 w-2" />
        <div className="flex gap-2.5">
          {/* left cluster: D-pad + dB keys */}
          <div className="flex w-[96px] flex-col items-center justify-center gap-2.5">
            <div className="relative h-[86px] w-[86px]">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle at 45% 38%, #454d56, #22282f 68%, #14181d)',
                  border: '1px solid #0a0d11',
                  boxShadow: '0 3px 5px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.15)',
                }}
              />
              <div
                className="absolute bottom-1.5 left-1/2 top-1.5 w-7 -translate-x-1/2 rounded-full"
                style={{ background: 'linear-gradient(180deg,#3c444d,#262d34)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.12)' }}
              />
              <div
                className="absolute left-1.5 right-1.5 top-1/2 h-7 -translate-y-1/2 rounded-full"
                style={{ background: 'linear-gradient(90deg,#343c45,#2a3138 50%,#343c45)' }}
              />
              <HoldBtn onTrigger={() => adjust(param, 1)} className={padBtn + ' left-1/2 top-0 h-7 w-8 -translate-x-1/2'} title="increase">▲</HoldBtn>
              <HoldBtn onTrigger={() => adjust(param, -1)} className={padBtn + ' bottom-0 left-1/2 h-7 w-8 -translate-x-1/2'} title="decrease">▼</HoldBtn>
              <button type="button" onClick={() => setSel((sel + EPOCH_PARAMS.length - 1) % EPOCH_PARAMS.length)} className={padBtn + ' left-0 top-1/2 h-8 w-7 -translate-y-1/2'}>◀</button>
              <button type="button" onClick={() => setSel((sel + 1) % EPOCH_PARAMS.length)} className={padBtn + ' right-0 top-1/2 h-8 w-7 -translate-y-1/2'}>▶</button>
              <span
                className="absolute left-1/2 top-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[6.5px] text-white/70"
                style={{
                  background: 'radial-gradient(circle at 42% 35%, #59626c, #262d34)',
                  border: '1px solid #10151a',
                  boxShadow: '0 1px 2px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.25)',
                }}
              >
                SEL
              </span>
            </div>
            <div className="flex gap-1">
              <HoldBtn onTrigger={() => dispatch({ type: 'ADJUST_SETTING', key: 'gain', delta: settings.dbStep })} className="rkey h-6 w-8 text-[9px] font-bold" title="gain + step">dB</HoldBtn>
              <HoldBtn onTrigger={() => dispatch({ type: 'ADJUST_SETTING', key: 'gain', delta: -settings.dbStep })} className="rkey h-6 w-8 text-[9px]" title="gain − step">dB−</HoldBtn>
            </div>
            <button type="button" onClick={cycleStep} className={keyCls + ' w-full py-1'}>
              STEP {settings.dbStep}dB
            </button>
          </div>
          {/* LCD in a raised bezel */}
          <div className="usk-bezel relative shrink-0 rounded-lg p-1.5">
            <div className="flex">
              <div>{children}</div>
              <div className="flex w-[104px] flex-col gap-0.5 bg-[#080c11] p-1">
                {EPOCH_PARAMS.map((p, i) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setSel(i)}
                    className="rounded border px-1.5 py-0.5 text-left font-mono text-[9px] leading-tight transition-colors duration-75"
                    style={
                      i === sel
                        ? { background: '#0e9fbf', color: '#fff', borderColor: '#3ce6ff', fontWeight: 600 }
                        : { background: '#0b1016', color: '#37e05c', borderColor: '#1d252e' }
                    }
                  >
                    <div>{p.label}</div>
                    <div>
                      {valueOf(p).toFixed(p.key === 'gain' ? 1 : 0)}
                      {p.key === 'gain' ? 'dB' : p.unit ?? ''}
                    </div>
                  </button>
                ))}
                <div className="mt-auto px-1 font-mono text-[8px] text-[#37e05c]">REJ {settings.reject.toFixed(0)}%</div>
              </div>
            </div>
            <div className="glass-glare" />
          </div>
          {/* F keys */}
          <div className="flex w-[64px] flex-col justify-center gap-1.5">
            {fkeys.map((f) => (
              <button key={f.cap} type="button" onClick={f.onClick} className={keyCls + ' h-7 w-full'}>
                <span className="font-bold">{f.cap}</span>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>
        {/* bottom P row + power LED + logo */}
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          <Lamp on label="Pwr" />
          <span className="mx-1 font-mono text-[9px] tracking-widest text-white/55">EPOCH-SIM 600</span>
          {pkeys.map((p) => (
            <button key={p.cap} type="button" onClick={p.onClick ?? undefined} disabled={!p.onClick} className={keyCls + ' h-7 w-11'}>
              <span className="font-bold">{p.cap}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
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
        stroke={a.amp > gate.level || b.amp > gate.level ? '#e5484d' : '#3fb27f'}
        strokeWidth={1.4}
      />,
    )
  }
  const last = scan.data[scan.data.length - 1]
  const spanBtn = (di0, di1) =>
    dispatch({ type: 'SCAN_SPAN', span: [Math.max(4, Math.min(x0 + di0, x1 - 20)), Math.min(296, Math.max(x1 + di1, x0 + 20))] })
  return (
    <div className="border-t border-hairline bg-panel p-1.5">
      <div className="mb-0.5 flex items-center gap-1 text-[10px]">
        <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted">AUT Strip Chart (자동 주사)</span>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_START' })} disabled={scan.running} className="bevel-out px-1.5 text-[9px] font-semibold disabled:embossed">START</button>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_STOP' })} disabled={!scan.running} className="bevel-out px-1.5 text-[9px] disabled:embossed">STOP</button>
        <button type="button" onClick={() => dispatch({ type: 'SCAN_RESET' })} className="bevel-out px-1.5 text-[9px]">RESET</button>
        <span className="ml-1 font-mono">
          span {x0}–{x1}mm
        </span>
        <HoldBtn onTrigger={() => spanBtn(-10, 0)} className="bevel-out h-4 w-4 text-[7px]">◀</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(10, 0)} className="bevel-out h-4 w-4 text-[7px]">▶</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(0, -10)} className="bevel-out h-4 w-4 text-[7px]">◀</HoldBtn>
        <HoldBtn onTrigger={() => spanBtn(0, 10)} className="bevel-out h-4 w-4 text-[7px]">▶</HoldBtn>
        <span className="ml-auto font-mono text-muted">{scan.data.length} pts</span>
      </div>
      <div className="overflow-hidden rounded border border-hairline bg-white">
        <svg width="100%" viewBox={'0 0 ' + CW + ' ' + CH} style={{ display: 'block' }}>
          <line x1={0} y1={yOf(gate.level)} x2={CW} y2={yOf(gate.level)} stroke="#e8a13c" strokeWidth={0.8} strokeDasharray="4 3" />
          {segs}
          {last && <line x1={xOf(last.x)} y1={0} x2={xOf(last.x)} y2={CH} stroke="#0e9fbf" strokeWidth={1} />}
        </svg>
      </div>
    </div>
  )
}

/* ---------- AUTO CAL dialog (EPOCH) ---------- */

function AutoCalDialog({ readout, settings, dispatch, onClose }) {
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
    <WinWindow title="AUTO CAL (자동 교정)" initial={{ x: 120, y: 60 }} width={300} onClose={onClose}>
      <div className="space-y-1.5 p-2 text-[11px]">
          <p>Gate echo 1, capture. Gate echo 2, capture. Then Apply — the computed probe zero is set automatically.</p>
          <div className="flex items-center gap-1">
            Ref 1 {num(ref1, setRef1)} mm
            <button type="button" onClick={() => capture(setM1)} className="bevel-out px-1.5 text-[10px] font-medium">Capture 1</button>
            <span className="font-mono text-accent">{m1 != null ? m1.toFixed(1) + 'mm' : '—'}</span>
          </div>
          <div className="flex items-center gap-1">
            Ref 2 {num(ref2, setRef2)} mm
            <button type="button" onClick={() => capture(setM2)} className="bevel-out px-1.5 text-[10px] font-medium">Capture 2</button>
            <span className="font-mono text-accent">{m2 != null ? m2.toFixed(1) + 'mm' : '—'}</span>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={apply} disabled={m1 == null || m2 == null} className="bevel-in px-2.5 py-0.5 text-[11px] font-semibold disabled:embossed">Apply</button>
            <button type="button" onClick={onClose} className="bevel-out px-2 py-0.5 text-[11px]">OK</button>
          </div>
          {result && <p className="text-defect-red">{result}</p>}
      </div>
    </WinWindow>
  )
}

/* ---------- floating instrument window ---------- */

export default function ControlPanel({ state, dispatch, readout, tofdMode, autMode, onRecordDac, onAddMarker, children }) {
  const [autoCal, setAutoCal] = useState(false)
  const epoch = state.instrument === 'epoch'
  const vw = typeof window === 'undefined' ? 1280 : window.innerWidth
  const vh = typeof window === 'undefined' ? 900 : window.innerHeight
  return (
    <>
      <WinWindow
        title={
          <>
            {epoch ? 'EPOCH-SIM 600 — Digital Flaw Detector (디지털 탐상기)' : 'USK-7 SIM — Flaw Detector (탐상기)'}
            <span className="ml-auto text-[9px] font-normal opacity-75">drag to move</span>
          </>
        }
        initial={{ x: 12, y: Math.max(6, vh - 700) }}
        dockable
        initialDocked={vw < 900}
        className="z-40"
      >
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
          <div className="usk-body flex">
            <div className="shrink-0 p-2.5">
              <div className="usk-bezel relative rounded-xl p-2">
                {children}
                <div className="glass-glare" />
              </div>
            </div>
            <Usk7Panel state={state} dispatch={dispatch} tofdMode={tofdMode} onRecordDac={onRecordDac} onAddMarker={onAddMarker} />
          </div>
        )}
        {autMode && <StripChart scan={state.scan} gate={state.gate} dispatch={dispatch} />}
      </WinWindow>
      {autoCal && (
        <AutoCalDialog readout={readout} settings={state.settings} dispatch={dispatch} onClose={() => setAutoCal(false)} />
      )}
    </>
  )
}
