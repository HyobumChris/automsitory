function Cell({ label, labelKo, value, unit, accent }) {
  return (
    <div className="flex min-w-[104px] flex-1 flex-col items-center rounded-lg border border-marine-600 bg-marine-800 px-2 py-1.5">
      <span className="text-[9px] uppercase tracking-wider text-slate-500">
        {label} <span className="normal-case">({labelKo})</span>
      </span>
      <span className={'font-mono text-base font-semibold ' + (accent ?? 'text-crt-green')}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-slate-400">{unit}</span>}
      </span>
    </div>
  )
}

export default function ReadoutBar({ readout, gateOn }) {
  const has = readout && readout.peak
  const fmt = (v, d = 1) => (has ? v.toFixed(d) : '--')
  return (
    <div className="flex flex-wrap gap-2">
      <Cell label="Beam path s" labelKo="빔 경로" value={fmt(has ? readout.s : 0)} unit="mm" />
      <Cell label="Surface dist" labelKo="표면 거리" value={fmt(has ? readout.surfaceDist : 0)} unit="mm" />
      <Cell label="Depth" labelKo="깊이" value={fmt(has ? readout.depth : 0)} unit="mm" />
      <Cell
        label="Leg"
        labelKo="스킵"
        value={has ? (readout.leg === 1 ? '1st' : readout.leg === 2 ? '2nd' : readout.leg + 'th') : '--'}
        accent="text-cyan-glow"
      />
      <Cell
        label={gateOn ? 'Gate peak' : 'Max echo'}
        labelKo="최대 에코"
        value={fmt(has ? readout.amp : 0, 0)}
        unit="%FSH"
        accent="text-amber-glow"
      />
      <Cell
        label="dB to DAC"
        labelKo="DAC 대비"
        value={has && readout.dbToDac != null ? (readout.dbToDac >= 0 ? '+' : '') + readout.dbToDac.toFixed(1) : '--'}
        unit="dB"
        accent="text-cyan-glow"
      />
    </div>
  )
}
