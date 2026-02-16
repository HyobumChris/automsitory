import { create } from 'zustand'
import {
  type SteelGrade,
  type MeasureState,
  type RulesInput,
  evaluateMeasures,
} from './rulesEngine'

interface AppState {
  // Inputs
  steelGrade: SteelGrade
  thickness: number

  // Derived measures
  measures: MeasureState

  // Actions
  setSteelGrade: (grade: SteelGrade) => void
  setThickness: (t: number) => void
}

function computeMeasures(steelGrade: SteelGrade, thickness: number): MeasureState {
  const input: RulesInput = { steelGrade, thickness }
  return evaluateMeasures(input)
}

export const useAppStore = create<AppState>((set) => ({
  steelGrade: 'YP36',
  thickness: 55,
  measures: computeMeasures('YP36', 55),

  setSteelGrade: (grade) =>
    set((state) => ({
      steelGrade: grade,
      measures: computeMeasures(grade, state.thickness),
    })),

  setThickness: (t) =>
    set((state) => ({
      thickness: t,
      measures: computeMeasures(state.steelGrade, t),
    })),
}))
