const measureDescriptions = {
  1: "100% NDE during construction on all upper flange longitudinal members.",
  2: "Periodic in-service NDE.",
  3: "One of: crack arrest insert plates, crack arrest holes, block shift, or enhanced NDE.",
  4: "Crack arrest steel for the upper deck.",
  5: "Crack arrest steel for the upper deck (additional requirement based on table row)."
};

function toNumber(v) {
  return Number.parseFloat(v);
}

function tableMeasureRequirements(yieldStrength, thickness) {
  const ys = Number.parseInt(yieldStrength, 10);
  const t = toNumber(thickness);

  if (ys === 355 && t > 50 && t <= 85) {
    return { required: [], conditional: [], source: "Table 8.2.1: 355, 50 < t ≤ 85" };
  }
  if (ys === 355 && t > 85 && t <= 100) {
    return { required: [1], conditional: [], source: "Table 8.2.1: 355, 85 < t ≤ 100" };
  }
  if (ys === 390 && t > 50 && t <= 85) {
    return { required: [1], conditional: [], source: "Table 8.2.1: 390, 50 < t ≤ 85" };
  }
  if (ys === 390 && t > 85 && t <= 100) {
    return { required: [1, 3, 4, 5], conditional: [2], source: "Table 8.2.1: 390, 85 < t ≤ 100" };
  }
  if (ys === 460 && t > 50 && t <= 100) {
    return { required: [1, 3, 4, 5], conditional: [2], source: "Table 8.2.1: 460, 50 < t ≤ 100" };
  }

  return {
    required: [],
    conditional: [],
    source: "Outside table range (special review needed)."
  };
}

function gradeFlowAdjustments({ grade, thickness, crackArrestDesign, enhancedNde }) {
  const t = toNumber(thickness);
  const trace = [];
  const forcedRequired = new Set();
  const forcedConditional = new Set();

  if (grade === "EH36") {
    if (t > 85) {
      forcedRequired.add(1);
      trace.push("EH36 flow: t > 85 mm => Measure 1 required.");
    } else {
      trace.push("EH36 flow: t ≤ 85 mm => standard materials/construction/NDE.");
    }
    return { forcedRequired, forcedConditional, trace };
  }

  if (grade === "EH40" || grade === "EH47") {
    if (t > 85) {
      forcedRequired.add(1);
      trace.push(`${grade} flow: t > 85 mm => Measure 1 required.`);
    }

    if (crackArrestDesign === "yes") {
      forcedRequired.add(3);
      trace.push(`${grade} flow: crack arrest design = yes => Measure 3 path selected.`);
    } else {
      forcedRequired.add(3);
      trace.push(`${grade} flow: crack arrest design = no => enhanced NDE under Measure 3 path.`);
      if (enhancedNde === "yes") {
        forcedConditional.add(2);
        trace.push(`${grade} flow + Note 2: enhanced NDE used => Measure 2 may be required.`);
      }
    }

    forcedRequired.add(4);
    forcedRequired.add(5);
    trace.push(`${grade} flow: Measures 4 & 5 required for upper deck crack arrest steel.`);
  }

  return { forcedRequired, forcedConditional, trace };
}

export function evaluateMeasures(input) {
  const trace = [];
  const required = new Set();
  const conditional = new Set();
  const warnings = [];

  const tableResult = tableMeasureRequirements(input.yieldStrength, input.thickness);
  tableResult.required.forEach((m) => required.add(m));
  tableResult.conditional.forEach((m) => conditional.add(m));
  trace.push(tableResult.source);

  const flow = gradeFlowAdjustments(input);
  flow.forcedRequired.forEach((m) => required.add(m));
  flow.forcedConditional.forEach((m) => conditional.add(m));
  trace.push(...flow.trace);

  if (toNumber(input.thickness) > 100) {
    warnings.push("Note 4: thickness > 100 mm should be specially considered.");
  }

  required.forEach((m) => conditional.delete(m));

  return {
    requiredMeasures: [...required].sort((a, b) => a - b).map((m) => ({ id: m, text: measureDescriptions[m] })),
    conditionalMeasures: [...conditional].sort((a, b) => a - b).map((m) => ({ id: m, text: measureDescriptions[m] })),
    warnings,
    trace
  };
}
