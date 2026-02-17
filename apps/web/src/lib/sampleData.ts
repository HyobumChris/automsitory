/**
 * Sample decision results for the web app (loaded from engine output or embedded).
 */
import { DecisionResults, ColorsConfig } from './types';

export const SAMPLE_COLORS: ColorsConfig = {
  measures: {
    "0": { label: "Welding Detail Rule", hex: "#888888", alpha: 0.2, stroke: "#888888" },
    "1": { label: "Measure 1 – Construction NDE", hex: "#FF8C00", alpha: 0.25, stroke: "#FF8C00" },
    "2": { label: "Measure 2 – Periodic In-service NDE", hex: "#1E90FF", alpha: 0.25, stroke: "#1E90FF" },
    "3": { label: "Measure 3 – Crack Arrest Measures", hex: "#DC143C", alpha: 0.25, stroke: "#DC143C" },
    "4": { label: "Measure 4 – Upper Deck BCA Steel", hex: "#2E8B57", alpha: 0.25, stroke: "#2E8B57" },
    "5": { label: "Measure 5 – Upper Deck BCA Steel (ext)", hex: "#8A2BE2", alpha: 0.25, stroke: "#8A2BE2" },
  },
};

export async function loadDecisionResults(path?: string): Promise<DecisionResults | null> {
  // Try loading from public/data first
  try {
    const res = await fetch(path || '/data/decision_results.json');
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return null;
}
