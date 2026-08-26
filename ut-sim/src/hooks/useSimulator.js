import { useMemo, useReducer } from 'react'
import {
  computeEchoes,
  computeTofdSignals,
  deriveReadout,
  effectiveThickness,
  tofdDepthFromTime,
} from '../lib/ultrasound.js'
import { getProbe } from '../data/probes.js'
import {
  getSpecimen,
  defaultSpecimenParams,
  makeDefect,
  effectiveLength,
  surfaceRangeOf,
  weldCenterOf,
} from '../data/specimens.js'

// Exercise modes mirroring the UTman playlist. Each preset selects a sensible
// specimen + probe + instrument setup; guidance text lives in InfoPanel.
export const MODES = [
  {
    id: 'basic',
    label: '기본 조작',
    labelEn: 'Basic Controls',
    specimen: 'plate25',
    probe: 'comp-0',
    probeX: 150,
    probeDir: 1,
    settings: { range: 100, gain: 30, xShift: 0, probeZero: 2, reject: 0 },
  },
  {
    id: 'zero',
    label: '0° 탐상',
    labelEn: 'Zero Probe',
    specimen: 'plate25',
    probe: 'comp-0',
    probeX: 150,
    probeDir: 1,
    settings: { range: 100, gain: 30, xShift: 0, probeZero: 0, reject: 0 },
  },
  {
    id: 'v1',
    label: 'V1 교정',
    labelEn: 'V1 Calibration',
    specimen: 'v1',
    probe: 'shear-45',
    probeX: 100,
    probeDir: -1,
    settings: { range: 250, gain: 40, xShift: 0, probeZero: 0, reject: 0 },
  },
  {
    id: 'v2',
    label: 'V2 교정',
    labelEn: 'V2 Calibration',
    specimen: 'v2',
    probe: 'shear-60',
    probeX: 50,
    probeDir: 1,
    settings: { range: 250, gain: 42, xShift: 0, probeZero: 0, reject: 0 },
  },
  {
    id: 'asme',
    label: 'ASME 교정',
    labelEn: 'ASME Block DAC/TCG',
    specimen: 'asme',
    probe: 'shear-45',
    probeX: 130,
    probeDir: 1,
    settings: { range: 100, gain: 44, xShift: 0, probeZero: 8, reject: 0 },
  },
  {
    id: 'lam',
    label: '라미네이션',
    labelEn: 'Lamination',
    specimen: 'plate12',
    probe: 'comp-0',
    probeX: 60,
    probeDir: 1,
    settings: { range: 50, gain: 30, xShift: 0, probeZero: 2, reject: 0 },
    defects: [{ kind: 'lamination', x: 180, depth: 6, size: 60 }],
  },
  {
    id: 'weld',
    label: '용접부 결함',
    labelEn: 'Weld Defects',
    specimen: 'weld',
    probe: 'shear-60',
    probeX: 100,
    probeDir: 1,
    settings: { range: 200, gain: 46, xShift: 0, probeZero: 10, reject: 0 },
    defects: [
      { kind: 'lof', x: 145, depth: 8, tilt: 30 },
      { kind: 'porosity', x: 152, depth: 14 },
    ],
  },
  {
    id: 'pipe',
    label: '배관 용접부',
    labelEn: 'Pipe Circ. Weld',
    specimen: 'pipe',
    probe: 'shear-60',
    probeX: 285,
    probeDir: 1,
    settings: { range: 200, gain: 46, xShift: 0, probeZero: 10, reject: 0 },
    defects: [
      { kind: 'lof', x: 314, depth: 6, tilt: 30 },
      { kind: 'porosity', x: 322, depth: 9 },
    ],
  },
  {
    id: 'dac',
    label: 'DAC',
    labelEn: 'DAC Curve',
    specimen: 'plate25',
    probe: 'shear-45',
    probeX: 140,
    probeDir: 1,
    settings: { range: 100, gain: 44, xShift: 0, probeZero: 8, reject: 0 },
    defects: [
      { kind: 'sdh', x: 150, depth: 6.25 },
      { kind: 'sdh', x: 150, depth: 12.5 },
      { kind: 'sdh', x: 150, depth: 18.75 },
    ],
  },
  {
    id: 'spread',
    label: '빔 확산',
    labelEn: 'Beam Spread 20%',
    specimen: 'plate25',
    probe: 'comp-0',
    probeX: 110,
    probeDir: 1,
    settings: { range: 50, gain: 32, xShift: 0, probeZero: 2, reject: 0 },
    defects: [{ kind: 'lamination', x: 150, depth: 12, size: 30 }],
  },
  {
    id: 'tky',
    label: 'TKY',
    labelEn: 'TKY Joints',
    specimen: 'tky',
    probe: 'shear-45',
    probeX: 140,
    probeDir: 1,
    settings: { range: 200, gain: 44, xShift: 0, probeZero: 8, reject: 0 },
    defects: [{ kind: 'toeCrack', x: 190, depth: 3, size: 4 }],
  },
  {
    id: 'tofd',
    label: 'TOFD',
    labelEn: 'Time-of-Flight Diffraction',
    specimen: 'weld',
    probe: 'comp-0',
    probeX: 150,
    probeDir: 1,
    // in TOFD mode the screen axis is MICROSECONDS - range is in us
    settings: { range: 16, gain: 40, xShift: 0, probeZero: 0, reject: 0 },
    gate: { on: false, start: 2, width: 10, level: 30 },
    defects: [{ kind: 'crack', x: 150, depth: 10, size: 6, tilt: 0 }],
  },
  {
    id: 'aut',
    label: 'AUT',
    labelEn: 'Automated UT Scan',
    specimen: 'weld',
    probe: 'shear-60',
    probeX: 60,
    probeDir: 1,
    settings: { range: 200, gain: 46, xShift: 0, probeZero: 10, reject: 0 },
    gate: { on: true, start: 10, width: 120, level: 25 },
    defects: [
      { kind: 'lof', x: 130, depth: 8, tilt: 30 },
      { kind: 'sdh', x: 170, depth: 12 },
      { kind: 'slag', x: 205, depth: 10 },
    ],
    scanSpan: [40, 260],
  },
]

