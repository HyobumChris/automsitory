import { effectiveLength } from '../data/specimens.js'

function contextInfo({ specimen, specimenParams, probeDir, thickness, modeId }) {
  if (modeId === 'tofd') return 'TOFD: lateral wave, tip diffraction, backwall — click the A-scan to measure depth'
  if (modeId === 'aut') return 'AUT: press START on the strip chart to run the automated scan (자동 주사)'
  switch (specimen.type) {
    case 'v1':
      return (specimenParams.face ?? specimen.defaultFace) === 'side'
        ? '100mm Radius. Echoes 100, 200, 300 etc'
        : '25mm thickness. Echoes 25, 50, 75, 100'
    case 'v2':
      return (specimenParams.face ?? specimen.defaultFace) === 'through'
        ? '12.5mm through thickness. Echoes 12.5, 25, 37.5, 50'
        : probeDir > 0
          ? '50mm Radius. Echoes 50, 125, 200'
          : '25mm Radius. Echoes 25, 100, 175'
    case 'asme':
      return (
        'ASME block T=' + thickness + 'mm. SDH at T/4 T/2 3T/4 = ' +
        (thickness / 4).toFixed(1) + '/' + (thickness / 2).toFixed(1) + '/' + ((3 * thickness) / 4).toFixed(1) + 'mm'
      )
    case 'plate':
      return thickness + 'mm plate. Backwall echoes ' + thickness + ', ' + 2 * thickness + ', ' + 3 * thickness + ' etc'
    case 'weld':
      return 'Single-V weld, t=' + thickness + 'mm. Half skip / full skip (반사법)'
    case 'pipe': {
      const C = effectiveLength(specimen, specimenParams)
      return 'Pipe ' + (specimenParams.odIn ?? specimen.odIn) + '" OD, WT ' + thickness + 'mm. C=πD=' + C + 'mm (unrolled)'
    }
    case 'tky':
      return (
        'TKY joint. Scanning ' +
        ((specimenParams.scanSurface ?? 'main') === 'brace' ? 'BRACE t=' + thickness + 'mm' : 'main plate t=' + thickness + 'mm')
      )
    default:
      return ''
  }
}

function Chip({ label, children }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap rounded border border-white/10 bg-white/5 px-2 py-0.5">
      <span className="text-[9px] font-medium uppercase tracking-[0.06em] text-white/40">{label}</span>
      <span className="font-mono text-[11px] text-white">{children}</span>
    </div>
  )
}

export default function ReadoutBar({ state, specimen, probe, thickness, readout, tofdInfo }) {
  const s = state.settings
  const isPipe = specimen.type === 'pipe'
  let echoTxt = 'no echo in gate'
  if (tofdInfo) {
    echoTxt =
      '2S=' + 2 * tofdInfo.sHalf + 'mm' +
      (tofdInfo.cursorUs != null
        ? '  t=' + tofdInfo.cursorUs.toFixed(2) + 'µs  d=' + (tofdInfo.depth ?? 0).toFixed(1) + 'mm'
        : '  click A-scan to place cursor')
  } else if (readout && readout.peak) {
    echoTxt =
      's=' + readout.s.toFixed(1) + 'mm  SD=' + readout.surfaceDist.toFixed(1) + (isPipe ? 'mm(arc)' : 'mm') +
      '  D=' + readout.depth.toFixed(1) + 'mm  Leg ' + readout.leg + '  ' + readout.amp.toFixed(0) + '%' +
      (readout.dbToDac != null
        ? '  ' + (readout.dbToDac >= 0 ? '+' : '') + readout.dbToDac.toFixed(1) + 'dB ' + (s.tcg ? 'TCG' : 'DAC')
        : '')
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-black/40 bg-chrome px-2 py-1">
      <Chip label="Pos">
        {state.probeX.toFixed(0)} mm{isPipe ? ' / ' + effectiveLength(specimen, state.specimenParams) : ''}
      </Chip>
      <Chip label="Range">{s.range.toFixed(1)}{state.modeId === 'tofd' ? 'µs' : 'mm'}</Chip>
      <Chip label="Amp">{s.gain.toFixed(0)}dB{s.tcg ? ' TCG' : ''}</Chip>
      <Chip label="Echo">{echoTxt}</Chip>
      <span className="min-w-0 flex-1 truncate px-2 text-[10.5px] italic text-white/35">
        LEFT mouse button/drag to move the UT Probe
      </span>
      <span className="max-w-[380px] truncate text-right text-[10.5px] text-white/55">
        {contextInfo({ specimen, specimenParams: state.specimenParams, probeDir: state.probeDir, thickness, modeId: state.modeId, probe })}
      </span>
    </div>
  )
}
