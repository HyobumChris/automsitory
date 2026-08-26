function contextInfo({ specimen, specimenParams, probeDir, thickness, modeId }) {
  if (modeId === 'tofd') return 'TOFD: lateral wave, tip diffraction, backwall — click the A-scan to measure depth'
  if (modeId === 'aut') return 'AUT: press START on the strip chart to run the automated scan (자동 주사)'
  switch (specimen.type) {
    case 'v1':
      return (specimenParams.face ?? specimen.defaultFace) === 'side'
        ? '100mm Radius. Echoes 100, 200, 300 etc'
        : '25mm thickness. Echoes 25, 50, 75, 100'
    case 'v2':
      return probeDir > 0 ? '50mm Radius. Echoes 50, 125, 200' : '25mm Radius. Echoes 25, 100, 175'
    case 'plate':
      return thickness + 'mm plate. Backwall echoes ' + thickness + ', ' + 2 * thickness + ', ' + 3 * thickness + ' etc'
    case 'weld':
      return 'Single-V weld, t=' + thickness + 'mm. Half skip / full skip (반사법)'
    case 'tky':
      return 'TKY joint. Scan towards the brace toe weld line'
    default:
      return ''
  }
}

export default function ReadoutBar({ state, specimen, probe, thickness, readout, tofdInfo }) {
  const s = state.settings
  const panel = 'sunken flex items-center px-2 whitespace-nowrap'
  let echoTxt = 'no echo in gate'
  if (tofdInfo) {
    echoTxt =
      '2S=' + 2 * tofdInfo.sHalf + 'mm' +
      (tofdInfo.cursorUs != null
        ? '  t=' + tofdInfo.cursorUs.toFixed(2) + 'µs  d=' + (tofdInfo.depth ?? 0).toFixed(1) + 'mm'
        : '  click A-scan to place cursor')
  } else if (readout && readout.peak) {
    echoTxt =
      's=' + readout.s.toFixed(1) + 'mm  SD=' + readout.surfaceDist.toFixed(1) + 'mm  D=' + readout.depth.toFixed(1) +
      'mm  Leg ' + readout.leg + '  ' + readout.amp.toFixed(0) + '%' +
      (readout.dbToDac != null ? '  ' + (readout.dbToDac >= 0 ? '+' : '') + readout.dbToDac.toFixed(1) + 'dB DAC' : '')
  }
  return (
    <div className="flex items-stretch gap-1 border-t border-white bg-win-gray px-1 py-0.5 text-[11px] text-black">
      <div className={panel}>Pos: {state.probeX.toFixed(0)} mm</div>
      <div className={panel}>Range {s.range.toFixed(1)}{state.modeId === 'tofd' ? 'µs' : 'mm'}</div>
      <div className={panel}>AMP= {s.gain.toFixed(0)}dB</div>
      <div className={panel}>{echoTxt}</div>
      <div className={panel + ' min-w-0 flex-1 overflow-hidden'}>LEFT mouse button/drag to move the UT Probe</div>
      <div className={panel + ' max-w-[360px] overflow-hidden'}>
        {contextInfo({ specimen, specimenParams: state.specimenParams, probeDir: state.probeDir, thickness, modeId: state.modeId, probe })}
      </div>
    </div>
  )
}
