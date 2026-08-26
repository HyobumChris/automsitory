import { useMemo, useReducer } from 'react'
import { computeEchoes, deriveReadout, effectiveThickness } from '../lib/ultrasound.js'
import { getProbe } from '../data/probes.js'
import { getSpecimen, defaultSpecimenParams, makeDefect } from '../data/specimens.js'

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
]

const SETTING_CLAMPS = {
  range: [20, 1000],
  gain: [0, 110],
  xShift: [-50, 500],
  probeZero: [0, 30],
  reject: [0, 80],
}

function clampSetting(key, value) {
  const [lo, hi] = SETTING_CLAMPS[key] ?? [-1e9, 1e9]
  return Math.min(hi, Math.max(lo, Math.round(value * 100) / 100))
}

function clampProbeX(specimen, x) {
  const [lo, hi] = specimen.surfaceRange ?? [2, specimen.length - 2]
  return Math.min(hi, Math.max(lo, Math.round(x * 10) / 10))
}

function stateForMode(modeId) {
  const mode = MODES.find((m) => m.id === modeId) ?? MODES[0]
  const specimen = getSpecimen(mode.specimen)
  return {
    modeId: mode.id,
    specimenId: specimen.id,
    specimenParams: defaultSpecimenParams(specimen),
    probeId: mode.probe,
    probeX: clampProbeX(specimen, mode.probeX),
    probeDir: mode.probeDir ?? 1,
    settings: { dbStep: 2, ...mode.settings },
    gate: { on: true, start: 10, width: 60, level: 40 },
    dacPoints: [],
    beamMarkers: [],
    defects: (mode.defects ?? []).map((d) => makeDefect(d.kind, d)),
    selectedDefectId: null,
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'SET_MODE':
      return stateForMode(action.modeId)
    case 'SET_SPECIMEN': {
      const specimen = getSpecimen(action.specimenId)
      return {
        ...state,
        specimenId: specimen.id,
        specimenParams: defaultSpecimenParams(specimen),
        probeX: clampProbeX(specimen, state.probeX),
        defects: [],
        selectedDefectId: null,
        dacPoints: [],
        beamMarkers: [],
      }
    }
    case 'SET_SPECIMEN_PARAM':
      return {
        ...state,
        specimenParams: { ...state.specimenParams, [action.key]: action.value },
      }
    case 'SET_PROBE':
      return { ...state, probeId: action.probeId }
    case 'SET_PROBE_X': {
      const specimen = getSpecimen(state.specimenId)
      return { ...state, probeX: clampProbeX(specimen, action.x) }
    }
    case 'MOVE_PROBE': {
      const specimen = getSpecimen(state.specimenId)
      return { ...state, probeX: clampProbeX(specimen, state.probeX + action.delta) }
    }
    case 'FLIP_PROBE':
      return { ...state, probeDir: -state.probeDir }
    case 'SET_SETTING':
      return {
        ...state,
        settings: {
          ...state.settings,
          [action.key]:
            action.key === 'dbStep' ? action.value : clampSetting(action.key, action.value),
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
        x: specimen.type === 'weld' ? specimen.weldCenterX : Math.round(specimen.length / 2),
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
    case 'REMOVE_DEFECT':
      return {
        ...state,
        defects: state.defects.filter((d) => d.id !== action.id),
        selectedDefectId:
          state.selectedDefectId === action.id ? null : state.selectedDefectId,
      }
    case 'SELECT_DEFECT':
      return { ...state, selectedDefectId: action.id }
    default:
      return state
  }
}

export default function useSimulator() {
  const [state, dispatch] = useReducer(reducer, MODES[0].id, stateForMode)

  const specimen = getSpecimen(state.specimenId)
  const probe = getProbe(state.probeId)
  const thickness = effectiveThickness(specimen, state.specimenParams)

  const echoes = useMemo(
    () =>
      computeEchoes({
        specimen,
        specimenParams: state.specimenParams,
        defects: state.defects,
        probe,
        probeX: state.probeX,
        probeDir: state.probeDir,
        settings: state.settings,
      }),
    [specimen, state.specimenParams, state.defects, probe, state.probeX, state.probeDir, state.settings],
  )

  const readout = useMemo(
    () =>
      deriveReadout({
        echoes,
        gate: state.gate,
        dacPoints: state.dacPoints,
        probe,
        thickness,
      }),
    [echoes, state.gate, state.dacPoints, probe, thickness],
  )

  return { state, dispatch, specimen, probe, thickness, echoes, readout }
}
