/**
 * LR Rules Engine – Pt 4, Ch 8, Section 2.3
 *
 * Implements the logic table for brittle crack arrest measures
 * based on steel grade (yield strength) and plate thickness.
 */

export type SteelGrade = 'YP36' | 'YP40' | 'YP47'

export type BCAGrade = 'NONE' | 'BCA1' | 'BCA2'

export interface MeasureState {
  /** Measure 1: 100% UT NDE during construction */
  measure1: boolean
  /** Measure 2: Periodic in-service NDE */
  measure2: boolean
  /** Measure 3: Brittle crack arrest design (staggered welds) */
  measure3: boolean
  /** Measure 4/5: BCA steel for upper deck */
  measure4_5: BCAGrade
}

export interface RulesInput {
  steelGrade: SteelGrade
  thickness: number // mm, range 50–100
}

/** Yield strength in N/mm² for each grade */
export const YIELD_STRENGTH: Record<SteelGrade, number> = {
  YP36: 355,
  YP40: 390,
  YP47: 460,
}

/**
 * Evaluate LR Pt 4, Ch 8, Table 8.2.1 / 8.2.2
 *
 * Logic:
 *  - Measure 1 (NDE): Always required when t > 50mm
 *  - Measure 3 (Staggered):
 *      IF (YP36/40 AND t > 85) OR (YP47 AND t > 50) → REQUIRED
 *  - Measure 4/5 (BCA Steel):
 *      IF (YP36/40 AND t > 85) → BCA1
 *      IF (YP47 AND 50 < t ≤ 85) → BCA1
 *      IF (YP47 AND t > 85) → BCA2
 */
export function evaluateMeasures(input: RulesInput): MeasureState {
  const { steelGrade, thickness } = input

  // Measure 1: Always required for t > 50mm
  const measure1 = thickness > 50

  // Measure 2: May be required based on ShipRight evaluation
  // For this app, we derive it as a companion to Measure 1
  const measure2 = measure1

  // Measure 3: Crack arrest design (staggered weld arrangement)
  let measure3 = false
  if (
    (steelGrade === 'YP36' || steelGrade === 'YP40') &&
    thickness > 85
  ) {
    measure3 = true
  }
  if (steelGrade === 'YP47' && thickness > 50) {
    measure3 = true
  }

  // Measure 4/5: BCA steel grade
  let measure4_5: BCAGrade = 'NONE'
  if (
    (steelGrade === 'YP36' || steelGrade === 'YP40') &&
    thickness > 85
  ) {
    measure4_5 = 'BCA1'
  }
  if (steelGrade === 'YP47' && thickness > 50 && thickness <= 85) {
    measure4_5 = 'BCA1'
  }
  if (steelGrade === 'YP47' && thickness > 85) {
    measure4_5 = 'BCA2'
  }

  return { measure1, measure2, measure3, measure4_5 }
}