const SETTING_CLAMPS = {
  range: [4, 1000],
  gain: [0, 110],
  xShift: [-50, 500],
  probeZero: [-10, 30],
  reject: [0, 80],
}

const RAW_SETTINGS = new Set(['dbStep', 'tcg'])

function clampSetting(key, value) {
  const [lo, hi] = SETTING_CLAMPS[key] ?? [-1e9, 1e9]
  return Math.min(hi, Math.max(lo, Math.round(value * 100) / 100))
}

function clampProbeX(specimen, params, x) {
  const [lo, hi] = surfaceRangeOf(specimen, params)
  return Math.min(hi, Math.max(lo, Math.round(x * 10) / 10))
}

function stateForMode(modeId) {
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0]
  const specimen = getSpecimen(mode.specimen)
  const params = defaultSpecimenParams(specimen)
  const t = effectiveThickness(specimen, params)
  return {
    modeId: mode.id,
    specimenId: specimen.id,
    specimenParams: params,
    probeId: mode.probe,
    probeX: clampProbeX(specimen, params, mode.probeX),
    probeDir: mode.probeDir ?? 1,
    settings: { dbStep: 2, tcg: false, ...mode.settings },
    gate: { on: true, start: 10, width: 60, level: 40, ...(mode.gate ?? {}) },
    dacPoints: [],
    beamMarkers: [],
    defects: (mode.defects ?? []).map((d) => makeDefect(d.kind, d)),
    selectedDefectId: null,
    instrument: 'usk7', // 'usk7' | 'epoch'
    secondary: true, // teaching-level mode conversion / surface wave signals
    tofdS: Math.round(t * 0.7), // TOFD half probe-centre spacing (mm)
    tofdCursorUs: null,
    scan: { running: false, span: mode.scanSpan ?? [40, 260], data: [] },
  }
}

