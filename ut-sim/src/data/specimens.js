// Specimen and calibration block definitions + defect type catalogue.
// All dimensions in mm. Coordinates: x along the scanning (top) surface,
// depth positive downwards.

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
    // side face: 300x100 profile (angle-probe work); edge face: on its side, 25 mm thick
    faces: {
      side: { length: 300, thickness: 100, label: 'Side (측면 300×100)' },
      edge: { length: 300, thickness: 25, label: 'Edge (25 mm 두께면)' },
    },
    defaultFace: 'side',
    length: 300,
    surfaceRange: [4, 296],
    features: [
      // 100 mm radius quadrant at the left end, centred on the focus point x=100.
      // Re-reflection makes the echo repeat at 200 mm (UTman shows 100 then 200).
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
    length: 125,
    thickness: 50, // profile height used for beam folding (radii dominate anyway)
    blockThicknessMm: 12.5,
    focusX: 50,
    surfaceRange: [28, 97],
    features: [
      // Facing the 25 mm radius: echoes 25 / 100 / 175 (repeat every R1+R2 = 75).
      { type: 'radius', focusX: 50, radius: 25, repeat: 75, dir: -1 },
      // Facing the 50 mm radius: echoes 50 / 125 / 200.
      { type: 'radius', focusX: 50, radius: 50, repeat: 75, dir: 1 },
      { type: 'sdh', x: 50, depth: 12, size: 5 },
    ],
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
    id: 'tky',
    name: 'T / K / Y Joint',
    nameKo: 'T / K / Y 이음부',
    type: 'tky',
    length: 300,
    mainThickness: 20,
    braceThickness: 14,
    braceX: 190, // toe of the brace on the scanning surface
    braceAngle: 45, // default; selectable 30..90 via specimen params
    surfaceRange: [4, 296],
    allowDefects: true,
  },
]

export function getSpecimen(id) {
  return SPECIMENS.find((s) => s.id === id) ?? SPECIMENS[0]
}

export function defaultSpecimenParams(specimen) {
  switch (specimen.type) {
    case 'v1':
      return { face: specimen.defaultFace }
    case 'weld':
      return { thickness: specimen.thickness }
    case 'tky':
      return { braceAngle: specimen.braceAngle }
    default:
      return {}
  }
}
