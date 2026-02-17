/**
 * LR Rules Engine – Pt 4, Ch 8, Section 2.3
 *
 * Implements the exact applicability matrix (Table 8.2.1)
 * for brittle crack arrest measures based on steel grade
 * (nominal yield strength) and plate thickness.
 */

export type SteelGrade = 'EH36' | 'EH40' | 'EH47'

export interface MeasureResult {
  id: number
  required: boolean
  note?: string
}

export interface EvaluationResult {
  measures: MeasureResult[]
  activeMeasureIds: number[]
}

/** Yield strength in N/mm² for each grade */
export const YIELD_STRENGTH: Record<SteelGrade, number> = {
  EH36: 355,
  EH40: 390,
  EH47: 460,
}

export const GRADE_LABELS: Record<SteelGrade, string> = {
  EH36: 'EH36 (355 N/mm²)',
  EH40: 'EH40 (390 N/mm²)',
  EH47: 'EH47 (460 N/mm²)',
}

export const MEASURES_DATA: Record<number, {
  name: string
  title: string
  description: string
  color: string
  ruleRef: string
  affectedMembers: string[]
  type: string
  subOptions?: Record<string, { label: string; desc: string; ruleRef: string }>
}> = {
  1: {
    name: 'Measure 1',
    title: '100% NDE on Upper Flange Longitudinals',
    description:
      '100% ultrasonic testing during construction on all block-to-block butt joints of all upper flange longitudinal structural members in the cargo hold region.',
    color: '#2563EB',
    ruleRef: 'Pt 4, Ch 8, 2.3.8',
    affectedMembers: [
      'deck_longitudinals',
      'inner_hull_longitudinals',
      'sheer_strake',
      'main_deck',
      'coaming_plate',
      'coaming_top_plate',
      'longitudinal_stiffeners',
    ],
    type: 'weld_joints',
  },
  2: {
    name: 'Measure 2',
    title: 'Periodic In-Service NDE',
    description:
      'Periodic NDE during service. Frequency and extent agreed with LR. May be required where enhanced NDE (Measure 3d) was applied during construction.',
    color: '#F59E0B',
    ruleRef: 'Pt 4, Ch 8, 2.3.10(d)',
    affectedMembers: [
      'deck_longitudinals',
      'inner_hull_longitudinals',
      'sheer_strake',
      'main_deck',
      'coaming_plate',
      'coaming_top_plate',
    ],
    type: 'weld_joints_inservice',
  },
  3: {
    name: 'Measure 3',
    title: 'Crack Arrest Design at Hatch Coaming Junction',
    description:
      'Crack arrest provisions at the critical junction between hatch coaming side plate and upper deck.',
    color: '#DC2626',
    ruleRef: 'Pt 4, Ch 8, 2.3.9 & 2.3.10',
    subOptions: {
      a: {
        label: 'Staggered Butt Welds',
        desc: 'Block-to-block butt welds offset ≥ 300mm between coaming side and upper deck. Brittle crack arrest steel required for hatch coaming side plate.',
        ruleRef: '2.3.10(a)',
      },
      b: {
        label: 'Crack Arrest Holes',
        desc: 'Crack arrest holes at coaming/deck weld intersection. Fatigue assessment of hole corners required. Brittle crack arrest steel for hatch coaming side.',
        ruleRef: '2.3.10(b)',
      },
      c: {
        label: 'Crack Arrest Insert Plates',
        desc: 'SUF (Ultra-Fine grain) steel or equivalent inserts with high crack arrest toughness at coaming/deck weld region. Brittle crack arrest steel for hatch coaming side.',
        ruleRef: '2.3.10(c)',
      },
      d: {
        label: 'Enhanced NDE',
        desc: 'Enhanced NDE per ShipRight Procedure with stricter acceptance criteria. CTOD ≥ 0.18mm. FCAW/GMAW only, EGW not permitted.',
        ruleRef: '2.3.10(d)',
      },
    },
    affectedMembers: ['coaming_deck_junction', 'hatch_coaming_side', 'upper_deck_connection'],
    type: 'structural_joint',
  },
  4: {
    name: 'Measure 4',
    title: 'Crack Arrest Steel for Upper Deck',
    description:
      'Brittle crack arrest steel (BCA1) to be used for upper deck plating along the cargo hold region, to arrest crack propagating from coaming side and top plate.',
    color: '#16A34A',
    ruleRef: 'Pt 4, Ch 8, 2.3.11',
    affectedMembers: ['upper_deck_plate'],
    type: 'plate_material',
  },
  5: {
    name: 'Measure 5',
    title: 'Crack Arrest Steel for Upper Deck (Extended)',
    description:
      'Brittle crack arrest steel for upper deck for case 2.3.5(c) — crack initiation in welded joints deviating into base metal.',
    color: '#9333EA',
    ruleRef: 'Pt 4, Ch 8, 2.3.12',
    affectedMembers: ['upper_deck_plate', 'attachment_welds'],
    type: 'plate_material_extended',
  },
}

