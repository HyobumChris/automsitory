import { useCallback, useEffect } from 'react'
import { Waves } from 'lucide-react'
import useSimulator, { MODES } from './hooks/useSimulator.js'
import AScanDisplay from './components/AScanDisplay.jsx'
import SpecimenView from './components/SpecimenView.jsx'
import ControlPanel from './components/ControlPanel.jsx'
import ProbeSelector from './components/ProbeSelector.jsx'
import SpecimenSelector from './components/SpecimenSelector.jsx'
import DefectEditor from './components/DefectEditor.jsx'
import ReadoutBar from './components/ReadoutBar.jsx'
import InfoPanel from './components/InfoPanel.jsx'

export default function App() {
  const { state, dispatch, specimen, probe, thickness, echoes, readout } = useSimulator()

  // keyboard probe movement (← / →, Shift = x5)
  useEffect(() => {
    const onKey = (e) => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const step = (e.shiftKey ? 5 : 1) * (e.key === 'ArrowLeft' ? -1 : 1)
        dispatch({ type: 'MOVE_PROBE', delta: step })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  const onRecordDac = useCallback(() => {
    if (!readout || !readout.peak) return
    dispatch({ type: 'RECORD_DAC', point: { s: readout.s, amp: readout.amp } })
  }, [dispatch, readout])

  const onAddMarker = useCallback(() => {
    if (!readout || !readout.peak) return
    const x =
      probe.angle === 0
        ? state.probeX
        : state.probeX + state.probeDir * readout.surfaceDist
    dispatch({
      type: 'ADD_MARKER',
      marker: { probeX: state.probeX, x, depth: probe.angle === 0 ? Math.min(readout.s, thickness) : readout.depth, leg: readout.leg },
    })
  }, [dispatch, readout, probe.angle, state.probeX, state.probeDir, thickness])

  return (
    <div className="flex h-full flex-col bg-marine-900">
      {/* header */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-marine-600 bg-marine-800 px-4 py-2">
        <div className="flex items-center gap-2">
          <Waves className="text-cyan-glow" size={20} />
          <h1 className="text-sm font-bold tracking-wide text-slate-100">
            UT-Sim — Ultrasonic Flaw Detector Simulator{' '}
            <span className="font-normal text-slate-400">(UTman 스타일)</span>
          </h1>
        </div>
        <nav className="flex flex-wrap gap-1">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => dispatch({ type: 'SET_MODE', modeId: m.id })}
              className={
                'rounded px-2 py-1 text-[11px] font-medium transition-colors ' +
                (state.modeId === m.id
                  ? 'bg-cyan-glow/25 text-cyan-glow shadow-[0_0_8px_rgba(0,229,255,0.35)]'
                  : 'text-slate-400 hover:bg-marine-700 hover:text-slate-200')
              }
              title={m.labelEn}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      {/* main */}
      <div className="flex min-h-0 flex-1">
        {/* left: instrument */}
        <main className="flex min-w-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
          <AScanDisplay
            echoes={echoes}
            settings={state.settings}
            gate={state.gate}
            dacPoints={state.dacPoints}
            probe={probe}
          />
          <ReadoutBar readout={readout} gateOn={state.gate.on} />
          <ControlPanel
            state={state}
            dispatch={dispatch}
            onRecordDac={onRecordDac}
            onAddMarker={onAddMarker}
          />
        </main>

        {/* right: specimen + setup */}
        <aside className="flex w-[400px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-marine-600 bg-marine-900/60 p-3">
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
            dispatch={dispatch}
          />
          <InfoPanel modeId={state.modeId} />
          <ProbeSelector probeId={state.probeId} probeDir={state.probeDir} dispatch={dispatch} />
          <SpecimenSelector specimen={specimen} specimenParams={state.specimenParams} dispatch={dispatch} />
          <DefectEditor
            specimen={specimen}
            thickness={thickness}
            defects={state.defects}
            selectedDefectId={state.selectedDefectId}
            dispatch={dispatch}
          />
        </aside>
      </div>
    </div>
  )
}
