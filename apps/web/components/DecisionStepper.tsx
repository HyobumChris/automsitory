"use client";

import { useEffect, useMemo, useState } from "react";

type DemoPayload = {
  project_input: any;
  decision_results: any;
  rules_extraction: any;
  artifact_base: string;
  colors: Record<string, { hex: string; alpha: number }>;
};

const STEP_TITLES = [
  "1) 자재 선택",
  "2) 두께 입력",
  "3) Required Measures",
  "4) Measure 3 옵션",
  "5) 결과/시각화",
  "6) Export"
];

export default function DecisionStepper() {
  const [step, setStep] = useState(0);
  const [payload, setPayload] = useState<DemoPayload | null>(null);
  const [error, setError] = useState("");
  const [measure3Option, setMeasure3Option] = useState("미지정");

  useEffect(() => {
    fetch("/api/demo")
      .then((res) => res.json())
      .then((json) => {
        setPayload(json);
        setMeasure3Option(json?.project_input?.measure3_choice?.option ?? "미지정");
      })
      .catch((err) => setError(String(err)));
  }, []);

  const requiredGlobal = payload?.decision_results?.required_measures_global ?? {};
  const cumulativePreview = useMemo(() => {
    const setList: number[] = [];
    const transitions: string[] = ["[]"];
    [1, 3, 4, 5].forEach((id) => {
      if (requiredGlobal[String(id)] === "required") {
        setList.push(id);
        transitions.push(`[${setList.join(",")}]`);
      }
    });
    return transitions.join(" -> ");
  }, [requiredGlobal]);

  return (
    <div className="page">
      <h1>LR Hatch Coaming Measure 1~5 Decision UI</h1>
      <p>
        Scan/PDF first policy + member/joint cumulative application view
      </p>

      {error ? <div className="card">Error: {error}</div> : null}

      <div className="stepper">
        {STEP_TITLES.map((title, idx) => (
          <button
            key={title}
            type="button"
            className={idx === step ? "active" : ""}
            onClick={() => setStep(idx)}
          >
            {title}
          </button>
        ))}
      </div>

      {!payload ? <div className="card">Loading outputs/demo ...</div> : null}

      {payload ? (
        <>
          {step === 0 && (
            <div className="card">
              <h3>Step 1 - 자재 선택 (grade / yield)</h3>
              {(payload.project_input.members ?? []).map((m: any) => (
                <div key={m.member_id} className="row">
                  <strong>{m.member_id}</strong>
                  <span>role={m.member_role}</span>
                  <span className="measure-chip">grade={m.grade}</span>
                  <span className="measure-chip">yield={m.yield_strength_nmm2}</span>
                </div>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="card">
              <h3>Step 2 - 두께(as-built) 입력/수정</h3>
              {(payload.project_input.members ?? []).map((m: any) => (
                <div key={m.member_id} className="row">
                  <strong>{m.member_id}</strong>
                  <span>thickness={String(m.thickness_mm_as_built)} mm</span>
                  <span>zone={m.zone}</span>
                </div>
              ))}
              <p className="mono">
                t_control={String(payload.decision_results.control_parameters.t_control)} / y_control=
                {String(payload.decision_results.control_parameters.y_control)}
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="card">
              <h3>Step 3 - Table 8.2.1 Required Measures Global</h3>
              <div className="row">
                {Object.entries(requiredGlobal).map(([k, v]) => (
                  <span className="measure-chip" key={k}>
                    M{k}: {String(v)}
                  </span>
                ))}
              </div>
              <p className="mono">누적 적용 set: {cumulativePreview}</p>
              <p>
                Note 2 context:{" "}
                <code>{JSON.stringify(payload.decision_results.note2_context)}</code>
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="card">
              <h3>Step 4 - Measure 3 옵션</h3>
              <select
                value={measure3Option}
                onChange={(e) => setMeasure3Option(e.target.value)}
              >
                <option value="미지정">미지정</option>
                <option value="block_shift">block_shift</option>
                <option value="crack_arrest_hole">crack_arrest_hole</option>
                <option value="crack_arrest_insert">crack_arrest_insert</option>
                <option value="enhanced_NDE">enhanced_NDE</option>
              </select>
              <p>
                Current input option (from project.json):{" "}
                <strong>{payload.project_input.measure3_choice.option}</strong>
              </p>
              <p>
                UI guidance only. Decision engine output remains audit trace of
                exported JSON unless re-run.
              </p>
            </div>
          )}

          {step === 4 && (
            <>
              <div className="card">
                <h3>Step 5 - target별 누적 measure 적용</h3>
                <h4>Members</h4>
                {(payload.decision_results.members ?? []).map((item: any) => (
                  <div key={item.target_id} className="row">
                    <strong>{item.target_id}</strong>
                    {(item.applied_measures ?? []).map((m: any) => (
                      <span key={m.measure_id} className="measure-chip">
                        M{m.measure_id}:{m.status}
                      </span>
                    ))}
                  </div>
                ))}
                <h4>Joints</h4>
                {(payload.decision_results.joints ?? []).map((item: any) => (
                  <div key={item.target_id} className="row">
                    <strong>{item.target_id}</strong>
                    {(item.applied_measures ?? []).map((m: any) => (
                      <span key={m.measure_id} className="measure-chip">
                        M{m.measure_id}:{m.status}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              <div className="card">
                <h4>2D Plan</h4>
                <img
                  className="image-frame"
                  src={`${payload.artifact_base}/hatch_plan.svg`}
                  alt="hatch plan"
                />
              </div>
              <div className="card">
                <h4>2D Section</h4>
                <img
                  className="image-frame"
                  src={`${payload.artifact_base}/hatch_section.svg`}
                  alt="hatch section"
                />
              </div>
              <div className="card">
                <h4>3D Viewer</h4>
                <iframe
                  title="3d viewer"
                  src={`${payload.artifact_base}/viewer.html`}
                  style={{ width: "100%", height: 520, border: "1px solid #d8e0ea" }}
                />
              </div>
            </>
          )}

          {step === 5 && (
            <div className="card">
              <h3>Step 6 - Export</h3>
              <ul>
                <li>
                  <a href={`${payload.artifact_base}/rules_extraction.json`} target="_blank">
                    rules_extraction.json
                  </a>
                </li>
                <li>
                  <a href={`${payload.artifact_base}/decision_results.json`} target="_blank">
                    decision_results.json
                  </a>
                </li>
                <li>
                  <a href={`${payload.artifact_base}/hatch_plan.png`} target="_blank">
                    hatch_plan.png
                  </a>
                </li>
                <li>
                  <a href={`${payload.artifact_base}/hatch_section.png`} target="_blank">
                    hatch_section.png
                  </a>
                </li>
                <li>
                  <a href={`${payload.artifact_base}/hatch_coaming.glb`} target="_blank">
                    hatch_coaming.glb
                  </a>
                </li>
              </ul>
              <p>
                Evidence snippets path: <code>{payload.artifact_base}/evidence/ocr_snippets/*</code>
              </p>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