function sanitizeDefect(d) {
  return makeDefect(typeof d.kind === 'string' ? d.kind : 'crack', {
    x: Number.isFinite(+d.x) ? +d.x : 150,
    depth: Number.isFinite(+d.depth) ? +d.depth : 10,
    size: Number.isFinite(+d.size) ? +d.size : 5,
    tilt: Number.isFinite(+d.tilt) ? +d.tilt : 0,
  })
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return { ...stateForMode(action.modeId), instrument: state.instrument, secondary: state.secondary }
    case 'SET_SPECIMEN': {
      const specimen = getSpecimen(action.specimenId)
      const params = defaultSpecimenParams(specimen)
      return {
        ...state,
        specimenId: specimen.id,
        specimenParams: params,
        probeX: clampProbeX(specimen, params, state.probeX),
        defects: [],
        selectedDefectId: null,
        dacPoints: [],
        beamMarkers: [],
        scan: { ...state.scan, running: false, data: [] },
      }
    }
    case 'SET_SPECIMEN_PARAM': {
      const specimen = getSpecimen(state.specimenId)
      const params = { ...state.specimenParams, [action.key]: action.value }
      return { ...state, specimenParams: params, probeX: clampProbeX(specimen, params, state.probeX) }
    }
    case 'SET_PROBE':
      return { ...state, probeId: action.probeId }
    case 'SET_PROBE_X': {
      const specimen = getSpecimen(state.specimenId)
      return { ...state, probeX: clampProbeX(specimen, state.specimenParams, action.x) }
    }
    case 'MOVE_PROBE': {
      const specimen = getSpecimen(state.specimenId)
      return { ...state, probeX: clampProbeX(specimen, state.specimenParams, state.probeX + action.delta) }
    }
    case 'FLIP_PROBE':
      return { ...state, probeDir: -state.probeDir }
    case 'SET_INSTRUMENT':
      return { ...state, instrument: action.instrument }
    case 'TOGGLE_SECONDARY':
      return { ...state, secondary: !state.secondary }
    case 'SET_TOFD_S':
      return { ...state, tofdS: Math.min(80, Math.max(5, state.tofdS + action.delta)) }
    case 'SET_TOFD_CURSOR':
      return { ...state, tofdCursorUs: action.us }
    case 'SET_SETTING':
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.key]: RAW_SETTINGS.has(action.key) ? action.value : clampSetting(action.key, action.value),
        },
      }
    case 'ADJUST_SETTING':
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.key]: clampSetting(action.key, state.settings[action.key] + action.delta),
        },
      }
    case 'SET_GATE':
      return { ...state, gate: { ...state.gate, ...action.patch } }
    case 'RECORD_DAC': {
      if (action.point == null) return state
      const others = state.dacPoints.filter((p) => Math.abs(p.s - action.point.s) > 2)
      return { ...state, dacPoints: [...others, action.point].sort((a, b) => a.s - b.s) }
    }
    case 'CLEAR_DAC':
      return { ...state, dacPoints: [] }
    case 'ADD_MARKER':
      if (action.marker == null) return state
      return { ...state, beamMarkers: [...state.beamMarkers, action.marker] }
    case 'CLEAR_MARKERS':
      return { ...state, beamMarkers: [] }
    case 'ADD_DEFECT': {
      const specimen = getSpecimen(state.specimenId)
      const t = effectiveThickness(specimen, state.specimenParams)
      const defect = makeDefect(action.kind, {
        x: weldCenterOf(specimen, state.specimenParams),
        depth: Math.round((t / 2) * 10) / 10,
        ...action.overrides,
      })
      return { ...state, defects: [...state.defects, defect], selectedDefectId: defect.id }
    }
    case 'UPDATE_DEFECT':
      return {
        ...state,
        defects: state.defects.map((d) =>
          d.id === action.id ? { ...d, ...action.patch } : d,
        ),
      }
    case 'UPDATE_ALL_DEFECTS':
      return { ...state, defects: state.defects.map((d) => ({ ...d, ...action.patch })) }
    case 'LOAD_DEFECTS': {
      if (!Array.isArray(action.defects)) return state
      const defects = action.defects.slice(0, 8).map(sanitizeDefect)
      return { ...state, defects, selectedDefectId: defects[0]?.id ?? null }
    }
    case 'REMOVE_DEFECT':
      return {
        ...state,
        defects: state.defects.filter((d) => d.id !== action.id),
        selectedDefectId:
          state.selectedDefectId === action.id ? null : state.selectedDefectId,
      }
    case 'CLEAR_DEFECTS':
      return { ...state, defects: [], selectedDefectId: null }
    case 'SELECT_DEFECT':
      return { ...state, selectedDefectId: action.id }
    case 'SCAN_START': {
      const specimen = getSpecimen(state.specimenId)
      return {
        ...state,
        probeX: clampProbeX(specimen, state.specimenParams, state.scan.span[0]),
        scan: { ...state.scan, running: true, data: [] },
      }
    }
    case 'SCAN_STOP':
      return { ...state, scan: { ...state.scan, running: false } }
    case 'SCAN_RESET':
      return { ...state, scan: { ...state.scan, running: false, data: [] } }
    case 'SCAN_SPAN':
      return { ...state, scan: { ...state.scan, span: action.span } }
    case 'SCAN_RECORD':
      return { ...state, scan: { ...state.scan, data: [...state.scan.data, action.point] } }
    default:
      return state
  }
}

