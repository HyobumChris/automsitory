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

/* ---------- toolbar glyphs (line-style, currentColor) ---------- */
const G = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round', strokeLinejoin: 'round' }
const GLYPHS = {
  probe0: (
    <svg width="16" height="12"><rect x="4.5" y="1.5" width="7" height="8" {...G} /><line x1="8" y1="9.5" x2="8" y2="11" {...G} /></svg>
  ),
  wedge: (
    <svg width="16" height="12"><polygon points="2,10.5 14,10.5 14,2.5 6.5,2.5" {...G} /><circle cx="10" cy="10.5" r="0.7" fill="currentColor" stroke="none" /></svg>
  ),
  block: (
    <svg width="16" height="12"><rect x="2" y="3.5" width="11" height="7" {...G} /><polyline points="2,3.5 4.5,1.2 15.5,1.2 15.5,8 13,10.5" {...G} strokeWidth="0.8" /></svg>
  ),
  plot: (
    <svg width="16" height="12"><polyline points="1,10.5 4,10.5 5,2 6,10.5 9,10.5 10,5.5 11,10.5 15,10.5" {...G} /></svg>
  ),
  damp: (
    <svg width="16" height="12"><polyline points="1,6 4,2.5 7,9.5 10,4.5 13,7.5 15,5.5" {...G} /></svg>
  ),
  size: (
    <svg width="16" height="12"><line x1="2" y1="6" x2="14" y2="6" {...G} /><polyline points="4.5,3.5 2,6 4.5,8.5" {...G} /><polyline points="11.5,3.5 14,6 11.5,8.5" {...G} /></svg>
  ),
  defect: (
    <svg width="16" height="12"><ellipse cx="8" cy="6" rx="5" ry="3" fill="currentColor" stroke="none" /></svg>
  ),
  hide: (
    <svg width="16" height="12"><ellipse cx="8" cy="6" rx="5" ry="3" {...G} /><line x1="2.5" y1="10.5" x2="13.5" y2="1.5" {...G} /></svg>
  ),
  beam: (
    <svg width="16" height="12"><line x1="2" y1="1.5" x2="13.5" y2="10.5" {...G} /><line x1="2" y1="1.5" x2="9.5" y2="10.5" {...G} strokeWidth="0.7" strokeDasharray="1.5 1.2" /><line x1="2" y1="1.5" x2="15" y2="6.5" {...G} strokeWidth="0.7" strokeDasharray="1.5 1.2" /></svg>
  ),
  rad: (
    <svg width="16" height="12"><rect x="1.5" y="2.5" width="13" height="7" rx="1" {...G} /><circle cx="5.5" cy="6" r="1" fill="currentColor" stroke="none" /><line x1="8.5" y1="6" x2="12" y2="6" {...G} /></svg>
  ),
  pipe: (
    <svg width="16" height="12"><circle cx="8" cy="6" r="4.6" {...G} /><circle cx="8" cy="6" r="2" {...G} strokeWidth="0.8" /></svg>
  ),
  tky: (
    <svg width="16" height="12"><line x1="1.5" y1="9.5" x2="14.5" y2="9.5" {...G} strokeWidth="1.4" /><line x1="8" y1="9.5" x2="12.5" y2="1.5" {...G} strokeWidth="1.4" /></svg>
  ),
  tofd: (
    <svg width="16" height="12"><polygon points="1.5,4 4,1.5 4,4" fill="currentColor" stroke="none" /><polygon points="14.5,4 12,1.5 12,4" fill="currentColor" stroke="none" /><polyline points="2,4 8,9.5 14,4" {...G} strokeWidth="0.9" /></svg>
  ),
  epoch: (
    <svg width="16" height="12"><rect x="2" y="1.5" width="12" height="9" rx="1.5" {...G} /><polyline points="4,7.5 6,7.5 7,4 8,7.5 10,7.5 11,5.5 12,7.5" {...G} strokeWidth="0.8" /></svg>
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
        'flex h-[42px] w-[46px] flex-col items-center justify-center gap-0.5 text-[9px] font-semibold tracking-[0.02em] ' +
        (active ? 'bevel-in' : 'bevel-out') +
        (disabled ? ' embossed' : '')
      }
    >
      {glyph}
      {cap}
    </button>
  )
}

