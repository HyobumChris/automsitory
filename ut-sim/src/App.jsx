import { useCallback, useEffect, useState } from 'react'
import useSimulator, { MODES } from './hooks/useSimulator.js'
import AScanDisplay from './components/AScanDisplay.jsx'
import SpecimenView from './components/SpecimenView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import ProbeSelector from './components/ProbeSelector.jsx'
import SpecimenSelector from './components/SpecimenSelector.jsx'
import DefectEditor from './components/DefectEditor.jsx'
import ReadoutBar from './components/ReadoutBar.jsx'
import InfoPanel from './components/InfoPanel.jsx'
import Pipe3DWindow from './components/Pipe3DWindow.jsx'
import RadiographWindow from './components/RadiographWindow.jsx'

/* ---------- toolbar glyphs (small colored icons) ---------- */
const GLYPHS = {
  probe0: (
    <svg width="16" height="11"><rect x="4" y="1" width="8" height="9" fill="#0000c0" stroke="#000" strokeWidth="0.6" /></svg>
  ),
  wedge: (
    <svg width="16" height="11"><polygon points="2,10 14,10 14,2 6,2" fill="#00a000" stroke="#000" strokeWidth="0.6" /></svg>
  ),
  block: (
    <svg width="16" height="11"><rect x="2" y="3" width="12" height="7" fill="#a8a8a8" stroke="#000" strokeWidth="0.6" /><line x1="2" y1="3" x2="5" y2="1" stroke="#000" strokeWidth="0.6" /><line x1="14" y1="3" x2="16" y2="1" stroke="#000" strokeWidth="0.6" /></svg>
  ),
  plot: (
    <svg width="16" height="11"><polyline points="1,10 4,10 5,2 6,10 9,10 10,5 11,10 15,10" fill="none" stroke="#008080" strokeWidth="1" /></svg>
  ),
  damp: (
    <svg width="16" height="11"><polyline points="1,6 4,2 7,9 10,4 13,7 15,5" fill="none" stroke="#b8860b" strokeWidth="1" /></svg>
  ),
  size: (
    <svg width="16" height="11"><line x1="1" y1="6" x2="15" y2="6" stroke="#dd0000" strokeWidth="1" /><polygon points="1,6 4,4 4,8" fill="#dd0000" /><polygon points="15,6 12,4 12,8" fill="#dd0000" /></svg>
  ),
  defect: (
    <svg width="16" height="11"><ellipse cx="8" cy="6" rx="5" ry="3" fill="#dd0000" /></svg>
  ),
  hide: (
    <svg width="16" height="11"><ellipse cx="8" cy="6" rx="5" ry="3" fill="#a8a8a8" /><line x1="2" y1="10" x2="14" y2="2" stroke="#dd0000" strokeWidth="1.4" /></svg>
  ),
  beam: (
    <svg width="16" height="11"><line x1="2" y1="1" x2="14" y2="10" stroke="#0000ff" strokeWidth="1" /><line x1="2" y1="1" x2="10" y2="10" stroke="#8888ff" strokeWidth="0.7" strokeDasharray="1.5 1" /><line x1="2" y1="1" x2="15" y2="6" stroke="#8888ff" strokeWidth="0.7" strokeDasharray="1.5 1" /></svg>
  ),
  rad: (
    <svg width="16" height="11"><rect x="1" y="2" width="14" height="7" fill="#1a1a1a" stroke="#555" strokeWidth="0.6" /><rect x="3" y="4" width="10" height="3" fill="#3c3c3c" /><circle cx="6" cy="5.5" r="0.8" fill="#000" /><line x1="9" y1="5.5" x2="12" y2="5.5" stroke="#000" strokeWidth="0.8" /></svg>
  ),
  pipe: (
    <svg width="16" height="11"><circle cx="8" cy="6" r="4.5" fill="none" stroke="#555" strokeWidth="1" /><circle cx="8" cy="6" r="2" fill="none" stroke="#555" strokeWidth="0.8" /></svg>
  ),
  tky: (
    <svg width="16" height="11"><line x1="1" y1="9" x2="15" y2="9" stroke="#000" strokeWidth="1.6" /><line x1="8" y1="9" x2="12" y2="1" stroke="#000" strokeWidth="1.6" /></svg>
  ),
  tofd: (
    <svg width="16" height="11"><polygon points="1,4 4,1 4,4" fill="#00a000" /><polygon points="15,4 12,1 12,4" fill="#00a000" /><polyline points="2,4 8,9 14,4" fill="none" stroke="#0000ff" strokeWidth="0.9" /></svg>
  ),
  epoch: (
    <svg width="16" height="11"><rect x="2" y="1" width="12" height="9" rx="1.5" fill="#3a3d42" stroke="#000" strokeWidth="0.5" /><rect x="4" y="3" width="8" height="5" fill="#050a05" /><polyline points="4,7 6,7 7,4 8,7 10,7 11,5.5 12,7" fill="none" stroke="#33ee55" strokeWidth="0.7" /></svg>
  ),
}

