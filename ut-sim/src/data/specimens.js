// Specimen and calibration block definitions + defect type catalogue.
// All dimensions in mm. Coordinates: x along the scanning (top) surface,
// depth positive downwards. For the pipe, x is CIRCUMFERENTIAL arc position
// (the cross-section strip is the unrolled pipe, 0 .. pi*OD).

export const DEFECT_TYPES = [
  { kind: 'crack', label: 'Crack (균열)', reflectivity: 0.9, planar: true, tilt: 0, size: 5 },
  { kind: 'lof', label: 'Lack of side-wall fusion (측벽 융합불량)', reflectivity: 0.8, planar: true, tilt: 30, size: 6 },
  { kind: 'lorp', label: 'Lack of root penetration (루트 용입불량)', reflectivity: 0.85, planar: true, corner: true, tilt: 0, size: 3 },
  { kind: 'porosity', label: 'Porosity cluster (기공 군집)', reflectivity: 0.15, planar: false, size: 5 },
  { kind: 'slag', label: 'Slag inclusion (슬래그 개재물)', reflectivity: 0.4, planar: false, size: 4 },
  { kind: 'toeCrack', label: 'Toe crack (토 균열)', reflectivity: 0.85, planar: true, corner: true, tilt: 10, size: 4 },
  { kind: 'lamination', label: 'Lamination (라미네이션)', reflectivity: 0.85, planar: true, lamination: true, tilt: 90, size: 40 },
  { kind: 'sdh', label: 'Side-drilled hole (횡공)', reflectivity: 0.5, planar: false, size: 3 },
]

let defectSeq = 1

export function makeDefect(kind, overrides = {}) {
  const model = DEFECT_TYPES.find((d) => d.kind === kind) ?? DEFECT_TYPES[0]
  return {
    id: 'd' + defectSeq++,
    kind: model.kind,
    label: model.label,
    reflectivity: model.reflectivity,
    planar: model.planar ?? false,
    corner: model.corner ?? false,
    lamination: model.lamination ?? false,
    tilt: model.tilt ?? 0,
    size: model.size,
    x: 150,
    depth: 10,
    ...overrides,
  }
}