function ToolGroup({ caption, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="px-0.5 text-[8.5px] font-medium uppercase tracking-[0.06em] text-muted">{caption}</span>
      <div className="flex gap-1">{children}</div>
    </div>
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
  const radOK = specimen.type === 'weld' || specimen.type === 'pipe' || specimen.type === 'tky'
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

  const toolGroups = [
    {
      caption: 'Probes',
      tools: [
        { cap: '0°', glyph: GLYPHS.probe0, active: state.probeId === 'comp-0' && !tofdMode, onClick: () => setProbe('comp-0'), title: '0° compression probe' },
        { cap: '45°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-45' && !tofdMode, onClick: () => setProbe('shear-45'), title: '45° shear probe' },
        { cap: '60°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-60' && !tofdMode, onClick: () => setProbe('shear-60'), title: '60° shear probe' },
        { cap: '70°', glyph: GLYPHS.wedge, active: state.probeId === 'shear-70' && !tofdMode, onClick: () => setProbe('shear-70'), title: '70° shear probe' },
      ],
    },
    {
      caption: 'Blocks',
      tools: [
        { cap: 'V2', glyph: GLYPHS.block, active: state.modeId === 'v2', onClick: () => setMode('v2'), title: 'V2 calibration block' },
        { cap: 'V1', glyph: GLYPHS.block, active: state.modeId === 'v1', onClick: () => setMode('v1'), title: 'V1 / IIW calibration block' },
        { cap: 'ASME', glyph: GLYPHS.block, active: state.modeId === 'asme', onClick: () => setMode('asme'), title: 'ASME basic calibration block — DAC/TCG' },
      ],
    },
    {
      caption: 'Display',
      tools: [
        { cap: 'DAMP', glyph: GLYPHS.damp, active: damp, onClick: () => setDamp((d) => !d), title: 'Damped (smoothed) trace' },
        { cap: 'BEAM', glyph: GLYPHS.beam, active: showBeamFan, onClick: () => setShowBeamFan((b) => !b), title: 'Show beam spread fan' },
        { cap: 'HIDE', glyph: GLYPHS.hide, active: hideDefects, onClick: () => setHideDefects((h) => !h), title: 'Hide defects in the workspace' },
        { cap: 'RAD', glyph: GLYPHS.rad, active: showRad && radOK, disabled: !radOK, onClick: () => setShowRad((r) => !r), title: radOK ? 'Simulated radiograph of the weld' : 'Radiograph — weld / pipe / TKY specimens only' },
      ],
    },
    {
      caption: 'Defects',
      tools: [
        { cap: 'DEFECT', glyph: GLYPHS.defect, active: showDefectEditor, onClick: () => { if (!specimen.allowDefects) setMode('weld'); setShowDefectEditor(true) }, title: 'Defect editor (Circle View on pipe)' },
        { cap: 'PLOT', glyph: GLYPHS.plot, active: state.modeId === 'dac', onClick: () => setMode('dac'), title: 'DAC plotting exercise' },
        { cap: 'SIZE', glyph: GLYPHS.size, active: state.modeId === 'spread', onClick: () => setMode('spread'), title: 'Beam-spread 20% sizing' },
      ],
    },
    {
      caption: 'Advanced modes',
      tools: [
        { cap: 'PIPE', glyph: GLYPHS.pipe, active: state.modeId === 'pipe', onClick: () => { setMode('pipe'); setShow3dPipe(true) }, title: 'Pipe circumferential butt weld' },
        { cap: 'TKY', glyph: GLYPHS.tky, active: state.modeId === 'tky', onClick: () => setMode('tky'), title: 'T/K/Y joint configurations' },
        { cap: 'TOFD', glyph: GLYPHS.tofd, active: tofdMode, onClick: () => setMode('tofd'), title: 'Time-of-Flight Diffraction' },
        { cap: 'AUT', glyph: GLYPHS.size, active: autMode, onClick: () => setMode('aut'), title: 'Automated UT scan' },
        { cap: 'EPOCH', glyph: GLYPHS.epoch, active: state.instrument === 'epoch', onClick: () => dispatch({ type: 'SET_INSTRUMENT', instrument: state.instrument === 'epoch' ? 'usk7' : 'epoch' }), title: 'Toggle EPOCH-SIM 600 digital detector' },
      ],
    },
  ]
  const currentMode = MODES.find((m) => m.id === state.modeId) ?? MODES[0]

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
            <MenuEntry label="Radiograph window (RAD)" disabled={!radOK} checked={showRad && radOK} onClick={() => setShowRad((r) => !r)} />
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
    <div className="flex h-full flex-col overflow-hidden bg-workspace text-ink">
      {/* app header */}
      <div className="flex h-9 shrink-0 items-center gap-2.5 bg-chrome px-3">
        <svg width="18" height="14">
          <polyline points="1,11 5,11 6.5,3 8,11 11,11 12.5,6.5 14,11 17,11" fill="none" stroke="#3ce6ff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[13px] font-medium tracking-[0.02em] text-white">UT-SIM</span>
        <span className="text-[11px] text-white/45">Ultrasonic Simulator — NDT Verification and Training</span>
        <span className="ml-auto rounded-full border border-accent/40 bg-accent/15 px-2.5 py-0.5 font-mono text-[10px] text-[#7fd8ea]">
          {currentMode.labelEn} · {currentMode.label}
        </span>
      </div>

      {/* menu bar */}
      <div className="relative z-[70] flex items-center border-b border-hairline bg-panel px-1.5">
        {menuNames.map((name) => (
          <div key={name} className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === name ? null : name)}
              onMouseEnter={() => menu && setMenu(name)}
              className={
                'border-b-2 px-2.5 py-1 text-[12px] transition-colors duration-75 ' +
                (menu === name
                  ? 'border-accent bg-accent/8 text-accent'
                  : 'border-transparent text-ink hover:bg-accent/8 hover:text-accent')
              }
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
      {menu && <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />}

      {/* toolbar: grouped segmented controls */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1 overflow-x-auto border-b border-hairline bg-panel px-2 pb-1.5 pt-1">
        {toolGroups.map((g, i) => (
          <div key={g.caption} className="flex items-end gap-3">
            {i > 0 && <span className="mb-0.5 h-10 w-px bg-hairline" />}
            <ToolGroup caption={g.caption}>
              {g.tools.map((t) => (
                <ToolButton key={t.cap} {...t} />
              ))}
            </ToolGroup>
          </div>
        ))}
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
        {showRad && radOK && (
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
