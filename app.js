import { evaluateMeasures } from "./rules.js";

const form = document.getElementById("decision-form");
const resultCard = document.getElementById("result-card");
const summary = document.getElementById("summary");
const requiredMeasures = document.getElementById("requiredMeasures");
const conditionalMeasures = document.getElementById("conditionalMeasures");
const ruleTrace = document.getElementById("ruleTrace");

function renderMeasureList(node, measures, type) {
  node.innerHTML = "";
  if (!measures.length) {
    node.innerHTML = "<li>None</li>";
    return;
  }

  measures.forEach((measure) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="badge ${type}">Measure ${measure.id}</span> ${measure.text}`;
    node.appendChild(li);
  });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = {
    grade: document.getElementById("grade").value,
    yieldStrength: document.getElementById("yieldStrength").value,
    thickness: document.getElementById("thickness").value,
    crackArrestDesign: document.getElementById("crackArrestDesign").value,
    enhancedNde: document.getElementById("enhancedNde").value
  };

  const decision = evaluateMeasures(data);

  summary.innerHTML = `
    <p><strong>Grade:</strong> ${data.grade}</p>
    <p><strong>Yield strength:</strong> ${data.yieldStrength} N/mm²</p>
    <p><strong>Thickness:</strong> ${data.thickness} mm</p>
    ${decision.warnings.map((w) => `<p class="warning">⚠ ${w}</p>`).join("")}
  `;

  renderMeasureList(requiredMeasures, decision.requiredMeasures, "required");
  renderMeasureList(conditionalMeasures, decision.conditionalMeasures, "conditional");

  ruleTrace.innerHTML = "";
  decision.trace.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    ruleTrace.appendChild(li);
  });

  resultCard.hidden = false;
});