export const SPECIMENS = [
  {
    id: 'v1',
    name: 'V1 / IIW Calibration Block',
    nameKo: 'V1 (IIW) 교정 시험편',
    type: 'v1',
    faces: {
      side: { length: 300, thickness: 100, label: 'Side (측면 300×100)' },
      edge: { length: 300, thickness: 25, label: 'Edge (25 mm 두께면)' },
    },
    defaultFace: 'side',
    length: 300,
    surfaceRange: [4, 296],
    features: [
      { type: 'radius', focusX: 100, radius: 100, repeat: 100, dir: -1, face: 'side' },
      { type: 'sdh', x: 100, depth: 15, size: 1.5, face: 'side' },
      { type: 'slot', x0: 255, x1: 264, thickness: 91, face: 'side' },
      { type: 'perspex', x0: 195, x1: 225, equiv: 50, face: 'side' },
    ],
    allowDefects: false,
  },
  {
    id: 'v2',
    name: 'V2 Calibration Block',
    nameKo: 'V2 교정 시험편',
    type: 'v2',
    // profile face: fan-shaped side view for angle work; through face: the
    // block on its 12.5 mm through-thickness for 0° multiples 12.5/25/37.5...
    faces: {
      profile: { length: 125, thickness: 50, label: 'Profile (측면, 반경)' },
      through: { length: 125, thickness: 12.5, label: 'Through 12.5 mm (두께면)' },
    },
    defaultFace: 'profile',
    length: 125,
    thickness: 50,
    blockThicknessMm: 12.5,
    focusX: 50,
    surfaceRange: [28, 97],
    features: [
      { type: 'radius', focusX: 50, radius: 25, repeat: 75, dir: -1, face: 'profile' },
      { type: 'radius', focusX: 50, radius: 50, repeat: 75, dir: 1, face: 'profile' },
      { type: 'sdh', x: 50, depth: 12, size: 5, face: 'profile' },
    ],
    allowDefects: false,
  },
  {
    id: 'asme',
    name: 'ASME Basic Calibration Block',
    nameKo: 'ASME 기본 교정 시험편',
    type: 'asme',
    length: 300,
    thickness: 25, // default T; selectable 20..50 via specimen params
    minThickness: 20,
    maxThickness: 50,
    thicknessOptions: [20, 25, 30, 40, 50],
    sdhX: 150,
    sdhDiaMm: 3, // per ASME V Article 4 (basic block, ~1/8 in for this T range)
    surfaceRange: [4, 296],
    allowDefects: false,
  },
  {
    id: 'plate25',
    name: 'Flat Plate 25 mm',
    nameKo: '평판 25 mm',
    type: 'plate',
    length: 300,
    thickness: 25,
    surfaceRange: [4, 296],
    allowDefects: true,
  },
  {
    id: 'plate12',
    name: 'Flat Plate 12 mm',
    nameKo: '평판 12 mm',
    type: 'plate',
    length: 300,
    thickness: 12,
    surfaceRange: [4, 296],
    allowDefects: true,
  },
  {
    id: 'weld',
    name: 'Single-V Butt Weld',
    nameKo: '단일 V 맞대기 용접부',
    type: 'weld',
    length: 300,
    thickness: 20, // default; selectable 10..40 via specimen params
    minThickness: 10,
    maxThickness: 40,
    weldCenterX: 150,
    prepHalfAngleDeg: 30,
    surfaceRange: [4, 296],
    allowDefects: true,
  },
  {
    id: 'pipe',
    name: 'Pipe Circumferential Butt Weld',
    nameKo: '배관 원주 맞대기 용접부',
    type: 'pipe',
    odIn: 8, // default OD in inches; selectable
    odOptionsIn: [6, 8, 12],
    wt: 12, // default wall thickness; selectable 10..25
    wtOptions: [10, 12, 15, 20, 25],
    prepHalfAngleDeg: 30,
    allowDefects: true,
  },
  {
    id: 'tky',
    name: 'T / K / Y Joint',
    nameKo: 'T / K / Y 이음부',
    type: 'tky',
    length: 300,
    mainThickness: 20,
    braceThickness: 14,
    braceX: 190,
    braceAngle: 45, // default; selectable 30..90 via specimen params
    surfaceRange: [4, 296],
    allowDefects: true,
  },
]

export function getSpecimen(id) {
  return SPECIMENS.find((s) => s.id === id) ?? SPECIMENS[0]
}

/** Length of the drawn/scanned surface. For the pipe: circumference pi*OD. */
export function effectiveLength(specimen, params = {}) {
  if (specimen.type === 'pipe') {
    return Math.round(Math.PI * (params.odIn ?? specimen.odIn) * 25.4)
  }
  return specimen.length
}

/** Probe-position clamp range along the scan surface. */
export function surfaceRangeOf(specimen, params = {}) {
  if (specimen.type === 'pipe') return [4, effectiveLength(specimen, params) - 4]
  return specimen.surfaceRange ?? [2, specimen.length - 2]
}

/** Weld centreline position on the scan surface, if the specimen has one. */
export function weldCenterOf(specimen, params = {}) {
  if (specimen.type === 'weld') return specimen.weldCenterX
  if (specimen.type === 'pipe') return Math.round(effectiveLength(specimen, params) / 2)
  if (specimen.type === 'tky') return specimen.braceX
  return Math.round(effectiveLength(specimen, params) / 2)
}

export function defaultSpecimenParams(specimen) {
  switch (specimen.type) {
    case 'v1':
    case 'v2':
      return { face: specimen.defaultFace }
    case 'asme':
      return { thickness: specimen.thickness }
    case 'weld':
      return { thickness: specimen.thickness }
    case 'pipe':
      return { odIn: specimen.odIn, wt: specimen.wt }
    case 'tky':
      return { braceAngle: specimen.braceAngle, scanSurface: 'main' }
    default:
      return {}
  }
}