function ToolButton({ cap, glyph, active, disabled, onClick, title }) {
  return (
    <button
      type="button"
      title={title ?? cap}
      disabled={disabled}
      onClick={onClick}
      className={
        'flex h-[42px] w-[46px] flex-col items-center justify-center gap-0.5 text-[9px] font-bold ' +
        (active ? 'bevel-in' : 'bevel-out') +
        (disabled ? ' embossed' : ' text-black active:bevel-in')
      }
    >
      <span style={disabled ? { filter: 'grayscale(1) opacity(0.5)' } : undefined}>{glyph}</span>
      {cap}
    </button>
  )
}

function MenuEntry({ label, checked, disabled, onClick }) {
  return (
    <button type="button" className="menu-item" disabled={disabled} onClick={onClick}>
      <span className="check">{checked ? '✓' : ''}</span>
      {label}
    </button>
  )
}

export default function App() {
  const { state, dispatch, specimen, probe, thickness, echoes, readout, tofdMode, tofdInfo } = useSimulator()
  const isPipeMode = specimen.type === 'pipe'
  const [menu, setMenu] = useState(null)
  const [showDefectEditor, setShowDefectEditor] = useState(false)
  const [showHelp, setShowHelp] = useState(true)
  const [showRad, setShowRad] = useState(false)
  const [show3dPipe, setShow3dPipe] = useState(true)
  const [hideDefects, setHideDefects] = useState(false)
  const [showBeamFan, setShowBeamFan] = useState(true)
  const [damp, setDamp] = useState(false)
  const autMode = state.modeId === 'aut'

  /* keyboard probe movement */
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        dispatch({ type: 'MOVE_PROBE', delta: (e.shiftKey ? 5 : 1) * (e.key === 'ArrowLeft' ? -1 : 1) })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  /* AUT scan animation: advance probe + record gate peak each frame */
  useEffect(() => {
    if (!state.scan.running) return
    const raf = requestAnimationFrame(() => {
      dispatch({ type: 'SCAN_RECORD', point: { x: state.probeX, amp: readout && readout.peak ? readout.amp : 0 } })
      const next = state.probeX + 1.2
      if (next > state.scan.span[1]) dispatch({ type: 'SCAN_STOP' })
      else dispatch({ type: 'SET_PROBE_X', x: next })
    })
    return () => cancelAnimationFrame(raf)
  }, [state.scan.running, state.scan.span, state.probeX, readout, dispatch])

  const onRecordDac = useCallback(() => {
    if (!readout || !readout.peak) return
    dispatch({ type: 'RECORD_DAC', point: { s: readout.s, amp: readout.amp } })
  }, [dispatch, readout])

  const onAddMarker = useCallback(() => {
    if (!readout || !readout.peak) return
    const x = probe.angle === 0 ? state.probeX : state.probeX + state.probeDir * readout.surfaceDist
    dispatch({
      type: 'ADD_MARKER',
      marker: {
        probeX: state.probeX,
        x,
        depth: probe.angle === 0 ? Math.min(readout.s, thickness) : readout.depth,
        leg: readout.leg,
      },
    })
  }, [dispatch, readout, probe.angle, state.probeX, state.probeDir, thickness])

  const setMode = (modeId) => dispatch({ type: 'SET_MODE', modeId })
  const setProbe = (probeId) => dispatch({ type: 'SET_PROBE', probeId })

  const tools = [
    { cap: '0°', glyph: GLYPHS.probe0, active: state.probeId === 'comp-0' && !tofdMode, onClick: () => setProbe('comp-0'), title: '0° compression probe' },
    { cap: '45°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-45' && !tofdMode, onClick: () => setProbe('shear-45'), title: '45° shear probe' },
    { cap: '60°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-60' && !tofdMode, onClick: () => setProbe('shear-60'), title: '60° shear probe' },
    { cap: '70°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-70' && !tofdMode, onClick: () => setProbe('shear-70'), title: '70° shear probe' },
    { sep: true },
    { cap: 'V2', glyph: GLYPHS.block, active: state.modeId === 'v2', onClick: () => setMode('v2'), title: 'V2 calibration block' },
    { cap: 'V1', glyph: GLYPHS.block, active: state.modeId === 'v1', onClick: () => setMode('v1'), title: 'V1 / IIW calibration block' },
    { cap: 'ASME', glyph: GLYPHS.block, active: state.modeId === 'asme', onClick: () => setMode('asme'), title: 'ASME basic calibration block — DAC/TCG' },
    { sep: true },
    { cap: 'PLOT', glyph: GLYPHS.plot, active: state.modeId === 'dac', onClick: () => setMode('dac'), title: 'DAC plotting exercise' },
    { cap: 'DAMP', glyph: GLYPHS.damp, active: damp, onClick: () => setDamp((d) => !d), title: 'Damped (smoothed) trace' },
    { cap: 'SIZE', glyph: GLYPHS.size, active: state.modeId === 'spread', onClick: () => setMode('spread'), title: 'Beam-spread 20% sizing' },
    { sep: true },
    { cap: 'DEFECT', glyph: GLYPHS.defect, active: showDefectEditor, onClick: () => { if (!specimen.allowDefects) setMode('weld'); setShowDefectEditor(true) }, title: 'Defect editor (Circle View on pipe)' },
    { cap: 'HIDE', glyph: GLYPHS.hide, active: hideDefects, onClick: () => setHideDefects((h) => !h), title: 'Hide defects in the workspace' },
    { sep: true },
    { cap: 'BEAM', glyph: GLYPHS.beam, active: showBeamFan, onClick: () => setShowBeamFan((b) => !b), title: 'Show beam spread fan' },
    { cap: 'RAD', glyph: GLYPHS.rad, active: showRad, onClick: () => setShowRad((r) => !r), title: 'Simulated radiograph of the weld' },
    { sep: true },
    { cap: 'PIPE', glyph: GLYPHS.pipe, active: state.modeId === 'pipe', onClick: () => { setMode('pipe'); setShow3dPipe(true) }, title: 'Pipe circumferential butt weld' },
    { cap: 'TKY', glyph: GLYPHS.tky, active: state.modeId === 'tky', onClick: () => setMode('tky'), title: 'T/K/Y joint configurations' },
    { cap: 'TOFD', glyph: GLYPHS.tofd, active: tofdMode, onClick: () => setMode('tofd'), title: 'Time-of-Flight Diffraction' },
    { sep: true },
    { cap: 'AUT', glyph: GLYPHS.size, active: autMode, onClick: () => setMode('aut'), title: 'Automated UT scan' },
    { cap: 'EPOCH', glyph: GLYPHS.epoch, active: state.instrument === 'epoch', onClick: () => dispatch({ type: 'SET_INSTRUMENT', instrument: state.instrument === 'epoch' ? 'usk7' : 'epoch' }), title: 'Toggle EPOCH-SIM 600 digital detector' },
  ]

  const menuNames = ['File', 'Probes', 'Step Wedge', 'Weld', 'Defects', 'Options', 'Help']
  const renderMenu = (name) => {
    switch (name) {
      case 'File':
        return (
          <>
            <MenuEntry label="New Session (reset mode)" onClick={() => setMode(state.modeId)} />
            <div className="menu-sep" />
            <MenuEntry label="Exit" disabled />
          </>
        )
      case 'Probes':
        return <ProbeSelector probeId={state.probeId} probeDir={state.probeDir} dispatch={dispatch} />
      case 'Step Wedge':
        return <SpecimenSelector section="blocks" modeId={state.modeId} specimen={specimen} specimenParams={state.specimenParams} dispatch={dispatch} />
      case 'Weld':
        return <SpecimenSelector section="weld" modeId={state.modeId} specimen={specimen} specimenParams={state.specimenParams} dispatch={dispatch} />
      case 'Defects':
        return (
          <>
            <MenuEntry label="Defect Editor… (결함 편집)" onClick={() => setShowDefectEditor(true)} />
            <MenuEntry label="Hide Defects (숨기기)" checked={hideDefects} onClick={() => setHideDefects((h) => !h)} />
            <div className="menu-sep" />
            <MenuEntry label="Delete All Defects" onClick={() => dispatch({ type: 'CLEAR_DEFECTS' })} />
          </>
        )
      case 'Options':
        return (
          <>
            <MenuEntry label="Instrument: USK-7 CRT" checked={state.instrument === 'usk7'} onClick={() => dispatch({ type: 'SET_INSTRUMENT', instrument: 'usk7' })} />
            <MenuEntry label="Instrument: EPOCH-SIM 600" checked={state.instrument === 'epoch'} onClick={() => dispatch({ type: 'SET_INSTRUMENT', instrument: 'epoch' })} />
            <div className="menu-sep" />
            {MODES.map((m) => (
              <MenuEntry key={m.id} label={m.labelEn + ' (' + m.label + ')'} checked={state.modeId === m.id} onClick={() => setMode(m.id)} />
            ))}
            <div className="menu-sep" />
            <MenuEntry label="Beam spread fan" checked={showBeamFan} onClick={() => setShowBeamFan((b) => !b)} />
            <MenuEntry label="Damped trace" checked={damp} onClick={() => setDamp((d) => !d)} />
            <MenuEntry label="Secondary signals (mode conv. / surface wave)" checked={state.secondary} onClick={() => dispatch({ type: 'TOGGLE_SECONDARY' })} />
            <MenuEntry label="TCG (time-corrected gain)" disabled={state.dacPoints.length < 2} checked={state.settings.tcg} onClick={() => dispatch({ type: 'SET_SETTING', key: 'tcg', value: !state.settings.tcg })} />
            <MenuEntry label="Radiograph window (RAD)" checked={showRad} onClick={() => setShowRad((r) => !r)} />
            <MenuEntry label="3D Pipe window" disabled={!isPipeMode} checked={show3dPipe && isPipeMode} onClick={() => setShow3dPipe((v) => !v)} />
          </>
        )
      case 'Help':
        return (
          <>
            <MenuEntry label="Exercise Guide… (연습 안내)" checked={showHelp} onClick={() => setShowHelp((h) => !h)} />
            <MenuEntry label="About UTman-Sim" disabled />
          </>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-win-gray text-black">
      {/* title bar */}
      <div className="flex items-center gap-1.5 bg-[linear-gradient(90deg,#000080,#1084d0)] px-1.5 py-[3px]">
        <svg width="16" height="14">
          <rect x="0" y="1" width="16" height="12" fill="#d4d0c8" stroke="#000" strokeWidth="0.5" />
          <polyline points="2,10 5,10 6,3 7,10 10,10 11,6 12,10 14,10" fill="none" stroke="#008000" strokeWidth="1" />
        </svg>
        <span className="text-[12px] font-bold text-white">
          UTman-Sim — Ultrasonic Simulator — NDT Verification and Training
        </span>
        <div className="ml-auto flex gap-0.5">
          {['🗕', '🗖', '✕'].map((c) => (
            <span key={c} className="bevel-out flex h-[17px] w-[19px] items-center justify-center text-[9px] leading-none text-black">
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* menu bar */}
      <div className="relative z-50 flex items-center border-b border-win-gray-dark bg-win-gray px-0.5">
        {menuNames.map((name) => (
          <div key={name} className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === name ? null : name)}
              onMouseEnter={() => menu && setMenu(name)}
              className={'px-2 py-0.5 text-[12px] ' + (menu === name ? 'bg-title-blue text-white' : 'hover:bg-title-blue hover:text-white')}
            >
              {name}
            </button>
            {menu === name && (
              <div className="menu-pop" onClick={() => setMenu(null)}>
                {renderMenu(name)}
              </div>
            )}
          </div>
        ))}
      </div>
      {menu && <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />}

      {/* toolbar */}
      <div className="flex items-center gap-0.5 border-b border-win-gray-dark bg-win-gray px-1 py-0.5">
        {tools.map((t, i) =>
          t.sep ? (
            <span key={'s' + i} className="mx-1 h-9 w-px bg-win-gray-dark shadow-[1px_0_0_#fff]" />
          ) : (
            <ToolButton key={t.cap} {...t} />
          ),
        )}
      </div>

      {/* workspace */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-workspace">
        <SpecimenView
          specimen={specimen}
          specimenParams={state.specimenParams}
          thickness={thickness}
          defects={state.defects}
          selectedDefectId={state.selectedDefectId}
          probe={probe}
          probeX={state.probeX}
          probeDir={state.probeDir}
          settings={state.settings}
          beamMarkers={state.beamMarkers}
          hideDefects={hideDefects}
          showBeamFan={showBeamFan}
          tofdMode={tofdMode}
          tofdS={state.tofdS}
          dispatch={dispatch}
        />
        <ControlPanel
          state={state}
          dispatch={dispatch}
          readout={readout}
          tofdMode={tofdMode}
          autMode={autMode}
          onRecordDac={onRecordDac}
          onAddMarker={onAddMarker}
        >
          <AScanDisplay
            echoes={echoes}
            settings={state.settings}
            gate={state.gate}
            dacPoints={state.dacPoints}
            skin={state.instrument}
            damp={damp}
            tofd={tofdMode ? { active: true, cursorUs: tofdInfo?.cursorUs ?? null, depth: tofdInfo?.depth ?? null } : null}
            onPick={(us) => dispatch({ type: 'SET_TOFD_CURSOR', us })}
          />
        </ControlPanel>
        {showDefectEditor && (
          <DefectEditor
            specimen={specimen}
            specimenParams={state.specimenParams}
            thickness={thickness}
            defects={state.defects}
            selectedDefectId={state.selectedDefectId}
            dispatch={dispatch}
            onClose={() => setShowDefectEditor(false)}
          />
        )}
        {showRad && (
          <RadiographWindow
            specimen={specimen}
            specimenParams={state.specimenParams}
            defects={state.defects}
            onClose={() => setShowRad(false)}
          />
        )}
        {show3dPipe && isPipeMode && (
          <Pipe3DWindow
            specimen={specimen}
            specimenParams={state.specimenParams}
            defects={state.defects}
            onClose={() => setShow3dPipe(false)}
          />
        )}
        {showHelp && <InfoPanel modeId={state.modeId} onClose={() => setShowHelp(false)} />}
      </div>

      {/* status bar */}
      <ReadoutBar state={state} specimen={specimen} probe={probe} thickness={thickness} readout={readout} tofdInfo={tofdInfo} />
    </div>
  )
}
