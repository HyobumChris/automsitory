import { create } from 'zustand'
import {
  type SteelGrade,
  type EvaluationResult,
  evaluateMeasures,
} from './rulesEngine'

export type Measure3SubOption = 'a' | 'b' | 'c' | 'd' | null

interface AppState {
  // Inputs
  steelGrade: SteelGrade
  thickness: number

  // Derived measures
  evaluation: EvaluationResult

  // UI state
  measure3SubOption: Measure3SubOption
  hoveredMember: string | null
  highlightedMeasure: number | null
  showAll: boolean
  animatingMeasures: number[]
  animationComplete: boolean

  // Actions
  setSteelGrade: (grade: SteelGrade) => void
  setThickness: (t: number) => void
  setMeasure3SubOption: (opt: Measure3SubOption) => void
  setHoveredMember: (member: string | null) => void
  setHighlightedMeasure: (id: number | null) => void
  setShowAll: (show: boolean) => void
  setAnimatingMeasures: (ids: number[]) => void
  setAnimationComplete: (done: boolean) => void
  reset: () => void
}

const INITIAL_GRADE: SteelGrade = 'EH36'
const INITIAL_THICKNESS = 55

export const useAppStore = create<AppState>((set) => ({
  steelGrade: INITIAL_GRADE,
  thickness: INITIAL_THICKNESS,
  evaluation: evaluateMeasures(INITIAL_GRADE, INITIAL_THICKNESS),
  measure3SubOption: null,
  hoveredMember: null,
  highlightedMeasure: null,
  showAll: false,
  animatingMeasures: [],
  animationComplete: false,

  setSteelGrade: (grade) =>
    set((state) => ({
      steelGrade: grade,
      evaluation: evaluateMeasures(grade, state.thickness),
      measure3SubOption: null,
      animatingMeasures: [],
      animationComplete: false,
    })),

  setThickness: (t) =>
    set((state) => ({
      thickness: t,
      evaluation: evaluateMeasures(state.steelGrade, t),
      measure3SubOption: null,
      animatingMeasures: [],
      animationComplete: false,
    })),

  setMeasure3SubOption: (opt) => set({ measure3SubOption: opt }),
  setHoveredMember: (member) => set({ hoveredMember: member }),
  setHighlightedMeasure: (id) => set({ highlightedMeasure: id }),
  setShowAll: (show) => set({ showAll: show }),
  setAnimatingMeasures: (ids) => set({ animatingMeasures: ids }),
  setAnimationComplete: (done) => set({ animationComplete: done }),

  reset: () =>
    set({
      steelGrade: INITIAL_GRADE,
      thickness: INITIAL_THICKNESS,
      evaluation: evaluateMeasures(INITIAL_GRADE, INITIAL_THICKNESS),
      measure3SubOption: null,
      hoveredMember: null,
      highlightedMeasure: null,
      showAll: false,
      animatingMeasures: [],
      animationComplete: false,
    }),
}))