export default function useSimulator() {
  const [state, dispatch] = useReducer(reducer, MODES[0].id, stateForMode)

  const specimen = getSpecimen(state.specimenId)
  const probe = getProbe(state.probeId)
  const thickness = effectiveThickness(specimen, state.specimenParams)
  const length = effectiveLength(specimen, state.specimenParams)
  const tofdMode = state.modeId === 'tofd'

  const echoes = useMemo(() => {
    if (tofdMode) {
      return computeTofdSignals({
        thickness,
        sHalf: state.tofdS,
        pairCenter: state.probeX,
        defects: state.defects,
        gain: state.settings.gain,
      })
    }
    return computeEchoes({
      specimen,
      specimenParams: state.specimenParams,
      defects: state.defects,
      probe,
      probeX: state.probeX,
      probeDir: state.probeDir,
      settings: state.settings,
      secondary: state.secondary,
      dacPoints: state.dacPoints,
      tcg: state.settings.tcg,
    })
  }, [tofdMode, specimen, state.specimenParams, state.defects, probe, state.probeX, state.probeDir, state.settings, state.secondary, state.dacPoints, state.tofdS, thickness])

  const readout = useMemo(() => {
    if (tofdMode) return { peak: null }
    return deriveReadout({
      echoes,
      gate: state.gate,
      dacPoints: state.dacPoints,
      probe,
      thickness,
      curvatureRadius:
        specimen.type === 'pipe' ? ((state.specimenParams.odIn ?? specimen.odIn) * 25.4) / 2 : null,
      tcg: state.settings.tcg,
    })
  }, [tofdMode, echoes, state.gate, state.dacPoints, probe, thickness, specimen, state.specimenParams, state.settings.tcg])

  const tofdInfo = useMemo(() => {
    if (!tofdMode) return null
    const cursorUs = state.tofdCursorUs
    return {
      sHalf: state.tofdS,
      cursorUs,
      depth: cursorUs != null ? tofdDepthFromTime(cursorUs, state.tofdS) : null,
    }
  }, [tofdMode, state.tofdCursorUs, state.tofdS])

  return { state, dispatch, specimen, probe, thickness, length, echoes, readout, tofdMode, tofdInfo }
}