/**
 * Table 8.2.1 exact applicability matrix
 */
const APPLICABILITY_MATRIX: Record<
  string,
  { ranges: { min: number; max: number; measures: number[]; notes?: Record<number, string> }[] }
> = {
  '355': {
    ranges: [
      { min: 50, max: 85, measures: [] },
      { min: 85, max: 100, measures: [1] },
    ],
  },
  '390': {
    ranges: [
      { min: 50, max: 85, measures: [1] },
      {
        min: 85,
        max: 100,
        measures: [1, 2, 3, 4, 5],
        notes: {
          2: 'Note 2: May be required where enhanced NDE during construction has been applied as part of Measure 3.',
        },
      },
    ],
  },
  '460': {
    ranges: [
      {
        min: 50,
        max: 100,
        measures: [1, 2, 3, 4, 5],
        notes: {
          2: 'Note 2: May be required where enhanced NDE during construction has been applied as part of Measure 3.',
        },
      },
    ],
  },
}

/**
 * Table 8.2.2: Brittle Crack Arrest Steel Types
 */
export const BCA_TABLE = [
  {
    member: 'Upper deck',
    thickness: '50 < t ≤ 100',
    yields: [355, 390],
    bca: 'BCA1',
  },
  {
    member: 'Hatch coaming side',
    thickness: '50 < t ≤ 80',
    yields: [390, 460],
    bca: 'BCA1',
  },
  {
    member: 'Hatch coaming side',
    thickness: '80 < t ≤ 100',
    yields: [390, 460],
    bca: 'BCA2',
  },
]

/**
 * Evaluate LR Pt 4, Ch 8, Table 8.2.1
 */
export function evaluateMeasures(grade: SteelGrade, thickness: number): EvaluationResult {
  const yieldStrength = YIELD_STRENGTH[grade]
  const matrix = APPLICABILITY_MATRIX[String(yieldStrength)]

  if (!matrix) {
    return { measures: [], activeMeasureIds: [] }
  }

  let applicableMeasureIds: number[] = []
  let notes: Record<number, string> = {}

  for (const range of matrix.ranges) {
    if (thickness > range.min && thickness <= range.max) {
      applicableMeasureIds = [...range.measures]
      notes = range.notes || {}
      break
    }
  }

  const measures: MeasureResult[] = [1, 2, 3, 4, 5].map((id) => ({
    id,
    required: applicableMeasureIds.includes(id),
    note: notes[id],
  }))

  return {
    measures,
    activeMeasureIds: applicableMeasureIds,
  }
}

/**
 * Get BCA type for a structural member given thickness and yield
 */
export function getBCAType(
  member: 'upper_deck' | 'hatch_coaming_side',
  thickness: number,
  yieldStrength: number,
): string | null {
  if (member === 'upper_deck') {
    if (thickness > 50 && thickness <= 100 && (yieldStrength === 355 || yieldStrength === 390)) {
      return 'BCA1'
    }
  }
  if (member === 'hatch_coaming_side') {
    if (
      thickness > 50 &&
      thickness <= 80 &&
      (yieldStrength === 390 || yieldStrength === 460)
    ) {
      return 'BCA1'
    }
    if (
      thickness > 80 &&
      thickness <= 100 &&
      (yieldStrength === 390 || yieldStrength === 460)
    ) {
      return 'BCA2'
    }
  }
  return null
}
